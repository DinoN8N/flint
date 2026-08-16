/* ═══════════════════════════════════════════════════════════════════════════
   LA FICHE D'UNE SIESTE MONTRE LA SIESTE — jamais la nuit.
   ═══════════════════════════════════════════════════════════════════════════

   Dino, le 15 août 2026, après quatre allers-retours : « je ne veux plus jamais
   qu'il y ait le problème. » Ce banc EST cette garantie. Chaque cas ci-dessous
   est un défaut réellement vécu ce soir-là, sur son téléphone.

   ═══ CE QUI S'EST PASSÉ, ET POURQUOI ÇA A COÛTÉ QUATRE VERSIONS ═══════════

   Toucher « Sieste » dans Ma journée ouvrait la nuit : 00:59 → 08:35, 6h25, la
   courbe et les stades de la nuit, sous un titre « Ma sieste ». Trois causes
   distinctes se cachaient l'une derrière l'autre :

     1. `flNuitData` posait bien `window._sleepCtx` en reconnaissant la sieste,
        puis appelait `flSommeilData()` — qui ne lit ce contexte NULLE PART. Le
        seul lecteur de `_sleepCtx` était `renderSleepDetail`, l'écran du WEB,
        mort depuis que le natif a pris la page.

     2. La sieste était désignée par sa POSITION dans `sessions_<jour>`. Or ce
        tableau n'est pas trié : la détection du bracelet le réécrit et le
        réordonne, pendant que la frise, elle, affiche par heure.

     3. Une fois la sieste affichée, une charge de NUIT arrivait seule quarante
        secondes plus tard — accueil, préchargement, fin de synchro — et
        écrasait le même réceptacle.

   ET LE BANC ÉTAIT COMPLICE : `semerDemo` triait ses séances par heure avant de
   les écrire. Dans l'atelier, la position d'une entrée valait son heure, et un
   défaut qui ne se voit QUE dans le désordre ne pouvait pas s'y montrer.

   ═══ CE QUE CE BANC VÉRIFIE ══════════════════════════════════════════════

   Il extrait les VRAIES fonctions du vrai `index.html` et les exécute avec la
   forme exacte des données du téléphone de Dino — tableau de séances DANS LE
   DÉSORDRE, tranches de puce couvrant la sieste. Rien n'est recopié : si
   quelqu'un réécrit `flNuitData`, c'est la nouvelle qui est jugée.

   Il ne juge aucun chiffre de physiologie — c'est le travail de
   `test-sommeil.js`. Il demande une seule chose, mais il ne la lâche pas : que
   la fiche d'une sieste parle de CETTE sieste.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RACINE = process.env.SRCROOT || path.join(__dirname, '..', '..', '..');
const INDEX = path.join(RACINE, 'FLINT', 'web', 'index.html');

let ok = 0, ko = 0;
function verifie(titre, condition, detail) {
  if (condition) { ok++; console.log(`  ✅ ${titre}`); }
  else { ko++; console.log(`  ❌ ${titre}${detail ? '  → ' + detail : ''}`); }
}

/* La fonction, découpée sur ses accolades — même procédé que test-charge-nuit. */
function extraire(nom) {
  const src = fs.readFileSync(INDEX, 'utf8');
  const d = src.indexOf('window.' + nom + '=function');
  if (d < 0) return null;
  let i = src.indexOf('{', d), prof = 0;
  for (; i < src.length; i++) {
    if (src[i] === '{') prof++;
    else if (src[i] === '}') { prof--; if (!prof) break; }
  }
  return src.slice(d, i + 1) + ';';
}

// ── Les données du 15 août, telles qu'elles sont sur le téléphone ───────────

const JOUR = '2026-8-15';
const SIESTE_DEBUT = '15:28', SIESTE_DUR = 66;      // 15:28 → 16:34
const NUIT = { asleep: 385, efficiency: 84, bedMin: 59, wakeMin: 515,
               deep: 80, light: 241, rem: 64, awake: 71, inBed: 456 };

/* LE DÉSORDRE EST LE SUJET. La sieste est au rang 0 alors qu'elle a lieu au
   milieu de l'après-midi, et la marche de 11h41 est au rang 2. C'est la forme
   RÉELLE relevée sur l'appareil, pas une forme choisie pour être commode. */
const SESSIONS = [
  { type: 'nap', name: 'Sieste', start: SIESTE_DEBUT, dur: SIESTE_DUR, auto: true },
  { name: 'Séance Tabata', start: '17:36', dur: 21 },
  { name: 'Marche', start: '11:41', dur: 198, auto: true },
  { name: 'Marche', start: '17:57', dur: 21, auto: true },
];

