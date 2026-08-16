#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   LE BANC DE LA CALIBRATION — effort et récupération

   POURQUOI CE BANC EXISTE. Les onze nombres gardés ici ne sont pas des réglages :
   ce sont des mesures, tirées de 1 376 séances et 1 275 jours de bracelet réels
   (voir `PASSATION-CALIBRATION.md`). Ils ne se devinent pas, ils ne se
   « rééquilibrent pas au feeling », et surtout ils ne se retrouvent pas si on
   les perd.

   Le risque n'est pas qu'on les efface — ça se verrait. C'est qu'on en bouge un
   d'un dixième en croyant améliorer l'écran, et que le score dérive sans que
   rien ne casse. Un chiffre faux s'affiche exactement comme un chiffre juste.

   Ce banc lit `index.html` et refuse tout écart. Si tu changes volontairement un
   coefficient, il faut changer ce fichier AUSSI — et ce geste-là, contrairement
   au premier, laisse une trace dans le commit.
   ═══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');

const H = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
let ok = 0, ko = 0;
function verifie(quoi, reel, attendu, tol) {
  const bon = tol == null ? reel === attendu : Math.abs(reel - attendu) <= tol;
  if (bon) { ok++; console.log(`  ✅ ${quoi}`); }
  else { ko++; console.log(`  ❌ ${quoi} — attendu ${attendu}, obtenu ${reel}`); }
}

console.log('\n── L\'EFFORT ─────────────────────────────────────────────────');

// ── les poids par zone, tels qu'ajustés
const mZ = H.match(/var FL_POIDS_ZONE=\[([^\]]+)\],FL_EFFORT_C=([\d.]+)/);
if (!mZ) { console.log('  ❌ FL_POIDS_ZONE / FL_EFFORT_C introuvables dans index.html'); process.exit(1); }
const POIDS = mZ[1].split(',').map(Number), C = Number(mZ[2]);
const ATTENDU = [0.0305, 0.0945, 0.2515, 0.3780, 0.7709, 1.3258];
ATTENDU.forEach((v, i) => verifie(`poids de la zone ${i + 1}`, POIDS[i], v));
verifie('le coefficient de l\'échelle', C, 4.5);

// ── la progression trouvée par l'ajustement, pas imposée par nous
//    Chaque zone vaut à peu près DEUX fois celle du dessous. Bornes larges à
//    dessein : à trois personnes les rapports semblaient serrés autour de 1,8
//    (2,11 · 1,87 · 1,75 · 1,71), la quatrième les a desserrés (2,28 · 1,54 ·
//    2,01 · 1,73). Ce qui doit être gardé, c'est que ça MONTE franchement à
//    chaque zone — pas un rapport précis que les données ne soutiennent pas.
for (let i = 2; i < 6; i++) {
  const r = POIDS[i] / POIDS[i - 1];
  verifie(`zone ${i} vaut ~2× la zone ${i - 1} (${r.toFixed(2)}×)`, r > 1.4 && r < 2.8, true);
}
// LE GARDE-FOU DE LA ZONE 0. Son poids est petit À DESSEIN : c'est du temps
// passé doucement PENDANT un effort. Le monter reviendrait à transformer une
// journée assise en séance de sport — 14 h de veille à 0,05 donneraient déjà
// plus de 18 sur 20.
verifie('la zone 0 pèse peu (≤ 1/3 de la zone 1)', POIDS[0] <= POIDS[1] / 3, true);

/** `min` = [zone0, zone1 … zone5]. La zone 0 n'est comptée que DANS une
 *  activité — hors activité elle vaut 0, sinon une journée assise sortirait à
 *  14,8 sur 20 (le défaut de la v1061). */
const effort = min => {
  let s = 0; for (let i = 0; i < 6; i++) s += POIDS[i] * (min[i] || 0);
  return +(C * Math.log(1 + s)).toFixed(1);
};

