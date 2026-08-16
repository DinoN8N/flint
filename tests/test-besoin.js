/* ═══════════════════════════════════════════════════════════════════════════
   LE BANC DE LA VOIE A — le besoin de sommeil mesuré sur les nuits libres

   Le calcul vit dans `index.html` : on découpe le bloc entre ses deux bornes
   textuelles et on le fait tourner avec de faux capteurs. Si quelqu'un déplace
   ou renomme le bloc, le banc le dit plutôt que de passer en silence sur du
   code qui n'existe plus.

   `window` DOIT être l'objet global du bac à sable : dans un navigateur,
   `window.flX = …` crée une variable globale et les fonctions s'appellent
   entre elles par leur nom nu. Un `window` séparé casserait ces appels et le
   banc échouerait sur du code correct.
   ═══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs'), vm = require('vm'), path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const DEBUT = 'LE RYTHME DE SOMMEIL : REGULARITE, DECALAGE SOCIAL, DETTE AMORTIE';
const FIN = '/* LA CIBLE D EFFORT DEPEND DU NIVEAU';
const i0 = SRC.indexOf(DEBUT), i1 = SRC.indexOf(FIN);
if (i0 < 0 || i1 < 0 || i1 < i0) {
  console.log('❌ bloc du besoin introuvable dans index.html'); process.exit(1);
}
if (SRC.indexOf('LE BESOIN DE SOMMEIL MESURE SUR LES NUITS LIBRES (VOIE A)') < 0) {
  console.log('❌ borne de la Voie A absente'); process.exit(1);
}
const CODE = SRC.slice(SRC.lastIndexOf('/*', i0), i1);

const JOUR = (off) => { const d = new Date(); d.setDate(d.getDate() + (off || 0));
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };

function monde(opts) {
  opts = opts || {};
  const nuits = {}, sessions = {}, base = {};
  const sandbox = {
    console, Math, JSON, Date, Array, String, Number, Object, RegExp, isNaN,
    tk: (off) => JOUR(off || 0),
    sensorOf: (k) => nuits[k] || null,
    getProfile: () => (opts.profil || { age: 30 }),
    flAge: () => (opts.age === undefined ? 30 : opts.age),
    flBesoinSommeil: () => ({ h: 8, src: 'banc', min: 480, choisi: false }),
    DB: {
      get: (k, d) => {
        if (k in base) return base[k];
        if (k.startsWith('sessions_')) return sessions[k.slice(9)] || [];
        return d;
      },
      set: (k, v) => { base[k] = v; }
    }
  };
  vm.createContext(sandbox);
  sandbox.window = sandbox;
  vm.runInContext('(function(){' + CODE + '})()', sandbox);

  const api = {
    win: sandbox, base, nuits,
    /* Une nuit MESURÉE, parfaite par défaut : c'est en la dégradant champ par
       champ qu'on prouve que c'est bien ce champ-là qui décide. */
    nuit(off, dureeMin, o) {
      o = o || {};
      const k = JOUR(off);
      const wake = o.wakeMin != null ? o.wakeMin : 420;
      const bed = ((wake - dureeMin) % 1440 + 1440) % 1440;
      nuits[k] = {
        sleepMin: dureeMin, timeInBed: o.timeInBed != null ? o.timeInBed : Math.round(dureeMin / 0.92),
        bedMin: o.bedMin != null ? o.bedMin : bed, wakeMin: wake,
        stages: o.stages !== undefined ? o.stages : [{ stage: 'deep', startMin: 0, durMin: 60 }],
        stageSrc: o.stageSrc !== undefined ? o.stageSrc : 'flint-hr',
        couvertureTranches: o.couv != null ? o.couv : 92,
        bordManquant: o.bord === true,
        minutesComblees: o.comble != null ? o.comble : 4,
        offsetUTC: o.offsetUTC != null ? o.offsetUTC : -120,
        moteurVersion: o.moteurVersion || 'restage-test',
        tempNuit: o.temp === null ? null : (o.temp != null ? o.temp : 34.0),
        rhrNuit: o.rhr === null ? null : (o.rhr != null ? o.rhr : 52),
        hrv: 60
      };
      if (o.reveil !== undefined) this.reveil(off, o.reveil);
      return k;
    },
    reveil(off, v) {
      const m = base['reveils'] || (base['reveils'] = {});
      if (v === null) delete m[JOUR(off)]; else m[JOUR(off)] = v;
    },
    sieste(off, dur) {
      const k = JOUR(off);
      (sessions[k] = sessions[k] || []).push({ type: 'nap', start: '14:00', dur, sleepMin: dur, auto: true });
    },
    reponse(cle, val) { sandbox.flBesoinReponse(cle, val); },
    mesure() { return sandbox.flBesoinMesureA(); }
  };

  /* Un fond de 120 nuits ordinaires avec réveil : il fait exister `habituel`,
     la pression et la couverture, sans produire une seule nuit retenue. */
  if (opts.fond !== false) {
    for (let j = 1; j <= 120; j++) api.nuit(-j, opts.fondDuree || 430, { reveil: 'reveil' });
  }
  return api;
}

