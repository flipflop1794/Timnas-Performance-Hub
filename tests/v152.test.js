import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkRecap, afterMaterial, afterFromAi, canAfter, decideNote, usedFocus, sessionBrief, briefText } from '../src/core/recap.js';
import { scrimReport, REPORT_TITLES } from '../src/core/reports.js';
import { tagRecord } from '../src/core/weakness.js';
import { handle } from '../supabase/functions/_shared/scrim_ai_handler.js';
import { recapSchema, recapPrompt, afterSchema, RECAP_KIND } from '../supabase/functions/_shared/scrim_spec.js';
import { HEROES } from '../supabase/functions/_shared/catalog.gen.js';

const blank = { focus: '', worked: '', failed: '', adjust: '', player_notes: '', detail: '', not_placed: '' };

test('V1.52 recap: every one of the 7 titles has its own row shape and prompt', () => {
  assert.deepEqual(Object.keys(RECAP_KIND).sort(), [...REPORT_TITLES].sort());
  for (const t of REPORT_TITLES) { const s = recapSchema(t); assert.ok(s.properties.rows.items.properties); assert.ok(s.properties.adjust); assert.match(recapPrompt(t, ['Usep']), /Usep/); }
  assert.deepEqual(Object.keys(recapSchema('CS2').properties.rows.items.properties), ['map', 'us', 'them', 'ct']);
  assert.deepEqual(Object.keys(recapSchema('PUBG Mobile').properties.rows.items.properties), ['map', 'place', 'kills']);
  assert.deepEqual(Object.keys(recapSchema('eFootball').properties.rows.items.properties), ['us', 'them', 'extra', 'pen_us', 'pen_them']);
  assert.deepEqual(Object.keys(recapSchema('Dota 2').properties.rows.items.properties), ['side', 'res']);
});

test('V1.52 recap: scores must be written in the recap; partner too; rows come out as the form holds them', () => {
  const cs = 'Scrim vs Team Alpha. Mirage 13-9 (CT 8), Inferno 10-13. Utility B site telat. Next: default T side Inferno.';
  const out = checkRecap('CS2', cs, { ...blank, date: '2026-11-20', partner: 'Team Alpha', failed: 'Utility B site telat.', adjust: 'default T side Inferno.',
    rows: [{ map: 'de_mirage', us: 13, them: 9, ct: 8 }, { map: 'Inferno', us: 10, them: 13, ct: -1 }, { map: 'Nuke', us: 16, them: 14, ct: -1 }] }, { today: '2026-11-24' });
  assert.deepEqual(out.rows, [{ map: 'Mirage', us: '13', them: '9', ct: '8' }, { map: 'Inferno', us: '10', them: '13', ct: '' }]);
  assert.equal(out.fields.partner, 'Team Alpha'); assert.equal(out.fields.date, '2026-11-20'); assert.equal(out.fields.adjust, 'default T side Inferno.');
  assert.match(out.flags.find((f) => f.field === 'rows').text, /1 result line\(s\) left out/, 'a map with scores that are not in the text is dropped');
  // A partner the coach did not write, and a date in the future, are not filled.
  const bad = checkRecap('CS2', cs, { ...blank, date: '2026-12-30', partner: 'Team Beta', rows: [] }, { today: '2026-11-24' });
  assert.equal(bad.fields.partner, undefined); assert.equal(bad.fields.date, undefined); assert.match(bad.flags[0].text, /not written in your recap/);

  const br = checkRecap('PUBG Mobile', 'Match 1 Erangel #3 8 kill, match 2 Miramar #11 2 kill', { ...blank, date: '', partner: '', rows: [{ map: 'Erangel', place: 3, kills: 8 }, { map: 'Miramar', place: 11, kills: 2 }, { map: '', place: 1, kills: 20 }] });
  assert.deepEqual(br.rows, [{ map: 'Erangel', place: '3', kills: '8' }, { map: 'Miramar', place: '11', kills: '2' }]);
  const foot = checkRecap('eFootball', 'vs X: 2-1, 0-1, 1-1 menang penalti 4-3', { ...blank, date: '', partner: 'X', rows: [{ us: 2, them: 1, extra: '', pen_us: -1, pen_them: -1 }, { us: 0, them: 1, extra: '', pen_us: -1, pen_them: -1 }, { us: 1, them: 1, extra: 'pk', pen_us: 4, pen_them: 3 }] });
  assert.deepEqual(foot.rows[2], { us: '1', them: '1', extra: 'pk', penUs: '4', penThem: '3' }); assert.equal(foot.rows.length, 3);
  const dota = checkRecap('Dota 2', 'menang 2-1: game 1 radiant menang, game 2 dire kalah, game 3 radiant menang', { ...blank, date: '', partner: '', rows: [{ side: 'radiant', res: 'win' }, { side: 'dire', res: 'loss' }, { side: 'blue', res: 'win' }, { side: '', res: '' }] });
  assert.deepEqual(dota.rows, [{ side: 'radiant', res: 'win' }, { side: 'dire', res: 'loss' }, { side: '', res: 'win' }], 'an MLBB side is not kept for Dota 2; a row without a result is dropped');
  // Health sentences never reach a field (the debrief rule still applies).
  const h = checkRecap('MLBB', 'Rotasi telat. Kevin sakit demam.', { ...blank, date: '', partner: '', rows: [], failed: 'Rotasi telat. Kevin sakit demam.' });
  assert.equal(h.fields.failed, 'Rotasi telat.');
});

