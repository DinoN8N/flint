/* ═══════════════════════════════════════════════════════════════════════════
   LE SOMMEIL, RECONSTRUIT DEPUIS CE QUE LA MONTRE ENVOIE VRAIMENT

   La montre ne dit jamais « voilà ta nuit ». Elle envoie des TRANCHES de 4 h qui
   démarrent toutes les 2 h, donc qui se chevauchent deux à deux :

       01h32 ├──────── 4 h ────────┤ 05h32
             03h32 ├──────── 4 h ────────┤ 07h32
                   05h32 ├──────── 4 h ────────┤ 09h32

   Chaque tranche porte 240 valeurs, une par minute : 1 profond, 2 léger,
   3 paradoxal, autre chose = éveil (sémantique du SDK du fabricant).

   Trois pièges, tous rencontrés pour de vrai, tous traités ici :

   1. RECOLLER SANS COMPTER DOUBLE. Une même minute apparaît dans deux tranches.
      On projette sur une grille minute unique, jamais on n'additionne.

   2. LE BOURRAGE N'EST PAS DE L'ÉVEIL. Une tranche de 240 minutes qui n'a que
      120 minutes de vraies données est complétée par des zéros, et zéro se
      traduit par « éveillé ». Une nuit de 10 h tombait ainsi à 3h39. On suit donc
      les minutes RÉELLEMENT transmises, et on ne comble un trou que s'il est
      entouré de sommeil des deux côtés.

   3. LA MÉMOIRE DE LA MONTRE TOURNE. Le matin elle rend toute la nuit,
      l'après-midi seulement la fin. Une nuit ne doit donc JAMAIS raccourcir :
      on ne remplace une nuit que par une nuit au moins aussi longue, ou par une
      nuit qui couvre une autre fenêtre.

   Ensuite seulement vient le re-staging : les stades bruts de la puce sont
   corrigés avec la fréquence cardiaque nocturne (éveil relatif à une base
   glissante, paradoxal replacé selon sa latence, profond selon sa signature de
   FC basse et stable), avec des bornes physiologiques et la provenance dite
   honnêtement (mesuré / partiel / brut de la montre).

   Ce fichier est le moteur ; il n'affiche rien. Il remplit `watch_<K>.night`,
   l'endroit exact où l'app va chercher la nuit, puis demande le rafraîchissement.
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* v1169 — LE JOURNAL DU SOMMEIL DEVIENT LISIBLE DEPUIS LE TÉLÉPHONE.
     Il partait dans `console.log`, c'est-à-dire nulle part pour quelqu'un qui
     n'a pas un Mac branché. Trois allers-retours de suppositions plus tard, la
     conclusion s'impose : ce moteur doit pouvoir DIRE ce qu'il a vu. Le panneau
     Profil > Mon bracelet affiche déjà le journal Bluetooth ; on écrit dedans. */
  /* v1194 — L ESTAMPILLE D INSTRUMENT.
     Un changement d algorithme de sommeil est un CHANGEMENT D INSTRUMENT
     (Depner et coll., atelier international, Sleep 2020;43(2):zsz254) : des
     nuits calculees par deux versions differentes ne sont pas comparables et
     ne doivent pas entrer dans la meme estimation de besoin.
     A INCREMENTER a chaque modification du re-staging ou de l assemblage. */
  var MOTEUR_VERSION = 'restage-2026-08-05';

  function flsLog(m) {
    try { console.log('[sommeil] ' + m); } catch (e) {}
    try { if (window.flBleLog) window.flBleLog('🌙 ' + m); } catch (e) {}
  }

  /* CE QUE LA MONTRE A VRAIMENT ENVOYÉ, en clair, pour les trois derniers jours.
     Sans ça, impossible de distinguer « la sieste n'est pas mesurée » de « la
     sieste est mesurée mais mal classée » — et c'est exactement la question sur
     laquelle je me suis trompé deux fois. */
  function flsDiagnostic() {
    try {
      var ch = flsLire('flintSleepChunks', []) || [];
      var d0 = new Date(), bornes = {};
      for (var j = 0; j <= 2; j++) {
        var dj = new Date(d0.getTime() - j * 86400000);
        bornes[dj.getFullYear() + '-' + (dj.getMonth() + 1) + '-' + dj.getDate()] = 1;
      }
      flsLog('— DIAGNOSTIC — ' + ch.length + ' tranche(s) en mémoire au total');
      Object.keys(bornes).sort().reverse().forEach(function (K) {
        var p = K.split('-');
        var min0 = new Date(+p[0], +p[1] - 1, +p[2], 0, 0, 0).getTime() / 1000;
        var duJour = ch.filter(function (c) { return c.start >= min0 && c.start < min0 + 86400; });
        var w = flsLire('watch_' + K, null) || {};
        var naps = (flsLire('sessions_' + K, []) || []).filter(function (s) { return s && s.type === 'nap'; });
        var hh = function (ts) { var d = new Date(ts * 1000); return String(d.getHours()).padStart(2, '0') + 'h' + String(d.getMinutes()).padStart(2, '0'); };
        flsLog(K + ' : ' + duJour.length + ' tranche(s) montre'
          + (duJour.length ? ' [' + duJour.map(function (c) { return hh(c.start) + '+' + (c.stages || []).length + 'min'; }).join(' ') + ']' : '')
          + ' · FC ' + ((w.hr || []).length) + ' pts'
          + ' · nuit ' + (w.night ? (flHHMM(w.night.bedMin) + '-' + flHHMM(w.night.wakeMin) + ' (' + w.night.sleepMin + 'min)') : 'aucune')
          + ' · registre ' + ((w.sommeils || []).map(function (s) { return s.type + '/' + (s.source || '?'); }).join(',') || 'vide')
          + ' · siestes affichées ' + (naps.map(function (s) { return s.start + '+' + s.dur; }).join(',') || 'aucune'));
      });
    } catch (e) { flsLog('diagnostic : ' + e.message); }
  }

  function flsLire(cle, def) {
    try { var v = localStorage.getItem(cle); return v ? JSON.parse(v) : def; }
    catch (e) { return def; }
  }

  /* La nuit vit dans watch_<K>.night : c'est là que sensorOf va la chercher. */
  function flsNuitDe(K) {
    var w = flsLire('watch_' + K, null);
    return (w && w.night) ? w.night : null;
  }
  function flsEcrireNuit(K, nuit) {
    try {
      var w = flsLire('watch_' + K, null) || { hr: [], rr: [] };
      /* Une nuit MESURÉE (avec son découpage) ne se remplace pas par une nuit
         seulement estimée (des totaux sans hypnogramme). */
      var av = w.night;
      if (av && av.stages && av.stages.length && !(nuit && nuit.stages && nuit.stages.length)) {
        flsLog('nuit ' + K + ' : on garde l hypnogramme mesuré, la nouvelle version n en a pas');
        return;
      }
      /* v1165 — LE DERNIER VERROU, celui qui manquait.
         Quoi qu'aient décidé les étages au-dessus, rien qui ne ressemble pas à
         une nuit n'entre dans `night`. Et deux périodes DISJOINTES le même jour
         ne se remplacent pas : la plus longue reste la nuit, l'autre est déjà
         enregistrée à part. En cas de doute on conserve les deux — jamais une
         suppression silencieuse. */
      if (nuit && nuit.sleepStart != null && nuit.sleepEnd != null) {
        var type = flsClasser(nuit.sleepStart, nuit.sleepEnd);
        if (type !== TYPE_NUIT) {
          flsLog('nuit ' + K + ' : la période proposée est classée « ' + type +
                 ' » — enregistrée à part, la nuit principale n est pas touchée.');
          return;
        }
        if (av && av.sleepStart != null && av.sleepEnd != null) {
          var chevauche = Math.min(av.sleepEnd, nuit.sleepEnd) - Math.max(av.sleepStart, nuit.sleepStart) > 0;
          if (!chevauche && (av.sleepMin || 0) >= (nuit.sleepMin || 0)) {
            flsLog('nuit ' + K + ' : deux périodes distinctes ce jour-là, la plus longue reste la nuit principale.');
            return;
          }
        }
      }
      w.night = nuit;
      localStorage.setItem('watch_' + K, JSON.stringify(w));
      /* v1329 — ÉCRIRE SUR LE DISQUE NE SUFFIT PAS À CHANGER L'ÉCRAN.
         La coquille garde un `cache` par jour rempli au premier accès et jamais
         relu (index.html, `wGet`). Tout ce qu'on corrige ici restait donc
         invisible : `sensorOf`, la charge du sommeil, l'accueil et
         `_vaEvaluerNuit` continuaient de servir la nuit que `computeNight`
         avait posée en mémoire. Mesuré chez Dino le 9 août : disque 7 h 46 /
         couché 00 h 02, écran 8 h 25 / couché 23 h 25, pendant des heures.
         On prévient donc la coquille. Elle ne reprend que le champ `night`. */
      try { if (window.flWatchOublier) window.flWatchOublier(K); } catch (e) {}
    } catch (e) { flsLog('écriture impossible : ' + e.message); }
  }
  /* La FC de la nuit, pour le re-staging : watch_<K>.hr est en minute du jour,
     le re-staging attend des horodatages absolus. On convertit. */
  function flsHrTs(K) {
    var w = flsLire('watch_' + K, null);
    if (!w || !w.hr || !w.hr.length) return [];
    var p = K.split('-');
    var minuit = new Date(+p[0], +p[1] - 1, +p[2], 0, 0, 0).getTime() / 1000;
    return w.hr.map(function (x) { return [x[1], minuit + x[0] * 60]; });
  }

  /* ═════════════════════════════════════════════════════════════════════════
     v1165 — UNE JOURNÉE PEUT CONTENIR PLUSIEURS SOMMEILS.

     Défaut vécu le 4 août : nuit de 2h27 à 8h40, VTT, puis sieste l'après-midi.
     La sieste est devenue « la nuit », et la nuit a disparu. Trois causes, toutes
     réelles, toutes traitées ici :

       1. `nightFromChunks` choisissait « le dernier groupe dont le jour de RÉVEIL
          tombe ce jour-là ». La nuit se réveille à 8h40, la sieste à 15h : deux
          groupes, même jour, et le `forEach` réassignait sans jamais s'arrêter.
          Le dernier gagnait. Aucun critère d'heure, de durée, de « est-ce une
          nuit ? ».
       2. La fusion de deux groupes (trou ≤ 8 h, fenêtre ≤ 13 h) collait la sieste
          à la nuit et fabriquait une nuit de treize heures.
       3. `flsEcrireNuit` écrivait dans `watch_<K>.night`, un champ UNIQUE, sans
          jamais demander si la fenêtre proposée ressemblait à une nuit.

     LA RÈGLE : on CLASSE avant d'écrire, et on ne perd jamais rien. La nuit
     principale garde `watch_<K>.night` (tous les écrans continuent de la lire là).
     Les autres périodes vivent dans `watch_<K>.sommeils` et, pour les siestes,
     dans `sessions_<K>` où la journée sait déjà les afficher et les ouvrir.

     Les seuils sont SOUPLES : une nuit peut commencer à 2h27. On ne demande pas
     « commence après 22 h », on demande « quelle part de cette période est
     tombée dans la plage nocturne », et on laisse la durée trancher le reste.
     ═════════════════════════════════════════════════════════════════════════ */
  var TYPE_NUIT = 'mainSleep';
  var TYPE_SIESTE = 'nap';
  var TYPE_SECOND = 'secondarySleep';
  var TYPE_INCONNU = 'unknown';

  var CLASSIF = {
    nuitDebutMin: 21 * 60,     // la plage nocturne s'ouvre à 21 h…
    nuitFinMin: 10 * 60,       // …et se ferme à 10 h le lendemain
    partNuitMini: 0.5,         // majoritairement nocturne
    partNuitFaible: 0.30,      // suffit si la période est longue
    dureeMiniNuit: 150,        // 2 h 30 : en dessous, ce n'est pas une nuit
    dureeNuitEvidente: 240,    // 4 h : une période aussi longue est une nuit
    dureeMaxiSieste: 180,      // 3 h : au-delà, ce n'est plus une sieste
    dureeMiniRetenue: 15,      // en dessous, c'est du bruit de capteur
    /* v1191 — combien de temps debout coupe une nuit en deux. Règle du founder,
       dictée par lui : « à partir d'un réveil d'une heure et demie, ce sera des
       sommeils complètement différents ». En dessous, on se rendort et c'est la
       même nuit — la fin de la nuit devient la fin du second morceau. */
    reveilCoupeNuit: 90,
    /* ═══ v1408 — LA CADENCE QUI PROUVE QU ON EST DEBOUT ═══════════════════════
       Dix-huit pas par minute, exactement le `MARCHE_FAIBLE` du moteur — le
       seuil qui sert déjà à PROLONGER une marche déclarée. On ne pose donc pas
       un nombre de plus : on emprunte celui qui décide déjà, ailleurs, si
       quelqu'un marche.
       En dessous, ce sont des pas de vie — se retourner, aller boire. Au-dessus,
       le corps se déplace. */
    pasEveilCadence: 18
    /* Il n'y a VOLONTAIREMENT rien d'autre ici sur les pas. Un veto « pas de
       sommeil pendant qu'on marche » a été écrit puis retiré le jour même,
       décision de Félix : « on a un capteur, si on le paramètre bien y a pas ce
       genre d'erreur ». Le capteur, c'est la preuve d'éveil ci-dessous — elle
       marque éveillées les minutes de marche franche, et le re-staging fait le
       reste. Une règle de plus aurait été un pansement sur un fil débranché. */
  };

  /* ═══ v1408 — COMBIEN DE MARCHE FRANCHE DANS CETTE FENÊTRE ══════════════════

     LE BRACELET NE COMPTE DES PAS QUE QUAND ON MARCHE VRAIMENT. C'est le seul
     signal de mouvement de cette montre qui soit indiscutable, et le module le
     disait déjà en toutes lettres — « ça ne voit pas les micro-réveils, mais ça
     ne ment jamais ».

     Rend la part de la fenêtre couverte par des blocs de marche franche, et le
     nombre de minutes que ça représente. La largeur d'un bloc se déduit de la
     MÉDIANE des écarts, jamais du plus petit : un couple de blocs rapprochés
     suffirait sinon à tout fausser. C'est la leçon de la v1407, et elle vaut ici
     aussi. */
  function flsMarcheFenetre(dayKey, debutMs, finMs) {
    try {
      var w = flsLire('watch_' + dayKey, null) || {};
      var recs = w.actDet || [];
      var duree = Math.round((finMs - debutMs) / 60000);
      if (!recs.length || duree <= 0) return { part: 0, minutes: 0 };
      var ts = [];
      for (var i = 0; i < recs.length; i++) if (recs[i] && recs[i][0]) ts.push(recs[i][0]);
      ts.sort(function (a, b) { return a - b; });
      var ec = [];
      for (var j = 1; j < ts.length; j++) {
        var d = Math.round((ts[j] - ts[j - 1]) / 60);
        if (d > 0) ec.push(d);
      }
      ec.sort(function (a, b) { return a - b; });
      var largeur = ec.length ? ec[ec.length >> 1] : 10;
      if (!(largeur > 0 && largeur <= 30)) largeur = 10;
      var couvert = 0;
      recs.forEach(function (r) {
        if (!r || !r[1]) return;
        var t = r[0] * 1000;
        if (t < debutMs || t > finMs) return;
        if (r[1] / largeur < CLASSIF.pasEveilCadence) return;
        couvert += largeur;
      });
      return { part: Math.min(1, couvert / duree), minutes: couvert, largeur: largeur };
    } catch (e) { return { part: 0, minutes: 0 }; }
  }



  /* Quelle part de [debut, fin] tombe dans la plage nocturne, entre 0 et 1. */
  function flsPartNocturne(debutMs, finMs) {
    var n = Math.round((finMs - debutMs) / 60000);
    if (!(n > 0) || n > 2000) return 0;
    var d = new Date(debutMs), m0 = d.getHours() * 60 + d.getMinutes(), dedans = 0;
    for (var i = 0; i < n; i++) {
      var m = (m0 + i) % 1440;
      if (m >= CLASSIF.nuitDebutMin || m < CLASSIF.nuitFinMin) dedans++;
    }
    return dedans / n;
  }

  /* NUIT PRINCIPALE, SIESTE, SOMMEIL SECONDAIRE, ou rien de concluant.
     Recalculable : la classification ne dépend que des horaires et de la durée,
     jamais de l'ordre d'arrivée ni de ce qui est déjà enregistré. */
  function flsClasser(debutMs, finMs) {
    var duree = Math.round((finMs - debutMs) / 60000);
    if (!(duree >= CLASSIF.dureeMiniRetenue)) return TYPE_INCONNU;
    var part = flsPartNocturne(debutMs, finMs);
    // Une période longue ET qui traverse la nuit est une nuit, même très décalée.
    if (duree >= CLASSIF.dureeNuitEvidente && part >= CLASSIF.partNuitFaible) return TYPE_NUIT;
    if (part >= CLASSIF.partNuitMini && duree >= CLASSIF.dureeMiniNuit) return TYPE_NUIT;
    // En plein jour et courte : sieste.
    if (duree <= CLASSIF.dureeMaxiSieste && part < CLASSIF.partNuitMini) return TYPE_SIESTE;
    // Longue mais en plein jour : on ne tranche pas, et surtout on ne l'écrase pas.
    return TYPE_SECOND;
  }

  /* ═══ ON NE MARCHE PAS EN DORMANT (v1419) ═══════════════════════════════════

     LE CAS. Le 7 août, la montre a classé 10h56 → 14h16 en `secondarySleep`,
     116 minutes de sommeil. Pendant cette fenêtre, elle a compté elle-même
     2 133 pas, dont un bloc de 642 avec neuf minutes actives sur dix. Dino était
     en randonnée. FLINT a relayé fidèlement, et l'a affiché en sieste de
     200 minutes — la charge du jour et la récupération du lendemain s'appuyaient
     dessus.

     LA v1168 AVAIT DÉJÀ ÉCRIT LA RÈGLE, à quelques lignes d'ici : « sans
     mouvement ni stades, rien ne distingue le repos du sommeil ». Elle en avait
     tiré la bonne conclusion — retirer la détection par cœur bas. Mais elle
     laissait le mouvement inutilisé pour REFUSER une classification venue de la
     montre. C'est ce qui manque ici, et la matière n'existait pas encore : la
     répartition des pas à la minute n'est gardée que depuis la v1413.

     LE DISCRIMINATEUR, MESURÉ SUR LES TREIZE FENÊTRES DE SOMMEIL DE DINO. Une
     minute isolée avec des pas est banale — on se lève la nuit. Une SUITE de
     minutes, non.

         fenêtre                    pas    plus longue suite
         nuits et vraie sieste     0-185          1 à 4
         le 7 août, 10h56-14h16     2133              9

     DEUX CONDITIONS, ET IL FAUT LES DEUX. Une seule serait un seuil ; deux
     mesures indépendantes qui disent la même chose sont un fait. Six minutes
     d'affilée parce qu'on ne marche pas six minutes en dormant, cinq cents pas
     parce qu'un aller-retour aux toilettes n'en fait pas cent.

     CE QU'ON NE TOUCHE PAS : LA NUIT. Une nuit d'insomnie où l'on marche
     vraiment existe, et se tromper sur la nuit coûte bien plus cher que se
     tromper sur une sieste. Le refus ne vaut donc que pour le sommeil de JOUR.

     RÉSERVE, ÉCRITE ICI POUR QU'ELLE SE VOIE. Ces bornes viennent de treize
     fenêtres, un bracelet, une personne. Ce sont des planchers, pas un réglage
     fin : la marge est de 4 à 6 minutes et de 185 à 500 pas. Elles se
     rediscutent dès qu'une quatorzième fenêtre les contredit — et le banc garde
     les cas pour que ça se voie tout de suite. */
  var MARCHE_SUITE_MINI = 6;    // minutes consécutives avec des pas
  var MARCHE_PAS_MINI = 500;    // pas dans la fenêtre

  /* Rend {pas, suite} pour une fenêtre donnée, en millisecondes epoch.
     La suite n'est mesurable que sur les blocs qui portent la répartition
     (v1413+) : sur un jour plus ancien elle vaut 0, les deux conditions ne
     peuvent pas être réunies, et on ne refuse rien. Une donnée absente ne
     prouve rien — surtout pas l'inverse de ce qu'on cherche. */
  function flsMarcheDans(K, debut, fin) {
    var pas = 0, mins = {};
    try {
      var w = flsLire('watch_' + K, null) || {};
      var blocs = w.actDet || [];
      for (var i = 0; i < blocs.length; i++) {
        var b = blocs[i], t = b[0] * 1000;
        if (t < debut - 15 * 60000 || t > fin) continue;
        if (t >= debut) pas += (+b[1] || 0);
        var rep = b[3];
        if (!rep || !rep.length) continue;
        for (var j = 0; j < rep.length; j++) {
          if (!(rep[j] > 0)) continue;
          var m = t + j * 60000;
          if (m >= debut && m <= fin) mins[Math.round(m / 60000)] = 1;
        }
      }
    } catch (e) { return { pas: 0, suite: 0 }; }
    var cles = Object.keys(mins).map(Number).sort(function (a, b) { return a - b; });
    var suite = 0, best = 0, prev = null;
    for (var k = 0; k < cles.length; k++) {
      suite = (prev !== null && cles[k] === prev + 1) ? suite + 1 : 1;
      if (suite > best) best = suite;
      prev = cles[k];
    }
    return { pas: pas, suite: best };
  }

  /* REFUSER NE SUFFIT PAS : IL FAUT DÉFAIRE. La fausse sieste du 7 août est déjà
     en base depuis des jours, registre ET frise. Un garde qui ne bloque que les
     nouvelles entrées laisserait l'écran menteur tel quel jusqu'à ce que la
     montre repasse par là — c'est-à-dire peut-être jamais.

     On ne retire QUE ce qui chevauche la fenêtre refusée, et QUE l'automatique :
     une sieste saisie à la main appartient à Dino, pas au moteur. */
  function flsPurgerSommeil(K, debut, fin) {
    try {
      var w = flsLire('watch_' + K, null);
      if (w && Array.isArray(w.sommeils)) {
        var reste = w.sommeils.filter(function (a) {
          if (!a || a.type === TYPE_NUIT) return true;
          return !(Math.min(a.fin, fin) - Math.max(a.debut, debut) > 0);
        });
        if (reste.length !== w.sommeils.length) {
          w.sommeils = reste;
          localStorage.setItem('watch_' + K, JSON.stringify(w));
        }
      }
      var ss = flsLire('sessions_' + K, null);
      if (!Array.isArray(ss)) return;
      var d0 = new Date(debut), d1 = new Date(fin);
      var m0 = d0.getHours() * 60 + d0.getMinutes(), m1 = d1.getHours() * 60 + d1.getMinutes();
      var garde = ss.filter(function (x) {
        if (!x || x.type !== 'nap' || !x.auto || !x.start) return true;
        var p = String(x.start).split(':'), a = (+p[0]) * 60 + (+p[1]);
        return !(Math.min(a + (x.dur || 0), m1) - Math.max(a, m0) > 0);
      });
      if (garde.length !== ss.length) {
        localStorage.setItem('sessions_' + K, JSON.stringify(garde));
        flsLog('sieste retirée de la journée ' + K + ' : elle tombait dans une marche');
      }
    } catch (e) { flsLog('purge sommeil : ' + e.message); }
  }

  /* v1429 — LE MÉNAGE DES SÉANCES QUI FINISSENT DANS LE FUTUR.

     Le 11 août à 22 h, le pont a mis la montre en mode séance pour mesurer le
     cœur à cinq secondes. La montre a ouvert une VRAIE séance et l'a rendue à
     l'app, qui l'a affichée : « Renforcement, 22h00, 467 min » — jusqu'à 5h47
     le lendemain matin. Dino n'avait rien fait, et il l'a vu tout de suite.

     La source est bouchée dans `index.html`, mais celle-là est déjà écrite. Un
     garde qui ne bloque que le flux laisse le stock tel quel — on l'a payé
     trois fois aujourd'hui avec la fausse sieste du 7 août.

     ON NE RETIRE QUE L'AUTOMATIQUE, et seulement ce qui se termine APRÈS
     maintenant. Une séance saisie à la main appartient à Dino, même mal datée.
     Une minute de marge absorbe la dérive entre l'horloge de la montre et celle
     du téléphone. */
  function flsPurgerSeancesFutures(K) {
    try {
      var ss = flsLire('sessions_' + K, null);
      if (!Array.isArray(ss) || !ss.length) return;
      var p = String(K).split('-');
      var minuit = new Date(+p[0], +p[1] - 1, +p[2], 0, 0, 0).getTime();
      var limite = Date.now() + 60000;
      var garde = ss.filter(function (x) {
        if (!x || !x.auto || !x.start) return true;
        var q = String(x.start).split(':'), m = (+q[0]) * 60 + (+q[1]);
        return (minuit + m * 60000 + (x.dur || 0) * 60000) <= limite;
      });
      if (garde.length !== ss.length) {
        localStorage.setItem('sessions_' + K, JSON.stringify(garde));
        flsLog('séance retirée ' + K + ' : elle se terminait dans le futur');
      }
    } catch (e) { flsLog('purge séances futures : ' + e.message); }
  }

  /* LE BALAYAGE, ET LA RAISON POUR LAQUELLE IL EXISTE.

     Le refus posé dans `flsPoserSommeil` ne se déclenche qu'au moment où la
     montre repropose une fenêtre. Pour un jour vieux de quatre jours, elle ne
     la reproposera jamais : la fausse sieste du 7 août serait restée à l'écran
     indéfiniment, avec le correctif présent dans le code et sans effet.

     C'est le défaut qu'on a déjà payé plusieurs fois — les fichiers d'un côté,
     leur branchement de l'autre. On relit donc les journées déjà en base, comme
     `flsPurgerSommeilsFC` le fait pour les siestes de la v1167.

     Le balayage passe AVANT `restageSleep`, dans le même passage : ce qui est
     réellement mesuré est reposé juste après. Une vraie sieste ne peut donc pas
     se perdre ici. */
  function flsBalayerSommeilMarche(K) {
    try {
      var w = flsLire('watch_' + K, null);
      if (!w || !Array.isArray(w.sommeils) || !w.sommeils.length) return;
      w.sommeils.slice().forEach(function (s) {
        if (!s || s.type === TYPE_NUIT || s.debut == null || s.fin == null) return;
        var mv = flsMarcheDans(K, s.debut, s.fin);
        if (mv.suite >= MARCHE_SUITE_MINI && mv.pas >= MARCHE_PAS_MINI) {
          flsLog('balayage ' + K + ' : sommeil de jour retiré, ' + mv.pas
                 + ' pas dedans et ' + mv.suite + ' minutes de marche d affilée');
          flsPurgerSommeil(K, s.debut, s.fin);
        }
      });
    } catch (e) { flsLog('balayage sommeil : ' + e.message); }
  }

  /* LE REGISTRE : toutes les périodes de sommeil d'une journée, jamais effacées.
     Mise à jour par CHEVAUCHEMENT, ce qui rend les resynchronisations sûres —
     la même période revient enrichie, elle ne se duplique pas. */
  function flsPoserSommeil(K, s) {
    try {
      if (!s || s.debut == null || s.fin == null || s.fin <= s.debut) return;
      /* Le refus, avant tout le reste : une fenêtre marchée n'entre pas au
         registre, donc elle ne devient pas une sieste non plus — les deux
         partent du même objet. */
      if (s.type !== TYPE_NUIT) {
        var mv = flsMarcheDans(K, s.debut, s.fin);
        if (mv.suite >= MARCHE_SUITE_MINI && mv.pas >= MARCHE_PAS_MINI) {
          flsLog('sommeil de jour REFUSÉ ' + K + ' : ' + mv.pas + ' pas dedans, '
                 + mv.suite + ' minutes de marche d affilée — ce n est pas du sommeil');
          flsPurgerSommeil(K, s.debut, s.fin);
          return;
        }
      }
      var w = flsLire('watch_' + K, null) || { hr: [], rr: [] };
      var liste = Array.isArray(w.sommeils) ? w.sommeils : [];
      var i, place = -1;
      for (i = 0; i < liste.length; i++) {
        var a = liste[i];
        if (a && Math.min(a.fin, s.fin) - Math.max(a.debut, s.debut) > 0) { place = i; break; }
      }
      if (place >= 0) {
        var av = liste[place];
        /* Même règle que pour la nuit : la mémoire de la montre est circulaire,
           une relecture tardive ne doit pas raccourcir ce qui a été mesuré. */
        if ((s.sleepMin || 0) < (av.sleepMin || 0) && av.source === s.source) return;
        liste[place] = s;
      } else liste.push(s);
      liste.sort(function (x, y) { return x.debut - y.debut; });
      w.sommeils = liste;
      localStorage.setItem('watch_' + K, JSON.stringify(w));
    } catch (e) { flsLog('registre : ' + e.message); }
  }

  /* TOUT SOMMEIL QUI N'EST PAS LA NUIT S'AJOUTE À LA JOURNÉE.
     `sessions_<K>` porte déjà les siestes (`type:'nap'`), la frise native leur
     donne `genre:'sommeil'`, la lune, et un tap ouvre leur fiche : on n'invente
     aucun écran, on remplit celui qui existe.

     v1167 — plus de condition sur le TYPE. La version précédente n'ajoutait que
     les `nap` : un sommeil de jour un peu long tombait en `secondarySleep` et ne
     créait rien du tout. Un sommeil détecté est un sommeil : il a une heure de
     début, une heure de fin, et il s'ajoute.

     Dédoublonnage sur l'heure de début, à trente minutes près : les deux moteurs
     (tranches de la montre, fréquence cardiaque) peuvent trouver la même sieste,
     elle ne doit apparaître qu'une fois. */
  function flsPoserActivite(K, s, nuitExiste) {
    try {
      /* v1421 — LE MÊME REFUS QU'AU REGISTRE, PARCE QU'IL Y A DEUX PORTES.
         La v1419 avait posé la garde dans `flsPoserSommeil` seulement. Vérifié
         sur le téléphone : le 7 août sortait bien du registre et la sieste de
         200 minutes restait à l'écran — cette fonction-ci est appelée
         directement par le re-staging, sans passer par le registre. Réparer une
         mesure, c'est corriger TOUS ses lecteurs, pas le premier trouvé. */
      if (s && s.debut != null && s.fin != null && s.type !== TYPE_NUIT) {
        var mv = flsMarcheDans(K, s.debut, s.fin);
        if (mv.suite >= MARCHE_SUITE_MINI && mv.pas >= MARCHE_PAS_MINI) {
          flsLog('sieste REFUSÉE ' + K + ' : ' + mv.pas + ' pas dedans, '
                 + mv.suite + ' minutes de marche d affilée');
          flsPurgerSommeil(K, s.debut, s.fin);
          return;
        }
      }
      /* v1188 — DORMIR DE 5 H À 7 H N'EST PAS UNE SIESTE.
         Une période ENTIÈREMENT nocturne mais trop courte pour être déclarée
         « la nuit » (moins de 2 h 30) tombe en `secondarySleep` : c'est honnête,
         le moteur ne tranche pas. Mais tout ce qui n'était pas la nuit était
         ensuite posé dans la journée sous forme de SIESTE — et Dino, réveillé à
         6 h 37, lisait « sieste de 4h59 ».
         Ce n'est pas une approximation, c'est un mot faux : une sieste est un
         sommeil de JOURNÉE. Un fragment de nuit reste au registre, où il est
         déjà conservé et daté, et attend d'être complété par la montre — la
         mémoire du bracelet est circulaire, le début de la nuit arrive souvent
         plus tard dans la matinée. On ne le jette pas ; on ne le baptise pas
         non plus. */
      /* v1191 — SAUF SI LA NUIT EXISTE DÉJÀ. Une période nocturne qui suit une
         vraie nuit, séparée d'elle par plus d'une heure et demie debout, est un
         SECOND sommeil : Dino le nomme sieste, et il a raison — il s'est
         rendormi, il ne continue pas sa nuit. Le silence de la v1188 ne
         s'applique qu'au cas où AUCUNE nuit n'a été trouvée : là, le fragment
         est un bout de nuit qui n'a pas encore fini d'arriver. */
      if (!nuitExiste && s && s.debut != null && s.fin != null
          && flsPartNocturne(s.debut, s.fin) >= CLASSIF.partNuitMini) {
        flsLog('journée ' + K + ' : période nocturne de '
          + Math.round((s.fin - s.debut) / 60000) + ' min gardée au registre, '
          + 'pas affichée en sieste — ce n est pas un sommeil de journée.');
        return;
      }
      var ss = flsLire('sessions_' + K, []) || [];
      if (!Array.isArray(ss)) ss = [];
      var d = new Date(s.debut);
      var m1 = d.getHours() * 60 + d.getMinutes();
      var hhmm = String(Math.floor(m1 / 60)).padStart(2, '0') + ':' + String(m1 % 60).padStart(2, '0');
      var dur = Math.max(1, Math.round((s.fin - s.debut) / 60000));
      for (var i = 0; i < ss.length; i++) {
        var x = ss[i];
        if (!x || x.type !== 'nap' || !x.start) continue;
        var p = String(x.start).split(':'), m0 = (+p[0]) * 60 + (+p[1]);
        if (Math.abs(m0 - m1) <= 30) {
          /* v1170 — UNE CORRECTION PEUT RACCOURCIR.
             La version précédente ne remplaçait que si la nouvelle durée était
             PLUS LONGUE — règle héritée de la nuit, dont la montre oublie le
             début. Appliquée à une sieste, elle gelait la valeur fausse : les
             3 h 04 de bourrage refusaient de redevenir 1 h 21. Une entrée
             AUTOMATIQUE appartient au moteur, il la réécrit telle qu'il la
             mesure maintenant. Une saisie manuelle, elle, n'est jamais touchée. */
          if (!x.auto) return;
          x.start = hhmm; x.dur = dur;
          x.sleepMin = s.sleepMin; x.src = s.source || 'ble';
          localStorage.setItem('sessions_' + K, JSON.stringify(ss));
          flsLog('sieste ' + K + ' : corrigée à ' + hhmm + ', ' + dur + ' min');
          return;
        }
      }
      ss.push({ type: 'nap', name: 'Sieste', icon: '😴', start: hhmm, dur: dur,
                auto: true, sleepMin: s.sleepMin, src: s.source || 'ble' });
      localStorage.setItem('sessions_' + K, JSON.stringify(ss));
      flsLog('sieste ' + K + ' : ' + hhmm + ', ' + dur + ' min — ajoutée à la journée. La nuit n a pas bougé.');
    } catch (e) { flsLog('sieste : ' + e.message); }
  }

  /* ─────────────────────────────────────────────────────────────────────────
     v1168 — LA DÉTECTION PAR FRÉQUENCE CARDIAQUE EST RETIRÉE.

     La v1167 relisait la courbe du jour et déclarait « sommeil » toute plage de
     cœur bas d'au moins vingt minutes. Résultat chez Dino : des siestes qu'il
     n'a jamais faites. C'était une erreur de conception, pas un seuil mal réglé.

     Une fréquence cardiaque basse n'est pas une preuve de sommeil. Assis, en
     voiture, devant un écran, après un effort — le cœur redescend au même
     niveau. Sans mouvement ni stades, rien ne distingue le repos du sommeil, et
     resserrer les seuils n'aurait fait que déplacer la frontière : moins de
     fausses siestes, et bientôt de vraies siestes manquées.

     Le fichier le disait déjà, en tête de StressData comme ici : une analyse ne
     se prononce que si les minutes mesurées la soutiennent, sinon elle se tait.
     J'ai enfreint cette règle ; on revient dessus.

     CE QUI RESTE, ET QUI SUFFIT. La montre découpe les stades et les envoie en
     tranches : c'est une MESURE. `nightFromChunks` en tire toutes les périodes
     du jour, la nuit principale d'un côté, le reste en activités. La sieste de
     Dino avait d'ailleurs le bon horaire dès le départ — elle était mesurée, et
     seule sa CLASSIFICATION était fausse. C'est là qu'était le vrai défaut, et
     il est corrigé sans qu'on ait besoin d'inventer quoi que ce soit.
     ───────────────────────────────────────────────────────────────────────── */

  /* LE MÉNAGE. Les siestes déduites de la fréquence cardiaque par la v1167 sont
     déjà écrites chez les utilisateurs qui ont installé cette version. On les
     retire — elles portent `source:'fc'` au registre.

     Ce qui n'est PAS touché : une sieste saisie à la main (pas de `auto`), et
     une sieste mesurée par la montre (`source:'ble'`). Et de toute façon le
     ménage passe AVANT le re-staging : ce qui est réellement mesuré est reposé
     dans la foulée par les tranches. Une vraie sieste ne peut donc pas se
     perdre ici, au pire elle est réécrite une seconde plus tard. */
  function flsPurgerSommeilsFC(K) {
    try {
      var w = flsLire('watch_' + K, null);
      if (!w || !Array.isArray(w.sommeils)) return;
      var faux = w.sommeils.filter(function (s) { return s && s.source === 'fc'; });
      if (!faux.length) return;
      var ss = flsLire('sessions_' + K, []);
      if (Array.isArray(ss)) {
        var avant = ss.length;
        ss = ss.filter(function (x) {
          if (!x || x.type !== 'nap' || !x.auto || !x.start) return true;
          var p = String(x.start).split(':'), m = (+p[0]) * 60 + (+p[1]);
          return !faux.some(function (f) {
            var d = new Date(f.debut);
            return Math.abs(d.getHours() * 60 + d.getMinutes() - m) <= 30;
          });
        });
        if (ss.length !== avant) {
          localStorage.setItem('sessions_' + K, JSON.stringify(ss));
          flsLog('ménage ' + K + ' : ' + (avant - ss.length) + ' sieste(s) déduite(s) de la fréquence cardiaque retirée(s)');
        }
      }
      w.sommeils = w.sommeils.filter(function (s) { return !(s && s.source === 'fc'); });
      localStorage.setItem('watch_' + K, JSON.stringify(w));
    } catch (e) { flsLog('ménage : ' + e.message); }
  }

  /* v1188 — LE MÉNAGE DES SIESTES QUI N'EN SONT PAS.
     Le correctif d'aujourd'hui empêche d'en écrire de nouvelles, il n'efface pas
     celles qui sont DÉJÀ dans la base — la « sieste de 4h59 » que Dino a lue à
     son réveil resterait là indéfiniment.
     On retire donc les entrées AUTOMATIQUES majoritairement nocturnes, et celles
     qui finissent après l'heure qu'il est. Une saisie manuelle n'est jamais
     touchée : si quelqu'un a noté lui-même une sieste à 5 h du matin, c'est sa
     vie, pas une mesure à corriger. Et rien n'est perdu : la période mesurée
     vit au registre, où les tranches la reposent à chaque relecture. */
  function flsPurgerFaussesSiestes(K) {
    try {
      var ss = flsLire('sessions_' + K, []);
      if (!Array.isArray(ss) || !ss.length) return;
      var p = String(K).split('-');
      var minuit = new Date(+p[0], +p[1] - 1, +p[2], 0, 0, 0).getTime();
      var nowMs = Date.now();
      var avant = ss.length;
      ss = ss.filter(function (x) {
        if (!x || x.type !== 'nap' || !x.auto || !x.start) return true;
        var q = String(x.start).split(':'), m = (+q[0]) * 60 + (+q[1]);
        var deb = minuit + m * 60000, fin = deb + (x.dur || 0) * 60000;
        if (fin > nowMs) return false;
        return flsPartNocturne(deb, fin) < CLASSIF.partNuitMini;
      });
      if (ss.length !== avant) {
        localStorage.setItem('sessions_' + K, JSON.stringify(ss));
        flsLog('ménage ' + K + ' : ' + (avant - ss.length)
          + ' « sieste(s) » retirée(s) — nocturne(s) ou finissant dans le futur.');
      }
    } catch (e) { flsLog('ménage siestes : ' + e.message); }
  }

  /* v1170 — LA FENÊTRE RÉELLE, DÉBARRASSÉE DU BOURRAGE.

     Une tranche porte TOUJOURS 240 valeurs, même quand la montre n'a mesuré que
     quatre-vingts minutes : le reste est complété par des zéros, et zéro veut
     dire « éveillé ». C'est le piège n° 2 écrit en tête de ce fichier, et le
     chemin de la nuit le traite depuis longtemps. Mon chemin des siestes, lui,
     prenait la fenêtre BRUTE du groupe : la sieste de Dino, 1 h 21 réelles,
     ressortait à 3 h 04 (15h57 → 19h01).

     On borne donc la période aux minutes qui portent vraiment un stade de
     sommeil — première et dernière — et on compte les minutes dormies au
     passage. Les zéros de remplissage ne rallongent plus rien. */
  function flsFenetreReelle(grp) {
    var f = flsFenetre(grp);
    var N = Math.round((f.end - f.start) / 60), i;
    if (!(N > 0) || N > 2000) return null;
    /* v1188 — ON NE MESURE PAS DEMAIN.
       Dino, mercredi 5 août à 6 h 37 : « il a détecté une sieste de 4h59 à
       7h01. 7h01, c'est pas passé, il est actuellement 6h37. »
       Rien, nulle part, ne comparait la fin d'une période à l'heure qu'il est.
       Une tranche mal datée par la montre — ou lue pendant qu'elle écrit encore
       — pose une fin qui n'a pas eu lieu, et tout le reste en découle : une
       durée fausse, une classification faite sur cette durée, un chiffre affiché
       au réveil qui ne peut pas être vrai.
       Une minute à venir n'est pas un trou de mesure, c'est une NON-mesure : on
       ne la compte pas, on ne l'invente pas, on s'arrête à maintenant. */
    var nowS = Math.floor(Date.now() / 1000);
    var g = new Array(N);
    for (i = 0; i < N; i++) g[i] = 0;
    grp.forEach(function (c) {
      c.stages.forEach(function (v, idx) {
        var ts = c.start + idx * 60;
        if (ts >= nowS) return;
        var mi = Math.round((ts - f.start) / 60);
        if (mi >= 0 && mi < N && (v === 1 || v === 2 || v === 3)) g[mi] = 1;
      });
    });
    var prem = -1, der = -1, n = 0;
    for (i = 0; i < N; i++) if (g[i]) { if (prem < 0) prem = i; der = i; n++; }
    if (prem < 0) return null;
    return { start: f.start + prem * 60, end: f.start + (der + 1) * 60, dormi: n };
  }

  /* La fenêtre couverte par un groupe de tranches, et les minutes dormies. */
  function flsFenetre(grp) {
    var minStart = grp[0].start, maxEnd = 0;
    grp.forEach(function (c) {
      if (c.start < minStart) minStart = c.start;
      var e = c.start + c.stages.length * 60;
      if (e > maxEnd) maxEnd = e;
    });
    /* v1188 — LA MÊME BORNE POUR LA FENÊTRE BRUTE. Le chemin de la NUIT se sert
       de celle-ci (`restageSleep` a besoin du bourrage pour projeter
       l'hypnogramme) : sans la borne ici aussi, une nuit pouvait se réveiller
       après l'heure qu'il est. Le bourrage a le droit d'exister, pas d'être
       dans le futur. */
    var nowS = Math.floor(Date.now() / 1000);
    if (maxEnd > nowS) maxEnd = nowS;
    return { start: minStart, end: maxEnd };
  }
  function flsDormi(grp, f) {
    var N = Math.round((f.end - f.start) / 60);
    if (!(N > 0) || N > 2000) return 0;
    var g = new Array(N), i;
    for (i = 0; i < N; i++) g[i] = 0;
    grp.forEach(function (c) {
      c.stages.forEach(function (v, idx) {
        var mi = Math.round((c.start + idx * 60 - f.start) / 60);
        if (mi >= 0 && mi < N && (v === 1 || v === 2 || v === 3)) g[mi] = 1;
      });
    });
    var n = 0;
    for (i = 0; i < N; i++) if (g[i]) n++;
    return n;
  }

