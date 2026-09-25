// FLINT Coach — l'historique qu'on montre à Gemini, et ce qu'on détache de
// sa réponse. Toutes les fonctions de ce fichier sont PURES : elles rendent de
// nouveaux objets et ne touchent jamais à leur entrée.
//
// ═══ 25 SEPT. 2026 — COACH V2 : UNE QUESTION, UNE REQUÊTE GEMINI ═══════════
//
// Sur une nouvelle question, le serveur ne demande plus rien à Gemini : il
// fabrique LUI-MÊME un tour d'outils (`prechargement`), le téléphone l'exécute
// (0 requête Gemini), puis rappelle. Ce tour fabriqué reste pour TOUJOURS dans
// les fils rangés sur les téléphones — et il n'a pas de vraie thoughtSignature.
//
// ⚠️ LE RETRAIT DES MARQUEURS NE DOIT JAMAIS ÊTRE RETIRÉ NI CONTOURNÉ.
// `preparerPourGemini` enlève chaque paire marquée avant que Gemini ne la voie.
// Si un chemin l'oubliait, Gemini 3 pourrait répondre 400 (« Function call is
// missing a thought_signature ») sur ce fil, et le fil serait mort pour de bon.
// La signature factice posée ici n'est qu'une ceinture : le retrait est le
// seul mécanisme sur lequel on compte.

const { roleFonctionVersUser } = require('./_lib');
const { estAnodin } = require('./_coach-instantane');

const MARQUEUR = '⟦flint-pre:v1⟧';

// ── Les tours ────────────────────────────────────────────────────────────

const estObjet = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
const partsDe = (t) => (estObjet(t) && Array.isArray(t.parts)) ? t.parts : [];
const aReponseOutil = (t) => partsDe(t).some((p) => estObjet(p) && estObjet(p.functionResponse));

/** Une question : un tour `user` qui porte du texte et aucune réponse d'outil
 *  (même règle que `estQuestionUtilisateur` dans CoachReseau.swift). */
function estTourQuestion(t) {
  if (!estObjet(t) || t.role !== 'user') return false;
  const parts = partsDe(t);
  return parts.some((p) => estObjet(p) && typeof p.text === 'string') && !aReponseOutil(t);
}

/** Un tour de réponses d'outils : pas le modèle, au moins un functionResponse
 *  (rôle « function » des apps posées, ou « user » une fois normalisé). */
const estTourReponses = (t) => estObjet(t) && t.role !== 'model' && aReponseOutil(t);

function estTourMarque(t) {
  if (!estObjet(t) || t.role !== 'model') return false;
  const p0 = partsDe(t)[0];
  return estObjet(p0) && typeof p0.text === 'string' && p0.text.startsWith(MARQUEUR);
}

const estToutAppels = (t) => estObjet(t) && t.role === 'model' && partsDe(t).length > 0
  && partsDe(t).every((p) => estObjet(p) && estObjet(p.functionCall));

function derniereQuestionIndex(contents) {
  for (let i = contents.length - 1; i >= 0; i--) if (estTourQuestion(contents[i])) return i;
  return -1;
}

function estNouvelleQuestion(contents) {
  return Array.isArray(contents) && contents.length > 0 && estTourQuestion(contents[contents.length - 1]);
}

function derniereQuestion(contents) {
  if (!Array.isArray(contents)) return '';
  const i = derniereQuestionIndex(contents);
  if (i < 0) return '';
  return partsDe(contents[i]).filter((p) => estObjet(p) && typeof p.text === 'string')
    .map((p) => p.text).join('\n').trim();
}

// ── Le pré-chargement ────────────────────────────────────────────────────
//
// v1 : les 5 outils d'avant, ceux que l'app déjà posée sait exécuter (mesuré
// le 16 sept. : ~0,7 s de moteur, ~18,5 Ko avant adaptation). v2 : seulement
// quand l'instantané manque (moteur en retard, échéance) — getDay(0) le remplace.
const APPELS_PRECHARGE = {
  v1: [['getRecoveryContext', {}], ['getSleepHistory', { joursN: 7 }], ['getTrainingLoad', {}],
       ['getNutritionToday', {}], ['getActivityHistory', { joursN: 2 }]],
  v2: [['getDay', { jour: 0 }]]
};

