/*  flint-langue.js — LA LANGUE DU MOTEUR, ET CE QU'ELLE CHANGE DANS UN PIXEL.

    ═══ 21 sept. 2026 — POURQUOI CE FICHIER, ET POURQUOI ICI ══════════════════

    Dino : « si le téléphone est en espagnol, l'application s'ouvre en
    espagnol ». Le moteur ne DÉCIDE pas de la langue : c'est le natif qui la
    choisit (`LangueFlint.code`) et qui l'injecte dans `localStorage` à
    `atDocumentStart`, avant que ce fichier ne s'exécute. On ne lit JAMAIS
    `navigator.language` — deux moitiés d'app qui décident chacune de leur
    côté finissent par ne pas dire la même chose sur le même écran.

    IL SE CHARGE EN TÊTE, sur la même ligne que flint-unites.js et pour la même
    raison : ce qui décide de l'ASPECT d'un pixel doit être connu avant que le
    pixel soit peint. Et sur la MÊME ligne parce qu'index.html est à une ligne
    de son plafond de découpage — une balise de plus coûterait le build.

    ═══ DEUX NIVEAUX, ET PAS UN SEUL ═══════════════════════════════════════════

    · STRUCTUREL — dans flint-unites.js, depuis le 22 septembre : les noms de
      jours et de mois, le format des nombres, le premier jour de la semaine,
      « Aujourd'hui / Hier ». Ce sont les choses qui doivent être JUSTES, et
      les quarante-huit bancs qui montent le moteur chargent flint-unites.js
      — pas ce fichier. Les 30 tableaux `['lundi','mardi',…]` et les 21
      `'fr-FR'` d'index.html ont été remplacés EN PLACE par ces fonctions.

    · LEXICAL — `flint-langue-<code>.js`, chargé juste en dessous de façon
      synchrone (document.write pendant l'analyse de <head> : légitime, et le
      seul moyen d'avoir le dictionnaire AVANT le premier rendu). C'est un
      dictionnaire « phrase française → phrase traduite », que la passe DOM
      applique au rendu quand la langue n'est pas le français. Un utilisateur
      français ne charge rien et ne paye rien.

    ═══ CE QUI NE PASSE PAS ICI ═══════════════════════════════════════════════

    Tout ce qui est STOCKÉ ou qui traverse le pont : clés `Y-M-D`, heures
    `"HH:MM"`, nombres en base. Même règle que flint-unites.js : on STOCKE en
    français-machine, on AFFICHE dans la langue.                            */

/* La langue se lit aussi sur <html>, pour les feuilles de style et pour
   quiconque inspecte la page. Le natif l'a déjà posée ; on la confirme. */
try{document.documentElement.lang=flLangue();}catch(e){}
/* L iframe « Aujourd hui » porte un titre d accessibilite : dans la langue. */
try{var _fi=document.getElementById('frToday');if(_fi)_fi.title=flAujourdhui();}catch(e){}

/* ═══ LE LEXICAL ══════════════════════════════════════════════════════════ */
/* `flT(fr)` rend la traduction d'une phrase française, ou la phrase elle-même.
   Nommé `flT` et non `t` : dans un moteur de 37 000 lignes, `t` est un nom de
   variable locale des centaines de fois. */
window.flT=function(fr){
 var l=flLangue(); if(l==='fr')return fr;
 var d=window.FL_LANG[l]; if(!d)return fr;
 var v=d[fr]; return (typeof v==='string'&&v)?v:fr;
};
/* Le dictionnaire de la langue, chargé de façon SYNCHRONE : la balise est
   écrite pendant l'analyse de <head>, donc exécutée avant tout script qui
   suit. Rien n'est chargé pour le français. */
(function(){
 var l=flLangue(); if(l==='fr')return;
 try{document.write('<script src="flint-langue-'+l+'.js"><\/script>');}catch(e){}
})();

