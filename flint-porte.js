/* Le metier de ce fichier : LE PORT DU BRACELET — le seul signal natif qui
   existe (les bits contact peau du protocole cardiaque BLE), note minute par
   minute, et sa lecture par nuit. Liaisons de script : `DB`, `tk`, `wGet` et
   `wSaveK` se lisent NUS (jamais window.* — garde-liaisons), comme
   flint-menage.js. Le banc : tests/test-porte.js, qui charge ce fichier en
   entier. Le routeur d'index.html appelle `flNoterSansContact` sur le status
   `nocontact` ; tout le reste vit ici.

   ═══ v2056 — LE CONTACT PEAU CESSAIT D'ÊTRE JETÉ ═══════════════════════════

   Le protocole cardiaque BLE standard porte deux bits dans CHAQUE trame : « la
   détection de contact existe » et « la peau est détectée ». Le pont natif les
   lit depuis toujours (FlintTestBand, flags 0x04/0x02) et émet
   `status: nocontact` quand la peau manque — et le moteur n'avait AUCUNE
   branche pour le recevoir : le seul signal NATIF de non-port mourait dans un
   journal, exactement comme le journal Bluetooth avant la v857.

   ON STOCKE LA MINUTE, RIEN DE PLUS. Pas de verdict, pas de fenêtre
   reconstruite, pas d'heuristique : le fait brut « à cette minute, trame
   cardiaque sans contact peau », horodaté, dédupliqué, dans la journée où il
   s'est produit. Les lecteurs décideront.

   ⚠️⚠️ ET SUR LE BRACELET DE DINO, IL NE VIT PAS DU TOUT (relevé le 31 août
   2026). Les bits contact voyagent dans la trame `0x2A37` du service cardiaque
   standard `180D`. Le dump GATT du dépôt dit `services de JCV8B ABFA63 :
   [FFF0,190E]` — pas de `180D`, donc aucune trame `0x2A37`, donc aucun bit :
   `flNoterSansContact` n'est JAMAIS appelée sur ce matériel. Ce n'est pas une
   raison de la retirer (toute montre exposant `180D` la fera vivre), c'en est
   une de ne rien bâtir dessus. Le détail et la façon de le revérifier sont
   dans INVENTAIRE-CAPTEURS.md.

   ⚠️ ET MÊME LÀ, CE SIGNAL NE VIT QU'EN DIRECT. Les trames à flags n'existent que pendant
   le streaming, app ouverte : la nuit, app fermée, il n'y a RIEN ici. La
   détection du non-port NOCTURNE reste un problème ouvert et documenté
   (INVENTAIRE-CAPTEURS.md) : sur 31 jours de la base de Dino, ZÉRO épisode
   réel de non-port — et 7,8 % des tranches PORTÉES passent sous 31 °C, donc un
   seuil de température inventé accuserait une tranche sur treize. Aucune
   heuristique n'est calibrable sans un exemple vrai ; on refuse d'en inventer
   une. Le protocole de calibration est écrit dans l'inventaire : un soir,
   bracelet posé deux heures en notant l'heure, et le seuil sera MESURÉ. */

window.flNoterSansContact=function(){try{
 var d=new Date(), mn=d.getHours()*60+d.getMinutes();
 var K=tk(), w=wGet(K);
 w.sansContact=w.sansContact||[];
 if(w.sansContact.indexOf(mn)<0){w.sansContact.push(mn);wSaveK(K);}
 return true;
}catch(e){return false;}};

/* LA PART DE LA NUIT SANS CONTACT PEAU, quand on la connaît.
   Rend null si la journée ne porte AUCUNE minute `sansContact` — ce qui est
   aujourd'hui le cas normal (le signal ne vit qu'en direct, cf. le pavé
   ci-dessus). Un null dit « on ne sait pas », JAMAIS « porté » : c'est la
   règle du cahier de Dino du 30 août — UNKNOWN ne devient jamais NORMAL. */
window.flPorteNuit=function(off){try{
 var K=tk(Math.min(0,off|0));
 var w=DB.get('watch_'+K,null);
 if(!w||!w.sansContact||!w.sansContact.length)return null;
 var n=w.night;
 if(!n||n.bedMin==null||n.wakeMin==null)return null;
 var b=n.bedMin,r=n.wakeMin;
 var duree=(r>=b)?(r-b):(1440-b+r);
 if(duree<=0)return null;
 var dedans=w.sansContact.filter(function(m){
   return (b<=r)?(m>=b&&m<=r):(m>=b||m<=r);
 }).length;
 return {minutesSansContact:dedans, dureeNuit:duree,
         part:Math.round(100*dedans/duree)/100};
}catch(e){return null;}};


