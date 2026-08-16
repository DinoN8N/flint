/* ═══════════════════════════════════════════════════════════════════════════
   LA JOURNÉE NE SE COUPE PAS À MINUIT — LE BANC QUI LE VERROUILLE

   LE DÉFAUT, ET SON HEURE EXACTE. 14 août 2026, 00 h 21. Dino est sorti le 13
   au soir, il n'a pas dormi, il regarde son téléphone. FLINT lui annonce une
   journée neuve : calories à zéro, effort à zéro, activités de la soirée
   disparues. Sur l'autre poignet, WHOOP écrit « AOÛT 13 À AUJOURD'HUI » et
   continue de compter.

   LA RÈGLE, DICTÉE PAR DINO ET SANS EXCEPTION : chez FLINT une journée n'est
   pas une date du calendrier. Une journée est la période comprise ENTRE DEUX
   SOMMEILS PRINCIPAUX. Pas de sommeil principal mesuré = pas de nouvelle
   journée, même si deux dates civiles ont été traversées.

   CE QUE CE BANC EXISTE POUR EMPÊCHER : qu'une modification future
   réintroduise un reset à minuit sans que personne ne le voie. Il ne teste pas
   des morceaux, il rejoue les dix situations que Dino a nommées une par une,
   dans l'ordre où elles se vivent.

   IL NE TOUCHE À RIEN. Il DÉCOUPE le bloc « JOURNÉE LOGIQUE » de `index.html`
   entre ses deux bornes et le fait tourner avec un faux stockage. Si quelqu'un
   déplace ou renomme le bloc, le banc le dit au lieu de passer en silence sur
   du code qui n'existe plus.
   ═══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs'), vm = require('vm'), path = require('path');

/* ── LE BANC CHOISIT SON FUSEAU, IL NE SUBIT PAS CELUI DE LA MACHINE ────────
   L'histoire rejouée ici est écrite à l'heure de Paris — « il regarde son
   téléphone à 00 h 21 ». Sur le Mac de Dino, réglé sur La Réunion (UTC+4),
   ce même instant tombe le 14 à 2 h 21 : le banc racontait donc une autre
   histoire que celle qu'il annonçait, et il devenait rouge ou vert selon
   l'endroit où on le lance. Un banc dont le verdict dépend du lieu ne prouve
   rien. On se relance donc une fois, avec le fuseau écrit noir sur blanc.
   Le fils lancé pour le cas 7 porte déjà son propre fuseau : il ne repasse
   pas par ici. */
if (!process.env.FLINT_BANC_TZ) {
  const r = require('child_process').spawnSync(
    process.execPath, [__filename].concat(process.argv.slice(2)),
    { stdio: 'inherit',
      env: Object.assign({}, process.env, { TZ: 'Europe/Paris', FLINT_BANC_TZ: '1' }) });
  process.exit(r.status == null ? 1 : r.status);
}

const SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const BORNE_DEBUT = '/* ═══ DEBUT JOURNEE LOGIQUE';
const BORNE_FIN = '/* ═══ FIN JOURNEE LOGIQUE';
const i0 = SRC.indexOf(BORNE_DEBUT), i1 = SRC.indexOf(BORNE_FIN);
if (i0 < 0 || i1 < 0 || i1 < i0) {
  console.log('❌ le bloc « JOURNEE LOGIQUE » est introuvable dans index.html.');
  console.log('   Ses deux bornes sont « ═══ DEBUT JOURNEE LOGIQUE » et « ═══ FIN JOURNEE LOGIQUE ».');
  console.log('   Elles ne sont pas décoratives : ce banc s\'en sert pour trouver le code.');
  process.exit(1);
}
const CODE = SRC.slice(i0, i1);

/* ── LES INSTANTS DE L'HISTOIRE ───────────────────────────────────────────
   Une seule histoire, jouée en avançant l'horloge. Chaque scénario reprend là
   où le précédent s'est arrêté, comme la journée se vit.

   ILS SONT ABSOLUS, ET C'EST INDISPENSABLE. `new Date(2026,7,13,8,0)` désigne
   8 h du matin DANS LE FUSEAU DE LA MACHINE : le même banc rejoué à Auckland
   décrirait un autre instant, et le cas 7 comparerait deux histoires
   différentes en croyant comparer deux fuseaux. On écrit donc l'heure de Paris
   (UTC+2 en août) une fois pour toutes, et l'instant ne bouge plus. */
