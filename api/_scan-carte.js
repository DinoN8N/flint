// FLINT — le mode « carte » du scan : une carte de restaurant photographiée.
//
// ═══ 16 NOV. 2026 — « TU PRENDS LA CARTE EN PHOTO » ════════════════════════
//
// L'idée choisie par Dino le 15 nov. (« J'adore ») : au restaurant, on photographie
// la carte, FLINT entoure les deux plats qui collent à la journée. Le partage du
// travail est STRICT, et il commande tout ce fichier :
//
//   · LE SERVEUR LIT. Il rend la liste des plats lisibles, tels qu'ils sont
//     écrits, avec une estimation (une valeur, une fourchette, une confiance)
//     et, quand il sait le faire, la place de chaque plat sur la photo ;
//   · L'APP CHOISIT. Les deux plats se décident sur le téléphone, avec les
//     vrais chiffres de la journée (ce qui reste, la séance, ce qui manque).
//     Rien de la journée ne part ici, et aucun classement ne se fait ici.
//
// ═══ UN PROMPT ET UN SCHÉMA NEUTRES, UNE ENVELOPPE GEMINI ══════════════════
//
// Le fournisseur reste celui de la route (Gemini, `appelerGemini`). Mais le
// prompt est du texte, et le schéma un sous-ensemble de JSON Schema que les deux
// fournisseurs lisent tels quels : `type`, `properties`, `items`, `required`,
// `enum`, `description` — et rien d'autre (le banc le vérifie). Ce qui est propre
// à Gemini vit dans DEUX fonctions et nulle part ailleurs :
//
//   corpsGemini(prompt, schema, image, mime)   l'enveloppe de la requête
//   texteGemini(json)                          le texte JSON de la réponse
//
// Passer sur Claude, le jour venu : le même prompt en bloc `text` après un bloc
// `image` (base64), le même SCHÉMA en `input_schema` d'un outil unique
// (`rendre_analyse`) imposé par `tool_choice: { type: 'tool', name: … }`, et
// l'`input` du bloc `tool_use` à la place de `texteGemini`. La normalisation
// (`normaliserCarte`) ne bouge pas : elle ne connaît que l'objet rendu.
//
// ⚠️ LA POSITION SUR LA PHOTO EST UNE CONVENTION DE GEMINI : `[ymin, xmin, ymax,
// xmax]` en millièmes de l'image, la forme sur laquelle ses modèles sont
// entraînés pour la détection. Un autre modèle la rendra peut-être moins bien :
// c'est exactement pourquoi elle passe par une porte (`zonesFiables`) qui la
// jette ENTIÈRE dès qu'elle n'est pas crédible. Sans position, l'app met les deux
// plats en avant dans une liste ; elle n'entoure jamais au hasard.

// ── Les rubriques ────────────────────────────────────────────────────────────
// Des mots ASCII, stables, que l'app traduit. « autre » = formule, menu enfant,
// plat à partager, tout ce qui ne se range pas.
const SECTIONS = ['entree', 'plat', 'dessert', 'boisson', 'accompagnement', 'autre'];

const PLATS_MAX = 40;

// ── Le schéma d'UN plat de la carte ──────────────────────────────────────────
// `price`, `description` et `box` sont facultatifs : absents de la carte (ou de
// la certitude du modèle), ils sont ABSENTS de la réponse — jamais 0, jamais
// une chaîne vide qu'on prendrait pour une valeur.
const SCHEMA_PLAT = {
  type: 'object',
  properties: {
    name: { type: 'string', description: 'Le nom du plat tel qu\'il est écrit sur la carte.' },
    description: { type: 'string', description: 'La ligne de description du plat, si la carte en donne une.' },
    section: { type: 'string', enum: SECTIONS },
    price: { type: 'number', description: 'Le prix écrit à côté du plat, en nombre.' },
    kcal: { type: 'number' },
    kcalMin: { type: 'number' },
    kcalMax: { type: 'number' },
    prot: { type: 'number' },
    carb: { type: 'number' },
    fat: { type: 'number' },
    confidence: { type: 'number' },
    box: { type: 'array', items: { type: 'number' },
           description: '[ymin, xmin, ymax, xmax] en millièmes de l\'image (0 à 1000).' }
  },
  required: ['name', 'section', 'kcal', 'kcalMin', 'kcalMax', 'prot', 'carb', 'fat', 'confidence']
};

const SCHEMA_MENU = {
  type: 'object',
  properties: {
    name: { type: 'string', description: 'Le nom du restaurant, s\'il est écrit.' },
    currency: { type: 'string', description: 'La devise des prix, en code ISO 4217 (EUR, CHF, GBP…).' },
    dishes: { type: 'array', items: SCHEMA_PLAT }
  },
  required: ['dishes']
};

