# « Marche » se mérite — le nom d'une activité détectée

*20 septembre 2026, deux passes dans la journée. La règle vit désormais dans
`FLINT/web/flint-classement.js` ; `index.html` n'en garde que les appels — il
vivait à quatre lignes de son plafond quand ce chantier a commencé, il en a
autant à la fin.*

---

## I · La passe du matin — la cadence moyenne

### La demande

Dino : « à chaque fois que je fais de la musculation, il me détecte une marche.
[…] S'il y a un doute, je préfère qu'il mette **activité** que marche. »

### Le mécanisme

Le détecteur exige **`MARCHE_FORTE` = 40 pas/min** pour DÉCLARER une marche,
mais il la **PROLONGE** tant que la cadence reste au-dessus de
**`MARCHE_FAIBLE` = 18**. Une séance de salle tient les 18 sans jamais tenir
les 40 : la fenêtre qui en sort est **juste** — elle épouse la durée de la
séance — mais l'étiquette est fausse.

On n'a donc **pas** touché aux bornes horaires. On ne corrige que le mot.

### La règle posée

> Si le segment ne TIENT pas en moyenne la cadence qu'il a fallu pour le
> déclarer, ce n'est pas une marche, c'est une activité.

Sur le relevé du 16 septembre : **47 segments** deviennent « Activité »,
**69** restent « Marche ». La musculation est écartée — ses quatre séances
étiquetées font 21 à 33 pas/min.

---

## II · La passe de l'après-midi — le football

### Ce que la règle du matin ne pouvait pas attraper

Dino, quelques heures plus tard : « je suis allé jouer tranquillement au
football avec des amis […] Flint a pourtant classé automatiquement cette
période comme une marche. » C'était une brésilienne — beaucoup de petits
déplacements, des arrêts, quelques accélérations.

Les trois footballs étiquetés du relevé, mesurés :

| jour | durée | pas | cadence | règle du matin |
|---|---|---|---|---|
| 13 sept. | 75 min | 5 587 | **74** pas/min | « Marche » |
| 14 sept. | 61 min | 3 370 | **55** pas/min | « Marche » |
| 15 sept. | 153 min | 7 474 | **49** pas/min | « Marche » |

Tous **au-dessus** du seuil. **Une moyenne ne dit rien d'une alternance** :
courir dix secondes puis s'arrêter, pendant une heure, ressemble en moyenne à
une marche tranquille.

### Les trois critères, et aucun n'invente de seuil

1. **La cadence moyenne tient `MARCHE_FORTE`.** La règle du matin, conservée.
2. **Elle le tient PARTOUT, pas en moyenne.** Au moins **les trois quarts** des
   fenêtres mesurées du segment (minutes, ou tranches quand la montre n'a
   envoyé que des blocs) sont à `MARCHE_FORTE`. La fraction est déjà celle de
   `MARCHE_MIN_PAS`. **C'est le critère neuf**, et le seul qui sépare un
   terrain de foot d'un trottoir.
3. **Le cœur ne contredit pas.** Le battement le plus haut reste sous la **Z2**
   que `flZonesBpm` calcule sur la réserve cardiaque de la personne ; et la
   fenêtre n'est pas de celles que `flFcFiable` déclare **incohérentes**
   (« N minutes à cadence de course avec un pouls sous la Z2 100 % du temps »).

### La mesure — `outils/audit-nom-detection.js`

Sur les **127 segments** du relevé du 16 septembre, jugés contre les séances que
Dino a lui-même nommées :

| règle | « Marche » | faux sur un sport connu |
|---|---|---|
| ① seule (le matin) | 85 | **13** |
| ① + ② | 23 | 8 |
| ① + ② + ③ | **15** | **0** |

Les trois footballs tombent, les quatre musculations aussi, les sept courses
avec — une course n'est pas une marche non plus. **Aucune des quinze marches
survivantes n'est un sport étiqueté.**

### Ce que ça coûte, et il faut le dire

85 segments s'appelaient « Marche », il en reste 15. Les 70 autres deviennent
« Activité détectée ». **Aucune mesure ne bouge** — bornes, pas, calories,
effort, au chiffre près — et l'utilisateur nomme chacune d'un doigt.

### Deux absences, deux traitements

- **② est une PREUVE.** Sans répartition des pas dans le temps, rien n'est
  démontré : « Activité ».
- **③ est une CONTRADICTION.** Sans courbe cardiaque, rien ne contredit : on ne
  dégrade pas un segment parce qu'un capteur s'est tu.

---

## III · Le défaut que le banc a trouvé, et qui n'était pas un nom

La première version des appels n'était pas gardée par un `typeof`. Sur le banc
du 23 août, la descente de 10h39 — **73 minutes, 5 073 pas** — n'est pas devenue
« Activité » : elle a **DISPARU**.

`syncSessions` enveloppe la détection au pas dans un `try/catch` muet. Un
`ReferenceError` sur une seule fenêtre emporte **toutes** les marches de la
journée, sans une trace. Le module peut manquer pour de vraies raisons : une
mise à jour OTA à moitié arrivée, un cache de service worker, un banc qui
prélève une fonction sans son voisin.

**Le repli est le nom conservateur** : sans le module, aucune preuve n'est
calculable, donc « Activité ». La rangée vit, ses mesures sont intactes.

---

## IV · L'UX — la carte, le doigt, la réponse

### La carte

