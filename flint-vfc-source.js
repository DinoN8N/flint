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

/* ═══ 4 nov. 2026 — UNE VALEUR DE PUCE QUI SE RÉPÈTE N'EST PAS UNE MESURE ═══════════════════════════
   Nuit du 3 au 4 nov., Fitcare, iPhone 17 : sa VFC horaire (`hrvMontre`, fichier `.hrv`, une valeur
   par heure) vaut 92 à 22:01, 145 à 23:01… puis 145 à 00:01, 01:01, 02:01 … 07:01 — huit heures au
   chiffre près, alors que les nuits d'avant elle change à chaque heure (103, 156, 158, 71, 57…). Son
   propre relevé en direct de 07:43 dit aussi « VFC 145 », et elle repart à 159 à 08:01. Le bracelet
   n'avait rien mesuré : il RÉPÉTAIT sa dernière valeur. La même nuit, ses battements (R-R) ne sont
   arrivés que 13 minutes sur 457.
   RÈGLE : trois valeurs ou plus d'affilée, identiques, espacées d'au moins 30 min (la cadence
   horaire du Fitcare — les fenêtres de quelques minutes d'une autre puce ne sont jamais jugées) :
   la première reste (c'est une vraie mesure), les répétitions sortent. Deux égales d'affilée restent :
   le hasard le permet. Appliquée PARTOUT où l'on prend la médiane de la puce sur la nuit
   (`flPuceNuit` ici, `sensorOf` et `flDiagVariabilite` dans index.html) — les calculs restent le même.
   Banc : test-vfc-source.js § 4 nov. */
window.flPuceSansGel = function (serie) {
  try {
    if (!Array.isArray(serie) || serie.length < 3) return serie || [];
    var s = serie.filter(function (x) { return x && x[0] != null; })
                 .slice().sort(function (a, c) { return a[0] - c[0]; });
    var garde = s.map(function () { return true; });
    for (var i = 0; i < s.length;) {
      var j = i;
      while (j + 1 < s.length && s[j + 1][1] === s[i][1] && (s[j + 1][0] - s[j][0]) >= 30) j++;
      if (j - i + 1 >= 3) for (var k = i + 1; k <= j; k++) garde[k] = false;
      i = j + 1;
    }
    return s.filter(function (x, k) { return garde[k]; });
  } catch (e) { return serie || []; }
};

/* ═══ 4 nov. 2026 — « TON BRACELET N'A PRESQUE PAS ENVOYÉ DE BATTEMENTS » ═══════════════════════════
   Une récup « sans VFC » ne disait pas POURQUOI. Ce matin-là, le lien avait tenu toute la nuit (le
   Fitcare envoie une photo de l'instant toutes les ~11 min, `tempPhoto` : 40 de 00:10 à 07:34) et le
   pouls était arrivé à la seconde — mais les battements (R-R) n'occupaient que 13 minutes sur 457 :
   c'est le bracelet qui s'était tu, ni le téléphone, ni le Bluetooth. On ne le dit qu'à ces deux
   conditions, prouvées par les données de la nuit :
     · le lien a tenu : au moins la moitié des photos attendues dans la fenêtre de la nuit ;
     · les battements manquent : moins de 5 % des minutes de la nuit en portent.
   Nuit d'au moins 3 h, Fitcare seulement (les photos sont les siennes). `null` = on ne sait pas. */
window.flVfcBraceletMuet = function (K) {
  try {
    var w = (typeof watchOf === 'function') ? watchOf(K) : null;
    if (!w || !w.night || !/fitcare/.test(String(w.marque || ''))) return null;
    var n = w.night;
    if (n.sleepStart == null || n.sleepEnd == null) return null;
    var duree = Math.round((n.sleepEnd - n.sleepStart) / 60000);
    if (!(duree >= 180)) return null;
    var a = new Date(n.sleepStart), b = new Date(n.sleepEnd);
    var am = a.getHours() * 60 + a.getMinutes(), bm = b.getHours() * 60 + b.getMinutes();
    var dans = function (m) { return (am <= bm) ? (m >= am && m <= bm) : (m >= am || m <= bm); };
    var mat = (typeof flMatiereNuit === 'function') ? flMatiereNuit(K, w) : w;
    var minutesRR = (mat.rrH || []).filter(function (e) { return e && dans(e[0]) && Array.isArray(e[1]) && e[1].length; }).length;
    var photos = (mat.tempPhoto || []).filter(function (e) { return e && dans(e[0]); }).length;
    var lien = photos >= Math.floor(duree / 11 / 2);
    return { muet: lien && minutesRR < 0.05 * duree, lien: lien, minutesRR: minutesRR, photos: photos, duree: duree };
  } catch (e) { return null; }
};

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
      hm = window.flPuceSansGel(w.hrvMontre).filter(function (x) { var m = x[0];   /* 4 nov. 2026 — sans les répétitions */
        return (b <= r) ? (m >= b && m <= r) : (m >= b || m <= r); });
    }
    var hv = (hm || []).map(function (x) { return x[1]; })
               .filter(function (v) { return v > 0 && v < 400; })
               .sort(function (a, c) { return a - c; });
    if (hv.length < 3) return null;
    return { v: Math.round(hv[hv.length >> 1]), n: hv.length };
  } catch (e) { return null; }
};

