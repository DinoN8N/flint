/*  flint-unites.js — LE FORMAT D'HEURE ET LES UNITÉS D'AFFICHAGE.

    Sorti d'index.html le 2 septembre 2026 : le cliquet de découpage web le
    demande, et il a raison — ceci est un MÉTIER (comment FLINT écrit une
    heure), pas de la mécanique de page.

    IL SE CHARGE AVANT TOUT LE RESTE, et ce n'est pas négociable : ce qui
    décide de l'ASPECT d'un pixel doit être connu avant que le pixel soit
    peint. Sa balise est donc posée en tête d'index.html, avec le voile de
    nuit, et non dans le paquet de <script src> du milieu du fichier.

    Les bancs d'essai chargent CE FICHIER, pas une transcription — même
    doctrine que flint-fiche-seconde.js.                                   */
/* ═══ v2161 — LE FORMAT D'HEURE, POSÉ AVANT TOUT RENDU ══════════════════

   Le réglage 24 h / 12 h de la page Unités n'était lu par personne — ni en
   Swift, ni ici. Le moteur comptait vingt-quatre copies indépendantes du
   même `padStart(2,'0')+':'+padStart(2,'0')`, toutes en 24 h en dur : il
   n'existait pas un seul endroit où changer le format.

   Ces quatre fonctions sont cet endroit. Elles vivent dans le premier script
   de la page, avant l'iframe et avant le moindre injecteur, pour la même
   raison que le voile de nuit juste au-dessus : ce qui décide de l'ASPECT
   d'un pixel doit être connu avant que le pixel soit peint, sinon la
   première frame s'affiche au mauvais format et se corrige sous les yeux.

   ─── CE QUI PASSE ICI, ET CE QUI NE DOIT SURTOUT PAS ────────────────────

   `flClock` / `flClockStr` sont pour L'AFFICHAGE seulement.

   Le moteur fabrique aussi des heures `"HH:MM"` qui partent en base
   (`s.start` des séances, `m.time` des repas) et vers SwiftUI (`couche`,
   `reveil`, `debut`, `fin`). Celles-là restent en 24 h POUR TOUJOURS : elles
   sont re-parsées des deux côtés du pont, et un « 11:14 PM » écrit dans une
   charge rendrait `nil` chez le parseur d'en face — donc une nuit qui ne se
   ferme jamais. Deux téléphones réglés différemment n'écriraient même plus
   le même fichier. C'est le natif qui reformate à l'affichage, jamais nous.

   La règle, des deux côtés du pont : on STOCKE en 24 h, on AFFICHE au choix.
═════════════════════════════════════════════════════════════════════════ */
window.flH24=function(){try{return localStorage.getItem('fl.heure24')!=='0'}catch(e){return true}};
window.flMetrique=function(){try{return localStorage.getItem('fl.unites.metrique')!=='0'}catch(e){return true}};
/* Des minutes depuis minuit vers l'heure affichable. Même repli modulo 1440
   que les copies qu'elle remplace : -30 est 23:30, 1500 est 01:00. */
window.flClock=function(m){m=((Math.round(m)%1440)+1440)%1440;var h=Math.floor(m/60),n=m%60;
  if(window.flH24())return String(h).padStart(2,'0')+':'+String(n).padStart(2,'0');
  return (h%12===0?12:h%12)+':'+String(n).padStart(2,'0')+' '+(h<12?'AM':'PM')};
/* Une chaîne canonique déjà stockée ("23:14"), reformatée pour l'écran.
   Ce qu'on n'arrive pas à lire ressort INCHANGÉ : mieux vaut réafficher la
   valeur brute qu'un « 12:00 AM » inventé à partir d'un champ vide. */
