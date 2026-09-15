# Aidoraa Fashion — Production Readiness TODO

> Status as of review: a styled **Next.js 15 prototype**. The frontend/blog UI is real;
> **auth, AI, and the database are mocks**. This checklist turns the prototype into a
> working product. Items are ordered by dependency and impact.
>
> Hosting: **Vercel** (Git auto-deploy on push to `main` + `vercel` CLI management).

---

## P0 — Blocking for a real product

These are the layers that are currently fake. Nothing real ships until they exist.

- [ ] **Real authentication** — settled on **Supabase** (see `docs/auth-plan.md`).
  - [ ] Install the auth SDK and remove the placeholder logic in `src/contexts/AuthContext.tsx`
  - [ ] Wire email/password + at least one OAuth provider (replace dead GitHub button in `src/components/auth/AuthModal.tsx`)
  - [ ] Server-side session/route protection for `/api/*` and gated pages
  - [ ] Enable the disabled **Profile** buttons in `src/components/global/Header.tsx` + add a profile route
- [ ] **Persistent database** (currently in-memory arrays that reset on cold start)
  - [ ] Pick a store: **Supabase Postgres** (deploy is Vercel; no Firestore).
  - [ ] **Merge the two divergent blog services** — `src/services/blog.ts` (pages) and `src/services/blog-service.ts` (API) read from different stores, so API writes never appear on rendered pages
  - [ ] Move blog CRUD + RSS persistence behind the real store
- [ ] **Wire the AI layer** (OpenRouter client lives in `src/lib/ai/openrouter.ts`; no Genkit)
  - [ ] Replace FashionDaddy canned reply (`src/components/fashiondaddy/FashionDaddyApp.tsx` ~L131) with a real OpenRouter call via an API route
  - [ ] Replace DatePlanner keyword `if/else` (`src/components/dateplanner/DatePlannerApp.tsx`) with a real model call
  - [ ] Confirm `OPENROUTER_API_KEY` (+ `OPENROUTER_MODEL`) is set in Vercel env (all environments).
- [ ] **Contact form** does nothing — `src/app/contact/contact-form.tsx` just `alert()`s. Add an endpoint + email/store.

## P1 — Correctness & deploy hygiene

- [ ] **Deploy target settled: Vercel.** Git auto-deploy on push to `main` + `vercel` CLI for env; `output: 'standalone'` in `next.config.ts` is harmless there.
- [ ] Confirm whether `src/lib/platform.ts` detection is still needed (nothing consumes it)
- [ ] **Keep `.env.example` in sync** as keys are added (`OPENROUTER_*`, Supabase, Razorpay, future `ATROS_*`/`SANDBOX_*`).
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
