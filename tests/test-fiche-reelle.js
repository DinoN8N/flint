/* LA FICHE D'UNE SÉANCE, REJOUÉE SUR L'EXPORT RÉEL D'UN TÉLÉPHONE.
   ═══════════════════════════════════════════════════════════════════════════

   POURQUOI CE BANC EXISTE. Félix, le 11 août : « les fiches sont vides, il n'y a
   0 valeur quand je clique sur une activité. » Deux couches pouvaient produire
   cet écran, et toutes les deux se taisent : le moteur, dont le `catch` rend
   `{aDesDonnees:false}` sans un mot, et le décodage natif, dont un seul type qui
   ne tombe pas juste fait basculer TOUTE la fiche en `.vide`.

   Ce banc tranche la première des deux. Il extrait les VRAIES fonctions
   d'`index.html` par équilibrage d'accolades — pas une copie, pas un résumé — et
   les fait tourner sur `releves/donnees-felix-2026-08-11.json`, l'export du
   téléphone. La leçon de `test-seances.js` vaut ici aussi : un banc qui ne
   rejoue pas la mesure ne prouve rien, il fige une opinion.

   CE QUI EST REMPLACÉ, ET POURQUOI. L'export ne sort PAS le profil du téléphone,
   à dessein (voir `outils/exporter-donnees.sh`). `flFcMax` ne peut donc pas être
   rejouée : on pose 193, la valeur de Tanaka à 21 ans, comme `test-seances.js`.
   Elle ne déplace que la VALEUR de l'effort, jamais la présence d'un champ —
   `actStrain` retombe sur sa formule quand `flEffortSeance` rend `null`.

   USAGE :  node FLINT/web/tests/test-fiche-reelle.js
   ═══════════════════════════════════════════════════════════════════════════ */
var fs=require('fs'), path=require('path');
var ok=0,ko=0;
function v(nom,att,eu){ if(att===eu){ok++;console.log('✅ '+nom);}
  else{ko++;console.log('❌ '+nom+'  attendu '+JSON.stringify(att)+', eu '+JSON.stringify(eu));} }

var RACINE=path.join(__dirname,'..','..','..');
var RELEVE=path.join(RACINE,'releves','donnees-felix-2026-08-11.json');
if(!fs.existsSync(RELEVE)){
  console.log('⏭  export absent ('+RELEVE+') — banc ignoré.');
  console.log('   Il se régénère avec : zsh outils/exporter-donnees.sh felix');
  process.exit(0);
}
var src=fs.readFileSync(path.join(RACINE,'FLINT','web','index.html'),'utf8');

/* On prélève un bloc en équilibrant les accolades depuis son amorce : c'est ce
   qui garantit qu'on teste le code du moteur et non une transcription. */
function bloc(amorce){
  var i=src.indexOf(amorce);
  if(i<0)throw new Error('amorce introuvable dans index.html : '+amorce);
  var d=0,j=src.indexOf('{',i);
  for(;;){ if(src[j]==='{')d++; else if(src[j]==='}'){d--; if(!d)break;} j++; }
  return src.slice(i,j+1);
}

var EXPORT=JSON.parse(fs.readFileSync(RELEVE,'utf8'));
var STORE=EXPORT.donnees;
global.window={}; global.document={};
global.DB={ get:function(k,def){ return (STORE[k]!==undefined)?STORE[k]:def; },
            set:function(k,val){ STORE[k]=val; } };

/* `meta.jours` est trié comme du TEXTE — « 2026-9-9 » y passe après
   « 2026-8-11 » — et il porte des dates futures venues du pré-remplissage.
   On se cale sur le dernier jour qui porte vraiment une mesure. */
var JOURS=Object.keys(STORE).filter(function(k){return /^watch_/.test(k);})
  .map(function(k){return k.slice(6);})
  .sort(function(a,b){ return new Date(a.replace(/-(\d)-/,'-0$1-'))
                            -new Date(b.replace(/-(\d)-/,'-0$1-')); });
var AUJ=JOURS[JOURS.length-1];
global.tk=function(off){
  var p=AUJ.split('-').map(Number), d=new Date(p[0],p[1]-1,p[2]);
  if(off)d.setDate(d.getDate()+off);
  return d.getFullYear()+'-'+(d.getMonth()+1)+'-'+d.getDate();
};

