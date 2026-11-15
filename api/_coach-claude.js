// FLINT Coach — le second fournisseur : Claude (API Messages d'Anthropic).
//
// ═══ 15 NOV. 2026 — DERRIÈRE UNE VARIABLE, ET SEULEMENT DERRIÈRE ELLE ═══════
//
// « Dans le futur il va tourner sur du Opus 5.5. On va changer la clé API. »
// Ce fichier n'est lu que si `COACH_FOURNISSEUR=anthropic`. Sans cette
// variable, coach.js ne l'appelle jamais et Gemini sert exactement comme
// avant : c'est épinglé à l'octet par tests/test-coach-or-gemini.js.
//
// LE CONTRAT VERS L'APP NE BOUGE PAS. L'app parle « Gemini » : `contents` en
// tours {role, parts:[{text}|{functionCall}|{functionResponse}]}, et elle
// range `tourModele` tel qu'on le lui rend. On traduit donc dans les deux
// sens, ICI et nulle part ailleurs :
//   · à l'aller, les tours Gemini (déjà préparés par preparerPourGemini :
//     marqueurs retirés, réponses adaptées, talons) deviennent des messages
//     Claude — functionCall → tool_use, functionResponse → tool_result ;
//   · au retour, le message de Claude redevient un tour Gemini. Les blocs
//     bruts de Claude (raisonnement compris) voyagent dans le `thoughtSignature`
//     du premier functionCall — le seul champ dont on SAIT que l'app le
//     renvoie intact, puisque Gemini 3 répond 400 sans lui.
//
// PAS DE PAQUET NPM : le dépôt n'en a aucun (pas de package.json), et Gemini
// est déjà appelé en `fetch` direct. Même choix ici, avec les formes exactes
// de l'API Messages (en-têtes, blocs, événements SSE) prises dans la
// documentation, pas de mémoire.
//
// CE QUI EST PROPRE À CLAUDE OPUS 5.5 ET QUI COMMANDE LA FORME :
//   · la réflexion est toujours active (`thinking.type = adaptive`), l'effort
//     la règle (`output_config.effort`, `medium` par défaut chez lui : on le
//     pose EXPLICITEMENT) ; elle compte dans `max_tokens` ;
//   · les blocs de réflexion sont liés à la conversation : un historique
//     modifié les invalide. Notre serveur RÉÉCRIT l'historique (talons,
//     coupes au budget, instantané dans le système) : on ne renvoie donc que
//     ceux de la QUESTION EN COURS (retirer une série de tête est permis), et
//     on demande à l'API de les LAISSER TOMBER plutôt que de répondre 400 si
//     quelque chose a bougé (`prefix_mismatch_behavior: drop_block`) ;
//   · `tool_choice` « any »/« tool » est refusé : on n'utilise que « auto »
//     (par défaut) et « none » (le 4e tour, comme `functionCallingConfig: NONE`) ;
//   · un classifieur peut décliner (`stop_reason: refusal`, HTTP 200) : on
//     demande le secours côté serveur (`fallbacks: "default"`) et on traite
//     le refus avant de lire `content`.

const { sansCle } = require('./_lib');
const { estTourQuestion } = require('./_coach-histoire');

const URL_MESSAGES = 'https://api.anthropic.com/v1/messages';
const VERSION_API = '2026-10-21';
const MODELE_DEFAUT = 'claude-opus-5-5';
const BETA_SECOURS = 'server-side-fallback-2026-07-01';
const BETA_LIAISON = 'thinking-binding-controls-2026-08-01';
// Les modèles qui acceptent `fallbacks: "default"` (documentation du 3 nov.).
const MODELES_AVEC_SECOURS = new Set(['claude-opus-5-5', 'claude-opus-5', 'claude-fable-5-2', 'claude-fable-5-1', 'claude-sonnet-5-5']);
const EFFORTS = new Set(['low', 'medium', 'high', 'xhigh', 'max']);
// Une réponse du Coach fait 50 à 130 mots ; la réflexion compte en plus. 16 000
// laisse toute la place sans changer la longueur, que le prompt tient.
const MAX_TOKENS = 16000;
const REESSAYABLES = new Set([429, 500, 502, 503, 504, 529]);

