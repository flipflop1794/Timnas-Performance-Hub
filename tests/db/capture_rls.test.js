// V1.13 scrim capture tables: Row Level Security tests on a real Postgres, using the production migrations plus a small Supabase stand-in.
// Needs a Postgres server: DATABASE_URL (default postgres://postgres:localtest@localhost:5432/postgres).
// Skipped when no server is reachable, unless REQUIRE_DB=1 (CI), where a missing server fails the run.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

const URL0 = process.env.DATABASE_URL || 'postgres://postgres:localtest@localhost:5432/postgres';
const root = new URL('../../', import.meta.url);
const sql = (p) => readFileSync(new URL(p, root), 'utf8');
const dbName = `hub_cap_${Date.now()}`;
let admin0, db, available = true;

const U = Object.fromEntries(['aufa', 'fayad', 'donny', 'indra', 'christie', 'nobody'].map((k) => [k, randomUUID()]));

before(async () => {
  admin0 = new pg.Client({ connectionString: URL0 });
  try { await admin0.connect(); } catch (e) { available = false; if (process.env.REQUIRE_DB === '1') throw e; return; }
  await admin0.query(`create database ${dbName}`);
  db = new pg.Client({ connectionString: URL0.replace(/\/[^/]*$/, `/${dbName}`) });
  await db.connect();
  await db.query(sql('tests/db/supabase_stub.sql'));
  for (const f of readdirSync(new URL('supabase/migrations/', root)).sort()) await db.query(sql(`supabase/migrations/${f}`));
  for (const [k, id] of Object.entries(U)) await db.query('insert into auth.users (id, email) values ($1, $2)', [id, `${k}@example.test`]);
  const role = (k, r) => db.query('insert into public.user_roles (user_id, role) values ($1, $2)', [U[k], r]);
  const title = (k, t) => db.query('insert into public.user_titles (user_id, title) values ($1, $2)', [U[k], t]);
  await role('aufa', 'admin'); await role('aufa', 'assistant_coach'); await title('aufa', 'Dota 2'); await title('aufa', 'MLBB');
  await role('fayad', 'head_coach');
  await role('donny', 'assistant_coach'); await role('donny', 'readiness_owner');
  await role('indra', 'title_coach'); await title('indra', 'MLBB');
  await role('christie', 'title_coach'); await title('christie', 'PUBG Mobile');
});
after(async () => {
  if (!available) return;
  await db.end(); await admin0.query(`drop database ${dbName}`); await admin0.end();
});

// Run fn as a signed-in user (or anon) inside one transaction, like a PostgREST request.
async function as(who, fn) {
  await db.query('begin');
  try {
    if (who === 'anon') await db.query('set local role anon');
    else { await db.query('set local role authenticated'); await db.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: U[who], role: 'authenticated' })]); }
    const out = await fn((q, p) => db.query(q, p));
    await db.query('commit'); return out;
  } catch (e) { await db.query('rollback'); throw e; }
}
const rows = async (who, q, p) => (await as(who, (x) => x(q, p))).rows;
const report = (id, title, extra = {}) => ({ id, title, date: '2026-11-10', by: 'Coach', partner: 'X', result: { mode: 'wl', won: 2, lost: 1, drawn: 0 }, focus: 'f', progress: 4, worked: 'w', adjust: 'a', notes: [], origin: 'operational', createdAt: '2026-11-10T10:00:00Z', ...extra });
const insReport = (who, r, createdBy) => as(who, (x) => x('insert into public.scrim_reports (id, data, created_by) values ($1, $2, $3)', [r.id, r, createdBy ?? U[who]]));
const t = (name, fn) => test(name, async (ctx) => { if (!available) return ctx.skip('no Postgres server'); await fn(); });


const game = (id, title, reportId, extra = {}) => ({ id, title, reportId, date: '2026-11-16', gameNo: 1, ourSide: 'blue', result: 'win', players: [], origin: 'operational', createdAt: '2026-11-16T10:00:00Z', ...extra });
const insGame = (who, g) => as(who, (x) => x('insert into public.scrim_games (id, data, created_by) values ($1, $2, $3)', [g.id, g, U[who]]));

