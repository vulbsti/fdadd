# P0 database/RLS harness

Run `scripts/test-p0-db.sh` from the repository root. The script refuses to
run unless the pinned Supabase CLI reports the local database at
`127.0.0.1:54322`, and invokes `supabase test db --local` with
`supabase/tests/p0_owner_isolation.sql`. It has no linked-project or remote
mode.

The pgTAP test creates two disposable authenticated users and one owned graph
(profile, session, message, run, evidence, and person fact). It verifies that
owner A can read the graph, owner B sees zero rows, cross-owner writes are
rejected, the worker memory RPC is unavailable to authenticated callers, and
the user session RPC cannot target A's profile. Every fixture is inside one
transaction and is removed by `ROLLBACK`; no broad cleanup or credential output
is performed.

This is the P0 database gate, not browser or provider E2E. A passing receipt
proves local PostgreSQL/RLS/grants only; authenticated UI smoke tests and
visual verification remain separate gates.
