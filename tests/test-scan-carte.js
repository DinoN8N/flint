// ═══════════════════════════════════════════════════════════════════════════
//  LE BANC DE LA CARTE DU RESTAURANT ET DE LA PORTE DU SCAN — 16 nov. 2026
//
//  `node tests/test-scan-carte.js`
//
//  Il exerce les VRAIS fichiers (`api/scan-meal.js` par son handler,
//  `api/_scan-carte.js` directement) avec un faux `fetch` qui joue Gemini ET le
//  magasin Upstash. Aucune clé, aucun réseau : chaque `process.env` posé ici est
//  un décor de banc, et le vrai `fetch` est rendu à la fin.
//
//  Ce qu'il garde :
//   ① la porte : plus de CORS ouvert, un device illisible refusé, la limite
//     par minute comptée par appareil ET par IP (sans toucher aux compteurs du
//     Coach), le plafond du jour par appareil ET par IP, la clé avant le plafond ;
//   ② les trois questions : sans `carte` ni `mode`, le repas d'avant au mot
//     près ; `carte: "auto"` laisse décider le modèle ; `mode: "carte"` force ;
//   ③ la normalisation d'une carte : noms tels qu'écrits, fourchettes, prix,
//     rubriques, doublons, et la porte « tout ou rien » des positions ;
//   ④ le schéma reste NEUTRE (Gemini aujourd'hui, Claude demain) ;
//   ⑤ la réponse d'essai de l'app (`reponse-carte.json`) est exactement ce que
//     le serveur rend pour la carte fabriquée : l'atelier de l'app ne ment pas.
// ═══════════════════════════════════════════════════════════════════════════

const path = require('path');
const fs = require('fs');
const vraiFetch = global.fetch;

let vert = 0, rouge = 0;
function v(titre, ok, detail) {
  if (ok) { vert++; console.log('  ✅ ' + titre); }
  else { rouge++; console.log('  ❌ ' + titre + (detail ? '   ' + detail : '')); }
}
function fauxRes() {
  const r = { code: null, corps: null, entetes: {}, fini: false };
  r.setHeader = (k, val) => { r.entetes[k] = val; };
  r.status = (c) => { r.code = c; return r; };
  r.json = (o) => { r.corps = o; return r; };
  r.end = () => { r.fini = true; return r; };
  return r;
}
function fauxReq(entetes, corps, methode) {
  return { method: methode || 'POST', headers: entetes || {}, body: corps === undefined ? {} : corps };
}
async function muet(fn) {
  const orig = console.log; const lignes = [];
  console.log = (...a) => lignes.push(a.join(' '));
  try { await fn(); } finally { console.log = orig; }
  return lignes;
}

// Le décor : une clé Gemini et un secret d'app de banc.
process.env.GEMINI_API_KEY = 'cle-gemini-de-banc';
process.env.FLINT_APP_SECRET = 'secret-de-banc';
delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;

const scan = require(path.join(__dirname, '..', 'api', 'scan-meal.js'));
const carte = require(path.join(__dirname, '..', 'api', '_scan-carte.js'));
const lib = require(path.join(__dirname, '..', 'api', '_lib.js'));
const SRC = fs.readFileSync(path.join(__dirname, '..', 'api', 'scan-meal.js'), 'utf8');

/** Un faux Gemini qui rend `objet` comme texte JSON, et retient la requête. */
let derniere = null, appelsGemini = 0;
function gemini(objet) {
  global.fetch = async (url, init) => {
    appelsGemini++;
    derniere = { url, corps: JSON.parse(init.body) };
    return { ok: true, status: 200, text: async () => JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(objet) }] } }] }) };
  };
}
let ipSuivante = 1;
const nouvelleIP = () => '198.18.' + Math.floor(ipSuivante / 250) + '.' + (ipSuivante++ % 250);
const ent = (extra) => Object.assign({ 'x-flint-key': 'secret-de-banc', 'x-forwarded-for': nouvelleIP() }, extra || {});
const PHOTO = 'data:image/jpeg;base64,' + Buffer.from('photo').toString('base64');
const REPAS = { mealName: 'Bowl', items: [{ name: 'Riz', grams: 200, kcal: 260, prot: 5, carb: 57, fat: 1, confidence: 0.8 }], healthScore: 8, healthNote: 'Bien.' };

