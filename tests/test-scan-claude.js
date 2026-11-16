// ═══════════════════════════════════════════════════════════════════════════
//  LE BANC DU SCAN SUR CLAUDE — 16 NOV. 2026
//
//  `node tests/test-scan-claude.js`
//
//  Il joue le VRAI `api/scan-meal.js` avec `SCAN_FOURNISSEUR=anthropic` et un
//  faux Claude : un `fetch` remplacé qui RETIENT chaque requête (URL, en-têtes,
//  corps) et rend des réponses à la forme de l'API Messages. AUCUN appel
//  réseau, aucune vraie clé : rien ici n'a vu un vrai modèle. Ce que ce banc
//  prouve, c'est la FORME (requête, schémas, lecture, contrat vers l'app,
//  relais de clé, pannes) — pas la justesse des calories.
//
//   ① l'interrupteur : sans `SCAN_FOURNISSEUR=anthropic`, aucun appel à
//     Anthropic (l'octet est épinglé par test-scan-or-gemini.js) ;
//   ② la requête : modèle, en-têtes, photo AVANT le texte, prompts de Gemini
//     mot pour mot (une seule ligne adaptée : `box` en pixels), sorties
//     structurées, ni température, ni outil imposé, ni pré-remplissage ;
//   ③ les schémas tiennent les limites documentées ;
//   ④ les trois modes (repas photo/texte, étiquette, carte) rendent à l'app
//     EXACTEMENT ce que rend Gemini pour le même contenu ;
//   ⑤ la photo : format lu dans le fichier, taille vue par le modèle, `box`
//     en pixels reconverti ; hors format → 415 ;
//   ⑥ le relais : crédit épuisé sur la 1re clé → la 2de ; jamais une clé au
//     journal ni dans la réponse ;
//   ⑦ les pannes : 529, 400, délai, refus, coupure, vide, JSON illisible →
//     502 et la phrase d'avant ;
//   ⑧ la porte reste fermée quand Claude sert ; le Coach n'est pas touché.
// ═══════════════════════════════════════════════════════════════════════════

const path = require('path');
const fs = require('fs');
const vraiFetch = global.fetch;

let vert = 0, rouge = 0;
function v(titre, ok, detail) {
  if (ok) { vert++; console.log('  ✅ ' + titre); }
  else { rouge++; console.log('  ❌ ' + titre + (detail ? '   ' + detail : '')); }
}

// ── Le décor ───────────────────────────────────────────────────────────────
const CLE1 = 'sk-ant-banc-dino-1111', CLE2 = 'sk-ant-banc-felix-2222', CLE_G = 'cle-gemini-banc';
process.env.FLINT_APP_SECRET = 'secret-banc';
process.env.GEMINI_API_KEY = CLE_G;
for (const k of ['UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN', 'SCAN_PLAFOND_JOUR', 'SCAN_PLAFOND_JOUR_IP',
                 'SCAN_MODELE', 'SCAN_EFFORT', 'SCAN_CLAUDE_SECOURS', 'COACH_FOURNISSEUR', 'ANTHROPIC_API_KEY_2']) delete process.env[k];
function claudeAllume() {
  process.env.SCAN_FOURNISSEUR = 'anthropic';
  process.env.ANTHROPIC_API_KEY = CLE1;
  for (const k of ['SCAN_MODELE', 'SCAN_EFFORT', 'SCAN_CLAUDE_SECOURS', 'ANTHROPIC_API_KEY_2']) delete process.env[k];
}
function claudeEteint() { delete process.env.SCAN_FOURNISSEUR; }

const scan = require(path.join(__dirname, '..', 'api', 'scan-meal.js'));
const SC = require(path.join(__dirname, '..', 'api', '_scan-claude.js'));
const CL = require(path.join(__dirname, '..', 'api', '_coach-claude.js'));
const carte = require(path.join(__dirname, '..', 'api', '_scan-carte.js'));

// ── Des photos fabriquées : seuls les en-têtes comptent ────────────────────
function png(w, h) {
  const b = Buffer.alloc(40);
  Buffer.from('\x89PNG\r\n\x1a\n', 'latin1').copy(b, 0);
  b.writeUInt32BE(13, 8); b.write('IHDR', 12, 'latin1');
  b.writeUInt32BE(w, 16); b.writeUInt32BE(h, 20);
  return b.toString('base64');
}
function jpeg(w, h, orientation) {
  const parts = [Buffer.from([0xFF, 0xD8])];
  if (orientation) {
    // APP1 « Exif » : TIFF big-endian, IFD0 à 8, une entrée 0x0112.
    const tiff = Buffer.from([0x4D, 0x4D, 0x00, 0x2A, 0, 0, 0, 8, 0, 1, 0x01, 0x12, 0, 3, 0, 0, 0, 1, 0, orientation, 0, 0, 0, 0, 0, 0]);
    const corps = Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), tiff]);
    const ent = Buffer.from([0xFF, 0xE1, 0, 0]); ent.writeUInt16BE(corps.length + 2, 2);
    parts.push(ent, corps);
  } else {
    parts.push(Buffer.from([0xFF, 0xE0, 0x00, 0x10]), Buffer.from('JFIF\0\x01\x01\0\0\x01\0\x01\0\0', 'latin1'));
  }
  const sof = Buffer.from([0xFF, 0xC0, 0x00, 0x11, 0x08, 0, 0, 0, 0, 0x03, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]);
  sof.writeUInt16BE(h, 5); sof.writeUInt16BE(w, 7);
  parts.push(sof, Buffer.from([0xFF, 0xD9]));
  return Buffer.concat(parts).toString('base64');
}
const JPEG_900 = 'data:image/jpeg;base64,' + jpeg(900, 675);
const PNG_1000 = png(1000, 1000);

