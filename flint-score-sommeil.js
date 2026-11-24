/* Le metier de ce fichier : LA NOTE DE LA NUIT — la fonction unique qui
   transforme une nuit mesurée (durée, éveil, besoin, régularité) en un score
   sur 100. Une formule, un endroit (doctrine v1770) : l'écran Sommeil, le pont
   natif (`flSommeilData`) et les rejeux appellent tous `flScoreSommeil`.

   Liaisons de script : `tk` se lit NU (jamais window.* — garde-liaisons) ;
   `sensorOf`, `flBesoinNuitDuJour` et `sleepConsistency` vivent dans
   index.html et se testent par `typeof` — une liaison de fichier se teste,
   elle ne se suppose pas. Le banc : tests/test-score-sommeil.js (propriétés)
   et outils/calibration-sommeil.js (rejeu contre WHOOP sur la base rapatriée).

   ═══ HISTOIRE DES FORMES ══════════════════════════════════════════════════

   v1770 — le score cessait d'être l'efficacité déguisée, et prenait la forme
   « couverture × (1 + 0,5 × (qualité − 0,85)) » : la couverture du besoin en
   socle, la qualité en modulateur de ±10 %. Élégant, et un défaut mesuré.

   30 août 2026 — LA CALIBRATION CONTRE WHOOP : LA QUALITÉ PORTE SA PART.
   Vingt nuits d'août notées par WHOOP, rejouées avec le moteur de HEAD sur la
   base rapatriée du téléphone (`outils/calibration-sommeil.js`) : MAE 8,2, et
   deux familles d'erreurs SYSTÉMATIQUES, pas du bruit :
     · les nuits moyennes mais PROPRES étaient sous-payées — le 30 août
       (6 h 07, efficacité 88 %) valait 60 chez nous, 76 chez WHOOP ;
     · les nuits sales étaient sur-payées — le 8 août (6 h 21 mais 2 h 43
       d'éveil, efficacité 70 %) valait 65 chez nous, 49 chez WHOOP.
   Aucun k de la forme multiplicative ne corrige les deux : elle est ancrée à
   la couverture et la qualité n'y a pas de voix propre.

   CE QUE LES 448 NUITS DE L'EXPORT WHOOP DISENT DE LEUR SCORE (régression sur
   leurs propres colonnes — whoop-export/sommeil.csv) :

       perf ≈ 0,90·couverture + 0,42·efficacité + 0,27·régularité − 45
       (MAE 4,2 sur 448 nuits)

   Leur score est ADDITIF : la qualité porte sa propre part, elle ne module
   pas. Et leur ratio efficacité:régularité (0,42:0,27 ≈ 0,6:0,4) est
   exactement notre ancien SOM_PART_REGUL — deux calibrations indépendantes,
   le même partage.

   LA FORME RETENUE, transposée à NOS variables (notre besoin est plus petit
   que le leur, donc notre couverture plus grande — les poids se recalibrent
   sur nos 20 nuits, la STRUCTURE vient de leurs 448) :

       score = 0,7·couverture + 0,4·efficacité + 0,2·régularité − 29
       plafonné à 1,3 × couverture (arrondi VERS LE BAS — une borne ne
       s'arrondit pas vers le haut)

   LE PLAFOND EST LA GARANTIE que la qualité ne sauve jamais une nuit trop
   courte : 4 h 14 parfaites sur un besoin de 9 h 15 (couverture 46) ne
   dépassent JAMAIS 60, quelle que soit l'efficacité. C'est le successeur de
   la « propriété de la multiplication » de v1770 — une borne nommée, pas un
   seuil caché.

   ═══ 30 août au soir — LA RÉGULARITÉ QUI VOIT UNE NUIT (v2063) ════════════
   Les captures de Dino ont donné la régularité WHOOP par nuit : elle BALAIE
   38→89 et s'effondre en un jour (89 le 18, 38 le 21, 43 la nuit d'avion).
   Nos deux mesures d'alors étaient aveugles à ça : l'indice de Phillips sur
   14 jours (plage 65-85, une nuit déviante pèse 1/14) et surtout
   `_flEtatMinutes` qui marque TOUTE la fenêtre coucher→réveil comme du
   sommeil — la nuit d'avion (1 h 12 dormies, 5 h d'éveil au lit) comptait
   comme une nuit régulière.

   LA MESURE RETENUE, `flRegulariteNuit` : le recouvrement (Dice,
   2·|A∩B|/(|A|+|B|)) du profil de sommeil RÉEL de la nuit notée (fenêtre
   moins les segments d'éveil des stades) contre chacune des QUATRE nuits
   précédentes, pondéré vers la plus récente (4,3,2,1) — la définition même
   que WHOOP documente (« past four days, weighted »). Sur les 14 nuits où
   leur valeur est connue : r = 0,66 et les effondrements sont capturés
   (avion → 44 contre 43 chez eux, le 21 → 44 contre 38). Moins de deux
   nuits comparables → null, on ne devine pas.

   PORTE DE DÉCISION mesurée avant d'écrire : la régularité WHOOP exacte
   injectée dans le score gagne 0,7 pt de MAE (plafond) ; cette mesure-ci en
   capture la moitié ET porte la hiérarchie à son meilleur : MAE 6,0 → 5,7,
   Spearman 0,675 → 0,689. Son poids monte à 0,2 (le ratio efficacité :
   régularité de WHOOP est 0,42:0,27 — le nôtre passe de 4:1 à 2:1, encore
   prudent), le socle se recale à −29 pour un biais nul.

   LES REPLIS, dits au lieu de devinés : sans régularité mesurée, son poids se
   replie sur l'efficacité (0,6·eff) — l'exécution parle pour l'habitude ;
   sans efficacité mesurée, on note comme une nuit d'efficacité NORMALE
   (SOM_EFF_NORMALE, en points de %) au lieu de ne pas moduler. Aucune
   constante ne vient d'une date ou d'un profil : quatre poids, un socle, un
   plafond, les mêmes pour tous. */
