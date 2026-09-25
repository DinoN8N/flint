// FLINT Coach — orchestrateur (Gemini function calling), sans état.
//
// Contrat (POST, JSON) :
//   requête  { deviceId, contents: [...tours Gemini déjà échangés...], ton, langue, flux,
//              profilTexte, memoireTexte,
//              capacites?, instantane?, natif?, faits?, memos? }      ← app v2 (25 sept.)
//   réponse  { mode:'outils', appels:[{name,args}], tourModele:{...}, libelles, v, appelsGemini }
//         ou { mode:'reponse', texte, suites, tourModele:{...}, memo, retenir (v2), v, appelsGemini }
//
// ═══ 25 SEPT. 2026 — COACH V2 : UNE QUESTION, UNE REQUÊTE GEMINI ═══════════
//
// Sur une question NOUVELLE, ce serveur ne demande rien à Gemini : il rend
// lui-même un tour d'outils fabriqué (`prechargement`, _coach-histoire.js),
// le téléphone l'exécute avec ses moteurs (0 requête Gemini) et rappelle. Les
// résultats partent dans l'instruction système, rendus en unités d'écran ;
// l'app v2, elle, envoie d'emblée son instantané. `v` dit quelle version du
// serveur a répondu ; `appelsGemini`, combien d'appels Gemini la requête a
// coûtés (le même nombre que `gemini=` au journal) — pour `outils/rejeu-coach.js`.
//
// ⚠️ LE RETRAIT DES TOURS FABRIQUÉS NE S'ENLÈVE NI NE SE CONTOURNE.
// `preparerPourGemini` passe sur `contents` AVANT que gReq soit bâti, et gReq
// est le SEUL corps envoyé à Gemini : branche JSON, flux, et repli du flux.
// Ces tours n'ont pas de vraie thoughtSignature ; s'ils atteignaient Gemini 3,
// il pourrait répondre 400 et le fil serait mort pour de bon.
//
// ⚠️ NE JAMAIS REDÉPLOYER UN coach.js ANTÉRIEUR À `COACH_VERSION` 2026-09-25.1.
// Les téléphones gardent ces tours fabriqués POUR TOUJOURS dans leurs fils ;
// une version d'avant les enverrait tels quels à Gemini. On corrige en avançant.
//
// `memoireTexte` (Phase 2) : les faits que l'utilisateur a confiés lors de
// conversations précédentes (« déteste le poisson », « prépare un semi en
// mars »). Le client les charge depuis son stockage local (CoachMemoire.swift)
// et les renvoie en clair à chaque tour — ce serveur ne les stocke toujours
// pas. Le modèle peut en AJOUTER via l'outil saveMemoryFact ; c'est le
// téléphone qui écrit, jamais ce serveur.
//
// `contents` est entièrement porté par le client (voir CoachReseau.swift) :
// ce endpoint ne stocke jamais rien — aucune conversation, aucune donnée de
// santé ne repose sur ce serveur, même transitoirement au-delà d'une requête.
//
// Un tour : le premier appel envoie {role:'user', parts:[{text:message}]}.
// Si Gemini répond par un ou plusieurs `functionCall`, on les renvoie tels
// quels — c'est au téléphone d'exécuter les outils avec ses propres moteurs
// (voir CoachOutils.swift) et de rappeler ce même endpoint avec `contents`
// complété par le tour modèle + un tour {role:'function', parts:[functionResponse...]}.
//
// v1 : un seul aller Gemini par appel HTTP (pas de relance de token-streaming
// serveur) — le texte final revient d'un bloc, le client le révèle en douceur
// côté UI. Une vraie diffusion par jeton pourra remplacer ceci plus tard sans
// changer le contrat côté iOS (même forme de réponse).

const { cors, rateLimited, identiteRequete, ipRequete, deviceIllisible, deviceRequete,
        verifierSecret, verifierSignature, corpsJSON, corpsBrut, appelerGemini,
        ouvrirGeminiFlux, partsDuFlux, plafondJournalier, sansCle } = require('./_lib');
const { LIBELLES, outilsPour } = require('./_coach-tools');
const { promptSysteme, LANGUES, TONS } = require('./_coach-prompt');
const { adapterReponse, nettoyerReponse, rendreDonneesV1 } = require('./_coach-adaptateurs');
const { MARQUEUR, estNouvelleQuestion, derniereQuestion, prechargement, preparerPourGemini,
        extraireMeta, partieSureMeta, memoDe, estTourQuestion } = require('./_coach-histoire');
const { validerInstantane, validerNatif, rendreInstantane, rendreJson, rendreFaits,
        rendreMemos, estAnodin } = require('./_coach-instantane');

// La version de CE fichier, rendue en `v` dans chaque réponse 200 et chaque
// `fin` : `rejeu-coach.js --sonde` vérifie que la production sert bien celle-ci.
// ⚠️ Plancher : aucune version antérieure à 2026-09-25.1 ne doit revenir en
// production (voir l'en-tête).
const COACH_VERSION = '2026-09-25.1';

// ═══ 24 SEPT. 2026 — LA TAILLE DU CORPS, MESURÉE PUIS BORNÉE ═════════════════
//
// `contents.length ≤ 60` bornait le NOMBRE de tours, pas leur poids : un tour
// de 4 Mo passait. Mesuré ce jour (tests/mesure de conversation, 60 tours :
// 15 questions, 15 réponses de 2 000 caractères, 15 tours d'outils dont trois
// avec 30 nuits + 90 jours d'activités) : 107 Ko. Si CHAQUE tour d'outils
// portait les deux historiques lourds, ~340 Ko ; la plus grosse part mesurée
// (30 nuits) pèse 12 Ko. Bornes : 768 Ko pour le corps entier (2× le pire
// cas légitime, 7× le cas réel), 64 Ko par part (5× la plus grosse mesurée),
// 16 parts par tour. Au-delà : 413, une phrase que l'app affiche telle quelle.
// Vercel coupe de toute façon à 4,5 Mo — mais entre 768 Ko et 4,5 Mo, c'est
// Gemini qui facturait, au jeton.
const CORPS_MAX_OCTETS = 768 * 1024;
const PART_MAX_OCTETS = 64 * 1024;
const PARTS_MAX_PAR_TOUR = 16;

