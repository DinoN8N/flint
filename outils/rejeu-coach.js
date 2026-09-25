#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   REJOUER LE COACH COMME UN TÉLÉPHONE — `node outils/rejeu-coach.js`

   25 sept. 2026 (S4). Les bancs d'api jouent un FAUX Gemini ; ce rejeu joue
   le VRAI, à travers l'endpoint déployé (production ou préproduction), avec
   une conversation signée comme l'app la signe. Il fait le téléphone : il
   exécute les appels d'outils V1 et V2 à partir de réponses SYNTHÉTIQUES
   (tests/fixtures, personne « Test », aucune donnée réelle), envoie
   `capacites` ou non, et imprime pour chaque aller HTTP : le mode, `v`,
   `appelsGemini` (= `gemini=` au journal), le `parcours` et le `detail` d'une
   panne, et le temps jusqu'au premier `d` du flux.

   ⚠️ CHAQUE QUESTION COÛTE DES REQUÊTES GEMINI SUR LA CLÉ DU DÉPLOIEMENT VISÉ.
   La production est au palier gratuit (20 par jour pour TOUT le monde) : les
   essais se font sur une préproduction qui a sa propre clé. Le total est
   imprimé à la fin.

   Usage :
     FLINT_COACH_CLE=… FLINT_COACH_SIG_CLE=… node outils/rejeu-coach.js [options] ["question"]

     --url URL          l'endpoint (défaut : $FLINT_COACH_URL, sinon la production)
     --sonde            une question, sans capacites ; vérifie que `v` vaut la
                        COACH_VERSION de CET arbre et que /manifeste.json n'a pas
                        reculé sous celui de cet arbre (après chaque déploiement)
     --cinq             les cinq questions types, chacune dans un fil neuf ; chrono
                        du premier `d`
     --v2               l'app v2 : capacites + instantané + part native (fixtures)
     --sans-instantane  avec --v2 : capacites, mais instantané absent (moteur en retard)
     --ancien           d'abord trois VRAIES questions V1 qui appellent un outil,
                        puis la question (avec --v2 : un fil V1 sous déclarations V2)
     --fil FICHIER      commence depuis ce fil (un tableau `contents` rangé par l'app)
     --json             ne demande pas le flux
     --langue fr|en|es  (défaut fr)     --appareil ID  (défaut $FLINT_COACH_DEVICE)

   Environnement :
     FLINT_COACH_CLE      l'en-tête x-flint-key de l'app
     FLINT_COACH_SIG_CLE  le secret de signature (COACH_SIG_SECRET du serveur)
     FLINT_VERCEL_BYPASS  facultatif : jeton de contournement d'une préproduction protégée

   Aucune clé n'est écrite dans ce fichier : il est servi tel quel par Vercel,
   comme tout le dépôt.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const RACINE = path.join(__dirname, '..');
const PROD = 'https://flint-demo-eta.vercel.app/api/coach';
const REPONSES_V1 = require(path.join(RACINE, 'tests', 'fixtures', 'precharge-v1.json'));
const INSTANTANE = require(path.join(RACINE, 'tests', 'fixtures', 'instantane-synthetique.json'));
const NATIF = require(path.join(RACINE, 'tests', 'fixtures', 'natif-synthetique.json'));

const CINQ = [
  'Pourquoi ma récup est à ce niveau aujourd\'hui ?',
  'Analyse mon foot d\'hier',
  'Qu\'est-ce que je mange ce soir ?',
  'Comment est mon sommeil cette semaine ?',
  'Comment la récup est calculée ?'
];
// Des questions qui DEMANDENT une donnée hors préchargement : le modèle doit
// appeler un vrai outil, avec une vraie thoughtSignature (--ancien).
const ANCIENNES = [
  'Montre-moi mes 14 dernières nuits, une par une.',
  'Liste mes séances des 10 derniers jours.',
  'Quel style de coach ai-je choisi ?'
];

// ── Les arguments ─────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const opt = { url: process.env.FLINT_COACH_URL || PROD, langue: 'fr', appareil: process.env.FLINT_COACH_DEVICE || 'rejeu-coach',
              sonde: false, cinq: false, v2: false, sansInst: false, ancien: false, fil: null, json: false, questions: [] };
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--url') opt.url = args[++i];
  else if (a === '--langue') opt.langue = args[++i];
  else if (a === '--appareil') opt.appareil = args[++i];
  else if (a === '--fil') opt.fil = args[++i];
  else if (a === '--sonde') opt.sonde = true;
  else if (a === '--cinq') opt.cinq = true;
  else if (a === '--v2') opt.v2 = true;
  else if (a === '--sans-instantane') opt.sansInst = true;
  else if (a === '--ancien') opt.ancien = true;
  else if (a === '--json') opt.json = true;
  else if (a === '-h' || a === '--help') { console.log(fs.readFileSync(__filename, 'utf8').split('*/')[0]); process.exit(0); }
  else if (a.startsWith('--')) { console.error('option inconnue : ' + a); process.exit(2); }
  else opt.questions.push(a);
}
const CLE = process.env.FLINT_COACH_CLE;
const SIG = process.env.FLINT_COACH_SIG_CLE;
if (!CLE || !SIG) {
  console.error('✗ FLINT_COACH_CLE (x-flint-key) et FLINT_COACH_SIG_CLE (secret de signature) sont requis.');
  process.exit(2);
}

