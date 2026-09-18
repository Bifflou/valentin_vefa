/* Vefalys - simulateur de financement (5 étapes, calculs réels) */
(function () {
  "use strict";

  /* Taux indicatifs marché (hors assurance), révisables. */
  var RATES = { 15: 3.25, 20: 3.45, 25: 3.62 };
  var NOTARY = { neuf: 0.025, ancien: 0.075 };
  var MAX_DEBT_RATIO = 0.35;

  /* ---------- Barème du prêt à taux zéro ----------
     Source : economie.gouv.fr, décret 2025-299, articles du code de la
     construction et de l'habitation cités devant chaque tableau.
     À revérifier à chaque révision du dispositif (en vigueur jusqu'au
     31 décembre 2027). */
  var PTZ = {
    /* Plafonds de l'opération, art. D31-10-10. La dernière ligne couvre 5 personnes et plus. */
    plafondOperation: {
      1: { A: 150000, B1: 135000, B2: 110000, C: 100000 },
      2: { A: 225000, B1: 202500, B2: 165000, C: 150000 },
      3: { A: 270000, B1: 243000, B2: 198000, C: 180000 },
      4: { A: 315000, B1: 283500, B2: 231000, C: 210000 },
      5: { A: 360000, B1: 324000, B2: 264000, C: 240000 }
    },
    /* Plafonds de ressources donnant accès au dispositif, art. D31-10-3-1. */
    plafondRessources: {
      1: { A: 49000, B1: 34500, B2: 31500, C: 28500 },
      2: { A: 73500, B1: 51750, B2: 47250, C: 42750 },
      3: { A: 88200, B1: 62100, B2: 56700, C: 51300 },
      4: { A: 102900, B1: 72450, B2: 66150, C: 59850 },
      5: { A: 117600, B1: 82800, B2: 75600, C: 68400 },
      6: { A: 132300, B1: 93150, B2: 85050, C: 76950 },
      7: { A: 147000, B1: 103500, B2: 94500, C: 85500 },
      8: { A: 161700, B1: 113850, B2: 103950, C: 94050 }
    },
    /* Coefficient familial, déduit des plafonds de ressources ci-dessus. */
    coefficient: { 1: 1, 2: 1.5, 3: 1.8, 4: 2.1, 5: 2.4, 6: 2.7, 7: 3, 8: 3.3 },
    /* Tranches de ressources, art. D31-10-9, appliquées au revenu par personne. */
    tranches: [
      { A: 25000, B1: 21500, B2: 18000, C: 15000 },
      { A: 31000, B1: 26000, B2: 22500, C: 19500 },
      { A: 37000, B1: 30000, B2: 27000, C: 24000 },
      { A: 49000, B1: 34500, B2: 31500, C: 28500 }
    ],
    /* Quotités, art. D31-10-9. La maison individuelle neuve est moins bien dotée. */
    quotite: {
      collectif: [0.5, 0.4, 0.4, 0.2],
      individuel: [0.3, 0.2, 0.2, 0.1]
    }
  };

  /* ---------- Zonage ABC ----------
     Table nationale chargée depuis zonage-abc.js : codes INSEE concaténés
     par zone, tout ce qui n'y figure pas relève de la zone C. */
  var ZONE_LABELS = { Abis: "A bis", A: "A", B1: "B1", B2: "B2", C: "C" };
  var indexZones = null;
  function zoneDeCommune(insee) {
    var data = window.VEFALYS_ZONAGE;
    if (!data) return null;
    if (!indexZones) {
      indexZones = {};
      Object.keys(data.communes).forEach(function (zone) {
        var blob = data.communes[zone];
        for (var i = 0; i < blob.length; i += 5) indexZones[blob.substr(i, 5)] = zone;
      });
    }
    return indexZones[insee] || data.defaut;
  }
  /* Le barème du PTZ ne distingue pas A bis de A. */
  function zoneBareme(zone) {
    return zone === "Abis" ? "A" : zone;
  }

  /* Renvoie le PTZ estimé, ou le motif de non-éligibilité. */
  function estimatePtz(opts) {
    var pers = Math.min(Math.max(opts.personnes, 1), 8);
    var plafondRessources = PTZ.plafondRessources[pers][opts.zone];
    if (opts.revenuAnnuel > plafondRessources) {
      return { eligible: false, motif: "ressources", plafondRessources: plafondRessources, personnes: pers };
    }
    var revenuParPersonne = opts.revenuAnnuel / PTZ.coefficient[pers];
    var tranche = -1;
    for (var i = 0; i < PTZ.tranches.length; i++) {
      if (revenuParPersonne <= PTZ.tranches[i][opts.zone]) { tranche = i; break; }
    }
    if (tranche === -1) {
      return { eligible: false, motif: "ressources", plafondRessources: plafondRessources, personnes: pers };
    }
    var plafondOperation = PTZ.plafondOperation[Math.min(pers, 5)][opts.zone];
    var base = Math.min(opts.prix, plafondOperation);
    var quotite = PTZ.quotite[opts.collectif ? "collectif" : "individuel"][tranche];
    /* Art. D31-10-6 : le PTZ ne peut pas depasser le montant des autres prets. */
    return {
      eligible: true,
      montant: Math.min(base * quotite, opts.autresPrets),
      tranche: tranche + 1,
      quotite: quotite,
      plafondOperation: plafondOperation,
      base: base,
      revenuParPersonne: revenuParPersonne
    };
  }

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
      duree: 20,
      personnes: 1,
      zone: "A",
      rfr: null
    };

    /* Le PTZ retient le revenu fiscal de référence de l'année N-2, qui figure
       sur l'avis d'imposition de l'année suivante. */
    var anneeRevenus = new Date().getFullYear() - 2;
    form.querySelectorAll("[data-annee-rfr]").forEach(function (el) { el.textContent = anneeRevenus; });
    form.querySelectorAll("[data-annee-rfr-avis]").forEach(function (el) { el.textContent = anneeRevenus + 1; });

    /* Les deux questions du PTZ ne concernent que la primo-accession
       dans le neuf pour une résidence principale : ailleurs, on ne les pose pas. */
    var ptzFields = Array.prototype.slice.call(form.querySelectorAll("[data-ptz-fields]"));
    function isNeuf() {
      return state.bien === "appartement-neuf" || state.bien === "maison-neuve";
    }
    function ptzPossible() {
      return state.objectif === "principale" && state.primo === "oui" && isNeuf();
    }
    function syncPtzFields() {
      ptzFields.forEach(function (el) { el.style.display = ptzPossible() ? "" : "none"; });
    }

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
        syncPtzFields();
      });
    });

    syncPtzFields();
    show(0);

    form.querySelectorAll("input[type='number']").forEach(function (input) {
      input.addEventListener("input", function () {
        state[input.name] = parseFloat(input.value) || 0;
        var field = input.closest(".field");
        if (field) field.classList.remove("has-error");
      });
    });

    form.querySelectorAll("select[name]").forEach(function (select) {
      state[select.name] = select.name === "personnes" ? parseInt(select.value, 10) : select.value;
      select.addEventListener("change", function () {
        state[select.name] = select.name === "personnes" ? parseInt(select.value, 10) : select.value;
      });
    });

    /* ---------- Code postal, commune, puis zone ---------- */
    var cpInput = form.querySelector("[data-code-postal]");
    var cpHint = form.querySelector("[data-cp-hint]");
    var communeRow = form.querySelector("[data-commune-row]");
    var communeSelect = form.querySelector("[data-commune]");
    var zoneAffichee = form.querySelector("[data-zone-affichee]");
    var zoneSelect = form.querySelector('select[name="zone"]');
    var zoneManuelChamp = form.querySelector("[data-zone-manuel-champ]");
    var boutonManuel = form.querySelector("[data-zone-manuel]");
    var CP_HINT_DEFAUT = cpHint ? cpHint.textContent : "";

    if (boutonManuel && zoneManuelChamp) {
      boutonManuel.addEventListener("click", function () {
        zoneManuelChamp.style.display = "";
        zoneSelect.focus();
      });
    }

    /* La zone retenue passe par le select : l'état reste piloté par un seul élément. */
    function appliquerZone(zone) {
      if (!zoneSelect) return;
      zoneSelect.value = zoneBareme(zone);
      state.zone = zoneSelect.value;
      if (zoneAffichee) {
        zoneAffichee.textContent = "Zone " + ZONE_LABELS[zone];
      }
    }

    function afficherCommunes(communes) {
      communeSelect.innerHTML = communes.map(function (c) {
        return '<option value="' + c.code + '">' + c.nom + "</option>";
      }).join("");
      communeRow.style.display = "";
      appliquerZone(zoneDeCommune(communes[0].code));
    }

    if (cpInput && communeSelect) {
      var requeteEnCours = 0;
      cpInput.addEventListener("input", function () {
        var cp = cpInput.value.replace(/\D/g, "").slice(0, 5);
        if (cpInput.value !== cp) cpInput.value = cp;
        if (cp.length < 5) {
          communeRow.style.display = "none";
          if (cpHint) cpHint.textContent = CP_HINT_DEFAUT;
          return;
        }
        var jeton = ++requeteEnCours;
        if (cpHint) cpHint.textContent = "Recherche des communes...";
        fetch("https://geo.api.gouv.fr/communes?codePostal=" + cp + "&fields=nom,code")
          .then(function (r) { return r.ok ? r.json() : []; })
          .then(function (communes) {
            if (jeton !== requeteEnCours) return; /* une saisie plus récente a pris le relais */
            if (!communes.length) {
              communeRow.style.display = "none";
              if (cpHint) cpHint.textContent = "Code postal inconnu. Indiquez la zone à la main ci-dessous.";
              if (zoneManuelChamp) zoneManuelChamp.style.display = "";
              return;
            }
            communes.sort(function (a, b) { return a.nom.localeCompare(b.nom, "fr"); });
            if (cpHint) cpHint.textContent = communes.length > 1
              ? "Plusieurs communes partagent ce code postal : choisissez la bonne."
              : CP_HINT_DEFAUT;
            afficherCommunes(communes);
          })
          .catch(function () {
            if (jeton !== requeteEnCours) return;
            if (cpHint) cpHint.textContent = "Recherche indisponible. Indiquez la zone à la main ci-dessous.";
            if (zoneManuelChamp) zoneManuelChamp.style.display = "";
          });
      });

      communeSelect.addEventListener("change", function () {
        appliquerZone(zoneDeCommune(communeSelect.value));
      });
    }

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

      var notaryRate = isNeuf() ? NOTARY.neuf : NOTARY.ancien;

      /* Enveloppe disponible = emprunt + apport, dont il faut retirer les frais de notaire. */
      var enveloppe = capacite + apport;
      var prixBien = enveloppe / (1 + notaryRate);
      var fraisNotaire = prixBien * notaryRate;

      /* Ressources du PTZ : le revenu fiscal de référence s'il est connu,
         sinon les revenus nets annualisés, qui n'en sont qu'une approximation. */
      var rfrSaisi = state.rfr > 0;
      var revenuPtz = rfrSaisi ? state.rfr : revenus * 12;

      /* Le PTZ vient s'ajouter au budget : on l'estime sur le prix finançable
         par le prêt principal, sans boucler sur l'enveloppe totale. */
      var ptz = ptzPossible()
        ? estimatePtz({
            personnes: state.personnes,
            zone: state.zone,
            revenuAnnuel: revenuPtz,
            prix: prixBien,
            autresPrets: capacite,
            collectif: state.bien === "appartement-neuf"
          })
        : { eligible: false, motif: "situation" };

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
      var ptzKo = form.querySelector("[data-ptz-ko]");
      if (ptzBlock) ptzBlock.style.display = ptz.eligible ? "" : "none";
      if (ptzKo) ptzKo.style.display = ptz.eligible ? "none" : "";

      if (ptz.eligible) {
        set("ptz", euros(ptz.montant));
        set("ptz-tranche", "tranche " + ptz.tranche);
        set("ptz-quotite", Math.round(ptz.quotite * 100) + " %");
        set("ptz-plafond", euros(ptz.plafondOperation));
        set("ptz-base", euros(ptz.base));
        set("budget-total", euros(prixBien + ptz.montant));
        set("ptz-assiette", rfrSaisi
          ? "Calcul fondé sur le revenu fiscal de référence " + anneeRevenus + " que vous avez indiqué, soit " +
            euros(state.rfr) + "."
          : "Faute de revenu fiscal de référence renseigné, le calcul part de vos revenus nets annualisés (" +
            euros(revenuPtz) + "). L'administration retient le revenu fiscal de référence " + anneeRevenus +
            " : la tranche retenue peut changer.");
      } else if (ptzKo) {
        var motif = ptz.motif === "ressources"
          ? "Avec " + euros(revenuPtz) + (rfrSaisi ? " de revenu fiscal de référence " + anneeRevenus : " de revenus annuels") +
            " pour " + ptz.personnes + " personne" + (ptz.personnes > 1 ? "s" : "") + " en zone " + state.zone +
            ", vous dépassez le plafond de ressources du PTZ, fixé à " + euros(ptz.plafondRessources) + "."
          : "Le prêt à taux zéro est réservé aux primo-accédants qui achètent leur résidence principale dans le neuf. D'autres dispositifs peuvent s'appliquer à votre situation.";
        var motifEl = ptzKo.querySelector("[data-ptz-ko-text]");
        if (motifEl) motifEl.textContent = motif;
      }

      /* Résumé transmis au conseiller avec la réservation Calendly. */
      var lienRdv = form.querySelector("[data-rdv-simulation]");
      if (lienRdv) {
        var OBJECTIFS = { principale: "résidence principale", locatif: "investissement locatif" };
        var BIENS = {
          "appartement-neuf": "appartement neuf", "maison-neuve": "maison neuve",
          "ancien-travaux": "ancien avec travaux", ancien: "ancien sans travaux"
        };
        var commune = form.querySelector("[data-commune]");
        var nomCommune = commune && commune.selectedIndex > -1 && communeRow && communeRow.style.display !== "none"
          ? commune.options[commune.selectedIndex].text : "";
        var morceaux = [
          "Simulation Vefalys : " + OBJECTIFS[state.objectif] + ", " + BIENS[state.bien] +
            (state.primo === "oui" ? ", primo-accédant" : "") + ".",
          "Revenus " + euros(revenus) + " par mois" + (charges ? ", crédits en cours " + euros(charges) + " par mois" : "") +
            ", apport " + euros(apport) + ", prêt sur " + duree + " ans.",
          "Budget estimé " + euros(prixBien) + ", capacité d'emprunt " + euros(capacite) + "."
        ];
        if (ptz.eligible) {
          morceaux.push("PTZ estimé " + euros(ptz.montant) + " (tranche " + ptz.tranche + ", zone " + state.zone +
            (nomCommune ? ", " + nomCommune : "") + ", " + state.personnes + " personne" + (state.personnes > 1 ? "s" : "") + ").");
        }
        lienRdv.href = "contact.html?sim=" + encodeURIComponent(morceaux.join(" ")) + "#rdv";
      }

      var restart = form.querySelector("[data-sim-restart]");
      if (restart) {
        restart.onclick = function () { show(0); };
      }
    }
  });
})();
