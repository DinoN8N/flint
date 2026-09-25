// FLINT Coach — déclarations d'outils (function calling Gemini).
//
// Chaque outil correspond à un moteur FLINT déjà validé et déjà utilisé par
// les écrans (voir CoachOutils.swift côté iOS pour l'exécution réelle). Le
// LLM ne calcule jamais rien lui-même : il choisit quels outils appeler, le
// téléphone les exécute avec ses propres moteurs, et seul le résultat
// structuré revient ici. Rien de la base brute ne transite jamais.
//
// ═══ 25 SEPT. 2026 — CE QUE LES DESCRIPTIONS DISENT, ELLES LE DISENT JUSTE ══
//
// getUserProfile n'est PLUS déclaré : `flProfilData()` porte la photo de profil
// (`avatar`, 2,6 Mo mesurés chez Félix) — une fuite et un 413. PontCoach sait
// toujours l'exécuter, et les vieux fils gardent leurs paires appel/réponse
// (coach.js en retire les clés d'image). setCoachPreferences, que PontCoach
// exécute depuis la v2285, n'avait jamais été déclaré : il l'est. Et les unités
// de getSleepHistory sont écrites telles que l'outil les rend (des MINUTES, une
// minute du jour, une médiane) — le modèle citait ces nombres comme ceux de
// l'écran.
//
// ═══ 25 SEPT. 2026 (soir) — DEUX JEUX, ET C'EST LE BINAIRE QUI CHOISIT ═════
//
// V1 = les huit outils que TOUTE app posée sait exécuter. Depuis que le serveur
// récrit leurs réponses (`_coach-adaptateurs.js` : h:mm, HH:MM, manqueNuit…),
// leurs descriptions décrivent la réponse RÉCRITE — celle que le modèle lit.
// V2 = les outils du Coach v2 (flCoachOutils, par OTA, plus trois natifs). Ils
// ne partent qu'à une app qui annonce savoir les exécuter (`capacites`) ET que
// la porte d'équipe laisse passer : un outil qu'un binaire ne connaît pas
// reviendrait « outil inconnu », et la question serait perdue.
// Schémas : type/description/properties/required/enum/items, rien d'autre —
// une clé que Gemini refuse fait tomber TOUTES les requêtes en 400.

// Les quatre codes réels de `flTonCoach()` (ceux de l'onboarding, et la liste
// blanche de PontCoach) — pas une seconde liste.
const TONS_COACH = ['motivant', 'analytique', 'intensif', 'aucun'];

// Déclaré à l'identique dans les deux jeux : PontCoach l'exécute dans les deux.
const SET_COACH_PREFERENCES = {
  name: 'setCoachPreferences',
  description: "Change le style du Coach quand la personne le demande (« sois plus direct » → intensif, "
    + "« explique-moi plus » → analytique, « motive-moi » → motivant, « juste mes données » → aucun). "
    + "Jamais de ta propre initiative.",
  parameters: {
    type: 'object',
    properties: {
      ton: { type: 'string', enum: TONS_COACH.slice(),
             description: "motivant = encourageant ; analytique = plus de détails ; intensif = direct, très concis ; "
               + "aucun = « Pas de coach — juste mes données »." }
    },
    required: ['ton']
  }
};

