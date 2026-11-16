// ═══════════════════════════════════════════════════════════════════════════
//  LE BANC « OR » DU SCAN SUR GEMINI — 16 NOV. 2026
//
//  Pourquoi il existe : l'analyse de repas gagne un second fournisseur
//  (Claude, derrière `SCAN_FOURNISSEUR=anthropic`) dans le MÊME
//  `api/scan-meal.js`. La consigne : sans la variable, la production rend
//  EXACTEMENT ce qu'elle rendait. Les autres bancs du scan épinglent des
//  propriétés ; celui-ci épingle l'octet, comme `test-coach-or-gemini.js`.
//
//  Comment : des scénarios jouent le vrai handler avec un faux Gemini qui
//  RETIENT chaque requête. On enregistre ce que Google aurait reçu (URL sans
//  la clé, empreinte sha256 du corps, sa taille) et ce que l'app aurait reçu
//  (statut, en-têtes, JSON), plus les lignes du journal. Le fichier
//  `fixtures/or-scan-gemini.json` a été ÉCRIT PAR LE CODE D'AVANT Claude
//  (6977962, branche serveur-16nov) : ce banc compare le présent à ce passé.
//
//    node tests/test-scan-or-gemini.js            compare
//    node tests/test-scan-or-gemini.js --ecrire   réécrit l'or (à ne faire
//                                                 QUE sur le code d'avant)
//
//  Le décor pose AUSSI les clés Anthropic : elles seules ne doivent rien
//  changer. Seule `SCAN_FOURNISSEUR=anthropic` (exactement) bascule.
// ═══════════════════════════════════════════════════════════════════════════

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const empreinte = (s) => crypto.createHash('sha256').update(s).digest('hex');

const OR = path.join(__dirname, 'fixtures', 'or-scan-gemini.json');
const ECRIRE = process.argv.includes('--ecrire');

let vert = 0, rouge = 0;
function v(titre, ok, detail) {
  if (ok) { vert++; console.log('  ✅ ' + titre); }
  else { rouge++; console.log('  ❌ ' + titre + (detail ? '   ' + detail : '')); }
}

// ── Le décor : la production, plus des clés Anthropic qui ne doivent rien faire
process.env.GEMINI_API_KEY = 'cle-gemini-or';
process.env.FLINT_APP_SECRET = 'secret-or';
process.env.ANTHROPIC_API_KEY = 'sk-ant-or-1';
process.env.ANTHROPIC_API_KEY_2 = 'sk-ant-or-2';
for (const k of ['UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN', 'SCAN_PLAFOND_JOUR', 'SCAN_PLAFOND_JOUR_IP',
                 'SCAN_FOURNISSEUR', 'SCAN_MODELE', 'SCAN_EFFORT', 'SCAN_CLAUDE_SECOURS', 'COACH_FOURNISSEUR']) delete process.env[k];

const vraiFetch = global.fetch;
const scan = require(path.join(__dirname, '..', 'api', 'scan-meal.js'));

// ── Le faux Gemini qui retient ─────────────────────────────────────────────
let recus = [];
function fauxGemini(reponses) {
  let k = 0;
  global.fetch = async (url, init) => {
    recus.push({ url: String(url).replace(/key=[^&]*/, 'key=…'), corps: init.body });
    const r = reponses[Math.min(k++, reponses.length - 1)];
    if (r.jette) throw new Error(r.jette);
    if (r.statut) return { ok: false, status: r.statut, text: async () => r.texte || ('refus ' + r.statut) };
    const texte = r.brut !== undefined ? r.brut
      : JSON.stringify({ candidates: [{ content: { parts: [{ text: typeof r.objet === 'string' ? r.objet : JSON.stringify(r.objet) }] } }] });
    return { ok: true, status: 200, text: async () => texte };
  };
}

function fauxRes() {
  const r = { code: null, corps: null, entetes: {} };
  r.setHeader = (k, val) => { r.entetes[k] = val; };
  r.status = (c) => { r.code = c; return r; };
  r.json = (o) => { r.corps = o; return r; };
  r.end = () => r;
  return r;
}
let n = 0;
const ent = (extra) => Object.assign({ 'x-flint-key': 'secret-or', 'x-forwarded-for': '203.0.113.' + (++n),
                                       'x-flint-device': 'OR-' + n }, extra || {});

