#!/usr/bin/env node
'use strict';
/* ═══════════════════════════════════════════════════════════════════════════
   L'ESSAI DU SERVEUR — le jour de la bascule ne doit pas être un saut dans le vide
   (17 nov. 2026)

     node outils/essai-serveur.js <URL de base>        contre un déploiement
     node outils/essai-serveur.js --sec                à blanc, ici, sans réseau

   Contre un déploiement (une « Preview » Vercel d'abord, la production ensuite),
   l'essai joue une vingtaine de vraies requêtes, comme l'app les envoie, et
   juge chaque réponse : la porte (clé d'app, en-tête d'appareil, CORS), le
   Coach (question simple, question « chiffre », flux SSE, tours d'outils), le
   scan (photo de repas, étiquette, carte de resto, description texte), et la
   suppression de compte (SEULEMENT ses refus : aucun code Apple n'est envoyé).
   Il rend un tableau ✅ / ❌, un code de sortie et une phrase.

   Les secrets se lisent dans l'environnement de CE Mac, jamais dans le dépôt,
   et ne s'impriment jamais (ils sont masqués dans tout ce qui s'affiche) :
     FLINT_APP_SECRET          la clé d'app (en-tête x-flint-key)
     COACH_SIG_SECRET          le secret de signature du Coach (x-flint-sig)
     VERCEL_PROTECTION_BYPASS  facultatif : le jeton « Protection Bypass for
                               Automation » si la Preview est protégée
   Sans FLINT_APP_SECRET, l'essai le dit et ne teste que la porte.

   Options :
     --attendu anthropic|gemini   le fournisseur qui DOIT répondre (défaut :
                                  anthropic, c'est la bascule qu'on vérifie)
     --reference <URL>            compare le web OTA servi (sw.js, manifeste.json)
                                  à celui d'un autre déploiement (la production) :
                                  un déploiement qui le changerait reculerait ou
                                  avancerait l'app de TOUT le monde
     --sec                        à blanc : le VRAI code de api/ tourne ici, dans
                                  un petit serveur local, devant de FAUX modèles ;
                                  toute requête vers l'extérieur est refusée et
                                  comptée (une seule = ❌)
     --gemini                     avec --sec : le serveur sans les variables de
                                  bascule (le chemin Gemini d'aujourd'hui)
     --journal                    avec --sec : affiche le journal du serveur

   Codes de sortie : 0 tout marche · 1 quelque chose casse · 2 mauvais usage ·
                     3 incomplet (pas de clé d'app : seule la porte est testée).

   Coût d'un passage réel sur Claude : environ 10 appels au modèle (Coach ≈ 6,
   scan ≈ 4), de l'ordre de 0,20 à 0,40 $ selon le modèle. Rien n'est écrit
   côté serveur : le Coach est sans état, le scan ne garde rien.
   ═══════════════════════════════════════════════════════════════════════════ */

const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const path = require('path');

const RACINE = path.join(__dirname, '..');
const IMAGES = path.join(__dirname, 'essai');
const vraiFetch = globalThis.fetch;

// ── Ce que l'app tolère (flint-ios, branche integration-v3107) ──────────────
// CoachReseau.delaiMaxS = 45 : `timeoutInterval` d'URLRequest, un délai SANS
// OCTET REÇU. Un flux muet plus de 45 s = « Flint met trop de temps ».
const DELAI_APP_COACH_S = Number(process.env.ESSAI_DELAI_COACH_S) || 45;
const DELAI_APP_SCAN_S = 180;        // AnalyseRepasNatif.delai
const DELAI_APP_ETIQUETTE_S = 90;    // LectureEtiquette.delai
const TOURS_OUTILS_APP = 4;          // CoachReseau.maxToursOutils
const DELAI_REQUETE_MS = 175000;     // au-delà, l'essai abandonne la requête

// ── Ce que montrent les images dessinées (outils/essai/fabriquer-images.swift) ─
const ATTENDU_ETIQUETTE = { kcal: 372, fat: 6.2, satfat: 1.1, carb: 64, sugars: 21, fiber: 8.5, prot: 9.8, salt: 0.12 };
const ATTENDU_PORTION_G = 40;
const ATTENDU_CARTE = ['Salade de chèvre chaud', 'Velouté de potiron', 'Entrecôte, frites maison',
                       'Pavé de saumon, riz et brocolis', 'Crème brûlée', 'Mousse au chocolat'];

function lireImage(nom) { return fs.readFileSync(path.join(IMAGES, nom)).toString('base64'); }

// ═══ Les petites aides ══════════════════════════════════════════════════════

/** JSON aux clés triées, comme `JSONSerialization(.sortedKeys)` de l'app. */
function canonique(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(canonique).join(',') + ']';
  return '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + canonique(v[k])).join(',') + '}';
}
const sha256 = (b) => crypto.createHash('sha256').update(b).digest('hex');
const sansAccent = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const secondes = (ms) => (ms / 1000).toFixed(1).replace('.', ',') + ' s';

// ═══ Le client ══════════════════════════════════════════════════════════════