(async () => {

console.log('\n═══ ① LA PORTE DU SCAN ═══');
{
  gemini(REPAS);
  let res = fauxRes();
  await scan(fauxReq(ent({ origin: 'https://site-quelconque.example' }), { image: PHOTO }), res);
  v('une requête d\'une autre origine : aucun Access-Control-Allow-Origin', res.code === 200 && res.entetes['Access-Control-Allow-Origin'] === undefined, JSON.stringify(res.entetes));
  v('  … et toujours no-store + nosniff', res.entetes['Cache-Control'] === 'no-store' && res.entetes['X-Content-Type-Options'] === 'nosniff');
  res = fauxRes();
  await scan(fauxReq(ent({ origin: 'https://site-quelconque.example' }), undefined, 'OPTIONS'), res);
  v('le préflight OPTIONS répond 204 SANS origine autorisée (un navigateur étranger s\'arrête là)',
    res.code === 204 && res.entetes['Access-Control-Allow-Origin'] === undefined);
  v('scan-meal.js n\'ouvre plus le CORS à `*`', !/Allow-Origin['"]\s*,\s*['"]\*/.test(SRC));

  res = fauxRes();
  await scan(fauxReq(ent({ 'x-flint-device': 'pas un device\n' }), { image: PHOTO }), res);
  v('un x-flint-device hors forme → 400, comme au Coach', res.code === 400, 'code ' + res.code);

  // Par appareil : 20 par minute, puis 429 — et le voisin sur la même IP passe.
  const ip = nouvelleIP();
  let refus = 0;
  for (let i = 0; i < 21; i++) {
    res = fauxRes();
    await scan(fauxReq({ 'x-flint-key': 'secret-de-banc', 'x-forwarded-for': ip, 'x-flint-device': 'APP-A' }, { image: PHOTO }), res);
    if (res.code === 429) refus++;
  }
  v('un appareil : la 21e photo de la minute → 429', refus === 1, refus + ' refus');
  res = fauxRes();
  await scan(fauxReq({ 'x-flint-key': 'secret-de-banc', 'x-forwarded-for': ip, 'x-flint-device': 'APP-B' }, { image: PHOTO }), res);
  v('  … le voisin derrière la même box passe (200)', res.code === 200, 'code ' + res.code);

  // Par IP : un device inventé à chaque requête ne contourne rien (60 / min).
  const ip2 = nouvelleIP();
  let passees = 0;
  for (let i = 0; i < 80; i++) {
    res = fauxRes();
    await scan(fauxReq({ 'x-flint-key': 'secret-de-banc', 'x-forwarded-for': ip2, 'x-flint-device': 'INVENTE-' + i }, { image: PHOTO }), res);
    if (res.code === 200) passees++;
  }
  v('80 devices inventés sur une IP : 60 passent, le reste → 429', passees === 60, passees + ' passées');
  v('  … et le Coach n\'en voit rien : son compteur d\'IP est le sien',
    lib.rateLimited('dev:coach-banc', 40, { ip: ip2 }) === false);

  // Sans en-tête : l'identité EST l'IP, vingt par minute, comme avant.
  const ip3 = nouvelleIP();
  passees = 0;
  for (let i = 0; i < 25; i++) {
    res = fauxRes();
    await scan(fauxReq({ 'x-flint-key': 'secret-de-banc', 'x-forwarded-for': ip3 }, { image: PHOTO }), res);
    if (res.code === 200) passees++;
  }
  v('sans x-flint-device : 20 par minute et par IP, comme avant', passees === 20, passees + ' passées');
}

console.log('\n═══ ①bis LE PLAFOND DU JOUR, PAR APPAREIL ET PAR IP ═══');
{
  process.env.UPSTASH_REDIS_REST_URL = 'https://magasin-de-banc.invalid';
  process.env.UPSTASH_REDIS_REST_TOKEN = 'jeton-de-banc';
  process.env.SCAN_PLAFOND_JOUR = '3';
  process.env.SCAN_PLAFOND_JOUR_IP = '5';
  const compteurs = new Map();
  let appelsMagasin = 0;
  const cles = [];
  global.fetch = async (url, init) => {
    if (String(url).startsWith('https://magasin-de-banc.invalid')) {
      appelsMagasin++;
      const cmd = JSON.parse(init.body);
      const cle = cmd[0][1];
      cles.push(cle);
      compteurs.set(cle, (compteurs.get(cle) || 0) + 1);
      return { ok: true, status: 200, json: async () => [{ result: compteurs.get(cle) }, { result: 1 }] };
    }
    return { ok: true, status: 200, text: async () => JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(REPAS) }] } }] }) };
  };
  const ip = nouvelleIP();
  const codes = [];
  for (let i = 0; i < 4; i++) {
    const res = fauxRes();
    await muet(() => scan(fauxReq({ 'x-flint-key': 'secret-de-banc', 'x-forwarded-for': ip, 'x-flint-device': 'APP-JOUR' }, { image: PHOTO }), res));
    codes.push(res.code);
  }
  v('par appareil : la 4e analyse du jour (plafond 3) → 429', codes.join(',') === '200,200,200,429', codes.join(','));
  v('  … le compteur porte l\'appareil, pas l\'IP', cles.some(k => k.includes(':scan:dev:APP-JOUR')));
  // Des devices inventés sur la même IP : l'IP tient (plafond 5 ; 4 déjà comptés).
  const codes2 = [];
  for (let i = 0; i < 3; i++) {
    const res = fauxRes();
    await muet(() => scan(fauxReq({ 'x-flint-key': 'secret-de-banc', 'x-forwarded-for': ip, 'x-flint-device': 'INV-' + i }, { image: PHOTO }), res));
    codes2.push(res.code);
  }
  v('devices inventés sur la même IP : le plafond d\'IP (5) les arrête', codes2.join(',') === '200,429,429', codes2.join(','));
  // Sans device : un seul compteur (l'IP est l'identité).
  cles.length = 0;
  const ipSeule = nouvelleIP();
  let res = fauxRes();
  await muet(() => scan(fauxReq({ 'x-flint-key': 'secret-de-banc', 'x-forwarded-for': ipSeule }, { image: PHOTO }), res));
  v('sans device : un seul compteur, celui de l\'IP', res.code === 200 && cles.length === 1 && cles[0].includes(':scan:ip:'), JSON.stringify(cles));
  // La clé d'app passe AVANT le plafond : un 401 ne touche pas au magasin.
  const avant = appelsMagasin;
  res = fauxRes();
  await muet(() => scan(fauxReq({ 'x-flint-key': 'mauvaise', 'x-forwarded-for': nouvelleIP(), 'x-flint-device': 'APP-X' }, { image: PHOTO }), res));
  v('mauvaise clé → 401, sans aller-retour au magasin', res.code === 401 && appelsMagasin === avant, 'code ' + res.code);
  // `SCAN_PLAFOND_JOUR_IP=0` éteint le plafond d'IP.
  process.env.SCAN_PLAFOND_JOUR_IP = '0';
  cles.length = 0;
  res = fauxRes();
  await muet(() => scan(fauxReq({ 'x-flint-key': 'secret-de-banc', 'x-forwarded-for': nouvelleIP(), 'x-flint-device': 'APP-Y' }, { image: PHOTO }), res));
  v('SCAN_PLAFOND_JOUR_IP=0 : seul l\'appareil est compté', res.code === 200 && cles.length === 1 && cles[0].includes(':scan:dev:APP-Y'), JSON.stringify(cles));
  delete process.env.UPSTASH_REDIS_REST_URL; delete process.env.UPSTASH_REDIS_REST_TOKEN;
  delete process.env.SCAN_PLAFOND_JOUR; delete process.env.SCAN_PLAFOND_JOUR_IP;
}

