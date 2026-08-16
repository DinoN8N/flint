/* LE PLAFOND NE DOIT JAMAIS MANGER LA NUIT.
   Relevé sur l'appareil de Félix le 9 août 2026 : `watch_2026-8-9.hr` contenait
   4 000 entrées ne couvrant plus que 93 minutes (13h46 → 15h18), jusqu'à 61
   entrées sur la même minute. Le flux temps réel écrivait un point par seconde
   et `slice(-4000)` gardait les quatre mille DERNIERS : la nuit entière avait
   disparu, et le sommeil affiché changeait tout seul au fil de la journée. */
var ok=0,ko=0;
function v(nom,att,eu){ if(att===eu){ok++;console.log('✅ '+nom);}
  else{ko++;console.log('❌ '+nom+'  attendu '+att+', eu '+eu);} }

function wDedoublonner(a){
  if(!a||a.length<2)return a||[];
  var vu={},n=0;
  for(var i=0;i<a.length;i++){var m=a[i][0];
   if(vu[m]==null){vu[m]=n;a[n++]=a[i];} else a[vu[m]]=a[i];}
  a.length=n;
  return a.sort(function(x,y){return x[0]-y[0];});
}
function sauver(hr){ hr=wDedoublonner(hr); if(hr.length>4000)hr=hr.slice(-4000); return hr; }

/* On rejoue la journée qui a détruit la nuit : une nuit mesurée minute par
   minute, puis 93 minutes de flux temps réel à un point par seconde. */
function journee(){
  var j=[];
  for(var m=10;m<=579;m++)j.push([m,50+(m%7)]);              // la nuit, 570 minutes
  for(var t=0;t<93*60;t++)j.push([826+Math.floor(t/60),95]); // 5 580 trames de flux
  return j;
}
var nuitAvant=570;
v('sans traitement, le tableau explose le plafond', true, journee().length>4000);

/* `wDedoublonner` replie EN PLACE : chaque cas doit avoir sa propre copie,
   sinon le témoin travaillerait sur des données déjà nettoyées. */
var apres=sauver(journee());
var dansLaNuit=apres.filter(function(x){return x[0]>=10&&x[0]<=579;}).length;
v('la nuit est intégralement conservée',        nuitAvant, dansLaNuit);
v('une minute ne porte plus qu une seule valeur',      93, apres.filter(function(x){return x[0]>=826;}).length);
v('le plafond ne se déclenche jamais',               true, apres.length<=1440);
v('le tableau reste trié',                           true, apres.every(function(x,i,a){return !i||a[i-1][0]<x[0];}));

/* Sans le repli, c'est exactement ce qui est arrivé à Félix. */
var brut=journee(), sansRepli=brut.length>4000?brut.slice(-4000):brut;
v('sans repli, la nuit est détruite', 0,
  sansRepli.filter(function(x){return x[0]>=10&&x[0]<=579;}).length);

/* Le récepteur temps réel : une minute, une valeur. */
var d2={hr:[[600,80]]};
[81,82,83].forEach(function(bpm){
  var der=d2.hr[d2.hr.length-1];
  if(der&&der[0]===600)der[1]=bpm; else d2.hr.push([600,bpm]);
});
v('trois trames dans la même minute ne font qu une entrée', 1, d2.hr.length);
v('et c est la dernière valeur qui reste',                 83, d2.hr[0][1]);

console.log('\n'+ok+' réussis, '+ko+' échoués');
if(ko)process.exitCode=1;
