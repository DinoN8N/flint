// FLINT — proxy d'analyse de repas par photo (Gemini Flash, vision).
// Déployé sur Vercel. La clé API vit UNIQUEMENT ici (variable d'env GEMINI_API_KEY),
// jamais dans le front public.
//
// Front : POST { image: "<dataURL ou base64>", mime?: "image/jpeg" }
// Retour: { mealName, items:[{name,grams,kcal,prot,carb,fat,confidence}], total:{kcal,prot,carb,fat} }

const MODEL = 'gemini-2.5-flash';

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

  // 2) Secret d'app (si FLINT_APP_SECRET est défini en env, on l'exige). Soft-secret : dissuade l'abus passant.
  const secret = process.env.FLINT_APP_SECRET;
  if (secret && req.headers['x-flint-key'] !== secret) return res.status(401).json({ error: 'unauthorized' });

  const key = process.env.GEMINI_API_KEY;
  if (!key) return res.status(500).json({ error: 'GEMINI_API_KEY manquante (variable d\'env Vercel)' });

  try {
    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
    let image = body && body.image;
    if (!image) return res.status(400).json({ error: 'champ "image" manquant' });

    // accepte une data URL (data:image/jpeg;base64,xxxx) ou du base64 brut
    let mime = (body && body.mime) || 'image/jpeg';
    const m = /^data:([^;]+);base64,(.*)$/s.exec(image);
    if (m) { mime = m[1]; image = m[2]; }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${key}`;
    const gReq = {
      contents: [{ parts: [{ text: PROMPT }, { inline_data: { mime_type: mime, data: image } }] }],
      generationConfig: { responseMimeType: 'application/json', responseSchema: SCHEMA, temperature: 0.1 }
    };

    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(gReq) });
    if (!r.ok) {
      const t = await r.text();
      return res.status(502).json({ error: 'Gemini ' + r.status, detail: t.slice(0, 400) });
    }
    const j = await r.json();
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
    const healthScore = Math.max(1, Math.min(10, Math.round(Number(data.healthScore) || 0))) || null;
    const healthNote = data.healthNote ? String(data.healthNote).slice(0, 160) : '';

    return res.status(200).json({ mealName: String(data.mealName || 'Mon repas'), items, total, healthScore, healthNote });
  } catch (e) {
    return res.status(500).json({ error: String((e && e.message) || e) });
  }
}
