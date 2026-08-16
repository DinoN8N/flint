/* ═══════════════════════════════════════════════════════════════════════════
   LE BANC DU RYTHME — régularité, chronotype, décalage social, dette amortie

   Ces quatre calculs vivent dans `index.html` et non dans `flint-sommeil.js`,
   parce qu'ils lisent `sensorOf` et le profil. On ne charge donc pas un fichier
   entier : on DÉCOUPE le bloc entre ses deux bornes et on le fait tourner avec
   de faux capteurs. Si quelqu'un déplace ou renomme le bloc, le banc le dit au
   lieu de passer en silence sur du code qui n'existe plus.
   ═══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs'), vm = require('vm'), path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const DEBUT = 'LE RYTHME DE SOMMEIL : REGULARITE, DECALAGE SOCIAL, DETTE AMORTIE';
const FIN = '/* LA CIBLE D EFFORT DEPEND DU NIVEAU';
const i0 = SRC.indexOf(DEBUT), i1 = SRC.indexOf(FIN);
if (i0 < 0 || i1 < 0 || i1 < i0) {
  console.log('❌ bloc du rythme introuvable dans index.html'); process.exit(1);
}
const CODE = SRC.slice(SRC.lastIndexOf('/*', i0), i1);

/* ── Un monde de poche : un jour = une clé, des nuits qu'on pose à la main ── */
function monde(profil) {
  const nuits = {}, sessions = {}, montres = {}, reveils = {}, autres = {};
  const jour = (off) => { const d = new Date(); d.setDate(d.getDate() + off);
    return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };
  const sandbox = {
    console,
    Math, JSON, Date, Array, String, Number, Object,
    tk: (off) => jour(off || 0),
    sensorOf: (k) => nuits[k] || null,
    getProfile: () => profil || {},
    /* le vrai `flBesoinSommeil` vit plus haut dans le fichier : on le stube
       avec exactement son contrat, {h, src}. */
    /* v1194 — le contrat s'est enrichi de `min` et `choisi` ; le stub doit
       suivre, sinon le banc testerait un contrat qui n'existe plus. */
    flBesoinSommeil: () => ({ h: (profil && profil.besoinH) || 8, src: 'banc',
                              min: ((profil && profil.besoinH) || 8) * 60, choisi: false }),
    /* Un stockage GÉNÉRIQUE. La version précédente n'écrivait que `reveils` et
       jetait silencieusement tout le reste : un garde-fou posé sur une autre clé
       ne pouvait donc pas se déclencher, et le banc l'aurait déclaré absent
       alors qu'il était bien là. */
    DB: {
      get: (k, d) => {
        if (k === 'reveils') return reveils;
        if (k.startsWith('sessions_')) return sessions[k.slice(9)] || [];
        if (k.startsWith('watch_')) return montres[k.slice(6)] || null;
        return (k in autres) ? autres[k] : d;
      },
      set: (k, v) => {
        /* `get` rend l'objet LUI-MÊME : le moteur le mute puis le repose, donc
           `v` et `reveils` sont le même objet. Le vider avant de le recopier
           l'effacerait. On prend une copie d'abord. */
        if (k === 'reveils') { const c = Object.assign({}, v);
                               Object.keys(reveils).forEach(x => delete reveils[x]);
                               Object.assign(reveils, c); }
        else autres[k] = v;
      }
    }
  };
  /* `window` DOIT être l'objet global du bac à sable, pas un objet à part.
     Dans un navigateur, `window.flReveilLu = …` crée une variable globale, si
     bien que les fonctions s'appellent entre elles par leur nom nu. Un `window`
     séparé casse ces appels croisés et fait échouer le banc sur du code
     parfaitement correct : c'est le harnais qui mentirait, pas le moteur. */
  vm.createContext(sandbox);
  sandbox.window = sandbox;
  vm.runInContext('(function(){' + CODE + '})()', sandbox);
  const win = sandbox;
  return {
    win, jour, reveils,
    /* Pose une nuit sur le jour de son RÉVEIL, comme le fait le moteur. */
    nuit(off, coucherH, coucherM, reveilH, reveilM, libre) {
      const k = jour(off);
      const bed = coucherH * 60 + coucherM, wake = reveilH * 60 + reveilM;
      let dur = wake - bed; if (dur < 0) dur += 1440;
      nuits[k] = { bedMin: bed, wakeMin: wake, sleepMin: dur, hrv: 60 };
      if (libre !== undefined) reveils[k] = libre ? 'libre' : 'reveil';
      return k;
    },
    sieste(off, hhmm, dur) {
      const k = jour(off);
      (sessions[k] = sessions[k] || []).push({ type: 'nap', start: hhmm, dur, auto: true });
    },
    /* Couverture du bracelet : un point de FC toutes les 10 min sur une plage. */
    couvrir(off, deMin, aMin) {
      const k = jour(off);
      const w = montres[k] = montres[k] || { hr: [] };
      for (let m = deMin; m <= aMin; m += 10) w.hr.push([m, 60]);
    },
    couvrirTout(off) { this.couvrir(off, 0, 1439); }
  };
}

