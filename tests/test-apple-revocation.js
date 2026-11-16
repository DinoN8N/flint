// ═══════════════════════════════════════════════════════════════════════════
//  LE BANC DE LA RÉVOCATION APPLE — 16 nov. 2026
//
//  `node tests/test-apple-revocation.js`
//
//  Il exerce les VRAIS fichiers (`api/_apple.js` directement,
//  `api/apple-revocation.js` par son handler) avec un faux `fetch` qui joue
//  Apple. Aucune vraie clé, aucun réseau : la clé .p8 est fabriquée ici, jetable,
//  et chaque `process.env` posé est un décor de banc, rendu à la fin.
//
//  Ce qu'il garde :
//   ① le client secret : un JWT ES256 que la clé publique vérifie, avec les
//     bons kid / iss / sub / aud / iat / exp ;
//   ② la clé .p8 collée de quatre façons (sauts de ligne, « \n » littéraux,
//     base64 du fichier, corps seul) ; une clé illisible ne fuit pas ;
//   ③ le chemin heureux : /auth/token puis /auth/revoke, les bons champs ;
//   ④ chaque panne rend une réponse honnête SANS bloquer : variable manquante
//     (nommée au journal, Apple jamais appelé), code refusé, révocation
//     refusée, Apple injoignable ;
//   ⑤ la porte : méthode, clé d'app, code mal formé, débit ;
//   ⑥ rien de secret ne sort : ni le code, ni un jeton, ni la clé, ni le
//     secret client, dans le journal comme dans les réponses.
// ═══════════════════════════════════════════════════════════════════════════

const path = require('path');
const crypto = require('crypto');
const apple = require(path.join(__dirname, '..', 'api', '_apple.js'));
const handler = require(path.join(__dirname, '..', 'api', 'apple-revocation.js'));
const vraiFetch = global.fetch;
const envAvant = { ...process.env };

let vert = 0, rouge = 0;
function v(titre, ok, detail) {
  if (ok) { vert++; console.log('  ✅ ' + titre); }
  else { rouge++; console.log('  ❌ ' + titre + (detail ? '   ' + detail : '')); }
}

