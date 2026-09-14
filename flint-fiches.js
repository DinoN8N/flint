/* ═══════════════════════════════════════════════════════════════════════════
   LES FICHES DE MESURE SOUS LES GRAPHIQUES                     v2215 · v2216

   DINO, LE 4 SEPTEMBRE : « les métriques sont bien, elles sont là, mais elles
   ne sont pas assez expliquées. À l'intérieur des graphiques, en dessous, il
   doit y avoir des explications — pertinentes, et avec un front comme j'en ai
   jamais vu. » Puis, après deux maquettes : « ultra simple », « très
   minimaliste », « ça fait trop IA ».

   CE QUE CE FICHIER POSE, et le parti pris tient en une phrase : ce n'est pas
   une carte, c'est UNE FICHE DE MESURE. FLINT mesure ; son explication se lit
   comme un relevé, pas comme une infographie.

     · UN INSTRUMENT GRADUÉ, pas une barre de progression. Les traits tombent
       sur les heures rondes du cadran, donc on LIT une durée au lieu de
       deviner un pourcentage. Les blocs pleins sont le sommeil, les trous
       sont les réveils, et la règle CONTINUE après la fin de la nuit —
       jusqu'à l'heure où le besoin aurait été couvert. Cette seule image
       porte l'explication ; le texte n'a plus qu'à la nommer.
     · UNE COLONNE DE CONTRIBUTIONS À DROITE : 45,5 + 34,8 + 14,6 − 29
       s'additionnent sous les yeux, sans qu'on écrive « voici l'addition ».
     · UN SEUL MOMENT FORT : le manque, en grand, sous la règle.

   ⚠️ L'INSTRUMENT EST EN HTML, PAS EN SVG. Un SVG étiré en
   `preserveAspectRatio="none"` écrase texte ET traits au facteur de sa boîte —
   mesuré à 0,67× en maquette : les heures devenaient illisibles et les
   graduations disparaissaient. En HTML, les positions sont en pourcent et les
   tailles en pixels : la règle s'étire, sa typographie non.

   ⚠️ LES COULEURS VIENNENT DES JETONS DE LA MAISON (`--ink`, `--ink2`,
   `--faint`, `--line`), redéfinis par `html.fl-dark`. Écrire une teinte en dur
   ici donnerait un bloc juste dans une ambiance et illisible dans l'autre.
   L'accent, lui, vient de la MÉTRIQUE (`cfg.col`) : le jour où cette fiche
   servira à une autre courbe, elle prendra la couleur de cette courbe.

   ⚠️ RIEN N'EST INVENTÉ. Les cinq nombres affichés sortent de
   `flScoreSommeil` — qui rend déjà `{score, couverture, eff, regul, besoin,
   dormi}` — et le tracé sort de `watch_<K>.night.stages`. Si l'un manque, la
   fiche ne paraît pas : une explication approximative est pire qu'aucune.

   ═══ DEUX MÉTRIQUES, DEUX INSTRUMENTS — ET C'EST LE POINT ═════════════════

   Le patron se transpose ; l'instrument, NON. Le score de sommeil est une
   somme pondérée : on peut donc montrer l'addition, et une règle du TEMPS dit
   tout. La récupération est un modèle LOGISTIQUE — ses termes ne s'additionnent
   pas en points, et le moteur l'écrit noir sur blanc : « on ne publie toujours
   PAS de contribution en POINTS […] ce qui est vrai et suffisant, c'est
   l'ORDRE ». Lui inventer une addition serait une jolie fiche et un mensonge.

   Son instrument est donc une ÉCHELLE D'ÉCART : chaque signal placé par rapport
   à TA normale, tous orientés dans le même sens — à droite, le signal soutient
   ta récupération ; à gauche, il la tire vers le bas. Le lecteur n'a plus à
   savoir que la VFC monte quand ça va bien et que la FC de repos fait
   l'inverse : l'axe l'a déjà retourné pour lui.

   ET LES SIGNAUX ABSENTS SE DISENT. Le 4 septembre, trois des cinq n'avaient
   pas été mesurés — un score au milieu s'explique d'abord par là, pas par une
   subtilité de formule. Les dessiner à zéro les ferait passer pour « dans la
   normale » : ils portent un tiret, et la fiche compte à voix haute combien
   ont parlé.

   Liaisons : `tk` se lit NU (garde-liaisons.js) ; tout ce qui vient
   d'ailleurs se teste par `typeof`.
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* Les poids de la formule, relus ici pour l'AFFICHAGE seulement — le calcul,
     lui, reste dans flint-score-sommeil.js et nulle part ailleurs. S'ils y
     changent, le banc `test-fiche-sommeil.js` rougit et cette ligne suit. */
  var P_COUV = 0.7, P_EFF = 0.4, P_REGUL = 0.2, SOCLE = -29, PLAFOND = 1.3;
  /* La normale d'efficacité du moteur (`SOM_EFF_NORMALE`). Recopiée, et
     c'est un risque assumé : la fiche doit pouvoir NOMMER la substitution,
     or le moteur ne publie pas ses constantes. Si elle bouge là-bas, elle
     bouge ici — le banc `test-fiches.js` compare les deux. */
  var EFF_NORMALE = 85;

  function hm(m) {
    if (m == null) return '—';
    m = Math.round(m);
    return Math.floor(m / 60) + ' h ' + String(m % 60).padStart(2, '0');
  }
  function hhmm(m) {
    if (m == null) return '—';
    m = ((Math.round(m) % 1440) + 1440) % 1440;
    return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
  }
  function vir(x, d) {
    if (x == null) return '—';
    return (Math.round(x * Math.pow(10, d)) / Math.pow(10, d)).toFixed(d).replace('.', ',');
  }

  /* ─────────────────────────────────────────────────────────────────────────
     CE QU'IL FAUT POUR DESSINER — et le refus quand il manque quelque chose */
  function matiere(K) {
    var q = null, n = null, w = null;
    try { if (typeof window.flScoreSommeil === 'function') q = window.flScoreSommeil(K); } catch (e) {}
    if (!q || q.score == null || !(q.besoin > 0)) return null;
    try { if (typeof window.sleepNight === 'function') n = window.sleepNight(K); } catch (e) {}
    if (!n || n.asleep == null || n.bedMin == null || n.wakeMin == null) return null;
    try { if (typeof window.watchOf === 'function') w = window.watchOf(K); } catch (e) {}
    var stages = (w && w.night && Array.isArray(w.night.stages)) ? w.night.stages : null;

    var aulit = ((n.wakeMin - n.bedMin) + 1440) % 1440;
    if (!(aulit > 0)) return null;
    return { q: q, n: n, stages: stages, aulit: aulit,
             manque: Math.max(0, q.besoin - q.dormi),
             reveils: stages ? stages.filter(function (s) { return s && s.stage === 'awake'; }).length : null,
             eveilMin: (n.awake != null ? n.awake : null) };
  }

  /* ─────────────────────────────────────────────────────────────────────────
     LES BLOCS DE SOMMEIL — on recolle les stades qui se touchent ; les trous
     qui restent SONT les réveils, et c'est ce qui rend l'efficacité visible
     sans qu'on ait à la dessiner à part. */
  function blocs(stages, aulit) {
    if (!stages || !stages.length) return [[0, aulit]];
    var out = [];
    for (var i = 0; i < stages.length; i++) {
      var s = stages[i];
      if (!s || s.stage === 'awake' || s.durMin == null || s.startMin == null) continue;
      var p = out[out.length - 1];
      if (p && p[0] + p[1] === s.startMin) p[1] += s.durMin;
      else out.push([s.startMin, s.durMin]);
    }
    return out.length ? out : [[0, aulit]];
  }

  /* ═══════════════════════════════════════════════════════════════════════
     LA FICHE DE RÉCUPÉRATION — une échelle d'écart, jamais une addition

     `recovery()` rend déjà tout : `recupEntrees` (les valeurs brutes),
     `recupEcarts` (l'écart à TA normale, en σ) et `recupContrib` (la part de
     chaque signal dans le modèle, SIGNÉE — positif = le signal soutient).
     On ne recalcule rien, on met en ordre.

     L'ORIENTATION EST LA CLÉ DE LECTURE. On place chaque signal par sa
     CONTRIBUTION et non par son écart : la VFC monte quand ça va bien, la FC
     de repos fait l'inverse, et le poids du modèle porte déjà ce signe. Résultat
     : à droite, ça soutient ; à gauche, ça tire vers le bas. Toujours, pour
     tous. Le lecteur n'a plus à retenir le sens de chaque mesure.

     L'ÉCHELLE EST PARTAGÉE, et c'est ce qui rend le dessin honnête : la VFC
     pèse six fois la FC de repos dans le modèle, et ça se VOIT. Un axe par
     mesure, chacun à son échelle, aurait donné cinq signaux d'importance égale
     — joli, et faux. */
  var RECUP_ECHELLE = 1.6;          /* le plus gros terme possible : 0,6135 × 2,5 σ */
  var RECUP_LIGNES = [
    ['vfc',         'Variabilité cardiaque', ' ms',
     'La respiration du système nerveux pendant la nuit. C\'est le signal qui pèse le plus.'],
    ['sommeilMin',  'Sommeil',               '',
     'La nuit qui vient de finir, comparée à tes nuits habituelles.'],
    ['fcRepos',     'FC de repos',           ' bpm',
     'Un cœur reposé bat moins vite. Elle monte quand le corps travaille encore.'],
    ['respiration', 'Respiration',           '/min',
     'Elle s\'accélère quand quelque chose demande de l\'énergie — effort, infection, alcool.'],
    ['temperature', 'Température',           ' °C',
     'Une nuit plus chaude que d\'habitude accompagne une récupération incomplète.']
  ];

  /* ═══════════════════════════════════════════════════════════════════════
     LA FICHE DE L'EFFORT — une charge qui s'additionne, une note qui sature

     DEUX ÉTAGES, ET C'EST TOUTE L'EXPLICATION. La CHARGE s'additionne
     honnêtement : chaque séance apporte `durée × intensité × 1,7`, et la somme
     fait les points du jour. La NOTE, elle, ne s'additionne pas — c'est
     `20 × (1 − e^(−L/520))`, une courbe qui sature. D'où le fait que Dino ne
     comprend pas sans le voir : doubler sa séance ne double pas sa note.

     L'INSTRUMENT EST DONC LA COURBE ELLE-MÊME, avec son point dessus. On y lit
     d'un coup ce qu'aucune phrase ne fait passer : la pente est raide au début
     et plate à la fin, et la place du point dit ce que vaudrait la séance
     suivante.

     ⚠️ LA COURBE EST EN SVG, ET C'EST LE SEUL ENDROIT OÙ C'EST PERMIS. Elle ne
     contient AUCUN texte — que le tracé — et garde son rapport de forme. Un SVG
     étiré écrase sa typographie (payé sur la règle du sommeil) ; sans un mot
     dedans, il n'y a rien à écraser, et tous les libellés vivent en HTML autour. */
  var EFFORT_MAX = 20, EFFORT_TAU = 520;

  /* ─────────────────────────────────────────────────────────────────────────
     L'ACCROCHE. Appelée par la page des graphiques après chaque rendu, comme
     `.flh-hint` et `.flh-read` juste au-dessus. Elle doit donc être BON MARCHÉ
     quand il n'y a rien à faire : on compare la chaîne rendue et on ne touche
     au DOM que si elle a changé. */
  /* ═══════════════════════════════════════════════════════════════════════
     LA MATIÈRE DE LA FICHE — 6 septembre 2026

     ⚠️ POURQUOI CETTE FONCTION EXISTE À CÔTÉ DE `flFiche`. Les fiches ont été
     écrites en HTML, injectées dans la page web des graphiques. Elles étaient
     JUSTES, livrées, et INVISIBLES : l'écran que Dino ouvre depuis la v947 est
     du SwiftUI natif (`DetailHebdoView`), et la page web ne fait plus que
     calculer. Le banc vérifiait leur contenu, jamais qu'elles atteignent un
     écran.

     Le chemin qui marche existait déjà : le web calcule, il met le résultat
     dans la charge de l'écran, le natif dessine. C'est ce que fait la phrase de
     lecture sous le graphe (`lecture`, « construite par le web, jamais ici »).
     Cette fonction rend donc la MATIÈRE — des nombres, des positions, des
     phrases — et rien qui ressemble à du dessin.

     LES POSITIONS SONT DES FRACTIONS DE 0 À 1. Le natif ne connaît ni le besoin
     de la nuit ni l'échelle de la récupération ; il connaît la largeur qu'il a.
     Tout ce qui est « où ça se place » est donc déjà résolu ici, et tout ce qui
     est « à quoi ça ressemble » lui appartient entièrement. */
  function fracs(x) { return Math.max(0, Math.min(1, x)); }

  function dataSommeil(K) {
    var m = matiere(K);
    if (!m) return null;
    var q = m.q, n = m.n, besoin = q.besoin;
    var f = function (x) { return fracs(x / besoin); };

    var segs = blocs(m.stages, m.aulit).map(function (b) {
      return [f(b[0]), f(b[0] + b[1])];
    });
    var ticks = [];
    for (var t = (60 - (n.bedMin % 60)) % 60; t <= besoin; t += 60) ticks.push(f(t));

    /* ⚠️ LA SOMME DOIT FAIRE LE SCORE, SINON CE N'EST PAS UNE EXPLICATION.
       Deux substitutions du moteur rendaient la fiche incompréhensible tant
       qu'on ne les écrivait pas — mesuré sur la nuit du 4 septembre : la fiche
       affichait « Régularité — » et un total de 52,8 sous un score de 71.

         · RÉGULARITÉ ABSENTE : le moteur ne la met pas à zéro, il donne SON
           POIDS à l'efficacité — `(P_EFF + P_REGUL) * eff`. Un tiret laissait
           donc 18 points sans propriétaire.
         · EFFICACITÉ ABSENTE : elle est remplacée par la normale (85), pas
           écartée. Le poids est bien compté, mais sur une valeur qui n'est pas
           la tienne, et il faut le dire.

       On montre donc le report là où il tombe, et on nomme la substitution. */
    var effReel = (q.eff != null), qe = effReel ? q.eff : EFF_NORMALE;
    var regulAbsente = (q.regul == null);
    var poidsEff = (regulAbsente ? (P_EFF + P_REGUL) : P_EFF) * qe;

    var lignes = [
      { nom: 'Couverture', val: q.couverture + ' %', poids: vir(P_COUV * q.couverture, 1),
        note: 'La part de ton besoin que tu as dormie. C\'est la mesure qui pèse le plus lourd.' },
      { nom: 'Efficacité', val: (effReel ? q.eff + ' %' : EFF_NORMALE + ' %'),
        poids: vir(poidsEff, 1),
        note: 'Le sommeil rapporté au temps au lit.'
            + (m.eveilMin != null ? ' Tu as eu ' + m.eveilMin + ' min de réveils'
                 + (m.reveils ? ', en ' + m.reveils + ' fois' : '') + '.' : '')
            + (effReel ? '' : ' Non mesurée cette nuit : le moteur retient la normale.')
            + (regulAbsente ? ' Elle porte aussi le poids de la régularité, faute de'
                            + ' pouvoir la calculer.' : '') },
      { nom: 'Régularité', val: (regulAbsente ? 'non calculée' : String(q.regul)),
        poids: (regulAbsente ? 'reportée' : vir(P_REGUL * q.regul, 1)),
        note: 'La constance de tes horaires d\'une nuit à l\'autre.'
            + (regulAbsente ? ' Il faut plusieurs nuits d\'affilée pour la mesurer ;'
                            + ' son poids est allé à l\'efficacité.' : '') }
    ];

    return {
      cle: 'sleepscore',
      entete: [{ lab: 'Ta nuit', val: hm(q.dormi) },
               { lab: 'Ton besoin', val: hm(besoin) }],
      instrument: {
        genre: 'regle',
        segments: segs,
        /* Où la nuit s'arrête. Après, la règle continue en pointillé : c'est ce
           qui montre le besoin NON couvert, et sans ça le dessin ne dirait que
           « tu as dormi », jamais « il te manquait ça ». */
        fin: f(m.aulit),
        ticks: ticks,
        reperes: [{ x: 0, txt: hhmm(n.bedMin), fort: false, ancre: 'debut' },
                  { x: f(m.aulit), txt: hhmm(n.wakeMin), fort: true, ancre: 'milieu' },
                  { x: 1, txt: hhmm(n.bedMin + besoin), fort: false, ancre: 'fin' }]
      },
      vedette: (m.manque > 0
        ? { val: '−' + hm(m.manque), note: 'Ce qui séparait ta nuit de ton besoin.' }
        : null),
      titreListe: 'Ce qui compose le score',
      lignes: lignes,
      total: { nom: 'Socle', val: vir(SOCLE, 1), score: String(q.score) },
      pied: 'Une nuit courte est plafonnée : celle-ci ne pouvait pas dépasser '
          + Math.floor(PLAFOND * q.couverture) + ', quelle qu\'ait été sa qualité.'
    };
  }

  /* Le répertoire de la MATIÈRE. Il double celui de `flFiche` le temps que les
     trois autres fiches passent au natif ; une clé absente rend `null`, et le
     natif n'affiche alors rien du tout — jamais un cadre vide. */
  /* ─── LA RÉCUPÉRATION ───────────────────────────────────────────────────
     Une ÉCHELLE D'ÉCART, jamais une addition. `recovery()` est un modèle
     logistique : additionner des points serait faux, et le moteur l'écrit
     lui-même. Ce qui est vrai et suffisant, c'est l'ORDRE.

     ⚠️ ON PLACE PAR LA CONTRIBUTION, PAS PAR L'ÉCART. La VFC monte quand ça
     va bien, la FC de repos fait l'inverse, et le poids du modèle porte déjà
     ce signe : à droite ça soutient, à gauche ça tire, pour toutes les
     mesures. Et l'échelle est PARTAGÉE — la VFC pèse six fois la FC de repos,
     et ça se voit. Un axe par mesure aurait donné cinq signaux d'importance
     égale : joli, et faux. */
  function dataRecup(K, off) {
    var r = null;
    try { if (typeof window.recovery === 'function') r = window.recovery(off || 0); } catch (e) {}
    if (!r || r.s == null || !r.recupContrib) return null;
    var ent = r.recupEntrees || {}, ec = r.recupEcarts || {}, ct = r.recupContrib;

    var tN = null;
    try { var so = (typeof window.sensorOf === 'function') ? window.sensorOf(K) : null;
          if (so && so.tempNuit != null) tN = so.tempNuit; } catch (e) {}

    var lignes = RECUP_LIGNES.map(function (L) {
      var cle = L[0];
      var val = (cle === 'temperature') ? tN : ent[cle];
      var c = ct[cle];
      /* Une mesure ABSENTE et une mesure PILE SUR LA NORMALE donnent toutes
         deux une contribution nulle. Les confondre ferait passer un capteur
         muet pour un corps en équilibre : on distingue par la VALEUR. */
      return { cle: cle, nom: L[1], unite: L[2], quoi: L[3], val: val,
               ecart: (ec[cle] == null ? null : ec[cle]),
               ctb: (c == null ? 0 : c), muette: (val == null) };
    });
    var parle = lignes.filter(function (l) { return !l.muette; }).length;
    lignes.sort(function (a, b) {
      if (a.muette !== b.muette) return a.muette ? 1 : -1;
      return Math.abs(b.ctb) - Math.abs(a.ctb);
    });

    var corps = lignes.map(function (l) {
      var soutient = l.ctb > 0.004, tire = l.ctb < -0.004;
      return {
        nom: l.nom,
        val: (l.muette ? '—'
              : (l.cle === 'sommeilMin' ? hm(l.val)
                 : (Math.round(l.val * 10) / 10).toString().replace('.', ',') + l.unite)),
        note: l.quoi,
        /* TROIS SITUATIONS, ET LES CONFONDRE SERAIT MENTIR : rien de mesuré ;
           une valeur qui n'a pas pesé (la température, qui a pourtant une
           normale sur 31 nuits — « sans normale personnelle » y serait faux) ;
           une valeur qui a pesé, et alors on dit de combien. */
        etat: (l.muette ? 'pas mesurée cette nuit'
               : (!soutient && !tire ? 'mesurée, sans effet sur le score'
                  : (l.ecart == null ? ''
                     : (Math.abs(l.ecart) < 0.15 ? 'sur ta normale'
                        : (l.ecart > 0 ? '+' : '−')
                          + Math.abs(l.ecart).toFixed(1).replace('.', ',') + ' σ '
                          + (l.ecart > 0 ? 'au-dessus' : 'en dessous') + ' de ta normale')))),
        muette: l.muette,
        soutient: soutient,
        /* 0 = tout à gauche, 0,5 = ta normale, 1 = tout à droite */
        x: fracs(0.5 + Math.max(-1, Math.min(1, l.ctb / RECUP_ECHELLE)) * 0.5)
      };
    });

    var base = r.recupBase || {};
    return {
      cle: 'recovery',
      entete: [{ lab: 'Récupération', val: (r.s >= 67 ? 'haute' : (r.s >= 34 ? 'modérée' : 'basse')) },
               { lab: '', val: parle + (parle > 1 ? ' signaux' : ' signal') + ' sur 5 mesuré'
                              + (parle > 1 ? 's' : '') }],
      instrument: { genre: 'ecart',
                    gauche: '← tire vers le bas', centre: 'ta normale',
                    droite: 'soutient →', mesures: corps },
      pied: (parle < 5
              ? (5 - parle) + (parle === 4 ? ' mesure manque' : ' mesures manquent')
                + ' quand le bracelet n\'a pas tout livré ; un score proche du milieu vient '
                + 'souvent de là, pas d\'un corps moyen. '
              : '')
          + 'Ces signaux ne s\'additionnent pas en points — le modèle est une courbe, pas une '
          + 'somme. Ce qui est vrai, c\'est l\'ordre : celui du haut a le plus pesé.'
          + (base.jours ? ' Ta normale est bâtie sur ' + base.jours + ' nuit'
               + (base.jours > 1 ? 's' : '') + '.' : '')
    };
  }

  /* ─── L'EFFORT ──────────────────────────────────────────────────────────
     Une charge qui S'ADDITIONNE, une note qui SATURE. C'est toute la fiche :
     sans la courbe, « j'ai fait deux fois plus et j'ai gagné un point » reste
     incompréhensible. */
  function dataEffort(K) {
    var note = null, L = null;
    try { if (typeof window.loadStrain === 'function') note = window.loadStrain(K); } catch (e) {}
    try { if (typeof window.loadOf === 'function') L = window.loadOf(K); } catch (e) {}
    if (note == null || L == null) return null;

    var ses = [];
    try { ses = DB.get('sessions_' + K, []) || []; } catch (e) {}
    var somme = 0;
    var lignes = ses.filter(function (x) { return x && x.type !== 'nap'; })
      .map(function (x) {
        var p = Math.round((x.dur || 0) * (x.int || 2) * 1.7);
        somme += p;
        return { nom: x.name || 'Séance', val: (x.dur || 0) + ' min × ' + (x.int || 2),
                 poids: String(p), note: '' };
      }).sort(function (a, b) { return Number(b.poids) - Number(a.poids); });

    /* D'OÙ VIENT LA CHARGE, ET IL FAUT LE DIRE. `loadOf` prend le PLUS GRAND
       des deux : la somme des séances déclarées, ou ce que la courbe cardiaque
       a crédité. Le lecteur mérite de savoir lequel a parlé pour lui. */
    var sen = null;
    try { if (typeof window.sensorOf === 'function') sen = window.sensorOf(K); } catch (e) {}
    var parCoeur = !!(sen && sen.load && sen.load >= somme);

    /* ⚠️ DEUX SOURCES POUR UNE MÊME CHOSE, ET IL FAUT LE VÉRIFIER.
       La note vient de `loadStrain`, la position du marqueur de `loadOf` —
       deux fonctions, deux chemins. Tant qu'elles s'accordent, la fiche dit
       une seule vérité ; si elles divergent, elle en dirait deux sans le
       montrer : un marqueur à mi-courbe sous une note de 0,0.
       Trouvé au rejeu du 6 septembre, où la phrase promettait « −336 points
       de plus pour gagner un point de note ». Un progrès négatif. */
    var noteCourbe = EFFORT_MAX * (1 - Math.exp(-L / EFFORT_TAU));
    var accord = Math.abs(note - noteCourbe) <= 0.5;

    var pourUnDe = null;
    /* ⚠️ ON NE PROMET UN POINT QUE S'IL EST ATTEIGNABLE. Le seuil était
       `EFFORT_MAX - 0,05` : à 19,9/20, la fiche calculait « 952 points de plus
       pour gagner un point de note » — or on ne peut pas gagner un point
       depuis 19,9. La phrase était vraie sur le nombre et fausse sur ce
       qu'elle promettait. */
    if (accord && note <= EFFORT_MAX - 1) {
      var cible = Math.min(EFFORT_MAX - 0.01, note + 1);
      var reste = Math.round(-EFFORT_TAU * Math.log(1 - cible / EFFORT_MAX) - L);
      /* Un reste NÉGATIF n'a pas de sens à l'écran : on préfère ne rien
         promettre plutôt que promettre l'impossible. */
      if (reste > 0) pourUnDe = reste;
    }

    var LMAX = 1600;                 /* ≈ 19,2/20 : la queue plate de la courbe */
    var pts = [];
    for (var i = 0; i <= 40; i++) {
      var l = LMAX * i / 40;
      pts.push([i / 40, (EFFORT_MAX * (1 - Math.exp(-l / EFFORT_TAU))) / EFFORT_MAX]);
    }

    return {
      cle: 'charge',
      entete: [{ lab: 'Ta note', val: vir(note, 1) + ' / 20' },
               { lab: 'Ta charge', val: Math.round(L) + ' pts' }],
      instrument: { genre: 'courbe', points: pts,
                    x: fracs(L / LMAX),
                    y: (EFFORT_MAX * (1 - Math.exp(-Math.min(L, LMAX) / EFFORT_TAU))) / EFFORT_MAX,
                    gauche: '0', droite: '1 600 points' },
      pied: 'La charge s\'additionne, la note NON : elle sature. '
          + (!accord
              ? 'Ta note et ta charge viennent de deux mesures qui ne s\'accordent pas '
                + 'aujourd\'hui : le point ci-dessus place la charge, pas la note.'
              : (pourUnDe != null
                  ? 'Ici, il te faudrait ' + pourUnDe + ' points de plus pour gagner un '
                    + 'point de note — et deux fois plus pour le suivant.'
                  : 'Tu es tout en haut de la courbe : au-delà, la note ne bouge presque '
                    + 'plus.'))
          + (parCoeur
              ? ' Cette charge vient de ta COURBE CARDIAQUE, plus généreuse ici que tes séances '
                + 'déclarées.'
              : ''),
      titreListe: (lignes.length ? 'Ce qui a fait la charge' : null),
      lignes: (lignes.length ? lignes : null),
      total: (lignes.length ? { nom: 'durée × intensité × 1,7', val: '', score: String(somme) }
                            : null)
    };
  }

  /* ─── LES CALORIES ──────────────────────────────────────────────────────
     Une PILE : trois parts d'un même total. Le fait qui compte tient en une
     phrase — l'essentiel part à ne rien faire, et bouger AJOUTE sans
     remplacer. */
  function dataCalories(K) {
    var d = null;
    try { if (typeof window.flCaloriesDetail === 'function') d = window.flCaloriesDetail(K); }
    catch (e) {}
    if (!d || d.vide || d.total == null) return null;
    var base = (d.metaBaseVecue != null) ? d.metaBaseVecue
             : (d.metaBase != null ? d.metaBase : null);
    if (base == null) return null;
    var tot = d.total, marche = d.marche || 0, effort = d.effort || 0;
    var mil = function (x) { return String(Math.round(x)).replace(/\B(?=(\d{3})+(?!\d))/g, ' '); };
    var part = function (x) { return fracs(Math.max(0, x) / Math.max(1, tot)); };

    var parts = [
      ['Métabolisme de base', base,
       'Ce que ton corps brûle sans rien faire'
       + (d.partJour != null ? ', sur les ' + d.partJour + ' % de journée écoulés' : '')
       + (d.metaBase != null ? ' — ' + mil(d.metaBase) + ' kcal sur une journée entière.' : '.')],
      ['Marche', marche, 'Tes pas hors séance : le fond de ta journée.'],
      ['Effort', effort,
       'Tes séances' + (d.minutesEffort ? ', ' + d.minutesEffort + ' minutes créditées' : '') + '.']
    ].filter(function (p) { return p[1] > 0; });

    return {
      cle: 'kcalOut',
      entete: [{ lab: 'Dépense du jour', val: mil(tot) + ' kcal' }],
      instrument: { genre: 'pile',
                    parts: parts.map(function (p, i) {
                      return { nom: p[0], part: part(p[1]), pale: (i === 0) };
                    }) },
      vedette: { val: Math.round(base / Math.max(1, tot) * 100) + ' %',
                 note: 'de ta dépense part à ne rien faire. Bouger ajoute, ça ne remplace pas.' },
      titreListe: 'Ce qui compose la dépense',
      lignes: parts.map(function (p) {
        return { nom: p[0], val: mil(p[1]) + ' kcal', poids: '', note: p[2] };
      })
    };
  }

  /* LA PORTE DE L'ÉCRAN — 6 septembre 2026.

     ⚠️ ELLE VIT ICI ET PAS DANS `index.html`, ET CE N'EST PAS UN DÉTAIL DE
     RANGEMENT. Le cliquet du découpage web a refusé les neuf lignes que ce
     travail y ajoutait : « le code neuf a un métier, il va dans un fichier
     flint-<métier>.js ». Le moteur est à deux lignes de son plafond, en
     permanence — toute logique nouvelle doit sortir, et celle-ci a un métier
     clair. `index.html` n'en garde que l'appel.

     Elle prend l'OFFSET de jour de l'écran (le dernier jour de la fenêtre
     regardée) et rend la matière de la fiche pour cette journée-là : c'est la
     nuit que Dino a sous les yeux, pas celle d'aujourd'hui. */
  window.flFichePour = function (cle, off) {
    try {
      if (typeof tk !== 'function') return null;
      /* ⚠️ `tk` PREND UN DÉCALAGE DE JOURS, PAS UNE DATE. Sa signature est
         `tk(off)` : il part d'aujourd'hui et ajoute l'offset. Cette porte
         lui passait le résultat de `flhDate` — un objet Date là où un nombre
         est attendu — et rendait « NaN-NaN-NaN » à chaque appel. La fiche était
         donc TOUJOURS nulle, du 6 au 7 septembre, sur les quatre métriques.

         Ce qui a rendu la faute invisible : le banc et l'outil de rejeu
         appelaient `flFicheData` DIRECTEMENT, avec une clé de jour propre. Ils
         éprouvaient la pièce et jamais la porte — et la porte était le seul
         morceau que l'écran traverse. `test-fiches.js` passe désormais par
         `flFichePour`. */
      var K = tk(off || 0);
      if (!K || K.indexOf('NaN') >= 0) return null;
      return window.flFicheData(cle, K, off);
    } catch (e) { return null; }
  };

  window.flFicheData = function (cle, K, off) {
    try {
      if (!K) return null;
      if (cle === 'sleepscore') return dataSommeil(K);
      if (cle === 'recovery')   return dataRecup(K, off);
      if (cle === 'charge')     return dataEffort(K);
      if (cle === 'kcalOut')    return dataCalories(K);
      return null;
    } catch (e) { return null; }
  };

})();
