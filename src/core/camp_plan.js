// V1.35 Camp plan (periodisation): each title's coach plans the pelatnas as phases (one per week), a day level
// for every day (high / medium / low / simulation / off) and a daily unit template, then marks each day as run
// as planned, partly or not run. Based on the hybrid model in "Periodesasi Latihan Esport": accumulation ->
// peak volume -> transmutation -> taper (volume about half), heavy days not back to back, a day off every week.
// Pure functions over plain objects; the hub draws and saves. Nothing here decides for the coach.
import { hasContactNumber } from './pii.js';

export const PHASES = [
  { id: 'accumulation', label: 'Accumulation', target: 74, hint: 'Base: baseline tests, KPI mapping, 1 scrim block a day.' },
  { id: 'peak-volume', label: 'Peak volume', target: 100, hint: 'Most volume: 2 scrim blocks on high days, Thursday kept for recovery.' },
  { id: 'transmutation', label: 'Transmutation', target: 89, hint: 'Most intensity: mechanics kept as a 30–45 min dose, strong opponents, practise at match hours.' },
  { id: 'taper', label: 'Taper', target: 54, hint: 'Volume about half, intensity and frequency kept. Not a holiday.' },
];
export const PHASE = Object.fromEntries(PHASES.map((p) => [p.id, p]));
export const LEVELS = {
  high: { label: 'High', hours: 6 }, medium: { label: 'Medium', hours: 5 }, low: { label: 'Low', hours: 2 },
  simulation: { label: 'Simulation', hours: 4 }, off: { label: 'Off', hours: 0 },
};
export const LEVEL_IDS = Object.keys(LEVELS);
export const HEAVY = new Set(['high', 'simulation']);
export const DEFAULT_WEEK = ['high', 'medium', 'high', 'low', 'high', 'simulation', 'off']; // Mon .. Sun
export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const STATUS = ['as-planned', 'partly', 'not-run'];
export const STATUS_LABEL = { 'as-planned': 'As planned', partly: 'Partly', 'not-run': 'Not run' };
export const UNIT_ROWS = [
  { id: 'physical', label: 'Physical (fun game)', time: '08.30–11.30' },
  { id: 'mental', label: 'Mental', time: '11.30–12.00' },
  { id: 's1', label: 'Session 1', time: '12.00–14.30' },
  { id: 's2', label: 'Session 2', time: '15.00–17.00' },
  { id: 's3', label: 'Session 3', time: '18.00–20.30' },
  { id: 'recovery', label: 'Recovery', time: '20.30–21.00' },
];
// The coach's example week (MOBA, week 2 of the deck). Staff content, kept as written; each title edits its own copy.
export const DEFAULT_UNITS = {
  Mon: { physical: 'Futsal 4v4 30\' + estafet 10\'', mental: 'Goal setting 20\'', s1: 'Mekanik: aktivasi 15\' → drill hero pool 60\' → mini-tes 15\'', s2: 'Scrim blok 1: 3 game → break aktif 15\'', s3: 'Scrim blok 2: 3 game → review VOD 45\'', recovery: 'Peregangan jari, leher, bahu 15\'' },
  Tue: { physical: 'Ultimate frisbee 30\' + mobilitas 10\'', mental: 'Box breathing 10\' + self-talk', s1: 'Mekanik + draft 45\', ban-pick 45\'', s2: 'Strategi di custom 90\'', s3: 'Scrim 1 blok → review 30\'', recovery: 'Foam roll / self-massage 15\'' },
  Wed: { physical: 'Kekuatan & core 40\'', mental: 'Imagery 15\'', s1: 'Mekanik teamfight 75\'', s2: 'Scrim blok 1, fokus teamfight', s3: 'Scrim blok 2 → review VOD 45\'', recovery: 'Peregangan + mandi hangat' },
  Thu: { physical: 'Pemulihan aktif: jalan pagi + tenis meja 30\'', mental: 'Sesi psikolog / team bonding 45\'', s1: 'Drill ringan 45\', tanpa target skor', s2: 'Analisis lawan: VOD + rapat taktik 60\'', s3: 'Libur layar, tidur lebih awal', recovery: 'Tidur ≥ 8 jam' },
  Fri: { physical: 'Kelincahan & reaksi 30\'', mental: 'Reset setelah kalah 15\'', s1: 'Skenario: rotasi, gank, objektif 75\'', s2: 'Scrim blok 1 → break aktif 15\'', s3: 'Scrim blok 2 → review VOD 45\'', recovery: 'Peregangan 15\', tanpa kafein' },
  Sat: { physical: 'Aktivasi ringan 20\'', mental: 'Rutinitas hari match 20\'', s1: 'Persiapan match: draft + game plan 45\'', s2: 'Simulasi match Bo5, format kejuaraan', s3: 'Evaluasi mingguan 45\'', recovery: 'Pijat ringan 20\'' },
  Sun: { physical: '', mental: '', s1: 'Libur: tanpa scrim/ranked', s2: '', s3: '', recovery: 'Wellness tetap diisi' },
};
export const LIMITS = { maxDays: 120, note: 200, unit: 200 };

