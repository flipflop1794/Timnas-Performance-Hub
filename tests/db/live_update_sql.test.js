// V1.13 screenshot storage policies on the REAL Supabase One-paste live update schema.
// Needs the storage server's SQL migrations: STORAGE_MIGRATIONS=<supabase/storage checkout>/migrations/tenant.
// Skipped without them (CI does not fetch the storage repo).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

const DIR = process.env.STORAGE_MIGRATIONS || '';
const URL0 = process.env.DATABASE_URL || 'postgres://postgres:localtest@localhost:5432/postgres';
const root = new URL('../../', import.meta.url);
const dbName = `hub_stg_${Date.now()}`;
let admin0, db, available = !!DIR && existsSync(DIR);
const U = { indra: randomUUID(), christie: randomUUID(), aufa: randomUUID() };

before(async () => {
  if (!available) return;
  admin0 = new pg.Client({ connectionString: URL0 });
  try { await admin0.connect(); } catch (e) { available = false; return; }
  await admin0.query(`create database ${dbName}`);
  db = new pg.Client({ connectionString: URL0.replace(/\/[^/]*$/, `/${dbName}`) }); await db.connect();
  await db.query(readFileSync(new URL('tests/db/supabase_stub.sql', root), 'utf8'));
  const num = (f) => Number(f.split('-')[0]);
  await db.query('set search_path = storage, public');
  for (const f of readdirSync(DIR).filter((x) => x.endsWith('.sql')).sort((a, b) => num(a) - num(b))) await db.query(readFileSync(`${DIR}/${f}`, 'utf8'));
  await db.query('set search_path = public');
  // The live project has the V1.12 schema: apply only the two V1.11/V1.12 migrations, then the one-paste file.
  for (const f of ['20261105120000_core.sql', '20261105120100_reference_data.sql']) await db.query(readFileSync(new URL(`supabase/migrations/${f}`, root), 'utf8'));
  await db.query(readFileSync(new URL('supabase/RUN_ON_LIVE_V1_13_TO_V1_15.sql', root), 'utf8'));
});
after(async () => { if (db) await db.end(); if (admin0) { await admin0.query(`drop database if exists ${dbName}`); await admin0.end(); } });

const t = (name, fn) => test(name, async (ctx) => { if (!available) return ctx.skip('no Postgres server with the storage schema'); await fn(); });

t('one-paste update on a V1.12 database: adds every new table, policy and the private bucket', async () => {
  const { rows: tb } = await db.query(`select table_name from information_schema.tables where table_schema = 'public' order by 1`);
  const names = tb.map((r) => r.table_name);
  for (const x of ['scrim_captures', 'scrim_games', 'pattern_findings', 'player_aliases', 'ai_usage', 'draft_pools', 'draft_books', 'mock_drafts', 'draft_drills', 'pro_games', 'readiness_store']) assert.ok(names.includes(x), x);
  const { rows: [b] } = await db.query(`select public from storage.buckets where id = 'scrim-captures'`); assert.equal(b.public, false);
  const { rows: [p] } = await db.query(`select count(*)::int n from pg_policies where tablename = 'readiness_store'`); assert.equal(p.n, 4);
});

test('the one-paste file is exactly the three migrations, in order (no drift)', () => {
  const one = readFileSync(new URL('supabase/RUN_ON_LIVE_V1_13_TO_V1_15.sql', root), 'utf8');
  const parts = ['20261110120000_scrim_capture.sql', '20261112120000_draft_room.sql', '20261113120000_readiness_store.sql'].map((f) => readFileSync(new URL(`supabase/migrations/${f}`, root), 'utf8')).join('');
  assert.ok(one.includes(parts)); assert.match(one, /^begin;$/m); assert.match(one, /^commit;$/m);
});

test('the V1.18 one-paste file is exactly its three migrations, in order (no drift)', () => {
  const one = readFileSync(new URL('supabase/RUN_ON_LIVE_V1_18.sql', root), 'utf8');
  const parts = ['20261118120000_approvals.sql', '20261118120100_capture_storage.sql', '20261118120200_ai_team_cap.sql'].map((f) => readFileSync(new URL(`supabase/migrations/${f}`, root), 'utf8')).join('');
  assert.ok(one.includes(parts)); assert.match(one, /^begin;$/m); assert.match(one, /^commit;$/m);
});
