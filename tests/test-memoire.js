#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   LE BANC DE LA MEMOIRE — ce qui survit quand le stockage est plein

   POURQUOI CE BANC EXISTE. Le 6 août 2026, Dino : « même le stockage il
   fonctionne pas. Quand je switch sur les jours anciens, je vois pas mes
   anciennes nuits ou mes anciennes activités. WHOOP, je vois tout. Genre il y a
   une vraie mémoire. Là il y en a pas du tout. »

   La cause n'était pas dans les écrans. `DB.set` s'écrivait sans try/catch :

       set:(k,v)=>localStorage.setItem(k,JSON.stringify(v))

   Le stockage local d'un WKWebView est plafonné (~5 Mo). Une journée de capteur,
   aux plafonds de `wSaveK`, pèse 81 Ko. Soixante-trois jours et c'est plein. Une
   seule photo de repas, ~70 Ko, coûte presque une journée entière. Passé le
   plafond, `setItem` lève — et sans filet l'exception remontait, interrompant la
   fonction appelante au milieu. Rien ne s'enregistrait, et l'écran en cours de
   calcul s'arrêtait net. Sans un message.

   CE QUE CE BANC VERIFIE. Il monte un faux `localStorage` avec un VRAI plafond,
   le remplit jusqu'à refus, et contrôle trois choses, dans cet ordre
   d'importance :

     1. Écrire ne casse plus jamais l'appelant.
     2. Quand c'est plein, on fait de la place et l'écriture passe.
     3. On ne sacrifie que du brut. Les nuits, les séances et les pas des jours
        anciens sont TOUJOURS là après le ménage.

   Le point 3 est le seul qui compte vraiment pour Dino. Une éviction qui
   libérerait de la place en jetant une nuit de mars serait pire que la panne
   qu'elle répare : la panne, elle, ne perdait que ce qui n'était pas encore
   écrit. Une mauvaise éviction détruit ce qui l'était.
   ═══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const H = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

/* On extrait exactement les quatre morceaux concernés — pas le moteur entier :
   ce banc doit tomber quand LA MEMOIRE change, pas quand un écran bouge. */
const mDB   = H.match(/const DB=\{\n[\s\S]*?\n\};/);
const mTk   = H.match(/const tk=\(off\)=>\{[^\n]*\};/);
const mPlace= H.match(/window\.flFaireDeLaPlace=function\(\)\{[\s\S]*?\n\};/);
const mDiag = H.match(/window\.flDiagStockage=function\(\)\{[\s\S]*?\n\};/);

if (!mDB || !mTk || !mPlace || !mDiag) {
  console.error('BANC MEMOIRE : morceau introuvable dans index.html —',
    {DB:!!mDB, tk:!!mTk, place:!!mPlace, diag:!!mDiag});
  process.exit(1);
}

/* ─── un faux localStorage, avec un vrai plafond ─────────────────────────── */
function fauxStockage(quotaKo) {
  const m = new Map();
  const quota = quotaKo * 1024;
  const poids = () => { let n = 0; for (const [k, v] of m) n += k.length + v.length; return n; };
  return {
    get length() { return m.size; },
    key(i) { return Array.from(m.keys())[i]; },
    getItem(k) { return m.has(k) ? m.get(k) : null; },
    removeItem(k) { m.delete(k); },
    setItem(k, v) {
      const av = m.has(k) ? m.get(k).length : 0;
      if (poids() - av + v.length > quota) {
        const e = new Error('QuotaExceededError');
        e.name = 'QuotaExceededError';
        throw e;
      }
      m.set(k, String(v));
    },
    _poidsKo() { return Math.round(poids() / 1024); }
  };
}

function moteur(quotaKo) {
  const ls = fauxStockage(quotaKo);
  const ctx = { localStorage: ls, console: { log(){}, warn(){}, error(){} }, Date, Math, JSON };
  ctx.window = ctx;
  vm.createContext(ctx);
  /* `const DB` et `const tk` sont des liaisons lexicales : dans un vm elles
     n'atterrissent pas sur l'objet de contexte. On les y pose nous-mêmes —
     c'est un détail de banc, la page réelle les voit par portée de script. */
  vm.runInContext(mTk[0] + '\n' + mDB[0] + '\n' + mPlace[0] + '\n' + mDiag[0] +
                  '\n;globalThis.DB=DB;globalThis.tk=tk;', ctx);
  return { ctx, ls };
}

