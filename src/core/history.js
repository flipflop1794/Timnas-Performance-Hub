// V1.36 edit history: the database keeps every version of a support report or a scrim report (record_history);
// this turns two versions into the lines people read: "Follow-up: before → after".
import { resultText } from './reports.js';
import { rowsText } from './comp_rows.js';

const s = (v) => (v == null ? '' : typeof v === 'boolean' ? (v ? 'Yes' : '') : String(v).trim());
const push = (out, field, a, b) => { const x = s(a); const y = s(b); if (x !== y) out.push({ field, before: x, after: y }); };

const SUPPORT_ROW = [['athlete', 'Athlete'], ['did', 'What was done'], ['found', 'Findings'], ['followUp', 'Follow-up'], ['session', 'Session'], ['prognosis', 'Prognosis'],
  ['region', 'Body region'], ['vasBefore', 'VAS before'], ['vasAfter', 'VAS after'], ['response', 'Response'], ['notifyText', 'Line for the coach']];
export function supportDiff(a = {}, b = {}) {
  const out = []; push(out, 'Date', a.date, b.date);
  const ra = a.rows || []; const rb = b.rows || [];
  for (let i = 0; i < Math.max(ra.length, rb.length); i++) {
    const x = ra[i]; const y = rb[i]; const who = (y || x)?.athlete || `#${i + 1}`;
    if (!x) { out.push({ field: `Athlete added: ${who}`, before: '', after: [y.did, y.found].filter(Boolean).join(' — ') }); continue; }
    if (!y) { out.push({ field: `Athlete removed: ${who}`, before: [x.did, x.found].filter(Boolean).join(' — '), after: '' }); continue; }
    for (const [k, l] of SUPPORT_ROW) push(out, `${who} · ${l}`, x[k], y[k]);
  }
  push(out, 'Team: what was done', a.general?.did, b.general?.did); push(out, 'Team: findings', a.general?.found, b.general?.found);
  push(out, 'Teams', (a.general?.teams || []).join(', '), (b.general?.teams || []).join(', '));
  return out;
}

const SCRIM = [['date', 'Date'], ['partner', 'Sparring partner'], ['focus', 'Focus'], ['progress', 'Plan followed'], ['worked', 'What worked'], ['failed', 'What failed'],
  ['adjust', 'Adjustment for the next session'], ['detail', 'Detail'], ['playerNotes', 'Player notes'], ['fixCheck', 'Did we fix it?'], ['vod', 'VOD'], ['format', 'Format'], ['partnerLevel', 'Partner level']];
export function scrimDiff(a = {}, b = {}) {
  const out = [];
  for (const [k, l] of SCRIM) push(out, l, a[k], b[k]);
  push(out, 'Result', a.result ? resultText(a.result) : '', b.result ? resultText(b.result) : '');
  push(out, 'Per map / match / game', rowsText(a.title, a.rows), rowsText(b.title, b.rows));
  return out;
}
// History rows for one record, oldest first, each with its changed fields.
export function historyOf(rows, recordId, kind) {
  const diff = kind === 'scrim' ? scrimDiff : supportDiff;
  return (rows || []).filter((h) => h.record_id === recordId).sort((x, y) => String(x.at).localeCompare(String(y.at)))
    .map((h) => ({ at: h.at, by: h.editor_name || '', changes: diff(h.before, h.after) })).filter((h) => h.changes.length);
}