window.flClockStr=function(s){if(window.flH24())return s;
  var v=String(s==null?'':s);
  /* IDEMPOTENTE, ET C'EST INDISPENSABLE. Une même valeur traverse parfois
     deux couches qui la mettent en forme (une ligne de frise reçoit tantôt
     un `flHM(...)` déjà converti, tantôt un `s.start` brut sorti de la
     base). Sans cette garde, la seconde passe relisait « 11:14 PM », lisait
     11 h, et rendait « 11:14 AM » : une heure fausse d'une demi-journée,
     visible seulement en 12 h et seulement sur certaines lignes. */
  if(/[AP]M\s*$/i.test(v))return s;
  var t=v.split(':');if(t.length<2)return s;
  var h=parseInt(t[0],10),n=parseInt(t[1],10);
  if(!isFinite(h)||!isFinite(n)||h<0||h>23||n<0||n>59)return s;
  return window.flClock(h*60+n)};
/* SUFFIXÉES `Aff`, ET CE N'EST PAS UN CAPRICE DE NOMMAGE.
   Le moteur a déjà, plus bas, une fonction de poids qui n'a rien à voir avec
   celle-ci (elle sert aux calculs, pas à l'affichage). La collision ne se
   voyait pas à l'exécution — la vraie, définie après, écrasait la nôtre —
   mais les bancs d'essai découpent index.html en cherchant l'en-tête de
   chaque fonction par son TEXTE, avec un simple `indexOf`. Ils tombaient sur
   la définition posée ici, plus haute dans le fichier, et repartaient avec
   la mauvaise. Onze bancs sont tombés d'un coup pour ce seul mot.
   Corollaire, et c'est le vrai piège : un COMMENTAIRE qui cite l'en-tête
   d'une fonction du moteur la casse tout autant qu'une redéfinition. On ne
   recopie donc jamais ici une signature qui existe ailleurs. */
window.flPoidsAff=function(kg,dec){dec=(dec==null?1:dec);
  return window.flMetrique()?(+kg).toFixed(dec)+' kg':((+kg)*2.20462262).toFixed(dec)+' lb'};
window.flDistAff=function(km,dec){dec=(dec==null?2:dec);
  return window.flMetrique()?(+km).toFixed(dec)+' km':((+km)*0.621371192).toFixed(dec)+' mi'};
/* Appelée par le natif (PontMoteurWeb.appliquerUnites) au démarrage ET à
   chaque bascule. Le natif a déjà posé les deux clés avant d'appeler — on
   les repose quand même, parce que cette fonction sert aussi de point
   d'entrée pour les bancs, qui n'ont pas de pont.
   Le repeint passe par `injectToday()`, le seul vrai « tout redessiner » du
   moteur : il rebalaie l'iframe et rappelle tous les injecteurs. Il peut ne
   pas encore exister quand le natif appelle au tout premier chargement —
   d'où le garde `typeof` : la valeur est POSÉE, et la première peinture la
   lira d'elle-même. */
window.flUnitesNatif=function(h24,met){
  try{localStorage.setItem('fl.heure24',h24?'1':'0');
      localStorage.setItem('fl.unites.metrique',met?'1':'0')}catch(e){}
  /* LE PROFIL PORTAIT DÉJÀ LA MÊME DÉCISION, SOUS UN AUTRE NOM.
     « Modifier le profil » écrit `p.units` ; la page Unités écrivait
     `fl.unites.metrique`. Deux réglages pour une seule question, qui ne se
     parlaient pas : on pouvait cocher Impérial d'un côté et lire des kilos
     de l'autre. On répercute donc, pour qu'il n'y ait qu'une réponse. */
  try{if(typeof flProfilSet==='function')flProfilSet('unites',met?'metric':'imperial')}catch(e){}
  try{if(typeof injectToday==='function')injectToday()}catch(e){}
  try{if(typeof flSetDay==='function'&&typeof flDayOff!=='undefined')flSetDay(flDayOff|0)}catch(e){}
  return true};

/* La jumelle d'affichage du formateur de repas. Celle du moteur nutrition
   produit la clé qui part en base (`m.time`) et qui sert aux comparaisons :
   elle reste en 24 h, pour toujours. Celle-ci est la seule des deux à suivre
   le réglage — et elle vit ici parce que c'est ici qu'est la décision. */
function flNfmtAff(min){return flClock(min);}
window.flNfmtAff=flNfmtAff;

