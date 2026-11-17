/* ═══════════════════════════════════════════════════════════════════════════
   flint-seances.js — LA LISTE « DE TOUJOURS » DES SÉANCES SANS TRACÉ
   (15 nov. 2026, chantier « Mes activités »)

   POURQUOI CE FICHIER. « Mes courses » devient « Mes activités » : toutes les
   séances, filtrables par sport et par période, avec leurs records. Les sorties
   GPS ont déjà leur carnet natif (`Application Support/activites-gps/`). Les
   autres — un foot, une musculation, une boxe — ne vivent que dans le moteur,
   rangées par jour dans `sessions_<jour>`. Ce fichier les rend au natif, par
   tranches, sous une forme FIGEABLE. Il ne calcule rien de neuf : il LIT ce que
   le moteur range déjà et appelle les portes que la maison a déjà
   (`flEtatActivite`, `flSerieCanonique`, `flKcalActivite`, `flZonesBpm`).
   Ce fichier n'écrit rien (ni `DB.set`, ni `localStorage.setItem`) ; la seule
   écriture qu'il peut provoquer est celle que l'accueil fait déjà —
   `flZonesBpm(aujourd'hui)` fige les bornes du jour.

   ── CE QUI ENTRE DANS LA LISTE ──────────────────────────────────────────────
   Ce que la personne a LANCÉ (Départ/Stop, `srcs.saisie` avec `geste`),
   AJOUTÉ à la main (`srcs.saisie` sans geste), NOMMÉ (réponse à « c'était
   quoi ? », `srcs.user` portant un nom de sport), ou ouvert en mode sport sur
   le bracelet (`srcs.montre`, hors artefact — v1714).
   ── CE QUI N'Y ENTRE PAS, ET POURQUOI ───────────────────────────────────────
     · `detection` — une détection seule (`srcs` = `auto` seulement) : elle
       reste dans Ma journée. Les marches regroupées (`grp:…`) n'existent qu'à
       l'affichage et ne sont faites que de ces morceaux-là : elles sortent
       avec eux, sans règle de plus.
     · `nomGenerique` — une détection « nommée » Activité ou Marche : la
       réponse confirme la détection, elle ne déclare pas un sport. (Question
       ouverte pour Dino : une marche sans GPS nommée à la main.)
     · `gps` — une sortie du tracker (`gps`, `g:<id>`) : son carnet existe, la
       compter ici la ferait apparaître deux fois.
     · `sieste` — `type:'nap'`, et tout nom de la catégorie `sommeil`.
     · `recuperation` — catégorie `recup` du catalogue (sauna, massage…).
     · `artefact` — une fenêtre que `flFenetreValide` déclare artefact.
     · `doublon` — la même identité deux fois (une séance rangée sous deux
       jours après un passage de minuit) : la première lue gagne.

   ── L'IDENTITÉ, ET CE QUI LA REND STABLE ────────────────────────────────────
   `id` est celui que le magasin PORTE (`sessions_<jour>[i].id`). La
   réconciliation (`flReconcilierSeances`, index.html § 4) le reprend tel quel
   d'une reconstruction à l'autre : une identité posée au geste (`geste:true`)
   ou par le tracé fait foi, sinon celle de la contribution qui existait avant.
   Il n'est dérivé (`jour@minute#source`) qu'à la toute première attribution.
   Le rang dans le tableau, lui, bouge : il voyage à titre indicatif.

   ── L'EFFORT FIGÉ ───────────────────────────────────────────────────────────
   La note vient de `flEtatActivite` — la même que la carte de Ma journée. Elle
   dépend des bornes de zone du jour (`zonesJour_`, figées par flint-zones.js)
   et de la fréquence maximale DU MOMENT (`flFcMax`, garde de réserve). Ce
   fichier ne touche pas au calcul : il dit `figeable` quand la séance a fini
   depuis plus de 48 h, et c'est le carnet natif (`PontSeances.swift`) qui
   garde alors le résumé pour toujours — un record ne bouge plus parce que la
   fréquence maximale a changé. Les bornes utilisées voyagent avec la séance
   (`zonesBpm`) pour que le paysage se colore avec elles, figées de même.

   ── LE PAYSAGE ──────────────────────────────────────────────────────────────
   (repris le 15 nov. après le rendu de dix VRAIES séances,
   activites-revue/vraies/VERDICT.md)
   `courbe.v` : au plus 96 valeurs en bpm, une par créneau de la fenêtre. Le
   créneau est un nombre ENTIER de minutes — 1 min jusqu'à 96 min, 2 jusqu'à
   192, etc. (`pas = cadence × ceil(durée / (96 × cadence))`) : des créneaux
   de 91 s prenaient tantôt une minute, tantôt deux, et hérissaient le trait.
   La valeur d'un créneau est le PLUS HAUT relevé qu'il contient, jamais une
   moyenne de créneau, jamais un comblement : un créneau sans relevé vaut
   `null` (c'est la page qui décide de faire passer le trait au-dessus d'un
   petit trou). La série est la série canonique de la séance
   (`flSerieCanonique`) : la minute NETTOYÉE par `flHrPropre` (médiane
   glissante de 5 min — elle ôte les artefacts du capteur, au prix de paliers ;
   c'est la courbe que la fiche dessine, et la seule honnête à montrer à côté
   d'elle), ou les cinq secondes quand `flHrFine` les juge fiables — alors
   chaque minute est d'abord ramenée à SA moyenne, comme la page courbe, pour
   que le maximum du créneau reste un relevé de minute et pas une pointe de
   cinq secondes.
   Deux cas de la vraie vie :
     · LE JOUR ÉCLAIRCI (d'avant la cave, min/max gardés par 3 min) se
       reconnaît à sa densité et se découpe sur SA grille de 3 min, calée sur
       minuit (`courbe.decalageS` dit où commence le premier créneau par
       rapport au départ). Éclairci à 15 min : pas de courbe.
     · LE POULS FIGÉ : dix minutes ou plus à la même valeur exacte ne sont pas
       une mesure (un capteur gelé, foot du 26 oct.) ; ces créneaux restent
       vides, et `couverture.figees` le dit.
   `couverture` (minutes portant un relevé, part de la séance) se compte APRÈS
   ce retrait ; le seuil (10 min, 60 %) vit côté page.

   ── SANS BRACELET ───────────────────────────────────────────────────────────
   `flSansBracelet()` vrai : la durée seule. Ni note, ni cœur, ni calories, ni
   courbe — la règle de flint-porte.js, rendue telle quelle.

   CONTRAT : `flSeancesContrat()` le dit au natif, qui vérifie que la fonction
   existe avant de demander (un web plus ancien servi par l'OTA ne l'a pas).
   Bancs : tests/test-seances-liste.js.
   ═══════════════════════════════════════════════════════════════════════════ */