var SOM_EFF_NORMALE=85, SOM_P_COUV=0.7, SOM_P_EFF=0.4, SOM_P_REGUL=0.2,
    SOM_SOCLE=-29, SOM_PLAFOND_COUV=1.3;
/* Le profil d'une nuit : 2880 minutes (la veille + le jour du réveil),
   vraies minutes DORMIES — la fenêtre coucher→réveil moins les segments
   d'éveil quand les stades existent. C'est le contraire assumé de
   `_flEtatMinutes` (index.html), qui mesure l'habitude du LIT sur 14 jours
   pour le chronotype ; ici on note UNE nuit, l'éveil n'est pas du sommeil. */
function _flProfilNuit(k){
 try{
  var w=(typeof watchOf==='function')?watchOf(k):null;
  var n=w&&w.night;
  if(!n||n.bedMin==null||n.wakeMin==null)return null;
  var p=new Uint8Array(2880);
  var b=n.bedMin+1440, f=n.wakeMin+1440;
  if(n.bedMin>n.wakeMin)b-=1440;
  for(var i=b;i<f;i++)p[i]=1;
  if(n.stages&&n.stages.length)for(var q=0;q<n.stages.length;q++){
   var st=n.stages[q]; if(!st||st.stage!=='awake')continue;
   var d0=b+(st.startMin||0), d1=d0+(st.durMin||0);
   for(i=d0;i<d1&&i<2880;i++)if(i>=0)p[i]=0;
  }
  return p;
 }catch(e){return null;}
}
var _frnCache={}, _frnCle='';
window.flRegulariteNuit=function(K){
 try{
  var k=K||((typeof tk==='function')?tk():null);
  if(!k)return null;
  var cc=((window._flEcritures||0)+'|'+((typeof localStorage!=='undefined')?localStorage.length:0));
  if(cc!==_frnCle){_frnCache={};_frnCle=cc;}
  if(_frnCache[k]!==undefined)return _frnCache[k];
  var cur=_flProfilNuit(k);
  if(!cur)return (_frnCache[k]=null);
  var nCur=0;for(var i=0;i<2880;i++)nCur+=cur[i];
  var p=String(k).split('-'), sims=0, poids=0, n=0, POIDS=[4,3,2,1];
  for(var j=1;j<=4;j++){
   var d=new Date(+p[0],(+p[1])-1,+p[2]); d.setDate(d.getDate()-j);
   var kk=d.getFullYear()+'-'+(d.getMonth()+1)+'-'+d.getDate();
   var pv=_flProfilNuit(kk);
   if(!pv)continue;
   var inter=0, nPv=0;
   for(i=0;i<2880;i++){nPv+=pv[i]; if(cur[i]&&pv[i])inter++;}
   if(nCur+nPv===0)continue;
   sims+=POIDS[j-1]*(2*inter/(nCur+nPv)); poids+=POIDS[j-1]; n++;
  }
  if(n<2)return (_frnCache[k]=null);
  return (_frnCache[k]=Math.max(0,Math.min(100,Math.round(100*sims/poids))));
 }catch(e){return null;}
};
/* ═══ 7 sept. 2026 — LE SCORE D UNE NUIT PASSEE SE CALCULE UNE FOIS, PAS TRENTE-DEUX ═══
   MESURE au banc sur la base vive de Dino (harnais de profil) : `flSommeilData(0)`
   coutait 418 ms, dont 289 ms dans trente-deux appels a cette fonction et 317 ms
   dans les trente-trois `flBesoinNuitDuJour` qu ils entrainent — la normale des
   nuits passees, recalculee de zero A CHAQUE OUVERTURE de la page Sommeil, de
   l accueil et du cycle de recuperation. Dino, le 7 septembre : « j ai clique
   sur le score de sommeil, ca a mis trop de temps a charger ».
   LA MEMOIRE EST CELLE DE LA MAISON (v1957, flFcRepos) : scellee par les
   compteurs d ecritures des familles que ce calcul lit (`DB.tampon`) — une
   ecriture dans l une d elles jette tout. Elle ne sert QUE les nuits passees
   demandees telles que la base les porte (aucun argument force) : la nuit du
   jour bouge encore et se calcule toujours. Une copie est rendue, jamais
   l objet garde. Sans `DB.tampon` (bancs), la memoire est inactive et le
   calcul reste celui d avant, ligne pour ligne : il vit dans `_calcul`, INTACT,
   a l interieur de la fonction pour que les bancs qui prelevent par le nom
   continuent de la lire entiere. */
