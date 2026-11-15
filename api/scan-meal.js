// FLINT — proxy d'analyse de repas (Gemini Flash) : photo OU description texte.
// Déployé sur Vercel. La clé API vit UNIQUEMENT ici (variable d'env GEMINI_API_KEY),
// jamais dans le front public.
//
// Front : POST { image: "<dataURL ou base64>", mime?: "image/jpeg" }
//      ou POST { text: "2 œufs au plat, une tranche de pain complet, un café au lait" }
// Retour: { mealName, items:[{name,grams,kcal,prot,carb,fat,confidence}], total:{kcal,prot,carb,fat} }
//         (+ `kind: "repas"` quand l'app a posé la question de la carte)
//
// 16 nov. 2026 — LA CARTE DU RESTAURANT (voir `_scan-carte.js`) :
//      POST { image, carte: "auto" }   l'app sait montrer une carte : le modèle décide
//      POST { image, mode: "carte" }   l'app dit que c'est une carte
// Retour d'une carte : { kind:"carte", menu:{ name?, currency?, positions,
//      dishes:[{ id, name, description?, section, price?, kcal, kcalMin, kcalMax,
//                prot, carb, fat, confidence, box?:{x,y,w,h} }] }, mealName, items:[] }
// Sans `carte` ni `mode`, RIEN ne change : une app déjà posée reçoit le repas
// d'avant, au mot près (le banc le vérifie).

// 23 sept. 2026 — le premier est celui qu'on veut ; les suivants sont ceux
// qu'on accepte quand Google le déclare saturé (503 « high demand », mesuré
// pendant plus d'une demi-heure ce jour-là). Les trois savent rendre du JSON
// contraint par `responseSchema`, donc le reste de ce fichier ne change pas.
// Ce fichier n'importait rien de `_lib.js` (il a son propre rate-limit, plus
// ancien) : l'aide de réessai est la première chose qu'il partage avec le Coach.
const { appelerGemini, plafondJournalier, identiteRequete, ipRequete, deviceIllisible, cors: corsLib,
        egalConstant, sansCle } = require('./_lib');
const carte = require('./_scan-carte');

// 24 sept. 2026 — LES BORNES DU SCAN. La photo l'était (3 Mo, ci-dessous),
// le texte l'était (800 caractères) ; le CORPS, lui, ne l'était pas : un
// JSON de 4 Mo avec une photo de 100 Ko passait le parse avant qu'on regarde
// la photo. 3,5 Mo pour le tout = la photo maximale plus une marge pour le
// reste du JSON ; au-delà, 413 avant tout parse. Et `mime`, choisi par
// l'appelant et renvoyé tel quel à Gemini, prend une forme fermée.
const CORPS_MAX_OCTETS = 3.5 * 1024 * 1024;
const MIME_FORME = /^image\/[a-z0-9.+-]{1,20}$/;

function tailleCorps(req) {
  const b = req.body;
  if (Buffer.isBuffer(b)) return b.length;
  if (typeof b === 'string') return Buffer.byteLength(b, 'utf8');
  try { return Buffer.byteLength(JSON.stringify(b == null ? '' : b), 'utf8'); } catch (e) { return 0; }
}
// 23 sept. 2026, 19 h 20 — les trois maillons d'avant étaient périmés côté
// Google (2.5 « accès limité » → 429, 2.5-lite → 404, 2.0-flash éteint depuis
// le 1er juin) ; voir la note dans coach.js. Même chaîne que le Coach, tous
// « stable », remplaçants officiels des 2.x.
const MODELES = ['gemini-3.6-flash', 'gemini-3.5-flash-lite', 'gemini-3.1-flash-lite'];

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