/* ═══ v2057 — LE SILENCE DE LA MONTRE, ET CE QU ON A LE DROIT D EN DIRE ══════

   LE CAS. 30 aout 2026 : Sylvie retire son bracelet pour dormir. Aucun sommeil
   n est mesure, donc aucune frontiere ne tombe, et sa journee du 29 est encore
   ouverte le 30 a 14h51 — vingt-huit heures, deux jours de calories
   additionnes (3 362 kcal), l effort sature a 20/20, et le steak de la veille
   dans la frise d aujourd hui. Dino : « quand pas de bracelet, juste laisser un
   vide ».

   POURQUOI CE DEFAUT N EXISTE PAS CHEZ DINO. La regle « une journee va d un
   sommeil au suivant » (v1471) est nee de SA nuit blanche du 13 aout, bracelet
   au poignet. Elle repose sur une hypothese que personne n avait ecrite : une
   nuit finit toujours par etre mesuree. C est vrai pour qui porte son bracelet
   vingt-quatre heures sur vingt-quatre. C est faux pour tous les autres — et
   c est le premier ecran de l application qui se trompe.

   ⚠️ CE QUI SUIT NE DETECTE PAS LE NON-PORT, ET NE DOIT PAS SE LIRE AINSI.
   Le pave du haut de ce fichier a tranche la question et l inventaire la
   repete : le seul signal natif de port ne vit qu en direct, app ouverte, donc
   pas la nuit ; et aucune heuristique nocturne n est calibrable tant qu on n a
   pas un exemple positif (INVENTAIRE-CAPTEURS.md, « on refuse de l inventer »).
   Rien ici ne contredit ce refus, parce que rien ici ne prononce le mot
   NON-PORTE : on constate un SILENCE, et devant un silence on s ABSTIENT.
   « Je ne sais pas si tu as dormi, donc je ne prolonge pas ta journee » est un
   renoncement, pas un verdict — le meme que la journee logique tient depuis
   toujours sur les jours sans aucune trace. Le jour ou le contact peau vivra la
   nuit, `flPorteNuit` rendra le verdict VRAI et ceci restera dessous, en filet.

   ON NE MESURE PAS UN NOMBRE DE BATTEMENTS, ON MESURE UN TROU. Sylvie remet
   son bracelet a 09h02 : sa plage nocturne n est donc pas vide, et « aucun
   battement entre 21h et 10h » ne se serait jamais declenche. Ce qui la
   distingue d une nuit portee, c est la LONGUEUR DU SILENCE au milieu.

   LES DEUX CALIBRATIONS, ET IL FAUT DIRE LAQUELLE MANQUE.
     · Le cote NEGATIF est mesure, sur les trente jours de la base de Dino
       (releves/donnees-dino-2026-08-29.json) : plus grand trou dans la plage
       21h → 10h, douze nuits entre 3 et 8 minutes, 63 minutes le 7 aout, 180
       minutes le 3 aout — la pire jamais relevee ; et a l interieur des
       fenetres de nuit DECLAREES, le pire trou des trente jours est de DOUZE
       minutes. Le seuil est donc pose au-dessus de tout ce qu un poignet porte
       a jamais produit : aucune nuit de Dino ne peut disparaitre.
     · Le cote POSITIF — la signature d un bracelet reellement pose — n est PAS
       mesure : le cas de Sylvie est connu par ses captures d ecran, pas par une
       base. Ce lot garantit donc de ne pas ACCUSER a tort ; il ne garantit pas
       de tout attraper. Le protocole pour fermer ce trou tient en une soiree et
       il est ecrit dans INVENTAIRE-CAPTEURS.md.

   LA NUIT DU 26 AU 27 AOUT EST LA GARANTIE QUI REND CECI POSABLE. C est celle
   ou l application est morte de 22h06 a 09h01 (RAPPORT-LIEN-BRACELET-27-AOUT) :
   elle tient en QUATRE minutes de trou, parce que l historique de la montre
   comble au matin ce que le direct a manque. Une application endormie ne se
   confond donc pas avec un poignet nu — sans ce fait, ce garde serait dangereux.

   ET LA CONTRE-EPREUVE, PARTOUT : UN ZERO NE PROUVE RIEN TANT QUE LA MESURE N A
   PAS MONTRE QU ELLE SAIT RENDRE UN 1 (doctrine de `garde-pose.sh`, payee une
   journee entiere le 26 aout). Une base qui ne porte aucun battement — jamais
   synchronisee, journee importee, mode demo — ne prouve rien du tout : on ne
   conclut que si la montre a parle par ailleurs.

   Bancs : tests/test-jour-logique.js, cas 14 (les deux moities du cas : la nuit
   sans bracelet de Sylvie ET la nuit blanche PORTEE de Dino, qui appellent des
   reponses opposees) et cas 15 (les trois seuils ne peuvent pas diverger de
   ceux du moteur de sommeil). */