window._flScoreMemo={__sceau:null};
window.flScoreSommeil=function(K,dormi,eveil,besoin,regul){
 var _calcul=function(K,dormi,eveil,besoin,regul){
 try{
  var k=K||((typeof tk==='function')?tk():null);
  if(!k)return null;
  if(dormi==null){var so=(typeof sensorOf==='function')?sensorOf(k):null;
   if(!so||so.sleepMin==null)return null;
   dormi=so.sleepMin; if(eveil==null)eveil=so.awake;}
  if(!(dormi>0))return {score:0,couverture:0,eff:null,raison:'nuit blanche'};
  if(besoin==null){
   if(typeof flBesoinNuitDuJour!=='function')return null;
   besoin=flBesoinNuitDuJour(k).min;}
  if(!(besoin>0))return null;
  var couverture=Math.min(100,Math.round(dormi/besoin*100));
  var eff=(eveil!=null&&dormi+eveil>0)?Math.round(dormi/(dormi+eveil)*100):null;
  /* v2063 — la régularité par défaut est celle DE CETTE NUIT, pas celle
     d'aujourd'hui : une nuit passée se note avec son habitude d'alors. */
  if(regul===undefined)regul=(typeof window.flRegulariteNuit==='function')?window.flRegulariteNuit(k):null;
  var qe=(eff!=null)?eff:SOM_EFF_NORMALE;
  var brut=(regul!=null)
    ? SOM_P_COUV*couverture+SOM_P_EFF*qe+SOM_P_REGUL*regul+SOM_SOCLE
    : SOM_P_COUV*couverture+(SOM_P_EFF+SOM_P_REGUL)*qe+SOM_SOCLE;
  var score=Math.max(0,Math.min(100,Math.round(Math.min(brut,Math.floor(SOM_PLAFOND_COUV*couverture)))));
  return {score:score, couverture:couverture, eff:eff, regul:regul,
          besoin:besoin, dormi:dormi, brut:+brut.toFixed(1)};
 }catch(e){return null;}
};
 try{
  var k=K||((typeof tk==='function')?tk():null);
  var _auj=(typeof tk==='function')?tk():null;
  var _memo=!!k&&k!==_auj&&dormi==null&&besoin==null&&regul==null;
  var _sc=null;
  /* ═══ 13 sept. 2026 — LE SCEAU NE NOMMAIT PAS CE QUE LE CALCUL LIT ══════
     Trois de ses six termes étaient MORTS. `DB.famille` ne retire que la date
     finale d'une clé : il n'existe aucune clé du dépôt dont la famille soit
     « besoin » ou « recov » (les vraies sont `besoinJour_`, `recov_`,
     `recovAj_`…). `DB.tampon('besoin')` et `DB.tampon('recov')` valaient donc 0,
     pour toujours : deux zéros dans une signature.
     Et il MANQUAIT ce que le calcul lit vraiment. Mesuré, pas supposé —
     `localStorage.getItem` instrumenté pendant `flScoreSommeil`, sur les 22 jours
     de la base de Dino qui portent un score : `profile` (par `flBesoinSommeil`),
     `zonesJour_`, `zonesBpm` et `zonesReglage` sont lus à CHAQUE jour, et aucun
     n'était au sceau. Une correction du besoin au profil ne périmait donc pas
     le score déjà calculé.
     `hrfine_` reste, bien qu'il ne soit pas apparu à la mesure : c'est une
     famille RÉELLE, et un terme de trop ne fait que périmer trop tôt — un terme
     qui manque sert du faux. `garde-caches.js` rejoue cette mesure à chaque
     suite : une lecture ajoutée demain sans son terme rendra le banc rouge. */
  if(_memo){try{_sc=DB.tampon('sensor_')+'|'+DB.tampon('watch_')+'|'+DB.tampon('sessions_')
                 +'|'+DB.tampon('hrfine_')+'|'+DB.tampon('profile')+'|'+DB.tampon('zonesJour_')
                 +'|'+DB.tampon('zonesBpm')+'|'+DB.tampon('zonesReglage');}catch(e){_sc=null;}}
  if(!_memo||_sc==null)return _calcul(K,dormi,eveil,besoin,regul);
  var _m=window._flScoreMemo; if(!_m||_m.__sceau!==_sc){_m=window._flScoreMemo={__sceau:_sc};}
  var _ck=k+'|'+(eveil==null?'':eveil);
  if(Object.prototype.hasOwnProperty.call(_m,_ck)){var _g=_m[_ck];return _g?JSON.parse(JSON.stringify(_g)):null;}
  var _r=_calcul(K,dormi,eveil,besoin,regul);
  _m[_ck]=_r?JSON.parse(JSON.stringify(_r)):null;
  return _r;
 }catch(e){return _calcul(K,dormi,eveil,besoin,regul);}
};

