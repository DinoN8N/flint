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

/* ═══ 6 nov. 2026 — DIX MINUTES, UN MARATHON, UN TRAIL DE TRENTE HEURES ══════════

   Dino : « ça doit marcher pour des marathons, des longs trails, des séances de 10 min,
   tout le temps ». Mesuré sur le vrai moteur (tests/test-seances-longues.js) avant ce lot :
     · `hrSec_` jetait tout au-delà de 5 400 secondes : la muscu de 1 h 41 perdait ses
       11 premières minutes à la seconde, un marathon de 4 h ses 2 h 30 de départ, et une
       séance de 12 h son vrai pic (165 affiché pour 186) ;
     · une séance qui passe minuit S'ARRÊTAIT À MINUIT : la minute, la seconde et l'effort ne
       lisaient que le jour du départ (2 h de 23:00 à 01:00 : moyenne 153 pour 142 ; 30 h de
       trail : les 12 dernières heures n'existaient pas).

   POURQUOI ON N'A PAS JUSTE MONTÉ LE PLAFOND. 86 400 secondes, c'est 2 Mo de localStorage,
   réécrits toutes les 15 s, sous un quota de 5 Mo déjà occupé (CaveBase) : on aurait échangé
   un trou contre une panne. Le magasin reste donc BORNÉ, et il devient À PLUSIEURS FINESSES :
   la fiche ne dessine que 1 200 points et raisonne par tranches de 5 s, personne ne lit
   jamais la seconde vieille de trois heures.

     moins de 20 min : à la seconde · jusqu'à 4 h : 5 s · jusqu'à 10 h : 15 s · au-delà : 60 s

   Une entrée regroupée s'écrit [début, médiane, pas] ou [début, médiane, pas, haut] : au-delà
   de 5 s, le plus haut de ses tranches voyage avec elle, sinon le pic d'un ultra s'effacerait
   dans la médiane. Tout lecteur de `[0]` et `[1]` continue de marcher. Une journée pleine
   tient en ~6 100 entrées ; le regroupement ne se déclenche qu'à 7 000, soit au plus une fois
   toutes les vingt minutes. Un jour passé n'a plus besoin que de 15 s sur ses six dernières
   heures (une séance qui passe minuit) et de 60 s avant. */
window.FL_SEC_PLAFOND = 7000;
window.flSecCompacter = function (a, passe) {
  if (!a || !a.length) return a;
  var fin = a[a.length - 1][0];
  function pasVoulu(age) {
    if (passe) return age < 21600 ? 15 : 60;
    return age < 1200 ? 1 : age < 14400 ? 5 : age < 36000 ? 15 : 60;
  }
  var cur = a, niveaux = [5, 15, 60];
  for (var n = 0; n < niveaux.length; n++) {
    var pas = niveaux[n], out = [], i = 0;
    while (i < cur.length) {
      var e = cur[i];
      if ((e[2] || 1) >= pas || pasVoulu(fin - e[0]) < pas) { out.push(e); i++; continue; }
      var cle = Math.floor(e[0] / pas) * pas, vals = [], haut = -1;
      while (i < cur.length && Math.floor(cur[i][0] / pas) * pas === cle && (cur[i][2] || 1) < pas
             && pasVoulu(fin - cur[i][0]) >= pas) {
        vals.push(cur[i][1]);
        haut = Math.max(haut, cur[i][3] != null ? cur[i][3] : cur[i][1]);
        i++;
      }
      vals.sort(function (x, y) { return x - y; });
      var med = vals[vals.length >> 1];
      /* À 5 s, pas de `haut` : `flFicheSeconde` prend la médiane de cinq secondes, justement
         pour qu'une seconde aberrante ne signe pas un record. */
      out.push(pas > 5 && haut > med ? [cle, med, pas, haut] : [cle, med, pas]);
    }
    cur = out;
  }
  return cur;
};

/* Déplie une entrée en tranches de 5 s, le temps qu'elle représente : les zones et la moyenne
   pèsent par le temps, une entrée de 60 s ne doit pas compter pour une tranche. Son `haut`
   prend une tranche, au milieu : le pic reste vrai, et il pèse 5 s. */