global.STRAIN_MAX=20;
global.FL_POIDS_ZONE=[0.0305,0.0945,0.2515,0.3780,0.7709,1.3258];
global.FL_EFFORT_C=4.5;
global.watchOf=function(k){return DB.get('watch_'+k,null);};
global.getProfile=function(){return {};};
global.flFcMax=function(){return {v:193,src:'substitut de banc'};};
eval(bloc('  function p05(hr){'));                                global.p05=p05;
eval(bloc('  window.flMedianeGlissante=function(pts,fen){'));     global.flMedianeGlissante=window.flMedianeGlissante;
eval(bloc('function flIdxDense(n,val,cap){'));
eval(bloc('function hmsFull(sec){'));
eval(bloc('  window.flHrPropre=function(hr,journal){'));          global.flHrPropre=window.flHrPropre;
eval(bloc('  window.flEffortSeance=function(k,debutMin,finMin){'));global.flEffortSeance=window.flEffortSeance;
eval(bloc('function actStrain(s){'));
eval(bloc('function flEffData(doc){'));
eval(bloc('window.flActiviteData=function(rang,jour,seanceDirecte){'));
eval(bloc('window.flActiviteParGps=function(gid){'));                global.flActiviteParGps=window.flActiviteParGps;

/* Le moteur bavarde à chaque ouverture de fiche ; le banc n'a rien à en faire.
   On GARDE la vraie fonction de côté : `require('console')` rend l'objet global
   lui-même, donc le rappeler après coup ne rendrait que le silence qu'on vient
   de poser. */
var dire=console.log;
console.log=function(){};
var fiches=[];
JOURS.forEach(function(J){
  var ss=STORE['sessions_'+J]||[]; if(!ss.length)return;
  var p=J.split('-').map(Number), q=AUJ.split('-').map(Number);
  var off=Math.round((new Date(p[0],p[1]-1,p[2])-new Date(q[0],q[1]-1,q[2]))/86400000);
  /* v1418 — LE JOUR VOYAGE AVEC LE RANG, et ce banc le prouve de la façon la
     plus dure : on met exprès `flDayOff` sur un AUTRE jour avant chaque appel.
     C'est la situation exacte des « --- partout » de Félix — le moteur rechargé
     sur aujourd'hui pendant que l'écran montre une journée passée. La fiche
     doit répondre quand même, parce que l'appel nomme son jour. */
  window.flDayOff=off-3;
  ss.forEach(function(s,rang){ fiches.push({jour:J,rang:rang,sess:s,r:window.flActiviteData(rang,off)}); });
});
console.log=dire;

/* ── 1. AUCUNE FICHE VIDE SUR UNE SÉANCE QUI EXISTE ──────────────────────────
   C'est le cœur du signalement. Une séance rangée dans `sessions_<jour>` a par
   construction une durée et une heure : le moteur n'a aucune raison de refuser
   de la raconter. */
v('des séances réelles à rejouer', true, fiches.length>0);
fiches.forEach(function(f){
  v('  '+f.jour+' rang '+f.rang+' ('+f.sess.name+' '+f.sess.start+') : la fiche répond',
    true, !!(f.r&&f.r.aDesDonnees));
});

/* ── 2. LES CHAMPS QUE L'ÉCRAN LIT SONT LÀ ───────────────────────────────────
   Une fiche qui répond `aDesDonnees:true` avec tous ses champs à `null` est un
   écran vide qui a menti sur son état. On vérifie donc le contenu, pas le
   drapeau. `sansMesure` est volontairement absent de cette liste : il n'existe
   QUE quand la courbe manque, et c'est son travail. */
var REQUIS=['nom','verdict','debut','fin','minutes','duree','effort','kcal'];
fiches.filter(function(f){return f.r&&f.r.aDesDonnees;}).forEach(function(f){
  var vides=REQUIS.filter(function(c){return f.r[c]==null;});
  v('  '+f.jour+' rang '+f.rang+' : aucun champ d en-tête vide', 0, vides.length);
  if(vides.length)console.log('      manquants : '+vides.join(', '));
});

/* ── 3. UNE COURBE MESURÉE ENTRAÎNE SES DÉRIVÉS, ET RÉCIPROQUEMENT ───────────
   La règle de la v1311 : sans mesure, pas de moyenne, pas de maximum, pas de
   zones — mais une RAISON en français. Les deux moitiés comptent : un écran qui
   se tait est aussi faux qu'un écran qui invente. */
fiches.filter(function(f){return f.r&&f.r.aDesDonnees;}).forEach(function(f){
  var r=f.r, tag='  '+f.jour+' rang '+f.rang;
  if(r.mesure){
    v(tag+' : mesurée, donc moyenne et maximum', true, r.moyenne!=null&&r.maximum!=null);
    v(tag+' : mesurée, donc six zones',             6, (r.zones||[]).length);
    v(tag+' : mesurée, donc pas de raison d absence', true, r.sansMesure==null);
  }else{
    v(tag+' : sans mesure, aucune moyenne ni maximum', true, r.moyenne==null&&r.maximum==null);
    v(tag+' : sans mesure, la raison est dite',        true, !!r.sansMesure);
  }
});

