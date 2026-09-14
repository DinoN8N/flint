/* Le metier de ce fichier : LA FREQUENCE RESPIRATOIRE, derivee des intervalles
   entre battements (arythmie sinusale respiratoire). Deux fonctions, exposees
   par `window.*` : `flRespirationBloc` (un bloc de battements -> une frequence)
   et `flRespirationNuit` (la mediane de la nuit). Liaisons de script : `DB` et
   `tk` ne sont PAS lus ici — la nuit arrive par `watchOf`, qui vit dans
   index.html et se lit NU (jamais window.watchOf — garde-liaisons), comme
   flint-menage.js le fait pour DB et tk. Les bancs : tests/test-respiration.js
   (qui charge ce fichier en entier) et outils/rejeu-respiration.js pour la
   chaine complete, de la base reelle jusqu au champ que l ecran lit.

   POURQUOI UN FICHIER A PART. Le garde du decoupage l a dit mot pour mot en
   refusant la v2051 : « le code neuf a un metier : il va dans un fichier
   flint-<metier>.js, pas ici ». index.html passait 37 533 lignes pour un
   plafond a 37 500. Le garde avait raison sur le fond avant de l avoir sur le
   compte : ces deux fonctions ne partagent rien avec le reste du moteur, elles
   ne lisent qu un tableau d intervalles et une fenetre de nuit. */

