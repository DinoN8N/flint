/* ═══════════════════════════════════════════════════════════════════════════
   LES JAMBES — le second témoin de la récupération, lu dans la marche (v2582)

   CE QUE C'EST. Le score de récupération lit le cœur : VFC, fréquence au
   repos, respiration. Il décrit le système nerveux, pas les muscles. Or
   l'iPhone en poche mesure la MARCHE, tous les jours, sans rien demander :
   vitesse, longueur de pas, asymétrie du pas, part du pas en double appui.
   Ces quatre mesures décrivent l'appareil locomoteur, et elles bougent quand
   les jambes portent encore une séance : après un gros effort, le double appui
   monte, le pas raccourcit, l'asymétrie grimpe, avec un pic à un ou deux jours.
   Le cœur peut dire « récupéré » pendant que les jambes disent « attends ».

   D'OÙ ÇA VIENT, ET DEPUIS QUAND. `FlintSante.seriesMoyennees` lit ces six
   moyennes par jour depuis des mois (v1162), et le récepteur `sante` du
   moteur les jetait à la porte : il ne gardait que pas, distance, étages et
   calories. Félix, le 21 septembre 2026 (MESSAGE-DINO-21-SEPTEMBRE.md, règle
   12) : « chaque type Santé demandé doit être réellement lu quelque part ; les
   six mesures de marche n'ont aucun lecteur ». Ce fichier est leur lecteur.

   CE QU'ON JUGE, ET CE QU'ON NE JUGE PAS. Trois mesures se comparent à SA
   propre normale, jamais à une norme de population :
     · le double appui   — plus haut  = pire (on traîne) ;
     · l'asymétrie       — plus haute = pire (un côté ménage l'autre) ;
     · la longueur de pas — plus courte = pire (on raccourcit).
   La vitesse de marche N'EST PAS jugée : elle dit si on courait après un
   train, pas l'état des jambes. La stabilité d'Apple bouge trop lentement
   (elle vise le risque de chute) ; le test de six minutes exige une Apple
   Watch. Les deux sont rangés, pas jugés.

   UN TÉMOIN, PAS UN SCORE. Rien d'ici n'entre dans `recovery()`. La carte
   dit ce que la marche a mesuré, à côté du score, comme le détecteur de
   désaccord du sceau du matin. Elle ne parle fort que quand deux lignes sur
   trois sortent d'un écart-type, ou une seule de deux. Et un signal se DÉCRIT,
   il ne se diagnostique pas (règle 11 du même message) : aucun mot de
   blessure ni de maladie ici — « tes jambes portent encore quelque chose ».

   LE N SE VOIT. Apple produit un échantillon par tronçon de marche régulière
   à plat. Une journée à trois tronçons ne juge rien : sous N_MIN, la carte se
   tait et le dit. Le natif envoie `<cle>N` depuis la v2582 ; un natif plus
   ancien ne l'envoie pas et le web l'accepte (pas de contrat rompu — § 4 du
   message du 21 septembre) : sans N, la journée compte si sa moyenne existe.

   LE MATIN N'A PAS ENCORE MARCHÉ. La page Récupération se lit au réveil, et
   la marche du jour arrive dans la journée. Quand aujourd'hui n'a pas assez
   de tronçons, la carte montre HIER, étiquetée « hier » — c'est précisément
   la lecture qui compte le matin d'après une séance. Jamais une estimation.

   CE QUI PEUT TROMPER, ET QUI EST DIT À L'ÉCRAN : chaussures, sac lourd,
   terrain, poche changée. Apple ne calcule ces mesures que sur des tronçons de
   marche régulière et à plat, ce qui filtre une partie du bruit, pas tout. La
   règle de la maison s'applique : on mesure d'abord, en silence, dans le
   journal des charges (`flJambesJournaliser`), en regard des séances de la
   veille. Si le lendemain d'une grosse course le double appui et l'asymétrie
   ne sortent pas d'un sigma chez Dino, cette carte n'a pas prouvé sa règle —
   un banc vert ne dit pas qu'une règle a raison.

   LA LONGUEUR DE PAS MESURÉE existe aussi comme repère (`flJambesDistance`) :
   pas du bracelet × pas mesuré par l'iPhone, là où le bracelet multiplie par
   une foulée SUPPOSÉE et se trompe de dix pour cent sur six kilomètres. Elle
   n'est PAS affichée : la règle de Dino (outils/audit-distance-bracelet.js)
   est « soit c'est prouvé, soit ça ne s'affiche pas », et la preuve demande
   des couples (pas, GPS) relevés avec ces données — `outils/audit-distance-
   foulee.js` les confrontera le jour où la base en portera.

   DÉPENDANCES : `DB` et `tk` lus NUS (liaisons lexicales d'index.html, jamais
   `window.DB` — garde-liaisons), ou passés en argument pour les bancs.
   `REC_TONE`, `loadStrain`, `flInfo`, `haptic` sont optionnels et gardés.
   Banc : FLINT/web/tests/test-jambes.js.
   ═══════════════════════════════════════════════════════════════════════════ */