/* ═══ 14 nov. 2026 (v3098) — LE SEUIL « ASSEZ DORMI » APPRIS SUR LES NUITS DE LA PERSONNE ═══
   Dino, 13 nov. : le réveil « Quand tu es prêt » réveille quand « ça sert pas à grand chose
   qu'il continue de dormir. Le rapport, il s'inverse. » Le seuil était un réglage (7 h, mesuré
   sur SES 564 nuits WHOOP) ; il devient appris, pour chacun, sur ce que ce moteur publie déjà :
   la récupération du jour et la durée dormie de la nuit principale.

   LA RÈGLE (`flSeuilAppriseCalcul`, pure — banc : tests/test-seuil-appris.js) :
     · moins de 21 nuits lisibles → pas de seuil (`manque` dit combien il en faut encore) ;
     · fenêtres de 60 min de large, tous les 15 min, de 5 h à 10 h de sommeil ; une fenêtre ne
       compte qu'avec 5 nuits au moins ; sa valeur est la MÉDIANE des récups ;
     · l'écart entre la meilleure et la moins bonne fenêtre est sous 5 points (ou aucune fenêtre)
       → PLAT : la durée ne prédit pas la récup ; seuil = la durée habituelle (médiane) ;
     · sinon PLATEAU : la première fenêtre (la plus courte) à 3 points de la meilleure ; seuil =
       son centre. Une redescente après (les nuits très longues sont souvent des nuits malades)
       ne compte donc pas ;
     · arrondi au quart d'heure inférieur, borné entre 6 h 30 et 8 h 30.
   La lecture (`flSeuilSommeilAppris`) ne fait QUE lire : jamais `flRecovLu` (il écrit), jamais
   `wSaveK`. Le natif la demande à l'ouverture des alarmes et une fois par jour (PontSommeil). */
