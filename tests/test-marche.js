#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   LE BANC DE LA MARCHE — détection par la cadence, pas par le cœur

   POURQUOI CE BANC EXISTE. Le 5 août 2026, deux allers-retours au restaurant.
   WHOOP les a datés à la minute — 20h18-20h42 et 21h51-22h21 — et FLINT n'a
   rien vu. Le détecteur de séances exigeait 60 % de la fréquence maximale, soit
   ~114 bpm ; une marche tranquille se passe entre 95 et 105. Elle ne franchit
   jamais la barre.

   La tentation était de baisser le seuil cardiaque. C'était le piège : à
   force de le baisser, exister debout redevient du sport — le défaut de v1061,
   où l'effort restait collé à 20 sur 20 pendant que les zones affichaient zéro.
   La marche ne se voit pas au cœur, elle se voit aux pieds.

   CES TESTS NE TOUCHENT À RIEN. Ils extraient `detectMarches` d'`index.html`,
   lui donnent des tranches de pas comme HealthKit les livre, et vérifient ce
   qui ressort. Les deux marches de Dino sont le premier cas.
   ═══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const H = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

// On extrait la fonction et ses constantes, rien d'autre : le banc ne doit pas
// dépendre du reste du moteur, sinon il devient un test d'intégration fragile.
const seuils = H.match(/var MARCHE_FORTE=[\s\S]*?MARCHE_MIN_PAS=[^;]+;/);
const source = H.match(/function trancheDuJour\(K\)\{[\s\S]*?\n  \}\n/);
/* v1416 — ON PRÉLÈVE AUSSI LE CHEMIN À LA MINUTE.
   `detectMarches` commence désormais par essayer la répartition par minute que
   la montre envoie (`arraySteps`) et ne retombe sur le découpage par blocs que
   si elle manque. Prélever la seule fonction laissait donc ses deux aides
   dehors, et le banc levait `marchesALaMinute is not defined` : il testait un
   fantôme au lieu du moteur. On part des constantes de la minute, qui ouvrent
   le bloc. */
const fonction = H.match(/var MIN_PLANCHER=[\s\S]*?\n  \}\n  window\.flDetectMarches/);
if (!seuils || !fonction || !source) {
  console.log('  ❌ detectMarches introuvable dans index.html'); process.exit(1);
}

let ok = 0, ko = 0;
function verifie(quoi, reel, attendu, tol) {
  const bon = tol == null ? reel === attendu : Math.abs(reel - attendu) <= tol;
  if (bon) { ok++; console.log(`  ✅ ${quoi}`); }
  else { ko++; console.log(`  ❌ ${quoi} — attendu ${attendu}, obtenu ${reel}`); }
}
const hm = m => `${String(Math.floor(m / 60)).padStart(2, '0')}h${String(m % 60).padStart(2, '0')}`;

/** Fabrique les tranches HealthKit d'une journée : un bruit de fond sédentaire,
 *  plus les marches demandées. `pas` = largeur de tranche en minutes. */
function journee(marches, pas = 5, fond = 6) {
  const t = [];
  // La journée court jusqu'à minuit : la marche du 6 août finit à 23h37, et un
  // générateur qui s'arrêtait à 23h la faisait disparaître — le banc accusait
  // alors le détecteur d'un défaut qui était dans le banc.
  for (let m = 8 * 60; m < 24 * 60; m += pas) {
    let n = fond;                                    // se lever, aller boire
    for (const w of marches) {
      const deb = Math.max(m, w[0]), fin = Math.min(m + pas, w[1]);
      if (fin > deb) n += Math.round((fin - deb) * (w[2] || 110));
    }
    if (n > 0) t.push([m, n]);
  }
  return t;
}

/** `capteur` : 'bracelet' fait passer les tranches par watch_<K>.actDet, avec
 *  des horodatages epoch comme le vrai canal v8actdet ; 'sante' passe par
 *  sante_<K>.pas, en minutes du cadran. Les deux chemins doivent donner le
 *  même résultat — c'est tout l'objet du repli. */
