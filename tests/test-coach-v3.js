// ═══════════════════════════════════════════════════════════════════════════
//  LE BANC DU COACH V3 : LES LIBELLÉS ET LE CATALOGUE DES BLOCS — 15 NOV. 2026
//
//  Fonctions pures de api/_coach-v3.js, sans réseau ni handler. Deux
//  promesses à tenir :
//   1. chaque appel a SA phrase, qui dit ce qui est lu, arguments compris, dans
//      les trois langues — jamais une phrase générique ;
//   2. un bloc qui n'est pas exactement au catalogue est retiré, et aucun texte
//      libre d'un bloc ne porte un chiffre.
// ═══════════════════════════════════════════════════════════════════════════

const path = require('path');
const V3 = require(path.join(__dirname, '..', 'api', '_coach-v3.js'));
const { OUTILS_V1, OUTILS_V2, LIBELLES } = require(path.join(__dirname, '..', 'api', '_coach-tools.js'));
const { prefixeStatique, promptSysteme } = require(path.join(__dirname, '..', 'api', '_coach-prompt.js'));

let vert = 0, rouge = 0;
function v(titre, ok, detail) {
  if (ok) { vert++; console.log('  ✅ ' + titre); }
  else { rouge++; console.log('  ❌ ' + titre + (detail ? '   ' + detail : '')); }
}

console.log('\n═══ ① CHAQUE OUTIL DÉCLARÉ A SA PHRASE, DANS LES TROIS LANGUES ═══');
{
  const noms = [...new Set(OUTILS_V1.concat(OUTILS_V2).map((o) => o.name))];
  for (const l of ['fr', 'en', 'es']) {
    const manquent = noms.filter((n) => !V3.libelleAppel(n, {}, l));
    v(l + ' : les ' + noms.length + ' outils ont un libellé', manquent.length === 0, manquent.join(','));
    const finit = noms.every((n) => V3.libelleAppel(n, {}, l).endsWith('…'));
    v(l + ' : chaque libellé finit par « … », comme ceux de l\'app', finit);
  }
  v('un outil inconnu : pas de phrase (l\'app garde la sienne)', V3.libelleAppel('outilInconnu', {}, 'fr') === '');
  v('une langue inconnue retombe sur le français', V3.libelleAppel('getDevice', {}, 'de') === V3.libelleAppel('getDevice', {}, 'fr'));
}