function prechargement({ version } = {}) {
  const liste = APPELS_PRECHARGE[version === 'v2' ? 'v2' : 'v1'];
  const appels = liste.map(([name, args]) => ({ name, args: Object.assign({}, args) }));
  const tourModele = {
    role: 'model',
    parts: [{ text: MARQUEUR }].concat(appels.map((a) => ({
      functionCall: { name: a.name, args: Object.assign({}, a.args) },
      // Une ceinture, pas le mécanisme : ce tour ne doit JAMAIS atteindre Gemini.
      thoughtSignature: 'skip_thought_signature_validator'
    })))
  };
  return { appels, tourModele };
}

// ── La préparation pour Gemini ───────────────────────────────────────────

const NOTE_ANCIEN = 'lu lors d\'une question précédente — l\'instantané est à jour ; redemande l\'outil si besoin';
const talonAncien = () => ({ qualite: 'ancien', note: NOTE_ANCIEN });
const estTalonAncien = (r) => estObjet(r) && r.qualite === 'ancien' && r.note === NOTE_ANCIEN
  && Object.keys(r).length === 2;

const octetsJSON = (x) => { try { return Buffer.byteLength(JSON.stringify(x), 'utf8'); } catch (e) { return 0; } };

/** Remplace la `response` de chaque functionResponse d'un tour (jamais un tour
 *  du modèle). Un tour inchangé est rendu tel quel (même référence). */
function remplacerReponses(tour, f) {
  if (!estTourReponses(tour)) return tour;
  let change = false;
  const parts = tour.parts.map((p) => {
    if (!estObjet(p) || !estObjet(p.functionResponse)) return p;
    const fr = p.functionResponse;
    const r = f(fr.name, fr.response);
    if (r === fr.response) return p;
    change = true;
    return Object.assign({}, p, { functionResponse: Object.assign({}, fr, { response: r }) });
  });
  return change ? Object.assign({}, tour, { parts }) : tour;
}

/** Associe chaque appel du tour marqué à sa réponse : par id, puis par nom
 *  dans l'ordre, puis par rang. */
function apparier(tourAppels, tourReponses) {
  const appels = partsDe(tourAppels).filter((p) => estObjet(p) && estObjet(p.functionCall)).map((p) => p.functionCall);
  const reponses = partsDe(tourReponses).filter((p) => estObjet(p) && estObjet(p.functionResponse)).map((p) => p.functionResponse);
  const pris = new Set();
  return appels.map((c, i) => {
    let j = c.id !== undefined ? reponses.findIndex((r, k) => !pris.has(k) && r.id === c.id) : -1;
    if (j < 0) j = reponses.findIndex((r, k) => !pris.has(k) && r.name === c.name);
    if (j < 0 && i < reponses.length && !pris.has(i)) j = i;
    if (j >= 0) pris.add(j);
    return { nom: c.name, args: estObjet(c.args) ? c.args : {}, response: j >= 0 ? reponses[j].response : null };
  });
}

/**
 * Ce que Gemini voit, et seulement ça.
 *  (a) chaque réponse d'outil de la question en cours passe par l'adaptateur
 *      injecté (S2 : unités, clés interdites) ;
 *  (b) chaque paire marquée sort ; celle de la question EN COURS rend ses
 *      résultats dans `precharges` (ils partent dans le prompt système) ;
 *  (c) les charges des questions PRÉCÉDENTES deviennent un talon (« stub »),
 *      ou leurs échanges d'outils disparaissent entièrement (« retirer ») ;
 *  (d) au-delà du budget, les plus vieilles questions entières sortent —
 *      jamais celle en cours ;
 *  (e) « function » → « user », en dernier.
 * Un tour du modèle n'est jamais modifié ni déplacé : on ne fait qu'en
 * RETIRER (marqués, ou échanges anciens en mode « retirer »). Sa
 * thoughtSignature voyage donc à l'octet près. Idempotent.
 */
