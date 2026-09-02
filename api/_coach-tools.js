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
    description: "Récupération du jour : score, HRV, fréquence cardiaque au repos, zone (haute/modérée/basse).",
    parameters: { type: 'object', properties: {} }
  },
  {
    name: 'getSleepHistory',
    description: 'Historique de sommeil sur N derniers jours : score, durée, coucher/réveil, régularité, dette.',
    parameters: {
      type: 'object',
      properties: { joursN: { type: 'integer', description: 'Nombre de jours à remonter (1 à 30).' } },
      required: ['joursN']
    }
  },
  {
    name: 'getActivityHistory',
    description: "Historique des activités/entraînements récents : sport, durée, distance, allure, FC moyenne.",
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
