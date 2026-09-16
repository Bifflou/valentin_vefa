# Vefalys

Site vitrine et générateur de contacts pour un cabinet de conseil en immobilier neuf.
Version étendue du site existant : simulateur de financement réellement calculatoire,
page d'avis clients, FAQ filtrable et pages légales.

Site statique, sans build ni dépendance à installer : HTML, CSS et JavaScript natifs.

## Pages

| Fichier | Rôle |
| --- | --- |
| `index.html` | Accueil : proposition de valeur, méthode, avantages du neuf, avis, estimation express |
| `services.html` | Les quatre services, points forts, couverture géographique |
| `financement.html` | Simulateur de budget en cinq étapes et présentation des dispositifs |
| `avis.html` | Avis clients, note moyenne, méthode de collecte |
| `faq.html` | Questions fréquentes filtrables par thème, avec données structurées `FAQPage` |
| `a-propos.html` | Histoire, valeurs, chiffres, équipe, engagements |
| `contact.html` | Formulaire validé, coordonnées, carte, réassurance |
| `mentions-legales.html` / `confidentialite.html` | Pages légales et RGPD |
| `404.html` | Page d'erreur |

## Fonctionnalités

- **Simulateur de financement** : capacité d'emprunt calculée par la formule d'amortissement
  réelle, plafond d'endettement à 35 % (règle HCSF), frais de notaire selon neuf ou ancien.
- **Prêt à taux zéro au barème officiel** : plafonds d'opération et de ressources, coefficient
  familial, tranches et quotités (distinctes pour l'habitat collectif et la maison
  individuelle), plafonnement par le montant des autres prêts. Les questions sur la
  composition du foyer et la zone n'apparaissent que lorsque le PTZ est possible.
- **Estimation express** en page d'accueil, mise à jour en direct.
- **FAQ filtrable** par thème, avec ouverture directe d'un thème par l'ancre de l'URL
  (`faq.html#financement`).
- **Formulaire de contact** validé côté client, avec messages d'erreur sous chaque champ.
- **Carte de localisation** construite avec Leaflet et les fonds de carte OpenStreetMap,
  sans aucune commande superposée : les conditions de l'iframe Google interdisent de masquer
  ses boutons, celle-ci n'en affiche aucun. Fond de carte assombri en thème sombre.
- **Thème clair et sombre** : suit la préférence système, bascule manuelle mémorisée.
- **Animations** : révélation au défilement et compteurs via `IntersectionObserver`,
  neutralisés sous `prefers-reduced-motion`.
- **SEO** : titres et descriptions par page, Open Graph, `sitemap.xml`, `robots.txt`,
  données structurées `RealEstateAgent` et `FAQPage`.

## Structure

```
assets/
  css/style.css        design system complet (tokens, composants, thème sombre)
  js/main.js           thème, navigation, révélations, compteurs, FAQ, formulaire
  js/simulateur.js     estimation express et simulateur en cinq étapes
  img/vefalys.png      logo
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
2. **Images** : les visuels proviennent d'Unsplash et servent d'illustration. À remplacer par
   les perspectives fournies par les promoteurs.
3. **Avis clients** : les témoignages de `avis.html` sont des exemples de mise en page,
   à remplacer par les avis réellement collectés.
4. **Pages légales** : compléter les champs entre crochets (SIREN, carte professionnelle,
   garantie financière, hébergeur) et faire relire par un conseil juridique.
5. **Taux du simulateur** : les taux indicatifs sont définis dans `RATES`
   en haut de `assets/js/simulateur.js`, à actualiser selon le marché.
   Le barème du PTZ, juste en dessous dans l'objet `PTZ`, cite les articles du code de la
   construction dont il est tiré : il est en vigueur jusqu'au 31 décembre 2027 et devra
   être revérifié à chaque révision du dispositif.
6. **Fond de carte** : les tuiles viennent d'OpenStreetMap, sans clé. Sa politique
   d'usage vise un trafic modéré ; pour un site commercial à forte audience, passer à un
   fournisseur à clé (MapTiler, Mapbox) en remplaçant `TILE_URL` dans `assets/js/main.js`.
