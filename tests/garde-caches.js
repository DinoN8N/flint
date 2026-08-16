#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   LE GARDE DES ÉCRANS QUI ATTENDENT LE MOTEUR
   ═══════════════════════════════════════════════════════════════════════════

   POURQUOI CE GARDE EXISTE. Dino, le 13 août 2026, après le cinquième écran
   corrigé pour la même raison : « je veux plus jamais que ça arrive ».

   Le défaut est toujours le même, et il s'est produit au moins six fois :

     v1386  la page Effort attendait le moteur          → CacheEffort
     v1448  la page Calories attendait le moteur        → CacheCalories
     v1452  Récup, Ma nuit et Cœur attendaient          → CacheRecup/Sommeil/Cardio
     v1454  la LISTE DES ACTIVITÉS attendait le moteur  → CacheCatalogue

   À chaque fois : un écran natif dont la charge vient du moteur web, ouvert
   avant que le pont soit monté (1,17 s au mieux, davantage sur un téléphone),
   donc vide — avec une phrase d'attente à la place du contenu. À chaque fois
   Dino l'a signalé, et à chaque fois il a fallu le corriger à la main.

   LA RÈGLE, ET ELLE EST MÉCANIQUE. Toute charge d'écran portée par le pont
   (`ShellBridge`) doit naître de l'une de ces deux façons :

     var truc: TrucData = CacheTruc.lire…() ?? .vide      ← elle naît pleine
     var truc: TrucData = .vide                           ← elle attendra

   La seconde forme n'est pas interdite — certaines charges NE PEUVENT PAS être
   mises en cache, et c'est écrit plus bas avec la raison. Mais elle doit être
   DÉCLARÉE. Une charge qui apparaît sans cache et sans déclaration fait échouer
   la compilation : c'est le seul moment où quelqu'un est encore en train d'y
   penser.

   CE QUE CE GARDE NE FAIT PAS. Il ne vérifie pas que le cache est CORRECT — les
   trois règles qui le rendent honnête (aujourd'hui seulement, jamais vide,
   jamais après minuit) se lisent dans `CacheEffort`, qui est le modèle. Il
   vérifie qu'on a répondu à la question, pas qu'on y a bien répondu. Comme
   `garde-pont` demande « la fonction existe-t-elle ? » sans juger ce qu'elle
   calcule.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const path = require('path');

const RACINE = process.env.SRCROOT || path.join(__dirname, '..', '..', '..');
const PONT = path.join(RACINE, 'FLINT', 'ContentView.swift');

/* ─── LES CHARGES QUI N'AURONT JAMAIS DE CACHE, ET POURQUOI ─────────────────
   Chaque ligne est une décision, pas une dispense. Pour en ajouter une, il faut
   pouvoir écrire la raison — si on n'y arrive pas, c'est que l'écran mérite son
   cache. */
const SANS_CACHE_ET_C_EST_JUSTE = {
  // ── Ce qu'on ouvre en tapant sur UN élément précis ──
  // On ne peut pas préparer d'avance le repas, la séance ou la sortie sur
  // lesquels l'utilisateur va taper. Resservir le PRÉCÉDENT afficherait le
  // contenu d'un autre élément que celui qu'il vient de désigner : ce serait
  // pire qu'une attente, ce serait un mensonge.
  activite: "détail d'un élément désigné au doigt : rien à préparer d'avance",
  repas:    "détail d'un élément désigné au doigt : rien à préparer d'avance",
  sortie:   "détail d'un élément désigné au doigt : rien à préparer d'avance",
  ecg:      "mesure prise à l'instant ; son état de repos est déjà son état plein",

  // ── Ce qui dépend d'une FENÊTRE et pas d'un jour ──
  // Les trois règles du cache reposent sur « c'est bien aujourd'hui ». Une
  // charge qui dépend aussi d'une métrique et d'une période n'a pas de clé de
  // jour : on ne saurait pas ce qu'on ressert. Noté dès la v1386.
  // v1471 — CETTE LIGNE ETAIT TROP LARGE, ET ELLE A COUTE CHER. Il est vrai que
  // les trois regles journalieres ne s'appliquent pas a une charge qui depend
  // d'une metrique ET d'une fenetre. Il etait FAUX d'en conclure qu'elle ne
  // pouvait pas etre gardee : `CacheHebdo` la garde sous SA propre clef
  // (metrique|mode|recul), et le premier graphique d'une session s'ouvre
  // desormais sans attendre le moteur. Ce qui reste vrai ici : la charge
  // AFFICHEE (`hebdo`) depend du graphique qu'on vient de designer du doigt, on
  // ne peut donc pas la preparer d'avance — c'est le cache qui la sert.
  hebdo:        "la charge affichée dépend du graphique désigné au doigt ; ses pages sont gardées par CacheHebdo",
  tendances:    "dépend de la métrique ET de la période, pas d'un jour",
  recordsProfil:"dépend de la période choisie (30 / 90 jours / tout)",
  recapProfil:  "dépend de la période choisie (30 / 90 jours / tout)",
};

