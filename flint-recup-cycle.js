/* ═══════════════════════════════════════════════════════════════════════════
   LE CYCLE DE VIE DE LA RÉCUPÉRATION — v2037
   « une nuit finalisée = un score de récupération stable »

   LE CAS FONDATEUR, 30 août 2026 au matin. Dino ouvre l'app à 09:07 : 87 %.
   Quelques instants plus tard : 70 %. Puis 71 %, qui est le score pertinent de
   cette nuit-là. Trois nombres, une seule nuit, aucun événement physiologique
   entre les deux. Sa phrase : « le problème n'est pas de savoir quelle valeur
   est correcte, c'est que le score est recalculé en permanence alors que la
   nuit est terminée ».

   LA CAUSE RACINE, ET ELLE N'EST PAS DANS L'AFFICHAGE. `recovery(0)` est un
   calcul PUR sur l'état courant de la base : il n'a jamais eu de notion de
   « la nuit est finie ». La doctrine v1463 avait bien tranché pour les jours
   PASSÉS (« un score passé se relit, il ne se recalcule pas »), et le registre
   `recov_` la tient. Mais AUJOURD'HUI restait vivant par construction, et ses
   entrées bougent à chaque trame du bracelet :

     · la VFC est la MÉDIANE des minutes exploitables de la nuit — une médiane
       de PRÉFIXE n'est pas la médiane finale (`outils/rejeu-recup-minuit.js`
       l'a mesuré : sur la vraie base du 30 août, la seule incomplétude de la
       livraison suffit à produire 86) ;
     · la FC de repos est le 5e centile des mesures de la fenêtre de nuit —
       même préfixe, même dérive ;
     · `sleepMin`, `bedMin`, `wakeMin` bougent tant que la montre livre ses
       tranches (le moteur de sommeil le dit lui-même : « 3 h 02, puis 4 h 58,
       puis 6 h 43 — trois nuits affirmées coup sur coup ») ;
     · et chaque trame déclenche `flRafraichirDouce`, donc un nouveau rendu,
       donc un nouveau calcul, donc un nouveau nombre.

   87 → 70 → 71 n'est pas une instabilité de la formule. C'est une SUITE DE
   PUBLICATIONS d'un calcul provisoire, chacune présentée comme définitive.

   CE QUE CE FICHIER AJOUTE : le cycle de vie qui manquait.

       sommeil → collecte → grâce → FINALE → scellé
                    ▲         │
                    └─────────┘  (rendormissement : la nuit se recolle)

   · `sommeil`  la nuit court encore ;
   · `collecte` la livraison n'est pas close (synchro en vol, nuit tronquée) :
                RIEN N'EST PUBLIÉ. L'accueil garde le score de la veille en le
                DÉCLARANT (repli v1874) et le natif écrit « calcul en cours » ;
   · `grâce`    la livraison est close, mais un rendormissement pourrait encore
                recoller la nuit. Le score est publié UNE FOIS, marqué
                provisoire ; il ne bouge plus tant que la NUIT elle-même ne
                bouge pas ;
   · `finale`   plus aucun recollement possible : le score est calculé sur un
                instantané des entrées, scellé dans `recovFige_<K>`, et rendu
                tel quel à toute lecture ultérieure. Zéro recalcul spontané.

   LA FENÊTRE DE GRÂCE N'EST PAS UN NOMBRE NEUF, et c'est le point le plus
   important de ce fichier. Elle vaut EXACTEMENT le seuil au-delà duquel le
   moteur de sommeil refuse déjà de recoller deux sommeils en une nuit
   (`CLASSIF.reveilCoupeNuit`, publié par `flSommeilSeuils`). Tant que le
   moteur de sommeil accepterait de fusionner, la nuit peut encore changer :
   la finaliser serait mentir. Dès qu'il refuserait, plus rien ne peut la
   changer : la garder ouverte serait de la lâcheté. Un seul chiffre, les deux
   côtés — et il se déplace tout seul le jour où le sommeil change d'avis.
   La MÊME preuve de reprise de journée que la fusion (marche franche :
   `marcheSuiteMini` minutes consécutives et `marchePasMini` pas) ferme la
   fenêtre plus tôt : si le corps s'est levé et a marché, il ne se rendort pas
   dans cette nuit-là.

   L'INVARIANT, ET IL EST VÉRIFIABLE : même `K`, même empreinte d'entrées,
   même score. L'empreinte (`flRecupEmpreinte`) couvre TOUT ce qui entre dans
   `recovery()` — les quatre mesures de la nuit, la fenêtre de sommeil, les
   trois normales, le journal de bord, et la génération de formule. Elle est
   écrite avec le score au moment du scellement : on peut donc répondre, des
   mois après, à « pourquoi ce nombre-là ».

   CE QUE CE FICHIER NE FAIT PAS, ET C'EST VOULU : aucun debounce, aucun délai
   fixe, aucun cache d'affichage. Rien ici ne dit « attends cinq minutes ».
   Tout ce qui retient une publication est un FAIT mesuré : un canal en vol,
   un bord de nuit jamais transmis, une fenêtre de recollement encore ouverte.

   Banc : `FLINT/web/tests/test-recup-figee.js`.
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* La génération du CYCLE — à ne pas confondre avec `RECOV_ALGO_GEN`, qui est
     celle de la FORMULE. Si la politique de publication change (les états, ce
     qui autorise une réouverture), les scellés d'avant ne décrivent plus la
     même chose : ils portent leur génération et se relisent en connaissance de
     cause. On ne les rejuge pas pour autant — un score vu reste un score vu. */
  var CYCLE_GEN = 1;

  /* ═══ LE DÉPÔT ET LE CALENDRIER SE LISENT NUS, JAMAIS PAR `window` ════════
     `DB` et `tk` sont des `const` de haut niveau d'index.html : une liaison
     lexicale de script N'EST PAS une propriété de `window`. Les lire par
     `window.DB` marche au banc (qui pose l'objet sur le contexte) et NULLE
     PART ailleurs — c'est exactement le défaut que `marche.js` a payé pendant
     une version, et il est écrit dans son en-tête (« ça marchait au banc et
     nulle part ailleurs »). Les scripts classiques partagent la même portée
     lexicale globale : `flint-semis.js` lit `DB` et `tk` nus depuis un autre
     fichier, et c'est ce qui marche.
     On ne déclare donc AUCUN `tk` ni `DB` local dans ce fichier — un nom local
     masquerait la liaison globale et rendrait le défaut invisible. La
     résolution est tardive, à l'appel : ce fichier se charge avant le grand
     bloc, et les liaisons existent quand les fonctions tournent.
     Le banc `test-recup-figee.js` monte ce fichier SANS poser `tk`/`DB` sur
     `window` : il ne peut donc pas être vert sur ce défaut-là. */

  /* Les seuils de la nuit viennent du moteur de sommeil, jamais d'ici. Le repli
     n'est pas un second réglage : c'est la valeur du moteur recopiée pour le
     seul cas où le web servi serait périmé (même précaution que `flPas`). */
  function seuils() {
    try { if (typeof window.flSommeilSeuils === 'function') return window.flSommeilSeuils(); }
    catch (e) {}
    return { reveilCoupeNuit: 240, marcheSuiteMini: 6, marchePasMini: 500 };
  }

  /* ═══ LA NUIT A-T-ELLE VRAIMENT BOUGÉ ? — le juge unique ═════════════════
     QUATRIÈME MÉCANISME DU 30 AOÛT, vu à 10:41 sur la base vivante : à CHAQUE
     synchro, la montre relivre ses tranches et le re-staging recalcule la nuit
     à 2-3 minutes près (371 → 373 → …). Ce n'est pas une livraison, c'est du
     bruit de recalcul — mais il rouvrait la fenêtre d'observation à chaque
     ouverture de l'app, et une visite dure moins de deux minutes : de son
     point de vue, le score ne se publiait JAMAIS.
     LE SEUIL N'EST PAS UN RÉGLAGE, C'EST UNE CONSÉQUENCE DES POIDS : le terme
     sommeil du score pèse 0,49 par écart-type, et l'écart-type d'une base de
     sommeil se compte en dizaines de minutes. Cinq minutes de sommeil déplacent
     le score de MOINS D'UN POINT. Retenir la publication pour un changement
     incapable de changer le nombre affiché n'a aucun sens ; le laisser rouvrir
     un sceau serait pire (il consommerait l'unique réouverture pour du bruit).
     Une vraie livraison partielle, elle, saute par dizaines de minutes
     (182 → 298 → 403 le matin même) : elle passe ce seuil à chaque tranche. */
  var SEUIL_NUIT_MIN = 5;
  function nuitABouge(a, b) {
    if (!a || !b) return true;
    function d(x, y) { return Math.abs((+x || 0) - (+y || 0)); }
    return d(a.sleepMin, b.sleepMin) > SEUIL_NUIT_MIN
        || d(a.bedMin, b.bedMin) > SEUIL_NUIT_MIN
        || d(a.wakeMin, b.wakeMin) > SEUIL_NUIT_MIN;
  }
  /* 14 sept. 2026 — `flRecovLu` vit HORS de cette clôture (fin de fichier) et
     pose exactement la même question sur le registre des jours passés : la nuit
     a-t-elle bougé depuis la dernière fois ? On expose le juge plutôt que de
     recopier le seuil — le repli n'est pas un second réglage. */
  window.flNuitABouge = nuitABouge;

  /* ═══ 1 · OÙ EN EST LA NUIT ═══════════════════════════════════════════════ */
  window.flNuitCycle = function (K, maintenant) {
    var out = { K: K, etat: 'sansNuit', raison: null, depuisReveil: null,
                grace: seuils().reveilCoupeNuit, cycleGen: CYCLE_GEN };
    try {
      var s = (typeof window.sensorOf === 'function') ? window.sensorOf(K) : null;
      if (!s || s.sleepMin == null) { out.raison = 'aucune nuit posée sur ce jour'; return out; }
      /* UNE JOURNÉE PASSÉE EST FINALE PAR CONSTRUCTION. C'est la doctrine v1463,
         déjà tenue par le registre : on ne la rejoue pas, on la constate.

         ═══ 12 septembre 2026 — SAUF PENDANT QUE SA NUIT ARRIVE ENCORE ═══════
         Rejoué sur la base de Dino (moteur entier monté, `flRecupPublier` du
         11 septembre lu entre trois tranches de sa nuit, comme l'accueil
         précharge la veille pendant que le bracelet livre) :

             1re tranche  150 min  → « première publication » : SCELLÉ, 14
             2e tranche   300 min  → réouverture contrôlée (la seule)
             3e tranche   403 min  → « une réouverture a déjà eu lieu » : REFUSÉ
             sceau final : 300 min, pour une nuit de 403.

         « Finale par construction » scellait donc une journée passée sur la
         première tranche vue, et l'unique réouverture partait sur la deuxième.
         Une journée passée dont la nuit vient du BRACELET et qui date de moins
         de trois jours — l'horizon d'une livraison en retard — passe par le
         même juge que la journée courante : sa signature doit tenir deux
         minutes avant qu'on la scelle. Le score se publie quand même
         (provisoire) ; c'est le sceau qui attend. Au-delà de trois jours, une
         nuit saisie ou semée, ou un jour futur : la doctrine tient telle
         quelle. Banc : test-recup-jour-passe-en-livraison.js. */
      if (K !== tk(0)) {
        var _agePasse = null;
        try { _agePasse = Math.round((window.flMinuitMsDe(tk(0)) - window.flMinuitMsDe(K)) / 86400000); } catch (e) {}
        if (!s._watch || _agePasse == null || _agePasse < 1 || _agePasse > 3) {
          out.etat = 'finale'; out.raison = 'journée passée'; return out;
        }
        var _nowP = maintenant || Date.now();
        try {
          var _miP = window.flMinuitMsDe(K);
          if (!isNaN(_miP) && s.wakeMin != null) {
            out.finNuit = _miP + s.wakeMin * 60000;
            out.depuisReveil = Math.round((_nowP - out.finNuit) / 60000);
          }
        } catch (e) {}
        var _sigP = [s.sleepMin, s.bedMin, s.wakeMin,
                     (s.couvertureTranches != null ? s.couvertureTranches : '')].join('|');
        var _svP = null;
        try { _svP = DB.get('recovNuitSig_' + K, null); } catch (e) {}
        if (!_svP || _svP.sig !== _sigP) {
          var _avP = _svP && String(_svP.sig).split('|');
          var _apP = _sigP.split('|');
          var _mineurP = _avP && !nuitABouge(
            { sleepMin: _avP[0], bedMin: _avP[1], wakeMin: _avP[2] },
            { sleepMin: _apP[0], bedMin: _apP[1], wakeMin: _apP[2] });
          try { DB.set('recovNuitSig_' + K, { sig: _sigP, t: _mineurP ? (_svP.t || _nowP) : _nowP }); } catch (e) {}
          if (!_mineurP) {
            out.etat = 'collecte';
            out.raison = 'journée passée dont la nuit ' + (_svP ? 'vient de changer' : 'est vue pour la première fois')
                       + ' — on laisse la livraison finir';
            return out;
          }
          _svP = { sig: _sigP, t: (_svP && _svP.t) || _nowP };
        }
        if ((_nowP - (_svP.t || 0)) < 120000) {
          out.etat = 'collecte';
          out.raison = 'journée passée — sa nuit a changé il y a ' + Math.round((_nowP - _svP.t) / 1000) + ' s';
          return out;
        }
        out.etat = 'finale'; out.raison = 'journée passée, nuit stable'; return out;
      }
      /* CE CYCLE NE PARLE QUE DU BRACELET. Une nuit SAISIE (`source:'manual'`)
         ou SEMÉE (démo, atelier) n'a pas de `_watch` : elle arrive d'un coup,
         complète, et rien ne la fera bouger. La mettre en collecte la
         priverait de score pour toujours — exactement le piège que la v2034
         a fermé de l'autre côté (« un jour sans bracelet garde le
         comportement d'avant »). */
      /* ═══ v2638 — UN SCEAU POSÉ PENDANT LA NUIT N'EST PAS UN SCEAU ═══════

         LE VERROU TIENT LA JOURNÉE, ET C'EST VOULU. Dino, 25 septembre :
         « il doit être verrouillé toute la journée, ça c'est sûr ». Un score
         qui bouge à 16 h ne vaut rien. On ne touche donc pas au verrou.

         UNE SEULE EXCEPTION, et elle nomme exactement la pathologie du
         25 septembre : LE SCEAU A ÉTÉ POSÉ AVANT LA FIN DE LA NUIT.

         Ce jour-là, sa nuit portait `source:'manuel'`. À 01:49 elle couvrait
         22:30 → 01:44 (159 min) et ce `return` l'a scellée — pendant qu'il
         dormait. Il a dormi jusqu'à 08:06 : la nuit est devenue 00:32 → 08:06,
         312 min. Score calculé sur 2h39 au lieu de 5h12 : 23 au lieu de 45,
         quand WHOOP disait 53 au même poignet.

         LA RÈGLE : si la nuit se termine APRÈS l'instant où le sceau a été
         posé, ce sceau portait sur une nuit inachevée — il n'a jamais été
         légitime. On rouvre, une fois ; la republication réécrit l'horodatage
         et la fois suivante la condition est fausse. Elle s'éteint seule.

         ⚠️ POURQUOI PAS « LA NUIT A CHANGÉ » — c'était ma première version, et
         elle cassait le verrou : n'importe quel re-découpage de l'après-midi
         aurait rouvert le score. Ici la condition ne PEUT PAS se déclencher
         l'après-midi, puisque la fin de nuit est alors derrière le sceau.

         ⚠️ ON NE DÉPLACE TOUJOURS PAS CE `return` PLUS BAS : une nuit saisie
         tomberait dans les contrôles de LIVRAISON DU BRACELET, qui n'ont aucun
         sens pour elle, et pourrait rester sans score — pire que le défaut. */
      if (!s._watch) {
        var _etM = null;
        try { _etM = DB.get('recovEtat_' + K, null); } catch (e) {}
        var _finM = null;
        try {
          var _miM = window.flMinuitMsDe(K);
          if (!isNaN(_miM) && s.wakeMin != null) _finM = _miM + s.wakeMin * 60000;
        } catch (e) {}
        var _tS = (_etM && _etM.ts) ? Date.parse(_etM.ts) : NaN;
        /* Une minute de marge : un sceau posé dans la minute qui suit le réveil
           a vu la nuit finie, et on ne rouvre pas pour une seconde d'écart. */
        if (_etM && _etM.etat === 'finale' && !isNaN(_tS) && _finM && _finM > _tS + 60000) {
          out.etat = 'collecte';
          out.raison = 'sceau posé avant la fin de la nuit ('
                     + Math.round((_finM - _tS) / 60000) + ' min trop tôt) — il portait sur une nuit inachevée';
          return out;
        }
        out.etat = 'finale'; out.raison = 'nuit saisie ou semée'; return out;
      }

      var now = maintenant || Date.now();
      var fin = null;
      try {
        var mi = window.flMinuitMsDe(K);
        if (!isNaN(mi) && s.wakeMin != null) fin = mi + s.wakeMin * 60000;
      } catch (e) {}
      if (fin == null) { out.etat = 'collecte'; out.raison = 'fin de nuit inconnue'; return out; }
      out.finNuit = fin;
      out.depuisReveil = Math.round((now - fin) / 60000);

      if (out.depuisReveil < 0) { out.etat = 'sommeil'; out.raison = 'la nuit court encore'; return out; }

      /* ── LA FENÊTRE DE GRÂCE D'ABORD, ET C'EST L'ORDRE QUI COMPTE ──────────
         Si on testait la livraison avant, une nuit dont la montre n'a JAMAIS
         transmis le premier quart d'heure (`bordManquant`) resterait en
         collecte pour toujours et n'aurait jamais de score. Une nuit tronquée
         reste une nuit : passé la fenêtre de recollement, on publie ce qu'on a.
         La collecte ne peut donc jamais durer plus que la grâce. */
      var g = seuils();
      var repris = false, m = null;
      if (out.depuisReveil < g.reveilCoupeNuit) {
        try {
          if (typeof window.flSommeilMarcheDans === 'function') {
            m = window.flSommeilMarcheDans(K, fin, now);
            repris = !!(m && m.suite >= g.marcheSuiteMini && m.pas >= g.marchePasMini);
            out.marche = m;
          }
        } catch (e) {}
      }
      if (out.depuisReveil >= g.reveilCoupeNuit) {
        out.etat = 'finale';
        out.raison = 'réveil de ' + out.depuisReveil + ' min, au-delà des '
                   + g.reveilCoupeNuit + ' min qui coupent une nuit en deux';
        return out;
      }
      if (repris) {
        out.etat = 'finale';
        out.raison = 'la journée a repris (' + m.suite + ' min de marche, ' + m.pas
                   + ' pas) — plus aucun recollement possible';
        return out;
      }

      /* ── LA LIVRAISON EST-ELLE CLOSE ? ─────────────────────────────────────
         TROIS VERROUS MORTS EN UNE MATINÉE, tous de la même famille : juger la
         livraison sur des ÉVÉNEMENTS. ① `synchroActive` collé à vrai (fin
         jamais annoncée). ② v2042, « le bracelet a parlé » : le canal
         mouvement bavarde toutes les 3 s, toujours frais. ③ v2043, « une
         tranche de NUIT est arrivée » : la montre RELIVRE les mêmes tranches
         toutes les ~60 s, en boucle — l'horodatage se rafraîchissait sans
         qu'aucune donnée ne change. Trois faits d'arrivée, trois façons de
         rester frais pour toujours.
         v2045 — ON NE REGARDE PLUS L'ARRIVÉE, ON REGARDE LA CHOSE. La seule
         question qui compte : LA NUIT A-T-ELLE BOUGÉ ? Sa signature (fenêtre,
         durée, couverture) est comparée à la dernière vue, gardée en base :
           · elle vient de changer (ou d'apparaître) → collecte, deux minutes ;
           · inchangée depuis deux minutes → la livraison est close, on juge.
         Une relivraison identique ne change pas la signature : elle ne retient
         RIEN. Une livraison partielle la change à chaque tranche : elle
         retient tout du long. Et ce test ne s'applique que DANS la fenêtre de
         grâce — passé `reveilCoupeNuit`, la branche `finale` a déjà tranché
         plus haut, aucune signature ne peut retarder un scellement.
         Le prix assumé : la toute première lecture d'une nuit déjà stable
         (l'app ouverte des heures après) attend deux minutes, une fois — la
         signature persiste en base, les relances ne repayent pas. */
      var sigNuit = [s.sleepMin, s.bedMin, s.wakeMin,
                     (s.couvertureTranches != null ? s.couvertureTranches : '')].join('|');
      var sv = null;
      try { sv = DB.get('recovNuitSig_' + K, null); } catch (e) {}
      if (!sv || sv.sig !== sigNuit) {
        /* v2046 — LE BRUIT DE RE-STAGING NE ROUVRE PAS LA FENÊTRE. Un écart
           sous le seuil met la signature à jour (pour que la dérive cumulée
           reste comparée au DERNIER état vu) mais GARDE l'horodatage : la
           stabilité acquise n'est pas confisquée par un recalcul de ±2 min. */
        var _av = sv && String(sv.sig).split('|');
        var _ap = sigNuit.split('|');
        var _mineur = _av && !nuitABouge(
          { sleepMin: _av[0], bedMin: _av[1], wakeMin: _av[2] },
          { sleepMin: _ap[0], bedMin: _ap[1], wakeMin: _ap[2] });
        try { DB.set('recovNuitSig_' + K, { sig: sigNuit, t: _mineur ? (sv.t || now) : now }); } catch (e) {}
        if (!_mineur) {
          out.etat = 'collecte';
          out.raison = sv ? 'la nuit vient de changer — on laisse la livraison finir'
                          : 'première vue de cette nuit — deux minutes d\'observation';
          return out;
        }
        sv = { sig: sigNuit, t: (sv && sv.t) || now };
      }
      if ((now - (sv.t || 0)) < 120000) {
        out.etat = 'collecte';
        out.raison = 'la nuit a changé il y a ' + Math.round((now - sv.t) / 1000) + ' s — on attend qu\'elle se stabilise';
        return out;
      }
      if (s.bordManquant === true) {
        out.etat = 'collecte';
        out.raison = 'nuit tronquée : un bord n\'a jamais été transmis';
        return out;
      }
      out.etat = 'grace';
      out.raison = 'réveil de ' + out.depuisReveil + ' min — un rendormissement recollerait encore la nuit';
      return out;
    } catch (e) {
      /* v2038 — UNE PANNE NE SE DEGUISE PAS EN ABSENCE DE DONNEES. Sans ce
         champ, `flNuitCycle` rendait `sansNuit` quand il LEVAIT, et la porte
         croyait qu il n y avait rien a montrer — c est exactement ce qui a
         affiche 52 le 30 aout alors que le calcul rendait 70. */
      out.panne = e.message; out.raison = 'cycle : ' + e.message; return out;
    }
  };

  /* ═══ 1 bis · LES MESURES DE LA NUIT SONT-ELLES ARRIVÉES ? ════════════════

     LA QUESTION QUI MANQUAIT, et elle n'est pas celle du cycle. `flNuitCycle`
     répond à « la nuit peut-elle encore BOUGER » — sa fenêtre, son recollement.
     Il ne dit rien de « les MESURES de cette nuit sont-elles là », et c'est ce
     qui a produit le 38 du 2 septembre.

     CE MATIN-LÀ, chiffré après coup sur la base rapatriée : à 9 h 04 le score
     publié valait 38, ce qui demande une VFC autour de 54 ms ; à 12 h 51, la
     même nuit — pas une minute de sommeil de différence — en vaut 48. La
     médiane des minutes de battements a BAISSÉ pendant que la fin de nuit
     arrivait. La fenêtre était juste depuis le début ; c'est la matière qui
     manquait.

     ─── CE QU'UNE NUIT COMPLÈTE RESSEMBLE, MESURÉ ────────────────────────────

     Sept nuits, toutes celles dont les battements ont survécu à la purge :

         écart entre le réveil et la dernière minute de battements : 1 à 6 min
         densité de minutes de battements dans la nuit : 11,1 à 12,0 par heure

     La densité est remarquablement serrée — c'est la cadence du firmware, une
     mesure de variabilité toutes les cinq minutes. Les deux seuils sont donc
     posés avec de la marge sous le pire cas observé, pas au bord : QUINZE
     minutes d'écart (2,5 × le pire) et NEUF par heure (contre 11,1 au pire).

     ⚠️ SANS BATTEMENTS DU TOUT, ON NE JUGE PAS. `rrH` s'archive au natif après
     sept jours, et une montre pourrait n'en livrer aucun : rendre `false`
     bloquerait alors la publication pour toujours. On rend `null`, et
     l'appelant traite le doute comme un feu vert. C'est la règle du dossier —
     le seul échec inacceptable est celui qui ferme la porte définitivement. */
  window.flMesureNuitComplete = function (K) {
    try {
      var w = (typeof window.watchOf === 'function') ? window.watchOf(K) : null;
      var n = w && w.night;
      if (!n || n.bedMin == null || n.wakeMin == null) return null;
      var rh = (w.rrH || []);
      if (!rh.length) return null;                    /* rien à juger : feu vert */
      var b = n.bedMin, r = n.wakeMin;
      var dedans = function (m) { return (b <= r) ? (m >= b && m <= r) : (m >= b || m <= r); };
      var pos = function (m) { return ((m - b) + 1440) % 1440; };
      var mins = [];
      for (var i = 0; i < rh.length; i++) if (rh[i] && dedans(rh[i][0])) mins.push(pos(rh[i][0]));
      var duree = ((r - b) + 1440) % 1440;
      if (!mins.length || duree <= 0) return { complet: false, minutes: 0, duree: duree,
        raison: 'aucune minute de battements dans la fenêtre de la nuit' };
      var dernier = Math.max.apply(null, mins);
      var ecart = duree - dernier;
      var densite = mins.length / (duree / 60);
      var out = { minutes: mins.length, duree: duree, ecartReveil: ecart,
                  densite: Math.round(densite * 10) / 10 };
      if (ecart > 15) { out.complet = false;
        out.raison = 'la fin de la nuit n\'est pas arrivée (' + ecart + ' min avant le réveil, on en tolère 15)';
        return out; }
      if (densite < 9) { out.complet = false;
        out.raison = 'battements trop clairsemés (' + out.densite + '/h, une nuit complète en porte 11 à 12)';
        return out; }
      out.complet = true;
      out.raison = out.minutes + ' minutes de battements, jusqu\'à ' + ecart + ' min du réveil';
      return out;
    } catch (e) { return null; }
  };

  /* ═══ 2 · L'EMPREINTE DES ENTRÉES ═════════════════════════════════════════
     Tout ce qui entre dans `recovery()`, et rien d'autre. Deux empreintes
     égales DOIVENT donner le même score : c'est ce qui rend l'invariant
     vérifiable au banc plutôt que promis en commentaire. */
  function fnv(t) {
    var h = 0x811c9dc5;
    for (var i = 0; i < t.length; i++) {
      h ^= t.charCodeAt(i);
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return ('0000000' + h.toString(16)).slice(-8);
  }
  function arr(x, d) { return (x == null) ? null : Math.round(x * Math.pow(10, d || 0)) / Math.pow(10, d || 0); }
  function base(f, off) {
    try { var b = window.baseStat(f, 60, off || 0);
          return b ? [arr(b.m, 2), arr(b.sd, 2), b.n || 0] : null; } catch (e) { return null; }
  }

  window.flRecupEmpreinte = function (K, off) {
    var _o = (off == null) ? 0 : off;
    var e = { K: K, gen: null, cycleGen: CYCLE_GEN };
    try { e.gen = (typeof window.RECOV_ALGO_GEN !== 'undefined') ? window.RECOV_ALGO_GEN : null; } catch (x) {}
    var s = null;
    try { s = (typeof window.sensorOf === 'function') ? window.sensorOf(K) : null; } catch (x) {}
    if (s) {
      e.hrv = arr(s.hrv, 1); e.hrvSrc = s.hrvSrc || null; e.hrvN = s.hrvN || 0;
      e.vfcFigee = s.vfcFigee ? 1 : 0; e.vfcMinutes = (s.vfcMinutes != null) ? s.vfcMinutes : null;
      e.rhr = arr(s.rhr, 1); e.resp = arr(s.resp, 2); e.tempNuit = arr(s.tempNuit, 1);
      e.sleepMin = s.sleepMin; e.bedMin = s.bedMin; e.wakeMin = s.wakeMin;
      e.couv = (s.couvertureTranches != null) ? s.couvertureTranches : null;
      e.bord = (s.bordManquant === true) ? 1 : (s.bordManquant === false ? 0 : null);
    }
    e.bH = base('hrv', _o); e.bR = base('rhr', _o); e.bP = base('resp', _o);
    /* LE JOURNAL DE BORD ENTRE DANS L'EMPREINTE, parce qu'il entre dans le
       score (v1846). Le journal du jour J décrit la journée J et marque le
       score du matin J+1 : on lit donc J-1 et J-2, exactement comme
       `flJournalAjust`. */
    try {
      e.jrn1 = JSON.stringify(DB.get('journal_' + tk(_o - 1), null));
      e.jrn2 = JSON.stringify(DB.get('journal_' + tk(_o - 2), null));
    } catch (x) {}
    var t = JSON.stringify(e);
    return { h: fnv(t), e: e };
  };

  /* ═══ 3 · LE JOURNAL DES PUBLICATIONS ═════════════════════════════════════
     Dino, 30 août : « je veux pouvoir répondre précisément à : pourquoi le
     score était 87 à 09:07 puis 70 quelques instants plus tard ». Sans trace
     horodatée des entrées, la réponse ne peut être qu'une hypothèse — c'est
     déjà ce qui s'est passé pour le 86 de 01h01, où la base ne gardait qu'un
     état et le rejeu ne pouvait que comparer deux lectures.
     Cent vingt lignes gardées : de quoi couvrir plusieurs journées de
     déclenchements sans jamais peser sur le stockage. */
  var CAP = 120;
  function ligne(l) {
    return l.t + '  ' + l.K + '  ' + (l.trig || '?') + '  [' + l.cycle + '→' + l.etat + ']  '
         + (l.avant == null ? '—' : l.avant) + '→' + (l.apres == null ? '—' : l.apres)
         + (l.publie ? '  PUBLIÉ' : '  (retenu)')
         + '  h=' + l.h
         + '  vfc=' + (l.hrv == null ? '—' : l.hrv) + (l.hrvSrc ? '/' + l.hrvSrc : '')
         + '  fc=' + (l.rhr == null ? '—' : l.rhr)
         + '  sommeil=' + (l.sleepMin == null ? '—' : l.sleepMin) + ' min'
         + '  [' + (l.bedMin == null ? '—' : l.bedMin) + '→' + (l.wakeMin == null ? '—' : l.wakeMin) + ']'
         + '  n=' + (l.n == null ? '—' : l.n)
         + '  réveil+' + (l.depuisReveil == null ? '—' : l.depuisReveil) + ' min'
         + '  · ' + (l.raison || '');
  }
  function tracer(l) {
    try {
      var j = DB.get('recovJrn', []) || [];
      if (!Array.isArray(j)) j = [];
      j.push(l);
      if (j.length > CAP) j = j.slice(j.length - CAP);
      DB.set('recovJrn', j);
    } catch (e) {}
    try { console.log('[recup] ' + ligne(l)); } catch (e) {}
    try { if (window.flBleLog) window.flBleLog('♻︎ ' + ligne(l)); } catch (e) {}
  }
  window.flRecupJournal = function (n) {
    var j = [];
    try { j = DB.get('recovJrn', []) || []; } catch (e) {}
    if (!Array.isArray(j)) j = [];
    return n ? j.slice(Math.max(0, j.length - n)) : j;
  };
  window.flRecupJournalTexte = function (n) {
    return window.flRecupJournal(n || 40).map(ligne).join('\n');
  };

  /* ═══ 4 · CE QUI AUTORISE UNE RÉOUVERTURE APRÈS LE SCEAU ══════════════════
     Dino : « il peut arriver que des samples arrivent en retard, je ne veux pas
     ignorer des données physiologiques valides — mais il faut une politique
     claire ». La voici, et elle tient en trois refus et deux accords.

     ON REFUSE : une VFC qui bouge d'une milliseconde, une FC de repos qui bouge
     d'un battement, une couverture qui gagne deux minutes. Ce sont les
     variations qui fabriquaient 87 → 82 → 76 ; les laisser rouvrir le sceau
     serait le retirer.

     ON ACCEPTE, UNE FOIS :
       · LA NUIT ELLE-MÊME A CHANGÉ — fenêtre ou durée de sommeil. Ce n'est pas
         un échantillon de plus, c'est une autre nuit ; le score d'une autre
         nuit n'est pas le même score.
       · LE JOURNAL DE BORD A CHANGÉ — c'est un GESTE de la personne, pas une
         dérive de capteur. Refuser de le prendre en compte reviendrait à lui
         demander de renseigner un formulaire sans effet.
     Et une seule fois : `recovReouv_<K>` compte, le second essai est refusé et
     tracé. Une réouverture qui se répète est une oscillation déguisée. */
  function motifReouverture(fige, emp, trig) {
    var a = (fige && fige.e) || {}, b = emp.e || {};
    /* v2046 — même juge que la collecte : un jiggle de re-staging (±5 min) ne
       consomme pas l'unique réouverture. Seule une nuit VRAIMENT changée. */
    if (nuitABouge(a, b))
      return 'la nuit a changé (' + a.sleepMin + '→' + b.sleepMin + ' min, '
           + a.bedMin + '→' + b.bedMin + ' / ' + a.wakeMin + '→' + b.wakeMin + ')';
    if (a.jrn1 !== b.jrn1 || a.jrn2 !== b.jrn2)
      return 'le journal de bord a été renseigné';
    if (trig === 'journal') return 'demande explicite du journal de bord';
    return null;
  }

  /* ═══ 5 · LA PUBLICATION, ATOMIQUE ════════════════════════════════════════
     Toutes les écritures d'une publication tiennent dans le même bloc
     synchrone, après que tout a été calculé : jamais un score sans son
     empreinte, jamais une empreinte sans son score. */
  /* v2047 — LE SCEAU S'ÉCRIT EN PREMIER, ET UN ÉCHEC SE DIT. L'ancien ordre
     enchaînait quatre DB.set sans lire un seul retour : à stockage plein,
     `recovFige_` (le plus gros des quatre — il porte l'instantané des entrées)
     pouvait échouer APRÈS `recov_`, et un score annoncé « scellé » redevenait
     vivant en silence — signalé par la session commercialisation, reste n°4
     de son rapport. Désormais :
       · le sceau part en PREMIER : s'il échoue, rien d'autre n'est dégradé —
         le score reste publié `provisoire`, ce qui est la vérité (un sceau
         qui n'existe pas sur le disque n'est pas un sceau) ;
       · chaque retour est lu ; `recov_` qui échoue est crié (flAlerteRecup)
         ET tracé au journal — c'est le nombre que l'écran affiche ;
       · la fonction REND ce qui a vraiment été écrit, et la publication
         rétrograde son état en conséquence. `DB.set` fait déjà de la place et
         réessaie une fois (doctrine maison) : ici on ne réessaie pas, on dit. */
  function ecrire(K, s, emp, ajust, final, cyc) {
    var res = { score: false, sceau: !final ? null : false };
    if (final) {
      res.sceau = !!DB.set('recovFige_' + K, { s: s, h: emp.h, e: emp.e,
                                               ts: new Date().toISOString(), cycleGen: CYCLE_GEN });
      if (!res.sceau) {
        try { if (typeof window.flAlerteRecup === 'function')
          window.flAlerteRecup('scellement échoué', K + ' — stockage plein, le score reste provisoire'); } catch (e) {}
      }
    }
    res.score = !!DB.set('recov_' + K, s);
    if (!res.score) {
      try { if (typeof window.flAlerteRecup === 'function')
        window.flAlerteRecup('écriture du score échouée', K + ' — stockage plein'); } catch (e) {}
    }
    try {
      if (ajust) DB.set('recovAj_' + K, ajust);
      else if (DB.get('recovAj_' + K, null) != null) DB.set('recovAj_' + K, 0);
    } catch (e) {}
    DB.set('recovEtat_' + K, { etat: (final && res.sceau) ? 'finale' : 'provisoire', h: emp.h,
                               ts: new Date().toISOString(), cycle: cyc.etat, cycleGen: CYCLE_GEN });
    return res;
  }

  /* La mémoire de lecture. Elle n'est PAS un cache d'affichage : elle garantit
     que deux lectures séparées par zéro changement d'entrée ne peuvent pas
     produire deux nombres — c'est l'invariant lui-même, tenu à l'exécution.
     Sa clé est l'empreinte : une entrée qui bouge la fait tomber d'elle-même. */
  var memo = null;

  /* ═══ v2184 — LE TROISIÈME ARGUMENT, ET IL N'A QU'UN SEUL APPELANT ═══════
     `forcerFinale` est la clé de la porte du matin (`flint-nuit-matin.js`).
     Tant qu'une session de nuit existe et n'est pas FINALIZED, cette fonction
     ne publie RIEN — c'est ce qui ferme d'un coup les cinq nombres qu'une
     seule nuit pouvait produire (première publication en `grace`, trois
     republications à ±3 points, une réouverture après sceau). Le pipeline de
     finalisation, lui, passe `true` : il est le seul, et il n'appelle qu'une
     fois.
     Et ce `true` autorise AUSSI le sceau en `grace` : un clic sur « Traiter »
     est une déclaration (« ma nuit est finie »), exactement comme TRAITER sur
     une séance depuis la v1236. Sans geste, on continue d'exiger `finale`. */
  window.flRecupPublier = function (K, trig, forcerFinale) {
    K = K || tk(0);
    trig = trig || 'lecture';
    var res = { K: K, s: null, etat: null, attente: false, publie: false, raison: null, h: null };
    try {
      if (forcerFinale !== true && typeof window.flNuitPublicationOuverte === 'function') {
        if (!window.flNuitPublicationOuverte(K)) {
          res.attente = true;
          res.raison = 'la nuit de ce matin n\'est pas finalisée — rien ne se publie avant';
          return res;
        }
        /* FINALISÉE = CLOSE. On relit le registre, on ne rejuge rien : ni la
           republication à trois points (v2134), ni l'unique réouverture après
           sceau. Les deux existaient parce que le journal de bord et la fin de
           livraison arrivaient APRÈS le score ; dans le nouvel ordre ils
           arrivent avant, et un nombre déjà lu ne doit plus bouger. */
        if (typeof window.flNuitVerrouillee === 'function' && window.flNuitVerrouillee(K)) {
          var _f = null, _p2 = null;
          try { _f = DB.get('recovFige_' + K, null); } catch (e) {}
          try { _p2 = DB.get('recov_' + K, null); } catch (e) {}
          if (_f && _f.s != null) { res.s = Math.round(_f.s); res.etat = 'finale'; }
          else if (_p2 != null && !isNaN(+_p2)) { res.s = Math.round(+_p2); res.etat = 'provisoire'; }
          res.raison = 'nuit finalisée — le score se relit, il ne se rejuge plus';
          return res;
        }
      }
      var cyc = window.flNuitCycle(K);
      res.cycle = cyc.etat;
      res.depuisReveil = cyc.depuisReveil;
      /* la panne remonte jusqu a la porte, qui tient le filet (v2038) */
      if (cyc.panne) { res.panne = cyc.panne; res.raison = cyc.raison; return res; }
      var emp = window.flRecupEmpreinte(K, 0);
      res.h = emp.h;

      var pub = DB.get('recov_' + K, null);
      pub = (pub != null && !isNaN(+pub)) ? Math.round(+pub) : null;

      /* ── LE SCEAU ─────────────────────────────────────────────────────────
         Aucun calcul n'est lancé ici : c'est ça, « ne plus recalculer
         spontanément ». On ne compare que des empreintes. */
      var fige = DB.get('recovFige_' + K, null);
      if (fige && fige.s != null) {
        res.s = Math.round(fige.s); res.etat = 'finale';
        if (fige.h === emp.h) { res.raison = 'score scellé, entrées inchangées'; return res; }
        var motif = motifReouverture(fige, emp, trig);
        if (!motif) { res.raison = 'score scellé — dérive tardive sans portée, ignorée'; return res; }
        var deja = +DB.get('recovReouv_' + K, 0) || 0;
        if (deja >= 1) {
          res.raison = 'score scellé — une réouverture a déjà eu lieu, la seconde est refusée';
          tracer({ t: new Date().toISOString(), K: K, trig: trig, cycle: cyc.etat, etat: 'finale',
                   avant: res.s, apres: res.s, publie: false, h: emp.h, raison: res.raison,
                   hrv: emp.e.hrv, hrvSrc: emp.e.hrvSrc, rhr: emp.e.rhr, sleepMin: emp.e.sleepMin,
                   bedMin: emp.e.bedMin, wakeMin: emp.e.wakeMin, n: emp.e.hrvN,
                   depuisReveil: cyc.depuisReveil });
          return res;
        }
        var vr = null;
        try { vr = window.recovery(0); } catch (e) {}
        if (!vr || vr.s == null) { res.raison = 'réouverture impossible : le calcul ne rend rien'; return res; }
        var sn = Math.round(vr.s), avant = res.s;
        DB.set('recovReouv_' + K, deja + 1);
        if (DB.get('recovAvant_' + K, null) == null) DB.set('recovAvant_' + K, avant);
        var _er = ecrire(K, sn, emp, (vr.journalAjust && vr.journalAjust.total) || 0, true, cyc);
        if (_er && _er.sceau === false) res.etat = 'provisoire';
        memo = null;
        if (forcerFinale !== true) {          /* même raison qu'à la publication */
          try { if (typeof window.flRafraichirDouce === 'function') window.flRafraichirDouce(); } catch (e) {}
        }
        res.s = sn; res.publie = true; res.raison = 'réouverture contrôlée : ' + motif;
        tracer({ t: new Date().toISOString(), K: K, trig: trig, cycle: cyc.etat, etat: 'finale',
                 avant: avant, apres: sn, publie: true, h: emp.h, raison: res.raison,
                 hrv: emp.e.hrv, hrvSrc: emp.e.hrvSrc, rhr: emp.e.rhr, sleepMin: emp.e.sleepMin,
                 bedMin: emp.e.bedMin, wakeMin: emp.e.wakeMin, n: emp.e.hrvN,
                 depuisReveil: cyc.depuisReveil });
        return res;
      }

      /* ── LA MÉMOIRE : même empreinte, même réponse, sans recalculer ──────── */
      if (memo && memo.K === K && memo.h === emp.h && memo.cycle === cyc.etat) {
        res.s = memo.s; res.etat = memo.etat; res.attente = memo.attente;
        res.raison = 'inchangé depuis la dernière lecture';
        return res;
      }

      if (cyc.etat === 'sansNuit' || cyc.etat === 'sommeil') {
        res.attente = (cyc.etat === 'sommeil');
        res.raison = cyc.raison;
        memo = { K: K, h: emp.h, cycle: cyc.etat, s: null, etat: null, attente: res.attente };
        return res;
      }

      /* ── COLLECTE : ON NE PUBLIE RIEN ────────────────────────────────────
         C'est LA ligne qui empêche 87. Le score n'est pas caché : il n'existe
         pas encore, parce que la nuit sur laquelle il porterait n'est pas
         entièrement arrivée. L'accueil se replie sur la veille EN LE DISANT
         (`scoreEstVeille`, v1874) et le natif écrit « calcul en cours ». */
      /* ═══ v2210 — SAUF QUAND LA FINALISATION A DÉJÀ TRANCHÉ ════════════════

         MESURÉ EN REJOUANT LA NUIT DU 3 SEPTEMBRE, une nuit PARFAITE : 210 blocs
         d'intervalles, la montre a tout livré. `flNuitFinaliser` saute la
         fenêtre d'observation à bon droit (« battements complets jusqu'au
         réveil »), scelle 7 h 10 et le score de sommeil 80 … et l'anneau reste
         vide, parce qu'ICI on relit le cycle pour notre compte et qu'il répond
         `collecte` — « la nuit a changé il y a 0 s », vrai, puisqu'elle vient
         d'être scellée à la milliseconde près.

         C'est la même faute que dix lignes plus bas, et il faut la nommer une
         fois pour toutes : la fenêtre d'observation appartient à la machine du
         matin, pas à la récupération. Quand `flNuitFinaliser` appelle, la
         décision de publier est PRISE — elle a passé ses propres portes, qui
         sont plus strictes que celle-ci (cycle, matière, réveil déclaré,
         plafond d'attente). Lui opposer un second avis, c'est produire une nuit
         scellée sans score, définitivement : la session est finalisée, plus rien
         ne repassera.

         ⚠️ ET SEULEMENT POUR ELLE. Toute autre lecture — une charge d'accueil,
         une synchro — retombe sur la règle d'avant : en collecte, on ne publie
         rien. C'est elle qui empêche le 87 du 30 août. */
      if (cyc.etat === 'collecte' && forcerFinale !== true) {
        res.attente = true; res.s = pub; res.etat = pub != null ? 'provisoire' : null;
        res.raison = cyc.raison;
        memo = { K: K, h: emp.h, cycle: cyc.etat, s: res.s, etat: res.etat, attente: true };
        return res;
      }

      /* ── GRÂCE ou FINALE : la livraison est close, on peut juger ────────── */
      var v = null;
      try { v = window.recovery(0); } catch (e) {}
      if (!v || v.s == null) {
        res.attente = true; res.s = pub; res.etat = pub != null ? 'provisoire' : null;
        res.raison = 'le calcul ne rend rien (' + cyc.raison + ')';
        memo = { K: K, h: emp.h, cycle: cyc.etat, s: res.s, etat: res.etat, attente: true };
        return res;
      }
      var neuf = Math.round(v.s);
      /* v2184 — la déclaration de l'utilisateur scelle en `grace`. Voir le
         pavé du troisième argument, en tête de cette fonction. */
      /* v2210 — `collecte` entre ici depuis que la finalisation peut passer
         devant (voir le pavé plus haut). Un score qui sort du sceau du matin
         est SCELLÉ comme lui : le publier « provisoire » rouvrirait la porte
         aux corrections successives que tout ce chantier ferme. Les deux états
         où l'on ne scelle jamais restent hors du lot : sans nuit, et nuit qui
         court encore — mais `flNuitFinaliser` ne va pas jusqu'ici dans ces
         cas-là, ses propres portes ont déjà refusé. */
      var final = (cyc.etat === 'finale')
               || (forcerFinale === true && (cyc.etat === 'grace' || cyc.etat === 'collecte'));

      /* QUAND REPUBLIE-T-ON, ET SEULEMENT ALORS :
         · rien n'a encore été publié — la première valeur vue ;
         · on scelle — le sceau doit porter le score de son propre instantané ;
         · la NUIT a changé depuis la publication — un rendormissement s'est
           recollé, c'est un événement, pas du bruit ;
         · le journal de bord a été renseigné — c'est un geste ;
         · v2134 — LE SCORE LUI-MÊME A BOUGÉ DE PLUS DE TROIS POINTS.
         Tout le reste (une VFC qui gagne une minute de mesure, une FC de repos
         qui descend d'un battement) NE REPUBLIE PAS : le nombre affiché tient. */

      /* ═══ v2134 — « LE NOMBRE AFFICHÉ TIENT » TENAIT TROP ═══════════════════

         LES DEUX MATINS QUI L'ONT MONTRÉ, mesurés en rejouant le moteur POSÉ
         sur la base rapatriée du 2 septembre :

             1er sept.   registre 78   nuit terminée 68    +10
             2  sept.    registre 38   nuit terminée 27    +11

         Deux fois de suite, le nombre publié le matin est dix points au-dessus
         de ce que la nuit, une fois entièrement arrivée, vaut vraiment. Et il
         ne se corrige JAMAIS dans la journée : il n'est repris qu'au sceau.

         LA CAUSE EST DANS LA LISTE CI-DESSUS. Elle ne surveille que la FENÊTRE
         de sommeil et le journal. Or ce qui bouge le matin, ce n'est pas la
         fenêtre — elle se fige vite — ce sont les MESURES qui la remplissent :
         le 2 septembre, le RMSSD médian de la nuit vaut 36 ms sur les quinze
         premières minutes de battements livrées, et 48 ms sur cent une. La
         nuit n'a pas bougé d'une minute ; le score, lui, a changé de zone.

         POURQUOI LA RÈGLE ÉTAIT JUSTE ET LE SEUIL FAUX. Les exemples qu'elle
         cite — « une VFC qui gagne une minute de mesure », « une FC de repos
         qui descend d'un battement » — sont des variations d'un point ou moins.
         Ce fichier le chiffre lui-même deux cents lignes plus haut : cinq
         minutes de sommeil déplacent le score de MOINS D'UN POINT. Le seuil
         qui manquait vit donc entre ce bruit-là et l'erreur mesurée :

             bruit que la v2037 voulait absorber   < 1 point
             SEUIL_REPUB                             3 points
             erreur constatée les 1er et 2 sept.    10 points

         ON JUGE PAR LA CONSÉQUENCE, PAS PAR LE CHAMP. C'est déjà la doctrine
         d'après le sceau (`motifReouverture` refuse « une dérive tardive sans
         portée ») ; elle valait avant lui, et elle n'y était pas.

         CE QUE ÇA NE ROUVRE PAS. Le 87 → 70 → 71 du 30 août reste impossible :
         `collecte` ne publie toujours rien, la première publication attend la
         grâce, et sous trois points le nombre ne bouge pas — 70 → 71 serait
         refusé. Le sceau, lui, garde sa règle inchangée et son unique
         réouverture.

         ET UN PLAFOND, parce qu'un score qui se corrige quatre fois n'informe
         plus. Au-delà, on tient et on TRACE : le journal dira que la matière
         arrivait encore, ce qui est une information sur la synchro, pas sur le
         corps. */
      var SEUIL_REPUB = 3, REPUB_MAX = 3;

      /* ═══ v2139 — LA PREMIÈRE PUBLICATION ATTEND LA MATIÈRE ════════════════

         Dino, en voyant son 38 devenir 27 : « quand on se lève le matin, on est
         censé avoir son VRAI score. » Il a raison, et corriger un chiffre reste
         moins bien que ne le publier qu'une fois.

         LA v2134 RÉPARAIT LA CONSÉQUENCE, celle-ci s'attaque à la cause : ne
         rien publier tant que les battements de la nuit ne sont pas arrivés.
         `flMesureNuitComplete` sait le dire, et ce n'est pas un événement de
         synchro — c'est une propriété de la matière elle-même (la fin de nuit
         est là, la densité est celle d'une nuit complète).

         TROIS PORTES, ET DEUX SONT BORNÉES — parce que le seul échec
         inacceptable est celui qui ne publie JAMAIS :

           ① la nuit est complète                       → on publie ;
           ② les battements n'ont plus bougé depuis 5 min → la livraison est
              finie ou en panne, dans les deux cas on ne gagnera plus rien à
              attendre. Même mécanisme que la signature de nuit deux cents
              lignes plus haut, et le même délai que le plus long silence
              mesuré en pleine livraison (4 min 20) ;
           ③ deux heures après le réveil                → on publie ce qu'on a,
              quoi qu'il arrive. Le 2 septembre la nuit était complète moins de
              90 min après le réveil ; deux heures laissent de la marge sans
              jamais laisser l'écran vide une matinée entière.

         ⚠️ CETTE PORTE NE GARDE QUE LA PREMIÈRE PUBLICATION. Une fois un
         chiffre affiché, il ne doit plus attendre quoi que ce soit : c'est la
         republication à trois points (v2134) qui prend le relais, et le sceau
         garde sa règle. On ne fait pas disparaître un score déjà vu.

         ⚠️ ET ELLE NE TOUCHE PAS AU CYCLE. `flNuitCycle` répond à « la nuit
         peut-elle encore bouger » ; cette porte-ci répond à « ai-je de quoi la
         juger ». Les mêler ferait dire au cycle une chose qu'il ne mesure pas —
         et `repris` (la journée a repris) l'aurait court-circuitée dans les
         minutes suivant le lever. */
      var motifPub = null;
      if (pub == null) {
        var mes = null;
        try { mes = window.flMesureNuitComplete(K); } catch (e) {}
        var attendre = !!(mes && mes.complet === false);
        /* ═══ v2210 — DEUX PORTES SUR LA MÊME QUESTION, ET UNE SEULE DÉCIDE ══

           MESURÉ EN REJOUANT LA NUIT DU 4 SEPTEMBRE (`rejeu-matin-v2210.js`).
           La nuit est scellée — 6 h 01, score de sommeil 69 — et `recovery()`
           rend 67, état PRÊT. Pourtant l'anneau reste vide, et pour toujours :
           cette porte-ci a refusé de publier (« les battements arrivent encore,
           48 min avant le réveil ») pendant que la machine du matin, elle,
           venait de décider de sceller.

           LA FAUTE N'EST PAS DANS LA PORTE, ELLE EST DANS SA PLACE. La question
           « ai-je de quoi juger cette nuit » est posée DEUX fois : par
           `flNuitMatiere`, qui appartient à `flNuitFinaliser` et porte les
           mêmes bornes, et par celle-ci. Tant qu'elles s'accordent, personne ne
           le voit. Le jour où la première dit « on publie ce qu'on a » et que
           la seconde dit non, la nuit est scellée SANS son score — et comme la
           session est finalisée, plus rien ne repassera jamais.

           Le troisième argument dit exactement « c'est la finalisation qui
           appelle, la décision est prise ». Elle a déjà pesé la matière ; on ne
           la rejuge pas ici. Le sceau du matin est atomique ou il n'est rien. */
        if (attendre && forcerFinale === true) {
          attendre = false;
          res.mesure = 'la finalisation a tranché — nuit et récupération scellées ensemble';
        }
        if (attendre) {
          var vu = DB.get('recovMes_' + K, null);
          var stable = !!(vu && vu.n === mes.minutes && (Date.now() - (vu.t || 0)) >= 300000);
          if (!vu || vu.n !== mes.minutes) {
            try { DB.set('recovMes_' + K, { n: mes.minutes, t: Date.now() }); } catch (e) {}
          }
          var tard = (cyc.depuisReveil != null && cyc.depuisReveil >= 120);
          if (stable) { res.mesure = 'livraison silencieuse depuis 5 min'; }
          else if (tard) { res.mesure = 'deux heures après le réveil — on publie ce qu\'on a'; }
          else {
            res.attente = true; res.etat = null; res.s = null;
            res.raison = 'les battements de la nuit arrivent encore — ' + mes.raison;
            res.mesure = mes;
            memo = { K: K, h: emp.h, cycle: cyc.etat, s: null, etat: null, attente: true };
            return res;
          }
        }
        motifPub = 'première publication de la nuit';
      }
      else if (final) motifPub = 'finalisation de la nuit';
      else {
        var ref = DB.get('recovSnap_' + K, null);
        if (ref && nuitABouge(ref, emp.e)) motifPub = 'la nuit s\'est recollée';
        else if (ref && (ref.jrn1 !== emp.e.jrn1 || ref.jrn2 !== emp.e.jrn2))
          motifPub = 'le journal de bord a été renseigné';
        else if (Math.abs(neuf - pub) >= SEUIL_REPUB) {
          var repub = +DB.get('recovRepub_' + K, 0) || 0;
          if (repub < REPUB_MAX) {
            motifPub = 'le score a bougé de ' + (neuf - pub > 0 ? '+' : '')
                     + (neuf - pub) + ' points pendant que la nuit finissait d\'arriver';
            try { DB.set('recovRepub_' + K, repub + 1); } catch (e) {}
          } else {
            tracer({ t: new Date().toISOString(), K: K, trig: trig, cycle: cyc.etat,
                     etat: 'provisoire', avant: pub, apres: neuf, publie: false, h: emp.h,
                     raison: 'plafond de republication atteint (' + REPUB_MAX + ') — la matière arrive encore',
                     hrv: emp.e.hrv, hrvSrc: emp.e.hrvSrc, rhr: emp.e.rhr,
                     sleepMin: emp.e.sleepMin, bedMin: emp.e.bedMin, wakeMin: emp.e.wakeMin,
                     n: emp.e.hrvN, depuisReveil: cyc.depuisReveil });
          }
        }
      }

      if (motifPub == null) {
        res.s = pub; res.etat = 'provisoire'; res.raison = 'score provisoire tenu — ' + cyc.raison;
        memo = { K: K, h: emp.h, cycle: cyc.etat, s: pub, etat: 'provisoire', attente: false };
        return res;
      }

      var _ec = ecrire(K, neuf, emp, (v.journalAjust && v.journalAjust.total) || 0, final, cyc);
      /* un sceau qui n'a pas pu s'écrire n'est pas un sceau : l'état publié le dit */
      if (final && _ec && _ec.sceau === false) final = false;
      try { DB.set('recovSnap_' + K, emp.e); } catch (e) {}
      /* v2042 — UNE PUBLICATION SE MONTRE. Sans cette poussée, le score publié
         attendait le prochain geste de l'utilisateur pendant que les écrans
         natifs servaient leur charge d'avant — le 52 restait affiché avec un 70
         au registre. La poussée est DOUCE (coalescée, silencieuse) et le memo
         empêche toute boucle : le rendu qu'elle déclenche relira la même
         empreinte et ne republiera pas. */
      /* v2184 — LA FINALISATION POUSSE ELLE-MÊME, ET UNE SEULE FOIS.
         Quand c'est le pipeline du matin qui publie (`forcerFinale`), cette
         poussée-ci ferait DEUX mises à jour d'écran pour un seul événement —
         la publication cesserait d'être atomique. Le pipeline pousse après
         avoir tout écrit ; ici on se tait. Hors de ce cas, rien ne change. */
      if (forcerFinale !== true) {
        try { if (typeof window.flRafraichirDouce === 'function') window.flRafraichirDouce(); } catch (e) {}
      }
      res.s = neuf; res.etat = final ? 'finale' : 'provisoire'; res.publie = true; res.raison = motifPub;
      memo = { K: K, h: emp.h, cycle: cyc.etat, s: neuf, etat: res.etat, attente: false };
      tracer({ t: new Date().toISOString(), K: K, trig: trig, cycle: cyc.etat, etat: res.etat,
               avant: pub, apres: neuf, publie: true, h: emp.h, raison: motifPub,
               hrv: emp.e.hrv, hrvSrc: emp.e.hrvSrc, rhr: emp.e.rhr, sleepMin: emp.e.sleepMin,
               bedMin: emp.e.bedMin, wakeMin: emp.e.wakeMin, n: emp.e.hrvN,
               depuisReveil: cyc.depuisReveil });
      return res;
    } catch (e) { res.panne = e.message; res.raison = 'publication : ' + e.message; return res; }
  };

  /* Le sceau se pose aussi quand PERSONNE NE REGARDE. Sans ça, une nuit dont
     la fenêtre de grâce se ferme pendant que l'app est au fond du tiroir ne
     serait scellée qu'à la prochaine ouverture — et jusque-là, chaque réveil
     de l'app aurait le droit de republier. Appelé aux mêmes occasions que les
     autres réparations (`_flPasseReparation`). */
  window.flRecupSceller = function (trig) {
    try {
      var K = tk(0);
      if (DB.get('recovFige_' + K, null)) return 'deja';
      var c = window.flNuitCycle(K);
      if (c.etat !== 'finale') return c.etat;
      return window.flRecupPublier(K, trig || 'sceau');
    } catch (e) { return null; }
  };

  /* La question qu'un écran pose : « qu'est-ce que je montre ? ». Une seule
     réponse possible, celle du registre publié. */
  window.flRecupEtat = function (off) {
    var _o = Math.min(0, (off || 0));
    if (_o !== 0) {
      var K = tk(_o), r = null;
      try { r = DB.get('recov_' + K, null); } catch (e) {}
      return { s: (r != null && !isNaN(+r)) ? Math.round(+r) : null, etat: 'finale', attente: false };
    }
    return window.flRecupPublier(tk(0), 'lecture');
  };

  /* Pour l'atelier et les bancs : oublier la mémoire de lecture sans toucher
     au registre. Ne remet AUCUN score en cause — elle ne fait que forcer la
     relecture des entrées. */
  window.flRecupOublierMemo = function () { memo = null; };
})();


