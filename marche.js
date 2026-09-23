/* ════════════════════════════════════════════════════════════════════════════
   CE QUE FLINT SAIT D'UNE MARCHE — et rien d'autre.

   POURQUOI CE FICHIER EXISTE. Une Marche est la seule activité que FLINT
   détecte TOUTE SEULE, et c'est la seule qui a sa propre fiche. Toutes les
   autres — Badminton, Randonnée, Renforcement — gardent la fiche d'effort avec
   sa courbe et ses zones. Décision de Dino, 22 août.

   PAS DE COURBE CARDIAQUE SUR UNE MARCHE. Hors mode séance la montre ne mesure
   que 43 % du temps — jour et nuit, en marchant ou en dormant — et 99 % de ses
   trous coupent le trait. Le graphe faisait quatorze morceaux et promettait une
   continuité qui n'existe pas. Détail dans RAPPORT-MARCHES-AUTO.md.

   PAS DE DISTANCE, PAS D'ALLURE. La distance du bracelet a été confrontée au
   GPS sur les trois seules fenêtres où les deux mesures existent (traces
   fiables, 3 000 points, ±4,5 m) : −1 %, +1 %, et +11 %. Deux fois excellente,
   une fois fausse d'un neuvième, et aucun des trois cas n'était une marche.
   Règle de Dino : soit c'est prouvé, soit ça ne s'affiche pas. Ce n'est pas
   prouvé. La recette du calcul reste au rapport si un jour on peut la valider.

   CE QUI RESTE, ET QUI EST TOUT CE QUE LA FICHE MONTRE :
     la durée · les pas · les calories · la part des pas du jour · la FC moyenne

   Les quatre premiers vivent déjà dans la charge de `flActiviteData`. Ce module
   ne sert donc qu'aux deux choses qu'elle ne porte pas : la part de la journée,
   et ce que vaut la moyenne cardiaque.

   RÈGLE DE CE FICHIER : il ne rend que du mesuré. Ce qui manque rend `null`,
   jamais zéro, et l'écran sait se taire.
   ════════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* LA COUVERTURE CARDIAQUE RÉELLE — ce qui décide de ce que vaut la moyenne.
     On compte en CASES DE CINQ SECONDES quand le canal fin existe (douze cases
     font une minute pleine), en minutes sinon. Une moyenne posée sur trois
     minutes mesurées d'une marche d'une demi-heure n'est pas la moyenne de la
     marche, et l'écran doit pouvoir le dire. */
  function couvertureFc(S, K, debMin, finMin, w) {
    var dur = finMin - debMin;
    if (dur <= 0) return null;
    var fine = null;
    try { fine = S.get ? S.get('hrfine_' + K, null) : null; } catch (e) { fine = null; }
    if (fine) {
      var n = 0;
      for (var m = debMin; m < finMin; m++) {
        var e = fine[m] || fine[String(m)];
        if (!Array.isArray(e)) continue;
        for (var i = 0; i < e.length; i++) if (Array.isArray(e[i]) && e[i][1] > 0) n++;
      }
      return { part: Math.min(1, n / (dur * 12)), canal: '5s', points: n };
    }
    if (w && w.hr && w.hr.length) {
      var vus = 0;
      w.hr.forEach(function (x) {
        if (x && x.length > 1 && x[1] > 0 && x[0] >= debMin && x[0] < finMin) vus++;
      });
      return { part: Math.min(1, vus / dur), canal: 'minute', points: vus };
    }
    return null;
  }

  /* ══════════════════════════════════════════════════════════════════════════
     LE DÉTAIL D'UNE MARCHE. Rend `null` pour tout le reste — et c'est LUI qui
     décide de la fiche : une charge qui porte `marche` ouvre la fiche Marche,
     une charge qui ne la porte pas ouvre la fiche d'effort. Pas de seuil, pas
     de bascule : la Marche est la seule activité détectée automatiquement, elle
     est la seule à avoir cette fiche.

     LE DÉPÔT SE PASSE, IL NE SE DEVINE PAS. Ce module a lu `window.DB` pendant
     une version : ça marchait au banc et nulle part ailleurs, parce que `DB` est
     un `const` d'index.html et qu'une liaison lexicale de haut niveau n'est pas
     une propriété de `window`. Le banc, lui, posait `global.DB` — il mesurait un
     monde qui n'existe pas.
     ══════════════════════════════════════════════════════════════════════════ */
  /* LA MONTRE ÉTAIT-ELLE EN MODE SPORT ? Vrai quand quelqu'un a OUVERT la
     séance — la montre elle-même (`src:'montre'`), le tracker (`gps`), ou Dino
     (`auto:false`, une saisie). Une séance FUSIONNÉE garde ses provenances
     dans `srcs` : `srcs.user` est la réponse au menu « c'était quoi ? », ce
     n'est pas un lancement, elle ne compte pas. */
  function suivie(s) {
    if (!s) return false;
    if (s.src === 'montre' || s.gps || s.auto === false) return true;
    var r = s.srcs;
    if (r && typeof r === 'object' && (r.montre || r.tracker || r.saisie)) return true;
    return false;
  }
  /* Détectée par le moteur, et par personne d'autre. */
  function sansSuivi(s) {
    if (!s || suivie(s)) return false;
    return s.auto === true || !!(s.srcs && typeof s.srcs === 'object' && s.srcs.auto);
  }
  function hhmm(m) {
    m = Math.max(0, Math.round(m)) % 1440;
    return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
  }
  /* LE PLUS HAUT ET LE PLUS BAS, sur la série de la MINUTE — la même que la
     couverture compte, nettoyée par `flHrPropre` quand le moteur la sert
     (les minutes recollées, celles dont les échantillons se contredisent, en
     sortent : c'est le filtre du maximum de la fiche d'effort). Chacun porte
     son heure : un maximum sans son instant se lit comme une moyenne. */
  function extremes(w, debMin, finMin) {
    if (!w || !w.hr || !w.hr.length) return null;
    var hr = w.hr;
    try { if (typeof window.flHrPropre === 'function') hr = window.flHrPropre(hr) || hr; } catch (e) {}
    var hi = null, lo = null;
    hr.forEach(function (x) {
      if (!x || x.length < 2 || !(x[1] > 0) || x[0] < debMin || x[0] >= finMin) return;
      if (!hi || x[1] > hi[1]) hi = x;
      if (!lo || x[1] < lo[1]) lo = x;
    });
    if (!hi) return null;
    return { max: Math.round(hi[1]), maxHeure: hhmm(hi[0]),
             min: Math.round(lo[1]), minHeure: hhmm(lo[0]) };
  }

  window.flMarcheDetail = function (s, K, DBref) {
    try {
      if (!s || s.type === 'nap') return null;
      /* 20 sept. 2026 — LA FICHE SUIT LA MATIÈRE, PAS LE MOT. Le détecteur
         nomme « Activité » ce dont il doute. C'est le MÊME segment, mesuré de la
         même façon — durée, pas, calories, cœur — et il n'y a rien d'autre à
         en montrer : surtout pas la fiche d'effort, dont la courbe mentirait
         sur 34 % de couverture cardiaque. Les deux noms ouvrent donc cette
         fiche-ci ; le titre, lui, dit lequel des deux c'est. */
      var _nom = String(s.name || s.nom || '');
      /* ═══ 22 sept. 2026 — LA FICHE SUIT LA PROVENANCE, PAS LE MOT ═══════════
         La règle du 20 sept. disait « la fiche suit la matière » et jugeait
         encore sur le NOM : une séance détectée sans mode sport, nommée
         « Musculation » par le menu « c'était quoi ? », perdait cette fiche et
         retrouvait la courbe et les six zones — sur la même mesure, faite de
         la même façon. Dino, deux captures à l'appui : trois grappes de pics
         en seize minutes, cinq zones à 0 %. « Ne pas mettre de courbe, ne pas
         mettre les zones sur les sessions où le mode sport n'était pas activé.
         Mais un truc qui est quand même relevant de l'effort : le point le
         plus haut, le plus bas, les calories. »

         LA PROVENANCE EST UN FAIT, PAS UN SEUIL. Une séance porte d'où elle
         vient : `src:'montre'` (la montre l'a enregistrée en mode sport),
         `gps` (le tracker), `auto:false` (lancée ou saisie par Dino), ou
         `auto:true` / `srcs.auto` (détectée par le moteur, montre au régime
         ordinaire). Sur l'export du 15 sept. les quatre familles se séparent
         sans un seul cas ambigu. Un seuil de couverture aurait été un nombre
         choisi — et la couverture à la minute d'une séance détectée est
         souvent BONNE (85 % de médiane) : ce n'est pas elle qui manque, c'est
         la mesure continue que seul le mode sport garantit.

         Le nom reste une porte : une « Marche » saisie à la main garde sa
         fiche, comme avant. */
      if (_nom !== 'Marche' && _nom !== 'Activité' && !sansSuivi(s)) return null;

      var deb = (s.startMin != null) ? +s.startMin : null;
      var fin = (s.endMin != null) ? +s.endMin : (deb != null && s.dur ? deb + (+s.dur) : null);
      if (deb == null || fin == null || fin <= deb) return null;

      var S = DBref || null;
      if (!S) return null;
      var w = null;
      try { w = S.get('watch_' + K, null); } catch (e) { w = null; }

      /* 14 sept. 2026 — une séance mise en pause porte désormais sa fenêtre de MUR.
         La couverture est donc jugée sur un intervalle qui contient l'arrêt : elle
         paraît plus basse qu'elle n'est. C'est conservateur (on n'affirme jamais
         plus que ce qu'on a mesuré) et c'est dit ici plutôt que découvert plus tard.
         Le remède complet demande de passer `s.pauses` à `couvertureFc`. */
      var couv = couvertureFc(S, K, deb, fin, w);
      var ext = extremes(w, deb, fin);

      /* LA CONTRIBUTION À LA JOURNÉE. Les totaux du jour viennent du bracelet
         (`steps`, `kcal`) : on ne les recalcule pas, on s'y rapporte. Sans eux,
         pas de part — une part sur un total supposé ne veut rien dire. */
      var pasSeance = (s.pas != null) ? +s.pas : null;
      var jour = null;
      if (w && (w.steps > 0 || w.kcal > 0)) {
        jour = {
          pasJour: (w.steps > 0 ? w.steps : null),
          kcalJour: (w.kcal > 0 ? w.kcal : null),
          partPas: (w.steps > 0 && pasSeance != null) ? Math.min(1, pasSeance / w.steps) : null,
          partKcal: (w.kcal > 0 && s.kcal != null) ? Math.min(1, (+s.kcal) / w.kcal) : null
        };
      }

      return {
        /* les bornes, en minutes du jour : l'écran y place la marche dans les
           vingt-quatre heures. Ce sont des instants MESURÉS, pas une estimation. */
        debutMin: deb,
        finMin: fin,
        /* LA COUVERTURE VOYAGE AVEC LA FC. C'est elle qui décide, côté écran, de
           ce qu'on a le droit de dire de la moyenne. */
        fcCouverture: couv ? Math.round(couv.part * 100) / 100 : null,
        fcCanal: couv ? couv.canal : null,
        fcPoints: couv ? couv.points : null,
        /* 22 sept. 2026 — la montre n'était pas en mode sport : la fiche le
           DIT, et c'est ce qui lui interdit courbe et zones. Faux pour une
           Marche saisie à la main ; l'écran ne change alors rien. */
        sansSuivi: sansSuivi(s),
        fcMax: ext ? ext.max : null,
        fcMaxHeure: ext ? ext.maxHeure : null,
        fcMin: ext ? ext.min : null,
        fcMinHeure: ext ? ext.minHeure : null,
        jour: jour
      };
    } catch (e) {
      try { console.warn('[flint] flMarcheDetail a levé : ' + ((e && e.message) || e)); } catch (_) {}
      return null;
    }
  };
})();
