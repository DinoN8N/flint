/* ═══════════════════════════════════════════════════════════════════════════
   LES TENDANCES — sorties d'index.html lors du découpage du moteur web
   (30 août 2026). Les trois écrans de courbes : Metrend (la tendance d'une
   métrique, table TREND, verdicts par jour), la tendance Calories (cal*), et
   la tendance d'effort (TR, tr*, openTrend), plus renderTrends. Les
   formateurs partagés (minToHM, calNum, CAL_MONTHS, hHM) restent au moteur :
   d'autres écrans les lisent. Déménagement pur — les appels se résolvent au
   geste, comme partout.
   ═══════════════════════════════════════════════════════════════════════════ */
const TREND={
 hrv:{label:'Variabilité de la fréquence cardiaque',unit:'ms',icon:'ti-activity',field:'hrv',short:'VFC',chart:'line',intro:'Explore ta VFC jour après jour et comprends son impact sur ta récupération et tes performances.',
  val:function(k){var s=DB.get('sensor_'+k,null);return s&&s.hrv!=null?s.hrv:null},
  explT:'Qu\'est-ce que la variabilité de la fréquence cardiaque ?',
  explP:'La variabilité de la fréquence cardiaque (VFC) représente les variations du temps entre chaque battement de ton cœur. C\'est un indicateur clé de ta état de récupération, de ton niveau de stress et de ta santé globale.'},
 rhr:{label:'Fréquence cardiaque au repos',unit:'bpm',icon:'ti-heart',field:'rhr',short:'FCR',chart:'line',lowerIsBetter:true,
  val:function(k){var s=DB.get('sensor_'+k,null);return s&&s.rhr!=null?s.rhr:null},
  explT:'Qu\'est-ce que la fréquence cardiaque au repos ?',
  explP:'La fréquence cardiaque au repos (FCR) est le nombre moyen de battements du cœur par minute lorsque tu es complètement au repos, mesurée vers la fin de ta cycle de sommeil. Une FCR basse indique en général une bonne condition physique. Une hausse à court terme peut signaler de la fatigue ou une infection ; une baisse à long terme reflète une meilleure santé cardiovasculaire.'},
 sleepperf:{label:'Ton sommeil',unit:'%',icon:'ti-moon',short:'Performance sommeil',chart:'bar',barCol:'#A9A6F5',moy:true,breakdown:'sleep',
  val:function(k){var s=DB.get('sensor_'+k,null);if(!s||!s.sleepMin)return null;var need=flBesoinJour(k).min;return Math.round(Math.min(100,s.sleepMin/need*100))},
  sent:function(av,a30,r){return r==='M'?('Ta Performance sommeil moyenne ce mois-ci ('+av+' %) '+(a30!=null?(av>=a30?'est supérieure':'est inférieure')+' à ta moyenne de '+a30+' % des 30 derniers jours.':'est calculée sur tes nuits.')):'Ta Performance sommeil moyenne sur cette période est de '+av+' %.'},
  explT:'Qu\'est-ce que la Performance sommeil ?',
  explP:'La performance sommeil mesure la qualité globale de tes nuits. Le score combine le temps de sommeil vs ton besoin, la régularité de tes horaires, l\'efficacité (temps réellement endormi) et le stress nocturne. Au-delà de 85 % le sommeil est optimal, entre 70 et 85 % il est suffisant, en dessous il est insuffisant.'},
 steps:{label:'Pas (version bêta)',unit:'',icon:'ti-walk',short:'pas',chart:'bar',barCol:'#3FA0E0',moy:true,fmt:true,foot:'La moyenne n\'inclut pas les données du jour.',goal:true,
  val:function(k){return flStepsOf(k)},
  sent:function(av,a30,r,dn){return dn?'Ta moyenne de pas est en baisse par rapport à la période précédente. Quelques pas de plus chaque jour suffisent à inverser la tendance.':'Ta moyenne de pas progresse — continuez sur cette lancée pour ancrer l\'habitude.'},
  explT:'Les pas : une mesure de tes mouvements',
  explP:'Les pas quotidiens correspondent au nombre total de pas que tu faites chaque jour : un indicateur clé de ta activité de fond. Marcher suffisamment réduit le risque cardiovasculaire, soutient le métabolisme et favorise la récupération — l\'équilibre idéal entre effort et repos.'},
 calories:{label:'Calories',unit:'Cal',icon:'ti-flame',short:'calories',chart:'bar',barCol:'#F0492E',moy:true,fmt:true,
  val:function(k){return caloriesBurned(k)},
  sent:function(av,a30,r){return 'Tu as brûlé en moyenne '+fmtN(av)+' calories '+(r==='M'?'ce mois-ci':r==='S'?'cette semaine':'sur cette période')+', '+(a30!=null?(av>=a30?'soit plus que':'soit moins que')+' ta moyenne des 30 derniers jours.':'selon ta profil.')},
  explT:'Les calories, qu\'est-ce que c\'est ?',
  explP:'Les calories mesurent l\'énergie que tu dépenses dans la journée. Ce total est estimé à partir de ton métabolisme basal (taille, poids, âge) et de ta fréquence cardiaque tout au long de la journée. Plus tu es actif, plus tu en brûlez.'},
 recovery:{label:'Récupération',unit:'%',icon:'ti-bolt',short:'récupération',chart:'bar',moy:true,yticks:[0,34,67,100],zoneTicks:true,valueLabels:true,
  val:function(k){var r=DB.get('recov_'+k,null);return r!=null?r:null},
  barFn:function(v){return getRecoveryColor(v)},
  verdict:function(v){return v>=67?{t:'Prêt',c:'#2FAE67'}:v>=34?{t:'Modéré',c:'#C8901A'}:{t:'Repos',c:'#C0492C'}},
  bd:{title:'Répartition de la récupération',bands:[{l:'Bonne récupération (67-100 %)',f:function(v){return v>=67},c:'#2FAE67'},{l:'Récupération moyenne (34-66 %)',f:function(v){return v>=34},c:'#fb6015'},{l:'Récupération faible (1-33 %)',f:function(v){return true},c:'#E14434'}]},
  sent:function(av,a30,r){return 'Ta récupération moyenne '+(r==='M'?'ce mois-ci':r==='S'?'sur 7 jours':'sur cette période')+' ('+av+' %) '+(a30!=null?(av>=a30?'est supérieure':'est inférieure')+' à ta moyenne de '+a30+' % des 30 derniers jours.':'.')},
  explT:'La récupération, qu\'est-ce que c\'est ?',
  explP:'La récupération mesure la capacité de ton corps à performer aujourd\'hui. Elle est calculée chaque nuit à partir de ta VFC, ta FC au repos, ta respiration et ton sommeil. Vert : prêt à charger. Orange : dosez l\'effort. Rouge : priorisez le repos. Un bon sommeil ne garantit pas une récup verte — l\'effort et le stress de la veille comptent aussi.'},
 sleepeff:{label:'Efficacité du sommeil',unit:'%',icon:'ti-chart-bar',short:'efficacité du sommeil',chart:'line',color:'#2FA86A',
  val:function(k){var n=sleepNight(k);return n&&n.efficiency!=null?n.efficiency:null},
  verdict:function(v){return v>=90?{t:'Optimal',c:'#2FAE67'}:v>=80?{t:'Suffisant',c:'#8A8580'}:{t:'À améliorer',c:'#C8901A'}},
  bd:{title:'Analyse de l\'efficacité du sommeil',bands:[{l:'Optimal (90 %+)',f:function(v){return v>=90},c:'#2FAE67'},{l:'Suffisant (80-89 %)',f:function(v){return v>=80},c:'#C9C5BC'},{l:'Insuffisant (<80 %)',f:function(v){return true},c:'#F5A623'}]},
  sent:function(av,a30,r){return 'Ta efficacité moyenne du sommeil ('+av+' %) '+(r==='M'?'ce mois-ci ':'')+(a30!=null?(av>=a30?'est supérieure':'est inférieure')+' à ta moyenne de '+a30+' % des 30 derniers jours.':'.')},
  explT:'Qu\'est-ce que l\'efficacité du sommeil ?',
  explP:'L\'efficacité du sommeil est le pourcentage de temps réellement endormi pendant que tu es au lit (temps endormi ÷ temps au lit). Au-delà de 85 %, c\'est excellent : tu passes peu de temps éveillé. Une efficacité basse traduit des réveils fréquents — un environnement sombre, frais et calme, et des horaires réguliers l\'améliorent nettement.'},
 sleepreg:{label:'Régularité du sommeil',unit:'%',icon:'ti-moon',short:'régularité du sommeil',chart:'bar',barCol:'#9BA0E8',moy:true,
  val:function(k){var s=DB.get('sensor_'+k,null);if(!s||s.bedMin==null)return null;var a=[];for(var i=1;i<=4;i++){var p=DB.get('sensor_'+tk2off(k,-i),null);if(p&&p.bedMin!=null)a.push(p.bedMin)}if(a.length<2)return null/* avant : 80 invente, qui entrait ensuite dans les moyennes 7j/30j */;var m=a.reduce(function(x,y){return x+y},0)/a.length,dev=Math.abs(s.bedMin-m);return Math.max(40,Math.min(100,Math.round(100-dev/3)))},
  verdict:function(v){return v>=80?{t:'Optimal',c:'#2FAE67'}:v>=70?{t:'Correct',c:'#8A8580'}:{t:'Irrégulier',c:'#C8901A'}},
  bd:{title:'Analyse de la régularité du sommeil',bands:[{l:'Optimal (80 %+)',f:function(v){return v>=80},c:'#2FAE67'},{l:'Suffisant (70-79 %)',f:function(v){return v>=70},c:'#C9C5BC'},{l:'Insuffisant (<70 %)',f:function(v){return true},c:'#F5A623'}]},
  sent:function(av,a30,r){return 'Ta régularité moyenne ('+av+' %) '+(a30!=null?(av>=a30?'est supérieure':'est inférieure')+' à ta moyenne de '+a30+' % des 30 derniers jours.':'.')},
  explT:'Qu\'est-ce que la régularité du sommeil ?',
  explP:'La régularité compare l\'heure de coucher et de lever de la nuit passée à celles des nuits précédentes. Des horaires constants synchronisent ton horloge interne : tu t\'endors plus vite, ton sommeil profond augmente et ta récupération s\'améliore. C\'est l\'un des leviers les plus simples et les plus puissants.'},
 sleepdebt:{label:'Dette de sommeil',unit:'',icon:'ti-moon-stars',short:'dette de sommeil',chart:'bar',moy:true,timefmt:true,
  val:function(k){var s=DB.get('sensor_'+k,null);if(!s||!s.sleepMin)return null;var need=flBesoinJour(k).min;return Math.max(0,(need-s.sleepMin)/60)},
  barFn:function(v){return v<0.5?'#2FAE67':v<0.75?'#F5A623':'#F0492E'},
  verdict:function(v){return v<0.5?{t:'Faible',c:'#2FAE67'}:v<0.75?{t:'Modérée',c:'#C8901A'}:{t:'Élevée',c:'#C0492C'}},
  bd:{title:'Explications de la dette de sommeil',bands:[{l:'Faible (<0:30)',f:function(v){return v<0.5},c:'#2FAE67'},{l:'Modérée (0:30-0:45)',f:function(v){return v<0.75},c:'#F5A623'},{l:'Élevée (>0:45)',f:function(v){return true},c:'#F0492E'}]},
  sent:function(av,a30,r){return 'Ta dette de sommeil moyenne ('+hHM(av)+') '+(r==='M'?'ce mois-ci ':'')+(a30!=null?(av<=a30?'est inférieure':'est supérieure')+' à ta moyenne de '+hHM(a30)+' des 30 derniers jours. '+(av<=a30?'Beau progrès.':'À surveiller.'):'.')},
  explT:'Qu\'est-ce que la dette de sommeil ?',
  explP:'La dette de sommeil est le manque accumulé quand tu dors moins que ton besoin, nuit après nuit. En dessous de 30-45 min, c\'est optimal. Une dette élevée pèse sur la concentration, l\'humeur, l\'immunité et la performance. Même 10-15 min de sommeil en plus par nuit la réduisent — évite les grasses matinées et les longues siestes tardives.'},
 effort:{label:'Effort du jour',unit:'',icon:'ti-bolt',short:'effort',chart:'bar',dec:true,moy:true,yMax:21,yticks:[0,7,14,21],
  val:function(k){return loadStrain(k)},
  barFn:function(v){return v>18?'#F0492E':v>14?'#F5A623':v>10?'#3FA0E0':'#6C7BD6'},
  verdict:function(v){return v>18?{t:'Très intense',c:'#C0492C'}:v>14?{t:'Vigoureux',c:'#C8901A'}:v>10?{t:'Modéré',c:'#2E78B5'}:{t:'Léger',c:'#5A52B5'}},
  bd:{title:'Analyse de l\'effort',bands:[{l:'Léger (<10)',f:function(v){return v<10},c:'#6C7BD6'},{l:'Modéré (10-14)',f:function(v){return v<=14},c:'#3FA0E0'},{l:'Vigoureux (14-18)',f:function(v){return v<=18},c:'#F5A623'},{l:'Très intense (>18)',f:function(v){return true},c:'#F0492E'}]},
  sent:function(av,a30,r){return 'Ton effort moyen '+(r==='M'?'ce mois-ci':r==='S'?'cette semaine':'sur cette période')+' ('+(Math.round(av*10)/10).toString().replace('.',flSeparateurDecimal())+') '+(a30!=null?(av<a30?'est inférieur':'est supérieur')+' à ta moyenne de '+(Math.round(a30*10)/10).toString().replace('.',flSeparateurDecimal())+' des 30 derniers jours.':'.')},
  explT:'L\'effort du jour, qu\'est-ce que c\'est ?',
  explP:'L\'effort mesure la charge totale imposée à ton corps sur la journée, cardio et musculaire, sur une échelle de 0 à 20 inspirée de l\'échelle de Borg. Léger (0-9) : récupération active. Modéré (10-13) : bon équilibre. Élevé (14-17) : progrès mais récup plus lente. Intense (18-20) : gains maximaux, mais risque accru — à alterner avec du repos.'},
 resp:{label:'Fréquence respiratoire',unit:'/min',  /* 11 sept. 2026 — voir la rangée du Tableau de bord (index.html) */icon:'ti-lungs',field:'resp',short:'fréquence respiratoire',chart:'line',color:'#3FA0E0',dec:true,lowerIsBetter:true,
  val:function(k){var s=DB.get('sensor_'+k,null);return s&&s.resp!=null?s.resp:null},
  explT:'La fréquence respiratoire, qu\'est-ce que c\'est ?',
  explP:'La fréquence respiratoire (FR) est le nombre de respirations par minute pendant ton sommeil. Très stable d\'une nuit à l\'autre, tout écart marqué mérite l\'attention : maladie, fatigue, allergies ou changement d\'altitude peuvent la faire varier. Suivre sa FR aide à repérer tôt un signal inhabituel.'},
 fcavg:{label:'Fréquence cardiaque moyenne',unit:'bpm',icon:'ti-heart',short:'FC moyenne',chart:'line',color:'#F0492E',
  /* MESUREE, plus estimee. L ancienne formule rendait repos + 18 + effort x 1,1,
     un chiffre plausible et faux. Elle lisait de surcroit sensor_ en dur, vide
     en mode coquille. */
  val:function(k){try{
   var w=DB.get('watch_'+k,null);
   var hr=(w&&w.hr)?w.hr.filter(function(x){return x&&x[1]>25&&x[1]<230;}):[];
   if(hr.length<10)return null;
   var t=0;hr.forEach(function(x){t+=x[1];});
   return Math.round(t/hr.length);
  }catch(e){return null;}},
  explT:'La fréquence cardiaque moyenne, qu\'est-ce que c\'est ?',
  explP:'La FC moyenne est ta fréquence cardiaque moyenne sur l\'ensemble de la journée. Elle monte avec l\'activité, mais aussi avec le stress et la fatigue. À distinguer de la FC au repos (mesurée la nuit) : la FC moyenne reflète ta charge globale de la journée, repos et efforts confondus.'},
 timeinbed:{label:'Temps passé au lit',unit:'',icon:'ti-clock',short:'temps au lit',chart:'bar',barCol:'#9BA0E8',moy:true,timefmt:true,grp:'sommeil',
  val:function(k){var n=sleepNight(k);return n?n.inBed/60:null},
  sent:function(av,a30,r){return 'Tu as passé en moyenne '+hHM(av)+' au lit '+(r==='M'?'ce mois-ci':r==='S'?'cette semaine':'sur cette période')+(a30!=null?', soit '+(av>=a30?'plus':'moins')+' que tes '+hHM(a30)+' habituels.':'.')},
  explT:'Le temps passé au lit, qu\'est-ce que c\'est ?',
  explP:'Le temps passé au lit est la durée totale entre le moment où tu te couches et celui où tu te lèves, sommeil et réveils compris. Comparé à ton temps réellement endormi (efficacité), il révèle combien de temps tu restes éveillé au lit. Trop de temps au lit sans dormir fragmente le sommeil — mieux vaut se coucher quand on a réellement sommeil.'},
 sleepresto:{label:'Sommeil réparateur (%)',unit:'%',icon:'ti-heart-rate-monitor',short:'sommeil réparateur',chart:'bar',moy:true,grp:'sommeil',
  val:function(k){var n=sleepNight(k);if(!n||!n.asleep)return null;return Math.round(n.restorative/n.asleep*100)},
  barFn:function(v){return v>=45?'#6E6BFF':v>=30?'#A9A6F5':'#C9C5BC'},
  verdict:function(v){return v>=45?{t:'Élevé',c:'#5A52B5'}:v>=30?{t:'Suffisant',c:'#8A8580'}:{t:'Faible',c:'#C8901A'}},
  bd:{title:'Analyse du sommeil réparateur',bands:[{l:'Élevé (45 %+)',f:function(v){return v>=45},c:'#6E6BFF'},{l:'Suffisant (30-45 %)',f:function(v){return v>=30},c:'#A9A6F5'},{l:'Faible (<30 %)',f:function(v){return true},c:'#C9C5BC'}]},
  sent:function(av,a30,r){return 'En moyenne, '+av+' % de ton sommeil a été réparateur (profond + paradoxal) '+(r==='M'?'ce mois-ci':r==='S'?'cette semaine':'sur cette période')+(a30!=null?', '+(av>=a30?'au-dessus':'en dessous')+' de tes '+a30+' % habituels.':'.')},
  explT:'Qu\'est-ce que le sommeil réparateur ?',
  explP:'Le sommeil réparateur regroupe le sommeil profond (récupération physique, réparation musculaire, immunité) et le sommeil paradoxal/REM (mémoire, apprentissage, équilibre émotionnel). Ensemble, ils devraient représenter au moins 30 à 45 % de ta nuit. C\'est la part qui tu régénère vraiment : un sommeil long mais pauvre en profond et en REM repose moins qu\'une nuit plus courte mais riche en sommeil réparateur.'},
 sleeprestoh:{label:'Sommeil réparateur (heures)',unit:'',icon:'ti-zzz',short:'réparateur (heures)',chart:'stack',moy:true,timefmt:true,grp:'sommeil',
  stack:[{key:'deep',label:'SOL (PROFOND)',c:'#6C4FF0'},{key:'rem',label:'SP / REM',c:'#22BCCB'}],
  stackVals:function(k){var n=sleepNight(k);if(!n)return null;return {deep:(n.deep||0)/60,rem:(n.rem||0)/60}},
  val:function(k){var n=sleepNight(k);return n?n.restorative/60:null},
  verdict:function(v){return v>=3.5?{t:'Élevé',c:'#5A52B5'}:v>=2.5?{t:'Suffisant',c:'#8A8580'}:{t:'Faible',c:'#C8901A'}},
  sent:function(av,a30,r){return 'Tu as cumulé en moyenne '+hHM(av)+' de sommeil réparateur '+(r==='M'?'ce mois-ci':r==='S'?'cette semaine':'sur cette période')+' (profond + paradoxal)'+(a30!=null?', '+(av>=a30?'plus':'moins')+' que tes '+hHM(a30)+' habituels.':'.')},
  explT:'Qu\'est-ce que le sommeil réparateur ?',
  explP:'Le sommeil profond (SOL) répare le corps : muscles, hormones, immunité. Le sommeil paradoxal (SP/REM) consolide la mémoire et régule les émotions. Empilés ici nuit par nuit, ils forment ton sommeil réparateur total. Vise au moins 1h30 à 2h de profond et autant de paradoxal : c\'est cette base, plus que la durée totale, qui détermine à quel point tu te réveilles régénéré.'},
 strengthtime:{label:'Temps de musculation',unit:'',icon:'ti-barbell',short:'temps de musculation',chart:'bar',barCol:'#6C7BD6',moy:true,timefmt:true,grp:'activite',
  val:function(k){var ss=DB.get('sessions_'+k,[]),m=0;ss.forEach(function(s){if(s.type==='strength')m+=(s.dur||0)});
   try{var wm=DB.get('watch_'+k,null);if(wm&&wm.strength>0)m=Math.max(m,+wm.strength);}catch(e){}
   return m/60},
  sent:function(av,a30,r){var wk=Math.round(av*7*60);return 'Tu fais en moyenne '+hHM(av)+' de muscu par jour, soit ~'+hHM(av*7)+' par semaine. '+(wk>=90?'Au-dessus des 90 min/sem recommandées — solide pour la masse et la résistance.':'Vise 90 min/sem pour développer ta masse musculaire.')},
  explT:'Le temps de musculation, qu\'est-ce que c\'est ?',
  explP:'C\'est le temps cumulé passé en renforcement musculaire (muscu, renfo, rameur, CrossFit). Sous tension, le muscle se micro-déchire puis se reconstruit plus fort pendant la récup. Vise au moins 90 minutes par semaine : c\'est le seuil au-delà duquel les gains de force et de densité osseuse deviennent nets. Le repos entre deux séances compte autant que la séance — c\'est là que le muscle pousse.'},
 vo2:{label:'VO₂ max',unit:'mL/kg/min',icon:'ti-lungs',short:'VO₂ max',chart:'line',color:'#3FA0E0',foot:'Estimée à partir de ta FC au repos — pour une valeur exacte, fie-toi à un test en laboratoire.',
  val:function(k){var s=sensorOf(k);if(!s||s.rhr==null)return null;var hrMax=208-0.7*getProfile().age;return Math.round(15.3*hrMax/s.rhr)},
  verdict:function(v){return v>=52?{t:'Excellent',c:'#2FAE67'}:v>=45?{t:'Bon',c:'#2E78B5'}:v>=38?{t:'Correct',c:'#8A8580'}:{t:'À développer',c:'#C8901A'}},
  sent:function(av,a30,r){return 'Ta VO₂ max estimée ('+av+' mL/kg/min) '+(a30!=null?(av>=a30?'progresse':'recule légèrement')+' vs tes '+a30+' habituels.':'reflète ta condition cardiovasculaire.')+' Plus elle est haute, plus ton cœur, tes poumons et tes muscles travaillent ensemble.'},
  explT:'Qu\'est-ce que la VO₂ max ?',
  explP:'La VO₂ max est la quantité maximale d\'oxygène que ton corps peut utiliser à l\'effort. C\'est l\'indicateur de référence de la condition physique et de la longévité. FLINT l\'estime à partir de ta FC au repos (une FC repos basse ↔ une VO₂ max haute). Elle baisse naturellement avec l\'âge, mais l\'endurance et le fractionné la maintiennent — chaque point gagné, c\'est de la résilience en plus.'},
 weight:{label:'Poids',unit:'kg',icon:'ti-scale',short:'poids',chart:'line',color:'#8A8580',dec:true,addData:true,addLabel:'Ajouter une mesure',
  val:function(k){var b=DB.get('bodylog',{})[k];return b&&b.weight!=null?b.weight:null},
  sent:function(av,a30,r){return 'Ton poids moyen sur cette période est de '+(Math.round(av*10)/10).toString().replace('.',flSeparateurDecimal())+' kg'+(a30!=null?', '+(av>a30?'au-dessus':av<a30?'en dessous':'au niveau')+' de tes '+(Math.round(a30*10)/10).toString().replace('.',flSeparateurDecimal())+' kg habituels.':'.')},
  explT:'Le poids : un indicateur parmi d\'autres',
  explP:'Le poids fluctue avec l\'hydratation, l\'alimentation, le glycogène et le cycle — une variation d\'un jour ne veut rien dire, c\'est la tendance sur plusieurs semaines qui compte. Pèse-toi au même moment (le matin, à jeun) pour comparer ce qui est comparable. Et garde en tête : à la salle, gagner du muscle peut faire monter le chiffre alors que tu t\'affines.'},
 leanmass:{label:'Masse corporelle maigre',unit:'kg',icon:'ti-stretching',short:'masse maigre',chart:'line',color:'#6C7BD6',dec:true,addData:true,addLabel:'Ajouter une mesure',
  val:function(k){var b=DB.get('bodylog',{})[k];return b&&b.lean!=null?b.lean:null},
  sent:function(av,a30,r){return 'Ta masse maigre moyenne est de '+(Math.round(av*10)/10).toString().replace('.',flSeparateurDecimal())+' kg'+(a30!=null?', '+(av>=a30?'en hausse':'en baisse')+' vs tes '+(Math.round(a30*10)/10).toString().replace('.',flSeparateurDecimal())+' kg habituels.':'.')+' C\'est ta masse hors graisse : muscles, os, organes, eau.'},
  explT:'Qu\'est-ce que la masse maigre ?',
  explP:'La masse maigre, c\'est tout ce qui n\'est pas de la graisse : muscle, os, organes, eau. La suivre est bien plus parlant que le poids seul — elle te dit si tu construis du muscle ou si tu en perds. En sèche, l\'objectif est de faire baisser le poids SANS toucher à la masse maigre. En prise de masse, c\'est elle qui doit monter. FLINT la calcule à partir de ton poids et de ton taux de masse grasse.'}
};

