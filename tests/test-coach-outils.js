#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   LE BANC DES OUTILS DU COACH — contrat des déclarations d'outils Gemini.

   `_coach-tools.js` est le SEUL endroit qui dit à Gemini quels outils
   existent. `CoachOutils.swift` (natif, non testable ici) doit savoir
   exécuter exactement les mêmes noms — ce banc fige donc la liste et sa
   forme, pour qu'un renommage silencieux d'un côté se voie tout de suite.
   ═══════════════════════════════════════════════════════════════════════════ */
const { OUTILS, OUTILS_V1, OUTILS_V2, LIBELLES, outilsPour,
        COLONNES_HISTORIQUE, CLES_TENDANCE } = require('../api/_coach-tools');

let ok = 0, ko = 0;
const verifie = (t, c, d) => { c ? (ok++, console.log(`  ✅ ${t}`))
                                : (ko++, console.log(`  ❌ ${t}${d ? '  → ' + d : ''}`)); };

console.log('\n1 · Forme générale');
verifie('OUTILS est un tableau non vide', Array.isArray(OUTILS) && OUTILS.length > 0);
OUTILS.forEach(o => {
  verifie(`"${o.name}" a un nom, une description, des paramètres`,
    typeof o.name === 'string' && o.name.length > 0 &&
    typeof o.description === 'string' && o.description.length > 5 &&
    o.parameters && o.parameters.type === 'object' && typeof o.parameters.properties === 'object');
});

console.log('\n2 · Pas de doublon de nom (Gemini refuserait la déclaration)');
{
  const noms = OUTILS.map(o => o.name);
  verifie('tous les noms sont uniques', new Set(noms).size === noms.length, noms.join(','));
}

console.log('\n3 · La liste EXACTE des outils déclarés (25 sept. 2026)');
// 25 sept. 2026 — getUserProfile n'est plus déclaré (la photo de profil
// partait avec lui : fuite et 413), setCoachPreferences l'est enfin. La liste
// est comparée ENTIÈRE : un outil de trop se voit autant qu'un outil perdu.
const ATTENDUS = [
  'getCoachPreferences', 'getRecoveryContext', 'getSleepHistory', 'getActivityHistory',
  'getTrainingLoad', 'getNutritionToday', 'saveMemoryFact', 'setCoachPreferences'
];
ATTENDUS.forEach(n => {
  verifie(`l'outil "${n}" est déclaré`, OUTILS.some(o => o.name === n));
});
verifie('exactement ces huit-là, aucun autre',
  OUTILS.map(o => o.name).sort().join(',') === ATTENDUS.slice().sort().join(','),
  OUTILS.map(o => o.name).join(','));
verifie('getUserProfile n\'est PLUS déclaré (avatar : fuite et 413)',
  !OUTILS.some(o => o.name === 'getUserProfile'));

console.log('\n4 · Les outils paramétrés déclarent bien leurs paramètres requis');
['getSleepHistory', 'getActivityHistory'].forEach(n => {
  const o = OUTILS.find(x => x.name === n);
  verifie(`"${n}" exige "joursN"`,
    !!o && Array.isArray(o.parameters.required) && o.parameters.required.includes('joursN'));
});
{
  const o = OUTILS.find(x => x.name === 'saveMemoryFact');
  verifie('"saveMemoryFact" exige "fait"',
    !!o && Array.isArray(o.parameters.required) && o.parameters.required.includes('fait'));
}
{
  // Les quatre codes de `flTonCoach()` et de la liste blanche de PontCoach
  // (setCoachPreferences) — un cinquième serait refusé par l'app en « ton inconnu ».
  const o = OUTILS.find(x => x.name === 'setCoachPreferences');
  const ton = o && o.parameters.properties.ton;
  verifie('"setCoachPreferences" exige "ton"',
    !!o && Array.isArray(o.parameters.required) && o.parameters.required.includes('ton'));
  verifie('  … une chaîne en enum de EXACTEMENT 4 valeurs : motivant, analytique, intensif, aucun',
    !!ton && ton.type === 'string' && Array.isArray(ton.enum) && ton.enum.length === 4
    && ton.enum.slice().sort().join(',') === 'analytique,aucun,intensif,motivant',
    ton && JSON.stringify(ton.enum));
  verifie('  … décrit comme le changement de style demandé par la personne',
    !!o && o.description.startsWith('Change le style du Coach quand la personne le demande'));
}