console.log('\n═══ ② LA PHRASE DIT CE QUI EST LU — ARGUMENTS COMPRIS ═══');
{
  const cas = [
    ['getSleepHistory', { joursN: 7 }, 'fr', 'Lecture de tes 7 dernières nuits…'],
    ['getSleepHistory', { joursN: 1 }, 'fr', 'Lecture de ta dernière nuit…'],
    ['getSleepHistory', { joursN: 99 }, 'fr', 'Lecture de tes 14 dernières nuits…'],
    ['getSleepHistory', { joursN: 7 }, 'en', 'Reading your last 7 nights…'],
    ['getSleepHistory', { joursN: 7 }, 'es', 'Leyendo tus últimas 7 noches…'],
    ['getRecoveryContext', {}, 'fr', 'Lecture de ta récupération du jour…'],
    ['getTrainingLoad', {}, 'fr', 'Calcul de ta charge d\'entraînement (7 jours contre 4 semaines)…'],
    ['getActivityHistory', { joursN: 30 }, 'fr', 'Lecture de tes séances des 30 derniers jours…'],
    ['getSessions', { jours: 14, sport: 'Course' }, 'fr', 'Comparaison de tes séances de course des 14 derniers jours…'],
    ['getSessions', { jours: 14, sport: 'running' }, 'en', 'Comparing your running sessions from the last 14 days…'],
    ['getSessions', { jours: 31, sport: '<script>alert(1)</script>' }, 'fr', 'Comparaison de tes séances de script alert script des 31 derniers jours…'],
    ['getSessions', { jours: 7, records: true }, 'fr', 'Lecture de tes records GPS…'],
    ['getSession', { jour: -1 }, 'fr', 'Lecture de ta séance d\'hier…'],
    ['getSession', { date: '2026-11-12' }, 'fr', 'Lecture de ta séance du 12 nov.…'],
    ['getSession', { gps: 'g12' }, 'es', 'Leyendo tu salida GPS…'],
    ['getDay', { jour: -1 }, 'fr', 'Lecture de ta journée d\'hier…'],
    ['getDay', { jour: -6 }, 'fr', 'Lecture de ta journée d\'il y a 6 jours…'],
    ['getDay', { jour: -2 }, 'es', 'Leyendo tu día de anteayer…'],
    ['getDay', { date: '2026-02-30' }, 'fr', 'Lecture de ta journée d\'aujourd\'hui…'],
    ['getHistory', { colonnes: ['vfc', 'vfcSrc', 'recup'], jours: 30 }, 'fr', 'Lecture de tes 30 derniers jours (VFC, récupération)…'],
    ['getHistory', { colonnes: ['kcalMangees', 'poids', 'balance', 'pas'], jours: 90 }, 'en', 'Reading your last 90 days (calories eaten, weight, calorie balance…)…'],
    ['getTrend', { cle: 'hrv', periode: 'M' }, 'fr', 'Lecture de ta tendance VFC du mois…'],
    ['getTrend', { cle: 'rhr', periode: 'S', recul: 1 }, 'en', 'Reading your resting HR trend last week…'],
    ['getDevice', {}, 'fr', 'Vérification de ton bracelet et sa synchro…'],
    ['getPastThread', { recherche: 'semi' }, 'fr', 'Recherche dans nos échanges passés…'],
    ['saveMemoryFact', { fait: 'x' }, 'fr', 'Je note ça…'],
    ['setCoachPreferences', { ton: 'intensif' }, 'fr', 'J\'ajuste mon style : direct…'],
    ['setCoachPreferences', { ton: 'constructor' }, 'fr', 'J\'ajuste mon style…']
  ];
  for (const [nom, args, l, attendu] of cas) {
    const t = V3.libelleAppel(nom, args, l);
    v(nom + ' ' + JSON.stringify(args) + ' [' + l + '] → « ' + attendu + ' »', t === attendu, '« ' + t + ' »');
  }
  v('aucun libellé v3 n\'est « Analyse de ta récupération… »',
    [...new Set(OUTILS_V1.concat(OUTILS_V2).map((o) => o.name))].every((n) => V3.libelleAppel(n, {}, 'fr') !== 'Analyse de ta récupération…'));
}

console.log('\n═══ ③ LA TABLE `libelles` D\'UN TOUR, ET LA PHRASE DE RÉDACTION ═══');
{
  const appels = [{ name: 'getSleepHistory', args: { joursN: 3 } }, { name: 'getSleepHistory', args: { joursN: 14 } }, { name: 'getTrainingLoad', args: {} }];
  const t = V3.libellesDuTour(LIBELLES.fr, appels, 'fr');
  v('le premier appel du nom gagne (c\'est lui que l\'app montre)', t.getSleepHistory === 'Lecture de tes 3 dernières nuits…');
  v('  … les clés de l\'app restent toutes là, inchangées hors outils demandés',
    Object.keys(LIBELLES.fr).every((k) => k in t) && t.getRecoveryContext === LIBELLES.fr.getRecoveryContext);
  v('  … et la table de l\'app n\'est pas modifiée en place', LIBELLES.fr.getSleepHistory === 'Lecture de tes nuits…');
  v('étapes : une par appel, dans l\'ordre', JSON.stringify(V3.etapesDesAppels(appels, 'fr').map((e) => e.outil)) === '["getSleepHistory","getSleepHistory","getTrainingLoad"]');
  v('rédaction sans rien lu', V3.libelleRedaction([], 'fr') === 'Rédaction de ta réponse…' && V3.libelleRedaction([], 'en') === 'Writing your answer…');
  v('rédaction à partir de deux lectures',
    V3.libelleRedaction(appels.slice(1), 'fr') === 'Rédaction de ta réponse à partir de tes 14 dernières nuits et ta charge d\'entraînement (7 jours contre 4 semaines)…',
    V3.libelleRedaction(appels.slice(1), 'fr'));
  v('  … « Je note ça » n\'est pas une lecture', V3.libelleRedaction([{ name: 'saveMemoryFact', args: {} }], 'fr') === 'Rédaction de ta réponse…');
  const quatre = [{ name: 'getDay', args: { jour: -1 } }, { name: 'getDevice' }, { name: 'getTrend', args: { cle: 'hrv', periode: 'M' } }, { name: 'getSessions', args: { jours: 7 } }];
  v('  … au-delà de trois, « et le reste »', V3.libelleRedaction(quatre, 'es').endsWith(' y el resto…'), V3.libelleRedaction(quatre, 'es'));
}

