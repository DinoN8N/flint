// FLINT — l'analyse de repas sur Claude (API Messages d'Anthropic).
//
// ═══ 16 NOV. 2026 — « POURQUOI PASSER GEMINI EN PAYANT SI ON UTILISE CLAUDE ? »
//
// Dino. Le Coach sait déjà parler à Claude (`_coach-claude.js`, deux clés en
// relais : ANTHROPIC_API_KEY de Dino, ANTHROPIC_API_KEY_2 de Félix, payées par
// les crédits API de leurs abonnements). L'analyse de repas suit, derrière SA
// variable : `SCAN_FOURNISSEUR=anthropic`. Sans elle, ce fichier n'est jamais
// appelé et Gemini sert exactement comme avant (tests/test-scan-or-gemini.js
// épingle l'octet).
//
// CE QUI NE BOUGE PAS : la porte (scan-meal.js, avant tout fournisseur), les
// prompts (repris MOT POUR MOT de scan-meal.js et `_scan-carte.js`), les
// normalisations (4P+4G+9L, bornes de l'étiquette, `normaliserCarte`), et le
// contrat vers l'app : scan-meal.js passe l'objet lu ici dans LA MÊME fonction
// que celui de Gemini.
//
// CE QUI EST PROPRE À CLAUDE, et pourquoi (documentation du 16 nov.) :
//   · LE JSON EST CONTRAINT par les sorties structurées :
//     `output_config.format = { type: 'json_schema', schema }`. Pas d'outil
//     imposé (`tool_choice` « tool » est refusé par Sonnet 5.5), pas de
//     pré-remplissage (refusé). Le schéma doit porter
//     `additionalProperties: false` sur CHAQUE objet, pas de `nullable` (on
//     écrit `["string", "null"]`), et tenir les limites : 24 champs facultatifs
//     et 16 champs à unions au plus par requête (`pourClaude`, le banc compte) ;
//   · LE PROMPT VA DANS `system`, LA PHOTO DANS LE MESSAGE, AVANT un mot de
//     texte : la documentation conseille l'image d'abord, et un prompt fixe en
//     tête peut se mettre en cache (`cache_control`) — la photo, qui change à
//     chaque fois, vient après ;
//   · PAS DE TEMPÉRATURE : Sonnet 5.5 et Haiku 5.5 refusent toute valeur autre
//     que celle par défaut (400). La température 0 de l'étiquette n'a pas
//     d'équivalent : « ne devine rien » reste dans le prompt, et les bornes
//     physiques restent dans `normaliserEtiquette` ;
//   · LA RÉFLEXION est adaptative (le défaut des deux modèles, on n'envoie pas
//     `thinking`), réglée par `output_config.effort` : `medium` par défaut,
//     `SCAN_EFFORT` pour changer ;
//   · LA PLACE D'UN PLAT SUR LA CARTE : Gemini la rend en millièmes
//     `[ymin, xmin, ymax, xmax]` ; Claude « ne marche pas bien » avec des
//     coordonnées normalisées (sa documentation) et veut des PIXELS
//     `[x1, y1, x2, y2]` de l'image qu'il voit. On lui donne la taille de
//     cette image (lue dans l'en-tête du fichier, recalculée comme l'API la
//     réduit), et on reconvertit ses pixels en millièmes AVANT
//     `normaliserCarte`, qui ne change pas. Taille inconnue : aucune position ;
//   · UN REFUS (`stop_reason: refusal`, HTTP 200) ou une réponse coupée
//     (`max_tokens`) ne se lisent pas comme un JSON : ce sont des pannes ;
//   · LE SECOURS côté serveur (`fallbacks: "default"`) pour les modèles qui le
//     connaissent (Sonnet 5.5 oui, Haiku 5.5 non), comme le Coach.

const CL = require('./_coach-claude');
const carte = require('./_scan-carte');

