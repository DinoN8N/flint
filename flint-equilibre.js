/* Le metier de ce fichier : L'EQUILIBRE DE CHARGE — la charge des sept derniers
   jours comparee a l'habitude des quatre dernieres semaines, et rien d'autre.
   Liaisons de script : `DB`, `tk`, `sensorOf`, `watchOf` et `loadStrain` se
   lisent NUS (jamais window.*, garde-liaisons), et se testent avant de se
   supposer. Le banc : tests/test-equilibre-charge.js.

   ═══ POURQUOI CE FICHIER EXISTE — v2132, 2 septembre 2026 ══════════════════

   LE DEFAUT, tel que l'audit du 21 aout l'a nomme (VALEURS-NON-BRANCHEES.md,
   « le plus grave du lot ») : `chargeBalance()` divisait la moyenne d'une
   semaine ECRITE A LA MAIN (`TR.charge.weekly`, sept valeurs fixes) par une
   charge chronique FIXEE A 10,4. Le rapport valait donc toujours 1,08, et la
   carte disait « Optimal » a tout le monde, tous les jours, depuis toujours.
   Un conseil faux est pire qu'un ecran vide : l'utilisateur qui vient de
   doubler son volume lisait « tu progresses sans entamer ta recup ».

   CE QUE LA CARTE PROMET DEJA, MOT POUR MOT : « ta charge des 7 derniers jours
   vs. tes 4 dernieres semaines ». Ce fichier fait exactement ce que le texte
   dit, et rien d'autre : la moyenne de `loadStrain` sur les sept jours qui
   finissent au jour affiche, contre la moyenne des vingt-huit. Les bandes du
   rapport (0,8 / 1,3 / 1,5) ne bougent pas : ce sont celles de la carte depuis
   le debut, et celles de la litterature du rapport aigu/chronique.

   UN JOUR SANS MESURE N'EST PAS UN JOUR A ZERO. `loadStrain` rend 0 pour un
   jour ou rien n'a ete enregistre, et 0 pour un vrai jour de repos avec le
   bracelet au poignet. Compter le premier comme le second tirerait la moyenne
   vers le bas et fabriquerait un « Sous-charge » a chaque semaine de vacances
   sans bracelet. Un jour compte donc s'il porte UNE PREUVE qu'il a ete vecu
   avec FLINT : un capteur de nuit, une seance, ou une courbe cardiaque.

   SANS ASSEZ DE JOURS, PAS DE VERDICT. Quatre jours mesures sur sept pour la
   semaine, quatorze sur vingt-huit pour l'habitude, et au moins un jour mesure
   AVANT la semaine (sinon l'habitude, c'est la semaine, et le rapport vaut 1
   par construction). En dessous, on rend la raison, pas un chiffre : c'est le
   contrat de la maison, et c'est ce que la carte affiche. */

/* Un jour a ete vecu avec FLINT s'il en reste une preuve. */
function flChargeJourMesure(k){
 try{
  if(typeof sensorOf==='function'&&sensorOf(k))return true;
  var ss=DB.get('sessions_'+k,[])||[];
  for(var i=0;i<ss.length;i++)if(ss[i]&&ss[i].type!=='nap')return true;
  if(typeof watchOf==='function'){var w=watchOf(k);if(w&&w.hr&&w.hr.length)return true;}
 }catch(e){}
 return false;
}

/* Les seuils, nommes pour que le banc et la carte lisent les memes nombres. */
var FL_EQUILIBRE={aigu:7,chronique:28,minAigu:4,minChronique:14};

/* L'equilibre du jour `off` (0 = aujourd'hui, -1 = hier…).
   Rend { aigu, chronique, rapport, joursAigus, joursChroniques, jours:[…] }
   ou, quand on ne sait pas, { manque:'…la raison…', jours:[…] } — jamais un
   rapport invente. `jours` porte les sept jours affiches, mesures ou non,
   pour que le graphique montre le trou plutot que de le combler. */
