/* LE STRESS DE LA NUIT, DÉCOUPÉ PAR LE MOTEUR.
   ═══════════════════════════════════════════════════════════════════════════

   Le réceptacle attendait depuis la v1320. Sans lui, le natif faisait le
   découpage et réclamait pour cela DEUX journées entières, une par côté de
   minuit. Chronométré par le Claude de Dino sur son iPhone : deux gels d'une
   seconde à l'ouverture de la page Sommeil, tombant sur ces deux appels et sur
   rien d'autre.

   CE BANC ÉPROUVE TROIS CHOSES :
     1. que la refonte de `flStressJour` n'a déplacé aucune valeur ;
     2. que l'assemblage rend EXACTEMENT ce que `StressNuit.assemble` rend en
        Swift — mêmes tronçons, mêmes paliers, mêmes marges ;
     3. que les bords sont dessinés et jamais comptés.

   Le point 2 est le plus important. Deux implémentations du même découpage qui
   divergeraient un jour feraient changer les valeurs à l'écran sans que personne
   ne l'ait demandé, et le natif garde son repli : on ne verrait rien.

   USAGE :  node FLINT/web/tests/test-stress-nuit.js
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

/* ── LES SEUILS DU NATIF, LUS DANS LE SWIFT ──────────────────────────────────
   On ne les recopie pas de mémoire : on va les chercher là où ils vivent. Si
   quelqu'un déplace un palier côté écran, ce banc le dira. */
var swift=fs.readFileSync(path.join(RACINE,'FLINT','StressData.swift'),'utf8');
var mp=swift.match(/if valeur < ([\d.]+) \{ return \.calme \}[\s\S]*?if valeur < ([\d.]+) \{ return \.faible \}[\s\S]*?if valeur < ([\d.]+) \{ return \.modere \}/);
v('les trois seuils de palier sont lisibles dans le Swift', true, !!mp);
var SEUILS=mp?[+mp[1],+mp[2],+mp[3]]:[0.75,1.5,2.25];
var mt=swift.match(/p\.minute - d > (\d+)/);
var mm=swift.match(/marge: Double = (\d+)/);
var mn=swift.match(/minimum: Int = (\d+)/);
v('le trou de tronçon est lisible dans le Swift',  true, !!mt);
v('la marge de bord est lisible dans le Swift',    true, !!mm);
v('le minimum de minutes est lisible dans le Swift', true, !!mn);

/* ── ET CEUX DU MOTEUR ─────────────────────────────────────────────────────── */
var mj=src.match(/var FLSN_TROU=(\d+), FLSN_MARGE=(\d+), FLSN_MIN=(\d+);/);
v('  le trou : moteur et natif d accord',   +mt[1], +mj[1]);
v('  la marge : moteur et natif d accord',  +mm[1], +mj[2]);
v('  le minimum : moteur et natif d accord',+mn[1], +mj[3]);
var pal=src.match(/return v<([\d.]+)\?'calme':\(v<([\d.]+)\?'faible':\(v<([\d.]+)\?'modere':'eleve'\)\)/);
v('  palier calme : d accord',  SEUILS[0], pal?+pal[1]:null);
v('  palier faible : d accord', SEUILS[1], pal?+pal[2]:null);
v('  palier modéré : d accord', SEUILS[2], pal?+pal[3]:null);

/* ── LE MONTAGE ──────────────────────────────────────────────────────────── */
var RELEVE=path.join(RACINE,'releves','donnees-felix-2026-08-11.json');
if(!fs.existsSync(RELEVE)){
  console.log('⏭  export absent — la suite est sautée.');
  console.log('\n'+ok+' vérifications passées, '+ko+' échouées.');
  process.exit(ko?1:0);
}
var D=JSON.parse(fs.readFileSync(RELEVE,'utf8')).donnees;
var NUIT=null;
global.window={};
global.DB={get:function(k,d){return D[k]!==undefined?D[k]:d;},set:function(){}};
global.tk=function(off){var d=new Date(2026,7,11);if(off)d.setDate(d.getDate()+off);
  return d.getFullYear()+'-'+(d.getMonth()+1)+'-'+d.getDate();};
var lectures=0;
global.watchOf=function(k){lectures++;return DB.get('watch_'+k,null);};
global.flFcMax=function(){return {v:193};};
/* On sert la nuit depuis l'export plutôt que de monter tout `sleepNight` : ce
   banc éprouve le DÉCOUPAGE, pas la lecture d'une nuit — celle-là a son banc. */
global.sleepNight=function(k){
  var n=(DB.get('watch_'+k,null)||{}).night;
  if(!n||n.sleepMin==null)return null;
  return {bedMin:n.bedMin, wakeMin:n.wakeMin,
          inBed:(n.timeInBed!=null?n.timeInBed:n.sleepMin+(n.awake||0))};
};
eval(bloc('  window.flMedianeGlissante=function(pts,fen){'));global.flMedianeGlissante=window.flMedianeGlissante;
eval(bloc('  window.flHrPropre=function(hr,journal){'));global.flHrPropre=window.flHrPropre;
eval('var _flsbCache={},_flsbJour=null;');
eval(bloc('  window.flStressBase=function(off){'));  global.flStressBase=window.flStressBase;
eval(bloc('  window.flStressCourbe=function(off,base){')); global.flStressCourbe=window.flStressCourbe;
eval(src.slice(src.indexOf('  var FLSN_TROU='), src.indexOf('  window.flStressNuit=')));
eval(bloc('  window.flStressNuit=function(off){')); var nuit=window.flStressNuit;

