// FLINT — proxy d'analyse de repas (Gemini Flash) : photo OU description texte.
// Déployé sur Vercel. La clé API vit UNIQUEMENT ici (variable d'env GEMINI_API_KEY),
// jamais dans le front public.
//
// Front : POST { image: "<dataURL ou base64>", mime?: "image/jpeg" }
//      ou POST { text: "2 œufs au plat, une tranche de pain complet, un café au lait" }
// Retour: { mealName, items:[{name,grams,kcal,prot,carb,fat,confidence}], total:{kcal,prot,carb,fat} }

// 23 sept. 2026 — le premier est celui qu'on veut ; les suivants sont ceux
// qu'on accepte quand Google le déclare saturé (503 « high demand », mesuré
// pendant plus d'une demi-heure ce jour-là). Les trois savent rendre du JSON
// contraint par `responseSchema`, donc le reste de ce fichier ne change pas.
// Ce fichier n'importait rien de `_lib.js` (il a son propre rate-limit, plus
// ancien) : l'aide de réessai est la première chose qu'il partage avec le Coach.
const { appelerGemini, plafondJournalier, identiteRequete } = require('./_lib');
const MODELES = ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.0-flash'];

const SCHEMA = {
  type: 'object',
  properties: {
    mealName: { type: 'string' },
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          grams: { type: 'number' },
          kcal: { type: 'number' },
          prot: { type: 'number' },
          carb: { type: 'number' },
          fat: { type: 'number' },
          confidence: { type: 'number' }
        },
        required: ['name', 'grams', 'kcal', 'prot', 'carb', 'fat', 'confidence']
      }
    }
  },
  required: ['mealName', 'items']
};
// healthScore ajouté au schéma via propriétés supplémentaires
SCHEMA.properties.healthScore = { type: 'number' };
SCHEMA.properties.healthNote = { type: 'string' };
SCHEMA.required = ['mealName', 'items', 'healthScore'];

const PROMPT = `Tu es un nutritionniste expert en estimation visuelle. Analyse la photo de ce repas.
Identifie CHAQUE aliment visible séparément (ne regroupe pas tout en un seul item).
Pour chaque aliment : name (français court), grams, kcal, prot, carb, fat (grammes), confidence (0-1).

OBJECTIF : le nombre de calories le plus JUSTE possible. Ni prudent, ni généreux — exact.

MÉTHODE D'ESTIMATION DES PORTIONS :
1. Repères d'échelle : assiette standard ~26 cm, bol ~15 cm, couverts, mains, verre.
2. Estime le VOLUME, pas seulement la surface : un plat profond, empilé ou en sauce pèse bien plus lourd qu'une fine couche. Burgers, kebabs, gratins, lasagnes : compte l'épaisseur.
3. Portion la plus PROBABLE d'après la photo — pas la plus petite, pas la plus grande.

DENSITÉS CALORIQUES DE RÉFÉRENCE (kcal pour 100 g) — vérifie chaque item contre sa catégorie :
- légumes crus/cuits 15-45 · fruits 30-90 · féculents cuits (riz, pâtes, purée) 100-160
- viandes maigres 100-170 · viandes grasses/panées 200-300 · poissons 80-210
- pain 250-290 · pizza 220-280 · frites 280-330 · plats frits 250-350
- fromages 260-400 · charcuterie 250-400 · sauces grasses (mayo, béarnaise) 400-700
- pâtisseries/viennoiseries 350-450 · chocolat 500-550 · huile/beurre 720-900
Matières grasses de cuisson : compte-les si le plat est luisant, frit, pané ou en sauce (10-20 g d'huile pour un plat sauté, davantage pour une friture) ; n'en invente pas sur des crudités nature.

UN PLAT RICHE PEUT ÊTRE TRÈS CALORIQUE : burger-frites complet 1100-1600 kcal, kebab assiette 1200-1800, raclette/tartiflette 1300-2200, pizza entière 1600-2400. Ne sous-estime JAMAIS par prudence — si la photo montre beaucoup de nourriture dense, le chiffre doit suivre.

AUTO-VÉRIFICATION avant de répondre (corrige si besoin) :
1. Chaque item : kcal ≈ 4×prot + 4×carb + 9×fat (±10 %).
2. Chaque item : kcal/grams cohérent avec sa densité de catégorie ci-dessus.
3. Total : plausible pour ce que montre RÉELLEMENT la photo (quantité, richesse, épaisseur).

healthScore : note santé du plat de 1 à 10 (entier), pour un sportif :
- 8-10 : aliments bruts, légumes/fruits abondants, bonne source de protéines, peu transformé (ex. salade complète 9, poisson-riz-brocoli 9)
- 6-7 : équilibré mais un point faible (peu de légumes, sauce riche, portion très calorique)
- 4-5 : transformé, frit, ou très déséquilibré (pizza 5, burger-frites 4)
- 1-3 : ultra-transformé, sucré ou friture pure (soda 2, viennoiserie industrielle 3)
La quantité de protéines seule ne fait PAS le score : une salade de légumes frais sans viande reste 8+.
healthNote : justification en une phrase courte.

Donne un mealName court. Réponds UNIQUEMENT en JSON conforme au schéma.`;

