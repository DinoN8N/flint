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
const vraiFetch = global.fetch;
const handler = require(path.join(__dirname, '..', 'api', 'coach.js'));

const question = (extra) => Object.assign({
  deviceId: 'banc', langue: 'fr', ton: 'aucun', profilTexte: '', memoireTexte: '',
  contents: [{ role: 'user', parts: [{ text: 'Et ma VFC ?' }] }]
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

global.fetch = vraiFetch;
console.log(`\n${vert} réussis, ${rouge} échoués`);
process.exitCode = rouge ? 1 : 0;

})();