console.log('\n═══ ④ LE CATALOGUE : CE QUI PASSE ═══');
{
  const bons = [
    { type: 'serie', metrique: 'recup', jours: 7 },
    { type: 'serie', metrique: 'vfc', jours: 30, repere: 'normale', titre: 'Ta VFC remonte' },
    { type: 'serie', metrique: 'kcalBrulees', jours: 90, repere: 'cible' },
    { type: 'comparaison', metrique: 'dormi', jours: 30 },
    { type: 'seance', jour: -1 },
    { type: 'seance', date: '2026-11-12', id: 'act_9f.2', debut: '18:05' },
    { type: 'zones', portee: 'semaine' },
    { type: 'zones', portee: 'seance', jour: 0, id: 'abc' },
    { type: 'nuit' },
    { type: 'nuit', jour: -3, titre: 'La nuit coupée' },
    { type: 'etapes', titre: 'Comment la récup se calcule', etapes: [{ titre: 'La nuit', texte: 'FLINT lit ta VFC et ton pouls au repos.' },
      { titre: 'La normale', texte: 'Il les compare à tes nuits récentes.' }] }
  ];
  for (const b of bons) {
    const r = V3.validerBloc(b);
    v('valide : ' + JSON.stringify(b).slice(0, 90), r.bloc && JSON.stringify(r.bloc) === JSON.stringify(b), JSON.stringify(r));
  }
  const nettoye = V3.validerBloc({ type: 'serie', metrique: 'vfc', jours: 30, titre: '  Ta   VFC  ' });
  v('un titre est ramené à une ligne propre', nettoye.bloc && nettoye.bloc.titre === 'Ta VFC');
  v('les métriques du catalogue sont des colonnes que l\'app sait déjà lire (getHistory)',
    V3.METRIQUES_BLOCS.every((m) => require(path.join(__dirname, '..', 'api', '_coach-tools.js')).COLONNES_HISTORIQUE.includes(m)));
}

