// FLINT Coach v3 — un tour servi par Claude, de la requête préparée à la
// réponse que l'app lit. Appelé par coach.js SEULEMENT quand
// `COACH_FOURNISSEUR=anthropic` (voir _coach-claude.js).
//
// Même contrat que la branche Gemini, champ pour champ — `mode`, `appels`,
// `tourModele`, `libelles`, `texte`, `suites`, `retenir`, `memo`, `v`,
// `appelsGemini` (le nombre d'appels au MODÈLE, quel qu'il soit : c'est ce que
// `rejeu-coach.js` compte) — et mêmes formes de flux (`d`, `fin`, `erreur`).
// Ce qui s'ajoute, qu'une app posée ignore :
//   · `etapes` : une phrase par appel réellement demandé (« Lecture de tes 7
//     dernières nuits… ») ; `libelles` porte aussi ces phrases, par nom
//     d'outil, pour l'app d'aujourd'hui qui affiche `libelles[nom]` ;
//   · `redaction` : la phrase à montrer pendant que le modèle écrit, à partir
//     de ce qu'il a lu (« Rédaction de ta réponse à partir de tes 7 dernières
//     nuits… ») ;
//   · `blocs` : les blocs visuels validés (catalogue de _coach-v3.js) ;
//   · `fournisseur` : « anthropic » ;
//   · en flux, `{"etape":"…"}`, SEULEMENT si l'app annonce `capacites.etapes`
//     (une app d'avant ne reçoit que les trois formes qu'elle connaît).

const { extraireMeta, partieSureMeta, estTourQuestion } = require('./_coach-histoire');
const { LIBELLES } = require('./_coach-tools');
const { configClaude, versMessagesClaude, corpsClaude, appelerClaude, ouvrirClaudeFlux, evenementsClaude,
        assembleur, lireMessage, tourModeleOutils, usageJournal } = require('./_coach-claude');
const { libelleAppel, etapesDesAppels, libellesDuTour, libelleRedaction, extraireBlocs,
        partieSureBlocs } = require('./_coach-v3');

const TOURS_OUTILS_APP = 4;

// ═══ 17 NOV. 2026 — LE BATTEMENT DU FLUX ═══════════════════════════════════
//
// Pendant que Claude réfléchit (réflexion adaptative, tour d'outils), ce flux
// n'envoyait RIEN après « : ouvert ». L'app, elle, abandonne après 45 s sans
// un octet (CoachReseau.delaiMaxS, `timeoutInterval` d'URLRequest) et affiche
// « Flint met trop de temps à répondre ».
//
// Le battement est une ligne de COMMENTAIRE SSE (« : attente »), jamais un
// `data:` : tout lecteur SSE l'ignore, et celui de l'app aussi — vérifié dans
// CoachReseau.lireLeFlux de chaque build qui demande le flux (1.1 build
// 2045-2046, 1.2 builds 2049 à 2056, 1.3 build 2057, v3107) :
// `guard ligne.hasPrefix("data:") else { continue }`, première ligne de la
// boucle. Les builds plus anciens (1.0.1, 1.1 2043-2044) ne demandent pas le
// flux : ils reçoivent du JSON et ne voient jamais de battement.
//
// Il s'arrête au premier morceau de texte (le texte lui-même tient la ligne
// ouverte), à la fin de la réponse quelle qu'elle soit, et au plus tard
// `plafondMs` après l'arrivée de la requête : sous les 90 s de `maxDuration`
// (vercel.json), il ne fait jamais vivre la fonction plus longtemps.
// SEULEMENT ici, sur le chemin Claude : le flux Gemini reste à l'octet.
const BATTEMENT = { periodeMs: 15000, plafondMs: 80000, ligne: ': attente\n\n' };

function demarrerBattement(res, t0) {
  let minuteur = null;
  const arreter = () => { if (minuteur) { clearInterval(minuteur); minuteur = null; } };
  minuteur = setInterval(() => {
    if (res.writableEnded || res.destroyed || Date.now() - t0 >= BATTEMENT.plafondMs) return arreter();
    try { res.write(BATTEMENT.ligne); } catch (e) { arreter(); }
  }, BATTEMENT.periodeMs);
  return { arreter, actif: () => minuteur !== null };
}