/* ═══ 6 nov. 2026 — LA COURBE : DE VRAIS POINTS, DE MOINS EN MOINS ═══════════════

   Dino, sur la courbe lissée d'un marathon : « je veux les fluctuations, de vraies fluctuations
   brutes… on calibre le nombre de points… sur un trail de 8 heures, toutes les minutes ». On ne
   moyenne donc rien et on ne relie plus le plus bas et le plus haut de chaque tranche, ce qui
   exagérait chaque oscillation : chaque point dessiné est une VALEUR MESURÉE.

     jusqu'à 1 h 40 : tout (une valeur toutes les 5 s) · 2 h : ~7 s · 4 h : 20 s · 6 h : 38 s
     8 h à 20 h : une par minute · au-delà : 1 200 points

   Dans chaque tranche, on garde le point qui dessine le mieux la forme (LTTB, Largest Triangle
   Three Buckets) : les vraies montées et descentes restent, sans fabriquer une seule valeur. Le
   vrai pic y est toujours. Seul le dessin passe par ici : moyenne, zones et effort sont calculés
   sur toute la séance. */
window.flPasCourbe = function (durS) {
  var h = durS / 3600;
  if (h <= 100 / 60) return 5;
  return Math.max(Math.min(60, 5 * Math.pow(h / (100 / 60), 1.6)), durS / 1190);
};
window.flPointsCourbe = function (pts, durS) {
  if (!pts || pts.length < 3) return pts;
  var pas = window.flPasCourbe(durS);
  if (pas <= 5 && pts.length <= 1200) return pts;
  var seaux = [], cour = null, cle = null, i;
  for (i = 0; i < pts.length; i++) {
    var k = Math.floor(pts[i][0] / pas);
    if (k !== cle) { cour = []; seaux.push(cour); cle = k; }
    cour.push(pts[i]);
  }
  var out = [pts[0]], prec = pts[0], dernier = pts[pts.length - 1];
  for (var s = 0; s < seaux.length; s++) {
    var c = seaux[s], suiv = seaux[s + 1], ax = dernier[0], ay = dernier[1];
    if (suiv) {
      ax = 0; ay = 0;
      for (i = 0; i < suiv.length; i++) { ax += suiv[i][0]; ay += suiv[i][1]; }
      ax /= suiv.length; ay /= suiv.length;
    }
    var mieux = c[0], aire = -1;
    for (i = 0; i < c.length; i++) {
      var a = Math.abs((prec[0] - ax) * (c[i][1] - prec[1]) - (prec[0] - c[i][0]) * (ay - prec[1]));
      if (a > aire) { aire = a; mieux = c[i]; }
    }
    if (mieux !== out[out.length - 1]) out.push(mieux);
    prec = mieux;
  }
  if (out[out.length - 1] !== dernier) out.push(dernier);
  var pic = pts[0];
  for (i = 1; i < pts.length; i++) if (pts[i][1] > pic[1]) pic = pts[i];
  if (out.indexOf(pic) < 0) {
    var kp = Math.floor(pic[0] / pas), j = 0;
    while (j < out.length - 1 && Math.floor(out[j][0] / pas) < kp) j++;
    if (Math.floor(out[j][0] / pas) === kp && j > 0 && j < out.length - 1) out[j] = pic;
    else out.splice(j, 0, pic);
  }
  return out;
};

/* Le dessin rendu à la fiche. Un binaire qui sait lire le pas (`FL_NATIF_COURBE`, posé par la coquille
   native) reçoit de vrais points. L'App Store 1.1 ne le sait pas : il recalcule les zones sur les
   points reçus et lit un écart comme un trou. Il garde donc le plus bas et le plus haut par tranche,
   comme avant, et son plafond de 1 200 points. */
window.flDessinCourbe = function (pts, durS, idxDense) {
  if (!pts) return pts;
  if (window.FL_NATIF_COURBE) return window.flPointsCourbe(pts, durS);
  if (pts.length <= 1200 || typeof idxDense !== 'function') return pts;
  return idxDense(pts.length, function (k) { return pts[k][1]; }, 1200).map(function (k) { return pts[k]; });
};