/**
 * La configuration, lue UNE fois par requête. `null` = Gemini (la production).
 * COACH_MODELE et COACH_EFFORT sont facultatifs ; COACH_CLAUDE_SECOURS=0 coupe
 * le secours côté serveur (un modèle qui ne le connaît pas répondrait 400).
 */
function configClaude(env) {
  const e = env || process.env;
  if (e.COACH_FOURNISSEUR !== 'anthropic') return null;
  const modele = /^[a-z0-9][a-z0-9.-]{2,63}$/.test(e.COACH_MODELE || '') ? e.COACH_MODELE : MODELE_DEFAUT;
  // Deux clés au plus, dans l'ordre : la seconde prend le relais quand la
  // première n'a plus de crédit (voir « DEUX CLÉS, UN RELAIS » plus bas).
  const cles = [e.ANTHROPIC_API_KEY, e.ANTHROPIC_API_KEY_2].filter((c) => typeof c === 'string' && c.length > 0);
  return {
    cle: e.ANTHROPIC_API_KEY || '',
    cles,
    modele,
    effort: EFFORTS.has(e.COACH_EFFORT) ? e.COACH_EFFORT : 'medium',
    secours: e.COACH_CLAUDE_SECOURS !== '0' && MODELES_AVEC_SECOURS.has(modele)
  };
}

// ─── LES OUTILS ─────────────────────────────────────────────────────────────

/** Une déclaration Gemini ({name, description, parameters}) → un outil Claude. */
function versOutilClaude(o) {
  const p = o && o.parameters && typeof o.parameters === 'object' ? o.parameters : {};
  const schema = Object.assign({ type: 'object' }, p);
  if (!schema.properties || typeof schema.properties !== 'object') schema.properties = {};
  return { name: o.name, description: o.description || '', input_schema: schema };
}

// ─── LE TOUR MODÈLE : CE QUE L'APP RANGE ─────────────────────────────────────

const PREFIXE_SIG = 'flint-claude:v1:';
// Au-delà, on ne range pas les blocs bruts : la part resterait sous les 64 Ko
// du gabarit (coach.js), et un tour reconstruit sans réflexion reste valide.
const SIG_MAX = 48 * 1024;

/**
 * Ce qu'on peut renvoyer à l'API d'un message de Claude. Après un secours en
 * cours de réponse, la documentation demande d'omettre réflexion et appels
 * d'outils AVANT le dernier bloc `fallback`, en gardant ce bloc à sa place.
 */
function contenuAEcho(content) {
  const c = Array.isArray(content) ? content : [];
  let dernierSecours = -1;
  c.forEach((b, i) => { if (b && b.type === 'fallback') dernierSecours = i; });
  const sortie = [];
  c.forEach((b, i) => {
    if (!b || typeof b !== 'object') return;
    if (i < dernierSecours && b.type !== 'text' && b.type !== 'fallback') return;
    const copie = Object.assign({}, b);
    delete copie._json; delete copie._invalide;
    sortie.push(copie);
  });
  return sortie;
}

function encoderContenu(content) {
  try {
    const s = PREFIXE_SIG + Buffer.from(JSON.stringify(content), 'utf8').toString('base64');
    return s.length <= SIG_MAX ? s : null;
  } catch (e) { return null; }
}
function decoderContenu(sig) {
  if (typeof sig !== 'string' || !sig.startsWith(PREFIXE_SIG)) return null;
  try {
    const c = JSON.parse(Buffer.from(sig.slice(PREFIXE_SIG.length), 'base64').toString('utf8'));
    return Array.isArray(c) ? c : null;
  } catch (e) { return null; }
}

