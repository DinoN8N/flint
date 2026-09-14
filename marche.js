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
  window.flMarcheDetail = function (s, K, DBref) {
    try {
      if (!s || s.type === 'nap') return null;
      if (String(s.name || s.nom || '') !== 'Marche') return null;

      var deb = (s.startMin != null) ? +s.startMin : null;
      var fin = (s.endMin != null) ? +s.endMin : (deb != null && s.dur ? deb + (+s.dur) : null);
      if (deb == null || fin == null || fin <= deb) return null;

      var S = DBref || null;
      if (!S) return null;
      var w = null;
      try { w = S.get('watch_' + K, null); } catch (e) { w = null; }

      var couv = couvertureFc(S, K, deb, fin, w);

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
        jour: jour
      };
    } catch (e) {
      try { console.warn('[flint] flMarcheDetail a levé : ' + ((e && e.message) || e)); } catch (_) {}
      return null;
    }
  };
})();