window.FL_SEANCES_VERSION = 1;   /* champs AJOUTÉS (decalageS, eclaircie, figees) : le contrat reste lisible par la v1 */
window.FL_SEANCES_POINTS = 96;
window.FL_SEANCES_FIGE_H = 48;

/* LES FAMILLES, PAR NOM DE SPORT. Les sections du catalogue (`FL_ACT_CAT`,
   index.html), à une correction près relevée par le designer : le kayak et
   l'aviron sont de l'EAU, le roller et le ski de la GLISSE — la mécanique de
   suivi `.roues` qui les réunit côté GPS ne dit pas leur sport. Ces familles
   ne décident d'AUCUN record (les records sans tracé se disputent par nom de
   sport) : elles servent à ranger. Le banc exige que chaque nom « effort » du
   catalogue ait la sienne : un sport ajouté sans famille rougit. */
window.FL_SEANCES_FAMILLES = {
  course: ['Course', 'Course sur tapis', 'Trail', 'Sprint', 'Athlétisme', 'Triathlon'],
  marche: ['Marche', 'Randonnée', 'Escalier', 'Escalier en salle'],
  velo: ['Vélo', 'VTT', "Vélo d'appartement", 'Spinning', 'BMX'],
  glisse: ['Skateboard', 'Roller', 'Trottinette', 'Ski', 'Ski de fond', 'Snowboard', 'Patinage'],
  eau: ['Natation', 'Plongée', 'Water-polo', 'Surf', 'Kitesurf', 'Planche à voile', 'Paddle',
        'Kayak', 'Aviron', 'Voile', 'Pêche'],
  force: ['Musculation', 'Powerlifting', 'Haltérophilie', 'CrossFit', 'Hyrox', 'HIIT',
          'Circuit training', 'Functional training', 'Rameur', 'Gainage', 'Saut à la corde',
          'Gymnastique', 'Trampoline', 'Parkour', 'Escalade', 'Escalade en salle', 'Slackline',
          'Renforcement', 'Abdominaux'],
  souplesse: ['Étirements', 'Mobilité', 'Yoga', 'Pilates', 'Barre au sol'],
  danse: ['Danse', 'Zumba', 'Aérobic', 'Step', 'Cheerleading'],
  collectif: ['Football', 'Futsal', 'Football américain', 'Rugby', 'Basketball', 'Handball',
              'Volleyball', 'Beach-volley', 'Baseball', 'Softball', 'Cricket', 'Hockey',
              'Hockey sur glace'],
  raquette: ['Tennis', 'Padel', 'Squash', 'Badminton', 'Ping-pong', 'Pickleball'],
  combat: ['Boxe', 'Kickboxing', 'MMA', 'Judo', 'Karaté', 'Taekwondo', 'Lutte', 'Escrime',
           'Arts martiaux'],
  precision: ['Golf', "Tir à l'arc", 'Chasse', 'Paintball', 'Bowling', 'Billard', 'Fléchettes',
              'Pétanque', 'Frisbee', 'Spikeball'],
  autre: ['Équitation', 'Jardinage', 'Travail manuel', 'Jonglage', 'Coaching sportif',
          'Sport en fauteuil', 'Concert / scène', 'Autre – Effort']
};

