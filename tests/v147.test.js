// V1.47 one workspace per category: opponent list per category, Ask AI (context, opponent from the question,
// starters, screenshots as material), MLBB official meta snapshot and ideas to test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fieldEdit, fieldOf, nationIn, starters, workspaceContext, shotMaterial, gameKey, WORKSPACE_TITLES } from '../src/core/workspace.js';
import { MLBB_RANK, mlbbIdeas, HIGH_BAN } from '../src/core/meta_live.js';
import { FIELDS } from '../src/core/competitors.js';

test('opponent list: starts from the published field of that category only; hide, add and show again, newest wins', () => {
  assert.deepEqual(fieldOf('MLBB Women').list, ['Egypt', 'Argentina', 'Türkiye'], 'MLBB Women sees its own 3 rivals, not the men\'s');
  assert.ok(!fieldOf('MLBB Women').list.includes('Malaysia'));
  const at = (r, t) => ({ ...r, at: t });
  const recs = [at(fieldEdit({ title: 'MLBB', nation: 'Nepal', action: 'hide', by: 'Coach' }), '1'), at(fieldEdit({ title: 'MLBB', nation: 'RRQ Hoshi', action: 'add', by: 'Coach' }), '2'),
    at(fieldEdit({ title: 'MLBB Women', nation: 'Egypt', action: 'hide', by: 'Coach W' }), '3')];
  const f = fieldOf('MLBB', recs);
  assert.ok(!f.list.includes('Nepal')); assert.deepEqual(f.hidden, ['Nepal']); assert.equal(f.list.at(-1), 'RRQ Hoshi'); assert.deepEqual(f.added, ['RRQ Hoshi']);
  assert.ok(fieldOf('MLBB', recs).list.includes('Egypt'), 'a change in MLBB Women does not touch MLBB Men');
  assert.ok(fieldOf('MLBB', [...recs, at(fieldEdit({ title: 'MLBB', nation: 'Nepal', action: 'show', by: 'Coach' }), '4')]).list.includes('Nepal'));
  assert.ok(!fieldOf('MLBB', [...recs, at(fieldEdit({ title: 'MLBB', nation: 'RRQ Hoshi', action: 'hide', by: 'Coach' }), '5')]).list.includes('RRQ Hoshi'), 'an added team can be removed');
  assert.throws(() => fieldEdit({ title: 'MLBB', nation: '', action: 'add', by: 'C' }), /Write the opponent name/);
  assert.throws(() => fieldEdit({ title: 'Chess', nation: 'X', action: 'add', by: 'C' }), /Pick a title/);
  assert.deepEqual(WORKSPACE_TITLES, ['MLBB'], 'template first; the others switch on one by one');
});

test('Ask AI: the opponent comes from the question, in any spelling; starters name a real opponent and fit the game', () => {
  const list = FIELDS.MLBB;
  assert.equal(nationIn('Apa yang sebaiknya kita ban lawan Malaysia?', list), 'Malaysia');
  assert.equal(nationIn('how do we beat turkey', list), 'Türkiye'); assert.equal(nationIn('Turki main apa?', list), 'Türkiye');
  assert.equal(nationIn('dominican republic draft', list), 'Dominican Republic');
  assert.equal(nationIn('Plan three scrims for this week', list), ''); assert.equal(nationIn('Malaysian heroes', list), '', 'whole words only');
  const mlbb = starters('MLBB', list, 'en');
  assert.equal(mlbb[0], 'What should we ban against Malaysia?'); assert.ok(mlbb.every((q) => !/map|veto|rotate/i.test(q)));
  assert.match(starters('CS2', FIELDS.CS2, 'en').join(' '), /veto be against Romania/); assert.doesNotMatch(starters('CS2', FIELDS.CS2, 'en').join(' '), /hero|ban/i);
  assert.match(starters('MLBB', [], 'id').join(' '), /Hero kita/); assert.ok(starters('MLBB', [], 'id').every((q) => !q.includes('{opp}')), 'no opponent: those starters are left out');
  assert.deepEqual(['MLBB Women', 'CS2 Women', 'Dota 2', 'PUBG Mobile', 'eFootball'].map(gameKey), ['mlbb', 'cs2', 'dota', 'pubgm', 'efootball']);
});

test('Ask AI context: category, squad, opponents, event and matches, each with an id the answer can cite', () => {
  const ctx = workspaceContext({ title: 'MLBB', squad: ['Aran', 'Kevin'], coaches: ['Indra'], opponents: ['Malaysia', 'Cambodia'], event: { start: '2026-12-15', end: '2026-12-20', venue: 'ICE BSD City' },
    matches: [{ date: '2026-12-15', opponent: 'Malaysia', stage: 'Group A' }], asOf: '2026-11-23' });
  assert.deepEqual(ctx.map((c) => c.id), ['W1', 'W2', 'W3', 'W4']);
  assert.match(ctx[0].text, /Category: MLBB\. Our squad: Aran, Kevin; coach Indra/); assert.match(ctx[1].text, /Opponents in this category \(2\): Malaysia, Cambodia/);
  assert.match(ctx[3].text, /2026-12-15 vs Malaysia \(Group A\)/);
  const s = shotMaterial(1, 'draft screen', { bans: ['x'.repeat(5000)] }); assert.equal(s.id, 'S1'); assert.ok(s.text.length <= 4001);
});

test('MLBB meta: the official snapshot is dated and labelled; ideas are strong heroes we have not played', () => {
  assert.equal(MLBB_RANK.rows.length, 20); assert.equal(MLBB_RANK.read, '2026-11-23'); assert.match(MLBB_RANK.scope, /Ranked play/);
  assert.ok(MLBB_RANK.rows.every((r, i, a) => i === 0 || a[i - 1].win >= r.win), 'sorted by win rate, as read');
  const ideas = mlbbIdeas(new Map([['Masha', 3], ['Sun', 1]]));
  assert.ok(!ideas.some((r) => ['Masha', 'Sun'].includes(r.hero))); assert.equal(ideas.length, 8);
  assert.ok(ideas.find((r) => r.hero === 'Marcel').contested, `Marcel is banned over ${HIGH_BAN}%`); assert.ok(!ideas.find((r) => r.hero === 'Argus').contested);
});
