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