function flSeancesNorm(x) {
  return String(x || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, ' ').trim();
}
var _flSeancesIdxFam = null;
window.flSeancesFamille = function (nom) {
  try {
    if (!_flSeancesIdxFam) {
      var idx = {}, F = window.FL_SEANCES_FAMILLES;
      Object.keys(F).forEach(function (f) { F[f].forEach(function (n) { idx[flSeancesNorm(n)] = f; }); });
      _flSeancesIdxFam = idx;
    }
    var n = (typeof flSansMoment === 'function') ? flSansMoment(nom) : nom;
    return _flSeancesIdxFam[flSeancesNorm(n)] || 'autre';
  } catch (e) { return 'autre'; }
};

/* Une empreinte courte (FNV-1a 32 bits) : elle dit « ça a changé », rien de plus. */
function flSeancesEmpreinte(s) {
  var h = 0x811c9dc5;
  s = String(s);
  for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return ('0000000' + h.toString(16)).slice(-8);
}

/* Les minutes du début, depuis le champ rangé, sinon depuis « HH:MM ». */
function flSeancesDebut(s) {
  if (s.startMin != null && isFinite(+s.startMin)) return +s.startMin;
  var p = String(s.start || '').split(':');
  if (p.length < 2) return null;
  var m = (+p[0]) * 60 + (+p[1]);
  return isFinite(m) ? m : null;
}

/* La SIGNATURE DÉCLARATIVE : ce que la personne a dit de sa séance (nom,
   bornes, durée, arrêts, intensité, note donnée, icône). PAS les mesures
   dérivées que le moteur réécrit à chaque réconciliation — sans quoi une
   séance figée se recalculerait à chaque passage, et son effort avec. Un
   renommage, une modification, une suppression la changent ; une
   resynchronisation du bracelet, non. */