const mk = (title, date, extra = {}) => ({ ...scrimReport({ title, date, by: 'Coach', partner: 'Team X', won: 1, lost: 1, adjust: 'vision sebelum lord', failed: 'lord fight telat', ...extra }), id: `R-${date}` });

test('V1.52 after-save note: material, checks (numbers, sources), Use / Ignore, and the labels in the same answer', () => {
  const reps = [mk('MLBB', '2026-11-20'), mk('MLBB', '2026-11-22'), mk('MLBB', '2026-11-23', { failed: 'lord fight masih telat 2 kali' }), mk('CS2', '2026-11-22')];
  const cur = reps[2]; const m = afterMaterial(cur, reps, [], '2026-11-24');
  assert.deepEqual(m.earlier.map((r) => r.id), ['R-2026-11-22', 'R-2026-11-20'], 'same title only, newest first, before this report');
  assert.equal(canAfter(cur), true); assert.equal(canAfter({ failed: ' ', adjust: '' }), false);
  const good = afterFromAi({ tags: ['objective timing', 'not a tag'], repeats: 'Lord fight telat muncul lagi, 2 kali.', focus: 'Set up vision sebelum lord.', question: 'Apa yang membuat kita telat ke lord?', based_on: ['R-2026-11-23', 'R-2026-11-22', 'R-other'] }, m, 'MLBB', { model: 'm', at: 'T' });
  assert.deepEqual(good.note.basedOn, ['R-2026-11-23', 'R-2026-11-22']); assert.equal(good.note.status, 'new'); assert.match(good.note.repeats, /2 kali/);
  assert.ok(good.tags.every((t) => t !== 'not a tag'));
  // A number that is not in the material drops the line; "repeats" with no earlier report behind it is dropped; no focus = no note.
  const bad = afterFromAi({ tags: [], repeats: 'Sudah 7 kali terjadi.', focus: 'Latihan lord.', question: '', based_on: ['R-2026-11-23', 'R-2026-11-22'] }, m, 'MLBB');
  assert.equal(bad.note.repeats, ''); assert.equal(bad.note.focus, 'Latihan lord.');
  assert.equal(afterFromAi({ repeats: 'Lord telat lagi.', focus: 'Lord.', based_on: ['R-2026-11-23'] }, m, 'MLBB').note.repeats, '');
  assert.equal(afterFromAi({ tags: [], repeats: '', focus: '', question: 'x', based_on: [] }, m, 'MLBB').note, null);
  const row = { ...tagRecord(cur, good.tags, { by: 'AI', source: 'ai' }), after: good.note };
  const used = decideNote(row, 'used', 'Coach', 'T2'); assert.equal(used.after.status, 'used'); assert.equal(used.after.decidedBy, 'Coach');
  assert.throws(() => decideNote({ id: 'x' }, 'used', 'c'), /no longer there/); assert.throws(() => decideNote(row, 'maybe', 'c'));
  assert.equal(usedFocus([used], 'MLBB').after.focus, 'Set up vision sebelum lord.'); assert.equal(usedFocus([row], 'MLBB'), null);
});

