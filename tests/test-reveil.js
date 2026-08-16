/* Banc d'essai : LE RÉVEIL DE 6 H 37.
   ═══════════════════════════════════════════════════════════════════════════
   Dino, mercredi 5 août, 6 h 37, au réveil : « il a détecté une sieste de 4h59
   à 7h01. 7h01, c'est pas passé, il est actuellement 6h37. Et quand bien même,
   je me suis couché avant 4h59. »

   Deux défauts distincts vivent dans cette phrase, et aucun banc ne les
   attrapait :

     1. UNE MESURE QUI FINIT DANS LE FUTUR. Rien, nulle part, ne comparait la
        fin d'une période à l'heure qu'il est. Une tranche mal datée par la
        montre — ou lue pendant qu'elle écrit encore — pose une fin qui n'a pas
        eu lieu. On ne peut pas mesurer demain.

     2. DEUX HEURES DE SOMMEIL EN PLEINE NUIT AFFICHÉES « SIESTE ». Une période
        entièrement nocturne mais trop courte pour être la nuit (moins de
        2 h 30) tombe en `secondarySleep` — ce qui est honnête, on ne tranche
        pas. Mais tout ce qui n'est pas la nuit était ensuite posé dans la
        journée sous la forme d'une sieste. Dormir de 5 h à 7 h n'est pas une
        sieste, et le dire est une donnée fausse, pas une approximation.
   ═══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path').join(__dirname, '..', 'flint-sommeil.js');

/* L'heure est FIXÉE : ce banc parle d'un réveil précis, il ne peut pas dépendre
   de l'heure à laquelle on le lance. `Date` est remplacé par une version dont
   `now()` rend toujours 6 h 37, le reste inchangé. */
const MAINTENANT = new Date(2026, 7, 5, 6, 37, 0, 0);   // mercredi 5 août, 6h37

function neuf() {
  const store = {};
  const localStorage = {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; }
  };
  class DateFigee extends Date {
    constructor(...a) { if (a.length === 0) super(MAINTENANT.getTime()); else super(...a); }
    static now() { return MAINTENANT.getTime(); }
  }
  const win = {};
  const sandbox = {
    localStorage, window: win, document: { addEventListener() {} },
    console: { log: () => {} },
    Date: DateFigee, JSON, Math, Array, String, Number, setTimeout, clearTimeout
  };
  const vm = require('vm');
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path, 'utf8'), sandbox);
  return { win, store };
}

const JOUR = new Date(2026, 7, 5);                       // mercredi 5 août
const K = `${JOUR.getFullYear()}-${JOUR.getMonth() + 1}-${JOUR.getDate()}`;

function tranches(dateDebut, dureeMin) {
  const t0 = Math.floor(dateDebut.getTime() / 1000);
  const out = [];
  for (let off = 0; off < dureeMin; off += 120) {
    const n = Math.min(240, dureeMin - off);
    if (n <= 0) break;
    const stages = [];
    for (let i = 0; i < n; i++) stages.push(i % 7 === 0 ? 1 : (i % 5 === 0 ? 3 : 2));
    out.push({ start: t0 + off * 60, unit: 1, stages, activity: [] });
  }
  return out;
}
const a = (h, m) => { const d = new Date(JOUR); d.setHours(h, m, 0, 0); return d; };
const envoyer = (env, l) => l.forEach(t => env.win.flintSommeilTranche(t));
const siestes = (env, k) => (JSON.parse(env.store['sessions_' + k] || '[]')).filter(s => s.type === 'nap');
const registre = (env, k) => env.win.flSommeilDuJour(k);
const hhmm = ms => { const d = new Date(ms); return String(d.getHours()).padStart(2, '0') + 'h' + String(d.getMinutes()).padStart(2, '0'); };

let ok = 0, ko = 0;
function verifie(titre, condition, detail) {
  if (condition) { ok++; console.log(`  ✅ ${titre}`); }
  else { ko++; console.log(`  ❌ ${titre}${detail ? '  → ' + detail : ''}`); }
}

