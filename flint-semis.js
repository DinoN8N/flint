/* ═══════════════════════════════════════════════════════════════════════════
   LE SEMEUR — sorti d'index.html lors du découpage du moteur web (30 août
   2026). Les semis d'atelier et de démonstration : la garde flRefuseSemis
   (rien ne se sème dans la coquille), simulateData, flSeedDemoDays,
   flPurgeDemoDays, flSeedTest, et le re-gel des scores passés
   (persistRecovFor, qui délègue au juge unique du score). Déménagement pur,
   à l'identique — persistRecov, le gel du JOUR, reste au moteur.
   ═══════════════════════════════════════════════════════════════════════════ */
function flRefuseSemis(nom){
 if(!window.flSemisInterdit||!window.flSemisInterdit())return false;
 try{console.log('[flint] semis "'+nom+'" REFUSE : on est dans l application.');}catch(e){}
 try{if(typeof toast==='function')toast('Demo indisponible dans l app');}catch(e){}
 return true;
}
function simulateData(silent){if(flRefuseSemis('simulateData'))return;const BEH=['cafeine','alcool','ecrans','sportintense','magnesium','meditation','repastard','hydrate'];
 for(let i=0;i<185;i++){const k=tk(-i);const j={};if(i<28)BEH.forEach(b=>{if(Math.random()<0.3)j[b]=true});DB.set('journal_'+k,j);
  let pen=0;if(j.alcool)pen-=9;if(j.cafeine)pen-=4;if(j.ecrans)pen-=3;if(j.repastard)pen-=2;if(j.magnesium)pen+=3;if(j.meditation)pen+=3;if(j.hydrate)pen+=2;
  const sleepMin=Math.round(410+Math.random()*100),deep=Math.round(70+Math.random()*45),rem=Math.round(85+Math.random()*40),awake=Math.round(10+Math.random()*22),light=Math.max(30,sleepMin-deep-rem-awake);
  const rhr=Math.round(46+Math.random()*12-pen*0.3),hrv=Math.round(58+Math.random()*30+pen),resp=+(13+Math.random()*2.4).toFixed(1),skinTemp=+(36.3+Math.random()*0.5).toFixed(1),spo2=Math.round(95+Math.random()*3.4);
  const timeInBed=sleepMin+awake+Math.round(8+Math.random()*18),wakeEvents=Math.round(6+Math.random()*14),lowestHr=rhr-Math.round(2+Math.random()*3),wakeMin=420+Math.round(-25+Math.random()*50),bedMin=((wakeMin-timeInBed)%1440+1440)%1440;
  DB.set('sensor_'+k,{hrv,rhr,resp,skinTemp,spo2,deep,rem,light,awake,sleepMin,timeInBed,wakeEvents,lowestHr,bedMin,wakeMin,source:'sim'});
  if(Math.random()>0.12){const dur=45+Math.round(Math.random()*55),int=1+Math.round(Math.random()*3),nm=['Course','Renfo','Vélo','HIIT','Padel','Marche'][Math.floor(Math.random()*6)];const sh=7+Math.floor(Math.random()*12),sm=Math.floor(Math.random()*60),start=String(sh).padStart(2,'0')+':'+String(sm).padStart(2,'0');DB.set('sessions_'+k,[{name:nm,icon:sportIcon(nm),start:start,dur,int,auto:true}])}else{DB.set('sessions_'+k,[])}}
 for(let i=27;i>=0;i--){persistRecovFor(tk(-i))}DB.set('demo',1);
 if(!silent){seedTodayShowcase();renderProfile();toast('Démo rechargée 🎲');go('today')}}
function flStageSegs(s){var seq=hypnoSeq({deep:s.deep,rem:s.rem,light:s.light,awake:s.awake,sleepMin:s.deep+s.rem+s.light});var nm={0:'deep',1:'light',2:'rem',3:'awake'},out=[],t=0;seq.forEach(function(g){out.push({stage:nm[g[0]],startMin:t,durMin:g[1]});t+=g[1]});return out}
function flHrSamples(rhr,low,inBed){var n=Math.max(60,Math.round(inBed)),a=[],hi=rhr+13;for(var i=0;i<n;i++){var p=i/(n-1),base=hi-(hi-low)*Math.sin(p*Math.PI)*0.9,wave=Math.sin(i*0.12)*3+Math.sin(i*0.37)*2,spike=(Math.sin(i*1.7)>0.84?(8+Math.sin(i*4.3)*8):0),noise=(Math.sin(i*2.3)+Math.sin(i*1.1)*0.7+Math.sin(i*3.7)*0.5)*3.2;a.push(Math.round(base+wave+spike+noise))}return a}
function seedTodayShowcase(){if(flRefuseSemis('seedTodayShowcase'))return;const sleepMin=462,deep=104,rem=118,awake=12,light=sleepMin-deep-rem;
 const timeInBed=474,wakeEvents=9,lowestHr=45,bedMin=1386,wakeMin=420;
 DB.set('sensor_'+tk(),{hrv:96,rhr:47,resp:13.4,skinTemp:36.6,spo2:97,deep,rem,light,awake,sleepMin,timeInBed,wakeEvents,lowestHr,bedMin,wakeMin,stages:flStageSegs({deep,rem,light,awake}),hrSamples:flHrSamples(47,lowestHr,timeInBed),source:'sim'});
 DB.set('sessions_'+tk(),[{name:'Marche',icon:'🚶',start:'09:15',dur:45,int:1,auto:true},{name:'Padel',icon:'🎾',start:'12:30',dur:75,int:2,auto:true},{type:'nap',name:'Sieste',icon:'😴',start:'15:00',dur:25},{name:'Football',icon:'⚽',start:'18:00',dur:75,int:3,auto:true}]);
 DB.set('meals_'+tk(),[{name:'Petit-déj — flocons & œufs',kcal:520,prot:32,carb:60,fat:16,time:'08:05'},{name:'Déjeuner — poulet riz',kcal:760,prot:55,carb:80,fat:18,time:'12:45'},{name:'Collation — skyr & banane',kcal:280,prot:22,carb:38,fat:4,time:'16:10'},{name:'Snack — amandes',kcal:290,prot:10,carb:10,fat:24,time:'18:30'}]);
 persistRecov()}
/* ---- Seed de TEST (demande founder 2026-07-07) : données variées sur 5 semaines pour tester tous les graphiques ---- */
/* ===== v694 — Jeu de démonstration pour la coquille iOS ======================
   Founder : « mets des fausses données sur les 20 jours précédents, et
   diversifie — il y a des jours où la montre n'est pas portée ».
   La coquille purge normalement toute donnée de démo (flShellPurged) pour ne
   jamais présenter de l'inventé comme du mesuré. Ce semeur-ci est donc explicite
   et réversible : il ne s'active qu'avec le drapeau `flintDemoData`, et marque
   chaque journée d'un `demo:true` pour qu'on puisse la distinguer plus tard.
   Déterministe : la même journée donne toujours les mêmes valeurs, sinon les
   graphiques changeraient à chaque ouverture. */