function tFmtV(M,v){if(v==null)return '—';if(M&&M.timefmt)return hHM(v);if(M&&M.dec)return (Math.round(v*10)/10).toString().replace('.',flSeparateurDecimal());if(M&&M.fmt)return fmtN(Math.round(v));return Math.round(v)}

function bkCardHTML(title,items,tot){tot=tot||items.reduce(function(a,b){return a+b.c},0)||1;
 var bar=items.map(function(it){return it.c>0?'<i style="width:'+(it.c/tot*100).toFixed(1)+'%;background:'+it.col+'"></i>':''}).join('');
 var rows=items.map(function(it){var pc=Math.round(it.c/tot*100);return '<div class="mt2bkrow"><span class="mt2bkdot" style="background:'+it.col+'"></span><b>'+it.c+'<small>j</small></b><span class="mt2bklbl">'+it.l+'</span><span class="mt2bkpct">'+pc+'%</span></div>'}).join('');
 return '<div class="mt2bkh">'+title+'<span>sur '+tot+' jours</span></div><div class="mt2bkbar">'+bar+'</div>'+rows}

function trendBreakdownHTML(pts,bd){var c=bd.bands.map(function(){return 0}),tot=0;pts.forEach(function(p){if(p.v==null)return;for(var i=0;i<bd.bands.length;i++){if(bd.bands[i].f(p.v)){c[i]++;tot++;break}}});
 return bkCardHTML(bd.title,bd.bands.map(function(b,i){return {c:c[i],l:b.l,col:b.c}}),tot)}

