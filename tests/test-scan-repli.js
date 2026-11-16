// ═══════════════════════════════════════════════════════════════════════════
//  LE REPLI DU SCAN : CRÉDIT CLAUDE ÉPUISÉ → GEMINI — 17 NOV. 2026
//
//  `node tests/test-scan-repli.js`
//
//  Avec SCAN_FOURNISSEUR=anthropic, quand TOUTES les clés Claude disent « plus
//  de crédit », le scan repart par le chemin Gemini (si GEMINI_API_KEY est
//  posée) : même réponse pour l'app, une ligne au journal, l'en-tête
//  X-Flint-Fournisseur: gemini-repli. Rien d'autre ne déclenche le repli.
//  Faux fetch, aucune clé, aucun réseau.
//
//   ① les deux crédits vides : Gemini sert, et sa requête comme sa réponse
//     sont À L'OCTET celles du chemin Gemini sans bascule (repas, texte,
//     étiquette, carte) ;
//   ② une seule clé vide : la seconde sert, Gemini n'est pas appelé ;
//   ③ 529, 400 ordinaire, 401, délai, réponse illisible, refus : 502, Gemini
//     jamais appelé ; sans GEMINI_API_KEY : 502 ;
//   ④ le journal et la réponse ne portent aucune clé ;
//   ⑤ Claude sert : en-tête « anthropic », corps inchangé ;
//   ⑥ le Coach ne se replie PAS (choix du 17 nov.).
// ═══════════════════════════════════════════════════════════════════════════

const path = require('path');
let vert = 0, rouge = 0;
function v(titre, ok, detail) {
  if (ok) { vert++; console.log('  ✅ ' + titre); }
  else { rouge++; console.log('  ❌ ' + titre + (detail ? '   ' + detail : '')); }
}

const CLE1 = 'sk-ant-repli-dino-1111', CLE2 = 'sk-ant-repli-felix-2222', CLE_G = 'cle-gemini-repli-3333';
process.env.FLINT_APP_SECRET = 'secret-banc';
for (const k of ['UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN', 'SCAN_MODELE', 'SCAN_EFFORT', 'SCAN_CLAUDE_SECOURS',
                 'COACH_SIG_SECRET', 'COACH_EXIGE_SIGNATURE', 'COACH_MODELE']) delete process.env[k];
const scan = require(path.join(__dirname, '..', 'api', 'scan-meal.js'));
const coach = require(path.join(__dirname, '..', 'api', 'coach.js'));
const CL = require(path.join(__dirname, '..', 'api', '_coach-claude.js'));
const fs = require('fs');

function claude(n) {
  process.env.SCAN_FOURNISSEUR = 'anthropic';
  process.env.ANTHROPIC_API_KEY = CLE1;
  if (n === 2) process.env.ANTHROPIC_API_KEY_2 = CLE2; else delete process.env.ANTHROPIC_API_KEY_2;
  process.env.GEMINI_API_KEY = CLE_G;
  CL._oublierClesEpuisees();
}
function gemini() { delete process.env.SCAN_FOURNISSEUR; process.env.GEMINI_API_KEY = CLE_G; CL._oublierClesEpuisees(); }

const VIDE = 'Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits.';
const REPAS = { mealName: 'Bowl', healthScore: 8, healthNote: 'Bien.',
  items: [{ name: 'Riz', grams: 150, kcal: 195, prot: 4, carb: 43, fat: 0.5, confidence: 0.8 },
          { name: 'Poulet', grams: 120, kcal: 198, prot: 37, carb: 0, fat: 4.3, confidence: 0.8 }] };
const ETIQUETTE = { lisible: true, name: 'Muesli', brand: null, servingG: 40,
  per100: { kcal: 372, prot: 9.8, carb: 64, sugars: 21, fat: 6.2, satfat: 1.1, fiber: 8.5, salt: 0.12, caffeine: null } };
const CARTE = { kind: 'carte', items: [], menu: { name: 'Le Petit Essai', dishes: [
  { name: 'Salade', section: 'entree', kcal: 400, kcalMin: 300, kcalMax: 500, prot: 15, carb: 30, fat: 24, confidence: 0.7 },
  { name: 'Entrecôte', section: 'plat', kcal: 1100, kcalMin: 900, kcalMax: 1300, prot: 60, carb: 70, fat: 62, confidence: 0.7 }] } };
const JPEG = 'data:image/jpeg;base64,' + fs.readFileSync(path.join(__dirname, '..', 'outils', 'essai', 'repas.jpg')).toString('base64');