/* QUATRE HEURES. Ce n est pas un nombre de plus : c est
   `CLASSIF.dureeNuitEvidente` (flint-sommeil.js), le seuil qui dit deja
   ailleurs qu une periode de cette longueur EST une nuit a elle seule. Le sens
   se lit tout seul — si la montre s est tue assez longtemps pour qu une nuit
   entiere ait pu s y loger, on ne peut plus affirmer que personne n a dormi. */
var PORTE_TROU_NUIT=240;
/* Les heures ou l on cherche : `nuitDebutMin` et `nuitFinMin` du meme CLASSIF.
   Elles NE CLASSENT RIEN ici, elles disent OU regarder. On ne peut pas les
   demander au moteur — il n est pas injecte dans un navigateur nu ni dans les
   bancs, et une porte absente rendrait `undefined` sans un mot ; le cas 15 du
   banc verifie donc que les copies restent egales. */
var PORTE_NUIT_DEB=21*60, PORTE_NUIT_FIN=10*60;
/* En dessous, on ne conclut RIEN : c est la contre-epreuve ci-dessus. */
var PORTE_MESURE_MINI=10;
/* La meme profondeur que la journee logique : au-dela on consulte une archive. */
var PORTE_PROFONDEUR=30;

/* CE QUE LA MONTRE A MESURE DANS CETTE FENETRE ABSOLUE : combien de minutes, et
   surtout le plus long SILENCE. `watch_<K>.hr` porte des minutes de cadran ; on
   les ramene a un instant par le minuit local de leur cle, comme les six autres
   lecteurs de ce champ.
   LE TROU COMPTE LES DEUX BORDS — de l ouverture de la fenetre au premier
   battement, et du dernier a sa fermeture. Sans eux, un bracelet remis a 09h02
   apres une nuit entiere sur la table paraitrait avoir veille tout du long.
   ET UNE MINUTE `sansContact` N EST PAS UNE MESURE : quand le natif a vu la
   trame dire « pas de peau » (v2056), on la retire du compte au lieu de la
   croire. Le contact peau renforce ainsi le calcul sans qu on ait a lui
   inventer un seuil de part. */
/* LES JOURNEES DEJA LUES, LE TEMPS D UN ETAT DE BASE. Mesure du 30 aout sur la
   base de Dino : sans ce cache, juger trente nuits coutait 441 lectures de
   `watch_<K>` — donc 441 `JSON.parse` d objets de plusieurs dizaines de Ko dans
   le navigateur, la ou trente suffisent. Le CPU du calcul est negligeable
   (0,1 ms par jour) ; c est la RELECTURE qui coute, et l ouverture d un jour
   passe est deja le point douloureux de l app (chantier lenteur du 30 aout).
   Meme peremption que le reste : compteur d ecritures et nombre de cles. */
var _pnJour={}, _pnJourCle='';
function _porteMontre(K){
 var c=(window._flEcritures||0)+'|'+localStorage.length;
 if(c!==_pnJourCle){_pnJour={};_pnJourCle=c;}
 if(!(K in _pnJour))_pnJour[K]=DB.get('watch_'+K,null);
 return _pnJour[K];
}

window.flMesureDans=function(deb,fin){
 var out={n:0,trou:0,silence:0};
 try{
  if(!(fin>deb))return out;
  var vues={},min=[],t=deb-86400000,garde=0;
  for(;t<=fin+86400000&&garde<16;t+=43200000,garde++){
   var K=flCleLocaleDe(t,null); if(!K||vues[K])continue; vues[K]=1;
   var w=_porteMontre(K), L=(w&&w.hr&&w.hr.length)?w.hr:null;
   if(!L)continue;
   var m0=flMinuitMsDe(K); if(m0==null||isNaN(m0))continue;
   var nu={}; if(w.sansContact)for(var q=0;q<w.sansContact.length;q++)nu[w.sansContact[q]]=1;
   for(var i=0;i<L.length;i++){
    var p=L[i]; if(!p||p[0]==null||p[1]==null||nu[p[0]])continue;
    var ms=m0+(+p[0])*60000;
    if(ms>=deb&&ms<=fin)min.push(ms);
   }
  }
  out.n=min.length;
  min.sort(function(a,b){return a-b;});
  var prec=deb, seuil=PORTE_TROU_NUIT*60000;
  for(var j=0;j<min.length;j++){
   if(min[j]-prec>out.trou)out.trou=min[j]-prec;
   if(min[j]-prec>=seuil)out.silence+=(min[j]-prec);   /* un silence assez long pour n etre plus un trou de mesure */
   prec=min[j];
  }
  if(fin-prec>out.trou)out.trou=fin-prec;
  if(fin-prec>=seuil)out.silence+=(fin-prec);
  out.trou=Math.round(out.trou/60000);
  out.silence=Math.round(out.silence/60000);
 }catch(e){}
 return out;
};