function preparerPourGemini(contents, opts) {
  const o = opts || {};
  const adapter = typeof o.adapter === 'function' ? o.adapter : null;
  const retirer = o.compaction === 'retirer';
  const budget = Number.isFinite(o.budgetOctets) && o.budgetOctets > 0 ? o.budgetOctets : 60000;
  const stats = { stubs: 0, retires: 0, octets: 0, marqueurs: 0, coupees: 0 };
  const precharges = [];
  if (!Array.isArray(contents)) return { contents, precharges, stats };

  // (a) Adapter. Seules les réponses de la question EN COURS sont lues : celles
  // d'avant deviennent un talon en (c) quel que soit le mode, les adapter ne
  // coûterait que du temps (et rendrait le talon méconnaissable au second
  // passage). Un adaptateur qui lève laisse la réponse telle quelle : une
  // unité mal rendue vaut mieux qu'une question perdue.
  // 25 sept. 2026 (revue) — MAIS LE NETTOYAGE DES CLÉS, LUI, NE SAUTE JAMAIS :
  // `nettoyer` passe APRÈS l'adaptateur et HORS de son try/catch, donc ni une
  // exception ni un `_adapte` posé par le téléphone ne laissent passer une clé
  // interdite. S'il levait lui-même, la réponse devient un talon : on ferme.
  const L0 = derniereQuestionIndex(contents);
  const nettoyer = typeof o.nettoyer === 'function' ? o.nettoyer : null;
  const adapte = (nom, r) => {
    let a = r;
    if (adapter) { try { const x = adapter(nom, r); if (x !== undefined) a = x; } catch (e) { a = r; } }
    if (!nettoyer) return a;
    try { return nettoyer(nom, a); } catch (e) { return { qualite: 'expired', raison: 'réponse illisible' }; }
  };
  let c = contents.map((t, i) => ((adapter || nettoyer) && i > L0 ? remplacerReponses(t, adapte) : t));

  // (b) Les paires marquées.
  const sansMarques = [];
  for (let i = 0; i < c.length; i++) {
    if (!estTourMarque(c[i])) { sansMarques.push(c[i]); continue; }
    stats.marqueurs++;
    // Sa réponse ne part qu'avec lui, et seulement si c'en est une : jamais
    // une question par erreur (même règle que l'app).
    const suivant = c[i + 1];
    const paire = estTourReponses(suivant);
    if (paire && i > L0) precharges.push(...apparier(c[i], suivant));
    if (paire) i++;
  }
  c = sansMarques;

  // (c) Les questions précédentes.
  const L = derniereQuestionIndex(c);
  if (L > 0) {
    const avant = [];
    for (let i = 0; i < L; i++) {
      const t = c[i];
      if (retirer && estToutAppels(t)) {
        // L'appel et ses réponses partent ENSEMBLE : l'appariement tient.
        stats.retires++;
        while (i + 1 < L && estTourReponses(c[i + 1])) i++;
        continue;
      }
      avant.push(remplacerReponses(t, (nom, r) => {
        if (estTalonAncien(r)) return r;
        stats.stubs++;
        return talonAncien();
      }));
    }
    c = avant.concat(c.slice(L));
  }

  // (d) Le budget, compté par tour (un seul JSON.stringify par tour).
  const tailles = c.map(octetsJSON);
  let total = 2 + tailles.reduce((s, n) => s + n, 0) + Math.max(0, c.length - 1);
  while (total > budget) {
    // On coupe au début de la DEUXIÈME question : le fil repart toujours sur
    // une question, et la dernière n'est jamais atteinte.
    let j = -1;
    for (let k = 1; k < c.length; k++) if (estTourQuestion(c[k])) { j = k; break; }
    if (j < 0 || j > derniereQuestionIndex(c)) break;
    const parti = tailles.splice(0, j).reduce((s, n) => s + n, 0);
    total -= parti + j;
    c = c.slice(j);
    stats.coupees++;
  }

  // (e) Gemini 3 : « function » n'est plus un rôle.
  c = roleFonctionVersUser(c);
  stats.octets = octetsJSON(c);
  return { contents: c, precharges, stats };
}