/* ═══ DÉMÉNAGÉS D'index.html LE 30 AOÛT (cliquet du découpage) — à
   l'identique, aucune ligne de logique changée. ═══════════════════════════ */
/* ═══ v2038 — LE FILET : UN SCORE CALCULABLE NE SE CACHE JAMAIS ═════════════
   Dino, 30 aout, apres avoir vu 52 (le score d hier) alors que le calcul rendait
   70 : « je ne veux plus JAMAIS que ca arrive ».

   CE QUI S EST PASSE, ET C EST LA VRAIE LECON. Mon cycle lisait la base par
   `window.DB` — un chemin qui n existe pas dans un navigateur. Il levait a
   chaque appel, son `try` avalait l erreur, et il repondait poliment « pas de
   score ». `flRecovLu` a cru sur parole, a rendu `null`, et l accueil s est
   replie sur la veille. Le nombre du jour EXISTAIT : `recovery(0)` rendait 70.

   LE DEFAUT N EST DONC PAS LA FAUTE DE FRAPPE — elle est corrigee, et un banc
   la tient. LE DEFAUT EST QU UNE PANNE DU CYCLE POUVAIT SE FAIRE PASSER POUR
   UNE ABSENCE DE DONNEES. C est la meme famille que le repli qui ne se declare
   pas (v1219, v1874) : une erreur silencieuse ressemble a un chiffre.

   L INVARIANT QUE CETTE PORTE TIENT DESORMAIS, et le banc l epingle :

       la porte ne rend `null` que si `recovery(0)` rend `null` AUSSI,
       ou si le cycle declare une ATTENTE (livraison en cours).

   Toute autre combinaison est une panne : on sert le calcul brut — le
   comportement d avant le cycle, jamais un ecran vide — et on CRIE (console,
   journal du bracelet, cle `recovPanne` rapatriable). Le cycle peut tomber
   entier : au pire on retrouve l ancien comportement, jamais le score d hier
   a la place de celui d aujourd hui.

   ⚠️ L ATTENTE DECLAREE RESTE LE SEUL CAS OU ON NE PUBLIE PAS. C est tout
   l objet du chantier (le 87 de 09:07) : pendant que la montre livre, on ne
   montre pas un chiffre provisoire. Le filet ne l annule pas — il exige
   seulement que le silence soit VOULU et NOMME. */