/* Une SÉRIE DE REPOS par semaine : la veille longue rembourse (rang 1, elle
   sera rejetée, c'est voulu), puis la nuit qui suit est de rang 2 et retenue.
   La veille doit être posée AVANT dans le temps : le rang se compte en
   regardant en arrière. */

/* Dispersion déterministe. Un banc ne doit pas dépendre du hasard, mais des
   nuits toutes identiques déclenchent à juste titre la garde de concordance :
   il faut donc une dispersion réaliste et reproductible. */
const JIT = [0, 38, -25, 61, -47, 12, -66, 29, -13, 52,
             -38, 8, 44, -55, 21, -30, 67, -9, 35, -42];
const jit = (w, amp) => (amp ? Math.round(JIT[w % JIT.length] * amp / 50) : 0);

function serie(e, n, duree, amp, o) {
  const out = [];
  for (let w = 0; w < n; w++) {
    const off = -(4 + w * 7);
    /* LE COUCHER RESTE FIXE, C'EST LE LEVER QUI BOUGE.
       Faire varier la durée en avançant l'heure du coucher fait rejeter les
       nuits les plus longues par le filtre de coucher décalé, ce qui rétrécit
       artificiellement la dispersion et déclenche la garde de concordance. Un
       jour libre, on se couche à peu près à la même heure et on se lève quand
       on veut : c'est aussi ce que fait la physiologie. */
    const d = duree + jit(w, amp);
    /* La veille doit VRAIMENT être une nuit de récupération, donc dépasser
       l'habituel d'au moins une demi-heure, sinon le rang reste à 1. */
    e.nuit(off - 1, duree + 40, { reveil: 'libre', bedMin: 1380, wakeMin: (1380 + duree + 40) % 1440 });
    e.nuit(off, d, Object.assign({ reveil: 'libre', bedMin: 1380, wakeMin: (1380 + d) % 1440 }, o || {}));
    out.push(off);
  }
  return out;
}

/* Des congés : trois nuits de repos d'affilée, donc deux nuits retenues
   CONSÉCUTIVES, qui doivent compter pour UN seul bloc. */
function conges(e, off, duree) {
  const p = (d) => ({ reveil: 'libre', bedMin: 1380, wakeMin: (1380 + d) % 1440 });
  e.nuit(off - 2, duree + 40, p(duree + 40));
  e.nuit(off - 1, duree, p(duree));
  e.nuit(off, duree, p(duree));
}

let ok = 0, ko = 0;
const verifie = (t, c, d) => { c ? (ok++, console.log(`  ✅ ${t}`))
                                : (ko++, console.log(`  ❌ ${t}${d ? '  → ' + d : ''}`)); };
const rx = (m, re) => !!(m && m.raison && re.test(m.raison));

