// V1.45: scrim reports as a tidy Excel workbook, the Main dashboard as CSV, the support staff weekly dashboard.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { makeXlsx, crc32, sheetName, colName } from '../src/core/xlsx.js';
import { scrimReport, reportsSheets, tableCsv, CSV_BOM } from '../src/core/reports.js';
import { supportReport, calWeek, weekGrid, weekText, summarize, anonymise } from '../src/core/support.js';
import { localDay, shiftDay } from '../src/core/dates.js';

// Read a stored (uncompressed) zip: name → text, checking each entry's CRC.
function unzip(bytes) {
  const out = {}; const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength); let p = 0;
  while (dv.getUint32(p, true) === 0x04034b50) {
    const method = dv.getUint16(p + 8, true); const crc = dv.getUint32(p + 14, true); const size = dv.getUint32(p + 18, true);
    const nlen = dv.getUint16(p + 26, true); const xlen = dv.getUint16(p + 28, true);
    const name = new TextDecoder().decode(bytes.slice(p + 30, p + 30 + nlen)); const data = bytes.slice(p + 30 + nlen + xlen, p + 30 + nlen + xlen + size);
    assert.equal(method, 0, 'stored'); assert.equal(crc32(data), crc, `${name}: CRC`);
    out[name] = new TextDecoder().decode(data); p += 30 + nlen + xlen + size;
  }
  assert.equal(dv.getUint32(bytes.length - 22, true), 0x06054b50, 'end of central directory');
  return out;
}

const day = '2026-11-20';
const R = [
  scrimReport({ title: 'Dota 2', date: '2026-11-19', by: 'Coach Rama', partner: 'Team <A> & "B"', won: '1', lost: '2', focus: '=HYPERLINK("x")', worked: 'Lanes\u0007', adjust: 'Ward the triangle', progress: '3' }),
  scrimReport({ title: 'Dota 2', date: day, by: 'Coach Rama', partner: 'Team C', won: '2', lost: '0', adjust: 'Smoke at 10:00' }),
  scrimReport({ title: 'PUBG Mobile', date: day, by: 'Coach C', partner: 'Lobby X', played: '6', points: '71', avgPlacement: '5.5', adjust: 'Rotate earlier' }),
];

test('Excel file: a valid workbook, bold frozen header with filters, text never a formula, odd characters safe', () => {
  const files = unzip(makeXlsx(reportsSheets(R, { asOf: day })));
  for (const f of ['[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml', 'xl/_rels/workbook.xml.rels', 'xl/styles.xml', 'xl/worksheets/sheet1.xml', 'xl/worksheets/sheet2.xml', 'xl/worksheets/sheet3.xml']) assert.ok(files[f], f);
  assert.match(files['xl/workbook.xml'], /<sheet name="Summary" sheetId="1"/); assert.match(files['xl/workbook.xml'], /<sheet name="Dota 2"/); assert.match(files['xl/workbook.xml'], /<sheet name="PUBG Mobile"/);
  const dota = files['xl/worksheets/sheet2.xml'];
  assert.match(dota, /state="frozen"/); assert.match(dota, /<autoFilter ref="A1:[A-Z]+3"\/>/);
  assert.match(dota, /<c r="A1" s="1" t="inlineStr">/, 'header row styled');
  assert.match(dota, /Team &lt;A&gt; &amp; &quot;B&quot;/); assert.doesNotMatch(dota, /\u0007/, 'control characters dropped');
  assert.match(dota, /t="inlineStr"><is><t xml:space="preserve">=HYPERLINK/, 'a cell starting with = stays text'); assert.doesNotMatch(dota, /<f>/);
  assert.equal(sheetName('A/B:C*D?[E]', new Set()), 'A B C D  E', 'forbidden characters'); const used = new Set(['summary']); assert.equal(sheetName('Summary', used), 'Summary (2)');
  assert.equal(sheetName('x'.repeat(40), new Set()).length, 31); assert.deepEqual([0, 25, 26, 27, 701].map(colName), ['A', 'Z', 'AA', 'AB', 'ZZ']);
});

