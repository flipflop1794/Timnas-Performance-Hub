// V1.14 Draft Room tables: Row Level Security tests on a real Postgres, using the production migrations plus a small Supabase stand-in.
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
const dbName = `hub_draft_${Date.now()}`;
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
const t = (name, fn) => test(name, async (ctx) => { if (!available) return ctx.skip('no Postgres server'); await fn(); });
const ins = (who, table, id, data) => as(who, (x) => x(`insert into public.${table} (id, data, created_by) values ($1, $2, $3)`, [id, data, U[who]]));

t('draft room: MLBB staff read and write their title; other title coaches see nothing; only MLBB titles allowed', async () => {
  for (const tb of ['draft_pools', 'draft_books', 'mock_drafts', 'draft_drills', 'pro_games']) {
    await ins('indra', tb, `${tb}-1`, { title: 'MLBB', origin: 'operational' });
    const [r] = await rows('aufa', `select title, created_by from public.${tb} where id = $1`, [`${tb}-1`]);
    assert.deepEqual([r.title, r.created_by], ['MLBB', U.indra], tb);
    assert.equal((await rows('fayad', `select id from public.${tb}`)).length, 1, `${tb}: Head Coach reads`);
    assert.equal((await rows('christie', `select id from public.${tb}`)).length, 0, `${tb}: PUBG coach sees nothing`);
    await assert.rejects(ins('christie', tb, `${tb}-2`, { title: 'MLBB', origin: 'operational' }), /row-level security/);
    await assert.rejects(ins('indra', tb, `${tb}-3`, { title: 'MLBB Women', origin: 'operational' }), /row-level security/, `${tb}: Indra not assigned to MLBB Women`);
    await assert.rejects(ins('aufa', tb, `${tb}-4`, { title: 'Dota 2', origin: 'operational' }), /check constraint/, `${tb}: Dota rows refused`);
    assert.equal((await rows('anon', `select id from public.${tb}`).catch(() => [])).length, 0);
    assert.equal((await as('indra', (x) => x(`delete from public.${tb}`))).rowCount, 0, `${tb}: coach cannot delete`);
  }
  await as('indra', (x) => x(`update public.draft_books set data = jsonb_set(data, '{bans}', '["Fanny"]') where id = 'draft_books-1'`));
  const [audit] = await rows('aufa', `select count(*)::int as n from public.audit_log where table_name = 'draft_books'`);
  assert.ok(audit.n >= 2, 'changes are audited');
});

t('draft room: demo data refused like everywhere else', async () => {
  await assert.rejects(ins('aufa', 'mock_drafts', 'demo-1', { title: 'MLBB', origin: 'demo' }), /Only operational records/);
});
