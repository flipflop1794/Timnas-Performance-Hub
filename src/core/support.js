// V1.34 support staff daily reports: team doctor, physiotherapists (men / women), physical coach, psychologist.
// Each report answers three questions: what they did, what they found, which athletes they saw that day.
// Health data stays with the author, Coach Donny (readiness owner), the Head Coach and admins (database rules);
// everyone else sees counts only (summarize() on the names-free rows from support_summary()).
import { hasContactNumber } from './pii.js';
import { localDay, shiftDay } from './dates.js';
import { person } from './people.js';
import { cleanPain, painText } from './painmap.js';

export const JOBS = {
  medic: { label: 'Team doctor', disc: 'medic' }, physio_men: { label: 'Physio (men)', disc: 'physio' }, physio_women: { label: 'Physio (women)', disc: 'physio' },
  physical: { label: 'Physical coach', disc: 'physical' }, psych_men: { label: 'Psychologist (men)', disc: 'psych' }, psych_women: { label: 'Psychologist (women)', disc: 'psych' },
};
export const DISCS = ['medic', 'physio', 'physical', 'psych'];
export const DISC_LABEL = { medic: 'Team doctor', physio: 'Physio / massage', physical: 'Physical conditioning', psych: 'Psychologist' };
// V1.36 the three columns of an athlete row, the same in the form and in the saved report (staff feedback, 20 Nov):
// what was done, findings, follow-up. "What was done" names the role.
export const ASK = {
  medic: { did: 'What was done (doctor)', found: 'Findings', follow: 'Follow-up' },
  physio: { did: 'What was done (physio)', found: 'Findings', follow: 'Follow-up' },
  physical: { did: 'What was done (physical coach)', found: 'Findings', follow: 'Follow-up' },
  psych: { did: 'What was done (psychologist)', found: 'Findings', follow: 'Follow-up' },
};
// Psychologists: the kind of session, and a prognosis in their own words.
export const SESSIONS = ['formal', 'informal', 'observation'];
export const SESSION_LABEL = { formal: 'Formal counselling', informal: 'Informal counselling', observation: 'Observation' };
// Follow-up used to be a tick (V1.34): true reads as "Yes", false as nothing.
export const followText = (v) => (v === true ? 'Yes' : v === false || v == null ? '' : String(v).trim());
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
    need(did || found, `Athlete ${n}: write what was done or the findings.`);
    const vasBefore = vas(r.vasBefore, `Athlete ${n}: VAS before`); const vasAfter = vas(r.vasAfter, `Athlete ${n}: VAS after`);
    return { athlete: athlete || athleteSeen, ...(athleteSeen && athleteSeen !== athlete ? { athleteSeen } : {}), title: txt(r.title, 30), did, found, region: txt(r.region, 120),
      response: RESPONSES.includes(r.response) ? r.response : '', vasBefore, vasAfter, followUp: noNumbers(txt(followText(r.followUp), 400), `Athlete ${n}`),
      ...(x.discipline === 'physio' ? { pain: cleanPain(r.pain, `Athlete ${n}`) } : {}),
      ...(x.discipline === 'psych' ? { session: SESSIONS.includes(r.session) ? r.session : '', prognosis: noNumbers(txt(r.prognosis, 600), `Athlete ${n}`) } : {}),
      notify: !!r.notify && !!txt(r.notifyText), notifyText: noNumbers(txt(r.notifyText, 200), `Athlete ${n}`),
      ...(r.fuDone?.at ? { fuDone: { at: txt(r.fuDone.at, 40), by: txt(r.fuDone.by, 80) } } : {}) };
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