function flSeancesSignature(s) {
  return flSeancesEmpreinte([s.id || '', s.name || '', flSeancesDebut(s), s.endMin == null ? '' : s.endMin,
    s.dur == null ? '' : s.dur, JSON.stringify(s.pauses || null), s.int == null ? '' : s.int,
    (!s.auto && s.eff != null) ? s.eff : '', s.ti || ''].join('|'));
}

/* POURQUOI cette entrée n'est pas une séance de la liste — `null` si elle l'est.
   Rend aussi l'origine quand elle entre. */
var FL_SEANCES_GENERIQUES = { 'activite': 1, 'marche': 1, 'seance': 1 };
window.flSeancesTri = function (s) {
  if (!s || typeof s !== 'object') return { exclue: 'vide' };
  if (s.type === 'nap') return { exclue: 'sieste' };
  if (s.gps || String(s.id || '').indexOf('g:') === 0 || String(s.id || '').indexOf('grp:') === 0) return { exclue: 'gps' };
  var srcs = (s.srcs && typeof s.srcs === 'object') ? s.srcs : null;
  if (srcs && srcs.tracker) return { exclue: 'gps' };
  var cat = (typeof window.flCatDuSport === 'function') ? window.flCatDuSport(s.name) : null;
  if (cat === 'sommeil') return { exclue: 'sieste' };
  if (cat === 'recup') return { exclue: 'recuperation' };
  var origine = null;
  if (srcs) {
    if (srcs.saisie) origine = (srcs.saisie.geste === true || s.geste === true) ? 'lancee' : 'ajoutee';
    else if (srcs.montre) origine = 'montre';
    else if (srcs.user && srcs.user.name) {
      if (FL_SEANCES_GENERIQUES[flSeancesNorm(srcs.user.name)]) return { exclue: 'nomGenerique' };
      origine = 'nommee';
    }
  } else {
    /* Une entrée écrite avant que les contributions voyagent (`srcs`) : on lit
       ses drapeaux à plat, comme `flSourceDe`. */
    if (s.src === 'montre') origine = 'montre';
    else if (s.src === 'user') {
      if (FL_SEANCES_GENERIQUES[flSeancesNorm(s.name)]) return { exclue: 'nomGenerique' };
      origine = 'nommee';
    } else if (s.auto !== true) origine = (s.geste === true) ? 'lancee' : 'ajoutee';
  }
  if (!origine) return { exclue: 'detection' };
  return { origine: origine, cat: cat };
};

/* LA COURBE DU PAYSAGE, depuis la série canonique `{pts:[[secondes depuis le
   début, bpm]], source}`. `debutMin` sert à caler la grille d'un jour
   éclairci sur minuit. Rend null quand il n'y a rien à dessiner. */
