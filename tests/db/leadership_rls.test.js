// V1.19 Leadership role (Ketua BTN, Dewan Pengawas): reads every title, writes nothing, no wellbeing.
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
const dbName = `hub_lead_${Date.now()}`;
let admin0, db, available = true;
const U = Object.fromEntries(['aufa', 'ketua', 'indra', 'donny'].map((k) => [k, randomUUID()]));

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
  await role('aufa', 'admin');
  await role('ketua', 'leadership');
  await role('indra', 'title_coach'); await db.query('insert into public.user_titles (user_id, title) values ($1, $2)', [U.indra, 'MLBB']);
  await role('donny', 'readiness_owner');
});
after(async () => {
  if (!available) return;
  await db.end(); await admin0.query(`drop database ${dbName}`); await admin0.end();
});

async function as(who, fn) {
  await db.query('begin');
  try {
    await db.query('set local role authenticated');
    await db.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: U[who], role: 'authenticated' })]);
    const out = await fn((q, p) => db.query(q, p));
    await db.query('commit'); return out;
  } catch (e) { await db.query('rollback'); throw e; }
}
const rows = async (who, q, p) => (await as(who, (x) => x(q, p))).rows;
const t = (name, fn) => test(name, async (ctx) => { if (!available) return ctx.skip('no Postgres server'); await fn(); });
const rec = (id, title, extra = {}) => ({ id, title, origin: 'operational', ...extra });

t('leadership reads every title, including the Pelatnas board and coaching objectives', async () => {
  await as('indra', (x) => x('insert into public.scrim_reports (id, data, created_by) values ($1, $2, $3)', ['RP-L1', rec('RP-L1', 'MLBB', { date: '2026-11-19', notes: [] }), U.indra]));
  await as('aufa', (x) => x('insert into public.scrim_reports (id, data, created_by) values ($1, $2, $3)', ['RP-L2', rec('RP-L2', 'PUBG Mobile', { date: '2026-11-19', notes: [] }), U.aufa]));
  await as('aufa', (x) => x('insert into public.coaching_objectives (id, data, created_by) values ($1, $2, $3)', ['OBJ-L', rec('OBJ-L', 'Dota 2', { status: 'proposed', reviews: [], sessions: [], decisions: [] }), U.aufa]));
  await as('aufa', (x) => x('insert into public.pelatnas_attendance (id, data, created_by) values ($1, $2, $3)', ['AT-L', rec('AT-L', 'eFootball'), U.aufa]));
  assert.deepEqual((await rows('ketua', 'select id from public.scrim_reports order by id')).map((r) => r.id), ['RP-L1', 'RP-L2']);
  assert.equal((await rows('ketua', 'select id from public.coaching_objectives')).length, 1);
  assert.equal((await rows('ketua', 'select id from public.pelatnas_attendance')).length, 1);
  assert.equal((await rows('indra', 'select id from public.scrim_reports')).length, 1, 'a title coach still sees only his title');
});

t('leadership writes nothing: no report, no edit, no objective decision, no approval, no roster, no config', async () => {
  await assert.rejects(as('ketua', (x) => x('insert into public.scrim_reports (id, data, created_by) values ($1, $2, $3)', ['RP-K', rec('RP-K', 'MLBB', { notes: [] }), U.ketua])), /row-level security/);
  assert.equal((await as('ketua', (x) => x(`update public.coaching_objectives set data = jsonb_set(data, '{status}', '"accepted"') where id = 'OBJ-L'`))).rowCount, 0);
  await assert.rejects(as('ketua', (x) => x('insert into public.scrim_report_corrections (report_id, text, by_name) values ($1, $2, $3)', ['RP-L1', 'x', 'K'])), /row-level security/);
  await as('indra', (x) => x('insert into public.draft_books (id, data, created_by) values ($1, $2, $3)', ['book-L', rec('book-L', 'MLBB', { status: 'draft' }), U.indra]));
  await assert.rejects(as('ketua', (x) => x(`select public.approve_record('draft_books', 'book-L')`)), /Only the Head Coach or an assistant coach/);
  await assert.rejects(as('ketua', (x) => x('select public.set_roster($1)', [{ MLBB: ['X'] }])), /row-level security/);
  await assert.rejects(as('ketua', (x) => x(`insert into public.app_config (key, data) values ('rules', '{}')`)), /row-level security/);
  await assert.rejects(as('ketua', (x) => x('insert into public.user_roles (user_id, role) values ($1, $2)', [U.ketua, 'admin'])), /row-level security/);
});

t('leadership does not see wellbeing or readiness data', async () => {
  await as('donny', (x) => x('insert into public.wellbeing_checkins (id, data, created_by) values ($1, $2, $3)', ['W-L', rec('W-L', 'MLBB', { player: 'Aran' }), U.donny]));
  assert.equal((await rows('ketua', 'select * from public.wellbeing_checkins')).length, 0);
  assert.equal((await rows('ketua', 'select * from public.readiness_store')).length, 0);
});