/* ═══ v2058 — LE METABOLISME NE SE DEPENSE PAS DANS UN TIROIR ════════════════

   Dino, 5 aout : il perd sa WHOOP et la retrouve en milieu de journee. Son
   export le montre noir sur blanc — cycle du 5 aout ouvert a MINUIT (pas au
   moment ou il la remet), sommeil et recuperation VIDES, et 1 045 kcal contre
   2 204 le lendemain. WHOOP n a rien compte pendant que la montre etait perdue,
   pas meme le metabolisme de base.

   FLINT faisait l inverse : `flCaloriesDetail` proratise le metabolisme sur le
   temps ECOULE depuis minuit, porte ou non. Les deux se defendent — « je ne
   montre que ce que j ai mesure » contre « ton corps brule meme sans bracelet »
   — et Dino a tranche pour la premiere : c est ce que le chiffre doit vouloir
   dire, et c est celui auquel il compare son autre poignet.

   ON NE DECOMPTE QUE LES SILENCES LONGS, ET C EST TOUT LE SOIN DE CETTE REGLE.
   Un decompte minute par minute retirerait a Dino le dixieme de sa journee : son
   bracelet mesure environ 1 300 minutes sur 1 440, le reste etant des trous de
   quelques minutes qui ne sont PAS des absences. On ne retire donc que les
   plages d au moins quatre heures — le meme seuil que la nuit muette, calibre
   sur les memes donnees : son plus grand silence de journee jamais releve est de
   180 minutes. Ses chiffres passes ne bougent pas d une calorie ; une demi-
   journee sans bracelet en perd la moitie.

   ET LA MEME CONTRE-EPREUVE : une journee sans aucun battement ne prouve rien
   (base importee, mode demo, bracelet jamais synchronise). On rend zero, et le
   metabolisme se compte comme avant. */
window.flMinutesNonPortees=function(deb,fin){try{
 var m=flMesureDans(deb,fin);
 return (m.n<PORTE_MESURE_MINI)?0:m.silence;
}catch(e){return 0;}};

/* LA PREMIERE NUIT MUETTE DEPUIS CE REVEIL, ou null. Rend la CLE du jour dont
   la nuit precedente s est passee dans le silence — c est elle que l appelant
   nomme a l ecran, parce qu un renoncement qui ne dit pas ou il a eu lieu n en
   est pas un.
   ON NE JUGE QUE LES PLAGES ENTIEREMENT ECOULEES : celle de cette nuit ne
   compte qu au matin, une fois finie. Sinon on couperait a 23h la journee de
   quelqu un qui n a simplement pas encore dormi — c est-a-dire exactement le
   cas de Dino, celui pour lequel la journee logique a ete ecrite. */
window.flNuitMuette=function(debut,maintenant){try{
 if(debut==null||!(maintenant>debut))return null;
 if(flMesureDans(debut,maintenant).n<PORTE_MESURE_MINI)return null;   /* la contre-epreuve */
 for(var d=0;d>-PORTE_PROFONDEUR;d--){
  var K=tk(d), m0=flMinuitMsDe(K); if(m0==null||isNaN(m0))continue;
  var nd=m0-86400000+PORTE_NUIT_DEB*60000;   /* 21h la veille */
  var nf=m0+PORTE_NUIT_FIN*60000;            /* 10h ce jour-la */
  if(nf>maintenant)continue;                 /* elle n est pas encore finie */
  if(nd<debut)break;                         /* on a remonte jusqu au reveil */
  if(flMesureDans(nd,nf).trou>=PORTE_TROU_NUIT)return K;
 }
 return null;
}catch(e){return null;}};