// ═══ 16 NOV. 2026 — LA PORTE DU SCAN SE FERME COMME CELLE DU COACH ═════════
//
// Audit du back-end du 15 nov. (G2 c) : la clé d'app du scan est publique (elle
// est dans `index.html`, servi à tous), et le scan répondait
// `Access-Control-Allow-Origin: *`. N'importe quelle page web du monde pouvait
// donc appeler notre analyse depuis le navigateur de ses visiteurs, au frais du
// budget Gemini — et la limite par minute ne comptait que l'IP.
//
// · PLUS DE `*`. L'app n'en a pas besoin, vérifié dans son code le 16 nov. :
//   la photo part d'`AnalyseRepasNatif` (URLSession), l'étiquette de
//   `LectureEtiquette` (URLSession), le texte et la photo du moteur web passent
//   par le pont natif `flreseau` (`flFetch`, URLSession lui aussi) — aucune de
//   ces requêtes n'est soumise au CORS. Le moteur servi sur le web appelle
//   `/api/scan-meal` en chemin RELATIF : même origine, pas de CORS non plus.
//   Ce que le `*` ouvrait, c'était les navigateurs des autres.
// · `cors` de `_lib.js` sans origine : no-store, nosniff, et les méthodes.
const cors = (res) => corsLib(res);

// Rate-limit best-effort en mémoire (fenêtre glissante de 60 s, `_lib.js`).
// Se réinitialise au démarrage à froid : un garde-fou de rafale, pas de facture.
// 16 nov. 2026 — COMPTÉ PAR APPAREIL ET PAR IP, COMME LE COACH. L'appareil
// (`x-flint-device`, que l'app envoie depuis le 24 sept.) garde la limite fine :
// vingt photos par minute, et un voisin derrière la même box ne gêne plus
// personne. L'IP pose le plafond qu'aucun en-tête ne contourne : soixante par
// minute, quel que soit le device inventé à chaque requête. Sans en-tête,
// l'identité EST l'IP : vingt par minute, comme avant.
// Les deux clés sont préfixées `scan` : le Coach a ses propres compteurs (il
// compte aussi `ip!<adresse>`, à 120), et un scan ne doit pas manger le sien.
const RL_MAX = 20;
const RL_MAX_IP = 60;
const { rateLimited: rateLimitedLib } = require('./_lib');
function rateLimited(id, ip) {
  return rateLimitedLib('scan!' + id, RL_MAX, { ip: 'scan:' + ip, maxIP: RL_MAX_IP });
}