var RESTAGE = {
    wakeDelta: 16,   // FC au-dessus de la base glissante pour un éveil (bpm)
    wakeVar: 7.0,    // variabilité locale FC mini pour un éveil (bpm)
    moveWake: 320,   // mouvement fort -> éveil (l'activité V8 est bruitée)
    baseWin: 45,     // demi-fenêtre de la base glissante (min)
    varWin: 3,       // demi-fenêtre de la variabilité locale (min)
    deepBoost: 0.8,  // (hérité) part max des candidats, désormais borné par la CIBLE
    // CIBLE PHYSIOLOGIQUE du profond (part du temps de sommeil). La littérature PSG
    // donne 13-23 % chez l'adulte, ~2 h pour une nuit de 8 h. Convertir « 80 % des
    // candidats » sans cible menait à 42 % de profond sur une FC dense : impossible.
    deepTargetFrac: 0.20,
    // Le profond s'effondre au fil de la nuit (2 premiers cycles surtout) : le score
    // d'un candidat décroît avec sa position dans la nuit.
    deepEarlyBonus: 7,
    deepVarMax: 2.5, // variabilité max d'une minute reclassée en profond
    deepMoveMax: 30, // mouvement max d'une minute reclassée en profond
    // Correcteur REM PHYSIOLOGIQUE : la puce V8 confond léger et REM. Le 1er REM
    // n'arrive jamais avant ~70min d'endormissement, et le vrai REM est consolidé.
    remLatencyMin: 60,   // REM avant coucher+60min = léger (0 = désactivé)
    remFragMax: 2,       // segment REM <= 2 min = miette de transition -> léger
    remReclassMax: 0.2,  // plafond : jamais reclasser plus de 20% du REM de base
    // ── QUALITÉ DE LA MESURE ────────────────────────────────────────────────
    // Tout ce qui précède suppose une FC nocturne. Sans elle, on ne fait que
    // recopier la puce V8 (algorithme interne opaque) : il faut le DIRE, pas
    // présenter un hypnogramme fin comme s'il était mesuré.
    minHrCoverage: 0.25, // part de minutes couvertes par la FC pour un staging « mesuré »
    partialCoverage: 0.08,
    // ── BORNES PHYSIOLOGIQUES (adulte, littérature PSG) ─────────────────────
    // Profond 13-23 % du temps de sommeil, REM 20-25 %. On ne FORCE pas la nuit
    // dans ces bornes (une vraie nuit peut sortir du rang), on plafonne seulement
    // les valeurs aberrantes que la puce produit parfois.
    deepMaxFrac: 0.32,   // au-delà : physiologiquement très improbable
    remMaxFrac: 0.35
  };