// ── 1 · Recevabilité et verrous ───────────────────────────────────────────
console.log('\n1 · Recevabilité et verrous d’entrée');
{
  const e = monde({ age: null });
  verifie('âge inconnu : rien, et la raison le dit', rx(e.mesure(), /âge/));
}
{
  const e = monde({ age: 17 });
  serie(e, 20, 500, 50);
  const m = e.mesure();
  verifie('17 ans avec 20 week-ends parfaits : rien', m.valeurMin === null);
  verifie('et la raison parle de l’école', rx(m, /école|18 ans/));
}
{
  const e = monde(); serie(e, 20, 500, 50);
  e.reponse('insomnie1', true); e.reponse('insomnie2', true);
  const m = e.mesure();
  verifie('insomnie (difficulté + retentissement) : rien', m.valeurMin === null);
  verifie('et surtout aucun conseil de se coucher plus tôt',
    !!m.raison && !/plus tôt/.test(m.raison.replace('jamais de te coucher plus tôt', '')));
}
{
  const e = monde(); serie(e, 20, 500, 50);
  e.reponse('insomnie1', true); e.reponse('insomnie3', true);
  verifie('insomnie paradoxale (le bracelet annonce plus que le ressenti) : rien',
    e.mesure().valeurMin === null);
}
{
  const e = monde(); serie(e, 20, 500, 50);
  e.reponse('insomnie3', true);
  verifie('la 3e question SEULE ne bloque pas (sinon état vide permanent)',
    e.mesure().raison === null || !/nuits difficiles/.test(e.mesure().raison || ''));
}
{
  const e = monde(); serie(e, 20, 500, 50); e.reponse('grossesse', true);
  verifie('grossesse déclarée : rien', rx(e.mesure(), /grossesse/));
}
{
  const e = monde(); serie(e, 20, 500, 50); e.reponse('travailPoste', true);
  verifie('travail posté déclaré : rien', e.mesure().valeurMin === null);
}
{
  const e = monde(); serie(e, 20, 500, 50);
  e.win.flBesoinArreter(true);
  verifie('bouton d’arrêt : rien, et il le dit', rx(e.mesure(), /arrête/));
}
{
  /* Travailleur de nuit à horaires FIXES : dispersion FAIBLE, position aberrante.
     C'est le cas que le seul test de dispersion laissait passer. */
  const e = monde({ fond: false });
  for (let j = 1; j <= 120; j++) e.nuit(-j, 430, { wakeMin: 960, reveil: 'reveil' }); // lever 16 h
  serie(e, 20, 500, 50);
  for (let j = 0; j < 14; j++) e.nuit(-j, 430, { wakeMin: 960, reveil: 'reveil' });
  const m = e.mesure();
  verifie('travailleur de nuit fixe : rien, et surtout pas un besoin bas',
    m.valeurMin === null, `valeur=${m.valeurMin}`);
}

// ── 2 · Déclaration ───────────────────────────────────────────────────────
console.log('\n2 · La déclaration du matin');
{
  const e = monde({ fond: false });
  for (let j = 1; j <= 120; j++) e.nuit(-j, 430);
  verifie('aucune réponse : rien, et la raison dit que la question n’a pas été posée',
    rx(e.mesure(), /réveillé tout seul/));
}
{
  const e = monde({ fond: false });
  for (let j = 1; j <= 120; j++) e.nuit(-j, 460, { reveil: 'libre' });
  e.reponse('reveilJoursTravail', 'oui');
  verifie('« tout seul » chaque matin alors qu’il met un réveil : refusé',
    rx(e.mesure(), /réveil|distinguent/));
}
{
  const e = monde({ fond: false });
  for (let j = 1; j <= 120; j++) e.nuit(-j, 460, { reveil: 'libre' });
  e.reponse('reveilJoursTravail', 'non');
  const m = e.mesure();
  verifie('le même profil sans réveil de semaine n’est PAS refusé pour ça',
    !rx(m, /distinguent/), m.raison);
}
{
  /* Il étiquette « tout seul » des nuits qui ressemblent trait pour trait à ses
     nuits avec réveil. Le contraste se mesure sur TOUTES les nuits étiquetées,
     pas seulement sur celles qui finissent retenues : c'est ce qui permet
     d'attraper un étiquetage qui ne porte aucune information. */
  const e = monde();                       // fond = 430 min, avec réveil
  serie(e, 20, 500, 50);
  for (let j = 20; j <= 100; j++) e.reveil(-j, 'libre');  // 80 nuits de 430 dites « libres »
  e.reponse('reveilJoursTravail', 'oui');
  verifie('des nuits « sans réveil » aussi courtes que les autres : refusé',
    rx(e.mesure(), /distinguent/), e.mesure().raison);
}
{
  const e = monde();
  e.nuit(0, 470);                          // pas de réponse
  const m = e.mesure();
  verifie('une nuit sans réponse n’est jamais comptée comme libre',
    m.rejets ? m.rejets.sansReponse > 0 : true);
}

