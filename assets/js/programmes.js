/* Vefalys - programme catalogue: filtering, sorting, rendering */
(function () {
  "use strict";

  document.addEventListener("DOMContentLoaded", function () {
    var grid = document.querySelector("[data-programmes-grid]");
    if (!grid) return;

    var data = window.VEFALYS_PROGRAMMES || [];
    var els = {
      search: document.querySelector("[data-filter-search]"),
      region: document.querySelector("[data-filter-region]"),
      type: document.querySelector("[data-filter-type]"),
      budget: document.querySelector("[data-filter-budget]"),
      sort: document.querySelector("[data-filter-sort]"),
      reset: document.querySelector("[data-filter-reset]"),
      count: document.querySelector("[data-results-count]"),
      empty: document.querySelector("[data-empty-state]")
    };

    var TYPE_LABEL = { appartement: "Appartement", maison: "Maison" };

    function deliveryScore(str) {
      var m = /T(\d)\s(\d{4})/.exec(str);
      if (!m) return 0;
      return parseInt(m[2], 10) + parseInt(m[1], 10) / 4;
    }

    function formatPrice(n) {
      return n.toLocaleString("fr-FR") + " €";
    }

    function cardHTML(p) {
      return (
        '<article class="card programme-card" data-reveal>' +
        '<div class="thumb">' +
        '<a href="programme.html?id=' + p.id + '" aria-label="Voir le programme ' + p.name + '">' +
        '<img src="https://images.unsplash.com/' + p.img + '?auto=format&fit=crop&w=720&h=540&q=78" alt="' + p.name + ' à ' + p.city + '" loading="lazy" width="720" height="540">' +
        '</a>' +
        '<span class="tag">' + p.tag + '</span>' +
        '<button class="fav" type="button" data-fav="' + p.id + '" aria-label="Ajouter aux favoris"><i class="ph ph-heart"></i></button>' +
        '</div>' +
        '<div class="body">' +
        '<span class="city"><i class="ph ph-map-pin"></i>' + p.city + '</span>' +
        '<h3><a href="programme.html?id=' + p.id + '">' + p.name + '</a></h3>' +
        '<div class="meta">' +
        '<span><i class="ph ph-house-line"></i>' + TYPE_LABEL[p.type] + '</span>' +
        '<span><i class="ph ph-door-open"></i>' + p.rooms + '</span>' +
        '<span><i class="ph ph-calendar-blank"></i>Livraison ' + p.delivery + '</span>' +
        '</div>' +
        '<div class="foot">' +
        '<span class="price">' + formatPrice(p.priceFrom) + ' <small>à partir de</small></span>' +
        '<a href="programme.html?id=' + p.id + '" class="btn btn-outline btn-sm">Voir le programme</a>' +
        '</div>' +
        '</div>' +
        '</article>'
      );
    }

    function applyFavState() {
      var favs = [];
      try { favs = JSON.parse(localStorage.getItem("vefalys-favorites")) || []; } catch (e) {}
      grid.querySelectorAll("[data-fav]").forEach(function (btn) {
        btn.classList.toggle("is-active", favs.indexOf(btn.getAttribute("data-fav")) > -1);
        btn.addEventListener("click", function (e) {
          e.preventDefault();
          e.stopPropagation();
          var id = btn.getAttribute("data-fav");
          var list = [];
          try { list = JSON.parse(localStorage.getItem("vefalys-favorites")) || []; } catch (er) {}
          var idx = list.indexOf(id);
          if (idx > -1) { list.splice(idx, 1); btn.classList.remove("is-active"); }
          else { list.push(id); btn.classList.add("is-active"); }
          localStorage.setItem("vefalys-favorites", JSON.stringify(list));
        });
      });
    }

    function reveal() {
      var revealEls = grid.querySelectorAll("[data-reveal]");
      if ("IntersectionObserver" in window) {
        var obs = new IntersectionObserver(function (entries, o) {
          entries.forEach(function (entry) {
            if (entry.isIntersecting || entry.boundingClientRect.top < 0) {
              entry.target.classList.add("in-view");
              o.unobserve(entry.target);
            }
          });
        }, { threshold: 0.1 });
        revealEls.forEach(function (el) { obs.observe(el); });
      } else {
        revealEls.forEach(function (el) { el.classList.add("in-view"); });
      }
    }

    function render() {
      var searchVal = (els.search && els.search.value || "").trim().toLowerCase();
      var regionVal = els.region && els.region.value || "";
      var typeVal = els.type && els.type.value || "";
      var budgetVal = els.budget && els.budget.value || "";
      var sortVal = els.sort && els.sort.value || "pertinence";

      var results = data.filter(function (p) {
        if (searchVal && (p.name + " " + p.city).toLowerCase().indexOf(searchVal) === -1) return false;
        if (regionVal && p.region !== regionVal) return false;
        if (typeVal && p.type !== typeVal) return false;
        if (budgetVal === "300" && p.priceFrom > 300000) return false;
        if (budgetVal === "300-400" && (p.priceFrom < 300000 || p.priceFrom > 400000)) return false;
        if (budgetVal === "400-500" && (p.priceFrom < 400000 || p.priceFrom > 500000)) return false;
        if (budgetVal === "500" && p.priceFrom < 500000) return false;
        return true;
      });

      if (sortVal === "price-asc") results.sort(function (a, b) { return a.priceFrom - b.priceFrom; });
      else if (sortVal === "price-desc") results.sort(function (a, b) { return b.priceFrom - a.priceFrom; });
      else if (sortVal === "delivery") results.sort(function (a, b) { return deliveryScore(a.delivery) - deliveryScore(b.delivery); });

      if (els.count) els.count.innerHTML = "<strong>" + results.length + "</strong> programme" + (results.length !== 1 ? "s" : "") + " trouvé" + (results.length !== 1 ? "s" : "");

      if (!results.length) {
        grid.style.display = "none";
        if (els.empty) els.empty.style.display = "block";
        return;
      }
      grid.style.display = "";
      if (els.empty) els.empty.style.display = "none";
      grid.innerHTML = results.map(cardHTML).join("");
      applyFavState();
      reveal();
    }

    [els.search, els.region, els.type, els.budget, els.sort].forEach(function (el) {
      if (!el) return;
      el.addEventListener("input", render);
      el.addEventListener("change", render);
    });
    if (els.reset) {
      els.reset.addEventListener("click", function () {
        if (els.search) els.search.value = "";
        if (els.region) els.region.value = "";
        if (els.type) els.type.value = "";
        if (els.budget) els.budget.value = "";
        if (els.sort) els.sort.value = "pertinence";
        render();
      });
    }

    render();
  });
})();