/* ═══════════════════════════════════════════════════════════════════════════
   v2048 — LA FRÉQUENCE RESPIRATOIRE, DÉRIVÉE DES BATTEMENTS
   ═══════════════════════════════════════════════════════════════════════════

   Dino, en ouvrant ce chantier : « je ne suis pas sûr que la montre capte ça,
   mais vas-y. » IL A RAISON, ET C'EST LE POINT DE DÉPART : le bracelet n'a
   aucun capteur de respiration, et il n'en aura jamais. `resp` valait donc
   `null` EN DUR depuis l'origine — la ligne existait à l'écran, le calcul non.

   ON NE LA MESURE PAS, ON LA LIT DANS LE CŒUR. Le rythme cardiaque est modulé
   par la respiration : les intervalles entre battements raccourcissent à
   l'inspiration et s'allongent à l'expiration. C'est l'arythmie sinusale
   respiratoire, et elle imprime dans la suite des intervalles une oscillation
   À LA FRÉQUENCE DU SOUFFLE. WHOOP n'a pas de capteur de respiration non
   plus ; ils la dérivent de la même façon.

   ─── CE QU'ON A VRAIMENT, MESURÉ SUR LA BASE DE DINO ──────────────────────

   `rrH` range les battements par blocs. Dans la fenêtre de sommeil, sur
   onze nuits réelles :

       70 à 99 blocs par nuit · 200 intervalles par bloc · ~230 s de
       battements CONTINUS par bloc · un bloc toutes les 5 minutes

   Quatre minutes de suite, c'est cinquante cycles de souffle : largement de
   quoi résoudre une oscillation entre 0,13 et 0,45 Hz. La matière est là ;
   personne n'était allé la chercher.

   ─── COMMENT ─────────────────────────────────────────────────────────────

   Par bloc : bornes physiologiques (300–2000 ms), refus si plus de 10 % des
   intervalles sautent de plus de 20 % (ectopiques, mouvement), tachogramme
   rééchantillonné à 4 Hz, moyenne ôtée, fenêtre de Hann, et le pic du spectre
   dans la BANDE HF DE LA TASK FORCE (0,15–0,40 Hz, soit 9 à 24 par minute).
   La nuit rend la MÉDIANE des blocs retenus.

   ⚠️ LA MOYENNE ÔTÉE SUFFIT, ET C'EST MESURÉ — pas supposé. Retirer une
   droite ou une parabole au lieu de la moyenne donne EXACTEMENT les mêmes
   onze médianes, au dixième près (écart max 0,00 /min), et exactement les
   mêmes blocs retenus. On garde donc le plus simple des trois : le code qu'on
   n'écrit pas ne se trompe pas.

   ─── LE SEUIL DE DOMINANCE VIENT D'UN TÉMOIN, PAS D'UN AVIS ───────────────

   Un spectre a toujours un maximum quelque part : un pic n'est une mesure que
   s'il domine. Restait à savoir de combien. TÉMOIN : les mêmes blocs, les
   intervalles MÉLANGÉS — même distribution, structure temporelle détruite,
   donc aucune respiration à trouver. Sur 575 blocs témoins :

       pic / médiane de la bande     réels : médiane 64,7    témoin : p95 17,3

   Le seuil est posé à 18, juste au-dessus du p95 du témoin. Vérification
   après coup : 6 % des blocs mélangés passent encore (le 5 % attendu, aux
   arrondis près) contre 89 % des blocs réels. MON PREMIER SEUIL ÉTAIT 2, ET
   IL ÉTAIT RIDICULE : 76 % du bruit passait, et rendait 10,5 /min avec
   aplomb. C'est le témoin qui l'a dit, pas moi.

   ─── VINGT BLOCS, ET LE CROISEMENT EXACT ──────────────────────────────────

   En sous-échantillonnant les onze nuits, l'erreur d'échantillonnage de la
   médiane vaut :

       n = 10 -> 0,650    n = 15 -> 0,507    n = 20 -> 0,369    n = 30 -> 0,238

   et la variation naturelle d'une nuit à l'autre vaut 0,432. LE CROISEMENT
   EST À 20 : en dessous, on lirait surtout notre propre bruit d'échantillon.
   Même raisonnement qu'à la v1781 pour les douze mesures de SpO₂.

   ─── ONZE NUITS APPARIÉES AVEC WHOOP (chiffres donnés par Dino) ───────────

   La v2048 n'avait qu'UNE paire et le disait. Dino a donné deux séries, du 15
   au 30 août ; avec l'export CSV pour le 8, onze de nos nuits sont jugées.

       nuit     FLINT  WHOOP  écart      nuit     FLINT  WHOOP  écart
       8 août    12,7   13,3   −0,6      24 août   14,6   14,8   −0,2
       20 août   13,2   13,9   −0,7      25 août   13,2   13,9   −0,7
       21 août   13,9   14,5   −0,6      26 août   14,0   14,2   −0,2
       22 août   13,3   13,9   −0,6      27 août   13,8   14,1   −0,3
       23 août   13,4   14,1   −0,7      28 août   13,3   13,9   −0,6
                                         29 août   13,4   13,9   −0,5

       11 nuits · biais −0,52 · σ des écarts 0,18 · écart max 0,7 · r = 0,946

   ─── ET LE DÉCOUPAGE QUI COMPTE : DEDANS / DEHORS ─────────────────────────

   Six de ces nuits (24–29) sont celles qui ont SERVI à diagnostiquer l'erreur
   de bande. Les juger avec elles serait corriger sa propre copie. Les cinq
   autres (8, 20, 21, 22, 23) n'ont influencé aucun choix :

       nuits ayant servi au diagnostic   6   biais −0,42   σ 0,20   r 0,96
       nuits INDÉPENDANTES               5   biais −0,64   σ 0,05   r 0,99
       toutes                           11   biais −0,52   σ 0,18   r 0,95

   ⚠️ LE −0,42 DE LA v2051 ÉTAIT LÉGÈREMENT FLATTEUR, et c'est exactement ce
   qu'un découpage sert à débusquer : mesuré hors échantillon, l'écart est plus
   grand (−0,64). Mais σ 0,05 sur cinq nuits jamais utilisées : le décalage est
   une CONSTANTE, pas une dérive. C'est la meilleure nouvelle du lot.

   ─── LA CONVENTION DE DATE EST VÉRIFIÉE PAR LES DONNÉES ───────────────────

   Trois nuits (15, 16, 17 août) sont couvertes par les DEUX sources — la
   dictée de Dino et l'export CSV. Elles disent 14,0 / 14,0 / 13,8 des deux
   côtés, écart 0,0. La dictée et l'export parlent donc de la même nuit, et
   `mesure-respiration-rr.js` signale désormais tout désaccord entre sources au
   lieu de l'écraser. S'y ajoute le contrôle d'origine : apparier nos nuits
   avec la VEILLE de WHOOP donne r négatif. C'est le jour du RÉVEIL, des deux
   côtés, et ce n'est plus une supposition.

   ─── D'OÙ VIENT LE −0,52 ? JE NE SAIS PAS, ET J'AI CHERCHÉ ────────────────

   Deux pistes ouvertes, deux pistes fermées :

   · UN EFFET DE STADE ? Non. Découpage des 668 blocs par stade (les `stages`
     du moteur) : éveil 14,0 · profond 13,8 · léger 13,3 · paradoxal 13,3.
     Aucun agrégat par stade ne remonte à 14,0 sans choisir ses stades — même
     l'éveil, le plus rapide, n'y arrive qu'à peine. Ce n'est pas une histoire
     de pondération.

   · DES BLOCS COLLÉS AU PLANCHER DE LA BANDE ? Non plus. Entre 2 et 5 % des
     blocs seulement tombent sous 9,6 /min, et dans TOUS les stades pareil.
     Le plancher ne tire pas la médiane.

   Le décalage reste donc inexpliqué, et il est écrit ici comme tel plutôt que
   masqué par une constante. ⚠️ IL N'EST PAS CORRIGÉ ET NE LE SERA PAS SUR CES
   DONNÉES : ajouter 0,5 pour tomber sur WHOOP, ce serait régler l'appareil sur
   une autre application à partir des nuits d'UNE personne — précisément ce que
   Dino a interdit au chantier récup (« ne modifie surtout pas artificiellement
   les formules ou les valeurs pour ressembler à une autre application »). Et
   WHOOP n'est pas un étalon : c'est un estimateur dérivé comme le nôtre. Un
   demi-cycle par minute entre deux estimateurs n'a pas de propriétaire.

   CE QUI LE TRANCHERAIT : les mêmes nuits chez plusieurs personnes. Si le
   −0,5 s'y retrouve, c'est une propriété de la méthode et il devient légitime
   de l'écrire dans le calcul, avec sa mesure. S'il varie d'une personne à
   l'autre, il n'y avait rien à corriger.

   CE QUI COMPTE DÉJÀ, EN ATTENDANT : σ 0,18 et r 0,95. Un écart quasi constant
   veut dire qu'on suit la MÊME grandeur — les variations d'une nuit à l'autre
   sont les leurs. C'est exactement ce qui manquait à la SpO₂ (v2046), où la
   dynamique était morte : là-bas nous ne mesurions rien, ici nous mesurons la
   bonne chose avec un décalage.

   La nuit du 30 août refuse : zéro bloc dans la fenêtre de sommeil. Ce n'est
   pas une panne — la base a été rapatriée à 9 h, le bracelet n'avait pas
   encore livré les battements de la nuit. Un refus qui dit la vérité.

   ⚠️ CE CODE-CI ET LE PROTOTYPE NE DONNENT PAS LE MÊME CHIFFRE AU CENTIÈME,
   et il faut le dire plutôt que de le laisser découvrir. Sur les onze nuits,
   l'écart va de 0,0 à 0,15 /min : la grille de fréquences ne tombe pas
   exactement au même endroit (une case de différence sur la longueur
   rééchantillonnée), donc quelques blocs pile au seuil basculent d'un côté ou
   de l'autre. C'est SOUS l'erreur d'échantillonnage à vingt blocs (0,37) et
   sous la variation d'une nuit à l'autre (0,43) : les deux implémentations
   s'accordent à l'intérieur de la résolution de la mesure elle-même. Elles ne
   s'accorderaient au centième que si on figeait la grille des deux côtés, ce
   qui donnerait une fausse impression de précision.

   ─── CE QUE ÇA CHANGE AU SCORE, ET POURQUOI ON NE LE BLOQUE PAS ───────────

   `recovery` porte déjà un facteur respiration : `zP=z(t.resp,bP)` avec
   `bP=baseStat('resp',60)`. Il pesait zéro parce que `resp` était nul. Il ne
   s'allumera pas d'un coup pour autant : `z` commence par
   `if(!(b&&v!=null))return 0`, donc il faut d'abord une NORMALE personnelle.
   C'est la même porte que pour la VFC et la FC de repos, et c'est la bonne :
   un signal entre dans le score quand on sait à quoi le comparer, pas avant.
*/
/* ═══ 7 sept. 2026 — MEMOIRE PAR NUIT PASSEE (flRespirationNuit). 464 appels par ouverture, 54 ms.
   Meme sceau que flFcRepos (v1957) : les compteurs d ecritures des familles lues ; une
   ecriture les jette tous. Le calcul d origine est INTACT dans `_calcul`, a l interieur
   de la fonction (les bancs prelevent par le nom). Sans DB.tampon, memoire inactive. */
