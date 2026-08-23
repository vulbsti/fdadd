# Auth Implementation Plan — Supabase

**Goal:** Replace the mock auth in `src/contexts/AuthContext.tsx` with real **Supabase Auth**,
using the modern `@supabase/ssr` cookie-based session pattern for Next.js 15 App Router.

**Decision:** Supabase (chosen 2026-06). The commented-out code in `AuthContext.tsx` already
targets Supabase, so this realizes the original intent. Note: we deploy on **Firebase App Hosting**
(Next.js SSR backend) — that's fine; Supabase is just an external service the backend talks to.
The `firebase` npm SDK currently shipped is unused and should be removed unless kept for Hosting only.

---

## Current state (what we're replacing)

| File | Today | After |
|---|---|---|
| `src/contexts/AuthContext.tsx` | `setTimeout` fakes, hardcoded `test@example.com`/`password`, commented Supabase | Real browser client + `onAuthStateChange` |
| `src/components/auth/AuthModal.tsx` | dead GitHub button, `alert()` on password mismatch | Working email/password + OAuth |
| `src/components/global/Header.tsx` | `disabled` Profile buttons | Enabled, links to `/profile` |
| _(none)_ | — | `middleware.ts`, `src/lib/supabase/*`, `/auth/callback` route, `/profile` page |

There is **no `@supabase/supabase-js` dependency installed yet**.

---

## Why three clients (the core concept)

Supabase sessions are stored in **cookies**. In the App Router:
- **Server Components** can *read* cookies but **cannot write** them → can't refresh a session.
- **Middleware** and **Route Handlers / Server Actions** *can* write cookies → they refresh.

So we create three thin factories so each context uses the right one:
1. **Browser client** — Client Components (the `AuthContext` provider, login modal).
2. **Server client** — Server Components, Route Handlers, Server Actions (reads session, runs queries with the user's RLS context).
3. **Middleware client** — refreshes the session cookie on every request so it never goes stale.

---

## Phase 0 — Supabase project setup (no code)

- [ ] Create a Supabase project; note **Project URL** and **anon/publishable key**.
- [ ] Enable **Email** provider; configure **GitHub** OAuth (matches existing UI) with callback `https://aidoraa-fashion.web.app/auth/callback` (+ a localhost entry for dev).
- [ ] (If using Supabase as the DB too) create tables with **Row Level Security ON** from day one.

## Phase 1 — Dependencies & env

- [ ] `npm i @supabase/supabase-js @supabase/ssr`
- [ ] Add to `.env.local` **and** create `.env.example`:
  ```
  NEXT_PUBLIC_SUPABASE_URL=...
  NEXT_PUBLIC_SUPABASE_ANON_KEY=...
  ```
- [ ] Set the same two vars in **Firebase App Hosting** environment config (they're `NEXT_PUBLIC_`, so safe to expose; the anon key is designed to be public — RLS is what protects data).

## Phase 2 — Client factories (`src/lib/supabase/`)

- [ ] `client.ts` — `createBrowserClient(url, anonKey)` for Client Components.
- [ ] `server.ts` — `createServerClient(...)` wired to `next/headers` `cookies()` (get/set/remove).
- [ ] `middleware.ts` helper — `createServerClient` bound to the request/response cookies, calls `supabase.auth.getUser()` to trigger refresh.

## Phase 3 — Root middleware (`middleware.ts` at repo root)

- [ ] Call the Phase 2 middleware helper to refresh the session on every request.
- [ ] Add a `matcher` excluding static assets (`_next/static`, images, favicon).
- [ ] (Optional now, recommended) redirect unauthenticated users away from gated routes here.

## Phase 4 — Rewrite `AuthContext.tsx`

- [ ] Replace mock state with the **browser client**.
- [ ] On mount: `getUser()` for initial state; subscribe to `onAuthStateChange` to keep React state in sync; unsubscribe on unmount.
- [ ] Implement real `signInWithEmail`, `signUp`, `signInWithGitHub` (`signInWithOAuth({ provider: 'github', options: { redirectTo: '/auth/callback' } })`), `signOut`.
- [ ] Keep the existing `User` shape the components consume (`id`, `email`, `user_metadata`) so `Header.tsx`/`AuthModal.tsx` need minimal changes — Supabase's `User` already provides these.
- [ ] Delete all `setTimeout` simulation and the hardcoded credential branch.

## Phase 5 — OAuth callback route

- [ ] Add `src/app/auth/callback/route.ts`: read `?code`, call `supabase.auth.exchangeCodeForSession(code)` (server client), then redirect to `next` or `/`. Required for the OAuth redirect to complete and set cookies.

## Phase 6 — UI cleanup

- [ ] `AuthModal.tsx`: wire real handlers, replace `alert()` password-mismatch with inline form error (you already have `react-hook-form` + `zod` — use them), remove "OAuth Placeholder" comment.
- [ ] `Header.tsx`: remove `disabled` on Profile buttons; link to `/profile`.
- [ ] Add a minimal `src/app/profile/page.tsx` (Server Component) that reads the user via the **server client** and redirects to home if unauthenticated.

## Phase 7 — Protect the backend

- [ ] In gated **Route Handlers** (`src/app/api/blog` POST/PUT/DELETE, future endpoints), get the user via the server client and return `401` if absent. Don't rely on middleware alone for writes.
- [ ] If/when blog data moves to Supabase tables, enforce **RLS** so the anon key can't mutate other users' data.

## Phase 8 — Verify

- [ ] Email sign-up → confirm → sign-in works; session persists across refresh (cookie, not memory).
- [ ] GitHub OAuth round-trips through `/auth/callback`.
- [ ] Sign-out clears the session everywhere.
- [ ] A protected API write returns `401` when logged out.
- [ ] Deploy to Firebase App Hosting and re-run the above against `aidoraa-fashion.web.app` (cookie domain/redirect URLs are the usual breakage point).

---

## Risks & notes

- **Redirect URLs** are the #1 OAuth failure: every callback URL (prod + localhost) must be registered in both the Supabase dashboard and the GitHub OAuth app.
- **Middleware on Firebase App Hosting**: middleware runs in the SSR backend (Cloud Run), not at a separate edge — functionally fine, just be aware it's not Vercel Edge.
- **Don't introduce a second source of truth**: this is also when the DB decision lands. If blog/profile data moves to Supabase Postgres, retire the in-memory `blog-service.ts` store in the same effort (see `TODO.md` P0 database item).
- **Remove `firebase` SDK** from `package.json` if it stays unused after this — avoid shipping two auth stacks.
