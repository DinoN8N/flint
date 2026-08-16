/* ═══════════════════════════════════════════════════════════════════════════
   ON NE MARCHE PAS EN DORMANT — rejoué sur le vrai 7 août de Dino.
   ═══════════════════════════════════════════════════════════════════════════

   LE CAS. Le 7 août 2026, la montre a classé 10h56 → 14h16 en `secondarySleep`,
   116 minutes de sommeil. Elle a compté elle-même 2 133 pas dans cette fenêtre,
   dont un bloc de 642 avec neuf minutes actives sur dix. Dino était en
   randonnée — WHOOP a vu une sortie à 11h59.

   FLINT relayait fidèlement et affichait une sieste de 200 minutes. Ce n'est pas
   un oubli : ces minutes étaient comptées À L'ENVERS, et la charge du jour puis
   la récupération du lendemain s'appuyaient dessus. C'était le point n°1 de la
   liste ouverte.

   CE QUE CE BANC PROTÈGE. Deux choses, et la seconde compte autant :
     — la fausse sieste est refusée ;
     — les VRAIES ne le sont pas. Un garde trop large supprimerait les siestes
       de quelqu'un qui se lève une fois, et personne ne s'en apercevrait avant
       longtemps.

   LES CAS SONT RÉELS, tirés de `releves/donnees-dino-2026-08-11.json` : treize
   fenêtres de sommeil mesurées, dont une seule fausse. Ils sont figés ici pour
   que le banc tourne même sans l'export.

   USAGE :  node FLINT/web/tests/test-marche-pas-sommeil.js
   ═══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');
let ok = 0, ko = 0;
function v(nom, cond, detail) {
  if (cond) { ok++; console.log('✅ ' + nom); }
  else { ko++; console.log('❌ ' + nom + (detail ? '  ' + detail : '')); }
}

/* ═══ UN localStorage DE POCHE, ET L'HEURE FIGÉE ══════════════════════════ */
const STORE = {};
global.localStorage = {
  getItem: k => (STORE[k] === undefined ? null : STORE[k]),
  setItem: (k, val) => { STORE[k] = String(val); },
  removeItem: k => { delete STORE[k]; }
};
global.window = { flDayOff: 0 };
global.document = { addEventListener() {}, readyState: 'complete' };

const SRC = fs.readFileSync(path.join(__dirname, '..', 'flint-sommeil.js'), 'utf8');

/* On prélève les deux fonctions par leurs amorces, en équilibrant les accolades :
   on teste le moteur, pas une transcription. Si l'une disparaît, le banc
   s'arrête au lieu de mesurer un fantôme. */
function bloc(amorce) {
  const i = SRC.indexOf(amorce);
  if (i < 0) throw new Error('amorce introuvable dans flint-sommeil.js : ' + amorce);
  let d = 0, j = SRC.indexOf('{', i);
  for (;;) { if (SRC[j] === '{') d++; else if (SRC[j] === '}') { d--; if (!d) break; } j++; }
  return SRC.slice(i, j + 1);
}
const CODE = [
  "var TYPE_NUIT = 'mainSleep';",
  'function flsLog(){}',
  bloc('function flsLire('),
  bloc('function flsMarcheDans('),
  'return { flsMarcheDans: flsMarcheDans };'
].join('\n');
const M = new Function(CODE)();
v('flsMarcheDans se prélève et s\'exécute', typeof M.flsMarcheDans === 'function');

/* ═══ LES SEUILS, RELUS DANS LE FICHIER PLUTÔT QUE RECOPIÉS ═══════════════ */
const SUITE_MINI = +(SRC.match(/MARCHE_SUITE_MINI\s*=\s*(\d+)/) || [])[1];
const PAS_MINI = +(SRC.match(/MARCHE_PAS_MINI\s*=\s*(\d+)/) || [])[1];
v('les deux seuils se lisent dans le moteur', SUITE_MINI > 0 && PAS_MINI > 0,
  'suite=' + SUITE_MINI + ' pas=' + PAS_MINI);

/* ═══ LES BLOCS RÉELS DU 7 AOÛT, DANS LA FENÊTRE 10h56 → 14h16 ═══════════
   Format : [horodatage epoch (s), pas du bloc, kcal, répartition minute]. */