function flDemoRnd(k,salt){var h=trSeed(salt+'|'+k);return (h%10000)/10000;}
function flSeedDemoDays(n,fut){if(flRefuseSemis('flSeedDemoDays'))return;
 n=n||40;fut=(fut==null)?62:fut;
 var XN=['Course','Natation','Vélo','Padel','Football','Muscu','Yoga','Marche','Rameur','Boxe'];
 /* v727 : carte de repas élargie, pour que chaque journée ait l'air vécue */
 var PD=[['Flocons & œufs',520,32,60,16],['Pain complet & fromage blanc',430,26,55,10],
         ['Pancakes protéinés',480,34,52,14],['Skyr, granola & miel',390,28,50,8],
         ['Porridge banane',445,20,68,9],['Œufs brouillés & avocat',510,26,18,38]];
 var DJ=[['Poulet riz',760,55,80,18],['Saumon patate douce',690,42,58,28],
         ['Pâtes bolognaise',820,38,105,22],['Bowl quinoa thon',640,40,66,20],
         ['Steak haricots verts',580,46,32,26],['Wrap poulet crudités',620,42,58,20]];
 var DN=[['Omelette & salade',450,30,12,30],['Soupe & pain, jambon',520,28,58,16],
         ['Riz sauté crevettes',610,34,72,18],['Poisson blanc purée',540,38,52,16],
         ['Dinde & légumes rôtis',560,44,34,24],['Salade César poulet',495,36,22,28]];
 var SN=[['Amandes',290,10,10,24],['Skyr & banane',280,22,38,4],['Barre céréales',210,6,32,7],
         ['Fruits & chocolat noir',225,3,34,9],['Fromage blanc & miel',195,18,22,3]];

 /* i=0 inclus : sans lui, la journée en cours reste vide (« — » partout) et on
    ne peut pas tester l'écran d'accueil, qui est le plus consulté. */
 /* v735 — on sème le PASSÉ (J-n..J-1) ET le FUTUR (aujourd'hui..J+fut). « i »
    reste la DISTANCE à aujourd'hui (toute la logique de variété en dépend) ;
    « off » est le décalage signé qui sert aux clés de date. C'est une maquette :
    des jours futurs pré-remplis évitent les écrans vides quand on avance. */
 var OFFS=[];for(var _p=n;_p>=1;_p--)OFFS.push(-_p);for(var _f=0;_f<=fut;_f++)OFFS.push(_f);
 for(var _oi=0;_oi<OFFS.length;_oi++){
  var off=OFFS[_oi],i=(off<0?-off:off);
  var k=tk(off),r=function(salt){return flDemoRnd(k,salt);};
  var d=new Date();d.setDate(d.getDate()+off);
  var we=(d.getDay()===0||d.getDay()===6);

  /* --- Montre non portée : ~1 jour sur 7, plus 2 jours consécutifs vers J-12.
     Ces jours-là, AUCUNE donnée capteur : l'app doit afficher « — » partout. */
  /* Les jours récents sont ceux qu'on consulte le plus : on les garde bien
     remplis (la montre vient d'être portée assidûment), et on place les trous
     plus loin — dont deux jours consécutifs, cas typique d'un week-end sans. */
  var noWatch = i>=5 && ((r('watch')<0.15) || (i===12||i===13));
  if(noWatch){
   DB.set('sensor_'+k,null);DB.set('recov_'+k,null);
   /* la vie continue : quelques repas saisis à la main */
   if(r('meal')<0.6){
    var mm=[];
    mm.push({name:PD[Math.floor(r('p')*PD.length)][0],kcal:PD[0][1],prot:PD[0][2],carb:PD[0][3],fat:PD[0][4],time:'08:10',demo:true});
    mm.push({name:DJ[Math.floor(r('j')*DJ.length)][0],kcal:DJ[0][1],prot:DJ[0][2],carb:DJ[0][3],fat:DJ[0][4],time:'12:40',demo:true});
    DB.set('meals_'+k,mm);
   } else DB.set('meals_'+k,[]);
   DB.set('sessions_'+k,[]);
   continue;
  }

  /* --- Nuit : durée, structure et qualité variables --- */
  var bad = r('bad')<0.18;                 /* mauvaise nuit */
  var good = !bad && r('good')<0.30;       /* très bonne nuit */
  var sleepMin = bad ? 300+Math.round(r('s1')*60)
               : good ? 470+Math.round(r('s2')*70)
                      : 390+Math.round(r('s3')*80);
  if(we)sleepMin+=Math.round(r('we')*45);  /* on dort plus le week-end */
  var deep  = Math.round(sleepMin*(0.16+r('d')*0.08));
  var rem   = Math.round(sleepMin*(0.19+r('r')*0.07));
  var awake = Math.round(6+r('a')*(bad?34:16));
  var light = Math.max(30,sleepMin-deep-rem);
  var timeInBed = sleepMin+awake+Math.round(r('b')*18);
  var wakeMin = 6*60+Math.round(r('w')*95)+(we?40:0);
  var bedMin  = ((wakeMin-timeInBed)%1440+1440)%1440;

  /* VFC et FC repos corrélées à la qualité de nuit + une dérive lente */
  var drift = Math.sin(i/9)*5;
  var hrv = Math.round((bad?58:good?92:74)+r('h')*14+drift);
  var rhr = Math.round((bad?56:good?45:49)+r('c')*5-drift/2);
  var resp= Math.round(((bad?15.4:13.1)+r('rs')*1.6)*10)/10;

  DB.set('sensor_'+k,{hrv:hrv,rhr:rhr,resp:resp,skinTemp:Math.round((36.3+r('t')*0.6)*10)/10,
   spo2:95+Math.round(r('o')*3),deep:deep,rem:rem,light:light,awake:awake,sleepMin:sleepMin,
   timeInBed:timeInBed,wakeEvents:4+Math.round(r('e')*12),
   lowestHr:rhr-2-Math.round(r('lo')*4),bedMin:bedMin,wakeMin:wakeMin,
   stages:flStageSegs({deep:deep,rem:rem,light:light,awake:awake,sleepMin:sleepMin}),
   hrSamples:flHrSamples(rhr,rhr-3,timeInBed),source:'demo',demo:true});

  /* --- Séances : jours de repos, jours légers, grosses journées --- */
  var ss=[],nb;
  var rest = i>0 && r('rest')<0.22;        /* jour de repos (jamais aujourd'hui) */
  if(rest)nb=0; else nb = r('nb')<0.25?2:1;
  for(var q=0;q<nb;q++){
   var nm=XN[Math.floor(r('n'+q)*XN.length)];
   var hard = r('hard'+q)<0.3;
   ss.push({name:nm,icon:sportIcon(nm),
    /* v722 : créneaux disjoints (matin / fin d'après-midi) et minutes variées,
       pour que deux séances du même jour ne commencent jamais à la même heure. */
    start:(q?16:8)+Math.floor(r('st'+q)*4)+':'+String(Math.floor(r('mn'+q)*4)*15).padStart(2,'0'),
    dur:(hard?55:30)+Math.round(r('du'+q)*45),
    /* v714 : répartition réaliste — 60 % léger, 25 % modéré, 12 % soutenu,
       3 % maximal. La formule d'effort de la coquille est très raide : sans cette
       pondération, la moitié des journées saturait à 20. */
    int:(function(){var p=r('int'+q);return p<0.60?1:p<0.85?2:p<0.97?3:4;})(),
    auto:true,demo:true});
  }
  if(!rest&&r('nap')<0.15)ss.push({type:'nap',name:'Sieste',icon:'😴',start:'15:00',dur:20+Math.round(r('nd')*25),demo:true});
  DB.set('sessions_'+k,ss);

  /* En COQUILLE, sensorOf/loadStrain/caloriesBurned sont remplacés pour ne lire
     QUE la montre (couche d'honnêteté). On sème donc le magasin `watch_`, et la
     donnée de démo traverse exactement le même pipeline qu'un vrai bracelet.
     La courbe de FC doit couvrir la JOURNÉE, avec des pics pendant les séances :
     l'effort s'y calcule, et une série plate donnait toujours 0. */
  var rr=[],hrDay=[];
  /* RR : dispersion x2.45 car rmssd() renvoie ~0,65 x la dispersion */
  for(var g=0;g<40;g++)rr.push(Math.round(60000/(rhr+2)+(r('rr'+g)-0.5)*hrv*2.45));
  var win=[];
  ss.forEach(function(x){if(x.type==='nap')return;
   var sp=(x.start||'08:00').split(':'),a0=(+sp[0])*60+(+sp[1]);
   /* v714 : élévations calées sur les VRAIS seuils de zones (Z1 107, Z2 135,
      Z3 149, Z4 163, Z5 176 bpm). Avant, une séance « intense » culminait à
      96 bpm : les zones 4-5 n'étaient jamais touchées alors que la séance était
      étiquetée intensité 4 — données incohérentes, et le grisage des zones
      paraissait cassé alors qu'il faisait son travail. */
   win.push([a0,a0+(x.dur||30),[0,44,72,100,122][Math.min(4,x.int||2)]]);});
  for(var t=0;t<1440;t+=5){
   var up=0;win.forEach(function(w2){if(t>=w2[0]&&t<w2[1])up=Math.max(up,w2[2]);});
   var night=(t<wakeMin||t>wakeMin+16*60);
   var bpm=rhr+(night?-2:8)+Math.round(r('hd'+t)*7)+up+(up?Math.round(r('hp'+t)*7):0);
   hrDay.push([t,Math.max(38,Math.min(190,bpm))]);}
  /* 14 sept. 2026 — LA VARIABILITÉ DE LA MONTRE, SINON LA NUIT N'A PAS DE
     SCORE. Mesuré sur le simulateur, build Release, session de démo ouverte :
     « 0/4 nuits », récupération « — » sur 40 jours semés. En coquille,
     `sensorOf` ne lit plus `sensor_` : il lit `watch_`, et sa variabilité
     vient de `hrvMontre` (mesures de la puce, [minute, ms]) ou de `rrH`.
     Cette maquette ne semait ni l'un ni l'autre : `rr` ci-dessus est un
     format d'avant la v1358, que plus personne ne lit. Six mesures dans la
     fenêtre de la nuit, autour de la valeur semée : la médiane la rend. */
  var hrvMontre=[];
  for(var _m=0;_m<6;_m++){
   var _mn=(bedMin+30+_m*Math.max(20,Math.floor(Math.max(60,sleepMin-60)/6)))%1440;
   hrvMontre.push([_mn,Math.max(5,hrv+Math.round((r('hm'+_m)-0.5)*6))]);}
  var _wr={hr:hrDay,rr:rr,hrvMontre:hrvMontre,
   steps:2500+Math.round(r('sp')*11000)+(rest?0:1500),
   kcal:180+Math.round(r('kc')*520)+(rest?0:260),
   night:{sleepMin:sleepMin,deep:deep,rem:rem,light:light,awake:awake,
    bedMin:bedMin,wakeMin:wakeMin,timeInBed:timeInBed,lowestHr:rhr-3,
    stages:flStageSegs({deep:deep,rem:rem,light:light,awake:awake,sleepMin:sleepMin}),
    /* 14 sept. 2026 — la courbe de la nuit lit `night.hrSamples` (une valeur
       par minute) ; sans elle, l'écran Sommeil de la démo montrait un cadre
       vide : `hrDay` n'a qu'un point toutes les cinq minutes, trop clairsemé
       pour la reconstruction qui exige la moitié de la nuit couverte. */
    hrSamples:flHrSamples(rhr,rhr-3,timeInBed)},
   demo:true};
  DB.set('watch_'+k,_wr);
  /* 14 sept. 2026 — ON ÉCRIT AUSSI DANS LA COPIE VIVANTE, sinon elle gagne.
     Le moteur garde chaque journée du bracelet en mémoire (`wGet`) et rend le
     MÊME objet à tous ses écrivains ; `wSaveK` réécrit le disque depuis cette
     copie. Mesuré : la journée d'aujourd'hui était déjà en mémoire quand la
     démo s'est ouverte (vide, créée au montage), le semis a écrit le disque,
     puis la passe du matin a resservi la copie vide, y a DÉDUIT une nuit de
     18 h (13:25 → 07:25) depuis rien, et l'a réécrite par-dessus le semis.
     C'est le défaut v1329/v1824, dans son troisième costume. La règle de la
     maison : on MUTE l'objet, on ne le jette pas. */
  try{
   var _live=(typeof window.flJourMontre==='function')?window.flJourMontre(k):null;
   if(_live&&_live!==_wr&&typeof _live==='object'){
    Object.keys(_live).forEach(function(f){delete _live[f];});
    Object.keys(_wr).forEach(function(f){_live[f]=_wr[f];});
   }
  }catch(e){}

  /* --- Repas : journées complètes, partielles, ou rien --- */
  /* v728 : aujourd'hui a TOUJOURS une journée alimentaire complète — c'est
    l'écran le plus consulté, le laisser vide donnait une page morte. */
 var meals=[],mr=(i===0?0.95:r('mcount'));
  function push(tab,salt,time){var x=tab[Math.floor(r(salt)*tab.length)];
   meals.push({name:x[0],kcal:x[1],prot:x[2],carb:x[3],fat:x[4],time:time,demo:true});}
  if(mr>0.12){
   push(PD,'m1','08:'+(5+Math.floor(r('t1')*40)));
   push(DJ,'m2','12:'+(20+Math.floor(r('t2')*35)));
   if(mr>0.35)push(SN,'m3','16:'+(5+Math.floor(r('t3')*45)));
   /* le dîner est le repas le plus régulier : presque tous les soirs */
   if(mr>0.16)push(DN,'m4','19:'+(30+Math.floor(r('t4')*25)));
   if(mr>0.72)push(SN,'m5','21:'+(0+Math.floor(r('t5')*30)));
  }
  DB.set('meals_'+k,meals);

  /* --- Journal du soir : rempli 3 jours sur 5 --- */
  if(r('jr')<0.6){
   DB.set('fljrnl_'+k,{avion:r('av')<0.06?1:0,alcool:r('al')<0.25?1:0,
    cafeine:r('cf')<0.35?1:0,diner:r('dn')<0.3?1:0,_saved:true,demo:true});
  }
 }
 try{for(var _z=0;_z<OFFS.length;_z++){if(OFFS[_z]!==0)persistRecovFor(tk(OFFS[_z]));}}catch(e){}
 try{persistRecov();}catch(e){}
}
/* v1348 — LA CADENCE QUI TRAHIT UNE COURBE FABRIQUÉE, EN UN SEUL ENDROIT.
   Trois passages faisaient la même mesure, chacun réécrit à la main : la purge
   par marque, le ménage des compteurs semés, et le nouveau garde-fou du
   démarrage. Un seul les sert désormais — et surtout, un seul porte LE
   PLANCHER, qui manquait aux deux premiers.

   LE PLANCHER, ET POURQUOI IL EST VITAL. « Plus de 90 % d'intervalles
   identiques » ne suffit pas à conclure : la vraie courbe est stockée à la
   MINUTE (médiane par minute, cf. `fcContinue` et `rrH`), donc une nuit
   réellement couverte de bout en bout affiche elle aussi 90 % d'écarts égaux —
   de 1 minute. Sans plancher, ces deux ménages effaçaient les MEILLEURES
   nuits mesurées, celles qui n'ont aucun trou. Le semeur, lui, écrit un point
   toutes les 5 minutes : on n'accuse donc qu'à partir de 3.

   Rend 0 quand la série est plausible, sinon le pas régulier qui la trahit. */
