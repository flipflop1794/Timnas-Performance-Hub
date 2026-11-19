// V1.34 support staff daily reports: team doctor, physiotherapists (men / women), physical coach, psychologist.
// Each report answers three questions: what they did, what they found, which athletes they saw that day.
// Health data stays with the author, Coach Donny (readiness owner), the Head Coach and admins (database rules);
// everyone else sees counts only (summarize() on the names-free rows from support_summary()).
import { hasContactNumber } from './pii.js';
import { localDay, shiftDay } from './dates.js';

export const JOBS = {
  medic: { label: 'Team doctor', disc: 'medic' }, physio_men: { label: 'Physio (men)', disc: 'physio' }, physio_women: { label: 'Physio (women)', disc: 'physio' },
  physical: { label: 'Physical coach', disc: 'physical' }, psych_men: { label: 'Psychologist (men)', disc: 'psych' }, psych_women: { label: 'Psychologist (women)', disc: 'psych' },
};
export const DISCS = ['medic', 'physio', 'physical', 'psych'];
export const DISC_LABEL = { medic: 'Team doctor', physio: 'Physio / massage', physical: 'Physical conditioning', psych: 'Psychologist' };
// The two questions per discipline, in the words the staff already use in their WhatsApp reports.
export const ASK = {
  medic: { did: 'Therapy (P)', found: 'Complaint, examination, diagnosis (S / O / A)' },
  physio: { did: 'Treatment', found: 'Complaint / assessment' },
  physical: { did: 'What you did (session, measurement)', found: 'What you found (fatigue, load)' },
  psych: { did: 'What you did (observation, session)', found: 'What you found' },
};
export const RESPONSES = ['better', 'same', 'worse'];
export const REPEAT_AT = 3;          // seen 3+ times in the period: flagged as a possible problem coming up
export const HIGH_VAS = 7;           // pain score at or above this after treatment: flagged

const need = (c, m) => { if (!c) throw new Error(m); };
const txt = (v, n = 600) => String(v ?? '').trim().slice(0, n);
const vas = (v, label) => { if (v === '' || v == null || Number(v) < 0) return null; const n = Number(v); need(Number.isInteger(n) && n >= 0 && n <= 10, `${label} must be a whole number from 0 to 10.`); return n; };
const noNumbers = (s, label) => { need(!hasContactNumber(s), `${label}: remove phone or ID numbers.`); return s; };

// One saved report. rows: one per athlete; general: what was done / found for a whole team or the session.
export function supportReport(x) {
  need(/^\d{4}-\d{2}-\d{2}$/.test(x.date || ''), 'Date is required (YYYY-MM-DD).');
  need(!x.asOf || x.date <= x.asOf, 'A report cannot be dated in the future.');
  need(DISCS.includes(x.discipline), 'Pick your role (doctor, physio, physical coach or psychologist).');
  need(txt(x.by), 'Who wrote the report is required.');
  const rows = (Array.isArray(x.rows) ? x.rows : []).slice(0, 40).map((r, i) => {
    const n = i + 1; const athlete = txt(r.athlete, 60); const athleteSeen = txt(r.athleteSeen, 60);
    const did = noNumbers(txt(r.did), `Athlete ${n}`); const found = noNumbers(txt(r.found), `Athlete ${n}`);
    if (!athlete && !athleteSeen && !did && !found) return null;
    need(athlete || athleteSeen, `Athlete ${n}: pick the athlete.`);
    need(did || found, `Athlete ${n}: write what you did or what you found.`);
    const vasBefore = vas(r.vasBefore, `Athlete ${n}: VAS before`); const vasAfter = vas(r.vasAfter, `Athlete ${n}: VAS after`);
    return { athlete: athlete || athleteSeen, ...(athleteSeen && athleteSeen !== athlete ? { athleteSeen } : {}), title: txt(r.title, 30), did, found, region: txt(r.region, 120),
      response: RESPONSES.includes(r.response) ? r.response : '', vasBefore, vasAfter, followUp: !!r.followUp,
      notify: !!r.notify && !!txt(r.notifyText), notifyText: noNumbers(txt(r.notifyText, 200), `Athlete ${n}`) };
  }).filter(Boolean);
  const general = { did: noNumbers(txt(x.general?.did, 1500), 'Team activity'), found: noNumbers(txt(x.general?.found, 1500), 'Team finding'),
    teams: (Array.isArray(x.general?.teams) ? x.general.teams : []).map((t) => txt(t, 30)).filter(Boolean).slice(0, 7) };
  need(rows.length || general.did || general.found, 'Write at least one athlete, or what you did and found for the team.');
  return {
    id: `SR-${x.date.replace(/-/g, '')}-${Math.random().toString(36).slice(2, 6)}`, date: x.date, discipline: x.discipline, job: JOBS[x.job] ? x.job : '',
    by: txt(x.by, 80), rows, general, source: x.source === 'whatsapp' ? 'whatsapp' : 'form', origin: 'operational', createdAt: new Date().toISOString(),
  };
}

