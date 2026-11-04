/* Le métier de ce fichier : LA SECONDE D'UNE SÉANCE — extraire du magasin
   `hrSec` la série fine d'une fenêtre de séance, la mettre en seaux de cinq
   secondes, et dire si elle SUFFIT pour porter la fiche.

   Liaisons : AUCUNE lecture nue d'index.html. Les deux dépendances —
   `flSecondesDuJour` (le magasin) et `flIdxDense` (le plafond de points) —
   sont PASSÉES en arguments par l'appelant, la forme que garde-liaisons
   recommande (« il se le fait passer en argument ») : ce fichier ne peut pas
   rater une portée, ni au banc ni sur le téléphone. Le banc reste
   tests/test-seconde-seance.js, qui éprouve l'appelant ET ce module.

   ═══ HISTOIRE DES FORMES ══════════════════════════════════════════════════

   v1403 — LA SECONDE PASSE AVANT LES INTERVALLES. Relevé le 11 août sur
   l'export d'un téléphone : `rrH` ne vient que par paquets — un toutes les
   cinq minutes, une centaine de secondes chacun — et il couvrait 0 et
   3 minutes des deux vraies séances. Le flux temps réel, lui, est continu
   tant que la liaison tient. Quand les deux sont là, la seconde gagne : elle
   est plus dense ET régulière. Même mise en forme que les autres sources —
   un point toutes les cinq secondes, médiane de la tranche — pour que
   l'écran reçoive une seule forme et ne sache pas d'où elle vient.

   v2106 — ET ELLE QUALIFIE LA SÉANCE TOUTE SEULE. Course de Dino du 31 août,
   21:35→21:40, WHOOP au poignet d'en face. À la fin de la séance, `hrSec`
   portait DÉJÀ les 286 points du flux 1/s (vérifié dans le
   localstorage.sqlite3 du téléphone) — mais la fiche s'ouvrait sur « PAS DE
   MESURE CARDIAQUE · le bracelet n'a mesuré que 40 % » : le verdict `real`
   ne regardait que le magasin MINUTE, que la synchro d'historique ne remplit
   que plusieurs minutes après la fin. WHOOP montrait sa courbe
   immédiatement ; la nôtre existait et attendait un portier qui ne la
   regardait pas. Quand la minute n'a rien qualifié, la seconde le fait donc
   elle-même — à ses propres bornes.

   ⚠️ LES DEUX BARRES NE SONT PAS LES MÊMES, ET C'EST VOULU (`dejaReel`) :
     · face à une minute déjà qualifiée, la seconde doit être MEILLEURE —
       75 % des minutes, la règle v1403 : une fine trouée dessinerait de
       longues droites là où la minute est régulière, et le banc l'épingle ;
     · face à RIEN, une fine à 60 % vaut infiniment mieux qu'un écran qui dit
       « pas de mesure » : le plancher tombe à deux minutes couvertes — une
       séance de trois minutes intégralement mesurée à 1/s a droit à sa
       courbe. C'est toute la demande de Dino : « même si l'effort est
       court, WHOOP y arrive, donc nous on doit être capables ».

   v1790 — PAIRES SEULEMENT dans `hrT` : le natif décode `[[Double]]`, un
   troisième élément fait rejeter la charge ENTIÈRE.

   ═══ 13 septembre 2026 — LES TROUS DE LA SECONDE SE BOUCHENT AVEC LA MÉMOIRE
   DE LA MONTRE. Foot de Dino, deux matchs. La seconde TOUCHAIT 100 % des
   minutes (donc elle gagnait, et le choix de source s'arrêtait là) avec
   seulement 37 % des secondes : le lien BLE est tombé 29 fois en une heure et
   `hrSec` suit le lien à la trame près. Pendant ce temps la montre, elle,
   avait tout gardé — `hrfine_` couvrait 97 % du premier match et 93 % du
   second. La matière des trous était DÉJÀ dans le téléphone, et la cascade
   exclusive (`if(!hrT)`) l'empêchait d'être regardée.

   LA RÈGLE EST CELLE DE `flHrFine` FACE À `rrH`, MOT POUR MOT : une tranche
   de cinq secondes que la seconde a remplie n'est PAS touchée ; une tranche
   VIDE, et seulement celle-là, prend la mémoire à 5 s ; rien n'est inventé,
   rien n'est interpolé, un trou que personne n'a mesuré reste un trou.

   ET LA SÉRIE DE CALCUL NE PREND PAS TOUT. Le dessin montre ce qui a été
   enregistré ; la moyenne, le maximum et les zones ne prennent que les
   tranches du canal CONTINU (`src === 'continu'`) — un fragment recollé ne
   signe pas un record, c'est la règle v1657. */