window.FL_SEANCES_FIGE_MIN = 10;
window.flSeancesCourbe = function (serie, dureeFenetreMin, nMax, debutMin) {
  try {
    if (!serie || !serie.pts || !serie.pts.length || !(dureeFenetreMin > 0)) return null;
    nMax = nMax || window.FL_SEANCES_POINTS;
    var totS = dureeFenetreMin * 60;
    var brut = serie.pts.filter(function (p) { return p && isFinite(+p[0]) && isFinite(+p[1]) && +p[1] > 0 && +p[0] >= 0 && +p[0] <= totS; })
      .map(function (p) { return [+p[0], +p[1]]; }).sort(function (a, b) { return a[0] - b[0]; });
    if (!brut.length) return null;
    /* 1. LA MINUTE. Les cinq secondes se ramènent à la moyenne de leur minute. */
    var pts = brut;
    if (serie.source === '5s') {
      var par = {}, ordre = [];
      brut.forEach(function (p) { var m = Math.floor(p[0] / 60); if (!par[m]) { par[m] = [0, 0]; ordre.push(m); } par[m][0] += p[1]; par[m][1]++; });
      pts = ordre.map(function (m) { return [m * 60, par[m][0] / par[m][1]]; });
    }
    /* 2. LA CADENCE : la minute, ou la grille de 3 min d'un jour éclairci.
       Densité en relevés par minute de fenêtre : ~1 à la minute, ~0,67 en
       min/max par 3 min, ~0,13 par 15 min. */
    var densite = pts.length / dureeFenetreMin;
    if (densite <= 0.2 && dureeFenetreMin >= 30) return null;            /* éclairci à 15 min */
    /* Une minute TROUÉE est clairsemée aussi : ce qui signe l'éclairci, c'est
       qu'aucune case de 3 min (calée sur minuit) n'a plus de deux relevés. */
    var eclaircie = false;
    if (densite <= 0.75 && dureeFenetreMin >= 9 && pts.length >= 6) {
      var d0 = (debutMin != null && isFinite(+debutMin)) ? +debutMin : 0, cases = {};
      eclaircie = pts.every(function (p) { var c = Math.floor((d0 + p[0] / 60) / 3); cases[c] = (cases[c] || 0) + 1; return cases[c] <= 2; });
    }
    var cadence = eclaircie ? 180 : 60;
    /* 3. LE POULS FIGÉ : une suite de valeurs identiques qui couvre dix minutes. */
    var figes = 0, garde = new Array(pts.length);
    for (var a = 0; a < pts.length; a++) garde[a] = true;
    for (var i = 0; i < pts.length;) {
      var j = i;
      while (j + 1 < pts.length && Math.round(pts[j + 1][1]) === Math.round(pts[i][1])) j++;
      var etendue = pts[j][0] - pts[i][0] + cadence;
      if (j > i && etendue >= window.FL_SEANCES_FIGE_MIN * 60) {
        for (var q = i; q <= j; q++) garde[q] = false;
        figes += etendue / 60;
      }
      i = j + 1;
    }
    /* 4. LA GRILLE : un nombre entier de cadences par créneau. */
    var pas = cadence * Math.max(1, Math.ceil(totS / (nMax * cadence) - 1e-9));
    var decal = 0;
    if (eclaircie && debutMin != null && isFinite(+debutMin)) {
      var dm = ((+debutMin % 3) + 3) % 3;      /* minutes depuis la dernière borne de 3 min */
      decal = -dm * 60;
    }
    var n = Math.max(1, Math.ceil((totS - decal) / pas - 1e-9));
    if (n > nMax) n = nMax;
    var v = new Array(n);
    for (var k = 0; k < n; k++) v[k] = null;
    pts.forEach(function (p, idx) {
      if (!garde[idx]) return;
      var c = Math.min(n - 1, Math.floor((p[0] - decal) / pas));
      if (c < 0) return;
      var b = Math.round(p[1]);
      if (v[c] == null || b > v[c]) v[c] = b;
    });
    var pleins = 0;
    for (var z = 0; z < n; z++) if (v[z] != null) pleins++;
    if (!pleins) return { v: null, minutes: 0, part: 0, figees: Math.round(figes) };
    var minutes = Math.min(dureeFenetreMin, pleins * pas / 60);
    return { pasS: pas, decalageS: decal, source: serie.source || null, eclaircie: eclaircie, v: v,
             minutes: Math.round(minutes * 10) / 10, part: Math.round(pleins / n * 1000) / 1000,
             figees: Math.round(figes) };
  } catch (e) { return null; }
};

/* Les calories ET leur origine, sans toucher à `flKcalActivite` : on lui demande
   la valeur que la fiche affiche, puis on dit par quelle porte elle est sortie,
   en relisant ce que les portes laissent derrière elles. */