window.flSecCases = function (e, cb) {
  var pas = e[2] || 1;
  if (pas <= 5) { cb(e[0], e[1], false); return; }
  var n = Math.round(pas / 5), m = n >> 1;
  for (var q = 0; q < n; q++) cb(e[0] + q * 5, (e[3] != null && q === m) ? e[3] : e[1], true);
};

/* Les secondes qui reviennent, téléphone en poche : celles d'un jour passé. Le rejeu du natif
   porte 36 h. Sans ça, un trail qui passe minuit perdait tout ce qui précède minuit. Autonome
   (localStorage) : seul le jour courant vit dans la closure d'index.html. */
window.flSecRattraperPasses = function (parJour, jourDe) {
  var total = 0;
  Object.keys(parJour).forEach(function (j) {
    if (j !== jourDe(1) && j !== jourDe(2)) return;
    try {
      var cle = 'hrSec_' + j, v = localStorage.getItem(cle), a = v ? JSON.parse(v) : [], vus = {}, n = 0;
      a.forEach(function (e) { for (var q = 0; q < (e[2] || 1); q++) vus[e[0] + q] = 1; });
      parJour[j].forEach(function (p) {
        var d = new Date(p[0] * 1000), s = d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds();
        if (vus[s]) return;
        vus[s] = 1; a.push([s, p[1]]); n++;
      });
      if (!n) return;
      a.sort(function (x, y) { return x[0] - y[0]; });
      localStorage.setItem(cle, JSON.stringify(window.flSecCompacter(a, true)));
      total += n;
    } catch (e) {}
  });
  return total;
};

/* Un jour qui vient de passer se resserre (15 s, 60 s). Il reste deux jours : le temps qu'une
   séance qui a passé minuit, une ou deux fois, s'arrête et écrive sa fiche. */
window.flRecalculerVeilles = function () {
  if (typeof tk !== 'function' || typeof window.flRecalculerJour !== 'function') return;
  [1, 2].forEach(function (n) {
    var j = tk(-n), ss = null;
    try { ss = DB.get('sessions_' + j, null); } catch (e) {}
    if ((ss || []).some(function (s) { return s && s.endMin > n * 1440 && (s.auto === false || s.gps || s.geste); })) window.flRecalculerJour(j);
  });
};
/* Le jour de départ d'une séance en direct. Le jalon revient toutes les trois minutes et le moteur
   peut l'avoir manqué avant minuit : un départ plus tard que maintenant est parti hier. Le jalon
   encore vif garde son jour : une séance de plus de 24 h repasse sur son heure de départ. */
window.flJourEnDirect = function (deb, pd) {
  if (pd && pd.deb === deb && pd.jour && Date.now() - (+pd.ts || 0) <= ((+pd.ttl > 0) ? +pd.ttl : 180000)) return pd.jour;
  var n = new Date();
  return deb > n.getHours() * 60 + n.getMinutes() + 1 ? tk(-1) : tk(0);
};
window.flSecPasser = function (j) {
  try {
    var cle = 'hrSec_' + j, v = localStorage.getItem(cle);
    if (!v) return;
    var a = JSON.parse(v), b = window.flSecCompacter(a, true);
    if (b.length !== a.length) localStorage.setItem(cle, JSON.stringify(b));
  } catch (e) {}
};

/* La seconde d'une séance partie un jour passé : ses jours mis bout à bout, sur le TEMPS DU JOUR
   DE DÉPART (minuit + 86 400 s). `flFicheSeconde` filtre ensuite sur sa fenêtre. */
window.flSecondesPassees = function (j, jourDe, aujourdhui) {
  var n = j === jourDe(1) ? 1 : j === jourDe(2) ? 2 : 0;
  if (!n) return null;
  var out = [], q0 = String(j).split('-');
  for (var d = n; d >= 0; d--) {
    /* Les vrais minuits, pas 86 400 s : un jour de changement d'heure dure 23 ou 25 heures. */
    var a = null, dec = Math.round((new Date(+q0[0], +q0[1] - 1, +q0[2] + (n - d)) - new Date(+q0[0], +q0[1] - 1, +q0[2])) / 1000);
    try { a = d ? JSON.parse(localStorage.getItem('hrSec_' + jourDe(d)) || 'null') : aujourdhui; } catch (e) { a = null; }
    if (!a) continue;
    for (var i = 0; i < a.length; i++) {
      var e = a[i];
      out.push(e.length > 2 ? [e[0] + dec, e[1], e[2], e[3]] : [e[0] + dec, e[1]]);
    }
  }
  return out.length ? out : null;
};

