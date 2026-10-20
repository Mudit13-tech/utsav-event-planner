import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { createApp } from '../src/app.js';
import { createAiService } from '../src/services/gemini.js';
import { FIXED_NOW, fakeGenAiClient, sampleIdeas, silentLogger, testConfig, validInput } from './helpers.js';

/** Starts the app on an ephemeral port and returns a tiny fetch client. */
async function startServer({ env = {}, client = null } = {}) {
  const config = testConfig(env);
  const ai = createAiService({ config, client, logger: silentLogger });
  const app = createApp({ config, ai, now: () => FIXED_NOW, logger: silentLogger });
  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (path, body, raw = false) =>
    fetch(`${base}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: raw ? body : JSON.stringify(body) });
  return { server, base, post, close: () => new Promise((resolve) => server.close(resolve)) };
}

describe('API (AI offline)', () => {
  let ctx;
  before(async () => {
    ctx = await startServer();
  });
  after(() => ctx.close());

  it('GET /api/health reports fallback mode', async () => {
    const res = await fetch(`${ctx.base}/api/health`);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { status: 'ok', ai: 'fallback', model: null });
  });

  it('POST /api/plan returns the complete deterministic plan', async () => {
    const res = await ctx.post('/api/plan', validInput());
    assert.equal(res.status, 200);
    const plan = await res.json();
    for (const key of ['summary', 'budget', 'timeline', 'vendors', 'insights']) assert.ok(plan[key], key);
    assert.equal(plan.budget.lines.reduce((s, l) => s + l.amount, 0), 1_500_000);
  });

  it('POST /api/ideas falls back to built-in ideas', async () => {
    const res = await ctx.post('/api/ideas', validInput());
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.aiSource, 'fallback');
    assert.ok(body.ideas.themes.length > 0);
  });

  it('POST /api/ideas validates input', async () => {
    assert.equal((await ctx.post('/api/ideas', { eventType: 'party' })).status, 400);
  });

  it('POST /api/plan rejects invalid input with details', async () => {
    const res = await ctx.post('/api/plan', validInput({ guestCount: -1, eventDate: '2020-01-01' }));
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.error, 'Invalid event details');
    assert.equal(body.details.length, 2);
  });

  it('rejects malformed JSON and oversized bodies', async () => {
    assert.equal((await ctx.post('/api/plan', '{"eventType":', true)).status, 400);
    const huge = JSON.stringify({ ...validInput(), notes: 'x'.repeat(20_000) });
    assert.equal((await ctx.post('/api/plan', huge, true)).status, 413);
  });

  it('POST /api/chat answers using the offline assistant', async () => {
    const res = await ctx.post('/api/chat', { event: validInput(), message: 'What is my budget per guest?', history: [] });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.aiSource, 'fallback');
    assert.match(body.reply, /per guest/);
  });

  it('POST /api/chat validates the message', async () => {
    const res = await ctx.post('/api/chat', { event: validInput(), message: '' });
    assert.equal(res.status, 400);
  });

  it('returns JSON 404 for unknown API routes', async () => {
    const res = await fetch(`${ctx.base}/api/nope`);
    assert.equal(res.status, 404);
    assert.deepEqual(await res.json(), { error: 'Not found' });
  });

  it('serves the web app with strict security headers', async () => {
    const res = await fetch(`${ctx.base}/`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /text\/html/);
    const csp = res.headers.get('content-security-policy');
    assert.match(csp, /default-src 'self'/);
    assert.match(csp, /script-src 'self'/);
    assert.match(csp, /frame-ancestors 'none'/);
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(res.headers.get('x-powered-by'), null);
    assert.equal(res.headers.get('cache-control'), 'no-cache');
    assert.match(await res.text(), /Utsav/);
  });

  it('compresses responses', async () => {
    const res = await fetch(`${ctx.base}/css/styles.css`, { headers: { 'Accept-Encoding': 'gzip' } });
    assert.equal(res.headers.get('content-encoding'), 'gzip');
    // Unversioned assets must revalidate so a deploy never mixes new HTML with stale JS.
    assert.equal(res.headers.get('cache-control'), 'no-cache');
    assert.ok(res.headers.get('etag'));
  });
});

describe('API (Gemini live)', () => {
  let ctx;
  let client;
  before(async () => {
    client = fakeGenAiClient([sampleIdeas(), 'Start with the venue.']);
    ctx = await startServer({ client });
  });
  after(() => ctx.close());

  it('reports the Gemini model in health', async () => {
    const body = await (await fetch(`${ctx.base}/api/health`)).json();
    assert.deepEqual(body, { status: 'ok', ai: 'gemini', model: 'gemini-3.5-flash-lite' });
  });

  it('returns Gemini ideas', async () => {
    const body = await (await ctx.post('/api/ideas', validInput())).json();
    assert.equal(body.aiSource, 'gemini');
    assert.equal(body.ideas.themes[0].name, 'Rajwada Royale');
  });

  it('keeps /api/plan free of AI calls', async () => {
    const before = client.calls.length;
    await ctx.post('/api/plan', validInput());
    assert.equal(client.calls.length, before);
  });

  it('returns Gemini chat replies', async () => {
    const body = await (await ctx.post('/api/chat', { event: validInput(), message: 'Where do I start?' })).json();
    assert.deepEqual(body, { reply: 'Start with the venue.', aiSource: 'gemini' });
  });
});

describe('API rate limiting', () => {
  let ctx;
  before(async () => {
    ctx = await startServer({ env: { RATE_LIMIT_MAX: '2' } });
  });
  after(() => ctx.close());

  it('returns 429 after the configured number of requests', async () => {
    const statuses = [];
    for (let i = 0; i < 3; i += 1) statuses.push((await fetch(`${ctx.base}/api/health`)).status);
    assert.deepEqual(statuses, [200, 200, 429]);
  });
});
