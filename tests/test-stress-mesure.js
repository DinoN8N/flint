/* LE MONITEUR DE STRESS AFFICHAIT UN GÉNÉRATEUR.
   144 points par jour tirés de trois sinusoïdes semées sur la fréquence de
   repos, avec un creux de nuit posé à 23h30-7h et des pics au sinus. L'écran
   était convaincant et ne mesurait rien.
   La montre calcule pourtant un indice de stress à chaque mesure de variabilité.
   Relevé sur l'appareil de Félix, huit jours pleins : 274 à 287 mesures par
   jour, couvrant 98 à 100 % des créneaux de dix minutes. */
var ok=0,ko=0;
function v(nom,att,eu){ if(att===eu){ok++;console.log('✅ '+nom);}
  else{ko++;console.log('❌ '+nom+'  attendu '+att+', eu '+eu);} }

function serie(hrv){
  var par={};
  (hrv||[]).forEach(function(x){
    if(!x||x.length<3||x[2]==null)return;
    var c=Math.floor(x[0]/10); if(c<0||c>143)return;
    (par[c]=par[c]||[]).push(+x[2]);
  });
  if(Object.keys(par).length<72)return [];
  var brut=new Array(144);
  for(var i=0;i<144;i++){var a=par[i];
    if(a&&a.length){a=a.slice().sort(function(m,n){return m-n;});brut[i]=a[a.length>>1];}else brut[i]=null;}
  var prem=null;for(var r=0;r<144;r++)if(brut[r]!=null){prem=r;break;}
  if(prem==null)return [];
  for(var r2=0;r2<prem;r2++)brut[r2]=brut[prem];
  var last=prem;
  for(var r3=prem+1;r3<144;r3++){if(brut[r3]!=null){
    var pas=(brut[r3]-brut[last])/(r3-last);
    for(var r4=last+1;r4<r3;r4++)brut[r4]=brut[last]+pas*(r4-last);
    last=r3;}}
  for(var r5=last+1;r5<144;r5++)brut[r5]=brut[last];
  var pts=[];
  for(var j=0;j<144;j++)pts.push({min:j*10,v:+Math.max(0,Math.min(3,brut[j]/33.3)).toFixed(2)});
  return pts;
}
function jour(pas,valeur){var a=[];for(var m=0;m<1440;m+=pas)a.push([m,50,valeur]);return a;}

v('une journée bien mesurée rend 144 points',        144, serie(jour(5,50)).length);
v('la moitié des créneaux couverts suffit',          144, serie(jour(20,50)).length);
v('un tiers des créneaux : refusé',                    0, serie(jour(40,50)).length);
v('aucune mesure : refusé',                            0, serie([]).length);
v('des mesures sans stress : refusé',                  0, serie([[0,50,null],[10,50,null]]).length);

/* L'ÉCHELLE. Le fabricant note de 0 à 100 avec ses seuils à 33 et 67 ; la vue va
   de 0 à 3 avec les siens à 1 et 2. Diviser par 33,3 les fait coïncider. */
var s33=serie(jour(5,33)), s67=serie(jour(5,67)), s100=serie(jour(5,100));
v('stress 33 tombe pile sur la frontière faible/modéré', true, Math.abs(s33[0].v-1)<0.02);
v('stress 67 tombe pile sur la frontière modéré/élevé',  true, Math.abs(s67[0].v-2)<0.02);
v('stress 100 sature à 3',                                  3, s100[0].v);
v('stress 0 vaut 0',                                        0, serie(jour(5,0))[0].v);

/* Le générateur, lui, produisait TOUJOURS une courbe, même bracelet au tiroir. */
function generateur(rhr){
  var seed=(rhr||50)%7,pts=[];
  for(var i=0;i<144;i++){var min=i*10,h=min/60,night=(h<7||h>=23.5)?1:0,base=night?0.32:1.05,
    wave=Math.sin(i*0.5+seed)*0.22+Math.sin(i*0.17)*0.34+Math.sin(i*1.3+seed)*0.16;
    pts.push({min:min,v:Math.max(0.05,Math.min(3,base+wave))});}
  return pts;
}
v('l ancien générateur dessinait une journée sans aucune donnée', 144, generateur(50).length);
v('le nouveau, sans donnée, ne dessine rien',                       0, serie([]).length);

/* Relevé réel : 8 jours acceptés, le 9e refusé à 46 % de couverture. */
v('un jour couvert à 46 % est refusé', 0, serie(jour(22,50)).length===0?0:1);

console.log('\n'+ok+' réussis, '+ko+' échoués');
if(ko)process.exitCode=1;