// ── Le faux Claude ─────────────────────────────────────────────────────────
const message = (content, stop_reason, extra) => Object.assign({ id: 'msg_banc', type: 'message', role: 'assistant',
  model: 'claude-sonnet-5-5', content, stop_reason: stop_reason || 'end_turn', stop_details: null,
  usage: { input_tokens: 2400, cache_read_input_tokens: 900, cache_creation_input_tokens: 0, output_tokens: 640 } }, extra || {});
const reflexion = { type: 'thinking', thinking: '', signature: 'sig-banc' };
const json = (o) => message([reflexion, { type: 'text', text: JSON.stringify(o) }]);

let recus = [];
/** `reponses` : une entrée par appel — { msg } | { statut, type, erreur } | { brut } | { jette } | { pend: true }. */
function fauxClaude(reponses) {
  recus = [];
  let k = 0;
  global.fetch = async (url, init) => {
    const r = reponses[Math.min(k++, reponses.length - 1)];
    recus.push({ url: String(url), entetes: init.headers, corps: JSON.parse(init.body) });
    if (r.jette) throw new Error(r.jette);
    if (r.pend) return new Promise((_, rejeter) => init.signal.addEventListener('abort', () => {
      const e = new Error('aborted'); e.name = 'AbortError'; rejeter(e); }));
    if (r.statut) return { ok: false, status: r.statut, text: async () => JSON.stringify({ type: 'error', error: { type: r.type || 'overloaded_error', message: r.erreur || 'Overloaded' } }) };
    if (r.brut !== undefined) return { ok: true, status: 200, text: async () => r.brut };
    return { ok: true, status: 200, text: async () => JSON.stringify(r.msg) };
  };
}
/** Le faux Gemini, pour la parité : il rend `objet` en texte JSON. */
let recusGemini = [];
function fauxGemini(objet) {
  recusGemini = [];
  global.fetch = async (url, init) => {
    recusGemini.push({ url: String(url), corps: JSON.parse(init.body) });
    return { ok: true, status: 200, text: async () => JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(objet) }] } }] }) };
  };
}

function fauxRes() {
  const r = { code: null, corps: null, entetes: {} };
  r.setHeader = (k, val) => { r.entetes[k] = val; };
  r.status = (c) => { r.code = c; return r; };
  r.json = (o) => { r.corps = o; return r; };
  r.end = () => r;
  return r;
}
let n = 0;
const ent = (extra) => Object.assign({ 'x-flint-key': 'secret-banc', 'x-forwarded-for': '198.51.100.' + (++n % 250),
                                       'x-flint-device': 'BANC-' + n }, extra || {});
async function jouer(corps, entetes, methode) {
  const lignes = [];
  const orig = console.log;
  console.log = (...a) => lignes.push(a.join(' '));
  const res = fauxRes();
  try { await scan({ method: methode || 'POST', headers: ent(entetes), body: corps }, res); }
  finally { console.log = orig; }
  return { res, journal: lignes };
}
const secret = (x) => [CLE1, CLE2, CLE_G].some((c) => JSON.stringify(x).includes(c));

const REPAS = { mealName: 'Bowl', healthScore: 8, healthNote: 'Bien.',
  items: [{ name: 'Riz', grams: 200, kcal: 260, prot: 5, carb: 57, fat: 1, confidence: 0.8 },
          { name: 'Poulet', grams: 150, kcal: 900, prot: 45, carb: 0, fat: 5, confidence: 0.7 }] };
const ETIQUETTE = { lisible: true, name: ' Céréales ', brand: 'Marque', servingG: 30,
  per100: { kcal: 389, prot: 8.2, carb: 72.5, sugars: 21.04, fat: 5.6, satfat: 1.1, fiber: 6, salt: 0.72, caffeine: null } };
const BRUT_CARTE = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'scan-carte', 'gemini-brut.json'), 'utf8'));
/** La même carte, `box` en PIXELS d'une image largeur × hauteur. */
function cartePixels(brut, w, h) {
  const c = JSON.parse(JSON.stringify(brut));
  for (const d of c.menu.dishes) if (Array.isArray(d.box)) {
    const [y0, x0, y1, x1] = d.box;
    d.box = [x0 / 1000 * w, y0 / 1000 * h, x1 / 1000 * w, y1 / 1000 * h];
  }
  return c;
}