/** Les appels d'un message de Claude, dans l'ordre : `[{ name, args, id }]`. */
function appelsDe(content) {
  return (Array.isArray(content) ? content : [])
    .filter((b) => b && b.type === 'tool_use' && typeof b.name === 'string' && !b._invalide)
    .map((b) => ({ name: b.name, args: b.input && typeof b.input === 'object' && !Array.isArray(b.input) ? b.input : {}, id: b.id }));
}

/** Le tour Gemini qu'on rend à l'app pour un tour d'outils de Claude. */
function tourModeleOutils(content) {
  const appels = appelsDe(content);
  const parts = appels.map((a) => ({ functionCall: { name: a.name, args: a.args, id: a.id } }));
  const sig = parts.length ? encoderContenu(contenuAEcho(content)) : null;
  if (sig) parts[0].thoughtSignature = sig;
  return { role: 'model', parts };
}

// ─── L'ALLER : LES TOURS GEMINI DEVIENNENT DES MESSAGES CLAUDE ──────────────

const ID_VALIDE = /^[A-Za-z0-9_-]{1,128}$/;
const estObjet = (x) => !!x && typeof x === 'object' && !Array.isArray(x);

/** Les blocs bruts rangés valent-ils pour CE tour (mêmes appels, même ordre) ? */
function concorde(contenu, appelsParts) {
  const tu = contenu.filter((b) => b && b.type === 'tool_use');
  return tu.length === appelsParts.length && tu.every((b, k) => b.name === appelsParts[k].functionCall.name
    && typeof b.id === 'string' && ID_VALIDE.test(b.id));
}

/**
 * `contents` (tours Gemini préparés) → `{ messages, stats }` pour l'API.
 * Règles que l'API impose et qu'on tient ici, quoi que l'historique porte :
 *   · chaque tool_use a son tool_result dans le message `user` qui suit
 *     (une réponse absente devient un résultat en erreur, jamais un trou) ;
 *   · un tool_result sans appel est retiré ; les tool_result passent en tête ;
 *   · deux messages de même rôle se fondent ; on commence et on finit par
 *     `user` (Opus 5.5 refuse un message assistant final : pas de prefill).
 */
