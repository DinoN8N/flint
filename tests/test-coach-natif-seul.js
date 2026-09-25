// 25 sept. 2026 — la part native passe en v2 même quand l'instantané manque
// (revue de l'app, constat 10). Le vrai handler, un faux Gemini qui capture.
const path = require('path');
let vert = 0, rouge = 0;
const v = (t, ok, d) => { if (ok) { vert++; console.log('  ✅ ' + t); } else { rouge++; console.log('  ❌ ' + t + (d ? '   ' + d : '')); } };
process.env.FLINT_APP_SECRET = 'secret-de-banc'; process.env.GEMINI_API_KEY = 'cle-de-banc';
process.env.COACH_V2 = '1'; process.env.COACH_V2_APPAREILS = 'banc-natif';
delete process.env.COACH_EXIGE_SIGNATURE; delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.COACH_FACTURATION; delete process.env.COACH_PRECHARGE;
let capture = null;
global.fetch = async (url, o) => { capture = JSON.parse(o.body); return { ok: true, status: 200,
  text: async () => JSON.stringify({ candidates: [{ content: { role: 'model', parts: [{ text: '**Ok.**\nSuites : a ? | b ?' }] } }] }) }; };
const handler = require(path.join(__dirname, '..', 'api', 'coach.js'));
const res = () => { const r = { code: null, corps: null }; r.setHeader = () => {}; r.status = (c) => { r.code = c; return r; }; r.json = (x) => { r.corps = x; return r; }; r.end = () => r; r.writeHead = () => r; r.write = () => true; return r; };
(async () => {
  // Le DEUXIÈME aller d'une question neuve : la question, le tour de pré-charge
  // fabriqué par le serveur, les réponses du téléphone — c'est lui qui part chez Gemini.
  const { prechargement } = require(path.join(__dirname, '..', 'api', '_coach-histoire.js'));
  const p = prechargement({ version: 'v2' });
  const contents = [{ role: 'user', parts: [{ text: 'Je peux courir fort ce soir ?' }] }, p.tourModele,
    { role: 'function', parts: p.appels.map((a) => ({ functionResponse: { name: a.name, response: { jour: '2026-9-25' } } })) }];
  const body = { deviceId: 'banc-natif', langue: 'fr', ton: 'aucun', contents, flux: false,
    capacites: { instantane: 1, outils: 1, natif: 1, memo: 1 }, instantane: null,
    natif: { v: 1, reeducation: { phase: 'Phase 2', plafondZone: 2 } } };
  const r = res();
  await handler({ method: 'POST', headers: { 'x-flint-key': 'secret-de-banc', 'x-flint-device': 'banc-natif' }, body }, r);
  v('réponse 200', r.code === 200, 'code ' + r.code + ' ' + JSON.stringify(r.corps).slice(0, 200));
  const si = capture && capture.systemInstruction && capture.systemInstruction.parts.map((p) => p.text).join('\n') || '';
  v('Gemini a été appelé', !!capture);
  v('la part native est rendue malgré l\'instantané absent', /APPAREIL ET SÉCURITÉ/.test(si) && /plafondZone|Phase 2/.test(si), si.slice(-600));
  console.log(`\n${vert} réussis, ${rouge} échoués`);
  process.exit(rouge ? 1 : 0);
})();