/** Le faux réseau : Claude selon `claudeRep` (une entrée par appel), Gemini rend `objet`. */
let appels;
function reseau(claudeRep, objetGemini) {
  appels = { claude: [], gemini: [] };
  let k = 0;
  global.fetch = async (url, init) => {
    const u = String(url);
    if (/api\.anthropic\.com/.test(u)) {
      appels.claude.push({ cle: init.headers['x-api-key'] });
      const r = claudeRep[Math.min(k++, claudeRep.length - 1)];
      if (r.pend) return new Promise((_, rej) => init.signal.addEventListener('abort', () => { const e = new Error('a'); e.name = 'AbortError'; rej(e); }));
      if (r.statut) return { ok: false, status: r.statut, text: async () => JSON.stringify({ type: 'error', error: { type: r.type || 'invalid_request_error', message: r.erreur } }) };
      if (r.brut !== undefined) return { ok: true, status: 200, text: async () => r.brut };
      return { ok: true, status: 200, text: async () => JSON.stringify({ id: 'm', type: 'message', role: 'assistant', model: 'claude-sonnet-5-5',
        content: [{ type: 'text', text: JSON.stringify(r.objet) }], stop_reason: r.stop || 'end_turn', stop_details: null,
        usage: { input_tokens: 10, output_tokens: 10 } }) };
    }
    if (/generativelanguage\.googleapis\.com/.test(u)) {
      appels.gemini.push({ url: u.replace(CLE_G, '[clé]'), corps: init.body });
      return { ok: true, status: 200, text: async () => JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(objetGemini) }] } }] }) };
    }
    throw new Error('banc : requête inattendue ' + u);
  };
}
function fauxRes() {
  const r = { code: null, corps: null, entetes: {} };
  r.setHeader = (k, x) => { r.entetes[k.toLowerCase()] = x; };
  r.getHeader = (k) => r.entetes[k.toLowerCase()];
  r.status = (c) => { r.code = c; return r; };
  r.json = (o) => { r.corps = o; return r; };
  r.end = () => r;
  return r;
}
let n = 0;
async function jouer(handler, corps) {
  const journal = [];
  const log = console.log; console.log = (...a) => journal.push(a.join(' '));
  const res = fauxRes();
  try { await handler({ method: 'POST', headers: { 'x-flint-key': 'secret-banc', 'x-flint-device': 'REPLI-' + (++n), 'x-forwarded-for': '198.51.100.' + (n % 250) }, body: corps }, res); }
  finally { console.log = log; }
  return { res, journal };
}
const secret = (x) => [CLE1, CLE2, CLE_G].some((c) => JSON.stringify(x).includes(c));