function fauxRes() {
  const r = { code: null, corps: null, entetes: {}, fini: false };
  r.setHeader = (k, val) => { r.entetes[k] = val; };
  r.status = (c) => { r.code = c; return r; };
  r.json = (o) => { r.corps = o; return r; };
  r.end = () => { r.fini = true; return r; };
  return r;
}
let ipSuivante = 1;
function fauxReq(corps, entetes, methode) {
  // Une IP par requête : le débit ne se mêle pas d'un cas à l'autre (sauf ⑤).
  const e = Object.assign({ 'x-forwarded-for': '10.0.0.' + (ipSuivante++), 'x-flint-device': 'BANC-' + ipSuivante }, entetes || {});
  return { method: methode || 'POST', headers: e, body: corps === undefined ? {} : corps };
}
async function capterJournal(fn) {
  const lignes = [];
  const orig = console.log;
  console.log = (...a) => lignes.push(a.join(' '));
  try { await fn(); } finally { console.log = orig; }
  return lignes;
}
function decoderSegment(s) {
  return JSON.parse(Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
}

// ── Le décor : une clé .p8 jetable, comme celle qu'Apple fait télécharger ───
const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const P8 = privateKey.export({ format: 'pem', type: 'pkcs8' }).toString();
const CODE = 'c0de.0.banc.Zq9-AbCdEfGhIjKlMnOpQrStUvWxYz012345';
const RT = 'r.banc-refresh-token-0123456789';
const AT = 'a.banc-access-token-9876543210';

function poserEnv(sansCle) {
  process.env.APPLE_TEAM_ID = 'EQUIPE0001';
  process.env.APPLE_KEY_ID = 'CLEID00001';
  process.env.APPLE_PRIVATE_KEY = P8;
  delete process.env.APPLE_CLIENT_ID;
  delete process.env.FLINT_APP_SECRET;
  if (sansCle) delete process.env[sansCle];
}

/** Un faux Apple : `scenario` décide des réponses ; chaque appel est noté. */
function fauxApple(scenario) {
  const appels = [];
  global.fetch = async (url, options) => {
    const champs = Object.fromEntries(new URLSearchParams(options.body));
    appels.push({ url, champs, options });
    const rep = scenario(url, champs, appels.length);
    if (rep instanceof Error) throw rep;
    return {
      status: rep.status, ok: rep.status >= 200 && rep.status < 300,
      text: async () => (rep.json === undefined ? '' : JSON.stringify(rep.json)),
    };
  };
  return appels;
}
const heureux = (url) => url.endsWith('/auth/token')
  ? { status: 200, json: { access_token: AT, token_type: 'Bearer', expires_in: 3600, refresh_token: RT, id_token: 'x.y.z' } }
  : { status: 200 };

(async () => {

console.log('\n═══ ① LE CLIENT SECRET EST UN JWT ES256 QU\'APPLE ACCEPTERAIT ═══');
{
  const config = { equipe: 'EQUIPE0001', cleId: 'CLEID00001', client: 'com.flintband.app', clePrivee: P8 };
  const jwt = apple.secretClient(config, 1_800_000_000);
  const [h, c, s] = jwt.split('.');
  const entete = decoderSegment(h), charge = decoderSegment(c);
  v('en-tête : alg ES256 et kid = APPLE_KEY_ID', entete.alg === 'ES256' && entete.kid === 'CLEID00001', JSON.stringify(entete));
  v('charge : iss = équipe, sub = client, aud = appleid.apple.com',
    charge.iss === 'EQUIPE0001' && charge.sub === 'com.flintband.app' && charge.aud === 'https://appleid.apple.com', JSON.stringify(charge));
  v('charge : iat posé, exp cinq minutes plus tard (≤ six mois)', charge.iat === 1_800_000_000 && charge.exp === 1_800_000_300);
  const sig = Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
  v('signature : 64 octets r‖s (format JWS, pas DER)', sig.length === 64, 'longueur ' + sig.length);
  v('signature : vérifiée par la clé publique', crypto.verify('sha256', Buffer.from(h + '.' + c), { key: publicKey, dsaEncoding: 'ieee-p1363' }, sig));
  v('base64url : ni « = », ni « + », ni « / »', !/[=+/]/.test(jwt));
}

console.log('\n═══ ② LA CLÉ .p8, COLLÉE DE QUATRE FAÇONS ═══');
{
  const corps = P8.replace(/-----[A-Z ]+-----/g, '').replace(/\s+/g, '');
  const formes = {
    'avec ses vrais sauts de ligne': P8,
    'sur une ligne, avec des « \\n » littéraux': P8.trim().replace(/\n/g, '\\n'),
    'le fichier entier en base64': Buffer.from(P8).toString('base64'),
    'le corps seul, sans BEGIN/END': corps,
  };
  for (const [nom, forme] of Object.entries(formes)) {
    let ok = false;
    try { ok = apple.lireClePrivee(forme).asymmetricKeyType === 'ec'; } catch (e) { ok = false; }
    v(nom, ok);
  }
  let message = '';
  try { apple.lireClePrivee('-----BEGIN PRIVATE KEY-----\nceci-nest-pas-une-cle\n-----END PRIVATE KEY-----'); }
  catch (e) { message = e.message; }
  v('une clé illisible lève une erreur qui nomme la variable, sans recopier la clé',
    message.includes('APPLE_PRIVATE_KEY') && !message.includes('ceci-nest-pas'), message);
  const rsa = crypto.generateKeyPairSync('rsa', { modulusLength: 1024 }).privateKey.export({ format: 'pem', type: 'pkcs8' }).toString();
  let refuse = false;
  try { apple.lireClePrivee(rsa); } catch (e) { refuse = true; }
  v('une clé RSA (pas une .p8 d\'Apple) est refusée', refuse);
}

console.log('\n═══ ③ LE CHEMIN HEUREUX : ÉCHANGE PUIS RÉVOCATION ═══');
{
  poserEnv();
  const appels = fauxApple(heureux);
  const res = fauxRes();
  const lignes = await capterJournal(() => handler(fauxReq({ authorizationCode: CODE }), res));
  v('200 { revoque: true }', res.code === 200 && res.corps && res.corps.revoque === true, JSON.stringify(res.corps));
  v('deux appels, dans l\'ordre : /auth/token puis /auth/revoke',
    appels.length === 2 && appels[0].url === 'https://appleid.apple.com/auth/token' && appels[1].url === 'https://appleid.apple.com/auth/revoke',
    appels.map(a => a.url).join(' , '));
  const t = appels[0] ? appels[0].champs : {};
  v('échange : client_id par défaut com.flintband.app, code, grant_type authorization_code',
    t.client_id === 'com.flintband.app' && t.code === CODE && t.grant_type === 'authorization_code', JSON.stringify(Object.keys(t)));
  v('échange : client_secret est un JWT à trois segments', typeof t.client_secret === 'string' && t.client_secret.split('.').length === 3);
  v('échange : en formulaire (application/x-www-form-urlencoded)',
    appels[0] && appels[0].options.headers['Content-Type'] === 'application/x-www-form-urlencoded');
  const r = appels[1] ? appels[1].champs : {};
  v('révocation : le jeton de RAFRAÎCHISSEMENT, avec son indice', r.token === RT && r.token_type_hint === 'refresh_token', JSON.stringify(r.token_type_hint));
  v('révocation : même client_id, même secret', r.client_id === t.client_id && r.client_secret === t.client_secret);
  v('une seule ligne de journal, qui dit « révoqué »', lignes.length === 1 && /révoqué/.test(lignes[0]), lignes.join(' | '));

  process.env.APPLE_CLIENT_ID = 'com.autre.app';
  const appels2 = fauxApple(heureux);
  await capterJournal(() => handler(fauxReq({ authorizationCode: CODE }), fauxRes()));
  v('APPLE_CLIENT_ID posé : c\'est lui qui part', appels2[0] && appels2[0].champs.client_id === 'com.autre.app');
  delete process.env.APPLE_CLIENT_ID;

  const appels3 = fauxApple((url) => url.endsWith('/auth/token') ? { status: 200, json: { access_token: AT } } : { status: 200 });
  const res3 = fauxRes();
  await capterJournal(() => handler(fauxReq({ authorizationCode: CODE }), res3));
  v('sans jeton de rafraîchissement : le jeton d\'accès est révoqué, avec son indice',
    res3.code === 200 && appels3[1] && appels3[1].champs.token === AT && appels3[1].champs.token_type_hint === 'access_token');

  const res4 = fauxRes();
  const appels4 = fauxApple(heureux);
  await capterJournal(() => handler(fauxReq(JSON.stringify({ authorizationCode: '  ' + CODE + ' ' })), res4));
  v('un corps en chaîne JSON et un code entouré d\'espaces passent', res4.code === 200 && appels4[0] && appels4[0].champs.code === CODE);
}

console.log('\n═══ ④ CHAQUE PANNE RÉPOND HONNÊTEMENT, SANS JAMAIS BLOQUER ═══');
{
  for (const variable of ['APPLE_TEAM_ID', 'APPLE_KEY_ID', 'APPLE_PRIVATE_KEY']) {
    poserEnv(variable);
    const appels = fauxApple(heureux);
    const res = fauxRes();
    const lignes = await capterJournal(() => handler(fauxReq({ authorizationCode: CODE }), res));
    v(variable + ' absente : 503 « configuration », Apple jamais appelé, le journal la NOMME',
      res.code === 503 && res.corps.raison === 'configuration' && appels.length === 0
      && lignes.length === 1 && lignes[0].includes(variable) && /quand même/.test(lignes[0]),
      res.code + ' ' + appels.length + ' ' + lignes.join(' | '));
  }
  poserEnv(); delete process.env.APPLE_TEAM_ID; delete process.env.APPLE_KEY_ID;
  const lignesDeux = await capterJournal(() => handler(fauxReq({ authorizationCode: CODE }), fauxRes()));
  v('deux variables absentes : les deux sont nommées', lignesDeux[0] && lignesDeux[0].includes('APPLE_TEAM_ID') && lignesDeux[0].includes('APPLE_KEY_ID'));

  poserEnv(); process.env.APPLE_PRIVATE_KEY = 'pas-une-cle';
  const appelsCle = fauxApple(heureux);
  const resCle = fauxRes();
  const lignesCle = await capterJournal(() => handler(fauxReq({ authorizationCode: CODE }), resCle));
  v('clé illisible : 503 « configuration », Apple jamais appelé, la clé n\'est pas recopiée',
    resCle.code === 503 && appelsCle.length === 0 && !lignesCle.join(' ').includes('pas-une-cle'), lignesCle.join(' | '));

  poserEnv();
  const appels5 = fauxApple((url) => url.endsWith('/auth/token') ? { status: 400, json: { error: 'invalid_grant' } } : { status: 200 });
  const res5 = fauxRes();
  const lignes5 = await capterJournal(() => handler(fauxReq({ authorizationCode: CODE }), res5));
  v('code périmé ou déjà servi : 502 invalid_grant, la révocation n\'est pas tentée',
    res5.code === 502 && res5.corps.raison === 'invalid_grant' && appels5.length === 1, JSON.stringify(res5.corps));
  v('… et le journal dit l\'étape et l\'erreur d\'Apple', lignes5[0] && lignes5[0].includes('echange') && lignes5[0].includes('invalid_grant'));

  const appels6 = fauxApple((url) => url.endsWith('/auth/token') ? heureux(url) : { status: 400, json: { error: 'invalid_client' } });
  const res6 = fauxRes();
  const lignes6 = await capterJournal(() => handler(fauxReq({ authorizationCode: CODE }), res6));
  v('révocation refusée : 502 invalid_client, étape « revocation » au journal',
    res6.code === 502 && res6.corps.raison === 'invalid_client' && appels6.length === 2 && lignes6[0].includes('revocation'));

  fauxApple(() => new Error('ECONNRESET'));
  const res7 = fauxRes();
  await capterJournal(() => handler(fauxReq({ authorizationCode: CODE }), res7));
  v('Apple injoignable : 502 apple_injoignable, pas d\'exception', res7.code === 502 && res7.corps.raison === 'apple_injoignable');

  fauxApple((url) => url.endsWith('/auth/token') ? { status: 200, json: {} } : { status: 200 });
  const res8 = fauxRes();
  await capterJournal(() => handler(fauxReq({ authorizationCode: CODE }), res8));
  v('échange sans aucun jeton : 502 aucun_jeton', res8.code === 502 && res8.corps.raison === 'aucun_jeton');

  fauxApple((url) => url.endsWith('/auth/token') ? { status: 500, json: { error: '<script>alert(1)</script>' } } : { status: 200 });
  const res9 = fauxRes();
  await capterJournal(() => handler(fauxReq({ authorizationCode: CODE }), res9));
  v('une erreur d\'Apple hors forme n\'est pas recopiée : http_500', res9.code === 502 && res9.corps.raison === 'http_500', JSON.stringify(res9.corps));
}

console.log('\n═══ ⑤ LA PORTE ═══');
{
  poserEnv();
  fauxApple(heureux);
  const get = fauxRes(); await handler(fauxReq(undefined, {}, 'GET'), get);
  v('GET : 405', get.code === 405);
  const opt = fauxRes(); await handler(fauxReq(undefined, {}, 'OPTIONS'), opt);
  v('OPTIONS : 204, et aucune origine web autorisée', opt.code === 204 && !opt.entetes['Access-Control-Allow-Origin']);
  v('en-têtes de sûreté posés (no-store, nosniff)', opt.entetes['Cache-Control'] === 'no-store' && opt.entetes['X-Content-Type-Options'] === 'nosniff');
  for (const [nom, corps] of [['sans code', {}], ['code vide', { authorizationCode: '' }], ['code trop court', { authorizationCode: 'abc' }],
                              ['code avec un espace', { authorizationCode: 'abc def ghi jkl' }], ['code de 2 000 caractères', { authorizationCode: 'a'.repeat(2000) }],
                              ['code qui n\'est pas une chaîne', { authorizationCode: 12345678901 }]]) {
    const r = fauxRes(); await handler(fauxReq(corps), r);
    v(nom + ' : 400', r.code === 400, String(r.code));
  }
  const dev = fauxRes(); await handler(fauxReq({ authorizationCode: CODE }, { 'x-flint-device': 'pas un device\n' }), dev);
  v('x-flint-device hors forme : 400', dev.code === 400);

  process.env.FLINT_APP_SECRET = 'cle-app-de-banc';
  const sans = fauxRes(); await capterJournal(() => handler(fauxReq({ authorizationCode: CODE }), sans));
  v('FLINT_APP_SECRET posé, x-flint-key absente : 401', sans.code === 401);
  const fausse = fauxRes(); await capterJournal(() => handler(fauxReq({ authorizationCode: CODE }, { 'x-flint-key': 'autre' }), fausse));
  v('… x-flint-key fausse : 401', fausse.code === 401);
  const bonne = fauxRes(); await capterJournal(() => handler(fauxReq({ authorizationCode: CODE }, { 'x-flint-key': 'cle-app-de-banc' }), bonne));
  v('… x-flint-key juste : 200', bonne.code === 200);
  delete process.env.FLINT_APP_SECRET;

  // Le débit : même appareil, même IP.
  const memes = { 'x-forwarded-for': '10.9.9.9', 'x-flint-device': 'BANC-DEBIT' };
  const codes = [];
  for (let i = 0; i < 12; i++) {
    const r = fauxRes();
    await capterJournal(() => handler({ method: 'POST', headers: memes, body: { authorizationCode: CODE } }, r));
    codes.push(r.code);
  }
  v('dix essais par minute et par appareil, le onzième : 429', codes.slice(0, 10).every(c => c === 200) && codes[10] === 429, codes.join(','));
}

console.log('\n═══ ⑥ RIEN DE SECRET NE SORT ═══');
{
  poserEnv();
  const secrets = [CODE, RT, AT, P8.split('\n')[1], 'CLEID00001.'];
  const tout = [];
  const scenarios = [heureux,
    (url) => url.endsWith('/auth/token') ? { status: 400, json: { error: 'invalid_grant' } } : { status: 200 },
    (url) => url.endsWith('/auth/token') ? heureux(url) : { status: 400, json: { error: 'invalid_client' } }];
  for (const s of scenarios) {
    const appels = fauxApple(s);
    const r = fauxRes();
    const lignes = await capterJournal(() => handler(fauxReq({ authorizationCode: CODE }), r));
    tout.push(...lignes, JSON.stringify(r.corps));
    // Le secret client, propre à chaque appel, ne doit pas sortir non plus.
    if (appels[0]) secrets.push(appels[0].champs.client_secret);
  }
  const fuite = secrets.filter(s => s && tout.some(t => t.includes(s)));
  v('ni le code, ni un jeton, ni la clé, ni le secret client dans le journal ou les réponses', fuite.length === 0, fuite.map(f => f.slice(0, 12)).join(', '));
}

global.fetch = vraiFetch;
for (const k of Object.keys(process.env)) if (!(k in envAvant)) delete process.env[k];
Object.assign(process.env, envAvant);

console.log(`\n${vert} vert(s), ${rouge} rouge(s).`);
process.exitCode = rouge ? 1 : 0;
})();
