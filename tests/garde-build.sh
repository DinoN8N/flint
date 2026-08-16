#!/bin/sh
# ═════════════════════════════════════════════════════════════════════════════
#  LE GARDE-FOU DU MOTEUR DE SOMMEIL  —  v1189
#
#  POURQUOI IL EXISTE, ET LE JOUR EXACT.
#
#  Le 4 août 2026 à 20 h 05, le banc d'essai du sommeil entre au dépôt : sept
#  fichiers, cinquante-sept assertions, un défaut vécu derrière chacune.
#  Quarante minutes plus tard, à 20 h 45, un commit intitulé « la page
#  Calories » efface les SEPT fichiers et retire cinquante-six lignes du moteur,
#  dont la correction qui empêchait une sieste de durer quatre heures.
#
#  Personne ne l'a vu. L'application a continué de compiler, de s'installer, et
#  de fabriquer de fausses nuits pendant deux jours — jusqu'à ce que le founder
#  se réveille devant une « sieste de 4h59 à 7h01 » alors qu'il était 6 h 37.
#
#  Le défaut n'était donc pas dans le moteur : il était dans le fait qu'on
#  pouvait le DÉTRUIRE sans que rien ne proteste. C'est ça qu'on ferme ici.
#
#  CE QUE CE SCRIPT REFUSE DE LAISSER PASSER :
#    · le moteur a disparu ;
#    · le banc d'essai a disparu, ou il en manque un morceau — c'est le
#      scénario exact du 4 août, et c'est le plus important des trois ;
#    · le moteur ne passe plus son banc.
#
#  CE QU'IL NE FAIT PAS : bloquer pour une raison étrangère au produit. Si Node
#  n'est pas installé, on ne peut pas juger : on avertit très fort, on laisse
#  compiler. Un garde-fou qui empêche de travailler finit désactivé, et alors il
#  ne protège plus rien.
# ═════════════════════════════════════════════════════════════════════════════
set -u

RACINE="${SRCROOT:-$(cd "$(dirname "$0")/../../.." && pwd)}"
BANC="$RACINE/FLINT/web/tests"
MOTEUR="$RACINE/FLINT/web/flint-sommeil.js"

if [ ! -f "$MOTEUR" ]; then
  echo "error: le moteur de sommeil (FLINT/web/flint-sommeil.js) a disparu du depot. Restaure-le avant de compiler."
  exit 1
fi

if [ ! -f "$BANC/tous.js" ]; then
  echo "error: le banc d essai du sommeil a disparu (FLINT/web/tests/tous.js). C est exactement ce qui s est passe le 4 aout a 20h45 : on ne compile pas sans lui."
  exit 1
fi

MANQUE=""
for f in test-sommeil.js test-bourrage.js test-menage.js test-menage-fc.js \
         test-sieste-fc.js test-reparation.js test-reveil.js \
         test-journee-dino.js test-charge-nuit.js test-jour-logique.js \
         garde-pont.js garde-portee.js garde-fichiers.js garde-caches.js \
         receptacles-attendus.txt cles-moteur-attendues.txt; do
  if [ ! -f "$BANC/$f" ]; then MANQUE="$MANQUE $f"; fi
done
if [ -n "$MANQUE" ]; then
  echo "error: banc d essai du sommeil incomplet, il manque :$MANQUE"
  exit 1
fi

# ─────────────────────────────────────────────────────────────────────────────
#  LES DEUX NUMEROS DE VERSION DOIVENT ETRE EGAUX  —  v1230
#
#  Le 6 aout, sw.js etait a flint-v1228 et APP_VERSION a v1196 : trente-deux
#  versions d ecart, nees d un rebase ou une branche avait pose APP_VERSION et
#  l autre bumpe sw.js. Rien ne l a signale.
#
#  Ce n est pas cosmetique. `checkUpdate()` compare EXACTEMENT ces deux nombres
#  et affiche « Nouvelle version, appuie pour mettre a jour » des que celui de
#  sw.js est le plus grand. Il tourne au chargement ET a chaque retour dans
#  l app : le telephone proposait donc en boucle une mise a jour qui n existait
#  pas, en se croyant perime par rapport a son propre service worker.
#
#  La regle de la double montee etait ecrite partout et respectee de bonne foi ;
#  il manquait seulement quelqu un pour VERIFIER qu elle l avait ete.
# ─────────────────────────────────────────────────────────────────────────────
INDEX="$RACINE/FLINT/web/index.html"
SW="$RACINE/FLINT/web/sw.js"
if [ -f "$INDEX" ] && [ -f "$SW" ]; then
  VI=$(grep -o "APP_VERSION='v[0-9]*'" "$INDEX" | head -1 | grep -o '[0-9]*')
  VS=$(grep -o 'flint-v[0-9]*' "$SW" | head -1 | grep -o '[0-9]*')
  if [ -n "$VI" ] && [ -n "$VS" ] && [ "$VI" != "$VS" ]; then
    echo "error: APP_VERSION (v$VI) et sw.js (flint-v$VS) ne sont pas au meme numero."
    echo "error: l app se croira perimee et proposera en boucle une mise a jour qui n existe pas."
    echo "error: monte les DEUX au meme nombre avant de compiler."
    exit 1
  fi
