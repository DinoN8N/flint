/* ═══════════════════════════════════════════════════════════════════════════
   LA DENSITÉ DES COURBES — une mesure reçue est une mesure dessinée.
   ═══════════════════════════════════════════════════════════════════════════

   LE DÉFAUT GARDÉ ICI, avec sa date. Le 8 août 2026, Dino compare sa courbe de
   nuit à celle de WHOOP : « il y en a une qui paraît beaucoup plus fine,
   beaucoup plus précise ; si ça se trouve c'est pas juste un problème de
   finesse ». Il avait raison. La montre enregistrait ~880 mesures pour la nuit,
   le moteur n'en gardait que 120 — une toutes les 4 min 30 — et il gardait la
   valeur MÉDIANE de chaque tranche, ce qui supprime par construction le pic le
   plus haut et le creux le plus bas. Les réveils brefs étaient donc jetés AVANT
   d'être dessinés, et aucun réglage d'affichage ne pouvait les faire revenir.

   La raison écrite à l'époque était juste — « 880 points sur une largeur de
   téléphone, c'est illisible » — mais elle valait pour un trait épais. Le trait
   natif est passé à 1 pt : à cette finesse, la densité EST la lecture.

   CE QUE CE BANC VÉRIFIE. Il extrait la VRAIE fonction du vrai `index.html` et
   lui donne une nuit dont il connaît le contenu exact : 880 mesures plates, un
   pic bref à 168 et un creux bref à 38. Il exige deux choses, et rien d'autre :
     · que les 880 mesures ressortent toutes (aucune réduction sous le plafond) ;
     · que le pic et le creux SURVIVENT même quand la réduction se déclenche.

   CE QU'IL NE FAIT PAS. Il ne juge aucune valeur calculée — ni la dette, ni les
   stades, ni les zones. Une courbe est une courbe : on lui demande de ne rien
   perdre, pas d'avoir raison.
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

/* Découpage sur les accolades — pas de parseur à installer, même méthode que
   test-charge-nuit.js. `prefixe` distingue `window.fl…=function` d'une
   déclaration nue `function fl…(`. */
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

/* Nuit de 23h15 à 07h07 — 472 minutes de fenêtre. */
const NUIT = { asleep: 412, efficiency: 91, bedMin: 1395, wakeMin: 427,
               deep: 96, light: 214, rem: 102, awake: 26, wakeCount: 3 };

/* 880 mesures réparties sur la fenêtre, à ~32 s d'intervalle. Deux d'entre
   elles sont des accidents brefs : c'est exactement ce que la médiane jetait. */
const PIC = 168, CREUX = 38, N = 880;
const I_PIC = 500, I_CREUX = 143;
function serieNuit() {
  const hr = [];
  for (let i = 0; i < N; i++) {
    const m = (1395 + (472 * i / N)) % 1440;      // passage de minuit compris
    let bpm = 52;
    if (i === I_PIC) bpm = PIC;
    else if (i === I_CREUX) bpm = CREUX;
    hr.push([m, bpm]);
  }
  return hr;
}

function bacASable(hr) {
  const bac = {};
  bac.window = bac;
  bac.console = { log() {} };
  bac.Math = Math; bac.JSON = JSON; bac.Date = Date; bac.isNaN = isNaN;
  bac.String = String; bac.Number = Number; bac.Array = Array; bac.Object = Object;

  bac.flDayOff = 0;
  bac.tk = off => { const d = new Date(2026, 7, 8); d.setDate(d.getDate() + (off || 0));
                    return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };
  bac.sleepNight = () => NUIT;
  bac.getProfile = () => ({ name: 'Dino', age: 25, wake: '07:00', need: 8 });
  bac.flBesoinSommeil = () => ({ h: 8, source: 'profil' });
  bac.DB = { get: (k, d) => (String(k).indexOf('watch_') === 0 ? { hr: hr } : d), set: () => {} };
  bac.p05 = () => 50;
  bac.flHrPropre = h => h;
  bac.flMedianeGlissante = h => h;
  bac.slStageSegs2 = () => [];
  bac.hmsFull = s => String(s);
  vm.createContext(bac);
  return bac;
}