/* ── 4. LE NATIF DOIT POUVOIR DÉCODER ────────────────────────────────────────
   `ActiviteData` (ActiviteView.swift) est stricte : `hr: [Int]?`, `minutes:
   Int?`, `zones[].bas/haut: Int?`. Un SEUL décimal là-dedans et `JSONDecoder`
   refuse la charge ENTIÈRE — la fiche devient `.vide` sans qu'aucun chiffre
   n'ait été faux. C'est le mode de panne le plus discret de tout l'écran, et il
   ne se voit qu'ici : rien côté web ne s'en plaint.

   La médiane glissante de `flHrPropre` est le suspect naturel — une médiane sur
   un nombre pair de points rendrait des demis. */
fiches.filter(function(f){return f.r&&f.r.aDesDonnees;}).forEach(function(f){
  var r=f.r, mauvais=[];
  (r.hr||[]).forEach(function(x,i){ if(!Number.isInteger(x))mauvais.push('hr['+i+']='+x); });
  if(r.minutes!=null&&!Number.isInteger(r.minutes))mauvais.push('minutes='+r.minutes);
  (r.zones||[]).forEach(function(z,i){
    ['id','bas','haut'].forEach(function(c){
      if(z[c]!=null&&!Number.isInteger(z[c]))mauvais.push('zones['+i+'].'+c+'='+z[c]); });
  });
  (r.hrT||[]).forEach(function(x,i){
    if(!Array.isArray(x)||x.length!==2)mauvais.push('hrT['+i+'] n est pas une paire'); });
  v('  '+f.jour+' rang '+f.rang+' : décodable par ActiviteData', 0, mauvais.length);
  if(mauvais.length)console.log('      '+mauvais.slice(0,5).join(', '));
});

/* ── 5. AUCUN NOMBRE NON FINI ────────────────────────────────────────────────
   `JSONSerialization` LÈVE sur un NaN ou un infini, et c'est toute la charge qui
   devient nil avant même le décodage. Le natif journalise et assainit depuis la
   v1207, mais la page part alors avec des trous. Autant ne pas en produire. */
function nonFinis(o,chemin,sortie){
  if(typeof o==='number'){ if(!isFinite(o))sortie.push(chemin); return sortie; }
  if(Array.isArray(o)){ o.forEach(function(x,i){nonFinis(x,chemin+'['+i+']',sortie);}); return sortie; }
  if(o&&typeof o==='object'){ Object.keys(o).forEach(function(k){nonFinis(o[k],chemin+'.'+k,sortie);}); }
  return sortie;
}
fiches.filter(function(f){return f.r&&f.r.aDesDonnees;}).forEach(function(f){
  var s=nonFinis(f.r,'',[]);
  v('  '+f.jour+' rang '+f.rang+' : aucun NaN ni infini', 0, s.length);
  if(s.length)console.log('      '+s.slice(0,5).join(', '));
});

/* ── 6. LA FENÊTRE EST CELLE DE LA SÉANCE ────────────────────────────────────
   `flEffData` retrouve la séance par son heure de début, à six minutes près, et
   peut donc en attraper une AUTRE quand deux se suivent. On vérifie que ce
   qu'elle a raconté est bien ce qu'on lui a demandé. */
fiches.filter(function(f){return f.r&&f.r.aDesDonnees;}).forEach(function(f){
  var attendu=f.sess.start.length===4?('0'+f.sess.start):f.sess.start;
  v('  '+f.jour+' rang '+f.rang+' : raconte bien la séance de '+attendu,
    attendu, f.r.debut);
  v('  '+f.jour+' rang '+f.rang+' : et sa durée',  f.sess.dur, f.r.minutes);
});

/* ── 7. UNE SORTIE DU TRACKER SANS SÉANCE MARIÉE (v1499) ─────────────────────
   Dino, le 14 août : « le graphique d'effort et les zones ne s'affichent pas sur
   les fiches d'activités du tracker ». Relevé sur son téléphone : sur ses trois
   sorties, une seule portait son identifiant dans `sessions_` — les deux autres
   étaient orphelines, et `flActiviteParGps` rendait un vide.

   LE REPLI PAR DATE + HEURE, ENVISAGÉ D'ABORD, NE TENAIT PAS : sa course du
   10 août part à 20h01 et aucune séance de ce jour-là n'en est proche ; sa
   randonnée du 12 août tombe DANS un « Renforcement » détecté à 1h02 qui dure
   1841 minutes, et l'y marier aurait calculé son effort sur trente heures. On
   reconstitue donc la fiche depuis la SORTIE elle-même — elle porte son jour, sa
   minute de départ et sa durée, et le cœur vit dans `watch_<K>`, pas dans les
   séances.

   L'export de Félix ne contient aucune sortie GPS : on en pose une sur SES
   battements réels, à un endroit où la montre a mesuré. La donnée reste vraie,
   c'est le tracé qu'on invite. */
