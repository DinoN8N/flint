/* ═══════════════════════════════════════════════════════════════════════════
   LE GARDE-FOU DE LA PORTÉE  —  une fonction de pont ne lit rien qui n'existe.
   ═══════════════════════════════════════════════════════════════════════════

   POURQUOI CE BANC EXISTE, ET LE JOUR EXACT.

   Le 6 août 2026 (v1242), on ajoute au moteur la possibilité de calculer un
   AUTRE jour que celui affiché, pour que le changement de date soit instantané.
   Deux fonctions reçoivent la même ligne :

       var _off=(_argJour==null)?Math.min(0,(window.flDayOff|0)):…

   `flAccueilData` reçoit AUSSI son paramètre — `function(_argJour)`.
   `flSommeilData` ne le reçoit pas : elle reste `function()`.

   Lire une variable jamais déclarée LÈVE (`ReferenceError`), et cette ligne est
   la PREMIÈRE du corps. Le `try{…}catch(e){return {aDesDonnees:false};}` qui
   entoure la fonction — et qui est là pour de bonnes raisons — attrapait donc
   la panne et rendait poliment « pas de données ». Résultat : du 6 au 8 août,
   la page « Ma nuit » s'ouvrait vide À TOUS LES COUPS, sans une trace nulle
   part, et ça ressemblait à une fonctionnalité pas encore branchée.

   Dino, le 8 août : « est-ce que c'est parce qu'il n'y a pas de données […]
   ou est-ce que c'est un bug ? » — c'est précisément la question qu'un écran
   vide poli rend impossible à trancher. Ce banc la tranche à la compilation.

   CE QU'IL NE REMPLACE PAS. `garde-pont.js` vérifie que la fonction appelée
   EXISTE ; celui-ci vérifie qu'elle peut S'EXÉCUTER. Le 4 août avait donné le
   premier, le 6 août donne le second — deux moitiés de la même question.

   CE QU'IL VOIT, ET CE QU'IL NE VOIT PAS. Il connaît trois choses : les
   paramètres de la fonction, ses déclarations à elle, et tout ce que le fichier
   déclare quelque part (`var`, `let`, `const`, `function`, `window.X=`). Il
   ignore volontairement les paramètres des AUTRES fonctions — c'est exactement
   ce qui laisse voir `_argJour`, déclaré comme paramètre de `flAccueilData` et
   nulle part ailleurs. En échange, une variable déclarée dans une fonction sans
   rapport le rassure à tort : c'est un garde-fou, pas un compilateur.

   Pas de dépendance, pas de parseur à installer : le projet compile sur une
   machine nue, et un banc qu'on ne peut pas jouer ne protège personne.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const path = require('path');

/* Sans argument, on inspecte les deux fichiers du moteur — c'est la forme
   appelée par `garde-build.sh`. Avec un argument, on inspecte ce fichier-là. */
if (process.argv.length < 3) {
  const RACINE = process.env.SRCROOT || path.join(__dirname, '..', '..', '..');
  const cibles = [path.join(RACINE, 'FLINT', 'web', 'index.html'),
                  path.join(RACINE, 'FLINT', 'web', 'flint-sommeil.js')];
  const { execFileSync } = require('child_process');
  let fautes = 0;
  for (const c of cibles) {
    if (!fs.existsSync(c)) { console.log('error: fichier du moteur introuvable : ' + c); process.exit(1); }
    const sortie = execFileSync(process.execPath, [__filename, c], { encoding: 'utf8' });
    process.stdout.write(sortie.replace(/^(?!note:|error:|warning:)/gm, ''));
    if (/JAMAIS DÉCLARÉ|→/.test(sortie)) fautes++;
  }
  process.exit(fautes ? 1 : 0);
}

const brut = fs.readFileSync(process.argv[2], 'utf8');
/* On n'analyse que le JavaScript : les accolades du CSS fausseraient toute la
   profondeur, et une règle `.x{…}` passerait pour une portée. */