window.flEquilibreCharge=function(off){
 try{
  off=Math.min(0,(off|0));
  if(typeof loadStrain!=='function')return {manque:'le calcul de l\'effort n\'est pas charge',jours:[]};
  var JJ=['dim','lun','mar','mer','jeu','ven','sam'];
  var jours=[],sa=0,na=0,sc=0,nc=0,avant=0;
  for(var i=FL_EQUILIBRE.chronique-1;i>=0;i--){
   var o=off-i,k=tk(o),m=flChargeJourMesure(k),v=m?loadStrain(k):null;
   if(m){sc+=v;nc++;if(i>=FL_EQUILIBRE.aigu)avant++;}
   if(i<FL_EQUILIBRE.aigu){
    if(m){sa+=v;na++;}
    var p=String(k).split('-'),d=new Date(+p[0],(+p[1])-1,+p[2],12,0,0);
    jours.push({k:k,lib:JJ[d.getDay()],num:String(d.getDate()),v:v,mesure:m,auj:i===0});
   }
  }
  if(na<FL_EQUILIBRE.minAigu)
   return {manque:'il faut au moins '+FL_EQUILIBRE.minAigu+' jours mesures sur 7, il y en a '+na,jours:jours,joursAigus:na,joursChroniques:nc};
  if(nc<FL_EQUILIBRE.minChronique||avant===0)
   return {manque:'il faut au moins '+FL_EQUILIBRE.minChronique+' jours mesures sur 28 pour connaitre ton habitude, il y en a '+nc,jours:jours,joursAigus:na,joursChroniques:nc};
  var aigu=sa/na,chronique=sc/nc;
  if(!(chronique>0))
   return {manque:'aucun effort mesure sur 28 jours, il n\'y a pas d\'habitude a comparer',jours:jours,joursAigus:na,joursChroniques:nc};
  return {aigu:aigu,chronique:chronique,rapport:aigu/chronique,joursAigus:na,joursChroniques:nc,jours:jours};
 }catch(e){return {manque:String(e&&e.message||e),jours:[]};}
};

/* ═══ v2147 — LE RENDU REJOINT LE METIER ══════════════════════════════════
   Ces deux-la vivaient dans index.html et ne lisaient QUE `flEquilibreCharge`,
   juste au-dessus. Elles descendent ici sans une ligne de changee : l'une
   traduit le rapport en zone/couleur/phrase, l'autre le dessine. Le fichier
   d'index redescend sous son plafond du meme coup. */

/* v2132 — les barres sont les sept VRAIS jours (flint-equilibre.js), plus la
   semaine fixe des tendances. Un jour non mesure n'a pas de barre : il a un
   tiret, parce qu'un trou qu'on comble avec un zero devient une mesure. La
   ligne « moyenne 4 semaines » n'est tracee que si l'habitude est connue. */
