// ═══════════════════════════════════════════════════════════════════════════
//  LE BANC DU SECOND FOURNISSEUR : CLAUDE — 15 NOV. 2026
//
//  Il exerce le VRAI `api/coach.js` avec COACH_FOURNISSEUR=anthropic et un
//  faux Claude : un `fetch` remplacé qui RETIENT chaque requête (URL, en-têtes,
//  corps) et rend des réponses à la forme de l'API Messages — JSON, ou SSE en
//  paquets réseau qui tombent au mauvais endroit. AUCUN appel réseau : rien
//  ici n'a vu un vrai modèle. Ce que ce banc prouve, c'est la TRADUCTION
//  (tours Gemini ⇄ messages Claude, outils, résultats d'outils), le contrat
//  vers l'app, les libellés et les blocs — pas la qualité des réponses.
// ═══════════════════════════════════════════════════════════════════════════

const path = require('path');

let vert = 0, rouge = 0;
function v(titre, ok, detail) {
  if (ok) { vert++; console.log('  ✅ ' + titre); }
  else { rouge++; console.log('  ❌ ' + titre + (detail ? '   ' + detail : '')); }
}

// ── Le décor ───────────────────────────────────────────────────────────────
process.env.FLINT_APP_SECRET = 'secret-de-banc';
for (const k of ['COACH_EXIGE_SIGNATURE', 'UPSTASH_REDIS_REST_URL', 'COACH_V2', 'COACH_V2_APPAREILS', 'COACH_FACTURATION',
                 'COACH_PRECHARGE', 'COACH_COMPACTION', 'COACH_MODELE', 'COACH_EFFORT', 'COACH_CLAUDE_SECOURS',
                 'GEMINI_API_KEY', 'ANTHROPIC_API_KEY_2']) delete process.env[k];
const CLE = 'sk-ant-cle-de-banc-0000';
function claudeAllume() { process.env.COACH_FOURNISSEUR = 'anthropic'; process.env.ANTHROPIC_API_KEY = CLE; }
claudeAllume();

const vraiFetch = global.fetch;
const handler = require(path.join(__dirname, '..', 'api', 'coach.js'));
const { prefixeStatique } = require(path.join(__dirname, '..', 'api', '_coach-prompt.js'));
const CL = require(path.join(__dirname, '..', 'api', '_coach-claude.js'));
const { PROMPT_V3 } = require(path.join(__dirname, '..', 'api', '_coach-v3.js'));
const { OUTILS_V1, OUTILS_V2 } = require(path.join(__dirname, '..', 'api', '_coach-tools.js'));
const REPONSES_V1 = require(path.join(__dirname, 'fixtures', 'precharge-v1.json'));
const INSTANTANE = require(path.join(__dirname, 'fixtures', 'instantane-synthetique.json'));
const NATIF = require(path.join(__dirname, 'fixtures', 'natif-synthetique.json'));

// ── Le faux Claude ─────────────────────────────────────────────────────────

/** Un message de l'API, tel que `POST /v1/messages` le rend en JSON. */
const message = (content, stop_reason, extra) => Object.assign({ id: 'msg_banc', type: 'message', role: 'assistant',
  model: 'claude-opus-5-5', content, stop_reason: stop_reason || 'end_turn', stop_details: null,
  usage: { input_tokens: 9000, cache_read_input_tokens: 8000, cache_creation_input_tokens: 0, output_tokens: 120 } }, extra || {});
const reflexion = (sig) => ({ type: 'thinking', thinking: '', signature: sig || 'sig-reflexion-banc' });
const appel = (id, name, input) => ({ type: 'tool_use', id, name, input: input || {} });
const texte = (t) => ({ type: 'text', text: t });

/** Les événements SSE qui recomposent `msg` ; le texte découpé en morceaux de `n`. */
function evenementsDe(msg, n) {
  const evs = [{ event: 'message_start', data: { type: 'message_start', message: Object.assign({}, msg, { content: [], stop_reason: null }) } }];
  msg.content.forEach((b, index) => {
    if (b.type === 'text') {
      evs.push({ event: 'content_block_start', data: { type: 'content_block_start', index, content_block: { type: 'text', text: '' } } });
      for (let i = 0; i < b.text.length; i += n) evs.push({ event: 'content_block_delta', data: { type: 'content_block_delta', index,
        delta: { type: 'text_delta', text: b.text.slice(i, i + n) } } });
    } else if (b.type === 'tool_use') {
      evs.push({ event: 'content_block_start', data: { type: 'content_block_start', index, content_block: { type: 'tool_use', id: b.id, name: b.name, input: {} } } });
      const j = JSON.stringify(b.input);
      for (let i = 0; i < j.length; i += 4) evs.push({ event: 'content_block_delta', data: { type: 'content_block_delta', index,
        delta: { type: 'input_json_delta', partial_json: j.slice(i, i + 4) } } });
    } else if (b.type === 'thinking') {
      evs.push({ event: 'content_block_start', data: { type: 'content_block_start', index, content_block: { type: 'thinking', thinking: '' } } });
      evs.push({ event: 'content_block_delta', data: { type: 'content_block_delta', index, delta: { type: 'signature_delta', signature: b.signature } } });
    } else {
      evs.push({ event: 'content_block_start', data: { type: 'content_block_start', index, content_block: b } });
    }
    evs.push({ event: 'content_block_stop', data: { type: 'content_block_stop', index } });
    if (index === 0) evs.push({ event: 'ping', data: { type: 'ping' } });
  });
  evs.push({ event: 'message_delta', data: { type: 'message_delta', delta: { stop_reason: msg.stop_reason, stop_sequence: null,
    stop_details: msg.stop_details || null }, usage: { output_tokens: 120 } } });
  evs.push({ event: 'message_stop', data: { type: 'message_stop' } });
  return evs;
}