let ok = 0, ko = 0;
const verifie = (t, c, d) => { c ? (ok++, console.log(`  ✅ ${t}`))
                                : (ko++, console.log(`  ❌ ${t}${d ? '  → ' + d : ''}`)); };

// ── 1 · L'indice de régularité ────────────────────────────────────────────
console.log('\n1 · La régularité');
{
  const e = monde();
  for (let j = 0; j <= 15; j++) { e.nuit(-j, 23, 0, 7, 0); e.couvrirTout(-j); }
  const r = e.win.flRegularite(14);
  verifie('des horaires strictement identiques donnent un SRI très haut',
    r && r.sri >= 95, r ? `sri=${r.sri}` : 'rien rendu');
  verifie('la couverture est rendue', r && r.couverture >= 95, r && `${r.couverture} %`);
  verifie('la lecture en clair suit le chiffre', r && r.lecture === 'très régulière');
}
{
  const e = monde();
  /* un jour sur deux décalé de douze heures : aucune structure à 24 h */
  for (let j = 0; j <= 15; j++) {
    if (j % 2) e.nuit(-j, 11, 0, 19, 0); else e.nuit(-j, 23, 0, 7, 0);
    e.couvrirTout(-j);
  }
  const r = e.win.flRegularite(14);
  verifie('des horaires alternés de 12 h effondrent le SRI',
    r && r.sri != null && r.sri < 30, r ? `sri=${r.sri}` : 'rien rendu');
}
{
  const e = monde();
  for (let j = 0; j <= 15; j++) { e.nuit(-j, 23, 0, 7, 0); e.couvrir(-j, 0, 400); }
  const r = e.win.flRegularite(14);
  verifie('sous 70 % de couverture, aucun SRI n’est rendu',
    r && r.sri === null, r && `sri=${r.sri} couv=${r.couverture}`);
  verifie('et la raison est dite en clair', r && /couvert/.test(r.raison || ''));
}
{
  /* LE PIÈGE HISTORIQUE : une minute non transmise n'est PAS de l'éveil.
     Si elle l'était, deux jours identiques mais couverts différemment
     paraîtraient irréguliers. */
  const e = monde();
  for (let j = 0; j <= 15; j++) {
    e.nuit(-j, 23, 0, 7, 0);
    /* un jour sur trois, le bracelet ne couvre pas 10 h → 14 h : ces minutes
       sont INCONNUES, ni sommeil ni éveil, et sortent du dénominateur. */
    if (j % 3 === 0) { e.couvrir(-j, 0, 585); e.couvrir(-j, 855, 1439); }
    else e.couvrirTout(-j);
  }
  const r = e.win.flRegularite(14);
  verifie('des trous de couverture ne fabriquent pas d’irrégularité',
    r && r.sri >= 95, r && `sri=${r.sri}`);
}

