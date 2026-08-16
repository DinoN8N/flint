/* LE CAS DE DINO, DEUXIÈME COUCHE.
   La montre a envoyé les stades de la NUIT, mais pas ceux de la sieste : celle-ci
   n'existe que dans la courbe de fréquence cardiaque. Avant, `computeNight` la
   voyait (et écrasait la nuit). Depuis le correctif, la nuit gagne — et la sieste
   n'est plus vue par personne. Vérifions qu'elle redevient une activité. */
const fs = require('fs'), vm = require('vm');
const SRC = fs.readFileSync(require('path').join(__dirname,'..','flint-sommeil.js'), 'utf8');

/* v1188 — LE BANC SE JOUE HIER, PAS AUJOURD'HUI.
   Il posait ses siestes à 15 h du JOUR MÊME. Lancé le matin — 6 h 43, le jour
   où le moteur a appris à refuser une mesure venue du futur — ces 15 h n'ont
   pas encore eu lieu : le banc échouait alors que le moteur avait raison.
   Un banc ne doit pas dépendre de l'heure à laquelle on le lance. */
const JOUR = (() => { const d = new Date(); d.setDate(d.getDate() - 1); return d; })();
const K = `${JOUR.getFullYear()}-${JOUR.getMonth() + 1}-${JOUR.getDate()}`;
const hhmm = m => String(Math.floor(m / 60)).padStart(2, '0') + 'h' + String(m % 60).padStart(2, '0');

function tranches(hDeb, mDeb, dureeMin) {
  const d = new Date(JOUR); d.setHours(hDeb, mDeb, 0, 0);
  const t0 = Math.floor(d.getTime() / 1000), out = [];
  for (let off = 0; off < dureeMin; off += 120) {
    const n = Math.min(240, dureeMin - off); if (n <= 0) break;
    const stages = []; for (let i = 0; i < n; i++) stages.push(i % 7 === 0 ? 1 : (i % 5 === 0 ? 3 : 2));
    out.push({ start: t0 + off * 60, unit: 1, stages, activity: [] });
  }
  return out;
}

/* Une journée de fréquence cardiaque : repos 52, nuit 48, VTT 145, sieste 50. */
function courbeFC({ siesteDeb, siesteFin }) {
  const hr = [];
  for (let m = 0; m < 1380; m += 3) {
    let v;
    if (m >= 147 && m < 520) v = 47 + (m % 5);                 // nuit 02h27 → 08h40
    else if (m >= 660 && m < 780) v = 140 + (m % 11);          // VTT 11h → 13h
    else if (m >= siesteDeb && m < siesteFin) v = 49 + (m % 4); // la sieste
    else v = 68 + (m % 13);                                    // journée ordinaire
    hr.push([m, v]);
  }
  return hr;
}

function lancer({ avecTranchesSieste, siesteDeb, siesteFin }) {
  const store = {};
  const sandbox = {
    localStorage: { getItem: k => (k in store ? store[k] : null),
                    setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } },
    window: {}, document: { addEventListener() {} }, console: { log: () => {} },
    Date, JSON, Math, Array, String, Number, setTimeout, clearTimeout
  };
  const chunks = [...tranches(2, 27, 373)];
  if (avecTranchesSieste) chunks.push(...tranches(Math.floor(siesteDeb / 60), siesteDeb % 60, siesteFin - siesteDeb));
  store['flintSleepChunks'] = JSON.stringify(chunks);
  store['watch_' + K] = JSON.stringify({ hr: courbeFC({ siesteDeb, siesteFin }), rr: [] });
  vm.createContext(sandbox);
  vm.runInContext(SRC, sandbox);
  sandbox.window.flintSommeilRecalculer();
  const w = JSON.parse(store['watch_' + K]);
  return {
    nuit: w.night,
    activites: (JSON.parse(store['sessions_' + K] || '[]')).filter(s => s.type === 'nap'),
    registre: sandbox.window.flSommeilDuJour(K)
  };
}

let ok = 0, ko = 0;
const v = (t, c, d) => { if (c) { ok++; console.log('  ✅ ' + t); } else { ko++; console.log('  ❌ ' + t + (d ? '  → ' + d : '')); } };

console.log('\nA · Sieste 15h00–15h45 connue de la montre (stades transmis)');
{
  const r = lancer({ avecTranchesSieste: true, siesteDeb: 900, siesteFin: 945 });
  v('la nuit tient', r.nuit && new Date(r.nuit.sleepStart).getHours() === 2,
    r.nuit ? hhmm(r.nuit.bedMin) : 'aucune');
  v('la sieste est une activité', r.activites.length === 1, JSON.stringify(r.activites));
  if (r.activites[0]) console.log(`     → ${r.activites[0].start}, ${r.activites[0].dur} min`);
}

console.log('\nB · Période de cœur bas SANS stades : on n\'invente rien (v1168)');
{
  // Un cœur bas n'est pas une preuve de sommeil — assis, en voiture, après un
  // effort, il redescend pareil. La v1167 en faisait des siestes : Dino en a
  // récolté qu'il n'avait jamais faites. Seule la mesure de la montre compte.
  const r = lancer({ avecTranchesSieste: false, siesteDeb: 900, siesteFin: 945 });
  v('la nuit tient', r.nuit && new Date(r.nuit.sleepStart).getHours() === 2,
    r.nuit ? 'début ' + hhmm(r.nuit.bedMin) : 'aucune');
  v('AUCUNE sieste inventée depuis la seule FC', r.activites.length === 0,
    JSON.stringify(r.activites));
  v('le registre ne porte que la nuit mesurée', r.registre.length === 1,
    JSON.stringify(r.registre.map(x => x.type + '/' + x.source)));
}

console.log('\nC · Sommeil de jour LONG (13h30–17h) : secondarySleep, mais il s\'ajoute');
{
  const r = lancer({ avecTranchesSieste: true, siesteDeb: 810, siesteFin: 1020 });
  v('la nuit tient', r.nuit && new Date(r.nuit.sleepStart).getHours() === 2);
  v('il devient une activité malgré son type', r.activites.length === 1,
    JSON.stringify(r.activites));
}

console.log('\nD · Aucun doublon quand les deux moteurs voient la même sieste');
{
  const r = lancer({ avecTranchesSieste: true, siesteDeb: 900, siesteFin: 945 });
  v('une seule entrée', r.activites.length === 1, `${r.activites.length} entrées`);
}

console.log('\nE · Le VTT (FC haute) ne fabrique pas de sommeil');
{
  const r = lancer({ avecTranchesSieste: false, siesteDeb: 900, siesteFin: 945 });
  const faux = r.registre.filter(x => { const h = new Date(x.debut).getHours(); return h >= 11 && h < 13; });
  v('aucune période inventée pendant l\'effort', faux.length === 0, JSON.stringify(faux));
}

console.log(`\n──────────────\n${ok} réussis, ${ko} échoués\n`);
process.exit(ko ? 1 : 0);
