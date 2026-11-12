import { hasContactNumber } from './pii.js';
import { localDay } from './dates.js';
// V1.16 Pelatnas board: the training camp's dates (as PB ESI decides them), each player's availability,
// the day's schedule (taken from the scrim & practice planner, so nothing is planned twice) and attendance.
// Rules: dates stay "TBD" until someone with the right role records them, and "proposed" until confirmed;
// availability notes carry the reason category only (no health, family or contact details); attendance is
// one record per planned session, editable by staff of that title.

export const AVAIL_STATUS = ['Not asked yet', 'Asked, waiting', 'Available for all of it', 'Available for part of it', 'Not available'];
export const AVAIL_OPEN = new Set(['Not asked yet', 'Asked, waiting']);
export const CONFLICT_REASONS = ['Club match or tournament', 'Club bootcamp', 'School or exam', 'Travel', 'Personal (no details)', 'Other'];
export const MARKS = ['present', 'late', 'absent', 'excused'];
export const MARK_LABEL = { present: 'Present', late: 'Late', absent: 'Absent', excused: 'Excused' };
export const DATE_STATUS = ['proposed', 'confirmed'];

const need = (c, m) => { if (!c) throw new Error(m); };
const isDay = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '');
const short = (s, n, label) => {
  const t = String(s || '').trim();
  need(t.length <= n, `${label}: keep it under ${n} characters.`);
  need(!hasContactNumber(t), `${label}: remove phone or ID numbers.`);
  return t;
};

// ---------------------------------------------------------------- camp dates
// { start, end, venue, status: proposed|confirmed, source, by, at } or null when nothing is recorded.
export function campDates(x) {
  need(isDay(x.start) && isDay(x.end), 'Start and end dates are required (YYYY-MM-DD).');
  need(x.start <= x.end, 'The end date is before the start date.');
  need(DATE_STATUS.includes(x.status), 'Say whether the dates are proposed or confirmed.');
  if (x.status === 'confirmed') need(String(x.source || '').trim(), 'Confirmed dates need a source (e.g. "PB ESI BOD letter, 20 Nov").');
  need(String(x.by || '').trim(), 'Who recorded the dates is required.');
  return { start: x.start, end: x.end, venue: short(x.venue, 120, 'Venue'), status: x.status, source: short(x.source, 160, 'Source'), by: x.by.trim(), at: new Date().toISOString() };
}
export function campLine(c, today = localDay()) {
  if (!c) return { text: 'Pelatnas dates: TBD — to be confirmed by PB ESI BOD.', state: 'tbd' };
  const when = `${c.start} to ${c.end}${c.venue ? `, ${c.venue}` : ''}`;
  const days = Math.round((Date.parse(c.start) - Date.parse(today)) / 864e5);
  const lead = days > 0 ? `starts in ${days} day${days === 1 ? '' : 's'}` : today <= c.end ? 'in progress' : 'finished';
  return { text: `Pelatnas ${c.status === 'confirmed' ? '' : '(proposed, not confirmed) '}${when} — ${lead}.`, state: c.status };
}

// ---------------------------------------------------------------- availability
export const availId = (title, player) => `AV-${title}-${player}`.replace(/[^A-Za-z0-9_\-.]/g, '_').slice(0, 190);
export function availability(prev, x) {
  need(x.title && x.player, 'Pick a player.');
  need(AVAIL_STATUS.includes(x.status), 'Pick an availability status.');
  need(String(x.by || '').trim(), 'Who recorded it is required.');
  const from = x.from || ''; const to = x.to || '';
  if (from || to) { need(isDay(from) && isDay(to), 'Available from and to must both be dates (YYYY-MM-DD), or both empty.'); need(from <= to, '"Available to" is before "Available from".'); }
  if (x.status === 'Available for part of it') need(from || (x.conflicts || []).length, 'For "part of it", give the available dates or at least one date that is not possible.');
  const conflicts = (x.conflicts || []).map((c) => {
    need(isDay(c.from) && isDay(c.to) && c.from <= c.to, 'Each date that is not possible needs a from and to date.');
    need(CONFLICT_REASONS.includes(c.reason), 'Pick a reason category for each date that is not possible.');
    return { from: c.from, to: c.to, reason: c.reason };
  });
  return {
    id: availId(x.title, x.player), title: x.title, player: x.player, status: x.status, from, to, conflicts,
    note: short(x.note, 200, 'Note'), by: x.by.trim(), at: new Date().toISOString(),
    history: [...(prev?.history || []), ...(prev ? [{ status: prev.status, from: prev.from, to: prev.to, by: prev.by, at: prev.at }] : [])].slice(-10),
    origin: 'operational',
  };
}
// Is the player available on a day? true / false / null (not known yet).
export function availableOn(a, day) {
  if (!a || AVAIL_OPEN.has(a.status)) return null;
  if (a.status === 'Not available') return false;
  if (a.from && (day < a.from || day > a.to)) return false;
  if ((a.conflicts || []).some((c) => day >= c.from && day <= c.to)) return false;
  return true;
}
// Per title: how many players answered, and who is still open.
export function availabilitySummary(roster, records) {
  const by = new Map(records.map((r) => [`${r.title}|${r.player}`, r]));
  return Object.entries(roster).map(([title, players]) => {
    const rows = (players || []).filter(Boolean).map((p) => ({ player: p, rec: by.get(`${title}|${p}`) || null }));
    const status = (r) => r.rec?.status || 'Not asked yet';
    return {
      title, players: rows.length,
      answered: rows.filter((r) => !AVAIL_OPEN.has(status(r))).length,
      full: rows.filter((r) => status(r) === 'Available for all of it').length,
      part: rows.filter((r) => status(r) === 'Available for part of it').length,
      none: rows.filter((r) => status(r) === 'Not available').length,
      open: rows.filter((r) => AVAIL_OPEN.has(status(r))).map((r) => r.player),
      rows,
    };
  });
}

