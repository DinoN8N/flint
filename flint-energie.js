/* ═══════════════════════════════════════════════════════════════════════════
   LE MODE ÉCONOMIE D'ÉNERGIE — la boucle du moteur lève le pied
   (v2637, 24 sept. 2026 ; sorti d'index.html le 25 sept. par le cliquet du
   découpage : la v2637 l'avait posé là, et index.html a passé 37 500 lignes)

   LIAISONS. `flSnapLoop` est une fonction de haut niveau d'index.html, lue
   NUE et seulement AU MOMENT DE L'APPEL : ce fichier se charge AVANT elle, il
   ne peut donc rien lui poser au chargement (`flSnapLoop.pas=…` ici lèverait).
   C'est index.html qui branche `flSnapLoop.pas` et `flSnapLoop.rendezVous`
   sur les deux fonctions d'ici, en une ligne gardée par `typeof` : un natif
   qui ne télécharge pas ce fichier (OTA sur un binaire plus ancien, voir
   CANAL-OTA.md) garde la boucle d'avant — 180 ms, replanifiée image par
   image — au lieu de la perdre. Le natif pose `window.flEco`
   (PontMoteurWeb.swift, `appliquerEnergie`). Le garde :
   tests/garde-mode-econome.js.

   ═══ v2637 — LA BOUCLE LÈVE LE PIED QUAND LA BATTERIE LE DEMANDE ═══════════
   Dino : « dès que mon téléphone est en mode économie d'énergie, ça bugue
   complètement l'application ». Preuves rapatriées de son iPhone le soir même :
   `flintWKKills = 70`, dernier décès à 21:00, et `charges-refusees.txt` qui
   s'arrête à 20:43 pour ne reprendre qu'à 21:52. Le processus de contenu
   WebKit meurt, le moteur meurt avec lui, et l'écran de démarrage revient —
   exactement ce que `webViewWebContentProcessDidTerminate` annonce depuis la
   v791.

   CETTE BOUCLE EST NOMMÉE SUSPECTE DEPUIS LA v755, dans son propre en-tête
   (index.html) : « principal suspect du crash mémoire WebKit ». Elle avait été
   bridée de 60 Hz à 180 ms — mais elle n'a jamais cessé de tourner. Deux coûts
   restaient :

   ① elle repasse 5,5 fois par seconde, à vie, avec un layout forcé à travers
      l'iframe, que l'app serve à quelque chose ou non ;
   ② même quand elle ne fait RIEN, elle se replanifie par `requestAnimationFrame`
      à chaque image — soit soixante réveils par seconde pour lire une horloge.
      La page n'est donc JAMAIS au repos, et une page jamais au repos est une
      page dont le système ne peut rien reprendre.

   `flSnapRendezVous` corrige les deux, et sans rien changer au travail fait :

   · LE RÉVEIL PASSE PAR `setTimeout`, PUIS PAR `rAF`. Le timeout laisse la page
     s'endormir entre deux passages (c'est ② qui tombe) ; le `rAF` qui suit
     garde la propriété qui comptait — une boucle rAF ne se déclenche pas quand
     le document est masqué, et l'app n'a rien à surveiller quand on ne la
     regarde pas. Inverser les deux perdrait ça.
   · LA CADENCE SUIT LA BATTERIE. 180 ms à plein régime : la valeur mesurée en
     v755, elle ne bouge pas d'une milliseconde. 900 ms en mode économie, posé
     par le natif (`EtatEnergie` → `appliquerEnergie`). Le travail de cette
     boucle est un rattrapage d'état — un bouton retour, un FAB, des résidus de
     parallaxe — pas une animation : il se voit à 1,1 Hz comme à 5,5 Hz, et il
     coûte cinq fois moins.

   ⚠️ CE LOT NE PRÉTEND PAS EMPÊCHER iOS DE TUER WEBKIT. Personne ne le peut.
   Il retire du travail que l'app s'infligeait au moment précis où elle a le
   moins de marge — et il rend le mode VISIBLE au journal, ce qu'il n'était
   nulle part. */
function flSnapPas(){return window.flEco?900:180;}
function flSnapRendezVous(reste){
 /* `reste` : le temps qu'il manque quand on arrive TROP TÔT. Sans lui, la
    sortie anticipée se replanifiait image par image et rendait le repos
    illusoire — on aurait remplacé soixante réveils par seconde par soixante
    réveils par seconde. */
 var d=(typeof reste==='number'&&reste>0)?reste:flSnapPas();
 if(d<=180){requestAnimationFrame(flSnapLoop);return;}
 setTimeout(function(){requestAnimationFrame(flSnapLoop);},d);
}
/* Le natif appelle ceci au démarrage ET à chaque bascule, y compris celle
   qu'iOS déclenche seul à 20 % de batterie — le cas de Dino, qui n'active pas
   le mode à la main. */
window.flEnergieNatif=function(eco){try{window.flEco=!!eco;}catch(e){}};