// ── Le prompt de la carte ────────────────────────────────────────────────────
// Écrit pour une PORTION DE RESTAURANT : plus grande et plus grasse qu'à la
// maison. Les densités reprennent le tableau du prompt des repas (scan-meal.js),
// pour qu'une carte et une assiette parlent le même chiffre.
const CONSIGNES_CARTE = `La photo montre une CARTE de restaurant (menu imprimé, ardoise, écran de commande).
Relève chaque plat LISIBLE, dans l'ordre de lecture, ${PLATS_MAX} au plus. Ignore ce que tu ne peux pas lire : n'invente jamais un plat.

Pour chaque plat :
- name : le nom EXACTEMENT tel qu'il est écrit — même langue, même orthographe, sans traduire, sans corriger, sans le prix ;
- description : la ligne de description qui l'accompagne, si la carte en donne une (sinon omets le champ) ;
- section : la rubrique de la carte où il est rangé : "entree", "plat", "dessert", "boisson", "accompagnement" (frites, légumes, pain en supplément) ou "autre" (formule, menu enfant, planche à partager) ;
- price : le prix écrit à côté du plat, en nombre (« 14,50 € » → 14.5) ; s'il n'y a pas de prix pour ce plat, omets le champ ;
- kcal, prot, carb, fat : l'estimation d'UNE portion telle qu'un restaurant la sert (pas une portion maison) ;
- kcalMin, kcalMax : la fourchette plausible de cette portion — une carte ne montre ni l'assiette ni la cuisine, la fourchette dit cette incertitude (en général ±20 à 35 %) ;
- confidence (0-1) : 0,7 et plus si le plat est classique et décrit (« pavé de saumon, riz, brocolis ») ; 0,3 à 0,5 s'il est vague (« suggestion du chef », « plat du jour ») ;
- box : la place du NOM du plat sur la photo, [ymin, xmin, ymax, xmax] en millièmes de l'image (0 à 1000), le rectangle serré autour du nom (et de sa description si elle est juste dessous). Si tu n'es pas sûr de l'endroit, omets le champ.

PORTIONS DE RESTAURANT (poids servi) : entrée 150-300 g, plat 350-550 g, dessert 120-200 g, accompagnement 150-250 g.
Les cuissons de restaurant sont généreuses en matières grasses : beurre, huile, crème, sauce. Compte-les.
DENSITÉS CALORIQUES DE RÉFÉRENCE (kcal pour 100 g) :
- légumes crus/cuits 15-45 · fruits 30-90 · féculents cuits (riz, pâtes, purée) 100-160
- viandes maigres 100-170 · viandes grasses/panées 200-300 · poissons 80-210
- pain 250-290 · pizza 220-280 · frites 280-330 · plats frits 250-350
- fromages 260-400 · charcuterie 250-400 · sauces grasses (mayo, béarnaise) 400-700
- pâtisseries 350-450 · chocolat 500-550 · huile/beurre 720-900
REPÈRES DE PLATS ENTIERS : salade composée 350-800 · poisson et légumes 400-650 · pâtes à la crème 800-1200 · entrecôte-frites 1000-1400 · burger-frites 1100-1600 · dessert 300-600 · verre de vin (12 cl) 85-100 · bière (25 cl) 100-120 · soda (33 cl) 140.
AUTO-VÉRIFICATION : kcal ≈ 4×prot + 4×carb + 9×fat (±10 %), et kcalMin ≤ kcal ≤ kcalMax.

menu.name : le nom du restaurant s'il est écrit (sinon omets le champ). menu.currency : la devise des prix (EUR, CHF, GBP, USD…), si on la voit.`;

const PROMPT_CARTE = `Tu es un nutritionniste qui lit des cartes de restaurant.
${CONSIGNES_CARTE}

Réponds UNIQUEMENT en JSON conforme au schéma.`;

// ── Le prompt « décide d'abord » ─────────────────────────────────────────────
// L'app qui SAIT montrer une carte l'annonce (`carte: "auto"`) ; c'est alors le
// modèle qui tranche, dans le même appel — une photo ne fait pas deux allers-
// retours chez Google. Le prompt des repas y est repris MOT POUR MOT (il est
// calibré : 4 % d'erreur médiane, proxy/LISEZ-MOI.md côté app) ; on ne fait que
// le précéder d'une question et le suivre des consignes de la carte.
function promptAuto(promptRepas) {
  const repas = String(promptRepas).replace(/\n*Donne un mealName court\. Réponds UNIQUEMENT en JSON conforme au schéma\.\s*$/, '');
  return `ÉTAPE 1 — DE QUOI EST-CE LA PHOTO ?
- kind = "carte" si la photo montre surtout une CARTE ou un MENU de restaurant : du texte qui liste des plats (menu papier, ardoise, écran de commande), et non les plats eux-mêmes.
- kind = "repas" dans tous les autres cas (une assiette, un aliment, une boisson, un emballage), même si un coin de carte dépasse à côté de l'assiette.
Si kind = "repas" : remplis mealName, items, healthScore et healthNote selon les CONSIGNES REPAS, et omets menu.
Si kind = "carte" : remplis menu selon les CONSIGNES CARTE, rends items vide et omets le reste.

=== CONSIGNES REPAS ===
${repas}
Donne un mealName court.

=== CONSIGNES CARTE ===
${CONSIGNES_CARTE}

Réponds UNIQUEMENT en JSON conforme au schéma.`;
}

