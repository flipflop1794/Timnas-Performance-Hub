// Integration test of the scrim-ai function on a local stack (see tools/local-stack/README.md):
// real @supabase/supabase-js client → gateway → real PostgREST / Postgres rules and the real function under Deno.
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync } from 'node:fs';
import pg from 'pg';
import assert from 'node:assert/strict';

const URL = 'http://127.0.0.1:54321';
const ANON = readFileSync('/opt/stack/anon.key', 'utf8').trim();
const users = JSON.parse(readFileSync('/opt/stack/users.json', 'utf8'));
const REAL = JSON.parse(readFileSync(new globalThis.URL('../../tests/fixtures/mlbb_real_screens.json', import.meta.url), 'utf8'));
const db = new pg.Client({ connectionString: 'postgres://postgres:localtest@localhost:5432/stack' }); await db.connect();
const queue = (...answers) => writeFileSync('/opt/stack/ai_queue.json', JSON.stringify(answers));
const jpeg = readFileSync('/opt/eval/mlbb/s1.jpg').toString('base64');
let ok = 0; const step = async (name, fn) => { try { await fn(); ok++; console.log(`ok   ${name}`); } catch (e) { console.log(`FAIL ${name}\n     ${e.message.split('\n').slice(0, 4).join('\n     ')}`); process.exitCode = 1; } };
async function as(key) {
  const u = users.find((x) => x.key === key);
  const c = createClient(URL, ANON, { auth: { persistSession: false } });
  const { error } = await c.auth.signInWithPassword({ email: u.email, password: u.password }); if (error) throw error;
  const call = async (body) => { const { data, error: e } = await c.functions.invoke('scrim-ai', { body }); if (e) { const j = await e.context.json().catch(() => ({})); return { status: e.context.status, error: j.error }; } return { status: 200, data }; };
  return { c, u, call };
}
await db.query('delete from ai_usage; delete from scrim_games; delete from scrim_reports; delete from scrim_captures');
await db.query(`set storage.allow_delete_query = 'true'; delete from storage.objects where bucket_id = 'scrim-captures'`);

const indra = await as('indra'); const christie = await as('christie'); const greg = await as('greg'); const aufa = await as('aufa');