function flSeancesKcal(K, s, d0, f0) {
  var v = null;
  try { v = (typeof window.flKcalActivite === 'function') ? window.flKcalActivite(K, s, d0, f0) : null; } catch (e) { v = null; }
  if (v == null) return { kcal: null, origine: null };
  var origine = 'forfait';
  try {
    var pl = (typeof window.flKcalMuscuPlancher === 'function') ? window.flKcalMuscuPlancher(K, s, d0, f0) : null;
    if (pl != null && pl === v) origine = 'plancher';
    else if (s.kcal != null && Math.round(s.kcal) === v) origine = 'mesure';
    else {
      var memo = window._flKcMemo || {}, cle = K + '|' + d0 + '|' + f0;
      if (memo[cle] != null && memo[cle] === v) origine = 'mesure';
    }
  } catch (e) {}
  return { kcal: v, origine: origine };
}

/* UNE SÉANCE, RÉSUMÉE. `maintenantMin` n'est passé que pour la journée en cours. */
window.flSeancesResumer = function (s, K, rang, maintenantMin, tri) {
  tri = tri || window.flSeancesTri(s);
  if (tri.exclue) return null;
  var d0 = flSeancesDebut(s);
  var dur = (s.dur != null && isFinite(+s.dur)) ? Math.max(0, Math.round(+s.dur)) : null;
  var f0 = (s.endMin != null && isFinite(+s.endMin)) ? +s.endMin : ((d0 != null && dur != null) ? d0 + dur : null);
  var sansBracelet = false;
  try { sansBracelet = (typeof window.flSansBracelet === 'function') && !!window.flSansBracelet(); } catch (e) {}
  var etat = null;
  try { etat = (typeof window.flEtatActivite === 'function') ? window.flEtatActivite(s, K, maintenantMin) : null; } catch (e) {}
  if (etat && etat.artefact) return { exclue: 'artefact' };
  var douteuse = !!(etat && etat.fenetreRaison);
  /* `idStocke` (15 nov., finitions) : faux quand l'identité est dérivée ICI —
     une entrée d'avant la v1703 n'en porte pas, et `flTrouverSeance` ne
     trouverait jamais l'identité dérivée : sa fiche s'ouvre alors par le rang. */
  var o = {
    id: String(s.id || (K + '@' + d0 + '#' + tri.origine)), idStocke: !!s.id, jour: K, rang: rang,
    nom: s.name || 'Séance', ti: s.ti || ((typeof window.flIconeDuSport === 'function') ? window.flIconeDuSport(s.name) : null) || null,
    icone: s.icon || null, cat: tri.cat || null, famille: window.flSeancesFamille(s.name), origine: tri.origine,
    debutMin: d0, finMin: f0, duree: dur,
    sig: flSeancesSignature(s)
  };
  if (etat && etat.etat) o.etat = etat.etat;
  if (!sansBracelet && etat && etat.note != null && isFinite(+etat.note)) {
    o.effort = Math.round(+etat.note * 10) / 10;
    /* `declaree` : la note que la personne a donnée, ou durée × intensité
       d'une saisie sans bornes (flNoteSeanceDetail). Sinon elle est mesurée. */
    o.effortOrigine = etat.declaree ? 'declare' : 'mesure';
  }
  var serie = null;
  if (!sansBracelet && !douteuse && d0 != null && f0 != null && f0 > d0) {
    try { serie = (typeof window.flSerieCanonique === 'function') ? window.flSerieCanonique(K, d0, f0, s.pauses) : null; } catch (e) { serie = null; }
  }
  o.coeurMesure = !!serie;
  if (serie) {
    if (s.avgHr != null && isFinite(+s.avgHr)) o.coeurMoyen = Math.round(+s.avgHr);
    var c = window.flSeancesCourbe(serie, f0 - d0, null, d0);
    if (c && c.figees) o.couverture = { minutes: 0, part: 0, figees: c.figees };
    if (c && c.v) {
      o.courbe = { pasS: c.pasS, decalageS: c.decalageS, source: c.source, eclaircie: c.eclaircie, v: c.v };
      o.couverture = { minutes: c.minutes, part: c.part, figees: c.figees || 0 };
      try {
        var z = (typeof window.flZonesBpm === 'function') ? window.flZonesBpm(K) : null;
        if (Array.isArray(z) && z.length === 5 && z.every(function (x) { return isFinite(+x); })) o.zonesBpm = z.map(Number);
      } catch (e) {}
    }
  }
  if (!o.couverture) o.couverture = { minutes: 0, part: 0, figees: 0 };
  if (!sansBracelet && !douteuse) {
    var kc = flSeancesKcal(K, s, d0, f0);
    if (kc.kcal != null) { o.kcal = kc.kcal; o.kcalOrigine = kc.origine; }
  }
  /* FIGEABLE : la fin est passée depuis plus de 48 h. On compte depuis le
     minuit du jour de rangement — l'horloge du moteur, jamais une constante. */
  try {
    var m0 = (typeof flMinuitMsDe === 'function') ? flMinuitMsDe(K) : NaN;
    if (!isFinite(m0)) { var q = String(K).split('-'); m0 = new Date(+q[0], +q[1] - 1, +q[2]).getTime(); }
    o.finMs = m0 + (f0 != null ? f0 : (d0 || 0)) * 60000;
    o.figeable = (Date.now() - o.finMs) > window.FL_SEANCES_FIGE_H * 3600000;
  } catch (e) { o.figeable = false; }
  return o;
};

