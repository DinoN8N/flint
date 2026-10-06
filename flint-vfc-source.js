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
    /* 1er oct. 2026 — une nuit finie avant minuit lit la puce de la veille
       (`flMatiereNuit`, flint-porte.js) ; la nuit porte sa clé (`night.K`). */
    if (w && w.night && w.night.K && typeof flMatiereNuit === 'function') w = flMatiereNuit(w.night.K, w);
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

/* ═══ v2827 — LE STRESS SE CALCULE SUR LES BATTEMENTS, PLUS PAR LA PUCE ═══════

   POURQUOI ICI. Même métier que le reste du fichier : une mesure que la puce
   rendait, refaite par nous sur `rrH`. Et un fichier NEUF ne voyagerait pas :
   l'OTA ne transporte que la liste `WebRoot.updatableFiles`, compilée dans
   l'app (v2183). `flStressCourbe` (index.html) appelle `flStressBattements`
   par `typeof` ; sans ce fichier, elle retombe sur l'indice de la puce.

   CE QUI A CASSÉ. Le 30 sept. 2026 à 09:23, juste après la mise à jour 0088 →
   0120 (la montre se tait de 09:14 à 09:19), l'indice `hrvMontre[i][2]`
   tombe à ~12/100 et n'en bouge plus : moyenne du jour 49-52 avant, 15-21
   après, zéro minute « élevé » en une semaine. Le 0120 calcule sa VFC sur les
   battements BRUTS (corrélation avec notre RMSSD non filtré 0,42 → 0,77 ; elle
   suit le bruit, 61 → 148 ms) et son indice s'effondre avec. Félix, même app,
   mêmes jours : normal.

   ET L'ANCIEN NE VALAIT GUÈRE MIEUX. Sur 2 895 mesures de Dino et 3 987 de
   Félix sous le 0088, l'indice MONTE avec la VFC (+0,40) et avec le bruit
   (−0,60 avec la qualité du signal) : le « stress » de journée qu'il montrait
   était surtout le poignet qui bouge. Le recopier aurait recopié le défaut.

   CE QU'ON CALCULE. Chaque bloc `rrH` (une minute de battements toutes les
   cinq) donne deux nombres, comparés à TA référence ÉVEILLÉ AU CALME des sept
   derniers jours (hors sommeil, hors effort) :
     · la FC — moitié médiane des intervalles du bloc, moitié FC minute de la
       montre sur ±2 min (la plus stable des sources : autocorr. 5 min
       0,71 / 0,49 / 0,63 contre 0,67 / 0,43 / 0,56 pour le bloc seul) ;
     · la VFC — RMSSD des paires à moins de 7 % d'écart (Malik resserré). À
       20 %, la VFC de journée sortait PLUS haute que la nuit (75-93 contre
       64-76 ms : c'est le bruit) ; à 7 % elle ne dépend plus de la qualité
       (pente −0,012 / −0,050 / +0,016 par dixième) et reste sous la nuit.
   z = (½·écart de FC + ½·baisse de VFC), en σ robustes de ta référence, puis
   100/(1+e^−(z−0,62)) : ton éveil au calme habituel vaut ~35 (« faible »),
   +1 σ ~60, +2 σ ~80.

   CE QU'ON NE NOTE PAS — des TROUS, jamais des pics (doctrine v1801) :
   le sommeil compte, mais l'effort non : ≥ 40 pas en 8 min, une séance
   (sieste exceptée) et les 30 min qui la suivent (mesuré : 74 → 68 → 48 puis
   retour à la base, c'est le cœur qui redescend), la FC d'effort, et un bloc
   dont moins de 30 % des battements sont propres (le poignet bouge).

   VÉRIFIÉ (35 journées, Dino 0088 + 0120, Félix 0088) : la nuit plus calme que
   la journée 33 fois sur 35 (médiane 10 contre 34-40) ; à l'éveil 19-29 %
   calme, 52-61 % faible, 14-24 % modéré, 1-4 % élevé ; continuité à travers
   le changement de firmware ; les pics de Dino tombent sur des soirées à
   75-88 bpm sans un pas. Prototype : scratchpad 5a85c8c2, `stress/final.py`.

   FIGÉ. `rrH` part au natif après sept jours : une journée passée (écart ≤ −2)
   fige sa série dans `watch_K.stressFlint` ({v, n, p:[minute, indice, …]}),
   et la recalcule seulement si des battements arrivent après (+12 blocs). */
var FLSB = { SEUIL: 0.07, QMIN: 0.30, PAS: 40, FEN: 7, REF_MIN: 60,
             CENTRE: 0.62, PENTE: 1.0, APRES: 30, V: 1 };

