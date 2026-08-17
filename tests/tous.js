#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   LE BANC DU MOTEUR DE SOMMEIL — `node FLINT/web/tests/tous.js`

   POURQUOI CE DOSSIER EXISTE. Le 4 août 2026, une sieste de 1 h 21 prise après
   un VTT a mis quatre versions à s'afficher correctement. À chaque tour, une
   hypothèse plausible, un correctif, et un symptôme qui se déplaçait :

     v1165  la sieste écrasait la nuit          → on classe avant d'écrire
     v1167  la sieste n'apparaissait plus       → on la déduit de la FC (FAUX :
                                                  ça a fabriqué de fausses siestes)
     v1168  retrait de la déduction             → la vraie sieste disparaît
     v1170  elle durait 3 h 04 au lieu d'1 h 21 → le bourrage des tranches

   Ce qui a fini par trancher n'est aucun de mes raisonnements : c'est UNE
   CAPTURE D'ÉCRAN du téléphone. Chaque cas ci-dessous est un défaut réellement
   vécu, écrit pour qu'il ne puisse pas revenir en silence.

   CES TESTS NE TOUCHENT À RIEN. Ils chargent le vrai `flint-sommeil.js` dans un
   bac à sable avec un faux `localStorage`, lui envoient des tranches comme le
   bracelet le ferait, et lisent ce qui finit en base. Aucun réseau, aucun
   appareil, aucune donnée réelle. À lancer avant de toucher au sommeil.
   ═══════════════════════════════════════════════════════════════════════════ */
const { execFileSync } = require('child_process');
const path = require('path');

const BANCS = [
  ['test-sommeil.js',    'nuit vs sieste : classification, choix, fusion, resynchro'],
  ['test-bourrage.js',   'le bourrage des tranches ne rallonge plus une sieste'],
  ['test-menage.js',     'les siestes déduites de la FC sont retirées, les vraies restent'],
  ['test-menage-fc.js',  '… même quand la vraie sieste avait été taguée « fc »'],
  ['test-sieste-fc.js',  'un cœur bas seul n’invente aucun sommeil'],
  ['test-fiche-sieste.js','la fiche d’une sieste montre la sieste — jamais la nuit (15 août)'],
  ['test-reveil.js',     'rien ne finit dans le futur, et une nuit n’est pas une sieste'],
  ['test-marche-pas-sommeil.js', 'on ne marche pas en dormant — la fausse sieste du 7 août, refusée'],
  ['test-journee-dino.js','la règle de Dino, une journée entière : nuit, activité, repas, sieste, lendemain'],
  ['test-jour-logique.js','une journée va d’un sommeil au suivant — jamais de reset à minuit'],
  ['test-reparation.js', 'une base abîmée se répare seule au prochain calcul'],
  ['test-rythme.js',     'régularité, chronotype, décalage social, dette amortie'],
  ['test-besoin.js',     'Voie A : le besoin mesuré sur les nuits libres, et ses refus'],
  ['test-calibration.js','les onze coefficients d’effort et de récup ne dérivent pas'],
  ['test-marche.js',      'la marche se voit aux pieds : cadence, fusion, refus d’inventer'],
  ['test-marches-reelles.js', 'la marche, notée contre WHOOP sur sept vrais jours — 18 sorties'],
  ['test-comparaison.js', 'FLINT face à WHOOP, mesure par mesure, sur les jours relevés'],
  ['test-plafond-fc.js', 'Le plafond de FC ne mange plus la nuit'],
  ['test-nuit-recalcul.js', "Quand a-t-on le droit de reecrire une nuit deja mesuree"],
  ['test-fiche-seance.js', "La fiche d une seance n invente plus rien"],
  ['test-fiche-reelle.js', "La fiche d une seance, rejouee sur l export du telephone"],
  ['test-plage.js', "La plage habituelle : les quartiles des trente derniers jours mesures"],
  ['test-source-nuit.js', "D ou vient la nuit affichee : mesuree ou deduite"],
  ['test-stress-nuit.js', "Le stress de la nuit, decoupe par le moteur et non par l ecran"],
  ['test-ecg-trace.js', "Le trace d une mesure ECG passee, et ce qui reste quand il a ete retire"],
  ['test-visite-contexte.js', "Ce que la journee contient deja, pour la visite guidee"],
  ['test-largeur-tranche.js', "La largeur d une tranche : le minimum detruisait les journees denses"],
  ['test-fc-fiable.js', "Le cœur dit s il est fiable — la signature du capteur qui decroche"],
  ['test-fc-coherente.js', "Le maximum d une seance ne croit que les minutes coherentes — le fragment recolle du 16 aout"],
  ['test-hrfine-ordre.js', "Chaque echantillon continu a sa case de cinq secondes — l inversion intra-minute du 17 aout"],
  ['test-regularite-sommeil.js', 'La regularite mesure des horaires, pas des durees'],
  ['test-courbe-nuit.js', 'La courbe de la nuit vient de la montre, pas d une sinusoide'],
  ['test-stress-mesure.js', 'Le stress vient de la montre, pas d un generateur'],
  ['test-fc-jour.js', 'La courbe de FC du jour vient de la montre'],
  ['test-ecg.js', 'ECG : retrouver les battements, et refuser quand on ne peut pas'],
  ['test-latence.js', "La latence d endormissement traverse enfin jusqu a l ecran"],
  ['test-seances.js', 'La detection de seance, rejouee sur les vraies courbes'],
  ['test-profond.js', 'Le sommeil profond suit la puce, il ne vise plus une cible'],
  ['test-place.js', 'Le filet du stockage vise enfin ce qui pese'],
  ['test-plafond-rr.js', 'Le plafond des battements ne mange plus la nuit'],
  ['test-rmssd-nuit.js', 'Notre RMSSD, calcule sur les battements bruts'],
  ['test-semis-demo.js', 'Le semis de demo ne peut plus tourner dans l app'],
  ['test-purge-faux.js', 'La purge ne retire que le prouve fabrique, et sauvegarde les repas'],
  ['test-memoire.js',     'stockage plein : on allège le brut, jamais les nuits ni les séances'],
  ['test-repos.js',       'la fréquence de repos se mesure la nuit — zones, détection, VO2max'],
  ['test-densite-courbes.js', 'une mesure reçue est une mesure dessinée — plus de rabot à 120 points'],
  ['test-charge-nuit.js', 'la page nuit reçoit sa nuit — le catch n’avale plus la panne (6 août)'],
  ['test-courbe-seance.js', 'la courbe d’une séance a la finesse de la mesure — les intervalles, pas la minute'],
  ['test-seconde-seance.js', 'la seconde d’une séance : la seule source dense, et ses deux bornes de stockage']
];