window.flHrPasFabrique=function(serie){
 try{
  if(!serie||serie.length<=24)return 0;
  var ec={},tot=0;
  for(var i=1;i<serie.length;i++){
   var e=serie[i][0]-serie[i-1][0];
   if(e>0){ec[e]=(ec[e]||0)+1;tot++;}
  }
  for(var e2 in ec)if(ec[e2]/tot>0.9&&(+e2)>=3)return +e2;
  return 0;
 }catch(e){return 0;}
};

/* ═══════════════════════════════════════════════════════════════════════════
   v1355 — TOUT LE FAUX DEHORS. « Il doit rester que ce qui vient du backend. »
   ═══════════════════════════════════════════════════════════════════════════

   Trois semeurs ont écrit dans cette base, et deux d'entre eux ne marquent
   RIEN : `simulateData` (185 jours de journaux, capteurs `source:'sim'`,
   séances `auto`, repas), `flSeedTest` (séances, repas, bodylog) et
   `flSeedDemoDays` (40 jours de passé, 62 de futur, avec la marque `demo`).
   Une purge qui ne juge que sur la marque en laisse donc les deux tiers —
   c'est ce qui s'est passé jusqu'ici.

   CE QUI EST RETIRÉ, ET SUR QUELLE PREUVE :

   1. TOUT LE FUTUR, sans discuter. Aucune mesure ne peut exister pour demain.
      C'est la preuve la plus solide de toutes, et elle ne demande aucune
      heuristique.
   2. LE CAPTEUR SEMÉ se dénonce : `source: 'sim'` ou `'demo'`. La saisie à la
      main (`saveSensorManual`) et Health Connect n'en portent pas — elles
      survivent.
   3. LA COURBE FABRIQUÉE et les compteurs posés avec elle (voir
      `flHrPasFabrique`), plus le lot de RR semé (quarante valeurs, là où une
      vraie journée en compte des milliers).
   4. LE RESTE DE LA JOURNÉE SEMÉE. Un jour dont le capteur est marqué, ou
      dont la courbe est fabriquée, a été écrit d'un bloc par un semeur : ses
      séances automatiques, ses journaux et ses repas viennent du même geste.

   CE QUI N'EST JAMAIS TOUCHÉ :
   · une nuit MESURÉE (`stageSrc` ou `stages`) — même dans un conteneur semé,
     c'est le piège déjà payé en v1288 ;
   · une séance SAISIE À LA MAIN (pas de `auto`, pas de marque) ;
   · les repas d'aujourd'hui et d'hier, qu'on peut avoir tapés soi-même.

   ET LES REPAS PLUS ANCIENS SONT SAUVEGARDÉS AVANT D'ÊTRE RETIRÉS. C'est la
   seule catégorie où la preuve est indirecte : un repas semé et un repas tapé
   ont exactement la même forme (`addMeal` ne marque rien). On les range donc
   dans `purge.total.repas` avant de vider — rien de ce qui a été tapé n'est
   perdu, même si l'on s'est trompé.

   Relançable à la main : `flPurgeToutLeFaux()` dans la console. */