/* Une tranche de puce qui couvre la sieste, comme `flintSleepChunks` en porte :
   départ 15h24, 134 minutes de stades. Codes du moteur : 1 profond, 2 léger,
   3 paradoxal, le reste éveil. */
function tranches() {
  const [y, m, d] = JOUR.split('-').map(Number);
  const depart = new Date(y, m - 1, d, 15, 24, 0, 0).getTime() / 1000;
  const stages = [];
  for (let i = 0; i < 134; i++) {
    // 4 min d'éveil au tout début, puis du léger, avec du profond vers la fin
    // de la sieste — la forme mesurée ce jour-là.
    if (i < 4) stages.push(4);
    else if (i >= 57 && i < 64) stages.push(1);
    else stages.push(2);
  }
  return [{ start: depart, stages }];
}

function bacASable(opts) {
  const o = opts || {};
  const base = {
    ['sessions_' + JOUR]: o.sessions || SESSIONS,
    ['watch_' + JOUR]: { hr: o.hr || [] },
    flintSleepChunks: o.chunks === undefined ? tranches() : o.chunks,
  };
  const bac = {
    console,
    DB: { get: (k, def) => (base[k] !== undefined ? base[k] : def), set: () => {} },
    tk: () => JOUR,
    /* `flSommeilData` est remplacée par un témoin : ce banc ne juge pas la nuit,
       il vérifie seulement qu'on ne l'a PAS servie à la place de la sieste. */
    flSommeilData: () => ({ aDesDonnees: true, _estLaNuit: true,
                            duree: '6h25', couche: '00:59', reveil: '08:35',
                            stades: [{ nom: 'PROFOND' }], nuitLibelle: 'nuit de vendredi à samedi' }),
    sleepNight: () => NUIT,
  };
  bac.window = bac;
  vm.createContext(bac);
  ['flSiesteStades', 'flSiesteData', 'flNuitData'].forEach((n) => {
    const src = extraire(n);
    if (!src) { console.log(`  ❌ ${n} introuvable dans index.html`); ko++; return; }
    vm.runInContext(src, bac);
  });
  return bac;
}

console.log('\nLA FICHE D’UNE SIESTE');

// ── 1. Le cas nu : la sieste est au rang 0, on la demande, on l’obtient ─────
{
  const b = bacASable();
  const r = b.flNuitData(0, JOUR, SIESTE_DEBUT, SIESTE_DUR);
  verifie('une sieste demandée rend la sieste, pas la nuit', !r._estLaNuit,
          'la charge de la nuit a été servie');
  verifie('elle porte son drapeau `estSieste`', r.estSieste === true);
  verifie('ses horaires sont les siens', r.couche === '15:28' && r.reveil === '16:34',
          `${r.couche} → ${r.reveil}`);
  verifie('sa durée est la sienne', r.duree === '1h06', String(r.duree));
  verifie('elle ne porte AUCUN libellé de nuit', r.nuitLibelle == null);
}

// ── 2. LE DÉFAUT DU 15 AOÛT : le rang désigne une AUTRE entrée ──────────────
//
// C'est le cœur du banc. Le tableau est réordonné entre le dessin de la frise
// et le doigt : le rang mémorisé pointe désormais sur le Tabata. L'identité
// (heure + durée) doit reprendre la main. Sans elle, on retombe sur la nuit —
// et c'est très exactement ce que Dino a vu quatre fois de suite.
{
  const b = bacASable();
  const r = b.flNuitData(1, JOUR, SIESTE_DEBUT, SIESTE_DUR);   // rang 1 = Tabata
  verifie('un rang devenu faux ne fait plus retomber sur la nuit', !r._estLaNuit,
          'la position a primé sur l’identité');
  verifie('… et la bonne sieste est retrouvée par son heure',
          r.couche === '15:28' && r.duree === '1h06', `${r.couche} / ${r.duree}`);
}

// ── 3. Une sieste absente ne se déguise pas en réussite ────────────────────
{
  const b = bacASable({ sessions: [{ name: 'Marche', start: '11:41', dur: 198 }] });
  const r = b.flNuitData(0, JOUR, '15:28', 66);
  verifie('sans sieste, la nuit est servie…', r._estLaNuit === true);
  verifie('… mais le repli le DIT (siesteIntrouvable)', r.siesteIntrouvable != null,
          'le repli est muet — c’est la panne qui a coûté une demi-journée');
  verifie('… et il dit ce qu’il a cherché', r.siesteIntrouvable
          && r.siesteIntrouvable.debutDemande === '15:28');
}

// ── 4. La nuit reste la nuit ───────────────────────────────────────────────
{
  const b = bacASable();
  const r = b.flNuitData(-1, JOUR);
  verifie('le rang −1 rend toujours la nuit', r._estLaNuit === true);
}

