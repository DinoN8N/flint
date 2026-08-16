/* CE QUE LA JOURNÉE CONTIENT DÉJÀ — `flVisiteContexte`.
   ═══════════════════════════════════════════════════════════════════════════

   Réceptacle déclaré (PASSATION-VISITE.md). La visite guidée entoure LA PREMIÈRE
   LIGNE VISIBLE du journal, quelle qu'elle soit, et son étape 18 explique
   comment la modifier ou la supprimer. Si cette ligne est une sortie GPS, son
   menu long ne propose pas « Modifier » : la phrase promet alors un geste qui
   n'existe pas sur l'élément entouré.

   LE CŒUR DU BANC EST LE POINT 2. `flVisiteContexte` et « Ma journée » sont deux
   constructions différentes de la même liste. Si elles divergeaient d'un jour, la
   visite ouvrirait son trou sur une ligne et en décrirait une autre — un défaut
   que personne ne verrait avant de le vivre. On rejoue les deux et on vérifie
   qu'elles désignent la même.

   USAGE :  node FLINT/web/tests/test-visite-contexte.js
   ═══════════════════════════════════════════════════════════════════════════ */
var fs=require('fs'), path=require('path');
var ok=0,ko=0;
function v(nom,att,eu){ if(att===eu){ok++;console.log('✅ '+nom);}
  else{ko++;console.log('❌ '+nom+'  attendu '+JSON.stringify(att)+', eu '+JSON.stringify(eu));} }

var RACINE=path.join(__dirname,'..','..','..');
var src=fs.readFileSync(path.join(RACINE,'FLINT','web','index.html'),'utf8');
function bloc(amorce){
  var i=src.indexOf(amorce);
  if(i<0)throw new Error('amorce introuvable : '+amorce);
  var d=0,j=src.indexOf('{',i);
  for(;;){ if(src[j]==='{')d++; else if(src[j]==='}'){d--; if(!d)break;} j++; }
  return src.slice(i,j+1);
}

var STORE={}, NUIT=null;
global.window={};
global.DB={ get:function(k,d){ return STORE[k]!==undefined?STORE[k]:d; },
            set:function(k,val){ STORE[k]=val; } };
global.tk=function(off){ var d=new Date(2026,7,11); if(off)d.setDate(d.getDate()+off);
  return d.getFullYear()+'-'+(d.getMonth()+1)+'-'+d.getDate(); };
global.sleepNight=function(){ return NUIT; };
global.actStrain=function(){ return 3.2; };
/* La journée logique décide QUELLES clés civiles composent la journée en
   cours ; ce banc-ci teste l'ORDRE des lignes, pas cette frontière — elle a son
   propre banc, `test-jour-logique.js`, et il la couvre sur dix scénarios. On
   pose donc ici le cas d'une journée qui ne traverse pas minuit, qui est le
   contrat documenté pour un seul jour. */
global.flJourLogiqueCles=function(off){ return [tk(Math.min(0,off||0))]; };
/* La VRAIE construction de la frise, celle que « Ma journée » emploie. La
   charger ici est le cœur du point 8 : les deux listes ne peuvent plus diverger
   puisqu'il n'y en a plus qu'une. */
eval(bloc('window.flEntreesJour=function(off){'));
global.flEntreesJour=window.flEntreesJour;
eval(bloc('window.flVisiteContexte=function(){'));
var ctx=window.flVisiteContexte;
var K=tk(0);

function poser(nuit,seances,repas){
  NUIT=nuit;
  STORE['sessions_'+K]=seances||[];
  STORE['meals_'+K]=repas||[];
}

/* ── 1. LA JOURNÉE VIDE ──────────────────────────────────────────────────────
   Zéro est une bonne réponse : la passation le dit en toutes lettres. Un faux
   `repas:1` ferait entourer une ligne qui n'existe pas. */
poser(null,[],[]);
var c=ctx();
v('journée vide : aucun repas',        0, c.repas);
v('  aucune boisson',                  0, c.boissons);
v('  aucune première ligne',        null, c.premiereLigne);
v('  et le jour est dit',              K, c.jour);

/* ── 2. LA NUIT OUVRE LE JOURNAL ─────────────────────────────────────────────
   `tri:0` dans « Ma journée » : elle passe avant tout, même un repas de 7 h. */
poser({bedMin:1405,wakeMin:480},[],[{time:'07:00',name:'Petit déj'}]);
v('la nuit passe avant le petit déjeuner', 'sommeil', ctx().premiereLigne);

/* ── 3. UNE NUIT SANS HORAIRES NE SE DESSINE PAS ─────────────────────────────
   Elle n'est donc pas la première ligne : la frise ne la porte pas. */
poser({bedMin:null,wakeMin:null},[],[{time:'07:00',name:'Petit déj'}]);
v('nuit sans horaires : le repas passe devant', 'repas', ctx().premiereLigne);

