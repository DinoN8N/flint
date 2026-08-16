/* ═══════════════════════════════════════════════════════════════════════════
   LE GARDE DES FICHIERS  —  un fichier inscrit au projet doit être dans le dépôt.
   ═══════════════════════════════════════════════════════════════════════════

   LE 9 AOÛT AU SOIR, ET C'EST TOUTE L'HISTOIRE DE CE FICHIER. Le commit de la
   v1320 a publié `FLINT.xcodeproj/project.pbxproj` avec `EcgView.swift` et
   `EcgData.swift` inscrits dedans — sans les deux fichiers. Sur le Mac où ils
   avaient été écrits, tout compilait ; partout ailleurs, `xcodebuild`
   s'arrêtait sur « Build input files cannot be found ». `main` est resté cassé
   trois versions durant, et deux commits ont été empilés par-dessus sans que
   personne ne s'en aperçoive.

   C'EST LE MÊME DÉFAUT QUE LE 4 AOÛT, VU DE L'AUTRE CÔTÉ. Ce jour-là un commit
   avait EFFACÉ le banc d'essai sans que rien ne proteste. Ici il en AJOUTE la
   référence sans le contenu. Dans les deux cas, la copie locale reste cohérente
   et le dépôt ne l'est plus — donc l'auteur ne peut pas le voir, et lui seul
   aurait pu.

   CE QU'IL REFUSE DE LAISSER PASSER :
     · un fichier inscrit au projet et absent du disque ;
     · un fichier inscrit au projet, présent chez toi, mais PAS suivi par git —
       le cas exact de ce soir : ça compile ici et nulle part ailleurs.

   CE QU'IL NE FAIT PAS : juger hors d'un dépôt git (copie exportée, archive).
   Là il se tait et laisse compiler — un garde-fou qui empêche de travailler
   finit désactivé, et alors il ne protège plus rien.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const RACINE = process.env.SRCROOT || path.join(__dirname, '..', '..', '..');
const PROJET = path.join(RACINE, 'FLINT.xcodeproj', 'project.pbxproj');
/* Les sources compilées, et elles seules. Les ressources (catalogues d'images,
   plists, dossiers web) sont référencées par dossier et suivies autrement ; les
   inclure ici produirait du bruit, et un garde bruyant finit ignoré. */
const EXTENSIONS = ['.swift', '.m', '.mm', '.h'];

function erreur(msg) { console.log('error: ' + msg); }

let pbx;
try { pbx = fs.readFileSync(PROJET, 'utf8'); }
catch (e) {
  console.log('warning: fichier de projet illisible (' + PROJET + ') — fichiers non verifies.');
  process.exit(0);
}

/* ── 1 · ce que le PROJET inscrit ────────────────────────────────────────────
   On lit les `path = …;` du pbxproj. Le nom seul suffit : deux sources du même
   nom dans deux dossiers différents seraient de toute façon une confusion à
   régler, pas un cas à couvrir ici. */
const inscrits = new Set();
const re = /path\s*=\s*"?([^";\n]+)"?\s*;/g;
let m;
while ((m = re.exec(pbx)) !== null) {
  const p = m[1].trim();
  if (p.includes('.framework') || p.includes('Pods/')) continue;
  if (!EXTENSIONS.includes(path.extname(p))) continue;
  inscrits.add(path.basename(p));
}
if (!inscrits.size) {
  console.log('warning: aucune source inscrite lue dans le projet — garde des fichiers sans effet.');
  process.exit(0);
}

/* ── 2 · ce qui est SUR LE DISQUE ───────────────────────────────────────────── */
const surDisque = new Set();
(function parcourir(dossier, profondeur) {
  if (profondeur > 6) return;
  let entrees;
  try { entrees = fs.readdirSync(dossier, { withFileTypes: true }); } catch (e) { return; }
  for (const e of entrees) {
    if (e.name.startsWith('.') || e.name === 'build' || e.name === 'DD') continue;
    const complet = path.join(dossier, e.name);
    if (e.isDirectory()) parcourir(complet, profondeur + 1);
    else if (EXTENSIONS.includes(path.extname(e.name))) surDisque.add(e.name);
  }
})(RACINE, 0);

/* ── 3 · ce qui est SUIVI PAR GIT ────────────────────────────────────────────
   Hors dépôt, on ne juge pas : `git ls-files` échoue, et c'est une raison
   étrangère au produit. */
let suivis = null;
try {
  const sortie = execFileSync('git', ['-C', RACINE, 'ls-files'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  suivis = new Set(sortie.split('\n').filter(Boolean).map(l => path.basename(l)));
} catch (e) {
  console.log('note: pas de depot git ici — fichiers du projet non verifies contre le depot.');
  process.exit(0);
}

/* ── 4 · le verdict ─────────────────────────────────────────────────────────── */
const absents = [], nonSuivis = [];
for (const nom of inscrits) {
  if (!surDisque.has(nom)) { absents.push(nom); continue; }
  if (!suivis.has(nom)) nonSuivis.push(nom);
}

for (const nom of absents) {
  erreur('« ' + nom +' » est inscrit au projet Xcode et n existe nulle part sur le disque. '
    + 'La compilation s arretera sur « Build input files cannot be found ». '
    + 'Restaure le fichier, ou retire sa reference du projet.');
}
for (const nom of nonSuivis) {
  erreur('« ' + nom + ' » est inscrit au projet Xcode mais n est PAS suivi par git. '
    + 'Ca compile ici et NULLE PART AILLEURS : quiconque clone le depot recevra un projet '
    + 'qui reclame un fichier absent. C est ce qui a casse main de la v1320 a la v1323. '
    + 'Fais `git add FLINT/' + nom + '` avant de commiter le fichier de projet.');
}
if (absents.length || nonSuivis.length) {
  erreur('le projet Xcode et le depot ne disent pas la meme chose — on ne livre pas ca.');
  process.exit(1);
}

console.log('note: fichiers du projet : ' + inscrits.size + ' source(s) inscrite(s), toutes presentes et suivies.');
process.exit(0);