var _tMetric='hrv',_tRange='M',_tOff=0,_tSel=null,_tDaySel=null;

function openMetricTrend(k){_tMetric=k;_tRange=(k==='recovery')?'S':'M';_tOff=0;_tSel=null;_tDaySel=null;go('metrend')}

var TREND_PICK=[{g:'Sommeil',keys:['sleepperf','sleepresto','sleeprestoh','sleepeff','sleepreg','sleepdebt','timeinbed']},{g:'Cœur & souffle',keys:['hrv','rhr','fcavg','resp','vo2']},{g:'Activité & récup',keys:['recovery','effort','steps','calories','strengthtime']},{g:'Corps',keys:['weight','leanmass']}];

function openMetricPicker(){haptic();var ex=document.getElementById('mpick');if(ex)ex.remove();var d=document.createElement('div');d.id='mpick';d.className='mpick';
 var rows=TREND_PICK.map(function(grp){var items=grp.keys.filter(function(k){return TREND[k]}).map(function(k){var M=TREND[k],on=k===_tMetric;return '<button type="button" class="mpr'+(on?' on':'')+'" onclick="pickMetric(\''+k+'\')"><span class="mpic"><i class="ti '+M.icon+'"></i></span><span class="mpl">'+M.label+'</span>'+(on?'<i class="ti ti-check mpck"></i>':'')+'</button>'}).join('');return '<div class="mpg">'+grp.g+'</div>'+items}).join('');
 d.innerHTML='<div class="mpbd" onclick="closeMetricPicker()"></div><div class="mpsh"><div class="mphd"><span>Choisir une métrique</span><button type="button" onclick="closeMetricPicker()"><i class="ti ti-x"></i></button></div><div class="mpls">'+rows+'</div></div>';
 document.body.appendChild(d);requestAnimationFrame(function(){d.classList.add('show')})}

function closeMetricPicker(){var d=document.getElementById('mpick');if(d){d.classList.remove('show');setTimeout(function(){if(d)d.remove()},220)}}

function pickMetric(k){closeMetricPicker();_tMetric=k;_tRange='M';_tOff=0;_tSel=null;_tDaySel=null;renderMetrend()}

function trendRange(r){_tRange=r;_tOff=0;renderMetrend()}

function trendShift(d){_tOff=Math.min(0,_tOff+d);renderMetrend()}

function trendSelect(i){var M=TREND[_tMetric],pts=trendPts(M,_tRange,_tOff);if(pts[i]){var k=dkey(pts[i].date);_tDaySel=(_tDaySel===k?null:k);renderMetrend()}}

function trendPts(M,range,off){var n=range==='S'?7:(range==='M'?30:185),step=range==='S'?7:(range==='M'?30:182),base=off*step,pts=[],t=new Date();t.setHours(0,0,0,0);
 for(var i=n-1;i>=0;i--){var dOff=base-i,d=new Date(t);d.setDate(d.getDate()+dOff);var key=d.getFullYear()+'-'+(d.getMonth()+1)+'-'+d.getDate();pts.push({off:dOff,date:d,v:M.val(key)})}return pts}

function trendAvg(pts){var v=pts.filter(function(p){return p.v!=null}).map(function(p){return p.v});return v.length?v.reduce(function(a,b){return a+b},0)/v.length:null}

function metShort(M){return M.short||M.label.toLowerCase()}

function renderMetrend(){var M=TREND[_tMetric];if(!M)return;var bar=M.chart==='bar'||M.chart==='stack';
 (function(){var isS=(_tMetric==='steps'),top=document.getElementById('mtStepsTop'),hdr=document.getElementById('mt2top');if(top){top.style.display=isS?'':'none';top.innerHTML=isS?stepsHeroHTML():'';}if(hdr)hdr.style.display=isS?'none':'';})();
 var seg=document.getElementById('tSeg');if(seg)seg.querySelectorAll('button').forEach(function(b){b.classList.toggle('on',b.dataset.r===_tRange)});
 set('mt2Title',M.label);set('mt2Sub',M.intro||('Explore ta '+metShort(M).toLowerCase()+' jour après jour et comprends son impact sur ta récupération et tes performances.'));
 set('tAvgU',M.unit);set('tExplT',M.explT);set('tExplP',M.explP);
 var ei=document.getElementById('tExplIc');if(ei)ei.innerHTML='<i class="ti '+M.icon+'"></i>';
 set('tChTtl','Votre '+metShort(M)+' — '+(_tRange==='S'?'cette semaine':_tRange==='M'?'ce mois':'6 mois'));
 var pts=trendPts(M,_tRange,_tOff),avg=trendAvg(pts),b=(!bar&&M.field)?baseStat(M.field):null,bLo=b?Math.round(b.m-b.sd):null,bHi=b?Math.round(b.m+b.sd):null;
 var selK=_tDaySel;_tSel=null;if(selK){for(var i=0;i<pts.length;i++){if(dkey(pts[i].date)===selK){_tSel=i;break}}}
 set('tAvgL','Moyenne '+(_tRange==='S'?'7 jours':_tRange==='M'?'30 jours':'6 mois'));
 set('tAvgV',avg!=null?tFmtV(M,avg):'—');
 (function(){var av=document.getElementById('tAvgV'),au=document.getElementById('tAvgU');var c=(M.zoneTicks&&avg!=null)?getRecoveryColor(avg):'';if(av)av.style.color=c;if(au)au.style.color=c;})();
 var prev=trendAvg(trendPts(M,_tRange,_tOff-1)),de=document.getElementById('tDelta');
 if(de){if(avg!=null&&prev!=null&&prev>0){var pct=Math.round((avg-prev)/prev*100),ar=pct>0?'ti-arrow-up-right':pct<0?'ti-arrow-down-right':'ti-minus';de.style.display='flex';de.className='mt2delta';de.innerHTML='<span class="mt2dtop"><b>'+(pct>0?'+':'')+pct+'%</b><i class="ti '+ar+'"></i></span><span class="mt2dsub">vs '+(_tRange==='S'?'sem. préc.':_tRange==='M'?'mois préc.':'6 mois préc.')+'</span>'}else de.style.display='none'}
 if(avg==null){set('tChart','<div class="tempty"><i class="ti '+(M.addData?'ti-ruler-2':'ti-chart-dots')+'"></i><b>Aucune donnée</b><span>'+(M.addData?'Ajoute ta première mesure pour suivre ta tendance.':'Les données apparaîtront ici dès qu\'elles seront disponibles.')+'</span></div>');}
 else set('tChart',M.chart==='stack'?trendStackSVG(pts,avg,_tRange,M):bar?trendBarSVG(pts,avg,_tRange,M):trendChartSVG(pts,bLo,bHi,_tRange,M.color||'#F0492E'));
 var moyE=document.getElementById('tChMoy');if(moyE){if(avg!=null&&_tRange!=='6M'&&M.chart!=='stack'){moyE.className='mt2chmoy on';moyE.textContent='Moyenne '+tFmtV(M,avg)+(M.unit?' '+M.unit:'')}else moyE.className='mt2chmoy'}
 var leg=document.getElementById('tCleg');if(leg){if(M.chart==='stack'){var sk=(_tSel!=null&&pts[_tSel]&&pts[_tSel].v!=null)?M.stackVals(dkey(pts[_tSel].date)):null;leg.style.display='flex';leg.style.justifyContent='center';leg.innerHTML=M.stack.map(function(s){return '<span style="display:inline-flex;align-items:center;gap:5px;margin:0 7px"><span class="tclegb" style="background:'+s.c+'"></span>'+(sk?'<b style="color:#161512">'+hHM(sk[s.key])+'</b> ':'')+s.label+'</span>'}).join('')}else{leg.style.display='none'}}
 var ft=document.getElementById('tFoot');if(ft){if(M.foot){ft.style.display='flex';ft.innerHTML='<i class="ti ti-info-circle"></i>'+M.foot}else ft.style.display='none'}
 var br=document.getElementById('tBreak');if(br){if(M.bd){br.style.display='block';br.innerHTML=trendBreakdownHTML(pts,M.bd)}else if(M.breakdown==='sleep'){br.style.display='block';br.innerHTML=sleepBreakdownHTML(pts)}else br.style.display='none'}
 var g=document.getElementById('tGoal');if(g)g.style.display=M.goal?'flex':'none';
 var ad=document.getElementById('tAdd');if(ad){ad.style.display=M.addData?'flex':'none';if(M.addData)set('tAddL',M.addLabel||'Ajouter une mesure')}
 buildDayCards(M,b);
 (function(){var cc=document.getElementById('tChart');if(!cc||cc._scrubInit)return;cc._scrubInit=1;cc.style.touchAction='none';
  cc.addEventListener('pointerdown',function(e){var MM=TREND[_tMetric];if((MM.chart==='bar'||MM.chart==='stack')&&_tRange==='6M')return;if(MM.chart!=='bar'&&MM.chart!=='stack'&&!trendAvg(trendPts(MM,_tRange,_tOff)))return;e.preventDefault();try{cc.setPointerCapture(e.pointerId)}catch(_){}tScrubFromX(e.clientX);cc._sm=function(ev){tScrubFromX(ev.clientX)};cc.addEventListener('pointermove',cc._sm)});
  var endf=function(e){if(cc._sm){cc.removeEventListener('pointermove',cc._sm);cc._sm=null}try{cc.releasePointerCapture(e.pointerId)}catch(_){}tDeselect()};
  cc.addEventListener('pointerup',endf);cc.addEventListener('pointercancel',endf)})();}