/* ═══ 2 nov. 2026 (v3017) — LA VFC DE LA NUIT COMME WHOOP : FILTRE 10 %, SOMMEIL PROFOND D'ABORD ═══
   `flRmssdNuit` (index.html) gardait une paire de battements à 20 % d'écart (Malik) et prenait la
   médiane de TOUTES les minutes. Contre WHOOP, sur les deux nuits Fitcare (1er et 2 nov.) :
     calcul                         1er nov. (68)   2 nov. (67)
     20 %, toute la nuit (avant)         72              85        écart moyen 11 ms
     10 %, toute la nuit                 61              64                     5
     10 %, sommeil PROFOND               65              70                     3
   Les blocs R-R du Fitcare la nuit sont courts (~10 battements) : un parasite gonfle une minute
   entière. WHOOP pondère le sommeil lent profond. La méthode est TAGUÉE (`m: 2`) : les normales ne
   mélangent jamais deux calculs (`baseStat`, `hrvMeth`), et un résumé figé de l'ancien calcul est
   refait tant que ses battements sont là (`flVfcRefiger`). */

/* Les minutes de `parMinute` (`min` = minute du jour) passées en sommeil profond, d'après les stades
   de la nuit (`startMin` compté depuis `am`, la minute d'endormissement). */
window.flVfcMinutesProfondes = function (parMinute, n, am) {
  try {
    var st = (n && n.stages) || [];
    if (!st.length || am == null) return [];
    return parMinute.filter(function (x) {
      var rel = ((x.min - am) % 1440 + 1440) % 1440;
      for (var i = 0; i < st.length; i++) {
        var g = st[i];
        if (rel >= g.startMin && rel < g.startMin + g.durMin) return g.stage === 'deep';
      }
      return false;
    });
  } catch (e) { return []; }
};

/* Un résumé figé de l'ANCIEN calcul (sans `m`) est refait avec le nouveau tant que les battements de
   la nuit sont là (`rrH`, purgé à ~7 jours) ; l'ancienne valeur reste sous `ancien`. Au-delà, il garde
   son chiffre et sa méthode (1) : les normales le tiennent à part. */
