// ═══════════════════════════════════════════════════════════════════════════
//  LE BANC DE L'HISTORIQUE DU COACH — api/_coach-histoire.js
//
//  25 sept. 2026 — Coach v2. Le serveur fabrique un tour d'outils (le
//  pré-chargement) qui restera pour toujours dans les fils rangés sur les
//  téléphones, sans vraie thoughtSignature. Ce banc prouve qu'il n'atteint
//  jamais Gemini, qu'un vrai tour du modèle ressort à l'octet près, que
//  l'appariement appel ↔ réponse tient, et que la préparation est idempotente.
//  Puis les métadonnées de fin de réponse (Suites, Retenir), la retenue du
//  flux et le mémo déterministe.
//
//  Fonctions pures : aucun réseau, aucune clé.
// ═══════════════════════════════════════════════════════════════════════════

const path = require('path');
const H = require(path.join(__dirname, '..', 'api', '_coach-histoire.js'));
const lib = require(path.join(__dirname, '..', 'api', '_lib.js'));

let vert = 0, rouge = 0;
function v(titre, ok, detail) {
  if (ok) { vert++; console.log('  ✅ ' + titre); }
  else { rouge++; console.log('  ❌ ' + titre + (detail ? '   ' + detail : '')); }
}
const J = (x) => JSON.stringify(x);

// ── Le décor : des tours comme l'app les envoie ────────────────────────────
const question = (t) => ({ role: 'user', parts: [{ text: t }] });
const reponse = (t) => ({ role: 'model', parts: [{ text: t }] });
const appels = (liste, sig) => ({ role: 'model', parts: liste.map(([name, args], i) =>
  Object.assign({ functionCall: { name, args: args || {} } }, (sig && i === 0) ? { thoughtSignature: sig } : {})) });
const reponses = (liste, role) => ({ role: role || 'function', parts: liste.map(([name, response]) =>
  ({ functionResponse: { name, response } })) });

// L'adaptateur de S2 est injecté ; ici un double qui en tient le contrat
// (sortie marquée _adapte:1, une entrée déjà adaptée ressort telle quelle).
const adapter = (nom, r) => (r && typeof r === 'object' && !Array.isArray(r))
  ? (r._adapte ? r : Object.assign({}, r, { _adapte: 1 })) : r;

/** Le pré-chargement tel que le téléphone le renvoie : le tour du serveur,
 *  puis un tour « function » avec une réponse par appel. */
function paireMarquee(version) {
  const p = H.prechargement({ version });
  return [p.tourModele, reponses(p.appels.map((a) => [a.name, { q: 'good', de: a.name }]))];
}

/** L'appariement : chaque tour d'appels est suivi d'un tour d'autant de
 *  réponses, et chaque tour de réponses suit un tour d'appels. */
function appariementIntact(c) {
  for (let i = 0; i < c.length; i++) {
    const nApp = (c[i].parts || []).filter((p) => p.functionCall).length;
    const nRep = (c[i].parts || []).filter((p) => p.functionResponse).length;
    if (nApp) {
      const s = c[i + 1];
      const n2 = s ? (s.parts || []).filter((p) => p.functionResponse).length : 0;
      if (n2 !== nApp) return 'tour ' + i + ' : ' + nApp + ' appel(s), ' + n2 + ' réponse(s)';
    }
    if (nRep) {
      const avant = c[i - 1];
      if (!avant || avant.role !== 'model' || !(avant.parts || []).some((p) => p.functionCall)) return 'réponse orpheline au tour ' + i;
    }
  }
  return '';
}

