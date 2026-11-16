// FLINT — révoquer le jeton « Se connecter avec Apple » quand un compte est supprimé.
//
// ═══ 16 nov. 2026 — CE QU'APPLE DEMANDE, ET POURQUOI ICI ════════════════════
//
// La page d'Apple « Offering account deletion in your app » : une app qui
// propose Se connecter avec Apple doit, à la suppression du compte, RÉVOQUER
// les jetons de la personne par l'API REST d'Apple (`/auth/revoke`). Sans ça,
// FLINT reste dans « Apps utilisant ton compte Apple » chez quelqu'un qui a
// pourtant supprimé son compte. L'audit de l'app du 15 nov. l'a relevé : l'app
// n'envoyait pas le code qui permet de le faire.
//
// LE CHEMIN, EN TROIS PAS :
//   1. l'app redemande Se connecter avec Apple au moment de supprimer : elle
//      obtient un `authorizationCode` NEUF (valable cinq minutes, une fois) ;
//   2. ce serveur l'échange contre un jeton (`/auth/token`) ;
//   3. il révoque ce jeton (`/auth/revoke`) — c'est la révocation qui retire
//      FLINT du compte Apple de la personne.
//
// Les deux appels à Apple sont signés d'un « client secret » : un JWT ES256
// signé par la clé `.p8` de l'équipe (Certificates, Identifiers & Profiles →
// Keys → « Sign in with Apple »). AUCUNE clé n'est dans ce dépôt : elle vient
// de variables d'environnement que Dino ou Félix posent sur Vercel :
//
//   APPLE_TEAM_ID      l'identifiant de l'équipe (10 caractères)
//   APPLE_KEY_ID       l'identifiant de la clé .p8 (10 caractères)
//   APPLE_PRIVATE_KEY  le contenu du fichier .p8 (« -----BEGIN PRIVATE KEY----- … »)
//   APPLE_CLIENT_ID    l'identifiant de l'app — facultatif, `com.flintband.app` par défaut
//
// ⚠️ CE QUE CE FICHIER NE FAIT JAMAIS : écrire le code, un jeton ou la clé dans
// un journal ou une réponse. Les messages d'erreur ne portent que le nom
// d'erreur d'Apple (« invalid_grant ») ou le NOM d'une variable manquante.
//
// Zéro dépendance : `crypto` de Node signe l'ES256 (`dsaEncoding: 'ieee-p1363'`
// rend directement les 64 octets r‖s qu'exige un JWS), `fetch` est celui de Node.

const crypto = require('crypto');

const APPLE = 'https://appleid.apple.com';
const CLIENT_PAR_DEFAUT = 'com.flintband.app';
// Le secret client vit cinq minutes : il est refait à chaque suppression, et
// un secret court qui fuirait ne servirait plus à rien (Apple accepte six mois).
const DUREE_SECRET_S = 300;
// Deux appels à Apple, chacun borné : la suppression du compte, côté app,
// n'attend pas ce serveur au-delà de quelques secondes de toute façon.
const DELAI_APPEL_MS = 8000;

function base64url(octets) {
  return Buffer.from(octets).toString('base64')
    .replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}

/**
 * La configuration lue dans l'environnement. `manque` nomme ce qui n'est pas
 * posé (jamais une valeur) ; vide = tout est là.
 */
function lireConfiguration(env) {
  const e = env || process.env;
  const config = {
    equipe: (e.APPLE_TEAM_ID || '').trim(),
    cleId: (e.APPLE_KEY_ID || '').trim(),
    client: (e.APPLE_CLIENT_ID || '').trim() || CLIENT_PAR_DEFAUT,
    clePrivee: e.APPLE_PRIVATE_KEY || '',
  };
  const manque = [];
  if (!config.equipe) manque.push('APPLE_TEAM_ID');
  if (!config.cleId) manque.push('APPLE_KEY_ID');
  if (!config.clePrivee.trim()) manque.push('APPLE_PRIVATE_KEY');
  return { config, manque };
}

/**
 * Le fichier .p8, quelle que soit la façon dont il a été collé dans Vercel :
 * avec ses vrais sauts de ligne, avec des « \n » littéraux (ce que donne un
 * copier-coller sur une seule ligne), en base64 du fichier entier, ou le seul
 * corps base64 sans les lignes BEGIN/END. Rend un KeyObject, ou lève une
 * erreur SANS le contenu de la clé.
 */