(function(){
'use strict';

/* Les champs tels que le natif les nomme dans la charge `sante` (`charge`) et
   tels qu'on les range (`cle`). `sens` : +1 quand plus haut = pire, −1 quand
   plus bas = pire. `plancher` : l'écart-type minimal — une normale trop serrée
   transformerait un dixième de point en trois sigmas, et un dixième n'est pas
   un signal. `juge` : entre dans le témoin. */
var CHAMPS=[
 {cle:'doubleAppui',charge:'doubleAppui',nom:'Double appui',ic:'ti-shoe',unite:'%',sens:1,dec:1,plancher:0.4,juge:true,
  quoi:'La part de chaque pas où les deux pieds touchent le sol. Elle monte quand les jambes se protègent : on traîne un peu plus, on décolle un peu moins.'},
 {cle:'asymetrie',charge:'asymetrie',nom:'Asymétrie',ic:'ti-arrows-left-right',unite:'%',sens:1,dec:1,plancher:0.3,juge:true,
  quoi:'L’écart entre le temps passé sur un pied et sur l’autre. Elle grimpe quand un côté ménage l’autre, souvent avant qu’on le sente.'},
 {cle:'foulee',charge:'foulee',nom:'Longueur de pas',ic:'ti-ruler-measure',unite:'m',sens:-1,dec:2,plancher:0.01,juge:true,
  quoi:'La distance d’un pas de marche. Elle raccourcit quand les jambes sont lourdes, et s’allonge quand elles sont vives.'},
 {cle:'vitesse',charge:'vitesseMarche',nom:'Vitesse de marche',ic:'ti-walk',unite:'m/s',sens:0,dec:2,plancher:0.03,juge:false,
  quoi:'Rangée, pas jugée : elle dit si tu courais après un train, pas l’état de tes jambes.'},
 {cle:'stabilite',charge:'stabilite',nom:'Stabilité',ic:'ti-walk',unite:'%',sens:0,dec:0,plancher:1,juge:false,quoi:''},
 {cle:'marche6min',charge:'marche6min',nom:'Marche de six minutes',ic:'ti-walk',unite:'m',sens:0,dec:0,plancher:5,juge:false,quoi:''}
];
var N_MIN=8, JOURS_MIN=7, FENETRE=30;
var PAR_CLE={}; CHAMPS.forEach(function(c){PAR_CLE[c.cle]=c;});

function _db(D){ return D||DB; }
function _tk(o){ return tk(o); }
function _num(v){ return (typeof v==='number'&&isFinite(v))?v:null; }
function _fmt(v,dec){ if(v==null)return '—'; var s=(Math.round(v*Math.pow(10,dec))/Math.pow(10,dec)).toFixed(dec); return s.replace('.',flSeparateurDecimal())/* 22 sept. 2026 — la virgule suit la locale (flint-unites.js) */; }
function _sig(z){ return (z>=0?'+':'−')+_fmt(Math.abs(z),1)+' σ'; }

/* ═══ RANGER — ce que le récepteur `sante` écrit dans `sante_<K>` ══════════
   Les quatre clés historiques restent EXACTEMENT ce qu'elles étaient (pas,
   dist, etages, kcalApple : `flStepsOf`, les calories, l'export les lisent).
   `marche` s'ajoute seulement quand le natif a envoyé au moins une mesure —
   une journée sans marche mesurée n'a pas de clé `marche`, pas un objet vide.
   `n` porte le nombre d'échantillons par mesure quand le natif l'a envoyé. */
window.flJambesRanger=function(j){
 j=j||{};
 var out={pas:j.pas||[],dist:j.dist||[],etages:j.etages||[],kcalApple:j.kcalApple||[],recu:Date.now()};
 var m={},n={},vu=false;
 CHAMPS.forEach(function(c){
  var v=_num(j[c.charge]); if(v==null)return;
  m[c.cle]=v; vu=true;
  var k=_num(j[c.charge+'N']); if(k!=null)n[c.cle]=Math.round(k);
 });
 if(vu){ if(Object.keys(n).length)m.n=n; out.marche=m; }
 return out;
};

/* La lecture d'une journée : `{doubleAppui, asymetrie, foulee, vitesse…, n:{…}}`
   ou null quand rien n'a été mesuré ce jour-là. */
window.flJambesJour=function(K,D){
 try{ var s=_db(D).get('sante_'+K,null); return (s&&s.marche&&typeof s.marche==='object')?s.marche:null; }catch(e){ return null; }
};

/* Le nombre de tronçons d'une journée pour un champ : le N envoyé par le
   natif, ou null quand il ne l'a pas envoyé (natif antérieur à la v2582). */
function _nDe(jour,cle){ var n=jour&&jour.n; return (n&&_num(n[cle])!=null)?n[cle]:null; }

/* ═══ LA NORMALE — trente jours finissant la VEILLE du jour visé ═══════════
   Même fenêtre que `baseStat` : la base d'un jour ne contient jamais ce jour.
   Une journée entre dans la base si sa moyenne existe et si son N, quand il
   est connu, atteint N_MIN. Sous JOURS_MIN journées, pas de normale — un
   témoin absent vaut mieux qu'un témoin comparé à trois jours. */
function _base(cle,off,D){
 var o=Math.min(0,(off==null?0:(off|0))), a=[];
 for(var i=0;i<FENETRE;i++){
  var jour=window.flJambesJour(_tk(o-1-i),D); if(!jour)continue;
  var v=_num(jour[cle]); if(v==null)continue;
  var n=_nDe(jour,cle); if(n!=null&&n<N_MIN)continue;
  a.push(v);
 }
 return a;
}
window.flJambesNormale=function(cle,off,D){
 var c=PAR_CLE[cle]; if(!c)return null;
 var a=_base(cle,off,D);
 if(a.length<JOURS_MIN)return null;
 var m=a.reduce(function(x,y){return x+y;},0)/a.length;
 var va=a.reduce(function(x,y){return x+(y-m)*(y-m);},0)/a.length;
 return {m:m, sd:Math.max(c.plancher, Math.sqrt(va)), n:a.length};
};

/* ═══ LE TÉMOIN D'UNE JOURNÉE ═══════════════════════════════════════════════
   États, du plus muet au plus fort :
     absent       rien de mesuré ce jour-là (téléphone resté sur la table,
                  ou Santé refusée) — la carte disparaît ;
     insuffisant  des mesures, mais sous N_MIN tronçons — on ne juge pas ;
     sansNormale  moins de JOURS_MIN journées en base — on ne juge pas encore ;
     vives        deux lignes ou plus à −1 σ ou mieux ;
     normal       rien ne sort ;
     marquees     deux lignes à +1 σ, ou une à +2 σ ;
     menager      deux lignes à +2 σ, ou une à +3 σ.
   `z` est SIGNÉ DANS LE SENS DU PIRE : +1 σ veut toujours dire « un sigma
   dans le mauvais sens », quel que soit le champ. */
window.flJambesTemoin=function(off,D){
 var o=Math.min(0,(off==null?0:(off|0))), K=_tk(o);
 var jour=window.flJambesJour(K,D);
 var t={K:K,off:o,etat:'absent',lignes:[],n:null,jours:0};
 if(!jour)return t;
 var nMin=null;
 CHAMPS.forEach(function(c){
  if(!c.juge)return;
  var v=_num(jour[c.cle]); if(v==null)return;
  var n=_nDe(jour,c.cle); if(n!=null)nMin=(nMin==null)?n:Math.min(nMin,n);
  var b=window.flJambesNormale(c.cle,o,D);
  var l={cle:c.cle,nom:c.nom,val:v,unite:c.unite,n:n,m:null,sd:null,z:null,jours:b?b.n:_base(c.cle,o,D).length};
  /* z arrondi au millième : un seuil comparé à 1,9999999999999996 n'est pas un seuil. */
  if(b){ l.m=b.m; l.sd=b.sd; l.z=Math.round((v-b.m)/b.sd*c.sens*1000)/1000; }
  t.lignes.push(l);
 });
 t.n=nMin;
 t.jours=t.lignes.reduce(function(x,l){return Math.max(x,l.jours);},0);
 if(!t.lignes.length)return t;
 if(nMin!=null&&nMin<N_MIN){ t.etat='insuffisant'; return t; }
 var juges=t.lignes.filter(function(l){return l.z!=null;});
 if(juges.length<2){ t.etat='sansNormale'; return t; }
 var n1=0,n2=0,n3=0,b1=0;
 juges.forEach(function(l){ if(l.z>=3)n3++; if(l.z>=2)n2++; if(l.z>=1)n1++; if(l.z<=-1)b1++; });
 t.etat=(n2>=2||n3>=1)?'menager':(n2>=1||n1>=2)?'marquees':(b1>=2)?'vives':'normal';
 return t;
};

/* Le témoin QU'ON AFFICHE : aujourd'hui, ou hier quand aujourd'hui n'a pas
   encore marché — le matin, c'est hier qui répond de la séance de la veille.
   `hier:true` le dit à l'écran. Un jour passé se montre tel quel. */
window.flJambesTemoinAffiche=function(off,D){
 var t=window.flJambesTemoin(off,D);
 if((off|0)===0&&(t.etat==='absent'||t.etat==='insuffisant')){
  var h=window.flJambesTemoin(-1,D);
  if(h.etat!=='absent'&&h.etat!=='insuffisant'){ h.hier=true; return h; }
 }
 return t;
};

/* Les séances de la VEILLE du jour du témoin — la première explication d'un
   témoin marqué. `loadStrain` (l'effort du jour, 0-20) est pris s'il existe. */
window.flJambesVeille=function(t,D){
 try{
  var K=_tk((t.off|0)-1), L=_db(D).get('sessions_'+K,[])||[];
  var s=L.filter(function(e){return e&&e.type!=='nap'&&(e.name||e.nom);})
         .map(function(e){return (e.name||e.nom)+(e.dur!=null?' '+Math.round(e.dur)+' min':'');});
  var eff=null; try{ if(typeof loadStrain==='function'){eff=loadStrain(K);} }catch(e){}
  return {K:K, seances:s, effort:(eff!=null&&isFinite(eff))?Math.round(eff*10)/10:null};
 }catch(e){ return {K:null,seances:[],effort:null}; }
};

/* ═══ LES PHRASES — décrire, jamais diagnostiquer ══════════════════════════ */
window.flJambesPhrase=function(t,veille){
 var v=veille||{seances:[]};
 var ex=v.seances.length?' Ta séance de la veille ('+v.seances.join(', ')+') est la première explication.':'';
 switch(t.etat){
  case 'absent': return '';
  case 'insuffisant': return 'Pas encore assez de marche mesurée'+(t.hier?' hier':' aujourd’hui')+' ('+(t.n==null?'0':t.n)+' tronçon'+(t.n>1?'s':'')+', il en faut '+N_MIN+').';
  case 'sansNormale': return 'Encore quelques jours de marche avec ton iPhone en poche pour connaître ta normale ('+t.jours+' jour'+(t.jours>1?'s':'')+' sur '+JOURS_MIN+').';
  case 'vives': return 'Tes jambes sont plus vives que d’habitude : pas plus long, appui plus court.';
  case 'marquees': return 'Tes jambes portent encore quelque chose : appui plus long ou pas plus court qu’à ton habitude.'+ex;
  case 'menager': return 'Tes jambes sortent nettement de ta normale. Ménage-les'+(t.hier?'':' aujourd’hui')+', et regarde si ça persiste demain.'+ex;
  default: return 'Ta marche est dans ta normale : tes jambes ne portent rien d’inhabituel.';
 }
};

/* L'état d'UNE ligne, dans la grammaire des cartes de facteurs (REC_TONE) :
   good / warn / bad, un libellé court, une phrase. */
window.flJambesLigneEtat=function(l){
 var c=PAR_CLE[l.cle]||{sens:1};
 if(l.z==null)return {t:'neutre',s:'Sans normale',c:'Pas encore de normale.'};
 var haut=(c.sens>=0)?['Élevé','Très élevé','Bas']:['Court','Très court','Long'];
 if(l.z>=2)return {t:'bad',s:haut[1],c:'Nettement hors de ta normale ('+_sig(l.z)+').'};
 if(l.z>=1)return {t:'warn',s:haut[0],c:'Un peu hors de ta normale ('+_sig(l.z)+').'};
 if(l.z<=-1)return {t:'good',s:haut[2],c:'Mieux que d’habitude ('+_sig(l.z)+').'};
 return {t:'good',s:'Normale',c:'Dans ta normale ('+_sig(l.z)+').'};
};

/* ═══ LE HTML DE LA CARTE — pur, testable sans DOM ═════════════════════════
   Même forme que les cartes de facteurs de la page Récupération (fc-card,
   fc-gauge) : la zone verte est m ± σ, le point est la valeur du jour, la
   couleur est portée par la pastille, jamais par le point. */
window.flJambesHTML=function(t,veille){
 if(!t||t.etat==='absent')return '';
 var TONE=(typeof REC_TONE==='object'&&REC_TONE)||{good:['#2E7D4F','#EAF4EE','#3FB57A'],warn:['#9A6500','#FBF1DD','#E0922A'],bad:['#B23A22','#FBEAE6','#CF4631'],neutre:['#6B7280','#F1F2F4','#9AA1AC']};
 var head='<div class="hm-hd">Tes jambes'+(t.hier?' <span style="font-size:12px;font-weight:700;color:#8A857D;margin-left:6px">hier</span>':'')+'</div>';
 var phrase=window.flJambesPhrase(t,veille);
 if(t.etat==='insuffisant'||t.etat==='sansNormale'){
  return '<div id="recJambesBloc">'+head+'<div class="hm-empty"><i class="ti ti-walk"></i><span>'+phrase+'</span></div></div>';
 }
 var cards=t.lignes.map(function(l){
  var c=PAR_CLE[l.cle], st=window.flJambesLigneEtat(l), tn=TONE[st.t]||TONE.neutre, dotc=(st.t==='good')?'#15140F':tn[2];
  var lo=l.m!=null?l.m-l.sd:l.val, hi=l.m!=null?l.m+l.sd:l.val, w=(hi-lo)||1, tmin=lo-w*1.5, tmax=hi+w*1.5;
  var pc=function(v){return Math.max(0,Math.min(100,(v-tmin)/(tmax-tmin)*100));};
  var jauge=(l.m!=null)?'<div class="fc-gauge"><span class="z" style="left:'+pc(lo).toFixed(1)+'%;width:'+(pc(hi)-pc(lo)).toFixed(1)+'%"></span><span class="d" style="left:'+pc(l.val).toFixed(1)+'%;background:'+dotc+'"></span></div>'
                          +'<div class="fc-norme">Normale '+_fmt(lo,c.dec)+'–'+_fmt(hi,c.dec)+' '+c.unite+'</div>':'';
  return '<button class="fc-card" type="button" onclick="flJambesExplique(\''+l.cle+'\')">'
   +'<div class="fc-top"><span class="fc-ic"><i class="ti '+c.ic+'"></i></span><span class="fc-name">'+c.nom+'</span></div>'
   +'<div class="fc-mid"><span class="fc-val">'+_fmt(l.val,c.dec)+'<small>'+c.unite+'</small></span><span class="fc-pill" style="color:'+tn[0]+';background:'+tn[1]+'">'+st.s+'</span></div>'
   +'<div class="fc-sentence">'+st.c+'</div>'+jauge+'</button>';
 }).join('');
 var tonV=(t.etat==='menager')?TONE.bad:(t.etat==='marquees')?TONE.warn:TONE.good;
 var pied='<div style="font-size:12px;font-weight:600;color:#9A948A;text-align:center;margin:2px 0 14px;line-height:1.4">Mesuré par ton iPhone en poche'+(t.n!=null?' · '+t.n+' tronçon'+(t.n>1?'s':'')+' de marche':'')+' · un témoin, pas un score</div>';
 return '<div id="recJambesBloc">'+head
  +'<div class="hm-empty" style="margin-bottom:11px;border-left:4px solid '+tonV[2]+'"><i class="ti ti-walk" style="color:'+tonV[2]+'"></i><span>'+phrase+'</span></div>'
  +'<div class="fc-grid">'+cards+'</div>'+pied+'</div>';
};

/* ═══ LE RENDU — sur la page Récupération, juste sous les facteurs ═════════
   Le bloc n'existe pas dans le HTML d'index.html (cliquet des 37 500 lignes) :
   il est posé une fois après `#recCards`, puis réécrit à chaque rendu. Un
   témoin absent vide le bloc — rien n'est montré d'un jour sans mesure. */
window.flJambesRendre=function(off,D){
 try{
  var host=document.getElementById('recJambes');
  if(!host){
   var apres=document.getElementById('recCards'); if(!apres)return;
   host=document.createElement('div'); host.id='recJambes';
   apres.insertAdjacentElement('afterend',host);
  }
  var t=window.flJambesTemoinAffiche(off,D);
  host.innerHTML=window.flJambesHTML(t,window.flJambesVeille(t,D));
 }catch(e){ try{console.log('[flint] jambes : rendu impossible — '+e);}catch(x){} }
};

/* Le « pourquoi » d'une ligne, dans la feuille d'information de la maison. */
window.flJambesExplique=function(cle){
 var c=PAR_CLE[cle]; if(!c)return;
 var html='<p>'+c.quoi+'</p>'
  +'<p>Mesurée par ton iPhone, porté en poche, sur chaque tronçon de marche régulière et à plat. Elle se compare à <b>ta</b> normale des trente derniers jours, jamais à celle des autres.</p>'
  +'<p>Ce qui peut la déplacer sans que tes jambes y soient pour rien : des chaussures différentes, un sac lourd, un terrain inhabituel, le téléphone dans une autre poche.</p>'
  +'<p><b>Un témoin, pas un score.</b> Elle n’entre pas dans ta récupération : elle la met en regard. FLINT n’est pas un dispositif médical.</p>';
 try{ if(typeof flInfo==='function'){flInfo(c.nom,html);return;} }catch(e){}
 try{ alert(c.nom+'\n\n'+html.replace(/<[^>]+>/g,'')); }catch(e){}
};

/* ═══ LE JOURNAL — mesurer en silence avant de croire la règle ═════════════
   Une ligne par journée (hier, puis aujourd'hui), dans le journal des charges
   natif, avec la séance de la veille en regard. C'est la méthode de la maison
   (`sonderSourcesCourse`) : on se donne les moyens de voir avant de conclure.
   Le natif tronque à 400 caractères et refuse les retours à la ligne. */
window.flJambesJournal=function(off,D){
 var t=window.flJambesTemoin(off,D);
 if(t.etat==='absent')return null;
 var v=window.flJambesVeille(t,D);
 var parts=t.lignes.map(function(l){
  var c=PAR_CLE[l.cle];
  return c.nom.toLowerCase()+' '+_fmt(l.val,c.dec)+' '+c.unite+(l.n!=null?' n'+l.n:'')+(l.z!=null?' '+_sig(l.z):' sans normale');
 });
 var s='jambes ⏱ '+t.K+' · '+parts.join(' · ')+' · témoin : '+t.etat
  +' · veille : '+(v.seances.length?v.seances.join(', '):'aucune séance')+(v.effort!=null?', effort '+_fmt(v.effort,1):'');
 return s.length>400?s.slice(0,397)+'…':s;
};
window.flJambesJournaliser=function(D){
 [-1,0].forEach(function(o){
  var m=null; try{ m=window.flJambesJournal(o,D); }catch(e){ m=null; }
  if(!m)return;
  try{console.log('[flint] '+m);}catch(e){}
  try{var nt=window.webkit&&window.webkit.messageHandlers&&window.webkit.messageHandlers.flint;
   if(nt)nt.postMessage({cmd:'journal',texte:m});}catch(e){}
 });
};

/* ═══ LA DISTANCE PAR LA LONGUEUR DE PAS MESURÉE — un repère, pas un écran ═
   pas × longueur de pas mesurée par l'iPhone ce jour-là (si assez de
   tronçons), sinon × la normale personnelle. Rend null sans l'un ni l'autre :
   jamais une foulée supposée. Non affichée tant que la règle de Dino n'est pas
   satisfaite (voir l'en-tête). Vaut pour la MARCHE seulement : la foulée de
   course est une autre grandeur. */
window.flJambesDistance=function(pas,off,D){
 pas=_num(pas); if(pas==null||pas<=0)return null;
 var o=Math.min(0,(off==null?0:(off|0))), jour=window.flJambesJour(_tk(o),D);
 var f=jour?_num(jour.foulee):null, n=jour?_nDe(jour,'foulee'):null, src='jour';
 if(f==null||(n!=null&&n<N_MIN)){ var b=window.flJambesNormale('foulee',o,D); if(!b)return null; f=b.m; src='normale'; }
 if(!(f>0.2&&f<1.5))return null;
 return {m:Math.round(pas*f), foulee:Math.round(f*1000)/1000, source:src};
};

window.flJambesConst={N_MIN:N_MIN,JOURS_MIN:JOURS_MIN,FENETRE:FENETRE,CHAMPS:CHAMPS.map(function(c){return {cle:c.cle,charge:c.charge,juge:c.juge,sens:c.sens};})};
})();