function creerClient({ base, secrets, attendu }) {
  const device = 'ESSAI-' + crypto.randomBytes(6).toString('hex').toUpperCase();
  const vus = { acaoEtoile: [], sansNoStore: [], fuites: [], protection: false };
  const aMasquer = [secrets.app, secrets.sig, secrets.bypass].filter((s) => typeof s === 'string' && s.length >= 4);
  const masquer = (t) => aMasquer.reduce((s, k) => s.split(k).join('[secret]'), String(t == null ? '' : t))
    .replace(/sk-ant-[A-Za-z0-9_-]+/g, '[clé]').replace(/AIza[0-9A-Za-z_-]{20,}/g, '[clé]');
  // Ce qui ressemble à une clé de modèle n'a rien à faire dans une réponse.
  const MOTIFS_CLE = [/sk-ant-[A-Za-z0-9_-]{6,}/, /AIza[0-9A-Za-z_-]{20,}/];

  function inspecter(chemin, r) {
    const acao = r.entetes['access-control-allow-origin'];
    if (acao === '*') vus.acaoEtoile.push(chemin);
    if (r.statut && chemin.startsWith('/api/') && !/no-store/.test(r.entetes['cache-control'] || '')) vus.sansNoStore.push(chemin + ' ' + r.statut);
    const tout = JSON.stringify(r.entetes) + '\n' + r.texte;
    for (const s of aMasquer) if (tout.includes(s)) vus.fuites.push(chemin + ' : un secret de ce Mac revient dans la réponse');
    for (const m of MOTIFS_CLE) if (m.test(tout)) vus.fuites.push(chemin + ' : une clé de modèle (' + m.source.slice(0, 6) + '…) dans la réponse');
    const type = r.entetes['content-type'] || '';
    if ((r.statut === 401 || r.statut === 403) && /text\/html/.test(type)) vus.protection = true;
  }

  /** Une requête. `sse` : lit le corps au fil de l'eau et mesure les silences. */
  async function appeler(chemin, { methode = 'POST', entetes = {}, corps, sse = false } = {}) {
    const h = Object.assign({}, entetes);
    if (secrets.bypass) h['x-vercel-protection-bypass'] = secrets.bypass;
    const ctrl = new AbortController();
    const minuteur = setTimeout(() => ctrl.abort(), DELAI_REQUETE_MS);
    const t0 = Date.now();
    const sortie = { statut: 0, entetes: {}, texte: '', json: null, ms: 0, premierOctetMs: null, silenceMaxMs: 0, erreur: null };
    try {
      const r = await vraiFetch(base + chemin, { method: methode, headers: h, body: corps, signal: ctrl.signal });
      sortie.statut = r.status;
      r.headers.forEach((v, k) => { sortie.entetes[k.toLowerCase()] = v; });
      // Le silence le plus long compte depuis l'ENVOI : c'est ce que voit l'app.
      let dernier = t0;
      const morceaux = [];
      if (r.body) {
        const lecteur = r.body.getReader();
        for (;;) {
          const { done, value } = await lecteur.read();
          if (done) break;
          const t = Date.now();
          if (sortie.premierOctetMs == null) sortie.premierOctetMs = t - t0;
          sortie.silenceMaxMs = Math.max(sortie.silenceMaxMs, t - dernier);
          dernier = t;
          morceaux.push(Buffer.from(value));
        }
      }
      sortie.silenceMaxMs = Math.max(sortie.silenceMaxMs, Date.now() - dernier);
      sortie.texte = Buffer.concat(morceaux).toString('utf8');
      if (!sse || !/event-stream/.test(sortie.entetes['content-type'] || '')) {
        try { sortie.json = JSON.parse(sortie.texte); } catch (e) { sortie.json = null; }
      }
    } catch (e) {
      sortie.erreur = e && e.name === 'AbortError' ? `aucune réponse en ${DELAI_REQUETE_MS / 1000} s` : masquer((e && e.message) || e);
    } finally {
      clearTimeout(minuteur);
      sortie.ms = Date.now() - t0;
    }
    inspecter(chemin, sortie);
    return sortie;
  }

  // ── Le Coach, comme CoachReseau.swift l'appelle ──────────────────────────
  function corpsCoach({ contents, flux, chiffre }) {
    const o = {
      deviceId: device, langue: 'fr', ton: 'aucun', flux: !!flux, echelleStress: 100,
      capacites: { instantane: 1, outils: 1, natif: 1, memo: 1, etapes: 1 },
      instantane: null, natif: { q: 'invalide' }, faits: '', memos: [],
      // Le « / » est voulu : JSONSerialization l'échappe, JSON.stringify non,
      // et c'est ce qui avait fait refuser la signature le 23 sept.
      profilTexte: 'Essai automatique du serveur, pas une vraie personne. Aucune donnée (score 0/100).',
      contents
    };
    if (chiffre) o.chiffre = chiffre;
    return o;
  }
  function entetesCoach(octets, options = {}) {
    const h = { 'Content-Type': 'application/octet-stream', 'x-flint-device': device };
    if (secrets.app) h['x-flint-key'] = secrets.app;
    if (secrets.sig) {
      const ts = String(Date.now());
      h['x-flint-ts'] = ts;
      h['x-flint-sig'] = options.fausseSignature ? 'f'.repeat(64)
        : crypto.createHmac('sha256', secrets.sig).update(device + '.' + ts + '.' + sha256(octets)).digest('hex');
    }
    return h;
  }
  async function appelerCoach(corps, options) {
    const octets = Buffer.from(canonique(corps), 'utf8');
    return appeler('/api/coach', { entetes: entetesCoach(octets, options), corps: octets, sse: !!corps.flux });
  }
  async function appelerScan(corps, entetes) {
    const h = Object.assign({ 'Content-Type': 'application/json', 'x-flint-device': device }, entetes || {});
    if (secrets.app && !('x-flint-key' in h)) h['x-flint-key'] = secrets.app;
    for (const k of Object.keys(h)) if (h[k] === null) delete h[k];
    return appeler('/api/scan-meal', { entetes: h, corps: JSON.stringify(corps) });
  }

  return { device, vus, masquer, appeler, corpsCoach, appelerCoach, appelerScan, base, attendu };
}

/** Les événements `data:` d'un corps SSE. */
function lireSSE(texte) {
  const evs = [];
  for (const bloc of String(texte).replace(/\r\n?/g, '\n').split('\n\n')) {
    for (const l of bloc.split('\n')) {
      if (!l.startsWith('data:')) continue;
      try { evs.push(JSON.parse(l.slice(5).trim())); } catch (e) { evs.push({ illisible: l.slice(0, 80) }); }
    }
  }
  return evs;
}

// ═══ La suite ═══════════════════════════════════════════════════════════════

async function jouerSuite({ base, secrets, attendu, reference, sec }) {
  const lignes = [];
  const c = creerClient({ base, secrets, attendu });
  const noter = (groupe, nom, etat, detail, ms) => lignes.push({ groupe, nom, etat, detail: c.masquer(detail || ''), ms });
  const ok = (g, n, d, ms) => noter(g, n, 'ok', d, ms);
  const ko = (g, n, d, ms) => noter(g, n, 'ko', d, ms);
  const alerte = (g, n, d, ms) => noter(g, n, 'alerte', d, ms);
  const saute = (g, n, d) => noter(g, n, 'saute', d);
  const extrait = (r) => r.erreur ? r.erreur : `HTTP ${r.statut} ${(r.json && (r.json.error || r.json.detail)) ? '« ' + String(r.json.error || '') + (r.json.detail ? ' — ' + String(r.json.detail).slice(0, 160) : '') + ' »' : String(r.texte).slice(0, 120).replace(/\s+/g, ' ')}`;
  const jsonErreur = (r) => r.json && typeof r.json.error === 'string';

  // ── A. Le site et le web OTA ─────────────────────────────────────────────
  const sw = await c.appeler('/sw.js', { methode: 'GET' });
  if (sw.erreur) {
    ko('site', 'le déploiement est joignable', sw.erreur + ' — l\'adresse est-elle juste ? (copie-la depuis le tableau de bord Vercel, sans /api à la fin)');
    return { lignes, client: c, arret: true };
  }
  if (c.vus.protection) {
    ko('site', 'la Preview est joignable', 'Vercel répond par sa page de protection (HTTP ' + sw.statut + ', HTML). Pose VERCEL_PROTECTION_BYPASS sur ce Mac (tableau de bord → Settings → Deployment Protection → Protection Bypass for Automation), puis relance.');
    return { lignes, client: c, arret: true };
  }
  const versionSw = (sw.texte.split('\n')[0] || '').trim();
  if (sw.statut === 200 && versionSw) ok('site', 'le web OTA est servi (sw.js)', versionSw.slice(0, 90), sw.ms);
  else ko('site', 'le web OTA est servi (sw.js)', extrait(sw), sw.ms);
  const man = await c.appeler('/manifeste.json', { methode: 'GET' });
  if (man.statut === 200 && man.json && man.json.fichiers) ok('site', 'le manifeste OTA est servi', 'depuis ' + (man.json.depuis || '?') + ' · ' + Object.keys(man.json.fichiers).length + ' fichiers', man.ms);
  else ko('site', 'le manifeste OTA est servi', extrait(man), man.ms);
  if (reference) {
    const cr = creerClient({ base: reference, secrets: { bypass: secrets.bypassReference }, attendu });
    const [sw2, man2] = [await cr.appeler('/sw.js', { methode: 'GET' }), await cr.appeler('/manifeste.json', { methode: 'GET' })];
    const pareil = sw2.statut === 200 && man2.statut === 200 && sw2.texte === sw.texte && sha256(man2.texte) === sha256(man.texte);
    if (pareil) ok('site', 'même web OTA que la référence', reference);
    else ko('site', 'même web OTA que la référence', `la référence sert « ${(sw2.texte.split('\n')[0] || '').slice(0, 60)} » (manifeste ${sha256(man2.texte).slice(0, 8)}), ce déploiement « ${versionSw.slice(0, 60)} » (manifeste ${sha256(man.texte).slice(0, 8)}) : déployer CHANGERAIT l'app de tout le monde`);
  }

  // ── B. La porte (aucune clé nécessaire) ──────────────────────────────────
  for (const [chemin, nom] of [['/api/coach', 'Coach'], ['/api/scan-meal', 'scan'], ['/api/apple-revocation', 'suppression de compte']]) {
    const g = await c.appeler(chemin, { methode: 'GET' });
    if (g.statut === 405) ok('porte', `${nom} : la fonction existe (GET → 405)`, '', g.ms);
    else ko('porte', `${nom} : la fonction existe (GET → 405)`, g.statut === 404 ? 'HTTP 404 : la fonction n\'est pas déployée' : extrait(g), g.ms);
    const r = await c.appeler(chemin, { entetes: { 'Content-Type': 'application/json', 'x-flint-device': c.device }, corps: '{}' });
    if (r.statut === 401 && jsonErreur(r)) ok('porte', `${nom} : sans clé d'app → 401`, '', r.ms);
    else if (r.statut === 503) ko('porte', `${nom} : sans clé d'app → 401`, 'HTTP 503 : FLINT_APP_SECRET n\'est pas posée sur ce déploiement', r.ms);
    else ko('porte', `${nom} : sans clé d'app → 401`, r.statut === 400 ? 'HTTP 400 : la porte est OUVERTE (FLINT_APP_SECRET absente côté serveur ?) — ' + extrait(r) : extrait(r), r.ms);
    const d = await c.appeler(chemin, { entetes: { 'Content-Type': 'application/json', 'x-flint-device': 'pas un appareil !' }, corps: '{}' });
    if (d.statut === 400 && jsonErreur(d)) ok('porte', `${nom} : mauvais en-tête d'appareil → 400`, '', d.ms);
    else ko('porte', `${nom} : mauvais en-tête d'appareil → 400`, extrait(d), d.ms);
  }
  const pre = await c.appeler('/api/scan-meal', { methode: 'OPTIONS', entetes: { Origin: 'https://exemple.invalid', 'Access-Control-Request-Method': 'POST' } });
  if ((pre.entetes['access-control-allow-origin'] || '') === '') ok('porte', 'scan : aucun site web autorisé (CORS fermé)', 'OPTIONS → ' + pre.statut, pre.ms);
  else ko('porte', 'scan : aucun site web autorisé (CORS fermé)', 'Access-Control-Allow-Origin: ' + pre.entetes['access-control-allow-origin'], pre.ms);

  if (!secrets.app) {
    const pourquoi = 'FLINT_APP_SECRET n\'est pas posée sur ce Mac : seule la porte est testée';
    for (const n of ['Coach', 'scan', 'suppression de compte']) saute(n === 'Coach' ? 'coach' : n === 'scan' ? 'scan' : 'compte', n + ' : non essayé', pourquoi);
    return { lignes, client: c, incomplet: true };
  }

  // ── E. La suppression de compte : seulement ses refus ────────────────────
  const sansCode = await c.appeler('/api/apple-revocation', { entetes: { 'Content-Type': 'application/json', 'x-flint-device': c.device, 'x-flint-key': secrets.app }, corps: '{}' });
  if (sansCode.statut === 400 && jsonErreur(sansCode)) ok('compte', 'avec la clé mais sans code Apple → 400', '(aucun code envoyé : rien n\'est révoqué)', sansCode.ms);
  else if (sansCode.statut === 401) ko('compte', 'avec la clé mais sans code Apple → 400', 'HTTP 401 : la clé d\'app de ce Mac n\'est pas celle du serveur', sansCode.ms);
  else ko('compte', 'avec la clé mais sans code Apple → 400', extrait(sansCode), sansCode.ms);

  // ── C et D en parallèle : le Coach et le scan ─────────────────────────────
  await Promise.all([essaisCoach(c, { ok, ko, alerte, saute, extrait }, secrets, attendu),
                     essaisScan(c, { ok, ko, alerte, saute, extrait }, attendu)]);
  return { lignes, client: c };
}

