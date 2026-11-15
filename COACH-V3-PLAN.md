# Coach v3 — Claude, des états d'attente vrais, des blocs visuels

15 nov. 2026, branche `coach-claude-15nov`. Rien n'est déployé. Rien n'a tourné contre un vrai modèle : tout ce qui suit est vérifié avec des bancs sans réseau (§ 8), pas en production.

La demande des fondateurs : l'attente doit dire ce que le Coach lit vraiment (« Analyse de ta récupération… » s'affichait à chaque question), le Coach doit pouvoir montrer des graphiques préfaits que l'app remplit, il doit pouvoir tourner sur Claude Opus 5.5, et il doit être le meilleur coach possible.

---

## 1. Comment une question circule aujourd'hui (Gemini)

Le serveur ne garde rien. À chaque aller, l'app envoie tout le fil (`contents`, au format Gemini) et le serveur rend un seul tour.

1. **L'entrée.** `api/coach.js` vérifie le secret et la signature, applique le rate-limit et le plafond, vérifie la taille du corps, allège les réponses d'outils trop lourdes, puis lit `ton`, `langue`, `capacites`, `instantane`, `natif`, `faits`, `memos`, `profilTexte` et `memoireTexte`.
2. **V1 ou V2.** `outilsPour` (`_coach-tools.js`) choisit le jeu d'outils.
   - **V2** si le binaire annonce `capacites.outils` et `capacites.natif` **et** que la porte est ouverte (`COACH_V2=1` avec l'appareil listé, ou `COACH_FACTURATION=1`).
   - **V1** sinon : les 8 outils que toute app posée sait exécuter.
3. **Le préchargement** (`prechargement`, `_coach-histoire.js`). Sur une question nouvelle et non anodine, en V1, ou en V2 sans instantané, le serveur n'appelle pas Gemini. Il rend lui-même un tour d'outils fabriqué, marqué `⟦flint-pre:v1⟧` :
   - V1 : `getRecoveryContext`, `getSleepHistory(7)`, `getTrainingLoad`, `getNutritionToday`, `getActivityHistory(2)` ;
   - V2 : `getDay(0)`.

   L'app les exécute avec ses moteurs, puis rappelle le serveur.
4. **La préparation** (`preparerPourGemini`).
   - Les tours marqués sortent du fil. Leurs résultats partent dans le prompt système, sous « DONNÉES DU JOUR ».
   - Les réponses de la question en cours sont réécrites en unités d'écran (`_coach-adaptateurs.js`).
   - Les charges des questions précédentes deviennent un talon, et le fil est borné à 60 Ko.
5. **Le prompt** (`_coach-prompt.js`).
   - Un **préfixe fixe** d'environ 20 Ko : identité, manuel FLINT, écrans, lecture des données, politique d'outils, mémoire, forme, santé.
   - Une **queue** variable : langue et titres, ton, faits confiés, échanges récents, données (instantané V2 ou DONNÉES DU JOUR), briefing, rappel de forme.
6. **L'appel à Gemini**, en JSON ou en flux (`flux: true`).
   - Si Gemini demande des outils, la réponse est `mode:'outils'` avec `appels`, `tourModele` et `libelles`.
   - Sinon, c'est `mode:'reponse'` avec `texte`, `suites`, `retenir` (V2), `memo`, `v` et `appelsGemini`. Les lignes « Suites : » et « Retenir : » sont détachées du texte.
   - Au 4e tour d'outils, Gemini est appelé sans droit aux outils.
7. **La mémoire.**
   - `faits` : ce que la personne a confié. Le téléphone l'écrit, via l'outil `saveMemoryFact` (V1) ou la ligne « Retenir : » (V2).
   - `memos` : le résumé déterministe de chaque échange, calculé par le serveur sans modèle et rangé par le téléphone.

## 2. Pourquoi « Analyse de ta récupération… » sortait à chaque question

C'est le serveur, pas le modèle. Deux causes s'additionnent.

1. **Le préchargement V1 commence toujours par `getRecoveryContext`.** Toute question nouvelle reçoit d'abord le tour fabriqué du § 1.3, avant que Gemini voie quoi que ce soit, et son premier appel est toujours `getRecoveryContext`. Que la question porte sur un repas, une séance ou une définition, la première réponse de l'app est donc « lis la récupération ». Le prompt ne pousse pas vers cet outil : c'est le routage. Et le modèle ne peut rien y faire, puisqu'il n'est pas encore appelé.
2. **`libelles` est une table fixe, indexée par nom d'outil.** `LIBELLES.fr.getRecoveryContext` vaut « Analyse de ta récupération… », quels que soient la question et les arguments. `getSleepHistory(7)` et `getSleepHistory(14)` donnent la même phrase, « Lecture de tes nuits… ».

Ce qui désigne la cause : `getRecoveryContext` n'existe qu'en V1. Les fondateurs voient la phrase, donc leur app est servie en V1, donc le préchargement passe à chaque question. Je n'ai pas le code iOS. L'idée que l'app affiche le libellé du premier appel (`libelles[appels[0].name]`, ou son repli `CoachActivite`) est donc une **déduction**, pas une lecture du code.

## 3. Ce qui change en v3, et ce qui ne change pas

**Gemini (la production) : rien.** Sans `COACH_FOURNISSEUR`, le chemin est identique à l'octet. Le banc `tests/test-coach-or-gemini.js` le vérifie sur 18 scénarios, contre un or écrit par le code d'avant (commit `848f416`). Le préchargement, les libellés et le prompt Gemini restent tels quels. Corriger aussi la phrase côté Gemini est une décision à part (§ 9).

**Avec `COACH_FOURNISSEUR=anthropic` (Coach v3) :**

- **Plus de préchargement.** Le modèle demande seulement ce dont la question a besoin. Un bloc fixe ajouté au préfixe, `PROMPT_V3` (`_coach-v3.js`), le lui dit :
  - une question sur un repas n'appelle pas les nuits ;
  - un salut n'appelle aucun outil ;
  - il prend la plus petite fenêtre qui répond ;
  - il n'écrit aucun texte avant un appel d'outil.
- **Un libellé vrai par appel**, arguments compris, en fr, en et es, par exemple :
  - « Lecture de tes 7 dernières nuits… » ;
  - « Comparaison de tes séances de course des 14 derniers jours… » ;
  - « Lecture de ta journée d'hier… » ;
  - « Lecture de tes 30 derniers jours (VFC, récupération, sommeil…)… ».

  Ces phrases écrasent, dans `libelles`, l'entrée de l'outil demandé : une app posée qui affiche `libelles[nom]` montre donc la vraie lecture sans changement de code. Viennent en plus :
  - `etapes` : une phrase par appel ;
  - `redaction` : la phrase qui suit, par exemple « Rédaction de ta réponse à partir de tes 7 dernières nuits et ta charge… ».
- **Des blocs visuels** choisis dans un catalogue fermé (§ 5), validés par le serveur avant l'envoi.
- **Claude Opus 5.5** par l'API Messages, en `fetch` direct (§ 4).

Le contrat vers l'app ne change pas : mêmes champs, mêmes formes de flux (`d`, `fin`, `erreur`), même `tourModele` au format Gemini.

## 4. Claude : le choix technique, et les variables à poser

**Pas de paquet npm.** Le dépôt n'en a aucun (pas de `package.json`) et Gemini est déjà appelé en `fetch` direct. Les formes de l'API Messages (en-têtes, blocs, événements SSE, `anthropic-version: 2026-10-21`) viennent de la documentation de la compétence `claude-api`, pas de mémoire.

**Les fichiers :**

| Fichier | Rôle |
|---|---|
| `api/_coach-claude.js` | Traduction, appels, lecture du flux (pur ; il ne lit que les variables `COACH_*` et `ANTHROPIC_*`). |
| `api/_coach-tour-claude.js` | Un tour Claude de bout en bout, en JSON et en flux. |
| `api/_coach-v3.js` | Libellés, catalogue des blocs, complément du prompt. |
| `api/coach.js` | Environ 50 lignes : choix du fournisseur, préchargement coupé en v3, branchement. |

**La traduction, dans les deux sens :**
- `functionCall` devient `tool_use`, et `functionResponse` devient `tool_result`.
- Chaque réponse est appariée à son appel par id, puis par nom, puis par rang (le rang seulement pour une réponse sans nom).
- Une réponse manquante devient un `tool_result` en erreur ; une réponse sans appel est retirée.
- Deux messages de même rôle sont fondus, et le fil finit toujours par `user`, car Opus 5.5 refuse un message assistant en dernier.

**La réflexion de Claude.** Opus 5.5 lie ses blocs de réflexion à la conversation, et notre serveur réécrit l'historique (talons, coupes au budget, données dans le système). Donc :
- les blocs bruts d'un tour d'outils voyagent dans le `thoughtSignature` du premier `functionCall`, préfixés `flint-claude:v1:` et encodés en base64. C'est le seul champ dont on sait que l'app le renvoie intact : Gemini 3 répond 400 sans lui ;
- seuls ceux de la question en cours sont renvoyés à l'API. Retirer une série de tête est permis ;
- la requête porte `thinking.block_binding.prefix_mismatch_behavior: "drop_block"` : un bloc devenu invalide est abandonné par l'API au lieu de produire un 400.

**Le reste de la requête :**
- `output_config.effort` est posé explicitement (le défaut d'Opus 5.5 est `medium`) et `max_tokens` vaut 16 000, réflexion comprise ;
- jamais de `temperature` ni de `tool_choice` forcé ; au 4e tour, `tool_choice: none` ;
- le secours côté serveur est demandé (`fallbacks: "default"`), et un refus (`stop_reason: refusal`) devient une phrase polie avec `refus: true`. Le fil reste vivant ;
- le système est envoyé en deux blocs : le préfixe, mis en cache (`cache_control`), puis la queue.

**Les variables, sur Vercel :**

| Variable | Valeur | |
|---|---|---|
| `COACH_FOURNISSEUR` | `anthropic` | **obligatoire** ; absente, c'est Gemini |
| `ANTHROPIC_API_KEY` | la clé | **obligatoire** ; absente : 500 « configuration serveur incomplète » |
| `COACH_MODELE` | `claude-opus-5-5` par défaut | facultatif |
| `COACH_EFFORT` | `medium` par défaut ; `low` / `high` / `xhigh` / `max` | facultatif |
| `COACH_CLAUDE_SECOURS` | `0` pour couper le secours serveur | facultatif |

Les variables existantes (`FLINT_APP_SECRET`, `COACH_V2*`, `COACH_FACTURATION`, `COACH_COMPACTION`, `COACH_PLAFOND_JOUR`, la signature) gardent leur rôle. `COACH_PRECHARGE` est ignorée en v3. Pour revenir à Gemini, il suffit de retirer `COACH_FOURNISSEUR`.

## 5. Le contrat `blocs` (côté app)

Le modèle ne dessine rien et ne donne aucune valeur. Il choisit **quoi montrer**, et l'app le dessine avec **ses** données.

**Où il arrive.** Dans une réponse `mode:'reponse'` (JSON, ou `fin` du flux) : `blocs`, un tableau de 0 à 2 objets.

**Comment le modèle l'écrit.** Une ligne `Blocs : [ … ]`, placée juste avant « Retenir : » ou « Suites : ». Le serveur la retire de `texte` et du flux, et la garde dans `tourModele`.

**Ce qui est retiré.** Tout bloc qui n'est pas exactement au catalogue :
- clé inconnue, type inconnu, valeur hors bornes ;
- chiffre (de n'importe quelle écriture), balise ou plus de 60 caractères dans un titre ;
- plus de 2 blocs.

Le nombre de blocs retirés part au journal (`blocsRetires=`). Un message anodin n'a jamais de bloc.

Le schéma JSON exact est `BLOCS_SCHEMA` (`api/_coach-v3.js`). Le banc vérifie qu'il permet exactement ce que le validateur permet.

| `type` | Champs | Ce que l'app dessine |
|---|---|---|
| `serie` | `metrique`, `jours` ∈ 7 \| 30 \| 90, `repere`? ∈ `normale` \| `cible` \| `aucun`, `titre`? | La courbe quotidienne de la métrique sur les N derniers jours, aujourd'hui compris s'il est mesuré, avec les trous laissés en trous. `normale` : la plage ou la référence que l'écran de cette métrique imprime. `cible` : la cible que l'app porte (effort, besoin, plan kcal, objectif de pas). |
| `comparaison` | `metrique`, `jours` ∈ 7 \| 30 \| 90, `titre`? | La moyenne des N derniers jours face aux N d'avant, calculée comme les Tendances. L'effort se moyenne par jour, il ne s'additionne pas. |
| `seance` | `jour` (−90…0) **ou** `date` `AAAA-MM-JJ`, `id`?, `debut`? `HH:MM`, `titre`? | La fiche de la séance, celle que `getSession` décrit. Introuvable : rien. |
| `zones` | `portee` ∈ `jour` \| `seance` \| `semaine`, `jour`/`date` (exigé pour `seance`), `id`?, `debut`?, `titre`? | Les minutes par zone Z0–Z5, pour la journée, la séance ou les 7 derniers jours. Les minutes s'additionnent, l'effort non. |
| `nuit` | `jour`/`date`? (aucun = la dernière nuit), `titre`? | Les jalons de la nuit rangée sous le jour du réveil J : coucher, réveils, lever, stades. |
| `etapes` | `titre`, `etapes`: 2 à 5 × {`titre` ≤ 40, `texte` ≤ 160} | Un schéma d'explication numéroté, **texte seul**. C'est l'app qui numérote ; le serveur refuse tout chiffre. |

`metrique` ∈ `recup`, `vfc`, `fcRepos`, `dormi`, `scoreSommeil`, `dette7n`, `effort`, `kcalBrulees`, `kcalMangees`, `balance`, `pas`, `poids`, `stress`, `resp`, `temp`, `spo2Bas`. Ce sont des noms de colonnes de `getHistory`, que le moteur sait déjà rendre.

**Ce que l'app iOS devra implémenter.** Je n'ai pas son code : cette liste est le contrat, pas un état des lieux.

1. **Lire `blocs`** (absent ou vide = rien) et ignorer tout `type` inconnu.
2. **Dessiner chaque bloc** sous le texte, dans l'ordre, avec ses propres moteurs. Si la donnée manque (pas de bracelet, nuit non publiée, séance introuvable), ne rien afficher : jamais de zéro, jamais un graphique vide.
3. **Générer elle-même le sous-titre de période** (« 30 derniers jours ») et le libellé d'accessibilité. Le `titre` éventuel du modèle n'a pas de chiffre.
4. **Ranger `blocs` avec le message**, pour le réafficher à la relecture du fil. Le texte brut de `tourModele` garde la ligne d'origine, mais elle ne doit pas s'afficher.

## 6. Le contrat des états d'attente (côté app)

- **Sans rien changer**, une app posée qui affiche `libelles[appels[0].name]` montre déjà la vraie lecture, puisque les entrées des outils demandés sont réécrites (§ 3).
- **`etapes`** (tour d'outils) : `[{ outil, texte }]`, une ligne par appel, dans l'ordre. Elles peuvent s'afficher en liste, cochées quand l'outil a rendu.
- **`redaction`** (tour d'outils) : la phrase à montrer après l'envoi des résultats, pendant que le modèle écrit, par exemple « Rédaction de ta réponse à partir de tes 7 dernières nuits… ».
- **En flux, `{"etape":"…"}`**, envoyé seulement si l'app met `capacites.etapes: 1` dans sa requête. Une app d'avant ne reçoit donc que les trois formes qu'elle connaît. L'app remplace la ligne d'attente par cette phrase. Deux sources :
  - la phrase de rédaction, à l'ouverture d'un aller qui suit des outils ;
  - la phrase d'un outil, dès que Claude a fini de l'écrire.

## 7. Idées « waouh », par valeur / coût (avec les outils existants)

1. **Bilan du matin proactif** (valeur ★★★, coût ★). À la finalisation de la nuit : un aller avec l'instantané, le verdict, puis les blocs `nuit` et `serie recup 7` avec `repere: normale`.
2. **« Pourquoi je suis à plat ? » avec la preuve** (★★★, ★). L'ordre des facteurs (`facteurs.contrib`), un bloc `comparaison vfc 7`, et le journal de la veille, qui agit sur J+1.
3. **Préparer la séance de ce soir** (★★★, ★★). Cible d'effort selon la récup, zones de Karvonen, charge 7/28, et un bloc `zones jour`. Elle dit quelle zone viser et combien de minutes.
4. **Lecture d'une séance juste finie** (★★, ★★). Une notification 3 à 5 min après, puis `getSession` (splits, dérive, cœur fiable) avec un bloc `seance`.
5. **Corrélations personnelles** (★★, ★). « L'alcool et ma récup », « mes couchers et ma VFC », par `getHistory` 30 ou 90 jours et `impacts`. Toujours dites comme des associations, jamais comme des causes.
6. **La semaine en revue, le dimanche** (★★, ★). `getHistory` 7 jours, puis 2 blocs : `comparaison effort 7` et `serie dormi 7` avec `repere: cible`.
7. **Alerte douce du Moniteur** (★★, ★★). Deux signaux hors plage dans `natif.moniteur` : une phrase prudente et un bloc `serie` de la métrique, sans jamais de diagnostic.

## 8. Les bancs

**Ce qui existait.** Onze bancs Node dans `tests/test-coach-*.js`, chacun avec un faux `fetch` Gemini. Plus `outils/rejeu-coach.js`, qui joue un vrai endpoint déployé, donc avec du réseau et une clé.

**Ce qui s'ajoute, sans réseau :**

| Banc | Ce qu'il vérifie | Résultat |
|---|---|---|
| `tests/test-coach-or-gemini.js` | Le chemin Gemini, à l'octet (corps envoyés à Google par empreinte sha256, réponses de l'app en clair), sur 18 scénarios, contre l'or écrit sur le code d'avant. `--ecrire` réécrit l'or, à ne faire que sur l'ancien code. | 19 ✅ |
| `tests/test-coach-claude.js` | La variable et la clé ; les en-têtes et le corps Messages ; l'absence de préchargement ; outils et résultats traduits et appariés ; la réflexion renvoyée intacte dans la question en cours et jamais au-delà ; les fils nés sous Gemini ; trous et orphelins ; le secours en cours de réponse ; les blocs en JSON et en flux (21 découpages) ; la phrase avant un outil, jamais diffusée ; flux muet, refus, 529, 400 ; le 4e tour ; la V2 ; et, sans la variable, le cas des fondateurs reproduit sous Gemini. | 78 ✅ |
| `tests/test-coach-v3.js` | Les libellés des 15 outils en 3 langues, 28 cas d'arguments ; `libelles`, `etapes` et `redaction` ; le catalogue (11 blocs valides, 26 retirés) ; le schéma face au validateur ; la ligne « Blocs : » coupée à chaque caractère ; le prompt Gemini intact. | 108 ✅ |

Les bancs existants restent au même état qu'avant le v3. Une seule exception, qui date d'avant : `test-coach-manuel.js` a 1 rouge sur `RECOV_ALGO_GEN`, introuvable dans l'`index.html` de cet arbre.

## 9. Ce qui n'est pas vérifié, et mes doutes

**Ce qui n'a jamais tourné :**
- **Aucune requête n'est partie vers Anthropic.** Les en-têtes et les bêtas `thinking-binding-controls-2026-08-01` et `server-side-fallback-2026-07-01`, `fallbacks: "default"` combiné avec `block_binding`, et le flux réel sont conformes à la documentation, pas éprouvés.
- **La qualité des réponses d'Opus** n'est pas mesurée : respect du gabarit FORME, choix des outils, blocs pertinents. Il faut un rejeu, `outils/rejeu-coach.js` contre une préproduction qui a sa propre clé, avant tout public.

**Latence et coût :**
- **La latence.** Sans préchargement, une question qui demande des données coûte deux allers vers le modèle au lieu d'un. Opus 5.5 à `medium`, avec environ 20 Ko de prompt, doit tenir dans les 45 s de l'app : c'est à mesurer. `COACH_EFFORT=low` est le premier levier.
- **Le coût**, ordre de grandeur **non mesuré** : environ 10 à 12 k jetons d'entrée par aller, dont le préfixe en cache à 0,20 $/M, et 1 à 2 k de sortie réflexion comprise à 20 $/M. Cela fait quelques centimes par question.

**Ce qui dépend de l'app :**
- **Le `thoughtSignature`.** Je suppose que l'app le renvoie tel quel, comme elle le fait pour Gemini, et qu'elle tolère `functionCall.id` et `appels[].id`. Si elle les perd, le tour est reconstruit sans réflexion : il reste valide, mais un peu moins bon.
- **La phrase avant un outil.** En flux, le texte ne part qu'à son premier saut de ligne. C'est une heuristique.

**Les risques connus :**
- **Revenir à Gemini au milieu d'une question** enverrait à Gemini un `thoughtSignature` `flint-claude:` : 400 probable pour cette question seulement. Les suivantes repartent propres.
- **Données de santé chez un nouveau sous-traitant.** Les conditions et la rétention d'Anthropic sont à valider avant la bascule : ce n'est pas une question de code.

**Une décision à prendre :** faut-il aussi corriger la phrase côté **Gemini** ? Par exemple un préchargement qui suive la question, ou les libellés v3 sur le préchargement. C'est possible, mais cela changerait la production : je ne l'ai pas fait sans votre feu vert.
