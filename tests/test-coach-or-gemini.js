// ═══════════════════════════════════════════════════════════════════════════
//  LE BANC « OR » DU CHEMIN GEMINI — 15 NOV. 2026
//
//  Pourquoi il existe : le Coach v3 ajoute un second fournisseur (Claude) dans
//  le MÊME `api/coach.js`. La consigne est nette : sans `COACH_FOURNISSEUR`,
//  la production doit rendre EXACTEMENT ce qu'elle rendait. Les autres bancs
//  épinglent des propriétés ; celui-ci épingle l'octet.
//
//  Comment : une liste de scénarios joue le vrai handler avec un faux Gemini
//  qui RETIENT chaque corps reçu. On enregistre, pour chaque scénario, ce que
//  Google aurait reçu (URL sans clé, corps) et ce que l'app aurait reçu
//  (statut, JSON, événements SSE) — les corps Google par leur empreinte
//  sha256, ce que l'app reçoit en clair. Le fichier `fixtures/or-gemini.json` a été
//  ÉCRIT PAR LE CODE D'AVANT LE COACH V3 (commit 848f416) : ce banc compare le
//  présent à ce passé, champ à champ.
//
//    node tests/test-coach-or-gemini.js            compare
//    node tests/test-coach-or-gemini.js --ecrire   réécrit l'or (à ne faire
//                                                  QUE sur le code d'avant)
//
//  Ce qui est normalisé, et seulement ça : la date d'un mémo sans instantané
//  (c'est la date du jour à Paris, elle change à minuit). Rien d'autre.
// ═══════════════════════════════════════════════════════════════════════════

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const empreinte = (x) => crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');

const OR = path.join(__dirname, 'fixtures', 'or-gemini.json');
const ECRIRE = process.argv.includes('--ecrire');

let vert = 0, rouge = 0;
function v(titre, ok, detail) {
  if (ok) { vert++; console.log('  ✅ ' + titre); }
  else { rouge++; console.log('  ❌ ' + titre + (detail ? '   ' + detail : '')); }
}

// ── Le décor : la production, sans aucune variable du Coach v3 ─────────────
process.env.FLINT_APP_SECRET = 'secret-de-banc';
process.env.GEMINI_API_KEY = 'cle-de-banc';
for (const k of ['COACH_EXIGE_SIGNATURE', 'UPSTASH_REDIS_REST_URL', 'COACH_V2', 'COACH_V2_APPAREILS',
                 'COACH_FACTURATION', 'COACH_PRECHARGE', 'COACH_COMPACTION', 'COACH_FOURNISSEUR',
                 'ANTHROPIC_API_KEY', 'COACH_MODELE', 'COACH_EFFORT']) delete process.env[k];

const vraiFetch = global.fetch;
const handler = require(path.join(__dirname, '..', 'api', 'coach.js'));
const { prechargement } = require(path.join(__dirname, '..', 'api', '_coach-histoire.js'));
const REPONSES_V1 = require(path.join(__dirname, 'fixtures', 'precharge-v1.json'));
const INSTANTANE = require(path.join(__dirname, 'fixtures', 'instantane-synthetique.json'));
const NATIF = require(path.join(__dirname, 'fixtures', 'natif-synthetique.json'));

// ── Le faux Gemini qui retient ─────────────────────────────────────────────
const morceauTexte = (t) => JSON.stringify({ candidates: [{ content: { parts: [{ text: t }] } }] });
const morceauOutil = (nom, args, sig) => JSON.stringify({ candidates: [{ content: { parts: [
  Object.assign({ functionCall: { name: nom, args: args || {} } }, sig ? { thoughtSignature: sig } : {})] } }] });

function fauxGemini({ morceaux = [], bloc = null, blocParts = null, statut = 200, fluxMuet = false }) {
  const recus = [];
  global.fetch = async (url, init) => {
    recus.push({ url: String(url).replace(/key=[^&]*/, 'key=…'), corps: JSON.parse(init.body) });
    if (statut !== 200) return { ok: false, status: statut, body: null, text: async () => 'refus simulé ' + statut };
    if (String(url).includes('streamGenerateContent')) {
      const sse = fluxMuet ? '' : morceaux.map((m) => 'data: ' + m + '\r\n\r\n').join('');
      const octets = Buffer.from(sse, 'utf8');
      let i = 0;
      const body = { getReader: () => ({ read: async () => {
        if (i >= octets.length) return { done: true, value: undefined };
        const bout = octets.subarray(i, i + 13); i += 13;
        return { done: false, value: new Uint8Array(bout) };
      } }) };
      return { ok: true, status: 200, body, text: async () => sse };
    }
    const parts = blocParts || [{ text: bloc == null ? 'Réponse.' : bloc }];
    return { ok: true, status: 200, text: async () => JSON.stringify({ candidates: [{ content: { role: 'model', parts } }] }) };
  };
  return recus;
}

