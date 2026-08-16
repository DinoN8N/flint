/* ═══════════════════════════════════════════════════════════════════════════
   LE GARDE-FOU DU PONT  —  chaque appel du natif doit trouver quelqu'un.
   ═══════════════════════════════════════════════════════════════════════════

   Dino, le 5 août : « vérifie que tous les branchements backend Félix sont
   bons, vérifie que c'est plus un problème qui doit arriver, ni dans les
   prochains push, ni dans les prochains jours, ni pour aucune raison. »

   POURQUOI CE BANC EXISTE. Le natif parle au moteur en lui envoyant du
   JavaScript, TOUJOURS enveloppé dans `try{…}catch(e){}` — c'est nécessaire,
   sinon la moindre erreur du moteur ferait tomber l'écran. Mais ça a un prix :
   si la fonction appelée n'existe pas, il ne se passe RIEN. Pas d'erreur, pas
   de log, pas d'écran vide explicite. Un bouton mort, sans une trace.

   C'est exactement ce qui s'est passé le 4 août : la moitié du moteur de
   sommeil a été effacée, et l'app a continué de compiler et de s'installer
   comme si de rien n'était. Aucun outil ne posait la seule question qui
   comptait : « tout ce que le natif appelle existe-t-il encore ? »

   Elle est posée ici, à chaque compilation.

   CE QUI EST TOLÉRÉ, ET SEULEMENT ÇA : les RÉCEPTACLES — des fonctions qu'on a
   volontairement appelées avant que Félix ne les écrive, pour que le jour où
   il les pose, il n'y ait rien à brancher. Elles sont listées à la main dans
   `receptacles-attendus.txt`, avec la raison. Tout le reste est une erreur.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const path = require('path');

const RACINE = process.env.SRCROOT || path.join(__dirname, '..', '..', '..');
const DOSSIER_SWIFT = path.join(RACINE, 'FLINT');
const WEB = [path.join(RACINE, 'FLINT', 'web', 'index.html'),
             path.join(RACINE, 'FLINT', 'web', 'flint-sommeil.js')];
const RECEPTACLES = path.join(RACINE, 'FLINT', 'web', 'tests', 'receptacles-attendus.txt');

function erreur(msg) { console.log('error: ' + msg); }

/* ── 1 · ce que le natif APPELLE ─────────────────────────────────────────────
   On ne lit que les chaînes passées à `evaluateJavaScript` : c'est le seul
   endroit d'où part un appel au moteur. Une fonction Swift qui s'appellerait
   `flQuelqueChose` ne peut donc pas être prise pour un appel web. */
let fichiersSwift;
try {
  fichiersSwift = fs.readdirSync(DOSSIER_SWIFT).filter(f => f.endsWith('.swift'));
} catch (e) {
  erreur('dossier des sources introuvable : ' + DOSSIER_SWIFT);
  process.exit(1);
}
if (!fichiersSwift.length) { erreur('aucun fichier Swift trouvé — arbre incomplet.'); process.exit(1); }

const appels = new Map();          // nom → fichiers qui l'appellent
for (const f of fichiersSwift) {
  const src = fs.readFileSync(path.join(DOSSIER_SWIFT, f), 'utf8');
  const re = /evaluateJavaScript\(\s*"((?:[^"\\]|\\.)*)"/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const js = m[1];
    let n; const rf = /\b(fl[A-Z][A-Za-z0-9_]*)\s*\(/g;
    while ((n = rf.exec(js)) !== null) {
      if (!appels.has(n[1])) appels.set(n[1], new Set());
      appels.get(n[1]).add(f);
    }
  }
  /* TOUS LES BLOCS `"""…"""` SONT LUS, sans exiger qu evaluateJavaScript soit
     juste avant : le JavaScript est souvent construit dans une variable, puis
     passé au pont plus bas. Exiger la forme courte laissait passer
     `flVisiteContexte`, c est-a-dire precisement le genre d appel qu on veut
     voir. Un bloc triple-guillemets qui contient un `flQuelqueChose(` est du
     JavaScript dans ce projet — s il ne l etait pas, le pire serait un
     receptacle a declarer, pas un defaut a livrer. */
  const rm = /"""([\s\S]*?)"""/g;
  while ((m = rm.exec(src)) !== null) {
    let n; const rf2 = /\b(fl[A-Z][A-Za-z0-9_]*)\s*\(/g;
    while ((n = rf2.exec(m[1])) !== null) {
      if (!appels.has(n[1])) appels.set(n[1], new Set());
      appels.get(n[1]).add(f);
    }
  }
  /* `fonctionPour` rend le nom de la fonction à demander pour un écran : ce
     sont des appels aussi, écrits ailleurs. On les ramasse. */
  const rp = /return\s+"(fl[A-Z][A-Za-z0-9_]*)\(\)"/g;
  while ((m = rp.exec(src)) !== null) {
    if (!appels.has(m[1])) appels.set(m[1], new Set());
    appels.get(m[1]).add(f);
  }
}