function effBalChart(off){
 var e=(typeof flEquilibreCharge==='function')?flEquilibreCharge(off||0):{manque:'calcul absent',jours:[]};
 var w=e.jours||[],cb=chargeBalance(off||0);var W=330,H=152,padL=20,padR=8,padT=20,padB=26,maxY=21;
 function X(i){return padL+(i+0.5)/(w.length||7)*(W-padL-padR)}function Y(v){return padT+(1-Math.min(v,maxY)/maxY)*(H-padT-padB)}
 var s='<svg viewBox="0 0 '+W+' '+H+'" style="width:100%;height:auto;display:block">';
 [0,7,14,21].forEach(function(g){var y=Y(g);s+='<line x1="'+padL+'" y1="'+y.toFixed(1)+'" x2="'+(W-padR)+'" y2="'+y.toFixed(1)+'" stroke="var(--line)"/><text x="'+(padL-4)+'" y="'+(y+3).toFixed(1)+'" text-anchor="end" font-size="8.5" fill="#B4ADA1" font-family="Inter,sans-serif">'+g+'</text>';});
 var bw=13,y0=Y(0);
 w.forEach(function(d,i){var x=X(i),today=!!d.auj;
  if(d.mesure){var v=d.v,y=Y(v);
   s+='<rect x="'+(x-bw/2).toFixed(1)+'" y="'+y.toFixed(1)+'" width="'+bw+'" height="'+Math.max(0,y0-y).toFixed(1)+'" rx="5" fill="'+(today?'#DC481F':'#F0926A')+'"/>';
   s+='<text x="'+x.toFixed(1)+'" y="'+(y-5).toFixed(1)+'" text-anchor="middle" font-size="8.5" font-weight="800" fill="#56514B" font-family="Inter,sans-serif">'+(Math.round(v*10)/10).toFixed(1).replace('.',',')+'</text>';
  }else{
   s+='<text x="'+x.toFixed(1)+'" y="'+(y0-4).toFixed(1)+'" text-anchor="middle" font-size="9" fill="#B4ADA1" font-family="Inter,sans-serif">–</text>';
  }
  s+='<text x="'+x.toFixed(1)+'" y="'+(H-12).toFixed(1)+'" text-anchor="middle" font-size="8.5" fill="#9A948A" font-family="Inter,sans-serif">'+d.lib+'</text>';
  s+='<text x="'+x.toFixed(1)+'" y="'+(H-2).toFixed(1)+'" text-anchor="middle" font-size="8.5" font-weight="'+(today?'800':'400')+'" fill="'+(today?'#15140F':'#9A948A')+'" font-family="Inter,sans-serif">'+d.num+'</text>';
 });
 if(cb&&w.length){var yc=Y(cb.chronic).toFixed(1);
  s+='<line x1="'+X(0).toFixed(1)+'" y1="'+yc+'" x2="'+X(w.length-1).toFixed(1)+'" y2="'+yc+'" stroke="#8A857D" stroke-width="1.6" stroke-dasharray="5 4" stroke-linecap="round"/>';}
 s+='</svg>';
 if(e.manque)s+='<p class="elx-p" style="margin:6px 0 0;color:#8A857D">Pas encore de verdict : '+e.manque+'.</p>';
 return s;}

/* ═══ v2132 — LE VERDICT DE CHARGE SE CALCULE ENFIN ═══════════════════════
   Il divisait une semaine ECRITE A LA MAIN (la table fixe des tendances) par
   une charge chronique FIXEE A 10,4 : le rapport valait 1,08 pour tout le
   monde, et la carte disait « Optimal » a chacun, chaque jour. Le calcul vit
   dans flint-equilibre.js (sept jours contre vingt-huit, jours mesures
   seulement). Ici on ne fait que traduire le rapport en zone, couleur et
   phrase — les memes bandes et les memes textes qu'avant, parce qu'eux
   etaient justes.
   SANS ASSEZ DE JOURS, ON REND null : la carte et le conseil du lendemain le
   savent, et aucun des deux n'invente a la place. */
function chargeBalance(off){
 if(typeof flEquilibreCharge!=='function')return null;
 var e=flEquilibreCharge(off||0);
 if(!e||e.manque)return null;
 var r=e.rapport,o;
 if(r<0.8)o={zone:0,lab:'Sous-charge',col:'#3E63E0',tint:'#ECF0FC',ic:'ti-trending-down',txt:'Ton volume baisse. Si tu te sens frais, c\'est le moment d\'ajouter une séance.'};
 else if(r<=1.3)o={zone:1,lab:'Optimal',col:'#2FA86A',tint:'#EAF6EF',ic:'ti-circle-check',txt:'Tu progresses sans entamer ta récup. Continue comme ça.'};
 else if(r<=1.5)o={zone:2,lab:'Élevé',col:'#E0922A',tint:'#FBF1DD',ic:'ti-alert-triangle',txt:'Charge en hausse rapide, surveille ta récup et garde une séance facile cette semaine.'};
 else o={zone:3,lab:'Risque',col:'var(--accent)',tint:'#FBE9E4',ic:'ti-alert-triangle',txt:'Montée trop rapide, risque de surmenage. Lève le pied 1 à 2 jours.'};
 o.acute=e.aigu;o.chronic=e.chronique;o.ratio=r;o.jours=e.jours;o.joursAigus=e.joursAigus;o.joursChroniques=e.joursChroniques;return o;
}