function flHHMM(m) { m = ((Math.round(m) % 1440) + 1440) % 1440; return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); }

function chunksFor() {
    var out = [], seen = {};
    var dd = flsLire('flintSleepChunks', []) || [];
    var g = [];
    dd.forEach(function (c) { if (!c || !c.start) return; var kk = c.start + '_' + ((c.stages || []).length); if (!seen[kk]) { seen[kk] = 1; out.push(c); } });
    return out;
  }

function nightFromChunks(dayKey) {
    var all = chunksFor().filter(function (c) { return c.start > 0 && c.stages && c.stages.length; });
    if (!all.length) return null;
    all.sort(function (a, b) { return a.start - b.start; });
    /* v1165 — ON REGROUPE SUR LE VRAI TROU, PAS SUR L'ÉCART ENTRE DÉBUTS.
       L'ancienne règle comparait le début d'une tranche au début de la
       PRÉCÉDENTE, seuil 5 h. Or les tranches font 4 h et se chevauchent : une
       nuit finie à 8h40 a sa dernière tranche commencée à 8h27, et une sieste de
       13 h tombait donc à 4 h 33 « d'écart » — sous le seuil. Elle rejoignait le
       groupe de la nuit, et la nuit s'étirait jusqu'au milieu de l'après-midi.
       On mesure désormais le trou RÉEL, de la fin du groupe au début de la
       tranche suivante. Quatre-vingt-dix minutes suffisent à séparer deux
       sommeils ; ce qui n'était qu'une coupure de transmission sera recollé
       juste après, par la fusion, qui elle sait regarder l'heure. */
    var nights = [], cur = [], curEnd = 0;
    all.forEach(function (c) {
      var cEnd = c.start + c.stages.length * 60;
      if (cur.length && c.start - curEnd > 90 * 60) { nights.push(cur); cur = []; curEnd = 0; }
      cur.push(c);
      if (cEnd > curEnd) curEnd = cEnd;
    });
    if (cur.length) nights.push(cur);
    /* Un trou de transmission > 5 h au MILIEU de la nuit coupait la nuit en deux
       et on ne gardait que le segment du matin (nuit de 10 h affichée 5 h).
       Fusion : trou <= 8 h ET fenêtre combinée <= 13 h = MEME nuit. */
    for (var gi = nights.length - 2; gi >= 0; gi--) {
      var A = nights[gi], B = nights[gi + 1];
      var aEnd = 0; A.forEach(function (c) { var e = c.start + c.stages.length * 60; if (e > aEnd) aEnd = e; });
      var bEnd = 0; B.forEach(function (c) { var e = c.start + c.stages.length * 60; if (e > bEnd) bEnd = e; });
      var gap = B[0].start - aEnd, span = bEnd - A[0].start;
      /* v1165 — ON NE FUSIONNE QUE CE QUI RESTE UNE NUIT.
         La règle « trou ≤ 8 h et fenêtre ≤ 13 h » a été écrite pour recoller une
         nuit coupée en deux par une panne de transmission. Elle collait aussi la
         sieste de l'après-midi à la nuit du matin : 8h40 → 15h, c'est 6 h de trou
         dans une fenêtre de 13 h, donc une « nuit » de treize heures. On exige
         désormais que la fenêtre combinée reste majoritairement nocturne : deux
         morceaux de nuit le sont, une nuit plus une sieste ne le sont pas. */
      /* C'est LE TROU qu'il faut regarder, pas la fenêtre entière. Une nuit
         coupée par une panne de transmission a son trou EN PLEINE NUIT ; une
         nuit suivie d'une sieste a le sien en plein jour. La fenêtre combinée,
         elle, reste majoritairement nocturne dans les deux cas (2h27→13h35 est
         nocturne à 68 %) : s'y fier laissait passer la sieste. */
      /* v1191 — UN RÉVEIL D'UNE HEURE ET DEMIE COUPE LA NUIT. RÈGLE DU FOUNDER.
         Dino, le 5 août : « je me suis réveillé 30 minutes, puis j'ai redormi
         une ou deux heures — là tu le mets à la nuit, tu l'ajoutes. À partir
         d'un réveil d'une heure et demie, là ce sera considéré comme une sieste
         et ce sera des sommeils complètement différents. »
         Jusqu'ici la fusion acceptait jusqu'à HUIT heures de trou, du moment
         qu'il tombait dans la plage nocturne : se rendormir de 9 h à 11 h
         rallongeait donc « la nuit » jusqu'à 11 h.
         ON NE SAIT PAS distinguer un trou de TRANSMISSION d'un vrai réveil —
         dans les deux cas la montre n'envoie rien. Entre les deux lectures, on
         prend celle qui correspond à ce qu'un humain dirait de sa propre nuit :
         au-delà d'une heure et demie debout, ce n'est plus la même nuit. Le
         second sommeil n'est pas perdu pour autant, il devient une sieste. */
      var partTrou = gap > 0 ? flsPartNocturne(aEnd * 1000, B[0].start * 1000) : 1;
      if (gap > CLASSIF.reveilCoupeNuit * 60) {
        flsLog('nuit : fusion REFUSÉE — ' + Math.round(gap / 60) + ' min debout, au-dela de '
          + CLASSIF.reveilCoupeNuit + ' min. Ce sont deux sommeils differents.');
      } else if (gap <= 8 * 3600 && span <= 13 * 3600 && partTrou >= CLASSIF.partNuitMini) {
        flsLog('nuit : fusion de 2 segments separes par un trou de ' + Math.round(gap / 60) + ' min, nocturne a ' + Math.round(partTrou * 100) + ' % (fenetre ' + Math.round(span / 3600 * 10) / 10 + ' h)');
        nights[gi] = A.concat(B); nights.splice(gi + 1, 1);
      } else if (gap <= 8 * 3600 && span <= 13 * 3600) {
        flsLog('nuit : fusion REFUSÉE — le trou de ' + Math.round(gap / 60) + ' min n est nocturne qu a ' + Math.round(partTrou * 100) + ' %. Ce sont deux sommeils différents.');
      }
    }
    /* v1165 — LE CHOIX SE FAIT SUR LA CLASSIFICATION, PLUS SUR L'ORDRE.
       Avant : « le dernier groupe dont le jour de réveil tombe ce jour-là », un
       `forEach` qui réassignait sans s'arrêter. La sieste, qui se réveille après
       la nuit, gagnait systématiquement. Désormais on classe chaque groupe et on
       retient la plus longue vraie NUIT ; les autres sont rendues au bloc
       appelant, qui les enregistre au lieu de les jeter. */
    var chosen = null, autres = [];
    nights.forEach(function (grp) {
      var f = flsFenetre(grp);
      var d = new Date(f.end * 1000);
      if (d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate() !== dayKey) return;
      /* v1170 — on CLASSE sur la fenêtre réelle, pas sur la fenêtre bourrée.
         Une sieste de 1 h 21 noyée dans une tranche de 4 h ressortait à 3 h 04,
         donc en `secondarySleep` au lieu de `nap` — et affichée à 3 h 04. */
      var reel = flsFenetreReelle(grp);
      if (!reel) return;
      var type = flsClasser(reel.start * 1000, reel.end * 1000);
      if (type === TYPE_NUIT) {
        /* La nuit principale garde la fenêtre BRUTE : `restageSleep` en a besoin
           pour projeter l'hypnogramme, et il sait déjà écarter le bourrage. */
        if (!chosen || (f.end - f.start) > (chosen.end - chosen.start)) {
          if (chosen) autres.push({ grp: chosen.grp, type: TYPE_NUIT });
          chosen = { grp: grp, start: f.start, end: f.end };
        } else autres.push({ grp: grp, type: type });
      } else if (type !== TYPE_INCONNU) {
        autres.push({ grp: grp, type: type, reel: reel });
      }
    });
    /* Ce qui n'est pas la nuit principale est enregistré tout de suite : une
       sieste rejoint la journée, tout le reste rejoint le registre. Rien ne
       disparaît, même quand aucune nuit n'a été trouvée. */
    autres.forEach(function (o) {
      var r = o.reel || flsFenetreReelle(o.grp);
      if (!r) return;
      var s = { debut: r.start * 1000, fin: r.end * 1000, type: o.type,
                sleepMin: r.dormi, source: 'ble' };
      flsPoserSommeil(dayKey, s);
      /* v1167 — plus de filtre sur le type : sieste, sommeil secondaire, tout
         ce qui n'est pas la nuit principale devient une activité de la journée.
         v1191 — et on dit à la journée si une NUIT existe déjà ce jour-là. Ça
         change tout : un sommeil du matin séparé d'une vraie nuit par plus
         d'une heure et demie EST une sieste, même s'il est encore tôt ; le même
         sommeil SANS nuit derrière lui est un bout de nuit incomplet, et on ne
         lui donne pas de nom (v1188). */
      flsPoserActivite(dayKey, s, !!chosen);
    });
    if (!chosen) {
      if (autres.length) flsLog('nuit ' + dayKey + ' : aucune période nocturne — ' + autres.length + ' sommeil(s) de journée conservé(s), la nuit précédente est intacte.');
      return null;
    }
    var start = chosen.start, N = Math.round((chosen.end - start) / 60);
    /* DIAGNOSTIC (demande du 2 aout : « pourquoi une nuit de 5 h ? ») : ce que la
       montre a VRAIMENT transmis, pour que la cause soit lisible au reveil. */
    try {
      var covMin = 0, gapsMax = 0, lastE = null;
      chosen.grp.slice().sort(function (a, b) { return a.start - b.start; }).forEach(function (c) {
        covMin += c.stages.length;
        if (lastE != null) { var g2 = Math.round((c.start - lastE) / 60); if (g2 > gapsMax) gapsMax = g2; }
        lastE = c.start + c.stages.length * 60;
      });
      flsLog('nuit ' + dayKey + ' : ' + chosen.grp.length + ' paquet(s), fenetre '
        + Math.round(N / 60 * 10) / 10 + ' h, ' + covMin + ' min transmises, plus gros trou interne '
        + gapsMax + ' min. Si la fenetre est courte, la montre n\'a pas enregistre ou pas transmis le debut de la nuit.');
    } catch (eD) {}
    if (N < 60 || N > 1000) return null;
    /* Une minute NON TRANSMISE par la montre n'est pas un réveil : c'est un TROU.
       L'ancien code initialisait tout à 'awake', donc le moindre paquet manquant
       comptait comme de l'éveil : une nuit de 10 h pouvait tomber à 3h39.
       On marque les trous, puis on les comble d'après ce qui les entoure. */
    var base = new Array(N), seen = new Array(N);
    for (var i = 0; i < N; i++) { base[i] = 'awake'; seen[i] = false; }
    chosen.grp.forEach(function (c) {
      c.stages.forEach(function (v, idx) { var mi = Math.round((c.start + idx * 60 - start) / 60); if (mi >= 0 && mi < N) { base[mi] = (v === 1 ? 'deep' : v === 2 ? 'light' : v === 3 ? 'rem' : 'awake'); seen[mi] = true; } });
    });
    /* Comblement : un trou ENTOURÉ de sommeil est du sommeil (on ne se réveille pas
       pour une minute sans raison). Un trou en bordure de nuit reste de l'éveil. */
    var comble = 0;
    for (var g0 = 0; g0 < N; g0++) {
      if (seen[g0]) continue;
      var g1 = g0; while (g1 < N && !seen[g1]) g1++;
      var avant = null; for (var a0 = g0 - 1; a0 >= 0; a0--) if (seen[a0]) { avant = base[a0]; break; }
      var apres = null; for (var a1 = g1; a1 < N; a1++) if (seen[a1]) { apres = base[a1]; break; }
      if (avant && apres && avant !== 'awake' && apres !== 'awake') {
        for (var gm = g0; gm < g1; gm++) { base[gm] = 'light'; comble++; }
      }
      g0 = g1 - 1;
    }
    if (comble) flsLog('nuit ' + dayKey + ' : ' + comble + ' min sans donnée comblées (entourées de sommeil)');
    /* ═══ MOUVEMENT (actigraphie) : on verifie d'abord qu'il est CREDIBLE ═══
       La montre renvoie un tableau d'activite par paquet (1 valeur = 2 min, doc
       SDK). Mesure du 2 aout : la MEME sequence de valeurs revient aux MEMES
       positions dans presque tous les paquets, donc a des heures reelles
       differentes (un mouvement identique toutes les 2 h, impossible). Ce canal
       est un tampon non reindexe par la montre, pas de l'actigraphie.
       Le peindre sur la nuit reviendrait a inventer des reveils : on prefere
       n'avoir AUCUN mouvement plutot qu'un faux. On le dit (mvSrc) pour que
       l'app puisse etre honnete sur ce qu'elle sait et ne sait pas. */
    var mv = new Array(N); for (var i2 = 0; i2 < N; i2++) mv[i2] = 0;
    var mvSrc = 'absent';
    (function () {
      var porteurs = chosen.grp.filter(function (c) { return (c.activity || []).some(function (v) { return v > 0; }); });
      if (!porteurs.length) return;
      /* signature = suite des valeurs non nulles ET de leurs positions. Deux
         paquets couvrant des heures differentes ne peuvent pas la partager. */
      var vus = {}, repetes = 0;
      porteurs.forEach(function (c) {
        var sig = (c.activity || []).map(function (v, i) { return v > 0 ? i + ':' + v : ''; }).filter(Boolean).join(',');
        if (vus[sig]) repetes++; else vus[sig] = 1;
      });
      if (repetes > 0) {
        mvSrc = 'non-fiable';
        flsLog('nuit ' + dayKey + ' : canal mouvement ignore (' + (repetes + 1) + ' paquets portent la meme sequence, tampon non reindexe par la montre)');
        return;
      }
      porteurs.forEach(function (c) {
        (c.activity || []).forEach(function (v, idx) {
          var mi = Math.round((c.start + idx * 120 - start) / 60);
          if (mi >= 0 && mi < N) { mv[mi] = Math.max(mv[mi], v); if (mi + 1 < N) mv[mi + 1] = Math.max(mv[mi + 1], v); }
        });
      });
      mvSrc = 'montre';
    })();
    /* v1194 — ON REND AUSSI CE QU ON SAIT DE LA QUALITE DE LA MESURE.
       `seen` dit quelles minutes ont ete REELLEMENT transmises, `comble` combien
       ont ete reconstituees. Les deux etaient calcules ici depuis longtemps et
       partaient dans un log, c est-a-dire nulle part. Sans eux, une nuit dont la
       montre n a jamais transmis le debut est INDISCERNABLE d un coucher tardif,
       et c est le mode d echec dominant : 20 % de nuits tronquees deplacent une
       moyenne de sommeil de 91 minutes. */
    return { start: start, N: N, base: base, mv: mv, mvSrc: mvSrc,
             seen: seen, comble: comble };
  }