const need = (c, m) => { if (!c) throw new Error(m); };
const isDay = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '') && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
export const addDays = (d, n) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
const diff = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 864e5);
export const weekday = (d) => WEEKDAYS[(new Date(`${d}T00:00:00Z`).getUTCDay() + 6) % 7];
const clean = (s, n, label) => {
  const t = String(s ?? '').trim();
  need(t.length <= n, `${label}: keep it under ${n} characters.`);
  need(!hasContactNumber(t), `${label}: remove phone or ID numbers.`);
  return t;
};
export const planId = (title) => `CP-${title}`.replace(/[^A-Za-z0-9_\-.]/g, '_');

// Phase per week: first accumulation, last taper, the one before transmutation, peak volume in between.
export function defaultPhases(n) {
  if (n <= 1) return ['peak-volume'];
  if (n === 2) return ['accumulation', 'taper'];
  if (n === 3) return ['accumulation', 'transmutation', 'taper'];
  return ['accumulation', ...Array(n - 3).fill('peak-volume'), 'transmutation', 'taper'];
}

export function newPlan({ title, start, end, by }) {
  need(String(title || '').trim(), 'Title is required.');
  need(isDay(start) && isDay(end), 'Start and end dates are required (YYYY-MM-DD).');
  need(start <= end, 'The end date is before the start date.');
  const total = diff(start, end) + 1;
  need(total <= LIMITS.maxDays, `A camp plan covers at most ${LIMITS.maxDays} days.`);
  need(String(by || '').trim(), 'Who made the plan is required.');
  const n = Math.ceil(total / 7);
  const weeks = defaultPhases(n).map((phase) => ({ phase, target: PHASE[phase].target }));
  const days = {};
  for (let i = 0; i < total; i++) { const d = addDays(start, i); days[d] = { level: DEFAULT_WEEK[WEEKDAYS.indexOf(weekday(d))], status: '', note: '' }; }
  const at = new Date().toISOString();
  return { id: planId(title), title, origin: 'operational', start, end, weeks, days, units: JSON.parse(JSON.stringify(DEFAULT_UNITS)), by: by.trim(), at, createdAt: at };
}

const touched = (plan, by) => ({ ...plan, by: String(by || plan.by).trim(), at: new Date().toISOString() });
export const weekIndex = (plan, date) => Math.floor(diff(plan.start, date) / 7);
export const inPlan = (plan, date) => !!plan && isDay(date) && date >= plan.start && date <= plan.end;

export function setDay(plan, date, { level, status, note }, by) {
  need(inPlan(plan, date), 'That day is outside the camp plan.');
  const cur = plan.days[date] || { level: 'off', status: '', note: '' };
  const next = { ...cur };
  if (level !== undefined) { need(LEVEL_IDS.includes(level), `Day level must be one of: ${LEVEL_IDS.join(', ')}.`); next.level = level; }
  if (status !== undefined) { need(status === '' || STATUS.includes(status), 'Choose as planned, partly or not run.'); next.status = status; }
  if (note !== undefined) next.note = clean(note, LIMITS.note, 'Note');
  return touched({ ...plan, days: { ...plan.days, [date]: next } }, by);
}

