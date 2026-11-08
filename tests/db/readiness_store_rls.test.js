// V1.15 readiness_store (Coach Donny's system): Row Level Security tests on a real Postgres, using the production migrations plus a small Supabase stand-in.
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
const dbName = `hub_rstore_${Date.now()}`;
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
const ins = (who, id, data) => as(who, (x) => x('insert into public.readiness_store (id, data, created_by) values ($1, $2, $3)', [id, data, U[who]]));
const rec = (v) => ({ map: 'checkIns', key: 'a1:2026-11-20', value: v, origin: 'operational' });

t("readiness data: only Coach Donny (readiness owner) and admins read or write it; changes are audited by hub user", async () => {
  await ins('donny', 'checkIns|a1:2026-11-20', rec({ tidur: 7 }));
  await ins('aufa', 'checkIns|a2:2026-11-20', rec({ tidur: 6 }));
  for (const who of ['donny', 'aufa']) assert.equal((await rows(who, 'select id from public.readiness_store')).length, 2, who);
  for (const who of ['fayad', 'indra', 'christie']) {
    assert.equal((await rows(who, 'select id from public.readiness_store')).length, 0, `${who} reads nothing`);
    await assert.rejects(ins(who, `x-${who}`, rec({})), /row-level security/, `${who} cannot write`);
  }
  assert.equal((await rows('anon', 'select id from public.readiness_store').catch(() => [])).length, 0);
  await as('aufa', (x) => x(`update public.readiness_store set data = jsonb_set(data, '{value}', '{"tidur":8}') where id = 'checkIns|a1:2026-11-20'`));
  const [r] = await rows('donny', `select created_by, updated_by from public.readiness_store where id = 'checkIns|a1:2026-11-20'`);
  assert.deepEqual([r.created_by, r.updated_by], [U.donny, U.aufa]);
  await assert.rejects(ins('donny', 'bad', { origin: 'operational' }), /check constraint/);
  await assert.rejects(ins('donny', 'demo', { ...rec({}), origin: 'demo' }), /Only operational records/);
});