// ── Le téléphone : les réponses d'outils ─────────────────────────────────
function jourDe(a) { return Number.isFinite(a && a.jour) ? a.jour : 0; }
function executer(appel) {
  const n = appel.name, a = appel.args || {};
  if (Object.prototype.hasOwnProperty.call(REPONSES_V1, n) && n !== '_note') {
    if (n === 'setCoachPreferences') return { ton: a.ton || 'aucun', qualite: 'good' };
    return REPONSES_V1[n];
  }
  const I = INSTANTANE;
  switch (n) {
    case 'getDay': return { jour: jourDe(a), date: I.meta.jour, recup: I.recup, nuit: I.nuit, signaux: I.signaux,
                            effort: I.effort, nutrition: I.nutrition, q: 'good' };
    case 'getHistory': return { colonnes: a.colonnes || ['recup'], semaine: I.semaine, q: 'good' };
    case 'getTrend': return { cle: a.cle || 'recup', periode: a.periode || 'M', points: [61, 64, 70, 68, 72, 74], q: 'good' };
    case 'getSessions': return { seances: I.seances, q: 'good' };
    case 'getSession': return { seance: I.seances, q: 'good' };
    case 'getDevice': return { bracelet: NATIF.bracelet, reveil: NATIF.reveil, q: 'good' };
    case 'getPastThread': return { resultats: [], q: 'good' };
    default: return { q: 'inconnu' };   // ce que rend le répartiteur de l'app
  }
}

// ── L'appel signé ─────────────────────────────────────────────────────────
let appelsHttp = 0, totalGemini = 0;
function signer(octets) {
  const ts = String(Date.now());
  const empreinte = crypto.createHash('sha256').update(octets).digest('hex');
  const sig = crypto.createHmac('sha256', SIG).update(opt.appareil + '.' + ts + '.' + empreinte).digest('hex');
  return { ts, sig };
}

async function lireFlux(r) {
  const lecteur = r.body.getReader();
  const dec = new TextDecoder();
  let tampon = '', premierD = null;
  const evs = [];
  const traiter = (bloc) => {
    for (const ligne of bloc.split('\n')) {
      if (!ligne.startsWith('data:')) continue;
      let o; try { o = JSON.parse(ligne.slice(5).trim()); } catch (e) { continue; }
      if ('d' in o && premierD === null) premierD = Date.now();
      evs.push(o);
    }
  };
  for (;;) {
    const { done, value } = await lecteur.read();
    if (done) break;
    tampon += dec.decode(value, { stream: true }).replace(/\r\n?/g, '\n');
    let i;
    while ((i = tampon.indexOf('\n\n')) >= 0) { traiter(tampon.slice(0, i)); tampon = tampon.slice(i + 2); }
  }
  if (tampon.trim()) traiter(tampon);
  return { evs, premierD };
}

async function appeler(corps) {
  const octets = Buffer.from(JSON.stringify(corps), 'utf8');
  const { ts, sig } = signer(octets);
  const h = { 'Content-Type': 'application/octet-stream', 'x-flint-key': CLE, 'x-flint-device': opt.appareil,
              'x-flint-ts': ts, 'x-flint-sig': sig };
  if (process.env.FLINT_VERCEL_BYPASS) h['x-vercel-protection-bypass'] = process.env.FLINT_VERCEL_BYPASS;
  const t0 = Date.now();
  appelsHttp++;
  const r = await fetch(opt.url, { method: 'POST', headers: h, body: octets });
  const type = r.headers.get('content-type') || '';
  if (type.includes('text/event-stream') && r.ok) {
    const { evs, premierD } = await lireFlux(r);
    const fin = (evs.find((e) => e.fin) || {}).fin || null;
    const erreur = (evs.find((e) => e.erreur) || {}).erreur || null;
    return { statut: r.status, sse: true, corps: fin, erreur, ms: Date.now() - t0, premierD, t0 };
  }
  const texte = await r.text();
  let corpsJ = null; try { corpsJ = JSON.parse(texte); } catch (e) { corpsJ = { brut: texte.slice(0, 200) }; }
  return { statut: r.status, sse: false, corps: corpsJ, erreur: r.ok ? null : (corpsJ && corpsJ.error), ms: Date.now() - t0, premierD: null, t0 };
}

