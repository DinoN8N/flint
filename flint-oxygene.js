/* Le metier de ce fichier : L'OXYGENATION DU SANG — la valeur de la nuit, et
   le bas de sa distribution. Rien d'autre.

   Liaisons de script : `DB` et `tk` se lisent NUS (jamais window.*,
   garde-liaisons), et se testent avant de se supposer.
   Bancs : tests/test-absences-moniteur.js, tests/test-depot-moteur.js.

   ═══ POURQUOI CE FICHIER EXISTE — v2181, 3 septembre 2026 ══════════════════

   Deux fonctions, un seul sujet, et le cliquet du decoupage web qui refusait
   trente-six lignes de plus dans index.html. Le garde dit lui-meme le remede :
   « le code neuf a un metier : il va dans un fichier flint-<metier>.js ».
   Elles sortent sans une ligne de changee.
*/
'use strict';

  /* ═══ v2132 — LA RÈGLE PREND UN JOUR, ET `flSpo2Nuit` N'EST PLUS QU'UN DÉCALAGE
     `sensorOf` porte un champ `spo2` depuis l'origine ; il lit `night.spo2`, que
     PERSONNE n'écrit. Mesuré sur la base rapatriée du 2 septembre : `null` sur
     les 21 nuits, pendant que `flSpo2Nuit` rend 100, 100, 100, 99, 98… La carte
     Oxygène de l'écran Sommeil (`if(t.spo2!=null)`) n'a donc JAMAIS pu s'afficher
     — elle tombait dans son `else` depuis toujours, en silence.
     DEUX CHEMINS POUR UNE MESURE, UN VIVANT, UN MORT : c'est le piège endormi
     que la v1780 décrit ailleurs. On ne recopie pas la règle dans `sensorOf`
     (une formule, un endroit) : on lui donne une porte par JOUR, et la version
     par décalage devient une ligne. */
  /* ═══ 7 sept. 2026 — MEMOIRE PAR NUIT PASSEE (flSpo2NuitDe). 625 appels par ouverture de la page Sommeil, 123 ms au banc.
     Meme sceau que flFcRepos (v1957) : les compteurs d ecritures des familles lues ; une
     ecriture les jette tous. Le calcul d origine est INTACT dans `_calcul`, a l interieur
     de la fonction (les bancs prelevent par le nom). Sans DB.tampon, memoire inactive. */

  /* ═══ 27 oct. 2026 — DOUZE RELEVÉS, C'ÉTAIT LA CADENCE DE L'ANCIEN BRACELET ══════

     La carte Oxygène de Dino disait « pas de mesure » toutes les nuits depuis le
     Fitcare. Le bracelet MESURE pourtant : 96 à 100 %, un relevé par heure
     (fichier `.spo2` du 27 oct. : 9 valeurs de 0 h à 8 h). Dans la nuit du 27
     (1 h 30 → 6 h 29), cinq relevés. Il en fallait douze.

     Le douze venait du J-Style, qui mesurait toutes les vingt minutes : sur une
     nuit de sept heures, ~21 relevés, et douze en exigeait un peu plus de la
     moitié (v1781). Une heure de cadence ne peut JAMAIS en donner douze sur une
     nuit ordinaire : le seuil ne demandait plus « assez de la nuit », il
     demandait un autre bracelet.

     LA RÈGLE GARDE SON SENS, PAS SON CHIFFRE : à partir de 45 min de cadence,
     il faut la moitié des relevés que la nuit peut contenir, et jamais moins de
     quatre. Sous 45 min (l'ancien bracelet), rien ne change : douze.
     Et LE BAS DE LA NUIT : le 10e centile de ~24 relevés tombait sur le 2e ou
     3e plus bas — assez bas pour voir un décrochage, assez haut pour qu'un
     accident isolé ne suffise pas (v2181). Sur moins de douze relevés, le
     centile glisse vers le minimum ; on prend donc le 2e plus bas, la même
     protection contre un bras mal posé. Banc : test-moniteur-fitcare.js. */
  window.flSpo2Plancher = function (w, b, r) {
    try {
      var m = (w.spo2 || []).map(function (x) { return x[0]; }).sort(function (x, y) { return x - y; });
      var g = [];
      for (var i = 1; i < m.length; i++) if (m[i] > m[i - 1]) g.push(m[i] - m[i - 1]);
      if (!g.length) return 12;
      g.sort(function (x, y) { return x - y; });
      var cad = g[g.length >> 1];
      if (cad < 45) return 12;
      var duree = ((r - b) + 1440) % 1440;
      return Math.max(4, Math.ceil(0.5 * duree / cad));
    } catch (e) { return 12; }
  };
  /* ═══ 2 nov. 2026 — UNE NUIT À 100 % PARTOUT N'EST PAS UNE MESURE ═══════════════════════════
     Nuit du 1er au 2 nov., Fitcare : neuf relevés horaires, NEUF à 100 %. WHOOP, même nuit : 95 %
     (plage 95-100). Une saturation tenue à 100 % toute une nuit n'existe pas chez l'adulte (95-99 à
     l'air ambiant) : c'est le plafond du capteur. La veille, le même bracelet rendait 96, 97, 98 —
     ces nuits-là restent mesurées. Une nuit dont TOUS les relevés sont à 100 est donc « pas de
     mesure » : mieux vaut un tiret qu'un faux 100 % (et un « bas de la nuit » à 100 qui dirait tout
     va bien). Banc : tests/test-moniteur-comme-whoop.js. */
  window.flSpo2Plafonne=function(v){return !!(v&&v.length&&v.every(function(x){return x>=100;}));};
  /* ═══ 5 nov. 2026 — LE FITCARE NE DONNE PAS ENCORE UN OXYGÈNE FIABLE ═══════════════════════════
     Mesuré : 121 relevés sur 156 à 100 %, la même valeur huit heures de suite, et le bouton de mesure
     de LEUR app (F24H) rend aussi 100 %, WHOOP lisant 95,85 % sur la même nuit. Le chiffre naît dans le
     bracelet, on ne le répare pas ici. Le plafond ci-dessus ne suffisait pas : une nuit où un seul relevé
     passait sous 100 sortait un chiffre et une carte VERTE, qui rassure sans rien prouver, sur une donnée
     de santé. Donc : sur le Fitcare (et les nuits mêlées), pas de chiffre, la carte dit « Pas de mesure ».
     L'ancien bracelet mesure vraiment et ne change pas. Quand Fitcare aura corrigé son firmware, passer
     FL_SPO2_FITCARE_FIABLE à true suffit. Banc : test-moniteur-fitcare.js § 1. */
  /* ═══ 19 nov. 2026 — REBRANCHÉ, À LA DEMANDE DE DINO (« j'aimerais bien qu'on rebranche la SpO2 ») ═══
     L'interrupteur passe à true : le Fitcare redonne son chiffre (Moniteur, Coach, courbes, export). CE
     QU'IL MONTRE, mesuré sur les 19 nuits du 1er au 19 nov. (base du téléphone, oxygene.js) : 142 relevés
     de nuit, 68 % à 100 et 18 % à 99 ; la carte (le bas de la nuit) afficherait 95 à 100 % — 99 sept fois,
     98 quatre fois, 100 trois fois —, WHOOP lisant 95,2 à 97,2 % sur les treize nuits comparables : deux
     points de plus que WHOOP, et sans le suivre d'une nuit à l'autre (WHOOP au plus bas le 10 nov., 95,2 :
     99 ici). Le capteur n'a PAS changé depuis le 5 nov. ; c'est une décision de produit, dite à Dino avec
     ces chiffres. Ce qui reste coupé : une nuit TOUTE à 100 (`flSpo2Plafonne`, deux nuits sur dix-neuf) et
     une nuit mêlée à l'ancien bracelet (`flSpo2NonFiable`, inchangé quand l'interrupteur est à false). */
  window.FL_SPO2_FITCARE_FIABLE=true;
  window.flSpo2NonFiable=function(w){try{return !window.FL_SPO2_FITCARE_FIABLE&&!!(w&&typeof window.flInstrumentVfc==='function'&&window.flInstrumentVfc(w.marque));}catch(e){return false;}};
  window._flSpo2NuitMemo={__sceau:null};
  window.flSpo2NuitDe=function(K){
   var _calcul=function(K){try{
   var w=DB.get('watch_'+K,null);
   var _nonFiable=(typeof window.flSpo2NonFiable==='function')&&window.flSpo2NonFiable(w);   /* 5 nov. 2026 — voir ci-dessus */
   if(w&&typeof flMatiereNuit==='function')w=flMatiereNuit(K,w);   /* 1er oct. 2026 — nuit finie avant minuit : l'oxygène de la veille */
   if(!w||!w.spo2||!w.spo2.length)return null;
   if(_nonFiable||((typeof window.flSpo2NonFiable==='function')&&window.flSpo2NonFiable(w)))return null;
   var n=w.night;
   if(!n||n.bedMin==null||n.wakeMin==null)return null;
   var b=n.bedMin, r=n.wakeMin;
   var v=w.spo2.filter(function(x){
     var m=x[0];
     return (b<=r)?(m>=b&&m<=r):(m>=b||m<=r);
    }).map(function(x){return x[1];})
      /* Bornes physiologiques. Un zero est une non-lecture, pas une asphyxie. */
      .filter(function(x){return x>=70&&x<=100;});
   if(v.length<((typeof window.flSpo2Plancher==='function')?window.flSpo2Plancher(w,b,r):12))return null;
   if(window.flSpo2Plafonne(v))return null;   /* 2 nov. 2026 — que des 100 % : le capteur plafonne, ce n'est pas une mesure */
   v.sort(function(x,y){return x-y;});
   var m=v.length%2?v[v.length>>1]:(v[v.length/2-1]+v[v.length/2])/2;
   return Math.round(m);
  }catch(e){return null;}};
   try{
    var _auj=(typeof tk==='function')?tk():null;
    if(!K||K===_auj)return _calcul(K);
    var _sc=null; try{_sc=DB.tampon('sensor_')+'|'+DB.tampon('watch_')+'|'+DB.tampon('sessions_')+'|'+DB.tampon('hrfine_')+'|'+DB.tampon('recov');}catch(e){_sc=null;}
    if(_sc==null)return _calcul(K);
    var _m=window._flSpo2NuitMemo; if(!_m||_m.__sceau!==_sc){_m=window._flSpo2NuitMemo={__sceau:null};_m.__sceau=_sc;}
    if(Object.prototype.hasOwnProperty.call(_m,K)){var _g=_m[K];return (_g&&typeof _g==='object')?JSON.parse(JSON.stringify(_g)):_g;}
    var _r=_calcul(K);
    _m[K]=(_r&&typeof _r==='object')?JSON.parse(JSON.stringify(_r)):_r;
    return _r;
   }catch(e){return _calcul(K);}
  };
  window.flSpo2Nuit=function(off){return window.flSpo2NuitDe(((typeof window.flCleJourCourant==='function')?window.flCleJourCourant:tk)(Math.min(0,off|0)));};

  /* ═══ v2181 — LE BAS DE LA NUIT, PARCE QUE LA MEDIANE NE VOIT RIEN ════════

     CE QUI ETAIT FAUX, ET DINO L'A DEBUSQUE EN INSTALLANT L'APP DU FABRICANT.
     Elle montre le MEME bracelet descendre a 92 % (min du jour), et nos
     echantillons bruts disent exactement pareil : 92, 96, 97, 98. Le capteur
     descend. Ce qui ne bougeait pas, c'est NOTRE resume.

     `flSpo2NuitDe` rend la MEDIANE. Or ce capteur renvoie 100 dans 78 % des
     cas — il sature au plafond. La mediane tombe donc sur le plafond, et sur
     tout l'historique de Dino elle ne prend que DEUX valeurs : 100 et 99.

     LE PRIX, MESURE : la nuit du 8 aout, son minimum est descendu a 90 % —
     pile le seuil d'hypoxemie, celui pour lequel cette carte existe. La carte
     a affiche 100 %, vert. Elle a manque exactement l'evenement qu'elle
     surveille.

     C'EST UNE ERREUR DE CATEGORIE : on jugeait un seuil d'EVENEMENT avec une
     statistique de TENDANCE. La mediane decrit la nuit ordinaire ; 90 % cherche
     un decrochage. Les deux ne parlent pas de la meme chose.

     POURQUOI LE 10e CENTILE ET PAS LE MINIMUM. A une mesure toutes les vingt
     minutes, un seul echantillon bas peut etre un artefact de mouvement — le
     minimum ferait crier la carte pour un bras mal pose. Le 10e centile, sur
     ~24 echantillons, c'est le 2e ou 3e plus bas : assez bas pour voir un vrai
     decrochage, assez haut pour qu'un accident isole ne suffise pas. Sur ses
     nuits il prend 17 valeurs distinctes la ou la mediane en prend deux.

     LA MEDIANE RESTE CE QU'ON AFFICHE — c'est « ton oxygenation de la nuit »,
     et l'app du fabricant fait pareil avec son « Avg ». On change ce qui JUGE,
     pas ce qui se lit. */
  /* ═══ 7 sept. 2026 — MEMOIRE PAR NUIT PASSEE (flSpo2BasNuitDe). 625 appels par ouverture, 119 ms.
     Meme sceau que flFcRepos (v1957) : les compteurs d ecritures des familles lues ; une
     ecriture les jette tous. Le calcul d origine est INTACT dans `_calcul`, a l interieur
     de la fonction (les bancs prelevent par le nom). Sans DB.tampon, memoire inactive. */
  window._flSpo2BasMemo={__sceau:null};
  window.flSpo2BasNuitDe=function(K){
   var _calcul=function(K){try{
   var w=DB.get('watch_'+K,null);
   var _nonFiable=(typeof window.flSpo2NonFiable==='function')&&window.flSpo2NonFiable(w);   /* 5 nov. 2026 — voir ci-dessus */
   if(w&&typeof flMatiereNuit==='function')w=flMatiereNuit(K,w);   /* 1er oct. 2026 — nuit finie avant minuit : l'oxygène de la veille */
   if(!w||!w.spo2||!w.spo2.length)return null;
   if(_nonFiable||((typeof window.flSpo2NonFiable==='function')&&window.flSpo2NonFiable(w)))return null;
   var n=w.night;
   if(!n||n.bedMin==null||n.wakeMin==null)return null;
   var b=n.bedMin, r=n.wakeMin;
   var v=w.spo2.filter(function(x){
     var m=x[0];
     return (b<=r)?(m>=b&&m<=r):(m>=b||m<=r);
    }).map(function(x){return x[1];})
      .filter(function(x){return x>=70&&x<=100;});
   if(v.length<((typeof window.flSpo2Plancher==='function')?window.flSpo2Plancher(w,b,r):12))return null;
   if(window.flSpo2Plafonne(v))return null;   /* 2 nov. 2026 — même règle pour le bas de la nuit */
   v.sort(function(x,y){return x-y;});
   if(v.length<12)return Math.round(v[Math.min(1,v.length-1)]);   /* 27 oct. — peu de relevés : le 2e plus bas (voir flSpo2Plancher) */
   var i=(v.length-1)*0.10, lo=Math.floor(i);
   var p=v[lo]+(v[Math.min(lo+1,v.length-1)]-v[lo])*(i-lo);
   return Math.round(p);
  }catch(e){return null;}};
   try{
    var _auj=(typeof tk==='function')?tk():null;
    if(!K||K===_auj)return _calcul(K);
    var _sc=null; try{_sc=DB.tampon('sensor_')+'|'+DB.tampon('watch_')+'|'+DB.tampon('sessions_')+'|'+DB.tampon('hrfine_')+'|'+DB.tampon('recov');}catch(e){_sc=null;}
    if(_sc==null)return _calcul(K);
    var _m=window._flSpo2BasMemo; if(!_m||_m.__sceau!==_sc){_m=window._flSpo2BasMemo={__sceau:null};_m.__sceau=_sc;}
    if(Object.prototype.hasOwnProperty.call(_m,K)){var _g=_m[K];return (_g&&typeof _g==='object')?JSON.parse(JSON.stringify(_g)):_g;}
    var _r=_calcul(K);
    _m[K]=(_r&&typeof _r==='object')?JSON.parse(JSON.stringify(_r)):_r;
    return _r;
   }catch(e){return _calcul(K);}
  };
  window.flSpo2BasNuit=function(off){return window.flSpo2BasNuitDe(((typeof window.flCleJourCourant==='function')?window.flCleJourCourant:tk)(Math.min(0,off|0)));};

  /* ═══ 19 nov. 2026 — SUR LE FITCARE, L'OXYGÈNE SE JUGE CONTRE SON HABITUDE ════════════════════════
     Dino, après « rebranche la SpO2 » et mes chiffres (le capteur lit 99-100, deux points au-dessus de
     WHOOP, sans le suivre) : « on s'en fout. Tu la branches d'une certaine manière : on sait comment
     il renvoie la SpO2, donc on sait que si c'est en dessous, c'est pas bon. »

     CE QUE CE CAPTEUR SAIT DIRE. Un relevé par heure (six à dix par nuit), 68 % à 100. Le seuil
     médical de 90 % (`SeuilOxygene`, natif) ne peut pas tomber : la carte était verte quoi qu'il
     arrive. Ce qui se lit, c'est un NIVEAU — la moyenne des relevés de la nuit — et son écart à
     l'habitude de la personne SUR CE BRACELET. Mesuré sur les 19 nuits du 1er au 19 nov. :
       · la moyenne de nuit va de 98,3 à 100 (arrondie : 98 une fois, 99 onze fois, 100 sept fois) ;
       · le « bas » (2e relevé le plus bas) va de 95 à 100 et s'effondre sur UN poignet mal posé : le
         7 nov., deux relevés à 95 sur six — et WHOOP y lit sa meilleure nuit (97,2). La moyenne, elle,
         reste à 98,3. On juge donc la moyenne, pas le creux (qu'un relevé par heure ne voit pas).
     LA RÈGLE. Sur une nuit Fitcare (pas une nuit mêlée à l'ancien bracelet) :
       · `niveau` = moyenne des relevés de la fenêtre de sommeil, AFFICHÉE à l'entier ;
       · l'habitude = la médiane des niveaux affichés des `nuits` (30) jours précédents, dès `mini` (7)
         nuits mesurées ; la marge = max(`marge` 2 points, 2,5 écarts-types arrondis au-dessus) ;
       · ORANGE (« plus bas que d'habitude ») quand le niveau affiché est à la marge ou plus sous
         l'habitude — pour Dino : habitude 99, orange à 97 % et moins ; aucune de ses 19 nuits ;
       · sous 90 %, orange de toute façon (la borne médicale reste).
     Une nuit toute à 100 a ICI son chiffre (100) : sur cette échelle, c'est le haut de l'habitude,
     pas une mesure absolue. L'ancien bracelet garde son « bas de la nuit » et son plancher, inchangés.
     Le natif lit `niveau`, `normale`, `seuilPerso`, `sousHabitude` (MoniteurSante.swift) ; un binaire
     d'avant les ignore et garde son plancher. Banc : tests/test-spo2-habitude.js. */
  window.flSpo2Perso={nuits:30,mini:7,marge:2,kSigma:2.5};
  window._flSpo2NiveauMemo={__sceau:null};
  window.flSpo2NiveauNuitDe=function(K){
   var _calcul=function(K){try{
    if(!window.FL_SPO2_FITCARE_FIABLE)return null;
    var w=DB.get('watch_'+K,null);
    if(!w||typeof window.flInstrumentVfc!=='function'||window.flInstrumentVfc(w.marque)!=='fitcare')return null;
    if(typeof flMatiereNuit==='function')w=flMatiereNuit(K,w);
    if(!w||!w.spo2||!w.spo2.length)return null;
    if(typeof window.flInstrumentVfc==='function'&&window.flInstrumentVfc(w.marque)!=='fitcare')return null;   /* la veille recollée venait de l'autre bracelet */
    var n=w.night;
    if(!n||n.bedMin==null||n.wakeMin==null)return null;
    var b=n.bedMin, r=n.wakeMin;
    var v=w.spo2.filter(function(x){var m=x[0];return (b<=r)?(m>=b&&m<=r):(m>=b||m<=r);})
      .map(function(x){return x[1];}).filter(function(x){return x>=70&&x<=100;});
    if(v.length<((typeof window.flSpo2Plancher==='function')?window.flSpo2Plancher(w,b,r):12))return null;
    var s=0; for(var i=0;i<v.length;i++)s+=v[i];
    return Math.round(10*s/v.length)/10;
   }catch(e){return null;}};
   try{
    var _auj=(typeof tk==='function')?tk():null;
    if(!K||K===_auj)return _calcul(K);
    var _sc=null; try{_sc=DB.tampon('sensor_')+'|'+DB.tampon('watch_')+'|'+DB.tampon('sessions_')+'|'+DB.tampon('hrfine_')+'|'+DB.tampon('recov')+'|'+(window.FL_SPO2_FITCARE_FIABLE?1:0);}catch(e){_sc=null;}
    if(_sc==null)return _calcul(K);
    var _m=window._flSpo2NiveauMemo; if(!_m||_m.__sceau!==_sc){_m=window._flSpo2NiveauMemo={__sceau:null};_m.__sceau=_sc;}
    if(Object.prototype.hasOwnProperty.call(_m,K))return _m[K];
    var _r=_calcul(K); _m[K]=_r; return _r;
   }catch(e){return _calcul(K);}
  };
  /* `cle(q)` rend la clé du jour situé q jours AVANT celui qu'on juge (q = 0 : lui-même). */
  window.flSpo2Habitude=function(cle){
   try{
    var P=window.flSpo2Perso, niv=window.flSpo2NiveauNuitDe(cle(0));
    if(niv==null)return null;
    var out={niveau:niv, affiche:Math.round(niv), n:0, normale:null, seuil:null, sous:false}, vals=[];
    for(var q=1;q<=P.nuits;q++){var x=null; try{x=window.flSpo2NiveauNuitDe(cle(q));}catch(e){} if(x!=null)vals.push(Math.round(x));}
    out.n=vals.length;
    if(vals.length<P.mini)return out;
    vals.sort(function(a,b){return a-b;});
    var med=vals.length%2?vals[vals.length>>1]:(vals[vals.length/2-1]+vals[vals.length/2])/2;
    var moy=0; for(var i=0;i<vals.length;i++)moy+=vals[i]; moy/=vals.length;
    var va=0; for(var j=0;j<vals.length;j++)va+=(vals[j]-moy)*(vals[j]-moy);
    var sigma=Math.sqrt(va/vals.length);
    out.normale=Math.round(med); out.sigma=Math.round(sigma*100)/100;
    out.seuil=out.normale-Math.max(P.marge,Math.ceil(P.kSigma*sigma));
    out.sous=out.affiche<=out.seuil;
    return out;
   }catch(e){return null;}
  };
  /* La ligne du Moniteur (index.html, juste avant de la rendre) : sur une nuit Fitcare mesurée, la valeur
     LUE devient le niveau, la série devient celle des niveaux, et l'habitude voyage en nombres. Sinon la
     ligne n'est pas touchée. */
  window.flSpo2PourMoniteur=function(l,off){
   try{
    var cleJ=(typeof window.flCleJourCourant==='function')?window.flCleJourCourant:tk, o=Math.min(0,off|0);
    var h=window.flSpo2Habitude(function(q){return cleJ(o-q);});
    if(!h)return l;
    l.valeur=String(h.affiche); l.bas=h.affiche; l.niveau=true; l.nuits=h.n;
    if(h.normale!=null){l.normale=h.normale; l.seuilPerso=h.seuil; l.sousHabitude=!!h.sous;}
    var sp=[]; for(var q=21;q>=0;q--){var v=null; try{v=window.flSpo2NiveauNuitDe(cleJ(o-q));}catch(e){} sp.push(v==null?null:Math.round(v));}
    l.sparkBas=sp;
   }catch(e){}
   return l;
  };
