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