const MODELE_DEFAUT = 'claude-sonnet-5-5';
// La réflexion compte dans `max_tokens`. Un repas tient en quelques centaines
// de jetons, une carte de 40 plats en 4 000 à 6 000 : 16 000 laisse la place
// sans flux (la limite conseillée pour une requête non diffusée).
const MAX_TOKENS = 16000;

// ═══ LES DÉLAIS : SOUS LA PATIENCE DE L'APP ET SOUS LES 160 S DE LA FONCTION
// Un délai dépassé ne se réessaie pas (`appelerUneCle`) ; un 429/5xx/529 se
// réessaie UNE fois. Le pire cas est donc « presque tout le délai, puis un
// second essai entier » :
//   étiquette   40 s × 2 =  80 s   (LectureEtiquette.swift attend 90 s)
//   repas       55 s × 2 = 110 s   (AnalyseRepasNatif.swift attend 180 s)
//   carte/auto  75 s × 2 = 150 s   (une carte s'écrit longtemps ; < 160 s)
// NON MESURÉ contre le vrai Claude : à relire au premier vrai essai.
const DELAIS = { etiquette: 40000, repas: 55000, texte: 55000, carte: 75000, auto: 75000 };

/** Les quatre formats d'image que l'API accepte (documentation Vision). */
const MEDIAS = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);

/**
 * La configuration, lue une fois par requête. `null` = Gemini (la production).
 * Mêmes clés que le Coach : un crédit épuisé sur la première passe à la
 * seconde (`appelerClaude`, « DEUX CLÉS, UN RELAIS » dans _coach-claude.js).
 *   SCAN_MODELE          claude-sonnet-5-5 par défaut (claude-haiku-5-5 : moins cher)
 *   SCAN_EFFORT          low | medium (défaut) | high | xhigh | max | aucun (non envoyé)
 *   SCAN_CLAUDE_SECOURS  0 coupe le secours côté serveur
 */
function configScan(env) {
  const e = env || process.env;
  if (e.SCAN_FOURNISSEUR !== 'anthropic') return null;
  const modele = /^[a-z0-9][a-z0-9.-]{2,63}$/.test(e.SCAN_MODELE || '') ? e.SCAN_MODELE : MODELE_DEFAUT;
  const cles = [e.ANTHROPIC_API_KEY, e.ANTHROPIC_API_KEY_2].filter((c) => typeof c === 'string' && c.length > 0);
  const effort = e.SCAN_EFFORT === 'aucun' ? null : (CL.EFFORTS.has(e.SCAN_EFFORT) ? e.SCAN_EFFORT : 'medium');
  return {
    cle: e.ANTHROPIC_API_KEY || '',
    cles,
    modele,
    effort,
    secours: e.SCAN_CLAUDE_SECOURS !== '0' && CL.MODELES_AVEC_SECOURS.has(modele),
    // Pas de `thinking.block_binding` ici (une seule question, aucun
    // historique) : l'en-tête bêta du Coach n'a rien à faire dans la requête.
    liaison: false
  };
}

// ─── LA PHOTO : SON FORMAT ET SA TAILLE, LUS DANS SES PREMIERS OCTETS ───────
//
// `mime` est choisi par l'appelant ; l'API, elle, lit le fichier. Un JPEG
// annoncé « image/png » serait refusé (400) — et l'analyse « en panne » pour
// une étiquette. On lit donc la signature, et la taille au passage (pour la
// place des plats d'une carte). Aucun décodage d'image : des en-têtes.

