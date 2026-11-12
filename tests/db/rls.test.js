// Row Level Security tests on a real Postgres, using the production migrations plus a small Supabase stand-in.
// Needs a Postgres server: DATABASE_URL (default postgres://postgres:localtest@localhost:5432/postgres).
// Skipped when no server is reachable, unless REQUIRE_DB=1 (CI), where a missing server fails the run.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { dailySession, updateFollowUp } from '../../src/core/daily_sessions.js';

const URL0 = process.env.DATABASE_URL || 'postgres://postgres:localtest@localhost:5432/postgres';
const root = new URL('../../', import.meta.url);
const sql = (p) => readFileSync(new URL(p, root), 'utf8');
const dbName = `hub_rls_${Date.now()}`;
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
const report = (id, title, extra = {}) => ({ id, title, date: '2026-11-10', by: 'Coach', partner: 'X', result: { mode: 'wl', won: 2, lost: 1, drawn: 0 }, focus: 'f', progress: 4, worked: 'w', adjust: 'a', notes: [], origin: 'operational', createdAt: '2026-11-10T10:00:00Z', ...extra });
const insReport = (who, r, createdBy) => as(who, (x) => x('insert into public.scrim_reports (id, data, created_by) values ($1, $2, $3)', [r.id, r, createdBy ?? U[who]]));
const t = (name, fn) => test(name, async (ctx) => { if (!available) return ctx.skip('no Postgres server'); await fn(); });

t('a title coach files a report for his title; author and time are set by the server, not the client', async () => {
  await insReport('indra', report('RP-1', 'MLBB'), U.fayad); // tries to claim Fayad wrote it
  const [r] = await rows('aufa', 'select title, created_by from public.scrim_reports where id = $1', ['RP-1']);
  assert.equal(r.title, 'MLBB'); assert.equal(r.created_by, U.indra);
});

t('daily session and its follow-up inherit session title access and audit attribution', async () => {
  const author = { id: U.indra, name: 'Coach', roles: ['title_coach'], titles: ['MLBB'] };
  const manager = { id: U.fayad, name: 'Head Coach', roles: ['head_coach'], titles: [] };
  const session = dailySession({ title: 'MLBB', date: '2026-11-11', kind: 'team practice', objective: 'Turtle setup',
    outcome: 'Two clean setups', issue: 'Late ward', nextAction: 'Review timing' }, author, 'SC-daily-test', '2026-11-11');
  const put = (who, s) => as(who, (q) => q('insert into public.scrim_sessions (id, data) values ($1, $2)', [s.id, s]));
  await assert.rejects(put('christie', session), /row-level security/);
  await put('indra', session);
  const query = 'select created_by, updated_by, data from public.scrim_sessions where id = $1';
  assert.equal((await rows('christie', query, [session.id])).length, 0);
  assert.equal((await rows('nobody', query, [session.id])).length, 0);
  await assert.rejects(rows('anon', query, [session.id]), /permission denied/);
  const change = updateFollowUp(session, { ownerId: manager.id, due: '2026-11-13', status: 'Done' }, [manager]);
  const save = (who) => as(who, (q) => q('update public.scrim_sessions set data = $1 where id = $2', [change, session.id]));
  for (const who of ['christie', 'donny', 'nobody']) assert.equal((await save(who)).rowCount, 0);
  assert.equal((await save('fayad')).rowCount, 1);
  const [saved] = await rows('aufa', query, [session.id]);
  assert.equal(saved.created_by, U.indra);
  assert.equal(saved.updated_by, U.fayad);
  assert.deepEqual(saved.data.dailyReport, session.dailyReport);
  assert.equal(saved.data.followUp.status, 'Done');
});

t('Head Coach and assistant coaches read every title; a coach of another title sees nothing and cannot write there', async () => {
  for (const who of ['fayad', 'aufa', 'donny', 'indra']) assert.equal((await rows(who, 'select id from public.scrim_reports where id = $1', ['RP-1'])).length, 1, who);
  assert.equal((await rows('christie', 'select id from public.scrim_reports')).length, 0);
  await assert.rejects(insReport('christie', report('RP-2', 'MLBB')), /row-level security/);
  await insReport('christie', report('RP-3', 'PUBG Mobile'));
  assert.equal((await rows('indra', 'select id from public.scrim_reports where id = $1', ['RP-3'])).length, 0);
});

