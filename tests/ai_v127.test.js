import { test } from 'node:test';
import assert from 'node:assert/strict';
import { grounded, numbersIn, numbersOk, aiFeedback, aiEdit, feedbackStats, feedbackFor } from '../src/core/ai_feedback.js';
import { liveEntry, opponentBrief, prematchMaterial, materialIds, scoutDayMaterial, daySummaryRecord } from '../src/core/scouting.js';
import { planBrainMaterial, checkReply, sessionText, BRAIN_MAX } from '../src/core/brainstorm.js';
import { scrimReport } from '../src/core/reports.js';
import { board } from '../src/core/competitors.js';
import { handle } from '../supabase/functions/_shared/scrim_ai_handler.js';
import { HEROES } from '../supabase/functions/_shared/catalog.gen.js';

test('grounding: a line needs a known source and only numbers from the material', () => {
  const m = { a: [{ id: 'K1', text: 'Picked Ling 3 times' }] };
  const g = { allowed: numbersIn(m), ids: materialIds(m) };
  const r = grounded([{ text: 'Ling came up 3 times', sources: ['K1', 'ZZ'] }, { text: 'Ling 5 times', sources: ['K1'] }, { text: 'No source', sources: [] }, { text: 'Unknown id', sources: ['ZZ'] }], g);
  assert.equal(r.kept.length, 1); assert.deepEqual(r.kept[0].sources, ['K1']); assert.equal(r.dropped, 3);
  assert.equal(numbersOk('no digits', g.allowed), true);
});

test('feedback: ratings, a reason for "wrong", edits only when changed, stats per feature', () => {
  assert.throws(() => aiFeedback({ title: 'MLBB', feature: 'plan', ref: 'x', rating: 'meh', by: 'A' }), /useful, not useful or wrong/);
  assert.throws(() => aiFeedback({ title: 'MLBB', feature: 'plan', ref: 'x', rating: 'wrong', reason: '', by: 'A' }), /what was wrong/);
  assert.throws(() => aiFeedback({ title: 'MLBB', feature: 'nope', ref: 'x', rating: 'useful', by: 'A' }), /Unknown AI feature/);
  const f1 = aiFeedback({ title: 'MLBB', feature: 'plan', ref: 'p1', rating: 'useful', by: 'Indra' });
  const f2 = aiFeedback({ title: 'MLBB', feature: 'plan', ref: 'p2', rating: 'wrong', reason: 'Suggested a hero we do not play', by: 'Indra' });
  const f3 = aiFeedback({ title: 'Dota 2', feature: 'prematch', ref: 'm', rating: 'not useful', reason: 'too long', by: 'A' });
  assert.equal(aiEdit({ title: 'MLBB', feature: 'prematch', ref: 'm', before: 'Ban Ling', after: 'Ban Ling', by: 'A' }), null);
  const e = aiEdit({ title: 'MLBB', feature: 'prematch', ref: 'm', before: 'Ban Ling', after: 'Ban Ling and Fanny', by: 'A' });
  assert.equal(e.rating, 'edited'); assert.equal(e.kind, 'ai_feedback');
  const st = feedbackStats([f1, f2, f3, e]);
  const plan = st.find((s) => s.feature === 'plan'); assert.equal(plan.useful, 1); assert.equal(plan.wrong, 1); assert.equal(plan.usefulShare, 50); assert.match(plan.reasons[0].reason, /hero we do not play/);
  assert.equal(st.find((s) => s.feature === 'prematch').edited, 1);
  assert.equal(feedbackStats([f1, f3], { title: 'Dota 2' }).length, 1);
  assert.equal(feedbackFor([f1, f2], 'plan', 'p2').length, 1);
  assert.equal(board('MLBB', [f1, e]).covered, board('MLBB').covered, 'feedback is not a scouting note');
});

test('scouting AI material: ids for brief, live log and counts; day material per nation; approved days feed the next brief', () => {
  const at = new Date('2026-12-16T10:00:00+07:00');
  const live = [liveEntry({ title: 'MLBB', nation: 'Myanmar', type: 'pick', hero: 'Ling', by: 'A' }, at), liveEntry({ title: 'MLBB', nation: 'Myanmar', type: 'pick', hero: 'Ling', by: 'A' }, at),
    liveEntry({ title: 'MLBB', nation: 'Malaysia', type: 'tendency', text: 'early lord', by: 'A' }, at)];
  const day = daySummaryRecord({ title: 'MLBB', nation: 'Myanmar', date: '2026-12-16', lines: ['Ling first pick twice', ''], by: 'Coach Indra' });
  assert.equal(day.kind, 'scout_day'); assert.deepEqual(day.lines, ['Ling first pick twice']);
  assert.throws(() => daySummaryRecord({ title: 'MLBB', nation: 'Myanmar', date: '2026-12-16', lines: [''], by: 'A' }), /Nothing to approve/);
  const B = opponentBrief({ title: 'MLBB', nation: 'Myanmar', card: { gaps: ['No reviewed VOD.'] }, live: live.slice(0, 2), days: [day] });
  assert.ok(B.known.some((k) => /2026-12-16: Ling first pick twice/.test(k.text) && /approved by Coach Indra/.test(k.src)));
  const M = prematchMaterial({ brief: B, live: live.slice(0, 2), standIn: { n: 2, won: 1, lowSample: true }, book: null });
  const ids = materialIds(M);
  assert.ok(ids.has('K1') && ids.has('T1') && ids.has('CP1') && ids.has('STANDIN') && ids.has(live[0].id));
  assert.equal(M.COUNTS.find((c) => c.id === 'CP1').small, true, 'two sightings = small');
  const D = scoutDayMaterial(live, 'MLBB', '2026-12-16'); assert.deepEqual(Object.keys(D.LIVE).sort(), ['Malaysia', 'Myanmar']);
});

