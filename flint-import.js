/* Le metier de ce fichier : relire un export FLINT — detection du format,
   filtrage, ecriture resiliente. La porte d'ecran (flPfImport) reste dans
   index.html ; le banc est tests/test-import-export.js, qui charge CE
   fichier en entier. Liaisons de script : `DB` se lit NU (jamais
   window.DB — garde-liaisons), comme dans flint-recup-cycle.js. */
/* ═══ FL-IMPORT (30 aout 2026, commercialisation) ═══════════════════════════
   L'IMPORT RELIT ENFIN L'EXPORT. Trois pannes fermees d'un coup, toutes
   constatees sur piece :

   1. L'export NATIF (le bouton « Emporter tes donnees » des Reglages, celui
      que la page Securite appelle « ta copie de secours ») produit un JSON
      IMBRIQUE — {application, reglages, seancesGPS, donneesSante:{...}} — et
      cet import n'attendait qu'un dump PLAT : la copie de secours etait
      refusee avec « Aucune donnee FLINT reconnue ». Un changement d'iPhone
      sans iCloud perdait tout, la sauvegarde en main.
   2. La liste blanche (7 prefixes + 21 cles) amputait ~60 familles reelles :
      recovGen absent, le rejugement reecrivait les scores importes ; calib,
      zones, sortiesEcartees, besoins... perdus en silence. On INVERSE : tout
      s'importe, sauf les compteurs de diagnostic de CE telephone-ci.
   3. Un seul try autour du forEach : la premiere cle refusee (stockage plein)
      abandonnait toutes les suivantes sans un mot, et l'ecran rechargeait
      comme si tout etait la. Maintenant : cle par cle, faire-de-la-place et
      une reprise, les familles IRREMPLACABLES d'abord (nuits, repas, scores),
      les courbes lourdes en dernier — et le compte exact a l'ecran.

   Les tracés GPS de l'export natif repartent au natif (cmd:'importerSeancesGPS',
   receptacle dans ContentView) ; les `reglages` de l'export ne sont PAS
   reimportes (valeurs UserDefaults aux encodages heterogenes — on le DIT
   plutot que de les poser de travers). Le banc : tests/test-import-export.js,
   qui extrait ce bloc entre ses deux marqueurs. */
function flImpDetecter(data){
 /* rend {base, seances, format:'natif'|'plat'|null} — base = cle → valeur */
 if(!data||typeof data!=='object'||Array.isArray(data))return {base:null,seances:null,format:null};
 if(data.donneesSante&&typeof data.donneesSante==='object'&&!Array.isArray(data.donneesSante)){
  return {base:data.donneesSante,
          seances:(Array.isArray(data.seancesGPS)&&data.seancesGPS.length)?data.seancesGPS:null,
          format:'natif'};
 }
 if(data.application==='FLINT'&&Array.isArray(data.seancesGPS)&&data.seancesGPS.length){
  /* export natif SANS section sante (moteur absent a l'export) : les seances
     restent importables, on ne les jette pas avec le reste. */
  return {base:null,seances:data.seancesGPS,format:'natif'};
 }
 return {base:data,seances:null,format:'plat'};
}
/* Les compteurs de diagnostic appartiennent a CE telephone : les importer
   ecraserait la verite locale (crashs, chargements) par celle d'un autre. */
/* 2 septembre 2026 — CETTE LISTE EST DEVENUE CELLE DE L'EXPORT AUSSI.
   `flVidageExportable` (flint-export.js) l'interroge avant d'écrire une clé :
   l'export cesse d'écrire ce que l'import jetait de toute façon, et il n'y a
   toujours qu'UNE liste. Les deux graines de démonstration entrent ici pour la
   même raison que `flDemoSession` en v2131 — elles ne sont la santé de
   personne, et Dino les trouvait dans un fichier annoncé comme « tout le
   contenu de l'application ». Les retirer d'une sauvegarde est sans effet à la
   relecture : absentes, elles se lisent comme le zéro qu'elles valent déjà. */
var FL_IMP_EXCLUS=['flWkKills','flWkLast','flLoads','flLoadAt','flintForceShell','flintDemoData','demo','flDemoSession','flDemoSeed','flDemoRepas'];  /* v2131 — une session de démo ne voyage pas dans une sauvegarde */
function flImpAccepte(k){return typeof k==='string'&&k.length>0&&FL_IMP_EXCLUS.indexOf(k)<0;}
/* Un dump plat accepte TOUT — encore faut-il que le fichier soit un export
   FLINT et pas n'importe quel JSON : au moins une cle de la maison. */