function tailleCorps(req) {
  const b = req.body;
  if (Buffer.isBuffer(b)) return b.length;
  if (typeof b === 'string') return Buffer.byteLength(b, 'utf8');
  // Déjà parsé par Vercel : le coût réseau est payé, on borne quand même ce
  // qu'on renverrait à Gemini.
  try { return Buffer.byteLength(JSON.stringify(b == null ? '' : b), 'utf8'); } catch (e) { return 0; }
}

/** Rend une raison si un tour de `contents` est hors gabarit, sinon ''. */
function tourHorsGabarit(contents) {
  for (const tour of contents) {
    if (!tour || typeof tour !== 'object') return 'tour illisible';
    const parts = tour.parts;
    if (!Array.isArray(parts)) return 'tour sans parts';
    if (parts.length > PARTS_MAX_PAR_TOUR) return 'trop de parts dans un tour';
    for (const p of parts) {
      let n = 0;
      try { n = Buffer.byteLength(JSON.stringify(p == null ? '' : p), 'utf8'); } catch (e) { return 'part illisible'; }
      if (n > PART_MAX_OCTETS) return 'part trop lourde';
    }
  }
  return '';
}

// ═══ 25 SEPT. 2026 — UNE RÉPONSE D'OUTIL TROP LOURDE S'ALLÈGE, ELLE NE TUE PLUS LE FIL
//
// Deux 413 vus en production, tous deux des RÉPONSES D'OUTILS : getSleepHistory(30)
// à 86 Ko (au-dessus des 64 Ko par part), et getUserProfile qui portait la photo
// de profil (`avatar`, 2,6 Mo mesurés chez Félix). Le téléphone renvoie tout
// l'historique à chaque tour : une seule part trop lourde et la conversation
// entière restait morte, question après question.
//
// Donc, AVANT le gabarit : les clés d'image (avatar, photo, ph) sortent de toute
// réponse d'outil, à toute profondeur ; une réponse encore trop lourde passe par
// l'adaptateur (revue du 25 sept. : getSleepHistory(30) pèse 85 Ko brut, 8 Ko
// adapté — le talon jetait des données qui tenaient, et coûtait un tour) ; ce
// n'est que si elle ne tient TOUJOURS pas qu'elle devient un talon « expired »
// qui dit au modèle de redemander moins. Le nom et l'id restent :
// le tour modèle qui l'a demandée n'est jamais touché (sa thoughtSignature non
// plus). Après ça, seule une part qui n'est PAS une réponse d'outil peut encore
// rendre un 413.
const CLES_IMAGES = new Set(['avatar', 'photo', 'ph']);

function sansImages(v) {
  if (Array.isArray(v)) return v.map(sansImages);
  if (v && typeof v === 'object') {
    const o = {};
    for (const k of Object.keys(v)) if (!CLES_IMAGES.has(k)) o[k] = sansImages(v[k]);
    return o;
  }
  return v;
}

/** Fonction pure : rend un NOUVEAU tableau ; un tour ou une part intacts
 *  sont rendus tels quels (même référence), ce qui permet de les compter. */
function elaguerReponsesLourdes(contents) {
  if (!Array.isArray(contents)) return contents;
  return contents.map((tour) => {
    if (!tour || typeof tour !== 'object' || !Array.isArray(tour.parts)) return tour;
    let change = false;
    const parts = tour.parts.map((p) => {
      const fr = p && typeof p === 'object' ? p.functionResponse : null;
      if (!fr || typeof fr !== 'object') return p;
      let q, avant, apres;
      try {
        q = Object.assign({}, p, { functionResponse: Object.assign({}, fr, { response: sansImages(fr.response) }) });
        avant = JSON.stringify(p); apres = JSON.stringify(q);
      } catch (e) { return p; }   // illisible (trop profond) : le gabarit le refusera, comme avant
      const octets = Buffer.byteLength(apres, 'utf8');
      if (octets > PART_MAX_OCTETS) {
        // L'adaptateur est pur et idempotent : `preparerPourGemini` repassera
        // dessus sans rien changer.
        let adaptee = null;
        try {
          const a = Object.assign({}, q, { functionResponse: Object.assign({}, q.functionResponse,
            { response: adapterReponse(fr.name, q.functionResponse.response) }) });
          if (Buffer.byteLength(JSON.stringify(a), 'utf8') <= PART_MAX_OCTETS) adaptee = a;
        } catch (e) { adaptee = null; }
        if (adaptee) { change = true; return adaptee; }
        const f = { name: fr.name };
        if (fr.id !== undefined) f.id = fr.id;
        f.response = { qualite: 'expired',
                       raison: 'réponse trop lourde (' + Math.round(octets / 1024) + ' Ko), allégée par le serveur — redemande avec moins de jours' };
        q = { functionResponse: f };
      } else if (apres === avant) {
        return p;
      }
      change = true;
      return q;
    });
    return change ? Object.assign({}, tour, { parts }) : tour;
  });
}

/** Combien de parts `elaguerReponsesLourdes` a réécrites (pour le journal). */
function nombreElagues(avant, apres) {
  let n = 0;
  (apres || []).forEach((t, i) => {
    if (t === avant[i] || !t || !Array.isArray(t.parts)) return;
    t.parts.forEach((p, j) => { if (p !== avant[i].parts[j]) n++; });
  });
  return n;
}

// ═══ 25 SEPT. 2026 — LA MÉMOIRE GARDE LES FAITS LES PLUS RÉCENTS ═════════════
//
// `CoachMemoire.texteContexte` écrit les faits du plus ANCIEN au plus récent
// (« · fait » par ligne, 40 au plus). `slice(0, 2000)` gardait donc le début
// et jetait les derniers faits confiés — ceux qu'on voulait. On garde la FIN,
// 3 000 caractères, coupée sur un début de ligne : jamais un demi-fait.
const MEMOIRE_MAX_CARS = 3000;

function memoireRecente(s) {
  if (typeof s !== 'string') return '';
  if (s.length <= MEMOIRE_MAX_CARS) return s;
  const queue = s.slice(-MEMOIRE_MAX_CARS);
  // La coupe tombe déjà juste après un saut de ligne : rien à jeter.
  if (s[s.length - MEMOIRE_MAX_CARS - 1] === '\n') return queue;
  const i = queue.indexOf('\n');
  return i < 0 ? queue : queue.slice(i + 1);
}

