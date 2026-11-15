// FLINT Coach v3 — ce que le Coach dit qu'il fait, et ce qu'il montre.
//
// ═══ 15 NOV. 2026 — « IL MET TOUJOURS "ANALYSE DE TA RÉCUPÉRATION…" » ═════════
//
// Les fondateurs, mot pour mot : « Chaque question que je lui pose, il y a
// toujours marqué ça. Il faut qu'il mette les vrais trucs. » La cause est au
// serveur (COACH-V3-PLAN.md, § 2) : sur toute question nouvelle, la v1 rend un
// tour d'outils FABRIQUÉ dont le premier appel est TOUJOURS getRecoveryContext,
// et `libelles` est une table fixe par NOM d'outil — « Analyse de ta
// récupération… » quelle que soit la question, quels que soient les arguments.
//
// Ce fichier rend donc, pour chaque appel RÉELLEMENT demandé, la phrase de ce
// qui est RÉELLEMENT lu, arguments compris (« Lecture de tes 7 dernières
// nuits… », « Comparaison de tes séances de course des 14 derniers jours… »),
// et la phrase de la rédaction qui suit. Et il porte le catalogue FERMÉ des
// blocs visuels : le modèle choisit un bloc, l'app le dessine avec SES données,
// aucun chiffre ne vient du modèle.
//
// Tout ici est PUR (aucun réseau, aucune variable d'environnement) et n'est
// appelé que par le chemin Claude : le chemin Gemini n'en lit pas un octet.

// ─── LES LIBELLÉS ───────────────────────────────────────────────────────────

const MOIS = {
  fr: ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'],
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  es: ['ene.', 'feb.', 'mar.', 'abr.', 'may.', 'jun.', 'jul.', 'ago.', 'sept.', 'oct.', 'nov.', 'dic.']
};

// Le nom d'une colonne de getHistory ou d'une clé de getTrend, tel qu'une
// personne le dit. Une clé absente d'ici ne s'affiche pas (jamais un « vfcSrc »
// à l'écran).
const NOMS = {
  fr: { recup: 'récupération', scoreSommeil: 'score de sommeil', dormi: 'sommeil', besoin: 'besoin de sommeil',
        dette7n: 'dette de sommeil', coucher: 'coucher', lever: 'lever', efficacite: 'efficacité du sommeil',
        vfc: 'VFC', fcRepos: 'FC de repos', resp: 'respiration', temp: 'température', spo2Bas: 'SpO₂',
        effort: 'effort', zones: 'zones', muscu: 'musculation', pas: 'pas', kcalBrulees: 'calories brûlées',
        kcalMangees: 'calories mangées', balance: 'balance calorique', poids: 'poids', stress: 'stress',
        journal: 'journal', couverture: 'couverture du sommeil', regularite: 'régularité du sommeil',
        reparateur: 'sommeil réparateur', auLit: 'temps au lit', fcMoy: 'FC moyenne', vo2: 'VO₂max',
        masseMaigre: 'masse maigre' },
  en: { recup: 'recovery', scoreSommeil: 'sleep score', dormi: 'sleep', besoin: 'sleep need', dette7n: 'sleep debt',
        coucher: 'bedtime', lever: 'wake time', efficacite: 'sleep efficiency', vfc: 'HRV', fcRepos: 'resting HR',
        resp: 'breathing rate', temp: 'temperature', spo2Bas: 'SpO₂', effort: 'effort', zones: 'zones',
        muscu: 'strength training', pas: 'steps', kcalBrulees: 'calories burned', kcalMangees: 'calories eaten',
        balance: 'calorie balance', poids: 'weight', stress: 'stress', journal: 'journal',
        couverture: 'sleep coverage', regularite: 'sleep regularity', reparateur: 'restorative sleep',
        auLit: 'time in bed', fcMoy: 'average HR', vo2: 'VO₂max', masseMaigre: 'lean mass' },
  es: { recup: 'recuperación', scoreSommeil: 'puntuación de sueño', dormi: 'sueño', besoin: 'necesidad de sueño',
        dette7n: 'deuda de sueño', coucher: 'hora de acostarte', lever: 'hora de levantarte',
        efficacite: 'eficiencia del sueño', vfc: 'VFC', fcRepos: 'FC en reposo', resp: 'respiración',
        temp: 'temperatura', spo2Bas: 'SpO₂', effort: 'esfuerzo', zones: 'zonas', muscu: 'fuerza', pas: 'pasos',
        kcalBrulees: 'calorías quemadas', kcalMangees: 'calorías ingeridas', balance: 'balance calórico',
        poids: 'peso', stress: 'estrés', journal: 'diario', couverture: 'cobertura del sueño',
        regularite: 'regularidad del sueño', reparateur: 'sueño reparador', auLit: 'tiempo en la cama',
        fcMoy: 'FC media', vo2: 'VO₂máx', masseMaigre: 'masa magra' }
};
// Colonnes (getHistory) et clés (getTrend) → une entrée de NOMS.
const CLE_NOM = {
  recup: 'recup', scoreSommeil: 'scoreSommeil', dormi: 'dormi', besoin: 'besoin', dette7n: 'dette7n',
  coucher: 'coucher', lever: 'lever', efficacite: 'efficacite', vfc: 'vfc', vfcSrc: 'vfc', fcRepos: 'fcRepos',
  resp: 'resp', temp: 'temp', spo2Bas: 'spo2Bas', effort: 'effort', zones13: 'zones', zones45: 'zones',
  muscu: 'muscu', pas: 'pas', kcalBrulees: 'kcalBrulees', kcalMangees: 'kcalMangees', balance: 'balance',
  poids: 'poids', stress: 'stress', journal: 'journal',
  recovery: 'recup', hrv: 'vfc', rhr: 'fcRepos', sleep: 'dormi', sleepscore: 'scoreSommeil',
  sleeppct: 'couverture', sleepreg: 'regularite', sleepdebt: 'dette7n', sleepeff: 'efficacite',
  sleepresto: 'reparateur', timeinbed: 'auLit', steps: 'pas', strength: 'muscu', kcalOut: 'kcalBrulees',
  kcalIn: 'kcalMangees', fcavg: 'fcMoy', vo2: 'vo2', weight: 'poids', leanmass: 'masseMaigre'
};

