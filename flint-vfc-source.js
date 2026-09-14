/* Le métier de ce fichier : LA PROVENANCE DE LA VFC — notre RMSSD, la médiane de
   la puce, et le DÉSACCORD entre les deux, noté sur chaque nuit.

   Liaisons de script : `tk` se lit NU (garde-liaisons) ; `watchOf`, `wSaveK` et
   `flRmssdNuit` vivent dans index.html et se testent par `typeof`. Le banc :
   tests/test-vfc-source.js (sections 5 et 6).

   ═══ CE QUE CE FICHIER A CRU, ET CE QUE LE TÉMOIN A DIT ═════════════════════

   GÉN. 12-13 (7 sept, matin) : le rapport RMSSD/puce était pris pour une
   constante d'instrument (1,130 ± 0,030) ; hors bande, la PUCE servait — le
   5 sept (81 contre 65) et le 6 (85 contre 64) ont été rendus à la puce.

   GÉN. 14 (7 sept, soir) : l'export WHOOP du jour porte la VFC de ces nuits.
       5 sept  WHOOP 81   nous 81   puce 65
       6 sept  WHOOP 87   nous 85   puce 64
       7 sept  WHOOP 79   nous 76   puce 62
       24 août WHOOP 80   nous 86   puce 64   (la « nuit d'avion »)
   Sur sept nuits témoins : notre RMSSD à Malik 20 %, biais -0,8 / MAE 2,8 ;
   la puce, biais -12,9. LE RMSSD ÉTAIT JUSTE, LA PUCE SOUS-LIT DE ~13 %, ET
   LA RÈGLE AVAIT REMPLACÉ TROIS VALEURS JUSTES PAR TROIS VALEURS FAUSSES.
   Le rapport n'a jamais été une constante : il suit la part de pas R-R de
   100 à 240 ms que Malik accepte — à 10 % on DEVIENT la puce. C'est un indice
   de fragmentation, et cette fragmentation était de la physiologie : Dino
   avait vraiment une VFC haute. Dossier : outils/mesure-fragmentation-rr.js,
   AUDIT-SCORES-VS-WHOOP-4-SEPT.md §14-15.

   CE QUE LA RÈGLE MASQUAIT PAR ACCIDENT, et qui est le vrai sujet : une
   normale RMSSD de onze nuits calmes (64,7 ± 7,1 — WHOOP sur les mêmes onze :
   65,0 ± 6,5, elle est JUSTE) dans laquelle 81 ms vaut +2,3 σ, quand la
   normale de 60 jours de WHOOP (68,3 ± 8,7) le met à +1,5. La normale n'est
   pas fausse, elle est JEUNE — et exclure les nuits hautes de la normale
   (ce que la gén. 12 faisait par la provenance) l'empêchait de mûrir. Elle
   mûrit toute seule si on la laisse : les 5, 6 et 7 y entrent à leur vraie
   valeur.

   ═══ CE QUE CE FICHIER FAIT DÉSORMAIS ══════════════════════════════════════

   `flVfcRetenue(rmssd, puce, K, w)` rend TOUJOURS le RMSSD, avec `desaccord`
   (l'écart du rapport à la bande robuste du poignet, en σ) — un indicateur de
   fragmentation de la nuit, consultable, jamais un motif de substitution.
   Sur un résumé figé, il COMPLÈTE (puce, desaccord) une fois, et il RESTAURE
   un résumé que la gén. 13 avait basculé sur la puce (`src:'puce'` avec
   `rmssd`) : la valeur brute reprend sa place, `src` redevient `rmssd`, la
   puce et le désaccord restent lisibles. Un résumé restauré ne repasse pas.

   RÈGLE POUR LA SUITE, écrite ici parce qu'elle a coûté deux générations :
   on ne remplace jamais une mesure par une autre sur un accord avec le SCORE
   d'un témoin. On la juge sur la MESURE du témoin, ou on ne la juge pas. */

/* LA MÉDIANE DE LA PUCE SUR LA NUIT — le même calcul que dans `sensorOf`,
   exposé pour que la bande le lise sans passer par `sensorOf` (qui appliquerait
   le verdict : la bande se calculerait sur ce qu'elle doit juger). */
