/* LA DÉTECTION DE MARCHES, REJOUÉE SUR L'EXPORT RÉEL ET NOTÉE CONTRE WHOOP.
   ═══════════════════════════════════════════════════════════════════════════

   POURQUOI CE BANC EXISTE. Dino, le 11 août, trois fois de suite : « je marche
   énormément toute la journée et ça ne détecte rien. Est-ce qu'il y a un
   back-end qui n'est pas branché ? » Il n'y en avait pas. Sur sept jours où il
   portait WHOOP à l'autre poignet, il a fait 18 sorties et FLINT en voyait 2.

   CE QUE CE BANC PROTÈGE, ET QUI EST PLUS RARE QU'UN SEUIL. Le défaut n'était
   pas un réglage trop haut : c'était la largeur de tranche, déduite du plus
   petit écart de la journée. Deux blocs du bracelet séparés d'une minute la
   fixaient à 1, plus rien ne se raccordait, et la journée entière disparaissait.
   Un banc sur données inventées ne l'aurait jamais vu — il aurait posé des cases
   régulières, et sur des cases régulières l'ancien code était juste.

   C'est pour ça qu'on rejoue les VRAIES fonctions d'`index.html`, prélevées par
   position dans le fichier, sur le VRAI export d'un téléphone, et qu'on note le
   résultat contre une vérité terrain relevée ailleurs. La leçon vaut d'être
   répétée : un banc qui ne rejoue pas la mesure fige une opinion.

   LA VÉRITÉ TERRAIN. Les dix-huit sorties viennent de l'export WHOOP du 11 août
   — heures de début et de fin, à la minute. Dino a établi à l'oral qu'elles sont
   complètes : « dès que je sortais marcher plus de 10 minutes, il détectait
   l'activité, il ne se trompait pas. » Voir `SEANCES-DINO.txt`.

   CE QU'ON N'EXIGE PAS, ET POURQUOI. Ni le compte exact, ni zéro surplus. Le
   bracelet agrège par blocs d'une dizaine de minutes : dans une telle fenêtre,
   « marché cinq minutes vite puis assis » et « marché onze minutes doucement »
   rendent le même nombre de pas. Une part de surplus est donc structurelle, pas
   un mauvais réglage. On garde des bornes, et on les fait bouger quand la mesure
   bouge — jamais l'inverse.

   USAGE :  node FLINT/web/tests/test-marches-reelles.js
   ═══════════════════════════════════════════════════════════════════════════ */
var fs=require('fs'), path=require('path');
var ok=0,ko=0;
function v(nom,cond,detail){ if(cond){ok++;console.log('✅ '+nom);}
  else{ko++;console.log('❌ '+nom+(detail?'  '+detail:''));} }

var RACINE=path.join(__dirname,'..','..','..');
var RELEVE=path.join(RACINE,'releves','donnees-dino-2026-08-11.json');
if(!fs.existsSync(RELEVE)){
  console.log('⏭  export absent ('+RELEVE+') — banc ignoré.');
  console.log('   Il se régénère avec : zsh outils/exporter-donnees.sh dino');
  process.exit(0);
}
var src=fs.readFileSync(path.join(RACINE,'FLINT','web','index.html'),'utf8');

/* ═══ LES SORTIES RÉELLES, EN MINUTES DEPUIS MINUIT (heure de La Réunion) ═══ */
var VRAI={
  '2026-8-5': [[1218,1242,'Marche'],[1311,1341,'Marche'],[1378,1417,'Marche']],
  '2026-8-6': [[612,631,'Activite'],[757,772,'Activite'],[945,963,'Activite']],
  '2026-8-7': [[719,731,'Randonnee'],[960,980,'Randonnee'],[1035,1058,'Activite']],
  '2026-8-8': [[579,650,'Randonnee en cote, a fond']],
  '2026-8-9': [[595,712,'Randonnee'],[743,803,'Activite'],[979,1001,'Randonnee'],
               [1055,1068,'Marche'],[1092,1110,'Marche']],
  '2026-8-10':[[907,960,'Activite'],[1035,1105,'Marche']],
  '2026-8-11':[[740,930,'Randonnee']]
};

