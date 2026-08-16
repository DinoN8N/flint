/* LA BASE EST DÉJÀ ABÎMÉE : `night` contient la sieste, la nuit a disparu.
   Question : le moteur corrigé la répare-t-il tout seul au prochain lancement,
   sans que Dino ait à effacer quoi que ce soit ? */
const fs = require('fs'), vm = require('vm');
const SRC = fs.readFileSync(require('path').join(__dirname,'..','flint-sommeil.js'), 'utf8');

const JOUR = new Date(2026, 7, 4);
const K = `${JOUR.getFullYear()}-${JOUR.getMonth() + 1}-${JOUR.getDate()}`;
const a = (h, m) => { const d = new Date(JOUR); d.setHours(h, m, 0, 0); return d; };
const hhmm = ms => { const d = new Date(ms); return String(d.getHours()).padStart(2, '0') + 'h' + String(d.getMinutes()).padStart(2, '0'); };

function tranches(dateDebut, dureeMin) {
  const t0 = Math.floor(dateDebut.getTime() / 1000), out = [];
  for (let off = 0; off < dureeMin; off += 120) {
    const n = Math.min(240, dureeMin - off); if (n <= 0) break;
    const stages = []; for (let i = 0; i < n; i++) stages.push(i % 7 === 0 ? 1 : (i % 5 === 0 ? 3 : 2));
    out.push({ start: t0 + off * 60, unit: 1, stages, activity: [] });
  }
  return out;
}

const store = {};
const sandbox = {
  localStorage: { getItem: k => (k in store ? store[k] : null),
                  setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } },
  window: {}, document: { addEventListener() {} }, console: { log: () => {} },
  Date, JSON, Math, Array, String, Number, setTimeout, clearTimeout
};

// ── ÉTAT DE DÉPART : exactement ce qu'il a sur son téléphone aujourd'hui ────
// Les tranches brutes des DEUX périodes sont encore là (8 jours de rétention),
// mais `night` a été écrasée par la sieste de 15 h.
const chunks = [...tranches(a(2, 27), 373), ...tranches(a(15, 0), 40)];
store['flintSleepChunks'] = JSON.stringify(chunks);
const sieste = a(15, 0).getTime();
store['watch_' + K] = JSON.stringify({
  hr: [], rr: [],
  night: { sleepStart: sieste, sleepEnd: sieste + 40 * 60000, sleepMin: 38, timeInBed: 40,
           bedMin: 15 * 60, wakeMin: 15 * 60 + 40, deep: 8, light: 25, rem: 5, awake: 2,
           stages: [{ startMin: 0, durMin: 40, stage: 'light' }], source: 'ble' }
});

const av = JSON.parse(store['watch_' + K]).night;
console.log(`AVANT  · « nuit » enregistrée : ${hhmm(av.sleepStart)} → ${hhmm(av.sleepEnd)} (${av.sleepMin} min)  ← la sieste`);

// ── ON INSTALLE LE MOTEUR CORRIGÉ ET ON LAISSE LA SYNCHRO SE FAIRE ─────────
vm.createContext(sandbox);
vm.runInContext(SRC, sandbox);
sandbox.window.flintSommeilRecalculer();

const ap = JSON.parse(store['watch_' + K]).night;
const naps = JSON.parse(store['sessions_' + K] || '[]').filter(s => s.type === 'nap');
const reg = sandbox.window.flSommeilDuJour(K);

console.log(`APRÈS  · nuit principale    : ${ap ? hhmm(ap.sleepStart) + ' → ' + hhmm(ap.sleepEnd) + ' (' + ap.sleepMin + ' min)' : 'AUCUNE'}`);
console.log(`APRÈS  · siestes du jour    : ${naps.map(n => n.start + ' (' + n.dur + ' min)').join(', ') || 'aucune'}`);
console.log(`APRÈS  · registre           : ${reg.map(r => hhmm(r.debut) + '-' + hhmm(r.fin) + ' ' + r.type).join('  |  ')}`);

const nuitRevenue = ap && new Date(ap.sleepStart).getHours() === 2 && new Date(ap.sleepStart).getMinutes() === 27;
const siesteGardee = naps.length === 1;
console.log('\n' + (nuitRevenue && siesteGardee
  ? '✅ RÉPARATION AUTOMATIQUE : la nuit revient, la sieste reste à part. Rien à effacer.'
  : '❌ pas de réparation automatique — il faudrait une purge manuelle.'));
process.exit(nuitRevenue && siesteGardee ? 0 : 1);