t('a submitted report cannot be changed, even by an admin; corrections are added rows with their own author', async () => {
  // No update policy exists: an update by any signed-in user changes nothing; a privileged session is stopped by the trigger.
  const up = await as('aufa', (x) => x(`update public.scrim_reports set data = jsonb_set(data, '{worked}', '"edited"') where id = 'RP-1'`));
  assert.equal(up.rowCount, 0);
  assert.equal((await rows('fayad', `select data->>'worked' as w from public.scrim_reports where id = 'RP-1'`))[0].w, 'w');
  await assert.rejects(db.query(`update public.scrim_reports set data = jsonb_set(data, '{worked}', '"edited"') where id = 'RP-1'`), /cannot be changed/);
  await as('indra', (x) => x('insert into public.scrim_report_corrections (report_id, text, by_name) values ($1, $2, $3)', ['RP-1', 'Score was 2-0', 'Coach Indra']));
  await assert.rejects(as('christie', (x) => x('insert into public.scrim_report_corrections (report_id, text, by_name) values ($1, $2, $3)', ['RP-1', 'x', 'C'])), /row-level security/);
  const c = await rows('fayad', 'select text, created_by from public.scrim_report_corrections where report_id = $1', ['RP-1']);
  assert.equal(c.length, 1); assert.equal(c[0].created_by, U.indra);
  assert.equal((await as('indra', (x) => x(`update public.scrim_report_corrections set text = 'x'`))).rowCount, 0);
});

t('unauthenticated visitors and accounts without a role see nothing', async () => {
  await assert.rejects(rows('anon', 'select * from public.scrim_reports'), /permission denied/);
  await assert.rejects(rows('anon', 'select * from public.profiles'), /permission denied/);
  for (const tb of ['scrim_reports', 'coaching_objectives', 'app_config', 'roster_players', 'profiles', 'wellbeing_checkins']) {
    const r = await rows('nobody', `select * from public.${tb}`);
    assert.ok(tb === 'profiles' ? r.every((p) => p.id === U.nobody) : r.length === 0, tb);
  }
  await assert.rejects(insReport('nobody', report('RP-9', 'MLBB')), /row-level security/);
});

t('wellbeing: only the readiness owner and admins can read or write, enforced in the database', async () => {
  const c = { player: 'Aran', title: 'MLBB', date: '2026-11-10', sleepH: 7, origin: 'operational' };
  await as('donny', (x) => x('insert into public.wellbeing_checkins (id, data, created_by) values ($1, $2, $3)', ['W1', c, U.donny]));
  assert.equal((await rows('donny', 'select * from public.wellbeing_checkins')).length, 1);
  assert.equal((await rows('aufa', 'select * from public.wellbeing_checkins')).length, 1, 'admin');
  for (const who of ['fayad', 'indra', 'christie']) {
    assert.equal((await rows(who, 'select * from public.wellbeing_checkins')).length, 0, who);
    await assert.rejects(as(who, (x) => x('insert into public.wellbeing_checkins (id, data, created_by) values ($1, $2, $3)', [`W-${who}`, c, U[who]])), /row-level security/);
  }
});

t('proposals: a title coach proposes; the Head Coach or any assistant coach approves (V1.16)', async () => {
  const o = (id, title, status) => ({ id, title, status, rec: { problem: 'p' }, reviews: [], sessions: [], decisions: [], origin: 'operational' });
  const put = (who, x) => as(who, (q) => q('insert into public.coaching_objectives (id, data, created_by) values ($1, $2, $3) on conflict (id) do update set data = excluded.data', [x.id, x, U[who]]));
  const upd = (who, x) => as(who, (q) => q('update public.coaching_objectives set data = $2 where id = $1', [x.id, x]));
  await put('indra', o('OBJ-1', 'MLBB', 'proposed'));
  await assert.rejects(put('indra', o('OBJ-1', 'MLBB', 'accepted')), /Only the Head Coach or an assistant coach/);
  await put('aufa', o('OBJ-1', 'MLBB', 'accepted'));
  await put('christie', o('OBJ-2', 'PUBG Mobile', 'proposed'));
  // Donny is an assistant coach not assigned to PUBG Mobile: he may review it (update), not create rows there.
  assert.equal((await upd('donny', o('OBJ-2', 'PUBG Mobile', 'accepted'))).rowCount, 1);
  await put('fayad', o('OBJ-2', 'PUBG Mobile', 'rejected'));
  // logging a session keeps the status: allowed for the title coach
  const s = o('OBJ-1', 'MLBB', 'accepted'); s.sessions = [{ id: 'S1' }];
  await put('indra', s);
  const [r] = await rows('fayad', `select data->>'status' as st, created_by, updated_by from public.coaching_objectives where id = 'OBJ-1'`);
  assert.equal(r.st, 'accepted'); assert.equal(r.created_by, U.indra); assert.equal(r.updated_by, U.indra);
});

