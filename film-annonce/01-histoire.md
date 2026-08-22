# FLINT — Film d'annonce
## Document 1 : l'histoire

> Ce document ne contient **aucune** indication de production : pas de prompt, pas de preset,
> pas de découpage technique, pas de sound design. Uniquement le récit.
> Le découpage plan par plan viendra dans le document 2, une fois l'histoire validée.

---

## A. L'histoire telle qu'elle est écrite aujourd'hui

Dépouillée de toute sa mécanique, voici ce que raconte le script actuel :

> Un aigle ouvre l'œil dans une chambre de verre, au fond d'un laboratoire immense et silencieux.
> Il n'est pas prisonnier : il est en calibration. Trois anneaux de lumière tournent autour de lui.
> La paroi s'ouvre d'elle-même. Il déploie ses ailes.
>
> On devient l'aigle. Il traverse le bâtiment en vol.
> Un couloir long et lent, aux murs parcourus d'ondes — le sommeil.
> Une salle rouge où un homme s'épuise sur un tapis, cerné de lignes de lumière — l'effort.
> Un puits vertical qu'il remonte à toute vitesse, anneaux de données défilant vers le bas — la récupération.
> À chaque salle, une donnée s'inscrit au passage : 7h42, 184 BPM, 94.
>
> Tout en haut du puits, un point de lumière blanche. Il crève la verrière.
> Le verre explose, les éclats restent suspendus dans le soleil, quelques étincelles parmi eux.
> Silence total.
>
> Il monte. Le toit s'éloigne, les nuages, le ciel bleu qui vire au noir.
> Il se met en orbite. La Terre occupe le bas du cadre. Un petit objet métallique gravite à côté d'elle.
> C'est la montre.
>
> Raccord : la courbure de la Terre devient la courbure d'un poignet.
> L'écran s'allume. Un chiffre : 48. Noir. Logo.

**Structure** — Trois mouvements : l'éveil (chambre), la traversée (les trois salles), la sortie (verrière, ciel, orbite, poignet).

**Thèse** — « Un aigle voit quatre à cinq fois mieux qu'un humain. C'est la promesse de Flint :
percevoir ce que ton corps fait sans que tu le saches. » Le spectateur ne regarde pas la montre,
il *est* l'aigle pendant trente secondes.

**Instrument narratif unique** — le battement de cœur. 48 → 44 → 172 → 78 → silence → 52 → 48.
La courbe du cœur *est* la dramaturgie.

**Signature du titre** — Flint = silex. Le mot n'apparaît qu'une fois dans l'image :
les étincelles dans le verre brisé.

---

## B. Ce que dit le produit (relevé dans le dépôt)

| Point | Réalité constatée dans `index.html` / `README.md` |
|---|---|
| Nature | Application web (PWA mono-fichier) + wrapper Android. **Aucun hardware.** |
| Capteur | Une **Polar Loop** que l'utilisateur possède déjà, lue via Health Connect. |
| Données | 100 % locales (`localStorage`), fonctionne hors-ligne, pas de compte, pas de cloud. |
| Promesse centrale | « **Flint apprend ta baseline.** » Score débloqué après **4 nuits portées**. |
| État d'amorçage | L'app affiche littéralement `EN CALIBRATION · n/4 NUITS`. |
| Objets visuels | **Trois anneaux** : récup / sommeil / effort. |
| Palette | Crème `#F3EFE7`, encre `#15140F`, **accent braise `#F0492E`**, vert, ambre, indigo. |
| Typo | Anton (display, condensé lourd) + Inter. |
| Ton produit | « Ton corps a bien encaissé. » / « Priorise le repos. » — direct, sobre, tutoiement. |

---

## C. Les cinq écarts entre l'histoire et le produit

**1. Le film vend une montre. Flint n'est pas une montre.**
Le plan final montre en macro un « prototype Flint » au poignet. Cet objet n'existe pas.
Et en le montrant, le film jette par la fenêtre le meilleur argument commercial du produit :
*tu n'as rien à acheter, le capteur est déjà à ton poignet.* Un film d'annonce qui promet
un objet inexistant se paie au premier clic sur le site.

**2. La palette est inversée.**
Le film est spécifié « tout en bleu froid, blanc, cyan ». Le produit est crème et braise.
Flint veut dire silex : une pierre qui fait du **feu**. Le seul plan chaud du script actuel
(les étincelles du plan 6) est traité comme une exception ; c'est en réalité la marque elle-même.

**3. La métaphore de l'aigle vise à côté.**
L'aigle, c'est l'acuité instantanée : voir loin, voir net, tout de suite.
Flint, c'est l'inverse : une perception qui **s'accumule**. Quatre nuits avant le premier score.
Trente jours de baseline. Des corrélations sur des semaines. Le film raconte un super-pouvoir
immédiat pour un produit dont la valeur est la patience.

**4. Le laboratoire dit le contraire du produit.**
Un labo, c'est une institution qui te mesure. Le script s'inquiète lui-même de l'effet cage
(note du plan 2). Cette inquiétude est un symptôme : Flint est un produit sans compte, sans cloud,
sans serveur — les données ne quittent pas le téléphone. Le décor raconte exactement l'inverse.

**5. À la 30e seconde, on ne sait pas ce qu'est Flint.**
Trente secondes, pas de dialogue, pas d'interface avant la 27e seconde, et un objet non identifiable.
Pour un film d'atmosphère de marque installée, c'est tenable. Pour l'**annonce de sortie**
d'une app gratuite que personne ne connaît encore, le spectateur sort sans savoir quoi faire.

---

## D. Ce qui est excellent et doit survivre à la réécriture

- **Le cœur comme unique instrument narratif.** L'idée est juste, elle est rare, et c'est
  littéralement la donnée du produit. On garde.
- **Le silence d'une seconde au pic.** C'est le meilleur geste de montage du script. On garde.
- **La calibration.** Le script a inventé une « chambre de calibration » ; le produit affiche
  `EN CALIBRATION · 2/4 NUITS`. C'est un cadeau, ce n'est pas un hasard à jeter.
- **Les trois anneaux** qui tournent autour du sujet au plan 2 : ce sont les trois anneaux de l'app.
- **La règle « un seul chiffre lisible par plan ».** Discipline juste.
- **La structure en trois mouvements** et la traversée sommeil / effort / récupération :
  c'est exactement l'architecture du produit.

---

## E. Question ouverte avant le découpage

Quatre décisions commandent les neuf plans. Elles sont posées à part et doivent être
tranchées avant d'écrire une seule ligne de découpage :

1. Que montre-t-on à la fin, puisqu'il n'y a pas de montre ?
2. Froid ou chaud ?
3. Garde-t-on l'aigle, et pour dire quoi ?
4. Le spectateur doit-il comprendre ce que fait Flint, ou seulement le ressentir ?
