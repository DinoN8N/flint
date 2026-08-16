/* D'OÙ VIENT LA NUIT AFFICHÉE — `sourceNuit`.
   ═══════════════════════════════════════════════════════════════════════════

   Le 9 août, Dino : « ma nuit est fausse, je n'ai jamais dormi 8 h 25, et je me
   suis couché plus tard que 23 h 30. » Il avait raison sur les deux, et notre
   module de sommeil aussi : il avait mesuré 7 h 46, couché à 00 h 02. Ce que
   Dino voyait venait de `computeNight`, le découpage par percentiles de FC.

   Deux moteurs écrivent dans `watch_<K>.night`, et rien à l'écran ne disait
   lequel parlait. Une nuit déduite et une nuit mesurée s'affichaient avec le
   même aplomb — la définition d'un chiffre qui ment : pas faux, mal présenté.

   CE BANC ÉPROUVE UNE CHOSE ET UNE SEULE : que le verdict rendu à l'écran est
   le MÊME que celui que `_vaEvaluerNuit` rend déjà depuis des semaines pour
   décider si une nuit entre dans l'estimation du besoin. Deux critères qui
   divergeraient un jour seraient pires qu'un seul critère imparfait.

   USAGE :  node FLINT/web/tests/test-source-nuit.js
   ═══════════════════════════════════════════════════════════════════════════ */
var fs=require('fs'), path=require('path');
var ok=0,ko=0;
function v(nom,att,eu){ if(att===eu){ok++;console.log('✅ '+nom);}
  else{ko++;console.log('❌ '+nom+'  attendu '+JSON.stringify(att)+', eu '+JSON.stringify(eu));} }

var RACINE=path.join(__dirname,'..','..','..');
var src=fs.readFileSync(path.join(RACINE,'FLINT','web','index.html'),'utf8');

/* ── LA RÈGLE, EXTRAITE DU MOTEUR ────────────────────────────────────────────
   On prend le bloc tel qu'il est écrit dans `flSommeilData`, pas une copie.
   Une copie se désynchronise, et c'est précisément le défaut qu'on répare. */
var i=src.indexOf('  sourceNuit:(function(){');
if(i<0){ console.log('❌ `sourceNuit` introuvable dans flSommeilData'); process.exit(1); }
var fin=src.indexOf('})(),',i);
var corps=src.slice(src.indexOf('{',src.indexOf('function()',i))+1, fin);
var source=new Function('n', corps);

/* ── ET LE VERDICT DE `_vaEvaluerNuit`, LUI AUSSI EXTRAIT ───────────────────
   C'est la ligne qui décide depuis des semaines si une nuit compte pour le
   besoin de sommeil. Les deux doivent dire la même chose, toujours. */
var j=src.indexOf("o.motif='nuit deduite'");
var ligne=src.slice(src.lastIndexOf('if(',j), src.indexOf('\n',j));
var mDeduite=/if\(!so\.stages\|\|!so\.stages\.length\|\|!so\.stageSrc\)/.test(ligne);
v('le verdict du besoin lit bien stades + provenance', true, mDeduite);
function deduitePourLeBesoin(so){ return !so.stages||!so.stages.length||!so.stageSrc; }

/* ── 1. LES QUATRE VALEURS DU CONTRAT DE DINO ────────────────────────────── */
var stades=[{stage:'deep',startMin:0,durMin:60}];
v('notre re-staging, FC complète',  'flint-hr',      source({stages:stades,stageSrc:'flint-hr'}));
v('notre re-staging, FC partielle', 'flint-partiel', source({stages:stades,stageSrc:'flint-partiel'}));
v('la puce du bracelet a tranché',  'montre',        source({stages:stades,stageSrc:'montre'}));
v('percentiles de FC : déduite',    'deduite',       source({sleepMin:505}));

/* ── 2. LES DEUX MOITIÉS DU CRITÈRE COMPTENT ─────────────────────────────────
   Des stades sans provenance, ou une provenance sans stades, ne suffisent ni
   l'un ni l'autre. C'est exactement ce que le besoin exige déjà. */
v('des stades sans provenance : déduite',   'deduite', source({stages:stades}));
v('une provenance sans stades : déduite',   'deduite', source({stageSrc:'flint-hr'}));
v('un tableau de stades vide : déduite',    'deduite', source({stages:[],stageSrc:'flint-hr'}));

/* ── 3. LES DEUX VERDICTS NE DIVERGENT JAMAIS ────────────────────────────────
   Le cœur du banc. On balaie toutes les combinaisons possibles et on vérifie
   qu'aucune ne fait dire « mesurée » à l'un et « déduite » à l'autre. */
var cas=[];
[null,[],stades].forEach(function(g){
 [null,'flint-hr','flint-partiel','montre'].forEach(function(s){
  var o={}; if(g)o.stages=g; if(s)o.stageSrc=s; cas.push(o);
 });
});
var divergences=cas.filter(function(o){
 return (source(o)==='deduite')!==deduitePourLeBesoin(o);
});
v('  aucune divergence sur les '+cas.length+' combinaisons', 0, divergences.length);
if(divergences.length)console.log('      '+JSON.stringify(divergences.slice(0,3)));

/* ── 4. PAS DE NUIT, PAS DE VERDICT ──────────────────────────────────────────
   `null` et non `'deduite'` : dire « déduite » quand il n'y a rien du tout
   serait affirmer qu'une nuit existe. */
v('sans nuit du tout : rien à dire', null, source(null));

/* ── 5. SUR LES VRAIES NUITS DE L'EXPORT ─────────────────────────────────── */
var RELEVE=path.join(RACINE,'releves','donnees-felix-2026-08-11.json');
if(fs.existsSync(RELEVE)){
  var D=JSON.parse(fs.readFileSync(RELEVE,'utf8')).donnees;
  var jours=Object.keys(D).filter(function(k){return /^watch_/.test(k);})
    .map(function(k){return k.slice(6);})
    .sort(function(a,b){return new Date(a.replace(/-(\d)-/,'-0$1-'))
                             -new Date(b.replace(/-(\d)-/,'-0$1-'));});
  var compte={};
  console.log('\n   les nuits réelles de Félix, une par une :');
  jours.forEach(function(J){
    var nu=(D['watch_'+J]||{}).night;
    if(!nu||nu.sleepMin==null)return;
    var s=source(nu); compte[s]=(compte[s]||0)+1;
    console.log('     '+J+'   '+String(nu.sleepMin).padStart(4)+' min   '+s
      +(nu.stages?'   ('+nu.stages.length+' stades)':'   (aucun stade)'));
  });
  var total=Object.keys(compte).reduce(function(a,k){return a+compte[k];},0);
  v('  toutes les nuits ont un verdict', true, total>0);
  v('  aucune nuit ne reste sans réponse', false, compte[null]>0||compte['undefined']>0);
  /* On n'exige PAS que toutes soient mesurées : ce serait exiger de la donnée,
     pas du code. On exige que chacune sache dire ce qu'elle est. */
  console.log('     → '+Object.keys(compte).map(function(k){
    return compte[k]+' × '+k;}).join(', '));
}else{
  console.log('⏭  export absent — les nuits réelles sont sautées.');
}

console.log('\n'+ok+' vérifications passées, '+ko+' échouées.');
process.exit(ko?1:0);
