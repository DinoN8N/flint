/* Le métier de ce fichier : LA VO₂ MAX DU BRACELET — sa valeur d'un jour, la
   dernière connue, et sa semaine. Rien d'autre : l'ordre des sources (mesure
   saisie, bracelet, estimation) vit dans `flVo2Max` (index.html), qui appelle
   `flVo2BraceletRecent` juste après la mesure saisie.

   Liaisons de script : `DB` et `tk` se lisent NUS (garde-liaisons) ; `watchOf`
   et `flCleJourCourant` vivent ailleurs et se testent par `typeof`.
   Banc : tests/test-vo2-bracelet.js.

   ═══ 23 nov. 2026 — LE BRACELET CALCULE SA VO₂ MAX, ET PERSONNE NE LA LISAIT ═══

   Dino, devant l'écran VO₂ max de l'app Fitcare (17-23 nov. : 60, 60, 62, 62,
   54, 53, 62 — « 53-62 », moyenne 59) : « eux, ils ont l'air de faire un vrai
   calcul ». C'est le bracelet qui le fait : un fichier `.vo2max` par jour, et
   « VO2max » dans l'instantané de l'objet 95. FLINT le reçoit depuis le 27 oct.
   et le range dans `watch_<jour>.vo2maxEnAttente` (paires [minute, valeur],
   index.html, branche `vo2max`) — « rangé, pas encore lu ». `flVo2Max` rendait
   l'estimation d'Uth et Sørensen (15 × FCmax ÷ FC de repos de nuit).
   Décision (comme la VFC du 21 nov.) : on sert le chiffre du bracelet.

   À QUEL JOUR APPARTIENT LA VALEUR — lu dans le journal du téléphone, logiciel
   2.3.7 : le fichier NOMMÉ `20261123.vo2max` porte UN segment daté
   « dès 22/11 00:00, pas 86400 s » ; `20261122.vo2max` → 21/11 ; `20261121` →
   20/11. Et la valeur est la DERNIÈRE de la journée datée : l'instantané en
   direct disait 61-64 l'après-midi du 22 et 62 le soir → le segment du 22 vaut
   62 ; 57-58 le 21 après-midi, 53 à 23 h 27 → 53 ; 62 à 13 h 49 le 20, 54 à
   21 h 10 → 54. Le moteur range au jour de l'HORODATAGE (22 → 62) : c'est juste.
   L'app Fitcare, elle, affiche chaque valeur au jour du NOM DE FICHIER (le
   lendemain) : son « 23 = 62 » est la valeur du 22, son « 22 = 53 » celle du 21.
   Rien à corriger de notre côté. Conséquence : la valeur d'un jour n'arrive
   qu'avec le fichier du lendemain — le jour même, on sert la dernière connue. */
'use strict';

  window.FL_VO2_BRACELET = { MIN: 15, MAX: 90, RECUL: 7 };

  function _jour(K) {
    try {
      var w = (typeof watchOf === 'function') ? watchOf(K) : null;
      if (!w && typeof DB !== 'undefined' && DB && DB.get) w = DB.get('watch_' + K, null);
      return w || null;
    } catch (e) { return null; }
  }
  function _cle(o) {
    return ((typeof window.flCleJourCourant === 'function') ? window.flCleJourCourant : tk)(o);
  }

  /* La VO₂ max que le bracelet a donnée POUR ce jour : la dernière valeur
     vraisemblable du champ, ou null. Un autre bracelet n'écrit pas ce champ. */
  window.flVo2BraceletJour = function (K) {
    try {
      var w = _jour(K), a = w && w.vo2maxEnAttente, P = window.FL_VO2_BRACELET;
      if (!Array.isArray(a) || !a.length) return null;
      for (var i = a.length - 1; i >= 0; i--) {
        var v = a[i] && +a[i][1];
        if (isFinite(v) && v >= P.MIN && v <= P.MAX) return Math.round(v);
      }
      return null;
    } catch (e) { return null; }
  };

  /* La valeur à servir pour le jour `off` : celle du jour, sinon la plus
     récente des `RECUL` jours d'avant (la valeur d'un jour n'arrive qu'avec le
     fichier du lendemain). { v, K, age } ou null. */
  window.flVo2BraceletRecent = function (off) {
    try {
      var o = Math.min(0, off | 0), P = window.FL_VO2_BRACELET;
      for (var i = 0; i < P.RECUL; i++) {
        var K = _cle(o - i), v = window.flVo2BraceletJour(K);
        if (v != null) return { v: v, K: K, age: i };
      }
      return null;
    } catch (e) { return null; }
  };

  /* La semaine, comme l'écran de l'app Fitcare : les jours `off`-6 … `off`,
     leur moyenne et leur étendue. null sans aucune valeur. */
  window.flVo2Semaine = function (off) {
    try {
      var o = Math.min(0, off | 0), jours = [], s = 0, mn = null, mx = null;
      for (var i = 6; i >= 0; i--) {
        var K = _cle(o - i), v = window.flVo2BraceletJour(K);
        jours.push({ K: K, v: v });
        if (v == null) continue;
        s += v; mn = (mn == null || v < mn) ? v : mn; mx = (mx == null || v > mx) ? v : mx;
      }
      var n = jours.filter(function (j) { return j.v != null; }).length;
      if (!n) return null;
      return { n: n, moy: Math.round(s / n), min: mn, max: mx, jours: jours };
    } catch (e) { return null; }
  };

  /* ═══ 23 nov. 2026 (suite) — CE QUE LA PAGE MESURES DIT DE LA VO₂ MAX ══════════════════════
     Dino a aimé, sur l'écran Fitcare, la plage de la semaine et la moyenne. La page Mesures
     (MesuresView.swift) dit déjà d'où vient le chiffre (« Mesuré » / « Estimé par l'app ») :
     elle apprend la troisième source, « Du bracelet », et reçoit la semaine pour une ligne
     discrète « 7 jours : 53 à 62 · moyenne 59 ». Même ordre que `flVo2Max` : une mesure
     saisie passe devant tout, et alors la semaine du bracelet ne se montre pas.
     Rend { source: 'mesure' | 'bracelet' | 'estimation' | null, semaine: {n, moy, min, max} | null }. */
  window.flVo2Provenance = function (off) {
    try {
      var p = (typeof getProfile === 'function' ? getProfile() : null) || {};
      var mes = +p.vo2Mesure || 0;
      if (mes >= 15 && mes <= 90) return { source: 'mesure', semaine: null };
      var b = window.flVo2BraceletRecent(off);
      if (b && b.v != null) {
        var s = window.flVo2Semaine(off);
        return { source: 'bracelet', semaine: (s && s.n >= 2) ? { n: s.n, moy: s.moy, min: s.min, max: s.max,
          /* 23 nov. 2026 (soir) — les sept jours, pour la mini-courbe de la rangée VO₂ max (MesuresView) */
          points: s.jours.map(function (j) { return j.v; }) } : null };
      }
      var v = (typeof window.flVo2Max === 'function') ? window.flVo2Max(off) : null;
      return { source: v != null ? 'estimation' : null, semaine: null };
    } catch (e) { return { source: null, semaine: null }; }
  };