test('report sheets: summary first, one sheet per title, newest first, one kind of result per sheet, optional fields blank', () => {
  const sh = reportsSheets(R, { asOf: day });
  assert.deepEqual(sh.map((s) => s.name), ['Summary', 'Dota 2', 'PUBG Mobile']);
  assert.deepEqual(sh[0].rows.map((r) => r[0]), ['Dota 2', 'PUBG Mobile']); assert.equal(sh[0].rows[0][1], 2);
  const d = sh[1]; const col = (h) => d.columns.findIndex((c) => c.header === h);
  assert.ok(d.rows.every((r) => r.length === d.columns.length));
  assert.deepEqual(d.rows.map((r) => r[0]), [day, '2026-11-19'], 'newest first');
  assert.equal(d.rows[0][col('Games won')], 2); assert.equal(col('Points'), -1, 'no points columns on a win-loss sheet');
  assert.equal(d.rows[0][col('Plan followed (1–5)')], '', 'not rated: blank, not 0'); assert.equal(d.rows[1][col('Plan followed (1–5)')], 3);
  assert.equal(d.rows[0][col('Practised (focus)')], ''); assert.equal(d.rows[0][col('Next session: the one change')], 'Smoke at 10:00');
  const p = sh[2]; assert.equal(p.rows[0][p.columns.findIndex((c) => c.header === 'Points')], 71); assert.equal(p.columns.findIndex((c) => c.header === 'Games won'), -1);
});