window.flPurgeToutLeFaux=function(){
 var B={futur:0,capteurs:0,courbes:0,compteurs:0,rr:0,seances:0,repas:0,
        journaux:0,recup:0,conteneurs:0,nuitsGardees:0};
 var STORES=['watch_','sensor_','recov_','sessions_','meals_','journal_',
             'fljrnl_','sante_','gpsjour_','besoinNuit_'];
 var sauve={};
 try{
  /* 1 — LE FUTUR. */
  for(var f=1;f<=400;f++){
   var kf=tk(f);
   STORES.forEach(function(p){
    try{if(DB.get(p+kf,null)!=null){DB.set(p+kf,null);B.futur++;}}catch(e){}
   });
  }
  /* 2 — LE PASSÉ, jour par jour, sur preuve. */
  for(var d=0;d<=400;d++){
   var K=tk(-d),seme=false,mesuree=false,courbeReelle=false;
   /* a. le capteur */
   try{
    var sn=DB.get('sensor_'+K,null);
    if(sn&&(sn.demo||sn.source==='sim'||sn.source==='demo')){
     DB.set('sensor_'+K,null);B.capteurs++;seme=true;
    }
   }catch(e){}
   /* b. le conteneur de la montre : on garde le mesuré, on retire le reste */
   try{
    var w=DB.get('watch_'+K,null);
    if(w&&typeof w==='object'){
     mesuree=!!(w.night&&(w.night.stageSrc||(w.night.stages&&w.night.stages.length)));
     if(window.flHrPasFabrique(w.hr)||w.demo){
      seme=true;
      if(w.hr&&w.hr.length){w.hr=[];B.courbes++;}
      if(w.steps!=null||w.kcal!=null||w.dist!=null){
       delete w.steps;delete w.kcal;delete w.dist;B.compteurs++;
      }
      /* Une nuit DÉDUITE d'une courbe fabriquée est fabriquée elle aussi.
         Une nuit mesurée, non : elle a sa provenance, on n'y touche pas. */
      if(!mesuree&&w.night){delete w.night;}
      delete w.demo;
     }
     if(w.rr&&w.rr.length&&w.rr.length<=60){w.rr=[];B.rr++;seme=true;}
     if(!mesuree&&!(w.hr&&w.hr.length)&&!(w.rr&&w.rr.length)
        &&w.steps==null&&w.kcal==null){
      DB.set('watch_'+K,null);B.conteneurs++;      /* plus rien de mesuré dedans */
     }else{
      DB.set('watch_'+K,w);
      courbeReelle=!!(w.hr&&w.hr.length);
      if(mesuree)B.nuitsGardees++;
     }
    }
   }catch(e){}
   /* c. LES SÉANCES — ET CELLE-CI SE JUGE SUR TOUS LES JOURS, pas seulement
         sur ceux qu'on a reconnus semés. Dino : « l'activité aussi, j'ai
         l'impression qu'il y a de fausses activités. »
         La détection automatique LIT LA COURBE CARDIAQUE du jour. Un jour sans
         courbe réelle ne peut donc pas avoir produit une séance détectée : si
         elle porte `auto`, elle a été écrite par un semeur, ou détectée sur une
         courbe fabriquée qu'on vient justement de retirer. Dans les deux cas
         elle ne mesure rien — leurs fréquences moyennes (105, 137, 111 bpm)
         non plus.
         Une séance SAISIE À LA MAIN n'a pas `auto` : elle vient de
         l'utilisateur, elle reste, y compris sur un jour semé. */
   try{
    var ss=DB.get('sessions_'+K,null);
    if(ss&&ss.length){
     var garde=ss.filter(function(x){
      if(!x)return false;
      if(x.demo||x.source==='demo'||x.source==='sim')return false;
      /* v1356 — CE QUE LA MONTRE A RECONNU ELLE-MEME NE SE JUGE PAS.
         `src:'montre'` vient du canal `seance` : la montre livre le mode
         sportif, les minutes actives, les pas, les calories et les METS. C'est
         une MESURE, au meme titre qu'une nuit avec son hypnogramme, et elle ne
         depend pas de la courbe cardiaque du jour. La regle du dessous
         l'emportait pourtant sur elle : sur un jour dont le semeur avait
         ecrase la courbe, une vraie marche livree par le bracelet se faisait
         retirer comme une deduction. Au-dela de sept jours — ce que la montre
         garde — elle ne serait jamais revenue. */
      if(x.src==='montre')return true;
      if(x.auto&&!courbeReelle)return false;
      return true;
     });
     if(garde.length!==ss.length){
      DB.set('sessions_'+K,garde);B.seances+=ss.length-garde.length;
     }
    }
   }catch(e){}
   /* c bis — LES REPAS MARQUÉS, SUR TOUS LES JOURS ET SANS ATTENDRE.
      v1356 — Dino, en regardant « Ma journée » : « œuf brouillé, avocat, bol
      de quinoa… tout le reste c'est complètement faux ». Ce sont les entrées
      LITTÉRALES des tables de `flSeedDemoDays` (`Œufs brouillés & avocat`,
      `Bowl quinoa thon`), et le semeur les écrit avec `demo:true` — la preuve
      est donc dans l'objet lui-même. Elles étaient pourtant derrière la garde
      `seme` d'en dessous, qui ne s'ouvre que si le capteur ou la courbe du jour
      trahissent le semeur : un jour dont il n'aurait semé QUE les repas
      passait entre les mailles. Un repas marqué est faux, point, quel que
      soit le jour. */
   try{
    var mm=DB.get('meals_'+K,null);
    if(mm&&mm.length){
     var mk=mm.filter(function(x){return !(x&&(x.demo||x.source==='demo'||x.source==='sim'));});
     if(mk.length!==mm.length){DB.set('meals_'+K,mk);B.repas+=mm.length-mk.length;}
    }
   }catch(e){}
   if(!seme)continue;
   /* d. les journaux du jour semé */
   ['journal_','fljrnl_'].forEach(function(p){
    try{if(DB.get(p+K,null)!=null){DB.set(p+K,null);B.journaux++;}}catch(e){}
   });
   /* e. la récupération d'un jour sans nuit mesurée : elle ne repose sur rien.
         Le moteur recalcule les vraies à la demande. */
   try{
    if(!mesuree&&DB.get('recov_'+K,null)!=null){DB.set('recov_'+K,null);B.recup++;}
   }catch(e){}
   /* f. les repas — sauvegardés d'abord, et jamais ceux des deux derniers
         jours, qu'on a pu taper soi-même ce matin. */
   try{
    var ms=DB.get('meals_'+K,null);
    if(ms&&ms.length&&d>=2){
     sauve[K]=ms;DB.set('meals_'+K,[]);B.repas+=ms.length;
    }else if(ms&&ms.length){
     var mg=ms.filter(function(x){return !(x&&(x.demo||x.source==='demo'
       ||(x.name==='Journée'&&x.time==null&&x.items==null)));});
     if(mg.length!==ms.length){DB.set('meals_'+K,mg);B.repas+=ms.length-mg.length;}
    }
   }catch(e){}
  }
  /* 3 — ON COUPE LE ROBINET, sinon tout revient au prochain semis. */
  try{localStorage.setItem('flintDemoData','0');}catch(e){}
  /* v2131 — et la session de démo avec : Réinitialiser ferme TOUT, la porte
     du semis comprise. Sans cette ligne, un « Réinitialiser » pendant une
     démo purgeait les jours et laissait la porte ouverte. */
  try{DB.set('flDemoSession',0);}catch(e){}
  /* ON NE RETIRE PAS `flseedtest` — LE RETIRER REARME LE SEMEUR.
     C'est le geste qui a fait apparaitre 83 jours factices dans la base de
     Felix le 10 aout a 09h23 (voir v1351) : une fois le garde efface, il ne
     restait que la presence du pont natif pour retenir le semeur, et ce pont
     n'est pas garanti present a la milliseconde ou la ligne s'execute. On le
     POSE donc a sa valeur de blocage, ce qui est le contraire exact. */
  ['demo','seeded'].forEach(function(k){try{localStorage.removeItem(k);}catch(e){}});
  try{DB.set('flseedtest',494);}catch(e){}
  try{DB.set('flDemoSeed',0);}catch(e){}
  /* 4 — LE BILAN, gardé en base : une purge muette ne se vérifie pas. */
  try{DB.set('purge.total.bilan',B);}catch(e){}
  try{if(Object.keys(sauve).length)DB.set('purge.total.repas',sauve);}catch(e){}
  console.log('[flint] purge totale — futur:'+B.futur+' capteurs:'+B.capteurs
   +' courbes:'+B.courbes+' compteurs:'+B.compteurs+' rr:'+B.rr
   +' seances:'+B.seances+' repas:'+B.repas+' journaux:'+B.journaux
   +' recup:'+B.recup+' conteneurs:'+B.conteneurs
   +' | nuits MESUREES conservees : '+B.nuitsGardees);
 }catch(e){try{console.log('[flint] purge totale : '+e.message);}catch(e2){}}
 return B;
};