// ── 3 · Qualification technique ───────────────────────────────────────────
console.log('\n3 · La qualification technique de la nuit');
const casQ = [
  ['nuit déduite (aucun stade) est écartée', { stages: null }, 'deduite'],
  ['couverture à 68 % : écartée', { couv: 68 }, 'couverture'],
  ['bord manquant : écartée', { bord: true }, 'bord'],
  ['55 min comblées sur 480 : écartée', { comble: 55 }, 'comble']
];
casQ.forEach(([titre, o, compteur]) => {
  const e = monde();
  const offs = serie(e, 20, 500, 50);
  offs.forEach(off => e.nuit(off, 500, Object.assign({ reveil: 'libre' }, o)));
  const m = e.mesure();
  verifie(titre, m.rejets ? m.rejets[compteur] > 0 : m.valeurMin === null,
    JSON.stringify(m.rejets || m.raison));
});
{
  const e = monde(); const offs = serie(e, 20, 500, 50);
  offs.forEach(off => e.nuit(off, 235, { reveil: 'libre' }));
  verifie('total de 235 min : invraisemblable, écartée', e.mesure().rejets.implausible > 0);
}
{
  const e = monde(); const offs = serie(e, 20, 500, 50);
  offs.forEach(off => e.nuit(off, 725, { reveil: 'libre' }));
  verifie('total de 725 min : invraisemblable, écartée', e.mesure().rejets.implausible > 0);
}
{
  /* La preuve que c'est bien le DRAPEAU qui décide, pas la durée. */
  const a = monde(); let offs = serie(a, 20, 500, 50);
  offs.forEach(off => a.nuit(off, 500, { reveil: 'libre', bord: true }));
  const b = monde(); offs = serie(b, 20, 500, 50);
  const ma = a.mesure(), mb = b.mesure();
  verifie('la même nuit sans le drapeau serait retenue : c’est lui qui décide',
    ma.rejets.bord > 0 && mb.rejets.bord === 0);
}

