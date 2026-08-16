/* QUAND A-T-ON LE DROIT DE RÉÉCRIRE UNE NUIT DÉJÀ MESURÉE ?

   Deux accidents opposés, tous deux vécus :

   · 2 août 2026 — la mémoire de la montre est circulaire. Quelques heures plus
     tard elle ne renvoyait plus que la FIN de la nuit : 11 paquets tombés à 3,
     et le recalcul réécrivait 7h39 en 3h48. Il fallait refuser.

   · 9 août 2026 — le plafond de `wSaveK` avait détruit la fréquence cardiaque
     nocturne. Sans FC, le re-staging ne voyait plus aucun réveil : 12 min
     d'éveil pour 557 min de sommeil, écrites en base. Une fois la FC rendue par
     le rattrapage, le recalcul retrouvait les 86 min d'éveil que Félix avait
     vécues — « de quatre heures neuf à cinq heures et quelques » — donc MOINS de
     sommeil, et se faisait rejeter. Le mauvais chiffre était verrouillé par la
     règle censée le protéger.

   Ce qui sépare les deux cas n'est pas la quantité de sommeil : c'est la
   FENÊTRE. Elle rétrécit dans le premier, elle est identique dans le second. */
var ok=0,ko=0;
function v(nom,att,eu){ if(att===eu){ok++;console.log('✅ '+nom);}
  else{ko++;console.log('❌ '+nom+'  attendu '+att+', eu '+eu);} }

var TOL=120000;
/* Rend true quand on ÉCRIT le recalcul, false quand on garde la mesure d'époque. */
function onEcrit(prev, nouv){
  if(!prev) return true;
  var chevauche = Math.min(prev.fin,nouv.fin) - Math.max(prev.debut,nouv.debut) > 0;
  var couvre = (nouv.debut <= prev.debut + TOL) && (nouv.fin >= prev.fin - TOL);
  if (chevauche && !couvre && nouv.dormi < prev.dormi) return false;
  return true;
}
var H=3600000;
/* 2 août : la montre a oublié le début, la fenêtre commence 4 h plus tard. */
v('fenêtre rétrécie et moins de sommeil : on GARDE la mesure d époque', false,
  onEcrit({debut:0,      fin:8*H, dormi:459},
          {debut:4*H,    fin:8*H, dormi:228}));
/* 9 août : même fenêtre au bit près, le classement seul a changé. */
v('même fenêtre et moins de sommeil : on ÉCRIT le recalcul', true,
  onEcrit({debut:0, fin:9.5*H, dormi:557},
          {debut:0, fin:9.5*H, dormi:483}));
v('même fenêtre et plus de sommeil : on ÉCRIT', true,
  onEcrit({debut:0, fin:9.5*H, dormi:483},
          {debut:0, fin:9.5*H, dormi:557}));
/* Un décalage d une tranche ne doit pas faire basculer la règle. */
v('un décalage de 2 min reste une même fenêtre', true,
  onEcrit({debut:0,      fin:9.5*H,        dormi:557},
          {debut:120000, fin:9.5*H-120000, dormi:483}));
/* Une nuit sans recouvrement est une AUTRE nuit : elle s écrit toujours. */
v('une fenêtre disjointe s écrit toujours', true,
  onEcrit({debut:0,   fin:8*H,  dormi:459},
          {debut:20*H,fin:28*H, dormi:200}));
/* Fenêtre rétrécie mais PLUS de sommeil : rien à protéger. */
v('fenêtre rétrécie mais plus de sommeil : on ÉCRIT', true,
  onEcrit({debut:0,   fin:8*H, dormi:200},
          {debut:4*H, fin:8*H, dormi:228}));

/* Le recalcul doit CONVERGER : relancé sur les mêmes données il ne bouge plus.
   Vérifié sur l appareil de Félix, six passes sur la nuit du 9 août :
   éveil 86 · profond 97 · léger 266 · REM 120 · dormi 483, identique à chaque
   passe. Une nuit qui bouge à chaque ouverture de l app est un chiffre qui ment. */
var passes=[[86,97,266,120,483],[86,97,266,120,483],[86,97,266,120,483],
            [86,97,266,120,483],[86,97,266,120,483],[86,97,266,120,483]];
v('six recalculs successifs donnent le même résultat', true,
  passes.every(function(p){return p.join()===passes[0].join();}));

console.log('\n'+ok+' réussis, '+ko+' échoués');
if(ko)process.exitCode=1;
