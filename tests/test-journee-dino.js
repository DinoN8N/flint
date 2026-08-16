/* ═══════════════════════════════════════════════════════════════════════════
   LA RÈGLE DE DINO, ÉCRITE PAR LUI, REJOUÉE EN ENTIER.
   ═══════════════════════════════════════════════════════════════════════════

   Le 5 août au matin, après deux jours de nuits faussées, il a posé la règle
   lui-même, et elle ne souffre aucune interprétation :

     « Je dors, j'ai mon sommeil qui est enregistré. Ça, c'est ma nuit, il
       s'enregistre comme nuit. Si après je veux faire une activité et aller
       manger, ça s'enregistrera dans les activités. Si après je décide de faire
       une sieste, ça ne supprime pas la nuit, mais le backend détecte bien du
       sommeil, donc ça ajoute automatiquement une activité sieste. La nuit est
       réinitialisée à minuit le lendemain, ou alors jusqu'à qu'il y ait de
       nouveau du sommeil détecté, et dans ce cas la nuit remplace l'autre. »

   Ce banc ne teste pas des morceaux : il rejoue UNE JOURNÉE ENTIÈRE dans
   l'ordre, comme elle se vit. Chaque étape vérifie que les précédentes tiennent
   encore — parce que le défaut du 4 août n'était pas qu'une sieste soit mal
   classée, c'est qu'elle EFFAÇAIT ce qui était déjà juste.

   Si un jour ce banc devient rouge, c'est que la promesse faite à Dino est
   cassée. Il n'y a rien à interpréter : on répare avant de livrer.
   ═══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const vm = require('vm');
const SRC = fs.readFileSync(require('path').join(__dirname, '..', 'flint-sommeil.js'), 'utf8');

/* L'heure est FIXÉE au lendemain soir : toute la journée jouée est donc dans le
   passé, et le banc rend le même verdict à 3 h du matin comme à midi. */
const MAINTENANT = new Date(2026, 7, 6, 22, 0, 0, 0);

const J1 = new Date(2026, 7, 5);                         // mercredi 5 août
const J2 = new Date(2026, 7, 6);                         // jeudi 6 août
const cle = d => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
const K1 = cle(J1), K2 = cle(J2);

function env() {
  const store = {};
  class DateFigee extends Date {
    constructor(...a) { if (a.length === 0) super(MAINTENANT.getTime()); else super(...a); }
    static now() { return MAINTENANT.getTime(); }
  }
  const win = {};
  const bac = {
    localStorage: {
      getItem: k => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: k => { delete store[k]; }
    },
    window: win, document: { addEventListener() {} }, console: { log: () => {} },
    Date: DateFigee, JSON, Math, Array, String, Number, setTimeout, clearTimeout
  };
  vm.createContext(bac);
  vm.runInContext(SRC, bac);
  return { win, store };
}

/* Une période de sommeil → les tranches de 4 h que la montre envoie réellement. */
function tranches(quand, dureeMin) {
  const t0 = Math.floor(quand.getTime() / 1000), out = [];
  for (let off = 0; off < dureeMin; off += 120) {
    const n = Math.min(240, dureeMin - off);
    if (n <= 0) break;
    const stages = [];
    for (let i = 0; i < n; i++) stages.push(i % 7 === 0 ? 1 : (i % 5 === 0 ? 3 : 2));
    out.push({ start: t0 + off * 60, unit: 1, stages, activity: [] });
  }
  return out;
}
const heure = (jour, h, m) => { const d = new Date(jour); d.setHours(h, m, 0, 0); return d; };
const envoyer = (e, l) => l.forEach(t => e.win.flintSommeilTranche(t));
const nuit = (e, k) => { const w = JSON.parse(e.store['watch_' + k] || 'null'); return w && w.night; };
const seances = (e, k) => JSON.parse(e.store['sessions_' + k] || '[]');
const hhmm = ms => { const d = new Date(ms); return String(d.getHours()).padStart(2, '0') + 'h' + String(d.getMinutes()).padStart(2, '0'); };

let ok = 0, ko = 0;
function verifie(titre, condition, detail) {
  if (condition) { ok++; console.log(`  ✅ ${titre}`); }
  else { ko++; console.log(`  ❌ ${titre}${detail ? '  → ' + detail : ''}`); }
}

