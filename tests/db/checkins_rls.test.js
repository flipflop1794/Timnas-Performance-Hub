// V1.59 hub_checkins (daily login for the streaks): Row Level Security tests on a real Postgres, using the production
// migrations plus a small Supabase stand-in.
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
const dbName = `hub_checkin_${Date.now()}`;
let admin0, db, available = true;

const U = Object.fromEntries(['aufa', 'fayad', 'donny', 'indra', 'dewi', 'nobody'].map((k) => [k, randomUUID()]));

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
  await role('aufa', 'admin'); await role('fayad', 'head_coach'); await role('donny', 'readiness_owner');
  await role('indra', 'title_coach'); await db.query('insert into public.user_titles (user_id, title) values ($1, $2)', [U.indra, 'MLBB']);
  await role('dewi', 'support');
});
after(async () => {
  if (!available) return;
  await db.end(); await admin0.query(`drop database ${dbName}`); await admin0.end();
});

async function as(who, fn) {
  await db.query('begin');
  try {
    if (who === 'anon') await db.query('set local role anon');
    else { await db.query('set local role authenticated'); await db.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: U[who], role: 'authenticated' })]); }
    const out = await fn((q, p) => db.query(q, p));
    await db.query('commit'); return out;
  } catch (e) { await db.query('rollback'); throw e; }
}
const t = (name, fn) => test(name, async (ctx) => { if (!available) return ctx.skip('no Postgres server'); await fn(); });
const TODAY = "(now() at time zone 'Asia/Jakarta')::date";
const checkin = (who, day = TODAY) => as(who, (x) => x(`insert into public.hub_checkins (day) values (${day})`));
const mine = async (who) => (await as(who, (x) => x('select user_id, day from public.hub_checkins'))).rows;

t('daily login: one row per person per day, today only, own row only; who and when are set by the database', async () => {
  await checkin('indra'); await checkin('dewi'); await checkin('fayad');
  await assert.rejects(checkin('indra'), /duplicate key/, 'once a day');
  await assert.rejects(checkin('indra', `${TODAY} - 3`), /row-level security/, 'no back-dating');
  await assert.rejects(checkin('indra', `${TODAY} + 1`), /row-level security/, 'no future day');
  await checkin('indra', `${TODAY} - 1`);   // just after midnight, a phone may still send yesterday
  await assert.rejects(as('indra', (x) => x(`insert into public.hub_checkins (user_id, day) values ($1, ${TODAY})`, [U.dewi])), /permission denied/, 'cannot write for someone else');
  await assert.rejects(as('indra', (x) => x(`insert into public.hub_checkins (day, first_at) values (${TODAY} - 1, now() - interval '5 days')`)), /permission denied/, 'the time is the database\'s');
  await assert.rejects(checkin('nobody'), /row-level security/, 'an account without a role does not count');
  await assert.rejects(checkin('anon'), /permission denied/);
  const rows = await mine('indra');
  assert.equal(rows.length, 2); assert.ok(rows.every((r) => r.user_id === U.indra), 'a coach reads only their own days');
  assert.equal((await mine('dewi')).length, 1, 'a support staff member reads only their own days');
  for (const who of ['aufa', 'fayad', 'donny']) assert.equal((await mine(who)).length, 4, `${who} reads everyone's (the streaks next to each name)`);
  await assert.rejects(as('indra', (x) => x('update public.hub_checkins set day = day - 7')), /permission denied/, 'never changed');
  await assert.rejects(as('aufa', (x) => x('delete from public.hub_checkins')), /permission denied/, 'never deleted from the website');
});
