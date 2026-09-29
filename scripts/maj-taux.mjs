#!/usr/bin/env node
/*
 * Surveille la derive entre la grille de taux du site et les statistiques
 * publiques, et applique une grille decidee par un humain.
 *
 * Pourquoi pas d'ecriture automatique : la statistique Banque de France parait
 * avec cinq semaines de retard, et l'OAT 10 ans ne permet pas de combler ce
 * retard. Mesure faite sur 151 mois (2014-2026), transmission de l'OAT vers le
 * taux de credit : beta 0,075 et R2 0,03 a un mois, beta 0,46 et R2 0,31 a
 * douze mois. L'ecart credit moins OAT est passe de +1,11 point (2014-2019) a
 * +0,11 point (2024-2026), avec un ecart-type de 0,57 : il n'existe pas de
 * marge stable a exploiter. Detail dans docs/taux.md.
 *
 * Usage :
 *   node scripts/maj-taux.mjs
 *       Rapport de surveillance. N'ecrit rien. Signale une derive.
 *
 *   node scripts/maj-taux.mjs --fixer 3.33/3.47/3.56 --mois "octobre 2026"
 *       Applique une grille decidee par un humain : reecrit les lignes AUTO,
 *       remonte le parametre ?v= des pages, enregistre la reference.
 *
 *   --dry-run  avec --fixer : affiche sans ecrire.
 *
 * Aucune cle d'API n'est requise : les deux sources sont publiques.
 */

import { readFile, writeFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const RACINE = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const FICHIER_JS = path.join(RACINE, "assets", "js", "simulateur.js");
const FICHIER_REF = path.join(RACINE, "scripts", "taux-reference.json");

/* Taux des credits nouveaux a l'habitat hors renegociations, aux particuliers.
   Taux effectif au sens etroit : hors frais et hors assurance. Export CSV
   public du portail Webstat, trie du plus recent au plus ancien. */
const SERIE_BDF = "MIR1.M.FR.B.A22HR.A.R.A.2254U6.EUR.N";
const URL_BDF = `https://webstat.banque-france.fr/export/csv/fr/catalog/MIR1/${SERIE_BDF}`;

/* Rendement de l'OAT 10 ans francaise, via la BCE : taux long terme au sens du
   critere de Maastricht. Publie plus tot que la statistique de credit. */
const URL_OAT = "https://data-api.ecb.europa.eu/service/data/IRS/" +
  "M.FR.L.L40.CI.0000.EUR.N.Z?format=csvdata&lastNObservations=24";

/* Au-dela de cette derive du taux Banque de France depuis la derniere decision
   humaine, la grille du site merite un reexamen. */
const SEUIL_DERIVE = 0.15;

/* Garde-fous d'une grille appliquee a la main. */
const TAUX_MIN = 0.5, TAUX_MAX = 8;
const ECART_MAX_GRILLE = 1.5;

const sec = process.argv.includes("--dry-run");

class Echec extends Error {}
function erreur(message) {
  throw new Echec(message);
}

function argument(nom) {
  const i = process.argv.indexOf(nom);
  return i > -1 ? process.argv[i + 1] : null;
}

/* ---------- Sources ---------- */
async function serie(url, sep, colPeriode, colValeur) {
  const reponse = await fetch(url, { headers: { Accept: "*/*" } });
  if (!reponse.ok) {
    erreur(`${url}\n  a repondu HTTP ${reponse.status} : ${(await reponse.text()).slice(0, 200)}`);
  }
  const lignes = (await reponse.text()).replace(/^﻿/, "").trim().split(/\r?\n/);
  if (lignes.length < 2) erreur(`${url}\n  n'a rendu aucune ligne de donnees.`);
  const entetes = lignes[0].split(sep);
  const ip = entetes.indexOf(colPeriode), iv = entetes.indexOf(colValeur);
  if (ip < 0 || iv < 0) {
    erreur(`colonnes ${colPeriode} / ${colValeur} absentes de ${url}\n  entetes recus : ` +
      entetes.slice(0, 12).join(", "));
  }
  const points = new Map();
  for (const ligne of lignes.slice(1)) {
    const champs = ligne.split(sep);
    const periode = (champs[ip] || "").trim();
    const valeur = Number((champs[iv] || "").trim().replace(",", "."));
    if (/^\d{4}-\d{2}$/.test(periode) && Number.isFinite(valeur)) points.set(periode, valeur);
  }
  if (!points.size) erreur(`aucune observation exploitable dans ${url}`);
  return points;
}

async function sources() {
  if (process.env.WEBSTAT_FIXTURE) {
    /* WEBSTAT_FIXTURE="2026-08=3.38" pour eprouver la chaine sans reseau. */
    const [periode, valeur] = process.env.WEBSTAT_FIXTURE.split("=");
    console.log(`Source simulee : ${periode} = ${valeur}`);
    return { bdf: new Map([[periode, Number(valeur)]]), oat: new Map() };
  }
  const [bdf, oat] = await Promise.all([
    serie(URL_BDF, ";", "time_period", "obs_value"),
    serie(URL_OAT, ",", "TIME_PERIOD", "OBS_VALUE").catch((e) => {
      console.log("OAT indisponible, on continue sans : " + e.message);
      return new Map();
    })
  ]);
  return { bdf, oat };
}

function dernier(points) {
  const cles = [...points.keys()].sort();
  const cle = cles[cles.length - 1];
  return cle ? { periode: cle, valeur: points.get(cle) } : null;
}

/* ---------- Etat du site ---------- */
function lireEtat(source) {
  const ligneTaux = source.match(/var RATES = \{([^}]*)\};\s*\/\* AUTO:RATES \*\//);
  const ligneMois = source.match(/var RATES_MOIS = "([^"]*)";\s*\/\* AUTO:MOIS \*\//);
  if (!ligneTaux || !ligneMois) {
    erreur("les lignes AUTO:RATES et AUTO:MOIS sont introuvables dans " + FICHIER_JS +
      " : le format a change, adapter ce script.");
  }
  const taux = {};
  for (const [, duree, valeur] of ligneTaux[1].matchAll(/(\d+):\s*([\d.]+)/g)) {
    taux[duree] = Number(valeur);
  }
  return { taux, mois: ligneMois[1] };
}