// "User hari itu": the athletes seen and teams worked with, from the rows.
export function usersOfDay(rep) {
  const by = {};
  for (const r of rep.rows || []) (by[r.title || 'Other'] ||= new Set()).add(r.athlete);
  const titles = Object.entries(by).map(([t, s]) => `${t} ${s.size}`);
  const n = Object.values(by).reduce((a, s) => a + s.size, 0);
  return { n, titles, teams: rep.general?.teams || [], text: `${n} athlete${n === 1 ? '' : 's'}${titles.length ? `: ${titles.join(', ')}` : ''}${rep.general?.teams?.length ? ` · teams: ${rep.general.teams.join(', ')}` : ''}` };
}

// The AI's reading of a pasted WhatsApp report → rows for the form. roster: { title: [names] }.
const norm = (s) => String(s || '').toLowerCase().replace(/^(kak|bang|mba|mbak|mas|dek|coach)\s+/, '').replace(/[^a-z0-9]/g, '');
const TITLE_HINT = [[/mlbb.*(w|women|wanita|putri)|mlbbw/i, 'MLBB Women'], [/mlbb/i, 'MLBB'], [/dota/i, 'Dota 2'], [/pubg/i, 'PUBG Mobile'], [/e-?football/i, 'eFootball'],
  [/cs.*(w|women|wanita|putri)/i, 'CS2 Women'], [/\bcs|counter/i, 'CS2']];
export function titleOf(seen) { const s = String(seen || ''); return TITLE_HINT.find(([re]) => re.test(s))?.[1] || ''; }
export function findAthlete(name, roster, hintTitle = '') {
  const k = norm(name); if (!k) return null;
  const all = Object.entries(roster).flatMap(([t, xs]) => xs.map((ign) => ({ title: t, ign })));
  const exact = all.filter((x) => norm(x.ign) === k);
  const pick = (xs) => (xs.length === 1 ? xs[0] : xs.find((x) => x.title === hintTitle) || null);
  return pick(exact) || pick(all.filter((x) => norm(x.ign).length >= 3 && (k.startsWith(norm(x.ign)) || norm(x.ign).startsWith(k))));
}
export function fromParse(raw, roster) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const rows = (Array.isArray(r.rows) ? r.rows : []).slice(0, 40).map((x) => {
    const hint = titleOf(x.title_seen); const m = findAthlete(x.athlete || x.athlete_seen, roster, hint);
    const v = (n) => (Number.isInteger(n) && n >= 0 && n <= 10 ? String(n) : '');
    return { athlete: m?.ign || '', athleteSeen: txt(x.athlete_seen, 60), title: m?.title || hint, did: txt(x.did), found: txt(x.found), region: txt(x.region, 120),
      response: RESPONSES.includes(x.response) ? x.response : '', vasBefore: v(x.vas_before), vasAfter: v(x.vas_after), followUp: !!x.follow_up, notify: false, notifyText: '' };
  });
  return { discipline: DISCS.includes(r.discipline) ? r.discipline : '', date: /^\d{4}-\d{2}-\d{2}$/.test(r.date || '') ? r.date : '', rows,
    general: { did: txt(r.general?.did, 1500), found: txt(r.general?.found, 1500), teams: (r.general?.teams || []).map((t) => txt(t, 30)).filter(Boolean) },
    unmatched: rows.filter((x) => !x.athlete).map((x) => x.athleteSeen).filter(Boolean), notes: txt(r.notes, 200) };
}