'use strict';

/* Rend null quand la seconde ne suffit pas, sinon :
     { hrT:       [[secondesDepuisDepart, bpm]] — plafonné pour le dessin,
       serieCanon: [bpm] — la série de référence, non décimée,
       couvHR:    part des minutes de la fenêtre couvertes (0..1) }
   `lireSecondes(K)` et `idxDense(n, at, plafond)` viennent de l'appelant. */
window.flFicheSeconde = function (K, sm0, dur, dejaReel, lireSecondes, idxDense,
                                  pointsFins, minuteCoherente) {
  if (typeof lireSecondes !== 'function' || typeof idxDense !== 'function') return null;
  if (!(dur > 0)) return null;
  var sec = null;
  try { sec = lireSecondes(K); } catch (e) { return null; }
  if (!sec || !sec.length) return null;

  var s0 = sm0 * 60, s1 = (sm0 + dur) * 60, seauxS = {}, minutesS = {};
  for (var _s = 0; _s < sec.length; _s++) {
    var t2 = sec[_s][0], v2 = sec[_s][1];
    if (t2 < s0 || t2 > s1) continue;
    if (!(v2 > 25 && v2 < 240)) continue;
    minutesS[Math.floor((t2 - s0) / 60)] = 1;
    var k4 = Math.round((t2 - s0) / 5);
    (seauxS[k4] = seauxS[k4] || []).push(v2);
  }
  var couvS = Object.keys(minutesS).length;
  var seuilMin = dejaReel ? Math.max(5, Math.round(dur * 0.75))
                          : Math.max(2, Math.round(dur * 0.6));
  if (couvS < seuilMin) return null;

  var fineS = [];
  Object.keys(seauxS).map(Number).sort(function (a, b) { return a - b; })
    .forEach(function (k5) {
      var vv = seauxS[k5].slice().sort(function (a, b) { return a - b; });
      fineS.push([k5 * 5, vv[vv.length >> 1]]);
    });
  if (fineS.length < (dejaReel ? Math.max(20, dur * 4) : Math.max(12, dur * 4))) return null;

  /* LES TROUS, BOUCHÉS PAR LA MÉMOIRE DE LA MONTRE (13 septembre 2026).
     `pointsFins` est la série riche de `flHrFine` : [[secondesDepuisDepart,
     bpm, source]]. On ne remplit que les tranches que la seconde n'a PAS. */
  var bouches = 0, pleins = {};
  Object.keys(seauxS).forEach(function (k) { pleins[k] = 1; });
  if (pointsFins && pointsFins.length) {
    var ajout = {}, parMinute = {};
    for (var _p = 0; _p < pointsFins.length; _p++) {
      var tf = pointsFins[_p][0], bf = pointsFins[_p][1];
      if (!(tf >= 0 && tf <= dur * 60)) continue;
      if (!(bf > 25 && bf < 240)) continue;
      (parMinute[Math.floor(tf / 60)] = parMinute[Math.floor(tf / 60)] || []).push(bf);
      var kf = Math.round(tf / 5);
      if (pleins[kf]) continue;            /* la seconde a parlé : on ne touche à rien */
      if (ajout[kf] == null) ajout[kf] = [kf * 5, bf, pointsFins[_p][2] === 'continu',
                                          Math.floor(tf / 60)];
    }
    /* v1657, MOT POUR MOT : une minute RECOLLÉE ne signe pas un record. Elle
       se dessine — c'est une vraie mesure — mais elle ne calcule pas. En
       dessous de quatre valeurs on ne sait pas juger : on garde. */
    var minutesSaines = {};
    Object.keys(parMinute).forEach(function (m) {
      var vs = parMinute[m];
      minutesSaines[m] = !(vs.length >= 4 && typeof minuteCoherente === 'function'
                           && !minuteCoherente(vs));
    });
    Object.keys(ajout).forEach(function (k) {
      var a = ajout[k];
      fineS.push([a[0], a[1], a[2] && minutesSaines[a[3]] === true]);
      bouches++;
    });
    if (bouches) fineS.sort(function (a, b) { return a[0] - b[0]; });
  }

  return {
    hrT: idxDense(fineS.length, function (i) { return fineS[i][1]; }, 1200)
           .map(function (i) { return [fineS[i][0], fineS[i][1]]; }),
    /* La série de CALCUL : la seconde, plus les tranches bouchées par le canal
       continu de la montre. Les minutes recollées ne calculent rien. */
    serieCanon: fineS.filter(function (x) { return x.length < 3 || x[2] === true; })
                     .map(function (x) { return x[1]; }),
    couvHR: couvS / dur,
    bouches: bouches
  };
};