const e = env();

// ── 1 · « Je dors, ça s'enregistre comme nuit » ─────────────────────────────
console.log('\n1 · La nuit du mercredi : 2h27 → 8h41');
envoyer(e, tranches(heure(J1, 2, 27), 374));
{
  const n = nuit(e, K1);
  verifie('la nuit existe', !!n, 'aucune');
  if (n) {
    verifie('elle commence bien à 2h27', hhmm(n.sleepStart) === '02h27', hhmm(n.sleepStart));
    verifie('elle finit bien à 8h41', hhmm(n.sleepEnd) === '08h41', hhmm(n.sleepEnd));
    console.log(`     → nuit : ${hhmm(n.sleepStart)} → ${hhmm(n.sleepEnd)} (${n.sleepMin} min dormies)`);
  }
  verifie('aucune sieste n\'a été inventée au passage',
          seances(e, K1).filter(s => s.type === 'nap').length === 0,
          JSON.stringify(seances(e, K1)));
}

// ── 2 · « Une activité et un repas s'enregistrent dans les activités » ──────
console.log('\n2 · Une sortie à 11h et un déjeuner à 12h30');
{
  // Ils vivent dans la journée du moteur, écrits par l'app, PAS par le sommeil.
  const ss = seances(e, K1);
  ss.push({ name: 'VTT', start: '11:00', dur: 65, int: 3, auto: false });
  e.store['sessions_' + K1] = JSON.stringify(ss);
  e.store['meals_' + K1] = JSON.stringify([{ name: 'Déjeuner', time: '12:30', kcal: 780 }]);

  // Une nouvelle synchro de la montre ne doit toucher à rien de tout ça.
  e.win.flintSommeilRecalculer();

  verifie('le VTT est toujours là', seances(e, K1).some(s => s.name === 'VTT'),
          JSON.stringify(seances(e, K1)));
  verifie('le déjeuner est toujours là',
          JSON.parse(e.store['meals_' + K1] || '[]').length === 1);
  const n = nuit(e, K1);
  verifie('et la nuit n\'a pas bougé', n && hhmm(n.sleepStart) === '02h27',
          n ? hhmm(n.sleepStart) : 'AUCUNE');
}

// ── 3 · « Une sieste s'ajoute, elle ne supprime pas la nuit » ───────────────
console.log('\n3 · Une sieste de 15h00 à 16h21');
envoyer(e, tranches(heure(J1, 15, 0), 81));
{
  const n = nuit(e, K1);
  verifie('LA NUIT EST INTACTE — début', n && hhmm(n.sleepStart) === '02h27',
          n ? hhmm(n.sleepStart) : 'AUCUNE');
  verifie('LA NUIT EST INTACTE — fin', n && hhmm(n.sleepEnd) === '08h41',
          n ? hhmm(n.sleepEnd) : 'AUCUNE');

  const naps = seances(e, K1).filter(s => s.type === 'nap');
  verifie('la sieste est ajoutée comme activité', naps.length === 1,
          JSON.stringify(naps));
  if (naps.length === 1) {
    verifie('à la bonne heure : 15:00', naps[0].start === '15:00', naps[0].start);
    verifie('et pour sa vraie durée : 81 min, pas la tranche de 4 h',
            naps[0].dur === 81, naps[0].dur + ' min');
  }
  verifie('le VTT n\'a pas été emporté', seances(e, K1).some(s => s.name === 'VTT'));
}

// ── 4 · « La nuit est réinitialisée le lendemain » ──────────────────────────
console.log('\n4 · Le lendemain : la nuit du mercredi reste au mercredi');
envoyer(e, tranches(heure(J2, 1, 10), 400));
{
  const n1 = nuit(e, K1), n2 = nuit(e, K2);
  verifie('le mercredi garde SA nuit', n1 && hhmm(n1.sleepStart) === '02h27',
          n1 ? hhmm(n1.sleepStart) : 'AUCUNE');
  verifie('le jeudi a la SIENNE, séparée', !!n2, 'aucune');
  if (n2) {
    verifie('celle du jeudi commence à 1h10', hhmm(n2.sleepStart) === '01h10',
            hhmm(n2.sleepStart));
    console.log(`     → mercredi ${hhmm(n1.sleepStart)}-${hhmm(n1.sleepEnd)}  ·  jeudi ${hhmm(n2.sleepStart)}-${hhmm(n2.sleepEnd)}`);
  }
  verifie('la sieste du mercredi est toujours au mercredi',
          seances(e, K1).filter(s => s.type === 'nap').length === 1);
  verifie('et le jeudi n\'a hérité d\'aucune sieste',
          seances(e, K2).filter(s => s.type === 'nap').length === 0,
          JSON.stringify(seances(e, K2)));
}

