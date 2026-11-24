import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { JOBS, supportReport, usersOfDay, fromParse, findAthlete, titleOf, whatsappText, anonymise, summarize, perDay, weekSignals, repeatAthletes, watchList, dayBoard, weekRange, noticeRecord, groupRows, isBlankRow } from '../src/core/support.js';
import { handle } from '../supabase/functions/_shared/scrim_ai_handler.js';
import { HEROES } from '../supabase/functions/_shared/catalog.gen.js';

const roster = { MLBB: ['Usep', 'Aran', 'Leoni'], 'MLBB Women': ['Vivi', 'Cindy', 'Fumy', 'Vival'], eFootball: ['Elga'], CS2: ['Jovan'], 'CS2 Women': [] };
const rep = (date, discipline, rows, extra = {}) => supportReport({ date, discipline, by: 'Staff', rows, asOf: '2026-11-19', ...extra });

test('a report: rows per athlete, team part, who was seen; empty rows dropped; phone numbers refused', () => {
  const r = rep('2026-11-17', 'medic', [{ athlete: 'Usep', title: 'MLBB', found: 'batuk kering 2 hari; obs batuk', did: 'Siladex syrup 3x5ml', followUp: true },
    { athlete: 'Cindy', title: 'MLBB Women', found: 'luka lecet lutut kiri', did: 'Betason n cream k/p' }, {}]);
  assert.equal(r.rows.length, 2); assert.equal(r.rows[0].followUp, 'Yes', 'an old follow-up tick reads as "Yes" (V1.36: follow-up is a text)'); assert.equal(r.origin, 'operational');
  assert.equal(usersOfDay(r).text, '2 athletes: MLBB 1, MLBB Women 1');
  // Six jobs: two physios and two psychologists (men / women) share their role's form.
  assert.deepEqual(Object.keys(JOBS), ['medic', 'physio_men', 'physio_women', 'physical', 'psych_men', 'psych_women']); assert.equal(JOBS.psych_men.disc, 'psych');
  assert.throws(() => rep('2026-11-17', 'medic', [{ athlete: 'Usep', found: '' , did: '' }]), /write what was done or the findings/);
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
  assert.equal(p.rows[0].athlete, 'Vivy Indrawaty', 'V1.36: the full name from the national-team list'); assert.equal(p.rows[0].title, 'MLBB Women'); assert.equal(p.rows[0].vasBefore, '4');
  assert.equal(p.rows[1].athlete, ''); assert.deepEqual(p.unmatched, ['Bang Jonathan']);
  const r = rep('2026-11-19', 'physio', p.rows); assert.equal(r.rows[1].athlete, 'Bang Jonathan', 'an unknown name is kept as written');
  assert.match(whatsappText(r, 'id'), /1\. Vivy Indrawaty \(MLBB Women\)[\s\S]*Yang dilakukan \(Fisio\): Ultrasound[\s\S]*Temuan: tightness quadriceps[\s\S]*VAS 4\/10 → 3\/10[\s\S]*User hari ini: 2 athletes/);
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
  assert.ok(watch.some((x) => x.kind === 'follow-up' && x.athlete === 'Aran' && x.disc === 'medic'), 'V1.46: the doctor follow-up stays open after a physio visit (only the same role or Done closes it)');
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

// ---------------------------------------------------------------- V1.35 one session, many athletes
test('group session: one entry becomes one row per athlete; typed names get their team; checks', () => {
  const rows = groupRows({ picks: ['MLBB|Aran', 'MLBB|Usep', 'MLBB|Aran'], others: 'Jonathan (CS2), Rina (MLBB W)', did: 'Stretching 30 menit', found: '', followUp: true });
  assert.deepEqual(rows.map((r) => [r.title, r.athlete || r.athleteSeen]), [['MLBB', 'Aran'], ['MLBB', 'Usep'], ['CS2', 'Jonathan (CS2)'], ['MLBB Women', 'Rina (MLBB W)']]);
  assert.ok(rows.every((r) => r.did === 'Stretching 30 menit' && r.followUp));
  const r = rep('2026-11-19', 'physical', rows); assert.equal(usersOfDay(r).text, '4 athletes: MLBB 2, CS2 1, MLBB Women 1');
  assert.throws(() => groupRows({ picks: ['MLBB|Aran'], did: '', found: '' }), /write what you did or what you found/);
  assert.throws(() => groupRows({ picks: [], others: '', did: 'x' }), /tick the athletes/);
  assert.ok(isBlankRow({ athlete: '', athleteSeen: '', did: '', found: '', region: '', notifyText: '' }));
});

const html = readFileSync(new URL('../dist/hub.html', import.meta.url), 'utf8');
test('support screen: tick a whole team, write once, add, save one report with a row per athlete', async () => {
  const store = new Map();
  const db = { doc: () => ({ set: async () => {}, onSnapshot: () => () => {} }),
    collection: (col) => ({ doc: (id) => ({ set: async (d) => { store.set(`${col}/${id}`, d); }, onSnapshot: () => () => {} }), add: async () => {}, onSnapshot: () => () => {} }) };
  const dom = new JSDOM(`<!doctype html><html><body>${html}</body></html>`, { runScripts: 'dangerously', url: 'https://example.test/#support', beforeParse(w) { w.localStorage.setItem('hub-lang', 'en'); w.claude = { use: async (nm) => (nm === 'db' ? db : null) }; } });
  const wait = () => new Promise((res) => setTimeout(res, 30)); await wait();
  const d = dom.window.document; const text = () => d.getElementById('main').textContent;
  const fire = async (id, v) => { const el = d.getElementById(id); assert.ok(el, `no #${id}`); el.value = v; el.dispatchEvent(new dom.window.Event('change', { bubbles: true })); await wait(); };
  await fire('supDisc', 'physical');
  assert.match(text(), /One session, many athletes/);
  d.querySelector('[data-sup-gall="MLBB"]').click(); await wait();
  assert.equal(d.querySelectorAll('input[data-sup-gp]:checked').length, 5);
  assert.equal(d.getElementById('supGpN').textContent, '5');
  d.querySelector('[data-sup-gadd]').click(); await wait();
  assert.match(d.getElementById('supGpMsg').textContent, /write what you did or what you found/);
  await fire('supGpDid', 'Stretching & mobility 30 menit');
  await fire('supGpOther', 'Jonathan (CS2)');
  d.querySelector('[data-sup-gadd]').click(); await wait();
  assert.equal(d.querySelectorAll('[id^="sR-"][id$="-did"]').length, 6, 'one row per athlete');
  assert.match(d.getElementById('supMsg').textContent, /6 athletes added from the group session/);
  d.querySelector('[data-sup-save]').click(); await wait();
  const saved = [...store.entries()].filter(([k]) => k.startsWith('support_reports/')).map(([, v]) => v);
  assert.equal(saved.length, 1); assert.equal(saved[0].rows.length, 6);
  assert.ok(saved[0].rows.every((r) => r.did === 'Stretching & mobility 30 menit'));
});

test('V1.46 follow-ups carry over: open until Done or a newer report by the same role; Done survives an edit', async () => {
  const { openFollowUps, closeFollowUp, watchList: wl } = await import('../src/core/support.js');
  const a = { ...rep('2026-11-17', 'physio', [{ athlete: 'Usep', title: 'MLBB', did: 'massage', followUp: 'recheck hamstring' }, { athlete: 'Vivi', title: 'MLBB Women', did: 'US', followUp: 'ice 2x' }], { by: 'Ilham' }), id: 'A' };
  const b = { ...rep('2026-11-18', 'psych', [{ athlete: 'Usep', title: 'MLBB', did: 'talk', followUp: '' }], { by: 'Fadhil' }), id: 'B' };
  let all = [a, b];
  assert.deepEqual(openFollowUps(all, '2026-11-10', '2026-11-19').map((f) => f.athlete), ['Usep', 'Vivi'], 'a psychologist seeing Usep does not close the physio follow-up');
  assert.deepEqual(openFollowUps(all, '2026-11-10', '2026-11-19', 'Fadhil'), [], 'only my own');
  const c = { ...rep('2026-11-19', 'physio', [{ athlete: 'Vivi', title: 'MLBB Women', did: 'US again' }], { by: 'Ilham' }), id: 'C' };
  all = [a, b, c];
  assert.deepEqual(openFollowUps(all, '2026-11-10', '2026-11-19').map((f) => f.athlete), ['Usep'], 'a newer physio visit closes the older one');
  const a2 = closeFollowUp(a, 0, 'Ilham', '2026-11-19T03:00:00Z'); all = [a2, b, c];
  assert.deepEqual(openFollowUps(all, '2026-11-10', '2026-11-19'), []);
  assert.ok(!wl(all, '2026-11-13', '2026-11-19').some((x) => x.kind === 'follow-up'));
  const edited = supportReport({ ...a2, asOf: '2026-11-19' });
  assert.deepEqual(edited.rows[0].fuDone, { at: '2026-11-19T03:00:00Z', by: 'Ilham' }, 'saving an edit keeps Done');
  assert.throws(() => closeFollowUp(b, 0, 'x'), /no longer in the report/);
});

test('V1.46 who has not reported today, and the WhatsApp reminder', async () => {
  const { reportedOn, reminderText } = await import('../src/core/support.js');
  const staff = [{ name: 'Dokter Aji', job: 'medic' }, { name: 'Ilham', job: 'physio_men' }, { name: 'Putu', job: 'psych_women' }];
  const reps = [rep('2026-11-19', 'physio', [{ athlete: 'Usep', did: 'x' }, { athlete: 'Aran', did: 'y' }], { by: 'Ilham' }), rep('2026-11-19', 'physio', [{ athlete: 'Leoni', did: 'x' }], { by: 'Donny' }), rep('2026-11-18', 'medic', [{ athlete: 'Usep', did: 'x' }], { by: 'Dokter Aji' })];
  const r = reportedOn(staff, reps, '2026-11-19');
  assert.deepEqual(r.done.map((x) => [x.name, x.n]), [['Ilham', 2], ['Donny', 1]], 'others who filed count as reported');
  assert.deepEqual(r.missing.map((x) => x.name), ['Dokter Aji', 'Putu']);
  assert.deepEqual(reportedOn([...staff, { name: 'New', job: 'physical', since: '2026-11-20' }], reps, '2026-11-19').missing.map((x) => x.name), ['Dokter Aji', 'Putu'], 'not missing before their first report');
  assert.match(reminderText(r, 'id'), /Pengingat laporan harian — 2026-11-19\nBelum masuk: Dokter Aji, Putu/);
  assert.doesNotMatch(reminderText(r, 'id'), /Usep/, 'no athlete names in the reminder');
});

test('V1.46 check before WEC: latest pain, worse, repeat visits, open follow-ups; highest concern first', async () => {
  const { readinessList } = await import('../src/core/support.js');
  const reps = [
    rep('2026-11-09', 'physio', [{ athlete: 'Old', title: 'MLBB', did: 'x', vasBefore: 9, vasAfter: 8 }]),                                   // outside 14 days
    rep('2026-11-14', 'physio', [{ athlete: 'Aran', title: 'MLBB', did: 'x', vasBefore: 8, vasAfter: 8 }]),
    rep('2026-11-18', 'physio', [{ athlete: 'Aran', title: 'MLBB', did: 'x', vasBefore: 5, vasAfter: 3, response: 'better' }]),           // pain came down: not flagged
    rep('2026-11-18', 'medic', [{ athlete: 'Vivi', title: 'MLBB Women', did: 'x', vasAfter: 7, response: 'worse' }]),
    ...['2026-11-15', '2026-11-16', '2026-11-17'].map((d) => rep(d, 'psych', [{ athlete: 'Elga', title: 'eFootball', did: 'talk' }])),
    rep('2026-11-19', 'medic', [{ athlete: 'Usep', title: 'MLBB', did: 'x', followUp: 'recheck' }]),
  ].map((r, i) => ({ ...r, id: `R${i}` }));
  const L = readinessList(reps, '2026-11-23', 14);
  assert.deepEqual(L.map((a) => a.athlete), ['Vivi', 'Elga', 'Usep']);
  assert.deepEqual(L[0].why.map((x) => x.kind), ['pain', 'worse']); assert.equal(L[1].why[0].text, 'seen 3× in 14 days'); assert.equal(L[2].open.length, 1);
});