const PARIS = 2;
const H = (j, h, m) => Date.UTC(2026, 7, j, h - PARIS, m || 0, 0, 0);

const REVEIL_13 = H(13, 8, 0);          // réveil du 13 août à 8 h
const COUCHER_12 = H(12, 23, 30);       // …après une nuit posée la veille
const ENDORMI_14 = H(14, 5, 30);        // il s'endort enfin le 14 à 5 h 30
const REVEIL_14 = H(14, 10, 0);         // et se réveille à 10 h

/* ── LE MONDE DE POCHE ─────────────────────────────────────────────────────
   Un vrai `localStorage` de poche, un vrai `DB`, et des consommateurs qui
   NOTENT les clés qu'on leur demande — c'est ce carnet qui permet au cas 10 de
   prouver que tout le monde lit la même frontière. */
function monde(etatInitial) {
  let maintenant = REVEIL_13;
  const store = Object.assign({}, etatInitial || {});
  const lus = { calories: [], zones: [], entrees: [] };

  class DateFigee extends Date {
    constructor(...a) { if (a.length === 0) super(maintenant); else super(...a); }
    static now() { return maintenant; }
  }

  const faux = {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; },
    get length() { return Object.keys(store).length; },
    key: i => Object.keys(store)[i]
  };

  const cleDe = ms => { const d = new Date(ms);
    return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); };
  const tk = off => cleDe(maintenant + (off || 0) * 86400000);

  const DB = {
    get: (k, d) => { try { const v = faux.getItem(k); return v === null ? d : JSON.parse(v); }
                     catch (e) { return d; } },
    set: (k, v) => { try { faux.setItem(k, JSON.stringify(v)); sandbox._flEcritures = (sandbox._flEcritures || 0) + 1;
                           return true; } catch (e) { return false; } }
  };

  const sandbox = {
    console, Math, JSON, Date: DateFigee, Array, String, Number, Object, isFinite,
    localStorage: faux, DB, tk,
    /* Les jours qui portent une trace. Le vrai `flJoursVus` énumère les clés du
       stockage ; ici on fait exactement pareil, en plus court. */
    flJoursVus: (prefixes, N) => {
      const tout = {};
      Object.keys(store).forEach(k => {
        prefixes.forEach(p => { if (k.lastIndexOf(p, 0) === 0) tout[k.slice(p.length)] = 1; });
      });
      if (N == null) return tout;
      const garde = {};
      for (let i = 0; i < N; i++) { const kk = tk(-i); if (tout[kk]) garde[kk] = 1; }
      return garde;
    },
    watchOf: k => DB.get('watch_' + k, null),
    /* Les consommateurs. Chacun note la clé qu'on lui a demandée. */
    caloriesBurned: k => { lus.calories.push(k);
      const w = DB.get('watch_' + k, null);
      return (w && w.kcalJour != null) ? w.kcalJour : null; },
    flZonesJour: k => { lus.zones.push(k);
      const w = DB.get('watch_' + k, null);
      return (w && w.zones) ? { min: w.zones.slice(), couvertureMin: w.couv || 0,
                                fcMax: 190, fcMaxSource: 'banc', fcRepos: 50,
                                fcReposSource: 'banc', reserve: 140 } : null; },
    /* La vraie formule vit à côté des coefficients calibrés, dans la couche
       coquille. On la recopie ICI et nulle part ailleurs : c'est un harnais de
       test, pas du code livré. */
    flEffortDeMinutes: min => {
      if (!min) return null;
      const P = [0.0305, 0.0945, 0.2515, 0.3780, 0.7709, 1.3258];
      let s = 0; for (let i = 0; i < 6; i++) s += P[i] * (min[i] || 0);
      return Math.max(0, Math.min(20, +(4.5 * Math.log(1 + s)).toFixed(1)));
    },
    loadStrain: k => null,
    actStrain: () => 3.2
  };
  vm.createContext(sandbox);
  sandbox.window = sandbox;
  vm.runInContext('(function(){' + CODE + '})()', sandbox);

  return {
    sandbox, store, lus,
    /* Avancer l'horloge, et OUBLIER la mémoire : chaque question posée à ce
       banc est un vrai recalcul, jamais une réponse mise en cache. Sinon on
       testerait la mémoire au lieu de la règle. */
    a(ms) { maintenant = ms; sandbox.flJourLogiqueOublier(); return sandbox.flJourLogique(); },
    jour() { sandbox.flJourLogiqueOublier(); return sandbox.flJourLogique(); },
    videCarnet() { lus.calories.length = 0; lus.zones.length = 0; lus.entrees.length = 0; }
  };
}

