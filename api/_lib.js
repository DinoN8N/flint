// FLINT — petites aides partagées entre les fonctions api/*.js.
// Factorisé depuis scan-meal.js (CORS, rate-limit par identité, secret d'app)
// au moment où coach-start.js/coach-continue.js en ont eu besoin aussi.
//
// ═══ 22 sept. 2026 — DURCISSEMENT ══════════════════════════════════════════
//
// Audit du backend du Coach demandé par Dino, puis : « je veux un 20 sur 20,
// fais le nécessaire ». Trois trous étaient ouverts ici, et ils sont fermés
// dans ce fichier. Ce qui suit dit lequel, et ce que chaque remède ne fait PAS
// — une protection dont on croit qu'elle protège plus qu'elle ne le fait est
// pire que pas de protection du tout.

const crypto = require('crypto');

// ── CORS ────────────────────────────────────────────────────────────────────
//
// ⚠️ PLUS DE `*` PAR DÉFAUT. Le Coach est appelé par l'application NATIVE
// (`CoachReseau.swift`, URLSession) : une requête native n'est pas soumise au
// CORS, donc l'en-tête ne lui sert à rien. Il ne servait qu'à une chose :
// autoriser n'importe quelle page web du monde à appeler l'endpoint depuis un
// navigateur. On ne l'ouvre donc qu'à qui en a besoin, explicitement.
function cors(res, options) {
  const o = options || {};
  if (o.origine) res.setHeader('Access-Control-Allow-Origin', o.origine);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers',
    'Content-Type, x-flint-key, x-flint-device, x-flint-ts, x-flint-sig'
    + (o.extra ? ', ' + o.extra : ''));
}

// ── Rate-limit ──────────────────────────────────────────────────────────────
//
// ⚠️ IL COMPTE SUR DEUX IDENTITÉS, ET C'EST LE CORRECTIF. Il n'indexait que
// `x-flint-device` — un en-tête FOURNI PAR LE CLIENT. Changer sa valeur à
// chaque requête remettait le compteur à zéro : la limite ne limitait personne
// de déterminé. L'IP, elle, ne se change pas d'un en-tête.
//
// Les deux comptent donc, et la plus stricte gagne : le device garde sa limite
// fine (un utilisateur ne gêne pas son voisin derrière le même NAT), l'IP pose
// un plafond qu'aucun en-tête ne contourne.
//
// CE QUE ÇA NE FAIT PAS, et il faut le savoir : la fenêtre vit en MÉMOIRE
// d'instance. Sur une fonction serverless, N instances = N compteurs, et un
// démarrage à froid remet à zéro. C'est un garde-fou de coût, pas un SLA. La
// vraie réponse est un magasin partagé (Vercel KV) : elle demande une
// dépendance et une clé, elle est notée au registre, elle n'est pas ici.
const RL = new Map();
const RL_WINDOW = 60000;

function compter(cle, max, now) {
  const arr = (RL.get(cle) || []).filter(t => now - t < RL_WINDOW);
  arr.push(now);
  RL.set(cle, arr);
  if (RL.size > 5000) {
    for (const k of RL.keys()) {
      if (!(RL.get(k) || []).some(t => now - t < RL_WINDOW)) RL.delete(k);
    }
  }
  return arr.length > max;
}

function rateLimited(id, max, options) {
  const o = options || {};
  const now = Date.now();
  const tropDevice = compter(id, max, now);
  // L'IP est passée à part : elle n'est pas l'identité de confort, elle est le
  // plafond dur. Par défaut trois fois la limite fine — plusieurs appareils
  // derrière un même NAT restent servis, un seul qui tourne en boucle non.
  const tropIP = o.ip ? compter('ip!' + o.ip, o.maxIP || max * 3, now) : false;
  return tropDevice || tropIP;
}

// L'identité de rate-limit : le device anonyme si présent (plus juste que
// l'IP — plusieurs utilisateurs derrière un même NAT ne se gênent plus),
// sinon l'IP en repli.
function identiteRequete(req) {
  const dev = (req.headers['x-flint-device'] || '').toString().trim();
  if (dev) return 'dev:' + dev.slice(0, 128);
  return 'ip:' + ipRequete(req);
}

function ipRequete(req) {
  return (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
}

// ── Le secret d'app ─────────────────────────────────────────────────────────
//
// ⚠️ FAIL-CLOSED, ET C'ÉTAIT LE PIRE DES TROIS. La forme d'avant était
// `if (secret && req.headers[...] !== secret)` : quand la variable
// d'environnement MANQUAIT, la condition tombait et la requête passait. Une
// API ouverte à tous, silencieusement, pour une variable oubliée — et c'était
// le cas de tous les déploiements Preview, où `FLINT_APP_SECRET` n'est pas
// défini (vérifié le 22 sept. : Production seulement).
//
// Une absence de configuration est maintenant une PANNE (503), pas une porte.
// On ne répond jamais « ok » quand on ne sait pas si on avait le droit.
//
// La comparaison est à temps constant : comparer deux secrets avec `!==` fuit
// leur préfixe commun par le temps de réponse. C'est marginal sur un réseau,
// ça ne coûte rien à faire juste.
function verifierSecret(req, res, options) {
  const o = options || {};
  const nom = o.nom || 'FLINT_APP_SECRET';
  const secret = process.env[nom];
  if (!secret) {
    res.status(503).json({ error: 'configuration serveur incomplète' });
    return false;
  }
  const fourni = (req.headers['x-flint-key'] || '').toString();
  if (!egalConstant(fourni, secret)) {
    res.status(401).json({ error: 'unauthorized' });
    return false;
  }
  return true;
}

function egalConstant(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) {
    // `timingSafeEqual` exige la même longueur : on compare quand même quelque
    // chose de la bonne taille pour ne pas répondre plus vite sur un mauvais
    // gabarit, puis on rend faux.
    crypto.timingSafeEqual(bb, bb);
    return false;
  }
  return crypto.timingSafeEqual(ba, bb);
}

