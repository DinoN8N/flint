/* ═══════════════════════════════════════════════════════════════════════════
   L'EXPORT LISIBLE — les tables que quelqu'un peut ouvrir sans FLINT
   (30 août 2026)

   ═══ POURQUOI CE FICHIER EXISTE ═══════════════════════════════════════════

   Dino, en posant à côté l'export WHOOP de son propre compte : « il faudrait
   qu'il y ait un bouton Exporter mes données, et c'est censé donner des
   fichiers de ce calibre-là ».

   Ce que FLINT donnait jusqu'ici : UN fichier JSON, le vidage brut du
   localStorage. Il tient la promesse juridique (RGPD art. 20 : la donnée
   sort, dans un format ouvert) et il ne tient AUCUNE promesse d'usage. On y
   trouve `watch_2026-8-29` avec onze cent quarante-neuf couples de nombres et
   pas une en-tête ; personne n'ouvre ça dans un tableur, personne n'en fait
   une courbe, personne n'y lit sa propre nuit.

   Ce que WHOOP donne : quatre CSV nommés, avec des colonnes écrites en
   toutes lettres, une ligne par jour. On les ouvre dans Numbers et on
   comprend en trois secondes. C'est ce calibre-là qu'on vise.

   ═══ POURQUOI CÔTÉ WEB, ET PAS CÔTÉ SWIFT ═════════════════════════════════

   Parce que la moitié de ces colonnes n'est PAS stockée : elle se calcule.
   Le score de sommeil est `flScoreSommeil` (v2063), la régularité est
   `flRegulariteNuit`, l'effort est `loadStrain`, les calories sont
   `caloriesBurned`, la nuit en mode coquille est `sensorOf` surchargé qui la
   DÉDUIT de `watch_`. Réécrire tout ça en Swift, ce serait la seconde vérité
   que le projet refuse depuis la v1558 — et le premier jour où une formule
   bouge, l'export dirait autre chose que l'écran. Ici, l'export appelle
   exactement les fonctions que les écrans appellent. Il ne peut donc pas
   diverger : c'est le même chiffre, servi deux fois.

   Le natif garde ce qui est de son ressort : écrire les fichiers, les
   empaqueter, ouvrir la feuille de partage. Il ne calcule rien.

   ═══ CE QUE L'EXPORT N'INVENTE JAMAIS ═════════════════════════════════════

   Une case vide est une case VIDE, jamais un zéro. C'est la règle « donnée
   absente = — » des CONVENTIONS, transposée au tableur : un 0 dans une
   colonne « Variabilité (ms) » entrerait dans les moyennes de qui lira le
   fichier, et fabriquerait une fausse mesure à partir d'une absence.

   Et un jour sans une seule mesure ne produit AUCUNE ligne. La leçon vient de
   `outils/exporter-donnees.sh` : sur le téléphone de Dino, 230 clés sur 269
   valaient `null` — dont huit dates À VENIR, créées par du pré-remplissage.
   Un export qui les sort annonce « 233 jours de données » quand douze
   seulement ont été mesurés.

   ═══ DEUX PORTES ══════════════════════════════════════════════════════════

   `flExportInventaire()` — l'inventaire seul, sans construire un octet de
   CSV. C'est ce que la page « Tes données » affiche à l'ouverture : combien
   de jours, de nuits, de séances, depuis quand. Il doit rester INSTANTANÉ,
   donc il ne lit que les longueurs, jamais les valeurs.

   `flExportTables()` — les tables complètes. Coûteux (il rejoue tous les
   scores de tous les jours), appelé une seule fois, au geste.

   Les deux rendent une CHAÎNE JSON : c'est ce que `evaluateJavaScript` sait
   ramener sans surprise de typage.
   ═══════════════════════════════════════════════════════════════════════════ */

/* ── Les outils du CSV ────────────────────────────────────────────────────── */

/* La virgule est notre séparateur, comme chez WHOOP. Tout champ qui en
   contient une — un nom de repas, une note — se met entre guillemets, et ses
   guillemets à lui se doublent. C'est RFC 4180, et c'est ce que Numbers,
   Excel et LibreOffice lisent tous les trois sans réglage. */