function dimsJpeg(b) {
  let i = 2, orientation = 1;
  while (i + 4 <= b.length) {
    if (b[i] !== 0xFF) return null;
    let m = b[i + 1];
    if (m === 0xFF) { i++; continue; }                       // octet de remplissage
    if (m === 0xD8 || m === 0x01 || (m >= 0xD0 && m <= 0xD7)) { i += 2; continue; }
    if (m === 0xD9 || m === 0xDA) return null;               // fin, ou les données avant la taille
    const long = b.readUInt16BE(i + 2);
    if (long < 2) return null;
    if (m === 0xE1 && i + 4 + 6 <= b.length && b.toString('latin1', i + 4, i + 10) === 'Exif\0\0') {
      orientation = orientationExif(b, i + 10, Math.min(b.length, i + 2 + long)) || orientation;
    }
    // SOF0…SOF15, sauf DHT (C4), JPG (C8), DAC (CC).
    if (m >= 0xC0 && m <= 0xCF && m !== 0xC4 && m !== 0xC8 && m !== 0xCC) {
      if (i + 9 > b.length) return null;
      const h = b.readUInt16BE(i + 5), w = b.readUInt16BE(i + 7);
      // Orientation EXIF 5 à 8 : l'API redresse la photo (« orientation
      // correction »), le modèle la voit donc tournée d'un quart de tour.
      return orientation >= 5 && orientation <= 8 ? { largeur: h, hauteur: w } : { largeur: w, hauteur: h };
    }
    i += 2 + long;
  }
  return null;
}

/** L'étiquette 0x0112 de l'IFD0 d'un bloc EXIF (TIFF), ou 0. */
function orientationExif(b, debut, fin) {
  try {
    const ordre = b.toString('latin1', debut, debut + 2);
    const le = ordre === 'II';
    if (!le && ordre !== 'MM') return 0;
    const u16 = (o) => (le ? b.readUInt16LE(o) : b.readUInt16BE(o));
    const u32 = (o) => (le ? b.readUInt32LE(o) : b.readUInt32BE(o));
    const ifd = debut + u32(debut + 4);
    if (ifd + 2 > fin) return 0;
    const n = u16(ifd);
    for (let k = 0; k < n; k++) {
      const e = ifd + 2 + k * 12;
      if (e + 12 > fin) return 0;
      if (u16(e) === 0x0112) return u16(e + 8);
    }
  } catch (e) { /* en-tête tronqué */ }
  return 0;
}

function dimsWebp(b) {
  const bloc = b.toString('latin1', 12, 16);
  if (bloc === 'VP8X' && b.length >= 30) return { largeur: 1 + b.readUIntLE(24, 3), hauteur: 1 + b.readUIntLE(27, 3) };
  if (bloc === 'VP8 ' && b.length >= 30) return { largeur: b.readUInt16LE(26) & 0x3FFF, hauteur: b.readUInt16LE(28) & 0x3FFF };
  if (bloc === 'VP8L' && b.length >= 25) {
    const v = b.readUInt32LE(21);
    return { largeur: (v & 0x3FFF) + 1, hauteur: ((v >> 14) & 0x3FFF) + 1 };
  }
  return null;
}

/**
 * `{ media, largeur, hauteur }` (taille `null` si illisible), ou `null` quand
 * ce n'est ni un JPEG, ni un PNG, ni un GIF, ni un WebP.
 */
function lireImage(base64) {
  if (typeof base64 !== 'string' || !base64) return null;
  let b;
  try { b = Buffer.from(base64, 'base64'); } catch (e) { return null; }
  if (b.length < 12) return null;
  let media = null, dims = null;
  if (b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF) { media = 'image/jpeg'; dims = dimsJpeg(b); }
  else if (b.toString('latin1', 0, 8) === '\x89PNG\r\n\x1a\n') {
    media = 'image/png';
    if (b.length >= 24 && b.toString('latin1', 12, 16) === 'IHDR') dims = { largeur: b.readUInt32BE(16), hauteur: b.readUInt32BE(20) };
  } else if (/^GIF8[79]a$/.test(b.toString('latin1', 0, 6))) {
    media = 'image/gif';
    dims = { largeur: b.readUInt16LE(6), hauteur: b.readUInt16LE(8) };
  } else if (b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP') {
    media = 'image/webp'; dims = dimsWebp(b);
  }
  if (!media) return null;
  const ok = dims && dims.largeur > 0 && dims.hauteur > 0 && dims.largeur <= 20000 && dims.hauteur <= 20000;
  return { media, largeur: ok ? dims.largeur : null, hauteur: ok ? dims.hauteur : null };
}