console.log('\n═══ ② LES TROIS QUESTIONS ═══');
{
  // Sans rien demander : la requête et la réponse d'avant, au mot près.
  gemini(REPAS);
  let res = fauxRes();
  await scan(fauxReq(ent(), { image: PHOTO }), res);
  const p0 = derniere.corps.contents[0].parts[0].text;
  const s0 = derniere.corps.generationConfig.responseSchema;
  v('sans `carte` : le prompt des repas, tel quel', p0.startsWith('Tu es un nutritionniste expert en estimation visuelle.') && !p0.includes('ÉTAPE 1'));
  v('  … le schéma des repas, sans `kind` ni `menu` ni `propertyOrdering`', !s0.properties.kind && !s0.properties.menu && !s0.propertyOrdering);
  v('  … et la réponse d\'avant, clé pour clé (pas de `kind`)',
    res.code === 200 && JSON.stringify(Object.keys(res.corps)) === JSON.stringify(['mealName', 'items', 'total', 'healthScore', 'healthNote']),
    JSON.stringify(Object.keys(res.corps || {})));

  // `carte: "auto"`, le modèle dit « repas » : la réponse d'avant + kind.
  res = fauxRes();
  await scan(fauxReq(ent(), { image: PHOTO, carte: 'auto' }), res);
  const pa = derniere.corps.contents[0].parts[0].text;
  const sa = derniere.corps.generationConfig.responseSchema;
  v('`carte: "auto"` : le prompt commence par la question « de quoi est-ce la photo ? »', pa.startsWith('ÉTAPE 1'));
  v('  … il reprend le prompt des repas mot pour mot', pa.includes(p0.replace(/\n*Donne un mealName court\. Réponds UNIQUEMENT en JSON conforme au schéma\.\s*$/, '')));
  v('  … et les consignes de la carte', pa.includes('=== CONSIGNES CARTE ===') && pa.includes('[ymin, xmin, ymax, xmax]'));
  v('  … schéma : `kind` en premier (propertyOrdering), puis le repas, puis `menu`',
    sa.propertyOrdering[0] === 'kind' && sa.properties.kind.enum.join() === 'repas,carte' && sa.properties.menu && sa.properties.items);
  v('  … le modèle dit « repas » → le repas, avec kind: "repas"',
    res.code === 200 && res.corps.kind === 'repas' && res.corps.mealName === 'Bowl' && res.corps.items.length === 1);

  // `carte: true` vaut `"auto"`.
  res = fauxRes();
  await scan(fauxReq(ent(), { image: PHOTO, carte: true }), res);
  v('`carte: true` vaut "auto"', derniere.corps.contents[0].parts[0].text.startsWith('ÉTAPE 1'));

  // Le modèle dit « carte ».
  const brut = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'scan-carte', 'gemini-brut.json'), 'utf8'));
  gemini(brut);
  res = fauxRes();
  const journal = await muet(() => scan(fauxReq(ent(), { image: PHOTO, carte: 'auto' }), res));
  v('le modèle dit « carte » → kind: "carte" et 13 plats', res.code === 200 && res.corps.kind === 'carte' && res.corps.menu.dishes.length === 13,
    JSON.stringify(res.corps).slice(0, 160));
  v('  … `items: []` (une app qui ne connaîtrait pas `kind` lirait « aucun aliment », jamais un faux repas)',
    Array.isArray(res.corps.items) && res.corps.items.length === 0 && res.corps.total.kcal === 0);
  v('  … positions gardées sur la carte fabriquée', res.corps.menu.positions === true && res.corps.menu.dishes.every(d => d.box));
  v('  … le journal dit combien de plats, sans un nom de plat', journal.some(l => l.includes('13 plat(s)')) && !journal.some(l => l.includes('saumon')));

  // Le `kind` contredit par la réponse.
  gemini({ kind: 'carte', items: REPAS.items, mealName: 'Bowl', healthScore: 8, menu: { dishes: [] } });
  res = fauxRes();
  await muet(() => scan(fauxReq(ent(), { image: PHOTO, carte: 'auto' }), res));
  v('« carte » sans plat mais avec des aliments → un repas', res.corps.kind === 'repas' && res.corps.items.length === 1);
  gemini({ kind: 'repas', items: [], menu: { dishes: brut.menu.dishes.slice(0, 3) } });
  res = fauxRes();
  await muet(() => scan(fauxReq(ent(), { image: PHOTO, carte: 'auto' }), res));
  v('« repas » sans aliment mais avec des plats → une carte', res.corps.kind === 'carte' && res.corps.menu.dishes.length === 3);
  gemini({ kind: 'carte', items: [], menu: { dishes: [] } });
  res = fauxRes();
  await muet(() => scan(fauxReq(ent(), { image: PHOTO, carte: 'auto' }), res));
  v('une carte illisible → kind: "carte", aucun plat (l\'app dit « rapproche-toi »)', res.corps.kind === 'carte' && res.corps.menu.dishes.length === 0);

  // `mode: "carte"` : l'app l'a dit.
  gemini({ menu: brut.menu });
  res = fauxRes();
  await muet(() => scan(fauxReq(ent(), { image: PHOTO, mode: 'carte' }), res));
  const pc = derniere.corps.contents[0].parts[0].text;
  v('`mode: "carte"` : le prompt de la carte seule', pc.startsWith('Tu es un nutritionniste qui lit des cartes') && !pc.includes('CONSIGNES REPAS'));
  v('  … le schéma de la carte seule', !!derniere.corps.generationConfig.responseSchema.properties.menu && !derniere.corps.generationConfig.responseSchema.properties.items);
  v('  … et une carte en retour', res.corps.kind === 'carte' && res.corps.menu.dishes.length === 13);

  // Le texte ne connaît que le repas.
  gemini(REPAS);
  res = fauxRes();
  await scan(fauxReq(ent(), { text: 'deux œufs', carte: 'auto' }), res);
  v('un texte avec `carte: "auto"` reste un repas, prompt texte d\'avant',
    derniere.corps.contents[0].parts.length === 1 && derniere.corps.contents[0].parts[0].text.includes('décrit son repas') && !res.corps.kind);

  // Une panne Gemini se dit pareil.
  global.fetch = async () => ({ ok: false, status: 400, text: async () => 'requête refusée' });
  res = fauxRes();
  await muet(() => scan(fauxReq(ent(), { image: PHOTO, carte: 'auto' }), res));
  v('Gemini refuse → 502 avec la phrase d\'avant', res.code === 502 && res.corps.error.startsWith("L'analyse est en panne"));

  // Une carte s'écrit plus longtemps : un essai long par modèle (3 appels),
  // au lieu de deux essais courts (6 appels) pour le repas d'avant.
  let n503 = 0;
  global.fetch = async () => { n503++; return { ok: false, status: 503, text: async () => 'high demand' }; };
  res = fauxRes();
  await muet(() => scan(fauxReq(ent(), { image: PHOTO, carte: 'auto' }), res));
  const nAuto = n503; n503 = 0;
  res = fauxRes();
  await muet(() => scan(fauxReq(ent(), { image: PHOTO }), res));
  v('Gemini saturé : 3 essais (un par modèle) quand la carte est possible, 6 pour le repas d\'avant',
    nAuto === 3 && n503 === 6 && res.code === 502, nAuto + ' / ' + n503);
}