// The report as a WhatsApp message (the group keeps going).
export function whatsappText(rep, lang = 'id') {
  const id = lang === 'id'; const A = ASK[rep.discipline];
  const head = `${id ? 'Laporan harian' : 'Daily report'} — ${DISC_LABEL[rep.discipline]} · ${rep.by}\n${rep.date}`;
  const rows = rep.rows.map((r, i) => [`${i + 1}. ${r.athlete}${r.title ? ` (${r.title})` : ''}`, r.found && `   ${A.found}: ${r.found}`, r.region && `   ${id ? 'Area' : 'Region'}: ${r.region}`,
    r.did && `   ${A.did}: ${r.did}`, r.vasBefore != null && `   VAS ${r.vasBefore}/10 → ${r.vasAfter ?? '?'}/10`, r.response && `   ${id ? 'Respon' : 'Response'}: ${r.response}`,
    r.followUp && `   ${id ? 'Perlu tindak lanjut' : 'Follow-up needed'}`].filter(Boolean).join('\n'));
  const g = rep.general.did || rep.general.found ? `\n${id ? 'Tim' : 'Team'}${rep.general.teams.length ? ` (${rep.general.teams.join(', ')})` : ''}:\n${[rep.general.did && `- ${rep.general.did}`, rep.general.found && `- ${rep.general.found}`].filter(Boolean).join('\n')}` : '';
  return [head, '', ...rows, g, '', `${id ? 'User hari ini' : 'Seen today'}: ${usersOfDay(rep).text}`].join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

// ---------------------------------------------------------------- measurements
// Names-free shape (the same as the database's support_summary()): { reports: [{day, disc}], rows: [{day, disc,
// title, response, followUp, vasBefore, vasAfter}], repeat }. Built here from full reports for those who may read them.
export function anonymise(reports, from, to) {
  const inP = reports.filter((r) => r.date >= from && r.date <= to);
  const rows = inP.flatMap((r) => r.rows.map((x) => ({ day: r.date, disc: r.discipline, title: x.title, response: x.response, followUp: x.followUp, vasBefore: x.vasBefore, vasAfter: x.vasAfter })));
  return { reports: inP.map((r) => ({ day: r.date, disc: r.discipline })), rows, repeat: repeatAthletes(reports, from, to).length };
}
const avg = (xs) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);
// Totals for one period from the names-free shape.
export function summarize(S) {
  const rows = S.rows || []; const reps = S.reports || [];
  const byDisc = Object.fromEntries(DISCS.map((d) => [d, { reports: reps.filter((r) => r.disc === d).length, days: new Set(reps.filter((r) => r.disc === d).map((r) => r.day)).size, athletes: rows.filter((r) => r.disc === d).length }]));
  const byTitle = {}; for (const r of rows) byTitle[r.title || 'Other'] = (byTitle[r.title || 'Other'] || 0) + 1;
  const vasPairs = rows.filter((r) => Number.isInteger(r.vasBefore) && Number.isInteger(r.vasAfter));
  const responded = rows.filter((r) => RESPONSES.includes(r.response));
  return { reports: reps.length, days: new Set(reps.map((r) => r.day)).size, seen: rows.length, byDisc, byTitle,
    followUps: rows.filter((r) => r.followUp).length, better: responded.filter((r) => r.response === 'better').length, worse: responded.filter((r) => r.response === 'worse').length, responded: responded.length,
    vasDrop: avg(vasPairs.map((r) => r.vasBefore - r.vasAfter)), vasN: vasPairs.length, highVas: rows.filter((r) => Number.isInteger(r.vasAfter) && r.vasAfter >= HIGH_VAS).length, repeat: S.repeat || 0 };
}
// Day by day for a chart / table (from the names-free shape).
export function perDay(S, from, to) {
  const out = []; for (let d = from; d <= to; d = shiftDay(d, 1)) {
    const reps = S.reports.filter((r) => r.day === d); const rows = S.rows.filter((r) => r.day === d);
    out.push({ day: d, reports: reps.length, discs: [...new Set(reps.map((r) => r.disc))], seen: rows.length, followUps: rows.filter((r) => r.followUp).length });
  }
  return out;
}
// Week compared with the week before, and the signals worth a look (names-free).
export function weekSignals(cur, prev) {
  const out = [];
  for (const [t, n] of Object.entries(cur.byTitle)) { const p = prev.byTitle[t] || 0; if (n >= 4 && n >= 2 * Math.max(1, p)) out.push({ level: 'warn', text: `${t}: ${n} athlete visits this week (${p} the week before).` }); }
  if (cur.repeat) out.push({ level: 'warn', text: `${cur.repeat} athlete(s) seen ${REPEAT_AT}+ times this week.` });
  if (cur.worse) out.push({ level: 'warn', text: `${cur.worse} visit(s) with the athlete worse after treatment.` });
  if (cur.highVas) out.push({ level: 'warn', text: `${cur.highVas} visit(s) still at pain ${HIGH_VAS}/10 or more after treatment.` });
  for (const d of DISCS) if (cur.byDisc[d].days === 0) out.push({ level: 'info', text: `No ${DISC_LABEL[d].toLowerCase()} report this week.` });
  return out;
}