/* ═══ LES FORMATEURS DU MOTEUR, RASSEMBLÉS ═══════════════════════════════════

   Ces douze déclarations vivaient éparpillées dans index.html, entre 4 213 et
   22 839. Elles répondent pourtant toutes à UNE seule question — comment FLINT
   écrit une heure, une durée, un chrono — et c'est un métier : le cliquet de
   découpage web le dit mot pour mot, « du code neuf a un metier, il va dans un
   fichier flint-<metier>.js ».

   Elles restent GLOBALES : ce sont des déclarations de fonction dans un script
   classique, et ce fichier se charge avant tous les autres. `tmin`, seul
   `const` du lot, entre dans l'environnement lexical global — partagé entre
   scripts — et il est défini avant que quoi que ce soit l'appelle.

   TROIS FAMILLES, ET ELLES NE SE MÉLANGENT PAS :
     · l'HEURE DU JOUR (jHM, stHM, flHM, flMnClk, flEndTime) passe par
       `flClock` et suit donc le réglage 24 h / 12 h ;
     · la DURÉE (hHM, flDurHM, flMnHm) et le CHRONO (hms, hmsFull) ne le
       suivent pas et ne le suivront jamais : il n'y a pas de « 7h30 PM » d'une
       durée ;
     · `flNfmt` produit la CLÉ d'un repas (`m.time`), relue et comparée : elle
       reste en 24 h pour toujours. Sa jumelle d'affichage est `flNfmtAff`.
   ═════════════════════════════════════════════════════════════════════════ */
function jHM(min){return flClock(min)}
function hHM(h){var m=Math.round(h*60);return Math.floor(m/60)+'h'+String(m%60).padStart(2,'0')}
function stHM(min){return flClock(min)}
function flHM(m){return flClock(m)}
function flDurHM(min){min=Math.max(0,Math.round(min||0));return Math.floor(min/60)+'h'+String(min%60).padStart(2,'0')}
function flEndTime(start,min){if(!start)return '';var p=String(start).split(':');return flHM((+p[0])*60+(+p[1])+(min||0))}
function flMnHm(min){min=Math.max(0,Math.round(min));return Math.floor(min/60)+'h'+String(min%60).padStart(2,'0');}
function flMnClk(min){return flClock(min);}
function flNfmt(min){min=((min%1440)+1440)%1440;var h=Math.floor(min/60),m=min%60;return (h<10?'0':'')+h+':'+(m<10?'0':'')+m;}
function hms(sec){sec=Math.max(0,Math.round(sec));return Math.floor(sec/3600)+':'+String(Math.floor(sec%3600/60)).padStart(2,'0')+':'+String(sec%60).padStart(2,'0')}
function hmsFull(sec){sec=Math.max(0,Math.round(sec));return Math.floor(sec/3600)+':'+String(Math.floor(sec%3600/60)).padStart(2,'0')+':'+String(sec%60).padStart(2,'0');}
const tmin=s=>{const a=(s||'07:00').split(':').map(Number);return a[0]*60+a[1]};

/* ═══ 22 sept. 2026 — LA LANGUE ET CE QU'ELLE CHANGE DANS UN PIXEL ══════════

   Ces fonctions vivaient dans flint-langue.js, chargé sur la même ligne que ce
   fichier. Elles reviennent ICI pour une raison de doctrine que quarante-huit
   bancs ont rappelée le jour même : « ce qui décide de l'ASPECT d'un pixel
   doit être connu avant que le pixel soit peint », et flint-unites.js est LE
   fichier que chaque harnais de la maison charge avant le moteur — c'est écrit
   en tête. Les noms de jours, le format des nombres, le premier jour de la
   semaine sont du format d'affichage au même titre que 24 h / 12 h : ils
   appartiennent à ce fichier, et un banc qui monte le moteur les trouve.

   flint-langue.js ne garde que le LEXICAL : le dictionnaire de la langue et sa
   passe sur le DOM. Le moteur ne DÉCIDE pas de la langue : le natif la choisit
   (`LangueFlint.code`) et l'injecte dans localStorage à `atDocumentStart` ; on
   ne lit JAMAIS `navigator.language`.
═════════════════════════════════════════════════════════════════════════ */
/* La langue : « fr », « en » ou « es ». Injectée par le natif ; sans elle
   (bancs, navigateur de bureau), le français — jamais navigator.language. */
