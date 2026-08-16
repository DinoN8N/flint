/* L'ECG À LA DEMANDE — DÉTECTION DES BATTEMENTS ET REFUS DE CONCLURE.
   Le bracelet ouvre un flux mono-dérivation quand un doigt touche l'électrode
   latérale. Le SDK n'expose QU'UNE commande ECG et elle ouvre le flux sans
   déclencher la mesure : c'est la montre qui annonce début et fin. Notre part
   commence au signal reçu.
   Ce banc vérifie que l'analyse retrouve une fréquence connue, et surtout
   qu'elle REFUSE plutôt que de deviner quand le tracé ne le permet pas. */
var ok=0,ko=0;
function v(nom,att,eu){ if(att===eu){ok++;console.log('✅ '+nom);}
  else{ko++;console.log('❌ '+nom+'  attendu '+att+', eu '+eu);} }
function vp(nom,att,eu,tol){ if(Math.abs(att-eu)<=tol){ok++;console.log('✅ '+nom+' ('+eu+')');}
  else{ko++;console.log('❌ '+nom+'  attendu '+att+'±'+tol+', eu '+eu);} }

/* ── le moteur, recopié depuis index.html ─────────────────────────────────── */
function flEcgPics(serie,hz){
 if(!serie||serie.length<50||!(hz>0))return null;
 var n=serie.length;
 var w=Math.max(3,Math.round(hz*0.4))|1, demi=w>>1, base=new Array(n);
 for(var i=0;i<n;i++){
  var a=Math.max(0,i-demi), b=Math.min(n-1,i+demi), f=serie.slice(a,b+1).sort(function(x,y){return x-y;});
  base[i]=f[f.length>>1];
 }
 var net=new Array(n);
 for(var j=0;j<n;j++)net[j]=serie[j]-base[j];
 var e=new Array(n); e[0]=0;
 for(var k=1;k<n;k++){var d=net[k]-net[k-1]; e[k]=d*d;}
 var tri=e.slice().sort(function(x,y){return x-y;});
 var med=tri[tri.length>>1], haut=tri[Math.floor(tri.length*0.99)];
 if(!(haut>med))return null;
 var seuil=med+(haut-med)*0.35;
 var refr=Math.max(1,Math.round(hz*0.2));
 var pics=[],dernier=-refr;
 for(var m=1;m<n-1;m++){
  if(e[m]<seuil)continue;
  if(m-dernier<refr)continue;
  var a2=Math.max(0,m-refr), b2=Math.min(n-1,m+refr), best=a2;
  for(var q=a2;q<=b2;q++)if(net[q]>net[best])best=q;
  if(best-dernier<refr)continue;
  pics.push(best); dernier=best;
 }
 return pics;
}
function flEcgAnalyser(serie,hz){
 if(!serie||!serie.length)return {ok:false,raison:'Aucun signal enregistré.'};
 if(!(hz>0))return {ok:false,raison:"Cadence d'échantillonnage inconnue."};
 var duree=serie.length/hz;
 if(duree<15)return {ok:false,raison:'Tracé trop court.'};
 var pics=flEcgPics(serie,hz);
 if(!pics||pics.length<8)return {ok:false,raison:'Signal trop bruité pour repérer les battements.'};
 var rr=[];
 for(var i=1;i<pics.length;i++){
  var ms=(pics[i]-pics[i-1])/hz*1000;
  if(ms>=300&&ms<=2000)rr.push(ms);
 }
 if(rr.length<6)return {ok:false,raison:'Trop peu de battements exploitables.'};
 var mal=[];
 for(var j=1;j<rr.length;j++)if(Math.abs(rr[j]-rr[j-1])<=0.2*rr[j-1])mal.push([rr[j-1],rr[j]]);
 var part=mal.length/(rr.length-1);
 if(part<0.5)return {ok:false,raison:'Battements trop irréguliers.'};
 var somme=0; rr.forEach(function(x){somme+=x;});
 var moy=somme/rr.length;
 var carres=0; mal.forEach(function(p){carres+=(p[1]-p[0])*(p[1]-p[0]);});
 return {ok:true,duree:Math.round(duree),battements:pics.length,
         fc:Math.round(60000/moy),
         rmssd:mal.length?Math.round(Math.sqrt(carres/mal.length)):null,
         intervalles:rr.length,retenus:mal.length,qualite:Math.round(part*100)};
}

/* ── un ECG synthétique : dérive de ligne de base + complexe QRS + bruit ──── */
function ecg(bpm,secondes,hz,bruit,jitterMs){
  bruit=bruit||0; jitterMs=jitterMs||0;
  var n=Math.round(secondes*hz), a=new Array(n), rr=60/bpm;
  /* on place les pics d'abord, avec leur gigue, puis on dessine autour */
  var pics=[],t=0.4,i=0;
  while(t<secondes){ pics.push(Math.round(t*hz)); 
    var g=jitterMs?((((i*37)%21)-10)/1000*jitterMs/10):0; t+=rr+g; i++; }
  for(var k=0;k<n;k++){
    var derive=180*Math.sin(k/hz*0.18)+60*Math.sin(k/hz*0.05);   /* respiration + contact */
    var b=bruit?((((k*61)%17)-8)*bruit):0;
    a[k]=2000+derive+b;
  }
  pics.forEach(function(p){
    /* QRS : Q creux, R pointe, S creux — quelques dizaines de millisecondes */
    var q=Math.round(hz*0.02), r=Math.round(hz*0.01);
    for(var d=-q;d<=q;d++){var idx=p+d; if(idx<0||idx>=n)continue;
      if(d<-r)a[idx]-=120; else if(d>r)a[idx]-=90;
      else a[idx]+=900*(1-Math.abs(d)/(r+1));}
  });
  return a;
}