// ── les repères mesurés
verifie('journée sans rien : 0', effort([0, 0, 0, 0, 0, 0]), 0);
// LE GARDE-FOU DE LA ZONE 0 : son poids est petit À DESSEIN. Le monter
// reviendrait à transformer une journée assise en séance de sport. Ce test
// n'a de sens qu'avec la garde du moteur, qui ne compte la zone 0 QUE dans
// une activité — il borne le dégât si cette garde saute.
verifie('14 h de zone 0 seule ne font pas une séance', effort([840, 0, 0, 0, 0, 0]) < 15, true);
verifie('30′ Z3 + 20′ Z4 + 5′ Z5 → 15.9'.replace('.',','), effort([0, 0, 0, 30, 20, 5]), 15.9, 0.06);

// ── le logarithme sature : c'est ce qui interdit le retour du 20/20 permanent
const h1 = effort([0, 0, 60, 0, 0, 0]), h2 = effort([0, 0, 120, 0, 0, 0]);
verifie('la 2ᵉ heure ajoute moins que la 1ʳᵉ', (h2 - h1) < h1, true);
verifie('une longue marche facile ne vaut pas un intervalle',
        effort([0, 240, 0, 0, 0, 0]) < effort([0, 0, 0, 20, 15, 8]), true);

// ── monotone : plus d'effort ne peut jamais donner moins
let mono = true, prec = -1;
for (let d = 0; d <= 180; d += 10) { const v = effort([0, 0, 0, d, 0, 0]); if (v < prec) mono = false; prec = v; }
verifie('ajouter des minutes ne fait jamais baisser le score', mono, true);

console.log('\n── LA RÉCUPÉRATION ──────────────────────────────────────────');

const mR = H.match(/const Z=([\d.]+)\+([\d.]+)\*zH-([\d.]+)\*zR\+([\d.]+)\*zS-([\d.]+)\*zP/);
if (!mR) { console.log('  ❌ la formule de récupération est introuvable ou sa forme a changé'); process.exit(1); }
const [, cste, cH, cR, cS, cP] = mR.map(Number);
verifie('la constante', cste, 0.5108);
verifie('poids de la VFC', cH, 0.6135);
verifie('poids de la FC de repos', cR, 0.0955);
verifie('poids du sommeil', cS, 0.4905);
verifie('poids de la respiration', cP, 0.0506);

// LE GARDE-FOU QUI COMPTE VRAIMENT. Avant la v1204 le sommeil pesait 0,18 —
// près de trois fois trop peu. C'est la correction la plus importante de la
// calibration, et le poids le plus stable d'une personne à l'autre. Le seuil
// est mis à la moitié de la VFC, pas à l'égalité : à quatre personnes la VFC
// (0,61) passe devant le sommeil (0,49), ce qui n'était pas le cas à trois.
// Ce qui doit être gardé, c'est que le sommeil reste un facteur LOURD.
verifie('le sommeil reste un facteur lourd', cS > cH * 0.6, true);
verifie('la respiration ne décide de rien (10× plus petite)', cP < cH / 5, true);
// La FC de repos change de SIGNE selon les gens : elle est redondante avec la
// VFC, qui capte déjà l'information. Son poids est petit parce que la mesure ne
// dit pas la même chose chez tout le monde — la remonter serait une erreur.
verifie('la FC de repos reste un poids mineur', cR < cH / 3, true);

const recup = (zH, zR, zS, zP) =>
  Math.max(1, Math.min(100, Math.round(100 / (1 + Math.exp(-(cste + cH * zH - cR * zR + cS * zS - cP * zP))))));