(async () => {

console.log('\n═══ ① L\'INTERRUPTEUR ═══');
{
  claudeEteint();
  process.env.ANTHROPIC_API_KEY = CLE1;
  fauxGemini(REPAS);
  const { res } = await jouer({ image: JPEG_900 });
  v('sans SCAN_FOURNISSEUR : Gemini sert (même avec une clé Anthropic posée)',
    res.code === 200 && recusGemini.length === 1 && /generativelanguage/.test(recusGemini[0].url));
  for (const val of ['gemini', 'Anthropic', 'anthropic ', '1']) {
    process.env.SCAN_FOURNISSEUR = val;
    fauxGemini(REPAS);
    await jouer({ image: JPEG_900 });
    v('SCAN_FOURNISSEUR=' + JSON.stringify(val) + ' : Gemini (seul « anthropic » exact bascule)', recusGemini.length === 1);
  }
  claudeEteint();
  v('configScan sans la variable → null', SC.configScan({ ANTHROPIC_API_KEY: 'x' }) === null);
  v('COACH_FOURNISSEUR=anthropic ne bascule pas le scan', SC.configScan({ COACH_FOURNISSEUR: 'anthropic', ANTHROPIC_API_KEY: 'x' }) === null);
  v('… et SCAN_FOURNISSEUR=anthropic ne bascule pas le Coach', CL.configClaude({ SCAN_FOURNISSEUR: 'anthropic', ANTHROPIC_API_KEY: 'x' }) === null);
}

console.log('\n═══ ② LA REQUÊTE ═══');
{
  // Le prompt que Gemini reçoit, pour comparer mot pour mot.
  claudeEteint();
  fauxGemini(REPAS); await jouer({ image: JPEG_900 });
  const pRepas = recusGemini[0].corps.contents[0].parts[0].text;
  fauxGemini(REPAS); await jouer({ text: 'deux œufs au plat' });
  const pTexte = recusGemini[0].corps.contents[0].parts[0].text;
  fauxGemini(ETIQUETTE); await jouer({ mode: 'label', image: JPEG_900 });
  const pLabel = recusGemini[0].corps.contents[0].parts[0].text;
  fauxGemini(BRUT_CARTE); await jouer({ image: JPEG_900, carte: 'auto' });
  const pAuto = recusGemini[0].corps.contents[0].parts[0].text;
  fauxGemini(BRUT_CARTE); await jouer({ image: JPEG_900, mode: 'carte' });
  const pCarte = recusGemini[0].corps.contents[0].parts[0].text;

  claudeAllume();
  fauxClaude([{ msg: json(REPAS) }]);
  const { res } = await jouer({ image: JPEG_900 });
  const r = recus[0] || { corps: {}, entetes: {} };
  const c = r.corps;
  v('une seule requête, vers api.anthropic.com/v1/messages', recus.length === 1 && r.url === 'https://api.anthropic.com/v1/messages', r.url);
  v('en-têtes : x-api-key = la 1re clé, anthropic-version 2026-10-21', r.entetes['x-api-key'] === CLE1 && r.entetes['anthropic-version'] === '2026-10-21');
  v('  … bêta du secours (Sonnet 5.5), SANS la bêta de liaison du Coach',
    r.entetes['anthropic-beta'] === CL.BETA_SECOURS, String(r.entetes['anthropic-beta']));
  v('modèle par défaut : claude-sonnet-5-5', c.model === 'claude-sonnet-5-5');
  v('effort explicite : medium', c.output_config && c.output_config.effort === 'medium');
  v('sorties structurées : output_config.format = json_schema', c.output_config && c.output_config.format && c.output_config.format.type === 'json_schema' && !!c.output_config.format.schema);
  v('ni température, ni top_p, ni outil, ni tool_choice, ni thinking envoyé',
    !('temperature' in c) && !('top_p' in c) && !('tools' in c) && !('tool_choice' in c) && !('thinking' in c));
  v('pas de pré-remplissage : un seul message, rôle user', c.messages.length === 1 && c.messages[0].role === 'user');
  const contenu = c.messages[0].content;
  v('la photo AVANT le texte, en base64, type lu dans le fichier',
    contenu[0].type === 'image' && contenu[0].source.type === 'base64' && contenu[0].source.media_type === 'image/jpeg'
    && contenu[0].source.data === JPEG_900.split(',')[1] && contenu[1].type === 'text');
  v('le prompt des repas, MOT POUR MOT, en système mis en cache',
    c.system.length === 1 && c.system[0].text === pRepas && c.system[0].cache_control.type === 'ephemeral');
  v('secours côté serveur : fallbacks = "default"', c.fallbacks === 'default');
  v('max_tokens 16 000 (la réflexion compte dedans)', c.max_tokens === 16000);
  v('l\'app reçoit le repas, clés d\'avant', res.code === 200 && JSON.stringify(Object.keys(res.corps)) === JSON.stringify(['mealName', 'items', 'total', 'healthScore', 'healthNote']));

  fauxClaude([{ msg: json(REPAS) }]);
  await jouer({ text: 'deux œufs au plat' });
  const ct = recus[0].corps;
  v('texte : aucune image, l\'amorce et la description dans le message',
    ct.messages[0].content.length === 1 && ct.messages[0].content[0].type === 'text' && ct.messages[0].content[0].text === 'Description du repas : deux œufs au plat');
  v('  … système + message = le prompt texte de Gemini, mot pour mot', ct.system[0].text + '\n\n' + ct.messages[0].content[0].text === pTexte);

  fauxClaude([{ msg: json(ETIQUETTE) }]);
  await jouer({ mode: 'label', image: JPEG_900 });
  v('étiquette : le prompt « ne devine rien », mot pour mot', recus[0].corps.system[0].text === pLabel && /ne devine RIEN/.test(pLabel));

  fauxClaude([{ msg: json(cartePixels(BRUT_CARTE, 900, 675)) }]);
  await jouer({ image: JPEG_900, carte: 'auto' });
  const sa = recus[0].corps.system[0].text;
  v('carte auto : le prompt de Gemini, la ligne box en pixels et RIEN d\'autre',
    sa === pAuto.split(SC.LIGNE_BOX_GEMINI).join(SC.LIGNE_BOX_CLAUDE) && sa !== pAuto && !sa.includes('millièmes'));
  v('  … la taille de l\'image dans le message, pas dans le système (le cache tient)',
    recus[0].corps.messages[0].content[1].text.includes('900 × 675 pixels') && !sa.includes('675'));
  fauxClaude([{ msg: json({ menu: cartePixels(BRUT_CARTE, 900, 675).menu }) }]);
  await jouer({ image: JPEG_900, mode: 'carte' });
  v('carte forcée : le prompt de la carte seule, la ligne box en pixels',
    recus[0].corps.system[0].text === pCarte.split(SC.LIGNE_BOX_GEMINI).join(SC.LIGNE_BOX_CLAUDE));
  let leve = false;
  try { SC.pourClaudeConsignes('un prompt sans la ligne'); } catch (e) { leve = true; }
  v('si la ligne box change dans _scan-carte.js, l\'adaptation LÈVE (pas de prompt faux en silence)', leve);
}

console.log('\n═══ ③ LES SCHÉMAS TIENNENT LES LIMITES DE LA DOCUMENTATION ═══');
{
  const MOTS = new Set(['type', 'properties', 'items', 'required', 'enum', 'description', 'additionalProperties', 'anyOf']);
  claudeAllume();
  for (const [nom, corps] of [['repas', { image: JPEG_900 }], ['texte', { text: 'pain' }], ['étiquette', { mode: 'label', image: JPEG_900 }],
                              ['auto', { image: JPEG_900, carte: 'auto' }], ['carte', { image: JPEG_900, mode: 'carte' }]]) {
    fauxClaude([{ msg: json(REPAS) }]);
    await jouer(corps);
    const s = recus[0].corps.output_config.format.schema;
    const k = SC.complexite(s);
    const horsListe = [...k.mots].filter((m) => !MOTS.has(m));
    v(nom + ' : chaque objet fermé (additionalProperties: false), ' + k.facultatifs + ' facultatif(s) ≤ 24, ' + k.unions + ' union(s) ≤ 16, aucun mot hors liste',
      k.objetsOuverts === 0 && k.facultatifs <= 24 && k.unions <= 16 && horsListe.length === 0, horsListe.join(','));
  }
  fauxClaude([{ msg: json(ETIQUETTE) }]);
  await jouer({ mode: 'label', image: JPEG_900 });
  const sl = recus[0].corps.output_config.format.schema;
  v('étiquette : tout est requis, une valeur absente s\'écrit null (["number","null"])',
    sl.required.join() === 'lisible,name,brand,servingG,per100' && JSON.stringify(sl.properties.servingG.type) === '["number","null"]'
    && Array.isArray(sl.properties.per100.anyOf) && sl.properties.per100.anyOf[0].required.length === 9);
  const avant = JSON.stringify(carte.SCHEMA_CARTE);
  SC.pourClaude(carte.SCHEMA_CARTE);
  v('pourClaude travaille sur une COPIE (le schéma neutre de Gemini ne bouge pas)', JSON.stringify(carte.SCHEMA_CARTE) === avant);
  const sc = SC.pourClaude(carte.SCHEMA_CARTE);
  v('carte : la description de box dit des pixels', /pixels/.test(sc.properties.menu.properties.dishes.items.properties.box.description));
}

console.log('\n═══ ④ LE CONTRAT VERS L\'APP : CE QUE REND GEMINI, À LA LETTRE ═══');
{
  const pairs = [
    ['repas photo', { image: JPEG_900 }, REPAS, REPAS],
    ['repas texte', { text: 'riz poulet' }, REPAS, REPAS],
    ['repas sans note', { image: JPEG_900 }, { mealName: 'X', items: [] }, { mealName: 'X', items: [] }],
    ['étiquette', { mode: 'label', image: JPEG_900 }, ETIQUETTE, ETIQUETTE],
    ['étiquette hors bornes', { mode: 'label', image: JPEG_900 }, { lisible: true, per100: { kcal: 4200, prot: -3, fat: 12 } },
      { lisible: true, name: null, brand: null, servingG: null, per100: { kcal: 4200, prot: -3, carb: null, sugars: null, fat: 12, satfat: null, fiber: null, salt: null, caffeine: null } }],
    ['étiquette illisible', { mode: 'label', image: JPEG_900 }, { lisible: false }, { lisible: false, name: null, brand: null, servingG: null, per100: null }],
    ['carte auto → repas', { image: JPEG_900, carte: 'auto' }, REPAS, Object.assign({ kind: 'repas' }, REPAS)],
    ['carte auto → carte (positions)', { image: 'data:image/png;base64,' + PNG_1000, carte: 'auto' }, BRUT_CARTE, cartePixels(BRUT_CARTE, 1000, 1000)],
    ['carte forcée', { image: 'data:image/png;base64,' + PNG_1000, mode: 'carte' }, { menu: BRUT_CARTE.menu }, { menu: cartePixels(BRUT_CARTE, 1000, 1000).menu }],
  ];
  for (const [nom, corps, pourGemini, pourClaude] of pairs) {
    claudeEteint();
    fauxGemini(pourGemini);
    const g = (await jouer(corps)).res;
    claudeAllume();
    fauxClaude([{ msg: json(pourClaude) }]);
    const c = (await jouer(corps)).res;
    v(nom + ' : même statut, même JSON pour l\'app (Gemini ⇄ Claude)', g.code === c.code && JSON.stringify(g.corps) === JSON.stringify(c.corps),
      JSON.stringify(c.corps).slice(0, 220));
  }
  // La réponse d'essai de l'app (reponse-carte.json) : Claude la rend aussi.
  claudeAllume();
  fauxClaude([{ msg: json(cartePixels(BRUT_CARTE, 1000, 1000)) }]);
  const { res } = await jouer({ image: 'data:image/png;base64,' + PNG_1000, carte: 'auto' });
  const fixe = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'scan-carte', 'reponse-carte.json'), 'utf8'));
  v('reponse-carte.json (l\'atelier de l\'app) = ce que rend Claude pour la même carte', JSON.stringify(res.corps) === JSON.stringify(fixe));
  // 4P+4G+9L : le garde-fou s'applique au repas de Claude.
  fauxClaude([{ msg: json(REPAS) }]);
  const poulet = (await jouer({ image: JPEG_900 })).res.corps.items[1];
  v('  … et le garde-fou 4P+4G+9L recale le poulet annoncé à 900 kcal (45 g P, 5 g L → 225)', poulet.kcal === 4 * 45 + 9 * 5, JSON.stringify(poulet));
  // La casse des énumérations n'est pas garantie (documentation) : « Carte », « Plat ».
  claudeEteint();
  fauxGemini(BRUT_CARTE);
  const g = (await jouer({ image: JPEG_900, carte: 'auto' })).res;
  claudeAllume();
  const majuscules = cartePixels(BRUT_CARTE, 900, 675);
  majuscules.kind = 'Carte';
  majuscules.menu.dishes.forEach((d) => { d.section = d.section.charAt(0).toUpperCase() + d.section.slice(1); });
  fauxClaude([{ msg: json(majuscules) }]);
  const m = (await jouer({ image: JPEG_900, carte: 'auto' })).res;
  const rubriques = (x) => x.corps.menu.dishes.map((d) => d.section).join();
  v('« Carte » et « Plat » (casse rendue par le modèle) → kind carte, rubriques identiques à Gemini',
    m.corps.kind === 'carte' && m.corps.menu.dishes.length === 13 && rubriques(m) === rubriques(g), rubriques(m));
}

