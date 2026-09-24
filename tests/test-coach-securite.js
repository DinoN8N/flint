// ═══════════════════════════════════════════════════════════════════════════
//  LE BANC DES 5 000 — sécurité et robustesse de `api/`, 24 sept. 2026
//
//  Ce que `test-coach-api.js` ne couvrait pas, et qu'on a durci pour tenir
//  cinq mille personnes : le rejeu d'une signature, la taille du corps, la
//  forme du device, ce qu'une erreur dit (et ne dit pas), les en-têtes de
//  sûreté, la borne de la table de rate-limit, le journal du plafond qui ne
//  crie qu'une fois par minute, la clé Gemini qui ne sort jamais.
//
//  Il exerce les VRAIS fichiers : `_lib.js` directement, `coach.js` et
//  `scan-meal.js` par leur handler, avec un faux `fetch`. Aucune clé, aucun
//  réseau — chaque `process.env` posé ici est un décor de banc.
// ═══════════════════════════════════════════════════════════════════════════

const path = require('path');
const crypto = require('crypto');
const lib = require(path.join(__dirname, '..', 'api', '_lib.js'));

let vert = 0, rouge = 0;
function v(titre, ok, detail) {
  if (ok) { vert++; console.log('  ✅ ' + titre); }
  else { rouge++; console.log('  ❌ ' + titre + (detail ? '   ' + detail : '')); }
}

function fauxRes() {
  const r = { code: null, corps: null, entetes: {}, morceaux: [], fini: false };
  r.setHeader = (k, val) => { r.entetes[k] = val; };
  r.status = (c) => { r.code = c; return r; };
  r.json = (o) => { r.corps = o; return r; };
  r.writeHead = (c, h) => { r.code = c; Object.assign(r.entetes, h || {}); return r; };
  r.write = (s) => { r.morceaux.push(s); return true; };
  r.end = () => { r.fini = true; return r; };
  return r;
}
function fauxReq(entetes, corps, methode) {
  return { method: methode || 'POST', headers: entetes || {}, body: corps === undefined ? {} : corps };
}
/** Capture ce que `console.log` écrit pendant `fn` (async). */
async function capterJournal(fn) {
  const lignes = [];
  const orig = console.log;
  console.log = (...a) => lignes.push(a.join(' '));
  try { await fn(); } finally { console.log = orig; }
  return lignes;
}

(async () => {

console.log('\n═══ ① UNE SIGNATURE NE SERT QU\'UNE FOIS (REJEU) ═══');
{
  process.env.COACH_SIG_SECRET = 'sig-de-banc';
  const corps = JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'salut' }] }] });
  const signer = (d, ts, c) => crypto.createHmac('sha256', 'sig-de-banc')
    .update(d + '.' + ts + '.' + crypto.createHash('sha256').update(c).digest('hex')).digest('hex');
  const ts = String(Date.now());
  const sig = signer('APP-REJEU', ts, corps);
  const req = () => fauxReq({ 'x-flint-device': 'APP-REJEU', 'x-flint-ts': ts, 'x-flint-sig': sig });
  const r1 = lib.verifierSignature(req(), corps);
  v('la première fois, la signature passe', r1.ok === true, JSON.stringify(r1));
  const r2 = lib.verifierSignature(req(), corps);
  v('la MÊME signature, même corps, dans la fenêtre : refusée comme rejouée',
    r2.ok === false && r2.raison === 'signature rejouée', JSON.stringify(r2));
  // Une signature fausse ne s'inscrit pas : la bonne, ensuite, passe encore.
  const ts2 = String(Date.now() + 1);
  const bonne2 = signer('APP-REJEU', ts2, corps);
  lib.verifierSignature(fauxReq({ 'x-flint-device': 'APP-REJEU', 'x-flint-ts': ts2, 'x-flint-sig': bonne2 }),
                        corps + ' ');   // corps altéré → invalide, PAS mémorisée
  v('une signature invalide n\'est pas mémorisée : la bonne passe ensuite',
    lib.verifierSignature(fauxReq({ 'x-flint-device': 'APP-REJEU', 'x-flint-ts': ts2, 'x-flint-sig': bonne2 }), corps).ok === true);

  // La mémoire est bornée et expire.
  v('une signature expirée est oubliée', lib.signatureDejaVue('sig-x', 1000, 10) === false
    && lib.signatureDejaVue('sig-x', 1005, 10) === true && lib.signatureDejaVue('sig-x', 1011, 10) === false);
  for (let i = 0; i < 25000; i++) lib.signatureDejaVue('inventee-' + i, 5000, 300000);
  v('la mémoire de signatures est bornée (≤ 20 000 après 25 000 insertions)',
    lib.tailleSignaturesVues() <= 20000, 'taille ' + lib.tailleSignaturesVues());
  delete process.env.COACH_SIG_SECRET;
}

console.log('\n═══ ② LA TABLE DE RATE-LIMIT NE GROSSIT PAS SANS FIN ═══');
{
  const now = Date.now();
  let bloquees = 0;
  for (let i = 0; i < 30000; i++) {
    if (lib.rateLimited('dev:invente-' + i, 40, { ip: '203.0.113.99', maxIP: 120 })) bloquees++;
  }
  v('30 000 devices inventés dans la minute : la table reste ≤ 20 000 clés',
    lib.tailleRateLimit() <= 20001, 'taille ' + lib.tailleRateLimit());
  v('  … et l\'IP les a rattrapés : tout est refusé au-delà du plafond IP',
    bloquees >= 30000 - 121, bloquees + ' refus');
  v('  … un vrai client, autre IP, passe toujours',
    lib.rateLimited('dev:honnete', 40, { ip: '198.51.100.1' }) === false);
}

