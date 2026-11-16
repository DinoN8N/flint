# Déployer le serveur : le jour où le Coach et le scan passent sur Claude

Ce document dit, dans l'ordre, ce qu'il faut faire le jour de la bascule. Il
s'adresse à quelqu'un qui n'est pas développeur. Chaque étape dit ce qu'on doit
voir à l'écran. Si on voit autre chose, on s'arrête : la production n'a pas
encore été touchée.

Le principe est simple :

1. on pose les clés ;
2. on crée une copie de test, appelée « Preview », que personne n'utilise ;
3. on lance l'essai automatique sur cette copie ;
4. on ne bascule la vraie production que si l'essai est vert ;
5. on relance l'essai sur la production ;
6. on sait revenir en arrière en une minute.

---

## 0. Avant de commencer (la veille)

- [ ] **Les clés Claude existent.** Dino et Félix ont chacun créé une clé API
      dans la Console Anthropic, avec le crédit Ultra lié (voir
      `ACCUEIL-200-A-FAIRE.md`). On ne s'envoie jamais une clé par message.
- [ ] **L'accès au tableau de bord Vercel** : projet **flint-demo**, équipe
      **dinon8ns-projects**. L'adresse de la production est
      `https://flint-demo-eta.vercel.app`.
- [ ] **La branche à déployer est prête.** Elle doit contenir trois choses :
      - le serveur Claude (`scan-claude-16nov`, commit dd8554d) ;
      - la branche `essai-deploiement-17nov` : l'essai, plus deux ajouts au
        serveur, le battement du Coach (056f1a9) et le repli du scan
        (d6c5d1f) ;
      - la correction du manuel du Coach (réécrit sur une autre branche la
        nuit du 17 nov.).

      Sans cette correction, `deployer.sh` refuse de déployer. Son banc
      `tests/test-coach-manuel.js` est rouge depuis dd8554d : le manuel dit
      `RECOV_ALGO_GEN 21`, le moteur dit 22.
- [ ] **Les textes de l'app.** L'App Store 1.2 dit encore « Google Gemini »
      pour le Coach et le scan. La 1.3 dit « Anthropic (Claude) ou Google
      (Gemini) ». Basculer avant que la 1.3 soit publiée, c'est l'accepter en
      connaissance de cause (note `flint-coach-claude-credits-ultra`).
- [ ] **Une copie propre du dépôt.** `vercel` envoie le DOSSIER, pas un commit.
      `deployer.sh` refuse donc un dossier qui contient des fichiers non
      commités. Aujourd'hui, `~/Desktop/FLINT/flint-app` contient
      `supabase/releves.sql`, un fichier non suivi : il serait refusé.
      Préparer une copie à part :

      ```
      cd ~/Desktop/FLINT/flint-app
      git worktree add ~/flint-deploiement <la-branche-à-déployer>
      cp -R .vercel ~/flint-deploiement/
      cd ~/flint-deploiement
      git status                 # doit dire « nothing to commit, working tree clean »
      node tests/tous-api.js     # doit finir par « Tous les bancs d'api sont verts. »
      node outils/essai-serveur.js --sec   # doit finir par « ✅ Tout marche »
      ```

      (Le dossier `.vercel` relie la copie au projet flint-demo. Il est ignoré
      par git, d'où la copie à la main.)

## 1. Ce qu'on sait de la configuration, et ce qu'il faut regarder

**Ce que le dépôt dit** (vérifié dans les fichiers) :

- `vercel.json` déclare trois fonctions et leur durée maximale :
  - `api/scan-meal.js` : 160 s ;
  - `api/coach.js` : 90 s ;
  - `api/apple-revocation.js` : 20 s.

  La production actuelle porte déjà 160 s et 90 s : Vercel accepte donc ces
  valeurs pour ce compte.
- Il n'y a pas d'étape de compilation. Le site sert le web de l'app (mise à
  jour OTA : `sw.js`, `manifeste.json`, le moteur), et `api/` sert les
  fonctions.