window.flSeuilAppriseCalcul=function(points){
 var NUITS_MIN=21, LARGE=60, PAS=15, DEBUT=300, FIN=600, PAR_FENETRE=5, PLAT=5, PROCHE=3,
     BAS=390, HAUT=510;
 function mediane(t){var s=t.slice().sort(function(a,b){return a-b;}),n=s.length;
  return n?((n%2)?s[n>>1]:(s[n/2-1]+s[n/2])/2):null;}
 var p=(Array.isArray(points)?points:[]).filter(function(x){
  return x&&typeof x.dormi==='number'&&isFinite(x.dormi)&&x.dormi>0&&x.dormi<=1440&&
         typeof x.recup==='number'&&isFinite(x.recup)&&x.recup>=0&&x.recup<=100;});
 var n=p.length;
 if(n<NUITS_MIN)return {min:null,nuits:n,manque:NUITS_MIN-n};
 /* 14 nov. 2026 (soir) — SEULES COMPTENT LES DURÉES QU'IL DORT VRAIMENT. Sur 548 nuits
    WHOOP de Dino la règle rendait 8 h 30 : douze nuits très longues, récup 76, faisaient
    à elles seules la « meilleure » fenêtre — des lendemains de repos, pas un besoin.
    Une fenêtre ne concourt donc que si son centre tombe entre le 10e et le 90e centile
    de SES durées : le plateau se cherche là où il dort, pas dans ses exceptions. */
 var durees=p.map(function(x){return x.dormi;}).sort(function(a,b){return a-b;});
 var q10=durees[Math.floor(0.10*(n-1))], q90=durees[Math.ceil(0.90*(n-1))];
 var f=[];
 for(var s=DEBUT;s+LARGE<=FIN;s+=PAS){
  if(s+LARGE/2<q10||s+LARGE/2>q90)continue;
  var r=p.filter(function(x){return x.dormi>=s&&x.dormi<s+LARGE;}).map(function(x){return x.recup;});
  if(r.length>=PAR_FENETRE)f.push({debut:s,med:mediane(r),n:r.length});
 }
 var seuil, plat;
 var meilleure=f.length?Math.max.apply(null,f.map(function(x){return x.med;})):null;
 var pire=f.length?Math.min.apply(null,f.map(function(x){return x.med;})):null;
 if(!f.length||meilleure-pire<PLAT){
  plat=true; seuil=mediane(p.map(function(x){return x.dormi;}));
 }else{
  plat=false;
  for(var i=0;i<f.length;i++){if(f[i].med>=meilleure-PROCHE){seuil=f[i].debut+LARGE/2;break;}}
 }
 seuil=Math.floor(seuil/PAS)*PAS;
 seuil=Math.max(BAS,Math.min(HAUT,seuil));
 return {min:seuil,nuits:n,plat:plat};
};
window.flSeuilSommeilAppris=function(){
 try{
  var pts=[];
  for(var i=0;i<120;i++){
   var K=tk(-i);
   var rv=DB.get('recov_'+K,null);
   if(rv&&typeof rv==='object')rv=rv.score;
   rv=(rv==null||rv==='')?NaN:+rv;
   if(!isFinite(rv))continue;
   if(typeof flNuitSansMesure==='function'&&flNuitSansMesure(K))continue;
   var w=(typeof watchOf==='function')?watchOf(K):DB.get('watch_'+K,null);
   var nt=w&&w.night;
   var d=nt?+nt.sleepMin:NaN;     /* la durée DORMIE de « Ma nuit » (sleepMin = profond + léger + paradoxal), pas le temps au lit */
   if(!isFinite(d)||d<180)continue;   /* la nuit principale : trois heures au moins, jamais une sieste */
   pts.push({dormi:d,recup:rv});
  }
  return window.flSeuilAppriseCalcul(pts);
 }catch(e){return {min:null,nuits:0,manque:21};}
};