// ── Une question, jouée jusqu'à sa réponse ───────────────────────────────
function corpsDeBase() {
  const base = { deviceId: opt.appareil, langue: opt.langue, ton: 'analytique' };
  if (!opt.json) base.flux = true;
  if (!opt.v2) {
    // L'app déjà posée : le briefing de la pastille et la mémoire d'avant.
    return Object.assign(base, { profilTexte: 'Test, 29 ans, 76,4 kg. Récupération 74/100.',
                                 memoireTexte: '· prépare un 10 km en octobre\n· déteste le poisson' });
  }
  const inst = opt.sansInst ? null : INSTANTANE;
  Object.assign(base, { capacites: { instantane: 1, outils: 1, natif: 1, memo: 1 }, instantane: inst, natif: NATIF,
                        faits: '· (12 sept.) [objectif] prépare un 10 km en octobre\n· (2 sept.) [preference] déteste le poisson',
                        memos: [] });
  if (!inst) base.profilTexte = 'Test, 29 ans, 76,4 kg. Récupération 74/100.';
  return base;
}

const MAX_ALLERS = 6;   // l'app en permet 1 question + 4 tours d'outils ; un de plus pour voir une boucle

async function poser(question, historique, v) {
  const contents = historique.concat([{ role: 'user', parts: [{ text: question }] }]);
  const base = corpsDeBase();
  const tQ = Date.now();
  let ttft = null, gemini = 0, allers = 0, texte = null, ok = true, toursOutils = 0;
  console.log('\n▶ ' + question);
  for (let n = 1; n <= MAX_ALLERS; n++) {
    allers++;
    const r = await appeler(Object.assign({}, base, { contents }));
    const c = r.corps || {};
    const g = Number.isFinite(c.appelsGemini) ? c.appelsGemini : null;
    if (g !== null) gemini += g;
    if (r.premierD && ttft === null) ttft = r.premierD - tQ;
    const morceaux = ['  #' + n, 'HTTP ' + r.statut, r.sse ? 'flux' : 'json', 'mode=' + (c.mode || '-'), 'v=' + (c.v || '-'),
                      'gemini=' + (g === null ? '?' : g), r.ms + ' ms'];
    if (r.premierD) morceaux.push('1er d à ' + (r.premierD - r.t0) + ' ms');
    if (c.appels) morceaux.push('appels=' + c.appels.map((a) => a.name).join(','));
    if (c.parcours && c.parcours.length) morceaux.push('parcours=' + c.parcours.join(' '));
    if (c.detail) morceaux.push('detail=' + String(c.detail).slice(0, 240).replace(/\s+/g, ' '));
    if (r.erreur) morceaux.push('erreur=' + r.erreur);
    console.log(morceaux.join('  '));
    if (v) v(c);
    if (r.statut !== 200 || r.erreur || !c.mode) { ok = false; break; }
    contents.push(c.tourModele);
    if (c.mode === 'reponse') {
      texte = c.texte;
      if (c.memo) console.log('     memo : ' + JSON.stringify(c.memo));
      if (c.retenir && c.retenir.length) console.log('     retenir : ' + JSON.stringify(c.retenir));
      break;
    }
    const marque = c.tourModele && c.tourModele.parts && c.tourModele.parts[0] && typeof c.tourModele.parts[0].text === 'string'
      && c.tourModele.parts[0].text.startsWith('⟦flint-pre');
    if (!marque) toursOutils++;
    contents.push({ role: 'function', parts: c.appels.map((a) => ({ functionResponse: { name: a.name, response: executer(a) } })) });
    if (n === MAX_ALLERS) ok = false;
  }
  if (texte !== null) console.log('     « ' + texte.replace(/\s+/g, ' ').slice(0, 220) + (texte.length > 220 ? '… »' : ' »'));
  const total = Date.now() - tQ;
  totalGemini += gemini;
  console.log('     → ' + allers + ' aller(s) HTTP, gemini=' + gemini + ', vrais tours d\'outils=' + toursOutils
              + ', premier mot ' + (ttft === null ? '—' : (ttft / 1000).toFixed(1) + ' s') + ', total ' + (total / 1000).toFixed(1) + ' s'
              + (ok ? '' : '  ✗'));
  return { ok, contents, allers, gemini, ttft, total, toursOutils, question };
}