// V1.35 one session, many athletes: the athletes ticked (title|name) plus names typed by hand ("Jonathan (CS2)", comma-separated)
// share one "what you did / what you found"; each becomes its own row, so visits, repeats and follow-ups stay per athlete.
export function groupRows(g) {
  const did = txt(g?.did); const found = txt(g?.found);
  need(did || found, 'Group session: write what you did or what you found.');
  const seen = new Set(); const out = [];
  const add = (title, athlete, athleteSeen = '') => { const k = `${title}|${norm(athlete || athleteSeen)}`; if (!norm(athlete || athleteSeen) || seen.has(k)) return; seen.add(k);
    out.push({ athlete, athleteSeen, title, did, found, region: txt(g.region, 120), response: '', vasBefore: '', vasAfter: '', followUp: txt(followText(g.followUp), 400), notify: false, notifyText: '' }); };
  for (const p of Array.isArray(g?.picks) ? g.picks : []) { const i = String(p).indexOf('|'); if (i > 0) add(String(p).slice(0, i), txt(String(p).slice(i + 1), 60)); }
  for (const name of String(g?.others || '').split(/[,;\n]/).map((s) => txt(s, 60)).filter(Boolean)) add(titleOf(name), '', name);
  need(out.length, 'Group session: tick the athletes (or a whole team) first.');
  need(out.length <= 40, 'Group session: 40 athletes at most per report.');
  return out;
}
export const isBlankRow = (r) => !r.athlete && !r.athleteSeen && !r.did && !r.found && !r.region && !r.notifyText && !(r.pain || []).length;

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
    // V1.36: the national-team list (full names) first, then the hub's rosters.
    const hint = titleOf(x.title_seen); const pp = person(hint || null, x.athlete || x.athlete_seen) || person(hint || null, x.athlete_seen);
    const m = pp ? { ign: pp.name, title: pp.title } : findAthlete(x.athlete || x.athlete_seen, roster, hint);
    const v = (n) => (Number.isInteger(n) && n >= 0 && n <= 10 ? String(n) : '');
    return { athlete: m?.ign || '', athleteSeen: txt(x.athlete_seen, 60), title: m?.title || hint, did: txt(x.did), found: txt(x.found), region: txt(x.region, 120),
      response: RESPONSES.includes(x.response) ? x.response : '', vasBefore: v(x.vas_before), vasAfter: v(x.vas_after), followUp: txt(typeof x.follow_up === 'string' ? x.follow_up : followText(x.follow_up), 400),
      session: SESSIONS.includes(x.session) ? x.session : '', prognosis: txt(x.prognosis, 600), notify: false, notifyText: '' };
  });
  return { discipline: DISCS.includes(r.discipline) ? r.discipline : '', date: /^\d{4}-\d{2}-\d{2}$/.test(r.date || '') ? r.date : '', rows,
    general: { did: txt(r.general?.did, 1500), found: txt(r.general?.found, 1500), teams: (r.general?.teams || []).map((t) => txt(t, 30)).filter(Boolean) },
    unmatched: rows.filter((x) => !x.athlete).map((x) => x.athleteSeen).filter(Boolean), notes: txt(r.notes, 200) };
}

// Bahasa Indonesia labels for the WhatsApp copy (the hub's own translation table is not loaded in core).
const WA_ID = { 'What was done (doctor)': 'Yang dilakukan (Dokter)', 'What was done (physio)': 'Yang dilakukan (Fisio)', 'What was done (physical coach)': 'Yang dilakukan (Pelatih fisik)',
  'What was done (psychologist)': 'Yang dilakukan (Psikolog)', Findings: 'Temuan', 'Follow-up': 'Tindak lanjut', Session: 'Jenis sesi', Prognosis: 'Prognosis', 'Body region': 'Area tubuh',
  Response: 'Respon', 'Formal counselling': 'Konseling formal', 'Informal counselling': 'Konseling informal', Observation: 'Observasi', better: 'membaik', same: 'sama', worse: 'memburuk' };
