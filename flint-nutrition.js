/* ═══════════════════════════════════════════════════════════════════════════
   LA NUTRITION — sortie d'index.html lors du découpage du moteur web (30 août
   2026). Les trente-six fonctions du volet alimentaire : l'analyse (photo et
   texte), la vie des repas (ajout, note, détail, ingrédients), le scan et le
   code-barres, l'écran Nutrition. La table des additifs vit à côté dans
   flint-additifs.js ; le pont réseau (PontReseau) reste côté natif. Les
   appels se résolvent au geste, comme avant — déménagement pur.
   ═══════════════════════════════════════════════════════════════════════════ */
window.flAnalyserRepas=function(url){
 /* v1028 — LA PHOTO ARRIVAIT SOUS LA MAUVAISE FORME.
    `analyzeMealPhoto` a changé de contrat : un second script écrase le stub de
    maquette par la VRAIE analyse, qui attend un File et appelle
    `readAsDataURL` dessus. Le natif envoyait une data-URL — une chaîne — ce qui
    lève un TypeError SYNCHRONE avant même le réseau. La promesse rejetait donc
    toujours, et l'écran affichait toujours « On n'a pas reconnu ce plat ».
    On enveloppe la data-URL dans un File, exactement comme les deux autres
    appelants du web le font déjà.
    `atob` + Uint8Array plutôt que `fetch(dataURL)` : aucune dépendance au
    support du schéma `data:` par fetch ni à la CSP sous flintapp://localhost. */
 function envoyer(d){try{window.webkit.messageHandlers.flint.postMessage(
   {cmd:'natif',screen:'repasIA',data:d});}catch(e){}}
 function echouer(r){envoyer({ok:false,raison:String(r||window._flScanFail||'')});}
 try{
  var s=String(url||''), i=s.indexOf(',');
  if(i<0){echouer('Image illisible.');return;}
  var type=(s.slice(0,i).match(/data:([^;]+)/)||[])[1]||'image/jpeg';
  var bin=atob(s.slice(i+1)), n=bin.length, arr=new Uint8Array(n);
  for(var k=0;k<n;k++)arr[k]=bin.charCodeAt(k);
  var f=new File([arr],'repas.jpg',{type:type});
  Promise.resolve(window.analyzeMealPhoto(f)).then(function(m){
   /* v1060 — desc et ingredients traversent s'ils existent.
      v1073 — le proxy Gemini les FOURNIT : scoreNote est la phrase d'analyse
      du plat, et les aliments détectés attendent dans _flintScanItems (posé
      par analyzeMealPhoto juste avant de résoudre). On les sert au natif. */
   var ing=(m&&Array.isArray(m.ingredients))?m.ingredients.map(String)
          :(window._flintScanItems||[]).map(function(it){return String(it&&it.name||'')}).filter(Boolean);
   var pc=flPoidsEtConfiance();
   envoyer({nom:String((m&&m.name)||'Mon repas'),
            kcal:Math.round((m&&m.kcal)||0),prot:Math.round((m&&m.prot)||0),
            carb:Math.round((m&&m.carb)||0),fat:Math.round((m&&m.fat)||0),
            desc:(m&&(m.desc||m.scoreNote))?String(m.desc||m.scoreNote):null,
            ingredients:ing.length?ing:null,
            grammes:pc.grammes, confiance:pc.confiance, source:'photo',
            items:flItemsPourNatif(),   /* v1628 */
            /* ═══ v1930 — LA NOTE DE QUALITE TRAVERSE ENFIN LE PONT ═══════
               L analyse rend un `healthScore` — « 8-10 aliments bruts, 4-5
               transforme ou frit, 1-3 ultra-transforme ou sucre » — et cette
               charge ne le portait pas. Le repas arrivait donc dans le journal
               SANS note, et chaque ecran en fabriquait une avec ce qu il savait
               lire : la part des proteines. C est la racine du 1/10 sur la
               banane, verifiee sur la base de Dino — ses quatre repas du
               26 aout portent tous `source:'photo'` et AUCUN ne porte `score`.
               Borne ici, reborne par le pont natif, reborne par le moteur. */
            score:(m&&m.score!=null&&isFinite(+m.score))
                  ?Math.max(1,Math.min(10,Math.round(+m.score))):null,
            ok:true});
  }).catch(function(e){echouer(e&&e.message);});
 }catch(e){echouer(e&&e.message);}
};

window.flRepasDepuisNatif=function(json){
 function envoyer(d){try{window.webkit.messageHandlers.flint.postMessage(
   {cmd:'natif',screen:'repasIA',data:d});}catch(e){}}
 try{
  var d=(typeof json==='string')?JSON.parse(json):json;
  var src=(d&&Array.isArray(d.items))?d.items:[];
  if(!src.length){envoyer({ok:false,raison:'Aucun aliment reconnu sur la photo.'});return;}
  /* Le format interne du moteur, celui que ses regles savent lire. */
  window._flintScanItems=src.map(function(x){
   x=x||{};
   var g=+x.grammes; if(!isFinite(g)||g<=0)g=null;
   return {name:String(x.nom||'').trim(), grams:g,
           kcal:(+x.kcal||0),prot:(+x.prot||0),carb:(+x.carb||0),fat:(+x.fat||0),
           confidence:(d.confiance!=null&&isFinite(+d.confiance))?+d.confiance:null};
  }).filter(function(x){return x.name;});
  if(!window._flintScanItems.length){
   envoyer({ok:false,raison:'Aucun aliment reconnu sur la photo.'});return;}
  /* v1609 — on consigne CE QUE LE MODELE A DIT, avant toute correction. */
  try{flCalibConsigner('photo',null,d,src);}catch(e){}
  /* LA SEULE VRAIE REGLE FLINT DE TOUT CE CHEMIN, et la raison pour laquelle
     il repasse par le moteur : `flPortionApprise` lit SA base. */
  try{flAppliquerPortionsApprises();}catch(e){}
  var t=flTotalItems(), pc=flPoidsEtConfiance();
  envoyer({nom:String((d&&d.nom)||'Mon repas'),
           kcal:Math.round(t.kcal||0),prot:Math.round(t.prot||0),
           carb:Math.round(t.carb||0),fat:Math.round(t.fat||0),
           desc:(d&&d.desc)?String(d.desc):null,
           ingredients:window._flintScanItems.map(function(x){return x.name;}),
           grammes:pc.grammes, confiance:pc.confiance, source:'photo',
           items:flItemsPourNatif(),
           /* v1930 — la note traverse, bornee ici comme partout ailleurs. */
           score:(d&&d.score!=null&&isFinite(+d.score))
                 ?Math.max(1,Math.min(10,Math.round(+d.score))):null,
           ok:true});
 }catch(e){envoyer({ok:false,raison:String((e&&e.message)||'')});}
};

