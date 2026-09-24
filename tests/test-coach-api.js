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
  v('coach.js borne la conversation', /contents\.length > 60/.test(src));
  v('coach.js borne le profil et la mémoire', /slice\(0, 4000\)/.test(src) && /slice\(0, 2000\)/.test(src));
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
  const requete = (octetsSignes, corps) => {
    const ts = String(Date.now());
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

console.log('\n' + vert + ' vert(s), ' + rouge + ' rouge(s)\n');
process.exitCode = rouge ? 1 : 0;