test('brainstorm: plan material with ids; replies checked (sources, unverified numbers, suggestions); session text', () => {
  const r = scrimReport({ title: 'MLBB', date: '2026-11-20', by: 'Indra', partner: 'Team X', focus: 'f', progress: 3, failed: 'no vision at lord', adjust: 'ward early', won: 1, lost: 2, fixCheck: 'No change', prevAdjust: 'ward early' });
  const wt = [1, 2, 3].map((i) => ({ title: 'MLBB', reportId: `R${i}`, date: `2026-11-1${7 + i}`, tags: ['vision'] }));
  const M = planBrainMaterial('MLBB', { reports: [r], wtags: wt, asOf: '2026-11-21' });
  const ids = materialIds(M); assert.ok(ids.has(r.id) && ids.has('WK-vision') && ids.has('TREND'));
  const c = checkReply({ reply: 'Vision came back 3 times; aim for 7 wards.', sources: ['WK-vision', 'nope'], follow_ups: ['Which drill?'],
    suggestions: [{ kind: 'proposal', title: 'Vision before lord', detail: 'ward drill', sources: ['WK-vision'] }, { kind: 'session', title: 'x', detail: '99 wards', sources: ['WK-vision'] }, { kind: 'note', title: 'y', detail: 'z', sources: ['nope'] }] }, M, [{ text: 'we have 2 hours' }]);
  assert.deepEqual(c.sources, ['WK-vision']); assert.deepEqual(c.unverified, ['7']); assert.equal(c.suggestions.length, 1); assert.equal(c.droppedSuggestions, 2);
  assert.match(sessionText('MLBB', [{ role: 'staff', by: 'Indra', text: 'Q' }, { role: 'ai', text: 'A' }]), /Indra: Q\n\nAI: A/);
  assert.equal(BRAIN_MAX, 30);
});

test('scrim-ai: prematch / scout_day / brainstorm routed; brainstorm keeps the material in the cached system prompt', async () => {
  const calls = []; const inserts = [];
  const deps = { env: { ANTHROPIC_API_KEY: 'k' }, uuid: () => 'u', now: () => new Date('2026-12-16T05:00:00Z'), heroes: HEROES, sleep: async () => {},
    fetch: async (url, init) => { calls.push(JSON.parse(init.body)); return { ok: true, status: 200, headers: { get: () => null }, json: async () => ({ content: [{ type: 'text', text: '{}' }], stop_reason: 'end_turn', usage: {} }) }; },
    clientFor: () => ({ auth: { getUser: async () => ({ data: { user: { id: 'x' } }, error: null }) }, rpc: async (fn) => ({ data: fn === 'can_write_title' ? true : 0, error: null }), from: () => ({ insert: async (row) => { inserts.push(row); return { error: null }; } }) }) };
  const call = (body) => handle({ method: 'POST', headers: { authorization: 'Bearer t' }, json: async () => body }, deps);
  assert.equal((await call({ action: 'prematch', title: 'MLBB', material: {} })).status, 400);
  assert.equal((await call({ action: 'prematch', title: 'MLBB', material: { BRIEF: { known: [{ id: 'K1', text: 'x' }] } } })).status, 200);
  assert.ok(calls.at(-1).output_config.format.schema.properties.key_points); assert.equal(inserts.at(-1).action, 'prematch');
  assert.equal((await call({ action: 'scout_day', title: 'MLBB', material: { LIVE: { Myanmar: [{ id: 'LV-1' }] } } })).status, 200);
  assert.equal((await call({ action: 'brainstorm', title: 'MLBB', question: '' })).status, 400);
  assert.equal((await call({ action: 'brainstorm', title: 'MLBB', question: 'x'.repeat(1501) })).status, 413);
  const history = Array.from({ length: 12 }, (_, i) => ({ role: i % 2 ? 'ai' : 'staff', text: `m${i}` }));
  assert.equal((await call({ action: 'brainstorm', title: 'MLBB', purpose: 'plan', question: 'What next?', history, material: { WEAKNESSES: [{ id: 'WK-vision' }] }, prefs: ['short drills'] })).status, 200);
  const req = calls.at(-1);
  assert.match(req.system[0].text, /MATERIAL:\n\{"WEAKNESSES"/); assert.ok(req.system[0].cache_control);
  const user = JSON.parse(req.messages[0].content[0].text); assert.equal(user.HISTORY.length, 8); assert.deepEqual(user.PREFS, ['short drills']);
});