function versMessagesClaude(contents) {
  const stats = { repris: 0, reconstruits: 0, orphelins: 0, combles: 0 };
  const tours = Array.isArray(contents) ? contents : [];
  let L = -1;
  for (let i = tours.length - 1; i >= 0; i--) if (estTourQuestion(tours[i])) { L = i; break; }

  // 1. Chaque tour, seul.
  const bruts = [];
  tours.forEach((t, i) => {
    if (!estObjet(t)) return;
    const parts = Array.isArray(t.parts) ? t.parts.filter(estObjet) : [];
    if (t.role === 'model') {
      const appelsP = parts.filter((p) => estObjet(p.functionCall) && typeof p.functionCall.name === 'string');
      let content = null;
      // Seuls les tours de la question EN COURS rendent leurs blocs bruts.
      if (i > L && appelsP.length) {
        const c = decoderContenu(appelsP[0].thoughtSignature);
        if (c && concorde(c, appelsP)) { content = c; stats.repris++; }
      }
      if (!content) {
        content = [];
        let k = 0;
        for (const p of parts) {
          if (p.thought === true) continue;
          if (estObjet(p.functionCall) && typeof p.functionCall.name === 'string') {
            const id = typeof p.functionCall.id === 'string' && ID_VALIDE.test(p.functionCall.id) ? p.functionCall.id : 'toolu_flint_' + i + '_' + k;
            k++;
            content.push({ type: 'tool_use', id, name: p.functionCall.name,
                           input: estObjet(p.functionCall.args) ? p.functionCall.args : {} });
          } else if (typeof p.text === 'string' && p.text.trim()) {
            content.push({ type: 'text', text: p.text });
          }
        }
        if (appelsP.length) stats.reconstruits++;
      }
      if (content.length) bruts.push({ role: 'assistant', content });
    } else {
      const content = [];
      for (const p of parts) {
        if (estObjet(p.functionResponse)) content.push({ _reponse: p.functionResponse });
        else if (typeof p.text === 'string' && p.text.trim()) content.push({ type: 'text', text: p.text });
      }
      if (content.length) bruts.push({ role: 'user', content });
    }
  });

  // 2. Les rôles fondus.
  const fondre = (liste) => {
    const out = [];
    for (const m of liste) {
      const prec = out[out.length - 1];
      if (prec && prec.role === m.role) prec.content = prec.content.concat(m.content);
      else out.push({ role: m.role, content: m.content.slice() });
    }
    return out;
  };
  let msgs = fondre(bruts);

  // 3. Les réponses d'outils rattachées à leurs appels.
  for (let i = 0; i < msgs.length; i++) {
    const m = msgs[i];
    if (m.role !== 'user') continue;
    const prec = msgs[i - 1];
    const appels = prec && prec.role === 'assistant' ? prec.content.filter((b) => b.type === 'tool_use') : [];
    const pris = new Set();
    const resultats = [];
    const textes = [];
    for (const b of m.content) {
      if (!b._reponse) { textes.push(b); continue; }
      const fr = b._reponse;
      let j = fr.id !== undefined ? appels.findIndex((a, k) => !pris.has(k) && a.id === fr.id) : -1;
      if (j < 0) j = appels.findIndex((a, k) => !pris.has(k) && a.name === fr.name);
      // Le rang seulement pour une réponse SANS nom : un nom qui ne correspond
      // à aucun appel n'est pas la réponse d'un autre outil.
      if (j < 0 && typeof fr.name !== 'string') j = appels.findIndex((a, k) => !pris.has(k));
      if (j < 0) { stats.orphelins++; continue; }
      pris.add(j);
      let texte;
      try { texte = JSON.stringify(fr.response === undefined ? null : fr.response); } catch (e) { texte = '{"qualite":"expired","raison":"réponse illisible"}'; }
      resultats.push({ k: j, bloc: { type: 'tool_result', tool_use_id: appels[j].id, content: texte } });
    }
    appels.forEach((a, k) => {
      if (pris.has(k)) return;
      stats.combles++;
      resultats.push({ k, bloc: { type: 'tool_result', tool_use_id: a.id, is_error: true,
        content: '{"qualite":"missing","raison":"l\'app n\'a pas rendu ce résultat"}' } });
    });
    resultats.sort((a, b) => a.k - b.k);
    m.content = resultats.map((r) => r.bloc).concat(textes);
  }
  // Un assistant qui appelle des outils et que rien ne suit : on lui donne
  // son message de résultats (comblés), pour que l'appariement tienne.
  for (let i = 0; i < msgs.length; i++) {
    const m = msgs[i];
    if (m.role !== 'assistant') continue;
    const appels = m.content.filter((b) => b.type === 'tool_use');
    if (!appels.length || (msgs[i + 1] && msgs[i + 1].role === 'user')) continue;
    stats.combles += appels.length;
    msgs.splice(i + 1, 0, { role: 'user', content: appels.map((a) => ({ type: 'tool_result', tool_use_id: a.id, is_error: true,
      content: '{"qualite":"missing","raison":"l\'app n\'a pas rendu ce résultat"}' })) });
  }

  // 4. Messages vides retirés, rôles refondus, bornes.
  msgs = fondre(msgs.filter((m) => m.content.length));
  while (msgs.length && msgs[0].role !== 'user') msgs.shift();
  while (msgs.length && msgs[msgs.length - 1].role !== 'user') msgs.pop();
  return { messages: msgs, stats };
}

// ─── LE CORPS DE LA REQUÊTE ─────────────────────────────────────────────────

/**
 * Le système en DEUX blocs : le préfixe statique (identique pour tous, mis en
 * cache avec les outils qui le précèdent), puis la queue qui varie (langue,
 * ton, mémoire, données). C'est la même coupe que pour Gemini, rendue
 * explicite : Claude ne met en cache que ce qu'on lui marque.
 */