/* une journée de capteur au format réel, aux plafonds de wSaveK */
function journee(graine, avecNuit) {
  const hr = [], rr = [];
  let x = graine;
  const r = () => (x = (x * 1103515245 + 12345) % 2147483648) / 2147483648;
  for (let i = 0; i < 4000; i++) hr.push([Math.round(i * 0.36 * 10) / 10, 55 + Math.round(r() * 90)]);
  for (let i = 0; i < 3000; i++) rr.push([Math.round(i * 0.48 * 10) / 10, 700 + Math.round(r() * 400)]);
  const j = { hr, rr, steps: 8000 + graine, kcal: 2100, dist: 6400, batt: 80 };
  if (avecNuit) j.night = { K: 'jour', bed: 1380, wake: 470, deep: 92, rem: 108, light: 210 };
  return j;
}

let ok = 0, ko = 0;
function verif(nom, condition, detail) {
  if (condition) { ok++; console.log('  ✓ ' + nom); }
  else { ko++; console.log('  ✗ ' + nom + (detail ? '  → ' + detail : '')); }
}

/* ══════════ 1. ECRIRE NE CASSE PLUS L APPELANT ══════════════════════════ */
console.log('\n1. Une écriture refusée ne doit pas interrompre ce qui tourne');
{
  const { ctx } = moteur(50);
  let creve = false, suite = false;
  try {
    // la forme réelle : un calcul écrit son cache, puis continue son travail
    ctx.DB.set('gros_' + ctx.tk(0), journee(1, false));
    suite = true;
  } catch (e) { creve = true; }
  verif('aucune exception ne remonte', !creve);
  verif('la fonction appelante va jusqu\'au bout', suite);

  const r = ctx.DB.set('encore', journee(2, false));
  verif('un refus se signale par false, pas par un plantage', r === false, 'rendu ' + r);
  verif('les refus sont comptés (flDiagStockage.refusDEcriture)',
        ctx.flDiagStockage().refusDEcriture >= 1, JSON.stringify(ctx.flDiagStockage().refusDEcriture));
}

/* ══════════ 2. PLEIN → ON FAIT DE LA PLACE, PUIS ÇA PASSE ═══════════════ */
console.log('\n2. Quand c\'est plein, la place se libère et l\'écriture aboutit');
{
  const { ctx, ls } = moteur(900);
  let ecrits = 0;
  for (let i = 0; i < 60; i++) if (ctx.DB.set('watch_' + ctx.tk(-i), journee(i + 1, i % 3 === 0))) ecrits++;
  console.log('     ' + ecrits + ' jours écrits, ' + ls._poidsKo() + ' Ko occupés');
  verif('le stockage s\'est bien rempli jusqu\'au refus', ecrits > 5 && ecrits < 60, ecrits + ' jours');

  // aujourd'hui doit TOUJOURS pouvoir s'écrire : c'est la donnée vivante
  const avant = ctx.flDiagStockage().refusDEcriture;
  const passe = ctx.DB.set('watch_' + ctx.tk(0), journee(99, true));
  verif('la journée en cours s\'enregistre malgré le stockage plein', passe === true,
        'refus avant=' + avant + ' après=' + ctx.flDiagStockage().refusDEcriture);
  verif('flFaireDeLaPlace a bien rendu de la place', ctx.flFaireDeLaPlace() !== undefined);
}