function corpsSSE(evs, taillePaquet) {
  const sse = evs.map((e) => 'event: ' + e.event + '\r\ndata: ' + JSON.stringify(e.data) + '\r\n\r\n').join('');
  const octets = Buffer.from(sse, 'utf8');
  let i = 0;
  return { getReader: () => ({ read: async () => {
    if (i >= octets.length) return { done: true, value: undefined };
    const bout = octets.subarray(i, i + taillePaquet); i += taillePaquet;
    return { done: false, value: new Uint8Array(bout) };
  } }) };
}

/**
 * `reponses` : une liste, une entrée par appel attendu — `{ msg }` (JSON ou
 * SSE selon `stream` dans le corps), `{ statut, erreur }`, `{ muet: true }`.
 */
function fauxClaude(reponses, { taillePaquet = 11, morceau = 3 } = {}) {
  const recus = [];
  let k = 0;
  global.fetch = async (url, init) => {
    const corps = JSON.parse(init.body);
    recus.push({ url: String(url), entetes: init.headers, corps, brut: init.body });
    const r = reponses[Math.min(k++, reponses.length - 1)];
    if (r.statut) return { ok: false, status: r.statut, body: null,
      text: async () => JSON.stringify({ type: 'error', error: { type: r.type || 'overloaded_error', message: r.erreur || 'surchargé' } }) };
    if (corps.stream) {
      const evs = r.muet ? [] : evenementsDe(r.msg, morceau);
      return { ok: true, status: 200, body: corpsSSE(evs, taillePaquet), text: async () => '' };
    }
    return { ok: true, status: 200, text: async () => JSON.stringify(r.msg) };
  };
  return recus;
}

function fauxRes() {
  const r = { code: null, corps: null, entetes: {}, morceaux: [], sse: false, headersSent: false };
  r.setHeader = (k, val) => { r.entetes[k] = val; };
  r.status = (c) => { r.code = c; return r; };
  r.json = (o) => { r.corps = o; r.headersSent = true; return r; };
  r.writeHead = (c, h) => { r.code = c; Object.assign(r.entetes, h || {}); r.sse = true; r.headersSent = true; return r; };
  r.write = (s) => { r.morceaux.push(s); return true; };
  r.end = () => r;
  return r;
}
let nAppel = 0;
async function jouer(corps, entetes) {
  nAppel++;
  const res = fauxRes();
  const lignes = [];
  const orig = console.log;
  console.log = (...a) => lignes.push(a.join(' '));
  try {
    await handler({ method: 'POST', headers: Object.assign({ 'x-flint-key': 'secret-de-banc', 'x-flint-device': 'banc-claude-' + nAppel,
      'x-forwarded-for': '192.0.2.' + (nAppel % 250) }, entetes || {}), body: corps }, res);
  } finally { console.log = orig; }
  const evs = res.sse ? res.morceaux.join('').split('\n\n').filter((b) => b.startsWith('data:')).map((b) => JSON.parse(b.slice(5).trim())) : [];
  return { res, lignes, evs };
}
const deltas = (evs) => evs.filter((e) => 'd' in e).map((e) => e.d);
const finDe = (evs) => (evs.find((e) => e.fin) || {}).fin;
const Q = (t) => [{ role: 'user', parts: [{ text: t }] }];
const base = (extra) => Object.assign({ deviceId: 'banc', langue: 'fr', ton: 'aucun', profilTexte: '', memoireTexte: '' }, extra || {});
const CAP_V2 = { instantane: 1, outils: 1, natif: 1, memo: 1 };
const sansCleNulle = (recus) => recus.every((r) => !r.brut.includes(CLE) && !r.url.includes(CLE));