function corpsClaude({ config, prefixe, queue, outils, messages, sansOutils, flux }) {
  const corps = {
    model: config.modele,
    max_tokens: MAX_TOKENS,
    system: [{ type: 'text', text: prefixe, cache_control: { type: 'ephemeral' } }]
      .concat(queue && queue.trim() ? [{ type: 'text', text: queue }] : []),
    tools: (outils || []).map(versOutilClaude),
    messages,
    thinking: { type: 'adaptive', block_binding: { prefix_mismatch_behavior: 'drop_block' } },
    output_config: { effort: config.effort }
  };
  // Les outils restent DÉCLARÉS : le préfixe ne change pas (cache, réflexion).
  if (sansOutils) corps.tool_choice = { type: 'none' };
  if (config.secours) corps.fallbacks = 'default';
  if (flux) corps.stream = true;
  return corps;
}

function entetes(config) {
  const betas = [BETA_LIAISON].concat(config.secours ? [BETA_SECOURS] : []);
  return { 'content-type': 'application/json', 'x-api-key': config.cle, 'anthropic-version': VERSION_API,
           'anthropic-beta': betas.join(',') };
}

/** Le message d'erreur de l'API, court, sans la clé. */
function detailErreur(texte, cle) {
  let d = texte;
  try { const j = JSON.parse(texte); if (j && j.error && j.error.message) d = (j.error.type || '') + ': ' + j.error.message; } catch (e) { /* brut */ }
  return sansCle(String(d || '').slice(0, 400), cle);
}

// ─── 15 NOV. 2026 (soir) — DEUX CLÉS, UN RELAIS ─────────────────────────────
// Dino et Félix ont chacun un abonnement qui crédite chaque mois SA propre
// organisation de la Console. `ANTHROPIC_API_KEY` sert d'abord ;
// `ANTHROPIC_API_KEY_2`, facultative, prend le relais quand la première répond
// « crédit épuisé » ou « plafond de dépense atteint ». Rien ne passe d'une
// organisation à l'autre : chaque appel est payé par l'organisation de la clé
// qui l'a fait. Toute autre erreur (400 d'une requête fausse, 401, 429, 5xx)
// garde la politique d'avant : on ne change PAS de clé pour elle.
// Une clé épuisée est mise de côté une heure dans cette instance : le crédit
// revient au mois suivant, et une recharge se voit au plus une heure après.
const PAUSE_CLE_EPUISEE_MS = 60 * 60 * 1000;
const clesEpuisees = new Map(); // rang de la clé (0, 1) → fin de la pause (ms)

/** « Plus de crédit » ou « plafond de dépense atteint » — le texte de l'API. */
function creditEpuise(status, texte) {
  if (status !== 400 && status !== 402 && status !== 403) return false;
  return /credit balance is too low|reached your specified api usage limits|spend limit/i.test(String(texte || ''));
}

/** L'ordre des essais : les clés disponibles d'abord, les épuisées ensuite. */
function ordreDesCles(config, maintenant) {
  const t = maintenant == null ? Date.now() : maintenant;
  const cles = Array.isArray(config.cles) && config.cles.length ? config.cles : [config.cle || ''];
  const rangs = cles.map((cle, i) => ({ i, cle }));
  const libre = (r) => !(clesEpuisees.get(r.i) > t);
  return rangs.filter(libre).concat(rangs.filter((r) => !libre(r)));
}

/** `essai(cfg)` avec chaque clé tour à tour, tant que la clé est épuisée. */
async function parCle(config, essai) {
  const ordre = ordreDesCles(config);
  const parcours = [];
  let total = 0, dernier = null;
  for (const { i, cle } of ordre) {
    const r = await essai(Object.assign({}, config, { cle }));
    total += r.tentatives || 0;
    parcours.push(...(r.parcours || []));
    r.tentatives = total;
    r.parcours = parcours;
    // Avec deux clés, le journal dit laquelle a payé (jamais la clé elle-même).
    if (ordre.length > 1) r.cleN = i + 1;
    if (r.ok) { clesEpuisees.delete(i); return r; }
    if (!r.creditEpuise) return r;
    clesEpuisees.set(i, Date.now() + PAUSE_CLE_EPUISEE_MS);
    parcours.push('clé' + (i + 1) + ':crédit-épuisé');
    dernier = r;
  }
  return dernier;
}