const H = (h, m) => Math.floor(new Date(2026, 7, 7, h, m, 0).getTime() / 1000);
STORE['watch_2026-8-7'] = JSON.stringify({
  actDet: [
    [H(11, 59), 21, 1, [21, 0, 0, 0, 0, 0, 0, 0, 0, 0]],
    [H(12, 0), 642, 26, [88, 91, 30, 0, 74, 22, 96, 88, 82, 71]],
    [H(12, 10), 122, 5, [80, 42, 0, 0, 0, 0, 0, 0, 0, 0]],
    [H(13, 16), 34, 2, [34, 0, 0, 0, 0, 0, 0, 0, 0, 0]],
    [H(13, 45), 163, 7, [22, 28, 31, 25, 0, 0, 33, 24, 0, 0]],
    [H(13, 55), 113, 5, [61, 52, 0, 0, 0, 0, 0, 0, 0, 0]],
    [H(14, 6), 633, 25, [18, 21, 27, 62, 71, 88, 90, 92, 84, 80]]
  ]
});
const faux = M.flsMarcheDans('2026-8-7',
  new Date(2026, 7, 7, 10, 56).getTime(), new Date(2026, 7, 7, 14, 16).getTime());
console.log('\n  le 7 août, 10h56–14h16 : ' + faux.pas + ' pas, '
            + faux.suite + ' minutes de marche d\'affilée\n');
v('la fenêtre du 7 août dépasse le seuil de pas', faux.pas >= PAS_MINI, 'eu ' + faux.pas);
v('elle dépasse aussi celui de la suite', faux.suite >= SUITE_MINI, 'eu ' + faux.suite);

/* ═══ ET LES VRAIES NUITS NE DOIVENT PAS TOMBER ═══════════════════════════
   Relevées sur le même export. La nuit du 11 août est le pire cas mesuré :
   185 pas, sept minutes, dont une suite de quatre — il s'est levé. */
STORE['watch_2026-8-11'] = JSON.stringify({
  actDet: [
    [Math.floor(new Date(2026, 7, 11, 1, 34).getTime() / 1000), 40, 1, [40, 0, 0, 0, 0, 0, 0, 0, 0, 0]],
    [Math.floor(new Date(2026, 7, 11, 4, 20).getTime() / 1000), 92, 4, [18, 24, 27, 23, 0, 0, 0, 0, 0, 0]],
    [Math.floor(new Date(2026, 7, 11, 7, 5).getTime() / 1000), 53, 2, [31, 0, 22, 0, 0, 0, 0, 0, 0, 0]]
  ]
});
const nuit = M.flsMarcheDans('2026-8-11',
  new Date(2026, 7, 11, 1, 34).getTime(), new Date(2026, 7, 11, 9, 31).getTime());
console.log('  la nuit du 11 août     : ' + nuit.pas + ' pas, '
            + nuit.suite + ' minutes d\'affilée\n');
v('une vraie nuit ne franchit PAS les deux seuils ensemble',
  !(nuit.suite >= SUITE_MINI && nuit.pas >= PAS_MINI),
  nuit.pas + ' pas / ' + nuit.suite + ' min');
v('la marge sur la suite reste d\'au moins deux minutes',
  SUITE_MINI - nuit.suite >= 2, 'seuil ' + SUITE_MINI + ', mesuré ' + nuit.suite);

/* ═══ UNE JOURNÉE SANS RÉPARTITION NE DOIT RIEN REFUSER ═══════════════════
   Les blocs d'avant la v1413 n'ont que leur total. La suite y vaut zéro, donc
   les deux conditions ne peuvent pas être réunies : une donnée absente ne
   prouve rien, surtout pas l'inverse de ce qu'on cherche. */
STORE['watch_2026-7-1'] = JSON.stringify({
  actDet: [[Math.floor(new Date(2026, 6, 1, 12, 0).getTime() / 1000), 3000, 120]]
});
const vieux = M.flsMarcheDans('2026-7-1',
  new Date(2026, 6, 1, 11, 0).getTime(), new Date(2026, 6, 1, 14, 0).getTime());
v('sans répartition, la suite vaut zéro et rien n\'est refusé',
  vieux.suite === 0 && vieux.pas >= 3000, JSON.stringify(vieux));

/* ═══ ET UNE JOURNÉE SANS AUCUN PAS ═══════════════════════════════════════ */
STORE['watch_2026-7-2'] = JSON.stringify({ actDet: [] });
const vide = M.flsMarcheDans('2026-7-2', Date.now() - 3600000, Date.now());
v('une journée sans bloc rend zéro partout', vide.pas === 0 && vide.suite === 0);

console.log('\n' + ok + ' réussis, ' + ko + ' échoués');
process.exit(ko ? 1 : 0);