// ── 2 · Chronotype et décalage social ─────────────────────────────────────
console.log('\n2 · Le chronotype et le décalage social');
{
  const e = monde();
  const c = e.win.flChronotype();
  verifie('sans aucune nuit libre, rien n’est inventé', c && c.msfsc === null);
  verifie('et la raison compte les nuits manquantes', c && /trois nuits sans réveil/.test(c.raison || ''));
}
{
  const e = monde();
  /* semaine : 23h30 → 6h30 (7 h). Week-end libre : 1h → 10h (9 h). */
  for (let j = 1; j <= 10; j++) e.nuit(-j, 23, 30, 6, 30, false);
  for (let j = 11; j <= 14; j++) e.nuit(-j, 1, 0, 10, 0, true);
  const c = e.win.flChronotype();
  verifie('le chronotype est rendu dès trois nuits libres', c && c.msfsc != null,
    c && c.raison);
  /* MSF brut = milieu de 1h→10h = 5h30. Correction de dette : les nuits libres
     durent 9 h, la moyenne générale ~7h34, donc MSFsc ≈ 5h30 − 43 min. */
  verifie('MSFsc est CORRIGÉ de la dette, donc plus tôt que MSF brut',
    c && c.msfsc < c.msf, c && `msf=${c.msf} msfsc=${c.msfsc}`);
  verifie('le décalage social est mesuré', c && c.decalageSocial != null);
  /* milieu semaine = 3h00, milieu libre = 5h30 → 2 h 30 d'écart */
  verifie('il vaut bien 2 h 30 entre 3h00 et 5h30',
    c && Math.abs(c.decalageSocial - 150) <= 2, c && `${c.decalageSocial} min`);
  verifie('avec sa lecture en clair', c && c.decalageLecture === 'important');
}
{
  /* LA MOYENNE CIRCULAIRE : 23 h et 1 h donnent minuit, pas midi. */
  const e = monde();
  for (let j = 1; j <= 3; j++) e.nuit(-j, 21, 0, 5, 0, true);   // milieu 01h00
  for (let j = 4; j <= 6; j++) e.nuit(-j, 19, 0, 3, 0, true);   // milieu 23h00
  const c = e.win.flChronotype();
  verifie('la moyenne de 23h et 01h tombe à minuit, pas à midi',
    c && (c.msf <= 15 || c.msf >= 1425), c && `msf=${c.msf}`);
}
{
  const e = monde();
  for (let j = 1; j <= 5; j++) e.nuit(-j, 23, 0, 7, 0, true);
  const c = e.win.flChronotype();
  verifie('sans nuit contrainte, le décalage social reste vide',
    c && c.decalageSocial === null);
  verifie('et le chronotype est tout de même rendu', c && c.msfsc != null);
  verifie('sans rattrapage, MSFsc n’est pas corrigé vers le passé',
    c && c.msfsc === c.msf, c && `msf=${c.msf} msfsc=${c.msfsc}`);
}

// ── 3 · La question du matin ──────────────────────────────────────────────
console.log('\n3 · La question du matin');
{
  const e = monde();
  e.nuit(0, 23, 0, 7, 0);
  const q = e.win.flReveilQuestion();
  verifie('une nuit non répondue déclenche la question', !!q, 'aucune question');
  verifie('elle porte l’heure réelle du réveil', q && /07h00/.test(q.question), q && q.question);
  e.win.flReveilRepondre(q.jour, true);
  verifie('après réponse, la question disparaît', e.win.flReveilQuestion() === null);
  verifie('et la réponse est relisible', e.win.flReveilLu(q.jour) === 'libre');
}
{
  /* v1196 — LE DÉFAUT DU 5 AOÛT : trois matins en attente, servis à la chaîne.
     Techniquement correct, vécu comme une boucle. Une par jour. */
  const e = monde();
  e.nuit(0, 23, 0, 7, 0); e.nuit(-1, 23, 0, 6, 30); e.nuit(-2, 22, 30, 6, 45);
  const q1 = e.win.flReveilQuestion();
  verifie('trois matins en attente : la question porte le plus récent',
    !!q1 && q1.jour === e.jour(0), q1 && q1.jour);
  e.win.flReveilRepondre(q1.jour, true);
  verifie('après avoir répondu, plus AUCUNE question aujourd’hui',
    e.win.flReveilQuestion() === null,
    JSON.stringify(e.win.flReveilQuestion()));
  verifie('les deux matins en retard restent sans réponse, sans être devinés',
    e.win.flReveilLu(e.jour(-1)) === null && e.win.flReveilLu(e.jour(-2)) === null);
}
{
  const e = monde();
  e.nuit(0, 5, 0, 6, 30);            // 90 min seulement
  verifie('une nuit trop courte ne déclenche pas la question',
    e.win.flReveilQuestion() === null);
}
{
  const e = monde();
  e.nuit(-3, 23, 0, 7, 0);
  verifie('une nuit vieille de trois jours ne se demande plus',
    e.win.flReveilQuestion() === null);
}

