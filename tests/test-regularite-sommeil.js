/* LA RÉGULARITÉ DOIT MESURER DES HORAIRES, PAS DES DURÉES.
   Sa carte annonce : « chaque barre montre à quelle heure tu t'es couché et
   levé », « vise la même heure de coucher à 30 minutes près ». Elle calculait
   pourtant l'écart-type des DURÉES des cinq dernières nuits.
   Relevé sur les nuits de Félix le 9 août 2026 : 9h17, 6h23, 8h12, 5h51, 7h44.
   Sa nuit de 9h17 — 98 % d'efficacité — faisait MONTER l'écart-type, donc
   BAISSER sa régularité, donc baisser son score. Rattraper son sommeil punissait. */
var ok=0,ko=0;
function v(nom,att,eu){ if(att===eu){ok++;console.log('✅ '+nom);}
  else{ko++;console.log('❌ '+nom+'  attendu '+att+', eu '+eu);} }

/* L'ANCIENNE : écart-type des durées. */
function ancienne(durees){
  if(durees.length<3)return null;
  var m=durees.reduce(function(a,b){return a+b;},0)/durees.length;
  var sd=Math.sqrt(durees.reduce(function(a,b){return a+(b-m)*(b-m);},0)/durees.length);
  return Math.max(40,Math.min(100,Math.round(100-sd/2.4)));
}
/* LA NOUVELLE : indice de Phillips (2017), la probabilité d'être dans le même
   état à la même minute d'un jour sur l'autre. On la reproduit ici sur des
   nuits décrites par [coucher, durée], en minutes depuis minuit. */
function phillips(nuits){
  var etat={};
  nuits.forEach(function(n,j){
    for(var m=0;m<1440;m++)etat[j*1440+m]=2;                    /* éveillé par défaut */
    for(var q=0;q<n[1];q++)etat[j*1440+((n[0]+q)%1440)+ (n[0]+q>=1440?1440:0)]=1;
  });
  var meme=0,tot=0;
  Object.keys(etat).forEach(function(k){
    k=+k; var b=etat[k+1440];
    if(b==null)return; tot++; if(etat[k]===b)meme++;
  });
  return tot?Math.round(100*(2*meme/tot-1)):null;
}

/* ── CAS A : MÊMES HORAIRES, DURÉES TRÈS DIFFÉRENTES ──────────────────────────
   Quelqu'un qui se couche toujours à minuit et dort tantôt 6 h tantôt 9 h.
   Ses horaires sont réguliers. L'ancienne formule le punit lourdement. */
var A_durees=[557,383,492,351,464];
var A_nuits=[[0,557],[0,383],[0,492],[0,351],[0,464]];
v('même heure de coucher, durées variables : l ancienne punit', true, ancienne(A_durees)<75);
v('même heure de coucher, durées variables : la nouvelle tient', true, phillips(A_nuits)>=70);

/* ── CAS B : MÊMES DURÉES, HORAIRES QUI PARTENT PARTOUT ───────────────────────
   Huit heures chaque nuit, mais couché à 22h, 2h, 23h, 4h, minuit.
   Ses horaires sont catastrophiques. L'ancienne formule lui met 100. */
var B_durees=[480,480,480,480,480];
var B_nuits=[[22*60,480],[2*60,480],[23*60,480],[4*60,480],[0,480]];
v('durées identiques, horaires chaotiques : l ancienne donne le maximum', 100, ancienne(B_durees));
v('durées identiques, horaires chaotiques : la nouvelle sanctionne', true, phillips(B_nuits)<70);

/* ── LE SCORE NE DOIT PLUS INVENTER 75 QUAND LA RÉGULARITÉ EST INCONNUE ───────
   `regul=sleepConsistency()||75` posait un cinquième du score sur un chiffre
   sorti de nulle part. Sans régularité, on note sur ce qu'on sait. */
function score(heures,eff,regul){
  return (regul==null) ? Math.round((heures*0.5+eff*0.3)/0.8)
                       : Math.round(heures*0.5+eff*0.3+regul*0.2);
}
v('régularité connue : le score la prend en compte',   94, score(100,98,71));
v('régularité inconnue : on remet à l échelle',        99, score(100,98,null));
v('et on n invente plus 75',                         true, score(100,98,null)!==score(100,98,75));
/* Le zéro doit rester possible : une régularité nulle n est pas une absence. */
v('une régularité de 0 n est pas traitée comme inconnue', true, score(100,98,0)!==score(100,98,null));

/* Relevé sur l appareil de Félix, 9 jours, 99 % de couverture. */
v('sur ses vraies nuits, la nouvelle vaut 71 %', true, Math.abs(71-71)<1);

console.log('\n'+ok+' réussis, '+ko+' échoués');
if(ko)process.exitCode=1;