// ═══ 25 SEPT. 2026 — CE QUE L'APP SAIT EXÉCUTER, ET QUI A DROIT À V2 ═══════
//
// `capacites` vient du binaire : quatre entiers, rien d'autre. Absente (app
// déjà posée) → null, donc V1. Un « 1 » en chaîne n'est pas une capacité.
const CAPACITES = ['instantane', 'outils', 'natif', 'memo'];

function lireCapacites(c) {
  if (!c || typeof c !== 'object' || Array.isArray(c)) return null;
  const o = {};
  for (const k of CAPACITES) o[k] = Number.isInteger(c[k]) && c[k] >= 0 && c[k] <= 1000 ? c[k] : 0;
  return o;
}

/** Pour le journal : `i1o1n1m1`, ou `-` sans capacites. */
const capaciteJournal = (c) => (c ? 'i' + c.instantane + 'o' + c.outils + 'n' + c.natif + 'm' + c.memo : '-');

// La porte de V2. Tant que la clé Gemini est au palier gratuit (20 requêtes par
// jour pour TOUT le monde, et des conditions de données qui ne conviennent pas
// à un instantané de santé), V2 ne s'ouvre qu'aux appareils de l'équipe,
// nommés EN ENTIER dans COACH_V2_APPAREILS. COACH_FACTURATION=1 l'ouvre à tous ;
// COACH_V2=0 ramène tout le monde à V1 sans redéployer de code.
function porteV2Ouverte(req) {
  if (process.env.COACH_V2 !== '1') return false;
  if (process.env.COACH_FACTURATION === '1') return true;
  const dev = deviceRequete(req);
  if (!dev) return false;
  return (process.env.COACH_V2_APPAREILS || '').split(',').map((s) => s.trim()).filter(Boolean).includes(dev);
}

/** Les VRAIS tours d'outils de la question en cours (le tour fabriqué du
 *  préchargement ne compte pas) — pour le journal. */
function toursOutilsReels(contents) {
  let n = 0;
  for (let i = contents.length - 1; i >= 0; i--) {
    const t = contents[i];
    if (estTourQuestion(t)) break;
    const parts = t && t.role === 'model' && Array.isArray(t.parts) ? t.parts : [];
    const marque = parts[0] && typeof parts[0].text === 'string' && parts[0].text.startsWith(MARQUEUR);
    if (!marque && parts.some((p) => p && p.functionCall)) n++;
  }
  return n;
}

// ═══ 25 SEPT. 2026 (revue) — LE PRÉCHARGEMENT NE MANGE PAS UN TOUR DE GEMINI
//
// L'app (CoachReseau.swift, posée comme nouvelle) compte CHAQUE réponse
// `mode:'outils'` — le tour fabriqué compris — et lève « trop d'allers-retours
// d'outils » à la 5e (`maxToursOutils = 4`). Avec le préchargement, Gemini
// n'avait plus que 3 vrais tours au lieu de 4. Donc : quand la question en
// cours en a déjà consommé 4, Gemini est appelé SANS droit aux outils
// (`functionCallingConfig: NONE`) — la dernière réponse que l'app accepte est
// forcément du texte. Les outils restent déclarés : le préfixe et les tours
// passés ne changent pas.
const TOURS_OUTILS_APP = 4;

/** Les tours d'outils de la question en cours, tour fabriqué COMPRIS : ce que
 *  l'app a déjà compté. */
function toursOutilsConsommes(contents) {
  let n = 0;
  for (let i = contents.length - 1; i >= 0; i--) {
    const t = contents[i];
    if (estTourQuestion(t)) break;
    const parts = t && t.role === 'model' && Array.isArray(t.parts) ? t.parts : [];
    if (parts.some((p) => p && p.functionCall)) n++;
  }
  return n;
}

// ═══ 25 SEPT. 2026 (revue) — LA NOUVELLE APP, PORTE FERMÉE, GARDE SON PROFIL
//
// L'app v2 n'envoie plus `profilTexte` dès qu'elle a un instantané ; porte
// fermée, le serveur répond en v1 et ignorait l'instantané : ni prénom, ni
// objectif, ni allergies — moins que l'app déjà posée, qui envoie toujours
// son briefing. En v1, sans briefing, on rend donc la SEULE partie profil de
// l'instantané, réduite à ce qu'un briefing portait ou que la prudence exige.
// Rien d'autre de l'instantané ne part en v1.
const CLES_PROFIL_V1 = ['prenom', 'age', 'sexe', 'poids', 'objectif', 'prudence'];

function profilPourV1(instantane) {
  const inst = validerInstantane(instantane);
  const p = inst.ok && inst.objet && inst.objet.profil;
  if (!p || typeof p !== 'object' || Array.isArray(p)) return null;
  const o = {};
  for (const k of CLES_PROFIL_V1) if (p[k] !== null && p[k] !== undefined && p[k] !== '') o[k] = p[k];
  const onb = p.onb && typeof p.onb === 'object' && !Array.isArray(p.onb) ? p.onb : null;
  if (onb) {
    const x = {};
    if (typeof onb.regime === 'string' && onb.regime) x.regime = onb.regime;
    if (Array.isArray(onb.allergies) && onb.allergies.length) x.allergies = onb.allergies;
    if (Object.keys(x).length) o.onb = x;
  }
  return Object.keys(o).length ? { profil: o } : null;
}

/** La réponse finale, même forme en JSON et dans le `fin` du flux. `retenir`
 *  n'existe qu'en v2 : une app v1 n'a pas été priée d'en écrire. */
function corpsReponse({ texte, suites, retenir, tourModele, memo, version, gemini }) {
  const o = { mode: 'reponse', texte, suites, tourModele, memo };
  if (version === 'v2') o.retenir = retenir;
  o.v = COACH_VERSION;
  o.appelsGemini = gemini;
  return o;
}

