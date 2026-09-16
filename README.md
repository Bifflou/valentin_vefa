# Vefalys

Site vitrine et générateur de contacts pour un cabinet de conseil en immobilier neuf.
Version étendue du site existant : ajout d'un catalogue de programmes avec fiches détaillées,
d'un simulateur de financement fonctionnel, d'une page d'avis clients et des pages légales.

Site statique, sans build ni dépendance à installer : HTML, CSS et JavaScript natifs.

## Pages

| Fichier | Rôle |
| --- | --- |
| `index.html` | Accueil : proposition de valeur, méthode, programmes en vedette, avantages du neuf, avis, estimation express |
| `programmes.html` | Catalogue filtrable (ville, région, type de bien, budget) avec tri et état vide |
| `programme.html` | Fiche détaillée d'un programme, rendue depuis `?id=`, avec typologies, prix, carte et programmes comparables |
| `services.html` | Les quatre services, points forts, couverture géographique |
| `financement.html` | Simulateur de budget en cinq étapes et présentation des dispositifs |
| `avis.html` | Avis clients, note moyenne, méthode de collecte |
| `faq.html` | Questions fréquentes filtrables par thème, avec données structurées `FAQPage` |
| `a-propos.html` | Histoire, valeurs, chiffres, équipe, engagements |
| `contact.html` | Formulaire validé, coordonnées, carte, réassurance |
| `mentions-legales.html` / `confidentialite.html` | Pages légales et RGPD |
| `404.html` | Page d'erreur |

## Fonctionnalités

- **Catalogue filtrable** : filtres ville, région, type et budget, quatre tris, état vide traité.
- **Fiches programmes** : une seule page dynamique alimentée par `assets/js/programmes-data.js`.
- **Favoris** : ajout en un clic, conservés dans le navigateur (`localStorage`).
- **Simulateur de financement** : capacité d'emprunt calculée par la formule d'amortissement réelle,
  plafond d'endettement à 35 % (règle HCSF), frais de notaire selon neuf ou ancien, estimation du PTZ.
- **Estimation express** en page d'accueil, mise à jour en direct.
- **Thème clair et sombre** : suit la préférence système, bascule manuelle mémorisée.
- **Animations** : révélation au défilement et compteurs via `IntersectionObserver`,
  neutralisés sous `prefers-reduced-motion`.
- **SEO** : titres et descriptions par page, Open Graph, `sitemap.xml`, `robots.txt`,
  données structurées `RealEstateAgent` et `FAQPage`.

## Structure

```
assets/
  css/style.css              design system complet (tokens, composants, thème sombre)
  js/main.js                  thème, navigation, révélations, compteurs, favoris, FAQ, formulaire
  js/programmes-data.js       données du catalogue (12 programmes de démonstration)
  js/programmes.js            filtres, tri et rendu du catalogue
  js/programme-detail.js      rendu de la fiche programme
  js/simulateur.js            estimation express et simulateur en cinq étapes
  img/favicon.svg
```

## Mise en ligne

Le site est servi tel quel par n'importe quel hébergeur statique.
Pour GitHub Pages : `Settings` puis `Pages`, source `main` et dossier `/ (root)`.

Pour un test en local, n'importe quel serveur statique fait l'affaire, par exemple :

```bash
npx serve .
```

## À compléter avant la mise en production

1. **Formulaire de contact** : il ouvre actuellement le logiciel de messagerie du visiteur
   (attribut `data-mailto` sur le `<form>` de `contact.html`). Pour recevoir les demandes
   directement par e-mail, remplacer par un service de formulaire (Formspree, Netlify Forms,
   EmailJS) en renseignant `action` et `method` sur le formulaire.
2. **Données du catalogue** : `assets/js/programmes-data.js` contient douze programmes de
   démonstration. À remplacer par les programmes réels, ou à brancher sur l'outil du cabinet.
3. **Images** : les visuels proviennent d'Unsplash et servent d'illustration. À remplacer par
   les perspectives fournies par les promoteurs.
4. **Avis clients** : les témoignages de `avis.html` sont des exemples de mise en page,
   à remplacer par les avis réellement collectés.
5. **Pages légales** : compléter les champs entre crochets (SIREN, carte professionnelle,
   garantie financière, hébergeur) et faire relire par un conseil juridique.
6. **Taux du simulateur** : les taux indicatifs sont définis dans `RATES`
   en haut de `assets/js/simulateur.js`, à actualiser selon le marché.