window.flVfcRefiger = function (K, w, fz) {
  try {
    /* 4 nov. 2026 — la méthode 3 (20 %, profond pondéré vers la fin) refait aussi les résumés de la 2. */
    if (!fz || fz.v == null || (fz.m || 1) >= 3 || fz.src !== 'rmssd' || !w || !w.night || !(w.rrH && w.rrH.length)) return fz;
    var r = (typeof flRmssdNuit === 'function') ? flRmssdNuit(K) : null;
    if (!r || !r.ok || r.methode !== 3) return fz;
    var nv = {};
    for (var c in fz) if (Object.prototype.hasOwnProperty.call(fz, c)) nv[c] = fz[c];
    nv.ancien = fz.v; nv.v = r.rmssd; nv.m = 3; nv.minutes = r.minutes; nv.qualite = r.qualite;
    w.night.vfcNuit = nv;
    if (typeof wSaveK === 'function') wSaveK(K);
    try { window._flBandeMemo = {}; } catch (e) {}
    return nv;
  } catch (e) { return fz; }
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
/* Les pas minute par minute, depuis `actDet` : [instant, total, kcal, [10 minutes], …].

   ═══ 29 oct. 2026 (v2986) — LE FITCARE N'ÉCRIT PAS D'`actDet` ═══════════════
   Ses pas n'arrivent qu'en paquets d'HEURE (`pasHeure`, pas.js) : la porte des
   « 40 pas en 8 minutes » ne voyait donc RIEN sur un jour Fitcare — une marche
   passait pour une minute au calme, et notait du stress. Les pas de l'iPhone
   (Santé, `sante_K.pas`, un compte par tranche de cinq minutes) prennent le
   relais : la tranche est répartie sur ses cinq minutes (comme flint-sommeil.js
   le fait déjà), seulement là où `actDet` ne dit rien. Le J-Style, qui a ses
   blocs, ne change pas. Banc : test-stress-continu.js. */
function flsbSante(K) {
  try {
    var s = (typeof DB !== 'undefined' && DB && DB.get) ? DB.get('sante_' + K, null) : null;
    return (s && Array.isArray(s.pas)) ? s.pas : [];
  } catch (e) { return []; }
}
function flsbPas(K, w) {
  var t0 = flsbMinuit(K), out = {};
  (w.actDet || []).forEach(function (e) {
    if (!e || !Array.isArray(e[3])) return;
    var ms = e[0] > 1e12 ? e[0] : e[0] * 1000, m0 = Math.round((ms - t0) / 60000);
    e[3].forEach(function (s, i) { if (s > 0) out[m0 + i] = (out[m0 + i] || 0) + s; });
  });
  if (flsbInstrument(w) === 'fitcare' || !(w.actDet || []).length) {
    flsbSante(K).forEach(function (x) {
      if (!Array.isArray(x) || x[0] == null || !(+x[1] > 0)) return;
      var m0 = Math.round(+x[0]), q = (+x[1]) / 5;
      for (var i = 0; i < 5; i++) if (!out[m0 + i]) out[m0 + i] = q;
    });
  }
  return out;
}
function flsbSeances(K) {
  var L = [];
  try { L = (typeof DB !== 'undefined' && DB && DB.get) ? (DB.get('sessions_' + K, []) || []) : []; } catch (e) { L = []; }
  return L.filter(function (s) { return s && s.type !== 'nap' && s.startMin != null && s.endMin != null; })
          .map(function (s) { return [s.startMin - 2, s.endMin + FLSB.APRES]; });
}

/* ═══ 27 oct. 2026 — LE FITCARE : DES MINUTES MAIGRES, À RECOLLER PAR CINQ ══════

   Le J-Style rangeait un bloc d'environ 90 battements toutes les cinq minutes.
   Le Fitcare diffuse en direct : `rrH` reçoit UNE entrée par minute, et en mode
   quotidien elle porte ~9 battements (médiane du 27 oct., 202 minutes). La
   porte des 20 intervalles en refusait donc 155 sur 202 — le stress n'était
   noté que par éclats. On recolle les minutes d'une même tranche de cinq : la
   cadence redevient celle de l'ancien bracelet, et les deux portes (20
   intervalles, 8 paires à 7 %) gardent leur sens. Les paires à cheval sur deux
   trames ne sont pas consécutives : la borne des 7 % en écarte la plupart, et le
   poignet qui bouge reste jugé par la qualité (30 %). L'ancien bracelet ne passe
   pas par là : ses blocs restent tels quels.

   ET SA RÉFÉRENCE NE SE COMPARE QU'À ELLE-MÊME. Le calme de référence du 27
   mêlait 327 blocs, surtout du J-Style : c'est le défaut corrigé ce matin pour
   la récupération (flInstrumentVfc). Les sept jours ne comptent que ceux du
   MÊME bracelet ; sous ~5 h d'éveil au calme, la raison s'affiche — « FLINT
   apprend encore ton calme ». Banc : test-stress-battements.js, section 9. */
function flsbInstrument(w) {
  try { return (typeof window.flInstrumentVfc === 'function') ? window.flInstrumentVfc(w && w.marque) : ''; } catch (e) { return ''; }
}
function flsbRegrouper(w) {
  var rh = w.rrH || [];
  if (flsbInstrument(w) !== 'fitcare') return rh;
  var g = {}, ordre = [];
  rh.forEach(function (e) {
    if (!e || e.length < 2 || !Array.isArray(e[1])) return;
    var k = Math.floor(e[0] / 5);
    if (!g[k]) { g[k] = [e[0], []]; ordre.push(k); }
    g[k][1] = g[k][1].concat(e[1]);
  });
  return ordre.map(function (k) { return g[k]; });
}

/* Les blocs d'une journée, notés de leurs deux nombres et de leurs refus.
   Mémoire par jour : la clé suit tout ce dont le résultat dépend. */
function flsbBlocs(K, w) {
  var memo = window._flsbMemo = window._flsbMemo || {};
  var rh = flsbRegrouper(w), ses = flsbSeances(K);
  var cle = 'b|' + K + '|' + (w.rrH || []).length + '|' + rh.length + '|' + (w.hr ? w.hr.length : 0) + '|' + (w.actDet ? w.actDet.length : 0)
          + '|' + flsbSante(K).length + '|' + JSON.stringify(ses) + '|' + ((w.sommeils || []).length);
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

/* ═══ 1er nov. 2026 — DU STRESS DÈS LE PREMIER JOUR (Dino : « je veux du stress tous les jours ») ═══
   Le 1er nov., nouvel iPhone : « pas de courbe ce jour » toute la matinée — la référence exigeait
   60 blocs de calme éveillé (~5 h) sur CE téléphone et CE bracelet. Un nouvel utilisateur, un
   téléphone changé, une base restaurée : une matinée sans stress à chaque fois.
   Sous le seuil, la référence est PROVISOIRE : un calme a priori (FC de repos + 14 bpm ; une VFC
   éveillée selon l'âge, 55 ms à 20 ans, −0,6 ms par an, bornée 20-60) fondu avec les blocs
   personnels déjà là, à poids `N` (20 blocs ≈ une heure de port) — la sienne domine dès la
   première heure, et la vraie prend la main au seuil. `provisoire: true` le dit. */
var FLSB_AP = { N: 20, SH: 7, SV: 0.35, SC: 0.85, NP: 60, SP: 7 };
function flsbAPriori(K) {
  var rs = null, age = null;
  try { rs = (typeof window.flFcRepos === 'function') ? window.flFcRepos(K) : null; } catch (e) {}
  try { age = (typeof window.flAge === 'function') ? window.flAge() : null; } catch (e) {}
  var fcR = (rs && rs.v > 30 && rs.v < 110) ? rs.v : 60, a = (age > 10 && age < 100) ? age : 35;
  return { mH: fcR + 14, mV: Math.log(Math.max(20, Math.min(60, 55 - 0.6 * (a - 20)))) };
}
function flsbProvisoire(K, R) {
  var ap = flsbAPriori(K), n = R.length, w0 = FLSB_AP.N / (FLSB_AP.N + n);
  var ref = { mH: w0 * ap.mH + (1 - w0) * (n ? flsbMediane(R.map(function (b) { return b.fc; })) : ap.mH),
              sH: FLSB_AP.SH,
              mV: w0 * ap.mV + (1 - w0) * (n ? flsbMediane(R.map(function (b) { return b.V; })) : ap.mV),
              sV: FLSB_AP.SV, n: n, provisoire: true };
  ref.mC = n >= 12 ? (1 - w0) * flsbMediane(R.map(function (b) { return flsbComposite(b, ref); })) : 0;
  ref.sC = FLSB_AP.SC;
  return ref;
}

/* La référence ÉVEILLÉ AU CALME des sept jours qui finissent à K. */
function flsbReference(K) {
  var R = [], sig = [], insK = flsbInstrument(flsbW(K));
  for (var i = 0; i < FLSB.FEN; i++) {
    var k = flsbCle(K, -i), w = flsbW(k);
    if (!w || !w.rrH || !w.rrH.length) continue;
    if (flsbInstrument(w) !== insK) continue;   /* 27 oct. — le calme d'un bracelet ne se compare qu'au sien */
    var B = flsbBlocs(k, w); sig.push(k + ':' + B.length);
    B.forEach(function (b) { if (!b.exclu && !b.dort) R.push(b); });
  }
  var memo = window._flsbMemo = window._flsbMemo || {}, cle = 'r|' + K + '|' + insK + '|' + sig.join(',');
  if (memo[cle] !== undefined) return memo[cle];
  if (R.length < FLSB.REF_MIN) return (memo[cle] = flsbProvisoire(K, R));
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
    return { mes: mes, source: 'battements', fige: false, provisoire: !!ref.provisoire };
  } catch (e) { return null; }
};

/* ═══ 29 oct. 2026 (v2986) — LA COURBE NE S'ARRÊTE PLUS : LE POULS COMBLE, PÂLE ═══

   Dino : « la courbe de stress n'est pas continue — il n'y a que des stops (…)
   ce n'est pas possible de proposer une courbe non continue. »

   CE QUI LA COUPAIT, MESURÉ sur son export du 29 oct. (moteur monté, éveil
   seulement) : 54 % des minutes notées le 27, 27 % le 28, 32 % le 29, rien le
   26 (11 mesures, la garde en veut 12). Des 1 548 minutes vides du 27 au 29,
   70 % manquaient de BATTEMENTS — le Fitcare n'en diffuse que ~400 minutes par
   jour, 8-10 par minute (44 % : trop peu dans la tranche de cinq ; 26 % : aucun
   alors que le pouls était là) ; 15 % étaient de l'effort, 5 % une séance et
   ses 30 min, 10 % le bracelet ôté ou pas encore relu. Le filtre de qualité :
   0 minute. Le pouls minute, lui, couvrait 97 % de l'éveil.

   CE QU'ON FAIT. Là où les battements manquent, la MÊME recette sur le pouls
   minute du bracelet seul : sa moyenne sur cinq minutes, comparée à TA
   référence éveillé au calme des sept derniers jours (même bracelet, hors
   sommeil, effort, séance et marche), en σ robustes, puis la même sigmoïde
   (centre 0,62). Aucun ajustement : la version calée par validation croisée
   ne faisait pas mieux (prototype, 23-29 oct. : r 0,74 contre 0,77).

   CE QUE VAUT CETTE ESTIMATION, mesuré avec CE code sur les minutes où les
   deux existent (export du 29 oct., moteur monté) :
     Fitcare (26-29 oct.), éveil, n = 106 : r 0,71 · erreur moyenne 10,9 pts ·
       médiane 8 · même palier 59 % · à un palier près 95 % (jour et nuit,
       n = 157 : r 0,81 · erreur 9,0) ;
     J-Style (10 jours d'oct.), éveil, n = 859 : r 0,72 · erreur 11,1.
   C'est l'écart entre deux mesures de battements à cinq minutes l'une de
   l'autre (Fitcare r 0,76 · erreur 10,3 ; J-Style r 0,62 · erreur 13,3).
   Tenir la dernière mesure 13 à 30 min faisait PIRE (r 0,55 · erreur 14,7) :
   c'est pourquoi la tenue reste à 12.
   LIMITE, écrite pour qu'on ne l'oublie pas : la FC est la moitié du score des
   battements ; la VFC, l'autre moitié, ne suit le pouls qu'à r 0,43. Une
   estimation au pouls n'est donc PAS une mesure : elle voyage À PART
   (`estimes`), se dessine PÂLE, et n'entre dans AUCUNE moyenne, alerte, zone
   ou lecture — `points` reste la mesure des battements, intacte.

   LA MARCHE NE FAIT PAS LE STRESS : une minute de marche (≥ 40 pas en 8 min,
   `flsbPas`, désormais lue sur Santé pour le Fitcare) sous le pouls estimé
   aurait été « élevé » 14 % du temps, contre 3 % mesuré. Elle n'a donc pas de
   valeur : avec l'effort et la séance (+30 min), c'est une minute
   « ACTIVITÉ » (`'a'`, valeur nulle), dessinée à part. Seul le bracelet ôté
   (aucun pouls) reste un trou.

   Rend [[minute, valeur|null, 'p'|'a'], …] pour les minutes que `rr` (la
   courbe des battements, [minute, valeur|null]) laisse vides — toutes si `rr`
   est nul — ou `null` sans pouls ou sans référence (~5 h d'éveil au calme). */
var FLSP = { REF_MIN: 300 };
function flspJour(K, w) {
  var memo = window._flsbMemo = window._flsbMemo || {}, ses = flsbSeances(K);
  var cle = 'pj|' + K + '|' + (w.hr || []).length + '|' + (w.actDet ? w.actDet.length : 0) + '|' + flsbSante(K).length
          + '|' + JSON.stringify(ses) + '|' + ((w.sommeils || []).length);
  if (memo[cle]) return memo[cle];
  if (Object.keys(memo).length > 150) memo = window._flsbMemo = {};
  var hr = w.hr || [];
  try { if (typeof window.flHrPropre === 'function') hr = window.flHrPropre(hr) || hr; } catch (e) {}
  var f = {}, fin = -1; hr.forEach(function (x) { if (x && x[1] > 0) { f[x[0]] = x[1]; if (x[0] > fin) fin = x[0]; } });
  var seuil = null;
  try {
    var fm = (typeof window.flFcMax === 'function') ? window.flFcMax() : null;
    var rs = (typeof window.flFcRepos === 'function') ? window.flFcRepos(K) : null;
    if (fm && fm.v) seuil = (rs && rs.v) ? rs.v + 0.40 * (fm.v - rs.v) : fm.v * 0.60;
  } catch (e) {}
  var J = { fc5: [], eff: {}, ses: {}, marche: {}, dort: {}, fin: fin }, pas = flsbPas(K, w), dorts = flsbSommeils(K, w);
  /* L'effort, comme `flStressCourbe` le masque : la minute et ses voisines (−2 / +3). */
  if (seuil != null) hr.forEach(function (x) { if (x && x[1] >= seuil) for (var q = x[0] - 2; q <= x[0] + 3; q++) J.eff[q] = 1; });
  ses.forEach(function (s) { for (var q = Math.max(0, Math.ceil(s[0])); q <= Math.min(1439, s[1]); q++) J.ses[q] = 1; });
  for (var t = 0; t < 1440; t++) {
    var s5 = 0, n5 = 0, np = 0;
    for (var u = t - 2; u <= t + 2; u++) if (f[u]) { s5 += f[u]; n5++; }
    J.fc5.push(n5 ? s5 / n5 : null);
    for (var u2 = t - 6; u2 <= t + 1; u2++) np += pas[u2] || 0;
    if (np >= FLSB.PAS) J.marche[t] = 1;
    if (dorts.some(function (d) { return t >= d[0] && t <= d[1]; })) J.dort[t] = 1;
  }
  return (memo[cle] = J);
}
/* La référence ÉVEILLÉ AU CALME du pouls, sur les sept jours qui finissent à K,
   même bracelet — la sœur de `flsbReference`, minute par minute. */
function flspReference(K) {
  var insK = flsbInstrument(flsbW(K)), V = [], sig = [];
  for (var i = 0; i < FLSB.FEN; i++) {
    var k = flsbCle(K, -i), w = flsbW(k);
    if (!w || !w.hr || !w.hr.length || flsbInstrument(w) !== insK) continue;
    var J = flspJour(k, w); sig.push(k + ':' + w.hr.length);
    for (var t = 0; t < 1440; t++) {
      if (J.fc5[t] == null || J.dort[t] || J.eff[t] || J.ses[t] || J.marche[t]) continue;
      V.push(J.fc5[t]);
    }
  }
  var memo = window._flsbMemo = window._flsbMemo || {}, cle = 'pr|' + K + '|' + insK + '|' + sig.join(',');
  if (memo[cle] !== undefined) return memo[cle];
  if (V.length < FLSP.REF_MIN) {
    /* 1er nov. 2026 — même règle que les battements : le pouls de repos + 14 a priori, fondu avec
       les minutes de calme déjà là (60 minutes de poids), jusqu'aux 300 de la vraie référence. */
    var apP = flsbAPriori(K), w0P = FLSB_AP.NP / (FLSB_AP.NP + V.length);
    return (memo[cle] = { m: w0P * apP.mH + (1 - w0P) * (V.length ? flsbMediane(V) : apP.mH), s: FLSB_AP.SP, n: V.length, provisoire: true });
  }
  return (memo[cle] = { m: flsbMediane(V), s: Math.max(3, flsbSigma(V)), n: V.length });
}
window.flStressPouls = function (K, w, rr) {
  try {
    if (!w || !w.hr || !w.hr.length) return null;
    var ref = flspReference(K); if (!ref) return null;
    var J = flspJour(K, w), R = {}, est = [], np = 0, na = 0, cent = window.flEchelleStress === 100;
    (rr || []).forEach(function (p) { if (p && p[1] != null) R[p[0]] = 1; });
    for (var t = 0; t < 1440; t++) {
      if (R[t]) continue;
      var fc = J.fc5[t];
      /* L'activité se dit tant que le bracelet parle : une séance finie à 15 h 10
         ne colore pas 15 h 40 quand le pouls s'arrête à 15 h 30. */
      if ((fc != null && (J.eff[t] || J.marche[t] || J.ses[t])) || (J.ses[t] && t <= J.fin)) { est.push([t, null, 'a']); na++; continue; }
      if (fc == null) continue;
      var s = 100 / (1 + Math.exp(-FLSB.PENTE * ((fc - ref.m) / ref.s - FLSB.CENTRE)));
      /* La conversion EXACTE de `flStressCourbe` : 0-3 au centième, puis la fraction sur 100. */
      var v3 = Math.round(Math.max(0, Math.min(3, Math.round(s) / 33.3)) * 100) / 100;
      est.push([t, cent ? Math.round(v3 * 1000 / 3) / 10 : v3, 'p']); np++;
    }
    return { est: est, pouls: np, activite: na, ref: ref };
  } catch (e) { return null; }
};

/* ═══ 29 oct. 2026 (v2987) — UNE LIGNE, COMME AVEC LE J-STYLE ═══════════════════

   Dino, devant la v2986 : « des rayures à certains endroits, d'autres pas, des
   endroits illuminés, d'autres pas (…) une horreur ». Puis, devant trois
   maquettes : « la manière dont c'est présenté actuellement sur l'application,
   c'est la meilleure. C'est juste qu'il faut que ça marche : une ligne
   continue, la même chose qu'avec le J-Style. »

   Le J-Style rangeait un bloc de battements toutes les cinq minutes : la courbe
   était continue et calme. Le Fitcare n'en donne qu'une partie du temps — la
   ligne se construit donc ici, À PART (`ligne`), pour le seul dessin :

   1. Chaque minute PORTÉE (un pouls à ±2 min) prend la mesure des battements
      quand elle existe (`points`, déjà tenue et lissée), l'estimation au pouls
      minute sinon (`flStressPouls`, même recette) — activité comprise : pendant
      une séance la ligne MONTE, comme chez WHOOP, et l'icône de la séance le dit.
   2. Un silence de 15 min au plus est relié (droite entre ses deux bords) ;
      au-delà — bracelet ôté, pas encore relu — la ligne s'arrête, sans rien.
   3. Lissage robuste : médiane glissante de 15 min, puis moyenne de 9 min.
      Calé sur les 28 et 29 oct. (export de 17 h 45), éveil, pas d'une minute
      à l'autre (|Δ|) et allers-retours de ≥ 5 pts par heure :
        · J-Style, la courbe d'avant (20-22 oct.) : p99 12-15, 0,9-1,3 /h
        · Fitcare brut v2986                       : p99 17-21, 3,4-4,1 /h
        · médiane 15 + moyenne 9 (retenu)          : p99 4,4-6,0, 1,3-1,9 /h
        · médiane 31 + moyenne 9                   : p99 3,8-4,5 — mais le
          réveil de 03:00 vu au pouls seul tombe à 28 % de sa hauteur.
      Ce qui reste visible avec le retenu : le réveil du 29 à 03:00 (8 → 27,
      la ligne monte à 25, 93 % ; 76 % au pouls seul), la muscu du 29 (94 %),
      celle du 28 à 18:32 (100 %), une bosse fabriquée de 8 min (+34 sur +40).

   Chaque minute dit son origine pour le doigt : 'm' mesurée (battements),
   'p' estimée au pouls, 'a' activité, 'r' reliée par-dessus un silence court.
   La ligne n'entre dans AUCUN chiffre : `points`, la moyenne, les zones, le pic,
   l'alerte restent les battements seuls. Banc : test-stress-continu.js. */
var FLSL = { MEDIANE: 15, MOYENNE: 9, PONT: 15 };
window.flStressLigne = function (K, w, rr) {
  try {
    if (!w || !w.hr || !w.hr.length) return null;
    var J = flspJour(K, w), ref = flspReference(K), cent = window.flEchelleStress === 100, R = {};
    (rr || []).forEach(function (p) { if (p && p[1] != null) R[p[0]] = cent ? +p[1] : +p[1] * 100 / 3; });
    var v = [], o = [], t, u;
    for (t = 0; t < 1440; t++) {
      var fc = J.fc5[t], x = null, g = null;
      if (fc != null) {
        if (R[t] != null) { x = R[t]; g = 'm'; }
        else if (ref) {
          x = 100 / (1 + Math.exp(-FLSB.PENTE * ((fc - ref.m) / ref.s - FLSB.CENTRE)));
          g = (J.eff[t] || J.marche[t] || J.ses[t]) ? 'a' : 'p';
        }
      }
      v.push(x); o.push(g);
    }
    /* les silences courts, reliés d'un bord à l'autre — JAMAIS un retrait du bracelet
       (v2990) : ses minutes sont en quarantaine (`hrMasque`, flint-porte.js), et une
       ligne tirée par-dessus serait une estimation de stress sans poignet. */
    var retire = {};
    (w.hrMasque || []).forEach(function (p) { if (p) retire[p[0]] = 1; });
    for (t = 0; t < 1440;) {
      if (v[t] != null) { t++; continue; }
      var f = t, coupe = false; while (f < 1440 && v[f] == null) { if (retire[f]) coupe = true; f++; }
      if (t > 0 && f < 1440 && f - t <= FLSL.PONT && !coupe) {
        for (u = t; u < f; u++) { v[u] = v[t - 1] + (v[f] - v[t - 1]) * (u - t + 1) / (f - t + 1); o[u] = 'r'; }
      }
      t = f;
    }
    var hm = FLSL.MEDIANE >> 1, ha = FLSL.MOYENNE >> 1, med = [], out = [];
    for (t = 0; t < 1440; t++) {
      if (v[t] == null) { med.push(null); continue; }
      var fen = [];
      for (u = Math.max(0, t - hm); u <= Math.min(1439, t + hm); u++) if (v[u] != null) fen.push(v[u]);
      med.push(flsbMediane(fen));
    }
    for (t = 0; t < 1440; t++) {
      if (med[t] == null) continue;
      var s = 0, n = 0;
      for (u = Math.max(0, t - ha); u <= Math.min(1439, t + ha); u++) if (med[u] != null) { s += med[u]; n++; }
      var y = s / n;
      out.push([t, cent ? Math.round(y * 10) / 10 : Math.round(y * 3) / 100, o[t]]);
    }
    return out.length ? out : null;
  } catch (e) { return null; }
};

/* ═══ 27 oct. 2026 — LA NORMALE DE LA VFC NE MÉLANGE PAS DEUX BRACELETS ══════
   Le matin du 27 : récupération 79 %, WHOOP 38 %. La VFC, elle, était juste —
   83 contre 76 chez WHOOP, le pouls de repos 53 contre 52. Ce qui était faux,
   c'est ce contre quoi on la comparait : une normale de 64,5 ± 7,4 bâtie sur
   55 nuits du J-Style, un autre capteur, une autre échelle. 83 y valait
   +2,5 σ. Une première nuit au Fitcare jugée sur la mémoire d'un autre
   bracelet.

   La marque de chaque journée existait depuis le 24 octobre (`wSaveK` la pose,
   « a+b » quand deux bracelets se succèdent) précisément pour ça — mais
   `baseStat` ne la lisait pas. C'est la même règle que la v2034 entre le RMSSD
   et la puce, un cran plus haut : la base d'un jour ne contient que des nuits
   du MÊME instrument que lui. Sous trois nuits, pas de normale, donc pas de
   score — « Encore N nuits avant ton premier score », comme au premier jour.
   Un score absent vaut mieux qu'un score comparé à un autre bracelet.

   Les familles : 'fitcare' quand la journée a été écrite par le Fitcare (sa
   marque propre, ou 'standard', le profil cardiaque commun par lequel il
   parle) ; 'mixte' quand le J-Style l'a AUSSI écrite (un jour de transition :
   on ne sait pas lequel a fait la nuit, il n'entre dans aucune normale) ; ''
   pour tout le reste — le J-Style, et les journées d'avant la marque, qui
   gardent exactement le comportement d'avant.

   LA PUCE DU FITCARE, ET L'ERREUR QUI ÉTAIT LA NÔTRE (v2920 → v2921). La v2920
   l'avait écartée : son `.hrv` rendait 20, 91, 20, 91 pour la nuit du 27. Le
   SDK du fabricant (`OBKApiFit24.parsFile`) lit chaque valeur de ce fichier
   comme DEUX u16, la VFC puce le stress — nous lisions un octet. « 91, 0, 20,
   0 » était donc VFC 91, stress 20, pour chaque heure. Le décodeur suit
   désormais leur table (FichierFit24.format) ; la puce du Fitcare redevient un
   repli déclaré, sur sa propre normale (provenance 'puce' ET bracelet). Ce
   qu'il faut retenir : avant d'accuser un capteur, relire comment on le lit.

   REFUSÉ, et à ne pas reproposer : convertir l'ancienne normale par un
   rapport entre les deux bracelets (« pont d'échelle », déjà réfuté pour la
   puce, AUDIT-SCORES-VS-WHOOP-4-SEPT.md §7). Banc : test-normale-instrument.js. */
window.flInstrumentVfc = function (marque) {
  if (!marque) return '';
  var m = String(marque);
  var neuf = /fitcare|standard/.test(m), ancien = /jstyle/.test(m);
  return neuf ? (ancien ? 'mixte' : 'fitcare') : '';
};

/* ═══ 28 oct. 2026 — LA TEMPÉRATURE DE NUIT A LES BORNES DE SON BRACELET ═══════

   Dino, le 28 au matin : « les autres cartes du Moniteur ne sont pas apparues ».
   La température de la nuit était là — 30 relevés de 29,7 à 30,4 °C dans le
   `.slep` du Fitcare — et TOUS jetés : `sensorOf` et l'écran ne gardaient que
   32-38 °C, bornes tirées de 845 nuits J-Style (minimum 32,7). Le Fitcare lit
   son dos de boîtier, ~4 °C sous le J-Style (nuit du 24, J-Style : médiane 34,2 ;
   nuit du 28, Fitcare : 30,4). Ce n'est pas un bracelet décollé, c'est une autre
   échelle — comme la VFC de la puce.

   LA RÈGLE. Bornes par bracelet : Fitcare 26-36 °C (nuit du 28 : 29,7-30,4 ;
   journée du 26 : 28,2-33,7 ; une pièce à 20-24 °C reste dessous) ; ancien
   bracelet 32-38, inchangé ; nuit mixte, l'union. La normale, elle, était déjà
   tenue par bracelet (`baseStat`, `instr`) : 30,4 ne se compare jamais à 34,2.
   PROVISOIRE : deux nuits Fitcare seulement — à revoir à 30 nuits.
   Banc : test-moniteur-fitcare.js § 4 bis. */
/* ═══ 28 oct. 2026, 15 h — LA TEMPÉRATURE DE LA NUIT SE LIT SUR LES PHOTOS ════

   Relu le même jour : la photo de l'instant (objet 95, champ 3) donnait, la
   nuit du 28, 33,7 °C à l'endormissement puis 34,4 à 35,6 jusqu'à 5 h — la
   courbe d'une peau qui se réchauffe en dormant, à l'échelle de l'ancien
   bracelet (J-Style, nuit du 24 : 34,2). Le `.slep`, aux mêmes heures, restait
   PLAT à 30,3-30,4 : 0,1 °C d'amplitude en sept heures, rien de physiologique.
   La photo passe donc en premier : médiane de ses valeurs dans la fenêtre de
   sommeil, bornes 32-38 (celles de la peau), trois au moins. Sinon le `.slep`
   (bornes du bracelet, v2961). La normale ne mélange jamais les deux sources
   (`tempSrc` entre dans la clé de `baseStat` et dans l'écran).
   Le pilote demande une photo toutes les 15 min, nuit comprise (v2963).
   Banc : test-moniteur-fitcare.js § 4 ter. */
window.flTempNuitPhoto = function (w, n, K) {
  try {
    if (!w || !n || n.bedMin == null || n.wakeMin == null) return null;
    var b = +n.bedMin, r = +n.wakeMin, L = [];
    /* Nuit à cheval sur minuit : le matin dans la journée K, le soir dans la VEILLE
       (la photo est rangée au jour de son heure). Le soir de K est la nuit suivante. */
    (w.tempPhoto || []).forEach(function (x) { var m = x && x[0];
      if ((b <= r) ? (m >= b && m <= r) : (m <= r)) L.push(x); });
    if (b > r && K && typeof watchOf === 'function') {
      var p = String(K).split('-'), d = new Date(+p[0], (+p[1]) - 1, +p[2]); d.setDate(d.getDate() - 1);
      var wv = watchOf(d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate());
      ((wv && wv.tempPhoto) || []).forEach(function (x) { if (x && x[0] >= b) L.push(x); });
    }
    var v = L
      .map(function (x) { return x[1]; })
      .filter(function (t) { return typeof t === 'number' && t >= 32 && t <= 38; })
      .sort(function (a, c) { return a - c; });
    return v.length >= 3 ? Math.round(v[v.length >> 1] * 10) / 10 : null;
  } catch (e) { return null; }
};

window.flBornesTempNuit = function (marque, instr) {
  var i = instr != null ? instr : window.flInstrumentVfc(marque);
  if (i === 'fitcare') return [26, 36];
  if (i === 'mixte') return [26, 38];
  return [32, 38];
};