// Un classifieur a décliné, et le secours aussi : une phrase, pas une panne —
// le fil reste vivant pour la question suivante.
const REFUS = {
  fr: "Je ne peux pas répondre à celle-là. Demande-moi plutôt ce que tu veux savoir sur ton sommeil, ta récupération, ton entraînement ou ta nutrition.",
  en: "I can't answer that one. Ask me about your sleep, recovery, training or nutrition instead.",
  es: 'No puedo responder a eso. Pregúntame mejor por tu sueño, tu recuperación, tu entrenamiento o tu nutrición.'
};

/** Les appels déjà exécutés pour la question EN COURS (pour la phrase de
 *  rédaction) — tours fabriqués compris : leurs données ont été lues. */
function appelsLus(contents) {
  const lus = [];
  const tours = Array.isArray(contents) ? contents : [];
  let i = tours.length - 1;
  while (i >= 0 && !estTourQuestion(tours[i])) i--;
  for (let k = i + 1; k < tours.length; k++) {
    const t = tours[k];
    if (!t || t.role !== 'model' || !Array.isArray(t.parts)) continue;
    for (const p of t.parts) {
      if (p && p.functionCall && typeof p.functionCall.name === 'string') {
        lus.push({ name: p.functionCall.name, args: p.functionCall.args || {} });
      }
    }
  }
  return lus;
}

/**
 * ctx : celui de coach.js, plus `prefixe`, `queue`, `outils`, `prepContents`,
 * `toursPris`, `flux`, `capEtapes`, `contents`.
 * aides : `journal`, `corpsReponse`, `memoFinal`, `COACH_VERSION`.
 */
