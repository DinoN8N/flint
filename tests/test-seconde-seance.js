/* ═══════════════════════════════════════════════════════════════════════════
   LA SECONDE D'UNE SÉANCE — la seule source dense qu'on ait, et ses deux bornes.
   ═══════════════════════════════════════════════════════════════════════════

   CE QUI A MENÉ ICI, avec les chiffres. Le 11 août 2026, Dino compare sa fiche
   d'activité à WHOOP : « trop anguleuse, ça ne donne pas une impression de
   donnée continue ». Deux sources denses étaient possibles, une seule tient :

     · `rrH`, les intervalles horodatés — MESURÉ sur l'export d'un téléphone
       (`releves/donnees-felix-2026-08-11.json`, onze jours) : un paquet toutes
       les CINQ minutes, ~103 s de battements chacun, et une couverture de 0 et
       3 minutes sur les deux vraies séances. Inutilisable pour un tracé.
     · le flux temps réel, qui envoie UN BATTEMENT PAR SECONDE tant que le
       téléphone est relié. Celui-là est continu — et on le jetait, parce que
       `wDedoublonner` replie la journée à la minute (v1309, à raison : sans le
       repli, la nuit de Félix disparaissait sous le plafond).

   CE QUE CE BANC VÉRIFIE. Il extrait les VRAIES fonctions d'`index.html` par
   équilibrage d'accolades — pas une copie — et exige cinq choses :

     1. le plafond de 5 400 points tient, quoi qu'on pousse ;
     2. le ménage efface les jours PASSÉS et garde celui du jour ;
     3. `flEffData` préfère la seconde aux intervalles quand les deux sont là ;
     4. une couverture partielle est REFUSÉE — on retombe sur la série de la
        MINUTE (elle aussi horodatée depuis la v1403), pas sur une série fine
        trouée qui se dessinerait par de longues droites ;
     5. la série de la minute et les zones ne bougent pas d'un chiffre.

   LES DEUX BORNES SONT LE SUJET. Une donnée de confort qui grossirait chaque
   jour finirait par manger le stockage — et on connaît le prix de ce défaut
   (63 jours et `localStorage` saturait, l'écriture échouait ET coupait l'écran
   en cours). C'est pour ça qu'elles sont testées avant tout le reste.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RACINE = process.env.SRCROOT || path.join(__dirname, '..', '..', '..');
const INDEX = path.join(RACINE, 'FLINT', 'web', 'index.html');

let ok = 0, ko = 0;
function verifie(titre, condition, detail) {
  if (condition) { ok++; console.log(`  ✅ ${titre}`); }
  else { ko++; console.log(`  ❌ ${titre}${detail ? '  → ' + detail : ''}`); }
}

const src = fs.readFileSync(INDEX, 'utf8');

function extraire(amorce) {
  const d = src.indexOf(amorce);
  if (d < 0) return null;
  let i = src.indexOf('{', d), prof = 0;
  for (; i < src.length; i++) {
    if (src[i] === '{') prof++;
    else if (src[i] === '}') { prof--; if (!prof) break; }
  }
  return src.slice(d, i + 1) + ';';
}

const JOUR = '2026-8-11', HIER = '2026-8-10';
const DEBUT = 9 * 60 + 58, DUREE = 60;          // une marche de 60 min à 09:58

/* ── 1 · Le plafond ───────────────────────────────────────────────────────── */
console.log('\n1 · Le plafond de 5 400 points tient');
{
  /* On rejoue la mécanique du tampon telle qu'elle est écrite dans le moteur :
     une valeur par seconde, écrasement dans la même seconde, `splice` au-delà
     du plafond. Le banc ne peut pas instancier la closure entière ; il vérifie
     donc que le plafond EST écrit dans le fichier, puis que la règle qu'il
     encode borne bien la mémoire. */
  verifie('le plafond de 5 400 est bien dans le moteur',
          /a\.length>5400/.test(src) && /a\.splice\(0,a\.length-5400\)/.test(src),
          'la borne a disparu du code');

  const a = [];
  for (let s = 0; s < 20000; s++) {
    const der = a[a.length - 1];
    if (der && der[0] === s) der[1] = 100; else a.push([s, 100]);
    if (a.length > 5400) a.splice(0, a.length - 5400);
  }
  verifie('vingt mille battements ne laissent que 5 400 points',
          a.length === 5400, a.length + ' points');
  verifie('ce sont les DERNIERS qui restent, pas les premiers',
          a[a.length - 1][0] === 19999, 'dernier = ' + a[a.length - 1][0]);
  /* Quatre-vingt-dix minutes : de quoi couvrir une séance, jamais une journée. */
  verifie('le plafond couvre une séance et pas une journée',
          5400 === 90 * 60 && 5400 < 24 * 3600);
}

