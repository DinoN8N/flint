/* Le metier de ce fichier : LE FUSEAU HORAIRE D'UN JOUR — etablir, conserver
   et relire le decalage en vigueur quand une journee a ete enregistree, et
   convertir dans les deux sens entre un instant absolu et le cadran de ce
   jour-la. Liaisons de script : `watchOf`, `DB` et `tk` se lisent NUS (jamais
   window.*), comme flint-porte.js et flint-menage.js. Les bancs :
   tests/test-fuseaux.js.

   ═══ POURQUOI CE FICHIER EXISTE — v2130, 2 septembre 2026 ══════════════════

   Il ne vient pas d'un besoin neuf. Ce code vivait dans index.html depuis la
   v1766 ; il en sort parce que le fichier a franchi son plafond de decoupage
   (37 500 lignes) a la v2127, et que la garde de build refusait de construire
   l'app. Monter le plafond n'est pas une correction, la garde le dit elle-meme :
   c'est la defaite du rangement en versements mensuels.

   LE FUSEAU ETAIT LE BON CANDIDAT, et pas seulement parce qu'il fait la bonne
   taille. C'est un metier ENTIER et FERME : six fonctions qui ne parlent qu'entre
   elles et ne connaissent du reste du moteur que `watchOf` et `DB`. Rien de ce
   qui restait dans index.html ne s'y raccroche autrement que par un appel.

   CE QUI N'A PAS BOUGE D'UN CARACTERE : le corps des six fonctions, leurs
   commentaires, et l'ordre dans lequel elles se declarent. Un deplacement qui
   corrige en meme temps est un deplacement qu'on ne peut plus relire. Le seul
   ajout est cet en-tete.

   L'ORDRE DE CHARGEMENT EST SUR, et il se verifie : le bloc de <script> qui
   charge les flint-*.js est a la ligne 2880 d'index.html, ces fonctions y
   vivaient a la 3162. Elles sont donc definies PLUS TOT qu'avant, pas plus
   tard. Et elles ne sont de toute facon appelees qu'a l'execution. */

/* ═══ LE FUSEAU D'UN JOUR — v1766 ═══════════════════════════════════════════
   Une donnee historique ne change pas de sens parce que le telephone a change
   de pays. Une randonnee faite a 15h07 a La Reunion a bien eu lieu a 15h07 ;
   relue depuis Paris elle ne devient pas 13h07. Un jour porte donc, quand on a
   pu l etablir, le decalage qui etait en vigueur quand il a ete enregistre.

     watch_<K>.tz = { off: 240, src: 'mesure'|'herite', le: '2026-8-20' }

   `src` dit d ou vient le decalage, et l absence de `tz` dit qu on ne sait pas.
   On ne remplit JAMAIS un decalage inconnu : un jour sans `tz` se lit comme
   avant, et c est un etat legitime, pas une lacune a combler. */
window.flFuseauDe=function(K){
 try{var w=(typeof watchOf==='function')?watchOf(K):DB.get('watch_'+K,null);
     if(w&&w.tz&&typeof w.tz.off==='number'&&isFinite(w.tz.off))return w.tz;}catch(e){}
 return null;
};

/* MINUIT LOCAL DU JOUR K, en SECONDES absolues — le point de conversion unique.
   Neuf endroits refaisaient ce calcul chacun de leur cote, avec le fuseau du
   LECTEUR : les minutes tirees de `actDet` se decalaient au voyage pendant que
   celles de `hr`, figees a l ecriture, ne bougeaient pas. Les deux canaux
   decrivaient le meme instant et ne disaient plus la meme heure.

   SANS decalage connu, cette fonction rend EXACTEMENT ce que rendait le code
   d avant, a la seconde. C est ce qui rend la bascule reversible : retirer les
   `tz` restitue le comportement d hier. */
window.flMinuitDe=function(K){
 var p=String(K||'').split('-'); if(p.length!==3)return NaN;
 var y=+p[0],m=+p[1],d=+p[2];
 if(!isFinite(y)||!isFinite(m)||!isFinite(d))return NaN;
 var f=flFuseauDe(K);
 if(f)return Date.UTC(y,m-1,d,0,0,0)/1000 - f.off*60;
 return new Date(y,m-1,d,0,0,0,0).getTime()/1000;
};
window.flMinuitMsDe=function(K){var s=flMinuitDe(K);return isNaN(s)?NaN:s*1000;};

/* LE SENS INVERSE — projeter un instant absolu dans le cadran d un jour donne.
   Le sommeil, lui, stocke des instants ; c est sa projection qui doit employer
   le decalage d ENREGISTREMENT. Sans `off`, on retombe sur le fuseau courant,
   c est-a-dire sur le comportement d avant. */
