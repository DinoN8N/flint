/* LE PLAFOND DES BATTEMENTS MANGEAIT LA NUIT, COMME CELUI DE LA FC.
   Même défaut que la v1309, sur le canal le plus précieux qu'on ait. Relevé sur
   l'appareil de Félix le 9 août :

       2026-8-4   rr 3000   rrH   0     ← plafond atteint
       2026-8-5   rr 3000   rrH   0     ← plafond
       2026-8-6   rr 3000   rrH   0     ← plafond
       2026-8-7   rr 3000   rrH 241     ← plafond
       2026-8-8   rr 3000   rrH 260     ← plafond

   Cinq jours sur six collés au plafond, et `slice(-3000)` gardait les trois
   mille DERNIERS : la nuit partait, l'après-midi restait. */
var ok=0,ko=0;
function v(nom,att,eu){ if(att===eu){ok++;console.log('✅ '+nom);}
  else{ko++;console.log('❌ '+nom+'  attendu '+att+', eu '+eu);} }

function ancien(rr){ return rr.length>3000?rr.slice(-3000):rr; }
function nouveau(rr){ return rr.length>30000?rr.slice(0,30000):rr; }

/* Une journée : la nuit d'abord (Félix se couche après minuit), le jour ensuite. */
function journee(nuit,jour){
  var a=[];
  for(var i=0;i<nuit;i++)a.push({n:1,i:i});   /* battements de la nuit */
  for(var j=0;j<jour;j++)a.push({n:0,i:j});   /* battements du jour */
  return a;
}
function nuitRestante(a){ return a.filter(function(x){return x.n===1;}).length; }

/* Le cas réel : une nuit de battements, puis une journée qui déborde. */
var J=journee(2000,5000);
v('sans plafond, tout est là',              2000, nuitRestante(J));
v('l ancien plafond détruit la nuit entière',  0, nuitRestante(ancien(J.slice())));
v('le nouveau la garde intacte',            2000, nuitRestante(nouveau(J.slice())));

/* Le plafond doit rester : il protège le stockage, qui est saturé. */
var enorme=journee(1000,60000);
v('le plafond se déclenche toujours',      30000, nouveau(enorme).length);
v('et il garde bien la nuit',               1000, nuitRestante(nouveau(enorme)));

/* DIMENSIONNEMENT, TIRÉ DE SA NUIT ET PAS D'UN ARRONDI.
   Sa fréquence nocturne tourne entre 43 et 56 bpm. Un premier jet à 20 000
   aurait encore coupé sa nuit, et c'est ce banc qui l'a dit avant l'appareil. */
v('8 h à 56 bpm, sa vraie fréquence haute', true, 8*60*56 <= 30000);
v('8 h à 60 bpm, avec de la marge',         true, 8*60*60 <= 30000);
v('20 000 auraient été insuffisants',      false, 8*60*60 <= 20000);
v('mais pas une journée entière à 70 bpm', false, 24*60*70 <= 30000);

/* LA LIMITE, ASSUMÉE. Couper par l'arrière garde le DÉBUT de la journée. Pour
   quelqu'un qui se couche à 23 h, la première moitié de sa nuit vit à la FIN de
   la clé de la veille : ce plafond-là la couperait. La vraie réponse est de
   purger par ÂGE, ce qui exige que tout soit horodaté. */
var veille=journee(0,35000);               /* journée pleine, qui dépasse déjà */
for(var k=0;k<1000;k++)veille.push({n:1,i:k});   /* puis la nuit, en fin de clé */
v('une nuit placée en FIN de clé serait perdue', 0, nuitRestante(nouveau(veille)));
v('et c est pour ça que rrH, horodaté, est le chantier d après', true, true);

console.log('\n'+ok+' réussis, '+ko+' échoués');
if(ko)process.exitCode=1;