function fauxRes() {
  const r = { code: null, corps: null, entetes: {}, morceaux: [], sse: false };
  r.setHeader = (k, val) => { r.entetes[k] = val; };
  r.status = (c) => { r.code = c; return r; };
  r.json = (o) => { r.corps = o; return r; };
  r.writeHead = (c, h) => { r.code = c; Object.assign(r.entetes, h || {}); r.sse = true; return r; };
  r.write = (s) => { r.morceaux.push(s); return true; };
  r.end = () => r;
  return r;
}

let n = 0;
async function jouer(corps, entetes) {
  n++;
  const res = fauxRes();
  const orig = console.log;
  console.log = () => {};
  try {
    await handler({ method: 'POST', headers: Object.assign({ 'x-flint-key': 'secret-de-banc', 'x-flint-device': 'or-' + n,
      'x-forwarded-for': '203.0.113.' + (n % 250) }, entetes || {}), body: corps }, res);
  } finally { console.log = orig; }
  const evenements = res.sse ? res.morceaux.join('').split('\n\n').filter((b) => b.startsWith('data:'))
    .map((b) => JSON.parse(b.slice(5).trim())) : null;
  return { code: res.code, corps: res.corps, sse: res.sse, evenements, entetes: res.entetes };
}

// La date d'un mémo sans instantané est celle du jour : on la masque.
function normaliser(x) {
  return JSON.parse(JSON.stringify(x, (k, val) =>
    (k === 'd' && typeof val === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(val) ? 'AUJOURD-HUI' : val)));
}

// ── Les scénarios ──────────────────────────────────────────────────────────
function suivi(texte, version) {
  const p = prechargement({ version: version || 'v1' });
  return [
    { role: 'user', parts: [{ text: texte }] },
    p.tourModele,
    { role: 'function', parts: p.appels.map((a) => ({ functionResponse: { name: a.name,
      response: a.name === 'getDay' ? { jour: INSTANTANE.meta.jour, recup: INSTANTANE.recup } : REPONSES_V1[a.name] } })) }
  ];
}
const Q = (t) => [{ role: 'user', parts: [{ text: t }] }];
const base = (extra) => Object.assign({ deviceId: 'or', langue: 'fr', ton: 'aucun', profilTexte: '', memoireTexte: '' }, extra || {});
const CAP_V2 = { instantane: 1, outils: 1, natif: 1, memo: 1 };
const V2 = (extra) => base(Object.assign({ ton: 'analytique', capacites: CAP_V2, instantane: INSTANTANE, natif: NATIF,
  faits: '· (12 sept.) [objectif] finir un 10 km',
  memos: [{ d: '2026-9-15', q: 'Et mon foot ?', v: 'Séance solide.', a: 'Récupère ce soir.' }] }, extra || {}));
const REPONSE = '**Récup à 74/100 : tu peux charger.**\n\n## Pourquoi\n- **VFC haute** : 71 ms, au-dessus de ta normale.\n\n'
  + '## À faire\n- Séance soutenue ce soir.\n\nRetenir : objectif — prépare un semi-marathon en mars\n'
  + 'Suites : Et demain ? | Mon sommeil ?';
const tour = (i) => [
  { role: 'model', parts: [{ functionCall: { name: 'getSleepHistory', args: { joursN: 14 } }, thoughtSignature: 'sig-' + i }] },
  { role: 'function', parts: [{ functionResponse: { name: 'getSleepHistory', response: REPONSES_V1.getSleepHistory } }] }
];

