/* ═══════════════════════════════════════════════════════════════════════════
   LE COACH — sorti d'index.html lors du découpage du moteur web (30 août
   2026). Les fonctions du fil de conversation : normalisation, ouverture,
   intro, bulles, envoi, et la réponse fondée sur les données du jour.
   Depuis la fusion du 30 août, les cinq lecteurs d'onboarding de la v2005
   (flLevierHygiene, flConseilSommeil, flTonCoach, flPrudenceSante,
   flAppliqueCoach) vivent ici avec eux : ils ne servent qu'au coach.
   recovery, sensorOf, strainTarget se résolvent à l'appel, comme avant :
   les fichiers se chargent dans l'ordre, les fonctions se parlent au
   moment du geste.
   ═══════════════════════════════════════════════════════════════════════════ */
function _cnorm(s){return (s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'')}
function openCoachIA(){go('coach')}
function renderCoachIntro(){var host=document.getElementById('coachThread');if(!host||host.dataset.init==='1')return;host.dataset.init='1';host.innerHTML='';
 var rv=recovery(),p=getProfile(),nm=p.name?(' '+esc(p.name)):'';
 /* v2002 — l'accueil aussi. Le chiffre est le même partout ; c'est la
    phrase autour qui change, et « Pas de coach » n'en met aucune. */
 var to=(typeof flTonCoach==='function')?flTonCoach():'motivant';
 var salut={motivant:'Salut'+nm+' 👋 ',analytique:'',intensif:'Salut'+nm+'. ',aucun:''}[to];
 var suite={motivant:'Pose-moi une question — je m\'appuie sur tes vraies données.',
            analytique:'Pose une question : les réponses sortent de tes mesures, pas d\'un barème.',
            intensif:'Qu\'est-ce que tu veux savoir ?',
            aucun:''}[to];
 var intro=rv?(salut+'Ta récup du jour est de <b>'+rv.s+'%</b>.'+(suite?' '+suite:'')):(salut+'Je n\'ai pas encore ta nuit. Synchronise ta Polar Loop et je pourrai te conseiller précisément.');
 coachPush('coach',intro);}
function coachPush(who,html){var host=document.getElementById('coachThread');if(!host)return;var d=document.createElement('div');d.className='cbub '+who;d.innerHTML=(who==='coach'?'<span class="cav"><i class="ti ti-bolt"></i></span>':'')+'<div class="ctx">'+html+'</div>';host.appendChild(d);host.scrollTop=host.scrollHeight;}
function coachAsk(q){coachPush('me',esc(q));var host=document.getElementById('coachThread');var t=document.createElement('div');t.className='cbub coach typing';t.innerHTML='<span class="cav"><i class="ti ti-bolt"></i></span><div class="ctx"><span class="cdot"></span><span class="cdot"></span><span class="cdot"></span></div>';host.appendChild(t);host.scrollTop=host.scrollHeight;haptic();setTimeout(function(){t.remove();coachPush('coach',coachReply(q))},480);}
function coachSend(){var i=document.getElementById('coachInput');if(!i)return;var v=i.value.trim();if(!v)return;i.value='';i.blur();coachAsk(v);}
/* ═══ v2002 — LE COACH N'ÉCOUTAIT PAS CE QU'ON LUI AVAIT DIT ═══════════════
   Trois écrans de l'onboarding parlent au coach, et il n'en lisait aucun.
   · « Un coach FLINT ? » propose motivant / analytique / intensif / PAS DE
     COACH, sous un sous-titre qui promet : « L'IA lit tes mesures et te parle
     — À TA FAÇON. » Les quatre réponses donnaient le même texte, emoji compris.
   · « Pas de coach — Juste mes données » ne retirait rien : l'onglet Coach
     restait planté dans la barre du bas, définitivement.
   · « Des choses à savoir sur ta santé ? » — et le coach répondait « Feu vert
     🔥 … c'est le bon jour pour une grosse séance » à quelqu'un qui venait de
     déclarer une GROSSESSE, une OPÉRATION RÉCENTE ou une BLESSURE EN COURS.
   RIEN ICI NE TOUCHE À UN CHIFFRE. Le score, les zones et la fourchette
   d'effort sont identiques dans les quatre tons et avec ou sans déclaration de
   santé : c'est la règle du projet, et la santé déclarée est justement le
   dernier endroit où l'on aurait le droit d'y toucher. Ce qui change, c'est ce
   que l'application DIT, et si elle POUSSE. */
/* ═══ v2005 — CE QUI NE PEUT PAS ENTRER DANS UN CALCUL PEUT ENTRER DANS UNE
       PHRASE ══════════════════════════════════════════════════════════════
   `A-VENIR.md` rangeait `cafe`, `alcool` et `soucisSommeil` parmi les réponses
   délibérément muettes : ce sont des DÉCLARATIONS, et le projet interdit de
   les faire entrer dans un score. La règle tient toujours, et rien ici ne
   touche un chiffre.
   MAIS ELLE NE DISAIT RIEN DE CE QUE L'APPLICATION RACONTE. Le coach servait à
   tout le monde « l'hygiène (hydratation, alcool/caféine tardifs) », y compris
   à quelqu'un qui venait de déclarer NE JAMAIS BOIRE DE CAFÉ. Et l'écran qui
   pose la question promet noir sur blanc : « Les deux pèsent sur ton sommeil
   et ta récup — sans jugement. » On ne tenait ni la mesure ni la promesse.

   ON NE NOMME QUE CE QUI PÈSE VRAIMENT.
   · Le café à partir de TROIS par jour : un ou deux, pris le matin, ne sont
     pas un levier de récupération, et les nommer ferait du bruit.
   · L'alcool à partir de CHAQUE SEMAINE : « occasionnel » ne se corrige pas.
   · Rien de déclaré du tout → la phrase générique d'avant, mot pour mot.
   LE TABAC RESTE DEHORS, ET C'EST UN CHOIX. Son écran, « Tu fumes ? », ne
   promet aucun lien avec le sommeil — contrairement à celui du café. En parler
   ici serait commenter le tabagisme de quelqu'un qui n'a rien demandé, sur une
   page qui promettait « sans jugement ». Ce n'est pas à FLINT de le faire. */
window.flLevierHygiene=function(){try{
 var o=(typeof flOnb==='function')?flOnb():{};
 var c=(o.cafe||'')+'', a=(o.alcool||'')+'';
 if(!c&&!a)return 'hydratation, alcool/caféine tardifs';   /* rien de déclaré */
 var q=[];
 if(c==='3-4'||c==='5+')q.push('le café passé 14 h');
 if(a==='hebdo'||a==='quotidien')q.push('l\'alcool du soir');
 if(!q.length)return 'l\'hydratation, surtout';
 return 'hydratation, '+q.join(' et ');
}catch(e){return 'hydratation, alcool/caféine tardifs';}};

/* CE QU'IL A DÉCLARÉ DE SES NUITS, ET QUE L'ÉCRAN SOMMEIL NE LUI DISAIT JAMAIS.
   « Dur de m'endormir », « Réveils nocturnes », « Besoin de siestes » partaient
   dans `profile.onb` et personne ne les lisait : le conseil de fin était le
   même pour les trois — « horaires réguliers, chambre fraîche et sombre,
   écrans coupés 30 min avant ».
   ON S'ARRÊTE À DEUX SOUCIS. Trois conseils enchaînés font un mur de texte que
   personne ne lit, et le troisième serait de toute façon le moins prioritaire.
   « Rien de tout ça », ou rien de déclaré, rend la phrase générique intacte. */
window.flConseilSommeil=function(){try{
 var l=((typeof flOnb==='function')?flOnb():{}).soucisSommeil;
 var GEN='Pour mieux récupérer : horaires réguliers, chambre fraîche et sombre, écrans coupés 30 min avant.';
 if(!Array.isArray(l)||!l.length)return GEN;
 var T={endormissement:'c\'est la régularité de l\'heure de coucher qui pèse le plus, puis les écrans coupés 30 min avant',
        reveils:'une chambre plus fraîche aide, et un dîner ou un verre tardif les multiplient',
        siestes:'une sieste ne mange la nuit qu\'au-delà de 30 min ou après 16 h — plus tôt et plus courte, elle est gratuite'};
 var NOM={endormissement:'du mal à t\'endormir', reveils:'des réveils nocturnes', siestes:'un besoin de siestes'};
 var ordre=['endormissement','reveils','siestes'], n=[], t=[];
 for(var i=0;i<ordre.length&&n.length<2;i++)
  if(l.indexOf(ordre[i])>=0){n.push(NOM[ordre[i]]);t.push(T[ordre[i]]);}
 if(!n.length)return GEN;                                  /* « rien de tout ça » */
 return 'Tu as signalé '+n.join(' et ')+' : '+t.join(', et ')+'.';
}catch(e){return 'Pour mieux récupérer : horaires réguliers, chambre fraîche et sombre, écrans coupés 30 min avant.';}};

window.flTonCoach=function(){try{
 var t=(((typeof flOnb==='function')?flOnb():{}).coach||'')+'';
 return ({motivant:1,analytique:1,intensif:1,aucun:1}[t])?t:'motivant';
}catch(e){return 'motivant';}};

/* CE QUE FLINT N'A PAS LE DROIT DE FAIRE AVEC UNE CONDITION MÉDICALE.
   Ni la diagnostiquer, ni la faire entrer dans un calcul, ni s'en servir pour
   baisser un score — une récupération n'est pas moins bonne parce qu'on a
   coché une case. Ce qu'elle peut faire, et qu'elle ne faisait pas : ARRÊTER
   DE POUSSER, et dire d'où viennent ses repères.
   ON NE RETIENT QUE LES CONDITIONS QUI CONCERNENT LA CHARGE. Cholestérol et
   glycémie sont des sujets de santé, pas des contre-indications à une séance :
   les faire remonter ici serait de la médecine de comptoir. « Médicaments
   réguliers » est écarté pour la même raison — la case ne dit pas lesquels. */
window.flPrudenceSante=function(){try{
 var l=((typeof flOnb==='function')?flOnb():{}).sante;
 if(!Array.isArray(l))return null;
 var N={grossesse:'ta grossesse', operation:'ton opération récente',
        blessure:'ta blessure en cours', chronique:'ta maladie chronique'};
 var d=[]; for(var i=0;i<l.length;i++)if(N[l[i]])d.push(N[l[i]]);
 if(!d.length)return null;
 var q=d.length===1?d[0]:(d.slice(0,-1).join(', ')+' et '+d[d.length-1]);
 return {quoi:q, txt:'Tu as signalé '+q+' à l\'inscription. Ces repères viennent de tes mesures, pas d\'un avis médical — pour la charge, suis ce que ton médecin t\'a dit.'};
}catch(e){return null;}};

/* « PAS DE COACH » DOIT RETIRER LE COACH. L'onglet vit dans la barre du bas et
   une carte du profil y mène ; les deux disparaissent. La vue elle-même reste
   joignable et fonctionnelle — on cache une porte, on ne fabrique pas un
   cul-de-sac. `nav` est en `display:flex`, les boutons se répartissent seuls :
   il n'y a pas de gabarit à quatre colonnes à recalculer. */
window.flAppliqueCoach=function(){try{
 var off=(flTonCoach()==='aucun');
 var b=document.querySelector('#nav button[data-v="coach"]');
 if(b)b.style.display=off?'none':'';
 if(off&&document.body)document.body.classList.add('sans-coach');
 else if(document.body)document.body.classList.remove('sans-coach');
 if(typeof moveNav==='function')moveNav();
}catch(e){}};