console.log('\n═══ ⑤ LA PHOTO : FORMAT, TAILLE, POSITIONS ═══');
{
  v('JPEG : format et taille lus dans le SOF', JSON.stringify(SC.lireImage(jpeg(900, 675))) === JSON.stringify({ media: 'image/jpeg', largeur: 900, hauteur: 675 }));
  v('JPEG orientation EXIF 6 : le modèle le voit tourné (675 × 900)', JSON.stringify(SC.lireImage(jpeg(900, 675, 6))) === JSON.stringify({ media: 'image/jpeg', largeur: 675, hauteur: 900 }));
  v('JPEG orientation EXIF 1 : tel quel', SC.lireImage(jpeg(900, 675, 1)).largeur === 900);
  v('PNG : IHDR', JSON.stringify(SC.lireImage(png(1280, 960))) === JSON.stringify({ media: 'image/png', largeur: 1280, hauteur: 960 }));
  const gif = Buffer.concat([Buffer.from('GIF89a', 'latin1'), Buffer.from([0x84, 0x03, 0xA3, 0x02]), Buffer.alloc(10)]).toString('base64');
  v('GIF', JSON.stringify(SC.lireImage(gif)) === JSON.stringify({ media: 'image/gif', largeur: 900, hauteur: 675 }));
  const webp = Buffer.alloc(30); webp.write('RIFF', 0, 'latin1'); webp.write('WEBP', 8, 'latin1'); webp.write('VP8X', 12, 'latin1');
  webp.writeUIntLE(899, 24, 3); webp.writeUIntLE(674, 27, 3);
  v('WebP (VP8X)', JSON.stringify(SC.lireImage(webp.toString('base64'))) === JSON.stringify({ media: 'image/webp', largeur: 900, hauteur: 675 }));
  const heic = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypheic', 'latin1'), Buffer.alloc(20)]).toString('base64');
  v('HEIC, texte, vide : pas une image lisible', SC.lireImage(heic) === null && SC.lireImage(Buffer.from('bonjour tout le monde').toString('base64')) === null && SC.lireImage('') === null);
  // La taille vue : les exemples de la documentation.
  const t = (w, h, m) => { const r = SC.tailleVue(w, h, m); return r.largeur + 'x' + r.hauteur; };
  v('taille vue, palier standard (Sonnet 4.6) : 1920×1080 → 1456×819, 1075×1520 → 924×1307 (exemples de la doc)',
    t(1920, 1080, 'claude-sonnet-4-6') === '1456x819' && t(1075, 1520, 'claude-sonnet-4-6') === '924x1307', t(1920, 1080, 'claude-sonnet-4-6') + ' ' + t(1075, 1520, 'claude-sonnet-4-6'));
  v('taille vue, haute résolution (Sonnet/Haiku 5.5) : 3840×2160 → 2576×1449, 1075×1520 inchangé, 900×675 inchangé',
    t(3840, 2160, 'claude-sonnet-5-5') === '2576x1449' && t(1075, 1520, 'claude-haiku-5-5') === '1075x1520' && t(900, 675, 'claude-sonnet-5-5') === '900x675');
  v('paliers : Haiku 4.5 et Sonnet 4.6 standard ; Opus 4.7+, Sonnet/Haiku 5.5, Fable haute résolution',
    !SC.hauteResolution('claude-haiku-4-5-20251001') && !SC.hauteResolution('claude-sonnet-4-6') && SC.hauteResolution('claude-opus-4-7')
    && SC.hauteResolution('claude-sonnet-5-5') && SC.hauteResolution('claude-haiku-5-5') && SC.hauteResolution('claude-fable-5-2'));

  claudeAllume();
  // Un `mime` qui ment : on envoie ce que dit le fichier.
  fauxClaude([{ msg: json(REPAS) }]);
  await jouer({ image: jpeg(900, 675), mime: 'image/png' });
  v('mime annoncé png, fichier JPEG → media_type image/jpeg', recus[0].corps.messages[0].content[0].source.media_type === 'image/jpeg');
  fauxClaude([{ msg: json(REPAS) }]);
  await jouer({ image: 'data:image/png;base64,' + png(800, 600).replace(/(.{10})/g, '$1\n') });
  v('base64 avec sauts de ligne : nettoyé avant l\'envoi', !/\s/.test(recus[0].corps.messages[0].content[0].source.data));
  fauxClaude([{ msg: json(REPAS) }]);
  let r = await jouer({ image: 'data:image/heic;base64,' + heic });
  v('HEIC → 415 avec une phrase, et AUCUN appel payé', r.res.code === 415 && recus.length === 0 && /JPEG ou PNG/.test(r.res.corps.error));

  // Positions : pixels de l'image vue → fractions.
  const trois = { kind: 'carte', items: [], menu: { dishes: [0, 1, 2].map((i) => ({ name: 'Plat ' + i, section: 'plat', kcal: 600, kcalMin: 500, kcalMax: 750,
    prot: 30, carb: 60, fat: 27, confidence: 0.7, box: [90, 67.5 + i * 67.5, 540, 94.5 + i * 67.5] })) } };
  fauxClaude([{ msg: json(trois) }]);
  r = await jouer({ image: JPEG_900, carte: 'auto' });
  const b0 = r.res.corps.menu && r.res.corps.menu.dishes[0].box;
  v('box [90, 67.5, 540, 94.5] px sur 900×675 → {x 0.1, y 0.1, w 0.5, h 0.04}',
    r.res.corps.menu.positions === true && JSON.stringify(b0) === JSON.stringify({ x: 0.1, y: 0.1, w: 0.5, h: 0.04 }), JSON.stringify(b0));
  // Orientation 6 : le modèle voit 675 × 900, la conversion suit.
  fauxClaude([{ msg: json(trois) }]);
  r = await jouer({ image: 'data:image/jpeg;base64,' + jpeg(900, 675, 6), carte: 'auto' });
  v('photo tournée (EXIF 6) : le message dit 675 × 900, la conversion divise par 675 et 900',
    recus[0].corps.messages[0].content[1].text.includes('675 × 900') && r.res.corps.menu.dishes[0].box.x === Math.round(90 / 675 * 10000) / 10000);
  // Un débordement est borné à l'image.
  const deborde = JSON.parse(JSON.stringify(trois)); deborde.menu.dishes.forEach((d) => { d.box[2] = 5000; });
  fauxClaude([{ msg: json(deborde) }]);
  r = await jouer({ image: JPEG_900, carte: 'auto' });
  v('un x2 hors de l\'image est borné au bord (0,1 → 1,0 : w 0.9)', r.res.corps.menu.dishes[0].box.w === 0.9, JSON.stringify(r.res.corps.menu.dishes[0].box));
  // Taille inconnue : aucune position, et le modèle est prévenu.
  const pngSansIHDR = Buffer.concat([Buffer.from('\x89PNG\r\n\x1a\n', 'latin1'), Buffer.alloc(30)]).toString('base64');
  fauxClaude([{ msg: json(trois) }]);
  r = await jouer({ image: pngSansIHDR, carte: 'auto' });
  v('taille illisible : « omets box » dans le message, et aucune position rendue',
    recus[0].corps.messages[0].content[1].text.includes('omets box') && r.res.corps.menu.positions === false && r.res.corps.menu.dishes.every((d) => !d.box));
  // Un repas ne parle pas de taille (le prompt des repas n'a pas de box).
  fauxClaude([{ msg: json(REPAS) }]);
  await jouer({ image: JPEG_900 });
  v('repas : pas de taille dans le message', !/pixels/.test(recus[0].corps.messages[0].content[1].text));
}