const SCENARIOS = [
  ['v1, question nouvelle : préchargement (JSON)', {}, () => base({ contents: Q('Pourquoi ma récup est à 74 ?') })],
  ['v1, question nouvelle, flux demandé', {}, () => base({ flux: true, contents: Q('Et mon sommeil ?') })],
  ['v1, question nouvelle en anglais', {}, () => base({ langue: 'en', contents: Q('Why is my recovery 74?') })],
  ['v1, message anodin', { bloc: 'Avec plaisir !\nSuites : Ma récup ? | Mon sommeil ?' }, () => base({ contents: Q('merci') })],
  ['v1, deuxième aller, JSON', { bloc: REPONSE }, () => base({ contents: suivi('Je peux charger ?') })],
  ['v1, deuxième aller, flux', { morceaux: [morceauTexte('**Ta VFC est à 71 ms.**\n\n## À faire\n- Garde ton rythme.\n\n'),
                                            morceauTexte('Suites : Et demain ? | Mon sommeil ?')] },
   () => base({ flux: true, contents: suivi('Et ma VFC ?') })],
  ['v1, deuxième aller, Gemini demande un outil (JSON)', { blocParts: [{ functionCall: { name: 'getSleepHistory', args: { joursN: 14 } }, thoughtSignature: 'sig-g' }] },
   () => base({ contents: suivi('Et ce mois-ci ?') })],
  ['v1, deuxième aller, Gemini demande un outil (flux, es)', { morceaux: [morceauOutil('getActivityHistory', { joursN: 30 }, 'sig-f')] },
   () => base({ flux: true, langue: 'es', contents: suivi('¿Y mis sesiones?') })],
  ['v1, flux muet : repli en bloc', { fluxMuet: true, bloc: 'Repli préparé.\n\nSuites : A ? | B ?' },
   () => base({ flux: true, contents: suivi('Et ma VFC ?') })],
  ['v1, Gemini 503 partout (JSON)', { statut: 503 }, () => base({ contents: suivi('Et ma VFC ?') })],
  ['v1, Gemini 400 (flux)', { statut: 400 }, () => base({ flux: true, contents: suivi('Et ma VFC ?') })],
  ['v1, préchargement + 3 vrais tours : sans outils', { bloc: 'Réponse.' },
   () => base({ contents: suivi('Et ce mois-ci ?').concat(...[0, 1, 2].map(tour)) })],
  ['v1, briefing et mémoire', { bloc: REPONSE }, () => base({ ton: 'intensif', profilTexte: 'Dino, 31 ans, objectif : semi',
    memoireTexte: '· déteste le poisson\n· prépare un semi en mars', contents: suivi('Que manger ce soir ?') })],
  ['v2, porte ouverte, instantané, JSON', { bloc: REPONSE }, () => V2({ contents: Q('Je peux charger aujourd\'hui ?') })],
  ['v2, porte ouverte, instantané, flux', { morceaux: [morceauTexte(REPONSE.slice(0, 40)), morceauTexte(REPONSE.slice(40))] },
   () => V2({ flux: true, contents: Q('Je peux charger aujourd\'hui ?') })],
  ['v2, outil getDay demandé (JSON)', { blocParts: [{ functionCall: { name: 'getDay', args: { jour: -1 } }, thoughtSignature: 'sig-d' }] },
   () => V2({ contents: Q('Et hier ?') })],
  ['v2, sans instantané : préchargement getDay', {}, () => V2({ instantane: undefined, contents: Q('Et aujourd\'hui ?') })],
  ['v2, deuxième aller après getDay', { bloc: REPONSE }, () => V2({ contents: [
    { role: 'user', parts: [{ text: 'Et le 10 ?' }] },
    { role: 'model', parts: [{ functionCall: { name: 'getDay', args: { jour: -6 } }, thoughtSignature: 'sig-d' }] },
    { role: 'user', parts: [{ functionResponse: { name: 'getDay', response: { q: 'good', jour: '2026-9-10', recup: { score: 61 } } } }] }] })]
];

(async () => {
  console.log('\n═══ LE CHEMIN GEMINI, À L\'OCTET, CONTRE L\'OR D\'AVANT LE COACH V3 ═══');
  const resultats = {};
  for (const [nom, gem, corps] of SCENARIOS) {
    const v2 = nom.startsWith('v2');
    if (v2) { process.env.COACH_V2 = '1'; process.env.COACH_V2_APPAREILS = 'or-v2'; }
    const recus = fauxGemini(gem);
    const r = await jouer(corps(), v2 ? { 'x-flint-device': 'or-v2' } : null);
    if (v2) { delete process.env.COACH_V2; delete process.env.COACH_V2_APPAREILS; }
    // Les corps envoyés à Google pèsent ~20 Ko chacun (le prompt) : leur
    // empreinte suffit à prouver l'octet ; l'URL et la taille aident à lire
    // une divergence. Ce que l'app reçoit reste en clair.
    resultats[nom] = normaliser({ google: recus.map((x) => ({ url: x.url, octets: JSON.stringify(x.corps).length,
                                                             sha256: empreinte(x.corps) })), app: r });
  }
  global.fetch = vraiFetch;

  if (ECRIRE) {
    fs.writeFileSync(OR, JSON.stringify(resultats, null, 1) + '\n');
    console.log('  ✍️  or réécrit : ' + Object.keys(resultats).length + ' scénarios → ' + path.relative(process.cwd(), OR));
    return;
  }
  const or = JSON.parse(fs.readFileSync(OR, 'utf8'));
  v('l\'or porte les ' + SCENARIOS.length + ' scénarios', Object.keys(or).length === SCENARIOS.length, Object.keys(or).length + '');
  for (const [nom] of SCENARIOS) {
    const a = JSON.stringify(or[nom]);
    const b = JSON.stringify(resultats[nom]);
    let detail = '';
    if (a !== b) {
      let i = 0; while (i < a.length && a[i] === b[i]) i++;
      detail = 'diverge à ' + i + ' : or « ' + (a || '').slice(Math.max(0, i - 60), i + 60) + ' » / présent « ' + (b || '').slice(Math.max(0, i - 60), i + 60) + ' »';
    }
    v(nom + ' : identique (Google ET app)', a === b, detail);
  }
  console.log(`\n${vert} réussis, ${rouge} échoués`);
  if (rouge) process.exit(1);
})();