(async () => {
  console.log('\n═══ ① LES DEUX CRÉDITS VIDES : GEMINI SERT, À L\'OCTET ═══');
  const cas = [['photo de repas', { image: JPEG, carte: 'auto' }, Object.assign({ kind: 'repas' }, REPAS)],
               ['description texte', { text: 'riz et poulet' }, REPAS],
               ['étiquette', { mode: 'label', image: JPEG }, ETIQUETTE],
               ['carte', { image: JPEG, mode: 'carte' }, CARTE]];
  for (const [nom, corps, objet] of cas) {
    gemini();
    reseau([], objet);
    const t = await jouer(scan, corps);
    const temoinReq = appels.gemini.map((a) => a.url + '\n' + a.corps);
    claude(2);
    reseau([{ statut: 400, erreur: VIDE }], objet);
    const r = await jouer(scan, corps);
    v(`${nom} : clé 1 puis clé 2 vides, puis UN appel à Gemini`, appels.claude.length === 2 && appels.claude[0].cle === CLE1
      && appels.claude[1].cle === CLE2 && appels.gemini.length === 1, JSON.stringify({ c: appels.claude.length, g: appels.gemini.length }));
    v(`  … la requête à Gemini est celle du chemin Gemini, à l'octet`, JSON.stringify(appels.gemini.map((a) => a.url + '\n' + a.corps)) === JSON.stringify(temoinReq));
    v(`  … la réponse à l'app aussi (statut et corps)`, r.res.code === 200 && t.res.code === 200 && JSON.stringify(r.res.corps) === JSON.stringify(t.res.corps),
      JSON.stringify(r.res.corps).slice(0, 100));
    v(`  … en-tête X-Flint-Fournisseur: gemini-repli (le chemin Gemini seul n'en pose aucun)`, r.res.entetes['x-flint-fournisseur'] === 'gemini-repli'
      && t.res.entetes['x-flint-fournisseur'] === undefined);
    v(`  … une ligne au journal : « crédit Claude épuisé, servi par Gemini »`, r.journal.filter((l) => /\[scan\] crédit Claude épuisé, servi par Gemini/.test(l)).length === 1, r.journal.join(' | '));
    v(`  … aucune clé dans la réponse ni au journal`, !secret(r.res) && !secret(r.journal));
  }
  // Une seule clé Claude, vide : même repli.
  claude(1);
  reseau([{ statut: 400, erreur: VIDE }], REPAS);
  let r = await jouer(scan, { text: 'riz' });
  v('une seule clé posée, vide : Gemini sert aussi', appels.claude.length === 1 && appels.gemini.length === 1 && r.res.code === 200);

  console.log('\n═══ ② UNE SEULE CLÉ VIDE SUR DEUX : LA SECONDE SERT ═══');
  claude(2);
  reseau([{ statut: 400, erreur: VIDE }, { objet: REPAS }], REPAS);
  r = await jouer(scan, { text: 'riz et poulet' });
  v('la clé de Félix sert, Gemini n\'est pas appelé', r.res.code === 200 && appels.claude.length === 2 && appels.gemini.length === 0
    && r.res.entetes['x-flint-fournisseur'] === 'anthropic');
  v('  … aucune ligne de repli au journal', !r.journal.some((l) => /servi par Gemini/.test(l)));

  console.log('\n═══ ③ RIEN D\'AUTRE NE DÉCLENCHE LE REPLI ═══');
  const pannes = [
    ['529 surchargé (deux essais)', [{ statut: 529, type: 'overloaded_error', erreur: 'Overloaded' }]],
    ['400 ordinaire', [{ statut: 400, erreur: 'max_tokens: too large' }]],
    ['401 clé fausse', [{ statut: 401, type: 'authentication_error', erreur: 'invalid x-api-key' }]],
    ['429 limite de débit', [{ statut: 429, type: 'rate_limit_error', erreur: 'rate limit' }]],
    ['réponse illisible', [{ brut: '{pas du json' }]],
    ['refus du modèle', [{ objet: {}, stop: 'refusal' }]],
    ['coupée (max_tokens)', [{ objet: REPAS, stop: 'max_tokens' }]]
  ];
  for (const [nom, rep] of pannes) {
    claude(2);
    reseau(rep, REPAS);
    r = await jouer(scan, { text: 'riz' });
    v(`${nom} : 502, Gemini jamais appelé`, r.res.code === 502 && appels.gemini.length === 0 && r.res.corps.fournisseur === 'anthropic',
      r.res.code + ' · gemini ' + appels.gemini.length);
  }
  claude(2);
  delete process.env.GEMINI_API_KEY;
  reseau([{ statut: 400, erreur: VIDE }], REPAS);
  r = await jouer(scan, { text: 'riz' });
  v('deux crédits vides SANS GEMINI_API_KEY : 502, la phrase d\'avant', r.res.code === 502 && appels.gemini.length === 0
    && r.res.corps.error.startsWith("L'analyse est en panne"));

  console.log('\n═══ ④ ⑤ CLAUDE SERT : EN-TÊTE « anthropic », CORPS INCHANGÉ ═══');
  claude(2);
  reseau([{ objet: REPAS }], REPAS);
  r = await jouer(scan, { text: 'riz et poulet' });
  v('Claude sert : X-Flint-Fournisseur: anthropic, aucun champ ajouté au corps', r.res.code === 200 && r.res.entetes['x-flint-fournisseur'] === 'anthropic'
    && JSON.stringify(Object.keys(r.res.corps)) === JSON.stringify(['mealName', 'items', 'total', 'healthScore', 'healthNote']));

  console.log('\n═══ ⑥ LE COACH NE SE REPLIE PAS ═══');
  process.env.COACH_FOURNISSEUR = 'anthropic';
  claude(2);
  reseau([{ statut: 400, erreur: VIDE }], REPAS);
  r = await jouer(coach, { langue: 'fr', contents: [{ role: 'user', parts: [{ text: 'Comment dormir ?' }] }] });
  v('Coach, deux crédits vides : 502, Gemini jamais appelé', r.res.code === 502 && appels.gemini.length === 0 && appels.claude.length === 2,
    r.res.code + ' · gemini ' + appels.gemini.length);
  delete process.env.COACH_FOURNISSEUR;

  console.log(`\n${vert} réussis, ${rouge} échoués`);
  if (rouge) process.exit(1);
})().catch((e) => { console.error(e); process.exit(1); });
