/* ═══════════════════════════════════════════════════════════════════════════
   LA COURBE D'UNE SÉANCE — la finesse de la mesure, jamais plus.
   ═══════════════════════════════════════════════════════════════════════════

   LE DÉFAUT GARDÉ ICI, avec sa date. Le 11 août 2026, Dino pose côte à côte sa
   fiche d'activité et celle de WHOOP : « on doit passer d'une courbe simplifiée
   et anguleuse à une vraie courbe physiologique ». Deux causes, pas une :

     · côté NATIF, la série passait une SECONDE médiane glissante de cinq points
       par-dessus celle du moteur. Sur une mesure par minute, deux médianes de
       cinq font une fenêtre de neuf minutes, et une médiane ne garde que les
       plateaux : d'où l'escalier. Corrigé dans `ActiviteView.swift`.

     · côté MOTEUR — ce banc — la seule série disponible était celle de la
       MINUTE, parce que `wDedoublonner` replie la journée à la minute. Soixante
       points pour une heure de marche. `rrH` porte pourtant les battements
       horodatés, soixante à quatre-vingts par minute.

   CE QUE CE BANC VÉRIFIE. Il extrait la VRAIE fonction du vrai `index.html` et
   lui donne une séance dont il connaît le contenu exact.

     1. avec des intervalles sur toute la séance, `hrT` sort dense ET horodaté ;
     2. chaque point rendu est une mesure : aucune valeur ne sort d'une tranche
        où aucun battement n'a été enregistré ;
     3. sans intervalles, l'écran retombe sur la série de la MINUTE — horodatée
        depuis la v1403 — et `hr` ne bouge pas ;
     4. avec une couverture partielle, la série fine est refusée : trouée, elle
        se dessinerait par de longues droites, moins fidèle que la minute ;
     5. le plafond de 1200 points est respecté sur une séance longue.

   CE QU'IL NE FAIT PAS. Il ne juge ni les zones, ni la charge, ni les
   statistiques : `base` reste le prélèvement uniforme de 300 points et ce banc
   vérifie justement qu'on n'y a pas touché.
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

/* Même découpage sur les accolades que test-densite-courbes.js — pas de
   parseur à installer. */
function extraire(nom, nue) {
  const d = nue ? src.indexOf('function ' + nom + '(')
                : src.indexOf('window.' + nom + '=function');
  if (d < 0) return null;
  let i = src.indexOf('{', d), prof = 0;
  for (; i < src.length; i++) {
    if (src[i] === '{') prof++;
    else if (src[i] === '}') { prof--; if (!prof) break; }
  }
  return src.slice(d, i + 1) + ';';
}

/* ── La séance : une marche de 60 minutes à partir de 9h58 ─────────────────── */
const DEBUT = 9 * 60 + 58, DUREE = 60;
const SEANCE = { name: 'Marche', start: '09:58', dur: DUREE, int: 2, eff: 8.4 };

/* Une mesure par minute — ce que le stockage garde. Une dent de scie lente,
   pour que la série de la minute ne soit pas confondue avec la série fine. */
function serieMinute() {
  const hr = [];
  for (let m = 0; m <= DUREE; m++) hr.push([DEBUT + m, 100 + (m % 12) * 3]);
  return hr;
}

/* Les intervalles entre battements, minute par minute. `couverture` dit quelle
   part des minutes en porte. Un cœur à ~110 bpm respire : l'intervalle oscille
   d'un battement à l'autre, et c'est exactement ce qu'on veut voir survivre. */
function intervalles(couverture) {
  const rrH = [];
  const jusqua = Math.round(DUREE * couverture);
  for (let m = 0; m < jusqua; m++) {
    const iv = [];
    let reste = 60000;
    /* Le cœur dérive au fil de la séance (l'effort monte puis retombe) ET
       respire d'un battement à l'autre. Les deux doivent survivre. */
    const derive = Math.round(90 * Math.sin(Math.PI * m / DUREE));
    for (let b = 0; reste > 0 && b < 200; b++) {
      const ms = 620 - derive + Math.round(60 * Math.sin(b / 3.1)) + (b % 5) * 4;
      if (ms > reste) break;
      iv.push(ms); reste -= ms;
    }
    rrH.push([DEBUT + m, iv]);
  }
  return rrH;
}

function lancer({ hr, rrH }) {
  const bac = {};
  bac.window = bac;
  bac.console = { log() {} };
  bac.Math = Math; bac.JSON = JSON; bac.Date = Date;
  bac.String = String; bac.Number = Number; bac.Array = Array; bac.Object = Object;

  bac._flCurSess = { K: '2026-8-11', startMin: DEBUT, title: 'Marche' };
  bac.tk = () => '2026-8-11';
  bac.DB = {
    get: (k, d) => {
      if (String(k).indexOf('sessions_') === 0) return [SEANCE];
      if (String(k).indexOf('watch_') === 0) return { hr: hr, rrH: rrH, actDet: [] };
      return d;
    },
    set: () => {}
  };
  bac.p05 = () => 60;
  bac.flHrPropre = h => h;
  bac.flMedianeGlissante = h => h;
  bac.hmsFull = s => String(s);
  bac.actStrain = () => 8.4;
  vm.createContext(bac);

  /* `flIdxDense` doit vivre dans le même bac que son appelant : sans lui,
     l'appel lèverait un ReferenceError que le try/catch interne avalerait en
     silence, et la série fine reviendrait null sans un mot. */
  vm.runInContext(extraire('flIdxDense', true), bac);
  vm.runInContext(extraire('flEffData', true), bac);
  return bac.flEffData(null);
}