window.flAlerteRecup=function(quoi,detail){try{
 var m='récupération — '+quoi+(detail?' : '+detail:'');
 try{console.error('[flint] '+m);}catch(e){}
 try{if(window.flBleLog)window.flBleLog('⚠️ '+m);}catch(e){}
 /* Une seule ecriture par cause et par session : la cle est rapatriable, elle
    ne doit pas devenir un journal a elle seule. */
 window._flPannesRecup=window._flPannesRecup||{};
 if(window._flPannesRecup[quoi])return;
 window._flPannesRecup[quoi]=1;
 try{var j=DB.get('recovPanne',[])||[];if(!Array.isArray(j))j=[];
  j.push({t:new Date().toISOString(),quoi:quoi,detail:detail||null});
  if(j.length>20)j=j.slice(j.length-20);
  DB.set('recovPanne',j);}catch(e){}
}catch(e){}};
window.flRecovLu=function(off){
 var _o=Math.min(0,(off||0));
 if(_o===0){
  var _brut=null;
  try{_brut=(typeof recovery==='function')?recovery(0):null;}catch(e){_brut=null;}
  if(typeof window.flRecupPublier!=='function'){
   if(_brut)window.flAlerteRecup('cycle absent','le web servi est incomplet');
   return _brut;
  }
  var _p=null,_panne=null;
  try{_p=window.flRecupPublier(tk(0),'lecture');}catch(e){_panne=(e&&e.message)||'exception';}
  /* v2045 — TOUTE LECTURE RETENUE ARME LE RÉVEIL. La collecte tient désormais
     sur la stabilité de la nuit (signature, 2 min) : quand elle retient, il
     faut que QUELQU'UN relise à l'expiration — sinon la publication attend le
     prochain hasard, et le hasard s'appelle 52 (vécu trois fois ce matin). Le
     réveil est réarmé à chaque lecture retenue et sonne 125 s plus tard :
     la constante de la collecte, plus la marge. */
  try{if(_p&&_p.attente===true&&typeof window.flRecupReveilArmer==='function')
   window.flRecupReveilArmer();}catch(e){}
  if(!_panne&&_p&&_p.panne)_panne=_p.panne;
  if(!_panne&&(!_p||(_p.s==null&&_p.attente!==true&&_brut&&_brut.s!=null)))
   _panne='le cycle ne rend rien alors que le calcul rend '+Math.round(_brut.s);
  if(_panne){
   window.flAlerteRecup('cycle en panne',_panne);
   return _brut;                      /* le calcul brut, jamais la veille */
  }
  if(!_p||_p.s==null)return null;
  var _rv={s:Math.round(_p.s),etat:_p.etat,fige:(_p.etat==='finale')};
  var _zz0=_rv.s>=67?['HAUTE','var(--green)','Ton corps est bien récupéré. Conditions optimales pour performer.','PRÊT']
        :_rv.s>=34?['MODÉRÉE','var(--amber)','Récupération correcte. Vise une charge modérée aujourd\'hui.','OK']
        :['BASSE','var(--accent)','Récupération basse. Priorise le repos et le sommeil.','REPOS'];
  _rv.zone=_zz0[0];_rv.color=_zz0[1];_rv.reco=_zz0[2];_rv.state=_zz0[3];
  return _rv;
 }
 var K=tk(_o);
 var _v=null;
 var _r=DB.get('recov_'+K,null);
 var _reg=(_r!=null&&!isNaN(+_r));
 /* ═══ 14 sept. 2026 — LE REGISTRE D'UN JOUR PASSÉ SE CORRIGE QUAND SA NUIT A
    BOUGÉ, ET SEULEMENT LÀ ═══════════════════════════════════════════════════

    LE DÉFAUT : cette branche écrivait `recov_<K>` au PREMIER score calculé et le
    figeait pour toujours. Quand cette première lecture tombe pendant que le
    bracelet livre encore la nuit par tranches — le cas de tout jour où l'app
    n'a pas tourné, et c'est l'accueil préchargeant la veille qui la déclenche —
    le registre garde la tranche initiale. Mesuré au banc § 3 : 150 min → 15
    retenu, pour une nuit qui fait 403 et vaut 40.

    CE QU'ON NE FAIT PAS, ET C'EST MESURÉ AUSSI : refuser d'écrire tant que
    `flNuitCycle` dit « collecte » (essayé le 13, retiré le 14). Il répond
    « collecte » dès la PREMIÈRE vue d'une nuit ; or ici la première vue, c'est
    justement le jour que ce registre est SEUL à remplir. Base de Dino,
    balayage 0..-35 : 25 entrées tombaient à 22, trous sur des nuits pourtant
    COMPLÈTES (417 min, couverture 100 %), et la flamme « N jours de suite »
    (`recovStreak`, qui s'arrête au premier jour absent) passait de 13 à 0.

    LA DIFFÉRENCE QUI MANQUAIT EST LÀ : sur un chemin de LECTURE, personne ne
    revient — `flRafraichirDonnees` sort d'emblée sur un jour passé et
    `flRecovRejuger` fait `if(r==null) continue`. Attendre, c'est perdre le jour
    pour de bon ; la seule issue est de CORRIGER. On écrit donc toujours (aucun
    trou : `recovStreak`, la case du calendrier, `PontJournalMatin` gardent leur
    jour), et on estampille À CÔTÉ la nuit mesurée — `recovNuitReg_<K>`, jamais
    dans `recov_<K>` qui doit rester un NOMBRE pour ses 38 sites de lecture
    (34 dans le web, 4 dans le natif — comptés le 14 sept.). À la
    lecture suivante, si cette nuit a bougé de plus que le seuil que la maison
    sanctionne déjà (`flNuitABouge`, 5 min — le seuil du cycle, pas un second
    réglage), l'entrée décrit une nuit qui n'existe plus : on recalcule, on
    réécrit, et on garde la première valeur vue dans `recovAvant_<K>` comme le
    fait déjà le rejugement de génération. Ce n'est pas une doctrine neuve :
    la gén. 16 (`RECOV_ALGO_GEN`) a été posée le 9 sept. pour « rejuger les
    jours scelles avant leur nuit complete » — même panne, corrigée à la main.

    LES BORNES, pour qu'un nombre déjà vu ne se mette pas à danser :
     · une nuit de BRACELET seulement (une nuit saisie ou semée arrive d'un
       coup, rien ne la fera bouger — même règle que `flNuitCycle`) ;
     · dans l'horizon d'une livraison en retard que le cycle fixe déjà : 1 à 3
       jours. Au-delà, l'entrée est figée comme avant ;
     · jamais un jour SCELLÉ (`recovFige_`) : le sceau a sa propre réouverture
       contrôlée, et v2184 interdit que les deux divergent (sceau 78 / registre
       69 le 1er sept., neuf points sous les yeux de Dino) ;
     · jamais sans estampille : les entrées écrites avant ce jour n'en ont pas,
       elles ne bougeront donc jamais. La correction ne vaut que vers l'avant.

    ET ON LE DÉCLARE : tant que l'entrée est corrigible, la porte rend
    `fige:false` et `etat:'provisoire'` — un repli qui ne se déclare pas n'est
    pas un repli (v1874). `flAccueilData` le relaie dans `scoreEtat`. */
 var _age=-_o, _sn=null, _corr=false;
 if(_age>=1&&_age<=3&&DB.get('recovFige_'+K,null)==null){
  try{ var _sp=(typeof window.sensorOf==='function')?window.sensorOf(K):null;
   if(_sp&&_sp._watch&&_sp.sleepMin!=null)
    _sn={sleepMin:_sp.sleepMin,bedMin:_sp.bedMin,wakeMin:_sp.wakeMin};
  }catch(e){}
 }
 if(_sn&&_reg){
  var _es=null; try{_es=DB.get('recovNuitReg_'+K,null);}catch(e){}
  try{_corr=!!(_es&&typeof window.flNuitABouge==='function'&&window.flNuitABouge(_es,_sn));}catch(e){_corr=false;}
 }
 if(_reg&&!_corr){ _v={s:Math.round(+_r),fige:!_sn}; if(_sn)_v.etat='provisoire'; }
 else {
  _v=(typeof recovery==='function')?recovery(_o):null;
  if(_v&&_v.s!=null){ try{
   /* la première valeur vue reste la première, comme au rejugement de
      génération : sans cette trace, personne ne saurait que 15 a existé. */
   if(_corr&&Math.round(_v.s)!==Math.round(+_r)&&DB.get('recovAvant_'+K,null)==null)
    DB.set('recovAvant_'+K,Math.round(+_r));
   DB.set('recov_'+K,Math.round(_v.s));
   if(_sn)DB.set('recovNuitReg_'+K,_sn);
   /* v1846 — l'ajustement journal se fige AVEC le score : sans cette trace,
      l'analyse d'impact corrélerait notre propre malus (doctrine flJournalAjust).
      À la correction il doit SUIVRE, y compris en redevenant zéro : une trace
      périmée ferait corréler notre propre malus à la nuit d'à côté (même règle
      qu'au rejugement de génération). */
   if(_v.journalAjust&&_v.journalAjust.total)DB.set('recovAj_'+K,_v.journalAjust.total);
   else if(_corr&&DB.get('recovAj_'+K,null)!=null)DB.set('recovAj_'+K,0);}catch(e){}
   /* UN JOUR, UNE RÉPONSE : le calcul frais dit la même chose que le registre.
      Avant, la même journée rendait `fige` absent à la 1re lecture et `true` à
      la seconde — l'écran aurait lu deux vérités pour un seul chiffre. */
   _v.fige=!_sn; if(_sn)_v.etat='provisoire';
  }
  /* le recalcul n'a rien rendu : on garde l'entrée plutôt que de rendre `null`
     — une correction qui échoue ne doit pas EFFACER un jour du registre. */
  else if(_reg){ _v={s:Math.round(+_r),fige:!_sn}; if(_sn)_v.etat='provisoire'; }
 }
 if(_v&&_v.s!=null&&!_v.zone){
  var s=_v.s;
  var zz=s>=67?['HAUTE','var(--green)','Ton corps est bien récupéré. Conditions optimales pour performer.','PRÊT']
        :s>=34?['MODÉRÉE','var(--amber)','Récupération correcte. Vise une charge modérée aujourd\'hui.','OK']
        :['BASSE','var(--accent)','Récupération basse. Priorise le repos et le sommeil.','REPOS'];
  _v.zone=zz[0];_v.color=zz[1];_v.reco=zz[2];_v.state=zz[3];
 }
 return _v;
};

