# Aidoraa Fashion — Production Readiness TODO

> Status as of review: a styled **Next.js 15 prototype**. The frontend/blog UI is real;
> **auth, AI, and the database are mocks**. This checklist turns the prototype into a
> working product. Items are ordered by dependency and impact.
>
> Hosting: **Firebase App Hosting**, project `aidoraa-fashion`, region `us-central1`.
> Live: https://aidoraa-fashion.web.app

---

## P0 — Blocking for a real product

These are the layers that are currently fake. Nothing real ships until they exist.

- [ ] **Real authentication** (currently `setTimeout` + hardcoded `test@example.com`/`password`)
  - [ ] Decide provider: **Supabase** (commented code targets it) vs **Firebase Auth** (we deploy on Firebase, ship the `firebase` SDK). _Decision pending — see `docs/auth-plan.md`._
  - [ ] Install the auth SDK and remove the placeholder logic in `src/contexts/AuthContext.tsx`
  - [ ] Wire email/password + at least one OAuth provider (replace dead GitHub button in `src/components/auth/AuthModal.tsx`)
  - [ ] Server-side session/route protection for `/api/*` and gated pages
  - [ ] Enable the disabled **Profile** buttons in `src/components/global/Header.tsx` + add a profile route
- [ ] **Persistent database** (currently in-memory arrays that reset on cold start)
  - [ ] Pick a store (Firestore if staying all-Firebase; Postgres/Supabase otherwise)
  - [ ] **Merge the two divergent blog services** — `src/services/blog.ts` (pages) and `src/services/blog-service.ts` (API) read from different stores, so API writes never appear on rendered pages
  - [ ] Move blog CRUD + RSS persistence behind the real store
- [ ] **Wire the AI layer** (Genkit/Gemini is configured in `src/ai/ai-instance.ts` but imported nowhere; `prompts/` dir doesn't exist)
  - [ ] Create the missing `src/ai/prompts/` directory and define at least one flow
  - [ ] Replace FashionDaddy canned reply (`src/components/fashiondaddy/FashionDaddyApp.tsx` ~L131) with a real Gemini call via an API route
  - [ ] Replace DatePlanner keyword `if/else` (`src/components/dateplanner/DatePlannerApp.tsx`) with a real flow
  - [ ] Confirm `GOOGLE_GENAI_API_KEY` is set in Firebase App Hosting secrets
- [ ] **Contact form** does nothing — `src/app/contact/contact-form.tsx` just `alert()`s. Add an endpoint + email/store.

## P1 — Correctness & deploy hygiene

- [ ] **Reconcile deploy targets.** README documents Vercel; actual deploy is Firebase. Pick one:
  - [ ] If Firebase: remove Vercel language from `README.md`, reassess `output: 'standalone'` in `next.config.ts`
  - [ ] Confirm whether `src/lib/platform.ts` detection is still needed (nothing consumes it)
- [ ] **Add `.env.example`** documenting required vars (`GOOGLE_GENAI_API_KEY`, future auth/DB keys). No template exists today.
- [ ] **Real RSS ingestion** — both `src/services/rss.ts` and `blog-service.ts` return hardcoded `mockRssItems`; `/api/rss` POST persists nothing. Point `RSS_FEEDS` at real sources + a parser.
- [ ] **Replace placeholder content**
  - [ ] All images are `picsum.photos` (9 files; whitelist real host in `next.config.ts`)
  - [ ] Lorem ipsum in `src/app/blog/[id]/page.tsx`
  - [ ] "Meet the Team (Placeholder)" in `src/app/about/page.tsx`
  - [ ] "View original article" links point to `example.com`

## P2 — Engineering baseline

- [ ] **Add a test suite** — none exists (no jest/vitest/playwright, zero test files). Start with auth + blog CRUD.
- [ ] **Add CI** — no `.github/workflows`. Minimum: lint + typecheck + build on PR; optionally auto-deploy.
- [ ] **Remove scaffolding** — `src/app/api/test/` routes, debug `console.log`s, stale `/home/utka/...` path comments.

## P3 — Architecture (only when a concrete force demands it)

- [ ] **Stay single-repo.** Do NOT split into multiple repos — auth/AI/DB are stubs; there's nothing to separate yet.
- [ ] If internal boundaries become painful, adopt **pnpm/turbo workspaces inside this repo** before considering multi-repo.
- [ ] Extract `src/ai/` to its own deploy **only** if agent runs start exceeding SSR request timeouts or need independent scaling.
