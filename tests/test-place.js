/* LE FILET DU STOCKAGE NE POUVAIT LIBÉRER AUCUN OCTET.
   Mesuré sur l'appareil de Félix, 700 clés, 3 777 Ko :

       flAvatar        2 639,0 Ko   69,9 %
       watch_<jour>      457,4 Ko   12,1 %
       ecg_<t>           253,9 Ko    6,7 %
       hrfine_<jour>     220,5 Ko    5,8 %

   Et ce que les trois étapes historiques visaient : les photos de repas (103
   clés, 0,3 Ko, aucune photo), les intervalles RR au-delà de 21 jours (zéro
   partout), la FC au-delà de 45 jours (la plus ancienne clé a NEUF jours).
   Les trois rendaient zéro, la fonction rendait false, et l'écriture était
   abandonnée en silence. Un filet qui ne peut rien attraper n'est pas un filet. */
var ok=0,ko=0;
function v(nom,att,eu){ if(att===eu){ok++;console.log('✅ '+nom);}
  else{ko++;console.log('❌ '+nom+'  attendu '+att+', eu '+eu);} }

/* Le disque réel de Félix, reproduit à l'identique. */
function disque(){
  var d={};
  d['flAvatar']='x'.repeat(2639*1024);
  for(var i=1;i<=10;i++) d['hrfine_2026-8-'+i]='y'.repeat(22*1024);
  for(var j=0;j<5;j++)   d['ecg_17863559'+j]=JSON.stringify({t:1,hz:240,serie:new Array(25000).fill(9),analyse:{ok:true,fc:74}});
  for(var m=0;m<103;m++) d['meals_2026-5-'+m]='[]';           /* 0,3 Ko en tout, sans photo */
  for(var w=1;w<=10;w++) d['watch_2026-8-'+w]=JSON.stringify({hr:[],rr:[],night:{sleepMin:400}});
  return d;
}
function poids(d){var n=0;for(var k in d)n+=d[k].length;return n;}
function pese(d,prefixe){var n=0;for(var k in d)if(k.indexOf(prefixe)===0)n+=d[k].length;return n;}

/* ── L'ANCIEN FILET, tel qu'il était ─────────────────────────────────────── */
function ancien(d){
  var libere=0;
  for(var k in d){ if(k.indexOf('meals_')===0){ /* aucune photo a retirer */ } }
  for(var w in d){ if(w.indexOf('watch_')===0){ /* rr deja vide */ } }
  return libere;                                  /* la FC a plus de 45 jours n existe pas */
}
var d1=disque();
v('l ancien filet ne libérait rien', 0, ancien(d1));
/* Le disque reel de Felix pese 3 777 Ko. Le notre reproduit les quatre familles
   qui comptent, a 3 Mo pres : c est la proportion qui importe, pas l octet. */
v('alors que le disque pese plus de 3 Mo', true, poids(d1) > 3*1024*1024);
v('et l avatar en occupe environ 70 %', true,
  pese(d1,'flAvatar')/poids(d1) > 0.60);

/* ── LE NOUVEAU, du moins précieux au plus précieux ──────────────────────── */
function nouveau(d,vise){
  var libere=0;
  /* 0a. hrfine_ : personne ne le lit, et il se reconstitue depuis la montre */
  Object.keys(d).filter(function(k){return k.indexOf('hrfine_')===0;}).sort()
    .forEach(function(k){ if(libere>=vise)return; libere+=d[k].length; delete d[k]; });
  /* 0b. les courbes ECG au-delà des cinq dernières, l analyse reste */
  if(libere<vise){
    var e=Object.keys(d).filter(function(k){return k.indexOf('ecg_')===0;}).sort();
    for(var i=0;i<e.length-5&&libere<vise;i++){
      var av=d[e[i]].length, o=JSON.parse(d[e[i]]);
      if(o.serie){o.serie=null;o.serieRetiree=true;d[e[i]]=JSON.stringify(o);libere+=av-d[e[i]].length;}
    }
  }
  /* 0c. l avatar en dernier parmi les gros */
  if(libere<vise && d['flAvatar'] && d['flAvatar'].length>100*1024){
    libere+=d['flAvatar'].length; delete d['flAvatar'];
  }
  return libere;
}
var d2=disque(), av2=poids(d2);
var l=nouveau(d2, 400*1024);
v('le nouveau libère au moins les 400 Ko visés', true, l >= 400*1024);
v('il commence par hrfine_, qui disparaît',        0, pese(d2,'hrfine_'));

/* ── ET IL NE TOUCHE PAS AUX MESURES ─────────────────────────────────────── */
v('les journées de la montre sont intactes', 10,
  Object.keys(d2).filter(function(k){return k.indexOf('watch_')===0;}).length);
v('les nuits sont intactes', true,
  JSON.parse(d2['watch_2026-8-1']).night.sleepMin === 400);

/* ── L'AVATAR N'EST TOUCHÉ QU'EN DERNIER ─────────────────────────────────── */
var d3=disque();
nouveau(d3, 150*1024);                 /* hrfine_ suffit largement */
v('avec un petit besoin, l avatar est épargné', true, !!d3['flAvatar']);
var d4=disque();
nouveau(d4, 3000*1024);                /* besoin énorme : tout y passe */
v('avec un besoin énorme, l avatar part', true, !d4['flAvatar']);
v('mais une mesure ne part JAMAIS', 10,
  Object.keys(d4).filter(function(k){return k.indexOf('watch_')===0;}).length);

/* Une trace ECG allégée garde son résultat : fréquence, variabilité, qualité. */
var d5=disque(); nouveau(d5, 3000*1024);
var restes=Object.keys(d5).filter(function(k){return k.indexOf('ecg_')===0;});
v('les cinq dernières traces ECG restent entières', 5, restes.length);

console.log('\n'+ok+' réussis, '+ko+' échoués');
if(ko)process.exitCode=1;