function metrendInfo(){var e=document.getElementById('tExplCard');if(e)e.scrollIntoView({behavior:'smooth',block:'center'})}

function metKeyDate(k){var p=k.split('-');return new Date(+p[0],+p[1]-1,+p[2])}

function vIcon(c){return (c==='#2FAE67'||c==='#2FA86A'||c==='#5A52B5')?'ti-point':(c==='#F0492E'||c==='#C0492C')?'ti-sparkles':(c==='#3FA0E0'||c==='#2E78B5')?'ti-arrow-down':'ti-minus'}

function dayVerdict(M,v,b){if(v==null)return null;
 if(b&&b.sd>0){var z=(v-b.m)/b.sd;if(M.lowerIsBetter)z=-z;var lvl=z>=1.05?3:z>=0.3?2:z>=-0.7?1:0;return [{t:'Faible',c:'#3FA0E0',i:'ti-arrow-down'},{t:'Correct',c:'#8A8580',i:'ti-minus'},{t:'Bon',c:'#2FAE67',i:'ti-point'},{t:'Excellent',c:'#F0492E',i:'ti-sparkles'}][lvl]}
 if(M.verdict){var o=M.verdict(v);return {t:o.t,c:o.c,i:vIcon(o.c)}}return null}

function trendBarSVG(pts,avg,range,M){var W=330,H=215,padL=36,padR=12,padT=20,padB=26,col=M.barCol||'#F0492E',pct=M.unit==='%';
 var data=pts,agg=false;
 if(range==='6M'){data=[];for(var i=0;i<pts.length;i+=7){var sg=pts.slice(i,i+7),vs=sg.filter(function(p){return p.v!=null}).map(function(p){return p.v});data.push({date:sg[0].date,v:vs.length?vs.reduce(function(a,b){return a+b},0)/vs.length:null})}agg=true}
 var n=data.length,vals=data.filter(function(p){return p.v!=null}).map(function(p){return p.v});if(!vals.length)return '<svg viewBox="0 0 '+W+' '+H+'"></svg>';
 var mx=pct?100:Math.max.apply(null,vals),hi=M.yMax||(pct?100:niceMax(mx));
 function X(i){return padL+(i+0.5)*(W-padL-padR)/n}function Y(v){return padT+(1-v/hi)*(H-padT-padB)}
 var bw=Math.max(2,(W-padL-padR)/n*0.6);
 var ticks=M.yticks||(pct?[0,50,100]:[0,hi/2,hi]),grid='',ylab='';ticks.forEach(function(tv){var y=Y(tv);grid+='<line x1="'+padL+'" y1="'+y.toFixed(1)+'" x2="'+(W-padR)+'" y2="'+y.toFixed(1)+'" stroke="#ECE6DD" stroke-width="1"/>';ylab+='<text x="'+(padL-6)+'" y="'+(y+3).toFixed(1)+'" text-anchor="end" font-size="9" font-weight="'+(M.zoneTicks?'700':'400')+'" fill="'+(M.zoneTicks?getRecoveryColor(tv):'#9A988F')+'">'+(M.timefmt?hHM(tv):(M.fmt?fmtN(Math.round(tv)):Math.round(tv)))+(pct?'%':'')+'</text>'});
 var showVal=M.valueLabels&&!agg&&n<=7;
 var bars='',taps='';data.forEach(function(p,i){if(p.v==null)return;var x=X(i),y=Y(p.v),h=Math.max(1,Y(0)-y),seld=(!agg&&_tSel===i),bcol=(M.barFn?M.barFn(p.v):col),bop=(M.valueLabels?(seld?1:.92):(seld?1:(_tSel!=null&&!agg?.4:.9)));bars+='<rect x="'+(x-bw/2).toFixed(1)+'" y="'+y.toFixed(1)+'" width="'+bw.toFixed(1)+'" height="'+h.toFixed(1)+'" rx="'+Math.min(3,bw/2).toFixed(1)+'" fill="'+bcol+'" opacity="'+bop+'"/>';if(showVal)bars+='<text x="'+x.toFixed(1)+'" y="'+Math.max(10,y-6).toFixed(1)+'" text-anchor="middle" font-size="11" font-weight="800" fill="'+bcol+'" opacity="'+(M.valueLabels?1:(seld||_tSel==null?1:.4))+'">'+Math.round(p.v)+(pct?'%':'')+'</text>';if(!agg)taps+='<rect x="'+(x-(W-padL-padR)/n/2).toFixed(1)+'" y="'+padT+'" width="'+((W-padL-padR)/n).toFixed(1)+'" height="'+(H-padT-padB)+'" fill="transparent" style="cursor:pointer" onclick="trendSelect('+i+')"/>'});
 var moy='';if(M.moy&&avg!=null){var my=Y(avg);moy='<line x1="'+padL+'" y1="'+my.toFixed(1)+'" x2="'+(W-padR)+'" y2="'+my.toFixed(1)+'" stroke="#161512" stroke-width="1.4" stroke-dasharray="4 4"/><rect x="'+(padL-2)+'" y="'+(my-9).toFixed(1)+'" width="34" height="18" rx="5" fill="#fff" stroke="#E6DFD5"/><text x="'+(padL+15)+'" y="'+(my+3.5).toFixed(1)+'" text-anchor="middle" font-size="9.5" font-weight="800" fill="#161512">MOY.</text>'}
 var xlab='',step=range==='S'?1:Math.ceil(n/5);for(var i=0;i<n;i+=step){var d=data[i].date;xlab+='<text x="'+X(i).toFixed(1)+'" y="'+(H-12)+'" text-anchor="middle" font-size="9" fill="#9A988F">'+T_MONL[d.getMonth()]+'</text><text x="'+X(i).toFixed(1)+'" y="'+(H-2)+'" text-anchor="middle" font-size="9" fill="#9A988F">'+d.getDate()+'</text>'}
 return '<svg viewBox="0 0 '+W+' '+H+'" style="width:100%;height:auto;display:block">'+grid+ylab+bars+moy+xlab+taps+'</svg>'}

function trendStackSVG(pts,avg,range,M){var W=330,H=215,padL=36,padR=12,padT=20,padB=26,keys=M.stack;
 var data=pts.map(function(p){var sv=M.stackVals(dkey(p.date));return {date:p.date,sv:sv,tot:sv?(sv[keys[0].key]+sv[keys[1].key]):null}}),agg=false;
 if(range==='6M'){var nd=[];for(var i=0;i<data.length;i+=7){var sg=data.slice(i,i+7).filter(function(p){return p.sv}),o={};keys.forEach(function(k){o[k.key]=sg.length?sg.reduce(function(a,p){return a+p.sv[k.key]},0)/sg.length:0});nd.push({date:data[i].date,sv:sg.length?o:null,tot:sg.length?(o[keys[0].key]+o[keys[1].key]):null})}data=nd;agg=true}
 var n=data.length,tots=data.filter(function(p){return p.tot!=null}).map(function(p){return p.tot});if(!tots.length)return '<svg viewBox="0 0 '+W+' '+H+'"></svg>';
 var mx=Math.max.apply(null,tots),hi=niceMax(mx);
 function X(i){return padL+(i+0.5)*(W-padL-padR)/n}function Y(v){return padT+(1-v/hi)*(H-padT-padB)}
 var bw=Math.max(2,(W-padL-padR)/n*0.6);
 var ticks=[0,hi/2,hi],grid='',ylab='';ticks.forEach(function(tv){var y=Y(tv);grid+='<line x1="'+padL+'" y1="'+y.toFixed(1)+'" x2="'+(W-padR)+'" y2="'+y.toFixed(1)+'" stroke="#ECE6DD" stroke-width="1"/>';ylab+='<text x="'+(padL-6)+'" y="'+(y+3).toFixed(1)+'" text-anchor="end" font-size="9" fill="#9A988F">'+hHM(tv)+'</text>'});
 var bars='',taps='';data.forEach(function(p,i){if(p.tot==null)return;var x=X(i),seld=(!agg&&_tSel===i),op=seld?1:(_tSel!=null&&!agg?.38:.92),y0=Y(0);
  keys.forEach(function(k){var val=p.sv[k.key]||0;if(val<=0)return;var h=(val/hi)*(H-padT-padB),yT=y0-h;bars+='<rect x="'+(x-bw/2).toFixed(1)+'" y="'+yT.toFixed(1)+'" width="'+bw.toFixed(1)+'" height="'+h.toFixed(1)+'" fill="'+k.c+'" opacity="'+op+'"/>';y0=yT});
  if(!agg)taps+='<rect x="'+(x-(W-padL-padR)/n/2).toFixed(1)+'" y="'+padT+'" width="'+((W-padL-padR)/n).toFixed(1)+'" height="'+(H-padT-padB)+'" fill="transparent" style="cursor:pointer" onclick="trendSelect('+i+')"/>'});
 var moy='';if(M.moy&&avg!=null){var my=Y(avg);moy='<line x1="'+padL+'" y1="'+my.toFixed(1)+'" x2="'+(W-padR)+'" y2="'+my.toFixed(1)+'" stroke="#161512" stroke-width="1.4" stroke-dasharray="4 4"/><rect x="'+(padL-2)+'" y="'+(my-9).toFixed(1)+'" width="34" height="18" rx="5" fill="#fff" stroke="#E6DFD5"/><text x="'+(padL+15)+'" y="'+(my+3.5).toFixed(1)+'" text-anchor="middle" font-size="9.5" font-weight="800" fill="#161512">MOY.</text>'}
 var xlab='',step=range==='S'?1:Math.ceil(n/5);for(var j=0;j<n;j+=step){var d=data[j].date;xlab+='<text x="'+X(j).toFixed(1)+'" y="'+(H-12)+'" text-anchor="middle" font-size="9" fill="#9A988F">'+T_MONL[d.getMonth()]+'</text><text x="'+X(j).toFixed(1)+'" y="'+(H-2)+'" text-anchor="middle" font-size="9" fill="#9A988F">'+d.getDate()+'</text>'}
 return '<svg viewBox="0 0 '+W+' '+H+'" style="width:100%;height:auto;display:block">'+grid+ylab+bars+moy+xlab+taps+'</svg>'}