window._flRespirationNuitMemo={__sceau:null};
window.flRespirationNuit=function(K){
 var _calcul=function(K){try{
 var memo=window._flRespMemo=window._flRespMemo||{};
 var w=watchOf(K); if(!w)return null;
 var rh=w.rrH||[]; if(!rh.length)return null;
 var n=w.night||null;
 if(!n||n.sleepStart==null||n.sleepEnd==null)return null;
 var cle=K+'|'+rh.length+'|'+n.sleepStart+'|'+n.sleepEnd;
 if(memo[cle])return memo[cle];
 var a=new Date(n.sleepStart), b=new Date(n.sleepEnd);
 var am=a.getHours()*60+a.getMinutes(), bm=b.getHours()*60+b.getMinutes();
 function dans(m){return (am<=bm)?(m>=am&&m<=bm):(m>=am||m<=bm);}
 var vals=[], refuses=0;
 for(var q=0;q<rh.length;q++){
  var e=rh[q];
  if(!e||e.length<2||!dans(e[0])||!Array.isArray(e[1]))continue;
  var f=window.flRespirationBloc(e[1]);
  if(f==null){refuses++;continue;}
  vals.push(f);
 }
 /* v2051 — 12, re-dérivé sur la bande HF. L'erreur d'échantillonnage de la
    médiane passe sous la variation naturelle d'une nuit à l'autre (0,448)
    à n = 10 (0,444) — mais de justesse, à un pour cent près : c'est la
    version flatteuse. À 12 elle vaut 0,407, franchement dessous. Même
    arbitrage qu'à la v1781 pour les mesures de SpO₂, et le même chiffre.
    (C'était 20 en v2048, dérivé sur la bande large où l'estimateur était plus
    bruyant. La bande propre coûte moins de blocs pour la même certitude.) */
 if(vals.length<12)
  return (memo[cle]={ok:false, blocs:vals.length, refuses:refuses});
 vals.sort(function(x,y){return x-y;});
 var med=vals.length%2?vals[vals.length>>1]:(vals[vals.length/2-1]+vals[vals.length/2])/2;
 return (memo[cle]={ok:true, resp:Math.round(med*10)/10,
                    blocs:vals.length, refuses:refuses,
                    etendue:[Math.round(vals[0]*10)/10,
                             Math.round(vals[vals.length-1]*10)/10]});
}catch(e){return null;}};
 try{
  var _auj=(typeof tk==='function')?tk():null;
  if(!K||K===_auj)return _calcul(K);
  var _sc=null; try{_sc=DB.tampon('sensor_')+'|'+DB.tampon('watch_')+'|'+DB.tampon('sessions_')+'|'+DB.tampon('hrfine_')+'|'+DB.tampon('recov');}catch(e){_sc=null;}
  if(_sc==null)return _calcul(K);
  var _m=window._flRespirationNuitMemo; if(!_m||_m.__sceau!==_sc){_m=window._flRespirationNuitMemo={__sceau:null};_m.__sceau=_sc;}
  if(Object.prototype.hasOwnProperty.call(_m,K)){var _g=_m[K];return (_g&&typeof _g==='object')?JSON.parse(JSON.stringify(_g)):_g;}
  var _r=_calcul(K);
  _m[K]=(_r&&typeof _r==='object')?JSON.parse(JSON.stringify(_r)):_r;
  return _r;
 }catch(e){return _calcul(K);}
};

