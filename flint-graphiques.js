/* CE QU'UN DOIGT PEUT OUVRIR, ET CE QU'ON PRÉPARE AVANT LUI
   ═══════════════════════════════════════════════════════════════════════════
   (1er septembre 2026)

   Deux choses vivent ici, et elles répondent à la même phrase de Dino : « je
   clique sur Cardio, sur Température, sur FC moyenne — un chargement Flint
   avec un instant. Je l'ai pour toutes les métriques. »

     · `flHebdoNuit`     — les deux métriques de nuit qui manquaient à
                           `FL_HEBDO` : température cutanée et oxygénation.
                           Leurs lignes du tableau de bord portaient un chevron
                           depuis la v1091 et n'ouvraient RIEN.
     · `flHebdoPriorite` — la liste de ce que la passe de fond calcule d'avance,
                           pour que le doigt tombe sur du prêt.

   POURQUOI DANS UN FICHIER À PART, et pas dans `index.html` avec le reste de
   la table : le cliquet du découpage web (garde-build.sh, plafond 37 500
   lignes) l'a refusé, et il a raison — « le code neuf a un métier : il va dans
   un fichier flint-<metier>.js ». Celui-ci est le métier des graphiques
   hebdomadaires. Les deux fonctions ne font que RENDRE des valeurs ; c'est
   `index.html` qui les branche, à l'endroit et au moment où il les lit.

   RIEN ICI N'EST OBLIGATOIRE. Fichier absent ou fonction manquante : la table
   perd deux métriques et la passe ne prépare rien. L'app reste juste — elle
   est seulement froide au premier doigt, et deux chevrons redeviennent muets.
   C'est la règle des `flint-*.js` de la maison : on se détache, on ne se rend
   pas indispensable.                                                          */

/* ═══════════════════════════════════════════════════════════════════════════
   1 · LES DEUX MÉTRIQUES DE NUIT
   ═══════════════════════════════════════════════════════════════════════════ */
window.flHebdoNuit = function () {
 try {
  return {
  /* ═══ 1er septembre 2026 — DEUX CHEVRONS QUI N'OUVRAIENT RIEN ══════════════

     Dino : « je clique sur Cardio, je clique sur Température, je clique dessus,
     il y a un chargement Flint avec un instant. »

     Il n'y avait pas de graphique DERRIÈRE. Le tableau de bord pose ces deux
     lignes avec `fleche:true` depuis la v1091 (`cle:'temp'`, `cle:'spo2'`), le
     natif ouvre l'écran de détail au doigt — et `FL_HEBDO` ne les connaissait
     pas : `flHebdoDetail` sortait par son refus, l'écran affichait « Un
     instant. » le temps de l'aller-retour, puis « Pas encore de mesure sur
     cette période », semaine après semaine, à jamais. Le commentaire de
     `flPrechargerGraphiques` le disait tout haut depuis la v1481 — « le tableau
     de bord cite spo2 et temp, qui n'ont pas de graphique » — sans que personne
     ne referme le chevron ni n'ouvre la courbe.

     C'est « aucun bouton qui ment » (CONVENTIONS), et la mesure existe : ces
     deux séries sont exactement celles que la ligne affiche déjà, une valeur
     par nuit, par la MÊME porte (`flTempNuit`, `flSpo2Nuit`). On ne calcule
     rien de neuf ici — on rend simplement lisible dans le temps ce qu'on
     montrait déjà pour une seule nuit.

     UNE VALEUR PAR NUIT, ET AUCUN ZÉRO : les deux lecteurs rendent `null` quand
     la nuit n'a pas été mesurée (bracelet retiré, moins de douze mesures de
     SpO2), et `null` reste un trou dans la courbe. Ni `vide0` ni `vu` : un zéro
     n'a aucun sens sur une température de peau ni sur une oxygénation. */
  temp:{title:'Température cutanée',lab:'TA TEMPÉRATURE DE NUIT',heroLab:'MOYENNE / NUIT',unit:'°C',kind:'line',fmt:flhDec,
   get:function(off){try{var t=(typeof flTempNuit==='function')?flTempNuit(off):null;
    return (t&&t.valeur!=null)?t.valeur:null;}catch(e){return null;}}},
  spo2:{title:'Oxygénation du sang',lab:'TON OXYGÉNATION',heroLab:'MOYENNE / NUIT',unit:'%',kind:'line',fmt:flhInt,
   /* L'AXE PORTE LA DÉCIMALE, PAS LA MESURE. Une médiane de SpO2 vaut 100 dix-huit
      nuits sur dix-neuf (v1781) : le cadre automatique s'ouvre alors sur moins de
      deux points, ses graduations tombent tous les demi-pour-cent, et arrondies à
      l'entier DEUX D'ENTRE ELLES portaient le même « 100 ». On ne triche ni sur le
      cadre (une borne fixe couperait la courbe le jour où elle descend) ni sur la
      mesure (elle reste un entier partout) : c'est la graduation qui dit sa vraie
      hauteur, à la décimale, quand elle n'est pas ronde. */
   tickFmt:function(t){var r=Math.round(t*10)/10;
    return (r===Math.round(r)?String(Math.round(r)):String(r).replace('.',flSeparateurDecimal()))+' %';},
   get:function(off){try{return (typeof flSpo2Nuit==='function')?flSpo2Nuit(off):null;}catch(e){return null;}}}
  };
 } catch (e) { return {}; }
};