function trendChartSVG(pts,bLo,bHi,range,coral){coral=coral||'#F0492E';var W=330,H=215,padL=30,padR=14,padT=26,padB=28;
 var vals=pts.filter(function(p){return p.v!=null}).map(function(p){return p.v});if(!vals.length)return '<svg viewBox="0 0 '+W+' '+H+'"></svg>';
 var arr=vals.concat([bLo,bHi].filter(function(x){return x!=null})),dMin=Math.min.apply(null,arr),dMax=Math.max.apply(null,arr),pad=Math.max(6,(dMax-dMin)*0.16),lo=Math.floor((dMin-pad)/3)*3,hi=Math.ceil((dMax+pad)/3)*3;if(hi<=lo)hi=lo+15;
 function X(i){return padL+i*(W-padL-padR)/(pts.length-1)}function Y(v){return padT+(hi-v)/(hi-lo)*(H-padT-padB)}
 var grid='',ylab='';for(var t2=0;t2<5;t2++){var tv=Math.round(lo+(hi-lo)*t2/4),y=Y(tv);grid+='<line x1="'+padL+'" y1="'+y.toFixed(1)+'" x2="'+(W-padR)+'" y2="'+y.toFixed(1)+'" stroke="#ECE6DD" stroke-width="1" stroke-dasharray="2 4"/>';ylab+='<text x="'+(padL-7)+'" y="'+(y+3).toFixed(1)+'" text-anchor="end" font-size="9.5" fill="#9A988F">'+tv+'</text>'}
 var band=(bLo!=null&&bHi!=null)?'<rect x="'+padL+'" y="'+Y(bHi).toFixed(1)+'" width="'+(W-padL-padR)+'" height="'+Math.max(2,Y(bLo)-Y(bHi)).toFixed(1)+'" fill="rgba(120,110,95,.10)"/>':'';
 var dd='',stt=false;pts.forEach(function(p,i){if(p.v==null)return;dd+=(stt?'L':'M')+X(i).toFixed(1)+' '+Y(p.v).toFixed(1)+' ';stt=true});
 var line='<path d="'+dd+'" fill="none" stroke="'+coral+'" stroke-width="'+(range==='6M'?1.1:2.2)+'" stroke-linejoin="round" stroke-linecap="round" opacity="'+(range==='6M'?'.45':'1')+'"/>';
 var xlab='';
 if(range==='S'){pts.forEach(function(p,i){var wd=flJoursCourts()[p.date.getDay()];xlab+='<text x="'+X(i).toFixed(1)+'" y="'+(H-13)+'" text-anchor="middle" font-size="9.5" fill="#9A988F">'+wd+'</text><text x="'+X(i).toFixed(1)+'" y="'+(H-2)+'" text-anchor="middle" font-size="9.5" fill="#9A988F">'+p.date.getDate()+'</text>'})}
 else if(range==='6M'){var sn={};pts.forEach(function(p,i){var m=p.date.getMonth();if(!sn[m]&&p.date.getDate()<=6){sn[m]=1;xlab+='<text x="'+X(i).toFixed(1)+'" y="'+(H-8)+'" text-anchor="middle" font-size="9.5" fill="#9A988F">'+T_MONL[m]+'</text>'}})}
 else{for(var i=0;i<pts.length;i+=7){xlab+='<text x="'+X(i).toFixed(1)+'" y="'+(H-8)+'" text-anchor="middle" font-size="9.5" fill="#9A988F">'+T_MONL[pts[i].date.getMonth()]+' '+pts[i].date.getDate()+'</text>'}}
 var ph='';
 if(range==='S'){pts.forEach(function(p,i){if(p.v==null)return;ph+='<text x="'+X(i).toFixed(1)+'" y="'+(Y(p.v)-11).toFixed(1)+'" text-anchor="middle" font-size="11" font-weight="700" fill="'+coral+'">'+p.v+'</text><circle cx="'+X(i).toFixed(1)+'" cy="'+Y(p.v).toFixed(1)+'" r="4.5" fill="#fff" stroke="'+coral+'" stroke-width="2.3"/>'})}
 else if(range==='M'){var li=-1;for(var i=pts.length-1;i>=0;i--){if(pts[i].v!=null){li=i;break}}if(li>=0)ph+='<text x="'+(X(li)-5).toFixed(1)+'" y="'+(Y(pts[li].v)-9).toFixed(1)+'" text-anchor="end" font-size="11.5" font-weight="700" fill="'+coral+'">'+pts[li].v+'</text><circle cx="'+X(li).toFixed(1)+'" cy="'+Y(pts[li].v).toFixed(1)+'" r="4.5" fill="#fff" stroke="'+coral+'" stroke-width="2.3"/>'}
 var seg='';
 if(range==='6M'){var groups={};pts.forEach(function(p,i){if(p.v==null)return;var m=p.date.getFullYear()+'-'+p.date.getMonth();(groups[m]=groups[m]||[]).push({i:i,v:p.v})});var prevA=null;Object.keys(groups).forEach(function(kk){var g=groups[kk],a=g.reduce(function(x,b){return x+b.v},0)/g.length,x0=X(g[0].i),x1=X(g[g.length-1].i),y=Y(a),pc=prevA!=null&&prevA>0?Math.round((a-prevA)/prevA*100):null,col=pc==null?'#8A8580':pc>0?'#2FAE67':pc<0?'#E0930A':'#8A8580',xm=(x0+x1)/2;seg+='<line x1="'+x0.toFixed(1)+'" y1="'+y.toFixed(1)+'" x2="'+x1.toFixed(1)+'" y2="'+y.toFixed(1)+'" stroke="'+col+'" stroke-width="3" stroke-linecap="round"/><text x="'+xm.toFixed(1)+'" y="'+(y-7).toFixed(1)+'" text-anchor="middle" font-size="11" font-weight="800" fill="#161512">'+Math.round(a)+'</text>'+(pc!=null?'<text x="'+xm.toFixed(1)+'" y="'+(y+15).toFixed(1)+'" text-anchor="middle" font-size="10" font-weight="800" fill="'+col+'">'+(pc>0?'+':'')+pc+'%</text>':'');prevA=a})}
 var selm='';if(_tSel!=null&&pts[_tSel]&&pts[_tSel].v!=null){var si=_tSel;selm='<line x1="'+X(si).toFixed(1)+'" y1="'+padT+'" x2="'+X(si).toFixed(1)+'" y2="'+(H-padB)+'" stroke="'+coral+'" stroke-width="1.4" stroke-dasharray="3 3"/><circle cx="'+X(si).toFixed(1)+'" cy="'+Y(pts[si].v).toFixed(1)+'" r="6" fill="'+coral+'"/>'}
 var taps='';if(range!=='6M'){var bw=(W-padL-padR)/(pts.length-1);pts.forEach(function(p,i){if(p.v==null)return;taps+='<rect x="'+(X(i)-bw/2).toFixed(1)+'" y="'+padT+'" width="'+bw.toFixed(1)+'" height="'+(H-padT-padB)+'" fill="transparent" style="cursor:pointer" onclick="trendSelect('+i+')"/>'})}
 var firstI=-1,lastI=-1;pts.forEach(function(p,i){if(p.v!=null){if(firstI<0)firstI=i;lastI=i}});
 var area=(range!=='6M'&&dd&&firstI>=0)?'<path d="'+dd+'L'+X(lastI).toFixed(1)+' '+(H-padB).toFixed(1)+' L'+X(firstI).toFixed(1)+' '+(H-padB).toFixed(1)+' Z" fill="'+coral+'" opacity=".07"/>':'';
 var avgL='';if(range!=='6M'){var mv=vals.reduce(function(a,b){return a+b},0)/vals.length,ay=Y(mv);avgL='<line x1="'+padL+'" y1="'+ay.toFixed(1)+'" x2="'+(W-padR)+'" y2="'+ay.toFixed(1)+'" stroke="#9A988F" stroke-width="1.1" stroke-dasharray="4 4" opacity=".7"/>'}
 return '<svg viewBox="0 0 '+W+' '+H+'" style="width:100%;height:auto;display:block">'+band+area+grid+ylab+avgL+line+seg+ph+selm+xlab+taps+'</svg>';}

function calFmtD(off){var d=new Date();d.setDate(d.getDate()+off);var m=['janv.','févr.','mars','avr.','mai','juin','juil.','août','sept.','oct.','nov.','déc.'][d.getMonth()];return d.getDate()+' '+m}

function calDayLabel(off){var d=new Date();d.setDate(d.getDate()+off);var wd=['DIM.','LUN.','MAR.','MER.','JEU.','VEN.','SAM.'][d.getDay()];return wd+' '+d.getDate()+' '+CAL_MONTHS[d.getMonth()]}

function calRangeLabel(off){var d=new Date();d.setDate(d.getDate()+off);return CAL_MONTHS[d.getMonth()]+' '+d.getDate()+', '+String(d.getFullYear()).slice(2)}

function calLabelIdx(n){var a=[0,Math.floor(n/4),Math.floor(n/2),Math.floor(3*n/4),n-1],o=[];a.forEach(function(v){if(o.indexOf(v)<0)o.push(v)});return o}

function calBuildModel(period,off){period=period||'M';off=off||0;
 var nd=period==='S'?7:period==='6M'?182:30;
 var daily=[];for(var i=nd-1;i>=0;i--){var o=-i+off;daily.push({off:o,v:caloriesBurned(tk(o))})}
 var isLine=period==='6M',bars,offs;
 if(isLine){bars=[];offs=[];for(var w=0;w<daily.length;w+=7){var c=daily.slice(w,w+7),vv=c.map(function(x){return x.v});bars.push(Math.round(vv.reduce(function(a,b){return a+b},0)/vv.length));offs.push(c[c.length-1].off)}}
 else{bars=daily.map(function(x){return x.v});offs=daily.map(function(x){return x.off})}
 var atNow=off===0,past=(atNow?bars.slice(0,bars.length-1):bars).filter(function(v){return v>0});
 var avg=past.length?Math.round(past.reduce(function(a,b){return a+b},0)/past.length):(bars[0]||0);
 var base=[];for(var i=nd;i<nd*2;i++){base.push(caloriesBurned(tk(-i+off)))}
 var baseAvg=base.length?base.reduce(function(a,b){return a+b},0)/base.length:avg;
 var pct=baseAvg?Math.round((avg-baseAvg)/baseAvg*100):0;
 var max=Math.max(isLine?5000:4000,Math.ceil(Math.max.apply(null,bars)/1000)*1000);
 var W=360,H=300,padL=44,padR=14,padT=18,botY=256,plotH=botY-padT,plotW=W-padL-padR,n=bars.length,xs=[],ys=[];
 if(isLine){for(var i=0;i<n;i++){xs.push(padL+(i/(n-1))*plotW);ys.push(botY-(bars[i]/max)*plotH)}}
 else{var slot=plotW/n;for(var i=0;i<n;i++){xs.push(padL+i*slot+slot/2);ys.push(botY-(bars[i]/max)*plotH)}}
 return {period,off,isLine,bars,offs,avg,pct,max,n,W,H,padL,padR,padT,botY,plotH,plotW,xs,ys,
  xPct:xs.map(function(x){return x/W*100}),yPct:ys.map(function(y){return y/H*100})};
}