// ── Les modes ─────────────────────────────────────────────────────────────
function versionLocale() {
  // La constante de CET arbre, lue dans le source (pas de require : rien à charger).
  const m = fs.readFileSync(path.join(RACINE, 'api', 'coach.js'), 'utf8').match(/const COACH_VERSION = '([^']+)'/);
  return m ? m[1] : null;
}

async function sonde() {
  const attendue = versionLocale();
  const vues = new Set();
  const r = await poser(opt.questions[0] || 'Comment je vais aujourd\'hui ?', [], (c) => { if (c.v) vues.add(c.v); });
  let bon = r.ok;
  const vOk = vues.size === 1 && vues.has(attendue);
  console.log((vOk ? '✓' : '✗') + ' v servie : ' + ([...vues].join(', ') || '—') + ' — attendue ' + attendue);
  bon = bon && vOk;
  // Le manifeste OTA ne doit pas avoir reculé : même projet Vercel pour l'api et le canal.
  const origine = new URL(opt.url).origin;
  const locale = JSON.parse(fs.readFileSync(path.join(RACINE, 'manifeste.json'), 'utf8')).version;
  try {
    const h = process.env.FLINT_VERCEL_BYPASS ? { 'x-vercel-protection-bypass': process.env.FLINT_VERCEL_BYPASS } : {};
    const m = await (await fetch(origine + '/manifeste.json', { headers: h, cache: 'no-store' })).json();
    const mOk = Number(m.version) >= Number(locale);
    console.log((mOk ? '✓' : '✗') + ' manifeste.json servi : version ' + m.version + ' — cet arbre : ' + locale);
    bon = bon && mOk;
  } catch (e) {
    console.log('✗ manifeste.json illisible : ' + (e && e.message));
    bon = false;
  }
  return bon;
}

async function cinq() {
  const res = [];
  for (const q of CINQ) res.push(await poser(q, [], null));
  console.log('\n═══ LES CINQ QUESTIONS ═══');
  for (const r of res) {
    console.log((r.ok ? '✓' : '✗') + '  ' + r.question.padEnd(48) + '  allers ' + r.allers + '  gemini ' + r.gemini
                + '  premier mot ' + (r.ttft === null ? '—' : (r.ttft / 1000).toFixed(1) + ' s').padStart(6));
  }
  const ttfts = res.filter((r) => r.ttft !== null).map((r) => r.ttft / 1000);
  if (ttfts.length) console.log('   premier mot : médiane ' + ttfts.sort((a, b) => a - b)[Math.floor(ttfts.length / 2)].toFixed(1)
                                + ' s, pire ' + Math.max(...ttfts).toFixed(1) + ' s (avant S4 : 9–15 s)');
  return res.every((r) => r.ok);
}

(async () => {
  console.log('Endpoint : ' + opt.url + '  ·  appareil ' + opt.appareil + '  ·  ' + (opt.v2 ? 'app v2' + (opt.sansInst ? ' sans instantané' : '') : 'app déjà posée (sans capacites)')
              + (opt.json ? '  ·  JSON' : '  ·  flux'));
  let bon = true;
  if (opt.sonde) {
    const v2 = opt.v2; opt.v2 = false;   // la sonde joue l'app déjà posée
    bon = await sonde();
    opt.v2 = v2;
  } else if (opt.cinq) {
    bon = await cinq();
  } else {
    let historique = opt.fil ? JSON.parse(fs.readFileSync(opt.fil, 'utf8')) : [];
    if (!Array.isArray(historique)) { console.error('✗ --fil : il faut un tableau `contents`'); process.exit(2); }
    if (opt.ancien) {
      // Les échanges d'avant se jouent en V1 (l'app déjà posée), pour de vrai.
      const v2 = opt.v2; opt.v2 = false;
      let vrais = 0;
      for (const q of ANCIENNES) { const r = await poser(q, historique, null); historique = r.contents; vrais += r.toursOutils; if (!r.ok) bon = false; }
      opt.v2 = v2;
      console.log('\n   fil d\'avant : ' + vrais + ' vrai(s) tour(s) d\'outils V1' + (vrais < 3 ? ' — moins de trois, le cas (b) n\'est pas complet' : ''));
    }
    const qs = opt.questions.length ? opt.questions : ['Comment je vais aujourd\'hui ?'];
    for (const q of qs) { const r = await poser(q, historique, null); historique = r.contents; if (!r.ok) bon = false; }
  }
  console.log('\n' + appelsHttp + ' appel(s) HTTP, ' + totalGemini + ' requête(s) Gemini au total.' + (bon ? '' : '  ✗ ÉCHEC'));
  process.exitCode = bon ? 0 : 1;
})().catch((e) => { console.error('✗ ' + (e && e.stack || e)); process.exitCode = 1; });