/* L'INDEX DES JOURNÉES QUI PORTENT DES SÉANCES — les CLÉS seulement, aucune
   lecture de valeur : avec la cave (CaveBase.swift), lire une vieille journée
   est un aller-retour au disque ; l'énumérer ne l'est pas. */
var _flSeancesIdx = null, _flSeancesIdxCle = '';
function flSeancesIndex() {
  var cle = '';
  try { cle = DB.tampon('sessions_') + '|' + localStorage.length; } catch (e) {}
  if (_flSeancesIdx && cle && cle === _flSeancesIdxCle) return _flSeancesIdx;
  var jours = [];
  try {
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      if (k && k.lastIndexOf('sessions_', 0) === 0) {
        var p = k.slice(9).split('-');
        var t = new Date(+p[0], +p[1] - 1, +p[2]).getTime();
        if (isFinite(t)) jours.push({ K: k.slice(9), t: t });
      }
    }
  } catch (e) {}
  jours.sort(function (a, b) { return b.t - a.t; });
  _flSeancesIdx = jours; _flSeancesIdxCle = cle;
  return jours;
}
function flSeancesDecalage(t) {
  var a = new Date(); a.setHours(0, 0, 0, 0);
  var b = new Date(t); b.setHours(0, 0, 0, 0);
  return Math.round((a.getTime() - b.getTime()) / 86400000);
}

/* Les journées d'une fenêtre [depuis, depuis + jours[ comptée en jours depuis
   aujourd'hui (0 = aujourd'hui), et si l'historique va plus loin. */
function flSeancesFenetre(depuis, jours) {
  depuis = Math.max(0, depuis | 0); jours = Math.max(1, Math.min(366, jours | 0 || 30));
  var idx = flSeancesIndex(), dans = [], plusVieux = false;
  for (var i = 0; i < idx.length; i++) {
    var dj = flSeancesDecalage(idx[i].t);
    if (dj < depuis) continue;
    if (dj >= depuis + jours) { plusVieux = true; break; }
    dans.push(idx[i].K);
  }
  return { depuis: depuis, jours: jours, cles: dans, plusAncien: plusVieux };
}

function flSeancesLireJour(K) {
  var L = null;
  try { L = DB.get('sessions_' + K, null); } catch (e) { L = null; }
  return Array.isArray(L) ? L : [];
}

/* LE CŒUR : les séances de ces journées-là. `vus` garde les identités déjà
   rendues (doublons inter-jours). */