// ── Ce qu'on détache de la fin de la réponse ─────────────────────────────
//
// Le modèle finit par « Suites : a | b | c » (depuis le 23 sept.) et, en v2,
// peut écrire avant jusqu'à deux lignes « Retenir : <catégorie> — <fait> ».
// On ne les lit QUE dans le bloc final, à la vraie fin du texte : un
// « Retenir » écrit au milieu d'une réponse reste du texte ordinaire.
// Mêmes étiquettes que `extraireSuites` (_lib.js), et mêmes résultats sur
// chacun de ses cas : c'est au banc.

const MOTS_SUITES = 'suites?|suggestions?|ensuite|next|siguientes?|a continuaci[oó]n';
const MOTS_RETENIR = 'retenir|remember|recordar';
const LIGNE_SUITES = new RegExp('^[ \\t]*(?:\\*\\*)?[ \\t]*(?:' + MOTS_SUITES + ')[ \\t]*(?:\\*\\*)?[ \\t]*[:：]', 'i');
const LIGNE_RETENIR = new RegExp('^[ \\t]*(?:\\*\\*)?[ \\t]*(?:' + MOTS_RETENIR + ')[ \\t]*(?:\\*\\*)?[ \\t]*[:：]', 'i');
const MOTS_MARQUEURS_SUITES = ['suites', 'suite', 'suggestions', 'suggestion', 'ensuite', 'next', 'siguientes',
                               'siguiente', 'a continuación', 'a continuacion'];
const MOTS_MARQUEURS = MOTS_MARQUEURS_SUITES.concat(['retenir', 'remember', 'recordar']);

// ═══ 25 SEPT. 2026 (revue) — « RETENIR » N'EST UNE ÉTIQUETTE QU'EN V2 ═══════
//
// Le prompt v1 ne demande jamais de ligne « Retenir : », et l'app posée ne
// lit pas `retenir` : une telle ligne y est de la PROSE. La détacher en v1
// l'effaçait de l'écran pour de bon (texte et flux). `{ retenir: false }`
// rend exactement l'ancien `extraireSuites` : les suites seulement. Par
// défaut (aucune option), le comportement v2.
const avecRetenir = (o) => !(o && o.retenir === false);

/** Ce qui suit le « : » de l'étiquette. */
const apresEtiquette = (l) => l.replace(/^[^:：]*[:：]/, '');

// « Remember: » et « Recordar: » sont aussi des tournures de coach ordinaires
// (« Remember: consistency beats intensity. ») : sans catégorie de la liste
// en tête, la ligne reste du texte — sinon une phrase de conseil entrerait
// dans la mémoire de la personne. « Retenir : » seul n'a pas ce risque.
const RETENIR_FR = /^[ \t]*(?:\*\*)?[ \t]*retenir/i;

// La ligne inachevée du flux, dans `partieSureMeta` : elle compte comme une
// ligne du bloc sans prendre la place unique des suites, dans les deux modes.
const LIGNE_EN_COURS = '\u0000';

function typeLigne(l, o) {
  if (l === LIGNE_EN_COURS) return 'neutre';
  if (LIGNE_RETENIR.test(l)) {
    if (!avecRetenir(o)) return '';
    if (RETENIR_FR.test(l)) return 'retenir';
    return apresEtiquette(l).split('|').some((m) => !!decouperFait(m).categorie) ? 'retenir' : '';
  }
  if (LIGNE_SUITES.test(l)) return 'suites';
  return '';
}
/** Une étiquette seule (« Suites : », « **Retenir :** ») : la liste suit à la ligne. */
const estEnTeteNu = (l, o) => l !== LIGNE_EN_COURS && !!typeLigne(l, o)
  && apresEtiquette(l).replace(/\*\*/g, '').trim() === '';

/** Indice de la première ligne du bloc final (blancs de tête compris), ou
 *  `lignes.length` s'il n'y en a pas. */