console.log('\n1 · Les intervalles donnent une courbe dense et datée');
{
  const m = lancer({ hr: serieMinute(), rrH: intervalles(1) });
  verifie('la séance est reconnue', !!m && m.real === true);
  verifie('la série de la minute est toujours là',
          !!m && Array.isArray(m.baseFin) && m.baseFin.length >= DUREE,
          m && m.baseFin ? m.baseFin.length + ' points' : 'absente');
  verifie('la série fine existe', !!(m && m.hrT), m && m.hrT ? '' : 'null');

  if (m && m.hrT) {
    verifie('elle est au moins six fois plus dense que la minute',
            m.hrT.length >= DUREE * 6, m.hrT.length + ' points pour ' + DUREE + ' minutes');
    verifie('chaque point est une paire [seconde, bpm]',
            m.hrT.every(p => Array.isArray(p) && p.length === 2));
    verifie('les secondes sont chronologiques',
            m.hrT.every((p, k) => k === 0 || p[0] > m.hrT[k - 1][0]),
            'un zigzag temporel déformerait la courbe');
    verifie('le premier point est au départ de la séance', m.hrT[0][0] < 10,
            m.hrT[0][0] + ' s');
    verifie('le dernier point ne dépasse pas la fin',
            m.hrT[m.hrT.length - 1][0] <= DUREE * 60,
            m.hrT[m.hrT.length - 1][0] + ' s pour ' + (DUREE * 60));
    verifie('toutes les valeurs sont physiologiques',
            m.hrT.every(p => p[1] > 25 && p[1] < 240));
    /* LA VARIATION EST LE SUJET. Une série fine qui ne varie pas n'apporte
       rien : c'est la minute avec plus de points. */
    const vals = m.hrT.map(p => p[1]);
    verifie('la courbe varie vraiment d\'un point à l\'autre',
            new Set(vals).size >= 8, new Set(vals).size + ' valeurs distinctes');
  }
}

console.log('\n2 · Aucun point ne sort d\'une tranche sans battement');
{
  /* Une seule minute d'intervalles au milieu d'une séance non couverte : le
     seuil de couverture doit refuser la série fine. Si elle sortait quand même,
     ses points seraient des inventions pour 59 minutes sur 60. */
  const m = lancer({ hr: serieMinute(), rrH: intervalles(1 / 60) });
  /* v1403 — le repli est la série de la minute, pas une absence : on teste donc
     la densité, seule chose qui distingue les deux séries. */
  verifie('une minute d\'intervalles ne fabrique pas une heure de courbe',
          !!m && m.hrT && m.hrT.length <= DUREE + 1,
          m && m.hrT ? m.hrT.length + ' points' : 'aucun');
}

console.log('\n3 · Sans intervalles, rien ne change');
{
  const m = lancer({ hr: serieMinute(), rrH: [] });
  verifie('la série fine est absente, la minute prend le relais',
          !!m && m.hrT && m.hrT.length <= DUREE + 1,
          m && m.hrT ? m.hrT.length + ' points' : 'aucune');
  verifie('la série de la minute est intacte',
          !!m && m.baseFin.length === DUREE + 1,
          m && m.baseFin ? m.baseFin.length + ' points' : 'absente');
  verifie('les zones sont toujours comptées', !!m && Array.isArray(m.zones) && m.zones.length === 6);
  verifie('le prélèvement de calcul reste à 300 points',
          !!m && m.base.length === 300, m ? m.base.length + '' : '');
}

console.log('\n4 · Une couverture partielle retombe sur la minute');
{
  /* La moitié des minutes : sous le seuil des trois quarts. Une courbe fine sur
     la première moitié et rien sur la seconde se dessinerait par une longue
     droite — pire que la minute, qui est régulière. */
  const m = lancer({ hr: serieMinute(), rrH: intervalles(0.5) });
  verifie('à 50 % de couverture, la série fine est refusée',
          !!m && m.hrT && m.hrT.length <= DUREE + 1,
          m && m.hrT ? m.hrT.length + ' points' : 'aucun');
}

console.log('\n5 · Le plafond tient sur une longue séance');
{
  const m = lancer({ hr: serieMinute(), rrH: intervalles(1) });
  if (m && m.hrT) {
    verifie('le plafond de 1200 points est respecté', m.hrT.length <= 1200,
            m.hrT.length + ' points');
  } else { verifie('le plafond de 1200 points est respecté', false, 'pas de série fine'); }
}

console.log(`\n${ko ? '❌' : '✅'} courbe de séance : ${ok} vert(s), ${ko} rouge(s)\n`);
process.exit(ko ? 1 : 0);