/* ═══ v1846 — LE JOURNAL DE BORD PÈSE (UN PEU) SUR LE SCORE ═══════════════════

   Mandat de Dino, 23 août : « si on abuse de l'alcool, ça doit avoir une
   incidence sur la récupération ; un vol en avion fatigue même si le sommeil
   est là — mais il ne faut pas que ça influence trop les scores. »

   LA RÈGLE QUI GOUVERNE : chaque comportement passe par SON canal réel.
   · La CAFÉINE agit via le sommeil — et le sommeil est déjà MESURÉ et pesé
     (zS, poids 0,49). La compter ici serait la compter DEUX fois : zéro
     ajustement, elle vit dans l'analyse d'impact, pas dans le score.
   · L'ALCOOL agit via la variabilité cardiaque — mesurée elle aussi, mais un
     capteur de poignet peut la sous-lire une nuit d'alcool. D'où le MODÈLE DU
     COMPLÉMENT : la pénalité attendue pour la dose est réduite de ce que la
     physiologie a DÉJÀ montré (zH). Un corps qui a visiblement payé (zH ≤ −1)
     ne repaye rien ; un corps que le capteur dit « normal » après 4 verres
     reçoit la pénalité entière. Jamais deux fois la même punition.
   · L'AVION n'est dans AUCUN capteur : cabine pressurisée, déshydratation,
     fuseaux — une fatigue réelle qu'une bonne nuit ne solde pas. Lui seul
     reçoit une pénalité directe, modulée par l'heure d'atterrissage (un vol
     posé le matin est en partie digéré le soir même), avec un contrecoup à
     J+2 pour les vols de plus de 6 h (le décalage ne se rembourse pas en une
     nuit).

   LES BORNES, non négociables : jamais un bonus (répondre « non » n'améliore
   rien), −8 points au maximum toutes causes confondues, et AUCUN journal =
   AUCUN ajustement — une absence n'est pas une mesure.

   L'ALIGNEMENT DES JOURS : le journal du jour J décrit la journée J ; la nuit
   qu'elle abîme est J→J+1 ; le score qu'elle doit marquer est celui du matin
   J+1. D'où la lecture de `journal_<J-1>` quand on calcule le jour J.

   LA TRACE `recovAj_<K>` : quand le score se fige (flRecovLu, persistRecov),
   l'ajustement se fige à côté. Sans elle, l'analyse d'impact mesurerait NOTRE
   PROPRE malus et le prendrait pour un effet de l'alcool — un serpent qui se
   mord la queue, cf. fcFiable. `flImpactsData` retranche cette trace avant de
   corréler. */