/* UNE NUIT QUE PERSONNE N A MESUREE NE S AFFICHE PAS.
   La puce n a aucune facon de savoir si le bracelet est au poignet : pose sur
   une table il ne bouge plus, et l absence de mouvement est exactement sa
   definition du sommeil. Elle a donc envoye a Sylvie une nuit de 04h25 a 10h45
   que personne n a dormie, et le moteur l a gardee — il se contentait de la
   marquer `source:'montre'` (flint-sommeil.js, `stageSrc`), une provenance que
   l ecran n a jamais montree a personne.
   ICI NON PLUS CE N EST PAS UN VERDICT DE PORT, C EST UN REFUS DE CONCLURE :
   une nuit dont la fenetre contient quatre heures sans une seule mesure n a pas
   la qualite requise pour etre affichee comme un fait — ses stades viennent de
   la puce sans un battement pour les corriger, et sa variabilite n existe pas.
   Le projet refuse deja de conclure sous couverture insuffisante (Malik 20 %,
   minimums de mesures, generations de formules) ; c est le meme geste.
   `sensorOf` est la seule porte qui l interroge, et tout en decoule : la duree,
   la VFC, la frequence de repos, le score, les moyennes. */
var _pnCache={}, _pnCle='';
/* ═══ 7 sept. 2026 — MEMOIRE PAR NUIT PASSEE (flNuitSansMesure). 671 appels par ouverture, 103 ms.
   Meme sceau que flFcRepos (v1957) : les compteurs d ecritures des familles lues ; une
   ecriture les jette tous. Le calcul d origine est INTACT dans `_calcul`, a l interieur
   de la fonction (les bancs prelevent par le nom). Sans DB.tampon, memoire inactive. */
window._flNuitSansMesureMemo={__sceau:null};
/* ═══ 9 sept. 2026 — LA NUIT QUE LE MOTEUR REFUSE, ET POURQUOI ══════════════
   `sensorOf` rend null sur une nuit du bracelet dont les battements ont un trou
   de quatre heures — et l ecran retombe sur la veille sans un mot. Or quand la
   montre est liee, ce trou n est presque jamais une nuit sans mesure : c est
   une page de FC continue perdue entre la radio et le moteur (la nuit du 8 au
   9 : 421 min de sommeil, 15 % de couverture cardiaque, refusee). Le natif
   demande ici, apres chaque charge de sommeil du jour, s il y a une nuit
   refusee pour ce motif ; si oui, il fait redonner la fenetre par la montre.
   Rend null quand il n y a rien a redemander. */
