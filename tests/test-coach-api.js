// ═══════════════════════════════════════════════════════════════════════════
//  LE BANC DE LA PORTE D'ENTRÉE DU COACH
//
//  Il manquait, et c'est ce qui a permis aux trois trous de vivre : `api/` est
//  la moitié serveur du Coach, elle n'avait AUCUN banc. Un durcissement qu'on
//  ne joue pas est une promesse, pas une protection — et une promesse non
//  jouée, dans ce dépôt, on sait ce que ça donne (E43 : deux phrases affirmaient
//  que la base brute ne partait pas pendant que 3,19 Mo partaient).
//
//  Il exerce le VRAI fichier, avec de vraies requêtes simulées : pas de copie
//  des règles ici — une copie se désaccorde au premier réglage.
// ═══════════════════════════════════════════════════════════════════════════

const path = require('path');
const crypto = require('crypto');
const lib = require(path.join(__dirname, '..', 'api', '_lib.js'));

let vert = 0, rouge = 0;
function v(titre, ok, detail) {
  if (ok) { vert++; console.log('  ✅ ' + titre); }
  else { rouge++; console.log('  ❌ ' + titre + (detail ? '   ' + detail : '')); }
}

/** Une réponse HTTP simulée qui retient ce qu'on lui a dit. */
function fauxRes() {
  const r = { code: null, corps: null, entetes: {} };
  r.setHeader = (k, val) => { r.entetes[k] = val; };
  r.status = (c) => { r.code = c; return r; };
  r.json = (o) => { r.corps = o; return r; };
  r.end = () => r;
  return r;
}
function fauxReq(entetes, corps) {
  return { method: 'POST', headers: entetes || {}, body: corps === undefined ? {} : corps };
}

console.log('\n═══ ① LE SECRET : UNE CONFIGURATION ABSENTE EST UNE PANNE ═══');
{
  const garde = process.env.FLINT_APP_SECRET;
  delete process.env.FLINT_APP_SECRET;
  const res = fauxRes();
  const ok = lib.verifierSecret(fauxReq({ 'x-flint-key': 'peu importe' }), res);
  v('sans variable d\'env, la requête est REFUSÉE (fail-closed)', ok === false);
  v('  … et c\'est un 503, pas un 401 — le client n\'y peut rien', res.code === 503, 'code ' + res.code);

  process.env.FLINT_APP_SECRET = 'secret-de-banc';
  const res2 = fauxRes();
  v('mauvaise clé : refusée', lib.verifierSecret(fauxReq({ 'x-flint-key': 'autre' }), res2) === false);
  v('  … en 401', res2.code === 401, 'code ' + res2.code);
  const res3 = fauxRes();
  v('bonne clé : acceptée',
    lib.verifierSecret(fauxReq({ 'x-flint-key': 'secret-de-banc' }), res3) === true);
  v('  … et rien n\'a été écrit dans la réponse', res3.code === null);
  if (garde === undefined) delete process.env.FLINT_APP_SECRET; else process.env.FLINT_APP_SECRET = garde;
}

console.log('\n═══ ② LE RATE-LIMIT NE SE CONTOURNE PLUS PAR UN EN-TÊTE ═══');
{
  // Le device change à chaque requête — c'est exactement l'attaque que
  // l'ancienne version laissait passer : le compteur repartait de zéro.
  const ip = '203.0.113.7';
  let bloquee = 0;
  for (let i = 0; i < 40; i++) {
    const id = 'dev:appareil-' + i;            // un device neuf à chaque tour
    if (lib.rateLimited(id, 10, { ip, maxIP: 12 })) bloquee++;
  }
  v('un client qui change de device à chaque appel finit bloqué', bloquee > 0,
    bloquee + ' requêtes refusées sur 40');
  v('  … et il l\'est par l\'IP, qu\'aucun en-tête ne choisit', bloquee >= 40 - 12 - 1,
    'plafond IP 12 → au moins ' + (40 - 13) + ' refus attendus');

  // Un voisin derrière une AUTRE IP n'est pas gêné.
  v('un autre client, autre IP, passe',
    lib.rateLimited('dev:voisin', 10, { ip: '198.51.100.9', maxIP: 12 }) === false);
}

console.log('\n═══ ③ LA SIGNATURE : HORODATÉE, LIÉE AU CORPS, AU DEVICE ═══');
{
  process.env.COACH_SIG_SECRET = 'sig-de-banc';
  const corps = JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'salut' }] }] });
  const dev = 'APPAREIL-1';
  const signer = (d, ts, c) => crypto.createHmac('sha256', 'sig-de-banc')
    .update(d + '.' + ts + '.' + crypto.createHash('sha256').update(c).digest('hex'))
    .digest('hex');

  const ts = String(Date.now());
  const bonne = signer(dev, ts, corps);
  v('une requête correctement signée passe',
    lib.verifierSignature(fauxReq({ 'x-flint-device': dev, 'x-flint-ts': ts, 'x-flint-sig': bonne }), corps).ok === true);

  v('  … le corps altéré d\'un seul caractère ne passe plus',
    lib.verifierSignature(fauxReq({ 'x-flint-device': dev, 'x-flint-ts': ts, 'x-flint-sig': bonne }),
                          corps.replace('salut', 'salut!')).ok === false);

  v('  … signée pour un autre appareil : refusée',
    lib.verifierSignature(fauxReq({ 'x-flint-device': 'AUTRE', 'x-flint-ts': ts, 'x-flint-sig': bonne }), corps).ok === false);

  const vieux = String(Date.now() - 6 * 60 * 1000);
  v('  … rejouée six minutes plus tard : refusée (fenêtre de 5 min)',
    lib.verifierSignature(fauxReq({ 'x-flint-device': dev, 'x-flint-ts': vieux, 'x-flint-sig': signer(dev, vieux, corps) }), corps).ok === false);

  v('  … sans signature du tout : refusée quand on la demande',
    lib.verifierSignature(fauxReq({ 'x-flint-device': dev }), corps).ok === false);

  delete process.env.COACH_SIG_SECRET;
  v('secret de signature absent : refusée, jamais acceptée par défaut',
    lib.verifierSignature(fauxReq({ 'x-flint-device': dev, 'x-flint-ts': ts, 'x-flint-sig': bonne }), corps).ok === false);
}

console.log('\n═══ ④ LE CORS N\'OUVRE PLUS À TOUT LE MONDE ═══');
{
  const res = fauxRes();
  lib.cors(res);
  v('sans origine demandée, aucun `Access-Control-Allow-Origin` n\'est posé',
    res.entetes['Access-Control-Allow-Origin'] === undefined,
    String(res.entetes['Access-Control-Allow-Origin']));
  const res2 = fauxRes();
  lib.cors(res2, { origine: 'https://flint-demo-eta.vercel.app' });
  v('  … et quand on en demande une, c\'est celle-là et pas `*`',
    res2.entetes['Access-Control-Allow-Origin'] === 'https://flint-demo-eta.vercel.app');
}

