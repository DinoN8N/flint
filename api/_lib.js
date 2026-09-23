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
  // ═══ 23 sept. 2026 — « signature refusée » SUR CHAQUE VRAIE QUESTION ═══════
  //
  // Dino, 18 h 40 : « le coach me répond signature refusée ». Mesuré dans la
  // foulée, trois requêtes signées avec la clé de l'app : un corps sans « / »
  // → 200 ; un corps avec « / » signé sur la canonique Node → 200 ; le MÊME
  // corps signé sur les octets que produit l'app → 401 « signature invalide ».
  //
  // La cause : `JSONSerialization` échappe le slash (« score 88\/100 »), pas
  // `JSON.stringify`. Le banc reproduisait `.sortedKeys` « octet pour octet »
  // sur un corps qui n'avait aucun slash — et `profilTexte` en porte toujours
  // un (« score \(s)/100 », CoachFlint.swift). Donc l'app hachait `\/`, le
  // serveur `/`, et le Coach n'a jamais répondu à personne.
  //
  // Le remède vit ICI, pas dans l'app : un correctif natif ne voyage pas, et
  // les octets bruts de la requête ne sont pas accessibles derrière l'analyse
  // JSON de Vercel. On accepte donc l'une OU l'autre écriture du même corps.
  const corps = corpsBrut || '';
  // Des octets bruts se signent tels quels ; une canonique (corps parsé) se
  // tente dans les deux écritures du slash.
  const variantes = Buffer.isBuffer(corps) ? [corps] : [corps, corps.replace(/\//g, '\\/')];
  const valide = variantes.some(v => {
    const empreinte = crypto.createHash('sha256').update(v).digest('hex');
    const attendu = crypto.createHmac('sha256', secret)
      .update(dev + '.' + ts + '.' + empreinte).digest('hex');
    return egalConstant(sig, attendu);
  });
  if (!valide) return { ok: false, raison: 'signature invalide' };
  return { ok: true };
}

function corpsJSON(req) {
  let body = req.body;
  if (Buffer.isBuffer(body)) body = body.toString('utf8');
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  return body && typeof body === 'object' ? body : {};
}

// ═══ LA CHAÎNE QUE LES DEUX BORDS SIGNENT ══════════════════════════════════
//
// ═══ 23 sept. 2026, 19 h — LA DEUXIÈME QUESTION RENDAIT « signature refusée »
//
// La première question passait (depuis le remède du slash, plus bas), la
// deuxième non : son historique porte les RÉPONSES DES OUTILS, et elles
// contiennent des flottants. Mesuré sur ce Mac, `JSONSerialization` contre
// `JSON.stringify` : `0.57` → `0.56999999999999995` (dix-sept chiffres),
// `1e-7` → `9.9999999999999995e-08`, `-0` → `-0` contre `0` ; et `.sortedKeys`
// trie par collation Unicode (`a` < `A` < `a_` < `a1`), pas par code-unit
// comme `Object.keys().sort()`. Le paragraphe qui suivait ici affirmait
// « aucun flottant » : c'était vrai du corps d'UNE question, pas d'une
// conversation. Émuler Foundation ici (%.17g, collation CF) serait une
// quatrième hypothèse à trahir.
//
// Le remède : SIGNER LES OCTETS REÇUS, ce que l'app a toujours voulu (« la
// signature couvre les octets ENVOYÉS », CoachReseau.swift). L'aide Node de
// Vercel parse le JSON quand le Content-Type est `application/json` — mais
// rend le Buffer INTACT pour `application/octet-stream` (et la chaîne pour
// `text/plain`). L'app envoie donc son JSON en octet-stream, et `corpsBrut`
// rend ces octets tels quels : aucune canonique, aucune hypothèse sur le
// sérialiseur d'en face. La forme canonique ci-dessous reste pour les corps
// parsés (application/json : bancs, anciennes apps), avec ses limites.
//
// ⚠️ Ce qu'on NE PEUT PAS faire : retrouver les octets derrière un `req.body`
// déjà objet — d'où le Content-Type côté app, et non un réglage serveur.
function canonique(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(canonique).join(',') + ']';
  const cles = Object.keys(v).sort();
  return '{' + cles.map(k => JSON.stringify(k) + ':' + canonique(v[k])).join(',') + '}';
}

function corpsBrut(req) {
  // Octets ou chaîne : le client les a envoyés tels quels (octet-stream,
  // text/plain), la signature les couvre tels quels. On ne les re-sérialise
  // PAS — c'était précisément le trou.
  if (Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === 'string') return req.body;
  try { return canonique(req.body); } catch (e) { return ''; }
}

// ── Gemini 3 : les réponses d'outils portent le rôle « user » ─────────────
//
// 23 sept. 2026, 19 h 55 — première conversation sur `gemini-3.6-flash` :
// le tour d'outils passe, le tour suivant rend 400 « Role 'function' is not
// supported. Please use a valid role: … USER, MODEL ». L'app (CoachReseau.swift)
// renvoie les réponses d'outils dans un tour `role: "function"`, la forme des
// premières versions de l'API que les 2.x toléraient. Normaliser ICI, et non
// dans l'app : un correctif natif ne voyage pas, et chaque paquet déjà posé
// ou sur l'App Store enverrait « function » jusqu'à sa prochaine version.
function roleFonctionVersUser(contents) {
  if (!Array.isArray(contents)) return contents;
  return contents.map(c => (c && typeof c === 'object' && c.role === 'function') ? Object.assign({}, c, { role: 'user' }) : c);
}

// ── Gemini : réessai, puis modèle de secours ────────────────────────────────
//
// ═══ 23 sept. 2026 — UN SEUL MODÈLE, ZÉRO REPLI : LE SCAN ET LE COACH TOMBAIENT
// ═══ ENSEMBLE
//
// Mesuré à 15 h 45 puis à 16 h 10, à un quart d'heure d'écart : `gemini-2.5-flash`
// répondait 503 « This model is currently experiencing high demand » aux deux
// endpoints, et chacun rendait un 502 sans rien tenter d'autre. Côté app, la
// chaîne brute « Gemini 503 » s'affichait à l'utilisateur. Dino, le même jour :
// « le scan alimentaire et la prise en photo de repas ne marchent pas ».
//
// Ce que fait cette fonction, et ce qu'elle ne fait PAS :
//
// · elle RÉESSAIE un statut passager (429, 500, 502, 503, 504, ou une panne
//   réseau) — deux tentatives par modèle, avec une attente courte entre les
//   deux, parce que la doc de Google dit elle-même que ces pointes sont
//   « usually temporary » ;
// · si le modèle reste indisponible, elle passe au SUIVANT de la liste, dans
//   l'ordre donné par l'appelant : le premier est celui qu'on veut, les autres
//   sont ceux qu'on accepte. La réponse dit quel modèle a fini par répondre ;
// · elle ne réessaie JAMAIS un 400, 401, 403 ou 404 : ceux-là disent que
//   c'est la requête qui est fausse (ou la clé), et le refaire trois fois sur
//   trois modèles ne ferait qu'aggraver une facture et masquer le défaut ;
// · chaque appel porte son propre délai : la fonction Vercel a un plafond
//   (120 s pour le scan, 60 s pour le Coach), et une tentative qui pend ne
//   doit pas manger le temps des suivantes.
//
// Rendu : { ok, status, json, texte, modele, tentatives, detail }. `ok` vaut
// vrai quand un modèle a rendu un 2xx ; sinon `status` et `detail` sont ceux de
// la DERNIÈRE réponse, pour que l'endpoint la remonte telle quelle.
const REESSAYABLES = new Set([429, 500, 502, 503, 504]);

async function appelerGemini({ key, modeles, corps, delaiMs, tentativesParModele, attenteMs }) {
  const liste = Array.isArray(modeles) && modeles.length ? modeles : ['gemini-3.6-flash'];
  const essaisMax = Math.max(1, tentativesParModele || 2);
  const attentes = Array.isArray(attenteMs) && attenteMs.length ? attenteMs : [600, 1500];
  const delai = Math.max(1000, delaiMs || 25000);
  let dernier = { ok: false, status: 0, texte: '', detail: 'aucune tentative' };
  let tentatives = 0;

  for (const modele of liste) {
    for (let essai = 0; essai < essaisMax; essai++) {
      tentatives++;
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${modele}:generateContent?key=${key}`;
      const ctrl = new AbortController();
      const minuteur = setTimeout(() => ctrl.abort(), delai);
      try {
        const r = await fetch(url, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(corps), signal: ctrl.signal
        });
        const texte = await r.text();
        if (r.ok) {
          let json = null;
          try { json = JSON.parse(texte); } catch (e) { json = null; }
          return { ok: true, status: r.status, json, texte, modele, tentatives };
        }
        dernier = { ok: false, status: r.status, texte, modele, tentatives,
                    detail: texte.slice(0, 400) };
        if (!REESSAYABLES.has(r.status)) return dernier;   // requête fausse : on ne s'acharne pas
      } catch (e) {
        dernier = { ok: false, status: 0, texte: '', modele, tentatives,
                    detail: (e && e.name === 'AbortError') ? `délai de ${delai} ms dépassé`
                                                           : String((e && e.message) || e).slice(0, 200) };
      } finally {
        clearTimeout(minuteur);
      }
      if (essai < essaisMax - 1) {
        await new Promise(res => setTimeout(res, attentes[Math.min(essai, attentes.length - 1)]));
      }
    }
    console.log(`[gemini] ${modele} indisponible après ${essaisMax} tentative(s) — statut ${dernier.status}, on passe au suivant`);
  }
  return dernier;
}

// ── Le plafond par personne et par jour — DORMANT tant qu'aucun magasin ──────
//
// ═══ 23 sept. 2026 — PRÉPARÉ POUR 10 000 PRÉCOMMANDES, PAS ENCORE ALLUMÉ ═══
//
// Le rate-limit ci-dessus vit en mémoire d'une instance Vercel : à dix
// instances il vaut dix fois moins, et il s'efface au démarrage à froid. Il
// protège contre une rafale, pas contre une facture — un client qui scanne
// mille fois dans la journée, à un rythme sage, ne rencontre aucun garde.
//
// Un plafond QUOTIDIEN exige un compteur partagé entre instances. Ici :
// Upstash Redis, par son API REST — un `fetch`, pas de paquet, comme tout le
// reste du dépôt. Deux variables d'environnement l'allument :
//
//     UPSTASH_REDIS_REST_URL     https://<nom>.upstash.io
//     UPSTASH_REDIS_REST_TOKEN   le jeton REST du magasin
//
// SANS elles, la fonction rend « pas de plafond » et ne coûte rien : c'est le
// choix de Dino (« on attend d'avoir vraiment le problème ») — le code est
// posé, l'interrupteur est une variable d'env, le jour J est un clic.
//
// Deux décisions qui ne se devinent pas :
// · FAIL-OPEN. Si le magasin est injoignable ou répond de travers, on laisse
//   PASSER et on l'écrit au journal. Un compteur en panne ne doit pas éteindre
//   le scan de tout le monde ; le plafond de dépense de Google reste derrière.
// · La journée est UTC. Le compteur porte la date dans sa clé et expire seul
//   au bout de 48 h ; personne n'a à le remettre à zéro.
//
// Rendu : { atteint, compte, max, actif }. `atteint` vrai = refuser (429).
async function plafondJournalier({ id, portee, max }) {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const jeton = process.env.UPSTASH_REDIS_REST_TOKEN;
  const plafond = Number(max) || 0;
  if (!url || !jeton || plafond <= 0) return { atteint: false, compte: 0, max: plafond, actif: false };

  const jour = new Date().toISOString().slice(0, 10);
  const cle = `flint:jour:${jour}:${portee}:${String(id).slice(0, 160)}`;
  try {
    const r = await fetch(url.replace(/\/$/, '') + '/pipeline', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + jeton, 'Content-Type': 'application/json' },
      body: JSON.stringify([['INCR', cle], ['EXPIRE', cle, 172800, 'NX']])
    });
    if (!r.ok) {
      console.log(`[plafond] magasin ${r.status} — on laisse passer (${portee})`);
      return { atteint: false, compte: 0, max: plafond, actif: true };
    }
    const j = await r.json();
    const compte = Number(Array.isArray(j) && j[0] && j[0].result);
    if (!Number.isFinite(compte)) {
      console.log(`[plafond] réponse illisible — on laisse passer (${portee})`);
      return { atteint: false, compte: 0, max: plafond, actif: true };
    }
    if (compte > plafond) console.log(`[plafond] ${portee} ${compte}/${plafond} — refusé pour ${String(id).slice(0, 12)}`);
    return { atteint: compte > plafond, compte, max: plafond, actif: true };
  } catch (e) {
    console.log(`[plafond] panne ${String((e && e.message) || e).slice(0, 80)} — on laisse passer (${portee})`);
    return { atteint: false, compte: 0, max: plafond, actif: true };
  }
}

module.exports = {
  cors, rateLimited, identiteRequete, ipRequete,
  verifierSecret, verifierSignature, corpsJSON, corpsBrut, canonique, egalConstant,
  appelerGemini, plafondJournalier, roleFonctionVersUser
};