window.flNuitRefuseeFC=function(K){try{
 K=K||((typeof tk==='function')?tk(0):null); if(!K)return null;
 var w=_porteMontre(K), n=w&&w.night, m0=flMinuitMsDe(K);
 if(!n||n.source!=='ble'||n.bedMin==null||n.wakeMin==null||m0==null||isNaN(m0))return null;
 var fin=m0+n.wakeMin*60000, deb=m0+n.bedMin*60000; if(deb>=fin)deb-=86400000;
 var m=flMesureDans(deb,fin);
 /* Depuis le meme jour, une nuit a stades n est plus REFUSEE pour ce trou : elle
    s affiche, et c est ce trou-ci — le meme seuil — qui declenche la relecture. */
 if(!flNuitSansMesure(K)&&!(m.trou>=PORTE_TROU_NUIT))return null;
 return {K:K, deb:deb, fin:fin, trou:m.trou, n:m.n, sleepMin:n.sleepMin, couverture:n.hrCoverage};
}catch(e){return null;}};
window.flNuitSansMesure=function(K){
 var _calcul=function(K){try{
 if(!K)return false;
 /* La meme peremption que `flJourLogique` : le compteur d ecritures et le
    nombre de cles. `sensorOf` est appelee pour chaque nuit d une moyenne sur
    soixante jours — sans memoire, on relirait soixante fois mille battements. */
 var c=(window._flEcritures||0)+'|'+localStorage.length;
 if(c!==_pnCle){_pnCache={};_pnCle=c;}
 if(_pnCache[K]!=null)return _pnCache[K];
 var out=false, w=_porteMontre(K), n=w&&w.night, m0=flMinuitMsDe(K);
 /* ═══ 9 sept. 2026 — UNE NUIT QUE LA MONTRE A DECOUPEE EN STADES EST PORTEE ═══
    La garantie qui rendait ce garde posable (« l historique de la montre comble
    au matin ce que le direct a manque ») a cede le 9 septembre : les pages de
    FC continue de la nuit ont ete perdues entre la radio et le moteur, et une
    nuit de 421 min, 59 tranches livrees par le bracelet, a ete REFUSEE ici
    pour un trou de 393 min — accueil a « — » toute la matinee. Or ces tranches
    (`stagesV8`, `sleepMinV8`) sont le jugement de la montre elle-meme, qui sait
    si elle est au poignet (zeros J-Style, v2058) : le cas de Sylvie n en avait
    aucune (son decor porte `night` sans stade). Les battements, eux, se
    rattrapent ensuite (`flNuitRefuseeFC` → relecture ciblee) et la VFC se
    scelle quand ils sont la. On ne refuse donc plus une nuit que la montre a
    mesuree, quel que soit le trou de ses battements. */
 /* ═══ 14 sept. 2026 — L EXEMPTION DES STADES DEMANDE UN BATTEMENT ═══════════
    Le 9 septembre a raison sur son cas et trop large d une marche. Ce qu il a
    mesure, c est une nuit ou la montre avait livre ses tranches ET ses
    battements (421 min, 15 % de couverture cardiaque) ; ce que la ligne
    ecrivait, c est « des stades suffisent, quoi qu il arrive ». Or la puce
    stade sur l IMMOBILITE : un bracelet pose sur une table est parfaitement
    immobile, et c est exactement la nuit de 04h25 que Sylvie n a jamais
    dormie. L exemption rouvrait donc la porte que la v2057 avait fermee, pour
    toute montre qui decoupe ses nuits — c est-a-dire la notre.
    ON NE DEVINE TOUJOURS RIEN, ON DEMANDE LE MEME FAIT QUE PARTOUT AILLEURS :
    un battement. Pas quatre heures de battements, pas un seuil de temperature,
    pas une part de non-port — UN. Les zeros du bracelet nu sont jetes en
    amont (v2058) : une fenetre de sept heures sans un seul battement dit que
    la peau n etait pas la, elle ne l estime pas.
    LA CONTRE-EPREUVE DU FICHIER S APPLIQUE ICI AUSSI : une base qui ne porte
    aucun battement (mode demo, journees importees) ne prouve rien, et ses
    nuits restent affichables.
    MESURE AVANT LIVRAISON — rejeu sur les cinq exports du depot, 220 jours
    cumules, dont 44 nuits a stades chez Dino : ZERO nuit change de verdict.
    La nuit du 9 septembre garde ses 421 minutes. Le cas que cette ligne
    attrape ne s est jamais produit dans nos bases ; c est justement celui
    qu on ne veut pas voir arriver en silence.
    ET LE REFUS ARME LA REPARATION : `flNuitRefuseeFC` se declenche sur ce
    meme verdict, donc une nuit dont les pages se sont perdues entre la radio
    et le moteur est REDEMANDEE a la montre, puis s affiche des qu elle
    arrive. Refuser n est pas perdre. */
 if(n&&n.stagesV8&&n.stagesV8.length&&n.sleepMinV8>0){
  if(!(n.bedMin!=null&&n.wakeMin!=null&&m0!=null&&!isNaN(m0)))return (_pnCache[K]=false);
  var _f8=m0+n.wakeMin*60000, _d8=m0+n.bedMin*60000;
  if(_d8>=_f8)_d8-=86400000;
  if(!(_f8>_d8))return (_pnCache[K]=false);
  if(flMesureDans(m0,m0+86400000).n<PORTE_MESURE_MINI)return (_pnCache[K]=false);
  return (_pnCache[K]=(flMesureDans(_d8,_f8).n===0));
 }
 if(n&&n.bedMin!=null&&n.wakeMin!=null&&m0!=null&&!isNaN(m0)){
  var fin=m0+n.wakeMin*60000, deb=m0+n.bedMin*60000;
  if(deb>=fin)deb-=86400000;                 /* le coucher etait la veille */
  if(fin>deb&&flMesureDans(m0,m0+86400000).n>=PORTE_MESURE_MINI)
   out=(flMesureDans(deb,fin).trou>=PORTE_TROU_NUIT);
 }
 return (_pnCache[K]=out);
}catch(e){return false;}};
 try{
  var _auj=(typeof tk==='function')?tk():null;
  if(!K||K===_auj)return _calcul(K);
  var _sc=null; try{_sc=DB.tampon('sensor_')+'|'+DB.tampon('watch_')+'|'+DB.tampon('sessions_')+'|'+DB.tampon('hrfine_')+'|'+DB.tampon('recov');}catch(e){_sc=null;}
  if(_sc==null)return _calcul(K);
  var _m=window._flNuitSansMesureMemo; if(!_m||_m.__sceau!==_sc){_m=window._flNuitSansMesureMemo={__sceau:null};_m.__sceau=_sc;}
  if(Object.prototype.hasOwnProperty.call(_m,K)){var _g=_m[K];return (_g&&typeof _g==='object')?JSON.parse(JSON.stringify(_g)):_g;}
  var _r=_calcul(K);
  _m[K]=(_r&&typeof _r==='object')?JSON.parse(JSON.stringify(_r)):_r;
  return _r;
 }catch(e){return _calcul(K);}
};