window.flJournalAjust=function(off,zH){
 try{
  var out={total:0,detail:[],phrase:null};
  var _o=Math.min(0,(off||0));
  var j=DB.get('journal_'+tk(_o-1),null);
  var j2=DB.get('journal_'+tk(_o-2),null);
  var doseN={'1':1,'2':2,'3':3,'4 et plus':4};
  if(j&&j.alcool===true){
   var n=doseN[j.alcool_n]||1;
   var attendu=[0,-3,-5,-8,-11][n];
   /* la part que la physiologie n'a PAS encore montrée : zH=0 → tout,
      zH≤−1 → rien, entre les deux → au prorata. Sans zH (base absente),
      la pénalité s'applique entière : on n'a rien mesuré qui l'ait payée. */
   var part=(zH==null||isNaN(zH))?1:Math.max(0,Math.min(1,1+Math.min(0,zH)));
   var pts=Math.round(attendu*part);
   if(pts<0)out.detail.push({id:'alcool',pts:pts,
    txt:'alcool ('+(n>1?(j.alcool_n||n)+' verres':'1 verre')+')'});
  }
  if(j&&j.avion===true){
   var base={'Moins de 3 h':-2,'3 à 6 h':-3,'Plus de 6 h':-5}[j.avion_duree]||-2;
   var mod={'Ce matin':0.4,'Cet après-midi':0.6,'Ce soir':1}[j.avion_arrivee]||1;
   var pv=Math.round(base*mod);
   if(pv<0)out.detail.push({id:'avion',pts:pv,
    txt:'vol'+(j.avion_duree?' ('+j.avion_duree.toLowerCase()+')':'')});
  }
  if(j2&&j2.avion===true&&j2.avion_duree==='Plus de 6 h'){
   out.detail.push({id:'avion2',pts:-2,txt:'contrecoup du long vol'});
  }
  for(var i2=0;i2<out.detail.length;i2++)out.total+=out.detail[i2].pts;
  if(out.total<-8)out.total=-8;
  if(out.total<0)out.phrase='Journal de bord : '+out.detail.map(function(d){
   return d.txt+' '+d.pts+' pts';}).join(' · ');
  return out;
 }catch(e){return {total:0,detail:[],phrase:null};}
};
/* ═══ v2037 — AUJOURD HUI AUSSI A UN CYCLE DE VIE ═══════════════════════════
   La v1540 avait fait de `flRecovLu` LA porte : registre pour un jour passe,
   calcul pour aujourd hui. La moitie « aujourd hui » n avait aucune notion de
   nuit finie — elle rendait `recovery(0)`, c est-a-dire l etat de la base a la
   milliseconde ou on la regardait. C est ce qui a produit 87 puis 70 puis 71
   le 30 aout au matin, sur une seule et meme nuit.
   Desormais elle demande au cycle (`flint-recup-cycle.js`) CE QUI EST PUBLIE.
   Trois reponses possibles, et une seule est un nombre :
     · un score publie (provisoire ou scelle) → on le rend ;
     · une attente (la livraison n est pas close) → on rend `null`, et le repli
       DECLARE de l accueil (v1874) montre la veille en le disant ;
     · pas de nuit → `null`, comme avant.
   REPLI SI LE WEB SERVI EST PERIME : sans le fichier du cycle, on retombe sur
   l ancien comportement. Un ecran qui bouge vaut mieux qu un ecran vide. */