/* ═══ ON PRÉLÈVE LE MOTEUR, PAS UNE COPIE ═════════════════════════════════════
   Le détecteur vit dans une fermeture avec ses constantes et sa source de
   tranches. On prend la tranche de fichier qui va des constantes à l'export de
   la fonction : si l'un des deux repères disparaît, le banc s'arrête au lieu de
   tester un fantôme. */
var A='var MARCHE_FORTE=', B='window.flDetectMarches=detectMarches;';
var ia=src.indexOf(A), ib=src.indexOf(B);
if(ia<0||ib<0||ib<ia) throw new Error('repères introuvables dans index.html — le détecteur a bougé, ce banc doit suivre');
var CODE=src.slice(ia, ib+B.length);

var EXPORT=JSON.parse(fs.readFileSync(RELEVE,'utf8'));
var STORE=EXPORT.donnees;

/* ═══ CE BANC DONNAIT DEUX RÉPONSES SELON LA MACHINE QUI LE LANÇAIT ═══════════

   `trancheDuJour` lit `new Date(ts*1000).getHours()` : l'heure LOCALE de la
   machine. Sur le Mac de Dino, à La Réunion, c'est l'heure de Dino et tout
   tombe juste. Sur celui de Félix, en métropole, les mêmes horodatages se lisent
   deux heures plus tôt — les blocs changent de tranche, certains changent de
   JOUR, et le banc rendait **6 retrouvées sur 18 au lieu de 13**, échouant sur
   ses deux seuils alors que le code était bon.

   Un banc dont le verdict dépend de l'endroit où on le lance ne mesure pas le
   code, il mesure le voyageur.

   L'export porte son fuseau depuis le premier jour, écrit exactement pour ça
   (`outils/exporter-donnees.sh`). On décale donc les horodatages de l'écart
   entre le fuseau du PORTEUR et celui de la machine, une fois, avant tout. Le
   moteur relit ensuite ses heures locales et retrouve celles du poignet.

   C'est la troisième fois de la journée que ce piège mord — il avait déjà fait
   accuser à tort quatre nuits de Dino d'être contaminées, et fait écrire dans
   `DETECTION-CONFRONTEE-AU-REEL.md` que son compteur de pas s'était arrêté le
   11 août alors qu'il a compté 7 048 pas jusqu'à 18h29. */
(function remettreALHeureDuPorteur(){
  var z=(EXPORT.meta&&EXPORT.meta.fuseau||'').split(' ').pop();
  var m=/^([+-])(\d{2})(\d{2})$/.exec(z||'');
  if(!m){ console.log('   ⚠️  export sans fuseau : les heures sont lues telles quelles'); return; }
  var porteur=(m[1]==='-'?-1:1)*((+m[2])*3600+(+m[3])*60);
  /* Le décalage de la machine au jour des données, pas à celui d'aujourd'hui :
     l'heure d'été déplacerait le repère de soixante minutes. */
  var jour=new Date(2026,7,11);
  var machine=-jour.getTimezoneOffset()*60;
  var d=porteur-machine;
  if(!d){ console.log('   (même fuseau que le porteur, rien à décaler)'); return; }
  Object.keys(STORE).forEach(function(k){
    if(!/^watch_/.test(k))return;
    var w=STORE[k]; if(!w)return;
    if(w.actDet)w.actDet=w.actDet.map(function(r){
      return Array.isArray(r)?[r[0]+d].concat(r.slice(1)):r; });
  });
  console.log('   horodatages remis à l\'heure du porteur ('+z+', '
    +(d>0?'+':'')+Math.round(d/3600)+' h par rapport à cette machine)');
})();
global.window={};
global.DB={ get:function(k,def){ return (STORE[k]!==undefined)?STORE[k]:def; },
            set:function(k,val){ STORE[k]=val; } };
