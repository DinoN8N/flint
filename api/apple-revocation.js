// FLINT — POST /api/apple-revocation
//
// 16 nov. 2026 — l'app l'appelle au moment de SUPPRIMER un compte relié à Apple,
// avec un `authorizationCode` tout neuf (voir `_apple.js` pour le chemin et les
// variables d'environnement). La suppression du compte elle-même ne passe PAS
// par ici : elle reste la fonction Postgres `supprimer_mon_compte()`, appelée
// par l'app avec son jeton de session, sans secret (CompteReseau.swift).
//
// ═══ CE QUI NE DOIT JAMAIS ARRIVER : QU'UNE PANNE ICI EMPÊCHE DE SUPPRIMER ═══
//
// L'app appelle cette route AVANT la suppression, attend au plus quelques
// secondes, et supprime le compte QUOI QU'IL ARRIVE ici : variable manquante,
// Apple qui refuse, réseau coupé. Cette route ne fait donc que répondre
// honnêtement et écrire UNE ligne de journal qui dit ce qui s'est passé :
//
//   200 { revoque: true }                         — FLINT retiré du compte Apple
//   503 { revoque: false, raison: 'configuration' } — une variable manque (le journal la NOMME)
//   502 { revoque: false, raison: '<erreur Apple>' } — Apple a refusé ou ne répond pas
//   400 / 401 / 405 / 429                          — requête mal formée, clé d'app, méthode, débit
//
// La porte : le même `x-flint-key` que le scan (publique par conception, elle
// arrête les robots qui balaient les adresses), exigée seulement si
// `FLINT_APP_SECRET` est posé — une variable oubliée ne doit pas transformer
// une suppression en échec. Pas de CORS : seule l'app native appelle.
//
// Pourquoi pas de jeton de session exigé : le code d'Apple EST la preuve. Il
// n'est délivré qu'à NOTRE app, pour la personne qui vient de confirmer sur son
// iPhone, une seule fois, pendant cinq minutes. Quelqu'un qui en détient un ne
// peut révoquer que sa propre autorisation.

const {
  cors, rateLimited, identiteRequete, ipRequete, deviceIllisible, corpsJSON, egalConstant,
} = require('./_lib');
const apple = require('./_apple');

// Un compte se supprime une fois : dix essais par minute et par appareil
// suffisent largement (un doigt qui recommence après une erreur réseau).
const RL_MAX = 10;
const RL_MAX_IP = 30;
// Un code d'Apple tient en quelques dizaines de caractères ASCII imprimables.
const CODE_FORME = /^[\x21-\x7E]{8,1024}$/;

function journal(ligne) {
  console.log('[apple-revocation] ' + ligne);
}

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (deviceIllisible(req)) return res.status(400).json({ error: 'en-tête x-flint-device illisible' });

  const ip = ipRequete(req);
  if (rateLimited('apple!' + identiteRequete(req), RL_MAX, { ip: 'apple:' + ip, maxIP: RL_MAX_IP })) {
    return res.status(429).json({ error: 'Trop de requêtes, réessaie dans une minute.' });
  }

  const secretApp = process.env.FLINT_APP_SECRET;
  if (secretApp && !egalConstant((req.headers['x-flint-key'] || '').toString(), secretApp)) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const corps = corpsJSON(req);
  const code = typeof corps.authorizationCode === 'string' ? corps.authorizationCode.trim() : '';
  if (!CODE_FORME.test(code)) return res.status(400).json({ error: 'authorizationCode manquant ou illisible' });

  const { config, manque } = apple.lireConfiguration(process.env);
  if (manque.length) {
    journal('révocation SAUTÉE — variable(s) manquante(s) : ' + manque.join(', ')
            + ' (la suppression du compte se fait quand même, côté app)');
    return res.status(503).json({ revoque: false, raison: 'configuration' });
  }

  const issue = await apple.revoquerDepuisCode(code, config);
  if (issue.revoque) {
    journal('jeton Apple révoqué (' + config.client + ')');
    return res.status(200).json({ revoque: true });
  }
  journal('révocation ÉCHOUÉE à l\'étape « ' + issue.etape + ' » : ' + issue.raison
          + ' (la suppression du compte se fait quand même, côté app)');
  if (issue.etape === 'configuration') return res.status(503).json({ revoque: false, raison: 'configuration' });
  return res.status(502).json({ revoque: false, raison: issue.raison });
};