function debutBlocFinal(lignes, o) {
  let debut = lignes.length;
  let aMeta = false;
  // UNE seule ligne de suites par bloc : une autre au-dessus (« Ensuite :
  // couche-toi tôt. ») est de la prose, et elle reste à l'écran — comme avec
  // `extraireSuites`, qui ne retirait que la dernière.
  let suitesVues = false;
  const prendre = (type) => {
    if (type !== 'suites') return true;
    if (suitesVues) return false;
    suitesVues = true;
    return true;
  };
  let i = lignes.length - 1;
  while (i >= 0) {
    const l = lignes[i];
    if (l.trim() === '') { i--; continue; }
    const type = typeLigne(l, o);
    if (type) {
      if (!prendre(type)) break;
      aMeta = true; debut = i; i--; continue;
    }
    // Une ligne ordinaire n'entre dans le bloc que comme LA liste d'une
    // étiquette nue juste au-dessus (blancs permis entre les deux).
    let j = i - 1;
    while (j >= 0 && lignes[j].trim() === '') j--;
    if (j >= 0 && estEnTeteNu(lignes[j], o) && prendre(typeLigne(lignes[j], o))) { aMeta = true; debut = j; i = j - 1; continue; }
    break;
  }
  if (!aMeta) return lignes.length;
  // Les lignes blanches juste au-dessus du bloc partent avec lui.
  while (debut > 0 && lignes[debut - 1].trim() === '') debut--;
  return debut;
}

// Les catégories de CoachMemoire, en préfixe « [catégorie] » dans le texte du
// fait : le format du fichier ne change pas. Synonymes en/es tolérés.
const CATEGORIES = Object.assign(Object.create(null), {
  preference: 'preference', preferences: 'preference', preferencia: 'preference', preferencias: 'preference',
  objectif: 'objectif', objectifs: 'objectif', goal: 'objectif', goals: 'objectif', objetivo: 'objectif', objetivos: 'objectif',
  contrainte: 'contrainte', contraintes: 'contrainte', constraint: 'contrainte', restriccion: 'contrainte',
  sante: 'sante', health: 'sante', salud: 'sante',
  rythme: 'rythme', schedule: 'rythme', rhythm: 'rythme', routine: 'rythme', horario: 'rythme', ritmo: 'rythme', rutina: 'rythme'
});
const sansAccents = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const categorieDe = (mot) => CATEGORIES[sansAccents(String(mot || '')).toLowerCase()] || null;

// Un « fait » qui ressemble à une donnée FLINT n'est pas un fait : il serait
// relu dans d'autres conversations comme une vérité, alors que l'instantané,
// lui, est à jour. Le « % » de la spec portait un `\b` qui ne mordait jamais
// après un symbole : il a sa propre branche.
const RESSEMBLE_DONNEE = /\d+([.,]\d+)?\s*(ms|bpm|kcal|\/20|\/100)\b|\d+([.,]\d+)?\s*%|\d+h\d{2}/i;
const RETENIR_MAX = 120;

/** « objectif — semi en mars », « [sante] genou », ou un fait sans catégorie. */
function decouperFait(morceau) {
  const s = String(morceau).replace(/\*\*/g, '').replace(/^[\s\-–•·]+/, '').trim();
  const m = s.match(/^\[\s*([^\]]{2,20}?)\s*\]\s*[—–:\-]*\s*(.*)$/)
         || s.match(/^([^\s—–:\-[\]]{2,20})\s*[—–:\-]+\s*(.*)$/);
  if (m && categorieDe(m[1])) return { categorie: categorieDe(m[1]), fait: m[2].trim() };
  return { categorie: null, fait: s };
}

function lireFait(morceau) {
  const { categorie, fait } = decouperFait(morceau);
  if (!fait || fait.length > RETENIR_MAX || RESSEMBLE_DONNEE.test(fait)) return null;
  return { categorie, fait };
}

const lireSuites = (s) => s.split('|')
  .map((x) => x.replace(/\*\*/g, '').replace(/^[\s\-–•]+/, '').trim())
  .filter((x) => x.length > 0 && x.length <= 80)
  .slice(0, 3);