const JPEG = 'data:image/jpeg;base64,' + Buffer.from('photo-or-jpeg').toString('base64');
const PNG_BRUT = Buffer.from('photo-or-png').toString('base64');
const REPAS = { mealName: 'Bowl', healthScore: 8, healthNote: 'Bien.',
  items: [{ name: 'Riz', grams: 200, kcal: 260, prot: 5, carb: 57, fat: 1, confidence: 0.8 },
          { name: 'Poulet', grams: 150, kcal: 900, prot: 45, carb: 0, fat: 5, confidence: 0.7 }] };
const BRUT_CARTE = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'scan-carte', 'gemini-brut.json'), 'utf8'));
const ETIQUETTE = { lisible: true, name: ' Céréales ', brand: 'Marque', servingG: 30,
  per100: { kcal: 389, prot: 8.2, carb: 72.5, sugars: 21.04, fat: 5.6, satfat: 1.1, fiber: 6, salt: 0.72, caffeine: null } };

const SCENARIOS = [
  { nom: 'repas photo (data URL jpeg)', corps: { image: JPEG }, gemini: [{ objet: REPAS }] },
  { nom: 'repas photo (base64 brut + mime png)', corps: { image: PNG_BRUT, mime: 'image/png' }, gemini: [{ objet: REPAS }] },
  { nom: 'repas photo, mime hors forme → jpeg', corps: { image: PNG_BRUT, mime: 'text/html; x' }, gemini: [{ objet: REPAS }] },
  { nom: 'repas photo, note absente', corps: { image: JPEG }, gemini: [{ objet: { mealName: 'X', items: [] } }] },
  { nom: 'repas texte', corps: { text: '  deux œufs au plat, une tranche de pain  ' }, gemini: [{ objet: REPAS }] },
  { nom: 'repas texte + carte auto (reste un repas)', corps: { text: 'pâtes', carte: 'auto' }, gemini: [{ objet: REPAS }] },
  { nom: 'étiquette', corps: { mode: 'label', image: JPEG }, gemini: [{ objet: ETIQUETTE }] },
  { nom: 'étiquette illisible', corps: { mode: 'label', image: JPEG }, gemini: [{ objet: { lisible: false } }] },
  { nom: 'carte auto → repas', corps: { image: JPEG, carte: 'auto' }, gemini: [{ objet: REPAS }] },
  { nom: 'carte auto → carte', corps: { image: JPEG, carte: 'auto' }, gemini: [{ objet: BRUT_CARTE }] },
  { nom: 'carte: true → carte', corps: { image: JPEG, carte: true }, gemini: [{ objet: BRUT_CARTE }] },
  { nom: 'mode carte', corps: { image: JPEG, mode: 'carte' }, gemini: [{ objet: { menu: BRUT_CARTE.menu } }] },
  { nom: 'Gemini 400', corps: { image: JPEG }, gemini: [{ statut: 400, texte: 'requête refusée cle-gemini-or' }] },
  { nom: 'Gemini 503 partout (repas)', corps: { image: JPEG }, gemini: [{ statut: 503, texte: 'high demand' }] },
  { nom: 'Gemini 503 partout (carte auto)', corps: { image: JPEG, carte: 'auto' }, gemini: [{ statut: 503, texte: 'high demand' }] },
  { nom: 'Gemini 429 puis 200', corps: { image: JPEG }, gemini: [{ statut: 429 }, { objet: REPAS }] },
  { nom: 'Gemini réponse vide', corps: { image: JPEG }, gemini: [{ brut: JSON.stringify({ candidates: [] }) }] },
  { nom: 'Gemini JSON invalide', corps: { image: JPEG }, gemini: [{ objet: 'pas du json {' }] },
  { nom: 'aucun champ', corps: {}, gemini: [{ objet: REPAS }] },
  { nom: 'étiquette sans photo', corps: { mode: 'label', text: 'céréales' }, gemini: [{ objet: REPAS }] },
  { nom: 'photo trop lourde', corps: { image: 'A'.repeat(3 * 1024 * 1024 + 10) }, gemini: [{ objet: REPAS }] },
  { nom: 'mauvaise clé d\'app', entetes: { 'x-flint-key': 'faux' }, corps: { image: JPEG }, gemini: [{ objet: REPAS }] },
  { nom: 'device illisible', entetes: { 'x-flint-device': 'a b' }, corps: { image: JPEG }, gemini: [{ objet: REPAS }] },
  { nom: 'OPTIONS', methode: 'OPTIONS', corps: {}, gemini: [{ objet: REPAS }] },
  { nom: 'GET', methode: 'GET', corps: {}, gemini: [{ objet: REPAS }] },
  { nom: 'SCAN_FOURNISSEUR=gemini (≠ anthropic)', env: { SCAN_FOURNISSEUR: 'gemini' }, corps: { image: JPEG }, gemini: [{ objet: REPAS }] },
  { nom: 'SCAN_FOURNISSEUR=Anthropic (casse ≠)', env: { SCAN_FOURNISSEUR: 'Anthropic' }, corps: { image: JPEG }, gemini: [{ objet: REPAS }] },
  { nom: 'COACH_FOURNISSEUR=anthropic ne touche pas le scan', env: { COACH_FOURNISSEUR: 'anthropic' }, corps: { image: JPEG }, gemini: [{ objet: REPAS }] },
  { nom: 'clé Gemini absente', env: { GEMINI_API_KEY: '' }, corps: { image: JPEG }, gemini: [{ objet: REPAS }] },
];