/* Un bloc de battements -> une fréquence de souffle, ou null. Exposée à part
   pour que le banc puisse l'attaquer seule : c'est ELLE qui porte les quatre
   constantes, et un banc qui ne peut pas les viser ne les protège pas. */
window.flRespirationBloc=function(rr){
 if(!rr||!rr.length)return null;
 var v=[],i;
 for(i=0;i<rr.length;i++)if(rr[i]>=300&&rr[i]<=2000)v.push(rr[i]);
 if(v.length<40)return null;
 var aberrants=0;
 for(i=1;i<v.length;i++)if(Math.abs(v[i]-v[i-1])>0.20*v[i-1])aberrants++;
 if(aberrants>0.10*(v.length-1))return null;
 /* le tachogramme : abscisse = l'instant du battement, ordonnée = l'intervalle */
 var t=[],acc=0;
 for(i=0;i<v.length;i++){acc+=v[i]/1000;t.push(acc);}
 var duree=t[t.length-1]-t[0];
 if(duree<60)return null;                 /* moins d'une minute : rien à résoudre */
 var FS=4, N=Math.floor(duree*FS);
 if(N<32)return null;
 var x=new Float64Array(N), j=0, moy=0;
 for(i=0;i<N;i++){
  var tt=t[0]+i/FS;
  while(j<v.length-2&&t[j+1]<tt)j++;
  var d=t[j+1]-t[j];
  x[i]=(d>0)?(v[j]+(v[j+1]-v[j])*(tt-t[j])/d):v[j];
  moy+=x[i];
 }
 moy/=N;
 for(i=0;i<N;i++)x[i]=(x[i]-moy)*(0.5-0.5*Math.cos(2*Math.PI*i/(N-1)));
 /* le spectre, calculé SEULEMENT dans la bande : le reste ne sert à rien et
    une transformée complète coûterait dix fois plus pour la jeter. */
 /* ═══ v2051 — LA BANDE EST CELLE DE LA TASK FORCE, PAS LA MIENNE ═══════
    Elle allait de 0,13 à 0,45 Hz, et je l'avais posée « large pour ne rien
    manquer ». C'était l'erreur : 0,13 Hz tombe DANS la bande LF (0,04–0,15),
    celle des ondes de Mayer et du baroréflexe — pas de la respiration. On
    allait donc chercher le souffle dans une région où il n'est pas, et où
    quelque chose d'autre oscille fort. Les blocs contaminés ressortaient à
    8–9 /min, la médiane de la nuit était tirée vers le bas.
    La bande HF de la Task Force (1996) est 0,15–0,40 Hz — 9 à 24 par minute —
    et c'est LA définition de la composante respiratoire. Ce fichier cite déjà
    ce rapport pour la règle de Malik : on prend la bande du même texte.
    CE QUE ÇA CHANGE, MESURÉ sur les six nuits appariées avec WHOOP :
        bande        biais    σ des écarts    r      faux positifs témoin
        0,13–0,45    −0,66        0,28       0,88          2 %
        0,15–0,40    −0,47        0,21       0,88          5 %   ← retenue
    Le biais baisse d'un tiers, la dispersion d'un quart. ⚠️ ON NE L'A PAS
    CHOISIE POUR ÇA : 0,16 et 0,17 font marginalement mieux encore, et on ne
    les prend pas — elles n'ont aucune référence derrière elles, ce serait
    régler l'appareil sur WHOOP. 0,15–0,40 est publiée, et elle tombe juste. */
 var pas=FS/N, k0=Math.ceil(0.15/pas), k1=Math.floor(0.40/pas);
 if(k1-k0<4)return null;
 var P=[], meilleur=-1, kMax=k0;
 for(var k=k0;k<=k1;k++){
  var re=0,im=0, w2=2*Math.PI*k/N;
  for(i=0;i<N;i++){re+=x[i]*Math.cos(w2*i);im-=x[i]*Math.sin(w2*i);}
  var p=re*re+im*im;
  P.push(p);
  if(p>meilleur){meilleur=p;kMax=k;}
 }
 var tri=P.slice().sort(function(p1,p2){return p1-p2;});
 var medBande=tri[tri.length>>1];
 /* v2051 — 14, ET LA RÈGLE N'A PAS CHANGÉ, seulement la bande. Le seuil vaut
    le p95 du témoin mélangé, pour ~5 % de faux positifs : il valait 17,3 sur
    la bande large, il vaut 14,04 sur la bande HF (577 blocs témoins). À 14 :
    5,2 % du témoin passe, 88 % du réel.
    ⚠️ LE RÉSULTAT NE TIENT PAS À CE CHIFFRE, et c'est ce qui rassure le plus.
    De 12 à 24, le biais contre WHOOP va de −0,50 à −0,40 et la dispersion de
    0,18 à 0,23 : la mesure ne repose pas sur une constante heureuse. */
 if(!(medBande>0)||meilleur<14*medBande)return null;
 /* LE PIC TOMBE ENTRE DEUX CASES, et la case vaut 0,26 /min ici : rendre le
    centre de la case, c'est arrondir la mesure à un pas qui n'a rien de
    physiologique. On interpole donc le sommet sur les trois points voisins
    (parabole), ce qui est la façon standard de lire un maximum spectral.
    Aux deux bords de la bande il n'y a pas de voisin des deux côtés : on
    garde la case, plutôt que d'extrapoler vers une fréquence qu'on n'a pas
    regardée. */
 var idx=kMax-k0, fk=kMax;
 if(idx>0&&idx<P.length-1){
  var y0=P[idx-1], y1=P[idx], y2=P[idx+1], den=y0-2*y1+y2;
  if(den!==0){
   var dd=0.5*(y0-y2)/den;
   if(dd>-1&&dd<1)fk=kMax+dd;
  }
 }
 return fk*pas*60;
};