/* ═══ 31 oct. 2026 — LA SECONDE D'ABORD, LA MINUTE DANS SES TROUS ═══════════════

   Le foot de Dino, 12:03 → 12:51 : le lien Bluetooth est tombé une vingtaine de
   fois. `hrSec_` portait 1 590 secondes mesurées (33 minutes sur 48 touchées), la
   série minute 34 points (14 trous), et la mémoire minute du bracelet n'est jamais
   arrivée. Face à une minute qualifiée, `flFicheSeconde` exige 75 % des minutes :
   elle a rendu `null`, et la fiche a dessiné les 34 points de la minute — pas une
   des 1 590 secondes. Et la minute, elle, ne bouchait jamais les trous de la
   seconde : le comblement de la v3000 (`flSerieCanonique`) ne touche que les
   CHIFFRES.

   LA COURBE PREND LA SECONDE D'ABORD : chaque tranche de cinq secondes mesurée se
   dessine (la médiane de la tranche, la forme de `flFicheSeconde`). LA MINUTE SE
   DESSINE LÀ OÙ LA SECONDE MANQUE : une minute ENTIÈRE sans une tranche mesurée
   prend son point, posé au début de la minute comme la série minute le pose ; une
   minute qui en a une ne bouge pas. Rien n'est interpolé : un trou que ni l'une ni
   l'autre n'a mesuré reste un trou.

   SEUL LE DESSIN CHANGE. `flEffData` calcule moyenne, zones et maximum sur la série
   qu'il a choisie (la minute, ou la seconde qualifiée) — elle ne bouge pas. Le
   dessin part à côté (`_hrDessin`), et c'est lui seul que la fiche reçoit dans
   `hrT`. Banc : tests/test-courbe-seance-trous.js (la vraie séance du 31).

   Deux portes, des PAIRES [secondesDepuisDepart, bpm] (v1790), 1 200 points au plus :
     · `flCourbeTrouee(fine, minute, idxDense)` bouche les trous d'une série fine
       déjà prête (la seconde qualifiée) ; `null` s'il n'y a rien à boucher ;
     · `flCourbeSecondeMinute(K, sm0, dur, lireSecondes, idxDense, minute)` : la
       seconde d'une fenêtre, SANS seuil de couverture, et la minute dans ses trous ;
       `null` sans une seconde mesurée. */