console.log('\n═══ ⑥ DEUX CLÉS, UN RELAIS — ET AUCUNE CLÉ QUI SORT ═══');
{
  CL._oublierClesEpuisees();
  claudeAllume();
  process.env.ANTHROPIC_API_KEY_2 = CLE2;
  const VIDE = 'Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits.';
  fauxClaude([{ statut: 400, type: 'invalid_request_error', erreur: VIDE }, { msg: json(REPAS) }]);
  let r = await jouer({ image: JPEG_900 });
  v('crédit épuisé sur la clé de Dino → la même analyse part avec celle de Félix, servie',
    recus.length === 2 && recus[0].entetes['x-api-key'] === CLE1 && recus[1].entetes['x-api-key'] === CLE2 && r.res.code === 200 && r.res.corps.items.length === 2);
  v('  … le journal dit cle=2 et les jetons, jamais une clé', r.journal.some((l) => /cle=2/.test(l) && /entree=2400/.test(l) && /sortie=640/.test(l)) && !secret(r.journal), r.journal.join(' | '));
  fauxClaude([{ msg: json(REPAS) }]);
  r = await jouer({ image: JPEG_900 });
  v('la clé épuisée est mise de côté : l\'analyse suivante part directement avec la seconde', recus.length === 1 && recus[0].entetes['x-api-key'] === CLE2);
  CL._oublierClesEpuisees();
  fauxClaude([{ statut: 400, type: 'invalid_request_error', erreur: VIDE }]);
  r = await jouer({ image: JPEG_900 });
  v('les DEUX crédits épuisés → 502, la phrase d\'avant, et aucune clé dans la réponse',
    recus.length === 2 && r.res.code === 502 && r.res.corps.error.startsWith("L'analyse est en panne") && !secret(r.res.corps) && !secret(r.journal));
  CL._oublierClesEpuisees();
  fauxClaude([{ statut: 400, type: 'invalid_request_error', erreur: 'max_tokens: too large' }]);
  r = await jouer({ image: JPEG_900 });
  v('une 400 qui n\'est PAS un crédit épuisé ne change pas de clé : un appel, 502', recus.length === 1 && r.res.code === 502 && r.res.corps.statut === 400);
  fauxClaude([{ jette: 'connexion refusée (x-api-key ' + CLE1 + ')' }]);
  r = await jouer({ image: JPEG_900 });
  v('une exception réseau qui cite la clé : masquée dans detail et au journal', r.res.code === 502 && !secret(r.res.corps) && !secret(r.journal) && /\[clé\]/.test(r.res.corps.detail), r.res.corps.detail);
  delete process.env.ANTHROPIC_API_KEY_2;
  CL._oublierClesEpuisees();
}