function flsbCle(K, d) {
  var p = String(K).split('-'), t = new Date(+p[0], +p[1] - 1, +p[2] + (d || 0));
  return t.getFullYear() + '-' + (t.getMonth() + 1) + '-' + t.getDate();
}
function flsbMinuit(K) { var p = String(K).split('-'); return new Date(+p[0], +p[1] - 1, +p[2]).getTime(); }
function flsbMediane(a) {
  var s = a.slice().sort(function (x, y) { return x - y; }), n = s.length;
  return n % 2 ? s[n >> 1] : (s[n / 2 - 1] + s[n / 2]) / 2;
}
/* σ robuste : écart interquartile / 1,349, rangs arrondis vers le bas — le
   calcul exact du prototype, pour que le moteur rende ses chiffres. */
function flsbSigma(a) {
  var s = a.slice().sort(function (x, y) { return x - y; }), n = s.length;
  return (s[Math.floor(0.75 * (n - 1))] - s[Math.floor(0.25 * (n - 1))]) / 1.349;
}
function flsbW(k) { try { return (typeof window.watchOf === 'function') ? window.watchOf(k) : null; } catch (e) { return null; } }

/* Les fenêtres de sommeil du jour K, en minutes de K : celles de K et celles
   de K+1 (une nuit commencée avant minuit est rangée au jour du réveil). */
function flsbSommeils(K, w) {
  var t0 = flsbMinuit(K), F = [];
  [w, flsbW(flsbCle(K, 1))].forEach(function (x) {
    ((x && x.sommeils) || []).forEach(function (s) {
      if (s && s.debut != null && s.fin != null) F.push([(s.debut - t0) / 60000, (s.fin - t0) / 60000]);
    });
  });
  if (!F.length && w.night && w.night.bedMin != null && w.night.wakeMin != null) {
    var a = +w.night.bedMin, b = +w.night.wakeMin; if (a > b) a -= 1440; F.push([a, b]);
  }
  return F;
}
/* Les pas minute par minute, depuis `actDet` : [instant, total, kcal, [10 minutes], …]. */
function flsbPas(K, w) {
  var t0 = flsbMinuit(K), out = {};
  (w.actDet || []).forEach(function (e) {
    if (!e || !Array.isArray(e[3])) return;
    var ms = e[0] > 1e12 ? e[0] : e[0] * 1000, m0 = Math.round((ms - t0) / 60000);
    e[3].forEach(function (s, i) { if (s > 0) out[m0 + i] = (out[m0 + i] || 0) + s; });
  });
  return out;
}
function flsbSeances(K) {
  var L = [];
  try { L = (typeof DB !== 'undefined' && DB && DB.get) ? (DB.get('sessions_' + K, []) || []) : []; } catch (e) { L = []; }
  return L.filter(function (s) { return s && s.type !== 'nap' && s.startMin != null && s.endMin != null; })
          .map(function (s) { return [s.startMin - 2, s.endMin + FLSB.APRES]; });
}

/* Les blocs d'une journée, notés de leurs deux nombres et de leurs refus.
   Mémoire par jour : la clé suit tout ce dont le résultat dépend. */
function flsbBlocs(K, w) {
  var memo = window._flsbMemo = window._flsbMemo || {};
  var rh = w.rrH || [], ses = flsbSeances(K);
  var cle = 'b|' + K + '|' + rh.length + '|' + (w.hr ? w.hr.length : 0) + '|' + (w.actDet ? w.actDet.length : 0)
          + '|' + JSON.stringify(ses) + '|' + ((w.sommeils || []).length);
  if (memo[cle]) return memo[cle];
  if (Object.keys(memo).length > 150) memo = window._flsbMemo = {};
  var hr = w.hr || [];
  try { if (typeof window.flHrPropre === 'function') hr = window.flHrPropre(hr) || hr; } catch (e) {}
  var fcMin = {}; hr.forEach(function (x) { if (x && x[1] > 0) fcMin[x[0]] = x[1]; });
  var seuil = null;
  try {
    var fm = (typeof window.flFcMax === 'function') ? window.flFcMax() : null;
    var rs = (typeof window.flFcRepos === 'function') ? window.flFcRepos(K) : null;
    if (fm && fm.v) seuil = (rs && rs.v) ? rs.v + 0.40 * (fm.v - rs.v) : fm.v * 0.60;
  } catch (e) {}
  var pas = flsbPas(K, w), dorts = flsbSommeils(K, w), out = [];
  rh.forEach(function (e) {
    if (!e || e.length < 2 || !Array.isArray(e[1])) return;
    var m = e[0], v = e[1].filter(function (x) { return x >= 300 && x <= 2000; });
    if (v.length < 20) return;
    var p20 = 0, car = 0, n7 = 0;
    for (var i = 1; i < v.length; i++) {
      var d = v[i] - v[i - 1], a = Math.abs(d);
      if (a <= 0.2 * v[i - 1]) p20++;
      if (a <= FLSB.SEUIL * v[i - 1]) { car += d * d; n7++; }
    }
    if (n7 < 8 || car <= 0) return;
    var q = p20 / (v.length - 1), fb = 60000 / flsbMediane(v), mm = [];
    for (var t = m - 2; t <= m + 2; t++) if (fcMin[t]) mm.push(fcMin[t]);
    var fm5 = mm.length ? mm.reduce(function (s, x) { return s + x; }, 0) / mm.length : null;
    var fc = (fm5 != null) ? (fb + fm5) / 2 : fb;
    var np = 0; for (var u = m - 6; u <= m + 1; u++) np += pas[u] || 0;
    /* L'effort se juge sur la PLUS HAUTE des deux FC : la moyenne qui sert
       au calcul diluerait un bloc d'effort dans une minute calme voisine. */
    out.push({ m: m, fc: fc, V: Math.log(Math.sqrt(car / n7)), q: q,
               dort: dorts.some(function (f) { return m >= f[0] && m <= f[1]; }),
               exclu: np >= FLSB.PAS || q < FLSB.QMIN || (seuil != null && Math.max(fb, fm5 || 0) >= seuil)
                      || ses.some(function (s) { return m >= s[0] && m <= s[1]; }) });
  });
  return (memo[cle] = out);
}