console.log('\n═══ ③ LA NORMALISATION D\'UNE CARTE ═══');
{
  const n = carte.normaliserCarte;
  const plat = (o) => Object.assign({ name: 'Plat', section: 'plat', kcal: 600, kcalMin: 500, kcalMax: 750, prot: 30, carb: 60, fat: 26, confidence: 0.7 }, o);
  let m = n({ dishes: [plat({ name: '  Œuf   parfait,\nchampignons des bois  ' })] });
  v('le nom est gardé tel qu\'écrit (accents), espaces et sauts de ligne resserrés', m.dishes[0].name === 'Œuf parfait, champignons des bois');
  m = n({ dishes: [plat({ name: 'Fish and chips' }), plat({ name: 'Bacalhau à Brás' })] });
  v('  … dans sa langue, sans traduction', m.dishes[0].name === 'Fish and chips' && m.dishes[1].name === 'Bacalhau à Brás');
  m = n({ dishes: [plat({ name: 'Tarte' }), plat({ name: 'tarte' }), plat({ name: '' }), null, 'x'] });
  v('doublons, noms vides et objets de travers retirés', m.dishes.length === 1 && m.dishes[0].id === 1);
  m = n({ dishes: Array.from({ length: 60 }, (_, i) => plat({ name: 'Plat ' + i })) });
  v('au plus 40 plats', m.dishes.length === 40 && m.dishes[39].id === 40);
  m = n({ dishes: [plat({ kcal: 2000, prot: 30, carb: 60, fat: 26 })] });
  v('des calories qui ne collent pas aux macros sont recalées (4P+4G+9L)', m.dishes[0].kcal === 4 * 30 + 4 * 60 + 9 * 26, String(m.dishes[0].kcal));
  m = n({ dishes: [plat({ kcal: 600, prot: 30, carb: 60, fat: 27, kcalMin: 900, kcalMax: 400 })] });
  v('une fourchette à l\'envers se remet dans l\'ordre et contient la valeur', m.dishes[0].kcalMin <= m.dishes[0].kcal && m.dishes[0].kcal <= m.dishes[0].kcalMax, JSON.stringify(m.dishes[0]));
  m = n({ dishes: [plat({ kcal: 600, prot: 30, carb: 60, fat: 27, kcalMin: undefined, kcalMax: 'beaucoup' })] });
  v('une fourchette absente se refait à ±25 %', m.dishes[0].kcalMin === Math.round(m.dishes[0].kcal * 0.75) && m.dishes[0].kcalMax === Math.round(m.dishes[0].kcal * 1.25), JSON.stringify(m.dishes[0]));
  m = n({ dishes: [plat({ kcal: 603, prot: 30, carb: 60, fat: 27, kcalMin: 600, kcalMax: 605 })] });
  v('une fourchette trop étroite s\'élargit à ±10 % au moins', m.dishes[0].kcalMin <= 543 && m.dishes[0].kcalMax >= 663, JSON.stringify(m.dishes[0]));
  m = n({ dishes: [plat({ kcal: 603, prot: 30, carb: 60, fat: 27, kcalMin: 10, kcalMax: 9000 })] });
  v('une fourchette absurde est bornée (×0,4 → ×2)', m.dishes[0].kcalMin >= 241 && m.dishes[0].kcalMax <= 1206, JSON.stringify(m.dishes[0]));
  m = n({ dishes: [plat({ name: 'A', price: 14.5 }), plat({ name: 'B', price: 0 }), plat({ name: 'C' }), plat({ name: 'D', price: 'cher' }), plat({ name: 'E', price: 12000 })] });
  v('le prix : gardé s\'il est un vrai nombre, absent sinon (jamais 0)',
    m.dishes[0].price === 14.5 && !('price' in m.dishes[1]) && !('price' in m.dishes[2]) && !('price' in m.dishes[3]) && !('price' in m.dishes[4]));
  m = n({ dishes: [plat({ section: 'main' }), plat({ name: 'X', section: 'dessert' })] });
  v('une rubrique inconnue devient « autre »', m.dishes[0].section === 'autre' && m.dishes[1].section === 'dessert');
  m = n({ dishes: [plat({ kcal: 0, prot: 0, carb: 0, fat: 0 })] });
  v('un plat sans aucun chiffre ne se garde pas (il ne se classerait pas)', m.dishes.length === 0);
  m = n({ name: ' Chez Paul ', currency: 'eur', dishes: [] });
  v('nom du restaurant et devise (ISO, majuscules)', m.name === 'Chez Paul' && m.currency === 'EUR');
  m = n({ currency: '€', dishes: [] });
  v('  … un symbole n\'est pas un code : pas de devise', !('currency' in m));
  for (const brut of [null, 'carte', 42, { dishes: 'x' }, { dishes: null }]) {
    m = n(brut);
    v('entrée de travers ' + JSON.stringify(brut) + ' → carte vide, sans lever', Array.isArray(m.dishes) && m.dishes.length === 0 && m.positions === false);
  }

  // Les positions : tout ou rien.
  const ligne = (i) => [100 + i * 60, 150, 140 + i * 60, 600];
  m = n({ dishes: [0, 1, 2, 3, 4].map(i => plat({ name: 'P' + i, box: ligne(i) })) });
  v('cinq zones crédibles → gardées, en fractions {x, y, w, h}', m.positions && m.dishes[0].box.x === 0.15 && m.dishes[0].box.y === 0.1 && m.dishes[0].box.w === 0.45 && m.dishes[0].box.h === 0.04,
    JSON.stringify(m.dishes[0].box));
  m = n({ dishes: [0, 1, 2, 3, 4].map(i => plat({ name: 'P' + i, box: i === 2 ? [0, 0, 1000, 1000] : ligne(i) })) });
  v('une zone pleine page est refusée seule ; 4 sur 5 crédibles → positions gardées, celle-là absente',
    m.positions && !m.dishes[2].box && m.dishes[0].box);
  m = n({ dishes: [0, 1, 2, 3, 4].map(i => plat({ name: 'P' + i, box: i < 3 ? undefined : ligne(i) })) });
  v('moins de 60 % de zones → AUCUNE position (liste à la place des cercles)', !m.positions && m.dishes.every(d => !d.box));
  m = n({ dishes: [0, 1, 2, 3].map(i => plat({ name: 'P' + i, box: [100, 150, 140, 600] })) });
  v('quatre plats posés au même endroit → AUCUNE position (le modèle a deviné)', !m.positions && m.dishes.every(d => !d.box));
  m = n({ dishes: [plat({ name: 'A', box: [100, 150, 140, 600] }), plat({ name: 'B', box: [110, 160, 150, 610] })] });
  v('deux zones qui se recouvrent à plus de moitié → AUCUNE position', !m.positions);
  m = n({ dishes: [plat({ name: 'A', box: [300, 150, 100, 600] }), plat({ name: 'B', box: [100, 150, 140, 1200] }), plat({ name: 'C', box: [100, 150, 102, 600] })] });
  v('zones à l\'envers, hors de l\'image ou trop fines → refusées', !m.positions && m.dishes.every(d => !d.box));
  v('`zone` : [ymin, xmin, ymax, xmax] en millièmes → fractions', JSON.stringify(carte.zone([250, 100, 300, 700])) === JSON.stringify({ x: 0.1, y: 0.25, w: 0.6, h: 0.05 }));
}