/* Une journée civile telle que le bracelet la laisse : une courbe, un compte de
   calories, des minutes par zone. `sommeils` est le registre du moteur. */
function journeeCivile(m, cle, o) {
  o = o || {};
  m.store['watch_' + cle] = JSON.stringify({
    kcalJour: o.kcal != null ? o.kcal : 0,
    zones: o.zones || [0, 0, 0, 0, 0, 0],
    couv: o.couv || 0,
    sommeils: o.sommeils || [],
    night: o.night || null
  });
  if (o.sessions) m.store['sessions_' + cle] = JSON.stringify(o.sessions);
  if (o.repas) m.store['meals_' + cle] = JSON.stringify(o.repas);
}

const nuit = (debut, fin) => ({ debut, fin, sleepMin: Math.round((fin - debut) / 60000),
                                type: 'mainSleep', source: 'mesure' });
const sieste = (debut, fin) => ({ debut, fin, sleepMin: Math.round((fin - debut) / 60000),
                                  type: 'nap', source: 'mesure' });

/* ── LE DÉCOR COMMUN ───────────────────────────────────────────────────────
   Le 13 août : réveil à 8 h, une journée normale, une sortie le soir.
   Le 14 août : les premières heures après minuit, toujours debout. */
function decorNuitBlanche() {
  const m = monde();
  journeeCivile(m, '2026-8-13', {
    kcal: 2100, zones: [30, 60, 20, 10, 0, 0], couv: 700,
    sommeils: [nuit(COUCHER_12, REVEIL_13)],
    night: { bedMin: 23 * 60 + 30, wakeMin: 8 * 60, sleepMin: 510, timeInBed: 510 },
    sessions: [{ start: '23:30', dur: 45, name: 'Sortie', int: 2 }],
    repas: [{ time: '20:15', name: 'Dîner', kcal: 900 }]
  });
  journeeCivile(m, '2026-8-14', {
    kcal: 300, zones: [10, 20, 5, 0, 0, 0], couv: 190
  });
  return m;
}

/* ═══ LE BANC ═══════════════════════════════════════════════════════════════ */
let ok = 0, ko = 0;
function verifie(titre, condition, detail) {
  if (condition) { ok++; console.log('  ✅ ' + titre); }
  else { ko++; console.log('  ❌ ' + titre + (detail ? '\n       ' + detail : '')); }
}

/* ── Cas 7, la partie qui doit tourner dans un AUTRE fuseau ─────────────────
   Appelé en sous-processus avec TZ=Pacific/Auckland. Il rejoue exactement le
   même décor et n'imprime que l'identifiant obtenu. */
if (process.argv[2] === '--identifiant-seul') {
  const m = decorNuitBlanche();
  process.stdout.write(String(m.a(H(14, 0, 21)).id));
  process.exit(0);
}

console.log('\n═══ la journée ne se coupe pas à minuit ═══\n');

/* ─────────────────────────────────────────────────────────────────────────
   1. 23 h 59 → 00 h 01 sans sommeil : MÊME journée logique
   ───────────────────────────────────────────────────────────────────────── */
console.log('1. le passage de minuit, sans sommeil');
{
  const m = decorNuitBlanche();
  const avant = m.a(H(13, 23, 59));
  const apres = m.a(H(14, 0, 1));
  verifie('l\'identifiant de journée ne change pas à minuit',
    avant.id != null && avant.id === apres.id,
    'avant ' + avant.id + ' · après ' + apres.id);
  verifie('la journée s\'ouvre au réveil mesuré, pas à minuit',
    apres.debut === REVEIL_13,
    'attendu ' + new Date(REVEIL_13).toString() + ', reçu ' + new Date(apres.debut).toString());
  verifie('elle est née d\'un sommeil, jamais d\'une date',
    apres.origine === 'sommeil', 'origine reçue : ' + apres.origine);
  verifie('elle porte maintenant DEUX dates civiles',
    apres.cles.length === 2 && apres.cles[0] === '2026-8-13' && apres.cles[1] === '2026-8-14',
    'clés reçues : ' + JSON.stringify(apres.cles));
  verifie('avant minuit elle n\'en portait qu\'une',
    avant.cles.length === 1 && avant.cles[0] === '2026-8-13',
    'clés reçues : ' + JSON.stringify(avant.cles));
}