// Une journée parfaitement moyenne. Sans la constante elle rendait 50 %, ce qui
// partait pessimiste tous les jours : la moyenne réelle tourne vers 61 %.
verifie('journée moyenne → ~62 %', recup(0, 0, 0, 0), 62, 1);
verifie('tout au-dessus de sa normale → haute', recup(1.5, -1, 1.5, -0.5) >= 67, true);
verifie('tout en dessous → basse', recup(-1.5, 1.5, -1.5, 1) < 34, true);
verifie('le score reste dans 1–100 même à l\'extrême', recup(9, -9, 9, -9) <= 100 && recup(-9, 9, -9, 9) >= 1, true);

// Une nuit courte doit peser lourd — c'est tout l'objet de la correction.
verifie('−2 écarts-types de sommeil coûte ≥ 20 points', recup(0, 0, 0, 0) - recup(0, 0, -2, 0) >= 20, true);

console.log('\n── L\'EFFORT CONTRE DE VRAIES SÉANCES ────────────────────────');
// LE SEUL TEST QUI PROUVE QUE LA FORMULE DÉCRIT LE MONDE. Les autres vérifient
// qu'elle fait ce que je crois. Ici on part des minutes par zone que WHOOP a
// LUI-MÊME mesurées sur une activité de Dino, et on compare au score qu'il a
// affiché. Chaque séance relevée s'ajoute ici et y reste.
const CAS = JSON.parse(fs.readFileSync(path.join(__dirname, 'cas-reels.json'), 'utf8'));
const seances = CAS.cas.filter(c => c.mesureWhoop && c.mesureWhoop.effort != null);
if (!seances.length) {
  console.log('  ⚠️  aucune séance relevée : la formule n\'est validée que sur');
  console.log('     l\'ajustement d\'origine, pas sur une mesure indépendante.');
} else {
  let somme = 0;
  for (const c of seances) {
    const m = c.mesureWhoop;
    const v = effort([m.zone0Min || 0].concat(m.zonesMin));
    somme += Math.abs(v - m.effort);
    console.log(`     ${c.nom.slice(0, 46).padEnd(46)} FLINT ${v.toFixed(2)}  WHOOP ${m.effort.toFixed(1)}`
              + `  (${v - m.effort >= 0 ? '+' : ''}${(v - m.effort).toFixed(2)})`);
  }
  // LES CAS AVEUGLES COMPTENT À PART. Un cas où FLINT a annoncé son chiffre
  // AVANT de connaître celui de WHOOP teste la formule ; les autres la
  // décrivent seulement. Tant qu'il n'y en a aucun, on le dit.
  const aveugles = seances.filter(c => c.predit != null);
  if (aveugles.length) {
    const e = aveugles.reduce((a, c) => a + Math.abs(c.predit - c.mesureWhoop.effort), 0) / aveugles.length;
    console.log(`     ── ${aveugles.length} cas ANNONCÉ(S) À L'AVEUGLE, écart moyen ${e.toFixed(2)} pt`);
    verifie(`les cas aveugles tiennent (${e.toFixed(2)} pt)`, e < 0.84, true);
  } else {
    console.log('     ⚠️  aucun cas annoncé à l\'aveugle : la formule est décrite,');
    console.log('        pas testée. Voir « la règle de l\'aveugle » dans cas-reels.json.');
  }
  const moy = somme / seances.length;
  // Tolérance = l'erreur mesurée à l'ajustement, 0,96 point sur 1 376 séances.
  // La resserrer sur deux marches serait refaire l'erreur du 5 août.
  verifie(`écart moyen sur ${seances.length} séance(s) réelle(s) : ${moy.toFixed(2)} pt`, moy < 0.78, true);
}

console.log('\n── LES RÉCEPTACLES ──────────────────────────────────────────');
[['recupEntrees'], ['recupEcarts'], ['recupBase'], ['recupModele'], ['recupFiabilite'],
 ['flZonesJour'], ['flStrainBanister']].forEach(([n]) =>
  verifie(`${n} est bien posé`, H.includes(n), true));

console.log(`\n${ok} réussis, ${ko} échoués\n`);
process.exit(ko ? 1 : 0);
