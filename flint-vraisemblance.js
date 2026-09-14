/* Le metier de ce fichier : LA VRAISEMBLANCE PHYSIOLOGIQUE — le juge qui
   croise le pouls et les pas, et ce qui en découle pour la fiche.

   Liaisons de script : `tk` se lit NU (garde-liaisons) ; `flPasParMinute`,
   `flZonesBpm`, `flFcFiable` et `flIntensiteSeance` vivent dans index.html et
   se testent par `typeof` — une liaison de fichier se teste, elle ne se
   suppose pas. Le banc : tests/test-fc-vraisemblance.js ; le rejeu terrain :
   outils/rejeu-course-10k.js.

   ═══ LE CAS FONDATEUR — LA COURSE DU 30 AOÛT 2026 ═══════════════════════════

   10,15 km en 53 minutes à 151 pas/min — et une sangle qui glisse. Le capteur
   optique n'a pas rendu des trous : il a accroché le rythme du MOUVEMENT et
   rendu 85-125 bpm, lisses et réguliers, pendant 45 minutes (WHOOP, même
   course : plateau 160-170). Le juge de stabilité (`flFcFiable` v1790) ne
   pouvait rien voir — la série était fausse mais DOUCE — et la fiche a servi
   108 bpm, 240 kcal, 7,4/20 comme des états du cœur. La même course, la
   veille, avec la même chaîne : 160 de moyenne, 183 de max, 745 kcal. Le
   dossier complet, preuves et bornes : RAPPORT-COURSE-10K-30-AOUT.md.

   LA RÈGLE : courir à 130 pas/min et plus pendant 20 minutes et plus, avec un
   pouls sous la borne de la zone 2 plus de 70 % du temps, n'existe pas. Les
   seuils sont pris LARGES pour ne jamais condamner un vrai effort doux :
     · 130 pas/min = une cadence de COURSE tenue, pas une marche rapide
       (la marche de Dino plafonne à ~115) ;
     · 20 minutes = jamais un sprint ni un fractionné court ;
     · 70 % du temps sous Z2 = un fractionné qui alterne reste en dessous,
       la course décrochée du 30 août était à 89 %, la réussie du 29 à 6 %.
   Trois témoins indépendants du capteur cardiaque : les pas viennent de
   l'accéléromètre de la montre, les bornes du gel quotidien des zones. */

/* ═══ LES ARTEFACTS DE NOTRE PROPRE MESURE DE VARIABILITE ═══════════════════
   Deplacees ici en v2064 depuis index.html (meme metier, cliquet du
   decoupage) — le texte des deux fonctions n a pas bouge, seule la liaison
   `watchOf` se teste desormais par typeof (regle des fichiers de script). */