/* Efface tout ce que le semeur a écrit (retour à l'état réel). */
function flPurgeDemoDays(n,fut){
 n=n||60;fut=(fut==null)?70:fut;
 /* PURGE CHIRURGICALE. Cette fonction effacait 130 jours EN BLOC, sans regarder
    d ou venaient les donnees : elle emportait les vraies mesures avec les
    fausses. Le semeur marque pourtant chaque journee (source 'demo' ou
    drapeau demo) : on ne retire QUE ce qui porte cette marque. Une mesure du
    bracelet n est jamais touchee. */
 var ote=0,garde=0;
 /* v1288 — LE REPAS SEMÉ NE PORTAIT AUCUNE MARQUE, ET IL PASSAIT ENTRE LES
    MAILLES. Dino : « retire toutes les fausses données, notamment dans la
    nutrition, les jours précédents. »
    `ensureDemo` écrivait treize jours de `meals_` sous la forme
    `{name:'Journée', kcal: 1950+random*650, prot/carb/fat aléatoires}` — sans
    `demo`, sans `source`. Cette purge, qui juge sur la marque, les gardait
    tous. C'est exactement ce qu'il voit encore.
    On reconnaît donc la SIGNATURE : un repas nommé « Journée », sans heure,
    sans aliments. Aucune saisie humaine ne produit ça — l'app horodate tout
    ce qu'on ajoute à la main. */
 function repasSeme(x){
  return !!(x&&x.name==='Journée'&&x.time==null&&x.items==null&&x.kcal!=null);
 }
 function estDemo(v){return !!(v&&(v.demo||v.source==='demo'||v.source==='sim'||repasSeme(v)));}
 function clr(k){
  ['sensor_','recov_','sessions_','meals_','fljrnl_','watch_'].forEach(function(p){
   try{
    var v=DB.get(p+k,null);
    if(v==null)return;
    if(Array.isArray(v)){                       /* seances, repas */
     var reste=v.filter(function(x){return !estDemo(x);});
     if(reste.length!==v.length){DB.set(p+k,reste);ote++;}
     return;
    }
    if(p==='recov_'){                           /* score nu : lie au sensor du jour */
     var sn=DB.get('sensor_'+k,null);
     if(estDemo(sn)){DB.set(p+k,null);ote++;}
     return;
    }
    /* LE PIEGE : le semeur a cree le conteneur watch_ AVANT que le bracelet n y
       ecrive. Le conteneur porte donc la marque de la demo alors que la nuit a
       l interieur est bien MESUREE (elle a sa provenance et son hypnogramme).
       Se fier a la marque du conteneur reviendrait a detruire une vraie nuit.
       On regarde donc le CONTENU : une nuit mesuree est intouchable, on se
       contente de retirer la marque trompeuse. */
    if(p==='watch_'){
     var nm=v.night,mesuree=!!(nm&&(nm.stageSrc||(nm.stages&&nm.stages.length)));
     if(mesuree){
      /* La nuit est mesuree, on la garde. Mais le conteneur porte AUSSI les
         compteurs semes par la demo, et rien ne les distingue de vraies mesures
         a la lecture : releve du 3 aout, 12 967 pas affiches contre 3 512
         reellement comptes par la montre, et une courbe cardiaque a un point
         toutes les 5 minutes tres exactement sur 24 h, ce qu aucun coeur ne
         produit. On retire donc ces champs : le bracelet les reecrira a la
         prochaine synchronisation, avec ses vraies valeurs. Mieux vaut un ecran
         vide qu un chiffre invente. */
      /* On juge sur PREUVE, pas sur le drapeau `demo` : une passe anterieure l a
         deja retire de ces conteneurs, si bien qu un nettoyage conditionne a sa
         presence ne s executerait jamais. La preuve, c est la cadence : une
         courbe cardiaque semee a un point toutes les cinq minutes tres
         exactement, un vrai capteur non. Quand la courbe est fabriquee, les
         compteurs poses en meme temps le sont aussi. Idempotent : une fois la
         courbe videe, il n y a plus de cadence, donc plus rien a retirer. */
      /* v1348 — un seul détecteur, avec son plancher : voir flHrPasFabrique.
         Sans lui, ce test emportait aussi les nuits réelles SANS TROU, dont
         les écarts valent 1 minute d'un bout à l'autre. */
      var reg=!!window.flHrPasFabrique(v.hr);
      if(reg||v.demo){
       delete v.demo;
       if(reg){v.hr=[];delete v.steps;delete v.kcal;delete v.dist;}
       DB.set(p+k,v);ote++;
      }
      garde++;return;
     }
     if(estDemo(v)){DB.set(p+k,null);ote++;}else garde++;
     return;
    }
    if(estDemo(v)){DB.set(p+k,null);ote++;}else garde++;
   }catch(e){}});
 }
 for(var i=1;i<=n;i++)clr(tk(-i));
 for(var j=0;j<=fut;j++)clr(tk(j));   /* le futur pre-rempli doit aussi disparaitre */
 try{console.log('[FLINT] purge demo : '+ote+' entree(s) retiree(s), '+garde+' reelle(s) conservee(s)');}catch(e){}
}
function flSeedTest(){try{if(flRefuseSemis('flSeedTest'))return;
 simulateData(true);          /* capteur + séances + journal variés (185 j) + recov 28 j */
 seedTodayShowcase();         /* aujourd'hui = vitrine stable (PRÊT, padel/foot, 4 repas) */
 /* séance supplémentaire certains jours (variété Ma journée / zones FC) */
 var XN=['Natation','Boxe','Yoga','Vélo','Escalade','Rameur'];
 for(var i=1;i<=34;i++){var k=tk(-i);
  if((i*7)%10<3){var a=DB.get('sessions_'+k,[])||[];a.push({name:XN[i%XN.length],icon:sportIcon(XN[i%XN.length]),start:(17+(i%3))+':'+(i%2?'00':'30'),dur:35+((i*13)%50),int:1+((i*5)%4),auto:true});DB.set('sessions_'+k,a);}}
 /* repas multi-plats variés 34 jours (aujourd'hui = vitrine) */
 var PD=[['Flocons, œufs & fruits',520,32,60,16],['Pain complet & fromage blanc',430,26,55,10],['Pancakes protéinés',480,34,52,14],['Skyr, granola & miel',390,28,50,8]];
 var DJ=[['Poulet riz légumes',760,55,80,18],['Saumon patate douce',690,42,58,28],['Pâtes bolognaise',820,38,105,22],['Bowl quinoa thon',640,40,66,20],['Steak haricots verts',580,46,32,26]];
 var DN=[['Omelette & salade',450,30,12,30],['Soupe & pain, jambon',520,28,58,16],['Riz sauté crevettes',610,34,72,18],['Poisson blanc purée',540,38,52,16]];
 var SN=[['Amandes',290,10,10,24],['Skyr & banane',280,22,38,4],['Barre céréales',210,6,32,7],['Fruit & carré chocolat',190,2,34,6]];
 function jit(m,p){return Math.max(1,Math.round(m*(0.86+((p*37)%29)/100)));}
 for(var i2=1;i2<=34;i2++){var k2=tk(-i2),ms=[];
  function pick(P,sh){var r=P[(i2*3+sh)%P.length];return {name:r[0],kcal:jit(r[1],i2+sh),prot:jit(r[2],i2+sh+1),carb:jit(r[3],i2+sh+2),fat:jit(r[4],i2+sh+3)};}
  var b1=pick(PD,0);b1.time='0'+(7+i2%2)+':'+(i2%2?'40':'15');ms.push(b1);
  if((i2*11)%10!==4){var d1=pick(DJ,1);d1.time='12:'+((i2*7)%50<10?'0':'')+((i2*7)%50);ms.push(d1);}   /* certains jours sans déjeuner scanné */
  var n1=pick(DN,2);n1.time=(19+i2%2)+':'+((i2*3)%50<10?'0':'')+((i2*3)%50);ms.push(n1);
  if((i2*13)%10<6){var s1=pick(SN,3);s1.time='16:'+((i2*11)%50<10?'0':'')+((i2*11)%50);ms.push(s1);}
  DB.set('meals_'+k2,ms);}
 /* poids / masse maigre : une mesure tous les 2-3 jours (série à trous = test lignes) */
 var bl=DB.get('bodylog',{})||{};
 for(var i3=0;i3<=34;i3++){if((i3*2)%5===3)continue;if(i3%2===1&&(i3*7)%3===0)continue;
  var w=+(74.2+Math.sin(i3/6.5)*1.1+(((i3*17)%13)-6)*0.06).toFixed(1);
  var bf=+(15+Math.sin(i3/9)*0.9+(((i3*23)%7)-3)*0.08).toFixed(1);
  bl[tk(-i3)]={weight:w,bf:bf,lean:+(w*(1-bf/100)).toFixed(1)};}
 DB.set('bodylog',bl);
 /* jours SANS bracelet (test des trous partout) */
 [4,9,16,23,30].forEach(function(o){var kk=tk(-o);DB.set('sensor_'+kk,null);DB.set('recov_'+kk,null);DB.set('sessions_'+kk,[]);});
 /* récup recalculée sur 35 j */
 for(var i4=34;i4>=1;i4--){DB.set('recov_'+tk(-i4),null);persistRecovFor(tk(-i4));}
 [4,9,16,23,30].forEach(function(o){DB.set('recov_'+tk(-o),null);});
 persistRecov();DB.set('demo',1);
}catch(e){}}
/* ═══ v1288 — ON NE SÈME PLUS RIEN. ══════════════════════════════════════════

   Dino, ce soir : « retire toutes les fausses données. Tout ce qui est faux ou
   sans backing, tu le retires, notamment dans la nutrition, les jours
   précédents. Je veux que de la vraie donnée. »

   CE QUE CETTE FONCTION FAISAIT, et il avait raison de le voir en nutrition :

     for(let i=1;i<=13;i++) DB.set('meals_'+tk(-i), [{name:'Journée',
        kcal: 1950+Math.random()*650, prot: …, carb: …, fat: … }])

   Treize jours de repas TIRÉS AU HASARD, écrits dans sa base. Plus
   `simulateData(true)` juste avant : 185 jours de nuits, de journal et de
   séances, tous inventés — et `seedTodayShowcase()`, qui écrasait la journée
   en cours avec quatre repas et quatre séances fictifs.

   POURQUOI ÇA NE PEUT PAS RESTER. La règle du projet est écrite partout
   ailleurs : jamais de valeur inventée, un manque annoncé vaut mieux qu'un
   faux chiffre. Ces données-là ne se contentaient pas de remplir un écran :
   elles entraient dans les MOYENNES. La récupération se calcule sur les
   VFC des vingt-et-un jours précédents ; le besoin de sommeil sur les nuits
   libres ; la « plage habituelle » d'une séance sur quarante-cinq jours de
   même sport. Un fond de base fabriqué ne fait pas joli, il déplace tous les
   verdicts — et personne ne peut plus dire lesquels.

   La fonction reste, vide, plutôt que d'être supprimée : son appel vit dans le
   démarrage web et c'est le territoire du moteur. Elle ne fabrique plus rien.
   Le mode démo assumé, lui, existe déjà ailleurs et il DIT son nom — c'est la
   vitrine de la visite guidée, en mémoire seulement, jamais écrite en base. */
