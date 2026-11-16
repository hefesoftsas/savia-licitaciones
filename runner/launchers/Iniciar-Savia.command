#!/bin/sh
cd "$(dirname "$0")" || exit 1
PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
export PATH
if ! command -v node >/dev/null 2>&1; then
  printf '%s\n' 'Instala Node.js 22.13 o posterior y vuelve a abrir este archivo.'
  read -r _
  exit 1
fi
node runner/launcher.mjs
