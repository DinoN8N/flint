// FLINT Coach — orchestrateur (Gemini function calling), sans état.
//
// Contrat (POST, JSON) :
//   requête  { deviceId, contents: [...tours Gemini déjà échangés...], ton, profilTexte, memoireTexte }
//   réponse  { mode:'outils', appels:[{name,args}], tourModele:{...} }
//         ou { mode:'reponse', texte:'...', tourModele:{...} }
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

const { cors, rateLimited, identiteRequete, ipRequete,
        verifierSecret, verifierSignature, corpsJSON, corpsBrut, appelerGemini,
        plafondJournalier } = require('./_lib');
const { OUTILS } = require('./_coach-tools');
const { promptSysteme, LANGUES } = require('./_coach-prompt');

// 23 sept. 2026 — le premier est celui qu'on veut ; le second est celui qu'on
// accepte quand Google déclare le premier saturé (503 « high demand », mesuré
// plus d'une demi-heure ce jour-là, en même temps que sur le scan). Les deux
// savent appeler des outils (`functionDeclarations`), donc le pont ne change
// pas. Pas de troisième : le Coach a 60 s, pas 120.
const MODELES = ['gemini-2.5-flash', 'gemini-2.5-flash-lite'];
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
  if (!key) return res.status(500).json({ error: 'GEMINI_API_KEY manquante (variable d\'env Vercel)' });

  const body = corpsJSON(req);
  const contents = Array.isArray(body.contents) ? body.contents : null;
  if (!contents || !contents.length) return res.status(400).json({ error: 'champ "contents" manquant ou vide' });
  // Borne large mais réelle : une conversation ne doit pas pouvoir gonfler la
  // requête Gemini sans limite (coût, latence).
  if (contents.length > 60) return res.status(400).json({ error: 'conversation trop longue' });

  const ton = typeof body.ton === 'string' ? body.ton : 'aucun';
  // La langue de l'APP (fr/en/es), envoyée par le client depuis la v2584. On la
  // ramène à la table fermée ICI, et pas seulement dans le prompt : ce code part
  // aussi au journal, et on ne veut pas y écrire dix kilo-octets choisis par
  // l'appelant. Une app plus ancienne n'envoie rien : repli français, c'est-à-
  // dire exactement ce qu'elle faisait déjà.
  const langue = Object.prototype.hasOwnProperty.call(LANGUES, body.langue) ? body.langue : 'fr';
  const profilTexte = typeof body.profilTexte === 'string' ? body.profilTexte.slice(0, 4000) : '';
  const memoireTexte = typeof body.memoireTexte === 'string' ? body.memoireTexte.slice(0, 2000) : '';

  const gReq = {
    contents,
    systemInstruction: { parts: [{ text: promptSysteme({ ton, profilTexte, memoireTexte, langue }) }] },
    tools: [{ functionDeclarations: OUTILS }],
    generationConfig: { temperature: 0.4, maxOutputTokens: 1024 }
  };

  try {
    // Deux modèles × deux tentatives × 12 s : sous les 60 s de la fonction.
    const g = await appelerGemini({ key, modeles: MODELES, corps: gReq, delaiMs: 12000 });
    if (!g.ok) {
      journal(req, 'gemini-indisponible', t0, { statut: g.status, tentatives: g.tentatives, modele: g.modele || '-' });
      return res.status(502).json({ error: 'Le Coach est indisponible à l\'instant. Réessaie dans un moment.',
                                    gemini: g.status, detail: g.detail });
    }
    if (g.modele !== MODELES[0]) journal(req, 'secours', t0, { modele: g.modele, tentatives: g.tentatives });
    const j = g.json;
    const cand = j && j.candidates && j.candidates[0];
    const content = cand && cand.content;
    const parts = (content && content.parts) || [];
    if (!parts.length) return res.status(502).json({ error: 'réponse Gemini vide' });

    const appelsFn = parts.filter(p => p.functionCall).map(p => ({
      name: p.functionCall.name,
      args: p.functionCall.args || {}
    }));

    if (appelsFn.length) {
      journal(req, 'outils', t0, { appels: appelsFn.length, tours: contents.length });
      return res.status(200).json({ mode: 'outils', appels: appelsFn, tourModele: content });
    }

    const texte = parts.map(p => p.text || '').join('').trim();
    if (!texte) return res.status(502).json({ error: 'réponse Gemini sans texte ni outil' });
    journal(req, 'reponse', t0, { tours: contents.length, sortie: texte.length, lang: langue });
    return res.status(200).json({ mode: 'reponse', texte, tourModele: content });
  } catch (e) {
    journal(req, 'panne', t0, { message: String((e && e.message) || e).slice(0, 120) });
    return res.status(500).json({ error: String((e && e.message) || e) });
  }
};

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