window.flAjouterRepas=function(nom,kcal,prot,carb,fat,ph,time,jourOff,boisson,ing,meta){try{
 /* v1079 — L'HEURE ET LE JOUR DU REPAS. `time` ('HH:MM') est l'heure de la
    prise — c'est elle qui INSÈRE le repas au bon endroit de la frise (les
    entrées sans heure partaient en fin de journée, sans heure affichée).
    `jourOff` permet d'enregistrer un plat photographié un autre jour
    (import pellicule : on récupère la date EXIF de la photo). */
 var off=(typeof jourOff==='number'&&isFinite(jourOff))?jourOff:(window.flDayOff||0);
 var K=tk(off);
 var a=DB.get('meals_'+K,[])||[];
 /* v1032 — `ph` : l'IDENTIFIANT de la photo, jamais l'image. Le fichier vit
    côté natif (Application Support) ; ici on ne garde que la clé, sinon des
    data-URL feraient exploser localStorage en une semaine de repas. */
 /* v1104 — une BOISSON se souvient qu'elle en est une : la frise et le
    journal lui donnent la tasse, pas la fourchette. */
 /* v1447 — ON GARDE ENFIN LES ALIMENTS RECONNUS.
    L'analyse (photo ou description) rendait déjà la liste ; elle s'affichait
    sur la fiche de validation puis mourait à l'enregistrement. Elle est
    maintenant écrite avec le repas, et le journal la relit sous le nom du
    plat. Des NOMS, rien d'autre : pas de quantité collée dedans. */
 var _ing=(Array.isArray(ing)?ing:[]).map(function(x){return String(x||'').trim()})
          .filter(Boolean).slice(0,12);
 /* v1609 — la provenance voyage avec le repas. `meta` est facultatif : un
    appelant qui ne le passe pas ecrit `source:null`, et c est honnete — on ne
    sait pas d ou ca vient plutot que de pretendre le savoir. */
 var _m=meta||{};
 var _src=(window.FL_SOURCES_REPAS.indexOf(_m.source)>=0)?_m.source:null;
 var _g=(_m.grammes!=null&&isFinite(+_m.grammes)&&+_m.grammes>0&&+_m.grammes<=5000)
        ?Math.round(+_m.grammes*10)/10:null;
 var _cf=(_m.confiance!=null&&isFinite(+_m.confiance))
        ?Math.max(0,Math.min(1,+_m.confiance)):null;
 /* ═══ v1627 — CONFIRME : L UTILISATEUR A-T-IL VU CE CHIFFRE ? ══════════════
    Point 8 de l audit du 18 aout. Une photo vaut 30,6 % d erreur mediane
    (Nutrition5k, 22 plats) ; un code-barres lit l emballage. Les deux
    entraient avec la meme autorite, et l app ne gardait AUCUNE trace de ce que
    l utilisateur avait valide sans y toucher.
      `confirme:true`  il a corrige la portion, ou la source est un emballage ;
      `confirme:false` il a accepte l estimation telle quelle ;
      `null`           on ne sait pas (appelant qui ne le dit pas).
    Comme les trois champs de la v1609 : on ECRIT la verite maintenant, on
    decide de l AFFICHER separement. Un chiffre dont on sait qu il n a jamais
    ete regarde peut porter une marge ; un chiffre dont on ne sait rien, non. */
 var _cn=(_m.confirme===true)?true:((_m.confirme===false)?false:null);
 /* v1609 — UN PRODUIT SCANNE APPREND SA PORTION. Sur cette voie le nom designe
    UN produit et les grammes sont ceux que l utilisateur a confirmes : « 30 g
    de Nutella » est sa portion, et il n aura pas a la redire. On ne le fait PAS
    pour un repas photographie : « Poulet, riz, brocolis » ne designe rien qu on
    puisse repeser. */
 if(_src==='code-barres'&&_g)try{flPortionRetenir(nom,_g);}catch(e){}
 /* ═══ v1923 — LA NOTE DE QUALITE VOYAGE AVEC LE PRODUIT ════════════════════
    Cette porte est celle du SCAN PRODUIT (fiche v1773). Elle recevait la
    provenance, les grammes et la confiance — mais pas la note, alors que la
    fiche a le Nutri-Score officiel ET le groupe NOVA sous la main. Le repas
    arrivait donc dans le journal sans qualite connue, et depuis la v1923 sans
    note du tout (on ne devine plus). Un Nutri-Score mesure, il ne se devine
    pas : il n y a aucune raison de le laisser sur le quai.
    Bornee ici comme partout ailleurs : 1 a 10, entier, sinon rien. */
/* ═══ v1930 — UNE NOTE DIT DE QUEL MOTEUR ELLE VIENT ══════════════════════
    Sans ce numero, rien ne distingue un 5 fabrique par un repli mort d un vrai
    Nutri-Score C : les deux sont « 5 » dans `meals_`, pour toujours. Le champ
    ne sert a personne aujourd hui — aucun lecteur ne le regarde — et c est
    exactement son role : il rend le passe RECALCULABLE le jour ou le moteur
    changera. Il ne repare rien retroactivement ; il empeche la prochaine
    generation de notes d etre aussi opaque que celle-ci.
    2 = la note de QUALITE (analyse du plat, ou Nutri-Score corrige de
    l ultra-transformation). 1 = tout ce qui precede, y compris les notes
    fabriquees sur la part des proteines. Une entree SANS `sv` est donc de
    version 1 par construction, sans qu on ait a la reecrire. */
 var _sc=(function(){var v=+(_m.score);
   return (isFinite(v)&&v>=1&&v<=10)?Math.round(v):null;})();
 a.push({name:String(nom||'Repas'),
         boisson:!!boisson,
         score:_sc,
         /* `typeof` et pas la variable nue : un ReferenceError ici serait avalé
            par le `try` de la fonction — le repas ne serait PAS ajouté, en
            silence. Et le repli est `null`, PAS un numéro : une note dont on ne
            sait pas quel moteur l'a écrite doit se dire inconnue, pas se
            réclamer du moteur courant. L'autre porte replie pareil. */
         sv:(_sc!=null&&typeof FL_SCORE_V!=='undefined'?FL_SCORE_V:null),
         ing:_ing.length?_ing:null,
         grammes:_g, source:_src, confiance:_cf, confirme:_cn,
         kcal:Math.max(0,Math.round(+kcal||0)),
         prot:Math.max(0,Math.round(+prot||0)),
         carb:Math.max(0,Math.round(+carb||0)),
         fat:Math.max(0,Math.round(+fat||0)),
         ph:(typeof ph==='string'&&ph)?ph:null,
         /* v1093 — SANS HEURE, L'HEURE DU SCAN. Un repas sans heure ne se
            rangeait nulle part dans la frise ; or l'instant de la photo EST
            l'heure du repas, sauf si l'analyse en a fourni une autre. */
         time:(typeof time==='string'&&/^\d{1,2}:\d{2}$/.test(time))?time
             :(function(){var d=new Date();return String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');})()});
 /* Le tableau reste trié par heure : la frise ET le journal lisent l'ordre
    du jour, et les rangs (détail, suppression) suivent le même tri partout. */
 /* ═══ v1770 — LE RANG N EST CONNU QU APRES LE TRI ══════════════════════════

    Dino, 20 aout : « 0 kcal / 0 g / 0 g / 0 g pour un repas issu d un scan ».

    LE DEFAUT, REJOUE SUR CES FONCTIONS. Un repas s ajoute en FIN de tableau,
    puis le tri le remonte a sa place horaire. Le natif n avait aucun moyen de
    savoir ou il avait atterri : cette fonction rendait `true`.

        deja en base    : Diner 20:00
        on scanne       : Dejeuner 12:30, 406 kcal
        apres le tri    : 0:Dejeuner | 1:Diner
        le natif ouvre  : le rang 1  →  « Diner, 800 kcal »

    Et quand le repas scanne est le SEUL de la journee, le rang pointe hors du
    tableau : flRepasData rend `aDesDonnees:false`, ce qui s affiche en 0 kcal.
    C est exactement le cas de Dino.

    ON REND DONC LE RANG FINAL. Le repas est marque avant le tri, retrouve
    apres, et la marque est retiree AVANT l ecriture : elle ne doit pas
    voyager avec le repas pour toujours.

    CE QUE CA NE REGLE PAS, et il faut le dire : le rang reste une identite
    INSTABLE. Vingt-six ecritures touchent meals_<K> et cinq retrient. Un rang
    juste a l instant de l ajout peut devenir faux si un autre ecrivain passe
    ensuite. La vraie reponse serait un identifiant par repas ; celle-ci ferme
    le cas de loin le plus frequent, celui du repas qu on vient d enregistrer. */
 var _neuf=a[a.length-1]; _neuf.__neuf=1;
 a.sort(function(x,y){
  var p=function(t){if(!t)return 1e9;var m=String(t).split(':');return (+m[0]*60)+(+m[1]||0)};
  return p(x.time)-p(y.time)});
 var _rang=-1;
 for(var _i=0;_i<a.length;_i++) if(a[_i].__neuf===1){_rang=_i;break;}
 delete _neuf.__neuf;
 /* ═══ v2006 — LE RÉSULTAT SE DIT, IL NE SE DEVINE PAS — POUR LES REPAS AUSSI
    La v1706 a posé la règle sur les séances, après la sortie de dix-neuf
    secondes perdue sans une trace : « flCreerActivite rendait true même quand
    DB.set avait refusé d'écrire ». CETTE ligne-ci avait exactement le même
    trou : stockage plein → DB.set rend false en silence → le repas n'existe
    nulle part, et la fonction rendait quand même un RANG — le natif ouvrait
    la fiche d'un repas fantôme et journalisait « ajouté ». Le quota n'est pas
    théorique : le 23 août, rrH occupait 72 % du magasin et l'enregistrement
    d'une séance a échoué treize fois de suite (ECHEC-ECRITURE).
    `-2` : le natif distingue « écrit, rang inconnu » (-1, il n'ouvre pas de
    fiche) de « PAS ÉCRIT » (-2, il le crie au journal). */
 if(DB.set('meals_'+K,a)===false)return -2;
 try{renderNutrition();}catch(e){}
 /* Le rang final, celui que la fiche doit ouvrir. `-1` reste possible si
    quelque chose a mal tourne : le natif le traite comme « on ne sait pas »
    plutot que d ouvrir le rang 0, qui serait un AUTRE repas. */
 return _rang;
}catch(e){return -1;}};

window.flModifierRepas=function(rang,nom,time,facteur,jourDelta,jour){try{
 /* ═══ v1605 — LE JOUR VOYAGE AVEC LE RANG, ICI AUSSI ════════════════════════
    `flRepasData` et `flSupprimerRepas` prennent le jour depuis la v1418 ; celle
    -ci était restée sur `flDayOff` seul. Or le commentaire de son appelant
    natif dit mot pour mot « le jour AFFICHÉ (celui du rang) » : les deux ne
    parlaient pas de la même journée dès que `flDayOff` avait bougé dans le dos
    de l'écran — fin de synchro, épinglage de reprise, garde `e != jourServi`.
    Le rang d'une journée s'appliquait alors aux repas d'une AUTRE : on modifiait
    le mauvais repas, ou rien. Un rang et un jour forment UNE coordonnée. */
 var K=jour||tk(window.flDayOff||0);
 var a=DB.get('meals_'+K,[])||[];
 var m=a[rang]; if(!m)return false;
 if(typeof nom==='string'&&nom)m.name=nom;
 if(typeof time==='string'&&/^\d{1,2}:\d{2}$/.test(time))m.time=time;
 /* v1605 — LE FACTEUR POUVAIT SEULEMENT RÉDUIRE. La borne `f<1.001` refusait
    en silence « j'en ai repris » : l'écran envoyait 1,5, rien ne bougeait, et
    aucun message ne le disait. On accepte du dixième au triple — au-delà c'est
    une saisie qui a dérapé, et l'ignorer vaut mieux que multiplier un repas
    par cent. */
 var f=+facteur;
 if(f>=0.1&&f<=3&&Math.abs(f-1)>0.01){
  ['kcal','prot','carb','fat'].forEach(function(k){
   if(m[k]!=null)m[k]=Math.round(m[k]*f);});}
 var tri=function(x,y){
  var p=function(t){if(!t)return 1e9;var q=String(t).split(':');return (+q[0]*60)+(+q[1]||0)};
  return p(x.time)-p(y.time)};
 var d=Math.round(+jourDelta||0);
 if(d!==0){
  /* Le repas déménage : retiré d'ici, rangé là-bas à son heure. */
  a.splice(rang,1);
  DB.set('meals_'+K,a.sort(tri));
  /* Le jour d'arrivée se compte depuis le jour DU REPAS, pas depuis la
     sélection courante : c'est le même piège, un cran plus loin. */
  var K2=(function(){
   var p=String(K).split('-');
   var dt=new Date(+p[0],+p[1]-1,+p[2]); dt.setDate(dt.getDate()+d);
   return dt.getFullYear()+'-'+(dt.getMonth()+1)+'-'+dt.getDate();
  })();
  var b=DB.get('meals_'+K2,[])||[];
  b.push(m);
  DB.set('meals_'+K2,b.sort(tri));
 }else{
  DB.set('meals_'+K,a.sort(tri));
 }
 try{renderNutrition();}catch(e){}
 return true;}catch(e){return false;}};

window.flRepasData=function(rang,jour){try{
 var K=jour||tk(window.flDayOff||0);
 var a=(typeof mealsOf==='function')?mealsOf(K):(DB.get('meals_'+K,[])||[]);
 var m=a[+rang||0]; if(!m)return {aDesDonnees:false};
 var p=+m.prot||0,c=+m.carb||0,f=+m.fat||0;
 /* Les parts se calculent en CALORIES, pas en grammes : un gramme de lipide
    en pèse neuf contre quatre. Un camembert en grammes mentirait d'un tiers. */
 var pk=p*4,ck=c*4,fk=f*9,tt=(pk+ck+fk)||1;
 return {aDesDonnees:true, rang:+rang||0,
  nom:m.name||'Repas', heure:m.time||null,
  jour:(typeof nutDayLabel==='function')?nutDayLabel(K):null,
  kcal:Math.round(m.kcal||0), prot:p, gluc:c, lip:f,
  partProt:pk/tt, partGluc:ck/tt, partLip:fk/tt,
  photo:m.photo||null,
  /* v1033 — la MEME page de detail sert l accueil et Nutrition : elle a
     besoin de la photo (ph) et de la note, avec la MEME formule que le
     journal — la part des proteines, honnete et assumee. */
  ph:m.ph||null,
  /* ═══ v1923 — LA FICHE LISAIT UNE AUTRE NOTE QUE LE JOURNAL ══════════════
     Elle recalculait `part proteique x 30` pendant que la carte du journal, a
     deux ecrans de la, affichait `flMealScore(m)` — la vraie note de qualite.
     Deux ecrans, deux valeurs pour la meme mesure : la panne payee en v1374,
     rejouee ici sans que personne la voie, parce que les deux chiffres etaient
     plausibles. Une banane valait 9 dans le journal et 1 dans sa fiche.
     UNE SEULE PORTE DESORMAIS ([[flint-correction-non-propagee]]). */
  note:(function(){var _n=(typeof flMealScore==='function')?flMealScore(m):null;
        return _n!=null?String(_n):null;})()};
}catch(e){return {aDesDonnees:false};}};

window.flSupprimerRepas=function(rang,jour){try{
 var K=jour||tk(window.flDayOff||0);
 var a=DB.get('meals_'+K,[])||[];
 /* ═══ v1930 — ELLE DIT SI ELLE A SUPPRIME, ET QUOI ═══════════════════════
    Elle rendait `true` sans regarder quoi que ce soit : `splice` hors bornes ne
    retire RIEN et ne se plaint pas, et `DB.set` rend `false` en silence quand le
    quota est plein. Le natif, lui, effaçait le fichier photo sur la foi de ce
    `true` — d ou des repas bien vivants dont la photo n existe plus.
    Deux gardes, dans l ordre : le rang doit designer quelque chose, et
    l ecriture doit avoir eu lieu. */
 var _r=+rang; if(!isFinite(_r)||_r<0||_r>=a.length)return false;
 var _oteS=a.splice(_r,1); if(!_oteS.length)return false;
 var _ecrit=DB.set('meals_'+K,a); if(_ecrit===false)return false;
 /* v1605 — la page web se redessine, comme après un ajout ou une modification.
    Elle ne le faisait pas : sur la vue web, un repas supprimé restait affiché
    jusqu'au prochain rendu provoqué par autre chose. */
 try{renderNutrition();}catch(e){}
 return true;}catch(e){return false;}};

window.flNutritionData=function(_argJour){try{
 /* v1459 — ELLE AUSSI IGNORAIT LE JOUR CHOISI. `tk(0)` en dur : le ruban des
    jours est pourtant SUR cette page. Meme ligne que flSommeilData et
    flRecupData — sans argument on suit la selection. */
 var _off=(_argJour==null)?Math.min(0,(window.flDayOff|0)):Math.min(0,_argJour|0);
 var K=(typeof tk==='function')?tk(_off):null;
 var prof=(typeof getProfile==='function')?getProfile():{};
 var repas=[];try{repas=DB.get('meals_'+K,[])||[];}catch(e){}
 function mil(v){return v==null?null:String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g,' ');}

 var kcalBut=flBesoinDuJour(_off).objectif;   /* v1626 — plus de defaut 2500 local */
 var pris=0,P=0,G=0,L=0;
 repas.forEach(function(m){pris+=(m.kcal||0);P+=(m.prot||0);G+=(m.carb||0);L+=(m.fat||0);});
 /* Le budget du jour EST l'objectif — depuis le 13 sept. 2026, l'activite n'est
    plus rajoutee : elle est deja dans la reference dont l'objectif est tire.
    Voir `flBesoinDuJour`. Meme regle que la page web. */
 var brule=(typeof caloriesBurned==='function')?caloriesBurned(K):0;
 var budget=flBesoinDuJour(_off).kcal;   /* v1626 — source unique du besoin */
 /* ═══ v2183 — UN BUDGET INCONNU N EST PAS UN BUDGET DE ZERO ════════════════
    Depuis que les objectifs par defaut ont quitte le profil, `flBesoinDuJour`
    peut rendre `null` : on ne sait rien du corps de cette personne. Sans les
    gardes ci-dessous, `Math.max(0, null - pris)` posait « restant 0 » et les
    trois cibles de macros tombaient a zero — trois barres pleines annoncant
    un depassement invente. Tous ces champs sont deja optionnels cote Swift
    (`MacroNutrition.cible`, `budget`, `pourcent`) : le tiret est un etat
    prevu, le zero non. */
 var reste=(budget!=null)?Math.max(0,budget-pris):null;
 var pct=budget?Math.round(pris/budget*100):null;

 /* `140` etait le dernier corps invente de cette charge. La cible protéique
    suit maintenant le meme etagement que partout : ce qui a ete VOULU, sinon
    ce que le poids donne, sinon rien. */
 var _gp=null;try{_gp=(typeof flNutGoals==='function')?flNutGoals():null;}catch(e){_gp=null;}
 var butP=+prof.protGoal||null;
 if(butP==null)butP=(_gp&&_gp.prot)||null;
 /* ═══ 14 sept. 2026 — UNE SEULE FORMULE DE CIBLES, CELLE DU PLAN ══════════
    Il y en avait DEUX. `flNutGoals` répartit ce qui reste APRÈS les protéines,
    60 % en glucides et 40 % en lipides : les trois macros somment aux kcal du
    plan, par construction. Ici on servait 45 % et 30 % des kcal du plan, EN
    PLUS des protéines — trois parts qui ne partagent pas un tout.
    MESURÉ au harnais Node sur la base du 9 septembre (sèche 0,35 kg/sem, plan
    2 014 kcal, 183 g de protéines) : 183 P + 227 G + 67 L = 2 243 kcal, soit
    111,4 % du plan, 229 kcal de trop. `flNutGoals` sur la même base dit 192 g
    de glucides et 57 g de lipides. Ces cibles voyagent dans
    `MacroNutrition.cible` et `InstantaneFlint` : qui les atteindrait toutes
    les trois mangerait 229 kcal au-dessus de son propre objectif.
    ⚠️ ON NE CHOISIT PAS UN NOUVEAU PARTAGE ICI : on adopte celui qui existe
    déjà et qui ferme, et on prend au passage `carbGoal`/`fatGoal` si la
    personne les a voulus — `flNutGoals` les lit, cette charge les ignorait.
    LE GARDE DU BUDGET INCONNU RESTE : sans kcal, la cible est absente et pas
    zéro (v2183) ; `flNutGoals` rendrait 0 quand seules les protéines sont
    connues, et trois barres pleines annonceraient un dépassement inventé. */
 var butG=(kcalBut!=null&&_gp&&_gp.carb!=null)?_gp.carb:null,
     butL=(kcalBut!=null&&_gp&&_gp.fat!=null)?_gp.fat:null;

 var JJ=['D','L','M','M','J','V','S'];
 var jours=[];
 /* v1461 — le ruban finit lui aussi au jour regarde, et `actif:i===0` designe
    donc bien la journee selectionnee : la derniere colonne. */
 for(var i=6;i>=0;i--){
  var d=new Date();d.setDate(d.getDate()+_off-i);
  jours.push({lettre:JJ[d.getDay()],numero:String(d.getDate()),actif:i===0});
 }
 var MOIS=['janvier','février','mars','avril','mai','juin','juillet','août',
           'septembre','octobre','novembre','décembre'];
 var JOURS=['dimanche','lundi','mardi','mercredi','jeudi','vendredi','samedi'];
 /* v1459 — LA DATE AFFICHEE EST CELLE QU ON REGARDE. Elle lisait `new Date()`,
    c est-a-dire toujours aujourd hui : la page pouvait montrer les repas du 8
    sous le titre « jeudi 13 aout ». Un chiffre juste presente au mauvais jour
    est un chiffre qui ment. */
 var au=new Date(); au.setDate(au.getDate()+_off);

 return {
  aDesDonnees:true,
  date: JOURS[au.getDay()]+' '+au.getDate()+' '+MOIS[au.getMonth()],
  restantes: mil(reste),
  /* 14 sept. 2026 — CE QUI A VRAIMENT ETE MANGE, SANS PLAFOND.
     `restantes` est plafonnee a zero juste au-dessus : passe le budget, elle ne
     dit plus rien. L hote reconstituait le mange par `budget - restantes`, et le
     widget carre annoncait donc « 1 993 sur 1 993 kcal » pour 2 600 manges —
     607 kcal effacees, jauge pleine, et sa branche « au-dessus » injouable.
     On envoie la VRAIE entree plutot que de la laisser reconstituer. */
  consommees: mil(pris),
  budget: mil(budget),
  /* 12 septembre 2026 — SANS BUDGET, LA CARTE DIT POURQUOI. Sur un profil sans
     poids, « CALORIES RESTANTES » rendait quatre absences d affilee (« — »,
     « sur — kcal », « — % utilisees », une piste vide) la ou l accueil dit
     deja « ajoute ton poids ». Meme temoin que l accueil (`flMetaBase`), meme
     phrase cote hote. Quand le corps est connu mais qu aucun objectif n a ete
     voulu, on le dit aussi. */
  manqueProfil: (function(){try{return (typeof flMetaBase==='function')&&flMetaBase()==null;}catch(e){return false;}})(),
  pourcent: pct,
  /* ═══ 11 sept. 2026 — LE BUDGET ABSENT DIT POURQUOI ══════════════════════
     Sans metabolisme de base (donc sans poids saisi), `flBesoinDuJour` ne rend
     pas de kcal : la carte « CALORIES RESTANTES » affichait alors QUATRE
     absences d'affilee — le grand tiret, « sur — kcal », « — % utilisees » et
     une piste vide. La regle du poids de l'absence (v2338) etait tenue ; ce
     qui manquait, c'est de NOMMER la cause.
     La maison le fait deja deux taps plus loin : la page Balance calorique
     rend « AUCUN REPAS NOTE CE JOUR-LA » au lieu d'un tiret nu. Le natif ne
     peut pas le deduire tout seul — `budget == null` ne dit pas POURQUOI, et
     reconstituer une entree du moteur est interdit ici. On envoie donc le
     drapeau, exactement celui que l'accueil utilise deja (`manqueProfil`,
     flAccueilData) : `flMetaBase()` absent. */
  manqueProfil: (function(){try{
    return (typeof flMetaBase==='function') && flMetaBase()==null;
  }catch(e){return false}})(),
  part: budget?Math.max(0,Math.min(1,pris/budget)):null,
  jours: jours,
  macros: [
   {nom:'Protéines', actuel:Math.round(P), cible:butP, couleur:'#fb6015'},
   {nom:'Glucides',  actuel:Math.round(G), cible:butG, couleur:'#3d9b40'},
   {nom:'Lipides',   actuel:Math.round(L), cible:butL, couleur:'#1e6fe0'}
  ],
  repas: repas.map(function(m,i){
   var mp=Math.round(m.prot||0),mg=Math.round(m.carb||0),ml=Math.round(m.fat||0);
   /* ═══ v1930 — LA TROISIEME PORTE DE LA NOTE, ET C EST CELLE QU ON REGARDE ══
      La v1923 a aligne `flRepasData` et `flMealScore` sur la note de QUALITE.
      Elle a manque celle-ci — et c est justement celle que Dino a sous les yeux :
      le Journal Nutrition sert la fiche AVEC SA PROPRE CHARGE, il ne redemande
      rien au moteur (`NutritionView`, `repasOuvert = r`). Trois portes pour une
      note, deux reparees, une oubliee : le banc de la v1923 ne la decoupait meme
      pas ([[flint-correction-non-propagee]]).

      CE QU ELLE FAISAIT : `part proteique x 30`, PLANCHER A 1. Sur la banane du
      26 aout — 98 kcal, 1 g de proteines — cela donne round(1,22) = 1, et le
      plancher garantit qu elle ne peut pas faire autrement. C est le 1/10 vu a
      l ecran, au chiffre pres. Une note qui ne peut structurellement pas monter
      pour un fruit brut n est pas une note de qualite.

      DESORMAIS LA MEME PORTE QUE LES DEUX AUTRES. Absente si le repas n a pas de
      note connue : la fiche masque alors son acte, elle n invente pas. */
   var note=(typeof flMealScore==='function')?flMealScore(m):null;
   /* v1032 — le detail natif a besoin du BRUT : rang pour supprimer, ph pour
      la photo, les macros en nombres pour les barres. */
   /* v1447 — LES ALIMENTS DU PLAT REMONTENT AU JOURNAL.
      `m.ing` est écrit par les deux chemins d'ajout (la fiche web flNAddMeal
      et, depuis cette version, flAjouterRepas côté natif) ; il porte des NOMS
      d'aliments, sans quantité. Absent sur tous les repas d'avant : on rend
      null, et la carte n'affiche simplement pas le bloc. */
   var ing=(m.ing&&m.ing.length)?m.ing.map(String).filter(Boolean):null;
   return {heure:m.time||null, nom:m.name||'Repas',
           ligne:mil(m.kcal)+' kcal · '+mp+' P · '+mg+' G · '+ml+' L',
           note:note!=null?String(note):null,
           rang:i, ph:m.ph||null, ing:(ing&&ing.length)?ing:null,
           kcal:Math.round(m.kcal||0), prot:mp, carb:mg, fat:ml};
  })
 };
}catch(e){return {aDesDonnees:false};}};

function flScanChoice(){var ex=document.getElementById('flScanSheet');if(ex){ex.remove();try{flSheetBack(false);}catch(e){}return;}
 try{flSheetBack(true);}catch(e){}
 var d=document.createElement('div');d.id='flScanSheet';d.style.cssText='position:fixed;inset:0;z-index:96;';
 d.innerHTML='<div id="flScanBk" style="position:absolute;inset:0;background:rgba(20,17,15,.38);opacity:0;transition:opacity .25s;"></div>'
  +'<div id="flScanCard" style="position:absolute;left:50%;bottom:0;transform:translateX(-50%) translateY(105%);transition:transform .34s cubic-bezier(0.32,0.72,0,1);width:100%;max-width:464px;background:#fff;border-radius:26px 26px 0 0;padding:22px 22px calc(18px + env(safe-area-inset-bottom,0px));box-shadow:0 -8px 40px rgba(0,0,0,.14);">'
  +'<div style="width:44px;height:5px;border-radius:3px;background:#ece7df;margin:0 auto 18px;"></div>'
  +'<div style="font-family:Archivo,-apple-system,sans-serif;font-size:26px;font-weight:700;letter-spacing:-0.02em;color:#14110f;display:flex;align-items:center;gap:6px;">Scanner un repas<span style="width:7px;height:7px;border-radius:50%;background:#fb6015;margin-top:8px;"></span></div>'
  +'<button onclick="flScanGo(\'cam\')" style="width:100%;display:flex;align-items:center;gap:16px;margin-top:18px;background:#fff;border:1px solid #f0ece5;border-radius:20px;padding:16px 18px;cursor:pointer;text-align:left;box-shadow:0 3px 12px rgba(150,118,72,0.05);">'
   +'<span style="width:48px;height:48px;border-radius:50%;background:#fff3ee;display:flex;align-items:center;justify-content:center;color:#fb6015;flex-shrink:0;"><i class="ti ti-camera" style="font-size:24px;"></i></span>'
   +'<span style="flex:1;"><span style="display:block;font-family:-apple-system,system-ui,sans-serif;font-size:16px;font-weight:700;color:#14110f;">Prendre en photo mon plat</span><span style="display:block;font-size:12.5px;color:#8a8378;margin-top:3px;">L\u2019IA estime calories &amp; macros</span></span>'
   +'<i class="ti ti-chevron-right" style="color:#fb6015;font-size:18px;"></i></button>'
  +'<button onclick="flScanGo(\'bar\')" style="width:100%;display:flex;align-items:center;gap:16px;margin-top:12px;background:#fff;border:1px solid #f0ece5;border-radius:20px;padding:16px 18px;cursor:pointer;text-align:left;box-shadow:0 3px 12px rgba(150,118,72,0.05);">'
   +'<span style="width:48px;height:48px;border-radius:50%;background:#fff3ee;display:flex;align-items:center;justify-content:center;color:#fb6015;flex-shrink:0;"><i class="ti ti-barcode" style="font-size:24px;"></i></span>'
   +'<span style="flex:1;"><span style="display:block;font-family:-apple-system,system-ui,sans-serif;font-size:16px;font-weight:700;color:#14110f;">Scanner une étiquette</span><span style="display:block;font-size:12.5px;color:#8a8378;margin-top:3px;">Infos produit automatiques</span></span>'
   +'<i class="ti ti-chevron-right" style="color:#fb6015;font-size:18px;"></i></button>'
  +'<div style="display:flex;gap:12px;margin-top:14px;">'
   +'<button onclick="flScanGo(\'gal\')" style="flex:1;display:flex;align-items:center;justify-content:center;gap:8px;background:#faf5ee;border:none;border-radius:16px;padding:13px;cursor:pointer;font-family:-apple-system,system-ui,sans-serif;font-size:13.5px;font-weight:600;color:#14110f;"><i class="ti ti-photo"></i>Galerie</button>'
   +'<button onclick="flScanGo(\'txt\')" style="flex:1;display:flex;align-items:center;justify-content:center;gap:8px;background:#faf5ee;border:none;border-radius:16px;padding:13px;cursor:pointer;font-family:-apple-system,system-ui,sans-serif;font-size:13.5px;font-weight:600;color:#14110f;"><i class="ti ti-pencil"></i>Écrire</button>'
  +'</div></div>';
 document.body.appendChild(d);
 document.getElementById('flScanBk').onclick=flScanClose;
 requestAnimationFrame(function(){document.getElementById('flScanBk').style.opacity='1';document.getElementById('flScanCard').style.transform='translateX(-50%) translateY(0)';});
 if(typeof haptic==='function')haptic();}

function flScanClose(){var d=document.getElementById('flScanSheet');if(!d)return;var bk=document.getElementById('flScanBk'),cd=document.getElementById('flScanCard');if(bk)bk.style.opacity='0';if(cd)cd.style.transform='translateX(-50%) translateY(105%)';setTimeout(function(){if(d)d.remove();},320);}

function flScanGo(k){try{flSheetBack(false);}catch(e){}flScanClose();setTimeout(function(){if(k==='cam'&&window.nutCamera)nutCamera();else if(k==='bar'&&window.nutBarcode)nutBarcode();else if(k==='gal'&&window.nutGallery)nutGallery();else if(k==='txt'&&window.nutDescribe)nutDescribe();},330);}

function flMealScore(m){var k=+m.kcal||0;if(!k)return null;return (m.score!=null)?m.score:null;}

function flMealCard(doc,m,i,K){
 var card=doc.createElement('div');
 card.setAttribute('style','background:#fff;border:1px solid #f5f2ed;border-radius:16px;padding:15px 16px 20px;box-shadow:0 6px 20px rgba(20,17,15,.035);margin-bottom:10px;cursor:pointer');
 var score=flMealScore(m);
 var thumb=m.photo?('<div style="width:80px;height:80px;flex-shrink:0;border-radius:16px;background-image:url('+m.photo+');background-position:center;background-repeat:no-repeat;'+(m.prod?'background-size:contain;background-color:#fff;border:1px solid #f0ece5':'background-size:cover')+'"></div>')
  :('<div style="width:80px;height:80px;flex-shrink:0;border-radius:16px;background:#f8f7f5;display:flex;align-items:center;justify-content:center;color:#c9c2b6"><svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 7c1.5-2.5 4-3 5.5-2.5C19 5 19.5 8 18 12s-3.5 6.5-5 6.5-1.5-1-3-1-1.5 1-3 1S3.5 16 2.5 12 3 5 4.5 4.5 10.5 4.5 12 7z"></path></svg></div>');
 var kcalTxt=m.analyzing?'Analyse en cours…':((m.est?'~':'')+flNutFmt(m.kcal||0)+' kcal'+((+m.prot)?' · '+Math.round(m.prot)+' P':''));
 var badge=score!=null?('<span style="flex-shrink:0;align-self:flex-end;display:inline-flex;align-items:baseline;gap:1px;padding:8px 14px;border-radius:12px;background:#f8f7f5;font-family:Archivo,-apple-system,system-ui,sans-serif"><span style="font-size:17px;font-weight:600;color:#14110f">'+score+'</span><span style="font-size:10.5px;font-weight:400;color:#a7a29a">/10</span></span>'):'';
 card.innerHTML='<div style="font-family:-apple-system,system-ui,sans-serif;font-size:12px;font-weight:300;color:#6f6a61;margin-bottom:6px">'+esc(flClockStr(m.time||''))+'</div>'
  +'<div style="display:flex;align-items:flex-start;gap:14px">'+thumb
   +'<div style="flex:1;min-width:0">'
    +'<div style="font-family:-apple-system,\'Helvetica Neue\',system-ui,sans-serif;font-size:16px;font-weight:600;letter-spacing:-0.02em;color:#14110f;margin-bottom:11px">'+esc(m.name||'Repas')+'</div>'
    +'<div style="font-family:Archivo,-apple-system,system-ui,sans-serif;font-size:13px;font-weight:300;'+(m.analyzing?'font-style:italic;color:#a29c92':'color:#55504a')+'">'+kcalTxt+'</div>'
   +'</div>'
   +badge
  +'</div>';
 /* la maquette avale les 'click' avant la cible → dual click+pointerup, dédup + gardes */
 var _lp,_t0=0,_px=0,_py=0,_fired=0;
 function goCard(ev){var nw=Date.now();if(nw-_fired<700)return;_fired=nw;if(ev){try{ev.preventDefault();ev.stopPropagation();}catch(e){}}flNMealDetail(K,i);}
 card.addEventListener('click',goCard,true);
 card.addEventListener('pointerdown',function(ev){_t0=Date.now();_px=ev.clientX;_py=ev.clientY;_lp=setTimeout(function(){_fired=Date.now();flNCtxMenu(K,i);},480);},{passive:true});
 ['pointerleave','pointercancel'].forEach(function(t){card.addEventListener(t,function(){clearTimeout(_lp);},{passive:true});});
 card.addEventListener('pointermove',function(ev){if(Math.abs(ev.clientX-_px)>12||Math.abs(ev.clientY-_py)>12)clearTimeout(_lp);},{passive:true});
 card.addEventListener('pointerup',function(ev){clearTimeout(_lp);
  if(Date.now()-_t0>=460)return;
  if(Math.abs(ev.clientX-_px)>12||Math.abs(ev.clientY-_py)>12)return;
  goCard(ev);},true);
 return card;
}

function flOpenNutrition(doc){try{doc=doc||(document.getElementById('frToday')||{}).contentDocument;if(!doc)return;var nut=doc.getElementById('screen-nutrition');if(!nut)return;window._nutOff=window._nutOff||0;mdNutrition(doc);
 /* v777 — l'onglet s'affiche DIRECT, sans glissement depuis le bas */
 var tr0=nut.style.transition;nut.style.setProperty('transition','none','important');
 nut.style.setProperty('transform','translateX(-50%) translateX(0px)','important');
 void nut.offsetHeight;
 setTimeout(function(){try{nut.style.removeProperty('transition');nut.style.transition=tr0||'';}catch(e){}},60);
 nut.style.pointerEvents='auto';nut.scrollTop=0;
 try{if(typeof flScrIn==='function')flScrIn(nut);}catch(_ei){}   /* v854 — fin du claquement */
 /* audit v780 — onglet racine : le chevron retour (haut gauche) n'a plus de sens */
 try{if(!nut._flBackHidden){setTimeout(function(){try{
  [].slice.call(nut.querySelectorAll('[role="button"],button')).forEach(function(b3){
   var r3=b3.getBoundingClientRect();
   if(r3.top>0&&r3.top<120&&r3.left<80&&r3.width<70&&b3.querySelector('svg')&&!(b3.textContent||'').trim()){
    b3.style.setProperty('display','none','important');nut._flBackHidden=1;}});}catch(e4){}},160);}}catch(_e5){}setTimeout(function(){try{mdNutrition(doc);mdFonts(doc);}catch(e){}},220);}catch(e){}}

function flNmealsSave(K,a){a.sort(function(x,y){return flNmin(x.time)-flNmin(y.time);});DB.set('meals_'+K,a);}

function flNAddMeal(name,kcal,prot,opts){opts=opts||{};var doc=flNdoc();
 var day=flN.when.day||0,off=-day,K=tk(off);var mn=flN.when.min<0?flNnow():flN.when.min;
 var meal={name:name,kcal:(kcal==='—'||kcal==null)?0:+kcal,prot:+prot||0,carb:+opts.carb||0,fat:+opts.fat||0,time:flNfmt(mn),est:!!opts.est,portion:1};
 meal.k0=meal.kcal;meal.p0=meal.prot;meal.c0=meal.carb;meal.f0=meal.fat;
 if(opts.photo)meal.photo=opts.photo;if(opts.prod)meal.prod=1;if(opts.ing&&opts.ing.length)meal.ing=opts.ing;if(opts.score!=null){meal.score=opts.score;
   /* v1930 — `sv` NE S APPOSE QUE SUR UNE NOTE DU MOTEUR COURANT.
      Cette porte sert aussi les aliments du catalogue, dont les notes sont
      ECRITES A LA MAIN (`h:4`, `h:5`, `h:7` dans FLN_DB) : les estampiller
      « moteur 3 » ferait mentir le champ des sa naissance. L appelant dit
      d ou vient sa note ; sans lui, on ne suppose rien. */
   if(opts.sv!=null)meal.sv=opts.sv;}
 var a=mealsOf(K);a.push(meal);try{flNmealsSave(K,a);}catch(e1){flNPrunePhotos('meals_'+K);try{flNmealsSave(K,a);}catch(e2){delete meal.photo;flNmealsSave(K,a);}}
 flNCloseAll();flNSheetClose('flnAddSheet');
 window._nutOff=off;meal._hl=1;mdNutrition(doc);
 flNToast('Ajouté à '+flNfmt(mn)+(day>0?' ('+(flNDayLabels()[day]||'')+')':''),function(){var b=mealsOf(K);var ix=b.indexOf(meal);if(ix>=0)b.splice(ix,1);flNmealsSave(K,b);mdNutrition(doc);});
 flN.when={label:'Maintenant',min:-1,day:0};flNSyncWhen();
 try{go&&typeof go==='function';}catch(e){}
}

function flNRecentMeals(){var seen={},out=[];for(var i=1;i<=10&&out.length<4;i++){var arr=mealsOf(tk(-i));for(var j=arr.length-1;j>=0;j--){var m=arr[j];var key=(m.name||'').toLowerCase();if(!key||seen[key])continue;seen[key]=1;out.push({name:m.name,kcal:m.k0||m.kcal,prot:m.p0||m.prot,carb:m.c0||m.carb,fat:m.f0||m.fat,sub:(i===1?'hier':i+' j')+' · '+flNInt(m.k0||m.kcal)+' kcal'});if(out.length>=4)break;}}return out;}

function flNBarcodeStart(el){flNCamHint(el);el._flBCActive=true;
 var v=el.querySelector('.flnCamVid');
 var win=(flNdoc()||{}).defaultView||window;
 var BD=window.BarcodeDetector||(win&&win.BarcodeDetector);
 if(BD){ /* détecteur NATIF (matériel) : quasi instantané */
  try{if(!el._flBD)el._flBD=new BD({formats:['ean_13','ean_8','upc_a','upc_e','code_128','code_39','qr_code']});
   (function loop(){if(!el._flBCActive||el._flMode!=='Code-barres')return;
    if(v&&v.videoWidth){el._flBD.detect(v).then(function(codes){
      if(codes&&codes.length&&el._flBCActive&&el._flMode==='Code-barres'&&codes[0].rawValue){try{haptic&&haptic(12);}catch(e){}flNBarcodeHit(el,codes[0].rawValue);return;}
      el._flZXLoop=setTimeout(loop,110);
     }).catch(function(){el._flZXLoop=setTimeout(loop,180);});}
    else el._flZXLoop=setTimeout(loop,150);})();
   return;}catch(e){}}
 /* repli : ZXing en DÉCODAGE CONTINU sur le même élément vidéo (pas de snapshots JPEG) */
 flNLoadZX(function(ZX){if(!ZX||!el._flBCActive||el._flMode!=='Code-barres')return;
  try{if(!el._flZXReader)el._flZXReader=new ZX.BrowserMultiFormatReader();
   el._flZXReader.timeBetweenDecodingAttempts=80;
   var onHit=function(res){if(res&&res.getText&&el._flBCActive&&el._flMode==='Code-barres'){try{haptic&&haptic(12);}catch(e){}flNBarcodeHit(el,res.getText());}};
   /* ZXing ≥0.19 : decodeFromVideoElement(v) ne prend PLUS de callback (décodage unique, promesse) —
      le continu s'appelle decodeFromVideoElementContinuously. Sans ça, iPhone (pas de BarcodeDetector natif) = scan muet. */
   if(el._flZXReader.decodeFromVideoElementContinuously){el._flZXReader.decodeFromVideoElementContinuously(v,onHit);}
   else{el._flZXReader.decodeFromVideoElement(v,onHit);}
  }catch(e){flNCamHint(el,'Scanner indisponible — utilise Manuel');}});}

function flNBarcodeStop(el){try{if(el){el._flBCActive=false;
 if(el._flZXLoop){clearTimeout(el._flZXLoop);el._flZXLoop=null;}
 if(el._flZXReader){try{el._flZXReader.stopContinuousDecode&&el._flZXReader.stopContinuousDecode();}catch(e){}el._flZXReader=null;}
 /* garde-fou : si ZXing a détaché la vidéo, on rebranche NOTRE flux */
 var v=el.querySelector&&el.querySelector('.flnCamVid');
 if(v&&el._flStream&&v.srcObject!==el._flStream){v.srcObject=el._flStream;v.play&&v.play().catch(function(){});}
}}catch(e){}}

function flNBarcodeHit(el,code){flNBarcodeStop(el);flNCamClose();flNBarcodeLookup(code);}

function flNBarcodeLookup(code){code=String(code||'').replace(/\D/g,'');if(!code){flNToast('Code invalide');return;}
 flNToast('Recherche du produit…');
 flFetch('https://world.openfoodfacts.org/api/v2/product/'+code+'.json?fields=product_name,product_name_fr,brands,nutriments,image_front_url,image_url,nutriscore_grade').then(function(r){return r.json();}).then(function(d){
  if(!d||d.status!==1||!d.product){flNToast('Produit introuvable — saisis-le à la main');flNManual();return;}
  var p=d.product,n=p.nutriments||{};var nm=(p.product_name_fr||p.product_name||'Produit');if(p.brands)nm=nm+' · '+String(p.brands).split(',')[0];
  var img=p.image_front_url||p.image_url||null;
  var nsc={a:9,b:8,c:6,d:4,e:2}[String(p.nutriscore_grade||'').toLowerCase()]||null; /* Nutri-Score officiel */
  flNScanReviewOpen({status:'done',name:nm+' (100 g)',kcal:Math.round(n['energy-kcal_100g']||n['energy-kcal']||0),prot:Math.round(n['proteins_100g']||0),carb:Math.round(n['carbohydrates_100g']||0),fat:Math.round(n['fat_100g']||0),photo:img,prod:true,score:nsc});
 }).catch(function(){flNToast('Erreur réseau');});}

function flNScanReviewOpen(st){window._flnScanSt=st;window._flnAnaT0=null;flN.when={label:'Maintenant',min:-1,day:0};
 if(st&&st.status==='pending'){flNAnaScreenShow(st);flNAnaStart();}
 else{flNScanReviewRender();flNOpen('screen-fln-scanres');}}

function flNScanUpdate(r){var st=window._flnScanSt;if(!st)return;
 if(!r||!r.kcal){st.status='fail';if(typeof navigator!=='undefined'&&navigator.onLine===false)st.failMsg='Impossible d\'analyser sans connexion. Reconnecte-toi ou saisis le repas à la main.';else if(window._flScanFail)st.failMsg=window._flScanFail;}
 else{st.status='done';st.name=r.name||'Mon repas';st.kcal=Math.round(r.kcal||0);st.prot=Math.round(r.prot||0);st.carb=Math.round(r.carb||0);st.fat=Math.round(r.fat||0);if(r.score!=null)st.score=r.score;
  try{var items=window._flintScanItems;if(items&&items.length)st.ing=items.map(function(it){return {name:it.name,grams:Math.round(it.grams||0),kcal:Math.round(it.kcal||0)};});}catch(e){}}
 flNAnaStop();window._flnAnaT0=null;flNAnaScreenHide();
 flNScanReviewRender();flNOpen('screen-fln-scanres');try{haptic&&haptic(10);}catch(e){}}

function flNScanReviewRender(){var st=window._flnScanSt;if(!st)return;var doc=flNdoc();if(!doc)return;
 if(st.status==='pending'){flNAnaSetPhoto(st.photo);return;}/* l'état « analyse » a son propre écran plein écran */
 var photoBlock=st.photo?('<div style="height:210px;border-radius:22px;background-image:url('+st.photo+');background-position:center;background-repeat:no-repeat;'+(st.prod?'background-size:contain;background-color:#fff;border:1px solid rgb(240,236,229)':'background-size:cover')+';box-shadow:rgba(20,17,15,.05) 0 8px 26px;margin-bottom:16px"></div>'):'';
 var body,title;
 if(st.status==='fail'){title='Ton repas';
  body=photoBlock
   +'<div class="fln-card" style="text-align:center;padding:26px 18px"><div style="font-family:Archivo,-apple-system,sans-serif;font-size:17px;font-weight:600;color:rgb(20,17,15)">Analyse indisponible</div>'
   +'<div style="font-family:-apple-system,system-ui,sans-serif;font-size:13px;color:rgb(167,162,154);margin-top:6px">'+esc(st.failMsg||'Réseau ou service indisponible — tu peux saisir le repas à la main.')+'</div></div>'
   +'<button class="fln-btn pri" id="flnSrManual">Saisir à la main</button>';
 }else{title=st.name||'Ton repas';
  var score=(st.score!=null)?st.score:flMealScore({kcal:st.kcal,prot:st.prot});
  var ingRows=(st.ing&&st.ing.length)?st.ing.map(function(g2){return '<div class="fln-li"><div><div class="n">'+esc(g2.name)+'</div><div class="d">'+g2.grams+' g · '+flNInt(g2.kcal)+' kcal</div></div></div>';}).join(''):'';
  body=photoBlock
   +flNMacroCard(st.kcal,st.prot,st.carb,st.fat,score)
   +(ingRows?('<div class="fln-k">Aliments détectés</div>'+ingRows+'<div style="height:6px"></div>'):'')
   +'<div class="fln-row" style="margin-bottom:14px"><span class="fln-k" style="margin:0">Mangé :</span><span style="flex:1"></span><button class="fln-when flnSrWhen">🕐 <span class="fln-wlab">'+flNWhenLabel()+'</span> ▾</button></div>'
   +'<button class="fln-btn pri" id="flnSrAdd">Ajouter au journal</button>'
   +'<div style="text-align:center;font-family:-apple-system,system-ui,sans-serif;font-size:12px;color:rgb(167,162,154);margin-top:10px">Retour = ne pas enregistrer</div>';
 }
 var el=flNScreen('screen-fln-scanres',esc(title),body);
 var man=el.querySelector('#flnSrManual');if(man)man.addEventListener('click',function(){flNClose('screen-fln-scanres');flNManual();});
 var wh=el.querySelector('.flnSrWhen');if(wh)wh.addEventListener('click',function(){flNOpenWhen('scanres');});
 var add=el.querySelector('#flnSrAdd');if(add)add.addEventListener('click',function(){
  flNAddMeal(st.name,st.kcal,st.prot,{carb:st.carb,fat:st.fat,est:true,photo:st.photo,prod:st.prod,ing:st.ing,score:st.score});
  window._flnScanSt=null;});
}

function flNScanPhoto(el){var c=flNCamShotThumb(el,1100),tc=flNCamShotThumb(el,1200);
 var thumb=null;try{if(tc)thumb=tc.toDataURL('image/jpeg',0.9);}catch(e){}
 flNCamClose();
 flNScanReviewOpen({status:'pending',photo:thumb,prod:false});
 if(!c||typeof window.analyzeMealPhoto!=='function'){flNScanUpdate(null);return;}
 c.toBlob(function(blob){if(!blob){flNScanUpdate(null);return;}var file=new File([blob],'repas.jpg',{type:'image/jpeg'});window.analyzeMealPhoto(file).then(function(r){flNScanUpdate(r);}).catch(function(){flNScanUpdate(null);});},'image/jpeg',0.82);}

function flNScanFromFile(file){if(!file)return;
 flNScanReviewOpen({status:'pending',photo:null,prod:false});
 try{var fr=new FileReader();fr.onload=function(e){var setP=function(thumb){var st=window._flnScanSt;if(st){st.photo=thumb;flNScanReviewRender();}};
  if(typeof _downscaleImg==='function')_downscaleImg(e.target.result,1200,setP,0.9);else setP(e.target.result);};fr.readAsDataURL(file);}catch(e){}
 if(typeof window.analyzeMealPhoto==='function')window.analyzeMealPhoto(file).then(function(r){flNScanUpdate(r);}).catch(function(){flNScanUpdate(null);});
 else flNScanUpdate(null);}

function flNFoodDetail(f){var doc=flNdoc();var base={kcal:f[1],prot:f[2],carb:f[4],fat:f[5]},grams=100;
 function recalc(){var r=grams/100;return {kcal:Math.round(base.kcal*r),prot:+(base.prot*r).toFixed(1),carb:+(base.carb*r).toFixed(1),fat:+(base.fat*r).toFixed(1)};}
 var body='<div class="fln-card"><div class="fln-k">Portion</div>'
  +'<div class="fln-row" style="justify-content:center;gap:16px;border:1px solid rgb(240,236,229);border-radius:14px;padding:12px;background:rgb(250,248,245)">'
  +'<button id="flnGm" style="font-size:20px;font-weight:700;background:none;border:none;color:rgb(251,96,21);cursor:pointer;padding:0 8px">−</button>'
  +'<span id="flnGval" style="font-family:Archivo,sans-serif;font-size:20px;font-weight:700;cursor:pointer;text-decoration:underline dotted;text-underline-offset:3px">100</span><span style="color:rgb(167,162,154);font-size:14px">g</span>'
  +'<button id="flnGp" style="font-size:20px;font-weight:700;background:none;border:none;color:rgb(251,96,21);cursor:pointer;padding:0 8px">+</button></div>'
  +'<div class="fln-row" style="margin-top:12px;font-size:13px;font-family:-apple-system,system-ui,sans-serif"><span><b id="flnFk" style="font-family:Archivo,sans-serif;font-size:16px">130</b> kcal</span><span style="flex:1"></span><span id="flnFm" style="color:rgb(111,106,97)">2 P · 9 G · 12 L</span></div></div>'
  +'<div class="fln-row" style="margin-bottom:14px"><span class="fln-k" style="margin:0">Mangé :</span><span style="flex:1"></span><button class="fln-when fln-whenbtn4">🕐 <span class="fln-wlab">'+flNWhenLabel()+'</span> ▾</button></div>'
  +'<button class="fln-btn pri" id="flnFadd">Ajouter</button>';
 var el=flNScreen('screen-fln-food',esc(f[0]),body);
 function upd(){var r=recalc();el.querySelector('#flnGval').textContent=grams;el.querySelector('#flnFk').textContent=flNInt(r.kcal);el.querySelector('#flnFm').textContent=r.prot+' P · '+r.carb+' G · '+r.fat+' L';}
 el.querySelector('#flnGm').addEventListener('click',function(){grams=Math.max(5,grams-10);upd();});
 el.querySelector('#flnGp').addEventListener('click',function(){grams+=10;upd();});
 el.querySelector('#flnGval').addEventListener('click',function(){var v=prompt('Grammes ?',grams);if(v!=null&&!isNaN(+v)&&+v>0){grams=Math.round(+v);upd();}});
 el.querySelector('.fln-whenbtn4').addEventListener('click',function(){flNOpenWhen('food');});
 el.querySelector('#flnFadd').addEventListener('click',function(){var r=recalc();flNAddMeal(f[0]+' '+grams+' g',r.kcal,r.prot,{carb:r.carb,fat:r.fat});});
 upd();flNOpen('screen-fln-food');}

function flMealBase(m){if(m.k0==null){m.k0=+m.kcal||0;m.p0=+m.prot||0;m.c0=+m.carb||0;m.f0=+m.fat||0;}if(m.portion==null)m.portion=1;return m;}

function flNRenameMeal(K,i){var doc=flNdoc();var m=mealsOf(K)[i];if(!m)return;
 var html='<div class="fln-row" style="margin-bottom:14px"><span class="fln-k" style="margin:0">Renommer le repas</span><span style="flex:1"></span><button class="fln-sh-x" id="flnRnX"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#8a857c" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"></path></svg></button></div>'
  +'<input class="fln-input" id="flnRnIn" maxlength="60" autocomplete="off" placeholder="Nom du repas">'
  +'<button class="fln-btn pri" id="flnRnOk">Enregistrer</button>';
 var bg=flNSheet('flnRnSheet',html);if(!bg)return;
 var inp=bg.querySelector('#flnRnIn');inp.value=m.name||'';
 bg.querySelector('#flnRnX').addEventListener('click',function(){flNSheetClose('flnRnSheet');});
 function save(){var v=(inp.value||'').replace(/\s+/g,' ').trim();
  if(!v||v===m.name){flNSheetClose('flnRnSheet');return;}
  var a=mealsOf(K),mm=a[i];if(!mm){flNSheetClose('flnRnSheet');return;}
  var old=mm.name;mm.name=v;flNmealsSave(K,a);
  flNSheetClose('flnRnSheet');mdNutrition(doc);flNMealDetail(K,i);
  try{haptic&&haptic(12);}catch(e){}
  flNToast('Nom modifié',function(){var b=mealsOf(K);if(b[i]){b[i].name=old;flNmealsSave(K,b);mdNutrition(doc);flNMealDetail(K,i);}});}
 bg.querySelector('#flnRnOk').addEventListener('click',save);
 inp.addEventListener('keydown',function(ev){if(ev.key==='Enter'){ev.preventDefault();save();}});
 flNSheetOpen('flnRnSheet');
 setTimeout(function(){try{inp.focus();inp.select();}catch(e){}},360);}

function flNDelMeal(K,i){var doc=flNdoc();var snap=flNSnap(K);var a=mealsOf(K);a.splice(i,1);flNmealsSave(K,a);flNCloseAll();mdNutrition(doc);
 flNToast('Repas supprimé',function(){flNRestore(K,snap);},FLN_IC.trash);}

function flNSaveMeal(K,i){var m=mealsOf(K)[i];if(!m)return;var saved=[];try{saved=DB.get('savedMeals',[]);}catch(e){}
 saved.unshift({name:m.name,kcal:m.k0||m.kcal,prot:m.p0||m.prot,carb:m.c0||m.carb,fat:m.f0||m.fat});if(saved.length>60)saved.length=60;DB.set('savedMeals',saved);
 var doc=flNdoc();function back(){flNClose('screen-fln-meal');if(doc){try{mdNutrition(doc);}catch(e){}}}
 if(typeof flOkShow==='function')flOkShow('Enregistré','Ajouté à Mes aliments',back);else{flNToast('Enregistré dans Mes aliments');back();}}

function flNMealAddIng(K,i,ing){var doc=flNdoc();var a=mealsOf(K),m=a[i];if(!m)return;flMealBase(m);
 var oldK=+m.kcal||0;
 m.ing=m.ing||[];m.ing.push({name:ing.name,grams:ing.grams,kcal:ing.kcal,ih:ing.h});
 m.kcal=Math.round(oldK+ing.kcal);m.prot=Math.round((+m.prot||0)+ing.prot);m.carb=Math.round((+m.carb||0)+ing.carb);m.fat=Math.round((+m.fat||0)+ing.fat);
 m.k0=(+m.k0||oldK)+ing.kcal;m.p0=(+m.p0||0)+ing.prot;m.c0=(+m.c0||0)+ing.carb;m.f0=(+m.f0||0)+ing.fat;
 /* score : moyenne pondérée par les calories (le score du plat glisse vers celui de l'ingrédient) */
 var oldS=flMealScore({kcal:oldK||1,prot:m.prot,score:m.score});
 if(oldS!=null&&ing.h!=null&&(oldK+ing.kcal)>0)m.score=Math.max(1,Math.min(10,Math.round((oldS*oldK+ing.h*ing.kcal)/(oldK+ing.kcal))));
 try{flNmealsSave(K,a);}catch(e){flNPrunePhotos('meals_'+K);try{flNmealsSave(K,a);}catch(e2){}}
 mdNutrition(doc);
 var idx=mealsOf(K).indexOf(mealsOf(K).filter(function(x){return x===m;})[0]);
 flNMealDetail(K,idx>=0?idx:i);}

function flNMealDelIng(K,i,gi){var doc=flNdoc();var a=mealsOf(K),m=a[i];if(!m||!m.ing||!m.ing[gi])return;
 var snap=flNSnap(K);var ing=m.ing[gi];var oldK=+m.kcal||0,newK=Math.max(0,oldK-(+ing.kcal||0));
 var fct=oldK>0?newK/oldK:1;
 m.ing.splice(gi,1);
 m.kcal=Math.round(newK);m.prot=Math.round((+m.prot||0)*fct);m.carb=Math.round((+m.carb||0)*fct);m.fat=Math.round((+m.fat||0)*fct);
 m.k0=Math.max(0,(+m.k0||oldK)-(+ing.kcal||0));m.p0=(+m.p0||0)*fct;m.c0=(+m.c0||0)*fct;m.f0=(+m.f0||0)*fct;
 if(m.score!=null&&ing.ih!=null&&newK>0)m.score=Math.max(1,Math.min(10,Math.round((m.score*oldK-ing.ih*ing.kcal)/newK)));
 flNmealsSave(K,a);mdNutrition(doc);flNMealDetail(K,i);
 flNToast('Ingrédient retiré · −'+flNInt(ing.kcal)+' kcal',function(){flNRestore(K,snap);flNMealDetail(K,i);});}

function flNMealDetail(K,i,lite){var doc=flNdoc();var m=mealsOf(K)[i];if(!m)return;flMealBase(m);
 /* ══ fiche plat — design « Flint Aujourd\u2019hui (1) » (founder 13/07) ══ */
 var d=new Date(K.replace(/-/g,'/'));var dayLbl=FLN_JOURSF[d.getDay()].charAt(0).toUpperCase()+FLN_JOURSF[d.getDay()].slice(1)+' '+d.getDate();
 var G=flNutGoals();
 var SANS='-apple-system,system-ui,sans-serif';
 function pct(v,g){return Math.max(4,Math.min(100,Math.round((+v||0)/(g||1)*100)));}
 var photoIn=m.photo
  ?('<div style="position:absolute;inset:0;background-image:url('+m.photo+');background-position:center;background-repeat:no-repeat;background-size:'+(m.prod?'contain;background-color:#fff':'cover')+'"></div>')
  :('<div style="position:absolute;inset:0;background:#f4f1ec;display:flex;align-items:center;justify-content:center;color:rgb(201,194,182)">'+FLN_IC.leaf+'</div>');
 function infoRow(cls,ic,lab,val,pad){return '<div class="'+cls+'" style="display:flex;align-items:center;gap:16px;padding:'+pad+';cursor:'+(lite?'default':'pointer')+'">'
  +'<span style="flex-shrink:0;width:46px;height:46px;border-radius:50%;background:#faf9f7;display:flex;align-items:center;justify-content:center">'+ic+'</span>'
  +'<div style="min-width:0"><div style="font-family:'+SANS+';font-size:11px;font-weight:300;letter-spacing:.18em;color:#a8a29a;margin-bottom:9px">'+lab+'</div>'
  +'<div style="font-family:Archivo,'+SANS+';font-size:25px;font-weight:300;letter-spacing:-.01em;color:#14110f">'+val+'</div></div></div>';}
 var icClock='<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="#fb6015" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"></circle><path d="M12 8v4.5l3 2"></path></svg>';
 var icCal='<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="#fb6015" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4.5" width="18" height="16" rx="3"></rect><path d="M3 9h18M8 2.5v4M16 2.5v4"></path></svg>';
 function macroCol(lab,v,g){return '<div style="flex:1;padding:0 6px 0 18px;display:flex;flex-direction:column">'
  +'<div style="font-family:'+SANS+';font-size:10px;font-weight:400;letter-spacing:.1em;color:#a8a29a;margin-bottom:12px">'+lab+'</div>'
  +'<div style="font-family:Archivo,'+SANS+';font-size:18px;font-weight:300;letter-spacing:-.01em;color:#14110f;margin-bottom:14px">'+Math.round(v)+' <span style="font-family:'+SANS+';font-size:12px;font-weight:300;color:#14110f">g</span></div>'
  +'<div style="height:3px;border-radius:999px;background:#eceae6;overflow:hidden"><div style="width:'+pct(v,g)+'%;height:100%;border-radius:999px;background:#fb6015"></div></div></div>';}
 var PF5=[0.25,0.5,1,1.5,2];
 var f0=m.portion||1;var pi=0,bd=1e9;PF5.forEach(function(f,ix){var dd=Math.abs(f-f0);if(dd<bd){bd=dd;pi=ix;}});
 var kBase=(+m.k0||+m.kcal||0);
 var ingRows=(m.ing&&m.ing.length)?m.ing.map(function(g,gi){return '<div class="fln-li flnIng" data-gi="'+gi+'"><div><div class="n">'+esc(g.name)+'</div><div class="d">'+g.grams+' g \u00b7 '+flNInt(g.kcal)+' kcal</div></div><button class="fln-plus" style="background:rgb(244,239,232);color:rgb(140,133,124)">\u2715</button></div>';}).join('')
  :'<p style="font-family:'+SANS+';font-size:12px;font-weight:300;color:#a29c92;margin:0 0 16px">D\u00e9tail des ingr\u00e9dients non disponible pour ce repas.</p>';
 var body=''
  +'<h1 class="flnMealName" style="font-family:Archivo,'+SANS+';font-size:40px;font-weight:700;letter-spacing:-.03em;line-height:.98;margin:0 0 32px;color:#14110f;cursor:'+(lite?'default':'pointer')+'">'+esc(m.name)+'<span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:#fb6015;margin-left:3px;vertical-align:baseline"></span>'
   +(lite?'':'<span style="display:inline-flex;vertical-align:middle;margin-left:12px;color:#c9c2b6"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.4 2.4 0 0 1 3.4 3.4L8 18.8 3.6 20l1.2-4.4z"></path></svg></span>')
   +'</h1>'
  /* photo ronde + heure/date */
  +'<div style="display:flex;gap:22px;margin-bottom:26px;align-items:center">'
   +'<div style="position:relative;flex:1;min-width:0;aspect-ratio:1/1;border-radius:999px;overflow:hidden;background:#fff;box-shadow:inset 0 0 0 1px #f0ece5">'+photoIn+'</div>'
   +'<div style="flex:1.05;display:flex;flex-direction:column">'
    +infoRow('flnMealTime',icClock,'HEURE',esc(flClockStr(m.time||'\u2014')),'4px 0 20px')
    +'<div style="height:1px;background:#efece6"></div>'
    +infoRow('flnMealDay',icCal,'DATE',dayLbl,'20px 0 4px')
   +'</div>'
  +'</div>'
  /* APPORTS */
  +'<div style="background:#fff;border-radius:30px;box-shadow:0 2px 10px rgba(20,17,15,.04),0 12px 30px rgba(20,17,15,.05);margin-bottom:18px;padding:30px 22px 34px">'
   +'<div style="font-family:'+SANS+';font-size:13px;font-weight:400;letter-spacing:.2em;color:#9a948b;margin-bottom:26px">APPORTS</div>'
   +'<div style="display:flex;align-items:stretch">'
    +'<div style="flex:.62;padding-right:16px;display:flex;flex-direction:column;justify-content:center">'
     +'<div class="flnApKcal" style="font-family:Archivo,'+SANS+';font-size:40px;font-weight:400;letter-spacing:-.01em;line-height:.85;color:#14110f;margin-left:-2px">'+flNInt(m.kcal)+'</div>'
     +'<div style="font-family:'+SANS+';font-size:12px;font-weight:400;color:#a8a29a;margin-top:8px">kcal</div>'
    +'</div>'
    +'<div style="width:1px;background:#f1ede7;margin:-8px 0"></div>'
    +macroCol('PROT\u00c9INES',m.prot,G.prot)
    +'<div style="width:1px;background:#f7f4ef"></div>'
    +macroCol('GLUCIDES',m.carb,G.carb)
    +'<div style="width:1px;background:#f7f4ef"></div>'
    +macroCol('LIPIDES',m.fat,G.fat)
   +'</div>'
   +(lite?'':'<button id="flnEditVals" style="width:100%;margin-top:24px;padding:15px;border:1.5px solid #f0ece5;border-radius:16px;background:#faf9f7;color:#14110f;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:9px;font-family:Archivo,'+SANS+';font-size:15px;font-weight:500"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fb6015" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.4 2.4 0 0 1 3.4 3.4L8 18.8 3.6 20l1.2-4.4z"></path></svg>Modifier les valeurs</button>')
  +'</div>'
  /* portion + aliments */
  +'<div style="background:#fff;border-radius:30px;padding:24px 24px 26px;box-shadow:0 2px 10px rgba(20,17,15,.04),0 12px 30px rgba(20,17,15,.05);margin-bottom:22px">'
   +(lite?'':(''
    +'<div style="font-family:'+SANS+';font-size:12px;font-weight:500;letter-spacing:.18em;color:#1a1712;margin-bottom:18px">QUELLE PART DE L\u2019ASSIETTE AS-TU MANG\u00c9E ?</div>'
    +'<div style="display:flex;align-items:center;gap:18px;margin-bottom:22px">'
     +'<span class="flnPortVal" style="display:inline-flex;align-items:center;justify-content:center;min-width:58px;height:58px;padding:0 12px;border-radius:18px;background:#fff7f2;font-family:Archivo,'+SANS+';font-size:30px;font-weight:400;letter-spacing:-.02em;line-height:1;color:#fb6015;white-space:nowrap">'+FLN_FRAC[PF5[pi]]+'</span>'
     +'<span style="font-family:'+SANS+';font-size:15px;font-weight:400;color:#2a2620"><span class="flnPortDesc">'+flNPortDesc(PF5[pi])+'</span> \u00b7 <span class="flnPortKcal" style="font-weight:400;color:#2a2620">'+flNInt(kBase*PF5[pi])+'</span> <span style="color:#9a948b">kcal</span></span>'
    +'</div>'
    +'<div class="flnPortTrack" style="position:relative;height:28px;margin:0 6px;cursor:pointer;touch-action:none">'
     +'<div style="position:absolute;left:0;right:0;top:50%;transform:translateY(-50%);height:4px;border-radius:999px;background:#e9e4dc"></div>'
     +'<div class="flnPortFill" style="position:absolute;left:0;top:50%;transform:translateY(-50%);width:'+(pi/4*100)+'%;height:4px;border-radius:999px;background:#fb6015"></div>'
     +'<div class="flnPortThumb" style="position:absolute;left:'+(pi/4*100)+'%;top:50%;transform:translate(-50%,-50%);width:26px;height:26px;border-radius:50%;background:#fb6015;border:4px solid #fff;box-shadow:0 2px 10px rgba(251,96,21,.4)"></div>'
    +'</div>'
    +'<div style="display:flex;justify-content:space-between;margin:10px 0 0;font-family:Archivo,'+SANS+';font-size:15px;font-weight:400;color:#a29c92"><span>\u00bc</span><span>\u00bd</span><span>\u00d71</span><span>\u00d71\u00bd</span><span>\u00d72</span></div>'
    +'<p style="font-family:'+SANS+';font-size:14px;font-weight:300;line-height:1.55;color:#6f6a61;margin:22px 0 0;background:#f7f5f1;border-radius:12px;padding:18px 20px"><span style="color:#fb6015;font-weight:700">\u00ab \u00d7 1 \u00bb</span> = toute l\u2019assiette de la photo, pas un seul aliment. Les calories sont estim\u00e9es pour l\u2019assiette enti\u00e8re, ajuste selon ce que tu as vraiment mang\u00e9.</p>'
    +'<div style="height:1px;background:#f0ece5;margin:24px 0"></div>'))
   +'<div style="font-family:'+SANS+';font-size:15px;font-weight:600;letter-spacing:.12em;color:#1a1712;margin-bottom:8px">ALIMENTS</div>'
   +ingRows
   +(lite?'':'<button id="flnAddIng" style="width:100%;padding:18px;border:1.5px dashed #f0c3ab;border-radius:16px;background:#fffaf7;color:#fb6015;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:10px;font-family:Archivo,'+SANS+';font-size:16px;font-weight:500"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"></path></svg>Ajouter un ingr\u00e9dient</button>')
  +'</div>'
  /* barre d\u2019actions collée en bas */
  +(lite?'':('<div style="position:sticky;bottom:0;display:flex;gap:14px;margin:18px -22px 0;padding:14px 24px calc(env(safe-area-inset-bottom,0px) + 16px);background:#fff;box-shadow:0 -1px 0 #ece7df">'
   +'<button data-mact="del" style="flex:1;padding:20px;border:1.5px solid #ecc9bd;border-radius:18px;background:#fffaf7;color:#fb6015;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:10px;font-family:Archivo,'+SANS+';font-size:17px;font-weight:600;letter-spacing:-.01em"><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6"></path></svg>Supprimer</button>'
   +'<button data-mact="save" style="flex:1.15;padding:20px;border:none;border-radius:18px;background:#fb6015;color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:10px;font-family:Archivo,'+SANS+';font-size:17px;font-weight:600;letter-spacing:-.01em;box-shadow:0 10px 24px rgba(251,96,21,.28)"><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg>Enregistrer</button>'
  +'</div>'));
 var el=flNScreen('screen-fln-meal','',body);
 el.style.background='#fff';
 /* back : cercle 52px du design */
 var bk=el.querySelector('.fln-back');if(bk){bk.style.cssText='width:52px;height:52px;border-radius:50%;border:none;background:#fff;color:#fb6015;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 6px 20px rgba(20,17,15,.08);margin-bottom:24px;padding:0';
  var bs=bk.querySelector('svg');if(bs){bs.setAttribute('width','26');bs.setAttribute('height','26');bs.setAttribute('stroke-width','2.4');}}
 if(!lite){var _mt=el.querySelector('.flnMealTime');if(_mt)_mt.addEventListener('click',function(){flNRetime(K,i);});
 var _md2=el.querySelector('.flnMealDay');if(_md2)_md2.addEventListener('click',function(){flNRetime(K,i);});
 var _nm=el.querySelector('.flnMealName');if(_nm)_nm.addEventListener('click',function(){flNRenameMeal(K,i);});
 var _ev=el.querySelector('#flnEditVals');if(_ev)_ev.addEventListener('click',function(){flNEditVals(K,i);});}
 /* slider de portion : 5 crans, aper\u00e7u live, application au l\u00e2cher */
 (function(){var tr=el.querySelector('.flnPortTrack');if(!tr)return;
  var fill=el.querySelector('.flnPortFill'),th=el.querySelector('.flnPortThumb'),vEl=el.querySelector('.flnPortVal'),dEl=el.querySelector('.flnPortDesc'),kEl=el.querySelector('.flnPortKcal');
  var cur=pi,drag=false;
  function ui(ix){var p=ix/4*100;fill.style.width=p+'%';th.style.left=p+'%';vEl.textContent=FLN_FRAC[PF5[ix]];dEl.textContent=flNPortDesc(PF5[ix]);kEl.textContent=flNInt(Math.round(kBase*PF5[ix]));}
  function ixOf(ev){var r=tr.getBoundingClientRect();var x=Math.max(0,Math.min(r.width,(ev.clientX!=null?ev.clientX:0)-r.left));return Math.max(0,Math.min(4,Math.round(x/r.width*4)));}
  tr.addEventListener('pointerdown',function(ev){drag=true;try{tr.setPointerCapture(ev.pointerId);}catch(e){}var ix=ixOf(ev);if(ix!==cur){cur=ix;ui(ix);try{haptic&&haptic(3);}catch(e){}}});
  tr.addEventListener('pointermove',function(ev){if(!drag)return;var ix=ixOf(ev);if(ix!==cur){cur=ix;ui(ix);try{haptic&&haptic(3);}catch(e){}}});
  tr.addEventListener('pointerup',function(){if(!drag)return;drag=false;if(PF5[cur]!==(m.portion||1))flNPortion(K,i,PF5[cur],true);});
  tr.addEventListener('pointercancel',function(){drag=false;});})();
 [].slice.call(el.querySelectorAll('.flnIng')).forEach(function(li){var x=li.querySelector('.fln-plus');if(x){if(lite){x.style.display='none';}else{x.addEventListener('click',function(ev){ev.preventDefault();ev.stopPropagation();flNMealDelIng(K,i,+li.dataset.gi);},true);}}});
 var _ai=el.querySelector('#flnAddIng');if(_ai)_ai.addEventListener('click',function(){flNIngAdd(function(ing){flNMealAddIng(K,i,ing);},m.name);});
 [].slice.call(el.querySelectorAll('[data-mact]')).forEach(function(b){b.addEventListener('click',function(){var a=b.dataset.mact;
   if(a==='save'){flNSaveMeal(K,i);}
   else if(a==='del'){flNDelMeal(K,i);}});});
 flNOpen('screen-fln-meal');
 /* filet : si la maquette a ouvert SA fiche repas (ancienne interface) sur le même tap, on la referme */
 function mnKill(){try{var nm=doc.getElementById('screen-meal');if(nm){nm.style.setProperty('transform','translateX(-50%) translateY(100%)','important');nm.style.setProperty('pointer-events','none','important');}}catch(e){}}
 mnKill();setTimeout(mnKill,180);setTimeout(mnKill,520);}

function mealsOf(k){var a=DB.get('meals_'+(k||tk()),[]);for(var i=0;i<a.length;i++){if(a[i]&&a[i].name)a[i].name=flNCleanName(a[i].name);}return a}

function renderNutrition(){var k=tk(),tt=nutTotals(k),g=getNutGoals(k);renderHydro();
 set('nutSumK',fmtN(tt.kcal));
 set('nutGoal',fmtN(g.kcal));
 var reste=g.kcal-tt.kcal,rEl=document.getElementById('nutReste');
 if(rEl){if(reste>=0){rEl.innerHTML='reste '+fmtN(reste);rEl.className='nut2-rst';}else{rEl.innerHTML='dépassé '+fmtN(-reste);rEl.className='nut2-rst over';}}
 set('nut2Prot',Math.round(tt.prot));set('nut2Carb',Math.round(tt.carb));set('nut2Fat',Math.round(tt.fat));
 var gP=g.prot||150,gC=g.carb||250,gF=g.fat||70,C=94.25;
 function ring(id,frac){var e=document.getElementById(id);if(e)e.style.strokeDasharray=(Math.max(0,Math.min(1,frac||0))*C).toFixed(1)+' '+C}
 ring('nut2RingP',tt.prot/gP);ring('nut2RingC',tt.carb/gC);ring('nut2RingF',tt.fat/gF);
 var stk=nutStreak(),stN=document.getElementById('nutStreakN');if(stN)stN.textContent=stk;
 var stB=document.getElementById('nutStreakBar');if(stB)stB.style.visibility=stk>0?'visible':'hidden';
 var meals=mealsOf(k),cnt=document.getElementById('nutCount');if(cnt)cnt.textContent=meals.length?meals.length+' repas':'';
 var host=document.getElementById('nutRecent');if(!host)return;
 if(!meals.length){host.innerHTML='<div class="nutx-empty"><i class="ti ti-camera"></i><div>Aucun repas aujourd\'hui.<br>Appuie sur l\'appareil photo pour commencer.</div></div>';return}
 host.innerHTML=meals.map(function(m,i){
  var th=m.photo?' style="background-image:url('+m.photo+')"':'';
  var ic=m.photo?'':'<i class="ti ti-tools-kitchen-2"></i>';
  return '<div class="nutx-meal" style="cursor:pointer" onclick="openMealDetail(tk(),'+i+')"><span class="nutx-mthumb"'+th+'>'+ic+'</span>'
   +'<span class="nutx-mmid"><span class="nutx-mn">'+esc(m.name)+(m.ai?' <i class="ti ti-sparkles nutx-aiic" aria-hidden="true"></i>':'')+'</span>'
   +'<span class="nutx-mt">'+(m.prot||0)+'g P · '+(m.carb||0)+'g G · '+(m.fat||0)+'g L</span></span>'
   +'<span class="nutx-mk">'+(m.kcal||0)+'<small>kcal</small></span>'
   +'<button class="nutx-mx" type="button" aria-label="Supprimer" onclick="event.stopPropagation();delMeal('+i+')">✕</button></div>';
 }).join('');
}

function addMeal(){const g=id=>document.getElementById(id);const name=g('nmName').value.trim()||'Repas';const kcal=parseInt(g('nmKcal').value)||0;if(!kcal){toast('Indique les calories');return}const meal={name,kcal,prot:parseInt(g('nmProt').value)||0,carb:parseInt(g('nmCarb').value)||0,fat:parseInt(g('nmFat').value)||0};const k=tk(),a=mealsOf(k);a.push(meal);DB.set('meals_'+k,a);['nmName','nmKcal','nmProt','nmCarb','nmFat'].forEach(x=>g(x).value='');toast('Repas ajouté 🍽️');renderNutrition()}


/* ═══════════════════════════════════════════════════════════════════════════
   FUSION DU 30 AOÛT — les deux blocs nutrition que main avait écrits DANS
   index.html arrivent ici, où le découpage du moteur web les attend : la
   dépense de référence (v1999/v2001/v2004) et la table des ajouts
   invisibles (v2047). Déménagement pur, aucune ligne de logique touchée —
   `flAjoutTrouver` ne lisait déjà que `window.FL_AJOUTS`, et
   `flDepenseReference` que `flMetaBase` et `flCaloriesDetail`, qui se
   résolvent au geste comme tout le reste du corpus.
   ═══════════════════════════════════════════════════════════════════════════ */
/* ═══ v1999 — LA DÉPENSE DE RÉFÉRENCE, CELLE DE CE CORPS-LÀ ════════════════
   L'objectif calorique ne venait pas du corps. `flNWizPlan` partait d'une base
   de 2 400 kcal EN DUR, la même pour tout le monde ; le repli de `getNutGoals`
   valait 1 600 + forfait, l'ancienne constante `FL_BASAL`. Pendant ce temps
   `flMetaBase` calcule un vrai métabolisme et `flCaloriesDetail` mesure une
   vraie dépense.
   MESURE, sur les 24 journées complètes de la base : dépense médiane 2 709 kcal
   contre 2 400 posées. UN MAINTIEN 309 kcal TROP BAS, tous les jours.
   LA MÉDIANE ET PAS LA MOYENNE : une grosse journée ne relève pas la semaine.
   VINGT-HUIT JOURS = QUATRE SEMAINES PLEINES : la fenêtre ne dépend pas du jour
   où on la lit.
   SOUS SEPT JOURNÉES, le métabolisme × 1,40 — le PAL sédentaire de la FAO, le
   PLANCHER de l'activité humaine. 2 668 kcal pour ce profil, à 88 kcal de la
   médiane mesurée : rassurant, pas une preuve.
   ET SANS RIEN, `null` : les appelants gardent leur repli. On ne remplace jamais
   une valeur par une invention.
   ⚠️ LE CACHE EST OBLIGATOIRE : vingt-huit appels à `flCaloriesDetail` par
   lecture. C'est le prix que la v1233 a payé sur `flFcMax` — la page Effort
   revenait VIDE. Une fois par jour, et on garde. */
/* ═══ v2001 — CE QUE LA PERSONNE A DÉCLARÉ DE SES JOURNÉES ══════════════════
   L'onboarding demande « Tes journées ? » — combien d'heures assis, combien
   dehors — sous un sous-titre qui promet : « Le corps encaisse ce que le
   quotidien impose. » Les deux réponses partaient dans `profile.onb` et
   personne ne les lisait. `A-VENIR.md` le justifiait : ce sont des
   DÉCLARATIONS, pas des mesures, et la variabilité cardiaque dit mieux.
   C'EST VRAI QUAND LA MESURE EXISTE. Elle n'existe pas les sept premiers
   jours. Là, `flDepenseReference` rendait le métabolisme × 1,40 — le PAL
   sédentaire de la FAO — À TOUT LE MONDE. Quelqu'un qui déclare huit heures
   assis et quelqu'un qui déclare debout toute la journée et une heure dehors
   recevaient le MÊME objectif calorique.
   MESURE, pour ce profil (BMR 1 861) : entre la déclaration la plus sédentaire
   et la plus active, 766 kcal d'écart, que la constante aplatissait.
   LA DÉCLARATION NE REMPLACE PAS UNE MESURE, ELLE REMPLACE UNE CONSTANTE, et
   elle s'efface dès que sept journées sont mesurées. C'est la seule chose
   qu'on lui demande.

   D'OÙ VIENNENT LES NOMBRES. Le PAL est le rapport dépense/métabolisme, et la
   FAO/OMS/UNU (2004) donne les bandes : sédentaire 1,40–1,69, actif
   1,70–1,99, très actif 2,00–2,40. On part du PLANCHER, 1,40, et on monte.
   · ASSIS — c'est le poste le plus lourd d'une journée. Huit heures et plus :
     rien, on reste au plancher, c'est la définition du travail de bureau.
     Quatre à huit : +0,10. Moins de quatre : +0,20, une occupation debout.
   · DEHORS — un marqueur de déplacement, plus faible que le précédent parce
     qu'être dehors n'est pas forcément marcher. +0,05 puis +0,10.
   · SÉANCES — celui-là se CALCULE, il ne se choisit pas. Une séance modérée
     coûte environ 6 MET ; au-dessus du repos cela fait 5 MET pendant D
     minutes, soit 5×D/60 heures-métabolisme, réparties sur les 24 h d'une
     journée et les 7 jours d'une semaine : ΔPAL = S×D/2016.
   ⚠️ LE PLAFOND N'EST PAS DÉCORATIF. Les molettes de l'onboarding montent à
   quatorze séances de cent cinquante minutes — trente-cinq heures par semaine,
   qui donneraient un PAL de 2,74, au-delà de tout ce qu'un humain soutient hors
   conditions extrêmes. On plafonne à 1,90 : une déclaration NON VÉRIFIÉE ne
   pousse jamais l'objectif calorique dans la bande « très actif ». Si la
   personne y est vraiment, sept jours de mesure le diront et prendront la main.
   LES TROIS SÉANCES PAR DÉFAUT SONT AMBIGUËS, et on les compte quand même :
   la molette affiche 3×45 sans qu'on y touche, donc on ne peut pas distinguer
   un choix d'un défaut. L'erreur est symétrique — 124 kcal dans un sens ou dans
   l'autre — et trois séances par semaine est l'hypothèse centrale pour qui
   installe une application de sport. On ne prétend pas mieux. */
window.flPalDeclare=function(){try{
 var o=(typeof flOnb==='function')?flOnb():{};
 var pal=1.40, dit=false;
 var A={'4-8h':0.10,'-4h':0.20}[(o.tempsAssis||'')+''];
 if(A!=null){pal+=A;dit=true;} else if(o.tempsAssis==='8h+')dit=true;
 var D={'30-60min':0.05,'1h+':0.10}[(o.tempsDehors||'')+''];
 if(D!=null){pal+=D;dit=true;} else if(o.tempsDehors==='-30min')dit=true;
 var S=+o.seancesSemaine, Dm=+o.dureeSeance;
 if(S>0&&Dm>0){pal+=S*Dm/2016;dit=true;}
 if(!dit)return null;              /* rien de déclaré : on n'invente pas */
 return {pal:Math.min(1.90,pal), src:'déclarée à l\'inscription'};
}catch(e){return null;}};

window._flRefCache=null;
window.flDepenseReference=function(){try{
 var bmr=(typeof flMetaBase==='function')?flMetaBase():null;
 /* 12 sept. 2026 — la clé du cache porte le profil : corriger son poids
    recalculait la référence… le lendemain. Et un résultat NUL ne se garde pas :
    au montage, la référence est calculée avant que le métabolisme de base ne
    soit connu, et ce null restait servi toute la journée (vu au harnais Node :
    28 journées complètes, référence « null »). */
 /* 14 sept. 2026 — LA CLÉ PORTE LE PROFIL ENTIER, PAS TROIS CHAMPS SUR CINQ.
    Elle en portait trois : poids, taille, naissance. Le SEXE et la FRÉQUENCE
    MAXIMALE SAISIE manquaient, alors que `flCaloriesDetail` — dont cette
    fonction fait vingt-huit appels — les porte tous les deux dans SA signature
    (Keytel et `flFcMax` en dépendent). La conséquence se voyait au geste :
    Profil → Mesures → « FC max mesurée 200 » → « Enregistré », et la référence
    servie ne bougeait pas jusqu'au lendemain. Le métabolisme, lui, était dans
    la clé et rattrapait le sexe TANT QUE Mifflin-St Jeor servait ; dès qu'une
    masse grasse est connue, Katch-McArdle ignore le sexe, le métabolisme ne
    bouge plus, et la clé non plus.
    MESURÉ au harnais Node sur la base du 9 septembre (profil 85 kg / 185 cm) :
    FC max 200 saisie → référence servie 2 430 kcal pour 2 381 réelles, 49 kcal
    de trop ; sexe h → f avec 20 % de masse grasse → 2 369 servies pour 2 142,
    227 kcal de trop. Ce sont le plan, le budget de Nutrition et le mot du jour
    qui en héritaient, une journée durant.
    LA CLÉ RECOPIE DÉSORMAIS LA SIGNATURE DE `flCaloriesDetail`, champ pour
    champ : deux caches sur la même entrée doivent tomber ensemble. */
 var _pp={};try{_pp=getProfile()||{};}catch(e){}
 var auj=tk()+'|'+(bmr||0)+'|'+(_pp.weight||0)+'/'+(_pp.height||0)+'/'+(_pp.birth||_pp.age||0)
        +'/'+(_pp.gender||'')+'/'+(_pp.hrMax||0);
 if(window._flRefCache&&window._flRefCache.jour===auj&&window._flRefCache.v!=null)return window._flRefCache.v;
 var v=null, tot=[], src=null;
 if(typeof flCaloriesDetail==='function'){
  for(var i=1;i<=28;i++){
   var r=null; try{r=flCaloriesDetail(tk(-i));}catch(e){}
   if(r&&!r.vide&&r.complet&&r.total>0)tot.push(r.total);
  }
 }
 /* ═══ v2004 — LA DÉCLARATION S'EFFACE AU FUR ET À MESURE, PAS D'UN COUP ═══
    La v2001 posait une marche : moins de sept journées → la déclaration seule,
    la septième → la mesure seule. Deux défauts, et le second a été MESURÉ sur
    la base réelle de Dino après rapatriement de ses vraies réponses.
    (1) LA MARCHE SE VOIT. L'objectif nutritionnel sautait d'un coup au
        septième jour, sans que rien ne l'annonce.
    (2) ⚠️ ET SURTOUT, LA DÉCLARATION SEULE EST FRAGILE. Dino a déclaré SEPT
        séances de SOIXANTE minutes par semaine ; sa base en porte 2,2 de 25
        minutes sur la fenêtre mesurée. Son PAL déclaré vaut 1,81 — sous le
        plafond de 1,90, qui ne l'aurait donc pas protégé — soit 3 411 kcal
        quand son corps en mesure 2 756. SIX CENT CINQUANTE-CINQ KCAL DE TROP
        PAR JOUR, pendant une semaine. Pour quelqu'un en sèche, c'est le
        déficit entier effacé, précisément la semaine où l'on juge si l'app
        fonctionne.
    ON NE CORRIGE PAS LE BARÈME POUR AUTANT : la formule des séances est juste
    (5 MET au-dessus du repos), c'est l'ENTRÉE qui est optimiste, et l'on ne
    règle pas une physiologie sur un seul utilisateur. Ce qu'on corrige, c'est
    d'avoir JETÉ les journées mesurées disponibles : entre un et six jours de
    mesure valent mieux qu'un questionnaire, et la v2001 les ignorait.
    LE POIDS EST LE COMPTE DE PREUVES, PAS UN COEFFICIENT CHOISI : avec n
    journées complètes sur les sept attendues, la mesure pèse n/7 et la
    déclaration 1−n/7. À zéro journée c'est la déclaration seule, à sept c'est
    la mesure seule, et la marche a disparu. Une seule journée aberrante ne
    peut pas emporter la valeur : elle n'y pèse qu'un septième.
    Sur les chiffres de Dino : 3 411 à zéro jour, 3 063 à trois, 2 849 à six,
    2 756 ensuite. */
 tot.sort(function(a,b){return a-b;});
 var n=tot.length;
 var med=n?((n%2)?tot[n>>1]:Math.round((tot[n/2-1]+tot[n/2])/2)):null;
 if(n>=7){
  v=med; src='mesurée sur '+n+' jours';
 }else if(bmr>0){
  var pd=(typeof flPalDeclare==='function')?flPalDeclare():null;
  var dec=Math.round(bmr*((pd&&pd.pal)||1.40));
  var sd=pd?pd.src:'estimée (activité sédentaire)';
  if(med==null){v=dec;src=sd;}
  else{var w=n/7;
   v=Math.round(med*w+dec*(1-w));
   src='mesurée sur '+n+' jour'+(n>1?'s':'')+', complétée par ta déclaration';}
 }
 if(v!=null)window._flRefCache={jour:auj,v:v,n:tot.length,src:src};
 return v;
}catch(e){return null;}};


/* ═══ v2047 — LA TABLE DES AJOUTS INVISIBLES ═══════════════════════════════

   Félix : « les matières grasses, c'est invisible à l'oeil nu ».

   C'est le défaut mesuré du modèle, et l'audit du 28 août l'a chiffré : sur
   la même assiette analysée trois fois, il trouve les bons ALIMENTS à chaque
   fois, et des quantités qui varient de 22 %. Il ne se trompe pas de ce qu'il
   voit ; il se trompe de ce qu'il ne voit pas, et de combien il y en a.

   Une cuillère d'huile dans une poêle ne laisse aucune trace sur la photo.
   Elle vaut 117 kcal. C'est plus qu'un yaourt entier, et c'est invisible.

   POUR CENT GRAMMES, et macros comprises : convertir un nom en calories sans
   les protéines et les glucides obligerait à redemander au modèle pour une
   cuillère d'huile, soit dix secondes d'attente pour un geste qui doit être
   instantané.

   `u` est l'unité usuelle en grammes : une cuillère à soupe d'huile pèse
   13 g, une de sucre 15 g. Sans ça, l'utilisateur devrait convertir de tête,
   et il ne le fera pas. */
window.FL_AJOUTS = {
  /* ── LES CORPS GRAS, le cas de Félix et le plus coûteux ─────────────── */
  'huile d olive':      {kcal:900, prot:0,   carb:0,   fat:100, u:13, un:'c. à soupe'},
  'huile de tournesol': {kcal:900, prot:0,   carb:0,   fat:100, u:13, un:'c. à soupe'},
  'huile de colza':     {kcal:900, prot:0,   carb:0,   fat:100, u:13, un:'c. à soupe'},
  'huile de coco':      {kcal:900, prot:0,   carb:0,   fat:100, u:13, un:'c. à soupe'},
  'beurre':             {kcal:750, prot:0.7, carb:0.6, fat:82,  u:10, un:'noisette'},
  'margarine':          {kcal:700, prot:0.2, carb:0.5, fat:78,  u:10, un:'noisette'},
  'creme fraiche':      {kcal:300, prot:2.4, carb:3,   fat:30,  u:30, un:'c. à soupe'},
  'creme legere':       {kcal:165, prot:3,   carb:4,   fat:15,  u:30, un:'c. à soupe'},
  /* ── SAUCES ET CONDIMENTS ───────────────────────────────────────────── */
  'mayonnaise':         {kcal:700, prot:1,   carb:2,   fat:75,  u:15, un:'c. à soupe'},
  'vinaigrette':        {kcal:450, prot:0.5, carb:5,   fat:47,  u:15, un:'c. à soupe'},
  'ketchup':            {kcal:110, prot:1.2, carb:26,  fat:0.2, u:15, un:'c. à soupe'},
  'moutarde':           {kcal:150, prot:7,   carb:5,   fat:11,  u:10, un:'c. à café'},
  'sauce soja':         {kcal:60,  prot:6,   carb:6,   fat:0,   u:15, un:'c. à soupe'},
  'sauce tomate':       {kcal:70,  prot:1.6, carb:9,   fat:3,   u:80, un:'louche'},
  'pesto':              {kcal:450, prot:5,   carb:6,   fat:45,  u:20, un:'c. à soupe'},
  'houmous':            {kcal:280, prot:8,   carb:14,  fat:20,  u:30, un:'c. à soupe'},
  /* ── SUCRES ─────────────────────────────────────────────────────────── */
  'sucre':              {kcal:400, prot:0,   carb:100, fat:0,   u:5,  un:'c. à café'},
  'miel':               {kcal:320, prot:0.3, carb:80,  fat:0,   u:20, un:'c. à soupe'},
  'confiture':          {kcal:250, prot:0.4, carb:60,  fat:0.1, u:20, un:'c. à soupe'},
  'sirop d erable':     {kcal:260, prot:0,   carb:67,  fat:0,   u:20, un:'c. à soupe'},
  'pate a tartiner':    {kcal:540, prot:6,   carb:57,  fat:31,  u:20, un:'c. à soupe'},
  /* ── FÉCULENTS, poids CUITS sauf mention ────────────────────────────── */
  'riz cuit':           {kcal:130, prot:2.7, carb:28,  fat:0.3, u:150,un:'portion'},
  'riz complet cuit':   {kcal:120, prot:2.6, carb:25,  fat:1,   u:150,un:'portion'},
  'pates cuites':       {kcal:150, prot:5,   carb:30,  fat:0.9, u:150,un:'portion'},
  'semoule cuite':      {kcal:120, prot:4,   carb:25,  fat:0.2, u:150,un:'portion'},
  'quinoa cuit':        {kcal:120, prot:4.4, carb:21,  fat:1.9, u:150,un:'portion'},
  'boulgour cuit':      {kcal:110, prot:3,   carb:23,  fat:0.2, u:150,un:'portion'},
  'pommes de terre':    {kcal:85,  prot:2,   carb:18,  fat:0.1, u:150,un:'portion'},
  'patate douce':       {kcal:90,  prot:1.6, carb:20,  fat:0.1, u:150,un:'portion'},
  'puree':              {kcal:85,  prot:2,   carb:14,  fat:2.5, u:180,un:'portion'},
  'frites':             {kcal:310, prot:3.4, carb:41,  fat:15,  u:130,un:'portion'},
  'pain':               {kcal:270, prot:9,   carb:50,  fat:2,   u:30, un:'tranche'},
  'pain complet':       {kcal:250, prot:10,  carb:43,  fat:3,   u:30, un:'tranche'},
  'baguette':           {kcal:280, prot:9,   carb:56,  fat:1,   u:60, un:'morceau'},
  'lentilles cuites':   {kcal:115, prot:9,   carb:17,  fat:0.4, u:150,un:'portion'},
  'pois chiches cuits': {kcal:140, prot:8,   carb:20,  fat:2.4, u:150,un:'portion'},
  'haricots rouges':    {kcal:120, prot:8,   carb:18,  fat:0.5, u:150,un:'portion'},
  /* ── PROTÉINES ──────────────────────────────────────────────────────── */
  'poulet':             {kcal:165, prot:31,  carb:0,   fat:3.6, u:120,un:'blanc'},
  'cuisse de poulet':   {kcal:210, prot:26,  carb:0,   fat:11,  u:150,un:'cuisse'},
  'dinde':              {kcal:135, prot:29,  carb:0,   fat:1.5, u:120,un:'escalope'},
  'boeuf':              {kcal:250, prot:26,  carb:0,   fat:16,  u:150,un:'steak'},
  'steak hache 5':      {kcal:135, prot:21,  carb:0,   fat:5,   u:125,un:'steak'},
  'steak hache 15':     {kcal:220, prot:19,  carb:0,   fat:15,  u:125,un:'steak'},
  'porc':               {kcal:240, prot:26,  carb:0,   fat:15,  u:130,un:'portion'},
  'agneau':             {kcal:280, prot:25,  carb:0,   fat:20,  u:130,un:'portion'},
  'jambon blanc':       {kcal:110, prot:20,  carb:1,   fat:3,   u:40, un:'tranche'},
  'lardons':            {kcal:280, prot:16,  carb:0.5, fat:24,  u:50, un:'poignée'},
  'saucisse':           {kcal:300, prot:14,  carb:2,   fat:26,  u:70, un:'unité'},
  'merguez':            {kcal:320, prot:15,  carb:1,   fat:29,  u:70, un:'unité'},
  'saumon':             {kcal:200, prot:20,  carb:0,   fat:13,  u:130,un:'pavé'},
  'saumon fume':        {kcal:180, prot:23,  carb:0,   fat:10,  u:40, un:'tranche'},
  'thon':               {kcal:130, prot:26,  carb:0,   fat:3,   u:100,un:'portion'},
  'cabillaud':          {kcal:80,  prot:18,  carb:0,   fat:0.7, u:130,un:'pavé'},
  'crevettes':          {kcal:100, prot:21,  carb:0.5, fat:1.2, u:100,un:'portion'},
  'oeuf':               {kcal:145, prot:13,  carb:0.7, fat:10,  u:55, un:'unité'},
  'tofu':               {kcal:120, prot:12,  carb:2,   fat:7,   u:100,un:'portion'},
  'proteines de soja':  {kcal:120, prot:16,  carb:5,   fat:4,   u:100,un:'portion'},
  'seitan':             {kcal:140, prot:25,  carb:6,   fat:2,   u:100,un:'portion'},
  'steak vegetal':      {kcal:180, prot:17,  carb:8,   fat:9,   u:100,un:'unité'},
  /* ── PRODUITS LAITIERS ──────────────────────────────────────────────── */
  'lait':               {kcal:46,  prot:3.2, carb:4.8, fat:1.6, u:200,un:'verre'},
  'yaourt nature':      {kcal:60,  prot:4,   carb:5,   fat:3,   u:125,un:'pot'},
  'yaourt grec':        {kcal:120, prot:6,   carb:4,   fat:9,   u:150,un:'pot'},
  'fromage blanc':      {kcal:75,  prot:8,   carb:4,   fat:3,   u:100,un:'portion'},
  'skyr':               {kcal:60,  prot:11,  carb:4,   fat:0.2, u:150,un:'pot'},
  'fromage rape':       {kcal:380, prot:26,  carb:2,   fat:30,  u:20, un:'poignée'},
  'parmesan':           {kcal:400, prot:33,  carb:0,   fat:29,  u:10, un:'c. à soupe'},
  'comte':              {kcal:410, prot:27,  carb:1.5, fat:33,  u:30, un:'part'},
  'mozzarella':         {kcal:280, prot:19,  carb:1,   fat:22,  u:60, un:'part'},
  'chevre':             {kcal:290, prot:19,  carb:2,   fat:23,  u:30, un:'part'},
  'feta':               {kcal:265, prot:14,  carb:4,   fat:21,  u:40, un:'part'},
  /* ── LÉGUMES, poids cuits ───────────────────────────────────────────── */
  'haricots verts':     {kcal:35,  prot:2,   carb:5,   fat:0.2, u:150,un:'portion'},
  'brocoli':            {kcal:35,  prot:2.8, carb:4,   fat:0.4, u:150,un:'portion'},
  'courgette':          {kcal:20,  prot:1.2, carb:2.5, fat:0.3, u:150,un:'portion'},
  'carottes':           {kcal:40,  prot:0.9, carb:8,   fat:0.2, u:150,un:'portion'},
  'epinards':           {kcal:25,  prot:3,   carb:1.5, fat:0.4, u:150,un:'portion'},
  'tomate':             {kcal:20,  prot:0.9, carb:3,   fat:0.2, u:120,un:'unité'},
  'salade verte':       {kcal:15,  prot:1.3, carb:1.5, fat:0.2, u:50, un:'portion'},
  'avocat':             {kcal:160, prot:2,   carb:2,   fat:15,  u:100,un:'demi'},
  'champignons':        {kcal:25,  prot:3,   carb:1,   fat:0.4, u:120,un:'portion'},
  'poivron':            {kcal:30,  prot:1,   carb:5,   fat:0.3, u:120,un:'unité'},
  'oignon':             {kcal:40,  prot:1.1, carb:8,   fat:0.1, u:80, un:'unité'},
  'ratatouille':        {kcal:60,  prot:1.5, carb:6,   fat:3.5, u:200,un:'portion'},
  /* ── FRUITS ─────────────────────────────────────────────────────────── */
  'banane':             {kcal:90,  prot:1.1, carb:20,  fat:0.3, u:120,un:'unité'},
  'pomme':              {kcal:52,  prot:0.3, carb:12,  fat:0.2, u:150,un:'unité'},
  'orange':             {kcal:47,  prot:0.9, carb:9,   fat:0.1, u:150,un:'unité'},
  'fraises':            {kcal:33,  prot:0.7, carb:6,   fat:0.3, u:150,un:'portion'},
  'myrtilles':          {kcal:57,  prot:0.7, carb:12,  fat:0.3, u:100,un:'portion'},
  'raisin':             {kcal:70,  prot:0.7, carb:16,  fat:0.2, u:120,un:'portion'},
  'mangue':             {kcal:60,  prot:0.8, carb:14,  fat:0.4, u:150,un:'portion'},
  'kiwi':               {kcal:60,  prot:1.1, carb:11,  fat:0.5, u:80, un:'unité'},
  /* ── NOIX ET GRAINES ────────────────────────────────────────────────── */
  'amandes':            {kcal:600, prot:21,  carb:5,   fat:52,  u:25, un:'poignée'},
  'noix':               {kcal:650, prot:15,  carb:7,   fat:62,  u:25, un:'poignée'},
  'noix de cajou':      {kcal:570, prot:18,  carb:27,  fat:44,  u:25, un:'poignée'},
  'cacahuetes':         {kcal:570, prot:26,  carb:8,   fat:48,  u:25, un:'poignée'},
  'beurre de cacahuete':{kcal:600, prot:25,  carb:12,  fat:50,  u:20, un:'c. à soupe'},
  'graines de chia':    {kcal:490, prot:17,  carb:8,   fat:31,  u:15, un:'c. à soupe'},
  /* ── PETIT-DÉJEUNER ─────────────────────────────────────────────────── */
  'flocons d avoine':   {kcal:370, prot:13,  carb:60,  fat:7,   u:50, un:'portion'},
  'muesli':             {kcal:400, prot:10,  carb:60,  fat:12,  u:50, un:'portion'},
  'cereales':           {kcal:380, prot:7,   carb:80,  fat:3,   u:40, un:'bol'},
  'croissant':          {kcal:410, prot:8,   carb:44,  fat:22,  u:60, un:'unité'},
  'pain au chocolat':   {kcal:430, prot:7,   carb:47,  fat:24,  u:70, un:'unité'},
  /* ── SUCRÉ ET SNACKS ────────────────────────────────────────────────── */
  'chocolat noir':      {kcal:550, prot:8,   carb:35,  fat:40,  u:20, un:'carrés'},
  'chocolat au lait':   {kcal:535, prot:7,   carb:57,  fat:30,  u:20, un:'carrés'},
  'biscuits':           {kcal:470, prot:6,   carb:65,  fat:20,  u:25, un:'portion'},
  'chips':              {kcal:540, prot:6,   carb:50,  fat:34,  u:30, un:'poignée'},
  'glace':              {kcal:200, prot:3.5, carb:24,  fat:10,  u:100,un:'boule'},
  /* ── PLATS COMPOSÉS, ordres de grandeur ─────────────────────────────── */
  'pizza':              {kcal:250, prot:11,  carb:30,  fat:9,   u:300,un:'pizza'},
  'burger':             {kcal:250, prot:14,  carb:20,  fat:12,  u:220,un:'unité'},
  'kebab':              {kcal:215, prot:14,  carb:20,  fat:9,   u:350,un:'unité'},
  'sushi':              {kcal:145, prot:6,   carb:26,  fat:1.5, u:180,un:'portion'},
  'quiche':             {kcal:260, prot:9,   carb:20,  fat:16,  u:150,un:'part'},
  'lasagnes':           {kcal:135, prot:8,   carb:12,  fat:6,   u:300,un:'part'},
  /* ── BOISSONS ───────────────────────────────────────────────────────── */
  'jus d orange':       {kcal:45,  prot:0.7, carb:10,  fat:0.1, u:200,un:'verre'},
  'soda':               {kcal:42,  prot:0,   carb:10.6,fat:0,   u:330,un:'canette'},
  'biere':              {kcal:43,  prot:0.5, carb:3.6, fat:0,   u:250,un:'verre'},
  'vin rouge':          {kcal:85,  prot:0.1, carb:2.6, fat:0,   u:125,un:'verre'},
  'vin blanc':          {kcal:82,  prot:0.1, carb:2.6, fat:0,   u:125,un:'verre'}
};


/* On compare sans accents ni ponctuation : l'utilisateur écrit « huile
   d'olive », la table dit « huile d olive », et personne ne doit s'en soucier. */
window.flAjoutTrouver = function(nom){
  if(!nom)return null;
  var n=String(nom).toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
        .replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim();
  if(window.FL_AJOUTS[n])return Object.assign({cle:n},window.FL_AJOUTS[n]);
  /* Sinon, la clé la plus longue qui est contenue dans ce qu'il a écrit :
     « un peu d huile d olive vierge » doit trouver « huile d olive », pas
     « huile de tournesol ». */
  var best=null;
  Object.keys(window.FL_AJOUTS).forEach(function(k){
    if(n.indexOf(k)>=0 && (!best || k.length>best.length)) best=k;
  });
  return best ? Object.assign({cle:best},window.FL_AJOUTS[best]) : null;
};

/* ═══ v2055 — LES TROIS OPÉRATIONS DE CORRECTION, RAPATRIÉES ICI ════════════

   Elles étaient restées dans index.html quand la table a déménagé dans ce
   fichier. Deux conséquences : la garde de livraison refusait le build
   (index.html au-dessus de 37 500 lignes), et surtout le métier était coupé en
   deux — la table d'un côté, ce qui s'en sert de l'autre.

   Elles vont donc là où vit la table. L'écran, lui, reste dans index.html :
   c'est du rendu, pas du métier. */

  window.flItemAjouter = function(nom, grammes){
    /* `window.` explicite : ces fonctions tournent aussi dans un banc et dans
       la WKWebView, où l'objet global n'est pas toujours `window` par défaut.
       S'en remettre à la portée globale marche dans un navigateur par accident,
       pas par contrat. */
    var t=window.flAjoutTrouver(nom); var g=+grammes;
    if(!t || !isFinite(g) || g<=0 || g>3000) return null;
    var f=g/100;
    var it={ name:String(nom).trim(), grams:Math.round(g),
             kcal:Math.round(t.kcal*f), prot:Math.round(t.prot*f*10)/10,
             carb:Math.round(t.carb*f*10)/10, fat:Math.round(t.fat*f*10)/10,
             confidence:1, _ajoute:true, _table:t.cle };
    it._base={kcal:it.kcal,prot:it.prot,carb:it.carb,fat:it.fat,grams:it.grams};
    var a=window._flintScanItems; if(Array.isArray(a))a.push(it);
    /* Ce que l'utilisateur ajoute, il le remange : on retient, comme pour une
       correction de grammes depuis la v1609. */
    try{window.flPortionRetenir(it.name,it.grams);}catch(e){}
    return it;
  };

  window.flItemRenommer = function(i, nouveauNom){
    var a=window._flintScanItems; if(!Array.isArray(a))return null;
    var it=a[i]; if(!it||!nouveauNom)return null;
    var g=+it.grams||0;
    var t=window.flAjoutTrouver(nouveauNom);
    it.name=String(nouveauNom).trim();
    if(t && g>0){
      var f=g/100;
      it.kcal=Math.round(t.kcal*f); it.prot=Math.round(t.prot*f*10)/10;
      it.carb=Math.round(t.carb*f*10)/10; it.fat=Math.round(t.fat*f*10)/10;
      it._base={kcal:it.kcal,prot:it.prot,carb:it.carb,fat:it.fat,grams:g};
      it._recalcule=t.cle;
      return {recalcule:true, table:t.cle};
    }
    it._recalcule=null;
    return {recalcule:false, raison:'aliment inconnu de la table : les valeurs n ont pas changé'};
  };

  window._flBeauNom = function(cle){
    if(!cle)return '';
    var t=String(cle)
      .replace(/\bd (?=[aeiouy])/g, "d'")   /* d olive → d'olive */
      .replace(/\bl (?=[aeiouy])/g, "l'")
      .replace(/\berable\b/,'érable').replace(/\bcreme\b/,'crème')
      .replace(/\bpates\b/,'pâtes').replace(/\bcereales\b/,'céréales')
      .replace(/\bpoulet rotie?\b/,'poulet rôti').replace(/\brape\b/,'râpé')
      .replace(/\bcomte\b/,'comté').replace(/\bchevre\b/,'chèvre')
      .replace(/\bepinards\b/,'épinards').replace(/\bproteines\b/,'protéines')
      .replace(/\bcacahuetes\b/,'cacahuètes').replace(/\bcereale\b/,'céréale')
      .replace(/\bbiere\b/,'bière').replace(/\boeuf\b/,'œuf');
    return t.charAt(0).toUpperCase()+t.slice(1);
  };;



/* ═══════════════════════════════════════════════════════════════════════════
   L'OBJECTIF, LES REPAS, L'HYDRATATION — sortis d'index.html le 30 août, à la
   demande du cliquet du découpage : la fusion de main y ramenait du code neuf,
   et la garde a rappelé qu'il a un métier. getNutGoals, la série de jours, les
   noms de repas, les totaux, la cible d'eau (v2000) et ses verres. Tout est
   appelé au geste — mealsOf, DB, balGoals, flDepenseReference se résolvent au
   moment de l'appel, comme partout ailleurs dans le corpus.
   ═══════════════════════════════════════════════════════════════════════════ */
/* Objectif nutrition ADAPTATIF : dépense réelle du jour (BMR + activités du capteur) ± offset de l'objectif (sécher/maintien/muscle) */
function getNutGoals(k){k=k||tk();
 /* v765 — FIN DES DEUX SYSTEMES D'OBJECTIFS. Le profil (wizard -> kcalGoal/
    protGoal, lu par flNutGoals) est LA source de verite : la balance et le
    legacy s'y alignent. L'estimation dynamique (base 1600 + activite) ne sert
    plus que de repli quand AUCUN objectif n'a ete fixe. */
 var ss=DB.get('sessions_'+k,[]),act=0;
 ss.forEach(function(s){if(s.type==='nap')return;act+=(s.dur||30)*(KCAL_PER_MIN[s.int||2]||8)});
 /* v1999 — `1600 + forfait` était l'ancienne constante. La dépense de
    référence est celle de ce corps-là, mesurée ; l'ancien calcul reste en
    dernier filet. */
 var burn=(typeof flDepenseReference==='function'&&flDepenseReference())||Math.round(1600+act);
 var G=(typeof balGoals==='function'&&balGoals()[goalOf()])||{lo:-200,hi:200};
 var offset=Math.round((G.lo+G.hi)/2);
 var p=getProfile();
 if(typeof flNutGoals==='function'&&(+p.kcalGoal||+p.protGoal)){
  var pg=flNutGoals();
  return {kcal:pg.kcal,prot:pg.prot,carb:pg.carb,fat:pg.fat,burn:burn,offset:offset};
 }
 var kcal=Math.max(1200,Math.round((burn+offset)/10)*10);
 var wt=(p.weight>0)?p.weight:null,go=(typeof goalOf==='function'?goalOf():'maintien');
 /* sans poids connu : la part de calories (25 %), jamais le corps d'un autre */
 var prot=wt?Math.round(wt*(go==='masse'?2.0:(go==='seche'?1.9:1.6))):Math.round(kcal*0.25/4);
 var fat=Math.round(kcal*0.27/9);
 var carb=Math.max(0,Math.round((kcal-prot*4-fat*9)/4));
 return {kcal:kcal,prot:prot,carb:carb,fat:fat,burn:burn,offset:offset};
}
function nutStreak(){var s=0,start=mealsOf(tk()).length?0:1;for(var i=start;i<400;i++){if(mealsOf(tk(-i)).length)s++;else break}return s}
/* noms de repas : sans le type en préfixe (« Petit-déj — flocons & œufs » → « Flocons & œufs »),
   nettoyé À LA LECTURE → tous les affichages (journal, fiche, timeline…) + les scans futurs (founder 13/07) */
var FLN_PREFIX=/^\s*(petit[\s-]*d[ée]j(?:euner)?|d[ée]jeuner|d[îi]ner|souper|brunch|collation|snack|go[ûu]ter|en[\s-]?cas|repas)\s*[-–—:·,]*\s*/i;
function flNCleanName(n){if(!n)return n;var c=(''+n).replace(FLN_PREFIX,'').trim();if(!c)return n;return c.charAt(0).toUpperCase()+c.slice(1);}
function nutTotals(k){return mealsOf(k).reduce((a,x)=>({kcal:a.kcal+(+x.kcal||0),prot:a.prot+(+x.prot||0),carb:a.carb+(+x.carb||0),fat:a.fat+(+x.fat||0)}),{kcal:0,prot:0,carb:0,fat:0})}
function macroStat(lbl,val,goal,col){const pct=Math.min(100,goal?val/goal*100:0);return '<div class="stat"><div class="sl">'+lbl+'</div><div class="sv" style="font-size:23px">'+Math.round(val)+'<small style="font-size:11px;color:var(--ink2);font-family:var(--sans);font-weight:700"> /'+Math.round(goal)+'g</small></div><div class="progbar" style="margin-top:7px;height:8px"><i style="width:'+pct+'%;background:'+col+'"></i></div></div>'}
function hydroKey(k){return 'hydro_'+(k||tk());}
/* ═══ v2000 — LA CIBLE D'EAU VIENT DE LA PERSONNE, PLUS D'UN HUIT ═════════
   `goal=8` — huit verres de 25 cl, soit deux litres — était posé pour tout le
   monde. Un homme de 95 kg et une femme de 52 kg recevaient la même cible.
   ET L'ONBOARDING POSAIT DÉJÀ LA QUESTION. L'écran s'appelle « Un objectif
   d'eau ? » et range la réponse dans `onb.hydratation`, en litres. Elle n'était
   lue NULLE PART — un des vingt-trois champs qui dormaient.
   TROIS ÉTAGES, dans cet ordre :
     · l'objectif DÉCLARÉ prime — c'est un choix, pas une estimation, et rien
       ne justifie de le contredire ;
     · zéro veut dire « pas d'objectif » et il est respecté : la carte cesse
       d'afficher une cible que la personne a refusée (depuis la v2000 côté
       Swift, ce zéro se distingue enfin d'une absence de réponse) ;
     · sans déclaration, 35 ml par kilo — le repère courant de l'hydratation
       d'un adulte. Pour 85 kg : 2,98 L, soit douze verres, contre huit posés.
   ON N'AJOUTE RIEN POUR L'EFFORT, et c'est délibéré : les pertes à l'exercice
   dépendent de la sudation, de la chaleur et de la durée, dont FLINT ne mesure
   aucune. Une cible qui monterait « parce qu'il a couru » serait un chiffre
   inventé de plus. */
window.flHydroObjectif=function(){try{
 var p=(typeof getProfile==='function'?getProfile():null)||{};
 var d=(p.onb&&p.onb.hydratation!=null)?+p.onb.hydratation:null;
 if(d===0)return 0;                       /* refus explicite : aucune cible */
 var L=(d>0&&d<=6)?d:null;
 if(L==null){var kg=(typeof flPoidsCorps==='function')?flPoidsCorps():(+p.weight||0);
  if(kg>0)L=kg*0.035;}
 if(!(L>0))return 8;                      /* ni choix ni poids : on garde l'existant */
 return Math.max(4,Math.min(20,Math.round(L/0.25)));
}catch(e){return 8;}};
function renderHydro(){var n=DB.get(hydroKey(),0)||0,
 goal=(typeof flHydroObjectif==='function')?flHydroObjectif():8;
 var L=(n*0.25).toFixed(2).replace('.',',');
 var sub=document.getElementById('hydroSub');
 /* v2000 — UN REFUS SE RESPECTE JUSQU'AU BOUT. Quand la personne a répondu
    « pas d'objectif », la carte compte toujours ses verres — c'est utile — mais
    elle cesse d'annoncer une cible, et n'affiche donc ni « objectif 0,0 L » ni
    coche de réussite. Montrer un zéro serait pire que ne rien montrer. */
 if(sub){
  if(goal>0){var gL=(goal*0.25).toFixed(1).replace('.',',');
   sub.textContent=L+' L · objectif '+gL+' L'+(n>=goal?' ✓':'');}
  else sub.textContent=L+' L bus aujourd\'hui';
 }
 var nn=document.getElementById('hydroN');if(nn)nn.textContent=n;
 var d=document.getElementById('hydroDots');
 if(d){var h='',pts=goal>0?goal:Math.max(n,1);
  for(var i=0;i<pts;i++)h+='<span class="nh-dot'+(i<n?' on':'')+'"></span>';d.innerHTML=h;}}
function hydroAdd(delta){var k=hydroKey(),n=Math.max(0,Math.min(20,(DB.get(k,0)||0)+delta));DB.set(k,n);haptic(5);renderHydro();}
function delMeal(i){const k=tk(),a=mealsOf(k);a.splice(i,1);DB.set('meals_'+k,a);renderNutrition()}