// The report as a WhatsApp message (the group keeps going).
export function whatsappText(rep, lang = 'id') {
  const id = lang === 'id'; const A = ASK[rep.discipline];
  const head = `${id ? 'Laporan harian' : 'Daily report'} — ${DISC_LABEL[rep.discipline]} · ${rep.by}\n${rep.date}`;
  const L = id ? WA_ID : null; const lab = (k) => (L ? L[k] : k);
  const rows = rep.rows.map((r, i) => [`${i + 1}. ${r.athlete}${r.title ? ` (${r.title})` : ''}`, r.did && `   ${lab(A.did)}: ${r.did}`, r.found && `   ${lab(A.found)}: ${r.found}`,
    followText(r.followUp) && `   ${lab(A.follow)}: ${followText(r.followUp) === 'Yes' && id ? 'Ya' : followText(r.followUp)}`, r.session && `   ${lab('Session')}: ${lab(SESSION_LABEL[r.session])}`, r.prognosis && `   ${lab('Prognosis')}: ${r.prognosis}`,
    r.region && `   ${lab('Body region')}: ${r.region}`, (r.pain || []).length && `   ${id ? 'Titik nyeri' : 'Pain spots'}: ${painText(r.pain, lang)}`, r.vasBefore != null && `   VAS ${r.vasBefore}/10 → ${r.vasAfter ?? '?'}/10`, r.response && `   ${lab('Response')}: ${lab(r.response)}`].filter(Boolean).join('\n'));
  const g = rep.general.did || rep.general.found ? `\n${id ? 'Tim' : 'Team'}${rep.general.teams.length ? ` (${rep.general.teams.join(', ')})` : ''}:\n${[rep.general.did && `- ${rep.general.did}`, rep.general.found && `- ${rep.general.found}`].filter(Boolean).join('\n')}` : '';
  return [head, '', ...rows, g, '', `${id ? 'User hari ini' : 'Seen today'}: ${usersOfDay(rep).text}`].join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

// ---------------------------------------------------------------- measurements
// Names-free shape (the same as the database's support_summary()): { reports: [{day, disc}], rows: [{day, disc,
// title, response, followUp, vasBefore, vasAfter}], repeat }. Built here from full reports for those who may read them.
export function anonymise(reports, from, to) {
  const inP = reports.filter((r) => r.date >= from && r.date <= to);
  const rows = inP.flatMap((r) => r.rows.map((x) => ({ day: r.date, disc: r.discipline, title: x.title, response: x.response, followUp: !!followText(x.followUp), session: x.session || '', vasBefore: x.vasBefore, vasAfter: x.vasAfter })));
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
    vasDrop: avg(vasPairs.map((r) => r.vasBefore - r.vasAfter)), vasN: vasPairs.length, highVas: rows.filter((r) => Number.isInteger(r.vasAfter) && r.vasAfter >= HIGH_VAS).length, repeat: S.repeat || 0,
    formal: rows.filter((r) => r.session === 'formal').length, informal: rows.filter((r) => r.session === 'informal').length };
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
// V1.46 a follow-up stays open until its author ticks Done, or until the same role writes a newer row for that
// athlete (the newer visit carries its own follow-up). Seeing another role (a psychologist after the physio) does not close it.
const superseded = (reports, x, r, to) => reports.some((o) => o.discipline === r.discipline && o.date > r.date && o.date <= to && o.rows.some((y) => y.athlete === x.athlete));
export function openFollowUps(reports, from, to, by = null) {
  const out = [];
  for (const r of reports) {
    if (r.date < from || r.date > to || (by && r.by !== by)) continue;
    r.rows.forEach((x, i) => {
      const fu = followText(x.followUp);
      if (fu && !x.fuDone && !superseded(reports, x, r, to)) out.push({ reportId: r.id, i, athlete: x.athlete, title: x.title, date: r.date, disc: r.discipline, by: r.by, text: fu !== 'Yes' ? fu : (x.found || x.did) });
    });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.athlete.localeCompare(b.athlete));
}
// Done: the report with that row's follow-up closed (who and when). The edit history keeps the change.
export function closeFollowUp(rep, i, by, at = new Date().toISOString()) {
  need(rep?.rows?.[i] && followText(rep.rows[i].followUp), 'This follow-up is no longer in the report.');
  return { ...rep, rows: rep.rows.map((x, k) => (k === i ? { ...x, fuDone: { at, by: txt(by, 80) } } : x)) };
}
export function watchList(reports, from, to) {
  const inP = reports.filter((r) => r.date >= from && r.date <= to).sort((a, b) => b.date.localeCompare(a.date));
  const open = new Set(openFollowUps(reports, from, to).map((f) => `${f.reportId}#${f.i}`));
  const out = [];
  for (const r of inP) r.rows.forEach((x, i) => {
    const fu = followText(x.followUp);
    if (open.has(`${r.id}#${i}`)) out.push({ kind: 'follow-up', athlete: x.athlete, title: x.title, date: r.date, disc: r.discipline, by: r.by, text: fu !== 'Yes' ? fu : (x.found || x.did) });
    else if (x.response === 'worse' || (Number.isInteger(x.vasAfter) && x.vasAfter >= HIGH_VAS)) out.push({ kind: x.response === 'worse' ? 'worse' : 'pain', athlete: x.athlete, title: x.title, date: r.date, disc: r.discipline, by: r.by, text: x.found || x.did });
  });
  return out;
}

// V1.46 who has not reported today. staff: [{ name, job }] (support accounts); anyone else who filed that day is
// listed as reported too (Coach Donny, the Head Coach).
export function reportedOn(staff, reports, day) {
  const filed = reports.filter((r) => r.date === day);
  const done = [...new Set(filed.map((r) => r.by))].map((name) => ({ name, job: staff.find((s) => s.name === name)?.job || filed.find((r) => r.by === name).job || '',
    n: filed.filter((r) => r.by === name).reduce((a, r) => a + r.rows.length, 0) }));
  const missing = staff.filter((s) => !done.some((d) => d.name === s.name) && !(s.since && s.since > day));   // since: first report, when known
  const order = (x) => (JOBS[x.job] ? Object.keys(JOBS).indexOf(x.job) : 99);   // others (Coach Donny) last
  return { day, done: done.sort((a, b) => order(a) - order(b)), missing: missing.sort((a, b) => order(a) - order(b)) };
}
export function reminderText(r, lang = 'id') {
  const id = lang === 'id';
  return `${id ? 'Pengingat laporan harian' : 'Daily report reminder'} — ${r.day}\n${id ? 'Belum masuk' : 'Not in yet'}: ${r.missing.map((s) => s.name).join(', ')}\n${id ? 'Mohon isi di Hub (Performance → Support staff) atau kirim di grup. Terima kasih.' : 'Please file it in the Hub (Performance → Support staff) or send it in the group. Thank you.'}`;
}

// V1.46 athletes to check before WEC: over the last `days`, each athlete with a reason — seen 3+ times, latest pain
// score still high, latest response worse, or follow-ups still open. Highest concern first.
export function readinessList(reports, asOf, days = 14) {
  const from = shiftDay(asOf, -(days - 1));
  const inP = reports.filter((r) => r.date >= from && r.date <= asOf).sort((a, b) => a.date.localeCompare(b.date) || String(a.createdAt).localeCompare(String(b.createdAt)));
  const m = {};
  for (const r of inP) for (const x of r.rows) {
    const a = (m[`${x.athlete}|${x.title}`] ||= { athlete: x.athlete, title: x.title, visits: 0, discs: new Set(), last: '', vas: null, response: '', open: [] });
    a.visits++; a.discs.add(r.discipline); a.last = r.date;
    if (Number.isInteger(x.vasAfter)) a.vas = x.vasAfter;          // the latest score counts
    if (RESPONSES.includes(x.response)) a.response = x.response;
  }
  for (const f of openFollowUps(reports, from, asOf)) m[`${f.athlete}|${f.title}`]?.open.push(f);
  const score = (a) => (a.vas != null && a.vas >= HIGH_VAS ? 3 : 0) + (a.response === 'worse' ? 3 : 0) + (a.visits >= REPEAT_AT ? 2 : 0) + a.open.length;
  return Object.values(m).map((a) => {
    const why = [a.vas != null && a.vas >= HIGH_VAS && { kind: 'pain', text: `pain ${a.vas}/10 at the last treatment` }, a.response === 'worse' && { kind: 'worse', text: 'worse after the last treatment' },
      a.visits >= REPEAT_AT && { kind: 'repeat', text: `seen ${a.visits}× in ${days} days` }, a.open.length && { kind: 'follow-up', text: `${a.open.length} open follow-up${a.open.length === 1 ? '' : 's'}` }].filter(Boolean);
    return { ...a, discs: [...a.discs], why, score: score(a) };
  }).filter((a) => a.why.length).sort((a, b) => b.score - a.score || b.last.localeCompare(a.last));
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

// ---------------------------------------------------------------- V1.45 weekly dashboard (calendar weeks, Monday to Sunday)
// offset 0 = the week holding asOf, -1 = the week before, and so on.
const weekday = (d) => (new Date(`${d}T00:00:00Z`).getUTCDay() + 6) % 7;   // Monday 0 … Sunday 6
export function calWeek(asOf = localDay(), offset = 0) {
  const from = shiftDay(shiftDay(asOf, -weekday(asOf)), 7 * offset); const to = shiftDay(from, 6);
  return { from, to, prevFrom: shiftDay(from, -7), prevTo: shiftDay(from, -1), days: Array.from({ length: 7 }, (_, i) => shiftDay(from, i)) };
}
// One row per staff member: athletes seen each day of the week (null = no report that day).
export function weekGrid(reports, week) {
  const inW = reports.filter((r) => r.date >= week.from && r.date <= week.to);
  const people = {};
  for (const r of inW) (people[r.by] ||= { by: r.by, job: r.job || '', disc: r.discipline, reports: [] }).reports.push(r);
  return Object.values(people).map((p) => ({ ...p,
    days: week.days.map((d) => { const rs = p.reports.filter((r) => r.date === d); return rs.length ? rs.reduce((a, r) => a + (r.rows || []).length, 0) : null; }),
    daysReported: new Set(p.reports.map((r) => r.date)).size })).sort((a, b) => DISCS.indexOf(a.disc) - DISCS.indexOf(b.disc) || a.by.localeCompare(b.by));
}
// The week in a few lines for the WhatsApp group: counts only, no names, no findings.
export function weekText(cur, prev, week, lang = 'id') {
  const id = lang === 'id';
  const line = (d) => { const b = cur.byDisc[d]; return b.reports ? `- ${id ? DISC_ID[d] : DISC_LABEL[d]}: ${b.reports} ${id ? 'laporan' : `report${b.reports === 1 ? '' : 's'}`}, ${b.athletes} ${id ? 'atlet' : 'athlete visits'}` : null; };
  const teams = Object.entries(cur.byTitle).sort((a, b) => b[1] - a[1]).map(([t, n]) => `${t} ${n}`).join(', ');
  return [
    `*${id ? 'Rekap mingguan tim support' : 'Support staff weekly'}* — ${week.from} ${id ? 's/d' : 'to'} ${week.to}`, '',
    `${id ? 'Laporan' : 'Reports'}: ${cur.reports} (${id ? 'minggu lalu' : 'week before'} ${prev.reports}) · ${id ? 'Kunjungan atlet' : 'Athlete visits'}: ${cur.seen} (${prev.seen})`,
    ...DISCS.map(line).filter(Boolean),
    teams && `${id ? 'Per tim' : 'Per team'}: ${teams}`,
    cur.followUps ? `${id ? 'Tindak lanjut' : 'Follow-ups'}: ${cur.followUps}` : null,
    cur.vasN ? `${id ? 'Nyeri turun (VAS) rata-rata' : 'Pain drop (VAS), average'}: ${cur.vasDrop} (${cur.vasN} ${id ? 'terapi' : 'treatments'})` : null,
    cur.formal + cur.informal ? `${id ? 'Konseling formal / informal' : 'Counselling formal / informal'}: ${cur.formal} / ${cur.informal}` : null,
  ].filter((x) => x != null && x !== false).join('\n');
}
const DISC_ID = { medic: 'Dokter tim', physio: 'Fisio / massage', physical: 'Pelatih fisik', psych: 'Psikolog' };

// V1.50 one staff member's week (their own reports only): days reported, athletes handled (each athlete once),
// visits, follow-ups written and closed, per team, who came back most, and the role's own numbers. Compared with
// the week before. The WhatsApp copy holds counts only, no names.
export function myRecap(reports, by, week) {
  const mine = reports.filter((r) => r.by === by);
  const one = (from, to) => {
    const inW = mine.filter((r) => r.date >= from && r.date <= to); const rows = inW.flatMap((r) => r.rows.map((x) => ({ ...x, disc: r.discipline })));
    const who = {}; for (const x of rows) { const name = x.athlete || x.athleteSeen || ''; if (!name) continue; const k = `${x.title || ''}|${name}`; (who[k] ||= { athlete: name, title: x.title || '', n: 0 }).n++; }
    const teams = {}; for (const a of Object.values(who)) teams[a.title || 'Other'] = (teams[a.title || 'Other'] || 0) + 1;
    const closed = mine.flatMap((r) => r.rows).filter((x) => x.fuDone && String(x.fuDone.at).slice(0, 10) >= from && String(x.fuDone.at).slice(0, 10) <= to).length;
    const s = summarize(anonymise(inW, from, to));
    return { reports: inW.length, days: new Set(inW.map((r) => r.date)).size, athletes: Object.keys(who).length, visits: rows.filter((x) => x.athlete || x.athleteSeen).length,
      followUps: rows.filter((x) => followText(x.followUp)).length, closed, teams, regulars: Object.values(who).filter((a) => a.n >= 2).sort((a, b) => b.n - a.n),
      vasDrop: s.vasDrop, vasN: s.vasN, better: s.better, responded: s.responded, formal: s.formal, informal: s.informal, disc: inW[0]?.discipline || '' };
  };
  return { cur: one(week.from, week.to), prev: one(week.prevFrom, week.prevTo) };
}
export function recapText(rc, week, name, lang = 'id') {
  const id = lang === 'id'; const c = rc.cur; const p = rc.prev;
  const teams = Object.entries(c.teams).sort((a, b) => b[1] - a[1]).map(([t, n]) => `${t} ${n}`).join(', ');
  return [
    `*${id ? 'Rekap minggu saya' : 'My week'}* — ${name} — ${week.from} ${id ? 's/d' : 'to'} ${week.to}`, '',
    `${id ? 'Hari lapor' : 'Days reported'}: ${c.days}/7 · ${id ? 'Laporan' : 'Reports'}: ${c.reports}`,
    `${id ? 'Atlet ditangani' : 'Athletes handled'}: ${c.athletes} (${id ? 'minggu lalu' : 'week before'} ${p.athletes}) · ${id ? 'Kunjungan' : 'Visits'}: ${c.visits} (${p.visits})`,
    teams && `${id ? 'Per tim' : 'Per team'}: ${teams}`,
    c.followUps || c.closed ? `${id ? 'Tindak lanjut' : 'Follow-ups'}: ${c.followUps} ${id ? 'dibuat' : 'written'}, ${c.closed} ${id ? 'selesai' : 'closed'}` : null,
    c.vasN ? `${id ? 'Nyeri turun (VAS) rata-rata' : 'Pain drop (VAS), average'}: ${c.vasDrop} (${c.vasN} ${id ? 'terapi' : 'treatments'})` : null,
    c.responded ? `${id ? 'Membaik' : 'Better'}: ${c.better}/${c.responded}` : null,
    c.formal + c.informal ? `${id ? 'Konseling formal / informal' : 'Counselling formal / informal'}: ${c.formal} / ${c.informal}` : null,
  ].filter((x) => x != null && x !== false && x !== '').join('\n');
}