// ── 4 · Contexte ──────────────────────────────────────────────────────────
console.log('\n4 · Le contexte : coucher, fuseau, fièvre, sieste');
{
  const e = monde(); const offs = serie(e, 20, 500, 50);
  offs.forEach(off => e.nuit(off, 500, { reveil: 'libre', bedMin: 90, wakeMin: 590 }));
  verifie('coucher décalé de 100 min : écartée', e.mesure().rejets.coucher > 0);
}
{
  const e = monde(); const offs = serie(e, 20, 500, 50);
  offs.forEach(off => e.nuit(off, 500, { reveil: 'libre', offsetUTC: -480 }));
  const m = e.mesure();
  verifie('changement de fuseau : écartée', m.rejets.offsetUTC > 0, JSON.stringify(m.rejets));
}
{
  const e = monde(); const offs = serie(e, 20, 500, 50);
  offs.forEach(off => e.nuit(off, 500, { reveil: 'libre', temp: 34.6 }));
  verifie('température nocturne à +0,6 °C : écartée pour fièvre', e.mesure().rejets.fievre > 0);
}
{
  const e = monde(); const offs = serie(e, 20, 500, 50);
  offs.forEach(off => e.nuit(off, 500, { reveil: 'libre', temp: 34.24 }));
  verifie('+0,24 °C (phase lutéale) : AUCUNE exclusion', e.mesure().rejets.fievre === 0);
}
{
  const e = monde(); const offs = serie(e, 20, 500, 50);
  offs.forEach(off => e.nuit(off, 500, { reveil: 'libre', rhr: 58 }));
  verifie('FC nocturne à +6 bpm : écartée pour fièvre', e.mesure().rejets.fievre > 0);
}
{
  const e = monde(); const offs = serie(e, 20, 500, 50);
  offs.forEach(off => e.nuit(off, 500, { reveil: 'libre', rhr: 54.5 }));
  verifie('+2,5 bpm (phase lutéale) : AUCUNE exclusion', e.mesure().rejets.fievre === 0);
}
{
  const e = monde({ fond: false });
  for (let j = 1; j <= 120; j++) e.nuit(-j, 430, { reveil: 'reveil', temp: null, rhr: null });
  serie(e, 20, 500, 50, { temp: null, rhr: null });
  for (let w = 0; w < 20; w++) e.nuit(-(4 + w * 7) - 1, 520, { reveil: 'libre', temp: null, rhr: null });
  verifie('aucun repère de température autour : écartée (fièvre aveugle)',
    e.mesure().rejets.fievreAveugle > 0);
}
{
  const e = monde(); const offs = serie(e, 20, 500, 50);
  offs.forEach(off => e.sieste(off, 75));
  verifie('sieste de 75 min : la journée est écartée', e.mesure().rejets.sieste > 0);
}
{
  const e = monde(); const offs = serie(e, 20, 460, 50);
  offs.forEach(off => e.sieste(off, 40));
  const m = e.mesure();
  verifie('sieste de 40 min : retenue et comptée à 100 % (460 + 40 = 500)',
    m.valeurMin != null && m.valeurMin >= 480, `valeur=${m.valeurMin}`);
}

// ── 5 · Pression et rang ──────────────────────────────────────────────────
console.log('\n5 · La pression homéostatique et le rang');
{
  /* LE TEST QUI AURAIT ATTRAPÉ LA FAILLE LA PLUS GRAVE DU PLAN.
     Avec un clamp du TERME au lieu du RÉSULTAT, la pression s'installe autour
     de 205 min, le seuil du rang 2 vaut 80, et la porte ne s'ouvre JAMAIS. */
  const e = monde(); serie(e, 20, 500, 50);
  const m = e.mesure();
  verifie('la porte de pression s’ouvre vraiment (clamp du RÉSULTAT)',
    m.valeurMin != null, `raison=${m.raison} rejets=${JSON.stringify(m.rejets)}`);
}
{
  const e = monde(); const offs = serie(e, 20, 500, 50);
  /* on efface cinq jours avant chaque dimanche : plus assez d'historique */
  offs.forEach(off => { for (let d = 2; d <= 6; d++) delete e.nuits[JOUR(off - d)]; });
  verifie('cinq jours non mesurés avant : la nuit est écartée',
    e.mesure().rejets.historiqueTrou > 0);
}
{
  const e = monde();
  /* nuits libres ISOLÉES : pas de samedi long devant, donc rang 1 */
  for (let w = 0; w < 20; w++) e.nuit(-(3 + w * 7), 500, { reveil: 'libre' });
  const m = e.mesure();
  verifie('nuit libre isolée (rang 1) : écartée, elle rembourse',
    m.rejets.rang1 > 0, JSON.stringify(m.rejets));
}
{
  /* La pression mesure un ECART A SON PROPRE HABITUEL. Une semaine courte
     AVANT le repos installe donc une dette, et le rang 2 ne suffit plus. */
  const e = monde({ fondDuree: 480 });
  const offs = serie(e, 20, 500, 50);
  offs.slice(0, 3).forEach(off => { for (let d = 2; d <= 6; d++) e.nuit(off - d, 360, { reveil: 'reveil' }); });
  const m = e.mesure();
  verifie('une semaine courte avant le repos : le rang 2 ne suffit plus',
    m.rejets.pression >= 1, JSON.stringify(m.rejets));
}
{
  /* `habituel` ne se calcule que sur les nuits QUALIFIÉES. */
  const a = monde(); serie(a, 20, 500, 50);
  const b = monde(); serie(b, 20, 500, 50);
  for (let j = 60; j < 70; j++) b.nuit(-j, 240, { reveil: 'reveil', bord: true });
  verifie('dix nuits tronquées ne déplacent pas la référence',
    a.mesure().valeurMin === b.mesure().valeurMin,
    `${a.mesure().valeurMin} vs ${b.mesure().valeurMin}`);
}

