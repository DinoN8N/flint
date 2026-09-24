#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   LES BANCS DE `api/` — `node tests/tous-api.js`

   Ils existaient (quatre fichiers, écrits le 22 septembre en durcissant la
   porte d'entrée) mais AUCUN lanceur ne les nommait : il fallait se souvenir
   de leurs noms pour les jouer. Un banc qu'on ne joue pas est une promesse,
   pas une protection — c'est la phrase que `test-coach-api.js` porte en
   en-tête, et elle valait aussi pour lui-même.

   Ils ne touchent à rien : faux `fetch`, fausses requêtes, aucune clé, aucun
   réseau. À lancer avant tout déploiement de `api/`.
   ═══════════════════════════════════════════════════════════════════════════ */
const { execFileSync } = require('child_process');
const path = require('path');

const BANCS = [
  ['test-coach-api.js',       'la porte d\'entrée : secret, signature, rate-limit, CORS'],
  ['test-coach-outils.js',    'les outils que le Coach déclare à Gemini'],
  ['test-coach-contexte.js',  'ce que le prompt système reçoit, et ce qu\'il ne reçoit jamais'],
  ['test-coach-scenarios.js', 'des conversations entières, de la question au rangement'],
  ['test-coach-flux.js',      'la diffusion par jeton : SSE recollé, « Suites » retenue, repli en JSON'],
  ['test-coach-securite.js',  'les 5 000 : rejeu, taille, device, erreurs muettes, en-têtes, bornes, clé'],
];

let rouges = 0;
for (const [fichier, quoi] of BANCS) {
  try {
    execFileSync(process.execPath, [path.join(__dirname, fichier)], { stdio: 'inherit' });
    console.log(`\n✅ ${fichier.padEnd(26)} ${quoi}\n`);
  } catch (e) {
    rouges++;
    console.log(`\n❌ ${fichier.padEnd(26)} ${quoi}\n`);
  }
}
console.log(rouges ? `\n${rouges} banc(s) en échec.` : '\nTous les bancs d\'api sont verts.');
process.exitCode = rouges ? 1 : 0;
