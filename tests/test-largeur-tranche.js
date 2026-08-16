/* LA LARGEUR D'UNE TRANCHE D'ACTIVITÉ — le défaut trouvé par Dino le 11 août.
   ═══════════════════════════════════════════════════════════════════════════

   `detectMarches` déduit la largeur d'une tranche au lieu de l'écrire en dur, et
   ce raisonnement est bon : elle vaut cinq minutes côté natif aujourd'hui,
   quinze hier, et un jour déjà en base garde l'ancien découpage.

   MAIS ELLE PRENAIT LE MINIMUM DES ÉCARTS. Un minimum se détruit avec UNE seule
   valeur aberrante, et les blocs du bracelet ne sont pas des cases régulières :
   ils arrivent à la volée, espacés d'une dizaine de minutes, avec de la gigue.
   Deux blocs qui tombent à une minute d'intervalle fixent `pas = 1` pour la
   journée entière, et tout s'écroule derrière — plus rien ne se raccorde, chaque
   bloc devient un segment d'une minute, et le minimum de durée les tue tous.

   Dix-huit séances faites par Dino en sept jours, deux vues. Quatre de ses sept
   journées ont un plus petit écart d'une minute : elles donnent zéro, toutes.

   CE BANC REJOUE LA VRAIE FONCTION, extraite d'`index.html`, sur des tranches
   construites à la main pour isoler le mécanisme — puis sur l'export réel.

   USAGE :  node FLINT/web/tests/test-largeur-tranche.js
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

/* ── 1. LE CODE NE DOIT PLUS PRENDRE LE MINIMUM ──────────────────────────────
   On le vérifie dans la SOURCE, parce que c'est la ligne exacte qui a coûté
   quinze séances sur dix-huit. Un jour, quelqu'un la réécrira « pour simplifier ». */
/* v1416 — le détecteur essaie d'abord la répartition par minute : ses deux
   aides vivent juste au-dessus et doivent voyager avec lui. */
var _i=src.indexOf('  var MIN_PLANCHER=');
var _j=src.indexOf('  function detectMarches(K){');
var f=src.slice(_i,_j)+bloc('  function detectMarches(K){');
v('la largeur ne se déduit plus du plus petit écart', false,
  /if\(d>0&&\(!pas\|\|d<pas\)\)pas=d;/.test(f));
v('  elle se déduit de la médiane des écarts', true,
  /_ec\.sort\(function\(a,b\)\{return a-b;\}\);/.test(f)
  && /_ec\[_ec\.length>>1\]/.test(f));
v('  et le garde-fou des trente minutes reste', true, /if\(!pas\|\|pas>30\)pas=15;/.test(f));

/* ── LE MONTAGE ───────────────────────────────────────────────────────────── */
var TRANCHES=null;
function monter(){
  /* `trancheDuJour` a un repli Apple Santé quand la montre n'a rien : on le
     laisse muet, ce banc éprouve le chemin du bracelet. */
  var g={ watchOf:function(){ return {actDet:TRANCHES}; },
          DB:{ get:function(k,d){ return d; } } };
  var code='var watchOf=g.watchOf, DB=g.DB;'
    +'var MARCHE_FORTE=40, MARCHE_FAIBLE=18, MARCHE_MIN_MIN=10,'
    +'    MARCHE_MIN_PAS=Math.round(MARCHE_FORTE*MARCHE_MIN_MIN*0.75);'
    +bloc('  function trancheDuJour(K){')+f+';return detectMarches;';
  return new Function('g',code)(g);
}
var detect=monter();

/* Construit une journée de blocs : `debutH` heures, `n` blocs espacés de
   `espace` minutes, `pas` pas chacun. Horodatage epoch, comme le bracelet. */
var JOUR=[2026,7,11];   /* 11 août 2026, mois 0-indexé */
function poser(debutMin,n,espace,pas,extra){
  var out=[];
  for(var i=0;i<n;i++){
    var m=debutMin+i*espace;
    var d=new Date(JOUR[0],JOUR[1],JOUR[2],Math.floor(m/60),m%60,0);
    out.push([Math.round(d.getTime()/1000), pas, 0]);
  }
  (extra||[]).forEach(function(m){
    var d=new Date(JOUR[0],JOUR[1],JOUR[2],Math.floor(m[0]/60),m[0]%60,0);
    out.push([Math.round(d.getTime()/1000), m[1], 0]);
  });
  out.sort(function(a,b){return a[0]-b[0];});
  return out;
}
/* La clé porte le mois 1-indexé, comme `tk()`. JOUR est en mois 0-indexé pour
   `new Date` : les deux doivent désigner le MÊME jour, sinon `trancheDuJour`
   filtre tout et le banc éprouve le repli Apple Santé au lieu du bracelet. */
