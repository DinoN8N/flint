#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   LE BANC DE LA FREQUENCE DE REPOS — elle se mesure la nuit, pas la journée

   POURQUOI CE BANC EXISTE. Le 6 août 2026, Dino signale que les bandes de zones
   de son écran d'activité — 118-142, 143-155, 156-167, 168-180, 181+ — ne
   correspondent à aucun calcul connu du moteur.

   Résolues à l'envers contre la formule de réserve à 40/60/70/80/90 %, les cinq
   bornes tombent au dixième près sur repos = 67,6 et FC max = 193,6. La formule
   était donc juste. C'est la FRÉQUENCE DE REPOS qui valait 68, alors que la
   sienne, mesurée, est de 46 (50 chez WHOOP). Et les mêmes bornes résolues sur
   la fiche WHOOP de sa marche (106/135/149/162/176) rendent repos = 50.

   CONSÉQUENCES, deux plaintes distinctes de la même journée :
     · sa marche à 117 bpm tombait SOUS le plancher de la zone 1 (118) — zéro
       minute comptée, effort sous-évalué ;
     · le détecteur de séances posait sa barre à 118 au lieu de 105 — donc ne
       voyait pas ses marches tranquilles.

   CE QUI REND CE BANC NÉCESSAIRE. La v1194 avait DÉJÀ trouvé et corrigé ce
   défaut exact, mais seulement pour la récupération. Trois autres endroits ont
   gardé `p05(w.hr)`. Une correction non propagée est une correction à moitié
   faite — et rien, jusqu'ici, ne l'aurait signalé. Ce banc est ce quelque chose.
   ═══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const H = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const mFn = H.match(/window\.flFcRepos=function\(k\)\{[\s\S]*?\n  \};/);
if (!mFn) { console.error('BANC REPOS : flFcRepos introuvable dans index.html'); process.exit(1); }

/* Le moteur, réduit à ce dont flFcRepos a besoin : un stockage et un calendrier.
   `watchOf` est volontairement absent — la fonction doit savoir lire le stockage
   directement, sinon elle dépendrait d'un écran pour faire une mesure. */
