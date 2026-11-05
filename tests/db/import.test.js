// The artifact importer's SQL runs on the real schema: rows land with original dates, notes become corrections,
// demo rows are skipped and a second run changes nothing.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { toSql } from '../../tools/import_artifact.mjs';

const URL0 = process.env.DATABASE_URL || 'postgres://postgres:localtest@localhost:5432/postgres';
const root = new URL('../../', import.meta.url);
const dbName = `hub_imp_${Date.now()}`;
let a, db, ok = true;
const admin = randomUUID();
before(async () => {
  a = new pg.Client({ connectionString: URL0 });
  try { await a.connect(); } catch (e) { ok = false; if (process.env.REQUIRE_DB === '1') throw e; return; }
  await a.query(`create database ${dbName}`);
  db = new pg.Client({ connectionString: URL0.replace(/\/[^/]*$/, `/${dbName}`) }); await db.connect();
  await db.query(readFileSync(new URL('tests/db/supabase_stub.sql', root), 'utf8'));
  for (const f of readdirSync(new URL('supabase/migrations/', root)).sort()) await db.query(readFileSync(new URL(`supabase/migrations/${f}`, root), 'utf8'));
  await db.query('insert into auth.users (id, email) values ($1, $2)', [admin, 'admin@example.test']);
});
after(async () => { if (!ok) return; await db.end(); await a.query(`drop database ${dbName}`); await a.end(); });

test('import from the artifact export', async (t) => {
  if (!ok) return t.skip('no Postgres server');
  const exp = {
    scrim_reports: [{ id: 'RP-1', data: { title: 'MLBB', date: '2026-11-06', createdAt: '2026-11-06T12:00:00Z', origin: 'operational', by: 'Coach Indra', notes: [{ text: "It's 2-0", by: 'Fayad', at: '2026-11-06T13:00:00Z' }] } },
      { id: 'RP-D', data: { title: 'MLBB', origin: 'demo' } }],
    cycle: [{ id: 'O1', data: { title: 'Dota 2', status: 'accepted', origin: 'operational' } }],
    config: [{ id: 'roster', data: { roster: { CS2: ['A', 'B'] } } }, { id: 'rules', data: { rules: [] } }],
  };
  const sql = toSql(exp, admin);
  await db.query(sql); await db.query(sql);
  const r = await db.query(`select id, created_at, data->'notes' as notes from public.scrim_reports`);
  assert.equal(r.rows.length, 1); assert.equal(r.rows[0].created_at.toISOString(), '2026-11-06T12:00:00.000Z'); assert.deepEqual(r.rows[0].notes, []);
  const c = await db.query('select text, by_name from public.scrim_report_corrections');
  assert.deepEqual(c.rows, [{ text: "It's 2-0", by_name: 'Fayad' }]);
  assert.equal((await db.query(`select data->>'status' as s from public.coaching_objectives`)).rows[0].s, 'accepted');
  assert.deepEqual((await db.query(`select ign from public.roster_players where title = 'CS2' order by sort_order`)).rows.map((x) => x.ign), ['A', 'B']);
  assert.throws(() => toSql(exp, 'not-a-uuid'), /admin user id/);
});