window.flCleLocaleDe=function(ms,off){
 try{
  if(off==null){var d=new Date(ms);return d.getFullYear()+'-'+(d.getMonth()+1)+'-'+d.getDate();}
  var u=new Date(ms+off*60000);
  return u.getUTCFullYear()+'-'+(u.getUTCMonth()+1)+'-'+u.getUTCDate();
 }catch(e){return null;}
};
window.flMinuteLocaleDe=function(ms,off){
 try{
  if(off==null){var d=new Date(ms);return d.getHours()*60+d.getMinutes();}
  var u=new Date(ms+off*60000);return u.getUTCHours()*60+u.getUTCMinutes();
 }catch(e){return null;}
};

/* POSER LE FUSEAU DES L ECRITURE — v1767.
   Ce n est pas une inference : au moment ou on ecrit la journee, le fuseau du
   telephone EST celui de l enregistrement. C est la seule information de
   contexte qui soit CONNUE, et elle ne l est qu a cet instant.

   ET C EST AUSSI CELUI QUI A SERVI A DECODER. Le codec V8 convertit l heure de
   cadran de la montre avec `[NSTimeZone localTimeZone]` — le fuseau du telephone
   A LA RECEPTION. Les horodatages qu on range portent donc deja ce contexte : le
   noter, c est rendre explicite ce qui etait deja la, implicite et perdu.

   WRITE-ONCE. Un `tz` deja etabli n est JAMAIS ecrase — sinon une journee
   changerait de contexte a chaque relecture, ce qui est exactement le defaut
   qu on ferme. La recuperation retroactive ne reste qu un filet pour l ancien.

   ON NE POSE QUE SUR UNE ECRITURE REELLE. Les chemins de purge et le semis de
   demo reecrivent des journees sans rien produire : les etiqueter avec le fuseau
   du jour ou la purge tourne serait inventer un contexte. */
window.flPoserFuseauCourant=function(w,K){
 try{
  if(!w||typeof w!=='object')return w;
  if(w.tz&&typeof w.tz.off==='number'&&isFinite(w.tz.off))return w;
  var p=String(K||'').split('-'); if(p.length!==3)return w;
  /* Midi, et non minuit : un jour de bascule d heure n a pas d offset unique a
     minuit, et midi tombe toujours du bon cote. */
  var d=new Date(+p[0],(+p[1])-1,+p[2],12,0,0);
  if(isNaN(d.getTime()))return w;
  /* v2127 — UN FUSEAU NE S'APPLIQUE PAS À UN JOUR QU'IL N'A PAS MESURÉ.
     `wSaveK` ne passe pas que sur aujourd'hui, et write-once fige l'erreur :
     20 jours sur 32 étaient étiquetés `le:'2026-8-20'`. Pas cosmétique —
     `flMinuitDe` FABRIQUE l'instant absolu depuis cet offset. Le pourquoi
     mesuré : CHANTIER-PORTE-DU-MATIN.md ; les gardes : test-fuseaux.js 15b. */
  var auj=(typeof tk==='function')?tk():null, hier=(typeof tk==='function')?tk(-1):null;
  if(auj&&K!==auj&&K!==hier)return w;
  w.tz={off:-d.getTimezoneOffset(), src:'courant', le:auj};
  return w;
 }catch(e){return w;}
};

/* ═══ 21 sept. 2026 — LE FUSEAU A CHANGÉ SOUS LE MOTEUR ═══════════════════
   Appelé par le natif (`ShellBridge.changementDeTemps`) quand iOS signale un
   changement de fuseau, d heure d ete ou d horloge. Le moteur ne detecte rien
   lui-meme : `new Date()` suit deja le telephone, mais ce qu il a MEMORISE
   (la journee logique, l ecran rendu) porte encore l ancien minuit.
   On oublie, on redessine. Rien n est ecrit : les journees etiquetees `tz`
   gardent leur minuit d enregistrement, et celle d aujourd hui, non encore
   etiquetee, se relit au fuseau du lieu — c est le contrat de la v1766. */
window.flFuseauChange=function(){
 try{if(typeof flJourLogiqueOublier==='function')flJourLogiqueOublier();}catch(e){}
 try{if(typeof renderToday==='function')renderToday();}catch(e){}
};

