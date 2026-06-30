# DESIGN_AUDIT — FLINT

> Audit avant refonte visuelle « anti-IA », références Whoop (rigueur data, dark premium) + Betclic (énergie, contraste). **Aucune implémentation à ce stade** : constat + plan + direction à valider.

---

## 0. Réalité du codebase (mesurée)

| Métrique | Valeur | Implication |
|---|---|---|
| Fichier unique `index.html` | **8 113 lignes** | Mono-fichier (contrainte Capacitor) — pas de système de composants atomiques à migrer, tout est inline. |
| Couleurs hex **en dur** | **2 439** | Le vrai chantier. ~75 % des couleurs ne passent PAS par un token. |
| Usages `var(--…)` | 803 | Un socle de tokens existe (`:root`) mais largement court-circuité. |
| `'Anton'` (police display) | **305 occurrences** | Souvent hardcodée dans des SVG/inline, pas via `--disp`. |
| Rayons distincts | 28 valeurs px | Déjà varié (pas l'uniformité « tout rounded-xl »), mais incohérent. |
| Fonts | **Anton + Inter via Google Fonts CDN** ; Tabler via jsDelivr CDN | **Non self-hostées** → FOUT possible, dépendance réseau. |
| Thème | **Clair** (crème `#FAF8F5` + orange `#F0492E`) | Plusieurs **héros en image PNG claire** baked (Sommeil, Récup, Pas, art FC, montagnes Balance, `home_empty`). |

---

## 1. Ce qui « fait IA » / générique aujourd'hui (constat honnête)

Le brief liste des clichés (dégradés violet→indigo, Inter partout, rounded-xl uniforme, emojis). **Bonne nouvelle : FLINT échappe déjà à plusieurs.** Distinguons.

**✅ Déjà au-dessus du template généré :**
- Aucun dégradé violet/indigo cliché. Accent orange-rouge **ownable** déjà en place.
- Police display à caractère (Anton condensé) — pas du system-ui.
- Rayons variés, pas l'uniformité Tailwind.
- Emojis d'icônes : **éliminés** (passage aux SVG monochromes / Tabler récemment).
- Parti pris chromatique chaud (crème) = un vrai choix, pas du gris neutre.

**❌ Ce qui sonne encore « générique / pas studio » :**
1. **Inter en corps de texte** — la police UI la plus utilisée du web : lisible mais « par défaut », zéro signature.
2. **Anton** : libre, ultra-répandu, reconnaissable → fait « gros titre gratuit », pas une fonte propriétaire ownable. Et son `oblique`/`font-style` est appliqué de façon inégale.
3. **Faible contraste de hiérarchie entre surfaces** : empilement de cartes blanches/crème quasi identiques, mêmes ombres molles → l'œil ne sait pas où regarder en premier (le défaut « cards empilées sans contraste »).
4. **Ombres** : `--shadow`/`--sh-card` corrects mais répétés à l'identique partout, pas d'élévation différenciée par rôle.
5. **Échelle typo timide** : progression assez linéaire ; les gros chiffres de data ne **dominent** pas assez (pas de tracking serré marqué, pas de traitement « data hero » façon Whoop).
6. **Tabler icons** : set générique reconnaissable (pas un jeu d'icônes maison).
7. **2 439 couleurs en dur** : impossible de re-thémer proprement, et incohérences (12 oranges légèrement différents, etc.).
8. **Spacing mécanique** : marges très régulières, peu de regroupements visuels / respiration intentionnelle.

---

## 2. Le verrou stratégique à trancher AVANT tout

Le brief demande **« mode sombre premium par défaut »**. Or :

- L'app est **claire**, et **plusieurs écrans-héros sont des PNG clairs baked** (Sommeil = `mockup_empty.png`, Récup = `recup-empty.png`, Pas = `steps-empty.png`, art FC, montagnes Balance). **Un fond sombre les casse** : ils ne se re-colorent pas via tokens — il faut les **recoder en pur CSS/SVG** ou produire de **nouveaux assets sombres**.
- **2 439 valeurs en dur** : un vrai « dark par tokens, zéro valeur en dur » = **migration massive** (réécriture de centaines de couleurs inline), à haut risque de régression sur une maquette très fignolée.

→ **Ce n'est pas un reskin léger : c'est une refonte d'identité.** Honnête : sur ce mono-fichier, le faire à 100 % d'un coup est risqué. Je recommande un **chemin par phases**, en commençant par **prouver la direction sur l'écran principal** (avant/après) avant de propager.

---

## 3. Plan d'exécution proposé (phasé, faible risque)

1. **Tokens** : reconstruire `:root` en **deux thèmes** (dark premium par défaut + clair en repli), tout en variables (couleurs, typo, spacing à rythme, rayons par rôle, ombres+glows sur-mesure). Ajouter une couche de **compat** pour absorber progressivement les 2 439 valeurs en dur.
2. **Fonts self-host** : `@font-face` (woff2 subsettés), `font-display:swap`, preload des poids critiques → zéro FOUT, zéro CDN.
3. **Composants atomiques** (inline mais centralisés) : Carte (3 niveaux d'élévation), Bouton/CTA, Badge, **bloc Métrique** (le « data hero » Whoop : gros chiffre tabular, label small-caps tracké, glow accent).
4. **Écran principal d'abord** : refonte **Aujourd'hui** (dashboard) en dark premium → **je te montre l'avant/après ici** avant de continuer.
5. Propagation : Effort → Balance → Récup/Sommeil/FC (ces 3 derniers = phase « assets/recodage » des héros image).

Aucune route, logique ou donnée touchée. Accessibilité AA visée sur le dark.

---

## 4. Direction TYPO proposée (à valider) — fontes libres & self-hostables

> Toutes **gratuites pour usage commercial + self-host** (Fontshare / OFL) → respecte licences + perf.

**Option A — « Sport-tech précis » (Whoop-leaning)**
- Display + chiffres data : **Geist** (OFL, Vercel) — grotesque technique, précise, `tabular-nums`, superbe en gros chiffres serrés.
- Corps : **Switzer** (Fontshare) — grotesque neutre soignée, distincte d'Inter.
- Rendu : rigueur, données premium, froid maîtrisé. Très Whoop.

**Option B — « Énergie éditoriale » (Betclic-leaning)**
- Hero / titres / gros chiffres : **Clash Display** (Fontshare) — display à fort caractère, légèrement condensée, punchy.
- Corps : **General Sans** (Fontshare) — grotesque chaleureuse mais nette.
- Rendu : énergie, contraste éditorial, sport-tech expressif. Très Betclic.

**Commun aux deux** : échelle à fort contraste (les chiffres de métrique dominent, tracking négatif léger), labels secondaires en **UPPERCASE tracké / small-caps**, `tabular-nums` sur toute data. Anton conservé **uniquement** pour le logotype FLINT (signature de marque), retiré du reste.

---

## 5. Direction PALETTE proposée (à valider) — dark premium

**Option 1 — « Charbon froid × orange électrique » (recommandée : garde l'ADN FLINT)**
- Base : quasi-noir **bleuté nuancé** `#0C0D11` (pas de #000 ni slate brut).
- Surfaces : `#15171D` (carte) → `#1D2027` (élevée), hairlines `rgba(255,255,255,.06)`.
- Texte : warm-white `#F2F1ED` / mid `#A6ABB4` / faint `#6C7178`.
- **Accent ownable** : orange-rouge FLINT poussé en électrique `#FF4A2B` + **glow** ciblé, usage parcimonieux (data critique + CTA).
- Data sémantique : Récup **vert** `#34E0A4`, Effort = accent orange, Sommeil **bleu solide** `#5AA8FF` (jamais en dégradé violet), FC **corail** `#FF6B5A`, Pas teal `#16C8C2`.

**Option 2 — « Noir chaud × rouge Betclic »**
- Base : near-black **chaud** `#121010`.
- Accent : rouge plus vif `#FF3B30` (énergie paris sportifs), secondaire or `#F4B740`.
- Contraste maximal, lecture instantanée.

Les deux respectent **AA** (texte clair sur surfaces sombres) et bannissent tout dégradé violet/indigo.

---

## 6. Décision attendue de ta part
1. **Périmètre** : refonte dark complète (longue, je recode les héros image) **ou** d'abord les écrans codés (Aujourd'hui/Effort/Balance…) en preuve, héros image en phase 2 ?
2. **Typo** : Option A (Geist+Switzer, Whoop) ou B (Clash+General Sans, Betclic) ?
3. **Palette** : Option 1 (orange FLINT électrique) ou 2 (rouge Betclic) ?

Dès validation : je reconstruis les tokens + fonts, puis l'écran **Aujourd'hui** en avant/après.
