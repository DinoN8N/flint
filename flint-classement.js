/* ═══════════════════════════════════════════════════════════════════════════
   flint-classement.js — CE QU'UNE DÉTECTION A LE DROIT DE S'APPELER

   DINO, 20 SEPTEMBRE 2026 : « je suis allé jouer tranquillement au football
   avec des amis […] Flint a pourtant classé automatiquement cette période
   comme une marche. […] Je préfère largement que Flint dise "j'ai détecté
   quelque chose mais je ne sais pas exactement quoi" plutôt qu'il fournisse
   une information fausse avec assurance. »

   LA RÈGLE PRODUIT, ET ELLE EST DISSYMÉTRIQUE PAR DÉCISION :
       un faux « Activité détectée » coûte moins qu'un faux « Marche ».
   On ne cherche donc pas le nom le plus probable, on cherche le nom qu'on
   peut DÉMONTRER. Sans démonstration, le doute se dit.

   ═══ POURQUOI LA RÈGLE D'AVANT NE SUFFISAIT PAS ═══════════════════════════

   Le matin même, `nomDetecte` demandait UNE chose : que la cadence MOYENNE du
   segment tienne les 40 pas/min qu'il faut pour déclarer une marche. Ça a
   suffi à écarter la musculation (21 à 33 pas/min sur les quatre séances
   étiquetées du relevé du 16 septembre). Ça n'écarte pas le football :

       Football 13 sept ·  75 min · 5 587 pas ·  74 pas/min  → « Marche »
       Football 14 sept ·  61 min · 3 370 pas ·  55 pas/min  → « Marche »
       Football 15 sept · 153 min · 7 474 pas ·  49 pas/min  → « Marche »

   UNE MOYENNE NE DIT RIEN D'UNE ALTERNANCE. Une brésilienne, c'est courir dix
   secondes, s'arrêter, repartir — beaucoup de pas, jamais une marche. La
   moyenne d'un quart d'heure de course et d'un quart d'heure debout ressemble
   trait pour trait à une demi-heure de marche tranquille. C'est ce que le
   détecteur lisait, et c'est ce qu'il annonçait.

   ═══ LES TROIS CRITÈRES, ET AUCUN N'INVENTE DE SEUIL ══════════════════════

   ① LA CADENCE MOYENNE TIENT LE SEUIL DE DÉCLARATION (`forte`, 40 pas/min).
     C'est la règle du matin, conservée telle quelle. Elle écarte la salle.

   ② ELLE LE TIENT PARTOUT, PAS EN MOYENNE. Les trois quarts au moins des
     fenêtres mesurées du segment — minutes, ou tranches quand la montre n'a
     envoyé que des blocs — sont à `forte`. C'est LE critère neuf, et le seul
     qui sépare un terrain de foot d'un trottoir. La fraction n'est pas
     choisie ici : c'est déjà celle de `MARCHE_MIN_PAS`, « les trois quarts de
     ce qu'une marche tout juste acceptable produirait ».

   ③ LE CŒUR NE DIT PAS LE CONTRAIRE. Deux façons pour lui de contredire, et
     aucune n'invente de nombre :
       · le battement le plus haut de la fenêtre atteint la Z2 de la personne
         — la borne que `flZonesBpm` calcule déjà sur SA réserve cardiaque
         (Karvonen), pas un pourcentage posé ici. Une marche ne fait pas monter
         le cœur en zone d'effort ; un foot tranquille, si, par salves ;
       · ou la fenêtre est celle que `flFcFiable` déclare INCOHÉRENTE : « N
         minutes à cadence de course (130 pas/min et plus) avec un pouls sous
         la Z2 100 % du temps — le capteur a probablement perdu le pouls ».
         Un calme qu'on a déjà démontré faux ne peut pas servir de preuve de
         calme. C'est le seul cas du relevé où ① et ② tiennent sur une course :
         le 9 septembre, 112 pas/min pour 62 de moyenne cardiaque.

   MESURE SUR LES 127 SEGMENTS DU RELEVÉ DU 16 SEPTEMBRE (`outils/audit-nom-detection.js`),
   jugée contre les séances que Dino a lui-même nommées :

       règle                              « Marche »   faux sur un sport connu
       ① seule (la règle du matin)            85              13
       ① + ②                                  23               8
       ① + ② + ③                              15               0

   LES TROIS FOOTBALLS TOMBENT, LES QUATRE MUSCULATIONS AUSSI, et les sept
   courses avec — une course n'est pas une marche non plus.

   ET AUCUNE DES QUINZE MARCHES SURVIVANTES N'EST UN SPORT ÉTIQUETÉ : ce que la
   règle retire, elle le retire à des segments que personne n'avait nommés. La
   plus lente fait 58 pas/min, la plus rapide 112, et pas une n'a poussé le
   cœur en Z2.

   CE QUE LA RÈGLE COÛTE, ET IL FAUT LE DIRE : 85 segments s'appelaient
   « Marche », il en reste 15. Les 70 autres deviennent « Activité détectée ».
   Aucune mesure ne bouge — ni bornes, ni pas, ni calories, ni effort — et
   l'utilisateur peut nommer chacune d'un doigt. C'est le marché que Dino a
   explicitement demandé : « je préfère largement que Flint dise j'ai détecté
   quelque chose mais je ne sais pas exactement quoi ».

   ═══ CE QU'UNE ABSENCE DE MESURE A LE DROIT DE FAIRE ══════════════════════

   Elle empêche de conclure « Marche », elle ne la prouve jamais. Et les deux
   critères mesurés ne sont pas de même nature, donc leur absence ne se traite
   pas pareil :

     · ② est une PREUVE. Sans répartition des pas dans le temps, on n'a rien
       démontré du tout : le segment reste « Activité ». C'est le sens même de
       la demande — on ne nomme pas ce qu'on n'a pas vu.
     · ③ est une CONTRADICTION. Sans courbe cardiaque, il n'y a rien qui
       contredise ; on ne dégrade pas un segment parce qu'un capteur s'est tu.
       C'est la règle de la maison — une absence n'est pas une mesure — et la
       renverser ici effacerait toutes les marches des jours sans bracelet.

   ═══ CE QUE CE FICHIER NE FAIT PAS, ET NE FERA PAS ════════════════════════

   IL NE DEVINE AUCUN SPORT. Il répond à une seule question — « est-ce une
   marche ? » — par oui ou par « je ne sais pas ». Le nom d'un sport vient du
   détecteur cardiaque (qui lit ce que la montre annonce) ou de l'utilisateur
   lui-même. Ce fichier n'a pas de troisième réponse et n'en aura pas.

   IL NE LIT PAS LE REGISTRE D'APPRENTISSAGE. `flApprentissageClassement` range
   les corrections de l'utilisateur pour qu'on puisse un jour les MESURER ;
   s'en servir ici pour nommer plus hardiment serait exactement ce que Dino
   interdit dans la même demande : « ne jamais utiliser cet apprentissage pour
   commencer à classifier agressivement des activités ambiguës ».

   IL NE TOUCHE NI AUX BORNES, NI À L'EFFORT, NI AUX CALORIES. La fenêtre que
   le détecteur trouve est juste — c'est le constat du 20 septembre au matin,
   et il n'a pas bougé. On ne corrige que le MOT.

   ═══ § LE GARDE : CE QUI ARRIVE SI CE FICHIER N'EST PAS LÀ ════════════════

   MESURÉ, PAS SUPPOSÉ. Les trois appels du détecteur vers ce module sont gardés
   par un `typeof`, et la première version ne l'était pas. Sur le banc du
   23 août, la marche de 10h39 — 73 minutes, 5 073 pas mesurés — n'est pas
   devenue « Activité » : elle a DISPARU. `syncSessions` enveloppe la détection
   au pas dans un `try/catch` muet ; un `ReferenceError` sur une seule fenêtre
   emporte donc TOUTES les marches de la journée, sans une trace.

   LE MODULE PEUT MANQUER POUR DE VRAIES RAISONS : une mise à jour OTA à moitié
   arrivée, un cache de service worker en travers, un banc qui prélève une
   fonction sans son voisin. Aucune ne justifie de perdre cinq mille pas.

   LE REPLI EST LE NOM CONSERVATEUR, et c'est la même règle que partout ici :
   sans le module, aucune preuve n'est calculable, donc rien n'est démontré,
   donc « Activité ». La rangée vit, ses mesures sont intactes, et l'utilisateur
   peut la nommer. Le repli inverse — « Marche » par défaut — rendrait le défaut
   que ce fichier existe pour corriger.

   ═══ § LA PORTE : QUI A LE DROIT DE SE VOIR POSER LA QUESTION ═════════════

   Dire « Activité » ne sert à rien si personne ne peut répondre. La question
   (`needsClassification`, dans `flEtatActivite`) était réservée aux activités
   dont le moteur avait crédité au moins une minute d'effort CARDIAQUE —
   `kcalEtat` à `cardio` ou `mixte`. Ce garde existe pour une bonne raison,
   mesurée en v1729 : cinq séances de la base arrivaient sans nom, dont une de
   129 minutes à 71 bpm SANS UN PAS. La montre avait déclaré une séance, rien
   ne la soutenait, et poser « C'était quoi ? » dessus aurait fait cliquer
   quelqu'un dans le vide.

   IL VISAIT UNE SÉANCE DÉCLARÉE PAR LA MONTRE, PAS UNE DÉTECTION AU PAS. Une
   activité que le détecteur de marche a trouvée a déjà franchi ses planchers —
   600 pas et 15 minutes, et trois minutes consécutives de cadence soutenue
   pour seulement s'allumer. Le mouvement EST la preuve qu'il s'est passé
   quelque chose ; c'est même la seule chose dont on soit sûr. `source:'pas'`
   ouvre donc la porte au même titre que le cœur — sans quoi le football que
   ce fichier refuse de nommer resterait muet, et la règle produit n'aurait
   rien changé pour Dino.
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* La même fraction que `MARCHE_MIN_PAS` dans index.html : les trois quarts.
     Elle y dit « les trois quarts de ce qu'une marche acceptable produirait »,
     elle dit ici « les trois quarts de ses fenêtres à cette cadence ». Un seul
     chiffre, deux applications de la même idée — pas un seuil de plus. */
  var PART_TENUE = 0.75;

  /* La Z2 du jour, en battements. `flZonesBpm` gèle les bornes par jour et les
     dérive de la réserve cardiaque réelle : deux personnes de même maximale
     n'ont pas la même Z2, et c'est précisément ce qu'on veut ici. Absente —
     profil incomplet, réserve absurde — on rend `null`, et le critère ③ se
     tait au lieu de trancher sur une borne inventée. */
  function zone2(jour) {
    try {
      var z = (typeof window.flZonesBpm === 'function') ? window.flZonesBpm(jour) : null;
      return (Array.isArray(z) && z.length === 5 && z[1] > 0) ? +z[1] : null;
    } catch (e) { return null; }
  }

  /* ═══ LA PREUVE : COMBIEN DE FENÊTRES TIENNENT VRAIMENT LA CADENCE ════════

     Les deux formes que le détecteur sait produire, et pas une de plus. Elles
     vivent ICI et non dans le détecteur parce que c'est la règle du nom qui
     les consomme : le jour où le critère ② change de forme, un seul fichier
     bouge.

     LES CREUX TOLÉRÉS COMPTENT COMME DES ÉCHECS, et c'est tout l'objet. Le
     détecteur ACHÈTE du silence pour ne pas couper une sortie en trois à un
     feu rouge — la fenêtre qui en sort est juste. Mais ce silence acheté est
     exactement ce qui distingue un terrain de foot d'un trottoir, et le
     compter comme de la marche reviendrait à effacer la seule différence
     qu'on cherche à voir.

     Rendent `null` quand il n'y a rien à compter : pas de fenêtre, pas de
     preuve, et le verdict en tire la conséquence. */
  window.flPartMinutesTenues = function (p, deb, fin, forte) {
    if (!p || !p.vu || !p.m || !(fin > deb) || !(forte > 0)) return null;
    var t = 0, n = 0;
    for (var i = deb; i < fin; i++) { n++; if (p.vu[i] && p.m[i] >= forte) t++; }
    return n ? t / n : null;
  };

  window.flPartTranchesTenues = function (tr, largeur, forte) {
    if (!tr || !tr.length || !(largeur > 0) || !(forte > 0)) return null;
    var t = 0;
    for (var i = 0; i < tr.length; i++) if (tr[i][1] / largeur >= forte) t++;
    return t / tr.length;
  };

  /* ═══ LE VERDICT ══════════════════════════════════════════════════════════

     `seg`   le segment tel que le détecteur le rend — on n'y lit que
             `partForte` (la preuve ci-dessus), `maxHr` et `fcIncoherent`.
             Nul : aucune preuve, et le verdict le dit.
     `pas`   le nombre de pas, `dur` la durée en minutes, `K` la clé du jour.
     `forte` le seuil de déclaration du détecteur (MARCHE_FORTE), PASSÉ plutôt
             que recopié : une seule vérité, et elle vit dans index.html.

     Rend `{nom, ti, tenus, manques}`. `manques` nomme les critères qui n'ont
     pas été démontrés — c'est ce qui permet à un diagnostic de dire POURQUOI
     une activité est restée sans nom, plutôt que de le faire deviner. */
  window.flVerdictMarche = function (seg, pas, dur, K, forte) {
    var g = seg || {};
    pas = +pas; dur = +dur; forte = +forte;
    var tenus = [], manques = [];

    /* ① la cadence moyenne */
    if (dur > 0 && pas > 0 && forte > 0 && (pas / dur) >= forte) tenus.push('cadence');
    else manques.push('cadence');

    /* ② la cadence TENUE — une preuve : son absence interdit de conclure */
    if (g.partForte == null) manques.push('repartition');
    else if (g.partForte >= PART_TENUE) tenus.push('regularite');
    else manques.push('regularite');

    /* ③ le cœur — une contradiction : son absence ne prouve rien contre, mais
       une mesure que le moteur a démontrée fausse ne prouve rien pour. */
    var z2 = zone2(K);
    if (g.fcIncoherent === true) manques.push('coeurIncoherent');
    else if (g.maxHr == null || z2 == null) tenus.push('coeurMuet');
    else if (+g.maxHr < z2) tenus.push('coeur');
    else manques.push('coeur');

    var marche = !manques.length;
    return { nom: marche ? 'Marche' : 'Activité',
             ti: marche ? 'walk' : null,
             tenus: tenus, manques: manques };
  };

  /* L'appel court, pour les deux endroits du moteur qui écrivent une rangée.
     Le nom seul — le reste du verdict n'intéresse que les diagnostics. */
  window.flNomDetecte = function (seg, pas, dur, K, forte) {
    return window.flVerdictMarche(seg, pas, dur, K, forte).nom;
  };

  /* ═══ LE REGISTRE DES CORRECTIONS ═════════════════════════════════════════

     CE QU'IL EST : la trace de ce que l'utilisateur a répondu quand Flint ne
     savait pas, avec ce que les capteurs disaient à ce moment-là. Un corpus
     pour régler la détection plus tard, sur des cas réels plutôt que sur une
     intuition — c'est exactement la leçon de `cas-reels.json` et du détecteur
     de marche, réglé le 5 août sur UNE soirée reconstruite.

     CE QU'IL N'EST PAS : une source de décision. Rien ici n'est lu par
     `flVerdictMarche`, et ce n'est pas un oubli (voir l'en-tête).

     LE PLAFOND EST DUR, ET IL A UNE RAISON MESURÉE. La base du web vit sous un
     quota de 5 Mo, et l'a déjà atteint le 23 août : treize enregistrements de
     séance refusés d'affilée. Un registre qui grossit sans fin finirait par
     coûter une séance à quelqu'un. Cent vingt entrées d'une dizaine de champs
     courts tiennent sous vingt kilo-octets, et les plus anciennes sortent par
     l'avant. Ce qu'on perd alors, c'est la correction la plus ancienne — pas
     une mesure : l'activité, elle, garde son nom dans `srcs.user`. */
  /* `DB` EST UNE `const` D'INDEX.HTML, PAS UNE PROPRIÉTÉ DE LA FENÊTRE — et la
     différence coûte une version quand on l'oublie : passer par la fenêtre rend
     `undefined` dans l'app et QUELQUE CHOSE dans un banc, donc le défaut est vert
     partout et mort sur le téléphone. `marche.js` l'a payé une fois,
     `flint-recup-cycle.js` le 30 août. On la lit nue, au geste, comme
     `flint-zones.js` lit `tk`. Gardé par `garde-liaisons.js`, qui a refusé la
     première version de ce fichier — c'est lui qui a trouvé la faute, pas une
     relecture, et c'est exactement à ça qu'il sert. */
  var CLE = 'apprentissageClassement';
  var PLAFOND = 120;

  window.flNoterCorrection = function (entree) {
    try {
      if (!entree || !entree.choisi) return 'sans choix';
      var L = [];
      try { L = DB.get(CLE, []) || []; } catch (e) { L = []; }
      if (!Array.isArray(L)) L = [];
      /* Une même activité ne s'inscrit qu'une fois : se raviser corrige
         l'entrée, il n'en naît pas une seconde qui contredirait la première. */
      var id = String(entree.id || '');
      L = L.filter(function (x) { return !(x && String(x.id || '') === id && id); });
      L.push({ id: id, jour: entree.jour || null, le: entree.le || null,
               choisi: String(entree.choisi).slice(0, 40),
               avant: entree.avant || null,
               dur: (entree.dur != null ? +entree.dur : null),
               pas: (entree.pas != null ? +entree.pas : null),
               /* arrondie au centième : on garde un signal, pas une décimale
                  de plus que ce que la mesure vaut */
               partForte: (entree.partForte != null
                           ? Math.round(+entree.partForte * 100) / 100 : null),
               avgHr: (entree.avgHr != null ? +entree.avgHr : null),
               maxHr: (entree.maxHr != null ? +entree.maxHr : null),
               manques: (Array.isArray(entree.manques) ? entree.manques.slice(0, 4) : null) });
      while (L.length > PLAFOND) L.shift();
      try { DB.set(CLE, L); } catch (e) { return 'écriture refusée'; }
      return 'notée · ' + entree.choisi + ' · ' + L.length + ' au registre';
    } catch (e) { return 'ECHEC · ' + (e && e.message ? e.message : '?'); }
  };

  /* ═══ LA PORTE DU NATIF : « il a répondu X, note ce qu'on voyait » ════════

     L'ÉCRAN NE PORTE AUCUNE MESURE, ET C'EST TOUT L'INTÉRÊT. Il envoie trois
     chaînes — quelle activité, quel nom elle portait, quel nom l'utilisateur a
     choisi — et le moteur relit LUI-MÊME ce que les capteurs disaient de cette
     fenêtre. Un écran qui recopierait la part des minutes tenues ou le
     battement le plus haut en fabriquerait une deuxième version, et c'est la
     panne qu'on ferme partout ailleurs : une seule autorité par mesure.

     ON RELIT LA DÉTECTION, PAS LA RANGÉE. La rangée stockée ne porte ni
     `partForte` ni `fcIncoherent` — ce sont des propriétés du SEGMENT, pas de
     la séance. On redemande donc au détecteur ce qu'il voit sur ce jour et on
     retrouve la fenêtre par ses bornes. Si le jour est trop vieux pour que ses
     pas à la minute existent encore, on n'invente rien : la correction est
     notée avec ce qu'on a, et les champs absents restent nuls.

     ELLE NE MODIFIE RIEN. Le renommage est déjà fait par `flReclasserActivite`,
     qui est la seule écriture sur l'activité. Celle-ci n'écrit que le registre. */
  window.flNoterCorrectionActivite = function (id, avant, choisi) {
    try {
      if (!id || !choisi) return 'sans id ou sans choix';
      for (var j = 0; j <= 30; j++) {
        var k = tk(-j), L = DB.get('sessions_' + k, []) || [];
        for (var i = 0; i < L.length; i++) {
          var x = L[i];
          if (!x || x.type === 'nap') continue;
          var sid = x.id || ((typeof flIdActivite === 'function') ? flIdActivite(x, k) : null);
          if (String(sid) !== String(id)) continue;
          var fin = (x.endMin != null) ? x.endMin : (x.startMin + (+x.dur || 0));
          var g = null;
          try {
            (window.flDetectMarches(k) || []).forEach(function (seg) {
              if (x.startMin != null && Math.abs(seg.startMin - x.startMin) <= 2) g = seg;
            });
          } catch (e) {}
          var dur = (x.startMin != null && fin > x.startMin) ? fin - x.startMin : null;
          return window.flNoterCorrection({
            id: String(id), jour: k, le: tk(),
            choisi: choisi, avant: (avant || x.name || null),
            dur: dur, pas: (x.pas != null ? x.pas : (g ? g.pasTotal : null)),
            partForte: (g && g.partForte != null ? g.partForte : null),
            avgHr: (x.avgHr != null ? Math.round(x.avgHr) : (g ? g.avgHr : null)),
            maxHr: (g && g.maxHr != null ? g.maxHr : null),
            manques: (g && dur ? window.flVerdictMarche(g, g.pasTotal, dur, k, 40).manques : null)
          });
        }
      }
      return 'introuvable · ' + id;
    } catch (e) { return 'ECHEC · ' + (e && e.message ? e.message : '?'); }
  };

  /* ═══ REJUGER CE QUI EST DÉJÀ EN BASE — ET POURQUOI PERSONNE NE L'APPELLE

     LE PROBLÈME EST RÉEL. `flReconcilierSeances` GARDE l'existant : c'est ce qui
     protège une correction à la main, et c'est donc aussi ce qui fige les
     anciens noms. La règle du nom ne vaut que pour les détections À VENIR — un
     football joué ce matin et déjà rangé sous « Marche » le reste, et la
     correction demandée n'est visible que demain.

     CE QUE CETTE FONCTION FAIT, ET RIEN D'AUTRE. Elle REJUGE, elle ne
     redétecte pas. Aucune activité n'apparaît, aucune ne disparaît, aucune
     borne ne bouge, aucun pas, aucune calorie, aucun effort. Elle relit le nom,
     et elle ne l'écrit que dans un sens : « Marche » → « Activité ». Jamais
     l'inverse — promouvoir une activité en marche sur une redérivation serait
     exactement le geste que ce fichier existe pour empêcher.

     CE QU'ELLE NE TOUCHE JAMAIS :
       · une activité qui porte `srcs.user` — quelqu'un l'a nommée, point ;
       · tout ce qui n'est pas `auto` + `source:'pas'` : la montre, le GPS, le
         tracker et les saisies à la main sont hors de son champ, comme dans la
         migration v1419 ;
       · un jour dont les pas à la minute ne sont plus sur le disque : sans eux
         la preuve est incalculable, donc on ne conclut rien. Ne pas savoir
         n'autorise pas à renommer.

     ELLE ÉCRIT LE NOM AUX DEUX ENDROITS, et c'est le point de mécanique qui a
     fait échouer la tentative du matin : muter `x.name` seul ne tient pas, la
     réconciliation le reconstruit depuis la contribution rangée dans `srcs`.
     On corrige donc la CONTRIBUTION `auto` — celle qui a dit « Marche » — et la
     vue plate avec elle.

     PERSONNE NE L'APPELLE, ET C'EST DÉLIBÉRÉ. Réécrire soixante journées de
     données rangées n'est pas une décision de code. Elle s'appelle à la main
     (`flRejugerNomsDetectes()` à la console, `flRejugerNomsDetectes(0)` pour le
     seul jour courant), elle rend un compte rendu, et elle est annulable par la
     redétection normale. Cf. CHANTIER-ACTIVITE-DETECTEE.md. */
  window.flRejugerNomsDetectes = function (jours) {
    try {
      var haut = (jours == null) ? 30 : Math.max(0, Math.min(120, jours | 0));
      var vus = 0, changes = 0, sansPreuve = 0, details = [];
      for (var j = 0; j <= haut; j++) {
        var k = tk(-j), L = DB.get('sessions_' + k, []) || [], touche = false;
        var segs = null;
        for (var i = 0; i < L.length; i++) {
          var x = L[i];
          if (!x || x.type === 'nap') continue;
          if (!(x.auto === true && x.source === 'pas')) continue;
          if (x.srcs && x.srcs.user) continue;
          if (x.name !== 'Marche') continue;
          vus++;
          if (segs === null) { try { segs = window.flDetectMarches(k) || []; } catch (e) { segs = []; } }
          var g = null;
          for (var q = 0; q < segs.length; q++)
            if (x.startMin != null && Math.abs(segs[q].startMin - x.startMin) <= 2) g = segs[q];
          /* Pas de segment retrouvé = le jour ne porte plus ses pas à la minute.
             On ne rejuge pas sur rien. */
          if (!g || g.partForte == null) { sansPreuve++; continue; }
          var fin = (x.endMin != null) ? x.endMin : (x.startMin + (+x.dur || 0));
          var dur = fin - x.startMin;
          if (!(dur > 0)) { sansPreuve++; continue; }
          if (window.flVerdictMarche(g, (x.pas != null ? x.pas : g.pasTotal), dur, k, 40).nom === 'Marche')
            continue;
          x.name = 'Activité'; delete x.ti;
          if (x.srcs && x.srcs.auto) { x.srcs.auto.name = 'Activité'; delete x.srcs.auto.ti; }
          touche = true; changes++;
          details.push(k + ' ' + (x.start || x.startMin) + ' · ' + dur + ' min');
        }
        if (touche && !DB.set('sessions_' + k, L)) details.push(k + ' · ÉCRITURE REFUSÉE');
      }
      return 'rejugé · ' + vus + ' marches lues · ' + changes + ' devenues Activité · '
        + sansPreuve + ' sans preuve (inchangées)'
        + (details.length ? '\n  ' + details.join('\n  ') : '');
    } catch (e) { return 'ECHEC · ' + (e && e.message ? e.message : '?'); }
  };

  /* La lecture, pour les outils de mesure et l'export. Une copie, jamais la
     référence : un lecteur ne doit pas pouvoir muter le registre. */
  window.flApprentissageClassement = function () {
    try {
      var L = DB.get(CLE, []) || [];
      return Array.isArray(L) ? JSON.parse(JSON.stringify(L)) : [];
    } catch (e) { return []; }
  };
})();