console.log('\n═══ ③ LE DEVICE A UNE FORME, OU IL N\'EST PAS ═══');
{
  const uuid = '6F9619FF-8B86-D011-B42D-00C04FC964FF';
  v('un UUID (la forme de l\'app) est accepté', lib.deviceRequete(fauxReq({ 'x-flint-device': uuid })) === uuid);
  v('« banc » (la forme des bancs) est accepté', lib.deviceRequete(fauxReq({ 'x-flint-device': 'banc' })) === 'banc');
  v('un saut de ligne (forge de journal) est refusé',
    lib.deviceRequete(fauxReq({ 'x-flint-device': 'abc\n[coach] mode=faux' })) === ''
    && lib.deviceIllisible(fauxReq({ 'x-flint-device': 'abc\n[coach] mode=faux' })) === true);
  v('129 caractères : refusé ; 128 : accepté',
    lib.deviceIllisible(fauxReq({ 'x-flint-device': 'a'.repeat(129) })) === true
    && lib.deviceRequete(fauxReq({ 'x-flint-device': 'a'.repeat(128) })).length === 128);
  v('absent : pas illisible, l\'identité tombe sur l\'IP',
    lib.deviceIllisible(fauxReq({})) === false
    && lib.identiteRequete(fauxReq({ 'x-forwarded-for': '203.0.113.5' })) === 'ip:203.0.113.5');
  v('illisible : l\'identité tombe sur l\'IP aussi (repli, pas une porte)',
    lib.identiteRequete(fauxReq({ 'x-flint-device': 'a b', 'x-forwarded-for': '203.0.113.5' })) === 'ip:203.0.113.5');
}

console.log('\n═══ ④ LES EN-TÊTES DE SÛRETÉ SONT SUR TOUTE RÉPONSE ═══');
{
  const res = fauxRes();
  lib.cors(res);
  v('`cors()` pose Cache-Control: no-store', res.entetes['Cache-Control'] === 'no-store');
  v('  … et X-Content-Type-Options: nosniff', res.entetes['X-Content-Type-Options'] === 'nosniff');
}

console.log('\n═══ ⑤ LE PLAFOND EN PANNE S\'ÉCRIT UNE FOIS PAR MINUTE ═══');
{
  process.env.UPSTASH_REDIS_REST_URL = 'https://banc.upstash.io';
  process.env.UPSTASH_REDIS_REST_TOKEN = 'jeton-de-banc';
  const vraiFetch = global.fetch;
  global.fetch = async () => { throw new Error('ECONNREFUSED banc'); };
  const lignes = await capterJournal(async () => {
    for (let i = 0; i < 50; i++) await lib.plafondJournalier({ id: 'x', portee: 'banc-plafond', max: 10, now: 1000000 + i });
  });
  const pannes = lignes.filter(l => l.includes('[plafond] panne'));
  v('50 requêtes pendant la panne → UNE ligne de journal', pannes.length === 1, pannes.length + ' ligne(s)');
  const apres = await capterJournal(async () => {
    await lib.plafondJournalier({ id: 'x', portee: 'banc-plafond', max: 10, now: 1000000 + 61000 });
  });
  v('  … et une de plus la minute suivante', apres.filter(l => l.includes('[plafond] panne')).length === 1);
  const r = await lib.plafondJournalier({ id: 'x', portee: 'banc-plafond', max: 10, now: 1000000 + 2 });
  v('  … le fail-open est gardé : on laisse passer', r.atteint === false && r.actif === true);
  global.fetch = vraiFetch;
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
}

console.log('\n═══ ⑥ LA CLÉ GEMINI NE SORT JAMAIS ═══');
{
  const vraiFetch = global.fetch;
  const key = 'AIza-CLE-DE-BANC-0000';
  // Google qui, un jour, répéterait la clé dans son erreur ; et une panne
  // réseau dont le message cite l'URL.
  global.fetch = async (url) => ({ ok: false, status: 400, text: async () => 'clé refusée : ' + url });
  const g = await lib.appelerGemini({ key, modeles: ['m'], corps: {}, delaiMs: 1000, tentativesParModele: 1 });
  v('le `detail` d\'une erreur Gemini ne contient pas la clé',
    !String(g.detail).includes(key) && String(g.detail).includes('[clé]'), String(g.detail));
  global.fetch = async (url) => { throw new Error('fetch failed ' + url); };
  const g2 = await lib.appelerGemini({ key, modeles: ['m'], corps: {}, delaiMs: 1000, tentativesParModele: 1 });
  v('  … ni celui d\'une panne réseau', !String(g2.detail).includes(key), String(g2.detail));
  const g3 = await lib.ouvrirGeminiFlux({ key, modeles: ['m'], corps: {}, delaiMs: 1000 });
  v('  … ni en flux', !String(g3.detail).includes(key), String(g3.detail));
  global.fetch = vraiFetch;
  v('`sansCle` masque toutes les occurrences', lib.sansCle('a' + key + 'b' + key, key) === 'a[clé]b[clé]');
  const src = require('fs').readFileSync(path.join(__dirname, '..', 'api', '_lib.js'), 'utf8');
  v('aucun console.log de _lib.js n\'écrit une URL Gemini', !/console\.log\([^)]*\burl\b/.test(src));
}

console.log('\n' + vert + ' vert(s), ' + rouge + ' rouge(s)\n');
process.exitCode = rouge ? 1 : 0;

})();
