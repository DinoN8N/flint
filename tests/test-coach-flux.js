// ═══════════════════════════════════════════════════════════════════════════
//  LE BANC DE LA DIFFUSION PAR JETON
//
//  Pourquoi ce banc existe : la diffusion ne peut pas se vérifier en la
//  déployant « pour voir ». Une fois en production, une ligne « Suites : » qui
//  part dans le flux, un tour d'outils qui se met à cracher du texte ou une
//  panne d'ouverture qui répond du SSE au lieu du JSON ne se rattrapent pas —
//  elles cassent l'écran de tout le monde en même temps.
//
//  Il exerce le VRAI `api/coach.js`, avec un faux Gemini : un `fetch` remplacé
//  qui rend un vrai flux SSE, découpé en paquets réseau choisis pour tomber au
//  mauvais endroit. Aucune copie des règles ici.
// ═══════════════════════════════════════════════════════════════════════════

const path = require('path');

let vert = 0, rouge = 0;
function v(titre, ok, detail) {
  if (ok) { vert++; console.log('  ✅ ' + titre); }
  else { rouge++; console.log('  ❌ ' + titre + (detail ? '   ' + detail : '')); }
}

// ── Le faux Gemini ─────────────────────────────────────────────────────────

/** Un objet `GenerateContentResponse` tel que Gemini en sème dans son SSE. */
const morceauTexte = (t) => JSON.stringify({ candidates: [{ content: { parts: [{ text: t }] } }] });
const morceauOutil = (nom, args) =>
  JSON.stringify({ candidates: [{ content: { parts: [{ functionCall: { name: nom, args: args || {} } }] } }] });

/**
 * Remplace `fetch` par un flux SSE bâti à partir de `morceaux`, livré en
 * PAQUETS RÉSEAU de `taillePaquet` octets — c'est le point du banc : un paquet
 * ne s'aligne jamais sur une ligne SSE.
 */
function fauxGemini(morceaux, { statut = 200, taillePaquet = 17, fin = '\n\n',
                                 sansFinale = false } = {}) {
  let sse = morceaux.map(m => 'data: ' + m + fin).join('');
  if (sansFinale && sse.endsWith(fin)) sse = sse.slice(0, -fin.length);
  global.fetch = async () => {
    if (statut !== 200) {
      return { ok: false, status: statut, body: null, text: async () => 'refus simulé' };
    }
    const octets = Buffer.from(sse, 'utf8');
    let i = 0;
    const body = {
      getReader: () => ({
        read: async () => {
          if (i >= octets.length) return { done: true, value: undefined };
          const bout = octets.subarray(i, i + taillePaquet);
          i += taillePaquet;
          return { done: false, value: new Uint8Array(bout) };
        }
      })
    };
    return { ok: true, status: 200, body, text: async () => sse };
  };
}

/** Une réponse HTTP simulée qui retient TOUT : statut, en-têtes, chaque write. */
function fauxRes() {
  const r = { code: null, corps: null, entetes: {}, morceaux: [], fini: false, sse: false };
  r.setHeader = (k, val) => { r.entetes[k] = val; };
  r.status = (c) => { r.code = c; return r; };
  r.json = (o) => { r.corps = o; return r; };
  r.writeHead = (c, h) => { r.code = c; Object.assign(r.entetes, h || {}); r.sse = true; return r; };
  r.write = (s) => { r.morceaux.push(s); return true; };
  r.end = () => { r.fini = true; return r; };
  return r;
}
function fauxReq(corps) {
  return { method: 'POST', headers: { 'x-flint-key': 'secret-de-banc', 'x-flint-device': 'banc' }, body: corps };
}
/** Les objets `data:` reçus, dans l'ordre. */
function evenements(res) {
  return res.morceaux.join('')
    .split('\n\n').filter(b => b.startsWith('data:'))
    .map(b => JSON.parse(b.slice(5).trim()));
}
const deltas = (evs) => evs.filter(e => 'd' in e).map(e => e.d);
const fin = (evs) => (evs.find(e => e.fin) || {}).fin;

// ── Le décor ───────────────────────────────────────────────────────────────

process.env.FLINT_APP_SECRET = 'secret-de-banc';
process.env.GEMINI_API_KEY = 'cle-de-banc';
delete process.env.COACH_EXIGE_SIGNATURE;
delete process.env.UPSTASH_REDIS_REST_URL;   // le plafond reste dormant
delete process.env.COACH_V2;
delete process.env.COACH_FACTURATION;
delete process.env.COACH_PRECHARGE;
delete process.env.COACH_COMPACTION;
const vraiFetch = global.fetch;
const handler = require(path.join(__dirname, '..', 'api', 'coach.js'));
const { prechargement, MARQUEUR } = require(path.join(__dirname, '..', 'api', '_coach-histoire.js'));
const REPONSES_V1 = require(path.join(__dirname, 'fixtures', 'precharge-v1.json'));
const INSTANTANE = require(path.join(__dirname, 'fixtures', 'instantane-synthetique.json'));
const NATIF = require(path.join(__dirname, 'fixtures', 'natif-synthetique.json'));

// ═══ 25 SEPT. 2026 — LE FIL PAR DÉFAUT EST LE DEUXIÈME ALLER ═══════════════
//
// Depuis S4, une question NOUVELLE ne va plus chez Gemini : le serveur rend
// lui-même le préchargement (voir ⑭). La diffusion se joue donc au deuxième
// aller — la question, le tour fabriqué, les réponses du téléphone — et c'est
// ce fil-là que les chapitres ① à ⑪ jouent désormais.
function suivi(texte, version) {
  const p = prechargement({ version: version || 'v1' });
  return [
    { role: 'user', parts: [{ text: texte }] },
    p.tourModele,
    { role: 'function', parts: p.appels.map((a) => ({ functionResponse: { name: a.name,
      response: a.name === 'getDay' ? { jour: INSTANTANE.meta.jour, recup: INSTANTANE.recup } : REPONSES_V1[a.name] } })) }
  ];
}