window.flCourbeTrouee = function (fine, minute, idxDense) {
  if (!fine || !fine.length || !minute || !minute.length) return null;
  var parlee = {};
  for (var i = 0; i < fine.length; i++) parlee[Math.floor(fine[i][0] / 60)] = 1;
  var out = fine.map(function (p) { return [p[0], p[1]]; }), ajout = 0, vues = {};
  for (var j = 0; j < minute.length; j++) {
    var m = minute[j];
    if (!m || !(m[1] > 25 && m[1] < 240)) continue;
    var mn = Math.floor(m[0] / 60);
    if (parlee[mn] || vues[mn]) continue;   /* la seconde a parlé dans cette minute : on n'y touche pas */
    vues[mn] = 1; out.push([m[0], m[1]]); ajout++;
  }
  if (!ajout) return null;
  out.sort(function (a, b) { return a[0] - b[0]; });
  if (typeof idxDense !== 'function') return out;
  return idxDense(out.length, function (k) { return out[k][1]; }, 1200)
           .map(function (k) { return [out[k][0], out[k][1]]; });
};

window.flCourbeSecondeMinute = function (K, sm0, dur, lireSecondes, idxDense, minute) {
  if (typeof lireSecondes !== 'function' || typeof idxDense !== 'function' || !(dur > 0)) return null;
  var sec = null;
  try { sec = lireSecondes(K); } catch (e) { return null; }
  if (!sec || !sec.length) return null;
  var s0 = sm0 * 60, s1 = (sm0 + dur) * 60, seaux = {};
  for (var i = 0; i < sec.length; i++) {
    var t = sec[i][0], v = sec[i][1];
    if (t < s0 || t > s1 || !(v > 25 && v < 240)) continue;
    var k = Math.round((t - s0) / 5);
    (seaux[k] = seaux[k] || []).push(v);
  }
  var fine = Object.keys(seaux).map(Number).sort(function (a, b) { return a - b; })
    .map(function (k) {
      var vv = seaux[k].slice().sort(function (a, b) { return a - b; });
      return [k * 5, vv[vv.length >> 1]];
    });
  if (!fine.length) return null;
  var tout = window.flCourbeTrouee(fine, minute, null) || fine;
  return idxDense(tout.length, function (k) { return tout[k][1]; }, 1200)
           .map(function (k) { return [tout[k][0], tout[k][1]]; });
};

/* ═══ v2991 — 30 oct. 2026 — LA SECONDE QUE LE BRACELET GARDE, JUSQU'À LA FICHE ══

   Jason (Fitcare), par écrit : « heart rate: one record per second in sports
   mode ». Le natif verse ces points — un `.sport` (une valeur par seconde,
   pas = (fin − début) / n), ou un segment `.hr` au pas de moins d'une minute —
   sous `hrhistory`, `canal: 'hrSeconde'`, `points: [[instant, bpm]]`. Le
   routeur d'index.html les envoie ICI, et plus jamais par le chemin minute :
   celui-là range chaque valeur à sa MINUTE (soixante valeurs, la dernière
   gagne) puis efface le direct de toute la plage — une série à la seconde
   repliée sur elle-même.

   TROIS RANGEMENTS, ET AUCUN N'ÉCRASE :
     · `hrSec_<aujourd'hui>` par `flSecondesRattraper` — le magasin que la fiche
       lit d'abord (`flFicheSeconde`) ; une seconde déjà vécue en direct garde
       la main ;
     · `hrfine_<jour>` { minute: [[seconde, bpm]] } — la série fine de la
       séance (`flHrFine`), N'IMPORTE QUEL jour : une séance lue après minuit
       garde sa courbe ; une seconde déjà là n'est pas remplacée ;
     · `watch_<jour>.hr` — la MÉDIANE de chaque minute, seulement là où la
       minute est VIDE. La mémoire minute du bracelet et le direct gardent les
       leurs : c'est la règle de Dino pour ce lot.

   `dep` porte ce que ce fichier ne lit pas nu (garde-liaisons) :
     { DB, jourVivant(jk), sauver(jk), rattraper(points), detecter(jk) }.
   Rend un compte rendu, que le routeur écrit au journal. */