// 23 sept. 2026 — le premier est celui qu'on veut ; le second est celui qu'on
// accepte quand Google déclare le premier saturé (503 « high demand », mesuré
// plus d'une demi-heure ce jour-là, en même temps que sur le scan). Les deux
// savent appeler des outils (`functionDeclarations`), donc le pont ne change
// pas. Pas de troisième : le Coach a 60 s, pas 120.
// ═══ 23 sept. 2026, 19 h 20 — LA CHAÎNE DE SECOURS ÉTAIT MORTE CÔTÉ GOOGLE ═══
//
// Journal Vercel, troisième question de la soirée : `gemini-2.5-flash` → 429
// deux fois (« accès limité » : Google ne le sert plus qu'aux comptes qui
// l'utilisaient déjà, au compte-gouttes), puis le secours `gemini-2.5-flash-lite`
// → 404 « no longer available to new users, use gemini-3.5-flash-lite ». Le
// réessai + secours posé à 16 h ne réessayait plus rien : les deux maillons
// étaient périmés. Doc Google (deprecations, 23 sept.) : 2.0-flash éteint
// depuis le 1er juin ; remplaçants officiels 3.6-flash (pour 2.5-flash) et
// 3.1/3.5-flash-lite (pour 2.5-flash-lite). Le premier est celui qu'on veut,
// les deux autres ceux qu'on accepte — tous trois « stable », aucun 2.x.
const MODELES = ['gemini-3.6-flash', 'gemini-3.5-flash-lite', 'gemini-3.1-flash-lite'];
const RL_MAX = 40;

