/**
 * A local stand-in for the app's Pi broker (src/app/api/astrologer/pi/...).
 * It answers the runner's state, event and checkpoint calls in memory and
 * forwards model calls to the same provider endpoint and model the app uses.
 */
import { createServer } from 'node:http';

const PROVIDER = 'https://opencode.ai/zen/go/v1/responses';

export async function startBroker({ astrologyEnabled = true, birthRevision = 1, onEvent = () => {} } = {}) {
  const key = process.env.OPENCODE_API_KEY?.trim() || process.env.OPENGO_API?.trim();
  if (!key) throw new Error('OPENCODE_API_KEY is not set; the evaluation needs the model provider key.');
  const usage = [];
  const server = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8') || 'null') : null;
    const [, sessionId, ...rest] = req.url.split('/');
    const operation = rest.join('/');
    const json = (value, status = 200) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(value)); };
    try {
      if (operation === 'state') return json({ astrologyEnabled, birthRevision });
      if (operation === 'restore') return json(null);
      if (operation === 'events') { for (const event of body?.events ?? []) onEvent(sessionId, event); return json({ accepted: true }); }
      if (['checkpoint/part', 'checkpoint/commit', 'blob/commit', 'checkpoint'].includes(operation)) return json({ accepted: true });
      if (operation !== 'model/responses') return json({ error: 'Unsupported operation.' }, 404);
      if (!body || body.model !== 'gpt-6-luna' || !Array.isArray(body.input)) return json({ error: 'Unsupported model request.' }, 400);
      const upstream = await fetch(PROVIDER, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'content-type': 'application/json', 'x-opencode-session': sessionId },
        body: JSON.stringify({ ...body, model: 'gpt-6-luna', store: false, tool_choice: body.tools?.length ? 'auto' : undefined, temperature: undefined }),
        signal: AbortSignal.timeout(240_000),
      });
      usage.push({ sessionId, status: upstream.status, at: new Date().toISOString() });
      res.writeHead(upstream.status, { 'content-type': upstream.headers.get('content-type') ?? 'text/event-stream' });
      if (!upstream.body) return res.end();
      for await (const chunk of upstream.body) res.write(chunk);
      res.end();
    } catch (error) {
      json({ error: String(error?.message ?? error) }, 500);
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return {
    url: (sessionId) => `http://127.0.0.1:${port}/${sessionId}`,
    usage,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}