var K=JOUR[0]+'-'+(JOUR[1]+1)+'-'+JOUR[2];

/* ── 2. UNE MARCHE FRANCHE EST VUE ───────────────────────────────────────────
   Six blocs de dix minutes à 800 pas : 80 pas/minute, une heure de marche
   soutenue. C'est le cas nominal, il doit passer. */
TRANCHES=poser(600,6,10,800);
var r=detect(K);
v('une heure de marche à 80 pas/min est vue', 1, r.length);
v('  et elle dure bien une heure', true, r.length===1 && (r[0].endMin-r[0].startMin)>=50);

/* ── 3. LE DÉFAUT, ISOLÉ ─────────────────────────────────────────────────────
   La MÊME journée, plus UN bloc à une minute du premier. Rien d'autre ne change.
   Avec l'ancien code, `pas` tombait à 1 et la journée entière disparaissait. */
TRANCHES=poser(600,6,10,800,[[601,80]]);
var r2=detect(K);
v('deux blocs à une minute ne détruisent plus la journée', true, r2.length>=1);
console.log('     (avec le minimum, cette journée rendait 0 séance)');

/* ── 4. NI DEUX, NI TROIS COUPLES RAPPROCHÉS ─────────────────────────────────
   Sur une vraie journée dense, plusieurs couples peuvent être proches. La
   médiane doit tenir tant que la MAJORITÉ des écarts est régulière. */
TRANCHES=poser(600,6,10,800,[[601,80],[611,80],[621,80]]);
v('trois couples rapprochés : la journée tient encore', true, detect(K).length>=1);

/* ── 5. LA MÉDIANE SUIT LE VRAI DÉCOUPAGE, PAS UN NOMBRE ÉCRIT EN DUR ────────
   C'est la raison d'être de la déduction, et elle doit survivre au correctif :
   des tranches de cinq minutes doivent être lues comme telles. */
TRANCHES=poser(600,12,5,400);        /* 5 min à 400 pas = 80 pas/min */
v('des tranches de cinq minutes sont lues comme telles', 1, detect(K).length);
TRANCHES=poser(600,4,15,1200);       /* 15 min à 1200 pas = 80 pas/min */
v('des tranches de quinze minutes aussi',                 1, detect(K).length);

/* ── 6. ON N INVENTE PAS POUR AUTANT ─────────────────────────────────────────
   Le zéro invention de Dino est la seule bonne nouvelle de son relevé : il ne
   doit pas être perdu en réparant les ratés. */
TRANCHES=poser(600,6,10,150);        /* 15 pas/min : quelqu un qui vit chez lui */
v('une journée sédentaire ne produit aucune marche', 0, detect(K).length);
TRANCHES=poser(600,1,10,900);        /* un seul bloc actif */
v('un bloc isolé ne fait pas une marche',            0, detect(K).length);

/* ── 7. SUR L EXPORT RÉEL ────────────────────────────────────────────────────
   Le chiffre qui compte : ce que le correctif change sur un vrai téléphone. */
var RELEVE=path.join(RACINE,'releves','donnees-felix-2026-08-11.json');
if(fs.existsSync(RELEVE)){
  var D=JSON.parse(fs.readFileSync(RELEVE,'utf8')).donnees;
  var g2={ watchOf:function(k){ return D['watch_'+k]||null; } };
  g2.DB={ get:function(k,d){ return d; } };
  var reel=new Function('g',
    'var watchOf=g.watchOf, DB=g.DB;'
    +'var MARCHE_FORTE=40, MARCHE_FAIBLE=18, MARCHE_MIN_MIN=10,'
    +'    MARCHE_MIN_PAS=Math.round(MARCHE_FORTE*MARCHE_MIN_MIN*0.75);'
    +bloc('  function trancheDuJour(K){')+f+';return detectMarches;')(g2);
  var jours=Object.keys(D).filter(function(k){return /^watch_/.test(k);})
    .map(function(k){return k.slice(6);});
  var total=0, detail=[];
  jours.forEach(function(J){ var n=0; try{n=(reel(J)||[]).length;}catch(e){}
    total+=n; if(n)detail.push(J+' : '+n); });
  v('  les marches réelles de Félix sont détectées', true, total>0);
  console.log('     '+total+' marche(s) sur onze jours — '+detail.join(', '));
  console.log('     (avec le MINIMUM, ce même code n en trouvait aucune le 9 août)');
  console.log('     Le compte a baissé de 9 à 4 avec le garde des deux tranches');
  console.log('     de la v1409 : un bloc isolé ne fait plus une sortie.');
}else{
  console.log('⏭  export absent — le rejeu réel est sauté.');
}

console.log('\n'+ok+' vérifications passées, '+ko+' échouées.');
process.exit(ko?1:0);