/* ═══════════════════════════════════════════════════════════════════════════
   2 · CE QU'ON PRÉPARE D'AVANCE
   ═══════════════════════════════════════════════════════════════════════════ */
 /* ═══ v1481 — L'ORDRE DE LA FILE COMPTE AUTANT QUE SON CONTENU ══════════════

    La v1477 empilait `[k,'S']` PUIS `[k,'M']`, métrique par métrique. La page
    « mois » de la première métrique était donc calculée avant la page
    « semaine » de la deuxième — alors qu'un doigt qui touche un graphique
    ouvre TOUJOURS la semaine, au recul zéro. Le mois ne s'atteint qu'en
    appuyant ensuite sur le sélecteur, et il est déjà couvert par
    `flPrechargerVoisines`. Une page sur deux de cette file était donc calculée
    trop tôt, et la fenêtre où le premier tap peut encore attendre durait deux
    fois ce qu'elle devait.

    DEUX TEMPS : toutes les semaines, puis tous les mois.

    ET DANS L'ORDRE DE CE QU'ON TOUCHE. Les cibles ne sont pas une supposition,
    elles sont lues dans le code : les quatre cartes à chevron de la page
    Sommeil (`prechargerHebdo`, ContentView), les métriques d'en-tête des
    quatre pages (`hb:` dans les tables de tendance), puis les dix-neuf lignes
    du tableau de bord (`cle:` dans `flAccueilData`). Ce qui reste — les zones
    de FC, la musculation, les trois séries de calories — ferme la marche : on
    y arrive par une page qu'il faut d'abord ouvrir.

    Une clé inconnue de `FL_HEBDO` est ignorée sans bruit ; une clé oubliée de
    cette liste passe quand même, en fin de file. L'ordre est une PRIORITÉ,
    jamais un filtre — rien ne peut disparaître en se trompant ici.
    (Cette phrase disait « le tableau de bord cite `spo2` et `temp`, qui n'ont
    pas de graphique ». Ce n'est plus vrai depuis le 1er septembre 2026 : ils
    en ont un, il est juste au-dessus.)                                      */
 /* ═══ v1487 — CINQUANTE PAGES, C'ÉTAIT UN CHIFFRE DE BANC ═══════════════════

    RELEVÉ SUR L'IPHONE DE DINO, pendant qu'il s'en servait :

        16:59:38  hebdo 'rhr' — rien reçu en 2,5 s, on redemande
        16:59:57  hebdo 'hrv' — rien reçu en 2,5 s, on redemande
        17:00:23  hebdo 'hrv' — ABANDON : rien reçu en 25 s (mode M)

    Et le bilan de la passe n'est jamais arrivé : elle n'avait pas fini.

    CE QUE J'AVAIS MAL MESURÉ. Au banc, les cinquante pages coûtent 0,87 Mo et
    59 ms — sur DOUZE journées. Dino en a deux cent vingt, et ses courbes pèsent
    jusqu'à 192 Ko chacune. Une page en mode « mois » touche jusqu'à cent
    cinquante journées distinctes (trente points, trente de période précédente,
    quatre-vingt-dix pour la plage habituelle) : c'est VINGT-DEUX MÉGAOCTETS de
    JSON pour une seule page. Vingt-cinq pages « M » ne se préparent pas en
    arrière-plan — elles occupent le seul fil du moteur pendant des minutes, et
    le doigt qui arrive fait la queue derrière.

    J'ai transformé une lenteur au premier clic en une lenteur permanente. Le
    banc ne pouvait pas me le dire : douze journées ne pèsent rien.

    ═══ CE QU'ON PRÉPARE VRAIMENT ═══════════════════════════════════════════

    LA SEMAINE SEULEMENT. Un doigt qui touche un graphique ouvre TOUJOURS la
    semaine ; le mois demande un second geste, et il est déjà couvert par
    `flPrechargerVoisines` — au moment où on le demande, pour une page à la
    fois. Le préparer d'avance pour vingt-cinq métriques était une dépense que
    personne ne réclamait.

    ET SEULEMENT LES PREMIÈRES. Huit métriques couvraient les quatre cartes à
    chevron de la page Sommeil et les en-têtes des quatre pages — mais PAS les
    cartes de tendance des pages Récupération et Effort. v1566, capture de
    Dino à l'appui : « TON SOMMEIL » (sleeppct) n'était préparée nulle part,
    et son ouverture à froid sur de vraies données laissait « Un instant. »
    sous un titre « — ». Les quinze clés ci-dessous couvrent désormais TOUT ce
    qu'un doigt peut toucher : cartes Sommeil, en-têtes des quatre pages,
    cartes Récup (sleeppct, hrv, rhr, resp) et cartes Effort (zones13,
    zones45, strength). Le reste s'atteint par une page qu'il faut d'abord
    ouvrir, et il sera préparé à ce moment-là, par les voisines.

    Quinze pages « S » LÉGÈRES au lieu de cinquante « S » et « M » : le
    travail de fond reste de l'ordre de quelques secondes — invisible.       */