// ── 1 · rien ne peut finir après maintenant ────────────────────────────────
console.log('\n1 · Une mesure ne vient jamais du futur');
{
  // La montre annonce 4h59 → 7h01. Il est 6h37 : les 24 dernières minutes
  // n'ont pas eu lieu.
  const env = neuf();
  envoyer(env, tranches(a(4, 59), 122));

  const reg = registre(env, K) || [];
  const futur = reg.filter(s => s.fin > MAINTENANT.getTime());
  verifie('aucune période enregistrée ne finit après 6h37',
          futur.length === 0,
          futur.map(s => hhmm(s.debut) + '→' + hhmm(s.fin)).join(', '));

  const nap = siestes(env, K);
  const napFutur = nap.filter(s => {
    const p = String(s.start).split(':');
    return (+p[0]) * 60 + (+p[1]) + (s.dur || 0) > 6 * 60 + 37;
  });
  verifie('aucune entrée de la journée ne finit après 6h37',
          napFutur.length === 0,
          nap.map(s => s.start + '+' + s.dur).join(', '));
}

// ── 2 · dormir de 5 h à 7 h n'est pas une sieste ───────────────────────────
console.log('\n2 · Deux heures en pleine nuit ne sont pas une sieste');
{
  // Même période, mais entièrement passée : il est 6h37, on prend 3h00 → 5h02.
  const env = neuf();
  envoyer(env, tranches(a(3, 0), 122));

  const nap = siestes(env, K);
  verifie('la période nocturne n\'apparaît pas comme une sieste',
          nap.length === 0,
          nap.map(s => s.start + '+' + s.dur + 'min').join(', '));

  const reg = registre(env, K) || [];
  verifie('elle est tout de même CONSERVÉE dans le registre (rien ne se perd)',
          reg.length >= 1,
          reg.length + ' période(s)');
  if (reg.length) {
    verifie('et elle porte son vrai type, « secondarySleep »',
            reg.some(s => s.type === 'secondarySleep'),
            reg.map(s => s.type).join(', '));
  }
}

// ── 3 · une vraie sieste de l'après-midi reste une sieste ──────────────────
console.log('\n3 · Ce qui est vraiment une sieste ne bouge pas');
{
  // Hier après-midi, pour être sûr que tout est dans le passé.
  const HIER = new Date(2026, 7, 4);
  const KH = `${HIER.getFullYear()}-${HIER.getMonth() + 1}-${HIER.getDate()}`;
  const h = (hh, mm) => { const d = new Date(HIER); d.setHours(hh, mm, 0, 0); return d; };
  const env = neuf();
  envoyer(env, tranches(h(14, 30), 81));

  const nap = siestes(env, KH);
  verifie('la sieste de 14h30 est bien posée dans la journée',
          nap.length === 1 && nap[0].start === '14:30',
          nap.map(s => s.start + '+' + s.dur).join(', ') || 'aucune');
  if (nap.length === 1) {
    verifie('et elle dure 81 min, pas la tranche entière',
            nap[0].dur === 81, nap[0].dur + ' min');
  }
}

// ── 4 · la fausse sieste DÉJÀ écrite est retirée ──────────────────────────
console.log('\n4 · Ce qui est déjà en base est nettoyé, pas seulement empêché');
{
  const env = neuf();
  // On simule la base telle qu'elle est ce matin sur le téléphone de Dino :
  // une « sieste » automatique de 4h59, 122 min, qui finit à 7h01.
  env.store['sessions_' + K] = JSON.stringify([
    { type: 'nap', name: 'Sieste', icon: '😴', start: '04:59', dur: 122, auto: true, src: 'ble' },
    { type: 'nap', name: 'Sieste', icon: '😴', start: '04:59', dur: 122 }   // saisie à la main
  ]);
  // Une tranche quelconque déclenche le recalcul, donc le ménage.
  envoyer(env, tranches(a(3, 0), 30));

  const nap = siestes(env, K);
  verifie('la fausse sieste automatique a disparu',
          !nap.some(s => s.auto), JSON.stringify(nap));
  verifie('celle saisie à la main est intacte',
          nap.some(s => !s.auto && s.start === '04:59'), JSON.stringify(nap));
}

console.log(`\n${ko === 0 ? '✅' : '❌'} test-reveil.js : ${ok} réussis, ${ko} échoués`);
process.exit(ko === 0 ? 0 : 1);