/* La référence ÉVEILLÉ AU CALME des sept jours qui finissent à K. */
function flsbReference(K) {
  var R = [], sig = [];
  for (var i = 0; i < FLSB.FEN; i++) {
    var k = flsbCle(K, -i), w = flsbW(k);
    if (!w || !w.rrH || !w.rrH.length) continue;
    var B = flsbBlocs(k, w); sig.push(k + ':' + B.length);
    B.forEach(function (b) { if (!b.exclu && !b.dort) R.push(b); });
  }
  var memo = window._flsbMemo = window._flsbMemo || {}, cle = 'r|' + K + '|' + sig.join(',');
  if (memo[cle] !== undefined) return memo[cle];
  if (R.length < FLSB.REF_MIN) return (memo[cle] = null);
  var fc = R.map(function (b) { return b.fc; }), V = R.map(function (b) { return b.V; });
  var ref = { mH: flsbMediane(fc), sH: Math.max(3, flsbSigma(fc)), mV: flsbMediane(V), sV: Math.max(0.08, flsbSigma(V)), n: R.length };
  var C = R.map(function (b) { return flsbComposite(b, ref); });
  ref.mC = flsbMediane(C); ref.sC = Math.max(0.2, flsbSigma(C));
  return (memo[cle] = ref);
}
function flsbComposite(b, r) { return 0.5 * (b.fc - r.mH) / r.sH + 0.5 * (r.mV - b.V) / r.sV; }

/* Rend les mesures du jour sous la forme de `hrvMontre` — [minute, null,
   indice 0-100] — ou `null` (aucun battement, aucun figé : la puce reprend),
   ou `{attente, raison}` quand les battements sont là mais pas encore la
   référence (une nouvelle montre : il faut ~5 h d'éveil au calme). */
window.flStressBattements = function (K, w, off) {
  try {
    if (!w) return null;
    var fz = w.stressFlint, rh = w.rrH || [];
    if (fz && fz.v === FLSB.V && Array.isArray(fz.p) && !(rh.length >= (fz.n || 0) + 12)) {
      var M = [];
      for (var i = 0; i + 1 < fz.p.length; i += 2) M.push([fz.p[i], null, fz.p[i + 1]]);
      return { mes: M, source: 'battements', fige: true };
    }
    if (!rh.length) return null;
    var ref = flsbReference(K);
    if (!ref) return { mes: [], source: 'battements', attente: true,
      raison: 'FLINT apprend encore ton calme : la courbe arrive après environ cinq heures de port éveillé' };
    var mes = [], plat = [];
    flsbBlocs(K, w).forEach(function (b) {
      if (b.exclu) return;
      var z = (flsbComposite(b, ref) - ref.mC) / ref.sC;
      var s = Math.round(100 / (1 + Math.exp(-FLSB.PENTE * (z - FLSB.CENTRE))));
      mes.push([b.m, null, s]); plat.push(b.m, s);
    });
    if ((off || 0) <= -2 && mes.length && typeof window.wSaveK === 'function') {
      w.stressFlint = { v: FLSB.V, n: rh.length, p: plat };
      try { window.wSaveK(K); } catch (e) {}
    }
    return { mes: mes, source: 'battements', fige: false };
  } catch (e) { return null; }
};
