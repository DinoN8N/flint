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

const { cors, rateLimited, identiteRequete, verifierSecret, corpsJSON } = require('./_lib');
const { OUTILS } = require('./_coach-tools');
const { promptSysteme } = require('./_coach-prompt');

const MODEL = 'gemini-2.5-flash';
const RL_MAX = 40;

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const id = identiteRequete(req);
  if (rateLimited(id, RL_MAX)) return res.status(429).json({ error: 'Trop de requêtes, réessaie dans une minute.' });
  if (!verifierSecret(req, res)) return;

  const key = process.env.GEMINI_API_KEY;
  if (!key) return res.status(500).json({ error: 'GEMINI_API_KEY manquante (variable d\'env Vercel)' });

  const body = corpsJSON(req);
  const contents = Array.isArray(body.contents) ? body.contents : null;
  if (!contents || !contents.length) return res.status(400).json({ error: 'champ "contents" manquant ou vide' });
  // Borne large mais réelle : une conversation ne doit pas pouvoir gonfler la
  // requête Gemini sans limite (coût, latence).
  if (contents.length > 60) return res.status(400).json({ error: 'conversation trop longue' });

  const ton = typeof body.ton === 'string' ? body.ton : 'aucun';
  const profilTexte = typeof body.profilTexte === 'string' ? body.profilTexte.slice(0, 4000) : '';
  const memoireTexte = typeof body.memoireTexte === 'string' ? body.memoireTexte.slice(0, 2000) : '';

  const gReq = {
    contents,
    systemInstruction: { parts: [{ text: promptSysteme({ ton, profilTexte, memoireTexte }) }] },
    tools: [{ functionDeclarations: OUTILS }],
    generationConfig: { temperature: 0.4, maxOutputTokens: 1024 }
  };

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${key}`;
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(gReq) });
    if (!r.ok) {
      const t = await r.text();
      return res.status(502).json({ error: 'Gemini ' + r.status, detail: t.slice(0, 400) });
    }
    const j = await r.json();
    const cand = j && j.candidates && j.candidates[0];
    const content = cand && cand.content;
    const parts = (content && content.parts) || [];
    if (!parts.length) return res.status(502).json({ error: 'réponse Gemini vide' });

    const appelsFn = parts.filter(p => p.functionCall).map(p => ({
      name: p.functionCall.name,
      args: p.functionCall.args || {}
    }));

    if (appelsFn.length) {
      return res.status(200).json({ mode: 'outils', appels: appelsFn, tourModele: content });
    }

    const texte = parts.map(p => p.text || '').join('').trim();
    if (!texte) return res.status(502).json({ error: 'réponse Gemini sans texte ni outil' });
    return res.status(200).json({ mode: 'reponse', texte, tourModele: content });
  } catch (e) {
    return res.status(500).json({ error: String((e && e.message) || e) });
  }
};