console.log('\n1 · Le réducteur garde les extrêmes, jamais la médiane');
{
  const source = extraire('flIdxDense', true);
  verifie('flIdxDense existe dans index.html', !!source);

  if (source) {
    const bac = { Math: Math }; vm.createContext(bac);
    vm.runInContext(source, bac);
    const f = bac.flIdxDense;

    const petit = [50, 60, 55, 70];
    verifie('sous le plafond, aucune réduction',
            f(petit.length, i => petit[i], 1200).length === 4);

    /* Au-dessus du plafond : c'est là que l'ancienne médiane perdait le pic. */
    const gros = new Array(5000).fill(50); gros[3777] = PIC; gros[1234] = CREUX;
    const idx = f(gros.length, i => gros[i], 1200);
    const vals = idx.map(i => gros[i]);
    verifie('le plafond est respecté', idx.length <= 1200, idx.length + ' points');
    verifie('le pic bref survit à la réduction', vals.indexOf(PIC) >= 0);
    verifie('le creux bref survit à la réduction', vals.indexOf(CREUX) >= 0);
    verifie('les indices restent chronologiques',
            idx.every((v, k) => k === 0 || v > idx[k - 1]),
            'un zigzag temporel déformerait la courbe');
    verifie('série vide, pas de plantage', f(0, () => 0, 1200).length === 0);
    verifie('un seul point', f(1, () => 5, 1200).length === 1);
  }
}

console.log('\n2 · La nuit arrive entière à l écran');
{
  const source = extraire('flSommeilData');
  verifie('flSommeilData existe', !!source);

  /* LE RÉDUCTEUR DOIT VIVRE DANS LE MÊME <script> QUE L APPELANT.
     Sans ça, l appel lèverait un ReferenceError… que le `try/catch` interne de
     la courbe avalerait en silence : la nuit reviendrait VIDE sans un mot.
     C est le motif décrit dans « le catch avale la panne » — on le rend
     impossible ici plutôt que de le découvrir sur le téléphone. */
  const reducteur = extraire('flIdxDense', true);
  const entre = src.slice(src.indexOf('function flIdxDense('),
                          src.indexOf('window.flSommeilData=function'));
  verifie('le réducteur précède l appelant, sans </script> entre les deux',
          !!reducteur && entre.indexOf('</script') < 0,
          'un ReferenceError serait avalé par le catch et rendrait la nuit vide');

  if (source) {
    const bac = bacASable(serieNuit());
    let charge = null, leve = null;
    try { vm.runInContext(reducteur, bac); vm.runInContext(source, bac); charge = bac.flSommeilData(); }
    catch (e) { leve = e; }

    verifie('elle ne lève pas', !leve, leve && (leve.name + ' : ' + leve.message));

    const fc = charge && charge.fc;
    verifie('la courbe existe', Array.isArray(fc) && fc.length > 0);

    if (Array.isArray(fc)) {
      /* LE CŒUR DU BANC. 880 mesures reçues, 880 mesures rendues. Le seuil est
         écrit à 200 et non à 880 pour ne pas casser au premier ajustement de
         plafond : ce qu'on interdit, c'est le RETOUR À 120. */
      verifie('elle ne se fait plus raboter à 120 points', fc.length > 200,
              fc.length + ' points pour 880 mesures — c est la réduction du 8 août');
      verifie('les 880 mesures passent intactes', fc.length === N,
              fc.length + ' au lieu de ' + N);
      verifie('le réveil bref est dessiné', fc.indexOf(PIC) >= 0,
              'le pic à ' + PIC + ' a été supprimé avant l affichage');
      verifie('le creux bref est dessiné', fc.indexOf(CREUX) >= 0,
              'le creux à ' + CREUX + ' a été supprimé avant l affichage');
    }
  }
}

console.log(`\n${ok} ✅   ${ko} ❌\n`);
process.exit(ko ? 1 : 0);