// ─── LA TAILLE QUE LE MODÈLE VOIT ───────────────────────────────────────────
// Recopié de l'implémentation de référence de la documentation (« How Claude
// resizes and pads images ») : la plus grande taille, aux mêmes proportions,
// qui tient dans le bord maximal ET dans le budget de jetons visuels (une
// tuile de 28 × 28 px = un jeton). Claude 4.7 et suivants : 2 576 px et
// 4 784 jetons ; les autres : 1 568 et 1 568. Le rembourrage (à droite et en
// bas, jusqu'au multiple de 28) ne déplace pas l'origine : on divise par la
// taille RÉDUITE, jamais par la taille rembourrée.

function hauteResolution(modele) {
  const m = String(modele || '');
  if (/^claude-(fable|mythos)/.test(m)) return true;
  const r = /^claude-(?:opus|sonnet|haiku)-(\d+)(?:-(\d{1,2})(?!\d))?/.exec(m);
  if (!r) return true;
  const majeur = Number(r[1]), mineur = Number(r[2] || 0);
  return majeur > 4 || (majeur === 4 && mineur >= 7);
}

function arrondiPair(x) {
  const f = Math.floor(x);
  if (x - f !== 0.5) return Math.round(x);
  return f % 2 === 0 ? f : f + 1;
}

function tailleVue(largeur, hauteur, modele) {
  const haute = hauteResolution(modele);
  const bord = haute ? 2576 : 1568, budget = haute ? 4784 : 1568;
  const tient = (w, h) => Math.ceil(w / 28) * 28 <= bord && Math.ceil(h / 28) * 28 <= bord
    && Math.ceil(w / 28) * Math.ceil(h / 28) <= budget;
  const calcul = (w, h) => {
    if (tient(w, h)) return [w, h];
    if (h > w) { const [rh, rw] = calcul(h, w); return [rw, rh]; }
    const ratio = w / h;
    let lo = 1, hi = w;
    while (lo + 1 < hi) {
      const mid = Math.floor((lo + hi) / 2);
      if (tient(mid, Math.max(arrondiPair(mid / ratio), 1))) lo = mid; else hi = mid;
    }
    return [lo, Math.max(arrondiPair(lo / ratio), 1)];
  };
  const [w, h] = calcul(largeur, hauteur);
  return { largeur: w, hauteur: h };
}

// ─── LES PROMPTS : CEUX DE GEMINI, ADAPTÉS EN UN SEUL ENDROIT ───────────────

const LIGNE_BOX_GEMINI = '- box : la place du NOM du plat sur la photo, [ymin, xmin, ymax, xmax] en millièmes de l\'image (0 à 1000), le rectangle serré autour du nom (et de sa description si elle est juste dessous). Si tu n\'es pas sûr de l\'endroit, omets le champ.';
const LIGNE_BOX_CLAUDE = '- box : la place du NOM du plat sur la photo, [x1, y1, x2, y2] en PIXELS de l\'image (x1, y1 = coin haut gauche ; x2, y2 = coin bas droit ; l\'origine est le coin haut gauche de l\'image ; sa taille en pixels est donnée avec la photo), le rectangle serré autour du nom (et de sa description si elle est juste dessous). Si tu n\'es pas sûr de l\'endroit, omets le champ.';
const DESCRIPTION_BOX_CLAUDE = '[x1, y1, x2, y2] en pixels de l\'image, origine en haut à gauche.';

/** Le prompt d'une carte pour Claude : la ligne `box` en pixels, rien d'autre. */
function pourClaudeConsignes(texte) {
  const t = String(texte);
  if (!t.includes(LIGNE_BOX_GEMINI)) throw new Error('ligne box introuvable dans les consignes de la carte');
  return t.split(LIGNE_BOX_GEMINI).join(LIGNE_BOX_CLAUDE);
}