/* ═══ v2188 — LA BANNIÈRE AVAIT UNE MÉCANIQUE ET AUCUNE SOURCE ═════════════

   `setWatchWorn`, `notifyWatchOff` et #flintWatchBanner existent dans
   index.html depuis longtemps, et n'étaient appelés QUE par le bouton
   « Simuler : retirer le bracelet » — un outil de banc, caché sur le
   téléphone (`location.protocol !== 'flintapp:'`). C'est le TROISIÈME membre
   mort du même chantier, avec `flNoterSansContact` (v2056, jamais appelée
   faute de service 180D) et le zéro de l'octet 21 côté natif : à chaque fois
   la mécanique était là, complète, et le fait n'arrivait jamais jusqu'à elle.

   ⚠️ SEULE LA PHASE « tenue » MONTRE LE BANDEAU. Le premier zéro n'est qu'un
   soupçon : 29 % des échantillons que la montre garde en mémoire sont des
   zéros, à toute heure, mesuré sur cinq jours (outils/mesure-non-port.js).
   Un bandeau rouge plein écran à chaque rafale serait bien pire que le
   silence d'avant. « tenue » veut dire que le pont a vu DIX MINUTES pleines
   sans une seule peau — le moment exact où la notification part.

   ⚠️ ET IL NE SURVIT PAS À UNE RELANCE. `addWatchBanner` restaurait
   `watchWorn` au démarrage, ce qui était juste tant que seul le bouton de
   simulation l'écrivait. Depuis que le natif l'alimente, restaurer serait
   dangereux : l'app relancée le lendemain, bracelet au poignet, rouvrirait un
   bandeau que plus aucune mesure ne justifie, et qu'il faudrait fermer à la
   main. AU DÉMARRAGE ON NE SAIT RIEN — et « on ne sait pas » n'est pas
   « retiré » (règle du cahier du 30 août : UNKNOWN ne devient jamais un
   verdict). Si le bracelet est vraiment posé, le prochain verdict tenu
   rouvrira le bandeau dans les dix minutes.

   ⚠️ CE BANDEAU EST UN APLAT ROUGE (#F0492E, index.html). La maison ne peint
   pas le rouge en aplat — il est réservé aux métriques — et cette règle est
   antérieure à ce lot. Tant qu'il n'était montré qu'au banc, personne ne le
   voyait ; il est maintenant visible pour de vrai, et sa forme est à revoir.
   Signalé, pas corrigé ici : ce lot ne redessine rien.                      */
window.flPortBanniere=function(porte){try{
 if(typeof window.setWatchWorn!=='function')return false;
 /* On ne parle QUE sur changement : `setWatchWorn(false)` renotifie à chaque
    appel (`if(!worn&&was)window.notifyWatchOff()`), et la phase « tenue »
    revient une fois par minute tant que la peau manque. */
 var avant=(window._watchWorn!==false);
 if(avant===!!porte)return false;
 window.setWatchWorn(!!porte);
 return true;
}catch(e){return false;}};

