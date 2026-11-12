// V1.16 Pelatnas tables: Row Level Security tests on a real Postgres, using the production migrations plus a small Supabase stand-in.
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
const dbName = `hub_pel_${Date.now()}`;
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

t('pelatnas: title staff record availability and attendance for their title only; others see nothing', async () => {
  for (const tb of ['pelatnas_availability', 'pelatnas_attendance']) {
    await ins('indra', tb, `${tb}-1`, { title: 'MLBB', origin: 'operational' });
    const [r] = await rows('aufa', `select title, created_by from public.${tb} where id = $1`, [`${tb}-1`]);
    assert.deepEqual([r.title, r.created_by], ['MLBB', U.indra], tb);
    assert.equal((await rows('fayad', `select id from public.${tb}`)).length, 1, `${tb}: Head Coach reads`);
    assert.equal((await rows('donny', `select id from public.${tb}`)).length, 1, `${tb}: assistant coach reads`);
    assert.equal((await rows('christie', `select id from public.${tb}`)).length, 0, `${tb}: PUBG coach sees nothing`);
    await assert.rejects(ins('christie', tb, `${tb}-2`, { title: 'MLBB', origin: 'operational' }), /row-level security/);
    await ins('christie', tb, `${tb}-3`, { title: 'PUBG Mobile', origin: 'operational' });
    assert.equal((await rows('anon', `select id from public.${tb}`).catch(() => [])).length, 0);
    assert.equal((await as('indra', (x) => x(`delete from public.${tb}`))).rowCount, 0, `${tb}: coach cannot delete`);
    await assert.rejects(ins('aufa', tb, `${tb}-demo`, { title: 'MLBB', origin: 'demo' }), /Only operational records/);
  }
  const [audit] = await rows('aufa', `select count(*)::int as n from public.audit_log where table_name like 'pelatnas_%'`);
  assert.ok(audit.n >= 4, 'changes are audited');
});

t('pelatnas: camp dates are set by admin or Head Coach only, read by all staff', async () => {
  await as('fayad', (x) => x(`insert into public.app_config (key, data) values ('pelatnas', '{"camp":{"start":"2026-11-20","end":"2026-12-13","status":"proposed"}}')`));
  assert.equal((await rows('indra', `select data->'camp'->>'status' as s from public.app_config where key = 'pelatnas'`))[0].s, 'proposed');
  await assert.rejects(as('indra', (x) => x(`update public.app_config set data = '{}' where key = 'pelatnas' returning key`).then((r) => { if (!r.rowCount) throw new Error('row-level security: no row changed'); })), /row-level security/);
  await assert.rejects(as('donny', (x) => x(`update public.app_config set data = '{}' where key = 'pelatnas' returning key`).then((r) => { if (!r.rowCount) throw new Error('row-level security: no row changed'); })), /row-level security/, 'assistant coaches cannot change the dates');
  await as('aufa', (x) => x(`update public.app_config set data = '{"camp":null}' where key = 'pelatnas'`));
  await assert.rejects(as('fayad', (x) => x(`insert into public.app_config (key, data) values ('other', '{}')`)), /check constraint/);
});
