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
  window._flSpo2NuitMemo={__sceau:null};
  window.flSpo2NuitDe=function(K){
   var _calcul=function(K){try{
   var w=DB.get('watch_'+K,null);
   if(!w||!w.spo2||!w.spo2.length)return null;
   var n=w.night;
   if(!n||n.bedMin==null||n.wakeMin==null)return null;
   var b=n.bedMin, r=n.wakeMin;
   var v=w.spo2.filter(function(x){
     var m=x[0];
     return (b<=r)?(m>=b&&m<=r):(m>=b||m<=r);
    }).map(function(x){return x[1];})
      /* Bornes physiologiques. Un zero est une non-lecture, pas une asphyxie. */
      .filter(function(x){return x>=70&&x<=100;});
   if(v.length<12)return null;
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
  window.flSpo2Nuit=function(off){return window.flSpo2NuitDe(tk(Math.min(0,off|0)));};

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
   if(!w||!w.spo2||!w.spo2.length)return null;
   var n=w.night;
   if(!n||n.bedMin==null||n.wakeMin==null)return null;
   var b=n.bedMin, r=n.wakeMin;
   var v=w.spo2.filter(function(x){
     var m=x[0];
     return (b<=r)?(m>=b&&m<=r):(m>=b||m<=r);
    }).map(function(x){return x[1];})
      .filter(function(x){return x>=70&&x<=100;});
   if(v.length<12)return null;
   v.sort(function(x,y){return x-y;});
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
  window.flSpo2BasNuit=function(off){return window.flSpo2BasNuitDe(tk(Math.min(0,off|0)));};