function coachReply(q){var n=_cnorm(q),rv=recovery(),t=sensorOf(tk()),p=getProfile(),tg=strainTarget(),nm=esc(p.name||'');
 if(!rv)return "Je n'ai pas encore tes données de cette nuit. Synchronise ta Polar Loop et je te conseillerai précisément.";
 var s=rv.s,zone=s>=67?'haute':s>=34?'modérée':'basse';
 if(/(pret|prete|entrain|pousser|seance|forme|aujourd|peux|wod|muscu|metcon)/.test(n)){
  /* v2002 — LE FAIT D'ABORD, LE TON ENSUITE. Le score et la fourchette
     d'effort sont écrits UNE fois et sont les mêmes dans les quatre tons :
     c'est ce qui garantit qu'un ton ne peut pas dériver vers un autre
     conseil. Seuls l'ouverture et la consigne changent. */
  var niv=(s>=67)?2:((s>=34)?1:0);
  var fait=['Récup basse ('+s+'%) : ton corps n\'a pas fini d\'encaisser. Si tu t\'entraînes, reste sous <b>'+tg[1]+'</b> d\'effort.',
            'Récup modérée ('+s+'%). Vise un effort de <b>'+tg[0]+' à '+tg[1]+'</b>.',
            'Récup haute ('+s+'%). Vise un effort de <b>'+tg[0]+' à '+tg[1]+'</b>.'][niv];
  var CAD={
   motivant:[['Aujourd\'hui, lève le pied. ','Repos actif, mobilité ou marche.'],
             ['Tu peux t\'entraîner, mais dose. ','Technique ou métcon léger plutôt qu\'un max — garde de la marge pour demain.'],
             ['Feu vert 🔥 ','Ton corps a bien encaissé — c\'est le bon jour pour une grosse séance. Reste à l\'écoute de tes sensations.']],
   analytique:[['','En dessous de 34 %, la VFC et la FC au repos sont encore dégradées : la charge coûterait plus qu\'elle ne rapporte.'],
               ['','Entre 34 et 67 %, le système nerveux est revenu en partie seulement — le rendement d\'une séance max serait médiocre.'],
               ['','Au-dessus de 67 %, la VFC est revenue à sa normale : c\'est la fenêtre où une charge élevée se traduit en progrès.']],
   intensif:[['Repos. ','Marche ou mobilité, rien d\'autre. Demain sera meilleur.'],
             ['Technique aujourd\'hui. ','Pas de max. Tu joues la séance de demain.'],
             ['Vas-y. ','C\'est le jour — ne le gaspille pas.']],
   /* « Juste mes données » : le fait seul, sans ouverture ni consigne. */
   aucun:[['',''],['',''],['','']]
  };
  var c=(CAD[(typeof flTonCoach==='function')?flTonCoach():'motivant']||CAD.motivant)[niv];
  /* LA PRUDENCE RETIRE LA POUSSÉE, ELLE NE CHANGE AUCUN CHIFFRE.
     ⚠️ ELLE LA RETIRE DE L'OUVERTURE AUSSI, et c'est le banc qui l'a exigé :
     une première version ne remplaçait que la fin de phrase, si bien que le
     ton « intensif » continuait d'ouvrir par « Vas-y. » à quelqu'un qui venait
     de déclarer une grossesse. « Feu vert 🔥 » avait le même défaut.
     À récup haute, TOUS les tons poussent — on retire le cadre ENTIER et on
     garde le fait. Aux deux autres niveaux le cadre est déjà prudent et son
     conseil reste utile : on ne fait qu'ajouter la mise au point.
     Le score, lui, ne bouge dans aucun cas : une récupération n'est pas moins
     bonne parce qu'on a coché une case. */
  var pr=(typeof flPrudenceSante==='function')?flPrudenceSante():null;
  if(pr&&niv===2)c=['',''];
  return c[0]+fait+(c[1]?' '+c[1]:'')+(pr?' '+pr.txt:'');
 }
 if(/(pourquoi|score|recup\b|si bas|si haut|explique)/.test(n)){
  var c=rv.c.slice().sort(function(a,b){return Math.abs(b[2])-Math.abs(a[2])});
  var top=c[0],dir=top[2]>=0?'portée surtout par ta ':'pénalisée surtout par ta ',second=c[1]?(' et ta '+c[1][0]+' ('+c[1][1]+')'):'';
  return 'Ton score est de <b>'+s+'%</b> ('+zone+'), '+dir+top[0]+' ('+top[1]+')'+second+'. Dans le calcul, la VFC pèse le plus, puis le sommeil, la FC au repos et la respiration.';
 }
 if(/(sommeil|dormi|dormir|nuit|reveil|coucher)/.test(n)){
  var sn=sleepNight(tk());if(!sn)return "Pas de données de sommeil pour cette nuit.";
  var need=(p.need||8)*60,hh=Math.floor(sn.asleep/60)+'h'+String(Math.round(sn.asleep%60)).padStart(2,'0');
  var v=sn.asleep>=need-15?'C\'est dans ta cible 👍':sn.asleep>=need-60?'Un peu court — vise 30 min de plus.':'Nuit courte, couche-toi plus tôt ce soir.';
  /* v2005 — le conseil de fin tient compte des soucis declares. */
  return 'Tu as dormi <b>'+hh+'</b> (besoin '+Math.floor(need/60)+'h). '+v+' '+((typeof flConseilSommeil==='function')?flConseilSommeil():'');
 }
 if(/(effort|charge|intensite|combien|forcer|borg)/.test(n))return 'Vise un effort entre <b>'+tg[0]+' et '+tg[1]+'</b> aujourd\'hui (échelle 0-21). Au-delà tu creuses ta récup ; en dessous tu progresses moins. En crossfit, alterne une grosse séance et une séance technique le lendemain.';
 if(/(mieux recup|recuperer|recup plus|progresser|conseil|ameliorer)/.test(n))return 'Tes 3 leviers, par ordre d\'impact : <b>1) le sommeil</b> (régularité + durée), <b>2) doser l\'effort</b> (évite d\'enchaîner les séances max), <b>3) l\'hygiène</b> ('+((typeof flLevierHygiene==='function')?flLevierHygiene():'hydratation, alcool/caféine tardifs')+'). Remplis ton journal et je te dirai ce qui pèse le plus pour toi.';
 if(/(vfc|hrv|variabilite)/.test(n)){var b=baseStat('hrv'),hv=t&&t.hrv!=null?t.hrv:null;if(hv==null)return "Pas de VFC mesurée cette nuit.";var rel=b?(hv>=b.m+b.sd?'au-dessus de ta normale (bon signe)':hv<=b.m-b.sd?'sous ta normale (fatigue ou stress)':'dans ta plage habituelle'):'';return 'Ta VFC cette nuit : <b>'+hv+' ms</b>'+(rel?', '+rel:'')+'. Une VFC haute = système nerveux bien récupéré. Sommeil régulier, gestion du stress et hydratation l\'améliorent.';}
 if(/(fc |cardiaque|pouls|battement|coeur|rhr)/.test(n)){var hr=t&&t.rhr!=null?t.rhr:null;if(hr==null)return "Pas de FC au repos mesurée cette nuit.";var br=baseStat('rhr'),rel=br?(hr>br.m+br.sd?'plus haute que ta normale — fatigue, stress ou début de maladie possible':'dans ta normale'):'';return 'Ta FC au repos : <b>'+hr+' bpm</b>'+(rel?', '+rel:'')+'. Plus elle est basse et stable, mieux c\'est.';}
 if(/(fatigue|creve|epuise|nase|hs|crame)/.test(n)){if(s<34)return 'Tes données confirment : récup basse ('+s+'%). Normal de te sentir entamé. Priorise sommeil, hydratation et repos actif — tu reviendras plus fort.';return 'Tes données sont plutôt bonnes ('+s+'%). Si tu te sens fatigué malgré ça, écoute ton ressenti : le stress du quotidien pèse parfois plus que les chiffres.';}
 if(/stress|anxi|tendu|nerveux/.test(n))return 'Le stress se lit sur ta VFC et ta FC au repos. Aujourd\'hui ta récup est '+zone+' ('+s+'%). Quelques minutes de respiration lente (cohérence cardiaque) le soir aident vraiment.';
 if(/(merci|nickel|super|cool|parfait|top|genial)/.test(n))return 'Avec plaisir 💪 Je suis là quand tu veux.';
 if(/(salut|bonjour|hello|coucou|hey|ca va|yo)/.test(n))return 'Salut'+(nm?' '+nm:'')+' ! Ta récup du jour est '+zone+' ('+s+'%). Demande-moi si tu peux pousser, pourquoi ton score, comment a été ta nuit, ou quel effort viser.';
 return 'Je m\'appuie sur tes données du jour (récup <b>'+s+'%</b>). Je peux te dire si tu es prêt à t\'entraîner, pourquoi ton score est comme ça, comment a été ta nuit, ou quel effort viser. Essaie une des suggestions 👇';}
/* ---------- UPDATE / INIT ---------- */

/* ═══ 25 sept. 2026 — LE COACH V2 : CE QU'IL SAIT AVANT MÊME DE DEMANDER ═════
   Trois portes, appelées par PontCoach (une seule évaluation chacune) :
     · flCoachInstantane(opts) — l'instantané qui voyage avec CHAQUE question ;
     · flCoachJour(off)        — une journée telle que ses écrans la montrent
                                 (l'outil getDay, et instantane.jourAffiche) ;
     · flCoachOutils(appels)   — les cinq outils JS d'un tour, en UN lot.
   POURQUOI ICI ET PAS DANS index.html : ce fichier voyage par OTA signé, et
   index.html a un cliquet de lignes. C'est un SATELLITE chargé AVANT le grand
   bloc : rien n'est capturé au chargement, tout accesseur est résolu à l'appel.
   LA RÈGLE, sans exception : on ne recalcule JAMAIS un chiffre qu'un écran
   montre déjà — on appelle l'accesseur que l'écran appelle, avec un décalage
   EXPLICITE. `null` veut dire « pas mesuré », jamais 0 ni la chaîne 'null'.
   Bancs : tests/test-coach-instantane.js et tests/test-coach-outils-lot.js,
   sur le vrai moteur monté avec l'export réel de Dino. */