console.log('\n═══ ⑦ LES PANNES → 502 ET LA PHRASE QUE L\'APP SAIT AFFICHER ═══');
{
  claudeAllume();
  const panne = (r) => r.res.code === 502 && r.res.corps.error === "L'analyse est en panne à l'instant. Réessaie dans un moment." && r.res.corps.fournisseur === 'anthropic';
  fauxClaude([{ statut: 529 }, { statut: 529 }]);
  let r = await jouer({ image: JPEG_900 });
  v('529 « overloaded » deux fois : un réessai, puis 502', recus.length === 2 && panne(r) && r.res.corps.statut === 529);
  fauxClaude([{ statut: 503 }, { msg: json(REPAS) }]);
  r = await jouer({ image: JPEG_900 });
  v('503 puis 200 : servi au second essai', recus.length === 2 && r.res.code === 200);
  const cas = [
    ['JSON illisible', { msg: message([{ type: 'text', text: 'pas du json {' }]) }, /JSON illisible/],
    ['un tableau au lieu d\'un objet', { msg: message([{ type: 'text', text: '[1,2]' }]) }, /pas un objet/],
    ['réponse sans texte (réflexion seule)', { msg: message([reflexion]) }, /vide/],
    ['coupée par max_tokens', { msg: message([{ type: 'text', text: '{"mealName":"Bo' }], 'max_tokens') }, /coupée/],
    ['refus du classifieur', { msg: message([], 'refusal', { stop_details: { type: 'refusal', category: 'general_harms' } }) }, /refus \(general_harms\)/],
    ['200 mais corps illisible', { brut: '<html>oups</html>' }, /illisible/],
  ];
  for (const [nom, rep, motif] of cas) {
    fauxClaude([rep]);
    r = await jouer({ image: JPEG_900 });
    v(nom + ' → 502, phrase d\'avant, raison en detail', recus.length === 1 && panne(r) && motif.test(r.res.corps.detail), JSON.stringify(r.res.corps));
  }
  fauxClaude([{ msg: message([{ type: 'text', text: '{"mealName":"Bo' }, { type: 'fallback', from: { model: 'claude-sonnet-5-5' }, to: { model: 'claude-sonnet-5' } },
    { type: 'text', text: JSON.stringify(REPAS) }]) }]);
  r = await jouer({ image: JPEG_900 });
  v('après un secours, seul le texte qui suit le bloc fallback est lu', r.res.code === 200 && r.res.corps.mealName === 'Bowl' && r.journal.some((l) => / secours/.test(l)));
  // Un délai dépassé ne se réessaie pas (banc : délai ramené à 1 s).
  const delaiAvant = SC.DELAIS.repas;
  SC.DELAIS.repas = 1;
  fauxClaude([{ pend: true }]);
  r = await jouer({ image: JPEG_900 });
  SC.DELAIS.repas = delaiAvant;
  v('délai dépassé : un seul essai, 502, « délai … dépassé »', recus.length === 1 && panne(r) && /délai de 1000 ms dépassé/.test(r.res.corps.detail), JSON.stringify(r.res.corps));
  // Les délais par mode, sous la patience de l'app et les 160 s de la fonction.
  const vraiAppel = CL.appelerClaude;
  const delais = {};
  CL.appelerClaude = async (o) => { delais[o.corps.system[0].text.slice(0, 40)] = [o.delaiMs, o.tentatives]; return { ok: true, tentatives: 1, json: json(REPAS) }; };
  const vus = {};
  for (const [nom, corps] of [['etiquette', { mode: 'label', image: JPEG_900 }], ['repas', { image: JPEG_900 }], ['texte', { text: 'pain' }],
                              ['auto', { image: JPEG_900, carte: 'auto' }], ['carte', { image: JPEG_900, mode: 'carte' }]]) {
    for (const k of Object.keys(delais)) delete delais[k];
    await jouer(corps);
    vus[nom] = Object.values(delais)[0];
  }
  CL.appelerClaude = vraiAppel;
  v('délais : étiquette 40 s ×2 (< 90 s de l\'app), repas/texte 55 s ×2, carte 75 s ×2 (< 160 s)',
    JSON.stringify(vus) === JSON.stringify({ etiquette: [40000, 2], repas: [55000, 2], texte: [55000, 2], auto: [75000, 2], carte: [75000, 2] }), JSON.stringify(vus));
}

