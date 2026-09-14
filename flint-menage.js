/* Le metier de ce fichier : le VIEILLISSEMENT du stockage — la fenetre
   d age des courbes (appelee au demarrage et par flFaireDeLaPlace, via
   window.*) et le menage des cles mortes. Liaisons de script : `DB` et
   `tk` se lisent NUS (jamais window.DB/window.tk — garde-liaisons),
   comme flint-recup-cycle.js. Le banc : tests/test-memoire.js, qui
   charge ce fichier en entier. */
/* ─── LA FENETRE D AGE DES COURBES (30 aout 2026, commercialisation) ────────
   LA LECON DU 23 AOUT, GENERALISEE. Ce jour-la, la base etait PLEINE et treize
   ecritures ont echoue AVANT que le filet ne trouve quoi rendre : attendre que
   le disque refuse, c est accepter qu une nuit echoue d abord. La fenetre rrH
   (v1821) a regle ce gisement-la en passant CHAQUE JOUR au demarrage. Ici, la
   meme regle pour les deux autres gisements qui ne vivaient que dans le filet :

     · les RR bruts au-dela de 21 jours   → vides (leur resume — RMSSD, nuit,
       recuperation — est deja calcule et range a part) ;
     · la courbe de FC au-dela de 45 jours → min/max par 3 minutes ;
     · au-dela de 180 jours               → min/max par 15 minutes (~2 Ko/jour :
       l annee entiere tient dans le prix d une semaine fine).

   Un utilisateur normal au bracelet atteignait le quota (~5 Mo) entre 2 et
   8 mois — la base vivait ensuite collee au plein, chaque ecriture au petit
   bonheur. Avec la fenetre, l archive vieillit a ~2 Ko/jour et le quota ne se
   rejoint plus.

   CE QU ELLE NE TOUCHE JAMAIS (les regles du filet, reprises telles quelles) :
   `night`, `sommeils`, `steps`, `kcal`, `dist`, `sessions_*`, le journal, le
   profil, les repas ; aucune cle creee, aucune cle supprimee, aucune cle a
   valeur nulle touchee (le piege des 1 320 faux jours) ; les 21 derniers jours
   sont hors d atteinte. Et rien ne se perd : min/max par tranche garde la forme
   et les pointes (regle de l etape 3 du filet, v1400).

   LA COPIE VIVANTE SUIT (lecon v1824) : chaque jour reecrit est aligne dans le
   cache de `wGet` via `flPoserJourCache`, et `DB.marque` previent les memoires
   de calcul. Sans ca, la prochaine ecriture du moteur ressusciterait le poids.

   Appelee (1) differee au demarrage, apres la fenetre rrH, sans borne ;
   (2) par le filet avec une cible d octets, en secours si le plein arrive
   avant la passe du jour. Elle est extraite et jouee par test-memoire.js. */
window.flFenetreCourbes=function(viser){try{
 var libere=0, sansBorne=(viser==null), jours=0;
 function assez(){return !sansBorne&&libere>=viser;}
 function lire(k){try{var v=localStorage.getItem(k);return v?JSON.parse(v):null;}catch(e){return null;}}
 function taille(k){try{var v=localStorage.getItem(k);return v?v.length:0;}catch(e){return 0;}}
 function poser(k,o,champs){try{
  localStorage.setItem(k,JSON.stringify(o));
  try{DB.marque(k);}catch(e){}
  try{window.flPoserJourCache&&window.flPoserJourCache(k.slice(6),champs);}catch(e){}
  return true;
 }catch(e){return false;}}
 /* min/max par tranche de `mins` minutes — la forme et les pointes restent. */
 function eclaircir(hr,mins){
  var seau={}, ordre=[];
  hr.forEach(function(pt){
   if(!pt||pt.length<2)return;
   var b=Math.floor(pt[0]/mins);
   if(!seau[b]){seau[b]={lo:pt,hi:pt};ordre.push(b);}
   else{if(pt[1]<seau[b].lo[1])seau[b].lo=pt;if(pt[1]>seau[b].hi[1])seau[b].hi=pt;}
  });
  var fin=[];
  ordre.sort(function(a,b){return a-b;}).forEach(function(b){
   var s2=seau[b], a2=s2.lo, b2=s2.hi;
   if(a2===b2){fin.push(a2);return;}
   if(a2[0]<=b2[0]){fin.push(a2);fin.push(b2);}else{fin.push(b2);fin.push(a2);}
  });
  return fin;
 }
 var pa=tk(0).split('-');
 var auj=Date.UTC(+pa[0],(+pa[1])-1,+pa[2]);
 function age(k){var p=k.slice(6).split('-');
  var t=Date.UTC(+p[0],(+p[1])-1,+p[2]);
  return isNaN(t)?0:Math.round((auj-t)/86400000);}   /* cle illisible : age 0, jamais touchee */
 var cles=[];
 try{for(var i=0;i<localStorage.length;i++){var k=localStorage.key(i);
  if(k&&k.indexOf('watch_')===0&&age(k)>21)cles.push(k);}}catch(e){return 0;}
 cles.sort(function(a,b){return age(b)-age(a);});     /* les plus vieux d abord, par DATE */
 /* Etape 1 — le moins precieux sur TOUTES les cles : les RR bruts. */
 for(var n=0;n<cles.length&&!assez();n++){
  var k1=cles[n], av=taille(k1); if(!av)continue;
  var w=lire(k1); if(!w||!w.rr||!w.rr.length)continue;
  w.rr=[]; if(poser(k1,w,{rr:w.rr})){libere+=av-taille(k1);jours++;}
 }
 /* Etape 2 — la courbe de FC, eclaircie selon l age. Le seuil de points evite
    de reecrire un jour deja a sa densite : 3 min ≈ 960 points au plus,
    15 min ≈ 192 — un jour sous le seuil n a plus rien a rendre. */
 for(var n2=0;n2<cles.length&&!assez();n2++){
  var k2=cles[n2], a3=age(k2); if(a3<=45)continue;
  var pas=(a3>180)?15:3, seuil=(a3>180)?220:1000;
  var av2=taille(k2); if(!av2)continue;
  var w2=lire(k2); if(!w2||!w2.hr||w2.hr.length<seuil)continue;
  var fin=eclaircir(w2.hr,pas);
  if(fin.length>=w2.hr.length)continue;
  w2.hr=fin; if(poser(k2,w2,{hr:w2.hr})){libere+=av2-taille(k2);jours++;}
 }
 try{if(jours)console.log('[flint] fenetre d age : '+jours+' reecriture(s), '
   +Math.round(libere/1024)+' Ko rendus');}catch(e){}
 return libere;
}catch(e){return 0;}};
/* Differee comme la fenetre rrH, et APRES elle : le demarrage appartient au
   montage des onglets, et la passe lit du disque. */