/* ═══ LA PASSE SUR LE DOM — le lexical, AU RENDU (22 sept. 2026) ═══════════

   Le moteur écrit ses phrases en français, en dur, dans 37 000 lignes qu'un
   cliquet interdit d'allonger et que 269 bancs tiennent par le texte. On ne
   les remplace pas une à une : on traduit AU RENDU. Chaque nœud de texte
   français qui entre dans le document est remplacé par sa traduction quand le
   dictionnaire la connaît — et le moteur, lui, CONTINUE DE LIRE DU FRANÇAIS.

   CE DERNIER POINT EST LA DÉCISION QUI COMPTE. Le moteur retrouve les nœuds
   de la maquette PAR LEUR TEXTE (« MA NUIT », « Coucher », « Profil »… : 54
   sites relevés le 22 sept.), et il RELIT ce qu'il a écrit pour décider s'il
   doit réécrire (`if(t!==want)e.textContent=want`, `/^moy\./.test(t)`). Si la
   traduction changeait ce qu'il lit, chaque ancrage se perdrait — écran vide
   dans les autres langues — et chaque valeur traduite deviendrait FIGÉE : le
   motif français ne se reconnaît plus, donc plus jamais de mise à jour.
   Deux voies : réécrire les 54 sites, et tous ceux qu'on écrira ensuite ; ou
   faire en sorte que le moteur lise le français qu'il a écrit. C'est la
   seconde. Les accesseurs `textContent`, `nodeValue` et `data` rendent, pour
   un nœud traduit, le français d'origine (gardé sur le nœud, `__flFr`).
   L'écran montre la langue ; le moteur lit la sienne. C'est la règle de
   flint-unites.js étendue au DOM : on STOCKE en français-machine, on AFFICHE
   dans la langue.

   Ce que ça borne : un élément ne rend le français que s'il est une FEUILLE
   (un seul nœud de texte). Un conteneur rend la concaténation de ses
   feuilles, donc la traduction — les huit sites qui cherchent un mot dans un
   conteneur (`/Coucher/.test(carte.textContent)`) passent par `flTxtA`
   (flint-unites.js), qui accepte les deux formes.

   CE QUE ÇA COÛTE :
   · rien pour un téléphone français — ni passe, ni accesseurs : ce bloc rend
     avant d'avoir rien installé ;
   · un MutationObserver par document (la page et l'iframe « Aujourd'hui »).
     La passe s'exécute en MICROTÂCHE, après tous les observateurs du moteur
     livrés dans le même lot — ils voient donc le français qu'ils attendent
     (`RE_DASH` de flDashLive teste les nœuds ajoutés) — et avant le repaint :
     aucune image française n'est peinte ;
   · un accesseur JavaScript devant trois accesseurs natifs, pour les seules
     LECTURES du moteur ; ses écritures passent par les natifs ;
   · zéro churn : le moteur relit « Moyenne », compare à « Moyenne », n'écrit
     pas. Sans les accesseurs, chaque passage d'injecteur réécrirait le
     français et chaque réécriture relancerait la traduction.

   CE QU'ELLE NE PEUT PAS FAIRE, ET QUI EST DIT : une phrase absente du
   dictionnaire reste en français, EN SILENCE. D'où le relevé : sous
   `fl.releve`='1' (posé par le natif en Debug), chaque phrase rencontrée
   sans traduction est consignée dans `fl.manques` — la liste de ce qui reste
   à traduire n'est plus une estimation, c'est un relevé (`flManquesLangue()`,
   lu par l'écran Diagnostic) — et la règle de sortie du chantier exige qu'il
   soit vide.

   LES GABARITS : une clé qui commence par `re:` est une expression régulière
   (`re:^(\d+) nuits$`), sa valeur emploie $1, $2. Compilées une fois, au
   démarrage — le dictionnaire est chargé par la balise écrite ci-dessus,
   donc APRÈS ce fichier : rien ne se lit avant DOMContentLoaded.           */