/* ── 2 · Le ménage ────────────────────────────────────────────────────────── */
console.log('\n2 · Les jours passés sont effacés au démarrage');
{
  const source = extraire('window.flSecondesMenage=function');
  verifie('flSecondesMenage existe dans index.html', !!source);

  if (source) {
    const magasin = {
      'hrSec_2026-8-11': '[]', 'hrSec_2026-8-10': '[]', 'hrSec_2026-8-9': '[]',
      'watch_2026-8-10': '{}', 'sessions_2026-8-10': '[]'
    };
    const bac = {
      console: { log() {} },
      tk: () => JOUR,
      localStorage: {
        get length() { return Object.keys(magasin).length; },
        key(i) { return Object.keys(magasin)[i]; },
        removeItem(k) { delete magasin[k]; }
      }
    };
    bac.window = bac;
    vm.createContext(bac);
    vm.runInContext(source, bac);
    const n = bac.window.flSecondesMenage();

    verifie('deux jours passés retirés', n === 2, n + ' retiré(s)');
    verifie('le jour courant est gardé', 'hrSec_2026-8-11' in magasin);
    verifie('hier est parti', !('hrSec_2026-8-10' in magasin));
    /* LA GARDE QUI COMPTE : le ménage ne doit toucher QUE ses propres clés. */
    verifie('watch_ n\'est pas touché', 'watch_2026-8-10' in magasin);
    verifie('sessions_ n\'est pas touché', 'sessions_2026-8-10' in magasin);
  }
}

/* ── La fiche, rejouée sur la vraie fonction ──────────────────────────────── */
const SEANCE = { name: 'Marche', start: '09:58', dur: DUREE, int: 2, eff: 8.4 };

function serieMinute() {
  const hr = [];
  for (let m = 0; m <= DUREE; m++) hr.push([DEBUT + m, 100 + (m % 12) * 3]);
  return hr;
}

/* Le flux temps réel : une valeur par seconde, en secondes DU JOUR.
   `couverture` dit quelle part de la séance a été relayée — la liaison peut
   tomber en cours de route, et c'est justement le cas qu'on veut refuser. */
function secondes(couverture) {
  const out = [];
  const jusqua = Math.round(DUREE * 60 * couverture);
  for (let s = 0; s < jusqua; s++) {
    const bpm = 118 + 22 * Math.sin(Math.PI * s / (DUREE * 60))
                    + 4 * Math.sin(s / 3.7);
    out.push([DEBUT * 60 + s, Math.round(bpm)]);
  }
  return out;
}

/* Des intervalles COMPLETS, pour prouver que la seconde passe devant même
   quand `rrH` serait acceptable. */
function intervalles() {
  const rrH = [];
  for (let m = 0; m < DUREE; m++) {
    const iv = []; let reste = 60000;
    for (let b = 0; reste > 0 && b < 200; b++) {
      const ms = 545 + Math.round(60 * Math.sin(b / 3.1));
      if (ms > reste) break;
      iv.push(ms); reste -= ms;
    }
    rrH.push([DEBUT + m, iv]);
  }
  return rrH;
}

function lancer({ sec, rrH }) {
  const bac = {};
  bac.window = bac;
  bac.console = { log() {} };
  bac.Math = Math; bac.JSON = JSON; bac.Date = Date;
  bac.String = String; bac.Number = Number; bac.Array = Array; bac.Object = Object;

  bac._flCurSess = { K: JOUR, startMin: DEBUT, title: 'Marche' };
  bac.tk = () => JOUR;
  bac.DB = {
    get: (k, d) => {
      if (String(k).indexOf('sessions_') === 0) return [SEANCE];
      if (String(k).indexOf('watch_') === 0) return { hr: serieMinute(), rrH: rrH || [], actDet: [] };
      return d;
    },
    set: () => {}
  };
  bac.p05 = () => 60;
  bac.flHrPropre = h => h;
  bac.flMedianeGlissante = h => h;
  bac.hmsFull = s => String(s);
  bac.actStrain = () => 8.4;
  /* La lecture du tampon, telle que le moteur l'appelle. Absente = le banc
     prouve aussi que la fiche vit sans elle. */
  if (sec) bac.flSecondesDuJour = () => sec;
  vm.createContext(bac);
  vm.runInContext(extraire('function flIdxDense('), bac);
  vm.runInContext(extraire('function flEffData('), bac);
  return bac.flEffData(null);
}