(async () => {

console.log('\n═══ ① LE PRÉ-CHARGEMENT FABRIQUÉ ═══');
{
  const p = H.prechargement({ version: 'v1' });
  v('v1 : les cinq outils d\'avant, dans l\'ordre',
    p.appels.map((a) => a.name).join(',') === 'getRecoveryContext,getSleepHistory,getTrainingLoad,getNutritionToday,getActivityHistory',
    J(p.appels));
  v('  … avec 7 nuits et 2 jours d\'activités', p.appels[1].args.joursN === 7 && p.appels[4].args.joursN === 2);
  v('  … un tour modèle marqué en tête', p.tourModele.role === 'model' && p.tourModele.parts[0].text === H.MARQUEUR);
  v('  … puis un functionCall par appel, avec la signature de ceinture',
    p.tourModele.parts.length === 6 && p.tourModele.parts.slice(1).every((x) => x.functionCall
      && x.thoughtSignature === 'skip_thought_signature_validator'));
  const p2 = H.prechargement({ version: 'v2' });
  v('v2 : getDay{jour:0} seul', J(p2.appels) === J([{ name: 'getDay', args: { jour: 0 } }]), J(p2.appels));
  v('une version inconnue retombe sur v1', H.prechargement({}).appels.length === 5 && H.prechargement().appels.length === 5);
  p.appels[1].args.joursN = 99;
  v('chaque appel rend des objets neufs (rien de partagé)', H.prechargement({ version: 'v1' }).appels[1].args.joursN === 7);
  v('le marqueur est celui de l\'app (CoachReseau.marqueurPrecharge)', H.MARQUEUR === '⟦flint-pre:v1⟧');
}

console.log('\n═══ ② UNE NOUVELLE QUESTION, ET LAQUELLE ═══');
{
  v('dernier tour = question → nouvelle', H.estNouvelleQuestion([question('Et ma VFC ?')]));
  v('dernier tour = réponses d\'outils → pas nouvelle',
    !H.estNouvelleQuestion([question('Q'), appels([['getDay']]), reponses([['getDay', {}]])]));
  v('  … même normalisées en « user »',
    !H.estNouvelleQuestion([question('Q'), appels([['getDay']]), reponses([['getDay', {}]], 'user')]));
  v('dernier tour = modèle → pas nouvelle', !H.estNouvelleQuestion([question('Q'), reponse('R')]));
  v('vide ou pas un tableau → pas nouvelle', !H.estNouvelleQuestion([]) && !H.estNouvelleQuestion(null));
  v('derniereQuestion lit la question sous les tours d\'outils',
    H.derniereQuestion([question('Q1'), reponse('R1'), question(' Q2 '), appels([['getDay']]), reponses([['getDay', {}]])]) === 'Q2');
  v('  … et rend « » sans question', H.derniereQuestion([reponse('R')]) === '' && H.derniereQuestion(null) === '');
}

console.log('\n═══ ③ LA PAIRE DE LA QUESTION EN COURS : RENDUE, JAMAIS MONTRÉE ═══');
{
  const c = [question('Q1'), reponse('R1'), question('Pourquoi ma récup ?'), ...paireMarquee('v1')];
  const avant = J(c);
  const p = H.preparerPourGemini(c, { adapter, compaction: 'stub', budgetOctets: 60000 });
  const tout = J(p.contents);
  v('aucune trace du marqueur dans ce qui part à Gemini', !tout.includes(H.MARQUEUR), tout.slice(0, 200));
  v('  … ni de la signature factice', !tout.includes('skip_thought_signature_validator'));
  v('  … ni d\'un functionCall fabriqué', !p.contents.some((t) => t.parts.some((x) => x.functionCall)));
  v('le fil finit sur la question : Gemini y répond', p.contents[p.contents.length - 1].parts[0].text === 'Pourquoi ma récup ?');
  v('les 5 résultats reviennent dans `precharges`, dans l\'ordre',
    p.precharges.map((x) => x.nom).join(',') === 'getRecoveryContext,getSleepHistory,getTrainingLoad,getNutritionToday,getActivityHistory',
    J(p.precharges.map((x) => x.nom)));
  v('  … avec leurs arguments', p.precharges[1].args.joursN === 7);
  v('  … et leur réponse, passée par l\'adaptateur',
    p.precharges.every((x) => x.response && x.response._adapte === 1 && x.response.de === x.nom));
  v('stats : un marqueur retiré', p.stats.marqueurs === 1, J(p.stats));
  v('l\'entrée n\'est pas modifiée', J(c) === avant);
}

console.log('\n═══ ④ LES PAIRES DES QUESTIONS PRÉCÉDENTES SORTENT AUSSI ═══');
{
  const c = [question('Q1'), ...paireMarquee('v1'), reponse('R1'),
             question('Q2'), ...paireMarquee('v2'), reponse('R2'),
             question('Q3')];
  const p = H.preparerPourGemini(c, { adapter });
  v('plus aucun marqueur', !J(p.contents).includes(H.MARQUEUR));
  v('rien dans `precharges` : elles ne sont pas de cette question', p.precharges.length === 0, J(p.precharges));
  v('deux marqueurs comptés', p.stats.marqueurs === 2, J(p.stats));
  v('il reste Q1, R1, Q2, R2, Q3', p.contents.map((t) => t.parts[0].text).join('/') === 'Q1/R1/Q2/R2/Q3',
    p.contents.map((t) => t.parts[0].text).join('/'));
  // Un tour marqué sans réponse (l'app n'a jamais rappelé) : lui seul part,
  // jamais la question qui le suit.
  const c2 = [question('Q1'), H.prechargement().tourModele, question('Q2')];
  const p2 = H.preparerPourGemini(c2, { adapter });
  v('un tour marqué sans réponse part seul, la question suivante reste',
    p2.contents.length === 2 && p2.contents[1].parts[0].text === 'Q2', J(p2.contents));
}

console.log('\n═══ ⑤ UN VRAI TOUR DU MODÈLE RESSORT À L\'OCTET PRÈS ═══');
{
  const vraiCourant = appels([['getSleepHistory', { joursN: 14 }], ['getTrainingLoad']], 'vraie-signature-courante');
  const vraiAncien = appels([['getActivityHistory', { joursN: 5 }]], 'vraie-signature-ancienne');
  const c = [question('Q1'), vraiAncien, reponses([['getActivityHistory', { lourd: 'x'.repeat(500) }]]), reponse('R1'),
             question('Q2'), ...paireMarquee('v1'), vraiCourant,
             reponses([['getSleepHistory', { nuits: [1, 2] }], ['getTrainingLoad', { ratio: 0.9 }]])];
  for (const mode of ['stub', 'retirer']) {
    const p = H.preparerPourGemini(c, { adapter, compaction: mode });
    const ici = p.contents.find((t) => t.parts.some((x) => x.thoughtSignature === 'vraie-signature-courante'));
    v(`[${mode}] le tour d'appels de la question en cours : même objet, mêmes octets`,
      ici === vraiCourant && J(ici) === J(vraiCourant));
    const ancien = p.contents.find((t) => t.parts.some((x) => x.thoughtSignature === 'vraie-signature-ancienne'));
    if (mode === 'stub') v('[stub] le tour d\'appels d\'une question ANCIENNE aussi', ancien === vraiAncien);
    else v('[retirer] … et l\'ancien est retiré avec sa réponse, pas modifié', ancien === undefined);
    v(`[${mode}] l'appariement tient`, appariementIntact(p.contents) === '', appariementIntact(p.contents));
    v(`[${mode}] les résultats du pré-chargement restent rendus`, p.precharges.length === 5);
  }
}

console.log('\n═══ ⑥ LES CHARGES DES QUESTIONS PRÉCÉDENTES DEVIENNENT UN TALON ═══');
{
  const c = [question('Q1'), appels([['getActivityHistory', { joursN: 5 }]], 'sig-a'),
             reponses([['getActivityHistory', { lignes: 'x'.repeat(3000) }]]), reponse('R1'),
             question('Q2'), appels([['getSleepHistory', { joursN: 14 }]], 'sig-b'),
             reponses([['getSleepHistory', { nuits: 'y'.repeat(200) }]])];
  const p = H.preparerPourGemini(c, { adapter });
  const ancienne = p.contents[2].parts[0].functionResponse.response;
  v('la réponse ancienne est un talon « ancien »',
    ancienne.qualite === 'ancien' && ancienne.note === H.NOTE_ANCIEN && Object.keys(ancienne).length === 2, J(ancienne));
  v('  … son nom reste en face de son appel', p.contents[2].parts[0].functionResponse.name === 'getActivityHistory');
  const courante = p.contents[6].parts[0].functionResponse.response;
  v('la réponse de la question en cours est intacte (adaptée seulement)', courante.nuits.length === 200 && courante._adapte === 1);
  v('stats : un talon', p.stats.stubs === 1, J(p.stats));
  v('« function » devient « user » partout', p.contents.every((t) => t.role !== 'function'));
  v('l\'appariement tient', appariementIntact(p.contents) === '', appariementIntact(p.contents));
}

console.log('\n═══ ⑦ LA PRÉPARATION EST IDEMPOTENTE ═══');
{
  const c = [question('Q1'), ...paireMarquee('v1'), appels([['getSleepHistory', { joursN: 14 }]], 'sig-1'),
             reponses([['getSleepHistory', { n: 1 }]]), reponse('R1'),
             question('Q2'), appels([['getTrainingLoad'], ['getNutritionToday']], 'sig-2'),
             reponses([['getTrainingLoad', { r: 1 }], ['getNutritionToday', { k: 2 }]]), reponse('R2'),
             question('Q3'), ...paireMarquee('v1')];
  for (const mode of ['stub', 'retirer']) {
    const opts = { adapter, compaction: mode, budgetOctets: 60000 };
    const p1 = H.preparerPourGemini(c, opts);
    const p2 = H.preparerPourGemini(p1.contents, opts);
    v(`[${mode}] la rejouer sur sa propre sortie ne change rien`, J(p2.contents) === J(p1.contents));
    v(`[${mode}]   … et ne trouve plus rien à faire`,
      p2.stats.marqueurs === 0 && p2.stats.stubs === 0 && p2.stats.retires === 0 && p2.stats.coupees === 0, J(p2.stats));
  }
  // Le talon posé par l'APP ({q:'ancien'}, CoachReseau.allegerPourStockage) :
  // le serveur le remplace une fois par le sien, puis plus jamais.
  const app = [question('Q1'), appels([['getDay']], 's'), reponses([['getDay', { q: 'ancien', note: 'lu lors d\'une question précédente — redemande l\'outil si besoin' }]]),
               reponse('R1'), question('Q2')];
  const a1 = H.preparerPourGemini(app, { adapter });
  const a2 = H.preparerPourGemini(a1.contents, { adapter });
  v('le talon de l\'app devient celui du serveur, une seule fois', J(a1.contents) === J(a2.contents) && a2.stats.stubs === 0);
}

console.log('\n═══ ⑧ LE BUDGET GARDE TOUJOURS LA QUESTION EN COURS ═══');
{
  const long = (i) => reponse('R' + i + ' ' + 'z'.repeat(15000));
  const c = [];
  for (let i = 1; i <= 6; i++) c.push(question('Q' + i), long(i));
  c.push(question('Q7'), ...paireMarquee('v1'));
  const p = H.preparerPourGemini(c, { adapter, budgetOctets: 60000 });
  v('sous le budget', p.stats.octets <= 60000, p.stats.octets + ' o');
  v('les plus VIEILLES questions sont parties', p.stats.coupees >= 2 && p.contents[0].parts[0].text !== 'Q1', J(p.stats));
  v('le fil repart sur une question', p.contents[0].role === 'user' && typeof p.contents[0].parts[0].text === 'string');
  v('la question en cours est là, et c\'est la dernière', p.contents[p.contents.length - 1].parts[0].text === 'Q7');
  v('  … et son pré-chargement est toujours rendu', p.precharges.length === 5);
  v('`octets` est la taille réelle de ce qui part', p.stats.octets === Buffer.byteLength(J(p.contents)));
  // La question en cours à elle seule dépasse : on la garde entière, on ne boucle pas.
  const seule = [question('Q1'), reponse('R1'),
                 question('Q2'), appels([['getSleepHistory', { joursN: 14 }]], 'sig'),
                 reponses([['getSleepHistory', { gros: 'w'.repeat(70000) }]])];
  const ps = H.preparerPourGemini(seule, { adapter, budgetOctets: 60000 });
  v('une question en cours plus lourde que le budget reste entière',
    ps.contents.length === 3 && ps.contents[0].parts[0].text === 'Q2' && ps.contents[1].parts[0].thoughtSignature === 'sig',
    J(ps.stats));
}

console.log('\n═══ ⑨ LE MODE « RETIRER » (REPLI COACH_COMPACTION=retirer) ═══');
{
  const mixte = { role: 'model', parts: [{ text: 'Je regarde.' }, { functionCall: { name: 'getTrainingLoad', args: {} }, thoughtSignature: 'sig-m' }] };
  const c = [question('Q1'), appels([['getSleepHistory', { joursN: 7 }]], 'sig-1'), reponses([['getSleepHistory', { a: 1 }]]),
             appels([['getActivityHistory', { joursN: 2 }]], 'sig-2'), reponses([['getActivityHistory', { b: 2 }]]), reponse('R1'),
             question('Q2'), mixte, reponses([['getTrainingLoad', { c: 3 }]]), reponse('R2'),
             question('Q3'), appels([['getDay', { jour: -1 }]], 'sig-3'), reponses([['getDay', { d: 4 }]])];
  const p = H.preparerPourGemini(c, { adapter, compaction: 'retirer' });
  v('les échanges d\'outils anciens sont partis, appel ET réponse', p.stats.retires === 2, J(p.stats));
  v('  … les questions et réponses anciennes restent',
    p.contents.slice(0, 2).map((t) => t.parts[0].text).join('/') === 'Q1/R1');
  v('un tour mixte (texte + appel) reste tel quel, sa réponse devient un talon',
    p.contents.includes(mixte) && p.contents[p.contents.indexOf(mixte) + 1].parts[0].functionResponse.response.qualite === 'ancien');
  v('l\'échange de la question en cours est intact',
    p.contents[p.contents.length - 2].parts[0].thoughtSignature === 'sig-3'
    && p.contents[p.contents.length - 1].parts[0].functionResponse.response.d === 4);
  v('l\'appariement tient', appariementIntact(p.contents) === '', appariementIntact(p.contents));
}

console.log('\n═══ ⑩ UN ADAPTATEUR ABSENT OU QUI LÈVE NE CASSE RIEN ═══');
{
  const c = [question('Q'), appels([['getDay']], 's'), reponses([['getDay', { x: 1 }]])];
  const p = H.preparerPourGemini(c, { adapter: () => { throw new Error('boum'); } });
  v('un adaptateur qui lève : la réponse passe telle quelle', p.contents[2].parts[0].functionResponse.response.x === 1);
  const p2 = H.preparerPourGemini(c, {});
  v('sans adaptateur : rien n\'est touché que le rôle',
    J(p2.contents[2].parts) === J(c[2].parts) && p2.contents[2].role === 'user');
  v('une entrée qui n\'est pas un tableau ressort telle quelle', H.preparerPourGemini(null, {}).contents === null);
}

console.log('\n═══ ⑪ extraireMeta ≡ extraireSuites SUR CHACUN DE SES CAS ═══');
{
  // Les cas de test-coach-api.js (⑪) et de test-coach-flux.js (③, ⑧, ⑩).
  const cas = [
    '**Récup à 57.**\n- Sommeil : 5 h 45 pour 10 h.\n\nSuites : Un plan sur 3 jours ? | Et ce soir ? | Ma VFC en détail',
    'Texte.\n**Suggestions :** a | b',
    'Rien à extraire ici.\nSuites : au milieu ?\nEncore une ligne.',
    'Suites : a | b | c | d | e',
    'Bonne nuit.',
    null,
    '**Pas assez de données.**\n\n→ Porte le bracelet.\n\nSuites :\nComment réactiver mes données ? | Pourquoi ma VFC ne remonte pas ?',
    'Rien à extraire ici.\nSuites :\nau milieu ?\nEncore une ligne.',
    'Dors plus tôt.\n\nSuites : A ? | B ? | C ?',
    'Réponse en bloc.\n\nSuites : X ? | Y ?',
    'Repli en bloc.\n\nSuites : X ? | Y ?',
    'Ta VFC est à 48 ms, soit 16 % sous ta normale.',
    'Texte.\nSuites : ' + 'x'.repeat(90) + ' | court ?',
    // Une ligne « Ensuite : » de prose juste avant les suites reste à l'écran.
    'Texte.\nEnsuite : couche-toi tôt ce soir.\nSuites : A ? | B ?'
  ];
  for (const x of cas) {
    const a = lib.extraireSuites(x), b = H.extraireMeta(x);
    v('même texte et mêmes suites : ' + J(String(x).slice(0, 50)),
      a.texte === b.texte && J(a.suites) === J(b.suites) && b.retenir.length === 0,
      J({ attendu: a, obtenu: b }));
  }
}

console.log('\n═══ ⑫ extraireMeta : LES LIGNES « RETENIR » ═══');
{
  const T = [
    ['Retenir avant Suites, avec catégorie',
     'Texte.\nRetenir : objectif — prépare un semi en mars\nSuites : A ? | B ?',
     { texte: 'Texte.', suites: ['A ?', 'B ?'], retenir: [{ categorie: 'objectif', fait: 'prépare un semi en mars' }] }],
    ['« Retenir » au milieu du texte reste du texte',
     'Retenir : ne pas oublier ça\nLa suite du texte.\nSuites : A ?',
     { texte: 'Retenir : ne pas oublier ça\nLa suite du texte.', suites: ['A ?'], retenir: [] }],
    ['ordre inversé (Suites puis Retenir)',
     'Texte.\nSuites : A ? | B ?\nRetenir : santé — genou gauche fragile depuis août',
     { texte: 'Texte.', suites: ['A ?', 'B ?'], retenir: [{ categorie: 'sante', fait: 'genou gauche fragile depuis août' }] }],
    ['« Suites : » seule sur sa ligne, puis Retenir',
     'Texte.\n\nSuites :\nA ? | B ?\nRetenir : preference — déteste le poisson',
     { texte: 'Texte.', suites: ['A ?', 'B ?'], retenir: [{ categorie: 'preference', fait: 'déteste le poisson' }] }],
    ['un « fait » qui ressemble à une donnée est rejeté (ms), sa ligne part quand même',
     'Texte.\nRetenir : sante — VFC basse à 45 ms\nSuites : A ?',
     { texte: 'Texte.', suites: ['A ?'], retenir: [] }],
    ['… de même un pourcentage, et une durée 7h48',
     'Texte.\nRetenir : objectif — dormir 90 % de mon besoin\nRetenir : rythme — dort 7h48 en semaine\nSuites : A ?',
     { texte: 'Texte.', suites: ['A ?'], retenir: [] }],
    ['deux faits au plus',
     'Texte.\nRetenir : objectif — semi en mars\nRetenir : contrainte — végétarien\nRetenir : rythme — foot le samedi\nSuites : A ?',
     { texte: 'Texte.', suites: ['A ?'], retenir: [{ categorie: 'objectif', fait: 'semi en mars' }, { categorie: 'contrainte', fait: 'végétarien' }] }],
    ['sans catégorie : categorie null',
     'Texte.\nRetenir : a un chien qui le réveille tôt\nSuites : A ?',
     { texte: 'Texte.', suites: ['A ?'], retenir: [{ categorie: null, fait: 'a un chien qui le réveille tôt' }] }],
    ['« semi-marathon » n\'est pas une catégorie « semi »',
     'Texte.\nRetenir : semi-marathon en mars',
     { texte: 'Texte.', suites: [], retenir: [{ categorie: null, fait: 'semi-marathon en mars' }] }],
    ['anglais : Remember / Next, catégorie « goal »',
     'Text.\nRemember: goal — half marathon in March\nNext: A? | B?',
     { texte: 'Text.', suites: ['A?', 'B?'], retenir: [{ categorie: 'objectif', fait: 'half marathon in March' }] }],
    ['espagnol : Recordar / Siguientes, catégorie « salud »',
     'Texto.\nRecordar: salud — rodilla frágil\nSiguientes: ¿A? | ¿B?',
     { texte: 'Texto.', suites: ['¿A?', '¿B?'], retenir: [{ categorie: 'sante', fait: 'rodilla frágil' }] }],
    ['étiquettes en gras, catégorie entre crochets',
     'Texte.\n**Retenir :** [preference] café seulement le matin\n**Suites :** A ? | B ?',
     { texte: 'Texte.', suites: ['A ?', 'B ?'], retenir: [{ categorie: 'preference', fait: 'café seulement le matin' }] }],
    ['deux faits sur une ligne, séparés par « | »',
     'Texte.\nRetenir : objectif — semi en mars | contrainte — pas de lactose',
     { texte: 'Texte.', suites: [], retenir: [{ categorie: 'objectif', fait: 'semi en mars' }, { categorie: 'contrainte', fait: 'pas de lactose' }] }],
    ['un fait de plus de 120 caractères est rejeté',
     'Texte.\nRetenir : objectif — ' + 'a'.repeat(125),
     { texte: 'Texte.', suites: [], retenir: [] }],
    ['un Retenir suivi d\'une ligne ordinaire : rien n\'est extrait',
     'Texte.\nRetenir : objectif — semi en mars\nBonne course !',
     { texte: 'Texte.\nRetenir : objectif — semi en mars\nBonne course !', suites: [], retenir: [] }],
    ['« Retenir : » nu, le fait à la ligne',
     'Texte.\nRetenir :\nrythme — foot le samedi matin\nSuites : A ?',
     { texte: 'Texte.', suites: ['A ?'], retenir: [{ categorie: 'rythme', fait: 'foot le samedi matin' }] }],
    ['« **Suites :** » en gras et nue : la liste à la ligne est extraite (extraireSuites la laissait)',
     '**Récup à 57.**\n**Suites :**\nA ? | B ?',
     { texte: '**Récup à 57.**', suites: ['A ?', 'B ?'], retenir: [] }],
    ['« Remember: » de prose (sans catégorie) reste du texte',
     'Text.\nRemember: consistency beats intensity.\nNext: A? | B?',
     { texte: 'Text.\nRemember: consistency beats intensity.', suites: ['A?', 'B?'], retenir: [] }],
    ['… mais « Remember: health — … » est une ligne à retenir, même rejetée comme donnée',
     'Text.\nRemember: health — HRV around 45 ms\nNext: A?',
     { texte: 'Text.', suites: ['A?'], retenir: [] }],
    ['« À retenir : » n\'est pas une étiquette (c\'est un conseil)',
     'Texte.\nÀ retenir : couche-toi tôt.',
     { texte: 'Texte.\nÀ retenir : couche-toi tôt.', suites: [], retenir: [] }]
  ];
  for (const [titre, entree, attendu] of T) {
    const r = H.extraireMeta(entree);
    v(titre, J(r) === J(attendu), J(r));
  }
  v('au moins 12 cas « Retenir » au banc', T.length >= 12);
}

console.log('\n═══ ⑬ partieSureMeta : CE QUI PEUT PARTIR EN FLUX ═══');
{
  const T = [
    ['« Sui » en cours de ligne est retenu', 'Texte.\nSui', 'Texte.\n'],
    ['« Sur ton sommeil » part', 'Texte.\nSur ton sommeil', 'Texte.\nSur ton sommeil'],
    ['un texte ordinaire sans saut de ligne part entier', 'Deux, sans saut final', 'Deux, sans saut final'],
    ['un paragraphe fini part entier', 'Un.\n\nDeux, sans saut final', 'Un.\n\nDeux, sans saut final'],
    ['une ligne Retenir complète est retenue', 'Texte.\nRetenir : objectif — semi\n', 'Texte.\n'],
    ['… et relâchée quand du texte la suit', 'Texte.\nRetenir : objectif — semi\nEt aussi', 'Texte.\nRetenir : objectif — semi\nEt aussi'],
    ['une ligne Suites en cours est retenue, blancs compris', 'Texte.\n\nSuites : A ? | B', 'Texte.\n'],
    ['« Suites : » nue puis la liste en cours : retenues', 'Texte.\nSuites :\nComment ré', 'Texte.\n'],
    ['… puis une ligne de plus : tout repart', 'Texte.\nSuites :\nA ? | B ?\nEncore une ligne.', 'Texte.\nSuites :\nA ? | B ?\nEncore une ligne.'],
    ['Retenir puis Suites, les deux retenues', 'Texte.\nRetenir : objectif — semi\nSuites : A', 'Texte.\n'],
    ['un début de ligne « R » est retenu', 'Texte.\nR', 'Texte.\n'],
    ['« Recommandé » part', 'Texte.\nRecommandé', 'Texte.\nRecommandé'],
    ['« a continuación » + espace (15 caractères) reste retenu', 'Texto.\nA continuación ', 'Texto.\n'],
    ['un « **Sui » en gras est retenu', 'Texte.\n**Sui', 'Texte.\n'],
    ['tout le texte n\'est qu\'un début d\'étiquette', 'Ret', ''],
    ['« Ensuite : » de prose est relâchée quand la vraie ligne de suites arrive',
     'Texte.\nEnsuite : couche-toi tôt.\nSuites : A', 'Texte.\nEnsuite : couche-toi tôt.\n'],
    ['« Remember: » de prose part dès que la ligne est finie',
     'Text.\nRemember: consistency beats intensity.\nNext: A', 'Text.\nRemember: consistency beats intensity.\n'],
    ['« Remember: » en cours d\'écriture est retenu (sa catégorie peut venir)', 'Text.\nRemember: go', 'Text.\n'],
    ['rien', '', '']
  ];
  for (const [titre, entree, attendu] of T) {
    const r = H.partieSureMeta(entree);
    v(titre, r === attendu, J({ entree, obtenu: r, attendu }));
  }
  // Le flux caractère par caractère, comme `repondreEnFlux` l'émet : ce qui
  // est parti ne contient jamais ni le fait retenu ni les suites.
  const flux = (brut) => {
    let emis = 0, parti = '';
    for (let i = 1; i <= brut.length; i++) {
      const sur = H.partieSureMeta(brut.slice(0, i));
      if (sur.length > emis) { parti += sur.slice(emis); emis = sur.length; }
    }
    return parti;
  };
  const brut = '**Récup à 74.**\n## Pourquoi\n- **VFC** : 71 ms.\n\nRetenir : objectif — prépare un semi en mars\nSuites : Un plan ? | Et ce soir ?';
  const parti = flux(brut);
  v('flux caractère par caractère : ni « Retenir » ni « Suites » ne partent',
    !/Retenir|Suites|semi en mars/.test(parti), J(parti));
  v('  … et tout le corps est parti', parti.trim() === H.extraireMeta(brut).texte, J(parti));
  const brut2 = 'Texte.\nSuites :\nA ? | B ?\nRetenir : sante — genou fragile';
  v('  … de même avec « Suites : » nue et l\'ordre inversé', flux(brut2).trim() === 'Texte.', J(flux(brut2)));
}

console.log('\n═══ ⑬ bis REVUE DU 25 SEPT. : GRAS COUPÉ, MODE V1, NETTOYAGE À PART ═══');
{
  const T = [
    ['« **Retenir* » (gras coupé entre ses astérisques) est retenu', 'Texte.\n**Retenir*', 'Texte.\n'],
    ['« **Suites* » aussi', 'Texte.\n**Suites*', 'Texte.\n'],
    ['une ligne qui n\'est encore que « * » retient la ligne Retenir complète au-dessus',
     'Texte.\nRetenir : objectif — semi en mars\n*', 'Texte.\n'],
    ['« * puce » part dès qu\'elle n\'est plus une étiquette', 'Texte.\n* puce', 'Texte.\n* puce'],
    ['« **Retenir » + « * : » + fait, complet : retenu', 'Texte.\n**Retenir** : objectif — semi\n', 'Texte.\n']
  ];
  for (const [titre, entree, attendu] of T) {
    const r = H.partieSureMeta(entree);
    v(titre, r === attendu, J({ entree, obtenu: r, attendu }));
  }
  const V1 = { retenir: false };
  v('v1 : une ligne « Retenir : » finale reste dans le texte, les suites partent',
    J(H.extraireMeta('Texte.\nRetenir : la régularité compte.\nSuites : A ? | B ?', V1))
      === J({ texte: 'Texte.\nRetenir : la régularité compte.', suites: ['A ?', 'B ?'], retenir: [] }));
  v('  … et c\'est exactement extraireSuites',
    ['Texte.\nRetenir : objectif — semi\nSuites : A ?', 'Text.\nRemember: goal — a marathon\nNext: A? | B?', 'X.\n**Retenir :** x']
      .every((x) => { const a = lib.extraireSuites(x), b = H.extraireMeta(x, V1); return a.texte === b.texte && J(a.suites) === J(b.suites); }));
  v('v1 : en flux, une ligne Retenir complète part', H.partieSureMeta('Texte.\nRetenir : objectif — semi\n', V1) === 'Texte.\nRetenir : objectif — semi\n');
  v('  … « Ret » en cours part aussi (ce n\'est plus une étiquette en v1), « Sui » reste retenu',
    H.partieSureMeta('Texte.\nRet', V1) === 'Texte.\nRet' && H.partieSureMeta('Texte.\nSui', V1) === 'Texte.\n');
  v('  … « Suites : » nue puis sa liste en cours : retenues, en v1 aussi',
    H.partieSureMeta('Texte.\nSuites :\nComment ré', V1) === 'Texte.\n');

  // Le nettoyage des clés passe APRÈS l'adaptateur, hors de son try/catch.
  const c = [question('Q'), appels([['getDay']], 's'), reponses([['getDay', { x: 1, sante: 'asthme', _adapte: 1 }]])];
  const net = (nom, r) => { if (r && typeof r === 'object') { const o = Object.assign({}, r); delete o.sante; return o; } return r; };
  const p1 = H.preparerPourGemini(c, { adapter: () => { throw new Error('boum'); }, nettoyer: net });
  const r1 = p1.contents[2].parts[0].functionResponse.response;
  v('un adaptateur qui lève : le nettoyage passe quand même', r1.x === 1 && !('sante' in r1), J(r1));
  const p2 = H.preparerPourGemini(c, { nettoyer: () => { throw new Error('boum'); } });
  v('un nettoyage qui lève : la réponse devient un talon (on ferme)',
    p2.contents[2].parts[0].functionResponse.response.qualite === 'expired' && !J(p2.contents).includes('asthme'));
  v('  … le tour du modèle, lui, n\'est pas touché', J(p2.contents[1]) === J(c[1]));
}

console.log('\n═══ ⑭ LE MÉMO DE L\'ÉCHANGE, SANS MODÈLE ═══');
{
  const fr = H.memoDe({
    question: 'Pourquoi ma récup est à 58 ?',
    texte: '**Récup à 58 : ta nuit a été _courte_.**\n## Pourquoi\n- **Sommeil court** : 5h45.\n## À faire\n- **Au lit avant 22 h 30** : pour rattraper.\n- Effort léger.',
    jour: '2026-9-16'
  });
  v('fr : q, v sans gras ni soulignés, a = la première puce de « À faire », d = le jour',
    J(fr) === J({ d: '2026-9-16', q: 'Pourquoi ma récup est à 58 ?', v: 'Récup à 58 : ta nuit a été courte.', a: 'Au lit avant 22 h 30 : pour rattraper.' }),
    J(fr));
  const en = H.memoDe({ question: 'Why is my recovery low?', texte: '**Recovery 58.**\n## Why\n- Short night.\n## To do\n- **Bed before 10:30 pm**', jour: '2026-9-16' });
  v('en : « To do »', en.v === 'Recovery 58.' && en.a === 'Bed before 10:30 pm', J(en));
  const es = H.memoDe({ question: '¿Por qué mi recuperación está baja?', texte: '**Recuperación 58.**\n## Por qué\n- Noche corta.\n## Qué hacer\n- Acuéstate antes de las 22:30', jour: '2026-9-16' });
  v('es : « Qué hacer »', es.v === 'Recuperación 58.' && es.a === 'Acuéstate antes de las 22:30', J(es));
  v('un message anodin ne fait pas de mémo', H.memoDe({ question: 'merci !', texte: 'Avec plaisir.' }) === null
    && H.memoDe({ question: 'D’accord', texte: 'x' }) === null);
  v('  … une vraie question commençant par « merci » en fait un',
    H.memoDe({ question: 'Merci, et pour ce soir je mange quoi ?', texte: 'Des pâtes.' }) !== null);
  const long = H.memoDe({ question: 'q '.repeat(150), texte: 'v '.repeat(200), jour: 'x' });
  v('plafonds : q ≤ 100, v ≤ 160', long.q.length <= 100 && long.v.length <= 160 && long.q.endsWith('…'), J(long));
  const sans = H.memoDe({ question: 'Et ma VFC ?', texte: '**VFC à 71 ms.**\n## Détail\n- Au-dessus de ta normale.', maintenant: new Date('2026-09-24T23:30:00Z') });
  v('sans « À faire » : a vide ; sans jour : la date de Paris (23 h 30 UTC = le lendemain)',
    sans.a === '' && sans.d === '2026-09-25', J(sans));
  v('sans question : pas de mémo', H.memoDe({ question: '', texte: 'x' }) === null && H.memoDe({}) === null);
}

console.log(`\n${vert} réussis, ${rouge} échoués`);
process.exitCode = rouge ? 1 : 0;

})();