/** Le prompt texte se termine par « Description du repas : » : cette amorce
 *  passe dans le message, avec la description — le système reste fixe. */
const AMORCE_TEXTE = 'Description du repas : ';
function systemeTexte(promptTexte) {
  const t = String(promptTexte);
  const k = t.lastIndexOf(AMORCE_TEXTE);
  return (k >= 0 ? t.slice(0, k) : t).trimEnd();
}

// ─── LES SCHÉMAS : LE SOUS-ENSEMBLE NEUTRE → LES SORTIES STRUCTURÉES ────────

/**
 * Copie d'un schéma (le sous-ensemble neutre de `_scan-carte.js`, plus le
 * `nullable` de l'étiquette) en schéma de sortie structurée :
 *   · chaque objet : `additionalProperties: false`, `required` réduit aux
 *     champs qui existent (ou TOUS les champs si `toutRequis`) ;
 *   · `nullable: true` → `type: [t, 'null']` pour un scalaire, `anyOf` pour
 *     un objet ;
 *   · la description de `box` dit des pixels (voir plus haut).
 * Le schéma d'origine n'est pas touché.
 */
function pourClaude(schema, options) {
  const toutRequis = !!(options && options.toutRequis);
  const conv = (s, nom) => {
    if (!s || typeof s !== 'object' || Array.isArray(s)) return s;
    const o = {};
    for (const k of Object.keys(s)) {
      if (k === 'nullable' || k === 'properties' || k === 'items' || k === 'required') continue;
      o[k] = Array.isArray(s[k]) ? s[k].slice() : s[k];
    }
    if (s.items) o.items = conv(s.items);
    if (s.type === 'object') {
      const props = (s.properties && typeof s.properties === 'object') ? s.properties : {};
      o.properties = {};
      for (const p of Object.keys(props)) o.properties[p] = conv(props[p], p);
      const noms = Object.keys(o.properties);
      o.required = toutRequis ? noms : (Array.isArray(s.required) ? s.required.filter((r) => noms.includes(r)) : []);
      o.additionalProperties = false;
    }
    if (nom === 'box' && o.type === 'array') o.description = DESCRIPTION_BOX_CLAUDE;
    if (s.nullable === true) {
      if (o.type === 'object') return { anyOf: [o, { type: 'null' }] };
      return Object.assign({}, o, { type: [o.type, 'null'] });
    }
    return o;
  };
  return conv(schema);
}

/**
 * Ce que compte l'API par requête (documentation, « Schema complexity
 * limits ») : champs facultatifs (≤ 24), champs à unions (≤ 16), et les mots
 * employés (le banc refuse tout mot que la documentation ne liste pas).
 */
function complexite(schema) {
  const r = { facultatifs: 0, unions: 0, mots: new Set(), objetsOuverts: 0 };
  const voir = (s) => {
    if (!s || typeof s !== 'object') return;
    for (const k of Object.keys(s)) r.mots.add(k);
    if (Array.isArray(s.anyOf)) { r.unions++; s.anyOf.forEach(voir); }
    if (Array.isArray(s.type)) r.unions++;
    const t = Array.isArray(s.type) ? s.type : [s.type];
    if (t.includes('object')) {
      if (s.additionalProperties !== false) r.objetsOuverts++;
      const props = s.properties || {};
      for (const p of Object.keys(props)) {
        if (!(s.required || []).includes(p)) r.facultatifs++;
        voir(props[p]);
      }
    }
    if (s.items) voir(s.items);
  };
  voir(schema);
  return r;
}

// ─── LA REQUÊTE ─────────────────────────────────────────────────────────────

/**
 * Le corps d'une analyse. `quoi` : repas | auto | carte | etiquette | texte.
 * `prompts` vient de scan-meal.js (les mêmes textes que pour Gemini).
 */