window.flHebdoPriorite = function () {
 return ['sleep','sleepeff','sleepdebt','sleepreg',
         'charge','recovery','calories','steps',
         'sleeppct','hrv','rhr','resp',
         'zones13','zones45','strength',
         /* les chevrons du tableau de bord et de la page Calories —
            `temp` et `spo2` compris depuis qu'ils ouvrent vraiment
            quelque chose (voir FL_HEBDO, 1er sept. 2026) */
         'effortrecup','fcavg','vo2','hrzall','timeinbed','sleepresto',
         'zones15','temp','spo2','weight','leanmass',
         'kcalOut','kcalIn','kcalBal'];
};

/* ═══════════════════════════════════════════════════════
   3 · L'ANNÉE — cinquante-deux semaines, pas trois cent soixante-quatre jours
   ═══════════════════════════════════════════════════════
   (7 septembre 2026)

   Dino : « j'aimerais ajouter une dernière case. Année. Un petit A. Mais il
   faut vraiment que le graphique soit hyper bien et hyper pertinent. Il ne
   faut pas que ce soit un vieux truc pourri et tassé. »

   UN JOUR PAR POINT NE TIENT PAS SUR UN ÉCRAN. Trois cent soixante-quatre
   colonnes dans cinq cent trente-six unités de large, c'est une barre et demie
   d'unité chacune : un peigne illisible, et le doigt ne saurait plus quel jour
   il touche. L'année se lit donc PAR SEMAINE — cinquante-deux points, dix
   unités chacun, la même largeur qu'un tiers de colonne du mois. La dernière
   semaine de l'année est exactement la fenêtre « S » : les trois échelles
   finissent le même jour, seule la profondeur change (7, 30, 364), comme entre
   S et M depuis toujours.

   CE QU'UNE SEMAINE DIT. Sa MOYENNE des jours mesurés, dans l'unité du point
   (« pas par jour », « ms », « % ») : c'est le chiffre que l'en-tête annonce
   déjà sur S et M, on ne change pas d'unité en changeant d'échelle. Et, pour
   les courbes, son MINI et son MAXI — la bande claire sous la ligne : une
   semaine de VFC à 60 avec des nuits de 45 à 80 ne ressemble pas à une
   semaine plate à 60, et c'est cette différence qui fait qu'une année
   s'apprend. Les métriques d'horaire (coucher / réveil) portent la MÉDIANE
   de leurs nuits : une nuit blanche ne doit pas déplacer la semaine.

   RIEN N'EST FABRIQUÉ. Une semaine sans jour mesuré est `null` : un trou, pas
   un zéro, pas une interpolation — sur la base de Dino en septembre 2026,
   l'année est vide sur ses quarante-six premières semaines et le graphique le
   montre tel quel, avec les mois au bas pour dire où l'on est. La « plage
   habituelle » (trente jours) n'a pas de sens sur douze mois et n'est pas
   rendue. La phrase de lecture compare aux douze mois D'AVANT quand ils
   existent, et dit sinon qu'il n'y a pas encore d'année précédente.

   POURQUOI ICI. `flHebdoDetail` (index.html) aiguille `mode === 'A'` vers
   cette fonction sur sa première ligne ; le fichier est absent ou refuse →
   `refus()` porte `mode:'A'` et le natif affiche « pas encore de mesure »
   sur la bonne fenêtre, jamais « Un instant » sans fin (règle v1491). Tout
   ce qui est lu l'est par les MÊMES portes que S et M : `flhSeries`, `cfg.get`,
   `cfg.get2`, `cfg.plage`, `flhTicksAuto`, `flhRange`. Deux échelles qui
   liraient deux choses différentes finiraient par se contredire sans que rien
   ne le signale.                                                              */