function detecter(tranches, capteur = 'sante') {
  const epoch = m => Math.floor(new Date(2026, 7, 5, 0, m, 0).getTime() / 1000);
  const bac = {
    DB: { get: (k, d) => (k.startsWith('sante_') && capteur === 'sante' ? { pas: tranches } : d) },
    watchOf: () => (capteur === 'bracelet'
      ? { actDet: tranches.map(x => [epoch(x[0]), x[1], 0]) } : null),
    flFcMax: () => null,
    Date, console
  };
  vm.createContext(bac);
  vm.runInContext(seuils[0] + '\n' + source[0] + '\n'
                  + fonction[0].replace(/\n  \}\n  window\.flDetectMarches$/, '\n}'), bac);
  return bac.detectMarches('2026-8-5');
}

/* ═══ LES SORTIES RÉELLES, REJOUÉES UNE PAR UNE ═══════════════════════════════
   Chaque cas de `cas-reels.json` est une sortie dont WHOOP donne la vérité
   terrain. Ils s'accumulent : un réglage qui améliore la sortie du jour en
   cassant celle d'il y a trois semaines se voit ici, tout de suite.
   C'est LE test qui compte. Ceux du dessous protègent le code ; celui-ci
   vérifie qu'il décrit le monde. */
const CAS = JSON.parse(fs.readFileSync(path.join(__dirname, 'cas-reels.json'), 'utf8'));
console.log('\n── LES SORTIES RÉELLES ──────────────────────────────────────');
let reels = 0, reconstruits = 0;
for (const c of CAS.cas) {
  c.reel ? reels++ : reconstruits++;
  console.log(`\n  ${c.nom}${c.reel ? '' : '   (reconstruit)'}`);
  // Un cas relevé sur l'appareil porte ses tranches ; un cas reconstruit les
  // fabrique à partir des heures WHOOP. Le banc lit les deux de la même façon.
  const tr = c.tranches
    || journee(c.whoop.map(w => [w[0], w[1], c.cadence || 110]), c.largeurCase || 5, c.fond ?? 6);
  const r = detecter(tr, c.capteur || 'sante');
  verifie(`  ${c.whoop.length} sortie(s) détectée(s)`, r.length, c.whoop.length);
  if (r.length === c.whoop.length) {
    const tol = c.tolerance ?? 1;
    r.forEach((m, i) => {
      const [d, f] = c.whoop[i];
      console.log(`       WHOOP ${hm(d)}–${hm(f)}   FLINT ${hm(m.startMin)}–${hm(m.endMin)}`
                + `   (${m.startMin - d >= 0 ? '+' : ''}${m.startMin - d} / `
                + `${m.endMin - f >= 0 ? '+' : ''}${m.endMin - f} min)`);
      verifie(`  sortie ${i + 1} : début à ±${tol} min`, m.startMin, d, tol);
      verifie(`  sortie ${i + 1} : fin à ±${tol} min`, m.endMin, f, tol);
    });
  }
}
console.log(`\n  → ${reels} sortie(s) réelle(s), ${reconstruits} reconstruite(s).`);
if (!reels) console.log('    ⚠️  aucun cas réel : le réglage tient encore sur une hypothèse.');

console.log('\n── CE QUE LE DÉTECTEUR ANNONCE ──────────────────────────────');
let r = detecter(journee([[1218, 1242]]));
verifie('sans courbe cardiaque, intensité 1 et non devinée', r[0].int, 1);
verifie('la provenance est écrite', r[0].source, 'pas');

console.log('\n── CE QU\'IL NE DOIT PAS INVENTER ────────────────────────────');
verifie('une journée sédentaire ne produit rien', detecter(journee([])).length, 0);
verifie('aucune tranche : rien, sans planter', detecter([]).length, 0);
// Un aller-retour à la cuisine : 3 minutes, 300 pas. Trop court.
verifie('3 minutes de va-et-vient ne sont pas une sortie',
        detecter(journee([[1218, 1221]])).length, 0);