function corpsScan({ config, quoi, prompts, schemas, image, texte }) {
  let systeme, schema, toutRequis = false;
  if (quoi === 'etiquette') { systeme = prompts.label; schema = schemas.label; toutRequis = true; }
  else if (quoi === 'carte') { systeme = pourClaudeConsignes(carte.PROMPT_CARTE); schema = carte.SCHEMA_CARTE; }
  else if (quoi === 'auto') { systeme = pourClaudeConsignes(carte.promptAuto(prompts.repas)); schema = carte.schemaAuto(schemas.repas); }
  else if (quoi === 'texte') { systeme = systemeTexte(prompts.texte); schema = schemas.repas; toutRequis = true; }
  else { systeme = prompts.repas; schema = schemas.repas; toutRequis = true; }

  let contenu;
  if (quoi === 'texte') {
    contenu = [{ type: 'text', text: AMORCE_TEXTE + texte }];
  } else {
    const consigne = quoi === 'etiquette' ? 'Lis cet emballage selon les consignes.'
      : 'Analyse cette photo selon les consignes.';
    let taille = '';
    if (quoi === 'carte' || quoi === 'auto') {
      taille = image.vue
        ? ` L'image fait ${image.vue.largeur} × ${image.vue.hauteur} pixels : c'est le repère de box.`
        : ' La taille de l\'image est inconnue : omets box.';
    }
    contenu = [{ type: 'image', source: { type: 'base64', media_type: image.media, data: image.data } },
               { type: 'text', text: consigne + taille }];
  }

  const output = {};
  if (config.effort) output.effort = config.effort;
  output.format = { type: 'json_schema', schema: pourClaude(schema, { toutRequis }) };
  const corps = {
    model: config.modele,
    max_tokens: MAX_TOKENS,
    system: [{ type: 'text', text: systeme, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: contenu }],
    output_config: output
  };
  if (config.secours) corps.fallbacks = 'default';
  return corps;
}

// ─── LA RÉPONSE ─────────────────────────────────────────────────────────────

/**
 * `{ data }` (l'objet JSON rendu), ou `{ panne }` (une raison courte, pour le
 * journal et `detail`). Le refus et la coupure d'abord : jamais `content`
 * sans avoir lu `stop_reason`. Après un secours, seul ce qui suit le dernier
 * bloc `fallback` est la réponse du modèle qui a servi.
 */
function lireReponse(msg) {
  const m = msg && typeof msg === 'object' ? msg : {};
  if (m.stop_reason === 'refusal') return { panne: 'refus' + (m.stop_details && m.stop_details.category ? ' (' + m.stop_details.category + ')' : '') };
  if (m.stop_reason === 'max_tokens') return { panne: 'réponse coupée (max_tokens)' };
  const content = Array.isArray(m.content) ? m.content : [];
  let debut = 0;
  content.forEach((b, i) => { if (b && b.type === 'fallback') debut = i + 1; });
  const texte = content.slice(debut).filter((b) => b && b.type === 'text').map((b) => b.text || '').join('');
  if (!texte.trim()) return { panne: 'réponse vide (' + (m.stop_reason || '?') + ')' };
  let data;
  try { data = JSON.parse(texte); } catch (e) { return { panne: 'JSON illisible' }; }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return { panne: 'JSON qui n\'est pas un objet' };
  return { data };
}

/**
 * Ce qui est propre à Claude, ramené à ce que scan-meal.js lit déjà :
 *   · la casse des énumérations n'est pas garantie (documentation) :
 *     `kind` et `section` passent en minuscules ;
 *   · `box` : pixels de l'image vue → millièmes `[ymin, xmin, ymax, xmax]`,
 *     bornés à l'image ; sans taille connue, aucune position.
 * Rend un NOUVEL objet ; `normaliserCarte` fait le reste, comme pour Gemini.
 */
