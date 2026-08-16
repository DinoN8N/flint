/* LE SEMIS DE DÉMO A TOURNÉ SUR LES VRAIES DONNÉES DE FÉLIX.
   Le 10 août 2026 à 09h23, quatre-vingt-trois jours factices sont apparus dans
   sa base, de juillet à OCTOBRE 2026, chacun avec 288 points de fréquence et le
   drapeau `demo`. Ils n'y étaient pas dix minutes plus tôt.

       AVANT   flseedtest absent · purge.seeded 1286 · jours demo  0
       APRÈS   flseedtest absent · purge.seeded 1286 · jours demo 83

   La cause est une course, et c'est la purge qui l'avait armée : elle SUPPRIMAIT
   `flseedtest`, le garde durable, ne laissant qu'un seul rempart — la présence
   du pont natif au moment exact où la ligne s'exécute. */
var ok=0,ko=0;
function v(nom,att,eu){ if(att===eu){ok++;console.log('✅ '+nom);}
  else{ko++;console.log('❌ '+nom+'  attendu '+att+', eu '+eu);} }

/* L ANCIEN GARDE : deux conditions, dont une qui dépend du timing. */
function ancien(flseedtest, pontPresent){
  return flseedtest!==494 && !pontPresent;
}
/* LE NOUVEAU : le protocole de la page, connu dès l analyse, avant tout script. */
function nouveau(flseedtest, pontPresent, protocole){
  return flseedtest!==494 && protocole!=='flintapp:' && !pontPresent;
}

/* LE CAS EXACT DU 10 AOÛT : garde effacé par la purge, pont pas encore injecté. */
v('l ancien garde laissait passer le semis',        true,  ancien(undefined, false));
v('le nouveau le refuse, dans l app',               false, nouveau(undefined, false, 'flintapp:'));
v('et même si le pont arrive à temps',              false, nouveau(undefined, true,  'flintapp:'));
v('et même avec le drapeau posé',                   false, nouveau(494, false, 'flintapp:'));

/* HORS DE L APP, la démo doit rester possible : c est la vitrine du navigateur. */
v('dans un navigateur, le semis reste permis',      true,  nouveau(undefined, false, 'https:'));
v('sauf si le drapeau de blocage est posé',         false, nouveau(494, false, 'https:'));

/* LA PURGE NE DOIT PLUS DÉSARMER LE GARDE.
   Retirer `flseedtest` REARME le semeur : c est exactement ce geste qui a laissé
   passer les 83 jours. La purge doit le POSER, pas le supprimer. */
function purgeAncienne(base){ delete base.flseedtest; return base; }
function purgeNouvelle(base){ base.flseedtest=494; return base; }
v('l ancienne purge rearmait le semeur',  true,
  ancien(purgeAncienne({flseedtest:494}).flseedtest, false));
v('la nouvelle le verrouille',           false,
  ancien(purgeNouvelle({}).flseedtest, false));

/* Les jours semés portent leur marque, et certains sont DANS LE FUTUR : une
   purge qui ne balaie que le passé les laisserait en place. */
var semes=['2026-7-3','2026-8-16','2026-9-30','2026-10-11'];
var aujourdhui=new Date(2026,7,10);
function dansLaPurge(cle, joursAvant, joursApres){
  var p=cle.split('-'), d=new Date(+p[0],+p[1]-1,+p[2]);
  var ecart=Math.round((d-aujourdhui)/86400000);
  return ecart<=joursApres && ecart>=-joursAvant;
}
v('une purge de 200 jours en arrière seule rate octobre', false, dansLaPurge('2026-10-11',200,0));
v('avec 70 jours en avant, il est couvert',                true, dansLaPurge('2026-10-11',200,70));
semes.forEach(function(k){ v('le jour '+k+' est balayé', true, dansLaPurge(k,200,70)); });

console.log('\n'+ok+' réussis, '+ko+' échoués');
if(ko)process.exitCode=1;