/** Le schéma « décide d'abord » : `kind`, puis les champs du repas OU la carte. */
function schemaAuto(schemaRepas) {
  const props = Object.assign({ kind: { type: 'string', enum: ['repas', 'carte'] } }, schemaRepas.properties, { menu: SCHEMA_MENU });
  return { type: 'object', properties: props, required: ['kind'] };
}

/** Le schéma de la carte seule (`mode: "carte"`, l'app l'a demandé). */
const SCHEMA_CARTE = { type: 'object', properties: { menu: SCHEMA_MENU }, required: ['menu'] };

// ── L'enveloppe Gemini : SEUL endroit qui connaît sa forme ────────────────────

/** `propertyOrdering` : Gemini écrit les champs dans cet ordre (sinon l'ordre
 *  alphabétique) — `kind` d'abord, le nom avant les chiffres. Ajouté sur une
 *  COPIE : le schéma neutre reste neutre. */
function pourGemini(schema) {
  if (Array.isArray(schema)) return schema.map(pourGemini);
  if (!schema || typeof schema !== 'object') return schema;
  const o = {};
  for (const k of Object.keys(schema)) {
    if (k === 'properties') continue;              // une table de champs, pas un schéma : voir dessous
    o[k] = (k === 'enum' || k === 'required') ? schema[k].slice() : pourGemini(schema[k]);
  }
  if (schema.properties && typeof schema.properties === 'object') {
    o.properties = {};
    for (const k of Object.keys(schema.properties)) o.properties[k] = pourGemini(schema.properties[k]);
    o.propertyOrdering = Object.keys(schema.properties);
  }
  return o;
}

function corpsGemini({ prompt, schema, image, mime }) {
  return {
    contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: mime, data: image } }] }],
    generationConfig: { responseMimeType: 'application/json', responseSchema: pourGemini(schema), temperature: 0.1 }
  };
}

function texteGemini(j) {
  return j && j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts
      && j.candidates[0].content.parts[0] && j.candidates[0].content.parts[0].text;
}

// ── La normalisation : ce qui sort vers l'app ────────────────────────────────

const fini = (x) => typeof x === 'number' && Number.isFinite(x);
const nb = (x) => { const n = Number(x); return Number.isFinite(n) ? n : NaN; };
const entier = (x) => Math.max(0, Math.round(nb(x) || 0));

/** Un texte court, propre, sans saut de ligne (il part dans une ligne d'écran). */
function texte(x, max) {
  if (typeof x !== 'string') return '';
  return x.replace(/\s+/g, ' ').trim().slice(0, max);
}

/**
 * La place d'un plat : `[ymin, xmin, ymax, xmax]` en millièmes → `{x, y, w, h}`
 * en fractions de l'image, ou `null` si elle n'est pas crédible SEULE :
 * hors de l'image, à l'envers, plus haute qu'un quart de page (ce n'est plus
 * une ligne de carte), plus basse que 0,6 % (illisible), ou plus étroite que
 * 3 % de la largeur.
 */
function zone(box) {
  if (!Array.isArray(box) || box.length !== 4 || !box.every(fini)) return null;
  const [y0, x0, y1, x1] = box;
  if (y0 < 0 || x0 < 0 || y1 > 1000 || x1 > 1000) return null;
  const h = y1 - y0, w = x1 - x0;
  if (h < 6 || h > 250 || w < 30) return null;
  const r = (v) => Math.round(v * 10) / 10000;     // millièmes → fraction, 4 décimales
  return { x: r(x0), y: r(y0), w: r(w), h: r(h) };
}

/** Recouvrement de deux zones (intersection sur union). */
function recouvrement(a, b) {
  const ix = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const iy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  const inter = ix * iy;
  const union = a.w * a.h + b.w * b.h - inter;
  return union > 0 ? inter / union : 0;
}

