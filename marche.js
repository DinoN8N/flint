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

  /* ═══ LE TOTAL DE PAS D'UNE JOURNÉE — CELUI QUE L'ACCUEIL AFFICHE ══════

     Une part se rapporte au total que l'écran d'accueil montre, sinon la fiche
     et l'accueil parlent de deux journées différentes pour la même date. Ce
     total a un seul auteur dans la maison : `window.flStepsOf`, qui somme les
     blocs du bracelet par `flPas.journee` et arbitre avec Apple Santé
     (index.html, 4 sept. 2026). On ne le recalcule pas, on le lui demande.

     TROIS MARCHES, DU PLUS SU AU MOINS SU. Sans le lecteur de l'app — module
     rejoué hors navigateur, web servi périmé — on somme les blocs soi-même ;
     sans pas.js, il ne reste que le compteur du bracelet, l'ancien
     comportement, qui vaut mieux qu'une fiche muette.

     ET LE COMPTEUR EN DERNIER, PARCE QUE C'EST LUI LE DÉFAUT DU 20 SEPTEMBRE
     2026. Dino : « à chaque fois que je marche, on me dit que les pas
     représentent 100 % de ma journée ». `watch_<K>.steps` est un RÉSUMÉ que le
     bracelet pousse de loin en loin, pas la somme de ce qu'il a mesuré, et sur
     le jour EN COURS il traîne. Mesuré sur les relevés, compteur contre blocs
     `actDet` :

       2 sept. à 12h51 — compteur 1, blocs 1 690
       3 sept. à 14h42 — compteur 767, blocs 2 689
       16 sept. au matin — compteur 1, blocs 25

     Une marche de 2 000 pas divisée par 767 sature le `min(1, …)` : la fiche
     annonçait « 100 % · sur 767 pas dans la journée ». Les journées FINIES,
     elles, s'accordent à moins de 1 % (452 journées-bracelet, 7 désaccords) —
     c'est pourquoi le banc, qui ne rejoue que du fini, ne voyait rien.
     `flStepsOf` avait été corrigé le 4 septembre ; cette fiche-ci, non.

     ON PASSE PAR `window.` : un identifiant libre déclaré dans un AUTRE fichier
     est invisible au garde de portée, la propriété se lit. */
  function totalPasDuJour(w, K) {
    if (typeof window.flStepsOf === 'function') {
      try { var n = +window.flStepsOf(K); if (n > 0) return n; } catch (e) {}
    }
    if (window.flPas && typeof window.flPas.journee === 'function'
        && w && w.actDet && w.actDet.length) {
      try {
        var j = window.flPas.journee(w.actDet, K);
        if (j && j.pas > 0) return j.pas;
      } catch (e) {}
    }
    return (w && w.steps > 0) ? +w.steps : 0;
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

      /* 14 sept. 2026 — une séance mise en pause porte désormais sa fenêtre de MUR.
         La couverture est donc jugée sur un intervalle qui contient l'arrêt : elle
         paraît plus basse qu'elle n'est. C'est conservateur (on n'affirme jamais
         plus que ce qu'on a mesuré) et c'est dit ici plutôt que découvert plus tard.
         Le remède complet demande de passer `s.pauses` à `couvertureFc`. */
      var couv = couvertureFc(S, K, deb, fin, w);

      /* LA CONTRIBUTION À LA JOURNÉE. Le total des pas vient de `totalPasDuJour`
         — celui de l'accueil — et jamais du compteur brut du bracelet : c'est la
         correction du 20 septembre 2026, et elle vaut surtout pour le jour en
         cours. Les calories gardent le compteur : rien ne les affiche encore,
         et leur total a son propre moteur (`flCaloriesDetail`) qu'on n'ira pas
         appeler à l'aveugle d'ici. Sans total, pas de part — une part sur un
         total supposé ne veut rien dire. */
      var pasSeance = (s.pas != null) ? +s.pas : null;
      var pasJour = totalPasDuJour(w, K);
      var jour = null;
      if (pasJour > 0 || (w && w.kcal > 0)) {
        jour = {
          pasJour: (pasJour > 0 ? pasJour : null),
          kcalJour: (w && w.kcal > 0 ? w.kcal : null),
          partPas: (pasJour > 0 && pasSeance != null)
                     ? Math.min(1, pasSeance / pasJour) : null,
          partKcal: (w && w.kcal > 0 && s.kcal != null)
                     ? Math.min(1, (+s.kcal) / w.kcal) : null
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