window.flHebdoAnnee = function (key, recul, leger) {
 /* ═══ v1461 + v1995, côté année — MÊME RÈGLE QUE LA SEMAINE ET LE MOIS ════
    La page zéro s'ancre au JOUR REGARDÉ. Revenir vers le présent depuis une
    ancre passée demande un recul NÉGATIF, borné par `rMin`, que le natif
    reçoit sous le nom `reculMin`. Et le refus porte le recul DEMANDÉ, jamais
    un recul écrêté : le natif jette une réponse qui ne répond pas à sa
    question, et l'écran reste alors sur « Un instant » (règle v1491). */
 var _o = Math.min(0, (typeof window.flDayOff === 'number' ? (window.flDayOff | 0) : 0));
 var N = 364, W = 52;
 var rMin = Math.floor(_o / N);
 var r = (+recul || 0); if (r < rMin) r = rMin;
 function refus() { return { aDesDonnees: false, cle: key, mode: 'A', recul: (+recul || 0) }; }
 try {
  var cfg = FL_HEBDO[key];
  if (!cfg) return refus();
  var end = Math.min(0, _o - (r * N));
  var jours = flhSeries(key, end, N);            /* du plus ancien au plus récent */
  var i, j, w;
  if (cfg.get2) jours.forEach(function (p) {
   var v = null; try { v = cfg.get2(p.off); } catch (e) {}
   p.v2 = (v == null ? null : +v);
  });
  var estPlage = !!cfg.plage;
  /* Les deux aides d'horaire de `flHebdoDetail`, sous des noms à nous : le
     garde de portée lit les fichiers servis au mot, et « hh » y est un nom
     déclaré dans une fonction d'index.html. */
  function flhaAxe(m) { return flAxeNuit(m); }
  function flhaHeure(m) { var v = ((Math.round(m) % 1440) + 1440) % 1440;
   return (v < 600 ? '0' : '') + Math.floor(v / 60) + ':' + (v % 60 < 10 ? '0' : '') + (v % 60); }
  if (estPlage) {
   jours.forEach(function (p) {
    var g = null; try { g = cfg.plage(p.off); } catch (e) {}
    if (!g) { p.couche = null; p.reveil = null; return; }
    p.couche = flhaAxe(g.c) / 60; p.reveil = flAxeReveil(g.r, g.c) / 60;
   });
  }
  function moy(a) { return a.reduce(function (x, y) { return x + y; }, 0) / a.length; }
  function med(a) { var s = a.slice().sort(function (x, y) { return x - y; }), h = s.length >> 1;
   return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2; }
  function fmt(v) { try { return String(cfg.fmt ? cfg.fmt(v) : Math.round(v)); } catch (e) { return ''; } }
  function tickTxt(t) { try { return String(cfg.tickFmt ? cfg.tickFmt(t) : fmt(t)); } catch (e) { return ''; } }

  /* ── les cinquante-deux semaines ─────────────────────────────────────── */
  var sem = [], vals = [], allv = [], hs = [], premierLab = true;
  for (w = 0; w < W; w++) {
   var bloc = jours.slice(w * 7, w * 7 + 7), vs = [], v2s = [], cs = [], rs = [], parts = null, nParts = 0;
   for (j = 0; j < bloc.length; j++) {
    var p = bloc[j];
    if (p.v != null) vs.push(p.v);
    if (p.v2 != null) v2s.push(p.v2);
    if (estPlage && p.couche != null && p.reveil != null) { cs.push(p.couche); rs.push(p.reveil); }
    if (p.parts && p.parts.length) {
     var somme = 0; for (i = 0; i < p.parts.length; i++) somme += (+p.parts[i] || 0);
     if (somme > 0) { if (!parts) parts = []; nParts++;
      for (i = 0; i < p.parts.length; i++) parts[i] = (parts[i] || 0) + (+p.parts[i] || 0); }
    }
   }
   if (parts) for (i = 0; i < parts.length; i++) parts[i] = parts[i] / nParts;
   var a = flhDate(bloc[0].off), b = flhDate(bloc[bloc.length - 1].off);
   /* Le mois s'écrit sous la semaine qui contient son premier jour ; l'année
      s'écrit sous le premier libellé de la fenêtre et sous chaque janvier. */
   var lab = '', sub = '';
   for (j = 0; j < bloc.length; j++) { var d = flhDate(bloc[j].off);
    if (d.getDate() === 1) { lab = FLH_MOIS[d.getMonth()];
     if (premierLab || d.getMonth() === 0) sub = String(d.getFullYear());
     premierLab = false; break; } }
   var jour = (a.getMonth() === b.getMonth())
    ? (a.getDate() + ' – ' + b.getDate() + ' ' + FLH_MOIS[b.getMonth()])
    : (a.getDate() + ' ' + FLH_MOIS[a.getMonth()] + ' – ' + b.getDate() + ' ' + FLH_MOIS[b.getMonth()]);
   var nb = estPlage ? cs.length : vs.length;
   if (nb) jour += ' · ' + nb + (estPlage ? (nb > 1 ? ' nuits' : ' nuit') : (nb > 1 ? ' jours' : ' jour'));
   var s = { off: bloc[bloc.length - 1].off, nb: nb, lab: lab, sub: sub, jour: jour,
    v: (vs.length ? moy(vs) : null),
    lo: (vs.length ? Math.min.apply(null, vs) : null),
    hi: (vs.length ? Math.max.apply(null, vs) : null),
    v2: (v2s.length ? moy(v2s) : null),
    parts: parts,
    couche: (cs.length ? med(cs) : null), reveil: (rs.length ? med(rs) : null) };
   if (s.v != null) { vals.push(s.v); allv.push(s.v);
    if (cfg.kind !== 'bars') { allv.push(s.lo); allv.push(s.hi); } }
   if (s.v2 != null) allv.push(s.v2);
   if (s.couche != null) { hs.push(s.couche); hs.push(s.reveil); }
   sem.push(s);
  }

  /* ── le cadre, par les mêmes règles que S et M ───────────────────────── */
  var mn, mx, ticks;
  if (cfg.ticks) { mx = cfg.ticks[0]; mn = cfg.ticks[cfg.ticks.length - 1]; ticks = cfg.ticks; }
  else if (cfg.kind === 'bars') { ticks = flhTicksAuto(allv.length ? Math.max.apply(null, allv) : 1, cfg.tickSteps); mx = ticks[0]; mn = 0; }
  else { var rr = flhRange(allv.length ? allv : [0, 1]); mn = rr.min; mx = rr.max; ticks = rr.ticks; }
  var plg = null;
  if (estPlage) {
   var cib = null; try { cib = cfg.cibles ? cfg.cibles() : null; } catch (e) {}
   var tc = (cib ? flhaAxe(cib.c) / 60 : null), tr = (cib ? flAxeReveil(cib.r, cib.c) / 60 : null);
   if (tc != null) hs.push(tc); if (tr != null) hs.push(tr);
   if (hs.length) {
    var lo = Math.floor(Math.min.apply(null, hs) - 0.75);
    var hi = Math.max(lo + 4, Math.ceil(Math.max.apply(null, hs) + 0.75));
    var tks = []; for (var h = Math.ceil(lo); h <= hi; h++) if (h % 3 === 0) tks.push(h);
    if (tks.length < 2) tks = [lo, hi];
    plg = { mn: lo, mx: hi,
     ticks: tks.map(function (t) { var hv = ((Math.round(t) % 24) + 24) % 24; return { v: t, txt: (hv < 10 ? '0' : '') + hv + 'h' }; }),
     cibleCouche: tc, cibleReveil: tr,
     cibleCoucheTxt: (cib ? flhaHeure(cib.c) : null), cibleReveilTxt: (cib ? flhaHeure(cib.r) : null) };
   }
  }

  /* ── la moyenne de l'année : les JOURS mesurés, pas les semaines ─────── */
  var jv = [], jv2 = [];
  for (i = 0; i < jours.length; i++) { if (jours[i].v != null) jv.push(jours[i].v); if (jours[i].v2 != null) jv2.push(jours[i].v2); }
  var avg = jv.length ? moy(jv) : null;
  var prevPts = leger ? [] : flhSeries(key, end - N, N), prev = [];
  for (i = 0; i < prevPts.length; i++) if (prevPts[i].v != null) prev.push(prevPts[i].v);
  var nbSem = 0; for (w = 0; w < W; w++) if (sem[w].v != null || sem[w].couche != null) nbSem++;
  var a0 = flhDate(jours[0].off), b0 = flhDate(end);
  var per = FLH_MOIS[a0.getMonth()] + ' ' + a0.getFullYear() + ' – ' + FLH_MOIS[b0.getMonth()] + ' ' + b0.getFullYear();

  return { aDesDonnees: true, cle: key, mode: 'A', v2Mesure: !!cfg.v2Mesure, recul: r, periode: per, futurBloque: (end >= 0), reculMin: rMin,   /* 15 sept. 2026 — LE DRAPEAU MANQUAIT ICI, ET LA FENÊTRE « A » RESTAIT DANS L'ANCIENNE RÈGLE. `flHebdoDetail` rend la main à cette fonction AVANT la ligne qui pose `v2Mesure` : la charge de l'année partait sans lui, le Swift le décodait `nil`, et `aUneMesure` refusait de dessiner une année de repas saisis sans bracelet — mesuré, 52 semaines, v nul 52 fois et v2 plein 52 fois, aUneMesure=false, alors que le MÊME mois en fenêtre M dessinait. Le contre-exemple du sommeil tient de ce côté-ci aussi : son `get2` est le besoin calculé, sans `v2Mesure` sur la métrique, donc faux. */
   semaines: W, joursMesures: jv.length,
   plage: !!plg, inverse: !!plg,
   cibleCouche: (plg ? plg.cibleCouche : null), cibleReveil: (plg ? plg.cibleReveil : null),
   cibleCoucheTxt: (plg ? plg.cibleCoucheTxt : null), cibleReveilTxt: (plg ? plg.cibleReveilTxt : null),
   titre: cfg.title, libelleGraphe: cfg.lab, libelleHero: (cfg.heroLab || 'MOYENNE'),
   unite: (cfg.unit || ''), couleur: (cfg.col || '#fb6015'), couleurB: (cfg.colB || null),
   couleur2: (cfg.col2 || (cfg.col ? '#8FC7F2' : '#ffc191')),
   genre: (cfg.kind === 'bars' ? 'bars' : 'line'),
   parts: ((cfg.parts || []).map(function (p) { return { couleur: p[0], nom: p[1] }; })),
   empile: !!(cfg.kind === 'bars' && cfg.parts),
   mn: (plg ? plg.mn : mn), mx: (plg ? plg.mx : mx),
   ticks: (plg ? plg.ticks : ticks.map(function (t) { return { v: t, txt: tickTxt(t) }; })),
   moyenne: avg, moyenneTxt: (avg == null ? null : fmt(avg)),
   moyennePrec: (prev.length ? moy(prev) : null),
   plageMin: null, plageMax: null,
   moyenne2: (jv2.length ? moy(jv2) : null), moyenne2Txt: (jv2.length ? fmt(moy(jv2)) : null),
   tendance: flhTrendDir(vals),
   lecture: (leger ? null : window.flHebdoAnneePhrase(cfg, key, jv, prev, nbSem)),
   fiche: (leger || typeof flFichePour !== 'function') ? null : flFichePour(key, end),
   points: sem.map(function (s) {
    return { v: s.v, v2: s.v2, lo: s.lo, hi: s.hi, nb: s.nb,
     txt: (s.v == null ? null : fmt(s.v)), txt2: (s.v2 == null ? null : fmt(s.v2)),
     parts: (s.parts || null), lab: s.lab, sub: s.sub, jour: s.jour,
     couche: s.couche, reveil: s.reveil,
     coucheTxt: (s.couche == null ? null : flhaHeure(s.couche * 60)),
     reveilTxt: (s.reveil == null ? null : flhaHeure(s.reveil * 60)) };
   }) };
 } catch (e) { return refus(); }
};