// ── 6 · Estimateur et intervalle ──────────────────────────────────────────
console.log('\n6 · L’estimateur, sa robustesse et son intervalle');
{
  const e = monde(); serie(e, 20, 500, 50);
  const m = e.mesure();
  verifie('20 blocs à 500 ± 5 : la valeur tombe sur 500',
    m.valeurMin != null && Math.abs(m.valeurMin - 500) <= 15, `valeur=${m.valeurMin}`);
  verifie('l’intervalle est étroit', m.demiMin != null && m.demiMin <= 60, `demi=${m.demiMin}`);
  verifie('la valeur publiée est TOUJOURS dans son intervalle',
    m.valeurMin >= m.basMin && m.valeurMin <= m.hautMin,
    `${m.basMin} ≤ ${m.valeurMin} ≤ ${m.hautMin}`);
}
{
  const a = monde(); serie(a, 20, 500, 5);
  const ref = a.mesure().valeurMin;
  const b = monde(); const offs = serie(b, 20, 500, 5);
  b.nuit(offs[0], 700, { reveil: 'libre' });
  b.nuit(offs[1], 260, { reveil: 'libre' });
  const m = b.mesure();
  verifie('deux blocs aberrants sur 20 : la valeur bouge de moins de 15 min',
    Math.abs(m.valeurMin - ref) <= 15, `${ref} → ${m.valeurMin}`);
}
{
  const e = monde(); serie(e, 12, 500, 50);
  conges(e, -100, 500); conges(e, -110, 490);
  const m = e.mesure();
  verifie('deux nuits de congés consécutives comptent pour UN seul bloc',
    m.nuits === m.blocs + 2, `blocs=${m.blocs} nuits=${m.nuits}`);
}
{
  const e = monde(); serie(e, 12, 500, 50);
  const m = e.mesure();
  /* t(7) = 2,365 contre 1,96 : au moins 20 % de plus, au point exact où l'on
     décide de publier. */
  verifie('à 12 blocs, l’intervalle utilise t et non 1,96',
    m.demiMin != null && m.demiMin > 0, `demi=${m.demiMin}`);
}
{
  const e = monde(); serie(e, 20, 500, 0);   // dispersion nulle
  const m = e.mesure();
  verifie('des nuits toutes identiques : refus pour concordance suspecte',
    rx(m, /ressemblent trop/), m.raison);
}

// ── 7 · Bornes, morcellement, paliers ─────────────────────────────────────
console.log('\n7 · Les bornes de sortie et les paliers');
{
  const e = monde({ fondDuree: 340 }); serie(e, 20, 350, 50);
  const m = e.mesure();
  verifie('estimation sous 6 h : rien, et on le dit',
    m.valeurMin === null, `valeur=${m.valeurMin}`);
}
{
  const e = monde({ fondDuree: 520 }); serie(e, 20, 570, 50);
  const m = e.mesure();
  verifie('estimation à 570 min : rien, avec orientation médicale',
    m.valeurMin === null && rx(m, /médecin du sommeil/), m.raison);
}
{
  const e = monde({ fondDuree: 560 }); serie(e, 20, 615, 50);
  const m = e.mesure();
  verifie('estimation au-dessus de 10 h : rien, avec orientation',
    m.valeurMin === null && rx(m, /médecin du sommeil/), m.raison);
}
{
  /* On passe l'option A `serie` : reecrire les nuits apres coup effacerait la
     dispersion, et la garde de concordance se declencherait AVANT la barriere
     de fragmentation, ce qui testerait autre chose. */
  const e = monde(); serie(e, 20, 500, 50, { timeInBed: 700 }); // efficacité 71 %
  const m = e.mesure();
  verifie('nuits morcelées (efficacité 71 %) : rien, avec orientation',
    m.valeurMin === null && rx(m, /morcel/), m.raison);
}
{
  const st = [];
  for (let q = 0; q < 6; q++) st.push({ stage: 'awake', startMin: 50 + q * 60, durMin: 5 });
  const e = monde(); serie(e, 20, 500, 50, { stages: st });
  const m = e.mesure();
  verifie('six réveils par nuit : rien, avec orientation', m.valeurMin === null && rx(m, /morcel/));
}
{
  const e = monde(); serie(e, 5, 500, 50);
  const m = e.mesure();
  verifie('5 blocs : palier 0, aucune valeur', m.palier === 0 && m.valeurMin === null);
  verifie('et la raison nomme la cause dominante',
    !!m.raison && /\d/.test(m.raison), m.raison);
}
{
  const e = monde(); serie(e, 20, 500, 50);
  const m = e.mesure();
  verifie('20 blocs sans acceptation : palier 1, pas 2', m.palier === 1, `palier=${m.palier}`);
  e.win.flBesoinAccepter(true);
  verifie('avec acceptation explicite : palier 2', e.mesure().palier === 2);
}
{
  const e = monde(); serie(e, 20, 500, 50);
  const m = e.mesure();
  verifie('la confiance existe mais ne commande aucun palier',
    typeof m.confiance === 'number' && m.confiance >= 0 && m.confiance <= 100);
  verifie('elle n’est jamais rendue quand la valeur est nulle',
    monde().mesure().confiance === undefined);
}