// With names, for those who may read the reports: athletes seen 3+ times, open follow-ups, still in pain.
export function repeatAthletes(reports, from, to, min = REPEAT_AT) {
  const m = {};
  for (const r of reports) if (r.date >= from && r.date <= to) for (const x of r.rows) { const k = `${x.athlete}|${x.title}`; (m[k] ||= { athlete: x.athlete, title: x.title, n: 0, discs: new Set(), last: '' }); m[k].n++; m[k].discs.add(r.discipline); if (r.date > m[k].last) m[k].last = r.date; }
  return Object.values(m).filter((x) => x.n >= min).map((x) => ({ ...x, discs: [...x.discs] })).sort((a, b) => b.n - a.n);
}
export function watchList(reports, from, to) {
  const inP = reports.filter((r) => r.date >= from && r.date <= to).sort((a, b) => b.date.localeCompare(a.date));
  const seenAfter = (athlete, date) => inP.some((r) => r.date > date && r.rows.some((x) => x.athlete === athlete));
  const out = [];
  for (const r of inP) for (const x of r.rows) {
    if (x.followUp && !seenAfter(x.athlete, r.date)) out.push({ kind: 'follow-up', athlete: x.athlete, title: x.title, date: r.date, disc: r.discipline, by: r.by, text: x.found || x.did });
    else if (x.response === 'worse' || (Number.isInteger(x.vasAfter) && x.vasAfter >= HIGH_VAS)) out.push({ kind: x.response === 'worse' ? 'worse' : 'pain', athlete: x.athlete, title: x.title, date: r.date, disc: r.discipline, by: r.by, text: x.found || x.did });
  }
  return out;
}
// Which roles filed a report on a day (the day board).
export function dayBoard(reports, day) {
  const today = reports.filter((r) => r.date === day);
  return DISCS.map((d) => { const rs = today.filter((r) => r.discipline === d); return { disc: d, label: DISC_LABEL[d], n: rs.length, by: [...new Set(rs.map((r) => r.by))], seen: rs.reduce((a, r) => a + r.rows.length, 0) }; });
}
export const weekRange = (asOf = localDay()) => ({ from: shiftDay(asOf, -6), to: asOf, prevFrom: shiftDay(asOf, -13), prevTo: shiftDay(asOf, -7) });

// The neutral line a title's coaches see (no diagnosis): written by the staff member, sent only when ticked.
export function noticeRecord({ title, athlete, text, by, date, disc }) {
  need(title, 'Pick the athlete\'s team for the coach notice.'); need(txt(text), 'Write the line for the coaches.');
  return { id: `SN-${date.replace(/-/g, '')}-${Math.random().toString(36).slice(2, 6)}`, title, athlete: txt(athlete, 60), text: noNumbers(txt(text, 200), 'Coach notice'), by: txt(by, 80), disc, date, origin: 'operational', createdAt: new Date().toISOString() };
}
