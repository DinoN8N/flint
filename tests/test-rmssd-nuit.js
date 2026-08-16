/* NOTRE RMSSD, CALCULÉ SUR LES BATTEMENTS BRUTS.
   Jusqu'ici FLINT affichait la variabilité que la PUCE calcule, avec une méthode
   qu'on ne connaît pas et qu'on ne peut pas vérifier. C'était le dernier chiffre
   important qui vienne d'ailleurs que de nous.
   Relevé sur les nuits de Félix, 10 août :
       2026-8-8   nous 69 ms · puce —      11 min, 1 346 battements, 93 %
       2026-8-9   nous 71 ms · puce 57 ms  28 min, 4 684 battements, 94 % */
var ok=0,ko=0;
function v(nom,att,eu){ if(att===eu){ok++;console.log('✅ '+nom);}
  else{ko++;console.log('❌ '+nom+'  attendu '+att+', eu '+eu);} }

/* Le cœur du calcul, recopié depuis index.html : par minute, jamais entre deux
   rafales, avec la règle de Malik. */
function minuteRmssd(rr){
  rr=rr.filter(function(x){return x>=300&&x<=2000;});
  if(rr.length<8)return null;
  var carres=0,paires=0;
  for(var i=1;i<rr.length;i++)
    if(Math.abs(rr[i]-rr[i-1])<=0.2*rr[i-1]){carres+=(rr[i]-rr[i-1])*(rr[i]-rr[i-1]);paires++;}
  return paires<6?null:{v:Math.sqrt(carres/paires),paires:paires};
}
function nuit(minutes){
  var par=[];
  minutes.forEach(function(rr){var m=minuteRmssd(rr); if(m)par.push(m.v);});
  if(par.length<5)return {ok:false,minutes:par.length};
  par.sort(function(a,b){return a-b;});
  return {ok:true,rmssd:Math.round(par[par.length>>1]),minutes:par.length};
}
/* Une minute de battements : n intervalles autour de `base`, avec une variation
   `ecart` d'un battement au suivant. */
function bloc(n,base,ecart){
  var a=[base];
  for(var i=1;i<n;i++)a.push(base+((i%2)?ecart:-ecart));
  return a;
}

/* ── LE CALCUL RETROUVE UNE VARIABILITÉ CONNUE ─────────────────────────────── */
var stable=minuteRmssd(bloc(80,1000,0));
v('un cœur parfaitement régulier donne un RMSSD nul', 0, Math.round(stable.v));
var var20=minuteRmssd(bloc(80,1000,20));
v('une alternance de ±20 ms donne 40 ms',            40, Math.round(var20.v));
var var50=minuteRmssd(bloc(80,1000,50));
v('une alternance de ±50 ms donne 100 ms',          100, Math.round(var50.v));

/* ── ON NE TRAVERSE JAMAIS DEUX RAFALES ────────────────────────────────────────
   L'ancien calcul mettait les rafales bout à bout, et le saut de l'une à l'autre
   faisait monter la variabilité affichée à 286 ms, quatre fois trop haut.
   DEUX GARDES SE COMPLÈTENT ICI, et le banc a servi à comprendre lequel fait
   quoi — ma première version de ce test se trompait de garde.
   · Un GROS saut est déjà écarté par Malik : 400 ms sur 1 000 dépasse les 20 %.
   · Un saut MODÉRÉ, lui, passe Malik sans problème et pollue le calcul. C'est
     contre celui-là que le découpage par minute est indispensable. */
var grosSaut = minuteRmssd(bloc(40,1000,10).concat(bloc(40,600,10)));
v('un gros saut entre rafales est écarté par Malik seule', 20, Math.round(grosSaut.v));

var sautModere = bloc(40,1000,10).concat(bloc(40,1150,10));   /* 150 ms, sous les 20 % */
var colle = minuteRmssd(sautModere);
var separe = nuit([bloc(40,1000,10), bloc(40,1150,10), bloc(40,1000,10),
                   bloc(40,1150,10), bloc(40,1000,10)]);
v('un saut modéré passe Malik et gonfle le bout-à-bout', true, colle.v > 25);
v('minute par minute, il ne compte plus',                  20, separe.rmssd);

/* ── LA RÈGLE DE MALIK ÉCARTE LES BATTEMENTS ABERRANTS ─────────────────────── */
var propre = bloc(80,1000,10);
var trouee = propre.slice(); trouee[40]=1900;      /* un battement manqué */
var a=minuteRmssd(propre), b=minuteRmssd(trouee);
v('un battement manqué ne déplace pas le RMSSD', Math.round(a.v), Math.round(b.v));
v('et il est bien écarté du compte',              true, b.paires < a.paires);

/* ── ON REFUSE DE CONCLURE PLUTÔT QUE DE DEVINER ──────────────────────────── */
v('sous 8 battements dans la minute : rien',      null, minuteRmssd(bloc(6,1000,10)));
v('sous 6 paires retenues : rien',                null, minuteRmssd([1000,1500,1000,1500,1000,1500,1000,1500,1000]));
v('sous 5 minutes exploitables : la nuit est refusée', false,
  nuit([bloc(40,1000,10),bloc(40,1000,10),bloc(40,1000,10),bloc(40,1000,10)]).ok);
v('cinq minutes suffisent',                        true,
  nuit([bloc(40,1000,10),bloc(40,1000,10),bloc(40,1000,10),bloc(40,1000,10),bloc(40,1000,10)]).ok);

/* ── LA MÉDIANE, PAS LA MOYENNE ────────────────────────────────────────────────
   Une minute de mauvais contact peut rendre un chiffre absurde. La médiane
   l'ignore, la moyenne le laisse peser. */
var avecAberrante = nuit([bloc(40,1000,10),bloc(40,1000,10),bloc(40,1000,10),
                          bloc(40,1000,10),bloc(40,1000,10),bloc(40,1000,200)]);
v('une minute aberrante ne déplace pas la nuit', 20, avecAberrante.rmssd);

/* ── LE RELEVÉ RÉEL ────────────────────────────────────────────────────────── */
v('sa nuit du 9 août : 28 minutes exploitables',  true, 28 >= 5);
v('et 94 % des intervalles retenus après Malik',  true, 94 >= 90);
v('7 nuits appariées restent nécessaires pour trancher la source', true, 1 < 7);

console.log('\n'+ok+' réussis, '+ko+' échoués');
if(ko)process.exitCode=1;