async function lireReference() {
  try {
    return JSON.parse(await readFile(FICHIER_REF, "utf8"));
  } catch {
    return null;
  }
}

/* ---------- Application d'une grille decidee ---------- */
function analyserGrille(brut) {
  const parts = String(brut).split("/").map((x) => Number(x.trim().replace(",", ".")));
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) {
    erreur(`grille illisible : « ${brut} ». Format attendu : --fixer 3.33/3.47/3.56`);
  }
  const [t15, t20, t25] = parts;
  for (const [nom, v] of [["15 ans", t15], ["20 ans", t20], ["25 ans", t25]]) {
    if (v < TAUX_MIN || v > TAUX_MAX) {
      erreur(`taux ${nom} hors bornes plausibles : ${v} % (attendu entre ${TAUX_MIN} et ${TAUX_MAX}).`);
    }
  }
  if (!(t15 <= t20 && t20 <= t25)) {
    erreur(`grille non croissante : ${t15} / ${t20} / ${t25}. ` +
      `Le taux augmente normalement avec la duree.`);
  }
  if (t25 - t15 > ECART_MAX_GRILLE) {
    erreur(`ecart de ${(t25 - t15).toFixed(2)} point entre 15 et 25 ans, au-dela de ` +
      `${ECART_MAX_GRILLE} : verifier la saisie.`);
  }
  return { 15: t15, 20: t20, 25: t25 };
}

async function majVersionAssets(version) {
  const fichiers = (await readdir(RACINE)).filter((f) => f.endsWith(".html"));
  const touches = [];
  for (const nom of fichiers) {
    const chemin = path.join(RACINE, nom);
    const avant = await readFile(chemin, "utf8");
    const apres = avant.replace(
      /(assets\/(?:css\/style\.css|js\/(?:main|simulateur|zonage-abc)\.js))\?v=[0-9a-z]+/g,
      `$1?v=${version}`
    );
    if (apres !== avant) {
      if (!sec) await writeFile(chemin, apres);
      touches.push(nom);
    }
  }
  return touches;
}

