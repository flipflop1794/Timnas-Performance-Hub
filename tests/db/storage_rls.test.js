// V1.13 screenshot storage policies on the REAL Supabase Storage schema.
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
  for (const f of readdirSync(new URL('supabase/migrations/', root)).sort()) await db.query(readFileSync(new URL(`supabase/migrations/${f}`, root), 'utf8'));
  for (const [k, id] of Object.entries(U)) await db.query('insert into auth.users (id, email) values ($1, $2)', [id, `${k}@example.test`]);
  await db.query(`insert into public.user_roles values ($1, 'title_coach'), ($2, 'title_coach'), ($3, 'admin')`, [U.indra, U.christie, U.aufa]);
  await db.query(`insert into public.user_titles values ($1, 'MLBB'), ($2, 'PUBG Mobile')`, [U.indra, U.christie]);
});
after(async () => { if (!available || !db) return; await db.end(); await admin0.query(`drop database ${dbName}`); await admin0.end(); });

async function as(who, q, p) {
  await db.query('begin');
  try {
    await db.query(`set local storage.allow_delete_query = 'true'`); // what the Storage API sets for its own deletes
    await db.query('set local role authenticated');
    await db.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: U[who], role: 'authenticated' })]);
    const r = await db.query(q, p); await db.query('commit'); return r;
  } catch (e) { await db.query('rollback'); throw e; }
}
const put = (who, name) => as(who, `insert into storage.objects (bucket_id, name, owner, metadata) values ('scrim-captures', $1, $2, '{}')`, [name, U[who]]);
const t = (name, fn) => test(name, async (ctx) => { if (!available) return ctx.skip('set STORAGE_MIGRATIONS to the storage repo migrations/tenant'); await fn(); });

t('bucket is private, 2.5 MB, images only', async () => {
  const { rows: [b] } = await db.query(`select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'scrim-captures'`);
  assert.equal(b.public, false); assert.equal(Number(b.file_size_limit), 2500000); assert.deepEqual(b.allowed_mime_types, ['image/webp', 'image/jpeg', 'image/png']);
});

t('a coach uploads only into his own titles\' folders and reads only those; admins read all and delete', async () => {
  await put('indra', 'mlbb/2026-11-16/a.webp');
  await assert.rejects(put('indra', 'dota-2/2026-11-16/b.webp'), /row-level security/);
  await assert.rejects(put('indra', 'unknown/2026-11-16/c.webp'), /row-level security/);
  await assert.rejects(put('indra', 'a.webp'), /row-level security/, 'no folder = no title');
  await put('christie', 'pubg-mobile/2026-11-16/d.webp');
  const sees = async (who) => (await as(who, `select name from storage.objects where bucket_id = 'scrim-captures' order by name`)).rows.map((r) => r.name);
  assert.deepEqual(await sees('indra'), ['mlbb/2026-11-16/a.webp']);
  assert.deepEqual(await sees('christie'), ['pubg-mobile/2026-11-16/d.webp']);
  assert.equal((await sees('aufa')).length, 2);
  assert.equal((await as('indra', `delete from storage.objects where name = 'mlbb/2026-11-16/a.webp'`)).rowCount, 0);
  assert.equal((await as('aufa', `delete from storage.objects where name = 'mlbb/2026-11-16/a.webp'`)).rowCount, 1);
});