const src = /\.html?$/.test(process.argv[2])
  /* `src=` ne se cherche que dans la BALISE : le tester sur la capture entière
     jetait tout bloc contenant un `img.src=`, soit la moitié du moteur. */
  ? [...brut.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
      .filter(m => !/\bsrc\s*=/.test(m[1]))
      .map(m => m[2]).join('\n;\n')
  : brut;

/* ── 1 · découper le fichier en jetons, en jetant commentaires et chaînes ──── */
function jetons(code) {
  const out = [];
  let i = 0, n = code.length;
  let prevSignificatif = null;   // pour distinguer division et regex
  while (i < n) {
    const c = code[i];
    // commentaires
    if (c === '/' && code[i + 1] === '/') { while (i < n && code[i] !== '\n') i++; continue; }
    if (c === '/' && code[i + 1] === '*') { i += 2; while (i < n && !(code[i] === '*' && code[i + 1] === '/')) i++; i += 2; continue; }
    // chaînes
    if (c === '"' || c === "'") {
      const q = c; i++;
      while (i < n && code[i] !== q) { if (code[i] === '\\') i++; i++; }
      i++; out.push({ t: 'str' }); prevSignificatif = 'str'; continue;
    }
    if (c === '`') {
      i++;
      while (i < n && code[i] !== '`') {
        if (code[i] === '\\') { i += 2; continue; }
        if (code[i] === '$' && code[i + 1] === '{') {
          // on récupère l'intérieur pour ne pas rater une lecture
          let prof = 1; i += 2; const d = i;
          while (i < n && prof > 0) { if (code[i] === '{') prof++; else if (code[i] === '}') prof--; if (prof) i++; }
          out.push(...jetons(code.slice(d, i)));
          i++; continue;
        }
        i++;
      }
      i++; out.push({ t: 'str' }); prevSignificatif = 'str'; continue;
    }
    // regex littérale
    if (c === '/' && (prevSignificatif === null || /^(op|kw|\(|\[|,|;|\{|\})$/.test(prevSignificatif))) {
      i++; let cls = false;
      while (i < n) {
        if (code[i] === '\\') { i += 2; continue; }
        if (code[i] === '[') cls = true;
        else if (code[i] === ']') cls = false;
        else if (code[i] === '/' && !cls) break;
        i++;
      }
      i++; while (i < n && /[a-z]/.test(code[i])) i++;
      out.push({ t: 'regex' }); prevSignificatif = 'regex'; continue;
    }
    // identifiants / mots-clés
    if (/[A-Za-z_$]/.test(c)) {
      let d = i; while (i < n && /[A-Za-z0-9_$]/.test(code[i])) i++;
      const nom = code.slice(d, i);
      out.push({ t: 'id', v: nom }); prevSignificatif = MOTS_CLES.has(nom) ? 'kw' : 'id'; continue;
    }
    // nombres
    if (/[0-9]/.test(c)) { while (i < n && /[0-9a-fA-FxX._]/.test(code[i])) i++; out.push({ t: 'num' }); prevSignificatif = 'num'; continue; }
    if (/\s/.test(c)) { i++; continue; }
    out.push({ t: 'p', v: c });
    prevSignificatif = /[)\]]/.test(c) ? 'id' : (/[([,;{}]/.test(c) ? c : 'op');
    i++;
  }
  return out;
}

const MOTS_CLES = new Set(('var let const function return if else for while do switch case break continue ' +
  'new delete typeof instanceof in of this null true false undefined throw try catch finally void ' +
  'class extends super yield await async static get set default export import').split(' '));

const t = jetons(src);

/* ── 2 · les globales du fichier : tout ce qui est déclaré à la profondeur 0 ── */
function profondeurs(jt) {
  const prof = new Array(jt.length); let p = 0;
  for (let i = 0; i < jt.length; i++) {
    if (jt[i].t === 'p' && jt[i].v === '}') p--;
    prof[i] = p;
    if (jt[i].t === 'p' && jt[i].v === '{') p++;
  }
  return prof;
}
const prof = profondeurs(t);

const globales = new Set();
for (let i = 0; i < t.length; i++) {
  const j = t[i];
  if (j.t !== 'id') continue;
  // window.X = …  /  window['X'] = …
  if (j.v === 'window' && t[i + 1] && t[i + 1].v === '.' && t[i + 2] && t[i + 2].t === 'id') globales.add(t[i + 2].v);
  // déclarations de profondeur 0
  if ((j.v === 'var' || j.v === 'let' || j.v === 'const' || j.v === 'function')) {
    let k = i + 1;
    while (k < t.length && t[k].t === 'id' && MOTS_CLES.has(t[k].v)) k++;
    if (t[k] && t[k].t === 'id') globales.add(t[k].v);
    // var a=1,b=2 → on ramasse la suite après les virgules de même niveau
    if (j.v !== 'function') {
      let d = 0;
      for (let q = i + 1; q < t.length; q++) {
        const x = t[q];
        if (x.t === 'p' && '([{'.includes(x.v)) d++;
        else if (x.t === 'p' && ')]}'.includes(x.v)) { if (d === 0) break; d--; }
        else if (x.t === 'p' && x.v === ';' && d === 0) break;
        else if (x.t === 'p' && x.v === ',' && d === 0 && t[q + 1] && t[q + 1].t === 'id') globales.add(t[q + 1].v);
      }
    }
  }
  // function X( à n'importe quelle profondeur → hissée dans sa portée ; on est large
  if (j.v === 'function' && t[i + 1] && t[i + 1].t === 'id') globales.add(t[i + 1].v);
}

const BUILTINS = new Set(('window document console Math JSON Date Array Object String Number Boolean ' +
  'RegExp Error TypeError RangeError ReferenceError Map Set WeakMap WeakSet Promise Symbol Proxy Reflect ' +
  'parseInt parseFloat isNaN isFinite encodeURIComponent decodeURIComponent encodeURI decodeURI ' +
  'setTimeout clearTimeout setInterval clearInterval requestAnimationFrame cancelAnimationFrame ' +
  'localStorage sessionStorage navigator location history screen alert confirm prompt fetch ' +
  'Infinity NaN undefined globalThis Intl Uint8Array Int8Array Float32Array Float64Array ArrayBuffer ' +
  'DataView TextEncoder TextDecoder URL URLSearchParams Blob FileReader Image Audio CustomEvent Event ' +
  'MutationObserver IntersectionObserver ResizeObserver getComputedStyle matchMedia crypto performance ' +
  'File MouseEvent KeyboardEvent TouchEvent FileList FormData Headers Request Response HTMLElement Node NodeList SVGElement CSS AbortController structuredClone queueMicrotask btoa atob ' +
  'arguments eval Function webkit').split(' ').filter(Boolean));

/* ── 3 · pour chaque fonction de pont, la portée locale ────────────────────── */
const rapports = [];
let nbPonts = 0;
for (let i = 0; i < t.length; i++) {
  if (!(t[i].t === 'id' && t[i].v === 'window' && t[i + 1] && t[i + 1].v === '.' &&
        t[i + 2] && t[i + 2].t === 'id' && /^fl[A-Z]/.test(t[i + 2].v) &&
        t[i + 3] && t[i + 3].v === '=' && t[i + 4] && t[i + 4].v === 'function')) continue;
  const nom = t[i + 2].v;
  nbPonts++;
  // paramètres
  let k = i + 5;
  if (!(t[k] && t[k].v === '(')) continue;
  const params = new Set();
  let d = 1; k++;
  while (k < t.length && d > 0) {
    if (t[k].t === 'p' && t[k].v === '(') d++;
    else if (t[k].t === 'p' && t[k].v === ')') { d--; if (!d) break; }
    else if (t[k].t === 'id' && !MOTS_CLES.has(t[k].v)) params.add(t[k].v);
    k++;
  }
  // corps
  while (k < t.length && !(t[k].t === 'p' && t[k].v === '{')) k++;
  const debut = k; d = 0;
  do {
    if (t[k].t === 'p' && t[k].v === '{') d++;
    else if (t[k].t === 'p' && t[k].v === '}') d--;
    k++;
  } while (k < t.length && d > 0);
  const corps = t.slice(debut, k);

  // déclarations locales, toutes profondeurs confondues (on est volontairement large)
  const locales = new Set(params);
  for (let q = 0; q < corps.length; q++) {
    const x = corps[q];
    if (x.t !== 'id') continue;
    if (x.v === 'var' || x.v === 'let' || x.v === 'const') {
      let dd = 0;
      for (let r = q + 1; r < corps.length; r++) {
        const y = corps[r];
        if (y.t === 'p' && '([{'.includes(y.v)) dd++;
        else if (y.t === 'p' && ')]}'.includes(y.v)) { if (dd === 0) break; dd--; }
        else if (y.t === 'p' && (y.v === ';') && dd === 0) break;
        /* On ne s'arrête PAS sur un mot-clé : `var pe=null,ps=null` en contient
           un entre les deux noms, et couper là faisait passer `ps` pour une
           lecture sauvage. Seuls le `;` et la fin de bloc terminent. */
        else if (y.t === 'id' && dd === 0 && !MOTS_CLES.has(y.v) &&
                 (r === q + 1 || (corps[r - 1].t === 'p' && corps[r - 1].v === ','))) locales.add(y.v);
      }
    }
    if (x.v === 'function' && corps[q + 1] && corps[q + 1].t === 'id') locales.add(corps[q + 1].v);
    if (x.v === 'catch' && corps[q + 2] && corps[q + 2].t === 'id') locales.add(corps[q + 2].v);
    // params des fonctions internes
    if (x.v === 'function') {
      let r = q + 1; if (corps[r] && corps[r].t === 'id') r++;
      if (corps[r] && corps[r].v === '(') {
        let dd = 1; r++;
        while (r < corps.length && dd > 0) {
          if (corps[r].t === 'p' && corps[r].v === '(') dd++;
          else if (corps[r].t === 'p' && corps[r].v === ')') { dd--; if (!dd) break; }
          else if (corps[r].t === 'id') locales.add(corps[r].v);
          r++;
        }
      }
    }
    // flèches : (a,b)=>  et  a=>
    if (x.t === 'p') { /* rien */ }
  }
  // flèches
  for (let q = 0; q < corps.length; q++) {
    if (corps[q].t === 'p' && corps[q].v === '=' && corps[q + 1] && corps[q + 1].v === '>') {
      // remonter : soit un identifiant, soit une liste (...)
      let r = q - 1;
      if (corps[r] && corps[r].t === 'id') locales.add(corps[r].v);
      else if (corps[r] && corps[r].v === ')') {
        let dd = 1; r--;
        while (r >= 0 && dd > 0) {
          if (corps[r].v === ')') dd++;
          else if (corps[r].v === '(') { dd--; if (!dd) break; }
          else if (corps[r].t === 'id') locales.add(corps[r].v);
          r--;
        }
      }
    }
  }

  // lectures : identifiant non précédé d'un point, non suivi de ':' dans un littéral objet
  const inconnues = new Map();
  for (let q = 0; q < corps.length; q++) {
    const x = corps[q];
    if (x.t !== 'id' || MOTS_CLES.has(x.v)) continue;
    const av = corps[q - 1];
    if (av && av.t === 'p' && av.v === '.') continue;            // propriété
    if (av && av.t === 'id' && (av.v === 'function' || av.v === 'var' || av.v === 'let' || av.v === 'const' || av.v === 'catch')) continue;
    const ap = corps[q + 1];
    if (ap && ap.t === 'p' && ap.v === ':' ) {
      // clé d'objet — sauf si on est dans un ternaire ; on s'en tient au cas simple
      const av2 = corps[q - 1];
      if (!av2 || (av2.t === 'p' && (av2.v === '{' || av2.v === ','))) continue;
    }
    if (locales.has(x.v) || globales.has(x.v) || BUILTINS.has(x.v)) continue;
    inconnues.set(x.v, (inconnues.get(x.v) || 0) + 1);
  }
  if (inconnues.size) rapports.push({ nom, inconnues: [...inconnues.keys()] });
}

const nomFichier = path.basename(process.argv[2]);
if (!rapports.length) {
  console.log('note: portee (' + nomFichier + ') : ' + nbPonts +
              ' fonction(s) de pont, aucune lecture non declaree.');
  process.exit(0);
}
for (const r of rapports) {
  console.log('error: ' + r.nom + ' (' + nomFichier + ') lit une variable JAMAIS DÉCLARÉE : ' +
              r.inconnues.join(', ') + '.');
}
console.log('error: une lecture non declaree LEVE des le premier passage. Le try/catch du pont');
console.log('error: la transforme en « pas de donnees » : l ecran s ouvre vide, sans une trace.');
console.log('error: c est le defaut du 6 aout (flSommeilData sans son parametre _argJour).');
process.exit(1);