/* ══════════ 3. ON NE SACRIFIE QUE DU BRUT ═══════════════════════════════ */
console.log('\n3. Le ménage n\'a pas le droit de toucher aux nuits, séances et pas');
{
  const { ctx } = moteur(4000);

  // 90 jours : une nuit tous les 3 jours, des séances tous les 2
  const attendu = {};
  for (let i = 0; i < 90; i++) {
    const K = ctx.tk(-i);
    ctx.DB.set('watch_' + K, journee(i + 1, i % 3 === 0));
    if (i % 2 === 0) ctx.DB.set('sessions_' + K, [{ real: true, auto: true, startMin: 700 + i, dur: 25, type: 'walk' }]);
    attendu[K] = { nuit: i % 3 === 0, seance: i % 2 === 0, pas: 8000 + i + 1 };
  }
  // des photos de repas, le poids mort qui doit partir en premier
  for (let i = 1; i < 40; i++)
    ctx.DB.set('meals_' + ctx.tk(-i), [{ nom: 'Poulet riz', kcal: 620, photo: 'x'.repeat(70000) }]);

  const avant = ctx.flDiagStockage().totalKo;
  ctx.flFaireDeLaPlace();
  ctx.flFaireDeLaPlace();
  const apres = ctx.flDiagStockage().totalKo;
  console.log('     ' + avant + ' Ko → ' + apres + ' Ko après ménage');
  verif('le ménage libère effectivement de la place', apres < avant, avant + ' → ' + apres);

  let nuitsPerdues = [], seancesPerdues = [], pasPerdus = [], clesPerdues = [];
  Object.keys(attendu).forEach(K => {
    const w = ctx.DB.get('watch_' + K, null);
    if (!w) { clesPerdues.push(K); return; }
    if (attendu[K].nuit && !w.night) nuitsPerdues.push(K);
    if (w.steps !== attendu[K].pas) pasPerdus.push(K);
    if (attendu[K].seance) {
      const ss = ctx.DB.get('sessions_' + K, null);
      if (!ss || !ss.length) seancesPerdues.push(K);
    }
  });
  verif('aucune journée entière effacée', clesPerdues.length === 0, clesPerdues.slice(0, 4).join(', '));
  verif('AUCUNE nuit perdue (30 nuits sur 90 jours)', nuitsPerdues.length === 0, nuitsPerdues.slice(0, 4).join(', '));
  verif('AUCUNE séance perdue (45 séances)', seancesPerdues.length === 0, seancesPerdues.slice(0, 4).join(', '));
  verif('aucun compteur de pas altéré', pasPerdus.length === 0, pasPerdus.slice(0, 4).join(', '));

  // le brut, lui, a le droit de maigrir — et seulement au-delà des seuils
  const recent = ctx.DB.get('watch_' + ctx.tk(-5), null);
  verif('les 21 derniers jours gardent leurs intervalles RR', recent && recent.rr && recent.rr.length > 0,
        recent ? 'rr=' + (recent.rr || []).length : 'absent');
  const vieux = ctx.DB.get('watch_' + ctx.tk(-40), null);
  verif('au-delà de 21 jours, les RR sont bien lâchés', vieux && (!vieux.rr || vieux.rr.length === 0),
        vieux ? 'rr=' + (vieux.rr || []).length : 'absent');
  const tresVieux = ctx.DB.get('watch_' + ctx.tk(-70), null);
  verif('au-delà de 45 jours, la courbe est éclaircie mais présente',
        tresVieux && tresVieux.hr && tresVieux.hr.length > 20 && tresVieux.hr.length < 4000,
        tresVieux ? tresVieux.hr.length + ' points' : 'absent');

  /* L éclaircissement garde le min ET le max de chaque tranche : la pointe d une
     séance ancienne ne doit pas disparaître du graphique. C est ce qui distingue
     « alléger » de « fausser ». */
  if (tresVieux && tresVieux.hr) {
    const origine = journee(71, false).hr;
    const pic = Math.max.apply(null, origine.map(p => p[1]));
    const creux = Math.min.apply(null, origine.map(p => p[1]));
    const picGarde = Math.max.apply(null, tresVieux.hr.map(p => p[1]));
    const creuxGarde = Math.min.apply(null, tresVieux.hr.map(p => p[1]));
    verif('la pointe cardiaque survit à l\'éclaircissement', picGarde === pic, picGarde + ' vs ' + pic);
    verif('le creux cardiaque survit aussi', creuxGarde === creux, creuxGarde + ' vs ' + creux);
    let croissant = true;
    for (let i = 1; i < tresVieux.hr.length; i++) if (tresVieux.hr[i][0] < tresVieux.hr[i - 1][0]) croissant = false;
    verif('la courbe éclaircie reste dans l\'ordre du temps', croissant);
  }

  // les photos, elles, doivent avoir sauté — mais pas les repas
  const repas = ctx.DB.get('meals_' + ctx.tk(-10), null);
  verif('les photos de repas anciens sont libérées', repas && repas[0] && !repas[0].photo);
  verif('le repas lui-même (nom, calories) est intact',
        repas && repas[0] && repas[0].kcal === 620 && repas[0].nom === 'Poulet riz');
}

/* ══════════ 4. LE RECEPTACLE ════════════════════════════════════════════ */
console.log('\n4. Le réceptacle de valeur : voir l\'état de la mémoire');
{
  const { ctx } = moteur(2000);
  for (let i = 0; i < 12; i++) ctx.DB.set('watch_' + ctx.tk(-i), journee(i + 1, true));
  const d = ctx.flDiagStockage();
  verif('flDiagStockage rend un poids total', typeof d.totalKo === 'number' && d.totalKo > 0, d.totalKo + ' Ko');
  verif('il rend le compte des refus d\'écriture', typeof d.refusDEcriture === 'number');
  verif('il regroupe les clefs par famille, pas jour par jour',
        d.parClef.some(x => x.clef === 'watch_<jour>'), JSON.stringify(d.parClef.slice(0, 3)));
  verif('les familles sont triées du plus lourd au plus léger',
        d.parClef.every((x, i) => i === 0 || d.parClef[i - 1].ko >= x.ko));
}

console.log('\n' + (ko ? '✗ ' + ko + ' test(s) en échec sur ' + (ok + ko)
                       : '✓ ' + ok + ' tests passés — la mémoire tient quand le disque est plein') + '\n');
process.exit(ko ? 1 : 0);