window.flLangue=function(){try{var l=localStorage.getItem('fl.langue');if(l==='en'||l==='es')return l;}catch(e){}return 'fr';};
/* Les mois et jours ABRÉGÉS du moteur — six tables françaises recopiées dans index.html
   (T_MONL, ngRangeLbl, flActFmt…) qui partaient telles quelles vers le natif (« 12 juil. a las 23:10 »).
   En français, la table EXACTE d'origine (le banc épingle le caractère) ; ailleurs, Intl. Index 0 = janvier / dimanche. */
window.flMoisCourts=function(){var l=flLangue();if(l==='fr')return ['janv.','févr.','mars','avr.','mai','juin','juil.','août','sept.','oct.','nov.','déc.'];
 var f=new Intl.DateTimeFormat(flLocaleBCP(),{month:'short'});var r=[];for(var i=0;i<12;i++)r.push(f.format(new Date(2026,i,15)));return r;};
window.flJoursCourts=function(){var l=flLangue();if(l==='fr')return ['dim.','lun.','mar.','mer.','jeu.','ven.','sam.'];
 var f=new Intl.DateTimeFormat(flLocaleBCP(),{weekday:'short'});var r=[];for(var i=0;i<7;i++)r.push(f.format(new Date(2026,2,1+i)));return r;};
/* La région du téléphone (« FR », « US », « RE »), pour composer une locale
   BCP 47 qui donne les MÊMES séparateurs que le natif (`LangueFlint.locale`). */
window.flRegion=function(){try{var r=localStorage.getItem('fl.region');if(r&&/^[A-Z]{2}$/.test(r))return r;}catch(e){}return 'FR';};
window.flLocaleBCP=function(){return flLangue()+'-'+flRegion();};
/* Le premier jour de la semaine, en numérotation JavaScript (0 = dimanche,
   1 = lundi). Injecté par le natif depuis `Calendar.current.firstWeekday`,
   qui suit la région ET le réglage explicite d'iOS. Lundi sans lui. */
window.flPremierJourSemaine=function(){try{var s=localStorage.getItem('fl.semaine');if(s==='0'||s==='1')return +s;}catch(e){}return 1;};

/* ═══ LE STRUCTUREL ═══════════════════════════════════════════════════════ */
window.FL_LANG=window.FL_LANG||{};
var _FL_STRUCT={
 fr:{jl:['dimanche','lundi','mardi','mercredi','jeudi','vendredi','samedi'],
     jc:['dim','lun','mar','mer','jeu','ven','sam'],
     ml:['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'],
     mc:['janv','févr','mars','avr','mai','juin','juil','août','sept','oct','nov','déc'],
     auj:'Aujourd\'hui',hier:'Hier',demain:'Demain'},
 en:{jl:['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'],
     jc:['Sun','Mon','Tue','Wed','Thu','Fri','Sat'],
     ml:['January','February','March','April','May','June','July','August','September','October','November','December'],
     mc:['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'],
     auj:'Today',hier:'Yesterday',demain:'Tomorrow'},
 es:{jl:['domingo','lunes','martes','miércoles','jueves','viernes','sábado'],
     jc:['dom','lun','mar','mié','jue','vie','sáb'],
     ml:['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'],
     mc:['ene','feb','mar','abr','may','jun','jul','ago','sept','oct','nov','dic'],
     auj:'Hoy',hier:'Ayer',demain:'Mañana'}
};
function _flS(){return _FL_STRUCT[flLangue()]||_FL_STRUCT.fr;}
/* Les tableaux sont rendus par COPIE : un appelant qui les réordonne (semaine
   commençant lundi) ne doit pas réordonner la source pour tous les autres. */
window.flJoursLongs=function(){return _flS().jl.slice();};
window.flJoursCourts=function(){return _flS().jc.slice();};
window.flMois=function(){return _flS().ml.slice();};
window.flMoisCourts=function(){return _flS().mc.slice();};
window.flAujourdhui=function(){return _flS().auj;};
window.flHier=function(){return _flS().hier;};
window.flDemain=function(){return _flS().demain;};
/* Majuscule initiale : « lundi » → « Lundi ». Les tableaux sont en minuscules
   (c est ainsi que le français les écrit) ; ceux qui les veulent en tête de
   phrase ou en étiquette de bande les capitalisent ici, au lieu de porter
   un second tableau. */