/* ═══ v2064 gén. 7 — LA PORTE SOMMEIL → RÉCUPÉRATION ═════════════════════════
   Dino, 30 août : « vas-y, branche-le. » La composante sommeil de la récup
   cesse d'être la durée seule : elle devient le score sommeil FLINT
   (couverture + efficacité + régularité, flint-score-sommeil.js) — le contrat
   complet vit dans PORTE-SOMMEIL-RECUP.md.

   LE MAPPING N'EST PAS CHOISI, IL EST MESURÉ (calibration-porte-sommeil.py,
   même protocole que les gén. 4-6) : sur 471 jours de l'export, entraînement
   282 / validation 189 jamais vus, en visant la RÉCUP de référence (jamais
   leur performance sommeil — interdit du contrat, vérifié par la session
   score-sommeil) :

       zS = 0,06 · (score − 70), borné [−4 ; +3]
       MAE validation : 7,70 contre 9,06 pour la durée seule — le premier
       changement en six études qui GAGNE hors échantillon.

   Le 70 n'est pas un chiffre en l'air : c'est la nuit moyenne — et la série
   des scores rejoués de Dino (29 nuits, session score-sommeil) donne une
   moyenne de 69,3 SANS avoir participé à la calibration. Deux chemins, même
   centre.

   CE QUE LA PORTE NE FAIT PAS :
   · elle ne touche pas au VETO nuit catastrophique — il reste sur la durée
     brute (une nuit de 3 h est catastrophique quelle que soit son
     efficacité), et il vit dans recovery(), pas ici ;
   · elle ne remplace jamais un refus : si flScoreSommeil rend null (nuit
     refusée en amont, besoin incalculable), elle rend null et recovery()
     retombe sur la durée — et le cas « nuit refusée pour non-port » ne
     l'atteint même pas, recovery() s'étant déjà arrêté sur sleepMin null ;
   · elle ne recalcule pas le besoin du passé : le besoin GELÉ du jour
     (flBesoinJourAjuste, cache gen 2) est passé explicitement — l'historique
     honnête, et zéro relecture en boucle (la famine d'août venait de là,
     note de la session score-sommeil).
   Banc : tests/test-porte-sommeil.js. */