/* ─────────────────────────────────────────────────────────────────────────
   2. Minuit avec une activité en cours : activité, effort et calories restent
   ───────────────────────────────────────────────────────────────────────── */
console.log('\n2. l\'activité, l\'effort et les calories traversent minuit');
{
  const m = decorNuitBlanche();
  m.a(H(13, 23, 59));
  const kAvant = m.sandbox.flCaloriesJour(0);
  const eAvant = m.sandbox.flEffortJour(0);
  const nAvant = m.sandbox.flEntreesJour(0).length;

  m.a(H(14, 0, 21));
  const kApres = m.sandbox.flCaloriesJour(0);
  const eApres = m.sandbox.flEffortJour(0);
  const entrees = m.sandbox.flEntreesJour(0);

  verifie('les calories continuent de s\'additionner (2 100 + 300 = 2 400)',
    kAvant === 2100 && kApres === 2400,
    'avant ' + kAvant + ' · après ' + kApres);
  verifie('les calories ne repartent PAS de zéro à minuit',
    kApres > kAvant, 'avant ' + kAvant + ' · après ' + kApres);
  verifie('l\'effort ne repart pas de zéro non plus',
    eAvant != null && eApres != null && eApres > eAvant,
    'avant ' + eAvant + ' · après ' + eApres);
  verifie('l\'effort somme les MINUTES par zone, il n\'additionne pas deux scores',
    eApres === m.sandbox.flEffortDeMinutes([40, 80, 25, 10, 0, 0]),
    'reçu ' + eApres + ', attendu ' + m.sandbox.flEffortDeMinutes([40, 80, 25, 10, 0, 0]));
  verifie('la sortie de 23 h 30 est toujours dans la journée après minuit',
    entrees.length === nAvant && entrees.some(e => e.nom === 'Sortie'),
    entrees.length + ' entrée(s) : ' + entrees.map(e => e.nom).join(', '));
  verifie('chaque entrée porte son jour civil — sinon on ouvrirait la mauvaise',
    entrees.every(e => e.jour === '2026-8-13' || e.jour === '2026-8-14'),
    JSON.stringify(entrees.map(e => e.jour)));
  verifie('le dîner de 20 h 15 vient bien AVANT la sortie de 23 h 30',
    entrees.findIndex(e => e.nom === 'Dîner') < entrees.findIndex(e => e.nom === 'Sortie'));
}

/* ─────────────────────────────────────────────────────────────────────────
   3. Éveillé jusqu'à 6 h du matin : aucune nouvelle journée
   ───────────────────────────────────────────────────────────────────────── */
console.log('\n3. debout jusqu\'à 6 h du matin');
{
  const m = decorNuitBlanche();
  const ref = m.a(H(13, 22, 0));
  [[14, 2], [14, 4], [14, 5], [14, 6]].forEach(([j, h]) => {
    const v = m.a(H(j, h, 0));
    verifie('à ' + String(h).padStart(2, '0') + ' h, toujours la même journée',
      v.id === ref.id, 'référence ' + ref.id + ' · reçu ' + v.id);
  });
  const fin = m.a(H(14, 6, 0));
  verifie('sa durée est écrite, elle n\'est pas cachée : 22 h',
    fin.dureeH === 22, 'reçu ' + fin.dureeH + ' h');
}

/* ─────────────────────────────────────────────────────────────────────────
   4. Nuit blanche complète : les deux dates civiles sont fusionnées
   ───────────────────────────────────────────────────────────────────────── */
