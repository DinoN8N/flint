#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   FLINT FACE À WHOOP — le banc qui garde toutes les comparaisons

   Dino porte les deux bracelets, un à chaque poignet. Chaque journée qu'il
   relève devient une ligne de `comparaison.json`, et ce banc la rejoue à chaque
   compilation.

   CE QU'IL PROTÈGE. Un écart mesuré une fois ne dit rien ; le même écart sur
   vingt jours dit quelque chose. Et surtout : un réglage qui rapproche FLINT de
   WHOOP sur la journée d'aujourd'hui en l'éloignant sur celle d'il y a trois
   semaines se voit ici, tout de suite. C'est la leçon du 5 août 2026 — trois
   réglages calés trop vite le même jour, deux démentis dans l'heure.

   IL NE REJOUE PAS LE MOTEUR. Il compare ce que FLINT a produit à ce que WHOOP
   a produit. Pour rejouer un calcul depuis les données brutes, voir
   `test-marche.js` et son `cas-reels.json`.
   ═══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');

const C = JSON.parse(fs.readFileSync(path.join(__dirname, 'comparaison.json'), 'utf8'));
const M = C.mesures, JOURS = C.jours || [];

let ok = 0, ko = 0;
const hm = m => `${String(Math.floor(((m % 1440) + 1440) % 1440 / 60)).padStart(2, '0')}h`
              + `${String(((m % 1440) + 1440) % 1440 % 60).padStart(2, '0')}`;

/** Un écart d'heure se lit sur un cadran : entre 23h55 et 00h05 il y a dix
 *  minutes, pas mille quatre cent trente. Sans ça, un coucher juste avant
 *  minuit ferait échouer le banc à chaque fois. */
function ecart(cle, a, b) {
  let d = a - b;
  if (M[cle] && M[cle].heure) { d = ((d % 1440) + 2160) % 1440 - 720; }
  return d;
}

console.log('\n═══ FLINT face à WHOOP ═══\n');

if (!JOURS.length) {
  console.log('  Aucune journée relevée pour l\'instant.');
  console.log('  → dans la console du moteur : flDiagJour()  puis les mêmes');
  console.log('    chiffres côté WHOOP, dans comparaison.json.\n');
  console.log('  Le banc passe, mais il ne garantit RIEN tant qu\'il est vide.\n');
  console.log('0 réussis, 0 échoués\n');
  process.exit(0);
}

console.log(`  ${JOURS.length} journée(s) relevée(s) : `
          + JOURS.map(j => j.jour).join(', ') + '\n');
console.log(`  ${'mesure'.padEnd(20)} ${'jours'.padStart(5)} ${'écart moyen'.padStart(12)}`
          + ` ${'pire jour'.padStart(22)}`);
console.log('  ' + '─'.repeat(62));

const jamais = [];
for (const cle of Object.keys(M)) {
  const m = M[cle];
  const paires = JOURS
    .filter(j => j.flint && j.whoop && j.flint[cle] != null && j.whoop[cle] != null)
    .map(j => ({ jour: j.jour, f: j.flint[cle], w: j.whoop[cle], d: ecart(cle, j.flint[cle], j.whoop[cle]) }));

  if (!paires.length) { jamais.push(m.nom); continue; }

  const moy = paires.reduce((a, p) => a + Math.abs(p.d), 0) / paires.length;
  const pire = paires.reduce((a, p) => (Math.abs(p.d) > Math.abs(a.d) ? p : a));
  const fmt = v => (m.heure ? hm(v) : (Math.round(v * 10) / 10) + m.unite);
  const seuil = m.tolerancePct != null
    ? paires.reduce((a, p) => a + Math.abs(p.w), 0) / paires.length * m.tolerancePct / 100
    : m.tolerance;

  const ligne = `  ${m.nom.padEnd(20)} ${String(paires.length).padStart(5)}`
    + ` ${((Math.round(moy * 10) / 10) + m.unite).padStart(12)}`
    + ` ${(pire.jour + ' : ' + fmt(pire.f) + ' / ' + fmt(pire.w)).padStart(22)}`;

  if (moy <= seuil) { ok++; console.log('✅' + ligne); }
  else {
    ko++;
    console.log('❌' + ligne);
    console.log(`     → écart moyen ${Math.round(moy * 10) / 10}${m.unite}, `
              + `tolérance ${Math.round(seuil * 10) / 10}${m.unite}`);
  }
}

if (jamais.length) {
  console.log('\n  ⚠️  jamais comparé : ' + jamais.join(', '));
  console.log('     Une tolérance qu\'on n\'a jamais testée n\'est pas une');
  console.log('     garantie, c\'est un souhait.');
}

console.log(`\n${ok} réussis, ${ko} échoués\n`);

/* CE BANC N ARRÊTE JAMAIS UNE COMPILATION, ET C EST VOULU.
   Les autres vérifient que le CODE fait ce qu'on croit : les faire échouer doit
   bloquer la livraison. Celui-ci mesure un écart avec un AUTRE APPAREIL. Un
   capteur qui lit différemment n'est pas une régression — c'est une information,
   et parfois c'est WHOOP qui a tort.
   Le bloquer reviendrait à ne plus pouvoir livrer tant que deux bracelets ne
   sont pas d'accord, ce qui n'arrivera jamais. Pire : la seule issue serait
   d'élargir les tolérances pour faire passer le rouge, c'est-à-dire de faire
   taire la mesure pour sauver la compilation. On rend donc 0 — les lignes
   rouges ci-dessus restent affichées, et c'est leur seul travail. */
process.exit(0);