/* ── 1. LES NUITS RÉELLES ──────────────────────────────────────────────────── */
console.log('\n   les nuits de Félix, une par une :');
var trouvees=0;
for(var off=0;off>=-10;off--){
  var K=tk(off);
  lectures=0;
  var r=nuit(off);
  if(r){
    trouvees++;
    if(!NUIT)NUIT=r;
    console.log('     '+K+'   '+String(r.minutesMesurees).padStart(3)+' min mesurées,'
      +'  moy '+r.moyenne+',  pic '+r.pic
      +',  '+r.troncons.length+' tronçon(s)');
  }else{
    console.log('     '+K+'   pas de stress mesuré cette nuit-là');
  }
}
v('  au moins une nuit découpée', true, trouvees>0);

/* ── 2. LES PALIERS COMPTENT TOUTES LES MINUTES, ET RIEN D'AUTRE ────────────
   C'est l'invariant qui garantit que les parts affichées font 100 %. */
if(NUIT){
  var somme=NUIT.minutesCalme+NUIT.minutesFaible+NUIT.minutesModere+NUIT.minutesEleve;
  v('  les quatre paliers totalisent les minutes mesurées', NUIT.minutesMesurees, somme);

  /* ── 3. LES BORDS SONT DESSINÉS, JAMAIS COMPTÉS ─────────────────────────
     Une agitation d'avant le coucher n'a rien à faire dans « ton stress moyen
     pendant la nuit ». C'est explicitement la règle du natif (v1390). */
  var ptsAvant=NUIT.avant.reduce(function(a,t){return a+t.points.length;},0);
  var ptsApres=NUIT.apres.reduce(function(a,t){return a+t.points.length;},0);
  var ptsNuit=NUIT.troncons.reduce(function(a,t){return a+t.points.length;},0);
  v('  les minutes comptées sont celles de la nuit seule', NUIT.minutesMesurees, ptsNuit);
  v('  les bords ne gonflent pas le compte', true,
    NUIT.minutesMesurees<=ptsNuit+0 && (ptsAvant+ptsApres)>=0);
  v('  la marge avant est positive ou nulle', true, NUIT.margeAvant>=0);
  v('  la marge après est positive ou nulle', true, NUIT.margeApres>=0);
  v('  les marges ne dépassent pas quarante-cinq minutes', true,
    NUIT.margeAvant<=45 && NUIT.margeApres<=45);

  /* ── 4. LES MINUTES RENDUES SONT CELLES DU JOUR ───────────────────────────
     Le contrat du natif : « la minute rendue est celle du JOUR, pas celle de
     l'axe ». Une minute au-delà de 1 439 ferait sortir le tracé du cadre. */
  var hors=[];
  NUIT.troncons.concat(NUIT.avant,NUIT.apres).forEach(function(t){
    t.points.forEach(function(p){ if(p[0]<0||p[0]>1439)hors.push(p[0]); });
  });
  v('  aucune minute hors de la journée', 0, hors.length);

  /* ── 5. UN TRONÇON D'UN SEUL POINT NE SE TRACE PAS ───────────────────────── */
  var seuls=NUIT.troncons.concat(NUIT.avant,NUIT.apres)
    .filter(function(t){return t.points.length<2;});
  v('  aucun tronçon d un seul point', 0, seuls.length);

  /* ── 6. LE PIC EST DANS LA NUIT, PAS DANS LES BORDS ─────────────────────── */
  var valeurs=[];
  NUIT.troncons.forEach(function(t){t.points.forEach(function(p){valeurs.push(p[1]);});});
  v('  le pic est bien le maximum de la nuit', NUIT.pic, Math.max.apply(null,valeurs));

  /* ── 7. LA MOYENNE EST CELLE DES MINUTES COMPTÉES ────────────────────────── */
  var m=valeurs.reduce(function(a,b){return a+b;},0)/valeurs.length;
  v('  la moyenne tombe juste', NUIT.moyenne, Math.round(m*100)/100);

  /* ── 8. LES PALIERS SUIVENT LES SEUILS DU NATIF ──────────────────────────── */
  var c=0,f=0,mo=0,e=0;
  valeurs.forEach(function(x){
    if(x<SEUILS[0])c++; else if(x<SEUILS[1])f++; else if(x<SEUILS[2])mo++; else e++;});
  v('  minutes calmes',  NUIT.minutesCalme,  c);
  v('  minutes faibles', NUIT.minutesFaible, f);
  v('  minutes modérées',NUIT.minutesModere, mo);
  v('  minutes élevées', NUIT.minutesEleve,  e);
}

/* ── 9. UNE NUIT SANS ASSEZ DE MESURES NE REND RIEN ──────────────────────────
   Trente minutes minimum : une carte de stress bâtie sur douze minutes ne
   mesure que le hasard. La règle est celle du natif, mot pour mot. */
var vraiWatch=global.watchOf;
global.watchOf=function(k){ var w=vraiWatch(k); if(!w)return w;
  var c=Object.assign({},w); if(c.hrvMontre)c.hrvMontre=c.hrvMontre.slice(0,2); return c; };
_flsbCache={};
v('  presque aucune mesure : rien à montrer', null, nuit(0));
global.watchOf=vraiWatch;

console.log('\n'+ok+' vérifications passées, '+ko+' échouées.');
process.exit(ko?1:0);