const PROMPT_TEXT = `Tu es un nutritionniste expert. L'utilisateur décrit son repas en texte libre (français).
Identifie CHAQUE aliment mentionné séparément (ne regroupe pas tout en un seul item).
Pour chaque aliment : name (français court), grams, kcal, prot, carb, fat (grammes), confidence (0-1).

OBJECTIF : le nombre de calories le plus JUSTE possible. Ni prudent, ni généreux — exact.

PORTIONS :
1. Si la quantité est précisée (« 2 œufs », « 150 g de riz », « une tranche »), respecte-la exactement.
2. Sinon, prends la portion STANDARD la plus probable pour un adulte : œuf 55 g, tranche de pain 40 g,
   assiette de féculents cuits 200-300 g, portion de viande/poisson 120-180 g, yaourt 125 g,
   verre de jus 200 ml, café au lait 150-200 ml, poignée de noix 30 g.
3. Compte les matières grasses de cuisson probables (œufs au plat, plats sautés, fritures) ; n'en invente pas sur des crudités nature.

DENSITÉS CALORIQUES DE RÉFÉRENCE (kcal pour 100 g) — vérifie chaque item contre sa catégorie :
- légumes crus/cuits 15-45 · fruits 30-90 · féculents cuits (riz, pâtes, purée) 100-160
- viandes maigres 100-170 · viandes grasses/panées 200-300 · poissons 80-210
- pain 250-290 · pizza 220-280 · frites 280-330 · plats frits 250-350
- fromages 260-400 · charcuterie 250-400 · sauces grasses (mayo, béarnaise) 400-700
- pâtisseries/viennoiseries 350-450 · chocolat 500-550 · huile/beurre 720-900

AUTO-VÉRIFICATION avant de répondre (corrige si besoin) :
1. Chaque item : kcal ≈ 4×prot + 4×carb + 9×fat (±10 %).
2. Chaque item : kcal/grams cohérent avec sa densité de catégorie ci-dessus.
3. Total : plausible pour ce que décrit RÉELLEMENT l'utilisateur.
Si la description ne contient AUCUN aliment identifiable, renvoie items: [].

healthScore : note santé du plat de 1 à 10 (entier), pour un sportif :
- 8-10 : aliments bruts, légumes/fruits abondants, bonne source de protéines, peu transformé
- 6-7 : équilibré mais un point faible (peu de légumes, sauce riche, portion très calorique)
- 4-5 : transformé, frit, ou très déséquilibré (pizza 5, burger-frites 4)
- 1-3 : ultra-transformé, sucré ou friture pure (soda 2, viennoiserie industrielle 3)
healthNote : justification en une phrase courte.

Donne un mealName court. Réponds UNIQUEMENT en JSON conforme au schéma.

Description du repas : `;

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-flint-key');
}

// Rate-limit best-effort en mémoire (par IP, fenêtre glissante). Se réinitialise au cold start.
// Pour du costaud en prod : passer sur Vercel KV / Upstash Redis.
const RL = new Map();
const RL_WINDOW = 60000, RL_MAX = 20;
function rateLimited(ip) {
  const now = Date.now();
  const arr = (RL.get(ip) || []).filter(t => now - t < RL_WINDOW);
  arr.push(now);
  RL.set(ip, arr);
  if (RL.size > 5000) { for (const k of RL.keys()) { if (!(RL.get(k) || []).some(t => now - t < RL_WINDOW)) RL.delete(k); } }
  return arr.length > RL_MAX;
}

