// ═══════════════════════════════════════════════════════════════════════════
//  LE BATTEMENT DU FLUX DU COACH — 17 NOV. 2026
//
//  `node tests/test-coach-battement.js`
//
//  Pendant que Claude réfléchit, le flux n'envoyait rien ; l'app abandonne
//  après 45 s sans un octet. Le serveur envoie maintenant une ligne de
//  commentaire SSE (« : attente ») toutes les 15 s. Ce banc joue le VRAI
//  api/coach.js devant un faux Claude qui se tait (période ramenée à 40 ms) :
//
//   ① des battements pendant le silence, AUCUN après le premier texte ;
//   ② la réponse lue par la règle de l'app (`hasPrefix("data:")`) est la même
//      avec ou sans battement : le texte, les étapes, la « fin » ;
//   ③ arrêt à la fin (tour d'outils, réponse, panne) : rien n'est écrit après
//      `end`, aucun minuteur ne reste ;
//   ④ le plafond : jamais de battement au-delà de `plafondMs` ;
//   ⑤ le chemin Gemini n'en envoie jamais (il reste à l'octet).
// ═══════════════════════════════════════════════════════════════════════════

const path = require('path');
let vert = 0, rouge = 0;
function v(titre, ok, detail) {
  if (ok) { vert++; console.log('  ✅ ' + titre); }
  else { rouge++; console.log('  ❌ ' + titre + (detail ? '   ' + detail : '')); }
}