console.log('\n4. la nuit blanche complète');
{
  const m = decorNuitBlanche();
  const v = m.a(H(14, 7, 30));
  verifie('une seule journée logique pour deux dates civiles',
    v.cles.length === 2 && v.traverseMinuit === true,
    JSON.stringify(v.cles));
  verifie('elle est toujours ouverte — une journée sans sommeil ne se ferme pas',
    v.ouvert === true && v.fin === null);
  verifie('aucun sommeil n\'a été inventé pour la fermer',
    v.sommeilOuvrant != null && v.sommeilOuvrant.fin === REVEIL_13 &&
    v.sommeilOuvrant.source === 'mesure');
  verifie('aucune journée vide n\'a été créée à 00 h 00',
    v.debut === REVEIL_13 && v.origine === 'sommeil');
}

/* ─────────────────────────────────────────────────────────────────────────
   5. Sommeil principal détecté puis réveil : NOUVELLE journée
   ───────────────────────────────────────────────────────────────────────── */
console.log('\n5. il s\'endort à 5 h 30, se réveille à 10 h');
{
  const m = decorNuitBlanche();
  const avant = m.a(H(14, 5, 0));
  /* Le bracelet a transmis la nuit : elle se range au jour du RÉVEIL. */
  journeeCivile(m, '2026-8-14', {
    kcal: 300, zones: [10, 20, 5, 0, 0, 0], couv: 190,
    sommeils: [nuit(ENDORMI_14, REVEIL_14)],
    night: { bedMin: 5 * 60 + 30, wakeMin: 10 * 60, sleepMin: 270, timeInBed: 270 }
  });
  const apres = m.a(H(14, 10, 30));
  verifie('une nouvelle journée logique est née',
    apres.id !== avant.id, 'avant ' + avant.id + ' · après ' + apres.id);
  verifie('elle commence au RÉVEIL, pas à l\'endormissement ni à minuit',
    apres.debut === REVEIL_14,
    'attendu 10:00, reçu ' + new Date(apres.debut).toTimeString().slice(0, 5));
  verifie('elle ne porte plus qu\'une date civile',
    apres.cles.length === 1 && apres.cles[0] === '2026-8-14',
    JSON.stringify(apres.cles));
  verifie('le sommeil qui l\'ouvre est bien celui qui vient d\'être mesuré',
    apres.sommeilOuvrant && apres.sommeilOuvrant.debut === ENDORMI_14);
  verifie('un sommeil court mais principal a suffi à séparer deux journées',
    apres.sommeilOuvrant.sleepMin === 270 && apres.origine === 'sommeil');
}

/* ─────────────────────────────────────────────────────────────────────────
   6. Une sieste dans la journée : PAS de reset
   ───────────────────────────────────────────────────────────────────────── */
console.log('\n6. une sieste dans l\'après-midi');
{
  const m = decorNuitBlanche();
  journeeCivile(m, '2026-8-14', {
    kcal: 300, zones: [10, 20, 5, 0, 0, 0], couv: 190,
    sommeils: [nuit(ENDORMI_14, REVEIL_14)],
    night: { bedMin: 5 * 60 + 30, wakeMin: 10 * 60, sleepMin: 270, timeInBed: 270 }
  });
  const avant = m.a(H(14, 13, 0));
  /* Une sieste de 14 h à 15 h 30, mesurée et classée `nap` par le moteur. */
  journeeCivile(m, '2026-8-14', {
    kcal: 300, zones: [10, 20, 5, 0, 0, 0], couv: 190,
    sommeils: [nuit(ENDORMI_14, REVEIL_14), sieste(H(14, 14, 0), H(14, 15, 30))],
    night: { bedMin: 5 * 60 + 30, wakeMin: 10 * 60, sleepMin: 270, timeInBed: 270 }
  });
  const apres = m.a(H(14, 16, 0));
  verifie('la sieste ne crée AUCUNE nouvelle journée',
    apres.id === avant.id, 'avant ' + avant.id + ' · après ' + apres.id);
  verifie('la journée reste ouverte par le sommeil principal du matin',
    apres.debut === REVEIL_14 && apres.sommeilOuvrant.debut === ENDORMI_14);
  verifie('une sieste de 90 min ne franchit pas la porte, même longue',
    apres.sommeilOuvrant.sleepMin === 270);
}

/* ─────────────────────────────────────────────────────────────────────────
   7. Vol de nuit et changement de fuseau : aucune nouvelle journée
   ───────────────────────────────────────────────────────────────────────── */