/* ═══ 23 nov. 2026 — LE PREMIER DESSIN DE LA NUIT : CES DEUX FONCTIONS QUITTENT flint-sommeil.js ═════
   Dino, 14 h 40, capture à l'appui : en rouvrant FLINT après une pose, « Ma nuit » s'est d'abord
   dessinée sans ses stades — la courbe seule et « Les stades de cette nuit n'ont pas été mesurés. » —
   puis, quelques secondes après, la vraie page. « J'ai l'impression que c'est des pages codées sur
   des pages. » Journal du téléphone : 14:37:07 « sommeil ← posée · durée 8h18 · aucun stade »,
   14:37:15 « stades 498min · segments 52 » ; même forme le matin à 10:03:12.
   LA CAUSE, MONTRÉE AU TRACEUR (démarrage à froid, `moteur-monte.js` avec `sansSommeil`) :
   flint-sommeil.js n'est pas un <script> de la page ; le natif l'injecte APRÈS son chargement
   (`injecterMoteurSommeil`, PontSommeil.swift). `flSommeilData` répond avant : il a la nuit
   publiée, ses titres et ses 52 segments, mais `stades` y vaut `null` tant que `flStadesNuit` —
   qui vivait dans le fichier injecté — n'existe pas. Le natif lit « aucun stade » comme « pas
   mesurés » et monte l'autre page. Sur les 25 fonctions `fl…Data`, c'est la SEULE différence
   entre avant et après l'injection (flSommeilData et flNuitData, champ `stades`).
   LA CORRECTION : les deux fonctions vivent ici, dans un fichier que la page charge elle-même
   (<script src> d'index.html) ; la première réponse est donc complète. Leur texte n'a pas
   changé. Banc : tests/test-nuit-demarrage-froid.js (toute sortie `fl…Data` identique avant et
   après l'injection) ; tests/test-stades-parts.js les découpe maintenant d'ici. */