console.log('\n═══ ⑤ LE CATALOGUE : CE QUI EST RETIRÉ ═══');
{
  const mauvais = [
    [{ type: 'graphique', metrique: 'vfc', jours: 30 }, 'type inconnu'],
    [{ type: 'serie', metrique: 'vfc', jours: 30, valeurs: [60, 62] }, 'une VALEUR fournie par le modèle'],
    [{ type: 'serie', metrique: 'vfc', jours: 45 }, 'période hors catalogue'],
    [{ type: 'serie', metrique: 'vfc', jours: '30' }, 'période en chaîne'],
    [{ type: 'serie', metrique: 'humeur', jours: 7 }, 'métrique inconnue'],
    [{ type: 'serie', metrique: 'vfc', jours: 7, repere: 'moyenne' }, 'repère inconnu'],
    [{ type: 'serie', metrique: 'vfc', jours: 7, titre: 'VFC à 71 ms' }, 'un chiffre dans le titre'],
    [{ type: 'serie', metrique: 'vfc', jours: 7, titre: 'VFC à ٧١ ms' }, 'un chiffre d\'une autre écriture'],
    [{ type: 'serie', metrique: 'vfc', jours: 7, titre: 'x'.repeat(61) }, 'titre trop long'],
    [{ type: 'serie', metrique: 'vfc', jours: 7, titre: '<b>ta VFC</b>' }, 'balise'],
    [{ type: 'comparaison', metrique: 'vfc', jours: 7, repere: 'normale' }, 'repère sur une comparaison'],
    [{ type: 'seance' }, 'séance sans jour ni date'],
    [{ type: 'seance', jour: -1, date: '2026-11-12' }, 'jour ET date'],
    [{ type: 'seance', jour: 1 }, 'jour dans le futur'],
    [{ type: 'seance', jour: -91 }, 'jour au-delà de 90'],
    [{ type: 'seance', date: '2026-13-01' }, 'date impossible'],
    [{ type: 'seance', jour: -1, debut: '25:00' }, 'heure impossible'],
    [{ type: 'seance', jour: -1, id: 'a b' }, 'id illisible'],
    [{ type: 'zones', portee: 'mois' }, 'portée inconnue'],
    [{ type: 'zones', portee: 'seance' }, 'zones d\'une séance sans jour'],
    [{ type: 'etapes', etapes: [{ titre: 'a', texte: 'b' }, { titre: 'c', texte: 'd' }] }, 'étapes sans titre'],
    [{ type: 'etapes', titre: 'T', etapes: [{ titre: 'a', texte: 'b' }] }, 'une seule étape'],
    [{ type: 'etapes', titre: 'T', etapes: [{ titre: 'a', texte: 'Dors 8 heures.' }, { titre: 'c', texte: 'd' }] }, 'un chiffre dans une étape'],
    [{ type: 'etapes', titre: 'T', etapes: [{ titre: 'a', texte: 'b', valeur: 3 }, { titre: 'c', texte: 'd' }] }, 'clé en trop dans une étape'],
    [['serie'], 'un tableau au lieu d\'un objet'],
    [null, 'null']
  ];
  for (const [b, pourquoi] of mauvais) {
    const r = V3.validerBloc(b);
    v('retiré — ' + pourquoi, !r.bloc && typeof r.raison === 'string', JSON.stringify(r));
  }
  const lot = V3.validerBlocs([{ type: 'nuit' }, { type: 'nuit' }, { type: 'serie', metrique: 'pas', jours: 7 }, { type: 'zones', portee: 'jour', jour: 0 }]);
  v('au plus 2 blocs, sans doublon', lot.blocs.length === 2 && lot.blocs[0].type === 'nuit' && lot.blocs[1].type === 'serie'
    && lot.rejetes.length === 1, JSON.stringify(lot));
  v('un objet seul compte comme un tableau d\'un bloc', V3.validerBlocs({ type: 'nuit' }).blocs.length === 1);
  v('autre chose : rien, avec sa raison', V3.validerBlocs('serie').blocs.length === 0 && V3.validerBlocs('serie').rejetes[0] === 'pas un tableau');
}

console.log('\n═══ ⑥ LE SCHÉMA DOCUMENTÉ ET LE VALIDATEUR DISENT LA MÊME CHOSE ═══');
{
  const branches = V3.BLOCS_SCHEMA.items.oneOf;
  const types = branches.map((b) => b.properties.type.const);
  v('six types, les mêmes des deux côtés', JSON.stringify(types.slice().sort()) === JSON.stringify(Object.keys(V3.CLES_PERMISES).sort()), types.join(','));
  const ecarts = branches.filter((b) => JSON.stringify(Object.keys(b.properties).sort()) !== JSON.stringify(V3.CLES_PERMISES[b.properties.type.const].slice().sort()));
  v('chaque branche permet exactement les clés du validateur', ecarts.length === 0, ecarts.map((b) => b.properties.type.const).join(','));
  v('additionalProperties: false partout', branches.every((b) => b.additionalProperties === false));
  v('maxItems = ' + V3.BLOCS_MAX, V3.BLOCS_SCHEMA.maxItems === V3.BLOCS_MAX);
}