test('V1.52 before today\'s session: built from records only; WhatsApp text in Bahasa', () => {
  const reps = [mk('MLBB', '2026-11-20'), mk('MLBB', '2026-11-23', { adjust: 'ward lord 30 detik lebih awal' })];
  assert.equal(sessionBrief('Dota 2', { reports: reps }, '2026-11-24'), null, 'no report yet: no card');
  const tags = ['2026-11-18', '2026-11-20', '2026-11-23'].map((d, i) => ({ ...tagRecord({ id: `R-${d}`, title: 'MLBB', date: d }, ['objective timing'], { by: 'AI', source: 'ai' }),
    ...(i === 2 ? { after: { focus: 'Vision sebelum lord', question: 'Kenapa telat?', repeats: '', basedOn: [], status: 'used', decidedAt: 'T' } } : {}) }));
  const b = sessionBrief('MLBB', { reports: reps, tagRows: tags, scrims: [{ title: 'MLBB', status: 'planned', date: '2026-11-24', time: '14:00', partner: 'Team Y', kind: 'scrim' }] }, '2026-11-24');
  assert.equal(b.change.text, 'ward lord 30 detik lebih awal'); assert.equal(b.focus.text, 'Vision sebelum lord'); assert.deepEqual(b.repeats, { tag: 'objective timing', n: 3 }); assert.equal(b.session.partner, 'Team Y');
  const text = briefText(b, 'id');
  assert.match(text, /\*MLBB — sebelum sesi hari ini\*/); assert.match(text, /Sesi: 14:00 vs Team Y/); assert.match(text, /Masih berulang: objective timing \(3 laporan dalam 14 hari\)/); assert.match(text, /Pertanyaan untuk pemain: Kenapa telat\?/);
  // A focus chosen more than a week ago is not shown as today's focus.
  assert.equal(sessionBrief('MLBB', { reports: reps, tagRows: tags }, '2026-12-05').focus, null);
});

test('V1.52 scrim-ai: recap and after are title actions, validated and logged', async () => {
  const calls = []; const inserts = [];
  const deps = { env: { ANTHROPIC_API_KEY: 'k' }, uuid: () => 'u', now: () => new Date('2026-11-24T05:00:00Z'), heroes: HEROES, sleep: async () => {},
    fetch: async (url, init) => { calls.push(JSON.parse(init.body)); return { ok: true, status: 200, headers: { get: () => null }, json: async () => ({ content: [{ type: 'text', text: '{"rows":[]}' }], stop_reason: 'end_turn', usage: {} }) }; },
    clientFor: () => ({ auth: { getUser: async () => ({ data: { user: { id: 'x' } }, error: null }) }, rpc: async (fn, a) => ({ data: fn === 'can_write_title' ? a.t === 'CS2' : 0, error: null }), from: () => ({ insert: async (row) => { inserts.push(row); return { error: null }; } }) }) };
  const call = (body) => handle({ method: 'POST', headers: { authorization: 'Bearer t' }, json: async () => body }, deps);
  assert.equal((await call({ action: 'recap', title: 'CS2', text: ' ' })).status, 400);
  assert.equal((await call({ action: 'recap', title: 'CS2', text: 'x'.repeat(6001) })).status, 413);
  assert.equal((await call({ action: 'recap', title: 'MLBB', text: 'Scrim vs X' })).status, 403, 'only for a title the coach writes');
  assert.equal((await call({ action: 'recap', title: 'CS2', text: 'Scrim vs X. Mirage 13-9.', roster: ['Jovan'] })).status, 200);
  assert.deepEqual(Object.keys(calls.at(-1).output_config.format.schema.properties.rows.items.properties), ['map', 'us', 'them', 'ct']); assert.equal(inserts.at(-1).action, 'recap'); assert.equal(inserts.at(-1).title, 'CS2');
  assert.equal((await call({ action: 'after', title: 'CS2', material: { report: { id: 'R1', failed: '', adjust: '' } } })).status, 400);
  const ok = await call({ action: 'after', title: 'CS2', material: { report: { id: 'R1', failed: 'utility telat', adjust: 'default T' }, earlier: Array.from({ length: 9 }, (_, i) => ({ id: `E${i}`, failed: 'x' })), weaknesses: [{ tag: 'utility', n: 3 }] } });
  assert.equal(ok.status, 200);
  const sent = JSON.parse(calls.at(-1).messages[0].content[0].text); assert.equal(sent.EARLIER.length, 5); assert.equal(sent.REPORT.adjustment, 'default T'); assert.deepEqual(sent.WEAKNESSES, [{ label: 'utility', reports_14_days: 3 }]);
  assert.ok(afterSchema('CS2').properties.tags.items.enum.length); assert.equal(inserts.at(-1).action, 'after');
});
