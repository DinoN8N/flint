# « Marche » se mérite — le nom d'une activité détectée

*20 septembre 2026. Renvoyé depuis `FLINT/web/index.html` (`nomDetecte`), où il
ne reste que quatre lignes : le fichier vit à douze lignes de son plafond.*

## La demande

Dino : « à chaque fois que je fais de la musculation, il me détecte une marche.
[…] S'il y a un doute, je préfère qu'il mette **activité** que marche. Il ne
peut pas deviner que c'était de la muscu, mais je préfère qu'il mette juste
activité et qu'après on puisse modifier nous-mêmes. »

## Le mécanisme, et pourquoi ce n'est pas un réglage raté

Le détecteur exige **`MARCHE_FORTE` = 40 pas/min** pour DÉCLARER une marche,
mais il la **PROLONGE** tant que la cadence reste au-dessus de
**`MARCHE_FAIBLE` = 18**. Une séance de salle tient les 18 sans jamais tenir
les 40 : on marche entre les machines, on se repose, on recommence. La fenêtre
qui en sort est **juste** — elle épouse la durée de la séance — mais
l'étiquette est fausse.

C'est pourquoi on ne touche PAS aux bornes horaires : elles font correctement
leur travail. On ne corrige que le mot.

## La mesure (131 marches détectées du relevé du 16 septembre)

| cadence | marches | minutes cumulées |
|---|---|---|
| 0–20 pas/min | 27 | 1 449 |
| 20–40 | 44 | 2 822 |
| 40–60 | 37 | 1 562 |
| 60–80 | 14 | 1 098 |
| 80+ | **9** | 421 |

Médiane **37 pas/min** quand une marche réelle en fait ~100. **71 sur 131**
sous le seuil de déclaration. La pire : **94 minutes pour 118 pas**, soit
1,3 pas/min — quelqu'un d'assis. Les deux séances de Dino du 19 septembre :
73 min à 23,7 pas/min et 75 min à 28,2.

## La règle

> Si le segment ne TIENT pas la cadence qu'il a fallu pour le déclarer, ce n'est
> pas une marche, c'est une activité.

Aucun seuil neuf : c'est `MARCHE_FORTE`, celui qui existe déjà. Sur le relevé,
**47 segments** deviennent « Activité » et **69** restent « Marche ».

## Ce qui ne bouge pas, et c'est le vrai risque gardé

- Les séances nommées par le détecteur **cardiaque** (Football, Musculation,
  Course, Randonnée…) : hors d'atteinte. Le filtre est le NOM (`Marche` /
  `Activité`), jamais `auto`, sinon la règle les emporterait toutes.
- Les séances de la **montre**, du **GPS**, et les **saisies à la main**.
- **La fiche** : « Activité » ouvre la MÊME fiche que « Marche » — durée, pas,
  part du jour, calories, cœur. C'est tout ce qui est mesuré. La fiche
  d'effort serait un contresens : sa courbe mentirait sur 34 % de couverture
  cardiaque (voir l'en-tête de `marche.js`).

## La limite assumée

**Une séance déjà en base n'est pas renommée.** `flReconcilierSeances` garde
l'existant — c'est ce qui protège une correction à la main — et il reconstruit
le nom de surface depuis la contribution rangée dans `srcs`. Muter `x.name`
avant réconciliation ne tient donc pas : mesuré le 20 septembre, la rangée
repart avec son ancien nom.

Conséquence : la règle vaut pour les détections à VENIR. Sur le relevé, 37
rangées déjà stockées gardent « Marche » malgré une cadence basse.

Rattraper l'historique demanderait la purge + redétection de la migration
v1419 (`sessions_<K>` filtré sur `auto && source==='pas'`). **Non fait**, et
délibérément : redétecter soixante journées ne renomme pas, ça **redétecte** —
des activités peuvent apparaître et disparaître. Le rapport risque/bénéfice ne
le justifie pas pour un mot.

## Ce qui reste à faire

**« Changer le sport » n'existe pas.** Le menu « … » de la fiche offre
aujourd'hui « Modifier l'activité » (les HEURES — son propre commentaire le
dit) et « Supprimer ». La seconde moitié de la demande de Dino — poser
soi-même « Musculation » sur une activité détectée — demande une entrée de
menu, la liste du catalogue, et une écriture marquée `auto:false` pour que le
détecteur ne l'écrase pas au recalcul. C'est du **natif**, donc une pose.

## Bancs

- `FLINT/web/tests/test-nom-activite.js` — la règle, moteur monté, après purge
  (330 vérifications). Échoue sur l'ancien moteur : 50 rouges.
- `FLINT/web/tests/test-fiche-marche.js` — le contrat de la fiche, mis à jour :
  les DEUX noms l'ouvrent, tout le reste du catalogue est épargné.