/* La minute au-delà de minuit : `watch_` et `hrfine_` sont rangés par jour. Rend la série du
   jour de départ, prolongée par les jours suivants en minutes qui dépassent 1440. */
window.flJoursSuivants = function (k, finMin) {
  var out = [];
  if (!(finMin > 1440) || !k) return out;
  var q = String(k).split('-');
  for (var d = 1; d * 1440 < finMin && d <= 3; d++) {
    var x = new Date(+q[0], +q[1] - 1, +q[2] + d);
    out.push({ k: x.getFullYear() + '-' + (x.getMonth() + 1) + '-' + x.getDate(), dec: d * 1440 });
  }
  return out;
};
window.flHrAuDelaDeMinuit = function (k, hr, finMin) {
  var suite = window.flJoursSuivants(k, finMin);
  if (!suite.length) return hr;
  var out = (hr || []).slice();
  suite.forEach(function (s) {
    var w = null;
    try { w = (typeof watchOf === 'function') ? watchOf(s.k) : DB.get('watch_' + s.k, null); } catch (e) {}
    if (!w || !w.hr) return;
    w.hr.forEach(function (p) { if (p[0] + s.dec <= finMin) out.push([p[0] + s.dec, p[1]]); });
  });
  return out;
};
window.flPtsAuDelaDeMinuit = function (k, pts, finMin) {
  var suite = window.flJoursSuivants(k, finMin);
  if (!suite.length || typeof flPtsEveil !== 'function') return pts;
  var out = (pts || []).slice();
  suite.forEach(function (s) {
    var p = null;
    try { p = flPtsEveil(s.k); } catch (e) {}
    (p || []).forEach(function (x) { if (x[0] + s.dec <= finMin) out.push([x[0] + s.dec, x[1]]); });
  });
  return out;
};
/* Une séance déclarée qui a passé minuit se termine « demain ». Le lendemain, la détection au cœur
   voyait ses battements sans séance et écrivait une « Activité » en double. On rend les minutes
   qu'une séance déclarée d'un jour précédent occupe encore, comme une frontière (`syncSessions`) :
   ce qui suit la fin de la séance reste une activité à part. */
window.flFinVeille = function (K) {
  var q = String(K).split('-'), limite = 0;
  for (var d = 1; d <= 3; d++) {
    var x = new Date(+q[0], +q[1] - 1, +q[2] - d), kj = x.getFullYear() + '-' + (x.getMonth() + 1) + '-' + x.getDate(), ss = null;
    try { ss = DB.get('sessions_' + kj, null); } catch (e) {}
    (ss || []).forEach(function (s) {
      if (s && (s.auto === false || s.gps || s.geste) && s.endMin != null) limite = Math.max(limite, s.endMin - d * 1440);
    });
  }
  return limite;
};
window.flFrontieresVeille = function (K) {
  var l = window.flFinVeille(K);
  return l > 0 ? [{ deb: 0, fin: l, gps: null }] : [];
};
window.flSansAutoDeLaVeille = function (K, cur) {
  var l = window.flFinVeille(K);
  if (!(l > 0) || !cur) return cur;
  return cur.filter(function (s) {
    return !(s && s.auto === true && !s.geste && !s.gps && s.startMin != null && s.startMin < l);
  });
};
window.flRecalculerJoursSuivants = function (K, s) {
  try {
    if (!s || s.endMin == null || typeof window.flRecalculerJour !== 'function') return;
    window.flJoursSuivants(K, s.endMin).forEach(function (j) { window.flRecalculerJour(j.k); });
  } catch (e) {}
};
/* Les pas d'une séance au-delà de minuit : `flPasParMinute` est rangé par jour. */
window.flPasAuDelaDeMinuit = function (k, finMin, arrets) {
  var out = { tot: 0, vus: 0 };
  window.flJoursSuivants(k, finMin).forEach(function (s) {
    var pm = null;
    try { pm = (typeof flPasParMinute === 'function') ? flPasParMinute(s.k) : null; } catch (e) {}
    if (!pm || !pm.m) return;
    for (var mn = 0; mn < Math.min(1440, Math.round(finMin - s.dec)); mn++) {
      if (arrets && arrets.length && typeof flEnPause === 'function' && flEnPause(mn + s.dec, arrets)) continue;
      if (pm.vu[mn]) { out.tot += (pm.m[mn] || 0); out.vus++; }
    }
  });
  return out;
};
/* Le jour où une séance mesurée est PARTIE. Le Stop arrive après minuit : le jour affiché n'est plus
   le bon. Sa fiche disait « 0 % mesuré », et le semis la recréait au bon jour au lancement suivant :
   deux cartes pour une seule sortie. On part de maintenant moins la durée (arrêts compris), et l'heure
   de départ annoncée tranche à une minute près. */