/* RETROUVER LE FUSEAU D UN JOUR — le filet de l historique ancien.

   ⚠ CE QU IL RETROUVE EXACTEMENT, ET C EST PLUS ETROIT QUE JE NE L AI D ABORD
   ECRIT. `night.hrTs` n est PAS une mesure independante : `flsHrTs()`
   (flint-sommeil.js) le FABRIQUE depuis `w.hr` avec le minuit du fuseau courant
   au moment du re-staging. L appariement est donc circulaire — il retrouve LE
   FUSEAU EN VIGUEUR AU DERNIER RE-STAGING de cette journee, pas celui de
   l enregistrement.

   Pour l historique de Dino les deux coincident : tout a ete enregistre ET
   re-stage a La Reunion, d ou les 19 jours a +240. Mais une journee ancienne
   re-stagee APRES un voyage rendrait le fuseau d arrivee. On note donc `lu`,
   le decalage du lecteur au moment ou ce filet a tourne : sans lui, rien ne
   permettrait de distinguer un contexte retrouve d un contexte contamine.

   DEPUIS LA v1767 CE FILET NE SERT QU AU PASSE : `flPoserFuseauCourant` pose le
   contexte des l ecriture, donc aucune journee nouvelle n en depend.

   Le principe reste : pour un decalage candidat, on compte combien de battements
   tombent sur la meme minute avec la meme valeur.

   Sur les 19 jours qui portent la paire, le bon decalage rassemble de 328 a
   1333 accords quand le suivant n en rassemble que 64 a 227 : le signal ecrase
   le bruit. On exige quand meme deux garde-fous, parce qu un jour pauvre en
   mesures pourrait ne pas trancher — et un decalage mal tranche vaudrait moins
   que pas de decalage du tout. */
window.flRetrouverFuseau=function(K){
 try{
  var w=null;try{w=DB.get('watch_'+K,null);}catch(e){}
  if(!w||!w.hr||!w.hr.length)return null;
  var ts=(w.night&&w.night.hrTs)||null;
  if(!ts||!ts.length)return null;
  var parMin={};
  for(var i=0;i<w.hr.length;i++){var x=w.hr[i];if(x&&x.length>1)parMin[x[0]]=x[1];}
  var p=String(K).split('-'); if(p.length!==3)return null;
  var utc=Date.UTC(+p[0],(+p[1])-1,+p[2],0,0,0)/1000;
  var meilleur=null, second=0;
  /* Les fuseaux du monde vont de -12:00 a +14:00, par quarts d heure. */
  for(var o=-720;o<=840;o+=15){
   var t0=utc-o*60, ok=0;
   for(var j=0;j<ts.length;j++){
    var e=ts[j]; if(!e||e.length<2)continue;
    var m=Math.round((e[1]-t0)/60);
    if(m<0||m>=1440)continue;
    var v=parMin[m];
    /* Une tolerance d un battement : les deux canaux arrondissent la minute
       chacun de leur cote, ils ne sont pas tenus a l identite stricte. */
    if(v!=null&&Math.abs(v-e[0])<=1)ok++;
   }
   if(!meilleur||ok>meilleur.ok){second=meilleur?meilleur.ok:second;meilleur={off:o,ok:ok};}
   else if(ok>second)second=ok;
  }
  if(!meilleur)return null;
  if(meilleur.ok<30)return null;              /* trop peu d accords pour conclure */
  if(meilleur.ok<second*2)return null;        /* pas assez tranche */
  return {off:meilleur.off, ok:meilleur.ok, second:second};
 }catch(e){return null;}
};

/* LA MIGRATION — additive, idempotente, reversible.
   Elle n ecrit QUE le champ `tz`. Aucune valeur stockee n est transformee,
   aucune entree creee ni supprimee : `actDet`, `hr`, `hrfine`, `startMin` et le
   GPS sont tous exprimes RELATIVEMENT au minuit du jour, donc epingler le
   decalage les remet d accord sans y toucher.

   Un jour dont le decalage ne se retrouve pas reste SANS `tz` : il se lit comme
   avant. C est un etat legitime, pas une lacune a combler — et le compte rendu
   le nomme. */
window.flMigrerFuseaux=function(opts){
 opts=opts||{};
 var r={jours:0, mesures:0, deja:0, sans:[], erreurs:0};
 var cles=[];
 try{for(var i=0;i<localStorage.length;i++){var k=localStorage.key(i);
      if(k&&k.indexOf('watch_')===0)cles.push(k.slice(6));}}catch(e){return r;}
 cles.sort();
 for(var c=0;c<cles.length;c++){
  var K=cles[c], w=null;
  try{w=DB.get('watch_'+K,null);}catch(e){r.erreurs++;continue;}
  if(!w||typeof w!=='object')continue;
  r.jours++;
  if(w.tz&&typeof w.tz.off==='number'){r.deja++;continue;}
  var f=flRetrouverFuseau(K);
  if(!f){r.sans.push(K);continue;}
  /* `src:'restage'` et non `'mesure'` : voir l avertissement sur `flsHrTs`.
     `lu` est le decalage du LECTEUR pendant la passe — la seule chose qui
     permette, plus tard, de savoir si ce contexte a pu etre contamine. */
  var _lu=null;try{_lu=-(new Date().getTimezoneOffset());}catch(e){}
  w.tz={off:f.off, src:'restage', le:(typeof tk==='function'?tk():null),
        lu:_lu, ok:f.ok, second:f.second};
  try{DB.set('watch_'+K,w);r.mesures++;}
  catch(e){r.erreurs++;delete w.tz;}
 }
 try{if(typeof flJourLogiqueOublier==='function')flJourLogiqueOublier();}catch(e){}
 return r;
};
