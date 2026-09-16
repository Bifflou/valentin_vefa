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
  applyTheme(localStorage.getItem(THEME_KEY));

  document.addEventListener("DOMContentLoaded", function () {
    var toggle = document.querySelector("[data-theme-toggle]");
    if (toggle) {
      toggle.addEventListener("click", function () {
        var current = root.getAttribute("data-theme");
        var prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
        var isDark = current ? current === "dark" : prefersDark;
        var next = isDark ? "light" : "dark";
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
      var final = prefix + target.toFixed(decimals).replace(".", ",") + suffix;
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || document.hidden) {
        el.textContent = final;
        return;
      }
      var start = null;
      function step(ts) {
        if (start === null) start = ts;
        var progress = Math.min((ts - start) / duration, 1);
        var eased = 1 - Math.pow(1 - progress, 3);
        var value = target * eased;
        el.textContent = prefix + value.toFixed(decimals).replace(".", ",") + suffix;
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

    /* ---------- Favourites (heart) ---------- */
    var FAV_KEY = "vefalys-favorites";
    function getFavs() {
      try { return JSON.parse(localStorage.getItem(FAV_KEY)) || []; } catch (e) { return []; }
    }
    function setFavs(list) {
      try { localStorage.setItem(FAV_KEY, JSON.stringify(list)); } catch (e) {}
    }
    var favs = getFavs();
    document.querySelectorAll("[data-fav]").forEach(function (btn) {
      var id = btn.getAttribute("data-fav");
      if (favs.indexOf(id) > -1) btn.classList.add("is-active");
      btn.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        var list = getFavs();
        var idx = list.indexOf(id);
        if (idx > -1) { list.splice(idx, 1); btn.classList.remove("is-active"); }
        else { list.push(id); btn.classList.add("is-active"); }
        setFavs(list);
      });
    });

    /* ---------- Contact: préremplissage depuis ?programme= ---------- */
    var programmeParam = new URLSearchParams(window.location.search).get("programme");
    if (programmeParam) {
      var messageField = document.querySelector('form[data-validate] [name="message"]');
      var sujetField = document.querySelector('form[data-validate] [name="sujet"]');
      if (messageField && !messageField.value) {
        messageField.value = "Bonjour, je souhaite des informations sur le programme " + programmeParam + ".";
      }
      if (sujetField) sujetField.value = "achat-neuf";
      var notice = document.querySelector("[data-programme-notice]");
      if (notice) {
        notice.querySelector("[data-programme-name]").textContent = programmeParam;
        notice.style.display = "flex";
      }
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