export function setWeek(plan, i, { phase, target }, by) {
  need(Number.isInteger(i) && i >= 0 && i < plan.weeks.length, 'No such week in the plan.');
  const w = { ...plan.weeks[i] };
  if (phase !== undefined) { need(PHASE[phase], 'Choose a phase.'); w.phase = phase; }
  if (target !== undefined) { need(Number.isFinite(+target) && +target >= 0 && +target <= 120, 'Target load must be 0–120 %.'); w.target = Math.round(+target); }
  const weeks = plan.weeks.slice(); weeks[i] = w;
  return touched({ ...plan, weeks }, by);
}

export function setUnits(plan, day, values, by) {
  need(WEEKDAYS.includes(day), 'Choose a weekday.');
  const row = { ...(plan.units?.[day] || {}) };
  for (const r of UNIT_ROWS) if (values[r.id] !== undefined) row[r.id] = clean(values[r.id], LIMITS.unit, r.label);
  return touched({ ...plan, units: { ...plan.units, [day]: row } }, by);
}

// Week rows with their dates, planned hours and phase.
export function weeks(plan) {
  return plan.weeks.map((w, i) => {
    const from = addDays(plan.start, i * 7);
    const to = [addDays(from, 6), plan.end].sort()[0];
    const ds = []; for (let d = from; d <= to; d = addDays(d, 1)) ds.push(d);
    const hours = ds.reduce((a, d) => a + LEVELS[plan.days[d]?.level || 'off'].hours, 0);
    return { i, n: i + 1, from, to, days: ds, phase: w.phase, target: w.target, hours };
  });
}

// What the deck warns about, read off the plan itself.
export function warnings(plan) {
  const out = [];
  const ds = Object.keys(plan.days).sort();
  for (let k = 1; k < ds.length; k++) {
    const a = plan.days[ds[k - 1]], b = plan.days[ds[k]];
    if (a.level === 'high' && b.level === 'high') out.push({ kind: 'back-to-back', date: ds[k], text: `High days back to back: ${ds[k - 1]} and ${ds[k]}. Put a medium or low day between heavy days.` });
  }
  for (const w of weeks(plan)) {
    if (w.days.length === 7 && !w.days.some((d) => plan.days[d]?.level === 'off')) out.push({ kind: 'no-day-off', date: w.from, text: `Week ${w.n} has no day off.` });
    if (w.phase === 'taper' && w.target > 70) out.push({ kind: 'taper', date: w.from, text: `Week ${w.n} is a taper at ${w.target} %: a taper usually cuts volume by 40–60 %.` });
  }
  return out;
}