/* ═══ v2281 — LA STRUCTURE DE LA NUIT, ET SON DÉNOMINATEUR ══════════════════

   Les quatre lignes de la fiche — PROFOND, LÉGER, PARADOXAL, RÉVEIL — avec
   leur part, leur durée, et la plage habituelle de la part. Elles viennent
   d'index.html (`flSommeilData`), qui touchait son plafond de découpage :
   c'est du métier, il va dans un fichier de métier.

   ── CE QUI EST CORRIGÉ EN PASSANT, ET C'EST LA RAISON DU DÉPLACEMENT ──────

   Le dénominateur était `asleep`, le temps de SOMMEIL. Or le réveil n'est pas
   une part du sommeil : profond + léger + paradoxal font déjà 100 % à eux
   trois, et diviser le réveil par la même chose l'ajoute PAR-DESSUS. Relevé
   sur la nuit du 9 septembre de Félix — 73 + 201 + 85 min de sommeil, 13 min
   d'éveil : 20 + 56 + 24 + 4 = 104 %. Un écran qui affiche 104 % ne se
   discute pas.

   LE DÉNOMINATEUR EST DONC LE TOTAL DES QUATRE LIGNES. C'est le seul qui
   fasse d'elles une partition : chacune est sa part de ce qui est montré, et
   la somme fait cent. Ce n'est pas `timeInBed`, et c'est délibéré — un total
   lu ailleurs peut ne pas coïncider avec ce que les quatre lignes affichent,
   et la somme repartirait à côté de cent sans qu'on sache pourquoi.

   IL RESTE JUSTE QUAND LE SCEAU ET LE MOTEUR DIVERGENT, et c'est le second
   gain. Le 8 septembre, `flNuitServir` a greffé un total scellé de 288 min
   sur des stades qui en font 409 : l'ancien calcul rendait 34 + 69 + 39 + 8
   = 150 %. Avec le total des quatre, les barres décrivent une nuit COHÉRENTE
   même quand l'en-tête ment. Ça ne corrige pas la greffe — c'est le défaut 1
   de CHANTIER-DINO-8-SEPTEMBRE.md, et il reste entier — mais ça l'empêche de
   produire un écran absurde.

   ── CE QUI NE CHANGE PAS ──────────────────────────────────────────────────

   LA PART, PAS LA DURÉE, pour la plage habituelle. Une nuit courte et une
   nuit longue peuvent avoir la même structure ; c'est la structure qu'on
   compare. Un profond à 20 % reste un profond à 20 %, qu'on ait dormi cinq
   heures ou huit. Dino a choisi les pourcents et non les minutes, et il a
   raison : c'est déjà l'unité que la bande encode.

   LA PLAGE SUIT LE MÊME DÉNOMINATEUR QUE LA PART. Sans ça la bande et ses
   repères parleraient deux langues, et le repère tomberait à côté de la
   barre qu'il est censé situer.

   On relit `sleepNight` des nuits passées : la même source que la nuit
   affichée, jamais un cache d'affichage. Une nuit sans stades mesurés ne rend
   rien — c'est le cas des nuits de Dino, et c'est ce qui doit arriver.

   ⚠ LIAISONS. `tk` se lit NU, jamais par `window` (garde-liaisons, et la
   leçon de marche.js). `sleepNight` et `flPlageHabituelle` se testent par
   `typeof` avant d'être appelés : une liaison de fichier ne se suppose pas.
   Le banc : tests/test-stades-parts.js. */
window.flStadesTotal = function (x) {
  if (!x) return 0;
  return (+x.deep || 0) + (+x.light || 0) + (+x.rem || 0) + (+x.awake || 0);
};

window.flStadesNuit = function (n) {
  if (!n) return null;
  function hm(m) {
    if (m == null) return null;
    m = Math.round(m);
    return Math.floor(m / 60) + 'h' + String(m % 60).padStart(2, '0');
  }
  /* La part d'un stade sur une nuit passée, pour la plage habituelle. */
  function part(cle) {
    return function (off) {
      try {
        if (typeof sleepNight !== 'function') return null;
        var nn = sleepNight(tk(off));
        if (!nn || !nn.asleep) return null;
        if (!nn.stages || !nn.stages.length) return null;
        var v = nn[cle]; if (v == null) return null;
        var T = window.flStadesTotal(nn); if (!T) return null;
        return v / T * 100;
      } catch (e) { return null; }
    };
  }
  var TOT = window.flStadesTotal(n);
  var _dec = Math.min(0, (window.flDayOff | 0));
  function faire(nom, cle, minutes) {
    var o = { nom: nom, pct: (TOT ? Math.round((minutes || 0) / TOT * 100) : 0),
              duree: hm(minutes || 0) };
    var p = null;
    try {
      if (typeof window.flPlageHabituelle === 'function')
        p = window.flPlageHabituelle('stade:' + cle, part(cle), _dec);
    } catch (e) {}
    /* Les deux bornes ou aucune : une borne seule ne décrit pas un intervalle,
       et le front l'ignorerait. On arrondit comme `pct`. */
    if (p) { o.plageMin = Math.round(p.min); o.plageMax = Math.round(p.max); }
    return o;
  }
  return [faire('PROFOND', 'deep', n.deep),
          faire('LÉGER', 'light', n.light),
          faire('PARADOXAL', 'rem', n.rem),
          faire('RÉVEIL', 'awake', n.awake)];
};