function ensureDemo(){ /* v1288 — volontairement vide. Le menage des jours deja semes est fait par flPurgeDemoDays, etendue plus bas. */ }

/* persistRecovFor portait une SECONDE formule du score — fenetre de 21 jours,
   trois termes, ni ecretage v1768 ni plancher v1774 ni journal de bord. Une
   regle ecrite deux fois est une regle qu'on ne corrige qu'une fois sur deux
   (v1449) : celle-ci a ete corrigee zero fois sur deux, et servait au demo et
   au semis des scores qu'aucune formule vivante ne sait reproduire. Il ne
   reste qu'UN juge : la fonction du score elle-meme, a l'offset du jour. */
function flOffsetDe(k){try{
 var a=new Date(k.replace(/-/g,'/'));a.setHours(12,0,0,0);
 var b=new Date(tk(0).replace(/-/g,'/'));b.setHours(12,0,0,0);
 return Math.round((a-b)/86400000);}catch(e){return null;}}
function persistRecovFor(k){
 var off=flOffsetDe(k);if(off==null||off>=0)return;
 var v=null;try{v=recovery(off);}catch(e){v=null;}
 if(!v||v.s==null)return;
 DB.set('recov_'+k,Math.round(v.s));
 try{if(v.journalAjust&&v.journalAjust.total)DB.set('recovAj_'+k,v.journalAjust.total);}catch(e){}}

