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
  var MOTEUR_VERSION = 'restage-2026-09-01c';

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
        var min0 = flsMinuit(K);
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

  /* LE PORTIER D'ÉCRITURE DU SOMMEIL (30 août 2026, commercialisation).
     Ce fichier écrivait en `localStorage.setItem` direct, sous des try/catch
     muets : à stockage plein, c'était précisément la NUIT — la donnée
     irremplaçable, celle que `flFaireDeLaPlace` protège partout ailleurs —
     qui échouait la première, sans faire de place, sans reprise, sans trace.
     La règle n°3 de la maison (« on sacrifie le brut, jamais le résumé »)
     était inversée ici. Ce portier est le miroir exact de `DB.set` : il ne
     jette jamais, fait de la place, réessaie UNE fois, et dit son échec. */
  /* La marque de DB, sans dépendre de l'ordre de chargement des fichiers. */
  function flsMarquer(cle) {
    try { if (typeof DB !== 'undefined' && DB && typeof DB.marque === 'function') DB.marque(cle); }
    catch (e) {}
  }

  function flsEcrire(cle, valeur) {
    var s;
    try { s = JSON.stringify(valeur); } catch (e) { flsLog('ECHEC-ECRITURE ' + cle + ' : ' + e.message); return false; }
    /* ═══ 13 sept. 2026 — LE MOTEUR DE SOMMEIL ÉCRIVAIT SANS LE DIRE ══════
       `DB.set` termine par `DB.marque(cle)`, qui fait avancer le compteur de la
       FAMILLE écrite. C'est sur ces compteurs que toutes les mémoires du moteur
       scellent leur validité — `_flScoreMemo`, `_flReposMemo`, celles de
       flint-oxygene, flint-porte, flint-respiration. Ce portier-ci, lui,
       appelait `localStorage.setItem` à nu : une nuit corrigée au stylo, une
       nuit re-stagée, une reprise, ne faisaient bouger AUCUN compteur, et les
       mémoires continuaient de servir le calcul d'avant. Mesuré : après une
       écriture de `watch_<K>` par ce chemin, `flScoreSommeil(K)` rendait encore
       417 min de sommeil pour une nuit qui en portait 357.
       La règle de la maison est à une seule phrase — une mémoire ne survit
       JAMAIS à une modification de ce dont elle dépend — et ce fichier en
       sortait par la porte de service.
       Le coût a été mesuré avant d'être accepté, parce que
       `flintSommeilRecalculer` refait TOUTES les nuits d'un coup : 138 ms sans
       la marque, 139 ms avec, sur une base de 30 nuits — seize marques de plus
       contre 1 465 écritures déjà marquées par DB. La famine redoutée n'a pas
       lieu. */
    try { localStorage.setItem(cle, s); flsMarquer(cle); return true; } catch (e) {}
    try { window.flFaireDeLaPlace && window.flFaireDeLaPlace(); } catch (e) {}
    try { localStorage.setItem(cle, s); flsMarquer(cle); return true; } catch (e) {}
    flsLog('ECHEC-ECRITURE ' + cle + ' (' + Math.round(s.length / 1024) + ' Ko) — stockage plein');
    return false;
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
      /* 12 septembre 2026 — une nuit qui porte un hypnogramme est MESURÉE,
         quoi que dise le drapeau hérité de l'objet qu'elle remplace (voir le
         pavé de `restageSleep`). Le seul chemin d'écriture d'une nuit mesurée
         passe ici : c'est ici que l'invariant se tient. */
      if (nuit && nuit.stages && nuit.stages.length && nuit._est) delete nuit._est;
      w.night = nuit;
      flsEcrire('watch_' + K, w);
      /* ═══ v2016 — INVARIANT : RIEN NE CHEVAUCHE LA NUIT ════════════════════
         L'ÉCRAN DE FÉLIX, 29 août : « Nuit 02:39 → 11:09 » ET « Sieste
         10:35 → 11:13 » — deux cartes qui se recouvrent de 34 minutes.
         LA CAUSE EST UN ORDRE D'ÉCRITURE, pas un seuil. Dans `flsNuitDuJour`,
         `autres.forEach` enregistre les sommeils de journée AVANT que la nuit
         retenue soit finalisée, puis re-projetée par `restageSleep` — qui peut
         l'allonger. La sieste écrite à 10:35 se retrouve alors DANS une nuit
         qui, à sa naissance, s'arrêtait avant elle. Personne ne repassait.
         `flsPurgerSommeil` sait déjà retirer un sommeil de journée qui
         chevauche une fenêtre — registre ET carte de la frise, et il ne touche
         jamais à une nuit (`type === TYPE_NUIT` protégé). Il suffisait de
         l'appeler ICI : au SEUL endroit où la nuit devient définitive, donc
         quel que soit le chemin qui l'a produite. L'invariant cesse d'être une
         intention et devient une conséquence de l'écriture elle-même. */
      try {
        if (nuit && nuit.sleepStart != null && nuit.sleepEnd != null) {
          flsPurgerSommeil(K, nuit.sleepStart, nuit.sleepEnd);
        }
      } catch (e) { flsLog('invariant nuit : ' + e.message); }
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
  /* ═══ v1913 — MINUIT D'UN JOUR : LE FUSEAU DU JOUR, PAS CELUI DU LECTEUR ═══

     LA CAUSE RACINE, trouvée le 26 août 2026 sur le téléphone de Dino, et il
     l'avait dite avant moi : « c'est pas parce que je suis rentré à Paris qu'il
     faut décaler ». Cinq endroits de ce fichier calculaient minuit avec
     `new Date(y, m, d, 0, 0, 0)` — c'est-à-dire dans le fuseau du TÉLÉPHONE QUI
     LIT. Rentré de La Réunion (+4) à Paris (+2), minuit du 20 août tombe deux
     heures plus tôt en absolu.

     CE QUE ÇA PRODUISAIT. `flsHrTs` place la fréquence cardiaque de la nuit sur
     un axe absolu à partir de ce minuit. Décalée de deux heures, elle emmène
     avec elle toute la reconstruction du sommeil : le coucher du 19 au 20 août
     passait de 00 h 44 à 22 h 48, et la nuit gagnait deux heures de « temps au
     lit ». À CHAQUE recalcul, donc à chaque ouverture de l'app.

     C'est ce qui a fait croire à un défaut des tranches. Les tranches de cette
     nuit-là sont pourtant IDENTIQUES dans la base saine du 22 août et dans la
     base d'aujourd'hui — vérifié bloc par bloc. Le doublement des tranches
     existait bien, il est réparé (v1900), mais il n'était pas la cause de
     l'étirement des nuits.

     `flMinuitDe` (index.html, v1766) répond exactement à cette question depuis
     deux mois, et son commentaire dit le principe : « une donnée historique ne
     change pas de sens parce que le téléphone a changé de pays ». Ce fichier ne
     l'appelait nulle part — il vit dans un autre fichier, et personne n'avait
     fait le lien.

     LE REPLI EST LE COMPORTEMENT D'AVANT, à la seconde près : sans fuseau connu
     pour ce jour, on retombe sur l'heure du lecteur. C'est la règle de la
     maison — on ne remplit JAMAIS un décalage qu'on n'a pas mesuré. */
  /* ⚠️ LE CACHE N'EST PAS UN CONFORT, C'EST LA CORRECTION D'UNE RÉGRESSION QUE
     J'AI CAUSÉE. `flMinuitDe` interroge `flFuseauDe`, qui fait un `DB.get` de
     `watch_<K>` — donc un JSON.parse de plusieurs centaines de kilo-octets. Le
     calcul d'avant (`new Date(...)`) était instantané ; le mien ne l'est pas,
     et cinq sites l'appellent, certains dans des boucles à la minute.

     CE QUE ÇA A PRODUIT, MESURÉ SUR LE TÉLÉPHONE DE DINO le 26 août à 16 h 05 :
     les fiches d'activité des jours passés ne s'affichaient plus du tout —
     « en attente » sur toutes les statistiques. Le journal le dit mot pour
     mot : « fiche ⏳ TOUJOURS EN ATTENTE · jour -1 · 40 s écoulées · le moteur
     n'a pas encore rappelé ». Le jour 0 marchait, parce que sa journée était
     déjà en cache côté moteur.

     UNE JOURNÉE NE CHANGE PAS DE FUSEAU PENDANT QU'ON LA LIT. Le décalage est
     écrit une fois pour toutes à l'écriture (v1767, write-once) : le mémoriser
     par clé est donc exact, pas approché. */
  var _flsMinuitCache = {};
  function flsMinuit(K) {
    if (_flsMinuitCache[K] !== undefined) return _flsMinuitCache[K];
    var v = null;
    try {
      if (typeof window !== 'undefined' && typeof window.flMinuitDe === 'function') {
        var m = window.flMinuitDe(K);
        if (m != null && !isNaN(m)) v = m;
      }
    } catch (e) {}
    if (v == null) {
      var p = String(K || '').split('-');
      v = new Date(+p[0], +p[1] - 1, +p[2], 0, 0, 0).getTime() / 1000;
    }
    _flsMinuitCache[K] = v;
    return v;
  }
  /* Le fuseau d'un jour peut être POSÉ après coup (`flPoserFuseauCourant` à la
     première écriture réelle, ou la passe de migration). On oublie donc tout au
     recalcul global : c'est le seul moment où un jour peut avoir gagné son
     décalage depuis la dernière lecture. */
  function flsOublierMinuits() { _flsMinuitCache = {}; }

  /* v1914 — UN INSTANT DANS LE CADRAN D'UN JOUR, avec LE FUSEAU DE CE JOUR.
     `d.getHours()` lit l'horloge du lecteur : depuis Paris, un coucher
     réunionnais de 00 h 44 devient 22 h 44. C'est ce qui restait faux après la
     v1913 — les DURÉES étaient réparées, les HEURES non, parce qu'elles
     passent par un autre chemin.
     Le résultat est ramené dans [0, 1440) : un coucher de la veille au soir
     rend bien 1364 (22 h 44) et non un nombre négatif — c'est la convention
     que `bedMin` porte depuis toujours. */
  function flsMinuteDu(K, ms) {
    var m = Math.round((ms / 1000 - flsMinuit(K)) / 60);
    m %= 1440; if (m < 0) m += 1440;
    return m;
  }

  /* ═══ v2110 — LA FC D'AVANT MINUIT VIT DANS LA CLÉ DE LA VEILLE ═══════════

     `watch_<K>.hr` est en MINUTE DU JOUR K. Une nuit qui commence à 23h48 a
     donc ses douze premières minutes dans `watch_<K-1>`, et `flsHrTs(K)` ne
     les voit pas : le re-staging travaille en aveugle sur la TÊTE de toute
     nuit commencée avant minuit.

     MESURÉ le 1er septembre 2026 sur la base de Dino : `watch_2026-9-1.hr`
     porte 383 points, minute minimale 0, et ZÉRO point après 23 h — pendant
     que `watch_2026-8-31.hr` en a jusqu'à 23:59. La nuit du 31 au 1er tournait
     avec 12 minutes sans FC sur 488.

     CE QUE ÇA COÛTAIT, ET DANS LES DEUX SENS. Sans FC, la ligne du dessous
     retombe sur `base[m3] === 'awake'` : la puce décide seule, son éveil n'est
     ni contredit ni confirmé. Ces minutes ne pouvaient donc ni être requalifiées
     en éveil par la voie cardiaque, ni être rendues au sommeil quand la puce
     clignote. Et `hrCoverage` — qui choisit `stageSrc` — était sous-estimé.

     ⚠️ CE N'EST PAS LA CAUSE DU COUCHER À 23h48 DU 1er SEPTEMBRE, et il ne faut
     pas le croire : vérifié en fournissant cette FC au calcul, la règle d'éveil
     reste muette sur chacune des minutes 23:48 → 00:03 (51-52 bpm contre une
     base à 49 — il en faudrait 65 — et une variabilité de 0,2 à 1,5 quand il en
     faudrait 7). Cet horaire vient de la puce, qui ouvre son enregistrement à
     l'endormissement. Ce correctif-ci bouche un trou de mesure, il ne déplace
     aucun endormissement.

     LA BORNE EST LE SOIR (>= 18 h). Une nuit ne commence pas avant, et sans
     borne on ferait entrer toute la journée de la veille dans le binning.
     Le minuit utilisé est celui de LA VEILLE, avec SON fuseau : c'est la règle
     de la v1913, un jour ne change pas de sens parce qu'on a voyagé depuis.

     MESURE AVANT/APRÈS sur les douze nuits encore rejouables (banc A/B, garde
     « ne rétrécit jamais » neutralisé des deux côtés) : DIX nuits identiques au
     bit près — ce sont celles qui commencent après minuit, la fonction ne leur
     ajoute rien qui tombe dans leur fenêtre. Les deux autres, les seules à
     commencer avant minuit :
         26/08  23:56→07:14   dormi 406 → 407   éveil 32 → 31   couv 92 → 93 %
         01/09  23:48→07:56   dormi 431 → 431   éveil 57 → 57   couv 65 → 67 %
     Aucune nuit ne raccourcit, aucun coucher ni lever ne bouge, aucun
     `stageSrc` ne bascule (les seuils sont à 25 % et 8 %, les nuits à 65-93 %). */
  function flsHrTsVeille(K) {
    try {
      var p = String(K || '').split('-'); if (p.length !== 3) return [];
      var v = new Date(+p[0], +p[1] - 1, +p[2]); v.setDate(v.getDate() - 1);
      var KV = v.getFullYear() + '-' + (v.getMonth() + 1) + '-' + v.getDate();
      var w = flsLire('watch_' + KV, null);
      if (!w || !w.hr || !w.hr.length) return [];
      var minuit = flsMinuit(KV), out = [];
      for (var i = 0; i < w.hr.length; i++) {
        var x = w.hr[i];
        if (x && x.length > 1 && x[0] >= 1080) out.push([x[1], minuit + x[0] * 60]);
      }
      return out;
    } catch (e) { return []; }
  }

  function flsHrTs(K) {
    var w = flsLire('watch_' + K, null);
    if (!w || !w.hr || !w.hr.length) return [];
    var minuit = flsMinuit(K);
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
    /* ═══ v2016 — QUATRE HEURES, ET LA PREUVE PEUT TRANCHER AVANT ══════════
       Dino, 29 août : « moins de 4 heures d'éveil depuis la fin de la nuit →
       privilégier la continuité de la nuit ; 4 heures ou plus → un nouveau
       sommeil peut devenir une sieste ». Et, dans la même demande : « je ne
       veux pas simplement remplacer le bug par gap < 4 h = fusion
       systématique — regarder aussi le mouvement, les pas ».
       LES DEUX PHRASES TIENNENT ENSEMBLE, et c'est `reveilRepriseJour` qui les
       concilie : le seuil long empêche qu'un réveil de fin de nuit devienne une
       sieste (le cas Félix), la preuve de marche autorise à couper plus tôt
       quand la personne a VRAIMENT repris sa journée. Sans preuve, on ne coupe
       pas : une absence de mesure n'est pas une mesure d'absence (v1238).
       Les 90 minutes de la v1191 n'étaient pas fausses, elles étaient AVEUGLES :
       elles coupaient sur la seule durée, sans jamais regarder si le corps
       s'était levé. */
    reveilCoupeNuit: 240,
    /* ═══ v2127 — L'ÉVEIL QUI FERME LE MATIN ══════════════════════════════════
       `reveilCoupeNuit` (4 h) sépare DEUX SOMMEILS. Celui-ci ferme LA FIN d'un
       seul, et les deux ne peuvent pas partager un nombre : mesuré contre
       l'export officiel WHOOP, les éveils de fin de nuit qu'on manque durent
       52 à 76 minutes — quatre heures ne les verrait jamais.
       ═══ v2129 — DE 30 À 27, ET C'EST LA GARDE DU FUSEAU QUI L'AUTORISE ═══
       Le premier réglage était 30, parce qu'à 20 la règle cassait une nuit
       déjà juste. Cette mesure-là avait été faite SANS la garde `tz.le`, qui
       n'existait pas encore : c'est elle qui écarte les nuits mal posées, et
       c'était elle qui manquait pour descendre. Reprise avec la garde, sur
       les mêmes 24 nuits, la plage sûre s'ouvre :

           seuil   |écart| moy   cassées   réparées
             20         29,7      0/13       4/11   (coupe aussi le 8-27, à tort)
           26-29        26,5      0/13       4/11   ← plateau, aucun effet du réglage
             30         31,5      0/13       3/11   (rate le 8-20 d une minute)

       LES DEUX BORDS SONT DES NUITS RÉELLES : le 20 août porte un éveil de
       29 min qu'il FAUT prendre (+121 → +1), le 27 un de 25 min qu'il ne faut
       PAS (+24, et le couper l'empire). L'intervalle sûr est donc [26 ; 29] et
       on prend son MILIEU — 27,5 arrondi à 27 — plutôt qu'un bord : sur un
       plateau, le bord est le seul endroit où un réglage peut basculer.

       CE QUI N'A PAS MARCHÉ, ET QUI EST ÉCRIT ICI POUR NE PAS ÊTRE RETENTÉ.
       Deux pistes semblaient plus prometteuses que le seuil ; les deux ont été
       rejouées dans la classification elle-même, sur les 24 nuits :
         · ne plus lisser la FC avant le test d'éveil (le lissage à 5 min
           efface l'alternance 51↔109) — |écart| 31,5, INCHANGÉ ;
         · un seuil de pas « debout » à 12, 10 ou 8/min au lieu des 18 de
           « marche » — 31,5, INCHANGÉ lui aussi, et leur combinaison avec.
       Elles ne déplacent que des blocs de 2 à 16 min qui n'atteignent jamais
       le seuil. La classification avait déjà raison : le 20 août, son bloc
       d'éveil commence à +367 quand WHOOP place le réveil à +366.
       ⚠️ CE SEUIL NE VAUT QUE DANS LE DERNIER TIERS DE LA NUIT. Appliqué à
       toute la nuit il coupe sur les interruptions de milieu de nuit : 109 min
       d'écart moyen contre 46 sans rien faire, et quatre bonnes nuits
       détruites. La position fait la moitié du travail. */
    eveilFermeNuit: 27,
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

  /* ═════════════════════════════════════════════════════════════════════════
     7 septembre 2026 — LA MONTRE FERME UN SOMMEIL AVEC LE DERNIER POULS.

     Dino s'est endormi vers 17 h 45 et réveillé à 19 h 25. La montre a rendu
     une sieste finie à 18 h 58. Entre les deux : à 18 h 54 la FC monte de 46
     à 80 (il se retourne), à 18 h 57 le capteur optique perd la peau, et la
     puce ferme sa tranche de sommeil avec le dernier pouls. Pour elle, pas de
     pouls veut dire montre enlevée, et une montre enlevée ne dort pas.

     Or elle n'était pas enlevée, et elle l'a prouvé elle-même :
       · la température cutanée a continué — 35,6 °C à 18 h 49, puis 35,2,
         34,6 et 34,4 à 19 h 29. Une montre posée sur la table tombe vers la
         pièce en dix minutes ; un boîtier qui a glissé sur le poignet garde
         la peau à un degré près ;
       · zéro pas de 18 h 58 à 19 h 27 — la montre n'émet que les blocs de
         mouvement non nuls, et il n'y en a aucun ;
       · le premier bloc non nul commence à 19 h 27, 37 pas en deux minutes :
         c'est le lever.

     LA RÈGLE. Un sommeil de journée dont la fin coïncide avec la perte du
     pouls court jusqu'au premier signe de réveil — le pouls qui revient ou le
     premier pas — à condition que la peau soit restée là : au moins une
     température cutanée dans le trou, toutes au-dessus de `peauMini` et à
     moins de `chuteMaxi` de la dernière lecture d'avant, et la dernière à
     moins de `couvertureTemp` de la fin proposée. Sans température, la règle
     se tait : on ne prolonge jamais sur une absence de preuve, et le trou
     reste tel que la montre l'a rendu jusqu'à ce que les preuves arrivent
     (elles transitent par le tampon du bracelet, qui peut avoir du retard).

     Ce que la règle NE fait PAS : la nuit principale n'est pas touchée — elle
     a sa propre machine d'état et sa porte du matin. Elle ne prolonge pas
     au-delà de `prolongeMaxi` (90 min) : les éveils de fin de sommeil qu'on
     manque durent 52 à 76 min contre l'export WHOOP (v2127), et au-delà
     d'une heure et demie sans aucun pouls la preuve devient trop mince —
     `reveilCoupeNuit` (4 h) sépare deux sommeils, ce n'est pas le même
     nombre. Elle ne compte pas de minutes à venir. Et une extension est recalculée de zéro à chaque
     recalcul — elle ne s'additionne jamais à elle-même.

     Les minutes gagnées sont comptées dormies (`sleepMin`) : la montre n'a
     pas de stade pour elles, on ne les invente pas, on ne les retranche pas
     non plus. La sieste porte `prolonge` (minutes) et `prolongeJusqu`
     ('pouls' | 'pas' | 'plafond' | 'maintenant') pour que l'écran puisse le
     dire. Banc : tests/test-sieste-sans-pouls.js.
     ═════════════════════════════════════════════════════════════════════════ */
  var SANS_POULS = {
    trouMini: 10,        // min sans pouls après la fin : moins, c'est un trou de mesure ordinaire
    prolongeMaxi: 90,    // min : au-delà, sans pouls, on ne prolonge plus — c'est un autre sommeil ou rien
    peauMini: 32,        // °C : en dessous, le capteur n'est plus sur une peau
    chuteMaxi: 2.0,      // °C d'écart toléré avec la dernière lecture d'avant la coupure
    couvertureTemp: 15,  // min : la dernière température doit tenir jusqu'à 15 min de la fin proposée
    /* 7 sept. 2026 au soir — deux ajouts sur le conseil du développeur WHOOP
       présent avec Dino (« niveau ET dérivée de température ; présence
       périodique d'un PPG plausible, même partiel ») :
       · la DÉRIVÉE : une montre posée sur la table tombe de plusieurs degrés en
         dix minutes, un poignet à l'air libre d'un degré en trente. Une chute
         de plus de `chuteRapide` entre deux lectures consécutives = table ;
       · la SpO2 PONCTUELLE : la montre en tente une toutes les 20 min, et elle
         n'aboutit que sur une peau. Une mesure réussie dans le trou (Dino :
         19:01 et 19:21) vaut preuve de peau, y compris sans température, et
         couvre jusqu'à `couvertureSpo2` après elle. */
    chuteRapide: 1.5,    // °C entre deux lectures consécutives (10 min) : au-delà, la montre est posée
    couvertureSpo2: 20   // min : une SpO2 réussie couvre jusqu'à 20 min après elle
  };
  function flsProlongerSansPouls(K, s) {
    try {
      if (!s || s.type === TYPE_NUIT || s.fin == null || s.debut == null) return s;
      var w = flsLire('watch_' + K, null);
      if (!w) return s;
      var p = String(K).split('-');
      var minuit = new Date(+p[0], +p[1] - 1, +p[2], 0, 0, 0).getTime();
      var finMin = Math.round((s.fin - minuit) / 60000);
      if (finMin < 0 || finMin >= 1440) return s;
      var nowMin = Math.floor((Date.now() - minuit) / 60000);
      if (nowMin <= finMin) return s;

      /* 1 · le pouls : la fin coïncide-t-elle avec sa perte ? */
      var hr = Array.isArray(w.hr) ? w.hr : [];
      var dernierAvant = -1, premierApres = -1, i, m;
      for (i = 0; i < hr.length; i++) {
        var x = hr[i];
        if (!x || !(+x[1] > 0)) continue;
        m = +x[0];
        if (m <= finMin && m > dernierAvant) dernierAvant = m;
        if (m > finMin && (premierApres < 0 || m < premierApres)) premierApres = m;
      }
      if (dernierAvant < 0 || dernierAvant < finMin - 3) return s;
      if (premierApres > 0 && premierApres - finMin < SANS_POULS.trouMini) return s;

      /* 2 · jusqu'où : le pouls qui revient, le premier pas, le plafond, ou maintenant */
      var borne = finMin + SANS_POULS.prolongeMaxi, jusqu = 'plafond';
      if (premierApres > 0 && premierApres < borne) { borne = premierApres; jusqu = 'pouls'; }
      var blocs = Array.isArray(w.actDet) ? w.actDet : [], premierPas = -1;
      for (i = 0; i < blocs.length; i++) {
        var b = blocs[i];
        if (!b || !(b[0] > 0)) continue;
        var t0 = Math.round((b[0] * 1000 - minuit) / 60000), rep = b[3];
        if (rep && rep.length) {
          for (var j = 0; j < rep.length; j++) {
            if (!(rep[j] > 0)) continue;
            m = t0 + j;
            if (m > finMin && (premierPas < 0 || m < premierPas)) premierPas = m;
          }
        } else if (+b[1] > 0 && t0 > finMin && (premierPas < 0 || t0 < premierPas)) premierPas = t0;
      }
      if (premierPas > 0 && premierPas < borne) { borne = premierPas; jusqu = 'pas'; }
      if (nowMin < borne) { borne = nowMin; jusqu = 'maintenant'; }

      /* 3 · la peau : les températures du trou, contre la dernière d'avant */
      var temps = Array.isArray(w.temp) ? w.temp : [];
      var ref = null, refMin = -1, dedans = [];
      for (i = 0; i < temps.length; i++) {
        var t = temps[i];
        if (!t || !(+t[1] > 0)) continue;
        m = +t[0];
        if (m <= finMin && m >= finMin - 60 && m > refMin) { refMin = m; ref = +t[1]; }
        if (m > finMin && m <= borne) dedans.push([m, +t[1]]);
      }
      /* la SpO2 ponctuelle : une mesure réussie dans le trou est un PPG partiel */
      var spo2s = Array.isArray(w.spo2) ? w.spo2 : [], spo2Dedans = [];
      for (i = 0; i < spo2s.length; i++) {
        var o = spo2s[i];
        if (!o || !(+o[1] >= 70 && +o[1] <= 100)) continue;
        m = +o[0];
        if (m > finMin && m <= borne) spo2Dedans.push(m);
      }
      spo2Dedans.sort(function (a, c) { return a - c; });
      if ((ref == null || !dedans.length) && !spo2Dedans.length) return s;
      dedans.sort(function (a, c) { return a[0] - c[0]; });
      var prec = ref != null ? [refMin, ref] : null;
      for (i = 0; i < dedans.length; i++) {
        var raison = null;
        if (dedans[i][1] < SANS_POULS.peauMini) raison = 'sous ' + SANS_POULS.peauMini + ' °C';
        else if (ref != null && ref - dedans[i][1] > SANS_POULS.chuteMaxi) raison = 'à plus de ' + SANS_POULS.chuteMaxi + ' °C de la dernière lecture d avant (' + ref + ')';
        else if (prec && prec[1] - dedans[i][1] > SANS_POULS.chuteRapide && dedans[i][0] - prec[0] <= 12) raison = 'chute de ' + (Math.round((prec[1] - dedans[i][1]) * 10) / 10) + ' °C en ' + (dedans[i][0] - prec[0]) + ' min';
        if (raison) {
          flsLog('sieste ' + K + ' : trou sans pouls après ' + flsHHMM(finMin) + ', mais la peau est partie ('
            + dedans[i][1] + ' °C à ' + flsHHMM(dedans[i][0]) + ', ' + raison + ') — pas prolongée');
          return s;
        }
        prec = dedans[i];
      }
      var couverture = -1;
      if (dedans.length) couverture = dedans[dedans.length - 1][0] + SANS_POULS.couvertureTemp;
      if (spo2Dedans.length) couverture = Math.max(couverture, spo2Dedans[spo2Dedans.length - 1] + SANS_POULS.couvertureSpo2);
      if (borne > couverture) {
        borne = couverture; jusqu = 'maintenant';
        if (premierApres > 0 && premierApres <= borne) { borne = premierApres; jusqu = 'pouls'; }
        if (premierPas > 0 && premierPas <= borne) { borne = premierPas; jusqu = 'pas'; }
      }
      var ext = borne - finMin;
      if (ext < SANS_POULS.trouMini) return s;

      var out = {};
      for (var k in s) if (Object.prototype.hasOwnProperty.call(s, k)) out[k] = s[k];
      out.fin = minuit + borne * 60000;
      out.sleepMin = (s.sleepMin || 0) + ext;
      out.prolonge = ext;
      out.prolongeJusqu = jusqu;
      flsLog('sieste ' + K + ' : la montre l a fermée à ' + flsHHMM(finMin) + ' avec le dernier pouls, '
        + 'peau toujours là (' + dedans.length + ' température(s), ' + spo2Dedans.length + ' SpO2), zéro pas — prolongée de '
        + ext + ' min jusqu à ' + flsHHMM(borne) + ' (' + jusqu + ')');
      return out;
    } catch (e) { flsLog('sieste sans pouls : ' + e.message); return s; }
  }
  function flsHHMM(m) {
    return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
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
          /* ═══ v2016 — UN TÉMOIGNAGE NE SE PURGE PAS ══════════════════════
             Les deux moitiés de cette fonction ne disaient pas la même chose :
             le filtre des ACTIVITÉS protège déjà la saisie à la main (`!x.auto`
             plus bas), le filtre du REGISTRE, non. Tant que seule la détection
             de marche appelait ici, l'écart ne s'est pas vu ; l'invariant de
             la nuit (v2016) passe par la même porte et l'aurait rendu visible
             en effaçant une sieste que la personne a elle-même déclarée.
             La règle de la maison est ancienne et vaut dans les deux moitiés :
             le moteur ne relit pas un témoignage, même quand il le contredit. */
          if (a.source === 'manuel') return true;
          return !(Math.min(a.fin, fin) - Math.max(a.debut, debut) > 0);
        });
        if (reste.length !== w.sommeils.length) {
          w.sommeils = reste;
          flsEcrire('watch_' + K, w);
        }
      }
      var ss = flsLire('sessions_' + K, null);
      if (!Array.isArray(ss)) return;
      var d0 = new Date(debut), d1 = new Date(fin);
      var m0 = d0.getHours() * 60 + d0.getMinutes(), m1 = d1.getHours() * 60 + d1.getMinutes();
      var garde = ss.filter(function (x) {
        /* v2016 — TROISIÈME MOITIÉ DE LA MÊME RÈGLE. L'en-tête ci-dessus la
           promet — « QUE l'automatique : une sieste saisie à la main
           appartient à Dino, pas au moteur » — mais `!x.auto` ne la tenait
           pas : `flsPoserActivite` pose `auto:true` MÊME sur une saisie
           manuelle, et c'est `src` qui dit d'où elle vient (le ménage de la
           nuit, plus bas, le sait déjà et teste `x.src === 'manuel'`). Le
           témoignage était donc protégé à un endroit sur deux. */
        if (!x || x.type !== 'nap' || !x.auto || !x.start || x.src === 'manuel') return true;
        var p = String(x.start).split(':'), a = (+p[0]) * 60 + (+p[1]);
        return !(Math.min(a + (x.dur || 0), m1) - Math.max(a, m0) > 0);
      });
      if (garde.length !== ss.length) {
        flsEcrire('sessions_' + K, garde);
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
      var minuit = flsMinuit(K) * 1000;
      var limite = Date.now() + 60000;
      var garde = ss.filter(function (x) {
        if (!x || !x.auto || !x.start) return true;
        var q = String(x.start).split(':'), m = (+q[0]) * 60 + (+q[1]);
        return (minuit + m * 60000 + (x.dur || 0) * 60000) <= limite;
      });
      if (garde.length !== ss.length) {
        flsEcrire('sessions_' + K, garde);
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
        /* 10 sept. 2026 — SAUF ENTRE DEUX TÉMOIGNAGES. Deux saisies au stylo
           partagent la source `manuel` : la seconde, plus courte, se faisait
           donc refuser par une règle écrite pour la mémoire circulaire de la
           montre. Le registre gardait la première fenêtre, et c'est lui que
           lisent `flEtatNuit` et `flJourLogique` — la journée logique restait
           bornée sur une nuit que l'écran n'affichait plus. La dernière
           parole de la personne est la bonne : elle remplace la sienne. */
        if ((s.sleepMin || 0) < (av.sleepMin || 0) && av.source === s.source
            && s.source !== 'manuel') return;
        /* 7 sept. 2026 — UN TÉMOIGNAGE NE SE REMPLACE PAS PAR UNE MESURE : une
           période saisie à la main reste, quoi que la montre relivre dessus. */
        if (av.source === 'manuel' && s.source !== 'manuel') return;
        liste[place] = s;
      } else liste.push(s);
      liste.sort(function (x, y) { return x.debut - y.debut; });
      w.sommeils = liste;
      flsEcrire('watch_' + K, w);
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
      /* v1842 — IL N'Y A PAS DE PORTE ICI, ET C'EST VOULU. Une première version
         refusait de poser une période contenue dans `watch_<K>.night` — et le
         banc de réparation a rougi aussitôt : au moment où l'on pose, la nuit
         en base peut être PÉRIMÉE ou FAUSSE (c'est précisément le cas que la
         réparation défait). On ne juge donc jamais contre elle en entrée ;
         c'est `flsBalayerSiestesDansLaNuit`, en fin de recalcul, qui relit la
         journée à la lumière de la nuit FINALE. */
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
          /* 7 sept. 2026 — une correction MANUELLE remplace la mesure et la
             fige : la montre ne la réécrira plus (voir `flSommeilFixerSieste`). */
          if (s.source === 'manuel') {
            x.start = hhmm; x.dur = dur; x.sleepMin = s.sleepMin;
            x.src = 'manuel'; x.auto = false; x.prolonge = 0; x.prolongeJusqu = null;
            flsEcrire('sessions_' + K, ss);
            flsLog('sieste ' + K + ' : corrigée à la main → ' + hhmm + ', ' + dur + ' min');
            return;
          }
          if (!x.auto || x.src === 'manuel') return;
          x.start = hhmm; x.dur = dur;
          x.sleepMin = s.sleepMin; x.src = s.source || 'ble';
          x.prolonge = s.prolonge || 0; x.prolongeJusqu = s.prolongeJusqu || null;
          flsEcrire('sessions_' + K, ss);
          flsLog('sieste ' + K + ' : corrigée à ' + hhmm + ', ' + dur + ' min');
          return;
        }
      }
      ss.push({ type: 'nap', name: 'Sieste', icon: '😴', start: hhmm, dur: dur,
                auto: s.source !== 'manuel', sleepMin: s.sleepMin, src: s.source || 'ble',
                prolonge: s.prolonge || 0, prolongeJusqu: s.prolongeJusqu || null });
      flsEcrire('sessions_' + K, ss);
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
          flsEcrire('sessions_' + K, ss);
          flsLog('ménage ' + K + ' : ' + (avant - ss.length) + ' sieste(s) déduite(s) de la fréquence cardiaque retirée(s)');
        }
      }
      w.sommeils = w.sommeils.filter(function (s) { return !(s && s.source === 'fc'); });
      flsEcrire('watch_' + K, w);
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
      var minuit = flsMinuit(K) * 1000;
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
        flsEcrire('sessions_' + K, ss);
        flsLog('ménage ' + K + ' : ' + (avant - ss.length)
          + ' « sieste(s) » retirée(s) — nocturne(s) ou finissant dans le futur.');
      }
    } catch (e) { flsLog('ménage siestes : ' + e.message); }
  }

  /* v1842 — LA NUIT AVALE SES PROPRES MORCEAUX.

     LE CAS, chez Félix, capture du 24 août : nuit 05:25 → 12:45, et DEUX
     « siestes » posées dans la journée — 09:27 → 12:45 et 11:23 → 12:45 —
     toutes les trois finissant au même réveil. Structurellement impossible :
     on ne fait pas une sieste À L'INTÉRIEUR de sa propre nuit.

     LA CAUSE, reproduite au banc sur le moteur intact. La montre rend ses
     enregistrements DU PLUS RÉCENT AU PLUS ANCIEN (le SDK sert les cinquante
     derniers, puis pagine vers l'arrière), et `flintSommeilTranche` recalcule
     à chaque tranche. Tant que le DÉBUT de la nuit n'est pas arrivé, le
     groupe en mémoire est un SUFFIXE de la nuit : sa fenêtre réelle commence
     au premier sommeil qui suit un réveil interne — 11:23, puis 09:27 —, elle
     est diurne et courte, donc classée sieste ou sommeil secondaire, et posée
     dans la journée. Quand le début arrive enfin, la vraie nuit s'écrit —
     mais AUCUN ménage ne relisait les siestes déjà posées à la lumière de la
     nuit désormais connue. Les états intermédiaires survivaient à l'état
     final.

     LA RÈGLE : une entrée AUTOMATIQUE entièrement CONTENUE dans la fenêtre de
     la nuit principale est un morceau de cette nuit — ses réveils internes
     appartiennent à l'éveil de la nuit, pas à la journée. On la retire, de la
     journée comme du registre.

     CE QU'ON NE TOUCHE PAS, et pourquoi l'inclusion suffit à les protéger :
       · une vraie sieste de l'après-midi est HORS de la fenêtre de la nuit ;
       · une reprise de sommeil après 1 h 30 debout (règle v1191) est un
         groupe que la fusion a refusé de coller — sa fenêtre est APRÈS la
         fin de la nuit, jamais dedans ;
       · une saisie manuelle appartient à la personne (`auto` absent,
         `source:'manuel'`), le moteur ne la relit pas.
     La tolérance est celle du garde v1310 : deux minutes, une tranche peut
     décaler d'un cran. */
  function flsBalayerSiestesDansLaNuit(K) {
    try {
      var n = flsNuitDe(K);
      if (!n || n.sleepStart == null || n.sleepEnd == null) return;
      var tol = 120000;
      var d0 = n.sleepStart - tol, f0 = n.sleepEnd + tol;
      var p = String(K).split('-');
      var minuit = flsMinuit(K) * 1000;
      var ss = flsLire('sessions_' + K, null);
      if (Array.isArray(ss) && ss.length) {
        var avant = ss.length;
        ss = ss.filter(function (x) {
          /* `flsPoserActivite` pose `auto:true` même sur une saisie manuelle ;
             c'est `src` qui dit d'où elle vient. Le témoignage est protégé. */
          if (!x || x.type !== 'nap' || !x.auto || !x.start || x.src === 'manuel') return true;
          var q = String(x.start).split(':'), m = (+q[0]) * 60 + (+q[1]);
          var deb = minuit + m * 60000, fin = deb + (x.dur || 0) * 60000;
          return !(deb >= d0 && fin <= f0);
        });
        if (ss.length !== avant) {
          flsEcrire('sessions_' + K, ss);
          flsLog('ménage ' + K + ' : ' + (avant - ss.length)
            + ' « sieste(s) » retirée(s) — contenue(s) dans la nuit principale, '
            + 'ce sont ses réveils internes.');
        }
      }
      var w = flsLire('watch_' + K, null);
      if (w && Array.isArray(w.sommeils)) {
        var reste = w.sommeils.filter(function (s) {
          if (!s || s.type === TYPE_NUIT || s.source === 'manuel'
              || s.debut == null || s.fin == null) return true;
          return !(s.debut >= d0 && s.fin <= f0);
        });
        if (reste.length !== w.sommeils.length) {
          w.sommeils = reste;
          flsEcrire('watch_' + K, w);
        }
      }
    } catch (e) { flsLog('balayage nuit : ' + e.message); }
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
    /* ═══ 30 août 2026 — LE CORRECTEUR REM EST MORT, RÉFUTÉ PAR LA RÉFÉRENCE ══
       Il vivait ici : remLatencyMin=60 (REM précoce → léger), remFragMax=2
       (miette → léger), remReclassMax=0.2. Son hypothèse — « la puce V8
       SUR-classe du léger en REM » — n'avait jamais été confrontée à une
       référence extérieure. Le 30 août, les stades WHOOP nuit par nuit (14
       nuits comparables, capteurs concordants) ont tranché : la puce
       SOUS-compte déjà le REM de 14 min en médiane, et le correcteur
       aggravait à −19 (biais −21,6, MAE 23,6). Rejoué sans lui : −13 de
       médiane, MAE 19,9 — et la règle des miettes était la principale
       coupable (le REM de cette puce arrive fragmenté, les miettes en sont).
       Le banc : outils/calibration-stades.js, qui rejoue tout ça sur la base
       rapatriée.

       CE QU'ON N'A PAS FAIT, ET POURQUOI : récupérer le REM manquant en
       reclassant du léger à signature cardiaque (FC au-dessus de la base,
       stable, sans mouvement). Essayé au banc : le biais se corrige (−6)
       mais les nuits DÉJÀ JUSTES gonflent (le 20 : 101 → 126 pour 99 chez
       WHOOP, le 27 : +26) pendant que la nuit catastrophique du 18 (puce 32,
       WHOOP 91) ne bouge presque pas (→ 39). C'est une constante déguisée,
       pas une mesure — v1400, même verdict que pour le profond : perfection
       = soustraction. Le déficit restant (~14 min, médiane) est le PLANCHER
       DE LA PUCE ; les nuits où elle s'effondre (12 : 0 min, 18 : 32, 24 :
       0) sont un défaut matériel documenté, pas corrigeable en aval. */
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
      /* v2016 — LA PREUVE QUE LA JOURNÉE A REPRIS, dans le trou lui-même : les
         MÊMES seuils de marche franche que le refus d'un sommeil de journée
         (`MARCHE_SUITE_MINI`, `MARCHE_PAS_MINI`). Aucun nombre neuf : ce qui
         prouve qu'on n'était pas en train de dormir prouve aussi qu'on s'est
         levé. Sans pas transmis, `mvT.pas` vaut 0 et rien ne coupe — le seuil
         long décide seul, comme demandé. */
      var repriseJour = false;
      if (gap > 0) {
        try {
          var mvT = flsMarcheDans(dayKey, aEnd * 1000, B[0].start * 1000);
          repriseJour = (mvT.suite >= MARCHE_SUITE_MINI && mvT.pas >= MARCHE_PAS_MINI);
        } catch (e) { repriseJour = false; }
      }
      if (gap > CLASSIF.reveilCoupeNuit * 60) {
        flsLog('nuit : fusion REFUSÉE — ' + Math.round(gap / 60) + ' min debout, au-dela de '
          + CLASSIF.reveilCoupeNuit + ' min. Ce sont deux sommeils differents.');
      } else if (repriseJour) {
        flsLog('nuit : fusion REFUSÉE — ' + Math.round(gap / 60) + ' min debout AVEC marche '
          + 'franche dedans : la journee avait repris, ce sont deux sommeils differents.');
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
      s = flsProlongerSansPouls(dayKey, s);
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
      var porteurs = chosen.grp.filter(function (c) { return (c.activity || []).some(function (v, i) { return v > 0 && i > 0; }); });
      if (!porteurs.length) return;
      /* signature = suite des valeurs non nulles ET de leurs positions. Deux
         paquets couvrant des heures differentes ne peuvent pas la partager. */
      var vus = {}, repetes = 0;
      porteurs.forEach(function (c) {
        var sig = (c.activity || []).map(function (v, i) { return (v > 0 && i > 0) ? i + ':' + v : ''; }).filter(Boolean);
        if (sig.length < 2) return;
        sig = sig.join(',');
        if (vus[sig]) repetes++; else vus[sig] = 1;
      });
      /* ═══ v2101 — LE MÊME TAMPON, MÊME QUAND UN CHIFFRE A BOUGÉ ═══════════
         Le test ci-dessus compare positions ET valeurs : il n'attrape que la
         photocopie PARFAITE. Mesuré le 31 août 2026 sur les 46 paquets de la
         base de Dino : dans presque toutes les nuits, les valeurs non nulles
         tombent aux MÊMES index (90-100, ou 90-119) alors que les paquets
         partent à deux heures d'intervalle — le même mouvement placé à trois
         heures réelles différentes. Dès qu'une valeur dérivait d'un chiffre,
         l'ancien test laissait passer et `mv` était PEINT sur la nuit : sur
         onze nuits, deux attrapées, cinq laissées passer avec du mouvement
         inventé. Le 30 août en portait trois blocs quasi identiques placés à
         01:43→05:41, 04:30→08:28 et 06:30→10:28, le dernier tombant APRÈS un
         réveil de 08:46. C'est précisément ce que le commentaire ci-dessus
         veut empêcher, et il n'y arrivait qu'une fois sur trois.
         CE QUI EST AJOUTÉ, ET RIEN D'AUTRE : le motif de POSITIONS. Deux
         paquets couvrant des heures différentes ne peuvent pas porter le même
         ensemble d'index — sauf s'ils décrivent la même fenêtre de tampon.
         AU MOINS DEUX POSITIONS : avec une seule (le marqueur d'en-tête en
         index 0), la coïncidence est banale, et l'ancien test attrape déjà ce
         cas-là — la nuit du 23 août le prouve, elle est détectée par lui seul.
         L'ANCIEN TEST RESTE ENTIER : celui-ci s'AJOUTE. Rien de ce qui était
         déjà détecté ne cesse de l'être — c'était la condition pour poser. */
      /* 7 SEPTEMBRE 2026 — DEUX TROUS DE PLUS, MESURÉS SUR 20 PAQUETS (dossier
         AUDIT-SCORES-VS-WHOOP-4-SEPT.md §22). Sur CENT POUR CENT des paquets de
         la base, le mouvement non nul est confiné aux positions 90-119 (la
         dernière heure du paquet), plus le marqueur d'en-tête en index 0. Et le
         garde en laissait passer une nuit sur deux :
         · L'INDEX 0 N'EST PAS DU MOUVEMENT. Le 4 sept, 01:32 porte (0, 90, 91,
           99, …) et 04:27 porte (90, 91, 99, …) — mêmes positions, mêmes valeurs,
           l'un avec son en-tête et l'autre sans : la chaîne différait d'un
           « 0, », et une heure identique a été peinte deux fois (04:32→05:32 et
           07:27→08:27, à cheval sur le réveil). Les deux signatures ignorent
           désormais l'index 0.
         · LE TAMPON GRANDIT. Le 6 sept, 02:44 porte (90, 91, 94, 95 : 4, 1, 63,
           21) et 04:34 les mêmes quatre PLUS quatre nouvelles : la même image,
           deux heures plus tard, avec ce qui s'y est ajouté. Un motif INCLUS
           dans un autre (au moins deux positions communes, mêmes valeurs sur
           les communes) est la même fenêtre de tampon.
         Effet mesuré : ~2 min d'éveil par nuit, soit ~1 point de récup par la
         composition — on le pose pour la raison du 31 août, pas pour les points. */
      if (!repetes) {
        var motifs = [];
        porteurs.forEach(function (c) {
          var m = {}; (c.activity || []).forEach(function (v, i) { if (v > 0 && i > 0) m[i] = v; });
          if (Object.keys(m).length < 2) return;
          motifs.push(m);
        });
        for (var mi0 = 0; mi0 < motifs.length && !repetes; mi0++) {
          for (var mi1 = 0; mi1 < motifs.length; mi1++) {
            if (mi0 === mi1) continue;
            var A = motifs[mi0], Bm = motifs[mi1], kA = Object.keys(A), communs = 0, inclus = true;
            for (var ki = 0; ki < kA.length; ki++) {
              if (Bm[kA[ki]] === undefined) { inclus = false; break; }
              if (Bm[kA[ki]] === A[kA[ki]]) communs++;
            }
            /* même ensemble de positions (la règle v2101, l'en-tête en moins) : les valeurs
               peuvent dériver, c'est la même fenêtre ; sinon, inclus à valeurs égales */
            if (inclus && (kA.length === Object.keys(Bm).length || communs >= 2)) { repetes++; break; }
          }
        }
      }
      /* LE TEST PHYSIQUE (7 sept, le 7 sept lui-même) : deux paquets de 4 h qui partent à
         deux heures d'intervalle SE RECOUVRENT. Un mouvement réel à l'heure T doit être
         à l'index (T − départ)/2 min de CHACUN des deux. Le 7 sept, 00:16 porte du
         mouvement de 03:16 à 04:16 et 03:26 couvre 03:26→07:26 sans rien y avoir — ses
         valeurs sont à 06:26→07:26, où 00:16 ne voit plus. Deux images de tampon
         différentes, que ni la signature ni le motif n'attrapent. Ici : quand A a au
         moins deux cases en mouvement dans le recouvrement et que B n'en voit AUCUNE au
         même endroit (± une case), c'est une contradiction, et le canal est jeté. */
      if (!repetes) {
        for (var pa = 0; pa < porteurs.length && !repetes; pa++) {
          for (var pb = 0; pb < porteurs.length && !repetes; pb++) {
            if (pa === pb) continue;
            var A2 = porteurs[pa], B2 = porteurs[pb], aA = A2.activity || [], aB = B2.activity || [];
            var d0 = Math.max(A2.start, B2.start), d1 = Math.min(A2.start + aA.length * 120, B2.start + aB.length * 120);
            if (d1 - d0 < 1800) continue;
            var vusA = 0, confirmes = 0;
            for (var ia = 1; ia < aA.length; ia++) {
              if (!(aA[ia] > 0)) continue;
              var t = A2.start + ia * 120; if (t < d0 || t >= d1) continue;
              vusA++;
              var ib = Math.round((t - B2.start) / 120);
              /* l'index 0 de B est son en-tête : il ne confirme rien */
              if ((ib >= 1 && aB[ib] > 0) || (ib - 1 >= 1 && aB[ib - 1] > 0) || (aB[ib + 1] > 0)) confirmes++;
            }
            if (vusA >= 2 && confirmes === 0) { repetes++; }
          }
        }
      }
      if (repetes > 0) {
        mvSrc = 'non-fiable';
        flsLog('nuit ' + dayKey + ' : canal mouvement ignore (' + (repetes + 1) + ' paquets portent la meme sequence, tampon non reindexe par la montre)');
        return;
      }
      porteurs.forEach(function (c) {
        (c.activity || []).forEach(function (v, idx) {
          if (idx === 0) return;   /* l'index 0 est le marqueur d'en-tête, pas du mouvement (7 sept) */
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
      /* ═══ 7 septembre 2026 — LA FENÊTRE SAISIE À LA MAIN GAGNE SUR LA MONTRE ═══
         Dino corrige coucher et réveil au stylo de « Ma nuit » ; jusqu'ici ce
         re-stadage repartait de `nightFromChunks` sans jamais regarder
         `source === 'manuel'`, remettait `bedMin/wakeMin/timeInBed/source`
         depuis les tranches, et le geste s'effaçait lui-même à la synchro
         suivante. La fenêtre saisie est projetée : les stades de la puce là
         où elle en a, du léger ailleurs (l'utilisateur affirme qu'il dormait,
         la montre n'a pas de stade contraire), le mouvement à zéro hors
         mesure. Et `source` reste « manuel » à la sortie. */
      var manuel = false;
      if (s.source === 'manuel' && s.manuelStart > 0 && s.manuelEnd > s.manuelStart && base && base.length) {
        var mS = Math.round(s.manuelStart / 1000), mN = Math.round((s.manuelEnd - s.manuelStart) / 60000);
        if (mN >= 60 && mN <= 1000) {
          var nb = new Array(mN), nm = new Array(mN), dec = Math.round((mS - start) / 60);
          for (var im = 0; im < mN; im++) {
            var srcI = im + dec, okI = srcI >= 0 && srcI < N;
            nb[im] = okI ? base[srcI] : 'light';
            nm[im] = okI ? (mv[srcI] || 0) : 0;
          }
          flsLog('nuit ' + dayKey + ' : fenêtre SAISIE projetée ' + flsHHMM(flsMinuteDu(dayKey, s.manuelStart)) + '-'
            + flsHHMM(flsMinuteDu(dayKey, s.manuelEnd)) + ' (' + mN + ' min) à la place de la montre (' + N + ' min)');
          start = mS; N = mN; base = nb; mv = nm; manuel = true;
        }
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
      /* v2110 — `s.hrTs` N'EST PAS TOUCHÉ, ET C'EST VOULU. Il est stocké dans
         `night.hrTs` et relu ailleurs (`flRetrouverFuseau`, `flEchantillonsNuit`
         d'index.html) ; l'élargir déplacerait le sens d'un champ publié. On
         n'élargit donc que ce qui entre dans le calcul de CETTE nuit. */
      (s.hrTs || []).concat(flsHrTsVeille(dayKey)).forEach(function (p) { var mi = Math.round((p[1] - start) / 60); (hrRaw[mi] = hrRaw[mi] || []).push(p[0]); });
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
      // 2c) SUPPRIMÉ le 30 août 2026 — le correcteur REM (« la puce sur-classe »)
      //     est réfuté par les stades WHOOP nuit par nuit : la puce SOUS-compte
      //     déjà, et lui retirait encore 5 min de médiane. La réfutation chiffrée
      //     vit à côté des constantes RESTAGE ; le banc : calibration-stades.js.
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
      /* 7 sept. 2026 — une fenêtre SAISIE ne se rogne pas : l'utilisateur a dit où elle finit. */
      if (!manuel && lastSleep >= 0 && lastSleep + 1 < N) {
        agg.awake -= (N - (lastSleep + 1));
        N = lastSleep + 1;
        newStages = newStages.filter(function (seg) { return seg.startMin < N; });
        var lastSeg = newStages[newStages.length - 1];
        if (lastSeg && lastSeg.startMin + lastSeg.durMin > N) lastSeg.durMin = N - lastSeg.startMin;
      }
      /* ═══ v1876 — ET LA TÊTE, PAR LA MÊME RÈGLE ═══════════════════════════
         La traîne finale se rogne depuis toujours, et l'argument est écrit
         juste au-dessus : après le dernier vrai sommeil, la montre enregistre
         encore alors qu'on est debout. Le début n'était pas rogné, et cette
         asymétrie coûtait cher.

         CE QUE LA MONTRE MET EN TÊTE. `arraySleepQuality` commence, sur chaque
         enregistrement qui OUVRE un sommeil, par une suite fixe :

             [15, 4, 4, 4] × 24 tranches     [15, 4, 4] × 2     [15] × 2
             [11, 4, 4]    ×  2              [10, 4, 4] × 1     [11] × 1

         Le SDK dit « 1 profond, 2 léger, 3 REM, TOUTE AUTRE VALEUR = éveil ».
         On appliquait donc la règle à la lettre — sur un en-tête.

         LA PREUVE QUE C'EN EST UN, et ce n'est pas « ça se répète, donc c'est
         louche » : LES TRANCHES SE RECOUVRENT, et sur ces minutes-là elles se
         CONTREDISENT.

             19 août 00:41   ici « 4 »   la tranche qui couvre dit LÉGER
             20 août 00:45   ici « 4 »   la tranche qui couvre dit LÉGER
             21 août 04:18   ici « 4 »   la tranche qui couvre dit REM

         Une minute ne peut pas être à la fois du REM et de l'éveil. Ces valeurs
         ne décrivent donc pas ces minutes-là.

         CE QUE ÇA ABÎMAIT, toutes les nuits, de la même quantité — donc jamais
         visible : l'heure de coucher pointait le début de l'en-tête (4 minutes
         trop tôt), ces 4 minutes comptaient en éveil et en temps au lit, et
         « Endormi en » affichait 4 minutes, 23 nuits sur 23. L'app du fabricant
         affiche 4 aussi : elle lit le même en-tête de la même façon.

         ⚠️ ON NE ROGNE QUE DE L'ÉVEIL, comme la traîne. Mesuré sur les huit
         enregistrements d'ouverture encore en base : après l'en-tête vient
         TOUJOURS un stade, immédiatement. Cette coupe ne peut donc retirer que
         l'en-tête — la montre n'enregistre jamais de période « au lit mais
         éveillé », son enregistrement commence à l'endormissement. */
      var firstSleep = -1;
      for (var fs2 = 0; fs2 < newStages.length; fs2++) { if (newStages[fs2].stage !== 'awake') { firstSleep = newStages[fs2].startMin; break; } }
      if (firstSleep > 0) {
        flsLog('nuit ' + dayKey + ' : ' + firstSleep + ' min d en-tete d enregistrement retirees en tete (la montre ouvre son enregistrement a l endormissement)');
        agg.awake -= firstSleep;
        N -= firstSleep;
        start += firstSleep * 60;
        stgArr = stgArr.slice(firstSleep);
        newStages = newStages.filter(function (seg) { return seg.startMin + seg.durMin > firstSleep; })
                             .map(function (seg) {
                               var d0b = Math.max(0, seg.startMin - firstSleep);
                               return { stage: seg.stage, startMin: d0b,
                                        durMin: seg.durMin - Math.max(0, firstSleep - seg.startMin) };
                             });
        /* LES STADES BRUTS DE LA PUCE SUIVENT LE MÊME DÉCALAGE, et il le faut :
           `s.sleepStart` vient de bouger, et c'est l'origine que le chemin de
           repli (`restageSleep` sans tranches) prend pour les projeter. Les
           laisser sur l'ancien axe aurait décalé tout un hypnogramme de quatre
           minutes — le genre d'écart qu'on ne voit jamais parce qu'il est
           partout pareil. C'est exactement le défaut qu'on est en train de
           réparer ; on ne va pas le recréer trois lignes plus bas. */
        v8.awake -= firstSleep;
        v8Stages = v8Stages.filter(function (seg) { return seg.startMin + seg.durMin > firstSleep; })
                           .map(function (seg) {
                             return { stage: seg.stage,
                                      startMin: Math.max(0, seg.startMin - firstSleep),
                                      durMin: seg.durMin - Math.max(0, firstSleep - seg.startMin) };
                           });
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
      /* ═══ 10 sept. 2026 — LA DEUXIÈME CORRECTION AU STYLO ÉTAIT REFUSÉE ═══
         Dino : « la première fois qu'on modifie, c'est instantané ; la
         deuxième fois, ça ne marche pas » — et il précise « par exemple je
         les diminue ».

         LE MÉCANISME, EXACTEMENT. La première correction gagne parce qu'elle
         COUVRE la fenêtre de la montre (`_couvre`). La deuxième se compare à
         la PREMIÈRE : si elle raccourcit, elle chevauche sans couvrir, rend
         moins de sommeil, et le garde ci-dessus la rejette sous le message
         « la montre a oublié le début » — qui est faux, la montre n'a rien
         livré du tout entre les deux. Résultat à l'écran : l'en-tête bougeait
         (`flSommeilManuel` écrit bedMin/wakeMin en clair) pendant que
         l'hypnogramme, les stades et la courbe restaient sur la fenêtre
         d'avant. Une page qui se contredit avec elle-même, donc le pire cas.

         CE GARDE PROTÈGE D'UN DÉFAUT DE LA MONTRE, ET LUI SEUL : sa mémoire
         circulaire qui oublie le début d'une nuit. Une fenêtre SAISIE n'est
         pas une relecture tardive, c'est un témoignage ; le raccourcir est
         précisément ce que la personne demande. Même exemption, et pour la
         même raison, que `fermerLaPorte()` juste en dessous : les deux règles
         jugent la montre, aucune ne juge Dino. Banc :
         `test-correction-manuelle.js`, section G. */
      var _prev = manuel ? null : flsNuitDe(dayKey);
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
      /* ═══ v2127 — LA PORTE DU MATIN : LA NUIT SE FERME ENFIN ═══════════════
         MESURÉ contre l'export officiel WHOOP, 24 nuits appariées
         (outils/porte-du-matin.js) : le COUCHER tombe à 4 minutes, mais ONZE
         nuits ont un réveil hors d'un quart d'heure, dont cinq à DEUX HEURES.
         Dans ces deux heures il est debout — cœur jusqu'à 133, et une fois
         882 pas en quinze minutes — et nous appelons ça du sommeil.

         POURQUOI AUCUN DES TROIS INSTRUMENTS NE FERME LA PORTE. `pasMin` exige
         18 pas/min : la preuve n'est là que sur deux nuits fautives sur six
         (se lever et traîner, c'est 15/min). `mv` est en `non-fiable` sur ces
         nuits. Et le test FC compare à une base GLISSANTE de ±45 min, qui
         MONTE avec l'éveil : le 23 août, base de nuit 50, base glissante à
         08h48 = 64 — un écart réel de +19 bpm vu comme +5 contre un seuil de
         16. Lever ces trois causes à la fois ne change RIEN (46,5 → 46,5) :
         couché éveillé, sa FC médiane n'est que 6 à 10 bpm au-dessus de son
         sommeil, et pour de bon.

         CE QUI MARCHE EST UNE QUESTION DE POSITION, PAS DE SEUIL. Toutes les
         règles essayées échouaient de la même façon : elles mordaient AU
         MILIEU. Un éveil de 40 min à 3 h du matin est une interruption ; le
         même dans le dernier tiers est le lever. `2N/3` n'est pas un réglage
         de plus, c'est « on ne cherche la FIN de la nuit que dans sa fin ».

         ET ON NE FERME QUE CE QU'ON SAIT PLACER. La seule nuit que la règle
         abîmait (6 août, −128 → −274) porte un fuseau POSÉ APRÈS COUP : ses
         bornes sont déjà décalées de deux heures avant qu'on y touche, parce
         que `flMinuitDe` fabrique l'instant absolu À PARTIR de cet offset
         (défaut fermé le même jour, v2127). `tz.le === dayKey` est donc la
         garde : un fuseau qu'on n'a pas mesuré ce jour-là n'est pas une
         mesure, et on ne coupe pas sur une supposition.

             règle                          |écart| moy   cassées   réparées
             aujourd hui                         46,5      0/13       0/11
             ≥30 min, dernier tiers              30,3      0/13       3/11   (abîme le 6 août)
             ≥30 min, dernier tiers, fuseau sûr  31,5      0/13       3/11   ← posée

         AUCUNE NUIT N'EMPIRE, et le pire cas reste celui d'aujourd'hui. Trois
         nuits reviennent à 0, +3 et +7 minutes du témoin. Restent hors de
         portée le 15 et le 20 août, dont la fin ne contient aucun bloc
         d'éveil de 30 min : le re-découpage y voit du sommeil continu.

         DEUX ET PAS TRENTE. On coupe la FENÊTRE, on ne retouche aucun stade :
         les tranches gardées sont celles qui précèdent la coupe, et
         `flsAgreger` recompte derrière. Une porte qui ferme trop tôt coûte
         plus cher qu'une qui ferme tard — elle ampute du vrai sommeil, et le
         sommeil alimente le besoin, la dette, le score et la récupération.

         PLACÉE ICI, ET C'EST DÉLIBÉRÉ. Le garde-fou « une nuit ne rétrécit
         jamais » est juste au-dessus : il protège d'un DÉFAUT — la mémoire
         circulaire de la montre qui oublie le DÉBUT d'une nuit. Il juge donc
         la fenêtre telle que la montre l'a livrée, et il doit continuer. La
         porte, elle, est une DÉCISION sur la fin, déterministe et rejouable :
         la faire juger par un garde écrit pour un autre mal la ferait rejeter
         sous le message « la montre a oublié le début », qui serait faux.
         Et avant les affectations de `s` : plus bas, la durée et les stades
         seraient déjà écrits. */
      (function fermerLaPorte() {
        try {
          if (manuel) return;                           /* 7 sept. 2026 — la fin saisie fait foi */
          var w = flsLire('watch_' + dayKey, null) || {};
          if (!w.tz || w.tz.le !== dayKey) return;      /* fuseau non mesuré ce jour-là */
          var d0Tiers = Math.floor(N * 2 / 3), coupe = null;
          for (var i = 0; i < newStages.length; i++) {
            var sg = newStages[i];
            if (sg.stage === 'awake' && sg.durMin >= CLASSIF.eveilFermeNuit && sg.startMin >= d0Tiers) {
              coupe = sg.startMin; break;
            }
          }
          if (coupe == null || coupe >= N) return;
          var gardees = [];
          for (var j = 0; j < newStages.length; j++) {
            var t = newStages[j]; if (t.startMin >= coupe) break;
            gardees.push(t.startMin + t.durMin <= coupe ? t
                       : { stage: t.stage, startMin: t.startMin, durMin: coupe - t.startMin });
          }
          if (!gardees.length) return;
          flsLog('nuit ' + dayKey + ' : porte du matin — fermeture a +' + coupe
               + ' min au lieu de +' + N + ' (' + (N - coupe) + ' min d eveil retires)');
          newStages = gardees; N = coupe;
          /* on recompte comme plus haut : les agrégats viennent des tranches,
             jamais d'une soustraction — une soustraction se désynchronise. */
          agg = { deep: 0, light: 0, rem: 0, awake: 0 };
          for (var g = 0; g < gardees.length; g++) agg[gardees[g].stage] += gardees[g].durMin;
          asleep = agg.deep + agg.light + agg.rem;
        } catch (e) {}
      })();
      var d0 = new Date(start * 1000), dEnd = new Date((start + N * 60) * 1000);
      s.source = manuel ? 'manuel' : 'ble';
      /* ═══ 12 septembre 2026 — LA NUIT MESURÉE NE PORTE PLUS LE DRAPEAU DE
         L'ESTIMATION. `s` est l'objet `watch_<K>.night` tel qu'il est en base,
         et quand la montre livre APRÈS que `computeNight` a posé sa nuit
         déduite de la fréquence cardiaque, cet objet arrive ici avec
         `_est:true`. On y écrivait les stades, `source:'ble'`, la vraie fenêtre
         — et on laissait le drapeau. Lu sur la base rapatriée de Dino ce
         midi-là : `{_est:true, source:'ble', sleepMin:193, stages:22}`.
         Or `flNuitRecouper` (index.html) ne regarde QUE ce drapeau pour savoir
         s'il a le droit d'écraser : « nuit mesurée : on ne touche pas » ne
         tenait donc jamais après une estimation. À chaque livraison, l'un
         écrivait 245 min, l'autre 193, le dernier gagnait — SOMMEIL 4h05 puis
         3h13 à 10 h 28, même minute, mêmes captures. Le « DEUX MOTEURS
         ÉCRIVENT AU MÊME ENDROIT » du bas de ce fichier décrivait le symptôme ;
         la cause tenait dans un drapeau jamais retiré. Banc :
         test-nuit-deux-auteurs.js ; rejeu : outils/rejeu-nuit-deux-auteurs.js. */
      delete s._est;
      s.sleepStart = start * 1000; s.sleepEnd = (start + N * 60) * 1000;
      s.timeInBed = N; s.sleepMin = asleep;
      s.deep = agg.deep; s.light = agg.light; s.rem = agg.rem; s.awake = agg.awake;
      /* ═══ v1876 — « ENDORMI EN » EST RETIRÉ, ET VOICI POURQUOI ══════════════

         ICI SE TROUVAIT `s.latenceMin` : le nombre de minutes d'éveil avant le
         premier vrai stade, posé en v1274, réconcilié en v1326, rebranché au
         pont en v1854. Trois versions de plomberie, deux bancs, et la valeur
         traversait parfaitement. Personne n'avait vérifié CE QU'ELLE VALAIT.

         Elle valait 4. Toutes les nuits. Vingt-trois sur vingt-trois dans la
         base de Dino. Elle comptait l'en-tête d'enregistrement de la montre —
         voir le rognage de tête, plus haut, et sa preuve.

         DEPUIS CE ROGNAGE, ELLE VAUDRAIT 0. Toutes les nuits, et par
         CONSTRUCTION : la fenêtre commence désormais au premier stade de
         sommeil, donc il ne peut plus rien y avoir d'éveil avant lui. Un zéro
         constant n'est pas une mesure, c'est une tautologie.

         ET ON NE PEUT PAS LA MESURER AUTREMENT. Éprouvé le 26 août sur les 23
         nuits, quatre sources :
           · la puce         — son enregistrement COMMENCE à l'endormissement ;
                               elle n'enregistre jamais « au lit mais éveillé » ;
           · la FC, par seuil — 0 ou 1 min sur 19 nuits sur 23 dès qu'on prend
                               une référence honnête ; le résultat ne dépendait
                               que du seuil choisi ;
           · la FC, par genou de la descente, SANS aucun seuil (ajustement
                               droite+palier) — répond 2 fois sur 23, et les
                               deux fois c'est du bruit (pente −0,04 bpm/min).
                               Sur 21 nuits, « il ne se passe rien » explique la
                               courbe aussi bien ;
           · les pas iPhone et les pas montre — se contredisent jusqu'à une
                               heure et demie (15 août : 94 min contre 12).

         LA RAISON DE FOND N'EST PAS TECHNIQUE. La FC de Dino à l'endormissement
         déclaré est déjà à 51-55, son plancher de nuit est à 47 : l'écart à
         trouver fait quatre à six battements, dans une courbe qui saute de ±20
         au moindre mouvement. Il n'y a pas de marche d'escalier à détecter
         parce qu'il n'y en a pas dans le corps.

         SI QUELQU'UN VEUT LA REMETTRE : il faudra un côté DÉCLARÉ — l'heure de
         coucher dite par la personne, comme en laboratoire (« lumière
         éteinte »). C'est la seule définition que ce matériel permet, et elle
         demande un geste, pas un calcul. Un banc garde ce refus :
         `test-endormi-en-retire.js`. */
      s.stages = newStages;
      s.bedMin = flsMinuteDu(dayKey, d0.getTime());
      s.wakeMin = flsMinuteDu(dayKey, dEnd.getTime());
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
                                sleepMin: s.sleepMin, timeInBed: s.timeInBed, source: s.source });
      flsLog('🌙 re-staging ' + dayKey + ': ' + Math.floor(asleep / 60) + 'h' + String(asleep % 60).padStart(2, '0') +
          ' [' + flHHMM(s.bedMin) + '-' + flHHMM(s.wakeMin) + '] éveil ' + agg.awake + ' min (V8 ' + Math.floor(s.sleepMinV8 / 60) + 'h' + String(s.sleepMinV8 % 60).padStart(2, '0') + ')'
          + ' | source ' + stageSrc + ' (FC ' + Math.round(covFrac * 100) + '% des minutes)'
          + ' | profond ' + Math.round(agg.deep / Math.max(1, asleep) * 100) + '% REM ' + Math.round(agg.rem / Math.max(1, asleep) * 100) + '%');
      /* S14 : l'histogramme de récupération 7 j était vide parce que recov_ des
         jours passés n'était jamais réécrit.
         ═══ 14 sept. 2026 — CE COMMENTAIRE DÉCRIVAIT UN CODE QUI N'EXISTE PAS ══
         Il annonçait « chaque nuit intégrée recalcule le sien » ; aucune ligne ne
         l'a jamais fait ICI, et on ne l'y met toujours pas — le re-staging
         n'est pas le bon endroit : il tourne à chaque tranche, y compris sur
         des nuits que personne ne regarde, et il ferait bouger un nombre déjà
         vu sans que rien ne le déclare.
         OÙ LA QUESTION S'EST FERMÉE : dans `flRecovLu(off<0)`
         (flint-recup-cycle.js), c'est-à-dire à la LECTURE, la seule porte que
         la production emprunte pour un jour passé. Elle écrivait `recov_<K>` au
         PREMIER score calculé et le figeait ; quand cette première lecture
         tombait pendant que le bracelet livrait encore la nuit par tranches, le
         registre gardait la tranche initiale. Mesuré sur la vraie nuit de Dino
         du 13 sept. (417 min), rejouée en trois tranches : le registre restait
         à 25 quand cette nuit en vaut 74 — 49 points.
         CE QU'ELLE FAIT DEPUIS : elle écrit TOUJOURS (refuser trouait le
         registre sur les jours qu'il est seul à remplir — 25 entrées → 22 et
         la flamme « N jours de suite » de 13 à 0), et elle estampille à côté
         la nuit mesurée (`recovNuitReg_<K>`). La lecture suivante CORRIGE
         l'entrée si cette nuit a bougé de plus que le seuil du cycle (5 min),
         garde la première valeur vue dans `recovAvant_<K>`, et le déclare
         (`fige:false`, `etat:'provisoire'`, relayé jusqu'à `scoreEtat`). Bornes :
         nuit de bracelet, âge 1 à 3 jours, jamais un jour scellé, jamais une
         entrée sans estampille — donc jamais une entrée d'avant ce jour.
         SUR CETTE NUIT-CI, RIEN N'EST À FAIRE : `restageSleep` la réécrit, la
         lecture d'après la verra bougée et corrigera d'elle-même.
         Banc : FLINT/web/tests/test-recup-jour-passe-en-livraison.js, § 3 à 3 d
         (§ 3 b garde la non-régression du remède qu'on a refusé). */
    } catch (e) { flsLog('restage: ' + e.message); }
  }
  /* ── Entrée unique, appelée par le natif ──────────────────────────────────
     Reçoit une tranche telle que la montre l'a envoyée, l'accumule, puis
     recalcule la nuit du jour concerné et celle de la veille (une nuit à cheval
     sur minuit appartient au jour du réveil). */
  window.flintSommeilTranche = function (tranche) {
    try {
      /* v2043 — LA NUIT QUI ARRIVE SE DATE ICI, à sa vraie porte d'entrée.
         Le cycle de récupération retenait sa publication sur le drapeau
         `synchroActive` — resté collé à vrai le 30 août, pendant que le canal
         mouvement bavardait toutes les trois secondes : la « collecte » ne
         finissait jamais, et toutes les pages montraient le score de la
         veille. Or ce que la collecte doit attendre, ce n'est pas « le
         bracelet parle », c'est « LA NUIT est en train d'arriver » — et les
         tranches de sommeil n'entrent que par cette fonction (PontSommeil
         évalue `flintSommeilTranche` directement, sans passer par
         `flintNative`). L'horodatage vit sur `_watchLive`, qui est une vraie
         propriété de `window` (posée par `window._watchLive={...}`). */
      try { (window._watchLive = window._watchLive || {}).tNuit = Date.now(); } catch (e2) {}
      /* v2044 — et on arme le réveil de fin de livraison : quand cette rafale
         s'arrêtera, quelqu'un doit RELIRE le score, sinon la publication
         attend le prochain hasard (vécu : 52 affiché, 70 publiable, app posée
         sur la table). La minuterie vit dans index.html, à côté du cycle. */
      try { window.flRecupReveilArmer && window.flRecupReveilArmer(); } catch (e3) {}
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
        /* ═══ v1900 — LA MEME TRANCHE, DEUX HORLOGES ══════════════════════
           Le `deja` ci-dessus compare `c.start === tranche.start`. C'est juste
           tant que la tranche revient avec le MEME horodatage — et du 12 au
           23 aout 2026 elle revenait DEUX HEURES plus tard, avec des stades
           strictement identiques. 23 paires dans la base de Dino, toutes a
           7200 s d'ecart, aucun autre ecart. Le moteur recollait les deux, et
           la nuit s'etirait : 7 h 30 de sommeil au lieu de 6 h 11, un coucher
           annonce a 22 h 48 quand il etait 00 h 44.
           `flPas.nettoyerTranches` mesure le decalage dans la serie au lieu de
           le supposer, et ne retire que ce qui a un jumeau EXACT a ce
           decalage. Sur une serie saine elle ne retire rien — c'est ce qui
           permet de la poser ici sans risque.
           `window.flPas` et pas `flPas` : le module vit dans un autre fichier,
           une lecture nue leverait si le web servi etait perime. */
        try {
          var P = (typeof window !== 'undefined') ? window.flPas : null;
          if (P && P.nettoyerTranches) {
            var net = P.nettoyerTranches(toutes);
            if (net.retires) {
              flsLog('tranches doubles : ' + net.retires + ' retiree(s), decalage '
                     + net.decalage + ' s');
              toutes = net.tranches;
            }
          }
        } catch (e) { flsLog('dedup tranches : ' + e.message); }
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
        flsEcrire('flintSleepChunks', toutes);
      }
      /* 11 sept. 2026 (v2329) — une tranche DÉJÀ intégrée ne change rien à la
         nuit : on ne la recalcule pas pour elle (931 tranches reçues en une
         heure ce matin-là, presque toutes déjà connues, ~200 ms chacune). Une
         tranche neuve garde son recalcul immédiat. */
      if (!deja) window.flintSommeilRecalculer();
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
  /* ═══ v2037 — LES SEUILS DE LA NUIT SONT PUBLIÉS ═══════════════════════════
     Le cycle de vie de la récupération (`flint-recup-cycle.js`) a besoin de
     savoir jusqu'à quand une nuit peut encore se recoller : c'est EXACTEMENT
     la question que `reveilCoupeNuit` tranche déjà ici, et la preuve de reprise
     de journée (marche franche) avec elle. Publier ces trois nombres est la
     seule façon qu'ils restent UN seul réglage : un cycle qui recopierait
     « 4 heures » chez lui divergerait le jour où ce seuil bouge, et personne
     ne le verrait — c'est le défaut `latenceMin`/`latency` sous une autre
     forme. Le moteur reste seul propriétaire, il se contente de répondre. */
  window.flSommeilSeuils = function () {
    return { reveilCoupeNuit: CLASSIF.reveilCoupeNuit,
             marcheSuiteMini: MARCHE_SUITE_MINI,
             marchePasMini: MARCHE_PAS_MINI,
             partNuitMini: CLASSIF.partNuitMini,
             /* v2059 — LA DUREE QUI FAIT UNE NUIT A ELLE SEULE. La journee
                logique en a besoin pour le cas du travail de nuit : quelqu'un
                qui dort de 10 h a 16 h n'obtient JAMAIS de `mainSleep` (la
                plage nocturne de `flsClasser` se ferme a 10 h), donc jamais de
                frontiere, donc une journee qui ne se referme pas — le defaut de
                Sylvie par un autre chemin. Elle accepte alors, EN DERNIER
                RECOURS, un sommeil secondaire d'au moins cette duree.
                Publiee plutot que recopiee, pour la meme raison que les quatre
                du dessus : deux copies d'un seuil divergent un jour, et
                personne ne le voit. */
             dureeNuitEvidente: CLASSIF.dureeNuitEvidente };
  };
  /* La MÊME sonde de marche que la fusion des segments, sur n'importe quelle
     fenêtre. Deux lecteurs, un calcul. */
  window.flSommeilMarcheDans = function (K, debutMs, finMs) { return flsMarcheDans(K, debutMs, finMs); };
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
  /* 7 septembre 2026 — « MODIFIER » UNE SIESTE DEPUIS MA JOURNÉE.
     L'appui long écrit `s.start` à plat via `flModifierSeance` (index.html),
     sans marquer la sieste comme corrigée : au recalcul suivant,
     `flsPoserActivite` la retrouvait à ±30 min et remettait la mesure de la
     montre. Cette porte, appelée par le natif juste après, pose la fenêtre
     corrigée, la marque manuelle (`auto:false`, `src:'manuel'`) et met le
     registre `watch_<K>.sommeils` d'accord avec la journée. */
  window.flSommeilFixerSieste = function (K, debutMin, finMin, startAvant) {
    try {
      if (!K) { var _n1 = new Date();
                K = _n1.getFullYear() + '-' + (_n1.getMonth() + 1) + '-' + _n1.getDate(); }
      var d = Math.round(+debutMin), f = Math.round(+finMin);
      if (!(f > d)) return 'fenêtre vide · ' + d + '→' + f;
      var hh = flsHHMM(d), ss = flsLire('sessions_' + K, []) || [], cible = null;
      for (var i = 0; i < ss.length; i++) {
        var x = ss[i];
        if (!x || x.type !== 'nap' || !x.start) continue;
        if (x.start === hh || (startAvant && x.start === startAvant)) { cible = x; break; }
      }
      if (!cible) return 'sieste introuvable · ' + K + ' · ' + hh;
      cible.start = hh; cible.dur = f - d; cible.sleepMin = f - d;
      cible.auto = false; cible.src = 'manuel'; cible.prolonge = 0; cible.prolongeJusqu = null;
      if (!flsEcrire('sessions_' + K, ss)) return 'écriture refusée · ' + K;
      var p = String(K).split('-');
      var minuit = new Date(+p[0], +p[1] - 1, +p[2], 0, 0, 0).getTime();
      flsPoserSommeil(K, { debut: minuit + d * 60000, fin: minuit + f * 60000, type: TYPE_SIESTE,
                           sleepMin: f - d, source: 'manuel' });
      flsLog('sieste ' + K + ' : fixée à la main ' + hh + ' → ' + flsHHMM(f) + ' (' + (f - d) + ' min)');
      return 'sieste fixée · ' + K + ' · ' + hh + ' → ' + flsHHMM(f);
    } catch (e) { return 'ECHEC · ' + (e && e.message ? e.message : '?'); }
  };

  /* 7 septembre 2026 — LA SIESTE DE LA VEILLE, POUR LE BESOIN DE LA NUIT.
     Règle publique de WHOOP, confirmée par leur développeur le soir même :
     « Sleep Need = Baseline + Strain + Sleep Debt − Naps » — les siestes
     réduisent le besoin de la nuit qui suit, minute pour minute, sans
     coefficient sur le profond, et ne touchent ni la dette ni la récupération.
     `flBesoinNuitDuJour` (index.html) l'appelle sur K−1, le jour que la nuit
     répare. `sleepMin` (dormi) avant `dur` (fenêtre) ; plafond 180 min : au-delà
     ce n'est plus une sieste (`dureeMaxiSieste`). Banc : test-credit-sieste.js. */
  window.flSommeilSiesteVeille = function (K) {
    try {
      var ss = flsLire('sessions_' + K, []) || [], total = 0;
      for (var i = 0; i < ss.length; i++) {
        var x = ss[i];
        if (!x || x.type !== TYPE_SIESTE) continue;
        var m = (x.sleepMin != null && +x.sleepMin > 0) ? +x.sleepMin : (+x.dur || 0);
        if (m > 0) total += m;
      }
      return Math.min(CLASSIF.dureeMaxiSieste, Math.round(total));
    } catch (e) { return 0; }
  };

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
        n.bedMin = flsMinuteDu(K, dd.getTime());
        n.wakeMin = flsMinuteDu(K, df.getTime());
        n.timeInBed = duree;
        if (n.sleepMin == null || n.sleepMin > duree) n.sleepMin = duree;
        n.source = 'manuel';
        /* 7 sept. 2026 — LA FENÊTRE SAISIE EST MÉMORISÉE EN CLAIR, et c'est
           elle que `restageSleep` projette désormais (stades, courbe,
           bornes) au lieu de rendre la nuit au bracelet 400 ms plus tard. */
        n.manuelStart = deb; n.manuelEnd = fin;
        w.night = n;
        flsEcrire('watch_' + K, w);
      } else {
        flsPoserActivite(K, { debut: deb, fin: fin, sleepMin: duree, source: 'manuel' });
      }
      flsLog('saisie manuelle ' + K + ' : ' + duree + ' min, classée ' + type);
      /* 7 sept. 2026 — INSTANTANÉ, PAS « AU PROCHAIN PASSAGE DE LA MONTRE ».
         Dino : « si je corrige, c'est instantané ». Le recalcul projette la
         fenêtre saisie ; puis le sceau du matin (`nuitFige_`), que
         `flNuitServir` ressert à chaque lecture, est réécrit sur cette
         nuit-là — sinon l'écran continuait d'afficher l'ancienne fenêtre,
         scellée, par construction. */
      try { window.flintSommeilRecalculer(); } catch (eR) { flsLog('saisie manuelle : recalcul — ' + eR.message); }
      if (type === TYPE_NUIT) {
        try {
          if (typeof window.flNuitResceller === 'function') {
            var rs = window.flNuitResceller(K, 'manuel');
            flsLog('saisie manuelle ' + K + ' : sceau ' + (rs && rs.ok ? 'réécrit' : ('inchangé — ' + (rs && rs.raison))));
          }
        } catch (eS) { flsLog('saisie manuelle : sceau — ' + eS.message); }
      }
      return { ok: true, type: type, dureeMin: duree };
    } catch (e) { flsLog('saisie manuelle : ' + e.message); return { ok: false, raison: 'erreur' }; }
  };

  /* ═══ 7 sept. 2026 — LE RECALCUL SE COALESCE PAR SALVE ═════════════════════
     Chaque page de FC continue qui entrait au moteur appelait
     `flintSommeilRecalculer` — qui ignore son argument et refait TOUTES les
     nuits : 174 ms au banc, multiplié par le nombre de pages de la salve. Les
     pages déjà connues n'entrent plus (FlintTestBand.pageDejaConnue), mais une
     synchro du matin en apporte encore une poignée d'un coup. Ici on attend
     400 ms de calme puis on recalcule UNE fois. Les tranches de sommeil
     (`flintSommeilTranche`), elles, gardent leur recalcul immédiat : les
     bancs lisent la base juste après, et la nuit du matin en dépend. */
  var _flsBientotT = null;
  window.flintSommeilRecalculerBientot = function () {
    try {
      if (_flsBientotT) clearTimeout(_flsBientotT);
      _flsBientotT = setTimeout(function () {
        _flsBientotT = null;
        try { window.flintSommeilRecalculer(); } catch (e) {}
      }, 400);
    } catch (e) { try { window.flintSommeilRecalculer(); } catch (e2) {} }
  };
  window.flintSommeilRecalculer = function () {
    try {
      flsOublierMinuits();
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
      /* v1842 — ET LE MÉNAGE D'APRÈS, une fois la nuit connue : les siestes
         posées pendant que la nuit arrivait à l'envers (du plus récent au plus
         ancien) sont des suffixes de la nuit — on les relit à la lumière de la
         fenêtre finale. Il passe APRÈS le re-staging, parce qu'il a besoin de
         la nuit ; les autres ménages passent avant, parce que le re-staging
         repose ce qu'ils retirent. */
      Object.keys(jours).forEach(function (K) { flsBalayerSiestesDansLaNuit(K); });
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


/* ═══ v2281 — LA STRUCTURE DE LA NUIT, ET SON DÉNOMINATEUR ══════════════════

   Les quatre lignes de la fiche — PROFOND, LÉGER, PARADOXAL, RÉVEIL — avec
   leur part, leur durée, et la plage habituelle de la part. Elles viennent
   d'index.html (`flSommeilData`), qui touchait son plafond de découpage :
   c'est du métier, il va dans un fichier de métier.

   ── CE QUI EST CORRIGÉ EN PASSANT, ET C'EST LA RAISON DU DÉPLACEMENT ──────

   Le dénominateur était `asleep`, le temps de SOMMEIL. Or le réveil n'est pas
   une part du sommeil : profond + léger + paradoxal font déjà 100 % à eux
   trois, et diviser le réveil par la même chose l'ajoute PAR-DESSUS. Relevé
   sur la nuit du 9 septembre de Félix — 73 + 201 + 85 min de sommeil, 13 min
   d'éveil : 20 + 56 + 24 + 4 = 104 %. Un écran qui affiche 104 % ne se
   discute pas.

   LE DÉNOMINATEUR EST DONC LE TOTAL DES QUATRE LIGNES. C'est le seul qui
   fasse d'elles une partition : chacune est sa part de ce qui est montré, et
   la somme fait cent. Ce n'est pas `timeInBed`, et c'est délibéré — un total
   lu ailleurs peut ne pas coïncider avec ce que les quatre lignes affichent,
   et la somme repartirait à côté de cent sans qu'on sache pourquoi.

   IL RESTE JUSTE QUAND LE SCEAU ET LE MOTEUR DIVERGENT, et c'est le second
   gain. Le 8 septembre, `flNuitServir` a greffé un total scellé de 288 min
   sur des stades qui en font 409 : l'ancien calcul rendait 34 + 69 + 39 + 8
   = 150 %. Avec le total des quatre, les barres décrivent une nuit COHÉRENTE
   même quand l'en-tête ment. Ça ne corrige pas la greffe — c'est le défaut 1
   de CHANTIER-DINO-8-SEPTEMBRE.md, et il reste entier — mais ça l'empêche de
   produire un écran absurde.

   ── CE QUI NE CHANGE PAS ──────────────────────────────────────────────────

   LA PART, PAS LA DURÉE, pour la plage habituelle. Une nuit courte et une
   nuit longue peuvent avoir la même structure ; c'est la structure qu'on
   compare. Un profond à 20 % reste un profond à 20 %, qu'on ait dormi cinq
   heures ou huit. Dino a choisi les pourcents et non les minutes, et il a
   raison : c'est déjà l'unité que la bande encode.

   LA PLAGE SUIT LE MÊME DÉNOMINATEUR QUE LA PART. Sans ça la bande et ses
   repères parleraient deux langues, et le repère tomberait à côté de la
   barre qu'il est censé situer.

   On relit `sleepNight` des nuits passées : la même source que la nuit
   affichée, jamais un cache d'affichage. Une nuit sans stades mesurés ne rend
   rien — c'est le cas des nuits de Dino, et c'est ce qui doit arriver.

   ⚠ LIAISONS. `tk` se lit NU, jamais par `window` (garde-liaisons, et la
   leçon de marche.js). `sleepNight` et `flPlageHabituelle` se testent par
   `typeof` avant d'être appelés : une liaison de fichier ne se suppose pas.
   Le banc : tests/test-stades-parts.js. */
window.flStadesTotal = function (x) {
  if (!x) return 0;
  return (+x.deep || 0) + (+x.light || 0) + (+x.rem || 0) + (+x.awake || 0);
};

window.flStadesNuit = function (n) {
  if (!n) return null;
  function hm(m) {
    if (m == null) return null;
    m = Math.round(m);
    return Math.floor(m / 60) + 'h' + String(m % 60).padStart(2, '0');
  }
  /* La part d'un stade sur une nuit passée, pour la plage habituelle. */
  function part(cle) {
    return function (off) {
      try {
        if (typeof sleepNight !== 'function') return null;
        var nn = sleepNight(tk(off));
        if (!nn || !nn.asleep) return null;
        if (!nn.stages || !nn.stages.length) return null;
        var v = nn[cle]; if (v == null) return null;
        var T = window.flStadesTotal(nn); if (!T) return null;
        return v / T * 100;
      } catch (e) { return null; }
    };
  }
  var TOT = window.flStadesTotal(n);
  var _dec = Math.min(0, (window.flDayOff | 0));
  function faire(nom, cle, minutes) {
    var o = { nom: nom, pct: (TOT ? Math.round((minutes || 0) / TOT * 100) : 0),
              duree: hm(minutes || 0) };
    var p = null;
    try {
      if (typeof window.flPlageHabituelle === 'function')
        p = window.flPlageHabituelle('stade:' + cle, part(cle), _dec);
    } catch (e) {}
    /* Les deux bornes ou aucune : une borne seule ne décrit pas un intervalle,
       et le front l'ignorerait. On arrondit comme `pct`. */
    if (p) { o.plageMin = Math.round(p.min); o.plageMax = Math.round(p.max); }
    return o;
  }
  return [faire('PROFOND', 'deep', n.deep),
          faire('LÉGER', 'light', n.light),
          faire('PARADOXAL', 'rem', n.rem),
          faire('RÉVEIL', 'awake', n.awake)];
};
