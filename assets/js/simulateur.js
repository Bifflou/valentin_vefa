/* Vefalys - simulateur de financement (5 étapes, calculs réels) */
(function () {
  "use strict";

  /* Taux indicatifs marché (hors assurance), révisables. */
  var RATES = { 15: 3.25, 20: 3.45, 25: 3.62 };
  var NOTARY = { neuf: 0.025, ancien: 0.075 };
  var MAX_DEBT_RATIO = 0.35;

  /* ---------- Mini simulateur (accueil) ---------- */
  document.addEventListener("DOMContentLoaded", function () {
    var mini = document.querySelector("[data-mini-sim]");
    if (!mini) return;
    var revenus = mini.querySelector("[data-mini-revenus]");
    var duree = mini.querySelector("[data-mini-duree]");
    var out = mini.querySelector("[data-mini-out]");
    var detail = mini.querySelector("[data-mini-detail]");

    function update() {
      var r = parseFloat(revenus.value) || 0;
      var y = parseInt(duree.value, 10) || 20;
      var rate = RATES[y] || 3.5;
      var monthly = r * MAX_DEBT_RATIO;
      var i = rate / 100 / 12;
      var n = y * 12;
      var capacity = monthly > 0 ? monthly * (1 - Math.pow(1 + i, -n)) / i : 0;
      out.textContent = Math.round(capacity).toLocaleString("fr-FR") + " €";
      detail.textContent = monthly > 0
        ? "Soit " + Math.round(monthly).toLocaleString("fr-FR") + " € par mois sur " + y + " ans, au taux indicatif de " + rate.toFixed(2).replace(".", ",") + " %."
        : "Renseignez vos revenus mensuels nets pour obtenir une estimation.";
    }
    revenus.addEventListener("input", update);
    duree.addEventListener("change", update);
    update();
  });

  document.addEventListener("DOMContentLoaded", function () {
    var form = document.querySelector("[data-simulator]");
    if (!form) return;

    var panels = Array.prototype.slice.call(form.querySelectorAll(".sim-panel"));
    var bars = Array.prototype.slice.call(form.querySelectorAll(".sim-progress .bar span"));
    var current = 0;

    var state = {
      objectif: "principale",
      bien: "appartement-neuf",
      primo: "oui",
      revenus: null,
      charges: 0,
      apport: null,
      duree: 20
    };

    /* ---------- Navigation ---------- */
    function show(index) {
      current = Math.max(0, Math.min(index, panels.length - 1));
      panels.forEach(function (panel, i) {
        panel.classList.toggle("is-active", i === current);
      });
      bars.forEach(function (bar, i) {
        bar.style.width = i <= current ? "100%" : "0%";
      });
      var anchor = document.querySelector("#simulateur");
      if (anchor && window.scrollY > anchor.offsetTop) {
        anchor.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }

    function validatePanel(index) {
      var panel = panels[index];
      var ok = true;
      panel.querySelectorAll("input[required]").forEach(function (input) {
        var field = input.closest(".field");
        var empty = !input.value.trim() || parseFloat(input.value) <= 0;
        if (field) field.classList.toggle("has-error", empty);
        if (empty) ok = false;
      });
      return ok;
    }

    form.querySelectorAll("[data-sim-next]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        if (!validatePanel(current)) {
          var first = panels[current].querySelector(".has-error input");
          if (first) first.focus();
          return;
        }
        if (current === panels.length - 2) {
          compute();
        }
        show(current + 1);
      });
    });
    form.querySelectorAll("[data-sim-prev]").forEach(function (btn) {
      btn.addEventListener("click", function () { show(current - 1); });
    });

    /* ---------- Tiles (radio) ---------- */
    form.querySelectorAll(".tile").forEach(function (tile) {
      var input = tile.querySelector("input");
      if (!input) return;
      if (input.checked) tile.classList.add("is-selected");
      input.addEventListener("change", function () {
        form.querySelectorAll('.tile input[name="' + input.name + '"]').forEach(function (sibling) {
          sibling.closest(".tile").classList.toggle("is-selected", sibling.checked);
        });
        state[input.name] = input.value;
      });
    });

    show(0);

    form.querySelectorAll("input[type='number']").forEach(function (input) {
      input.addEventListener("input", function () {
        state[input.name] = parseFloat(input.value) || 0;
        var field = input.closest(".field");
        if (field) field.classList.remove("has-error");
      });
    });

    /* ---------- Maths ---------- */
    function loanCapacity(monthly, annualRate, years) {
      var i = annualRate / 100 / 12;
      var n = years * 12;
      return monthly * (1 - Math.pow(1 + i, -n)) / i;
    }

    function euros(n) {
      return Math.round(n).toLocaleString("fr-FR") + " €";
    }

    function animateValue(el, target, formatter) {
      var duration = 1100;
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || document.hidden) {
        el.textContent = formatter(target);
        return;
      }
      var start = null;
      function step(ts) {
        if (start === null) start = ts;
        var progress = Math.min((ts - start) / duration, 1);
        var eased = 1 - Math.pow(1 - progress, 3);
        el.textContent = formatter(target * eased);
        if (progress < 1) requestAnimationFrame(step);
      }
      requestAnimationFrame(step);
      /* requestAnimationFrame est gelé sur un onglet masqué : on garantit la valeur finale. */
      setTimeout(function () { el.textContent = formatter(target); }, duration + 150);
    }

    function set(name, value) {
      var el = form.querySelector('[data-result="' + name + '"]');
      if (el) el.textContent = value;
    }

    function compute() {
      var revenus = state.revenus || 0;
      var charges = state.charges || 0;
      var apport = state.apport || 0;
      var duree = parseInt(state.duree, 10) || 20;
      var rate = RATES[duree] || 3.5;

      /* Règle HCSF : l'ensemble des charges de crédit reste sous 35 % des revenus. */
      var mensualiteMax = Math.max(revenus * MAX_DEBT_RATIO - charges, 0);
      var capacite = mensualiteMax > 0 ? loanCapacity(mensualiteMax, rate, duree) : 0;

      var isNeuf = state.bien === "appartement-neuf" || state.bien === "maison-neuve";
      var notaryRate = isNeuf ? NOTARY.neuf : NOTARY.ancien;

      /* Enveloppe disponible = emprunt + apport, dont il faut retirer les frais de notaire. */
      var enveloppe = capacite + apport;
      var prixBien = enveloppe / (1 + notaryRate);
      var fraisNotaire = prixBien * notaryRate;

      var eligiblePtz = state.primo === "oui" && state.objectif === "principale" && isNeuf;
      var ptz = eligiblePtz ? Math.min(prixBien * 0.2, 100000) : 0;

      var coutInterets = mensualiteMax * duree * 12 - capacite;
      var endettement = revenus > 0 ? ((mensualiteMax + charges) / revenus) * 100 : 0;

      var amountEl = form.querySelector('[data-result="budget"]');
      if (amountEl) animateValue(amountEl, prixBien, function (v) { return euros(v); });

      set("capacite", euros(capacite));
      set("mensualite", euros(mensualiteMax));
      set("apport-recap", euros(apport));
      set("notaire", euros(fraisNotaire));
      set("interets", euros(coutInterets));
      set("taux", rate.toFixed(2).replace(".", ",") + " %");
      set("duree-recap", duree + " ans");
      set("endettement", endettement.toFixed(1).replace(".", ",") + " %");

      var ptzBlock = form.querySelector("[data-ptz-block]");
      if (ptzBlock) {
        ptzBlock.style.display = eligiblePtz ? "" : "none";
        set("ptz", euros(ptz));
      }

      var ptzKo = form.querySelector("[data-ptz-ko]");
      if (ptzKo) ptzKo.style.display = eligiblePtz ? "none" : "";

      var restart = form.querySelector("[data-sim-restart]");
      if (restart) {
        restart.onclick = function () { show(0); };
      }
    }
  });
})();
