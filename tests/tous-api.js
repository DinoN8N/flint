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
  ['test-coach-natif-seul.js', 'v2 sans instantané : la part native (rééducation, bracelet) passe quand même'],
  ['test-coach-adaptateurs.js', 'les réponses V1 récrites en unités d\'écran, et le bloc DONNÉES DU JOUR'],
  ['test-coach-contexte.js',  'ce que le prompt système reçoit, et ce qu\'il ne reçoit jamais'],
  ['test-coach-manuel.js',    'le manuel : préfixe fixe ≤ 22 Ko, constantes du moteur, aucune fiche « i » recopiée'],
  ['test-coach-histoire.js',  'l\'historique vu par Gemini : marqueurs retirés, signatures intactes, talons, budget ; Suites/Retenir ; mémo'],
  ['test-coach-instantane-rendu.js', 'l\'instantané : bornes, clés interdites, unités, injection contenue, faits récents, mémos'],
  ['test-coach-scenarios.js', 'des conversations entières, de la question au rangement'],
  ['test-coach-flux.js',      'la diffusion par jeton : SSE recollé, « Suites » retenue, repli en JSON'],
  ['test-coach-securite.js',  'les 5 000 : rejeu, taille, device, erreurs muettes, en-têtes, bornes, clé'],
  ['test-apple-revocation.js', 'la suppression d\'un compte Apple : JWT ES256, échange, révocation, pannes muettes, rien de secret au journal'],
  // 16 nov. 2026 — le scan avait trois bancs qu'aucun lanceur ne nommait.
  ['test-scan-etiquette.js',  'le scan : la lecture d\'étiquette (mode label), bornes physiques'],
  ['test-scan-carte.js',      'le scan : la carte du resto, la porte (CORS, device, compteurs, plafond du jour)'],
  ['test-scan-or-gemini.js',  'le scan sans SCAN_FOURNISSEUR : Gemini à l\'octet contre le code d\'avant Claude'],
  ['test-scan-claude.js',     'le scan sur Claude : requête, schémas, contrat = Gemini, photo, relais de clé, pannes'],
  // 17 nov. 2026 — quatre bancs du Coach écrits les 15-16 nov. qu'aucun lanceur
  // ne nommait : deployer.sh joue CE fichier, donc le Coach sur Claude partait
  // en production sans que son banc soit joué.
  ['test-coach-claude.js',    'le Coach sur Claude : requête, messages, outils, flux, relais de clé, pannes'],
  ['test-coach-v3.js',        'le Coach v3 : étapes annoncées, blocs visuels, phrase de rédaction'],
  ['test-coach-or-gemini.js', 'le Coach sans COACH_FOURNISSEUR : Gemini à l\'octet contre le code d\'avant Claude'],
  ['test-coach-chiffre.js',   '« touche un chiffre » : trois phrases, table fermée, préfixe du cache intact'],
  ['test-coach-battement.js', 'le flux du Coach sur Claude bat toutes les 15 s pendant que le modèle réfléchit (l\'app abandonne à 45 s de silence)'],
  ['test-essai-serveur.js',   'l\'essai du jour de la bascule (outils/essai-serveur.js), joué à blanc'],
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