function round(n) { return Math.max(0, Math.round(Number(n) || 0)); }

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  // 1) Rate-limit par IP (cap les abus / le coût)
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  if (rateLimited(ip)) return res.status(429).json({ error: 'Trop de requêtes, réessaie dans une minute.' });

  // 23 sept. 2026 — le plafond par personne et par jour (voir `_lib.js`).
  // Dormant sans magasin partagé. Quand il est allumé : 60 analyses par
  // appareil et par jour — le natif ne se nomme pas encore (`x-flint-device`
  // absent d'AnalyseRepasNatif), donc le compte tombe sur l'IP en attendant,
  // ce qui est plus large, jamais plus étroit, pour une vraie personne.
  const plafond = await plafondJournalier({ id: identiteRequete(req), portee: 'scan', max: process.env.SCAN_PLAFOND_JOUR || 60 });
  if (plafond.atteint) {
    return res.status(429).json({ error: 'Beaucoup d\'analyses aujourd\'hui — on reprend demain.' });
  }

  // 2) Secret d'app (si FLINT_APP_SECRET est défini en env, on l'exige). Soft-secret : dissuade l'abus passant.
  const secret = process.env.FLINT_APP_SECRET;
  if (secret && req.headers['x-flint-key'] !== secret) return res.status(401).json({ error: 'unauthorized' });

  const key = process.env.GEMINI_API_KEY;
  if (!key) return res.status(500).json({ error: 'GEMINI_API_KEY manquante (variable d\'env Vercel)' });

  try {
    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
    let image = body && body.image;
    const text = (body && typeof body.text === 'string') ? body.text.trim().slice(0, 800) : '';
    if (!image && !text) return res.status(400).json({ error: 'champ "image" ou "text" manquant' });
    // 23 sept. 2026 — UN PLAFOND SUR LA PHOTO, PARCE QUE RIEN NE LA BORNAIT.
    // L'app envoie du 1280 px à 0,85 (≈ 200 à 400 Ko en base64) ; rien côté
    // serveur n'empêchait un client de pousser 10 Mo, que Gemini facture au
    // tuile et que la fonction paie en mémoire. 3 Mo de base64 ≈ 2,2 Mo de
    // JPEG : dix fois ce que l'app envoie, et aucune vraie photo de repas
    // n'a besoin de plus. Au-delà : 413, et une phrase que l'app sait afficher.
    if (typeof image === 'string' && image.length > 3 * 1024 * 1024) {
      return res.status(413).json({ error: 'Photo trop lourde pour être analysée. Réessaie avec une photo plus petite.' });
    }

    let parts;
    if (image) {
      // accepte une data URL (data:image/jpeg;base64,xxxx) ou du base64 brut
      let mime = (body && body.mime) || 'image/jpeg';
      const m = /^data:([^;]+);base64,(.*)$/s.exec(image);
      if (m) { mime = m[1]; image = m[2]; }
      parts = [{ text: PROMPT }, { inline_data: { mime_type: mime, data: image } }];
    } else {
      parts = [{ text: PROMPT_TEXT + text }];
    }

    const gReq = {
      contents: [{ parts }],
      generationConfig: { responseMimeType: 'application/json', responseSchema: SCHEMA, temperature: 0.1 }
    };

    // 23 sept. 2026 — réessai puis modèle de secours (voir `appelerGemini`
    // dans _lib.js). Deux modèles × deux tentatives × 25 s tiennent sous les
    // 120 s de la fonction. Le message rendu à l'app reste le même qu'avant
    // quand TOUT a échoué : « L'analyse est en panne à l'instant », qu'elle
    // sait déjà afficher — plus le statut brut de Gemini, qui n'est pas une
    // phrase pour l'utilisateur.
    const g = await appelerGemini({ key, modeles: MODELES, corps: gReq, delaiMs: 25000 });
    if (!g.ok) {
      console.log(`[scan] échec après ${g.tentatives} tentative(s), dernier statut ${g.status} (${g.modele || '-'})`);
      return res.status(502).json({ error: "L'analyse est en panne à l'instant. Réessaie dans un moment.",
                                    gemini: g.status, detail: g.detail });
    }
    if (g.modele !== MODELES[0]) console.log(`[scan] servi par le modèle de secours ${g.modele} (${g.tentatives} tentatives)`);
    const j = g.json;
    const txt = j && j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts && j.candidates[0].content.parts[0] && j.candidates[0].content.parts[0].text;
    if (!txt) return res.status(502).json({ error: 'réponse Gemini vide' });

    let data;
    try { data = JSON.parse(txt); } catch (e) { return res.status(502).json({ error: 'JSON Gemini invalide' }); }

    const items = (data.items || []).map(it => {
      const prot = round(it.prot), carb = round(it.carb), fat = round(it.fat);
      let kcal = round(it.kcal);
      // Garde-fou mathématique : kcal doit coller aux macros (4P+4G+9L).
      const kcalM = 4 * prot + 4 * carb + 9 * fat;
      if (kcalM > 0 && (kcal > kcalM * 1.3 || kcal < kcalM * 0.7)) kcal = Math.round(kcalM);
      return {
        name: String(it.name || 'Aliment'),
        grams: round(it.grams),
        kcal, prot, carb, fat,
        confidence: Math.max(0, Math.min(1, Number(it.confidence) || 0.5))
      };
    });
    const total = items.reduce((a, it) => ({ kcal: a.kcal + it.kcal, prot: a.prot + it.prot, carb: a.carb + it.carb, fat: a.fat + it.fat }), { kcal: 0, prot: 0, carb: 0, fat: 0 });
    // v1930 — UNE NOTE ABSENTE NE DEVIENT PLUS LA PIRE NOTE.
    // `Number(undefined) || 0` valait 0, que `Math.max(1, …)` remontait à 1 :
    // le modèle qui se tait produisait donc un 1/10 AUTHENTIQUE, indiscernable
    // d'un vrai jugement, et qui partait se figer dans la base du téléphone.
    // Le `|| null` en fin de ligne ne rattrapait rien — 1 est vrai.
    // Une impossibilité de juger n'est pas un mauvais jugement.
    const hsBrut = Number(data.healthScore);
    const healthScore = Number.isFinite(hsBrut) && hsBrut > 0
      ? Math.max(1, Math.min(10, Math.round(hsBrut)))
      : null;
    const healthNote = data.healthNote ? String(data.healthNote).slice(0, 160) : '';

    return res.status(200).json({ mealName: String(data.mealName || 'Mon repas'), items, total, healthScore, healthNote });
  } catch (e) {
    return res.status(500).json({ error: String((e && e.message) || e) });
  }
}