function lireClePrivee(brute) {
  let texte = String(brute || '').trim().replace(/\\n/g, '\n').replace(/\r/g, '');
  if (!texte.includes('BEGIN')) {
    // Soit le fichier entier passé en base64, soit le seul corps de la clé.
    const decode = Buffer.from(texte.replace(/\s+/g, ''), 'base64').toString('utf8');
    if (decode.includes('BEGIN')) {
      texte = decode.trim();
    } else {
      const corps = texte.replace(/\s+/g, '').match(/.{1,64}/g) || [];
      texte = '-----BEGIN PRIVATE KEY-----\n' + corps.join('\n') + '\n-----END PRIVATE KEY-----';
    }
  }
  try {
    const cle = crypto.createPrivateKey({ key: texte, format: 'pem' });
    if (cle.asymmetricKeyType !== 'ec') throw new Error('type');
    return cle;
  } catch (e) {
    throw new Error('APPLE_PRIVATE_KEY illisible (attendu : le contenu du fichier .p8)');
  }
}

/**
 * Le « client secret » d'Apple : un JWT ES256.
 *   en-tête  { alg: ES256, kid: APPLE_KEY_ID }
 *   charge   { iss: APPLE_TEAM_ID, iat, exp, aud: https://appleid.apple.com, sub: client }
 */
function secretClient(config, maintenantS) {
  const iat = Math.floor(maintenantS != null ? maintenantS : Date.now() / 1000);
  const entete = { alg: 'ES256', kid: config.cleId };
  const charge = { iss: config.equipe, iat, exp: iat + DUREE_SECRET_S, aud: APPLE, sub: config.client };
  const aSigner = base64url(JSON.stringify(entete)) + '.' + base64url(JSON.stringify(charge));
  const cle = lireClePrivee(config.clePrivee);
  const signature = crypto.sign('sha256', Buffer.from(aSigner), { key: cle, dsaEncoding: 'ieee-p1363' });
  return aSigner + '.' + base64url(signature);
}

function formulaire(champs) {
  return Object.entries(champs)
    .map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v))
    .join('&');
}

async function poster(chemin, champs) {
  const f = global.fetch;
  const options = {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: formulaire(champs),
  };
  if (typeof AbortSignal !== 'undefined' && AbortSignal.timeout) options.signal = AbortSignal.timeout(DELAI_APPEL_MS);
  const reponse = await f(APPLE + chemin, options);
  let json = {};
  try { const t = await reponse.text(); json = t ? JSON.parse(t) : {}; } catch (e) { json = {}; }
  return { statut: reponse.status, ok: reponse.ok, json };
}

/** Le nom d'erreur d'Apple, borné à une forme sûre pour un journal. */
function nomErreur(json, statut) {
  const brut = json && typeof json.error === 'string' ? json.error : '';
  return /^[a-z_]{1,40}$/.test(brut) ? brut : 'http_' + statut;
}

/**
 * Le chemin complet : code → jeton → révocation.
 * Rend { revoque: true } ou { revoque: false, etape, raison } — jamais un jeton.
 */
async function revoquerDepuisCode(code, config, maintenantS) {
  let secret;
  try { secret = secretClient(config, maintenantS); }
  catch (e) { return { revoque: false, etape: 'configuration', raison: e.message }; }

  let echange;
  try {
    echange = await poster('/auth/token', {
      client_id: config.client,
      client_secret: secret,
      code,
      grant_type: 'authorization_code',
    });
  } catch (e) {
    return { revoque: false, etape: 'echange', raison: 'apple_injoignable' };
  }
  if (!echange.ok) return { revoque: false, etape: 'echange', raison: nomErreur(echange.json, echange.statut) };

  // Le jeton de rafraîchissement est celui qui porte l'autorisation ; Apple le
  // rend à chaque échange d'un code. À défaut, l'accès vaut aussi.
  const rafraichir = typeof echange.json.refresh_token === 'string' ? echange.json.refresh_token : '';
  const acces = typeof echange.json.access_token === 'string' ? echange.json.access_token : '';
  const jeton = rafraichir || acces;
  if (!jeton) return { revoque: false, etape: 'echange', raison: 'aucun_jeton' };

  let revocation;
  try {
    revocation = await poster('/auth/revoke', {
      client_id: config.client,
      client_secret: secret,
      token: jeton,
      token_type_hint: rafraichir ? 'refresh_token' : 'access_token',
    });
  } catch (e) {
    return { revoque: false, etape: 'revocation', raison: 'apple_injoignable' };
  }
  if (!revocation.ok) return { revoque: false, etape: 'revocation', raison: nomErreur(revocation.json, revocation.statut) };
  return { revoque: true };
}

module.exports = {
  APPLE, CLIENT_PAR_DEFAUT, DUREE_SECRET_S,
  lireConfiguration, lireClePrivee, secretClient, revoquerDepuisCode, base64url,
};