/* ── 4. SORTIE, SÉANCE, SIESTE : TROIS CHOSES DIFFÉRENTES ────────────────────
   C'est la distinction que fait le menu long, donc celle qui décide si la
   phrase de l'étape 18 tient. */
poser(null,[{start:'09:00',name:'Course',gps:'trk_1'}],[]);
v('une séance avec parcours est une sortie', 'sortie', ctx().premiereLigne);
poser(null,[{start:'09:00',name:'Muscu'}],[]);
v('une séance sans parcours est une séance', 'seance', ctx().premiereLigne);
poser(null,[{start:'14:00',name:'Sieste',type:'nap'}],[]);
v('une sieste est du sommeil',             'sommeil', ctx().premiereLigne);

/* ── 5. LE COMPTE DES REPAS ET DES BOISSONS ──────────────────────────────────
   Deux compteurs séparés : une boisson n'est pas un repas, et la visite ne
   parle que des seconds. */
poser(null,[],[{time:'08:00'},{time:'12:30'},{time:'10:00',boisson:true},{time:'19:00'}]);
var c5=ctx();
v('trois repas comptés',  3, c5.repas);
v('  une boisson à part', 1, c5.boissons);

/* ── 6. L HEURE DÉCIDE, PAS L ORDRE D ENREGISTREMENT ─────────────────────────
   Les entrées arrivent dans le désordre — un repas saisi le soir pour midi. */
poser(null,[{start:'18:00',name:'Muscu'}],[{time:'12:30'},{time:'07:15'}]);
v('la plus matinale ouvre le journal', 'repas', ctx().premiereLigne);
poser(null,[{start:'06:30',name:'Muscu'}],[{time:'12:30'},{time:'07:15'}]);
v('  même quand c est la séance',     'seance', ctx().premiereLigne);

/* ── 7. UNE ENTRÉE SANS HEURE PASSE EN DERNIER ───────────────────────────────
   `tri:9999` dans « Ma journée » — elle ne doit pas se retrouver en tête par
   accident, sinon la visite entourerait la ligne du bas. */
poser(null,[{name:'Sans heure'}],[{time:'12:30'}]);
v('une séance sans heure ne passe pas devant', 'repas', ctx().premiereLigne);

/* ── 8. LE VERDICT EST LE MÊME QUE CELUI DE « MA JOURNÉE » ───────────────────
   LE CŒUR DU BANC. Il y avait ici DEUX constructions de la même liste, et ce
   banc vérifiait par expressions régulières qu'elles employaient les mêmes
   constantes de tri. Ça tenait tant que les deux lisaient une seule clé civile.

   Depuis que la journée logique peut en traverser deux (nuit blanche), deux
   listes bâties séparément se seraient mises à désigner des premières lignes
   différentes, et la visite aurait entouré une ligne en en décrivant une autre.
   `flVisiteContexte` appelle donc désormais `flEntreesJour`, exactement comme
   « Ma journée ». On ne compare plus deux recopies : on vérifie qu'il n'y en a
   plus qu'une, et que « Ma journée » consomme bien celle-là. */
var jsrc=src.slice(src.indexOf('  journee: (function(){try{'));
var mTri=/e\.sort\(function\(a,b\)\{return a\.tri-b\.tri;\}\);/.test(jsrc.slice(0,4000));
v('« Ma journée » trie bien par heure croissante', true, mTri);
var mUne=/flEntreesJour\(_off\)/.test(jsrc.slice(0,2000));
v('  et sa frise vient de flEntreesJour, la source unique', true, mUne);
var vsrc=src.slice(src.indexOf('window.flVisiteContexte=function(){'));
var mVis=/flEntreesJour\(_o\)/.test(vsrc.slice(0,2000));
v('  et la visite lit EXACTEMENT la même',         true, mVis);
var mNuit=/genre:'sommeil',[\s\S]{0,120}tri:-99999/.test(jsrc.slice(0,2000));
v('  la nuit ouvre le journal, avant toute autre ligne', true, mNuit);
var mGarde=/if\(n&&n\.bedMin!=null&&n\.wakeMin!=null\)/.test(jsrc.slice(0,1500));
v('  et elle n y entre qu avec ses deux horaires', true, mGarde);
var esrc=src.slice(src.indexOf('window.flEntreesJour=function(off){'));
var mSans=/\(d0==null\?9999:d0\)\+dec/.test(esrc.slice(0,3000));
v('  et une entrée sans heure passe en dernier',   true, mSans);

/* ── 9. RIEN NE LÈVE, JAMAIS ─────────────────────────────────────────────────
   Le natif retombe sur `.inconnu` à la moindre incertitude, mais une exception
   qui remonterait salirait sa console à chaque lancement de visite. */
STORE['sessions_'+K]='pas un tableau';
STORE['meals_'+K]=null;
NUIT={bedMin:0};
var c9=ctx();
v('des données abîmées ne font pas lever', true, c9===null||typeof c9==='object');

console.log('\n'+ok+' vérifications passées, '+ko+' échouées.');
process.exit(ko?1:0);