t('confirmed games: belong to a report of the same title, title-scoped, insert-only', async () => {
  await insReport('indra', report('RP-M1', 'MLBB'));
  await insGame('indra', game('GM-1', 'MLBB', 'RP-M1'));
  const [g] = await rows('aufa', 'select title, created_by from public.scrim_games where id = $1', ['GM-1']);
  assert.equal(g.title, 'MLBB'); assert.equal(g.created_by, U.indra);
  await assert.rejects(insGame('indra', game('GM-2', 'MLBB', 'RP-none')), /Save the report first/);
  await assert.rejects(insGame('indra', game('GM-3', 'MLBB', '')), /must belong to a scrim report/);
  await insReport('christie', report('RP-P1', 'PUBG Mobile'));
  await assert.rejects(insGame('christie', game('GM-4', 'MLBB', 'RP-M1')), /row-level security/);
  await assert.rejects(insGame('aufa', game('GM-5', 'MLBB', 'RP-P1')), /same title/);
  assert.equal((await rows('christie', 'select id from public.scrim_games')).length, 0);
  assert.equal((await as('indra', (x) => x(`update public.scrim_games set data = jsonb_set(data, '{result}', '"loss"')`))).rowCount, 0);
  await assert.rejects(db.query(`update public.scrim_games set data = jsonb_set(data, '{result}', '"loss"')`), /cannot be changed/);
  // A fix is a new row that supersedes the old one.
  await insGame('indra', game('GM-6', 'MLBB', 'RP-M1', { supersedes: 'GM-1', result: 'loss' }));
  assert.equal((await rows('fayad', 'select id from public.scrim_games')).length, 2);
});

t('captures, findings and learnt names: read by title, written by assigned coaches, demo data refused', async () => {
  const cap = { title: 'MLBB', kind: 'scoreboard', status: 'extracted', origin: 'operational' };
  await as('indra', (x) => x('insert into public.scrim_captures (id, data, created_by) values ($1, $2, $3)', ['C1', cap, U.indra]));
  await as('indra', (x) => x(`update public.scrim_captures set data = jsonb_set(data, '{status}', '"confirmed"') where id = 'C1'`));
  assert.equal((await rows('fayad', `select data->>'status' as s from public.scrim_captures where id = 'C1'`))[0].s, 'confirmed');
  assert.equal((await rows('christie', 'select * from public.scrim_captures')).length, 0);
  await assert.rejects(as('christie', (x) => x('insert into public.pattern_findings (id, data, created_by) values ($1, $2, $3)', ['F1', { title: 'MLBB', origin: 'operational' }, U.christie])), /row-level security/);
  await as('aufa', (x) => x('insert into public.pattern_findings (id, data, created_by) values ($1, $2, $3)', ['F2', { title: 'MLBB', status: 'new', origin: 'operational' }, U.aufa]));
  await as('indra', (x) => x(`update public.pattern_findings set data = jsonb_set(data, '{status}', '"useful"') where id = 'F2'`));
  assert.equal((await rows('aufa', `select updated_by from public.pattern_findings where id = 'F2'`))[0].updated_by, U.indra);
  await assert.rejects(as('indra', (x) => x('insert into public.player_aliases (id, data, created_by) values ($1, $2, $3)', ['A1', { title: 'MLBB', origin: 'demo' }, U.indra])), /Only operational records/);
  assert.equal((await as('indra', (x) => x(`delete from public.scrim_captures where id = 'C1'`))).rowCount, 0, 'only admins delete');
  const a = await rows('aufa', `select action from public.audit_log where table_name = 'scrim_captures' and row_id = 'C1'`);
  assert.deepEqual(a.map((r) => r.action).sort(), ['insert', 'update']);
});

t('AI usage: stamped with the caller, own rows only (admins all), counted per WIB day, cannot be edited', async () => {
  const add = (who, title) => as(who, (x) => x('insert into public.ai_usage (user_id, title, action, model, input_tokens, output_tokens, ok) values ($1, $2, $3, $4, $5, $6, $7)', [U.fayad, title, 'scoreboard', 'm', 1500, 400, true]));
  await add('indra', 'MLBB'); await add('indra', 'MLBB');
  await assert.rejects(add('christie', 'MLBB'), /row-level security/);
  const mine = await rows('indra', 'select user_id from public.ai_usage');
  assert.equal(mine.length, 2); assert.ok(mine.every((r) => r.user_id === U.indra), 'claimed user is replaced by the caller');
  assert.equal((await rows('christie', 'select * from public.ai_usage')).length, 0);
  assert.equal((await rows('aufa', 'select * from public.ai_usage')).length, 2);
  assert.equal((await rows('indra', 'select public.ai_calls_today() as n'))[0].n, 2);
  assert.equal((await rows('christie', 'select public.ai_calls_today() as n'))[0].n, 0);
  await assert.rejects(as('aufa', (x) => x('update public.ai_usage set ok = false')), /permission denied/);
  assert.equal((await rows('indra', `select public.title_from_slug('mlbb-women') as t`))[0].t, 'MLBB Women');
  assert.equal((await rows('indra', `select public.title_from_slug('dota-2') as t`))[0].t, 'Dota 2');
});