// Une journée de bureau avec du va-et-vient permanent mais lent (15 pas/min).
verifie('un va-et-vient lent toute la journée n\'est pas une marche',
        detecter(journee([], 5, 75)).length, 0);

console.log('\n── LES PIÈGES DE DÉCOUPAGE ──────────────────────────────────');
// Un feu rouge au milieu : la marche ne doit pas être coupée en deux.
let coupe = journee([[1218, 1228], [1233, 1245]]);
verifie('un arrêt de 5 min ne coupe pas la sortie en deux', detecter(coupe).length, 1);
// Deux sorties vraiment séparées (1 h d'écart) restent deux.
verifie('deux sorties à une heure d\'écart restent deux',
        detecter(journee([[1218, 1242], [1320, 1350]])).length, 2);
// Les vieilles journées, enregistrées en tranches de 15 min, marchent encore.
let vieux = detecter(journee([[1215, 1245], [1305, 1340]], 15));
verifie('une journée en tranches de 15 min reste lisible', vieux.length, 2);
// L'affinage ne doit JAMAIS déborder de sa case, sinon il fabrique une mesure
// plus fine que ce que le capteur a vu.
let borne = detecter(journee([[1218, 1242]]))[0];
verifie('le début reste dans sa case', borne.startMin >= 1215 && borne.startMin <= 1220, true);
verifie('la fin reste dans sa case', borne.endMin >= 1240 && borne.endMin <= 1245, true);
// Tranches dans le désordre, comme HealthKit peut les livrer.
let melange = journee([[1218, 1242]]).slice().reverse();
verifie('des tranches en désordre sont remises en ordre', detecter(melange).length, 1);

console.log('\n── ET POUR LES GENS QUI NE MARCHENT PAS COMME DINO ──────────');
/* Les seuils ont été choisis sur les marches de Dino, qui va à 55-70 pas par
   minute. Ce banc-ci existe pour que personne ne les resserre en ne regardant
   que lui : ce sont les marcheurs LENTS qui disparaissent en premier, et ils ne
   sont pas là pour se plaindre. */
[['Dino, marche normale', 67, 25, true],
 ['Dino, marche lente', 54, 40, true],
 ['quelqu\'un de pressé', 110, 12, true],
 ['personne âgée, promenade', 48, 15, true],
 ['personne âgée, tour du pâté', 42, 12, true],
 ['parent avec poussette', 55, 14, true],
 ['va-et-vient dans un appartement', 30, 45, false],
 ['aller-retour à la cuisine', 90, 3, false]
].forEach(([qui, cad, dur, attendu]) => {
  const r = detecter(journee([[600, 600 + dur, cad]]));
  verifie(`${qui} (${cad}/min, ${dur}′) ${attendu ? 'est vue' : 'est ignorée'}`,
          r.length > 0, attendu);
});

console.log('\n── LE POIGNET PASSE DEVANT LE TÉLÉPHONE ─────────────────────');
// C'est le point qui rend FLINT autonome comme WHOOP : sans iPhone sur soi.
let bras = detecter(journee([[1218, 1242], [1311, 1341]]), 'bracelet');
verifie('les tranches du bracelet suffisent, sans Apple Santé', bras.length, 2);
if (bras.length === 2) {
  verifie('mêmes heures que par Apple Santé', bras[0].startMin, 1218, 1);
  verifie('le capteur est nommé', bras[0].capteur, 'bracelet');
}
verifie('sans bracelet, Apple Santé prend le relais',
        detecter(journee([[1218, 1242]]), 'sante')[0].capteur, 'sante');

console.log(`\n${ok} réussis, ${ko} échoués\n`);
process.exit(ko ? 1 : 0);
