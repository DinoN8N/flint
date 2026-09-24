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
        ouvrirGeminiFlux, partsDuFlux, roleFonctionVersUser, extraireSuites,
        plafondJournalier } = require('./_lib');
const { OUTILS } = require('./_coach-tools');
const { promptSysteme, LANGUES } = require('./_coach-prompt');

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
    // Gemini 3 : « function » n'est plus un rôle, les réponses d'outils sont
    // un tour « user » (voir `roleFonctionVersUser`). `contents.length` et
    // le journal restent calculés sur ce qu'a envoyé l'app.
    contents: roleFonctionVersUser(contents),
    systemInstruction: { parts: [{ text: promptSysteme({ ton, profilTexte, memoireTexte, langue }) }] },
    tools: [{ functionDeclarations: OUTILS }],
    // Gemini 3 : Google demande de LAISSER la température par défaut (1,0) —
    // « lower values may lead to looping or degraded performance » sur les
    // tâches de raisonnement, et le Coach en est une (outils, chiffres). Et
    // le plafond de sortie compte aussi les jetons de réflexion : 1 024
    // pouvait rendre une réponse vide (502 « sans texte ») ; 4 096 laisse
    // la place, la longueur du texte reste tenue par le prompt.
    generationConfig: { maxOutputTokens: 4096 }
  };

  // ═══ 24 SEPT. 2026 — LA DIFFUSION, SUR DEMANDE DU CLIENT ════════════════
  //
  // `flux: true` est ENVOYÉ PAR L'APP, il n'est pas décidé ici : une app déjà
  // posée ne l'envoie pas et reçoit exactement le JSON d'avant, au bit près.
  // C'est ce qui permet de déployer ce fichier sans attendre personne.
  if (body.flux === true) {
    return await repondreEnFlux({ req, res, t0, key, gReq, contents, langue });
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
    if (!g.ok) {
      journal(req, 'gemini-indisponible', t0, { statut: g.status, tentatives: g.tentatives,
                                                modele: g.modele || '-', parcours: (g.parcours || []).join(' ') });
      return res.status(502).json({ error: 'Le Coach est indisponible à l\'instant. Réessaie dans un moment.',
                                    gemini: g.status, detail: g.detail,
                                    // Un verdict PAR MODÈLE : `detail` ne dit que le dernier,
                                    // et ça a déjà produit un diagnostic faux (voir `_lib.js`).
                                    parcours: g.parcours || [] });
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

    const brut = parts.map(p => p.text || '').join('').trim();
    if (!brut) return res.status(502).json({ error: 'réponse Gemini sans texte ni outil' });
    // La ligne « Suites : … » quitte le texte et devient un tableau (voir
    // `extraireSuites`). `tourModele` garde le texte brut : c'est l'historique
    // que le modèle relira, pas l'écran.
    const { texte, suites } = extraireSuites(brut);
    journal(req, 'reponse', t0, { tours: contents.length, sortie: texte.length, suites: suites.length, lang: langue });
    return res.status(200).json({ mode: 'reponse', texte, suites, tourModele: content });
  } catch (e) {
    journal(req, 'panne', t0, { message: String((e && e.message) || e).slice(0, 120) });
    return res.status(500).json({ error: String((e && e.message) || e) });
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// LA RÉPONSE EN FLUX
//
// Même travail que la branche d'au-dessus — mêmes modèles, même corps, même
// `extraireSuites` — mais le texte part au fil de l'écriture au lieu d'attendre
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
async function repondreEnFlux({ req, res, t0, key, gReq, contents, langue }) {
  const g = await ouvrirGeminiFlux({ key, modeles: MODELES, corps: gReq, delaiMs: 28000 });
  if (!g.ok) {
    journal(req, 'flux-indisponible', t0, { statut: g.status, tentatives: g.tentatives,
                                            parcours: (g.parcours || []).join(' ') });
    return res.status(502).json({ error: 'Le Coach est indisponible à l\'instant. Réessaie dans un moment.',
                                  gemini: g.status, detail: g.detail,
                                  parcours: g.parcours || [] });
  }
  if (g.modele !== MODELES[0]) journal(req, 'flux-secours', t0, { modele: g.modele });

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
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

  // ═══ LA LIGNE « SUITES : » NE PART JAMAIS DANS LE FLUX ═══════════════════
  //
  // `extraireSuites` la détache à la fin — mais en flux, « à la fin » est trop
  // tard : elle serait déjà passée à l'écran, et elle en repartirait. On
  // retient donc la DERNIÈRE LIGNE tant qu'elle commence comme une consigne de
  // suites, et seulement dans ce cas : un texte ordinaire n'est jamais retenu,
  // même d'un caractère.
  const DEBUT_SUITES = /^[ \t]*(?:\*\*)?[ \t]*(?:suites?|suggestions?|ensuite|next|siguientes?|a continuación)\b/i;
  const partieSure = (t) => {
    const coupe = t.lastIndexOf('\n');
    if (coupe < 0) return DEBUT_SUITES.test(t) ? '' : t;
    return DEBUT_SUITES.test(t.slice(coupe + 1)) ? t.slice(0, coupe + 1) : t;
  };

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
        const sur = partieSure(brut);
        if (sur.length > emis) { envoyer({ d: sur.slice(emis) }); emis = sur.length; }
      }
    }
  } catch (e) {
    journal(req, 'flux-rompu', t0, { message: String((e && e.message) || e).slice(0, 120), recu: brut.length });
    envoyer({ erreur: 'La réponse s\'est interrompue. Repose ta question.' });
    return res.end();
  }

  // Un tour d'outils : le texte éventuel ne compte pas (le modèle ne mélange
  // pas les deux, mais on ne le suppose pas — `appels` gagne, et le client a
  // reçu zéro `d` puisque la garde ci-dessus l'en empêche).
  if (appelsFn.length) {
    journal(req, 'flux-outils', t0, { appels: appelsFn.length, tours: contents.length });
    envoyer({ fin: { mode: 'outils', appels: appelsFn,
                     tourModele: { role: 'model', parts: partsModele } } });
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
    const r = await appelerGemini({ key, modeles: MODELES, corps: gReq,
                                    delaiMs: 28000, tentativesParModele: 1 });
    const parts = (r.ok && r.json && r.json.candidates && r.json.candidates[0]
                && r.json.candidates[0].content && r.json.candidates[0].content.parts) || [];
    const appelsRepli = parts.filter(p => p.functionCall).map(p => ({
      name: p.functionCall.name, args: p.functionCall.args || {} }));
    if (appelsRepli.length) {
      envoyer({ fin: { mode: 'outils', appels: appelsRepli,
                       tourModele: r.json.candidates[0].content } });
      return res.end();
    }
    brutFinal = parts.map(p => p.text || '').join('');
  }

  const propre = brutFinal.trim();
  if (!propre) {
    journal(req, 'flux-vide', t0, {});
    envoyer({ erreur: 'Flint n\'a rien répondu. Repose ta question.' });
    return res.end();
  }

  const { texte, suites } = extraireSuites(propre);
  journal(req, 'flux-reponse', t0, { tours: contents.length, sortie: texte.length,
                                     suites: suites.length, lang: langue, modele: g.modele });
  // Le reliquat : ce qu'on a retenu et qui n'était PAS une ligne de suites
  // (dernier paragraphe sans saut de ligne final, le cas ordinaire), plus la
  // correction si `extraireSuites` a coupé plus court que notre garde.
  if (texte.length > emis) envoyer({ d: texte.slice(emis) });
  // `tourModele` garde le texte BRUT, suites comprises : c'est l'historique que
  // le modèle relira, pas l'écran. Même règle que la branche non diffusée.
  envoyer({ fin: { mode: 'reponse', texte, suites,
                   tourModele: { role: 'model', parts: [{ text: brutFinal }] } } });
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