async function fixer(grilleBrute, moisTexte, etat, source, bdf, oat) {
  const grille = analyserGrille(grilleBrute);
  if (!moisTexte) erreur("--fixer exige --mois, par exemple --mois \"octobre 2026\".");

  const nouveau = source
    .replace(/var RATES = \{[^}]*\};(\s*)\/\* AUTO:RATES \*\//,
      `var RATES = { 15: ${grille[15]}, 20: ${grille[20]}, 25: ${grille[25]} };$1/* AUTO:RATES */`)
    .replace(/var RATES_MOIS = "[^"]*";(\s*)\/\* AUTO:MOIS \*\//,
      `var RATES_MOIS = "${moisTexte}";$1/* AUTO:MOIS */`);
  /* Les marqueurs ont deja ete valides par lireEtat : si rien ne change, c'est
     que la grille demandee est celle en place. Cas normal quand on ne veut
     qu'enregistrer la reference de surveillance. */
  const identique = nouveau === source;
  if (identique) console.log("Grille demandee identique a celle en place, seule la reference change.");

  const version = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  if (!sec && !identique) await writeFile(FICHIER_JS, nouveau);
  const pages = identique ? [] : await majVersionAssets(version);

  const reference = {
    commentaire: "Etat au moment de la derniere decision humaine sur la grille. " +
      "Lu par scripts/maj-taux.mjs pour mesurer la derive. Ne pas editer a la main.",
    mois: moisTexte,
    grille,
    ancreBdf: bdf ? { periode: bdf.periode, valeur: bdf.valeur } : null,
    oat: oat ? { periode: oat.periode, valeur: oat.valeur } : null,
    decideLe: new Date().toISOString().slice(0, 10)
  };
  if (!sec) await writeFile(FICHIER_REF, JSON.stringify(reference, null, 2) + "\n");

  console.log("");
  console.log(`Grille appliquee pour ${moisTexte} :`);
  console.log(`  15 ans : ${etat.taux[15]} % -> ${grille[15]} %`);
  console.log(`  20 ans : ${etat.taux[20]} % -> ${grille[20]} %`);
  console.log(`  25 ans : ${etat.taux[25]} % -> ${grille[25]} %`);
  console.log(`  version des assets : ?v=${version} (${pages.length} pages)`);
  console.log(`  reference enregistree : ${bdf ? bdf.periode + " = " + bdf.valeur + " %" : "aucune"}`);
  if (sec) console.log("\n(--dry-run : aucun fichier ecrit)");
}

/* ---------- Surveillance ---------- */
async function surveiller(etat, bdf, oat, reference) {
  console.log(`Grille en ligne : ${etat.taux[15]} / ${etat.taux[20]} / ${etat.taux[25]} %` +
    ` pour ${etat.mois}`);
  if (bdf) console.log(`Banque de France : ${bdf.valeur} % (${bdf.periode})`);
  if (oat) console.log(`OAT 10 ans       : ${oat.valeur} % (${oat.periode})`);

  if (!reference || !reference.ancreBdf) {
    console.log("");
    console.log("Aucune reference enregistree : impossible de mesurer une derive.");
    console.log("Elle sera creee a la prochaine execution avec --fixer.");
    return { alerte: false };
  }

  const derive = bdf ? bdf.valeur - reference.ancreBdf.valeur : 0;
  console.log("");
  console.log(`Reference posee le ${reference.decideLe} : ` +
    `${reference.ancreBdf.periode} = ${reference.ancreBdf.valeur} %`);
  console.log(`Derive depuis : ${derive >= 0 ? "+" : ""}${derive.toFixed(2)} point ` +
    `(seuil d'alerte ${SEUIL_DERIVE})`);

  if (Math.abs(derive) < SEUIL_DERIVE) {
    console.log("Sous le seuil : rien a signaler.");
    return { alerte: false, derive };
  }

  console.log("");
  console.log("AU-DELA DU SEUIL : la grille du site merite un reexamen.");
  console.log("Attention, ne pas recopier le chiffre Banque de France : il decrit un mois");
  console.log("deja ancien et une moyenne realisee, plus basse que les baremes du moment.");
  console.log("Comparer aux baremes publies du mois en cours avant de decider.");
  return { alerte: true, derive };
}

/* ---------- Programme ---------- */
async function principal() {
  const { bdf: pointsBdf, oat: pointsOat } = await sources();
  const bdf = dernier(pointsBdf);
  const oat = dernier(pointsOat);
  const source = await readFile(FICHIER_JS, "utf8");
  const etat = lireEtat(source);
  const reference = await lireReference();

  const grilleBrute = argument("--fixer");
  if (grilleBrute) {
    await fixer(grilleBrute, argument("--mois"), etat, source, bdf, oat);
    return;
  }

  const bilan = await surveiller(etat, bdf, oat, reference);

  if (process.env.GITHUB_OUTPUT) {
    const lignes = [
      `alerte=${bilan.alerte ? "oui" : "non"}`,
      `derive=${(bilan.derive ?? 0).toFixed(2)}`,
      `bdf=${bdf ? bdf.valeur : ""}`,
      `bdf_mois=${bdf ? bdf.periode : ""}`,
      `oat=${oat ? oat.valeur : ""}`,
      `oat_mois=${oat ? oat.periode : ""}`,
      `grille=${etat.taux[15]} / ${etat.taux[20]} / ${etat.taux[25]}`,
      `grille_mois=${etat.mois}`,
      `reference=${reference?.ancreBdf ? reference.ancreBdf.periode + " = " +
        reference.ancreBdf.valeur + " %" : "aucune"}`
    ];
    await writeFile(process.env.GITHUB_OUTPUT, lignes.join("\n") + "\n", { flag: "a" });
  }
}

try {
  await principal();
} catch (e) {
  console.error("ECHEC : " + (e instanceof Echec ? e.message : (e.stack || e.message)));
  process.exitCode = 1;
}
