// ═══════════════════════════════════════════════════════════════════════════
//  LE BANC DE L'ESSAI DU SERVEUR — 17 NOV. 2026
//
//  `node tests/test-essai-serveur.js`
//
//  `outils/essai-serveur.js` doit dire « tout marche » quand tout marche, et
//  ROUGIR quand quelque chose casse. Ce banc le prouve à blanc : le vrai code
//  de api/ dans un serveur local, de faux modèles, aucune requête vers
//  l'extérieur (toute tentative est refusée et comptée par l'essai lui-même).
//
//   ① la suite complète est verte, chemin Claude et chemin Gemini ;
//   ② chaque panne qu'on y glisse la fait rougir (code 1) avec le bon nom :
//      porte ouverte, clé dans une réponse, bascule non lue, flux sans « fin »,
//      CORS « * », requête vers l'extérieur, page de protection Vercel, flux
//      muet plus longtemps que l'app ne patiente ;
//   ③ sans clé d'app sur le Mac : seule la porte, et le code 3 ;
//   ④ rien de secret ne s'affiche, et une mauvaise commande rend 2.
// ═══════════════════════════════════════════════════════════════════════════

const path = require('path');
const { execFileSync } = require('child_process');

const OUTIL = path.join(__dirname, '..', 'outils', 'essai-serveur.js');
let vert = 0, rouge = 0;
function v(titre, ok, detail) {
  if (ok) { vert++; console.log('  ✅ ' + titre); }
  else { rouge++; console.log('  ❌ ' + titre + (detail ? '   ' + detail : '')); }
}