// ── 5. Les stades de la sieste viennent de la puce, pas d’une formule ──────
{
  const b = bacASable();
  const r = b.flNuitData(0, JOUR, SIESTE_DEBUT, SIESTE_DUR);
  const st = r.stades || [];
  const parNom = {};
  st.forEach((s) => { parNom[s.nom] = s; });
  verifie('les quatre stades sont là', st.length === 4, `${st.length} stade(s)`);
  verifie('le profond vient de la tranche (7 min)', parNom['PROFOND']
          && parNom['PROFOND'].duree === '0h07', parNom['PROFOND'] && parNom['PROFOND'].duree);
  verifie('l’hypnogramme est découpé en segments', (r.segments || []).length >= 2,
          `${(r.segments || []).length} segment(s)`);

  /* LE PIÈGE QU'ON GARDE : une formule sur la durée donnerait TOUJOURS les
     mêmes proportions. On rejoue la même sieste avec une tranche différente ;
     si le résultat ne bouge pas, c'est qu'on a fabriqué au lieu de mesurer. */
  const [y, m, d] = JOUR.split('-').map(Number);
  const depart = new Date(y, m - 1, d, 15, 24, 0, 0).getTime() / 1000;
  const autre = [{ start: depart, stages: new Array(134).fill(1) }];  // tout profond
  const b2 = bacASable({ chunks: autre });
  const r2 = b2.flNuitData(0, JOUR, SIESTE_DEBUT, SIESTE_DUR);
  const p2 = (r2.stades || []).find((s) => s.nom === 'PROFOND');
  verifie('deux siestes de MÊME durée et de contenu différent ne se ressemblent pas',
          p2 && p2.duree !== (parNom['PROFOND'] || {}).duree,
          'les stades sont déduits de la durée — c’est une fabrication');
}

// ── 6. Pas de tranche = pas de stades inventés ─────────────────────────────
{
  const b = bacASable({ chunks: [] });
  const r = b.flNuitData(0, JOUR, SIESTE_DEBUT, SIESTE_DUR);
  verifie('sans tranche de puce, aucun stade n’est rendu', r.stades == null,
          'des stades sont apparus sans mesure derrière');
  verifie('… et la sieste s’affiche quand même (heures, durée)',
          r.couche === '15:28' && r.duree === '1h06');
}

// ── 7. Une tranche qui ne couvre qu’un bout ne fait pas un hypnogramme ─────
{
  const [y, m, d] = JOUR.split('-').map(Number);
  const depart = new Date(y, m - 1, d, 15, 24, 0, 0).getTime() / 1000;
  const courte = [{ start: depart, stages: new Array(12).fill(2) }];   // 12 min sur 66
  const b = bacASable({ chunks: courte });
  const r = b.flNuitData(0, JOUR, SIESTE_DEBUT, SIESTE_DUR);
  verifie('sous la moitié de la fenêtre couverte, on ne rend rien', r.stades == null,
          'un hypnogramme troué se lit comme une sieste hachée d’éveils');
}

// ── 8. La courbe est celle de la sieste, ou rien ───────────────────────────
{
  const hr = [];
  for (let m = 0; m < 1440; m++) hr.push([m, m >= 928 && m <= 994 ? 52 : 80]);
  const b = bacASable({ hr });
  const r = b.flNuitData(0, JOUR, SIESTE_DEBUT, SIESTE_DUR);
  verifie('la courbe est découpée sur la fenêtre de la sieste',
          Array.isArray(r.fc) && r.fc.length === 67, `${(r.fc || []).length} points`);
  verifie('… et ne contient que des battements de cette fenêtre',
          (r.fc || []).every((v) => v === 52));

  const b2 = bacASable({ hr: [[928, 52], [960, 51]] });   // 2 mesures seulement
  const r2 = b2.flNuitData(0, JOUR, SIESTE_DEBUT, SIESTE_DUR);
  verifie('sous trois mesures, on ne trace pas', r2.fc == null,
          'une courbe de deux points dessine une sieste imaginaire');
}

// ── 9. Aucune donnée de nuit ne fuit dans la charge d’une sieste ───────────
{
  const b = bacASable();
  const r = b.flNuitData(0, JOUR, SIESTE_DEBUT, SIESTE_DUR);
  const interdits = ['besoin', 'besoinH', 'detteH', 'semaine', 'mois',
                     'regularite', 'oxygene', 'stressNuit', 'score', 'efficacite'];
  const fuites = interdits.filter((k) => r[k] != null);
  verifie('rien de la nuit ne fuit dans la charge d’une sieste',
          fuites.length === 0, fuites.join(', '));
}

console.log(`\n  ${ok} vérifications passées, ${ko} échec(s)\n`);
process.exit(ko ? 1 : 0);
