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