try{setTimeout(function(){try{window.flFenetreCourbes();}catch(e){}},15000);}catch(e){}

/* ─── LE MENAGE DES CLES MORTES (30 aout 2026, commercialisation) ──────────
   L'ancienne purge demo recreait chaque cle retiree a null/[]/{} : ~1 320
   cles vides sur les telephones passes par la (la purge est one-shot,
   flShellPurged=3 — elle ne repassera pas les nettoyer). Chaque balayage de
   famille (flJours) les relit pour rien, et un jour neantise reste un FAUX
   JOUR dans toute enumeration par prefixe. La regle : une cle DATEE dont la
   valeur brute est 'null', '[]', '{}' ou '' n'est pas une mesure, c'est un
   residu — elle part. Les singletons ne sont JAMAIS touches (un {} de
   singleton peut vouloir dire « vide de la main de l'utilisateur »). */
window.flMenageClesMortes=function(){try{
 var morts=[];
 var datee=/^[A-Za-z][A-Za-z0-9]*_\d{4}-\d{1,2}-\d{1,2}$/;
 for(var i=0;i<localStorage.length;i++){var k=localStorage.key(i);
  if(!k||!datee.test(k))continue;
  var v=null;try{v=localStorage.getItem(k);}catch(e){continue;}
  if(v==='null'||v==='[]'||v==='{}'||v==='')morts.push(k);
 }
 morts.forEach(function(k){try{localStorage.removeItem(k);DB.marque(k);}catch(e){}});
 try{if(morts.length)console.log('[flint] menage : '+morts.length+' cle(s) morte(s) retiree(s)');}catch(e){}
 return morts.length;
}catch(e){return 0;}};
try{setTimeout(function(){try{window.flMenageClesMortes();}catch(e){}},20000);}catch(e){}

/* ─── TAILLER UN JOUR DE `hrfine_` AUX FENÊTRES DE SES SÉANCES (6 sept. 2026) ──
   LA COURSE DU 29 AOÛT portait 609 points à cinq secondes dans l export du
   5 septembre ; le 6 au soir, la base vive n en avait plus un seul : le filet
   (flFaireDeLaPlace, index.html) gardait sept jours de `hrfine_` et effaçait
   les autres EN ENTIER, et la fiche est retombée sur 52 points à la minute,
   lissés par la médiane de cinq. « Les anciennes courbes sont plus plates »
   n était pas un défaut de dessin — c était de la mesure jetée.

   Or ce qui pèse dans un jour de `hrfine_`, c est la JOURNÉE (220 Ko) ; les
   fenêtres de ses séances en font quelques kilo-octets. On taille donc le jour
   à ses séances (deux minutes de marge, siestes exclues, une séance sans heure
   lue à 0:00 comme le fait flEffData) au lieu de l effacer, pendant
   JOURS_TAILLE jours ; au-delà, le filet l efface comme avant. Rien n est
   inventé : ce qui reste est exactement ce qui a été mesuré pendant la séance,
   dans le format du magasin ({minute: [[seconde, bpm]]}), et flHrFine lit la
   fenêtre comme avant.

   Rend vrai si le jour a été taillé (et gardé), faux si rien ne justifie de le
   garder — le filet l efface alors. `storage` est PASSÉ (garde-liaisons) : le
   filet écrit en direct, jamais via DB.set. Banc : tests/test-place-seances.js. */
window.flTaillerHrfineAuxSeances=function(cle,quandMs,storage){try{
 var JOURS_TAILLE=90;
 if(!(quandMs>=Date.now()-JOURS_TAILLE*86400000))return false;
 var K=String(cle).slice(7), fen=[], ss=null;
 try{ss=JSON.parse(storage.getItem('sessions_'+K)||'null');}catch(e){ss=null;}
 (ss||[]).forEach(function(s){
  if(!s||s.type==='nap'||!(+s.dur>0))return;
  var sp=String(s.start||'0:0').split(':'),a=(+sp[0])*60+(+sp[1]);
  if(!isFinite(a))return;
  fen.push([Math.max(0,a-2),Math.min(1440,a+(+s.dur)+2)]);
 });
 if(!fen.length)return false;
 var hf=null; try{hf=JSON.parse(storage.getItem(cle)||'null');}catch(e){hf=null;}
 if(!hf||typeof hf!=='object')return false;
 var garde={},nb=0;
 Object.keys(hf).forEach(function(m){var mn=+m;
  for(var q=0;q<fen.length;q++)if(mn>=fen[q][0]&&mn<fen[q][1]){garde[m]=hf[m];nb++;return;}});
 if(!nb)return false;
 storage.setItem(cle,JSON.stringify(garde));
 return true;
}catch(e){return false;}};