let echecs = 0, alertes = 0;
console.log('\n═══ moteur de sommeil ═══\n');
for (const [fichier, quoi] of BANCS) {
  try {
    // v1194 — ON RELANCE LE MÊME NODE, PAS « node ».
    //
    // `execFileSync('node', …)` cherche l'exécutable dans le PATH. Or pendant
    // une compilation Xcode le PATH est quasi vide : node n'y est pas, chaque
    // banc échoue à se lancer, et les dix ressortent en ÉCHEC — alors qu'ils
    // sont verts. Le garde-fou bloquait donc la compilation en annonçant
    // « une nuit est en train d'être faussée » sans avoir joué un seul test.
    //
    // Le garde parent, lui, prend soin de chercher node à son chemin absolu.
    // `process.execPath`, c'est exactement ce node-là — celui qui est déjà en
    // train de nous exécuter.
    const out = execFileSync(process.execPath, [path.join(__dirname, fichier)], { encoding: 'utf8' });
    const m = out.match(/(\d+) réussis, (\d+) échoués/);
    const bilan = (m || [])[0] || 'ok';
    // v1230 — UN BANC PEUT SIGNALER DU ROUGE SANS FAIRE ÉCHOUER LA COMPILATION.
    //
    // `test-comparaison.js` sort volontairement en 0 : il OBSERVE deux appareils
    // au lieu de tester une régression, et bloquer sur un désaccord entre FLINT
    // et WHOOP n'aurait qu'une issue, élargir les tolérances pour faire passer
    // le rouge — c'est-à-dire faire taire la mesure pour sauver la compilation.
    // Son raisonnement est juste. Ce qui ne l'était pas, c'est que le bilan
    // final annonce « Tout est vert » avec trois lignes rouges à l'écran.
    // On distingue donc ce qui BLOQUE de ce qui ALERTE, sans confondre les deux.
    const rouges = m ? +m[2] : 0;
    if (rouges > 0) { alertes += rouges;
      console.log(`⚠️  ${fichier.padEnd(22)} ${bilan.padEnd(22)} ${quoi}`); }
    else console.log(`✅ ${fichier.padEnd(22)} ${bilan.padEnd(22)} ${quoi}`);
  } catch (e) {
    echecs++;
    console.log(`❌ ${fichier.padEnd(22)} ÉCHEC                  ${quoi}`);
    console.log((e.stdout || '').split('\n').filter(l => l.includes('❌')).join('\n'));
  }
}
console.log(echecs ? `\n${echecs} banc(s) en échec\n`
  : (alertes ? `\nAucun banc en échec, mais ${alertes} ligne(s) rouge(s) signalée(s) ci-dessus : à lire, pas à ignorer.\n`
            : '\nTout est vert.\n'));
process.exit(echecs ? 1 : 0);
