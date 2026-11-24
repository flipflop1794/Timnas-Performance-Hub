// V1.52 AI inside what coaches already do (no new screen):
//  1. recap: the WhatsApp recap a coach sends to the group, read into the whole scrim report. Every number the AI
//     returns must be written in the recap, or the row is left out and the coach is told.
//  2. after-save note: three short lines on a saved report (what repeated, one focus, one question), kept with the
//     report's weakness labels. The coach taps Use or Ignore; nothing is used without that.
//  3. "Before today's session": a few lines from records already in the hub. No AI call.
import { checkDebriefSplit } from './debrief.js';
import { rowKind, snapMap, cleanRows, MOBA_SIDES } from './comp_rows.js';
import { MAPS as PUBGM_MAPS } from '../pubgm/screenshot.js';
import { numbersIn, allowedNumbers, checkLine } from './ai_check.js';
import { resultText } from './reports.js';
import { cleanTags, weaknessCounts, FLAG_AT } from './weakness.js';
import { shiftDay } from './dates.js';

const isDay = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '') && !Number.isNaN(Date.parse(s));
const lower = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
const known = (v) => Number.isInteger(v) && v >= 0;

// ---------------------------------------------------------------- 1. recap → report form
// Returns { fields, rows, flags, notPlaced }: fields and rows as the form holds them (strings).
export function checkRecap(title, source, raw, { roster = [], today } = {}) {
  const { fields, flags, notPlaced } = checkDebriefSplit(source, raw, roster);
  const src = lower(source); const nums = new Set(numbersIn(source).map((n) => String(Number(n))));
  const said = (n) => nums.has(String(n));
  const partner = String(raw?.partner || '').trim().slice(0, 80);
  if (partner) { if (src.includes(lower(partner))) fields.partner = partner; else flags.push({ field: 'partner', text: `Sparring partner "${partner}" is not written in your recap: type it yourself.` }); }
  if (isDay(raw?.date) && (!today || raw.date <= today)) fields.date = raw.date;
  const kind = rowKind(title); const rows = []; let dropped = 0;
  for (const x of (Array.isArray(raw?.rows) ? raw.rows : []).slice(0, 12)) {
    let row = null;
    if (kind === 'cs') {
      if (known(x.us) && known(x.them) && said(x.us) && said(x.them) && snapMap(x.map)) row = { map: snapMap(x.map), us: String(x.us), them: String(x.them), ct: known(x.ct) && said(x.ct) && x.ct <= x.us ? String(x.ct) : '' };
    } else if (kind === 'br') {
      if (known(x.place) && x.place >= 1 && known(x.kills) && said(x.place) && said(x.kills)) row = { map: PUBGM_MAPS.includes(x.map) ? x.map : '', place: String(x.place), kills: String(x.kills) };
    } else if (kind === 'foot') {
      if (known(x.us) && known(x.them) && said(x.us) && said(x.them)) {
        const pk = x.extra === 'pk' && known(x.pen_us) && known(x.pen_them) && said(x.pen_us) && said(x.pen_them);
        row = { us: String(x.us), them: String(x.them), extra: pk ? 'pk' : x.extra === 'et' ? 'et' : '', penUs: pk ? String(x.pen_us) : '', penThem: pk ? String(x.pen_them) : '' };
      }
    } else if (kind === 'moba') {
      if (['win', 'loss'].includes(x.res)) row = { side: MOBA_SIDES[title]?.includes(x.side) ? x.side : '', res: x.res };
    }
    if (!row) { dropped++; continue; }
    try { if (cleanRows(title, [row]).length) rows.push(row); else dropped++; } catch { dropped++; }
  }
  if (dropped) flags.push({ field: 'rows', text: `${dropped} result line(s) left out: a score or placement was not written in your recap. Add them by hand.` });
  return { fields, rows, flags, notPlaced };
}