console.log('\n3 · La seconde passe avant les intervalles');
{
  const m = lancer({ sec: secondes(1), rrH: intervalles() });
  verifie('la séance est reconnue', !!m && m.real === true);
  verifie('la série fine existe', !!(m && m.hrT));
  if (m && m.hrT) {
    /* Un point toutes les cinq secondes : douze par minute. Les intervalles,
       eux, en auraient donné autant — c'est la RÉGULARITÉ qui les départage,
       et elle ne se lit pas sur le nombre. On vérifie donc l'écart entre
       points : la seconde donne un pas constant de 5 s. */
    const pas = [];
    for (let i = 1; i < m.hrT.length; i++) pas.push(m.hrT[i][0] - m.hrT[i - 1][0]);
    const irreguliers = pas.filter(p => p !== 5).length;
    verifie('le pas est régulier de bout en bout', irreguliers === 0,
            irreguliers + ' écart(s) différent(s) de 5 s');
    verifie('douze points par minute', m.hrT.length >= DUREE * 11,
            m.hrT.length + ' points pour ' + DUREE + ' minutes');
    verifie('toutes les valeurs sont physiologiques',
            m.hrT.every(p => p[1] > 25 && p[1] < 240));
    verifie('la courbe varie vraiment',
            new Set(m.hrT.map(p => p[1])).size >= 10,
            new Set(m.hrT.map(p => p[1])).size + ' valeurs distinctes');
    verifie('le plafond de 1 200 points est respecté', m.hrT.length <= 1200,
            m.hrT.length + ' points');
  }
}

console.log('\n4 · Une liaison tombée en cours de route est refusée');
{
  /* La moitié de la séance relayée, puis plus rien : sous le seuil des trois
     quarts. Accepter ferait une courbe fine sur la première moitié et une
     droite sur la seconde — pire que la minute. */
  const m = lancer({ sec: secondes(0.5), rrH: [] });
  /* Depuis la v1403 le repli n'est plus `null` : c'est la série de la MINUTE,
     horodatée. On ne teste donc plus une absence — on teste la DENSITÉ, qui est
     la seule chose qui distingue les deux séries. */
  const dense = !!m && m.hrT && m.hrT.length >= DUREE * 4;
  verifie('à 50 % de couverture, la série fine est refusée', !dense,
          m && m.hrT ? m.hrT.length + ' points' : 'aucun');
  verifie('on retombe sur la minute, une valeur par minute',
          !!m && m.hrT && m.hrT.length <= DUREE + 1,
          m && m.hrT ? m.hrT.length + ' points pour ' + DUREE + ' minutes' : '');
}

console.log('\n5 · Rien d\'autre ne bouge');
{
  const avec = lancer({ sec: secondes(1), rrH: [] });
  const sans = lancer({ sec: null, rrH: [] });
  verifie('sans tampon, la fiche vit',  !!sans && sans.real === true);
  verifie('sans tampon, la série reste celle de la minute',
          !!sans && sans.hrT && sans.hrT.length <= DUREE + 1,
          sans && sans.hrT ? sans.hrT.length + ' points' : 'aucune');
  /* LA GARDE DE LA v1403 : la minute est horodatée, donc chaque point porte sa
     seconde depuis le départ. Un pas de 60 s prouve qu'aucune minute n'a été
     escamotée sur cette série de test, qui est complète. */
  verifie('la minute est horodatée, un point toutes les 60 s',
          !!sans && sans.hrT && sans.hrT.every((p, i) => i === 0 || p[0] - sans.hrT[i-1][0] === 60));
  verifie('la série de la minute est identique avec et sans',
          JSON.stringify(avec.baseFin) === JSON.stringify(sans.baseFin));
  verifie('le prélèvement de calcul reste à 300 points',
          avec.base.length === 300 && sans.base.length === 300);
  verifie('les zones sont identiques au chiffre près',
          JSON.stringify(avec.zones) === JSON.stringify(sans.zones));
  verifie('la moyenne et le maximum ne bougent pas',
          avec.avg === sans.avg && avec.mx === sans.mx,
          avec.avg + '/' + sans.avg + ' — ' + avec.mx + '/' + sans.mx);
}

console.log(`\n${ko ? '❌' : '✅'} seconde de séance : ${ok} vert(s), ${ko} rouge(s)\n`);
process.exit(ko ? 1 : 0);