// ── 4 · La dette amortie ──────────────────────────────────────────────────
console.log('\n4 · La dette');
{
  const e = monde({ besoinH: 8 });
  for (let j = 0; j <= 20; j++) e.nuit(-j, 23, 0, 7, 0);   // pile 8 h
  const d = e.win.flDetteSommeil();
  verifie('dormir exactement son besoin ne crée aucune dette',
    d && d.min === 0, d && `${d.min} min`);
}
{
  const e = monde({ besoinH: 8 });
  for (let j = 0; j <= 20; j++) e.nuit(-j, 23, 0, 5, 0);   // 6 h, soit −2 h
  const d = e.win.flDetteSommeil();
  /* Amortissement à 0,85 : la série converge vers 120/(1−0,85) = 800 min,
     donc environ 13 h et non 21 × 2 h = 42 h. */
  verifie('vingt et un jours à −2 h convergent, ils ne s’additionnent pas',
    d && d.min > 700 && d.min < 810, d && `${d.min} min`);
  verifie('et la dette reste sous le plafond de trois nuits',
    d && d.min <= 3 * 480);
}
{
  const e = monde({ besoinH: 8 });
  for (let j = 4; j <= 20; j++) e.nuit(-j, 23, 0, 5, 0);   // dette installée
  for (let j = 0; j <= 3; j++) e.nuit(-j, 22, 0, 8, 0);    // 10 h : remboursement
  const d = e.win.flDetteSommeil();
  verifie('quatre nuits longues remboursent sans tout effacer',
    d && d.min > 0 && d.min < 400, d && `${d.min} min`);
}
{
  const e = monde({ besoinH: 8 });
  for (let j = 0; j <= 20; j++) e.nuit(-j, 23, 0, 6, 0);   // 7 h, −1 h
  const sans = e.win.flDetteSommeil().min;
  const f = monde({ besoinH: 8 });
  for (let j = 0; j <= 20; j++) { f.nuit(-j, 23, 0, 6, 0); f.sieste(-j, '14:00', 60); }
  const avec = f.win.flDetteSommeil().min;
  verifie('une sieste rembourse, mais pas à parité', avec < sans && avec > 0,
    `sans=${sans} avec=${avec}`);
  /* 60 min de sieste comptées à 70 % = 42 min : il reste 18 min de manque. */
  verifie('elle compte bien à 70 %', Math.abs(sans - avec) > 200,
    `écart ${sans - avec} min`);
}
{
  const e = monde({ besoinH: 8 });
  const d = e.win.flDetteSommeil();
  verifie('sans aucune nuit mesurée, la dette est vide et dit pourquoi',
    d && d.min === null && /aucune nuit/.test(d.raison || ''));
}

// ── 5 · La porte unique ───────────────────────────────────────────────────
console.log('\n5 · La porte de l’écran');
{
  const e = monde({ besoinH: 8 });
  for (let j = 1; j <= 10; j++) { e.nuit(-j, 23, 30, 6, 30, false); e.couvrirTout(-j); }
  for (let j = 11; j <= 15; j++) { e.nuit(-j, 1, 0, 10, 0, true); e.couvrirTout(-j); }
  const r = e.win.flRythmeData();
  verifie('la porte rend les cinq blocs', r && r.besoin && r.regularite
    && r.chronotype && r.decalageSocial && r.dette);
  verifie('le besoin porte sa provenance', r && r.besoin.src === 'banc');
  verifie('le chronotype est en texte lisible', r && /^\d\dh\d\d$/.test(r.chronotype.texte || ''),
    r && r.chronotype.texte);
  verifie('le décalage social est en texte lisible', r && !!r.decalageSocial.texte);
}
{
  const e = monde({ besoinH: 8 });
  const r = e.win.flRythmeData();
  verifie('une base vide ne fabrique aucun chiffre',
    r && r.regularite.valeur === null && r.chronotype.milieu === null
      && r.dette.min === null);
  verifie('et chaque case vide porte sa raison',
    r && !!r.chronotype.raison && !!r.dette.raison);
}

console.log(`\n${ko === 0 ? '✅' : '❌'} test-rythme.js : ${ok} réussis, ${ko} échoués\n`);
process.exit(ko ? 1 : 0);