// ── 5 · « Une nuit plus complète remplace la précédente » ───────────────────
console.log('\n5 · La montre finit sa synchro : le DÉBUT de la nuit du jeudi arrive');
{
  // La mémoire du bracelet est circulaire : le début arrive souvent plus tard.
  envoyer(e, tranches(heure(J2, 0, 5), 465));
  const n2 = nuit(e, K2);
  verifie('la nuit du jeudi s\'est allongée vers le début',
          n2 && hhmm(n2.sleepStart) === '00h05', n2 ? hhmm(n2.sleepStart) : 'AUCUNE');
  verifie('et elle n\'a PAS raccourci', n2 && n2.sleepMin >= 400,
          n2 ? n2.sleepMin + ' min' : '—');
  const n1 = nuit(e, K1);
  verifie('le mercredi n\'a toujours pas bougé', n1 && hhmm(n1.sleepStart) === '02h27',
          n1 ? hhmm(n1.sleepStart) : 'AUCUNE');
}

// ── 6 · « Je me suis rendormi » : le seuil du réveil ───────────────────────
console.log('\n6 · Se rendormir le matin — la règle du réveil d\'une heure et demie');
{
  /* Dino, le 5 août : « je me suis réveillé 30 minutes, puis j'ai redormi une
     ou deux heures — là tu le mets à la nuit, tu l'ajoutes. À partir d'un
     réveil d'une heure et demie, ce sera considéré comme une sieste et ce sera
     des sommeils complètement différents. »
     C'est LUI qui a posé le seuil. Ce bloc le vérifie des deux côtés. */
  function rendormi(reveilMin, dureeMatin) {
    const e2 = env();
    envoyer(e2, tranches(heure(J1, 2, 27), 243));            // 2h27 → 6h30
    const debut = 2 * 60 + 27 + 243 + reveilMin;
    envoyer(e2, tranches(heure(J1, Math.floor(debut / 60), debut % 60), dureeMatin));
    return { nuit: nuit(e2, K1), naps: seances(e2, K1).filter(s => s.type === 'nap') };
  }

  const court = rendormi(30, 90);
  verifie('30 min debout : le sommeil du matin REJOINT la nuit',
          court.nuit && hhmm(court.nuit.sleepEnd) === '08h30',
          court.nuit ? hhmm(court.nuit.sleepEnd) : 'AUCUNE');
  verifie('30 min debout : et aucune sieste n\'est créée',
          court.naps.length === 0, JSON.stringify(court.naps));

  const limite = rendormi(85, 90);
  verifie('1 h 25 debout : ça rejoint encore la nuit',
          limite.nuit && limite.naps.length === 0,
          limite.nuit ? hhmm(limite.nuit.sleepEnd) + ' / ' + limite.naps.length + ' sieste(s)' : 'AUCUNE');

  const longue = rendormi(100, 90);
  verifie('1 h 40 debout : la nuit S\'ARRÊTE à 6h30',
          longue.nuit && hhmm(longue.nuit.sleepEnd) === '06h30',
          longue.nuit ? hhmm(longue.nuit.sleepEnd) : 'AUCUNE');
  verifie('1 h 40 debout : et le sommeil du matin devient une SIESTE',
          longue.naps.length === 1, JSON.stringify(longue.naps));
  if (longue.naps.length === 1) {
    verifie('à 08:10, pour ses 90 vraies minutes',
            longue.naps[0].start === '08:10' && longue.naps[0].dur === 90,
            longue.naps[0].start + ' +' + longue.naps[0].dur);
  }
}

console.log(`\n${ko === 0 ? '✅' : '❌'} test-journee-dino.js : ${ok} réussis, ${ko} échoués`);
process.exit(ko === 0 ? 0 : 1);
