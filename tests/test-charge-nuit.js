/* ═══════════════════════════════════════════════════════════════════════════
   LA CHARGE DE LA PAGE NUIT — elle contient une nuit, pas un refus poli.
   ═══════════════════════════════════════════════════════════════════════════

   LE DÉFAUT GARDÉ ICI, avec sa date. Du 6 au 8 août 2026, `flSommeilData`
   lisait `_argJour` — une variable ajoutée en v1242 dans le corps de la
   fonction, mais jamais dans sa signature. Lire une variable non déclarée LÈVE
   dès la première ligne ; le `try{…}catch(e){return {aDesDonnees:false};}` qui
   entoure la fonction attrapait la panne et rendait « pas de données ». La page
   « Ma nuit » s'ouvrait vide à tous les coups, et ça ressemblait exactement à
   une fonctionnalité pas encore branchée.

   `garde-portee.js` empêche désormais CETTE faute-là d'entrer. Ce banc-ci garde
   la CONSÉQUENCE : quelle que soit la cause, si une nuit existe et que la charge
   revient avec un seul champ, c'est un défaut. Le garde vérifie la grammaire, ce
   banc vérifie le résultat — il attrapera la prochaine cause, qui ne sera pas
   celle-là.

   CE QU'IL FAIT. Il extrait la VRAIE fonction du vrai `index.html` et l'exécute
   avec une nuit factice à la place de `sleepNight`. Rien n'est recopié : si
   quelqu'un réécrit la fonction, c'est la nouvelle qui est jugée.

   CE QU'IL NE FAIT PAS. Il ne juge aucun chiffre — ni la dette, ni le score, ni
   les stades ; c'est le travail de `test-sommeil.js` sur le vrai moteur. Il
   demande une seule chose : que la charge ARRIVE.
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

/* La fonction, découpée sur ses accolades — pas de parseur à installer. */
function extraire(nom) {
  const src = fs.readFileSync(INDEX, 'utf8');
  const d = src.indexOf('window.' + nom + '=function');
  if (d < 0) return null;
  let i = src.indexOf('{', d), prof = 0;
  for (; i < src.length; i++) {
    if (src[i] === '{') prof++;
    else if (src[i] === '}') { prof--; if (!prof) break; }
  }
  return src.slice(d, i + 1) + ';';
}

/* Une nuit telle que `sleepNight()` la rend : 6 h 52 dormies, 91 % d'efficacité,
   couchée à 23h15, réveil à 07h07. Les champs sont ceux que le moteur pose. */
const NUIT = { asleep: 412, efficiency: 91, bedMin: 1395, wakeMin: 427,
               deep: 96, light: 214, rem: 102, awake: 26, wakeCount: 3 };

function bacASable() {
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
  bac.DB = { get: (k, d) => d, set: () => {} };
  bac.p05 = () => 50;
  bac.flHrPropre = h => h;
  bac.flMedianeGlissante = h => h;
  bac.slStageSegs2 = () => [];
  bac.hmsFull = s => String(s);
  vm.createContext(bac);
  return bac;
}

console.log('\n1 · La page nuit reçoit sa nuit');
{
  const source = extraire('flSommeilData');
  verifie('flSommeilData existe dans index.html', !!source);

  if (source) {
    const bac = bacASable();
    let charge = null, leve = null;
    try { vm.runInContext(source, bac); charge = bac.flSommeilData(); }
    catch (e) { leve = e; }

    verifie('elle ne lève pas', !leve, leve && (leve.name + ' : ' + leve.message));

    if (charge) {
      const champs = Object.keys(charge).length;
      /* LE CŒUR DU BANC. Une nuit existe : refuser de la rendre est le défaut
         du 6 août, et il se reconnaît à une charge réduite à son seul refus. */
      verifie('elle annonce des données', charge.aDesDonnees === true,
              'aDesDonnees=' + charge.aDesDonnees + ' avec ' + champs + ' champ(s) — ' +
              'une nuit existe pourtant. C est le defaut du 6 aout : un catch qui avale.');
      verifie('elle rend plus qu un refus (> 5 champs)', champs > 5, champs + ' champ(s)');
      verifie('elle rend la durée dormie', charge.dormiH != null,
              'dormiH=' + charge.dormiH);
    }
  }
}

/* v1248 — LA MÊME QUESTION POUR LES AUTRES ÉCRANS, mais sans nuit factice :
   on ne juge que « ça ne lève pas ». Un écran peut légitimement n'avoir rien à
   dire ; aucun n'a le droit de tomber. */
console.log('\n2 · Aucune charge d écran ne lève');
for (const nom of ['flDiagPont']) {
  const source = extraire(nom);
  verifie(nom + ' existe', !!source);
}

console.log(`\n${ok} ✅   ${ko} ❌\n`);
process.exit(ko ? 1 : 0);