window.flPuceNuit = function (w) {
  try {
    if (!w || !w.hrvMontre || !w.hrvMontre.length) return null;
    /* ═══ 14 sept. 2026 — LE REPLI SUR LA JOURNÉE ENTIÈRE EST RETIRÉ ══════════
       La ligne disait « la nuit si elle porte au moins trois mesures, TOUTE LA
       JOURNÉE sinon » — ici et, mot pour mot, dans `sensorOf`. Elle
       contredisait le pavé v1224 qui surplombe l'original (« la variabilité de
       la NUIT, pas celle de la matinée ») et, surtout, elle FABRIQUAIT un
       chiffre : une nuit que personne n'a mesurée — bracelet à la charge,
       bracelet sur la table — recevait la médiane des mesures de l'après-midi,
       publiée sous l'étiquette « VFC » que le Moniteur déclare nocturne
       (`nocturne("hrv", "VFC", …)`, à côté de la FC au repos et du souffle, qui
       refusent tous deux ce repli depuis les v1782 et v2048). Dernier repli de
       la famille. Demandé par Dino le 14 septembre : « ne générer aucune autre
       valeur estimée ou artificielle liée à la nuit ».

       CE QUE ÇA DÉPLACE, MESURÉ AVANT D'ÊTRE LIVRÉ (moteur monté sur quatre
       exports de Dino et un de Félix, 43 / 40 / 37 / 34 / 12 jours) : DEUX
       jours changent chez Dino, UN chez Félix, et ce sont exactement les cas
       que la règle vise.
         · 7 août — aucune nuit mesurée du tout : 65 ms publiés depuis
           144 mesures prises entre 12h03 et 23h58. Devient un trou.
         · 10 août (Dino ET Félix, le même jour) — nuit mesurée 00h35→08h57,
           et les 125 mesures de la puce vont de 12h58 à 23h53 : ZÉRO dans la
           fenêtre. La « VFC de la nuit » était un après-midi entier.
       Aucune autre valeur ne bouge sur 166 jours cumulés ; la normale passe de
       63,03 ± 10,05 (n=34) à 62,84 ± 10,33 (n=32) — deux points faux en moins.

       ET C'EST LA NORMALE QUI COMPTE, PAS LE POINT. `baseStat('hrv',60)`
       parcourt soixante nuits par `sensorOf` et retient tout `hrv` non nul ;
       son garde des nuits courtes (`sleepMin<240`) ne peut pas voir celles-ci,
       puisqu'une nuit non mesurée n'a pas de `sleepMin`. Une seule nuit sans
       bracelet injectait donc une VFC de journée dans la référence à laquelle
       tous les scores suivants se comparent.

       LES DEUX CALCULS DOIVENT RESTER LE MÊME : sinon la bande du rapport se
       construirait sur des paires que la VFC affichée ne connaît pas. */
    var hm = null, n = w.night || null;
    if (n && n.bedMin != null && n.wakeMin != null) {
      var b = n.bedMin, r = n.wakeMin;
      hm = w.hrvMontre.filter(function (x) { var m = x[0];
        return (b <= r) ? (m >= b && m <= r) : (m >= b || m <= r); });
    }
    var hv = (hm || []).map(function (x) { return x[1]; })
               .filter(function (v) { return v > 0 && v < 400; })
               .sort(function (a, c) { return a - c; });
    if (hv.length < 3) return null;
    return { v: Math.round(hv[hv.length >> 1]), n: hv.length };
  } catch (e) { return null; }
};

/* LA BANDE DU RAPPORT rmssd/puce, sur les 60 nuits qui précèdent K.
   Les paires viennent du RÉSUMÉ FIGÉ quand il existe (`vfcNuit.rmssd` pour une
   nuit refusée, `vfcNuit.v` pour une nuit servie rmssd), du calcul brut sinon.
   Mémoire par jour ET par effectif : une nuit figée de plus la fait tomber. */
window.flBandeVfc = function (K) {
  try {
    if (typeof watchOf !== 'function') return null;
    var memo = window._flBandeMemo = window._flBandeMemo || {};
    var q = [], nb = 0;
    for (var i = 1; i <= 60; i++) {
      var k = tk(-i); if (k === K) continue;
      var w = watchOf(k); if (!w || !w.night) continue;
      var fz = w.night.vfcNuit || null, rm = null, pu = null;
      if (fz && fz.v != null) {
        rm = (fz.rmssd != null) ? fz.rmssd : (fz.src === 'rmssd' ? fz.v : null);
        pu = (fz.puce != null) ? fz.puce : null;
      } else if (typeof flRmssdNuit === 'function') {
        var r = flRmssdNuit(k); if (r && r.ok) rm = r.rmssd;
      }
      if (pu == null) { var p = window.flPuceNuit(w); if (p) pu = p.v; }
      if (rm == null || !pu || pu >= 95) continue;
      q.push(rm / pu); nb++;
    }
    var cle = tk(0) + '|' + K + '|' + nb;
    if (memo[cle]) return memo[cle];
    if (q.length < 6) return (memo[cle] = null);
    q.sort(function (a, b) { return a - b; });
    var m = q[q.length >> 1];
    var ecarts = q.map(function (x) { return Math.abs(x - m); }).sort(function (a, b) { return a - b; });
    var mad = ecarts[ecarts.length >> 1] * 1.4826;
    return (memo[cle] = { m: m, sd: (mad > 0 ? mad : 0.03), n: q.length });
  } catch (e) { return null; }
};

/* LE VERDICT — informatif. Rend toujours le RMSSD ; `desaccord` dit combien la
   nuit s'écarte de la bande du poignet. Complète et restaure le résumé figé. */
window.flVfcRetenue = function (rmssd, puce, K, w) {
  var out = { hrv: rmssd, src: 'rmssd', desaccord: null, bande: null };
  try {
    if (rmssd == null) return null;
    if (puce != null && puce < 95) {
      var b = window.flBandeVfc(K || tk(0));
      if (b) { out.bande = b; out.desaccord = Math.round(Math.abs(rmssd / puce - b.m) / b.sd * 10) / 10; }
    }
    if (w && w.night && w.night.vfcNuit && w.night.vfcNuit.v != null) {
      var fz = w.night.vfcNuit, change = false;
      /* gén. 14 — un résumé basculé sur la puce par la gén. 13 reprend sa mesure */
      if (fz.src === 'puce' && fz.rmssd != null) {
        fz.v = fz.rmssd; fz.src = 'rmssd'; delete fz.rmssd; delete fz.rmssdRefuse; change = true;
        out.hrv = fz.v;
      }
      if (fz.desaccord == null && out.desaccord != null) { fz.puce = puce; fz.desaccord = out.desaccord; change = true; }
      if (change) { if (typeof wSaveK === 'function') wSaveK(K || tk(0)); try { window._flBandeMemo = {}; } catch (e) {} }
    }
    return out;
  } catch (e) { return out; }
};
