/* ════════════════════════════════════════════════════════════════════════════
   CE QUE FLINT SAIT D'UNE SÉANCE DE RÉCUPÉRATION — et rien d'autre.

   POURQUOI CE FICHIER EXISTE. Un sauna, un bain froid, une méditation ne sont
   pas des efforts : la fiche d'effort leur collait une note /20, des calories
   et des zones d'effort — trois contresens sur une séance dont le but est de
   faire DESCENDRE le cœur. Décision de Dino, 25 août : les activités que le
   catalogue range en `recup` ont leur propre fiche, et elle répond à une seule
   question — « est-ce que ça t'a vraiment détendu ? ».

   LES ZONES DE REDESCENTE NE SONT PAS DES SEUILS ABSOLUS. « Zone 1 à 110,
   zone 2 à 100 » serait faux pour un cœur entraîné : un repos à 50 atteint le
   calme à 60, un repos à 70 ne l'atteint qu'à 80. Les cinq paliers se posent
   donc sur la FC DE REPOS du jour — la même source que Banister, les zones
   d'effort et la détection de séances (`flFcRepos`) — par tranches de 10 bpm :

        Éveillé          > repos + 30
        Relâchement        repos + 20 … + 30
        Détente            repos + 10 … + 20
        Calme              repos      … + 10
        Calme profond    ≤ repos

   RÈGLE DE CE FICHIER : il ne rend que du mesuré. Ce qui manque rend `null`,
   jamais zéro, et l'écran sait se taire. Le repli du repos est lui-même une
   mesure (p05 du jour) — jamais une constante inventée.
   ════════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  function mediane(a) {
    if (!a || !a.length) return null;
    var s = a.slice().sort(function (x, y) { return x - y; });
    var m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }

  var NOMS = ['Calme profond', 'Calme', 'Détente', 'Relâchement', 'Éveillé'];

  /* Les cinq zones NUES — bornes sans minutes. Elles existent dès que le
     repos est connu : même une séance sans mesure enseigne ses paliers. */
  function zonesNues(repos) {
    return [4, 3, 2, 1, 0].map(function (z) {
      return {
        id: z + 1, nom: NOMS[z],
        bas: (z === 0 ? null : repos + (z - 1) * 10),
        haut: (z === 4 ? null : repos + z * 10),
        minutes: null, part: null
      };
    });
  }

  /* L'indice de la zone pour un bpm donné — 0 = Calme profond … 4 = Éveillé.
     L'ordre suit la PROFONDEUR du calme : c'est lui que l'écran numérote. */
  function zoneDe(b, repos) {
    if (b <= repos) return 0;
    if (b <= repos + 10) return 1;
    if (b <= repos + 20) return 2;
    if (b <= repos + 30) return 3;
    return 4;
  }

  /* Le jour K en décalage par rapport à aujourd'hui — pour interroger
     `flStressJour`, qui ne parle qu'en offsets. Minuit contre minuit : un
     changement d'heure au milieu ne décale pas le compte d'un jour. */
  function offDe(K) {
    try {
      var p = String(K).split('-');
      var d = new Date(+p[0], +p[1] - 1, +p[2]);
      var t = new Date(); t = new Date(t.getFullYear(), t.getMonth(), t.getDate());
      return Math.round((d - t) / 86400000);
    } catch (e) { return null; }
  }

  /* La moyenne de l'indice de stress sur une fenêtre de minutes du jour.
     Quatre mesures minimum : deux points isolés ne font pas un état. */
  function stressMoy(off, a, b) {
    if (off == null || typeof window.flStressJour !== 'function') return null;
    var j = null;
    try { j = window.flStressJour(off, true); } catch (e) { return null; }
    if (!j || !j.aDesDonnees) return null;
    var v = [];
    (j.points || []).forEach(function (x) {
      if (x && x[1] != null && x[0] >= a && x[0] <= b) v.push(x[1]);
    });
    if (v.length < 4) return null;
    return Math.round((v.reduce(function (p, c) { return p + c; }, 0) / v.length) * 100) / 100;
  }

  /* ══════════════════════════════════════════════════════════════════════════
     LE DÉTAIL D'UNE SÉANCE DE RÉCUPÉRATION. Rend `null` pour tout le reste —
     et c'est LUI qui décide de la fiche, exactement comme `flMarcheDetail` :
     une charge qui porte `recup` ouvre la fiche Récup, une charge qui ne la
     porte pas garde sa fiche d'effort. Pas de seuil, pas de bascule : la
     catégorie vit déjà dans le catalogue (`FL_ACT_CAT`), le nom est la clé.

     Le dépôt se PASSE (DBref), il ne se devine pas — la leçon de marche.js.
     ══════════════════════════════════════════════════════════════════════════ */
  window.flRecupDetail = function (s, K, DBref) {
    try {
      if (!s || s.type === 'nap') return null;
      var nom = String(s.name || s.nom || '');
      var cat = null;
      var C = window.FL_ACT_CAT;
      if (C && C.length) for (var i = 0; i < C.length; i++) {
        if (C[i] && C[i].n === nom) { cat = C[i].cat; break; }
      }
      if (cat !== 'recup') return null;

      var deb = (s.startMin != null) ? +s.startMin : null;
      var fin = (s.endMin != null) ? +s.endMin : (deb != null && s.dur ? deb + (+s.dur) : null);
      if (deb == null || fin == null || fin <= deb) return null;
      /* 14 sept. 2026 — LA FENÊTRE VA JUSQU'À LA FIN RÉELLE, ARRÊT COMPRIS.
         Depuis que les arrêts du tracker voyagent, `endMin` n'est plus
         `startMin + dur` : la durée d'EFFORT est `s.dur`, et c'est elle qu'on
         veut ici. Prendre `fin - deb` compterait les minutes assises. */
      var dur = (+s.dur > 0) ? +s.dur : (fin - deb);

      /* LE REPOS DE RÉFÉRENCE — la même source que tout le reste de l'app,
         sinon la fiche décrirait un autre corps que les zones d'effort. */
      var rep = null, repos = null, reposSrc = null;
      try { rep = (typeof window.flFcRepos === 'function') ? window.flFcRepos(K) : null; } catch (e) { rep = null; }
      if (rep && rep.v > 0) { repos = Math.round(rep.v); reposSrc = rep.src || 'jour'; }
      if (repos == null) {
        try {
          var w0 = (typeof window.watchOf === 'function') ? window.watchOf(K) : null;
          if (w0 && w0.hr && typeof window.p05 === 'function') {
            var p = window.p05(w0.hr);
            if (p > 0) { repos = Math.round(p); reposSrc = 'p05'; }
          }
        } catch (e) {}
      }

      /* LES POINTS DE LA SÉANCE — le canal éveil, celui des zones d'effort.
         Chaque point : [minuteDuJour, bpm], cadence variable (5 s quand le
         canal fin existe). */
      var pts = null;
      try { pts = (typeof window.flPtsEveil === 'function') ? window.flPtsEveil(K) : null; } catch (e) { pts = null; }
      var sel = [];
      (pts || []).forEach(function (x) {
        if (x && x[1] > 0 && x[0] >= deb && x[0] <= fin) sel.push(x);
      });

      var out = {
        debutMin: deb, finMin: fin,
        repos: repos, reposSource: reposSrc,
        fcDebut: null, fcFin: null, delta: null, fcMin: null,
        decrochageMin: null, pctCalme: null, couverture: null,
        zones: null, stressAvant: null, stressApres: null
      };

      if (sel.length >= 5) {
        /* Le poids de chaque point suit la cadence locale — la règle v1665 :
           un silence n'est pas crédité à la dernière zone connue. */
        var couvMin = null, parZone = [0, 0, 0, 0, 0], calmeMin = 0;
        if (typeof window.flPoids === 'function') {
          var pd = window.flPoids(sel.map(function (x) { return [x[0] * 60, x[1]]; }));
          var couv = 0;
          sel.forEach(function (x, j2) {
            var dt = pd.poids[j2] / 60;
            couv += dt;
            if (repos != null) {
              var z = zoneDe(x[1], repos);
              parZone[z] += dt;
              if (z <= 1) calmeMin += dt;
            }
          });
          couvMin = couv;
        }
        if (couvMin != null && couvMin > 0) {
          out.couverture = Math.round(Math.min(1, couvMin / dur) * 100) / 100;
          if (repos != null) {
            out.pctCalme = Math.round(Math.min(1, calmeMin / couvMin) * 100) / 100;
            out.zones = zonesNues(repos).map(function (zo) {
              var z = zo.id - 1;
              zo.minutes = Math.round(parZone[z] * 10) / 10;
              zo.part = Math.round((parZone[z] / couvMin) * 100) / 100;
              return zo;
            });
          }
        }

        /* LE DÉBUT ET LA FIN — médianes des trois premières et trois dernières
           minutes couvertes. La médiane encaisse un artefact isolé là où la
           moyenne le boit. */
        var tetes = [], queues = [];
        sel.forEach(function (x) {
          if (x[0] < deb + 3) tetes.push(x[1]);
          if (x[0] > fin - 3) queues.push(x[1]);
        });
        if (tetes.length < 3) tetes = sel.slice(0, 6).map(function (x) { return x[1]; });
        if (queues.length < 3) queues = sel.slice(-6).map(function (x) { return x[1]; });
        if (tetes.length >= 3 && queues.length >= 3) {
          out.fcDebut = Math.round(mediane(tetes));
          out.fcFin = Math.round(mediane(queues));
          out.delta = out.fcFin - out.fcDebut;
        }

        /* LE PLUS BAS, par minute : la médiane de chaque minute couverte, puis
           le minimum — un creux d'un seul échantillon n'est pas un état. */
        var buckets = {};
        sel.forEach(function (x) {
          var m = Math.floor(x[0]);
          (buckets[m] = buckets[m] || []).push(x[1]);
        });
        var mins = Object.keys(buckets).map(Number).sort(function (a, b2) { return a - b2; });
        var minVal = null;
        mins.forEach(function (m) {
          var v = mediane(buckets[m]);
          if (minVal == null || v < minVal) minVal = v;
        });
        if (minVal != null) out.fcMin = Math.round(minVal);

        /* LE DÉCROCHAGE : la première minute au calme (≤ repos + 10) CONFIRMÉE
           par la minute couverte suivante — un point qui passe la barre une
           fois n'a pas décroché. */
        if (repos != null) {
          for (var q = 0; q < mins.length - 1; q++) {
            var v1 = mediane(buckets[mins[q]]), v2 = mediane(buckets[mins[q + 1]]);
            if (v1 <= repos + 10 && v2 <= repos + 12) {
              out.decrochageMin = Math.max(0, mins[q] - Math.floor(deb));
              break;
            }
          }
        }
      }

      /* Sans mesure, les zones restent : les bornes sont un fait du repos,
         pas de la séance — et l'écran a quelque chose de juste à enseigner. */
      if (out.zones == null && repos != null) out.zones = zonesNues(repos);

      /* LE STRESS AUTOUR DE LA SÉANCE — l'indice de la montre (0-3), moyenné de
         45 à 3 min AVANT le début, puis de 3 à 45 min APRÈS la fin : 42 minutes
         de chaque côté, les 3 minutes collées à la séance mises de côté. Ce
         commentaire disait « la demi-heure » et la carte de l'écran aussi : tous
         deux faux, corrigés le 14 sept. 2026 — les bornes, elles, ne bougent
         pas (changer la fenêtre serait choisir un seuil, et un seuil ne se
         choisit pas sur un seul corps). Null si la montre n'a pas assez mesuré
         d'un côté : un effet ne se mesure que des deux côtés. */
      var off = offDe(K);
      var avant = stressMoy(off, deb - 45, deb - 3);
      var apres = stressMoy(off, fin + 3, fin + 45);
      if (avant != null && apres != null) { out.stressAvant = avant; out.stressApres = apres; }

      return out;
    } catch (e) {
      try { console.warn('[flint] flRecupDetail a levé : ' + ((e && e.message) || e)); } catch (_) {}
      return null;
    }
  };
})();