window.flVfcArtefacts=function(K,seuil){
 try{
  /* LE SEUIL VIT DANS LA FONCTION, et c'est un banc qui l'a exige : pose en
     constante juste au-dessus, il etait hors du bloc extrait par les tests —
     la fonction tombait dans son propre catch et rendait « aucun artefact ».
     Une regle qui depend d une valeur qu on peut lui retirer n est pas une
     regle, c est une coincidence de portee. */
  seuil=(seuil==null?12:seuil);
  var w=(typeof watchOf==='function')?watchOf(K):null; if(!w)return {};
  var vfc={},n=0;
  ((w&&w.hrvMontre)||[]).forEach(function(e){if(e&&e[0]!=null)vfc[e[0]]=1;});
  if(!n&&!Object.keys(vfc).length)return {};
  var hr={};
  ((w&&w.hr)||[]).forEach(function(x){if(x&&x[1])hr[x[0]]=x[1];});
  var out={};
  Object.keys(vfc).forEach(function(k){
   var m=+k; if(hr[m]==null)return;
   /* ═══ LES VOISINES SONT LES MINUTES D A COTE, ET RIEN D AUTRE ═════════
      La premiere version cherchait jusqu a trois minutes de part et d autre,
      en sautant les minutes de mesure. Un banc l a prise en faute : sur un
      VRAI decrochage de plusieurs minutes, cette recherche ENJAMBAIT la
      panne et rapportait un 118 d avant la chute. La minute basse paraissait
      alors artificielle et se faisait retirer — la correction blanchissait
      exactement ce qu elle doit laisser visible.

      L artefact qu on traque est une chute D UNE SEULE MINUTE, par
      construction : les mesures de variabilite sont espacees de cinq
      minutes, donc m-1 et m+1 n en portent jamais. Exiger l adjacence
      stricte suffit, ne demande aucun seuil de plus, et rend impossible de
      raisonner par-dessus un trou. Une voisine manquante ? On ne juge pas. */
   var g=hr[m-1], d=hr[m+1];
   if(g==null||d==null)return;
   /* ═══ UN CREUX EST UN CREUX DES DEUX COTES ════════════════════════════
      On comparait a la MOYENNE des deux voisines. Un banc l a prise en
      faute au BORD d un vrai decrochage : avec 118 avant et 53 apres, la
      moyenne tombe a 85 et la premiere minute de la panne (55) passait pour
      un artefact. On retirait donc la piece a conviction par le bord.

      La bonne definition ne demande aucun nombre de plus : la minute doit
      etre plus basse que CHACUNE de ses deux voisines, du meme ecart. Un
      creux d une minute (98, 52, 99) la satisfait des deux cotes ; un bord
      de decrochage (118, 55, 53) ne la satisfait que d un seul. */
   if(hr[m]-g <= -seuil && hr[m]-d <= -seuil)out[m]=1;
  });
  return out;
 }catch(e){return {};}
};

/* La meme chose, sur une fenetre : rend la serie DEBARRASSEE de ces minutes.
   `hors` recoit le compte, pour que l ecran puisse le dire. */
window.flHrSansArtefactVfc=function(K,pts,hors){
 try{
  var a=flVfcArtefacts(K);
  if(!a||!Object.keys(a).length)return pts;
  var out=pts.filter(function(x){return !a[x[0]];});
  if(hors)hors.n=pts.length-out.length;
  return out;
 }catch(e){return pts;}
};


/* Le verdict sur une fenêtre : `pts` est la série minute [minute, bpm] DÉJÀ
   filtrée à la fenêtre par l'appelant (flFcFiable lui passe la sienne, nettoyée
   des artefacts VFC — le juge voit la même pièce que le juge de stabilité).
   Rend null quand un témoin manque : sans cadence, on ne préjuge pas. */
window.flFcVraisemblance=function(K,debutMin,finMin,pts){
 try{
  if(!pts||!pts.length)return null;
  var ppm=(typeof flPasParMinute==='function')?flPasParMinute(K):null;
  if(!ppm||!ppm.m)return null;
  var m0=Math.max(0,debutMin|0),m1=Math.min(1440,finMin|0),minutesCourse=0;
  for(var mm=m0;mm<m1;mm++)
   if(ppm.vu&&ppm.vu[mm]&&(ppm.m[mm]||0)>=130)minutesCourse++;
  if(minutesCourse<20)return {incoherent:false,minutesCourse:minutesCourse,partSousZ2:null,raison:null};
  var B=null;try{B=(typeof flZonesBpm==='function')?flZonesBpm(K):null;}catch(e){}
  var z2lo=(B&&B[1])||134,sous=0;
  pts.forEach(function(x){if(x[1]<z2lo)sous++;});
  var part=Math.round(100*sous/pts.length);
  if(sous/pts.length<=0.7)return {incoherent:false,minutesCourse:minutesCourse,partSousZ2:part,raison:null};
  return {incoherent:true,minutesCourse:minutesCourse,partSousZ2:part,
   raison:minutesCourse+' minutes a cadence de course (130 pas/min et plus) '
    +'avec un pouls sous '+z2lo+' bpm '+part+' % du temps — le capteur a '
    +'probablement perdu le pouls (sangle a resserrer)'};
 }catch(e){return null;}
};