// ═══ 22 sept. 2026 — LA PORTE D'ENTRÉE ═════════════════════════════════════
//
// Elle était entrouverte de trois façons (audit du 22, puis « je veux un 20 sur
// 20 ») : le secret passait quand la variable d'env manquait, le rate-limit
// s'indexait sur un en-tête que le client choisit, et le CORS était grand
// ouvert. Les remèdes vivent dans `_lib.js`, avec ce qu'ils ne font pas.
//
// ⚠️ LA SIGNATURE SE DÉPLOIE EN DEUX TEMPS, et c'est délibéré. L'exiger tout de
// suite couperait toute application DÉJÀ posée — celle de TestFlight comme
// celle du téléphone de Dino — puisqu'elles n'en envoient pas. Tant que
// `COACH_EXIGE_SIGNATURE` ne vaut pas « 1 », une requête signée est vérifiée
// (et refusée si la signature est fausse : une signature présente est toujours
// jugée), une requête non signée passe encore. Le jour où l'app signée est
// partout, on met la variable à 1 et la porte se ferme pour de bon.
module.exports = async function handler(req, res) {
  const t0 = Date.now();
  // Pas d'`Access-Control-Allow-Origin` : cet endpoint est appelé par l'app
  // NATIVE, qui n'est pas soumise au CORS. L'ouvrir n'aurait servi qu'aux
  // navigateurs — c'est-à-dire à tout le monde.
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  // 24 sept. 2026 — un `x-flint-device` présent mais hors forme (espace,
  // saut de ligne, 129 caractères…) est refusé avant tout : il sert de clé de
  // rate-limit, de plafond et de journal. Absent, on continue (l'IP fait
  // l'identité, comme depuis toujours). Voir `deviceRequete` dans `_lib.js`.
  if (deviceIllisible(req)) return res.status(400).json({ error: 'en-tête x-flint-device illisible' });

  const id = identiteRequete(req);
  if (rateLimited(id, RL_MAX, { ip: ipRequete(req) })) {
    return res.status(429).json({ error: 'Trop de requêtes, réessaie dans une minute.' });
  }
  if (!verifierSecret(req, res)) return;

  // 23 sept. 2026 — le plafond par personne et par jour (voir `_lib.js`).
  // Dormant sans magasin partagé ; 200 tours par appareil et par jour quand
  // il est allumé — trois fois l'usage soutenu qu'on projette, aucun vrai
  // client n'y arrive, un script si.
  const plafond = await plafondJournalier({ id, portee: 'coach', max: process.env.COACH_PLAFOND_JOUR || 200 });
  if (plafond.atteint) {
    journal(req, 'plafond', t0, { compte: plafond.compte, max: plafond.max });
    return res.status(429).json({ error: 'Tu as beaucoup parlé au Coach aujourd\'hui — on reprend demain.' });
  }

  const exigeSig = process.env.COACH_EXIGE_SIGNATURE === '1';
  const aSignature = !!(req.headers['x-flint-sig'] || req.headers['x-flint-ts']);
  if (exigeSig || aSignature) {
    const v = verifierSignature(req, corpsBrut(req));
    if (!v.ok) return res.status(401).json({ error: 'signature refusée' , detail: v.raison });
  }

  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    // 24 sept. 2026 — le NOM de la variable reste au journal serveur ; la
    // réponse ne dit plus quelle pièce manque. Même statut qu'avant (500).
    console.log('[coach] GEMINI_API_KEY absente — configuration serveur incomplète');
    return res.status(500).json({ error: 'configuration serveur incomplète' });
  }

  // La taille AVANT de parser : un corps de 4 Mo ne mérite pas un JSON.parse.
  if (tailleCorps(req) > CORPS_MAX_OCTETS) {
    journal(req, 'trop-lourd', t0, { octets: tailleCorps(req) });
    return res.status(413).json({ error: 'Conversation trop lourde. Commence une nouvelle discussion.' });
  }

  const body = corpsJSON(req);
  const recus = Array.isArray(body.contents) ? body.contents : null;
  if (!recus || !recus.length) return res.status(400).json({ error: 'champ "contents" manquant ou vide' });
  // Borne large mais réelle : une conversation ne doit pas pouvoir gonfler la
  // requête Gemini sans limite (coût, latence).
  if (recus.length > 60) return res.status(400).json({ error: 'conversation trop longue' });
  // 25 sept. 2026 — les réponses d'outils trop lourdes s'allègent AVANT le
  // gabarit (voir `elaguerReponsesLourdes`) ; même nombre de tours, donc
  // `contents.length` au journal reste celui de l'app.
  const contents = elaguerReponsesLourdes(recus);
  const elague = nombreElagues(recus, contents);
  // Et chaque tour, chaque part (voir la mesure en tête de fichier).
  const horsGabarit = tourHorsGabarit(contents);
  if (horsGabarit) {
    journal(req, 'trop-lourd', t0, { raison: horsGabarit, elague });
    return res.status(413).json({ error: 'Conversation trop lourde. Commence une nouvelle discussion.', detail: horsGabarit });
  }

  // Même règle que `langue` : table fermée. `TONS[ton]` sur un objet ordinaire
  // acceptait « constructor » ou « __proto__ » et collait `function Object()`
  // dans le prompt — sans danger, mais pas un ton.
  const ton = Object.prototype.hasOwnProperty.call(TONS, body.ton) ? body.ton : 'aucun';
  // La langue de l'APP (fr/en/es), envoyée par le client depuis la v2584. On la
  // ramène à la table fermée ICI, et pas seulement dans le prompt : ce code part
  // aussi au journal, et on ne veut pas y écrire dix kilo-octets choisis par
  // l'appelant. Une app plus ancienne n'envoie rien : repli français, c'est-à-
  // dire exactement ce qu'elle faisait déjà.
  const langue = Object.prototype.hasOwnProperty.call(LANGUES, body.langue) ? body.langue : 'fr';
  const profilTexte = typeof body.profilTexte === 'string' ? body.profilTexte.slice(0, 4000) : '';
  // Les 3 000 DERNIERS caractères, pas les 2 000 premiers (voir `memoireRecente`).
  const memoireTexte = memoireRecente(body.memoireTexte);

  // ═══ 25 SEPT. 2026 — V1 OU V2 : LE BINAIRE DIT CE QU'IL SAIT, LA PORTE DÉCIDE
  //
  // C'est `capacites` qui choisit les outils déclarés, jamais la présence d'un
  // instantané : un moteur en retard ne doit pas changer le jeu d'outils d'une
  // question à l'autre. En v1, l'instantané et la part native sont IGNORÉS —
  // ils ne partent jamais chez Gemini.
  const capacites = lireCapacites(body.capacites);
  const { version, outils } = outilsPour({ capacites, v2Autorise: porteV2Ouverte(req) });
  const question = derniereQuestion(contents);
  const anodin = estAnodin(question);
  const inst = version === 'v2' ? validerInstantane(body.instantane) : null;
  const instOk = !!(inst && inst.ok);
  const cap = capaciteJournal(capacites);

  // 24 sept. 2026 — le message brut d'une exception partait à l'app tel
  // quel : un chemin de fichier, une URL, la clé si un jour un message la
  // citait. `error` est une phrase pour l'écran ; `detail` garde le message
  // (tronqué, clé masquée) pour lire la panne — jamais la pile.
  const panne = (e) => {
    const message = sansCle(String((e && e.message) || e).slice(0, 120), key);
    journal(req, 'panne', t0, { message });
    return res.status(500).json({ error: 'Le Coach a rencontré une erreur. Réessaie dans un moment.', detail: message,
                                  v: COACH_VERSION });
  };

  let gReq, champs, jourInst;
  try {
    // ═══ LE PRÉCHARGEMENT : UNE NOUVELLE QUESTION NE COÛTE PAS DE GEMINI ════
    //
    // Mesuré avant ce lot : 2 à 3 requêtes Gemini par question, le premier
    // mot à 10–15 s — le prompt forçait « sommeil 7 j ET charge », chaque tour
    // d'outils était un appel complet. Ici, on rend soi-même les appels que le
    // modèle aurait faits (v1 : les cinq d'avant ; v2 sans instantané :
    // getDay(0)). Du JSON même quand `flux` est demandé : l'app lit le JSON dès
    // que la réponse n'est pas un flux. Un message anodin (« merci ») n'en a
    // pas besoin ; COACH_PRECHARGE=0 coupe tout, sans redéployer.
    if (estNouvelleQuestion(contents) && process.env.COACH_PRECHARGE !== '0' && !anodin
        && (version === 'v1' || !instOk)) {
      const p = prechargement({ version });
      const ligne = { version, appels: p.appels.length, precharge: 1, cap, inst: '-' };
      if (version === 'v2') ligne.instRefus = (inst.raison || '-').replace(/\s+/g, '_');
      journal(req, 'precharge', t0, Object.assign(ligne, { tours: contents.length, gemini: 0, elague }));
      return res.status(200).json({ mode: 'outils', appels: p.appels, tourModele: p.tourModele,
                                    libelles: LIBELLES[langue], v: COACH_VERSION, appelsGemini: 0 });
    }

    // Ce que Gemini voit, et seulement ça : tours fabriqués retirés (leurs
    // résultats reviennent dans `precharges`), réponses de la question en
    // cours récrites en unités d'écran, charges des questions d'avant
    // réduites à un talon, 60 Ko au plus. `COACH_COMPACTION=retirer` enlève
    // les anciens échanges d'outils en entier, si Gemini refusait un vieil
    // appel V1 pendant que V2 est déclaré.
    const prep = preparerPourGemini(contents, { adapter: adapterReponse, nettoyer: nettoyerReponse,
                                                compaction: process.env.COACH_COMPACTION || 'stub',
                                                budgetOctets: 60000 });

    // Les données du moment, dans la QUEUE de l'instruction système — jamais
    // dans `contents`, donc les tours suivants ne les repaient pas.
    // 25 sept. 2026 (revue app, constat 10) — la part NATIVE se valide en v2
    // même sans instantané : un moteur trop lent ne doit pas faire oublier au
    // Coach un plafond de rééducation, le bracelet ou une séance en cours.
    const natif = version === 'v2' ? validerNatif(body.natif) : null;
    let donnees = '';
    if (version === 'v2' && instOk) {
      donnees = rendreInstantane(inst.objet, natif.objet, { langue, anodin });
    } else if (prep.precharges.length) {
      donnees = version === 'v2' ? rendreJson('DONNÉES DU JOUR', prep.precharges, { langue })
                                 : rendreDonneesV1(prep.precharges, langue);
    }
    if (version === 'v2' && !instOk && natif && natif.ok && natif.objet && natif.objet.visite !== true) {
      donnees = [donnees, rendreJson('APPAREIL ET SÉCURITÉ', natif.objet, { langue })].filter(Boolean).join('\n\n');
    }
    // Les faits du plus RÉCENT au plus ancien (`faits` de l'app v2, ou
    // `memoireTexte` des apps posées, retourné) ; les mémos des autres fils
    // seulement en v2.
    const faits = rendreFaits({ faits: body.faits, memoireTexte });
    const memos = version === 'v2' ? rendreMemos(body.memos) : '';
    // Le briefing de l'app ne double pas un instantané valide. En v1 sans
    // briefing (app v2, porte fermée) : le profil de l'instantané, lui seul.
    let profil = version === 'v2' && instOk ? '' : profilTexte;
    let profilInst = 0;
    if (version === 'v1' && !profilTexte.trim()) {
      const pv1 = profilPourV1(body.instantane);
      if (pv1) { profil = rendreJson('PROFIL', pv1, { langue }); profilInst = 1; }
    }
    const systeme = promptSysteme({ ton, langue, mode: version,
                                    blocs: { donnees, profilTexte: profil, faits, memos, anodin } });
    const toursPris = toursOutilsConsommes(contents);

    gReq = {
      // Les tours préparés — « function » déjà devenu « user » (Gemini 3).
      contents: prep.contents,
      systemInstruction: { parts: [{ text: systeme }] },
      tools: [{ functionDeclarations: outils }],
      // Gemini 3 : Google demande de LAISSER la température par défaut (1,0) —
      // « lower values may lead to looping or degraded performance » sur les
      // tâches de raisonnement, et le Coach en est une (outils, chiffres). Et
      // le plafond de sortie compte aussi les jetons de réflexion : 1 024
      // pouvait rendre une réponse vide (502 « sans texte ») ; 4 096 laisse
      // la place, la longueur du texte reste tenue par le prompt.
      generationConfig: { maxOutputTokens: 4096 }
    };
    if (toursPris >= TOURS_OUTILS_APP) gReq.toolConfig = { functionCallingConfig: { mode: 'NONE' } };
    jourInst = instOk && inst.objet.meta ? inst.objet.meta.jour : undefined;

    // Le journal : des tailles et des comptes, jamais un contenu.
    champs = { outils: version, precharge: prep.precharges.length ? 1 : 0, cap,
               inst: instOk ? inst.octets : '-', natif: natif && natif.ok ? natif.octets : '-',
               faits: faits.length, memos: memos ? memos.split('\n').length - 1 : 0,
               contenus: prep.stats.octets, stubs: prep.stats.stubs, retires: prep.stats.retires,
               marqueurs: prep.stats.marqueurs, coupees: prep.stats.coupees,
               toursOutils: toursOutilsReels(contents), tours: contents.length, elague };
    if (version === 'v2' && !instOk) champs.instRefus = (inst.raison || '-').replace(/\s+/g, '_');
    if (profilInst) champs.profilInst = 1;
    if (gReq.toolConfig) champs.sansOutils = 1;
  } catch (e) {
    return panne(e);
  }
  // « Retenir : » n'est une étiquette qu'en v2 (voir `avecRetenir`, _coach-histoire.js).
  const meta = { retenir: version === 'v2' };
  const ctx = { req, res, t0, key, gReq, langue, version, anodin, question, jourInst, champs, meta };

  // ═══ 24 SEPT. 2026 — LA DIFFUSION, SUR DEMANDE DU CLIENT ════════════════
  //
  // `flux: true` est ENVOYÉ PAR L'APP, il n'est pas décidé ici : une app déjà
  // posée ne l'envoie pas et reçoit le JSON d'avant (quelques champs de plus,
  // qu'elle ignore). C'est ce qui permet de déployer ce fichier sans attendre
  // personne.
  if (body.flux === true) {
    return await repondreEnFlux(ctx);
  }

  try {
    // 23 sept., 20 h — mesuré sur gemini-3.6-flash : 6,5 à 10 s par tour, et
    // une réponse longue à 22,5 s au journal = un essai COUPÉ à 12 s puis un
    // second réussi en 10 s. Le couperet à 12 s faisait payer deux appels et
    // doublait l'attente. Donc 28 s par essai, UN essai par modèle (un 429 ou
    // 5xx passe au suivant sans attendre) : trois modèles × 28 s = 84 s, sous
    // les 90 s de la fonction (vercel.json) — et l'app, elle, attend 45 s
    // (`delaiMaxS`, CoachReseau.swift) : le deuxième modèle n'a que 17 s de
    // patience côté client, les deux suivants servent surtout le journal.
    const g = await appelerGemini({ key, modeles: MODELES, corps: gReq, delaiMs: 28000, tentativesParModele: 1 });
    const gemini = g.tentatives || 0;
    if (!g.ok) {
      journal(req, 'gemini-indisponible', t0, Object.assign({ statut: g.status, tentatives: g.tentatives,
                                                modele: g.modele || '-', parcours: (g.parcours || []).join(' ') },
                                                champs, { gemini }));
      return res.status(502).json({ error: 'Le Coach est indisponible à l\'instant. Réessaie dans un moment.',
                                    gemini: g.status, detail: g.detail,
                                    // Un verdict PAR MODÈLE : `detail` ne dit que le dernier,
                                    // et ça a déjà produit un diagnostic faux (voir `_lib.js`).
                                    parcours: g.parcours || [], v: COACH_VERSION, appelsGemini: gemini });
    }
    if (g.modele !== MODELES[0]) journal(req, 'secours', t0, { modele: g.modele, tentatives: g.tentatives });
    const j = g.json;
    const cand = j && j.candidates && j.candidates[0];
    const content = cand && cand.content;
    const parts = (content && content.parts) || [];
    if (!parts.length) return res.status(502).json({ error: 'réponse Gemini vide', v: COACH_VERSION, appelsGemini: gemini });

    const appelsFn = parts.filter(p => p.functionCall).map(p => ({
      name: p.functionCall.name,
      args: p.functionCall.args || {}
    }));

    if (appelsFn.length) {
      journal(req, 'outils', t0, Object.assign({ appels: appelsFn.length }, champs, { gemini }));
      // `tourModele` tel que Gemini l'a rendu : ses thoughtSignature reviennent au tour suivant.
      return res.status(200).json({ mode: 'outils', appels: appelsFn, tourModele: content,
                                    libelles: LIBELLES[langue], v: COACH_VERSION, appelsGemini: gemini });
    }

    const brut = parts.map(p => p.text || '').join('').trim();
    if (!brut) return res.status(502).json({ error: 'réponse Gemini sans texte ni outil', v: COACH_VERSION, appelsGemini: gemini });
    // Les lignes « Retenir : » puis « Suites : … » quittent le texte (voir
    // `extraireMeta`). `tourModele` garde le texte brut : c'est l'historique
    // que le modèle relira, pas l'écran.
    const { texte, suites, retenir } = extraireMeta(brut, meta);
    journal(req, 'reponse', t0, Object.assign({ sortie: texte.length, suites: suites.length,
                                                retenir: retenir.length, lang: langue }, champs, { gemini }));
    return res.status(200).json(corpsReponse({ texte, suites, retenir, tourModele: content, version, gemini,
                                               memo: memoFinal(ctx, texte) }));
  } catch (e) {
    return panne(e);
  }
};