(function(){
 var l=flLangue(); if(l==='fr')return;
 var D={}, gabarits=[], connus={};
 var releve=false; try{releve=localStorage.getItem('fl.releve')==='1';}catch(e){}
 var manques={}, minuterie=0;
 try{(JSON.parse(localStorage.getItem('fl.manques')||'[]')||[]).forEach(function(k){manques[k]=1;});}catch(e){}
 /* Une phrase d'écran fait moins de 200 caractères ; au-delà, c'est du CSS
    ou du JSON arrivé dans un nœud de texte, et ça ferait déborder le relevé
    ET le stockage (setItem refuse en silence). Le relevé est borné aussi. */
 var nbManques=0;
 function noter(k){
  if(!releve||k.length>200||nbManques>=600||manques[k]||connus[k])return; manques[k]=1; nbManques++;
  if(minuterie)return;
  minuterie=setTimeout(function(){minuterie=0;try{localStorage.setItem('fl.manques',JSON.stringify(Object.keys(manques).sort()));}catch(e){}},800);
 }
 /* Rien à traduire : nombres, ponctuation, heures (« 7h12 », « 23:10 ») —
    et les gabarits « {{ x }} » de la maquette, que le moteur remplit avant
    qu'on les voie : les traduire ou les relever serait un mensonge. */
 var RIEN=/^[\d\s.,:;%€$+\-–—·/()°'"«»h×x*→←↑↓•|]*$/, GABARIT=/^\{\{[\s\S]*\}\}$/;
 function traduire(t){
  var lead=/^\s*/.exec(t)[0]; if(lead.length===t.length)return null;
  var trail=/\s*$/.exec(t)[0];
  var k=t.slice(lead.length,t.length-trail.length).replace(/\s+/g,' ');
  if(RIEN.test(k)||GABARIT.test(k))return null;
  var v=D[k]; if(typeof v==='string')return lead+v+trail;
  for(var i=0;i<gabarits.length;i++){if(gabarits[i][0].test(k))return lead+k.replace(gabarits[i][0],gabarits[i][1])+trail;}
  if(/[a-zà-ÿ]{3,}/i.test(k))noter(k);
  return null;
 }
 /* Les trois accesseurs, posés une fois par royaume (la page, puis l'iframe).
    Les natifs sont gardés sur le document : la passe lit et écrit par eux. */
 function poserAccesseurs(win){
  var doc=win&&win.document; if(!doc||doc.__flNat)return;
  var N=win.Node&&win.Node.prototype, C=win.CharacterData&&win.CharacterData.prototype; if(!N||!C)return;
  var dTC=Object.getOwnPropertyDescriptor(N,'textContent'), dNV=Object.getOwnPropertyDescriptor(N,'nodeValue'), dDA=Object.getOwnPropertyDescriptor(C,'data');
  if(!dTC||!dNV||!dDA||!dTC.get||!dNV.get||!dDA.get)return;
  try{
   Object.defineProperty(N,'textContent',{configurable:true,enumerable:dTC.enumerable,
    get:function(){if(this.nodeType===3){var f=this.__flFr;if(f!==undefined)return f;}
     else{var c=this.firstChild;if(c&&c.nodeType===3&&c.__flFr!==undefined&&c.nextSibling===null)return c.__flFr;}
     return dTC.get.call(this);},
    set:function(v){if(this.nodeType===3){this.__flFr=undefined;this.__flVu=undefined;}dTC.set.call(this,v);}});
   Object.defineProperty(N,'nodeValue',{configurable:true,enumerable:dNV.enumerable,
    get:function(){var f=this.__flFr;return f!==undefined?f:dNV.get.call(this);},
    set:function(v){this.__flFr=undefined;this.__flVu=undefined;dNV.set.call(this,v);}});
   Object.defineProperty(C,'data',{configurable:true,enumerable:dDA.enumerable,
    get:function(){var f=this.__flFr;return f!==undefined?f:dDA.get.call(this);},
    set:function(v){this.__flFr=undefined;this.__flVu=undefined;dDA.set.call(this,v);}});
   doc.__flNat={lire:dNV.get,ecrire:dNV.set};
  }catch(e){}
 }
 /* Les balises qu'on ne traduit jamais. L'itérateur les rejette avec leur
    sous-arbre ; une mutation characterData arrive sans lui, d'où la même
    garde ici, sur le parent (un `<style>` réécrit par le moteur est un nœud
    de texte qui change, et son CSS n'est pas une phrase). */
 var JAMAIS={SCRIPT:1,STYLE:1,TEXTAREA:1,NOSCRIPT:1};
 function horsJeu(p){if(!p||p.nodeType!==1)return false;if(JAMAIS[p.nodeName.toUpperCase()])return true;try{return !!(p.closest&&p.closest('[data-fl-notr]'));}catch(e){return false;}}
 function texte(n,nat){
  if(horsJeu(n.parentNode))return;
  var t=nat.lire.call(n);
  if(t===n.__flVu)return;
  if(t===n.__flFr){nat.ecrire.call(n,n.__flVu);return;}
  var tv=traduire(t);
  if(tv!=null){nat.ecrire.call(n,tv);n.__flFr=t;n.__flVu=tv;}
  else{n.__flFr=undefined;n.__flVu=t;}
 }
 var ATTR=['placeholder','title','aria-label'];
 function attributs(n){
  for(var a=0;a<ATTR.length;a++){var at=ATTR[a];if(!n.hasAttribute(at))continue;
   var va=n.getAttribute(at),cle='__flA_'+at;if(n[cle]===va)continue;
   var tv=traduire(va);if(tv!=null){n.setAttribute(at,tv);n[cle]=tv;}else n[cle]=va;}
 }
 function passe(racine){
  if(!racine)return;
  var doc=racine.nodeType===9?racine:racine.ownerDocument; if(!doc||!doc.__flNat)return;
  var nat=doc.__flNat;
  if(racine.nodeType===3){texte(racine,nat);return;}
  if(racine.nodeType!==1&&racine.nodeType!==9&&racine.nodeType!==11)return;
  var it=doc.createNodeIterator(racine,5,{acceptNode:function(n){
   if(n.nodeType===1){if(JAMAIS[n.nodeName.toUpperCase()]||n.hasAttribute('data-fl-notr'))return 2;}
   return 1;}});
  var n; while((n=it.nextNode())){if(n.nodeType===1)attributs(n);else texte(n,nat);}
 }
 var file=[], prevu=false;
 function vider(){prevu=false;var f=file;file=[];for(var i=0;i<f.length;i++){if(f[i][1])attributs(f[i][0]);else passe(f[i][0]);}}
 function planifier(n,attr){file.push([n,attr]);if(prevu)return;prevu=true;
  if(typeof queueMicrotask==='function')queueMicrotask(vider);else Promise.resolve().then(vider);}
 function observer(doc){
  if(!doc||!doc.body||doc.__flObs)return; doc.__flObs=1;
  poserAccesseurs(doc.defaultView); if(!doc.__flNat)return;
  passe(doc.body);
  try{var MO=doc.defaultView.MutationObserver||MutationObserver;
   new MO(function(ms){for(var i=0;i<ms.length;i++){var m=ms[i];
    if(m.type==='childList'){for(var j=0;j<m.addedNodes.length;j++)planifier(m.addedNodes[j],false);}
    else planifier(m.target,m.type==='attributes');}})
   .observe(doc.body,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:ATTR});}catch(e){}
 }
 /* ═══ LE PONT — les phrases que le moteur LIVRE au natif (lot 4c, 22 sept.) ══
    Depuis la v947 les écrans sont SwiftUI : le moteur ne peint plus, il LIVRE
    des charges — `postMessage({cmd:'natif',screen,data})` et les retours de
    `flXxxData()` — que le natif affiche telles quelles : phrases de fiche,
    libellés, conseils. La passe DOM ne les voit pas ; celle-ci les traduit AU
    DÉPART, par le même dictionnaire et le même relevé.

    LA POLITIQUE PAR NOM DE CHAMP, et pourquoi elle est stricte : une charge
    porte aussi des IDENTIFIANTS — `genre:'sommeil'`, `cle:'recovery'`,
    `mode:'M'`, `nom:'Marche'` que `estMarche` compare côté Swift. Les
    traduire casserait le natif en silence dans les autres langues. On ne
    traduit donc que sous un champ dont le nom dit « texte » (titre, phrase,
    libelle, sous, conseil, texte, note, detail, verdict, raison, explication,
    legende, label, lecture, resume, description, message, astuce, aide,
    question, reponse, intitule, corps…), tableaux compris. Une chaîne
    française sous un autre champ reste telle quelle et est RELEVÉE avec le
    nom du champ (`? champ · phrase`) : la liste dit s'il manque un champ à la
    politique ou une phrase au dictionnaire. Les tableaux de nombres (courbes)
    sont rendus tels quels, sans copie. */
 var CHAMP_TEXTE=/^(titre|phrase|libelle|sous|conseil|texte|note|detail|verdict|raison|explication|legende|label|lecture|resume|description|message|astuce|aide|question|reponse|intitule|corps|commentaire|bulle|accroche|sousTitre|titreCourt|nomAffiche|txt|synchro|etatTexte|statutTexte|besoinRaison|besoinAjusteSrc)[A-Za-z0-9]*$/;
 var CHAMP_JAMAIS=/^(id|cle|key|genre|type|mode|etat|statut|source|nom|unite|sport|code|couleur|icone|icon|jour|date|heure|url|src|href|sym|symbole|classe|class|fmt|format)[A-Za-z0-9]*$/i;
 var FRANCAIS=/[éèàùçêôîû]|\b(le|la|les|des|une|du|ton|ta|tes|pas|est|sur|pour|avec|dans|cette|ce|au|aux)\b/;
 function chargeTraduite(v,champ,prof){
  if(typeof v==='string'){
   if(champ&&CHAMP_TEXTE.test(champ)){var t=traduire(v);return t!=null?t:v;}
   if(releve&&v.length>2&&v.length<=200&&FRANCAIS.test(v)&&!(champ&&CHAMP_JAMAIS.test(champ)))noter('? '+(champ||'')+' · '+v.replace(/\s+/g,' ').trim());
   return v;
  }
  if(!v||typeof v!=='object'||prof>14)return v;
  if(Array.isArray(v)){if(!v.length||typeof v[0]==='number')return v;var a=new Array(v.length);for(var i=0;i<v.length;i++)a[i]=chargeTraduite(v[i],champ,prof+1);return a;}
  var o={};for(var k in v)if(Object.prototype.hasOwnProperty.call(v,k))o[k]=chargeTraduite(v[k],k,prof+1);return o;
 }
 var PONT_NOMS=/^fl[A-Z]\w*Data$/, PONT_AUSSI={flCatalogue:1,flProfilRecords:1,flAgePage:1,flBalanceOuvrir:1,flDiagPont:1};
 function brancherPont(){
  try{var h=window.webkit&&window.webkit.messageHandlers&&window.webkit.messageHandlers.flint;
   if(h&&typeof h.postMessage==='function'&&!h.__flPont){var orig=h.postMessage;h.__flPont=1;
    h.postMessage=function(m){try{if(m&&m.cmd==='natif'&&m.data&&typeof m.data==='object')m=Object.assign({},m,{data:chargeTraduite(m.data,'data',0)});}catch(e){}return orig.call(h,m);};}}catch(e){}
  try{Object.keys(window).forEach(function(n){
   if(!(PONT_NOMS.test(n)||PONT_AUSSI[n]))return; var f=window[n]; if(typeof f!=='function'||f.__flPont)return;
   var g=function(){var r=f.apply(this,arguments);return (r&&typeof r==='object')?chargeTraduite(r,'data',0):r;}; g.__flPont=1; window[n]=g;});}catch(e){}
 }
 window.flChargeTraduite=function(v){return chargeTraduite(v,'data',0);};
 function demarrer(){
  D=(window.FL_LANG&&window.FL_LANG[l])||{};
  Object.keys(D).forEach(function(k){if(k.indexOf('re:')===0){try{gabarits.push([new RegExp(k.slice(3)),D[k]]);}catch(e){}}else connus[D[k]]=1;});
  /* Ce que le moteur écrit DÉJÀ dans la langue (jours, mois, « Aujourd'hui »,
     et les valeurs du dictionnaire) n'est pas un manque. */
  try{[].concat(flJoursLongs(),flJoursCourts(),flMois(),flMoisCourts(),[flAujourdhui(),flHier(),flDemain()]).forEach(function(k){connus[k]=1;connus[flCap(k)]=1;});}catch(e){}
  try{observer(document);}catch(e){}
  brancherPont();
  /* L'iframe « Aujourd'hui » est un document à part, de même origine : on
     l'observe aussi, dès qu'il est chargé — et à chaque rechargement. Un
     contexte sans document (les bancs) passe ici sans rien faire. */
  var fi=null; try{fi=document.getElementById('frToday');}catch(e){}
  if(fi){var brancher=function(){try{observer(fi.contentDocument);}catch(e){}};
   try{if(fi.contentDocument&&fi.contentDocument.body)brancher();}catch(e){}
   try{fi.addEventListener('load',brancher);}catch(e){}}
 }
 try{if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',demarrer);else demarrer();}catch(e){}
 window.flPasseLangue=passe;
 window.flManquesLangue=function(){return Object.keys(manques).sort();};
 window.flManquesLangue.vider=function(){manques={};try{localStorage.removeItem('fl.manques');}catch(e){}};
})();
