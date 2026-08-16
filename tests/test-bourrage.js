/* LE BOURRAGE. La montre envoie TOUJOURS 240 valeurs par tranche, complétées
   par des zéros quand la mesure est plus courte. Sieste réelle de Dino : 1 h 21
   à partir de 15h57. Affichée : 3 h 04, 15h57 → 19h01. */
const fs = require('fs'), vm = require('vm');
const SRC = fs.readFileSync(require('path').join(__dirname,'..','flint-sommeil.js'), 'utf8');

/* v1188 — LE BANC SE JOUE HIER, PAS AUJOURD'HUI.
   Il posait ses siestes à 15 h du JOUR MÊME. Lancé le matin — 6 h 43, le jour
   où le moteur a appris à refuser une mesure venue du futur — ces 15 h n'ont
   pas encore eu lieu : le banc échouait alors que le moteur avait raison.
   Un banc ne doit pas dépendre de l'heure à laquelle on le lance. */
const JOUR = (() => { const d = new Date(); d.setDate(d.getDate() - 1); return d; })();
const K = `${JOUR.getFullYear()}-${JOUR.getMonth() + 1}-${JOUR.getDate()}`;
const at = (h, m) => { const d = new Date(JOUR); d.setHours(h, m, 0, 0); return d; };

/* Tranches de 240 slots : `reelles` minutes de vrai sommeil, le reste à 0. */
function tranchesBourrees(h, m, reelles) {
  const t0 = Math.floor(at(h, m).getTime() / 1000), out = [];
  for (let off = 0; off < Math.max(reelles, 1); off += 120) {
    const stages = [];
    for (let i = 0; i < 240; i++) {
      const abs = off + i;
      stages.push(abs < reelles ? (abs % 7 === 0 ? 1 : (abs % 5 === 0 ? 3 : 2)) : 0);
    }
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

// Nuit 02h27, 373 min réelles. Sieste 15h57, 81 min réelles (1 h 21).
store['flintSleepChunks'] = JSON.stringify([
  ...tranchesBourrees(2, 27, 373),
  ...tranchesBourrees(15, 57, 81)
]);
// L'état actuel de son téléphone : la sieste fausse, à 3 h 04.
store['sessions_' + K] = JSON.stringify([
  { name: 'VTT de l\'après-midi', icon: '🚴', start: '12:00', dur: 14, int: 3 },
  { type: 'nap', name: 'Sieste', icon: '😴', start: '15:57', dur: 184, auto: true, src: 'ble' }
]);

const av = JSON.parse(store['sessions_' + K]).find(s => s.type === 'nap');
const fmt = m => Math.floor(m / 60) + 'h' + String(m % 60).padStart(2, '0');
console.log(`AVANT · Sieste ${av.start}, ${fmt(av.dur)}   ← ce qu'il voit`);

vm.createContext(sandbox);
vm.runInContext(SRC, sandbox);
sandbox.window.flintSommeilRecalculer();

const naps = JSON.parse(store['sessions_' + K]).filter(s => s.type === 'nap');
const w = JSON.parse(store['watch_' + K]);
naps.forEach(n => console.log(`APRÈS · Sieste ${n.start}, ${fmt(n.dur)}`));
console.log(`APRÈS · Nuit   ${w.night ? new Date(w.night.sleepStart).toTimeString().slice(0,5) + ' → ' + new Date(w.night.sleepEnd).toTimeString().slice(0,5) + '  ' + fmt(w.night.sleepMin) : 'aucune'}`);

let ok = 0, ko = 0;
const v = (t, c, d) => { if (c) { ok++; console.log('  ✅ ' + t); } else { ko++; console.log('  ❌ ' + t + (d ? '  → ' + d : '')); } };
console.log('');
v('une seule sieste', naps.length === 1, `${naps.length}`);
v('elle commence bien à 15:57', naps[0] && naps[0].start === '15:57', naps[0] && naps[0].start);
v('sa durée est ~1h21, plus 3h04', naps[0] && Math.abs(naps[0].dur - 81) <= 3,
  naps[0] ? fmt(naps[0].dur) : '—');
v('le VTT est intact', JSON.parse(store['sessions_' + K]).some(s => s.name.startsWith('VTT')));
v('la nuit tient', w.night && new Date(w.night.sleepStart).getHours() === 2);
v('la nuit n\'a pas été raccourcie par le bourrage',
  w.night && w.night.sleepMin >= 340, w.night ? fmt(w.night.sleepMin) : '—');

console.log(`\n──────────────\n${ok} réussis, ${ko} échoués\n`);
process.exit(ko ? 1 : 0);
