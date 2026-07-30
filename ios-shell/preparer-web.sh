#!/bin/bash
# Prépare le projet Xcode pour la compilation.
#
# Le projet référence FLINT/web comme un DOSSIER (folder reference) : Xcode le
# recopie tel quel dans l'app. Ce dossier n'est pas versionné, parce que son
# contenu est déjà à la racine du dépôt — le versionner doublerait 15 Mo à
# chaque commit. Ce script le reconstitue.
#
#   cd ios-shell && ./preparer-web.sh && open FLINT.xcodeproj
set -e
ICI="$(cd "$(dirname "$0")" && pwd)"
RACINE="$(cd "$ICI/.." && pwd)"
WEB="$ICI/FLINT/web"
mkdir -p "$WEB"
cd "$RACINE"
# les écrans, le service worker, la police, les icônes d'activité
cp -f index.html flint-today.html sw.js Jost.ttf "$WEB/" 2>/dev/null || true
cp -f act-*.png steps-*.png *.png "$WEB/" 2>/dev/null || true
N=$(ls -1 "$WEB" | wc -l | tr -d ' ')
echo "FLINT/web prêt : $N fichiers"
V=$(grep -o "flint-v[0-9]*" "$WEB/sw.js" 2>/dev/null | head -1)
echo "version embarquée : ${V:-inconnue}"
