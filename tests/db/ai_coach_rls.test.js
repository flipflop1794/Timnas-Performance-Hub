// V1.20 coach AI tables: who reads and writes briefs, preparation packs and weakness labels.
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
const dbName = `hub_coach_${Date.now()}`;
let admin0, db, available = true;
const U = Object.fromEntries(['fayad', 'donny', 'indra', 'christie', 'ketua'].map((k) => [k, randomUUID()]));

before(async () => {
  admin0 = new pg.Client({ connectionString: URL0 });
  try { await admin0.connect(); } catch (e) { available = false; if (process.env.REQUIRE_DB === '1') throw e; return; }
  await admin0.query(`create database ${dbName}`);
  db = new pg.Client({ connectionString: URL0.replace(/\/[^/]*$/, `/${dbName}`) });
  await db.connect();
  await db.query(sql('tests/db/supabase_stub.sql'));
  for (const f of readdirSync(new URL('supabase/migrations/', root)).sort()) await db.query(sql(`supabase/migrations/${f}`));
  for (const [k, id] of Object.entries(U)) await db.query('insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)', [id, `${k}@example.test`, { display_name: k }]);
  const role = (k, r) => db.query('insert into public.user_roles (user_id, role) values ($1, $2)', [U[k], r]);
  const title = (k, t) => db.query('insert into public.user_titles (user_id, title) values ($1, $2)', [U[k], t]);
  await role('fayad', 'head_coach'); await role('donny', 'assistant_coach'); await role('ketua', 'leadership');
  await role('indra', 'title_coach'); await title('indra', 'MLBB');
  await role('christie', 'title_coach'); await title('christie', 'PUBG Mobile');
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
const put = (who, table, rec) => as(who, (x) => x(`insert into public.${table} (id, data, created_by) values ($1, $2, $3) on conflict (id) do update set data = excluded.data`, [rec.id, rec, U[who]]));

t('weekly brief: written by the Head Coach only, read by all staff including Leadership', async () => {
  const brief = { id: 'BR-2026-11-19', status: 'published', headline: { text: 'x' }, origin: 'operational' };
  await assert.rejects(put('indra', 'leadership_briefs', brief), /row-level security/);
  await assert.rejects(put('donny', 'leadership_briefs', brief), /row-level security/);
  await put('fayad', 'leadership_briefs', brief);
  for (const who of ['ketua', 'indra', 'christie', 'donny']) assert.equal((await rows(who, 'select id from public.leadership_briefs')).length, 1, who);
});

t('preparation pack: title-scoped; approval only through approve_record by another approver', async () => {
  const pack = { id: 'PP-WM-1', title: 'MLBB', status: 'draft', origin: 'operational' };
  await assert.rejects(put('christie', 'prep_packs', pack), /row-level security/);
  await put('indra', 'prep_packs', pack);
  await assert.rejects(put('indra', 'prep_packs', { ...pack, status: 'approved' }), /Approve button/);
  await assert.rejects(as('ketua', (x) => x(`select public.approve_record('prep_packs', 'PP-WM-1')`)), /Only the Head Coach or an assistant coach/);
  const r = await as('donny', (x) => x(`select public.approve_record('prep_packs', 'PP-WM-1') as d`));
  assert.equal(r.rows[0].d.status, 'approved');
  assert.equal((await rows('christie', 'select id from public.prep_packs')).length, 0, 'another title sees nothing');
  assert.equal((await rows('ketua', 'select id from public.prep_packs')).length, 1, 'leadership reads');
});

t('weakness labels: written by the title staff, not by Leadership; new AI call kinds are accepted in the usage log', async () => {
  await put('indra', 'weakness_tags', { id: 'WT-R1', title: 'MLBB', reportId: 'R1', tags: ['vision'], origin: 'operational' });
  await assert.rejects(put('ketua', 'weakness_tags', { id: 'WT-R2', title: 'MLBB', tags: [], origin: 'operational' }), /row-level security/);
  await as('fayad', (x) => x(`insert into public.ai_usage (title, action, ok) values (null, 'summary', true)`));
  await as('christie', (x) => x(`insert into public.ai_usage (title, action, ok) values ('PUBG Mobile', 'br_result', true)`));
  await assert.rejects(as('indra', (x) => x(`insert into public.ai_usage (title, action, ok) values ('MLBB', 'nonsense', true)`)), /check constraint/);
});