(async () => {

console.log('\n═══ ① LA VARIABLE DÉCIDE, ET SEULEMENT ELLE ═══');
{
  v('sans COACH_FOURNISSEUR : null (Gemini, la production)', CL.configClaude({}) === null);
  v('COACH_FOURNISSEUR=gemini ou autre chose : null', CL.configClaude({ COACH_FOURNISSEUR: 'gemini' }) === null
    && CL.configClaude({ COACH_FOURNISSEUR: 'Anthropic' }) === null);
  const c = CL.configClaude({ COACH_FOURNISSEUR: 'anthropic', ANTHROPIC_API_KEY: 'x' });
  v('anthropic : claude-opus-5-5, effort medium POSÉ, secours serveur', c && c.modele === 'claude-opus-5-5' && c.effort === 'medium' && c.secours === true, JSON.stringify(c));
  const c2 = CL.configClaude({ COACH_FOURNISSEUR: 'anthropic', COACH_MODELE: 'claude-haiku-5-5', COACH_EFFORT: 'low' });
  v('COACH_MODELE et COACH_EFFORT lus ; un modèle sans secours serveur n\'en demande pas', c2.modele === 'claude-haiku-5-5' && c2.effort === 'low' && c2.secours === false);
  const c3 = CL.configClaude({ COACH_FOURNISSEUR: 'anthropic', COACH_MODELE: 'claude opus; rm', COACH_EFFORT: 'énorme' });
  v('un modèle ou un effort illisible retombe sur les défauts', c3.modele === 'claude-opus-5-5' && c3.effort === 'medium');
  v('COACH_CLAUDE_SECOURS=0 coupe le secours', CL.configClaude({ COACH_FOURNISSEUR: 'anthropic', COACH_CLAUDE_SECOURS: '0' }).secours === false);

  delete process.env.ANTHROPIC_API_KEY;
  const recus = fauxClaude([{ msg: message([texte('x')]) }]);
  const { res, lignes } = await jouer(base({ contents: Q('Ma VFC ?') }));
  v('clé absente : 500 « configuration serveur incomplète », aucun appel', res.code === 500 && recus.length === 0
    && res.corps.error === 'configuration serveur incomplète');
  v('  … le journal nomme ANTHROPIC_API_KEY (pas la réponse)', lignes.some((l) => l.includes('ANTHROPIC_API_KEY absente'))
    && !JSON.stringify(res.corps).includes('ANTHROPIC'));
  claudeAllume();
}

console.log('\n═══ ② UNE QUESTION NOUVELLE : PAS DE PRÉCHARGEMENT, UNE VRAIE REQUÊTE MESSAGES ═══');
{
  const recus = fauxClaude([{ msg: message([reflexion(), appel('toolu_01A', 'getNutritionToday', {})], 'tool_use') }]);
  const { res } = await jouer(base({ contents: Q('Qu\'est-ce que je mange ce soir ?') }));
  v('un seul appel, vers https://api.anthropic.com/v1/messages', recus.length === 1 && recus[0].url === 'https://api.anthropic.com/v1/messages', recus.map((r) => r.url).join(','));
  const h = recus[0].entetes, c = recus[0].corps;
  v('en-têtes : x-api-key, anthropic-version 2026-10-21, content-type', h['x-api-key'] === CLE && h['anthropic-version'] === '2026-10-21'
    && h['content-type'] === 'application/json', JSON.stringify(Object.keys(h)));
  v('  … anthropic-beta : liaison de la réflexion + secours serveur',
    h['anthropic-beta'] === 'thinking-binding-controls-2026-08-01,server-side-fallback-2026-07-01', h['anthropic-beta']);
  v('corps : modèle, max_tokens 16000, effort explicite, réflexion adaptative + drop_block',
    c.model === 'claude-opus-5-5' && c.max_tokens === 16000 && c.output_config.effort === 'medium'
    && c.thinking.type === 'adaptive' && c.thinking.block_binding.prefix_mismatch_behavior === 'drop_block', JSON.stringify(c.thinking));
  v('  … fallbacks: "default"', c.fallbacks === 'default');
  v('  … aucun paramètre refusé par Opus 5.5 (temperature, top_p, top_k, budget_tokens, tool_choice forcé)',
    !('temperature' in c) && !('top_p' in c) && !('top_k' in c) && !JSON.stringify(c).includes('budget_tokens') && !('tool_choice' in c));
  v('système en deux blocs : le préfixe v3 mis en cache, puis la queue', Array.isArray(c.system) && c.system.length === 2
    && c.system[0].text === prefixeStatique('v1', { v3: true }) && c.system[0].cache_control.type === 'ephemeral'
    && !c.system[1].cache_control && c.system[0].text.endsWith(PROMPT_V3));
  v('  … le préfixe v3 = le préfixe Gemini + le bloc v3 (rien d\'autre ne change)',
    prefixeStatique('v1', { v3: true }) === prefixeStatique('v1') + '\n\n' + PROMPT_V3);
  v('outils : les 8 V1, `input_schema` à la place de `parameters`', c.tools.length === OUTILS_V1.length
    && c.tools.every((t, i) => t.name === OUTILS_V1[i].name && t.input_schema && t.input_schema.type === 'object' && !('parameters' in t)));
  v('  … getSleepHistory garde son schéma (joursN requis)', JSON.stringify(c.tools.find((t) => t.name === 'getSleepHistory').input_schema.required) === '["joursN"]');
  v('messages : la seule question, en texte', JSON.stringify(c.messages) === JSON.stringify([{ role: 'user', content: [{ type: 'text', text: 'Qu\'est-ce que je mange ce soir ?' }] }]));
  v('la clé n\'est ni dans l\'URL ni dans le corps', sansCleNulle(recus));

  const b = res.corps;
  v('réponse : mode outils, l\'appel demandé par CLAUDE (pas un tour fabriqué)', res.code === 200 && b.mode === 'outils'
    && b.appels.length === 1 && b.appels[0].name === 'getNutritionToday' && b.appels[0].id === 'toolu_01A', JSON.stringify(b.appels));
  v('LE CAS DES FONDATEURS : le libellé dit ce qui est lu, pas « Analyse de ta récupération… »',
    b.libelles.getNutritionToday === 'Lecture de tes repas d\'aujourd\'hui…' && b.etapes[0].texte === 'Lecture de tes repas d\'aujourd\'hui…'
    && !JSON.stringify(b.etapes).includes('récupération'), JSON.stringify(b.etapes));
  v('  … la table `libelles` garde toutes les clés de l\'app', Object.keys(b.libelles).includes('getRecoveryContext') && Object.keys(b.libelles).length >= 16);
  v('  … `redaction` dit à partir de quoi il écrira', b.redaction === 'Rédaction de ta réponse à partir de tes repas d\'aujourd\'hui…', b.redaction);
  v('  … v, appelsGemini (= appels au modèle), fournisseur', b.v === handler.COACH_VERSION && b.appelsGemini === 1 && b.fournisseur === 'anthropic');
  const p0 = b.tourModele.parts[0];
  v('tourModele : un tour Gemini (role model, functionCall + id)', b.tourModele.role === 'model' && p0.functionCall.name === 'getNutritionToday'
    && p0.functionCall.id === 'toolu_01A');
  v('  … les blocs bruts de Claude voyagent dans thoughtSignature', typeof p0.thoughtSignature === 'string' && p0.thoughtSignature.startsWith(CL.PREFIXE_SIG)
    && JSON.stringify(CL.decoderContenu(p0.thoughtSignature)) === JSON.stringify([reflexion(), appel('toolu_01A', 'getNutritionToday', {})]));
}

console.log('\n═══ ③ LE DEUXIÈME ALLER : LE RÉSULTAT D\'OUTIL REVIENT EN tool_result, LA RÉFLEXION INTACTE ═══');
{
  const r1 = fauxClaude([{ msg: message([reflexion('sig-A'), appel('toolu_01A', 'getSleepHistory', { joursN: 7 })], 'tool_use') }]);
  const t1 = (await jouer(base({ contents: Q('Comment je dors en ce moment ?') }))).res.corps;
  v('premier aller : les 7 dernières nuits, dites comme telles', t1.libelles.getSleepHistory === 'Lecture de tes 7 dernières nuits…', t1.libelles.getSleepHistory);
  // L'app range tourModele tel quel, exécute, et renvoie le tout — rôle « function », comme les apps posées.
  const fil = Q('Comment je dors en ce moment ?').concat([t1.tourModele,
    { role: 'function', parts: [{ functionResponse: { name: 'getSleepHistory', response: REPONSES_V1.getSleepHistory } }] }]);
  const recus = fauxClaude([{ msg: message([reflexion('sig-B'), texte('**Tu dors 6h50 en moyenne.**\n\n## Pourquoi\n- **Couchers tardifs** : 00:40.\n\nSuites : Et ce soir ? | Mon besoin ?')]) }]);
  const { res } = await jouer(base({ contents: fil }));
  const m = recus[0].corps.messages;
  v('trois messages : question, assistant, résultats', m.length === 3 && m.map((x) => x.role).join(',') === 'user,assistant,user', JSON.stringify(m.map((x) => x.role)));
  v('l\'assistant est renvoyé À L\'IDENTIQUE (réflexion et signature comprises)',
    JSON.stringify(m[1].content) === JSON.stringify([reflexion('sig-A'), appel('toolu_01A', 'getSleepHistory', { joursN: 7 })]), JSON.stringify(m[1].content).slice(0, 200));
  const tr = m[2].content[0];
  v('le résultat : tool_result rattaché à toolu_01A, contenu JSON', m[2].content.length === 1 && tr.type === 'tool_result'
    && tr.tool_use_id === 'toolu_01A' && typeof tr.content === 'string' && JSON.parse(tr.content).qualite === 'good');
  v('  … RÉÉCRIT par l\'adaptateur du serveur, comme pour Gemini (unités h:mm)', /\d+:\d\d/.test(tr.content) && tr.content.includes('unites'), tr.content.slice(0, 160));
  v('les outils et le préfixe sont les mêmes qu\'au premier aller (cache, réflexion liée)',
    JSON.stringify(recus[0].corps.tools) === JSON.stringify(r1[0].corps.tools) && recus[0].corps.system[0].text === r1[0].corps.system[0].text);
  const b = res.corps;
  v('réponse : texte sans Suites, suites détachées, tourModele = le brut', b.mode === 'reponse' && b.texte.startsWith('**Tu dors 6h50')
    && !b.texte.includes('Suites') && b.suites.length === 2 && b.tourModele.parts[0].text.includes('Suites :'));
  v('  … `blocs` vide, pas de `retenir` en v1, memo présent', Array.isArray(b.blocs) && b.blocs.length === 0 && !('retenir' in b) && b.memo && b.memo.q);
}

console.log('\n═══ ④ L\'HISTORIQUE : CE QUI EST RENVOYÉ, CE QUI NE L\'EST PAS ═══');
{
  // Une question d'AVANT (avec ses blocs bruts), puis la question en cours.
  const ancien = CL.tourModeleOutils([reflexion('sig-vieille'), appel('toolu_V', 'getTrainingLoad', {})]);
  const fil = Q('Ma charge ?').concat([ancien,
    { role: 'function', parts: [{ functionResponse: { name: 'getTrainingLoad', response: { ratio: 1.1 } } }] },
    { role: 'model', parts: [{ text: '**Charge optimale.**' }] }]).concat(Q('Et mon sommeil ?'));
  const { messages, stats } = CL.versMessagesClaude(require(path.join(__dirname, '..', 'api', '_coach-histoire.js'))
    .preparerPourGemini(fil, {}).contents);
  const s = JSON.stringify(messages);
  v('la réflexion d\'une question PRÉCÉDENTE n\'est pas renvoyée (série de tête retirée : permis)', !s.includes('sig-vieille') && !s.includes('"thinking"'), s.slice(0, 200));
  v('  … mais son appel et sa réponse restent appariés (id d\'origine)', messages[1].content[0].type === 'tool_use' && messages[1].content[0].id === 'toolu_V'
    && messages[2].content[0].tool_use_id === 'toolu_V');
  v('  … et la réponse ancienne est un talon, comme pour Gemini', messages[2].content[0].content.includes('ancien'));
  v('stats : 0 repris, 1 reconstruit', stats.repris === 0 && stats.reconstruits === 1, JSON.stringify(stats));

  // Un fil né sous Gemini (signatures Gemini, pas d'id) qui passe à Claude.
  const gem = Q('Mes nuits ?').concat([
    { role: 'model', parts: [{ functionCall: { name: 'getSleepHistory', args: { joursN: 7 } }, thoughtSignature: 'CiQB-signature-gemini' },
                             { functionCall: { name: 'getTrainingLoad', args: {} } }] },
    { role: 'user', parts: [{ functionResponse: { name: 'getTrainingLoad', response: { ratio: 1.2 } } },
                            { functionResponse: { name: 'getSleepHistory', response: { nuits: [] } } }] }]);
  const g = CL.versMessagesClaude(gem);
  const a = g.messages[1].content, r = g.messages[2].content;
  v('fil Gemini : ids fabriqués, valides, la signature Gemini ignorée', a.length === 2 && a.every((b) => /^toolu_flint_\d+_\d+$/.test(b.id))
    && !JSON.stringify(g.messages).includes('signature-gemini'));
  v('  … chaque réponse retrouve SON appel par le nom, dans l\'ordre des appels', r[0].tool_use_id === a[0].id && JSON.parse(r[0].content).nuits
    && r[1].tool_use_id === a[1].id && JSON.parse(r[1].content).ratio === 1.2, JSON.stringify(r));

  // Les cas que l'API refuserait.
  const trou = CL.versMessagesClaude(Q('A ?').concat([
    { role: 'model', parts: [{ functionCall: { name: 'getDevice', args: {} } }, { functionCall: { name: 'getDay', args: { jour: -1 } } }] },
    { role: 'user', parts: [{ functionResponse: { name: 'getDevice', response: { ok: 1 } } }, { functionResponse: { name: 'inconnu', response: {} } },
                            { functionResponse: { name: 'encore', response: {} } }] },
    { role: 'model', parts: [{ functionCall: { name: 'getTrend', args: { cle: 'hrv', periode: 'M' } } }] }]));
  const tm = trou.messages;
  v('un appel sans réponse : tool_result en erreur, jamais un trou', tm[2].content.length === 2 && tm[2].content[1].is_error === true
    && tm[2].content.every((b) => b.type === 'tool_result'), JSON.stringify(tm[2]));
  v('  … une réponse au nom d\'aucun appel : retirée, jamais collée à un autre outil', trou.stats.orphelins === 2
    && !JSON.stringify(tm[2]).includes('"content":"{}"'), JSON.stringify(trou.stats));
  v('  … un dernier appel resté sans suite : comblé, et le fil finit par `user` (pas de prefill)',
    tm[tm.length - 1].role === 'user' && tm[tm.length - 1].content[0].is_error === true && tm[tm.length - 2].content[0].name === 'getTrend');
  v('  … les rôles alternent', tm.every((m, i) => i === 0 || m.role !== tm[i - 1].role));

  const fondu = CL.versMessagesClaude([{ role: 'model', parts: [{ text: 'bonjour' }] }, { role: 'user', parts: [{ text: 'a' }] },
    { role: 'user', parts: [{ text: 'b' }] }, { role: 'model', parts: [{ text: '' }] }]);
  v('tour modèle en tête retiré, deux `user` fondus, texte vide ignoré', fondu.messages.length === 1
    && fondu.messages[0].content.map((b) => b.text).join('|') === 'a|b', JSON.stringify(fondu.messages));

  // Blocs bruts qui ne concordent plus avec les parts : reconstruits, jamais renvoyés faux.
  const faux = CL.tourModeleOutils([reflexion(), appel('toolu_X', 'getDevice', {})]);
  faux.parts[0].functionCall.name = 'getDay';
  const fx = CL.versMessagesClaude(Q('?').concat([faux, { role: 'user', parts: [{ functionResponse: { name: 'getDay', response: {} } }] }]));
  v('blocs bruts discordants : reconstruits depuis les parts', fx.stats.repris === 0 && fx.messages[1].content.length === 1
    && fx.messages[1].content[0].name === 'getDay');
}

console.log('\n═══ ⑤ SECOURS EN COURS DE RÉPONSE : CE QUI SE RENVOIE ═══');
{
  const c = [reflexion('avant'), texte('début'), appel('toolu_P', 'getDay', {}), { type: 'fallback', from: { model: 'claude-opus-5-5' }, to: { model: 'claude-opus-5' } },
             texte('suite'), appel('toolu_Q', 'getDevice', {})];
  const e = CL.contenuAEcho(c);
  v('avant le dernier `fallback` : réflexion et appels omis, texte gardé, le bloc fallback À SA PLACE',
    JSON.stringify(e.map((b) => b.type)) === '["text","fallback","text","tool_use"]', JSON.stringify(e.map((b) => b.type)));
}

console.log('\n═══ ⑥ LES BLOCS VISUELS : VALIDÉS, LES MAUVAIS RETIRÉS ═══');
{
  const brut = '**Ta VFC remonte : 68 ms ce matin.**\n\n## Pourquoi\n- **Trois nuits longues** : 7h40 de moyenne.\n\n'
    + 'Blocs : [{"type":"serie","metrique":"vfc","jours":30,"repere":"normale"},{"type":"serie","metrique":"vfc","jours":45},{"type":"graphique","valeurs":[1,2]}]\n'
    + 'Suites : Et ma récup ? | Et cette semaine ?';
  fauxClaude([{ msg: message([texte(brut)]) }]);
  const { res, lignes } = await jouer(base({ contents: Q('Ma VFC remonte ?') }));
  const b = res.corps;
  v('le bloc au catalogue passe, à l\'identique', JSON.stringify(b.blocs) === '[{"type":"serie","metrique":"vfc","jours":30,"repere":"normale"}]', JSON.stringify(b.blocs));
  v('  … 45 jours (hors catalogue) et un type inventé : retirés', b.blocs.length === 1);
  v('la ligne « Blocs : » ne s\'affiche pas, les suites sont détachées', !b.texte.includes('Blocs') && !b.texte.includes('"type"')
    && JSON.stringify(b.suites) === JSON.stringify(['Et ma récup ?', 'Et cette semaine ?']), b.texte);
  v('journal : blocs=1 blocsRetires=2, sans contenu', lignes.some((l) => /mode=reponse /.test(l) && /blocs=1\b/.test(l) && /blocsRetires=2\b/.test(l) && !l.includes('VFC')), lignes.join(' | '));

  fauxClaude([{ msg: message([texte('Avec plaisir !\nBlocs : [{"type":"nuit","jour":0}]\nSuites : Ma nuit ? | Ma récup ?')]) }]);
  const an = (await jouer(base({ contents: Q('merci') }))).res.corps;
  v('message anodin : aucun bloc, même si le modèle en écrit un', an.blocs.length === 0 && an.texte === 'Avec plaisir !', JSON.stringify(an));

  process.env.COACH_V2 = '1'; process.env.COACH_V2_APPAREILS = 'banc-v2';
  fauxClaude([{ msg: message([texte('**Récup à 74/100 : tu peux charger.**\n\n## Pourquoi\n- **VFC haute** : 71 ms.\n\n'
    + 'Blocs : [{"type":"etapes","titre":"Pourquoi la VFC compte","etapes":[{"titre":"Le signal","texte":"Ton système nerveux se détend la nuit."},'
    + '{"titre":"La lecture","texte":"FLINT la compare à ta normale."}]}]\n'
    + 'Retenir : objectif — prépare un semi-marathon en mars\nSuites : Et demain ? | Mon sommeil ?')]) }]);
  const v2 = (await jouer(base({ capacites: CAP_V2, instantane: INSTANTANE, natif: NATIF, contents: Q('Je peux charger ?') }), { 'x-flint-device': 'banc-v2' })).res.corps;
  v('v2 : bloc d\'étapes texte seul + Retenir + Suites, chacun à sa place', v2.blocs.length === 1 && v2.blocs[0].type === 'etapes'
    && v2.retenir.length === 1 && v2.retenir[0].fait === 'prépare un semi-marathon en mars' && v2.suites.length === 2
    && !/Blocs|Retenir|Suites/.test(v2.texte), JSON.stringify(v2).slice(0, 300));
  delete process.env.COACH_V2; delete process.env.COACH_V2_APPAREILS;
}

console.log('\n═══ ⑦ EN FLUX : LE TEXTE ARRIVE, « BLOCS » ET « SUITES » JAMAIS ═══');
{
  const brut = '**Ta VFC remonte : 68 ms ce matin.**\n\n## Pourquoi\n- **Trois nuits longues** : 7h40 de moyenne.\n\n## À faire\n- Garde ton coucher à **23:00**.\n'
    + 'Blocs : [{"type":"serie","metrique":"vfc","jours":30,"repere":"normale"}]\nSuites : Et ma récup ? | Et cette semaine ?';
  const fuites = [], ecarts = [], manques = [];
  for (const morceau of [1, 2, 3, 5, 8, 13, 40]) {
    for (const paquet of [3, 17, 200]) {
      fauxClaude([{ msg: message([reflexion(), texte(brut)]) }], { taillePaquet: paquet, morceau });
      const { evs, res } = await jouer(base({ flux: true, contents: Q('Ma VFC ?') }));
      const tout = deltas(evs).join('');
      const f = finDe(evs) || {};
      if (/Blocs|Suites|"type"/.test(tout)) fuites.push(morceau + '/' + paquet);
      if (tout.trimEnd() !== f.texte) ecarts.push(morceau + '/' + paquet + ' ' + JSON.stringify(tout.slice(-20)));
      if (!(f.blocs && f.blocs.length === 1 && f.suites && f.suites.length === 2 && res.code === 200)) manques.push(morceau + '/' + paquet);
    }
  }
  v('21 découpages : ni « Blocs » ni « Suites » dans un delta', fuites.length === 0, fuites.join(', '));
  v('  … les deltas recollés valent fin.texte', ecarts.length === 0, ecarts.join(' ; '));
  v('  … fin.blocs et fin.suites à chaque fois', manques.length === 0, manques.join(', '));

  fauxClaude([{ msg: message([reflexion(), appel('toolu_S', 'getSessions', { jours: 14, sport: 'Course', detail: true })], 'tool_use') }]);
  const t = await jouer(base({ flux: true, capacites: Object.assign({ etapes: 1 }, CAP_V2), contents: Q('Mes courses progressent ?') }));
  const f = finDe(t.evs);
  v('un tour d\'outils en flux : zéro delta, un fin outils', deltas(t.evs).length === 0 && f && f.mode === 'outils', JSON.stringify(t.evs).slice(0, 200));
  v('  … arguments recomposés depuis input_json_delta', f && JSON.stringify(f.appels[0].args) === '{"jours":14,"sport":"Course","detail":true}', f && JSON.stringify(f.appels));
  v('  … capacites.etapes : un événement `etape` qui dit la vraie lecture (v1 ici : getSessions est rendu tel quel)',
    t.evs.some((e) => e.etape === 'Comparaison de tes séances de course des 14 derniers jours…'), JSON.stringify(t.evs.filter((e) => e.etape)));

  fauxClaude([{ msg: message([appel('toolu_T', 'getSleepHistory', { joursN: 3 })], 'tool_use') }]);
  const sansCap = await jouer(base({ flux: true, contents: Q('Mes nuits ?') }));
  v('sans capacites.etapes : aucune forme nouvelle dans le flux (d, fin, erreur seulement)',
    sansCap.evs.every((e) => Object.keys(e).length === 1 && ['d', 'fin', 'erreur'].includes(Object.keys(e)[0])), JSON.stringify(sansCap.evs).slice(0, 200));

  fauxClaude([{ msg: message([texte('Je regarde tes nuits.'), appel('toolu_U', 'getSleepHistory', { joursN: 7 })], 'tool_use') }], { morceau: 2 });
  const pre = await jouer(base({ flux: true, contents: Q('Mes nuits ?') }));
  v('une phrase AVANT un appel d\'outil ne part jamais à l\'écran', deltas(pre.evs).length === 0 && finDe(pre.evs).mode === 'outils', JSON.stringify(deltas(pre.evs)));
  v('  … et elle reste dans les blocs bruts rangés (le modèle la relira)',
    JSON.stringify(CL.decoderContenu(finDe(pre.evs).tourModele.parts[0].thoughtSignature)).includes('Je regarde tes nuits.'));

  const recus = fauxClaude([{ muet: true }, { msg: message([texte('Repli en bloc.\n\nSuites : A ? | B ?')]) }]);
  const m = await jouer(base({ flux: true, contents: Q('Ma VFC ?') }));
  v('un flux muet : refait en JSON avec le MÊME corps, sans `stream`', recus.length === 2 && recus[0].corps.stream === true && !('stream' in recus[1].corps)
    && JSON.stringify(Object.assign({}, recus[0].corps, { stream: undefined })) === JSON.stringify(Object.assign({}, recus[1].corps, { stream: undefined })));
  v('  … le texte est livré, appelsGemini = 2', finDe(m.evs) && finDe(m.evs).texte === 'Repli en bloc.' && finDe(m.evs).appelsGemini === 2
    && deltas(m.evs).join('') === 'Repli en bloc.');
}

console.log('\n═══ ⑧ REFUS, PANNES, QUATRIÈME TOUR ═══');
{
  fauxClaude([{ msg: message([], 'refusal', { stop_details: { type: 'refusal', category: 'bio', explanation: null } }) }]);
  const r = await jouer(base({ contents: Q('question déclinée') }));
  v('un refus : 200, une phrase, `refus: true`, le fil reste vivant', r.res.code === 200 && r.res.corps.mode === 'reponse' && r.res.corps.refus === true
    && r.res.corps.texte.startsWith('Je ne peux pas') && r.res.corps.suites.length === 0, JSON.stringify(r.res.corps));
  v('  … journal mode=refus categorie=bio', r.lignes.some((l) => /mode=refus /.test(l) && /categorie=bio/.test(l)));

  let recus = fauxClaude([{ statut: 529 }, { msg: message([texte('Ça repart.')]) }]);
  const s529 = await jouer(base({ contents: Q('Ma VFC ?') }));
  v('529 (surchargé) puis 200 : réessayé une fois, réponse servie', recus.length === 2 && s529.res.code === 200 && s529.res.corps.texte === 'Ça repart.'
    && s529.res.corps.appelsGemini === 2);

  recus = fauxClaude([{ statut: 400, type: 'invalid_request_error', erreur: 'mauvaise requête ' + CLE }]);
  const s400 = await jouer(base({ contents: Q('Ma VFC ?') }));
  v('400 : jamais réessayé, 502 avec la phrase de l\'app', recus.length === 1 && s400.res.code === 502
    && s400.res.corps.error === 'Le Coach est indisponible à l\'instant. Réessaie dans un moment.' && s400.res.corps.gemini === 400);
  v('  … `detail` porte le message de l\'API, clé masquée', s400.res.corps.detail.includes('invalid_request_error') && !s400.res.corps.detail.includes(CLE), s400.res.corps.detail);

  recus = fauxClaude([{ statut: 503 }, { statut: 503 }]);
  const flux503 = await jouer(base({ flux: true, contents: Q('Ma VFC ?') }));
  v('flux indisponible : du JSON 502, pas de SSE', flux503.res.code === 502 && flux503.res.sse === false && recus.length === 2);

  const tour = (i) => [
    { role: 'model', parts: [{ functionCall: { name: 'getSleepHistory', args: { joursN: 14 }, id: 'toolu_r' + i } }] },
    { role: 'function', parts: [{ functionResponse: { name: 'getSleepHistory', response: { nuits: [] } } }] }];
  for (const [nTours, attendu] of [[3, false], [4, true]]) {
    recus = fauxClaude([{ msg: message([texte('Réponse.')]) }]);
    await jouer(base({ contents: Q('Et ce mois-ci ?').concat(...Array.from({ length: nTours }, (_, i) => tour(i))) }));
    const c = recus[0].corps;
    v(nTours + ' tours d\'outils : ' + (attendu ? 'tool_choice none (les outils restent déclarés)' : 'outils permis'),
      (attendu ? c.tool_choice && c.tool_choice.type === 'none' : !('tool_choice' in c)) && c.tools.length === OUTILS_V1.length, JSON.stringify(c.tool_choice));
  }
}

console.log('\n═══ ⑨ V2 : LES OUTILS V2, L\'INSTANTANÉ DANS LA QUEUE, JAMAIS DANS LES MESSAGES ═══');
{
  process.env.COACH_V2 = '1'; process.env.COACH_V2_APPAREILS = 'banc-v2';
  const recus = fauxClaude([{ msg: message([appel('toolu_H', 'getHistory', { colonnes: ['vfc', 'recup', 'dormi', 'pas'], jours: 30 })], 'tool_use') }]);
  const { res } = await jouer(base({ capacites: CAP_V2, instantane: INSTANTANE, natif: NATIF, contents: Q('L\'alcool et ma récup ce mois-ci ?') }), { 'x-flint-device': 'banc-v2' });
  const c = recus[0].corps;
  v('outils V2 déclarés, getRecoveryContext absent', c.tools.length === OUTILS_V2.length && c.tools.some((t) => t.name === 'getHistory')
    && !c.tools.some((t) => t.name === 'getRecoveryContext'));
  v('préfixe v3 du mode v2 ; l\'instantané est dans la QUEUE', c.system[0].text === prefixeStatique('v2', { v3: true })
    && c.system[1].text.includes('Porridge banane') && !JSON.stringify(c.messages).includes('Porridge'));
  v('libellé : « Lecture de tes 30 derniers jours (VFC, récupération, sommeil…)… »',
    res.corps.libelles.getHistory === 'Lecture de tes 30 derniers jours (VFC, récupération, sommeil…)…', res.corps.libelles.getHistory);
  delete process.env.COACH_V2; delete process.env.COACH_V2_APPAREILS;
}

console.log('\n═══ ⑩ ET SANS LA VARIABLE, C\'EST GEMINI : LE PRÉCHARGEMENT D\'AVANT ═══');
{
  delete process.env.COACH_FOURNISSEUR; delete process.env.ANTHROPIC_API_KEY;
  process.env.GEMINI_API_KEY = 'cle-gemini-banc';
  const recus = fauxClaude([{ msg: message([texte('ne doit pas partir')]) }]);
  const { res } = await jouer(base({ contents: Q('Qu\'est-ce que je mange ce soir ?') }));
  v('Gemini : aucun appel réseau, le tour fabriqué de toujours', recus.length === 0 && res.corps.mode === 'outils' && !('fournisseur' in res.corps));
  v('  … qui commence par getRecoveryContext : la phrase qui sortait à CHAQUE question',
    res.corps.appels[0].name === 'getRecoveryContext' && res.corps.libelles[res.corps.appels[0].name] === 'Analyse de ta récupération…');
  delete process.env.GEMINI_API_KEY;
  claudeAllume();
}

console.log('\n═══ ⑪ DEUX CLÉS : LA SECONDE PREND LE RELAIS QUAND LA PREMIÈRE N\'A PLUS DE CRÉDIT ═══');
{
  const CLE2 = 'sk-ant-cle-de-banc-2222';
  const VIDE = 'Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits.';
  const cleDe = (r) => r.entetes['x-api-key'];
  const sansLesDeux = (recus) => recus.every((r) => ![CLE, CLE2].some((k) => r.brut.includes(k) || r.url.includes(k)));

  const c = CL.configClaude({ COACH_FOURNISSEUR: 'anthropic', ANTHROPIC_API_KEY: 'a', ANTHROPIC_API_KEY_2: 'b' });
  v('config : deux clés dans l\'ordre, `cle` reste la première', c.cles.join() === 'a,b' && c.cle === 'a');
  v('config : une seule clé, une seule entrée ; une seconde vide est ignorée',
    CL.configClaude({ COACH_FOURNISSEUR: 'anthropic', ANTHROPIC_API_KEY: 'a', ANTHROPIC_API_KEY_2: '' }).cles.join() === 'a');
  v('le texte « crédit épuisé » de l\'API est reconnu (400), une autre 400 non, une 429 non',
    CL.creditEpuise(400, JSON.stringify({ error: { type: 'invalid_request_error', message: VIDE } }))
    && !CL.creditEpuise(400, 'invalid_request_error: max_tokens: too large') && !CL.creditEpuise(429, VIDE));

  process.env.ANTHROPIC_API_KEY_2 = CLE2;
  CL._oublierClesEpuisees();
  let recus = fauxClaude([{ statut: 400, type: 'invalid_request_error', erreur: VIDE }, { msg: message([texte('Servi par la seconde.')]) }]);
  let r = await jouer(base({ contents: Q('Ma VFC ?') }));
  v('JSON : crédit épuisé sur la 1re → même question sur la 2de, réponse servie', recus.length === 2 && cleDe(recus[0]) === CLE
    && cleDe(recus[1]) === CLE2 && r.res.code === 200 && r.res.corps.texte === 'Servi par la seconde.', JSON.stringify(r.res.corps).slice(0, 200));
  v('  … le même corps part aux deux (rien de perdu en route)', recus[0].brut === recus[1].brut);
  v('  … le journal dit cle=2, jamais la clé', r.lignes.some((l) => /mode=reponse /.test(l) && / cle=2( |$)/.test(l))
    && !r.lignes.some((l) => l.includes(CLE) || l.includes(CLE2)), r.lignes.join(' | ').slice(0, 300));
  v('  … aucune des deux clés dans les corps ni les adresses', sansLesDeux(recus));

  recus = fauxClaude([{ msg: message([texte('Encore la seconde.')]) }]);
  r = await jouer(base({ contents: Q('Et ma récup ?') }));
  v('la question suivante va DIRECTEMENT à la 2de (la 1re est mise de côté une heure)', recus.length === 1 && cleDe(recus[0]) === CLE2 && r.res.code === 200);

  CL._oublierClesEpuisees();
  recus = fauxClaude([{ statut: 400, type: 'invalid_request_error', erreur: 'mauvaise requête' }]);
  r = await jouer(base({ contents: Q('Ma VFC ?') }));
  v('une 400 qui n\'est PAS un crédit épuisé ne change pas de clé : un seul appel, 502', recus.length === 1 && r.res.code === 502);

  recus = fauxClaude([{ statut: 400, type: 'invalid_request_error', erreur: VIDE }, { statut: 400, type: 'invalid_request_error', erreur: VIDE }]);
  r = await jouer(base({ contents: Q('Ma VFC ?') }));
  v('les deux épuisées : 502 avec la phrase de l\'app, deux appels, parcours lisible', recus.length === 2 && r.res.code === 502
    && r.res.corps.error === 'Le Coach est indisponible à l\'instant. Réessaie dans un moment.'
    && r.res.corps.parcours.filter((p) => /crédit-épuisé/.test(p)).length === 2, JSON.stringify(r.res.corps.parcours));
  recus = fauxClaude([{ msg: message([texte('La 1re est revenue.')]) }]);
  r = await jouer(base({ contents: Q('Ma VFC ?') }));
  v('les deux mises de côté : on réessaie quand même la 1re d\'abord (une recharge se voit)', recus.length === 1 && cleDe(recus[0]) === CLE && r.res.code === 200);

  CL._oublierClesEpuisees();
  recus = fauxClaude([{ statut: 400, type: 'invalid_request_error', erreur: VIDE }, { msg: message([reflexion(), texte('En flux, par la seconde.')]) }]);
  r = await jouer(base({ flux: true, contents: Q('Ma VFC ?') }));
  const f = finDe(r.evs) || {};
  v('FLUX : le relais se fait AVANT le premier octet, le texte arrive en entier', recus.length === 2 && cleDe(recus[1]) === CLE2
    && r.res.sse === true && deltas(r.evs).join('').trimEnd() === 'En flux, par la seconde.' && f.texte === 'En flux, par la seconde.');

  CL._oublierClesEpuisees();
  delete process.env.ANTHROPIC_API_KEY_2;
  recus = fauxClaude([{ statut: 400, type: 'invalid_request_error', erreur: VIDE }]);
  r = await jouer(base({ contents: Q('Ma VFC ?') }));
  v('une seule clé, épuisée : comme avant — un appel, 502, pas de `cle=` au journal', recus.length === 1 && r.res.code === 502
    && !r.lignes.some((l) => / cle=/.test(l)));
  CL._oublierClesEpuisees();
}

global.fetch = vraiFetch;
console.log(`\n${vert} réussis, ${rouge} échoués`);
if (rouge) process.exit(1);
})();
