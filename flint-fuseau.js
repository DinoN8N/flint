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
 try{if(typeof window.flFuseauVeiller==='function')window.flFuseauVeiller();}catch(e){}   /* 11 nov. 2026 — la journée en cours suit le téléphone (plus bas) */
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
 try{var _kc=(window.flClesChaudes?flClesChaudes():(function(){var a=[];for(var j=0;j<localStorage.length;j++)a.push(localStorage.key(j));return a;})());for(var i=0;i<_kc.length;i++){var k=_kc[i];   /* 3 oct. 2026 — le haut seulement : une journée en cave porte déjà son fuseau */
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

/* ═══ 11 nov. 2026 — LE VOYAGE AVEC UN BRACELET QUI DATE EN INSTANTS VRAIS (v3072) ═══════════

   Le Fitcare date tout en instants Unix vrais (`HistoriqueFitcare.swift`, v2935). Les portes du
   moteur, elles, rangeaient chaque mesure au jour et à la minute du fuseau COURANT du téléphone,
   alors que le jour porte l'étiquette (`tz`, écrite une fois) du fuseau où il a commencé. Après
   un vol, un jour étiqueté Paris recevait des minutes à l'heure de Dubaï. Simulé sur la nuit du
   11 nov. (Paris → Dubaï, +3 h, bascule à 04:00) : nuit de 2 h 27 au lieu de 8 h 04, et la mémoire
   du bracelet, re-livrée, réécrivait 1 208 minutes de la veille décalées de trois heures.

   CINQ RÈGLES, et aucune ne s'applique à qui ne voyage pas (un jour « d'ici » — sans étiquette,
   ou étiqueté au décalage du téléphone à MIDI de ce jour — prend partout le chemin d'avant) :

   1. `flCadranVivant(ms)` — UNE MESURE VA DANS LE CADRAN DU JOUR QUI LA REÇOIT. Si le jour du
      téléphone est étiqueté ailleurs, la minute se compte depuis SON minuit ; ce qui déborde
      avant va à la veille, ce qui déborde après au lendemain s'il porte la même étiquette, sinon
      dans `suite` (vers l'Ouest la journée du départ dure plus de 24 h : minutes ≥ 1440, rangées
      à part pour qu'aucun lecteur de la journée ne les prenne pour autre chose).
   2. `flFuseauRecaler()` — LA JOURNÉE EN COURS PASSE À L'HEURE D'ARRIVÉE, si rien n'y est encore
      scellé ni daté par quelqu'un (nuit, séance, repas, journal) : ses minutes glissent du
      décalage, son étiquette suit. C'est la nuit dans l'avion : au réveil elle se lit à l'heure
      de la montre du voyageur. Une journée déjà scellée garde son cadran (règle de la v1766).
   3. `flJourVu(K, w)` — LE LECTEUR DE NUIT LIT TOUT AU CADRAN DU TÉLÉPHONE. Une veille étiquetée
      ailleurs lui est rendue ramenée à ce cadran (avec sa `suite`), et le jour d'arrivée reçoit
      les heures que la veille tenait après son minuit à lui. Rien n'est réécrit : c'est une vue.
   4. `flFuseauVeiller()` — le changement se voit au décalage du téléphone, comparé au dernier
      vu (`flFuseauVu`) : l'app dort pendant le vol, le signal d'iOS ne suffit pas.
   5. `tz.bascule` (v3073) — LA JOURNÉE DU VOYAGE A DEUX CADRANS. Scellée, elle ne se recale pas,
      mais ses mesures d'après l'atterrissage s'écrivent à l'heure du téléphone, comme tout le
      reste de l'app ce jour-là (voir `marquer`, plus bas).

   Midi, partout : un jour de changement d'heure n'a pas de décalage unique à minuit, et son
   étiquette (posée à midi) égale alors le décalage du téléphone — il n'est jamais « ailleurs ».
   Un canal à la minute AJOUTÉ plus tard doit entrer dans `CANAUX`, sinon il ne voyage pas.
   Bancs : tests/test-fuseau-voyage-fitcare.js. Dessein et mesures : CHANTIER-FUSEAUX.md, § X2. */
(function(){
 var CANAUX=['hr','hrMasque','hrDouble','rrH','respMontre','pasPhoto','tempPhoto','spo2','pasHeure',
             'hrvMontre','stressMontre','temp','kcalBracelet','rhrEnAttente','vo2maxEnAttente'];
 /* Ce que lit la nuit, sans les compteurs de la journée (pas, calories) : copié, il ne se compte pas deux fois. */
 var NUIT=['hr','hrMasque','hrDouble','rrH','respMontre','tempPhoto','spo2','hrvMontre','stressMontre','temp'];
 function cle(d){return d.getFullYear()+'-'+(d.getMonth()+1)+'-'+d.getDate();}
 function decale(K,n){var p=String(K).split('-');return cle(new Date(+p[0],+p[1]-1,+p[2]+n,12));}
 function offMidi(K){var p=String(K).split('-');return -new Date(+p[0],+p[1]-1,+p[2],12,0,0).getTimezoneOffset();}
 function vivant(K){try{return (typeof window.flJourMontre==='function')?window.flJourMontre(K):null;}catch(e){return null;}}
 /* L'ÉCART D'UN JOUR : ce qu'il faut AJOUTER à ses minutes rangées pour lire le cadran du
    téléphone. 0 = un jour d'ici, ou sans étiquette. */
 function ecart(K){try{var f=window.flFuseauDe(K);return f?offMidi(K)-f.off:0;}catch(e){return 0;}}
 window.flJourEcart=ecart;

 window.flCadranVivant=function(ms){
  try{
   veiller();
   var d=new Date(ms); if(isNaN(d.getTime()))return null;
   var Kp=cle(d), f0=window.flFuseauDe(Kp); if(!f0)return null;
   var b=f0.bascule||null, apres=!!(b&&ms/1000>=b.t), e=offMidi(Kp)-(apres?b.off:f0.off);
   if(!e&&(!b||apres))return null;                      /* un jour d'ici — ou, le jour du voyage, une mesure d'APRÈS la bascule : le chemin d'avant, l'heure du téléphone */
   var pm=d.getHours()*60+d.getMinutes(), m=pm-e;
   if(m>=0&&m<1440){
    if(apres)return {K:Kp,m:m};
    if(b&&m>=b.m)return {K:Kp,m:m,suite:1,boite:'avant'};   /* d'AVANT la bascule, dans une case que l'après a prise (vers l'Ouest) : rangée à part */
    return e?{K:Kp,m:m}:null;
   }
   if(apres)return null;
   if(m<0){                                             /* avant SON minuit : la veille, dans son cadran à elle */
    var Kq=decale(Kp,-1), fq=window.flFuseauDe(Kq);
    if(!fq){var wq=vivant(Kq), fp=window.flFuseauDe(Kp);   /* une veille vide hérite l'étiquette du jour */
            if(!wq||!fp)return null;
            wq.tz={off:fp.off,src:'voisin',le:cle(new Date())};fq=wq.tz;}
    var mq=pm+1440-(offMidi(Kq)-fq.off);
    if(mq>=0&&mq<1440)return {K:Kq,m:mq};
    return (mq>=1440)?{K:Kq,m:mq,suite:1}:null;
   }
   var Kn=decale(Kp,1), fn=window.flFuseauDe(Kn);       /* après ses 24 h : le lendemain s'il a commencé au même cadran */
   if(fn){var mn=pm-1440-(offMidi(Kn)-fn.off); if(mn>=0&&mn<1440)return {K:Kn,m:mn};}
   return {K:Kp,m:m,suite:1};
  }catch(err){return null;}
 };
 /* Où écrire : la copie vivante du jour, ou sa `suite`. Même forme que `flJourVeille` (flint-vfc-source.js). */
 window.flCadranCible=function(cv,wGetF){
  try{var w=wGetF(cv.K); if(!w)return null;
      if(cv.suite){var bo=cv.boite||'suite';w[bo]=w[bo]||{};return {K:cv.K,w:w[bo],m:cv.m};}
      return {K:cv.K,w:w,m:cv.m};}catch(e){return null;}
 };
 /* La `suite` d'une vidange : notée valeur par valeur, versée une fois (la mémoire écrase, comme dans le jour). */
 var _suite={};
 window.flSuiteNoter=function(cv,canal,v){try{var k=cv.K+'|'+(cv.boite||'suite')+'|'+canal;(_suite[k]=_suite[k]||[]).push([cv.m,v]);}catch(e){}};
 window.flSuiteVerser=function(){
  try{
   var cles=Object.keys(_suite), jours={}; if(!cles.length)return 0;
   cles.forEach(function(k){
    var q=k.split('|'), K=q[0], canal=q[2], w=vivant(K); if(!w)return;
    var s=w[q[1]]=w[q[1]]||{}, carte={};
    (Array.isArray(s[canal])?s[canal]:[]).forEach(function(x){if(x)carte[x[0]]=x[1];});
    _suite[k].forEach(function(x){carte[x[0]]=x[1];});
    s[canal]=Object.keys(carte).map(function(m){return [+m,carte[m]];}).sort(function(a,b){return a[0]-b[0];});
    jours[K]=1;
   });
   _suite={};
   Object.keys(jours).forEach(function(K){try{window.wSaveK(K);}catch(e){}});
   return cles.length;
  }catch(e){_suite={};return 0;}
 };

 /* LA VUE AU CADRAN DU TÉLÉPHONE. `w` est la journée telle que le lecteur l'a lue (le disque ou
    la copie vivante), `lireF(K)` sa façon de lire la veille. Un jour d'ici, sans `suite`, dont la
    veille n'est pas à l'ouest du téléphone, est rendu TEL QUEL — le même objet. */
 window.flJourVu=function(K,w,lireF){                                /* `lireF(K)` : une autre façon de lire la veille (par défaut, le disque) */
  try{
   if(!w||typeof w!=='object')return w;
   var e=(w.tz&&typeof w.tz.off==='number'&&isFinite(w.tz.off))?offMidi(K)-w.tz.off:0, s=w.suite;
   var b=(w.tz&&w.tz.bascule)||null, e2=b?offMidi(K)-b.off:0, av=w.avant;   /* le jour du voyage : avant la bascule `e`, après `e2` */
   var Kv=decale(K,-1), ev=ecart(Kv);
   if(!e&&!s&&!(ev>0)&&!b)return w;
   var veille=null; if(ev>0){try{veille=lireF?lireF(Kv):JSON.parse(localStorage.getItem('watch_'+Kv)||'null');}catch(e1){veille=null;}}   /* le disque, comme les lecteurs de nuit */
   var out={}, k; for(k in w)if(Object.prototype.hasOwnProperty.call(w,k))out[k]=w[k];
   CANAUX.forEach(function(c){
    var src=Array.isArray(w[c])?w[c]:null, sx=(s&&Array.isArray(s[c]))?s[c]:null, vx=(veille&&Array.isArray(veille[c]))?veille[c]:null, ax=(av&&Array.isArray(av[c]))?av[c]:null;
    if(!sx&&!vx&&!ax&&!(src&&(e||e2)))return;
    var carte={}, ramener=function(a,d,bb,d2){for(var i=0;i<a.length;i++){var x=a[i]; if(!x||x[0]==null)continue;
      var m=+x[0]+((bb&&+x[0]>=bb.m)?d2:d); if(m<0||m>=1440)continue; var y=x.slice(); y[0]=m; carte[m]=y;}};
    var bv=(veille&&veille.tz&&veille.tz.bascule)||null;
    if(vx)ramener(vx,ev-1440,bv,bv?offMidi(Kv)-bv.off-1440:0);   /* les heures que la veille tenait après le minuit d'ici (pas celles d'après SA bascule : elles sont déjà d'ici) */
    if(ax)ramener(ax,e);                                  /* d'avant la bascule, rangées à part */
    if(src)ramener(src,e,b,e2);                           /* le jour lui-même gagne */
    if(sx)ramener(sx,e);
    out[c]=Object.keys(carte).map(function(m){return carte[m];}).sort(function(a,b){return a[0]-b[0];});
   });
   var pK=String(K).split('-');
   out._vu={ecart:e,veille:ev,minuit:Date.UTC(+pK[0],+pK[1]-1,+pK[2])/1000-offMidi(K)*60};   /* le minuit de la vue, compté comme `flMinuitDe` compte celui d'un jour d'ici */
   return out;
  }catch(err){return w;}
 };

 /* Rien de scellé ni de daté par quelqu'un : ce jour peut encore changer de cadran. */
 function ouvert(K){
  try{
   if(DB.get('nuitFige_'+K,null))return false;
   var s=DB.get('sessions_'+K,null); if(Array.isArray(s)&&s.length)return false;
   var r=DB.get('meals_'+K,null); if(r&&(Array.isArray(r)?r.length:Object.keys(r).length))return false;
   if(DB.get('journal_'+K,null))return false;
   return true;
  }catch(e){return false;}
 }
 /* LA JOURNÉE EN COURS PASSE AU CADRAN DU TÉLÉPHONE. Rend le jour recalé, ou null. */
 window.flFuseauRecaler=function(){
  try{
   var d=new Date(), Kp=cle(d), K=null;
   [Kp,decale(Kp,1),decale(Kp,-1)].forEach(function(c){            /* le jour dont les 24 h étiquetées contiennent maintenant */
    if(K)return; var f=window.flFuseauDe(c); if(!f||f.bascule||!(offMidi(c)-f.off))return;
    var m0=window.flMinuitDe(c)*1000; if(d.getTime()>=m0&&d.getTime()<m0+43200000)K=c;});              /* et JEUNE : avant midi à son cadran, sa nuit est en cours ou vient de finir. Plus tard, c'est une journée vécue là-bas : elle garde ses heures. */
   if(!K||!ouvert(K))return null;
   var w=vivant(K); if(!w)return null;
   var e=ecart(K), f0=window.flFuseauDe(K), Kq=decale(K,-1), wq=null, eq=0, n=0, ns=0, haut=false;
   CANAUX.forEach(function(c){(Array.isArray(w[c])?w[c]:[]).forEach(function(x){if(x&&x[0]!=null&&+x[0]+e>=1440)haut=true;});});
   if(haut)return null;                                            /* une minute sortirait de la journée par le haut : on ne perd rien, on ne recale pas */
   if(e<0){wq=vivant(Kq); if(!wq)return null;                      /* vers l'Ouest : ce qui précède le minuit d'ici va à la suite de la veille */
           if(!window.flFuseauDe(Kq))wq.tz={off:f0.off,src:'voisin',le:cle(d)};
           eq=offMidi(Kq)-window.flFuseauDe(Kq).off;}
   CANAUX.forEach(function(c){
    if(!Array.isArray(w[c])||!w[c].length)return;
    var garde=[], part={};
    w[c].forEach(function(x){
     if(!x||x[0]==null)return; var m=+x[0]+e;
     if(m>=0&&m<1440){var y=x.slice(); y[0]=m; garde.push(y); n++; return;}
     if(m<0&&wq){part[m+1440-eq]=x[1]; ns++;}                      /* m+1440 : la minute au cadran du téléphone, la veille ; −eq : dans le sien */
    });
    garde.sort(function(a,b){return a[0]-b[0];}); w[c]=garde;
    var ks=Object.keys(part); if(!ks.length)return;
    var su=wq.suite=wq.suite||{}, carte={};
    (Array.isArray(su[c])?su[c]:[]).forEach(function(x){if(x)carte[x[0]]=x[1];});
    ks.forEach(function(m){if(carte[m]==null)carte[m]=part[m];});
    su[c]=Object.keys(carte).map(function(m){return [+m,carte[m]];}).sort(function(a,b){return a[0]-b[0];});
   });
   /* VERS L'EST, la veille (restée à son cadran) tient encore les premières heures de cette journée-ci : celles
      d'après le minuit du téléphone. On les COPIE ici, là où rien n'est écrit — la veille garde les siennes —
      pour que les lecteurs qui ne lisent que le jour (VFC, pouls de repos, respiration) aient la nuit entière
      sans attendre que le bracelet re-livre sa mémoire. */
   var nc=0;
   if(e>0){var wv=vivant(Kq), ev=wv?ecart(Kq):0;
    if(wv&&ev>0)NUIT.forEach(function(c){
     var a=Array.isArray(wv[c])?wv[c]:[]; if(!a.length)return;
     var carte={}, aj=0; (Array.isArray(w[c])?w[c]:[]).forEach(function(x){if(x&&x[0]!=null)carte[x[0]]=x;});
     a.forEach(function(x){if(!x||x[0]==null)return; var m=+x[0]+ev-1440; if(m<0||m>=1440||carte[m])return; var y=x.slice(); y[0]=m; carte[m]=y; aj++;});
     if(aj){w[c]=Object.keys(carte).map(function(m){return carte[m];}).sort(function(p,q){return p[0]-q[0];}); nc+=aj;}
    });}
   if(w.night&&!DB.get('nuitFige_'+K,null))delete w.night;        /* une lecture provisoire, faite à l'ancien cadran : elle se refera */
   w.tz={off:offMidi(K),src:'recale',le:cle(d),de:f0.off};
   try{window.wSaveK(K); if(ns)window.wSaveK(Kq);}catch(e2){}
   try{if(typeof window.flsOublierMinuits==='function')window.flsOublierMinuits();}catch(e3){}
   try{if(typeof flJourLogiqueOublier==='function')flJourLogiqueOublier();}catch(e4){}
   try{console.log('[flint] fuseau : la journée '+K+' passe au cadran du téléphone ('+(e>0?'+':'')+e+' min) — '+n+' minute(s) gardée(s), '+ns+' rendue(s) à la veille, '+nc+' copiée(s) de la veille');}catch(e5){}
   return {K:K,ecart:e,gardees:n,suite:ns,copiees:nc};
  }catch(err){return null;}
 };

 /* LA JOURNÉE DU VOYAGE A DEUX CADRANS. Une journée déjà vécue (scellée, ou plus vieille que midi) ne se recale
    pas : ce qu'on y a fait le matin a eu lieu à l'heure du départ. Mais après l'atterrissage tout le reste de
    l'app écrit à l'heure du téléphone (une séance, ses secondes, les pas) : ses mesures aussi. On note donc
    l'instant où le moteur s'en aperçoit — `tz.bascule = {t, m, off}` : avant `t` la journée se lit à son
    étiquette, à partir de la case `m` au décalage `off`. Vers l'Est rien ne se croise (un saut de quelques
    heures sur la courbe, le vrai). Vers l'Ouest l'après reprend des cases que l'avant occupe (les heures de
    vol) : elles sont mises de côté dans `avant` — sans cela la courbe montrerait du pouls « dans le futur »,
    que le direct écraserait ensuite minute par minute. Rien n'est perdu : `flJourVu` remet tout bout à bout. */
 function marquer(){
  try{
   var d=new Date(), K=cle(d), w=vivant(K);
   if(!w||!w.tz||typeof w.tz.off!=='number'||w.tz.bascule||!(offMidi(K)-w.tz.off))return null;   /* le jour du téléphone, étiqueté ailleurs, pas encore marqué */
   var m0=window.flMinuitDe(K)*1000; if(!(d.getTime()>=m0&&d.getTime()<m0+86400000))return null;   /* … et encore en cours à son propre cadran */
   /* La minute en cours est déjà écrite, à l'ancien cadran : l'après commence à la minute suivante. */
   var tB=(Math.floor(d.getTime()/60000)+1)*60, dB=new Date(tB*1000), mB=(cle(dB)===K)?dB.getHours()*60+dB.getMinutes():1440, na=0;
   CANAUX.forEach(function(c){
    if(!Array.isArray(w[c])||!w[c].length)return;
    var garde=[], part=[]; w[c].forEach(function(x){if(x&&x[0]!=null&&+x[0]>=mB)part.push(x);else garde.push(x);});
    if(!part.length)return;
    var a=w.avant=w.avant||{}, carte={}; (Array.isArray(a[c])?a[c]:[]).forEach(function(x){if(x)carte[x[0]]=x;});
    part.forEach(function(x){carte[x[0]]=x;});
    a[c]=Object.keys(carte).map(function(m){return carte[m];}).sort(function(p,q){return p[0]-q[0];});
    w[c]=garde; na+=part.length;
   });
   w.tz.bascule={t:tB,m:mB,off:-d.getTimezoneOffset()};
   try{window.wSaveK(K);}catch(e2){}
   try{console.log('[flint] fuseau : la journée '+K+' continue à l\'heure du téléphone à partir de '+Math.floor(mB/60)+'h'+('0'+(mB%60)).slice(-2)+' — '+na+' minute(s) d\'avant mise(s) de côté');}catch(e5){}
   return {K:K,m:mB,avant:na};
  }catch(err){return null;}
 }
 window.flFuseauMarquer=marquer;

 /* LES PAS DU TÉLÉPHONE D'AVANT LA BASCULE SONT À L'ANCIENNE HEURE (v3075). `sante_<jour>` est calculé par l'iPhone au
    calendrier du moment, trente jours d'un coup, à chaque ouverture de l'app (`FlintSante.lireJours`) — pas avant. Entre
    l'atterrissage et cette ouverture, le bracelet se vide en arrière-plan et la nuit se lit avec les pas de la veille
    rangés à l'heure du départ : la marche du soir tombe en pleine nuit. Rejoué sur la nuit du 11 nov. vers New York :
    26 blocs de pas dans la nuit, quatre faux réveils, 6 h 21 dormies au lieu de 8 h 13 — et la lecture n'était pas
    refaite quand les vrais pas arrivaient (elle ne se refait que s'il en arrive PLUS). On retire donc ces pas des
    journées touchées par le voyage ; l'iPhone les redonne à la première ouverture, et la nuit se relit alors. */
 function pasPerimes(){
  try{
   var K0=cle(new Date()), voyage=false, n=0;
   [-2,-1,0,1].forEach(function(d){if(ecart(decale(K0,d)))voyage=true;});
   if(!voyage)return 0;                                 /* un changement d'heure été/hiver : rien n'est « ailleurs », on ne touche à rien */
   [-2,-1,0,1].forEach(function(d){var k='sante_'+decale(K0,d); try{var s=DB.get(k,null); if(s&&Array.isArray(s.pas)&&s.pas.length){s.pas=[];s.perime=K0;DB.set(k,s);n++;}}catch(e){}});
   if(n){try{console.log('[flint] fuseau : les pas du téléphone de '+n+' journée(s) sont à l\'ancienne heure — écartés jusqu\'à ce que l\'iPhone les recalcule');}catch(e2){}}
   return n;
  }catch(err){return 0;}
 }

 /* LE DÉCALAGE DU TÉLÉPHONE A-T-IL BOUGÉ ? Une lecture d'entier par appel ; le reste une fois par bascule.
    Le dernier décalage vu est gardé en base (`flFuseauVu`) : l'app est morte pendant le vol, c'est au
    réveil qu'on compare. Tant que le moteur n'est pas monté (pas de base, pas de journée vivante), on ne
    conclut rien — la bascule serait constatée et perdue. */
 var _vu;
 function veiller(){
  try{
   if(typeof DB==='undefined'||!DB||typeof window.flJourMontre!=='function'||typeof window.wSaveK!=='function')return false;
   var off=-new Date().getTimezoneOffset();
   if(_vu===undefined){var r=DB.get('flFuseauVu',null); _vu=(r&&typeof r.off==='number')?r.off:null;
                       if(_vu===null){_vu=off; try{DB.set('flFuseauVu',{off:off});}catch(e0){}}}
   if(_vu===off)return false;
   _vu=off; try{DB.set('flFuseauVu',{off:off});}catch(e1){}
   if(!window.flFuseauRecaler())marquer();              /* la journée en cours se recale si elle est ouverte ; sinon elle prend un second cadran */
   pasPerimes();
   return true;
  }catch(err){return false;}
 }
 window.flFuseauVeiller=veiller;
})();
