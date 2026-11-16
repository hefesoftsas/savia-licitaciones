#!/bin/sh
cd "$(dirname "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then
  printf '%s\n' 'Instala Node.js 22.13 o posterior y vuelve a iniciar el runner.'
  exit 1
fi
exec node runner/launcher.mjs
