/* LA FICHE D'UNE SÉANCE NE DOIT RIEN INVENTER.
   Félix, le 9 août 2026 : « quand je clique sur une activité, il n'y a rien qui
   s'affiche » et « des fois il y a des chiffres qui ne sont pas bien branchés ».
   Quatre défauts trouvés, tous mesurés sur son appareil. */
var ok=0,ko=0;
function v(nom,att,eu){ if(att===eu){ok++;console.log('✅ '+nom);}
  else{ko++;console.log('❌ '+nom+'  attendu '+JSON.stringify(att)+', eu '+JSON.stringify(eu));} }

/* ── 1. LES PAS ÉTAIENT LA DURÉE MULTIPLIÉE PAR 104 ───────────────────────────
   Séance de musculation du 9 août, 26 minutes. La montre avait compté 445 pas
   dans `actDet`. La fiche en affichait 2 704. */
function pasInventes(dur,intv){ return Math.round(dur*(intv>=3?128:104)); }
function pasMesures(actDet,minuit,debutMin,dur){
  if(!actDet||!actDet.length)return null;
  var tot=0,vus=0;
  actDet.forEach(function(x){
    if(!x||x.length<2)return;
    var m=Math.round((x[0]-minuit)/60);
    if(m>=debutMin&&m<=debutMin+dur){tot+=(x[1]||0);vus++;}
  });
  return vus?tot:null;
}
var MINUIT=0;
var actDet=[[721*60,200,1.2],[735*60,245,1.5],[900*60,3000,20]];  /* 12h01 et 12h15, puis 15h */
v('la montre a mesuré 445 pas pendant la séance', 445, pasMesures(actDet,MINUIT,721,26));
v('la formule en inventait 2 704',               2704, pasInventes(26,2));
v('sans enregistrement dans la fenêtre : null',  null, pasMesures(actDet,MINUIT,300,26));
v('sans actDet du tout : null',                  null, pasMesures([],MINUIT,721,26));

/* ── 2. LE SEUIL ABSOLU CONDAMNAIT LES COURTES SÉANCES ────────────────────────
   La montre mesure une fois par minute : il fallait 25 MINUTES pour avoir droit
   à sa vraie courbe. Une séance de 10 minutes parfaitement mesurée basculait
   sur une série fabriquée. */
function assezAncien(n){ return n>=25; }
function assezNouveau(n,dur){ return n>=Math.max(5,Math.round(dur*0.5)); }
v('10 min parfaitement mesurées : refusées par l ancien seuil', false, assezAncien(11));
v('10 min parfaitement mesurées : acceptées désormais',          true, assezNouveau(11,10));
v('26 min bien mesurées : acceptées dans les deux cas',          true, assezAncien(27)&&assezNouveau(27,26));
v('60 min avec seulement 12 points : refusées',                 false, assezNouveau(12,60));
v('60 min avec 12 points passaient l ancien seuil… non',        false, assezAncien(12));
v('4 min avec 4 points : sous le plancher de 5',                false, assezNouveau(4,4));

/* ── 3. SANS MESURE, AUCUN CHIFFRE DÉRIVÉ ─────────────────────────────────────
   Le natif ne DESSINE pas la courbe quand `mesure` est faux, mais la moyenne,
   le maximum et les zones en étaient tirés et s'affichaient quand même. */
function fiche(hr){
  var base=[]; if(hr)for(var i=0;i<300;i++)base.push(hr[Math.min(hr.length-1,Math.floor(i*hr.length/300))]);
  return {mesure:!!hr,
          moyenne: base.length?Math.round(base.reduce(function(a,b){return a+b;},0)/base.length):null,
          maximum: base.length?Math.max.apply(null,base):null,
          zones:   base.length?[]:null};
}
var sans=fiche(null);
v('sans mesure, pas de moyenne', null, sans.moyenne);
v('sans mesure, pas de maximum', null, sans.maximum);
v('sans mesure, pas de zones',   null, sans.zones);
var avec=fiche([110,120,130]);
v('avec mesure, la moyenne existe', true, avec.moyenne!=null);

/* ── 4. PLUS AUCUNE VALEUR DE SECOURS INVENTÉE ────────────────────────────────
   L ancienne fiche retombait sur 51 minutes, un départ à 14h14 (minute 854) et
   une charge de 8,5. Le vieil écran, lui, rendait une partie de football entière
   écrite en dur dès que le nom contenait « foot ». */
function ficheDe(sess){
  if(!sess)return null;
  var dur=sess.dur||0; if(!dur)return null;
  return {dur:dur, debut:sess.start};
}
v('sans séance, la fiche ne raconte rien',        null, ficheDe(null));
v('séance sans durée : rien non plus',            null, ficheDe({start:'12:01'}));
v('séance réelle : ses vraies valeurs',             26, ficheDe({start:'12:01',dur:26}).dur);
v('une séance nommée « foot » n est plus détournée', 26,
  ficheDe({start:'12:01',dur:26,name:'Foot du soir'}).dur);

console.log('\n'+ok+' réussis, '+ko+' échoués');
if(ko)process.exitCode=1;
