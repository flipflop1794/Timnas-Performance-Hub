import { localDay, shiftDay } from './dates.js';
import { GAME_SPEC } from './reports.js';
import { completeScrim, planScrim } from './scrims.js';

export const ACTION_STATUSES = ['Open', 'In progress', 'Done'];
export const NOTE_LIMIT = 500;

const isDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value || '')
  && !Number.isNaN(Date.parse(value)) && shiftDay(value, 0) === value;

export function canWriteSession(user, title) {
  return !!user && (user.roles.includes('admin') || user.roles.includes('head_coach')
    || (user.roles.length > 0 && user.titles.includes(title)));
}

export function dailySession(input, author, id, today = localDay()) {
  const { title, date, kind } = input;
  if (!Object.hasOwn(GAME_SPEC, title) || !canWriteSession(author, title)) throw new Error('You cannot log a session for this discipline.');
  if (!isDate(date) || date > today) throw new Error('Enter a session date on or before today (WIB).');
  if (!['team practice', 'scrim'].includes(kind)) throw new Error('Choose practice or scrim.');
  const report = reportFields(input, author);
  const session = planScrim({ title, date, kind, partner: input.partner?.trim() || (kind === 'scrim' ? 'Internal' : ''), owner: author.name });
  const completed = completeScrim(session, { by: author.name, score: kind === 'scrim' ? report.outcome : '', notes: kind === 'team practice' ? report.outcome : '' });
  return withDailyReport({ ...completed, id }, report, author, today);
}

export function canAddDailyReport(session, author, today = localDay()) {
  return session?.origin === 'operational' && session.status === 'done' && !!session.result
    && !session.dailyReport && isDate(session.date) && session.date <= today && canWriteSession(author, session.title);
}

export function addDailyReport(session, input, author, today = localDay()) {
  if (!canAddDailyReport(session, author, today)) throw new Error('This session cannot accept a daily report.');
  return withDailyReport(session, reportFields(input, author), author, today);
}

function reportFields(input, author) {
  const [objective, outcome, issue, nextAction] = ['objective', 'outcome', 'issue', 'nextAction']
    .map((key) => (input[key] || '').trim());
  if ([objective, outcome, issue, nextAction].some((value) => !value || value.length > NOTE_LIMIT)) {
    throw new Error('Enter an objective, outcome, main issue and next action (up to 500 characters each).');
  }
  return { objective, outcome, issue, nextAction, by: author.name, filedAt: new Date().toISOString() };
}

function withDailyReport(session, dailyReport, author, today) {
  return {
    ...session, dailyReport,
    followUp: { ownerId: author.id, ownerName: author.name, due: shiftDay(today, 1), status: 'Open' },
  };
}

// V1.16 one form: a saved scrim report is also that session's daily report, so a coach never fills both.
// Report -> daily report: focus -> objective, result + what worked -> outcome, what failed -> main issue,
// adjustment -> next action (the follow-up, owned by the author, due tomorrow WIB).
const clip = (s) => { const t = String(s || '').trim(); return t.length > NOTE_LIMIT ? `${t.slice(0, NOTE_LIMIT - 1)}…` : t; };
export function dailyFromReport(r, resultLine) {
  return {
    objective: clip(r.focus),
    outcome: clip([`${resultLine} vs ${r.partner}`, r.worked].filter(Boolean).join('. ')),
    issue: clip(r.failed || 'No main issue noted'),
    nextAction: clip(r.adjust),
  };
}
// session: the planned session this report closes (already completed), or null to create one.
// Returns the session record to save, or null when the author cannot write sessions for the title.
export function sessionFromReport(r, resultLine, author, { session = null, id, today = localDay() } = {}) {
  if (!canWriteSession(author, r.title)) return null;
  const fields = dailyFromReport(r, resultLine);
  const out = session
    ? (canAddDailyReport(session, author, today) ? addDailyReport(session, fields, author, today) : null)
    : dailySession({ title: r.title, date: r.date, kind: 'scrim', partner: r.partner, ...fields }, author, id, today);
  return out ? { ...out, dailyReport: { ...out.dailyReport, fromReport: r.id } } : null;
}

export const reportFiledAt = (record) => record.dailyReport?.filedAt || record.createdAt || '';

export function updateFollowUp(session, { ownerId, due, status }, owners) {
  const owner = owners.find((person) => person.id === ownerId && canWriteSession(person, session.title));
  if (!owner) throw new Error('Choose an owner assigned to this discipline.');
  if (!isDate(due) || due < session.date) throw new Error('Enter a due date on or after the session date (WIB).');
  if (!ACTION_STATUSES.includes(status)) throw new Error('Choose a follow-up status.');
  return { ...session, followUp: { ownerId, ownerName: owner.name, due, status } };
}

export const isOverdue = (action, today) => action.status !== 'Done' && action.due < today;

function scheduledTime(session) {
  const time = /^(\d{1,2}):([0-5]\d)(?:\s*WIB)?$/i.exec(session.time?.trim() || '');
  return time && +time[1] < 24 ? +time[1] * 60 + +time[2] : Infinity;
}

export function sessionOverview(titles, sessions, scrimReports, today) {
  return titles.map((title) => {
    const mine = sessions.filter((session) => session.title === title);
    const reports = [
      ...mine.filter((session) => session.dailyReport).map((record) => ({ kind: 'session', record })),
      ...scrimReports.filter((report) => report.title === title).map((record) => ({ kind: 'report', record })),
    ].filter(({ record }) => record.date <= today).sort((a, b) =>
      b.record.date.localeCompare(a.record.date) || reportFiledAt(b.record).localeCompare(reportFiledAt(a.record)));
    const open = mine.filter((session) => session.dailyReport && session.followUp && session.followUp.status !== 'Done')
      .sort((a, b) => a.followUp.due.localeCompare(b.followUp.due));
    const next = mine.filter((session) => session.status === 'planned' && session.date >= today)
      .sort((a, b) => a.date.localeCompare(b.date) || scheduledTime(a) - scheduledTime(b))[0];
    return { title, latest: reports[0], overdue: open.filter((session) => isOverdue(session.followUp, today)), open, next };
  });
}
