/* Banc d'essai de flPurgeToutLeFaux : on lui donne un jour VRAI, un jour SEMÉ
   et un jour FUTUR, et on vérifie qu'elle ne touche qu'à ce qu'elle doit. */
const fs = require('fs'), vm = require('vm');
const src = fs.readFileSync(process.argv[2] || __dirname + '/../index.html', 'utf8');

const debut = src.indexOf('window.flHrPasFabrique=function(serie){');
const fin   = src.indexOf("/* Efface tout ce que le semeur a écrit", debut);
if (debut < 0 || fin < 0) { console.log('❌ extraction impossible'); process.exit(1); }
const code = src.slice(debut, fin);

/* ── base fictive ───────────────────────────────────────────────────────── */
const store = {};
const JOUR = new Date(2026, 7, 10);                       /* 10 août 2026 */
function tk(off) {
  const d = new Date(JOUR.getTime() + (off || 0) * 86400000);
  return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
}
const DB = {
  get(k, def) { return store[k] === undefined ? (def === undefined ? null : def) : store[k]; },
  set(k, v) { if (v === null) delete store[k]; else store[k] = v; }
};

/* Jour VRAI (hier) : courbe mesurée irrégulière, nuit avec provenance. */
const VRAI = tk(-1);
const hrVrai = [];
for (let m = 0; m < 700; m++) if (m % 7 !== 3 && m % 11 !== 5) hrVrai.push([m, 48 + (m % 13)]);
store['watch_' + VRAI] = {
  hr: hrVrai, rr: new Array(3200).fill(0).map((_, i) => 700 + (i % 900)),
  steps: 3512, kcal: 421,
  night: { sleepMin: 412, stageSrc: 'flint-hr', stages: [{ s: 'deep', d: 78 }], bedMin: 35, wakeMin: 537 }
};
store['sessions_' + VRAI] = [
  { name: 'Padel', auto: true, real: true, dur: 60 },      /* détectée sur une VRAIE courbe */
  { name: 'Muscu', dur: 45 }                               /* saisie à la main */
];
store['meals_' + VRAI] = [{ name: 'Poulet riz', kcal: 760, time: '12:45' }];
store['recov_' + VRAI] = 57;

/* Jour SEMÉ (il y a 30 jours) : capteur 'sim', courbe à 5 min pile. */
const SEME = tk(-30);
const hrFaux = [];
for (let t = 0; t < 1440; t += 5) hrFaux.push([t, 47 + (t % 7)]);
store['sensor_' + SEME] = { hrv: 74, rhr: 49, source: 'sim' };
store['watch_' + SEME] = {
  hr: hrFaux, rr: new Array(40).fill(1250), steps: 12967, kcal: 700,
  night: { sleepMin: 400, bedMin: 30, wakeMin: 430 }, demo: true
};
store['sessions_' + SEME] = [{ name: 'Course', auto: true, dur: 50 }, { name: 'Yoga', dur: 30 }];
store['meals_' + SEME] = [{ name: 'Journée', kcal: 1950 }];
store['journal_' + SEME] = { cafe: true };
store['recov_' + SEME] = 61;

/* Jour SANS courbe mais avec une séance auto (signature flSeedTest). */
const NUE = tk(-60);
store['sessions_' + NUE] = [{ name: 'HIIT', auto: true, dur: 40 }, { name: 'Marche', dur: 25 },
  { name: 'Marche', auto: true, real: true, src: 'montre', dur: 22, steps: 2140 }];

/* Jour FUTUR. */
const FUTUR = tk(5);
store['watch_' + FUTUR] = { hr: [[0, 50]], steps: 9000 };
store['meals_' + FUTUR] = [{ name: 'Déjeuner', kcal: 700 }];
store['recov_' + FUTUR] = 72;

/* Aujourd'hui : un repas tapé à la main sur un jour semé — ne doit PAS partir. */
const AUJ = tk(0);
store['sensor_' + AUJ] = { source: 'demo' };
store['meals_' + AUJ] = [{ name: 'Skyr', kcal: 280, time: '08:10' },
  { name: 'Œufs brouillés & avocat', kcal: 510, prot: 26, carb: 18, fat: 38, time: '08:20', demo: true }];

/* ── exécution ──────────────────────────────────────────────────────────── */
const logs = [];
const sandbox = { DB, tk, window: {}, console: { log: (...a) => logs.push(a.join(' ')) },
                  localStorage: { setItem() {}, removeItem() {} }, Object, Array, Date, Math, JSON, String, Number };
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(code, sandbox);
const B = sandbox.flPurgeToutLeFaux();

/* ── vérifications ──────────────────────────────────────────────────────── */
let ok = 0, ko = 0;
const v = (t, c, d) => c ? (ok++, console.log('  ✅ ' + t)) : (ko++, console.log('  ❌ ' + t + (d ? '  → ' + d : '')));

console.log('\nLe jour VRAI est intact');
const wv = store['watch_' + VRAI] || {};
v('la courbe mesurée est conservée', (wv.hr || []).length === hrVrai.length, (wv.hr || []).length + ' points');
v('les intervalles RR réels sont conservés', (wv.rr || []).length === 3200);
v('les pas mesurés sont conservés', wv.steps === 3512);
v('la nuit mesurée est conservée', !!(wv.night && wv.night.stageSrc));
v('la séance auto sur vraie courbe est conservée', (store['sessions_' + VRAI] || []).length === 2);
v('le repas est conservé', (store['meals_' + VRAI] || []).length === 1);
v('la récup d’un jour mesuré est conservée', store['recov_' + VRAI] === 57);

console.log('\nLe jour SEMÉ est nettoyé');
const ws = store['watch_' + SEME];
v('le conteneur semé disparaît entièrement', ws == null, JSON.stringify(ws || {}).slice(0, 80));
v('le capteur « sim » disparaît', store['sensor_' + SEME] == null);
v('la séance auto disparaît, la manuelle reste',
  (store['sessions_' + SEME] || []).length === 1 && store['sessions_' + SEME][0].name === 'Yoga');
v('les repas semés sont retirés', (store['meals_' + SEME] || []).length === 0);
v('… et sauvegardés', !!(store['purge.total.repas'] && store['purge.total.repas'][SEME]));
v('le journal semé disparaît', store['journal_' + SEME] == null);
v('la récup sans nuit mesurée disparaît', store['recov_' + SEME] == null);

console.log('\nLes autres règles');
v('séance auto sans aucune courbe : retirée', (store['sessions_' + NUE] || []).length === 2);
v('… mais celle LIVREE PAR LA MONTRE survit', (store['sessions_' + NUE] || []).some(x => x.src === 'montre'));
v('le futur est entièrement effacé',
  store['watch_' + FUTUR] == null && store['meals_' + FUTUR] == null && store['recov_' + FUTUR] == null);
v('le repas tapé aujourd’hui est préservé', (store['meals_' + AUJ] || []).some(x => x.name === 'Skyr'));
v('… et le repas SEMÉ d’aujourd’hui est retiré', !(store['meals_' + AUJ] || []).some(x => x.demo));
v('un bilan est écrit', !!store['purge.total.bilan']);

console.log('\n' + logs.join('\n'));
console.log('\n' + ok + ' réussis, ' + ko + ' échoués');
process.exit(ko ? 1 : 0);
