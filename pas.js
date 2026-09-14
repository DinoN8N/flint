/* ════════════════════════════════════════════════════════════════════════════
   LES PAS DOUBLES — la regle qui reconnait une tranche deja recue.

   CE QUI S EST PASSE, ET IL EST MESURE. Du 12 au 26 aout 2026, EXACTEMENT
   cinquante pour cent des pas de chaque journee etaient des fantomes. Chaque
   bloc de la montre etait ecrit DEUX FOIS : une fois a son heure, une fois
   deux heures plus tard, avec le meme total et la meme repartition minute par
   minute. Le 23 aout, 61 pas [38,23,0...] a 08:09 et les memes 61 pas
   [38,23,0...] a 10:09.

   Preuve sur le releve du depot (releves/donnees-dino-2026-08-24.json) :

     jour        affiche   fantomes    reel    WHOOP
     20 aout      26 573     13 210   13 363   20 706
     21 aout      19 046      9 523    9 523    9 412
     22 aout      22 778     11 389   11 389   12 330
     23 aout      30 671     15 327   15 344   16 255

   Une fois les fantomes retires, FLINT et WHOOP tombent d accord a quelques
   pour cent — l ecart normal entre deux capteurs a deux poignets. L ecart
   n etait pas une difference de definition, c etait un doublon.

   POURQUOI LA DEDUPLICATION EN PLACE NE LE VOYAIT PAS. Elle existait, et son
   commentaire promettait meme exactement cette garantie : « recevoir deux fois
   la meme tranche ne change alors rien ». Elle indexait les blocs par leur
   HORODATAGE. C est juste tant que la meme tranche revient avec le meme
   horodatage — et ici elle revient avec deux horodatages distants de deux
   heures. Deux cles, deux entrees, et le total est la somme des deux.

   LA CAUSE DES DEUX HORODATAGES EST EN AMONT DE CE CODE — le SDK du bracelet
   ou l horloge de la montre. Elle n est PAS tranchee a ce jour. C est
   precisement pourquoi cette regle ne suppose rien d elle : elle ne connait ni
   les deux heures, ni le sens du decalage. Elle les MESURE dans la journee
   qu on lui donne.

   ═══ LA REGLE, ET SES DEUX VERROUS ══════════════════════════════════════════

   Deux blocs identiques ne suffisent PAS a conclure. Une journee ordinaire
   porte des blocs pauvres qui se ressemblent legitimement : [12,0,0,0,0,0,0,0,
   0,0] peut arriver deux fois dans la meme journee sans que personne ait
   triche. Retirer sur la seule egalite du contenu detruirait de vrais pas.

   On exige donc DEUX choses ensemble :

     1. un DECALAGE COMMUN. Le meme ecart de temps doit relier plusieurs paires
        de blocs jumeaux dans la journee. Un doublon systematique produit un
        decalage systematique ; une coincidence n en produit pas.
     2. une EMPREINTE RICHE. Le contenu doit porter de l information : au moins
        deux minutes non nulles, ou un total qui n est pas trivial. Un bloc
        pauvre ne peut jamais, a lui seul, justifier un retrait.

   ET ON GARDE LA COPIE LA PLUS TOT. Ce n est pas un choix d elegance, c est une
   MESURE : sur les quatre journees du releve, la frequence cardiaque monte
   pendant la copie tot dans 56 cas contre 15. La copie tardive ne correspond a
   aucun effort du coeur — elle n a pas eu lieu.

   CE QUE CE MODULE NE FAIT PAS : il ne lit pas la base, il n ecrit rien, il ne
   connait pas le stockage. On lui donne une liste de blocs, il rend une liste
   de blocs. C est ce qui le rend eprouvable au banc, sur les vraies donnees.
   ════════════════════════════════════════════════════════════════════════════ */