function flImpPlausible(base){
 var ks=Object.keys(base||{});
 for(var i=0;i<ks.length;i++){var k=ks[i];
  if(/^(watch_|sensor_|meals_|sessions_|recov|journal_|fljrnl_|hrfine_|sante_)/.test(k))return true;
  if(k==='profile'||k==='bodylog'||k==='flSince'||k==='weightLog')return true;
 }
 return false;
}
function flImpPoser(k,v){
 var s=(typeof v==='string')?v:JSON.stringify(v);
 if(s===undefined)return false;
 try{localStorage.setItem(k,s);try{DB.marque(k);}catch(e0){}return true;}catch(e){}
 try{window.flFaireDeLaPlace&&window.flFaireDeLaPlace();}catch(e){}
 try{localStorage.setItem(k,s);try{DB.marque(k);}catch(e0){}return true;}catch(e){}
 return false;
}
function flImporterBase(base){
 var ks=Object.keys(base||{}).filter(flImpAccepte);
 /* l'ordre de valeur : si le stockage sature au milieu de l'import, ce sont
    les courbes lourdes qui manquent — jamais une nuit, un repas, un score. */
 function poids(k){
  if(k.indexOf('hrfine_')===0||k.indexOf('hrbrut_')===0||k.indexOf('ecg_')===0)return 3;
  if(k.indexOf('watch_')===0)return 2;
  return 1;
 }
 var faites=0,refusees=[];
 /* LA FAMILLE recov* EST ATOMIQUE : ensemble, ou pas du tout. Un `recov_`
    sans son `recovFige_` ferait revivre un score scellé, un `recovGen` sans
    ses `recov_` rejouerait le rejugement sur des scores déjà rejugés (règle
    posée par le chantier du cycle de récupération, 30 août). Elle passe en
    PREMIER (quelques centaines d'octets par clé) ; si une seule clé refuse,
    on remet l'état d'avant et la famille entière compte pour refusée. */
 var recov=ks.filter(function(k){return k.indexOf('recov')===0;});
 var autres=ks.filter(function(k){return k.indexOf('recov')!==0;});
 if(recov.length){
  var avant={};
  recov.forEach(function(k){try{avant[k]=localStorage.getItem(k);}catch(e){avant[k]=null;}});
  var okFam=true;
  recov.forEach(function(k){if(!flImpPoser(k,base[k]))okFam=false;});
  if(okFam){faites+=recov.length;}
  else{
   recov.forEach(function(k){try{
    if(avant[k]==null)localStorage.removeItem(k);
    else localStorage.setItem(k,avant[k]);
    try{DB.marque(k);}catch(e0){}
   }catch(e){}});
   refusees.push('famille recov ('+recov.length+' clés, ensemble ou rien)');
  }
 }
 autres.sort(function(a,b){var d=poids(a)-poids(b);return d||(a<b?-1:a>b?1:0);});
 autres.forEach(function(k){
  if(flImpPoser(k,base[k]))faites++;
  else refusees.push(k);
 });
 return {faites:faites,refusees:refusees,total:ks.length};
}
/* ═══ FIN FL-IMPORT ═════════════════════════════════════════════════════════ */

/* ═══ 6 oct. 2026 — LA PORTE NATIVE DE LA RESTAURATION ══════════════════════
   L'import existait (ci-dessus, depuis le 30 août) et ne s'atteignait plus :
   sa seule porte, `flPfImport`, vit dans l'écran web du profil, caché depuis
   la v947. Le LISEZ-MOI de l'export promettait pourtant « FLINT sait le
   relire » — et un client qui change d'iPhone sans sauvegarde iCloud
   repartait de zéro, son export en main.

   Le natif (Mes données → « Restaurer une sauvegarde ») passe le TEXTE du
   fichier ici, en deux temps : `appliquer` faux pour ANALYSER (ce que contient
   le fichier, à montrer avant de confirmer), vrai pour POSER. Les mêmes
   règles que la porte web : `flImpDetecter`, `flImpPlausible`, `flImpAccepte`,
   `flImporterBase`, et les tracés GPS repartent au natif par le même canal
   (`importerSeancesGPS`). Rien d'écrit tant que l'analyse n'a pas été
   confirmée : `appliquer` faux ne touche pas au stockage. */
window.flImportNatif=function(texte,appliquer){
 var data=null;
 try{data=JSON.parse(texte);}catch(e){return {ok:false,raison:'illisible'};}
 var det=flImpDetecter(data);
 if(!det.format||(!det.base&&!det.seances)||(det.format==='plat'&&!flImpPlausible(det.base)))
  return {ok:false,raison:'pas-flint'};
 var cles=det.base?Object.keys(det.base).filter(flImpAccepte):[];
 var nG=det.seances?det.seances.length:0;
 if(!cles.length&&!nG)return {ok:false,raison:'vide'};
 /* La période se lit sur les journées de la montre : c'est ce que la
    personne reconnaît (« du 12 juin au 5 octobre »), pas un nombre de clés. */
 var jours=[];
 cles.forEach(function(k){var m=/^watch_(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(k);
  if(m)jours.push([+m[1],+m[2],+m[3]]);});
 jours.sort(function(a,b){return (a[0]-b[0])||(a[1]-b[1])||(a[2]-b[2]);});
 var cle=function(j){return j?j[0]+'-'+j[1]+'-'+j[2]:null;};
 var resume={ok:true,format:det.format,elements:cles.length,seances:nG,journees:jours.length,
             du:cle(jours[0]),au:cle(jours[jours.length-1]),profil:cles.indexOf('profile')>=0};
 if(!appliquer)return resume;
 var r=det.base?flImporterBase(det.base):{faites:0,refusees:[],total:0};
 resume.faites=r.faites; resume.refusees=r.refusees.length;
 if(det.seances){
  try{window.webkit.messageHandlers.flint.postMessage({cmd:'importerSeancesGPS',seances:det.seances});
      resume.seancesTransmises=nG;}
  catch(e){resume.seancesTransmises=0;}
 }
 return resume;
};