fi

NODE=""
for c in /opt/homebrew/bin/node /usr/local/bin/node /usr/bin/node; do
  if [ -x "$c" ]; then NODE="$c"; break; fi
done
if [ -z "$NODE" ]; then
  TROUVE=$(command -v node 2>/dev/null || true)
  if [ -n "$TROUVE" ]; then NODE="$TROUVE"; fi
fi
if [ -z "$NODE" ]; then
  echo "warning: Node introuvable, le banc du sommeil n a PAS ete joue. Le moteur n est pas verifie pour cette compilation."
  exit 0
fi

# ── LES FICHIERS DU PROJET ─────────────────────────────────────────────────
# v1325 — un fichier inscrit au projet Xcode doit etre dans le depot.
# Le 9 aout, le pbxproj est parti avec EcgView.swift et EcgData.swift inscrits
# dedans et les fichiers restes sur le Mac de Dino : main n a plus compile
# pendant trois versions, et l auteur ne pouvait pas le voir — chez lui tout
# etait la. C est le 4 aout vu de l autre cote : la copie locale reste
# coherente, le depot ne l est plus.
FICHIERS=$("$NODE" "$BANC/garde-fichiers.js" 2>&1)
CODEF=$?
echo "$FICHIERS"
if [ $CODEF -ne 0 ]; then
  echo "error: le projet reclame un fichier que le depot n a pas — ca compile ici et nulle part ailleurs."
  exit 1
fi

# ── LE PONT ────────────────────────────────────────────────────────────────
# Chaque appel du natif au moteur doit trouver quelqu un. C est la question que
# personne ne posait le 4 aout, quand la moitie du moteur a disparu sans que
# rien ne proteste.
PONT=$("$NODE" "$BANC/garde-pont.js" 2>&1)
CODEP=$?
echo "$PONT"
if [ $CODEP -ne 0 ]; then
  echo "error: le pont entre l app et le moteur est casse — on ne livre pas ca."
  exit 1
fi

# ── LA PORTEE ──────────────────────────────────────────────────────────────
# garde-pont demande « la fonction existe-t-elle ? ». Celui-ci demande
# « peut-elle seulement s executer ? ». Le 6 aout, flSommeilData lisait un
# _argJour jamais declare des sa premiere ligne : elle existait, elle levait,
# et le try/catch du pont rendait « pas de donnees ». Ma nuit est restee vide
# deux jours, et rien nulle part ne le disait.
PORTEE=$("$NODE" "$BANC/garde-portee.js" 2>&1)
CODEV=$?
echo "$PORTEE"
if [ $CODEV -ne 0 ]; then
  echo "error: une fonction du moteur lit une variable qui n existe pas — l ecran s ouvrira vide."
  exit 1
fi

# ── LES ECRANS QUI ATTENDENT LE MOTEUR ─────────────────────────────────────
# Dino, le 13 aout, apres le cinquieme ecran corrige pour la meme raison : « je
# veux plus jamais que ca arrive ». Un ecran natif dont la charge vient du web
# et qui n a pas sa copie sur le disque reste vide tant que le pont n est pas
# monte — une seconde au mieux, davantage sur un telephone. Six fois le meme
# defaut, six fois signale par lui. Celui-ci ne peut plus entrer sans qu on
# reponde a la question : cache, ou raison ecrite de ne pas en avoir.
CACHES=$("$NODE" "$BANC/garde-caches.js" 2>&1)
CODEC=$?
echo "$CACHES"
if [ $CODEC -ne 0 ]; then
  echo "error: un ecran attendra le moteur pour s afficher, et personne ne l a decide."
  exit 1
fi