const OUTILS_V1 = [
  {
    name: 'getCoachPreferences',
    description: "Style de coaching choisi par la personne : 'motivant' | 'analytique' | 'intensif' | 'aucun' "
      + "(aucun = « Pas de coach — juste mes données »).",
    parameters: { type: 'object', properties: {} }
  },
  {
    name: 'getRecoveryContext',
    description: "Récupération du jour : score (s, sur 100), zone, VFC de la nuit (vfc, ms) et FC au repos (fcRepos, bpm) "
      + "avec leurs normales personnelles (normales.vfc, normales.fcRepos) — compare toujours la valeur du jour à sa normale. "
      + "normales = moyenne sur 30 nuits pondérée vers le récent (demi-vie 7 jours) — PAS la normale imprimée par l'écran "
      + "Récupération (60 nuits).",
    parameters: { type: 'object', properties: {} }
  },
  {
    // 25 sept. 2026 (soir) — la réponse est RÉCRITE par le serveur avant que le
    // modèle la lise : on décrit donc ce qu'il lit, pas ce que le téléphone envoie.
    name: 'getSleepHistory',
    description: "Historique de sommeil des dernières nuits mesurées, une entrée par nuit (rangée sous le jour du RÉVEIL) — "
      + "pour voir une tendance sur plusieurs jours, pas un seul. UNITÉS (légende `unites` dans la réponse) : "
      + "dormi, eveil, auLit, besoin et manqueNuit en h:mm ; "
      + "coucher et lever en HH:MM, « (veille) » = le coucher était la veille au soir ; "
      + "manqueNuit = le manque de CETTE nuit face au besoin AJUSTÉ, PAS la « Dette accumulée » de Ma nuit (pas ta dette) ; "
      + "score et recup sur 100 ; eff, couverture et regul en % ; vfc en ms ; fcRepos en bpm ; respiration par minute ; "
      + "spo2Mediane = la MÉDIANE de la nuit, alors que l'app affiche le 10e percentile ; "
      + "tempAbsolue en °C, alors que l'app ne juge que l'écart à la référence ; "
      + "journal = les réponses du journal de ce jour-là (elles jouent sur la récup du LENDEMAIN). "
      + "Ni séances, ni repas, ni effort ici : d'autres outils les donnent.",
    parameters: {
      type: 'object',
      properties: { joursN: { type: 'integer', description: 'Nombre de nuits à remonter : entier de 1 à 14.' } },
      required: ['joursN']
    }
  },
  {
    name: 'getActivityHistory',
    description: "TOUTES les séances récentes, telles que l'app les liste : sports lancés par la personne, "
      + "séances du mode sport de la montre, activités détectées par le bracelet, sorties GPS. Pour chacune : "
      + "jour, quand (aujourd'hui/hier/il y a N jours), nom, qui a posé le nom (la personne, ou le bracelet = "
      + "supposition), heure de début, durée (min), effort sur 20, FC moyenne et max (bpm), calories (kcal), pas, "
      + "distance (km, GPS), origine. "
      + "L'effort sur 20 arrive sous le nom effortListe : il peut différer de la note de la carte.",
    parameters: {
      type: 'object',
      properties: { joursN: { type: 'integer', description: 'Nombre de jours à remonter (1 à 90).' } },
      required: ['joursN']
    }
  },
  {
    name: 'getTrainingLoad',
    description: "Charge d'entraînement récente comparée à la charge habituelle (7 jours vs 4 semaines) : "
      + "rapport aigu/chronique et sa zone (< 0,8 sous-charge, ≤ 1,3 optimal, ≤ 1,5 élevé, au-delà risque). "
      + "manque = pas de verdict (pas assez de jours mesurés) : dis-le, n'invente pas de rapport.",
    parameters: { type: 'object', properties: {} }
  },
  {
    name: 'getNutritionToday',
    description: "Nutrition du jour : calories (kcal) consommées, restantes, budget, macros en g (actuel/cible), "
      + "repas déjà pris (heure, kcal, macros en g, note sur 10).",
    parameters: { type: 'object', properties: {} }
  },
  {
    name: 'saveMemoryFact',
    description: "Enregistre UN fait durable que l'utilisateur vient de dire volontairement sur lui-même — une préférence, un objectif à venir, une contrainte. Jamais pour une phrase anodine, une question ponctuelle, ou une donnée déjà disponible via un autre outil.",
    parameters: {
      type: 'object',
      properties: { fait: { type: 'string', description: 'Le fait à retenir, formulé simplement et à la troisième personne (ex. "déteste les champignons", "prépare un semi-marathon en mars").' } },
      required: ['fait']
    }
  },
  SET_COACH_PREFERENCES
];