/* ═══ DEBUT SESSION DEMO — v2131 ═══════════════════════════════════════════
   LA SESSION DE DÉMONSTRATION : la seule porte par laquelle un semis entre
   dans l'application.

   POURQUOI ELLE EXISTE. Deux personnes ouvrent FLINT sans bracelet : le
   testeur d'Apple, qui n'en aura jamais et refuse une app qu'il ne peut pas
   voir fonctionner (règle 2.1), et le client qui a commandé le sien et
   l'attend. Aujourd'hui, tous deux arrivent sur un écran vide.

   CE QUI EXISTAIT, ET POURQUOI ON NE LE RÉVEILLE PAS TEL QUEL. L'interrupteur
   `flintDemoData` (v694) était le maître-interrupteur du semeur. La coquille
   l'a armé par erreur pendant des semaines (v1362 : « il était armé sur le
   téléphone du founder »), et depuis la v1356 les semeurs refusent d'écrire
   dans l'app quoi qu'il dise : `flSemisInterdit` juge sur trois preuves que
   rien ne peut poser par accident. Et CoquilleWeb.swift injecte encore
   `flintDemoData='0'` à chaque chargement. Bâtir la démo sur ce drapeau, c'est
   la voir purgée au relancement suivant.

   LA SESSION EST DONC UNE QUATRIÈME CHOSE, et rien ne l'écrit sauf
   `flDemoOuvrir` : pas un bouton du web, pas un semeur, pas un chargement de
   page. Le natif l'appelle depuis un geste explicite de l'utilisateur, et
   c'est la seule exception que `flSemisInterdit` reconnaît. `flintDemoData`
   la suit, pour que le bloc de chargement et la purge de coquille la
   respectent, mais il ne la commande plus.

   LE CONTRAT, tel que le natif l'appelle (modèle : PontMoteurWeb.swift) :
     evaluateJavaScript("try{flDemoOuvrir()}catch(e){}")
     evaluateJavaScript("try{flDemoFermer()}catch(e){}")
     flDemoActive() dit si une session est ouverte.

   CE QUE L'OUVERTURE REFUSE. Une base qui porte une nuit MESURÉE dans les
   quarante derniers jours : un vrai utilisateur ne doit jamais voir de
   l'inventé à côté de ses propres mesures. La preuve est celle de la purge
   (une nuit avec provenance ou hypnogramme), pas un drapeau.

   CE QU'ELLE SÈME : quarante jours de passé et aujourd'hui. PAS DE FUTUR,
   contrairement au semis de chargement (40, 62) : un testeur qui avance au
   lendemain doit y trouver le vide, pas une journée déjà vécue.

   L'ORDRE DE LA FERMETURE, ET IL COMPTE. La porte se referme D'ABORD, la
   purge vient ensuite : quoi qu'il arrive pendant la purge, plus rien ne
   sème. Et une ouverture qui échoue referme derrière elle.

   CE QUI NE BOUGE PAS. Les trois preuves de `flSemisInterdit`, la garde
   DANS les semeurs, et la purge chirurgicale, qui ne retire que ce qui porte
   la marque et ne touche jamais une mesure du bracelet.
   Le banc : tests/test-demo-session.js. */
