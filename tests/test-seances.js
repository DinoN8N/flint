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
/* v1577 — le moteur lit desormais `DB.get('hrfine_<jour>')` : le banc l'injecte.
   `HRFINE` vide = l'etat d'avant, et c'est un etat TESTE plus bas : sans
   echantillons fins, la fonction doit rendre exactement ce qu'elle rendait. */
var HRFINE={};
var fabrique=new Function('flFcMax','flFcRepos','watchOf','flPtsEveil','p05','DB',
  code+';return detectSessions;');
function detecteur(fcMax,repos){
 return fabrique(
  function(){return {v:fcMax};},
  function(){return {v:repos};},
  function(){return {hr:HR};},
  function(){return HR;},
  function(a){var b=a.map(function(x){return x[1];}).sort(function(x,y){return x-y;});
             return b[Math.floor(b.length*0.05)];},
  {get:function(k,d){return (k in HRFINE)?HRFINE[k]:d;}});
}
var detect=detecteur(193,50);            /* Tanaka a 21 ans, le profil de Felix */

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

/* ═══ v1577 — LA RANDONNÉE DE DINO, LE CAS GARDÉ DU CANAL FIN ════════════════
   16 août 2026, 09h38-11h00, vérifiée contre WHOOP le 17 (moyenne 154 / max
   184 — COMPARAISON-WHOOP.md, § 17 août). Les données sont les VRAIES,
   exportées du téléphone : canal minute (nourri par les médianes v1431) ET
   `hrfine_<jour>` complet, 7 400 échantillons.
   Ce que le grain fin doit changer, et rien d'autre :
   — la vraie pointe (190) remplace la pointe des médianes (≤ 185) ;
   — la séance reste détectée aux MÊMES bornes, à trois minutes près ;
   — sans `hrfine`, le verdict d'avant revient à l'identique. */
var DINO=JSON.parse(fs.readFileSync(path.join(__dirname,'cas-dino-2026-08-16.json'),'utf8'));
var detectDino=detecteur(193.6,46);      /* le profil de Dino, cf. v1241 */
function randonnee(liste){
 return liste.filter(function(s){return s.startMin<660 && s.endMin>578;});
}
HRFINE={}; HR=DINO.hr;
var sans=randonnee(detectDino(DINO.jour)||[]);
v('16 août SANS hrfine : la randonnée est détectée (état d\'avant intact)', 1, sans.length);
HRFINE={'hrfine_2026-8-16':DINO.hrfine}; HR=DINO.hr;
var avec=randonnee(detectDino(DINO.jour)||[]);
v('16 août AVEC hrfine : la randonnée est détectée', 1, avec.length);
if(sans.length&&avec.length){
  var s=avec[0];
  v('  elle commence bien vers 09h38 (±3 min)', true, Math.abs(s.startMin-578)<=3);
  /* La vraie pointe du capteur est 190 (une minute isolée) ; la médiane de
     cette minute en garde 188. Le grain fin doit rendre la pointe ENTIÈRE —
     et ne peut jamais en rendre moins que le canal minute. */
  v('  la vraie pointe est retrouvée (190)', 190, s.maxHr);
  v('  et elle domine celle des médianes', true, s.maxHr>=sans[0].maxHr);
  /* `avgHr` n'est PAS la moyenne de séance WHOOP (154, fenêtre entière) :
     c'est la moyenne des points AU-DESSUS du seuil d'effort. Mesurée : 162
     par les médianes, 165 par le grain fin. On la borne, on ne la vise pas. */
  v('  la moyenne d\'effort reste dans son couloir (155-175)', true, s.avgHr>=155&&s.avgHr<=175);
  v('  les bornes sont des minutes entières', true,
    s.startMin===Math.floor(s.startMin) && s.endMin===Math.floor(s.endMin));
  /* Le grain fin affine aussi le VERDICT : 162→165 de moyenne d'effort fait
     franchir 85 % de la FC max — l'intensité passe de 3 à 4. C'est voulu :
     douze mesures par minute pèsent les pointes que la médiane écrasait. */
  v('  l\'intensité est jugée sur la vraie densité (4)', 4, s.int);
}

console.log('\n'+ok+' réussis, '+ko+' échoués');
if(ko)process.exitCode=1;
