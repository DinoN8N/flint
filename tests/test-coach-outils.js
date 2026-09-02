#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   LE BANC DES OUTILS DU COACH — contrat des déclarations d'outils Gemini.

   `_coach-tools.js` est le SEUL endroit qui dit à Gemini quels outils
   existent. `CoachOutils.swift` (natif, non testable ici) doit savoir
   exécuter exactement les mêmes noms — ce banc fige donc la liste et sa
   forme, pour qu'un renommage silencieux d'un côté se voie tout de suite.
   ═══════════════════════════════════════════════════════════════════════════ */
const { OUTILS } = require('../api/_coach-tools');

let ok = 0, ko = 0;
const verifie = (t, c, d) => { c ? (ok++, console.log(`  ✅ ${t}`))
                                : (ko++, console.log(`  ❌ ${t}${d ? '  → ' + d : ''}`)); };

console.log('\n1 · Forme générale');
verifie('OUTILS est un tableau non vide', Array.isArray(OUTILS) && OUTILS.length > 0);
OUTILS.forEach(o => {
  verifie(`"${o.name}" a un nom, une description, des paramètres`,
    typeof o.name === 'string' && o.name.length > 0 &&
    typeof o.description === 'string' && o.description.length > 5 &&
    o.parameters && o.parameters.type === 'object' && typeof o.parameters.properties === 'object');
});

console.log('\n2 · Pas de doublon de nom (Gemini refuserait la déclaration)');
{
  const noms = OUTILS.map(o => o.name);
  verifie('tous les noms sont uniques', new Set(noms).size === noms.length, noms.join(','));
}

console.log('\n3 · Le sous-ensemble Phase 1 attendu est bien présent');
const ATTENDUS = [
  'getUserProfile', 'getCoachPreferences', 'getRecoveryContext',
  'getSleepHistory', 'getActivityHistory', 'getTrainingLoad', 'getNutritionToday'
];
ATTENDUS.forEach(n => {
  verifie(`l'outil "${n}" est déclaré`, OUTILS.some(o => o.name === n));
});

console.log('\n4 · Les outils paramétrés déclarent bien leurs paramètres requis');
['getSleepHistory', 'getActivityHistory'].forEach(n => {
  const o = OUTILS.find(x => x.name === n);
  verifie(`"${n}" exige "joursN"`,
    !!o && Array.isArray(o.parameters.required) && o.parameters.required.includes('joursN'));
});

console.log(`\n${ko === 0 ? '✅' : '❌'} test-coach-outils.js : ${ok} réussis, ${ko} échoués\n`);
process.exit(ko ? 1 : 0);
