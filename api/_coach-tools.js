// FLINT Coach — déclarations d'outils (function calling Gemini).
//
// Chaque outil correspond à un moteur FLINT déjà validé et déjà utilisé par
// les écrans (voir CoachOutils.swift côté iOS pour l'exécution réelle). Le
// LLM ne calcule jamais rien lui-même : il choisit quels outils appeler, le
// téléphone les exécute avec ses propres moteurs, et seul le résultat
// structuré revient ici. Rien de la base brute ne transite jamais.

const OUTILS = [
  {
    name: 'getUserProfile',
    description: "Profil de l'utilisateur : âge, sexe, taille, poids, objectif de poids/performance.",
    parameters: { type: 'object', properties: {} }
  },
  {
    name: 'getCoachPreferences',
    description: 'Ton de coaching choisi par l\'utilisateur (équilibré/analytique/encourageant/direct).',
    parameters: { type: 'object', properties: {} }
  },
  {
    name: 'getRecoveryContext',
    description: "Récupération du jour : score (s, sur 100), zone, VFC de la nuit (vfc, ms) et FC au repos (fcRepos, bpm) avec leurs normales personnelles sur 30 jours (normales.vfc, normales.fcRepos) — compare toujours la valeur du jour à sa normale.",
    parameters: { type: 'object', properties: {} }
  },
  {
    name: 'getSleepHistory',
    description: 'Historique de sommeil sur N derniers jours, une entrée par nuit : score, durée dormie, besoin, dette, coucher/réveil, réveils, et la VFC (vfc, ms), la FC au repos (fcRepos, bpm) et la respiration de chaque nuit — pour voir une tendance sur plusieurs jours, pas un seul.',
    parameters: {
      type: 'object',
      properties: { joursN: { type: 'integer', description: 'Nombre de jours à remonter (1 à 30).' } },
      required: ['joursN']
    }
  },
  {
    name: 'getActivityHistory',
    description: "TOUTES les séances récentes, telles que l'app les liste : sports lancés par la personne, "
      + "séances du mode sport de la montre, activités détectées par le bracelet, sorties GPS. Pour chacune : "
      + "jour, quand (aujourd'hui/hier/il y a N jours), nom, qui a posé le nom (la personne, ou le bracelet = "
      + "supposition), heure de début, durée, effort sur 20, FC moyenne et max, calories, pas, distance (GPS), origine.",
    parameters: {
      type: 'object',
      properties: { joursN: { type: 'integer', description: 'Nombre de jours à remonter (1 à 90).' } },
      required: ['joursN']
    }
  },
  {
    name: 'getTrainingLoad',
    description: "Charge d'entraînement récente comparée à la charge habituelle (7 jours vs 4 semaines).",
    parameters: { type: 'object', properties: {} }
  },
  {
    name: 'getNutritionToday',
    description: "Nutrition du jour : calories et macros consommées, restantes, budget, repas déjà pris.",
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
  }
];

module.exports = { OUTILS };
