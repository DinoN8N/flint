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