Le moteur écrit **`Activité`**, l'écran lit **« Activité détectée »**, et l'écart
est voulu : le mot stocké est une **clé** que `flEtatActivite` et
`flMarcheDetail` testent au caractère près. Le rallonger en base casserait les
deux.

La seconde ligne, elle, redevient la provenance (« AUTO »). « C'ÉTAIT QUOI ? »
y vivait depuis la v1704 ; depuis que le NOM le dit, l'écrire deux fois
contredisait la demande — « la carte doit apparaître exactement comme une
activité classique ».

### Le doigt

`RangeeJournee.aNommer` / `demanderLeNom`, appelés **à l'identique** par la
frise et par la page Effort. La feuille est celle de la maison — « Sélectionner
une activité », posée à la racine depuis la v1475, avec sa recherche, ses
récentes, ses 148 activités. **Aucun écran neuf.**

### La suite

La destination voyage **avec** la question (`demander(_:puis:)`) : posée par le
moteur, la feuille rend la main à l'écran du moment ; posée par un doigt, elle
mène au détail. Et **seulement une fois le moteur revenu** — ouvrir au clic
ouvrirait la fiche sur le nom qu'on vient de corriger.

Refermer sans répondre désarme la suite : l'activité reste inconnue, rien ne
s'ouvre.

---

## V · L'apprentissage — un corpus, pas une décision

`flNoterCorrectionActivite` range la réponse **avec la signature capteurs de la
fenêtre, relue par le MOTEUR** — l'écran ne porte aucune mesure et n'en recopie
aucune. Plafond dur à **120 entrées** : la base du web vit sous 5 Mo et l'a déjà
atteint le 23 août.

**Rien ne le relit pour décider d'un nom**, et c'est la consigne de Dino dans la
même demande : « ne jamais utiliser cet apprentissage pour commencer à
classifier agressivement des activités ambiguës ».

---

## VI · L'historique — la bascule existe, personne ne l'appelle

`flReconcilierSeances` **garde l'existant** : c'est ce qui protège une
correction à la main, et c'est donc aussi ce qui fige les anciens noms. La règle
ne vaut que pour les détections **à venir** — un football déjà rangé sous
« Marche » le reste.

`window.flRejugerNomsDetectes()` **rejuge, elle ne redétecte pas.** Aucune
activité n'apparaît, aucune ne disparaît, aucune borne ne bouge. Elle n'écrit le
nom que dans un sens (« Marche » → « Activité »), jamais l'inverse, et elle
épargne : ce qui porte `srcs.user`, tout ce qui n'est pas `auto` + `source:'pas'`,
et les jours dont les pas à la minute ne sont plus sur le disque.

Elle corrige le nom **aux deux endroits** — la vue plate ET la contribution
`srcs.auto`. C'est le point de mécanique qui avait fait échouer la tentative du
matin : muter `x.name` seul ne tient pas, la réconciliation le reconstruit.

**Mesuré sur le relevé du 16 septembre**, base entière, 120 jours :

```
avant  {"Marche":133, "Renforcement":1, "Football":1, "Badminton":1, "Activité":1}
rejugé · 133 marches lues · 73 devenues Activité · 53 sans preuve (inchangées)
après  {"Marche":60, "Activité":74, "Renforcement":1, "Football":1, "Badminton":1}

rangées 193 → 193 · pas 346 390 → 346 390 · kcal 18 430 → 18 430
effort 46,8 → 46,8 · bornes identiques : true
```

**Elle n'est appelée par personne**, et c'est délibéré : réécrire soixante
journées de données rangées n'est pas une décision de code. À la console, ou à
brancher sur un geste si Dino le demande.

---

## Ce qui ne bouge pas

- Les séances nommées par le détecteur **cardiaque** (Football, Musculation,
  Course…) : le filtre est le NOM, jamais `auto`.
- Les séances de la **montre**, du **GPS**, les **saisies à la main**.
- **La fiche** : « Activité » ouvre la MÊME fiche que « Marche ».
- Les bornes, les pas, les calories, l'effort, les zones.

## Bancs et outils

| fichier | ce qu'il garde |
|---|---|
| `FLINT/web/tests/test-nom-activite.js` | la RÈGLE, jugée contre les séances que Dino a nommées — §4 épingle le football par son nom |
| `FLINT/web/tests/test-activite-detectee.js` | la CHAÎNE : la question se pose, la réponse s'écrit, aucune mesure ne bouge, la bascule renomme sans redétecter |
| `FLINT/web/tests/garde-cycle-natif.js` | `needsClassification` nomme la carte, commande le doigt, et la réponse ouvre le détail |
| `FLINT/web/tests/test-hierarchie-noms.js` §5 | le détecteur de pas ne connaît que DEUX noms, et ne nommera jamais un sport |
| `FLINT/web/tests/test-metriques-23aout.js` | la descente survit au renommage, au kcal près |
| `outils/audit-nom-detection.js` | la mesure : chaque règle candidate, contre la vérité terrain |

Les deux premiers sont inscrits dans `tous.js` — ils n'y étaient pas le matin,
et une sentinelle que personne ne lance ne garde rien.

**Huit bancs ont dû être recollés au corpus** (`flint-classement.js` chargé à
côté du code prélevé). C'est la panne des onze bancs du découpage de
`flint-zones.js`, rejouée : un banc qui prélève une fonction sans son voisin
mesure un moteur amputé.
