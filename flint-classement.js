/* ═══════════════════════════════════════════════════════════════════════════
   flint-classement.js — CE QU'UNE DÉTECTION A LE DROIT DE S'APPELER,
   ET LES PAS QU'UNE ACTIVITÉ A LE DROIT DE COMPTER

   ═══ 28 SEPTEMBRE 2026 — LA RÈGLE CHANGE DE CENTRE ════════════════════════

   DINO : « énormément de marches remontent simplement comme Activité […] Une
   vraie marche doit être reconnue comme Marche beaucoup plus souvent », et
   dans la même demande « pendant une séance de musculation, le système peut
   compter 1 437 pas alors que l'utilisateur n'a évidemment pas marché autant ».
   Le principe qu'il pose : « Marche certaine → Marche · Activité certaine
   mais type inconnu → Activité · Pas certains → compter · Pas incertains →
   ne pas compter ».

   LA RÈGLE DU 20 SEPTEMBRE (plus bas) ÉTAIT JUSTE SUR LES SPORTS ET FAUSSE
   SUR LES MARCHES. Elle exigeait que les trois quarts des MINUTES soient à
   40 pas : une marche qui s'arrête à un feu, dans une boutique, devant une
   vitrine ne les tient pas. Mesuré sur la base du téléphone du 28 septembre :
   des cinq fenêtres que Dino a lui-même nommées « Marche » via la question,
   AUCUNE ne passait. Et un seul maximum cardiaque parasite suffisait à tout
   refuser.

   LA MESURE, `outils/audit-nom-detection.js`, contre ce que Dino a nommé :
       base                   segments   « Marche » 20 sept. → 28 sept.   sports nommés Marche
       téléphone, 28 sept.       158           16  →  87                        0
       export, 16 sept.          127           15  →  77                        0
       Félix, 18 sept.           102            8  →  76                        0
   Marches nommées par Dino : 0 sur 5 → 3 sur 5. Les deux qui restent
   « Activité » (0,59 et 0,65 de leurs pas en déplacement) sont des flâneries
   faites surtout d'arrêts : c'est le prix de la marge gardée du côté des sports.

   CE QUI LA REMPLACE, À LA MINUTE (le chemin par tranches n'a pas bougé) :
   on ne demande plus « la cadence est-elle tenue partout ? » mais « d'où
   viennent les pas ? ». Une marche avec des arrêts reste une marche si ses
   pas viennent d'un DÉPLACEMENT — trois minutes d'affilée à la cadence de
   déclaration, la preuve même qui allume le détecteur. Une séance de salle
   produit ses pas par minutes isolées, et c'est ce qui la trahit.

     ① LE DÉPLACEMENT — quatre pas sur cinq au moins viennent d'enchaînements
        de marche (`flMinutesLocomotion`, voir § LE DÉPLACEMENT).
     ② L'ALLURE — pas deux minutes à cadence de course (140 pas et plus).
        Une marche rapide en touche une ; le football tranquille du
        14 septembre en a deux (212 et 149), les courses de 7 à 48.
     ③ LE CŒUR — neuf battements mesurés sur dix sous la Z2, au lieu de
        TOUS : un seul point parasite ne condamne plus une marche. Et une
        fenêtre que `flFcFiable` déclare incohérente ne prouve toujours rien.

   ET LES PAS SUIVENT LA MÊME PREUVE. Une activité qui n'est pas un
   déplacement (« Activité », Musculation, Vélo…) ne compte que les pas de
   ses enchaînements de marche — `flPasConfirmes`. Une Marche, une Course,
   une Randonnée comptent tout (`flPasCompteEntier`). Le total du JOUR ne
   bouge pas : c'est le podomètre du bracelet, et il reste la référence.
   Dossier et mesures : CHANTIER-ACTIVITE-DETECTEE.md § IX.

   ═══ LE 20 SEPTEMBRE — L'HISTOIRE QUI A POSÉ LA DISSYMÉTRIE ════════════════

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

  /* ═══ 28 SEPT. — LE DÉPLACEMENT : CE QUI PROUVE QU'ON A MARCHÉ ═════════════

     L'ACTIVITÉ ET LE DÉPLACEMENT SONT DEUX QUESTIONS. Le détecteur de pas dit
     qu'il s'est passé quelque chose ; il ne dit pas que les jambes ont porté
     le corps d'un point à un autre. Le podomètre du bracelet compte des
     mouvements du POIGNET — une série de développé couché, un haltère, une
     vibration de guidon lui ressemblent. Ce qui ne lui ressemble pas, c'est la
     DURÉE : on ne soulève pas une barre trois minutes d'affilée à quarante
     « pas » par minute, on marche.

     LA PREUVE EST CELLE DU DÉTECTEUR, SANS UN SEUIL DE PLUS. Une minute est un
     déplacement quand elle appartient à un enchaînement :
       · ALLUMAGE_MIN minutes CONSÉCUTIVES à MARCHE_FORTE (3 × 40 pas) — c'est
         l'allumage de `marchesALaMinute`, « traverser une pièce » n'y suffit
         pas ;
       · prolongé des deux côtés par les minutes contiguës à MIN_PLANCHER
         (10 pas) — la traîne de `fermerRompu`, le ralentissement au bout
         d'une rue. Une minute vide coupe : l'élan ne traverse pas un arrêt.
     Les trois nombres sont PASSÉS par index.html (`flSeuilsMarche`) ; les
     valeurs par défaut ci-dessous ne servent qu'à un web où ils manquent.

     MESURÉ sur la musculation du 28 septembre, 12:16 → 13:09 : le bracelet
     compte 1 437 pas, dont 573 dans l'arrivée à la salle (12:16 → 12:22, 73 à
     112 pas par minute — l'enchaînement commence à 12:14, avant la fenêtre).
     Le reste est fait de minutes isolées — 26, 50, 10,
     12, 32, 29, 40, 7, 45… — et de deux salves de deux minutes : aucune ne
     tient trois minutes. ⚠️ Le téléphone de Dino, dans sa poche, a compté
     1 304 pas sur 12:10 → 12:59 : une partie de ces mouvements étaient de
     vrais pas. La règle ne sait pas lesquels, elle ne compte donc que ceux
     qu'elle peut DÉMONTRER — c'est la consigne (« pas incertains → ne pas
     compter »), et c'est un choix prudent, pas une mesure exacte. */
  var SEUILS_DEFAUT = { forte: 40, allumage: 3, plancher: 10 };
  function seuils() {
    var s = window.flSeuilsMarche;
    return (s && s.forte > 0 && s.allumage > 0 && s.plancher > 0) ? s : SEUILS_DEFAUT;
  }

  /* Les 1 440 minutes d'une journée, vrai = déplacement. Le résultat vit sur
     l'objet `p` lui-même, non énumérable : `flPasParMinute` en fabrique un neuf
     à chaque appel, donc la mémoire meurt avec la donnée qu'elle résume —
     aucune chance de servir une journée qui a bougé. */
  window.flMinutesLocomotion = function (p) {
    if (!p || !p.m || !p.vu) return null;
    if (p._flLoco) return p._flLoco;
    var S = seuils(), n = p.m.length, en = new Array(n), i, j, a, b, q;
    for (i = 0; i < n; i++) en[i] = false;
    function v(k) { return p.vu[k] ? (+p.m[k] || 0) : -1; }
    i = 0;
    while (i < n) {
      if (v(i) < S.forte) { i++; continue; }
      j = i; while (j < n && v(j) >= S.forte) j++;
      if (j - i >= S.allumage) {
        a = i; b = j - 1;
        while (a - 1 >= 0 && v(a - 1) >= S.plancher) a--;
        while (b + 1 < n && v(b + 1) >= S.plancher) b++;
        for (q = a; q <= b; q++) en[q] = true;
      }
      i = j;
    }
    try { Object.defineProperty(p, '_flLoco', { value: en, enumerable: false }); } catch (e) {}
    return en;
  };

  /* UNE MINUTE DE COURSE. La marche de Dino plafonne vers 120 pas par minute
     et touche 140 une fois, au plus, sur une sortie rapide (19 août). Au-delà,
     les jambes courent — ou le poignet s'agite plus vite qu'un pas. */
  var CADENCE_COURSE = 140;

  /* CE QU'UNE FENÊTRE DIT DU DÉPLACEMENT — la matière du verdict et des pas.
     `pauses` : les arrêts d'un tracker (bruts ou normalisés), qui ne sont pas
     la séance. `hr` : la série `[minute, bpm]` de la journée, facultative.
     Rend `null` quand le bracelet n'a décrit aucune minute : il n'était pas
     là, il n'a pas mesuré une absence de pas. */
  window.flLocomotion = function (p, deb, fin, pauses, hr) {
    try {
      var en = window.flMinutesLocomotion(p);
      if (!en || !(fin > deb)) return null;
      var ps = null;
      if (pauses && pauses.length) {
        ps = (typeof window.flPausesDe === 'function') ? window.flPausesDe({ pauses: pauses }) : pauses;
      }
      var arret = function (m) {
        return !!(ps && ps.length && typeof window.flEnPause === 'function' && window.flEnPause(m, ps));
      };
      var d = Math.max(0, Math.round(deb)), f = Math.min(en.length, Math.round(fin));
      var pas = 0, conf = 0, vues = 0, course = 0;
      for (var i = d; i < f; i++) {
        if (!p.vu[i] || arret(i)) continue;
        var x = +p.m[i] || 0;
        vues++; pas += x;
        if (en[i]) conf += x;
        if (x >= CADENCE_COURSE) course++;
      }
      if (!vues) return null;
      var o = { pas: pas, pasConfirmes: conf, part: (pas > 0 ? conf / pas : null),
                minutesCourse: course, minutesVues: vues, p90Hr: null, nHr: 0 };
      /* LE NEUVIÈME DÉCILE, PAS LE MAXIMUM. Le capteur optique d'un poignet
         qui marche lâche des points isolés — 55 puis 117 puis 56 dans trois
         minutes voisines, sur la marche du 21 septembre. Un maximum les prend
         pour un effort ; le neuvième décile les laisse passer et garde un
         effort tenu, qui en occupe bien plus d'un dixième. */
      if (hr && hr.length) {
        var v = [];
        for (var k = 0; k < hr.length; k++) {
          var h = hr[k];
          if (h && h[1] > 0 && h[0] >= d && h[0] < f && !arret(h[0])) v.push(+h[1]);
        }
        o.nHr = v.length;
        if (v.length >= 3) { v.sort(function (x, y) { return x - y; }); o.p90Hr = v[Math.floor(v.length * 0.9)]; }
      }
      return o;
    } catch (e) { return null; }
  };

  /* Les pas qu'une fenêtre peut DÉMONTRER, ou `null` sans canal à la minute. */
  window.flPasConfirmes = function (p, deb, fin, pauses) {
    var l = window.flLocomotion(p, deb, fin, pauses, null);
    return l ? l.pasConfirmes : null;
  };

  /* ═══ LES ACTIVITÉS DONT LES PAS SONT L'ACTIVITÉ ══════════════════════════
     Marcher, courir, monter : chaque pas en fait partie, on les compte TOUS
     (« Marche claire → compter les pas normalement »). Le reste — l'inconnu
     « Activité », la salle, le vélo, la natation, les sports de balle —
     ne compte que les pas de ses enchaînements. Un football garde ainsi
     presque tout (on y court sans arrêt : 95 à 100 % de ses pas sont des
     enchaînements sur les quatre matchs de fin septembre) ; une salle de
     musculation garde ses allées et venues.
     La liste est celle du catalogue, famille « course & marche » (Marche
     digestive comprise), plus l'Alpinisme que Dino a déjà répondu une fois. */
  var NOMS_DEPLACEMENT = /^(marche|randonnee|rando|course|trail|sprint|athletisme|escalier|footing|jogging|alpinisme)/;
  function simple(t) {
    var s = String(t || '').toLowerCase();
    try { s = s.normalize('NFD').replace(/[̀-ͯ]/g, ''); } catch (e) {}
    return s.trim();
  }
  window.flPasCompteEntier = function (s) {
    return NOMS_DEPLACEMENT.test(simple(s && (s.name || s.nom)));
  };

  /* RECOMPTER LES PAS D'UNE ACTIVITÉ SELON SON NOM — la porte des écritures
     qui n'en passent pas par `flDeriverMetriques` : un renommage, la passe de
     l'historique. `p` se passe quand l'appelant l'a déjà (une journée entière
     à recompter) ; sans canal à la minute on ne touche à rien. Rend vrai
     quand le nombre a changé. */
  window.flRecompterPas = function (k, s, p) {
    try {
      /* Une activité sans pas n'en reçoit pas ; une fenêtre que le moteur
         refuse (`fenetreOk:false`) ne porte rien, on ne lui rend rien. */
      if (!s || s.type === 'nap' || s.startMin == null || s.pas == null || s.fenetreOk === false) return false;
      p = p || ((typeof window.flPasParMinute === 'function') ? window.flPasParMinute(k) : null);
      if (!p || !p.m) return false;
      var fin = (s.endMin != null) ? +s.endMin : (+s.startMin + (+s.dur || 0));
      var l = window.flLocomotion(p, +s.startMin, fin, s.pauses, null);
      if (!l) return false;
      /* ON NE TRANSFORME QUE CE QU'ON SAIT LIRE. Le nombre rangé doit être le
         brut OU le démontré de cette même fenêtre ; sinon il vient d'un autre
         calcul — les totaux de blocs d'avant la v1413, quand la montre ne
         décrivait pas encore ses minutes. Mesuré sur la base du 28 sept. : un
         Badminton du 4 août rangé à 2 757 pas dont 66 seulement sont décrits à la
         minute ; le recompter aurait écrit 0 sur une mesure qu'on n'a pas. */
      if (+s.pas !== l.pas && +s.pas !== l.pasConfirmes) return false;
      var n = window.flPasCompteEntier(s) ? l.pas : l.pasConfirmes;
      if (s.pas === n) return false;
      s.pas = n;
      return true;
    } catch (e) { return false; }
  };

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

     `seg`   le segment tel que le détecteur le rend. Au chemin À LA MINUTE on
             y lit `loco` (`flLocomotion` sur sa fenêtre) et `fcIncoherent` ;
             au chemin PAR TRANCHES, `partForte`, `maxHr` et `fcIncoherent`.
             Nul : aucune preuve, et le verdict le dit.
     `pas`   le nombre de pas, `dur` la durée en minutes, `K` la clé du jour.
     `forte` le seuil de déclaration du détecteur (MARCHE_FORTE), PASSÉ plutôt
             que recopié : une seule vérité, et elle vit dans index.html.

     Rend `{nom, ti, tenus, manques}`. `manques` nomme les critères qui n'ont
     pas été démontrés — c'est ce qui permet à un diagnostic de dire POURQUOI
     une activité est restée sans nom, plutôt que de le faire deviner. */
  /* QUATRE PAS SUR CINQ. Mesuré sur la base du téléphone du 28 septembre et
     l'export de Félix du 18 : aucune séance de salle ou de renforcement
     étiquetée ne dépasse 0,72 parmi celles que le cœur et l'allure laissent
     passer (le football et la course, eux, tombent sur le cœur ou l'allure) ;
     les marches que Dino a nommées et que la règle retrouve sont à 0,87 et
     plus. Le seuil tient la marge du côté des sports. */
  var PART_DEPLACEMENT = 0.8;
  /* Deux minutes de course suffisent à dire qu'on a couru : une marche rapide
     en touche une au plus, le football tranquille du 14 septembre deux. */
  var MINUTES_COURSE = 2;

  window.flVerdictMarche = function (seg, pas, dur, K, forte) {
    var g = seg || {};
    pas = +pas; dur = +dur; forte = +forte;
    var tenus = [], manques = [];
    var z2 = zone2(K);

    /* ═══ À LA MINUTE — la règle du 28 septembre ═══════════════════════════ */
    if (g.loco && g.loco.part != null) {
      /* ① le déplacement : d'où viennent les pas */
      if (g.loco.part >= PART_DEPLACEMENT) tenus.push('deplacement');
      else manques.push('deplacement');
      /* ② l'allure : une marche ne court pas */
      if ((+g.loco.minutesCourse || 0) < MINUTES_COURSE) tenus.push('allure');
      else manques.push('course');
      /* ③ le cœur : neuf battements sur dix sous la Z2. Une absence ne prouve
         rien contre ; une mesure que le moteur a démontrée fausse, rien pour. */
      if (g.fcIncoherent === true) manques.push('coeurIncoherent');
      else if (g.loco.p90Hr == null || z2 == null) tenus.push('coeurMuet');
      else if (+g.loco.p90Hr < z2) tenus.push('coeur');
      else manques.push('coeur');
      var m1 = !manques.length;
      return { nom: m1 ? 'Marche' : 'Activité', ti: m1 ? 'walk' : null,
               tenus: tenus, manques: manques };
    }

    /* ═══ PAR TRANCHES — la règle du 20 septembre, inchangée ═════════════════
       Sans répartition à la minute, aucun enchaînement ne se démontre : on
       garde les trois critères d'avant, qui sont PLUS stricts. */
    /* ① la cadence moyenne */
    if (dur > 0 && pas > 0 && forte > 0 && (pas / dur) >= forte) tenus.push('cadence');
    else manques.push('cadence');

    /* ② la cadence TENUE — une preuve : son absence interdit de conclure */
    if (g.partForte == null) manques.push('repartition');
    else if (g.partForte >= PART_TENUE) tenus.push('regularite');
    else manques.push('regularite');

    /* ③ le cœur — une contradiction : son absence ne prouve rien contre, mais
       une mesure que le moteur a démontrée fausse ne prouve rien pour. */
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
               /* 28 sept. — la part des pas qui viennent d'un déplacement : la
                  preuve du nom depuis la règle du jour, gardée au même grain */
               deplacement: (entree.deplacement != null
                             ? Math.round(+entree.deplacement * 100) / 100 : null),
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
            deplacement: (g && g.loco && g.loco.part != null ? g.loco.part : null),
            avgHr: (x.avgHr != null ? Math.round(x.avgHr) : (g ? g.avgHr : null)),
            maxHr: (g && g.maxHr != null ? g.maxHr : null),
            manques: (g && dur ? window.flVerdictMarche(g, g.pasTotal, dur, k, 40).manques : null)
          });
        }
      }
      return 'introuvable · ' + id;
    } catch (e) { return 'ECHEC · ' + (e && e.message ? e.message : '?'); }
  };

  /* ═══ REJUGER CE QUI EST DÉJÀ EN BASE ═════════════════════════════════════

     LE PROBLÈME EST RÉEL. `flReconcilierSeances` GARDE l'existant : c'est ce qui
     protège une correction à la main, et c'est donc aussi ce qui fige les
     anciens noms. La règle du nom ne vaut que pour les détections À VENIR — un
     football joué ce matin et déjà rangé sous « Marche » le reste, et la
     correction demandée n'est visible que demain.

     CE QUE CETTE FONCTION FAIT, ET RIEN D'AUTRE. Elle REJUGE, elle ne
     redétecte pas. Aucune activité n'apparaît, aucune ne disparaît, aucune
     borne ne bouge, aucune calorie, aucun effort. Elle relit le nom avec la
     règle du jour, sur la même preuve qu'une détection fraîche.

     28 SEPT. — ELLE VA DÉSORMAIS DANS LES DEUX SENS. Le 21 elle n'écrivait que
     « Marche » → « Activité », et l'en-tête disait pourquoi : promouvoir sur une
     redérivation aurait été nommer sans preuve. La preuve a changé de nature —
     un enchaînement de marche se DÉMONTRE à la minute, exactement comme pour une
     détection fraîche — et la demande aussi : « une vraie marche doit être
     reconnue comme Marche beaucoup plus souvent ». Les marches rangées sous
     « Activité » par la règle du 20 septembre retrouvent donc leur nom ; celles
     que la règle refuse le perdent, comme avant. Et SES PAS SUIVENT SON NOM
     (`flRecompterPas`) : une « Activité » ne garde que ses pas démontrés, une
     « Marche » les retrouve tous.

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

     ELLE EST APPELÉE UNE FOIS, PAR `flCorrigerAnciensNoms` (plus bas). Le
     20 septembre elle ne l'était par personne : réécrire soixante journées de
     données rangées n'était pas une décision de code, et ce n'en est toujours
     pas une — c'est Dino qui l'a prise, le 21 : « branche flRejugerNomsDetectes
     pour que mes anciennes marches se corrigent ».
     Elle reste appelable à la main (`flRejugerNomsDetectes()` à la console,
     `flRejugerNomsDetectes(0)` pour le seul jour courant), elle rend un compte
     rendu, et elle est annulable par la redétection normale.
     Cf. CHANTIER-ACTIVITE-DETECTEE.md. */
  window.flRejugerNomsDetectes = function (jours) {
    try {
      var haut = (jours == null) ? 30 : Math.max(0, Math.min(120, jours | 0));
      var vus = 0, versMarche = 0, versActivite = 0, sansPreuve = 0, details = [];
      for (var j = 0; j <= haut; j++) {
        var k = tk(-j), L = DB.get('sessions_' + k, []) || [], touche = false;
        var segs = null, p = null;
        for (var i = 0; i < L.length; i++) {
          var x = L[i];
          if (!x || x.type === 'nap') continue;
          if (!(x.auto === true && x.source === 'pas')) continue;
          if (x.srcs && x.srcs.user) continue;
          if (x.name !== 'Marche' && x.name !== 'Activité') continue;
          vus++;
          if (segs === null) { try { segs = window.flDetectMarches(k) || []; } catch (e) { segs = []; } }
          var g = null;
          for (var q = 0; q < segs.length; q++)
            if (x.startMin != null && Math.abs(segs[q].startMin - x.startMin) <= 2) g = segs[q];
          /* Pas de segment retrouvé = le jour ne porte plus ses pas à la minute.
             On ne rejuge pas sur rien. */
          if (!g || (g.loco == null && g.partForte == null)) { sansPreuve++; continue; }
          var fin = (x.endMin != null) ? x.endMin : (x.startMin + (+x.dur || 0));
          var dur = fin - x.startMin;
          if (!(dur > 0)) { sansPreuve++; continue; }
          var nom = window.flVerdictMarche(g, (x.pas != null ? x.pas : g.pasTotal), dur, k, 40).nom;
          if (nom === x.name) continue;
          var ic = (nom === 'Marche') ? '🚶' : '✨';
          x.name = nom; x.icon = ic;
          if (nom === 'Marche') x.ti = 'walk'; else delete x.ti;
          if (x.srcs && x.srcs.auto) {
            x.srcs.auto.name = nom; x.srcs.auto.icon = ic;
            if (nom === 'Marche') x.srcs.auto.ti = 'walk'; else delete x.srcs.auto.ti;
          }
          if (p === null) p = (typeof window.flPasParMinute === 'function') ? (window.flPasParMinute(k) || false) : false;
          if (p) window.flRecompterPas(k, x, p);
          touche = true;
          if (nom === 'Marche') versMarche++; else versActivite++;
          details.push(k + ' ' + (x.start || x.startMin) + ' · ' + dur + ' min → ' + nom);
        }
        if (touche && !DB.set('sessions_' + k, L)) details.push(k + ' · ÉCRITURE REFUSÉE');
      }
      return 'rejugé · ' + vus + ' détections lues · ' + versMarche + ' devenues Marche · '
        + versActivite + ' devenues Activité · ' + sansPreuve + ' sans preuve (inchangées)'
        + (details.length ? '\n  ' + details.join('\n  ') : '');
    } catch (e) { return 'ECHEC · ' + (e && e.message ? e.message : '?'); }
  };

  /* ═══ 28 SEPT. — LES PAS DÉJÀ RANGÉS SUIVENT LA RÈGLE DES PAS ════════════
     `pas` est ÉCRIT sur l'activité à la réconciliation, et une journée passée
     ne se resynchronise jamais : la musculation de ce matin garderait ses
     1 437 pas dans Ma journée pendant que sa fiche, qui recompte à
     l'ouverture, en dirait 573. On recompte donc une fois, par journée, les
     activités qui ne sont PAS un déplacement — c'est la seule population que
     la règle change. Une Marche, une Course, une Randonnée gardent leur nombre
     au pas près. On ne crée aucun champ : une activité sans pas en reste sans. */
  window.flRecompterPasAnciens = function (jours) {
    try {
      var haut = (jours == null) ? 30 : Math.max(0, Math.min(120, jours | 0));
      var lus = 0, changes = 0, retires = 0, avant = 0;
      for (var j = 0; j <= haut; j++) {
        var k = tk(-j), L = DB.get('sessions_' + k, []) || [], touche = false, p = null;
        for (var i = 0; i < L.length; i++) {
          var x = L[i];
          if (!x || x.type === 'nap' || x.pas == null || x.fenetreOk === false) continue;
          if (window.flPasCompteEntier(x)) continue;
          lus++;
          if (p === null) p = (typeof window.flPasParMinute === 'function') ? (window.flPasParMinute(k) || false) : false;
          if (!p) continue;
          var n0 = +x.pas;
          if (window.flRecompterPas(k, x, p)) { touche = true; changes++; avant += n0; retires += n0 - (+x.pas || 0); }
        }
        if (touche) DB.set('sessions_' + k, L);
      }
      return 'pas recomptés · ' + lus + ' activités sans déplacement lues · ' + changes
        + ' corrigées · ' + retires + ' pas non démontrés retirés sur ' + avant;
    } catch (e) { return 'ECHEC · ' + (e && e.message ? e.message : '?'); }
  };

  /* ═══ LA PASSE QUI CORRIGE L'HISTORIQUE — UNE FOIS, ET ELLE SE MARQUE ═════

     Dino, 21 septembre : « branche flRejugerNomsDetectes pour que mes anciennes
     marches se corrigent ».

     CE QU'ELLE AJOUTE À `flRejugerNomsDetectes`, ET RIEN DE PLUS : un drapeau.
     Le rejugement lui-même ne change pas d'un octet — mêmes gardes, même sens
     unique, mêmes exclusions. Ce qui était une décision à prendre à la main
     devient une passe qui s'exécute UNE fois et se souvient de l'avoir fait.

     LE DRAPEAU PORTE SA VERSION, comme `flSommeilRecalculV1910`. Le jour où la
     règle du nom bougera encore, un drapeau neuf rejouera la passe sur la
     nouvelle règle ; celui-ci restera, témoin de ce qui a déjà été corrigé.

     ON N'ESSAIE PAS DE RATTRAPER CE QU'ON NE PEUT PAS PROUVER. Les journées
     dont les pas à la minute ont quitté le disque sont comptées « sans preuve »
     et laissées telles quelles — elles gardent « Marche » sans qu'on sache si
     elles le méritent. Les rejuger sur rien serait pire que de ne rien faire.

     ELLE NE SE RELANCE PAS À CHAQUE LANCEMENT, et c'est tout l'objet du
     drapeau : la passe lit trente journées et écrit celles qu'elle corrige.
     Répétée à chaque montage, elle coûterait ce prix pour zéro changement — et
     le troisième symptôme de la v1910 nous a déjà appris que « rien à faire »
     ne se découvre qu'après avoir tout lu.

     28 SEPT. — LE DRAPEAU NEUF QUE CE PARAGRAPHE ANNONÇAIT. La règle du nom a
     bougé (voir l'en-tête) : la passe se rejoue une fois sur la nouvelle, dans
     les deux sens, et recompte avec elle les pas des activités qui ne sont pas
     un déplacement. L'ancien drapeau `flNomsRejugesV2566` reste en base,
     témoin de la première correction. Le natif l'appelle à chaque montage du
     moteur depuis la v2566 : le drapeau neuf suffit à la relancer, sur tous
     les binaires, par le seul canal du web. */
  var CLE_REJUGE = 'flNomsEtPasRejuges20260928';

  window.flCorrigerAnciensNoms = function () {
    try {
      var fait = false;
      try { fait = !!DB.get(CLE_REJUGE, false); } catch (e) {}
      if (fait) return 'déjà fait';
      var r = window.flRejugerNomsDetectes(120);
      /* LE DRAPEAU SE POSE APRÈS, ET SEULEMENT SI LA PASSE A ABOUTI. Une
         écriture refusée (quota) doit pouvoir être retentée au lancement
         suivant — sinon la correction serait perdue sans que personne ne le
         sache. `flRejugerNomsDetectes` dit « ECHEC · … » dans ce cas. */
      if (/^ECHEC/.test(String(r))) return r;
      /* Les pas APRÈS les noms : une Marche devenue Activité doit être
         recomptée avec son nom neuf, pas avec l'ancien. */
      var r2 = window.flRecompterPasAnciens(120);
      if (/^ECHEC/.test(String(r2))) return r2;
      try { DB.set(CLE_REJUGE, true); } catch (e) {}
      var t = String(r), nl = t.indexOf('\n');
      return (nl < 0 ? t + '\n' + r2 : t.slice(0, nl) + '\n' + r2 + t.slice(nl));
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