function calChartSVG(m,sel){var W=m.W,H=m.H,padL=m.padL,botY=m.botY,plotH=m.plotH,max=m.max,step=max/4;
 var s='<svg viewBox="0 0 '+W+' '+H+'">';
 [0,1,2,3,4].forEach(function(t){var tv=t*step,y=botY-(tv/max)*plotH;s+='<line x1="'+padL+'" x2="'+(W-m.padR)+'" y1="'+y.toFixed(1)+'" y2="'+y.toFixed(1)+'" stroke="rgba(22,21,18,0.08)"/><text x="'+(padL-10)+'" y="'+(y+4).toFixed(1)+'" text-anchor="end" font-size="10.5" font-weight="700" fill="#7A756E" font-family="Inter,sans-serif">'+(t===0?'0':calNum(tv))+'</text>'});
 var ay=botY-(m.avg/max)*plotH;
 s+='<line x1="'+padL+'" x2="'+(W-m.padR)+'" y1="'+ay.toFixed(1)+'" y2="'+ay.toFixed(1)+'" stroke="#161512" stroke-opacity=".4" stroke-dasharray="5 5" stroke-width="1.4"/>';
 s+='<rect x="'+(padL-40)+'" y="'+(ay-11).toFixed(1)+'" width="34" height="22" rx="6" fill="#fff"/><text x="'+(padL-23)+'" y="'+(ay+4).toFixed(1)+'" text-anchor="middle" font-size="10" font-weight="900" fill="#161512" font-family="Inter,sans-serif">MOY.</text>';
 if(m.isLine){var d=m.xs.map(function(x,i){return (i?'L':'M')+x.toFixed(1)+' '+m.ys[i].toFixed(1)}).join(' ');
  var area=d+' L'+m.xs[m.n-1].toFixed(1)+' '+botY+' L'+m.xs[0].toFixed(1)+' '+botY+' Z';
  s+='<defs><linearGradient id="calg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F0492E" stop-opacity=".16"/><stop offset="1" stop-color="#F0492E" stop-opacity="0"/></linearGradient></defs>';
  s+='<path d="'+area+'" fill="url(#calg)"/><path d="'+d+'" fill="none" stroke="#F0492E" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round" opacity="'+(sel!=null?'.5':'.92')+'"/>';
  if(sel!=null)s+='<circle cx="'+m.xs[sel].toFixed(1)+'" cy="'+m.ys[sel].toFixed(1)+'" r="5.5" fill="#FAF8F5" stroke="#F04A32" stroke-width="3"/>';
 } else {var slot=m.plotW/m.n,bw=Math.max(5,Math.min(15,slot*0.58)),peak=Math.max.apply(null,m.bars);
  m.bars.forEach(function(v,i){var bh=Math.max(2,(v/max)*plotH),x=m.xs[i]-bw/2,y=botY-bh,isSel=sel===i,isPeak=v===peak;var fill=isSel?'#F04A32':'#FF8A70',op=isSel?1:(sel!=null?.52:(isPeak?.95:.82));s+='<rect x="'+x.toFixed(1)+'" y="'+y.toFixed(1)+'" width="'+bw.toFixed(1)+'" height="'+bh.toFixed(1)+'" rx="'+(bw/2.4).toFixed(1)+'" fill="'+fill+'" opacity="'+op+'"/>'});
 }
 calLabelIdx(m.n).forEach(function(ix){s+='<text x="'+m.xs[ix].toFixed(1)+'" y="'+(H-13)+'" text-anchor="middle" font-size="10.5" font-weight="700" fill="#7A756E" font-family="Inter,sans-serif">'+calFmtD(m.offs[ix])+'</text>'});
 return s+'</svg>';
}

function calApplyTexts(m,sel){var lb=document.getElementById('calLabel');
 if(sel==null){if(lb)lb.style.color='';set('calLabel','Moyenne');set('calAvg',calNum(m.avg));set('calInsight',window._calDef||'')}
 else{var v=m.bars[sel],above=v>=m.avg;if(lb)lb.style.color='#F0492E';set('calLabel',calDayLabel(m.offs[sel]));set('calAvg',calNum(v));
  set('calInsight','<b style="color:#161512">'+(above?'Au-dessus de ta moyenne':'Sous ta moyenne')+'</b>')}
}

function calOverlayPos(m,i){var xp=m.xPct[i].toFixed(2),yp=m.yPct[i].toFixed(2);
 var dl=document.getElementById('calDimL'),dr=document.getElementById('calDimR'),vl=document.getElementById('calVline'),cu=document.getElementById('calCursor');
 if(dl)dl.style.cssText='left:0;top:0;height:100%;width:calc('+xp+'% - 16px);background:linear-gradient(to right,rgba(250,248,245,.22) 0,rgba(250,248,245,.22) calc(100% - 18px),rgba(250,248,245,0) 100%)';
 if(dr)dr.style.cssText='right:0;top:0;height:100%;left:calc('+xp+'% + 16px);background:linear-gradient(to left,rgba(250,248,245,.22) 0,rgba(250,248,245,.22) calc(100% - 18px),rgba(250,248,245,0) 100%)';
 if(vl)vl.style.cssText='left:'+xp+'%;top:5%;height:80%';
 if(cu)cu.style.cssText='left:'+xp+'%;top:'+yp+'%';
}

function calBind(){var box=document.getElementById('calChartBox');if(!box||box._bound)return;box._bound=1;
 function idxFromX(cx){var m=window._calModel;if(!m)return 0;var r=box.getBoundingClientRect();var ratio=(cx-r.left)/r.width;ratio=Math.max(0,Math.min(1,ratio));return m.isLine?Math.round(ratio*(m.n-1)):Math.max(0,Math.min(m.n-1,Math.floor(ratio*m.n)))}
 function upd(cx){var m=window._calModel;if(!m)return;var i=idxFromX(cx);if(i!==window._calSel){window._calSel=i;haptic(5);set('calChart',calChartSVG(m,i));calApplyTexts(m,i)}calOverlayPos(m,i)}
 function start(e){try{box.setPointerCapture(e.pointerId)}catch(x){}window._calInspect=true;window._calSel=-1;box.classList.add('inspect');upd(e.clientX);e.preventDefault()}
 function move(e){if(!window._calInspect)return;upd(e.clientX);e.preventDefault()}
 function end(e){if(!window._calInspect)return;window._calInspect=false;window._calSel=null;box.classList.remove('inspect');var m=window._calModel;set('calChart',calChartSVG(m,null));calApplyTexts(m,null)}
 box.addEventListener('pointerdown',start);box.addEventListener('pointermove',move);box.addEventListener('pointerup',end);box.addEventListener('pointercancel',end);
 box.addEventListener('pointerleave',function(e){if(window._calInspect)end(e)});
}

function setCalPeriod(p){window._calPeriod=p;window._calOff=0;renderCalTrend()}

function calShift(dir){var period=window._calPeriod||'M',nd=period==='S'?7:period==='6M'?182:30;window._calOff=Math.min(0,(window._calOff||0)+dir*nd);renderCalTrend()}

function calToggleDD(){var m=document.getElementById('calDDMenu');if(m)m.style.display=m.style.display==='none'?'block':'none'}

function calPickMetric(name){var m=document.getElementById('calDDMenu');if(m)m.style.display='none';if(name!=='Calories')toast(name+' — bientôt disponible')}

function renderCalTrend(){var period=window._calPeriod||'M',off=window._calOff||0;window._calSel=null;window._calInspect=false;
 document.querySelectorAll('#calSeg button').forEach(function(b){b.classList.toggle('on',b.dataset.p===period)});
 var m=calBuildModel(period,off);window._calModel=m;
 var box=document.getElementById('calChartBox');if(box)box.classList.remove('inspect');
 set('calRange',calRangeLabel(m.offs[0])+' – '+calRangeLabel(m.offs[m.n-1]));
 var pct=m.pct,sign=pct>0?'+':'',ref=period==='S'?'à la semaine précédente':period==='6M'?'aux 6 mois précédents':'au mois précédent';
 var bd=document.getElementById('calBadge');if(bd){bd.className='calbadge'+(pct<0?' neg':pct>0?' pos':'');bd.innerHTML='<span class="bdot"></span>'+sign+pct+' % par rapport '+ref}
 var per=period==='S'?'cette semaine':period==='6M'?'au cours de cette période':'ce mois-ci',cmp=pct>0?'soit plus que':pct<0?'soit moins que':'ce qui correspond à';
 window._calDef='Tu as brûlé en moyenne <b>'+calNum(m.avg)+' kcal</b> '+per+', '+cmp+' ta moyenne des '+(period==='6M'?'6 derniers mois':period==='S'?'7 derniers jours':'30 derniers jours')+'.';
 set('calChart',calChartSVG(m,null));calApplyTexts(m,null);calBind();lockInsightH('calInsight');
}

function lockInsightH(id){var p=document.getElementById(id);if(!p)return;p.style.minHeight='';var h=p.offsetHeight;if(h)p.style.minHeight=h+'px'}

function trFmtV(cfg,v){return cfg.fmt==='dec'?(Math.round(v*10)/10).toFixed(1).replace('.',flSeparateurDecimal()):cfg.fmt==='hm'?minToHM(v):calNum(v)}

/* ═══ v2133 — LA TABLE TR NE PORTE PLUS AUCUN CHIFFRE INVENTE ══════════════
   Chaque metrique gardait sept valeurs ecrites a la main (`weekly`), une
   seconde courbe de constantes (`series2`) et une phrase avec des chiffres
   fabriques (`insight` : « 6 h 57 », « 67 % », « 2 734 kcal »). L'ecran ne
   les lisait DEJA plus (trBuildModel passe par trVal, trApply prefere exText),
   mais elles restaient servies : un jour, quelqu'un les aurait rebranchees en
   croyant recoller un graphique. Ce qui reste ici n'est que de la mise en
   forme : libelle, icone, unite, format, echelle, couleurs, et les textes
   d'explication sans chiffre. */
var TR={
 sl_heures:{label:'Heures de sommeil',icon:'ti-moon',unit:'',fmt:'hm',maxY:600,color:'#A99AF7',valLabel:'Moyenne',anchor:[2025,4,14],
  
  exTitle:'Heures de sommeil',exText:'Le temps total dormi chaque nuit. Vise la régularité autour de ton besoin pour soutenir ta récupération.'},
 sl_repair:{label:'Sommeil réparateur',icon:'ti-sparkles',unit:'%',fmt:'num',maxY:100,color:'#A99AF7',valLabel:'Moyenne',anchor:[2025,4,14],
  
  exTitle:'Sommeil réparateur',exText:'La part de sommeil profond et paradoxal. C\'est elle qui répare le corps et consolide la mémoire.'},
 sl_regul:{label:'Régularité',icon:'ti-repeat',unit:'%',fmt:'num',maxY:100,kind:'dualline',valLabel:'Score moyen',anchor:[2025,4,14],
  legend:[['#8E63E9','Coucher'],['#A99AF7','Réveil']],
  exTitle:'Régularité',exText:'La constance de tes heures de coucher et de réveil. Plus c\'est régulier, mieux ton corps anticipe et récupère.'},
 sl_fcnoct:{label:'FC nocturne',icon:'ti-heart',unit:'bpm',fmt:'num',maxY:80,kind:'line',color:'#FF6A4D',valLabel:'Moyenne',anchor:[2025,4,14],
  
  exTitle:'FC nocturne',exText:'Ta fréquence cardiaque pendant le sommeil. Une FC basse et régulière reflète un système nerveux bien récupéré.'},
 charge:{label:'Charge du jour',icon:'ti-bolt',unit:'',fmt:'dec',maxY:20,color:'#F0492E',
  
  exTitle:"La charge, c'est quoi ?",exText:"La charge combine l'intensité et la durée de tes efforts. Une charge modérée (10–14) fait progresser sans entamer ta récupération."},
 zones13:{label:'Zones de FC 1 à 3',icon:'ti-heart',unit:'',fmt:'hm',maxY:60,parts:[['#B9CED8','Zone 1'],['#4A9CC1','Zone 2'],['#61B99A','Zone 3']],
  
  exTitle:'Zones 1 à 3',exText:"Les zones 1 à 3 développent l'endurance de base et la récupération active. La majorité de ton volume devrait s'y trouver."},
 zones45:{label:'Zones de FC 4 et 5',icon:'ti-heart',unit:'',fmt:'hm',maxY:20,parts:[['#F5A85B','Zone 4'],['#F0492E','Zone 5']],
  
  exTitle:'Zones 4 et 5',exText:'Les zones 4 et 5 ciblent la puissance et le seuil. Puissantes pour progresser, mais à doser pour préserver ta récup.'},
 steps:{label:'Pas',icon:'ti-walk',unit:'',fmt:'num',maxY:18000,color:'#F0492E',
  
  exTitle:"Les pas, c'est quoi ?",exText:'Les pas mesurent ton activité quotidienne hors entraînement. FLINT les utilise pour contextualiser ta charge globale et ta récupération.'},
 calories:{label:'Calories',icon:'ti-flame',unit:'kcal',fmt:'num',maxY:4000,color:'#F0492E',
  
  exTitle:"Les calories, c'est quoi ?",exText:"Les calories mesurent l'énergie dépensée dans une journée. FLINT les estime à partir de ton métabolisme basal, de ta FC, de tes mouvements et de tes entraînements."},
 strength:{label:'Temps de musculation',icon:'ti-barbell',unit:'',fmt:'hm',maxY:60,color:'#F0492E',
  
  exTitle:'Temps de musculation',exText:'Le temps de musculation mesure tes séances de renforcement. Ajoute une séance pour suivre ta charge musculaire.'}
};

function trAnchor(cfg){return (cfg&&cfg.anchor)?new Date(cfg.anchor[0],cfg.anchor[1],cfg.anchor[2]):new Date(2025,10,26)}