/** { texte, suites, retenir:[{categorie, fait}] } — `texte` et `suites` sont
 *  ceux d'`extraireSuites` quand il n'y a pas de « Retenir ».
 *  `opts.retenir === false` (v1) : « Retenir : » reste du texte. */
// 25 sept. 2026 — vu en production puis en préproduction v2 : « ## ## Détail ».
// Le modèle double parfois le marqueur malgré la consigne ; l'écran de l'app
// (RenduCoach) n'y reconnaît plus son titre. On le ramène à un seul « ## » ici,
// au seul endroit par où passe tout texte final (JSON et flux) : `fin.texte`
// fait foi, l'app remplace le texte diffusé par lui à la fin.
const TITRE_DOUBLE = /^[ \t]*(?:#{1,6}[ \t]+){2,}/gm;

function extraireMeta(brut, opts) {
  const t = String(brut || '').replace(TITRE_DOUBLE, '## ').trimEnd();
  const lignes = t.split('\n');
  const debut = debutBlocFinal(lignes, opts);
  if (debut >= lignes.length) return { texte: t, suites: [], retenir: [] };

  let suites = [];
  const faits = [];
  let enAttente = '';
  for (const l of lignes.slice(debut)) {
    if (l.trim() === '') continue;
    const type = typeLigne(l, opts);
    let type2 = type, contenu = type ? apresEtiquette(l) : l;
    if (!type) { type2 = enAttente; enAttente = ''; }
    else if (estEnTeteNu(l, opts)) { enAttente = type; continue; }
    else enAttente = '';
    // La DERNIÈRE ligne de suites fait foi, comme dans `extraireSuites`.
    if (type2 === 'suites') suites = lireSuites(contenu);
    else if (type2 === 'retenir') for (const m of contenu.split('|')) { const f = lireFait(m); if (f) faits.push(f); }
  }
  const vus = new Set();
  const retenir = faits.filter((f) => !vus.has(f.fait) && vus.add(f.fait)).slice(0, 2);
  const corps = lignes.slice(0, debut).join('\n').trimEnd();
  // Un texte qui n'était QUE des métadonnées reste affiché (même règle
  // qu'`extraireSuites`) : une réponse vide ne vaut pas mieux.
  return { texte: corps || t, suites, retenir };
}

// ── Ce qu'on peut diffuser sans risque ───────────────────────────────────
//
// En flux, « à la fin » est trop tard : on RETIENT la série finale de lignes
// complètes qui commencent comme une étiquette (et la liste d'une étiquette
// nue), plus une dernière ligne inachevée qui pourrait en devenir une. Dès
// qu'une ligne ordinaire suit, tout repart. `fin.texte` fait foi de toute
// façon : un éclair passager est corrigé, rien ne peut rester caché.
const PARTIEL_MAX = 14;

// 25 sept. 2026 (revue) — le gras peut être coupé ENTRE ses deux astérisques :
// « **Retenir* » puis « * : … », ou une ligne qui n'est encore que « * ». La
// garde n'acceptait que la paire entière : la ligne partait, et avec elle la
// ligne « Retenir » complète retenue au-dessus (fuzz de la revue). On accepte
// donc 0 à 2 astérisques, en tête comme après le mot.
function partielPeutEtreEtiquette(partiel, o) {
  const s = partiel.replace(/^[ \t]*\*{0,2}[ \t]*/, '').toLowerCase();
  for (const w of (avecRetenir(o) ? MOTS_MARQUEURS : MOTS_MARQUEURS_SUITES)) {
    if (s.length <= PARTIEL_MAX && w.startsWith(s)) return true;
    if (s.startsWith(w) && /^[ \t]*\*{0,2}[ \t]*[:：]?$/.test(s.slice(w.length))) {
      // « a continuación » + espaces dépasse 14 caractères sans cesser
      // d'être une étiquette en train de s'écrire.
      return true;
    }
  }
  return false;
}

/** Le préfixe de `texte` qu'on peut diffuser. `opts.retenir === false` (v1) :
 *  seules les suites sont retenues, comme la garde d'avant le 25 sept. */
function partieSureMeta(texte, opts) {
  const s = String(texte || '');
  const coupe = s.lastIndexOf('\n');
  const partiel = s.slice(coupe + 1);
  const lignes = coupe < 0 ? [] : s.slice(0, coupe).split('\n');
  if (partiel !== '') {
    // Une ligne inachevée : toute étiquette la retient (sa catégorie n'est
    // peut-être pas encore écrite).
    let retenu = (avecRetenir(opts) && LIGNE_RETENIR.test(partiel)) || LIGNE_SUITES.test(partiel)
      || partielPeutEtreEtiquette(partiel, opts);
    if (!retenu) {
      // La liste d'une étiquette nue, en train de s'écrire.
      let j = lignes.length - 1;
      while (j >= 0 && lignes[j].trim() === '') j--;
      retenu = j >= 0 && estEnTeteNu(lignes[j], opts);
    }
    if (!retenu) return s;
    // La ligne en cours compte comme une ligne du bloc : de suites si elle en
    // est déjà une (elle prend alors la place unique), neutre sinon.
    lignes.push(LIGNE_SUITES.test(partiel) ? 'Suites :' : LIGNE_EN_COURS);
  }
  const debut = debutBlocFinal(lignes, opts);
  if (debut >= lignes.length) return partiel === '' ? s : s.slice(0, coupe + 1);
  let offset = 0;
  for (let i = 0; i < debut; i++) offset += lignes[i].length + 1;
  return s.slice(0, Math.min(offset, s.length));
}

// ── Le mémo de l'échange ─────────────────────────────────────────────────
//
// Calculé ICI, sans appel au modèle : le modèle n'écrit jamais de mémoire sur
// ses propres réponses, donc aucun chiffre non vérifié n'est reporté d'un fil
// à l'autre. Le téléphone le range et le renvoie aux questions posées ailleurs.

function couper(s, n) {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  if (t.length <= n) return t;
  const brut = t.slice(0, n - 1);
  const esp = brut.lastIndexOf(' ');
  return (esp > n - 25 ? brut.slice(0, esp) : brut).trimEnd() + '…';
}
const sansMarkdown = (s) => s.replace(/\*\*/g, '').replace(/[_#]/g, '').replace(/\s+/g, ' ').trim();
const TITRE_A_FAIRE = /^\s*#{1,6}\s*(?:à faire|a faire|to do|to-do|qué hacer|que hacer)\s*:?\s*$/i;

function dateParis(maintenant) {
  const d = maintenant instanceof Date ? maintenant : new Date();
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  } catch (e) { return d.toISOString().slice(0, 10); }
}

function memoDe({ question, texte, jour, maintenant } = {}) {
  const q = typeof question === 'string' ? question.trim() : '';
  const t = typeof texte === 'string' ? texte : '';
  if (!q || estAnodin(q)) return null;
  const lignes = t.split('\n');
  // 25 sept. 2026 — vu en préproduction : sans ligne de verdict, la première
  // ligne était « ## Pourquoi » et le mémo retenait « Pourquoi ». Un titre
  // n'est pas un verdict : on prend la première ligne qui n'en est pas un.
  const premiere = lignes.filter((l) => !/^\s*#{1,6}\s/.test(l)).map(sansMarkdown).find((l) => l !== '') || '';
  let a = '';
  const iTitre = lignes.findIndex((l) => TITRE_A_FAIRE.test(l));
  if (iTitre >= 0) {
    for (const l of lignes.slice(iTitre + 1)) {
      if (/^\s*#{1,6}\s/.test(l)) break;
      const m = l.match(/^\s*[-*•]\s+(.*)$/);
      if (m) { a = sansMarkdown(m[1]); break; }
    }
  }
  const d = (typeof jour === 'string' && jour.trim()) ? jour.trim().slice(0, 24) : dateParis(maintenant);
  return { d, q: couper(q, 100), v: couper(premiere, 160), a: couper(a, 100) };
}

module.exports = {
  MARQUEUR, estNouvelleQuestion, derniereQuestion, prechargement, preparerPourGemini,
  extraireMeta, partieSureMeta, memoDe,
  // Pour les bancs.
  estTourQuestion, NOTE_ANCIEN
};