var W=DB.get('watch_'+AUJ,null), HR=(W&&W.hr)||[];
v('des battements réels pour poser une sortie', true, HR.length>10);
if(HR.length>10){
  /* On cherche une heure de la journée où la montre a bien mesuré : il faut
     passer le plancher de `flEffData` (la moitié des minutes, au moins cinq). */
  var DEP=null,DUREE=40;
  for(var q=0;q<HR.length;q++){
    var d0=HR[q][0];
    var n=HR.filter(function(x){return x[0]>=d0&&x[0]<=d0+DUREE;}).length;
    if(n>=Math.max(5,Math.round(DUREE*0.5))){DEP=d0;break;}
  }
  v('  une fenêtre assez mesurée existe', true, DEP!=null);

  if(DEP!=null){
    var ID='BANC-1499-SANS-SEANCE';
    var hhmm=function(m){return String(Math.floor(m/60)).padStart(2,'0')+':'
                               +String(m%60).padStart(2,'0');};
    STORE['gps_'+ID]={id:ID,jour:AUJ,debutMin:DEP,dureeS:DUREE*60,
                      sport:'rando',nom:'Randonnée du banc',caloriesEstimees:333};
    var dire2=console.log; console.log=function(){};
    var g=window.flActiviteParGps(ID);
    console.log=dire2;

    /* LE CŒUR DU CORRECTIF : aucune séance ne porte cet identifiant, et la
       fiche répond quand même. */
    v('  sortie orpheline : la fiche répond',        true, !!(g&&g.aDesDonnees));
    v('  sortie orpheline : elle se déclare sans séance', true, g&&g.sansSeance===true);
    v('  sortie orpheline : la fenêtre est la SIENNE',    hhmm(DEP), g&&g.debut);
    v('  sortie orpheline : et sa durée aussi',           DUREE,     g&&g.minutes);
    v('  sortie orpheline : la courbe est mesurée',       true, !!(g&&g.mesure));
    v('  sortie orpheline : donc ses six zones',          6, ((g&&g.zones)||[]).length);
    v('  sortie orpheline : et son nom',   'Randonnée du banc', g&&g.nom);
    /* LES CALORIES VIENNENT DU PARCOURS, PAS DU MODÈLE. `flEffData` les
       calculerait par `durée × intensité` (40 × 8 = 320 ici) ; la sortie en
       tient une meilleure, tirée de sa distance et de son dénivelé réels. Sans
       cette règle, la même sortie affiche deux nombres — un dans la liste des
       courses, un autre sur sa fiche. */
    v('  sortie orpheline : les calories sont celles du parcours', '333', g&&g.kcal);

    /* ET LA PRIORITÉ NE S'INVERSE PAS. Le jour où le moteur marie vraiment la
       sortie, c'est la SÉANCE qui parle — la reconstitution s'efface. Sans
       cette garantie, le correctif figerait une fiche de secours par-dessus la
       vraie mesure. */
    var avant=STORE['sessions_'+AUJ]||[];
    STORE['sessions_'+AUJ]=avant.concat([{name:'Séance mariée',start:hhmm(DEP),
                                          dur:DUREE,int:2,gps:ID,auto:false}]);
    var dire3=console.log; console.log=function(){};
    var g2=window.flActiviteParGps(ID);
    console.log=dire3;
    STORE['sessions_'+AUJ]=avant;
    v('  séance mariée : elle reprend la main',   true, !!(g2&&g2.aDesDonnees));
    v('  séance mariée : plus de reconstitution', true, !g2||!g2.sansSeance);
    v('  séance mariée : c est bien son nom', 'Séance mariée', g2&&g2.nom);

    delete STORE['gps_'+ID];
  }
}

/* ── 8. UNE SORTIE INCONNUE SE TAIT, MAIS ELLE DIT POURQUOI ──────────────────
   C'est la moitié « écran » du signalement : « la page bug » venait d'un vide
   muet. Un refus sans motif est indistinguable d'une panne, et le natif ne peut
   rien afficher qu'il n'a pas reçu. */
var dire4=console.log; console.log=function(){};
var inconnue=window.flActiviteParGps('IDENTIFIANT-QUI-N-EXISTE-PAS');
console.log=dire4;
v('sortie inconnue : la fiche est vide',   false, !!(inconnue&&inconnue.aDesDonnees));
v('sortie inconnue : et la raison est dite', true, !!(inconnue&&inconnue.raison));

console.log('\n'+ok+' vérifications passées, '+ko+' échouées.');
process.exit(ko?1:0);