// Compatibilité : coach.js et les bancs d'avant lisent `OUTILS`.
const OUTILS = OUTILS_V1;

// ═══ LES OUTILS V2 ══════════════════════════════════════════════════════════
//
// Les deux listes fermées ci-dessous sont épinglées aussi dans les bancs du
// moteur (flint-coach.js) : une colonne ou une clé qu'un seul côté connaît
// reviendrait vide. getTrend n'offre ni 'charge' (les points de loadOf, PAS
// sur 20) ni 'kcalBal' (qui rend la dépense, pas la balance) : volontaire.
const COLONNES_HISTORIQUE = [
  'recup', 'scoreSommeil', 'dormi', 'besoin', 'dette7n', 'coucher', 'lever', 'efficacite',
  'vfc', 'vfcSrc', 'fcRepos', 'resp', 'temp', 'spo2Bas', 'effort', 'zones13', 'zones45',
  'muscu', 'pas', 'kcalBrulees', 'kcalMangees', 'balance', 'poids', 'stress', 'journal'
];
const CLES_TENDANCE = [
  'recovery', 'hrv', 'rhr', 'resp', 'sleep', 'sleepscore', 'sleeppct', 'sleepreg', 'sleepdebt',
  'sleepeff', 'sleepresto', 'timeinbed', 'steps', 'zones13', 'zones45', 'strength', 'kcalOut',
  'kcalIn', 'fcavg', 'vo2', 'weight', 'leanmass'
];