(function(){
'use strict';
/* Le numéro que le natif lit pour choisir les déclarations d'outils (V1/V2) :
   un moteur OTA plus ancien n'a pas ce nombre, le serveur reste alors en V1. */
window.flCoachOutilsVersion=1;

/* Ce qui ne part JAMAIS au serveur, à aucune profondeur : séries brutes (taille)
   et champs privés. Les listes blanches ci-dessous ne les prennent pas ; la
   liste sert au banc et au dernier filet `flcPurger`. */
var FLC_INTERDITS={hr:1,hrT:1,hrSamples:1,points:1,troncons:1,segments:1,courbe:1,
  seaux:1,rr:1,rrH:1,ph:1,photo:1,avatar:1,sante:1,tabac:1,jrn1:1,jrn2:1,
  lastName:1,city:1,email:1};
/* Le nom court d'un jour de la semaine dans la langue de l'app : jamais un
   tableau en dur (garde-langues) — flJoursCourts rend « lun. », on ôte le point. */
function flcNomJour(d){
 try{var j=flJoursCourts()[d.getDay()];return String(j||'').replace(/\.$/,'');}catch(e){return String(d.getDay());}
}

/* ── petits outils privés ─────────────────────────────────────────────────── */
/* Octets UTF-8 du JSON qui voyage. TextEncoder sur le téléphone ; le compte à la
   main sert au banc (un contexte vm n'a pas TextEncoder) et donne le même nombre. */
function flcOctets(o){
 var s; try{s=JSON.stringify(o);}catch(e){return 0;}
 if(s==null)return 0;
 try{if(typeof TextEncoder==='function')return new TextEncoder().encode(s).length;}catch(e){}
 var n=0;
 for(var i=0;i<s.length;i++){var c=s.charCodeAt(i);
  if(c<0x80)n+=1; else if(c<0x800)n+=2;
  else if(c>=0xD800&&c<=0xDBFF){n+=4;i++;} else n+=3;}
 return n;
}
/* Une DURÉE s'écrit « 7h48 » (la notation unique de la maison), une HEURE « 23:05 ». */
function flcHM(min){
 if(min==null||min===''||!isFinite(+min))return null;
 min=Math.round(+min); var s=min<0?'-':''; min=Math.abs(min);
 return s+Math.floor(min/60)+'h'+('0'+(min%60)).slice(-2);
}
function flcHHMM(m){
 if(m==null||m===''||!isFinite(+m))return null;
 m=((Math.round(+m)%1440)+1440)%1440;
 return ('0'+Math.floor(m/60)).slice(-2)+':'+('0'+(m%60)).slice(-2);
}
function flcR(x,dec){
 if(x==null||x===''||typeof x==='boolean')return null;
 x=+x; if(!isFinite(x))return null;
 var p=Math.pow(10,dec||0); return Math.round(x*p)/p;
}
function flcTxt(s,n){
 if(s==null)return null; s=String(s); n=n||300;
 return s.length>n?s.slice(0,n-1)+'…':s;
}
/* Une section, une panne nommée dans `manques` : elle n'arrête jamais le reste. */
function flcSurBase(nom,fn,manques){
 try{return fn();}catch(e){manques.push(nom+':'+String((e&&e.message)||e).slice(0,40));return undefined;}
}
var flcSur=flcSurBase;   /* l'instantané la double d'un chronomètre quand on le lui demande */
function flcMs(){try{if(typeof performance!=='undefined'&&performance.now)return performance.now();}catch(e){}return Date.now();}
/* LE JOUR REGARDÉ EST UN ÉTAT GLOBAL, et plusieurs accesseurs le suivent même
   avec un argument (flSommeilData.stressNuit, flHebdoDetail, flProfilRecords) ;
   flActiviteData pose _flCurSess. On les sauve, on les force, on les REND —
   sinon le Coach déplacerait sous les doigts le jour que l'écran montre. */
function flcAvecJour(off,fn){
 var j=window.flDayOff, s=window._flCurSess;
 try{window.flDayOff=off;return fn();}
 finally{window.flDayOff=j;window._flCurSess=s;}
}
function flcAvecJour0(fn){return flcAvecJour(0,fn);}
/* {jour:-3} ou {date:'2026-09-12'} → un décalage, borné à [−400, 0]. La date se
   compare à tk(d), la SEULE façon dont le moteur nomme ses journées. */
function flcOffset(a){
 a=a||{};
 if(a.date!=null&&a.date!==''){
  var m=String(a.date).match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/); if(!m)return null;
  var cle=(+m[1])+'-'+(+m[2])+'-'+(+m[3]);
  for(var d=0;d>=-400;d--){if(tk(d)===cle)return d;}
  return null;
 }
 if(a.jour!=null&&a.jour!==''){
  /* un jour à venir ou au-delà de 400 n'est pas « le plus proche » : null,
     comme une date hors de portée (revue du 25 sept.) */
  var j=parseInt(a.jour,10); if(!isFinite(j)||j>0||j<-400)return null;
  return j;
 }
 return null;
}
/* Retire des étapes dans l'ordre donné jusqu'à tenir sous le plafond ; chaque
   étape faite est NOMMÉE dans `tronque` — un modèle qui ne sait pas qu'on a
   coupé croirait que la donnée n'existe pas. */
function flcBorner(o,plafond,ordre){
 for(var i=0;i<ordre.length&&flcOctets(o)>plafond;i++){
  var fait=false; try{fait=(ordre[i][1](o)!==false);}catch(e){}
  if(fait)(o.tronque=o.tronque||[]).push(ordre[i][0]);
 }
 return o;
}
/* Le dernier filet : une clé interdite ne passe pas, même si un accesseur en
   ajoutait une demain à un objet qu'on recopie. */
function flcPurger(o,prof){
 if(!o||typeof o!=='object'||(prof||0)>8)return o;
 if(Array.isArray(o)){for(var i=0;i<o.length;i++)flcPurger(o[i],(prof||0)+1);return o;}
 for(var k in o){if(!Object.prototype.hasOwnProperty.call(o,k))continue;
  if(FLC_INTERDITS[k]||(k==='fc'&&Array.isArray(o[k])))delete o[k];
  else flcPurger(o[k],(prof||0)+1);}
 return o;
}
function flcPrendre(src,cles){
 var o={}; if(!src)return o;
 cles.forEach(function(k){if(src[k]!==undefined)o[k]=src[k];});
 return o;
}
/* Un champ d'objet sans valeur n'apprend rien au modèle et coûte des octets :
   on le retire là où l'absence se lit d'elle-même (fiches, profil, corps). Les
   chiffres-clés (score, durée, consommées…) gardent leur null explicite. */
function flcSansNuls(o,garder){
 if(!o||typeof o!=='object'||Array.isArray(o))return o;
 Object.keys(o).forEach(function(k){if(o[k]==null&&!(garder&&garder.indexOf(k)>=0))delete o[k];});
 return o;
}
function flcJourCourt(K){
 try{var p=String(K).split('-'),d=new Date(+p[0],(+p[1])-1,+p[2]);
  return flcNomJour(d)+' '+d.getDate();}catch(e){return K;}
}
/* Le décalage CIVIL d'une clé : une séance de la journée logique peut vivre
   sous la clé de la veille, et flActiviteData la cherche sous SA clé. */
function flcOffDe(K){
 if(!K)return null; K=String(K);
 for(var d=0;d>=-400;d--){if(tk(d)===K)return d;}
 return null;
}
function flcNumJour(s){var m=String(s==null?'':s).match(/(\d{1,2})/);return m?+m[1]:null;}
/* Une ligne d'un tableau de jours (7 jours au plus) retrouvée par son NUMÉRO de
   jour : deux payloads d'écran n'ont pas forcément la même ancre (le matin, la
   récup peut encore montrer la veille). */
function flcParNum(arr,num,numDe){
 if(!arr||num==null)return undefined;
 for(var i=0;i<arr.length;i++){if(numDe(arr[i])===num)return arr[i];}
 return undefined;
}

/* Le journal du soir, compact : « alcool 2 · café 1-2 · avion 3 à 6 h ».
   `_saved` sans aucun « oui » = trois « Non » (les « Non » sont retirés) → 'rien'.
   Le journal de K agit sur la récup de K+1 : c'est au lecteur de le dire. */
var FLC_JRN_NOMS={alcool:'alcool',cafeine:'café',avion:'avion'};
function flcJournal(j,avecNote){
 if(!j||typeof j!=='object')return null;
 var t=[],oui=false,rep=false;
 Object.keys(j).forEach(function(k){
  if(k.charAt(0)==='_'||k==='note'||/_(n|q|duree|arrivee)$/.test(k))return;
  if(j[k]===false){rep=true;return;}
  if(j[k]!==true)return;
  oui=true;rep=true;
  var q=j[k+'_n']||j[k+'_duree']||j[k+'_q']||'';
  if(k==='avion'&&j.avion_arrivee)q=(q?q+', ':'')+String(j.avion_arrivee).toLowerCase();
  t.push((FLC_JRN_NOMS[k]||k)+(q?' '+q:''));
 });
 if(!oui&&(j._saved===true||rep))t.push('rien');
 if(avecNote&&j.note)t.push('note « '+flcTxt(String(j.note).replace(/\s+/g,' '),80)+' »');
 return t.length?flcTxt(t.join(' · '),200):null;
}

/* ═══ LES BRIQUES D'UNE JOURNÉE — partagées par l'instantané et getDay ═══════ */
var FLC_FACTEURS_COLS=['cle','valeur','unite','reference','refNom','ecartSigma','contribLogit','motifAbsence'];
/* Les facteurs tels que la page Récupération les imprime. `valeur` reste la
   chaîne de l'écran ; une valeur absente reste null (le prototype écrivait
   « null /min »). spark, couleur et libellé ne disent rien au modèle. */
function flcFacteurs(rd){
 return (rd&&rd.metriques||[]).map(function(m){
  return [m.cle||null, m.valeur==null?null:String(m.valeur),
          m.unite?(String(m.unite).trim()||null):null,
          m.reference==null?null:String(m.reference), m.refNom||null,
          flcR(m.ecart,1), flcR(m.contrib,2),
          m.motifAbsence?flcTxt(m.motifAbsence,160):null];
 });
}
/* Les entrées SCELLÉES du score (recovFige_.e). Jamais jrn1/jrn2 : ce sont les
   réponses brutes du journal, en JSON. */
function flcScelle(K){
 var f=DB.get('recovFige_'+K,null); if(!f||!f.e)return null;
 var o=flcPrendre(f.e,['hrv','hrvSrc','rhr','resp','sleepMin','tempNuit','bH','bR','bP']);
 if(f.s!=null)o.score=flcR(f.s,0);
 return o;
}
/* 25 sept. 2026 (revue) — LE JOUR QUE LA RÉCUP DÉCRIT. Le matin, la page peut
   montrer la VEILLE (estVeille) pendant que la porte retient le chiffre du
   jour : sceau, pénalité, source de VFC et état se lisent sur le jour AFFICHÉ.
   Lus sur tk(0), ils livraient le 85 scellé que l'écran cache, à côté du 84
   montré. Porte fermée sans veille à montrer : `null`, rien de ce matin. */
function flcJourRecup(rd,K,porte){
 var Kr=(rd&&rd.estVeille&&rd.jourAffiche)?String(rd.jourAffiche):K;
 return (Kr===K&&porte===false)?null:Kr;
}
function flcRecupScelle(r,Kr){
 r.scelle=Kr?flcScelle(Kr):null;
 var pen=Kr?DB.get('recovAj_'+Kr,null):null; r.penalite=(pen==null||+pen===0)?null:flcR(pen,0);
 return r;
}
/* Ma nuit (l'anneau) RECALCULE le score d'une nuit passée ; les barres de la
   semaine et getHistory montrent celui SCELLÉ ce matin-là. Quand ils diffèrent
   (87 contre 76 le 8 sept.), les deux voyagent, nommés. Rend le scellé. */
function flcScoreScelle(n,K){
 var sf=null;try{sf=flNuitScoreFige(K);}catch(e){}
 if(sf==null||n.score==null||Math.round(+sf)===Math.round(+n.score))return sf;
 n.scoreScelle=Math.round(+sf);
 n.scoreNote='score = anneau de Ma nuit (recalculé) ; scoreScelle = publié ce matin-là (barres de la semaine, getHistory)';
 return sf;
}
/* Une durée d'écran « 0:03:45 » (h:mm:ss) ou « 03:45 » (mm:ss) dans la notation
   de la maison, « 0h04 » : NN:NN se lit comme une HEURE (revue du 25 sept.). */
function flcDureeHM(s){
 if(s==null||s==='')return null;
 var p=String(s).trim().split(':');
 if(p.length<2||p.length>3||p.some(function(x){return !/^\d+$/.test(x);}))return String(s);
 p=p.map(Number);
 return flcHM(p.length===3?p[0]*60+p[1]+p[2]/60:p[0]+p[1]/60);
}
/* Les ECG s'écrivent sous « ecg_<epoch> » : DB.famille n'ôte que les dates,
   chaque ECG est donc SA famille et DB.tampon('ecg_') reste à 0. On somme les
   compteurs de toutes les familles ecg_ (revue du 25 sept.). */
function flcTamponEcg(){
 var p=window._flEcrPar||{},n=0;
 for(var k in p){if(Object.prototype.hasOwnProperty.call(p,k)&&k.indexOf('ecg_')===0)n+=(+p[k]||0);}
 return n;
}
function flcRecupBase(rd){
 rd=rd||{};
 return {score:(rd.score==null?null:rd.score), verdict:rd.verdict||null,
         estVeille:!!rd.estVeille, jourAffiche:rd.jourAffiche||null,
         baseNuits:(rd.baseNuits==null?null:rd.baseNuits),
         nuitsManquantes:(rd.nuitsManquantes==null?null:rd.nuitsManquantes),
         journalAjust:rd.journalAjust?flcTxt(rd.journalAjust,160):null,
         facteursCols:FLC_FACTEURS_COLS, facteurs:flcFacteurs(rd)};
}
/* La nuit, liste blanche de Ma nuit. Jamais fc, segments, semaine/mois bruts,
   stressNuit (il suit flDayOff) ni oxygene.troncons. */
function flcNuitBase(sd){
 sd=sd||{}; var reg=sd.regularite||null, ox=sd.oxygene||null;
 var h2m=function(h){return (h==null||!isFinite(+h))?null:flcHM(+h*60);};
 var o={nuitEtat:sd.nuitEtat||null, estVeille:!!sd.estVeille,
  duree:sd.duree||null, score:(sd.score==null?null:sd.score),
  couche:sd.couche||null, reveil:sd.reveil||null,
  efficacite:(sd.efficacite==null?null:sd.efficacite),
  reveils:(sd.reveils==null?null:sd.reveils), tempsReveil:sd.tempsReveil||null,
  auLit:sd.auLit||null, sourceNuit:sd.sourceNuit||null,
  stades:(sd.stades||[]).map(function(s){return [s.nom||null,(s.pct==null?null:s.pct),s.duree||null];}),
  besoin:h2m(sd.besoinH), besoinMinimum:h2m(sd.besoinMinimumH),
  besoinSrc:sd.besoinSrc?flcTxt(sd.besoinSrc,120):null,
  besoinEffortRepere:h2m(sd.besoinEffortRepereH),
  besoinDetteRepere:h2m(sd.besoinDetteRepereH),
  detteAccumulee:h2m(sd.detteH)};
 if(reg)o.regularite={score:(reg.score==null?null:reg.score),
  ecartMin:(reg.ecartMin==null?null:reg.ecartMin),
  cibleCouche:flcHHMM(reg.cibleCouche), cibleReveil:flcHHMM(reg.cibleReveil)};
 if(ox&&(ox.moyenne!=null||ox.min!=null))o.oxygene={moyenne:(ox.moyenne==null?null:ox.moyenne),min:(ox.min==null?null:ox.min)};
 return o;
}
/* Le besoin d'une nuit en h:mm (base + dette + effort − sieste). */
function flcBesoin(b){
 if(!b)return null;
 return {min:flcHM(b.min), base:flcHM(b.base), dette:flcHM(b.dette),
         effort:flcHM(b.effort), sieste:flcHM(b.sieste), plafonne:(b.plafonne==null?null:!!b.plafonne)};
}
/* La fiche « Ce qui compose le score » de Ma nuit. Lignes APLATIES en texte :
   le validateur du serveur refuse plus de cinq niveaux d'imbrication. */
function flcScoreDetail(K,off,scoreNuit){
 var f=flFicheData('sleepscore',K,off); if(!f||!f.lignes)return null;
 var o={lignes:f.lignes.map(function(l){
   return flcTxt((l.nom||'')+' '+(l.val||'')+(l.poids!=null?' = '+l.poids+' pts':''),80);})};
 if(f.total){o.socle=(f.total.val==null?null:String(f.total.val));
  o.total=(f.total.score==null?null:String(f.total.score));}
 if(f.pied)o.pied=flcTxt(f.pied,200);
 if(o.total!=null&&scoreNuit!=null&&+o.total!==+scoreNuit)o.ecartScelle=true;
 return o;
}
function flcSiestes(cles){
 var out=[];
 cles.forEach(function(K){(DB.get('sessions_'+K,[])||[]).forEach(function(s){
  if(s&&s.type==='nap')out.push([K,s.start||null,(s.dur==null?null:s.dur)]);});});
 return out;
}
function flcStressNuit(sn){
 if(!sn||sn.moyenne==null)return null;
 return flcPrendre(sn,['moyenne','pic','minutesCalme','minutesFaible','minutesModere','minutesEleve']);
}
/* Les séances de la journée LOGIQUE, colonnes de la carte. note20 = e.valeur,
   la note que la carte affiche — jamais actStrain et son repli fabriqué. */
var FLC_SEANCES_COLS=['j','debut','nom','min','note20','etat','pose','origine','fcMoy','fcMax','kcal','id'];
function flcBrute(e){
 var ss=DB.get('sessions_'+e.jour,[])||[], s=null;
 if(e.id)for(var i=0;i<ss.length;i++){if(ss[i]&&ss[i].id===e.id){s=ss[i];break;}}
 if(!s&&e.rang!=null)s=ss[e.rang]||null;
 return s;
}
function flcKcal(e,s){
 try{if(!s)return null;var v=flKcalActivite(e.jour,s);return flcR(v,0);}catch(x){return null;}
}
function flcSeancesDe(d){
 return (flEntreesJour(d)||[]).filter(function(e){return e&&e.source==='seance'&&e.genre!=='sommeil';});
}
/* L'identité d'une séance à travers les décalages (dédoublonnage). */
function flcCleSeance(e){return String(e.id||(e.jour+'#'+e.rang));}
function flcLigneSeance(e,d){
 var s=flcBrute(e);
 return [d, e.debut||null, flcTxt(e.nom,40), (e.dur==null?null:e.dur),
         (e.valeur==null?null:e.valeur), (e.etat&&e.etat!=='ready')?e.etat:null,
         e.genre==='manuelle'?'toi':'bracelet', e.srcs||null,
         (e.avgHr==null?null:e.avgHr), (s&&s.maxHr!=null?flcR(s.maxHr,0):null),
         flcKcal(e,s), e.id||null];
}
/* La fiche d'une séance, liste blanche. Zones aplaties en texte (profondeur). */
function flcFicheCompacte(e,d){
 var dc=flcOffDe(e.jour); if(dc==null)dc=d;
 var a=flActiviteData(e.rang,dc,null,e.id); if(!a||!a.aDesDonnees)return null;
 var o=flcPrendre(a,['nom','verdict','sous','minutes','effort','kcal','kcalRaison','moyenne','maximum',
   'coeurFiable','coeurRaison','hrSource','effortMoy','fcMoyMoy','fcMaxMoy','kcalMoy','pasMoy']);
 o.id=e.id||null; o.j=d; o.debut=e.debut||null;
 /* « ZONE 1 44 % 0:17:49 » → « Z1 44 % 0h18 », et les zones à 0 % se taisent */
 if(a.zones&&a.zones.length)o.zones=a.zones.filter(function(z){return z&&z.pct&&!/^0\s*%/.test(String(z.pct));})
  .map(function(z){return String(z.nom||'').replace(/^ZONE\s*/i,'Z')+' '+(z.pct||'')+' '+(flcDureeHM(z.duree)||'');});
 ['sous','coeurRaison','kcalRaison'].forEach(function(k){if(o[k])o[k]=flcTxt(o[k],140);});
 return flcSansNuls(o,['coeurFiable','effort']);
}
/* La fiche est le calcul le plus lourd du Coach (~500 lectures) et, pour une
   séance passée, elle ne bouge plus : on la garde par identité, avec l'empreinte
   de la séance brute (une resynchro ou une correction la change) et le jour. */
function flcFicheMemo(e,d){
 var s=flcBrute(e), emp=tk(0)+'|'+(e.etat||'')+'|'+(e.valeur||'')+'|'+(s?JSON.stringify(s).length+':'+(s.dur||'')+':'+(s.avgHr||'')+':'+(s.maxHr||'')+':'+(s.kcal||'')+':'+(s.name||''):'');
 var M=window._flCiFiches||(window._flCiFiches={}), k=String(e.id||(e.jour+'#'+e.rang));
 if(M[k]&&M[k].emp===emp)return JSON.parse(JSON.stringify(M[k].v));
 var v=flcFicheCompacte(e,d);
 var ks=Object.keys(M); if(ks.length>=24)delete M[ks[0]];
 M[k]={emp:emp,v:v};
 return v?JSON.parse(JSON.stringify(v)):v;
}

/* ═══ flCoachJour(off) — UNE JOURNÉE COMME SES ÉCRANS LA MONTRENT ════════════
   Les mêmes appels qu'un écran fait quand ce jour est sélectionné — d'où
   flDayOff forcé à `off` le temps de l'appel, puis rendu. Jamais en boucle :
   flRecupData(−3) seul coûte près d'une seconde à froid. */
var _flcLot=null;   /* mémoire d'UN lot d'outils : flRecupData / flSommeilData par off */
function flcRecupData(off){
 if(_flcLot){var k='r'+off; if(!(k in _flcLot))_flcLot[k]=flRecupData(off); return _flcLot[k];}
 return flRecupData(off);
}
function flcSommeilData(off){
 if(_flcLot){var k='s'+off; if(!(k in _flcLot))_flcLot[k]=flSommeilData(off); return _flcLot[k];}
 return flSommeilData(off);
}
function flcJour(off,opts){
 opts=opts||{};
 off=Math.max(-400,Math.min(0,off|0));
 var K=tk(off), manques=[], o={q:'good', jour:K};
 return flcAvecJour(off,function(){
  var enT=false, porte=true;
  if(off===0){
   try{enT=!!flJourneeEnTraitement(K);}catch(e){}
   try{porte=(flNuitPublicationOuverte(K)!==false);}catch(e){}
  }
  o.libelle=flcSur('libelle',function(){
   if(off===0)return flAujourdhui();
   if(off===-1)return flHier();
   return flcJourCourt(K)+' '+(flMoisCourts()[+K.split('-')[1]-1]||'');
  },manques)||K;
  var rd=null, sd=null;
  o.recup=flcSur('recup',function(){
   rd=flcRecupData(off)||{};
   /* le jour que la page AFFICHE (la veille, le matin) — jamais tk(0) porte fermée */
   var r=flcRecupBase(rd), Kr=flcJourRecup(rd,K,porte);
   var reg=Kr?DB.get('recov_'+Kr,null):null, fg=Kr?DB.get('recovFige_'+Kr,null):null;
   r.registre=(reg==null||isNaN(+reg))?null:flcR(reg,0);
   /* Un jour passé se LIT dans le registre, jamais par flRecovLu(−N) qui
      écrit un repli : l'état se déduit du sceau. */
   r.etat=fg?'finale':(r.registre!=null?'provisoire':null);
   flcRecupScelle(r,Kr);
   /* porte fermée, le diagnostic décrirait la nuit que l'écran retient */
   if(r.score==null&&porte){
    var dg=flNuitDiagnostic(K)||{};
    r.raison=dg.recupRaison?flcTxt(dg.recupRaison,160):null;
    r.diagnostic=flcPrendre(dg,['etat','src','dormiMin','hr','hrvFenetres','rrValides','hrvOk','rhrOk','sleepOk']);
    var jr=[];try{jr=(flRecupJournal(20)||[]).filter(function(x){return x&&(x.K===K||x.jour===K);}).slice(-3);}catch(e){}
    if(jr.length)r.cycle=jr.map(function(x){return [x.t||null,x.trig||null,x.etat||null,flcTxt(x.raison,80)];});
   }
   return r;
  },manques);
  o.nuit=flcSur('nuit',function(){
   sd=flcSommeilData(off)||{};
   if(off===0&&!porte&&!sd.estVeille)return {nuitEtat:sd.nuitEtat||null, attente:true};
   if(!sd.aDesDonnees)return {nuitEtat:sd.nuitEtat||null, aDesDonnees:false};
   var n=flcNuitBase(sd);
   n.besoinDetail=flcSansNuls(flcBesoin(flBesoinJourAjuste(K)));
   /* l'écart de la fiche se juge contre le score PUBLIÉ (scellé), s'il existe */
   var sf=flcScoreScelle(n,K);
   n.scoreDetail=flcScoreDetail(K,off,sf!=null?sf:sd.score);
   var ns=flcSiestes([K]);
   if(ns.length){
    if(off>=-8)ns=ns.map(function(r){
     var st=null;try{var p=String(r[1]||'').split(':');st=flSiesteStades(K,(+p[0])*60+(+p[1]||0),r[2]);}catch(e){}
     /* les stades de la sieste, en une chaîne : « PROFOND 12 % 0h08, … » (jamais ses segments) */
     if(st&&st.stades&&st.stades.length)return r.concat([st.stades.map(function(x){return (x.nom||'')+' '+(x.pct==null?'?':x.pct)+' % '+(x.duree||'');}).join(', ')]);
     return r;});
    n.siestes=ns;
   }
   return n;
  },manques);
  var gate=(o.nuit&&o.nuit.attente);
  o.signaux=flcSur('signaux',function(){
   var s={};
   if(!gate){
    var sn=sensorOf(K)||{};
    s.vfc={v:flcR(sn.hrv,0), src:sn.hrvSrc||null};
    s.fcRepos=flcR(sn.rhr,0); s.resp=flcR(sn.resp,1);
    var t=flTempNuit(off); s.temp=t?{valeur:flcR(t.valeur,1),reference:flcR(t.reference,1),ecart:flcR(t.ecart,1)}:null;
    s.spo2Bas=flcR(flSpo2BasNuitDe(K),0);
    s.stressNuit=flcStressNuit(flStressNuit(off));
   } else s.attente=true;
   var sj=flStressJour(off)||{};
   s.stressJour={moyenne:(sj.moyenne==null?null:sj.moyenne), raison:sj.raison?flcTxt(sj.raison,120):null};
   return s;
  },manques);
  o.effort=flcSur('effort',function(){
   var e={jour:(off===0&&enT)?null:flcR(flEffortJour(off),1)};
   if(off===0&&enT)e.enTraitement=true;
   /* aujourd'hui en traitement : pas de minutes par zone (elles porteraient deux jours) */
   var z=(off===0&&enT)?null:flZonesJourLogique(off);
   e.zonesMin=z&&z.min?z.min.map(function(v){return flcR(v,0);}):null;
   var em=effMetricsOf(K)||{};
   e.zones13=flcR(em.zones13,0); e.zones45=flcR(em.zones45,0); e.muscu=flcR(em.strength,0);
   e.pas=flcR(flStepsOf(K),0); e.vo2=flcR(flVo2Max(off),0);
   return e;
  },manques);
  o.seances=flcSur('seances',function(){
   return {cols:FLC_SEANCES_COLS, lignes:flcSeancesDe(off).map(function(e){return flcLigneSeance(e,off);})};
  },manques);
  o.calories=flcSur('calories',function(){
   var c=flCaloriesDetail(K)||{}, r={};
   if(c.vide)r.vide=true;
   ['total','actives','marche','effort','metaBaseVecue'].forEach(function(k){r[k]=flcR(c[k],0);});
   r.complet=(c.complet==null?null:!!c.complet); if(c.manque)r.manque=flcTxt(c.manque,120);
   var ki=FL_HEBDO.kcalIn.get(off), ko=FL_HEBDO.kcalOut.get(off);
   r.kcalIn=flcR(ki,0); r.kcalOut=flcR(ko,0);
   r.balance=(r.kcalIn==null||r.kcalOut==null)?null:
    {v:r.kcalIn-r.kcalOut, verdict:(r.kcalIn-r.kcalOut<-150?'déficit':(r.kcalIn-r.kcalOut>150?'surplus':'équilibre'))};
   return r;
  },manques);
  o.nutrition=flcSur('nutrition',function(){
   var n=flNutritionData(off)||{};
   var r={consommees:n.consommees==null?null:String(n.consommees), budget:n.budget==null?null:String(n.budget),
          budgetNote:"plan d'aujourd'hui (le plan de ce jour-là n'est pas gardé)",
          macros:(n.macros||[]).map(function(m){return (m.nom||'')+' '+(m.actuel==null?'?':m.actuel)+'/'+(m.cible==null?'?':m.cible)+' g';})};
   if(off===0)r.budgetNote=null;
   if(opts.avecRepas){
    r.repasCols=['heure','nom','kcal','prot','gluc','lip','note10','source','confiance','confirme'];
    r.repas=(mealsOf(K)||[]).slice(0,12).map(function(m){
     return [m.time||null, flcTxt(m.name,40), flcR(m.kcal,0), flcR(m.prot,0), flcR(m.carb,0), flcR(m.fat,0),
             flcR(m.score,0), m.source||null, flcR(m.confiance,2), (m.confirme==null?null:!!m.confirme)];});
   }
   return r;
  },manques);
  o.cardio=flcSur('cardio',function(){
   var c=flCardioData(off)||{}; if(!c.aDesDonnees)return null;
   return {moyenne:flcR(c.moyenne,0), min:flcR(c.min,0), max:flcR(c.max,0),
           reposJournee:flcR(c.repos,0), couverture:flcR(c.couverture,0)};
  },manques);
  o.journal=flcSur('journal',function(){
   return {jour:flcJournal(DB.get('journal_'+K,null),true),
           veille:flcJournal(DB.get('journal_'+tk(off-1),null),true),
           note:'le journal de ce jour agit sur la récup du lendemain ; celui de la veille explique celle-ci'};
  },manques);
  o.qualite=flcSur('qualite',function(){
   var qj=flQualiteJour(off); return qj?flcPrendre(qj,['couverture','confiance','verdict']):null;
  },manques);
  if(manques.length){o.manques=manques;o.q='partial';}
  var vide=(!o.recup||o.recup.score==null)&&(!o.nuit||!o.nuit.duree)&&
           (!o.seances||!o.seances.lignes.length)&&(!o.calories||o.calories.total==null);
  if(vide)o.q='missing';
  flcPurger(o);
  flcBorner(o,opts.plafond||6144,[
   ['seances>6',function(x){if(!x.seances||x.seances.lignes.length<=6)return false;x.seances.lignes=x.seances.lignes.slice(-6);}],
   ['nutrition.repas',function(x){if(!x.nutrition||!x.nutrition.repas)return false;delete x.nutrition.repas;delete x.nutrition.repasCols;}],
   ['cardio',function(x){if(!x.cardio)return false;delete x.cardio;}],
   ['nuit.siestes',function(x){if(!x.nuit||!x.nuit.siestes)return false;delete x.nuit.siestes;}],
   ['nuit.scoreDetail',function(x){if(!x.nuit||!x.nuit.scoreDetail)return false;delete x.nuit.scoreDetail;}],
   ['recup.facteurs',function(x){if(!x.recup)return false;delete x.recup.facteurs;delete x.recup.facteursCols;}]
  ]);
  if(o.tronque&&o.q==='good')o.q='partial';
  return o;
 });
}
window.flCoachJour=function(off,opts){
 try{return flcJour(off,opts);}
 catch(e){return {q:'erreur', raison:flcTxt('getDay : '+((e&&e.message)||e),80)};}
};

/* ═══ flCoachInstantane(opts) — CE QUI VOYAGE AVEC CHAQUE QUESTION ═══════════
   Quinze sections, chacune dans son try : une panne se nomme dans `manques`,
   elle n'arrête jamais le reste. Mémoire sur les compteurs d'écriture PAR
   FAMILLE (DB.tampon) — watch_ en est exclu exprès : il bouge à chaque trame du
   bracelet (v1599) ; la limite de 120 s couvre les pas et l'effort. */
var FLC_FAMILLES=['recov_','recovFige_','recovAj_','nuitFige_','nuitScoreFige_','sensor_',
  'sessions_','meals_','journal_','profile','bodylog',
  /* ajout : l'état de la nuit du matin (porte de publication) s'écrit ici */
  'nuitSess_'];
function flcCleMemo(opts){
 /* + les ECG (une famille par tracé, cf. flcTamponEcg) : un ECG neuf ne
    doit pas attendre la fin des 120 s pour être dit */
 return FLC_FAMILLES.map(function(f){return DB.tampon(f);}).join('.')+'.'+flcTamponEcg()+'|'+tk(0)+'|'+
        (opts.jourAffiche==null?'':opts.jourAffiche)+'|'+(opts.plafond||8192)+(opts.leger?'|L':'');
}
/* Deux mémoires du JOUR (tk(0)) pour les parties lentes et stables : les
   tendances du mois et les sports pratiqués (flProfilRecords balaie l'année).
   La récup et le score de nuit publiés le matin les invalident aussi : une
   tendance calculée à 6 h sans la nuit ne doit pas servir toute la journée. */
function flcJourMemo(nom,cle,fn){
 var m=window._flCiJour; if(!m||m.K!==tk(0))m=window._flCiJour={K:tk(0)};
 var copie=function(v){return (v&&typeof v==='object')?JSON.parse(JSON.stringify(v)):v;};
 if(m[nom]&&m[nom].cle===cle)return copie(m[nom].v);
 var v=fn(); m[nom]={cle:cle,v:v}; return copie(v);
}
/* La même règle que la mémoire de l'instantané (120 s au plus), pour une
   SECTION dont les familles n'ont pas bougé : un journal saisi ne relance pas
   les 28 jours de charge ni l'effort du jour. */
function flcFraisMemo(nom,cle,fn){
 var M=window._flCiFrais||(window._flCiFrais={}), now=Date.now(), m=M[nom];
 cle=tk(0)+'|'+cle;
 if(m&&m.cle===cle&&(now-m.t)<=120000&&(now-m.t)>=0)return JSON.parse(JSON.stringify(m.v));
 var v=fn(); M[nom]={cle:cle,t:now,v:v};
 return (v&&typeof v==='object')?JSON.parse(JSON.stringify(v)):v;
}
function flcInstantane(opts){
 opts=opts||{};
 var PLAFOND=opts.plafond||8192;
 /* 25 sept. 2026 (revue) — `leger` : meta et profil SEULS. Serveur en v1
    (porte v2 fermée), il ne lit de l'instantané que prénom, âge, sexe,
    poids, objectif, prudence, régime et allergies (profilPourV1) : chaque
    question n'attend plus 2 à 16 s de moteur pour eux. */
 var L=!!opts.leger;
 var K0=tk(0), manques=[], o={v:1};
 var rd=null, sd=null, porte=true, enT=false;
 /* opts.mesurer : le coût de CHAQUE section (lectures de la base, ms) dans
    o.mesures — la même unité au banc et sur le téléphone (window._flLect). */
 var mesures=opts.mesurer?[]:null;
 var flcSur=function(nom,fn,m){
  if(!mesures)return flcSurBase(nom,fn,m);
  var l0=window._flLect||0, t0=flcMs(), v=flcSurBase(nom,fn,m);
  mesures.push([nom,(window._flLect||0)-l0,Math.round(flcMs()-t0)]); return v;
 };

 o.meta=flcSur('meta',function(){
  var d=new Date(), m={jour:K0, heure:flcHHMM(d.getHours()*60+d.getMinutes()), jourSemaine:flcNomJour(d)};
  var jl=flJourLogique();
  if(jl)m.jl={cles:jl.cles||null, depuis:jl.debut?flcHHMM(new Date(jl.debut).getHours()*60+new Date(jl.debut).getMinutes()):null, origine:jl.origine||null};
  var ne=flNuitEtat(K0); m.nuit=ne&&ne.etat||null;
  try{porte=(flNuitPublicationOuverte(K0)!==false);}catch(e){}
  try{enT=!!flJourneeEnTraitement(K0);}catch(e){}
  m.nuitPubliee=porte; m.enTraitement=enT;
  return m;
 },manques);

 if(!L)o.recup=flcSur('recup',function(){
  rd=flRecupData(0)||{};
  /* chaque champ sur le jour que la page AFFICHE (flcJourRecup) : flRecovLu(0)
     ne décrit que le chiffre du jour, pas le 84 d'hier montré à 6 h */
  var r=flcRecupBase(rd), Kr=flcJourRecup(rd,K0,porte);
  if(Kr===K0){var lu=flRecovLu(0);
   r.etat=lu&&lu.etat||null; r.fige=lu?!!lu.fige:null; r.zone=lu&&lu.zone||null;}
  else if(Kr){var fg=DB.get('recovFige_'+Kr,null), rg=DB.get('recov_'+Kr,null);
   r.etat=fg?'finale':((rg!=null&&!isNaN(+rg))?'provisoire':null); r.fige=!!fg; r.zone=null;}
  else{r.etat=null; r.fige=null; r.zone=null;}
  r.vfcSource=Kr?((sensorOf(Kr)||{}).hrvSrc||null):null;
  flcRecupScelle(r,Kr);
  if(r.score==null&&porte){var dg=flNuitDiagnostic(K0)||{}; r.raison=dg.recupRaison?flcTxt(dg.recupRaison,160):null;}
  return r;
 },manques);

 if(!L)o.nuit=flcSur('nuit',function(){
  sd=flSommeilData(0)||{};
  /* LA PORTE DU MATIN : tant que la nuit n'est pas publiée, les écrans ne
     montrent AUCUN chiffre de ce matin — le Coach non plus. */
  if(!porte&&!sd.estVeille)return {nuitEtat:sd.nuitEtat||(o.meta&&o.meta.nuit)||null, attente:true};
  if(!sd.aDesDonnees)return {nuitEtat:sd.nuitEtat||null, aDesDonnees:false};
  var n=flcNuitBase(sd);
  n.reparateur=flcR(mdGet('sleepresto',0),0);
  /* le besoin de la nuit DÉJÀ dormie (elle répare l'effort d'hier) */
  n.besoinDetail=flcBesoin(flBesoinNuitDuJour(K0));
  var sf=flcScoreScelle(n,K0);
  n.scoreDetail=flcScoreDetail(K0,0,sf!=null?sf:sd.score);
  var ns=flcSiestes([tk(-1),K0]); if(ns.length)n.siestes=ns;
  return n;
 },manques);
 var gate=!!(o.nuit&&o.nuit.attente);

 if(!L)o.signaux=flcSur('signaux',function(){
  var s={};
  if(!gate){
   var t=flTempNuit(0); s.temp=t?{valeur:flcR(t.valeur,1),reference:flcR(t.reference,1),ecart:flcR(t.ecart,1)}:null;
   /* le p10 que l'app juge ; la médiane (~100 presque toutes les nuits) ne part pas */
   s.spo2Bas=flcR(flSpo2BasNuitDe(K0),0);
   s.resp=flcR((sensorOf(K0)||{}).resp,1);
   s.stressNuit=flcStressNuit(flStressNuit(0));
  } else s.attente=true;
  var sj=flStressJour(0)||{};
  s.stressJour={moyenne:(sj.moyenne==null?null:sj.moyenne), moyenneVeille:(sj.moyenneVeille==null?null:sj.moyenneVeille),
                raison:sj.raison?flcTxt(sj.raison,120):null};
  return s;
 },manques);

 /* La nutrition passe AVANT l'effort : flNutGoals peut réécrire le profil
    (kcalGoal suit la référence), et la mémoire de l'effort lit son compteur. */
 if(!L)o.nutrition=flcSur('nutrition',function(){
  var n=flNutritionData(0)||{};
  var r={consommees:n.consommees==null?null:String(n.consommees), budget:n.budget==null?null:String(n.budget),
         restantes:n.restantes==null?null:String(n.restantes), pourcent:(n.pourcent==null?null:n.pourcent),
         manqueProfil:!!n.manqueProfil,
         macros:(n.macros||[]).map(function(m){return (m.nom||'').charAt(0)+' '+(m.actuel==null?'?':m.actuel)+'/'+(m.cible==null?'?':m.cible)+' g';})};
  if(n.repas&&n.repas.length){
   r.repasCols=['heure','nom','kcal','P','G','L','note10'];
   r.repas=n.repas.slice(0,8).map(function(m){return [m.heure||null, flcTxt(m.nom,40), flcR(m.kcal,0),
     flcR(m.prot,0), flcR(m.carb,0), flcR(m.fat,0), (m.note==null||m.note===''?null:flcR(String(m.note).replace(',','.'),1))];});
  }
  /* la tuile de l'Accueil : la journée LOGIQUE, et SES portes (index.html,
     flAccueilData) — en traitement, ni chiffre ni mot (flCaloriesJour(0) y
     rendait hier entier + ce matin : le « 3 364 kcal » du 16 sept.) ; sans
     aucune mesure de dépense, pas de mot */
  var kc=enT?null:flCaloriesJour(0); r.brulees=flcR(kc,0);
  var cvide=false; if(!enT){try{var cd=flCaloriesDetail(K0);cvide=!!(cd&&cd.vide);}catch(x){}}
  r.bruleesMot=(kc==null||cvide)?null:(flCaloriesMot(kc,0)||null);
  var g=flNutGoals(); r.plan=g?{kcal:flcR(g.kcal,0),prot:flcR(g.prot,0),carb:flcR(g.carb,0),fat:flcR(g.fat,0)}:null;
  var ref=flDepenseReference(); r.reference={kcal:flcR(ref,0), src:(window._flRefCache&&window._flRefCache.src)||null};
  r.metaBase=flcR(flMetaBase(),0);
  /* la balance d'hier = mangé − brûlé (jamais FL_HEBDO.kcalBal : il rend le brûlé) */
  var ki=FL_HEBDO.kcalIn.get(-1), ko=FL_HEBDO.kcalOut.get(-1);
  if(ki!=null&&ko!=null){var b=Math.round(ki-ko); r.balanceHier={v:b,verdict:(b<-150?'déficit':(b>150?'surplus':'équilibre'))};}
  else r.balanceHier=null;
  return r;
 },manques);

 if(!L)o.effort=flcSur('effort',function(){
  return flcFraisMemo('effort',[DB.tampon('sessions_'),DB.tampon('recov_'),DB.tampon('recovFige_'),DB.tampon('profile'),enT?1:0].join('.'),function(){
  /* jamais flEffortData() : il ignore son argument et suit le jour regardé */
  var e={jour:enT?null:flcR(flEffortJour(0),1)};
  if(enT)e.enTraitement=true;
  var c=strainTarget(); e.cible=Array.isArray(c)?c.map(function(v){return flcR(v,1);}):null;
  e.hier=flcR(flEffortJour(-1),1);
  /* en traitement, la journée n'a pas encore de frontière : ses minutes par
     zone portent DEUX jours (les écrans ne les montrent pas non plus) */
  var z=enT?null:flZonesJourLogique(0);
  if(z)e.zones={min:(z.min||[]).map(function(v){return flcR(v,0);}), fcMax:flcR(z.fcMax,0), fcMaxSource:z.fcMaxSource||null};
  var zr=null;try{zr=flZonesReglage();}catch(x){}
  e.bornes={bpm:flZonesBpm(K0)||null, source:zr&&zr.source||null};
  var cb=chargeBalance(0);
  if(cb)e.charge={lab:cb.lab||null, txt:cb.txt?flcTxt(cb.txt,140):null, ratio:flcR(cb.ratio,2), aigu:flcR(cb.acute,1), chronique:flcR(cb.chronic,1)};
  else{var eq=flEquilibreCharge(0)||{}; e.charge={manque:eq.manque?flcTxt(eq.manque,140):'pas encore de verdict'};}
  e.vo2=flcR(flVo2Max(0),0); e.pas=flcR(flStepsOf(K0),0); e.objectifPas=flcR(stpGoal(),0);
  return e;
  });
 },manques);

 var detailSeances=[];
 if(!L)o.seances=flcSur('seances',function(){
  var lignes=[], cand=[], now=Date.now(), vues={};
  [0,-1,-2].forEach(function(d){
   flcSeancesDe(d).forEach(function(e){
    /* de minuit à la finalisation, la journée logique d'aujourd'hui porte
       aussi la clé d'HIER : la même séance revenait à d=0 ET à d=−1, et sa
       fiche deux fois (revue du 25 sept.). La première vue — d=0, le jour
       que les écrans montrent — fait foi. */
    var cle=flcCleSeance(e); if(vues[cle])return; vues[cle]=1;
    lignes.push(flcLigneSeance(e,d));
    /* la fiche des deux séances les plus récentes des 48 h — déclarées, ou
       notées 3 et plus — est jointe : « analyse mon foot d'hier » = 1 requête */
    var p=String(e.jour||'').split('-'), hm=String(e.debut||'00:00').split(':');
    var t=new Date(+p[0],(+p[1])-1,+p[2],+hm[0]||0,+hm[1]||0).getTime();
    var note=parseFloat(String(e.valeur==null?'':e.valeur).replace(',','.'));
    if(now-t<=48*3600000&&(e.genre==='manuelle'||(isFinite(note)&&note>=3)))cand.push({e:e,d:d,t:t});
   });
  });
  /* le validateur du serveur refuse un tableau de plus de 40 : on garde les 30 plus récentes */
  var r={cols:FLC_SEANCES_COLS, lignes:lignes.length>30?lignes.slice(-30):lignes};
  cand.sort(function(a,b){return b.t-a.t;});
  cand.slice(0,2).forEach(function(c){
   var f=flcSur('seances.detail',function(){return flcFicheMemo(c.e,c.d);},manques);
   if(f)detailSeances.push(f);
  });
  if(detailSeances.length)r.detail=detailSeances;
  var ac=flcJourMemo('aClasser',String(DB.tampon('sessions_')),function(){
   return (flActivitesAClasser()||[]).slice(0,3).map(function(a){return [a.jour||null,a.debut||null,
    (a.dureeS==null?null:Math.round(a.dureeS/60)),(a.avgHr==null?null:flcR(a.avgHr,0))];});});
  if(ac&&ac.length){r.aClasserCols=['jour','debut','min','fcMoy'];r.aClasser=ac;}
  return r;
 },manques);

 /* LES SEPT JOURS, du plus ancien à aujourd'hui, pris dans les payloads des
    ÉCRANS : la parité tient par construction. Jamais flRecovLu(d) en boucle :
    il écrit un repli dans le registre. */
 var jrnSansNote=[];
 if(!L)o.semaine=flcSur('semaine',function(){
  var heb=(rd&&rd.hebdo)||[], er=(rd&&rd.effortRecup)||[];
  var sem=(sd&&sd.semaine)||[], rn=(sd&&sd.regularite&&sd.regularite.nuits)||[];
  var serie=function(cle){for(var i=0;i<heb.length;i++)if(heb[i].cle===cle)return heb[i].jours||[];return [];};
  var hR=serie('recovery'),hV=serie('hrv'),hF=serie('rhr'),hP=serie('resp');
  /* le stress d'un jour PASSÉ ne bouge plus, et chaque jour coûte ~30 ms de
     calcul (1 440 points) : gardé pour la journée ; aujourd'hui reste vivant */
  var stressPasse=flcJourMemo('stress7','',function(){
   return [-6,-5,-4,-3,-2,-1].map(function(d){return flcR(flStressMoy(d),2);});});
  var lignes=[];
  for(var d=-6;d<=0;d++){
   var K=tk(d), num=+K.split('-')[2];
   var pv=function(a){var x=flcParNum(a,num,function(j){return flcNumJour(j.jour);});return x&&x.v!=null?x.v:null;};
   var e=flcParNum(er,num,function(j){return flcNumJour(j.num);});
   var s=flcParNum(sem,num,function(j){return flcNumJour(j.jour);});
   var n=flcParNum(rn,num,function(j){return (j.date==null?null:+j.date);});
   var sn=null;try{sn=sensorOf(K);}catch(x){}
   var jr=DB.get('journal_'+K,null);
   jrnSansNote.push(flcJournal(jr,false));
   var ki=null,ko=null;try{ki=FL_HEBDO.kcalIn.get(d);ko=FL_HEBDO.kcalOut.get(d);}catch(x){}
   lignes.push([flcJourCourt(K), pv(hR), pv(hV), pv(hF), pv(hP),
    e&&e.effort!=null?flcR(e.effort,1):null,
    s&&s.qualite!=null?s.qualite:null, s&&s.efficacite!=null?s.efficacite:null,
    s&&s.heures!=null?flcHM(s.heures*60):null, s&&s.besoinAjuste!=null?flcHM(s.besoinAjuste*60):null,
    s&&s.dette!=null?flcHM(s.dette*60):null,
    n?flcHHMM(n.couche):null, n?flcHHMM(n.reveil):null,
    flcR(flStepsOf(K),0), flcR(ki,0), flcR(ko,0),
    (d<0?stressPasse[d+6]:flcR(flStressMoy(d),2)), sn&&sn.hrvSrc||null, flcJournal(jr,true)]);
  }
  var r={cols:['jour','recup','vfc','fcRepos','resp','effort','qualite','efficacite','dormi','besoin','dette',
                'coucher','reveil','pas','kcalIn','kcalOut','stress','vfcSrc','journal'],
          lignes:lignes,
          /* pas le mot « null » dans une phrase : le banc refuse toute chaîne qui le porte */
          note:'journal du jour K → récup de K+1 ; dette = cumul de Ma nuit sur la fenêtre ; case vide = pas mesuré'};
  /* une source de VFC unique sur la semaine se dit une fois (sept fois « rmssd »
     n'apprennent rien) ; deux sources mêlées gardent leur colonne : on ne
     compare jamais une VFC puce à une RMSSD */
  /* le jour même, les cellules suivent les portes des écrans : rien de la nuit
     tant qu'elle n'est pas publiée, ni effort ni dépense tant que la journée est
     en traitement (sa frontière n'est pas posée) */
  var auj=lignes[lignes.length-1], ci=function(c){return r.cols.indexOf(c);};
  if(gate)['recup','vfc','fcRepos','resp','qualite','efficacite','dormi','besoin','dette','coucher','reveil','vfcSrc']
   .forEach(function(c){auj[ci(c)]=null;});
  if(enT)['effort','kcalOut'].forEach(function(c){auj[ci(c)]=null;});
  var cs=r.cols.indexOf('vfcSrc'), srcs=lignes.map(function(l){return l[cs];}).filter(function(x){return x!=null;});
  if(srcs.length&&srcs.every(function(x){return x===srcs[0];})){
   r.vfcSrc=srcs[0]; r.cols.splice(cs,1); lignes.forEach(function(l){l.splice(cs,1);});
  }
  return r;
 },manques);

 if(!L)o.tendances=flcSur('tendances',function(){
  var cle=[DB.tampon('recov_'),DB.tampon('nuitScoreFige_'),DB.tampon('bodylog')].join('.');
  /* Compact : une ligne par métrique. La phrase de comparaison de la page
     (« lecture ») redit les deux moyennes en 90 octets : elle reste dans getTrend. */
  return flcJourMemo('tendances',cle,function(){
   var t={periode:'30 derniers jours (mois glissant) vs les 30 précédents',
          cols:['moyenne','moyennePrec','tendance','plageHabituelle']};
   ['recovery','hrv','rhr','sleepscore','steps','weight'].forEach(function(k){
    var h=flcTendance(k,'M',0); if(!h)return;
    var u=h.unite?' '+h.unite:'';
    t[k]=[h.moyenne==null?null:h.moyenne+u, h.moyennePrec==null?null:h.moyennePrec+u, h.tendance,
          (h.plage&&h.plage[0]!=null&&h.plage[1]!=null)?(h.plage[0]+'–'+h.plage[1]+u):null];
   });
   return t;
  });
 },manques);

 if(!L)o.impacts=flcSur('impacts',function(){
  /* 90 jours de paires journal → récup du lendemain : ~450 lectures. Gardé pour
     la journée, invalidé par la récup (publication du matin) et par le journal
     d'HIER — le seul qui puisse former une nouvelle paire aujourd'hui. */
  var jv=DB.get('journal_'+tk(-1),null);
  var cle=[DB.tampon('recov_'),DB.tampon('recovAj_'),jv?JSON.stringify(jv).length+':'+Object.keys(jv).join(','):'-'].join('.');
  return flcJourMemo('impacts',cle,function(){
   var im=flImpactsData()||{};
   var b=(im.behaviors||[]).filter(function(x){return x&&x.isUnlocked;});
   if(!b.length)return 'pas assez de soirées';
   return {cols:['id','direction','impactPercent','avecRecup','sansRecup','oui','non'],
           lignes:b.map(function(x){return [x.behaviorId||null,x.direction||null,flcR(x.impactPercent,0),
             flcR(x.avgRecoveryWithBehavior,0),flcR(x.avgRecoveryWithoutBehavior,0),x.yesCount||0,x.noCount||0];})};
  });
 },manques);

 o.profil=flcSur('profil',function(){
  var p=getProfile()||{};
  var r={prenom:p.name?flcTxt(String(p.name).trim().split(/\s+/)[0],40):null};
  r.age=flcR(flAge(),0);
  /* un sexe non déclaré n'est JAMAIS « homme » (le ''||'h' qui coûtait 83 kcal/j) */
  r.sexe=(p.gender==='h'||p.gender==='f')?p.gender:'non déclaré';
  r.tailleCm=flcR(p.height,0);
  r.poids=flcSur('profil.poids',function(){var _w=flPoidsCorps();return (_w>0)?flPoidsAff(_w):null;},manques)||null;   /* 28 sept. 2026 — sans poids, rien : « 0.0 kg » partait au Coach, qui recopie les chiffres tels quels */
  /* 28 sept. 2026 — L'OBJECTIF APPLIQUÉ, PAS L'OBJECTIF COCHÉ (relecture
     adversariale, R2). Les garde-fous (`flPrudenceApport`) ne vivaient que
     dans le plan : le Coach recevait « Sèche, 1 kg/sem, cible 47 kg » pour une
     mineure que le plan tient au maintien, et « 1 kg/sem » quand le plancher
     n'en laisse que 0,28. Il reçoit ce que le plan fait, et pourquoi. */
  var _pl=null,_ng=null;try{_pl=(typeof flPlanSuivreReference==='function')?flPlanSuivreReference():null;_ng=(typeof flNutGoals==='function')?flNutGoals():null;}catch(e){_pl=null;}
  var _mot=flNGoalWord(), _ry=flcR(p.rate,2), _cib=(p.targetWeight?(flPoidsAff(+p.targetWeight)||null):null), _gar=null;
  if(_ng&&_ng.prudence){_gar=(typeof flPrudenceMot==='function')?flPrudenceMot(_ng.prudence,false):_ng.prudence;_mot='Maintien';_ry=null;_cib=null;}
  else if(_pl&&!_pl.choix&&_pl.ref>0&&_mot!=='Maintien'&&_pl.kcal>0)_ry=flcR(Math.abs(_pl.ref-_pl.kcal)*7/7700,2);
  r.objectif={code:p.goal||null, mot:_mot, garde:_gar, rythmeKgSem:_ry,
              cible:_cib, kcalSrc:p.kcalSrc||null};
  var bs=flBesoinSommeil(); r.besoinSommeil=bs?{h:flcHM(bs.min!=null?bs.min:bs.h*60), src:bs.src||null}:null;
  r.reveil=p.wake||null;
  /* la formule de la carte Profil, et on le dit : réveil − besoin de la nuit */
  if(!L)try{var bn=flBesoinNuitDuJour(K0), w=String(p.wake||'').split(':');
   if(bn&&bn.min!=null&&w.length===2){r.coucherConseille=flcHHMM((+w[0])*60+(+w[1])-bn.min);
    r.coucherConseilleSrc='carte Profil : réveil − besoin de la nuit';}}catch(e){}
  r.ton=flTonCoach();
  var onb=flOnb()||{};
  r.onb=flcPrendre(onb,['niveau','sports','seancesSemaine','dureeSeance','objectifs','regime','allergies',
    'cafe','alcool','soucisSommeil','qualiteSommeil','stress','energie']);
  Object.keys(r.onb).forEach(function(k){var v=r.onb[k];
   if(Array.isArray(v))r.onb[k]=v.slice(0,10).map(function(x){return flcTxt(x,40);});
   else if(typeof v==='string')r.onb[k]=flcTxt(v,60);
   else if(v!=null&&typeof v==='object')delete r.onb[k];});
  var pr=flPrudenceSante(); r.prudence=pr&&pr.txt?flcTxt(pr.txt,220):null;
  /* l'année de records à froid : pas en léger (le v1 ne la lit pas) */
  if(!L)r.sportsPratiques=flcJourMemo('sports','',function(){return flcSports(5);});
  flcSansNuls(r.objectif); flcSansNuls(r.onb);
  return flcSansNuls(r,['prenom','sexe']);
 },manques);

 if(!L)o.corps=flcSur('corps',function(){
  var m=flMesuresData()||{};
  var r=flcPrendre(m,['masseGrasse','masseMaigre','dateMesure','metaBaseSource','fcMax','fcMaxSource','vo2Mesure']);
  var bl=DB.get('bodylog',{})||{};
  var ks=flJoursTries(bl).filter(function(k){return bl[k]&&bl[k].weight!=null;});
  r.pesees=ks.slice(-5).map(function(k){return [k,flcR(bl[k].weight,1)];});
  return flcSansNuls(r);
 },manques);

 if(!L)o.indices=flcSur('indices',function(){
  /* l'Âge FLINT lit les nuits −1 à −30 (jamais celle du jour) et sa trajectoire
     coûte 1,5 s de calcul : gardé pour la journée ; la série et la moyenne de
     récup suivent le registre ; un ECG neuf invalide aussi (flcTamponEcg) */
  return flcJourMemo('indices',DB.tampon('recov_')+'.'+flcTamponEcg(),function(){
  var r={};
  var af=flAgeFlint();
  if(af)r.ageFlint={valeurN:flcR(af.valeurN,1), reelN:flcR(af.reelN,1), ecartN:flcR(af.ecartN,1), nuits:af.nuits||null,
                    termes:af.termes?flcPrendre(af.termes,['vfc','fc','sommeil']):null};
  try{var ap=flAgePage(); r.trajectoire28j=ap&&ap.traj&&ap.traj.delta!=null?flcR(ap.traj.delta,1):null;}catch(e){}
  /* flRecupMoyenne rend {valeur:'61', jours, serie} : un NOMBRE part (le
     serveur écrit l'unité et « pas affiché dans l'app ») — lu en .moyenne, il
     partait toujours vide (revue du 25 sept.) */
  var rm=flRecupMoyenne();
  r.recupMoy30=(rm&&rm.valeur!=null&&rm.valeur!=='')?flcR(+rm.valeur,0):null;
  r.serie=recovStreak();
  var ec=(flEcgListe()||[])[0];
  if(ec&&ec.analyse&&ec.t&&(Date.now()-ec.t)<=30*86400000){
   var dt=new Date(ec.t);
   r.ecg=flcPrendre(ec.analyse,['ok','fc','rmssd','qualite']);
   r.ecg.date=dt.getFullYear()+'-'+(dt.getMonth()+1)+'-'+dt.getDate();
  }
  return flcSansNuls(r);
  });
 },manques);

 if(!L)o.qualiteJour=flcSur('qualiteJour',function(){
  var q=flQualiteJour(0); return q?flcPrendre(q,['couverture','confiance','verdict']):null;
 },manques);

 /* Le jour que montre la pastille, s'il n'est pas aujourd'hui : la question
    « et ce jour-là ? » n'a alors besoin d'aucun outil. Son propre plafond. */
 var jA=(opts.jourAffiche==null||opts.jourAffiche==='')?0:(parseInt(opts.jourAffiche,10)||0);
 var jourAffiche=null;
 if(jA<0&&!L)jourAffiche=flcSur('jourAffiche',function(){return flcJour(jA,{plafond:5120});},manques)||null;

 /* 25 sept. 2026 (revue) — LE CŒUR EN PANNE N'EST PAS UN INSTANTANÉ. Sans
    meta, récup ni nuit (moteur à moitié chargé, WebKit relancé), un objet
    `{v, manques}` passait pour valide des deux côtés : ni le briefing du
    natif, ni le préchargement getDay(0) du serveur ne partaient. `null`
    déclenche les deux replis. */
 if(o.meta===undefined&&o.recup===undefined&&o.nuit===undefined)return null;
 if(manques.length)o.manques=manques;
 flcPurger(o);
 /* LE PLAFOND : on retire d'abord ce qu'un outil redonne à la demande. */
 flcBorner(o,PLAFOND,[
  ['tendances',function(x){if(!x.tendances)return false;delete x.tendances;}],
  ['impacts',function(x){if(!x.impacts)return false;delete x.impacts;}],
  ['corps',function(x){if(!x.corps)return false;delete x.corps;}],
  ['indices',function(x){if(!x.indices)return false;delete x.indices;}],
  ['semaine.journal.notes',function(x){if(!x.semaine||!x.semaine.lignes)return false;
   var c=x.semaine.cols.indexOf('journal');x.semaine.lignes.forEach(function(l,i){l[c]=jrnSansNote[i]==null?null:jrnSansNote[i];});}],
  ['seances.detail>1',function(x){if(!x.seances||!x.seances.detail||x.seances.detail.length<2)return false;x.seances.detail=x.seances.detail.slice(0,1);}],
  ['nutrition.repas',function(x){if(!x.nutrition||!x.nutrition.repas)return false;delete x.nutrition.repas;delete x.nutrition.repasCols;}],
  ['semaine>4',function(x){if(!x.semaine||!x.semaine.lignes||x.semaine.lignes.length<=4)return false;x.semaine.lignes=x.semaine.lignes.slice(-4);}],
  /* au-delà du dernier recours prévu : jamais plus lourd que le plafond */
  ['seances.detail',function(x){if(!x.seances||!x.seances.detail)return false;delete x.seances.detail;}],
  ['semaine',function(x){if(!x.semaine)return false;delete x.semaine;}],
  ['profil.onb',function(x){if(!x.profil||!x.profil.onb)return false;delete x.profil.onb;}],
  ['nutrition',function(x){if(!x.nutrition)return false;delete x.nutrition;}],
  ['seances',function(x){if(!x.seances)return false;delete x.seances;}]
 ]);
 /* l'ordre de lecture, quel que soit l'ordre de calcul */
 var ORDRE=['v','meta','recup','nuit','signaux','effort','seances','nutrition','semaine','tendances','impacts',
            'profil','corps','indices','qualiteJour','manques','tronque'], o2={};
 ORDRE.forEach(function(k){if(o[k]!==undefined)o2[k]=o[k];});
 Object.keys(o).forEach(function(k){if(o2[k]===undefined&&o[k]!==undefined)o2[k]=o[k];});
 o=o2;
 if(jourAffiche)o.jourAffiche=jourAffiche;
 if(mesures)o.mesures=mesures;
 o.octets=0; var n=flcOctets(o); o.octets=n; var n2=flcOctets(o); if(n2!==n)o.octets=n2;
 return o;
}
/* Les sports que tu pratiques vraiment, sur l'année (flProfilRecords suit
   flDayOff : forcé à 0 par l'appelant). */
function flcSports(n){
 var pr=flProfilRecords(1)||{};
 return (pr.sports||[]).slice(0,n).map(function(s){return [flcTxt(s.nom,40),(s.nombre==null?null:s.nombre),(s.effort==null?null:String(s.effort))];});
}
/* Une page de détail (DetailHebdo) dans les mots de l'écran. `leger` à FAUX :
   en léger la page ne calcule ni la période précédente, ni la plage habituelle,
   ni la phrase de comparaison — mesuré le 25 sept., les trois reviennent null.
   Le coût du complet : +30 lectures par métrique au mois. */
function flcTendance(cle,periode,recul){
 var h=flHebdoDetail(cle,periode,recul,false);
 if(!h||!h.aDesDonnees)return null;
 var cfg=(typeof FL_HEBDO!=='undefined'&&FL_HEBDO[cle])||{};
 var fmt=function(v){if(v==null||!isFinite(+v))return null;try{return cfg.fmt?String(cfg.fmt(+v)):String(Math.round(+v));}catch(e){return String(flcR(v,1));}};
 return {titre:h.titre||null, periode:h.periode||null, unite:h.unite||'',
         moyenne:(h.moyenneTxt==null?null:String(h.moyenneTxt)), moyennePrec:fmt(h.moyennePrec),
         plage:(h.plageMin==null||h.plageMax==null)?null:[fmt(h.plageMin),fmt(h.plageMax)],
         tendance:(h.tendance==null?null:h.tendance), lecture:h.lecture?flcTxt(h.lecture,200):null,
         serie:(h.points||[]).map(function(p){return p&&p.v!=null?flcR(p.v,2):null;})};
}
window.flCoachInstantane=function(opts){
 opts=opts||{};
 try{
  var cle=flcCleMemo(opts), m=window._flCiMemo, now=Date.now();
  if(m&&m.cle===cle&&(now-m.t)<=120000&&(now-m.t)>=0)return m.o;
  var o=flcAvecJour0(function(){return flcInstantane(opts);});
  /* la clé se relit APRÈS la construction : les accesseurs écrivent eux-mêmes
     (flNutGoals le profil, flRecovLu la publication du matin), et une clé prise
     avant ferait rater la mémoire à l'appel suivant, à chaque fois */
  if(o)window._flCiMemo={cle:flcCleMemo(opts),t:now,o:o};
  return o;
 }catch(e){
  /* une panne rend `null`, jamais `{v, manques}` : un entier `v` suffisait au
     serveur pour croire l'instantané valide (revue du 25 sept.) */
  try{console.warn('[flint] flCoachInstantane : '+((e&&e.message)||e));}catch(x){}
  return null;
 }
};

/* ═══ flCoachOutils(appels) — LES OUTILS JS D'UN TOUR, EN UN SEUL LOT ════════
   [{nom, args}] (ou sa chaîne JSON) → un tableau dans le MÊME ordre. Chaque
   outil dans son try : {q:'erreur', raison} ; un nom inconnu : {q:'inconnu'}.
   Tout résultat porte q:'good'|'partial'|'missing'. */
var FLC_COLONNES=['recup','scoreSommeil','dormi','besoin','dette7n','coucher','lever','efficacite','vfc','vfcSrc',
  'fcRepos','resp','temp','spo2Bas','effort','zones13','zones45','muscu','pas','kcalBrulees','kcalMangees',
  'balance','poids','stress','journal'];
function flcGetHistory(a){
 var cols=a.colonnes;
 if(typeof cols==='string')cols=cols.split(',');
 if(!Array.isArray(cols)||!cols.length)cols=['recup','scoreSommeil','dormi','vfc','fcRepos','effort'];
 cols=cols.map(function(c){return String(c).trim();});
 var ignorees=cols.filter(function(c){return FLC_COLONNES.indexOf(c)<0;});
 cols=cols.filter(function(c,i){return FLC_COLONNES.indexOf(c)>=0&&cols.indexOf(c)===i;});
 var N=parseInt(a.jours,10); if(!isFinite(N))N=30; N=Math.max(8,Math.min(90,N));
 var veut=function(c){return cols.indexOf(c)>=0;};
 /* la série de Ma nuit, SIX nuits de plus : la « dette » de l'écran est un
    cumul sur SEPT nuits (flSommeilData(off).detteH = flSerieSommeil(7,off)),
    qu'on reprend jour par jour avec la même récurrence et les mêmes entrées */
 var serie=null;
 if(veut('scoreSommeil')||veut('dormi')||veut('efficacite')||veut('besoin')||veut('dette7n'))serie=flSerieSommeil(N+7,-1);
 var lignes=[];
 for(var d=-N;d<=-1;d++){
  var K=tk(d), l=[K], i=serie?(serie.length-1)+(d+1):-1, s=serie?serie[i]:null;
  var sn=null; if(veut('vfc')||veut('vfcSrc')||veut('fcRepos')||veut('resp')){try{sn=sensorOf(K);}catch(e){}}
  var nt=null; if(veut('coucher')||veut('lever')){try{nt=sleepNight(K);}catch(e){}}
  var em=null; if(veut('zones13')||veut('zones45')||veut('muscu')){try{em=effMetricsOf(K);}catch(e){}}
  var ki,ko; if(veut('kcalBrulees')||veut('kcalMangees')||veut('balance')){try{ki=FL_HEBDO.kcalIn.get(d);ko=FL_HEBDO.kcalOut.get(d);}catch(e){}}
  cols.forEach(function(c){var v=null;try{switch(c){
   case 'recup': var r=DB.get('recov_'+K,null); v=(r==null||isNaN(+r))?null:flcR(r,0); break;   /* JAMAIS flRecovLu(d) : il écrit */
   case 'scoreSommeil': v=s&&s.qualite!=null?s.qualite:null; break;
   case 'dormi': v=s&&s.heures!=null?flcHM(s.heures*60):null; break;
   case 'efficacite': v=s&&s.efficacite!=null?s.efficacite:null; break;
   case 'besoin': v=s&&s.besoinAjuste!=null?flcHM(s.besoinAjuste*60):null; break;
   case 'dette7n':
    if(serie&&i>=6){var dt=0,eu=false;for(var q=i-6;q<=i;q++){var x=serie[q];if(x&&x.heures!=null){dt=Math.max(0,dt+(x.besoin-x.heures));eu=true;}}
     v=eu?flcHM(Math.round(dt*100)/100*60):null;}
    break;
   case 'coucher': if(nt&&nt._real&&nt._real.bedtime!==false&&nt.bedMin!=null)
     v=flcHHMM(nt.bedMin)+((nt.wakeMin!=null&&nt.bedMin>nt.wakeMin)?' (veille)':''); break;
   case 'lever': if(nt&&nt._real&&nt._real.wake!==false&&nt.wakeMin!=null)v=flcHHMM(nt.wakeMin); break;
   case 'vfc': v=sn?flcR(sn.hrv,0):null; break;
   case 'vfcSrc': v=sn&&sn.hrvSrc||null; break;
   case 'fcRepos': v=sn?flcR(sn.rhr,0):null; break;
   case 'resp': v=sn?flcR(sn.resp,1):null; break;
   case 'temp': var t=flTempNuit(d); v=t?flcR(t.ecart,1):null; break;
   case 'spo2Bas': v=flcR(flSpo2BasNuitDe(K),0); break;
   /* l'effort coûte ~4 s à froid sur 30 jours : borné à 60 jours */
   case 'effort': v=(d>=-60)?flcR(flEffortJour(d),1):null; break;
   case 'zones13': v=em?flcR(em.zones13,0):null; break;
   case 'zones45': v=em?flcR(em.zones45,0):null; break;
   case 'muscu': v=em?flcR(em.strength,0):null; break;
   case 'pas': v=flcR(flStepsOf(K),0); break;
   case 'kcalBrulees': v=flcR(ko,0); break;
   case 'kcalMangees': v=flcR(ki,0); break;
   case 'balance': v=(ki==null||ko==null)?null:Math.round(ki-ko); break;
   case 'poids': v=flcR(mdGet('weight',d),1); break;
   case 'stress': v=flcR(flStressMoy(d),2); break;
   case 'journal': var j=flcJournal(DB.get('journal_'+K,null),true), pen=DB.get('recovAj_'+tk(d+1),null);
    v=j?(j+((pen!=null&&+pen!==0)?' → récup J+1 '+flcR(pen,0)+' pts':'')):null; break;
  }}catch(e){v=null;}
  l.push(v===undefined?null:v);});
  lignes.push(l);
 }
 var o={q:'good', cols:['jour'].concat(cols), lignes:lignes,
        note:'journal du jour K → récup de K+1 ; null = pas mesuré ; aujourd\'hui est dans l\'instantané'};
 if(veut('effort')&&N>60)o.noteEffort='effort limité aux 60 derniers jours';
 if(veut('dette7n'))o.noteDette='dette7n = « Dette accumulée » de Ma nuit, cumul sur 7 nuits, h:mm';
 if(ignorees.length)o.ignorees=ignorees.slice(0,10);
 if(!cols.length)o.q='missing';
 else{var plein=lignes.some(function(l){for(var c=1;c<l.length;c++)if(l[c]!=null)return true;return false;});
  if(!plein)o.q='missing';}
 flcPurger(o);
 while(flcOctets(o)>12288&&o.lignes.length>1){o.lignes.shift();o.tronque=true;if(o.q==='good')o.q='partial';}   /* 28 sept. 2026 — la qualité se pose DANS la boucle : posée après, « partial » ajoutait 3 octets à un lot déjà mesuré, et le plafond de 12 Ko ne tenait qu'à un octet près */
 if(o.tronque&&o.q==='good')o.q='partial';
 return o;
}
var FLC_TREND_CLES=['recovery','hrv','rhr','resp','sleep','sleepscore','sleeppct','sleepreg','sleepdebt','sleepeff',
  'sleepresto','timeinbed','steps','zones13','zones45','strength','kcalOut','kcalIn','fcavg','vo2','weight','leanmass'];
function flcGetTrend(a){
 var cle=String(a.cle||''), per=String(a.periode||'M').toUpperCase(), rec=parseInt(a.recul,10);
 if(per!=='S'&&per!=='M'&&per!=='A')per='M';
 if(!isFinite(rec))rec=0; rec=Math.max(0,Math.min(12,rec));
 /* « charge » (points loadOf, pas /20) et « kcalBal » (il rend le brûlé) : exclus exprès */
 if(FLC_TREND_CLES.indexOf(cle)<0)return {q:'missing', cle:cle, raison:'métrique non disponible'};
 var h=null;
 try{h=flcAvecJour0(function(){return flcTendance(cle,per,rec);});}catch(e){h=null;}
 if(!h)return {q:'missing', cle:cle, raison:'métrique non disponible'};
 var o={q:(h.moyenne==null?'missing':'good'), raison:(h.moyenne==null?'pas de mesure sur la période':undefined), cle:cle, titre:h.titre, periode:h.periode, unite:h.unite,
        moyenne:h.moyenne, moyennePrec:h.moyennePrec, plage:h.plage, tendance:h.tendance, lecture:h.lecture,
        /* les valeurs du graphe, du plus ancien au plus récent. PAS « points » :
           ce nom est sur la liste des clés que le serveur efface (les 1 440
           points du stress), il arriverait vide. */
        serie:h.serie};
 flcPurger(o);
 while(flcOctets(o)>4096&&o.serie&&o.serie.length>7){o.serie=o.serie.slice(-Math.floor(o.serie.length*0.75));o.tronque=true;}
 return o;
}
var FLC_SESSIONS_COLS=['jour','debut','nom','min','note20','etat','sansNote','pose','origine','fcMoy','fcMax','pas','kcal','id','rang'];
/* Les deux listes que le serveur déclare au modèle (enum de getTrend.cle et de
   getHistory.colonnes), exposées pour que les bancs et le natif les épinglent :
   une clé ajoutée d'un côté seulement se voit au banc, pas chez l'utilisateur. */
window.flCoachOutilsCles={getTrend:FLC_TREND_CLES.slice(), getHistory:FLC_COLONNES.slice()};
function flcGetSessions(a){
 var N=parseInt(a.jours,10); if(!isFinite(N))N=7; N=Math.max(1,Math.min(31,N));
 var sport=(a.sport==null||a.sport==='')?null:_cnorm(String(a.sport)).trim();
 var toutes=[], vues={};
 for(var d=0;d>-N;d--){
  flcSeancesDe(d).forEach(function(e){
   /* la même séance sous deux décalages (journée logique à cheval) : une fois */
   var cle=flcCleSeance(e); if(vues[cle])return; vues[cle]=1;
   var s=flcBrute(e);
   toutes.push({d:d, e:e, l:[e.jour||tk(d), e.debut||null, flcTxt(e.nom,40), (e.dur==null?null:e.dur),
     (e.valeur==null?null:e.valeur), (e.etat&&e.etat!=='ready')?e.etat:null, e.sansNote||null,
     e.genre==='manuelle'?'toi':'bracelet', e.srcs||null, (e.avgHr==null?null:e.avgHr),
     (s&&s.maxHr!=null?flcR(s.maxHr,0):null), (e.pas==null?null:e.pas), flcKcal(e,s), e.id||null, (e.rang==null?null:e.rang)]});
  });
 }
 var note=function(x){var v=parseFloat(String(x.e.valeur==null?'':x.e.valeur).replace(',','.'));return isFinite(v)?v:-1;};
 var choix=toutes, corr=null;
 if(sport){
  choix=toutes.filter(function(x){var n=_cnorm(x.e.nom||'');var c=null;try{c=flCatDuSport(x.e.nom);}catch(e){}
   return (n&&(n.indexOf(sport)>=0||sport.indexOf(n)>=0))||(c&&_cnorm(c)===sport);});
  if(!choix.length){choix=toutes.slice().sort(function(p,q){return note(q)-note(p);}).slice(0,2);corr='aucune';}
 }
 /* du plus ancien au plus récent, comme les autres tables */
 choix.sort(function(p,q){return (p.d-q.d)||((p.e.tri||0)-(q.e.tri||0));});
 var o={q:'good', cols:FLC_SESSIONS_COLS, lignes:choix.map(function(x){return x.l;})};
 if(corr)o.correspondance=corr;
 if(a.detail===true||a.detail==='true'){
  var f=[];
  choix.slice().reverse().slice(0,2).forEach(function(x){
   try{var fi=flcSession(x.e,x.d);if(fi)f.push(fi);}catch(e){}
  });
  if(f.length)o.fiches=f;
 }
 try{o.sportsPratiques=flcAvecJour0(function(){return flcSports(8);});}catch(e){}
 try{
  /* 28 sept. — GARDE EXPLICITE, exigee par livrer-ota.sh. `flint-classement.js`
     est un satellite que le binaire App Store 1.0 (31 fichiers) ne telecharge
     PAS : chez ses clients ce symbole n existe pas. Le `try/catch` qui entoure
     ce bloc rattrapait bien la ReferenceError — mais en SILENCE, et les
     corrections du Coach disparaissaient sans que rien ne le dise. Un appel
     garde dit la meme chose a voix haute : pas de module, pas de corrections,
     et le reste du contexte part quand meme. C etait le DERNIER appel non
     garde, et il bloquait toute la livraison du canal. */
  var L=(typeof flApprentissageClassement==='function'?flApprentissageClassement():null)||[], par={};
  L.forEach(function(c){if(!c||!c.choisi)return;var k=c.choisi+'|'+(c.avant||'');par[k]=par[k]||[flcTxt(c.choisi,40),flcTxt(c.avant,40),0];par[k][2]++;});
  o.corrections=Object.keys(par).map(function(k){return par[k];}).sort(function(p,q){return q[2]-p[2];}).slice(0,5);
 }catch(e){}
 if(!o.lignes.length)o.q='missing';
 flcPurger(o);
 /* 8 Ko : la liste d'abord à 5 Ko en retirant les plus anciens jours, puis les fiches */
 var coupe=false;
 while(flcOctets({c:o.cols,l:o.lignes})>5120&&o.lignes.length>1){o.lignes.shift();o.tronque=true;coupe=true;}
 while(flcOctets(o)>8192&&o.fiches&&o.fiches.length){o.fiches.pop();o.tronque=true;if(!o.fiches.length)delete o.fiches;}
 while(flcOctets(o)>8192&&o.lignes.length>1){o.lignes.shift();o.tronque=true;coupe=true;}
 /* le plus vieux jour GARDÉ : le natif n'ajoute aucune sortie GPS d'avant
    (un jour coupé à moitié ferait croire à une course sans son foot) */
 if(coupe&&o.lignes.length){o.depuis=o.lignes[0][0];
  while(flcOctets(o)>8192&&o.lignes.length>1){o.lignes.shift();o.depuis=o.lignes[0][0];}}
 if(o.tronque&&o.q==='good')o.q='partial';
 return o;
}
/* La fiche complète d'UNE séance (getSession, partie JS). */
function flcSession(e,d){
 var dc=flcOffDe(e.jour); if(dc==null)dc=d;
 var a=flcAvecJour(dc,function(){return flActiviteData(e.rang,dc,null,e.id);});
 if(!a||!a.aDesDonnees)return null;
 var s=flcBrute(e);
 var o={q:'good', nom:a.nom||e.nom||null, jour:e.jour||tk(d), id:e.id||null, debut:a.debut||e.debut||null, fin:a.fin||null,
  minutes:(a.minutes==null?null:a.minutes), origine:e.srcs||null, pose:e.genre==='manuelle'?'toi':'bracelet',
  effort20:(a.effort==null?null:String(a.effort)), verdict:a.verdict||null, sous:a.sous?flcTxt(a.sous,140):null,
  coeurFiable:(a.coeurFiable==null?null:!!a.coeurFiable), coeurRaison:a.coeurRaison?flcTxt(a.coeurRaison,140):null,
  fcSuspect:a.fcSuspect||null, hrSource:a.hrSource||null, hrCouv:flcR(a.hrCouv,2),
  fcMoy:(a.moyenne==null?null:String(a.moyenne)), fcMax:(a.maximum==null?null:String(a.maximum)),
  kcal:(a.kcal==null?null:String(a.kcal)), kcalRaison:a.kcalRaison?flcTxt(a.kcalRaison,140):null,
  /* la durée en « 0h04 », comme dans l'instantané (jamais NN:NN, qui se lit comme une heure) */
  zones:(a.zones||[]).map(function(z){return [z.nom||null,z.plage||null,z.pct||null,flcDureeHM(z.duree)];}),
  moyennesSport:{effort:a.effortMoy||null, fcMoy:a.fcMoyMoy||null, fcMax:a.fcMaxMoy||null, kcal:a.kcalMoy||null, pas:a.pasMoy||null}};
 if(a.recup&&typeof a.recup==='object')o.detente=flcPrendre(a.recup,['repos','fcDebut','fcFin','delta','fcMin','decrochageMin','pctCalme','stressAvant','stressApres']);
 var gid=(s&&s.gps)||e.gps||null;
 if(gid){
  try{var g=flcAvecJour(dc,function(){return flSortieData(e.rang,dc);});
   if(g&&g.aDesDonnees)o.gps=flcGps(g);}catch(x){}
 }
 return o;
}
function flcGps(g){
 var o=flcPrendre(g,['distanceTxt','allureTxt','vitesseMouvementTxt','partArret','moyenneTrompeuse','deniveleTxt',
   'fcMoy','fcMax','deriveTxt','deriveRaison','recupTxt','coutTxt']);
 if(g.zones)o.zones=(g.zones||[]).map(function(z){return [z.nom||null,z.txt||null,(z.part==null?null:z.part)];});
 if(g.splits)o.splits=(g.splits||[]).slice(0,42).map(function(s){return [s.km,s.dureeTxt||null,s.allureTxt||null,(s.fcMoy==null?null:s.fcMoy)];});
 return o;
}
function flcGetSession(a){
 /* 25 sept. 2026 (revue) — UN JOUR QU'ON NE SAIT PAS RÉSOUDRE N'EST PAS
    AUJOURD'HUI. Date illisible, future ou hors des 400 jours, « hier » au lieu
    d'un décalage, sortie GPS inconnue du moteur : tout retombait sur off=0, et
    l'unique séance du jour sortait en q:'good' — le natif y greffait ensuite
    les km de la sortie demandée. On dit « introuvable » : le natif répond
    alors avec son propre résumé GPS. */
 var jourDonne=(a.date!=null&&a.date!=='')||(a.jour!=null&&a.jour!=='');
 var off=flcOffset(a);
 if(jourDonne&&off==null)return {q:'missing', raison:'jour ou date invalide, futur ou hors des 400 derniers jours'};
 var gid=(a.gps==null||a.gps==='')?null:String(a.gps), pg=null;
 if(off==null&&gid){
  /* une sortie GPS seule : le moteur retrouve son jour et son rang */
  pg=flcAvecJour0(function(){return flActiviteParGps(gid);});
  if(pg&&pg.aDesDonnees&&pg.jourOffset!=null)off=pg.jourOffset;
  else return {q:'missing', raison:'sortie GPS inconnue du moteur', gps:flcTxt(gid,60)};
 }
 /* un id seul porte son jour (« 2026-9-15@1105#manuel ») */
 if(off==null&&a.id){var mi=String(a.id).match(/^(\d{4}-\d{1,2}-\d{1,2})@/);if(mi)off=flcOffDe(mi[1]);}
 if(off==null)off=0;
 var ents=flcSeancesDe(off), e=null;
 if(a.id)ents.forEach(function(x){if(!e&&x.id===a.id)e=x;});
 if(!e&&a.debut)ents.forEach(function(x){if(!e&&x.debut===String(a.debut))e=x;});
 if(!e&&gid)ents.forEach(function(x){if(!e&&String(x.gps||'')===gid)e=x;});
 if(!e&&pg&&pg.rang!=null){var Kg=tk(off);ents.forEach(function(x){if(!e&&x.jour===Kg&&x.rang===pg.rang)e=x;});}
 /* le raccourci « la seule séance du jour » : jour DONNÉ, et rien d'autre à chercher */
 if(!e&&jourDonne&&ents.length===1&&!a.id&&!a.debut&&!gid)e=ents[0];
 if(!e)return {q:'missing', raison:'séance introuvable ce jour-là', jour:tk(off),
   seances:ents.slice(0,8).map(function(x){return [x.debut||null,flcTxt(x.nom,40),x.id||null];})};
 var o=flcSession(e,off);
 if(!o)return {q:'missing', raison:'fiche indisponible', jour:tk(off), id:e.id||null};
 flcPurger(o);
 while(flcOctets(o)>4096&&o.gps&&o.gps.splits&&o.gps.splits.length){o.gps.splits.pop();o.tronque=true;}
 if(flcOctets(o)>4096){delete o.detente;delete o.zones;o.tronque=true;}
 if(o.tronque)o.q='partial';
 return o;
}
window.flCoachOutils=function(appels){
 var L=appels;
 if(typeof L==='string'){try{L=JSON.parse(L);}catch(e){L=null;}}
 if(!Array.isArray(L))return [];
 _flcLot={};
 try{
  return flcAvecJour0(function(){
   return L.map(function(ap){
    ap=ap||{};
    var nom=String(ap.nom||ap.name||''), a=ap.args;
    if(typeof a==='string'){try{a=JSON.parse(a);}catch(e){a={};}}
    if(!a||typeof a!=='object')a={};
    try{switch(nom){
     case 'getDay':
      var off=flcOffset(a);
      if(off==null)return {q:'missing', raison:'jour ou date manquant, ou hors des 400 derniers jours'};
      return flcJour(off,{plafond:6144, avecRepas:(a.avecRepas===true||a.avecRepas==='true')});
     case 'getHistory': return flcGetHistory(a);
     case 'getTrend': return flcGetTrend(a);
     case 'getSessions': return flcGetSessions(a);
     case 'getSession': return flcGetSession(a);
     default: return {q:'inconnu', nom:flcTxt(nom,40)};
    }}catch(e){return {q:'erreur', raison:flcTxt(nom+' : '+((e&&e.message)||e),80)};}
   });
  });
 }finally{_flcLot=null;}
};
})();