console.log('\n5 · Les descriptions disent les vraies unités et les vraies bornes');
{
  const s = OUTILS.find(x => x.name === 'getSleepHistory');
  const d = s ? s.description : '';
  const j = s ? s.parameters.properties.joursN.description : '';
  // 30 nuits rendaient 86 Ko, au-dessus des 64 Ko par part : le 413 du 24 sept.
  verifie('getSleepHistory : joursN est un « entier de 1 à 14 »', /entier de 1 à 14/.test(j), j);
  verifie('  … et plus nulle part « 1 à 30 »', !JSON.stringify(s).includes('1 à 30'));
  // 25 sept. 2026 (soir) — le serveur récrit la réponse (_coach-adaptateurs.js) :
  // la description dit ce que le modèle LIT, plus ce que le téléphone envoie.
  verifie('  … dormi, eveil, auLit, besoin et manqueNuit sont dits en h:mm (réponse récrite)',
    /dormi, eveil, auLit, besoin et manqueNuit en h:mm/.test(d) && !/MINUTES/.test(d));
  verifie('  … coucher/lever en HH:MM, « (veille) » = la veille au soir',
    /coucher et lever en HH:MM/.test(d) && /« \(veille\) »/.test(d));
  verifie('  … manqueNuit = manque de la nuit face au besoin AJUSTÉ, pas la « Dette accumulée » (pas ta dette)',
    /besoin AJUSTÉ/.test(d) && /PAS la « Dette accumulée »/.test(d) && /pas ta dette/.test(d));
  verifie('  … spo2Mediane = médiane (l\'app : 10e percentile), tempAbsolue en °C',
    /spo2Mediane = la MÉDIANE/.test(d) && /10e percentile/.test(d) && /tempAbsolue en °C/.test(d));
  verifie('  … ni séances, ni repas, ni effort (le serveur les retire)', /Ni séances, ni repas, ni effort ici/.test(d));
  const r = OUTILS.find(x => x.name === 'getRecoveryContext');
  verifie('getRecoveryContext : normales = 30 nuits pondérées (demi-vie 7 j), PAS les 60 nuits de l\'écran',
    !!r && /30 nuits pondérée vers le récent \(demi-vie 7 jours\)/.test(r.description) && /PAS la normale imprimée par l'écran Récupération \(60 nuits\)/.test(r.description));
  const a = OUTILS.find(x => x.name === 'getActivityHistory');
  verifie('getActivityHistory : l\'effort arrive en effortListe, qui peut différer de la note de la carte',
    !!a && /effortListe : il peut différer de la note de la carte/.test(a.description));
  const c = OUTILS.find(x => x.name === 'getCoachPreferences');
  verifie('getCoachPreferences : les quatre vrais codes, plus « équilibré/encourageant/direct »',
    !!c && ['motivant', 'analytique', 'intensif', 'aucun'].every(t => c.description.includes("'" + t + "'"))
    && !/équilibré|encourageant\/direct/.test(c.description), c && c.description);
}

console.log('\n6 · Aucune clé de schéma que Gemini pourrait refuser');
{
  // Une clé inconnue dans une déclaration fait refuser TOUTE la requête (400),
  // pour toutes les questions : on n'emploie que la forme documentée.
  const PERMISES = new Set(['type', 'description', 'properties', 'required', 'enum', 'items']);
  const fautives = [];
  const parcourir = (schema, ou) => {
    Object.keys(schema).forEach(k => { if (!PERMISES.has(k)) fautives.push(ou + '.' + k); });
    Object.keys(schema.properties || {}).forEach(p => parcourir(schema.properties[p], ou + '.' + p));
    if (schema.items) parcourir(schema.items, ou + '[]');
  };
  OUTILS_V1.concat(OUTILS_V2).forEach(o => parcourir(o.parameters, o.name));
  verifie('schémas limités à type/description/properties/required/enum/items', fautives.length === 0, fautives.join(', '));
}

// ═══ 25 sept. 2026 (soir) — COACH V2 : DEUX JEUX, DES LIBELLÉS, UNE PORTE ═══
const noms = (l) => l.map(o => o.name);

console.log('\n7 · Deux jeux : V1 (toute app posée) et V2 (app qui annonce savoir)');
verifie('OUTILS est OUTILS_V1 (compatibilité de coach.js et des bancs d\'avant)', OUTILS === OUTILS_V1);
const ATTENDUS_V2 = ['getDay', 'getHistory', 'getTrend', 'getSessions', 'getSession', 'getDevice',
                     'getPastThread', 'setCoachPreferences'];
verifie('V2 : exactement getDay, getHistory, getTrend, getSessions, getSession, getDevice, getPastThread, setCoachPreferences',
  noms(OUTILS_V2).slice().sort().join(',') === ATTENDUS_V2.slice().sort().join(','), noms(OUTILS_V2).join(','));
verifie('aucun doublon de nom dans V1', new Set(noms(OUTILS_V1)).size === OUTILS_V1.length);
verifie('aucun doublon de nom dans V2', new Set(noms(OUTILS_V2)).size === OUTILS_V2.length);
verifie('setCoachPreferences est dans les DEUX jeux, déclaré à l\'identique',
  JSON.stringify(OUTILS_V1.find(o => o.name === 'setCoachPreferences'))
  === JSON.stringify(OUTILS_V2.find(o => o.name === 'setCoachPreferences')));
verifie('saveMemoryFact est dans V1 SEULEMENT (V2 retient par « Retenir : »)',
  noms(OUTILS_V1).includes('saveMemoryFact') && !noms(OUTILS_V2).includes('saveMemoryFact'));
verifie('getUserProfile n\'est dans AUCUN jeu (avatar : fuite et 413)',
  !noms(OUTILS_V1).includes('getUserProfile') && !noms(OUTILS_V2).includes('getUserProfile'));
OUTILS_V2.forEach(o => {
  verifie(`"${o.name}" a un nom, une description, des paramètres objet`,
    typeof o.description === 'string' && o.description.length > 40
    && o.parameters && o.parameters.type === 'object' && typeof o.parameters.properties === 'object');
});
{
  const n = Buffer.byteLength(JSON.stringify(OUTILS_V2), 'utf8');
  console.log(`     OUTILS_V2 sérialisé : ${n} o (V1 : ${Buffer.byteLength(JSON.stringify(OUTILS_V1), 'utf8')} o)`);
  verifie('OUTILS_V2 sérialisé ≤ 6 Ko (il part à CHAQUE requête)', n <= 6144, n);
}

console.log('\n8 · Les paramètres V2 : des scalaires, ou des tableaux d\'enums — rien d\'autre');
{
  const SCALAIRES = new Set(['string', 'integer', 'number', 'boolean']);
  const fautifs = [];
  OUTILS_V2.forEach(o => Object.entries(o.parameters.properties).forEach(([p, sch]) => {
    const ok1 = SCALAIRES.has(sch.type) && (!sch.enum || (sch.type === 'string' && Array.isArray(sch.enum) && sch.enum.length > 0));
    const ok2 = sch.type === 'array' && sch.items && sch.items.type === 'string'
      && Array.isArray(sch.items.enum) && sch.items.enum.length > 0 && !sch.items.items && !sch.items.properties;
    if (!ok1 && !ok2) fautifs.push(o.name + '.' + p);
    (o.parameters.required || []).forEach(r => { if (!(r in o.parameters.properties)) fautifs.push(o.name + ' exige ' + r); });
  }));
  verifie('chaque paramètre V2 est un scalaire ou un tableau d\'enum de chaînes', fautifs.length === 0, fautifs.join(', '));
  const h = OUTILS_V2.find(o => o.name === 'getHistory');
  const col = h.parameters.properties.colonnes;
  verifie('getHistory.colonnes : tableau de chaînes, enum de 25 colonnes (la liste épinglée)',
    col.type === 'array' && col.items.type === 'string' && col.items.enum.length === 25
    && JSON.stringify(col.items.enum) === JSON.stringify(COLONNES_HISTORIQUE), col.items.enum.length);
  verifie('getHistory.jours est un entier, colonnes et jours exigés',
    h.parameters.properties.jours.type === 'integer' && h.parameters.required.join() === 'colonnes,jours');
  const t = OUTILS_V2.find(o => o.name === 'getTrend');
  const cle = t.parameters.properties.cle;
  verifie('getTrend.cle : enum de 22 clés (la liste épinglée)',
    cle.type === 'string' && cle.enum.length === 22 && JSON.stringify(cle.enum) === JSON.stringify(CLES_TENDANCE), cle.enum.length);
  verifie('  … SANS « charge » (loadOf, pas /20) ni « kcalBal » (qui rend la dépense)',
    !cle.enum.includes('charge') && !cle.enum.includes('kcalBal'));
  verifie('  … periode ∈ S|M|A, recul entier',
    JSON.stringify(t.parameters.properties.periode.enum) === '["S","M","A"]' && t.parameters.properties.recul.type === 'integer');
  const d = OUTILS_V2.find(o => o.name === 'getDay');
  verifie('getDay : jour entier OU date chaîne (aucun des deux exigé), avecRepas booléen',
    d.parameters.properties.jour.type === 'integer' && d.parameters.properties.date.type === 'string'
    && d.parameters.properties.avecRepas.type === 'boolean' && !(d.parameters.required || []).length);
  verifie('getSessions exige jours (entier)', OUTILS_V2.find(o => o.name === 'getSessions').parameters.required.join() === 'jours');
  verifie('getDevice ne prend aucun paramètre', Object.keys(OUTILS_V2.find(o => o.name === 'getDevice').parameters.properties).length === 0);
}

console.log('\n9 · Les descriptions V2 disent QUAND appeler, et les unités');
{
  const desc = (n) => OUTILS_V2.find(o => o.name === n).description;
  verifie('getDay : un AUTRE jour que l\'instantané, unités /100, ms, bpm, /20',
    /AUTRE jour que celui de l'INSTANTANÉ/.test(desc('getDay')) && ['/100', 'ms', 'bpm', '/20'].every(u => desc('getDay').includes(u)));
  verifie('getHistory : au-delà des 7 jours de l\'instantané, QUE les colonnes utiles, null = pas mesuré',
    /au-delà des 7 jours de l'instantané/.test(desc('getHistory')) && /QUE les colonnes utiles/.test(desc('getHistory'))
    && /null = pas mesuré/.test(desc('getHistory')));
  verifie('getSessions : au-delà des 3 jours de l\'instantané', /AU-DELÀ des 3 jours de l'instantané/.test(desc('getSessions')));
  verifie('getSession : une séance absente du détail, le mur optique dit', /absente du détail de l'instantané/.test(desc('getSession'))
    && /mur optique/.test(desc('getSession')));
  verifie('getPastThread : un échange ABSENT de ÉCHANGES RÉCENTS', /ABSENT de ÉCHANGES RÉCENTS/.test(desc('getPastThread')));
  verifie('getDevice : porteNuit null ne veut pas dire porté', /porteNuit null ne veut PAS dire « porté »/.test(desc('getDevice')));
}

console.log('\n10 · Les libellés : chaque outil, dans les trois langues');
{
  const tous = Array.from(new Set(noms(OUTILS_V1).concat(noms(OUTILS_V2))));
  ['fr', 'en', 'es'].forEach(l => {
    const manquants = tous.filter(n => !(LIBELLES[l] && typeof LIBELLES[l][n] === 'string' && LIBELLES[l][n].endsWith('…')));
    verifie(`${l} : un libellé (« …… ») pour les ${tous.length} outils`, manquants.length === 0, manquants.join(','));
  });
  const FR = { getDay: 'Lecture de cette journée…', getHistory: 'Relecture de tes derniers jours…',
    getTrend: 'Lecture de ta tendance…', getSessions: 'Relecture de tes séances…', getSession: 'Analyse de ta séance…',
    getDevice: 'Vérification de ton bracelet…', getPastThread: 'Relecture de vos échanges…',
    // Les V1 : mot pour mot CoachActivite (CoachReseau.swift), le repli de l'app.
    getRecoveryContext: 'Analyse de ta récupération…', getSleepHistory: 'Lecture de tes nuits…',
    getTrainingLoad: "Calcul de ta charge d'entraînement…", getActivityHistory: 'Relecture de tes séances…',
    getNutritionToday: 'Lecture de tes repas du jour…', getCoachPreferences: 'Lecture de ton profil…' };
  const faux = Object.keys(FR).filter(n => LIBELLES.fr[n] !== FR[n]);
  verifie('fr : les phrases de la conception et de CoachActivite, au mot près', faux.length === 0, faux.join(','));
  verifie('en et es reprennent les traductions du catalogue de l\'app pour les V1',
    LIBELLES.en.getSleepHistory === 'Reading your nights…' && LIBELLES.es.getRecoveryContext === 'Analizando tu recuperación…');
}

console.log('\n11 · outilsPour : la table de vérité');
{
  const cas = [
    [{ capacites: { outils: 1, natif: 1 }, v2Autorise: true }, 'v2'],
    [{ capacites: { instantane: 1, outils: 2, natif: 1, memo: 1 }, v2Autorise: true }, 'v2'],
    [{ capacites: { outils: 1, natif: 1 }, v2Autorise: false }, 'v1'],
    [{ capacites: { outils: 0, natif: 1 }, v2Autorise: true }, 'v1'],
    [{ capacites: { outils: 1, natif: 0 }, v2Autorise: true }, 'v1'],
    [{ capacites: { outils: 1 }, v2Autorise: true }, 'v1'],
    [{ capacites: { outils: '1', natif: '1' }, v2Autorise: true }, 'v1'],
    [{ capacites: null, v2Autorise: true }, 'v1'],
    [{ capacites: undefined, v2Autorise: true }, 'v1'],
    [{ capacites: [1, 1], v2Autorise: true }, 'v1'],
    [{ capacites: { outils: 1, natif: 1 }, v2Autorise: 'true' }, 'v1'],
    [{ capacites: { outils: NaN, natif: 1 }, v2Autorise: true }, 'v1'],
    [{}, 'v1'],
    [undefined, 'v1']
  ];
  cas.forEach(([entree, attendu]) => {
    const r = outilsPour(entree);
    const bonJeu = attendu === 'v2' ? r.outils === OUTILS_V2 : r.outils === OUTILS_V1;
    verifie(`${JSON.stringify(entree) || 'undefined'} → ${attendu}`, r.version === attendu && bonJeu, r.version);
  });
}

console.log(`\n${ko === 0 ? '✅' : '❌'} test-coach-outils.js : ${ok} réussis, ${ko} échoués\n`);
process.exit(ko ? 1 : 0);
