# Phase 0 browser harness

This is a bounded, real-browser smoke gate for the authenticated astrologer surface. It uses the application’s Supabase login UI and server session; it does not mock auth, inject cookies, or stub API responses. Before each project run it creates a unique, email-confirmed disposable user through the local Supabase admin API and deletes that exact user in `finally`.

## What it proves

- A newly created local Supabase user can sign in through the visible login flow.
- `/astrologer` is reachable while authenticated and remains reachable after a browser reload.
- The owned authenticated `GET /api/astrologer/profiles` route returns `{ profiles: [] }`-compatible JSON for that user.
- Screenshots are captured for 1586×992, 1366×768, and mobile (390×844) viewports on initial load and reload.

## Run locally

The harness requires a local Supabase stack and the local values for `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and `SUPABASE_SECRET_KEY`. It refuses any non-loopback Supabase host. `.env.local` is loaded automatically by the Playwright config; no credentials are passed on the command line:

```bash
npx playwright test
```

The server uses `http://localhost:9002` by default. Set `E2E_BASE_URL` only for another loopback deployment; remote app URLs are refused. Projects are `laptop-wide`, `laptop`, and `mobile`; use `--project=laptop` to narrow a run. Screenshots, traces, and the HTML report are written under Playwright’s ignored `test-results/` and `playwright-report/` directories. The harness does not intentionally log generated credentials. Failure traces may capture form values or session tokens; treat all Playwright output as private, and do not commit or upload it to public CI artifacts.

If the local stack or required environment is unavailable, the test fails explicitly. A pass proves local auth/session/API plumbing and responsive visual captures only; it does not prove remote Supabase parity, RLS isolation against a second user, provider/workflow execution, or private-content correctness.

## Scope boundary

This smoke test does not create or mutate astrologer profiles, sessions, runs, or private content. It also does not claim provider/workflow correctness. Those require the later Phase 1+ feature-specific E2E gates and isolated data ownership checks.
