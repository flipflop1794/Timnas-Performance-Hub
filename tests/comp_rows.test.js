import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CS2_MAPS, snapMap, cleanRows, rowsFields, rowsText, placementPoints, mapPool, tiesOf, tiesText } from '../src/core/comp_rows.js';
import { scrimReport, reportsCsv } from '../src/core/reports.js';
import { teamTrends, period } from '../src/core/trends.js';
import { tr } from '../src/hub/i18n.js';

const base = { date: '2026-11-18', by: 'Coach', partner: 'Team X', focus: 'f', progress: 4, worked: 'w', adjust: 'a', asOf: '2026-11-18' };

test('CS2 Active Duty pool; map names snap to it', () => {
  assert.deepEqual(CS2_MAPS, ['Ancient', 'Anubis', 'Cache', 'Dust II', 'Inferno', 'Mirage', 'Nuke']);
  assert.equal(snapMap('de_dust2'), 'Dust II'); assert.equal(snapMap('Dust 2'), 'Dust II'); assert.equal(snapMap('inferno'), 'Inferno');
  assert.equal(snapMap('Overpass'), ''); assert.equal(snapMap('Train'), '');
});

test('CS2 rows: maps won and lost from rounds, overtime marked, bad rows named', () => {
  const rows = cleanRows('CS2', [{ map: 'Mirage', us: '13', them: '9', ct: '8' }, { map: 'Nuke', us: '14', them: '16' }, {}]);
  assert.equal(rows.length, 2); assert.equal(rows[1].ot, true);
  assert.deepEqual(rowsFields('CS2', rows), { won: '1', lost: '1', drawn: '' });
  assert.equal(rowsText('CS2', rows), 'Mirage 13-9 (CT 8); Nuke 14-16 OT');
  assert.throws(() => cleanRows('CS2', [{ map: 'Overpass', us: '13', them: '5' }]), /Map 1: pick a map from the Active Duty pool/);
  assert.throws(() => cleanRows('CS2', [{ map: 'Mirage', us: '13', them: '' }]), /Map 1: rounds lost must be a whole number/);
  assert.throws(() => cleanRows('CS2', [{ map: 'Mirage', us: '5', them: '13', ct: '9' }]), /CT rounds won must be a whole number from 0 to 5/);
});

test('PUBG Mobile rows: WEC placement points + 1 per elimination; the report totals come from the rows', () => {
  assert.deepEqual([1, 2, 3, 8, 9, 16].map(placementPoints), [10, 6, 5, 1, 0, 0]);
  const r = scrimReport({ ...base, title: 'PUBG Mobile', played: '99', points: '1', rows: [{ map: 'Erangel', place: '1', kills: '8' }, { place: '5', kills: '3' }, { place: '12', kills: '0' }] });
  assert.deepEqual(r.result, { mode: 'points', played: 3, points: 24, avgPlacement: 6, wins: 1 }, 'typed totals are replaced by the rows');
  assert.deepEqual(r.rows.map((x) => x.pts), [18, 6, 0]); assert.equal(r.rows[0].map, 'Erangel');
  assert.throws(() => cleanRows('PUBG Mobile', [{ place: '17', kills: '1' }]), /Match 1: placement must be a whole number from 1 to 16/);
  const W = period('2026-11-18', 1);
  const t = teamTrends('PUBG Mobile', { reports: [r] }, W);
  assert.deepEqual(t.filter((m) => m.key.startsWith('br')).map((m) => [m.key, m.values.at(-1)]), [['brpp', 13 / 3], ['brel', 11 / 3], ['brpl', 6]]);
});

test('eFootball rows: extra time and penalties; settings answer kept; CSV columns', () => {
  const r = scrimReport({ ...base, title: 'eFootball', comp: 'yes', rows: [{ us: '2', them: '1' }, { us: '1', them: '1', extra: 'pk', penUs: '3', penThem: '4' }, { us: '0', them: '0', extra: 'et' }] });
  assert.deepEqual(r.result, { mode: 'wl', won: 1, lost: 1, drawn: 1 }); assert.equal(r.comp, 'yes');
  assert.equal(rowsText('eFootball', r.rows), '2-1; 1-1 (pen 3-4); 0-0 (ET)');
  assert.throws(() => cleanRows('eFootball', [{ us: '2', them: '1', extra: 'pk', penUs: '4', penThem: '3' }]), /penalties only after a draw/);
  assert.throws(() => cleanRows('eFootball', [{ us: '1', them: '1', extra: 'pk', penUs: '4', penThem: '4' }]), /a shoot-out has a winner/);
  const csv = reportsCsv([r]); assert.match(csv.split('\r\n')[0], /per_map_or_match,competitive_settings$/); assert.ok(csv.endsWith('2-1; 1-1 (pen 3-4); 0-0 (ET),yes'), csv.slice(-60));
  const W = period('2026-11-18', 1); const t = teamTrends('eFootball', { reports: [r] }, W);
  assert.deepEqual(t.filter((m) => ['gf', 'ga'].includes(m.key)).map((m) => m.values.at(-1)), [1, 2 / 3]);
});

