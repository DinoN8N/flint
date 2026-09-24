#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
#  DÉPLOYER flint-app EN PRODUCTION — `./deployer.sh`
#
#  POURQUOI CE SCRIPT EXISTE (24 sept. 2026) : `vercel --prod` n'envoie PAS un
#  commit, il envoie L'ARBRE DE TRAVAIL. Le chantier non commis d'une session
#  voisine est déjà parti en production avec le déploiement d'une autre — et
#  le sha affiché par Vercel ne disait pas ce qui tournait. Deux gardes, donc,
#  avant de lancer quoi que ce soit :
#
#    1. l'arbre est PROPRE (`git status --porcelain` vide) : ce qui part est
#       exactement un commit, qu'on peut relire et rejouer ;
#    2. les bancs d'api sont VERTS (`node tests/tous-api.js`, tous à la fois,
#       jamais fichier par fichier) : faux fetch, aucune clé, aucun réseau.
#
#  Puis `vercel --prod --yes`, et la PREUVE : on n'affiche pas le sha, on
#  appelle la production — la version servie (première ligne de sw.js) et un
#  POST vide sur les deux endpoints, qui doivent répondre 401 (le secret d'app
#  manque) : ni 200 (porte ouverte), ni 500 (fonction cassée), ni 404
#  (fonction absente — c'est ce qui a rendu le Coach muet le 23 sept.).
#
#  Ce script ne pousse rien sur git : pousser reste un geste à part.
# ═══════════════════════════════════════════════════════════════════════════
set -euo pipefail
cd "$(dirname "$0")"

PROD="https://flint-demo-eta.vercel.app"

if [ -n "$(git status --porcelain)" ]; then
  echo "✗ L'arbre de travail n'est pas propre — \`vercel --prod\` enverrait ces fichiers tels quels :"
  git status --short
  echo "  Commets (ou range) avant de déployer."
  exit 1
fi
echo "✓ arbre propre — HEAD $(git rev-parse --short HEAD) ($(git branch --show-current))"

if ! node tests/tous-api.js; then
  echo "✗ Un banc d'api est rouge : on ne déploie pas."
  exit 1
fi

echo
echo "→ vercel --prod --yes"
vercel --prod --yes

echo
echo "═══ CE QUE LA PRODUCTION SERT ═══"
printf 'sw.js         : '; curl -s "$PROD/sw.js" | head -1
for ep in coach scan-meal; do
  code=$(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' -d '{}' "$PROD/api/$ep")
  if [ "$code" = "401" ]; then
    echo "api/$ep : $code ✓ (attendu 401 : le secret d'app manque, la porte tient)"
  else
    echo "api/$ep : $code ✗ (attendu 401 — 200 = porte ouverte, 500 = fonction cassée, 404 = fonction absente)"
  fi
done
