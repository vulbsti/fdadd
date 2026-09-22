#!/usr/bin/env bash
set -euo pipefail

# Safety boundary: only the local Supabase project is allowed. Do not add a
# linked/remote mode to this harness; it intentionally creates disposable auth
# and application rows inside a transaction.
repo_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_dir"

if ! npm exec -- supabase status --output json 2>/dev/null | node -e 'let raw = ""; process.stdin.on("data", c => raw += c); process.stdin.on("end", () => { try { const x = JSON.parse(raw); process.exit(x.DB_URL === "postgresql://postgres:postgres@127.0.0.1:54322/postgres" ? 0 : 1) } catch { process.exit(1) } })'; then
  echo 'P0 DB harness refused: local Supabase DB_URL was not detected.' >&2
  exit 2
fi

exec npm exec -- supabase test db --local \
  supabase/tests/p0_owner_isolation.sql \
  supabase/tests/p1_dispatch_outbox.sql