const STYLES = {
  fr: { motivant: 'motivant', analytique: 'analytique', intensif: 'direct', aucun: 'juste mes données' },
  en: { motivant: 'motivating', analytique: 'analytical', intensif: 'direct', aucun: 'just my data' },
  es: { motivant: 'motivador', analytique: 'analítico', intensif: 'directo', aucun: 'solo mis datos' }
};

const langueDe = (l) => (l === 'en' || l === 'es' ? l : 'fr');
// Une table lue avec une clé venue du modèle : « constructor » ou « __proto__ »
// ne doivent rien y trouver (même leçon que LANGUES, _coach-prompt.js).
const lire = (table, cle) => (typeof cle === 'string' && Object.prototype.hasOwnProperty.call(table, cle) ? table[cle] : undefined);
const entier = (x) => (Number.isInteger(x) ? x : (typeof x === 'string' && /^-?\d{1,4}$/.test(x.trim()) ? Number(x) : null));
const borne = (n, a, b) => Math.max(a, Math.min(b, n));
const estDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s)
  && !Number.isNaN(Date.parse(s + 'T12:00:00Z')) && new Date(s + 'T12:00:00Z').toISOString().slice(0, 10) === s;

/** Un sport écrit par le modèle (ou recopié de la personne) : des lettres,
 *  24 caractères au plus — il part à l'écran. */