/** Lance l'outil comme on le lance à la main ; rend { code, sortie }. */
function lancer(args, env) {
  const e = Object.assign({}, process.env, env || {});
  // L'essai ne doit RIEN lire de ce Mac en mode à blanc : on vide ces variables.
  for (const k of ['FLINT_APP_SECRET', 'COACH_SIG_SECRET', 'VERCEL_PROTECTION_BYPASS', 'ESSAI_SEC_PANNE', 'ESSAI_DELAI_COACH_S']) {
    if (!(env && k in env)) delete e[k];
  }
  try {
    return { code: 0, sortie: execFileSync(process.execPath, [OUTIL].concat(args), { env: e, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) };
  } catch (x) {
    return { code: x.status, sortie: String(x.stdout || '') + String(x.stderr || '') };
  }
}
const rouges = (s) => s.split('\n').filter((l) => l.startsWith('❌')).map((l) => l.replace(/\s+\(\d+,\d s\)$/, ''));
const SECRETS_FACTICES = ['essai-sec-cle-app', 'essai-sec-signature', 'sk-ant-essai-sec', 'AIzaEssaiSec'];

(async () => {
  console.log('\n═══ ① LA SUITE COMPLÈTE, À BLANC ═══');
  const claude = lancer(['--sec']);
  v('chemin Claude : code 0, « Tout marche »', claude.code === 0 && /✅ Tout marche/.test(claude.sortie), 'code ' + claude.code + ' ' + rouges(claude.sortie).join(' | '));
  v('  … aucune ligne rouge', rouges(claude.sortie).length === 0, rouges(claude.sortie).join(' | '));
  for (const n of ['sans clé d\'app → 401', 'mauvais en-tête d\'appareil → 400', 'une fausse signature est refusée',
                   'question simple : répondu par anthropic', 'question « chiffre » : trois phrases', 'flux (SSE) : des morceaux puis une « fin »',
                   'flux : jamais plus de 45 s sans un octet', 'photo de repas : schéma et garde-fous', 'étiquette : chaque valeur lue juste',
                   'carte de resto : les plats écrits sont relevés', 'description texte', 'passe par Claude (un fichier qui n\'est pas une image → 415)',
                   'photo trop lourde', 'scan : servi par anthropic', 'sans code Apple → 400', 'aucune clé dans les réponses', 'aucune clé dans le journal du serveur',
                   'jamais « Access-Control-Allow-Origin: * »', 'no-store', 'aucune requête vers l\'extérieur']) {
    v('  … vérifie : ' + n, claude.sortie.split('\n').some((l) => l.startsWith('✅') && l.includes(n)));
  }
  const gemini = lancer(['--sec', '--gemini']);
  v('chemin Gemini (sans les variables de bascule) : code 0', gemini.code === 0 && /✅ Tout marche/.test(gemini.sortie), rouges(gemini.sortie).join(' | '));
  v('  … le 415 de Claude n\'y est pas tenté (Gemini enverrait le fichier au modèle)', /⏭️ +scan : passe par Claude/.test(gemini.sortie));
  v('  … le Coach y est jugé « répondu par gemini »', /✅ question simple : répondu par gemini/.test(gemini.sortie));

  console.log('\n═══ ② CHAQUE PANNE LE FAIT ROUGIR ═══');
  const pannes = [
    ['porte-ouverte', {}, ['scan : sans clé d\'app → 401', 'suppression de compte : sans clé d\'app → 401']],
    ['cle-fuite', {}, ['aucune clé dans les réponses']],
    ['gemini-reste', {}, ['question simple : répondu par anthropic', 'passe par Claude']],
    ['flux-sans-fin', {}, ['flux (SSE) : des morceaux puis une « fin »']],
    ['cors-etoile', {}, ['jamais « Access-Control-Allow-Origin: * »', 'CORS fermé']],
    ['externe', {}, ['aucune requête vers l\'extérieur']],
    ['protection', {}, ['la Preview est joignable']],
    ['lent', { ESSAI_DELAI_COACH_S: '1' }, ['flux : jamais plus de 1 s sans un octet']],
    ['credit-vide', {}, ['scan : servi par anthropic', 'question simple (JSON)']]
  ];
  for (const [p, env, attendus] of pannes) {
    const r = lancer(['--sec'], Object.assign({ ESSAI_SEC_PANNE: p }, env));
    const lr = rouges(r.sortie);
    v(`panne « ${p} » : code 1 et ❌ ${attendus.map((a) => '« ' + a + ' »').join(', ')}`,
      r.code === 1 && attendus.every((a) => lr.some((l) => l.includes(a))) && /^❌ \d+ problème/m.test(r.sortie),
      'code ' + r.code + ' · ' + lr.join(' | '));
    v(`  … et aucun secret factice dans ce qu'elle affiche`, !SECRETS_FACTICES.some((s) => r.sortie.includes(s)),
      SECRETS_FACTICES.filter((s) => r.sortie.includes(s)).join(', '));
  }

  // Le même silence, mais le serveur bat (période 300 ms ici) : vert, et
  // l'essai compte les battements.
  const battu = lancer(['--sec'], { ESSAI_SEC_PANNE: 'lent-battu', ESSAI_DELAI_COACH_S: '1' });
  v('le même silence avec battement : code 0, et les battements sont comptés',
    battu.code === 0 && /battement\(s\) « : attente »/.test(battu.sortie), 'code ' + battu.code + ' ' + rouges(battu.sortie).join(' | '));
  const vide = lancer(['--sec'], { ESSAI_SEC_PANNE: 'credit-vide' });
  v('crédits Claude vides : le repli du scan est NOMMÉ (servi par Gemini en REPLI)', /servi par Gemini en REPLI/.test(vide.sortie));

  console.log('\n═══ ③ SANS CLÉ D\'APP SUR LE MAC : LA PORTE SEULE, CODE 3 ═══');
  // Le mode « réel » joué contre le serveur local : c'est ce que voit
  // quelqu'un qui lance l'essai sans avoir posé FLINT_APP_SECRET.
  const E = require(OUTIL);
  const local = await E.serveurLocal({});
  const log = console.log; const journal = [];
  console.log = (...x) => journal.push(x.join(' '));
  let sansCle, mauvaisFournisseur;
  try {
    sansCle = await E.jouerSuite({ base: local.base, secrets: {}, attendu: 'anthropic' });
    journal.push('— fin du passage sans clé —');
    mauvaisFournisseur = await E.jouerSuite({ base: local.base, secrets: local.secrets, attendu: 'gemini' });
  } finally { console.log = log; await local.fermer(); }
  const r3 = E.rendre(sansCle, '');
  v('code 3 « incomplet », pas 0', r3.code === 3, 'code ' + r3.code);
  v('  … la porte est jugée (11 vérifications vertes au moins)', r3.oks.length >= 11, r3.oks.length + ' vertes');
  v('  … le Coach, le scan et le compte sont « non essayés »', ['coach', 'scan', 'compte'].every((g) => r3.toutes.some((l) => l.groupe === g && l.etat === 'saute')));
  v('  … la phrase dit de poser FLINT_APP_SECRET', /pose FLINT_APP_SECRET/.test(r3.texte));
  const journalSansCle = journal.slice(0, journal.indexOf('— fin du passage sans clé —'));
  v('  … aucun modèle appelé (aucune ligne [coach]/[scan] au journal)', !journalSansCle.some((l) => /^\[(coach|scan)\] (mode=(reponse|outils|flux)|claude)/.test(l)), journal.filter((l) => /^\[(coach|scan)\]/.test(l)).slice(0, 2).join(' | '));
  const r4 = E.rendre(mauvaisFournisseur, '');
  v('attendre gemini d\'un serveur basculé sur Claude : rouge', r4.code === 1 && r4.kos.some((l) => /répondu par gemini/.test(l.nom)), r4.kos.map((l) => l.nom).join(' | '));

  console.log('\n═══ ④ L\'USAGE ═══');
  v('sans argument : code 2', lancer([]).code === 2);
  v('une option inconnue : code 2', lancer(['--sec', '--n-importe']).code === 2);
  v('--attendu autre chose : code 2', lancer(['https://exemple.invalid', '--attendu', 'openai']).code === 2);
  v('une URL illisible : code 2', lancer(['pas-une-url']).code === 2);
  v('la suite verte n\'affiche aucun secret factice', !SECRETS_FACTICES.some((s) => claude.sortie.includes(s)));
  v('l\'en-tête dit ce qui est posé sur le Mac, jamais la valeur', /clé d'app oui · signature du Coach oui/.test(claude.sortie));

  console.log(`\n${vert} réussis, ${rouge} échoués`);
  if (rouge) process.exit(1);
})().catch((e) => { console.error(e); process.exit(1); });