console.log('\n═══ ⑦ LA LIGNE « BLOCS : » DANS LE TEXTE ═══');
{
  const t1 = '**Verdict.**\n- puce\nBlocs : [{"type":"nuit","jour":-1}]\nSuites : A ? | B ?';
  const e1 = V3.extraireBlocs(t1);
  v('une ligne : détachée, le reste intact', e1.texte === '**Verdict.**\n- puce\nSuites : A ? | B ?' && e1.blocs.length === 1 && e1.lignes === 1, JSON.stringify(e1));
  const t2 = '**Verdict.**\n**Blocs :** [\n  {"type":"serie","metrique":"vfc","jours":30},\n  {"type":"nuit"}\n]\nSuites : A ?';
  const e2 = V3.extraireBlocs(t2);
  v('un tableau sur plusieurs lignes, étiquette en gras : recollé', e2.texte === '**Verdict.**\nSuites : A ?' && e2.blocs.length === 2, JSON.stringify(e2));
  const t3 = '**Verdict.**\nBlocs : [{"type":"serie",\n"metrique":\nSuites : A ?';
  const e3 = V3.extraireBlocs(t3);
  v('un JSON cassé : la ligne part, rien ne passe, les Suites restent', e3.blocs.length === 0 && e3.rejetes.includes('JSON illisible')
    && e3.texte.endsWith('Suites : A ?') && !e3.texte.includes('Blocs'), JSON.stringify(e3));
  const t4 = '**Les blocs de départ comptent.**\nBlocs : travaille tes départs.\nSuites : A ?';
  v('« Blocs : » sans tableau reste de la prose', V3.extraireBlocs(t4).texte === t4 && V3.extraireBlocs(t4).lignes === 0);
  v('sans ligne Blocs : le texte rendu tel quel', V3.extraireBlocs('a\nb').texte === 'a\nb');

  const s = '**Verdict.**\n- puce\nBlocs : [{"type":"nuit"}]\nSuites : A ?';
  const fuites = [];
  for (let i = 0; i <= s.length; i++) {
    const p = V3.partieSureBlocs(s.slice(0, i));
    if (/Bl|\[|"type"/.test(p) || !s.startsWith(p)) fuites.push(i + ':' + JSON.stringify(p.slice(-12)));
  }
  v('flux, coupé à chaque caractère : jamais un bout de la ligne Blocs, toujours un préfixe', fuites.length === 0, fuites.slice(0, 5).join(' '));
  v('  … une ligne qui commence par « B » de prose repart dès qu\'elle n\'en est plus une',
    V3.partieSureBlocs('a\nBonne nuit') === 'a\nBonne nuit' && V3.partieSureBlocs('a\nBloc') === 'a\n');
}

console.log('\n═══ ⑧ LE PROMPT V3 NE TOUCHE PAS LE PROMPT GEMINI ═══');
{
  for (const m of ['v1', 'v2']) {
    v(m + ' : préfixe v3 = préfixe d\'avant + « \\n\\n » + PROMPT_V3', prefixeStatique(m, { v3: true }) === prefixeStatique(m) + '\n\n' + V3.PROMPT_V3);
    const a = promptSysteme({ ton: 'aucun', langue: 'fr', mode: m, blocs: { donnees: 'D', faits: 'F' } });
    const b = promptSysteme({ ton: 'aucun', langue: 'fr', mode: m, v3: false, blocs: { donnees: 'D', faits: 'F' } });
    const c = promptSysteme({ ton: 'aucun', langue: 'fr', mode: m, blocs: { donnees: 'D', faits: 'F', v3: true } });
    v(m + ' : sans `v3: true` en argument, le prompt est celui d\'avant (même si un bloc dit v3)', a === b && a === c && !a.includes('COACH V3') && !a.includes(V3.RAPPEL_V3));
    const d = promptSysteme({ ton: 'aucun', langue: 'fr', mode: m, v3: true, blocs: { donnees: 'D', faits: 'F' } });
    v(m + ' : avec `v3: true`, le bloc v3 dans le préfixe et le rappel des blocs en fin de queue', d.startsWith(prefixeStatique(m, { v3: true }) + '\n\n')
      && d.trimEnd().endsWith(V3.RAPPEL_V3));
    const anodin = promptSysteme({ ton: 'aucun', langue: 'fr', mode: m, v3: true, blocs: { anodin: true } });
    v(m + ' : message anodin, pas de rappel des blocs', !anodin.includes(V3.RAPPEL_V3));
  }
  v('le prompt v3 cite chaque type et chaque métrique du catalogue', Object.keys(V3.CLES_PERMISES).every((t) => V3.PROMPT_V3.includes('"type":"' + t + '"'))
    && V3.METRIQUES_BLOCS.every((m) => V3.PROMPT_V3.includes(m)));
  v('le prompt v3 n\'interpole rien (préfixe fixe, cache)', !/\$\{/.test(V3.PROMPT_V3));
}

console.log(`\n${vert} réussis, ${rouge} échoués`);
if (rouge) process.exit(1);