console.log('\n═══ ⑧ LES RÉGLAGES, LA PORTE, LE COACH ═══');
{
  claudeAllume();
  process.env.SCAN_MODELE = 'claude-haiku-5-5';
  fauxClaude([{ msg: json(REPAS) }]);
  await jouer({ image: JPEG_900 });
  v('SCAN_MODELE=claude-haiku-5-5 : ce modèle, sans secours (Haiku 5.5 n\'en a pas), sans aucun en-tête bêta',
    recus[0].corps.model === 'claude-haiku-5-5' && !('fallbacks' in recus[0].corps) && !('anthropic-beta' in recus[0].entetes));
  process.env.SCAN_MODELE = 'Claude Sonnet ; rm -rf';
  fauxClaude([{ msg: json(REPAS) }]);
  await jouer({ image: JPEG_900 });
  v('SCAN_MODELE hors forme → le défaut', recus[0].corps.model === 'claude-sonnet-5-5');
  delete process.env.SCAN_MODELE;
  for (const [val, attendu] of [['low', 'low'], ['high', 'high'], ['turbo', 'medium'], ['aucun', undefined]]) {
    process.env.SCAN_EFFORT = val;
    fauxClaude([{ msg: json(REPAS) }]);
    await jouer({ image: JPEG_900 });
    v('SCAN_EFFORT=' + val + ' → effort ' + attendu, recus[0].corps.output_config.effort === attendu);
  }
  delete process.env.SCAN_EFFORT;
  process.env.SCAN_CLAUDE_SECOURS = '0';
  fauxClaude([{ msg: json(REPAS) }]);
  await jouer({ image: JPEG_900 });
  v('SCAN_CLAUDE_SECOURS=0 : ni fallbacks ni bêta', !('fallbacks' in recus[0].corps) && !('anthropic-beta' in recus[0].entetes));
  delete process.env.SCAN_CLAUDE_SECOURS;

  delete process.env.ANTHROPIC_API_KEY;
  fauxClaude([{ msg: json(REPAS) }]);
  let r = await jouer({ image: JPEG_900 });
  v('SCAN_FOURNISSEUR=anthropic sans ANTHROPIC_API_KEY → 500, le journal nomme la variable, aucun appel (pas de repli Gemini caché)',
    r.res.code === 500 && recus.length === 0 && r.journal.some((l) => l.includes('ANTHROPIC_API_KEY absente')));
  claudeAllume();

  fauxClaude([{ msg: json(REPAS) }]);
  r = await jouer({ image: JPEG_900 }, { 'x-flint-key': 'mauvaise', origin: 'https://ailleurs.example' });
  v('la porte : mauvaise clé d\'app → 401 avant tout appel payé', r.res.code === 401 && recus.length === 0);
  fauxClaude([{ msg: json(REPAS) }]);
  r = await jouer({ image: JPEG_900 }, { origin: 'https://ailleurs.example' });
  v('  … pas d\'Access-Control-Allow-Origin, même servi par Claude', r.res.code === 200 && r.res.entetes['Access-Control-Allow-Origin'] === undefined);
  fauxClaude([{ msg: json(REPAS) }]);
  r = await jouer({ image: 'A'.repeat(3 * 1024 * 1024 + 10) });
  v('  … photo trop lourde → 413 avant tout appel', r.res.code === 413 && recus.length === 0);
  fauxClaude([{ msg: json(REPAS) }]);
  let refus = 0;
  for (let i = 0; i < 21; i++) {
    const res = fauxRes();
    await scan({ method: 'POST', headers: { 'x-flint-key': 'secret-banc', 'x-forwarded-for': '192.0.2.77', 'x-flint-device': 'RAFALE' }, body: { image: JPEG_900 } }, res);
    if (res.code === 429) refus++;
  }
  v('  … la 21e photo de la minute d\'un appareil → 429 (20 appels payés, pas 21)', refus === 1 && recus.length === 20, refus + ' refus, ' + recus.length + ' appels');

  v('le Coach garde sa bêta de liaison (entetes sans `liaison`)', CL.entetes({ cle: 'k', secours: false })['anthropic-beta'] === CL.BETA_LIAISON);
}

global.fetch = vraiFetch;
console.log('\n' + vert + ' vert(s), ' + rouge + ' rouge(s)\n');
process.exitCode = rouge ? 1 : 0;
})();