/* ── 2 · ce que le web DÉFINIT ───────────────────────────────────────────── */
const definis = new Set();
for (const p of WEB) {
  let src;
  try { src = fs.readFileSync(p, 'utf8'); }
  catch (e) { erreur('fichier du moteur introuvable : ' + p + ' — il a disparu du dépôt.'); process.exit(1); }
  if (src.length < 1000) { erreur('fichier du moteur suspicieusement vide : ' + p); process.exit(1); }
  let m;
  const formes = [
    /(?:window\.)?(fl[A-Z][A-Za-z0-9_]*)\s*=\s*function/g,
    /function\s+(fl[A-Z][A-Za-z0-9_]*)\s*\(/g,
    /window\[\s*['"](fl[A-Z][A-Za-z0-9_]*)['"]\s*\]\s*=/g
  ];
  for (const re of formes) while ((m = re.exec(src)) !== null) definis.add(m[1]);
}

/* ── 3 · les réceptacles déclarés ─────────────────────────────────────────── */
const tolérés = new Set();
try {
  fs.readFileSync(RECEPTACLES, 'utf8').split('\n').forEach(l => {
    const t = l.trim();
    if (!t || t.startsWith('#')) return;
    tolérés.add(t.split(/\s+/)[0]);
  });
} catch (e) { /* pas de liste : alors rien n'est toléré, et c'est plus sûr */ }

/* ── 4 · le verdict ──────────────────────────────────────────────────────── */
const morts = [], attendus = [];
for (const [nom, fichiers] of appels) {
  if (definis.has(nom)) continue;
  (tolérés.has(nom) ? attendus : morts).push(nom + '  (appelé par ' + [...fichiers].join(', ') + ')');
}

if (attendus.length) {
  console.log('warning: ' + attendus.length + ' réceptacle(s) encore vide(s) côté moteur — l ecran restera muet tant que Felix ne les aura pas ecrits :');
  attendus.forEach(x => console.log('warning:     ' + x));
}
if (morts.length) {
  morts.forEach(x => erreur('branchement MORT : ' + x + ' — le natif l appelle, le moteur ne le definit nulle part. L appel est enveloppe dans try/catch : il echouerait EN SILENCE.'));
  erreur('le pont natif ↔ moteur est incomplet. Si c est volontaire, declare-le dans FLINT/web/tests/receptacles-attendus.txt avec sa raison.');
  process.exit(1);
}

/* ── 5 · LES CLÉS, UN ÉTAGE PLUS BAS QUE LES FONCTIONS ────────────────────────
   Dino, le 9 août : « si c'est du back-end, précise-le DANS le code, comme ça
   quand il pullera il verra direct. »

   Une fonction peut exister et rendre une charge à laquelle il manque un champ.
   Le natif décode par nom EXACT : `latence` et `latency` ne se rejoignent
   jamais, le champ reste nul, l'écran affiche un tiret, et rien ne le dit —
   c'est la panne muette du branchement mort, en plus discret encore.

   On ne devine pas les clés en lisant les structures Swift : ça produirait des
   faux positifs à la première propriété calculée. Elles sont déclarées à la
   main dans `cles-moteur-attendues.txt`, avec la charge et ce que l'écran fait
   sans elles — le même contrat que les réceptacles.

   AVERTISSEMENT, JAMAIS ERREUR : une clé qui manque est un rendez-vous, pas une
   faute de livraison. Bloquer le build d'en face pour ça serait leur faire
   payer notre attente. */
const CLES = path.join(RACINE, 'FLINT', 'web', 'tests', 'cles-moteur-attendues.txt');
let srcWeb = '';
for (const p of WEB) { try { srcWeb += fs.readFileSync(p, 'utf8'); } catch (e) { /* déjà signalé plus haut */ } }

const clesManquantes = [], clesArrivees = [];
try {
  fs.readFileSync(CLES, 'utf8').split('\n').forEach(l => {
    const t = l.trim();
    if (!t || t.startsWith('#')) return;
    const bouts = t.split(/\s{2,}|\t+/);
    const cle = bouts[0].trim(), charge = (bouts[1] || '?').trim(), effet = (bouts[2] || '').trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(cle)) return;
    /* La clé est-elle ÉCRITE quelque part dans une charge ? On cherche la forme
       `cle:` — celle d'un littéral d'objet JavaScript. `cle` seule ne suffit
       pas : le nom apparaît dans les commentaires, et un commentaire n'a jamais
       rempli un écran. */
    const emise = new RegExp('(^|[\\s{,\'"])' + cle + '[\'"]?\\s*:').test(srcWeb);
    (emise ? clesArrivees : clesManquantes).push({ cle, charge, effet });
  });
} catch (e) { /* pas de liste : rien à vérifier */ }

if (clesManquantes.length) {
  console.log('warning: ' + clesManquantes.length + ' cle(s) attendue(s) par le natif que le moteur n ecrit nulle part — l ecran reste muet, sans erreur :');
  clesManquantes.forEach(k => console.log('warning:     ' + k.cle + '  (charge ' + k.charge + ') — ' + k.effet));
}
if (clesArrivees.length) {
  clesArrivees.forEach(k => console.log('warning: la cle ' + k.cle + ' est desormais ecrite par le moteur : retire sa ligne de FLINT/web/tests/cles-moteur-attendues.txt, l ecran ne l attend plus.'));
}

console.log('note: pont natif ↔ moteur : ' + appels.size + ' appel(s) verifie(s), tous branches'
  + (attendus.length ? ' (' + attendus.length + ' receptacle(s) declare(s))' : '')
  + (clesManquantes.length ? ', ' + clesManquantes.length + ' cle(s) encore attendue(s)' : '') + '.');
process.exit(0);