function versFormeCommune(data, vue) {
  const d = Object.assign({}, data);
  if (typeof d.kind === 'string') d.kind = d.kind.trim().toLowerCase();
  if (d.menu && typeof d.menu === 'object' && Array.isArray(d.menu.dishes)) {
    d.menu = Object.assign({}, d.menu);
    d.menu.dishes = d.menu.dishes.map((p) => {
      if (!p || typeof p !== 'object') return p;
      const q = Object.assign({}, p);
      if (typeof q.section === 'string') q.section = q.section.trim().toLowerCase();
      if ('box' in q) {
        const b = q.box;
        delete q.box;
        if (vue && Array.isArray(b) && b.length === 4 && b.every((x) => typeof x === 'number' && Number.isFinite(x))) {
          const bx = (x) => Math.max(0, Math.min(vue.largeur, x));
          const by = (y) => Math.max(0, Math.min(vue.hauteur, y));
          const [x1, y1, x2, y2] = b;
          q.box = [by(y1) / vue.hauteur * 1000, bx(x1) / vue.largeur * 1000, by(y2) / vue.hauteur * 1000, bx(x2) / vue.largeur * 1000];
        }
      }
      return q;
    });
  }
  return d;
}

/** Une ligne de journal : des comptes, jamais un contenu ni une clé. */
function ligneJournal(quoi, r) {
  const u = CL.usageJournal(r.json);
  const champs = [quoi, u.servi || '-',
    'entree=' + (u.jetonsEntree == null ? '-' : u.jetonsEntree),
    'cacheLu=' + (u.cacheLu == null ? '-' : u.cacheLu),
    'cacheEcrit=' + (u.cacheEcrit == null ? '-' : u.cacheEcrit),
    'sortie=' + (u.jetonsSortie == null ? '-' : u.jetonsSortie),
    'essais=' + (r.tentatives || 0)];
  const content = r.json && Array.isArray(r.json.content) ? r.json.content : [];
  if (content.some((b) => b && b.type === 'fallback')) champs.push('secours');
  if (r.cleN) champs.push('cle=' + r.cleN);
  return '[scan] claude · ' + champs.join(' · ');
}

/**
 * Une analyse complète. Rendu :
 *   { ok: true, data }                            l'objet, prêt pour scan-meal.js
 *   { ok: false, status, detail, parcours, ... }  l'API a échoué (après relais)
 *   { ok: false, illisible: true, detail }        réponse rendue mais pas lisible
 */
async function analyser({ config, quoi, prompts, schemas, image, texte }) {
  const corps = corpsScan({ config, quoi, prompts, schemas, image, texte });
  const r = await CL.appelerClaude({ config, corps, delaiMs: DELAIS[quoi] || DELAIS.repas, tentatives: 2 });
  // `creditEpuise` : vrai seulement quand TOUTES les clés ont dit « plus de
  // crédit » (le relais `parCle` ne s'arrête sur une clé épuisée que s'il n'en
  // reste aucune) ; scan-meal.js s'en sert pour le repli sur Gemini.
  if (!r.ok) return { ok: false, status: r.status, detail: r.detail, parcours: r.parcours || [], tentatives: r.tentatives, cleN: r.cleN,
                      creditEpuise: r.creditEpuise === true };
  console.log(ligneJournal(quoi, r));
  const lu = lireReponse(r.json);
  if (lu.panne) return { ok: false, illisible: true, status: 200, detail: lu.panne, tentatives: r.tentatives, cleN: r.cleN };
  return { ok: true, data: versFormeCommune(lu.data, image && image.vue) };
}

module.exports = {
  configScan, lireImage, tailleVue, hauteResolution, pourClaude, pourClaudeConsignes, systemeTexte,
  complexite, corpsScan, lireReponse, versFormeCommune, analyser,
  MODELE_DEFAUT, MEDIAS, DELAIS, MAX_TOKENS, LIGNE_BOX_GEMINI, LIGNE_BOX_CLAUDE, AMORCE_TEXTE
};
