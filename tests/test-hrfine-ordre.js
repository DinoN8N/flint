/* L'ORDRE DES ÉCHANTILLONS CONTINUS, REJOUÉ SUR LES VRAIES TRAMES.
   ═══════════════════════════════════════════════════════════════════════════
   17 août 2026 — audit complet de l'horodatage (COMPARAISON-WHOOP.md).
   La montre livre ses enregistrements de 75 s (15 × 5 s, datés à la seconde)
   DU PLUS RÉCENT AU PLUS ANCIEN. L'ancien rangement concaténait dans l'ordre
   d'arrivée : une minute à cheval sur deux enregistrements stockait sa FIN
   avant son DÉBUT — [188,190,…,187, 167,169,…] pour une montée lisse. La
   v1583 y voyait des « fragments mal datés » : c'était NOTRE inversion.

   Les enregistrements ci-dessous sont les VRAIS, décodés du journal Bluetooth
   du téléphone de Dino (trames FFF7 de la synchro du 17/08 09h09, randonnée
   du 16/08). Le banc rejoue la vraie fonction du moteur dessus. */
var fs=require('fs'), path=require('path');
var ok=0,ko=0;
function v(nom,att,eu){ var a=JSON.stringify(att),e=JSON.stringify(eu);
  if(a===e){ok++;console.log('✅ '+nom);}
  else{ko++;console.log('❌ '+nom+'\n     attendu '+a+'\n     eu      '+e);} }

var src=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
var i=src.indexOf('function flConthrSlots(groupes){');
if(i<0){console.log('❌ flConthrSlots introuvable dans le moteur');process.exit(1);}
var d=0,j=i;
for(;;){ if(src[j]==='{')d++; else if(src[j]==='}'){d--; if(!d)break;} j++; }
var slots=new Function(src.slice(i,j+1)+';return flConthrSlots;')();

/* Les trois enregistrements bruts qui encadrent le « pic de 09h40 », datés par
   la montre à la seconde, DANS LEUR ORDRE D'ARRIVÉE réel (récent → ancien).
   Epoch local : le 16/08/2026 est un dimanche, fuseau du téléphone. */
function ep(h,m,s){ return new Date(2026,7,16,h,m,s).getTime()/1000; }
var GROUPES=[
 {ts:ep(9,40,32), hr:[188,190,189,189,190,187,178,177,176,177,180,180,180,178,169]},
 {ts:ep(9,39,17), hr:[143,144,146,153,159,165,166,167,167,167,169,174,180,185,188]},
 {ts:ep(9,38,2),  hr:[111,115,119,121,118,120,126,128,128,128,129,131,134,137,141]},
];
var r=slots(GROUPES)['2026-8-16']||{};

/* La minute 09h39 : 9 échantillons du bloc 09:39:17 (secondes 17→57) PRÉCÉDÉS
   des 3 du bloc 09:38:02 qui débordent (09:39:02→12) — douze cases au total.
   L'ancien code rendait [143,…,167, 134,137,141] — le début APRÈS la fin. */
v('09h39 : chronologique, du début à la fin de la minute',
  [134,137,141, 143,144,146,153,159,165,166,167,167], r['579']);

/* La minute 09h40 — celle du « pic recollé » : la fin du bloc 09:39:17
   (09:40:02→27 : montée 169→188) PUIS le début du bloc 09:40:32 (188→187).
   Une montée lisse, physiologique, à 190. L'ancien code : la fin d'abord. */
v('09h40 : la montée est lisse — plus jamais la fin avant le début',
  [167,169,174,180,185,188, 188,190,189,189,190,187], r['580']);

/* Et la minute redevient COHÉRENTE au sens de la v1583 : le plus grand saut
   entre échantillons consécutifs est de 8 bpm. Le vrai maximum (190) refait
   surface — c'est sa DATE qui reste au dossier firmware, pas sa valeur. */
var i2=src.indexOf('function flMinuteCoherente(vs){');
var d2=0,j2=i2;
for(;;){ if(src[j2]==='{')d2++; else if(src[j2]==='}'){d2--; if(!d2)break;} j2++; }
var coherente=new Function(src.slice(i2,j2+1)+';return flMinuteCoherente;')();
v('la minute 09h40 rangée dans l\'ordre est cohérente', true, coherente(r['580']));

/* Une case reçue deux fois (page relue à la synchro suivante) reste UNE case. */
var r2=slots(GROUPES.concat([{ts:ep(9,40,32), hr:[188,190,189]}]))['2026-8-16'];
v('une page relue n\'ajoute aucun doublon', r['580'].length, r2['580'].length);

console.log('\n'+ok+' réussis, '+ko+' échoués');
if(ko)process.exitCode=1;
