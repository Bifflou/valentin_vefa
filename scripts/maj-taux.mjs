#!/usr/bin/env node
/*
 * Met a jour les taux indicatifs du simulateur depuis la Banque de France.
 *
 * Source : serie MIR1.M.FR.B.A22HR.A.R.A.2254U6.EUR.N, taux des credits
 * nouveaux a l'habitat hors renegociations, hors frais et hors assurance.
 * Methode de derivation des trois durees : docs/taux.md
 *
 *   node scripts/maj-taux.mjs --dry-run    n'ecrit rien, affiche ce qu'il ferait
 *   node scripts/maj-taux.mjs              ecrit les fichiers
 *
 * Variable d'environnement requise : WEBSTAT_CLIENT_ID
 */

import { readFile, writeFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const RACINE = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const FICHIER_JS = path.join(RACINE, "assets", "js", "simulateur.js");

const SERIE = "MIR1.M.FR.B.A22HR.A.R.A.2254U6.EUR.N";
const JEU = "MIR1";

/* Calibrage documente dans docs/taux.md */
const DUREE_ANCRE = 23.42;      /* duree initiale moyenne des credits nouveaux */
const PENTE = 0.024;            /* point de taux par annee de duree */
const ECART_15 = -0.15;         /* 20 ans -> 15 ans */
const ECART_25 = 0.12;          /* 20 ans -> 25 ans */

/* Garde-fous */
const ANCRE_MIN = 0.5, ANCRE_MAX = 8;
const VARIATION_MAX = 0.5;

const MOIS_FR = ["janvier", "fevrier", "mars", "avril", "mai", "juin",
  "juillet", "aout", "septembre", "octobre", "novembre", "decembre"];
const MOIS_FR_ACCENTS = ["janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

const sec = process.argv.includes("--dry-run");

function erreur(message) {
  console.error("ECHEC : " + message);
  process.exit(1);
}

/* ---------- Appel de l'API ----------
   Le portail documente la base https://api.webstat.banque-france.fr/webstat-
   sans detailler le chemin. On essaie les formes connues et on retient la
   premiere qui repond, en signalant laquelle : a fixer ici une fois validee. */
async function recupererSerie(clientId) {
  /* Permet de verifier toute la chaine d'ecriture sans appeler l'API :
     WEBSTAT_FIXTURE="2026-07=3.30" node scripts/maj-taux.mjs --dry-run */
  if (process.env.WEBSTAT_FIXTURE) {
    const [periode, valeur] = process.env.WEBSTAT_FIXTURE.split("=");
    console.log("Observation simulee : " + periode + " = " + valeur);
    return [{ periode, valeur: Number(valeur) }];
  }
  const bases = [
    `https://api.webstat.banque-france.fr/webstat-fr/v1/data/${JEU}/${SERIE}`,
    `https://api.webstat.banque-france.fr/webstat-fr/v1/data/${SERIE}`,
    `https://api.webstat.banque-france.fr/webstat-en/v1/data/${JEU}/${SERIE}`
  ];
  const essais = [];
  for (const base of bases) {
    const url = `${base}?format=json&lastNObservations=2&client_id=${encodeURIComponent(clientId)}`;
    let reponse;
    try {
      reponse = await fetch(url, { headers: { Accept: "application/json" } });
    } catch (e) {
      essais.push(`${base} -> ${e.message}`);
      continue;
    }
    const corps = await reponse.text();
    if (!reponse.ok) {
      essais.push(`${base} -> HTTP ${reponse.status} ${corps.slice(0, 200)}`);
      continue;
    }
    let donnees;
    try {
      donnees = JSON.parse(corps);
    } catch {
      essais.push(`${base} -> reponse non JSON : ${corps.slice(0, 200)}`);
      continue;
    }
    const obs = extraireObservations(donnees);
    if (obs.length) {
      console.log("Chemin retenu : " + base);
      return obs;
    }
    essais.push(`${base} -> JSON sans observation exploitable`);
  }
  erreur("aucun chemin d'API n'a repondu.\n  " + essais.join("\n  "));
}

/* Le format de reponse n'est pas garanti : on gere le SDMX-JSON puis, a defaut,
   on cherche en profondeur des couples periode / valeur. */
function extraireObservations(donnees) {
  const sdmx = extraireSdmx(donnees);
  if (sdmx.length) return sdmx;
  return extraireEnProfondeur(donnees);
}

function extraireSdmx(d) {
  try {
    const jeux = d.dataSets || d.dataSet || [];
    const series = jeux[0]?.series;
    const periodes = (d.structure?.dimensions?.observation || [])
      .find((dim) => /TIME|PERIOD/i.test(dim.id))?.values || [];
    if (!series || !periodes.length) return [];
    const premiere = Object.values(series)[0];
    return Object.entries(premiere.observations || {})
      .map(([index, valeur]) => ({
        periode: periodes[Number(index)]?.id,
        valeur: Number(Array.isArray(valeur) ? valeur[0] : valeur)
      }))
      .filter((o) => o.periode && Number.isFinite(o.valeur));
  } catch {
    return [];
  }
}

function extraireEnProfondeur(racine) {
  const trouvees = [];
  const vus = new Set();
  (function parcourir(noeud) {
    if (!noeud || typeof noeud !== "object" || vus.has(noeud)) return;
    vus.add(noeud);
    if (Array.isArray(noeud)) { noeud.forEach(parcourir); return; }
    const cles = Object.keys(noeud);
    const clePeriode = cles.find((c) => /^(time_?period|period|date|periode)$/i.test(c));
    const cleValeur = cles.find((c) => /^(obs_?value|value|valeur)$/i.test(c));
    if (clePeriode && cleValeur) {
      const valeur = Number(String(noeud[cleValeur]).replace(",", "."));
      const periode = String(noeud[clePeriode]);
      if (Number.isFinite(valeur) && /\d{4}/.test(periode)) trouvees.push({ periode, valeur });
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
  const m = periode.match(/^(\d{4})-(\d{2})/);
  if (!m) erreur("periode illisible : " + periode);
  const index = Number(m[2]) - 1;
  if (index < 0 || index > 11) erreur("mois hors bornes : " + periode);
  return { texte: MOIS_FR_ACCENTS[index] + " " + m[1], cle: m[1] + "-" + m[2], sansAccent: MOIS_FR[index] + " " + m[1] };
}

function cleDepuisTexte(texte) {
  const parties = texte.trim().split(/\s+/);
  if (parties.length < 2) return "";
  const index = MOIS_FR_ACCENTS.indexOf(parties[0].toLowerCase());
  const secours = MOIS_FR.indexOf(parties[0].toLowerCase());
  const mois = index > -1 ? index : secours;
  if (mois < 0) return "";
  return parties[1] + "-" + String(mois + 1).padStart(2, "0");
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
const clientId = process.env.WEBSTAT_CLIENT_ID;
if (!clientId && !process.env.WEBSTAT_FIXTURE) {
  erreur("WEBSTAT_CLIENT_ID absent de l'environnement. Compte gratuit sur " +
    "https://developer.webstat.banque-france.fr/ puis secret GitHub du meme nom.");
}

const observations = await recupererSerie(clientId);
observations.sort((a, b) => a.periode.localeCompare(b.periode));
const derniere = observations[observations.length - 1];
console.log(`Derniere observation : ${derniere.periode} = ${derniere.valeur} %`);

if (!(derniere.valeur >= ANCRE_MIN && derniere.valeur <= ANCRE_MAX)) {
  erreur(`taux ancre hors bornes plausibles : ${derniere.valeur} % (attendu entre ${ANCRE_MIN} et ${ANCRE_MAX}).`);
}

const source = await readFile(FICHIER_JS, "utf8");
const etat = lireEtat(source);
const mois = moisEnFrancais(derniere.periode);
const cleActuelle = cleDepuisTexte(etat.mois);

if (cleActuelle && mois.cle <= cleActuelle) {
  console.log(`Rien a faire : le fichier porte deja ${etat.mois} (${cleActuelle}), l'API donne ${mois.cle}.`);
  process.exit(0);
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
if (process.env.GITHUB_OUTPUT) {
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
