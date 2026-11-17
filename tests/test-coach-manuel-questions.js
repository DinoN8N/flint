#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   LES 20 QUESTIONS D'UN NOUVEL UTILISATEUR — 17 nov. 2026

   L'app a beaucoup changé en trois jours (v3104 → v3107). Pour chaque question
   qu'un nouvel utilisateur poserait sur ces nouveautés, ce banc vérifie que le
   PRÉFIXE du prompt (ce que Gemini et Claude lisent avant toute question)
   porte le passage qui permet d'y répondre : les mots-clés attendus, dans UNE
   même ligne du manuel (une réponse qui demande de recoller trois paragraphes
   est une réponse que le modèle rate).

   Ce que ce banc NE prouve PAS : que le modèle répondra bien. Il prouve que la
   réponse est écrite là où il lit. Aucun appel à un modèle, aucune clé.

   Et dans l'autre sens (section 2) : ce que l'app a RETIRÉ ne doit plus être
   présenté comme présent (l'ECG, le journal du soir, l'onglet « Courses »,
   la cloche…).
   ═══════════════════════════════════════════════════════════════════════════ */
const { prefixeStatique } = require('../api/_coach-prompt');
const M = require('../api/_coach-manuel');

let ok = 0, ko = 0;
const verifie = (t, c, d) => { c ? (ok++, console.log(`  ✅ ${t}`))
                                : (ko++, console.log(`  ❌ ${t}${d ? '  → ' + d : ''}`)); };

// Le manuel commun aux deux modes, découpé en lignes : une ligne = un passage.
const LIGNES = (M.MANUEL + '\n' + M.ECRANS).split('\n');
const passage = (motifs) => LIGNES.find((l) => motifs.every((m) => m.test(l)));