const OUTILS_V2 = [
  {
    name: 'getDay',
    description: "Un AUTRE jour que celui de l'INSTANTANÉ, tel que ses écrans le montrent : récup /100 et facteurs, "
      + "nuit (durées h:mm, heures HH:MM, score /100, besoin, dette), VFC ms, FC repos bpm, respiration /min, "
      + "température en écart °C, SpO₂ basse %, effort /20 et minutes par zone, séances, kcal, nutrition, Cardio, journal. "
      + "Pour « pourquoi ma récup était basse mardi », une nuit d'il y a 12 jours. Donne jour OU date.",
    parameters: {
      type: 'object',
      properties: {
        jour: { type: 'integer', description: "Décalage : −1 = hier, jusqu'à −400." },
        date: { type: 'string', description: "'AAAA-MM-JJ', à la place de jour." },
        avecRepas: { type: 'boolean', description: 'true pour le détail des repas.' }
      }
    }
  },
  {
    name: 'getHistory',
    description: "Séries QUOTIDIENNES longues, pour une tendance ou une corrélation au-delà des 7 jours de "
      + "l'instantané (« mon sommeil ce mois-ci », « l'alcool et ma récup »). Ne demande QUE les colonnes utiles. "
      + "Rend {cols, lignes}, du plus ancien au plus récent, sans aujourd'hui ; null = pas mesuré. "
      + "Unités : recup, scoreSommeil /100 ; dormi, besoin, dette7n h:mm ; coucher, lever HH:MM ; efficacite % ; "
      + "vfc ms (vfcSrc : jamais deux sources comparées) ; fcRepos bpm ; resp /min ; temp écart °C ; spo2Bas % ; "
      + "effort /20 ; zones13, zones45, muscu min ; kcal (balance : déficit négatif) ; poids kg ; stress 0–3 ; "
      + "journal du jour K → récup de K+1.",
    parameters: {
      type: 'object',
      properties: {
        colonnes: { type: 'array', items: { type: 'string', enum: COLONNES_HISTORIQUE.slice() } },
        jours: { type: 'integer', description: 'Entier de 8 à 90.' }
      },
      required: ['colonnes', 'jours']
    }
  },
  {
    name: 'getTrend',
    description: "La page détail d'une métrique, dans les mots de l'écran : moyenne de la semaine, du mois ou de "
      + "l'année, période précédente, plage habituelle (P25–P75), sens (−1|0|1) et la phrase de l'app. Pour « est-ce "
      + "que je progresse ». Cite moyenne et lecture telles quelles, avec l'unité rendue.",
    parameters: {
      type: 'object',
      properties: {
        cle: { type: 'string', enum: CLES_TENDANCE.slice(),
               description: 'recovery /100, hrv = VFC ms, rhr = FC repos bpm, steps = pas, kcalOut/kcalIn = brûlées/mangées.' },
        periode: { type: 'string', enum: ['S', 'M', 'A'], description: 'Semaine, mois, année.' },
        recul: { type: 'integer', description: '0 = période en cours, 1 = la précédente… 12.' }
      },
      required: ['cle', 'periode']
    }
  },
  {
    name: 'getSessions',
    description: "Les séances AU-DELÀ des 3 jours de l'instantané, ou d'un sport (« mes séances de foot du mois ») : "
      + "note20 = note de la carte /20, min, FC bpm, kcal, km et allure GPS. Aussi les sports vraiment pratiqués et "
      + "les corrections de nom de la personne (elle a raison sur son sport). detail : fiche des 2 séances trouvées ; "
      + "records : records GPS.",
    parameters: {
      type: 'object',
      properties: {
        jours: { type: 'integer', description: 'Entier de 1 à 31.' },
        sport: { type: 'string' },
        detail: { type: 'boolean' },
        records: { type: 'boolean' }
      },
      required: ['jours']
    }
  },
  {
    name: 'getSession',
    description: "UNE séance absente du détail de l'instantané : zones (% et durée), fiabilité du cœur (coeurFiable "
      + "false = mur optique : effort et kcal sous-estimés), moyennes de la personne pour ce sport sur 45 j, fiche détente "
      + "(sauna, bain, méditation). Sortie GPS : splits par km avec FC, dérive, récupération cardiaque, coût par km. "
      + "Effort /20, FC bpm, kcal. Donne jour OU date, et id ou debut si tu les as.",
    parameters: {
      type: 'object',
      properties: {
        jour: { type: 'integer', description: "0 = aujourd'hui, −1 = hier…" },
        date: { type: 'string', description: "'AAAA-MM-JJ'" },
        id: { type: 'string' },
        debut: { type: 'string', description: "'HH:MM'" },
        gps: { type: 'string', description: 'id de la sortie GPS' }
      }
    }
  },
  {
    name: 'getDevice',
    description: "Bracelet et app au-delà du résumé natif : « pourquoi je n'ai pas de récup », « mon bracelet "
      + "synchronise ? », une nuit manquante, le réveil, les réglages, le pouls en direct, les notifications. "
      + "Synchro en min, batterie en % et autonomie en h. porteNuit null ne veut PAS dire « porté ».",
    parameters: { type: 'object', properties: {} }
  },
  {
    name: 'getPastThread',
    description: "Les conversations passées, quand la personne évoque un échange ABSENT de ÉCHANGES RÉCENTS "
      + "(« la dernière fois », « tu m'avais dit »). Du plus récent au plus ancien, fil en cours exclu. "
      + "Les chiffres qui y figurent sont d'époque.",
    parameters: {
      type: 'object',
      properties: {
        recherche: { type: 'string', description: 'Mots à chercher.' },
        n: { type: 'integer', description: 'Entier de 1 à 3.' }
      }
    }
  },
  SET_COACH_PREFERENCES
];

