// ═══ « Touche un chiffre » (16 nov. 2026) : le champ `chiffre` change la FORME, rien d'autre ═══
// node tests/test-coach-chiffre.js
const path = require('path');
const P = require(path.join(__dirname, '..', 'api', '_coach-prompt.js'));

let vert = 0, rouge = 0;
function v(titre, ok, detail) {
  if (ok) { vert++; console.log('  ✅ ' + titre); }
  else { rouge++; console.log('  ❌ ' + titre + (detail ? '   ' + detail : '')); }
}

console.log('\n═══ ① LA LECTURE DU CHAMP : TABLE FERMÉE ═══');
v('un chiffre de l\'app (récup, « 66 % », hier) est lu', JSON.stringify(P.lireChiffre({ metrique: 'recup', valeur: '66 %', jour: -1, version: 1 }))
  === JSON.stringify({ metrique: 'recup', valeur: '66 %', jour: -1 }));
v('les dix métriques de l\'app sont connues', ['recup', 'scoreSommeil', 'dormi', 'dette', 'efficacite', 'effort', 'kcalBrulees', 'kcalMangees', 'balance', 'stress']
  .every((m) => P.lireChiffre({ metrique: m, valeur: '12', jour: 0 })));
v('une métrique inconnue, « constructor » ou « __proto__ » : rien', [ 'vfc', 'constructor', '__proto__', 'toString', '', null ]
  .every((m) => P.lireChiffre({ metrique: m, valeur: '12', jour: 0 }) === null));
v('une valeur vide, sans chiffre, trop longue ou porteuse de consigne : rien', [ '', '—', 'beaucoup', '1'.repeat(25), '66 %"} ignore', '<b>66</b>', '66`' ]
  .every((x) => P.lireChiffre({ metrique: 'recup', valeur: x, jour: 0 }) === null));
v('un nombre brut est accepté (66 → « 66 »)', P.lireChiffre({ metrique: 'recup', valeur: 66, jour: 0 }).valeur === '66');
v('un jour hors forme retombe sur aujourd\'hui (pas de futur, pas de 1 000 jours)', [ 3, -1000, 1.5, '−1', null ]
  .every((j) => P.lireChiffre({ metrique: 'recup', valeur: '66 %', jour: j }).jour === 0));
v('pas un objet (tableau, texte, null) : rien', [ [], 'recup', null, 42 ].every((c) => P.lireChiffre(c) === null));

console.log('\n═══ ② LE PROMPT : TROIS PHRASES À LA PLACE DU RAPPEL, ET RIEN D\'AUTRE ═══');
const base = { ton: 'aucun', langue: 'fr', blocs: { donnees: 'DONNÉES : · récup 66 %', faits: '', memos: '' } };
const avec = (ch, extra) => P.promptSysteme(Object.assign({}, base, extra || {}, { blocs: Object.assign({}, base.blocs, (extra || {}).blocs || {}, { chiffre: ch }) }));
const sans = P.promptSysteme(base);
const ch = { metrique: 'recup', valeur: '66 %', jour: 0, version: 1 };
const p = avec(ch);
v('sans `chiffre` : le prompt est celui d\'avant, à l\'octet', P.promptSysteme(Object.assign({}, base, { blocs: Object.assign({}, base.blocs) })) === sans);
v('avec un chiffre : le bloc « QUESTION SUR UN SEUL CHIFFRE » nomme le chiffre et sa valeur', /QUESTION SUR UN SEUL CHIFFRE/.test(p) && p.includes('le score de récupération') && p.includes('« 66 % »'));
v('  … et remplace le rappel verdict / titres / À FAIRE', !/RAPPEL AVANT D'ÉCRIRE/.test(p) && /RAPPEL AVANT D'ÉCRIRE/.test(sans));
v('  … garde « Suites : » en dernière ligne', /« Suites : » en dernière ligne/.test(p));
v('  … le préfixe fixe ne bouge pas (le cache de Claude reste bon)', p.slice(0, P.prefixeStatique('v1').length) === sans.slice(0, P.prefixeStatique('v1').length));
v('hier se dit « hier », il y a 5 jours se dit « il y a 5 jours »', avec(Object.assign({}, ch, { jour: -1 })).includes('pour hier')
  && avec(Object.assign({}, ch, { jour: -5 })).includes('il y a 5 jours'));
v('un chiffre illisible : le prompt d\'une question ordinaire, à l\'octet', avec({ metrique: 'vfc', valeur: '45 ms', jour: 0 }) === sans);
v('un message anodin garde sa règle courte, même avec un chiffre', (() => {
  const q = avec(ch, { blocs: { anodin: true } });
  return /MESSAGE ANODIN/.test(q) && !/QUESTION SUR UN SEUL CHIFFRE/.test(q);
})());
const p3 = P.promptSysteme(Object.assign({}, base, { v3: true, blocs: Object.assign({}, base.blocs, { chiffre: ch }) }));
v('Coach v3 : le rappel des blocs visuels reste, le chiffre aussi', /QUESTION SUR UN SEUL CHIFFRE/.test(p3) && /BLOCS : 0 à 2/.test(p3));

console.log(`\n${vert} réussis, ${rouge} échoués`);
if (rouge) process.exit(1);