global.watchOf=function(K){ return STORE['watch_'+K]||null; };
/* L'export ne sort PAS le profil, à dessein. `flFcMax` ne peut donc pas être
   rejouée : on pose la valeur de Tanaka, comme les autres bancs. Elle ne déplace
   que l'INTENSITÉ affichée d'une marche, jamais sa présence. */
global.flFcMax=function(){ return {v:193}; };
new Function(CODE)();
var detect=global.window.flDetectMarches;
v('le détecteur se prélève et s\'exécute', typeof detect==='function');

/* ═══ LE DÉCOMPTE ═════════════════════════════════════════════════════════════ */
function chevauche(a,b,c,d){ return a<d && b>c; }
var trouvees=0, total=0, enTrop=0, parJour={};
Object.keys(VRAI).forEach(function(K){
  var det=[]; try{ det=detect(K)||[]; }catch(e){ det=[]; }
  var tp=0;
  VRAI[K].forEach(function(s){
    total++;
    if(det.some(function(m){return chevauche(m.startMin,m.endMin,s[0],s[1]);})){ tp++; trouvees++; }
  });
  det.forEach(function(m){
    if(!VRAI[K].some(function(s){return chevauche(m.startMin,m.endMin,s[0],s[1]);})) enTrop++;
  });
  parJour[K]={reel:VRAI[K].length, vu:det.length, tp:tp};
});

console.log('');
console.log('  jour         sorties réelles   détectées   retrouvées');
console.log('  ' + '-'.repeat(52));
Object.keys(VRAI).forEach(function(K){
  var p=parJour[K];
  console.log('  ' + K + ' '.repeat(13-K.length) + String(p.reel).padStart(7)
            + String(p.vu).padStart(13) + String(p.tp).padStart(13));
});
console.log('  ' + '-'.repeat(52));
console.log('  TOTAL' + String(total).padStart(15) + String(trouvees).padStart(26));
console.log('  en trop (non vues par WHOOP) : ' + enTrop);
console.log('');

/* ═══ LES BORNES ══════════════════════════════════════════════════════════════
   Mesuré au moment où la correction a été posée : 13 retrouvées sur 18, 5 en
   trop. On garde une marge d'un cran de chaque côté — un banc qui casse au
   moindre souffle finit ignoré, un banc sans borne ne protège rien.

   AVANT LA CORRECTION, POUR MÉMOIRE : 2 sur 18, et zéro en trop. Un détecteur
   qui n'invente rien parce qu'il ne trouve rien n'est pas prudent, il est muet.
   C'est pourquoi le plancher porte sur ce qu'on RETROUVE, en premier. */
v('au moins 12 sorties sur 18 sont retrouvées', trouvees>=12,
  'eu ' + trouvees + '/' + total);
v('pas plus de 8 détections en trop', enTrop<=8, 'eu ' + enTrop);

/* AUCUNE JOURNÉE MUETTE. C'est le défaut d'origine, et il ne se voit pas dans un
   total : quatre jours sur sept rendaient exactement zéro pendant que Dino
   marchait des heures. Une moyenne correcte peut très bien le cacher. */
var muets=Object.keys(VRAI).filter(function(K){
  return parJour[K].reel>=2 && parJour[K].vu===0; });
v('aucune journée à zéro alors qu\'il y a eu 2 sorties ou plus',
  muets.length===0, 'muettes : ' + muets.join(', '));

/* LA JOURNÉE LA PLUS DURE, NOMMÉMENT. Le 8 août, Dino a monté une heure à fond,
   en course contre son frère : 140 bpm de moyenne chez WHOOP, 5 488 pas comptés
   par notre propre bracelet. C'est la séance la plus intense de la semaine et
   elle était invisible. Si elle redevient invisible, on veut le savoir par son
   nom, pas par un total qui baisse d'une unité. */
v('la montée du 8 août est vue', parJour['2026-8-8'].tp===1);
/* Et le 11 : 190 minutes de randonnée. */
v('la randonnée de 190 min du 11 août est vue', parJour['2026-8-11'].tp===1);

console.log('');
console.log(ok+' réussis, '+ko+' échoués');
process.exit(ko?1:0);