function round(n) { return Math.max(0, Math.round(Number(n) || 0)); }

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  // 16 nov. 2026 — un `x-flint-device` PRÉSENT mais hors forme (espace, saut
  // de ligne, 129 caractères…) est refusé avant tout, comme au Coach : il sert
  // de clé de compteur, de plafond et de journal. Absent, on continue (l'IP
  // fait l'identité). L'app envoie un UUID (DeviceIdentite.swift).
  if (deviceIllisible(req)) return res.status(400).json({ error: 'en-tête x-flint-device illisible' });

  // 1) Rate-limit par appareil ET par IP (voir `rateLimited` plus haut).
  const ip = ipRequete(req);
  const id = identiteRequete(req);
  if (rateLimited(id, ip)) return res.status(429).json({ error: 'Trop de requêtes, réessaie dans une minute.' });

  // 2) Secret d'app (si FLINT_APP_SECRET est défini en env, on l'exige). Soft-secret : dissuade l'abus passant.
  // 24 sept. — comparaison à temps constant, comme le Coach (`egalConstant`) ;
  // le comportement « soft-secret » (rien exigé sans variable) ne change pas.
  // 16 nov. — AVANT le plafond du jour, comme au Coach : une requête sans la clé
  // ne consomme ni le compteur de quelqu'un ni un aller-retour au magasin.
  const secret = process.env.FLINT_APP_SECRET;
  if (secret && !egalConstant((req.headers['x-flint-key'] || '').toString(), secret)) return res.status(401).json({ error: 'unauthorized' });

  // 3) Le plafond par jour (voir `_lib.js`) — DORMANT sans magasin partagé
  // (Upstash, deux variables d'env : audit du 15 nov., G2 a).
  // 16 nov. 2026 — PAR APPAREIL ET PAR IP. Par appareil : 60 analyses par jour,
  // l'usage d'une personne (le natif se nomme depuis le 24 sept.). Mais
  // l'appareil est un en-tête que le client choisit : en inventer un par
  // requête remettait le compteur à zéro. L'IP tient donc un second plafond,
  // large — 600 par jour, de quoi servir une salle de sport ou une soirée
  // d'accueil derrière une seule box (G3), pas un script. `SCAN_PLAFOND_JOUR_IP`
  // le règle ; 0 l'éteint (un opérateur mobile qui partagerait trop ses IP).
  const plafond = await plafondJournalier({ id, portee: 'scan', max: process.env.SCAN_PLAFOND_JOUR || 60 });
  const maxIP = process.env.SCAN_PLAFOND_JOUR_IP === undefined ? 600 : Number(process.env.SCAN_PLAFOND_JOUR_IP);
  // Sans appareil, l'identité EST l'IP : un seul compteur suffit.
  const plafondIP = id === 'ip:' + ip ? { atteint: false }
    : await plafondJournalier({ id: 'ip:' + ip, portee: 'scan-ip', max: maxIP });
  if (plafond.atteint || plafondIP.atteint) {
    return res.status(429).json({ error: 'Beaucoup d\'analyses aujourd\'hui — on reprend demain.' });
  }

  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    // Le NOM de la variable reste au journal ; la réponse ne dit plus quelle
    // pièce manque (24 sept.). Même statut qu'avant.
    console.log('[scan] GEMINI_API_KEY absente — configuration serveur incomplète');
    return res.status(500).json({ error: 'configuration serveur incomplète' });
  }

  // Le corps entier, AVANT le parse (voir CORPS_MAX_OCTETS en tête).
  if (tailleCorps(req) > CORPS_MAX_OCTETS) {
    return res.status(413).json({ error: 'Photo trop lourde pour être analysée. Réessaie avec une photo plus petite.' });
  }

  try {
    let body = req.body;
    if (Buffer.isBuffer(body)) body = body.toString('utf8');
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
    let image = body && body.image;
    // Le texte est borné ici depuis l'origine (800 caractères) : c'est la
    // ligne qui prouve que le scan borne AUSSI le texte, pas seulement la photo.
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

    // 16 nov. 2026 — QUELLE QUESTION ON POSE. Trois formes, et la première est
    // celle de toutes les apps déjà posées, qui ne change pas d'un caractère :
    //   repas  : le prompt et le schéma d'avant (rien de demandé) ;
    //   auto   : `carte: "auto"` (ou true) — l'app sait montrer une carte, le
    //            modèle décide dans le MÊME appel (`promptAuto`) ;
    //   carte  : `mode: "carte"` — l'app dit que c'est une carte.
    // Le texte ne connaît que le repas : une carte, ça se photographie.
    const question = !image ? 'repas'
      : (body && body.mode === 'carte') ? 'carte'
      : (body && (body.carte === 'auto' || body.carte === true)) ? 'auto'
      : 'repas';

    let gReq;
    if (image) {
      // accepte une data URL (data:image/jpeg;base64,xxxx) ou du base64 brut
      let mime = (body && body.mime) || 'image/jpeg';
      const m = /^data:([^;]+);base64,(.*)$/s.exec(image);
      if (m) { mime = m[1]; image = m[2]; }
      // Une forme fermée, sinon le défaut : `mime` part tel quel à Gemini.
      if (!MIME_FORME.test(String(mime))) mime = 'image/jpeg';
      const prompt = question === 'carte' ? carte.PROMPT_CARTE : question === 'auto' ? carte.promptAuto(PROMPT) : PROMPT;
      const schema = question === 'carte' ? carte.SCHEMA_CARTE : question === 'auto' ? carte.schemaAuto(SCHEMA) : SCHEMA;
      gReq = question === 'repas'
        ? { contents: [{ parts: [{ text: PROMPT }, { inline_data: { mime_type: mime, data: image } }] }],
            generationConfig: { responseMimeType: 'application/json', responseSchema: SCHEMA, temperature: 0.1 } }
        : carte.corpsGemini({ prompt, schema, image, mime });
    } else {
      gReq = {
        contents: [{ parts: [{ text: PROMPT_TEXT + text }] }],
        generationConfig: { responseMimeType: 'application/json', responseSchema: SCHEMA, temperature: 0.1 }
      };
    }

    // 23 sept. 2026 — réessai puis modèle de secours (voir `appelerGemini`
    // dans _lib.js). Trois modèles × deux tentatives × 25 s = 150 s, sous les
    // 160 s de la fonction (vercel.json, relevé le 23 sept. au soir : avec
    // trois maillons, 120 s ne couvraient plus le pire cas). Le message rendu à l'app reste le même qu'avant
    // quand TOUT a échoué : « L'analyse est en panne à l'instant », qu'elle
    // sait déjà afficher — plus le statut brut de Gemini, qui n'est pas une
    // phrase pour l'utilisateur.
    // 16 nov. 2026 — UNE CARTE S'ÉCRIT PLUS LONGTEMPS QU'UNE ASSIETTE. Quarante
    // plats, c'est dix fois le JSON d'un repas : 25 s par essai couperaient une
    // carte que le modèle était en train d'écrire. Quand la carte est possible
    // (auto, carte), chaque modèle a donc UN essai de 45 s : trois × 45 = 135 s,
    // toujours sous les 160 s de la fonction. Sans question de carte, rien ne
    // change. NON MESURÉ contre le vrai Gemini : à relire au premier vrai essai.
    const longue = question !== 'repas';
    const g = await appelerGemini({ key, modeles: MODELES, corps: gReq,
                                    delaiMs: longue ? 45000 : 25000, tentativesParModele: longue ? 1 : 2 });
    if (!g.ok) {
      console.log(`[scan] échec après ${g.tentatives} tentative(s), dernier statut ${g.status} (${g.modele || '-'})`);
      return res.status(502).json({ error: "L'analyse est en panne à l'instant. Réessaie dans un moment.",
                                    gemini: g.status, detail: g.detail });
    }
    if (g.modele !== MODELES[0]) console.log(`[scan] servi par le modèle de secours ${g.modele} (${g.tentatives} tentatives)`);
    const j = g.json;
    const txt = carte.texteGemini(j);
    if (!txt) return res.status(502).json({ error: 'réponse Gemini vide' });

    let data;
    try { data = JSON.parse(txt); } catch (e) { return res.status(502).json({ error: 'JSON Gemini invalide' }); }
    if (!data || typeof data !== 'object') data = {};

    // 16 nov. 2026 — UNE CARTE ? On croit le `kind` du modèle, sauf quand sa
    // réponse le contredit : une « carte » sans aucun plat mais avec des
    // aliments est un repas, un « repas » sans aliment mais avec des plats est
    // une carte. En mode `carte` (l'app l'a dit), c'est une carte, point.
    if (question !== 'repas') {
      const plats = data.menu && Array.isArray(data.menu.dishes) ? data.menu.dishes.length : 0;
      const aliments = Array.isArray(data.items) ? data.items.length : 0;
      const estCarte = question === 'carte'
        || (data.kind === 'carte' && (plats > 0 || aliments === 0))
        || (data.kind !== 'carte' && aliments === 0 && plats > 0);
      if (estCarte) {
        const menu = carte.normaliserCarte(data.menu);
        console.log(`[scan] carte · ${menu.dishes.length} plat(s) · positions ${menu.positions ? 'gardées' : 'non'}`);
        // `mealName` et `items: []` : une app qui ne connaîtrait pas `kind`
        // (aucune ne demande la carte sans le connaître, mais on ne parie pas)
        // lit « aucun aliment » — une réponse honnête, jamais un faux repas.
        return res.status(200).json({ kind: 'carte', menu, mealName: menu.name || 'Carte', items: [],
                                      total: { kcal: 0, prot: 0, carb: 0, fat: 0 }, healthScore: null, healthNote: '' });
      }
    }

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

    // `kind` n'est écrit que quand l'app a posé la question de la carte : une
    // app déjà posée reçoit l'objet d'avant, clé pour clé.
    const repas = { mealName: String(data.mealName || 'Mon repas'), items, total, healthScore, healthNote };
    return res.status(200).json(question === 'repas' ? repas : Object.assign({ kind: 'repas' }, repas));
  } catch (e) {
    // 24 sept. — une phrase pour l'écran, le message (tronqué, clé masquée)
    // en `detail` pour lire la panne, jamais la pile ni le message brut.
    const message = sansCle(String((e && e.message) || e).slice(0, 120), key);
    console.log('[scan] panne ' + message);
    return res.status(500).json({ error: "L'analyse a rencontré une erreur. Réessaie dans un moment.", detail: message });
  }
}