window.flCap=function(s){s=String(s==null?'':s);return s.charAt(0).toUpperCase()+s.slice(1);};
/* LA SEMAINE DANS L ORDRE OÙ ELLE COMMENCE ICI. Les bandes de sept jours
   (accueil, journal, calories) et les agrégats hebdomadaires partaient tous
   du lundi, en dur — juste en France et en Espagne, faux aux États-Unis.
   `flPremierJourSemaine()` vient de la région (et du réglage d iOS) ; ces deux
   fonctions rendent les noms à partir de ce jour-là, et `flDepuisDebutSemaine`
   compte les jours écoulés depuis lui — la formule `(getDay()+6)%7` qu on
   trouvait partout, généralisée. Pour un téléphone français, rien ne bouge :
   lundi, comme avant, à l octet près. */
window.flDepuisDebutSemaine=function(d){return (d.getDay()+7-flPremierJourSemaine())%7;};
window.flJoursCourtsSemaine=function(){var j=flJoursCourts(),p=flPremierJourSemaine();return j.slice(p).concat(j.slice(0,p));};
window.flJoursLongsSemaine=function(){var j=flJoursLongs(),p=flPremierJourSemaine();return j.slice(p).concat(j.slice(0,p));};

/* LES NOMBRES. `fmtNum` insérait une espace tous les trois chiffres et
   `calNum` passait par `toLocaleString('fr-FR')` puis remplaçait l'espace
   fine par une espace ordinaire : deux règles pour un même chiffre, et les
   deux françaises en dur. Une seule règle, par locale :
     fr-FR  1 995      en-US  1,995      es-ES  1.995      es-MX  1,995
   L'espace fine (U+202F) que rend ICU en français est ramenée à une espace
   ordinaire, comme le faisaient les deux fonctions d'avant — le rendu
   français ne change pas d'un octet. */
window.flNombre=function(n){
 try{var s=Math.round(n||0).toLocaleString(flLocaleBCP());return s.replace(/[  ]/g,' ');}
 catch(e){return (''+Math.round(n||0)).replace(/\B(?=(\d{3})+(?!\d))/g,' ');}
};
/* Un nombre à décimales, avec le séparateur de la locale. `dec` est le nombre
   de décimales, EXACT (7 → « 7,0 » avec dec=1), comme `toFixed`. */
window.flDecimal=function(v,dec){
 dec=(dec==null)?1:dec;
 try{var s=(+v).toLocaleString(flLocaleBCP(),{minimumFractionDigits:dec,maximumFractionDigits:dec});
     return s.replace(/[  ]/g,' ');}
 catch(e){return (+v).toFixed(dec);}
};
/* Le seul séparateur décimal, pour les sites qui font `.replace('.',',')` à
   la main : ils le demandent ici au lieu de le supposer. */
window.flSeparateurDecimal=function(){
 try{var s=(1.5).toLocaleString(flLocaleBCP());return s.indexOf(',')>=0?',':'.';}catch(e){return ',';}
};

/* ═══ CHERCHER UN MOT DANS UN CONTENEUR, DANS LES DEUX LANGUES (22 sept. 2026)
   Le moteur retrouve certaines cartes de la maquette par un mot qu'elles
   contiennent (`/Coucher/.test(carte.textContent)`). Une FEUILLE traduite par
   la passe de flint-langue.js rend encore son français à `textContent` ; un
   CONTENEUR rend la concaténation de ses feuilles, donc la traduction. Cette
   aide accepte les deux, et se contente du français quand flint-langue.js
   n'est pas chargé (bancs, téléphone français). */
window.flTxtA=function(e,fr){
 var t=(e&&e.textContent)||''; if(t.indexOf(fr)>=0)return true;
 var f=window.flT; if(!f)return false; var v=f(fr); return v!==fr&&t.indexOf(v)>=0;
};
