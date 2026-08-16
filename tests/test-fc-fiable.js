/* LE CŒUR DIT S'IL EST FIABLE — `flFcFiable`, éprouvé sur les deux téléphones.
   ═══════════════════════════════════════════════════════════════════════════

   Le capteur optique décroche dès que le poignet bouge : sur la montée la plus
   dure de Dino, 79 bpm lus contre 140 chez WHOOP, et « Effort léger » affiché
   sur une séance à 15,9. Ces 79 sont une vraie mesure — du capteur, pas du
   cœur. La fonction ne jette rien : elle DIT.

   CE BANC NOTE LA SIGNATURE CONTRE LES DONNÉES RÉELLES :
     · toutes les nuits des deux téléphones doivent sortir FIABLES (poignet
       immobile — c'est le témoin) ;
     · les trois fenêtres que Dino a mesurées comme les plus sous-estimées face
       à WHOOP (-61, -37, -34 bpm) doivent sortir NON FIABLES ;
     · et les marches où le capteur a tenu (écart 3-4 bpm/min, 0 % de sauts)
       doivent RESTER fiables — un détecteur qui condamne tout mouvement ne
       mesure rien, il préjuge.

   USAGE :  node FLINT/web/tests/test-fc-fiable.js
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

var STORE={};
global.window={};
global.watchOf=function(k){return STORE['watch_'+k]||null;};
eval(bloc('  window.flFcFiable=function(K,debutMin,finMin){'));
var fiable=window.flFcFiable;

/* ── 1. LES CAS CONSTRUITS, POUR ISOLER CHAQUE RÈGLE ───────────────────────── */
function serie(vals,pas){ var out=[],m=600;
  vals.forEach(function(x){out.push([m,x]);m+=(pas||1);}); return out; }

STORE['watch_j']={hr:serie([62,63,62,64,63,62,63,64,63,62])};
var r=fiable('j',600,620);
v('un cœur stable est fiable',            true, r&&r.fiable);
v('  son écart médian est petit',         true, r&&r.ecartMedian<=2);

STORE['watch_j']={hr:serie([120,58,131,60,154,59,140,62,148,61])};
v('des dents de scie ne sont pas fiables', false, fiable('j',600,620).fiable);

STORE['watch_j']={hr:serie([100,101,103,102,104,103,105])};
v('sept points seulement : on ne juge pas', null, fiable('j',600,610));

STORE['watch_j']={hr:[]};
v('sans courbe du tout : on ne juge pas',   null, fiable('j',600,620));

/* Un trou dans la fenêtre ne fabrique pas un saut : l'écart est PAR MINUTE. */
STORE['watch_j']={hr:[[600,80],[601,82],[602,81],[610,84],[611,83],[612,85],[613,84],[614,86],[615,85]]};
var rt=fiable('j',600,620);
v('un trou de huit minutes ne condamne pas', true, rt&&rt.fiable);

/* ── 2. SUR LES DEUX TÉLÉPHONES ────────────────────────────────────────────── */
function charger(nom,date){
  var p=path.join(RACINE,'releves','donnees-'+nom+'-'+date+'.json');
  if(!fs.existsSync(p))return null;
  return JSON.parse(fs.readFileSync(p,'utf8'));
}
var DINO=charger('dino','2026-08-11'), FELIX=charger('felix','2026-08-12');
if(!DINO||!FELIX){
  console.log('⏭  un export manque — la partie réelle est sautée.');
  console.log('\n'+ok+' vérifications passées, '+ko+' échouées.');
  process.exit(ko?1:0);
}

function monter(exp){
  STORE={};
  Object.keys(exp.donnees).forEach(function(k){STORE[k]=exp.donnees[k];});
}

/* Les nuits : le témoin immobile. Toutes doivent être fiables. */
[['dino',DINO],['felix',FELIX]].forEach(function(duo){
  monter(duo[1]);
  var mauvaises=0,total=0;
  Object.keys(duo[1].donnees).forEach(function(k){
    if(!/^watch_/.test(k))return;
    var n=(duo[1].donnees[k]||{}).night;
    if(!n||n.bedMin==null||n.wakeMin==null||n.bedMin>n.wakeMin)return;
    var q=fiable(k.slice(6),n.bedMin,n.wakeMin);
    if(!q)return;
    total++;
    if(!q.fiable)mauvaises++;
  });
  v('  '+duo[0]+' : toutes les nuits jugées sont fiables ('+total+')', 0, mauvaises);
});

/* Les trois fenêtres les plus sous-estimées de Dino (heure de La Réunion,
   ramenée à l'heure de la machine comme dans test-marches-reelles). */
monter(DINO);
/* AUCUN DECALAGE ICI, et c'est le point qui m'a piege en l'ecrivant : `hr`
   porte la minute du POIGNET, calculee sur le telephone du porteur au moment
   de l'ecriture. Les fenetres en heure de La Reunion se comparent donc
   directement. C'est `actDet` (horodatage epoch) qui exige le fuseau — pas
   `hr`. Le premier jet decalait, et les trois fenetres decrochees sortaient
   fiables : elles pointaient deux heures a cote. */
function f(K,a,b){ return fiable(K,a,b); }
var m8=f('2026-8-8',579,650);      /* 09h39-10h50, la montée (-61 bpm) */
v('  la montée du 8 (WHOOP -61 bpm) est non fiable', false, m8&&m8.fiable);
var m10=f('2026-8-10',907,960);    /* 15h07-16h00 (-37 bpm) */
v('  la marche du 10 (-37 bpm) est non fiable',      false, m10&&m10.fiable);
var m9=f('2026-8-9',595,712);      /* 09h55-11h52 (-34 bpm) */
v('  la randonnée du 9 (-34 bpm) est non fiable',    false, m9&&m9.fiable);

/* Et les marches où le capteur a TENU restent fiables. */
var b58=f('2026-8-5',1378,1417);   /* 22h58, écart 4,0 · 0 % */
v('  la marche du 5 à 22h58 (capteur propre) reste fiable', true, b58&&b58.fiable);
var b16=f('2026-8-9',979,1001);    /* 16h19, écart 3,0 · 0 % */
v('  la randonnée du 9 à 16h19 reste fiable',               true, b16&&b16.fiable);

console.log('\n'+ok+' vérifications passées, '+ko+' échouées.');
process.exit(ko?1:0);