window.flJourDeDepart = function (debut, duree, pauses) {
  var ar = 0;
  (pauses || []).forEach(function (p) { ar += Math.max(0, (+p[1] || 0) - (+p[0] || 0)); });
  var maintenant = Date.now(), estime = maintenant - (Math.round(+duree || 0) + ar) * 60000;
  var hm = String(debut || '').split(':'), h = +hm[0], m = +hm[1], d = new Date(estime);
  var cle = function (x) { return x.getFullYear() + '-' + (x.getMonth() + 1) + '-' + x.getDate(); };
  if (!isFinite(h) || !isFinite(m) || hm.length < 2) return cle(d);
  /* Le jour dont cette heure de départ tombe au plus près de l'estimation, jamais dans le futur. */
  var mieux = null, ecart = Infinity;
  for (var q = -1; q <= 1; q++) {
    var c = new Date(d.getFullYear(), d.getMonth(), d.getDate() + q, h, m);
    if (c.getTime() > maintenant) continue;
    var e = Math.abs(c.getTime() - estime);
    if (e < ecart) { ecart = e; mieux = c; }
  }
  return cle(mieux || d);
};
window.flHrFineAuDela = function (k, hf, finMin) {
  var suite = window.flJoursSuivants(k, finMin);
  if (!suite.length) return hf;
  var out = hf ? Object.assign({}, hf) : null;
  suite.forEach(function (s) {
    var h = null;
    try { h = DB.get('hrfine_' + s.k, null); } catch (e) {}
    if (!h) return;
    out = out || {};
    Object.keys(h).forEach(function (m) { if (+m + s.dec <= finMin) out[+m + s.dec] = h[m]; });
  });
  return out;
};

/* Rend null quand la seconde ne suffit pas, sinon :
     { hrT:       [[secondesDepuisDepart, bpm]] — plafonné pour le dessin,
       serieCanon: [bpm] — la série de référence, non décimée,
       couvHR:    part des minutes de la fenêtre couvertes (0..1) }
   `lireSecondes(K)` et `idxDense(n, at, plafond)` viennent de l'appelant. */
