/* Vefalys - shared site behaviour */
(function () {
  "use strict";

  /* ---------- Theme ---------- */
  var root = document.documentElement;
  var THEME_KEY = "vefalys-theme";
  function applyTheme(theme) {
    if (theme === "light" || theme === "dark") {
      root.setAttribute("data-theme", theme);
    } else {
      root.removeAttribute("data-theme");
    }
  }
  /* Le thème clair est le défaut : le sombre se choisit au bouton et se mémorise. */
  applyTheme(localStorage.getItem(THEME_KEY) || "light");

  document.addEventListener("DOMContentLoaded", function () {
    var toggle = document.querySelector("[data-theme-toggle]");
    if (toggle) {
      toggle.addEventListener("click", function () {
        var next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
        applyTheme(next);
        try { localStorage.setItem(THEME_KEY, next); } catch (e) {}
      });
    }

    /* ---------- Header scroll state (IntersectionObserver, no scroll listener) ---------- */
    var header = document.querySelector(".site-header");
    var sentinel = document.querySelector("#header-sentinel");
    if (header && sentinel && "IntersectionObserver" in window) {
      var headerObserver = new IntersectionObserver(
        function (entries) {
          header.classList.toggle("is-scrolled", !entries[0].isIntersecting);
        },
        { threshold: 0, rootMargin: "-1px 0px 0px 0px" }
      );
      headerObserver.observe(sentinel);
    }

    /* ---------- Mobile nav ---------- */
    var navToggle = document.querySelector("[data-nav-toggle]");
    var mobileNav = document.querySelector("[data-mobile-nav]");
    if (navToggle && mobileNav) {
      navToggle.addEventListener("click", function () {
        var open = mobileNav.classList.toggle("is-open");
        navToggle.classList.toggle("is-open", open);
        navToggle.setAttribute("aria-expanded", open ? "true" : "false");
        document.body.style.overflow = open ? "hidden" : "";
      });
      mobileNav.querySelectorAll("a").forEach(function (link) {
        link.addEventListener("click", function () {
          mobileNav.classList.remove("is-open");
          navToggle.classList.remove("is-open");
          document.body.style.overflow = "";
        });
      });
    }

    /* ---------- Active nav link ---------- */
    var path = window.location.pathname.split("/").pop() || "index.html";
    document.querySelectorAll("[data-nav-link]").forEach(function (link) {
      var href = link.getAttribute("href");
      if (href === path || (path === "" && href === "index.html")) {
        link.classList.add("is-active");
      }
    });

    /* ---------- Scroll reveal ---------- */
    var revealEls = document.querySelectorAll("[data-reveal], [data-reveal-group]");
    if ("IntersectionObserver" in window && revealEls.length) {
      var revealObserver = new IntersectionObserver(
        function (entries, obs) {
          entries.forEach(function (entry) {
            /* Le second test rattrape les éléments franchis pendant un scroll rapide. */
            if (entry.isIntersecting || entry.boundingClientRect.top < 0) {
              entry.target.classList.add("in-view");
              obs.unobserve(entry.target);
            }
          });
        },
        { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
      );
      revealEls.forEach(function (el) { revealObserver.observe(el); });
    } else {
      revealEls.forEach(function (el) { el.classList.add("in-view"); });
    }

    /* ---------- Counters ---------- */
    var counters = document.querySelectorAll("[data-count]");
    function animateCount(el) {
      var target = parseFloat(el.getAttribute("data-count"));
      var decimals = el.getAttribute("data-decimals") ? parseInt(el.getAttribute("data-decimals"), 10) : 0;
      var suffix = el.getAttribute("data-suffix") || "";
      var prefix = el.getAttribute("data-prefix") || "";
      var duration = 1400;
      function fr(value) {
        return value.toLocaleString("fr-FR", {
          minimumFractionDigits: decimals,
          maximumFractionDigits: decimals
        });
      }
      var final = prefix + fr(target) + suffix;
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || document.hidden) {
        el.textContent = final;
        return;
      }
      var start = null;
      function step(ts) {
        if (start === null) start = ts;
        var progress = Math.min((ts - start) / duration, 1);
        var eased = 1 - Math.pow(1 - progress, 3);
        el.textContent = prefix + fr(target * eased) + suffix;
        if (progress < 1) requestAnimationFrame(step);
      }
      requestAnimationFrame(step);
      /* requestAnimationFrame est gelé sur un onglet masqué : on garantit la valeur finale. */
      setTimeout(function () { el.textContent = final; }, duration + 150);
    }
    if ("IntersectionObserver" in window && counters.length) {
      var countObserver = new IntersectionObserver(
        function (entries, obs) {
          entries.forEach(function (entry) {
            if (entry.isIntersecting || entry.boundingClientRect.top < 0) {
              animateCount(entry.target);
              obs.unobserve(entry.target);
            }
          });
        },
        { threshold: 0.5 }
      );
      counters.forEach(function (el) { countObserver.observe(el); });
    }

    /* ---------- Carte de contact ----------
       Carte pilotée par nous plutôt qu'un iframe Google, dont les boutons
       superposés ne peuvent pas être retirés sans enfreindre ses conditions. */
    var mapEl = document.getElementById("map-contact");
    if (mapEl && window.L) {
      /* Tuiles OpenStreetMap : aucune cle requise. Pour un fond de carte plus
         sobre, remplacer cette URL par un fournisseur a cle (MapTiler, Mapbox). */
      var TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
      var coords = [parseFloat(mapEl.getAttribute("data-lat")), parseFloat(mapEl.getAttribute("data-lng"))];
      var map = L.map(mapEl, {
        center: coords,
        zoom: 13,
        zoomControl: false,
        dragging: false,
        scrollWheelZoom: false,
        doubleClickZoom: false,
        touchZoom: false,
        boxZoom: false,
        keyboard: false
      });
      map.attributionControl.setPrefix("");
      L.tileLayer(TILE_URL, {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 18
      }).addTo(map);
      L.marker(coords, {
        interactive: false,
        keyboard: false,
        icon: L.divIcon({
          className: "map-pin",
          html: '<i class="ph-fill ph-map-pin"></i>',
          iconSize: [32, 32],
          iconAnchor: [16, 30]
        })
      }).addTo(map);
    }

    /* ---------- FAQ: filtres par catégorie ---------- */
    var faqChips = document.querySelectorAll("[data-faq-cat]");
    var faqItems = document.querySelectorAll("[data-faq-item]");
    if (faqChips.length && faqItems.length) {
      var emptyFaq = document.querySelector("[data-faq-empty]");
      function filterFaq(cat) {
        var shown = 0;
        faqItems.forEach(function (item) {
          var match = cat === "tous" || item.getAttribute("data-faq-item") === cat;
          item.style.display = match ? "" : "none";
          if (match) shown++;
          if (!match) item.removeAttribute("open");
        });
        if (emptyFaq) emptyFaq.style.display = shown ? "none" : "block";
        faqChips.forEach(function (chip) {
          chip.classList.toggle("is-active", chip.getAttribute("data-faq-cat") === cat);
        });
      }
      faqChips.forEach(function (chip) {
        chip.addEventListener("click", function () {
          filterFaq(chip.getAttribute("data-faq-cat"));
        });
      });
      var hash = window.location.hash.replace("#", "");
      var known = ["achat", "financement", "programmes", "juridique"];
      filterFaq(known.indexOf(hash) > -1 ? hash : "tous");
    }

    /* ---------- Footer year ---------- */
    document.querySelectorAll("[data-year]").forEach(function (el) {
      el.textContent = new Date().getFullYear();
    });

    /* ---------- Generic contact-style form validation ---------- */
    document.querySelectorAll("form[data-validate]").forEach(function (form) {
      form.addEventListener("submit", function (e) {
        e.preventDefault();
        var valid = true;
        form.querySelectorAll("[required]").forEach(function (input) {
          var field = input.closest(".field");
          var isEmpty = input.type === "checkbox" ? !input.checked : !input.value.trim();
          var isBadEmail = input.type === "email" && input.value.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.value.trim());
          if (field) field.classList.toggle("has-error", isEmpty || isBadEmail);
          if (isEmpty || isBadEmail) valid = false;
        });
        var successEl = form.querySelector("[data-form-success]") || form.parentElement.querySelector("[data-form-success]");
        if (valid) {
          /* Sans backend, on ouvre le client mail de l'utilisateur avec le message prérempli. */
          var mailto = form.getAttribute("data-mailto");
          if (mailto) {
            var get = function (name) {
              var el = form.querySelector('[name="' + name + '"]');
              return el ? el.value.trim() : "";
            };
            var subjectField = get("sujet");
            var body = [
              "Prénom : " + get("prenom"),
              "Nom : " + get("nom"),
              "E-mail : " + get("email"),
              "Téléphone : " + (get("telephone") || "non renseigné"),
              "Sujet : " + subjectField,
              "",
              get("message")
            ].join("\n");
            window.location.href =
              "mailto:" + mailto +
              "?subject=" + encodeURIComponent("Demande via le site : " + subjectField) +
              "&body=" + encodeURIComponent(body);
          }
          form.style.display = "none";
          if (successEl) successEl.style.display = "block";
        } else {
          var firstError = form.querySelector(".has-error input, .has-error select, .has-error textarea");
          if (firstError) firstError.focus();
        }
      });
    });
  });
})();
