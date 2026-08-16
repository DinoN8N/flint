/* « ENDORMI EN » AFFICHAIT UN TIRET POUR TOUT LE MONDE, DEPUIS LA v1285.
   Trouvé par le Claude de Dino, vérifié puis corrigé ici. Ce n'était pas un
   manque de données : la latence d'endormissement est mesurée depuis la v1274.
   C'étaient DEUX ruptures de nom sur le même trajet.

       flint-sommeil.js:963   écrit      s.latenceMin
       sleepNight             relisait   s.latency        ← rupture 1
       flSommeilData          n'émettait rien             ← rupture 2
       SommeilData (natif)    attend     latence

   Une valeur mesurée qui ne traverse pas vaut une valeur absente. */
var ok=0,ko=0;
function v(nom,att,eu){ if(att===eu){ok++;console.log('✅ '+nom);}
  else{ko++;console.log('❌ '+nom+'  attendu '+att+', eu '+eu);} }

/* La lecture réconciliée, telle qu'elle est dans sleepNight. */
function lire(s){
  var v=(s.latenceMin!=null)?s.latenceMin:(s.latency!=null?s.latency:null);
  return (v!=null&&v>=0&&v<=90)?v:null;
}
/* Le report vers le natif, tel qu'il est dans la charge. */
function versNatif(n){ return (n&&n.latency!=null)?n.latency:null; }

v('le nom que le module écrit est lu',          10, lire({latenceMin:10}));
v('l ancien nom reste accepté',                  7, lire({latency:7}));
v('le nom du module gagne si les deux sont là', 10, lire({latenceMin:10,latency:99}));
v('aucun des deux : null',                    null, lire({}));

/* Les bornes : au-delà de 90 minutes ce n est plus une latence mais une fenêtre
   mal découpée, et une valeur négative n existe pas. */
v('91 minutes : refusé',   null, lire({latenceMin:91}));
v('90 minutes : accepté',    90, lire({latenceMin:90}));
v('zéro minute : accepté',    0, lire({latenceMin:0}));
v('valeur négative : refusé', null, lire({latenceMin:-3}));

/* Le trajet complet, sur les vraies nuits de Félix. */
var RELEVE=[['2026-8-4',4],['2026-8-5',4],['2026-8-6',5],
            ['2026-8-7',4],['2026-8-8',4],['2026-8-9',10]];
RELEVE.forEach(function(r){
  v('la nuit du '+r[0]+' traverse jusqu au natif', r[1],
    versNatif({latency:lire({latenceMin:r[1]})}));
});
v('une nuit sans latence n envoie rien', null, versNatif({latency:lire({})}));

console.log('\n'+ok+' réussis, '+ko+' échoués');
if(ko)process.exitCode=1;