// ---------------------------------------------------------------- schedule and attendance
// The day's sessions come from the scrim & practice planner (core/scrims.js records).
export function daySessions(scrims, day, titles) {
  return scrims.filter((s) => s.date === day && s.status !== 'cancelled' && (!titles || titles.includes(s.title)))
    .sort((a, b) => (a.time || '99').localeCompare(b.time || '99') || a.title.localeCompare(b.title));
}
export const attId = (sessionId) => `AT-${sessionId}`.replace(/[^A-Za-z0-9_\-.]/g, '_').slice(0, 190);
export function attendance(session, marks, { by, note = '' }) {
  need(session?.id, 'Pick a session.');
  need(String(by || '').trim(), 'Who took attendance is required.');
  const clean = {};
  for (const [p, m] of Object.entries(marks || {})) { if (!m) continue; need(MARKS.includes(m), `Unknown mark for ${p}.`); clean[p] = m; }
  need(Object.keys(clean).length, 'Mark at least one player.');
  return { id: attId(session.id), sessionId: session.id, title: session.title, date: session.date, kind: session.kind, marks: clean, note: short(note, 200, 'Note'), by: by.trim(), at: new Date().toISOString(), origin: 'operational' };
}
// Share present or late among marked players, over records (optionally one title).
export function attendanceRate(records, title) {
  const rs = records.filter((r) => !title || r.title === title);
  let marked = 0, there = 0, late = 0;
  for (const r of rs) for (const m of Object.values(r.marks || {})) { marked++; if (m === 'present' || m === 'late') there++; if (m === 'late') late++; }
  return { sessions: rs.length, marked, there, late, rate: marked ? there / marked : null };
}

// ---------------------------------------------------------------- availability request (message to players)
// Asks for dates and a reason category only.
export function availabilityMessage({ lang = 'id', camp = null } = {}) {
  const dates = camp ? `${camp.start} – ${camp.end}${camp.status === 'confirmed' ? '' : (lang === 'id' ? ' (usulan, belum final)' : ' (proposed, not final)')}` : (lang === 'id' ? 'tanggal masih menunggu konfirmasi PB ESI' : 'dates still to be confirmed by PB ESI');
  if (lang === 'id') return [
    'Halo, ini dari staf pelatih Timnas Esports Indonesia untuk IESF WEC 2026 (15–20 Desember, ICE BSD City).',
    `Kami sedang menyusun jadwal pelatnas (${dates}). Mohon balas pesan ini dengan:`,
    '1. Tanggal kamu BISA ikut pelatnas (dari – sampai).',
    '2. Tanggal yang TIDAK bisa, dengan kategori alasan saja: pertandingan/turnamen klub, bootcamp klub, sekolah/ujian, perjalanan, pribadi, lainnya. Tidak perlu detail pribadi.',
    'Terima kasih!',
  ].join('\n');
  return [
    "Hi, this is the coaching staff of Indonesia's national esports team for IESF WEC 2026 (15–20 December, ICE BSD City).",
    `We are building the pelatnas schedule (${dates}). Please reply with:`,
    '1. The dates you CAN attend the training camp (from – to).',
    '2. Any dates you CANNOT, with the reason category only: club match/tournament, club bootcamp, school/exam, travel, personal, other. No personal details needed.',
    'Thank you!',
  ].join('\n');
}