- `.vercelignore` empêche `tests/`, `outils/` (donc l'essai et ses images),
  `supabase/` et `deployer.sh` de partir en ligne.
- Jusqu'ici, on déployait en production avec `./deployer.sh`, qui fait
  `vercel --prod --yes`. La même commande **sans `--prod`** crée une Preview.
- **Le web OTA ne change pas.** Entre la production (`feat/flint-frontend`,
  848f416, OTA v3056) et la branche Claude, seuls `api/`, `tests/` et
  `vercel.json` diffèrent. L'essai le vérifie (option `--reference`).

**Ce qu'il faut REGARDER dans le tableau de bord**, parce que le dépôt ne le
dit pas :

| Où (projet flint-demo) | Ce qu'on cherche | Pourquoi |
|---|---|---|
| Settings → Environment Variables | La liste actuelle : `FLINT_APP_SECRET`, `COACH_SIG_SECRET`, `GEMINI_API_KEY` doivent déjà y être | L'essai en a besoin, et le retour arrière vers Gemini aussi |
| Settings → Deployment Protection | « Vercel Authentication » est-il actif sur les Preview ? | Si oui, l'essai voit une page de connexion. Créer alors un jeton dans « Protection Bypass for Automation » |
| Settings → Git | Un dépôt est-il branché ? Quelle est la « Production Branch » ? | Si un dépôt est branché, pousser une branche crée aussi une Preview. Pousser sur la branche de production, elle, DÉPLOIE EN PRODUCTION |
| Settings → Functions | « Fluid compute », et la durée maximale permise par l'offre | À comparer avec les 160 s du scan |
| Deployments | Le déploiement de production actuel (noter son adresse ou sa date) | C'est celui qu'on remettra en cas de retour arrière |

## 2. Poser les variables

Tableau de bord → projet flint-demo → **Settings → Environment Variables**.
Pour chaque variable : son nom exact, sa valeur, puis les cases à cocher.

**⚠️ Une variable ajoutée ou changée ne vaut que pour les déploiements créés
APRÈS.** Elle ne change rien à ce qui tourne déjà. C'est pour ça qu'on la pose
AVANT de créer la Preview.

### D'abord, Production ET Preview (sans danger)

Le code de la production actuelle ignore ces variables. On peut donc les poser
partout dès maintenant.

| Nom | Valeur | Production | Preview | Qui |
|---|---|---|---|---|
| `ANTHROPIC_API_KEY` | la clé de Dino (`sk-ant-…`) | ☑ | ☑ | Dino, lui-même |
| `ANTHROPIC_API_KEY_2` | la clé de Félix | ☑ | ☑ | Félix, lui-même |

Posez toujours `ANTHROPIC_API_KEY` en premier. Avec seulement la `_2`, le
serveur répond « configuration serveur incomplète », alors même qu'une clé
est là.

### Ensuite, Preview SEULEMENT (la bascule, à l'essai)

| Nom | Valeur | Production | Preview |
|---|---|---|---|
| `COACH_FOURNISSEUR` | `anthropic` | ☐ **pas encore** | ☑ |
| `SCAN_FOURNISSEUR` | `anthropic` | ☐ **pas encore** | ☑ |
| `COACH_MODELE` | `claude-sonnet-5-5` (recommandé, voir § 8) | ☐ pas encore | ☑ |

- `anthropic` s'écrit en minuscules, exactement. Toute autre écriture
  (« Anthropic », une espace en trop) laisse Gemini, sans message d'erreur.
  L'essai le voit.
- Sans `COACH_MODELE`, le Coach prend **Claude Opus 5.5**, environ deux fois
  plus cher que Sonnet 5.5.
- Le scan prend Sonnet 5.5 par défaut (`SCAN_MODELE=claude-haiku-5-5` pour le
  moins cher).

### Ne pas toucher

- `GEMINI_API_KEY` : **on la garde.** C'est le retour arrière.
- `FLINT_APP_SECRET`, `COACH_SIG_SECRET` : déjà là, rien à changer.

### Les autres chantiers de la liste (indépendants de la bascule)

- `COACH_EXIGE_SIGNATURE=1` : ferme la porte du Coach aux requêtes non
  signées.
- `UPSTASH_REDIS_REST_URL` et `UPSTASH_REDIS_REST_TOKEN` : le plafond par
  personne et par jour.
- `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY` : la révocation
  « Se connecter avec Apple ». Sans elles, la route répond « configuration »
  et le journal nomme la variable manquante. La suppression du compte se
  fait quand même.

## 3. Créer la Preview, sans toucher la production

Dans la copie propre de l'étape 0 :

```
cd ~/flint-deploiement
git status          # doit être propre
vercel --yes        # SANS --prod : c'est une Preview
```

À la fin, `vercel` affiche une adresse en `https://flint-demo-….vercel.app`.
**C'est l'adresse de la Preview : la noter.** La production
(`flint-demo-eta.vercel.app`) n'a pas bougé, et l'app des utilisateurs ne
connaît pas cette adresse.

À vérifier : si le tableau de bord montre ce déploiement avec l'étiquette
« Production », on s'est trompé de commande. Il faut alors aller tout de suite
au § 7.

## 4. Lancer l'essai sur la Preview

Dans le Terminal, dans la copie propre :

```
export FLINT_APP_SECRET='…'          # la valeur du tableau de bord (ou celle de l'app)
export COACH_SIG_SECRET='…'          # idem
export VERCEL_PROTECTION_BYPASS='…'  # seulement si la Preview est protégée (§ 1)
node outils/essai-serveur.js https://<adresse-de-la-preview> --reference https://flint-demo-eta.vercel.app
```

Les valeurs restent dans ce Terminal. Elles ne sont écrites nulle part et ne
s'affichent jamais : l'essai les masque.

L'essai dure une à deux minutes. Il coûte environ 0,20 à 0,40 $ de crédit
Claude (une dizaine d'appels).

### Lire le tableau

- ✅ : c'est bon.
- ❌ : ça casse. La ligne d'en dessous dit pourquoi.
- ⚠️ : à lire, mais ça ne bloque pas. Exemples : une valeur d'étiquette mal
  lue, une réponse un peu longue.
- ⏭️ : pas essayé, et la ligne dit pourquoi.

La dernière ligne résume en une phrase :

- `✅ Tout marche` : code 0, on peut basculer.
- `❌ N problème(s) — ne bascule pas` : code 1.
- `⏭️ … pas été essayés` : code 3. `FLINT_APP_SECRET` n'est pas posée dans le
  Terminal.

### Les ❌ les plus probables, et quoi faire

| Ce que dit l'essai | Ce que ça veut dire | Quoi faire |
|---|---|---|
| « Vercel répond par sa page de protection » | La Preview est protégée | Créer le jeton (§ 1), `export VERCEL_PROTECTION_BYPASS=…`, relancer |
| « c'est gemini qui a répondu » | `COACH_FOURNISSEUR` n'est pas lue | Variable posée APRÈS la Preview, ou mal écrite. Corriger, puis refaire § 3 |
| « le fichier est parti au modèle » (scan) | Pareil pour `SCAN_FOURNISSEUR` | Idem |
| « HTTP 502 … credit balance is too low » | Plus de crédit sur la clé | Vérifier le crédit Ultra lié à l'organisation de la clé |
| « HTTP 502 … authentication_error » | Clé fausse ou révoquée | Recoller la clé, refaire § 3 |
| « HTTP 500 configuration serveur incomplète » | `ANTHROPIC_API_KEY` absente de la Preview | Cocher « Preview » sur la variable, refaire § 3 |
| « signature refusée » | `COACH_SIG_SECRET` du Terminal ≠ celle du serveur | Recopier la bonne valeur |
| « un silence de NN s » | Plus de 45 s sans un octet : l'app aurait dit « Flint met trop de temps ». Depuis le 17 nov. (056f1a9), le serveur envoie un battement toutes les 15 s pendant que Claude réfléchit : ce ❌ ne devrait plus arriver | Vérifier que la branche déployée contient 056f1a9. Sinon, ne pas basculer le Coach |
| « servi par Gemini en REPLI » (scan) | Les crédits Claude sont vides : le scan marche quand même, mais sur Gemini | Vérifier le crédit des deux comptes avant de basculer |
| « déployer CHANGERAIT l'app de tout le monde » | Le web OTA de la Preview n'est pas celui de la production | Ne pas déployer : la branche n'est pas partie du bon point |

### Regarder aussi le journal (une minute)

Tableau de bord → la Preview → **Logs**. On doit voir des lignes comme :

- `[coach] mode=reponse … fournisseur=anthropic modele=claude-sonnet-5-5 … cle=1`
- `[scan] claude · repas · …`
- jamais, le jour de la bascule : `[scan] crédit Claude épuisé, servi par Gemini`

`cle=1` veut dire que c'est la clé de Dino qui a payé, `cle=2` celle de Félix.
Aucune ligne ne doit contenir une clé.

## 5. Basculer la production

Seulement si l'essai du § 4 a fini par `✅ Tout marche`.

1. Settings → Environment Variables : sur `COACH_FOURNISSEUR`,
   `SCAN_FOURNISSEUR` et `COACH_MODELE`, **cocher aussi Production**.
2. Dans la copie propre :

   ```
   cd ~/flint-deploiement
   ./deployer.sh
   ```

   Le script vérifie que le dossier est propre et que les bancs sont verts.
   Puis il déploie en production et appelle la production : il doit afficher
   `api/coach : 401 ✓` et `api/scan-meal : 401 ✓`.

(On peut aussi utiliser le bouton « Promote to Production » de la Preview. À
vérifier avant : qu'il reprenne bien les variables de Production. Le script,
lui, rejoue les bancs.)

## 6. Relancer l'essai sur la production

```
node outils/essai-serveur.js https://flint-demo-eta.vercel.app
```

Il doit finir par `✅ Tout marche`. Puis on fait un vrai essai sur un iPhone :
une question au Coach, une photo de repas, une étiquette.

## 7. Revenir en arrière en une minute

**A. Le plus rapide : remettre le déploiement d'avant.**

Tableau de bord → **Deployments** → le déploiement de production d'avant (noté
au § 1) → menu « … » → **Instant Rollback** (ou « Promote to Production »).
C'est presque immédiat. Ça remet l'ancien code ET les variables de l'époque :
on est revenu exactement à la veille.

À vérifier : après un « Instant Rollback », Vercel n'envoie plus
automatiquement les déploiements suivants en production, tant qu'on n'a pas
annulé le retour arrière (« Undo Rollback ») ou promu un autre déploiement.

**B. Garder le nouveau serveur, mais repasser sur Gemini.**

C'est utile si seul Claude pose problème : plus de crédit, réponses lentes.

1. Settings → Environment Variables : **supprimer** `COACH_FOURNISSEUR` de
   Production (et/ou `SCAN_FOURNISSEUR`). On peut ne basculer que le Coach, ou
   que le scan.
2. Deployments → le déploiement de production actuel → « … » → **Redeploy**.
   Environ une minute.

Vérifié dans le code : le serveur relit `COACH_FOURNISSEUR` et
`SCAN_FOURNISSEUR` à CHAQUE requête (`configClaude()` dans `api/coach.js`,
`configScan()` dans `api/scan-meal.js`). Il ne garde rien en mémoire. Sans la
variable, c'est Gemini, à l'octet près comme avant : les bancs
`test-coach-or-gemini.js` et `test-scan-or-gemini.js` le prouvent.

**Mais Vercel fige les variables dans chaque déploiement.** Supprimer la
variable sans « Redeploy » ne change rien. Il faut aussi que `GEMINI_API_KEY`
soit restée en place.

**Quand les DEUX crédits Claude sont vides** :

- **le scan** repasse SEUL sur Gemini, requête par requête, si
  `GEMINI_API_KEY` est posée (depuis d6c5d1f). L'app reçoit la même réponse
  qu'avec Gemini. Le journal écrit `[scan] crédit Claude épuisé, servi par
  Gemini`. Seul un crédit vide sur TOUTES les clés déclenche ce repli : une
  panne ou une erreur de Claude reste une panne.
- **le Coach**, lui, ne se replie pas. Il répond « indisponible » (502), et le
  journal écrit `clé1:crédit-épuisé clé2:crédit-épuisé`. Le geste est alors
  le B ci-dessus, pour `COACH_FOURNISSEUR` seulement.

## 8. Ce que la bascule coûte

Ces prix sont ceux d'Anthropic par million de jetons (entrée / sortie) :
Opus 5.5 4 $ / 20 $, Sonnet 5.5 2 $ / 10 $, Haiku 5.5 0,10 $ / 0,50 $.

L'estimation suppose 11 000 jetons lus par question, dont l'essentiel en cache,
et environ 1 500 écrits (note `flint-coach-claude-credits-ultra`).

| | Coach, par question | Scan, par photo |
|---|---|---|
| Claude Sonnet 5.5 (recommandé) | ≈ 2 à 2,5 centimes | ≈ 1 à 1,5 centime |
| Claude Opus 5.5 (défaut du Coach sans `COACH_MODELE`) | ≈ 4 à 5 centimes | — |
| Claude Haiku 5.5 | ≈ 0,2 centime | ≈ 0,1 centime |
| Gemini (aujourd'hui) | ≈ 1 centime, mais offre gratuite limitée (≈ 20 demandes par jour pour tout le monde) | idem |

- Quand les deux crédits sont vides, les photos passent sur Gemini (offre
  gratuite limitée) jusqu'au mois suivant. Le Coach, lui, s'arrête (§ 7).
- Les 200 $ de crédit Ultra d'un compte font environ 8 000 questions Sonnet
  par mois.
- La clé de Félix prend le relais quand celle de Dino est vide : environ
  16 000 questions à deux.
- Le crédit non utilisé est perdu en fin de mois.
- Une question qui appelle des outils (lecture des nuits, de la charge) fait
  deux appels au modèle : compter plutôt le haut de la fourchette.

Ce sont des **ordres de grandeur**, calculés sur le papier. Aucune vraie
facture n'a encore été vue. Le journal de chaque réponse donne les vrais
chiffres : `jetonsEntree`, `cacheLu`, `jetonsSortie`.

## 9. Ce que l'essai ne vérifie pas

- L'app iPhone elle-même : l'essai imite ses requêtes, octet pour octet, mais
  ce n'est pas elle.
- La justesse des réponses du Coach et des calories (seulement leur forme et
  leurs garde-fous).
- Une vraie suppression de compte, une vraie révocation Apple : l'essai ne
  teste que les refus.
- Le plafond par jour (Upstash), s'il est posé.
- La tenue sous charge (200 personnes à la fois).