function trDlab(d){return ['DIM.','LUN.','MAR.','MER.','JEU.','VEN.','SAM.'][d.getDay()]+' '+d.getDate()+' '+CAL_MONTHS[d.getMonth()]}

function trTotal(w){return Array.isArray(w[2])?w[2].reduce(function(a,b){return a+b},0):w[2]}

function trSeed(s){var h=0;for(var i=0;i<s.length;i++)h=(h*31+s.charCodeAt(i))>>>0;
 /* v680 — étape de brassage. Sans elle, deux dates consécutives (« 2026-7-14 »,
    « 2026-7-15 ») donnaient des graines voisines, donc des valeurs quasi
    identiques : le graphique des pas affichait 8663, 8664, 8665… Le brassage
    fait qu'un seul caractère de différence change tout le résultat. */
 h=(h^(h>>>16))>>>0;h=Math.imul(h,2246822507)>>>0;
 h=(h^(h>>>13))>>>0;h=Math.imul(h,3266489909)>>>0;
 return (h^(h>>>16))>>>0;}

function trRangeLabel(a,b){var y=String(b.getFullYear()).slice(2);
 if(a.getFullYear()!==b.getFullYear())return CAL_MONTHS[a.getMonth()]+' '+String(a.getFullYear()).slice(2)+' – '+CAL_MONTHS[b.getMonth()]+' '+y;
 if(a.getMonth()!==b.getMonth())return CAL_MONTHS[a.getMonth()]+' '+a.getDate()+' – '+CAL_MONTHS[b.getMonth()]+' '+b.getDate()+', '+y;
 return CAL_MONTHS[a.getMonth()]+' '+a.getDate()+' – '+b.getDate()+', '+y}

function _flhGet(key,off){try{var c=(typeof FL_HEBDO!=='undefined')&&FL_HEBDO[key];if(c&&typeof c.get==='function')return c.get(off);return (typeof mdGet==='function')?mdGet(key,off):null;}catch(e){return null;}}

function trVal(id,off){try{var k=tk(off);
 switch(id){
  case 'sl_heures':{var s=sensorOf(k);return (s&&s.sleepMin!=null)?s.sleepMin:null;}
  case 'sl_repair':return _flhGet('sleepresto',off);
  case 'sl_regul':return _flhGet('sleepreg',off);
  case 'sl_fcnoct':{var s2=sensorOf(k);return (s2&&s2.rhr!=null)?Math.round(s2.rhr):null;}
  case 'charge':{if(!DB.get('watch_'+k,null)&&!(DB.get('sessions_'+k,[])||[]).length)return null;
   return (typeof loadStrain==='function')?loadStrain(k):null;}
  default:return _flhGet(id,off);
 }}catch(e){return null;}}

function trBuildModel(id,period){var cfg=TR[id];period=period||'S';
 var W=360,H=300,padL=44,padR=14,padT=18,botY=256,plotH=botY-padT,plotW=W-padL-padR;
 /* LES VRAIES SERIES, ENFIN. Ce modele rejouait un catalogue LITTERAL
    (cfg.weekly), et fabriquait le mois et les six mois en y ajoutant un bruit
    sinusoidal seme sur le nom de la metrique — avec une moyenne forcable par
    avgOverride et un axe epingle en mai 2025 (trAnchor). Chaque valeur passe
    desormais par trVal : les MEMES sources reelles que les pages hebdo
    (FL_HEBDO.get, mdGet, loadStrain, sensorOf). Un jour sans mesure vaut 0
    dans la barre et n'entre PAS dans la moyenne ; six mois = moyenne
    journaliere par semaine mesuree. */
 var anchor=new Date(),isLine=period==='6M',lineMode=isLine||cfg.kind==='line'||cfg.kind==='dualline',pts=[];
 var _JN=flJoursCourts();
 function _p(d,v){pts.push({v:(v==null?0:v),vraie:(v!=null),parts:null,day:_JN[d.getDay()],date:String(d.getDate()),dlabel:trDlab(d)});}
 if(period==='S'){for(var i=0;i<7;i++){var d=new Date();d.setDate(d.getDate()-(6-i));_p(d,trVal(id,-(6-i)));}}
 else if(!isLine){for(var i2=0;i2<30;i2++){var d2=new Date();d2.setDate(d2.getDate()-(29-i2));_p(d2,trVal(id,-(29-i2)));}}
 else{for(var wk=25;wk>=0;wk--){var somme=0,nn=0;for(var j=0;j<7;j++){var v0=trVal(id,-(wk*7+j));if(v0!=null){somme+=v0;nn++;}}var d3=new Date();d3.setDate(d3.getDate()-wk*7);_p(d3,nn?somme/nn:null);}}
 var startD=new Date(anchor);startD.setDate(startD.getDate()-(period==='S'?6:isLine?25*7:29));
 var range=trRangeLabel(startD,anchor);
 var totals=pts.map(function(p){return p.v});
 var reels=pts.filter(function(p){return p.vraie}).map(function(p){return p.v});
 var avg=reels.length?reels.reduce(function(a,b){return a+b},0)/reels.length:null;
 var max=cfg.maxY||Math.ceil(Math.max.apply(null,totals)*1.15);if(max<=0)max=cfg.maxY||1;
 var n=pts.length,xs=[],ys=[],ys2=null;
 /* la seconde courbe du mode dualline etait cfg.series2 : sept CONSTANTES de
    maquette tracees par-dessus les vraies valeurs — supprimee. */
 if(lineMode){for(var i=0;i<n;i++){xs.push(padL+(i/(n-1))*plotW);ys.push(botY-(pts[i].v/max)*plotH)}}
 else{var slot=plotW/n;for(var i=0;i<n;i++){xs.push(padL+i*slot+slot/2);ys.push(botY-(pts[i].v/max)*plotH)}}
 return {id,cfg,period,isLine,lineMode,ys2,pts,avg,max,n,W,H,padL,padR,botY,plotH,plotW,xs,ys,range,
  xPct:xs.map(function(x){return x/W*100}),yPct:ys.map(function(y){return y/H*100})};
}

function trChartSVG(m,sel){var cfg=m.cfg,W=m.W,H=m.H,padL=m.padL,botY=m.botY,plotH=m.plotH,max=m.max,step=max/4;
 var s='<svg viewBox="0 0 '+W+' '+H+'">';
 [0,1,2,3,4].forEach(function(t){var tv=t*step,y=botY-(tv/max)*plotH;s+='<line x1="'+padL+'" x2="'+(W-m.padR)+'" y1="'+y.toFixed(1)+'" y2="'+y.toFixed(1)+'" stroke="rgba(22,21,18,0.08)"/><text x="'+(padL-9)+'" y="'+(y+4).toFixed(1)+'" text-anchor="end" font-size="10" font-weight="700" fill="#7A756E" font-family="Inter,sans-serif">'+trFmtV(cfg,tv)+'</text>'});
 if(m.lineMode){var col=cfg.color||'#F0492E';var d=m.xs.map(function(x,i){return (i?'L':'M')+x.toFixed(1)+' '+m.ys[i].toFixed(1)}).join(' ');
  if(m.ys2){var col2=cfg.legend?cfg.legend[0][0]:'#8E63E9';var d2=m.xs.map(function(x,i){return (i?'L':'M')+x.toFixed(1)+' '+m.ys2[i].toFixed(1)}).join(' ');
   s+='<path d="'+d2+'" fill="none" stroke="'+col2+'" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round" opacity="'+(sel!=null?'.45':'.9')+'"/>';
   m.xs.forEach(function(x,i){s+='<circle cx="'+x.toFixed(1)+'" cy="'+m.ys2[i].toFixed(1)+'" r="'+(sel===i?4.5:3.2)+'" fill="'+(sel===i?col2:'#fff')+'" stroke="'+col2+'" stroke-width="2"/>'});
   s+='<path d="'+d+'" fill="none" stroke="'+col+'" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round" opacity="'+(sel!=null?'.45':'.9')+'"/>';
   m.xs.forEach(function(x,i){s+='<circle cx="'+x.toFixed(1)+'" cy="'+m.ys[i].toFixed(1)+'" r="'+(sel===i?4.5:3.2)+'" fill="'+(sel===i?col:'#fff')+'" stroke="'+col+'" stroke-width="2"/>'});
  } else {var area=d+' L'+m.xs[m.n-1].toFixed(1)+' '+botY+' L'+m.xs[0].toFixed(1)+' '+botY+' Z';
   s+='<defs><linearGradient id="trg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="'+col+'" stop-opacity=".16"/><stop offset="1" stop-color="'+col+'" stop-opacity="0"/></linearGradient></defs><path d="'+area+'" fill="url(#trg)"/><path d="'+d+'" fill="none" stroke="'+col+'" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round" opacity="'+(sel!=null?'.45':'.92')+'"/>';
   if(cfg.kind==='line'&&m.n<=8){m.pts.forEach(function(p,i){var isSel=sel===i;s+='<circle cx="'+m.xs[i].toFixed(1)+'" cy="'+m.ys[i].toFixed(1)+'" r="'+(isSel?5:3.6)+'" fill="'+(isSel?col:'#fff')+'" stroke="'+col+'" stroke-width="2.6"/><text x="'+m.xs[i].toFixed(1)+'" y="'+(m.ys[i]-11).toFixed(1)+'" text-anchor="middle" font-size="10" font-weight="900" fill="'+(sel!=null&&!isSel?'rgba(122,117,110,.5)':col)+'">'+trFmtV(cfg,p.v)+'</text>'})}
   else if(sel!=null)s+='<circle cx="'+m.xs[sel].toFixed(1)+'" cy="'+m.ys[sel].toFixed(1)+'" r="5.5" fill="#FAF8F5" stroke="'+col+'" stroke-width="3"/>';
  }
 } else {var slot=m.plotW/m.n,bw=Math.max(5,Math.min(m.n>10?11:26,slot*0.5));
  m.pts.forEach(function(p,i){var isSel=sel===i,op=isSel?1:(sel!=null?.52:.92),x=m.xs[i]-bw/2;
   if(p.parts){var yb=botY;p.parts.forEach(function(pt){if(pt.v<=0)return;var hh=(pt.v/max)*plotH;yb-=hh;s+='<rect x="'+x.toFixed(1)+'" y="'+yb.toFixed(1)+'" width="'+bw.toFixed(1)+'" height="'+hh.toFixed(1)+'" fill="'+(isSel?pt.color:pt.color)+'" opacity="'+op+'"/>'});}
   else if(p.v>0){var hh=Math.max(2,(p.v/max)*plotH),y=botY-hh;s+='<rect x="'+x.toFixed(1)+'" y="'+y.toFixed(1)+'" width="'+bw.toFixed(1)+'" height="'+hh.toFixed(1)+'" rx="'+Math.min(bw/2.4,9).toFixed(1)+'" fill="'+(isSel?'#C84F35':cfg.color)+'" opacity="'+op+'"/>'}
   if(m.n<=8){var topY=botY-(p.v/max)*plotH;s+='<text x="'+m.xs[i].toFixed(1)+'" y="'+(topY-7).toFixed(1)+'" text-anchor="middle" font-size="10" font-weight="900" fill="'+(sel!=null&&!isSel?'rgba(122,117,110,.5)':'#161512')+'">'+trFmtV(cfg,p.v)+'</text>'}
  });
 }
 var li=m.n<=8?m.pts.map(function(_,i){return i}):calLabelIdx(m.n);
 li.forEach(function(i){var p=m.pts[i];s+='<text x="'+m.xs[i].toFixed(1)+'" y="'+(H-25)+'" text-anchor="middle" font-size="10" font-weight="800" fill="#7A756E" font-family="Inter,sans-serif">'+p.day+'</text><text x="'+m.xs[i].toFixed(1)+'" y="'+(H-10)+'" text-anchor="middle" font-size="10.5" font-weight="900" fill="'+(i===m.n-1?'#161512':'#7A756E')+'" font-family="Inter,sans-serif">'+p.date+'</text>'});
 return s+'</svg>';
}