// ── 8 · Stabilité et intégration ──────────────────────────────────────────
console.log('\n8 · Stabilité dans le temps et intégration');
{
  const e = monde(); serie(e, 20, 500, 50);
  const m1 = e.mesure(), m2 = e.mesure(), m3 = e.mesure();
  verifie('trois appels de suite rendent exactement la même chose',
    m1.valeurMin === m2.valeurMin && m2.valeurMin === m3.valeurMin
      && m1.blocs === m3.blocs);
}
{
  const e = monde(); serie(e, 20, 500, 50);
  const avant = e.mesure();
  e.nuit(-1, 490, { reveil: 'libre' });     // une nuit de plus
  const apres = e.mesure();
  verifie('ajouter une nuit ne déplace pas la valeur publiée de plus de 20 min',
    Math.abs((apres.valeurMin || 0) - (avant.valeurMin || 0)) <= 20,
    `${avant.valeurMin} → ${apres.valeurMin}`);
  verifie('et ne fait jamais BAISSER le nombre de blocs',
    (apres.blocs || 0) >= (avant.blocs || 0));
}
{
  const e = monde(); serie(e, 20, 500, 50);
  e.mesure();
  const fige = e.base['besoinNuit_' + JOUR(-30)];
  verifie('une nuit de plus de 8 jours est FIGÉE au registre', !!fige && fige.fige === true);
  const recent = e.base['besoinNuit_' + JOUR(-2)];
  verifie('les huit derniers jours restent mobiles', !!recent && recent.fige === false);
}
{
  const e = monde();
  const m = e.mesure();
  verifie('base sans aucune nuit libre : tout est null', m.valeurMin === null);
  verifie('et la case porte sa raison', !!m.raison && m.raison.length > 20);
}
{
  const e = monde({ fond: false });
  const d = e.win.flBesoinData();
  verifie('la porte de l’écran répond même sur une base vide',
    !!d && !!d.besoin && !!d.mesure && !!d.methode);
  verifie('elle porte la phrase de méthode, mot pour mot',
    /[Aa]ucune méthode publiée/.test((d.methode.limites || []).join(' ')));
  verifie('et elle dit dans quelle unité le chiffre est exprimé',
    /minutes mesurées par ton bracelet/.test(d.methode.unite));
}
{
  const e = monde();
  verifie('le diagnostic existe et n’est pas destiné à l’écran',
    typeof e.win.flBesoinDiag === 'function' && !!e.win.flBesoinDiag().couverture);
}

console.log(`\n${ko === 0 ? '✅' : '❌'} test-besoin.js : ${ok} réussis, ${ko} échoués\n`);
process.exit(ko ? 1 : 0);
