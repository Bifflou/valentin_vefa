# Taux indicatifs du simulateur

Le simulateur a besoin d'un taux pour trois durées : 15, 20 et 25 ans. Aucune
source publique ne publie cette grille. Ce document dit d'où viennent les trois
chiffres, ce qui est mesuré et ce qui est modélisé.

## Ce qui est mesuré

Le **niveau** vient de la Banque de France, série
`MIR1.M.FR.B.A22HR.A.R.A.2254U6.EUR.N` : « taux des crédits nouveaux à l'habitat
(hors renégociations) aux particuliers ».

C'est un *taux effectif au sens étroit* : moyenne pondérée par les flux,
**hors frais de dossier et hors assurance emprunteur**. C'est la base correcte
pour une formule d'amortissement, contrairement au taux effectif moyen publié
avec le taux d'usure, qui est un TAEG et surestimerait la mensualité d'environ
un demi-point.

Publication mensuelle, avec environ cinq semaines de décalage : les données de
juillet 2026 ont été publiées le 7 septembre 2026.

## Ce qui est modélisé

La moyenne Banque de France est un chiffre unique, qui correspond à la **durée
initiale moyenne des crédits nouveaux**, soit 23 ans et 5 mois pour une
résidence principale (publication de juin 2026). Elle ne dit rien de l'écart
entre 15 et 25 ans.

Cet écart est repris des baromètres de courtiers, qui publient la grille
15/20/25. Calibrage retenu, à partir des moyennes clients CAFPI d'août 2026
(3,16 % / 3,31 % / 3,43 %) :

| Paramètre | Valeur |
|---|---|
| Écart 20 ans → 15 ans | −0,15 point |
| Écart 20 ans → 25 ans | +0,12 point |
| Pente entre 20 et 25 ans | +0,024 point par année |
| Durée de la moyenne Banque de France | 23,42 ans |

## Le calcul

Soit `A` le taux Banque de France du dernier mois publié.

```
decalage = (23,42 - 20) x 0,024 = 0,082 point
taux20   = A - decalage
taux15   = taux20 - 0,15
taux25   = taux20 + 0,12
```

Application à juillet 2026, `A = 3,30 %` :

| Durée | Taux |
|---|---|
| 15 ans | 3,07 % |
| 20 ans | 3,22 % |
| 25 ans | 3,34 % |

Pour mémoire, la grille précédente du site était 3,25 / 3,45 / 3,62 %, soit
environ 0,20 point au-dessus du marché, ce qui sous-estimait les budgets
affichés d'environ 2 à 3 %.

## Ce que le visiteur voit

Le simulateur annonce « un taux estimé d'après la Banque de France (données de
*mois*) » dans l'avertissement des résultats, et l'aide du champ de taux affiche
la valeur retenue pour la durée choisie. Un visiteur qui détient une proposition
bancaire saisit son propre taux, et l'avertissement le dit alors explicitement.

## Mise en service (deux réglages à faire une fois)

1. **Identifiant d'API.** Un compte seul ne suffit pas : sur
   <https://developer.webstat.banque-france.fr/>, il faut créer une
   **Application** (*My apps*), l'**abonner au produit** *WEBSTAT Banque de
   France FR V1*, puis copier son **Client ID** — ni l'identifiant du compte, ni
   le Client Secret. L'enregistrer ensuite dans le dépôt sous *Settings →
   Secrets and variables → Actions → New repository secret*, avec le nom exact
   `WEBSTAT_CLIENT_ID`. L'identifiant n'apparaît jamais dans le code ni dans les
   journaux.

   La clé se transmet dans l'en-tête `X-IBM-Client-Id`, méthode que la Banque de
   France recommande ; le script essaie aussi le paramètre `client_id`, accepté
   lui aussi, pour distinguer un problème de clé d'un problème de méthode.
2. **Autoriser les pull requests.** Dans *Settings → Actions → General →
   Workflow permissions*, cocher « Allow GitHub Actions to create and approve
   pull requests ». Sans cela le script s'exécute mais ne peut rien proposer.

Ensuite, lancer une fois le workflow à la main (*Actions → Mise a jour des taux
indicatifs → Run workflow*) en cochant l'essai à blanc : il affichera la valeur
lue et le chemin d'API retenu, sans rien modifier.

Le script sonde d'abord `/catalogue`, dont l'appel est documenté, avant de
chercher la série. Cela sépare nettement les deux pannes possibles : si le
catalogue est refusé, le problème est la clé, et le message liste quoi vérifier ;
s'il répond mais qu'aucun chemin ne rend la série, le problème est le chemin, et
le message donne les réponses reçues. Le chemin exact d'une série n'est pas
documenté publiquement : une fois connu, le fixer dans `recupererSerie` pour
supprimer les essais inutiles.

Pour vérifier la chaîne d'écriture sans identifiant :

```
WEBSTAT_FIXTURE="2026-08=3.38" node scripts/maj-taux.mjs --dry-run
```

## Mise à jour

`.github/workflows/taux.yml` exécute `scripts/maj-taux.mjs` le 12 de chaque
mois, après la publication Banque de France. Le script réécrit les deux lignes
marquées `AUTO:` dans `assets/js/simulateur.js`, remonte le paramètre `?v=` des
pages HTML, puis **ouvre une pull request** : la publication reste une décision
humaine.

Garde-fous du script, qui échoue plutôt que de publier :

- taux ancre hors de l'intervalle 0,5 % – 8 % ;
- variation du taux 20 ans supérieure à 0,5 point d'un mois sur l'autre ;
- mois publié identique ou antérieur à celui déjà inscrit dans le fichier.

## À revoir

Le calibrage de l'écart par durée devrait être revérifié une ou deux fois par an
contre les baromètres publiés : la pente s'aplatit quand les taux baissent et se
redresse quand ils montent. Le niveau, lui, se met à jour tout seul.