function trApply(m,sel){var cfg=m.cfg;
 /* cfg.insight portait des chiffres ECRITS EN DUR (« 6 h 57 », « 67 % »...) :
    on lui prefere exText, la description sans chiffre. La moyenne peut etre
    null (aucun jour mesure) : « — », pas NaN. Un point non mesure le dit. */
 if(sel==null){set('trLabel',cfg.valLabel||'Moyenne');set('trValue',m.avg==null?'—':trFmtV(cfg,m.avg));set('trInsight',window._trDef||cfg.exText||'')}
 else{var p=m.pts[sel];set('trLabel',p.dlabel);set('trValue',p.vraie?trFmtV(cfg,p.v):'—');
  set('trInsight',p.vraie?('Le '+p.dlabel.toLowerCase()+(cfg.fmt==='hm'?', '+cfg.label.toLowerCase()+' : ':' : ')+'<b>'+trFmtV(cfg,p.v)+(cfg.unit?' '+cfg.unit:'')+'</b>.'):('Le '+p.dlabel.toLowerCase()+' : pas de mesure.'))}
}

function trOverlayPos(m,i){var xp=m.xPct[i].toFixed(2),yp=m.yPct[i].toFixed(2);
 var dl=document.getElementById('trDimL'),dr=document.getElementById('trDimR'),vl=document.getElementById('trVline'),cu=document.getElementById('trCursor');
 if(dl)dl.style.cssText='left:0;top:0;height:100%;width:calc('+xp+'% - 16px);background:linear-gradient(to right,rgba(250,248,245,.22) 0,rgba(250,248,245,.22) calc(100% - 18px),rgba(250,248,245,0) 100%)';
 if(dr)dr.style.cssText='right:0;top:0;height:100%;left:calc('+xp+'% + 16px);background:linear-gradient(to left,rgba(250,248,245,.22) 0,rgba(250,248,245,.22) calc(100% - 18px),rgba(250,248,245,0) 100%)';
 if(vl)vl.style.cssText='left:'+xp+'%;top:5%;height:80%';
 if(cu)cu.style.cssText='left:'+xp+'%;top:'+yp+'%';
}

function trBind(){var box=document.getElementById('trChartBox');if(!box||box._bound)return;box._bound=1;
 function idx(cx){var m=window._trModel;if(!m)return 0;var r=box.getBoundingClientRect();var ra=(cx-r.left)/r.width;ra=Math.max(0,Math.min(1,ra));return m.lineMode?Math.round(ra*(m.n-1)):Math.max(0,Math.min(m.n-1,Math.floor(ra*m.n)))}
 function upd(cx){var m=window._trModel;if(!m)return;var i=idx(cx);if(i!==window._trSel){window._trSel=i;haptic(5);set('trChart',trChartSVG(m,i));trApply(m,i)}trOverlayPos(m,i)}
 function st(e){try{box.setPointerCapture(e.pointerId)}catch(x){}window._trInspect=true;window._trSel=-1;box.classList.add('inspect');upd(e.clientX);e.preventDefault()}
 function mv(e){if(!window._trInspect)return;upd(e.clientX);e.preventDefault()}
 function en(){if(!window._trInspect)return;window._trInspect=false;window._trSel=null;box.classList.remove('inspect');var m=window._trModel;set('trChart',trChartSVG(m,null));trApply(m,null)}
 box.addEventListener('pointerdown',st);box.addEventListener('pointermove',mv);box.addEventListener('pointerup',en);box.addEventListener('pointercancel',en);box.addEventListener('pointerleave',function(){if(window._trInspect)en()});
}

function trToggleDD(){var m=document.getElementById('trDDMenu');if(m)m.style.display=m.style.display==='none'?'block':'none'}

function trPickMetric(id){var mm=document.getElementById('trDDMenu');if(mm)mm.style.display='none';openTrend(id)}

function setTrPeriod(p){window._trPeriod=p;renderEffTrend()}

function trShift(){toast('Bientôt : navigation dans l\'historique')}

function openTrend(id){window._trMetric=id;window._trPeriod='S';window._trSel=null;window._trInspect=false;go('efftrend')}

function renderEffTrend(){var id=window._trMetric||'charge',period=window._trPeriod||'S',cfg=TR[id];
 document.querySelectorAll('#trSeg button').forEach(function(b){b.classList.toggle('on',b.dataset.p===period)});
 var m=trBuildModel(id,period);window._trModel=m;
 set('trMetricLabel',cfg.label);var ic=document.getElementById('trMetricIc');if(ic)ic.className='ti '+cfg.icon;
 set('trUnit',cfg.unit||'');
 set('trRange',m.range);
 var bd=document.getElementById('trBadge');if(bd){bd.className='calbadge';bd.innerHTML='<span class="bdot"></span>par rapport à la période précédente'}
 var unit=cfg.unit?(' '+cfg.unit):'',lab=period==='S'?'cette semaine':period==='6M'?'ces 6 mois':'ce mois-ci',base=trBuildModel(id,'M').avg,def;
 if(period==='S'){var rel=m.avg<base-0.5?'légèrement inférieure à':m.avg>base+0.5?'légèrement supérieure à':'dans la lignée de';def='Ta moyenne de <b>'+trFmtV(cfg,m.avg)+unit+'</b> '+lab+' est '+rel+' ta moyenne habituelle de '+trFmtV(cfg,base)+unit+' sur 30 jours.';}
 else def='Ta moyenne '+lab+' est de <b>'+trFmtV(cfg,m.avg)+unit+'</b>, sur la période '+m.range+'.';
 window._trDef=def;
 set('trInsight',def);
 set('trExTitle',cfg.exTitle);set('trExText',cfg.exText);
 var legs=(cfg.parts&&period==='S')?cfg.parts:(cfg.legend&&period==='S'?cfg.legend:null);
 var lg=document.getElementById('trLegend');if(lg){if(legs){lg.style.display='flex';lg.innerHTML=legs.map(function(p){return '<span class="trlg"><span class="d" style="background:'+p[0]+'"></span>'+p[1]+'</span>'}).join('')}else{lg.style.display='none';lg.innerHTML=''}}
 var mm=document.getElementById('trDDMenu');if(mm){var list=id.indexOf('sl_')===0?TR_SLEEP:TR_ORDER;mm.innerHTML=list.map(function(mid){return '<button type="button" onclick="trPickMetric(\''+mid+'\')"'+(mid===id?' class="on"':'')+'><i class="ti '+TR[mid].icon+'"></i>'+TR[mid].label+'</button>'}).join('')}
 var ex=document.getElementById('trExtra');
 if(ex){
  // KPIs (valables pour toutes les métriques) : moyenne / maxi / total ou mini
  var vv=m.pts.map(function(p){return p.v}),mxv=vv.length?Math.max.apply(null,vv):0,mnv=vv.length?Math.min.apply(null,vv):0,tot=vv.reduce(function(a,b){return a+b},0),u=cfg.unit?(' '+cfg.unit):'';
  var thirdIsTotal=(id==='steps'||id==='calories'||cfg.fmt==='hm');
  var kpi='<div class="trkpi">'+
   '<div class="trkc"><div class="kl">Moyenne</div><div class="kv">'+trFmtV(cfg,m.avg)+'<small>'+u+'</small></div></div>'+
   '<div class="trkc"><div class="kl">Maxi</div><div class="kv">'+trFmtV(cfg,mxv)+'<small>'+u+'</small></div></div>'+
   '<div class="trkc"><div class="kl">'+(thirdIsTotal?'Total':'Plus bas')+'</div><div class="kv">'+trFmtV(cfg,thirdIsTotal?tot:mnv)+'<small>'+u+'</small></div></div>'+
   '</div>';
  var extra='';
  if(id==='charge'){var lv=[['Très intense (>18.0)','#F0492E',0],['Vigoureux (14.1–18.0)','#4A9CC1',0],['Modéré (10.1–14.0)','#61B99A',0],['Léger (0–10.0)','#B9CED8',0]];m.pts.forEach(function(p){var v=p.v;if(v>18)lv[0][2]++;else if(v>14)lv[1][2]++;else if(v>10)lv[2][2]++;else lv[3][2]++});var mx=Math.max.apply(null,lv.map(function(x){return x[2]}))||1;
   extra='<section class="calcard explainb" style="margin-bottom:18px"><h2 style="font-size:15px;letter-spacing:.12em">Analyse de la charge <span style="color:#7A756E">(jours)</span></h2><div style="margin-top:14px">'+lv.map(function(x){return '<div class="trlv"><span class="dt" style="background:'+x[1]+'"></span><span class="nm">'+x[0]+'</span><span class="bar"><span style="width:'+(x[2]/mx*100)+'%;background:'+x[1]+'"></span></span><span class="ct">'+x[2]+'x</span></div>'}).join('')+'</div></section>';}
  else if(id==='strength'){extra='<button type="button" class="trcta" onclick="openActSheet&&openActSheet()"><i class="ti ti-barbell"></i> Ajouter une séance</button>';}
  ex.innerHTML=kpi+extra;}
 var box=document.getElementById('trChartBox');if(box)box.classList.remove('inspect');
 set('trChart',trChartSVG(m,null));trApply(m,null);trBind();lockInsightH('trInsight');
}

function renderTrends(){const metrics=[['recov','Récupération','var(--accent)',k=>DB.get('recov_'+k,null)],['hrv','HRV (ms)','#6C7BD6',k=>{const s=sensorOf(k);return s?s.hrv:null}],['rhr','FC repos','#E0723A',k=>{const s=sensorOf(k);return s?s.rhr:null}],['sleep','Sommeil (h)','#3A4FB0',k=>{const s=sensorOf(k);return s?(s.sleepMin/60):null}],['load','Charge','#3FB57A',k=>loadOf(k)]];
 const cur=window._trM==null?0:window._trM;set('trSeg2',metrics.map((m,i)=>'<button class="'+(i===cur?'on':'')+'" data-m="'+i+'">'+m[1].split(' ')[0]+'</button>').join(''));document.querySelectorAll('#trSeg2 button').forEach(b=>b.onclick=()=>{window._trM=+b.dataset.m;renderTrends()});
 const PER=[[7,'1 sem'],[30,'1 mois'],[180,'6 mois']];const pc=window._trP==null?0:window._trP;set('trPeriod',PER.map((p,i)=>'<button class="'+(i===pc?'on':'')+'" data-p="'+i+'">'+p[1]+'</button>').join(''));document.querySelectorAll('#trPeriod button').forEach(b=>b.onclick=()=>{window._trP=+b.dataset.p;renderTrends()});const nd=PER[pc][0];
 const m=metrics[cur];set('trTitle',m[1]+' · '+PER[pc][1]);const arr=seriesBack(null,nd,m[3]);
 const dlab=i=>{const d=new Date(tk(-(nd-1-i)).replace(/-/g,'/'));return d.getDate()+'/'+(d.getMonth()+1)};
 document.getElementById('trChart2').innerHTML=areaSVG(arr,320,120,m[2],{avg:true,sw:2.8,labels:[[0,dlab(0),'start'],[Math.floor((nd-1)/2),dlab(Math.floor((nd-1)/2)),'middle'],[nd-1,'auj.','end']]});
 const v=arr.filter(x=>x!=null);set('trStat',v.length?('Moyenne '+(m[0]==='sleep'?(v.reduce((a,b)=>a+b,0)/v.length).toFixed(1)+'h':Math.round(v.reduce((a,b)=>a+b,0)/v.length))):'Pas encore de données.');
 const a7=(fn,r)=>{let t=0,c=0;for(let i=0;i<7;i++){const x=fn(tk(-i));if(x!=null){t+=x;c++}}return c?(r?(t/c).toFixed(r):Math.round(t/c)):'—'};
 renderWeekly();renderCorr();set('tr7rec',a7(k=>DB.get('recov_'+k,null)));set('tr7sl',(function(){const x=a7(k=>{const s=sensorOf(k);return s?s.sleepMin/60:null},1);return x==='—'?'—':x+'h'})());set('tr7hrv',a7(k=>{const s=sensorOf(k);return s?s.hrv:null}));set('tr7load',Math.round(loadAvg(7)))}
