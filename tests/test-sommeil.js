/* Banc d'essai du moteur de sommeil : on charge le VRAI fichier, on lui envoie
   des tranches comme la montre le ferait, et on regarde ce qui finit en base. */
const fs = require('fs');
const path = require('path').join(__dirname,'..','flint-sommeil.js');

function neuf() {
  const store = {};
  const localStorage = {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; }
  };
  const win = {};
  const sandbox = {
    localStorage, window: win, document: { addEventListener() {} },
    console: { log: () => {} }, Date, JSON, Math, Array, String, Number, setTimeout, clearTimeout
  };
  const vm = require('vm');
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path, 'utf8'), sandbox);
  return { win, store, localStorage };
}

const JOUR = new Date(2026, 7, 4);            // mardi 4 août 2026
const K = `${JOUR.getFullYear()}-${JOUR.getMonth() + 1}-${JOUR.getDate()}`;
const KV = (() => { const d = new Date(JOUR); d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; })();

/* Une période de sommeil → des tranches de 4 h qui démarrent toutes les 2 h,
   exactement comme le bracelet. `stage` : 1 profond, 2 léger, 3 paradoxal. */
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
const veille = (h, m) => { const d = new Date(JOUR); d.setDate(d.getDate() - 1); d.setHours(h, m, 0, 0); return d; };

function envoyer(env, liste) { liste.forEach(t => env.win.flintSommeilTranche(t)); }
function nuitDe(env, k) { const w = JSON.parse(env.store['watch_' + k] || 'null'); return w && w.night; }
function siestesDe(env, k) { return (JSON.parse(env.store['sessions_' + k] || '[]')).filter(s => s.type === 'nap'); }
function registreDe(env, k) { return env.win.flSommeilDuJour(k); }
const hhmm = ms => { const d = new Date(ms); return String(d.getHours()).padStart(2, '0') + 'h' + String(d.getMinutes()).padStart(2, '0'); };

let ok = 0, ko = 0;
function verifie(titre, condition, detail) {
  if (condition) { ok++; console.log(`  ✅ ${titre}`); }
  else { ko++; console.log(`  ❌ ${titre}${detail ? '  → ' + detail : ''}`); }
}

// ── 1 · classification pure ────────────────────────────────────────────────
console.log('\n1 · La classification, cas par cas');
{
  const e = neuf(), C = e.win.flSommeilClasser;
  const cas = [
    ['nuit 23h00 → 07h00', veille(23, 0), 480, 'mainSleep'],
    ['nuit très tardive 02h27 → 08h40', a(2, 27), 373, 'mainSleep'],
    ['sieste 15h00 → 15h40', a(15, 0), 40, 'nap'],
    ['sieste 13h30 → 14h00', a(13, 30), 30, 'nap'],
    ['micro-sommeil 10 min', a(16, 0), 10, 'unknown'],
    ['sommeil de jour long 13h → 17h', a(13, 0), 240, 'secondarySleep'],
    ['nuit courte 01h → 03h30', a(1, 0), 150, 'mainSleep'],
    ['grasse matinée 04h → 11h', a(4, 0), 420, 'mainSleep']
  ];
  cas.forEach(([nom, d, dur, attendu]) => {
    const got = C(d.getTime(), d.getTime() + dur * 60000);
    verifie(`${nom} → ${attendu}`, got === attendu, `obtenu ${got}`);
  });
}

// ── 2 · nuit normale puis sieste l'après-midi ──────────────────────────────
console.log('\n2 · Nuit normale (23h→07h) puis sieste (15h)');
{
  const e = neuf();
  envoyer(e, tranches(veille(23, 0), 480));
  const nuitAvant = nuitDe(e, K);
  envoyer(e, tranches(a(15, 0), 40));
  const nuitApres = nuitDe(e, K);
  verifie('la nuit existe', !!nuitAvant, 'aucune nuit détectée');
  verifie('la nuit survit à la sieste (début ET fin)',
    nuitApres && nuitAvant && nuitApres.sleepStart === nuitAvant.sleepStart
      && nuitApres.sleepEnd === nuitAvant.sleepEnd,
    nuitApres ? `nuit devenue ${hhmm(nuitApres.sleepStart)}–${hhmm(nuitApres.sleepEnd)}` : 'nuit disparue');
  verifie('la sieste est ajoutée à la journée', siestesDe(e, K).length === 1,
    JSON.stringify(siestesDe(e, K)));
}

// ── 3 · LE CAS DE DINO : nuit 02h27 → 08h40, VTT, puis sieste ─────────────
console.log('\n3 · Le cas remonté : nuit 02h27→08h40 puis sieste 15h');
{
  const e = neuf();
  envoyer(e, tranches(a(2, 27), 373));
  const avant = nuitDe(e, K);
  verifie('la nuit tardive est détectée comme nuit', !!avant,
    'aucune nuit');
  if (avant) console.log(`     nuit enregistrée : ${hhmm(avant.sleepStart)} → ${hhmm(avant.sleepEnd)} (${avant.sleepMin} min)`);
  envoyer(e, tranches(a(15, 0), 40));
  const apres = nuitDe(e, K);
  verifie('la nuit est INTACTE après la sieste',
    apres && avant && apres.sleepStart === avant.sleepStart && apres.sleepMin === avant.sleepMin,
    apres ? `devenue ${hhmm(apres.sleepStart)}–${hhmm(apres.sleepEnd)} (${apres.sleepMin} min)` : 'NUIT SUPPRIMÉE');
  const s = siestesDe(e, K);
  verifie('la sieste apparaît en plus, séparément', s.length === 1 && s[0].start === '15:00',
    JSON.stringify(s));
  verifie('le registre contient les deux périodes', registreDe(e, K).length === 2,
    JSON.stringify(registreDe(e, K).map(x => `${hhmm(x.debut)}-${hhmm(x.fin)} ${x.type}`)));
}