// ---------------------------------------------------------------- 2. the note after a saved report
const slim = (r) => ({ id: r.id, date: r.date, partner: r.partner, result: resultText(r.result), focus: r.focus || '', worked: r.worked || '', failed: r.failed || '', adjust: r.adjust || '', prevAdjust: r.prevAdjust || '', fixCheck: r.fixCheck || '' });
export const AFTER_EARLIER = 5;
// What the AI is given: this report, the title's reports before it (newest first), the label counts.
export function afterMaterial(report, reports, tagRows, asOf) {
  const earlier = reports.filter((r) => r.title === report.title && r.id !== report.id && (r.date < report.date || (r.date === report.date && String(r.createdAt) < String(report.createdAt))))
    .sort((a, b) => b.date.localeCompare(a.date) || String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, AFTER_EARLIER);
  return { report: slim(report), earlier: earlier.map(slim), weaknesses: weaknessCounts(tagRows, report.title, asOf, 14).filter((w) => w.n).slice(0, 6).map((w) => ({ tag: w.tag, n: w.n })) };
}
export const canAfter = (report) => !!(String(report?.failed || '').trim() || String(report?.adjust || '').trim());
// The AI's answer, checked: labels from the title's list; a line with a number that is not in the material is
// dropped; "repeats" needs an earlier report to rest on. No focus left = no note.
export function afterFromAi(raw, material, title, { model = '', at = new Date().toISOString() } = {}) {
  const ok = allowedNumbers(material); const ids = new Set([material.report.id, ...material.earlier.map((r) => r.id)]);
  const line = (v) => { const c = checkLine(String(v || '').slice(0, 300), ok); return c.ok ? c.text : ''; };
  const basedOn = [...new Set((Array.isArray(raw?.based_on) ? raw.based_on : []).filter((x) => ids.has(x)))];
  const focus = line(raw?.focus);
  const repeats = material.earlier.length && basedOn.some((x) => x !== material.report.id) ? line(raw?.repeats) : '';
  return { tags: cleanTags(title, raw?.tags), note: focus ? { repeats, focus, question: line(raw?.question), basedOn, status: 'new', model, at } : null };
}
export const NOTE_STATUS = ['new', 'used', 'ignored'];
export function decideNote(tagRow, status, by, at = new Date().toISOString()) {
  if (!tagRow?.after || !['used', 'ignored'].includes(status)) throw new Error('This note is no longer there.');
  return { ...tagRow, after: { ...tagRow.after, status, decidedBy: by, decidedAt: at } };
}
// The newest note a coach chose to use for a title (the focus the next session starts from).
export function usedFocus(tagRows, title) {
  return tagRows.filter((t) => t.title === title && t.after?.status === 'used').sort((a, b) => b.date.localeCompare(a.date) || String(b.after.decidedAt).localeCompare(String(a.after.decidedAt)))[0] || null;
}

// ---------------------------------------------------------------- 3. before today's session (no AI)
// Lines from what is already recorded: today's planned session, the change agreed last time, the focus the coach
// chose, the weakness that keeps coming back. null when the title has no report yet.
export function sessionBrief(title, { reports = [], tagRows = [], scrims = [] }, asOf) {
  const mine = reports.filter((r) => r.title === title && r.date <= asOf).sort((a, b) => b.date.localeCompare(a.date) || String(b.createdAt).localeCompare(String(a.createdAt)));
  const last = mine[0]; if (!last) return null;
  const planned = scrims.filter((s) => s.title === title && s.status === 'planned' && s.date === asOf).sort((a, b) => String(a.time).localeCompare(String(b.time)))[0] || null;
  const used = usedFocus(tagRows, title);
  const fresh = used && used.date >= shiftDay(asOf, -6) ? used : null;      // a focus chosen more than a week ago is stale
  const top = weaknessCounts(tagRows, title, asOf, 14).find((w) => w.n >= FLAG_AT) || null;
  return {
    title, asOf,
    session: planned ? { time: planned.time || '', partner: planned.partner || '', kind: planned.kind || 'scrim' } : null,
    change: { text: last.adjust, date: last.date, partner: last.partner },
    focus: fresh ? { text: fresh.after.focus, date: fresh.date } : null,
    question: fresh?.after.question || '',
    repeats: top ? { tag: top.tag, n: top.n } : null,
    daysSince: Math.round((Date.parse(asOf) - Date.parse(last.date)) / 86400000),
  };
}
export function briefText(b, lang = 'id') {
  const id = lang === 'id';
  return [
    `*${b.title} — ${id ? 'sebelum sesi hari ini' : "before today's session"}* (${b.asOf})`,
    b.session ? `${id ? 'Sesi' : 'Session'}: ${[b.session.time, b.session.partner ? `vs ${b.session.partner}` : b.session.kind].filter(Boolean).join(' ')}` : null,
    `${id ? 'Perubahan dari sesi terakhir' : 'Change from the last session'} (${b.change.date}, vs ${b.change.partner}): ${b.change.text}`,
    b.focus ? `${id ? 'Fokus' : 'Focus'}: ${b.focus.text}` : null,
    b.repeats ? `${id ? 'Masih berulang' : 'Keeps coming back'}: ${b.repeats.tag} (${b.repeats.n} ${id ? 'laporan dalam 14 hari' : 'reports in 14 days'})` : null,
    b.question ? `${id ? 'Pertanyaan untuk pemain' : 'Question for the players'}: ${b.question}` : null,
  ].filter(Boolean).join('\n');
}
