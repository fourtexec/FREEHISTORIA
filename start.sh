#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
umask 077
if ! command -v node >/dev/null || ! node -e 'let [a,b]=process.versions.node.split(".").map(Number);process.exit(a>22||a===22&&b>=18?0:1)'; then
  echo "Для FreeHISTORIA требуется Node.js 22.18 или новее." >&2
  exit 1
fi
export FREEHISTORIA_SERVER=1
case "${1:-}" in
  --api-only) ;;
  "") node scripts/build.js
      export FREEHISTORIA_WEB=1 ;;
  *) echo "Использование: ./start.sh [--api-only]" >&2; exit 2 ;;
esac
env_args=()
if [[ -f .env ]]; then env_args=(--env-file=.env); fi
exec node "${env_args[@]}" api/server.js