// ── La signature de requête ─────────────────────────────────────────────────
//
// ⚠️ CE QU'ELLE RÈGLE : le secret d'app est dans le binaire de l'application ET
// il était publié en clair dans le HTML servi (le moteur web appelle
// `scan-meal` avec la même valeur). N'importe qui pouvait donc lire la page,
// prendre la clé, et appeler le Coach au frais du quota Gemini. La signature
// utilise un SECOND secret, propre au Coach, qui n'est publié nulle part — et
// elle horodate, donc une requête capturée ne se rejoue pas.
//
// ⚠️ CE QU'ELLE NE RÈGLE PAS, ET IL FAUT L'ÉCRIRE : le secret de signature vit
// dans le binaire de l'app. Qui le décompile l'obtient. La seule réponse
// sérieuse à ça est l'attestation d'appareil (App Attest / DeviceCheck), qui
// demande un service d'attestation et une clé Apple — c'est un chantier à
// part, noté au registre. Ce qu'on ferme ici, c'est l'attaque à dix secondes :
// lire une clé dans une page web et la rejouer avec curl.
//
// La signature couvre le corps ENTIER, l'appareil et l'horodatage : changer un
// octet de la question, ou rejouer la requête six minutes plus tard, invalide.
function verifierSignature(req, corpsBrut, options) {
  const o = options || {};
  const secret = process.env[o.nom || 'COACH_SIG_SECRET'];
  if (!secret) return { ok: false, raison: 'secret de signature absent' };

  const ts = (req.headers['x-flint-ts'] || '').toString();
  const sig = (req.headers['x-flint-sig'] || '').toString();
  if (!ts || !sig) return { ok: false, raison: 'signature absente' };

  const n = Number(ts);
  if (!Number.isFinite(n)) return { ok: false, raison: 'horodatage illisible' };
  const fenetre = (o.fenetreSecondes || 300) * 1000;
  if (Math.abs(Date.now() - n) > fenetre) return { ok: false, raison: 'horodatage périmé' };

  const dev = (req.headers['x-flint-device'] || '').toString();
  const empreinte = crypto.createHash('sha256').update(corpsBrut || '').digest('hex');
  const attendu = crypto.createHmac('sha256', secret)
    .update(dev + '.' + ts + '.' + empreinte).digest('hex');
  if (!egalConstant(sig, attendu)) return { ok: false, raison: 'signature invalide' };
  return { ok: true };
}

function corpsJSON(req) {
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  return body && typeof body === 'object' ? body : {};
}

// ═══ LA CHAÎNE QUE LES DEUX BORDS SIGNENT ══════════════════════════════════
//
// ⚠️ ON NE PEUT PAS SIGNER « LE CORPS REÇU » : Vercel a déjà parsé le JSON
// quand la fonction s'exécute, et re-sérialiser ne redonne pas les octets du
// client (ordre des clés, espaces). Les deux bords calculent donc la même forme
// CANONIQUE : clés triées à tous les niveaux, aucun espace. Côté app c'est
// `JSONSerialization` avec `.sortedKeys` ; ici c'est le tri récursif ci-dessous.
//
// Le choix tient parce que le corps du Coach ne contient que des chaînes, des
// tableaux et des objets — aucun flottant, seul cas où les deux langages
// pourraient écrire le même nombre différemment. Si un champ numérique
// non entier apparaît un jour, cette hypothèse est à revérifier : le banc
// `test-coach-api.js` compare une sortie Swift RÉELLE à celle-ci.
function canonique(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(canonique).join(',') + ']';
  const cles = Object.keys(v).sort();
  return '{' + cles.map(k => JSON.stringify(k) + ':' + canonique(v[k])).join(',') + '}';
}

function corpsBrut(req) {
  if (typeof req.body === 'string') {
    try { return canonique(JSON.parse(req.body)); } catch (e) { return req.body; }
  }
  if (Buffer.isBuffer(req.body)) {
    try { return canonique(JSON.parse(req.body.toString('utf8'))); } catch (e) { return ''; }
  }
  try { return canonique(req.body); } catch (e) { return ''; }
}

module.exports = {
  cors, rateLimited, identiteRequete, ipRequete,
  verifierSecret, verifierSignature, corpsJSON, corpsBrut, canonique, egalConstant
};