function flSeancesDesJours(cles) {
  var t0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  var auj = tk(0), maint = null;
  try { var n = new Date(); maint = n.getHours() * 60 + n.getMinutes(); } catch (e) {}
  var out = [], ecartees = {}, vus = {}, signes = {};
  cles.forEach(function (K) {
    var L = flSeancesLireJour(K), sigJ = [];
    L.forEach(function (s, rang) {
      var tri = window.flSeancesTri(s);
      if (tri.exclue) { ecartees[tri.exclue] = (ecartees[tri.exclue] || 0) + 1; return; }
      sigJ.push(flSeancesSignature(s));   /* la même liste que flSeancesSignatures : tri seul */
      var id = String(s.id || '');
      if (id && vus[id]) { ecartees.doublon = (ecartees.doublon || 0) + 1; return; }
      var r = null;
      try { r = window.flSeancesResumer(s, K, rang, (K === auj ? maint : undefined), tri); } catch (e) { r = null; }
      if (!r) { ecartees.illisible = (ecartees.illisible || 0) + 1; return; }
      if (r.exclue) { ecartees[r.exclue] = (ecartees[r.exclue] || 0) + 1; return; }
      vus[r.id] = 1; out.push(r);
    });
    signes[K] = sigJ.length ? flSeancesEmpreinte(sigJ.join(',')) : '';
  });
  var t1 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  return { seances: out, ecartees: ecartees, signatures: signes, ms: Math.round((t1 - t0) * 10) / 10 };
}

/* ─── LES TROIS PORTES DU NATIF ───────────────────────────────────────────── */

window.flSeancesContrat = function () {
  return { version: window.FL_SEANCES_VERSION, points: window.FL_SEANCES_POINTS, figeH: window.FL_SEANCES_FIGE_H };
};

/* Une TRANCHE : les séances des journées [depuis, depuis + jours[. Le premier
   remplissage avance tranche par tranche, une à la fois — jamais l'historique
   d'un bloc, qui tiendrait le fil unique du moteur. */
window.flSeancesTranche = function (depuis, jours) {
  try {
    var f = flSeancesFenetre(depuis, jours);
    var r = flSeancesDesJours(f.cles);
    return { v: window.FL_SEANCES_VERSION, depuis: f.depuis, jours: f.jours, plusAncien: f.plusAncien,
             seances: r.seances, ecartees: r.ecartees, signatures: r.signatures, ms: r.ms };
  } catch (e) { return { v: window.FL_SEANCES_VERSION, erreur: String(e && e.message || e), seances: [] }; }
};

/* Les mêmes, pour des journées NOMMÉES (le rafraîchissement : seulement celles
   dont la signature a changé, et celles qui ne sont pas encore figeables). */
window.flSeancesJours = function (cles) {
  try {
    var r = flSeancesDesJours((cles || []).map(String).slice(0, 62));
    return { v: window.FL_SEANCES_VERSION, seances: r.seances, ecartees: r.ecartees, signatures: r.signatures, ms: r.ms };
  } catch (e) { return { v: window.FL_SEANCES_VERSION, erreur: String(e && e.message || e), seances: [] }; }
};

/* Les SIGNATURES d'une fenêtre, sans rien calculer : une lecture et un tri par
   journée. C'est ce qui dit au carnet ce qui a été renommé, modifié ou
   supprimé depuis sa dernière visite. */
window.flSeancesSignatures = function (depuis, jours) {
  try {
    var f = flSeancesFenetre(depuis, jours), sig = {};
    f.cles.forEach(function (K) {
      var parts = [];
      flSeancesLireJour(K).forEach(function (s) {
        var tri = window.flSeancesTri(s);
        if (!tri.exclue) parts.push(flSeancesSignature(s));
      });
      sig[K] = parts.length ? flSeancesEmpreinte(parts.join(',')) : '';
    });
    return { v: window.FL_SEANCES_VERSION, depuis: f.depuis, jours: f.jours, plusAncien: f.plusAncien, signatures: sig };
  } catch (e) { return { v: window.FL_SEANCES_VERSION, erreur: String(e && e.message || e), signatures: {} }; }
};