/* ═══ 7 SEPT. 2026 — LE CYCLE : D'UN SOMMEIL AU SUIVANT, EN MILLISECONDES ══════════

   POURQUOI ICI. Ce fichier porte déjà les frontières de la journée — la nuit
   muette, les minutes non portées, les silences longs. La borne du cycle est de
   la même famille : elle dit OÙ commence et où finit une journée vécue, et rien
   d'autre ne doit avoir à la redevenir.

   CE QU'ELLE REND. Le cycle du jour K va de l'endormissement qui OUVRE la nuit
   rangée sous K (celle qui se termine au matin de K) jusqu'à l'endormissement
   suivant. C'est la même frontière que `flPtsEveil` donne déjà aux calories
   actives, augmentée de la nuit qui l'ouvre — pas une seconde n'est comptée
   deux fois, pas une seconde n'est perdue entre deux journées.

   « HIER SOIR » SE DÉDUIT DU RÉVEIL, PAS D'UNE HEURE FIXE. Un coucher rangé
   sous le jour K précède forcément le réveil qui le termine : s'il tombe APRÈS
   ce réveil dans le cadran, c'est qu'on a franchi minuit entre les deux — il
   est donc d'hier. `bedMin > wakeMin`, et rien d'autre.

   ⚠️ LA RÈGLE D'AVANT ÉTAIT `bedMin > 720`, c'est-à-dire « après midi = hier
   soir ». Juste pour qui se couche le soir, FAUSSE pour qui se couche
   l'après-midi : un coucher à 14h10 était daté de la veille et la fenêtre
   partait à l'envers. Le banc des corps virtuels l'a chiffré le 7 septembre
   2026 — le travailleur de nuit (coucher 8h00 ± 150 min) perdait 4 cycles sur
   60, deux nuits d'après-midi cassant chacune le cycle qui la précède ET celui
   qui la suit. La nouvelle règle n'a plus de constante à régler et vaut pour
   tout le monde : CHANTIER-COUCHER-APRES-MIDI.md.

   `wakeMin` MANQUANT : on retombe sur l'ancienne règle plutôt que de renoncer.
   Une nuit sans réveil connu est rare et l'ancien test la traitait déjà.

   LE JOUR EN COURS S'ARRÊTE À MAINTENANT, jamais à un coucher qui n'a pas eu
   lieu : le total d'aujourd'hui monte au fil des heures, comme avant.

   ⚠️ LES BORNES DE SÛRETÉ NE SONT PAS DÉCORATIVES. Une nuit non mesurée ne
   produit pas un « long cycle », elle produit une ABSENCE de frontière — et
   sans garde, deux nuits manquantes donneraient un cycle de trois jours et un
   métabolisme triple. Mesuré sur les 21 jours de Dino (7 septembre 2026) : le
   plus court fait 17h39 (le 21 août, réveil à 09h41 après un coucher à 06h22),
   le plus long 29h34 (le 20 août, la nuit blanche qui l'a précédé). On accepte
   de 12 h à 36 h ; au-delà, on rend `null` et l'appelant garde le cadran civil.
   Rendre null n'est pas un échec : c'est le refus de facturer un métabolisme
   sur une frontière qu'on n'a pas mesurée. */
var PORTE_CYCLE_MIN=12*60, PORTE_CYCLE_MAX=36*60;

window.flCycleJour=function(K){try{
 if(typeof sleepNight!=='function'||typeof flMinuitMsDe!=='function')return null;
 var _deb=function(k){
  var n=sleepNight(k); if(!n||n.bedMin==null)return null;
  var m=flMinuitMsDe(k); if(m==null||isNaN(m))return null;
  var hier=(n.wakeMin!=null)?(n.bedMin>n.wakeMin):(n.bedMin>720);
  return m+(hier?n.bedMin-1440:n.bedMin)*60000;
 };
 var n0=sleepNight(K); if(!n0)return null;
 var deb=_deb(K); if(deb==null)return null;
 var p=(''+K).split('-'), d2=new Date(+p[0],(+p[1])-1,+p[2]); d2.setDate(d2.getDate()+1);
 var K2=d2.getFullYear()+'-'+(d2.getMonth()+1)+'-'+d2.getDate();
 var fin=_deb(K2), enCours=false;
 /* Pas de coucher au lendemain : c'est aujourd'hui (on s'arrête à maintenant),
    ou une nuit qui manque (on ne devine pas une frontière). */
 if(fin==null&&typeof tk==='function'&&K===tk()){fin=Date.now();enCours=true;}
 if(fin==null)return null;
 var min=Math.round((fin-deb)/60000);
 if(min<=0||min>PORTE_CYCLE_MAX)return null;
 /* ⚠️ LE PLANCHER NE VAUT QUE POUR UN CYCLE CLOS. Un cycle EN COURS est court
    par construction — il se remplit — et le lui reprocher ferait sauter le
    total du jour au moment précis où il franchit douze heures. Le cas n'est pas
    théorique : endormi à 04h23 le 5 septembre, le repli civil et le cycle réel
    donnaient 744 et 396 kcal à 10 h du matin ; le compteur aurait chuté de
    350 kcal en une seconde vers 16h23. Un plancher qui protège d'une nuit non
    mesurée n'a rien à dire sur une journée qui commence. */
 if(!enCours&&min<PORTE_CYCLE_MIN)return null;
 return {deb:deb, fin:fin, minutes:min, dormi:Math.max(0,+n0.asleep||0)};
}catch(e){return null;}};
