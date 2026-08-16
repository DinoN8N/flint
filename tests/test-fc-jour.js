/* L'ÉCRAN FRÉQUENCE CARDIAQUE INVENTAIT SA JOURNÉE.
   `fc2DayCurve` dessinait la journée à partir de la fréquence de repos et de la
   charge : un réveil vers 7 h, une bosse d'effort posée en milieu de matinée, du
   bruit au sinus. Et l'écran n'affichait pas que la courbe — il en TIRAIT la
   fréquence « actuelle », le minimum, la moyenne, le pic, la zone et la phrase
   « tu es en effort actif ».
   La montre en rend 819 à 1 186 par jour sur l'appareil de Félix. */
var ok=0,ko=0;
function v(nom,att,eu){ if(att===eu){ok++;console.log('✅ '+nom);}
  else{ko++;console.log('❌ '+nom+'  attendu '+att+', eu '+eu);} }

function courbe(hr){
  if(!hr||hr.length<30)return null;
  var par={};
  hr.forEach(function(x){var c=Math.floor(x[0]/5);(par[c]=par[c]||[]).push(x[1]);});
  var pts=[],vals=[];
  Object.keys(par).map(Number).sort(function(a,b){return a-b;}).forEach(function(c){
    var a=par[c].slice().sort(function(x,y){return x-y;});
    var m=a[a.length>>1]; pts.push({h:c*5/60,v:m}); vals.push(m);
  });
  if(pts.length<6)return null;
  var der=hr[hr.length-1];
  return {pts:pts,vals:vals,cur:der[1],curMin:der[0],
          min:Math.min.apply(null,vals),max:Math.max.apply(null,vals),
          avg:Math.round(vals.reduce(function(a,b){return a+b;},0)/vals.length),
          mesures:hr.length};
}
function jour(n,f){var a=[];for(var m=0;m<n;m++)a.push([m,f(m)]);return a;}

v('sans mesure : pas de courbe',              null, courbe([]));
v('trop peu de mesures : pas de courbe',      null, courbe(jour(20,function(){return 60;})));
v('une journée mesurée rend une courbe',      true, courbe(jour(600,function(){return 60;}))!=null);

var c=courbe(jour(600,function(m){return 50+(m%40);}));
v('une médiane par tranche de 5 minutes',      120, c.pts.length);
v('le minimum vient des mesures',             true, c.min>=50);
v('le maximum vient des mesures',             true, c.max<=89);
v('la moyenne est entre les deux',            true, c.avg>c.min&&c.avg<c.max);

/* LA FRÉQUENCE « ACTUELLE » EST LA DERNIÈRE MESURE, ET SON ÂGE COMPTE.
   Une valeur d'il y a trois heures affichée comme instantanée est le défaut que
   la pastille de la v1273 a déjà coûté : on rend la minute avec. */
var c2=courbe(jour(600,function(m){return m===599?77:60;}));
v('la valeur affichée est la dernière mesurée', 77, c2.cur);
v('et elle porte sa minute',                   599, c2.curMin);

/* L ancienne courbe se dessinait TOUJOURS, même sans un seul battement. */
function ancienne(rhr,nowH){
  var pts=[];for(var h=5.5;h<=nowH;h+=0.1)pts.push({h:h,v:rhr+8});return pts;
}
v('l ancienne dessinait une journée sans aucune donnée', true, ancienne(47,22).length>0);
v('la nouvelle, sans donnée, ne dessine rien',           null, courbe([]));

console.log('\n'+ok+' réussis, '+ko+' échoués');
if(ko)process.exitCode=1;
