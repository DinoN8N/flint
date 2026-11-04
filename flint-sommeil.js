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
        return false;
      }
      /* v1165 — LE DERNIER VERROU, celui qui manquait.
         Quoi qu'aient décidé les étages au-dessus, rien qui ne ressemble pas à
         une nuit n'entre dans `night`. Et deux périodes DISJOINTES le même jour
         ne se remplacent pas : la plus longue reste la nuit, l'autre est déjà
         enregistrée à part. En cas de doute on conserve les deux — jamais une
         suppression silencieuse. */
      if (nuit && nuit.sleepStart != null && nuit.sleepEnd != null) {
        var type = flsClasser(nuit.sleepStart, nuit.sleepEnd);
        /* 1er oct. 2026 — sauf la nuit courte que `nightFromChunks` a retenue
           en dernier recours (nocturne, aucune autre nuit ce jour-là). */
        if (type !== TYPE_NUIT && !(type === TYPE_SECOND && nuit.nuitCourte)) {
          flsLog('nuit ' + K + ' : la période proposée est classée « ' + type +
                 ' » — enregistrée à part, la nuit principale n est pas touchée.');
          return false;
        }
        if (av && av.sleepStart != null && av.sleepEnd != null) {
          var chevauche = Math.min(av.sleepEnd, nuit.sleepEnd) - Math.max(av.sleepStart, nuit.sleepStart) > 0;
          if (!chevauche && (av.sleepMin || 0) >= (nuit.sleepMin || 0)) {
            flsLog('nuit ' + K + ' : deux périodes distinctes ce jour-là, la plus longue reste la nuit principale.');
            return false;
          }
        }
      }
      /* 12 septembre 2026 — une nuit qui porte un hypnogramme est MESURÉE,
         quoi que dise le drapeau hérité de l'objet qu'elle remplace (voir le
         pavé de `restageSleep`). Le seul chemin d'écriture d'une nuit mesurée
         passe ici : c'est ici que l'invariant se tient. */
      if (nuit && nuit.stages && nuit.stages.length && nuit._est) delete nuit._est;
      /* 3 oct. 2026 — au-delà de la fenêtre du re-staging (7 jours), la nuit
         s'écrit SANS `hrTs` : ce n'est qu'une projection de `watch_<K>.hr`
         (flsHrTs) que ses lecteurs savent refaire, et une tranche ancienne
         encore en mémoire la reposait à chaque recalcul, après que le ménage
         l'avait rendue (flint-menage.js, étape 3). L'objet de l'appelant n'est
         pas touché : il sert encore après l'écriture. */
      if (nuit && nuit.hrTs) {
        var _pK = String(K).split('-'), _jK = new Date(+_pK[0], +_pK[1] - 1, +_pK[2]), _j0 = new Date();
        _j0.setHours(0, 0, 0, 0);
        if (Math.round((_j0 - _jK) / 86400000) > 7) { nuit = Object.assign({}, nuit); delete nuit.hrTs; }
      }
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
      return true;
    } catch (e) { flsLog('écriture impossible : ' + e.message); return false; }
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
  /* ═══ 1er oct. 2026 — UNE NUIT FINIE AVANT MINUIT A DES MINUTES NÉGATIVES ══
     La nuit du soir est rangée au lendemain (`flsJourDuGroupe`). Ramenées dans
     [0, 1440), ses minutes la décriraient le SOIR DE K — dans le futur — et
     `flNuitCycle` (minuit de K + `wakeMin`) attendrait un réveil qui n'a pas
     encore eu lieu : la nuit ne se fermerait jamais. On garde donc la minute
     RELATIVE au minuit de K, négative : 23:49 la veille vaut −11, et
     `minuit + wakeMin` retombe juste partout sans qu'aucun lecteur ne change.
     Seule la nuit qui FINIT avant minuit est concernée ; une nuit qui le
     traverse garde la convention de toujours (coucher 1380 = 23:00 la veille). */
  function flsMinuteDuNuit(K, ms, finMs) {
    var m0 = flsMinuit(K);
    if (finMs / 1000 <= m0) return Math.round((ms / 1000 - m0) / 60);
    return flsMinuteDu(K, ms);
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
    var brut = w.hr.map(function (x) { return [x[1], minuit + x[0] * 60]; });
    /* 2 nov. 2026 — le pouls doublé, divisé par deux ici aussi ; la veille au soir donne le repos
       d'avant minuit (la nuit du 2 nov. doublait de 00:00 à 00:35). */
    try {
      var veille = flsHrTsVeille(K), tous = veille.concat(brut).map(function (x) { return [Math.round(x[1] / 60), x[0]]; });
      tous.sort(function (a, b) { return a[0] - b[0]; });
      var dd = window.flPoulsDedouble(tous);
      if (dd.n) {
        var corr = {}; dd.pts.forEach(function (x) { corr[x[0]] = x[1]; });
        return brut.map(function (x) { var m = Math.round(x[1] / 60); return [corr[m] != null ? corr[m] : x[0], x[1]]; });
      }
    } catch (e) {}
    return brut;
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
    /* ═══ 1er oct. 2026 — LA NUIT COURTE D'UNE INSOMNIE EST UNE NUIT ═════════
       Nuit du 30 sept. au 1er oct., insomnie de Dino : la montre mesure
       22:32 → 23:49 (74 min dormies, profond compris), le pouls dit sommeil
       jusqu'à 00:13, puis deux heures et demie d'éveil allongé. WHOOP : nuit
       22:36 → 00:14, récupération 4 %. FLINT : « sommeil secondaire » (moins
       de `dureeMiniNuit`), donc pas de nuit mesurée, donc l'estimation par le
       pouls — et un pouls d'éveil allongé (53-60) ressemble à un pouls de
       sommeil : la nuit a suivi l'horloge, 4h00, récupération 70.
       Dino : « je préfère largement leur manière de faire » — un sommeil
       nocturne, même court, est LA nuit quand il n'y en a pas d'autre, et la
       récupération se calcule dessus comme si la nuit était finie. Un
       rendormissement la recollera (`reveilCoupeNuit`).
       SOIXANTE MINUTES DE SOMMEIL RÉEL, pas quinze : en dessous c'est un
       assoupissement, pas une nuit — la règle de la nuit blanche (14 août,
       « pas de sommeil mesuré = pas de nouvelle journée ») garde la main.
       Ce n'est qu'un DERNIER RECOURS : il ne joue que si aucune vraie nuit
       n'existe ce jour-là, donc aucune nuit déjà juste ne peut changer. */
    nuitCourteMini: 60,
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
    /* ═══ 2 nov. 2026 — APRÈS LA NUIT, DEUX HEURES DEBOUT FONT UNE SIESTE ═══════════════════
       Dino : « on s'endort de minuit à 8 h, on se réveille jusqu'à 10 h, puis après, à partir de
       2 h après un réveil, c'est considéré comme une sieste ». C'est le MATIN qu'il décrit :
       `reveilCoupeNuit` (4 h) reste le seuil d'un éveil EN PLEINE NUIT — l'insomnie du 1er oct.
       (22:32 → 23:49, debout 3 h 20, rendormi jusqu'à 07:40) est UNE nuit, comme chez WHOOP
       (test-nuit-courte-insomnie § 4, garde-cycle-natif). La nuit lue au cœur s'y tenait déjà :
       son rendormissement exige une heure calme (`NUIT_COEUR.rendormi`) finie dans les trois
       heures (`rendormiFen`), donc commencée dans les deux. La marche franche coupe plus tôt. */
    reveilSieste: 120,
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



  /* ═══ 1er oct. 2026 — LA NUIT DU SOIR APPARTIENT AU LENDEMAIN ═══════════════
     « Une nuit appartient au jour du réveil » supposait un réveil APRÈS minuit.
     Endormi à 22:32, réveillé à 23:49 et plus jamais rendormi : rangée au jour
     du réveil, cette nuit tombait sur la veille, qui a déjà SA nuit (celle du
     matin) — elle devenait un « sommeil secondaire » de la veille, et le jour
     qui commençait n'avait plus de nuit du tout.
     Un sommeil RÉEL qui commence et finit le même soir (après midi), et qui est
     majoritairement nocturne, est la nuit du LENDEMAIN. Le « majoritairement
     nocturne » est le seuil de `flsClasser`, rien de neuf : la sieste de 19 h
     reste à son jour. Tout le reste garde la règle d'avant, au mot près. */
  function flsCle(d) { return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); }
  function flsJourDuGroupe(f, reel) {
    var K = flsCle(new Date(f.end * 1000));
    if (!reel) return K;
    var d0 = new Date(reel.start * 1000), d1 = new Date((reel.end - 1) * 1000);
    if (flsCle(d0) !== flsCle(d1) || d0.getHours() < 12) return K;
    if (flsPartNocturne(reel.start * 1000, reel.end * 1000) < CLASSIF.partNuitMini) return K;
    return flsCle(new Date(d1.getFullYear(), d1.getMonth(), d1.getDate() + 1, 12));
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
      /* 2 nov. 2026 — LE FITCARE N'A PAS D'`actDet`, et cette preuve était AVEUGLE : zéro pas,
         toujours, donc jamais de « la journée avait repris » ni de sieste refusée pour marche.
         Même repli que la nuit lue au cœur (`flNuitDuCoeur`) : le podomètre de l'iPhone
         (`sante_<K>.pas`, blocs de cinq minutes ÉTALÉS minute par minute). */
      if (!blocs.length) {
        var pk = String(K).split('-'), minuit = new Date(+pk[0], +pk[1] - 1, +pk[2]).getTime();
        var sa = flsLire('sante_' + K, null) || {};
        var pb = Array.isArray(sa.pas) ? sa.pas : [];
        for (var e = 0; e < pb.length; e++) {
          var PB = pb[e];
          if (!PB || PB[0] == null || !(+PB[1] > 0)) continue;
          for (var f5 = 0; f5 < 5; f5++) {
            var m5 = minuit + (+PB[0] + f5) * 60000;
            if (m5 >= debut && m5 <= fin) { mins[Math.round(m5 / 60000)] = 1; pas += (+PB[1]) / 5; }
          }
        }
        pas = Math.round(pas);
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
  /* ═══ 29 oct. 2026 — UNE NUIT DÉDUITE DE JOUR, DÉJÀ RANGÉE, S'EN VA AUSSI ═══════

     La v2912 (index.html, `flNuitRecouper`) refuse d'ÉCRIRE une nuit déduite qui
     commence en pleine journée — « 10 h 30 → 14 h 25 » le 26 oct., l'après-midi de
     Dino. Mais celle qu'elle a refusée de récrire était DÉJÀ en base, et elle y est
     restée : `watch_2026-10-26.night = {_est:true, bedMin:630, wakeMin:865}`. Trois
     jours plus tard elle était encore l'une des quatre nuits auxquelles la
     régularité compare la nuit du jour (`flRegulariteNuit`) — une fenêtre d'après-
     midi ne recouvre aucune vraie nuit : régularité 60 contre 79 chez WHOOP, score de
     sommeil 68 contre 78.

     Même règle que la v2912, étroite exprès : une nuit DÉDUITE (`_est`, ou lue au
     pouls) qui commence entre 8 h et 20 h, ni saisie à la main, ni livrée par le
     bracelet. Le travailleur de nuit qui dort de 10 h à 16 h a une nuit MESURÉE par
     son bracelet ou corrigée à la main : celle-là reste. Banc :
     tests/test-nuit-de-jour-purgee.js. */
  function flsPurgerNuitsDeJour(K) {
    try {
      var w = flsLire('watch_' + K, null);
      var n = w && w.night;
      if (!n || n.bedMin == null) return;
      if (n.source === 'manuel' || n.source === 'ble') return;
      if (!(n._est || n.lecteur === 'coeur')) return;
      if (!(n.bedMin >= 8 * 60 && n.bedMin <= 20 * 60)) return;
      delete w.night;
      flsEcrire('watch_' + K, w);
      /* La copie VIVANTE aussi (v1824 : une purge qui n'écrit que le disque est défaite au
         prochain `wSaveK` du jour) ; `flWatchOublier` ne reprend qu'une nuit présente. */
      try {
        if (typeof window.flJourMontre === 'function') {
          var lv = window.flJourMontre(K);
          if (lv && lv.night && lv.night.bedMin === n.bedMin && lv.night.wakeMin === n.wakeMin) delete lv.night;
        }
      } catch (e2) {}
      flsLog('nuit déduite de jour retirée ' + K + ' : ' + Math.floor(n.bedMin / 60) + 'h'
        + ('0' + (n.bedMin % 60)).slice(-2) + ' — une nuit déduite ne commence pas en plein jour (v2912)');
    } catch (e) { flsLog('purge nuits de jour : ' + e.message); }
  }

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
      /* v1170 — on CLASSE sur la fenêtre réelle, pas sur la fenêtre bourrée.
         Une sieste de 1 h 21 noyée dans une tranche de 4 h ressortait à 3 h 04,
         donc en `secondarySleep` au lieu de `nap` — et affichée à 3 h 04. */
      var reel = flsFenetreReelle(grp);
      /* 1er oct. 2026 — le jour se lit sur le sommeil RÉEL : la nuit du soir
         appartient au lendemain (`flsJourDuGroupe`). */
      if (flsJourDuGroupe(f, reel) !== dayKey) return;
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
    /* ═══ 1er oct. 2026 — EN DERNIER RECOURS, LA NUIT COURTE ═════════════════
       Aucune vraie nuit ce jour-là : le plus long sommeil NOCTURNE d'au moins
       `nuitCourteMini` minutes de sommeil réel devient la nuit. C'est ce que
       WHOOP a fait de l'insomnie du 1er octobre (22:36 → 00:14, récupération
       calculée « comme si la nuit était finie »). Une sieste de jour n'est
       jamais candidate : la condition nocturne est celle de `flsClasser`.
       ET SEULEMENT SUR UN JOUR SANS NUIT MESURÉE. La mémoire de la montre tourne :
       une nuit d'il y a six jours ne garde plus que sa dernière tranche, et ce
       reste, nocturne et court, passerait pour une nuit courte. La nuit d'époque
       est en base (stades, `ble`, ou saisie) : rien à remplacer. Une estimation
       (`_est`) ou une nuit courte précédente, elles, cèdent — c'est le cas du
       1er octobre. Rejoué sur 907 jours : sans cette garde, quatre nuits d'août
       bougeaient de 4 min et le 18 août gagnait un second sommeil principal. */
    var _stockee = !chosen ? flsNuitDe(dayKey) : null;
    var _mesuree = !!(_stockee && !_stockee._est && !_stockee.nuitCourte
                      && ((_stockee.stages && _stockee.stages.length)
                          || _stockee.source === 'ble' || _stockee.source === 'manuel'));
    if (!chosen && !_mesuree) {
      var courte = null;
      autres.forEach(function (o) {
        if (o.type !== TYPE_SECOND || !o.reel) return;
        if (!(o.reel.dormi >= CLASSIF.nuitCourteMini)) return;
        if (flsPartNocturne(o.reel.start * 1000, o.reel.end * 1000) < CLASSIF.partNuitMini) return;
        if (!courte || o.reel.dormi > courte.reel.dormi) courte = o;
      });
      if (courte) {
        var fC = flsFenetre(courte.grp);
        chosen = { grp: courte.grp, start: fC.start, end: fC.end, courte: true };
        autres = autres.filter(function (o) { return o !== courte; });
        flsLog('nuit ' + dayKey + ' : nuit COURTE retenue, ' + courte.reel.dormi
               + ' min de sommeil nocturne et aucune autre nuit ce jour-là');
      }
    }
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
    /* 1er oct. 2026 — ET CE QUE LA MONTRE A VRAIMENT ÉCRIT. Une page 0x6b
       rend deux fois sa durée : les stades, puis l'activité relue en stades
       (des zéros, et quelques valeurs comme 6f ou ff — relevé au parseur de
       J-Style, nuits du 29 et du 30 sept.). `seen` est vrai sur les deux
       moitiés ; `ecrit` ne l'est que sur la première, et `brut` en garde le
       code, quelle que soit la page qui passe ensuite. La fenêtre saisie au
       stylo en a besoin : voir `restageSleep`.
       `hache` : la nuit vient du firmware 0120, dont CHAQUE page s'ouvre sur
       des « 5 » — code que le 0088 n'a jamais écrit (15 jours de pages). Sous
       le 0120, une minute non écrite peut être du sommeil oublié ; sous le
       0088, un trou est un réveil (25 sept. : WHOOP 102 min éveillé dans le
       trou 00:34 → 02:42, pouls 54 contre 49 en sommeil). */
    var brut = new Array(N), ecrit = new Array(N), bourrage = new Array(N);
    for (var ib = 0; ib < N; ib++) { brut[ib] = 0; ecrit[ib] = false; bourrage[ib] = false; }
    var hache = chosen.grp.some(function (c) { return c.stages[0] === 5; });
    /* ═══ 14 oct. 2026 (v2854) — LA MOITIÉ DE BOURRAGE NE SE PEINT PLUS
           SUR LA NUIT ═══════════════════════════════════════════════

       Le commentaire juste au-dessus le dit depuis le 1er octobre : une page
       0x6b rend DEUX FOIS sa durée, les stades puis l'activité relue en stades.
       `ecrit` ne marquait que la première moitié — mais `base` et `seen`
       étaient posés sur LES DEUX. L'activité, qui ne vaut ni 1 ni 2 ni 3,
       tombait donc dans le `else` et se peignait en ÉVEIL, et `seen` interdisait
       au combleur juste en dessous de la voir comme un trou.

       POURQUOI ÇA NE SE VOYAIT PAS : les pages font 240 min et la montre en
       envoie une toutes les deux heures. La moitié réelle de la page suivante
       recouvrait donc exactement le bourrage de la précédente. Le défaut était
       là depuis toujours, entièrement masqué par ce chevauchement.

       CE QUI L'A DÉMASQUÉ, nuit du 13 au 14 octobre 2026 : des pages de 86 min
       espacées de ~100 min, donc SANS chevauchement (six minutes couvertes deux
       fois, contre 302 à 428 les nuits d'avant). Les quatre moitiés de bourrage
       sont restées à nu, et elles tombent EXACTEMENT sur les quatre « trous »
       de la nuit :

           page 02:20 +86   réel 02:20→03:02   bourrage 03:03→03:46
           page 04:15 +86   réel 04:15→04:57   bourrage 04:58→05:41
           page 05:35 +86   réel 05:35→06:17   bourrage 06:18→07:01
           page 07:01 +124  réel 07:01→08:02   bourrage 08:03→09:05

       214 minutes d'« éveil » inventées, et la porte du matin a fermé sur l'une
       d'elles : nuit affichée 02:29→06:19, 1h43 de sommeil, 2h07 d'éveil, ZÉRO
       paradoxal — quand WHOOP mesurait 02:40→08:51 et 5h42. Pendant ces 214
       minutes la montre rendait le pouls EN CONTINU, médiane 46 à 51 bpm.

       ON NE PEINT DONC QUE LA MOITIÉ RÉELLE. Ce n'est pas inventer du sommeil :
       c'est rendre à ces minutes leur statut de TROU, et le combleur ci-dessous
       décide comme il l'a toujours fait — entouré de sommeil c'est du sommeil,
       en bordure de nuit ça reste de l'éveil. `seen` dit désormais « la montre
       a écrit un stade ici », ce que le diagnostic de couverture plus bas
       (`nc.seen`) voulait dire depuis le début. */
    /* ═══ 14 oct. 2026 (v2854) — LA MOITIÉ DE BOURRAGE NE SE PEINT PLUS
           SUR LA NUIT ═══════════════════════════════════════════════

       Le commentaire juste au-dessus le dit depuis le 1er octobre : une page
       0x6b rend DEUX FOIS sa durée, les stades puis l'activité relue en stades.
       `ecrit` ne marquait que la première moitié — mais `base` et `seen`
       étaient posés sur LES DEUX. L'activité, qui ne vaut ni 1 ni 2 ni 3,
       tombait donc dans le `else` et se peignait en ÉVEIL, et `seen` interdisait
       au combleur juste en dessous de la voir comme un trou.

       POURQUOI ÇA NE SE VOYAIT PAS : les pages font 240 min et la montre en
       envoie une toutes les deux heures. La moitié RÉELLE de la page suivante
       recouvrait donc exactement le bourrage de la précédente. Le défaut était
       là depuis toujours, entièrement masqué par ce chevauchement.

       CE QUI L'A DÉMASQUÉ, nuit du 13 au 14 octobre 2026 : des pages de 86 min
       espacées de ~100 min, donc SANS chevauchement (six minutes couvertes deux
       fois, contre 302 à 428 les nuits d'avant). Les quatre moitiés de bourrage
       sont restées à nu, et elles tombent EXACTEMENT sur les quatre « trous »
       de la nuit :

           page 02:20 +86   réel 02:20→03:02   bourrage 03:03→03:46
           page 04:15 +86   réel 04:15→04:57   bourrage 04:58→05:41
           page 05:35 +86   réel 05:35→06:17   bourrage 06:18→07:01
           page 07:01 +124  réel 07:01→08:02   bourrage 08:03→09:05

       214 minutes d'« éveil » inventées, et la porte du matin a fermé sur l'une
       d'elles : nuit affichée 02:29→06:19, 1h43 de sommeil, 2h07 d'éveil, ZÉRO
       paradoxal — quand WHOOP mesurait 02:40→08:51 et 5h42. Pendant ces 214
       minutes la montre rendait le pouls EN CONTINU, médiane 46 à 51 bpm.

       COMMENT ON RECONNAÎT LE BOURRAGE, et c'est une signature, pas un seuil.
       Alphabet des 277 pages encore en base (août à octobre, firmwares 0088 ET
       0120), les deux moitiés comptées séparément :

           1re moitié  {1:4975, 2:12154, 3:4300, 4:530, 6:67, 10:25, 11:8, 15:124}
           2e  moitié  {0:21751, puis 356 valeurs éparses de 1 à 15}

       LA PREMIÈRE MOITIÉ NE PORTE JAMAIS DE ZÉRO — 277 fois sur 277. La seconde
       en est faite à 97 %. On exige donc les deux : aucun zéro devant, une
       majorité de zéros derrière. 271 pages sur 277 le vérifient ; les six
       autres sont très courtes et se peignent en entier, ce qui est le repli
       sûr (c'est le comportement d'avant).

       ET POURQUOI PAS « LA MOITIÉ » TOUT COURT : les jeux d'essai de la maison
       fabriquent des pages SIMPLES — une nuit écrite d'un bloc, ses éveils
       codés 0 EN PLEIN MILIEU. Leur première moitié porte donc des zéros, ils
       tombent du bon côté, et leur nuit n'est pas coupée en deux. Sans cette
       distinction, six bancs deviennent rouges — dont le rendormissement du
       matin et le cas Félix du 24 août. */
    chosen.grp.forEach(function (c) {
      var n0 = c.stages.length, moitie = Math.ceil(n0 / 2);
      var zeroDevant = false, zeroDerriere = 0;
      for (var q = 0; q < n0; q++) {
        if (c.stages[q] !== 0) continue;
        if (q < moitie) zeroDevant = true; else zeroDerriere++;
      }
      var doublee = !zeroDevant && zeroDerriere * 2 > (n0 - moitie);
      var reelles = doublee ? moitie : n0;
      if (doublee) {
        /* ON GARDE LA TRACE DE CE QUE LA MONTRE A ENREGISTRÉ SANS NOUS LE DIRE.
           Le bourrage n'est pas du vide : c'est une minute que la page COUVRE
           et dont elle ne rend pas le stade. Le combleur en a besoin pour
           distinguer « la montre a enregistré ici » de « rien n'est arrivé ». */
        for (var qb = moitie; qb < n0; qb++) {
          var mb = Math.round((c.start + qb * 60 - start) / 60);
          if (mb >= 0 && mb < N) bourrage[mb] = true;
        }
      }
      c.stages.forEach(function (v, idx) {
        if (idx >= reelles) return;
        var mi = Math.round((c.start + idx * 60 - start) / 60);
        if (mi < 0 || mi >= N) return;
        base[mi] = (v === 1 ? 'deep' : v === 2 ? 'light' : v === 3 ? 'rem' : 'awake');
        seen[mi] = true; brut[mi] = v; ecrit[mi] = true;
      });
    });
    /* Comblement : un trou ENTOURÉ de sommeil est du sommeil (on ne se réveille pas
       pour une minute sans raison). Un trou en bordure de nuit reste de l'éveil. */
    /* ═══ 14 oct. 2026 (v2854) — SOUS LE 0120, L'EN-TÊTE D'UNE PAGE N'EST PAS
           UN RÉVEIL ═════════════════════════════════════════════════

       Le combleur exige du sommeil DES DEUX CÔTÉS du trou. Or sous le 0120
       chaque page s'ouvre sur des « 5 » (c'est la définition même de `hache`,
       vingt lignes plus haut), et un 5 tombe dans le `else` : de l'éveil. La
       nuit du 13 au 14 octobre 2026, chacun des quatre trous est précédé de
       vrai sommeil et SUIVI de trois minutes d'en-tête — trois minutes
       refusaient 44 minutes de sommeil, quatre fois.

       POURQUOI C'EST BORNÉ AU 0120, et ce n'est pas une précaution : c'est la
       règle écrite juste au-dessus, avec sa preuve. Sous le 0088 un trou EST un
       réveil — 25 sept., WHOOP compte 102 min d'éveil dans le trou 00:34→02:42,
       pouls 54 contre 49 en sommeil. Vérifié au banc sur les 24 nuits d'août
       (0088) que l'export WHOOP étiquette : enjamber l'en-tête sans distinguer
       le firmware casse SIX des quinze nuits déjà justes, en inventant 70 à
       120 minutes de sommeil. Borné au 0120, aucune n'est touchée — `hache` y
       est faux, la fonction rend le stade tel quel.

       ON N'ENJAMBE QUE CE QUI OUVRE UNE PAGE. Pas « tout éveil court » : un
       réveil de trois minutes existe. Un en-tête, lui, commence à la PREMIÈRE
       minute d'une page, et c'est vérifiable sans seuil. */
    var ouvrePage = new Array(N);
    for (var op = 0; op < N; op++) ouvrePage[op] = false;
    chosen.grp.forEach(function (c) {
      var mi0 = Math.round((c.start - start) / 60);
      if (mi0 >= 0 && mi0 < N) ouvrePage[mi0] = true;
    });
    function voisinUtile(i, pas, toutBourrage) {
      if (base[i] !== 'awake' || !hache || !ouvrePage[i] || !toutBourrage) return base[i];
      for (var k = i; k >= 0 && k < N; k += pas) {
        if (!seen[k]) continue;
        if (base[k] !== 'awake') return base[k];
        if (k !== i && ouvrePage[k]) return 'awake';
      }
      return 'awake';
    }
    var comble = 0;
    for (var g0 = 0; g0 < N; g0++) {
      if (seen[g0]) continue;
      var g1 = g0; while (g1 < N && !seen[g1]) g1++;
      /* LE BOURRAGE EXPLIQUE-T-IL CE TROU ? C'est la garde de la clémence
         ci-dessous, et un banc l'a exigée.

         DEUX TROUS, DEUX RÉPONSES, mesurés :
         · nuit d'insomnie du 1er octobre — trou de 202 min, dont 45 couvertes
           par le bourrage d'une page et 157 JAMAIS transmises. Dino était
           réveillé : par convention WHOOP ce trou appartient à la nuit, en
           ÉVEIL, et le banc `test-nuit-courte-insomnie.js` l'exige.
         · nuit du 13 au 14 octobre — quatre trous de 73, 38, 44 et 59 min.
           Trois sont du bourrage PUR ; le premier mèle 44 min de bourrage et
           29 min non transmises. Le pouls y court en continu à 46-51 bpm.

         LA RÈGLE, SANS SEUIL ABSOLU : le bourrage doit expliquer la MAJEURE
         PARTIE du trou. 157 contre 45, le trou n'est pas le fait de la
         pagination et on le juge sur ses bords nus ; 29 contre 44, il l'est. */
      var nBourrage = 0, nNu = 0;
      for (var qt = g0; qt < g1; qt++) { if (bourrage[qt]) nBourrage++; else nNu++; }
      var toutBourrage = nBourrage > nNu;
      var avant = null; for (var a0 = g0 - 1; a0 >= 0; a0--) if (seen[a0]) { avant = voisinUtile(a0, -1, toutBourrage); break; }
      var apres = null; for (var a1 = g1; a1 < N; a1++) if (seen[a1]) { apres = voisinUtile(a1, +1, toutBourrage); break; }
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
             seen: seen, comble: comble, courte: !!chosen.courte, brut: brut, ecrit: ecrit, hache: hache };
  }

function restageSleep(dayKey) {
    try {
      var s = flsNuitDe(dayKey) || {};
      /* La FC nocturne est LA matière du re-staging : sans elle, on ne fait que
         recopier les stades bruts de la puce. Elle vit dans watch_<K>.hr en
         minute du jour ; le re-staging la veut en horodatage absolu. */
      s.hrTs = flsHrTs(dayKey);
      /* v3002 — LES STADES DU BRACELET NE SE REDÉCOUPENT PAS AU POULS (Dino, 31 oct. : « on prend
         les leurs »). La nuit garde sa courbe de pouls (`hrTs`) pour le graphe ; rien d'autre ne bouge. */
      if (s.stadesSource === 'bracelet' && s.stages && s.stages.length) { flsEcrireNuit(dayKey, s); return; }
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
      /* ═══ 30 oct. 2026 (v2994) — UNE NUIT LUE AU CŒUR GARDE SES BORNES ══════════════════════
         Ses bornes sont décidées en amont (`flNuitDuCoeur` : l'endormissement du bracelet ou du
         téléphone, le réveil du cœur — réglé sur 60 nuits WHOOP). Ce re-staging ne fait que
         redécouper ce qu'il y a DEDANS : ni la tête ni la traîne d'éveil ne se rognent, la porte
         du matin ne coupe pas. Le 29, la tête rognée faisait passer 00:16 (WHOOP 00:16) à 00:22.
         Banc : tests/test-nuit-debut-bracelet.js. */
      var bornesFixes = (s.lecteur === 'coeur');
      if (s.source === 'manuel' && s.manuelStart > 0 && s.manuelEnd > s.manuelStart && base && base.length) {
        var mS = Math.round(s.manuelStart / 1000), mN = Math.round((s.manuelEnd - s.manuelStart) / 60000);
        if (mN >= 60 && mN <= 1000) {
          var nb = new Array(mN), nm = new Array(mN), dec = Math.round((mS - start) / 60);
          /* ═══ 1er oct. 2026 — « LÀ OÙ ELLE EN A » VOULAIT DIRE : LÀ OÙ ELLE A ÉCRIT ═══
             Le code prenait le stade de la montre sur TOUTE sa fenêtre, trous
             et bourrage compris — qui valent « éveillé » dans `base`. Nuit du
             1er oct., firmware 0120 : la montre n'a rien écrit de 03:11 à 04:30,
             de 05:44 à 06:41 ni après 07:19 ; Dino saisit 03:11 → 08:11 et le
             stylo rendait 1 h 14 de sommeil (4 h 08 attendues). Sur une nuit du
             0120 (`nc.hache`), une minute que la montre a ÉCRITE garde son
             stade (un « éveillé » écrit reste éveillé) ; une minute qu'elle n'a
             pas écrite — trou, ou seconde moitié d'une page — est du léger,
             comme le dit le pavé ci-dessus. Sur une nuit du 0088, rien ne
             change : ses trous sont des réveils. Sans tranches non plus. */
          for (var im = 0; im < mN; im++) {
            var srcI = im + dec, okI = srcI >= 0 && srcI < N;
            var ecr = (okI && nc && nc.hache && nc.ecrit) ? nc.ecrit[srcI] : null;
            if (!okI || ecr === false) nb[im] = 'light';
            else if (ecr === null) nb[im] = base[srcI];
            else { var cv = nc.brut[srcI]; nb[im] = cv === 1 ? 'deep' : cv === 2 ? 'light' : cv === 3 ? 'rem' : 'awake'; }
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
      if (!manuel && !bornesFixes && lastSleep >= 0 && lastSleep + 1 < N) {
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
      if (firstSleep > 0 && !bornesFixes) {
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
      /* ═══ 29 sept. 2026 — LA PORTE AMPUTAIT LES RENDORMISSEMENTS, EN SILENCE ═══

         Dino, ce matin-là : couché 01:29, éveillé de 07:00 à ~07:50, rendormi
         jusqu'à 09:09. WHOOP a recollé la nuit ; FLINT a gardé 5h15 et un réveil
         à 07:00. La puce avait TOUT livré, d'un seul enregistrement : éveil
         07:00→08:21, léger 08:21→09:03, et la FC revenue à 44-46 dès 07:50
         (plancher de la nuit : 45). C'est cette porte qui a coupé à 07:00 et
         jeté la suite — et elle a rendu aveugle le filet du rendormissement
         (`flNuitRendormissement`), qui compare le sceau au calcul VIVANT, déjà
         coupé : « la nuit n'a pas bougé ».

         ON NE PEUT PAS TRANCHER SEUL, ET C'EST MESURÉ. Moteur rejoué sur les
         59 nuits de la base de Dino : la porte en coupe 6. WHOOP lui donne
         raison 4 fois (20, 21, 23 et 24 août — couché mais éveillé, la puce
         comptait du sommeil, réveil juste au lieu de deux heures trop tard) et
         tort 2 fois (1er et 29 septembre, vrais rendormissements). Les pas
         séparent trois des quatre ; le 24 août contre le 29 septembre tient à
         UN battement de FC médiane (+4 contre +3 au-dessus du plancher). Une
         falaise, pas un plateau : aucune règle ne se pose là-dessus.

         DONC ON DEMANDE. La porte garde sa décision, mais elle écrit ce
         qu'elle retire quand c'est du sommeil (`rendormiPropose`, au moins
         `dureeMiniRetenue` minutes — en dessous, le classement lui-même n'y
         verrait pas un sommeil) ; `flint-nuit-matin.js` en fait une question
         (« Tu t'es rendormi ? ») ; et un « oui » (`rendormiDit_<K>`) lève la
         porte pour cette nuit-là. Le filet voit alors la nuit changer, rouvre
         la session une fois, et rescelle — le mécanisme que Dino a demandé le
         3 septembre, enfin nourri. Banc : test-rendormi-propose.js.

         ⚠️ LE CHAMP SE RETIRE À CHAQUE PASSAGE. C'est un drapeau posé sur
         l'objet de la base, et un drapeau qu'on ne retire pas survit à la
         décision qui l'a posé — la leçon du `_est` du 12 septembre. */
      delete s.rendormiPropose;
      (function fermerLaPorte() {
        try {
          if (manuel || bornesFixes) return;            /* 7 sept. 2026 — la fin saisie fait foi ; v2994 — et celle lue au cœur */
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
          /* 29 sept. 2026 — l'utilisateur a dit qu'il s'était rendormi : la
             porte ne coupe pas cette nuit-là. La traîne d'éveil, plus haut, a
             déjà fermé la fenêtre à la fin du dernier sommeil. */
          var dit = flsLire('rendormiDit_' + dayKey, null);
          if (dit && dit.rep === 'oui') {
            flsLog('nuit ' + dayKey + ' : porte du matin LEVÉE — rendormissement confirmé par l utilisateur');
            return;
          }
          var gardees = [];
          for (var j = 0; j < newStages.length; j++) {
            var t = newStages[j]; if (t.startMin >= coupe) break;
            gardees.push(t.startMin + t.durMin <= coupe ? t
                       : { stage: t.stage, startMin: t.startMin, durMin: coupe - t.startMin });
          }
          if (!gardees.length) return;
          /* Ce que la coupe retire de SOMMEIL, et d'où à où. `N` vaut encore la
             fin du dernier sommeil (la traîne d'éveil est déjà rognée). */
          var dormiApres = 0, debutApres = null;
          for (var q = 0; q < newStages.length; q++) {
            var u = newStages[q];
            if (u.stage === 'awake' || u.startMin + u.durMin <= coupe) continue;
            dormiApres += u.startMin + u.durMin - Math.max(u.startMin, coupe);
            if (debutApres == null) debutApres = Math.max(u.startMin, coupe);
          }
          if (debutApres != null && dormiApres >= CLASSIF.dureeMiniRetenue) {
            var msDeb = (start + debutApres * 60) * 1000, msFin = (start + N * 60) * 1000;
            s.rendormiPropose = { debut: msDeb, fin: msFin, dormi: dormiApres,
                                  debutMin: flsMinuteDu(dayKey, msDeb), finMin: flsMinuteDu(dayKey, msFin),
                                  coupe: (start + coupe * 60) * 1000 };
          }
          flsLog('nuit ' + dayKey + ' : porte du matin — fermeture a +' + coupe
               + ' min au lieu de +' + N + ' (' + (N - coupe) + ' min retires, dont '
               + dormiApres + ' de sommeil' + (s.rendormiPropose ? ' : rendormissement propose' : '') + ')');
          newStages = gardees; N = coupe;
          /* on recompte comme plus haut : les agrégats viennent des tranches,
             jamais d'une soustraction — une soustraction se désynchronise. */
          agg = { deep: 0, light: 0, rem: 0, awake: 0 };
          for (var g = 0; g < gardees.length; g++) agg[gardees[g].stage] += gardees[g].durMin;
          asleep = agg.deep + agg.light + agg.rem;
        } catch (e) {}
      })();
      var d0 = new Date(start * 1000), dEnd = new Date((start + N * 60) * 1000);
      /* 29 oct. 2026 — UNE NUIT LUE AU POULS N'EST PAS UNE NUIT DU BRACELET. Ce re-staging
         recalcule les stades de TOUTE nuit qui en porte — depuis la v2950, celle de
         `flNuitDuCoeur` aussi — et la tamponnait « ble ». Avec le Fitcare (aucune nuit
         découpée par le bracelet : seule sa fenêtre sert, v2914), la PREMIÈRE lecture au
         pouls devenait une « mesure » que `flNuitRecouper` ne touche plus jamais. Le 29,
         celle de 4 h 08, lue en plein trou de données (l'app tuée par iOS à 4 h 07) :
         « 00:17 → 04:04 » pour une nuit de 00:16 → 07:35. Une lecture reste une lecture. */
      if (manuel) s.source = 'manuel';
      else if (s.lecteur !== 'coeur') s.source = 'ble';
      else if (s.source === 'ble') delete s.source;
      /* 1er oct. 2026 — la nuit courte retenue en dernier recours le DIT, pour
         le dernier verrou de `flsEcrireNuit` (qui refuse ce que `flsClasser`
         ne nomme pas « nuit ») et pour qui la lit. Le drapeau part dès qu'une
         vraie nuit la remplace — un rendormissement recollé, par exemple. */
      if (nc && nc.courte && !manuel) s.nuitCourte = true; else delete s.nuitCourte;
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
      s.bedMin = flsMinuteDuNuit(dayKey, d0.getTime(), dEnd.getTime());
      s.wakeMin = flsMinuteDuNuit(dayKey, dEnd.getTime(), dEnd.getTime());
      /* La nuit du soir porte sa clé : `flPuceNuit` ne reçoit que la montre, et
         c'est par elle qu'il retrouve la matière de la veille. */
      if (s.wakeMin < 0) s.K = dayKey;
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
          /* ═══ 28 sept. 2026 — CE CHAMP SE REECRIVAIT AU RETOUR DE VOYAGE ═══
             `getTimezoneOffset()` rend le decalage du telephone MAINTENANT. Sur
             une nuit REJOUEE — et `moteurVersion` dit qu elles le sont souvent,
             « restage-2026-09-01c » chez Dino — il stampe donc le fuseau du
             jour du rejeu, pas celui de la nuit.
             MESURE SUR SA BASE : du 13 au 24 aout, `night.offsetUTC` annonce
             -120 (UTC+2) quand `watch_<K>.tz.off` annonce 240 (UTC+4) et que
             WHOOP declare UTC+04:00 pour les memes nuits. Douze nuits etiquetees
             du fuseau du RETOUR, parce qu elles ont ete restagees le 1er sept.
             CE QUE CA COUTE : `index.html` rejette de la normale les nuits qui
             « suivaient un changement de fuseau horaire ». Un faux changement
             jette donc de vraies nuits — et il est FAUX DEUX FOIS, a l aller
             comme au retour. Pour un produit qu on vend a des gens qui voyagent,
             c est une normale amputee a chaque deplacement.
             LE REMEDE EXISTAIT DEJA : `flint-fuseau.js` capture le decalage EN
             DIRECT (`src:'courant'`, avec la date de capture) et s interdit de
             reecrire un jour passe — il porte la cicatrice du meme defaut
             (« write-once fige l erreur : 20 jours sur 32 etaient etiquetes
             le:'2026-8-20' »). On lit donc SON chiffre, et on ne retombe sur
             l horloge du lecteur que faute de mieux. Signe oppose : `tz.off`
             vaut +240 pour UTC+4 la ou `getTimezoneOffset()` vaut -240. */
          var _fz = (typeof flFuseauDe === 'function') ? flFuseauDe(dayKey) : null;
          s.offsetUTC = (_fz && typeof _fz.off === 'number' && isFinite(_fz.off))
                      ? -_fz.off
                      : new Date(start * 1000).getTimezoneOffset();
          s.moteurVersion = MOTEUR_VERSION;
        }catch(eI){ flsLog('instrumentation : ' + eI.message); }
      })();
      var _ecrite = flsEcrireNuit(dayKey, s);
      /* La nuit entre aussi au registre : une journée doit pouvoir énumérer
         TOUTES ses périodes de sommeil, la principale comprise.
         1er oct. 2026 — une nuit COURTE que l'écriture a refusée n'est pas la
         nuit : elle entre sous son vrai type, jamais en second sommeil principal
         (la journée logique prend le dernier `mainSleep` qu'elle trouve). */
      flsPoserSommeil(dayKey, { debut: s.sleepStart, fin: s.sleepEnd,
                                type: (s.nuitCourte && _ecrite === false) ? TYPE_SECOND : TYPE_NUIT,
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
      /* 19 oct. 2026 — la date ne se pose plus ici : plus bas, et pour une
         tranche NEUVE seulement (voir après `deja`). */
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
      /* ═══ 19 oct. 2026 — SEULE UNE TRANCHE NEUVE DIT « LA NUIT ARRIVE » ═════
         La montre rend sept jours d'historique derrière la nuit. Une tranche
         déjà connue ne change rien à la nuit ; la dater tenait pourtant la
         collecte et le calme du matin (`livraisonDiffereeEnCours`) éveillés
         pendant que l'historique défilait — la famille des verrous morts de la
         v2045 : un fait d'ARRIVÉE qui n'apporte rien. */
      if (!deja) {
        try { (window._watchLive = window._watchLive || {}).tNuit = Date.now(); } catch (e2) {}
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
        /* 28 oct. 2026 — LE POULS EN DIRECT DU FITCARE FAISAIT TOURNER CE RECALCUL EN BOUCLE.
           L'ancien bracelet livrait `hr` par rafales ; le Fitcare en envoie UN PAR SECONDE dès
           qu'il est relié. 900 ms de frein entre deux battements à 1 s : le minuteur sonnait
           à chaque fois — recalcul du sommeil sur huit jours, puis accueil + sommeil + récup
           repoussés au natif. Journal du 28 : 534 fois de 17:00 à 17:19, une toutes les 1,9 s,
           app ouverte. Or `hr` n'écrit plus la nuit (seul `nightlog` le fait) : pour `hr`, une
           reprise toutes les cinq minutes au plus ; `nightlog` garde la sienne, immédiate. */
        /* 29 oct. 2026 — LA FILE DE LA NUIT. Le pont dit combien de trames attendent encore
           (PontPouls, à chaque paquet repris du disque). Tant qu'il en reste, le cycle garde la
           nuit en collecte (flint-recup-cycle.js : jamais de demi-nuit) ; à zéro, la nuit est
           recalculée TOUT DE SUITE — sans attendre la reprise de cinq minutes du pouls. */
        if (t === 'fileTrames') {
          var nF = +((e.detail.data || {}).enAttente) || 0, avantF = +window.flTramesEnAttente || 0;
          window.flTramesEnAttente = nF;
          window.flTramesEnAttenteA = Date.now();
          if (nF === 0 && avantF > 0) {
            clearTimeout(window._flsRepriseT);
            window._flsRepriseT = setTimeout(function () {
              window.flintSommeilRecalculer();
              try { if (typeof window.flNuitRecouper === 'function') window.flNuitRecouper(); } catch (e2) {}
            }, 1500);
          }
          return;
        }
        if (t === 'hr') {
          var mtn = Date.now(), ecoule = window._flsRepriseHrA ? mtn - window._flsRepriseHrA : 1e12;
          if (ecoule < 300000) {
            /* 28 oct. (relecture) — une reprise de TRAÎNE, une seule : le dernier battement
               d'une fenêtre n'est plus perdu jusqu'au battement suivant (qui peut ne jamais venir). */
            if (!window._flsRepriseHrTraine) window._flsRepriseHrTraine = setTimeout(function () {
              window._flsRepriseHrTraine = null;
              window._flsRepriseHrA = Date.now();
              window.flintSommeilRecalculer();
            }, 300000 - ecoule);
            return;
          }
          window._flsRepriseHrA = mtn;
        }
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
    return { reveilCoupeNuit: CLASSIF.reveilCoupeNuit, reveilSieste: CLASSIF.reveilSieste,
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
      /* 1er oct. 2026 — UN RÉVEIL APRÈS 20 H EST CELUI DE LA VEILLE AU SOIR.
         La nuit du soir (22:32 → 23:49, rangée au lendemain) revient de
         « Corriger ma nuit » en heures du cadran : lues sur K, elles tombaient
         le soir de K — dans le futur. Aucune nuit de K ne finit le soir de K. */
      if (reveilMin >= 20 * 60) { deb -= 86400000; fin -= 86400000; }
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
        n.bedMin = flsMinuteDuNuit(K, dd.getTime(), df.getTime());
        n.wakeMin = flsMinuteDuNuit(K, df.getTime(), df.getTime());
        if (n.wakeMin < 0) n.K = K;
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
            /* 1er oct. 2026 — ET LA RÉCUPÉRATION SUIT. Une nuit finalisée ne
               se rejuge plus (`flNuitVerrouillee`) : le stylo changeait la nuit
               et laissait le score calculé sur l'ancienne (Dino, 1er oct. :
               4 h 08 saisies, récup restée à 11). Le stylo est un geste de la
               personne, comme « Tu t'es rendormi ? » : même porte. */
            if (rs && rs.ok && typeof window.flNuitVerrouillee === 'function' && window.flNuitVerrouillee(K)
                && typeof window.flRecupPublier === 'function') {
              var rp = window.flRecupPublier(K, 'manuel', true);
              flsLog('saisie manuelle ' + K + ' : récupération '
                + (rp && rp.publie ? (rp.s + ' — ' + rp.raison) : ('inchangée — ' + (rp && rp.raison))));
            }
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
      Object.keys(jours).forEach(function (K) { flsPurgerNuitsDeJour(K); });   /* 29 oct. 2026 */
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

  /* ═══ 18 oct. 2026 — LA NUIT LUE PAR FLINT, SANS LE SOMMEIL DU FABRICANT ═══

     Dino, 17 oct. : « notre manière d'interpréter les choses doit être ultra
     prête, que ce soit avec cette montre-là ou avec une autre ». La nuit
     ESTIMÉE (celle qu'on écrit quand la montre ne rend pas de sommeil) venait
     de `computeNight` : la plus longue plage de pouls sous « 5e centile + 12 ».
     Rejouée contre l'export WHOOP sur 31 nuits (17 sept. → 17 oct.) :
     endormissement à 39 min (médiane), réveil à 50, durée à 100, et 18 nuits
     sur 31 à plus d'une heure d'une borne. Avec une montre sans sommeil, ce
     maillon-là aurait été tout FLINT.

     CE DÉTECTEUR-CI lit ce que TOUTE montre du contrat rend : le pouls à la
     minute (`watch_<jour>.hr`) et les pas à la minute (`actDet`). Rien du
     fabricant. Cinq temps :
       1 · lissage : médiane centrée de 15 min (trois mesures au moins) ;
       2 · le PLANCHER de la nuit : la plus basse médiane de 3 h mesurée à
           moitié au moins — il suit la personne, malade comprise ;
       3 · le CŒUR de la nuit : la plus longue plage calme (pouls ≤ plancher
           + 6, aucun pas), trous de mesure ≤ 30 min et éveils ≤ 20 min
           tolérés, plages à moins d'une heure fusionnées ;
       4 · le LEVER : après six heures, le premier vrai pas (20 en 5 min) —
           sauf si l'heure qui suit la salve redevient calme et basse (≤ 4 au-
           dessus du plancher, 45 min sans pas) : c'était les toilettes ; ou,
           après le cœur, une montée qui dure 30 min ou que des pas suivent ;
       5 · les éveils internes : pouls ≥ plancher + 6, ou un pas.
     SANS POULS, PAS DE NUIT : moins de la moitié des minutes mesurées, ou
     moins de 70 % des heures à vingt mesures, et on rend `null` (la nuit du
     16 oct. : 76 mesures en dix heures — `computeNight` y voyait 22:05 →
     03:13).

     MESURÉ (outil `calib/detecteur.py`, session c3e88e1d) : sur 30 nuits,
     endormissement 13 min (médiane), réveil 8, durée 31 ; réglé sur une
     moitié des nuits et jugé sur l'autre : 10-15 / 9-11 / 25-29. Le raté
     connu : une nuit de fièvre (17 oct.) où deux salves de pas à 06:00 et
     06:15 précèdent trois heures de retour au lit. Les réglages sont ceux de
     la recherche, pas des chiffres ronds choisis à la main. */
  var NUIT_COEUR = { calme: 6, montee: 8, eveil: 6, pasLever: 20, trou: 30, bref: 20, fusion: 60,
                     couverture: 0.5, nuitMin: 360, monteeMin: 30, retour: 4, retourMin: 45, salve: 30,
                     reveilBracelet: 90, nuitClose: 20, finEveil: 10, finSommeil: 15, telReveil: 10,
                     salve: 12, salveEcart: 5, salveFen: 45,
                     /* 28 oct. 2026 — réglés sur 60 nuits WHOOP (voir « LE RÉVEIL, RÉGLÉ… » et « L'ENDORMISSEMENT… ») */
                     rendormi: 60, rendormiFen: 180, rendormiLoin: 360, netReveil: 15, netAvance: 5, decalReveil: -4,
                     picCoucher: 10, picFen: 20, picCap: 180, stadeProfond: 0.20, stadeParadoxal: 0.80,
                     /* 30 oct. 2026 (v2994) — l'endormissement du bracelet, le téléphone déverrouillé, l'attente
                        du fichier de nuit : voir « L'ENDORMISSEMENT DU BRACELET, LE RÉVEIL DU CŒUR » */
                     bandeMin: 30, telFen: 20, telColle: 10, verrouMax: 60, attenteBracelet: 30, finBracelet: 45 };
  window.flNuitCoeurReglages = NUIT_COEUR;

  /* ═══ 27 oct. 2026 — LES PETITS RÉVEILS DU FITCARE : DES SALVES, PAS DES PLATEAUX ══

     Nuit du 27 : WHOOP compte 34 min d'éveil entre 01:28 et 05:56, FLINT zéro.
     Le pouls minute du bracelet les montre pourtant — des POINTES d'une ou
     deux minutes : 02:01-02 (62, 68), 02:52-57 (jusqu'à 72), 03:01-10 (68, 72),
     04:45-48 (75), 05:01-10 (67, 72), sur une nuit à 52. La règle de
     `classer` (médiane ±7 min ≥ plancher + 6) les efface : elle voit les longs
     éveils, pas les réveils brefs.

     MESURÉ contre WHOOP (outil scratchpad `eveils/`, 21 nuits) :
       · sur l'ANCIEN bracelet, la règle actuelle tient (|écart| 18 min, biais
         −10) et les salves l'ABÎMENT (biais +14) : son pouls minute est
         bruité, ses pointes ne sont pas des réveils ;
       · sur le FITCARE, pouls minute lisse (le bracelet moyenne lui-même), les
         pointes sont des réveils. Règle actuelle + salves (pointe ≥ base locale
         — 20e centile sur ±45 min — + 12 bpm, pointes à ≤ 5 min regroupées) :
         27 oct. 30 min pour 34 ; 25 oct. 122 pour 122 (actuelle : 0 et 112).
     DEUX nuits seulement : c'est un réglage PROVISOIRE, réservé au Fitcare
     (flInstrumentVfc), à recaler sur une semaine de nuits et un export WHOOP
     frais. Banc : test-nuit-salves.js. */
  window.flSalvesEveil = function (H, a, b, p) {
    var out = new Array(H.length), pts = [], i, j;
    for (i = Math.max(0, a); i < Math.min(H.length, b); i++) {
      if (H[i] == null) continue;
      var w = [];
      for (j = Math.max(0, i - p.salveFen); j <= Math.min(H.length - 1, i + p.salveFen); j++) if (H[j] != null) w.push(H[j]);
      if (w.length < 10) continue;
      w.sort(function (x, y) { return x - y; });
      if (H[i] >= w[Math.floor(w.length / 5)] + p.salve) pts.push(i);
    }
    if (!pts.length) return out;
    var d = pts[0], f = pts[0];
    for (j = 1; j <= pts.length; j++) {
      var x = pts[j];
      if (x != null && x - f <= p.salveEcart + 1) { f = x; continue; }
      for (i = d; i <= f; i++) out[i] = true;
      if (x != null) { d = f = x; }
    }
    return out;
  };

  /* ═══ v2913 — UN CŒUR NE TIENT PAS UNE CONSTANTE : LA SENTINELLE ═════════

     Dino, le 27 octobre à 6 h, et il a raison de bout en bout : « il y a la
     LED verte sur ma peau, elle lit des battements. Un corps humain varie un
     minimum de battements cardiaques. Ça n'existe pas, une courbe plate. »

     C'est un critère, pas une impression. Sa nuit du 27 portait 545 points
     TOUS à 47-48 bpm entre 02 h 52 et 05 h 09, espacés de 15,001 s — la
     signature de la règle de débit du canal `hr`, donc une valeur arbitrée qui
     n'avait pas bougé en 136 minutes, pendant que la radio portait 31 valeurs
     distinctes de 47 à 86. Rien dans l'application ne l'a signalé. Personne
     n'a crié. C'est ce silence-là qu'on ferme ici.

     CE QUE CETTE FONCTION FAIT, ET CE QU'ELLE NE FAIT PAS. Elle trouve le plus
     long palier de valeurs IDENTIQUES CONSÉCUTIVES et le rend. Elle ne corrige
     rien, ne lisse rien, n'invente rien : elle mesure et elle nomme. C'est à
     l'appelant d'en tirer une conclusion — et de la dire assez fort.

     PURE À DESSEIN : des points en entrée, un objet en sortie, aucune horloge,
     aucun stockage. `test-plateau-du-pouls.js` l'éprouve, et la vraie nuit du
     27 y figure comme cas.

     Un palier de quelques minutes arrive pour de vrai — sommeil profond,
     immobilité, résolution du capteur. SEUIL est à DIX MINUTES parce qu'en
     dessous on crierait sur de la physiologie, et qu'au-dessus on couvrait
     136 minutes de constante sans un mot. */
  var PLATEAU_SEUIL_MIN = 10;
  window.flPlateauSeuilMin = PLATEAU_SEUIL_MIN;
  window.flPlateauDuPouls = function (points) {
    /* `points` : [[minuteDuJour, bpm], ...], pas forcément triés. */
    if (!points || !points.length) return { plat: false, minutes: 0, valeur: null, debut: null, fin: null, points: 0 };
    /* `filter` rend déjà un tableau NEUF : le `.slice()` qui était ici ne
       servait à rien, et le banc l'a prouvé en restant vert quand on l'ôtait.
       Le contrôle « elle ne modifie pas le tableau qu'on lui donne » reste,
       lui : il défend la propriété, pas la ligne. */
    var a = points.filter(function (p) { return p && p.length >= 2 && p[1] > 0; })
                  .sort(function (x, y) { return x[0] - y[0]; });
    if (!a.length) return { plat: false, minutes: 0, valeur: null, debut: null, fin: null, points: 0 };
    var meilleur = { minutes: 0, valeur: a[0][1], debut: a[0][0], fin: a[0][0], points: 1 };
    var i = 0;
    while (i < a.length) {
      var j = i;
      while (j + 1 < a.length && a[j + 1][1] === a[i][1]) j++;
      /* L'ÉTENDUE EN MINUTES, PAS LE NOMBRE DE POINTS. Une série dense donnerait
         un compte flatteur sur trente secondes ; c'est la durée tenue qui dit
         si un cœur a cessé de varier. */
      var etendue = a[j][0] - a[i][0];
      if (etendue > meilleur.minutes) {
        meilleur = { minutes: etendue, valeur: a[i][1], debut: a[i][0], fin: a[j][0], points: j - i + 1 };
      }
      i = j + 1;
    }
    meilleur.plat = meilleur.minutes >= PLATEAU_SEUIL_MIN;
    return meilleur;
  };

  /* Le dire, et le dire FORT. Rendue séparément pour que l'appelant choisisse
     son journal, et pour que le banc puisse lire la phrase. */
  window.flPlateauPhrase = function (K, p) {
    if (!p || !p.plat) return null;
    var h = function (m) { return ((m / 60) | 0) + 'h' + ('0' + (m % 60)).slice(-2); };
    return 'ALERTE nuit ' + K + ' : le pouls est RESTÉ à ' + p.valeur + ' bpm pendant '
      + p.minutes + ' min (' + h(p.debut) + '→' + h(p.fin) + ', ' + p.points + ' points). '
      + 'Un cœur ne tient pas une constante : ce n\'est pas une mesure, c\'est une valeur TENUE. '
      + 'Chercher qui écrit cette série avant de lire quoi que ce soit dedans.';
  };

  /* ═══ v2913 — LA COURBE DE NUIT SE POSE DEPUIS LE BRUT ═══════════════════

     Dino, le 27 octobre à 6 h : « je veux juste une courbe de mes nuits. Qui
     varie réellement en fonction du nombre de battements bruts que j'ai pendant
     ma nuit. Il y a la LED verte sur ma peau, elle lit des battements. Ça
     n'existe pas, une courbe plate. »

     Elle ne variait pas, et voici pourquoi, mesuré sur sa nuit : le journal
     natif portait 545 points TOUS à 47-48 bpm entre 02 h 52 et 05 h 09,
     espacés de 15,001 s. Quinze secondes, c'est la règle de débit du canal
     `hr` (« publier sur changement, ou après 15 s de silence ») : la valeur
     ARBITRÉE n'avait pas bougé une seule fois en 136 minutes. Le journal radio
     de la même fenêtre portait 31 valeurs distinctes, de 47 à 86.

     `hrBrut` (voir `CanalCapteur.hrBrut`) est la série du bracelet sans
     arbitre et sans règle de débit : une trame = un point. C'est elle qui
     dessine, et cette fonction la pose.

     DEUX CHOIX, ET LEURS RAISONS.

     ① LA MÉDIANE DE LA MINUTE. Une médiane de vraies mesures varie ; une
        valeur arbitrée tenue ne varie pas. Et replier borne le stockage : 360
        points pour six heures au lieu d'un par seconde, ce qui compte sur une
        base déjà à 79 % du quota de WebKit.

     ② POUSSÉE EN DERNIER. `wSaveK` appelle `wDedoublonner`, qui ne garde
        qu'une valeur par minute — LA DERNIÈRE. C'est de cette garantie qu'on
        dépend pour que le brut gagne sa minute contre la valeur arbitrée qui
        s'y trouvait, et `test-courbe-nuit-brute.js` l'épingle explicitement :
        si elle passait à « la première », la courbe redeviendrait plate sans
        qu'une ligne d'ici ne change.

     ELLE VIT ICI, PAS DANS index.html. Le fichier d'interface porte un cliquet
     à 37 500 lignes et la première version de ce code l'a fait passer à
     37 526 : le build a refusé, en disant exactement ce qu'il fallait faire —
     « le code neuf a un metier : il va dans un fichier flint-<metier>.js ».
     La courbe de nuit est le métier du moteur de sommeil. */
  window.flCourbeBrutePoser = function (K, pts) {
    if (!K || !pts || !pts.length) return 0;
    if (typeof window.wGet !== 'function' || typeof window.wSaveK !== 'function') return 0;
    var parMin = {}, i, x;
    for (i = 0; i < pts.length; i++) {
      x = pts[i];
      if (!x || x.length < 2 || !(x[1] > 0)) continue;
      (parMin[x[0]] = parMin[x[0]] || []).push(x[1]);
    }
    var rec = window.wGet(K), n = 0;
    Object.keys(parMin).forEach(function (m) {
      var a = parMin[m].sort(function (u, w) { return u - w; });
      rec.hr.push([+m, a[(a.length - 1) >> 1]]);   /* la médiane, en DERNIER */
      n++;
    });
    if (!n) return 0;
    rec.hr.sort(function (a, b) { return a[0] - b[0]; });   /* tri stable : à minute égale, la médiane reste derrière */
    window.wSaveK(K);
    /* LA SENTINELLE. Si la série BRUTE elle-même porte un palier de dix minutes
       ou plus, ce n'est plus l'arbitre qu'il faut soupçonner mais la radio ou
       le capteur — et ça doit se LIRE. C'est le silence qui a coûté la nuit du
       27, pas le palier. */
    try {
      var ph = window.flPlateauPhrase && window.flPlateauPhrase(K, window.flPlateauDuPouls(rec.hr));
      if (ph) {
        flsLog(ph);
        try { window.webkit.messageHandlers.flint.postMessage({ cmd: 'journal', texte: ph }); } catch (e) {}
      }
    } catch (e) {}
    return n;
  };

  /* La règle de la fin de nuit, PURE — `etats` est la suite des minutes de la
     nuit ('awake' ou autre), `p` les réglages. Rend { debut, eveil, apres }
     (debut = index dans `etats` où la nuit doit finir) ou null. Pure pour que
     ses bornes s'éprouvent sur des suites écrites à la main : sur une seule
     vraie nuit, certaines ne peuvent pas se séparer. */
  /* ═══ 29 oct. 2026 — UNE NUIT N'EST FIGÉE QU'APRÈS AVOIR VU DE QUOI SE RENDORMIR ═══

     LE MATIN DU 29. Dino : alarme à 3 h, rendormi à 3 h 15, levé à 7 h 45 (WHOOP, Polar,
     l'app du fabricant d'accord ; le bracelet lui-même : 00:18 → 07:29). FLINT : 3 h 15,
     00:17 → 04:04. À 4 h 07 iOS tue l'app (une file de 26 442 trames à rattraper) ; à
     4 h 08 elle renaît et lit la nuit SANS AUCUNE minute après 04:02 — un pic à 77 bpm,
     six minutes de vide : « réveil 04:04 ». Puis `flNuitRecouper` ne la refait plus
     jamais : « nuit estimée, réveil passé → rien à recouper ». Les 220 minutes de
     sommeil arrivées ensuite (file vidée à 7 h 51) n'ont jamais été regardées.

     LA RÈGLE. Le réveil n'est final que si le moteur a pu voir l'horizon où un
     rendormissement le déplacerait — `rendormiFen` (3 h) après lui, la fenêtre même de
     la règle « s'il s'est rendormi, ce n'était pas le lever » (v2952). La nuit porte
     donc `donneesJusqua` (dernière minute de pouls lue) ; tant qu'il manque une partie
     de cet horizon ET que des minutes plus récentes existent (≥ 15 min de neuf), on la
     recoupe. Une fois l'horizon vu, plus rien ne la touche. Une nuit écrite avant
     cette règle (sans `donneesJusqua`) se recoupe une fois si des minutes existent à
     plus d'une heure après son réveil — aujourd'hui et hier seulement.
     Banc : tests/test-nuit-attend-ses-donnees.js. */
  /* v3001 — les minutes de pouls du jour K, de 1 h avant l'endormissement à `rendormiFen` après le
     réveil (bornées par `lim`) : la même mesure à la lecture de la nuit et quand on la guette. */
  window.flNuitMinutesLues = function (K, debutMs, finMs, lim) {
    try {
      var w = flsLire('watch_' + K, null) || {}, hr = Array.isArray(w.hr) ? w.hr : [];
      var q = String(K).split('-'), minuit = new Date(+q[0], +q[1] - 1, +q[2]).getTime();
      var a = Math.max(minuit, debutMs - 3600000), b = finMs + ((NUIT_COEUR && NUIT_COEUR.rendormiFen) || 180) * 60000;
      if (lim != null && lim < b) b = lim;
      var c = 0;
      for (var i = 0; i < hr.length; i++) { var x = hr[i]; if (!x || x[0] == null || !(+x[1] > 0)) continue; var ms = minuit + x[0] * 60000; if (ms >= a && ms <= b) c++; }
      return c;
    } catch (e) { return null; }
  };
  window.flNuitAttendDesDonnees = function (K, n, lim) {
    try {
      var w = flsLire('watch_' + K, null) || {};
      var coeur = !!(n && n.lecteur === 'coeur' && n.source !== 'manuel' && (n.source !== 'ble' || /fitcare/.test(String(w.marque || ''))));
      if (!n || n.wakeMin == null || n.source === 'manuel') return false;
      if (!n._est && !coeur) return false;   // une nuit lue au pouls reste une lecture, stades compris
      /* v2994 — CE QUE LA NUIT A LU A CHANGÉ : le fichier de nuit du bracelet est arrivé (le 30, à
         08:07, onze minutes après le réveil), le téléphone a dit ses déverrouillages, des minutes sont
         passées en quarantaine (`sansBattements`, retrait). La nuit porte `entrees`, la signature de
         ces trois matières au moment de sa lecture ; si elle ne correspond plus, on la relit — une
         fois : relue, elle porte la nouvelle. Une nuit d'avant la v2994 (sans `entrees`) ne se relit
         ainsi qu'aujourd'hui et hier, et seulement si l'une des trois matières existe. */
      /* v2995 (revue) — une relecture REFUSÉE (couverture trop basse, période classée sieste…)
         laissait l'ancienne signature : la nuit était relue à CHAQUE passe. La signature tentée est
         gardée (`_flsRelueTentee`) : tant qu'elle n'a pas changé, on ne retente pas. */
      try {
        if (n.lecteur === 'coeur' && typeof window.flNuitEntrees === 'function') {
          var ent = window.flNuitEntrees(K, n.sleepEnd);
          var tente = (window._flsRelueTentee = window._flsRelueTentee || {});
          var relire = false;
          if (n.entrees != null) relire = (n.entrees !== ent);
          else if (ent !== 'b-|t0|m0') {
            var a0j = new Date(), h0j = new Date(a0j.getTime() - 86400000);
            var cj = function (d) { return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); };
            relire = (K === cj(a0j) || K === cj(h0j));
          }
          if (relire && tente[K] !== ent) { tente[K] = ent; return true; }
        }
      } catch (eE) {}
      /* ═══ 31 oct. 2026 (v3001) — UN TROU COMBLÉ FAIT RELIRE LA NUIT ═══════════════════════════
         LE MATIN DU 31. L'iPhone de Dino s'éteint à 08:25:56, batterie vide (LowBatteryLog). Le
         bracelet, lui, garde toute la nuit (772 minutes, 20:59 → 09:50). À 09:50 le téléphone
         revient : la nuit est lue avec un trou de 08:26 à 09:50 suivi de minutes éveillées →
         « réveil 08:26 », le début du trou. À 09:52:22 la mémoire du bracelet comble le trou
         (pouls 48-56 jusqu'à 09:40, le bracelet dit 01:22 → 09:43) — mais la règle ci-dessous ne
         guettait que des minutes PLUS RÉCENTES que `donneesJusqua` (09:52) : un trou comblé est
         plus ancien. La nuit est scellée à 09:53:56 sur 08:26, et la nuit du bracelet, qui ne
         collait plus à ce faux réveil, rangée en sieste.
         DÉSORMAIS la nuit porte `minutesLues` (ses minutes de pouls, de 1 h avant l'endormissement
         à `rendormiFen` après le réveil) ; s'il y en a 10 de plus, on la relit — une fois par
         compte (`_flsTrouTente`). Et `reveilBordTrou` (aucune minute dans les 15 qui suivent le
         réveil, alors que des minutes reviennent après) : tant qu'il tient, le matin attend la
         mémoire du bracelet (`flNuitAttendBracelet`). Banc : tests/test-nuit-trou-comble.js. */
      try {
        if (n.lecteur === 'coeur' && n.minutesLues != null && +n.sleepStart > 0 && +n.sleepEnd > +n.sleepStart) {
          var cnt = window.flNuitMinutesLues(K, +n.sleepStart, +n.sleepEnd, lim);
          var tt = (window._flsTrouTente = window._flsTrouTente || {});
          if (cnt >= +n.minutesLues + 10 && tt[K] !== cnt) { tt[K] = cnt; return true; }
        }
      } catch (eT) {}
      var q = String(K).split('-'), minuit = new Date(+q[0], +q[1] - 1, +q[2]).getTime();
      if (isNaN(minuit)) return false;
      var reveil = (n.sleepEnd != null) ? +n.sleepEnd : minuit + n.wakeMin * 60000;
      var horizon = reveil + ((NUIT_COEUR && NUIT_COEUR.rendormiFen) || 180) * 60000;
      var vu = (n.donneesJusqua != null) ? +n.donneesJusqua : null;
      if (vu != null && vu >= horizon) return false;
      var hr = Array.isArray(w.hr) ? w.hr : [], dernier = null;
      for (var i = 0; i < hr.length; i++) {
        var x = hr[i]; if (!x || x[0] == null || !(+x[1] > 0)) continue;
        var ms = minuit + x[0] * 60000;
        if (lim != null && ms > lim) continue;
        if (dernier == null || ms > dernier) dernier = ms;
      }
      if (dernier == null) return false;
      if (vu == null) {
        var auj = new Date(), hier = new Date(auj.getTime() - 86400000);
        var cle = function (d) { return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); };
        if (K !== cle(auj) && K !== cle(hier)) return false;
        return dernier >= reveil + 60 * 60000;
      }
      return dernier >= vu + 15 * 60000;
    } catch (e) { return false; }
  };

  /* 3 nov. 2026 — `tel` (facultatif) : les périodes où le téléphone était déverrouillé, en index de
     `etats`. Nuit du 1er nov. : réveillé à 07:58 (WHOOP 07:54), Dino déverrouille son téléphone onze
     fois de 07:59 à 09:12 ; entre deux coups d'œil, le pouls calme dessine 18 min de « sommeil » en
     miettes (3, 3, 3, 1, 8 min). 18 > 15 : l'éveil de 07:58 passait pour un éveil DANS la nuit, et la
     nuit finissait à 09:21 — 1 h 27 trop tard. Une minute de sommeil à moins de `telReveil` minutes
     d'un déverrouillage ne prouve pas qu'on s'est rendormi : elle ne compte pas. Un vrai
     rendormissement après un coup d'œil (une heure de sommeil) compte toujours. */
  window.flFinAuReveil = function (etats, p, tel) {
    var n = etats.length, k = 0, marge = (p && p.telReveil != null) ? p.telReveil : 10;
    var presTel = function (z) {
      if (!tel || !tel.length) return false;
      for (var t = 0; t < tel.length; t++) if (z >= tel[t][0] - marge && z < tel[t][1] + marge) return true;
      return false;
    };
    while (k < n) {
      if (etats[k] !== 'awake') { k++; continue; }
      var d = k; while (k < n && etats[k] === 'awake') k++;
      if (k - d < p.finEveil) continue;
      var apres = 0;
      for (var z = k; z < n; z++) if (etats[z] !== 'awake' && !presTel(z)) apres++;
      if (apres <= p.finSommeil && d > 60) return { debut: d, eveil: k - d, apres: apres };
    }
    return null;
  };

  /* ═══ 30 oct. 2026 (v2994) — LE TÉLÉPHONE DÉVERROUILLÉ, C'EST ÉVEILLÉ ═══════════════════════

     Quand le bracelet n'a pas (encore) rendu sa nuit, le cœur seul s'endort trop tôt : couché,
     immobile, sur son téléphone, le pouls est celui du sommeil (le 30 : 23:52 au lieu de 00:51).
     L'iPhone, lui, sait quand on s'en sert. Le natif (`VerrouTelephone`, PontSommeil.swift) note
     chaque déverrouillage et chaque verrouillage (`protectedDataDidBecomeAvailable` /
     `WillBecomeUnavailable`, plus un sondage à chaque paquet de trames la nuit) et les envoie ici,
     canal `verrou` : [[instant (s), 1 = déverrouillé | 0 = verrouillé], …]. Ils sont rangés par
     jour local dans `watch_<jour>.verrou` (`flVerrouRecevoir`) — à partir de maintenant : il n'y a
     pas d'historique.

     UNE PÉRIODE = un déverrouillage et l'événement qui suit (son verrouillage — ou le déverrouillage
     suivant : un verrouillage a forcément eu lieu entre). v2996 (seconde revue) : si cet événement
     n'arrive pas dans les `verrouMax` (60 min), la période est IGNORÉE — on ne sait pas quand elle a
     fini. La v2995 la plafonnait à 60 min, et c'était pire : un verrouillage perdu à 23:55 (app
     relancée à 01:35, ou lien perdu toute la nuit) poussait l'endormissement du 29 à 01:02 au lieu
     de 00:16. Une vraie vidéo d'une heure au lit (23:30 → 00:30) compte toujours. Un téléphone sans
     code n'émet rien : aucune période. */
  function flsVerrouEvenements(cles) {
    var ev = [];
    cles.forEach(function (Kc) {
      var w = flsLire('watch_' + Kc, null) || {};
      (Array.isArray(w.verrou) ? w.verrou : []).forEach(function (x) {
        if (x && x.length >= 2 && +x[0] > 0) ev.push([+x[0], +x[1] ? 1 : 0]);
      });
    });
    ev.sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; });
    return ev;
  }
  window.flVerrouPeriodes = function (ev, maxMin) {
    var out = [], cap = (maxMin || 60) * 60;
    ev = ev || [];
    for (var i = 0; i < ev.length; i++) {
      if (ev[i][1] !== 1) continue;   /* chaque déverrouillage ouvre une période */
      var u = ev[i][0];
      /* 4 nov. 2026 — LE TÉLÉPHONE EN MAIN, MAINTENANT. Dino déverrouille à 07:39 et ne le lâche
         plus : aucun verrouillage ne suit, la période « sans fin connue » était ignorée, et à 07:52
         FLINT le croyait rendormi. Le DERNIER déverrouillage, quand la page est affichée en ce
         moment même (l'app est au premier plan, donc le téléphone ouvert), court jusqu'à
         MAINTENANT — trois heures au plus. Une fin perdue d'autrefois (v2996) n'est pas touchée :
         seul le dernier événement, et seulement si l'écran est allumé sur FLINT. */
      if (i + 1 >= ev.length) {
        var vis = false;
        try { vis = typeof document !== 'undefined' && document.visibilityState === 'visible'; } catch (eV) {}
        var mt = Date.now() / 1000;
        if (vis && mt > u && mt - u <= 3 * 3600) out.push([u, Math.round(mt)]);
        continue;
      }
      if (ev[i + 1][0] - u > cap) continue;   /* v2996 — fin inconnue dans l'heure : ignorée, pas plafonnée */
      var f = ev[i + 1][0];
      if (f > u) out.push([u, f]);
    }
    return out;
  };
  /* La signature de ce qu'une nuit lit en plus du pouls : le fichier de nuit du bracelet (son
     début, ouvert ou clos), les événements du téléphone, les minutes en quarantaine. */
  /* v2995 (revue) — BORNÉE AU RÉVEIL : un déverrouillage APRÈS la fin de la nuit ne change rien à
     la nuit, et la signature changeait à chaque coup d'œil du matin (la nuit réécrite à chaque fois,
     jusqu'à 14 h). `finMs` : la fin de la nuit lue (sinon celle rangée, sinon 14 h). */
  window.flNuitEntrees = function (K, finMs) {
    try {
      var q = String(K).split('-'), minuit = new Date(+q[0], +q[1] - 1, +q[2]).getTime();
      var Kv = flsCle(new Date(minuit - 12 * 3600000));
      var wK = flsLire('watch_' + K, null) || {}, wV = flsLire('watch_' + Kv, null) || {};
      var nf = wK.nuitFitcare;
      var b = (nf && +nf.debut > 0) ? (Math.round(+nf.debut / 60) + (nf.valide ? 'v' : 'o')) : '-';
      var fin = (+finMs > 0) ? +finMs : ((wK.night && +wK.night.sleepEnd > 0) ? +wK.night.sleepEnd : minuit + 14 * 3600000);
      var ev = flsVerrouEvenements([Kv, K]).filter(function (x) { return x[0] * 1000 >= minuit - 12 * 3600000 && x[0] * 1000 < fin; });
      var m = 0;
      (Array.isArray(wV.hrMasque) ? wV.hrMasque : []).forEach(function (x) { if (x && x[0] >= 720) m++; });
      (Array.isArray(wK.hrMasque) ? wK.hrMasque : []).forEach(function (x) { if (x) m++; });
      return 'b' + b + '|t' + ev.length + (ev.length ? ':' + ev[ev.length - 1][0] : '') + '|m' + m;
    } catch (e) { return ''; }
  };

  /* v2995 (revue) — un fichier de nuit du bracelet appartient à une nuit lue au cœur s'il la
     CHEVAUCHE et finit à moins de `finBracelet` (45 min) de son réveil. */
  window.flNuitFitcareCollee = function (nf, debutMs, finMs) {
    if (!nf || !(+nf.debut > 0) || !(+nf.fin > +nf.debut) || !(finMs > debutMs)) return false;
    var a = +nf.debut * 1000, b = +nf.fin * 1000;
    return a < finMs && b > debutMs && Math.abs(b - finMs) <= ((NUIT_COEUR.finBracelet || 45) * 60000);
  };

  /* ═══ 3 nov. 2026 — UNE NUIT LUE AU CŒUR SEUL DOIT ÊTRE CONFIRMÉE ═════════════════════════════
     LE FAIT. Le 2 nov. au soir, Dino était au lit, ÉVEILLÉ, sur son téléphone jusqu'à 2 h. Pouls
     51-58, aucun pas : la lecture au cœur a vu une « nuit » (21:23 → 01:32, 77 min de sommeil en
     morceaux séparés par 2 h 19 d'éveil, le plus long bloc : 42 min) et l'accueil a écrit
     « SOMMEIL DÉTECTÉ ». Le bracelet, lui, n'avait rien dit. Le déverrouillage du téléphone, qui
     prouve l'éveil, s'était tu à 00:41 : iOS avait suspendu l'app.
     Dino : « si le bracelet n'a pas dit que je dormais, à quel moment c'est une bonne idée
     d'écrire que je me suis endormi ? … c'est des ingénieurs qui ont fait ça, fais-leur
     confiance ». Et : « éveillé dans mon lit avec mon téléphone, ou je lis, ou je bouge pas, je
     fais la méditation : ça ne me dit pas que je dors ».

     LA RÈGLE (bracelet Fitcare, nuit lue au cœur seul) :
       · le fichier de nuit du BRACELET la chevauche d'au moins 30 min → confirmée ;
       · sinon elle ne tient seule que si elle est ÉVIDENTE — le matin où le bracelet n'écrit
         aucun fichier (1er nov.) : ≥ 4 h de sommeil, un bloc d'au moins 90 min d'affilée (un éveil
         de 5 min ou moins ne coupe pas le bloc), et un plancher de pouls qui ressemble aux
         siennes (≤ normale des planchers + 4, dès qu'on en connaît 5) ;
       · sinon : PAS DE NUIT. Ni carte, ni chiffres. Elle reviendra si le bracelet la confirme
         au matin (son fichier ne se lit qu'après 5 h : le lire la nuit la coupe, firmware 0120).
     Ne passent pas ici : un fichier du bracelet, une saisie à la main, un autre bracelet.
     Banc : tests/test-nuit-confirmee.js (la soirée du 2 nov. y est rejouée pour toujours). */
  window.flNuitConfirmee = function (K, n, w) {
    try {
      if (!n || n.source === 'manuel' || n.lecteur !== 'coeur') return { ok: true };
      w = w || flsLire('watch_' + K, null) || {};
      if (!/fitcare/.test(String(w.marque || ''))) return { ok: true };
      var deb = +n.sleepStart, fin = +n.sleepEnd, nf = w.nuitFitcare;
      if (nf && +nf.debut > 0 && +nf.fin > +nf.debut && fin > deb
          && Math.min(fin, +nf.fin * 1000) - Math.max(deb, +nf.debut * 1000) >= 30 * 60000) {
        return { ok: true, par: 'bracelet' };
      }
      var st = Array.isArray(n.stages) ? n.stages : [], bloc = 0, cur = 0;
      st.forEach(function (s) {
        if (!s) return;
        if (s.stage === 'awake' && +s.durMin > 5) { cur = 0; return; }
        cur += +s.durMin || 0; if (cur > bloc) bloc = cur;
      });
      if (!st.length) bloc = +n.sleepMin || 0;   /* nuit sans stades : on ne sait pas couper, la durée juge */
      var pl = [], qK = String(K).split('-');
      for (var d = 1; d <= 14; d++) {
        var dK = new Date(+qK[0], +qK[1] - 1, +qK[2] - d);
        var nd = (flsLire('watch_' + dK.getFullYear() + '-' + (dK.getMonth() + 1) + '-' + dK.getDate(), null) || {}).night;
        if (nd && nd.lecteur === 'coeur' && +nd.plancher > 0 && +nd.sleepMin >= 240) pl.push(+nd.plancher);
      }
      pl.sort(function (a, b) { return a - b; });
      var normale = pl.length >= 5 ? pl[pl.length >> 1] : null;
      var planOk = normale == null || !(+n.plancher > 0) || +n.plancher <= normale + 4;
      if (+n.sleepMin >= 240 && bloc >= 90 && planOk) return { ok: true, par: 'evidente' };
      return { ok: false, raison: 'lue au cœur seul, le bracelet ne la confirme pas (' + (+n.sleepMin || 0)
               + ' min de sommeil, plus long bloc ' + bloc + ' min'
               + (normale != null ? ', plancher ' + n.plancher + ' pour une normale de ' + normale : '') + ')' };
    } catch (e) { return { ok: true }; }
  };
  /* v2995 (revue) — UNE SEULE CASE POUR LA NUIT DU BRACELET, ET ELLE SE GARDE. index.html range ici
     chaque nuit reçue (`flNuitFitcareRanger`) : une nuit qui colle à la nuit lue au cœur prend la
     case ; une autre (sieste, fichier mal daté) va dans `siestesFitcare` et ne remplace JAMAIS une
     nuit qui collait. Sans nuit lue au cœur pour juger, la case vide la prend ; pleine, on garde. */
  /* ═══ 1er nov. 2026 — LE DIRECT D'ABORD, LA MÉMOIRE COMBLE LES TROUS ════════════════════════
     Dino : « faut jamais que ça se marche dessus entre quand le téléphone est branché et quand la
     montre envoie sa mémoire ». Nuit du 31 oct. au 1er nov. : le direct (téléphone branché toute la
     nuit, 1 bpm d'écart avec WHOOP) donnait 02:40 → 07:55 et nos stades ; à 08:49 la mémoire est
     arrivée et la règle v2907 (« dans l'intervalle qu'elle couvre, la mémoire est SEULE ») a effacé
     tout le pouls du direct de 01:41 à 08:50 — la nuit s'est recalculée sur les minutes quantifiées
     du bracelet : 02:49, et d'autres stades.
     LA RÈGLE, minute par minute, entre la première et la dernière minute de la mémoire :
       · le direct et la mémoire s'ACCORDENT (≤ `tol` bpm, la mémoire à ±`pres` min — le bracelet
         date ses minutes à la fin) → le direct reste, rien ne bouge ;
       · une minute sans direct → la mémoire la comble ;
       · ils se CONTREDISENT → la mémoire gagne. C'est le cas qui a fait v2907 et qu'on garde : le
         foot du 26 oct., canal diffusé gelé à 49-50 quand la mémoire dit 104-129. Une minute du
         direct sans mémoire à la même minute, mais contredite par la mémoire voisine, est écartée
         aussi (les minutes que la mémoire saute pendant l'effort ne gardent pas le canal gelé).
     ET L'ACCORD SE JUGE SUR TOUT L'INTERVALLE : si le direct contredit la mémoire sur plus du quart
     des minutes comparées (`gele`), c'est un canal GELÉ — ses minutes « d'accord » ne le sont que
     par hasard (un 50 figé ressemble à un 58 de la mémoire) — et la mémoire est seule dans son
     intervalle, comme en v2907. La nuit du 1er : 0 désaccord sur 300 minutes, le direct reste.
     Rend le compte, pour le journal. Banc : tests/test-memoire-fitcare.js §2, §4ter et §4quater. */
  window.flFusionMemoirePouls = function (carte, mem, tol, pres) {
    tol = tol || 12; pres = pres == null ? 2 : pres;
    var memC = {}, mn = Infinity, mx = -Infinity, n = { gardes: 0, combles: 0, remplaces: 0, ecartes: 0 };
    (mem || []).forEach(function (e) { memC[e[0]] = e[1]; if (e[0] < mn) mn = e[0]; if (e[0] > mx) mx = e[0]; });
    function voisine(m) {
      for (var d = 0; d <= pres; d++) { if (memC[m - d] != null) return memC[m - d]; if (memC[m + d] != null) return memC[m + d]; }
      return null;
    }
    var dans = Object.keys(carte).filter(function (k) { return +k >= mn && +k <= mx; }), compares = 0, contre = 0;
    dans.forEach(function (k) { var v = voisine(+k); if (v != null) { compares++; if (Math.abs(carte[k] - v) > tol) contre++; } });
    n.gele = compares >= 5 && contre / compares > 0.25;
    dans.forEach(function (k) {
      var v = voisine(+k);
      if (n.gele || (v != null && Math.abs(carte[k] - v) > tol)) { delete carte[k]; n.ecartes++; }
    });
    (mem || []).forEach(function (e) {
      var c = carte[e[0]];
      if (c == null) { carte[e[0]] = e[1]; n.combles++; }
      else if (Math.abs(c - e[1]) > tol) { carte[e[0]] = e[1]; n.remplaces++; }
      else n.gardes++;
    });
    return n;
  };

  /* ═══ 2 nov. 2026 — LE POULS DOUBLÉ ════════════════════════════════════════════════════
     Nuit du 1er au 2 nov. : endormi à 23:38 (WHOOP 23:37, le bracelet 23:42), pouls 51-55 ; à 00:00
     il saute à 101-106 et y reste 35 min — 0 pas, téléphone posé, peau à 34,6-34,9 °C — puis RETOMBE
     à 46-49 en une minute (00:36). Un cœur ne descend pas de 54 battements en une minute : le
     capteur a compté chaque battement deux fois (le double exact de 51-53). FLINT a fait commencer
     la nuit à 00:36 (−59 min) et compté 2h41 de paradoxal (WHOOP 1h47). Divisé par deux, la nuit
     rejouée commence à 23:38, paradoxal 2h03, léger 4h36 (WHOOP 4h21).
     LA SIGNATURE, toutes ensemble : un repos (médiane ≤ 75 sur les 10 minutes d'avant), une
     ENTRÉE brusque (+30 en 3 min au plus), un palier PLAT (écart-type ≤ 4) entre 1,85 et 2,15 fois le
     repos, tenu 10 min au moins, et une SORTIE brusque vers le repos (±10) dans les 3 minutes. Un vrai réveil ne retombe
     pas d'un coup ; une montée d'effort ne tient pas pile le double. `pts` : [[minute, pouls], …]
     triés ; rend { pts (copie, palier divisé par deux), n (minutes corrigées) }. Banc :
     tests/test-pouls-double.js.

     ═══ 3 nov. 2026 — LA SOURCE : LA MESURE DE CHAQUE HEURE PILE ═══
     Le Fitcare mesure l'oxygène et la VFC toutes les 60 min (`Setting.json` : spo2_save_interval=60,
     hrv_save_interval=60), à l'heure pile, en changeant de LED. En revenant au pouls, son calcul se
     dérègle : au repos, un saut de +20 dans les 5 min après l'heure 24 fois sur 37 (11 sur 40 à la
     demi-heure, le témoin) ; dans le pouls minute de la nuit, +8 au moins 18 fois sur 34 (5 sur 36).
     Les trois paliers doublés connus partent tous 1-2 min après l'heure (20:00, 00:00, 02:00).
     LE REMÈDE EST À LA SOURCE (couper ou espacer cette mesure, ou un firmware corrigé — Fitcare).
     ESSAYÉ ICI ET RETIRÉ, mesuré contre WHOOP (7 nuits Fitcare, 66 en tout) :
       · effacer les pics d'heure pile : endormissement égal, réveil 4,0 → 4,1 min, durée 11,4 → 12,1,
         éveils 14,9 → 13,4 — rien de net, et des réveils de banc décalés (06:45 → 06:57) ;
       · un palier doublé court (2 min) accepté s'il part à l'heure pile : +1 nuit sur 66, mais il
         divise aussi un vrai effort de 2 min (10 oct. 14:00, 104 → 122 → 86). */
  window.flPoulsDedouble = function (pts) {
    var out = (pts || []).map(function (x) { return [x[0], x[1]]; }), n = 0, bords = [], bordsBase = [];
    function med(v) { var a = v.slice().sort(function (x, y) { return x - y; }), k = a.length; return k ? (k % 2 ? a[k >> 1] : (a[k / 2 - 1] + a[k / 2]) / 2) : null; }
    for (var s = 1; s < out.length; s++) {
      var av = [];
      for (var q = s - 1; q >= 0 && out[s][0] - out[q][0] <= 20 && av.length < 10; q--) if (out[q][1] > 0) av.push(out[q][1]);
      if (av.length < 5) continue;
      /* 3 nov. 2026 — LE REPOS SE LIT SUR LE REPOS. Nuit du 2 au 3 : 52 → 77 → 87 → 102…105 (13 min).
         Les deux minutes de montée entraient dans la médiane des dix d'avant (55 au lieu de 53) :
         1,85 × 55 = 101,75, et le palier (99-105) tombait à cheval sur le seuil — non détecté, la nuit
         commençait à 02:16 (WHOOP 01:55). On écarte de cette médiane ce qui dépasse 1,3 fois elle. */
      var b0 = med(av), avR = av.filter(function (y) { return y <= 1.3 * b0; });
      var b = avR.length >= 5 ? med(avR) : b0;
      if (!(b <= 75) || !(out[s][1] >= 1.85 * b && out[s][1] <= 2.15 * b)) continue;
      var avant = null;
      for (var q2 = s - 1; q2 >= 0 && out[s][0] - out[q2][0] <= 3; q2--) if (out[q2][1] <= 1.3 * b) { avant = q2; break; }
      if (avant == null || out[s][1] - out[avant][1] < 30) continue;
      var e = s;
      while (e + 1 < out.length && out[e + 1][0] - out[e][0] <= 2 && out[e + 1][1] >= 1.85 * b && out[e + 1][1] <= 2.15 * b) e++;
      if (out[e][0] - out[s][0] < 9 || out[e][0] - out[s][0] > 180) { s = e; continue; }
      var pal = out.slice(s, e + 1).map(function (y) { return y[1]; }), mp = pal.reduce(function (a, c) { return a + c; }, 0) / pal.length;
      if (Math.sqrt(pal.reduce(function (a, c) { return a + (c - mp) * (c - mp); }, 0) / pal.length) > 4) { s = e; continue; }
      var sortie = false;
      for (var x = e + 1; x < out.length && out[x][0] - out[e][0] <= 3; x++) if (Math.abs(out[x][1] - b) <= 10) { sortie = true; break; }
      if (!sortie) { s = e; continue; }
      for (var z = s; z <= e; z++) { out[z][1] = Math.round(out[z][1] / 2); n++; }
      /* 3 nov. 2026 — LES BORDS DU PALIER (52 → 77 → 87 → 102 … 102 → 82 → 57) : ni le vrai pouls ni
         le double. On ne les réécrit pas — essayé : les rendre inconnus déplaçait les stades du 2 nov.
         (paradoxal 107 → 213 min) —, on les NOMME (`bords`) pour que l'endormissement ne les prenne
         pas pour des pics d'éveil. */
      for (var zb = avant + 1; zb < s; zb++) { bords.push(out[zb][0]); bordsBase.push([out[zb][0], Math.round(b)]); }
      for (var zc = e + 1; zc < x; zc++) { bords.push(out[zc][0]); bordsBase.push([out[zc][0], Math.round(b)]); }
      s = e;
    }
    return { pts: out, n: n, bords: bords, bordsBase: bordsBase };
  };

  /* ═══ 3 nov. 2026 — « PLUS JAMAIS DE FAUX POULS » (Dino) : CORRIGÉ À LA SOURCE ═══════════════════
     Jusqu'ici le pouls doublé n'était divisé par deux que dans les calculs de la nuit : la courbe du
     jour, le pouls de repos, le stress, le mode sport automatique voyaient encore 105 à 02:05 le
     3 nov. (« mon pouls est à 74 ou 100, t'es sûr qu'il n'y a pas d'erreur ? »). Ici, la journée est
     corrigée UNE fois, à l'écriture (`wSaveK`) : tout ce qui lit `watch_.hr` lit le vrai pouls.
       · le palier doublé est divisé par deux (`flPoulsDedouble` : repos ≤ 75, entrée +30 en 3 min,
         palier plat 1,85-2,15× d'au moins 9 min, retour au repos en 3 min — une vraie séance n'a
         ni ce plat ni ce retour) ;
       · ses BORDS (77, 87 à la montée, 82 à la descente : ni le pouls ni le double, la bascule du
         capteur) prennent la valeur du repos d'avant ;
       · la valeur d'origine de chaque minute touchée est gardée dans `hrDouble` ([minute, brut]) :
         rien n'est perdu, tout se défait.
     La veille au soir (dernière heure) donne le repos d'avant minuit. Idempotent : une journée déjà
     corrigée n'a plus de palier doublé. */
  window.flPoulsCorrigerJour = function (d, veilleHr) {
    if (!d || !Array.isArray(d.hr) || d.hr.length < 6) return 0;
    var pts = [];
    (Array.isArray(veilleHr) ? veilleHr : []).forEach(function (x) { if (x && x[0] >= 1380 && +x[1] > 0) pts.push([x[0] - 1440, +x[1]]); });
    d.hr.forEach(function (x) { if (x && x[0] != null && +x[1] > 0) pts.push([+x[0], +x[1]]); });
    pts.sort(function (a, c) { return a[0] - c[0]; });
    var dd = window.flPoulsDedouble(pts);
    if (!dd.n) return 0;
    var corr = {};
    for (var i = 0; i < pts.length; i++) if (pts[i][0] >= 0 && dd.pts[i][1] !== pts[i][1]) corr[pts[i][0]] = dd.pts[i][1];
    (dd.bordsBase || []).forEach(function (x) { if (x[0] >= 0) corr[x[0]] = x[1]; });
    var brut = Array.isArray(d.hrDouble) ? d.hrDouble : [], vu = {}, n = 0;
    brut.forEach(function (x) { vu[x[0]] = true; });
    d.hr.forEach(function (x) {
      var c = x ? corr[x[0]] : null;
      if (c == null || c === x[1]) return;
      if (!vu[x[0]]) { brut.push([x[0], x[1]]); vu[x[0]] = true; }
      x[1] = c; n++;
    });
    if (n) d.hrDouble = brut;
    return n;
  };

  window.flNuitFitcareRanger = function (K, w, nf) {
    try {
      if (!w || !nf) return false;
      var n = w.night, deb = n && +n.sleepStart, fin = n && +n.sleepEnd;
      if (!(deb > 0 && fin > deb)) {
        var c = null; try { c = window.flNuitDuCoeur(K, Date.now()); } catch (e) {}
        if (c) { deb = c.sleepStart; fin = c.sleepEnd; }
      }
      var colle = (deb > 0 && fin > deb) ? window.flNuitFitcareCollee(nf, deb, fin) : null;
      var avant = w.nuitFitcare, avantColle = (avant && deb > 0 && fin > deb) ? window.flNuitFitcareCollee(avant, deb, fin) : false;
      var memeNuit = avant && Math.abs(+avant.debut - +nf.debut) <= 60;   /* la même nuit relue (fin qui avance) */
      /* v2996 (seconde revue) — la même nuit relue PLUS LONGUE reprend toujours la case : une nuit
         rangée périmée (lue à 05:00, nuit « finie » à 05:02) envoyait la lecture complète de 07:49
         dans les siestes, et la case gardait la nuit coupée. */
      if (memeNuit && +nf.fin >= +avant.fin) { w.nuitFitcare = nf; return true; }
      /* 2 nov. 2026 — UN SECOND SOMMEIL NE PREND JAMAIS LA CASE DE LA NUIT. Rendormi à 09:30
         après un réveil à 08:00, la nuit lue au cœur s'allonge jusqu'à 11:00 : le second
         enregistrement du bracelet (09:30 → 11:00) finit alors au réveil et « colle » — il
         remplaçait l'enregistrement de la nuit entière. Un enregistrement qui commence après
         la fin de celui déjà rangé est un autre sommeil, quoi qu'il colle. */
      var apres = avant && !memeNuit && +nf.debut >= +avant.fin - 60;
      if (!apres && (colle === true || (colle === null && !avant))) { w.nuitFitcare = nf; return true; }
      var l = Array.isArray(w.siestesFitcare) ? w.siestesFitcare : [];
      if (!l.some(function (x) { return Math.abs(+x.debut - +nf.debut) <= 60; })) l.push({ debut: nf.debut, fin: nf.fin, recu: nf.recu, valide: nf.valide });
      w.siestesFitcare = l.slice(-8);
      var sie = siesteFitcare(K, w, nf, (fin > 0) ? fin : ((avant && +avant.fin > 0) ? +avant.fin * 1000 : 0));
      flsLog('nuit ' + K + ' : fichier du bracelet ' + new Date(nf.debut * 1000).toTimeString().slice(0, 5) + '→' + new Date(nf.fin * 1000).toTimeString().slice(0, 5)
        + ' rangé À PART (ne colle pas à la nuit' + (avantColle ? ' — la nuit du bracelet déjà rangée est gardée' : '') + ') — '
        + (sie.sieste ? 'SIESTE de ' + sie.dormi + ' min posée à la journée' : 'pas une sieste : ' + sie.raison));
      return false;
    } catch (e) { return false; }
  };

  /* ═══ 2 nov. 2026 — LES SIESTES DU BRACELET S'AFFICHENT ENFIN ════════════════════════════
     Un enregistrement de sommeil du Fitcare qui n'est pas la nuit partait dans `siestesFitcare`,
     et RIEN ne lisait cette liste : une sieste mesurée par le bracelet n'apparaissait jamais (leur
     application les connaît : « Daytime Nap »). L'ancien bracelet passait par `flsPoserSommeil` /
     `flsPoserActivite` ; celui-ci emprunte la même sortie, avec les mêmes gardes — et le pouls
     seul ne crée toujours AUCUNE sieste (v1168).
     LA RÈGLE DE DINO (2 nov.) : deux heures debout après la fin de la nuit, et un nouveau sommeil
     est une sieste (`CLASSIF.reveilSieste`) ; avant, c'est la nuit qui continue — sauf marche
     franche entre les deux, qui prouve que la journée avait repris (v2016). Une sieste : de
     `dureeMiniRetenue` à `dureeMaxiSieste`, de jour, après la nuit, sans marche dedans.
     Le registre s'écrit dans `w`, la COPIE VIVANTE que l'appelant enregistre juste après : passé
     par `flsPoserSommeil` (le disque), il aurait été écrasé par cet enregistrement-là. */
  function siesteFitcare(K, w, nf, finNuit) {
    var d = +nf.debut * 1000, f = +nf.fin * 1000, dur = Math.round((f - d) / 60000);
    if (!(dur >= CLASSIF.dureeMiniRetenue && dur <= CLASSIF.dureeMaxiSieste)) return { raison: dur + ' min' };
    /* La plage nocturne court jusqu'à 10 h (`nuitFinMin`) : un sommeil de 09:00 APRÈS une nuit déjà
       lue est un second sommeil (v1191), pas un bout de nuit. Le soir (21 h et après), c'est le
       début de la nuit suivante qui arrive : il reste au registre, il ne devient pas une sieste. */
    var dd0 = new Date(d), minD = dd0.getHours() * 60 + dd0.getMinutes();
    var matinApresNuit = finNuit > 0 && minD < CLASSIF.nuitFinMin;
    if (!matinApresNuit && flsPartNocturne(d, f) >= CLASSIF.partNuitMini) return { raison: 'sommeil nocturne' };
    var marche = function (a, b) { var mv = flsMarcheDans(K, a, b); return mv.suite >= MARCHE_SUITE_MINI && mv.pas >= MARCHE_PAS_MINI; };
    if (finNuit > 0) {
      if (d < finNuit) return { raison: 'dans la nuit' };
      var debout = Math.round((d - finNuit) / 60000);
      if (debout < CLASSIF.reveilSieste && !marche(finNuit, d))
        return { raison: debout + ' min debout sans marche : la nuit continue' };
    }
    if (marche(d, f)) return { raison: 'marche dedans' };
    var hy = Array.isArray(nf.hypno) ? nf.hypno : [];
    var dormi = hy.length ? hy.filter(function (c) { return +c !== 0; }).length : dur;
    if (dormi < CLASSIF.dureeMiniRetenue) return { raison: dormi + ' min dormies' };
    var s = { debut: d, fin: f, type: 'nap', sleepMin: dormi, timeInBed: dur, source: 'ble', instrument: 'fitcare' };
    var liste = Array.isArray(w.sommeils) ? w.sommeils : [], place = -1;
    for (var i = 0; i < liste.length; i++) {
      var a = liste[i];
      if (a && a.type !== TYPE_NUIT && Math.min(a.fin, f) - Math.max(a.debut, d) > 0) { place = i; break; }
    }
    if (place >= 0 && liste[place].source === 'manuel') return { raison: 'sieste saisie à la main' };
    if (place >= 0) liste[place] = s; else liste.push(s);
    liste.sort(function (x, y) { return x.debut - y.debut; });
    w.sommeils = liste;
    flsPoserActivite(K, s, true);
    return { sieste: true, dormi: dormi };
  }

  window.flNuitDuCoeur = function (K, borne, opts) {
    try {
      var p = NUIT_COEUR;
      /* v2994 — `opts.fenetre` {debut, fin} (ms) : une fenêtre DÉJÀ décidée (une nuit saisie ou
         scellée à la main) qu'on relit sans rien redécider — seulement ses minutes et ses stades. */
      var fx = (opts && opts.fenetre && +opts.fenetre.fin > +opts.fenetre.debut) ? opts.fenetre : null;
      var q = String(K).split('-');
      var minuit = new Date(+q[0], +q[1] - 1, +q[2]).getTime();
      if (isNaN(minuit)) return null;
      var t0 = minuit - 12 * 3600000, N = 26 * 60;
      var lim = (borne != null) ? +borne : Date.now();
      var H = new Array(N), P = new Array(N), i, j;
      for (i = 0; i < N; i++) { H[i] = null; P[i] = 0; }
      var dv = new Date(minuit - 12 * 3600000);
      var Kv = dv.getFullYear() + '-' + (dv.getMonth() + 1) + '-' + dv.getDate();
      var mv = new Date(dv.getFullYear(), dv.getMonth(), dv.getDate()).getTime();
      [[Kv, mv, 720], [K, minuit, 0]].forEach(function (jr) {
        var w = flsLire('watch_' + jr[0], null) || {};
        var hr = Array.isArray(w.hr) ? w.hr : [];
        for (var a = 0; a < hr.length; a++) {
          var x = hr[a];
          if (!x || x[0] == null || !(+x[1] > 0) || x[0] < jr[2]) continue;
          var ms = jr[1] + x[0] * 60000;
          if (ms > lim) continue;
          var k = Math.floor((ms - t0) / 60000);
          if (k >= 0 && k < N) H[k] = +x[1];
        }
        /* ═══ 25 oct. 2026 — LES PAS DE L'IPHONE QUAND LE BRACELET N'EN DONNE PAS
           `actDet` est le canal PAS DU BRACELET. Un capteur qui parle la langue
           commune du Bluetooth n'en a pas : `actDet` reste vide, et ce
           détecteur — qui se sert du mouvement pour séparer le sommeil de
           l'éveil immobile — devient AVEUGLE toute la nuit.

           Mesuré sur la nuit du 25 : `watch_` portait zéro bloc d'activité,
           pendant que `sante_` (le podomètre de l'iPhone, FlintSante) avait
           enregistré les pas de 02:15, 02:50 et 02:55 — exactement le moment
           où Dino s'est levé manger et se doucher. La donnée existait, le
           détecteur ne la regardait pas.

           Les blocs de `sante_` couvrent cinq minutes : on les ÉTALE au lieu
           de les poser sur la première, parce que `P[i] > 0` marque la minute
           éveillée et qu'un bloc entier posé sur une minute en laisserait
           quatre endormies au milieu d'un lever. */
        var vuDesPas = false;
        var bl = Array.isArray(w.actDet) ? w.actDet : [];
        for (var b = 0; b < bl.length; b++) {
          var B = bl[b], cs = (B && Array.isArray(B[3])) ? B[3] : null;
          if (!cs) continue;
          var d0 = Math.floor(+B[0] / 60) * 60000;
          for (var c = 0; c < cs.length; c++) {
            var mc = d0 + c * 60000;
            if (mc > lim) continue;
            var kc = Math.floor((mc - t0) / 60000);
            if (kc >= 0 && kc < N) P[kc] += (+cs[c] || 0);
          }
          vuDesPas = true;
        }
        if (!vuDesPas) {
          var sa = flsLire('sante_' + jr[0], null) || {};
          var pas = Array.isArray(sa.pas) ? sa.pas : [];
          for (var e = 0; e < pas.length; e++) {
            var PB = pas[e];
            if (!PB || PB[0] == null || !(+PB[1] > 0)) continue;
            if (PB[0] < jr[2]) continue;
            var part = (+PB[1]) / 5;
            for (var f = 0; f < 5; f++) {
              var msp = jr[1] + (PB[0] + f) * 60000;
              if (msp > lim) continue;
              var kp = Math.floor((msp - t0) / 60000);
              if (kp >= 0 && kp < N) P[kp] += part;
            }
          }
        }
      });
      /* 2 nov. 2026 — le pouls doublé est rendu à sa vraie fréquence avant toute lecture. */
      var bordsDouble = {};
      try {
        var ptsH = [];
        for (var iH = 0; iH < N; iH++) if (H[iH] != null) ptsH.push([iH, H[iH]]);
        var dd = window.flPoulsDedouble(ptsH);
        if (dd.n) { dd.pts.forEach(function (x) { H[x[0]] = x[1]; }); (dd.bords || []).forEach(function (mB) { bordsDouble[mB] = true; }); flsLog('nuit ' + K + ' : pouls DOUBLÉ divisé par deux sur ' + dd.n + ' minute(s)'); }
      } catch (eDD) {}
      /* v2994 — LE TÉLÉPHONE DÉVERROUILLÉ (`watch_.verrou`, voir `flVerrouRecevoir`) : chaque minute
         d'une période déverrouillée est ÉVEILLÉE, et l'endormissement vient après la dernière qui le
         touche. `perT` : les périodes en index de minute de cette lecture. */
      var U = null, perT = [];
      window.flVerrouPeriodes(flsVerrouEvenements([Kv, K]), p.verrouMax).forEach(function (iv) {
        if (iv[0] * 1000 > lim) return;
        var a = Math.max(0, Math.floor((iv[0] * 1000 - t0) / 60000)), b = Math.min(N, Math.ceil((Math.min(iv[1] * 1000, lim) - t0) / 60000));
        if (b <= a) return;
        if (!U) U = new Array(N);
        for (var z = a; z < b; z++) U[z] = true;
        perT.push([a, b]);
      });
      function med(v) { v = v.slice().sort(function (x, y) { return x - y; });
        var n = v.length; return !n ? null : (n % 2 ? v[n >> 1] : (v[n / 2 - 1] + v[n / 2]) / 2); }
      var R = new Array(N), p5 = new Array(N);
      for (i = 0; i < N; i++) {
        var v = [];
        for (j = Math.max(0, i - 7); j < Math.min(N, i + 8); j++) if (H[j] != null) v.push(H[j]);
        R[i] = v.length >= 3 ? med(v) : null;
        var sp = 0;
        for (j = Math.max(0, i - 2); j < Math.min(N, i + 3); j++) sp += P[j];
        p5[i] = sp;
      }
      /* LA BORNE TIENT AUSSI APRÈS LE LISSAGE : la médiane centrée de 15 min
         rendait encore une valeur sept minutes après la dernière mesure, et la
         nuit finissait cinq minutes après « maintenant » (banc §4) — le défaut
         que la v2210 avait fermé pour `computeNight`. */
      var kB = Math.floor((lim - t0) / 60000);
      for (i = Math.max(0, kB + 1); i < N; i++) R[i] = null;
      var F = null;
      for (i = 8 * 60; i < N - 180; i += 10) {
        var w3 = [];
        for (j = i; j < i + 180; j++) if (H[j] != null) w3.push(H[j]);
        if (w3.length >= 90) { var m3 = med(w3); if (F == null || m3 < F) F = m3; }
      }
      if (F == null) return null;
      /* 3 nov. 2026 — ESSAYÉ ET RETIRÉ : exclure ici les minutes déverrouillées (U) cassait la
         fenêtre d'une vraie nuit — le 30 oct., une session finie à 00:46 repoussait l'endormissement
         à 02:01 (test-nuit-debut-bracelet §8). L'endormissement après le téléphone est déjà réglé
         plus bas (v2994) ; la fausse nuit au téléphone, elle, tombe à `flNuitConfirmee`. */
      function calme(k) { return R[k] != null && R[k] <= F + p.calme && p5[k] <= 0; }
      var seg = [], s0 = null, hors = 0, vide = 0;
      for (i = 0; i < N; i++) {
        if (R[i] == null) {
          vide++;
          if (s0 != null && vide > p.trou) { seg.push([s0, i - vide]); s0 = null; }
          continue;
        }
        vide = 0;
        if (calme(i)) { if (s0 == null) s0 = i; hors = 0; }
        else if (s0 != null) {
          hors++;
          if (hors > p.bref) { seg.push([s0, i - hors]); s0 = null; hors = 0; }
        }
      }
      if (s0 != null) seg.push([s0, N - 1]);
      if (fx) seg = [[Math.round((+fx.debut - t0) / 60000), Math.round((+fx.fin - t0) / 60000)]];
      seg = seg.filter(function (x) { return x[1] - x[0] >= 60; });
      if (!seg.length) return null;
      seg.sort(function (x, y) { return x[0] - y[0]; });
      var fus = [seg[0].slice()];
      for (i = 1; i < seg.length; i++) {
        if (seg[i][0] - fus[fus.length - 1][1] <= p.fusion) fus[fus.length - 1][1] = seg[i][1];
        else fus.push(seg[i].slice());
      }
      var cr = fus[0];
      for (i = 1; i < fus.length; i++) if (fus[i][1] - fus[i][0] > cr[1] - cr[0]) cr = fus[i];
      var a0 = cr[0], b0 = cr[1], fin = b0;
      /* ═══ 25 oct. 2026 — UN CŒUR QUI MONTE SANS UN PAS N'EST PAS UN LEVER ══
         La nuit du 25 finissait a 07:45 ; l'app du fabricant disait 08:48 et
         WHOOP 08:42, a six minutes l'une de l'autre. Entre 03:00 et 11:10
         l'iPhone n'a enregistre AUCUN pas : Dino n'etait pas leve, il etait
         eveille au lit apres son insomnie, le cœur encore haut d'avoir mange
         et pris une douche a 2 h.

         `montee()` rendait vrai sur le seul maintien du pouls au-dessus du
         plancher. C'est juste quand on ne sait rien du mouvement — et c'etait
         le cas jusqu'ici, puisque ce detecteur ne lisait que les pas DU
         BRACELET. Maintenant qu'il voit aussi ceux de l'iPhone, l'absence de
         pas est une information, pas un silence.

         Donc : pouls haut + aucun pas autour = eveil DANS la nuit (WASO), pas
         fin de nuit. Et si la journee ne porte aucun pas du tout, on ne sait
         rien du mouvement et le comportement d'avant joue inchange — c'est ce
         que garde `pasConnus`. */
      var pasConnus = false;
      for (i = 0; i < N; i++) if (p5[i] > 0) { pasConnus = true; break; }
      function montee(k) {
        if (R[k] == null || R[k] < F + p.montee) return false;
        var n = 0, x = k;
        while (x < N && n < p.monteeMin) { if (R[x] != null && R[x] < F + p.montee) break; x++; n++; }
        if (n >= p.monteeMin) {
          if (!pasConnus) return true;
          for (var y0 = Math.max(0, k - 10); y0 < Math.min(N, k + 30); y0++) if (p5[y0] > 0) return true;
          return false;
        }
        for (var y = k; y < Math.min(N, k + 30); y++) if (p5[y] >= p.pasLever) return true;
        return false;
      }
      function retour(k) {
        function pasDans(u) { for (var z = u; z < Math.min(N, u + 10); z++) if (p5[z] > 10) return true; return false; }
        var x = k;
        while (x < N && pasDans(x)) x++;
        if (x - k > p.salve) return false;
        var j0 = x + 5, j1 = Math.min(N, j0 + p.retourMin);
        if (j1 - j0 < p.retourMin) return false;
        var vv = [];
        for (var z = j0; z < j1; z++) { if (p5[z] > 10) return false; if (R[z] != null) vv.push(R[z]); }
        return vv.length >= Math.floor(p.retourMin / 2) && med(vv) <= F + p.retour;
      }
      var k = a0 + p.nuitMin, kl = Math.min(N, b0 + 240);
      if (fx) k = kl;   /* v2994 — fenêtre décidée : pas de lever à chercher */
      while (k < kl) {
        if (p5[k] >= p.pasLever) {
          if (retour(k)) { while (k < kl && p5[k] > 10) k++; k += 5; continue; }
          fin = k; break;
        }
        if (k >= b0 && montee(k)) { fin = k; break; }
        k++;
      }
      if (fin > kB) fin = kB;
      if (fin <= a0) return null;
      var mes = 0, hTot = 0, hOk = 0;
      for (i = a0; i <= fin; i++) if (H[i] != null) mes++;
      for (i = a0; i <= fin; i += 60) {
        var nh = 0;
        for (j = i; j < Math.min(fin + 1, i + 60); j++) if (H[j] != null) nh++;
        hTot++; if (nh >= 20) hOk++;
      }
      var couv = mes / Math.max(1, fin - a0 + 1);
      if (couv < p.couverture || hOk < 0.7 * hTot) {
        flsLog('nuit ' + K + ' : lue au cœur — pouls sur ' + Math.round(couv * 100) + ' % de la nuit, aucune nuit rendue');
        return null;
      }
      /* ═══ 25 oct. 2026 — LE STADE GARDE SA PLACE, PAS SEULEMENT SON TOTAL ══
         L'écran Sommeil de FLINT noir ne s'ouvrait pas : `segments` était nul,
         et le natif affiche alors, à juste titre, « cette nuit n'a pas été
         découpée minute par minute ». Or cette fonction CLASSE déjà chaque
         minute dormie — elle jetait seulement sa position en ne gardant que
         les totaux. On garde donc le stade DE CHAQUE MINUTE, puis on compacte.

         Une minute sans mesure n'est pas un réveil (le dormeur ne disparaît
         pas) : elle était déjà comptée dans `dormi`, elle devient `light`, le
         stade dominant. Les totaux se déduisent désormais du découpage
         lui-même, donc l'écran et le graphe ne peuvent plus se contredire —
         c'est ce que l'ancien facteur d'échelle ne garantissait pas. */
      var eveil = 0, dorm = [], etats = [];
      /* 27 oct. — les salves du Fitcare (flSalvesEveil) ; l'ancien bracelet n'en a pas */
      var salve = null;
      try {
        var _wK = flsLire('watch_' + K, null) || {};
        if (typeof window.flInstrumentVfc === 'function' && window.flInstrumentVfc(_wK.marque) === 'fitcare')
          salve = window.flSalvesEveil(H, 0, N, p);
      } catch (e) { salve = null; }
      /* ═══ 4 nov. 2026 — LA MESURE DE L'HEURE PILE N'EST PAS UN RÉVEIL ═══════════════════════════
         Le Fitcare mesure l'oxygène et la VFC à chaque heure pile (voir `flPoulsDedouble`) et son pouls
         saute une minute : la nuit du 4 nov., 2h 50 → 76, 3h 46 → 67, 7h 51 → 73. Relue avec toutes
         ses mesures, elle comptait douze éveils au lieu de quatre — dont 02:00, 03:00, 05:01, 07:01,
         d'une minute chacun — et l'écran Ma nuit passait d'un hypnogramme à l'autre en trois secondes.
         Une minute des trois premières de l'heure, au-dessus du repos des dix d'avant de 8 au moins,
         revenue au repos (+5) dans les trois minutes, sans pas ni téléphone : son pouls ne fait pas un
         éveil. Seule la CLASSE de la minute change ; l'endormissement et le réveil ne lisent pas ceci. */
      var picHeure = {};
      for (var iHP = 1; iHP < N; iHP++) {
        if (((iHP % 60) + 60) % 60 > 2 || H[iHP] == null) continue;
        var avHP = [];
        for (var qHP = iHP - 1; qHP >= Math.max(0, iHP - 12) && avHP.length < 10; qHP--) if (H[qHP] != null) avHP.push(H[qHP]);
        if (avHP.length < 5) continue;
        avHP.sort(function (x, y) { return x - y; });
        var bHP = avHP[avHP.length >> 1];
        if (!(bHP <= 75) || !(H[iHP] >= bHP + 8)) continue;
        var eHP = iHP;
        while (eHP + 1 < N && eHP - iHP < 1 && H[eHP + 1] != null && H[eHP + 1] >= bHP + 8) eHP++;
        var revHP = false;
        for (var rHP = eHP + 1; rHP <= Math.min(N - 1, eHP + 3); rHP++) if (H[rHP] != null && H[rHP] <= bHP + 5) { revHP = true; break; }
        if (!revHP) continue;
        for (var zHP = iHP; zHP <= Math.min(N - 1, eHP + 1); zHP++) if (!(P[zHP] > 0)) picHeure[zHP] = true;
        iHP = eHP;
      }
      function classer() {
        eveil = 0; dorm = []; etats = new Array(fin - a0);
        for (i = a0; i < fin; i++) {
          var _long = (R[i] != null && R[i] >= F + p.eveil && !picHeure[i]) || P[i] > 0 || !!(U && U[i]);   /* v2994 — téléphone déverrouillé = éveillé ; 4 nov. — pas un pic d'heure pile */
          if (_long || (salve && salve[i] && !picHeure[i])) {
            eveil++; etats[i - a0] = 'awake';
            /* une salve d'une ou deux minutes ne change pas le NIVEAU de la nuit : son pouls lissé reste
               dans les quartiles des stades — sans quoi la règle « nuit trop plate » (v2888) bascule pour
               un battement (vraie nuit du 27 : les stades disparaissaient) */
            if (!_long && R[i] != null) dorm.push(R[i]);
          }
          else { if (R[i] != null) dorm.push(R[i]); etats[i - a0] = null; }
        }
      }
      classer();
      var finCoeur = fin, debutCoeur = a0;
      /* ═══ v2914 — LA NUIT FINIT AU RÉVEIL, PAS AU LEVER ═══════════════════

         Dino, le 27 octobre, en cliquant sur la courbe de réveil de sa nuit :
         « il me dit que j'ai été réveillé à peu près à 6 heures pile. Vu que
         j'ai été réveillé entre 6 h et 6 h 30, ma nuit, techniquement, elle
         s'arrête à 6 h. » Il a raison, et c'est FLINT qui le lui montrait :

             05:25 → 06:01   paradoxal
             06:01 → 06:16   ÉVEIL, 15 min
             06:16 → 06:24   léger        ← allongé, calme, réveillé
             06:24 → 06:28   éveil
             06:28 → 06:29   léger        → la nuit finissait à 06:29

         FLINT classait 06:01 en éveil et faisait pourtant finir la nuit 28 min
         plus tard — il se contredisait lui-même. La fin de nuit au cœur, c'est
         le LEVER (des pas, ou un pouls qui monte et reste) ; le réveil vient
         avant, et ce qui le suit au lit n'est pas du sommeil. WHOOP : 05:56.

         LA RÈGLE. On cherche le PREMIER éveil d'au moins `finEveil` minutes
         (10) après lequel il ne reste pas plus de `finSommeil` minutes (15) de
         sommeil jusqu'au lever. La nuit finit à son début. Un éveil bref juste
         avant le lever ne déplace rien ; un long éveil suivi d'une vraie
         reprise du sommeil non plus — c'est un éveil DANS la nuit.

         ⚠️ ELLE PASSE AVANT LE BRACELET, et c'est voulu. Le bracelet tronque
         la fenêtre (06:07) : appliqué d'abord, il couperait l'éveil de 06:01 à
         six minutes et cacherait la preuve. On lit la fin de nuit sur la
         fenêtre COMPLÈTE du cœur, puis le bracelet peut encore avancer. */
      var hmE = function (m) { var x = new Date(t0 + m * 60000); return x.getHours() + 'h' + ('0' + x.getMinutes()).slice(-2); };
      /* ═══ 28 oct. 2026 — LE RÉVEIL, RÉGLÉ SUR 60 NUITS DE WHOOP ════════════

         Dino : « le but, c'est vraiment d'avoir les mêmes réveils que Whoop ».
         Rejoué sur 60 nuits (25 août → 28 oct. : base du téléphone + cave,
         `sommeil.csv` de WHOOP, nuits de la Réunion écartées — décalées de
         2 h) : écart médian 6 → 4 min, ≤ 20 min 41 → 46, > 60 min 7 → 4.
         Tenu en validation croisée (pair/impair, août-sept/octobre).

         1 · S'IL S'EST RENDORMI, CE N'ÉTAIT PAS LE LEVER. Le 20 octobre, les
             toilettes de 04:37 finissaient la nuit (WHOOP : 09:02). Une heure
             calme dans les trois heures qui suivent = il s'est recouché : on
             cherche le lever suivant, une montée tenue `monteeMin` minutes.
         2 · LE RÉVEIL FINAL DOIT SE VOIR. Le 28, de 06:48 à 07:00 le pouls
             restait à 54-58 — plancher 49 + 6, donc « éveillé » — : c'était du
             paradoxal. Le vrai réveil (07:01, Dino et WHOOP) monte à 67-69.
             Sans pouls ≥ plancher + 15 dans ses 15 premières minutes, l'éveil
             final commence `netAvance` minutes avant ce pic.
         3 · LE PREMIER SIGNE, PAS LA MONTÉE CONFIRMÉE : −4 min, le biais mesuré
             sur les 60 nuits (WHOOP date le premier signe de réveil). */
      function tenue(j) {
        if (R[j] == null || R[j] < F + p.montee) return false;
        for (var x = j; x < Math.min(N, j + p.monteeMin); x++) if (R[x] != null && R[x] < F + p.montee) return false;
        return true;
      }
      var srcDebut = fx ? 'saisie' : 'coeur', debutDuCoeur = a0;
      if (!fx) {   /* v2994 — une fenêtre décidée ne se redécide pas : de la fin au réveil à l'endormissement */
      var kL = fin, garde = 0;
      while (garde++ < 6) {
        var run = 0, dern = -1, iR;
        for (iR = kL + 10; iR < Math.min(N, kL + p.rendormiFen); iR++) {
          /* 4 nov. 2026 — une minute où le téléphone est déverrouillé n'est pas une minute rendormie. */
          if (R[iR] != null && R[iR] <= F + p.calme && p5[iR] <= 0 && !(U && U[iR])) { if (++run >= p.rendormi) dern = iR; }
          else run = 0;
        }
        if (dern < 0) break;
        var jL = dern;
        while (jL < N && !tenue(jL)) jL++;
        if (jL >= N || jL - kL > p.rendormiLoin) break;
        flsLog('nuit ' + K + ' : rendormi après ' + hmE(kL) + ' — le lever est ' + hmE(jL));
        kL = jL;
      }
      if (kL !== fin) { fin = kL; classer(); }
      var cut = window.flFinAuReveil(etats, p, perT.map(function (iv) { return [iv[0] - a0, iv[1] - a0]; }));
      if (cut) {
        flsLog('nuit ' + K + ' : la nuit finit au RÉVEIL ' + hmE(a0 + cut.debut) + ' (éveil de ' + cut.eveil
          + ' min, ' + cut.apres + ' min de sommeil ensuite), pas au lever ' + hmE(fin));
        var debutR = a0 + cut.debut, pic = -1;
        for (var iP = debutR; iP < Math.min(N, fin + 15); iP++) if (H[iP] != null && H[iP] >= F + p.netReveil) { pic = iP; break; }
        fin = (pic >= 0 && pic - debutR > 15) ? pic - p.netAvance : debutR;
      }
      fin += p.decalReveil;
      /* ═══ v2914 — LE RÉVEIL DU BRACELET, QUAND IL VOIT CE QUE LE CŒUR NE VOIT PAS

         Nuit du 27 octobre 2026. WHOOP : réveil 05:56. L'app du fabricant :
         06:07. FLINT : 06:29 — trente-trois minutes de retard. Dino : « ton
         réveil est 33 minutes trop tard, c'est là qu'il faut travailler ».

         POURQUOI LE CŒUR SEUL ARRIVE EN RETARD, ET SEULEMENT EN RETARD. Ici,
         `fin` est la fin du bloc CALME (`b0`), ou un lever vu aux pas. Or après
         05:56 Dino était réveillé, couché, immobile : le pouls reste au plancher
         et aucun pas ne part. Pour un détecteur au cœur, un éveil calme au lit
         EST du sommeil. Le bracelet, lui, mesure le MOUVEMENT — l'agitation d'un
         éveil, même allongé — et il l'a vu onze minutes après WHOOP.

         La règle est donc ASYMÉTRIQUE, et c'est voulu : le réveil du bracelet
         peut AVANCER le nôtre, jamais le reculer. Le cœur ne se trompe que dans
         un sens. Si le bracelet dit plus tard que nous, c'est que nous avons vu
         de vrais pas — un lever — et un lever se croit.

         Trois bornes, pour qu'un fichier faux ne déplace pas une nuit :
           · le fichier se dit valide ;
           · au moins une heure de sommeil avant son réveil ;
           · au plus `reveilBracelet` minutes (90) avant le nôtre. Au-delà, ce
             n'est plus une correction, c'est un désaccord — et dans un
             désaccord de deux heures, on ne sait pas qui a raison. La nuit du
             18 septembre (toilettes à 06:15, recouché jusqu'à 08:58) serait
             cassée par une fenêtre sans borne ; celle-ci la refuse.

         `nuitFitcare` était rangé depuis le 26 octobre sous le commentaire « on
         prend sa FENÊTRE » — et personne ne le lisait. Un champ écrit et jamais
         lu, c'est une promesse dans un commentaire. Elle est tenue ici.

         ET UNE QUATRIÈME BORNE, `nuitClose` (20 min) : le réveil du bracelet
         doit précéder d'au moins vingt minutes l'instant où il nous l'a donné.
         FLINT lui demande sa nuit à partir de 5 h ; si Dino dort encore, le
         bracelet risque d'écrire une nuit tronquée qui « finit » à l'instant de
         la demande — un faux réveil que les trois premières bornes laisseraient
         passer. Le 27 : réveil 06:07, reçu 07:05, 58 min — retenu. Une nuit sans
         heure de réception (rangée avant v2914) n'est pas crue. */
      /* ═══ 30 oct. 2026 (v2994) — L'ENDORMISSEMENT DU BRACELET, LE RÉVEIL DU CŒUR ═══════════

         Dino, le 30 au matin : « on est meilleurs là-dessus » — le RÉVEIL. Et c'est mesuré : sur
         les quatre nuits Fitcare où l'on a les trois (WHOOP, son fichier `.slep`, FLINT), le réveil
         du bracelet arrive 7 à 11 min APRÈS celui de WHOOP (28 : 07:12 / 07:01 ; 29 : 07:49 /
         07:40 — l'instant où on le lui a demandé, nuit encore ouverte ; 30 : 08:03 / 07:56), et
         le nôtre 4 à 16 min avant. Le réveil reste donc AU CŒUR, sans exception : la règle v2914
         « le bracelet peut l'avancer » n'a jamais joué sur une vraie nuit Fitcare, et elle
         donnait la main à un fichier qu'on lit parfois avant qu'il soit clos.

         L'ENDORMISSEMENT, c'est l'inverse. Nuit du 29 au 30 : de 23:52 à 00:51 Dino était couché,
         immobile, sur son téléphone, pouls 51-55. Pour le cœur, c'est du sommeil (23:52). Le
         bracelet a un accéléromètre : 00:57:43. WHOOP 00:51:58. On prend le sien QUAND IL EST
         NETTEMENT PLUS TARD que le nôtre — `bandeMin` (30 min) à `reveilBracelet` (90 min) :
           · 30 → 00:58 au lieu de 23:52 (+6 contre −60 chez WHOOP) ;
           · 27 → 01:37 au lieu de 00:39 sur la courbe réparée (WHOOP 01:28) ;
           · 29 → 00:38 contre 00:16 : 22 min seulement, on GARDE le cœur — WHOOP 00:16, le
             bracelet y avait 22 min de retard (sa nuit, lue à 07:49, était encore ouverte) ;
           · 28 → 23:54 contre 23:43 : 11 min, le cœur (WHOOP 23:49, l'un −6 et l'autre +5).
         Sous trente minutes, les deux lectures sont à l'erreur de mesure l'une de l'autre et le cœur
         a déjà sa règle des pics ; au-delà, c'est l'aveuglement connu du cœur (couché éveillé), et le
         bracelet a vu ce qu'on ne voit pas. Plus tôt que nous : jamais (aucune preuve).
         L'OCTET « VALIDE » NE COMPTE PAS ICI : le 30, le fichier se dit non valide (nuit encore
         ouverte à la lecture, 08:07), mais son endormissement est fixé depuis 00:57 — le 28, deux
         lectures (05:00 et 07:12) et le 29 trois lectures rendent le même début. Seul le réveil
         d'une nuit ouverte bouge, et on ne le prend pas.

         PUIS LE TÉLÉPHONE, QUI EST UNE BORNE, PAS UNE ESTIMATION : une minute déverrouillée n'est
         pas dormie. v2995 (revue — v2994 poussait l'endormissement jusqu'à la fin de TOUTE période
         commençant dans les 2 h, en chaîne : un coup d'œil de 20 s à 01:40 faisait passer 00:16 à
         01:45, deux à 01:30 et 03:20 donnaient 03:21) : les périodes séparées de moins de
         `telColle` (10 min — le verrouillage automatique d'un téléphone qu'on lit au lit) forment
         une SESSION ; seule une session qui CHEVAUCHE l'endormissement retenu ou commence dans les
         `telFen` (20 min) qui suivent le repousse à sa fin — une fois, sans chaîne — puis la règle
         des pics s'applique depuis là. Tout coup d'œil plus tard n'est qu'une minute ÉVEILLÉE dans
         la nuit, jamais un nouvel endormissement.

         `onsetSrc` le dit : 'bracelet' | 'telephone' | 'coeur' (| 'saisie' pour une fenêtre relue). */
      try {
        var nfB = (flsLire('watch_' + K, null) || {}).nuitFitcare;
        var hmB = function (k) { var d = new Date(t0 + k * 60000); return d.getHours() + 'h' + ('0' + d.getMinutes()).slice(-2); };
        if (nfB && +nfB.fin > 0) {
          var kF = Math.round((+nfB.fin * 1000 - t0) / 60000);
          if (kF !== fin) flsLog('nuit ' + K + ' : réveil du bracelet ' + hmB(kF) + ' NON retenu (cœur ' + hmB(fin) + ') — le réveil reste au cœur');
        }
      } catch (eB) {}
      /* ═══ 28 oct. 2026 — L'ENDORMISSEMENT : PLUS AUCUN PIC PENDANT 20 MIN ══

         Allongé, éveillé, sur son téléphone, le pouls reste « calme » à
         l'échelle d'un quart d'heure mais fait des PICS (14 sept. : 60, 65, 72
         entre 23:50 et 00:06) ; endormi, il est lisse. FLINT s'endormait au
         début du calme (−9 min de biais, 6 nuits à plus d'une heure) ; WHOOP
         attend le dernier pic. Sur les mêmes 60 nuits : écart médian 16 → 7 min,
         ≤ 10 min 23 → 35, > 60 min 6 → 2, tenu en validation croisée. Un pic =
         un pouls ≥ plancher + 10. AUCUNE exigence de NIVEAU : essayée, elle
         dépend du bracelet et cassait octobre. */
      function apresLeDernierPic(k0) {
        for (var kC = k0; kC < Math.min(k0 + p.picCap, fin - 60); kC++) {
          var nC = 0, maxC = -1;
          for (var qC = kC; qC < Math.min(N, kC + p.picFen); qC++) if (H[qC] != null) { nC++; if (!bordsDouble[qC] && H[qC] > maxC) maxC = H[qC]; }   /* 3 nov. — un bord de pouls doublé n'est pas un pic */
          if (nC >= p.picFen * 0.6 && maxC <= F + p.picCoucher) return kC;
        }
        return k0;
      }
      var aPic = apresLeDernierPic(a0);
      if (aPic !== a0) flsLog('nuit ' + K + ' : endormi après le dernier pic, ' + hmE(aPic) + ' au lieu de ' + hmE(a0));
      a0 = aPic; debutDuCoeur = a0;
      if (perT.length) {
        var sess = [], aT = a0;
        perT.slice().sort(function (x, y) { return x[0] - y[0]; }).forEach(function (iv) {
          var d = sess[sess.length - 1];
          if (d && iv[0] - d[1] <= p.telColle) d[1] = Math.max(d[1], iv[1]); else sess.push(iv.slice());
        });
        sess.forEach(function (S) { if (S[1] > a0 && S[0] < a0 + p.telFen && S[1] < fin - 60 && S[1] > aT) aT = S[1]; });
        if (aT > a0) {
          var aT2 = apresLeDernierPic(aT);
          flsLog('nuit ' + K + ' : téléphone déverrouillé jusqu\'à ' + hmE(aT) + ' — endormi à ' + hmE(aT2) + ' au plus tôt (' + hmE(a0) + ' avant)');
          a0 = aT2; srcDebut = 'telephone';
        }
      }
      /* ═══ 1er nov. 2026 — LE TÉLÉPHONE AVANT LE BRACELET ═══════════════════════════════════
         Nuit du 31 oct. au 1er nov. : le cœur croyait Dino endormi vers 02:15 (allongé, sur son
         téléphone) ; le bracelet disait 02:49, plus de 30 min après → RETENU, et le téléphone,
         déverrouillé jusqu'à 02:39, ne pouvait plus rien (sa session finissait AVANT 02:49). WHOOP :
         02:40:16 — exactement la fin du téléphone. La règle du bracelet corrige l'aveuglement du cœur
         « couché éveillé » ; quand le téléphone l'a déjà corrigé, le bracelet n'est comparé qu'à
         l'endormissement QUI EN SORT (ici 9 min : gardé au téléphone). Sans téléphone, rien ne change. */
      /* v2995 (revue) — LE FICHIER DOIT ÊTRE CELUI DE CETTE NUIT : il chevauche la fenêtre du cœur
         et finit à moins de `finBracelet` (45 min) de notre réveil (mesuré : +7 à +27). Une sieste
         ou un fichier mal daté ne déplace rien. */
      try {
        if (nfB && +nfB.debut > 0 && !window.flNuitFitcareCollee(nfB, t0 + a0 * 60000, t0 + fin * 60000)) {
          flsLog('nuit ' + K + ' : fichier du bracelet ' + hmB(Math.round((+nfB.debut * 1000 - t0) / 60000)) + '→' + hmB(Math.round((+nfB.fin * 1000 - t0) / 60000))
            + ' ignoré — ce n\'est pas cette nuit (chevauchement, ou fin à plus de ' + p.finBracelet + ' min de notre réveil)');
          nfB = null;
        }
        if (nfB && +nfB.debut > 0) {
          var kD = Math.round((+nfB.debut * 1000 - t0) / 60000);
          /* ═══ 3 nov. 2026 — LE BRACELET PLUS TÔT QUE NOUS, AUSSI ══════════════════════════════
             « Plus tôt que nous : jamais (aucune preuve) », disait la v2994. La preuve est venue la
             nuit du 2 au 3 nov. : Dino pose son téléphone à 02:01, un faux pouls (le double, 13 min)
             fait croire au cœur qu'il est éveillé jusqu'à 02:16 ; le bracelet dit 02:00, WHOOP 01:55.
             Dino : « garder l'endormissement du bracelet… et prendre notre réveil à nous ». Mesuré
             sur les 7 nuits où l'on a les trois (WHOOP, le fichier du bracelet, FLINT) :
               toujours le bracelet → 9 min d'écart moyen, 22 au pire (le 29 : 00:38 / WHOOP 00:16) ;
               la règle d'avant      → 6 min, 21 au pire (le 3 nov.) ;
               CETTE RÈGLE           → 4 min, 9 au pire.
             Puis les bords du faux pouls ont été nommés (`flPoulsDedouble`, plus haut) : le cœur seul
             lit alors 01:55 le 3 nov. (0 min de WHOOP au lieu de 6), le bracelet n'y est plus nécessaire.
             Le bracelet est pris quand il CORRIGE le cœur : nettement plus tard (30 à 90 min — couché
             éveillé, v2994), ou PLUS TÔT (jusqu'à 90 min — le cœur trompé par un artefact ou un pic),
             sauf si le téléphone a parlé : un endormissement repoussé par le téléphone est une borne,
             et un déverrouillage entre les deux prouve l'éveil. Entre 0 et 30 min plus tard, les deux
             lectures se valent et le cœur (sa règle des pics) est le plus juste. */
          var plusTot = a0 - kD, telEntre = perT.some(function (iv) { return iv[1] > kD && iv[0] < a0; });
          var bracPlusTard = kD - a0 >= p.bandeMin && kD - a0 <= p.reveilBracelet;
          var bracPlusTot = plusTot > 0 && plusTot <= p.reveilBracelet && srcDebut !== 'telephone' && !telEntre;
          if ((bracPlusTard || bracPlusTot) && kD < fin - 60) {
            flsLog('nuit ' + K + ' : endormissement du BRACELET retenu, ' + hmB(kD) + ' au lieu de ' + hmB(a0) + ' lu au '
              + (srcDebut === 'telephone' ? 'téléphone' : 'cœur') + (bracPlusTot ? ' (le bracelet s\'endort AVANT nous)' : '')
              + (nfB.valide ? '' : ' (sa nuit était encore ouverte : son début, lui, est fixé)'));
            a0 = kD; srcDebut = 'bracelet';
          } else if (kD !== a0) {
            flsLog('nuit ' + K + ' : endormissement du bracelet ' + hmB(kD) + ' NON retenu (cœur ' + hmB(a0) + ')'
              + (kD > a0 && kD - a0 < p.bandeMin ? ' — moins de ' + p.bandeMin + ' min d\'écart' : ''));
          }
        }
      } catch (eD) {}
      }   /* fin du « if (!fx) » de la v2994 */
      if (fin !== finCoeur || a0 !== debutCoeur) classer();
      var tot = fin - a0, dormi = Math.max(0, tot - eveil);
      dorm.sort(function (x, y) { return x - y; });
      var deep = 0, rem = 0, light = 0;
      if (dorm.length) {
        /* ═══ 25 oct. 2026 — LE NIVEAU NE SUFFIT PAS, IL FAUT LA RÉGULARITÉ ══
           Le découpage en quartiles du pouls forçait 25 % de sommeil profond
           PAR CONSTRUCTION, quelle que soit la nuit. Mesuré sur celle du 25 :
           159 minutes de profond quand l'app du fabricant en comptait 60 et
           WHOOP 65. Un quartile ne décrit pas un corps, il décrit un tri.

           La physiologie dit autre chose. En sommeil profond le cœur est BAS
           ET RÉGULIER — tonus vagal haut, respiration ample et stable. En
           paradoxal il remonte et devient ERRATIQUE. Deux dimensions, donc,
           pas une : le niveau et l'écart-type local.

           Mesuré sur la nuit du 25, contre les deux références :
                        FLINT   leur app   WHOOP
             profond      58       60        65
             léger       338      396       319
             paradoxal    94       75        91

           ⚠️ RÉGLÉ SUR UNE SEULE NUIT. Les seuils sont ronds et tiennent à la
           physiologie, pas à un ajustement fin — c'est ce qui limite le
           sur-apprentissage. Ils demandent confirmation sur trois ou quatre
           nuits ordinaires avant d'être tenus pour acquis. */
        var plancherP = dorm[Math.floor(dorm.length * 0.05)];
        /* ⚠️ SUR `H`, LE POULS BRUT — JAMAIS SUR `R`. `R` est une médiane
           glissante sur ±7 minutes : le lissage DÉTRUIT exactement ce qu'on
           mesure ici. Appliqué à `R`, le seuil « écart-type ≤ 2 » attrape
           presque toute la nuit (311 minutes de profond au lieu de 58) et
           « ≥ 5,5 » n'attrape plus rien (zéro paradoxal). C'est la faute déjà
           payée une fois : calibrer sur une série que le code n'utilise pas.
           Le NIVEAU se lit sur `R` (lissé, c'est ce qu'on veut pour « le cœur
           est-il bas »), la RÉGULARITÉ sur `H`. */
        function sdLocale(m) {
          var acc = [], q;
          for (q = m - 5; q <= m + 5; q++) if (H[q] != null) acc.push(H[q]);
          if (acc.length < 4) return 99;
          var moy = 0, z; for (z = 0; z < acc.length; z++) moy += acc[z];
          moy /= acc.length;
          var s2 = 0; for (z = 0; z < acc.length; z++) s2 += (acc[z] - moy) * (acc[z] - moy);
          return Math.sqrt(s2 / acc.length);
        }
        /* ═══ DEUX SEUILS, MESURÉS, ET ENCORE FAUX D'UN TIERS ═══════════════
           WHOOP, interrogé le 25 oct. : « à 55 bpm, tu peux être en sommeil
           profond, paradoxal ou éveillé immobile — c'est la combinaison des
           signaux qui permet une estimation, pas le BPM seul ». Ils ont raison,
           et leur remarque explique précisément ce qui reste faux ici.

           CE QUE ÇA A GAGNÉ, mesuré sur la nuit du 25 contre DEUX références
           indépendantes (l'app du fabricant, et WHOOP) :

                           avant    après    leur app    WHOOP
             profond        159      105        60        65
             léger          230      278       396       319
             paradoxal      107      100        75        91

           Le paradoxal tombe juste. Le profond reste haut d'environ deux fois,
           mais la règle d'avant — quartiles du pouls seul — en forçait 25 %
           PAR CONSTRUCTION quelle que soit la nuit : un quartile ne décrit pas
           un corps, il décrit un tri.

           CE QUI RESTE FAUX, ET POURQUOI ON NE LE CORRIGE PAS ENCORE. Sur cette
           nuit-là le profond trouvé tombe surtout dans le DERNIER tiers (35 min
           contre 18 au premier), alors que la physiologie le place en première
           moitié. C'est presque sûrement l'éveil calme de fin de nuit — Dino
           s'est réveillé à 01:15, a mangé, s'est douché, puis est resté immobile
           et apaisé jusqu'à 08:48. Bas et régulier, donc « profond » pour cette
           règle. C'est exactement le piège que WHOOP nomme.

           On ne le corrige PAS par un a priori temporel (« le profond est au
           début ») : ce serait régler sur une nuit d'insomnie avec changement
           d'heure, c'est-à-dire sur le pire cas qu'on ait. Il faut trois ou
           quatre nuits ordinaires d'abord. */
        /* ═══ 28 oct. 2026 — 20 % / 80 %, RÉGLÉS SUR 60 NUITS DE WHOOP ═══════
           Les totaux par stade de WHOOP (`sommeil.csv`) contre ce classement,
           sur les nuits qui ont des stades : erreur 114 → 96 min par nuit, profond
           +21 → −1 min de biais, léger −27 → +2 ; et 10 nuits « trop plates »
           de moins sur 60 (l'écart entre les seuils s'ouvre). Tenu en
           validation croisée sur les quatre découpages (103 → 88, 125 → 104,
           110 → 97, 119 → 94). Le 22 oct. : profond 195 → 98 (WHOOP 117). */
        var q1 = dorm[Math.floor(dorm.length * NUIT_COEUR.stadeProfond)];
        var q3 = dorm[Math.floor(dorm.length * NUIT_COEUR.stadeParadoxal)];
        /* ═══ 26 oct. 2026 — QUAND LE POULS NE DIT RIEN, ON NE DECOUPE PAS ═══
           Nuit du 26 : 447 minutes, DIX-SEPT valeurs distinctes, 264 minutes a
           exactement 50 bpm. Le 25e centile valait 50 et le 78e valait 51 — un
           seul battement d'ecart. Le test « <= q1 » attrapait alors 333 minutes
           et le decoupage annoncait 5 h 46 de sommeil profond sur 7 h 12.

           Ce n'est pas un defaut de classement, c'est une absence
           d'information : avec un battement d'ecart entre les quartiles, le
           pouls ne porte RIEN sur les stades, et toute methode inventera. Le
           defaut etait deja la avant la regle a deux dimensions — cette nuit
           l'a seulement revele.

           On refuse donc de decouper. L'ecran sait deja le dire : « cette nuit
           n'a pas ete decoupee minute par minute ». Mieux vaut une case vide
           qu'un chiffre fabrique — c'est la regle de la maison, et c'est aussi
           ce que Dino demande depuis le debut : on n'invente zero. */
        var quartilesUtiles = (q3 - q1) >= 3;
        for (i = a0; i < fin; i++) {
          if (etats[i - a0] === 'awake') continue;
          var vq = R[i];
          if (vq == null) { etats[i - a0] = 'light'; continue; }
          /* ═══ 26 oct. 2026 — RETOUR AU QUARTILE, ET POURQUOI ═══════════
             J'ai lu les stades sur DEUX dimensions — niveau du pouls et
             regularite locale — parce que la physiologie le dit et que WHOOP
             le confirme. Sur la nuit du 25 ca marchait : 105 minutes de
             profond contre 159 au quartile, et un paradoxal juste (100 contre
             91 chez WHOOP).

             LA NUIT DU 26 L'A DEMOLI : 336 minutes de profond sur 432, soit
             78 % de la nuit. Le pouls de Dino etait tres plat (51 bpm, peu
             d'etendue) : « proche du plancher » ET « regulier » etaient donc
             vrais PARTOUT.

             La faute est de principe, pas de reglage — des seuils ABSOLUS sur
             une grandeur dont l'etendue change d'une nuit a l'autre. WHOOP
             l'avait dit mot pour mot : « a 55 bpm tu peux etre en profond, en
             paradoxal ou eveille immobile ». J'ai retenu la combinaison et pas
             le reste de la phrase.

             Le quartile est faux dans un sens CONNU — il force 25 % de profond
             par construction la ou la realite tourne autour de 13 % — mais il
             est stable d'une nuit a l'autre. Une erreur previsible vaut mieux
             qu'une erreur qui change de camp.

             POUR FAIRE MIEUX IL FAUDRA UNE REFERENCE, et on n'en a pas : ni
             WHOOP ni la Fitcare ne font autorite, ils se contredisent de 30 bpm
             sur une seance de muscu. On ne regle pas un decoupage de stades sur
             deux capteurs optiques qui se trompent en sens inverse. Ceinture
             pectorale d'abord, puis plusieurs nuits. */
          etats[i - a0] = quartilesUtiles
            ? ((vq <= q1) ? 'deep' : (vq >= q3 ? 'rem' : 'light'))
            : 'light';
        }
        /* UN STADE NE CLIGNOTE PAS. Sans lissage, 23 des 56 segments duraient
           une ou deux minutes — du bruit de mesure présenté comme une
           architecture de sommeil. Un passage de moins de trois minutes entre
           deux voisins est absorbé. Après : 24 segments, 16 minutes de durée
           médiane, ce qu'on lit sur un vrai hypnogramme. */
        var bouge = true, tours = 0;
        while (bouge && tours < 40) {
          bouge = false; tours++;
          var g = [], c0 = null, k0;
          for (k0 = 0; k0 < etats.length; k0++) {
            if (c0 && c0.s === etats[k0]) c0.n++;
            else { c0 = { s: etats[k0], i: k0, n: 1 }; g.push(c0); }
          }
          for (k0 = 0; k0 < g.length; k0++) {
            if (g[k0].n >= 3 || g[k0].s === 'awake') continue;
            var av = k0 > 0 ? g[k0 - 1].s : null, ap = k0 + 1 < g.length ? g[k0 + 1].s : null;
            /* L'ÉVEIL N'EST NI SOURCE NI CIBLE. La frontière sommeil/éveil est
               réglée sur 31 nuits contre WHOOP (réveil 50 → 8 min) ; ce lissage
               ne décide que du stade À L'INTÉRIEUR du sommeil. Laisser l'éveil
               absorber une miette de sommeil déplaçait la durée dormie de trois
               minutes — un réglage qu'on n'a pas fait en croyant n'en faire
               aucun. */
            if (av === 'awake') av = null;
            if (ap === 'awake') ap = null;
            var cible = (av === ap) ? av : (av || ap);
            if (!cible || cible === g[k0].s) continue;
            for (var j0 = g[k0].i; j0 < g[k0].i + g[k0].n; j0++) etats[j0] = cible;
            bouge = true; break;
          }
        }
        for (i = 0; i < etats.length; i++) {
          if (etats[i] === 'deep') deep++; else if (etats[i] === 'rem') rem++;
          else if (etats[i] === 'light') light++;
        }
        eveil = 0;
        for (i = 0; i < etats.length; i++) if (etats[i] === 'awake') eveil++;
        dormi = Math.max(0, tot - eveil);
      } else {
        for (i = 0; i < etats.length; i++) if (etats[i] == null) { etats[i] = 'light'; light++; }
      }
      /* ═══ 31 oct. 2026 (v3002) — PROFOND, LÉGER, PARADOXAL : CEUX DU BRACELET ═══════════════════
         Dino, le 31 au matin, la nuit relue en entier jugée « trop plate » et AUCUN stade affiché :
         « Sommeil profond, léger, paradoxal, on n'en a rien à foutre du pouls… On reprend leur SDK
         et on prend les leurs. Ils sont là et c'est pour quelque chose. » Ça remplace la décision du
         26 oct. (« nos propres stades », index.html, lecteur de la nuit du bracelet).
         Le pouls du Fitcare est quantifié : la règle des quartiles (q3 − q1 ≥ 3) refusait de
         découper, ou rendait un profond figé vers 135 min quelle que soit la nuit. Le bracelet, lui,
         livre chaque nuit son hypnogramme (`.slep`, une tranche par minute) ; ses codes sont PROUVÉS
         par le résumé du même fichier le 31 (profond 81 · léger 260 · paradoxal 159 ↔ codes
         3:81 · 2:260 · 1:159) : 0 éveil · 1 paradoxal · 2 léger · 3 profond.
         CE QUI RESTE À FLINT : les BORNES de la nuit (endormissement du bracelet ou du téléphone,
         réveil au cœur — réglés sur WHOOP) et l'ÉVEIL lu au cœur (le bracelet n'en voit presque
         jamais : 0 min le 31, 0 le 28 et le 30, WHOOP 28-43). Dans le sommeil de FLINT, chaque minute
         prend le stade du bracelet ; une minute que son hypnogramme ne couvre pas garde le sien
         (léger s'il n'en a pas). Seulement si la nuit du bracelet COLLE à celle de FLINT
         (`flNuitFitcareCollee`) et en couvre au moins une heure. Banc : tests/test-stades-bracelet.js. */
      var stadesBracelet = false;
      try {
        var wSB = flsLire('watch_' + K, null) || {}, nfSB = wSB.nuitFitcare;
        if (/fitcare/.test(String(wSB.marque || '')) && nfSB && Array.isArray(nfSB.hypno) && nfSB.hypno.length >= 60
            && +nfSB.fin > +nfSB.debut && window.flNuitFitcareCollee(nfSB, t0 + a0 * 60000, t0 + fin * 60000)) {
          var pasSB = (+nfSB.fin - +nfSB.debut) / nfSB.hypno.length, CODE_SB = { 0: 'awake', 1: 'rem', 2: 'light', 3: 'deep' }, nSB = 0;
          /* ═══ 1er nov. 2026 — NOS STADES D'ABORD (Dino : « on garde nos stades alors ») ═══
             La nuit du 31 oct. au 1er nov. contre WHOOP (export du jour) : profond FLINT 1h42 ·
             WHOOP 1h28 · BRACELET 0h38 ; paradoxal 1h15 · 0h56 · 1h05 ; léger 2h09 · 2h38 · 3h33.
             Le bracelet coupe le profond de moitié — déjà le 27 (0h39/1h28) et le 31 (1h21/2h01).
             Quand le pouls se découpe (`quartilesUtiles`), on garde NOS stades et on ne prend du
             bracelet que l'éveil qu'il diagnostique (v3006). Ses stades ne servent plus qu'au REPLI :
             un pouls trop plat pour être découpé (la nuit relue de sa seule mémoire, au pas de la
             minute) — mieux que « aucun stade », la plainte du 31 au matin. */
          if (quartilesUtiles) CODE_SB = { 0: 'awake' };
          /* v3006 — LES RÉVEILS QUE LE BRACELET DIAGNOSTIQUE SONT COMPTÉS AUSSI (Dino, 31 oct. : « quand
             il y a des pics cardiaques, nous, on l'interprète en réveil, eux, non. Mais quand ils nous
             disent qu'un réveil est diagnostiqué, on le met. ») Il sent le MOUVEMENT, que FLINT ne reçoit
             pas : un réveil de 30 min immobile, au pouls calme, c'est lui qui le voit. L'éveil est donc
             l'UNION : lu au cœur par FLINT (les micro-réveils) OU marqué par le bracelet (code 0). */
          for (i = 0; i < etats.length; i++) {
            if (etats[i] === 'awake') continue;
            var kSB = Math.floor(((t0 + (a0 + i) * 60000) / 1000 + 30 - +nfSB.debut) / pasSB);
            var stSB = (kSB >= 0 && kSB < nfSB.hypno.length) ? CODE_SB[nfSB.hypno[kSB]] : null;
            if (stSB) { etats[i] = stSB; nSB++; }
          }
          if (quartilesUtiles && nSB > 0) {
            /* Nos stades, l'éveil du bracelet en plus : on recompte, la source reste « coeur ». */
            deep = 0; rem = 0; light = 0; eveil = 0;
            for (i = 0; i < etats.length; i++) {
              if (etats[i] == null) etats[i] = 'light';
              if (etats[i] === 'deep') deep++; else if (etats[i] === 'rem') rem++; else if (etats[i] === 'light') light++; else if (etats[i] === 'awake') eveil++;
            }
            dormi = Math.max(0, tot - eveil);
          } else if (!quartilesUtiles && nSB >= 60) {
            stadesBracelet = true;
            deep = 0; rem = 0; light = 0; eveil = 0;
            for (i = 0; i < etats.length; i++) {
              if (etats[i] == null) etats[i] = 'light';
              if (etats[i] === 'deep') deep++; else if (etats[i] === 'rem') rem++; else if (etats[i] === 'light') light++; else if (etats[i] === 'awake') eveil++;
            }
            dormi = Math.max(0, tot - eveil);
          }
        }
      } catch (eSB) {}
      /* Le découpage que le graphe dessine : minutes consécutives de même stade
         fondues en un segment, `startMin` compté depuis le début de la nuit —
         la convention de `slStageSegs2` et de la nuit mesurée. */
      var stages = [], curSt = null;
      for (i = 0; i < etats.length; i++) {
        var st = etats[i] || 'light';
        if (curSt && curSt.stage === st) curSt.durMin++;
        else { curSt = { stage: st, startMin: i, durMin: 1 }; stages.push(curSt); }
      }
      /* ═══ 26 oct. 2026 — CETTE FONCTION PROPOSE PARFOIS UNE APRÈS-MIDI ══════

         À 21 h, après l'arrivée de la mémoire du bracelet Fitcare, elle a rendu
         « 10 h 00 → 12 h 30, 105 minutes de sommeil » pour l'après-midi de
         Dino — lui éveillé, le bracelet posé sur un bureau une partie du temps.
         L'accueil lui a demandé de valider une nuit qu'il n'avait pas faite.

         RIEN NE L'ÉCRIT PLUS : `flNuitRecouper` refuse (index.html, v2906, et
         vérifié en rejouant la base réelle du téléphone — « aucune nuit
         écrite », avec force comme sans). Mais la proposition reste fausse, et
         c'est ICI qu'il faudra la refuser.

         J'AI POSÉ UN GARDE DE DISPERSION ET JE L'AI RETIRÉ, parce qu'il ne
         mordait pas. Les chiffres, pour qui reprendra :

           · sur la série BRUTE de `watch_.hr`, la part de valeurs distinctes
             sépare bien : 0,06 à 0,17 sur trente nuits mesurées de Dino,
             0,32 sur la proposition fautive ;
           · mais cette fonction travaille sur `R`, sa série LISSÉE à la minute,
             où la proposition tombe à 0,20 — et je n'ai pas réussi à mesurer
             les trente nuits dans CETTE grandeur pour savoir si un seuil les
             garderait toutes.

         Un seuil posé sur une grandeur et calibré sur une autre est un garde
         qui rassure sans protéger. Cette note vaut mieux que ce faux garde.

         ET TROIS AUTRES PISTES, MESURÉES PUIS REJETÉES :
           · la durée — la fausse faisait 235 min, et la v2059 accepte
             volontairement un sommeil court hors plage nocturne, pour le
             travail de nuit (`dureeNuitEvidente`) ;
           · l'efficacité — la nuit du 25 septembre, bien réelle, est à 68 % ;
           · médiane − plancher — 3 à 11 sur les vraies nuits, 10 sur la
             fausse : les deux se chevauchent, il n'y a pas de seuil.

         LA PISTE LA PLUS SOLIDE EST L'HEURE : les trente vraies nuits de la
         base commencent entre 22 h 32 et 05 h 36, celle-là commence à 10 h.
         `flsClasser` ferme déjà sa plage nocturne à 10 h — c'est
         `dureeNuitEvidente`, le dernier recours du travail de nuit, qui l'a
         laissée passer. C'est lui qu'il faut resserrer, et il faut de vraies
         nuits de travailleur de nuit pour le faire sans casser son cas. */
      var bed = new Date(t0 + a0 * 60000), wake = new Date(t0 + fin * 60000);
      /* ═══ 25 oct. 2026 — LES DEUX INSTANTS ABSOLUS, SANS QUOI LA RESPIRATION
         N'EXISTE PAS. `flRespirationNuit` s'arrête à sa troisième ligne sur
         `n.sleepStart == null` : elle a besoin d'INSTANTS, pas de minutes du
         jour, pour choisir les blocs de battements qui tombent dans la nuit.
         Cette fonction ne rendait que `bedMin` / `wakeMin` — donc la
         respiration, l'un des quatre signaux de la récupération, était
         silencieusement impossible sur toute nuit lue au cœur. Vérifié le 25 :
         `flRespirationNuit` rendait `null`, et personne ne pouvait savoir
         pourquoi. */ 
      return { K: wake.getFullYear() + '-' + (wake.getMonth() + 1) + '-' + wake.getDate(),
               sleepStart: bed.getTime(), sleepEnd: wake.getTime(),
               sleepMin: dormi, timeInBed: tot,
               bedMin: bed.getHours() * 60 + bed.getMinutes(), wakeMin: wake.getHours() * 60 + wake.getMinutes(),
               deep: (quartilesUtiles || stadesBracelet) ? deep : null,
               rem:  (quartilesUtiles || stadesBracelet) ? rem  : null,
               light: (quartilesUtiles || stadesBracelet) ? light : null,
               awake: eveil,
               stages: (quartilesUtiles || stadesBracelet) ? stages : null,
               stadesIndetermines: !(quartilesUtiles || stadesBracelet),
               stadesSource: stadesBracelet ? 'bracelet' : (quartilesUtiles ? 'coeur' : null),   /* v3002 */
               lowestHr: dorm.length ? dorm[0] : null,
               plancher: F, couverture: Math.round(couv * 100), lecteur: 'coeur', _est: true,
               onsetSrc: srcDebut, reveilSrc: fx ? 'saisie' : 'coeur', bedMinCoeur: (function () { var x = new Date(t0 + debutDuCoeur * 60000); return x.getHours() * 60 + x.getMinutes(); })(),
               entrees: window.flNuitEntrees(K, wake.getTime()),
               /* v3001 — CE QUE LA NUIT A LU, ET UN RÉVEIL AU BORD D'UN TROU (voir flNuitAttendDesDonnees). */
               minutesLues: window.flNuitMinutesLues(K, bed.getTime(), wake.getTime(), borne),
               reveilBordTrou: (function () {
                 for (var z = fin + 1; z <= Math.min(N - 1, fin + 15); z++) if (H[z] != null) return false;
                 for (z = fin + 16; z < N; z++) if (H[z] != null) return true;
                 /* 31 oct. 2026 — ET APRÈS LA FENÊTRE DE LECTURE (14:00). Un téléphone revenu
                    l'après-midi rend ses minutes après elle : sans les regarder, un réveil posé au
                    bout du dernier paquet de la mémoire n'était jamais « au bord d'un trou ». */
                 var wB = flsLire('watch_' + K, null) || {}, hB = Array.isArray(wB.hr) ? wB.hr : [], mR = t0 + fin * 60000, ret = false;
                 for (var y = 0; y < hB.length; y++) {
                   var xB = hB[y]; if (!xB || xB[0] == null || !(+xB[1] > 0)) continue;
                   var mB = minuit + xB[0] * 60000;
                   if (mB < t0 + N * 60000 || mB > lim) continue;
                   if (mB <= mR + 15 * 60000) return false;
                   ret = true;
                 }
                 return ret;
               })(),
               donneesJusqua: (function () { for (var z = N - 1; z >= 0; z--) if (H[z] != null) return t0 + z * 60000; return null; })() };
    } catch (e) { try { flsLog('nuit lue au cœur : ' + e.message); } catch (e2) {} return null; }
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


/* ═══ 30 oct. 2026 (v2994) — UN POULS SANS BATTEMENTS N'EST PAS UN POULS ═══════════════════════

   LA NUIT DU 29 AU 30, 01:38 → 02:00. Le bracelet annonce 57 → 77 → 94 → 102 → 114, puis un
   plateau de 105-110 pendant vingt minutes, puis 54 en une minute. WHOOP, au même poignet
   voisin : un pouls de dormeur. Ce que le bracelet envoyait pendant ces 22 minutes, relu trame
   par trame dans le journal du téléphone :
     · ZÉRO intervalle R-R — la nuit, 3 à 7 trames par minute en portent d'ordinaire (01:20-01:37 :
       4 à 7 par minute ; la dernière à 01:37:56, la suivante plausible à 02:04:05) ;
     · la peau qui refroidit, photo après photo : 35,6 °C (01:38) → 35,2 → 34,6 → 34,4 → 34,1 →
       34,0 → 33,9 (01:55) → 33,9 : le bracelet avait glissé ;
     · aucun pas : le compteur de l'heure de ses photos reste absent (zéro) de 01:20 à 02:04 ;
     · un retour EN FALAISE : 104 à 01:59:59, 73 à 02:00:29, 54 à 02:00:59 — avant même que le
       moindre R-R revienne. Un cœur qui a monté à 110 pour de vrai redescend en plusieurs minutes.
   Ce n'était pas un cœur, c'était un capteur sans peau qui extrapolait.

   LA RÈGLE, ET TOUTES SES CONDITIONS SONT EXIGÉES (Dino : sa cuisine est au 4e étage — un vrai
   pouls d'escalier, la nuit, ne doit JAMAIS être nettoyé) :
     ① AUCUN R-R PLAUSIBLE sur toute la plage, au moins `min` (12) minutes. Un bloc `rrH` de la
        minute est plausible s'il porte au moins 3 intervalles et que leur médiane dit le même
        pouls que la minute à ± 20 % (le 30 à 01:38, 8 intervalles à ~1 100 ms — 54 bpm — sous un
        « 77 » : ils ne décrivent pas ce chiffre) ;
     ② UNE DÉRIVE : au-dessus de la base (médiane des 5 dernières minutes à R-R plausibles dans
        les 30 min d'avant, et des 5 premières dans les 30 min d'après) de plus de `derive` (25)
        bpm, sur au moins 60 % de la plage ; la plage s'étend aux minutes encore à + `bord` (10) ;
     ③ AUCUN PAS : ni l'iPhone (`sante_.pas`, blocs de 5 min), ni le bracelet (`actDet`), et ses
        deux compteurs de l'heure — sa mémoire (`pasHeure`) et sa photo (`pasPhoto`, v2994) — ne
        doivent pas monter ;
     ④ LA PEAU PERDUE, ET LA FALAISE — LES DEUX (v2996, seconde revue) : la peau des photos
        (`tempPhoto`) qui chute d'au moins 1 °C sous le maximum des 30 min d'avant, ET une chute du
        palier à la base + 10 en UNE minute. Seule, la peau prenait 1 à 5 réveils agités injectés
        sur 34-40 (la peau d'une vraie nuit varie de plus de 1 °C) ; ensemble : 0. LIMITE CONNUE :
        le faux 110 du 30 n'est plus pris sur la base RANGÉE — sa chute (104 à 01:59:59, 54 à
        02:00:59 dans les trames) chevauche une frontière de minute, et la mémoire du bracelet range
        105 → 69 → 56. `falaiseMarche: 1` (une minute de transition) avec `falaiseBase: 5` la
        prendrait, au prix d'un réveil agité sur 148 au balayage : décision laissée à Dino ;
     ⑤ LA NUIT (22:00 → 08:00) : c'est là que le capteur glisse sans qu'on le sache et qu'aucune
        séance ne se joue. Le jour, sur les mêmes données, la règle sans cette borne prenait trois
        plages que rien ne prouve fausses (le 28 à 08:32, une activité ; le 29 à 13:37 et 16:00) —
        les pas du jour sont trop mal comptés (photos espacées, iPhone posé) pour les défendre.

   MESURÉ sur toutes les données rangées du 23 au 30 oct. (base du téléphone du 30 au matin) :
   49 plages sans R-R plausible avec au moins 3 minutes de dérive ; la règle en prend UNE — le
   30, 01:38 → 02:00 (23 min, base 54, peau −1,2 °C sur les photos rangées, falaise 49 bpm). Le
   football du 29 (18:57-20:12) et la musculation (12:20-13:14) : rien (des pas, et le jour).
   Au plus près sous le seuil, la nuit : le 30 à 00:18 (9 min, téléphone en main au lit) — la
   borne des 12 minutes la laisse, et ses R-R disaient d'ailleurs 56 sous un « 113 ».

   CE QUI EN EST FAIT : la plage devient une fenêtre de QUARANTAINE de la v2990 (`flRetraitNoter`,
   flint-porte.js), raison `sansBattements`, id négatif (−minute de début), statut `fermee`. Ses
   minutes quittent `hr` pour `hrMasque` — la nuit, ses stades, son éveil, la courbe, les normales
   ne les voient plus — et REVIENNENT si une relecture ne les juge plus fausses (statut `retiree`).
   La règle relit `hr` ET ses propres minutes en quarantaine : rejouée cent fois, elle rend la
   même fenêtre. Elle tourne à chaque arrivée de pouls (mémoire du bracelet, journal de nuit, nuit
   du bracelet), et une fois par version sur les trois dernières nuits — c'est ce qui nettoie la
   nuit du 30, déjà rangée et scellée à la main. Banc : tests/test-sans-battements.js. */
(function () {
  var SB = { min: 12, derive: 25, bord: 10, part: 0.6, base: 5, baseFen: 30, peau: 1.0, falaise: 30,
             nuitDebut: -120, nuitFin: 480, rrMin: 3, rrTol: 0.2,
             falaiseMarche: 0, falaiseBase: 10 };
  window.flSansBattementsReglages = SB;
  function lire(cle) { try { var v = localStorage.getItem(cle); return v ? JSON.parse(v) : null; } catch (e) { return null; } }
  function cleDe(d) { return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); }
  function jourDecale(K, n) { var q = String(K).split('-'); return cleDe(new Date(+q[0], +q[1] - 1, +q[2] + n)); }
  function msDe(K, t) { var q = String(K).split('-'); return new Date(+q[0], +q[1] - 1, +q[2], 0, t).getTime(); }
  function log(m) { try { console.log('[sommeil] ' + m); } catch (e) {} }
  function hhR(t) { var x = ((t % 1440) + 1440) % 1440; return Math.floor(x / 60) + 'h' + ('0' + (x % 60)).slice(-2); }

  /* La matière de la nuit qui finit le jour K, en minutes relatives à SON minuit : de 20:00 la
     veille (−240) à 10:00 (600). */
  function matiere(K) {
    var Kv = jourDecale(K, -1), M = { V: {}, rr: {}, pas: {}, ph: [], pp: [], tp: [] };
    [[Kv, -1440, 20 * 60, 1440], [K, 0, 0, 10 * 60]].forEach(function (j) {
      var D = j[0], dec = j[1], a = j[2], b = j[3];
      var w = lire('watch_' + D) || {};
      var dans = function (m) { return m != null && m >= a && m < b; };
      (Array.isArray(w.hr) ? w.hr : []).forEach(function (x) { if (x && dans(x[0]) && +x[1] > 0) M.V[x[0] + dec] = +x[1]; });
      (Array.isArray(w.hrMasque) ? w.hrMasque : []).forEach(function (x) {
        if (x && +x[2] < 0 && dans(x[0]) && +x[1] > 0 && M.V[x[0] + dec] == null) M.V[x[0] + dec] = +x[1];
      });
      (Array.isArray(w.rrH) ? w.rrH : []).forEach(function (x) {
        if (!x || !dans(x[0]) || !Array.isArray(x[1])) return;
        var s = x[1].filter(function (r) { return r > 0; }).sort(function (u, v) { return u - v; });
        M.rr[x[0] + dec] = { n: s.length, med: s.length ? s[s.length >> 1] : null };
      });
      (Array.isArray(w.pasHeure) ? w.pasHeure : []).forEach(function (x) { if (x && dans(x[0])) M.ph.push([x[0] + dec, +x[1] || 0]); });
      (Array.isArray(w.pasPhoto) ? w.pasPhoto : []).forEach(function (x) { if (x && dans(x[0])) M.pp.push([x[0] + dec, +x[1] || 0]); });
      var tps = (Array.isArray(w.tempPhoto) ? w.tempPhoto : []).concat((w.masques && Array.isArray(w.masques.tempPhoto)) ? w.masques.tempPhoto : []);
      tps.forEach(function (x) { if (x && dans(x[0]) && +x[1] > 0) M.tp.push([x[0] + dec, +x[1]]); });
      (Array.isArray(w.actDet) ? w.actDet : []).forEach(function (B) {
        var cs = (B && Array.isArray(B[3])) ? B[3] : null; if (!cs) return;
        var d0 = new Date(+B[0] * 1000), m0 = d0.getHours() * 60 + d0.getMinutes(), Kb = cleDe(d0);
        var decB = (Kb === D) ? dec : (Kb === jourDecale(D, 1) ? dec + 1440 : null);
        if (decB == null) return;
        for (var c = 0; c < cs.length; c++) if (+cs[c] > 0) M.pas[m0 + c + decB] = (M.pas[m0 + c + decB] || 0) + (+cs[c]);
      });
      var sa = lire('sante_' + D) || {};
      (Array.isArray(sa.pas) ? sa.pas : []).forEach(function (x) {
        if (!x || !(+x[1] > 0) || x[0] == null) return;
        for (var f = 0; f < 5; f++) if (dans(x[0] + f)) M.pas[x[0] + f + dec] = (M.pas[x[0] + f + dec] || 0) + (+x[1]) / 5;
      });
    });
    M.ph.sort(function (u, v) { return u[0] - v[0]; });
    M.pp.sort(function (u, v) { return u[0] - v[0]; });
    try {
      var nK = (lire('watch_' + K) || {}).night;
      if (nK && +nK.sleepStart > 0 && +nK.sleepEnd > +nK.sleepStart) M.nuit = [+nK.sleepStart, +nK.sleepEnd];
      else if (typeof window.flNuitDuCoeur === 'function') { var c = window.flNuitDuCoeur(K, Date.now()); if (c) M.nuit = [c.sleepStart, c.sleepEnd]; }
    } catch (e) {}
    M.tp.sort(function (u, v) { return u[0] - v[0]; });
    return M;
  }

  window.flSansBattements = function (K) {
    var out = { K: K, fenetres: [], plages: [] };
    try {
      var M = matiere(K), V = M.V;
      var rrOk = function (t) {
        var b = M.rr[t]; if (!b || b.n < SB.rrMin || !b.med) return false;
        return V[t] == null || Math.abs(60000 / b.med - V[t]) <= SB.rrTol * V[t];
      };
      var ts = Object.keys(V).map(Number).sort(function (a, b) { return a - b; });
      if (!ts.length) return out;
      var plages = [], run = [], trou = 0;
      for (var t = ts[0]; t <= ts[ts.length - 1] + 1; t++) {
        if (V[t] != null && !rrOk(t)) { run.push(t); trou = 0; }
        else if (V[t] == null && run.length && trou < 2 && !rrOk(t)) { trou++; }
        else { if (run.length) plages.push(run); run = []; trou = 0; }
      }
      if (run.length) plages.push(run);
      plages.forEach(function (r) {
        var a = r[0], b = r[r.length - 1], av = [], ap = [], x;
        for (x = a - 1; x >= a - SB.baseFen && av.length < SB.base; x--) if (V[x] != null && rrOk(x)) av.push(V[x]);
        for (x = b + 1; x <= b + SB.baseFen && ap.length < SB.base; x++) if (V[x] != null && rrOk(x)) ap.push(V[x]);
        if (av.length < 2 || av.length + ap.length < 3) return;
        var base = av.concat(ap).sort(function (u, v) { return u - v; });
        var B = base.length % 2 ? base[base.length >> 1] : (base[base.length / 2 - 1] + base[base.length / 2]) / 2;
        var der = r.filter(function (y) { return V[y] != null && V[y] > B + SB.derive; });
        if (!der.length) return;
        var s = der[0], e = der[der.length - 1];
        while (s - 1 >= a && V[s - 1] != null && V[s - 1] > B + SB.bord) s--;
        while (e + 1 <= b && V[e + 1] != null && V[e + 1] > B + SB.bord) e++;
        var L = e - s + 1, nd = der.filter(function (y) { return y >= s && y <= e; }).length;
        var pasI = 0; for (x = s - 2; x <= e + 2; x++) pasI += (M.pas[x] || 0);
        /* Les deux compteurs du bracelet (sa mémoire horaire, sa photo) : remis à zéro à chaque
           heure, ils ne doivent pas MONTER dans la plage — comparé à leur valeur précédente de la
           même heure, ou à zéro si l'heure commence dans la plage. */
        /* v2995 (revue) — LES COMPTEURS DU BRACELET. Sa mémoire horaire (`pasHeure`) : chaque case
           porte une heure dont on ne sait pas si elle est datée au début ou à la fin — toute case
           NON NULLE qui peut CHEVAUCHER la plage la refuse. Sa photo (`pasPhoto`, versée toutes
           les 10 min) : remise à zéro chaque heure, elle ne doit pas monter de la plage à 10 min
           après — comparée à la photo précédente de la même heure, ou à zéro. */
        var monte = null;
        M.ph.forEach(function (p) {
          if (!monte && p[1] > 0 && p[0] - 60 <= e && p[0] + 60 > s) monte = 'case de l\'heure ' + hhR(p[0]) + ' : ' + p[1] + ' pas';
        });
        M.pp.forEach(function (p, i) {
          if (monte || p[0] < s || p[0] > e + 10) return;
          var h = Math.floor((p[0] + 1440) / 60), prev = (i > 0 && Math.floor((M.pp[i - 1][0] + 1440) / 60) === h) ? M.pp[i - 1] : null;
          if (prev ? p[1] > prev[1] : p[1] > 0) monte = 'photo +' + (prev ? p[1] - prev[1] : p[1]) + ' pas à ' + hhR(p[0]);
        });
        /* LA PEAU : le maximum des 30 min d'avant, photo du début comprise (01:38 : 35,6), contre le
           minimum de la plage. */
        var avT = M.tp.filter(function (p) { return p[0] >= s - 30 && p[0] <= s; }).map(function (p) { return p[1]; });
        var dansT = M.tp.filter(function (p) { return p[0] >= s && p[0] <= e + 2; }).map(function (p) { return p[1]; });
        var chute = (avT.length && dansT.length) ? Math.round((Math.max.apply(null, avT) - Math.min.apply(null, dansT)) * 10) / 10 : null;
        /* v2995 (revue) — UNE VRAIE FALAISE : du PALIER (à 10 bpm de sa médiane) à la base + 10 en
           UNE minute. La v2994 comparait deux minutes à deux minutes : un réveil agité au lit qui
           retombe de 30 bpm en trois minutes passait (le relecteur l'a injecté : mis en quarantaine). */
        var palier = der.map(function (y) { return V[y]; }).sort(function (u, v) { return u - v; });
        var P = palier[palier.length >> 1];
        /* d : la dernière minute du PALIER (à 10 bpm de sa médiane) ; la falaise est la chute de d à la
           base + `falaiseBase` en UNE minute (`falaiseMarche` minute(s) de transition admises). */
        var d = e; while (d > s && !(V[d] != null && V[d] >= P - 10)) d--;
        var apresF = V[d + 1 + SB.falaiseMarche];
        var falaise = (V[d] != null && apresF != null) ? V[d] - apresF : null;
        var chuteRapide = falaise != null && V[d] >= P - 10 && apresF <= B + SB.falaiseBase;
        var raisons = [];
        if (L < SB.min) raisons.push(L + ' min < ' + SB.min);
        if (nd < SB.part * L) raisons.push('dérive sur ' + nd + '/' + L + ' min');
        /* v2995 (revue) — DANS LA NUIT LUE, pas dans une plage d'horloge. */
        var dMs = msDe(K, s), fMs = msDe(K, e + 1);
        if (!M.nuit) raisons.push('aucune nuit lue');
        else if (dMs < M.nuit[0] || fMs > M.nuit[1]) raisons.push('hors de la nuit (' + new Date(M.nuit[0]).toTimeString().slice(0, 5) + '→' + new Date(M.nuit[1]).toTimeString().slice(0, 5) + ')');
        if (pasI > 0) raisons.push(Math.round(pasI) + ' pas');
        if (monte) raisons.push('compteur de pas ' + monte);
        var peau = chute != null && chute >= SB.peau;
        if (!peau || !chuteRapide) raisons.push((!peau && !chuteRapide ? 'aucun signe de peau perdue' : (!peau ? 'la peau ne chute pas' : 'pas de falaise d\'une minute'))
          + ' (peau ' + (chute == null ? '?' : '−' + chute + ' °C') + ', retour ' + (falaise == null ? '?' : V[d] + '→' + apresF) + ')');
        var pl = { debut: s, fin: e + 1, minutes: L, derive: nd, base: B, max: Math.max.apply(null, der.map(function (y) { return V[y]; })), pas: Math.round(pasI),
                   chutePeau: chute, falaise: falaise, retenue: !raisons.length, refus: raisons };
        out.plages.push(pl);
        if (raisons.length) return;
        out.fenetres.push({ debut: Math.round(msDe(K, s) / 1000), fin: Math.round(msDe(K, e + 1) / 1000), raison: 'sansBattements',
                            preuve: 'aucun R-R ' + L + ' min, base ' + B + ' → ' + pl.max
                              + (peau ? ', peau −' + chute + ' °C' : '') + (chuteRapide ? ', retour ' + V[d] + '→' + apresF + ' en une minute' : '') });
      });
    } catch (e) { out.panne = e.message; }
    return out;
  };

  /* v2995 (revue) — le sceau du matin (`nuitFige_`) suit une nuit que le moteur vient de changer,
     dans le même appel (plus de « Tu t'es rendormi ? » sur un endormissement corrigé).
     v2996 (seconde revue) — À BAS PRIX ET SUR L'ENDORMISSEMENT SEULEMENT. La v2995 recalculait
     toutes les nuits (`flintSommeilRecalculer`, ~0,4 s) à chaque retour dans l'app AVANT de
     comparer, puis rescellait TOUTE différence — réveil compris : un vrai retour au lit après le
     sceau était rescellé en silence, et la réouverture n'avait jamais lieu. Désormais :
       · on compare d'abord la nuit RANGÉE au sceau, sans rien recalculer ;
       · si le réveil a bougé de plus de 5 min, on ne touche à rien : c'est la réouverture
         (« Tu t'es rendormi ? ») qui doit le dire ;
       · on ne rescelle que si l'ENDORMISSEMENT diffère (fichier du bracelet, téléphone) — ou, pour
         la quarantaine `sansBattements`, si le contenu (dormi, éveil) diffère à bornes égales ;
       · le réveil scellé est GARDÉ tel quel. */
  function rescellerSiBesoin(K, cause) {
    try {
      var f = (typeof window.flNuitFigee === 'function') ? window.flNuitFigee(K) : null;
      if (!f || f.asleep == null || f.bedMin == null || f.wakeMin == null || typeof window.flNuitResceller !== 'function') return null;
      var n = (lire('watch_' + K) || {}).night;
      if (!n || n.bedMin == null || n.wakeMin == null) return null;
      var circ = function (a, b) { var x = Math.abs(a - b) % 1440; return Math.min(x, 1440 - x); };
      var dDebut = circ(n.bedMin, f.bedMin), dFin = circ(n.wakeMin, f.wakeMin);
      if (dFin > 5) { log('nuit ' + K + ' : le réveil a bougé de ' + dFin + ' min depuis le sceau — pas de rescellement (' + cause + '), la réouverture décidera'); return null; }
      var contenu = (cause === 'sansBattements') && (n.sleepMin !== f.asleep || n.awake !== f.awake);
      if (!dDebut && !contenu) return null;
      try { if (typeof window.flintSommeilRecalculer === 'function') window.flintSommeilRecalculer(); } catch (e) {}
      var rs = window.flNuitResceller(K, cause);
      if (rs && rs.ok) {
        var g = window.flNuitFigee(K);
        if (g && g.wakeMin !== f.wakeMin) {
          g.wakeMin = f.wakeMin;
          try { if (typeof DB !== 'undefined' && DB && DB.set) DB.set('nuitFige_' + K, g); else localStorage.setItem('nuitFige_' + K, JSON.stringify(g)); } catch (e) {}
        }
      }
      log('nuit ' + K + ' : sceau ' + (rs && rs.ok ? 'réécrit' : 'inchangé') + ' (' + cause + ') — endormissement ' + f.bedMin + '→' + n.bedMin + ', réveil gardé ' + f.wakeMin);
      return rs;
    } catch (e) { return null; }
  }
  window.flNuitRescellerSiBesoin = rescellerSiBesoin;

  /* Range les fenêtres de la nuit K dans la quarantaine de la v2990 — et rend celles qu'une
     relecture ne juge plus fausses. */
  window.flSansBattementsAppliquer = function (K) {
    try {
      if (typeof window.flRetraitNoter !== 'function' || typeof window.flRetraitFenetres !== 'function') return 0;
      var r = window.flSansBattements(K);
      if (r.panne) return 0;
      var a = msDe(K, -240) / 1000, b = msDe(K, 600) / 1000;
      var neuves = r.fenetres.map(function (f) {
        return { id: -Math.round(f.debut / 60), debut: f.debut, fin: f.fin, raison: 'sansBattements', statut: 'fermee', preuve: f.preuve };
      });
      var ids = {}; neuves.forEach(function (f) { ids[f.id] = 1; });
      window.flRetraitFenetres().forEach(function (f) {
        if (f && f.raison === 'sansBattements' && +f.debut >= a && +f.debut < b && !ids[f.id] && f.statut !== 'retiree')
          neuves.push({ id: f.id, debut: f.debut, fin: f.fin, raison: 'sansBattements', statut: 'retiree', preuve: 'relue : plus de signature' });
      });
      if (!neuves.length) return 0;
      var n = window.flRetraitNoter({ fenetres: neuves });
      if (n) {
        neuves.forEach(function (f) {
          var d = new Date(f.debut * 1000), g = new Date(f.fin * 1000);
          log('nuit ' + K + ' : pouls SANS BATTEMENTS ' + d.getHours() + 'h' + ('0' + d.getMinutes()).slice(-2) + '→'
            + g.getHours() + 'h' + ('0' + g.getMinutes()).slice(-2) + ' — ' + (f.statut === 'retiree' ? 'rendu' : 'en quarantaine (' + f.preuve + ')'));
        });
        /* v2995 (revue) — LE SCEAU SUIT, TOUT DE SUITE ET DANS LE MÊME APPEL. Laissée pour plus tard,
           une nuit scellée qui change était vue par `flNuitPasse` comme « recollée » : la seule
           réouverture du jour partait, et « Tu t'es rendormi ? » s'affichait. Rescellée ici, la nuit
           et son sceau ne divergent jamais — et un rescellement n'est pas une réouverture. */
        var rel = null; try { rel = window.flNuitRelireScellee(K); } catch (e) {}
        if (!rel) rescellerSiBesoin(K, 'sansBattements');
      }
      return n;
    } catch (e) { return 0; }
  };

  /* ═══ UNE NUIT SCELLÉE À LA MAIN SE RELIT AUSSI ═══════════════════════════════════════════
     Le 30 au matin, Dino a placé l'endormissement à 00:58 au curseur de « Ta nuit est là » et
     validé (`source:'manuel'`, sceau `nuitFige_` « manuel », 08:15:57). La fenêtre est À LUI :
     on n'y touche pas. Mais ses stades et son éveil avaient été lus avec le faux plateau de
     01:38 — 22 minutes « éveillées » — et `flNuitRecouper` ne relit jamais une nuit saisie. Ici,
     quand ce que la nuit a lu a changé (`entrees`), on relit SA fenêtre au cœur (`flNuitDuCoeur`
     avec `fenetre`), on rend les stades au re-staging, puis on réécrit le sceau depuis la nuit
     relue (`flNuitResceller`, cause « relue ») : l'écran, qui ressert le sceau, suit. La
     récupération scellée ne bouge pas — un score ne change pas l'après-midi (Dino, 25 sept.). */
  window.flNuitRelireScellee = function (K) {
    try {
      var vivant = typeof window.flJourMontre === 'function' && typeof window.wSaveK === 'function';
      var w = vivant ? window.flJourMontre(K) : lire('watch_' + K);
      var n = w && w.night;
      if (!n || n.source !== 'manuel' || !(+n.manuelStart > 0 && +n.manuelEnd > +n.manuelStart)) return null;
      if (n.lecteur !== 'coeur' && !/fitcare/.test(String(w.marque || ''))) return null;
      var ent = window.flNuitEntrees(K);
      if (n.entrees === ent) return null;
      var r = window.flNuitDuCoeur(K, Math.max(Date.now(), +n.manuelEnd), { fenetre: { debut: +n.manuelStart, fin: +n.manuelEnd } });
      if (!r) return null;
      var avant = n.awake;
      ['sleepMin', 'deep', 'rem', 'light', 'awake', 'stages', 'stadesIndetermines', 'lowestHr', 'plancher', 'couverture', 'entrees']
        .forEach(function (f) { n[f] = r[f]; });
      ['stagesV8', 'deepV8', 'lightV8', 'remV8', 'awakeV8', 'sleepMinV8', 'sleepMap'].forEach(function (f) { delete n[f]; });
      n.lecteur = 'coeur'; n.relue = { v: 'v2994', t: Date.now() };
      w.night = n;
      if (vivant) window.wSaveK(K); else localStorage.setItem('watch_' + K, JSON.stringify(w));
      log('nuit ' + K + ' : nuit saisie RELUE sur sa fenêtre (matière changée) — éveil ' + avant + ' → ' + n.awake + ' min');
      try { if (typeof window.flintSommeilRecalculer === 'function') window.flintSommeilRecalculer(); } catch (e) {}
      try {
        if (typeof window.flNuitResceller === 'function') {
          var rs = window.flNuitResceller(K, 'relue');
          log('nuit ' + K + ' : sceau ' + (rs && rs.ok ? 'réécrit' : 'inchangé — ' + (rs && rs.raison)));
        }
      } catch (e) {}
      return n;
    } catch (e) { return null; }
  };

  /* ═══ LE TÉLÉPHONE : RANGER SES ÉVÉNEMENTS PAR JOUR ═══════════════════════════════════════
     [[instant (s), 1 | 0], …] — le natif renvoie ses 48 dernières heures à chaque réveil de la
     page : on fusionne sans doublon, chaque événement dans le jour local de son instant. */
  window.flVerrouRecevoir = function (data) {
    try {
      var ev = Array.isArray(data) ? data : ((data && Array.isArray(data.evenements)) ? data.evenements : []);
      var par = {};
      ev.forEach(function (x) {
        if (!x || x.length < 2 || !(+x[0] > 1e9)) return;
        var K = cleDe(new Date(+x[0] * 1000));
        (par[K] = par[K] || []).push([Math.round(+x[0]), +x[1] ? 1 : 0]);
      });
      var neufs = 0;
      Object.keys(par).forEach(function (K) {
        var vivant = typeof window.flJourMontre === 'function' && typeof window.wSaveK === 'function';
        var w = vivant ? window.flJourMontre(K) : (lire('watch_' + K) || {});
        var vu = {}, l = Array.isArray(w.verrou) ? w.verrou.slice() : [], n0 = l.length;
        l.forEach(function (x) { vu[x[0] + ':' + x[1]] = 1; });
        par[K].forEach(function (x) { if (!vu[x[0] + ':' + x[1]]) { vu[x[0] + ':' + x[1]] = 1; l.push(x); } });
        if (l.length === n0) return;
        l.sort(function (a, b) { return a[0] - b[0]; });
        w.verrou = l; neufs += l.length - n0;
        if (vivant) window.wSaveK(K); else localStorage.setItem('watch_' + K, JSON.stringify(w));
      });
      if (neufs) {
        log('téléphone : ' + neufs + ' déverrouillage(s)/verrouillage(s) rangé(s)');
        var K0 = cleDe(new Date()), av = (lire('watch_' + K0) || {}).night;
        try { if (typeof window.flNuitRecouper === 'function') window.flNuitRecouper(); } catch (e) {}
        var ap = (lire('watch_' + K0) || {}).night;
        if (av && ap && av.bedMin !== ap.bedMin) rescellerSiBesoin(K0, 'telephone');   /* v2996 — l'endormissement seulement */
      }
      return neufs;
    } catch (e) { return 0; }
  };

  /* ═══ LE MATIN : LA NUIT DU BRACELET EST ATTENDUE ═══════════════════════════════════════════
     Le 30, la nuit s'est posée à 08:00:48 sur le cœur seul (23:52 → 07:56) ; le fichier de nuit
     du bracelet est arrivé à 08:07:30 (00:57 → …), et Dino a corrigé l'endormissement à la main
     à 08:15. Un jour Fitcare, tant que la nuit est lue au cœur et que son fichier de nuit manque,
     le cycle reste en COLLECTE (flint-recup-cycle.js) : ni proposition, ni sceau — au plus
     `attenteBracelet` (30) minutes après le réveil, puis le cœur et le téléphone font foi. */
  window.flNuitAttendBracelet = function (K, maintenant) {
    try {
      var w = lire('watch_' + K) || {};
      if (!/fitcare/.test(String(w.marque || ''))) return null;
      var n = w.night;
      /* v3001 — LE RÉVEIL AU BORD D'UN TROU (le 31 : téléphone éteint de 08:25 à 09:50). Les minutes
         sont revenues, mais pas encore la mémoire du bracelet qui comble le trou : on attend, 60 min
         au plus après le retour des mesures, et on la demande (une fois par nuit). */
      try {
        if (n && n.lecteur === 'coeur' && n.source !== 'manuel' && n.reveilBordTrou && +n.sleepEnd > 0) {
          var hrT = Array.isArray(w.hr) ? w.hr : [], qT = String(K).split('-'), mnT = new Date(+qT[0], +qT[1] - 1, +qT[2]).getTime(), retour = null;
          for (var iT = 0; iT < hrT.length; iT++) { var xT = hrT[iT]; if (!xT || !(+xT[1] > 0)) continue; var msT = mnT + xT[0] * 60000; if (msT > +n.sleepEnd + 15 * 60000 && (retour == null || msT < retour)) retour = msT; }
          var nowT = maintenant || Date.now();
          if (retour != null && nowT - retour < 60 * 60000) {
            try {
              var cleT = 'flTrouReveilDemande_' + K;
              if (!localStorage.getItem(cleT)) {
                localStorage.setItem(cleT, String(nowT));
                window.webkit.messageHandlers.flint.postMessage({ cmd: 'relireMemoire', pourquoi: 'réveil au bord d\'un trou' });
                log('nuit ' + K + ' : le réveil tombe au bord d\'un trou de mesures — mémoire du bracelet demandée');
              }
            } catch (eD) {}
            return { raison: 'le réveil lu tombe au bord d\'un trou de mesures (téléphone éteint ?) — la mémoire du bracelet va le combler, '
                             + Math.ceil((retour + 60 * 60000 - nowT) / 60000) + ' min au plus', jusqua: retour + 60 * 60000 };
          }
        }
      } catch (eB) {}
      if (!n || n.source === 'manuel' || n.lecteur !== 'coeur' || n.onsetSrc === 'bracelet' || !(+n.sleepEnd > 0)) return null;
      var nf = w.nuitFitcare;
      if (nf && typeof window.flNuitFitcareCollee === 'function' && window.flNuitFitcareCollee(nf, +n.sleepStart, +n.sleepEnd)) return null;
      var now = maintenant || Date.now(), att = ((window.flNuitCoeurReglages || {}).attenteBracelet || 30) * 60000;
      if (now < +n.sleepEnd || now - +n.sleepEnd >= att) return null;
      /* v2995 (revue) — DÈS QUE L'ATTENTE COMMENCE, ON DEMANDE au bracelet sa mémoire, UNE fois par
         nuit : la synchro de la v2991 (50 → 96 → 97 → liste), objet 96 permis après 5 h — c'est
         elle qui lui fait écrire son `.slep` (le 30 : il n'était pas dans les listes de 08:00 et
         08:03, il l'était à 08:07). Le natif (`relireMemoire`) la borne à une par minute. */
      try {
        var cleD = 'flAttenteBraceletDemande_' + K;
        if (!localStorage.getItem(cleD) && new Date(now).getHours() >= 5) {   /* v2996 — avant 5 h le 96 est refusé : on ne gâche pas l'unique demande */
          localStorage.setItem(cleD, String(now));
          window.webkit.messageHandlers.flint.postMessage({ cmd: 'relireMemoire', pourquoi: 'nuit du bracelet attendue' });
          log('nuit ' + K + ' : fichier de nuit du bracelet attendu — mémoire du bracelet demandée');
        }
      } catch (e) {}
      return { raison: 'le fichier de nuit du bracelet est attendu (il arrive avec la synchro du matin) — l\'endormissement lu au cœur seul n\'est pas montré, '
                       + Math.ceil((+n.sleepEnd + att - now) / 60000) + ' min au plus', jusqua: +n.sleepEnd + att };
    } catch (e) { return null; }
  };

  /* ═══ 31 oct. 2026 — UNE NUIT NE SE FINALISE PAS SEULE AU BORD DE CE QU'ELLE A LU ═══════════════
     LE REJEU « TÉLÉPHONE LOIN » (retour le 31 à 15:00). La mémoire du bracelet arrive par paquets
     de 255 minutes et la passe du matin tourne entre deux paquets (la file WebKit les entrelace) :
     la nuit lue s'arrêtait au bout du dernier paquet reçu — « réveil » 00:00, puis 04:15 — et la
     décision automatique la finalisait (110 min, puis la réouverture unique à 183 min, pour une
     nuit de 487 min). Le lendemain, rien ne la réparait. Le garde de la v3001 (`reveilBordTrou`)
     était aveugle : la lecture de la nuit s'arrête à 14:00, les minutes revenues après aussi.
     LA RÈGLE (pour le FOND ; le geste de la personne décide quand il veut). On attend tant que :
       · le réveil touche la fin des minutes lues (moins de 15 min après lui) ;
       · les minutes lues s'arrêtent avant l'horizon de rendormissement (`rendormiFen`, 3 h après le
         réveil) ET avant maintenant (15 min de vide, ou jusqu'à 14:00) — la suite arrive peut-être ;
         c'est la règle du 29 oct. (« un réveil n'est final qu'après avoir vu de quoi se rendormir »),
         dite au moment de sceller ;
       · le réveil tombe au bord d'un trou (aucune minute dans les 15 qui suivent, des minutes après,
         la journée entière) — 60 min au plus après le retour des minutes, comme `flNuitAttendBracelet`.
     BORNÉE : cinq minutes sans minute nouvelle dans la fenêtre de la nuit, sans synchro de la mémoire
     en cours (`flMemoireSynchroA`), lèvent les deux premières — un bracelet ôté au réveil ne doit pas
     priver la nuit de son sceau. Lue par `flint-nuit-matin.js` (`attenteDesDonnees`).
     Banc : tests/test-nuit-bord-des-donnees.js. */
  var BORD = { reveil: 15, vide: 15, silence: 5, trou: 60 };
  window.flNuitBordReglages = BORD;
  function hm(t) { var d = new Date(t); return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2); }
  window.flNuitBordDesDonnees = function (K, maintenant) {
    try {
      var w = lire('watch_' + K) || {}, n = w.night;
      if (!n || n.lecteur !== 'coeur' || n.source === 'manuel' || !(+n.sleepEnd > +n.sleepStart)) return null;
      var now = maintenant || Date.now(), q = String(K).split('-');
      var minuit = new Date(+q[0], +q[1] - 1, +q[2]).getTime(), mv = new Date(+q[0], +q[1] - 1, +q[2] - 1).getTime();
      if (isNaN(minuit)) return null;
      var t0 = minuit - 12 * 3600000, fenFin = Math.min(t0 + 26 * 3600000, now), reveil = +n.sleepEnd;
      var dernier = null, nb = 0, dans15 = false, retour = null, R = BORD.reveil * 60000;
      [[jourDecale(K, -1), mv], [K, minuit]].forEach(function (j) {
        var hr = (lire('watch_' + j[0]) || {}).hr;
        (Array.isArray(hr) ? hr : []).forEach(function (x) {
          if (!x || x[0] == null || !(+x[1] > 0)) return;
          var ms = j[1] + x[0] * 60000;
          if (ms > now) return;
          if (ms > reveil && ms <= reveil + R) dans15 = true;
          else if (ms > reveil + R && (retour == null || ms < retour)) retour = ms;
          if (ms < t0 || ms > fenFin) return;
          nb++;
          if (dernier == null || ms > dernier) dernier = ms;
        });
      });
      var horizon = Math.min(reveil + (((window.flNuitCoeurReglages || {}).rendormiFen) || 180) * 60000, fenFin), raison = null;
      if (dernier == null || dernier < reveil + R)
        raison = 'le réveil lu (' + hm(reveil) + ') touche la fin des minutes lues (' + (dernier == null ? 'aucune' : hm(dernier)) + ')';
      else if (dernier < horizon && fenFin - dernier >= BORD.vide * 60000)
        raison = 'les minutes lues s\'arrêtent à ' + hm(dernier) + ', avant l\'horizon de rendormissement (' + hm(horizon) + ')';
      else if (!dans15 && retour != null && now - retour < BORD.trou * 60000)
        return { raison: 'le réveil lu (' + hm(reveil) + ') tombe au bord d\'un trou de mesures (elles reviennent à ' + hm(retour)
                         + ') — la mémoire du bracelet va le combler, ' + Math.ceil((retour + BORD.trou * 60000 - now) / 60000) + ' min au plus',
                 jusqua: retour + BORD.trou * 60000 };
      if (!raison) return null;
      /* Le silence : ce que la fenêtre de la nuit a lu (nombre de minutes, dernière) n'a pas bougé
         depuis cinq minutes. Gardé sur le disque (une page relancée ne remet pas l'horloge à zéro). */
      var memo = lire('flNuitBordDonnees') || {}, e = memo[K];
      if (!e || e.n !== nb || e.d !== dernier) {
        e = { n: nb, d: dernier, t: now };
        memo[K] = e;
        var cles = Object.keys(memo).sort(function (a, b) { return lire2(a) - lire2(b); });
        while (cles.length > 4) delete memo[cles.shift()];
        try { localStorage.setItem('flNuitBordDonnees', JSON.stringify(memo)); } catch (eS) {}
      }
      var a = +window.flMemoireSynchroA || 0, enSynchro = a > 0 && now - a >= 0 && now - a < 600000;
      if (!enSynchro && now - e.t >= BORD.silence * 60000) {
        if (!e.dit) {
          e.dit = 1;
          try { localStorage.setItem('flNuitBordDonnees', JSON.stringify(memo)); } catch (eS) {}
          log('nuit ' + K + ' : ' + raison + ' — plus rien n\'arrive depuis ' + BORD.silence + ' min : la nuit peut se finaliser');
        }
        return null;
      }
      return { raison: raison + ' — la mémoire du bracelet la complète peut-être', depuis: e.t };
    } catch (e) { return null; }
  };
  function lire2(K) { var q = String(K).split('-'); return new Date(+q[0], +q[1] - 1, +q[2]).getTime() || 0; }

  /* LES PORTES. À chaque pouls rangé (mémoire du bracelet, journal de nuit, nuit du bracelet) :
     la nuit qui finit aujourd'hui et celle d'hier, après 3 s de calme ; le soir, aussi celle de
     demain. Et une fois par version, les trois dernières nuits.
     31 oct. 2026 — ET LES NUITS QUE LA LIVRAISON A TOUCHÉES (`touches`, 3 au plus, les plus
     récentes) : la mémoire rapatriée après deux jours loin du téléphone apporte des nuits plus
     anciennes qu'hier, qui ne passaient jamais par la quarantaine. */
  var TOUCHES_MAX = 3;
  function passe(jours, touches) {
    try {
      var auj = new Date(), K0 = cleDe(auj);
      var cles = (jours || [-1, 0]).map(function (j) { return jourDecale(K0, j); });
      if (auj.getHours() >= 22) cles.push(jourDecale(K0, 1));
      if (touches) {
        var lim = msDe(K0, 0);
        Object.keys(touches).filter(function (K) { return msDe(K, 0) <= lim; })
          .sort(function (a, b) { return msDe(b, 0) - msDe(a, 0); }).slice(0, TOUCHES_MAX)
          .forEach(function (K) { if (cles.indexOf(K) < 0) cles.push(K); });
      }
      var n = 0; cles.forEach(function (K) { n += window.flSansBattementsAppliquer(K) || 0; });
      return n;
    } catch (e) { return 0; }
  }
  window.flSansBattementsPasse = passe;
  /* Les nuits qu'un paquet nourrit : le jour de chaque minute, et le lendemain pour une minute
     d'après 20:00 (la matière d'une nuit commence la veille à 20:00, voir `matiere`). */
  function noterTouches(t, d, acc) {
    try {
      var bornes = [];
      if (t === 'hrhistory' && d && +d.debut > 1e9) {
        var nV = Array.isArray(d.valeurs) ? d.valeurs.length : 0, pts = Array.isArray(d.points) ? d.points : null;
        if (nV) bornes = [+d.debut * 1000, (+d.debut + (nV - 1) * (+d.intervalle || 60)) * 1000];
        else if (pts && pts.length) bornes = [+pts[0][0] * 1000, +pts[pts.length - 1][0] * 1000];
      } else if (t === 'sommeil' && d && +d.leve > 1e9) bornes = [+d.leve * 1000, +d.leve * 1000];
      if (bornes.length !== 2 || !(bornes[1] >= bornes[0]) || bornes[1] - bornes[0] > 3 * 86400000) return;
      for (var x = new Date(bornes[0]); x.getTime() <= bornes[1] + 1; x = new Date(x.getFullYear(), x.getMonth(), x.getDate() + 1)) acc[cleDe(x)] = 1;
      var f = new Date(bornes[1]);
      if (f.getHours() >= 20) acc[jourDecale(cleDe(f), 1)] = 1;
    } catch (e) {}
  }
  window.flSansBattementsTouches = noterTouches;
  try {
    if (typeof document !== 'undefined' && document.addEventListener) {
      var _t = null, _touches = {};
      document.addEventListener('flintWatch', function (e) {
        try {
          var t = e && e.detail && e.detail.type;
          /* 31 oct. 2026 — chaque paquet de la mémoire entretient le drapeau « la mémoire arrive »
             (index.html) : il tombe 10 min après le dernier, jamais avant la fin annoncée. */
          if ((t === 'hrhistory' || t === 'sommeil') && +window.flMemoireSynchroA > 0) window.flMemoireSynchroA = Date.now();
          if (t === 'verrou') { window.flVerrouRecevoir(e.detail.data); return; }
          if (t === 'sommeil' && e.detail.data && e.detail.data.source === 'fitcare') {
            /* la nuit du bracelet arrive APRÈS un sceau posé au cœur : le sceau suit l'endormissement.
               v2995 (revue) — DANS CE MÊME APPEL (index.html vient de recouper la nuit) : un minuteur
               de 2,5 s laissait `flNuitPasse('accueil')` voir la nuit changée et consommer l'unique
               réouverture (« Tu t'es rendormi ? »). */
            try {
              var d1 = new Date(+e.detail.data.leve * 1000), Kb = cleDe(d1), nb = (lire('watch_' + Kb) || {}).night;
              if (nb && nb.source !== 'manuel' && nb.onsetSrc === 'bracelet') rescellerSiBesoin(Kb, 'bracelet');
            } catch (e3) {}
          }
          if (t !== 'hrhistory' && t !== 'nightlog' && t !== 'sommeil' && t !== 'nonport') return;
          if (t === 'nonport' && e.detail.data && Array.isArray(e.detail.data.fenetres)
              && e.detail.data.fenetres.every(function (f) { return f && f.raison === 'sansBattements'; })) return;
          noterTouches(t, e.detail.data, _touches);
          clearTimeout(_t); _t = setTimeout(function () { var j = _touches; _touches = {}; passe(null, j); }, 3000);
        } catch (e2) {}
      });
      setTimeout(function () {
        try {
          var v = (typeof APP_VERSION !== 'undefined') ? APP_VERSION : 'v2994';
          if (localStorage.getItem('flSansBattementsVu') === v) return;
          passe([-2, -1, 0]);
          localStorage.setItem('flSansBattementsVu', v);
        } catch (e) {}
      }, 4000);
    }
  } catch (e) {}
})();