const question = (extra) => Object.assign({
  deviceId: 'banc', langue: 'fr', ton: 'aucun', profilTexte: '', memoireTexte: '',
  contents: suivi('Et ma VFC ?')
}, extra || {});

async function jouer(morceaux, opts) {
  fauxGemini(morceaux, opts);
  const res = fauxRes();
  await handler(fauxReq(question({ flux: true })), res);
  return res;
}

(async () => {

console.log('\n═══ ① LE TEXTE ARRIVE PAR MORCEAUX, DANS L\'ORDRE, SANS PERTE ═══');
{
  const res = await jouer([morceauTexte('Ta VFC est à '), morceauTexte('48 ms, '),
                           morceauTexte('soit 16 % sous ta normale.')]);
  const evs = evenements(res);
  v('en-têtes SSE posés', res.entetes['Content-Type'] === 'text/event-stream; charset=utf-8');
  v('  … avec le no-transform qui empêche un proxy de recompresser',
    String(res.entetes['Cache-Control']).includes('no-transform'));
  v('plusieurs morceaux sont partis (donc ça diffuse)', deltas(evs).length >= 2,
    deltas(evs).length + ' delta(s)');
  v('recollés, ils rendent le texte exact',
    deltas(evs).join('') === 'Ta VFC est à 48 ms, soit 16 % sous ta normale.',
    JSON.stringify(deltas(evs).join('')));
  v('le `fin` porte le même texte', fin(evs).texte === 'Ta VFC est à 48 ms, soit 16 % sous ta normale.');
  v('  … en mode réponse', fin(evs).mode === 'reponse');
  v('  … avec le tour modèle pour l\'historique',
    fin(evs).tourModele && fin(evs).tourModele.role === 'model');
  v('la réponse est close', res.fini === true);
}

console.log('\n═══ ② UN PAQUET RÉSEAU QUI COUPE UNE LIGNE SSE NE PERD RIEN ═══');
{
  for (const taille of [1, 3, 7, 64, 100000]) {
    const res = await jouer([morceauTexte('abc'), morceauTexte('def'), morceauTexte('ghi')],
                            { taillePaquet: taille });
    const evs = evenements(res);
    v(`paquets de ${taille} octet(s) : texte intact`, deltas(evs).join('') === 'abcdefghi',
      JSON.stringify(deltas(evs).join('')));
  }
}

console.log('\n═══ ③ LA LIGNE « SUITES : » NE PART JAMAIS DANS LE FLUX ═══');
{
  const res = await jouer([morceauTexte('Dors plus tôt.\n\n'),
                           morceauTexte('Suites : A ? '), morceauTexte('| B ? | C ?')]);
  const evs = evenements(res);
  const tout = deltas(evs).join('');
  v('aucun delta ne contient « Suites »', !/suites/i.test(tout), JSON.stringify(tout));
  v('le texte diffusé est le corps seul', tout.trim() === 'Dors plus tôt.', JSON.stringify(tout));
  v('les suites reviennent détachées dans le `fin`',
    JSON.stringify(fin(evs).suites) === JSON.stringify(['A ?', 'B ?', 'C ?']),
    JSON.stringify(fin(evs).suites));
  v('  … et le texte du `fin` ne les porte plus', fin(evs).texte === 'Dors plus tôt.');
  v('le tourModele, lui, garde le BRUT (c\'est ce que le modèle relira)',
    /Suites/.test(fin(evs).tourModele.parts[0].text));
}

console.log('\n═══ ④ UN TEXTE ORDINAIRE N\'EST RETENU D\'AUCUN CARACTÈRE ═══');
{
  // Un dernier paragraphe sans saut de ligne final : il doit partir en flux,
  // pas attendre le `fin`. C'est le cas le plus fréquent, et le plus facile
  // à casser en élargissant la garde.
  const res = await jouer([morceauTexte('Un.\n\n'), morceauTexte('Deux, sans saut final')]);
  const evs = evenements(res);
  v('tout est parti AVANT le `fin`', deltas(evs).join('') === 'Un.\n\nDeux, sans saut final',
    JSON.stringify(deltas(evs).join('')));
  const iFin = evs.findIndex(e => e.fin);
  v('  … donc aucun delta après le `fin`', evs.slice(iFin + 1).every(e => !('d' in e)));
}

console.log('\n═══ ⑤ UN TOUR D\'OUTILS NE DIFFUSE AUCUN TEXTE ═══');
{
  const res = await jouer([morceauOutil('getRecoveryContext', { jour: 0 }),
                           morceauOutil('getSleepHistory', {})]);
  const evs = evenements(res);
  v('zéro delta', deltas(evs).length === 0, deltas(evs).length + ' delta(s)');
  v('le `fin` est un tour d\'outils', fin(evs).mode === 'outils');
  v('  … avec les deux appels, dans l\'ordre',
    fin(evs).appels.map(a => a.name).join(',') === 'getRecoveryContext,getSleepHistory',
    JSON.stringify(fin(evs).appels));
  v('  … et leurs arguments', fin(evs).appels[0].args.jour === 0);
  v('le tourModele porte les functionCall', fin(evs).tourModele.parts.length === 2);
}

console.log('\n═══ ⑤ bis LE TOUR D\'OUTILS GARDE SA thoughtSignature ═══');
{
  // 24 sept. 2026, 18 h 45 — AUCUNE réponse diffusée n'avait abouti en
  // production (zéro `flux-reponse` en dix heures de journal). Le tour
  // d'outils était rebâti en `{ functionCall }` seul : la signature que
  // Gemini 3 pose sur le PREMIER appel d'un lot parallèle disparaissait, et le
  // tour suivant rendait 400 « Function call is missing a thought_signature »
  // (mesuré sur une préproduction, avant/après). Le faux Gemini de ⑤ ne
  // posait pas de signature — il ne prouvait que la forme qu'on lui avait
  // donnée, pas celle que Google envoie.
  const lot = JSON.stringify({ candidates: [{ content: { parts: [
    { functionCall: { name: 'getRecoveryContext', args: {} }, thoughtSignature: 'sig-du-lot' },
    { functionCall: { name: 'getSleepHistory', args: {} } }
  ] } }] });
  const res = await jouer([lot]);
  const parts = fin(evenements(res)).tourModele.parts;
  v('la signature revient avec le premier appel', parts[0].thoughtSignature === 'sig-du-lot',
    JSON.stringify(parts[0]));
  v('  … et le second appel reste tel que Gemini l\'a rendu', !('thoughtSignature' in parts[1]));
}

console.log('\n═══ ⑥ UNE PANNE D\'OUVERTURE RÉPOND DU JSON, PAS DU SSE ═══');
{
  // C'est ce qui permet au repli de l'app de marcher sans rien savoir du flux :
  // tant qu'aucun octet n'est parti, la panne se dit comme avant.
  fauxGemini([], { statut: 503 });
  const res = fauxRes();
  await handler(fauxReq(question({ flux: true })), res);
  v('aucun en-tête SSE posé', res.sse === false);
  v('statut 502', res.code === 502, 'code ' + res.code);
  v('un corps JSON avec un message lisible',
    res.corps && typeof res.corps.error === 'string' && res.corps.error.length > 10,
    JSON.stringify(res.corps));
  v('aucun octet écrit', res.morceaux.length === 0);

  // ⚠️ LE VERDICT DE CHAQUE MODÈLE, PAS SEULEMENT DU DERNIER. `detail` ne
  // porte que l'erreur du dernier essayé, et ça a produit un diagnostic faux
  // le 24 sept. : annoncé « 503, Google sature » à partir du dernier maillon,
  // alors que le journal montrait `3.6-flash:429` — un quota — en tête de
  // chaîne. Les deux pannes n'appellent pas du tout la même réponse.
  v('le `parcours` nomme les trois modèles',
    Array.isArray(res.corps.parcours) && res.corps.parcours.length === 3,
    JSON.stringify(res.corps.parcours));
  v('  … chacun avec son verdict',
    (res.corps.parcours || []).every(x => /^gemini-[\w.-]+:\d+$/.test(x)),
    JSON.stringify(res.corps.parcours));
  v('  … dans l\'ordre de la chaîne',
    (res.corps.parcours || [])[0].startsWith('gemini-3.6-flash:'),
    JSON.stringify(res.corps.parcours));
}

console.log('\n═══ ⑦ LE MODÈLE NE RÉPOND RIEN : UNE ERREUR, PAS UN FIN VIDE ═══');
{
  const res = await jouer([morceauTexte('   ')]);
  const evs = evenements(res);
  v('un événement d\'erreur', evs.some(e => e.erreur), JSON.stringify(evs));
  v('  … et aucun `fin`', !fin(evs));
}

console.log('\n═══ ⑧ SANS `flux`, LE CONTRAT D\'AVANT NE BOUGE PAS D\'UN BIT ═══');
{
  // La condition du déploiement : une app déjà posée n'envoie pas `flux`, et
  // doit recevoir exactement ce qu'elle recevait hier.
  global.fetch = async () => ({
    ok: true, status: 200,
    text: async () => JSON.stringify({ candidates: [{ content: {
      role: 'model', parts: [{ text: 'Réponse en bloc.\n\nSuites : X ? | Y ?' }] } }] })
  });
  const res = fauxRes();
  await handler(fauxReq(question()), res);
  v('aucun en-tête SSE', res.sse === false);
  v('statut 200 par `status().json()`', res.code === 200, 'code ' + res.code);
  v('mode réponse', res.corps && res.corps.mode === 'reponse', JSON.stringify(res.corps && res.corps.mode));
  v('texte sans la ligne de suites', res.corps.texte === 'Réponse en bloc.');
  v('suites détachées', JSON.stringify(res.corps.suites) === JSON.stringify(['X ?', 'Y ?']));
  v('tourModele présent', !!res.corps.tourModele);
}

console.log('\n═══ ⑨ LE SÉPARATEUR N\'EST PAS TOUJOURS « \n\n » ═══');
{
  // ⚠️ CE CHAPITRE EXISTE PARCE QUE LE BANC AVAIT TORT. Il fabriquait ses
  // séparateurs en « \n\n », donc il ne prouvait que ce cas-là. La vraie
  // chaîne de Google sépare en CRLF : « \r\n\r\n » ne contient pas « \n\n »,
  // aucun bloc n'était lu, et la production annonçait « Flint n'a rien
  // répondu » pendant que le banc était vert.
  for (const [nom, fin] of [['LF', '\n\n'], ['CRLF', '\r\n\r\n'], ['CR seul', '\r\r']]) {
    const res = await jouer([morceauTexte('abc'), morceauTexte('def')], { fin });
    const evs = evenements(res);
    v(`séparateur ${nom} : texte intact`, deltas(evs).join('') === 'abcdef',
      JSON.stringify(deltas(evs).join('')));
  }
  // … et coupé n'importe où, y compris AU MILIEU d'un CRLF.
  for (const taille of [1, 2, 3, 5]) {
    const res = await jouer([morceauTexte('abc'), morceauTexte('def')],
                            { fin: '\r\n\r\n', taillePaquet: taille });
    v(`CRLF en paquets de ${taille} : texte intact`,
      deltas(evenements(res)).join('') === 'abcdef');
  }
  // Un flux qui se clôt sans ligne blanche finale ne perd pas son dernier
  // événement : c'est la fin du corps qui le termine.
  const res = await jouer([morceauTexte('abc'), morceauTexte('def')], { sansFinale: true });
  v('pas de ligne blanche finale : le dernier événement compte quand même',
    deltas(evenements(res)).join('') === 'abcdef',
    JSON.stringify(deltas(evenements(res)).join('')));
}

console.log('\n═══ ⑩ UN FLUX MUET RETOMBE SUR L\'ANCIEN CHEMIN ═══');
{
  // La promesse qui rend ce chantier déployable : le PIRE cas de la diffusion
  // est le comportement d'avant elle, jamais une panne.
  let appels = 0;
  global.fetch = async (url) => {
    appels++;
    if (String(url).includes('streamGenerateContent')) {
      // un flux qu'on n'arrive pas à lire — ici, vide
      const body = { getReader: () => ({ read: async () => ({ done: true }) }) };
      return { ok: true, status: 200, body, text: async () => '' };
    }
    return { ok: true, status: 200, text: async () => JSON.stringify({ candidates: [{ content: {
      role: 'model', parts: [{ text: 'Repli en bloc.\n\nSuites : X ? | Y ?' }] } }] }) };
  };
  const res = fauxRes();
  await handler(fauxReq(question({ flux: true })), res);
  const evs = evenements(res);
  v('les deux appels ont eu lieu (flux, puis bloc)', appels === 2, appels + ' appel(s)');
  v('aucune erreur n\'est remontée', !evs.some(e => e.erreur), JSON.stringify(evs));
  v('un `fin` complet arrive quand même', fin(evs) && fin(evs).mode === 'reponse');
  v('  … avec le texte du repli', fin(evs).texte === 'Repli en bloc.');
  v('  … et ses suites détachées',
    JSON.stringify(fin(evs).suites) === JSON.stringify(['X ?', 'Y ?']));
  v('le texte est livré au client même s\'il n\'a pas diffusé',
    deltas(evs).join('') === 'Repli en bloc.', JSON.stringify(deltas(evs)));
}

console.log('\n═══ ⑪ … Y COMPRIS QUAND LE REPLI REND UN TOUR D\'OUTILS ═══');
{
  global.fetch = async (url) => {
    if (String(url).includes('streamGenerateContent')) {
      const body = { getReader: () => ({ read: async () => ({ done: true }) }) };
      return { ok: true, status: 200, body, text: async () => '' };
    }
    return { ok: true, status: 200, text: async () => JSON.stringify({ candidates: [{ content: {
      role: 'model', parts: [{ functionCall: { name: 'getSleepHistory', args: {} } }] } }] }) };
  };
  const res = fauxRes();
  await handler(fauxReq(question({ flux: true })), res);
  const evs = evenements(res);
  v('le `fin` est un tour d\'outils', fin(evs) && fin(evs).mode === 'outils',
    JSON.stringify(fin(evs)));
  v('  … avec son appel', fin(evs).appels[0].name === 'getSleepHistory');
  v('zéro delta', deltas(evs).length === 0);
}

// ═══════════════════════════════════════════════════════════════════════════
//  25 SEPT. 2026 — S4 : LE PRÉCHARGEMENT, LA PRÉPARATION, V2, « RETENIR »
//
//  Un faux Gemini qui RETIENT chaque corps reçu : ce qu'il a vu est exactement
//  ce que Google aurait vu. La règle qui ne se discute pas : aucun tour
//  fabriqué (le marqueur, ses functionCall, sa signature factice) n'y arrive,
//  par AUCUNE des trois branches — JSON, flux, repli du flux.
// ═══════════════════════════════════════════════════════════════════════════

/** Faux Gemini qui enregistre ; `flux` rend ces morceaux en SSE, `bloc` ce texte d'un bloc. */
function geminiEnregistreur({ morceaux = [], bloc = 'Repli.', fluxMuet = false, taillePaquet = 17 } = {}) {
  const recus = [];
  global.fetch = async (url, init) => {
    recus.push({ url: String(url), corps: JSON.parse(init.body) });
    if (String(url).includes('streamGenerateContent')) {
      const sse = fluxMuet ? '' : morceaux.map((m) => 'data: ' + m + '\r\n\r\n').join('');
      const octets = Buffer.from(sse, 'utf8');
      let i = 0;
      const body = { getReader: () => ({ read: async () => {
        if (i >= octets.length) return { done: true, value: undefined };
        const bout = octets.subarray(i, i + taillePaquet); i += taillePaquet;
        return { done: false, value: new Uint8Array(bout) };
      } }) };
      return { ok: true, status: 200, body, text: async () => sse };
    }
    return { ok: true, status: 200, text: async () => JSON.stringify({ candidates: [{ content: {
      role: 'model', parts: [{ text: bloc }] } }] }) };
  };
  return recus;
}
/** Joue le handler en capturant le journal. Un appareil et une IP neufs à
 *  chaque appel : ⑯ en joue des dizaines, le rate-limit (40/min) mordrait. */
let nAppel = 0;
async function jouerCorps(corps, entetes) {
  nAppel++;
  const res = fauxRes();
  const lignes = [];
  const orig = console.log;
  console.log = (...a) => lignes.push(a.join(' '));
  try {
    await handler({ method: 'POST', headers: Object.assign({ 'x-flint-key': 'secret-de-banc', 'x-flint-device': 'banc-s4-' + nAppel,
                                                          'x-forwarded-for': '198.51.100.' + (nAppel % 250) }, entetes || {}),
                    body: corps }, res);
  } finally { console.log = orig; }
  return { res, lignes, evs: res.sse ? evenements(res) : [] };
}
/** Ce qu'aucun corps envoyé à Gemini ne doit porter. */
function propreDeFabrique(corps) {
  const s = JSON.stringify(corps.contents);
  return !s.includes(MARQUEUR) && !s.includes('skip_thought_signature_validator')
      && !corps.contents.some((t) => (t.parts || []).some((p) => p.functionCall));
}
const systeme = (corps) => corps.systemInstruction.parts[0].text;

console.log('\n═══ ⑫ LE DEUXIÈME ALLER, EN FLUX : GEMINI NE VOIT AUCUN TOUR FABRIQUÉ ═══');
{
  const recus = geminiEnregistreur({ morceaux: [morceauTexte('**Ta VFC est à 71 ms.**\n\n## À faire\n- Garde ton rythme.\n\n'),
                                               morceauTexte('Suites : Et demain ? | Mon sommeil ?')] });
  const { res, lignes, evs } = await jouerCorps(question({ flux: true }));
  v('un seul appel à Gemini, en flux', recus.length === 1 && recus[0].url.includes('streamGenerateContent'), recus.length + ' appel(s)');
  const c = recus[0].corps;
  v('aucun marqueur, aucun functionCall fabriqué, aucune signature factice', propreDeFabrique(c), JSON.stringify(c.contents).slice(0, 300));
  v('  … Gemini ne voit que la question', c.contents.length === 1 && c.contents[0].parts[0].text === 'Et ma VFC ?',
    JSON.stringify(c.contents).slice(0, 200));
  v('les résultats du préchargement sont dans l\'instruction système (DONNÉES DU JOUR)',
    systeme(c).includes('⟦DONNÉES DU JOUR') && systeme(c).includes('Porridge banane-banc'));
  v('les outils déclarés sont les V1', c.tools[0].functionDeclarations.some((o) => o.name === 'getRecoveryContext')
    && !c.tools[0].functionDeclarations.some((o) => o.name === 'getDay'));
  const f = fin(evs);
  v('le `fin` porte `v`, le mémo, et pas de `retenir` en v1',
    f && f.v === handler.COACH_VERSION && f.memo && f.memo.q === 'Et ma VFC ?' && !('retenir' in f), JSON.stringify(f));
  v('  … le mémo : verdict sans gras, première action', f.memo.v === 'Ta VFC est à 71 ms.' && f.memo.a === 'Garde ton rythme.',
    JSON.stringify(f.memo));
  v('  … et `appelsGemini` = 1', f.appelsGemini === 1);
  const l = lignes.find((x) => x.includes('mode=flux-reponse')) || '';
  v('journal : outils=v1 precharge=1 marqueurs=1 toursOutils=0 gemini=1',
    /outils=v1\b/.test(l) && /precharge=1\b/.test(l) && /marqueurs=1\b/.test(l) && /toursOutils=0\b/.test(l) && /gemini=1\b/.test(l), l);
  v('  … et jamais la question ni la réponse', !l.includes('VFC'), l);
}

console.log('\n═══ ⑬ LE REPLI DU FLUX PART AVEC LE MÊME CORPS PRÉPARÉ ═══');
{
  const recus = geminiEnregistreur({ fluxMuet: true, bloc: 'Repli préparé.\n\nSuites : A ? | B ?' });
  const { lignes, evs } = await jouerCorps(question({ flux: true }));
  v('deux appels : le flux, puis le bloc', recus.length === 2 && recus[1].url.includes(':generateContent'), recus.map((r) => r.url.split(':').pop()).join(','));
  v('le repli ne voit aucun tour fabriqué non plus', recus.every((r) => propreDeFabrique(r.corps)));
  v('  … c\'est le MÊME corps que celui du flux, à l\'octet', JSON.stringify(recus[0].corps) === JSON.stringify(recus[1].corps));
  v('  … DONNÉES DU JOUR comprises', systeme(recus[1].corps).includes('⟦DONNÉES DU JOUR'));
  v('le `fin` arrive, avec `appelsGemini` = 2', fin(evs) && fin(evs).texte === 'Repli préparé.' && fin(evs).appelsGemini === 2,
    JSON.stringify(fin(evs)));
  v('journal : gemini=2 (le repli compte)', lignes.some((x) => x.includes('mode=flux-reponse') && /gemini=2\b/.test(x)), lignes.join(' | '));
}

console.log('\n═══ ⑭ UNE QUESTION NOUVELLE, MÊME EN FLUX : DU JSON, ZÉRO GEMINI ═══');
{
  const recus = geminiEnregistreur({ morceaux: [morceauTexte('ne doit pas partir')] });
  const { res, lignes } = await jouerCorps(question({ flux: true, contents: [{ role: 'user', parts: [{ text: 'Pourquoi ma récup est à 74 ?' }] }] }));
  v('aucun appel à Gemini', recus.length === 0, recus.length + ' appel(s)');
  v('du JSON, pas du SSE (l\'app lit le JSON dès que ce n\'est pas un flux)', res.sse === false && res.code === 200 && res.corps && res.corps.mode === 'outils');
  v('  … les cinq appels V1, dans l\'ordre',
    res.corps.appels.map((a) => a.name).join(',') === 'getRecoveryContext,getSleepHistory,getTrainingLoad,getNutritionToday,getActivityHistory');
  v('  … le tour marqué', res.corps.tourModele.parts[0].text === MARQUEUR);
  v('journal : mode=precharge version=v1 appels=5 gemini=0',
    lignes.some((x) => /mode=precharge .*version=v1 appels=5\b/.test(x) && /gemini=0\b/.test(x)), lignes.join(' | '));
}

// La porte ouverte pour l'appareil du banc : V2 exige les capacités ET la porte.
const CAP_V2 = { instantane: 1, outils: 1, natif: 1, memo: 1 };
function ouvrirPorte() { process.env.COACH_V2 = '1'; process.env.COACH_V2_APPAREILS = 'autre-appareil, banc-v2'; }
function fermerPorte() { delete process.env.COACH_V2; delete process.env.COACH_V2_APPAREILS; delete process.env.COACH_FACTURATION; }
const APPAREIL_V2 = { 'x-flint-device': 'banc-v2' };

const REPONSE_V2 = '**Récup à 74/100 : tu peux charger.**\n\n## Pourquoi\n- VFC 71 ms, au-dessus de ta normale.\n\n'
  + '## À faire\n- Séance soutenue ce soir.\n\nRetenir : objectif — prépare un semi-marathon en mars\n'
  + 'Suites : Et demain ? | Mon sommeil ?';

console.log('\n═══ ⑮ V2, PORTE OUVERTE, INSTANTANÉ VALIDE : UN SEUL ALLER, EN FLUX ═══');
{
  ouvrirPorte();
  const recus = geminiEnregistreur({ morceaux: [morceauTexte(REPONSE_V2)] });
  const { lignes, evs } = await jouerCorps({ deviceId: 'banc', langue: 'fr', ton: 'analytique', flux: true,
    capacites: CAP_V2, instantane: INSTANTANE, natif: NATIF, faits: '· (12 sept.) [objectif] finir un 10 km',
    memos: [{ d: '2026-9-15', q: 'Et mon foot ?', v: 'Séance solide.', a: 'Récupère ce soir.' }],
    contents: [{ role: 'user', parts: [{ text: 'Je peux charger aujourd\'hui ?' }] }] }, APPAREIL_V2);
  v('pas de préchargement : Gemini est appelé dès le premier aller', recus.length === 1, recus.length + ' appel(s)');
  const c = recus[0] && recus[0].corps;
  v('les déclarations V2 (getDay…, sans getRecoveryContext)', !!c && c.tools[0].functionDeclarations.some((o) => o.name === 'getDay')
    && !c.tools[0].functionDeclarations.some((o) => o.name === 'getRecoveryContext'));
  v('l\'instantané est rendu dans l\'instruction système', !!c && systeme(c).includes('⟦DONNÉES DE L\'APP — au 2026-9-16')
    && systeme(c).includes('Porridge banane'));
  v('  … et JAMAIS dans `contents`', !!c && !JSON.stringify(c.contents).includes('Porridge'));
  v('  … avec les faits et les échanges récents', !!c && systeme(c).includes('finir un 10 km') && systeme(c).includes('ÉCHANGES RÉCENTS'));
  const f = fin(evs);
  v('fin.retenir porte le fait détaché', f && JSON.stringify(f.retenir) === JSON.stringify([{ categorie: 'objectif', fait: 'prépare un semi-marathon en mars' }]),
    JSON.stringify(f && f.retenir));
  v('fin.memo est daté du jour de l\'instantané', f && f.memo && f.memo.d === '2026-9-16' && f.memo.a === 'Séance soutenue ce soir.',
    JSON.stringify(f && f.memo));
  v('le texte final ne porte ni « Retenir » ni « Suites »', f && !/Retenir|Suites/.test(f.texte), f && f.texte);
  v('  … le tourModele garde le brut', f && f.tourModele.parts[0].text.includes('Retenir : objectif'));
  const l = lignes.find((x) => x.includes('mode=flux-reponse')) || '';
  v('journal : outils=v2 precharge=0 inst=<octets> natif=<octets> memos=1 retenir=1',
    /outils=v2\b/.test(l) && /precharge=0\b/.test(l) && /inst=\d+/.test(l) && /natif=\d+/.test(l) && /memos=1\b/.test(l) && /retenir=1\b/.test(l), l);
  fermerPorte();
}

console.log('\n═══ ⑯ « RETENIR » NE S\'AFFICHE JAMAIS, QUEL QUE SOIT LE DÉCOUPAGE ═══');
{
  // Le flux coupe où il veut : au milieu du mot, juste après le saut de ligne,
  // entre « Retenir » et son « : ». Chaque découpe est jouée, et en paquets
  // réseau de tailles diverses par-dessus. La facturation ouvre V2 à TOUT
  // appareil : chaque appel en prend un neuf.
  process.env.COACH_V2 = '1';
  process.env.COACH_FACTURATION = '1';
  const texte = REPONSE_V2;
  const decoupes = [];
  for (const n of [1, 2, 3, 5, 7, 11, 16]) {
    const m = []; for (let i = 0; i < texte.length; i += n) m.push(texte.slice(i, i + n)); decoupes.push(['morceaux de ' + n, m]);
  }
  const iR = texte.indexOf('Retenir');
  for (const k of [0, 1, 3, 7, 8, 9, 10]) decoupes.push(['coupé à Retenir+' + k, [texte.slice(0, iR + k), texte.slice(iR + k)]]);
  decoupes.push(['coupé juste avant le saut de ligne', [texte.slice(0, iR - 1), texte.slice(iR - 1)]]);
  decoupes.push(['le bloc final en un morceau', [texte.slice(0, iR), texte.slice(iR)]]);
  let fuites = [], manques = [], ecarts = [];
  for (const [nom, morceaux] of decoupes) {
    for (const paquet of [3, 64]) {
      geminiEnregistreur({ morceaux: morceaux.map(morceauTexte), taillePaquet: paquet });
      const { evs } = await jouerCorps({ deviceId: 'banc', langue: 'fr', ton: 'aucun', flux: true, capacites: CAP_V2,
        instantane: INSTANTANE, natif: NATIF, contents: [{ role: 'user', parts: [{ text: 'Je peux charger ?' }] }] });
      const tout = deltas(evs).join('');
      const f = fin(evs) || {};
      if (/retenir|suites/i.test(tout)) fuites.push(nom + '/' + paquet);
      if (!(f.retenir && f.retenir.length === 1 && f.retenir[0].fait === 'prépare un semi-marathon en mars')) manques.push(nom + '/' + paquet);
      if (tout.trimEnd() !== f.texte) ecarts.push(nom + '/' + paquet);
    }
  }
  v(decoupes.length * 2 + ' découpages : « Retenir » et « Suites » n\'apparaissent dans AUCUN delta', fuites.length === 0, fuites.join(', '));
  v('  … et fin.retenir porte le fait à chaque fois', manques.length === 0, manques.join(', '));
  v('  … les deltas recollés valent fin.texte (aux blancs de fin près)', ecarts.length === 0, ecarts.join(', '));

  // Revue du 25 sept. — les étiquettes en GRAS, coupées ENTRE leurs deux
  // astérisques (« **Retenir* » | « * : … », « …\n* » | « *Suites :** … ») :
  // la garde n'acceptait que la paire entière, la ligne Retenir partait.
  const GRAS = '**Récup à 74/100 : tu peux charger.**\n\n## Pourquoi\n- **Sommeil court** : 5h45.\n'
    + '**Retenir :** objectif — prépare un semi-marathon en mars\n**Suites :** Et demain ? | Mon sommeil ?';
  const GRAS2 = '**Récup à 74/100 : tu peux charger.**\n\n## Pourquoi\n- **Sommeil court** : 5h45.\n'
    + '**Retenir** : objectif — prépare un semi-marathon en mars\n**Suites** : Et demain ? | Mon sommeil ?';
  const decoupesGras = [
    ['la revue : « …\\n* » | « *Suites :** »', [GRAS.slice(0, GRAS.indexOf('**Suites') + 1), GRAS.slice(GRAS.indexOf('**Suites') + 1)]],
    ['la revue : « **Retenir* » | « * : … »', (() => { const a = GRAS2.indexOf('**Retenir') + 10, b = GRAS2.indexOf('**Suites') + 9;
      return [GRAS2.slice(0, a), GRAS2.slice(a, b), GRAS2.slice(b)]; })()]
  ];
  for (const t of [GRAS, GRAS2]) {
    for (const lab of ['**Retenir', '**Suites']) {
      const i0 = t.indexOf(lab);
      for (let k = -1; k <= lab.length + 3; k++) decoupesGras.push([lab + '+' + k, [t.slice(0, i0 + k), t.slice(i0 + k)]]);
    }
  }
  fuites = []; manques = []; ecarts = [];
  for (const [nom, morceaux] of decoupesGras) {
    for (const paquet of [1, 64]) {
      geminiEnregistreur({ morceaux: morceaux.filter(Boolean).map(morceauTexte), taillePaquet: paquet });
      const { evs } = await jouerCorps({ deviceId: 'banc', langue: 'fr', ton: 'aucun', flux: true, capacites: CAP_V2,
        instantane: INSTANTANE, natif: NATIF, contents: [{ role: 'user', parts: [{ text: 'Je peux charger ?' }] }] });
      const tout = deltas(evs).join('');
      const f = fin(evs) || {};
      if (/retenir|suites|semi-marathon/i.test(tout)) fuites.push(nom + '/' + paquet);
      if (!(f.retenir && f.retenir.length === 1 && f.retenir[0].fait === 'prépare un semi-marathon en mars')) manques.push(nom + '/' + paquet);
      if (tout.trimEnd() !== f.texte) ecarts.push(nom + '/' + paquet + ' ' + JSON.stringify(tout.slice(-12)));
    }
  }
  v(decoupesGras.length * 2 + ' découpages en GRAS, coupés entre les astérisques : rien de retenu ne part',
    fuites.length === 0, fuites.join(', '));
  v('  … fin.retenir porte le fait', manques.length === 0, manques.join(', '));
  v('  … et aucun astérisque égaré : les deltas recollés valent fin.texte', ecarts.length === 0, ecarts.join(', '));
  fermerPorte();
}

console.log('\n═══ ⑯ bis EN V1, « RETENIR : » EST DE LA PROSE, ET IL RESTE À L\'ÉCRAN ═══');
{
  // Revue du 25 sept. — le prompt v1 ne demande jamais cette ligne et l'app
  // posée ne lit pas `retenir` : la détacher l'effaçait pour de bon.
  const V1 = '**Ta récup est à 58.**\n## À faire\n- Au lit avant **22:30**.\n'
    + 'Retenir : ta régularité de coucher compte plus que la durée.\nSuites : Pourquoi 22:30 ? | Et demain ?';
  const garde = '**Ta récup est à 58.**\n## À faire\n- Au lit avant **22:30**.\nRetenir : ta régularité de coucher compte plus que la durée.';
  for (const n of [1, 5, 64]) {
    const m = []; for (let i = 0; i < V1.length; i += n) m.push(V1.slice(i, i + n));
    geminiEnregistreur({ morceaux: m.map(morceauTexte) });
    const { evs } = await jouerCorps(question({ flux: true }));
    const f = fin(evs) || {};
    v('flux v1, morceaux de ' + n + ' : la ligne Retenir reste dans fin.texte ET dans les deltas, sans `retenir`',
      f.texte === garde && deltas(evs).join('').trimEnd() === garde && !('retenir' in f)
      && JSON.stringify(f.suites) === JSON.stringify(['Pourquoi 22:30 ?', 'Et demain ?']), JSON.stringify(f));
  }
  geminiEnregistreur({ bloc: V1 });
  const { res } = await jouerCorps(question({ flux: false }));
  v('JSON v1 : de même', res.corps && res.corps.texte === garde && !('retenir' in res.corps), JSON.stringify(res.corps));
  geminiEnregistreur({ bloc: 'Text.\nRemember: routine — a fixed bedtime beats a long lie-in.\nNext: A? | B?' });
  const r2 = (await jouerCorps(question({ flux: false, langue: 'en' }))).res;
  v('  … et « Remember: routine — … » en anglais aussi', r2.corps
    && r2.corps.texte === 'Text.\nRemember: routine — a fixed bedtime beats a long lie-in.', JSON.stringify(r2.corps));
}

console.log('\n═══ ⑯ ter LE PRÉCHARGEMENT NE MANGE PAS UN TOUR DE GEMINI ═══');
{
  // Revue du 25 sept. — l'app compte chaque `mode:'outils'`, tour fabriqué
  // compris, et lève à la 5e (maxToursOutils = 4). Avec le préchargement et
  // trois vrais tours, le 4e appel à Gemini doit donc être SANS outils.
  const tour = (i) => [
    { role: 'model', parts: [{ functionCall: { name: 'getSleepHistory', args: { joursN: 14 } }, thoughtSignature: 'sig-' + i }] },
    { role: 'function', parts: [{ functionResponse: { name: 'getSleepHistory', response: REPONSES_V1.getSleepHistory } }] }
  ];
  const avec = (n) => suivi('Et ce mois-ci ?').concat(...Array.from({ length: n }, (_, i) => tour(i)));
  for (const [n, attendu] of [[0, false], [2, false], [3, true]]) {
    for (const flux of [false, true]) {
      const recus = geminiEnregistreur({ morceaux: [morceauTexte('Réponse.')], bloc: 'Réponse.' });
      const { lignes } = await jouerCorps(question({ flux, contents: avec(n) }));
      const c = recus[0] && recus[0].corps;
      const sans = !!c && !!c.toolConfig && c.toolConfig.functionCallingConfig.mode === 'NONE';
      v('préchargement + ' + n + ' vrai(s) tour(s), ' + (flux ? 'flux' : 'JSON') + ' : ' + (attendu ? 'Gemini SANS outils' : 'outils permis'),
        recus.length === 1 && sans === attendu && c.tools[0].functionDeclarations.length > 0, JSON.stringify(c && c.toolConfig));
      if (attendu && !flux) {
        v('  … les signatures des vrais tours voyagent intactes', JSON.stringify(c.contents).includes('sig-2')
          && !JSON.stringify(c.contents).includes('skip_thought_signature_validator'));
        v('  … journal : sansOutils=1', lignes.some((l) => /mode=reponse /.test(l) && /sansOutils=1\b/.test(l)), lignes.join(' | '));
      }
    }
  }
  // Sans préchargement (anodin, COACH_PRECHARGE=0) : 4 vrais tours suffisent.
  process.env.COACH_PRECHARGE = '0';
  const fil4 = [{ role: 'user', parts: [{ text: 'Et ce mois-ci ?' }] }].concat(...[0, 1, 2, 3].map(tour));
  const recus = geminiEnregistreur({ bloc: 'Réponse.' });
  await jouerCorps(question({ contents: fil4 }));
  v('sans préchargement, 4 vrais tours : Gemini SANS outils aussi', recus.length === 1 && !!recus[0].corps.toolConfig);
  delete process.env.COACH_PRECHARGE;
}

console.log('\n═══ ⑯ quater LES CLÉS INTERDITES NE PASSENT PAS PAR `contents` ═══');
{
  // Revue du 25 sept. — le nettoyage serveur n'avait que 13 clés, et un
  // `_adapte` posé par le téléphone le court-circuitait. Réponses d'outils
  // de la question en cours, en v1 comme en v2.
  const secret = { sante: 'diabète type 1', tabac: '10/j', lastName: 'Dupont', city: 'Lyon', email: 'x@y.fr',
                   jrn1: { cafe: 1 }, jrn2: 3, hr: [60, 61], fc: [60, 61, 62] };
  const CLES = ['sante', 'tabac', 'lastName', 'city', 'email', 'jrn1', 'jrn2', '"hr"', '"fc"', 'diabète', 'Dupont', 'x@y.fr'];
  const fuit = (c) => CLES.filter((k) => JSON.stringify(c.contents).includes(k));
  // v1 : un vrai tour, réponse brute ET réponse déjà « _adapte ».
  for (const marque of [false, true]) {
    const r = Object.assign({ qualite: 'good', recup: { scelle: Object.assign({ score: 74 }, secret) } }, secret, marque ? { _adapte: 1 } : {});
    const fil = suivi('Et ma récup ?').concat([
      { role: 'model', parts: [{ functionCall: { name: 'getRecoveryContext', args: {} }, thoughtSignature: 'sig-r' }] },
      { role: 'function', parts: [{ functionResponse: { name: 'getRecoveryContext', response: r } }] }]);
    const recus = geminiEnregistreur({ bloc: 'Réponse.' });
    await jouerCorps(question({ contents: fil }));
    const f = recus[0] ? fuit(recus[0].corps) : ['pas d\'appel'];
    v('v1' + (marque ? ', réponse marquée _adapte par le téléphone' : '') + ' : aucune clé interdite chez Gemini',
      f.length === 0 && JSON.stringify(recus[0].corps.contents).includes('"score":74'), f.join(','));
  }
  // v2 : getDay après l'instantané.
  ouvrirPorte();
  const filV2 = [{ role: 'user', parts: [{ text: 'Et le 10 ?' }] },
    { role: 'model', parts: [{ functionCall: { name: 'getDay', args: { jour: -6 } }, thoughtSignature: 'sig-d' }] },
    { role: 'user', parts: [{ functionResponse: { name: 'getDay', response: Object.assign({ q: 'good', profil: Object.assign({ age: 30 }, secret) }, secret) } }] }];
  const recusV2 = geminiEnregistreur({ bloc: 'Réponse.' });
  await jouerCorps({ deviceId: 'banc', langue: 'fr', ton: 'aucun', capacites: CAP_V2, instantane: INSTANTANE, natif: NATIF, contents: filV2 }, APPAREIL_V2);
  const f2 = recusV2[0] ? fuit(recusV2[0].corps) : ['pas d\'appel'];
  v('v2 (getDay) : aucune clé interdite chez Gemini, le reste passe', f2.length === 0
    && JSON.stringify(recusV2[0].corps.contents).includes('"age":30'), f2.join(','));
  fermerPorte();
}

console.log('\n═══ ⑰ UN TOUR D\'OUTILS DIFFUSÉ PORTE SES LIBELLÉS ET `v` ═══');
{
  const recus = geminiEnregistreur({ morceaux: [JSON.stringify({ candidates: [{ content: { parts: [
    { functionCall: { name: 'getSleepHistory', args: { joursN: 14 } }, thoughtSignature: 'sig-vraie' }] } }] })] });
  const { evs } = await jouerCorps(question({ flux: true, langue: 'en' }));
  const f = fin(evs);
  v('mode outils, libellés dans la langue de l\'app, `v`', f && f.mode === 'outils' && f.libelles
    && f.libelles.getSleepHistory === 'Reading your nights…' && f.v === handler.COACH_VERSION, JSON.stringify(f && f.libelles));
  v('  … la signature de Gemini revient intacte', f && f.tourModele.parts[0].thoughtSignature === 'sig-vraie');
  v('  … et le corps envoyé était propre', recus.length === 1 && propreDeFabrique(recus[0].corps));
}

global.fetch = vraiFetch;
console.log(`\n${vert} réussis, ${rouge} échoués`);
process.exitCode = rouge ? 1 : 0;

})();
