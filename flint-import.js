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