console.log('\n═══ ⑤ L\'ORCHESTRATEUR EST BIEN CÂBLÉ SUR CES GARDES ═══');
{
  const src = require('fs').readFileSync(path.join(__dirname, '..', 'api', 'coach.js'), 'utf8');
  v('coach.js passe l\'IP au rate-limit', /rateLimited\(id, RL_MAX, \{ ip: ipRequete\(req\) \}\)/.test(src));
  v('coach.js juge TOUTE signature présente, même sans l\'exiger',
    /exigeSig \|\| aSignature/.test(src));
  v('coach.js n\'ouvre pas le CORS à `\*`', !/Allow-Origin', '\*'/.test(src));
  v('coach.js borne la conversation', /\b(contents|recus)\.length > 60/.test(src));
  // 25 sept. 2026 — la mémoire garde sa FIN (les faits les plus récents),
  // plus son début : `slice(0, 2000)` jetait les derniers faits confiés.
  v('coach.js borne le profil (début) et la mémoire (les 3 000 derniers caractères)',
    /slice\(0, 4000\)/.test(src) && /MEMOIRE_MAX_CARS = 3000/.test(src)
    && /s\.slice\(-MEMOIRE_MAX_CARS\)/.test(src) && !/memoireTexte\.slice\(0, 2000\)/.test(src));
  v('coach.js journalise sans contenu (longueurs seulement)',
    /sortie: texte\.length/.test(src) && !/texte: texte/.test(src));
}

console.log('\n═══ ⑥ LES DEUX BORDS SIGNENT LA MÊME CHAÎNE ═══');
{
  // ⚠️ C'EST LA VÉRIFICATION QUI TIENT TOUT LE RESTE. La signature couvre une
  // chaîne ; si l'app et le serveur n'écrivent pas EXACTEMENT la même, toutes
  // les requêtes honnêtes sont refusées — et on ne le découvre qu'en
  // production, sur un « signature refusée » incompréhensible.
  //
  // La chaîne ci-dessous n'est pas recopiée à la main : elle sort de
  // `JSONSerialization` avec `.sortedKeys`, exactement l'appel de
  // `CoachReseau.appeler`, exécuté sur ce Mac le 22 sept. 2026. Pour la
  // régénérer si le corps change :
  //
  //     let d = try JSONSerialization.data(withJSONObject: corps,
  //                                        options: [.sortedKeys])
  //
  // Les accents sont dans le cas de test à dessein : c'est le premier endroit
  // où deux langages divergent (échappement \uXXXX contre UTF-8 brut).
  const SWIFT = '{"contents":[{"parts":[{"text":"salut é à"}],"role":"user"}],'
              + '"deviceId":"ABC","memoireTexte":"","profilTexte":"x","ton":"aucun"}';
  const objet = { ton: 'aucun', deviceId: 'ABC',
                  contents: [{ role: 'user', parts: [{ text: 'salut é à' }] }],
                  memoireTexte: '', profilTexte: 'x' };
  v('la canonique du serveur reproduit `.sortedKeys` de Swift, octet pour octet',
    lib.canonique(objet) === SWIFT, lib.canonique(objet));

  // Et le chemin réellement emprunté par la fonction : req.body déjà parsé.
  v('  … y compris par `corpsBrut`, qui part du corps déjà parsé par Vercel',
    lib.corpsBrut({ body: objet }) === SWIFT);
  // 23 sept., 19 h — une chaîne ou un Buffer sont les OCTETS ENVOYÉS
  // (text/plain, octet-stream) : `corpsBrut` les rend tels quels, sans les
  // re-canoniser — voir ⑨.
  v('  … et une chaîne brute (text/plain) est rendue TELLE QUELLE, pas re-canonisée',
    lib.corpsBrut({ body: '{"b":1, "a":2}' }) === '{"b":1, "a":2}');

  // ═══ 23 sept. 2026 — LE SLASH, QUE CE BANC N'AVAIT PAS ══════════════════
  //
  // Le cas ci-dessus était vert et le Coach refusait TOUTES les vraies
  // questions (« signature refusée » chez Dino, 18 h 40). `JSONSerialization`
  // échappe le slash (« 88\/100 »), `JSON.stringify` non — et `profilTexte`
  // porte toujours « score N/100 ». Un corps sans slash ne pouvait pas le voir.
  //
  // La chaîne SWIFT_SLASH sort de `JSONSerialization` `.sortedKeys` exécuté
  // sur ce Mac le 23 sept. (`swift js-slash.swift`) : ce n'est pas une
  // hypothèse sur ce que fait Swift, c'est ce qu'il a fait.
  const SWIFT_SLASH = '{"contents":[{"parts":[{"text":"salut"}],"role":"user"}],'
                    + '"deviceId":"ABC","memoireTexte":"",'
                    + '"profilTexte":"score 88\\/100 · FC 52 b\\/min","ton":"aucun"}';
  const objetSlash = { ton: 'aucun', deviceId: 'ABC',
                       contents: [{ role: 'user', parts: [{ text: 'salut' }] }],
                       memoireTexte: '', profilTexte: 'score 88/100 · FC 52 b/min' };
  v('avec un slash, la canonique du serveur et les octets de Swift DIVERGENT (c\'est le défaut)',
    lib.canonique(objetSlash) !== SWIFT_SLASH && lib.canonique(objetSlash).replace(/\//g, '\\/') === SWIFT_SLASH);

  const crypto = require('crypto');
  process.env.COACH_SIG_SECRET = 'secret-de-papier';
  const signer = (octets, dev, ts) => crypto.createHmac('sha256', 'secret-de-papier')
    .update(dev + '.' + ts + '.' + crypto.createHash('sha256').update(octets).digest('hex')).digest('hex');
  const requete = (octetsSignes) => {
    const ts = String(Date.now());
    return { headers: { 'x-flint-device': 'ABC', 'x-flint-ts': ts, 'x-flint-sig': signer(octetsSignes, 'ABC', ts) }, body: objetSlash };
  };
  const r1 = requete(SWIFT_SLASH);
  v('  … et le serveur ACCEPTE la signature calculée sur les octets de Swift (\\/)',
    lib.verifierSignature(r1, lib.corpsBrut(r1)).ok === true);
  const r2 = requete(lib.canonique(objetSlash));
  v('  … comme celle calculée sur sa propre canonique (/)',
    lib.verifierSignature(r2, lib.corpsBrut(r2)).ok === true);
  const r3 = requete(SWIFT_SLASH.replace('88', '89'));
  v('  … et refuse toujours une signature sur un AUTRE corps',
    lib.verifierSignature(r3, lib.corpsBrut(r3)).ok === false);
  delete process.env.COACH_SIG_SECRET;
}

console.log('\n═══ ⑨ LA DEUXIÈME QUESTION : DES FLOTTANTS, ET LES OCTETS BRUTS ═══');
{
  // 23 sept., 19 h. La première question passait (⑧), la deuxième rendait
  // « signature refusée » : son historique porte la réponse d'un outil, avec
  // un flottant. SWIFT_FLOTTANT sort de `JSONSerialization` `.sortedKeys` sur
  // ce Mac (`swift js-flottant.swift`) : 0.57 y devient 0.56999999999999995.
  // Aucune canonique côté serveur ne retrouve ça ; on signe les octets reçus.
  const SWIFT_FLOTTANT = '{"contents":[{"parts":[{"functionResponse":{"name":"getRecoveryContext",'
                       + '"response":{"qualite":"good","ratio":0.56999999999999995,"s":57,"zone":"jaune"}}}],'
                       + '"role":"function"}],"deviceId":"ABC","langue":"fr","memoireTexte":"",'
                       + '"profilTexte":"score 57\\/100","ton":"aucun"}';
  const objet = JSON.parse(SWIFT_FLOTTANT);
  v('avec un flottant, la canonique diverge des octets de Swift MÊME slash compris (c\'est le défaut)',
    lib.canonique(objet).replace(/\//g, '\\/') !== SWIFT_FLOTTANT
    && lib.canonique(objet).includes('0.57') && SWIFT_FLOTTANT.includes('0.56999999999999995'));

  const crypto = require('crypto');
  process.env.COACH_SIG_SECRET = 'secret-de-papier';
  const signer = (octets, dev, ts) => crypto.createHmac('sha256', 'secret-de-papier')
    .update(dev + '.' + ts + '.' + crypto.createHash('sha256').update(octets).digest('hex')).digest('hex');
  // 24 sept. 2026 — un horodatage DISTINCT par requête : depuis le nonce
  // (`signatureDejaVue`), deux requêtes qui signent les mêmes octets pour le
  // même device dans la même milliseconde portent la même signature, et la
  // seconde est un rejeu. Ce banc était vert par chance d'horloge.
  let tick = 0;
  const requete = (octetsSignes, corps) => {
    const ts = String(Date.now() + (tick++));
    return { headers: { 'x-flint-device': 'ABC', 'x-flint-ts': ts, 'x-flint-sig': signer(octetsSignes, 'ABC', ts) }, body: corps };
  };
  // Corps PARSÉ (application/json) : le serveur ne peut que canoniser, et
  // les octets de Swift ne sont pas retrouvés — refus, comme dans l'app.
  const rParse = requete(SWIFT_FLOTTANT, objet);
  v('  … un corps parsé par Vercel (application/json) signé sur les octets de Swift est REFUSÉ',
    lib.verifierSignature(rParse, lib.corpsBrut(rParse)).ok === false);
  // Corps BRUT (application/octet-stream → Buffer) : ce sont les octets
  // envoyés, hachés tels quels — accepté.
  const brut = Buffer.from(SWIFT_FLOTTANT, 'utf8');
  const rBrut = requete(brut, brut);
  v('  … le MÊME corps reçu en Buffer (octet-stream) est ACCEPTÉ',
    lib.verifierSignature(rBrut, lib.corpsBrut(rBrut)).ok === true);
  v('  … corpsBrut rend le Buffer tel quel, sans le re-sérialiser',
    lib.corpsBrut(rBrut) === brut);
  v('  … et corpsJSON lit le Buffer comme du JSON (contents, profilTexte)',
    lib.corpsJSON(rBrut).profilTexte === 'score 57/100' && lib.corpsJSON(rBrut).contents.length === 1
    && lib.corpsJSON(rBrut).contents[0].parts[0].functionResponse.response.ratio === 0.57);
  const altere = Buffer.from(SWIFT_FLOTTANT.replace('"s":57', '"s":97'), 'utf8');
  const rAltere = { headers: rBrut.headers, body: altere };
  v('  … un Buffer altéré sous la même signature est REFUSÉ',
    lib.verifierSignature(rAltere, lib.corpsBrut(rAltere)).ok === false);
  // text/plain → chaîne : même traitement, les octets tels quels.
  const rChaine = requete(SWIFT_FLOTTANT, SWIFT_FLOTTANT);
  v('  … une chaîne (text/plain) se signe aussi telle quelle',
    lib.verifierSignature(rChaine, lib.corpsBrut(rChaine)).ok === true);
  delete process.env.COACH_SIG_SECRET;
}

console.log('\n═══ ⑩ GEMINI 3 : LE RÔLE « function » DEVIENT « user » ═══');
{
  // 23 sept., 19 h 55 — 400 « Role 'function' is not supported » au tour qui
  // suit les outils, sur gemini-3.6-flash. L'app envoie « function » ; on
  // normalise ici pour tous les paquets, posés ou à venir.
  const contents = [
    { role: 'user', parts: [{ text: 'salut' }] },
    { role: 'model', parts: [{ functionCall: { name: 'getRecoveryContext', args: {} } }] },
    { role: 'function', parts: [{ functionResponse: { name: 'getRecoveryContext', response: { s: 57 } } }] }
  ];
  const n = lib.roleFonctionVersUser(contents);
  v('le tour « function » repart en « user », parts intactes',
    n[2].role === 'user' && n[2].parts === contents[2].parts);
  v('  … les autres tours ne bougent pas, et l\'entrée n\'est pas modifiée',
    n[0].role === 'user' && n[1].role === 'model' && contents[2].role === 'function');
  v('  … et une valeur qui n\'est pas un tableau ressort telle quelle',
    lib.roleFonctionVersUser(null) === null && lib.roleFonctionVersUser('x') === 'x');
}

console.log('\n═══ ⑪ LES SUITES : LA DERNIÈRE LIGNE DEVIENT UN TABLEAU ═══');
{
  const r1 = lib.extraireSuites('**Récup à 57.**\n- Sommeil : 5 h 45 pour 10 h.\n\nSuites : Un plan sur 3 jours ? | Et ce soir ? | Ma VFC en détail');
  v('« Suites : a | b | c » est retirée du texte et rendue en tableau',
    r1.texte === '**Récup à 57.**\n- Sommeil : 5 h 45 pour 10 h.' && r1.suites.length === 3 && r1.suites[1] === 'Et ce soir ?');
  const r2 = lib.extraireSuites('Texte.\n**Suggestions :** a | b');
  v('  … étiquette « Suggestions », en gras, acceptée', r2.texte === 'Texte.' && r2.suites.join('/') === 'a/b');
  const r3 = lib.extraireSuites('Rien à extraire ici.\nSuites : au milieu ?\nEncore une ligne.');
  v('  … seule la DERNIÈRE ligne compte : une « Suites : » au milieu reste dans le texte',
    r3.suites.length === 0 && r3.texte === 'Rien à extraire ici.\nSuites : au milieu ?\nEncore une ligne.');
  const r4 = lib.extraireSuites('Suites : a | b | c | d | e');
  v('  … au plus trois suites, et un texte vide ne devient pas vide (la ligne reste)',
    r4.suites.length === 3 && r4.texte === 'Suites : a | b | c | d | e');
  v('  … sans ligne : texte intact, tableau vide', lib.extraireSuites('Bonne nuit.').suites.length === 0 && lib.extraireSuites(null).texte === '');
  // 24 sept., 09 h — vu en prod (compte sans bracelet) : « Suites : » va à la
  // ligne AVANT la liste, au lieu de la coller après le « : ».
  const r6 = lib.extraireSuites('**Pas assez de données.**\n\n→ Porte le bracelet.\n\nSuites :\nComment réactiver mes données ? | Pourquoi ma VFC ne remonte pas ?');
  v('  … « Suites : » suivie d\'un SAUT DE LIGNE avant la liste est quand même extraite',
    r6.suites.length === 2 && r6.suites[0] === 'Comment réactiver mes données ?'
    && r6.texte === '**Pas assez de données.**\n\n→ Porte le bracelet.');
  const r7 = lib.extraireSuites('Rien à extraire ici.\nSuites :\nau milieu ?\nEncore une ligne.');
  v('  … et ce saut de ligne ne réintroduit pas le cas ⑪r3 : une ligne APRÈS la liste, rien n\'est extrait',
    r7.suites.length === 0 && r7.texte === 'Rien à extraire ici.\nSuites :\nau milieu ?\nEncore une ligne.');
}

// ── 25 sept. 2026 — le handler du Coach, avec un faux Gemini ─────────────
//
// Les trois correctifs du jour 0 (S0) se jouent par le VRAI handler : ce que
// le faux Gemini reçoit est exactement ce que Google aurait reçu.

process.env.FLINT_APP_SECRET = 'secret-de-banc';
process.env.GEMINI_API_KEY = 'cle-de-banc';
delete process.env.COACH_EXIGE_SIGNATURE;
delete process.env.COACH_SIG_SECRET;
delete process.env.UPSTASH_REDIS_REST_URL;   // le plafond reste dormant
for (const k of ['COACH_V2', 'COACH_V2_APPAREILS', 'COACH_FACTURATION', 'COACH_PRECHARGE', 'COACH_COMPACTION']) delete process.env[k];
const coach = require(path.join(__dirname, '..', 'api', 'coach.js'));
const { prechargement, MARQUEUR, NOTE_ANCIEN } = require(path.join(__dirname, '..', 'api', '_coach-histoire.js'));
const REPONSES_V1 = require(path.join(__dirname, 'fixtures', 'precharge-v1.json'));
const INSTANTANE = require(path.join(__dirname, 'fixtures', 'instantane-synthetique.json'));
const NATIF = require(path.join(__dirname, 'fixtures', 'natif-synthetique.json'));

// 25 sept. 2026 (S4) — une question NOUVELLE ne va plus chez Gemini : le
// serveur rend le préchargement (voir ⑮). Les chapitres qui regardent ce que
// Gemini reçoit jouent donc le DEUXIÈME aller : la question, le tour fabriqué,
// les réponses du téléphone. (Le préfixe fixe du prompt NOMME déjà « DONNÉES
// DU JOUR » : on cherche le bloc rendu, avec son crochet ⟦.)
function reponsesA(p) {
  return { role: 'function', parts: p.appels.map((a) => ({ functionResponse: { name: a.name,
    response: a.name === 'getDay' ? { jour: INSTANTANE.meta.jour, recup: INSTANTANE.recup, nutrition: INSTANTANE.nutrition }
                                    : REPONSES_V1[a.name] } })) };
}
function suivi(texte, version) {
  const p = prechargement({ version: version || 'v1' });
  return [{ role: 'user', parts: [{ text: texte }] }, p.tourModele, reponsesA(p)];
}

/** Un Gemini qui répond d'un bloc et retient le corps reçu. */
let recuParGemini = null;
function fauxGemini() {
  global.fetch = async (url, init) => {
    recuParGemini = JSON.parse(init.body);
    return { ok: true, status: 200,
             text: async () => JSON.stringify({ candidates: [{ content: { role: 'model', parts: [{ text: 'Bonjour.' }] } }] }) };
  };
}
/** Le même, en flux SSE (un seul paquet). */
function fauxGeminiFlux() {
  const sse = 'data: ' + JSON.stringify({ candidates: [{ content: { parts: [{ text: 'Bonjour.' }] } }] }) + '\r\n\r\n';
  global.fetch = async (url, init) => {
    recuParGemini = JSON.parse(init.body);
    const octets = Buffer.from(sse, 'utf8'); let lu = false;
    return { ok: true, status: 200, text: async () => sse,
             body: { getReader: () => ({ read: async () => lu ? { done: true } : (lu = true, { done: false, value: new Uint8Array(octets) }) }) } };
  };
}
function fauxResFlux() {
  const r = fauxRes();
  r.morceaux = [];
  r.writeHead = (c, h) => { r.code = c; Object.assign(r.entetes, h || {}); return r; };
  r.write = (s) => { r.morceaux.push(s); return true; };
  return r;
}
const entetesCoach = { 'x-flint-key': 'secret-de-banc', 'x-flint-device': 'banc-api', 'x-forwarded-for': '203.0.113.61' };
const question = (extra) => Object.assign({
  deviceId: 'banc-api', langue: 'fr', ton: 'aucun', profilTexte: '', memoireTexte: '',
  contents: [{ role: 'user', parts: [{ text: 'Et ma VFC ?' }] }]
}, extra || {});
// Un appareil et une IP neufs à chaque pose : les chapitres S4 en jouent des
// dizaines, et le rate-limit (40 par minute et par appareil) mordrait.
let nPose = 0;
async function poser(corps, res, entetes) {
  const lignes = [];
  const orig = console.log;
  nPose++;
  const h = Object.assign({}, entetesCoach, { 'x-flint-device': 'banc-api-' + nPose,
                                               'x-forwarded-for': '203.0.113.' + (nPose % 250) }, entetes || {});
  console.log = (...a) => lignes.push(a.join(' '));
  try { await coach({ method: 'POST', headers: h, body: corps }, res); }
  finally { console.log = orig; }
  return lignes;
}
/** Toutes les clés d'un objet, à toute profondeur. */
function toutesLesCles(x, acc) {
  acc = acc || [];
  if (Array.isArray(x)) x.forEach(e => toutesLesCles(e, acc));
  else if (x && typeof x === 'object') Object.keys(x).forEach(k => { acc.push(k); toutesLesCles(x[k], acc); });
  return acc;
}
const octets = (x) => Buffer.byteLength(JSON.stringify(x), 'utf8');

(async () => {

console.log('\n═══ ⑫ LA MÉMOIRE GARDE LES FAITS LES PLUS RÉCENTS ═══');
{
  // 45 faits, du plus ANCIEN au plus récent — l'ordre de
  // `CoachMemoire.texteContexte` (« · fait » par ligne).
  const faits = Array.from({ length: 45 }, (_, i) =>
    '· fait n° ' + String(i + 1).padStart(2, '0') + ' — prépare un semi-marathon en mars, déteste le poisson cru');
  const memoire = faits.join('\n');
  v('la fixture dépasse bien les 3 000 caractères (' + memoire.length + ')', memoire.length > 3000);
  fauxGemini();
  const res = fauxRes();
  await poser(question({ memoireTexte: memoire, contents: suivi('Et ma VFC ?') }), res);
  const sys = recuParGemini && recuParGemini.systemInstruction.parts[0].text;
  v('la question passe (200)', res.code === 200, 'code ' + res.code);
  v('le prompt contient le DERNIER fait (le plus récent)', !!sys && sys.includes(faits[44]));
  v('  … et pas le PREMIER (le plus ancien)', !!sys && !sys.includes(faits[0]));
  // La coupe tombe sur un début de ligne : chaque ligne gardée est un fait entier.
  const bloc = sys.split('LORS DE CONVERSATIONS PRÉCÉDENTES :\n')[1].split('\n\nMÉMOIRE')[0];
  const gardees = bloc.split('\n');
  v('  … coupé sur une frontière de ligne : chaque ligne gardée est un fait ENTIER',
    gardees.length > 0 && gardees.every(l => faits.includes(l)), JSON.stringify(gardees[0]));
  // S4 : le prompt les lit du plus RÉCENT au plus ancien (rendreFaits retourne
  // la liste des apps posées, écrite du plus ancien au plus récent).
  v('  … les faits gardés sont la FIN de la liste, sans trou, du plus récent au plus ancien',
    gardees.join('\n') === faits.slice(45 - gardees.length).reverse().join('\n'));
  v('  … au plus 3 000 caractères', bloc.length <= 3000, bloc.length + ' car.');

  const { memoireRecente } = coach;
  v('memoireRecente : une mémoire courte passe telle quelle', memoireRecente('· a\n· b') === '· a\n· b');
  v('  … pas une chaîne → vide', memoireRecente(undefined) === '' && memoireRecente(42) === '');
  // Une coupe qui tombe pile après un saut de ligne ne jette pas une ligne entière.
  const pile = 'x'.repeat(10) + '\n' + 'y'.repeat(2999) + '\n';
  v('  … une coupe qui tombe déjà sur un début de ligne garde cette ligne',
    memoireRecente(pile) === 'y'.repeat(2999) + '\n');
}

console.log('\n═══ ⑬ UNE RÉPONSE D\'OUTIL DE 86 Ko NE REND PLUS UN 413 ═══');
{
  // getSleepHistory(30) tel que PontCoach le rendait le 24 sept. : 30 nuits,
  // `seances` brutes comprises (82 % des octets) — 86 Ko, au-dessus des 64 Ko.
  const nuits = Array.from({ length: 30 }, (_, i) => ({
    jour: '2026-9-' + (i + 1), fuseau: 'Europe/Paris', besoin: 492, score: 71, couverture: 0.97, regul: 82,
    dormi: 412, eveil: 38, auLit: 450, eff: 91, coucher: 1420, lever: 430, coucherVeille: -1, dette: 80,
    reveils: 3, temp: 34.8, spo2: 99, recup: 64, effort: 11.73, kcal: 2380, pas: 9120,
    seances: Array.from({ length: 4 }, (_, j) => ({ id: 's' + i + '-' + j, name: 'Football', start: '18:30', dur: 75,
      avgHr: 142, maxHr: 181, kcal: 690, srcs: { montre: 1 }, zones: [5, 12, 21, 18, 9, 3],
      hr: Array.from({ length: 127 }, (_, k) => 120 + (k % 40)) })),
    vfc: 48, fcRepos: 52, respiration: 14.2
  }));
  const reponseLourde = { qualite: 'good', nuits };
  const taille = octets({ functionResponse: { name: 'getSleepHistory', response: reponseLourde } });
  v('la fixture pèse bien ~86 Ko (' + Math.round(taille / 1024) + ' Ko)', taille > 80 * 1024 && taille < 92 * 1024);
  const tourModele = { role: 'model', parts: [{ functionCall: { name: 'getSleepHistory', args: { joursN: 30 } },
                                                 thoughtSignature: 'sig-originale-de-gemini' }] };
  const contents = [
    { role: 'user', parts: [{ text: 'Pourquoi je suis fatigué ?' }] },
    tourModele,
    { role: 'function', parts: [{ functionResponse: { name: 'getSleepHistory', id: 'appel-1', response: reponseLourde } }] }
  ];
  const avantEnvoi = JSON.stringify(contents);
  fauxGemini();
  const res = fauxRes();
  const lignes = await poser(question({ contents }), res);
  v('la requête passe : 200, pas 413', res.code === 200 && res.corps.mode === 'reponse', 'code ' + res.code + ' ' + JSON.stringify(res.corps));
  const envoye = recuParGemini && recuParGemini.contents;
  const fr = envoye && envoye[2].parts[0].functionResponse;
  // Revue du 25 sept. : l'adaptateur passe AVANT le talon. Les 86 Ko sont
  // surtout des `seances` brutes, que l'adaptateur retire : les 30 nuits
  // tiennent, et le modèle n'a pas à redemander (un tour de moins sur 4).
  v('Gemini reçoit les 30 nuits ADAPTÉES, pas un talon (l\'adaptateur passe d\'abord)',
    !!fr && fr.response.qualite === 'good' && fr.response._adapte === 1 && fr.response.nuits.length === 30
    && octets(envoye[2]) < 16 * 1024 && !JSON.stringify(fr.response).includes('seances'),
    fr && (octets(envoye[2]) + ' o ' + JSON.stringify(fr.response).slice(0, 200)));
  v('  … en unités d\'écran (7h48, 23:40 (veille))', !!fr && fr.response.nuits[0].dormi === '6h52'
    && fr.response.nuits[0].coucher === '23:40 (veille)', fr && JSON.stringify(fr.response.nuits[0]));
  v('  … le nom et l\'id de la réponse sont gardés', !!fr && fr.name === 'getSleepHistory' && fr.id === 'appel-1');
  v('le tour modèle arrive INTACT, thoughtSignature comprise',
    !!envoye && JSON.stringify(envoye[1]) === JSON.stringify(tourModele));
  v('la fonction est pure : le `contents` reçu n\'est pas modifié', JSON.stringify(contents) === avantEnvoi);
  v('le journal compte la part allégée (elague=1)', lignes.some(l => /mode=reponse .*elague=1\b/.test(l)), lignes.join(' | '));

  // Le même fil, en flux : le talon est posé AVANT l'aiguillage.
  fauxGeminiFlux();
  const resF = fauxResFlux();
  await poser(question({ contents, flux: true }), resF);
  v('  … et en flux aussi : 200, les nuits adaptées chez Gemini',
    resF.code === 200 && recuParGemini.contents[2].parts[0].functionResponse.response._adapte === 1
    && recuParGemini.contents[2].parts[0].functionResponse.response.nuits.length === 30);

  // Une réponse encore trop lourde APRÈS adaptation devient le talon.
  const activites = Array.from({ length: 300 }, (_, i) => ({ nom: 'Football du soir n° ' + i, jour: '2026-9-1',
    dureeMin: 75, effortSur20: 12.4, fcMoyenne: 142, fcMax: 181, calories: 690, origine: 'bracelet '.repeat(30) }));
  const lourdeMemeAdaptee = { qualite: 'good', activites };
  const tailleA = octets({ functionResponse: { name: 'getActivityHistory', response: lourdeMemeAdaptee } });
  const filA = [
    { role: 'user', parts: [{ text: 'Mes séances ?' }] },
    { role: 'model', parts: [{ functionCall: { name: 'getActivityHistory', args: { joursN: 90 } }, thoughtSignature: 'sig-a' }] },
    { role: 'function', parts: [{ functionResponse: { name: 'getActivityHistory', id: 'appel-2', response: lourdeMemeAdaptee } }] }
  ];
  fauxGemini();
  const resA = fauxRes();
  await poser(question({ contents: filA }), resA);
  const frA = recuParGemini && recuParGemini.contents[2].parts[0].functionResponse;
  v('une réponse trop lourde MÊME adaptée (' + Math.round(tailleA / 1024) + ' Ko) : 200, talon « expired »',
    resA.code === 200 && tailleA > 70 * 1024 && !!frA && frA.response.qualite === 'expired',
    'code ' + resA.code + ' ' + (frA && JSON.stringify(frA.response).slice(0, 160)));
  v('  … qui dit le poids et demande moins de jours',
    !!frA && /^réponse trop lourde \(\d+ Ko\), allégée par le serveur — redemande avec moins de jours$/.test(frA.response.raison)
    && frA.response.raison.includes('(' + Math.round(tailleA / 1024) + ' Ko)'), frA && frA.response.raison);
  v('  … le nom et l\'id sont gardés', !!frA && frA.name === 'getActivityHistory' && frA.id === 'appel-2');

  // Ce qui n'est pas une réponse d'outil garde sa règle : 413.
  fauxGemini();
  const res413 = fauxRes();
  await poser(question({ contents: [{ role: 'user', parts: [{ text: 'x'.repeat(100 * 1024) }] }] }), res413);
  v('une part de TEXTE de 100 Ko reste un 413 (seules les réponses d\'outils s\'allègent)',
    res413.code === 413 && res413.corps.detail === 'part trop lourde', 'code ' + res413.code);

  // Une réponse légère n'est pas touchée : même référence, rien au journal.
  const { elaguerReponsesLourdes } = coach;
  const leger = [{ role: 'function', parts: [{ functionResponse: { name: 'getTrainingLoad', response: { ratio: 1.1 } } }] }];
  const r = elaguerReponsesLourdes(leger);
  v('une réponse légère sans image ressort à l\'identique (même tour, même part)',
    r !== leger && r[0] === leger[0] && r[0].parts[0] === leger[0].parts[0]);
}

console.log('\n═══ ⑭ LA PHOTO DE PROFIL NE PART PLUS CHEZ GEMINI ═══');
{
  // Un vieux fil qui porte encore une paire getUserProfile, avatar de 300 Ko
  // (2,6 Mo mesurés chez Félix) ; et une photo de repas cachée en profondeur.
  const avatar = 'data:image/jpeg;base64,' + 'A'.repeat(300 * 1024);
  const echange = [
    { role: 'model', parts: [{ functionCall: { name: 'getUserProfile', args: {} }, thoughtSignature: 'sig-profil' },
                             { functionCall: { name: 'getNutritionToday', args: {} } }] },
    { role: 'function', parts: [
      { functionResponse: { name: 'getUserProfile', response: { qualite: 'good', prenom: 'Félix', age: 34, avatar,
                                                               bracelet: { nom: 'V8', photo: 'B'.repeat(2000) } } } },
      { functionResponse: { name: 'getNutritionToday', response: { qualite: 'good', consommees: 1450,
          repas: [{ nom: 'Poke bowl', kcal: 640, ph: 'C'.repeat(5000) }, { nom: 'Pomme', kcal: 80, ph: 'D'.repeat(3000) }] } } }
    ] }
  ];
  // (a) La paire est celle de la question EN COURS : Gemini la lit, adaptée.
  const contents = [{ role: 'user', parts: [{ text: 'Qui suis-je ?' }] }].concat(echange);
  fauxGemini();
  const res = fauxRes();
  const lignes = await poser(question({ contents }), res);
  v('la requête passe (200)', res.code === 200, 'code ' + res.code + ' ' + JSON.stringify(res.corps));
  const envoye = recuParGemini && recuParGemini.contents;
  const cles = toutesLesCles(envoye);
  v('aucune clé « avatar » n\'arrive chez Gemini', !cles.includes('avatar'));
  v('  … ni « photo », ni « ph », à aucune profondeur (tableaux compris)', !cles.includes('photo') && !cles.includes('ph'));
  v('  … et l\'avatar lui-même n\'y est plus, sous aucun nom', !JSON.stringify(envoye).includes('A'.repeat(1000)));
  const profil = envoye[2].parts[0].functionResponse.response;
  // S4 : la réponse de la question en cours passe par l'adaptateur (S2), qui
  // ne garde d'un vieux profil que ce qu'un coach lit.
  v('le profil garde le prénom et l\'âge (adapté : ni bracelet, ni photo)',
    profil.prenom === 'Félix' && profil.age === 34 && profil.qualite === 'good' && !('bracelet' in profil), JSON.stringify(profil));
  v('  … les repas gardent leur nom et leurs kcal',
    envoye[2].parts[1].functionResponse.response.repas.map(r => r.nom + ':' + r.kcal).join(',') === 'Poke bowl:640,Pomme:80');
  v('le tour modèle arrive intact, thoughtSignature comprise',
    JSON.stringify(envoye[1]) === JSON.stringify(contents[1]));
  v('le journal compte les deux parts nettoyées (elague=2)', lignes.some(l => /elague=2\b/.test(l)), lignes.join(' | '));
  v('getUserProfile n\'est plus dans les outils déclarés à Gemini',
    !recuParGemini.tools[0].functionDeclarations.some(o => o.name === 'getUserProfile')
    && recuParGemini.tools[0].functionDeclarations.some(o => o.name === 'setCoachPreferences'));

  // (b) La même paire dans une question PRÉCÉDENTE : un talon, pas même un prénom.
  const fil = contents.concat([{ role: 'model', parts: [{ text: 'Tu es Félix.' }] }], suivi('Et ma récup ?'));
  fauxGemini();
  const res2 = fauxRes();
  const lignes2 = await poser(question({ contents: fil }), res2);
  const envoye2 = recuParGemini.contents;
  v('question précédente : 200, et chaque réponse devient le talon « ancien »',
    res2.code === 200 && envoye2[2].parts.every(p => p.functionResponse.response.qualite === 'ancien'
                                                   && p.functionResponse.response.note === NOTE_ANCIEN),
    JSON.stringify(envoye2[2]).slice(0, 200));
  v('  … l\'appariement tient : le tour modèle d\'avant est intact, signature comprise',
    JSON.stringify(envoye2[1]) === JSON.stringify(contents[1]));
  v('  … rien du profil ne part (ni avatar, ni prénom)', !JSON.stringify(envoye2[2]).includes('Félix'));
  v('journal : stubs=2 marqueurs=1', lignes2.some(l => /mode=reponse /.test(l) && /stubs=2\b/.test(l) && /marqueurs=1\b/.test(l)),
    lignes2.join(' | '));
}

// ═══════════════════════════════════════════════════════════════════════════
//  25 SEPT. 2026 — S4 : L'ORCHESTRATION
//
//  Le préchargement (0 Gemini), le deuxième aller (1 Gemini, rien de
//  fabriqué), la porte de V2, l'instantané, le mémo et « Retenir ». La règle
//  qui ne se discute pas : aucun tour fabriqué n'atteint Gemini — ni son
//  marqueur, ni ses functionCall, ni sa signature factice.
// ═══════════════════════════════════════════════════════════════════════════

/** Un Gemini qui répond ce texte d'un bloc et retient CHAQUE corps reçu. */
function geminiQuiRetient(texte) {
  const recus = [];
  global.fetch = async (url, init) => {
    recuParGemini = JSON.parse(init.body);
    recus.push(recuParGemini);
    return { ok: true, status: 200,
             text: async () => JSON.stringify({ candidates: [{ content: { role: 'model', parts: [{ text: texte }] } }] }) };
  };
  return recus;
}
/** Un Gemini qu'on ne doit pas appeler : il compte, et il casse. */
function geminiInterdit() {
  const appels = [];
  global.fetch = async (url) => { appels.push(String(url)); throw new Error('Gemini ne devait pas être appelé'); };
  return appels;
}
const systeme = (c) => c.systemInstruction.parts[0].text;
const declares = (c) => c.tools[0].functionDeclarations.map(o => o.name);
function rienDeFabrique(c) {
  const s = JSON.stringify(c.contents);
  return !s.includes(MARQUEUR) && !s.includes('skip_thought_signature_validator');
}
const Q = (t) => [{ role: 'user', parts: [{ text: t }] }];
const V1_CINQ = 'getRecoveryContext,getSleepHistory,getTrainingLoad,getNutritionToday,getActivityHistory';
const CAP_V2 = { instantane: 1, outils: 1, natif: 1, memo: 1 };
const APPAREIL_V2 = { 'x-flint-device': 'banc-v2' };
function ouvrirPorte() { process.env.COACH_V2 = '1'; process.env.COACH_V2_APPAREILS = 'autre-appareil,banc-v2'; }
function fermerPorte() { for (const k of ['COACH_V2', 'COACH_V2_APPAREILS', 'COACH_FACTURATION']) delete process.env[k]; }
const corpsV2 = (extra) => Object.assign({ deviceId: 'banc-v2', langue: 'fr', ton: 'analytique', flux: false,
  capacites: CAP_V2, instantane: INSTANTANE, natif: NATIF }, extra || {});
const REPONSE_V2 = '**Récup à 74/100 : tu peux charger.**\n\n## Pourquoi\n- VFC 71 ms, au-dessus de ta normale.\n\n'
  + '## À faire\n- Séance soutenue ce soir.\n\nRetenir : objectif — prépare un semi-marathon en mars\n'
  + 'Suites : Et demain ? | Mon sommeil ?';

console.log('\n═══ ⑮ UNE QUESTION NOUVELLE, SANS capacites : LE PRÉCHARGEMENT V1, ZÉRO GEMINI ═══');
{
  const appels = geminiInterdit();
  const res = fauxRes();
  const lignes = await poser(question({ contents: Q('Pourquoi ma récup est à 74 ?') }), res);
  v('200, mode « outils », et ZÉRO appel à Gemini', res.code === 200 && res.corps && res.corps.mode === 'outils' && appels.length === 0,
    'code ' + res.code + ', ' + appels.length + ' appel(s)');
  v('  … les cinq appels V1, dans l\'ordre, avec leurs arguments',
    res.corps.appels.map(a => a.name).join(',') === V1_CINQ
    && res.corps.appels[1].args.joursN === 7 && res.corps.appels[4].args.joursN === 2, JSON.stringify(res.corps.appels));
  const t = res.corps.tourModele;
  v('  … un tour modèle MARQUÉ : le marqueur, puis un functionCall par appel',
    t.role === 'model' && t.parts[0].text === MARQUEUR && t.parts.length === 6 && t.parts.slice(1).every(p => p.functionCall));
  v('  … les libellés de la langue de l\'app, `v`, et appelsGemini = 0',
    res.corps.libelles.getSleepHistory === 'Lecture de tes nuits…' && res.corps.v === coach.COACH_VERSION && res.corps.appelsGemini === 0);
  v('journal : mode=precharge version=v1 appels=5 gemini=0 cap=-',
    lignes.some(l => /mode=precharge .*version=v1 appels=5\b/.test(l) && /gemini=0\b/.test(l) && /cap=-/.test(l)), lignes.join(' | '));
  const resEn = fauxRes();
  await poser(question({ langue: 'en', contents: Q('Why is my recovery 74?') }), resEn);
  v('  … en anglais, les libellés anglais', resEn.corps.libelles.getSleepHistory === 'Reading your nights…');
  const resFlux = fauxResFlux();
  await poser(question({ flux: true, contents: Q('Et mon sommeil ?') }), resFlux);
  v('  … et avec `flux: true`, c\'est quand même du JSON (l\'app le lit tel quel)',
    resFlux.corps && resFlux.corps.mode === 'outils' && !resFlux.morceaux.length && appels.length === 0);
  v('COACH_VERSION a la forme AAAA-MM-JJ.N, jamais sous le plancher 2026-09-25.1',
    /^\d{4}-\d{2}-\d{2}\.\d+$/.test(coach.COACH_VERSION) && coach.COACH_VERSION >= '2026-09-25.1', coach.COACH_VERSION);
}

console.log('\n═══ ⑯ LE DEUXIÈME ALLER : GEMINI NE VOIT RIEN DE FABRIQUÉ ═══');
{
  const recus = geminiQuiRetient('**Récup à 74/100.**\n\n## À faire\n- Couche-toi à 22:55.\n\nSuites : Et demain ? | Ma VFC ?');
  const res = fauxRes();
  const lignes = await poser(question({ contents: suivi('Pourquoi ma récup est à 74 ?') }), res);
  v('un seul appel à Gemini', recus.length === 1, recus.length + ' appel(s)');
  const c = recus[0];
  v('aucun texte marqueur, aucune signature factice', rienDeFabrique(c), JSON.stringify(c.contents).slice(0, 200));
  v('  … aucun functionCall : Gemini ne voit que la question',
    c.contents.length === 1 && c.contents[0].role === 'user' && c.contents[0].parts[0].text === 'Pourquoi ma récup est à 74 ?',
    JSON.stringify(c.contents).slice(0, 200));
  v('systemInstruction contient DONNÉES DU JOUR, en unités d\'écran',
    systeme(c).includes('⟦DONNÉES DU JOUR') && systeme(c).includes('7h48') && systeme(c).includes('Porridge banane-banc'));
  v('les outils déclarés sont les V1', declares(c).includes('getRecoveryContext') && !declares(c).includes('getDay'));
  const r = res.corps;
  v('la réponse : texte sans suites, suites, v, appelsGemini = 1',
    r.mode === 'reponse' && r.texte === '**Récup à 74/100.**\n\n## À faire\n- Couche-toi à 22:55.'
    && r.suites.length === 2 && r.v === coach.COACH_VERSION && r.appelsGemini === 1, JSON.stringify(r).slice(0, 300));
  v('  … le mémo (question, verdict sans gras, première action), et pas de `retenir` en v1',
    r.memo && r.memo.q === 'Pourquoi ma récup est à 74 ?' && r.memo.v === 'Récup à 74/100.' && r.memo.a === 'Couche-toi à 22:55.'
    && /^\d{4}-\d{2}-\d{2}$/.test(r.memo.d) && !('retenir' in r), JSON.stringify(r.memo));
  const l = lignes.find(x => x.includes('mode=reponse')) || '';
  v('journal : outils=v1 precharge=1 marqueurs=1 stubs=0 toursOutils=0 gemini=1 contenus=<octets>',
    /outils=v1\b/.test(l) && /precharge=1\b/.test(l) && /marqueurs=1\b/.test(l) && /stubs=0\b/.test(l)
    && /toursOutils=0\b/.test(l) && /gemini=1\b/.test(l) && /contenus=\d+/.test(l), l);
  v('  … sans un mot de la question ni de la réponse', !/récup|Récup|74\/100/.test(l), l);
}

console.log('\n═══ ⑰ UN VRAI TOUR D\'OUTILS APRÈS LE PRÉCHARGEMENT ═══');
{
  const vrai = { role: 'model', parts: [{ functionCall: { name: 'getSleepHistory', args: { joursN: 14 } }, thoughtSignature: 'sig-vraie-14' }] };
  const fil = suivi('Et ce mois-ci ?').concat([vrai,
    { role: 'function', parts: [{ functionResponse: { name: 'getSleepHistory', response: REPONSES_V1.getSleepHistory } }] }]);
  const recus = geminiQuiRetient('Réponse.');
  const res = fauxRes();
  const lignes = await poser(question({ contents: fil }), res);
  const c = recus[0];
  v('le vrai tour d\'outils arrive intact, thoughtSignature comprise',
    c.contents.length === 3 && JSON.stringify(c.contents[1]) === JSON.stringify(vrai), JSON.stringify(c.contents).slice(0, 300));
  v('  … sa réponse est adaptée (unités d\'écran, marquée)', c.contents[2].role === 'user'
    && c.contents[2].parts[0].functionResponse.response._adapte === 1
    && /h:mm/.test(c.contents[2].parts[0].functionResponse.response.unites));
  v('  … le tour fabriqué, lui, a disparu', rienDeFabrique(c));
  v('  … et le préchargement reste dans le système', systeme(c).includes('⟦DONNÉES DU JOUR'));
  v('journal : toursOutils=1', lignes.some(l => /mode=reponse /.test(l) && /toursOutils=1\b/.test(l)), lignes.join(' | '));
}

console.log('\n═══ ⑱ V2, PORTE OUVERTE, INSTANTANÉ VALIDE : UN ALLER, UNE REQUÊTE ═══');
{
  ouvrirPorte();
  const recus = geminiQuiRetient(REPONSE_V2);
  const res = fauxRes();
  const lignes = await poser(corpsV2({
    faits: '· (12 sept.) [objectif] finir un 10 km\n· (2 sept.) [preference] déteste le poisson',
    memos: [{ d: '2026-9-15', q: 'Et mon foot ?', v: 'Séance solide.', a: 'Récupère ce soir.' },
            { d: '2026-9-14', q: 'Et ma nuit ?', v: 'Courte.', a: '' }],
    profilTexte: 'BRIEFING-QUI-NE-DOIT-PAS-PARTIR',
    contents: Q('Je peux charger aujourd\'hui ?') }), res, APPAREIL_V2);
  v('pas de préchargement : Gemini est appelé dès le premier aller', recus.length === 1 && res.corps.mode === 'reponse',
    recus.length + ' appel(s), ' + JSON.stringify(res.corps).slice(0, 200));
  const c = recus[0];
  v('les déclarations V2 (getDay…, sans getRecoveryContext ni saveMemoryFact)',
    declares(c).includes('getDay') && !declares(c).includes('getRecoveryContext') && !declares(c).includes('saveMemoryFact'));
  v('l\'instantané et la part native sont rendus dans le système',
    systeme(c).includes('⟦DONNÉES DE L\'APP — au 2026-9-16') && systeme(c).includes('Yaourt grec miel') && systeme(c).includes('APPAREIL ET APP'));
  v('  … et jamais dans `contents`', !JSON.stringify(c.contents).includes('Yaourt'));
  v('  … le briefing ne double pas un instantané valide', !systeme(c).includes('BRIEFING-QUI-NE-DOIT-PAS-PARTIR'));
  v('  … les faits dans l\'ordre reçu (le plus récent d\'abord), puis les échanges récents',
    systeme(c).indexOf('finir un 10 km') > 0 && systeme(c).indexOf('finir un 10 km') < systeme(c).indexOf('déteste le poisson')
    && systeme(c).includes('ÉCHANGES RÉCENTS') && systeme(c).includes('Séance solide.'));
  const r = res.corps;
  v('la réponse : `retenir` détaché, texte sans « Retenir » ni « Suites »',
    JSON.stringify(r.retenir) === JSON.stringify([{ categorie: 'objectif', fait: 'prépare un semi-marathon en mars' }])
    && !/Retenir|Suites/.test(r.texte), JSON.stringify(r.retenir));
  v('  … le mémo est daté du jour de l\'instantané', r.memo && r.memo.d === '2026-9-16' && r.memo.a === 'Séance soutenue ce soir.',
    JSON.stringify(r.memo));
  v('  … le tourModele garde le brut', r.tourModele.parts[0].text.includes('Retenir : objectif'));
  const l = lignes.find(x => x.includes('mode=reponse')) || '';
  v('journal : outils=v2 cap=i1o1n1m1 precharge=0 inst=<octets> natif=<octets> memos=2 retenir=1',
    /outils=v2\b/.test(l) && /cap=i1o1n1m1\b/.test(l) && /precharge=0\b/.test(l) && /inst=\d+/.test(l)
    && /natif=\d+/.test(l) && /memos=2\b/.test(l) && /retenir=1\b/.test(l), l);
  fermerPorte();
}

console.log('\n═══ ⑲ V2 SANS INSTANTANÉ (MOTEUR EN RETARD) : PRÉCHARGEMENT getDay(0) ═══');
{
  ouvrirPorte();
  const appels = geminiInterdit();
  const res = fauxRes();
  const lignes = await poser(corpsV2({ instantane: null, natif: { q: 'invalide' }, profilTexte: 'briefing-de-repli',
                                       contents: Q('Comment je vais ?') }), res, APPAREIL_V2);
  v('un seul appel fabriqué, getDay{jour:0}, et zéro Gemini',
    res.corps.mode === 'outils' && res.corps.appels.length === 1 && res.corps.appels[0].name === 'getDay'
    && res.corps.appels[0].args.jour === 0 && appels.length === 0, JSON.stringify(res.corps.appels));
  v('  … libellé V2 compris', res.corps.libelles.getDay === 'Lecture de cette journée…');
  v('journal : version=v2 appels=1 instRefus=absent',
    lignes.some(l => /mode=precharge .*version=v2 appels=1\b/.test(l) && /instRefus=absent\b/.test(l)), lignes.join(' | '));
  // Le deuxième aller, avec le tour rendu tel que le téléphone le garde.
  const recus = geminiQuiRetient('Réponse.');
  const res2 = fauxRes();
  await poser(corpsV2({ instantane: null, natif: { q: 'invalide' }, profilTexte: 'briefing-de-repli',
                        contents: Q('Comment je vais ?').concat([res.corps.tourModele, reponsesA(prechargement({ version: 'v2' }))]) }),
              res2, APPAREIL_V2);
  const c = recus[0];
  v('au deuxième aller : DONNÉES DU JOUR rendues depuis getDay, déclarations V2, rien de fabriqué',
    !!c && systeme(c).includes('⟦DONNÉES DE L\'APP — DONNÉES DU JOUR') && systeme(c).includes('GETDAY') && declares(c).includes('getDay')
    && rienDeFabrique(c) && c.contents.length === 1);
  v('  … et le briefing sert de repli (pas d\'instantané)', !!c && systeme(c).includes('briefing-de-repli'));
  fermerPorte();
}

console.log('\n═══ ⑳ LA PORTE FERMÉE : V1, ET L\'INSTANTANÉ N\'ATTEINT JAMAIS GEMINI ═══');
{
  fermerPorte();
  geminiInterdit();
  const res = fauxRes();
  await poser(corpsV2({ contents: Q('Je peux charger ?') }), res, APPAREIL_V2);
  v('COACH_V2 absent : le préchargement V1 des cinq, malgré capacites et instantané',
    res.corps.mode === 'outils' && res.corps.appels.map(a => a.name).join(',') === V1_CINQ);
  const recus = geminiQuiRetient('Réponse.');
  const res2 = fauxRes();
  const lignes = await poser(corpsV2({ contents: Q('Je peux charger ?').concat([res.corps.tourModele, reponsesA(prechargement({ version: 'v1' }))]) }),
                             res2, APPAREIL_V2);
  const tout = JSON.stringify(recus[0] || {});
  // Revue du 25 sept. (majeur) : l'app v2 n'envoie plus de briefing quand elle
  // a un instantané ; porte fermée, le Coach n'avait plus NI prénom NI objectif
  // NI allergies. Le profil de l'instantané — lui seul, réduit — les rend.
  v('au deuxième aller, de l\'instantané ne part QUE le profil ; ni repas, ni séances, ni part native',
    recus.length === 1 && !tout.includes('Yaourt grec miel') && !tout.includes('5:05 /km')
    && !tout.includes('§ RÉCUPÉRATION') && !tout.includes('NUIT ET SOMMEIL') && !tout.includes('APPAREIL ET APP'));
  const sysF = systeme(recus[0]);
  v('  … le profil est là, sous le briefing : prénom, objectif, allergies, régime',
    sysF.includes('CE QUE TU SAIS D\'ELLE') && sysF.includes('§ PROFIL') && sysF.includes('prenom : Test')
    && sysF.includes('Sèche') && sysF.includes('arachide') && sysF.includes('omnivore'), sysF.slice(sysF.indexOf('CE QUE TU SAIS')));
  v('  … réduit : ni taille, ni les autres réponses de l\'onboarding (café, alcool, stress)',
    !sysF.includes('tailleCm') && !sysF.includes('occasionnel') && !sysF.includes('modere') && !sysF.includes('sportsPratiques'));
  v('  … les outils sont les V1, les données celles du préchargement',
    declares(recus[0]).includes('getRecoveryContext') && systeme(recus[0]).includes('⟦DONNÉES DU JOUR'));
  v('  … journal : outils=v1 inst=- natif=- cap=i1o1n1m1 profilInst=1',
    lignes.some(l => /mode=reponse /.test(l) && /outils=v1\b/.test(l) && /inst=- /.test(l) && /natif=- /.test(l) && /cap=i1o1n1m1\b/.test(l)
      && /profilInst=1\b/.test(l)),
    lignes.join(' | '));
  // Un briefing présent (app posée, ou app v2 sans instantané) fait foi : rien de l'instantané.
  const recusB = geminiQuiRetient('Réponse.');
  const lignesB = await poser(corpsV2({ profilTexte: '· Objectif : Sèche', contents: Q('Je peux charger ?').concat([res.corps.tourModele,
    reponsesA(prechargement({ version: 'v1' }))]) }), fauxRes(), APPAREIL_V2);
  v('  … avec un briefing, le briefing seul : aucun § PROFIL de l\'instantané',
    recusB.length === 1 && systeme(recusB[0]).includes('· Objectif : Sèche') && !systeme(recusB[0]).includes('§ PROFIL')
    && !lignesB.some(l => /profilInst=/.test(l)));
  const recusV = geminiQuiRetient('Réponse.');
  await poser(corpsV2({ instantane: { visite: true }, contents: Q('Je peux charger ?').concat([res.corps.tourModele,
    reponsesA(prechargement({ version: 'v1' }))]) }), fauxRes(), APPAREIL_V2);
  v('  … et une visite guidée n\'invente aucun profil', recusV.length === 1 && !systeme(recusV[0]).includes('§ PROFIL'));

  // La porte, cas par cas (le préchargement dit la version choisie).
  const version = async (env, entetes, capacites) => {
    fermerPorte();
    Object.assign(process.env, env);
    geminiInterdit();
    const r = fauxRes();
    await poser(corpsV2({ instantane: null, capacites, contents: Q('Et aujourd\'hui ?') }), r, entetes);
    fermerPorte();
    return r.corps && r.corps.appels && r.corps.appels[0] && r.corps.appels[0].name === 'getDay' ? 'v2' : 'v1';
  };
  v('appareil listé, COACH_V2=1 → v2', await version({ COACH_V2: '1', COACH_V2_APPAREILS: 'banc-v2' }, APPAREIL_V2, CAP_V2) === 'v2');
  v('le nom ENTIER, pas un préfixe : « banc-v2x » listé ne vaut pas pour « banc-v2 »',
    await version({ COACH_V2: '1', COACH_V2_APPAREILS: 'banc-v2x, banc' }, APPAREIL_V2, CAP_V2) === 'v1');
  v('COACH_V2=0 ferme, même pour un appareil listé', await version({ COACH_V2: '0', COACH_V2_APPAREILS: 'banc-v2' }, APPAREIL_V2, CAP_V2) === 'v1');
  v('COACH_FACTURATION=1 ouvre à tout appareil', await version({ COACH_V2: '1', COACH_FACTURATION: '1' }, { 'x-flint-device': 'inconnu-42' }, CAP_V2) === 'v2');
  v('porte ouverte mais moteur OTA plus vieux (outils: 0) → v1',
    await version({ COACH_V2: '1', COACH_V2_APPAREILS: 'banc-v2' }, APPAREIL_V2, { instantane: 1, outils: 0, natif: 1, memo: 1 }) === 'v1');
  v('« 1 » en chaîne n\'est pas une capacité → v1',
    await version({ COACH_V2: '1', COACH_V2_APPAREILS: 'banc-v2' }, APPAREIL_V2, { instantane: 1, outils: '1', natif: 1, memo: 1 }) === 'v1');
}

console.log('\n═══ ㉑ UN MESSAGE ANODIN : NI PRÉCHARGEMENT, NI MÉMO ═══');
{
  const recus = geminiQuiRetient('Avec plaisir !\n\nSuites : Et demain ? | Ma VFC ?');
  const res = fauxRes();
  await poser(question({ contents: Q('merci !') }), res);
  v('« merci ! » : pas de préchargement, Gemini directement', recus.length === 1 && res.corps.mode === 'reponse');
  v('  … et aucun mémo (null)', res.corps.memo === null, JSON.stringify(res.corps.memo));
  v('  … le système le sait anodin', systeme(recus[0]).includes('MESSAGE ANODIN'));
  ouvrirPorte();
  const recus2 = geminiQuiRetient('Salut !');
  const res2 = fauxRes();
  await poser(corpsV2({ contents: Q('Salut') }), res2, APPAREIL_V2);
  v('en v2 : l\'instantané réduit au prénom (pas les repas)',
    recus2.length === 1 && systeme(recus2[0]).includes('prenom : Test') && !systeme(recus2[0]).includes('Yaourt'));
  v('  … aucun mémo non plus, mais `retenir` (v2) est là', res2.corps.memo === null && Array.isArray(res2.corps.retenir));
  fermerPorte();
}

console.log('\n═══ ㉒ COACH_PRECHARGE=0 : LE LEVIER QUI COUPE LE PRÉCHARGEMENT ═══');
{
  process.env.COACH_PRECHARGE = '0';
  const recus = geminiQuiRetient('Réponse directe.');
  const res = fauxRes();
  await poser(question({ contents: Q('Pourquoi ma récup est à 74 ?') }), res);
  v('une question nouvelle va chez Gemini directement', recus.length === 1 && res.corps.mode === 'reponse');
  v('  … sans DONNÉES DU JOUR (rien n\'a été préchargé)', !systeme(recus[0]).includes('⟦DONNÉES DU JOUR'));
  delete process.env.COACH_PRECHARGE;
}

console.log('\n═══ ㉓ LES ÉCHANGES D\'AVANT : UN TALON, OU RETIRÉS (COACH_COMPACTION) ═══');
{
  const ancien = [
    { role: 'user', parts: [{ text: 'Et ma charge ?' }] },
    { role: 'model', parts: [{ functionCall: { name: 'getTrainingLoad', args: {} }, thoughtSignature: 'sig-ancienne' }] },
    { role: 'function', parts: [{ functionResponse: { name: 'getTrainingLoad', response: REPONSES_V1.getTrainingLoad } }] },
    { role: 'model', parts: [{ text: 'Charge optimale.' }] }
  ];
  const fil = ancien.concat(suivi('Et aujourd\'hui ?'));
  let recus = geminiQuiRetient('Ok.');
  await poser(question({ contents: fil }), fauxRes());
  v('par défaut (« stub ») : l\'échange reste, sa charge devient un talon',
    recus[0].contents.length === 5 && recus[0].contents[2].parts[0].functionResponse.response.qualite === 'ancien'
    && JSON.stringify(recus[0].contents[1]) === JSON.stringify(ancien[1]));
  process.env.COACH_COMPACTION = 'retirer';
  recus = geminiQuiRetient('Ok.');
  const lignes = await poser(question({ contents: fil }), fauxRes());
  v('COACH_COMPACTION=retirer : l\'appel et sa réponse partent ENSEMBLE',
    recus[0].contents.length === 3 && !JSON.stringify(recus[0].contents).includes('functionCall')
    && recus[0].contents[1].parts[0].text === 'Charge optimale.', JSON.stringify(recus[0].contents).slice(0, 300));
  v('  … journal : retires=1', lignes.some(l => /mode=reponse /.test(l) && /retires=1\b/.test(l)), lignes.join(' | '));
  delete process.env.COACH_COMPACTION;
}

console.log('\n═══ ㉔ LE CÂBLAGE : UNE SEULE PRÉPARATION, UN SEUL CORPS ═══');
{
  const src = require('fs').readFileSync(path.join(__dirname, '..', 'api', 'coach.js'), 'utf8');
  v('coach.js appelle preparerPourGemini, une fois', (src.match(/preparerPourGemini\(/g) || []).length === 1);
  v('  … et gReq part des tours PRÉPARÉS', /contents: prep\.contents/.test(src));
  v('  … aucun corps Gemini bâti ailleurs (tout appel passe `corps: gReq`)',
    (src.match(/corps: gReq/g) || []).length === 3 && !/roleFonctionVersUser\(contents\)/.test(src));
  v('l\'en-tête interdit de retirer ou contourner le retrait, et de revenir sous cette version',
    /NE S'ENLÈVE NI NE SE CONTOURNE/.test(src) && /NE JAMAIS REDÉPLOYER UN coach\.js ANTÉRIEUR/.test(src));
  v('le flux retient avec partieSureMeta ; extraireSuites n\'est plus appelé',
    /partieSureMeta\(brut[,)]/.test(src) && !/extraireSuites\(/.test(src));
}

console.log('\n' + vert + ' vert(s), ' + rouge + ' rouge(s)\n');
process.exitCode = rouge ? 1 : 0;

})();