/* ── ce qu'on doit RETROUVER ─────────────────────────────────────────────── */
var HZ=128;
var propre=ecg(60,30,HZ,0,0);
var a1=flEcgAnalyser(propre,HZ);
v('un tracé propre est analysable', true, a1.ok);
vp('60 bpm sont retrouvés',             60, a1.fc, 2);
vp('les battements sont comptés',       30, a1.battements, 3);
v('la qualité est élevée',            true, a1.qualite>=90);

var rapide=flEcgAnalyser(ecg(100,30,HZ,0,0),HZ);
vp('100 bpm sont retrouvés',           100, rapide.fc, 3);
var lent=flEcgAnalyser(ecg(45,30,HZ,0,0),HZ);
vp('45 bpm sont retrouvés',             45, lent.fc, 2);

/* Du bruit modéré ne doit pas empêcher la mesure. */
var bruite=flEcgAnalyser(ecg(70,30,HZ,6,0),HZ);
v('un tracé un peu bruité reste analysable', true, bruite.ok);
vp('et la fréquence tient',                   70, bruite.fc, 3);

/* La variabilité : une gigue volontaire doit se retrouver dans le RMSSD. */
var stable=flEcgAnalyser(ecg(60,40,HZ,0,0),HZ);
var variable=flEcgAnalyser(ecg(60,40,HZ,0,60),HZ);
v('un cœur régulier donne un RMSSD bas',    true, stable.rmssd!=null&&stable.rmssd<20);
v('un cœur variable donne un RMSSD plus haut', true, variable.rmssd>stable.rmssd);

/* ── ET SURTOUT : CE QU'ON DOIT REFUSER ──────────────────────────────────── */
v('aucun signal : refusé',              false, flEcgAnalyser([],HZ).ok);
v('cadence inconnue : refusé',          false, flEcgAnalyser(propre,0).ok);
v('tracé de 10 s : refusé',             false, flEcgAnalyser(ecg(60,10,HZ,0,0),HZ).ok);
v('et la raison est dite',               true, /trop court/i.test(flEcgAnalyser(ecg(60,10,HZ,0,0),HZ).raison));
var pur=new Array(30*HZ); for(var z=0;z<pur.length;z++)pur[z]=2000+((z*53)%29)*40;
v('du bruit pur : refusé',              false, flEcgAnalyser(pur,HZ).ok);
var plat=new Array(30*HZ); for(var y=0;y<plat.length;y++)plat[y]=2000;
v('un tracé plat : refusé',             false, flEcgAnalyser(plat,HZ).ok);

/* La cadence est MESURÉE. Le même cœur échantillonné deux fois plus vite doit
   rendre la même fréquence : c'est la garantie qu'on ne suppose rien. */
var a256=flEcgAnalyser(ecg(72,30,256,0,0),256);
var a128=flEcgAnalyser(ecg(72,30,128,0,0),128);
v('la fréquence ne dépend pas de la cadence', true, Math.abs(a256.fc-a128.fc)<=2);

/* ── LA FRÉQUENCE EN DIRECT PENDANT LE TRACÉ ──────────────────────────────────
   Elle se calcule sur les HUIT DERNIÈRES SECONDES, pas sur toute la mesure : le
   début du tracé est celui où le doigt se pose et où le signal ne vaut rien.
   Et c'est la MÉDIANE des intervalles, pas leur moyenne — un seul intervalle
   raté par un artefact déplacerait une moyenne de dix battements par minute. */
function fcDirect(fenetre,hz){
  var pk=flEcgPics(fenetre,hz), bat=[];
  if(pk&&pk.length>=4)for(var z=1;z<pk.length;z++){
    var ms=(pk[z]-pk[z-1])/hz*1000;
    if(ms>=300&&ms<=2000)bat.push(ms);
  }
  if(bat.length<3)return null;
  bat.sort(function(a,b){return a-b;});
  return Math.round(60000/bat[bat.length>>1]);
}
var huit=ecg(66,8,HZ,0,0);
vp('la fréquence en direct sur 8 s retrouve 66 bpm', 66, fcDirect(huit,HZ), 3);
v('sur 2 s, elle refuse',                          null, fcDirect(ecg(66,2,HZ,0,0),HZ));
v('sur du bruit pur, elle refuse',                 null, fcDirect(pur.slice(0,8*HZ),HZ));

/* La médiane doit encaisser un battement manqué. On en retire un au milieu. */
var troue=ecg(60,10,HZ,0,0);
for(var t2=Math.round(5*HZ)-4;t2<=Math.round(5*HZ)+4;t2++)troue[t2]=2000;  /* pic effacé */
vp('un battement effacé ne déplace pas la fréquence', 60, fcDirect(troue,HZ), 4);

console.log('\n'+ok+' réussis, '+ko+' échoués');
if(ko)process.exitCode=1;