// ── C. Le Coach ────────────────────────────────────────────────────────────
async function conversation(c, { question, flux, chiffre }) {
  const contents = [{ role: 'user', parts: [{ text: question }] }];
  const appels = [];
  let tours = 0, total = 0, silenceMax = 0, premierTexte = null, etapes = 0, sse = 0;
  for (;;) {
    const r = await c.appelerCoach(c.corpsCoach({ contents, flux, chiffre }));
    total += r.ms;
    silenceMax = Math.max(silenceMax, r.silenceMaxMs);
    appels.push(r);
    if (r.erreur || r.statut !== 200) return { r, raison: 'réponse ' + (r.erreur || 'HTTP ' + r.statut), appels, total, silenceMax };
    let rep = r.json;
    const estFlux = /event-stream/.test(r.entetes['content-type'] || '');
    let morceaux = '';
    // Comme l'app : c'est le type de contenu de la RÉPONSE qui tranche. Un
    // tour d'outils pré-chargé (Gemini) revient en JSON même en flux.
    if (flux && estFlux) {
      const evs = lireSSE(r.texte);
      const err = evs.find((e) => typeof e.erreur === 'string');
      if (err) return { r, raison: 'le flux dit « ' + err.erreur + ' »', appels, total, silenceMax };
      morceaux = evs.filter((e) => typeof e.d === 'string').map((e) => e.d).join('');
      etapes += evs.filter((e) => typeof e.etape === 'string').length;
      const fin = evs.find((e) => e.fin && typeof e.fin === 'object');
      if (!fin) return { r, raison: 'flux clos sans « fin » (l\'app affiche une panne)', appels, total, silenceMax };
      if (morceaux && premierTexte == null) premierTexte = total - r.ms + (r.premierOctetMs || 0);
      rep = fin.fin;
      sse++;
    } else if (!rep) {
      return { r, raison: 'réponse illisible (pas du JSON)', appels, total, silenceMax };
    }
    if (!rep.tourModele || typeof rep.tourModele !== 'object' || !Array.isArray(rep.tourModele.parts)) {
      return { r, raison: 'pas de « tourModele » lisible : l\'app lève « réponse mal formée »', appels, total, silenceMax };
    }
    if (rep.mode === 'outils') {
      const lus = Array.isArray(rep.appels) ? rep.appels : [];
      if (!lus.length || !lus.every((a) => a && typeof a.name === 'string' && a.args && typeof a.args === 'object')) {
        return { r, raison: 'mode « outils » sans appels lisibles', appels, total, silenceMax };
      }
      tours++;
      if (tours > TOURS_OUTILS_APP) return { r, raison: `plus de ${TOURS_OUTILS_APP} tours d'outils (l'app abandonne)`, appels, total, silenceMax };
      contents.push(rep.tourModele);
      // La réponse que l'app donne quand le moteur ne rend rien : l'essai n'a
      // aucune donnée de santé, et n'en invente pas.
      contents.push({ role: 'function', parts: lus.map((a) => ({ functionResponse: { name: a.name, response: { q: 'moteur_indisponible' } } })) });
      continue;
    }
    if (rep.mode !== 'reponse') return { r, raison: 'mode inattendu « ' + rep.mode + ' »', appels, total, silenceMax };
    if (typeof rep.texte !== 'string' || !rep.texte.trim()) return { r, raison: 'réponse sans texte', appels, total, silenceMax };
    if (!Array.isArray(rep.suites)) return { r, raison: '« suites » absent', appels, total, silenceMax };
    return { r, rep, appels, tours, total, silenceMax, premierTexte, morceaux, etapes, sse, finEnFlux: flux && estFlux };
  }
}