window.flSommeilPourRecup = function (K) {
  try {
    if (typeof flScoreSommeil !== 'function') return null;
    var besoin;
    try {
      if (typeof flBesoinJourAjuste === 'function') {
        var ba = flBesoinJourAjuste(K);
        if (ba && ba.min > 0) besoin = ba.min;
      }
    } catch (e) {}
    var r = flScoreSommeil(K, null, null, besoin, undefined);
    if (!r || r.score == null) return null;

    /* ═══ v2189 — L'ANCRE ÉTAIT UN NOMBRE, ELLE DEVIENT LA SIENNE ═══════════
       CE QUI N'ALLAIT PAS, ET C'EST MESURÉ. La porte jugeait le sommeil contre
       une ancre FIXE de 70 points. Chez Dino, dont le score de sommeil habituel
       tourne autour de 75, elle est presque neutre : la porte l'a déplacé de
       +2 points. Ailleurs, sur les huit corps du banc :

           gros dormeur      +20      travailleur de nuit   −9
           athlète            +9      dette chronique      −11

       TRENTE ET UN POINTS D'AMPLITUDE pour un changement validé à +2 sur le
       poignet qui l'a validé. Et cet écart n'est pas physiologique : il vient
       entièrement de l'endroit où le sommeil habituel de chacun tombe par
       rapport à 70. Un décalage permanent, offert par un nombre.

       L'ANCRE DEVIENT SA MÉDIANE, sur trente nuits. Mesuré au banc, sur copie
       (test-corps-virtuels.js, section de l'ancre) : l'amplitude tombe de
       31 points à 13. Dix-huit points d'accident retirés.

       CE QUE ÇA NE JETTE PAS, et c'est ce qui rend le changement sûr : la
       gén. 7 comparait le SCORE de sommeil — qui porte l'efficacité, la
       régularité, la couverture — et pas seulement la durée comme la gén. 6.
       Cette richesse-là reste. Le banc le montre : la dette chronique garde
       −7 points contre la gén. 6. Un mauvais sommeil chronique continue donc
       de peser, mais proportionnellement, au lieu d'être puni pour la position
       de sa moyenne sur une échelle qui ne le regardait pas.

       HUIT NUITS D'ASSISE MINIMUM, et sous ce seuil on garde 70. C'est le même
       seuil que les plages du Moniteur (`FLP_MIN`), et pour la même raison :
       une médiane sur moins de huit nuits ne décrit pas une habitude. Une
       ancre personnelle sans assise serait plus arbitraire que la fixe.

       ⚠️ LE CACHE N'EST PAS UN CONFORT. `recovery()` est appelée à chaque
       rendu, plusieurs fois par écran ; trente `flScoreSommeil` par appel
       referaient exactement la panne de la v1233 sur `flFcMax` — la page
       Effort revenait VIDE, faute d'avoir fini à temps. On mémoïse par JOUR
       JUGÉ (`K`), pas par jour courant : le rejeu d'un mois d'historique doit
       comparer chaque nuit à l'ancre qu'elle avait, pas à celle d'aujourd'hui.
       Le cache se vide quand la date change, pour ne pas croître sans fin.
       L'accès passe par `window.` et JAMAIS par un identifiant nu : une
       variable de module posée au-dessus tomberait hors du bloc que les bancs
       prélèvent, et la fonction lèverait chez eux (leçon de `getProfile`). */
    var anc = 70, ancN = 0;
    try {
      var auj = tk(0);
      var C = window._flAncreSommeil;
      if (!C || C.jour !== auj) { C = { jour: auj, par: {} }; window._flAncreSommeil = C; }
      if (C.par[K] !== undefined) { anc = C.par[K].v; ancN = C.par[K].n; }
      else {
        var vs = [], i, q, kk;
        /* Les nuits ANTÉRIEURES à celle qu'on juge : une nuit ne s'ancre pas
           sur elle-même. Le besoin est laissé au calcul de `flScoreSommeil` —
           l'ajuster nuit par nuit coûterait trente appels de plus pour un
           effet du second ordre sur une médiane.
           Le décalage de clé est écrit ICI et pas dans une aide extérieure :
           c'est l'idiome de la maison (`flRegulariteNuit`, flint-score-sommeil)
           et surtout, une aide posée dehors tomberait hors du bloc que les
           bancs prélèvent — la fonction lèverait chez eux, pas en production. */
        var _p = String(K).split('-');
        for (i = 1; i <= 30; i++) {
          var _d = new Date(+_p[0], (+_p[1]) - 1, +_p[2]);
          _d.setDate(_d.getDate() - i);
          kk = _d.getFullYear() + '-' + (_d.getMonth() + 1) + '-' + _d.getDate();
          try { q = flScoreSommeil(kk, null, null, undefined, undefined);
                if (q && q.score != null) vs.push(q.score); } catch (e) {}
        }
        if (vs.length >= 8) {
          vs.sort(function (a, b) { return a - b; });
          anc = vs[vs.length >> 1]; ancN = vs.length;
        }
        C.par[K] = { v: anc, n: ancN };
      }
    } catch (e) { anc = 70; ancN = 0; }

    var zS = Math.max(-4, Math.min(3, 0.06 * (r.score - anc)));
    return { zS: zS, score: r.score, ancre: anc, ancreNuits: ancN,
             src: 'score-sommeil',
             couverture: (r.couverture != null ? r.couverture : null) };
  } catch (e) { return null; }
};