# ── LE MOTEUR DE SOMMEIL ───────────────────────────────────────────────────
SORTIE=$("$NODE" "$BANC/tous.js" 2>&1)
CODE=$?
# v1252 — UN SEUL REESSAI AVANT DE BLOQUER, ET C EST TOUT.
#
# Deux fausses alertes en une soiree, aucune reproductible : le banc ressortait
# rouge pendant la compilation et vert a la seconde d apres, sur les memes
# fichiers. La cause probable est un fichier lu pendant qu il etait encore en
# train d etre ecrit (copie de travail fraichement creee, compilation lancee
# dans la foulee).
#
# Le danger d un garde-fou intermittent est pire que son absence : on prend
# l habitude de le contourner, et le jour ou il a raison on ne l ecoute plus.
# Un reessai unique suffit — une vraie panne du moteur echoue DEUX fois, une
# lecture malheureuse ne se reproduit pas. On ne monte pas a trois : ce serait
# commencer a acheter du vert.
if [ $CODE -ne 0 ]; then
  echo "note: banc rouge au premier passage, second essai avant de bloquer."
  sleep 1
  SORTIE=$("$NODE" "$BANC/tous.js" 2>&1)
  CODE=$?
fi
if [ $CODE -ne 0 ]; then
  echo "$SORTIE" | sed 's/^/    /'
  echo "error: le moteur de sommeil ne passe plus son banc d essai. Une nuit ou une sieste est en train d etre faussee — on ne livre pas ca."
  exit 1
fi
echo "note: banc du sommeil : tout est vert."

# ═════════════════════════════════════════════════════════════════════════════
#  LE FEUILLETAGE PAR JOUR  —  v1396
#
#  POURQUOI, ET LE DEFAUT EXACT. Nuit du 10 au 11 aout 2026, Dino : « je vais
#  sur le 7, je reviens sur le 10, et le sommeil du 10 affiche 3h15 avec reveil
#  a 3h32 ». Des chiffres JUSTES sous la MAUVAISE DATE. Aucune erreur, aucune
#  trace, aucun ecran vide — la pire forme de panne, celle qui est credible.
#
#  La cause : le prechargement rangeait la journee courante sous la cle de la
#  veille, et la resservait instantanement au geste suivant. Deux mois sans que
#  rien ne puisse le contredire, parce qu une charge n avait pas a dire de quel
#  jour elle parlait.
#
#  CE QU ON FERME ICI — les trois facons de faire revenir ce defaut :
#    · effacer le banc (c est le scenario du 4 aout, a l identique) ;
#    · reintroduire un rangement AVEUGLE, sans jour nomme ;
#    · appeler le moteur pour une journee sans epingler le jour.
# ═════════════════════════════════════════════════════════════════════════════
BANC_JOURS="$RACINE/FLINTTests/JourneesFlintTests.swift"
if [ ! -f "$BANC_JOURS" ]; then
  echo "error: le banc du feuilletage (FLINTTests/JourneesFlintTests.swift) a disparu. C est lui qui tient les quatre invariants du magasin des journees, dont le piege de minuit que personne ne verra jamais a la main. On ne compile pas sans lui."
  exit 1
fi
for INV in testLeGrenierNeMentPasAuPassageDeMinuit \
           testReponseDepasseeNeRecouvrePasLaPlusFraiche \
           testJourInconnuNeRendRien \
           testChargeDUnAutreJourEstRefusee; do
  if ! grep -q "$INV" "$BANC_JOURS"; then
    echo "error: l invariant « $INV » a ete retire du banc du feuilletage. Chacun de ces quatre tests garde un defaut VECU : on ne les supprime pas, on les corrige."
    exit 1
  fi
done

CV="$RACINE/FLINT/ContentView.swift"
if [ -f "$CV" ]; then
  # Le rangement aveugle d avant la v1391 : une charge posee sous « le jour
  # courant » au lieu du sien. C est la ligne qui a rendu le mensonge permanent.
  if grep -q "cacheJours\[" "$CV"; then
    echo "error: « cacheJours[ » est de retour dans ContentView. C est le rangement AVEUGLE d avant la v1391 : il posait chaque charge sous le jour courant au lieu du sien, et resservait ensuite le mauvais jour sans jamais redemander. Passe par le magasin (rangerJournee), qui exige le jour de la charge."
    exit 1
  fi
  # Le controle d identite ne doit pas etre desarme.
  if ! grep -q "ControleJournee.verifier" "$CV"; then
    echo "error: le controle d identite des journees (ControleJournee.verifier) n est plus appele dans ContentView. Sans lui, une charge peut de nouveau se ranger sous un jour qu elle ne decrit pas — en silence."
    exit 1
  fi
fi
echo "note: feuilletage par jour : banc present, invariants en place."

