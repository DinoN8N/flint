/* ═══════════════════════════════════════════════════════════════════════════
   LA NUIT DU MATIN — UNE SESSION, UN ÉTAT, UNE PUBLICATION           v2184

   LE CAS FONDATEUR, DICTÉ PAR DINO LE 3 SEPTEMBRE 2026 :

     « Le matin est beaucoup trop confus : chargements longs, mauvaise nuit
       affichée temporairement, plusieurs changements d'état, journal qui
       arrive trop tard, traits ou placeholders incompréhensibles, score
       sommeil/récupération qui apparaît puis change. »

   Et l'ordre qu'il veut, mot pour mot :

     clic Traiter → journal immédiatement → validation journal → traitement
     nuit → calcul sommeil → calcul récupération → publication atomique

   ═══ POURQUOI CE FICHIER N'EST PAS UN CORRECTIF DE PLUS ════════════════════

   Le moteur savait déjà répondre à « la nuit peut-elle encore bouger »
   (`flNuitCycle`, v2037) et à « ai-je de quoi la juger »
   (`flMesureNuitComplete`, v2139). Ce qui manquait n'est aucune de ces deux
   questions : c'est le fait qu'il n'existait AUCUN objet nommé « la nuit de ce
   matin ». Sans lui, chaque écran répondait pour lui-même, et il y avait donc
   autant de vérités que de lecteurs :

     · `flAccueilData` se repliait sur la nuit ET le score de la VEILLE dès que
       ceux du jour manquaient — le repli se déclarait (v1874) mais il
       s'affichait quand même, gros, au centre de l'écran ;
     · `flRecupPublier` publiait en `grace`, republiait jusqu'à trois fois au
       delà de trois points (v2134), et gardait une réouverture après le sceau :
       c'est-à-dire jusqu'à CINQ nombres pour une seule nuit, tous justes, tous
       présentés comme définitifs ;
     · le journal du matin avait TROIS déclencheurs indépendants
       (`verifierJournalDuMatin` en natif, `verifierInviteJournal` pour la
       carte, `flJournalMaybeAutoOpen` dans le web) qui ne se connaissaient
       pas ;
     · et rien ne reliait le journal à la finalisation : il pesait sur le score
       (v1846) mais il arrivait APRÈS lui, ce qui obligeait à republier.

   ON NE RETIRE AUCUN DE CES MÉCANISMES : ils mesurent des faits vrais. On leur
   met une PORTE devant, et la porte est une session de nuit.

   ═══ LA MACHINE D'ÉTAT ════════════════════════════════════════════════════

        SANS_NUIT
            │  une nuit est DUE (journée ouverte la veille, réveil déclaré
            │  passé, ce poignet dort avec nous) — v2308, `flNuitAttendue`
            ▼
        EXPECTED
            │  un sommeil principal du bracelet existe sur ce jour
            │  (et l'identifiant ne change pas : c'est la même nuit)
            ▼
        DETECTED ───────────► WAITING_FOR_USER
        (la nuit peut encore   (plus rien ne la fera bouger toute seule :
         s'allonger : cycle     cycle `grace` ou `finale`)
         `sommeil`/`collecte`)      │                    │
                                    │ clic « Traiter »   │ le corps est levé
                                    ▼                    ▼   depuis longtemps
                          JOURNAL_IN_PROGRESS      AUTO_FINALIZING
                                    │ journal validé      │
                                    ▼                     │
                              FINALIZING ─────────────────┤
                                    │                     │
                                    ▼                     ▼
                                      FINALIZED

   L'IDENTIFIANT EST STABLE ET FRAPPÉ UNE FOIS. `ns_<jour de réveil>_<epoch>` :
   le jour de réveil est la clé sous laquelle la nuit est rangée et il ne bouge
   pas (une nuit appartient au jour où l'on se lève) ; l'estampille est posée à
   la frappe et recopiée ensuite. Deux détections de la même nuit rendent donc
   le MÊME identifiant — c'est ce qui permet de suivre une nuit d'un bout à
   l'autre du journal, et c'est ce qui interdit deux cartes « Sommeil détecté »
   pour une seule session.

   CHAQUE ÉTAPE EST IDEMPOTENTE, ET CE N'EST PAS UNE PRÉCAUTION DE STYLE : le
   pont natif rappelle `flNuitPasse` à chaque retour au premier plan, à chaque
   fin de synchro et à chaque réveil de minuterie. Un second appel ne doit rien
   recréer, rien republier, rien rouvrir.

   ═══ CE QUE CE FICHIER NE PEUT PAS FAIRE, ET IL FAUT LE DIRE ══════════════

   « finaliser en background, même si l'application n'est pas ouverte » ne peut
   pas s'exécuter ICI : le moteur web est SUSPENDU par iOS dès que l'app passe
   derrière (c'est le défaut des trous de courbe, corrigé en v2010 par un rejeu
   depuis le journal natif, pas par un moteur qui tournerait en fond). Ce qui
   est vrai, et suffisant pour ce que Dino décrit :

     · le bracelet réveille l'app en arrière-plan (bluetooth-central) et le
       natif ENGRANGE tout ce qui arrive — la matière est donc là ;
     · `flNuitPasse('BACKGROUND_AUTO')` part à la première milliseconde où le
       moteur est vivant, AVANT le premier rendu ;
     · la porte de publication empêche quoi que ce soit de paraître avant.

   Conséquence pour l'utilisateur qui n'ouvre pas l'app de la matinée : à
   14 h 00 il voit sa nuit finalisée, directement, sans carte à traiter et sans
   valeur intermédiaire. C'est exactement le comportement demandé ; c'est
   l'instant du calcul qui diffère, pas le résultat.

   ═══ CE QUE LA PORTE CHANGE ICI (les points d'appel dans index.html) ══════

   Trois lignes seulement, et elles sont toutes des REFUS :

     · `flAccueilData` — `flNuitPasse('accueil')` part AVANT `flRecovLu` (sinon
       la charge qui déclenche la finalisation servirait encore l'état d'avant :
       deux images pour un seul événement). Puis, tant que la publication est
       fermée : `n=null; rv=null;` — la nuit du jour à moitié calculée est mise
       de côté — et le repli sur la VEILLE ne joue pas. C'est ce repli-là qui
       mettait 72 au centre de l'écran le 26 août et la nuit de samedi sur la
       tuile d'un lundi matin.
     · `flSommeilData` — la MÊME porte, parce que deux écrans qui répondent
       chacun pour soi à « où en est ma nuit » finissent par se contredire.
     · `flJournalMaybeAutoOpen` — muette dans la coquille : elle écrit
       `fljrnl_`, le natif écrit `journal_`, et c'est `journal_` seul qui entre
       dans le score. Elle reste entière pour le web servi seul.

   Banc : `tests/test-nuit-matin.js`.

   ⚠️ LIAISONS. `DB` et `tk` sont des `const` de script d'index.html : ils se
   lisent NUS, jamais par `window` (garde-liaisons.js, et la leçon de marche.js
   puis de flint-recup-cycle.js). Tout ce qui vient d'ailleurs se teste par
   `typeof` avant d'être appelé : une liaison de fichier ne se suppose pas.
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* La génération de la MACHINE. Si les états ou ce qui autorise une
     transition changent, les sessions d'avant ne décrivent plus la même chose :
     elles portent leur génération et se relisent en connaissance de cause. On
     ne les rejuge pas — une nuit finalisée reste finalisée. */
  var SESSION_GEN = 1;

  var CLE = 'nuitSess_';            /* la session, par jour de réveil */
  var CLE_NUIT = 'nuitFige_';       /* l'instantané scellé de la nuit */
  var CLE_SCORE = 'nuitScoreFige_'; /* le score de sommeil scellé */
  var CLE_REVEIL = 'reveilDit_';    /* le réveil DÉCLARÉ, par jour */
  var CLE_LIVRE = 'nuitSommeilLivre_'; /* la montre a TOUT donné du sommeil, par jour */
  var CLE_LAPSE = 'nuitAttenteLapsee_'; /* l'attente du matin a lapsé ce jour-là — la nuit qui arrive ensuite est CELLE-LÀ, pas une migration */
  var JRN = 'nuitMatinJrn';         /* le journal horodaté, une nuit de bout en bout */
  var JRN_CAP = 200;

  /* Les causes, telles que Dino les a nommées. Elles voyagent dans le journal
     ET dans la session : « qui a décidé » se relit des mois après. */
  var USER = 'USER';
  var AUTO = 'BACKGROUND_AUTO';
  /* 9 sept. 2026 (v2295) — LA TROISIÈME PORTE DE L'AUTO-FINALISATION. Dino,
     le 9 au soir : « Traiter, c'est vraiment quand tu viens de te réveiller ;
     midi, c'est tard. » Sans marche franche, le fond attendait quatre heures
     (`reveilCoupeNuit`). Une heure debout sans rendormissement, avec la matière
     de la nuit complète, suffit : le rendormissement tardif garde son unique
     réouverture après sceau (`flNuitRendormissement`). */
  var AUTO_APRES_REVEIL_MIN = 60;
  var RENDORMI = 'RENDORMISSEMENT';
  /* v2210 — la quatrième, et elle n'est pas une décision de l'utilisateur ni du
     fond : c'est le bracelet qui a fini par livrer SA nuit, après qu'on en a
     scellé une déduite de la fréquence cardiaque. */
  var MESURE = 'MESURE_ARRIVEE';

  /* 12 sept. 2026 — L'ÂGE À PARTIR DUQUEL UNE PUBLICATION EST CELLE D'UNE AUTRE
     VERSION. En deçà, c'est la nôtre, et elle ne prouve donc rien sur « la nuit
     a déjà été traitée ». Vingt minutes : trois fois le plafond d'attente d'une
     finalisation (3 min) plus la fenêtre d'observation, très au-dessus de toute
     course entre le cycle et la machine du matin, et très en dessous de l'âge
     d'une nuit publiée avant une mise à jour. Le pavé de la migration raconte
     le matin qui l'a fait écrire. */
  var MIGRATION_VIEILLE_MS = 20 * 60 * 1000;

  /* ─────────────────────────────────────────────────────────────────────────
     LE JOURNAL — huit lignes pour suivre une nuit entière

     Dino a dicté les huit événements. Ils s'écrivent en anglais parce que c'est
     ainsi qu'il les a demandés, et parce qu'un nom d'événement qui ne se
     traduit pas se cherche mieux dans un fichier de trois cents lignes.
     Chaque ligne porte l'identifiant de session : c'est ce qui permet de
     dérouler UNE nuit sans lire les autres. */
  function ligne(l) {
    return l.t + '  ' + l.id + '  ' + l.ev
         + '  [' + (l.cause || '—') + ']'
         + (l.etat ? '  ' + l.etat : '')
         + (l.detail ? '  · ' + l.detail : '');
  }

  function tracer(id, ev, cause, etat, detail) {
    var l = { t: new Date().toISOString(), id: id || '—', ev: ev,
              cause: cause || null, etat: etat || null, detail: detail || null };
    try {
      var j = DB.get(JRN, []) || [];
      if (!Array.isArray(j)) j = [];
      j.push(l);
      if (j.length > JRN_CAP) j = j.slice(j.length - JRN_CAP);
      DB.set(JRN, j);
    } catch (e) {}
    try { console.log('[nuit] ' + ligne(l)); } catch (e) {}
    try { if (window.flBleLog) window.flBleLog('🌙 ' + ligne(l)); } catch (e) {}
    return l;
  }

  window.flNuitMatinJournal = function (n) {
    var j = [];
    try { j = DB.get(JRN, []) || []; } catch (e) {}
    if (!Array.isArray(j)) j = [];
    return n ? j.slice(Math.max(0, j.length - n)) : j;
  };
  /* Le déroulé d'UNE nuit, du « sleep detected » au « morning state published ».
     C'est la réponse à « qu'est-ce qui s'est passé ce matin-là ». */
  window.flNuitMatinJournalTexte = function (id, n) {
    var j = window.flNuitMatinJournal();
    if (id) j = j.filter(function (l) { return l.id === id; });
    return j.slice(Math.max(0, j.length - (n || 60))).map(ligne).join('\n');
  };

  /* ═══════════════════════════════════════════════════════════════════════════
     LE RÉVEIL DÉCLARÉ — v2210, et c'est la pièce qui manquait au matin

     LE CAS, MESURÉ SUR LE TÉLÉPHONE DE DINO LE 4 SEPTEMBRE 2026. Le bracelet
     n'avait livré aucun sommeil de la nuit (interrupteur « montre nue » resté
     allumé depuis la veille au soir). Le moteur est donc retombé sur la nuit
     ESTIMÉE, celle que `computeNight` déduit de la seule fréquence cardiaque en
     retenant la plus longue plage sous `base + 12`. La FC de repos de Dino vaut
     45 : le seuil tombe vers 57, et sa fréquence de matinée assis — 49, 55, 54,
     57, 55, 53, 56 — reste dessous.

     LA « NUIT » A DONC AVANCÉ AVEC L'HORLOGE. Son réveil est passé de 04:20 à
     07:55, puis 08:05, puis 08:10, gagnant cinq minutes toutes les cinq
     minutes. Trois conséquences, toutes lues dans le journal ou dans la base :

       · `flNuitCycle` rend `sommeil` (la fin de nuit est DEVANT nous), donc la
         finalisation se gare — 111 tentatives, vingt minutes de « Traitement » ;
       · `flJourLogique` n'accepte d'ouvrir une journée que sur un sommeil dont
         la fin est PASSÉE : la journée de la veille est restée ouverte, avec
         son effort à 10,8, ses 3 232 calories et sa frise d'hier ;
       · et la nuit ayant grandi de cinq minutes après le sceau, le détecteur de
         rendormissement a rouvert la session sur un rendormissement qui n'a
         jamais eu lieu.

     LA RÉPONSE N'EST PAS UN SEUIL DE PLUS. Elle est dans une doctrine que cette
     maison applique déjà partout : UN GESTE VAUT DÉCLARATION (TRAITER sur une
     séance, v1236 ; TRAITER sur la nuit, v2184). Quand Dino appuie sur
     « Traiter », il ne demande pas un calcul : il DIT qu'il est levé. Ce fait
     est plus sûr que n'importe quelle estimation de fréquence cardiaque, et
     rien dans le moteur ne l'écoutait.

     ON L'ÉCRIT DONC UNE FOIS, ET IL BORNE TOUT LE RESTE :
       · la nuit estimée ne peut plus s'étendre au-delà (voir `flNuitBorneFin`,
         appelée par `computeNight`) ;
       · la finalisation n'a plus de fenêtre d'observation à payer, puisque les
         bornes de la nuit ne peuvent plus bouger ;
       · et la journée logique bascule dans la seconde.

     ⚠️ LA PREMIÈRE DÉCLARATION GAGNE. Deux appuis, ou un appui doublé par une
     repasse du pont, ne doivent pas déplacer le réveil de trente secondes à
     chaque fois : ce serait rendre à la nuit la mobilité qu'on vient de lui
     retirer. On garde la plus ANCIENNE, et elle ne s'efface qu'avec la session
     (`flNuitOublier`).

     ⚠️ ET ELLE NE VAUT QUE POUR LE JOUR COURANT. Un jour passé se relit, il ne
     se retraite pas (doctrine v1463) : y déclarer un réveil n'aurait aucun
     sens et couperait rétroactivement une nuit déjà scellée. */
  window.flNuitReveilDeclarer = function (K, quand, source) {
    K = K || tk(0);
    var ts = quand || Date.now();
    try {
      if (K !== tk(0)) return null;             /* un jour passé ne se déclare pas */
      var deja = DB.get(CLE_REVEIL + K, null);
      if (deja && deja.ts) return deja;         /* la première déclaration gagne */
      var rec = { ts: ts, src: source || USER, gen: SESSION_GEN };
      DB.set(CLE_REVEIL + K, rec);
      var d = new Date(ts);
      tracer(window.flNuitSessionId(K), 'wake declared', source || USER, null,
             'réveil déclaré à ' + ('0' + d.getHours()).slice(-2) + ':'
             + ('0' + d.getMinutes()).slice(-2) + ' — la nuit ne s\'étendra plus au-delà');
      /* La nuit estimée est déjà écrite avec un réveil trop tardif : on la fait
         relire tout de suite, sinon la déclaration n'agirait qu'à la prochaine
         livraison du bracelet — c'est-à-dire, un matin comme celui-ci, jamais. */
      try { if (typeof window.flNuitRecouper === 'function') window.flNuitRecouper(K, ts); }
      catch (e) {}
      return rec;
    } catch (e) { return null; }
  };

  /* Le réveil déclaré de ce jour, en millisecondes — `null` s'il n'y en a pas. */
  window.flNuitReveilDit = function (K) {
    K = K || tk(0);
    try {
      var r = DB.get(CLE_REVEIL + K, null);
      return (r && r.ts) ? +r.ts : null;
    } catch (e) { return null; }
  };

  /* ═══ LA BORNE : AU-DELÀ D'ICI, IL N'Y A PAS DE SOMMEIL ═══════════════════

     Deux faits, et aucun n'est un réglage :

       ① MAINTENANT. Une nuit qui se termine dans le futur n'est pas une nuit,
          c'est une erreur d'arrondi : `computeNight` ferme sa dernière tranche
          de cinq minutes en ajoutant 300 s, ce qui projette la fin jusqu'à cinq
          minutes devant l'horloge. Ces cinq minutes-là suffisent à faire dire
          `sommeil` au cycle et à retenir la journée logique tout entière.
       ② LE RÉVEIL DÉCLARÉ, quand il existe. Voir le pavé ci-dessus.

     Appelée par `computeNight` (index.html) à travers un `typeof` : une liaison
     de fichier ne se suppose pas, et le moteur doit rester servable seul. */
  window.flNuitBorneFin = function (K, maintenant) {
    var now = maintenant || Date.now();
    var b = now;
    try {
      var dit = window.flNuitReveilDit(K || tk(0));
      if (dit != null && dit < b) b = dit;
    } catch (e) {}
    return b;
  };

  /* ─────────────────────────────────────────────────────────────────────────
     CE QUE LE MOTEUR SAIT DE LA NUIT — lectures, jamais de calcul ici */

  /* Un sommeil principal MESURÉ PAR LE BRACELET existe-t-il sur ce jour ?
     `sensorOf` porte déjà tous les refus de la maison (nuit sans mesure,
     journée muette) : on ne les rejoue pas, on s'y adosse.
     `_watch` distingue la nuit du bracelet d'une nuit SAISIE ou SEMÉE — cette
     dernière arrive complète et d'un coup, elle n'a rien à traiter. */
  function nuitDuBracelet(K) {
    try {
      var s = (typeof window.sensorOf === 'function') ? window.sensorOf(K) : null;
      if (!s || s.sleepMin == null) return null;
      if (!s._watch) return null;
      return s;
    } catch (e) { return null; }
  }

  function cycleDe(K) {
    try { if (typeof window.flNuitCycle === 'function') return window.flNuitCycle(K); }
    catch (e) {}
    return null;
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     LA NUIT EST DUE AVANT D'ÊTRE LIVRÉE — 10 septembre 2026 (v2308)

     LE CAS, EN DEUX CAPTURES DE DINO, À CINQ MINUTES D'INTERVALLE :

       07:49  récupération 83, sommeil 6h57 « Nuit précédente », effort 11,3,
              calories 2 576 — la journée d'HIER, en grand, au centre.
       07:54  « SOMMEIL DÉTECTÉ · Ta nuit est prête · TRAITER », les quatre
              chiffres retenus.

     Dino : « je ne veux plus jamais voir cet état. Je me réveille, j'ouvre
     Flint, le premier écran que je vois est déjà celui de la nuit à traiter.
     Aucune stat de la veille, même pendant une fraction de seconde. »

     POURQUOI LA PORTE DE LA v2184 NE POUVAIT PAS L'ATTRAPER. Elle se ferme sur
     une SESSION, et la session se frappe sur un sommeil du bracelet
     (`nuitDuBracelet`). Or à 07:49 le bracelet n'avait encore rien livré : la
     montre se reconnecte au réveil, le canal sommeil arrive en huit secondes
     APRÈS la connexion, et la file de trames de la nuit se rejoue derrière
     (mesuré le 7 septembre : connexion 08:09, détection 08:10:16). Entre
     l'ouverture de l'app et cette seconde-là, `flNuitEtat` répond honnêtement
     `SANS_NUIT`, la porte reste ouverte — et le repli sur la veille joue,
     exactement comme il est écrit qu'il doit jouer.

     Le défaut n'est donc pas un ordre d'exécution : `flNuitPasse('accueil')`
     part déjà avant `flRecovLu`, et `flNuitPasse('premier plan')` à la première
     milliseconde du moteur. Le défaut est que la porte ATTENDAIT UNE MESURE
     pour se fermer, alors que le fait qui la justifie est antérieur : une nuit
     est DUE bien avant d'être lue.

     ═══ CE QUI FAIT QU'UNE NUIT EST DUE, ET AUCUN DE CES FAITS N'EST INVENTÉ ══

       ① LA JOURNÉE LOGIQUE OUVERTE EST NÉE UN AUTRE JOUR CIVIL. C'est ce que
          l'écran affichait déjà en toutes lettres sur la capture de 07:49 :
          « 9 SEPTEMBRE À AUJOURD'HUI ». Une journée FLINT va d'un sommeil au
          suivant (v1471) ; celle-là n'a pas été fermée, donc un sommeil lui est
          dû. Son ancre est une LECTURE, pas un calcul de plus.
       ② ON EST PASSÉ LE RÉVEIL DÉCLARÉ AU PROFIL (`getProfile().wake`). C'est
          le seul fait qui sépare « 00 h 21, sorti hier soir, je n'ai pas encore
          dormi » — la journée du 13 août, celle qui a fondé la règle v1471, et
          qui doit continuer de compter — de « 07 h 49, je viens de me lever ».
          On ne devine pas un réveil : l'utilisateur l'a écrit lui-même.
       ③ CE POIGNET A DÉJÀ RENDU DES NUITS. Au moins une des trois dernières
          journées porte un sommeil principal du BRACELET. Sans ça, attendre une
          nuit qui ne viendra jamais viderait l'écran de quelqu'un qui n'a pas
          de bracelet, ou qui vient de l'enlever pour de bon.

     ET LA FENÊTRE SE REFERME TOUTE SEULE : deux heures après le réveil déclaré,
     l'attente lapse et tout le comportement d'avant reprend. Deux heures est
     le nombre de la maison — c'est déjà l'échappatoire bornée de `flNuitMatiere`
     (v2139) — et ce n'est pas un réglage de confort : LE SEUL ÉCHEC
     INACCEPTABLE EST CELUI QUI RETIENT L'ÉCRAN POUR TOUJOURS. Une nuit blanche,
     un bracelet resté sur la table, un voyage : au pire on aura tu les chiffres
     d'hier pendant la fenêtre où ils étaient effectivement ceux d'hier.

     ⚠️ CETTE FONCTION NE CROIT RIEN ET N'AFFIRME RIEN. Elle ne dit pas « une
     nuit existe » — elle dit « une nuit est due, et tant qu'on ne sait pas, on
     ne montre pas la veille ». C'est pour ça que l'état qu'elle ouvre s'appelle
     `EXPECTED` et pas `DETECTED`, que la carte écrit « TA NUIT ARRIVE » et non
     « SOMMEIL DÉTECTÉ », et que le bouton TRAITER n'y paraît pas : on ne
     propose pas de sceller ce qu'on n'a pas encore lu.

     ⚠️ CE QU'ELLE NE COUVRE PAS, ET IL FAUT LE DIRE. Qui se lève RÉGULIÈREMENT
     avant l'heure qu'il a écrite à son profil verra, dans cet intervalle-là, le
     comportement d'avant — la veille, déclarée comme telle. Le réveil MESURÉ
     des nuits passées ferait mieux ; il coûte trois lectures de base à chaque
     appel de la porte, c'est-à-dire plusieurs par charge et toute la journée
     (voir l'ordre des refus plus bas). On préfère un fait que l'utilisateur a
     écrit lui-même et qu'il peut corriger en dix secondes, à une déduction
     payée vingt-quatre heures sur vingt-quatre.

     ⚠️ ELLE S'EFFACE DEVANT LA MESURE. Dès que `nuitDuBracelet` répond, la
     session passe `EXPECTED → DETECTED` en gardant SON identifiant : c'est la
     même nuit qui devient lisible, donc la même carte qui change de mot — pas
     une seconde carte (interdit n° 7). */

  /* Deux heures, en millisecondes. Le nombre vient de `flNuitMatiere` (v2139),
     il n'est pas choisi ici.

     ⚠️ LE NOM PORTE SON SUJET, ET CE N'EST PAS DU STYLE. Ce fichier déclare
     déjà `ATTENTE_MAX_MS` (180 000 ms, le plafond de la FINALISATION, plus
     bas). Deux `var` du même nom dans la même portée ne lèvent rien : le
     dernier chargé gagne, et la borne des deux heures se serait comparée au
     plafond des trois minutes — l'attente lapsait donc trois minutes après le
     réveil déclaré, en silence. Le banc l'a dit en une ligne ; une relecture
     ne l'aurait pas vu. */
  var ATTENTE_NUIT_DUE_MS = 2 * 60 * 60 * 1000;
  /* ═══ 22 sept. 2026 — ON SE RÉVEILLE AVANT SON RÉVEIL ══════════════════════
     Dino a ouvert l'app à 07:59:18 ; son réveil déclaré au profil est 08:00.
     Quarante-deux secondes trop tôt, et la porte du matin l'a traité comme une
     soirée ordinaire : `MATIN · nuit SANS_NUIT · sommeil 5h31 (veille) · score
     67`. Il a vu les chiffres de la VEILLE pendant les secondes qu'il a fallu
     au bracelet pour livrer la nuit.
     L'heure déclarée est une ESTIMATION, pas un fait — personne ne se réveille
     à la minute de son alarme. On lui donne donc une marge avant, du même ordre
     que les deux heures qu'elle a déjà après.
     CE QUE ÇA NE CHANGE PAS : rien de la RÈGLE. Le pavé de `flNuitAttendue` le
     dit — cette fenêtre horaire est là pour le COÛT, « elle passe devant les
     quatre lectures de base ». Ce qui décide vraiment vient après : la journée
     ouverte un autre jour civil (②) et le bracelet qui dort avec nous (③).
     Élargir la fenêtre laisse seulement la fonction ATTEINDRE ses vraies
     conditions une heure plus tôt. */
  var AVANT_REVEIL_MS = 60 * 60 * 1000;

  /* Le réveil DÉCLARÉ au profil, en minutes depuis minuit. `getProfile` porte
     déjà son propre défaut ('07:00') ; on ne le redouble pas, on refuse plutôt
     de conclure quand la lecture n'a pas de sens. */
  function reveilProfilMin() {
    try {
      if (typeof window.getProfile !== 'function') return null;
      var p = window.getProfile();
      var q = String((p && p.wake) || '').split(':');
      if (q.length < 2) return null;
      var h = +q[0], m = +q[1];
      if (!isFinite(h) || !isFinite(m)) return null;
      var v = h * 60 + m;
      return (v >= 0 && v < 1440) ? v : null;
    } catch (e) { return null; }
  }

  /* Ce poignet a-t-il rendu une nuit récemment ? On regarde les trois journées
     qui précèdent, et une seule suffit : il ne s'agit pas de mesurer une
     assiduité, mais d'écarter le cas « pas de bracelet du tout ». */
  function leBraceletDortAvecNous(K) {
    try {
      var p = String(K).split('-');
      if (p.length < 3) return false;
      for (var j = 1; j <= 3; j++) {
        var d = new Date(+p[0], (+p[1]) - 1, +p[2]);
        d.setDate(d.getDate() - j);
        var kk = d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
        if (nuitDuBracelet(kk)) return true;
      }
    } catch (e) {}
    return false;
  }

  /* ═══ LA MONTRE A TOUT DONNÉ — 10 sept. 2026 ═════════════════════════════

     Dino, le 10 septembre : « si je suis en nuit blanche, je veux TOUJOURS les
     stats de la veille. »

     C'est le pendant exact de `flNuitAttendue`, et sans lui l'attente était
     bornée par la seule horloge : deux heures d'écran retenu à quelqu'un qui
     n'a pas dormi. Le fait qui tranche existe déjà, et il vient de la montre
     elle-même — `sleepactEnd`, « la montre a tout donné » (`FlintTestBand`,
     pagination du canal `sleepact`). Après lui, s'il n'y a pas de nuit, c'est
     qu'il n'y a PAS DE NUIT : c'est la définition de `absente` dans
     `flEtatNuit`, et ce n'est plus une attente.

     ⚠️ ON NE FAIT PAS DÉPENDRE L'ATTENTE DE CE SEUL MARQUEUR, et la raison est
     mesurée : le 1er septembre entre 07:56 et 08:04, `sleepactEnd` est arrivé
     pour l'oxygénation, la température, l'activité et la VFC — JAMAIS pour le
     sommeil (la lecture des pages 1→20 dure ~5 min et une nouvelle lecture la
     redémarre avant la fin). Il RACCOURCIT la fenêtre des deux heures ; il ne
     la remplace pas. Un raccourci qui n'arrive jamais coûte le comportement
     d'avant, pas un écran bloqué.

     ⚠️ ET LE PONT NE L'ENVOIE QUE FILE VIDE. Les trames voyagent par paquets et
     la notification, elle, part tout de suite : envoyée pendant que la nuit
     attend encore dans la file de débordement, elle dirait « pas de nuit » sur
     une nuit qui arrive à la ligne suivante. Le refus vit côté natif, là où le
     compte est tenu (`ShellBridge.sommeilTotalementLivre`). */
  window.flNuitSommeilLivre = function (K, quand) {
    K = K || tk(0);
    var ts = quand || Date.now();
    try {
      if (K !== tk(0)) return null;              /* un jour passé ne s'attend plus */
      var deja = DB.get(CLE_LIVRE + K, null);
      if (deja && deja.ts) return deja;          /* la première fois suffit */
      var rec = { ts: ts, gen: SESSION_GEN };
      DB.set(CLE_LIVRE + K, rec);
      tracer(window.flNuitSessionId(K), 'sleep delivery closed', null, null,
             'la montre a tout donné du sommeil');
      return rec;
    } catch (e) { return null; }
  };

  window.flNuitAttendue = function (K, maintenant) {
    K = K || tk(0);
    var now = maintenant || Date.now();
    var out = { due: false, raison: null, reveilMin: null, depuisReveilMin: null };
    try {
      /* ⚠️ L'ORDRE DES REFUS EST CELUI DE LEUR COÛT, et ce n'est pas du
         confort : cette fonction est appelée par `flNuitPublicationOuverte`,
         c'est-à-dire par `flAccueilData`, `flSommeilData` ET `flRecupPublier`,
         donc plusieurs fois par charge, toute la journée. La fenêtre horaire ne
         coûte qu'une lecture d'horloge ; elle passe donc devant les quatre
         lectures de base des trois autres. Hors de deux heures autour du réveil
         déclaré — c'est-à-dire vingt-deux heures sur vingt-quatre — on sort
         avant d'avoir lu quoi que ce soit. La leçon de `charges-refusees.txt` :
         ce qui est lent, ce n'est jamais le calcul, c'est ce qu'on relit. */

      /* Un jour passé n'attend rien : il se relit (doctrine v1463). */
      if (K !== tk(0)) { out.raison = 'jour passé'; return out; }

      /* ① on est passé le réveil déclaré au profil, et pas de plus de deux heures */
      var rev = reveilProfilMin();
      if (rev == null) { out.raison = 'aucun réveil déclaré au profil'; return out; }
      out.reveilMin = rev;
      var d = new Date(now);
      var nowMin = d.getHours() * 60 + d.getMinutes();
      out.depuisReveilMin = nowMin - rev;
      if ((rev - nowMin) * 60000 > AVANT_REVEIL_MS) {
        out.raison = 'plus d\'une heure avant le réveil déclaré';
        return out;
      }
      if ((nowMin - rev) * 60000 > ATTENTE_NUIT_DUE_MS) {
        out.raison = 'deux heures après le réveil déclaré, la montre n\'a rien livré';
        return out;
      }

      /* La mesure gagne toujours : dès qu'elle est là, la machine ordinaire
         prend le relais et cette fonction n'a plus rien à dire. */
      if (nuitDuBracelet(K)) { out.raison = 'la nuit du bracelet est là'; return out; }

      /* Et la montre a peut-être déjà dit qu'elle n'avait rien. On l'écoute
         APRÈS la mesure, jamais avant : un marqueur ne prime pas un fait. */
      /* ═══ 23 sept. 2026 — UN « PAS DE NUIT » NE SE DÉCIDE PAS À MINUIT ════

         Dino, trois matins de suite : « j'ai encore les stats de la veille
         pendant cinq secondes, alors qu'on est censé juste rien avoir ». Sa
         base, le 23 :

             nuitSommeilLivre_2026-9-23  posé à 00:03:38
             la nuit détectée             à 09:09:34

         À trois minutes après minuit, pendant qu'il DORMAIT, le canal sommeil
         a fini une passe sans rien livrer pour le jour qui venait de
         commencer — évidemment, la nuit n'était pas finie — et l'app en a
         conclu « la montre a tout donné, il n'y a pas de nuit aujourd'hui ».
         Ce verdict tenait ensuite toute la matinée : la porte restait ouverte,
         et le repli sur la veille jouait jusqu'à l'arrivée de la vraie nuit.
         Ce n'est pas un cas isolé : le 21 le marqueur est posé à 00:48, le 20
         à 22:45 — la veille au soir.

         LE MARQUEUR RESTE VRAI, C'EST SA LECTURE QUI ÉTAIT FAUSSE. Il dit « la
         montre a vidé sa mémoire de sommeil ». Cette phrase ne devient un
         VERDICT SUR LA JOURNÉE qu'une fois le réveil déclaré passé : avant, la
         nuit du jour n'a simplement pas encore eu lieu, et « rien livré » ne
         veut rien dire.

         ON CORRIGE LA LECTURE, PAS L'ÉCRITURE, et c'est délibéré : la règle
         vaut aussi pour les marqueurs DÉJÀ posés dans la base — celui de ce
         matin y est encore. Changer seulement l'écriture aurait laissé le
         défaut jusqu'à demain.

         LA NUIT BLANCHE EST INTACTE : à 09:00 pour un réveil déclaré à 08:00,
         un marqueur posé après 08:00 est honoré, la porte s'ouvre, et la
         journée d'hier continue de compter — c'est l'arbitrage du 10 sept. */
      try {
        var mrq = DB.get(CLE_LIVRE + K, null);
        if (mrq) {
          var mMin = null;
          try { var dm = new Date(mrq.ts || 0); mMin = dm.getHours() * 60 + dm.getMinutes(); }
          catch (e) { mMin = null; }
          if (mrq.ts && mMin != null && mMin < rev) {
            /* posé avant le réveil déclaré : il ne dit rien de cette journée */
          } else {
            out.raison = 'la montre a tout donné, et il n\'y a pas de nuit';
            return out;
          }
        }
      } catch (e) {}

      /* ② la journée ouverte est née un autre jour civil */
      var jl = null;
      try { if (typeof window.flJourLogique === 'function') jl = window.flJourLogique(); }
      catch (e) {}
      if (!jl) { out.raison = 'journée logique indisponible'; return out; }
      if (jl.origine === 'inconnu') {
        out.raison = 'aucun sommeil jamais mesuré — rien à attendre'; return out;
      }
      if (!jl.cleAncre || jl.cleAncre === K) {
        out.raison = 'la journée du jour a déjà son sommeil'; return out;
      }

      /* ③ ce poignet dort avec nous */
      if (!leBraceletDortAvecNous(K)) {
        out.raison = 'aucune nuit du bracelet sur les trois jours précédents';
        return out;
      }

      out.due = true;
      out.raison = 'journée ouverte le ' + jl.cleAncre + ', réveil déclaré passé';
      return out;
    } catch (e) { out.raison = 'attente : ' + e.message; return out; }
  };

  /* ─────────────────────────────────────────────────────────────────────────
     OÙ EN EST LA NUIT ? — déménagé d'index.html le 3 septembre 2026 (cliquet
     du découpage web). C'est le métier de ce fichier, et rien de sa logique
     n'a changé : seule la lecture de `watchOf` passe par `window`, parce
     qu'un fichier du moteur ne peut pas lire une liaison déclarée dans
     `if(SHELL){…}` (garde-liaisons.js, seconde moitié). */
  /* ═══ v1793 — OÙ EN EST LA NUIT, CE MATIN ? ═══════════════════════════════
     Dino : « au réveil, l utilisateur ne doit jamais se demander est-ce que
     c est ma nuit d hier, est-ce que ca charge, est-ce que ca a plante ».

     LE DEFAUT N EST PAS UN LOADER MANQUANT, C EST UNE QUESTION SANS REPONSE.
     Aujourd hui l ecran lit `sensorOf(jour)` : plein ou vide, et rien entre les
     deux. Or entre les deux il y a au moins quatre situations qui ne se
     ressemblent pas — la montre n a rien livre, elle a livre une nuit qu on n a
     pas encore calculee, la nuit peut encore s allonger, et la vraie nuit
     blanche. Les confondre est ce qui fait clignoter l ecran.

     CETTE FONCTION NE DESSINE RIEN ET NE CALCULE AUCUNE METRIQUE. Elle repond a
     une seule question — ou en est-on — et elle est pure : on lui donne le jour
     et l instant, elle lit le stockage, elle rend un etat. Un banc la rejoue
     mille fois sans attendre un vrai matin.

     LES SEPT ETATS, ET AUCUN N EST UN REPLI :
       `attenteMontre`  la montre n a rien livre pour ce jour. On PEUT montrer la
                        nuit precedente, mais elle doit se dire ancienne.
       `detectee`       un sommeil existe, les metriques ne sont pas la. Calcul.
       `partielle`      la nuit existe et peut encore s allonger : le reveil est
                        recent, un rendormissement la prolongerait.
       `complete`       mesuree, calculee, stable.
       `absente`        DEMONTREE : la montre a rendu tout son sommeil apres la
                        fenetre, et rien n y couvre la nuit.
       `erreur`         le stockage ou le calcul a echoue. Recuperable.
       `inconnu`        le defaut, et il ne se dessine jamais comme une absence.

     ⚠️ UNE NUIT BLANCHE NE S AFFIRME PAS PAR DEFAUT. Tant que la montre n a pas
     dit « je n ai plus rien » APRES la fenetre de nuit, l absence n est pas
     demontree — c est une attente. C est la meme regle que le contrat de la
     v1790 sur la fiche Activite : le defaut est « inconnu », jamais « absent ». */
  window.flEtatNuit=function(K,maintenantMin,repasseSommeilTs){
   try{
    K=K||tk();
    var now=(maintenantMin==null)?(function(){var d=new Date();return d.getHours()*60+d.getMinutes();})()
                                 :+maintenantMin;
    var w=null; try{w=window.watchOf(K);}catch(e){return {etat:'erreur',raison:'stockage illisible'};}

    /* 1 · LA MONTRE A-T-ELLE LIVRE QUOI QUE CE SOIT POUR CE JOUR ? */
    var L=(w&&Array.isArray(w.sommeils))?w.sommeils:[];
    var nuits=L.filter(function(x){return x&&x.type==='mainSleep';});
    if(!nuits.length){
     /* Rien livre. Est-ce une nuit blanche, ou la montre n a pas encore parle ?
        On ne peut trancher que si la montre a VIDE sa memoire de sommeil APRES
        le reveil presume. Sans ce fait, c est une attente, pas une absence. */
     var vide=(repasseSommeilTs!=null&&repasseSommeilTs>0);
     if(vide)return {etat:'absente',
       raison:'La montre a rendu tout son sommeil, et rien ne couvre cette nuit.'};
     return {etat:'attenteMontre',
       raison:'La montre n a pas encore livre cette nuit.'};
    }

    /* 2 · UNE NUIT EXISTE. EST-ELLE CALCULEE ? */
    var n=nuits[0];
    /* ═══ ON LIT LA MÊME SOURCE QUE LA TUILE, ET C'EST TOUT L'ENJEU ════════
       La première version testait `sensorOf(K).sleepMin`. MESURÉ AU SIMULATEUR :
       `sensor_<jour>` valait `null` pendant que la tuile affichait 7h00 — parce
       que la tuile lit `sleepNight(K).asleep`, pas le capteur. On aurait donc
       annoncé « analyse en cours » sur une nuit entièrement calculée.
       Deux lecteurs pour une même question, c'est la faute que ce projet
       connaît déjà : on prend le lecteur de la tuile, et lui seul. */
    var nuitCalc=null;
    try{ nuitCalc=(typeof sleepNight==='function')?sleepNight(K):null; }catch(e){}
    var calculee=!!(nuitCalc&&nuitCalc.asleep!=null);

    /* 3 · PEUT-ELLE ENCORE S ALLONGER ?
       Le reveil est recent : un rendormissement prolongerait la meme nuit. On
       reutilise la fenetre de surveillance du Mode Sport — trente minutes,
       deja justifiee — plutot que d inventer une duree de plus. */
    var finMin=null;
    try{ var f=new Date(n.fin); finMin=f.getHours()*60+f.getMinutes(); }catch(e){}
    var recente=(finMin!=null && now>=finMin && (now-finMin)<=30);

    if(!calculee)return {etat:'detectee', finMin:finMin,
      dormiMin:(n.sleepMin!=null?n.sleepMin:null),
      raison:'Nuit detectee, calcul en cours.'};
    if(recente)return {etat:'partielle', finMin:finMin, dormiMin:nuitCalc.asleep,
      raison:'Nuit en cours de consolidation.'};
    return {etat:'complete', finMin:finMin, dormiMin:nuitCalc.asleep};
   }catch(e){return {etat:'erreur',raison:(e&&e.message)||'inconnue'};}
  };

  /* ─────────────────────────────────────────────────────────────────────────
     LA SESSION — frappée une fois, relue ensuite */

  function lire(K) {
    try { var r = DB.get(CLE + K, null); return (r && r.id) ? r : null; }
    catch (e) { return null; }
  }
  function ecrire(K, rec) {
    try { return !!DB.set(CLE + K, rec); } catch (e) { return false; }
  }

  /* L'IDENTITÉ EST FRAPPÉE À LA DÉTECTION, PAS DÉDUITE À CHAQUE LECTURE.
     Une identité déduite d'une mesure (les bornes de la nuit, par exemple)
     changerait à chaque re-staging du bracelet — et le re-staging déplace les
     bornes de deux à trois minutes à CHAQUE synchro (mesuré le 30 août). On
     aurait alors une nouvelle « nuit » toutes les minutes, donc une nouvelle
     carte, donc exactement ce qu'on ferme ici. */
  function frapper(K, now) {
    return 'ns_' + K + '_' + now;
  }

  window.flNuitSessionId = function (K) {
    K = K || tk(0);
    var r = lire(K);
    return r ? r.id : null;
  };

  /* ─────────────────────────────────────────────────────────────────────────
     ① LA DÉTECTION — une session, et une seule, par nuit */

  window.flNuitDetecter = function (K, maintenant) {
    K = K || tk(0);
    var now = maintenant || Date.now();
    var deja = lire(K);
    /* Une session EXPECTED n'est pas une session close : elle attend la mesure,
       et c'est ici qu'elle la reçoit. Toutes les autres se relisent telles
       quelles — l'idempotence est le contrat de cette fonction. */
    if (deja && deja.etat !== 'EXPECTED') return deja;

    var s = nuitDuBracelet(K);

    if (!s) {
      /* ═══ RIEN DE LU ENCORE — MAIS LA NUIT EST-ELLE DUE ? ════════════════
         Voir le pavé de `flNuitAttendue`. Deux issues seulement, et aucune ne
         laisse l'écran suspendu : ou l'attente est légitime et on frappe la
         session (la porte se ferme, la veille disparaît), ou elle a lapsé et
         on l'efface (tout le comportement d'avant reprend). */
      var att = window.flNuitAttendue(K, now);
      if (att.due) {
        if (deja) return deja;                 /* déjà frappée : rien à refaire */
        var attRec = {
          id: frapper(K, now), K: K, gen: SESSION_GEN,
          etat: 'EXPECTED', cause: null,
          tDetect: null, tAttendue: now,
          tUser: null, tJournalOuvert: null, tJournalFini: null,
          tFinal0: null, tFinal: null,
          raison: att.raison, essais: 0
        };
        ecrire(K, attRec);
        tracer(attRec.id, 'night expected', null, attRec.etat, att.raison);
        return attRec;
      }
      if (deja) {
        /* L'ATTENTE LAPSE, ET ELLE LE DIT. Une session effacée en silence
           ferait réapparaître les chiffres d'hier sans que rien n'explique
           pourquoi — et c'est précisément le clignotement qu'on ferme ici. */
        tracer(deja.id, 'expectation lapsed', null, 'SANS_NUIT', att.raison);
        try { DB.set(CLE + K, null); } catch (e) {}
        /* 12 septembre 2026 — ON SE SOUVIENT D'AVOIR ATTENDU. Dino a dormi
           deux heures de plus que le réveil déclaré à son profil : l'attente a
           lapsé à 10:03:08, la session est effacée, le cycle publie et scelle
           la récupération à 10:03:11.356 sur la nuit ESTIMÉE (185 min,
           01:30 → 04:40), et la montre livre à 10:03:11.907. Sans session, la
           branche MIGRATION de `flNuitDetecter` prend la nuit qui arrive pour
           « déjà publiée avant cette version » et la frappe FINALIZED d'emblée
           — sans traitement, sans sceau. La v2367 la refuse quand la
           publication a moins de vingt minutes ; mais une montre qui livre
           UNE HEURE après le lapse (réveil déclaré 07:00, lever réel 10:00, app
           ouverte à 09:05) retombait dans le même trou, et la récupération
           restait scellée sur l'estimation pour toujours. Le marqueur dit ce
           que la session effacée ne peut plus dire : une nuit ÉTAIT due
           aujourd'hui. Ce qui arrive ensuite pour ce jour est cette nuit-là. */
        try { DB.set(CLE_LAPSE + K, now); } catch (e) {}
      }
      return null;
    }

  /* DEPUIS COMBIEN DE TEMPS LE SCORE DE CE JOUR A-T-IL ÉTÉ PUBLIé ? — en ms, ou
     `null` quand rien ne le date. Deux témoins, tous deux écrits par
     `flint-recup-cycle.js` à chaque publication : `recovEtat_<K>.ts` (toute
     publication, provisoire comprise) et `recovFige_<K>.ts` (le sceau). On
     garde la PLUS RÉCENTE : c'est la dernière fois que quelqu'un a écrit ce
     nombre. Un web ancien n'écrivait ni l'un ni l'autre — `null` rend alors
     exactement le comportement d'avant, et c'est ce qui laisse les vraies
     migrations passer. */
  function agePublication(K, maintenant) {
    var now = maintenant || Date.now();
    var recent = null;
    ['recovEtat_', 'recovFige_'].forEach(function (pre) {
      try {
        var o = DB.get(pre + K, null);
        if (!o || !o.ts) return;
        var t = Date.parse(o.ts);
        if (isNaN(t)) return;
        if (recent == null || t > recent) recent = t;
      } catch (e) {}
    });
    if (recent == null) return null;
    return Math.max(0, now - recent);
  }

    /* ═══ LA MESURE EST ARRIVÉE SUR UNE ATTENTE : MÊME NUIT, MÊME CARTE ═════
       On ne frappe PAS un second identifiant. La nuit n'a pas commencé
       maintenant : elle vient seulement de devenir lisible. Un identifiant
       neuf ferait naître une seconde carte « Sommeil détecté » pour une seule
       session — l'interdit n° 7 de Dino, atteint par le bas. */
    if (deja) {
      deja.etat = 'DETECTED';
      deja.tDetect = now;
      deja.raison = null;
      ecrire(K, deja);
      tracer(deja.id, 'sleep detected (was expected)', null, deja.etat,
             'coucher ' + s.bedMin + ' → réveil ' + s.wakeMin + ', ' + s.sleepMin + ' min');
      return deja;
    }

    /* ═══ LA MIGRATION, ET ELLE COMPTE PLUS QU'ELLE N'EN A L'AIR ═══════════
       Cette version arrive sur des téléphones où des nuits sont DÉJÀ scellées
       (`recovFige_`) ou déjà publiées. Leur frapper une session neuve les
       ferait repasser par « Sommeil détecté » — c'est-à-dire redemander de
       traiter une nuit dont le score est affiché depuis des heures. On frappe
       donc la session à l'état où la nuit est vraiment : FINALIZED. */
    var scelle = null;
    try { scelle = DB.get('recovFige_' + K, null); } catch (e) {}
    var publie = null;
    try { publie = DB.get('recov_' + K, null); } catch (e) {}
    var neuve = (scelle && scelle.s != null) || (publie != null && !isNaN(+publie));

    /* ═══ 12 SEPTEMBRE 2026 — UN SCORE PUBLIÉ IL Y A UNE DEMI-SECONDE
       N'A PAS ÉTÉ PUBLIÉ PAR UNE VERSION PRÉCÉDENTE ════════════════════

       LE MATIN DE DINO, minute par minute, lu dans `nuitMatinJrn` et la base
       de son téléphone. Il dort jusqu'à 10 h 04 — deux heures après le réveil
       déclaré à son profil.

         08:05:45  night expected        — la nuit est DUE, la porte se ferme
         10:03:08  expectation lapsed    — deux heures, la montre n'a rien livré :
                                           la session est EFFACÉE, la porte rouvre
         10:03:11.356  le cycle publie et SCELLE la récupération : 23, sur la
                       nuit que le moteur rendait à cette seconde-là — 185 min,
                       01:30 → 04:40, un fragment
         10:03:11.907  la montre livre enfin. Aucune session n'existe plus, donc
                       on tombe ICI ; `recov_` est là ; on conclut « déjà
                       publiée avant cette version » et on frappe FINALIZED.

       CINQ CENT CINQUANTE MILLISECONDES. La migration existe pour ne pas
       redemander de traiter une nuit d'AVANT cette version ; elle a endossé un
       score que cette version venait d'écrire.

       CE QUE ÇA COÛTE, et c'est ce que Dino a vu à 10 h 28 : une session née
       FINALIZED ne passe JAMAIS par `flNuitFinaliser` — son verrou rend « déjà
       finalisée ». Donc aucun `nuitFige_`. Donc `flNuitServir` n'a rien à
       servir et chaque écran suit le calcul VIVANT, qui bouge à chaque tranche
       que la montre livre : la tuile Sommeil a affiché 4h05 puis 3h13 sous ses
       yeux, dans la même minute, pendant que le score restait à 23. Et la
       réparation automatique ne pouvait rien : `flNuitMesureArrivee` répond
       « aucune nuit scellée », la promotion ne part pas.

       LA RÈGLE. Une publication DATÉE de moins de vingt minutes est la nôtre,
       pas celle d'une version précédente : la nuit arrive, elle n'a été ni
       traitée ni scellée, elle est DETECTED et suit le chemin normal — carte
       « Traiter », finalisation sur la nuit STABLE, sceau, score. Sans date
       (les vraies migrations, écrites par un web qui ne datait pas ses
       publications), le comportement d'avant tient. */
    if (neuve) {
      var _agePub = agePublication(K, now);
      if (_agePub != null && _agePub < MIGRATION_VIEILLE_MS) {
        neuve = false;
        tracer(null, 'migration refused', null, 'DETECTED',
               'le score de ce jour a été publié il y a ' + Math.round(_agePub / 1000)
               + ' s : cette nuit n\'a pas été traitée, elle arrive');
      }
    }
    /* 12 septembre 2026 — UNE ATTENTE QUI A LAPSÉ AUJOURD'HUI N'EST PAS UNE
       MIGRATION, quel que soit l'âge de la publication. Voir le pavé du
       marqueur, dans `flNuitDetecter`. */
    if (neuve) {
      var _lapse = null;
      try { _lapse = DB.get(CLE_LAPSE + K, null); } catch (e) {}
      if (_lapse != null) {
        neuve = false;
        tracer(null, 'migration refused', null, 'DETECTED',
               'l\'attente du matin a lapsé à ' + new Date(+_lapse).toISOString()
               + ' : la nuit qui arrive est celle qu\'on attendait, elle se traite');
      }
    }

    var rec = {
      id: frapper(K, now), K: K, gen: SESSION_GEN,
      etat: neuve ? 'FINALIZED' : 'DETECTED',
      cause: neuve ? 'MIGRATION' : null,
      tDetect: now, tUser: null, tJournalOuvert: null, tJournalFini: null,
      tFinal0: neuve ? now : null, tFinal: neuve ? now : null,
      raison: neuve ? 'nuit déjà publiée avant cette version — rien à retraiter' : null,
      essais: 0
    };
    ecrire(K, rec);
    tracer(rec.id, neuve ? 'sleep detected (already published)' : 'sleep detected',
           rec.cause, rec.etat,
           'coucher ' + s.bedMin + ' → réveil ' + s.wakeMin + ', ' + s.sleepMin + ' min');
    return rec;
  };

  /* ─────────────────────────────────────────────────────────────────────────
     ② L'ÉTAT — LE LECTEUR UNIQUE

     Tout ce qui affiche quoi que ce soit du matin passe par ici, et par rien
     d'autre. C'est la « seule source de vérité » que Dino a demandée : deux
     lecteurs pour une même question, c'est la faute que cette maison connaît
     déjà par cœur (la tuile qui lisait `sensorOf` pendant que `flEtatNuit`
     lisait `sleepNight`).

     Les états DÉCLARÉS (l'utilisateur a touché, la finalisation court, la nuit
     est finalisée) sont des FAITS : ils se relisent tels quels. Les deux
     premiers, eux, se DÉRIVENT du cycle — c'est lui qui sait si la nuit peut
     encore s'allonger, et il le sait mieux qu'un horaire. */
  window.flNuitEtat = function (K, maintenant) {
    K = K || tk(0);
    var now = maintenant || Date.now();
    var out = { K: K, id: null, etat: 'SANS_NUIT', cause: null, raison: null,
                gen: SESSION_GEN, depuisReveilMin: null, cycle: null,
                enTraitement: false, aTraiter: false, finalisee: false,
                attendue: false };
    try {
      var rec = lire(K);
      /* ═══ v2456 — L'HEURE DE RÉVEIL VOYAGE AVEC TOUS LES ÉTATS LIVRÉS ══════
         Elle n'était remplie que dans la branche DETECTED / WAITING_FOR_USER,
         tout en bas. Or une nuit finalisée (FINALIZED) — l'état où les matins
         de Dino atterrissent, et où ils RESTENT tout le jour — repartait avec
         `depuisReveilMin: null`, la valeur de l'initialiseur. Idem pour
         FINALIZING, AUTO_FINALIZING et JOURNAL_IN_PROGRESS.
         CE QUE ÇA A COÛTÉ : `PontNotifs` note l'heure de réveil de la nuit
         (`HistoriqueReveils.noter`) à partir de ce seul champ, et
         `RegleCoucher` exige cinq nuits mesurées avant de conseiller une heure
         de coucher. Le 14 septembre, les préférences du téléphone de Dino ne
         portaient NI `flReveils.minutes` NI `flReveils.jours` : zéro nuit
         enregistrée depuis la pose, donc un conseil du soir qui ne pouvait pas
         sonner — ni ce soir-là, ni jamais. « Le soir, jamais », disait-il.
         Le cycle SAIT l'heure du réveil dans tous ces états ; on la lit une
         fois, ici, et chaque branche la porte. La branche du bas garde son
         affectation : elle dit la même chose. */
      var cyReveil = cycleDe(K);
      if (cyReveil && cyReveil.depuisReveil != null) {
        out.depuisReveilMin = cyReveil.depuisReveil;
      }
      if (!rec) {
        var s = nuitDuBracelet(K);
        if (s) {
          out.etat = 'DETECTED';
          out.raison = 'nuit détectée, session pas encore frappée';
          return out;
        }
        /* CETTE FONCTION NE FRAPPE RIEN — elle lit. Mais elle doit dire la
           MÊME chose que la porte de publication, sinon on retombe sur deux
           lecteurs qui se contredisent (la faute que ce fichier existe pour
           fermer). `flNuitAttendue` est pure : les deux l'appellent. */
        var a0 = window.flNuitAttendue(K, now);
        if (a0.due) {
          out.etat = 'EXPECTED'; out.attendue = true; out.raison = a0.raison;
          return out;
        }
        out.raison = 'aucune nuit du bracelet sur ce jour';
        return out;
      }
      out.id = rec.id; out.cause = rec.cause || null;

      /* ═══ EXPECTED — LA NUIT EST DUE, ELLE N'EST PAS ENCORE LUE ══════════
         Ni « à traiter » (on ne scelle pas ce qu'on n'a pas lu) ni « en
         traitement » (rien ne calcule). Ce qu'elle vaut est ailleurs : la
         porte de publication est FERMÉE, donc les chiffres d'hier ne
         reparaissent pas. Voir le pavé de `flNuitAttendue`. */
      if (rec.etat === 'EXPECTED') {
        out.etat = 'EXPECTED'; out.attendue = true;
        out.raison = rec.raison || 'la montre n\'a pas encore livré cette nuit';
        return out;
      }

      if (rec.etat === 'FINALIZED') {
        out.etat = 'FINALIZED'; out.finalisee = true;
        out.raison = rec.raison || 'nuit finalisée';
        return out;
      }
      if (rec.etat === 'JOURNAL_IN_PROGRESS' || rec.etat === 'FINALIZING'
          || rec.etat === 'AUTO_FINALIZING') {
        out.etat = rec.etat;
        out.enTraitement = (rec.etat !== 'JOURNAL_IN_PROGRESS');
        out.raison = rec.raison || null;
        return out;
      }

      /* DETECTED ou WAITING_FOR_USER : c'est le cycle qui tranche, et lui seul.
         `grace` veut dire « la livraison est close, un rendormissement pourrait
         encore recoller » ; `finale`, « plus rien ne peut la changer ». Dans les
         deux cas la nuit est assez posée pour qu'on ait le droit de la traiter
         sur un geste. Avant, elle arrive encore : la proposer serait promettre
         un traitement sur une matière incomplète. */
      var cyc = cycleDe(K);
      out.cycle = cyc ? cyc.etat : null;
      out.depuisReveilMin = cyc ? cyc.depuisReveil : null;
      if (cyc && (cyc.etat === 'grace' || cyc.etat === 'finale')) {
        out.etat = 'WAITING_FOR_USER'; out.aTraiter = true;
        out.raison = cyc.raison;
      } else {
        out.etat = 'DETECTED';
        out.raison = cyc ? cyc.raison : 'la nuit arrive encore';
        /* ═══ ON NE PROPOSE PAS DE CLORE UNE NUIT QUI COURT ENCORE ══════════
           Le cas : réveil à 4 h, on prend son téléphone, la montre a déjà posé
           un sommeil principal dont le réveil est DEVANT nous (`depuisReveil`
           négatif → cycle `sommeil`). Offrir « Traiter » là revient à proposer
           de sceller une nuit de quatre heures pour un aller-retour aux
           toilettes — et le geste vaut déclaration, donc il scellerait pour de
           bon.
           La carte paraît quand même (« ta nuit est détectée »), parce que
           c'est vrai et que Dino veut la voir dès la détection ; c'est le
           BOUTON qui attend. En `collecte`, en revanche, le réveil a bien eu
           lieu et la livraison finit d'arriver : le geste est légitime, et la
           finalisation se gare proprement le temps que la matière tombe. */
        out.aTraiter = !!(cyc && cyc.etat !== 'sommeil');
      }
      return out;
    } catch (e) { out.panne = e.message; out.raison = 'état : ' + e.message; return out; }
  };

  /* ─────────────────────────────────────────────────────────────────────────
     ③ LE CLIC « TRAITER » — il n'ouvre rien, il DÉCLARE

     Le journal, lui, s'ouvre côté natif dans la même image que le doigt : il
     n'attend pas cette fonction, et c'est tout l'objet de l'ordre demandé.
     Ici on ne fait qu'enregistrer l'intention, et c'est ce qui rend le geste
     idempotent : deux appuis (ou un appui doublé par une repasse du pont) ne
     produisent qu'une session en cours de journal. */
  window.flNuitTraiter = function (K, maintenant) {
    K = K || tk(0);
    var now = maintenant || Date.now();
    var rec = lire(K) || window.flNuitDetecter(K, now);
    if (!rec) return { ok: false, raison: 'aucune nuit du bracelet à traiter' };
    /* On ne scelle pas ce qu'on n'a pas lu. La vue ne montre pas le bouton dans
       cet état — mais un pont peut appeler, et une règle qui n'existe que dans
       un écran n'est pas une règle (même doctrine que le refus juste dessous). */
    if (rec.etat === 'EXPECTED')
      return { ok: false, id: rec.id, etat: rec.etat,
               raison: 'la montre n\'a pas encore livré cette nuit' };
    if (rec.etat === 'FINALIZED')
      return { ok: true, deja: true, id: rec.id, etat: rec.etat,
               raison: 'nuit déjà finalisée' };
    if (rec.etat === 'JOURNAL_IN_PROGRESS' || rec.etat === 'FINALIZING'
        || rec.etat === 'AUTO_FINALIZING')
      return { ok: true, deja: true, id: rec.id, etat: rec.etat,
               raison: 'traitement déjà en cours' };
    /* Le refus vit ICI aussi, et pas seulement dans l'écran : un pont peut
       appeler, et une règle qui n'existe que dans une vue n'est pas une règle.
       Voir le pavé de `flNuitEtat` — une nuit qui court encore ne se clôt pas
       sur un geste. */
    var e0 = window.flNuitEtat(K, now);
    if (e0.aTraiter !== true)
      return { ok: false, id: rec.id, etat: rec.etat,
               raison: 'la nuit court encore — ' + (e0.raison || '') };

    rec.etat = 'JOURNAL_IN_PROGRESS';
    rec.cause = USER;
    rec.tUser = now;
    rec.tJournalOuvert = now;
    rec.raison = 'l\'utilisateur a demandé le traitement';
    ecrire(K, rec);
    tracer(rec.id, 'user tapped process', USER, rec.etat, null);
    /* LE GESTE DIT « JE SUIS LEVÉ », ET ON L'ÉCRIT. Sans ça, la nuit estimée
       continue de s'étendre pendant qu'on la traite — c'est exactement ce qui a
       fait durer le matin du 4 septembre vingt minutes, puis déclaré un faux
       rendormissement sur la nuit qu'on venait de sceller. Voir le pavé du
       réveil déclaré, plus haut. La ligne se pose APRÈS le geste et avant le
       journal : c'est sa conséquence, et le déroulé doit se lire dans cet ordre. */
    try { window.flNuitReveilDeclarer(K, now, USER); } catch (e) {}
    tracer(rec.id, 'journal opened', USER, rec.etat, null);
    return { ok: true, deja: false, id: rec.id, etat: rec.etat };
  };

  /* ─────────────────────────────────────────────────────────────────────────
     ④ LE JOURNAL EST VALIDÉ — et c'est LUI qui lance la chaîne

     Dino : « dès que le journal est terminé/validé, lancer derrière un seul
     pipeline de finalisation ». Le journal fermé SANS être rempli passe aussi
     par ici : il n'est pas une condition, il est une occasion. Ce qu'il change,
     c'est qu'il entre dans le score (v1846) AVANT la publication au lieu de la
     forcer à se corriger après. */
  window.flNuitJournalTermine = function (K, maintenant) {
    K = K || tk(0);
    var now = maintenant || Date.now();
    var rec = lire(K);
    if (!rec) return { ok: false, raison: 'aucune session' };
    if (rec.etat === 'FINALIZED')
      return { ok: true, deja: true, id: rec.id, etat: rec.etat };
    rec.tJournalFini = now;
    ecrire(K, rec);
    tracer(rec.id, 'journal completed', rec.cause || USER, rec.etat, null);
    return window.flNuitFinaliser(K, USER, now);
  };

  /* ─────────────────────────────────────────────────────────────────────────
     ⑤ LA DÉCISION D'AUTO-FINALISATION — pure, donc éprouvable

     « Si le backend détermine avec suffisamment de certitude que l'utilisateur
     est levé depuis longtemps et que le sommeil est terminé. »

     LES DEUX CERTITUDES SONT DÉJÀ MESURÉES, on ne réinvente pas de seuil :
       · `flNuitCycle` rend `finale` quand — et seulement quand — plus aucun
         recollement n'est possible. Deux chemins, tous deux des faits : le
         réveil dépasse `reveilCoupeNuit` (le seuil au-delà duquel le moteur de
         sommeil REFUSE déjà de recoller deux sommeils), ou la journée a repris
         par une marche franche (`marcheSuiteMini` minutes, `marchePasMini`
         pas). « Levé depuis longtemps », c'est exactement ça.
       · `flMesureNuitComplete` rend `complet` quand la matière est là (la fin
         de la nuit est arrivée, la densité de battements est celle d'une nuit
         entière).

     ET DEUX ÉCHAPPATOIRES BORNÉES, parce que le seul échec inacceptable est
     celui qui ne finalise JAMAIS : la livraison silencieuse depuis cinq
     minutes, et deux heures après le réveil. Ce sont les mêmes que la première
     publication (v2139) — un seul jeu de bornes dans la maison.

     ⚠️ ON N'AUTO-FINALISE PAS EN `grace`. Un geste de l'utilisateur vaut
     déclaration (« ma nuit est finie », doctrine de TRAITER depuis la v1236) ;
     une absence de geste ne vaut rien du tout. */
  /* ═══ 20 sept. 2026 — LA DÉCISION AUTOMATIQUE PARLE ENFIN ══════════════════

     Elle refusait en silence. Le 20 septembre, pour savoir POURQUOI le matin de
     Dino n'avait pas de sortie automatique, il a fallu rapatrier sa base et
     rejouer le moteur en Node — une heure, pour une phrase que la fonction
     connaissait déjà et jetait. Le journal du téléphone, lui, ne montrait qu'un
     refus SANS RAPPORT, sur un autre diagnostic (« la montre rend encore »),
     qui a d'abord envoyé chercher au mauvais endroit.

     C'est la même faute que `garde-build.sh` le 16 septembre — un mécanisme qui
     échoue sans nommer sa raison — et elle coûte la même chose : du temps, et
     une conclusion fausse en chemin.

     UNE LIGNE PAR JOUR ET PAR RAISON, pas plus : cette décision est prise à
     chaque charge d'accueil, à chaque fin de synchro et à chaque retour au
     premier plan. Le journal n'est pas une trace d'appel (règle v1335). */
  function direLaDecision(K, raison) {
    try {
      if (!raison) return;
      var cle = 'nuitAutoDite_' + K;
      var vu = null; try { vu = DB.get(cle, null); } catch (e) {}
      if (vu === raison) return;
      try { DB.set(cle, raison); } catch (e) {}
      var m = 'MATIN · automatique refusé (' + K + ') : ' + raison;
      try { console.log('[flint] ' + m); } catch (e) {}
      var n = window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.flint;
      if (n) n.postMessage({ cmd: 'journal', texte: m });
    } catch (e) {}
  }

  window.flNuitAutoDecision = function (K, maintenant) {
    K = K || tk(0);
    var now = maintenant || Date.now();
    var out = { auto: false, raison: null };
    try {
      var rec = lire(K);
      if (!rec) { out.raison = 'aucune session'; return out; }
      if (rec.etat === 'FINALIZED') { out.raison = 'déjà finalisée'; return out; }
      /* Un journal ouvert appartient à l'utilisateur : on ne lui coupe pas
         l'herbe sous le pied pendant qu'il répond. */
      if (rec.etat === 'JOURNAL_IN_PROGRESS') {
        out.raison = 'le journal est ouvert — la main est à l\'utilisateur';
        return out;
      }
      var cyc = cycleDe(K);
      var debout = !!(cyc && cyc.etat === 'grace' && cyc.depuisReveil != null
                      && cyc.depuisReveil >= AUTO_APRES_REVEIL_MIN);
      /* ═══ 20 sept. 2026 — LE DERNIER RECOURS NE DEMANDE RIEN AU CYCLE ═════

         CE MATIN-LÀ, la session est restée WAITING_FOR_USER de 08:32 à 09:55 —
         83 minutes — et `tFinal0` n'a été posé qu'à 09:55 : la finalisation
         n'a JAMAIS été lancée. Donc cette décision-ci a répondu « non » à
         chaque passe, et personne ne peut dire pourquoi : elle n'écrivait
         rien. Rejouée sur la base rapatriée elle répond « oui », donc l'état
         du cycle à cet instant-là ne s'y retrouve plus — la seule chose
         certaine est qu'elle a refusé.

         LE FILET NE PEUT PAS DÉPENDRE DE CE QU'ON N'ARRIVE PAS À RELIRE. Les
         deux conditions ci-dessus interrogent toutes les deux le CYCLE ; si le
         cycle n'est pas là, ou n'est pas dans l'état attendu, le matin n'a plus
         aucune sortie automatique et tout repose sur le doigt de Dino — c'est
         exactement ce qui a fait de ma régression du bouton un mur de 83
         minutes au lieu d'une gêne.

         ON AJOUTE DONC UNE SORTIE QUI NE DEMANDE RIEN À PERSONNE : la nuit est
         détectée depuis plus d'une heure et elle n'est toujours pas finalisée.
         Aucune constante neuve — c'est la même heure que `debout`, celle que
         Dino a dictée le 11 septembre (« Traiter c'est vraiment quand tu viens
         de te réveiller »).

         CE QUE ÇA NE CONTOURNE PAS, et c'est ce qui rend la règle sûre : la
         MATIÈRE (`flNuitMatiere`, deuxième porte) et le plafond d'attente de
         trois minutes restent devant. On ne scelle donc jamais sur une nuit
         dont les intervalles arrivent encore — on cesse seulement d'attendre
         un état de cycle qu'on ne sait pas lire. Et si la nuit s'allonge
         vraiment ensuite, le rendormissement garde son unique réouverture.
         Mesuré sur la base du 20 septembre : finalisation à 09:25, et le score
         est 68 — le même que celui qu'il a fini par obtenir. */
      var detectDepuis = (rec.tDetect != null) ? Math.round((now - rec.tDetect) / 60000) : null;
      var recours = (detectDepuis != null && detectDepuis >= AUTO_APRES_REVEIL_MIN);
      if (!recours && (!cyc || (cyc.etat !== 'finale' && !debout))) {
        out.raison = 'la nuit peut encore bouger (' + (cyc ? cyc.etat : 'cycle absent') + ')';
        direLaDecision(K, out.raison);
        return out;
      }
      var pret = window.flNuitMatiere(K, now);
      if (!pret.pret) { out.raison = pret.raison; direLaDecision(K, out.raison); return out; }
      out.auto = true;
      out.raison = (recours && !debout && !(cyc && cyc.etat === 'finale'))
        ? ('détectée depuis ' + detectDepuis + ' min, sans attendre le cycle — ' + pret.raison)
        : ((debout ? 'debout depuis ' : 'levé depuis ')
           + ((cyc && cyc.depuisReveil != null) ? cyc.depuisReveil : detectDepuis) + ' min — ' + pret.raison);
      return out;
    } catch (e) { out.raison = 'décision : ' + e.message; return out; }
  };

  /* LA MATIÈRE EST-ELLE LÀ ? — la porte de la v2139, sortie et nommée.
     Elle était enfermée dans `flRecupPublier` et ne servait qu'à sa première
     publication ; c'est la même question ici, et elle ne doit exister qu'une
     fois. Les trois issues sont inchangées, y compris leurs bornes. */
  window.flNuitMatiere = function (K, maintenant) {
    K = K || tk(0);
    var now = maintenant || Date.now();
    var mes = null;
    try { if (typeof window.flMesureNuitComplete === 'function') mes = window.flMesureNuitComplete(K); }
    catch (e) {}
    /* `null` = on ne peut pas juger (pas de battements gardés) : le doute est
       un feu vert, jamais un blocage. C'est la règle du dossier. */
    if (!mes || mes.complet !== false)
      return { pret: true, raison: (mes && mes.raison) || 'rien ne s\'oppose au jugement' };

    /* ① la livraison s'est tue : on ne gagnera plus rien à attendre. */
    var vu = null;
    try { vu = DB.get('recovMes_' + K, null); } catch (e) {}
    if (!vu || vu.n !== mes.minutes) {
      try { DB.set('recovMes_' + K, { n: mes.minutes, t: now }); } catch (e) {}
      vu = { n: mes.minutes, t: now };
    }
    if ((now - (vu.t || 0)) >= 300000)
      return { pret: true, raison: 'livraison silencieuse depuis 5 min' };

    /* ② deux heures après le réveil : on publie ce qu'on a, quoi qu'il arrive. */
    var cyc = cycleDe(K);
    if (cyc && cyc.depuisReveil != null && cyc.depuisReveil >= 120)
      return { pret: true, raison: 'deux heures après le réveil — on prend ce qu\'on a' };

    return { pret: false, raison: 'les battements de la nuit arrivent encore — ' + mes.raison };
  };

  /* ═══ v2246 — LA MATIÈRE, C'EST AUSSI LES INTERVALLES R-R ═══════════════════

     LE 5 SEPTEMBRE À 08H02, `flNuitMatiere` a dit « prêt » : le pouls minute
     était complet. Mais les intervalles R-R — qui arrivent par un autre canal,
     plus lent — n'étaient pas là : moins de cinq minutes exploitables, donc
     `flRmssdNuit` refusait de conclure, donc `sensorOf` a servi la PUCE, et la
     récupération a été scellée sur le repli. À 10h36 les R-R sont là.

     Le sceau a tenu, et il a bien fait — mais il a scellé un nombre né sur un
     repli, par chance le bon. WHOOP, le 7 septembre : « on ne publie pas sur un
     signal incomplet ; on attend la nuit consolidée ». C'est la règle ici.

     LA QUESTION N'EST POSÉE QU'UNE FOIS, À CET ENDROIT — c'est la leçon de la
     v2211 : deux portes sur la même question finissent par se contredire, et
     une nuit se retrouve scellée sans score. `flRecupPublier` ne rejuge pas.

     ET ELLE EST BORNÉE, parce que le seul échec inacceptable est celui qui ne
     publie jamais : les mêmes deux portes que pour le pouls — le canal R-R
     s'est tu depuis cinq minutes (la livraison est finie ou en panne, on ne
     gagnera rien à attendre), ou deux heures ont passé depuis le réveil. Et
     deux abstentions : le bracelet n'a pas mesuré de variabilité cette nuit
     (rien à attendre), ou le RMSSD est déjà calculable (rien à attendre non
     plus). Le doute reste un feu vert.

     Le compteur de silence a sa propre clé (`recovRr_`) : celui du pouls
     (`recovMes_`) se remettrait à zéro à chaque minute de FC arrivée, et
     masquerait un canal R-R parfaitement muet. */
  var _matiereHr = window.flNuitMatiere;
  window.flNuitMatiere = function (K, maintenant) {
    K = K || tk(0);
    var now = maintenant || Date.now();
    var hr = _matiereHr(K, now);
    if (!hr.pret) return hr;
    try {
      var w = (typeof watchOf === 'function') ? watchOf(K) : null;
      if (!w || !w.night || !w.hrvMontre || !w.hrvMontre.length) return hr;
      if (typeof flRmssdNuit !== 'function') return hr;
      var r = flRmssdNuit(K);
      if (r && r.ok) return hr;
      var nb = (w.rrH || []).length;
      var vu = null;
      try { vu = DB.get('recovRr_' + K, null); } catch (e) {}
      if (!vu || vu.n !== nb) {
        try { DB.set('recovRr_' + K, { n: nb, t: now }); } catch (e) {}
        vu = { n: nb, t: now };
      }
      if ((now - (vu.t || 0)) >= 300000)
        return { pret: true, raison: 'les intervalles R-R se sont tus depuis 5 min — on prend ce qu\'on a' };
      var cyc = cycleDe(K);
      /* 9 SEPTEMBRE 2026 — LA BORNE DES DEUX HEURES NE COUPE PAS UNE LIVRAISON EN COURS.
         Le bracelet a livré les trames de la nuit à 10 h 10-10 h 13, deux heures huit
         après le réveil. À 10 h 13 la borne était passée : elle a dit « prêt » pendant
         que les R-R arrivaient (23 minutes reçues à 10 h 12, RMSSD calculable trois
         minutes plus tard), et le sceau a pris six valeurs de puce — 83 quand la nuit
         complète dit 79 (dossier §28-29). La borne reste (un bracelet absent doit
         laisser sceller) mais elle n'a de sens que sur un silence : tant que des R-R
         viennent d'arriver (moins d'une minute), on est en train de recevoir la nuit —
         sans aucun R-R, la borne reste libre (bracelet absent) — et le plafond de trois minutes de la finalisation borne l'attente de toute
         façon. Banc : test-nuit-matin.js §16 (« deux heures après, mais ça arrive »). */
      if (cyc && cyc.depuisReveil != null && cyc.depuisReveil >= 120 && (nb === 0 || (now - (vu.t || 0)) >= 60000))
        return { pret: true, raison: 'deux heures après le réveil — on prend ce qu\'on a' };
      return { pret: false, raison: 'les intervalles R-R de la nuit arrivent encore — '
                                    + ((r && r.raison) || 'RMSSD pas encore calculable') };
    } catch (e) { return hr; }
  };

  /* ─────────────────────────────────────────────────────────────────────────
     ⑥ LE PIPELINE — un seul, atomique, idempotent

     L'ORDRE EST CELUI QUE DINO A ÉCRIT, et il n'est pas décoratif :
       1. verrouiller définitivement la session ;
       2. calculer/finaliser les données de la nuit ;
       3. calculer le score de sommeil ;
       4. calculer la récupération À PARTIR de cette nuit finalisée ;
       5. sauvegarder ;
       6. mettre à jour l'UI UNE FOIS.

     Le point 4 est celui qui n'existait pas. La récupération se calculait sur
     l'état COURANT de la base, sans jamais savoir si la nuit sur laquelle elle
     portait était finie — c'est la cause racine du 87 → 70 → 71 du 30 août, et
     du 38 → 27 du 2 septembre. Ici elle est appelée APRÈS le sceau de la nuit,
     et une seule fois.

     ⚠️ SI LA MATIÈRE N'EST PAS LÀ, ON RESTE EN FINALIZING. On ne publie pas un
     à-peu-près et on ne retombe pas en arrière : l'écran garde son état de
     traitement — celui que Dino veut « extrêmement clair et unique » — et le
     réveil de fin de livraison rappellera. C'est la seule attente visible du
     matin, et elle a un nom. */
  /* ═══ LA REPRISE D'UNE FINALISATION GARÉE — v2184b ═════════════════════════

     VU AU SIMULATEUR, LE 3 SEPTEMBRE À 09 H 22. Le journal validé, la
     finalisation se gare proprement (« la nuit n'est pas encore posée
     (collecte) ») — c'est le comportement voulu. Puis PLUS RIEN : sept minutes
     de « Traitement de ta nuit » sans que la reprise n'ait lieu une seule fois.

     LA CAUSE ÉTAIT DANS MA PROPRE CORRECTION. La finalisation garée appelait
     `flRecupReveilArmer`, dont la première ligne est `clearTimeout`. Or
     `flNuitPasse` repasse à CHAQUE charge d'accueil — et l'accueil se pousse
     bien plus souvent que toutes les 125 secondes. Chaque passage repoussait
     donc l'échéance qu'il croyait poser : une minuterie qui se réarme plus vite
     qu'elle ne sonne ne sonne jamais.

     C'EST LA MÊME FAMILLE QUE LES TROIS VERROUS MORTS DE LA v2045, et il faut
     le dire ainsi : là-bas, trois faits d'ARRIVÉE gardaient la collecte
     éternellement fraîche ; ici, une échéance repoussée par sa propre relecture.
     Dans les deux cas, le mécanisme se nourrit de ce qui devrait le faire finir.

     LA RÈGLE : une minuterie de reprise s'arme UNE FOIS et ne se repousse pas.
     Elle appartient à la nuit du matin, pas au cycle de la récupération — d'où
     sa présence ici et le retrait de `flRecupReveilArmer` du chemin de la
     finalisation, où il n'avait rien à faire.

     TRENTE SECONDES, et ce n'est pas un réglage : la plus longue attente qu'une
     finalisation garée puisse subir est la fenêtre d'observation de la nuit
     (120 s, `flNuitCycle`). Quatre tirs la couvrent, et un tir coûte deux
     lectures de base quand il n'y a rien à faire. */
  var repriseT = null;
  /* ═══ v2190 — L'ÉCHELLE, ET POURQUOI CE N'EST PAS « 30 s » ════════════════

     Trente secondes en plat, c'était la bonne borne HAUTE et la mauvaise borne
     BASSE. La finalisation garée attend un feu qui peut s'allumer à n'importe
     quel instant de la fenêtre d'observation : si elle ne regarde que toutes
     les 30 s, elle ajoute en moyenne QUINZE SECONDES de « Traitement de ta
     nuit » après que tout est prêt. C'est du temps mort pur — Dino le voit,
     et rien ne se calcule pendant.

     Un tir qui n'a rien à faire coûte deux lectures de base. On peut donc
     regarder souvent AU DÉBUT, quand la probabilité que le feu passe est la
     plus forte, et s'espacer ensuite : 4 s, 8 s, 15 s, puis 30 s en palier.
     Les quatre premiers tirs couvrent la première minute pour le prix de
     huit lectures ; le palier de 30 s reprend la main pour les attentes
     longues (livraison qui traîne, deux heures après le réveil).

     L'ÉCHELLE SE REMET À ZÉRO au démarrage d'une finalisation, jamais à
     chaque tir : sinon on retomberait sur une minuterie qui se réarme plus
     vite qu'elle ne sonne — le défaut du 3 septembre, ligne 7 bis du banc. */
  /* ═══ v2190 — CE QUI PERMET DE NE PAS ATTENDRE LA FENÊTRE D'OBSERVATION ═══

     LA DÉPENSE, MESURÉE AU SIMULATEUR LE 3 SEPTEMBRE. Journal validé à
     09:55:20, publication à 09:56:54 : 94 secondes d'écran « Traitement de ta
     nuit » pendant lesquelles il ne se calculait RIEN. Le pipeline lui-même
     tient en quelques dizaines de millisecondes ; tout le reste, c'était la
     fenêtre d'observation de `flNuitCycle` — deux minutes de signature stable
     avant de sortir de `collecte`.

     CETTE FENÊTRE EST JUSTE, ET ELLE RÉPOND À UNE AUTRE QUESTION. Elle existe
     parce que juger l'ARRIVÉE des données par des événements a produit trois
     verrous morts en une matinée (v2045) : la seule façon fiable de savoir que
     la montre a fini de livrer était de constater que la nuit ne bouge plus
     pendant deux minutes. C'est une mesure INDIRECTE — un délai faute de
     preuve.

     OR LA PREUVE DIRECTE EXISTE, et elle est déjà écrite à côté :
     `flMesureNuitComplete` regarde les BATTEMENTS eux-mêmes et répond « la
     dernière minute mesurée tombe à moins de 15 min du réveil, à 9/h ou plus ».
     Quand elle dit OUI, il n'y a plus rien à attendre : la matière de la nuit
     est là en entier. Attendre encore la fenêtre, c'est réclamer un délai pour
     établir ce qui est déjà établi.

     TROIS VERROUS SUR CE RACCOURCI, et chacun a sa raison :

       ① `cause === USER` (ou RENDORMI). Le raccourci échange une marge de
          sécurité contre de la vitesse — seul un humain qui attend devant
          l'écran justifie ce troc. La finalisation AUTOMATIQUE, elle, a tout
          son temps : elle garde la fenêtre entière. C'est aussi ce qui fait
          que le raccourci ne peut pas s'appliquer dans le dos de personne.

       ② `complet === true` STRICTEMENT. `flMesureNuitComplete` rend `null`
          quand elle ne peut pas juger (aucun battement gardé, `rrH` purgé à
          sept jours). Ailleurs dans ce fichier le doute est un feu vert —
          `flNuitMatiere` le dit et c'est la règle du dossier, parce qu'un
          doute qui bloque ferme la porte pour toujours. ICI C'EST L'INVERSE,
          et l'asymétrie est voulue : on ne RACCOURCIT une fenêtre de sécurité
          que sur une preuve POSITIVE. Sans battements, on attend comme avant.

       ③ `cyc.depuisReveil != null`. La `collecte` a deux causes : la fenêtre
          d'observation, et « fin de nuit inconnue ». Dans le second cas on ne
          sait même pas quand la nuit s'est terminée — aucune mesure de
          complétude ne veut dire quoi que ce soit, et `depuisReveil` reste
          nul. Le raccourci ne s'y applique pas.

     ET LE FILET EST DÉJÀ TENDU DERRIÈRE. Si la montre livrait après coup une
     demi-heure de sommeil supplémentaire — le seul cas où ce raccourci aurait
     scellé trop tôt — `flNuitRendormissement` la voit (5 min d'écart suffisent)
     et `flNuitRouvrir` reprend la nuit. C'est le mécanisme que Dino a demandé
     pour le rendormissement ; il couvre celui-ci par construction. */
  function nuitLivreeEntiere(K) {
    try {
      if (typeof window.flMesureNuitComplete !== 'function') return false;
      var m = window.flMesureNuitComplete(K);
      return !!(m && m.complet === true);
    } catch (e) { return false; }
  }

  /* v2210 — LE PLAFOND DE L'ATTENTE VISIBLE. Trois minutes : au-delà, la
     fenêtre d'observation du cycle (120 s) est écoulée de toute façon, donc
     attendre davantage n'apprend plus rien — ça ne fait que tenir un écran de
     traitement devant quelqu'un qui vient de se lever. */
  var ATTENTE_MAX_MS = 180000;
  var REPRISE_MS = [4000, 8000, 15000, 30000];
  var repriseRang = 0;
  function armerReprise() {
    if (repriseT) return;                       /* déjà armée : on ne repousse pas */
    var d = REPRISE_MS[Math.min(repriseRang, REPRISE_MS.length - 1)];
    repriseRang++;
    try {
      repriseT = setTimeout(function () {
        repriseT = null;
        try { window.flNuitPasse('REPRISE'); } catch (e) {}
      }, d);
    } catch (e) { repriseT = null; }
  }

  /* LE VERROU DE RÉENTRANCE, ET IL EST INDISPENSABLE. La publication finale
     pousse vers les écrans ; les écrans redemandent leur charge ; la charge
     repasse par ici. Sans ce drapeau, la finalisation s'appellerait elle-même
     au milieu de sa propre écriture. Il est en MÉMOIRE (pas sur le disque) :
     il ne protège qu'un appel dans un autre, jamais deux sessions — c'est
     `rec.etat` sur le disque qui tient l'unicité, et lui seul survit à une
     relance de l'app. */
  var enCours = false;

  window.flNuitFinaliser = function (K, cause, maintenant) {
    K = K || tk(0);
    cause = cause || AUTO;
    var now = maintenant || Date.now();
    var res = { ok: false, id: null, etat: null, attente: false, raison: null, publie: false };
    if (enCours) { res.raison = 'finalisation déjà en cours dans cet appel'; return res; }
    enCours = true;
    try {
      var rec = lire(K) || window.flNuitDetecter(K, now);
      if (!rec) { res.raison = 'aucune nuit du bracelet à finaliser'; return res; }
      res.id = rec.id;

      /* ── 1 · LE VERROU. Rejouer une finalisation ne recrée rien. ────────── */
      if (rec.etat === 'FINALIZED') {
        res.ok = true; res.etat = 'FINALIZED'; res.deja = true;
        res.raison = 'nuit déjà finalisée';
        return res;
      }
      var courait = (rec.etat === 'FINALIZING' || rec.etat === 'AUTO_FINALIZING');
      if (!courait) {
        rec.etat = (cause === USER) ? 'FINALIZING' : 'AUTO_FINALIZING';
        rec.cause = cause;
        rec.tFinal0 = now;
        rec.essais = 0;
        repriseRang = 0;      /* v2190 — une finalisation neuve regarde souvent d'abord */
        ecrire(K, rec);
        tracer(rec.id, 'sleep finalization started', cause, rec.etat, null);
      }
      rec.essais = (rec.essais || 0) + 1;
      res.etat = rec.etat;

      /* ── 2 · LA NUIT EST-ELLE JUGEABLE ? ──────────────────────────────── */
      var cyc = cycleDe(K);
      /* `RENDORMISSEMENT` vaut déclaration au même titre qu'un geste : la nuit
         a DÉJÀ changé, on ne va pas attendre quatre heures pour le dire. */
      /* `MESURE_ARRIVEE` vaut déclaration au même titre : la nuit du bracelet
         arrive COMPLÈTE, d'un bloc, avec son hypnogramme et ses intervalles —
         il n'y a rien à observer et rien à attendre. */
      var declare = (cause === USER || cause === RENDORMI || cause === MESURE);
      var dit = null;
      try { dit = window.flNuitReveilDit(K); } catch (e) {}
      var cycleOk = !!(cyc && (cyc.etat === 'finale'
                    || (cyc.etat === 'grace' && declare)
                    || (cyc.etat === 'collecte' && declare
                        && cyc.depuisReveil != null && nuitLivreeEntiere(K))));
      if (cycleOk && cyc.etat === 'collecte')
        tracer(rec.id, 'observation window skipped', cause, rec.etat,
               'battements complets jusqu\'au réveil — la fenêtre d\'observation n\'a plus rien à établir');
      /* ═══ v2210 — UN RÉVEIL DÉCLARÉ FERME LA FENÊTRE D'OBSERVATION ═════════

         La fenêtre de deux minutes établit UNE chose : « la montre a fini de
         livrer », mesurée indirectement par « les bornes de la nuit ne bougent
         plus ». Quand l'utilisateur a déclaré son réveil, ces bornes ne PEUVENT
         plus bouger — `flNuitBorneFin` les tient. La fenêtre n'a donc plus rien
         à établir, et l'attendre revient à réclamer un délai pour prouver ce
         qui est déjà vrai.

         Ce qui reste à savoir, « la matière est-elle là », n'est pas sa
         question : c'est celle de `flNuitMatiere`, juste en dessous, et elle a
         ses propres bornes. Le filet du rendormissement reste tendu derrière.

         Mesuré sur le matin du 4 septembre : le geste est à 07:49:39, la
         publication à 07:55:31 — cinq minutes et demie pendant lesquelles il ne
         se calculait rien, parce que la nuit estimée changeait de signature à
         chaque minute et remettait la fenêtre à zéro. */
      if (!cycleOk && declare && dit != null && cyc
          && (cyc.etat === 'collecte' || cyc.etat === 'sommeil')) {
        cycleOk = true;
        tracer(rec.id, 'observation window skipped', cause, rec.etat,
               'réveil déclaré — les bornes de la nuit ne peuvent plus bouger');
      }
      /* ═══ v2210 — LE FILET : UNE FINALISATION NE SE GARE PAS INDÉFINIMENT ══

         Le 4 septembre, la session est restée en FINALIZING avec `essais: 111`
         et la raison « la nuit n'est pas encore posée (sommeil) » — vingt
         minutes d'écran de traitement, sans issue, parce que la condition
         attendue ne pouvait plus devenir vraie. Toutes les portes de ce fichier
         sont bornées SAUF celle-ci ; c'était le trou.

         Trois minutes : au-delà, la fenêtre d'observation (120 s) est de toute
         façon écoulée, donc attendre encore ne peut plus rien apprendre. On
         publie ce qu'on a, on le TRACE, et le rendormissement garde sa
         réouverture si la nuit bouge vraiment ensuite. */
      if (!cycleOk && rec.tFinal0 && (now - rec.tFinal0) >= ATTENTE_MAX_MS) {
        cycleOk = true;
        tracer(rec.id, 'parking timed out', cause, rec.etat,
               'garée depuis ' + Math.round((now - rec.tFinal0) / 60000)
               + ' min sur « ' + (cyc ? cyc.etat : 'cycle absent')
               + ' » — on publie ce qu\'on a plutôt que de ne jamais publier');
      }
      if (!cycleOk) {
        rec.raison = 'la nuit n\'est pas encore posée (' + (cyc ? cyc.etat : 'cycle absent') + ')';
        ecrire(K, rec);
        res.attente = true; res.raison = rec.raison;
        armerReprise();
        return res;
      }
      var mat = window.flNuitMatiere(K, now);
      /* La deuxième porte, et le même filet : elle a ses bornes (livraison
         silencieuse, deux heures après le réveil), mais elles se comptent en
         heures. Trois minutes d'écran de traitement suffisent. */
      if (!mat.pret && rec.tFinal0 && (now - rec.tFinal0) >= ATTENTE_MAX_MS) {
        tracer(rec.id, 'parking timed out', cause, rec.etat,
               'garée depuis ' + Math.round((now - rec.tFinal0) / 60000)
               + ' min sur la matière — ' + mat.raison);
        mat = { pret: true, raison: 'plafond d\'attente atteint — ' + mat.raison };
      }
      if (!mat.pret) {
        rec.raison = mat.raison;
        ecrire(K, rec);
        res.attente = true; res.raison = mat.raison;
        armerReprise();
        return res;
      }

      /* ── 3 · LA NUIT, FIGÉE. ───────────────────────────────────────────
         On ne recalcule pas la nuit : on prend l'instantané que le moteur rend
         et on l'ÉCRIT. À partir d'ici, ce qui s'affiche vient de cette case et
         d'aucune autre — une relivraison tardive ne peut plus la déplacer. */
      var n = null;
      try { n = (typeof sleepNight === 'function') ? sleepNight(K) : null; } catch (e) {}
      if (!n || n.asleep == null) {
        rec.raison = 'le moteur de sommeil ne rend pas cette nuit';
        ecrire(K, rec);
        res.attente = true; res.raison = rec.raison;
        armerReprise();
        return res;
      }
      var fige = { asleep: n.asleep, awake: (n.awake != null ? n.awake : null),
                   bedMin: (n.bedMin != null ? n.bedMin : null),
                   wakeMin: (n.wakeMin != null ? n.wakeMin : null),
                   efficiency: (n.efficiency != null ? n.efficiency : null),
                   /* v2210 — D'OÙ VIENT CE QU'ON SCELLE. Sans ce champ, on ne
                      peut pas distinguer une nuit MESURÉE par le bracelet d'une
                      nuit DÉDUITE de la fréquence cardiaque — donc pas savoir
                      si l'arrivée tardive de la mesure doit resceller. Voir
                      `flNuitMesureArrivee`. */
                   src: (mesureBracelet(K) ? 'ble' : 'estimation'),
                   ts: new Date(now).toISOString(), gen: SESSION_GEN, id: rec.id };
      try { DB.set(CLE_NUIT + K, fige); } catch (e) {}

      /* ── 4 · LE SCORE DE SOMMEIL, sur la nuit qu'on vient de figer. ───── */
      var sc = null;
      try {
        if (typeof window.flScoreSommeil === 'function')
          sc = window.flScoreSommeil(K, fige.asleep, fige.awake);
      } catch (e) {}
      if (sc && sc.score != null) {
        try { DB.set(CLE_SCORE + K, { s: sc.score, ts: fige.ts, gen: SESSION_GEN, id: rec.id }); }
        catch (e) {}
      }

      /* ── 5 · LA RÉCUPÉRATION, ET SEULEMENT MAINTENANT. ─────────────────
         Le troisième argument lève la porte de publication : c'est le SEUL
         appelant qui a le droit de la lever, et c'est ce qui garantit qu'aucun
         score intermédiaire ne peut sortir par ailleurs. Le `true` force aussi
         le sceau en `grace` quand l'utilisateur a déclaré sa nuit finie — même
         doctrine que TRAITER sur une séance (v1236). */
      tracer(rec.id, 'recovery calculation started', cause, rec.etat,
             'nuit ' + fige.asleep + ' min' + (sc && sc.score != null ? ', score sommeil ' + sc.score : ''));
      var r = null;
      try {
        if (typeof window.flRecupPublier === 'function')
          r = window.flRecupPublier(K, 'finalisation', true);
      } catch (e) { r = null; }

      /* Une récupération qui ne rend rien n'est PAS un échec de la nuit : la
         base peut être en calibration (moins de quatre nuits portées), et la
         nuit, elle, est finalisée pour de bon. On scelle la session ; l'anneau
         de récup dira ce qu'il a à dire par son propre canal. */

      /* ── 6 · LE SCEAU DE LA SESSION. ──────────────────────────────────── */
      rec.etat = 'FINALIZED';
      rec.tFinal = now;
      rec.raison = 'finalisée par ' + cause
                 + (r && r.s != null ? ' — récupération ' + r.s : ' — sans score de récupération');
      ecrire(K, rec);
      tracer(rec.id, 'sleep finalized', cause, rec.etat,
             'coucher ' + fige.bedMin + ' → réveil ' + fige.wakeMin + ', ' + fige.asleep + ' min'
             + (sc && sc.score != null ? ', score ' + sc.score : ''));

      /* ── 7 · UNE SEULE POUSSÉE VERS L'ÉCRAN. ──────────────────────────
         `flRafraichirDonnees` envoie accueil + sommeil + récup dans la MÊME
         milliseconde : c'est la publication atomique demandée. On ne passe pas
         par `flRafraichirDouce` (1,2 s de frein) — la finalisation est un
         événement, pas une rafale de trames. */
      try {
        if (typeof window.flRafraichirDonnees === 'function')
          setTimeout(function () { try { window.flRafraichirDonnees(); } catch (e) {} }, 0);
      } catch (e) {}
      tracer(rec.id, 'morning state published', cause, rec.etat,
             (r && r.s != null) ? ('récupération ' + r.s + ' [' + (r.etat || '?') + ']')
                                : ('pas de récupération : ' + ((r && r.raison) || 'calcul indisponible')));

      res.ok = true; res.etat = 'FINALIZED'; res.publie = true;
      res.recup = (r && r.s != null) ? r.s : null;
      res.scoreSommeil = (sc && sc.score != null) ? sc.score : null;
      res.raison = rec.raison;
      return res;
    } catch (e) {
      res.panne = e.message; res.raison = 'finalisation : ' + e.message;
      return res;
    } finally { enCours = false; }
  };

  /* ─────────────────────────────────────────────────────────────────────────
     ⑦ LA PASSE — l'occasion unique, appelée de partout, sans effet de rafale

     Le pont l'appelle au retour au premier plan, à la fin d'une synchro, au
     réveil de la minuterie de fin de livraison et au montage du moteur. Elle
     doit donc être BON MARCHÉ quand il n'y a rien à faire, et surtout ne
     jamais lancer deux traitements pour la même nuit. Les deux propriétés
     viennent du même endroit : l'état est sur le disque, pas en mémoire, donc
     une relance de l'app ne peut pas le perdre ni le doubler. */
  window.flNuitPasse = function (cause, maintenant) {
    var now = maintenant || Date.now();
    var K = tk(0);
    var out = { K: K, etat: null, agi: null };
    try {
      /* ═══ v2210 — ON RECOUPE AVANT DE LIRE, JAMAIS APRÈS ═══════════════════
         Une nuit ESTIMÉE qui finit dans le futur met le cycle en `sommeil` et
         gare tout ce qui suit — c'est le matin du 4 septembre. La borne existe
         désormais, mais elle ne s'applique qu'au moment où la nuit est écrite :
         une nuit déjà stockée trop longue le resterait jusqu'à la prochaine
         livraison du bracelet. Or c'est précisément quand le bracelet ne livre
         PAS que ce chemin sert. On recoupe donc ici, en tête de la passe, avant
         que quiconque ne lise l'état. Le pré-contrôle de `flNuitRecouper` rend
         l'appel gratuit quand il n'y a rien à recouper — le cas normal. */
      retirerLeSceauDu8Septembre();   /* v2268 — le correctif daté, avant toute lecture d'état */
      try { if (typeof window.flNuitRecouper === 'function') window.flNuitRecouper(K); }
      catch (e) {}
      window.flNuitDetecter(K, now);
      var e = window.flNuitEtat(K, now);
      out.id = e.id; out.etat = e.etat;
      if (e.etat === 'SANS_NUIT') return out;
      /* Une nuit DUE n'a rien à finaliser : il n'y a pas encore de nuit. La
         passe s'arrête ici, et elle repassera — le pont la rappelle à chaque
         charge d'accueil, à chaque fin de synchro et au retour au premier
         plan, c'est-à-dire exactement quand la mesure peut être arrivée. */
      if (e.etat === 'EXPECTED') return out;
      /* UNE NUIT FINALISÉE N'EST PAS UNE NUIT OUBLIÉE. On regarde une seule
         chose sur elle — s'est-elle recollée depuis le sceau — et une seule
         fois. Voir le pavé de `flNuitRendormissement`. */
      if (e.etat === 'FINALIZED') {
        /* ═══ v2210 — LA PROMOTION SE DEMANDE AVANT LE RENDORMISSEMENT ═══════

           Les deux événements produisent le même symptôme — la nuit ne vaut
           plus ce qui est scellé — et le rendormissement, plus ancien, les
           attrapait tous les deux. C'est une erreur de diagnostic, et elle
           coûte : la nuit du bracelet arrivée après coup n'est PAS un
           recollement, elle est la même nuit enfin mesurée. La traiter comme un
           rendormissement consommerait l'unique réouverture — celle qu'il faut
           garder pour un VRAI retour au lit à 09 h.

           On pose donc la question la plus précise d'abord. Le rendormissement
           ne reste saisi que de ce qu'il est seul à savoir voir : une nuit qui
           s'allonge alors que sa source n'a pas changé. */
        /* v2367 — LE SCEAU D'ABORD : une session finalisée sans sceau laisse
           tous les écrans suivre le calcul vivant, et la promotion elle-même
           ne peut rien sans lui (elle compare AU sceau). Voir
           `flNuitRattraperSceau`. */
        var rs = window.flNuitRattraperSceau(K, now);
        if (rs.ok) out.sceauRattrape = true;
        var pr = window.flNuitPromouvoir(K, now);
        if (pr.ok) {
          out.agi = 'promotion'; out.raison = pr.raison;
          var rp = window.flNuitFinaliser(K, MESURE, now);
          out.resultat = rp; out.etat = rp.etat || 'FINALIZING';
          return out;
        }
        var ro = window.flNuitRouvrir(K, now);
        if (!ro.ok) return out;
        out.agi = 'reouverture'; out.raison = ro.raison;
        var rr = window.flNuitFinaliser(K, RENDORMI, now);
        out.resultat = rr; out.etat = rr.etat || 'FINALIZING';
        return out;
      }

      /* Une finalisation garée (la matière manquait au dernier passage) se
         reprend, quelle que soit la cause qui repasse : elle a déjà son
         verrou, elle ne peut pas se dédoubler. */
      if (e.etat === 'FINALIZING' || e.etat === 'AUTO_FINALIZING') {
        var r = window.flNuitFinaliser(K, e.cause || cause || AUTO, now);
        out.agi = 'reprise'; out.resultat = r; out.etat = r.etat || out.etat;
        return out;
      }
      if (e.etat === 'JOURNAL_IN_PROGRESS') return out;

      var d = window.flNuitAutoDecision(K, now);
      out.decision = d;
      if (!d.auto) return out;
      var ra = window.flNuitFinaliser(K, AUTO, now);
      out.agi = 'auto'; out.resultat = ra; out.etat = ra.etat || out.etat;
      return out;
    } catch (e2) { out.panne = e2.message; return out; }
  };

  /* ─────────────────────────────────────────────────────────────────────────
     ⑧ LA PORTE DE PUBLICATION — ce que les écrans ont le droit de montrer

     UNE SEULE FONCTION RÉPOND À « peut-on afficher un chiffre de ce matin ».
     `flAccueilData`, `flSommeilData` et `flRecupPublier` l'appellent tous les
     trois ; c'est ce qui interdit qu'un écran se replie sur la veille pendant
     qu'un autre attend. */
  window.flNuitPublicationOuverte = function (K) {
    K = K || tk(0);
    try {
      /* Un jour passé n'a pas de matin en cours : il se relit, il ne se
         retraite pas (doctrine v1463). */
      if (K !== tk(0)) return true;
      var rec = lire(K);
      /* ═══ PAS DE SESSION NE VEUT PLUS DIRE « RIEN NE CHANGE » — v2308 ═════
         La v2184 s'arrêtait ici, et c'est la ligne qui a montré à Dino la
         récupération de la veille à 07:49 le 10 septembre : à cette seconde-là
         le bracelet n'avait rien livré, aucune session n'existait, la porte
         restait donc ouverte et le repli sur la veille jouait — comme il est
         écrit qu'il doit jouer. Une nuit DUE ferme la porte aussi, et elle la
         ferme AVANT la mesure. Voir le pavé de `flNuitAttendue`. */
      if (!rec) {
        if (window.flNuitAttendue(K).due) return false;
        /* ═══ 12 sept. 2026, au soir — LA PORTE DOIT DIRE CE QUE SON LECTEUR SAIT

           L'ATTENTE QUI LAPSE EFFACE LA SESSION (`expectation lapsed`), et la
           nuit, elle, arrive quelques secondes ou une heure plus tard. Entre les
           deux, `lire(K)` rend `null` — donc cette porte rendait OUVERT — alors
           que le moteur A DÉJÀ une nuit pour ce jour et que personne ne l'a
           finalisée. `flNuitEtat`, dans le MÊME état, répond « DETECTED — nuit
           détectée, session pas encore frappée ». Deux lecteurs pour une question :
           la faute que ce fichier existe pour fermer.

           CE QUE ÇA A COÛTÉ, le 12 septembre à 10:03:11.356 — trois secondes
           après le lapse, avant qu'aucune passe n'ait refrappé la session : le
           cycle a publié ET SCELLÉ la récupération (23) sur la nuit ESTIMÉE que
           le moteur rendait à cette seconde — 185 min, 01:30 → 04:40, une
           fenêtre qui n'a jamais existé. Le sceau du jour était pris, et le
           remettre d'aplomb a consommé l'unique réouverture du cycle.

           LA RÈGLE, ET ELLE NE VAUT QUE LÀ : une nuit était DUE aujourd'hui,
           l'attente a lapsé (`nuitAttenteLapsee_`), et le moteur a une nuit —
           alors elle est à TRAITER, pas à publier. Sans marqueur (le cas de
           tous les jours, et de tous les bancs d'avant) rien ne change ; sans
           nuit non plus — une vraie nuit blanche rouvre la porte et rend les
           chiffres de la veille, c'est l'arbitrage de Dino du 10 septembre. */
        try {
          if (DB.get(CLE_LAPSE + K, null) && nuitDuBracelet(K)) return false;
        } catch (e) {}
        return true;
      }
      return rec.etat === 'FINALIZED';
    } catch (e) { return true; }
  };

  /* ─────────────────────────────────────────────────────────────────────────
     ⑨ LA FRONTIÈRE DU JOUR — « cette journée est-elle constituée ? »

     La porte ⑧ répond « a-t-on le droit d'afficher un chiffre de CE MATIN ».
     Celle-ci répond à l'autre moitié, et elle a coûté le 16 septembre :
     « la journée d'aujourd'hui a-t-elle une frontière ». Elle vit ICI parce
     que c'est le même métier — ce que les écrans ont le droit de montrer au
     réveil — et parce que `index.html` a un cliquet de lignes. */
  /* ═══ 16 sept. 2026 — LA JOURNEE D AUJOURD HUI A-T-ELLE UNE FRONTIERE ? ══════

     LA QUESTION EXISTE PARCE QUE TROIS MAGASINS DECRIVENT LA MEME NUIT et ne se
     remplissent pas a la meme seconde :
       · `nuitSess_<jour>`       — la SESSION, que lit la porte de publication ;
       · `sensor_<jour>`         — le CAPTEUR, que lit `sleepNight`, donc la tuile ;
       · `watch_<jour>.sommeils` — le REGISTRE, que lit `flJourLogique`.
     Une journee FLINT va d un sommeil au suivant : c est le REGISTRE qui pose sa
     frontiere. Tant qu il n a pas la nuit, la journee est celle ouverte la
     veille — DEUX cles civiles — et tout ce qui se somme sur ces cles (effort,
     calories, minutes par zone) porte deux jours. Pendant ce temps la session
     peut deja etre FINALIZED : la porte s ouvre, le score sort, les sommes
     mentent.

     CE QUE CA A DONNE, le 16 septembre au matin, en une seule image :
     Recuperation 85 et Sommeil 7h48 — ceux du matin — a cote d un effort de
     12,9/20 et de 3 364 kcal, qui etaient ceux d hier ajoutes a ceux du matin
     (2 800 + 563). Dino : « il ne doit pas exister de troisieme etat ».

     ELLE NE MORD QUE SUR UN DESACCORD, JAMAIS SUR UNE ABSENCE. Quand aucune nuit
     n existe pour aujourd hui — la nuit blanche du 14 aout, 00 h 21, « AOUT 13 A
     AUJOURD HUI » — l ancre reste hier A BON DROIT et cette porte repond « non ».

     UNE SEULE PORTE, ET C EST LE SUJET. `flAccueilData` et `flEffortData`
     affichent LE MEME effort, et `flEffortData` le dit depuis toujours : « deux
     ecrans qui liraient deux fenetres differentes finiraient par afficher deux
     nombres, et c est exactement ce que la source unique existe pour empecher ».
     Deux tests ecrits chacun de son cote finiraient par diverger ; il y en a un.
     Epinglee par `tests/test-accueil-coherent.js` et `tests/garde-journee-coherente.js`. */
  window.flJourneeEnTraitement=function(K){try{
   K=K||tk(0);
   if(K!==tk(0))return false;            /* un jour passe n a pas de matin en cours */
   var ouverte=true;
   try{if(typeof flNuitPublicationOuverte==='function')ouverte=flNuitPublicationOuverte(K);}catch(e){}
   if(!ouverte)return true;              /* la nuit est due, detectee ou en cours : rien n est constitue */
   var n=null; try{if(typeof sleepNight==='function')n=sleepNight(K);}catch(e){}
   if(!n)return false;                   /* aucune nuit aujourd hui : la journee d hier continue */
   var J=null; try{if(typeof flJourLogique==='function')J=flJourLogique();}catch(e){}
   if(!(J&&J.cleAncre&&J.cleAncre!==K))return false;
   /* LE DESACCORD S ECRIT AU JOURNAL, UNE FOIS PAR JOUR. Il doit etre BREF — la
      charge qui finalise range aussi la nuit au registre, et la suivante retombe
      d aplomb. S il durait, l ecran resterait sur son carton « traitement en
      cours » sans que personne sache pourquoi, et une panne muette est ce que
      cette maison refuse. Une seule ligne : ce chemin part a chaque poussee
      douce, et le journal du telephone est deja le premier poste de depense. */
   try{ if(DB.get('flFrontiereDite',null)!==K){ DB.set('flFrontiereDite',K);
    var _fm='accueil ⚠ la nuit du '+K+' est servie mais la journee est encore '
           +'ancree au '+J.cleAncre+' — effort et calories retenus';
    try{console.log('[flint] '+_fm);}catch(e){}
    var _fn=window.webkit&&window.webkit.messageHandlers&&window.webkit.messageHandlers.flint;
    if(_fn)_fn.postMessage({cmd:'journal',texte:_fm});
   } }catch(e){}
   return true;
  }catch(e){return false;}};

  /* ═══════════════════════════════════════════════════════════════════════════
     UNE ESTIMATION NE TIENT PAS DEVANT UNE MESURE — v2210

     LE CAS, CELUI DU 4 SEPTEMBRE, ET IL EST ARRIVÉ APRÈS COUP. La nuit a été
     scellée à 08 h 11 sur l'ESTIMATION déduite de la fréquence cardiaque —
     00:05 → 08:10, 440 min — parce que le bracelet, bâillonné par
     l'interrupteur « montre nue », n'avait rien livré. À 08 h 43, l'interrupteur
     éteint, il a rendu SA nuit, gardée dans sa mémoire : 00:58 → 07:51,
     361 min, avec son hypnogramme, ses intervalles et sa SpO2.

     Quatre-vingts minutes d'écart, et l'app continuait d'afficher l'estimation.
     Pour toujours : la session était FINALIZED et son unique réouverture avait
     déjà été consommée par le faux rendormissement du matin.

     CE N'EST PAS LE MÊME ÉVÉNEMENT QU'UN RENDORMISSEMENT, et c'est pour ça que
     le mécanisme d'à côté ne pouvait pas s'en charger. Là-bas, la nuit a
     CHANGÉ ; ici, elle n'a jamais bougé — c'est notre CONNAISSANCE d'elle qui
     est passée du calcul d'appoint à la mesure. Le sceau existe pour empêcher
     un nombre de changer tout seul, jamais pour préférer une déduction à un
     fait.

     LA RÈGLE, ET ELLE EST ÉTROITE : le bracelet a livré SON sommeil principal
     (`mainSleep`, source `ble` — pas une saisie, pas une graine), et la nuit
     scellée s'en écarte de plus des cinq minutes de bruit de la maison. Alors
     on rescelle sur la mesure.

     ⚠️ UNE FOIS PAR JOUR, et sous son PROPRE compteur (`nuitPromu_`). Il ne
     partage pas celui du rendormissement : les deux événements sont
     indépendants, et faire payer l'un pour l'autre laisserait exactement le
     trou du 4 septembre. */
  var CLE_PROMU = 'nuitPromu_';

  /* Le sommeil principal MESURÉ PAR LE BRACELET, s'il est arrivé. `source` est
     le champ que pose le pont V8 ; une nuit saisie à la main ou semée par
     l'atelier ne le porte pas, et elle n'a rien à promouvoir. */
  function mesureBracelet(K) {
    try {
      var w = (typeof window.watchOf === 'function') ? window.watchOf(K) : null;
      var L = (w && Array.isArray(w.sommeils)) ? w.sommeils : [];
      for (var i = 0; i < L.length; i++) {
        var s = L[i];
        if (!s || s.type !== 'mainSleep') continue;
        if (s.source !== 'ble') continue;
        return s;
      }
    } catch (e) {}
    return null;
  }

  window.flNuitMesureArrivee = function (K) {
    K = K || tk(0);
    var out = { promouvoir: false, raison: null };
    try {
      var f = DB.get(CLE_NUIT + K, null);
      if (!f || f.asleep == null) { out.raison = 'aucune nuit scellée'; return out; }
      if (f.src === 'ble') { out.raison = 'la nuit scellée vient déjà de la mesure'; return out; }
      var m = mesureBracelet(K);
      if (!m) { out.raison = 'le bracelet n\'a toujours pas livré sa nuit'; return out; }
      var n = null;
      try { n = (typeof sleepNight === 'function') ? sleepNight(K) : null; } catch (e) {}
      if (!n || n.asleep == null) { out.raison = 'le moteur ne rend plus cette nuit'; return out; }
      /* On compare au SCEAU, pas à la dernière lecture : c'est l'écart que
         l'utilisateur a sous les yeux. Le même seuil que partout ici. */
      var d = Math.abs((+f.asleep || 0) - (+n.asleep || 0));
      if (d <= SEUIL_RENDORMI_MIN) {
        out.raison = 'la mesure confirme l\'affichage (' + d + ' min d\'écart)';
        return out;
      }
      out.promouvoir = true;
      out.ecart = d;
      out.raison = 'le bracelet a livré sa nuit : ' + f.asleep + ' → ' + n.asleep
                 + ' min (' + d + ' min d\'écart) — une estimation ne tient pas '
                 + 'devant une mesure';
      return out;
    } catch (e) { out.raison = 'promotion : ' + e.message; return out; }
  };

  window.flNuitPromouvoir = function (K, maintenant) {
    K = K || tk(0);
    var now = maintenant || Date.now();
    var res = { ok: false, raison: null };
    try {
      var rec = lire(K);
      if (!rec || rec.etat !== 'FINALIZED') { res.raison = 'rien à promouvoir'; return res; }
      var p = window.flNuitMesureArrivee(K);
      if (!p.promouvoir) { res.raison = p.raison; return res; }
      var deja = +DB.get(CLE_PROMU + K, 0) || 0;
      if (deja >= 1) {
        res.raison = 'la nuit a déjà été rescellée sur la mesure';
        return res;
      }
      try { DB.set(CLE_PROMU + K, deja + 1); } catch (e) {}
      /* Le score de récupération se recalcule AVEC la nuit : il portait sur une
         nuit qui n'a pas eu lieu. On lève donc aussi son sceau — c'est le seul
         endroit de la maison qui en ait le droit, et il ne l'a que parce que la
         nuit dessous a changé de nature. */
      try { DB.set('recovFige_' + K, null); } catch (e) {}
      try { DB.set('recovReouv_' + K, 0); } catch (e) {}
      rec.etat = 'FINALIZING';
      rec.cause = MESURE;
      rec.tFinal0 = now;
      rec.tFinal = null;
      rec.raison = p.raison;
      ecrire(K, rec);
      tracer(rec.id, 'measured night promoted', MESURE, rec.etat, p.raison);
      res.ok = true; res.raison = p.raison;
      return res;
    } catch (e) { res.raison = 'promotion : ' + e.message; return res; }
  };

  /* ═══ ET SI JE ME RENDORS APRÈS AVOIR TRAITÉ ? ════════════════════════════

     Dino, le 3 septembre : « si je clique sur Traiter et qu'en fait je me
     rendors après, il faut bien que ça reprenne le sommeil. »

     IL MET LE DOIGT SUR LE TROU DE CETTE REFONTE, et c'est le point où deux
     règles justes se contredisent :

       · un clic sur « Traiter » vaut déclaration — c'est ce qui autorise à
         sceller en `grace` (doctrine de TRAITER, v1236) ;
       · et la fenêtre de grâce existe PRÉCISÉMENT parce qu'un rendormissement
         peut encore recoller la nuit, jusqu'à `reveilCoupeNuit` (4 h).

     Traiter à 07 h puis se rendormir de 07 h 30 à 09 h, c'est perdre une heure
     et demie de sommeil derrière un sceau. Inacceptable : le sceau est là pour
     empêcher un nombre de CHANGER TOUT SEUL, pas pour empêcher une nuit
     d'exister.

     LA DISTINCTION EST CELLE QUE LA MAISON FAIT DÉJÀ (`motifReouverture`,
     v2037) : on refuse le BRUIT — une VFC qui gagne une minute, un re-staging
     de ±3 min, un journal rempli après coup — et on accepte le FAIT : la nuit
     elle-même a changé. Un rendormissement recollé n'est pas une dérive de
     capteur, c'est une autre nuit.

     ON COMPARE À L'INSTANTANÉ SCELLÉ, pas à la dernière lecture : `nuitFige_`
     porte exactement ce qui a été publié, donc l'écart mesuré est celui que
     l'utilisateur a sous les yeux. Le seuil est celui de la maison
     (`SEUIL_NUIT_MIN`, 5 min) — cinq minutes de sommeil déplacent le score de
     moins d'un point, et rouvrir pour ça consommerait l'unique réouverture
     pour du bruit.

     ⚠️ UNE SEULE FOIS. `nuitReouv_<K>` compte. Une nuit qui se rouvre deux fois
     n'est plus une nuit qui se recolle, c'est une oscillation — et l'écran
     retomberait dans « plusieurs versions successives », l'interdit n° 1. */
  var SEUIL_RENDORMI_MIN = 5;

  window.flNuitRendormissement = function (K) {
    K = K || tk(0);
    var out = { rendormi: false, raison: null };
    try {
      var f = DB.get(CLE_NUIT + K, null);
      if (!f || f.asleep == null) { out.raison = 'aucune nuit scellée'; return out; }
      var n = null;
      try { n = (typeof sleepNight === 'function') ? sleepNight(K) : null; } catch (e) {}
      if (!n || n.asleep == null) { out.raison = 'le moteur ne rend plus cette nuit'; return out; }
      function ecart(a, b) { return Math.abs((+a || 0) - (+b || 0)); }
      function ecartMinute(a, b) {
        if (a == null || b == null) return ecart(a, b);
        var d0 = Math.abs((+a || 0) - (+b || 0));
        return Math.min(d0, 1440 - d0);
      }
      var d = Math.max(ecart(f.asleep, n.asleep),
                       ecartMinute(f.bedMin, n.bedMin),
                       ecartMinute(f.wakeMin, n.wakeMin));
      if (d <= SEUIL_RENDORMI_MIN) {
        out.raison = 'la nuit n\'a pas bougé (' + d + ' min d\'écart, on en tolère '
                   + SEUIL_RENDORMI_MIN + ')';
        return out;
      }
      out.rendormi = true;
      out.avant = { asleep: f.asleep, bedMin: f.bedMin, wakeMin: f.wakeMin };
      out.apres = { asleep: n.asleep, bedMin: n.bedMin, wakeMin: n.wakeMin };
      out.raison = 'la nuit s\'est recollée : ' + f.asleep + ' → ' + n.asleep + ' min ('
                 + f.bedMin + '→' + n.bedMin + ' / ' + f.wakeMin + '→' + n.wakeMin + ')';
      return out;
    } catch (e) { out.raison = 'rendormissement : ' + e.message; return out; }
  };

  /* La réouverture elle-même : elle remet la session en traitement, ce qui
     referme la porte de publication — l'écran repasse donc par l'état de
     traitement, une fois, et rien ne clignote entre les deux. */
  /* ═══ 12 sept. 2026 — UNE SESSION FINALISÉE SANS SCEAU N'EST PAS FINIE ═══

     LE SCEAU EST TOUT CE QUI TIENT LE NOMBRE. `flNuitServir` le ressert à
     chaque lecture ; sans lui, la tuile Sommeil, l'écran Ma nuit et la fiche
     suivent `sleepNight()`, c'est-à-dire le calcul VIVANT, qui se refait à
     chaque tranche que la montre livre. Le 12 septembre à 10 h 28, Dino a vu
     4h05 puis 3h13 dans la même minute, sur le même écran, pour la même nuit.

     OR UNE SESSION PEUT NAÎTRE FINALIZED SANS Être PASSÉE PAR LA FINALISATION :
     c'est la migration, juste au-dessus. Et une fois FINALIZED, plus rien ne
     scelle — `flNuitFinaliser` rend « nuit déjà finalisée » à son verrou, et
     `flNuitMesureArrivee` refuse de promouvoir faute de sceau à comparer. L'état
     est un cul-de-sac : il dure toute la journée, et le nombre bouge tout du
     long.

     ON NE ROUVRE PAS LA SESSION — la migration a peut-être raison, et rouvrir
     ferait disparaître des chiffres qu'on affiche déjà (l'interdit de Dino :
     « une nuit provisoire affichée puis remplacée »). ON SCELLE, ce qui est le
     seul geste qui manquait, ET SEULEMENT QUAND LA NUIT NE BOUGE PLUS : le
     cycle sait le dire (`finale`, `grace`), et sceller en pleine collecte
     figerait un chiffre intermédiaire — exactement le défaut qu'on ferme.

     Le sceau porte `rattrape: true` : une nuit scellée ici ne l'a pas été par
     une finalisation, et le journal doit pouvoir le dire des mois après. `src`
     se calcule comme partout ailleurs, donc une nuit déduite de la fréquence
     cardiaque garde sa promotion quand le bracelet livre enfin. */
  window.flNuitRattraperSceau = function (K, maintenant) {
    K = K || tk(0);
    var now = maintenant || Date.now();
    var res = { ok: false, raison: null };
    try {
      var rec = lire(K);
      if (!rec || rec.etat !== 'FINALIZED') { res.raison = 'la session n\'est pas finalisée'; return res; }
      var f = DB.get(CLE_NUIT + K, null);
      if (f && f.asleep != null) { res.raison = 'la nuit est déjà scellée'; return res; }
      /* DEUX FAÇONS DE SAVOIR QUE LE CHIFFRE PEUT ÊTRE FIGÉ, et il en faut
         deux. La première est celle du cycle : la nuit ne bouge plus. La
         seconde existe parce que la première peut ne JAMAIS arriver — le
         12 septembre, la nuit de Dino oscillait encore entre deux fenêtres
         à midi (05:30→10:05, 245 min / 05:51→10:04, 193 min), donc
         signature changée, donc `collecte` à chaque passage. Une session qui
         se dit FINALIZED depuis plus de vingt minutes sans avoir rien scellé
         ne scellera jamais toute seule : entre un chiffre figé et un chiffre
         qui saute sous les yeux, Dino a tranché — et le stylo reste là pour
         corriger (`flNuitResceller`). */
      var cyc = cycleDe(K);
      var pose = !!(cyc && (cyc.etat === 'finale' || cyc.etat === 'grace'));
      var vieille = !!(rec.tFinal && (now - rec.tFinal) >= MIGRATION_VIEILLE_MS);
      if (!pose && !vieille) {
        res.raison = 'la nuit bouge encore (' + (cyc ? cyc.etat : 'cycle absent') + ')';
        return res;
      }
      var n = null;
      try { n = (typeof sleepNight === 'function') ? sleepNight(K) : null; } catch (e) {}
      if (!n || n.asleep == null) { res.raison = 'le moteur de sommeil ne rend pas cette nuit'; return res; }
      var fige = { asleep: n.asleep, awake: (n.awake != null ? n.awake : null),
                   bedMin: (n.bedMin != null ? n.bedMin : null),
                   wakeMin: (n.wakeMin != null ? n.wakeMin : null),
                   efficiency: (n.efficiency != null ? n.efficiency : null),
                   src: (mesureBracelet(K) ? 'ble' : 'estimation'),
                   ts: new Date(now).toISOString(), gen: SESSION_GEN, id: rec.id,
                   rattrape: true };
      if (!DB.set(CLE_NUIT + K, fige)) { res.raison = 'écriture du sceau refusée'; return res; }
      /* Le score de sommeil suit le même sort : sans lui, l'autre nombre de la
         nuit se recalcule aussi à chaque lecture. Même fonction, même case et
         même forme que dans la finalisation — jamais un second calcul. */
      try {
        if (DB.get(CLE_SCORE + K, null) == null && typeof window.flScoreSommeil === 'function') {
          var sc = window.flScoreSommeil(K, fige.asleep, fige.awake);
          if (sc && sc.score != null)
            DB.set(CLE_SCORE + K, { s: sc.score, ts: fige.ts, gen: SESSION_GEN, id: rec.id });
        }
      } catch (e) {}
      tracer(rec.id, 'seal caught up', rec.cause || null, rec.etat,
             'coucher ' + fige.bedMin + ' → réveil ' + fige.wakeMin + ', ' + fige.asleep
             + ' min — finalisée sans sceau, chaque écran suivait le calcul vivant'
             + (pose ? '' : ' (nuit encore mouvante, session finalisée depuis '
                            + Math.round((now - rec.tFinal) / 60000) + ' min)'));
      /* 12 septembre 2026 — LE SCORE SUIT LE SCEAU RATTRAPÉ, comme il suit la
         finalisation (étape 5 de `flNuitFinaliser`). Sur le téléphone de Dino,
         `recovFige_2026-9-12` porte 23, calculé à 10:03:11 sur une nuit de
         185 min (01:30 → 04:40) qui n'est ni la mesurée ni l'estimée ; le sceau
         rattrapé dit 193 min, 05:51 → 10:04. Sans cet appel, `flRecupPublier`
         relit un score verrouillé (« nuit finalisée — le score se relit ») et
         ne compare jamais l'instantané scellé à la nuit scellée. Le troisième
         argument lève ce verrou ; derrière, c'est l'unique réouverture
         contrôlée du cycle qui décide (motif « la nuit a changé »), et elle
         refuse la seconde. Rien d'autre n'est ajouté : un chemin existant, un
         appelant de plus. */
      var r = null;
      try {
        if (typeof window.flRecupPublier === 'function')
          r = window.flRecupPublier(K, 'rattrapage', true);
      } catch (e) { r = null; }
      if (r && r.publie) {
        tracer(rec.id, 'recovery re-judged after seal', rec.cause || null, rec.etat,
               (r.raison || '') + (r.s != null ? ' → ' + r.s : ''));
      }
      res.ok = true; res.fige = fige; res.recup = r;
      return res;
    } catch (e) { res.raison = 'rattrapage du sceau : ' + e.message; return res; }
  };

  window.flNuitRouvrir = function (K, maintenant) {
    K = K || tk(0);
    var now = maintenant || Date.now();
    var res = { ok: false, raison: null };
    try {
      var rec = lire(K);
      if (!rec || rec.etat !== 'FINALIZED') { res.raison = 'rien à rouvrir'; return res; }
      var r = window.flNuitRendormissement(K);
      if (!r.rendormi) { res.raison = r.raison; return res; }
      var deja = +DB.get('nuitReouv_' + K, 0) || 0;
      if (deja >= 1) {
        res.raison = 'une réouverture a déjà eu lieu — la seconde est refusée';
        tracer(rec.id, 'reopen refused', RENDORMI, rec.etat, res.raison);
        return res;
      }
      try { DB.set('nuitReouv_' + K, deja + 1); } catch (e) {}
      rec.etat = 'FINALIZING';
      rec.cause = RENDORMI;
      rec.tFinal0 = now;
      rec.tFinal = null;
      rec.raison = r.raison;
      ecrire(K, rec);
      tracer(rec.id, 'sleep reopened', RENDORMI, rec.etat, r.raison);
      res.ok = true; res.raison = r.raison;
      return res;
    } catch (e) { res.raison = 'réouverture : ' + e.message; return res; }
  };

  /* LA NUIT EST-ELLE VERROUILLÉE ? — c'est-à-dire : finalisée, donc close.
     `flNuitPublicationOuverte` dit « a-t-on le droit d'AFFICHER » ; celle-ci
     dit « a-t-on encore le droit de RECALCULER ». Les deux sont vraies après
     la finalisation, et c'est voulu : ce qui s'affiche se relit, il ne se
     rejuge plus.

     C'EST CE QUI FERME LA DERNIÈRE PORTE. `flRecupPublier` gardait une
     réouverture unique après le sceau (« le journal de bord a été renseigné »),
     et elle était juste tant que le journal arrivait APRÈS le score. Dans le
     nouvel ordre il arrive AVANT — la réouverture ne servirait donc plus qu'à
     faire changer un nombre déjà lu, ce que Dino refuse explicitement. Un
     journal rempli après coup est gardé, il pèse sur la nuit SUIVANTE. */
  window.flNuitVerrouillee = function (K) {
    K = K || tk(0);
    try {
      if (K !== tk(0)) return false;      /* les jours passés ont leur propre doctrine (v1463) */
      var rec = lire(K);
      return !!(rec && rec.etat === 'FINALIZED');
    } catch (e) { return false; }
  };

  /* Pour l'atelier et les bancs : désarmer la minuterie de reprise sans
     toucher à rien d'autre. Elle ne se réarme que sur un garage suivant —
     c'est tout l'objet de la règle « une minuterie de reprise ne se repousse
     pas », et un banc qui enchaîne plusieurs matinées doit pouvoir repartir. */
  window.flNuitOublierReprise = function () {
    try { if (repriseT) clearTimeout(repriseT); } catch (e) {}
    repriseT = null;
    return true;
  };

  /* Pour l'atelier et les bancs : oublier UNE session sans toucher aux
     mesures. Elle se refrappera à la prochaine détection. */
  window.flNuitOublier = function (K) {
    K = K || tk(0);
    try { DB.set(CLE + K, null); } catch (e) {}
    try { DB.set(CLE_NUIT + K, null); } catch (e) {}
    try { DB.set(CLE_SCORE + K, null); } catch (e) {}
    try { DB.set(CLE_REVEIL + K, null); } catch (e) {}
    try { DB.set(CLE_LIVRE + K, null); } catch (e) {}
    try { DB.set('nuitReouv_' + K, 0); } catch (e) {}
    return true;
  };

  /* ═══ v2268 — LE SCEAU DU 8 SEPTEMBRE, RETIRÉ ═════════════════════════════

     CE QUI S'EST PASSÉ, relevé sur la base de Félix (releves/, 8 sept.).
     Il s'est réveillé à 05h31, est resté éveillé dix minutes, s'est rendormi
     jusqu'à 08h05. À 09h36 la session a scellé la nuit sur ce qu'elle savait
     alors : `nuitFige_` = 288 min, réveil 05h31, cause RENDORMISSEMENT. Le
     bracelet a continué de livrer toute la matinée (le badge « arrive encore »
     était là à 16h30), le moteur a recollé la nuit ENTIÈRE — 00h19 → 08h05,
     409 min de sommeil, 57 d'éveil, 51 tranches, tout est juste — et le sceau
     n'a jamais été réécrit.

     L'ÉCRAN MONTRAIT DONC DEUX NUITS À LA FOIS : l'en-tête et la courbe
     venaient du sceau (4h48, fin à 05h31), les barres de stades du moteur
     (1h39 + 3h18 + 1h52). Les parts se calculant sur le total du sceau, elles
     additionnaient 150 %. Un écran qui affiche 150 % ne se discute pas.

     POURQUOI LA RÉPARATION AUTOMATIQUE N'A PAS JOUÉ. Elle existe et elle a
     raison : rejouée sur ces données, `flNuitMesureArrivee` dit « le bracelet
     a livré sa nuit : 288 → 409 min (121 min d'écart) » et `flNuitPromouvoir`
     accepte. C'est la FINALISATION qui cale derrière, et le sceau reste. La
     cause de ce blocage reste ouverte : elle se mesurera sur le téléphone, pas
     ici, et ce bloc ne prétend pas la corriger.

     CE QU'IL FAIT, ET RIEN DE PLUS : il oublie CETTE session-là, par
     `flNuitOublier`, la fonction que ce fichier expose déjà pour ça — elle ne
     touche à AUCUNE mesure, elle retire le sceau, le score scellé et le
     réveil déclaré, et la machine se refrappe à la détection suivante sur la
     nuit complète.

     TROIS GARDES, parce qu'un correctif daté qui se trompe est pire que le
     défaut. ① une seule date, écrite en clair ; ② il ne part QUE si le moteur
     rend une nuit PLUS LONGUE que le sceau d'au moins une demi-heure — on ne
     répare qu'une amputation, jamais l'inverse, la règle de la porte du matin
     vaut ici aussi ; ③ il se désarme sur son propre drapeau, et se retient de
     se désarmer tant que le moteur n'a rien à dire, pour ne pas brûler sa
     chance avant que la nuit soit posée. */
  /* ⚠ IL NE S'EXÉCUTE PAS AU CHARGEMENT, et c'est la leçon de marche.js puis
     de flint-recup-cycle.js : les `<script src="flint-*.js">` d'index.html sont
     à la ligne 2896, `const DB` à la 2935 et `const tk` à la 3010. Un accès à
     `DB` pendant l'analyse de ce fichier lèverait (zone morte temporelle), le
     `try` avalerait, et le correctif ne partirait JAMAIS sans que rien ne le
     dise. Il est donc appelé depuis la passe, qui ne tourne qu'au geste. */
  var sceau8SeptFait = false;
  function retirerLeSceauDu8Septembre() {
    if (sceau8SeptFait) return;
    try {
      if (+DB.get('flSceauRetire8Sept', 0) === 1) return;
      var K = '2026-9-8';
      var f = DB.get(CLE_NUIT + K, null);
      if (!f || f.asleep == null) { DB.set('flSceauRetire8Sept', 1); sceau8SeptFait = true; return; }
      var w = null;
      try { w = (typeof window.watchOf === 'function') ? window.watchOf(K) : null; } catch (e) {}
      var n = w && w.night;
      if (!n || n.sleepMin == null) return;      /* rien à comparer : on réessaiera */
      if ((+n.sleepMin || 0) - (+f.asleep || 0) < 30) { DB.set('flSceauRetire8Sept', 1); sceau8SeptFait = true; return; }
      window.flNuitOublier(K);
      DB.set('flSceauRetire8Sept', 1);
      sceau8SeptFait = true;
      tracer(f.id || null, 'seal dropped', 'CORRECTIF', 'FINALIZED',
             'sceau du ' + K + ' retiré : ' + f.asleep + ' min scellés contre '
             + n.sleepMin + ' rendus par le moteur');
    } catch (e) {}
  }

  /* La nuit figée, pour les écrans qui veulent la nuit TELLE QU'ELLE A ÉTÉ
     PUBLIÉE plutôt que telle que le moteur la recalcule. Rend `null` tant que
     rien n'est scellé — jamais un à-peu-près. */
  window.flNuitFigee = function (K) {
    K = K || tk(0);
    try { return DB.get(CLE_NUIT + K, null); } catch (e) { return null; }
  };
  /* ═══ LA NUIT SERVIE EST LA NUIT SCELLÉE — v2184b ═════════════════════════

     LE DÉFAUT, ET IL EST DE FOND. `flNuitFinaliser` scelle la nuit dans
     `nuitFige_` … et PERSONNE ne la lisait. Les écrans continuaient d'appeler
     `sleepNight(K)`, c'est-à-dire le calcul VIVANT.

     Conséquence, et elle est certaine, pas hypothétique : la montre relivre ses
     tranches à chaque synchro et le re-staging déplace les bornes de deux à
     trois minutes (mesuré le 30 août). Après la finalisation, la tuile et
     l'écran Sommeil auraient donc affiché 7 h 34 pendant que le score de
     récupération restait scellé sur 7 h 32. Deux lecteurs pour une même
     question — la faute que cette maison connaît par cœur, et que tout ce
     chantier prétend fermer. Il m'a suffi de sceller sans servir.

     ON N'ÉCRASE QUE LES CINQ CHAMPS SCELLÉS, et c'est délibéré : les stades, la
     courbe, les réveils viennent de la même nuit et n'entrent pas dans le
     sceau. Un rendormissement VRAI, lui, ne se règle pas ici — il rouvre la
     session (`flNuitRendormissement`), qui re-scelle. Ce qui reste ici est
     donc, par construction, le bruit sous le seuil des cinq minutes.

     ⚠️ SANS SCEAU, ON NE TOUCHE À RIEN. La fonction rend l'objet tel quel :
     un jour passé, une nuit saisie, un web ancien gardent exactement le
     comportement d'avant. */
  window.flNuitServir = function (K, n) {
    try {
      if (!n) return n;
      var f = DB.get(CLE_NUIT + (K || tk(0)), null);
      if (!f || f.asleep == null) return n;
      if (f.asleep != null) n.asleep = f.asleep;
      if (f.awake != null) n.awake = f.awake;
      if (f.bedMin != null) n.bedMin = f.bedMin;
      if (f.wakeMin != null) n.wakeMin = f.wakeMin;
      if (f.efficiency != null) n.efficiency = f.efficiency;
      n._scelle = true;
      return n;
    } catch (e) { return n; }
  };

  /* ═══ 7 septembre 2026 — RESCELLER APRÈS UNE SAISIE À LA MAIN ═══════════
     Dino corrige coucher et réveil au stylo ; `flSommeilManuel` écrit la
     fenêtre et relance le re-stadage, mais l'écran relit le SCEAU
     (`flNuitServir` ressert `nuitFige_<K>` à chaque lecture) : sans cette
     porte, la correction était invisible par construction, dès que la nuit
     était FINALIZED. On ne rouvre pas la session, on ne change ni son id ni
     sa génération : on réécrit le sceau depuis ce que le moteur rend
     MAINTENANT, et le score avec lui, en signant la cause. Sans sceau, rien
     à faire — la nuit se lit directement au moteur. */
  window.flNuitResceller = function (K, cause) {
    K = K || tk(0);
    var res = { ok: false, raison: null };
    try {
      var f = DB.get(CLE_NUIT + K, null);
      if (!f || f.asleep == null) { res.raison = 'rien de scellé pour ' + K; return res; }
      var n = null;
      try { n = (typeof sleepNight === 'function') ? sleepNight(K) : null; } catch (e) {}
      if (!n || n.asleep == null) { res.raison = 'le moteur de sommeil ne rend pas cette nuit'; return res; }
      var fige = { asleep: n.asleep, awake: (n.awake != null ? n.awake : null),
                   bedMin: (n.bedMin != null ? n.bedMin : null),
                   wakeMin: (n.wakeMin != null ? n.wakeMin : null),
                   efficiency: (n.efficiency != null ? n.efficiency : null),
                   src: cause || 'manuel', rescelle: cause || 'manuel',
                   ts: new Date().toISOString(), gen: f.gen, id: f.id };
      try { DB.set(CLE_NUIT + K, fige); } catch (e) { res.raison = 'écriture du sceau : ' + e.message; return res; }
      var sc = null;
      try {
        if (typeof window.flScoreSommeil === 'function')
          sc = window.flScoreSommeil(K, fige.asleep, fige.awake);
      } catch (e) {}
      if (sc && sc.score != null) {
        try { DB.set(CLE_SCORE + K, { s: sc.score, ts: fige.ts, gen: f.gen, id: f.id }); } catch (e) {}
      }
      res.ok = true;
      res.avant = { asleep: f.asleep, bedMin: f.bedMin, wakeMin: f.wakeMin };
      res.apres = { asleep: fige.asleep, bedMin: fige.bedMin, wakeMin: fige.wakeMin, score: sc && sc.score };
      return res;
    } catch (e) { res.raison = 'resceller : ' + e.message; return res; }
  };

  window.flNuitScoreFige = function (K) {
    K = K || tk(0);
    try { var s = DB.get(CLE_SCORE + K, null); return (s && s.s != null) ? s.s : null; }
    catch (e) { return null; }
  };

  /* ═══════════════════════════════════════════════════════════════════════
     LE DIAGNOSTIC DE LA NUIT — 7 septembre 2026

     Dino, ce matin-là : « je veux savoir exactement quelle condition déclenche
     "pas de variabilité" ». La condition, elle, tient en une ligne
     (`sleepMin != null && hrv == null`) et elle est JUSTE ; ce qui manquait
     est tout le reste — combien de battements, combien d'intervalles, sur
     quelle fenêtre, et pourquoi la récupération n'a rien rendu.

     Cette fonction ne calcule RIEN et ne corrige RIEN : elle relit ce qui est
     en base et le met en forme. C'est un témoin, et un témoin qui juge est un
     témoin qu'on ne croit plus. Le natif l'appelle au moment du sceau et
     l'écrit au journal (voir `PontJournalMatin.ecrireDiagnosticNuit`).

     ⚠️ ELLE LIT LES MÊMES SOURCES QUE LES ÉCRANS, jamais des sources à elle :
     `sensorOf` pour ce que le moteur a retenu de la nuit, `watch_<K>` pour ce
     que le bracelet a livré. Deux lecteurs pour une question, c'est la faute
     que cette maison connaît par cœur. */
  window.flNuitDiagnostic = function (K) {
    K = K || tk(0);
    var out = { K: K };
    function n(x) { return (x == null || isNaN(x)) ? null : x; }
    try {
      var f = DB.get(CLE_NUIT + K, null);
      var s = (typeof sensorOf === 'function') ? sensorOf(K) : null;
      var w = null;
      try { w = DB.get('watch_' + K, null); } catch (e) {}

      /* La fenêtre RETENUE, celle qui a servi — pas une date civile. C'est le
         piège que Dino nomme : « le traitement du 7 qui cherche les données du
         7 alors que la majorité du sommeil est le 6 ». Ici, bedMin/wakeMin sont
         des minutes depuis minuit du jour de RÉVEIL, et le sommeil du bracelet
         porte ses epochs : on rend les deux, elles doivent concorder. */
      out.debut     = (f && f.bedMin  != null) ? f.bedMin  : (s ? n(s.bedMin)  : null);
      out.fin       = (f && f.wakeMin != null) ? f.wakeMin : (s ? n(s.wakeMin) : null);
      out.dormiMin  = (f && f.asleep  != null) ? f.asleep  : (s ? n(s.sleepMin) : null);
      out.src       = (f && f.src) || (s && s.src) || null;
      var som = (w && w.sommeils && w.sommeils.length) ? w.sommeils[0] : null;
      out.fenetreBracelet = som ? (som.debut + '→' + som.fin + ' (' + som.source + ')') : null;

      /* Ce que le moteur a VU. `hr` est la série minute du jour, `rrH` les
         rafales d'intervalles, `hrvMontre` les fenêtres de la puce. */
      out.hr  = (w && w.hr)  ? w.hr.length  : 0;
      var rr = (w && w.rrH) ? w.rrH : [];
      out.hrvFenetres = (w && w.hrvMontre) ? w.hrvMontre.length : 0;
      var totalRR = 0, valides = 0;
      for (var i = 0; i < rr.length; i++) {
        var lot = rr[i] && rr[i][1];
        if (!lot || !lot.length) continue;
        for (var j = 0; j < lot.length; j++) {
          totalRR++;
          /* Le même crible que le calcul : un intervalle nul ou hors bornes
             physiologiques ne compte pas. On ne l'invente pas ici — on le
             recompte, pour que le nombre affiché soit celui qui a servi. */
          if (lot[j] >= 300 && lot[j] <= 2000) valides++;
        }
      }
      out.rr = totalRR;
      out.rrValides = valides;
      out.rmssd = s ? n(s.hrv) : null;
      out.rhr   = s ? n(s.rhr) : null;
      out.resp  = s ? n(s.resp) : null;
      out.spo2  = s ? n(s.spo2Bas) : null;
      out.temp  = s ? n(s.temp) : null;

      /* L'éligibilité, dite en toutes lettres. Trois VALID/INVALID, et la
         raison quand la récupération n'a rien rendu. */
      out.hrvOk   = (out.rmssd != null) ? 'VALID' : 'INVALID';
      out.rhrOk   = (out.rhr   != null) ? 'VALID' : 'INVALID';
      out.sleepOk = (out.dormiMin != null && out.dormiMin > 0) ? 'VALID' : 'INVALID';

      var rec = null;
      try { rec = DB.get('recov_' + K, null); } catch (e) {}
      out.recup = (rec == null || isNaN(+rec)) ? null : +rec;
      out.recupRaison = out.recup != null ? 'publiée'
        : (out.hrvOk === 'INVALID' ? 'aucune variabilité en base pour cette nuit'
        : (out.sleepOk === 'INVALID' ? 'aucune nuit mesurée' : 'non publiée — cause à chercher'));

      var sess = lire(K);
      out.etat = sess ? sess.etat : null;
      out.cause = sess ? sess.cause : null;
      out.raisonSession = sess ? sess.raison : null;
    } catch (e) { out.err = e && e.message; }
    return out;
  };
})();
