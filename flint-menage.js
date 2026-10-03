/* Le metier de ce fichier : le VIEILLISSEMENT du stockage — la fenetre
   d age des courbes (appelee au demarrage et par flFaireDeLaPlace, via
   window.*) et le menage des cles mortes. Liaisons de script : `DB` et
   `tk` se lisent NUS (jamais window.DB/window.tk — garde-liaisons),
   comme flint-recup-cycle.js. Le banc : tests/test-memoire.js, qui
   charge ce fichier en entier. */
/* ─── LES CLÉS DU HAUT (3 oct. 2026) ─────────────────────────────────────────
   Avec la cave (CaveBase.swift), `localStorage` est une COUCHE : ses clés
   comptent aussi les journées descendues sur le disque de l'app. Les passes
   qui font de la place gèrent la mémoire PLAFONNÉE, et les migrations
   idempotentes ont déjà vu chaque journée quand elle était en haut : elles ne
   regardent donc que le haut — relire la cave à chaque lancement coûterait un
   aller-retour par journée d'historique, et ne rendrait pas un octet. Sans
   couche (app plus ancienne), c'est l'énumération de toujours. */
window.flClesChaudes=function(){
 try{if(window.__flCave&&window.__flCave.chaudes)return window.__flCave.chaudes();}catch(e){}
 var a=[];try{for(var i=0;i<localStorage.length;i++){var k=localStorage.key(i);if(k!=null)a.push(k);}}catch(e){}
 return a;
};
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
 try{var _kc=flClesChaudes();for(var i=0;i<_kc.length;i++){var k=_kc[i];
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
 /* ══ Étape 3 (24 sept. 2026) — LA SÉRIE DE LA NUIT EST UN CACHE, ET UN
      CACHE VIEILLIT ══════════════════════════════════════════════════════════
      CE QUE LE 24 SEPTEMBRE A COÛTÉ. Dino termine un Football déclaré à
      19:24:50 ; à 19:24:51 le moteur rend `ECHEC-ECRITURE`, à 19:25:07 sa
      réponse « Football » est refusée elle aussi. La séance n'a jamais été
      écrite : ce qui est resté à l'écran est la séance que la MONTRE avait
      déposée de son côté — d'où « Activité détectée » et une fiche sans courbe.
      LA CAUSE, MESURÉE SUR SA BASE RAPATRIÉE : 4 842 Ko pour un quota de
      ~5 120, et `flFaireDeLaPlace()` rendait **false, 0 octet libéré**. Le
      filet était vide — `hrbrut_`, `hrfine_` et `rrH` déjà à leur plancher,
      la courbe du jour déjà éclaircie. C'est mot pour mot le défaut que le
      pavé v1400 décrit (« un filet qui ne peut rien attraper n'est pas un
      filet »), revenu par une autre porte.
      OÙ ÉTAIT LE POIDS, ET POURQUOI IL EST GRATUIT À RENDRE : `night.hrTs`
      pèse **987 Ko sur 54 jours** — un cinquième du quota — et ce n'est PAS
      une mesure : `flsHrTs(K)` le fabrique par projection de `watch_<K>.hr`
      (`w.hr.map(x => [x[1], minuit + x[0]*60])`, flint-sommeil.js). C'est un
      instantané du re-staging, que son propre lecteur dit déjà pouvoir être
      PÉRIMÉ (index.html, flEchantillonsNuit). Le jeter ne perd donc rien
      qu'on ne sache refaire — contrairement à une courbe éclaircie, qui elle
      perd de la finesse pour de bon.
      MESURE SUR LA BASE DE DINO : 32 nuits au-delà de 21 jours, **592 Ko
      rendus**, 32 sur 32 reconstruisibles depuis `watch_.hr`. Sa marge passe
      de 278 Ko à ~870, et la base cesse de vivre collée au plein.
      21 JOURS N'EST PAS UN NOMBRE NEUF : c'est la frontière que ce fichier se
      donne déjà (`age(k)>21` ci-dessus) et celle de l'étape 1.
      CE QU'ON NE TOUCHE PAS : les stades (`stages`, `stagesV8`), les totaux,
      les scalaires, `vfcNuit`. Une vieille nuit garde TOUTE sa structure. Et
      ses deux lecteurs directs tolèrent déjà l'absence — `(w.night&&w.night.hrTs)||null`
      côté fuseau, `(s&&s.hrTs)||[]` côté échantillons : ils ne peuvent pas
      trouver là un tableau vide qu'ils ne savent pas déjà rencontrer.
   ══ 3 oct. 2026 — LA FRONTIÈRE DE CE CACHE EST CELLE DU RE-STAGING, 7 JOURS ══
      Neuf jours après, la base de Dino était de nouveau PLEINE : 5 241 391
      octets pour 5 242 880 (le plafond de WebKit, mesuré), 1,5 Ko de marge,
      cinq refus au journal à chaque lancement, et un filet qui rendait RIEN.
      Les 21 jours n'étaient pas la frontière de CE cache : `hrTs` n'est
      réécrit que par `restageSleep`, que `flintSommeilRecalculer` passe sur
      les jours 0 à 7 (et ceux d'une tranche encore en mémoire). Au-delà, il
      ne bouge plus jamais — c'est un instantané figé, que ses deux lecteurs
      savent refaire : `flEchantillonsNuit` reprojette `watch_<K>.hr` et garde
      la série la plus fournie, et `flRetrouverFuseau` ne sert qu'aux jours
      d'avant la v1767 — ceux de Dino portent TOUS leur `tz` (vérifié sur 30
      jours de sa base). Mesuré : 15 nuits de 8 à 21 jours, 283 Ko rendus.
      `flsEcrireNuit` cesse en même temps de le poser sur une nuit de plus de
      7 jours, sinon une tranche ancienne le ferait revenir à chaque recalcul. */
 var clesNuit=[];
 try{var _kn=flClesChaudes();for(var i3=0;i3<_kn.length;i3++){var kn=_kn[i3];
  if(kn&&kn.indexOf('watch_')===0&&age(kn)>7)clesNuit.push(kn);}}catch(e){}
 clesNuit.sort(function(a,b){return age(b)-age(a);});
 for(var n3=0;n3<clesNuit.length&&!assez();n3++){
  var k3=clesNuit[n3], av3=taille(k3); if(!av3)continue;
  var w3=lire(k3); if(!w3||!w3.night||!w3.night.hrTs||!w3.night.hrTs.length)continue;
  delete w3.night.hrTs;
  if(poser(k3,w3,{night:w3.night})){var r3=av3-taille(k3);libere+=r3;jours++;
   try{window._flRenduSeries=(window._flRenduSeries||0)+r3;}catch(e){}}
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
 var _km=flClesChaudes();for(var i=0;i<_km.length;i++){var k=_km[i];
  if(!k||!datee.test(k))continue;
  var v=null;try{v=localStorage.getItem(k);}catch(e){continue;}
  if(v==='null'||v==='[]'||v==='{}'||v==='')morts.push(k);
 }
 morts.forEach(function(k){try{localStorage.removeItem(k);DB.marque(k);}catch(e){}});
 try{if(morts.length)console.log('[flint] menage : '+morts.length+' cle(s) morte(s) retiree(s)');}catch(e){}
 return morts.length;
}catch(e){return 0;}};
try{setTimeout(function(){try{window.flMenageClesMortes();}catch(e){}},20000);}catch(e){}

/* ─── UN SEUL EMOJI FAIT PAYER DOUBLE TOUTE LA VALEUR (3 oct. 2026) ────────
   WebKit compte le quota (5 242 880 octets) EN OCTETS DE SA CHAÎNE INTERNE :
   un octet par caractère tant que tous tiennent en Latin-1, DEUX par
   caractère — pour la valeur ENTIÈRE — dès qu'un seul n'y tient pas. Mesuré
   dans un WebKit (outil de mesure jetable) : 5 241 856 caractères « a » ou
   « é » passent, 2 620 416 « → », et 2 555 904 seulement quand UN « → »
   ouvre chaque bloc de 64 Ko d'ASCII. Échappé (« \u2192 »), le même bloc
   repasse à 5 177 344.
   Chez Dino, `sessions_<jour>` porte l'icône de chaque séance (« 🚶 », « 🏋️ »,
   « ⚽️ ») : ses 63 journées pesaient 331 Ko au lieu de 166. Les journaux
   (`recovJrn`, `nuitMatinJrn`) et `flGelC_` payaient de même pour un « — ».
   306 Ko rendus en tout, sur une base pleine à 1,5 Ko près.
   LA RÈGLE : une valeur JSON qui contient des caractères hors Latin-1 se
   range avec ces caractères ÉCHAPPÉS (`\uXXXX`, la forme que JSON.parse lit
   depuis toujours). Le contenu relu est le même, au caractère près : la passe
   le PROUVE avant d'écrire (parse de l'ancienne et de la nouvelle, mêmes
   chaînes), et ne touche jamais une valeur qui n'est pas du JSON (un texte
   brut verrait apparaître les barres obliques). On n'échappe que si l'on y
   gagne : six octets par caractère échappé contre deux pour TOUS les autres,
   donc moins d'un caractère large sur cinq.
   `DB.set` n'est pas touché : la passe tourne au démarrage et dans le filet,
   la valeur du jour se recompacte au lancement suivant. Aucune mémoire de
   calcul n'est prévenue — le contenu n'a pas bougé. Banc : test-memoire.js. */
window.flEchapperLarges=function(s){try{
 if(typeof s!=='string'||!/[^\x00-\xff]/.test(s))return s;
 var larges=s.match(/[^\x00-\xff]/g).length;
 if(larges*5>=s.length)return s;
 return s.replace(/[^\x00-\xff]/g,function(c){return '\\u'+('000'+c.charCodeAt(0).toString(16)).slice(-4);});
}catch(e){return s;}};
window.flRecompacterLarges=function(){try{
 var cles=[],n=0,rendu=0;
 cles=flClesChaudes();
 for(var j=0;j<cles.length;j++){
  var v=null;try{v=localStorage.getItem(cles[j]);}catch(e){continue;}
  if(!v||!/[^\x00-\xff]/.test(v))continue;
  var e2=window.flEchapperLarges(v);if(e2===v)continue;
  var a=null,b=null;
  try{a=JSON.stringify(JSON.parse(v));b=JSON.stringify(JSON.parse(e2));}catch(e){continue;}
  if(a!==b)continue;
  try{localStorage.setItem(cles[j],e2);}catch(e){continue;}
  n++;rendu+=2*v.length-e2.length;
 }
 try{window._flRenduLarges=(window._flRenduLarges||0)+rendu;}catch(e){}
 return {cles:n,octets:rendu};
}catch(e){return {cles:0,octets:0};}};
/* Le poids TEL QUE WEBKIT LE COMPTE — `flDiagStockage` compte des caractères
   et sous-estime de moitié toute valeur large. */
window.flPoidsWebKit=function(){try{
 var t=0,LS=(window.__flCave&&window.__flCave.reel)||localStorage;   /* la mémoire plafonnée, pas la cave */
 for(var i=0;i<LS.length;i++){var k=LS.key(i)||'',v=LS.getItem(k)||'';
  t+=(/[^\x00-\xff]/.test(k)?2:1)*k.length+(/[^\x00-\xff]/.test(v)?2:1)*v.length;}
 return t;
}catch(e){return -1;}};
/* Au démarrage, après la fenêtre rrH (8 s) et avant la fenêtre d'âge (15 s).
   Puis UNE ligne au journal du téléphone : ce que pèse la base et ce que ce
   lancement a rendu — sans elle, on ne saurait dire si la base revit collée
   au plein qu'en la rapatriant. */
try{setTimeout(function(){try{window.flRecompacterLarges();}catch(e){}},10000);}catch(e){}
try{setTimeout(function(){try{
 var p=window.flPoidsWebKit();if(p<0)return;
 var m='stockage · '+Math.round(p/1024)+' Ko sur 5 120 ('+Math.round(p*100/5242880)+' %) · rendu à ce lancement : séries de nuit '
  +Math.round((window._flRenduSeries||0)/1024)+' Ko, caractères larges '+Math.round((window._flRenduLarges||0)/1024)+' Ko';
 window.webkit.messageHandlers.flint.postMessage({cmd:'journal',texte:m});
}catch(e){}},17000);}catch(e){}

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
