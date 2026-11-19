import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JOBS, supportReport, usersOfDay, fromParse, findAthlete, titleOf, whatsappText, anonymise, summarize, perDay, weekSignals, repeatAthletes, watchList, dayBoard, weekRange, noticeRecord } from '../src/core/support.js';
import { handle } from '../supabase/functions/_shared/scrim_ai_handler.js';
import { HEROES } from '../supabase/functions/_shared/catalog.gen.js';

const roster = { MLBB: ['Usep', 'Aran', 'Leoni'], 'MLBB Women': ['Vivi', 'Cindy', 'Fumy', 'Vival'], eFootball: ['Elga'], CS2: ['Jovan'], 'CS2 Women': [] };
const rep = (date, discipline, rows, extra = {}) => supportReport({ date, discipline, by: 'Staff', rows, asOf: '2026-11-19', ...extra });

test('a report: rows per athlete, team part, who was seen; empty rows dropped; phone numbers refused', () => {
  const r = rep('2026-11-17', 'medic', [{ athlete: 'Usep', title: 'MLBB', found: 'batuk kering 2 hari; obs batuk', did: 'Siladex syrup 3x5ml', followUp: true },
    { athlete: 'Cindy', title: 'MLBB Women', found: 'luka lecet lutut kiri', did: 'Betason n cream k/p' }, {}]);
  assert.equal(r.rows.length, 2); assert.equal(r.rows[0].followUp, true); assert.equal(r.origin, 'operational');
  assert.equal(usersOfDay(r).text, '2 athletes: MLBB 1, MLBB Women 1');
  // Six jobs: two physios and two psychologists (men / women) share their role's form.
  assert.deepEqual(Object.keys(JOBS), ['medic', 'physio_men', 'physio_women', 'physical', 'psych_men', 'psych_women']); assert.equal(JOBS.psych_men.disc, 'psych');
  assert.throws(() => rep('2026-11-17', 'medic', [{ athlete: 'Usep', found: '' , did: '' }]), /write what you did or what you found/);
  assert.throws(() => rep('2026-11-17', 'physio', [{ athlete: 'Vivi', did: 'US', vasBefore: '11' }]), /VAS before must be a whole number from 0 to 10/);
  assert.throws(() => rep('2026-11-20', 'medic', [{ athlete: 'Usep', did: 'x' }]), /future/);
  assert.throws(() => rep('2026-11-17', 'nurse', [{ athlete: 'Usep', did: 'x' }]), /Pick your role/);
  assert.throws(() => rep('2026-11-17', 'psych', [], { general: { found: 'call me 0812 3456 7890' } }), /phone or ID numbers/);
  const team = rep('2026-11-18', 'physical', [], { general: { did: 'Pendampingan team CS men and women', found: 'mengukur tingkat kelelahan', teams: ['CS2', 'CS2 Women'] } });
  assert.match(usersOfDay(team).text, /0 athletes · teams: CS2, CS2 Women/);
});

test('WhatsApp reading: nicknames match the roster, team written as in the chat, unknown names kept', () => {
  assert.equal(titleOf('MLBB W'), 'MLBB Women'); assert.equal(titleOf('mlbb men'), 'MLBB'); assert.equal(titleOf('CS'), 'CS2'); assert.equal(titleOf('efootball'), 'eFootball');
  assert.deepEqual(findAthlete('Kak Vivi indrawaty', roster), { title: 'MLBB Women', ign: 'Vivi' });
  const p = fromParse({ discipline: 'physio', date: '2026-11-19', rows: [
    { athlete_seen: 'Kak Vivi indrawaty', athlete: '', title_seen: 'MLBB women', did: 'Ultrasound', found: 'tightness quadriceps', region: 'quadriceps', response: 'better', vas_before: 4, vas_after: 3, follow_up: false },
    { athlete_seen: 'Bang Jonathan', athlete: '', title_seen: '', did: 'massage arm & back', found: 'muscle strain arm & back', region: '', response: '', vas_before: 7, vas_after: 6, follow_up: false }],
    general: { did: '', found: '', teams: [] }, notes: '' }, roster);
  assert.equal(p.rows[0].athlete, 'Vivi'); assert.equal(p.rows[0].title, 'MLBB Women'); assert.equal(p.rows[0].vasBefore, '4');
  assert.equal(p.rows[1].athlete, ''); assert.deepEqual(p.unmatched, ['Bang Jonathan']);
  const r = rep('2026-11-19', 'physio', p.rows); assert.equal(r.rows[1].athlete, 'Bang Jonathan', 'an unknown name is kept as written');
  assert.match(whatsappText(r, 'id'), /1\. Vivi \(MLBB Women\)[\s\S]*VAS 4\/10 → 3\/10[\s\S]*User hari ini: 2 athletes/);
});

