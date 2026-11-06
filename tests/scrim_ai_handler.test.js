// V1.13 — the scrim-ai server function, with a fake Supabase client and a fake AI service.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handle, corsHeaders } from '../supabase/functions/_shared/scrim_ai_handler.js';
import { HEROES } from '../supabase/functions/_shared/catalog.gen.js';

// 1x1 WebP and a text file pretending to be an image.
const WEBP = Buffer.from('UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA', 'base64').toString('base64');
const FAKE = Buffer.from('hello, not an image at all').toString('base64');

function setup({ assigned = true, used = 0, ai = null, aiStatus = 200, key = 'sk-test', uploadError = null } = {}) {
  const log = { uploads: [], inserts: [], calls: [] };
  const db = {
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } }, error: null }) },
    rpc: async (fn) => (fn === 'can_write_title' ? { data: assigned, error: null } : { data: used, error: null }),
    storage: { from: (b) => ({ upload: async (path, bytes, o) => { log.uploads.push({ b, path, n: bytes.length, type: o.contentType }); return { error: uploadError }; } }) },
    from: (t) => ({ insert: async (row) => { log.inserts.push({ t, row }); return { error: null }; } }),
  };
  const fetch = async (url, init) => {
    log.calls.push({ url, body: JSON.parse(init.body), headers: init.headers });
    const body = ai ?? { content: [{ type: 'text', text: JSON.stringify({ screen_kind: 'scoreboard', readable: true, players: [] }) }], stop_reason: 'end_turn', usage: { input_tokens: 1500, output_tokens: 400 } };
    return { ok: aiStatus === 200, status: aiStatus, json: async () => body };
  };
  const deps = { env: { ANTHROPIC_API_KEY: key }, fetch, clientFor: () => db, uuid: () => 'cap-1', heroes: HEROES, now: () => new Date('2026-11-16T05:00:00Z') };
  const call = (body, headers = { authorization: 'Bearer abc' }) => handle({ method: 'POST', headers, json: async () => body }, deps);
  return { call, log };
}

test('scoreboard: stored under the title folder, read as the coach, usage logged, capture saved', async () => {
  const { call, log } = setup();
  const r = await call({ action: 'scoreboard', title: 'MLBB Women', day: '2026-11-16', image: { data: WEBP, mediaType: 'image/webp' } });
  assert.equal(r.status, 200); assert.equal(r.body.captureId, 'cap-1');
  assert.deepEqual(log.uploads[0], { b: 'scrim-captures', path: 'mlbb-women/2026-11-16/cap-1.webp', n: Buffer.from(WEBP, 'base64').length, type: 'image/webp' });
  const req = log.calls[0].body;
  assert.equal(req.model, 'claude-sonnet-5-5'); assert.equal(req.output_config.format.type, 'json_schema');
  assert.equal(req.messages[0].content[0].type, 'image'); assert.match(req.system, /Never estimate/); assert.match(req.system, /Valentina/);
  assert.equal(log.calls[0].headers['x-api-key'], 'sk-test');
  assert.deepEqual(log.inserts.map((i) => i.t), ['ai_usage', 'scrim_captures']);
  assert.equal(log.inserts[0].row.input_tokens, 1500); assert.equal(log.inserts[1].row.data.status, 'extracted'); assert.equal(log.inserts[1].row.data.origin, 'operational');
});

test('refusals: not signed in, not assigned, daily cap, no AI key, wrong file type, too big, unsupported title', async () => {
  assert.equal((await setup().call({ action: 'debrief', title: 'MLBB', text: 'x' }, {})).status, 401);
  assert.match((await setup({ assigned: false }).call({ action: 'debrief', title: 'MLBB', text: 'x' })).body.error, /not assigned to MLBB/);
  assert.match((await setup({ used: 300 }).call({ action: 'debrief', title: 'MLBB', text: 'x' })).body.error, /Daily AI limit reached \(300/);
  assert.match((await setup({ key: '' }).call({ action: 'debrief', title: 'MLBB', text: 'x' })).body.error, /not switched on yet/);
  const fake = setup(); const r = await fake.call({ action: 'scoreboard', title: 'Dota 2', image: { data: FAKE, mediaType: 'image/png' } });
  assert.equal(r.status, 415); assert.equal(fake.log.uploads.length, 0); assert.equal(fake.log.calls.length, 0);
  const big = Buffer.alloc(2_600_000, 1); big.write('RIFF', 0); big.write('WEBP', 8);
  assert.equal((await setup().call({ action: 'scoreboard', title: 'Dota 2', image: { data: big.toString('base64') } })).status, 413);
  assert.match((await setup().call({ action: 'scoreboard', title: 'PUBG Mobile', image: { data: WEBP } })).body.error, /not set up for PUBG Mobile/);
  assert.equal((await setup().call({ action: 'scoreboard', title: 'MLBB', image: { data: 'not*base64' } })).status, 400);
});

test('AI failures: busy, refusal and cut-off answers are logged and fall back to typing by hand', async () => {
  const busy = setup({ aiStatus: 529, ai: { type: 'error', error: { message: 'overloaded' } } });
  const r = await busy.call({ action: 'debrief', title: 'Dota 2', text: 'draft bagus' });
  assert.equal(r.status, 502); assert.match(r.body.error, /busy.*by hand/);
  assert.equal(busy.log.inserts[0].row.ok, false);
  const refused = setup({ ai: { stop_reason: 'refusal', content: [], usage: {} } });
  assert.match((await refused.call({ action: 'debrief', title: 'Dota 2', text: 'x' })).body.error, /declined/);
});

test('debrief and digest: text only, nothing stored, roster passed to the prompt, empty digests refused', async () => {
  const d = setup({ ai: { stop_reason: 'end_turn', content: [{ type: 'text', text: '{"focus":"a"}' }], usage: {} } });
  const r = await d.call({ action: 'debrief', title: 'MLBB', text: 'fokus rotasi', roster: ['Aran', 'Kevin'] });
  assert.equal(r.status, 200); assert.deepEqual(r.body.raw, { focus: 'a' }); assert.equal(d.log.uploads.length, 0);
  assert.match(d.log.calls[0].body.system, /Aran, Kevin/); assert.match(d.log.calls[0].body.system, /Performance only/);
  assert.equal((await setup().call({ action: 'debrief', title: 'MLBB', text: 'x'.repeat(4001) })).status, 413);
  assert.match((await setup().call({ action: 'digest', title: 'MLBB', facts: [] })).body.error, /No confirmed games/);
  const g = setup({ ai: { stop_reason: 'end_turn', content: [{ type: 'text', text: '{"findings":[]}' }], usage: {} } });
  assert.equal((await g.call({ action: 'digest', title: 'MLBB', facts: [{ id: 'all', n: 3 }], excerpts: [] })).status, 200);
  assert.match(g.log.calls[0].body.system, /cites the fact ids/);
});

test('CORS: only listed origins', () => {
  assert.equal(corsHeaders('https://hub.example', 'https://hub.example, https://x.example')['Access-Control-Allow-Origin'], 'https://hub.example');
  assert.equal(corsHeaders('https://evil.example', 'https://hub.example')['Access-Control-Allow-Origin'], undefined);
});