(function (racine) {
  'use strict';

  /* Le nombre minimum de paires qui doivent partager le meme decalage pour
     qu on parle d un doublon systematique et non d une coincidence.

     DEUX, ET PAS UN. Un seul couple de blocs identiques arrive pour de vrai :
     deux fois le meme aller-retour dans un couloir, a deux moments differents,
     donne deux blocs jumeaux sans aucun doublon. Il faut donc au moins deux
     couples qui partagent le MEME ecart pour qu un mecanisme soit en cause.
     Sur les journees mesurees, le decalage reel relie entre 46 et 62 paires :
     on est trois ordres de grandeur au-dessus de ce plancher. */
  var PAIRES_MINIMUM = 2;

  /* Le decalage doit valoir au moins une minute : deux blocs a quelques
     secondes d ecart sont deux lectures du meme instant, pas un doublon
     horaire, et ce cas-la se traite par l horodatage comme avant. */
  var DECALAGE_MINIMUM = 60;

  /* ═══ DEUX LECTURES DU MEME BLOC, ET IL FAUT LES DEUX ═══════════════════

     LA SIGNATURE apparie : deux blocs de meme signature portent la meme mesure.
     L EMPREINTE temoigne : elle n existe que si le bloc est assez riche pour
     qu une egalite ne puisse pas etre un hasard.

     LA DIFFERENCE EST TOUT LE SUJET, et le banc l a trouvee. Une premiere
     version n avait que l empreinte et s en servait pour les deux roles : elle
     etablissait le decalage ET decidait de chaque retrait. Resultat, les blocs
     pauvres doubles restaient en base — 186 pas fantomes le 23 aout, 353 le 22.
     Le verrou etait au mauvais endroit.

     UNE FOIS LE DECALAGE ETABLI par les blocs riches, il n y a plus de doute a
     avoir : un bloc pauvre qui possede un jumeau EXACT a ce decalage precis est
     lui aussi une copie. Le hasard ne se range pas sur un ecart qu on vient de
     mesurer ailleurs. */
  function signature(bloc) {
    if (!bloc || !Array.isArray(bloc)) return null;
    var pas = +bloc[1] || 0;
    var minutes = Array.isArray(bloc[3]) ? bloc[3] : null;
    if (pas <= 0) return null;      /* un bloc a zero pas ne pese sur aucun total */
    if (!minutes) return null;      /* sans repartition, on ne conclut jamais */
    return pas + '|' + minutes.join(',');
  }

  /* L empreinte d un bloc : ce qui a ete mesure, jamais quand.
     `null` quand le bloc est trop pauvre pour temoigner de quoi que ce soit. */
  function empreinte(bloc) {
    if (!bloc || !Array.isArray(bloc)) return null;
    var pas = +bloc[1] || 0;
    var minutes = Array.isArray(bloc[3]) ? bloc[3] : null;
    if (pas <= 0) return null;                   /* un bloc a zero pas ne pese rien */
    if (!minutes) return null;                   /* sans repartition, on ne conclut pas */
    var pleines = 0;
    for (var i = 0; i < minutes.length; i++) if ((+minutes[i] || 0) > 0) pleines++;
    if (pleines < 2) return null;                /* trop pauvre : peut arriver deux fois */
    return pas + '|' + minutes.join(',');
  }

  /* LE DECALAGE DE LA JOURNEE. On compte, pour chaque ecart de temps observe
     entre deux blocs de meme empreinte, combien de paires le partagent. Le plus
     represente gagne, a condition d atteindre le plancher.

     Rend 0 quand aucun decalage ne domine — c est-a-dire quand la journee est
     saine, et alors rien ne sera retire. */
  function decalageDominant(blocs) {
    var parEmpreinte = {}, i, e;
    for (i = 0; i < blocs.length; i++) {
      e = empreinte(blocs[i]);
      if (!e) continue;
      (parEmpreinte[e] = parEmpreinte[e] || []).push(+blocs[i][0] || 0);
    }
    var compte = {};
    Object.keys(parEmpreinte).forEach(function (cle) {
      var ts = parEmpreinte[cle].slice().sort(function (a, b) { return a - b; });
      for (var a = 0; a < ts.length; a++) {
        for (var b = a + 1; b < ts.length; b++) {
          var d = ts[b] - ts[a];
          if (d >= DECALAGE_MINIMUM) compte[d] = (compte[d] || 0) + 1;
        }
      }
    });
    var meilleur = 0, n = 0;
    Object.keys(compte).forEach(function (d) {
      if (compte[d] > n) { n = compte[d]; meilleur = +d; }
    });
    return n >= PAIRES_MINIMUM ? meilleur : 0;
  }

  /* ═══ v1900 — LA REGLE SORT DES PAS, PARCE QU ELLE N EN ETAIT PAS UNE ═════

     Le meme defaut a frappe LE SOMMEIL, avec le meme decalage de 7200 s et
     pour la meme raison : `flsPoserTranche` dedupliquait par
     `c.start === tranche.start`, donc une tranche identique arrivee deux
     heures plus tard passait pour neuve. 23 paires de tranches strictement
     identiques dans la base de Dino, TOUTES a 7200 s d ecart, aucun autre
     ecart. La nuit du 19 au 20 aout affichait 7 h 30 de sommeil au lieu de
     6 h 11, et un coucher a 22 h 48 au lieu de 00 h 44.

     La regle n avait donc rien de propre aux pas : elle sait reconnaitre UNE
     MEME MESURE REVENUE DEUX FOIS SOUS DEUX HORLOGES. On la sort ici, telle
     quelle, avec ses deux verrous — decalage commun a plusieurs paires,
     empreinte assez riche pour qu une egalite ne soit pas un hasard.

     L APPELANT DIT CE QU IL SAIT, ET RIEN DE PLUS :
       instantDe(x) — ou l element se place dans le temps
       contenuDe(x) — ce qui a ete mesure, jamais quand. `null` = inapariable.
       estRiche(x)  — ce contenu peut-il, a lui seul, etablir un decalage ?
                      Sans cette fonction, tout contenu apariable est riche. */
  function nettoyerSerie(items, instantDe, contenuDe, estRiche) {
    var liste = (items || []).filter(function (x) { return x != null; })
                             .slice()
                             .sort(function (a, b) { return instantDe(a) - instantDe(b); });
    var riche = estRiche || function () { return true; };

    /* 1 · le decalage, mesure sur les seuls elements RICHES */
    var parEmpreinte = {}, i, c;
    for (i = 0; i < liste.length; i++) {
      c = contenuDe(liste[i]);
      if (c == null || !riche(liste[i])) continue;
      (parEmpreinte[c] = parEmpreinte[c] || []).push(instantDe(liste[i]));
    }
    var compte = {};
    Object.keys(parEmpreinte).forEach(function (cle) {
      var ts = parEmpreinte[cle].slice().sort(function (x, y) { return x - y; });
      for (var a = 0; a < ts.length; a++)
        for (var b = a + 1; b < ts.length; b++) {
          var d = ts[b] - ts[a];
          if (d >= DECALAGE_MINIMUM) compte[d] = (compte[d] || 0) + 1;
        }
    });
    var decalage = 0, n = 0;
    Object.keys(compte).forEach(function (d) {
      if (compte[d] > n) { n = compte[d]; decalage = +d; }
    });
    if (n < PAIRES_MINIMUM) return { items: liste, retires: 0, decalage: 0 };

    /* 2 · les chaines, et la premiere moitie survit (voir plus bas) */
    var parContenu = {};
    for (i = 0; i < liste.length; i++) {
      c = contenuDe(liste[i]);
      if (c != null) (parContenu[c] = parContenu[c] || []).push(instantDe(liste[i]));
    }
    var aRetirer = {};
    Object.keys(parContenu).forEach(function (cle) {
      var ts = parContenu[cle].slice().sort(function (x, y) { return x - y; });
      var pris = {};
      for (var a = 0; a < ts.length; a++) {
        if (pris[ts[a]]) continue;
        var chaine = [ts[a]], t = ts[a];
        while (ts.indexOf(t + decalage) >= 0) { t = t + decalage; chaine.push(t); }
        chaine.forEach(function (x) { pris[x] = true; });
        var vrais = Math.ceil(chaine.length / 2);
        for (var k = vrais; k < chaine.length; k++) aRetirer[cle + '@' + chaine[k]] = true;
      }
    });
    var garde = [], retires = 0;
    for (i = 0; i < liste.length; i++) {
      c = contenuDe(liste[i]);
      if (c != null && aRetirer[c + '@' + instantDe(liste[i])]) { retires++; continue; }
      garde.push(liste[i]);
    }
    return { items: garde, retires: retires, decalage: decalage };
  }

  /* LES TRANCHES DE SOMMEIL — le meme defaut, la meme regle.
     Une tranche est apariable des qu elle porte des stades ; elle n est RICHE
     qu a partir de dix minutes, parce qu une tranche tres courte peut se
     repeter a l identique sans que personne ait triche. */
  function nettoyerTranches(tranches) {
    var r = nettoyerSerie(tranches,
      function (c) { return +c.start || 0; },
      function (c) {
        var st = (c && c.stages) || [];
        return st.length ? st.length + '|' + st.join(',') : null;
      },
      function (c) { return ((c && c.stages) || []).length >= 10; });
    return { tranches: r.items, retires: r.retires, decalage: r.decalage };
  }

  /* LA REGLE, ENTIERE. Rend { blocs, retires, pas, decalage } :
       blocs    — la journee nettoyee, triee, la copie TOT gardee
       retires  — combien de blocs sont partis
       pas      — combien de pas ils portaient
       decalage — l ecart mesure, 0 si la journee etait saine

     Elle est SANS EFFET sur une journee saine : meme liste, retires = 0. C est
     ce qui permet de la poser sur le chemin d entree sans rien risquer. */
  function nettoyer(blocs) {
    var liste = (blocs || []).filter(function (b) { return Array.isArray(b); })
                             .slice()
                             .sort(function (x, y) { return (+x[0] || 0) - (+y[0] || 0); });
    var d = decalageDominant(liste);
    if (!d) return { blocs: liste, retires: 0, pas: 0, decalage: 0 };

    /* ═══ ON RAISONNE PAR CHAINES, ET LE 20 AOUT A IMPOSE CA ═══════════════

       Le cas, et il est reel. Ce jour-la, DEUX blocs legitimement identiques
       existaient a 08:34 et 10:34 — 153 pas, [61,46,46,0...] : une vraie
       coincidence, deux fois le meme trajet. Le fantome de celui de 08:34 est
       tombe PILE sur 10:34, et la deduplication par horodatage les a fondus en
       un seul. La journee stockee portait donc une CHAINE de trois blocs
       identiques espaces du decalage — 08:34, 10:34, 12:34 — pour deux vrais.

       Une regle qui se contente de retirer un bloc quand son jumeau precedent
       a survecu garde alors le mauvais maillon : elle laisse 08:34 et 12:34.
       Le TOTAL reste juste, mais un bloc se retrouve deux heures trop tard —
       assez pour deplacer une marche detectee, et pour faire basculer un bloc
       de fin de soiree dans le mauvais jour.

       LA REGLE JUSTE SE LIT SUR LA CHAINE ENTIERE. Le defaut a copie CHAQUE
       vrai bloc une fois : une chaine de n blocs identiques et regulierement
       espaces vient donc de ceil(n / 2) vrais, et ce sont LES PLUS TOT. Une
       chaine de 2 rend 1, une chaine de 3 rend 2, un bloc seul reste seul.

       C est verifiable, et c est verifie : le banc reconstitue les 21 journees
       du releve d avant le defaut BLOC PAR BLOC, horodatages compris. */
    var parSignature = {}, i, b, e;
    for (i = 0; i < liste.length; i++) {
      e = signature(liste[i]);
      if (e) (parSignature[e] = parSignature[e] || []).push(+liste[i][0] || 0);
    }
    var aRetirer = {};
    Object.keys(parSignature).forEach(function (cle) {
      var ts = parSignature[cle].slice().sort(function (x, y) { return x - y; });
      var pris = {};
      for (var a = 0; a < ts.length; a++) {
        if (pris[ts[a]]) continue;
        /* la chaine qui part d ici : chaque maillon au decalage du precedent */
        var chaine = [ts[a]], t = ts[a];
        while (ts.indexOf(t + d) >= 0) { t = t + d; chaine.push(t); }
        chaine.forEach(function (x) { pris[x] = true; });
        var vrais = Math.ceil(chaine.length / 2);
        for (var k = vrais; k < chaine.length; k++) aRetirer[cle + '@' + chaine[k]] = true;
      }
    });
    var garde = [], retires = 0, pasRetires = 0;
    for (i = 0; i < liste.length; i++) {
      b = liste[i]; e = signature(b);
      if (e && aRetirer[e + '@' + (+b[0] || 0)]) {
        retires++; pasRetires += (+b[1] || 0); continue;
      }
      garde.push(b);
    }
    return { blocs: garde, retires: retires, pas: pasRetires, decalage: d };
  }

  /* Le total d une journee, recalcule depuis ses blocs. Un seul endroit sait
     additionner des pas — sinon l affichage et le stockage divergent le jour ou
     l un des deux change. */
  function total(blocs) {
    var s = 0;
    (blocs || []).forEach(function (b) { if (Array.isArray(b)) s += (+b[1] || 0); });
    return Math.round(s);
  }

  /* ═══ LES PAQUETS ÉTALÉS D'APPLE SANTÉ ════════════════════════════════════

     CE QUE C EST. Une app tierce ecrit dans Sante le TOTAL d une periode en un
     seul echantillon — une journee, une sortie, plusieurs heures. HealthKit,
     interroge par tranches, ne rend pas ce total d un bloc : il l ETALE au
     prorata sur toutes les tranches que l echantillon recouvre. On voit alors
     la meme valeur, fractionnaire, se repeter tranche apres tranche pendant
     des heures.

     LA SIGNATURE, ET POURQUOI ELLE NE PEUT PAS ETRE UN VRAI PODOMETRE :
       · la valeur est FRACTIONNAIRE — un podometre compte des pas entiers ;
       · elle est IDENTIQUE d une tranche a la suivante, au millieme ;
       · et ca dure plus d un quart d heure. Personne ne marche a cadence
         constante fractionnaire pendant trois heures.

     MESURE, ET C EST CE QUI A FAIT ECRIRE CETTE REGLE. Le 24 aout 2026 :
     56,26 pas repetes sur 160 tranches. Le 25 : 62,07 sur 214 — le paquet
     deborde meme sur minuit. Temoin sain, le 20 aout, avant que la source
     n apparaisse : 101 tranches, aucune repetition. Et depuis le 24 aout le
     paquet revient TOUS LES JOURS : 8 045, 12 695, 9 016, 9 334, 9 487 pas.
     Une fois retire, le podometre de l iPhone et le bracelet FLINT tombent
     d accord a moins de 10 % sur chacun de ces jours — deux capteurs
     independants, l un au poignet, l autre en poche.

     ON JETTE LE PAQUET ENTIER, JAMAIS UNE TRANCHE ISOLEE. Retirer tranche par
     tranche laisserait les bords du paquet, qui sont exactement aussi faux que
     son milieu. Et un vrai iPhone n est jamais touche : ses tranches varient a
     chaque fois, donc aucune chaine ne se forme.

     `largeur` est la largeur d une tranche en minutes — cinq, celle que
     `FlintSante.pasTranche` produit. Elle sert a deux choses : reconnaitre
     deux tranches VOISINES, et mesurer la duree d une chaine.

     Rend { tranches, jetes, paquets } — `jetes` est le nombre de pas retires,
     pour qu un ecran puisse dire ce qu il a refuse au lieu de le taire. */
  function sansEtalement(tranches, largeur) {
    var L = largeur > 0 ? largeur : 5;
    var liste = (tranches || []).slice().sort(function (a, b) {
      return (+a[0] || 0) - (+b[0] || 0);
    });
    var garde = [], jetes = 0, paquets = 0, i = 0;
    while (i < liste.length) {
      var j = i;
      /* la chaine : des tranches voisines qui portent toutes la valeur de la
         premiere. `<= L` et pas `=== L` : une tranche vide n est pas ecrite du
         tout par HealthKit, et une chaine reste une chaine si elle en saute. */
      while (j + 1 < liste.length
             && (+liste[j + 1][0] || 0) - (+liste[j][0] || 0) <= L
             && Math.abs((+liste[j + 1][1] || 0) - (+liste[i][1] || 0)) < 0.005) j++;
      var duree = ((+liste[j][0] || 0) - (+liste[i][0] || 0)) + L;
      var v = +liste[i][1] || 0;
      var frac = Math.abs(v - Math.round(v)) > 0.005;
      if (duree >= 15 && frac) {
        paquets++;
        for (var q = i; q <= j; q++) jetes += (+liste[q][1] || 0);
      } else {
        for (var q2 = i; q2 <= j; q2++) garde.push(liste[q2]);
      }
      i = j + 1;
    }
    return { tranches: garde, jetes: Math.round(jetes), paquets: paquets };
  }

  /* ═══ LA CADENCE IMPOSSIBLE — l autre forme du meme defaut ════════════════

     TROUVEE LE 29 AOUT, EN VERIFIANT LE FILTRE PRECEDENT. Le 9 aout, Sante
     annoncait 29 039 pas quand le bracelet en comptait 12 893, et
     `sansEtalement` ne retirait RIEN : aucune valeur repetee, aucune chaine.
     Six tranches portaient a elles seules 16 070 pas :

        18h20   4 150 pas en 5 min  =  830 pas/min
        16h20   3 320                  664
        11h35   2 846                  569
        12h20   2 224                  445
        19h05   1 890                  378
        11h45   1 640                  328

     C est le MEME defaut sous une autre forme : une app tierce ecrit le total
     d une periode entiere, mais dans un echantillon COURT — HealthKit n a donc
     rien a etaler, il pose le paquet dans une seule tranche. Une regle qui ne
     cherche que des repetitions passe a cote.

     LE SEUIL EST MESURE, PAS CHOISI. Sur les 4 533 tranches Sante du releve,
     les cadences vont jusqu a 210 pas/min — une vraie course, le 12 aout, une
     heure quarante durant — puis SAUTENT a 328. Le vide entre 210 et 328 est
     total. Le bracelet, lui, sur plus de treize mille cases d une minute, n a
     jamais depasse 166. On coupe a 220 : au milieu du vide, au-dessus de toute
     foulee humaine tenue cinq minutes, et loin des 210 qu il faut garder.

     PREUVE QUE LA COUPE EST JUSTE : une fois ces six tranches retirees, le
     9 aout rend 12 969 pas cote iPhone contre 12 893 au bracelet. Deux
     capteurs independants a 0,6 % l un de l autre.

     ON NE RABOTE PAS, ON JETTE. Ramener la tranche au plafond fabriquerait
     1 100 pas qui n ont pas ete faits ; on ne sait pas ce qu il y avait
     dedans, donc on ne garde rien. */
  var CADENCE_MAX = 220;

  function sansCadenceImpossible(tranches, largeur, plafond) {
    var L = largeur > 0 ? largeur : 5;
    var max = plafond > 0 ? plafond : CADENCE_MAX;
    var garde = [], jetes = 0, coupees = 0;
    (tranches || []).forEach(function (t) {
      var v = +t[1] || 0;
      if (v / L > max) { coupees++; jetes += v; return; }
      garde.push(t);
    });
    return { tranches: garde, jetes: Math.round(jetes), coupees: coupees };
  }

  /* LES DEUX NETS, DANS L ORDRE, ET UN SEUL POINT D ENTREE POUR LES LECTEURS.
     Le canal Sante a deux lecteurs — le comblement des calories et le repli
     d affichage des pas. Qu ils appellent la meme chose est ce qui empeche
     l un de proteger et l autre pas : c est exactement ce qui est arrive
     entre la v2016 et la v2021. */
  function santePropre(tranches, largeur) {
    var a = sansEtalement(tranches, largeur);
    var b = sansCadenceImpossible(a.tranches, largeur);
    return { tranches: b.tranches, jetes: a.jetes + b.jetes,
             paquets: a.paquets, coupees: b.coupees };
  }

  /* ═══ QUELLE SOURCE POUR LA JOURNEE — v2022 ═══════════════════════════════

     LE DEFAUT. `flStepsOf` ne regardait Sante que si le bracelet etait a
     EXACTEMENT zero. Marcher 8 000 pas avec son telephone pendant que le
     bracelet en attrape 500 — batterie a plat en milieu de journee, synchro en
     retard, bracelet mal serre — et l ecran affiche 500, sans jamais regarder
     les 8 000 que Sante avait. Cas mesure : le 27 aout a 14h27, le bracelet
     portait 592 pas sur TROIS heures ; la journee s est terminee a 8 629.

     CE QU ON NE FAIT PAS, ET C EST MESURE. On ne comble PAS les trous du
     bracelet avec les tranches de l iPhone, comme le moteur de calories le
     fait pour son propre compte. Simule sur les vraies journees, ca
     sur-compte : le 12 aout passerait de 24 547 a 30 199 pas quand WHOOP en
     annonce 23 608, et le 8 aout prendrait +6 116. Le silence du bracelet veut
     donc bien dire « pas de pas » la plupart du temps. On CHOISIT une source
     pour la journee, on n additionne jamais les deux.

     LES DEUX CONDITIONS, ET IL LES FAUT TOUTES LES DEUX. Sur 27 journees
     reelles portant les deux canaux :

        heures couvertes bracelet / iPhone :  min 0,78   mediane 1,06   max 1,33
        pas iPhone / pas bracelet          :  min 0,40   mediane 0,88   max 1,03

     Le bracelet ne couvre JAMAIS beaucoup moins de journee que le telephone,
     et le telephone ne compte JAMAIS beaucoup plus de pas. On bascule donc
     quand les deux sont vrais a la fois : couverture sous 0,50 (le pire jour
     reel est a 0,78) ET pas au-dessus de 1,50 (le pire jour reel est a 1,03).
     Deux marges larges, dans deux directions independantes.

     LE 27 AOUT TRONQUE PASSE LES DEUX : 3 heures contre 15 (0,20) et 14 fois
     plus de pas. Aucune journee normale n en passe une seule.

     ET LA JOURNEE EN COURS NE SE FAIT PAS PIEGER : la regle compare les deux
     sources SUR LE MEME JOUR. A 8 h du matin, le bracelet et le telephone sont
     tous les deux courts, le rapport reste proche de 1, et rien ne bascule.
     C est ce qui distingue « le bracelet a rate la journee » de « la journee
     n est pas finie » — un ecart absolu ne saurait pas les separer. */
  var COUVERTURE_BASCULE = 0.50;
  var ECART_BASCULE = 1.50;

  function arbitrerPas(hBracelet, pasBracelet, hIphone, pasIphone) {
    var r = { source: 'bracelet', pas: Math.round(pasBracelet || 0),
              couverture: null, ecart: null, raison: 'le bracelet a couvert la journee' };
    /* Le bracelet muet : le repli d avant, garde tel quel. Un zero qui ment est
       pire qu une source imparfaite. */
    if (!(pasBracelet > 0)) {
      if (pasIphone > 0) return { source: 'iphone', pas: Math.round(pasIphone),
                                  couverture: 0, ecart: null,
                                  raison: 'le bracelet n a rien rendu ce jour-la' };
      return r;
    }
    if (!(pasIphone > 0) || !(hIphone > 0)) return r;
    var couv = hBracelet / hIphone, ec = pasIphone / pasBracelet;
    r.couverture = couv; r.ecart = ec;
    if (couv < COUVERTURE_BASCULE && ec > ECART_BASCULE) {
      return { source: 'iphone', pas: Math.round(pasIphone),
               couverture: couv, ecart: ec,
               raison: 'le bracelet n a couvert que ' + hBracelet + ' h sur ' + hIphone };
    }
    return r;
  }

  /* Les heures distinctes qu une serie touche. On la donne ici pour que les
     deux cotes la comptent PAREIL — une couverture mesuree de deux façons
     n arbitre rien. `minutes` est une liste de minutes du jour (0-1439). */
  function heuresCouvertes(minutes) {
    var h = {}, n = 0;
    (minutes || []).forEach(function (m) {
      var i = Math.floor(m / 60);
      if (i >= 0 && i < 24 && !h[i]) { h[i] = 1; n++; }
    });
    return n;
  }

  /* ═══ « TU AS PEU MARCHÉ » N EST PAS « JE N AI PAS ENCORE REÇU » — v2023 ══

     LE DEFAUT, ET C EST CELUI QUI A LANCE TOUT CE CHANTIER. Dino, le 29 aout :
     « le nombre de pas est un peu aleatoire ». Il ne l est pas — il est la
     somme exacte de ses blocs, verifiee sur trente jours. Mais il MONTE
     pendant des heures apres coup, et rien a l ecran ne le dit. Deux chiffres
     differents pour la meme journee, sans explication : n importe qui en
     conclut que le compteur delire.

     COMBIEN DE TEMPS UNE JOURNEE MET-ELLE A ARRIVER ? Mesure sur les dix
     releves successifs du depot, part du total FINAL deja presente :

        le jour meme   part mediane  87 %   complet (>=99 %) :  1 releve sur 10
        J+1            part mediane 100 %   complet          : 10 sur 10
        J+2 et au-dela part mediane 100 %   complet          : 58 sur 60

     Les cas extremes sont violents : le 27 aout a H+14, SEPT POUR CENT du
     total etait arrive. Le 24 aout a H+12, vingt-sept. Une journee passee,
     elle, est acquise — d ou la regle : on ne se mefie QUE du jour courant.

     QUEL SILENCE EST ANORMAL. Sur 1 272 ecarts entre deux blocs, en journee :

        mediane 12 min · 80e centile 26 · 90e 39 · 95e 54 · puis 99e a 354

     La rupture est nette apres le 95e centile. On alerte a QUATRE-VINGT-DIX
     minutes : au-dela de 97 % des silences normaux, et bien en deca du premier
     vrai decrochage. En dessous, on parlerait a peu pres une fois par jour
     pour rien.

     ET SEULEMENT EN JOURNEE. La nuit, le bracelet se tait parce que personne
     ne marche : annoncer un retard a 4 h du matin serait un faux tous les
     jours. Fenetre 8 h - 23 h, celle ou un silence de 90 minutes veut dire
     quelque chose.

     CE QUE CETTE FONCTION NE FAIT PAS : elle ne corrige aucun chiffre, elle ne
     devine pas les pas manquants, elle ne remplace pas la valeur. Elle DIT.
     C est tout ce qui manquait. */
  var SILENCE_ALERTE = 90;

  function fraicheurPas(silenceMin, minuteCourante, estJourCourant) {
    if (!estJourCourant) return { enRetard: false, silenceMin: null };
    if (silenceMin == null || !(silenceMin >= 0)) return { enRetard: false, silenceMin: null };
    var m = minuteCourante;
    if (!(m >= 8 * 60 && m <= 23 * 60)) return { enRetard: false, silenceMin: silenceMin };
    if (silenceMin < SILENCE_ALERTE) return { enRetard: false, silenceMin: silenceMin };
    return { enRetard: true, silenceMin: Math.round(silenceMin) };
  }

  /* La phrase, ici et pas dans l ecran : elle doit etre la meme partout, et un
     banc doit pouvoir la lire. On donne l HEURE de la derniere mesure plutot
     qu une duree seule — « depuis 11h22 » se verifie d un coup d oeil, « depuis
     2 h » demande un calcul a celui qui lit. */
  function phraseFraicheur(f, minuteDernierBloc) {
    if (!f || !f.enRetard) return null;
    var h = Math.floor(minuteDernierBloc / 60), mi = Math.floor(minuteDernierBloc % 60);
    var hh = (h < 10 ? '0' : '') + h, mm = (mi < 10 ? '0' : '') + mi;
    return 'rien reçu depuis ' + hh + 'h' + mm + ' — la journée n\'est pas finie d\'arriver';
  }


  /* ═══ LE TOTAL D'UNE JOURNÉE — SES BLOCS, JAMAIS SON COMPTEUR ═════════════

     LE DÉFAUT, MESURÉ SUR PIÈCE. Le 3 septembre 2026 au soir, la fiche d'une
     marche de 982 pas annonçait « 100 % — sur 1 pas dans la journée ». Elle ne
     mentait pas : `watch_2026-9-3.steps` valait littéralement **1**, pendant
     que les trente-trois blocs de la même journée en portaient 7 643. Le
     bracelet avait été réinitialisé dans l'après-midi et le compteur cumulé
     qu'il s'attribue était reparti de zéro ; ses blocs, eux, n'ont rien perdu.

     Et ce n'est pas la fiche Marche qui était en cause : `flStepsOf` rendait le
     même 1 à l'accueil, aux tendances et partout ailleurs. Une part n'est
     fausse que parce que son dénominateur l'est.

     LA RÈGLE : LE TOTAL D'UNE JOURNÉE EST LA SOMME DE SES BLOCS. Le compteur
     `steps` est un résumé que le bracelet calcule lui-même — il se
     réinitialise, il se tronque, il arrive en retard. Les blocs sont la
     mesure ; le compteur n'en est que le reflet, et on ne préfère jamais un
     reflet à la chose. Il ne reste qu'en dernier recours, pour le cas d'un
     bracelet qui pousse un total sans son détail.

     ET C'EST SANS EFFET SUR UNE JOURNÉE SAINE — c'est ce qui rend le
     changement sûr. Sur les 452 journées-bracelet des relevés du dépôt, le
     compteur et la somme des blocs ne divergent que QUATRE fois : les 2 et
     3 septembre, les deux jours de la réinitialisation. Les 448 autres tombent
     d'accord au pas près.

     ═══ ON NE FILTRE PAS LES BLOCS PAR LEUR DATE, ET C'EST MESURÉ ═══════════

     La tentation est forte : ne garder que les blocs dont l'horodatage tombe
     dans la journée. Elle est FAUSSE ici, et le dépôt le sait déjà — c'est le
     piège de `test-marches-reelles.js` (CORRECTION-COMPTEUR-DE-PAS.md). La
     date d'un bloc se lit sur l'horloge de la MACHINE qui lit, jamais sur
     celle du porteur. Dino était à UTC+4 le 21 août (`watch_2026-8-21.tz.off`
     vaut 240) : relus à UTC+2, mille sept cent vingt de ses pas basculent dans
     la journée voisine, soit dix-huit pour cent de sa journée — et le même
     code rendrait un autre total selon l'endroit d'où on le regarde.

     On additionne donc EXACTEMENT l'ensemble de blocs que `steps` prétendait
     résumer. La courbe à la minute, elle, filtre — elle place des pas sur un
     cadran, elle a besoin d'une date ; c'est un compromis qu'elle porte depuis
     la v1711 et qu'on ne déplace pas ici.

     ═══ ET DANS UN BLOC, LA RÉPARTITION PASSE DEVANT SON PROPRE TOTAL ═══════

     Chaque bloc porte deux choses : son total (`b[1]`) et la répartition des
     pas minute par minute (`b[3]`, dix cases, cf. REPARTITION-DES-PAS.md).
     Quand les deux existent, on additionne la RÉPARTITION.

     MESURE, sur les 22 387 blocs des relevés qui en portent une : 22 382 —
     99,98 % — ont une répartition dont la somme égale exactement leur total.
     Les CINQ désaccords vont tous dans le même sens, la répartition au-dessus
     du total (211/315, 70/84, 453/465, 67/165, 0/37). Une répartition ne
     fabrique donc jamais de pas : c'est le total qui, parfois, en perd. Deux
     des cinq sont du 3 septembre, dans la fenêtre de la réinitialisation — la
     même panne, un cran plus bas.

     ET C'EST AUSSI CE QUI FAIT QUE LA PART D'UNE FICHE EST UN VRAI RAPPORT.
     Les pas d'une séance se comptent sur la répartition (`flPasParMinute`,
     v1711) : si le jour se comptait autrement, on diviserait deux mesures
     étrangères l'une à l'autre. C'est la leçon des trois normales — un rapport
     dont les deux termes n'ont pas la même origine ne veut rien dire.

     UN BLOC ENTRE UNE FOIS, ET UNE SEULE : par sa répartition s'il en a une,
     par son total sinon. Jamais les deux, ce serait le doubler.

     CE QUE CETTE FONCTION NE FAIT PAS : elle ne lit pas la base, elle n'écrit
     rien, elle ne devine aucun pas manquant. On lui donne les blocs d'un jour
     et sa clé, elle rend ce qu'ils disent.

     Rend `{ pas, kcal, heures, blocs, canal, minutes, dernierMin }` —
     `minutes` est `{m, vu}` (1 440 cases) ou `null` quand la journée n'est pas
     décrite assez uniformément pour qu'une courbe ait un sens. */

  /* La largeur d'un bloc en minutes, pour les seuls blocs SANS répartition :
     ceux qui en portent une donnent leur largeur eux-mêmes. Dix, parce que
     c'est mesuré — 232 blocs sur 232, sans une exception. */
  var LARGEUR_BLOC = 10;

  /* LA PART DES BLOCS QUI DOIT ÊTRE DÉCRITE À LA MINUTE pour qu'on accepte
     d'en tirer une COURBE. En dessous, elle mélangerait deux résolutions et ne
     serait celle d'aucune des deux. Ce seuil ne concerne QUE la courbe : le
     total, lui, se calcule bloc par bloc et n'a rien à mélanger. */
  var PART_DECRITE = 0.8;

  /* Le jour d'un bloc, à la façon des clés du moteur (`2026-9-3`, sans zéro
     devant). Il se lit sur l'horloge locale — voir plus haut pourquoi seule la
     courbe s'y fie. */
  function jourDe(ts) {
    var d = new Date((+ts || 0) * 1000);
    return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
  }

  function journee(blocs, K) {
    var liste = blocs || [];
    var m = new Array(1440), vu = new Array(1440);
    for (var i = 0; i < 1440; i++) { m[i] = 0; vu[i] = false; }
    var pas = 0, kcal = 0, heures = {}, dernier = null, decrits = 0;

    for (var r = 0; r < liste.length; r++) {
      var b = liste[r];
      if (!Array.isArray(b) || b.length < 2) continue;
      kcal += (+b[2] || 0);

      var cases = (Array.isArray(b[3]) && b[3].length) ? b[3] : null;
      if (cases) {
        decrits++;
        for (var c = 0; c < cases.length; c++) pas += (+cases[c] || 0);
      } else {
        pas += (+b[1] || 0);
      }

      var d = new Date((+b[0] || 0) * 1000);
      var m0 = d.getHours() * 60 + d.getMinutes();
      if (dernier == null || m0 > dernier) dernier = m0;
      var large = cases ? cases.length : LARGEUR_BLOC;
      var duJour = (K == null) || (jourDe(b[0]) === K);

      /* LA COUVERTURE SE COMPTE VERS L'AVANT. Les 232 blocs mesurés ont des
         pas dans leur PREMIÈRE case : la montre pousse un bloc quand la marche
         commence, l'horodatage marque donc le début, pas la fin. Une lecture à
         rebours décalait la couverture de dix minutes — sans conséquence tant
         que personne ne la lisait, fausse dès qu'on s'en sert pour arbitrer. */
      for (var j0 = 0; j0 < large; j0++) {
        var j = m0 + j0;
        if (j < 0 || j >= 1440) continue;
        /* La couverture suit le TOTAL, pas la courbe : elle porte sur le même
           ensemble de blocs, donc elle n'hérite pas non plus du fuseau. Seule
           la courbe filtre, parce qu'elle seule pose des pas sur un cadran. */
        heures[Math.floor(j / 60)] = 1;
        if (cases && duJour) { m[j] += (+cases[j0] || 0); vu[j] = true; }
      }
    }

    var complet = liste.length > 0 && decrits >= liste.length * PART_DECRITE;
    return { pas: Math.round(pas), kcal: Math.round(kcal),
             heures: Object.keys(heures).length, blocs: liste.length,
             canal: liste.length ? (complet ? 'minute' : 'bloc') : null,
             minutes: complet ? { m: m, vu: vu } : null,
             dernierMin: dernier };
  }

  /* ═══ LES PAS D'UNE FENÊTRE, ET LA FORME DE CE QUI S'Y EST PASSÉ ══════════

     Les deux bornes sont des minutes du cadran. On ne compte que les minutes
     que le bracelet a DÉCRITES, et on dit combien il y en avait : une fenêtre
     sans une seule minute décrite rend `null`, pas zéro — le bracelet n'était
     pas là, il n'a pas mesuré une absence de pas.

     LA CADENCE SE RAPPORTE AUX MINUTES OÙ L'ON A MARCHÉ, jamais à la durée
     entière. C'est toute la leçon du 11 août : `[14, 0, 0, 0, 0, 0, 0, 0, 0,
     0]` et « 1,4 pas par minute pendant dix minutes » sont indistinguables sur
     un total, et ce sont deux choses opposées — un arrêt, et une marche lente.
     Divisée par la durée, la cadence referme exactement cette confusion. */
  function fenetre(minutes, debMin, finMin) {
    if (!minutes || !minutes.m) return null;
    var d = Math.max(0, Math.round(debMin)), f = Math.min(1440, Math.round(finMin));
    if (!(f > d)) return null;
    var pas = 0, decrites = 0, actives = 0, serie = [], pointe = 0;
    for (var i = d; i < f; i++) {
      var v = minutes.vu[i] ? (minutes.m[i] || 0) : null;
      serie.push(v);
      if (v == null) continue;
      decrites++; pas += v;
      if (v > 0) actives++;
      if (v > pointe) pointe = v;
    }
    if (!decrites) return null;
    return { pas: pas, minutes: f - d, decrites: decrites, actives: actives,
             serie: serie, pointe: pointe,
             cadence: actives ? Math.round(pas / actives) : null };
  }


  racine.flPas = { fraicheurPas: fraicheurPas, phraseFraicheur: phraseFraicheur,
                   SILENCE_ALERTE: SILENCE_ALERTE,
                   nettoyer: nettoyer, total: total, signature: signature,
                   empreinte: empreinte, decalageDominant: decalageDominant,
                   nettoyerSerie: nettoyerSerie, nettoyerTranches: nettoyerTranches,
                   sansEtalement: sansEtalement,
                   sansCadenceImpossible: sansCadenceImpossible,
                   santePropre: santePropre, CADENCE_MAX: CADENCE_MAX,
                   arbitrerPas: arbitrerPas, heuresCouvertes: heuresCouvertes,
                   COUVERTURE_BASCULE: COUVERTURE_BASCULE, ECART_BASCULE: ECART_BASCULE,
                   journee: journee, fenetre: fenetre, jourDe: jourDe,
                   LARGEUR_BLOC: LARGEUR_BLOC, PART_DECRITE: PART_DECRITE };
})(typeof window !== 'undefined' ? window : globalThis);
