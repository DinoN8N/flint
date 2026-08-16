/* LE MÉNAGE APRÈS LA v1167.
   Sa base contient des siestes déduites de la fréquence cardiaque (fausses),
   une sieste mesurée par la montre (vraie), et une sieste qu'il a saisie à la
   main. Seules les premières doivent disparaître. */
const fs = require('fs'), vm = require('vm');
const SRC = fs.readFileSync(require('path').join(__dirname,'..','flint-sommeil.js'), 'utf8');

/* v1188 — LE BANC SE JOUE HIER, PAS AUJOURD'HUI.
   Il posait ses siestes à 15 h du JOUR MÊME. Lancé le matin — 6 h 47, le jour
   où le moteur a appris à refuser une mesure venue du futur — ces 15 h n'ont
   pas encore eu lieu : le banc échouait alors que le moteur avait raison.
   Un banc ne doit pas dépendre de l'heure à laquelle on le lance. */
const JOUR = (() => { const d = new Date(); d.setDate(d.getDate() - 1); return d; })();
const K = `${JOUR.getFullYear()}-${JOUR.getMonth() + 1}-${JOUR.getDate()}`;
const at = (h, m) => { const d = new Date(JOUR); d.setHours(h, m, 0, 0); return d; };

function tranches(h, m, dureeMin) {
  const t0 = Math.floor(at(h, m).getTime() / 1000), out = [];
  for (let off = 0; off < dureeMin; off += 120) {
    const n = Math.min(240, dureeMin - off); if (n <= 0) break;
    const st = []; for (let i = 0; i < n; i++) st.push(i % 7 === 0 ? 1 : (i % 5 === 0 ? 3 : 2));
    out.push({ start: t0 + off * 60, unit: 1, stages: st, activity: [] });
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

// ── L'ÉTAT ABÎMÉ PAR LA v1167 ──────────────────────────────────────────────
// La montre a mesuré : la nuit (02h27) et une vraie sieste (15h00, 50 min).
store['flintSleepChunks'] = JSON.stringify([...tranches(2, 27, 373), ...tranches(15, 0, 50)]);
// Le registre porte les vraies (ble) ET les inventées (fc).
store['watch_' + K] = JSON.stringify({
  hr: [], rr: [],
  sommeils: [
    { debut: at(2, 27).getTime(), fin: at(8, 40).getTime(), type: 'mainSleep', sleepMin: 373, source: 'ble' },
    { debut: at(15, 0).getTime(), fin: at(15, 50).getTime(), type: 'nap', sleepMin: 50, source: 'ble' },
    { debut: at(10, 30).getTime(), fin: at(11, 5).getTime(), type: 'nap', sleepMin: 35, source: 'fc' },
    { debut: at(19, 15).getTime(), fin: at(19, 45).getTime(), type: 'nap', sleepMin: 30, source: 'fc' }
  ]
});
// La journée : 2 fausses siestes auto, 1 vraie auto, 1 saisie à la main.
store['sessions_' + K] = JSON.stringify([
  { name: 'VTT', icon: '🚴', start: '11:00', dur: 120, int: 3, auto: true },
  { type: 'nap', name: 'Sieste', icon: '😴', start: '15:00', dur: 50, auto: true, src: 'ble' },
  { type: 'nap', name: 'Sieste', icon: '😴', start: '10:30', dur: 35, auto: true, src: 'fc' },
  { type: 'nap', name: 'Sieste', icon: '😴', start: '19:15', dur: 30, auto: true, src: 'fc' },
  { type: 'nap', name: 'Sieste', icon: '😴', start: '17:00', dur: 20 }          // saisie à la main
]);

const avant = JSON.parse(store['sessions_' + K]).filter(s => s.type === 'nap');
console.log('AVANT · siestes en base : ' + avant.map(s => s.start + (s.auto ? '' : ' (manuelle)')).join(', '));

vm.createContext(sandbox);
vm.runInContext(SRC, sandbox);
sandbox.window.flintSommeilRecalculer();

const apres = JSON.parse(store['sessions_' + K]).filter(s => s.type === 'nap');
const w = JSON.parse(store['watch_' + K]);
console.log('APRÈS · siestes en base : ' + apres.map(s => s.start + (s.auto ? '' : ' (manuelle)')).join(', '));
console.log('APRÈS · registre        : ' + (w.sommeils || []).map(s => new Date(s.debut).getHours() + 'h ' + s.type + '/' + s.source).join('  |  '));

let ok = 0, ko = 0;
const v = (t, c, d) => { if (c) { ok++; console.log('  ✅ ' + t); } else { ko++; console.log('  ❌ ' + t + (d ? '  → ' + d : '')); } };

console.log('');
v('la fausse sieste de 10h30 est partie', !apres.some(s => s.start === '10:30'));
v('la fausse sieste de 19h15 est partie', !apres.some(s => s.start === '19:15'));
v('la VRAIE sieste de 15h00 est conservée', apres.some(s => s.start === '15:00'),
  JSON.stringify(apres));
v('la sieste saisie à la main est conservée', apres.some(s => s.start === '17:00'));
v('le VTT n\'a pas été touché',
  JSON.parse(store['sessions_' + K]).some(s => s.name === 'VTT'));
v('plus aucune entrée « fc » au registre',
  !(w.sommeils || []).some(s => s.source === 'fc'),
  JSON.stringify((w.sommeils || []).map(s => s.source)));
v('la nuit est intacte',
  w.night && new Date(w.night.sleepStart).getHours() === 2,
  w.night ? new Date(w.night.sleepStart).toTimeString().slice(0, 5) : 'aucune');

console.log(`\n──────────────\n${ok} réussis, ${ko} échoués\n`);
process.exit(ko ? 1 : 0);
