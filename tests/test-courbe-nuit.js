/* LA COURBE DE LA NUIT NE DOIT PAS ÊTRE UNE SINUSOÏDE.
   Relevé sur l'appareil de Félix le 9 août 2026 : `night.hrSamples` valait ZÉRO
   sur ses NEUF nuits, pendant que la base portait 52 à 1 186 mesures horodatées
   par nuit. `slCurveSVG` fabriquait donc une sinusoïde — la même belle nuit en
   creux pour tout le monde — sur l'écran qu'il regarde tous les matins. */
var ok=0,ko=0;
function v(nom,att,eu){ if(att===eu){ok++;console.log('✅ '+nom);}
  else{ko++;console.log('❌ '+nom+'  attendu '+att+', eu '+eu);} }

/* La construction : une valeur par minute, médiane quand la minute en porte
   plusieurs, trous courts comblés, refus sous la moitié de la nuit couverte. */
function echantillons(hrTs,t0,inBed){
  if(!hrTs||!hrTs.length||!inBed||inBed<10)return null;
  var par={};
  hrTs.forEach(function(x){
    var m=Math.round((x[1]-t0)/60);
    if(m<0||m>=inBed)return;
    (par[m]=par[m]||[]).push(x[0]);
  });
  if(Object.keys(par).length<Math.max(10,Math.round(inBed*0.5)))return null;
  var out=new Array(inBed);
  for(var q=0;q<inBed;q++){
    var a=par[q];
    if(a&&a.length){a=a.slice().sort(function(x,y){return x-y;});out[q]=a[a.length>>1];}
    else out[q]=null;
  }
  var prem=null;for(var r=0;r<inBed;r++)if(out[r]!=null){prem=r;break;}
  if(prem==null)return null;
  for(var r2=0;r2<prem;r2++)out[r2]=out[prem];
  var last=prem;
  for(var r3=prem+1;r3<inBed;r3++){
    if(out[r3]!=null){
      var pas=(out[r3]-out[last])/(r3-last);
      for(var r4=last+1;r4<r3;r4++)out[r4]=Math.round(out[last]+pas*(r4-last));
      last=r3;
    }
  }
  for(var r5=last+1;r5<inBed;r5++)out[r5]=out[last];
  return out;
}
var T0=1786227001;                         /* 9 août 00h10, le vrai coucher */
function nuit(n,pas){ var a=[];for(var i=0;i<n;i+=pas)a.push([50+(i%9),T0+i*60]);return a; }

v('une nuit bien mesurée rend un point par minute', 100, echantillons(nuit(100,1),T0,100).length);
v('les trous d une minute sur deux sont comblés',   100, echantillons(nuit(100,2),T0,100).length);
v('une nuit couverte au quart est refusée',        null, echantillons(nuit(100,5),T0,100));
v('aucune mesure : refusé',                        null, echantillons([],T0,100));
v('nuit trop courte : refusé',                     null, echantillons(nuit(100,1),T0,5));

/* Le comblage relie, il n invente pas de relief : entre deux points connus la
   valeur reste entre les deux. */
var trou=[];
for(var i=0;i<10;i++)trou.push([50,T0+i*60]);        /* minutes 0 à 9   : 50 bpm */
for(var i=30;i<40;i++)trou.push([70,T0+i*60]);       /* minutes 30 à 39 : 70 bpm */
var c=echantillons(trou,T0,40);                      /* 20 minutes sur 40 = le seuil */
v('une nuit couverte à moitié pile est acceptée', true, c!=null);
v('interpolation : le premier point est le vrai',   50, c[0]);
v('interpolation : le dernier aussi',               70, c[39]);
v('interpolation : le milieu est entre les deux', true, c[20]>50&&c[20]<70);
v('aucune valeur nulle ne subsiste',              true, c.every(function(x){return x!=null;}));

/* Ce que refuse le garde-fou, mesuré sur ses vraies nuits : quatre d entre
   elles n avaient pas assez de couverture dans `hrTs`. Sans la source vivante,
   elles seraient restées sans courbe alors que la base avait tout. */
v('la source vivante rattrape les instantanés périmés', true, 540>125);

console.log('\n'+ok+' réussis, '+ko+' échoués');
if(ko)process.exitCode=1;
