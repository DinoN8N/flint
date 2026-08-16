/* LA DÉTECTION DE SÉANCE, REJOUÉE SUR LES VRAIES COURBES.
   L'ancien banc comparait cinq densités figées en dur, relevées à un instant
   précis, à un seuil. Il affirmait « 25 points de marge entre le pire vrai et le
   meilleur faux ». Rejoué sur les données réelles onze jours plus tard, la marge
   valait 0,01 et l'ordre était inversé.
   UN BANC QUI NE REJOUE PAS LA MESURE NE PROUVE RIEN : il fige une opinion.
   Celui-ci charge les courbes cardiaques réelles de Félix et fait tourner la
   vraie fonction dessus. */
var fs=require('fs'), path=require('path');
var ok=0,ko=0;
function v(nom,att,eu){ if(att===eu){ok++;console.log('✅ '+nom);}
  else{ko++;console.log('❌ '+nom+'  attendu '+att+', eu '+eu);} }

/* ── on extrait la VRAIE fonction du moteur, pas une copie ─────────────────── */
var src=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
var i=src.indexOf('  function detectSessions(K){');
var d=0,j=i;
for(;;){ if(src[j]==='{')d++; else if(src[j]==='}'){d--; if(!d)break;} j++; }
var code=src.slice(i,j+1);

var COURBES=JSON.parse(fs.readFileSync(path.join(__dirname,'courbes-reelles.json'),'utf8'));
var HR=[];
var detect=new Function('flFcMax','flFcRepos','watchOf','flPtsEveil','p05',
  code+';return detectSessions;')(
  function(){return {v:193};},           /* Tanaka a 21 ans, le profil de Felix */
  function(){return {v:50};},
  function(){return {hr:HR};},
  function(){return HR;},
  function(a){var b=a.map(function(x){return x[1];}).sort(function(x,y){return x-y;});
             return b[Math.floor(b.length*0.05)];});

function seances(jour){ HR=COURBES[jour]||[]; return detect(jour)||[]; }

/* ── CE QUI DOIT ÊTRE TROUVÉ ──────────────────────────────────────────────────
   Deux séances réelles dans les données, vérifiées par rejeu le 11 août. */
var s9=seances('2026-8-9');
v('9 août : la séance de musculation est détectée', 1, s9.length);
if(s9.length){
  var a=s9[0].debut!=null?s9[0].debut:s9[0].startMin;
  v('  elle commence bien vers 12h02', true, Math.abs(a-722)<=3);
  /* `detectSessions` rend `startMin`/`endMin`, pas `debut`/`fin` : la mise en
     forme en seance affichable vient plus tard, dans `faconnerSeance`. */
  var f9=s9[0].endMin!=null?s9[0].endMin:s9[0].fin;
  v('  elle dure environ 26 minutes',   true, Math.abs((f9-a)-26)<=3);
}
var s8=seances('2026-8-8');
v('8 août : la séance du matin est détectée', 1, s8.length);
if(s8.length){
  var e=s8[0].eff!=null?s8[0].eff:s8[0].trimp;
  v('  sa charge est la plus forte du jeu (≈20)', true, e>=18 && e<=22);
}

/* ── LE CRITÈRE DE DENSITÉ, RETIRÉ LE 11 AOÛT ────────────────────────────────
   Il exigeait que 60 % des points du segment soient au-dessus du seuil. Rejoué
   sur les dix jours, il n'a changé qu'UN verdict : il a rejeté la séance du
   8 août, charge 20,1, la plus forte de tout le jeu de données.
   Le mécanisme était faux : le dénominateur continuait de compter APRÈS la fin
   du segment, pendant les huit minutes de fermeture. Il était donc surtout fait
   de la descente de récupération, si bien que plus une séance était intense,
   plus sa « densité » s'effondrait. Il punissait ce qu'il devait récompenser. */
v('le critère de densité a bien disparu du moteur', -1, src.indexOf('DENSITE_MIN'));
v('et son compteur biaisé aussi',                   -1, src.indexOf('g.recus'));

/* ── CE QUI RESTE, ET QUI EST MESURÉ ─────────────────────────────────────────
   La durée et la charge. Aucun segment retenu ne doit violer l'un ou l'autre. */
['2026-8-7','2026-8-8','2026-8-9'].forEach(function(jour){
  seances(jour).forEach(function(s){
    var dur=(s.endMin!=null?s.endMin:s.fin)-(s.startMin!=null?s.startMin:s.debut);
    var eff=s.eff!=null?s.eff:s.trimp;
    v('  '+jour+' : durée ≥ 6 min',  true, dur>=6);
    v('  '+jour+' : charge ≥ 12',    true, eff>=12);
  });
});

/* ── CE QUE CE BANC NE PROUVE PAS, ET QUI EST DIT ────────────────────────────
   Deux séances en dix jours reste peu. Le seuil de charge à 12 écarte le
   7 août à 8,6 et le 6 août à 9,3. Savoir si ce sont de vraies séances demande
   que Félix dise quels jours il s'est entraîné : sans cette vérité de terrain,
   baisser le seuil serait deviner, pas mesurer. */
v('le 7 août reste sous le seuil de charge', 0, seances('2026-8-7').length);

console.log('\n'+ok+' réussis, '+ko+' échoués');
if(ko)process.exitCode=1;