function flExpEch(v) {
  if (v === null || v === undefined || v === '') return '';
  var s = String(v);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function flExpCsv(entetes, lignes) {
  var out = [entetes.join(',')], i;
  for (i = 0; i < lignes.length; i++) out.push(lignes[i].map(flExpEch).join(','));
  return out.join('\n') + '\n';
}

/* Un nombre, ou rien. `null`, `undefined` et `NaN` rendent la chaîne vide —
   c'est la règle « une absence n'est pas un zéro », tenue à la source. */
function flExpN(v, dec) {
  if (v === null || v === undefined) return '';
  var n = +v;
  if (!isFinite(n)) return '';
  return dec ? String(+n.toFixed(dec)) : String(Math.round(n));
}

/* Un booléen à la WHOOP : « true » / « false », en toutes lettres. */
function flExpB(v) { return v === true ? 'true' : v === false ? 'false' : ''; }

/* Une clé de jour (`2026-8-9`, sans zéros — le format de `tk()`) devient la
   date ISO que tout tableur sait trier. */
function flExpDate(K) {
  var p = String(K).split('-');
  if (p.length !== 3) return String(K);
  return p[0] + '-' + ('0' + p[1]).slice(-2) + '-' + ('0' + p[2]).slice(-2);
}

function flExpMs(K) {
  var p = String(K).split('-');
  return new Date(+p[0], (+p[1]) - 1, +p[2]).getTime();
}

/* Minute du jour → « HH:MM ». Elle se replie sur 24 h : une minute négative ou
   au-delà de 1439 appartient au jour d'à côté, et c'est l'appelant qui décide
   duquel — pas ce formateur. */
function flExpHM(min) {
  if (min === null || min === undefined || !isFinite(+min)) return '';
  var m = ((Math.round(+min) % 1440) + 1440) % 1440;
  return ('0' + Math.floor(m / 60)).slice(-2) + ':' + ('0' + (m % 60)).slice(-2);
}

/* Une date + une minute du jour → l'horodatage complet « AAAA-MM-JJ HH:MM ».
   `decalJour` déplace la date, et c'est là qu'est toute la subtilité du
   coucher : une nuit rangée au 29 août dont le coucher vaut 23:40 s'est
   couchée le 28. Le coucher qui dépasse le lever appartient à la veille. */
function flExpHorodate(K, min, decalJour) {
  if (min === null || min === undefined || !isFinite(+min)) return '';
  var j = flExpDate(decalJour ? flExpDecal(K, decalJour) : K);
  return j + ' ' + flExpHM(min);
}

/* ── Le fuseau d'un jour ──────────────────────────────────────────────────── */

/* WHOOP porte une colonne « Fuseau horaire du cycle » ; nous n'en avions
   aucune. Le LISEZ-MOI disait « les heures sont locales » sans jamais dire
   LESQUELLES — et l'archive de Dino du 2 septembre contient des journées à
   UTC+04:00 et des journées à UTC+02:00. Qui la relit dans un tableur voit
   deux levers à 07:30 qui ne sont pas le même instant, et rien ne l'en avertit.

   L'INFORMATION EXISTE DÉJÀ ET ON NE FAIT QUE LA SERVIR. `flPoserFuseauCourant`
   l'écrit au moment de l'enregistrement (`watch_<K>.tz`), et c'est le seul
   moment où elle est CONNUE. On ne la recalcule pas ici, surtout pas depuis le
   fuseau du lecteur : la règle de flint-fuseau.js est qu'un décalage inconnu
   ne se remplit jamais, et une case vide est un état légitime.

   Le format est celui de WHOOP — « UTC+02:00 » — pour que les deux fichiers
   posés côte à côte se lisent de la même façon. */
function flExpFuseau(K) {
  return flExpSur(function () {
    return (typeof flFuseauDe === 'function') ? flFuseauDe(K) : null;
  }, null);
}

function flExpFuseauTxt(f) {
  if (!f || typeof f.off !== 'number' || !isFinite(f.off)) return '';
  var m = Math.round(f.off), a = Math.abs(m);
  return 'UTC' + (m < 0 ? '-' : '+')
       + ('0' + Math.floor(a / 60)).slice(-2) + ':' + ('0' + (a % 60)).slice(-2);
}

/* Le rang d'un jour par rapport à aujourd'hui — négatif dans le passé. Deux
   fonctions du moteur (`flSpo2Nuit`) raisonnent en DÉCALAGE et non en clé :
   c'est leur signature, on la sert plutôt que de recopier leur calcul. Le
   quotient est arrondi et non tronqué, parce qu'un passage à l'heure d'hiver
   fabrique une journée de vingt-cinq heures. */
function flExpOffset(K) {
  var auj = flExpSur(function () { return flExpMs(tk(0)); }, null);
  if (auj === null) return null;
  return Math.round((flExpMs(K) - auj) / 86400000);
}

function flExpDecal(K, n) {
  var p = String(K).split('-'), d = new Date(+p[0], (+p[1]) - 1, +p[2]);
  d.setDate(d.getDate() + n);
  return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
}

/* ── Les jours que la base porte vraiment ─────────────────────────────────── */

/* On ramasse les clés de jour de TOUTES les familles, puis on jettera celles
   qui ne portent rien. Le futur est refusé ici, en amont : une date à venir
   dans un export de santé n'est pas une donnée, c'est une trace de
   pré-remplissage. */
/* ⚠️ v2528 — « DEMAIN » TOLÉRAIT DEMAIN, et c'est le calendrier qui l'a dit.
   La borne valait `Date.now() + 24 h` : une clé datée du lendemain tombait
   AVANT elle et sortait dans l'export. Invisible tant que le banc datait son
   jour à venir à plus d'un jour ; rouge le 19 septembre 2026, quand sa date
   `2026-9-20` est devenue « demain ». Un commentaire qui dit « le futur est
   refusé ici » et un code qui en laisse passer vingt-quatre heures : c'est le
   commentaire qui avait raison. La borne est désormais MINUIT CE SOIR, dérivée
   de la clé du jour — jamais de l'horloge, qui dérive avec le fuseau. */
function flExpJours() {
  var vus = {}, i, k, m, a = [];
  var minuitCeSoir = flExpSur(function () { return flExpMs(tk(0)); }, null);
  var demain = (minuitCeSoir === null ? Date.now() : minuitCeSoir) + 86400000;
  var FAM = /^(watch|sensor|sessions|meals|recov|sante|journal|hrfine)_(\d{4}-\d{1,2}-\d{1,2})$/;
  try {
    for (i = 0; i < localStorage.length; i++) {
      k = localStorage.key(i);
      if (!k) continue;
      m = FAM.exec(k);
      if (!m) continue;
      if (localStorage.getItem(k) === 'null') continue;   /* un calcul qui n'a pas eu lieu */
      vus[m[2]] = 1;
    }
  } catch (e) { }
  for (k in vus) {
    if (!Object.prototype.hasOwnProperty.call(vus, k)) continue;
    if (flExpMs(k) >= demain) continue;
    a.push(k);
  }
  /* Le plus récent en premier — c'est l'ordre de WHOOP, et c'est celui qu'on
     veut : on ouvre un export pour regarder hier, pas l'an dernier. */
  a.sort(function (x, y) { return flExpMs(y) - flExpMs(x); });
  return a;
}

/* Les appels au moteur passent tous par ici : une formule qui lève ne doit
   jamais emporter l'export entier. Une colonne vide se lit ; un fichier
   absent, non. */
function flExpSur(f, repli) {
  try { var v = f(); return (v === undefined) ? repli : v; } catch (e) { return repli; }
}

/* La nuit d'un jour, telle que les ÉCRANS la voient — `sensorOf`, pas
   `DB.get('sensor_')`. En mode coquille la nuit n'est pas stockée : elle est
   déduite de `watch_` par la surcharge de `sensorOf`. Lire la clé en dur
   rendrait un export vide sur le seul appareil qui compte, le téléphone. */
function flExpNuit(K) {
  return flExpSur(function () {
    return (typeof sensorOf === 'function') ? sensorOf(K) : null;
  }, null);
}

function flExpMontre(K) {
  return flExpSur(function () { return DB.get('watch_' + K, null); }, null);
}

/* ── La ligne d'un jour ───────────────────────────────────────────────────── */

/* Tout ce qu'un jour sait de lui-même, ramassé UNE fois. Les deux tables
   « cycles » et « sommeil » y puisent : recalculer deux fois un score de
   sommeil sur cent quatre-vingts jours se paierait en secondes d'attente pour
   exactement le même chiffre. */
function flExpJour(K) {
  var n = flExpNuit(K) || null;
  var w = flExpMontre(K) || null;
  var nuitDeMontre = (w && w.night) ? w.night : null;

  /* ⚠️ DEUX FONCTIONS PORTENT LE MOT « BESOIN », ET ELLES NE DISENT PAS LA
     MÊME CHOSE. `flBesoinJour` rend la recommandation d'âge, gelée par jour
     (480 min chez Dino, invariable). `flBesoinNuitDuJour` rend le besoin de
     CETTE nuit-là : la base, plus la dette des quatorze nuits précédentes,
     plus l'effort de la veille — c'est celui que `flScoreSommeil` divise.
     La première version de cet export lisait la première ; la comparaison
     WHOOP du 31 août l'a prise en flagrant délit, parce qu'une ligne se
     contredisait elle-même : « dormi 367 · besoin 480 · couverture 61 % »,
     alors que 367/480 fait 76 %. Vingt-cinq nuits sur trente étaient dans ce
     cas, et la dette qui en découlait était fausse d'autant. C'est
     exactement le défaut de la v1769 (« l'écran affichait 5,6 h dormies sur
     10,1 h de besoin »), reparu par la porte de l'export. */
  var besoin = flExpSur(function () {
    if (typeof flBesoinNuitDuJour === 'function') {
      var b = flBesoinNuitDuJour(K);
      if (b && b.min > 0) return b.min;
    }
    return (typeof flBesoinJour === 'function') ? flBesoinJour(K).min : null;
  }, null);

  var sc = flExpSur(function () {
    return (typeof flScoreSommeil === 'function') ? flScoreSommeil(K) : null;
  }, null);

  var regul = flExpSur(function () {
    return (typeof flRegulariteNuit === 'function') ? flRegulariteNuit(K) : null;
  }, null);

  /* L'efficacité vient de la nuit, pas d'une règle de trois refaite ici :
     `sleepNight` la pose avec les mêmes arrondis que l'écran « Ma nuit ». */
  var sn = flExpSur(function () {
    return (typeof sleepNight === 'function') ? sleepNight(K) : null;
  }, null);

  var dormi = n && n.sleepMin != null ? n.sleepMin : null;
  var eveil = n && n.awake != null ? n.awake : null;
  var auLit = n && n.timeInBed != null ? n.timeInBed
            : (dormi != null && eveil != null ? dormi + eveil : null);
  var eff = (sn && sn.efficiency != null) ? sn.efficiency
          : (dormi != null && eveil != null && (dormi + eveil) > 0
             ? Math.round(dormi / (dormi + eveil) * 100) : null);

  var coucher = n && n.bedMin != null ? n.bedMin : (sn ? sn.bedMin : null);
  var lever   = n && n.wakeMin != null ? n.wakeMin : (sn ? sn.wakeMin : null);
  /* Le coucher d'après le lever s'est produit la veille. Sans cette ligne, une
     nuit 23:40 → 07:10 s'écrivait « couché à 23:40, levé à 07:10 le même
     jour », soit un sommeil de moins seize heures pour qui fait la
     soustraction. */
  var coucherVeille = (coucher != null && lever != null && coucher > lever) ? -1 : 0;

  return {
    K: K,
    nuit: n, montre: w, nuitMontre: nuitDeMontre,
    /* Le fuseau du jour, lu UNE fois : les trois tables qui portent des heures
       de cadran le servent, et aucune ne le recalcule pour son compte. */
    fuseau: flExpFuseau(K),
    besoin: besoin,
    score: sc && sc.score != null ? sc.score : null,
    couverture: sc && sc.couverture != null ? sc.couverture : null,
    regul: regul,
    dormi: dormi, eveil: eveil, auLit: auLit, eff: eff,
    coucher: coucher, lever: lever, coucherVeille: coucherVeille,
    dette: (besoin != null && dormi != null) ? Math.max(0, besoin - dormi) : null,
    reveils: sn && sn.wakeEvents != null ? sn.wakeEvents : null,
    /* La température de peau de la nuit s'appelle `tempNuit` dans la nuit
       servie par la coquille (médiane des lectures entre coucher et lever,
       filtrées 32-38 °C) ; `skinTemp` est le nom des nuits semées et de la
       saisie manuelle. On accepte les deux plutôt que d'en privilégier un :
       l'export doit lire les nuits de TOUTES les provenances. */
    temp: (n && n.tempNuit != null) ? n.tempNuit
        : (n && n.skinTemp != null) ? n.skinTemp : null,
    /* La SpO2 de la nuit se calcule (médiane bornée, douze lectures minimum)
       et ne se range pas. `flSpo2Nuit` raisonne en décalage de jours — c'est
       sa signature, on la sert telle quelle. */
    spo2: (n && n.spo2 != null) ? n.spo2 : flExpSur(function () {
      var o = flExpOffset(K);
      return (o != null && o <= 0 && typeof window.flSpo2Nuit === 'function')
        ? window.flSpo2Nuit(o) : null;
    }, null),
    recup: flExpSur(function () { var r = DB.get('recov_' + K, null); return r == null ? null : +r; }, null),
    effort: flExpSur(function () { return (typeof loadStrain === 'function') ? loadStrain(K) : null; }, null),
    kcal: flExpSur(function () { return (typeof caloriesBurned === 'function') ? caloriesBurned(K) : null; }, null),
    pas: flExpSur(function () { return (typeof flStepsOf === 'function') ? flStepsOf(K) : null; }, null),
    seances: flExpSur(function () { return DB.get('sessions_' + K, []) || []; }, []),
    repas: flExpSur(function () { return DB.get('meals_' + K, []) || []; }, []),
    journal: flExpSur(function () { return DB.get('journal_' + K, null); }, null)
  };
}

/* Un jour qui ne porte RIEN ne fait pas de ligne. « Rien », ici, c'est
   littéral : ni nuit, ni récupération, ni séance, ni repas, ni pas, ni
   battement. Un jour où l'app a seulement été ouverte n'est pas un jour de
   données. */
function flExpPorteQuelqueChose(J) {
  if (J.dormi != null || J.recup != null) return true;
  if (J.seances && J.seances.length) return true;
  if (J.repas && J.repas.length) return true;
  if (J.pas > 0) return true;
  if (J.montre && ((J.montre.hr && J.montre.hr.length) || J.montre.kcal > 0)) return true;
  return false;
}

/* ── La distance et l'énergie Apple d'un jour ─────────────────────────────── */

/* `sante_<jour>` est le SECOND podomètre : celui de l'iPhone, par tranches de
   cinq minutes. Ses séries sont des couples [minute de fin de tranche,
   valeur] — on somme, on ne moyenne pas. */
function flExpSomme(serie) {
  if (!serie || !serie.length) return null;
  var t = 0, i;
  for (i = 0; i < serie.length; i++) if (isFinite(+serie[i][1])) t += +serie[i][1];
  return t;
}

/* ── Table 1 : les cycles physiologiques, une ligne par jour ──────────────── */

var FLEXP_CYCLES = [
  'Date',
  'Fuseau horaire',
  'Source du fuseau',
  'Score de récupération %',
  'Fréquence cardiaque au repos (bpm)',
  'Variabilité de la fréquence cardiaque (ms)',
  'Source de la variabilité',
  'Fréquence respiratoire (/min)',
  /* La respiration se lit dans les intervalles entre battements, qui
     s'archivent à sept jours : la colonne s'arrête donc là où le résumé figé
     de la nuit commence, et une case vide plus ancienne ne se remplira JAMAIS.
     Sans cette colonne-ci, ce vide-là est indiscernable d'un bracelet non
     porté — deux absences qui n'ont rien à voir sous le même tiret. */
  'Source de la respiration',
  'Température cutanée (Celsius)',
  "Niveau d'oxygène %",
  'Effort du jour',
  'Dépense énergétique (cal.)',
  'FC moyenne (bpm)',
  'FC max. (bpm)',
  'Pas',
  'Distance (km)',
  'Score de sommeil %',
  'Couverture du besoin %',
  'Coucher',
  'Lever',
  'Durée du sommeil (min)',
  'Temps passé au lit (min)',
  'Durée du sommeil léger (min)',
  'Durée du sommeil profond (min)',
  'Durée du sommeil paradoxal (min)',
  "Temps d'éveil (min)",
  'Réveils nocturnes',
  'Besoin en sommeil (min)',
  'Dette de sommeil (min)',
  'Efficacité du sommeil %',
  'Régularité du sommeil %'
];

/* ═══ LE MAXIMUM SE LIT SUR LE CANAL FIN, LA MOYENNE SUR LE CANAL MINUTE ═══
   Et ce n'est pas une préférence, ce sont deux grandeurs de nature différente.

   UN MAXIMUM EST UN INSTANT. Le canal minute est une valeur par minute : une
   pointe de trente secondes n'y existe tout simplement pas. Mesuré le 31 août
   contre l'export WHOOP, sur les cycles réellement couverts : le maximum lu à
   la minute est à −10,0 bpm de WHOOP, celui lu à cinq secondes à −3,2, et
   l'écart médian passe de 11 à 6 bpm.

   UNE MOYENNE EST UNE DURÉE, et c'est pourquoi elle NE bouge PAS de canal.
   La montre échantillonne presque deux fois plus densément à l'effort qu'au
   repos : moyenner les points du canal fin donnerait à chaque minute d'effort
   le poids d'une minute et demie de repos. C'est la panne de la v1663, prouvée
   sans WHOOP par `test-densite-temps.js` — la même physiologie rendait 135 ou
   158 selon la seule densité. Le canal minute est régulier, donc sa moyenne
   est une vraie moyenne temporelle : on la garde. */
function flExpMaxFin(K, mxMinute) {
  return flExpSur(function () {
    var f = DB.get('hrfine_' + K, null);
    if (!f || typeof f !== 'object') return mxMinute;
    var mx = mxMinute, cle, serie, i, v;
    for (cle in f) {
      if (!Object.prototype.hasOwnProperty.call(f, cle)) continue;
      serie = f[cle];
      if (!serie || !serie.length) continue;
      for (i = 0; i < serie.length; i++) {
        /* 44 entrées sur 114 853 de la base du 31 août sont un nombre nu au
           lieu d'un couple [seconde, bpm] : on les laisse passer sans lever. */
        v = (serie[i] && serie[i].length === 2) ? +serie[i][1] : NaN;
        if (isFinite(v) && v > 0 && (mx === null || v > mx)) mx = v;
      }
    }
    return mx;
  }, mxMinute);
}

function flExpLigneCycle(J) {
  var n = J.nuit || {}, w = J.montre || {}, nm = J.nuitMontre || {};
  var hr = w.hr || [], i, mx = null, tot = 0, cnt = 0;
  for (i = 0; i < hr.length; i++) {
    var v = +hr[i][1];
    if (!isFinite(v) || v <= 0) continue;
    if (mx === null || v > mx) mx = v;
    tot += v; cnt++;
  }
  mx = flExpMaxFin(J.K, mx);
  var sa = flExpSur(function () { return DB.get('sante_' + J.K, null); }, null);
  var distM = sa ? flExpSomme(sa.dist) : null;

  return [
    flExpDate(J.K),
    flExpFuseauTxt(J.fuseau),
    (J.fuseau && J.fuseau.src) || '',
    flExpN(J.recup),
    flExpN(n.rhr),
    flExpN(n.hrv, 1),
    n.hrvSrc || (nm.vfcNuit && nm.vfcNuit.src) || '',
    flExpN(n.resp, 1),
    n.respSrc || (nm.respNuit && nm.respNuit.src) || '',
    flExpN(J.temp, 2),
    flExpN(J.spo2),
    flExpN(J.effort, 1),
    flExpN(J.kcal),
    flExpN(cnt ? tot / cnt : null),
    flExpN(mx),
    flExpN(J.pas > 0 ? J.pas : null),
    flExpN(distM != null ? distM / 1000 : null, 2),
    flExpN(J.score),
    flExpN(J.couverture),
    flExpHorodate(J.K, J.coucher, J.coucherVeille),
    flExpHorodate(J.K, J.lever, 0),
    flExpN(J.dormi),
    flExpN(J.auLit),
    flExpN(n.light),
    flExpN(n.deep),
    flExpN(n.rem),
    flExpN(J.eveil),
    flExpN(J.reveils),
    flExpN(J.besoin),
    flExpN(J.dette),
    flExpN(J.eff),
    flExpN(J.regul)
  ];
}

/* ── Table 2 : le sommeil seul, avec ce qui dit d'où il vient ─────────────── */

var FLEXP_SOMMEIL = [
  'Date',
  'Fuseau horaire',
  'Coucher',
  'Lever',
  'Score de sommeil %',
  'Couverture du besoin %',
  'Fréquence respiratoire (/min)',
  'Source de la respiration',
  'Durée du sommeil (min)',
  'Temps passé au lit (min)',
  'Durée du sommeil léger (min)',
  'Durée du sommeil profond (min)',
  'Durée du sommeil paradoxal (min)',
  "Temps d'éveil (min)",
  'Réveils nocturnes',
  'Besoin en sommeil (min)',
  'Dette de sommeil (min)',
  'Efficacité du sommeil %',
  'Régularité du sommeil %',
  'Variabilité de la fréquence cardiaque (ms)',
  'Fréquence cardiaque au repos (bpm)',
  'FC la plus basse (bpm)',
  'Source de la mesure',
  'Couverture cardiaque de la nuit %',
  'Moteur de stades'
];

function flExpLigneSommeil(J) {
  var n = J.nuit || {}, nm = J.nuitMontre || {};
  return [
    flExpDate(J.K),
    flExpFuseauTxt(J.fuseau),
    flExpHorodate(J.K, J.coucher, J.coucherVeille),
    flExpHorodate(J.K, J.lever, 0),
    flExpN(J.score),
    flExpN(J.couverture),
    flExpN(n.resp, 1),
    n.respSrc || (nm.respNuit && nm.respNuit.src) || '',
    flExpN(J.dormi),
    flExpN(J.auLit),
    flExpN(n.light),
    flExpN(n.deep),
    flExpN(n.rem),
    flExpN(J.eveil),
    flExpN(J.reveils),
    flExpN(J.besoin),
    flExpN(J.dette),
    flExpN(J.eff),
    flExpN(J.regul),
    flExpN(n.hrv, 1),
    flExpN(n.rhr),
    flExpN(n.lowestHr),
    n.source || nm.source || '',
    flExpN(nm.hrCoverage),
    nm.stageSrc || ''
  ];
}

/* ── Table 3 : les activités ──────────────────────────────────────────────── */

var FLEXP_ACTIVITES = [
  'Date',
  'Fuseau horaire',
  "Heure de début de l'activité",
  "Heure de fin de l'activité",
  'Durée (min)',
  "Nom de l'activité",
  'Intensité (1-3)',
  'Dépense énergétique (cal.)',
  'FC max. (bpm)',
  'FC moyenne (bpm)',
  'Pas',
  'Zone FC 0 %', 'Zone FC 1 %', 'Zone FC 2 %',
  'Zone FC 3 %', 'Zone FC 4 %', 'Zone FC 5 %',
  'Couverture cardiaque %',
  'FC jugée fiable',
  'Détection automatique',
  'Source'
];

/* Le temps passé dans chaque zone, calculé comme la fiche d'activité le
   calcule : mêmes bornes (`flZonesFiche`, figées par jour depuis la v2064) et
   même pondération par le TEMPS (`flZonesTemporelles`), pas par le nombre
   d'échantillons — la montre échantillonne presque deux fois plus densement à
   l'effort qu'au repos, et compter les points gonflerait les zones hautes de
   près de la moitié. */
/* ═══ 14 sept. 2026 — L'EXPORT COMPTAIT LES ARRÊTS, L'ÉCRAN NON ══════════
   Depuis que la fenêtre d'une séance au tracker va jusqu'à sa FIN RÉELLE, arrêt
   compris, cette fonction lisait le mur entier. Mesuré sur le cas du banc : la
   fiche rendait 155 bpm et le fichier 123 — **32 bpm d'écart entre l'écran et
   l'export pour la MÊME séance**. C'est exactement la variante réfutée, rouverte
   sur ce seul chemin, et ce fichier porte déjà en v2353 la note d'avoir payé
   cette classe d'écart (34 activités sur 57, jusqu'à 14 points).
   Les arrêts voyagent donc jusqu'ici, et leurs minutes sortent des deux chemins :
   la série canonique les reçoit, et le repli à la minute les saute. */
function flExpZones(K, montre, deb, fin, pauses) {
  var vide = ['', '', '', '', '', ''];
  if (!montre || !montre.hr || !montre.hr.length) return vide;
  if (deb == null || fin == null) return vide;
  if (typeof window.flZonesFiche !== 'function') return vide;
  if (typeof window.flZonesTemporelles !== 'function') return vide;

  /* ═══ v2352 — LA MÊME FENÊTRE QUE LA FICHE, C'EST-À-DIRE SEMI-OUVERTE ═════
     L'en-tête ci-dessus promet « calculé comme la fiche d'activité le calcule ».
     La fiche filtre par `flDansFenetre(m, d, f)` — `m >= d && m < f` depuis la
     v1743 — et l'export comparait `m <= fin` : la minute de la FIN entrait dans
     les zones exportées, jamais dans celles de l'écran. Une activité de N
     minutes y consommait N+1 minutes de cardio (mesuré v1743 : 52/51, 31/30,
     249/248, 55/54), et la même séance sortait donc avec deux répartitions
     selon qu'on la regardait ou qu'on l'exportait. `flDansFenetre` vit dans
     index.html, chargé avant ce fichier ; le repli littéral garde l'export
     jouable au banc, où seul ce fichier est évalué. */
  /* ═══ v2353 — LA MÊME SÉRIE QUE LA FICHE, PAS UNE SECONDE COPIE ═══════════
     La fenêtre était déjà réparée (v2352, semi-ouverte) ; la SÉRIE, non. La
     fiche lit `flSerieCanonique` — la série fine des cinq secondes quand elle
     est jugée fiable, sinon celle de la minute NETTOYÉE par `flHrPropre` — et
     l'export lisait `montre.hr` brut. Mesuré sur la base de Dino du 9 sept.,
     57 activités : 34 sortaient avec d'autres zones que leur fiche, jusqu'à
     14 points d'écart (Randonnée du 3 sept. : zone 2 à 14 % à l'écran, 0 % dans
     le fichier). 47 fiches sur 57 se lisent sur `hrfine` — que l'export ne
     consultait jamais.

     LE REPLI RESTE, ET IL EST DÉCLARÉ. `flSerieCanonique` vit dans le bloc
     `if(SHELL)` d'index.html : hors de la coquille — un banc, un navigateur —
     elle n'existe pas, et l'ancien chemin reprend la main. Il vaut ce qu'il
     vaut, mais il rend un fichier plutôt qu'une colonne vide. */
  var pts = null;
  if (typeof window.flSerieCanonique === 'function') {
    var sc = window.flSerieCanonique(K, deb, fin, pauses);
    /* ═══ LE MÊME PLANCHER QUE LA FICHE : CINQ MINUTES MESURÉES ═════════════
       `flSerieCanonique` accepte trois points à la minute ; la fiche, elle, en
       exige cinq et refuse sinon toute courbe — « Séance trop courte pour une
       courbe : la montre mesure une fois par minute, et il en faut cinq ».
       Sans ce plancher ici, l'export écrivait une répartition que l'écran se
       refusait à donner : la Course du 29 août (trois minutes, trois points)
       sortait « Zone FC 0 % = 100 » pendant que sa fiche disait n'avoir rien
       mesuré. Un chiffre que l'app refuse d'afficher n'a pas à partir dans un
       fichier — c'est la règle « donnée absente = — », et un CSV la rend plus
       crédible encore qu'un écran. La série fine, elle, garde son seuil : ses
       points ne sont pas des minutes. */
    if (sc && sc.pts && sc.pts.length && !(sc.source === 'minute' && sc.pts.length < 5)) {
      pts = sc.pts.filter(function (p) { return +p[1] > 0; });
    } else if (sc && sc.source === 'minute') {
      return vide;
    }
  }
  if (!pts) {
    var dans = (typeof window.flDansFenetre === 'function')
      ? window.flDansFenetre
      : function (m, d, f) { return m >= d && m < f; };
    /* Les minutes d'arrêt ne sont pas de l'effort : même retrait que la fiche. */
    var _ps = (typeof window.flPausesDe === 'function') ? window.flPausesDe(pauses) : null;
    var enPause = (typeof window.flEnPause === 'function')
      ? function (m) { return window.flEnPause(m, _ps); }
      : function () { return false; };
    pts = [];
    var i, hr = montre.hr;
    for (i = 0; i < hr.length; i++) {
      var m = +hr[i][0];
      if (dans(m, deb, fin) && +hr[i][1] > 0 && !enPause(m)) pts.push([m * 60, +hr[i][1]]);
    }
  }
  if (pts.length < 2) return vide;

  var bornes = window.flZonesFiche(K);
  if (!bornes || !bornes.length) return vide;
  var acc = window.flZonesTemporelles(pts, bornes);
  if (!acc || !acc.length) return vide;

  var total = 0;
  for (i = 0; i < acc.length; i++) total += acc[i].sec;
  if (!total) return vide;

  var out = ['', '', '', '', '', ''];
  for (i = 0; i < acc.length; i++) {
    var z = acc[i].z;
    if (z >= 0 && z <= 5) out[z] = flExpN(acc[i].sec / total * 100);
  }
  return out;
}

function flExpLignesActivites(J) {
  var out = [], i, s, zones;
  for (i = 0; i < J.seances.length; i++) {
    s = J.seances[i] || {};
    zones = flExpZones(J.K, J.montre, s.startMin, s.endMin, s.pauses);
    out.push([
      flExpDate(J.K),
      flExpFuseauTxt(J.fuseau),
      flExpHorodate(J.K, s.startMin != null ? s.startMin : null, 0),
      flExpHorodate(J.K, s.endMin != null ? s.endMin : null, 0),
      flExpN(s.dur),
      s.name || '',
      flExpN(s.int),
      flExpN(s.kcal),
      flExpN(s.maxHr),
      flExpN(s.avgHr),
      flExpN(s.pas),
      zones[0], zones[1], zones[2], zones[3], zones[4], zones[5],
      flExpN(s.couvHR != null ? s.couvHR * 100 : null),
      flExpB(s.fcFiable),
      flExpB(s.auto),
      s.source || s.capteur || ''
    ]);
  }
  return out;
}

/* ── Table 4 : le journal du soir ─────────────────────────────────────────── */

/* Le format de WHOOP, à la lettre : une ligne par QUESTION et par jour, pas
   une colonne par question. C'est ce qui permet d'ajouter une question un
   jour sans casser tous les fichiers déjà exportés. */
var FLEXP_JOURNAL = ['Date', 'Texte de la question', 'A répondu oui', 'Notes'];

/* Les précisions accrochées à une réponse (l'heure du dernier café, le nombre
   de verres) sont la colonne « Notes ». Elles vivent dans la même fiche que la
   réponse, sous les clés déclarées par `JQ`. */
function flExpNoteJournal(q, d) {
  if (!q.sub || !q.sub.length) return '';
  var bouts = [], i, s, v;
  for (i = 0; i < q.sub.length; i++) {
    s = q.sub[i];
    v = d[s.k];
    if (v === null || v === undefined) continue;
    bouts.push(s.q + ' : ' + (s.t === 'time' ? flExpHM(v) : String(v)));
  }
  return bouts.join(' · ');
}

function flExpLignesJournal(J) {
  var out = [], d = J.journal, i, q;
  if (!d || typeof d !== 'object') return out;
  if (typeof JQ === 'undefined' || !JQ || !JQ.length) return out;
  for (i = 0; i < JQ.length; i++) {
    q = JQ[i];
    if (d[q.k] === undefined) continue;      /* question jamais touchée : pas de ligne */
    out.push([flExpDate(J.K), q.q, flExpB(d[q.k] === true), flExpNoteJournal(q, d)]);
  }
  return out;
}

/* ── Table 5 : les repas ──────────────────────────────────────────────────── */

var FLEXP_REPAS = ['Date', 'Heure', 'Aliment', 'Calories (cal.)',
                   'Protéines (g)', 'Glucides (g)', 'Lipides (g)'];

function flExpLignesRepas(J) {
  var out = [], i, r;
  for (i = 0; i < J.repas.length; i++) {
    r = J.repas[i] || {};
    out.push([
      flExpDate(J.K),
      r.time || (r.h != null ? flExpHM(r.h) : ''),
      r.name || '',
      flExpN(r.kcal),
      flExpN(r.prot),
      flExpN(r.carb),
      flExpN(r.fat)
    ]);
  }
  return out;
}

/* ── Table 6 : la fréquence cardiaque, minute par minute ──────────────────── */

/* WHOOP ne donne PAS cette table — il ne rend que des agrégats. C'est la
   mesure brute de FLINT, et c'est celle qu'on regretterait le plus de perdre :
   tous les scores en sortent, aucun ne la remplace.

   C'est le canal MINUTE (`watch_.hr`). Le canal cinq secondes (`hrfine_`)
   pèse sept mille quatre cents mesures par jour ; il reste dans le JSON brut,
   parce qu'un CSV de deux cent mille lignes ne s'ouvre plus dans un tableur —
   et un fichier qui ne s'ouvre pas n'est pas une portabilité. */
var FLEXP_FC = ['Date', 'Heure', 'Fréquence cardiaque (bpm)'];

function flExpLignesFC(J) {
  var out = [], w = J.montre, i, hr;
  if (!w || !w.hr || !w.hr.length) return out;
  hr = w.hr;
  for (i = 0; i < hr.length; i++) {
    if (!(+hr[i][1] > 0)) continue;
    out.push([flExpDate(J.K), flExpHM(hr[i][0]), flExpN(hr[i][1])]);
  }
  return out;
}

/* ── Table 7 : l'activité de l'iPhone, par tranches de cinq minutes ───────── */

var FLEXP_SANTE = ['Date', 'Heure de fin de tranche', 'Pas', 'Distance (m)',
                   'Étages', 'Énergie active Apple (cal.)'];

function flExpLignesSante(J) {
  var sa = flExpSur(function () { return DB.get('sante_' + J.K, null); }, null);
  if (!sa) return [];
  var par = {}, i, s, k;
  var SERIES = [['pas', 0], ['dist', 1], ['etages', 2], ['kcalApple', 3]];
  for (s = 0; s < SERIES.length; s++) {
    var serie = sa[SERIES[s][0]];
    if (!serie || !serie.length) continue;
    for (i = 0; i < serie.length; i++) {
      var min = +serie[i][0];
      if (!isFinite(min)) continue;
      if (!par[min]) par[min] = [null, null, null, null];
      par[min][SERIES[s][1]] = +serie[i][1];
    }
  }
  var mins = [];
  for (k in par) if (Object.prototype.hasOwnProperty.call(par, k)) mins.push(+k);
  mins.sort(function (a, b) { return a - b; });
  var out = [];
  for (i = 0; i < mins.length; i++) {
    var v = par[mins[i]];
    /* La dernière tranche du jour FINIT à 1440, c'est-à-dire minuit du
       lendemain. `flExpHM` la replierait en « 00:00 » et la ligne se lirait
       comme la toute première du jour, en tête de fichier après tri. On écrit
       « 24:00 », qui est ce qu'elle est. */
    out.push([flExpDate(J.K), mins[i] >= 1440 ? '24:00' : flExpHM(mins[i]),
              flExpN(v[0]), flExpN(v[1]), flExpN(v[2]), flExpN(v[3], 1)]);
  }
  return out;
}

/* ── Ce que les canaux fins portent VRAIMENT ──────────────────────────────── */

/* LA NOTICE PROMETTAIT PLUS QUE LE FICHIER NE TIENT, et c'est le genre de
   promesse qu'on ne vérifie que le jour où on en a besoin. Elle dit : garde ce
   JSON, il porte « la fréquence cardiaque à cinq secondes, les intervalles
   entre battements ». Elle ne dit pas COMBIEN DE JOURS. Sur l'archive du
   2 septembre 2026 : cinquante-huit journées de tableaux, mais douze jours de
   canal fin, sept de battements et trois électrocardiogrammes — parce que ces
   canaux-là s'archivent au fil de l'eau (`rrH` vit sept jours,
   test-fenetre-rrh.js). Une seconde de battements pèse mille fois une ligne de
   tableau ; l'archivage est le bon choix, le taire ne l'est pas.

   On compte donc, et la notice écrit le compte. COMPTAGE DE CLÉS UNIQUEMENT :
   aucune valeur n'est dépliée ici, c'est gratuit même sur cinq mégaoctets. Les
   jours d'intervalles, eux, se comptent dans la boucle principale — `watch_`
   y est déjà déplié, le recompter le serait deux fois. */
function flExpCanauxFins() {
  var o = { hrfine: 0, ecg: 0, rr: 0, premier: null, dernier: null }, i, k, m;
  var FIN = /^hrfine_(\d{4}-\d{1,2}-\d{1,2})$/;
  try {
    for (i = 0; i < localStorage.length; i++) {
      k = localStorage.key(i);
      if (!k) continue;
      if (k.indexOf('ecg_') === 0) { o.ecg++; continue; }
      m = FIN.exec(k);
      if (!m) continue;
      if (localStorage.getItem(k) === 'null') continue;
      o.hrfine++;
      if (o.premier === null || flExpMs(m[1]) < flExpMs(o.premier)) o.premier = m[1];
      if (o.dernier === null || flExpMs(m[1]) > flExpMs(o.dernier)) o.dernier = m[1];
    }
  } catch (e) { }
  if (o.premier) o.premier = flExpDate(o.premier);
  if (o.dernier) o.dernier = flExpDate(o.dernier);
  return o;
}

/* ── L'inventaire : ce que la page affiche AVANT qu'on exporte ────────────── */

/* Il doit rester instantané, donc il ne rejoue AUCUN score : il compte des
   longueurs. C'est le prix à payer pour qu'une page s'ouvre sans attente, et
   c'est aussi ce qui le rend honnête — il dit ce qui est STOCKÉ, pas ce qui
   se calcule. */
window.flExportInventaire = function () {
  try {
    var jours = flExpJours(), i, K, w, n;
    var nuits = 0, seances = 0, repas = 0, journees = 0, battements = 0, jrn = 0;
    var premier = null, dernier = null, octets = 0;

    try {
      for (i = 0; i < localStorage.length; i++) {
        var kk = localStorage.key(i);
        if (!kk) continue;
        var vv = localStorage.getItem(kk);
        octets += kk.length + (vv ? vv.length : 0);
      }
    } catch (e) { }

    for (i = 0; i < jours.length; i++) {
      K = jours[i];
      w = flExpSur(function () { return DB.get('watch_' + K, null); }, null);
      n = flExpNuit(K);
      var ss = flExpSur(function () { return DB.get('sessions_' + K, []) || []; }, []);
      var mm = flExpSur(function () { return DB.get('meals_' + K, []) || []; }, []);
      var jj = flExpSur(function () { return DB.get('journal_' + K, null); }, null);
      var pasJ = flExpSur(function () { return (typeof flStepsOf === 'function') ? flStepsOf(K) : 0; }, 0);
      var hrN = (w && w.hr) ? w.hr.length : 0;

      var vivant = (n && n.sleepMin != null) || ss.length || mm.length || pasJ > 0 || hrN > 0;
      if (!vivant) continue;

      journees++;
      if (n && n.sleepMin != null) nuits++;
      seances += ss.length;
      repas += mm.length;
      if (jj && jj._saved === true) jrn++;
      battements += hrN;
      if (premier === null || flExpMs(K) < flExpMs(premier)) premier = K;
      if (dernier === null || flExpMs(K) > flExpMs(dernier)) dernier = K;
    }

    return JSON.stringify({
      ok: true,
      jours: journees, nuits: nuits, seances: seances, repas: repas,
      journal: jrn, battements: battements,
      premier: premier ? flExpDate(premier) : null,
      dernier: dernier ? flExpDate(dernier) : null,
      octets: octets
    });
  } catch (e) {
    return JSON.stringify({ ok: false, raison: String((e && e.message) || e) });
  }
};

/* ── L'export complet ─────────────────────────────────────────────────────── */

window.flExportTables = function () {
  try {
    var jours = flExpJours(), i, J;
    var cycles = [], sommeil = [], activites = [], journal = [], repas = [],
        fc = [], sante = [];
    var retenus = 0;
    var canaux = flExpCanauxFins();

    for (i = 0; i < jours.length; i++) {
      J = flExpJour(jours[i]);
      if (!flExpPorteQuelqueChose(J)) continue;
      retenus++;
      if (J.montre && J.montre.rrH && J.montre.rrH.length) canaux.rr++;

      cycles.push(flExpLigneCycle(J));
      /* Le sommeil n'a de ligne que s'il y a eu une nuit : une ligne de sommeil
         entièrement vide ferait croire à une nuit blanche mesurée. */
      if (J.dormi != null) sommeil.push(flExpLigneSommeil(J));
      activites = activites.concat(flExpLignesActivites(J));
      journal = journal.concat(flExpLignesJournal(J));
      repas = repas.concat(flExpLignesRepas(J));
      fc = fc.concat(flExpLignesFC(J));
      sante = sante.concat(flExpLignesSante(J));
    }

    var p = flExpSur(function () {
      return (typeof getProfile === 'function') ? getProfile() : {};
    }, {}) || {};

    /* Le profil sort AUSSI — c'est une donnée personnelle au sens de
       l'article 20, et c'est elle qui rend les autres relisibles : sans la
       taille, le poids et l'âge, personne ne peut refaire le calcul des
       calories à partir des colonnes qu'on lui donne. */
    var profil = flExpCsv(['Champ', 'Valeur'], [
      ['Prénom', p.name || ''],
      ['Sexe', p.gender || ''],
      ['Âge', flExpN(p.age)],
      ['Taille (cm)', flExpN(p.height != null ? p.height : p.taille)],
      ['Poids (kg)', flExpN(p.weight != null ? p.weight : p.poids, 1)],
      ['Heure de lever visée', p.wake || ''],
      ['Besoin de sommeil (h)', flExpN(p.need, 1)],
      ['Objectif de calories', flExpN(p.kcalGoal)],
      ['Objectif de protéines (g)', flExpN(p.protGoal)],
      ['Objectif', p.goal || '']
    ]);

    var fichiers = [
      { nom: 'cycles_physiologiques.csv', csv: flExpCsv(FLEXP_CYCLES, cycles), lignes: cycles.length },
      { nom: 'sommeil.csv', csv: flExpCsv(FLEXP_SOMMEIL, sommeil), lignes: sommeil.length },
      { nom: 'activites.csv', csv: flExpCsv(FLEXP_ACTIVITES, activites), lignes: activites.length },
      { nom: 'journal.csv', csv: flExpCsv(FLEXP_JOURNAL, journal), lignes: journal.length },
      { nom: 'repas.csv', csv: flExpCsv(FLEXP_REPAS, repas), lignes: repas.length },
      { nom: 'frequence_cardiaque.csv', csv: flExpCsv(FLEXP_FC, fc), lignes: fc.length },
      { nom: 'activite_iphone.csv', csv: flExpCsv(FLEXP_SANTE, sante), lignes: sante.length },
      { nom: 'profil.csv', csv: profil, lignes: 10 }
    ];

    return JSON.stringify({
      ok: true,
      jours: retenus,
      premier: jours.length ? flExpDate(jours[jours.length - 1]) : null,
      dernier: jours.length ? flExpDate(jours[0]) : null,
      /* La notice en a besoin pour chiffrer sa promesse plutôt que de la
         laisser croire sans limite. */
      canauxFins: canaux,
      fichiers: fichiers
    });
  } catch (e) {
    return JSON.stringify({ ok: false, raison: String((e && e.message) || e) });
  }
};

/* ═══════════════════════════════════════════════════════════════════════════
   LE VIDAGE PAR TRANCHES — parce qu'un seul bloc affamait le moteur
   (1er septembre 2026)

   ═══ CE QUE LE TÉLÉPHONE DE DINO A ÉCRIT, MOT POUR MOT ════════════════════

       15:00:28  export-vidage · ÉCHÉANCE — aucune réponse en 8 s
       15:00:32  export-vidage · réponse arrivée APRÈS l'échéance ·  12,2 s
       15:02:26  export-vidage · réponse arrivée APRÈS l'échéance · 117,9 s
       15:03:05  export-vidage · réponse arrivée APRÈS l'échéance ·  31,8 s
       15:06:52  export-vidage · réponse arrivée APRÈS l'échéance · 245,4 s
       15:07:34  sortie · fiche calculée · moteur 11 ms · reçue après 38,1 s

   La dernière ligne est tout le problème : LE CALCUL A COÛTÉ ONZE
   MILLISECONDES ET LA RÉPONSE A MIS TRENTE-HUIT SECONDES. Ce n'est pas un
   calcul lent, c'est une file d'attente. Devant elle : ce vidage-ci, qui
   lisait les CINQ CENT SOIXANTE-DIX-HUIT clés et les CINQ MÉGAOCTETS du
   stockage en UN SEUL appel, sur le seul fil du moteur — celui-là même qui
   doit répondre au doigt. Dino, pendant ces sept minutes : « je clique sur
   Température, il y a un chargement Flint avec un instant ». Il n'attendait
   pas son graphique : il attendait la sauvegarde.

   ═══ POURQUOI DES TRANCHES, ET PAS SIMPLEMENT « MOINS SOUVENT » ═══════════

   Parce qu'une seule passe suffit à geler l'écran. Mesurée sur son
   téléphone : 1,8 s le 30 août, 5,4 s le 31, 12,2 s le 1er septembre — elle
   grossit avec la base, et elle ne rétrécira jamais. Un doigt qui tombe
   dedans attend ces secondes-là en entier, quoi qu'on fasse par ailleurs.

   Vingt-cinq clés par appel, la main rendue entre chaque (côté natif) : le
   moteur n'est jamais pris plus d'un battement, et la demande d'un graphique
   passe DEVANT la tranche suivante au lieu de faire la queue derrière tout.
   C'est la discipline de `flPrechargerGraphiques` (v1483, « rendre la main ne
   suffit pas, il faut la rendre longtemps »), appliquée à la sauvegarde.

   ═══ LA LISTE EST FIGÉE D'ABORD, ET C'EST OBLIGATOIRE ═════════════════════

   `localStorage.key(i)` désigne un RANG, pas une clé : le bracelet écrit en
   permanence (`watch_`, `sensor_`, `hrfine_`), et une clé ajoutée entre deux
   tranches décale tous les rangs suivants. On sauterait des clés sans le
   savoir — sur une SAUVEGARDE, c'est la pire panne possible, celle qui ne se
   voit que le jour où on en a besoin.

   `flVidagePreparer` fige donc la liste des NOMS en une passe (aucune lecture
   de valeur, aucun JSON.parse : c'est gratuit), et les tranches lisent PAR
   NOM. Une clé écrite pendant la passe n'entre pas dans cette sauvegarde-là ;
   elle entrera dans la suivante. Une sauvegarde quotidienne a le droit de
   dater de la seconde où elle a commencé — elle n'a pas le droit d'être
   trouée.                                                                   */
/* ═══ L'EXPORT N'ÉCRIT PAS CE QUE L'IMPORT REFUSE DE LIRE ═══════════════════
   (2 septembre 2026)

   Le vidage prenait le stockage entier, sans distinction. Ce que Dino trouve
   donc dans un fichier présenté comme « tout le contenu de l'application » :
   `flintDemoData`, `flDemoSeed`, `flDemoRepas`, `flLoads`, `flLoadAt` — des
   compteurs de chargement et des restes de session de démonstration. Ce n'est
   pas sa santé, ça ne se restaure pas, et `flImpAccepte` les jette DÉJÀ à la
   relecture (`FL_IMP_EXCLUS`, flint-import.js). On les écrivait donc pour rien,
   et ce rien salissait la seule pièce qu'on demande à quelqu'un de garder.

   LA RÈGLE, ET ELLE TIENT EN UNE PHRASE : l'export n'écrit pas ce que l'import
   refuse. UNE seule liste, du côté de l'import, qui est celui qui sait — pas
   deux qui divergeront. Si le prédicat n'est pas là (moteur plus ancien,
   fichier non chargé), ON GARDE TOUT : inventer ici une seconde liste serait
   exactement la divergence qu'on ferme.

   ⚠️ CE QU'ON NE RETIRE SURTOUT PAS : les repères de migration
   (`purge.*`, `purgeDetect*`, `journeesDebloqueesV*`, `nomSansMomentV*`,
   `rattrapSeancesV*`, `flNettoyageSeme`). Ils ont l'air d'être de la plomberie
   et ils sont de l'ÉTAT : chacun dit « ce ménage-là a déjà eu lieu ». Absents
   d'une sauvegarde, la restauration relancerait des purges déjà faites — et
   plusieurs d'entre elles SUPPRIMENT des journées (`flPurgeDemoDays`, la purge
   des séances). Un export plus propre qui abîme la restauration serait un
   mauvais troc ; la notice le dit plutôt que de le faire. */
window.flVidageExportable = function (k) {
  if (typeof k !== 'string' || !k.length) return false;
  try {
    if (typeof flImpAccepte === 'function') return flImpAccepte(k);
  } catch (e) { }
  return true;
};

window.flVidagePreparer = function () {
  try {
    var L = [], n = localStorage.length;
    for (var i = 0; i < n; i++) {
      var k = localStorage.key(i);
      if (k != null && window.flVidageExportable(k)) L.push(k);
    }
    window._flVidageListe = L;
    return L.length;
  } catch (e) { window._flVidageListe = null; return -1; }
};

/* Le vidage EN UN BLOC, pour l'export manuel — celui qui part d'un doigt et
   dont l'écran annonce déjà qu'il travaille (la sauvegarde automatique, elle,
   garde les tranches). Il vivait en clair dans une chaîne de PagesReglages.swift ;
   il descend ici pour que le filtre ci-dessus s'applique aux DEUX chemins, et
   qu'on ne puisse pas corriger l'un en oubliant l'autre. */
window.flVidageBloc = function () {
  try {
    var o = {}, i, k;
    for (i = 0; i < localStorage.length; i++) {
      k = localStorage.key(i);
      if (k == null || !window.flVidageExportable(k)) continue;
      o[k] = localStorage.getItem(k);
    }
    return JSON.stringify(o);
  } catch (e) { return 'ERR ' + ((e && e.message) || e); }
};

/* Une tranche, lue PAR NOM dans la liste figée. Rend le JSON plat
   `{clé: chaîne}` — exactement le format que l'import du web sait relire,
   celui du vidage d'un seul bloc qu'elle remplace. */
window.flVidageTranche = function (debut, combien) {
  try {
    var L = window._flVidageListe;
    if (!L) return 'ERR liste absente — flVidagePreparer n\'a pas été appelé';
    var d = Math.max(0, +debut || 0), f = Math.min(L.length, d + (+combien || 25)), o = {};
    for (var i = d; i < f; i++) {
      var v = localStorage.getItem(L[i]);
      if (v != null) o[L[i]] = v;
    }
    return JSON.stringify(o);
  } catch (e) { return 'ERR ' + ((e && e.message) || e); }
};
