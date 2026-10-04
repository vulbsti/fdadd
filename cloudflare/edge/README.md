# Aidoraa edge Worker

One Cloudflare Worker per environment (`aidoraa-edge-staging`,
`aidoraa-edge-production`) with two jobs:

- `/o/<key>`: private object store on R2 for Pi checkpoint archives and
  content-addressed file blobs. A write is rejected unless the bytes hash to
  the digest in the key.
- `/runs/<runId>/events` and `/runs/<runId>/stream`: one `RunStream` Durable
  Object per run. The Pi runner posts live events; the owner's browser reads
  them as server-sent events and can resume from any sequence number.

The app and the Worker share one secret, `EDGE_SIGNING_SECRET`. The app signs
short-lived capabilities (`src/lib/edge/client.ts`); the Worker verifies them
(`src/token.mjs`): `run` for one sandbox, `watch` for one browser, `server`
for Vercel functions. The app uses the Worker only when both `EDGE_ORIGIN` and
`EDGE_SIGNING_SECRET` are set; otherwise it keeps using Supabase Storage and
the events route.

## Deploy

    npx wrangler login
    npm run deploy:edge -- --env staging
    npm run deploy:edge -- --env production

The Worker changes rarely and is deployed by hand, not by the release
workflow. Rotate the secret with
`npx wrangler secret put EDGE_SIGNING_SECRET --config cloudflare/edge/wrangler.jsonc --env <env>`
and the matching Vercel variable (Preview for staging, Production for
production) in the same sitting.

## Free plan budget

Workers and Durable Objects each allow 100,000 requests a day. The runner
posts at most four batches a second while text is streaming, so a day covers
several hours of streamed answers. Past the limit the runner falls back to
the broker path and answers still publish.