console.log('\n7. le vol de nuit, et le changement de fuseau');
{
  const m = decorNuitBlanche();
  const v = m.a(H(14, 0, 21));
  verifie('l\'identifiant est dérivé de l\'instant ABSOLU du réveil',
    v.id === 'jl-' + Math.round(REVEIL_13 / 1000),
    'reçu ' + v.id);
  /* Et la preuve, pas la promesse : le même décor rejoué dans un fuseau à
     l'autre bout du monde doit rendre le MÊME identifiant. C'est exactement ce
     que vit un téléphone après un Paris–Auckland. */
  let ailleurs = null;
  try {
    ailleurs = require('child_process')
      .execFileSync(process.execPath, [__filename, '--identifiant-seul'],
        { encoding: 'utf8',
          env: Object.assign({}, process.env,
            { TZ: 'Pacific/Auckland', FLINT_BANC_TZ: '1' }) })
      .trim();
  } catch (e) { ailleurs = 'ÉCHEC : ' + e.message; }
  verifie('à Auckland comme à Paris, la même journée porte le même identifiant',
    ailleurs === v.id, 'Paris ' + v.id + ' · Auckland ' + ailleurs);
  verifie('changer de date locale ne suffit pas à ouvrir une journée',
    v.origine === 'sommeil' && v.debut === REVEIL_13);
}

/* ─────────────────────────────────────────────────────────────────────────
   8. Rechargement de l'application après minuit
   ───────────────────────────────────────────────────────────────────────── */
console.log('\n8. l\'application est rechargée après minuit');
{
  const m1 = decorNuitBlanche();
  const avant = m1.a(H(14, 0, 21));
  /* Un rechargement, c'est un module NEUF sur le MÊME stockage. */
  const m2 = monde(m1.store);
  const apres = m2.a(H(14, 0, 22));
  verifie('la journée existante est retrouvée, pas recréée',
    apres.id === avant.id, 'avant ' + avant.id + ' · après ' + apres.id);
  verifie('elle ne repart pas de la date courante',
    apres.debut === REVEIL_13 && apres.cles.length === 2,
    'début reçu : ' + new Date(apres.debut).toString());
  verifie('les calories retrouvées sont toujours les 2 400 cumulées',
    m2.sandbox.flCaloriesJour(0) === 2400);
}

/* ─────────────────────────────────────────────────────────────────────────
   9. Redémarrage du téléphone
   ───────────────────────────────────────────────────────────────────────── */
console.log('\n9. le téléphone redémarre');
{
  const m1 = decorNuitBlanche();
  const avant = m1.a(H(14, 0, 21));
  /* Redémarrage : tout ce qui vivait en mémoire est perdu. Seul le stockage
     reste — et on va plus loin que le cas 8 : on retire aussi l'ancre écrite
     en base, pour prouver que l'identifiant se RECALCULE et ne se restaure
     pas. Une journée qui dépendrait d'un fichier serait une journée qu'un
     effacement peut faire disparaître. */
  const froid = Object.assign({}, m1.store);
  delete froid.flJourLogiqueAncre;
  const m2 = monde(froid);
  const apres = m2.a(H(14, 0, 25));
  verifie('même sans ancre en base, la journée retrouve son identifiant',
    apres.id === avant.id, 'avant ' + avant.id + ' · après ' + apres.id);
  verifie('parce qu\'il est DÉRIVÉ de la mesure, pas restauré',
    apres.id === 'jl-' + Math.round(REVEIL_13 / 1000));
  verifie('et la journée porte toujours ses deux dates',
    apres.cles.length === 2);

  /* La dérive des bornes : une nuit s'allonge quand les tranches arrivent en
     retard. Sous un quart d'heure, l'identifiant ne doit pas sauter. */
  const m3 = monde(m1.store);
  journeeCivile(m3, '2026-8-13', {
    kcal: 2100, zones: [30, 60, 20, 10, 0, 0], couv: 700,
    sommeils: [nuit(COUCHER_12, REVEIL_13 + 7 * 60000)],   // réveil recalé de 7 min
    night: { bedMin: 23 * 60 + 30, wakeMin: 8 * 60 + 7, sleepMin: 517, timeInBed: 517 },
    sessions: [{ start: '23:30', dur: 45, name: 'Sortie', int: 2 }],
    repas: [{ time: '20:15', name: 'Dîner', kcal: 900 }]
  });
  const derive = m3.a(H(14, 0, 30));
  verifie('une nuit recalée de 7 min n\'annonce pas une journée neuve',
    derive.id === avant.id, 'avant ' + avant.id + ' · après ' + derive.id);
}