# ═════════════════════════════════════════════════════════════════════════════
#  LA JOURNEE NE SE COUPE PAS A MINUIT
#
#  14 aout 2026, 00h21. Dino est sorti le 13 au soir, il n a pas dormi, il
#  regarde son telephone : calories a zero, effort a zero, activites de la
#  soiree disparues. WHOOP, lui, ecrit « AOUT 13 A AUJOURD HUI » et continue de
#  compter. Regle posee par Dino le jour meme, et sans exception : une journee
#  FLINT n est pas une date, c est la periode comprise entre deux sommeils
#  principaux. Pas de sommeil mesure = pas de nouvelle journee.
#
#  CE QU ON FERME ICI — les deux facons de faire revenir le defaut :
#    · retirer le moteur de journee logique d index.html ;
#    · laisser l accueil redemander directement le jour civil sans passer par lui.
#  Le banc `test-jour-logique.js`, lui, est deja exige plus haut avec les autres.
# ═════════════════════════════════════════════════════════════════════════════
if [ -f "$INDEX" ]; then
  if ! grep -q "DEBUT JOURNEE LOGIQUE" "$INDEX" || ! grep -q "FIN JOURNEE LOGIQUE" "$INDEX"; then
    echo "error: le moteur de la journee logique a disparu d index.html (bornes « DEBUT/FIN JOURNEE LOGIQUE »)."
    echo "error: sans lui, la journee redevient une date du calendrier et tout repart a zero a minuit."
    exit 1
  fi
  if ! grep -q "flJourLogique()" "$INDEX"; then
    echo "error: plus personne n appelle flJourLogique() dans index.html."
    echo "error: le moteur serait la sans que rien ne le lise — c est le pire des deux mondes."
    exit 1
  fi
fi
echo "note: journee logique : moteur present et consulte."

# ═════════════════════════════════════════════════════════════════════════════
#  LE PONT DECODE CE QUE LE MOTEUR ENVOIE  —  v1542
#
#  POURQUOI, ET LE JOUR EXACT. Le 15 aout 2026, la page Recuperation est restee
#  sur « Un instant » une journee entiere, sur le telephone de Dino. La cause :
#  en v1523, RecupData a recu une propriete native (`enAttente`) que son auteur
#  croyait « jamais decodee ». Le decodeur Swift synthetise exige pourtant une
#  cle pour CHAQUE propriete stockee — le moteur ne l envoyant jamais, chaque
#  charge Recup mourait en keyNotFound. Et comme le pont decodait en `try?`,
#  la mort etait MUETTE : ecran fige, journal vide, quatre heures de fouille
#  pour un defaut qu une ligne de journal aurait montre a la premiere seconde.
#
#  CE QU ON FERME ICI — les trois facons de faire revenir le defaut :
#    · reintroduire un `try?` nu sur une charge du pont (la panne muette) ;
#    · retirer flDecoderCharge, le seul decodeur qui trace ses refus ;
#    · retirer le banc du contrat, qui casse a la seconde ou une propriete
#      stockee non optionnelle se glisse dans un struct du pont.
# ═════════════════════════════════════════════════════════════════════════════
if [ -f "$CV" ]; then
  if grep -q "try? JSONDecoder().decode" "$CV"; then
    echo "error: un « try? JSONDecoder().decode » nu est revenu dans ContentView.swift (le pont)."
    echo "error: c est la panne muette du 15 aout : une charge refusee sans une trace, ecran « Un instant » pour toujours."
    echo "error: passe par flDecoderCharge(T.self, data, \"ecran\"), qui rend le meme optionnel mais journalise chaque refus."
    grep -n "try? JSONDecoder().decode" "$CV" | head -5 | sed 's/^/    /'
    exit 1
  fi
  if ! grep -q "func flDecoderCharge" "$CV"; then
    echo "error: flDecoderCharge a disparu de ContentView. C est le seul decodeur du pont qui laisse une trace quand une charge est refusee — sans lui, la prochaine panne de decodage sera muette, comme le 15 aout."
    exit 1
  fi
fi
if ! grep -q "class ContratDuPontTests" "$BANC_JOURS"; then
  echo "error: le banc du contrat du pont (ContratDuPontTests, dans JourneesFlintTests.swift) a disparu."
  echo "error: c est lui qui casse a la seconde ou une propriete stockee non optionnelle se glisse dans un struct de charge — au lieu de casser l ecran de Dino le soir meme."
  exit 1