window.flMemoireSeconde = function (data, dep) {
  var r = { points: 0, jours: 0, secondes: 0, fines: 0, minutes: 0 };
  if (!data || !dep || !dep.DB) return r;
  var brut = [];
  if (Array.isArray(data.points)) brut = data.points;
  else if (Array.isArray(data.valeurs)) {
    var t0 = +data.debut, dt = +data.intervalle;
    if (!(t0 > 1000000000) || !(dt > 0)) return r;
    for (var i = 0; i < data.valeurs.length; i++) brut.push([t0 + i * dt, +data.valeurs[i]]);
  }
  var vus = {}, pts = [];
  for (var k = 0; k < brut.length; k++) {
    var p = brut[k]; if (!p || p.length < 2) continue;
    var ts = Math.round(+p[0]), b = Math.round(+p[1]);
    if (!(ts > 1000000000) || !(b > 25 && b < 240) || vus[ts]) continue;
    vus[ts] = 1; pts.push([ts, b]);
  }
  pts.sort(function (a, b2) { return a[0] - b2[0]; });
  r.points = pts.length;
  if (!pts.length) return r;

  /* 1 · la seconde du jour (`hrSec_`) — la fonction filtre elle-même le jour. */
  try { if (typeof dep.rattraper === 'function') r.secondes = dep.rattraper(pts) || 0; } catch (e) {}

  /* 2 · par jour et par minute */
  var parJour = {};
  pts.forEach(function (x) {
    var d = new Date(x[0] * 1000);
    var jk = d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
    var mn = d.getHours() * 60 + d.getMinutes();
    var j = (parJour[jk] = parJour[jk] || {});
    (j[mn] = j[mn] || []).push([d.getSeconds(), x[1]]);
  });
  Object.keys(parJour).forEach(function (jk) {
    r.jours++;
    var jour = parJour[jk];
    /* 2a · la série fine de la séance */
    try {
      var cle = 'hrfine_' + jk, fin = dep.DB.get(cle, null) || {}, change = false;
      Object.keys(jour).forEach(function (mn) {
        var carte = {};
        (fin[mn] || []).forEach(function (x) { if (Array.isArray(x)) carte[x[0]] = x[1]; });
        jour[mn].forEach(function (x) {
          if (carte[x[0]] == null) { carte[x[0]] = x[1]; r.fines++; change = true; }
        });
        fin[mn] = Object.keys(carte).map(Number).sort(function (a, b2) { return a - b2; })
                        .map(function (s) { return [s, carte[s]]; });
      });
      if (change) dep.DB.set(cle, fin);
    } catch (e) {}
    /* 2b · la minute, là où elle est vide */
    try {
      var vivant = typeof dep.jourVivant === 'function';
      var w = vivant ? dep.jourVivant(jk) : (dep.DB.get('watch_' + jk, null) || {});
      if (!w) return;
      if (!Array.isArray(w.hr)) w.hr = [];
      var deja = {};
      w.hr.forEach(function (e) { deja[e[0]] = 1; });
      var ajout = 0;
      Object.keys(jour).forEach(function (mn) {
        if (deja[+mn]) return;
        var v = jour[mn].map(function (x) { return x[1]; }).sort(function (a, b2) { return a - b2; });
        w.hr.push([+mn, v[v.length >> 1]]);
        ajout++;
      });
      if (ajout) {
        w.hr.sort(function (a, b2) { return a[0] - b2[0]; });
        if (vivant && typeof dep.sauver === 'function') dep.sauver(jk);
        else dep.DB.set('watch_' + jk, w);
        r.minutes += ajout;
      }
    } catch (e) {}
    try { if (typeof dep.detecter === 'function') dep.detecter(jk); } catch (e) {}
  });
  return r;
};