test('dashboard CSV: Excel-safe cells and a byte-order mark', () => {
  const csv = tableCsv(['Title', 'Note'], [['Dota 2', '=cmd'], ['CS2', 'a, "b"']]);
  assert.ok(csv.startsWith(CSV_BOM)); assert.match(csv, /'=cmd/); assert.match(csv, /"a, ""b"""/);
});

test('support week: Monday to Sunday, athletes per day per person, WhatsApp copy holds counts only', () => {
  const w = calWeek('2026-11-23'); assert.equal(w.from, '2026-11-23'); assert.equal(w.to, '2026-11-29');
  assert.equal(calWeek('2026-11-29').from, '2026-11-23', 'Sunday belongs to the week that started on Monday');
  assert.equal(calWeek('2026-11-25', -1).from, '2026-11-16');
  const a = supportReport({ date: '2026-11-24', discipline: 'physio', by: 'Dewi', job: 'physio_women', rows: [{ athlete: 'Vivian Secret', title: 'MLBB Women', did: 'Massage', found: 'Tight calf', vasBefore: 5, vasAfter: 2, response: 'better' }, { athlete: 'Chel', title: 'MLBB Women', did: 'Stretching' }] });
  const b = supportReport({ date: '2026-11-25', discipline: 'psych', by: 'Raka', job: 'psych_men', rows: [{ athlete: 'Jhocam', title: 'Dota 2', did: 'Talk', session: 'formal' }] });
  const g = weekGrid([a, b], w);
  assert.deepEqual(g.map((x) => [x.by, x.days]), [['Dewi', [null, 2, null, null, null, null, null]], ['Raka', [null, null, 1, null, null, null, null]]]);
  const text = weekText(summarize(anonymise([a, b], w.from, w.to)), summarize(anonymise([a, b], w.prevFrom, w.prevTo)), w, 'id');
  assert.match(text, /Rekap mingguan tim support/); assert.match(text, /Laporan: 2/); assert.match(text, /Kunjungan atlet: 3/); assert.match(text, /Fisio \/ massage: 1 laporan, 2 atlet/);
  for (const secret of ['Vivian', 'Chel', 'Jhocam', 'Tight calf', 'Massage', 'Dewi', 'Raka']) assert.doesNotMatch(text, new RegExp(secret), `no ${secret} in the copy`);
});

// ---- pages (the offline hub file) ----
const html = readFileSync(new URL('../dist/hub.html', import.meta.url), 'utf8');
function mock() {
  const store = new Map(); const subs = []; const notify = () => subs.forEach((s) => s());
  const ref = (path) => ({ set: async (d) => { store.set(path, structuredClone(d)); notify(); }, onSnapshot: (next) => { const f = () => next({ exists: store.has(path), data: () => store.get(path) }); subs.push(f); f(); return () => {}; } });
  return { store, doc: ref, collection: (col) => ({ doc: (id) => ref(`${col}/${id}`), add: async () => {},
    onSnapshot: (next) => { const f = () => next({ docs: [...store.entries()].filter(([k]) => k.startsWith(`${col}/`)).map(([k, v]) => ({ id: k.split('/')[1], data: () => v })) }); subs.push(f); f(); return () => {}; } }) };
}
async function page(hash, db) {
  const saved = []; let copied = '';
  const dom = new JSDOM(`<!doctype html><html><body>${html}</body></html>`, { runScripts: 'dangerously', url: `https://example.test/#${hash}`, beforeParse(w) {
    w.localStorage.setItem('hub-lang', 'en');
    w.claude = { use: async (nm) => (nm === 'db' ? db : nm === 'downloads' ? { save: async (f) => { saved.push(f); return { status: 'saved' }; } } : null) };
    Object.defineProperty(w.navigator, 'clipboard', { value: { writeText: async (t) => { copied = t; } } });
  } });
  const wait = () => new Promise((r) => setTimeout(r, 30)); await wait();
  const d = dom.window.document;
  return { d, saved, copied: () => copied, wait, text: () => d.getElementById('main').textContent,
    go: async (h) => { dom.window.location.hash = h; dom.window.dispatchEvent(new dom.window.HashChangeEvent('hashchange')); await wait(); } };
}

test('page: Download Excel on a title and on all titles; the Main dashboard downloads its table as CSV', async () => {
  const db = mock(); const t0 = localDay();
  const reps = [scrimReport({ title: 'Dota 2', date: t0, by: 'Coach Rama', partner: 'Team C', won: '2', lost: '1', adjust: 'Smoke at 10:00' }),
    scrimReport({ title: 'CS2', date: shiftDay(t0, -1), by: 'Coach B', partner: 'Team D', won: '1', lost: '0', adjust: 'Retake B faster', progress: '4' })];
  for (const r of reps) db.store.set(`scrim_reports/${r.id}`, { ...r, origin: 'operational' });
  const h = await page('dota-reports', db);
  assert.ok(h.d.querySelector('[data-report-xlsx="Dota 2"]'), 'Download Excel button');
  assert.doesNotMatch(h.text(), /plan null|Practised: ·/, 'no empty "plan" or "Practised" bits on an unrated report');
  h.d.querySelector('[data-report-xlsx="Dota 2"]').click(); await h.wait();
  assert.equal(h.saved.length, 1); assert.match(h.saved[0].filename, /^scrim-reports-dota_2-\d{4}-\d{2}-\d{2}\.xlsx$/);
  const one = unzip(h.saved[0].data); assert.match(one['xl/workbook.xml'], /name="Dota 2"/); assert.doesNotMatch(one['xl/workbook.xml'], /name="CS2"/);
  await h.go('reports-all'); h.d.querySelector('[data-report-xlsx="*"]').click(); await h.wait();
  const all = unzip(h.saved[1].data); assert.match(all['xl/workbook.xml'], /name="Summary".*name="Dota 2".*name="CS2"/s);
  await h.go('overview'); h.d.getElementById('ovCsv').click(); await h.wait();
  const csv = h.saved[2]; assert.match(csv.filename, /^main-dashboard-\d{4}-\d{2}-\d{2}\.csv$/);
  const lines = csv.data.replace(CSV_BOM, '').split('\r\n'); assert.match(lines[0], /^Date \(WIB\),Title,Practice quality/);
  assert.equal(lines.length, 8, 'header + 7 titles'); assert.ok(lines.some((l) => /,Dota 2,/.test(l) && /2-1/.test(l) && /Smoke at 10:00/.test(l)));
});

test('page: support staff weekly dashboard — the week grid, week picker, counts-only WhatsApp copy', async () => {
  const db = mock(); const t0 = localDay(); const w = calWeek(t0);
  const r = supportReport({ date: w.from, discipline: 'physio', by: 'Dewi', job: 'physio_women', rows: [{ athlete: 'Vivian', title: 'MLBB Women', did: 'Massage', found: 'Tight calf' }] });
  db.store.set(`support_reports/${r.id}`, { ...r, origin: 'operational' });
  const h = await page('support', db);
  assert.match(h.text(), new RegExp(`Weekly dashboard — ${w.from} to ${w.to}`)); assert.match(h.text(), /Mon \d\d/);
  const row = [...h.d.querySelectorAll('#main table tbody tr')].find((tr) => /Dewi/.test(tr.textContent)); assert.ok(row); assert.match(row.textContent, /1\/7/);
  h.d.querySelector('[data-sup-wkwa]').click(); await h.wait();
  assert.match(h.copied(), /Laporan: 1|Reports: 1/); assert.doesNotMatch(h.copied(), /Vivian|Tight calf|Dewi/);
  h.d.querySelector('[data-sup-week="-1"]').click(); await h.wait();
  assert.match(h.text(), new RegExp(`Weekly dashboard — ${w.prevFrom} to ${w.prevTo}`)); assert.match(h.text(), /No report this week\./);
});

test('Bahasa: the weekly dashboard heading, day names, role lines and download buttons', async () => {
  const { tr } = await import('../src/hub/i18n.js');
  assert.equal(tr('Weekly dashboard — 2026-11-23 to 2026-11-29'), 'Dashboard mingguan — 2026-11-23 s/d 2026-11-29');
  assert.equal(tr('My week — 2026-11-23 to 2026-11-29'), 'Minggu saya — 2026-11-23 s/d 2026-11-29');
  assert.equal(tr('Mon 23'), 'Sen 23'); assert.equal(tr('Sun 29'), 'Min 29');
  assert.equal(tr('3 report(s), 7 athlete visit(s)'), '3 laporan, 7 kunjungan atlet');
  assert.equal(tr('Download Excel'), 'Unduh Excel'); assert.equal(tr('Download all (Excel)'), 'Unduh semua (Excel)');
});