/* ─── LA DETTE, DÉCLARÉE ET VISIBLE À CHAQUE COMPILATION ────────────────────
   Ces écrans-là DEVRAIENT avoir leur cache : leur charge est bien celle d'un
   jour, ou d'un état qui ne bouge pas. Ils ne l'ont pas encore. On ne fait pas
   échouer la compilation pour une dette héritée — mais on la répète à voix
   haute, à chaque build, pour qu'elle ne s'oublie pas.
   Retirer une ligne d'ici = poser le cache. Pas l'inverse. */
const DETTE = {
  // VIDE, et c'est le but. Le 13 août 2026, les trois derniers écrans qui
  // attendaient encore le moteur ont reçu leur cache (v1455) : nutrition,
  // profil, mesures. Toute ligne ajoutée ici doit être une dette QU'ON COMPTE
  // PAYER — pas une façon de faire taire le garde.
};

function lire(p) {
  try { return fs.readFileSync(p, 'utf8'); }
  catch (e) { console.log('error: ' + p + ' est illisible : ' + e.message); process.exit(1); }
}

const src = lire(PONT);

/* Les charges d'écran du pont : `var nom: XxxData = …`, une par ligne.
   On ne retient que les types de CHARGE (suffixés Data, ou les trois nommés
   autrement pour des raisons historiques) — pas les drapeaux ni les compteurs. */
const LIGNE = /^\s{4}var ([a-zA-Z][a-zA-Z0-9]*): ([A-Za-z][A-Za-z0-9]*(?:Data|Activites|Profil))\s*=\s*(.+)$/gm;

const charges = [];
let m;
while ((m = LIGNE.exec(src)) !== null) {
  charges.push({ nom: m[1], type: m[2], depart: m[3].trim() });
}

if (charges.length < 10) {
  console.log('error: le garde des caches n a trouve que ' + charges.length
    + ' charge(s) d ecran dans ContentView.swift — la forme des declarations a du'
    + ' changer. Corrige le motif du garde plutot que de le laisser aveugle.');
  process.exit(1);
}

const pleines = [], attendent = [], dette = [], nues = [];
for (const c of charges) {
  if (/Cache[A-Za-z]+\.\w+\(/.test(c.depart)) { pleines.push(c); continue; }
  if (Object.prototype.hasOwnProperty.call(SANS_CACHE_ET_C_EST_JUSTE, c.nom)) { attendent.push(c); continue; }
  if (Object.prototype.hasOwnProperty.call(DETTE, c.nom)) { dette.push(c); continue; }
  nues.push(c);
}

console.log('note: caches d ecran — ' + pleines.length + ' charge(s) naissent pleines, '
  + attendent.length + ' ne peuvent pas l etre (declarees), '
  + dette.length + ' en dette.');

for (const c of dette) {
  console.log('warning: l ecran « ' + c.nom + ' » attend encore le moteur pour s afficher — '
    + DETTE[c.nom] + '. Poser son cache sur le modele de CacheEffort.');
}

if (nues.length) {
  for (const c of nues) {
    console.log('error: la charge « ' + c.nom + ' » (' + c.type + ') n a pas de cache disque'
      + ' et n est declaree nulle part : l ecran attendra le moteur, et il le dira a Dino.');
  }
  console.log('error: pose son cache (modele : CacheEffort, FLINT/EffortData.swift, lu a la');
  console.log('error: creation du pont), ou inscris-la dans garde-caches.js avec la RAISON');
  console.log('error: pour laquelle elle ne peut pas en avoir. Les deux reponses sont');
  console.log('error: acceptables ; ne pas repondre ne l est pas.');
  process.exit(1);
}

process.exit(0);