// ─── LES APPELS ─────────────────────────────────────────────────────────────

/**
 * Un appel complet (JSON). Même politique que `appelerGemini` : on réessaie un
 * statut passager (429, 5xx, 529 « overloaded ») une fois, jamais un 4xx.
 * Avec deux clés, un crédit épuisé passe à la suivante (`parCle`).
 * Rendu : { ok, status, json, detail, tentatives, parcours, cleN? }.
 */
async function appelerClaude(o) {
  return parCle(o.config, (config) => appelerUneCle(Object.assign({}, o, { config })));
}

async function appelerUneCle({ config, corps, delaiMs, tentatives, attenteMs }) {
  const essais = Math.max(1, tentatives || 2);
  const delai = Math.max(1000, delaiMs || 40000);
  const parcours = [];
  let dernier = { ok: false, status: 0, detail: 'aucune tentative', tentatives: 0, parcours };
  for (let n = 1; n <= essais; n++) {
    const ctrl = new AbortController();
    const minuteur = setTimeout(() => ctrl.abort(), delai);
    try {
      const r = await fetch(URL_MESSAGES, { method: 'POST', headers: entetes(config),
                                            body: JSON.stringify(corps), signal: ctrl.signal });
      const texte = await r.text();
      if (r.ok) {
        let json = null;
        try { json = JSON.parse(texte); } catch (e) { json = null; }
        return { ok: !!json, status: r.status, json, tentatives: n, parcours,
                 detail: json ? '' : 'réponse illisible' };
      }
      parcours.push(config.modele + ':' + r.status);
      dernier = { ok: false, status: r.status, detail: detailErreur(texte, config.cle), tentatives: n, parcours,
                  creditEpuise: creditEpuise(r.status, texte) };
      if (!REESSAYABLES.has(r.status)) return dernier;
    } catch (e) {
      const delaiDepasse = e && e.name === 'AbortError';
      parcours.push(config.modele + ':' + (delaiDepasse ? 'délai' : 'panne'));
      dernier = { ok: false, status: 0, tentatives: n, parcours,
                  detail: delaiDepasse ? `délai de ${delai} ms dépassé` : sansCle(String((e && e.message) || e).slice(0, 200), config.cle) };
      // Un délai a déjà mangé la patience de l'app (45 s) : pas de second essai.
      if (delaiDepasse) return dernier;
    } finally {
      clearTimeout(minuteur);
    }
    if (n < essais) await new Promise((res) => setTimeout(res, attenteMs == null ? 800 : attenteMs));
  }
  return dernier;
}

/** L'OUVERTURE d'un flux (même règle que `ouvrirGeminiFlux` : on ne réessaie
 *  qu'avant le premier octet, et c'est là aussi qu'une clé épuisée passe la
 *  main). Rendu : { ok, reponse, status, detail, tentatives, parcours, cleN? }. */
async function ouvrirClaudeFlux(o) {
  return parCle(o.config, (config) => ouvrirUneCle(Object.assign({}, o, { config })));
}