function restageSleep(dayKey) {
    try {
      var s = flsNuitDe(dayKey) || {};
      /* La FC nocturne est LA matière du re-staging : sans elle, on ne fait que
         recopier les stades bruts de la puce. Elle vit dans watch_<K>.hr en
         minute du jour ; le re-staging la veut en horodatage absolu. */
      s.hrTs = flsHrTs(dayKey);
      var rhr = s.rhr || 50;
      var start, N, base, mv;
      // Source STABLE d'abord : les chunks. Repli sur le 0x53 si absents.
      var mvSrc = 'absent';
      var nc = nightFromChunks(dayKey);
      if (nc) {
        start = nc.start; N = nc.N; base = nc.base; mv = nc.mv; mvSrc = nc.mvSrc || 'absent';
      } else {
        var baseStages = s.stagesV8 || s.stages;
        if (!baseStages || !baseStages.length || s.sleepStart == null) return;
        start = Math.round(s.sleepStart / 1000);
        N = 0; baseStages.forEach(function (seg) { var e = seg.startMin + seg.durMin; if (e > N) N = e; });
        if (N < 60 || N > 1000) return;
        base = new Array(N); for (var i = 0; i < N; i++) base[i] = 'awake';
        baseStages.forEach(function (seg) { for (var m = seg.startMin; m < seg.startMin + seg.durMin && m < N; m++) base[m] = seg.stage; });
        mv = new Array(N); for (var i2 = 0; i2 < N; i2++) mv[i2] = 0;
        chunksFor().forEach(function (c) { (c.activity || []).forEach(function (v, idx) { var mi = Math.round((c.start + idx * 120 - start) / 60); if (mi >= 0 && mi < N) { mv[mi] = Math.max(mv[mi], v); if (mi + 1 < N) mv[mi + 1] = Math.max(mv[mi + 1], v); } }); });
      }
      if (N < 60 || N > 1000) return;
      /* SEUIL DE MOUVEMENT RELATIF. Un seuil absolu (320) etait cale sur une nuit
         precise ; il suffit d'un firmware ou d'un bracelet serre autrement pour
         qu'il devienne inatteignable (mesure du 2 aout : maximum 226, le canal
         ne declenchait plus rien). On le derive donc de la nuit elle-meme :
         nettement au-dessus de l'agitation ordinaire du dormeur. */
      var moveTh = Infinity;
      if (mvSrc === 'montre') {
        var nzv = [];
        for (var mz = 0; mz < N; mz++) if (mv[mz] > 0) nzv.push(mv[mz]);
        if (nzv.length >= 8) {
          nzv.sort(function (a, b) { return a - b; });
          moveTh = Math.max(40, nzv[Math.floor(nzv.length * 0.85)]);
        }
      }
      /* PAS PENDANT LA NUIT = LEVE, donc eveil CERTAIN. C'est le seul signal de
         mouvement de cette montre qui soit indiscutable : elle n'enregistre des
         pas que quand on marche vraiment. Ca ne voit pas les micro-reveils, mais
         ca ne ment jamais. */
      var pasMin = {};
      (function () {
        try {
          /* ═══ v1408 — CETTE PREUVE N AVAIT JAMAIS TOURNE ══════════════════════
             Elle lisait `s.stepRecs`. Ce nom n'est ECRIT NULLE PART dans le
             depot — ni ici, ni dans le moteur, ni en Swift. `recs.length` valait
             donc zero a chaque appel, la fonction sortait aussitot, et les trois
             endroits qui consultent `pasMin` plus bas evaluaient toujours faux.
             Le commentaire promettait « ca ne ment jamais » ; le code ne disait
             rien du tout.

             Meme famille que `latence` (ecrite `latenceMin`, relue `latency`) et
             que `flAnalyserPhoto` (un nom qui n'a jamais existe) : un nom qui ne
             se rejoint pas ne se plaint pas.

             LES PAS SONT LA, sous `watch_<K>.actDet` — c'est cette liste qui a
             servi a mesurer 4 032 pas pendant la « sieste » de Dino du 7 aout.
             On la lit, enfin.

             ET ON EXIGE UNE CADENCE. L'ancienne version marquait la fenetre des
             qu'UN pas apparaissait. Sur des blocs de dix minutes, un
             retournement dans le lit condamnerait dix minutes de sommeil. On
             demande donc `pasEveilCadence` — dix-huit pas par minute, le seuil
             qui sert deja a prolonger une marche. */
          var wj = flsLire('watch_' + dayKey, null) || {};
          var recs = wj.actDet || [];
          if (!recs.length) return;
          var m = flsMarcheFenetre(dayKey, start * 1000, (start + N * 60) * 1000);
          var largeur = m.largeur || 10;
          var n = 0;
          recs.forEach(function (r) {
            if (!r || !r[1]) return;                        // aucun pas sur la periode
            if (r[1] / largeur < CLASSIF.pasEveilCadence) return;   // des pas de vie, pas une marche
            var m0 = Math.round((r[0] - start) / 60);
            for (var mm = m0; mm < m0 + largeur; mm++) if (mm >= 0 && mm < N) { pasMin[mm] = 1; n++; }
          });
          if (n) flsLog('nuit ' + dayKey + ' : ' + n + ' min avec de la marche franche (leve certain)');
        } catch (e) {}
      })();
      // FC par minute (médiane) + lissage 5 min. hrTs est en horodatage absolu.
      var hrRaw = {};
      (s.hrTs || []).forEach(function (p) { var mi = Math.round((p[1] - start) / 60); (hrRaw[mi] = hrRaw[mi] || []).push(p[0]); });
      var hr = new Array(N);
      for (var m2 = 0; m2 < N; m2++) { if (hrRaw[m2] && hrRaw[m2].length) { var a = hrRaw[m2].slice().sort(function (x, y) { return x - y; }); hr[m2] = a[Math.floor(a.length / 2)]; } else hr[m2] = null; }
      function hrSm(m) { var w = []; for (var k = m - 2; k <= m + 2; k++) if (hr[k] != null) w.push(hr[k]); if (!w.length) return null; w.sort(function (a, b) { return a - b; }); return w[Math.floor(w.length / 2)]; }
      // ── Signaux dérivés (façon WHOOP : RELATIFS, pas de seuil absolu) ──
      // base GLISSANTE de FC (absorbe la dérive de la nuit) ; variabilité LOCALE.
      function hrBase(m) { var w = []; for (var k = m - RESTAGE.baseWin; k <= m + RESTAGE.baseWin; k++) if (k >= 0 && k < N && hr[k] != null) w.push(hr[k]); if (w.length < 8) return null; w.sort(function (a, b) { return a - b; }); return w[Math.floor(w.length / 2)]; }
      function hrVar(m) { var w = []; for (var k = m - RESTAGE.varWin; k <= m + RESTAGE.varWin; k++) if (k >= 0 && k < N && hr[k] != null) w.push(hr[k]); if (w.length < 3) return null; var dd = 0; for (var iv = 1; iv < w.length; iv++) dd += Math.abs(w[iv] - w[iv - 1]); return dd / (w.length - 1); }
      // 1) stade/minute = base V8 + ÉVEIL relatif (écart à la base glissante +
      //    variabilité locale + mouvement). Sans FC : on garde le prior V8 + mouvement.
      var v8 = { deep: 0, light: 0, rem: 0, awake: 0 };
      var stgArr = new Array(N), v8Stages = [], curV8 = null;
      for (var m3 = 0; m3 < N; m3++) {
        v8[base[m3]]++;
        if (curV8 && curV8.stage === base[m3]) curV8.durMin++; else { curV8 = { stage: base[m3], startMin: m3, durMin: 1 }; v8Stages.push(curV8); }
        var h = hrSm(m3), aw;
        if (h != null) { var bb = hrBase(m3), vv = hrVar(m3);
          // FC haute+variable = éveil, SAUF sur du REM V8 : le REM a lui aussi des
          // pics de FC variables (retrait vagal) et la V8 l'a déjà identifié via son
          // accéléro (immobilité). On ne le vole PAS à l'éveil, sauf vrai mouvement.
          aw = pasMin[m3] === 1 || mv[m3] > moveTh || (base[m3] !== 'rem' && bb != null && vv != null && h > bb + RESTAGE.wakeDelta && vv > RESTAGE.wakeVar);
        } else { aw = pasMin[m3] === 1 || base[m3] === 'awake' || mv[m3] > moveTh; }
        stgArr[m3] = aw ? 'awake' : base[m3];
      }
      // 2) persistance : un éveil ISOLÉ d'1 min entre deux sommeils = artefact.
      for (var mp = 1; mp < N - 1; mp++) if (stgArr[mp] === 'awake' && stgArr[mp - 1] !== 'awake' && stgArr[mp + 1] !== 'awake') stgArr[mp] = stgArr[mp + 1];
      // 2b) MIROIR : une minute de sommeil ISOLÉE entre deux éveils = bruit (la puce
      //     V8 clignote léger/éveil au réveil du matin). Sans ça, un blip d'1 min
      //     fixait le réveil trop tard (07:54 au lieu de 07:50).
      for (var mq = 1; mq < N - 1; mq++) if (stgArr[mq] !== 'awake' && stgArr[mq - 1] === 'awake' && stgArr[mq + 1] === 'awake') stgArr[mq] = 'awake';
      // 2c) correcteur REM PHYSIOLOGIQUE (la puce V8 sur-classe du léger en REM).
      //     Reclasse en LÉGER : le REM trop précoce (< coucher+remLatencyMin, le
      //     1er REM n'existe pas avant ~70min) + les miettes (segment <= remFragMax).
      //     Plafonné à remReclassMax du REM de base (anti-surajustement). AVANT le
      //     deepBoost pour que le léger libéré redevienne éligible. PAS de FC/mouvement
      //     ici (ils sur-corrigent ; le signal fiable est temporel + morphologique).
      if (RESTAGE.remLatencyMin > 0 || RESTAGE.remFragMax > 0) {
        var onsetM = 0; while (onsetM < N && stgArr[onsetM] === 'awake') onsetM++;
        var remBase = 0; for (var mr0 = 0; mr0 < N; mr0++) if (stgArr[mr0] === 'rem') remBase++;
        var segLen = new Array(N); for (var sl = 0; sl < N; sl++) segLen[sl] = 0;
        var r0 = 0; while (r0 < N) { if (stgArr[r0] === 'rem') { var r1 = r0; while (r1 < N && stgArr[r1] === 'rem') r1++; for (var r2 = r0; r2 < r1; r2++) segLen[r2] = r1 - r0; r0 = r1; } else r0++; }
        var remFix = [];
        for (var mrr = 0; mrr < N; mrr++) { if (stgArr[mrr] !== 'rem') continue;
          if ((mrr - onsetM) < RESTAGE.remLatencyMin || segLen[mrr] <= RESTAGE.remFragMax) remFix.push(mrr); }
        var remCap = Math.floor(remBase * RESTAGE.remReclassMax);
        remFix.slice(0, remCap).forEach(function (m) { stgArr[m] = 'light'; });
      }
      // 3) correction DOUCE du profond : les minutes LÉGER à signature profond (FC
      //    sous la base glissante + très stable + immobiles) reclassées, plafond
      //    RESTAGE.deepBoost, bonus au 1er tiers de nuit (profond concentré tôt).
      if (RESTAGE.deepBoost > 0) {
        var onsetD = 0; while (onsetD < N && stgArr[onsetD] === 'awake') onsetD++;
        var spanD = Math.max(1, N - onsetD);
        var cand = [], deepNow = 0, asleepNow = 0;
        for (var mc = 0; mc < N; mc++) {
          if (stgArr[mc] === 'deep') deepNow++;
          if (stgArr[mc] !== 'awake') asleepNow++;
          if (stgArr[mc] !== 'light') continue;
          var hc = hrSm(mc), bc = hrBase(mc), vc = hrVar(mc);
          if (hc == null || bc == null || vc == null || (mvSrc === 'montre' && mv[mc] > RESTAGE.deepMoveMax) || pasMin[mc] === 1) continue;
          if (hc > bc || vc > RESTAGE.deepVarMax) continue;
          /* Position dans la nuit : 0 = endormissement, 1 = réveil. Le profond vit
             dans les 2 premiers cycles ; au-delà, un candidat doit être BEAUCOUP
             plus convaincant (FC très basse, très stable) pour être retenu. */
          var posD = Math.max(0, Math.min(1, (mc - onsetD) / spanD));
          var scoreD = (bc - hc) - vc * 2 + RESTAGE.deepEarlyBonus * (1 - posD * 1.6);
          cand.push([mc, scoreD]);
        }
        cand.sort(function (a, b) { return b[1] - a[1]; });
        /* On convertit jusqu'à la CIBLE physiologique, pas jusqu'à un pourcentage
           de candidats : sinon une FC dense produit 40 %+ de profond (impossible). */
        /* ═══ v1400 — LA CIBLE DEVIENT UN PLAFOND, ELLE N'EST PLUS UN OBJECTIF ═══
           Cette boucle convertissait des minutes en profond JUSQU'A atteindre
           20 % du sommeil, quel que soit ce que disait le signal. Resultat,
           mesure sur les dix nuits de Felix : CINQ atterrissent exactement sur
           `round(sommeil x 0,20)`.

               nuit    puce    FLINT   sommeil   round(x0,20)
               1er      110     115      574        115
               2         82      91      454         91
               3         69      71      354         71
               8         55      72      361         72       <- 17 min fabriquees
               9        124      97      487         97

           La nuit du 8 aout passait ainsi de 14,1 % a 19,9 % de profond. Et la
           dispersion naturelle etait ecrasee : la puce s'etale de 14,1 a 22,5 %,
           FLINT de 19,9 a 22,9 %. Les deux tiers de la variation disparaissaient.

           Un chiffre qui atterrit toujours sur la meme cible n'est pas une
           mesure, c'est la cible. On ne convertit donc plus QUE les minutes qui
           portent vraiment la signature du profond — frequence sous la ligne de
           base ET faible variabilite, c'est-a-dire un score positif — et la
           cible ne sert plus que de garde-fou haut.

           UNE NUIT A 14 % DOIT RESTER A 14 %, et l'ecran doit pouvoir le dire. */
        /* ═══ PREMIERE TENTATIVE, GARDEE POUR MEMOIRE, ET ELLE ETAIT FAUSSE ═══
           J'ai d'abord transforme la cible de 20 % en plafond de 32 % avec un
           filtre « score positif ». Rejoue sur les dix nuits : HUIT atterrissent
           sur 31,8 a 32,1 %. J'avais remplace une constante par une autre. Le
           filtre ne filtrait rien, parce que `deepEarlyBonus` vaut 7 et rend
           positif presque tout candidat du premier tiers de nuit.

           ON NE CONVERTIT PLUS. Le profond de la puce est le SEUL chiffre de
           cette famille valide contre une reference exterieure : le 8 aout,
           elle donne 55 minutes et l'application du fabricant affiche 55. Notre
           conversion le poussait a 72, puis a 106 avec ma correction, sans que
           rien ne valide ni l'un ni l'autre.

           Perfection = soustraction. On garde la mesure, on retire la fabrication. */
        var conv = 0;
        /* v1400 — LA PROVENANCE, comme pour `stageSrc`. Sans elle, personne ne
           peut savoir si le profond affiche vient de la puce ou de nous. */
        s.profondConverti = conv;
        s.profondSource = conv > 0 ? 'converti' : 'puce';
      }
      // 3b) COUVERTURE FC : combien de minutes de la nuit ont une vraie mesure ?
      //     C'est ce qui décide si notre staging vaut mieux que la puce V8.
      var hrCov = 0; for (var mh = 0; mh < N; mh++) if (hr[mh] != null) hrCov++;
      var covFrac = N > 0 ? hrCov / N : 0;
      var stageSrc = covFrac >= RESTAGE.minHrCoverage ? 'flint-hr'
                   : (covFrac >= RESTAGE.partialCoverage ? 'flint-partiel' : 'montre');
      // NE PAS écraser par le prior brut : les corrections 2/2b/2c (éveils isolés,
      // miroir, miettes de REM) ne dépendent PAS de la FC et NETTOIENT le bruit de
      // la puce. Les avoir annulées faisait chuter une nuit de 10 h à 3h39 : chaque
      // micro-blip d'éveil de la puce redevenait un vrai réveil.
      // 4) segments + agrégats depuis le stade/minute.
      var agg = { deep: 0, light: 0, rem: 0, awake: 0 };
      var newStages = [], cur = null;
      for (var m4 = 0; m4 < N; m4++) { var stg = stgArr[m4]; agg[stg]++;
        if (cur && cur.stage === stg) cur.durMin++; else { cur = { stage: stg, startMin: m4, durMin: 1 }; newStages.push(cur); } }
      // Rogner la TRAÎNE d'ÉVEIL finale : après le dernier vrai sommeil, la montre
      // continue d'enregistrer alors qu'on est DEBOUT (hors du lit). WHOOP coupe la
      // fenêtre à la sortie du lit -> pareil ici : le réveil = fin du dernier sommeil.
      // (On garde l'éveil du MILIEU de nuit = WASO ; on ne coupe que la queue.)
      var lastSleep = -1;
      for (var ls = newStages.length - 1; ls >= 0; ls--) { if (newStages[ls].stage !== 'awake') { lastSleep = newStages[ls].startMin + newStages[ls].durMin - 1; break; } }
      if (lastSleep >= 0 && lastSleep + 1 < N) {
        agg.awake -= (N - (lastSleep + 1));
        N = lastSleep + 1;
        newStages = newStages.filter(function (seg) { return seg.startMin < N; });
        var lastSeg = newStages[newStages.length - 1];
        if (lastSeg && lastSeg.startMin + lastSeg.durMin > N) lastSeg.durMin = N - lastSeg.startMin;
      }
      var asleep = agg.deep + agg.light + agg.rem;
      if (asleep < 30) return;
      /* GARDE-FOU : UNE NUIT NE RETRECIT JAMAIS.
         La memoire de la montre est circulaire : quelques heures plus tard, elle
         ne renvoie plus que la FIN de la nuit. Le re-staging, qui repart de ces
         paquets, reecrivait alors l'histoire a la baisse (2 aout : 7h39 mesurees
         le matin, 3h48 l'apres-midi, avec 11 paquets tombes a 3). La mesure
         d'epoque est la verite : on ne remplace une nuit que par une nuit AU
         MOINS aussi longue, ou par une nuit qui couvre une autre fenetre.
         Meme regle que pour les seances et la FC des jours passes. */
      var _prev = flsNuitDe(dayKey);
      if (_prev && _prev.sleepMin != null && _prev.sleepStart != null && _prev.sleepEnd != null) {
        var _newStart = start * 1000, _newEnd = (start + N * 60) * 1000;
        var _chevauche = Math.min(_prev.sleepEnd, _newEnd) - Math.max(_prev.sleepStart, _newStart) > 0;
        /* ═══ v1310 — « PLUS COURT » N'EST PAS « MOINS COMPLET » ═══════════════
           Le garde-fou ci-dessus protege d'un vrai defaut, et il reste entier :
           quand la montre a oublie le debut de la nuit, la fenetre RETRECIT et
           l'ancienne mesure est la bonne.

           Mais il refusait aussi les recalculs faits sur la MEME fenetre. Le
           9 aout, la nuit de Felix a ete recalculee alors que le plafond de
           `wSaveK` venait de detruire sa frequence cardiaque nocturne : sans FC,
           le re-staging ne voyait plus aucun reveil et rendait 12 min d'eveil
           pour 557 min de sommeil. Une fois la FC rendue par le rattrapage, le
           recalcul retrouvait 86 min d'eveil — donc MOINS de sommeil — et se
           faisait rejeter par cette regle. Le mauvais chiffre etait verrouille
           par celui qui devait le corriger.

           Felix, lui, se souvenait tres bien de son reveil : « de quatre heures
           neuf a cinq heures et quelques ». Le calcul le retrouvait ; c'est
           l'ecriture qui etait bloquee.

           ON COMPARE DONC LA FENETRE, PAS LE TOTAL. Si la nouvelle couvre
           entierement l'ancienne, les donnees sont au moins aussi completes et
           le nouveau classement fait foi, meme s'il rend moins de sommeil. */
        var _tol = 120000;   /* deux minutes : une tranche peut decaler d'un cran */
        var _couvre = (_newStart <= _prev.sleepStart + _tol) && (_newEnd >= _prev.sleepEnd - _tol);
        if (_chevauche && !_couvre && asleep < _prev.sleepMin) {
          flsLog('nuit ' + dayKey + ' : recalcul plus court (' + asleep + ' < ' + _prev.sleepMin +
              ' min) SUR UNE FENETRE PLUS ETROITE, la montre a oublie le debut. ' +
              'Mesure d\'epoque conservee.');
          return;
        }
        if (_chevauche && _couvre && asleep < _prev.sleepMin) {
          flsLog('nuit ' + dayKey + ' : recalcul plus court (' + asleep + ' < ' + _prev.sleepMin +
              ' min) mais sur la MEME fenetre — le classement a change, pas les ' +
              'donnees. On ecrit.');
        }
      }
      // Original V8 (issu de la source stable) conservé pour recalibrage.
      s.stagesV8 = v8Stages; s.deepV8 = v8.deep; s.lightV8 = v8.light; s.remV8 = v8.rem;
      s.awakeV8 = v8.awake; s.sleepMinV8 = v8.deep + v8.light + v8.rem;
      // Nuit re-staged, fenêtre CANONIQUE (issue des chunks, stable).
      var d0 = new Date(start * 1000), dEnd = new Date((start + N * 60) * 1000);
      s.source = 'ble';
      s.sleepStart = start * 1000; s.sleepEnd = (start + N * 60) * 1000;
      s.timeInBed = N; s.sleepMin = asleep;
      s.deep = agg.deep; s.light = agg.light; s.rem = agg.rem; s.awake = agg.awake;
      /* v1274 — LA LATENCE D'ENDORMISSEMENT, calculée depuis toujours et jetée.
         Le nombre de minutes d'éveil avant le premier vrai stade est déjà
         compté ligne 830 sous le nom `onsetM`, pour replacer le paradoxal. On
         le conservait nulle part, alors que c'est une mesure clinique standard
         et que l'app du fabricant l'affiche (4 min sur la nuit du 8 août).
         Au-delà de 90 minutes on ne la rend pas : ce n'est plus une latence,
         c'est une fenêtre mal découpée, et un chiffre absurde vaut moins que
         pas de chiffre. */
      var _lat = 0; while (_lat < stgArr.length && stgArr[_lat] === 'awake') _lat++;
      s.latenceMin = (_lat >= 0 && _lat <= 90) ? _lat : null;
      s.stages = newStages;
      s.bedMin = d0.getHours() * 60 + d0.getMinutes();
      s.wakeMin = dEnd.getHours() * 60 + dEnd.getMinutes();
      s.sleepMap = 'flint-restage-v1';
      /* PROVENANCE des stades : l'app doit pouvoir dire d'où ils sortent :
         'flint-hr'      = notre analyse, FC nocturne suffisante
         'flint-partiel' = notre analyse, FC clairsemée (profond fiable, REM moins)
         'montre'        = aucune FC : stades bruts de la puce, non vérifiables      */
      s.stageSrc = stageSrc;
      s.moveSrc = mvSrc;   /* 'montre' | 'non-fiable' | 'absent' : ce qu'on sait vraiment du mouvement */
      s.hrCoverage = Math.round(covFrac * 100);
      /* Bornes physiologiques : on ne réécrit pas la nuit, on SIGNALE l'aberration
         (profond > 32 % ou REM > 35 % du sommeil n'existe quasiment pas chez l'adulte). */
      s.stageOdd = (asleep > 0 && (agg.deep / asleep > RESTAGE.deepMaxFrac ||
                                   agg.rem / asleep > RESTAGE.remMaxFrac)) ? 1 : 0;
      /* ═══ v1194 — INSTRUMENTATION DE LA MESURE (etape 0 de la Voie A) ═══
         Aucun calcul de besoin ici, aucun affichage : on ECRIT seulement ce que
         le moteur savait deja et jetait. Ces champs ne peuvent pas etre obtenus
         retroactivement (les tranches brutes sont purgees a huit jours), donc
         plus tot ils existent, plus tot la mesure devient possible.

         `N` a pu etre rogne juste au-dessus (la traine d eveil finale est
         coupee) : la couverture est donc calculee sur la fenetre FINALE, celle
         qui est reellement publiee, et pas sur celle des tranches. */
      (function(){
        try{
          if (nc && nc.seen) {
            var vus = 0, i5;
            for (i5 = 0; i5 < N; i5++) if (nc.seen[i5]) vus++;
            s.couvertureTranches = Math.round(vus / Math.max(1, N) * 100);
            /* BORD MANQUANT, tolerance dix minutes de chaque cote. Une nuit dont
               le premier ou le dernier quart d heure n a jamais ete transmis est
               une nuit tronquee : aucun estimateur de duree n y survit, il faut
               la reconnaitre pour l ecarter. */
            var bd = true, bf = true, k5;
            for (k5 = 0; k5 < Math.min(10, N); k5++) if (nc.seen[k5]) { bd = false; break; }
            for (k5 = Math.max(0, N - 10); k5 < N; k5++) if (nc.seen[k5]) { bf = false; break; }
            s.bordManquant = !!(bd || bf);
            s.minutesComblees = nc.comble || 0;
          } else {
            /* Repli sur le 0x53 : on ne sait rien de la couverture. On l ecrit
               comme INCONNU, jamais comme zero ni comme cent. */
            s.couvertureTranches = null; s.bordManquant = null; s.minutesComblees = null;
          }
          /* Le fuseau au moment de l assemblage : seule detection possible d un
             voyage transmeridien ou d un changement d heure sans localisation
             continue. Sans lui, un fragment de nuit d avion injecte un deficit
             fictif de plusieurs heures. */
          s.offsetUTC = new Date(start * 1000).getTimezoneOffset();
          s.moteurVersion = MOTEUR_VERSION;
        }catch(eI){ flsLog('instrumentation : ' + eI.message); }
      })();
      flsEcrireNuit(dayKey, s);
      /* La nuit entre aussi au registre : une journée doit pouvoir énumérer
         TOUTES ses périodes de sommeil, la principale comprise. */
      flsPoserSommeil(dayKey, { debut: s.sleepStart, fin: s.sleepEnd, type: TYPE_NUIT,
                                sleepMin: s.sleepMin, timeInBed: s.timeInBed, source: 'ble' });
      flsLog('🌙 re-staging ' + dayKey + ': ' + Math.floor(asleep / 60) + 'h' + String(asleep % 60).padStart(2, '0') +
          ' [' + flHHMM(s.bedMin) + '-' + flHHMM(s.wakeMin) + '] éveil ' + agg.awake + ' min (V8 ' + Math.floor(s.sleepMinV8 / 60) + 'h' + String(s.sleepMinV8 % 60).padStart(2, '0') + ')'
          + ' | source ' + stageSrc + ' (FC ' + Math.round(covFrac * 100) + '% des minutes)'
          + ' | profond ' + Math.round(agg.deep / Math.max(1, asleep) * 100) + '% REM ' + Math.round(agg.rem / Math.max(1, asleep) * 100) + '%');
      /* S14 : l'histogramme de récupération 7 j était vide parce que recov_ des
         jours passés n'était jamais réécrit. Chaque nuit intégrée recalcule le sien. */
      
    } catch (e) { flsLog('restage: ' + e.message); }
  }
  /* ── Entrée unique, appelée par le natif ──────────────────────────────────
     Reçoit une tranche telle que la montre l'a envoyée, l'accumule, puis
     recalcule la nuit du jour concerné et celle de la veille (une nuit à cheval
     sur minuit appartient au jour du réveil). */
  window.flintSommeilTranche = function (tranche) {
    try {
      if (!tranche || !tranche.start) return;
      var stades = tranche.stages || [];
      var mouvement = tranche.activity || [];
      if (!stades.length && !mouvement.length) return;
      var toutes = flsLire('flintSleepChunks', []) || [];
      if (!Array.isArray(toutes)) toutes = [];
      var deja = toutes.some(function (c) {
        return c.start === tranche.start && (c.stages || []).length === stades.length;
      });
      if (!deja) {
        toutes.push({ start: tranche.start, unit: tranche.unit || 1, stages: stades, activity: mouvement });
        /* purge par ANCIENNETÉ, jamais par rang : couper « les N derniers »
           pouvait retirer le DÉBUT de la nuit en cours si les tranches
           arrivaient dans le désordre. */
        if (toutes.length > 60) {
          var limite = Math.floor(Date.now() / 1000) - 8 * 86400;
          toutes = toutes.filter(function (c) { return c.start >= limite; });
          if (toutes.length > 60) {
            toutes.sort(function (a, b) { return a.start - b.start; });
            toutes = toutes.slice(-60);
          }
        }
        try { localStorage.setItem('flintSleepChunks', JSON.stringify(toutes)); } catch (e) {}
      }
      window.flintSommeilRecalculer();
    } catch (e) { flsLog('tranche : ' + e.message); }
  };

  /* DEUX MOTEURS ÉCRIVENT AU MÊME ENDROIT.
     À chaque `nightlog`, l'app calcule sa propre nuit (découpage par percentiles
     de fréquence cardiaque) et l'écrit dans watch_<K>.night — le même champ que
     nous. Le dernier qui écrit gagne, et le sien n'a NI segments NI provenance :
     mesuré sur l'appareil, la nuit du 2 au 3 août avait ses totaux mais aucun
     hypnogramme, donc rien à afficher sur le graphe des phases.
     On écoute donc l'événement que l'app émet à chaque donnée reçue, et on
     reprend la main juste après. Aucune modification de son code. */
  try {
    document.addEventListener('flintWatch', function (e) {
      try {
        var t = e && e.detail && e.detail.type;
        if (t === 'nightlog' || t === 'hr') {
          clearTimeout(window._flsRepriseT);
          window._flsRepriseT = setTimeout(function () { window.flintSommeilRecalculer(); }, 900);
        }
      } catch (er) {}
    });
  } catch (e) {}

  /* v1165 — LA CLASSIFICATION EST PUBLIÉE.
     L'autre moteur (`computeNight`, dans index.html, celui qui découpe la nuit
     par percentiles de fréquence cardiaque quand la montre ne donne pas de
     stades) écrit dans le MÊME champ `watch_<K>.night`. Il doit pouvoir poser la
     même question que nous avant d'écraser quoi que ce soit — sinon on aurait
     réparé une porte et laissé l'autre ouverte. */
  window.flSommeilClasser = function (debutMs, finMs) { return flsClasser(debutMs, finMs); };
  window.flSommeilPartNocturne = function (debutMs, finMs) { return flsPartNocturne(debutMs, finMs); };
  /* v1168 — `flSommeilPoser` et `flSommeilPoserSieste` sont retirées. Elles
     n'existaient que pour laisser `computeNight` enregistrer ce qu'il croyait
     voir dans la fréquence cardiaque, et c'est précisément ce qui fabriquait de
     fausses siestes. Une porte ouverte finit toujours par servir : on la ferme.
     Seule la MESURE de la montre crée une période de sommeil. */
  window.flSommeilDuJour = function (K) {
    var w = flsLire('watch_' + K, null);
    return (w && Array.isArray(w.sommeils)) ? w.sommeils : [];
  };

  /* Recalcule les nuits des derniers jours et rafraîchit l'écran. */
  /* ═══════════════════════════════════════════════════════════════════════
     CORRIGER UNE NUIT À LA MAIN

     POURQUOI ÇA EXISTE. Le 6 août, Dino se rendort après 6h06 et NI WHOOP NI
     FLINT ne le voient. WHOOP a un bouton « modifier le temps passé au lit » :
     il corrige la fenêtre, l'app restade toute la nuit, et le sommeil passe de
     4h24 à 5h40. Nous n'avions pas cette porte.

     C'EST UNE MESURE, PAS UN AVIS. La personne SAIT à quelle heure elle s'est
     couchée et levée ; le bracelet le déduit. Quand les deux divergent, c'est
     elle qui a raison. Refuser sa correction, c'est préférer une inférence à un
     témoignage.

     `source:'manuel'` EST LA CLÉ DE VOÛTE. Tout le moteur sait déjà s'en servir :
     `flsPoserActivite` ne réécrit que ce qui porte `auto`, le ménage des fausses
     siestes ne touche que `source:'fc'`, et la règle « une relecture tardive ne
     raccourcit pas ce qui a été mesuré » ne s'applique qu'entre entrées de MÊME
     source. Une saisie manuelle traverse donc toutes les resynchronisations sans
     être écrasée — c'était vrai avant que cette fonction existe, il manquait
     seulement de quoi en poser une.

     CE QU'ON NE FAIT PAS : inventer des stades. On corrige la FENÊTRE, et le
     staging se recalcule sur la courbe cardiaque réelle de cette fenêtre. Si le
     bracelet n'a rien mesuré entre 6h et 8h, on ne fabriquera pas du sommeil
     profond pour remplir — on rendra une nuit plus longue avec des stades
     inconnus, et ce sera honnête.

     Les minutes sont comptées depuis minuit du jour K. Un coucher la veille se
     donne en négatif ou au-delà de 1440 ; on ramène au cadran. */
  window.flSommeilManuel = function (K, coucherMin, reveilMin) {
    try {
      if (!K) { var _n0 = new Date();
                K = _n0.getFullYear() + '-' + (_n0.getMonth() + 1) + '-' + _n0.getDate(); }
      var d = new Date(K.split('-')[0], +K.split('-')[1] - 1, +K.split('-')[2]);
      var minuit = d.getTime();
      var deb = minuit + coucherMin * 60000, fin = minuit + reveilMin * 60000;
      /* Un coucher après le lever ne peut vouloir dire qu'une chose : on s'est
         couché la veille. On ne refuse pas, on interprète. */
      if (fin <= deb) deb -= 86400000;
      var duree = Math.round((fin - deb) / 60000);
      if (duree < CLASSIF.dureeMiniRetenue || duree > 1000) {
        flsLog('saisie manuelle refusée : ' + duree + ' min hors bornes');
        return { ok: false, raison: 'duree' };
      }
      var type = flsClasser(deb, fin);
      flsPoserSommeil(K, { debut: deb, fin: fin, sleepMin: duree,
                           type: type, source: 'manuel', mainSleep: type === TYPE_NUIT });
      /* La nuit du jour, celle que lisent les écrans, suit la correction. Les
         stades ne sont PAS recopiés : ils appartiennent au restage, qui les
         recalculera sur la vraie courbe de la nouvelle fenêtre. */
      if (type === TYPE_NUIT) {
        var w = flsLire('watch_' + K, null) || {};
        var n = w.night || {};
        var dd = new Date(deb), df = new Date(fin);
        n.bedMin = dd.getHours() * 60 + dd.getMinutes();
        n.wakeMin = df.getHours() * 60 + df.getMinutes();
        n.timeInBed = duree;
        if (n.sleepMin == null || n.sleepMin > duree) n.sleepMin = duree;
        n.source = 'manuel';
        w.night = n;
        localStorage.setItem('watch_' + K, JSON.stringify(w));
      } else {
        flsPoserActivite(K, { debut: deb, fin: fin, sleepMin: duree, source: 'manuel' });
      }
      flsLog('saisie manuelle ' + K + ' : ' + duree + ' min, classée ' + type);
      return { ok: true, type: type, dureeMin: duree };
    } catch (e) { flsLog('saisie manuelle : ' + e.message); return { ok: false, raison: 'erreur' }; }
  };

  window.flintSommeilRecalculer = function () {
    try {
      var jours = {};
      (flsLire('flintSleepChunks', []) || []).forEach(function (c) {
        var d = new Date(c.start * 1000);
        for (var k = 0; k <= 1; k++) {            /* le jour du bloc et le lendemain */
          var dd = new Date(d.getTime() + k * 86400000);
          jours[dd.getFullYear() + '-' + (dd.getMonth() + 1) + '-' + dd.getDate()] = 1;
        }
      });
      /* Les huit derniers jours, même sans aucune tranche : c'est là que le
         ménage doit passer, chez ceux qui ont installé la v1167 et récolté des
         siestes déduites de la fréquence cardiaque. */
      var d0 = new Date();
      for (var j = 0; j <= 7; j++) {
        var dj = new Date(d0.getTime() - j * 86400000);
        jours[dj.getFullYear() + '-' + (dj.getMonth() + 1) + '-' + dj.getDate()] = 1;
      }
      /* LE MÉNAGE D'ABORD, le re-staging ensuite : ce qui est réellement mesuré
         par la montre est reposé juste après, dans le même passage. Une vraie
         sieste ne peut donc pas se perdre au nettoyage. */
      Object.keys(jours).forEach(function (K) { flsPurgerSommeilsFC(K); });
      Object.keys(jours).forEach(function (K) { flsPurgerFaussesSiestes(K); });
      Object.keys(jours).forEach(function (K) { flsBalayerSommeilMarche(K); });
      Object.keys(jours).forEach(function (K) { flsPurgerSeancesFutures(K); });
      Object.keys(jours).forEach(function (K) { restageSleep(K); });
      flsDiagnostic();
      /* Rafraîchissement SILENCIEUX : mettre la nuit à jour ne doit pas
         ramener l'utilisateur sur l'accueil ni faire vibrer le téléphone, ce
         que faisait flOuvrirAccueilNatif appelé à chaque tranche reçue.

         v1348 — ET IL ATTEND LA FIN DE LA RAFALE.
         Le RECALCUL, lui, reste immédiat : `flintSommeilTranche` doit avoir
         intégré sa tranche quand elle rend la main — c'est le contrat que les
         tests du moteur vérifient, et rien ne doit pouvoir se perdre en route.
         Ce qui est différé, c'est L'AVIS AU NATIF, qui n'a aucun de ces
         devoirs.

         Le bracelet livre une nuit en dizaines de tranches. Chacune postait
         l'accueil ET le sommeil à l'application, qui les décodait, les posait,
         et redessinait la page — donc la courbe cardiaque de « Ma nuit » se
         reconstruisait sous les yeux de qui la lisait, pendant une quarantaine
         de secondes (Dino, deux captures à 35 s d'écart : courbe lisse, puis
         courbe à pics). Une seule notification par rafale suffit : celle qui
         porte la nuit COMPLÈTE.

         Même frein, même minuteur que celui des événements `nightlog`/`hr`
         quinze lignes plus haut — dernier recalcul + 700 ms. */
      try {
        clearTimeout(window._flsAvisT);
        window._flsAvisT = setTimeout(function () {
          try {
            if (window.flRafraichirDonnees) window.flRafraichirDonnees();
            else if (window.flOuvrirAccueilNatif) window.flOuvrirAccueilNatif();
          } catch (e) {}
        }, 700);
      } catch (e) {}
    } catch (e) { flsLog('recalcul : ' + e.message); }
  };
})();