async function essaisCoach(c, { ok, ko, alerte }, secrets, attendu) {
  const G = 'coach';
  const fournisseurDe = (rep) => (rep && rep.fournisseur) || 'gemini';
  const jugerFournisseur = (nom, rep) => {
    const f = fournisseurDe(rep);
    if (f === attendu) ok(G, nom + ' : répondu par ' + f, rep && rep.appelsGemini != null ? rep.appelsGemini + ' appel(s) au modèle au dernier tour' : '');
    else ko(G, nom + ' : répondu par ' + attendu, 'c\'est ' + f + ' qui a répondu' + (attendu === 'anthropic' ? ' : COACH_FOURNISSEUR=anthropic n\'est pas lue par ce déploiement (posée après le déploiement ? mal écrite ?)' : ''));
  };

  // C0. La signature est vérifiée (aucun appel au modèle : refus avant).
  if (secrets.sig) {
    const r = await c.appelerCoach(c.corpsCoach({ contents: [{ role: 'user', parts: [{ text: 'essai' }] }] }), { fausseSignature: true });
    if (r.statut === 401 && r.json && /signature/.test(r.json.error || '')) ok(G, 'une fausse signature est refusée (401)', '', r.ms);
    else ko(G, 'une fausse signature est refusée (401)', 'HTTP ' + r.statut + ' — ' + String(r.texte).slice(0, 100), r.ms);
  } else {
    alerte(G, 'la signature n\'est pas essayée', 'COACH_SIG_SECRET n\'est pas posée sur ce Mac : les questions partent sans signature (refusées si le serveur exige COACH_EXIGE_SIGNATURE=1)');
  }

  const [simple, chiffre, flux] = await Promise.all([
    conversation(c, { question: 'Comment je dois récupérer après une grosse séance ?', flux: false }),
    conversation(c, { question: 'Que veut dire ma récup de 66 % aujourd\'hui ?', flux: true,
                      chiffre: { metrique: 'recup', valeur: '66 %', jour: 0, version: 1 } }),
    conversation(c, { question: 'Donne-moi un conseil pour mieux dormir ce soir.', flux: true })
  ]);

  // C1. Question simple, réponse JSON (le chemin des apps d'avant le flux).
  if (simple.rep) {
    ok(G, 'question simple (JSON) : une réponse que l\'app sait lire',
       `${simple.tours} tour(s) d'outils · ${simple.rep.texte.length} car. · ${simple.rep.suites.length} suite(s)`, simple.total);
    jugerFournisseur('question simple', simple.rep);
    const lent = simple.appels.find((r) => r.ms > DELAI_APP_COACH_S * 1000);
    if (lent) alerte(G, 'question simple : chaque appel sous ' + DELAI_APP_COACH_S + ' s', 'un appel a pris ' + secondes(lent.ms) + ' (une app en JSON aurait abandonné)');
  } else {
    ko(G, 'question simple (JSON) : une réponse que l\'app sait lire', simple.raison + ' — ' + c.masquer(String(simple.r.texte).slice(0, 200)), simple.total);
  }

  // C2. « Touche un chiffre » : trois phrases, pas de titres.
  if (chiffre.rep) {
    const corps = chiffre.rep.texte.replace(/\*\*|__|_/g, '');
    const phrases = corps.split(/(?<=[.!?…])\s+/).map((s) => s.trim()).filter((s) => /[A-Za-zÀ-ÿ0-9]/.test(s));
    ok(G, 'question « chiffre » : une réponse que l\'app sait lire', `${phrases.length} phrase(s) · ${chiffre.tours} tour(s) d'outils`, chiffre.total);
    if (/^#{1,3} /m.test(chiffre.rep.texte) || phrases.length > 4) alerte(G, 'question « chiffre » : trois phrases, sans titre', `${phrases.length} phrases${/^#{1,3} /m.test(chiffre.rep.texte) ? ', avec des titres' : ''} : le champ « chiffre » n'a pas changé la forme`);
    else ok(G, 'question « chiffre » : trois phrases, sans titre', '');
    jugerFournisseur('question « chiffre »', chiffre.rep);
  } else {
    ko(G, 'question « chiffre » : une réponse que l\'app sait lire', chiffre.raison + ' — ' + c.masquer(String(chiffre.r.texte).slice(0, 200)), chiffre.total);
  }

  // C3. Le flux, comme l'app le demande toujours.
  if (flux.rep && !flux.finEnFlux) {
    ko(G, 'flux (SSE) : des morceaux puis une « fin »', 'la réponse finale est arrivée en JSON, pas en flux : l\'app affiche tout d\'un coup à la fin', flux.total);
  } else if (flux.rep) {
    ok(G, 'flux (SSE) : des morceaux puis une « fin »',
       `${flux.tours} tour(s) d'outils · ${flux.etapes} étape(s) annoncée(s) · premier texte à ${flux.premierTexte == null ? '—' : secondes(flux.premierTexte)}`, flux.total);
    if (flux.morceaux && flux.rep.texte.trim() !== flux.morceaux.trim()) alerte(G, 'flux : les morceaux recollés = le texte final', 'ils diffèrent (' + flux.morceaux.length + ' contre ' + flux.rep.texte.length + ' car.) : l\'app affiche le texte final, mais l\'écran a montré autre chose pendant l\'écriture');
    jugerFournisseur('flux', flux.rep);
  } else {
    ko(G, 'flux (SSE) : des morceaux puis une « fin »', flux.raison + ' — ' + c.masquer(String(flux.r.texte).slice(0, 200)), flux.total);
  }
  const silence = Math.max(flux.silenceMax || 0, chiffre.silenceMax || 0);
  if (flux.rep || chiffre.rep) {
    if (silence > DELAI_APP_COACH_S * 1000) ko(G, `flux : jamais plus de ${DELAI_APP_COACH_S} s sans un octet`, 'un silence de ' + secondes(silence) + ' : l\'app aurait affiché « Flint met trop de temps à répondre »');
    else if (silence > DELAI_APP_COACH_S * 1000 * 0.6) alerte(G, `flux : jamais plus de ${DELAI_APP_COACH_S} s sans un octet`, 'un silence de ' + secondes(silence) + ' : proche de la limite de l\'app');
    else ok(G, `flux : jamais plus de ${DELAI_APP_COACH_S} s sans un octet`, 'silence le plus long ' + secondes(silence));
  }
}

// ── D. Le scan ─────────────────────────────────────────────────────────────
function jugerRepas(rep) {
  const pb = [];
  if (!rep || typeof rep !== 'object') return ['pas un objet'];
  if (typeof rep.mealName !== 'string') pb.push('mealName absent');
  if (!Array.isArray(rep.items)) return pb.concat('items absent');
  rep.items.forEach((it, i) => {
    for (const k of ['grams', 'kcal', 'prot', 'carb', 'fat', 'confidence']) if (typeof it[k] !== 'number' || !Number.isFinite(it[k])) pb.push(`item ${i + 1} : ${k} n'est pas un nombre`);
    if (typeof it.name !== 'string' || !it.name) pb.push(`item ${i + 1} : sans nom`);
    const m = 4 * it.prot + 4 * it.carb + 9 * it.fat;
    if (m > 0 && Math.abs(it.kcal - m) > 0.3 * m + 1) pb.push(`item ${i + 1} « ${it.name} » : ${it.kcal} kcal pour ${Math.round(m)} par les macros`);
  });
  const s = rep.items.reduce((a, it) => ({ kcal: a.kcal + it.kcal, prot: a.prot + it.prot, carb: a.carb + it.carb, fat: a.fat + it.fat }), { kcal: 0, prot: 0, carb: 0, fat: 0 });
  if (!rep.total || ['kcal', 'prot', 'carb', 'fat'].some((k) => Math.abs((rep.total[k] || 0) - s[k]) > 0.5)) pb.push('total ≠ somme des items');
  if (!(rep.healthScore === null || (Number.isInteger(rep.healthScore) && rep.healthScore >= 1 && rep.healthScore <= 10))) pb.push('healthScore hors 1–10');
  return pb;
}

async function essaisScan(c, { ok, ko, alerte, saute, extrait }, attendu) {
  const G = 'scan';
  const temps = (nom, r, limiteS) => {
    if (r.ms > limiteS * 1000) ko(G, nom + ' : sous le délai de l\'app (' + limiteS + ' s)', secondes(r.ms));
    else if (r.ms > 60000) alerte(G, nom + ' : temps de réponse', secondes(r.ms) + ' (long : plus d\'une minute)');
  };
  const photo = (f) => 'data:image/jpeg;base64,' + lireImage(f);

  const essais = [
    (async () => {   // D1. Photo de repas, exactement comme AnalyseRepasNatif
      const r = await c.appelerScan({ image: photo('repas.jpg'), carte: 'auto' });
      const nom = 'photo de repas';
      if (r.statut !== 200 || !r.json) return ko(G, nom + ' : une réponse que l\'app sait lire', extrait(r), r.ms);
      if (r.json.kind === 'carte') return alerte(G, nom + ' : lue comme un repas', 'lue comme une CARTE de resto', r.ms);
      const pb = jugerRepas(r.json);
      if (pb.length) ko(G, nom + ' : schéma et garde-fous (kcal ≈ 4P+4G+9L)', pb.slice(0, 3).join(' · '), r.ms);
      else if (!r.json.items.length) alerte(G, nom + ' : au moins un aliment reconnu', 'aucun aliment sur le dessin (la forme est bonne)', r.ms);
      else ok(G, nom + ' : schéma et garde-fous (kcal ≈ 4P+4G+9L)', `« ${r.json.mealName} » · ${r.json.items.length} aliment(s) · ${r.json.total.kcal} kcal`, r.ms);
      temps(nom, r, DELAI_APP_SCAN_S);
    })(),
    (async () => {   // D2. Étiquette, comme LectureEtiquette
      const r = await c.appelerScan({ mode: 'label', image: photo('etiquette.jpg') });
      const nom = 'étiquette';
      if (r.statut !== 200 || !r.json) return ko(G, nom + ' : une réponse que l\'app sait lire', extrait(r), r.ms);
      if (r.json.lisible !== true) return ko(G, nom + ' : lue', '« lisible: false » sur une étiquette nette', r.ms);
      const p = r.json.per100 || {};
      const ecarts = Object.keys(ATTENDU_ETIQUETTE).filter((k) => typeof p[k] !== 'number' || Math.abs(p[k] - ATTENDU_ETIQUETTE[k]) > Math.max(0.05, ATTENDU_ETIQUETTE[k] * 0.02))
        .map((k) => `${k} ${p[k] == null ? 'absent' : p[k]} (écrit ${ATTENDU_ETIQUETTE[k]})`);
      if (r.json.servingG !== ATTENDU_PORTION_G) ecarts.push(`portion ${r.json.servingG} (écrit ${ATTENDU_PORTION_G})`);
      if (!ecarts.length) ok(G, nom + ' : chaque valeur lue juste', `${p.kcal} kcal, ${p.prot} g de protéines pour 100 g`, r.ms);
      else alerte(G, nom + ' : chaque valeur lue juste', ecarts.slice(0, 4).join(' · '), r.ms);
      temps(nom, r, DELAI_APP_ETIQUETTE_S);
    })(),
    (async () => {   // D3. Carte de resto, par le même chemin que la photo
      const r = await c.appelerScan({ image: photo('carte.jpg'), carte: 'auto' });
      const nom = 'carte de resto';
      if (r.statut !== 200 || !r.json) return ko(G, nom + ' : une réponse que l\'app sait lire', extrait(r), r.ms);
      if (r.json.kind !== 'carte') return ko(G, nom + ' : reconnue comme une carte', 'kind = ' + r.json.kind, r.ms);
      const plats = r.json.menu && Array.isArray(r.json.menu.dishes) ? r.json.menu.dishes : [];
      const formes = plats.filter((p) => typeof p.name !== 'string' || typeof p.kcal !== 'number');
      if (!plats.length || formes.length) return ko(G, nom + ' : des plats lisibles', plats.length ? formes.length + ' plat(s) sans nom ou sans kcal' : 'aucun plat', r.ms);
      const lus = new Set(plats.map((p) => sansAccent(p.name)));
      const trouves = ATTENDU_CARTE.filter((n) => lus.has(sansAccent(n)));
      if (trouves.length >= 5) ok(G, nom + ' : les plats écrits sont relevés', `${trouves.length}/6 au mot près · positions ${r.json.menu.positions ? 'gardées' : 'non'}`, r.ms);
      else alerte(G, nom + ' : les plats écrits sont relevés', `${trouves.length}/6 au mot près : ${plats.map((p) => p.name).slice(0, 6).join(' ; ')}`, r.ms);
      temps(nom, r, DELAI_APP_SCAN_S);
    })(),
    (async () => {   // D4. Description texte, comme le moteur web
      const r = await c.appelerScan({ text: 'deux œufs au plat, une tranche de pain complet et un café au lait' }, { 'x-flint-device': null });
      const nom = 'description texte';
      if (r.statut !== 200 || !r.json) return ko(G, nom + ' : une réponse que l\'app sait lire', extrait(r), r.ms);
      const pb = jugerRepas(r.json);
      if (pb.length) ko(G, nom + ' : schéma et garde-fous (kcal ≈ 4P+4G+9L)', pb.slice(0, 3).join(' · '), r.ms);
      else if (r.json.items.length < 2) alerte(G, nom + ' : les aliments nommés', r.json.items.length + ' aliment(s) pour trois nommés', r.ms);
      else ok(G, nom + ' : schéma et garde-fous (kcal ≈ 4P+4G+9L)', `${r.json.items.length} aliments · ${r.json.total.kcal} kcal`, r.ms);
      temps(nom, r, DELAI_APP_SCAN_S);
    })(),
    (async () => {   // D5. Une photo trop lourde : refusée proprement, sans appel au modèle
      const r = await c.appelerScan({ image: 'data:image/jpeg;base64,' + 'A'.repeat(3.2 * 1024 * 1024) });
      const nom = 'photo trop lourde (3,2 Mo)';
      if (r.statut === 413 && jsonErreur(r)) ok(G, nom + ' → 413 lisible', r.json.error, r.ms);
      else ko(G, nom + ' → 413 lisible', extrait(r) + (r.statut === 413 ? ' (refus de Vercel, pas du serveur : la limite de corps a changé ?)' : ''), r.ms);
    })(),
    (async () => {   // D6. Pas une image : sur Claude, 415 SANS appel au modèle — la preuve gratuite que le scan est basculé
      const nom = 'scan : passe par Claude (un fichier qui n\'est pas une image → 415)';
      if (attendu !== 'anthropic') return saute(G, nom, 'seulement quand on attend Claude (Gemini enverrait le fichier au modèle)');
      const r = await c.appelerScan({ image: 'data:image/heic;base64,' + Buffer.from('ceci n\'est pas une image, juste un essai').toString('base64') });
      if (r.statut === 415) ok(G, nom, '', r.ms);
      else ko(G, nom, (r.statut === 502 || r.statut === 200 ? 'le fichier est parti au modèle : SCAN_FOURNISSEUR=anthropic n\'est pas lue par ce déploiement — ' : '') + extrait(r), r.ms);
    })()
  ];
  await Promise.all(essais);
}

const jsonErreur = (r) => r.json && typeof r.json.error === 'string';

// ═══ Le rendu ════════════════════════════════════════════════════════════════

const SIGNE = { ok: '✅', ko: '❌', alerte: '⚠️ ', saute: '⏭️ ' };
const TITRES = { site: 'Le site et le web OTA', porte: 'La porte', coach: 'Le Coach', scan: 'Le scan', compte: 'La suppression de compte (refus seulement)', fin: 'Ce qui vaut pour tout' };

function rendre(resultat, entete) {
  const { lignes, client } = resultat;
  const v = client.vus;
  const fin = [];
  if (!resultat.arret) {
    fin.push(v.fuites.length ? { groupe: 'fin', nom: 'aucune clé dans les réponses', etat: 'ko', detail: [...new Set(v.fuites)].join(' · ') }
                             : { groupe: 'fin', nom: 'aucune clé dans les réponses', etat: 'ok', detail: '' });
    fin.push(v.acaoEtoile.length ? { groupe: 'fin', nom: 'jamais « Access-Control-Allow-Origin: * »', etat: 'ko', detail: [...new Set(v.acaoEtoile)].join(', ') }
                                 : { groupe: 'fin', nom: 'jamais « Access-Control-Allow-Origin: * »', etat: 'ok', detail: '' });
    fin.push(v.sansNoStore.length ? { groupe: 'fin', nom: 'réponses d\'api jamais mises en cache (no-store)', etat: 'ko', detail: [...new Set(v.sansNoStore)].slice(0, 4).join(', ') }
                                  : { groupe: 'fin', nom: 'réponses d\'api jamais mises en cache (no-store)', etat: 'ok', detail: '' });
  }
  const toutes = lignes.concat(fin, resultat.extra || []);
  const sortie = [entete, ''];
  for (const g of Object.keys(TITRES)) {
    const du = toutes.filter((l) => l.groupe === g);
    if (!du.length) continue;
    sortie.push('── ' + TITRES[g] + ' ' + '─'.repeat(Math.max(2, 60 - TITRES[g].length)));
    for (const l of du) {
      sortie.push(`${SIGNE[l.etat]} ${l.nom}${l.ms != null ? '  (' + secondes(l.ms) + ')' : ''}`);
      if (l.detail) sortie.push('      ' + l.detail);
    }
    sortie.push('');
  }
  const kos = toutes.filter((l) => l.etat === 'ko');
  const alertes = toutes.filter((l) => l.etat === 'alerte');
  const oks = toutes.filter((l) => l.etat === 'ok');
  let phrase, code;
  if (kos.length) {
    code = 1;
    phrase = `❌ ${kos.length} problème(s) — ne bascule pas : ${kos.slice(0, 3).map((l) => l.nom).join(' ; ')}${kos.length > 3 ? '…' : ''}.`;
  } else if (resultat.incomplet) {
    code = 3;
    phrase = `⏭️  La porte tient (${oks.length} vérifications), mais le Coach et le scan n'ont PAS été essayés : pose FLINT_APP_SECRET sur ce Mac et relance.`;
  } else {
    code = 0;
    phrase = `✅ Tout marche : ${oks.length} vérifications vertes${alertes.length ? `, ${alertes.length} alerte(s) à lire (elles ne bloquent pas)` : ''}.`;
  }
  sortie.push(phrase);
  return { texte: sortie.join('\n'), code, kos, alertes, oks, toutes };
}

// ═══ Le mode à blanc : le vrai code de api/, de faux modèles, pas de réseau ══

function evenementsClaude(msg) {
  const evs = [{ type: 'message_start', message: Object.assign({}, msg, { content: [], stop_reason: null }) }];
  msg.content.forEach((b, index) => {
    if (b.type === 'text') {
      evs.push({ type: 'content_block_start', index, content_block: { type: 'text', text: '' } });
      for (let i = 0; i < b.text.length; i += 17) evs.push({ type: 'content_block_delta', index, delta: { type: 'text_delta', text: b.text.slice(i, i + 17) } });
    } else if (b.type === 'tool_use') {
      evs.push({ type: 'content_block_start', index, content_block: { type: 'tool_use', id: b.id, name: b.name, input: {} } });
      evs.push({ type: 'content_block_delta', index, delta: { type: 'input_json_delta', partial_json: JSON.stringify(b.input) } });
    } else if (b.type === 'thinking') {
      evs.push({ type: 'content_block_start', index, content_block: { type: 'thinking', thinking: '' } });
      evs.push({ type: 'content_block_delta', index, delta: { type: 'signature_delta', signature: b.signature } });
    }
    evs.push({ type: 'content_block_stop', index });
    evs.push({ type: 'ping' });
  });
  evs.push({ type: 'message_delta', delta: { stop_reason: msg.stop_reason, stop_sequence: null }, usage: { output_tokens: 90 } });
  evs.push({ type: 'message_stop' });
  return evs.map((e) => 'event: ' + e.type + '\ndata: ' + JSON.stringify(e) + '\n\n');
}

function reponseSSE(morceaux, pauseMs) {
  const enc = new TextEncoder();
  let i = 0;
  return new Response(new ReadableStream({
    async pull(ctrl) {
      if (pauseMs && i === 1) await new Promise((r) => setTimeout(r, pauseMs));
      if (i < morceaux.length) ctrl.enqueue(enc.encode(morceaux[i++])); else ctrl.close();
    }
  }), { status: 200, headers: { 'content-type': 'text/event-stream' } });
}

/** Les réponses « justes » des faux modèles, selon l'image reçue. */
function fauxContenus() {
  const imgs = { repas: lireImage('repas.jpg'), etiquette: lireImage('etiquette.jpg'), carte: lireImage('carte.jpg') };
  const quelle = (b64) => Object.keys(imgs).find((k) => imgs[k] === b64) || 'inconnue';
  const repas = { kind: 'repas', mealName: 'Œufs au plat, pain grillé et tomates', healthScore: 7, healthNote: 'Des protéines et peu de légumes.',
    items: [{ name: 'Œufs au plat', grams: 110, kcal: 200, prot: 14, carb: 1, fat: 15, confidence: 0.8 },
            { name: 'Pain grillé', grams: 40, kcal: 105, prot: 3.5, carb: 20, fat: 1, confidence: 0.7 },
            { name: 'Tomates cerises', grams: 60, kcal: 11, prot: 0.5, carb: 2, fat: 0.1, confidence: 0.8 }] };
  const sections = ['entree', 'entree', 'plat', 'plat', 'dessert', 'dessert'];
  const carte = { kind: 'carte', items: [], menu: { name: 'Le Petit Essai', currency: 'EUR',
    dishes: ATTENDU_CARTE.map((name, i) => ({ name, section: sections[i], price: [9.5, 7, 22, 19.5, 7.5, 6.5][i],
      kcal: 400, kcalMin: 300, kcalMax: 500, prot: 20, carb: 40, fat: 18, confidence: 0.7, box: [80, 250 + i * 60, 450, 290 + i * 60] })) } };
  const etiquette = { lisible: true, name: 'Muesli aux fruits secs', brand: null, servingG: ATTENDU_PORTION_G,
    per100: Object.assign({ caffeine: null }, ATTENDU_ETIQUETTE) };
  return { quelle, repas, carte, etiquette };
}

function installerFauxModeles({ pannes }) {
  const F = fauxContenus();
  const externes = [];
  const message = (content, stop) => ({ id: 'msg_essai', type: 'message', role: 'assistant', model: 'claude-faux', content,
    stop_reason: stop || 'end_turn', stop_details: null, usage: { input_tokens: 1000, cache_read_input_tokens: 8000, cache_creation_input_tokens: 0, output_tokens: 90 } });
  const pauseMs = pannes.has('lent') ? 1500 : 0;
  const texteCoach = (systeme) => /QUESTION SUR UN SEUL CHIFFRE/.test(systeme)
    ? '**Ta récup de 66 % est dans ta normale.** Je n\'ai pas tes données de la nuit pour en dire la raison. Rien à changer aujourd\'hui.\nSuites : Et mon sommeil ? | Je m\'entraîne ?'
    : '**Dors et mange bien ce soir.**\n\n## Pourquoi\n- **Récupération** : je n\'ai pas tes données.\n\nSuites : Et demain ? | Combien d\'heures ?';

  globalThis.fetch = async (url, init) => {
    const u = new URL(String(url));
    const corps = init && typeof init.body === 'string' ? JSON.parse(init.body) : {};
    if (u.hostname === 'api.anthropic.com') {
      const cle = init.headers['x-api-key'];
      let msg;
      if (corps.output_config && corps.output_config.format) {          // le scan
        const contenu = corps.messages[0].content;
        const img = contenu.find((b) => b.type === 'image');
        const quoi = img ? F.quelle(img.source.data) : 'texte';
        const props = corps.output_config.format.schema.properties || {};
        let obj = quoi === 'etiquette' || props.lisible ? F.etiquette : quoi === 'carte' ? F.carte : F.repas;
        if (props.lisible && quoi !== 'etiquette') obj = { lisible: false, name: null, brand: null, servingG: null, per100: null };
        if (quoi === 'carte' && !props.menu) obj = F.repas;
        if (quoi === 'texte') { obj = Object.assign({}, F.repas); delete obj.kind; }
        msg = message([{ type: 'thinking', thinking: '', signature: 'sig-essai' }, { type: 'text', text: JSON.stringify(obj) }]);
      } else {                                                           // le Coach
        const dernier = corps.messages[corps.messages.length - 1];
        const aResultat = Array.isArray(dernier.content) && dernier.content.some((b) => b.type === 'tool_result');
        const systeme = (corps.system || []).map((b) => b.text).join('\n');
        if (!aResultat && corps.tools && corps.tools.length && !corps.tool_choice) {
          msg = message([{ type: 'thinking', thinking: '', signature: 'sig-essai' },
                         { type: 'tool_use', id: 'toolu_essai_' + Date.now(), name: corps.tools.find((t) => t.name === 'getRecoveryContext') ? 'getRecoveryContext' : corps.tools[0].name, input: {} }], 'tool_use');
        } else {
          msg = message([{ type: 'thinking', thinking: '', signature: 'sig-essai' },
                         { type: 'text', text: texteCoach(systeme) + (pannes.has('cle-fuite') ? '\n(clé : ' + cle + ')' : '') }]);
        }
      }
      if (corps.stream) return reponseSSE(evenementsClaude(msg), pauseMs);
      return new Response(JSON.stringify(msg), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (u.hostname === 'generativelanguage.googleapis.com') {
      const parts = (corps.contents || []).flatMap((t) => t.parts || []);
      const reponse = (p) => ({ candidates: [{ content: { role: 'model', parts: p } }] });
      if (corps.generationConfig && corps.generationConfig.responseSchema) {      // le scan
        const img = parts.find((p) => p.inline_data);
        const quoi = img ? F.quelle(img.inline_data.data) : 'texte';
        const props = corps.generationConfig.responseSchema.properties || {};
        let obj = props.lisible ? (quoi === 'etiquette' ? F.etiquette : { lisible: false }) : quoi === 'carte' ? F.carte : F.repas;
        if (quoi === 'texte') { obj = Object.assign({}, F.repas); delete obj.kind; }
        return new Response(JSON.stringify(reponse([{ text: JSON.stringify(obj) }])), { status: 200 });
      }
      const dernier = (corps.contents || [])[corps.contents.length - 1] || {};
      const aResultat = (dernier.parts || []).some((p) => p.functionResponse);
      const systeme = ((corps.systemInstruction || {}).parts || []).map((p) => p.text).join('\n');
      const decl = ((corps.tools || [])[0] || {}).functionDeclarations || [];
      const sortie = !aResultat && decl.length && !corps.toolConfig
        ? [{ functionCall: { name: decl[0].name, args: {} }, thoughtSignature: 'sig-gemini-essai' }]
        : [{ text: texteCoach(systeme) + (pannes.has('cle-fuite') ? '\n(clé : ' + u.searchParams.get('key') + ')' : '') }];
      if (/streamGenerateContent/.test(u.pathname)) {
        return reponseSSE(sortie[0].text
          ? sortie[0].text.match(/[\s\S]{1,20}/g).map((t) => 'data: ' + JSON.stringify(reponse([{ text: t }])) + '\r\n\r\n')
          : ['data: ' + JSON.stringify(reponse(sortie)) + '\r\n\r\n'], pauseMs);
      }
      return new Response(JSON.stringify(reponse(sortie)), { status: 200 });
    }
    externes.push(u.hostname);
    throw new Error('mode à blanc : requête vers l\'extérieur refusée (' + u.hostname + ')');
  };
  return { externes };
}

/** Un petit serveur qui fait ce que fait Vercel pour une fonction Node. */
function adapterVercel(handler, pannes) {
  return async (req, res) => {
    const morceaux = [];
    for await (const m of req) morceaux.push(m);
    const brut = Buffer.concat(morceaux);
    if (pannes.has('protection')) { res.statusCode = 401; res.setHeader('Content-Type', 'text/html'); return res.end('<html>Vercel Authentication</html>'); }
    if (pannes.has('cors-etoile')) res.setHeader('Access-Control-Allow-Origin', '*');
    if (pannes.has('flux-sans-fin')) {
      const ecrire = res.write.bind(res);
      res.write = (x, ...a) => (String(x).startsWith('data: {"fin"') ? true : ecrire(x, ...a));
    }
    // Vercel refuse lui-même un corps de plus de 4,5 Mo (FUNCTION_PAYLOAD_TOO_LARGE).
    if (brut.length > 4.5 * 1024 * 1024) { res.statusCode = 413; res.setHeader('Content-Type', 'text/plain'); return res.end('FUNCTION_PAYLOAD_TOO_LARGE'); }
    const type = String(req.headers['content-type'] || '').toLowerCase();
    if (!brut.length) req.body = undefined;
    else if (type.includes('application/json')) {
      try { req.body = JSON.parse(brut.toString('utf8')); } catch (e) { res.statusCode = 400; return res.end('Invalid JSON'); }
    } else if (type.startsWith('text/')) req.body = brut.toString('utf8');
    else req.body = brut;
    if (!req.headers['x-forwarded-for']) req.headers['x-forwarded-for'] = '127.0.0.1';
    res.status = (c) => { res.statusCode = c; return res; };
    res.json = (o) => { if (!res.getHeader('content-type')) res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end(JSON.stringify(o)); return res; };
    res.send = (x) => { res.end(typeof x === 'string' || Buffer.isBuffer(x) ? x : JSON.stringify(x)); return res; };
    try { await handler(req, res); }
    catch (e) { if (!res.headersSent) { res.statusCode = 500; res.end('FUNCTION_INVOCATION_FAILED'); } else res.end(); }
  };
}

const VARIABLES_SERVEUR = ['FLINT_APP_SECRET', 'COACH_SIG_SECRET', 'COACH_EXIGE_SIGNATURE', 'GEMINI_API_KEY', 'ANTHROPIC_API_KEY',
  'ANTHROPIC_API_KEY_2', 'COACH_FOURNISSEUR', 'SCAN_FOURNISSEUR', 'COACH_MODELE', 'SCAN_MODELE', 'COACH_EFFORT', 'SCAN_EFFORT',
  'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN', 'COACH_V2', 'COACH_FACTURATION', 'COACH_PRECHARGE',
  'APPLE_TEAM_ID', 'APPLE_KEY_ID', 'APPLE_PRIVATE_KEY'];

/**
 * Démarre le serveur local à blanc. Rend `{ base, secrets, fermer, externes }`.
 * Les variables du serveur sont posées ICI (des valeurs factices) : rien de ce
 * Mac n'est lu, rien n'est envoyé.
 */
async function serveurLocal({ gemini = false, pannes = new Set() } = {}) {
  for (const k of VARIABLES_SERVEUR) delete process.env[k];
  const secrets = { app: 'essai-sec-cle-app', sig: 'essai-sec-signature' };
  Object.assign(process.env, {
    FLINT_APP_SECRET: secrets.app, COACH_SIG_SECRET: secrets.sig, COACH_EXIGE_SIGNATURE: '1',
    GEMINI_API_KEY: 'AIzaEssaiSecCleGeminiFactice000000000000', ANTHROPIC_API_KEY: 'sk-ant-essai-sec-cle-1-factice',
    ANTHROPIC_API_KEY_2: 'sk-ant-essai-sec-cle-2-factice'
  });
  if (!gemini && !pannes.has('gemini-reste')) Object.assign(process.env, { COACH_FOURNISSEUR: 'anthropic', SCAN_FOURNISSEUR: 'anthropic' });
  if (pannes.has('porte-ouverte')) delete process.env.FLINT_APP_SECRET;
  if (pannes.has('externe')) Object.assign(process.env, { UPSTASH_REDIS_REST_URL: 'https://magasin.invalid', UPSTASH_REDIS_REST_TOKEN: 'x' });
  const { externes } = installerFauxModeles({ pannes });
  const routes = {
    '/api/coach': adapterVercel(require(path.join(RACINE, 'api', 'coach.js')), pannes),
    '/api/scan-meal': adapterVercel(require(path.join(RACINE, 'api', 'scan-meal.js')), pannes),
    '/api/apple-revocation': adapterVercel(require(path.join(RACINE, 'api', 'apple-revocation.js')), pannes)
  };
  const serveur = http.createServer((req, res) => {
    const chemin = req.url.split('?')[0];
    if (routes[chemin]) return routes[chemin](req, res);
    if (pannes.has('protection')) { res.statusCode = 401; res.setHeader('Content-Type', 'text/html'); return res.end('<html>Vercel Authentication</html>'); }
    if (req.method === 'GET' && ['/sw.js', '/manifeste.json'].includes(chemin)) {
      res.setHeader('Content-Type', chemin.endsWith('.js') ? 'application/javascript' : 'application/json');
      return res.end(fs.readFileSync(path.join(RACINE, chemin.slice(1))));
    }
    res.statusCode = 404; res.end('NOT_FOUND');
  });
  await new Promise((r) => serveur.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + serveur.address().port;
  return { base, secrets, externes, fermer: () => new Promise((r) => serveur.close(r)) };
}

// ═══ La ligne de commande ═══════════════════════════════════════════════════

function lireArguments(argv) {
  const o = { sec: false, gemini: false, attendu: null, reference: null, base: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--sec') o.sec = true;
    else if (a === '--gemini') o.gemini = true;
    else if (a === '--attendu') o.attendu = argv[++i];
    else if (a === '--reference') o.reference = argv[++i];
    else if (a === '--journal') o.journal = true;
    else if (a === '-h' || a === '--help') o.aide = true;
    else if (!a.startsWith('-') && !o.base) o.base = a;
    else o.inconnu = a;
  }
  return o;
}

async function principal(argv) {
  const o = lireArguments(argv);
  const usage = 'Usage : node outils/essai-serveur.js <URL de base> [--attendu anthropic|gemini] [--reference <URL>]\n'
              + '        node outils/essai-serveur.js --sec [--gemini] [--journal]';
  if (o.aide) { console.log(usage); return 0; }
  if (o.inconnu || (!o.sec && !o.base) || (o.attendu && !['anthropic', 'gemini'].includes(o.attendu))) { console.error(usage); return 2; }
  const pannes = new Set(String(process.env.ESSAI_SEC_PANNE || '').split(',').map((s) => s.trim()).filter(Boolean));
  let base, secrets, local = null;
  const attendu = o.attendu || (o.sec && o.gemini ? 'gemini' : 'anthropic');
  if (o.sec) {
    local = await serveurLocal({ gemini: o.gemini, pannes });
    base = local.base; secrets = local.secrets;
  } else {
    if (!/^https?:\/\/[^\s/]+/.test(o.base)) { console.error('URL illisible : ' + o.base + '\n' + usage); return 2; }
    base = o.base.replace(/\/+$/, '');
    secrets = { app: process.env.FLINT_APP_SECRET || '', sig: process.env.COACH_SIG_SECRET || '',
                bypass: process.env.VERCEL_PROTECTION_BYPASS || '', bypassReference: '' };
  }
  const oui = (x) => (x ? 'oui' : 'NON');
  const entete = [
    '═══ ESSAI DU SERVEUR FLINT — ' + new Date().toLocaleString('fr-FR') + ' ═══',
    'Cible : ' + (o.sec ? 'le code de ce dépôt, ICI, à blanc (faux modèles, aucun réseau)' + (o.gemini ? ', chemin Gemini' : ', chemin Claude') : base),
    'Fournisseur attendu : ' + attendu + (o.reference ? ' · référence OTA : ' + o.reference : ''),
    'Sur ce Mac : clé d\'app ' + oui(secrets.app) + ' · signature du Coach ' + oui(secrets.sig) + (secrets.bypass ? ' · jeton de protection Vercel oui' : '')
  ].join('\n');
  console.log(entete + '\n\nJe joue la suite (une à deux minutes contre un vrai serveur)…\n');
  let res;
  try {
    // À blanc, le journal du serveur (ses console.log) est retenu à part :
    // il se lit avec --journal, et on y cherche les clés factices.
    const journal = [];
    const logOrig = console.log;
    if (local) console.log = (...x) => journal.push(x.map(String).join(' '));
    try {
      res = await jouerSuite({ base, secrets, attendu, reference: o.reference ? o.reference.replace(/\/+$/, '') : null, sec: o.sec });
    } finally { console.log = logOrig; }
    if (local) {
      if (o.journal) console.log('── Journal du serveur (à blanc) ──\n' + journal.join('\n').replace(/sk-ant-[A-Za-z0-9_-]+|AIza[0-9A-Za-z_-]{20,}/g, '[clé]') + '\n');
      const cles = VARIABLES_SERVEUR.filter((k) => /KEY|SECRET|TOKEN/.test(k)).map((k) => process.env[k]).filter((v) => v && v.length >= 6);
      const fuite = journal.filter((l) => cles.some((k) => l.includes(k)) || /sk-ant-[A-Za-z0-9_-]{6,}|AIza[0-9A-Za-z_-]{20,}/.test(l));
      res.extra = [fuite.length
        ? { groupe: 'fin', nom: 'aucune clé dans le journal du serveur (à blanc)', etat: 'ko', detail: fuite.length + ' ligne(s), dont : ' + fuite[0].slice(0, 80).replace(/sk-ant-\S+|AIza\S+/g, '[clé]') }
        : { groupe: 'fin', nom: 'aucune clé dans le journal du serveur (à blanc)', etat: 'ok', detail: journal.length + ' lignes lues (--journal pour les voir)' }];
      res.extra.push(local.externes.length
        ? { groupe: 'fin', nom: 'aucune requête vers l\'extérieur (mode à blanc)', etat: 'ko', detail: [...new Set(local.externes)].join(', ') }
        : { groupe: 'fin', nom: 'aucune requête vers l\'extérieur (mode à blanc)', etat: 'ok', detail: 'seuls les faux modèles ont été appelés' });
    }
  } finally {
    if (local) await local.fermer();
  }
  const r = rendre(res, '');
  console.log(r.texte.replace(/^\n/, ''));
  return r.code;
}

module.exports = { jouerSuite, rendre, serveurLocal, canonique, lireSSE, jugerRepas, principal,
                   ATTENDU_ETIQUETTE, ATTENDU_CARTE, DELAI_APP_COACH_S };

if (require.main === module) {
  principal(process.argv.slice(2)).then((code) => { process.exitCode = code; },
    (e) => { console.error('L\'essai lui-même a planté : ' + ((e && e.stack) || e)); process.exitCode = 1; });
}