// ═══ LE LIBELLÉ DE CE QUE LE COACH FAIT, DANS LA LANGUE DE L'APP ═══════════
//
// Rendu avec chaque tour d'outils (`libelles`) : un outil neuf a sa phrase sans
// passer par une version de l'app ni par son catalogue. Les V1 reprennent mot
// pour mot `CoachActivite` (CoachReseau.swift) et ses traductions — la phrase
// ne change pas quand le libellé change de source.
const LIBELLES = {
  fr: {
    getRecoveryContext: 'Analyse de ta récupération…',
    getSleepHistory: 'Lecture de tes nuits…',
    getTrainingLoad: "Calcul de ta charge d'entraînement…",
    getActivityHistory: 'Relecture de tes séances…',
    getNutritionToday: 'Lecture de tes repas du jour…',
    getUserProfile: 'Lecture de ton profil…',
    getCoachPreferences: 'Lecture de ton profil…',
    saveMemoryFact: 'Je note ça…',
    setCoachPreferences: "J'ajuste mon style…",
    getDay: 'Lecture de cette journée…',
    getHistory: 'Relecture de tes derniers jours…',
    getTrend: 'Lecture de ta tendance…',
    getSessions: 'Relecture de tes séances…',
    getSession: 'Analyse de ta séance…',
    getDevice: 'Vérification de ton bracelet…',
    getPastThread: 'Relecture de vos échanges…'
  },
  en: {
    getRecoveryContext: 'Analyzing your recovery…',
    getSleepHistory: 'Reading your nights…',
    getTrainingLoad: 'Computing your training load…',
    getActivityHistory: 'Going over your sessions…',
    getNutritionToday: "Reading today's meals…",
    getUserProfile: 'Reading your profile…',
    getCoachPreferences: 'Reading your profile…',
    saveMemoryFact: 'Noting that down…',
    setCoachPreferences: 'Adjusting my style…',
    getDay: 'Reading that day…',
    getHistory: 'Going over your last days…',
    getTrend: 'Reading your trend…',
    getSessions: 'Going over your sessions…',
    getSession: 'Analyzing your session…',
    getDevice: 'Checking your band…',
    getPastThread: 'Going over our past conversations…'
  },
  es: {
    getRecoveryContext: 'Analizando tu recuperación…',
    getSleepHistory: 'Leyendo tus noches…',
    getTrainingLoad: 'Calculando tu carga de entrenamiento…',
    getActivityHistory: 'Repasando tus sesiones…',
    getNutritionToday: 'Leyendo tus comidas de hoy…',
    getUserProfile: 'Leyendo tu perfil…',
    getCoachPreferences: 'Leyendo tu perfil…',
    saveMemoryFact: 'Lo apunto…',
    setCoachPreferences: 'Ajustando mi estilo…',
    getDay: 'Leyendo ese día…',
    getHistory: 'Repasando tus últimos días…',
    getTrend: 'Leyendo tu tendencia…',
    getSessions: 'Repasando tus sesiones…',
    getSession: 'Analizando tu sesión…',
    getDevice: 'Revisando tu pulsera…',
    getPastThread: 'Repasando nuestras conversaciones…'
  }
};

// ═══ QUEL JEU POUR QUELLE APP ══════════════════════════════════════════════
//
// V2 seulement si le binaire dit savoir exécuter les outils JS (moteur OTA,
// `capacites.outils`) ET les natifs (`capacites.natif`), et si la porte
// (équipe, puis facturation) est ouverte. Tout le reste — app d'avant sans
// `capacites`, moteur pas encore livré, porte fermée — reçoit V1, que toute
// app posée sait exécuter. Des nombres seulement : « 1 » en chaîne n'est pas
// une capacité annoncée par un binaire.
function capacite(c, nom) {
  const v = c && typeof c === 'object' ? c[nom] : undefined;
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

function outilsPour({ capacites, v2Autorise } = {}) {
  if (v2Autorise === true && capacite(capacites, 'outils') >= 1 && capacite(capacites, 'natif') >= 1) {
    return { version: 'v2', outils: OUTILS_V2 };
  }
  return { version: 'v1', outils: OUTILS_V1 };
}

module.exports = {
  OUTILS, OUTILS_V1, OUTILS_V2, TONS_COACH, LIBELLES, outilsPour,
  COLONNES_HISTORIQUE, CLES_TENDANCE
};