test('measurements: week totals, per day, signals; with names: repeat athletes, open follow-ups, pain; day board', () => {
  const reports = [
    rep('2026-11-13', 'physio', [{ athlete: 'Aran', title: 'MLBB', did: 'massage' }]),
    rep('2026-11-17', 'medic', [{ athlete: 'Aran', title: 'MLBB', found: 'faringitis', did: 'Rhinos', followUp: true }, { athlete: 'Usep', title: 'MLBB', found: 'batuk', did: 'syrup' }]),
    rep('2026-11-18', 'physio', [{ athlete: 'Aran', title: 'MLBB', did: 'sport massage', response: 'better' }, { athlete: 'Usep', title: 'MLBB', did: 'massage gun', response: 'better' }, { athlete: 'Leoni', title: 'MLBB', did: 'stretching', response: 'same' }]),
    rep('2026-11-19', 'physio', [{ athlete: 'Aran', title: 'MLBB', did: 'stretching', vasBefore: '8', vasAfter: '7', response: 'worse' }, { athlete: 'Vivi', title: 'MLBB Women', did: 'US', vasBefore: '4', vasAfter: '2' }]),
    rep('2026-11-19', 'psych', [], { general: { found: 'komunikasi baik', teams: ['MLBB'] } }),
  ];
  const w = weekRange('2026-11-19'); assert.deepEqual(w, { from: '2026-11-13', to: '2026-11-19', prevFrom: '2026-11-06', prevTo: '2026-11-12' });
  const A = anonymise(reports, w.from, w.to); assert.ok(A.rows.every((x) => !('athlete' in x)), 'no names in the names-free shape');
  const S = summarize(A);
  assert.equal(S.reports, 5); assert.equal(S.seen, 8); assert.equal(S.byTitle.MLBB, 7); assert.equal(S.followUps, 1); assert.equal(S.repeat, 1);
  assert.equal(S.vasDrop, 1.5); assert.equal(S.vasN, 2); assert.equal(S.highVas, 1); assert.deepEqual([S.better, S.worse, S.responded], [2, 1, 4]);
  assert.equal(S.byDisc.physio.days, 3); assert.equal(S.byDisc.physical.days, 0);
  const sig = weekSignals(S, summarize({ reports: [], rows: [], repeat: 0 })).map((x) => x.text).join(' | ');
  assert.match(sig, /MLBB: 7 athlete visits this week \(0 the week before\)/); assert.match(sig, /1 athlete\(s\) seen 3\+ times/); assert.match(sig, /No physical conditioning report this week/);
  assert.equal(perDay(A, w.from, w.to).find((d) => d.day === '2026-11-19').seen, 2);
  assert.deepEqual(repeatAthletes(reports, w.from, w.to).map((x) => [x.athlete, x.n]), [['Aran', 4]]);
  const watch = watchList(reports, w.from, w.to);
  assert.ok(watch.some((x) => x.kind === 'worse' && x.athlete === 'Aran'));
  assert.ok(!watch.some((x) => x.kind === 'follow-up' && x.athlete === 'Aran'), 'Aran was seen again after the follow-up');
  const b = dayBoard(reports, '2026-11-19'); assert.equal(b.find((x) => x.disc === 'physio').seen, 2); assert.equal(b.find((x) => x.disc === 'medic').n, 0);
  assert.throws(() => noticeRecord({ title: 'MLBB', athlete: 'Aran', text: '', by: 'x', date: '2026-11-19' }), /line for the coaches/);
});

test('scrim-ai: support_parse needs the support permission, not a title; logged without a title', async () => {
  const calls = []; const inserts = []; let allowed = true;
  const deps = { env: { ANTHROPIC_API_KEY: 'k' }, uuid: () => 'u', now: () => new Date('2026-11-19T05:00:00Z'), heroes: HEROES, sleep: async () => {},
    fetch: async (url, init) => { calls.push(JSON.parse(init.body)); return { ok: true, status: 200, headers: { get: () => null }, json: async () => ({ content: [{ type: 'text', text: '{"rows":[]}' }], stop_reason: 'end_turn', usage: {} }) }; },
    clientFor: () => ({ auth: { getUser: async () => ({ data: { user: { id: 'x' } }, error: null }) }, rpc: async (fn) => ({ data: fn === 'can_support_write' ? allowed : fn === 'can_write_title' ? false : 0, error: null }), from: () => ({ insert: async (row) => { inserts.push(row); return { error: null }; } }) }) };
  const call = (body) => handle({ method: 'POST', headers: { authorization: 'Bearer t' }, json: async () => body }, deps);
  assert.equal((await call({ action: 'support_parse', text: '' })).status, 400);
  const ok = await call({ action: 'support_parse', text: 'Laporan harian', roster, discipline: 'physio' }); assert.equal(ok.status, 200);
  const user = JSON.parse(calls.at(-1).messages[0].content[0].text); assert.equal(user.DISCIPLINE, 'physio'); assert.deepEqual(user.ROSTER.MLBB, ['Usep', 'Aran', 'Leoni']);
  assert.ok(calls.at(-1).output_config.format.schema.properties.rows); assert.equal(inserts.at(-1).action, 'support_parse'); assert.equal(inserts.at(-1).title, null);
  allowed = false; assert.equal((await call({ action: 'support_parse', text: 'x' })).status, 403);
});