function sportPropre(s) {
  if (typeof s !== 'string') return '';
  const t = s.normalize('NFC').replace(/[^\p{L}\p{M} '’-]/gu, ' ').replace(/\s+/g, ' ').trim();
  return t.length >= 2 ? t.slice(0, 24).trim().toLocaleLowerCase() : '';
}

function quand(L, jour, date) {
  if (estDate(date)) {
    const [, m, j] = date.split('-').map(Number);
    return { fr: `du ${j} ${MOIS.fr[m - 1]}`, en: `on ${MOIS.en[m - 1]} ${j}`, es: `del ${j} ${MOIS.es[m - 1]}` }[L];
  }
  const k = entier(jour);
  const n = k === null ? 0 : Math.abs(borne(k, -400, 0));
  if (n === 0) return { fr: "d'aujourd'hui", en: 'today', es: 'de hoy' }[L];
  if (n === 1) return { fr: "d'hier", en: 'yesterday', es: 'de ayer' }[L];
  if (n === 2) return { fr: "d'avant-hier", en: 'two days ago', es: 'de anteayer' }[L];
  return { fr: `d'il y a ${n} jours`, en: `${n} days ago`, es: `de hace ${n} días` }[L];
}

function periodeTexte(L, periode, recul) {
  const r = entier(recul) || 0;
  const p = periode === 'M' ? 'M' : periode === 'A' ? 'A' : 'S';
  const T = {
    fr: { S: ['de la semaine', 'de la semaine dernière'], M: ['du mois', 'du mois dernier'], A: ["de l'année", "de l'an dernier"], x: "d'une période passée" },
    en: { S: ['this week', 'last week'], M: ['this month', 'last month'], A: ['this year', 'last year'], x: 'for an earlier period' },
    es: { S: ['de esta semana', 'de la semana pasada'], M: ['de este mes', 'del mes pasado'], A: ['de este año', 'del año pasado'], x: 'de un periodo anterior' }
  }[L];
  return r >= 2 ? T.x : T[p][r === 1 ? 1 : 0];
}

function nomsDe(L, cles) {
  const vus = [];
  for (const c of Array.isArray(cles) ? cles : []) {
    const n = lire(NOMS[L], lire(CLE_NOM, c));
    if (n && !vus.includes(n)) vus.push(n);
  }
  return vus;
}

// Les verbes : « Lecture de X… », « Comparaison de X… »… X est un objet du
// possessif (ta, tes, ton, nos), donc jamais de contraction à faire.
const VERBES = {
  fr: { lecture: (o) => `Lecture de ${o}…`, comparaison: (o) => `Comparaison de ${o}…`, calcul: (o) => `Calcul de ${o}…`,
        verification: (o) => `Vérification de ${o}…`, recherche: (o) => `Recherche dans ${o}…` },
  en: { lecture: (o) => `Reading ${o}…`, comparaison: (o) => `Comparing ${o}…`, calcul: (o) => `Computing ${o}…`,
        verification: (o) => `Checking ${o}…`, recherche: (o) => `Searching ${o}…` },
  es: { lecture: (o) => `Leyendo ${o}…`, comparaison: (o) => `Comparando ${o}…`, calcul: (o) => `Calculando ${o}…`,
        verification: (o) => `Revisando ${o}…`, recherche: (o) => `Buscando en ${o}…` }
};

/**
 * Ce qu'un appel lit, en deux morceaux : `verbe` et `objet` (l'objet sert
 * aussi à la phrase de rédaction). Rendu `null` pour un outil inconnu — le
 * libellé fixe de `LIBELLES` reste alors celui de l'app.
 * `phrase` seule pour les outils qui n'ont pas d'objet (« Je note ça… »).
 */
function decrireAppel(nom, args, langue) {
  const L = langueDe(langue);
  const a = args && typeof args === 'object' && !Array.isArray(args) ? args : {};
  const jours = (x, def, min, max) => { const k = entier(x); return borne(k === null ? def : k, min, max); };
  const O = (fr, en, es) => ({ fr, en, es }[L]);
  switch (nom) {
    case 'getSleepHistory': {
      const n = jours(a.joursN, 7, 1, 14);
      return { verbe: 'lecture', objet: n === 1 ? O('ta dernière nuit', 'your last night', 'tu última noche')
        : O(`tes ${n} dernières nuits`, `your last ${n} nights`, `tus últimas ${n} noches`) };
    }
    case 'getRecoveryContext':
      return { verbe: 'lecture', objet: O('ta récupération du jour', 'your recovery for today', 'tu recuperación de hoy') };
    case 'getTrainingLoad':
      return { verbe: 'calcul', objet: O("ta charge d'entraînement (7 jours contre 4 semaines)",
        'your training load (7 days vs 4 weeks)', 'tu carga de entrenamiento (7 días frente a 4 semanas)') };
    case 'getNutritionToday':
      return { verbe: 'lecture', objet: O("tes repas d'aujourd'hui", "today's meals", 'tus comidas de hoy') };
    case 'getCoachPreferences':
      return { verbe: 'lecture', objet: O('ton style de coach', 'your coaching style', 'tu estilo de coach') };
    case 'getUserProfile':
      return { verbe: 'lecture', objet: O('ton profil', 'your profile', 'tu perfil') };
    case 'saveMemoryFact':
      return { phrase: O('Je note ça…', 'Noting that down…', 'Lo apunto…') };
    case 'setCoachPreferences': {
      const s = lire(STYLES[L], a.ton);
      return { phrase: s ? O(`J'ajuste mon style : ${s}…`, `Switching to the ${s} style…`, `Cambio al estilo ${s}…`)
        : O("J'ajuste mon style…", 'Adjusting my style…', 'Ajustando mi estilo…') };
    }
    case 'getActivityHistory': {
      const n = jours(a.joursN, 7, 1, 90);
      return { verbe: 'lecture', objet: n === 1 ? O("tes séances d'aujourd'hui", "today's sessions", 'tus sesiones de hoy')
        : O(`tes séances des ${n} derniers jours`, `your sessions from the last ${n} days`, `tus sesiones de los últimos ${n} días`) };
    }
    case 'getSessions': {
      if (a.records === true) return { verbe: 'lecture', objet: O('tes records GPS', 'your GPS records', 'tus récords GPS') };
      const n = jours(a.jours, 7, 1, 31);
      const sport = sportPropre(a.sport);
      const objet = sport
        ? O(`tes séances de ${sport} des ${n} derniers jours`, `your ${sport} sessions from the last ${n} days`, `tus sesiones de ${sport} de los últimos ${n} días`)
        : O(`tes séances des ${n} derniers jours`, `your sessions from the last ${n} days`, `tus sesiones de los últimos ${n} días`);
      return { verbe: sport || a.detail === true ? 'comparaison' : 'lecture', objet };
    }
    case 'getSession':
      if (typeof a.gps === 'string' && a.gps) return { verbe: 'lecture', objet: O('ta sortie GPS', 'your GPS run', 'tu salida GPS') };
      return { verbe: 'lecture', objet: O(`ta séance ${quand(L, a.jour, a.date)}`, `your session from ${quand(L, a.jour, a.date)}`, `tu sesión ${quand(L, a.jour, a.date)}`) };
    case 'getDay':
      return { verbe: 'lecture', objet: O(`ta journée ${quand(L, a.jour, a.date)}`, `your data from ${quand(L, a.jour, a.date)}`, `tu día ${quand(L, a.jour, a.date)}`) };
    case 'getHistory': {
      const n = jours(a.jours, 30, 8, 90);
      const noms = nomsDe(L, a.colonnes);
      const liste = noms.length ? ' (' + noms.slice(0, 3).join(', ') + (noms.length > 3 ? '…' : '') + ')' : '';
      return { verbe: 'lecture', objet: O(`tes ${n} derniers jours`, `your last ${n} days`, `tus últimos ${n} días`) + liste };
    }
    case 'getTrend': {
      const nomCle = nomsDe(L, [a.cle])[0];
      const p = periodeTexte(L, a.periode, a.recul);
      return { verbe: 'lecture', objet: nomCle ? O(`ta tendance ${nomCle} ${p}`, `your ${nomCle} trend ${p}`, `tu tendencia de ${nomCle} ${p}`)
        : O(`ta tendance ${p}`, `your trend ${p}`, `tu tendencia ${p}`) };
    }
    case 'getDevice':
      return { verbe: 'verification', objet: O('ton bracelet et sa synchro', 'your band and its sync', 'tu pulsera y su sincronización') };
    case 'getPastThread':
      return { verbe: 'recherche', objet: O('nos échanges passés', 'our past conversations', 'nuestras conversaciones pasadas') };
    default:
      return null;
  }
}

/** La phrase d'UN appel, ou '' pour un outil inconnu. */
function libelleAppel(nom, args, langue) {
  const d = decrireAppel(nom, args, langue);
  if (!d) return '';
  return d.phrase || VERBES[langueDe(langue)][d.verbe](d.objet);
}

/** Une phrase par appel, dans l'ordre : `[{ outil, texte }]`. */
function etapesDesAppels(appels, langue) {
  return (Array.isArray(appels) ? appels : [])
    .map((a) => ({ outil: a && a.name, texte: libelleAppel(a && a.name, a && a.args, langue) }))
    .filter((e) => typeof e.outil === 'string' && e.texte);
}

/**
 * La table `libelles` d'un tour d'outils v3 : la table fixe de la langue (que
 * l'app sait déjà lire, par nom d'outil), où chaque outil DEMANDÉ prend la
 * phrase de ses vrais arguments. Une app posée qui affiche `libelles[nom]` du
 * premier appel montre donc la vraie lecture, sans une ligne de Swift.
 */
function libellesDuTour(base, appels, langue) {
  const o = Object.assign({}, base || {});
  // Deux appels du même nom : le PREMIER gagne, c'est lui que l'app montre.
  const vus = new Set();
  for (const e of etapesDesAppels(appels, langue)) {
    if (vus.has(e.outil)) continue;
    vus.add(e.outil);
    o[e.outil] = e.texte;
  }
  return o;
}

/** « Rédaction de ta réponse à partir de tes 7 dernières nuits et de ta charge… » */
function libelleRedaction(appelsLus, langue) {
  const L = langueDe(langue);
  const objets = [];
  for (const a of Array.isArray(appelsLus) ? appelsLus : []) {
    const d = decrireAppel(a && a.name, a && a.args, L);
    if (d && d.objet && !objets.includes(d.objet)) objets.push(d.objet);
  }
  if (!objets.length) return { fr: 'Rédaction de ta réponse…', en: 'Writing your answer…', es: 'Redactando tu respuesta…' }[L];
  const pris = objets.slice(0, 3);
  const et = { fr: ' et ', en: ' and ', es: ' y ' }[L];
  const plus = objets.length > 3 ? { fr: ' et le reste', en: ' and the rest', es: ' y el resto' }[L] : '';
  const liste = pris.length === 1 ? pris[0]
    : (objets.length > 3 ? pris.join(', ') + plus : pris.slice(0, -1).join(', ') + et + pris[pris.length - 1]);
  return { fr: `Rédaction de ta réponse à partir de ${liste}…`, en: `Writing your answer from ${liste}…`,
           es: `Redactando tu respuesta a partir de ${liste}…` }[L];
}

// ─── LES BLOCS VISUELS ──────────────────────────────────────────────────────
//
// Le contrat (COACH-V3-PLAN.md, § 5) : le modèle ne rend que le CHOIX d'un
// bloc et de ses paramètres, jamais une valeur. L'app le dessine avec ses
// propres données, ou ne dessine rien si elle ne les a pas. Ici, la seule
// règle : un bloc qui n'est pas EXACTEMENT au catalogue est retiré, en entier,
// avant l'envoi. Aucun texte libre d'un bloc ne porte un chiffre — c'est la
// garantie « le modèle n'invente aucun chiffre », vérifiée, pas promise.

const METRIQUES_BLOCS = ['recup', 'vfc', 'fcRepos', 'dormi', 'scoreSommeil', 'dette7n', 'effort', 'kcalBrulees',
  'kcalMangees', 'balance', 'pas', 'poids', 'stress', 'resp', 'temp', 'spo2Bas'];
const JOURS_SERIE = [7, 30, 90];
const BLOCS_MAX = 2;

// Le schéma, en JSON Schema : c'est ce qui est documenté pour l'app, et le
// banc vérifie que le validateur ci-dessous en suit chaque branche.
const texteSchema = (max) => ({ type: 'string', minLength: 1, maxLength: max, pattern: '^[^0-9]*$' });
const jourSchema = { type: 'integer', minimum: -90, maximum: 0 };
const dateSchema = { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' };
const BLOCS_SCHEMA = {
  type: 'array', maxItems: BLOCS_MAX,
  items: { oneOf: [
    { type: 'object', additionalProperties: false, required: ['type', 'metrique', 'jours'], properties: {
      type: { const: 'serie' }, metrique: { enum: METRIQUES_BLOCS }, jours: { enum: JOURS_SERIE },
      repere: { enum: ['normale', 'cible', 'aucun'] }, titre: texteSchema(60) } },
    { type: 'object', additionalProperties: false, required: ['type', 'metrique', 'jours'], properties: {
      type: { const: 'comparaison' }, metrique: { enum: METRIQUES_BLOCS }, jours: { enum: JOURS_SERIE }, titre: texteSchema(60) } },
    { type: 'object', additionalProperties: false, required: ['type'], properties: {
      type: { const: 'seance' }, jour: jourSchema, date: dateSchema,
      id: { type: 'string', pattern: '^[A-Za-z0-9._:-]{1,64}$' }, debut: { type: 'string', pattern: '^([01]\\d|2[0-3]):[0-5]\\d$' },
      titre: texteSchema(60) }, description: 'exactement un de jour / date' },
    { type: 'object', additionalProperties: false, required: ['type', 'portee'], properties: {
      type: { const: 'zones' }, portee: { enum: ['jour', 'seance', 'semaine'] }, jour: jourSchema, date: dateSchema,
      id: { type: 'string', pattern: '^[A-Za-z0-9._:-]{1,64}$' }, debut: { type: 'string', pattern: '^([01]\\d|2[0-3]):[0-5]\\d$' },
      titre: texteSchema(60) }, description: 'jour ou date exigé pour « seance » ; au plus un des deux' },
    { type: 'object', additionalProperties: false, required: ['type'], properties: {
      type: { const: 'nuit' }, jour: jourSchema, date: dateSchema, titre: texteSchema(60) }, description: 'au plus un de jour / date ; aucun = la dernière nuit' },
    { type: 'object', additionalProperties: false, required: ['type', 'titre', 'etapes'], properties: {
      type: { const: 'etapes' }, titre: texteSchema(60),
      etapes: { type: 'array', minItems: 2, maxItems: 5, items: { type: 'object', additionalProperties: false,
        required: ['titre', 'texte'], properties: { titre: texteSchema(40), texte: texteSchema(160) } } } } }
  ] }
};

const CLES_PERMISES = {
  serie: ['type', 'metrique', 'jours', 'repere', 'titre'],
  comparaison: ['type', 'metrique', 'jours', 'titre'],
  seance: ['type', 'jour', 'date', 'id', 'debut', 'titre'],
  zones: ['type', 'portee', 'jour', 'date', 'id', 'debut', 'titre'],
  nuit: ['type', 'jour', 'date', 'titre'],
  etapes: ['type', 'titre', 'etapes']
};

/** Un texte de bloc : une ligne, sans chiffre (de n'importe quelle écriture),
 *  sans balise ni crochet de marqueur, et à la bonne longueur. */
function textePropre(s, max) {
  if (typeof s !== 'string') return null;
  const t = s.normalize('NFC').replace(/\s+/g, ' ').trim();
  if (!t || t.length > max) return null;
  if (/\p{Nd}/u.test(t) || /[\u0000-\u001f\u007f<>⟦⟧`]/.test(t)) return null;
  return t;
}
const estJour = (x) => Number.isInteger(x) && x >= -90 && x <= 0;
const estId = (x) => typeof x === 'string' && /^[A-Za-z0-9._:-]{1,64}$/.test(x);
const estHeure = (x) => typeof x === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(x);

/** Rend une COPIE propre du bloc, ou `{ raison }` s'il n'est pas au catalogue. */
function validerBloc(b) {
  if (!b || typeof b !== 'object' || Array.isArray(b)) return { raison: 'pas un objet' };
  const permises = lire(CLES_PERMISES, b.type);
  if (!permises) return { raison: 'type inconnu' };
  for (const k of Object.keys(b)) if (!permises.includes(k)) return { raison: 'clé « ' + String(k).slice(0, 20) + ' » hors catalogue' };
  const o = { type: b.type };
  let titre;
  if (b.titre !== undefined) {
    titre = textePropre(b.titre, 60);
    if (titre === null) return { raison: 'titre refusé' };
  }
  const jourOuDate = (exige) => {
    const aJ = b.jour !== undefined, aD = b.date !== undefined;
    if (aJ && aD) return 'jour ET date';
    if (aJ && !estJour(b.jour)) return 'jour hors bornes';
    if (aD && !estDate(b.date)) return 'date illisible';
    if (exige && !aJ && !aD) return 'jour ou date manquant';
    if (aJ) o.jour = b.jour;
    if (aD) o.date = b.date;
    return '';
  };
  const idDebut = () => {
    if (b.id !== undefined) { if (!estId(b.id)) return 'id illisible'; o.id = b.id; }
    if (b.debut !== undefined) { if (!estHeure(b.debut)) return 'début illisible'; o.debut = b.debut; }
    return '';
  };
  let r = '';
  switch (b.type) {
    case 'serie':
    case 'comparaison':
      if (!METRIQUES_BLOCS.includes(b.metrique)) return { raison: 'métrique inconnue' };
      if (!JOURS_SERIE.includes(b.jours)) return { raison: 'période hors catalogue' };
      o.metrique = b.metrique; o.jours = b.jours;
      if (b.type === 'serie' && b.repere !== undefined) {
        if (!['normale', 'cible', 'aucun'].includes(b.repere)) return { raison: 'repère inconnu' };
        o.repere = b.repere;
      }
      break;
    case 'seance':
      r = jourOuDate(true) || idDebut();
      break;
    case 'zones':
      if (!['jour', 'seance', 'semaine'].includes(b.portee)) return { raison: 'portée inconnue' };
      o.portee = b.portee;
      r = jourOuDate(b.portee === 'seance') || idDebut();
      break;
    case 'nuit':
      r = jourOuDate(false);
      break;
    case 'etapes': {
      if (titre === undefined) return { raison: 'titre manquant' };
      o.titre = titre;
      if (!Array.isArray(b.etapes) || b.etapes.length < 2 || b.etapes.length > 5) return { raison: '2 à 5 étapes' };
      const etapes = [];
      for (const e of b.etapes) {
        if (!e || typeof e !== 'object' || Array.isArray(e)) return { raison: 'étape illisible' };
        if (Object.keys(e).some((k) => k !== 'titre' && k !== 'texte')) return { raison: 'étape hors catalogue' };
        const t = textePropre(e.titre, 40), x = textePropre(e.texte, 160);
        if (t === null || x === null) return { raison: 'texte d\'étape refusé' };
        etapes.push({ titre: t, texte: x });
      }
      o.etapes = etapes;
      break;
    }
    default:
      return { raison: 'type inconnu' };
  }
  if (r) return { raison: r };
  if (titre !== undefined && o.titre === undefined) o.titre = titre;
  return { bloc: o };
}

/** `{ blocs, rejetes: [raison…] }` — au plus BLOCS_MAX, sans doublon. */
function validerBlocs(liste) {
  if (!liste || typeof liste !== 'object') return { blocs: [], rejetes: liste === undefined ? [] : ['pas un tableau'] };
  const brut = Array.isArray(liste) ? liste : [liste];
  const blocs = [], rejetes = [], vus = new Set();
  for (const b of brut) {
    const v = validerBloc(b);
    if (!v.bloc) { rejetes.push(v.raison); continue; }
    const cle = JSON.stringify(v.bloc);
    if (vus.has(cle)) continue;
    if (blocs.length >= BLOCS_MAX) { rejetes.push('au-delà de ' + BLOCS_MAX + ' blocs'); continue; }
    vus.add(cle); blocs.push(v.bloc);
  }
  return { blocs, rejetes };
}

// La ligne « Blocs : [ … ] ». Le mot est le même dans les trois langues (le
// prompt le dicte tel quel) ; une ligne « Blocs : » qui n'ouvre PAS un tableau
// reste de la prose.
const ETIQUETTE_BLOCS = /^[ \t]*(?:\*\*)?[ \t]*blocs[ \t]*(?:\*\*)?[ \t]*[:：][ \t]*(?:\*\*)?[ \t]*/i;
const LIGNE_BLOCS = new RegExp(ETIQUETTE_BLOCS.source + '\\[', 'i');
const LIGNE_SUITE_OU_RETENIR = /^[ \t]*(?:\*\*)?[ \t]*(?:suites?|suggestions?|ensuite|next|siguientes?|a continuaci[oó]n|retenir|remember|recordar)[ \t]*(?:\*\*)?[ \t]*[:：]/i;

/**
 * Détache les lignes « Blocs : » du texte final. Rend `{ texte, blocs,
 * rejetes, lignes }` ; `texte` est le brut sans elles, prêt pour
 * `extraireMeta`. Un tableau écrit sur plusieurs lignes est recollé (12 lignes
 * au plus, jamais au-delà d'une ligne Suites/Retenir).
 */
function extraireBlocs(brut) {
  const lignes = String(brut || '').split('\n');
  const garde = [];
  const trouves = [];
  const rejetes = [];
  let nLignes = 0;
  for (let i = 0; i < lignes.length; i++) {
    if (!LIGNE_BLOCS.test(lignes[i])) { garde.push(lignes[i]); continue; }
    nLignes++;
    let json = lignes[i].replace(ETIQUETTE_BLOCS, '').replace(/\*\*\s*$/, '');
    let lu = null, fin = i;
    for (let j = i; j < Math.min(lignes.length, i + 12); j++) {
      if (j > i) {
        if (LIGNE_SUITE_OU_RETENIR.test(lignes[j])) break;
        json += '\n' + lignes[j];
      }
      try { lu = JSON.parse(json.trim()); fin = j; break; } catch (e) { lu = null; }
    }
    if (lu === null) {
      rejetes.push('JSON illisible');
      // Les lignes qui ressemblent à la suite du tableau partent avec lui.
      while (i + 1 < lignes.length && /^\s*[[\]{}",]/.test(lignes[i + 1]) && !LIGNE_SUITE_OU_RETENIR.test(lignes[i + 1])) i++;
      continue;
    }
    trouves.push(...(Array.isArray(lu) ? lu : [lu]));
    i = fin;
  }
  const v = validerBlocs(trouves);
  return { texte: garde.join('\n'), blocs: v.blocs, rejetes: rejetes.concat(v.rejetes), lignes: nLignes };
}

/** Le début d'une ligne qui pourrait devenir « Blocs : [ » (le flux la retient). */
function partielPeutEtreBlocs(partiel) {
  const s = partiel.replace(/^[ \t]*\*{0,2}[ \t]*/, '').toLowerCase();
  if (s === '') return false;
  if ('blocs'.startsWith(s)) return true;
  return /^blocs[ \t]*\*{0,2}[ \t]*([:：][ \t]*\*{0,2}[ \t]*(\[.*)?)?$/.test(s);
}

/**
 * Le préfixe de `texte` qu'on peut diffuser sans montrer une ligne « Blocs ».
 * Dès qu'une ligne complète « Blocs : [ » existe, le flux s'arrête à son début
 * (elle est écrite juste avant Retenir/Suites, qui ne s'affichent pas non
 * plus) ; une dernière ligne inachevée qui pourrait le devenir est retenue.
 * `fin.texte` fait foi : rien ne reste caché pour de bon.
 */
function partieSureBlocs(texte) {
  const s = String(texte || '');
  let debut = 0;
  for (;;) {
    const nl = s.indexOf('\n', debut);
    const ligne = nl < 0 ? s.slice(debut) : s.slice(debut, nl);
    if (nl < 0) return partielPeutEtreBlocs(ligne) || LIGNE_BLOCS.test(ligne) ? s.slice(0, debut) : s;
    if (LIGNE_BLOCS.test(ligne)) return s.slice(0, debut);
    debut = nl + 1;
  }
}

// ─── LE COMPLÉMENT DU PROMPT (PRÉFIXE FIXE) ─────────────────────────────────
//
// Ajouté au préfixe statique, seulement sur le chemin Claude. Aucune
// interpolation : le préfixe reste identique pour tous (cache).
const PROMPT_V3 = `COACH V3 — CE QUI S'AJOUTE AUX RÈGLES CI-DESSUS
OUTILS : DEMANDE SEULEMENT CE QUE LA QUESTION EXIGE
- Avant un appel, nomme pour toi la donnée précise qui manque pour répondre à CETTE question. Une question sur le sommeil n'appelle ni la récupération ni la charge ; une question sur un repas n'appelle pas les nuits ; une définition, un conseil général, un salut n'appellent aucun outil.
- La plus petite fenêtre qui répond : « cette nuit » = 1 nuit, « cette semaine » = 7, « ce mois-ci » = 30.
- « Relier aux autres signaux » (RÈGLES DES CHIFFRES) se fait avec ce que tu as déjà ou ce que la question appelle : jamais un outil de plus pour décorer.
- Tous les outils utiles en UN tour. Aucun texte avant un appel d'outil : l'app affiche elle-même ce que tu lis.
BLOCS VISUELS — L'APP DESSINE, TU CHOISIS
- Tu peux joindre 0, 1 ou 2 blocs visuels quand ils PROUVENT ou EXPLIQUENT ta réponse mieux qu'une phrase. L'app les dessine avec SES données : tu ne donnes JAMAIS une valeur, seulement quoi montrer. Ton texte reste complet sans eux, chiffres cités comme d'habitude.
- Format : une seule ligne, juste avant « Retenir : » ou « Suites : », exactement « Blocs : » suivi d'un tableau JSON sur la même ligne. Elle est retirée de l'écran ; tu peux écrire « voir le graphique » dans le texte, jamais citer ce format.
- Le catalogue est fermé ; tout autre bloc est jeté :
  · {"type":"serie","metrique":M,"jours":7|30|90,"repere":"normale"|"cible"|"aucun"} : la courbe d'une métrique ;
  · {"type":"comparaison","metrique":M,"jours":7|30|90} : les N derniers jours contre les N d'avant ;
  · {"type":"seance","jour":J} ou {"type":"seance","date":"AAAA-MM-JJ","id":"…","debut":"HH:MM"} : la fiche d'une séance ;
  · {"type":"zones","portee":"jour"|"seance"|"semaine","jour":J} : la répartition des minutes par zone ;
  · {"type":"nuit","jour":J} : les jalons d'une nuit (coucher, réveils, lever, stades) ;
  · {"type":"etapes","titre":"…","etapes":[{"titre":"…","texte":"…"}]} : 2 à 5 étapes d'explication, TEXTE SEUL, sans aucun chiffre.
  M ∈ recup, vfc, fcRepos, dormi, scoreSommeil, dette7n, effort, kcalBrulees, kcalMangees, balance, pas, poids, stress, resp, temp, spo2Bas. J = 0 aujourd'hui, −1 hier, jusqu'à −90. "titre" facultatif sur tout bloc : 60 caractères, AUCUN chiffre.
- Un bloc n'a de sens que si la donnée existe (tu l'as lue, ou l'INSTANTANÉ la porte) : pas de courbe de VFC sans bracelet. Question simple ou message anodin : aucun bloc.
- Exemple : Blocs : [{"type":"serie","metrique":"vfc","jours":30,"repere":"normale"}]`;

// Le rappel de la queue, lu juste avant d'écrire (voir RAPPEL dans _coach-prompt.js).
const RAPPEL_V3 = "BLOCS : 0 à 2, seulement s'ils prouvent ta réponse ; une ligne « Blocs : [ … ] » juste avant « Retenir : » / « Suites : ».";

module.exports = {
  decrireAppel, libelleAppel, etapesDesAppels, libellesDuTour, libelleRedaction,
  METRIQUES_BLOCS, BLOCS_MAX, BLOCS_SCHEMA, CLES_PERMISES, validerBloc, validerBlocs, extraireBlocs, partieSureBlocs,
  PROMPT_V3, RAPPEL_V3
};