/**
 * ═══ LA PORTE DES POSITIONS — TOUT OU RIEN ═══════════════════════════════
 *
 * Une zone fausse est pire que pas de zone : un cercle posé sur « Tarte
 * Tatin » quand l'app recommande le saumon ferait commander le mauvais plat.
 * Les positions passent donc ENSEMBLE ou pas du tout :
 *   · au moins 60 % des plats ont une zone crédible seule (`zone`) ;
 *   · deux plats différents ne se recouvrent pas (au-delà de 0,5 d'IoU, ce
 *     sont deux noms posés au même endroit : le modèle a deviné) ;
 *   · les zones ne sont pas toutes la même (un modèle qui recopie une boîte).
 * Rendu : `true` si les positions sont gardées.
 */
function zonesFiables(plats) {
  if (!plats.length) return false;
  const avec = plats.filter((p) => p.box);
  if (avec.length / plats.length < 0.6) return false;
  for (let i = 0; i < avec.length; i++) {
    for (let j = i + 1; j < avec.length; j++) {
      if (recouvrement(avec[i].box, avec[j].box) > 0.5) return false;
    }
  }
  return true;
}

/**
 * La fourchette d'un plat : toujours `kcalMin ≤ kcal ≤ kcalMax`, jamais plus
 * étroite que ±10 % (une carte ne permet pas mieux, et l'app arrondit de toute
 * façon), jamais plus large que ×0,4 → ×2 (au-delà, ce n'est plus une
 * estimation). Une borne absente ou absurde se refait à ±25 %.
 */
function fourchette(kcal, min, max) {
  let a = fini(min) && min > 0 ? min : kcal * 0.75;
  let b = fini(max) && max > 0 ? max : kcal * 1.25;
  if (a > b) { const t = a; a = b; b = t; }
  a = Math.min(a, kcal * 0.9); b = Math.max(b, kcal * 1.1);
  a = Math.max(a, kcal * 0.4); b = Math.min(b, kcal * 2);
  return [Math.round(a), Math.round(b)];
}

/**
 * La carte telle que l'app la reçoit. Ne lève jamais : un objet de travers
 * donne une carte vide, que l'app sait dire (« rien de lisible »).
 */
function normaliserCarte(menu) {
  const m = menu && typeof menu === 'object' ? menu : {};
  const brut = Array.isArray(m.dishes) ? m.dishes.slice(0, PLATS_MAX * 2) : [];
  const vus = new Set();
  const plats = [];
  for (const d of brut) {
    if (!d || typeof d !== 'object') continue;
    const name = texte(d.name, 90);
    if (!name) continue;
    const cle = name.toLowerCase();
    if (vus.has(cle)) continue;                    // le même plat lu deux fois
    vus.add(cle);
    const prot = entier(d.prot), carb = entier(d.carb), fat = entier(d.fat);
    let kcal = entier(d.kcal);
    // Le garde-fou du repas (scan-meal.js) : les calories collent aux macros.
    const kcalM = 4 * prot + 4 * carb + 9 * fat;
    if (kcalM > 0 && (kcal > kcalM * 1.3 || kcal < kcalM * 0.7)) kcal = Math.round(kcalM);
    if (kcal <= 0) continue;                       // un plat sans chiffre ne se classe pas
    const [kcalMin, kcalMax] = fourchette(kcal, nb(d.kcalMin), nb(d.kcalMax));
    const p = {
      id: plats.length + 1,
      name,
      section: SECTIONS.includes(d.section) ? d.section : 'autre',
      kcal, kcalMin, kcalMax, prot, carb, fat,
      confidence: Math.max(0, Math.min(1, fini(nb(d.confidence)) ? nb(d.confidence) : 0.5))
    };
    const desc = texte(d.description, 160);
    if (desc) p.description = desc;
    const prix = nb(d.price);
    if (prix > 0 && prix < 1000) p.price = Math.round(prix * 100) / 100;
    const z = zone(d.box);
    if (z) p.box = z;
    plats.push(p);
    if (plats.length >= PLATS_MAX) break;
  }
  const positions = zonesFiables(plats);
  if (!positions) for (const p of plats) delete p.box;
  const out = { dishes: plats, positions };
  const nom = texte(m.name, 60);
  if (nom) out.name = nom;
  const devise = texte(m.currency, 3).toUpperCase();
  if (/^[A-Z]{3}$/.test(devise)) out.currency = devise;
  return out;
}

/** Les mots-clés du sous-ensemble neutre — ce que le banc autorise. */
const MOTS_NEUTRES = new Set(['type', 'properties', 'items', 'required', 'enum', 'description']);

module.exports = {
  SECTIONS, PLATS_MAX, SCHEMA_PLAT, SCHEMA_MENU, SCHEMA_CARTE, PROMPT_CARTE, CONSIGNES_CARTE,
  promptAuto, schemaAuto, pourGemini, corpsGemini, texteGemini,
  normaliserCarte, zone, zonesFiables, recouvrement, fourchette, MOTS_NEUTRES
};