window.flDemoActive=function(){try{return DB.get('flDemoSession',0)===1;}catch(e){return false;}};

/* La première nuit mesurée des n derniers jours, ou null. Même preuve que la
   purge : une nuit qui a une provenance ou un hypnogramme a été MESURÉE. */
function flDemoNuitMesuree(n){
 for(var i=0;i<=n;i++){
  try{var w=DB.get('watch_'+tk(-i),null),nm=w&&w.night;
      if(nm&&(nm.stageSrc||(nm.stages&&nm.stages.length)))return tk(-i);}catch(e){}
 }
 return null;
}

window.flDemoOuvrir=function(){
 try{
  if(flDemoActive())return {ok:true,deja:true};
  var reel=flDemoNuitMesuree(40);
  if(reel)return {ok:false,raison:'une nuit mesurée existe ('+reel+') : pas de démo à côté de vraies données'};
  DB.set('flDemoSession',1);                                  /* la porte s'ouvre : flSemisInterdit la voit */
  try{localStorage.setItem('flintDemoData','1');}catch(e){}   /* l'interrupteur v694 suit la session */
  flSeedDemoDays(40,0);                                       /* le passé et aujourd'hui, jamais demain */
  DB.set('flDemoSeed',736);                                   /* le bloc de chargement ne ressème pas (40,62) par-dessus */
  DB.set('demo',1);                                           /* la marque DÉMO d'Aujourd'hui et de la ligne de version */
  return {ok:true,jours:40};
 }catch(e){
  try{DB.set('flDemoSession',0);}catch(e2){}                  /* une ouverture ratée ne laisse pas la porte ouverte */
  return {ok:false,raison:String(e&&e.message||e)};
 }
};

window.flDemoFermer=function(){
 var etait=flDemoActive();
 try{DB.set('flDemoSession',0);}catch(e){}                    /* la porte D'ABORD */
 try{localStorage.setItem('flintDemoData','0');}catch(e){}
 try{flPurgeDemoDays(60,70);}catch(e){}                       /* chirurgicale : la marque, jamais une mesure */
 try{DB.set('flDemoSeed',0);DB.set('demo',0);}catch(e){}
 return {ok:true,etait:etait};
};
/* ═══ FIN SESSION DEMO ═══════════════════════════════════════════════════════ */
