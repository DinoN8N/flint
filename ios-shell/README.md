# FLINT — application iOS

L'app est une coquille Swift (`WKWebView`) qui affiche l'interface FLINT,
écrite en HTML/JS et embarquée dans le bundle. Il n'y a pas d'écran SwiftUI :
tous les écrans (accueil, sommeil, calories, journal, nutrition) vivent dans
`index.html` et `flint-today.html`, à la racine du dépôt.

## Compiler

```bash
cd ios-shell
./preparer-web.sh          # reconstitue FLINT/web depuis la racine du dépôt
open FLINT.xcodeproj
```

Ou sans Xcode :

```bash
xcodebuild -project ios-shell/FLINT.xcodeproj -scheme FLINT \
  -configuration Debug -destination 'generic/platform=iOS' \
  -allowProvisioningUpdates build
```

`FLINT/web` n'est pas versionné : son contenu est déjà à la racine du dépôt, le
versionner doublerait 15 Mo à chaque commit. `preparer-web.sh` le reconstitue.

## Les fichiers Swift

| fichier | rôle |
|---|---|
| `FLINTApp.swift` | point d'entrée |
| `ContentView.swift` | la `WKWebView` plein écran, le pont Bluetooth vers le bracelet, et le coupe-circuit qui force le thème clair après deux morts du process WebKit en moins de 45 s |
| `WebRoot.swift` | sert une copie installée dans Application Support, re-semée depuis le bundle **uniquement si** `flint-vNNN` du bundle est plus récent que la version installée |
| `WebSchemeHandler.swift` | schéma d'URL personnalisé pour servir les fichiers locaux |
| `FlintTestBand.swift` | banc d'essai du bracelet |

## Piège de version

`WebRoot.swift` ne re-sème le web que si la version du bundle est **supérieure**
à celle installée. Recompiler sans incrémenter `flint-vNNN` dans `sw.js` (et
`APP_VERSION` dans `index.html`) fait servir l'ANCIENNE copie : les
modifications semblent ne pas prendre. Toujours incrémenter avant de compiler.

## Bracelet connecté

`ContentView.swift` tient le rôle de central Bluetooth et stocke nativement
chaque mesure, parce que la `WKWebView` est suspendue en arrière-plan et ne peut
donc pas recevoir les notifications du bracelet. Les mesures sont poussées vers
le web au retour au premier plan.