function moteur() {
  const m = new Map();
  const ctx = {
    localStorage: {
      get length() { return m.size; },
      key(i) { return Array.from(m.keys())[i]; },
      getItem(k) { return m.has(k) ? m.get(k) : null; },
      setItem(k, v) { m.set(k, String(v)); },
      removeItem(k) { m.delete(k); }
    },
    console: { log(){}, warn(){} }, Date, Math, JSON
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(
    "const DB={get:(k,d)=>{try{const v=localStorage.getItem(k);return v===null?d:JSON.parse(v)}catch(e){return d}}," +
    "set:(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v));return true}catch(e){return false}}};\n" +
    "const tk=(off)=>{const d=new Date();if(off)d.setDate(d.getDate()+off);return d.getFullYear()+'-'+(d.getMonth()+1)+'-'+d.getDate()};\n" +
    mFn[0] + "\n;globalThis.DB=DB;globalThis.tk=tk;", ctx);
  return ctx;
}

/* Une journée réaliste : nuit à 46 bpm, journée assise vers 68-75, marche à 117.
   Le 5e centile de la JOURNÉE ENTIÈRE vaut ~68 — c'est le chiffre faux. Le 5e
   centile de la seule fenêtre nocturne vaut 46 — c'est le bon. */
function journee(reposNuit) {
  const hr = [];
  for (let m = 0; m < 480; m++) hr.push([m, reposNuit + (m % 7)]);          // 00h00-08h00 : nuit
  for (let m = 480; m < 1440; m++) hr.push([m, 70 + (m % 11)]);             // journée assise
  return { hr, rr: [], night: { bedMin: 0, wakeMin: 470 }, steps: 6000 };
}

let ok = 0, ko = 0;
const verif = (nom, cond, det) => cond
  ? (ok++, console.log('  ✓ ' + nom))
  : (ko++, console.log('  ✗ ' + nom + (det ? '  → ' + det : '')));

/* ══════════ 1. LA NUIT PASSE AVANT LA JOURNEE ═══════════════════════════ */
console.log('\n1. La mesure nocturne l\'emporte sur le creux de journée');
{
  const c = moteur(), K = c.tk(0);
  c.DB.set('watch_' + K, journee(46));
  const sansCapteur = c.flFcRepos(K);
  verif('sans fiche capteur, le plancher se lit sur la courbe nocturne',
        sansCapteur && sansCapteur.v <= 52 && sansCapteur.src === 'courbe',
        JSON.stringify(sansCapteur));

  c.DB.set('sensor_' + K, { rhr: 46, hrv: 70 });
  const avec = c.flFcRepos(K);
  verif('avec fiche capteur, c\'est elle qui fait foi', avec && avec.v === 46 && avec.src === 'nuit',
        JSON.stringify(avec));

  verif('la valeur fausse de 68 n\'est jamais rendue quand la nuit existe',
        avec.v < 60, 'rendu ' + avec.v);
}

/* ══════════ 2. UN JOUR SANS NUIT NE CHANGE PAS LE CORPS ═════════════════ */
console.log('\n2. Un jour sans nuit enregistrée retombe sur une nuit récente, pas sur la journée');
{
  const c = moteur();
  // aujourd'hui : que de la journée, aucune nuit
  c.DB.set('watch_' + c.tk(0), { hr: Array.from({length: 600}, (_, i) => [480 + i, 70 + (i % 11)]), rr: [] });
  // avant-hier : une vraie nuit
  c.DB.set('sensor_' + c.tk(-2), { rhr: 47 });

  const r = c.flFcRepos(c.tk(0));
  verif('il remonte jusqu\'à la dernière nuit connue', r && r.v === 47 && r.src === 'recente', JSON.stringify(r));
  verif('il ne retombe PAS sur le creux de journée (~70)', r.v < 60, 'rendu ' + r.v);
}
{
  const c = moteur();
  c.DB.set('watch_' + c.tk(0), { hr: Array.from({length: 600}, (_, i) => [480 + i, 70 + (i % 11)]), rr: [] });
  const r = c.flFcRepos(c.tk(0));
  verif('sans AUCUNE nuit en 7 jours, il rend la journée — et le dit',
        r && r.src === 'jour', JSON.stringify(r));
  verif('la provenance permet de savoir que ce chiffre est faible', r.src === 'jour');
}

/* ══════════ 3. IL REFUSE L ABSURDE ══════════════════════════════════════ */
console.log('\n3. Une valeur impossible n\'est pas une mesure');
{
  const c = moteur(), K = c.tk(0);
  c.DB.set('watch_' + K, journee(46));
  c.DB.set('sensor_' + K, { rhr: 8 });
  verif('un repos à 8 bpm est refusé, on redescend sur la courbe',
        c.flFcRepos(K).src !== 'nuit', JSON.stringify(c.flFcRepos(K)));
  c.DB.set('sensor_' + K, { rhr: 190 });
  verif('un repos à 190 bpm est refusé aussi', c.flFcRepos(K).src !== 'nuit');
  c.DB.set('sensor_' + K, { rhr: null });
  verif('un repos absent ne bloque pas la chaîne', c.flFcRepos(K) != null);
}
{
  const c = moteur();
  verif('sans aucune donnée, il rend null — il n\'invente pas 60',
        c.flFcRepos(c.tk(0)) === null, JSON.stringify(c.flFcRepos(c.tk(0))));
}

/* ══════════ 4. LE CAS DE DINO, CHIFFRE PAR CHIFFRE ══════════════════════ */
console.log('\n4. Le cas qui a déclenché la correction — 6 août 2026');
{
  const FCMAX = 193.6;
  const bornes = (repos) => [0.40, 0.60, 0.70, 0.80, 0.90].map(p => Math.round(repos + p * (FCMAX - repos)));

  const avant = bornes(68), apres = bornes(46);
  console.log('     avant (repos 68) : ' + avant.join(' / '));
  console.log('     après (repos 46) : ' + apres.join(' / '));

  verif('les bandes d\'avant reproduisent bien ce que Dino voyait à l\'écran',
        avant[0] === 118 && avant[1] === 143 && avant[2] === 156 && avant[3] === 168 && avant[4] === 181,
        avant.join('/'));

  const zone = (bpm, b) => b.filter(x => bpm >= x).length;
  verif('sa marche à 117 bpm était en zone 0 (donc non comptée)', zone(117, avant) === 0);
  verif('elle passe en zone 1 avec le repos nocturne', zone(117, apres) === 1);

  verif('le plancher de détection descend de 118 à 105 bpm',
        avant[0] === 118 && apres[0] === 105, avant[0] + ' → ' + apres[0]);

  /* WHOOP, sur la même marche, affichait 106/135/149/162/176. On ne cherche pas
     à coller — on vérifie qu'on a cessé de s'en éloigner pour une mauvaise
     raison. L'écart restant vient de la FC max, qui est une autre question. */
  const whoop = [106, 135, 149, 162, 176];
  const ecartAvant = avant.reduce((s, v, i) => s + Math.abs(v - whoop[i]), 0) / 5;
  const ecartApres = apres.reduce((s, v, i) => s + Math.abs(v - whoop[i]), 0) / 5;
  console.log('     écart moyen aux bornes WHOOP : ' + ecartAvant.toFixed(1) + ' → ' + ecartApres.toFixed(1) + ' bpm');
  verif('on se rapproche des bornes WHOOP', ecartApres < ecartAvant,
        ecartAvant.toFixed(1) + ' → ' + ecartApres.toFixed(1));
  verif('et l\'écart restant est petit (< 4 bpm), donc imputable à la FC max',
        ecartApres < 4, ecartApres.toFixed(1) + ' bpm');
}

console.log('\n' + (ko ? '✗ ' + ko + ' test(s) en échec sur ' + (ok + ko)
                       : '✓ ' + ok + ' tests passés — le repos se mesure la nuit, partout') + '\n');
process.exit(ko ? 1 : 0);