/* ─────────────────────────────────────────────────────────────────────────
   10. Sommeil, récupération, effort, calories, activités : UNE seule frontière
   ───────────────────────────────────────────────────────────────────────── */
console.log('\n10. tout le monde lit la même frontière');
{
  const m = decorNuitBlanche();
  /* Un repas saisi APRÈS minuit : sans lui, le 14 août ne porterait aucune
     entrée et « les activités viennent des deux jours » passerait pour de
     mauvaises raisons — un jour vide ne prouve rien. */
  m.store['meals_2026-8-14'] = JSON.stringify([{ time: '00:10', name: 'Kebab', kcal: 700 }]);
  const j = m.a(H(14, 0, 21));
  m.videCarnet();

  m.sandbox.flCaloriesJour(0);
  m.sandbox.flZonesJourLogique(0);
  const entrees = m.sandbox.flEntreesJour(0);

  const attendu = JSON.stringify(j.cles);
  verifie('les calories lisent exactement les clés de la journée logique',
    JSON.stringify(m.lus.calories) === attendu,
    'lues : ' + JSON.stringify(m.lus.calories) + ' · attendu ' + attendu);
  verifie('l\'effort lit exactement les mêmes',
    JSON.stringify(m.lus.zones) === attendu,
    'lues : ' + JSON.stringify(m.lus.zones) + ' · attendu ' + attendu);
  const joursVus = [...new Set(entrees.map(e => e.jour))].sort();
  verifie('les activités viennent exactement des mêmes, des deux côtés de minuit',
    JSON.stringify(joursVus) === JSON.stringify(j.cles.slice().sort()) &&
    entrees.every(e => j.cles.indexOf(e.jour) >= 0),
    'lues : ' + JSON.stringify(joursVus) + ' · attendu ' + attendu);
  verifie('le kebab de 00 h 10 vient APRÈS la sortie de 23 h 30 de la veille',
    entrees.findIndex(e => e.nom === 'Sortie') < entrees.findIndex(e => e.nom === 'Kebab'),
    entrees.map(e => e.nom).join(' → '));
  verifie('le sommeil et la récupération s\'ancrent sur le jour du réveil',
    j.cleAncre === '2026-8-13' && j.cles[0] === j.cleAncre);
  verifie('personne ne peut se retrouver un jour plus loin qu\'un autre',
    m.lus.calories.length === m.lus.zones.length &&
    m.lus.calories.every((k, i) => k === m.lus.zones[i]));

  /* La source est UNIQUE : passer par la porte publique ou par le descripteur
     doit donner le même verdict, sinon deux modules pourraient diverger. */
  verifie('flJourLogiqueCles et flJourLogique ne peuvent pas se contredire',
    JSON.stringify(m.sandbox.flJourLogiqueCles(0)) === attendu);
  verifie('un jour PASSÉ, lui, reste civil — on ne réécrit pas l\'histoire',
    JSON.stringify(m.sandbox.flJourLogiqueCles(-3)) === JSON.stringify(['2026-8-11']),
    JSON.stringify(m.sandbox.flJourLogiqueCles(-3)));
}

/* ─────────────────────────────────────────────────────────────────────────
   LES REFUS — ce que le moteur n'a PAS le droit de faire
   ───────────────────────────────────────────────────────────────────────── */