process.env.FLINT_APP_SECRET = 'secret-banc';
process.env.GEMINI_API_KEY = 'cle-gemini-banc';
for (const k of ['COACH_SIG_SECRET', 'COACH_EXIGE_SIGNATURE', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN', 'ANTHROPIC_API_KEY_2', 'COACH_MODELE']) delete process.env[k];
const claudeAllume = () => { process.env.COACH_FOURNISSEUR = 'anthropic'; process.env.ANTHROPIC_API_KEY = 'sk-ant-banc'; };
const claudeEteint = () => { delete process.env.COACH_FOURNISSEUR; };

const coach = require(path.join(__dirname, '..', 'api', 'coach.js'));
const { BATTEMENT } = require(path.join(__dirname, '..', 'api', '_coach-tour-claude.js'));
const PERIODE_PROD = BATTEMENT.periodeMs, PLAFOND_PROD = BATTEMENT.plafondMs;
BATTEMENT.periodeMs = 40;
BATTEMENT.plafondMs = 60000;

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const enc = new TextEncoder();

/** Un flux qui rend `morceaux` ; `pauses[i]` ms de silence AVANT le morceau i. */
function flux(morceaux, pauses) {
  let i = 0;
  return new Response(new ReadableStream({
    async pull(c) {
      if (pauses && pauses[i]) await dormir(pauses[i]);
      if (i < morceaux.length) c.enqueue(enc.encode(morceaux[i++])); else c.close();
    }
  }), { status: 200, headers: { 'content-type': 'text/event-stream' } });
}
const ev = (o) => 'event: ' + o.type + '\ndata: ' + JSON.stringify(o) + '\n\n';
const debut = ev({ type: 'message_start', message: { id: 'm', type: 'message', role: 'assistant', model: 'claude-opus-5-5', content: [], stop_reason: null,
  usage: { input_tokens: 10, output_tokens: 1 } } });
const pensee = [ev({ type: 'content_block_start', index: 0, content_block: { type: 'thinking', thinking: '' } }),
                ev({ type: 'content_block_delta', index: 0, delta: { type: 'signature_delta', signature: 'sig' } }),
                ev({ type: 'content_block_stop', index: 0 })];
const texte = (t) => [ev({ type: 'content_block_start', index: 1, content_block: { type: 'text', text: '' } }),
                      ev({ type: 'content_block_delta', index: 1, delta: { type: 'text_delta', text: t } }),
                      ev({ type: 'content_block_stop', index: 1 })];
const outil = [ev({ type: 'content_block_start', index: 1, content_block: { type: 'tool_use', id: 'toolu_1', name: 'getRecoveryContext', input: {} } }),
               ev({ type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: '{}' } }),
               ev({ type: 'content_block_stop', index: 1 })];
const fin = (raison) => [ev({ type: 'message_delta', delta: { stop_reason: raison, stop_sequence: null }, usage: { output_tokens: 20 } }), ev({ type: 'message_stop' })];
const REPONSE = '**Couche-toi tôt.**\nDors avant 23 h ce soir.\nSuites : Et demain ? | Combien d\'heures ?';

let silence = 0;
function fauxClaude(morceaux) {
  global.fetch = async (url) => {
    if (!/anthropic/.test(String(url))) throw new Error('banc : ' + url);
    const pauses = morceaux.map(() => 0); pauses[1] = silence;   // le silence : après message_start
    return flux(morceaux, pauses);
  };
}
function fauxGemini(texteRendu) {
  global.fetch = async (url) => {
    if (!/googleapis/.test(String(url))) throw new Error('banc : ' + url);
    const corps = JSON.stringify({ candidates: [{ content: { parts: [{ text: texteRendu }] } }] });
    if (/streamGenerateContent/.test(String(url))) return flux(['data: ' + corps + '\r\n\r\n'], [silence]);
    return new Response(corps, { status: 200 });
  };
}

/** Une fausse réponse HTTP qui date chaque écriture. */
function fauxRes() {
  const r = { code: null, entetes: {}, ecrits: [], headersSent: false, writableEnded: false, destroyed: false, t0: Date.now(), apresFin: 0 };
  r.setHeader = (k, x) => { r.entetes[k.toLowerCase()] = x; };
  r.getHeader = (k) => r.entetes[k.toLowerCase()];
  r.writeHead = (c, h) => { r.code = c; for (const k of Object.keys(h || {})) r.entetes[k.toLowerCase()] = h[k]; r.headersSent = true; return r; };
  r.status = (c) => { r.code = c; return r; };
  r.json = (o) => { r.corps = o; r.writableEnded = true; return r; };
  r.write = (x) => { if (r.writableEnded) r.apresFin++; r.ecrits.push({ t: Date.now() - r.t0, x: String(x) }); return true; };
  r.end = () => { r.writableEnded = true; return r; };
  return r;
}
async function jouer(corps) {
  const res = fauxRes();
  const log = console.log; console.log = () => {};
  try { await coach({ method: 'POST', headers: { 'x-flint-key': 'secret-banc', 'x-flint-device': 'BANC-BATTEMENT', 'x-forwarded-for': '203.0.113.' + (1 + Math.floor(Math.random() * 200)) },
                      body: Object.assign({ langue: 'fr', flux: true }, corps) }, res); }
  finally { console.log = log; }
  return res;
}
const Q = (t) => [{ role: 'user', parts: [{ text: t }] }];
const battements = (res) => res.ecrits.filter((e) => e.x === ': attente\n\n');
/** La règle de l'app (CoachReseau.lireLeFlux) : seules les lignes `data:` comptent. */
function lectureApp(res) {
  const lignes = res.ecrits.map((e) => e.x).join('').split('\n');
  const evs = [];
  for (const l of lignes) {
    if (!l.startsWith('data:')) continue;
    const charge = l.slice(5).trim();
    if (!charge) continue;
    try { evs.push(JSON.parse(charge)); } catch (e) { /* l'app : continue */ }
  }
  return evs;
}

(async () => {
  console.log('\n═══ ① DES BATTEMENTS PENDANT LE SILENCE, AUCUN APRÈS LE TEXTE ═══');
  claudeAllume();
  silence = 300;
  fauxClaude([debut, ...pensee, ...texte(REPONSE), ...fin('end_turn')]);
  const r1 = await jouer({ contents: Q('Comment mieux dormir ?') });
  const b1 = battements(r1);
  const premierTexte = r1.ecrits.findIndex((e) => e.x.startsWith('data: {"d"'));
  v('un flux SSE ouvert', r1.code === 200 && /event-stream/.test(r1.entetes['content-type'] || ''));
  v('des battements pendant 300 ms de silence (période 40 ms) : au moins 4', b1.length >= 4, b1.length + ' battements');
  v('  … tous AVANT le premier texte', premierTexte > 0 && r1.ecrits.slice(premierTexte).every((e) => e.x !== ': attente\n\n'),
    'premier texte à l\'écriture ' + premierTexte);
  v('  … le silence le plus long vu par l\'app tombe sous 3 périodes', (() => {
    let max = 0, prec = 0; for (const e of r1.ecrits) { max = Math.max(max, e.t - prec); prec = e.t; } return max < 120;
  })());
  v('  … c\'est un commentaire SSE, jamais un « data: »', b1.every((e) => e.x.startsWith(': ') && !/data:/.test(e.x)));
  // Un silence APRÈS le premier texte (Claude qui hésite au milieu) : le
  // texte a déjà tenu la ligne ouverte, le battement ne revient pas.
  const deuxTemps = [debut, ...pensee,
    ev({ type: 'content_block_start', index: 1, content_block: { type: 'text', text: '' } }),
    ev({ type: 'content_block_delta', index: 1, delta: { type: 'text_delta', text: '**Couche-toi tôt.**\n' } }),
    ev({ type: 'content_block_delta', index: 1, delta: { type: 'text_delta', text: 'Dors avant 23 h ce soir.\nSuites : Et demain ? | Combien ?' } }),
    ev({ type: 'content_block_stop', index: 1 }), ...fin('end_turn')];
  global.fetch = async () => { const p = deuxTemps.map(() => 0); p[6] = 250; return flux(deuxTemps, p); };
  const r2 = await jouer({ contents: Q('Comment mieux dormir ?') });
  const i2 = r2.ecrits.findIndex((e) => e.x.startsWith('data: {"d"'));
  v('un silence APRÈS le premier texte : aucun battement (il s\'arrête au premier texte)',
    i2 > 0 && r2.ecrits.slice(i2).every((e) => e.x !== ': attente\n\n'), battements(r2).map((e) => e.t).join(','));

  console.log('\n═══ ② L\'APP LIT LA MÊME RÉPONSE, AVEC OU SANS BATTEMENT ═══');
  silence = 0;
  fauxClaude([debut, ...pensee, ...texte(REPONSE), ...fin('end_turn')]);
  const r0 = await jouer({ contents: Q('Comment mieux dormir ?') });
  v('sans silence : aucun battement', battements(r0).length === 0);
  const a1 = lectureApp(r1), a0 = lectureApp(r0);
  const sansV = (evs) => JSON.stringify(evs.map((e) => (e.fin ? { fin: Object.assign({}, e.fin, { memo: null }) } : e)));
  v('les événements lus par la règle de l\'app sont identiques', sansV(a1) === sansV(a0), sansV(a1).slice(0, 120) + ' ≠ ' + sansV(a0).slice(0, 120));
  v('  … et finissent par une « fin » qui porte le texte', !!(a1.length && a1[a1.length - 1].fin && /Couche-toi/.test(a1[a1.length - 1].fin.texte)));

  console.log('\n═══ ③ ARRÊT À LA FIN, QUELLE QU\'ELLE SOIT ═══');
  silence = 200;
  fauxClaude([debut, ...pensee, ...outil, ...fin('tool_use')]);
  const r3 = await jouer({ contents: Q('Et ma récup ?'), capacites: { etapes: 1 } });
  await dormir(150);
  const fin3 = lectureApp(r3).find((e) => e.fin);
  v('tour d\'outils sans texte : des battements, puis la « fin » outils', battements(r3).length >= 2 && fin3 && fin3.fin.mode === 'outils', battements(r3).length + ' battements');
  v('  … rien n\'est écrit après la fin (150 ms d\'attente)', r3.apresFin === 0 && r3.writableEnded, r3.apresFin + ' écriture(s) après end');
  // Une panne au milieu du flux : l'erreur part, le battement s'arrête.
  global.fetch = async () => {
    let i = 0;
    return new Response(new ReadableStream({ async pull(c) {
      if (i++ === 0) return c.enqueue(enc.encode(debut));
      await dormir(150); c.error(new Error('coupure réseau'));
    } }), { status: 200 });
  };
  const r4 = await jouer({ contents: Q('Et ma récup ?') });
  await dormir(150);
  v('flux rompu : l\'erreur part, puis plus rien', lectureApp(r4).some((e) => e.erreur) && r4.apresFin === 0, r4.apresFin + ' après end');

  console.log('\n═══ ④ LE PLAFOND ═══');
  BATTEMENT.plafondMs = 100;
  silence = 400;
  fauxClaude([debut, ...pensee, ...texte(REPONSE), ...fin('end_turn')]);
  const r5 = await jouer({ contents: Q('Comment mieux dormir ?') });
  const tard = battements(r5).filter((e) => e.t > 100 + 45);
  v('aucun battement après le plafond (100 ms ici, 80 s en production)', tard.length === 0 && battements(r5).length >= 1, tard.map((e) => e.t).join(','));
  v('en production : toutes les 15 s, plafond 80 s, sous les 90 s de maxDuration et les 45 s de l\'app',
    PERIODE_PROD === 15000 && PLAFOND_PROD === 80000
    && require(path.join(__dirname, '..', 'vercel.json')).functions['api/coach.js'].maxDuration > PLAFOND_PROD / 1000
    && PERIODE_PROD < 45000);
  BATTEMENT.plafondMs = 60000;

  console.log('\n═══ ⑤ LE CHEMIN GEMINI N\'EN ENVOIE JAMAIS ═══');
  claudeEteint();
  silence = 300;
  // Le premier tour Gemini est un pré-chargement (JSON, sans modèle) : on joue
  // directement le tour d'après, avec les réponses d'outils.
  const appels = [{ functionCall: { name: 'getRecoveryContext', args: {} } }];
  const contents = Q('Comment mieux dormir ?').concat([{ role: 'model', parts: [{ text: '⁣precharge' }].concat(appels) },
    { role: 'function', parts: [{ functionResponse: { name: 'getRecoveryContext', response: { q: 'moteur_indisponible' } } }] }]);
  fauxGemini(REPONSE);
  const r6 = await jouer({ contents });
  v('Gemini en flux : une réponse lue par l\'app', /event-stream/.test(r6.entetes['content-type'] || '') && lectureApp(r6).some((e) => e.fin), r6.code + ' ' + JSON.stringify(r6.corps || '').slice(0, 100));
  v('  … et aucun battement malgré 300 ms de silence', battements(r6).length === 0, battements(r6).length + ' battements');

  console.log(`\n${vert} réussis, ${rouge} échoués`);
  if (rouge) process.exit(1);
})().catch((e) => { console.error(e); process.exit(1); });