async function jouer(s) {
  recus = [];
  fauxGemini(s.gemini);
  const avant = {};
  for (const [k, val] of Object.entries(s.env || {})) { avant[k] = process.env[k]; process.env[k] = val; }
  const lignes = [];
  const orig = console.log;
  console.log = (...a) => lignes.push(a.join(' '));
  const res = fauxRes();
  try {
    await scan({ method: s.methode || 'POST', headers: ent(s.entetes), body: s.corps }, res);
  } finally {
    console.log = orig;
    for (const [k, val] of Object.entries(avant)) { if (val === undefined) delete process.env[k]; else process.env[k] = val; }
  }
  return {
    google: recus.map((r) => ({ url: r.url, octets: Buffer.byteLength(r.corps, 'utf8'), sha256: empreinte(r.corps) })),
    app: { statut: res.code, entetes: res.entetes, corps: res.corps },
    journal: lignes
  };
}

(async () => {
  const present = {};
  for (const s of SCENARIOS) present[s.nom] = await jouer(s);
  global.fetch = vraiFetch;

  if (ECRIRE) {
    fs.writeFileSync(OR, JSON.stringify({ ecritPar: 'code d\'avant Claude (6977962)', scenarios: present }, null, 1) + '\n');
    console.log('or écrit : ' + Object.keys(present).length + ' scénarios → ' + OR);
    return;
  }
  const or = JSON.parse(fs.readFileSync(OR, 'utf8')).scenarios;
  console.log('\n═══ LE CHEMIN GEMINI, À L\'OCTET, CONTRE LE CODE D\'AVANT ═══');
  v('mêmes scénarios que l\'or', JSON.stringify(Object.keys(or)) === JSON.stringify(Object.keys(present)));
  for (const nom of Object.keys(or)) {
    const a = or[nom], b = present[nom] || {};
    v(nom + ' · ce que Google reçoit', JSON.stringify(a.google) === JSON.stringify(b.google), JSON.stringify(b.google).slice(0, 200));
    v(nom + ' · ce que l\'app reçoit', JSON.stringify(a.app) === JSON.stringify(b.app), JSON.stringify(b.app).slice(0, 200));
    v(nom + ' · le journal', JSON.stringify(a.journal) === JSON.stringify(b.journal), JSON.stringify(b.journal).slice(0, 200));
  }
  const fetchAnthropic = Object.values(present).some((p) => (p.google || []).some((g) => /anthropic/.test(g.url)));
  v('aucun scénario n\'appelle api.anthropic.com', !fetchAnthropic);
  console.log('\n  ' + vert + ' vert(s), ' + rouge + ' rouge(s)\n');
  process.exitCode = rouge ? 1 : 0;
})();