console.log('\n11. ce qu\'il refuse de faire (aucune donnée inventée)');
{
  /* Base vide : aucun sommeil jamais mesuré. */
  const vide = monde();
  const v = vide.a(H(14, 0, 21));
  verifie('sans aucun sommeil mesuré, il ne FABRIQUE pas de journée',
    v.origine === 'inconnu' && v.id === null && v.debut === null,
    'origine ' + v.origine + ' · id ' + v.id);
  verifie('…et il dit pourquoi, au lieu de se taire',
    typeof v.raison === 'string' && v.raison.length > 0, v.raison);
  verifie('…en retombant sur le jour civil, sans le cacher',
    v.cles.length === 1 && v.cles[0] === '2026-8-14');

  /* Un trou de mesure : le bracelet est resté sur le chargeur trois jours.
     Prolonger la journée à travers ces jours reviendrait à AFFIRMER que
     personne n'a dormi. On n'en sait rien, et on le dit. */
  const trou = monde();
  journeeCivile(trou, '2026-8-10', {
    kcal: 2000, sommeils: [nuit(H(9, 23, 0), H(10, 7, 30))]
  });
  journeeCivile(trou, '2026-8-14', { kcal: 300 });
  const t = trou.a(H(14, 12, 0));
  verifie('un trou de mesure ne devient pas une journée de quatre jours',
    t.cles.length === 1 && t.cles[0] === '2026-8-14',
    JSON.stringify(t.cles));
  verifie('…et le jour manquant est NOMMÉ, pas passé sous silence',
    t.origine === 'reprise' && /aucune mesure le /.test(t.raison || ''), t.raison);

  /* Le jour COURANT n'est jamais mis en cause : à 00 h 21 le bracelet n'a pas
     encore synchronisé, et son silence ne prouve rien. */
  const muet = monde();
  journeeCivile(muet, '2026-8-13', {
    kcal: 2100, sommeils: [nuit(COUCHER_12, REVEIL_13)]
  });
  const mu = muet.a(H(14, 0, 21));
  verifie('un jour courant encore muet ne coupe pas la journée',
    mu.cles.length === 2 && mu.origine === 'sommeil',
    JSON.stringify(mu.cles) + ' · ' + mu.origine);

  /* Un sommeil qui n'est pas encore fini ne ferme rien. */
  const encours = decorNuitBlanche();
  journeeCivile(encours, '2026-8-14', {
    kcal: 300, sommeils: [nuit(ENDORMI_14, REVEIL_14)]
  });
  const e = encours.a(H(14, 7, 0));    // il dort encore : le réveil est dans le futur
  verifie('un sommeil dont le réveil est dans le futur n\'ouvre rien',
    e.debut === REVEIL_13,
    'début reçu ' + new Date(e.debut).toTimeString().slice(0, 5));
}

/* ─────────────────────────────────────────────────────────────────────────
   12. LES CINQ ÉCRANS PASSENT PAR LA MÊME PORTE
   ─────────────────────────────────────────────────────────────────────────
   Les cas 1 à 11 prouvent que la frontière est juste. Celui-ci prouve que
   personne ne s'en passe. C'est une vérification de SOURCE, et c'est voulu :
   `flSommeilData` et `flRecupData` traînent chacune des dizaines de
   dépendances, les découper ici testerait le harnais plus que le moteur. Ce
   qu'on veut empêcher est plus simple à énoncer — qu'une de ces fonctions
   retrouve un jour son ancien « recule d'un jour civil » pendant que les
   autres suivent la journée logique. Deux écrans, deux nuits, aucune erreur
   nulle part : c'est exactement la panne qu'on a déjà payée deux fois. */
console.log('\n12. les écrans passent tous par la source unique');
{
  const porte = [
    ['flAccueilData', "window.flAccueilData=function"],
    ['flSommeilData', "window.flSommeilData=function"],
    ['flRecupData', "window.flRecupData=function"],
    ['flVisiteContexte', "window.flVisiteContexte=function"],
    ['flEffortData', "window.flEffortData=function"]
  ];
  porte.forEach(([nom, amorce]) => {
    const i = SRC.indexOf(amorce);
    const corps = i < 0 ? '' : SRC.slice(i, i + 9000);
    verifie(nom + ' consulte la journée logique',
      i >= 0 && /flJourLogique|flEntreesJour|flEffortJour|flCaloriesJour|flZonesJourLogique/.test(corps),
      i < 0 ? 'fonction introuvable' : 'aucun appel trouvé dans son corps');
  });
  /* Et la formule d'effort n'est recopiée nulle part : elle vit à côté de ses
     coefficients calibrés, et la journée logique l'emprunte. */
  const nbFormule = (SRC.match(/FL_EFFORT_C\s*\*\s*Math\.log/g) || []).length;
  verifie('la formule d\'effort n\'existe qu\'à un seul endroit',
    nbFormule === 1, nbFormule + ' occurrence(s) de FL_EFFORT_C*Math.log');
}

console.log('\n' + ok + ' réussis, ' + ko + ' échoués\n');
process.exit(ko ? 1 : 0);