// Progress up to `today`: days marked, adherence, sessions logged and (when load records are visible) actual load.
// sessions: the title's scrim & practice records ({date, status}); loads: sRPE records ({date, load}) or null.
export function progress(plan, today, { sessions = [], loads = null } = {}) {
  const rows = weeks(plan).map((w) => {
    const past = w.days.filter((d) => d <= today && plan.days[d]?.level !== 'off');
    const st = (s) => past.filter((d) => plan.days[d]?.status === s).length;
    const asPlanned = st('as-planned'), partly = st('partly'), notRun = st('not-run');
    const marked = asPlanned + partly + notRun;
    const logged = sessions.filter((s) => s.date >= w.from && s.date <= w.to && s.date <= today && s.status === 'done').length;
    const load = loads ? loads.filter((x) => x.date >= w.from && x.date <= w.to && x.date <= today).reduce((a, x) => a + (+x.load || 0), 0) : null;
    return { ...w, past: past.length, marked, unmarked: past.length - marked, asPlanned, partly, notRun, adherence: marked ? Math.round(((asPlanned + partly / 2) / marked) * 100) : null, logged, load, started: w.from <= today };
  });
  // Actual load as % on the plan's own scale: 100 % = the load that matches the weeks already run, on average.
  const runs = rows.filter((r) => r.load > 0 && r.target > 0 && r.to <= today);
  const ref = runs.length ? runs.reduce((a, r) => a + r.load / (r.target / 100), 0) / runs.length : null;
  for (const r of rows) r.actual = ref && r.load != null && r.started ? Math.round((r.load / ref) * 100) : null;
  const all = rows.reduce((a, r) => ({ past: a.past + r.past, marked: a.marked + r.marked, asPlanned: a.asPlanned + r.asPlanned, partly: a.partly + r.partly, logged: a.logged + r.logged }), { past: 0, marked: 0, asPlanned: 0, partly: 0, logged: 0 });
  const cur = rows.find((r) => r.from <= today && today <= r.to) || null;
  return {
    weeks: rows, current: cur, ...all, unmarked: all.past - all.marked,
    adherence: all.marked ? Math.round(((all.asPlanned + all.partly / 2) / all.marked) * 100) : null,
    daysLeft: today > plan.end ? 0 : diff(today < plan.start ? plan.start : today, plan.end) + (today < plan.start ? 1 : 0),
    state: today < plan.start ? 'not started' : today > plan.end ? 'finished' : 'in progress', ref,
  };
}

// Calendar months (Mon-first rows) from the plan's first month to the month holding `until`.
export function months(from, until) {
  const out = [];
  let y = +from.slice(0, 4), m = +from.slice(5, 7);
  const endKey = until.slice(0, 7);
  for (let guard = 0; guard < 12; guard++) {
    const key = `${y}-${String(m).padStart(2, '0')}`;
    const first = `${key}-01`;
    const len = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const lead = WEEKDAYS.indexOf(weekday(first));
    const cells = [...Array(lead).fill(null), ...Array.from({ length: len }, (_, i) => `${key}-${String(i + 1).padStart(2, '0')}`)];
    while (cells.length % 7) cells.push(null);
    const rows = []; for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
    out.push({ key, label: new Date(Date.UTC(y, m - 1, 1)).toLocaleString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }), rows });
    if (key >= endKey) break;
    m += 1; if (m > 12) { m = 1; y += 1; }
  }
  return out;
}

// One line per title for the overview: no plan yet, or phase now, adherence, days not marked.
export function overview(titles, plans, today, sessionsOf = () => []) {
  return titles.map((title) => {
    const plan = plans.find((p) => p.title === title) || null;
    if (!plan) return { title, plan: null };
    const p = progress(plan, today, { sessions: sessionsOf(title) });
    return { title, plan, state: p.state, phase: p.current ? PHASE[p.current.phase].label : '—', week: p.current?.n || null, adherence: p.adherence, unmarked: p.unmarked, logged: p.logged, warnings: warnings(plan).length };
  });
}

// A worked example for coaches to look at before they make their own: the deck's MOBA camp (16 Nov – 12 Dec),
// with the days before `today` marked the way a real week tends to go. Never saved; not anyone's data.
export const EXAMPLE_TITLE = 'Example (MOBA)';
export function examplePlan(today) {
  let p = newPlan({ title: EXAMPLE_TITLE, start: '2026-11-16', end: '2026-12-12', by: 'Periodisation deck (example)' });
  const notes = {
    '2026-11-17': ['as-planned', 'Baseline test in session 1 (Mon–Tue).'],
    '2026-11-19': ['as-planned', 'Recovery day: walk + table tennis, screens off early.'],
    '2026-11-20': ['partly', 'Yellow status for 2 players: scrim block 2 swapped for VOD + light drill.'],
    '2026-11-25': ['not-run', 'Partner cancelled: replaced with scenario drill (logged as not run).'],
  };
  for (const d of Object.keys(p.days).sort()) {
    if (d > today || p.days[d].level === 'off') continue;
    const [status, note] = notes[d] || ['as-planned', ''];
    p = setDay(p, d, { status, note }, p.by);
  }
  return { ...p, example: true };
}
