import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scrimReport, addNote, byDay, reportSummary, reportsCsv, resultText, GAME_SPEC, REPORT_TITLES } from '../src/core/reports.js';

const base = { title: 'MLBB', date: '2026-11-10', by: 'Coach Indra', partner: 'Team X', focus: 'Early rotations', progress: 4, worked: 'Lane swaps', adjust: 'Faster turtle setup', won: 2, lost: 1 };

test('every WEC title has a report spec', () => {
  assert.deepEqual([...REPORT_TITLES].sort(), ['CS2', 'CS2 Women', 'Dota 2', 'MLBB', 'MLBB Women', 'PUBG Mobile', 'eFootball'].sort());
  for (const t of REPORT_TITLES) assert.ok(GAME_SPEC[t].detail && GAME_SPEC[t].hint);
});

test('a complete report is saved as operational data', () => {
  const r = scrimReport(base);
  assert.equal(r.origin, 'operational'); assert.equal(r.result.won, 2); assert.equal(resultText(r.result), '2-1'); assert.deepEqual(r.notes, []);
});

test('required fields are enforced with plain messages', () => {
  assert.throws(() => scrimReport({ ...base, by: '' }), /Who wrote/);
  assert.throws(() => scrimReport({ ...base, partner: '' }), /sparring partner/);
  assert.throws(() => scrimReport({ ...base, focus: '' }), /practise/);
  assert.throws(() => scrimReport({ ...base, progress: 0 }), /1 to 5/);
  assert.throws(() => scrimReport({ ...base, worked: '', failed: '' }), /worked or what failed/);
  assert.throws(() => scrimReport({ ...base, adjust: '' }), /adjustment/);
  assert.throws(() => scrimReport({ ...base, won: 0, lost: 0 }), /at least one game/);
  assert.throws(() => scrimReport({ ...base, won: -1 }), /whole number/);
  assert.throws(() => scrimReport({ ...base, date: '10-11-2026' }), /Date/);
  assert.throws(() => scrimReport({ ...base, title: 'Chess' }), /Pick a title/);
});

test('PUBG Mobile records points, not wins and losses', () => {
  const r = scrimReport({ ...base, title: 'PUBG Mobile', won: '', lost: '', played: 6, points: 71, avgPlacement: 5.5 });
  assert.equal(r.result.mode, 'points'); assert.equal(resultText(r.result), '71 pts in 6 matches, avg place 5.5');
  assert.throws(() => scrimReport({ ...base, title: 'PUBG Mobile', played: 0, points: 10 }), /Matches played/);
  assert.throws(() => scrimReport({ ...base, title: 'PUBG Mobile', played: 3, points: '' }), /points/i);
  assert.throws(() => scrimReport({ ...base, title: 'PUBG Mobile', played: 3, points: 10, avgPlacement: 40 }), /between 1 and 25/);
});

test('eFootball and CS2 use their own wording; round scores are allowed in notes', () => {
  assert.throws(() => scrimReport({ ...base, title: 'eFootball', won: 0, lost: 0 }), /at least one match/);
  assert.throws(() => scrimReport({ ...base, title: 'CS2', won: 0, lost: 0 }), /at least one map/);
  const r = scrimReport({ ...base, title: 'CS2', detail: 'Mirage 13-9 10-13 16-14', worked: 'x' });
  assert.match(r.detail, /16-14/);
});

test('phone or ID numbers are refused in player notes and corrections only', () => {
  assert.throws(() => scrimReport({ ...base, playerNotes: 'call him on 0812 3456 7890' }), /remove phone/);
  const r = scrimReport(base);
  assert.throws(() => addNote(r, { text: '081234567890', by: 'A' }), /remove phone/);
  assert.equal(scrimReport({ ...base, playerNotes: 'Ahmad: strong first lane, hesitates on second tower' }).playerNotes.length > 5, true);
});

test('corrections are appended; the original report is never changed', () => {
  const r = scrimReport(base); const c = addNote(r, { text: 'Score was 2-0, not 2-1', by: 'Fayad' });
  assert.equal(r.notes.length, 0); assert.equal(c.notes.length, 1); assert.equal(c.result.lost, 1); assert.equal(c.notes[0].by, 'Fayad');
  assert.throws(() => addNote(r, { text: '', by: 'A' }), /Write the correction/);
  assert.throws(() => addNote(r, { text: 'x', by: '' }), /Who wrote/);
});

test('daily roll-up groups sessions by date and adds up results', () => {
  const rs = [scrimReport(base), scrimReport({ ...base, partner: 'Team Y', won: 1, lost: 2, progress: 2, focus: 'Draft' }), scrimReport({ ...base, date: '2026-11-09', won: 3, lost: 0 }), scrimReport({ ...base, title: 'Dota 2' })];
  const d = byDay(rs, 'MLBB');
  assert.equal(d.length, 2); assert.equal(d[0].date, '2026-11-10'); assert.equal(d[0].n, 2); assert.equal(d[0].won, 3); assert.equal(d[0].lost, 3); assert.equal(d[0].progress, 3); assert.deepEqual(d[0].focus, ['Early rotations', 'Draft']);
});

test('summary: seven-day totals, trend, days since last report, carry-over adjustment', () => {
  const mk = (date, won, lost, progress, adjust) => scrimReport({ ...base, date, won, lost, progress, adjust });
  const rs = [mk('2026-11-10', 2, 1, 4, 'A'), mk('2026-11-09', 1, 1, 4, 'B'), mk('2026-11-02', 0, 2, 2, 'C')];
  const s = reportSummary(rs, 'MLBB', '2026-11-12');
  assert.equal(s.sessions, 2); assert.equal(s.won, 3); assert.equal(s.lost, 2); assert.equal(s.winRate, 60); assert.equal(s.progress, 4); assert.equal(s.progressPrev, 2); assert.equal(s.trend, 'up');
  assert.equal(s.daysSince, 2); assert.equal(s.carryOver.adjust, 'A'); assert.equal(s.daysCovered, 2);
  const none = reportSummary([], 'MLBB', '2026-11-12'); assert.equal(none.sessions, 0); assert.equal(none.winRate, null); assert.equal(none.last, null); assert.equal(none.trend, null);
});

test('CSV export keeps quotes and commas intact and includes corrections', () => {
  const r = addNote(scrimReport({ ...base, worked: 'Said "go", then went', detail: 'a,b' }), { text: 'fix', by: 'Fayad' });
  const csv = reportsCsv([r]); const lines = csv.split('\n');
  assert.equal(lines.length, 2); assert.match(lines[1], /"Said ""go"", then went"/); assert.match(lines[1], /"a,b"/); assert.match(lines[1], /Fayad: fix/);
  assert.match(lines[0], /^id,date,time,title,coach/);
});
