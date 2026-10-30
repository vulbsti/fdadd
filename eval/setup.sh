#!/usr/bin/env bash
# One-time setup for the evaluation harness in a fresh container.
set -euo pipefail
cd "$(dirname "$0")/.."
VENV=${ATROS_VENV:-/tmp/atros-venv}
if [ ! -x "$VENV/bin/atros" ]; then
  python3 -m venv "$VENV"
  "$VENV/bin/pip" install --quiet -e vendor/atros
fi
[ -d node_modules ] || npm ci --no-audit --no-fund
[ -d runtime/pi/node_modules ] || (cd runtime/pi && npm ci --no-audit --no-fund)
echo "Atros: $("$VENV/bin/atros" --help >/dev/null && echo ok)  key: ${OPENCODE_API_KEY:+set}${OPENCODE_API_KEY:-MISSING}" | sed 's/MISSING.*/MISSING/'