/* La phrase de lecture de l'année. Même vocabulaire que `flhReadPhrase`
   (index.html), mêmes trois familles d'unité (heures, pourcentage, nombre),
   même « Bon signe » réservé à la baisse de la FC de repos et de la dette ;
   ce qui change est la période nommée — les douze derniers mois contre les
   douze d'avant — et l'aveu, quand ces douze-là n'existent pas encore. */
window.flHebdoAnneePhrase = function (cfg, key, cur, prev, nbSem) {
 try {
  if (!cur || !cur.length) return 'Pas encore de jour mesuré sur ces douze mois.';
  function av(a) { return a.reduce(function (x, y) { return x + y; }, 0) / a.length; }
  var aC = av(cur), quand = 'sur ' + nbSem + ' semaine' + (nbSem > 1 ? 's' : '') + ' mesurée' + (nbSem > 1 ? 's' : '');
  var pPrev = 'les douze mois d’avant', head, tail, moved, d;
  var inv = (key === 'rhr' || key === 'sleepdebt');
  var assez = prev && prev.length >= 3;
  if (assez) d = aC - av(prev);
  if (cfg.fmt === flhHM) {
   head = 'Ta moyenne : ' + flhReadFmtH(aC) + ' ' + quand;
   if (assez) { var dm = Math.round(Math.abs(d) * 60); moved = dm > 0;
    tail = moved ? (flhReadFmtH(d) + ' de ' + (d > 0 ? 'plus' : 'moins') + ' que ' + pPrev) : ('stable par rapport à ' + pPrev); }
  } else if (cfg.pct) {
   head = 'Ta moyenne : ' + Math.round(aC) + ' % ' + quand;
   if (assez) { var dp = Math.round(Math.abs(d)); moved = dp > 0;
    tail = moved ? (dp + ' point' + (dp > 1 ? 's' : '') + ' ' + (d > 0 ? 'au-dessus' : 'au-dessous') + ' de ' + pPrev) : ('au même niveau que ' + pPrev); }
  } else {
   head = 'Ta moyenne : ' + cfg.fmt(aC) + (cfg.unit ? ' ' + cfg.unit : '') + ' ' + quand;
   if (assez) { var dn = cfg.fmt(Math.abs(d)); moved = dn !== cfg.fmt(0);
    tail = moved ? ('en ' + (d > 0 ? 'hausse' : 'baisse') + ' de ' + dn + ' vs ' + pPrev) : ('stable par rapport à ' + pPrev); }
  }
  if (!assez) return head + ' — pas encore d’année précédente pour comparer.';
  return head + ' — ' + tail + '.' + (inv && moved && d < 0 ? ' Bon signe.' : '');
 } catch (e) { return null; }
};