/** Le mémo de l'échange (déterministe, sans modèle) ; aucun pour un message anodin. */
function memoFinal(ctx, texte) {
  if (ctx.anodin) return null;
  return memoDe({ question: ctx.question, texte, jour: ctx.jourInst });
}

// ═══════════════════════════════════════════════════════════════════════════
// LA RÉPONSE EN FLUX
//
// Même travail que la branche d'au-dessus — mêmes modèles, même corps, même
// `extraireMeta` — mais le texte part au fil de l'écriture au lieu d'attendre
// le point final. Le contrat de FIN est identique à l'octet : c'est voulu, le
// client range la conversation avec le même code des deux côtés.
//
// LE PROTOCOLE, TROIS FORMES ET PAS UNE DE PLUS (un seul canal `data:`, pas de
// `event:` nommé — un `switch` sur une clé se lit mieux qu'un aiguillage SSE
// des deux côtés) :
//
//   {"d":"…"}      un morceau de texte, à coller au bout de ce qu'on a
//   {"fin":{…}}    le tour complet : `mode`/`texte`/`suites`/`tourModele`,
//                  ou `mode:"outils"`/`appels`/`tourModele`
//   {"erreur":"…"} une panne APRÈS le premier octet (avant, c'est du JSON)
//
// ⚠️ LES EN-TÊTES SSE NE SONT POSÉS QU'APRÈS UNE OUVERTURE RÉUSSIE. Tant
// qu'aucun octet n'est parti, une panne se dit en JSON avec son vrai statut —
// donc exactement ce que l'app sait déjà lire, et son repli marche sans rien
// savoir du flux.
//
// ⚠️ ET SI L'HÉBERGEMENT TAMPONNE, RIEN NE CASSE. Un proxy qui retient tout
// jusqu'à la fin livre les mêmes événements dans le même ordre, tous à la
// dernière seconde : le client les applique à la suite et l'écran se comporte
// comme avant ce lot. C'est la propriété qui rend ce déploiement sûr — le pire
// cas est le comportement d'aujourd'hui, jamais une régression.
async function repondreEnFlux(ctx) {
  const { req, res, t0, key, gReq, langue, version, champs, meta } = ctx;
  // Chaque appel à Gemini de CETTE requête, repli compris (`gemini=` au journal).
  let gemini = 0;
  const g = await ouvrirGeminiFlux({ key, modeles: MODELES, corps: gReq, delaiMs: 28000 });
  gemini += g.tentatives || 0;
  if (!g.ok) {
    journal(req, 'flux-indisponible', t0, Object.assign({ statut: g.status, tentatives: g.tentatives,
                                            parcours: (g.parcours || []).join(' ') }, champs, { gemini }));
    return res.status(502).json({ error: 'Le Coach est indisponible à l\'instant. Réessaie dans un moment.',
                                  gemini: g.status, detail: g.detail,
                                  parcours: g.parcours || [], v: COACH_VERSION, appelsGemini: gemini });
  }
  if (g.modele !== MODELES[0]) journal(req, 'flux-secours', t0, { modele: g.modele });

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    // `no-store` plutôt que `no-cache` (24 sept.) : même règle que le JSON,
    // rien de cette réponse ne se garde ; `no-transform` reste, contre la
    // recompression d'un proxy qui casserait le découpage.
    'Cache-Control': 'no-store, no-transform',
    'X-Content-Type-Options': 'nosniff',
    'Connection': 'keep-alive',
    // Pour les proxys de la famille nginx, qui tamponnent par défaut.
    'X-Accel-Buffering': 'no'
  });
  // Un commentaire SSE, envoyé tout de suite : il pousse les en-têtes hors de
  // la fonction sans rien promettre au client (les lignes `:` sont ignorées).
  res.write(': ouvert\n\n');

  const envoyer = (o) => res.write('data: ' + JSON.stringify(o) + '\n\n');

  // Ce que le modèle a écrit jusqu'ici, et ce qu'on en a déjà donné.
  let brut = '';
  let emis = 0;
  const appelsFn = [];
  const partsModele = [];

  // ═══ LES LIGNES « SUITES : » ET « RETENIR : » NE PARTENT JAMAIS DANS LE FLUX
  //
  // `extraireMeta` les détache à la fin — mais en flux, « à la fin » est trop
  // tard : elles seraient déjà passées à l'écran, et elles en repartiraient.
  // `partieSureMeta` (_coach-histoire.js) retient la SÉRIE FINALE de lignes qui
  // commencent comme une étiquette (Suites, Retenir, et leurs en/es), plus une
  // dernière ligne inachevée qui pourrait en devenir une ; dès qu'un texte
  // ordinaire suit, tout repart. Un texte ordinaire n'est jamais retenu, et
  // `fin.texte` fait foi : rien ne peut rester caché pour de bon.
  // 25 sept. 2026 — remplace la garde d'avant, qui ne connaissait que « Suites ».

  try {
    for await (const parts of partsDuFlux(g.reponse)) {
      for (const p of parts) {
        if (p.functionCall) {
          appelsFn.push({ name: p.functionCall.name, args: p.functionCall.args || {} });
          // La part ENTIÈRE, pas `{ functionCall }` : Gemini 3 y pose une
          // `thoughtSignature` qu'il exige au tour suivant (400 sans elle).
          // Voir le banc ⑤ bis (test-coach-flux.js).
          partsModele.push(p);
        } else if (typeof p.text === 'string' && p.text) {
          brut += p.text;
        }
      }
      if (!appelsFn.length) {
        const sur = partieSureMeta(brut, meta);
        if (sur.length > emis) { envoyer({ d: sur.slice(emis) }); emis = sur.length; }
      }
    }
  } catch (e) {
    journal(req, 'flux-rompu', t0, { message: String((e && e.message) || e).slice(0, 120), recu: brut.length, gemini });
    envoyer({ erreur: 'La réponse s\'est interrompue. Repose ta question.' });
    return res.end();
  }

  // Un tour d'outils : le texte éventuel ne compte pas (le modèle ne mélange
  // pas les deux, mais on ne le suppose pas — `appels` gagne, et le client a
  // reçu zéro `d` puisque la garde ci-dessus l'en empêche).
  if (appelsFn.length) {
    journal(req, 'flux-outils', t0, Object.assign({ appels: appelsFn.length }, champs, { gemini }));
    envoyer({ fin: { mode: 'outils', appels: appelsFn,
                     tourModele: { role: 'model', parts: partsModele },
                     libelles: LIBELLES[langue], v: COACH_VERSION, appelsGemini: gemini } });
    return res.end();
  }

  // ═══ LE FILET — 24 SEPT. 2026, ÉCRIT APRÈS S'ÊTRE FAIT PRENDRE ══════════
  //
  // Première version : un flux vide rendait une erreur. Elle est tombée le
  // jour même, sur la vraie chaîne — le séparateur SSE de Google est en CRLF,
  // le découpage cherchait « \n\n », zéro bloc lu, zéro texte. Le banc était
  // vert : il FABRIQUAIT ses séparateurs, donc il ne prouvait que ce qu'on
  // avait pensé à fabriquer.
  //
  // Le CRLF est corrigé (`partsDuFlux`) et il est au banc. Mais corriger LE
  // défaut ne corrige pas LA CLASSE de défaut : lire un flux qu'on ne contrôle
  // pas, c'est parier sur sa forme, et ce pari se reperdra (un `[DONE]` d'un
  // dialecte, une ligne `event:` qu'on n'attend pas, un jour où Google change
  // de transport).
  //
  // Donc : si le flux n'a rien rendu, ON NE SE PLAINT PAS, ON REFAIT L'APPEL
  // PAR L'ANCIEN CHEMIN et on livre le résultat dans le même `fin`. Le client
  // ne voit aucune différence — sinon que ce tour-là n'aura pas diffusé. Le
  // pire cas de la diffusion redevient ainsi, exactement, le comportement
  // d'avant elle : c'est la seule forme sous laquelle ce chantier avait le
  // droit d'approcher la production.
  let brutFinal = brut;
  if (!brutFinal.trim()) {
    journal(req, 'flux-vide-repli', t0, { modele: g.modele });
    // Le MÊME gReq : les tours fabriqués en sont déjà retirés.
    const r = await appelerGemini({ key, modeles: MODELES, corps: gReq,
                                    delaiMs: 28000, tentativesParModele: 1 });
    gemini += r.tentatives || 0;
    const parts = (r.ok && r.json && r.json.candidates && r.json.candidates[0]
                && r.json.candidates[0].content && r.json.candidates[0].content.parts) || [];
    const appelsRepli = parts.filter(p => p.functionCall).map(p => ({
      name: p.functionCall.name, args: p.functionCall.args || {} }));
    if (appelsRepli.length) {
      journal(req, 'flux-outils', t0, Object.assign({ appels: appelsRepli.length, repli: 1 }, champs, { gemini }));
      envoyer({ fin: { mode: 'outils', appels: appelsRepli,
                       tourModele: r.json.candidates[0].content,
                       libelles: LIBELLES[langue], v: COACH_VERSION, appelsGemini: gemini } });
      return res.end();
    }
    brutFinal = parts.map(p => p.text || '').join('');
  }

  const propre = brutFinal.trim();
  if (!propre) {
    journal(req, 'flux-vide', t0, { gemini });
    envoyer({ erreur: 'Flint n\'a rien répondu. Repose ta question.' });
    return res.end();
  }

  const { texte, suites, retenir } = extraireMeta(propre, meta);
  journal(req, 'flux-reponse', t0, Object.assign({ sortie: texte.length, suites: suites.length,
                                                   retenir: retenir.length, lang: langue, modele: g.modele },
                                                 champs, { gemini }));
  // Le reliquat : ce qu'on a retenu et qui n'était PAS une ligne de suites ni
  // de « Retenir » (dernier paragraphe sans saut de ligne final, le cas
  // ordinaire), plus la correction si `extraireMeta` a coupé plus court que
  // notre garde.
  if (texte.length > emis) envoyer({ d: texte.slice(emis) });
  // `tourModele` garde le texte BRUT, suites comprises : c'est l'historique que
  // le modèle relira, pas l'écran. Même règle que la branche non diffusée.
  envoyer({ fin: corpsReponse({ texte, suites, retenir, version, gemini,
                                tourModele: { role: 'model', parts: [{ text: brutFinal }] },
                                memo: memoFinal(ctx, texte) }) });
  return res.end();
}