async function repondreClaude(ctx, aides) {
  const { req, res, t0, langue, version, anodin, champs, meta } = ctx;
  const { journal, corpsReponse, memoFinal, COACH_VERSION } = aides;
  const claude = ctx.claude || configClaude();
  const L = LIBELLES[langue] ? langue : 'fr';

  const { messages, stats } = versMessagesClaude(ctx.prepContents);
  Object.assign(champs, { fournisseur: 'anthropic', modele: claude.modele, effort: claude.effort,
                          repris: stats.repris, reconstruits: stats.reconstruits });
  if (stats.orphelins) champs.orphelins = stats.orphelins;
  if (stats.combles) champs.combles = stats.combles;
  if (!messages.length) {
    journal(req, 'claude-sans-message', t0, champs);
    return res.status(400).json({ error: 'champ "contents" manquant ou vide', v: COACH_VERSION });
  }
  const sansOutils = ctx.toursPris >= TOURS_OUTILS_APP;
  const corps = corpsClaude({ config: claude, prefixe: ctx.prefixe, queue: ctx.queue, outils: ctx.outils,
                              messages, sansOutils, flux: ctx.flux });
  if (sansOutils) champs.sansOutils = 1;
  const lus = appelsLus(ctx.contents);

  const erreur502 = (r, n) => ({ error: 'Le Coach est indisponible à l\'instant. Réessaie dans un moment.',
                                 gemini: r.status, detail: r.detail, parcours: r.parcours || [], v: COACH_VERSION,
                                 appelsGemini: n, fournisseur: 'anthropic' });

  const corpsOutils = (lu, n) => ({
    mode: 'outils', appels: lu.appels, tourModele: tourModeleOutils(lu.content),
    libelles: libellesDuTour(LIBELLES[L], lu.appels, L),
    etapes: etapesDesAppels(lu.appels, L),
    redaction: libelleRedaction(lus.concat(lu.appels), L),
    v: COACH_VERSION, appelsGemini: n, fournisseur: 'anthropic'
  });

  const corpsTexte = (brut, n) => {
    // Les lignes « Blocs : » partent d'abord (elles sont au-dessus de
    // Retenir/Suites), puis `extraireMeta` fait ce qu'il fait pour Gemini.
    // Un message anodin n'a jamais de bloc, même si le modèle en écrit un.
    const b = extraireBlocs(brut);
    const { texte, suites, retenir } = extraireMeta(b.texte, meta);
    const o = corpsReponse({ texte, suites, retenir, version, gemini: n,
                             tourModele: { role: 'model', parts: [{ text: brut }] },
                             memo: memoFinal(ctx, texte) });
    o.blocs = anodin ? [] : b.blocs;
    o.fournisseur = 'anthropic';
    return { corps: o, texte, suites, retenir, blocs: o.blocs, rejetes: anodin ? b.lignes : b.rejetes.length };
  };

  const corpsRefus = (n) => {
    const texte = REFUS[L];
    const o = corpsReponse({ texte, suites: [], retenir: [], version, gemini: n,
                             tourModele: { role: 'model', parts: [{ text: texte }] }, memo: null });
    o.blocs = [];
    o.fournisseur = 'anthropic';
    o.refus = true;
    return o;
  };

  // ═══ EN JSON ══════════════════════════════════════════════════════════════
  if (!ctx.flux) {
    // 40 s, sous les 45 s de patience de l'app (`delaiMaxS`, CoachReseau.swift) ;
    // un délai dépassé ne se réessaie pas (_coach-claude.js).
    const r = await appelerClaude({ config: claude, corps, delaiMs: 40000, tentatives: 2 });
    const n = r.tentatives || 0;
    if (!r.ok) {
      journal(req, 'claude-indisponible', t0, Object.assign({ statut: r.status, parcours: (r.parcours || []).join(' ') }, champs, { gemini: n }));
      return res.status(502).json(erreur502(r, n));
    }
    if (r.cleN) champs.cle = r.cleN;   // deux clés : laquelle a payé (le rang, jamais la clé)
    const lu = lireMessage(r.json);
    const u = usageJournal(r.json);
    if (lu.refus) {
      journal(req, 'refus', t0, Object.assign({ categorie: lu.categorie || '-' }, champs, u, { gemini: n }));
      return res.status(200).json(corpsRefus(n));
    }
    if (lu.appels) {
      journal(req, 'outils', t0, Object.assign({ appels: lu.appels.length }, champs, u, { gemini: n }));
      return res.status(200).json(corpsOutils(lu, n));
    }
    if (lu.vide) {
      journal(req, 'claude-vide', t0, Object.assign({ raison: lu.raison.replace(/\s+/g, '_') }, champs, u, { gemini: n }));
      return res.status(502).json({ error: 'réponse du modèle sans texte ni outil', v: COACH_VERSION, appelsGemini: n,
                                    fournisseur: 'anthropic' });
    }
    const t = corpsTexte(lu.texte.trim(), n);
    journal(req, 'reponse', t0, Object.assign({ sortie: t.texte.length, suites: t.suites.length, retenir: t.retenir.length,
                                                blocs: t.blocs.length, blocsRetires: t.rejetes, lang: langue }, champs, u, { gemini: n }));
    return res.status(200).json(t.corps);
  }

  // ═══ EN FLUX ══════════════════════════════════════════════════════════════
  // Mêmes garanties que `repondreEnFlux` (coach.js) : les en-têtes SSE ne
  // partent qu'après une ouverture réussie, « Suites »/« Retenir »/« Blocs »
  // ne passent jamais dans un `d`, un flux muet se rattrape par un appel JSON,
  // et `fin.texte` fait foi.
  const o = await ouvrirClaudeFlux({ config: claude, corps, delaiMs: 28000, tentatives: 2 });
  let n = o.tentatives || 0;
  if (!o.ok) {
    journal(req, 'flux-indisponible', t0, Object.assign({ statut: o.status, parcours: (o.parcours || []).join(' ') }, champs, { gemini: n }));
    return res.status(502).json(erreur502(o, n));
  }
  if (o.cleN) champs.cle = o.cleN;
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-store, no-transform',
    'X-Content-Type-Options': 'nosniff',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  res.write(': ouvert\n\n');
  const battement = demarrerBattement(res, t0);
  const envoyer = (x) => {
    if (typeof x.d === 'string') battement.arreter();   // le texte tient la ligne ouverte
    return res.write('data: ' + JSON.stringify(x) + '\n\n');
  };
  try {
    return await diffuser();
  } finally {
    battement.arreter();
  }

  async function diffuser() {
    if (ctx.capEtapes && lus.length) envoyer({ etape: libelleRedaction(lus, L) });

    const asm = assembleur();
    let emis = 0;
    // ═══ UNE PHRASE AVANT UN OUTIL NE S'AFFICHE PAS ═══════════════════════════
    // Claude peut écrire une ligne (« Je regarde tes nuits. ») PUIS appeler un
    // outil ; une fois diffusée, elle serait à l'écran d'un tour d'outils. Le
    // texte ne part donc qu'à son PREMIER saut de ligne — la ligne de verdict
    // finie — et plus jamais dès qu'un appel d'outil a commencé.
    let relache = false;
    try {
      for await (const ev of evenementsClaude(o.reponse)) {
        const info = asm.appliquer(ev);
        if (info.erreur) throw new Error(info.erreur);
        if (info.outil && ctx.capEtapes) {
          const t = libelleAppel(info.outil.name, info.outil.args, L);
          if (t) envoyer({ etape: t });
        }
        if (asm.aOutil()) continue;
        const brut = asm.texte();
        if (!relache) { if (brut.indexOf('\n') < 0) continue; relache = true; }
        const sur = partieSureMeta(partieSureBlocs(brut), meta);
        if (sur.length > emis) { envoyer({ d: sur.slice(emis) }); emis = sur.length; }
      }
    } catch (e) {
      journal(req, 'flux-rompu', t0, { message: String((e && e.message) || e).slice(0, 120).replace(/\s+/g, '_'),
                                       recu: asm.texte().length, gemini: n, fournisseur: 'anthropic' });
      envoyer({ erreur: 'La réponse s\'est interrompue. Repose ta question.' });
      return res.end();
    }

    let msg = asm.message();
    let lu = lireMessage(msg);
    // Le filet de Gemini, à l'identique : un flux qui n'a rien rendu est refait
    // par l'ancien chemin, avec le MÊME corps (sans `stream`).
    if (lu.vide && !/^appel coupé/.test(lu.raison)) {
      journal(req, 'flux-vide-repli', t0, { modele: claude.modele, fournisseur: 'anthropic' });
      const corpsBloc = Object.assign({}, corps);
      delete corpsBloc.stream;
      const r = await appelerClaude({ config: claude, corps: corpsBloc, delaiMs: 28000, tentatives: 1 });
      n += r.tentatives || 0;
      if (r.ok) { msg = r.json; lu = lireMessage(msg); }
    }
    const u = usageJournal(msg);
    if (lu.refus) {
      journal(req, 'flux-refus', t0, Object.assign({ categorie: lu.categorie || '-' }, champs, u, { gemini: n }));
      envoyer({ fin: corpsRefus(n) });
      return res.end();
    }
    if (lu.appels) {
      journal(req, 'flux-outils', t0, Object.assign({ appels: lu.appels.length }, champs, u, { gemini: n }));
      envoyer({ fin: corpsOutils(lu, n) });
      return res.end();
    }
    if (lu.vide) {
      journal(req, 'flux-vide', t0, Object.assign({ raison: lu.raison.replace(/\s+/g, '_') }, champs, u, { gemini: n }));
      envoyer({ erreur: 'Flint n\'a rien répondu. Repose ta question.' });
      return res.end();
    }
    const t = corpsTexte(lu.texte.trim(), n);
    journal(req, 'flux-reponse', t0, Object.assign({ sortie: t.texte.length, suites: t.suites.length, retenir: t.retenir.length,
                                                     blocs: t.blocs.length, blocsRetires: t.rejetes, lang: langue }, champs, u, { gemini: n }));
    if (t.texte.length > emis) envoyer({ d: t.texte.slice(emis) });
    envoyer({ fin: t.corps });
    return res.end();
  }
}

module.exports = { repondreClaude, appelsLus, REFUS, BATTEMENT };