/* ═══ LES CALORIES D'UNE FENÊTRE INCOHÉRENTE ═════════════════════════════════
   Keytel, nourri de la série décrochée, rendait 240 kcal pour 10 km — la
   formule était juste, l'entrée fausse. Et la valeur STOCKÉE ne vaut pas
   mieux : elle a été dérivée de la même série à la réconciliation. Ce
   prédicat dit à `flKcalActivite` de sauter le stocké ET la dérivation pour
   tomber sur son forfait du bas (durée × intensité déclarées — 530 sur la
   course du 30, contre ~750 réels : imprécis et assumé, jamais absurde).
   Le verdict se mémorise par fenêtre pour les journées passées, comme la
   dérivation elle-même (`_flKcMemo`) : les pastilles à 45 jours relisent. */
window.flKcalFcIncoherente=function(k,s,debut,fin){
 try{
  if(!s||typeof flFcFiable!=='function')return false;
  var s0=(debut!=null)?debut:s.startMin;
  if(s0==null&&s.start){var q=(''+s.start).split(':');s0=(+q[0])*60+(+q[1]);}
  var d0=(fin!=null&&s0!=null)?(fin-s0):(+(s.dur)||0);
  if(s0==null||!(d0>0))return false;
  var jr=(typeof tk==='function')?tk():null;
  var fige=(jr!=null&&k!==jr),ci=k+'|'+s0+'|'+(s0+d0);
  window._flFcIncoMemo=window._flFcIncoMemo||{};
  if(fige&&window._flFcIncoMemo[ci]!==undefined)return window._flFcIncoMemo[ci];
  var fj=flFcFiable(k,s0,s0+d0);
  var r=!!(fj&&fj.incoherent);
  if(fige)window._flFcIncoMemo[ci]=r;
  return r;
 }catch(e){return false;}
};

/* ═══ LES BORNES DE LA FICHE SONT CELLES DU JOUR ═════════════════════════════
   `FLEFF_Z` portait 106/134/148/162/176 codés en dur — la table de la v1558,
   figée pendant que `flZonesBpm` apprenait les bornes personnelles (v1877
   Karvonen, porte manuelle). Le 30 août, la fiche affichait « 162 à 175 »
   quand les bornes du jour (zonesJour_2026-8-30) valaient [104,134,149,163,
   178] : le score se calculait sur un découpage, l'écran en montrait un
   autre. Cette fabrique rend la table complète (libellés, couleurs de la
   palette v1685 — LA PALETTE VIT DANS LA FICHE, on ne fait que la recopier
   ici avec elle) sur les bornes FIGÉES du jour demandé, ou `null` si le gel
   n'est pas lisible : l'appelant garde alors ses littéraux. */
window.flZonesFiche=function(K){
 try{
  var pal=[{z:5,lab:'ZONE 5',col:'#ff3b30'},{z:4,lab:'ZONE 4',col:'#ff8a1e'},
           {z:3,lab:'ZONE 3',col:'#f5c518'},{z:2,lab:'ZONE 2',col:'#4f92c8'},
           {z:1,lab:'ZONE 1',col:'#b6c8d6'},{z:0,lab:'ZONE 0',col:'#e8edf1'}];
  var B=(typeof flZonesBpm==='function')?flZonesBpm(K):null;
  if(!B||B.length!==5||!B.every(function(x,i){return x>0&&(i===0||x>B[i-1]);}))
   return null;
  return pal.map(function(p){
   var lo=(p.z===0)?0:B[p.z-1];
   var hi=(p.z===5)?9999:B[p.z]-1;
   var range=(p.z===0)?('< '+B[0]+' BPM')
            :(p.z===5)?('> '+(B[4]-1)+' BPM')
            :(lo+' – '+hi+' BPM');
   return {z:p.z,lab:p.lab,range:range,col:p.col,lo:lo,hi:hi};
  });
 }catch(e){return null;}
};