async function ouvrirUneCle({ config, corps, delaiMs, tentatives, attenteMs }) {
  const essais = Math.max(1, tentatives || 2);
  const delai = Math.max(1000, delaiMs || 28000);
  const parcours = [];
  let dernier = { ok: false, status: 0, detail: 'aucune tentative', tentatives: 0, parcours };
  for (let n = 1; n <= essais; n++) {
    const ctrl = new AbortController();
    const minuteur = setTimeout(() => ctrl.abort(), delai);
    try {
      const r = await fetch(URL_MESSAGES, { method: 'POST', headers: entetes(config),
                                            body: JSON.stringify(corps), signal: ctrl.signal });
      if (r.ok && r.body) { clearTimeout(minuteur); return { ok: true, status: r.status, reponse: r, tentatives: n, parcours }; }
      const texte = await r.text().catch(() => '');
      parcours.push(config.modele + ':' + r.status);
      dernier = { ok: false, status: r.status, detail: detailErreur(texte, config.cle), tentatives: n, parcours,
                  creditEpuise: creditEpuise(r.status, texte) };
      if (!REESSAYABLES.has(r.status)) return dernier;
    } catch (e) {
      const delaiDepasse = e && e.name === 'AbortError';
      parcours.push(config.modele + ':' + (delaiDepasse ? 'délai' : 'panne'));
      dernier = { ok: false, status: 0, tentatives: n, parcours,
                  detail: delaiDepasse ? `délai de ${delai} ms dépassé` : sansCle(String((e && e.message) || e).slice(0, 200), config.cle) };
      if (delaiDepasse) return dernier;
    } finally {
      clearTimeout(minuteur);
    }
    if (n < essais) await new Promise((res) => setTimeout(res, attenteMs == null ? 800 : attenteMs));
  }
  return dernier;
}

/**
 * Les événements SSE de l'API Messages, un objet `data` par événement
 * (`message_start`, `content_block_start`, `content_block_delta`,
 * `content_block_stop`, `message_delta`, `message_stop`, `ping`, `error`).
 * Même tampon et même normalisation CRLF que `partsDuFlux` (_lib.js), pour
 * la même raison : un paquet réseau ne s'aligne jamais sur un événement.
 */
async function* evenementsClaude(reponse) {
  const lecteur = reponse.body.getReader();
  const decodeur = new TextDecoder();
  let tampon = '';
  const rendre = function* (bloc) {
    const donnees = bloc.split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice(5).replace(/^ /, '')).join('\n');
    if (!donnees.trim()) return;
    let j = null;
    try { j = JSON.parse(donnees); } catch (e) { return; }
    if (j && typeof j === 'object') yield j;
  };
  while (true) {
    const { done, value } = await lecteur.read();
    if (done) break;
    tampon += decodeur.decode(value, { stream: true }).replace(/\r\n?/g, '\n');
    let coupe;
    while ((coupe = tampon.indexOf('\n\n')) >= 0) {
      const bloc = tampon.slice(0, coupe);
      tampon = tampon.slice(coupe + 2);
      yield* rendre(bloc);
    }
  }
  if (tampon.trim()) yield* rendre(tampon);
}

/**
 * Recompose le message à partir des événements, comme le ferait le SDK.
 * `appliquer(ev)` rend ce qui vient de se passer : `{ texte }` (un morceau de
 * texte), `{ outil }` (un appel complet, arguments lus), `{ erreur }`, ou {}.
 */
function assembleur() {
  const msg = { content: [], stop_reason: null, stop_details: null, model: null, usage: null, input_transformations: null };
  return {
    message: () => msg,
    aOutil: () => msg.content.some((b) => b && b.type === 'tool_use'),
    texte: () => msg.content.filter((b) => b && b.type === 'text').map((b) => b.text || '').join(''),
    appliquer(ev) {
      switch (ev.type) {
        case 'message_start': {
          const m = ev.message || {};
          msg.model = m.model || null;
          msg.usage = m.usage || null;
          if (Array.isArray(m.input_transformations)) msg.input_transformations = m.input_transformations;
          return {};
        }
        case 'content_block_start': {
          const b = Object.assign({}, ev.content_block || {});
          if (b.type === 'text') b.text = b.text || '';
          if (b.type === 'tool_use') { b._json = ''; if (!estObjet(b.input)) b.input = {}; }
          if (b.type === 'thinking') { b.thinking = b.thinking || ''; b.signature = b.signature || ''; }
          msg.content[ev.index] = b;
          return {};
        }
        case 'content_block_delta': {
          const b = msg.content[ev.index];
          const d = ev.delta || {};
          if (!b) return {};
          if (d.type === 'text_delta') { b.text += d.text || ''; return { texte: d.text || '' }; }
          if (d.type === 'input_json_delta') { b._json += d.partial_json || ''; return {}; }
          if (d.type === 'thinking_delta') { b.thinking += d.thinking || ''; return {}; }
          if (d.type === 'signature_delta') { b.signature += d.signature || ''; return {}; }
          return {};
        }
        case 'content_block_stop': {
          const b = msg.content[ev.index];
          if (b && b.type === 'tool_use') {
            if (b._json.trim()) {
              try { const x = JSON.parse(b._json); if (estObjet(x)) b.input = x; else b._invalide = true; } catch (e) { b._invalide = true; }
            }
            delete b._json;
            return b._invalide ? {} : { outil: { name: b.name, args: b.input, id: b.id } };
          }
          return {};
        }
        case 'message_delta': {
          const d = ev.delta || {};
          if (d.stop_reason !== undefined) msg.stop_reason = d.stop_reason;
          if (d.stop_details !== undefined) msg.stop_details = d.stop_details;
          if (ev.usage) msg.usage = Object.assign({}, msg.usage || {}, ev.usage);
          if (Array.isArray(ev.input_transformations)) msg.input_transformations = ev.input_transformations;
          return {};
        }
        case 'error':
          return { erreur: (ev.error && (ev.error.type + ': ' + ev.error.message)) || 'erreur du flux' };
        default:
          return {};
      }
    }
  };
}

