/* Vefalys - fiche programme rendue depuis ?id= */
(function () {
  "use strict";

  document.addEventListener("DOMContentLoaded", function () {
    var mount = document.querySelector("[data-programme-detail]");
    if (!mount) return;

    var data = window.VEFALYS_PROGRAMMES || [];
    var id = new URLSearchParams(window.location.search).get("id");
    var p = data.filter(function (item) { return item.id === id; })[0];

    var notFound = document.querySelector("[data-programme-missing]");
    if (!p) {
      mount.style.display = "none";
      if (notFound) notFound.style.display = "block";
      return;
    }
    if (notFound) notFound.style.display = "none";

    var TYPE_LABEL = { appartement: "Appartement neuf", maison: "Maison neuve" };
    function euros(n) { return n.toLocaleString("fr-FR") + " €"; }
    function img(photo, w, h) {
      return "https://images.unsplash.com/" + photo + "?auto=format&fit=crop&w=" + w + "&h=" + h + "&q=80";
    }

    document.title = p.name + " à " + p.city + " | Vefalys";
    var metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) metaDesc.setAttribute("content", p.name + ", programme neuf à " + p.city + " à partir de " + euros(p.priceFrom) + ". " + p.description);

    var crumbName = document.querySelector("[data-crumb-name]");
    if (crumbName) crumbName.textContent = p.name;

    var gallery = p.gallery && p.gallery.length ? p.gallery : [p.img, p.img, p.img];

    var lotsRows = p.lots.map(function (lot) {
      return "<tr><td><strong>" + lot.type + "</strong></td><td>" + lot.surface + " m&sup2;</td><td>" +
        euros(lot.price) + "</td></tr>";
    }).join("");

    var highlights = p.highlights.map(function (h) {
      return '<li><i class="ph ph-check-circle" aria-hidden="true"></i>' + h + "</li>";
    }).join("");

    var badges = p.badges.map(function (b) { return '<span class="pill">' + b + "</span>"; }).join("");

    mount.innerHTML =
      '<div class="detail-head">' +
        "<div>" +
          '<span class="pill">' + p.tag + "</span>" +
          "<h1 style=\"margin-top:14px;\">" + p.name + "</h1>" +
          '<p class="city"><i class="ph ph-map-pin" aria-hidden="true"></i>' + p.address + "</p>" +
        "</div>" +
        '<div class="price-block">' +
          '<span class="k">À partir de</span>' +
          '<div class="v">' + euros(p.priceFrom) + "</div>" +
        "</div>" +
      "</div>" +

      '<div class="gallery">' +
        '<div class="main"><img src="' + img(gallery[0], 1000, 625) + '" alt="' + p.name + " à " + p.city + '" width="1000" height="625" fetchpriority="high"></div>' +
        '<div class="side">' +
          '<div><img src="' + img(gallery[1] || gallery[0], 500, 310) + '" alt="Vue du programme ' + p.name + '" width="500" height="310" loading="lazy"></div>' +
          '<div><img src="' + img(gallery[2] || gallery[0], 500, 310) + '" alt="Intérieur type du programme ' + p.name + '" width="500" height="310" loading="lazy"></div>' +
        "</div>" +
      "</div>" +

      '<div class="detail-layout">' +
        '<div class="detail-body">' +
          "<h2>Le programme</h2>" +
          "<p>" + p.description + "</p>" +
          '<div class="key-figures">' +
            '<div><div class="k">Type</div><div class="v">' + TYPE_LABEL[p.type] + "</div></div>" +
            '<div><div class="k">Typologies</div><div class="v">' + p.rooms + "</div></div>" +
            '<div><div class="k">Livraison</div><div class="v">' + p.delivery + "</div></div>" +
            '<div><div class="k">Région</div><div class="v">' + p.regionLabel + "</div></div>" +
          "</div>" +

          "<h2>Les points forts</h2>" +
          '<ul class="service-list" style="display:grid;gap:10px;">' + highlights + "</ul>" +
          '<div class="badge-row">' + badges + "</div>" +

          "<h2>Typologies et prix</h2>" +
          '<table class="lots-table">' +
            "<thead><tr><th>Typologie</th><th>Surface</th><th>Prix promoteur</th></tr></thead>" +
            "<tbody>" + lotsRows + "</tbody>" +
          "</table>" +
          '<p style="font-size:13.5px;margin-top:16px;">Prix de départ par typologie, hors stationnement et hors frais de notaire. Les lots disponibles évoluent chaque semaine.</p>' +

          "<h2>Localisation</h2>" +
          '<div class="map-embed" style="margin-top:18px;">' +
            '<iframe title="Carte de localisation du programme ' + p.name + '" loading="lazy" referrerpolicy="no-referrer-when-downgrade" src="https://www.google.com/maps?q=' +
            encodeURIComponent(p.address) + '&output=embed"></iframe>' +
          "</div>" +
        "</div>" +

        "<div>" +
          '<aside class="detail-aside">' +
            "<h3>Ce programme vous intéresse ?</h3>" +
            "<p>Un conseiller vous confirme les lots réellement disponibles et vous envoie le plan de masse sous 24 heures.</p>" +
            '<div class="aside-row"><span>Prix promoteur</span><span>' + euros(p.priceFrom) + "</span></div>" +
            '<div class="aside-row"><span>Frais d\'agence</span><span>0 €</span></div>' +
            '<div class="aside-row"><span>Frais de notaire estimés</span><span>' + euros(Math.round(p.priceFrom * 0.025)) + "</span></div>" +
            '<div class="aside-row"><span>Livraison prévue</span><span>' + p.delivery + "</span></div>" +
            '<a href="contact.html?programme=' + encodeURIComponent(p.name) + '" class="btn btn-primary btn-block">Prendre rendez-vous</a>' +
            '<p class="aside-phone"><i class="ph ph-phone" aria-hidden="true"></i>ou appelez le <a href="tel:+33669215665">06 69 21 56 65</a></p>' +
          "</aside>" +
        "</div>" +
      "</div>";

    /* ---------- Programmes similaires ---------- */
    var similarMount = document.querySelector("[data-similar-grid]");
    if (similarMount) {
      var similar = data
        .filter(function (item) { return item.id !== p.id; })
        .sort(function (a, b) {
          var sameRegion = function (x) { return x.region === p.region ? 0 : 1; };
          return sameRegion(a) - sameRegion(b) || Math.abs(a.priceFrom - p.priceFrom) - Math.abs(b.priceFrom - p.priceFrom);
        })
        .slice(0, 3);

      similarMount.innerHTML = similar.map(function (s) {
        return (
          '<article class="card programme-card">' +
            '<div class="thumb">' +
              '<a href="programme.html?id=' + s.id + '" aria-label="Voir le programme ' + s.name + '">' +
                '<img src="' + img(s.img, 720, 540) + '" alt="' + s.name + " à " + s.city + '" loading="lazy" width="720" height="540">' +
              "</a>" +
              '<span class="tag">' + s.tag + "</span>" +
            "</div>" +
            '<div class="body">' +
              '<span class="city"><i class="ph ph-map-pin" aria-hidden="true"></i>' + s.city + "</span>" +
              '<h3><a href="programme.html?id=' + s.id + '">' + s.name + "</a></h3>" +
              '<div class="meta"><span><i class="ph ph-door-open" aria-hidden="true"></i>' + s.rooms +
                '</span><span><i class="ph ph-calendar-blank" aria-hidden="true"></i>Livraison ' + s.delivery + "</span></div>" +
              '<div class="foot"><span class="price">' + euros(s.priceFrom) + ' <small>à partir de</small></span>' +
              '<a href="programme.html?id=' + s.id + '" class="btn btn-outline btn-sm">Voir le programme</a></div>' +
            "</div>" +
          "</article>"
        );
      }).join("");
    }
  });
})();
