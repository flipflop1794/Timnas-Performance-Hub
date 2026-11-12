// V1.16 approvals and attribution, enforced by the database (audit H1, H2).
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
const dbName = `hub_appr_${Date.now()}`;
let admin0, db, available = true;
const U = Object.fromEntries(['aufa', 'fayad', 'donny', 'indra', 'ilyas'].map((k) => [k, randomUUID()]));
const NAMES = { aufa: 'Aufa', fayad: 'Fayad', donny: 'Donny', indra: 'Coach Indra', ilyas: 'Coach Ilyas' };

before(async () => {
  admin0 = new pg.Client({ connectionString: URL0 });
  try { await admin0.connect(); } catch (e) { available = false; if (process.env.REQUIRE_DB === '1') throw e; return; }
  await admin0.query(`create database ${dbName}`);
  db = new pg.Client({ connectionString: URL0.replace(/\/[^/]*$/, `/${dbName}`) });
  await db.connect();
  await db.query(sql('tests/db/supabase_stub.sql'));
  for (const f of readdirSync(new URL('supabase/migrations/', root)).sort()) await db.query(sql(`supabase/migrations/${f}`));
  for (const [k, id] of Object.entries(U)) {
    await db.query('insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)', [id, `${k}@example.test`, { display_name: NAMES[k] }]);
  }
  const role = (k, r) => db.query('insert into public.user_roles (user_id, role) values ($1, $2)', [U[k], r]);
  const title = (k, t) => db.query('insert into public.user_titles (user_id, title) values ($1, $2)', [U[k], t]);
  await role('aufa', 'admin'); await role('aufa', 'assistant_coach'); await title('aufa', 'MLBB');
  await role('fayad', 'head_coach');
  await role('donny', 'assistant_coach');                          // assistant coach, no title assignment
  await role('indra', 'title_coach'); await title('indra', 'MLBB');
  await role('ilyas', 'title_coach'); await title('ilyas', 'MLBB'); await title('ilyas', 'MLBB Women');
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
const approve = (who, table, id) => as(who, (x) => x('select public.approve_record($1, $2) as d', [table, id])).then((r) => r.rows[0].d);
const book = (extra = {}) => ({ id: 'book-MLBB-Mongolia', title: 'MLBB', opponent: 'Mongolia', bans: ['Fanny'], status: 'draft', version: 1, origin: 'operational', ...extra });

t('draft book: a typed "approved" is refused; approval goes through approve_record and names the signed-in approver', async () => {
  await assert.rejects(put('indra', 'draft_books', book({ status: 'approved', approvedBy: 'Fayad' })), /Approve button/);
  await put('indra', 'draft_books', book());
  await assert.rejects(approve('indra', 'draft_books', 'book-MLBB-Mongolia'), /title_coach|Only the Head Coach or an assistant coach/);
  await assert.rejects(approve('ilyas', 'draft_books', 'book-MLBB-Mongolia'), /Only the Head Coach or an assistant coach/);
  const d = await approve('donny', 'draft_books', 'book-MLBB-Mongolia');   // any assistant coach, any title
  assert.equal(d.status, 'approved'); assert.equal(d.approvedBy, 'Donny'); assert.equal(d.approvedById, U.donny);
  await assert.rejects(approve('fayad', 'draft_books', 'book-MLBB-Mongolia'), /Only a draft version/);
  // A no-op save of the approved row is fine; a changed version must go back to draft.
  const [{ data: cur }] = await rows('indra', `select data from public.draft_books where id = 'book-MLBB-Mongolia'`);
  await put('indra', 'draft_books', cur);
  await assert.rejects(put('indra', 'draft_books', { ...cur, bans: ['Ling'] }), /Approve button/);
  await put('indra', 'draft_books', { ...cur, bans: ['Ling'], status: 'draft', version: 2, approvedBy: '' });
});

t('draft book: the writer of a version cannot approve it, even as Head Coach', async () => {
  await put('fayad', 'draft_books', book({ id: 'book-MLBB-Iran', opponent: 'Iran' }));
  await assert.rejects(approve('fayad', 'draft_books', 'book-MLBB-Iran'), /writer of this version/);
  assert.equal((await approve('aufa', 'draft_books', 'book-MLBB-Iran')).approvedBy, 'Aufa');
});

t('opponent card: same approval rule', async () => {
  const card = { id: 'MLBB_Mongolia', key: 'MLBB|Mongolia', title: 'MLBB', nation: 'Mongolia', keys: ['a'], ourAnswer: 'b', by: 'x', status: 'draft', origin: 'operational' };
  await assert.rejects(put('indra', 'opponent_cards', { ...card, status: 'approved', approvedBy: 'Fayad' }), /Approve button/);
  await put('indra', 'opponent_cards', card);
  assert.equal((await approve('fayad', 'opponent_cards', 'MLBB_Mongolia')).approvedBy, 'Fayad');
  await assert.rejects(approve('fayad', 'scrim_reports', 'x'), /no approval/);
});

t('coaching objective: history is append-only; new reviews and decisions carry the signed-in name, not a typed one', async () => {
  const o = { id: 'OBJ-A', title: 'MLBB', status: 'proposed', objective: { drill: 'd', success: 's' }, rec: { problem: 'p' }, reviews: [], sessions: [], decisions: [], origin: 'operational' };
  await put('indra', 'coaching_objectives', o);
  const reviewed = { ...o, status: 'accepted', reviews: [{ decision: 'accepted', reviewer: 'Fayad', reason: '', at: 'now' }] };
  await assert.rejects(put('indra', 'coaching_objectives', reviewed), /Only the Head Coach or an assistant coach/);
  await as('donny', (x) => x('update public.coaching_objectives set data = $2 where id = $1', [o.id, reviewed]));
  let [{ data }] = await rows('fayad', `select data from public.coaching_objectives where id = 'OBJ-A'`);
  assert.equal(data.reviews[0].reviewer, 'Donny', 'typed "Fayad" replaced by the signed-in reviewer');
  assert.equal(data.reviews[0].reviewerId, U.donny);

  // Title coach: may log a session and record a decision (stamped with his name) ...
  const withSession = { ...data, sessions: [{ id: 'S1' }] };
  await put('indra', 'coaching_objectives', withSession);
  const decided = { ...withSession, status: 'retired', decisions: [{ decision: 'retire', by: 'Fayad', reason: 'met', sessionId: 'S1' }] };
  await put('indra', 'coaching_objectives', decided);
  [{ data }] = await rows('fayad', `select data from public.coaching_objectives where id = 'OBJ-A'`);
  assert.equal(data.decisions[0].by, 'Coach Indra');
  // ... but not rewrite history, change the objective, or move the status without a decision.
  await assert.rejects(put('indra', 'coaching_objectives', { ...data, reviews: [] }), /history/);
  await assert.rejects(put('indra', 'coaching_objectives', { ...data, reviews: [{ ...data.reviews[0], reason: 'edited' }] }), /history/);
  await assert.rejects(put('indra', 'coaching_objectives', { ...data, objective: { drill: 'other', success: 's' } }), /drill or success/);
  await assert.rejects(put('indra', 'coaching_objectives', { ...data, status: 'accepted' }), /Only the Head Coach/);
  await assert.rejects(put('indra', 'coaching_objectives', { ...data, status: 'evidence-needed' }), /without a recorded decision/);
  // Approvers cannot rewrite history either.
  await assert.rejects(as('fayad', (x) => x('update public.coaching_objectives set data = $2 where id = $1', [o.id, { ...data, decisions: [] }])), /history/);
});

t('display names: only an admin changes them', async () => {
  await assert.rejects(as('indra', (x) => x('update public.profiles set display_name = $1 where id = $2', ['Fayad', U.indra])), /Only an admin/);
  await as('aufa', (x) => x('update public.profiles set display_name = $1 where id = $2', ['Indra P.', U.indra]));
  assert.equal((await rows('indra', 'select display_name from public.profiles where id = $1', [U.indra]))[0].display_name, 'Indra P.');
});