// [question, motifs qui doivent tous être dans UNE ligne du manuel]
const QUESTIONS = [
  ['Comment je vois mes records ?',
    [/Activités/, /« Mes records »/, /podium/, /depuis toujours ou par année/]],
  ['C\'est quoi la médaille d\'argent sur ma course ?',
    [/or \/ argent \/ bronze/, /2 sorties pour l'or, 3 l'argent, 4 le bronze/]],
  ['Mon 10,4 km compte pour le record du 10 km ?',
    [/meilleur segment CONTINU d'une distance dans une sortie GPS/, /temps ÉCOULÉ \(pauses comprises\)/]],
  ['Quelles distances ont un record ?',
    [/Course 1, 3, 5, 7, 10, 15 km, semi, 30 km, marathon/, /vélo 10, 20, 40, 100 km/, /sans chrono/]],
  ['J\'ai un temps faux à cause du GPS, je l\'enlève comment ?',
    [/appui long sur la carte/, /« Retirer de mes records »/, /« Remettre dans mes records »/]],
  ['C\'est quoi ce chrono contre mon record sur ma boucle ? Je le coupe comment ?',
    [/FANTÔME, EN TEST/, /boucle déjà courue/, /« Fantôme » le coupe/, /« Que fais-tu aujourd'hui \? »/]],
  ['Comment je filtre mes séances par mois ?',
    [/« Mes activités »/, /filtres par sport et par période/, /« Ce mois »/]],
  ['Comment je regarde le film de ma sortie ?',
    [/« Survoler »/, /toucher = pause/, /glisser = avancer/]],
  ['Mon foot n\'a pas de chrono ni de record de distance, c\'est normal ?',
    [/Sans tracé : « Plus longue séance », « Plus gros effort », dès 3 séances du même sport/]],
  ['Comment je supprime un repas ?',
    [/Un repas : appui long \(« Modifier », « Supprimer »\)/, /glisser vers la gauche/, /« … »/]],
  ['Je mange au resto, FLINT peut m\'aider à choisir ?',
    [/carte de restaurant/, /« Ta carte »/, /deux plats/]],
  ['Comment je demande au coach ce que veut dire un chiffre ?',
    [/garder le doigt dessus une demi-seconde/]],
  ['Ma séance n\'apparaît pas sur l\'écran verrouillé.',
    [/Écran verrouillé/, /Réglages › FLINT › Activités en direct/]],
  ['Comment je compte mes séries en muscu ?',
    [/« Suivre un exercice »/, /« Série finie » lance le repos/]],
  ['Ce bracelet n\'est pas le mien, je fais quoi ?',
    [/« Ce n'est pas le mien »/, /« Connecté\. »/]],
  ['Pourquoi je n\'ai pas encore de score de récup ? C\'est quoi les nuits de base ?',
    [/Premier score \(« NUITS DE BASE », n \/ 4\)/, /la nuit du jour mesurée/, /3 nuits d'avant de 4 h ou plus avec VFC/, /3 jours d'avant avec une FC de repos, sans durée minimale/]],
  ['Pourquoi ma VFC n\'apparaît pas cette nuit ?',
    [/VFC ABSENTE/, /« pas de variabilité »/, /6 minutes/, /moins de 50 % au pouls/, /« sans VFC »/]],
  ['Si je supprime l\'app, je perds tout ?',
    [/vivent sur CET iPhone/, /« Exporter mes données »/, /« Restaurer une sauvegarde »/]],
  ['Le mode sport s\'est allumé tout seul sur mon bracelet, pourquoi ?',
    [/Mode sport automatique/, /repos \+ 50 % de la réserve 5 min/, /ne crée aucune séance/]],
  ['FLINT a trouvé une « Activité » toute seule : pourquoi elle n\'a pas de nom ni de distance ?',
    [/trouvée SEULE/, /AUTO/, /le sport n'est jamais deviné/, /ni tracé, ni distance/]]
];

console.log('\n1 · Chaque question nouvelle a son passage, dans le préfixe des DEUX modes');
const PREFIXES = { v1: prefixeStatique('v1'), v2: prefixeStatique('v2'), 'v1 Claude': prefixeStatique('v1', { v3: true }), 'v2 Claude': prefixeStatique('v2', { v3: true }) };
verifie(`${QUESTIONS.length} questions`, QUESTIONS.length === 20);
for (const [q, motifs] of QUESTIONS) {
  const l = passage(motifs);
  const manquants = l ? [] : motifs.filter((m) => !LIGNES.some((x) => m.test(x))).map(String);
  verifie(`« ${q} »`, !!l, l ? '' : (manquants.length ? 'absent du manuel : ' + manquants.join(' ') : 'les mots sont là, mais pas dans une même ligne'));
  if (l) {
    const horsPrefixe = Object.entries(PREFIXES).filter(([, p]) => !p.includes(l)).map(([k]) => k);
    verifie('  … et ce passage part dans les quatre préfixes (Gemini v1/v2, Claude v1/v2)', horsPrefixe.length === 0, horsPrefixe.join(', '));
    console.log('     │ ' + l.trim().slice(0, 220) + (l.trim().length > 220 ? '…' : ''));
  }
}

console.log('\n2 · Ce que l\'app a retiré n\'est plus présenté comme présent');
const COMMUN = M.MANUEL + '\n' + M.ECRANS + '\n' + M.LIRE_V2;
const RETIRES = [
  ['l\'onglet « Courses » (c\'est « Activités » depuis le 15 nov.)', /Courses \(|onglets : Aujourd'hui, Nutrition, Courses/i],
  ['l\'ECG (retiré le 15 nov.)', /mène à ECG|V8 \(avec ECG\)|ECG,/],
  ['remplir le journal du soir (retiré le 15 nov.)', /remplir le journal du soir|Journal du soir : avant 18:00/],
  ['la cloche du bandeau (retirée)', /cloche → notifications/],
  ['« Toutes tes mesures » et « Ce qui compose le score » (plus à l\'accueil)', /Toutes tes mesures|Ce qui compose le score/],
  ['« Profil → Mon bracelet » (c\'est Paramètres → Mon bracelet)', /Profil → Mon bracelet/],
  ['la génération 21 de la récup', /RECOV_ALGO_GEN 21\b/],
  ['« records = dès 2 sorties » (l\'or demande 2 sorties, l\'argent 3, le bronze 4)', /records = meilleur segment continu, dès 2 sorties/],
  ['les stades « de la puce » (FLINT les lit au pouls)', /Stades de la puce/],
  // 17 nov. 2026 — phrase FAUSSE, retirée de l'app (flint-ios 3926b614) : la récup prend une nuit courte au pouls de repos.
  ['« une nuit de moins de 4 h ne compte pas »', /nuit de moins de 4 h ne compte pas/]
];
for (const [nom, re] of RETIRES) verifie(`plus de trace : ${nom}`, !re.test(COMMUN), (COMMUN.match(re) || [''])[0]);
verifie('le journal du soir est dit retiré, pas à remplir', /journal du soir est retiré de l'app/.test(M.MANUEL));
verifie('l\'ECG est dit absent', /Pas d'ECG/.test(M.MANUEL));

console.log(`\n${ko === 0 ? '✅' : '❌'} test-coach-manuel-questions.js : ${ok} réussis, ${ko} échoués\n`);
process.exitCode = ko ? 1 : 0;