window.flFicheSeconde = function (K, sm0, dur, dejaReel, lireSecondes, idxDense,
                                  pointsFins, minuteCoherente, fen) {
  if (typeof lireSecondes !== 'function' || typeof idxDense !== 'function') return null;
  if (!(dur > 0)) return null;
  var sec = null;
  try { sec = lireSecondes(K); } catch (e) { return null; }
  if (!sec || !sec.length) return null;

  /* 6 nov. 2026 — `dur` est la durée d'EFFORT : la fenêtre réelle s'étend des arrêts, et les minutes
     d'arrêt n'entrent pas. Sans ça, une séance de 12 h dont 2 h de pause perdait ses deux dernières
     heures et comptait les deux heures de repos (moyenne 134 pour 150). */
  var mur = (fen && fen.mur > 0) ? fen.mur : dur, arrets = (fen && fen.pauses) || [];
  var enArret = function (t) { return arrets.length && typeof flEnPause === 'function' && flEnPause(sm0 + (t - s0) / 60, arrets); };
  var s0 = sm0 * 60, s1 = (sm0 + mur) * 60, seauxS = {}, minutesS = {}, grossiers = {};
  var poser = function (t2, v2, grossier) {
    if (t2 < s0 || t2 > s1 || enArret(t2)) return;
    if (!(v2 > 25 && v2 < 240)) return;
    minutesS[Math.floor((t2 - s0) / 60)] = 1;
    var k4 = Math.round((t2 - s0) / 5);
    if (grossier) grossiers[k4] = 1;
    (seauxS[k4] = seauxS[k4] || []).push(v2);
  };
  for (var _s = 0; _s < sec.length; _s++) {
    if ((sec[_s][2] || 1) > 5 && typeof window.flSecCases === 'function') window.flSecCases(sec[_s], poser);
    else poser(sec[_s][0], sec[_s][1], false);
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
  /* 6 nov. 2026 — une tranche dépliée d'une entrée regroupée (15 ou 60 s) n'a pas « parlé » : la
     mémoire du bracelet, plus fine, passe devant elle. */
  Object.keys(seauxS).forEach(function (k) { if (!grossiers[k]) pleins[k] = 1; });
  if (pointsFins && pointsFins.length) {
    var ajout = {}, parMinute = {};
    for (var _p = 0; _p < pointsFins.length; _p++) {
      var tf = pointsFins[_p][0], bf = pointsFins[_p][1];
      if (!(tf >= 0 && tf <= mur * 60) || enArret(s0 + tf)) continue;
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
    var remplaces = {};
    Object.keys(ajout).forEach(function (k) { remplaces[ajout[k][0]] = 1; });
    if (Object.keys(grossiers).length) fineS = fineS.filter(function (x) { return !remplaces[x[0]]; });
    Object.keys(ajout).forEach(function (k) {
      var a = ajout[k];
      fineS.push([a[0], a[1], a[2] && minutesSaines[a[3]] === true]);
      bouches++;
    });
    if (bouches) fineS.sort(function (a, b) { return a[0] - b[0]; });
  }

  return {
    hrT: (typeof window.flPointsCourbe === 'function')
           ? fineS.map(function (x) { return [x[0], x[1]]; })   /* le dessin s'allège à la sortie de la fiche */
           : idxDense(fineS.length, function (i) { return fineS[i][1]; }, 1200)
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
  if (typeof idxDense !== 'function' || typeof window.flPointsCourbe === 'function') return out;
  return idxDense(out.length, function (k) { return out[k][1]; }, 1200)
           .map(function (k) { return [out[k][0], out[k][1]]; });
};

window.flCourbeSecondeMinute = function (K, sm0, dur, lireSecondes, idxDense, minute, fen) {
  if (typeof lireSecondes !== 'function' || typeof idxDense !== 'function' || !(dur > 0)) return null;
  var sec = null;
  try { sec = lireSecondes(K); } catch (e) { return null; }
  if (!sec || !sec.length) return null;
  var mur = (fen && fen.mur > 0) ? fen.mur : dur, arrets = (fen && fen.pauses) || [];
  var s0 = sm0 * 60, s1 = (sm0 + mur) * 60, seaux = {};
  var poser = function (t, v) {
    if (t < s0 || t > s1 || !(v > 25 && v < 240)) return;
    if (arrets.length && typeof flEnPause === 'function' && flEnPause(sm0 + (t - s0) / 60, arrets)) return;
    var k = Math.round((t - s0) / 5);
    (seaux[k] = seaux[k] || []).push(v);
  };
  for (var i = 0; i < sec.length; i++) {
    if ((sec[i][2] || 1) > 5 && typeof window.flSecCases === 'function') window.flSecCases(sec[i], poser);
    else poser(sec[i][0], sec[i][1]);
  }
  var fine = Object.keys(seaux).map(Number).sort(function (a, b) { return a - b; })
    .map(function (k) {
      var vv = seaux[k].slice().sort(function (a, b) { return a - b; });
      return [k * 5, vv[vv.length >> 1]];
    });
  if (!fine.length) return null;
  var tout = window.flCourbeTrouee(fine, minute, null) || fine;
  if (typeof window.flPointsCourbe === 'function') return tout;
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