await step('MLBB coach: real JPEG screenshot → stored under mlbb/, read by the AI, capture saved as him', async () => {
  queue(REAL[0].raw);
  const r = await indra.call({ action: 'scoreboard', title: 'MLBB', day: '2026-11-16', image: { data: jpeg, mediaType: 'image/jpeg' } });
  assert.equal(r.status, 200, JSON.stringify(r)); assert.ok(r.data.captureId); assert.equal(r.data.raw.outcome, 'defeat');
  const { rows: [o] } = await db.query(`select name, owner, metadata->>'mimetype' as t from storage.objects where bucket_id = 'scrim-captures'`);
  assert.equal(o.name, `mlbb/2026-11-16/${r.data.captureId}.jpg`); assert.equal(o.owner, indra.u.id); assert.equal(o.t, 'image/jpeg');
  const { rows: [cap] } = await db.query('select title, created_by, data from scrim_captures where id = $1', [r.data.captureId]);
  assert.equal(cap.title, 'MLBB'); assert.equal(cap.created_by, indra.u.id); assert.equal(cap.data.status, 'extracted'); assert.equal(cap.data.promptVersion, 'scrim-ai-2026-11-07.4');
  const { rows: [u] } = await db.query('select user_id, action, input_tokens, ok, attempts from ai_usage'); assert.deepEqual([u.user_id, u.action, u.input_tokens, u.ok, u.attempts], [indra.u.id, 'scoreboard', 1800, true, 1]);
  const log = readFileSync('/opt/stack/ai_log.jsonl', 'utf8').trim().split('\n').map(JSON.parse).at(-1);
  assert.equal(log.key, 'sk-local-test'); assert.equal(log.hasImage, true); assert.ok(log.schemaKeys.includes('outcome'));
});
await step('coach reads the capture through the API; a PUBG Mobile coach cannot', async () => {
  const a = await indra.c.from('scrim_captures').select('id'); assert.equal(a.data.length, 1);
  const b = await christie.c.from('scrim_captures').select('id'); assert.equal(b.data.length, 0);
  const s1 = await indra.c.from('ai_usage').select('id'); assert.equal(s1.data.length, 1);
  const s2 = await christie.c.from('ai_usage').select('id'); assert.equal(s2.data.length, 0);
  const s3 = await aufa.c.from('ai_usage').select('id'); assert.equal(s3.data.length, 1, 'admin sees all usage');
});
await step('refused: other title, unsupported title, fake image, too large, not signed in', async () => {
  assert.match((await christie.call({ action: 'scoreboard', title: 'MLBB', image: { data: jpeg, mediaType: 'image/jpeg' } })).error, /not assigned to MLBB/);
  assert.match((await indra.call({ action: 'scoreboard', title: 'Dota 2', image: { data: jpeg, mediaType: 'image/jpeg' } })).error, /not assigned to Dota 2/);
  assert.match((await christie.call({ action: 'scoreboard', title: 'PUBG Mobile', image: { data: jpeg, mediaType: 'image/jpeg' } })).error, /not set up for PUBG Mobile/);
  assert.equal((await indra.call({ action: 'scoreboard', title: 'MLBB', image: { data: Buffer.from('<svg/>').toString('base64'), mediaType: 'image/png' } })).status, 415);
  assert.equal((await indra.call({ action: 'scoreboard', title: 'MLBB', image: { data: Buffer.alloc(2_600_000, 0xff).toString('base64') } })).status, 413);
  const anon = createClient(URL, ANON, { auth: { persistSession: false } });
  const { error } = await anon.functions.invoke('scrim-ai', { body: { action: 'debrief', title: 'MLBB', text: 'x' } });
  assert.equal(error.context.status, 401);
});
await step('Dota coach: screenshot for Dota 2 goes to dota-2/', async () => {
  queue({ screen_kind: 'result', readable: true, outcome: 'radiant_victory', duration_seconds: 2052, score: { radiant: 34, dire: 9 }, team_names: { radiant: 'Indonesia', dire: 'P' }, players: [], notes: '' });
  const r = await greg.call({ action: 'scoreboard', title: 'Dota 2', image: { data: jpeg, mediaType: 'image/jpeg' } });
  assert.equal(r.status, 200, JSON.stringify(r));
  const { rows } = await db.query(`select name from storage.objects where name like 'dota-2/%'`); assert.equal(rows.length, 1);
});
await step('AI answer in the wrong form: refused, logged with ok=false, coach told to type by hand', async () => {
  queue('not an object');
  const r = await indra.call({ action: 'debrief', title: 'MLBB', text: 'fokus rotasi' });
  assert.equal(r.status, 502); assert.match(r.error, /not in the expected form.*by hand/);
  const { rows: [u] } = await db.query('select ok, error from ai_usage order by id desc limit 1'); assert.equal(u.ok, false); assert.match(u.error, /expected form/);
});
await step('debrief and digest round trips', async () => {
  queue({ focus: 'rotasi', worked: 'draft', failed: '', adjust: 'vision', player_notes: '', detail: '', not_placed: '' });
  const r = await indra.call({ action: 'debrief', title: 'MLBB', text: 'fokus rotasi, draft bagus, next vision', roster: ['Aran'] });
  assert.equal(r.data.raw.focus, 'rotasi');
  queue({ findings: [] });
  const d = await indra.call({ action: 'digest', title: 'MLBB', facts: [{ id: 'all', n: 3 }], excerpts: [] });
  assert.deepEqual(d.data.raw, { findings: [] });
});
await step('daily cap: refused at the cap, counted per person', async () => {
  const n = (await db.query('select count(*)::int n from ai_usage where user_id = $1', [indra.u.id])).rows[0].n;
  await db.query('begin'); await db.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: indra.u.id })]);
  await db.query(`insert into ai_usage (user_id, title, action, model, ok) select $1, 'MLBB', 'debrief', 'm', true from generate_series(1, $2)`, [indra.u.id, 40 - n]); await db.query('commit');
  const r = await indra.call({ action: 'debrief', title: 'MLBB', text: 'x' });
  assert.equal(r.status, 429); assert.match(r.error, /Daily AI limit reached \(40 calls\)/);
  queue({ focus: '', worked: '', failed: '', adjust: '', player_notes: '', detail: '', not_placed: '' });
  assert.equal((await greg.call({ action: 'debrief', title: 'Dota 2', text: 'x' })).status, 200, 'another coach is not affected');
});
await step('games through the API: insert-only, must belong to a same-title report, title-scoped', async () => {
  const rep = { id: 'RP-IT-1', title: 'MLBB', date: '2026-11-16', by: 'Coach Indra', partner: 'ONIC', result: { mode: 'wl', won: 1, lost: 0, drawn: 0 }, focus: 'f', progress: 4, worked: 'w', adjust: 'a', notes: [], origin: 'operational', createdAt: '2026-11-16T10:00:00Z' };
  assert.equal((await indra.c.from('scrim_reports').insert({ id: rep.id, data: rep })).error, null);
  const g = { id: 'GM-IT-1', title: 'MLBB', reportId: rep.id, players: [], result: 'win', origin: 'operational' };
  assert.equal((await indra.c.from('scrim_games').insert({ id: g.id, data: g })).error, null);
  assert.match((await indra.c.from('scrim_games').insert({ id: 'GM-IT-2', data: { ...g, reportId: 'nope' } })).error.message, /Save the report first/);
  const up = await indra.c.from('scrim_games').update({ data: { ...g, result: 'loss' } }).eq('id', g.id).select();
  assert.equal(up.data?.length ?? 0, 0, 'no update policy: nothing changes');
  assert.equal((await christie.c.from('scrim_games').select('id')).data.length, 0);
  assert.equal((await aufa.c.from('scrim_games').select('id')).data.length, 1);
});
await step('CORS: preflight answers only the hub\'s own site', async () => {
  const a = await fetch('http://127.0.0.1:8000/', { method: 'OPTIONS', headers: { origin: 'http://127.0.0.1:8080' } });
  const b = await fetch('http://127.0.0.1:8000/', { method: 'OPTIONS', headers: { origin: 'https://evil.example' } });
  assert.equal(a.headers.get('access-control-allow-origin'), 'http://127.0.0.1:8080'); assert.equal(b.headers.get('access-control-allow-origin'), null);
});
console.log(`\n${ok} steps passed`);
await db.end();
