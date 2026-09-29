# Taux indicatifs du simulateur

Le simulateur a besoin d'un taux pour trois durées : 15, 20 et 25 ans. Aucune
source publique ne publie cette grille. Ce document dit d'où viennent les trois
chiffres, ce qui est mesuré et ce qui est modélisé.

## Avertissement : le décalage de publication

**La grille en ligne n'est pas ancrée sur la statistique Banque de France.**
Elle prend le milieu des fourchettes de marché observées pour le mois indiqué
par `RATES_MOIS`.

La raison est une erreur commise le 29 septembre 2026 et corrigée le même jour.
Les taux avaient été ancrés sur la moyenne Banque de France de juillet 2026
(3,30 %), publiée le 7 septembre. Le marché avait entre-temps nettement monté,
l'OAT 10 ans franchissant durablement 4 %, au plus haut depuis 2009. Résultat :

| Durée | Grille ancrée sur juillet | Fourchette observée en septembre |
|---|---|---|
| 15 ans | 3,07 % | 3,23 % à 3,43 % |
| 20 ans | 3,22 % | 3,40 % à 3,54 % |
| 25 ans | 3,34 % | 3,50 % à 3,61 % |

La grille se retrouvait sous le **bas** de la fourchette sur les trois durées, ce
qui surestimait les budgets d'environ 3 %. La statistique Banque de France
paraît avec cinq semaines de retard : sur un marché qui bouge de 0,1 point par
mois, elle porte deux mois d'erreur intégrée. **Elle donne la tendance, pas le
niveau du mois en cours.**

Conséquence pratique : toute pull request de mise à jour automatique doit être
jugée contre les baromètres publiés du mois en cours, pas acceptée parce qu'elle
vient d'une source officielle. Le garde-fou de mois y aide déjà — le script ne
propose rien tant que la source n'annonce pas un mois postérieur à celui inscrit
dans le fichier.

## Ce que la Banque de France mesure

Le **niveau** vient de la Banque de France, série
`MIR1.M.FR.B.A22HR.A.R.A.2254U6.EUR.N`, intitulée exactement « Taux des crédits
nouveaux à l'habitat (hors négociations) aux particuliers » — l'abréviation est
celle de la Banque de France, il s'agit bien des renégociations.

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

Ce calcul donne la **forme** de la courbe et la tendance du niveau. Il n'est pas
utilisé seul pour fixer la grille en ligne : voir l'avertissement en tête de ce
document. Appliqué à juillet 2026 (`A = 3,30 %`) il donnait 3,07 / 3,22 / 3,34,
soit deux mois de retard sur le marché de septembre.

## Ce que le visiteur voit

Le simulateur annonce « un taux de marché estimé pour *mois* » dans
l'avertissement des résultats, et l'aide du champ de taux affiche la valeur
retenue pour la durée choisie. Un visiteur qui détient une proposition bancaire
saisit son propre taux, et l'avertissement le dit alors explicitement.

## Comment la donnée est récupérée

**Aucune clé d'API n'est nécessaire.** Le portail expose un export CSV public,
qui rend toute l'histoire de la série triée de la période la plus récente à la
plus ancienne :

```
https://webstat.banque-france.fr/export/csv/fr/catalog/MIR1/MIR1.M.FR.B.A22HR.A.R.A.2254U6.EUR.N
```

Séparateur point-virgule, virgule décimale, précédé d'un BOM. Le script lit les
colonnes `time_period` et `obs_value` **par leur nom**, l'ordre des attributs
variant d'un jeu de données à l'autre.

### Le piège des deux portails

Il existe deux API Webstat, et elles n'acceptent pas les mêmes clés :

| | Ancienne | Nouvelle |
|---|---|---|
| Hôte | `api.webstat.banque-france.fr` | `webstat.banque-france.fr/api/explore/v2.1` |
| Authentification | en-tête `X-IBM-Client-Id` | en-tête `Authorization: Apikey …` |
| Clé obtenue via | une *Application* sur `developer.webstat.banque-france.fr` | l'onglet *Clés d'API* du portail |
| Refus d'une clé | `401 Invalid client id or secret` | `404 NotFoundResource` |

Une clé du nouveau portail présentée à l'ancienne passerelle donne toujours
`401 Invalid client id or secret`, quoi qu'on fasse : c'est le piège dans lequel
ce script est tombé avant de passer à l'export CSV. Si le CSV public disparaît
un jour, la solution est une clé du **nouveau** portail placée dans un secret
GitHub nommé `WEBSTAT_APIKEY` : le script l'utilisera alors en secours, sur
l'API JSON.

## Mise en service (un seul réglage)

Dans *Settings → Actions → General → Workflow permissions*, cocher « Allow
GitHub Actions to create and approve pull requests ». Sans cela le script
s'exécute mais ne peut rien proposer.

Ensuite, lancer une fois le workflow à la main (*Actions → Mise a jour des taux
indicatifs → Run workflow*) en cochant l'essai à blanc : il affichera la valeur
lue sans rien modifier.

Le script tourne aussi en local, sans rien configurer :

```
node scripts/maj-taux.mjs --dry-run
```

Et pour éprouver la chaîne d'écriture sans réseau, avec une valeur choisie :

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