/**
 * Ce que dit un message complet (JSON ou recomposé) :
 * { refus, categorie } | { appels, content } | { texte } | { vide, raison }.
 * Le refus d'abord — jamais `content[0]` sans avoir lu `stop_reason`.
 */
function lireMessage(msg) {
  const m = msg || {};
  const content = Array.isArray(m.content) ? m.content.filter(Boolean) : [];
  if (m.stop_reason === 'refusal') {
    return { refus: true, categorie: (m.stop_details && m.stop_details.category) || null };
  }
  const appels = appelsDe(content);
  if (appels.length && m.stop_reason === 'tool_use') return { appels, content };
  // Un appel coupé par `max_tokens` (arguments incomplets) ne s'exécute pas.
  if (content.some((b) => b.type === 'tool_use') && m.stop_reason === 'max_tokens') return { vide: true, raison: 'appel coupé (max_tokens)' };
  const texte = content.filter((b) => b.type === 'text').map((b) => b.text || '').join('');
  if (texte.trim()) return { texte };
  if (appels.length) return { appels, content };
  return { vide: true, raison: 'ni texte ni outil (' + (m.stop_reason || '?') + ')' };
}

/** Pour le journal : des comptes, jamais un contenu. */
function usageJournal(msg) {
  const u = (msg && msg.usage) || {};
  const o = {};
  if (Number.isFinite(u.input_tokens)) o.jetonsEntree = u.input_tokens;
  if (Number.isFinite(u.cache_read_input_tokens)) o.cacheLu = u.cache_read_input_tokens;
  if (Number.isFinite(u.cache_creation_input_tokens)) o.cacheEcrit = u.cache_creation_input_tokens;
  if (Number.isFinite(u.output_tokens)) o.jetonsSortie = u.output_tokens;
  const t = msg && Array.isArray(msg.input_transformations) ? msg.input_transformations : [];
  const tombes = t.filter((x) => x && x.type === 'thinking_dropped').length;
  if (tombes) o.reflexionsTombees = tombes;
  if (msg && msg.model) o.servi = msg.model;
  return o;
}

module.exports = {
  configClaude, versOutilClaude, versMessagesClaude, corpsClaude, entetes,
  appelerClaude, ouvrirClaudeFlux, evenementsClaude, assembleur, lireMessage, creditEpuise, ordreDesCles,
  _oublierClesEpuisees: () => clesEpuisees.clear(),
  tourModeleOutils, appelsDe, contenuAEcho, encoderContenu, decoderContenu, usageJournal,
  URL_MESSAGES, VERSION_API, MODELE_DEFAUT, BETA_SECOURS, BETA_LIAISON, PREFIXE_SIG
};
