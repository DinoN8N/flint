/* ═══════════════════════════════════════════════════════════════════════════
   flint-zones.js — LES ZONES CARDIAQUES, ET RIEN D'AUTRE

   Sorti d'index.html le 3 septembre 2026, sur ordre du cliquet de découpage :
   « le code neuf a un metier : il va dans un fichier flint-<metier>.js, pas
   ici ». Le fichier vivait à DEUX lignes de son plafond (37 498 / 37 500) et
   trois constructions avaient déjà échoué dans la journée pour cette seule
   raison, alors qu'aucune n'avait d'erreur de compilation. Ce déménagement
   rend trois cents lignes de marge à tout le monde.

   DÉMÉNAGEMENT PUR : le code est repris À L'OCTET PRÈS, indentation comprise.
   Aucune ligne de logique n'a été touchée, et l'indentation de deux espaces
   — héritée de sa place d'origine — est CONSERVÉE À DESSEIN : cinq bancs
   prélèvent ces fonctions par leur amorce avec un `indexOf` littéral, espaces
   de tête compris, et les redresser les aurait tous cassés pour un gain
   cosmétique.

   ⚠️ ET AUCUNE AMORCE N'EST RECOPIÉE DANS CE COMMENTAIRE. La première version
   de cet en-tête en citait une en exemple, entre guillemets : les bancs l'ont
   trouvée AVANT la vraie définition, ont prélevé une phrase française et sont
   morts sur `SyntaxError`. `flint-unites.js` porte l'avertissement depuis la
   v2161 — « un commentaire qui cite l'en-tête d'une fonction du moteur la
   casse tout autant qu'une redéfinition » — et onze bancs étaient tombés d'un
   coup ce jour-là. Douze avec celui-ci.

   CE QUI EST ICI : les bornes par défaut, la règle de Karvonen, la médiane de
   repos qui les nourrit, la révision, la porte manuelle, le gel par jour et le
   classement d'un battement.

   CE QUI N'Y EST PAS, et c'est volontaire : `flZonesJour`, qui compte le TEMPS
   passé dans chaque zone d'une journée. Elle lit la courbe d'éveil et le
   podomètre — c'est le métier de l'activité, pas celui des bornes.

   DÉPENDANCES, toutes résolues AU GESTE comme partout dans le corpus :
   `flFcMax`, `flFcRepos` (window, index.html) et `tk` (const global partagé
   entre scripts classiques — le même idiome que `tmin` dans flint-unites.js).
   Rien n'est appelé au chargement, donc l'ordre des balises n'a pas d'effet.
   ═══════════════════════════════════════════════════════════════════════════ */

  /* ═══ v1558 — LES ZONES CARDIAQUES EN BPM ABSOLUS ═════════════════════════
     Bornes fixees par Dino (16 aout) :
         Z0 < 106 · Z1 106-133 · Z2 134-147 · Z3 148-161 · Z4 162-175 · Z5 >= 176
     UNE SEULE SOURCE. Avant, quatre decoupages coexistaient : %FCmax dans
     flZonesOf (50/60/70/80/90), reserve cardiaque dans flZonesJour et l effort
     de seance (40/60/70/80/90), et DEUX tables d affichage codees en dur
     (FLEFF_Z : 118/143/156/168/181 ; ZONE_DEF : 107/135/149/163/176). Le meme
     battement pouvait donc changer de zone selon l ecran qui le regardait.
     Tous lisent desormais ces bornes-ci. `DB.zonesBpm` permet de les ajuster
     sans code (tableau de 5 bornes basses, Z1 a Z5).
     ⚠️ L effort (Banister, PASSATION-CALIBRATION.md) a ete calibre sur les
     anciennes bandes en reserve : ses scores bougent legerement avec ce
     redecoupage — assume, c est la demande. */
  /* ═══════════════════════════════════════════════════════════════════════
     v1877 — LES ZONES DEVIENNENT CELLES DU CORPS QUI LES PORTE
     ═══════════════════════════════════════════════════════════════════════

     CE QUI NE VA PAS AVEC DES BORNES FIXES, et ce n'est pas une nuance.
     Un pourcentage de FC max ne corrige que par le haut : deux personnes de
     même maximale, l'une au repos à 45 et l'autre à 70, n'ont pas la même
     réserve et ne fournissent pas le même effort au même battement. Mesuré sur
     les bornes de la v1558, posées à l'œil sur le corps de Dino :

         Dino, 21 ans, repos 48   →  40 · 60 · 69 · 79 · 88 % de SA réserve  ✅
         30 ans, repos 55         →  39 · 60 · 70 · 81 · 92 %
         coureur 35 ans, repos 40 →  46 · 65 · 75 · 85 · 94 %
         50 ans, repos 65         →  38 · 64 · 77 · 90 · 103 %
         60 ans, repos 70         →  38 · 67 · 81 · 96 · 110 %

     Lire la dernière ligne : à 60 ans, la Z5 de la v1558 commence AU-DELÀ de
     la fréquence maximale. Elle est inatteignable, et la Z4 presque. L'effort
     de cette personne serait écrasé toutes les semaines, sans qu'elle sache
     pourquoi.

     ET LES DEUX SEXAGÉNAIRES DE DINO — celui qui court tous les jours et
     l'autre — se séparent tout seuls ici, parce que la réserve les sépare : le
     coureur a un repos bas (grande réserve, zones étirées) et une pointe
     mesurée qui dépasse la formule de l'âge. Aucune règle spéciale à écrire.

     LA MÉTHODE : KARVONEN (1957), la réserve cardiaque, 40/60/70/80/90 %.
     C'est celle de WHOOP, contre qui l'effort de FLINT est étalonné. Et sur le
     corps de Dino elle rend 106 · 135 · 150 · 164 · 178 — soit ses bornes
     actuelles à DEUX battements près. Le passage ne lui coûte donc rien, et
     c'est ce qui rend ce chantier sûr : il ne déplace pas la référence sur
     laquelle l'étalonnage a été fait.

     ⚠️ CE QUE ÇA NE RÉSOUT PAS, et il faut le dire : même en réserve, la
     correspondance entre pourcentage et seuil physiologique varie d'une
     personne à l'autre — un coureur à 85 % peut être sous son premier seuil
     quand un autre est déjà au-dessus du second. Seul un test en laboratoire
     tranche. C'est pour ça que la porte manuelle existe et n'est pas un
     ornement. */
  window.flZonesDefaut=function(){return [106,134,148,162,176];};

  /* La règle pure : cinq bornes basses depuis une maximale et un repos.
     Rien ne s'écrit ici, rien ne se lit d'ailleurs — un banc la rejoue seule. */
  window.flZonesDeReserve=function(fcMax,fcRepos){
   var m=+fcMax,r=+fcRepos;
   if(!(m>0)||!(r>0))return null;
   var R=m-r;
   /* Une réserve absurde ne produit pas de zones : c'est la même garde que
      `flZonesJour` applique depuis toujours, au même seuil, pour la même
      raison — sous 40 battements d'amplitude, le découpage n'a plus de sens. */
   if(R<=40)return null;
   return [0.40,0.60,0.70,0.80,0.90].map(function(p){return Math.round(r+R*p);});
  };

  /* ═══ LES BORNES DE L'EFFORT, EN RÉSERVE ET NON EN ABSOLU — 7 sept. 2026 ═══

     LA RAMPE DES CALORIES (`flCaloriesDetail`, passe 1) monte du plancher au
     seuil : sous le plancher rien n'est de l'activité, au seuil tout l'est.
     Ces deux bornes étaient ABSOLUES — « repos + 10 battements » et « 60 % de
     la fréquence maximale » — et c'est là que le corps entrait dans la formule
     par la mauvaise porte.

     MESURÉ SUR LES HUIT CORPS DU BANC (`outils/karvonen-equite.js`) : rapporté
     à la réserve de chacun, le seuil tombe entre 32,0 % (homme de 68 ans) et
     49,5 % (athlète d'endurance) — dix-sept points d'amplitude — et la bande où
     la rampe s'applique va de 20 à 64 battements, un rapport de 3,14. À EFFORT
     RELATIF ÉGAL, c'est-à-dire pour la même journée décrite en pourcentage de
     la réserve de chacun, le crédit rendu variait de 3,65× d'un corps à
     l'autre. L'homme de 68 ans passait « effort plein » à 32 % de sa réserve —
     de la marche tranquille payée au tarif d'une séance.

     KARVONEN : la position entre le repos et la maximale. Les mêmes deux bornes
     y sont exprimées, et l'inéquité tombe de 3,65× à 1,64× — sous le seuil de 2
     que le banc des corps virtuels exige déjà des autres formules.

     ⚠️ LES DEUX NOMBRES NE SONT PAS CHOISIS, ILS SONT REPRIS. 7,0 % et 46,8 %
     sont EXACTEMENT la position qu'occupaient « repos + 10 » et « 60 % de la
     FC max » chez le corps témoin. Le chantier porte sur l'ÉQUITÉ, pas sur le
     niveau : le calibrage de la rampe contre WHOOP (29 août) survit intact, et
     sur les dix-neuf journées réelles de Dino l'écart bouge de 225 à 230 kcal —
     cinq kilocalories, la neutralité qu'on cherchait. Prendre un autre nombre
     aurait été recalibrer en douce. Détail : CHANTIER-KARVONEN.md.

     SANS REPOS MESURÉ, ON REND `null` et l'appelant garde ses bornes absolues :
     on ne devine pas une réserve. Même garde que `flZonesDeReserve` pour une
     réserve absurde — sous 40 battements d'amplitude, la division n'a plus de
     sens et rendrait des bornes fantaisistes. */
  window.flRampeBornes=function(fcMax,fcRepos){
   var m=+fcMax,r=+fcRepos;
   if(!(m>0)||!(r>0))return null;
   var R=m-r;
   if(R<=40)return null;
   return {bas:r+0.070*R, seuil:r+0.468*R, reserve:R};
  };

  /* ═══ LA FC DE REPOS QUI SERT AUX ZONES N'EST PAS CELLE DE CETTE NUIT ══════
     MESURÉ SUR LES 25 NUITS DE DINO : d'une nuit à l'autre, sa fréquence de
     repos saute de 2 battements en médiane et jusqu'à SIX. Des zones assises
     dessus bougeraient donc de six battements du jour au lendemain — exactement
     ce que Dino refuse.
     Sur une médiane glissante de trente nuits, la même série ne bouge JAMAIS de
     plus d'UN battement, et son amplitude totale sur le mois fait trois.
     La stabilité ne vient pas d'un verrou posé après coup : elle vient de la
     mesure qu'on choisit. Le verrou (la révision, plus bas) n'est que la
     ceinture.
     ON REND AUSSI LA DISPERSION, parce que c'est elle qui dira plus bas ce
     qu'est un vrai mouvement et ce qui n'est que du bruit. */
  window.flFcReposStable=function(n){
   n=n||30;
   var v=[],i;
   for(i=0;i<n;i++){
    try{var r=flFcRepos(tk(-i)); if(r&&r.v>25&&r.v<120)v.push(r.v);}catch(e){}
   }
   /* Sous sept nuits, une médiane ne mesure plus une habitude, elle mesure la
      semaine qu'on vient de passer. On préfère ne rien dire. */
   if(v.length<7)return null;
   var t=v.slice().sort(function(a,b){return a-b;});
   var med=t[t.length>>1];
   var moy=v.reduce(function(a,b){return a+b;},0)/v.length;
   var ec=Math.sqrt(v.reduce(function(a,b){return a+(b-moy)*(b-moy);},0)/v.length);
   return {v:med, nuits:v.length, dispersion:Math.round(ec*10)/10};
  };

  /* ═══ QUAND LES ZONES ONT-ELLES LE DROIT DE BOUGER ? ═══════════════════════
     Dino : « suffisamment intelligent pour ne pas bugger ni changer tous les
     jours ». Trois règles, et aucune n'est un délai posé au hasard.

     1 · UNE POINTE MESURÉE PLUS HAUTE PASSE TOUT DE SUITE. C'est un FAIT neuf,
         pas une dérive : le cœur a réellement atteint ce battement pendant une
         séance reconnue (`flFcMaxObservee` et ses quatre gardes). Et il est
         MONOTONE — une maximale observée ne redescend jamais, donc ce chemin ne
         peut pas osciller. C'est ce que fait Garmin, et c'est le bon moment :
         apprendre qu'on est monté à 188 doit servir le jour même.

     2 · LE RESTE ATTEND TRENTE JOURS. La condition physique se déplace à
         l'échelle des semaines, pas des nuits. WHOOP réajuste une fois par
         mois, pour cette raison-là. Une révision plus fréquente ne mesurerait
         que le bruit de la mesure.

     3 · ET IL FAUT QUE LE MOUVEMENT DÉPASSE LE BRUIT. Le seuil n'est pas
         choisi : c'est la DISPERSION de la fréquence de repos de la personne,
         mesurée sur ses propres nuits (2 battements chez Dino). Une borne qui
         se déplace de moins que le tremblement du signal qui la produit ne
         s'est pas déplacée, elle a frémi. Chez quelqu'un de plus régulier le
         seuil se resserre tout seul ; chez quelqu'un de plus instable il
         s'élargit. Le plancher d'un battement existe pour que le seuil ne
         puisse jamais tomber à zéro et laisser passer n'importe quoi.

     LE RÉSULTAT, dit simplement : les zones se posent une fois, montent le jour
     où le cœur prouve qu'il monte plus haut, et sinon ne bronchent pas d'un
     mois sur l'autre. */
  window.flZonesReglage=function(){try{
   /* ⚠️ LES TRENTE JOURS VIVENT DANS LA FONCTION, et c'est une leçon payée :
      une constante posée juste au-dessus tombe HORS du bloc que les bancs
      extraient. La fonction part alors dans son propre `catch` et rend une
      réponse polie — ici « bornes par défaut » — sans que rien ne le signale.
      Une règle qui dépend d'une valeur qu'on peut lui retirer n'est pas une
      règle, c'est une coïncidence de portée. */
   var _ZONES_REVISION_JOURS=30;
   /* LA MAIN PASSE DEVANT TOUT, ET NE SE FAIT JAMAIS RÉVISER. Quelqu'un qui a
      fait un vrai test d'effort en sait plus que nous ; on ne va pas corriger
      son laboratoire avec notre estimation. */
   var man=null; try{man=DB.get('zonesBpm',null);}catch(e){}
   if(Array.isArray(man)&&man.length===5)
    return {bornes:man.map(Number), source:'manuelles'};

   var reg=null; try{reg=DB.get('zonesReglage',null);}catch(e){}
   var fm=null; try{fm=flFcMax();}catch(e){}
   var rp=null; try{rp=flFcReposStable();}catch(e){}
   var cand=(fm&&rp)?flZonesDeReserve(fm.v,rp.v):null;

   /* Rien à calculer : on garde ce qui est déjà posé, sinon les bornes
      historiques. Une absence de mesure ne vide pas l'écran. */
   if(!cand){
    if(reg&&reg.bornes&&reg.bornes.length===5)
     return {bornes:reg.bornes,source:reg.source||'personnelles',
             fcMax:reg.fcMax,fcMaxSrc:reg.fcMaxSrc,fcRepos:reg.fcRepos,
             nuits:reg.nuits,pose:reg.pose,revu:reg.revu};

    /* ═══ v2183 — LA PREMIÈRE SEMAINE NE DONNE PLUS LES BORNES D'UN AUTRE ═══
       Sous sept nuits, `flZonesDefaut()` reprenait la main : les bornes d'UN
       corps (27 ans, 47 de repos, max 189). Mesuré sur huit corps — femme de
       52 ans et homme de 68 ans, maximale 160 : la Z4 commence à 162 et la Z5
       à 176, DEUX ZONES SUR CINQ hors d'atteinte une semaine durant.
       Deux échelons de plus, et aucun n'invente une mesure : la réserve des
       nuits déjà portées (`provisoires` — sa mesure, pas encore stable), puis
       50/60/70/80/90 % de SA maximale déduite de l'âge (`maximale`, toutes les
       bornes atteignables par construction). Le seuil de sept ne bouge pas, et
       rien ne se persiste ici : ce sont des états d'attente.
       Le pourquoi de chaque choix, et les nombres : CHANTIER-PREMIERE-SEMAINE.md §1 */
    if(fm&&fm.v>0){
     /* UNE SEULE NUIT SUFFIT ICI, et c'est mesuré : sur la journée épinglée
        du 23 août, la réserve d'UNE nuit rend un effort de 12,3 contre 12,5
        pour la série stable, quand le pourcentage de la maximale rend 13,8. */
     var _pv=[],_i;
     for(_i=0;_i<30;_i++){
      try{var _r1=flFcRepos(tk(-_i)); if(_r1&&_r1.v>25&&_r1.v<120)_pv.push(_r1.v);}catch(e){}
     }
     if(_pv.length){
      var _t1=_pv.slice().sort(function(a,b){return a-b;});
      var _prov=flZonesDeReserve(fm.v,_t1[_t1.length>>1]);
      if(_prov)return {bornes:_prov,source:'provisoires',
                       fcMax:fm.v,fcMaxSrc:fm.src,fcRepos:_t1[_t1.length>>1],
                       nuits:_pv.length};
     }
     /* La réserve a pu être refusée pour amplitude absurde (< 40 battements) :
        le pourcentage de la maximale, lui, reste défini. */
     return {bornes:[0.50,0.60,0.70,0.80,0.90].map(function(q){return Math.round(fm.v*q);}),
             source:'maximale', fcMax:fm.v, fcMaxSrc:fm.src};
    }
    return {bornes:flZonesDefaut(),source:'defaut'};
   }

   var now=Date.now();
   var neuf={bornes:cand, source:'personnelles',
             fcMax:fm.v, fcMaxSrc:fm.src, fcRepos:rp.v,
             nuits:rp.nuits, dispersion:rp.dispersion,
             pose:(reg&&reg.pose)||now, revu:now};

   if(!reg||!reg.bornes||reg.bornes.length!==5){
    try{DB.set('zonesReglage',neuf);}catch(e){}
    return neuf;
   }

   /* 1 · la pointe mesurée a monté → tout de suite */
   var montee=(fm.v>(+reg.fcMax||0));
   /* 2 · sinon, trente jours */
   var age=(now-(+reg.revu||0))/86400000;
   /* 3 · et un mouvement qui dépasse le bruit */
   var bruit=Math.max(1,Math.round(rp.dispersion||1));
   var bouge=0,i;
   for(i=0;i<5;i++)if(Math.abs(cand[i]-reg.bornes[i])>=bruit)bouge++;

   if(montee||(age>=_ZONES_REVISION_JOURS&&bouge>0)){
    try{DB.set('zonesReglage',neuf);}catch(e){}
    return neuf;
   }
   return {bornes:reg.bornes,source:reg.source||'personnelles',
           fcMax:reg.fcMax,fcMaxSrc:reg.fcMaxSrc,fcRepos:reg.fcRepos,
           nuits:reg.nuits,pose:reg.pose,revu:reg.revu};
  }catch(e){return {bornes:flZonesDefaut(),source:'defaut'};}};

  /* ═══ ET LES ZONES D'UN JOUR PASSÉ NE CHANGENT PLUS JAMAIS ════════════════
     C'est la règle de la maison depuis la v1463 — « un score déjà vu ne change
     plus jamais » — et c'est ce qui rend ce chantier possible sans réécrire
     l'histoire. Les bornes d'une journée se figent avec elle, exactement comme
     `besoinJour_` fige le besoin de sommeil.

     ⚠️ UN JOUR D'AVANT LA POSE GARDE LES BORNES HISTORIQUES. On ne lui applique
     pas les zones d'aujourd'hui : ce n'est pas avec elles qu'il a été calculé.
     Sans cette ligne, tout l'historique d'effort se recalculerait au premier
     lancement de cette version. */
  window.flZonesBpm=function(k){
   k=k||tk(window.flDayOff||0);
   try{
    var fige=DB.get('zonesJour_'+k,null);
    if(Array.isArray(fige)&&fige.length===5)return fige.map(Number);
   }catch(e){}
   var reg=flZonesReglage();
   /* Le jour courant et les jours à venir se figent ; un jour passé se contente
      de lire, et à défaut rend les bornes qui avaient cours. */
   var _auj=tk(0);
   if(k===_auj){
    try{DB.set('zonesJour_'+k,reg.bornes);}catch(e){}
    return reg.bornes;
   }
   if(reg.source==='manuelles')return reg.bornes;
   if(reg.pose){
    try{
     var q=String(k).split('-');
     var t=new Date(+q[0],+q[1]-1,+q[2],23,59,59).getTime();
     if(t<reg.pose)return flZonesDefaut();
    }catch(e){}
   }
   return reg.bornes;
  };
  /* ═══ v1882 — LA PORTE MANUELLE, DEPUIS LES RÉGLAGES ══════════════════════
     `DB.zonesBpm` existait depuis la v1558 comme échappatoire documentée, sans
     aucun écran pour l'atteindre. Elle en a un.

     POURQUOI ELLE N'EST PAS UN ORNEMENT. Même exprimée en réserve, la
     correspondance entre un pourcentage et un vrai seuil physiologique varie
     d'une personne à l'autre : un coureur à 85 % peut être sous son premier
     seuil quand un autre est déjà au-dessus du second. Seul un test en
     laboratoire tranche, et quelqu'un qui en a fait un en sait plus que nous.
     On ne corrige pas son laboratoire avec notre estimation.

     ⚠️ ON DÉGÈLE LE JOUR COURANT, sinon la saisie ne prendrait effet que demain.
     On ne touche à AUCUN jour passé : leurs bornes sont figées et le restent —
     c'est la règle qui protège les scores déjà vus. */
  window.flZonesPoserManuelles=function(b){try{
   if(!Array.isArray(b)||b.length!==5)return false;
   var v=b.map(function(x){return Math.round(+x);});
   for(var i=0;i<5;i++){
    if(!(v[i]>=60&&v[i]<=230))return false;
    if(i&&v[i]<=v[i-1])return false;      /* strictement croissantes */
   }
   DB.set('zonesBpm',v);
   try{localStorage.removeItem('zonesJour_'+tk(0));}catch(e){}
   return true;
  }catch(e){return false;}};

  /* Revenir au calcul. Même dégel, même refus de toucher au passé. */
  window.flZonesEffacerManuelles=function(){try{
   try{localStorage.removeItem('zonesBpm');}catch(e){}
   try{localStorage.removeItem('zonesJour_'+tk(0));}catch(e){}
   return true;
  }catch(e){return false;}};

  /* La zone (0-5) qui contient ce battement, AVEC les bornes de son jour. */
  /* ═══ v1969 — LES BORNES PEUVENT ÊTRE PASSÉES, ET C'EST TOUT ═════════════
     LA RÈGLE NE CHANGE PAS. C'est la même comparaison, le même découpage, le
     même unique juge des zones. Ce qui change, c'est qu'un appelant qui les a
     DÉJÀ lues peut les donner au lieu de les faire relire.

     POURQUOI. Mesuré le 27 août sur la base réelle de Dino, en rejouant la fin
     d'une activité : `flAccueilData` faisait 26 154 lectures de base, dont
     9 666 sur `profile` et 4 810 sur `zonesBpm`. La pile disait toujours la
     même chose — `flZonesOf` classe chaque point de chaque journée, et chaque
     point redemandait les bornes du jour, qui sont pourtant les mêmes pour
     tous les points de ce jour.

     ⚠️ CE N'EST PAS UNE MÉMOIRE. Rien n'est gardé entre deux appels, donc rien
     ne peut se périmer : c'est la maison qui a déjà payé un cache resservant
     une nuit corrigée (v1414). Ici les bornes sont lues une fois PAR BOUCLE,
     par la même fonction qu'avant, et jetées avec elle. */
  /* ⚠️ ET LE REPLI EST VOLONTAIRE, PAS UNE POLITESSE. Si les bornes ne sont pas
     fournies, cette fonction les lit elle-même — c'est EXACTEMENT le
     comportement d'avant : même règle, même résultat, seulement plus de
     lectures. Ce n'est donc pas un `catch` qui avale une panne, c'est un chemin
     complet. Les appelants les passent quand ils les ont déjà, et quatre bancs
     prélèvent ces boucles sans fournir `flZonesBpm` : chez eux le repli joue,
     et ils mesurent la même chose qu'avant. */
  window.flZoneDeBpm=function(bpm,k,B){B=B||flZonesBpm(k);
   for(var i=4;i>=0;i--)if(bpm>=B[i])return i+1;
   return 0;};
