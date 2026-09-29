#!/usr/bin/env node
/*
 * Met a jour les taux indicatifs du simulateur depuis la Banque de France.
 *
 * Source : serie MIR1.M.FR.B.A22HR.A.R.A.2254U6.EUR.N, « Taux des credits
 * nouveaux a l'habitat (hors negociations) aux particuliers ». Taux effectif
 * au sens etroit : hors frais de dossier et hors assurance emprunteur, ce qui
 * en fait la base correcte d'une formule d'amortissement.
 *
 * Methode de derivation des trois durees : docs/taux.md
 *
 *   node scripts/maj-taux.mjs --dry-run    n'ecrit rien, affiche ce qu'il ferait
 *   node scripts/maj-taux.mjs              ecrit les fichiers
 *
 * Aucune cle d'API n'est requise : l'export CSV du portail est public.
 */

import { readFile, writeFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const RACINE = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const FICHIER_JS = path.join(RACINE, "assets", "js", "simulateur.js");

const JEU = "MIR1";
const SERIE = "MIR1.M.FR.B.A22HR.A.R.A.2254U6.EUR.N";

/* Export CSV public du portail, trie de la periode la plus recente a la plus
   ancienne. L'API JSON existe aussi mais exige une cle : elle ne sert ici que
   de secours, si WEBSTAT_APIKEY est fourni.
   Guide : https://webstat.banque-france.fr/fr/pages/guide-migration-api/ */
const EXPORT_CSV = `https://webstat.banque-france.fr/export/csv/fr/catalog/${JEU}/${SERIE}`;
const API_JSON = "https://webstat.banque-france.fr/api/explore/v2.1" +
  "/catalog/datasets/observations/exports/json" +
  `?where=series_key%3D%22${SERIE}%22&order_by=time_period_start%20desc&limit=6`;

/* Calibrage documente dans docs/taux.md */
const DUREE_ANCRE = 23.42;      /* duree initiale moyenne des credits nouveaux */
const PENTE = 0.024;            /* point de taux par annee de duree */
const ECART_15 = -0.15;         /* 20 ans -> 15 ans */
const ECART_25 = 0.12;          /* 20 ans -> 25 ans */

/* Garde-fous */
const ANCRE_MIN = 0.5, ANCRE_MAX = 8;
const VARIATION_MAX = 0.5;

const MOIS_FR = ["janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
const MOIS_SANS_ACCENT = ["janvier", "fevrier", "mars", "avril", "mai", "juin",
  "juillet", "aout", "septembre", "octobre", "novembre", "decembre"];

const sec = process.argv.includes("--dry-run");

/* On leve au lieu d'appeler process.exit : sortir pendant qu'une socket HTTP
   est encore ouverte fait avorter Node, avec un code de sortie trompeur. */
class Echec extends Error {}
function erreur(message) {
  throw new Echec(message);
}

/* ---------- Recuperation de la serie ---------- */
async function recupererSerie() {
  /* Permet de verifier toute la chaine d'ecriture sans reseau :
     WEBSTAT_FIXTURE="2026-08=3.38" node scripts/maj-taux.mjs --dry-run */
  if (process.env.WEBSTAT_FIXTURE) {
    const [periode, valeur] = process.env.WEBSTAT_FIXTURE.split("=");
    console.log(`Observation simulee : ${periode} = ${valeur}`);
    return [{ periode, valeur: Number(valeur) }];
  }

  const essais = [];

  const csv = await telecharger(EXPORT_CSV);
  if (csv.ok) {
    const obs = lireCsv(csv.corps);
    if (obs.length) {
      console.log(`Export CSV public : ${obs.length} observations lues.`);
      return obs;
    }
    essais.push(`export CSV -> HTTP 200 mais aucune observation : ${csv.corps.slice(0, 200)}`);
  } else {
    essais.push(`export CSV -> HTTP ${csv.statut} ${csv.corps.slice(0, 200)}`);
  }

  const cle = process.env.WEBSTAT_APIKEY;
  if (cle) {
    const json = await telecharger(API_JSON, { Authorization: "Apikey " + cle });
    if (json.ok) {
      try {
        const obs = extraireObservations(JSON.parse(json.corps));
        if (obs.length) {
          console.log(`API JSON avec cle : ${obs.length} observations lues.`);
          return obs;
        }
        essais.push(`API JSON -> HTTP 200 mais aucune observation : ${json.corps.slice(0, 200)}`);
      } catch {
        essais.push(`API JSON -> reponse non JSON : ${json.corps.slice(0, 200)}`);
      }
    } else {
      /* Le guide precise qu'une cle inconnue ne donne pas un 401 mais ce
         message, qui feint l'absence du jeu de donnees. */
      const refusee = /NotFoundResource|does not exist/i.test(json.corps);
      essais.push(`API JSON -> HTTP ${json.statut}` +
        (refusee ? " (cle refusee : elle doit venir de l'onglet « Cles d'API » du " +
          "portail webstat.banque-france.fr, pas de developer.webstat.banque-france.fr)" : "") +
        ` ${json.corps.slice(0, 160)}`);
    }
  }

  erreur(`la serie ${SERIE} n'a pu etre recuperee.\n    ` + essais.join("\n    ") +
    (cle ? "" : "\n  Aucune cle n'etait fournie, ce qui est normal : l'export CSV est " +
      "public.\n  Si le portail l'a retire, creer une cle dans l'onglet « Cles d'API » de " +
      "\n  https://webstat.banque-france.fr/ et la placer dans le secret WEBSTAT_APIKEY."));
}

async function telecharger(url, entetes = {}) {
  try {
    const reponse = await fetch(url, { headers: Object.assign({ Accept: "*/*" }, entetes) });
    return { statut: reponse.status, ok: reponse.ok, corps: await reponse.text() };
  } catch (e) {
    return { statut: 0, ok: false, corps: e.message };
  }
}

/* CSV a separateur point-virgule, virgule decimale, precede d'un BOM. On lit
   par nom de colonne : l'ordre des attributs varie d'un jeu a l'autre. */
function lireCsv(texte) {
  const lignes = texte.replace(/^﻿/, "").trim().split(/\r?\n/);
  if (lignes.length < 2) return [];
  const entetes = lignes[0].split(";");
  const iPeriode = entetes.indexOf("time_period");
  const iValeur = entetes.indexOf("obs_value");
  if (iPeriode < 0 || iValeur < 0) return [];
  return lignes.slice(1)
    .map((ligne) => {
      const champs = ligne.split(";");
      return {
        periode: (champs[iPeriode] || "").trim(),
        valeur: Number((champs[iValeur] || "").trim().replace(",", "."))
      };
    })
    .filter((o) => /^\d{4}-\d{2}$/.test(o.periode) && Number.isFinite(o.valeur));
}

/* Secours pour l'API JSON : on cherche des couples periode / valeur. */
function extraireObservations(racine) {
  const trouvees = [];
  const vus = new Set();
  (function parcourir(noeud) {
    if (!noeud || typeof noeud !== "object" || vus.has(noeud)) return;
    vus.add(noeud);
    if (Array.isArray(noeud)) { noeud.forEach(parcourir); return; }
    const cles = Object.keys(noeud);
    const clePeriode = cles.find((c) => /^(time_?period|period|periode)$/i.test(c));
    const cleValeur = cles.find((c) => /^(obs_?value|value|valeur)$/i.test(c));
    if (clePeriode && cleValeur) {
      const valeur = Number(String(noeud[cleValeur]).replace(",", "."));
      const periode = String(noeud[clePeriode]);
      if (Number.isFinite(valeur) && /^\d{4}-\d{2}/.test(periode)) {
        trouvees.push({ periode: periode.slice(0, 7), valeur });
      }
    }
    cles.forEach((c) => parcourir(noeud[c]));
  })(racine);
  return trouvees;
}

/* ---------- Derivation des trois taux ---------- */
function calculerTaux(ancre) {
  const decalage = (DUREE_ANCRE - 20) * PENTE;
  const t20 = arrondir(ancre - decalage);
  return { 15: arrondir(t20 + ECART_15), 20: t20, 25: arrondir(t20 + ECART_25) };
}

function arrondir(n) {
  return Math.round(n * 100) / 100;
}

/* ---------- Lecture de l'etat actuel du fichier ---------- */
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

function moisEnFrancais(periode) {
  const m = periode.match(/^(\d{4})-(\d{2})$/);
  if (!m) erreur("periode illisible : " + periode);
  const index = Number(m[2]) - 1;
  if (index < 0 || index > 11) erreur("mois hors bornes : " + periode);
  return { texte: `${MOIS_FR[index]} ${m[1]}`, cle: `${m[1]}-${m[2]}` };
}

function cleDepuisTexte(texte) {
  const parties = texte.trim().split(/\s+/);
  if (parties.length < 2) return "";
  const nom = parties[0].toLowerCase();
  const mois = MOIS_FR.indexOf(nom) > -1 ? MOIS_FR.indexOf(nom) : MOIS_SANS_ACCENT.indexOf(nom);
  if (mois < 0) return "";
  return `${parties[1]}-${String(mois + 1).padStart(2, "0")}`;
}

/* ---------- Ecriture ---------- */
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

/* ---------- Programme ---------- */
async function principal() {
  const observations = await recupererSerie();
  observations.sort((a, b) => a.periode.localeCompare(b.periode));
  const derniere = observations[observations.length - 1];
  console.log(`Derniere observation : ${derniere.periode} = ${derniere.valeur} %`);

  if (!(derniere.valeur >= ANCRE_MIN && derniere.valeur <= ANCRE_MAX)) {
    erreur(`taux ancre hors bornes plausibles : ${derniere.valeur} % ` +
      `(attendu entre ${ANCRE_MIN} et ${ANCRE_MAX}).`);
  }

  const source = await readFile(FICHIER_JS, "utf8");
  const etat = lireEtat(source);
  const mois = moisEnFrancais(derniere.periode);
  const cleActuelle = cleDepuisTexte(etat.mois);

  if (cleActuelle && mois.cle <= cleActuelle) {
    console.log(`Rien a faire : le fichier porte deja ${etat.mois} (${cleActuelle}), ` +
      `la source donne ${mois.cle}.`);
    return;
  }

  const taux = calculerTaux(derniere.valeur);
  const variation = Math.abs(taux[20] - etat.taux[20]);
  if (variation > VARIATION_MAX) {
    erreur(`variation de ${variation.toFixed(2)} point sur le taux 20 ans ` +
      `(${etat.taux[20]} % -> ${taux[20]} %), au-dela du seuil de ${VARIATION_MAX}. ` +
      `Verification humaine requise avant publication.`);
  }

  const version = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const nouveau = source
    .replace(/var RATES = \{[^}]*\};(\s*)\/\* AUTO:RATES \*\//,
      `var RATES = { 15: ${taux[15]}, 20: ${taux[20]}, 25: ${taux[25]} };$1/* AUTO:RATES */`)
    .replace(/var RATES_MOIS = "[^"]*";(\s*)\/\* AUTO:MOIS \*\//,
      `var RATES_MOIS = "${mois.texte}";$1/* AUTO:MOIS */`);

  if (nouveau === source) erreur("la reecriture n'a rien change, verifier les marqueurs AUTO.");
  if (!sec) await writeFile(FICHIER_JS, nouveau);

  const pages = await majVersionAssets(version);

  console.log("");
  console.log(`Ancre Banque de France : ${derniere.valeur} % (${mois.texte})`);
  console.log(`Taux 15 ans : ${etat.taux[15]} % -> ${taux[15]} %`);
  console.log(`Taux 20 ans : ${etat.taux[20]} % -> ${taux[20]} %`);
  console.log(`Taux 25 ans : ${etat.taux[25]} % -> ${taux[25]} %`);
  console.log(`Version des assets : ?v=${version} (${pages.length} pages)`);
  if (sec) console.log("\n(--dry-run : aucun fichier ecrit)");

  /* Sortie exploitable par le workflow pour le titre et le corps de la PR. */
  if (process.env.GITHUB_OUTPUT && !sec) {
    const lignes = [
      `mois=${mois.texte}`,
      `ancre=${derniere.valeur}`,
      `taux15=${taux[15]}`,
      `taux20=${taux[20]}`,
      `taux25=${taux[25]}`,
      `avant15=${etat.taux[15]}`,
      `avant20=${etat.taux[20]}`,
      `avant25=${etat.taux[25]}`,
      `version=${version}`
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