t('demo or synthetic records are refused by the database', async () => {
  await assert.rejects(insReport('indra', report('RP-D', 'MLBB', { origin: 'demo' })), /Only operational records/);
});

t('audit log records every change; only admins can read it', async () => {
  const a = await rows('aufa', `select action, actor from public.audit_log where table_name = 'scrim_reports' and row_id = 'RP-1'`);
  assert.ok(a.some((x) => x.action === 'insert' && x.actor === U.indra));
  assert.equal((await rows('fayad', 'select * from public.audit_log')).length, 0);
  await assert.rejects(as('aufa', (x) => x(`insert into public.audit_log (table_name, action) values ('x', 'y')`)), /permission denied/);
});

t('roles: only admins grant roles; nobody can grant themselves; the last admin cannot be removed', async () => {
  await assert.rejects(as('indra', (x) => x('insert into public.user_roles (user_id, role) values ($1, $2)', [U.indra, 'admin'])), /row-level security/);
  await as('aufa', (x) => x('insert into public.user_titles (user_id, title) values ($1, $2)', [U.indra, 'MLBB Women']));
  assert.equal((await rows('indra', 'select title from public.user_titles where user_id = $1 order by title', [U.indra])).map((r) => r.title).join(','), 'MLBB,MLBB Women');
  await assert.rejects(as('aufa', (x) => x(`delete from public.user_roles where user_id = $1 and role = 'admin'`, [U.aufa])), /At least one admin/);
  // V1.16: names are what the screens show as "who", so only an admin sets them.
  await assert.rejects(as('indra', (x) => x('update public.profiles set display_name = $1 where id = $2', ['Fayad', U.indra])), /Only an admin/);
  await as('aufa', (x) => x('update public.profiles set display_name = $1 where id = $2', ['Coach Indra', U.indra]));
  await assert.rejects(as('indra', (x) => x(`update public.profiles set staff_key = 'fayad' where id = $1`, [U.indra])), /Only an admin/);
  assert.equal((await rows('christie', `select * from public.profiles where id = $1`, [U.indra]))[0].display_name, 'Coach Indra', 'staff can see names');
});

t('configuration: rules by Head Coach / admin; runbooks also by assistant coaches; rosters by readiness owner', async () => {
  const put = (who, key, data) => as(who, (x) => x('insert into public.app_config (key, data) values ($1, $2) on conflict (key) do update set data = excluded.data', [key, data]));
  await assert.rejects(put('indra', 'rules', { rules: [] }), /row-level security/);
  await put('fayad', 'rules', { rules: [{ id: 'r1' }] });
  await put('aufa', 'runbooks', { runbooks: {} });
  await assert.rejects(put('donny', 'rules', { rules: [] }), /row-level security/);
  const [c] = await rows('indra', `select updated_by from public.app_config where key = 'rules'`);
  assert.equal(c.updated_by, U.fayad);
  await as('donny', (x) => x('select public.set_roster($1)', [{ MLBB: ['Aran', 'Kevin'] }]));
  assert.deepEqual((await rows('indra', `select ign from public.roster_players where title = 'MLBB' order by sort_order`)).map((r) => r.ign), ['Aran', 'Kevin']);
  await assert.rejects(as('indra', (x) => x('select public.set_roster($1)', [{ MLBB: ['X'] }])), /row-level security/);
});

t('privileged imports (SQL Editor) must name the author; signed-in users cannot skip the stamp', async () => {
  await assert.rejects(db.query('insert into public.scrim_reports (id, data) values ($1, $2)', ['RP-I', report('RP-I', 'MLBB')]), /created_by/);
  await db.query('insert into public.scrim_reports (id, data, created_by, created_at) values ($1, $2, $3, $4)', ['RP-I', report('RP-I', 'MLBB'), U.indra, '2026-11-04T10:00:00Z']);
  const [r] = await rows('fayad', `select created_by, created_at from public.scrim_reports where id = 'RP-I'`);
  assert.equal(r.created_by, U.indra); assert.equal(r.created_at.toISOString(), '2026-11-04T10:00:00.000Z');
});