fi
for INV in testLaReponseMinimaleDecodePartout \
           testLeRefusMinimalDesOutilsDecode \
           testLaQuestionDuReveilMinimaleDecode; do
  if ! grep -q "$INV" "$BANC_JOURS"; then
    echo "error: l invariant « $INV » a ete retire du banc du contrat du pont. Il garde un defaut VECU (15 aout) : on ne le supprime pas, on le corrige."
    exit 1
  fi
done
echo "note: contrat du pont : decodage trace, banc present."

# ═════════════════════════════════════════════════════════════════════════════
#  LE DOIGT NE JETTE JAMAIS UNE PAGE VRAIE  —  v1546
#
#  POURQUOI, ET LE JOUR EXACT. Le 15 aout 2026 au soir, Dino, deux captures :
#  « des que je clique sur la fleche de gauche, l interface passe sur un ecran
#  Un instant — le graphique ne s affiche pas ». Chaque fenetre (mode, recul)
#  jamais visitee JETAIT la page affichee (titre « — », plein ecran d attente)
#  pour attendre le moteur, et personne ne preparait les fenetres voisines.
#  C etait la deuxieme manifestation du meme vice dans la meme journee — le
#  matin, les pages datees ; le soir, les fleches de periode. Dino, les deux
#  fois : « je veux plus jamais ce bug ».
#
#  CE QU ON FERME ICI — les quatre facons de faire revenir le defaut :
#    · retirer la regle pure `decisionFenetre` ou son banc FenetreHebdoTests
#      (c est elle qui dit quand on garde la page et quand on repart a froid) ;
#    · debrancher la transition de l ecran (enTransition n est plus passe a
#      DetailHebdoView — la moitie d un chantier : code la, effet mort) ;
#    · debrancher le prechargement des fenetres voisines ;
#    · faire precharger par flOuvrirHebdo, qui POSTE : une preparation qui
#      poste finit posee a l ecran (lecon v1077/v1531) — le canal de
#      preparation doit rester flHebdoDetail en retour direct.
# ═════════════════════════════════════════════════════════════════════════════
if [ -f "$CV" ]; then
  if ! grep -q "static func decisionFenetre" "$CV"; then
    echo "error: la regle pure decisionFenetre a disparu de ContentView. C est elle qui interdit de jeter une page vraie pour attendre le moteur (le bug des fleches du 15 aout). On ne compile pas sans elle."
    exit 1
  fi
  if ! grep -q "Self.decisionFenetre(enCache:" "$CV"; then
    echo "error: decisionFenetre existe mais ouvrirHebdo ne l appelle plus — la moitie d un chantier : la regle est la, l effet est mort."
    exit 1
  fi
  if ! grep -q "enTransition: bridge.hebdoTransition" "$CV"; then
    echo "error: la transition n est plus passee a DetailHebdoView (enTransition: bridge.hebdoTransition). Sans elle, chaque fleche de periode rejette la page — c est le plein ecran « Un instant » du 15 aout qui revient."
    exit 1
  fi
  if ! grep -q "func prechargerFenetresVoisines" "$CV"; then
    echo "error: le prechargement des fenetres voisines a disparu de ContentView. Sans lui, chaque premiere visite d une fenetre paye le calcul sous le doigt — les fleches redeviennent lentes."
    exit 1
  fi
  if ! grep -q "self.prechargerFenetresVoisines(" "$CV"; then
    echo "error: prechargerFenetresVoisines existe mais personne ne l appelle — la moitie d un chantier."
    exit 1
  fi
  if ! grep -q "try{flHebdoDetail(" "$CV"; then
    echo "error: le prechargement ne passe plus par flHebdoDetail en retour direct. Une preparation qui passe par flOuvrirHebdo POSTE sa charge et finit posee a l ecran (lecon v1077/v1531)."
    exit 1
  fi
fi
if ! grep -q "class FenetreHebdoTests" "$BANC_JOURS"; then
  echo "error: le banc FenetreHebdoTests a disparu de JourneesFlintTests.swift. C est lui qui fige « le doigt ne jette jamais une page vraie », cas par cas."
  exit 1
fi
for INV in testLaFenetreEnCacheSeSertImmediatement \
           testUnePageVraieNeSeJetteJamaisPourLaMemeMetrique \
           testUneAutreMetriqueRepartAFroid \
           testMinuitPasseRepartAFroid \
           testSansPageVraieLAttenteEstHonnete; do
  if ! grep -q "$INV" "$BANC_JOURS"; then
    echo "error: l invariant « $INV » a ete retire du banc des fenetres. Il garde un defaut VECU (15 aout au soir) : on ne le supprime pas, on le corrige."
    exit 1
  fi
done
echo "note: fenetres des graphiques : regle pure, transition branchee, voisines preparees."


exit 0
