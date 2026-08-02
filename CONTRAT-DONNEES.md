# FLINT — contrat d'injection des données réelles

*Pour le back-end. Vérifié ligne par ligne contre `index.html` v1029 — rien ici n'est deviné.*

## Pourquoi pas `data-flint` sur les spans

Le front n'est plus en HTML. Les écrans affichés sont **natifs (SwiftUI)** ; la page web
tourne cachée dans une WKWebView invisible et ne s'affiche plus jamais. Elle a un seul
rôle : **calculer**. Elle lit les mesures, en déduit sommeil / récupération / effort /
calories, et envoie le résultat au natif en JSON
(`postMessage({cmd:'natif', screen:'accueil', data:...})`).

Un attribut sur un span serait donc posé sur un DOM que personne ne voit, et que le natif
ne lit pas : tu injecterais dans le vide, l'écran ne bougerait pas, et tu croirais que
l'app ignore tes données.

L'équivalent de ce que tu demandais existe déjà — **côté données, pas côté DOM**. Deux
portes, selon que tu arrives en direct ou en lot.

---

## Porte A — le direct : `window.flintNative(type, data)`

C'est la porte que la coquille iOS utilise pour le Bluetooth. Chaque appel horodate,
range par jour et persiste tout seul. Types acceptés :

| type | data | effet |
|---|---|---|
| `'hr'` | `{hr: 62}` | un battement ; empilé dans la courbe FC du jour |
| `'battery'` | `{level: 84}` | batterie du bracelet (le % en haut des pages) |
| `'steps'` | `{steps: 8214}` | total du jour (remplace, n'additionne pas) |
| `'kcal'` | `{kcal: 412}` | kcal **actives** montre du jour (le métabolisme de base est ajouté par l'app) |
| `'distance'` | `{distance: 5.2}` | km du jour |
| `'rr'` | `{rr: [812, 798, ...]}` | intervalles R-R en **ms** ; c'est d'eux que vient le HRV |
| `'nightlog'` | `{hr: [[ts_s, bpm], ...], steps, kcal, battery}` | rejouage d'une nuit : `ts_s` en **secondes epoch** ; l'app répartit par jour, détecte la nuit, calcule coucher/lever/phases |
| `'status'` / `'log'` / `'error'` | `{status}` / `{line}` / `{message}` | journal Bluetooth (Profil → Mon bracelet) |

**La voie royale.** En mode coquille, le moteur est surchargé pour lire LA MONTRE :
le HRV est dérivé des `rr` (RMSSD), la FC repos du 5ᵉ percentile de la courbe, la nuit
entière de la FC nocturne (`computeNight`). Donc : pousse `hr` en continu (ou un
`nightlog` au réveil) + `rr` + `steps`/`kcal`/`battery`, et **sommeil, HRV, récupération,
calories se calculent tout seuls**. N'injecte pas de scores : ils se déduisent.

Chaque appel émet aussi `document.dispatchEvent(CustomEvent('flintWatch', {detail}))`
si tu veux écouter.

## Porte B — le lot : les magasins par jour (localStorage)

Clé de jour `K` = `AAAA-M-J` **sans zéros** (`2026-8-2`, pas `2026-08-02`) — format de
`tk()`. Valeurs en JSON (`DB.set` = `JSON.stringify`).

| clé | forme | contenu |
|---|---|---|
| `watch_<K>` | `{hr:[[minuteDuJour,bpm],...], rr:[ms,...], steps, kcal, dist, battery, night}` | la journée montre brute ; `minuteDuJour` = 0..1439 |
| `sensor_<K>` | `{sleepMin, timeInBed, bedMin, wakeMin, deep, rem, light, awake, hrv, rhr, resp, lowestHr, latency, spo2}` | la nuit consolidée, minutes ; `bedMin`/`wakeMin` = minute du jour |
| `sessions_<K>` | `[{name, icon, start:'HH:MM', dur, int, auto}]` | séances ; `dur` en min, `int` 1..3 |
| `meals_<K>` | `[{name, kcal, prot, carb, fat, time?}]` | repas ; grammes pour les macros |
| `recov_<K>` | `62` (nombre nu) | score de récupération **archivé** d'un jour passé |

L'écran Profil a déjà un **import de fichier** qui accepte un JSON `{clé: valeur}` de ces
mêmes clés (préfixes reconnus : `meals_`, `recov_`, `sensor_`, `sessions_`, `watch_`,
`fljrnl_`, `journal_`) — pratique pour recharger un historique complet d'un coup.

## Rafraîchir l'écran après une écriture

`nightlog` pousse tout seul. Après une écriture directe dans les magasins, appelle
`window.flOuvrirAccueilNatif()` : il recalcule `flAccueilData()` et le renvoie au natif.

## La règle de la maison

**Jamais un chiffre inventé.** Une donnée absente s'affiche « — », pas une estimation
déguisée. La récupération ne se calcule qu'avec un vrai HRV et de vraies moyennes des
jours précédents (`baseStat`) : les premiers jours sans historique, elle reste vide, et
c'est voulu. N'envoie donc que du mesuré.