// ── 4 · deux siestes le même jour ─────────────────────────────────────────
console.log('\n4 · Nuit puis DEUX siestes');
{
  const e = neuf();
  envoyer(e, tranches(a(2, 27), 373));
  const avant = nuitDe(e, K);
  envoyer(e, tranches(a(13, 0), 35));
  envoyer(e, tranches(a(17, 30), 25));
  const apres = nuitDe(e, K);
  verifie('la nuit est intacte (début ET fin)',
    apres && avant && apres.sleepStart === avant.sleepStart && apres.sleepEnd === avant.sleepEnd
      && apres.sleepMin === avant.sleepMin,
    apres ? `devenue ${hhmm(apres.sleepStart)}–${hhmm(apres.sleepEnd)} (${apres.sleepMin} min)` : 'supprimée');
  verifie('les deux siestes coexistent', siestesDe(e, K).length === 2,
    JSON.stringify(siestesDe(e, K).map(x => x.start + '+' + x.dur)));
}

// ── 5 · sommeil avant minuit qui finit le lendemain ───────────────────────
console.log('\n5 · Sommeil 22h30 (veille) → 06h30');
{
  const e = neuf();
  envoyer(e, tranches(veille(22, 30), 480));
  const n = nuitDe(e, K);
  verifie('rattachée au jour du RÉVEIL', !!n, 'aucune nuit sur le jour du réveil');
  verifie('rien écrit sur la veille', !nuitDe(e, KV), 'une nuit est aussi posée la veille');
  if (n) console.log(`     ${hhmm(n.sleepStart)} → ${hhmm(n.sleepEnd)}`);
}

// ── 6 · nuit fractionnée (trou de transmission au milieu) ────────────────
console.log('\n6 · Nuit fractionnée : 02h27→05h00, trou, 06h00→08h40');
{
  const e = neuf();
  envoyer(e, tranches(a(2, 27), 153));
  envoyer(e, tranches(a(6, 0), 160));
  const n = nuitDe(e, K);
  verifie('les deux morceaux forment UNE nuit', !!n, 'aucune nuit');
  if (n) {
    console.log(`     ${hhmm(n.sleepStart)} → ${hhmm(n.sleepEnd)} (${n.sleepMin} min dormies)`);
    verifie('la fenêtre couvre les deux morceaux',
      new Date(n.sleepStart).getHours() === 2 && new Date(n.sleepEnd).getHours() >= 8,
      `${hhmm(n.sleepStart)}–${hhmm(n.sleepEnd)}`);
  }
  verifie('aucune sieste fabriquée par le trou', siestesDe(e, K).length === 0,
    JSON.stringify(siestesDe(e, K)));
}

// ── 7 · resynchronisation : les mêmes tranches renvoyées ─────────────────
console.log('\n7 · Resynchronisation (mêmes tranches renvoyées deux fois)');
{
  const e = neuf();
  const nuit = tranches(a(2, 27), 373), sieste = tranches(a(15, 0), 40);
  envoyer(e, nuit); envoyer(e, sieste);
  const n1 = nuitDe(e, K), s1 = siestesDe(e, K).length, r1 = registreDe(e, K).length;
  envoyer(e, nuit); envoyer(e, sieste);   // resynchro
  const n2 = nuitDe(e, K);
  verifie('la nuit ne bouge pas', n1 && n2 && n1.sleepStart === n2.sleepStart && n1.sleepMin === n2.sleepMin);
  verifie('aucune sieste dupliquée', siestesDe(e, K).length === s1, `${s1} → ${siestesDe(e, K).length}`);
  verifie('aucune entrée dupliquée au registre', registreDe(e, K).length === r1,
    `${r1} → ${registreDe(e, K).length}`);
}

// ── 8 · la montre a oublié le début (mémoire circulaire) ────────────────
console.log('\n8 · Relecture tardive : la montre ne rend plus que la fin');
{
  const e = neuf();
  envoyer(e, tranches(a(2, 27), 373));
  const complet = nuitDe(e, K);
  const e2 = neuf();
  envoyer(e2, tranches(a(2, 27), 373));
  envoyer(e2, tranches(a(6, 30), 130));   // seulement la fin, plus tard
  const apres = nuitDe(e2, K);
  verifie('la mesure complète est conservée',
    apres && complet && apres.sleepMin >= complet.sleepMin,
    apres && complet ? `${complet.sleepMin} → ${apres.sleepMin} min` : 'nuit perdue');
}

// ── 9 · suppression manuelle d'une sieste ───────────────────────────────
console.log('\n9 · Suppression d\'une sieste : la nuit ne bouge pas');
{
  const e = neuf();
  envoyer(e, tranches(a(2, 27), 373));
  envoyer(e, tranches(a(15, 0), 40));
  const avant = nuitDe(e, K);
  const ss = JSON.parse(e.store['sessions_' + K]);
  e.store['sessions_' + K] = JSON.stringify(ss.filter(x => x.type !== 'nap'));
  const apres = nuitDe(e, K);
  verifie('la nuit est identique', apres && avant && apres.sleepStart === avant.sleepStart && apres.sleepMin === avant.sleepMin);
  verifie('la sieste est bien partie', siestesDe(e, K).length === 0);
}

console.log(`\n──────────────\n${ok} réussis, ${ko} échoués\n`);
process.exit(ko ? 1 : 0);
