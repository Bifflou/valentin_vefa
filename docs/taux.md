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

Conséquence pratique : **rien n'écrit les taux automatiquement.** Le workflow
mesure la dérive et ouvre une issue ; le chiffre est décidé par un humain qui
regarde les barèmes du mois, puis appliqué avec `--fixer`.

## Pourquoi l'OAT 10 ans ne rattrape pas ce retard

L'idée paraît évidente : l'OAT 10 ans est le moteur des taux immobiliers, elle
est publiée sans retard, donc elle devrait permettre de corriger le décalage.
**Les données ne le confirment pas.** Régression du taux de crédit sur l'OAT,
151 mois de janvier 2014 à juillet 2026, en variations, sans constante :

| Horizon | Transmission β | R² |
|---|---|---|
| 1 mois | 0,075 | 0,03 |
| 2 mois | 0,111 | 0,04 |
| 3 mois | 0,164 | 0,07 |
| 6 mois | 0,308 | 0,17 |
| 12 mois | 0,462 | 0,31 |

À un mois, une hausse de 0,15 point de l'OAT ne prédit que 0,011 point de hausse
du taux de crédit, et n'explique que 3 % de la variance. Il fallait rattraper
0,20 point : la correction en aurait couvert un vingtième.

La raison se lit dans l'écart entre les deux taux, qui n'est pas une marge
stable :

| Période | Écart crédit − OAT | Écart-type |
|---|---|---|
| 2014-2019 | +1,11 pt | 0,36 |
| 2020-2021 | +1,23 pt | 0,21 |
| 2022-2023 | +0,03 pt | 0,56 |
| 2024-2026 | +0,11 pt | 0,57 |

La marge s'est effondrée de 1,2 point à 0,1 point après 2022, et sa dispersion a
doublé. Les banques françaises prêtent désormais quasiment au niveau du
souverain, en arbitrant selon leur collecte de dépôts et leur appétit de parts
de marché, pas selon un écart mécanique sur l'OAT. Il n'y a donc pas de relation
exploitable à automatiser.

Le script affiche quand même l'OAT dans son rapport : elle reste un indicateur
de contexte utile à l'humain qui décide, et la BCE la publie un mois plus tôt que
la Banque de France ne publie son taux de crédit.

Le calibrage est reproductible : les deux séries sont publiques et sans clé, le
calcul tient en une trentaine de lignes.

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
ce script est tombé avant de passer à l'export CSV. Si le CSV public disparaissait
un jour, il faudrait une clé du **nouveau** portail et un appel à l'API JSON — le
script ne le fait plus, il n'a plus besoin d'aucune clé.

## Mise en service

Rien à configurer : les deux sources sont publiques, et le workflow n'a besoin
que du droit d'ouvrir une issue, que le jeton par défaut possède déjà.

## Le cycle mensuel

`.github/workflows/taux.yml` exécute `scripts/maj-taux.mjs` le 12 de chaque
mois, après la publication Banque de France. Le script **ne modifie jamais les
taux**. Il compare la statistique du moment à la référence enregistrée dans
`scripts/taux-reference.json` lors de la dernière décision humaine, et ouvre une
issue si la dérive dépasse 0,15 point. Si une issue est déjà ouverte, il la
commente plutôt que d'en empiler une autre.

Pour décider, relever les barèmes publiés du mois en cours sur 15, 20 et 25 ans,
prendre le milieu des fourchettes, puis appliquer :

```
node scripts/maj-taux.mjs --fixer 3.33/3.47/3.56 --mois "septembre 2026"
```

Le script réécrit les deux lignes marquées `AUTO:` dans `simulateur.js`, remonte
le paramètre `?v=` des pages et enregistre la nouvelle référence.

Garde-fous de la saisie, qui échouent plutôt que d'écrire :

- un taux hors de l'intervalle 0,5 % – 8 % ;
- une grille non croissante avec la durée ;
- un écart supérieur à 1,5 point entre 15 et 25 ans ;
- `--fixer` sans `--mois`, ou une grille illisible.

Le rapport de surveillance tourne aussi en local, sans rien configurer :

```
node scripts/maj-taux.mjs
```

Et pour éprouver l'alerte sans attendre un vrai mouvement de marché :

```
WEBSTAT_FIXTURE="2026-08=3.50" node scripts/maj-taux.mjs
```

## À revoir

Le calibrage de l'écart par durée devrait être revérifié une ou deux fois par an
contre les baromètres publiés : la pente s'aplatit quand les taux baissent et se
redresse quand ils montent.

Si la marge sur l'OAT redevenait stable — elle l'était avant 2022 — la
correction automatique du retard redeviendrait envisageable. Le calibrage à
refaire est celui décrit plus haut : une régression en variations sur les deux
séries publiques. Tant que le R² à un mois reste sous 0,3, ça ne vaut pas la
peine.