// ═══ CE QU'ON ÉCRIT, ET CE QU'ON N'ÉCRIT JAMAIS ════════════════════════════
//
// Une ligne par requête, dans les journaux Vercel : de quoi voir une boucle
// d'outils, une latence qui dérive ou une panne qui se répète. AUCUN contenu —
// ni la question, ni la réponse, ni un chiffre de santé, ni le profil. On
// compte des caractères, on ne les lit pas. Le device est tronqué à huit
// caractères : assez pour distinguer deux appareils dans une même minute,
// jamais assez pour en désigner un.
function journal(req, mode, t0, extra) {
  const dev = (req.headers['x-flint-device'] || '').toString().slice(0, 8);
  const champs = Object.keys(extra || {}).map(k => k + '=' + extra[k]).join(' ');
  console.log('[coach] mode=' + mode + ' ms=' + (Date.now() - t0)
              + ' dev=' + (dev || '-') + (champs ? ' ' + champs : ''));
}

// 25 sept. 2026 — les deux règles pures, exposées pour les bancs (le handler
// reste l'export par défaut, c'est lui que Vercel appelle).
module.exports.elaguerReponsesLourdes = elaguerReponsesLourdes;
module.exports.memoireRecente = memoireRecente;
module.exports.COACH_VERSION = COACH_VERSION;