test('eFootball best-of-3 ties: won 2-0, lost 1-2, drawn after 3, an unfinished last tie is not counted', () => {
  const m = (us, them) => ({ us: String(us), them: String(them) });
  const rows = cleanRows('eFootball', [m(2, 0), m(1, 0), m(1, 0), m(0, 1), m(0, 2), m(1, 1), m(2, 0), m(0, 1)]);
  assert.deepEqual(tiesOf('eFootball', rows), { won: 1, lost: 1, drawn: 1, open: 0 });
  assert.deepEqual(tiesOf('eFootball', cleanRows('eFootball', [m(2, 0), m(1, 0), m(0, 1)])), { won: 1, lost: 0, drawn: 0, open: 1 });
  assert.equal(tiesOf('eFootball', cleanRows('eFootball', [m(2, 0)])), null); assert.equal(tiesOf('CS2', rows), null);
  const r = scrimReport({ ...base, title: 'eFootball', rows: [m(2, 0), m(1, 2), m(3, 1)] }); assert.deepEqual(r.ties, { won: 1, lost: 0, drawn: 0, open: 0 });
  assert.equal(tiesText(r.ties), 'Ties (best of 3): 1 won, 0 lost');
  assert.equal(tr('3 matches: 2 won, 1 lost · Ties (best of 3): 1 won, 0 lost'), '3 match: 2 menang, 1 kalah · Tie (best of 3): 1 menang, 0 kalah');
});

test('MLBB / Dota rows: optional side and result per game; tournament draft answer', () => {
  const r = scrimReport({ ...base, title: 'Dota 2', won: '0', lost: '0', comp: 'no', rows: [{ side: 'radiant', res: 'win' }, { side: 'dire', res: 'loss' }, { side: '', res: 'win' }] });
  assert.deepEqual([r.result.won, r.result.lost], [2, 1]); assert.equal(r.comp, 'no'); assert.equal(rowsText('Dota 2', r.rows), 'win (radiant); loss (dire); win');
  const plain = scrimReport({ ...base, title: 'MLBB', won: '2', lost: '0' }); assert.equal(plain.rows, undefined, 'no rows: the typed score stands');
  assert.throws(() => cleanRows('MLBB', [{ side: 'blue', res: '' }]), /Game 1: pick win or loss/);
});

test('CS2 map pool over a period; maps not practised for 14 days', () => {
  const rep = (date, rows) => ({ title: 'CS2', date, rows });
  const P = mapPool([rep('2026-11-17', [{ map: 'Mirage', us: 13, them: 9 }, { map: 'Inferno', us: 7, them: 13 }]), rep('2026-10-20', [{ map: 'Nuke', us: 13, them: 2 }])], 'CS2', { from: '2026-11-12', to: '2026-11-18', asOf: '2026-11-18' });
  const by = Object.fromEntries(P.map((m) => [m.map, m]));
  assert.deepEqual([by.Mirage.played, by.Mirage.won, by.Inferno.lost, by.Mirage.roundsFor], [1, 1, 1, 13]);
  assert.equal(by.Nuke.played, 0); assert.equal(by.Nuke.idle, true); assert.equal(by.Nuke.last, '2026-10-20'); assert.equal(by.Mirage.idle, false); assert.equal(by.Cache.last, null);
});

test('Bahasa Indonesia for the new lines', () => {
  assert.equal(tr('2 maps: 1 won, 1 lost'), '2 map: 1 menang, 1 kalah');
  assert.equal(tr('3 matches: 24 pts (placement 13 + eliminations 11) · average place 6 · 1 chicken dinner'), '3 match: 24 poin (peringkat 13 + eliminasi 11) · rata-rata peringkat 6 · 1 chicken dinner');
  assert.equal(tr('Map 1: pick a map from the Active Duty pool.'), 'Map 1: pilih map dari map pool Active Duty.');
  assert.equal(tr('Match 2: placement must be a whole number from 1 to 16.'), 'Match 2: peringkat harus bilangan bulat dari 1 sampai 16.');
  assert.equal(tr('+ Add map'), '+ Tambah map');
});