console.log('\n═══ ④ UN SCHÉMA NEUTRE, UNE ENVELOPPE GEMINI ═══');
{
  const horsSousEnsemble = [];
  const parcourir = (s, chemin) => {
    if (!s || typeof s !== 'object') return;
    for (const k of Object.keys(s)) {
      if (!carte.MOTS_NEUTRES.has(k)) horsSousEnsemble.push(chemin + '.' + k);
      if (k === 'properties') for (const p of Object.keys(s.properties)) parcourir(s.properties[p], chemin + '.' + p);
      else if (k === 'items') parcourir(s.items, chemin + '[]');
    }
  };
  const SCHEMA_REPAS = { type: 'object', properties: { mealName: { type: 'string' }, items: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' } } } } }, required: ['mealName'] };
  parcourir(carte.SCHEMA_CARTE, 'carte');
  parcourir(carte.schemaAuto(SCHEMA_REPAS), 'auto');
  v('les schémas n\'emploient que type/properties/items/required/enum/description (lisibles par Gemini ET par Claude)',
    horsSousEnsemble.length === 0, horsSousEnsemble.join(', '));
  const avant = JSON.stringify(carte.SCHEMA_CARTE);
  const g = carte.pourGemini(carte.SCHEMA_CARTE);
  v('pourGemini ajoute `propertyOrdering` sur une COPIE', JSON.stringify(carte.SCHEMA_CARTE) === avant && g.properties.menu.propertyOrdering.join() === 'name,currency,dishes'
    && g.properties.menu.properties.dishes.items.propertyOrdering[0] === 'name');
  v('  … sans toucher aux noms des champs (un champ nommé « properties » resterait un champ)',
    JSON.stringify(Object.keys(carte.pourGemini({ type: 'object', properties: { properties: { type: 'string' } } }).properties)) === '["properties"]');
  v('corpsGemini : le prompt puis l\'image, JSON imposé, température 0,1',
    (() => { const c = carte.corpsGemini({ prompt: 'p', schema: carte.SCHEMA_CARTE, image: 'abc', mime: 'image/png' });
      return c.contents[0].parts[0].text === 'p' && c.contents[0].parts[1].inline_data.mime_type === 'image/png'
        && c.generationConfig.responseMimeType === 'application/json' && c.generationConfig.temperature === 0.1; })());
  v('texteGemini lit le texte, et rend undefined sur une réponse vide', carte.texteGemini({ candidates: [{ content: { parts: [{ text: 'x' }] } }] }) === 'x' && !carte.texteGemini({}));
  v('le prompt de la carte demande les noms TELS QU\'ÉCRITS et une fourchette', carte.PROMPT_CARTE.includes('EXACTEMENT tel qu\'il est écrit') && carte.PROMPT_CARTE.includes('kcalMin, kcalMax'));
  v('  … et ne demande RIEN de la journée (le choix se fait dans l\'app)', !/reste|séance|objectif/i.test(carte.PROMPT_CARTE));
}

console.log('\n═══ ⑤ LA RÉPONSE D\'ESSAI DE L\'APP EST CELLE DU SERVEUR ═══');
{
  const brut = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'scan-carte', 'gemini-brut.json'), 'utf8'));
  gemini(brut);
  const res = fauxRes();
  await muet(() => scan(fauxReq(ent(), { image: PHOTO, carte: 'auto' }), res));
  const attendu = path.join(__dirname, 'fixtures', 'scan-carte', 'reponse-carte.json');
  if (process.env.ECRIRE_FIXTURE === '1') fs.writeFileSync(attendu, JSON.stringify(res.corps, null, 1) + '\n');
  const fixe = JSON.parse(fs.readFileSync(attendu, 'utf8'));
  v('reponse-carte.json = ce que rend le serveur pour la carte fabriquée (sinon : ECRIRE_FIXTURE=1, puis recopier dans flint-ios)',
    JSON.stringify(fixe) === JSON.stringify(res.corps));
}

global.fetch = vraiFetch;
console.log('\n' + vert + ' vert(s), ' + rouge + ' rouge(s)\n');
process.exitCode = rouge ? 1 : 0;
})();
