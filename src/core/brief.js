// Weekly brief for the Head Coach and the BOD. Built only from operational records.
// It reports team-level counts; no individual wellbeing or health values ever appear in it.

import { TITLES, owner } from './staff.js';
import { board as rivalBoard } from './competitors.js';
import { summary as scrimSummary } from './scrims.js';
import { teamDay } from './wellbeing.js';
import { EVENT } from './matchday.js';
import { reportSummary, GAME_SPEC } from './reports.js';

const days = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);

export function weeklyBrief({ asOf, cycle, scrims, rivals, tiers, checkins, roster, rules, pending, plans = [], reports = null }) {
  const since = new Date(Date.parse(asOf) - 6 * 86400000).toISOString().slice(0, 10);
  const lines = [];
  const toGo = days(asOf, EVENT.start);
  lines.push(`# Timnas weekly brief — week ending ${asOf}`);
  lines.push(`${toGo > 0 ? `${toGo} days to WEC (${EVENT.start} – ${EVENT.end}, ${EVENT.venue}).` : 'WEC is under way or finished.'} Generated from the Performance Hub; counts only, no individual health data.`);
  lines.push('');
  lines.push('## By title');
  lines.push('| Title | Owner | Objectives active / waiting | Sessions this week | Criterion met | Scrims this week / planned | Rivals with notes | Wellbeing check-in rate |');
  lines.push('|---|---|---|---|---|---|---|---|');
  const gaps = [];
  for (const t of TITLES) {
    const objs = cycle.filter((o) => o.title === t.id);
    const active = objs.filter((o) => ['accepted', 'modified'].includes(o.status)).length;
    const waiting = objs.filter((o) => o.status === 'proposed').length;
    const sess = objs.flatMap((o) => o.sessions).filter((s) => s.date >= since && s.date <= asOf);
    const met = sess.filter((s) => s.result === 'met').length;
    const sm = scrimSummary(scrims, t.id, asOf);
    const scrimWeek = sm.done.filter((s) => s.date >= since && s.date <= asOf).length;
    const rb = rivalBoard(t.id, rivals, tiers);
    const r = roster[t.id] || [];
    let checked = 0, possible = 0;
    for (let d = 0; d < 7; d++) { const day = new Date(Date.parse(asOf) - d * 86400000).toISOString().slice(0, 10); const td = teamDay(r, day, checkins, []); checked += td.done; possible += td.total; }
    lines.push(`| ${t.id} | ${owner(t.id).name} | ${active} / ${waiting} | ${sess.length} | ${sess.length ? `${met}/${sess.length}` : '—'} | ${scrimWeek} / ${sm.upcoming.length} | ${rb.covered}/${rb.field} | ${possible ? `${Math.round((checked / possible) * 100)}%` : 'no roster'} |`);
    if (!active) gaps.push(`${t.id}: no accepted objective${waiting ? ` (${waiting} waiting for ${owner(t.id).name})` : ''}.`);
    if (!scrimWeek) gaps.push(`${t.id}: no scrim logged this week.`);
    if (sm.overdue.length) gaps.push(`${t.id}: ${sm.overdue.length} scrim result(s) not logged.`);
  }
  const repRows = [];
  if (reports) for (const t of TITLES) { const s = reportSummary(reports, t.id, asOf); if (!s.sessions) gaps.push(`${t.id}: no scrim report filed this week.`); repRows.push([t, s]); }
  lines.push('');
  lines.push('## Needs attention');
  lines.push(...(gaps.length ? gaps.map((g) => `- ${g}`) : ['- Nothing flagged.']));
  if (reports) {
    lines.push(''); lines.push('## Scrim reports, last 7 days');
    lines.push('| Title | Sessions | Result | Plan followed (1–5) | Last report | Next session starts from |');
    lines.push('|---|---|---|---|---|---|');
    for (const [t, s] of repRows) {
      const pts = GAME_SPEC[t.id]?.mode === 'points';
      lines.push(`| ${t.id} | ${s.sessions} | ${s.sessions ? (pts ? `${s.points} pts in ${s.matches} matches` : `${s.won}-${s.lost}${s.drawn ? `-${s.drawn}` : ''}`) : '—'} | ${s.progress ?? '—'}${s.trend === 'up' ? ' ↑' : s.trend === 'down' ? ' ↓' : ''} | ${s.last ? s.last.date : 'none'} | ${s.carryOver ? s.carryOver.adjust.replace(/\|/g, '/') : '—'} |`);
    }
  }
  const main = Object.values(tiers).filter((x) => x.tier === 'main threat');
  if (main.length) { lines.push(''); lines.push('## Main threats (staff assessment)'); lines.push(...main.map((x) => `- ${x.title}: ${x.nation} — ${x.why} (${x.by})`)); }
  const atRisk = plans.flatMap((p) => p.goals.filter((g) => g.status === 'at risk').map((g) => `${p.title} · ${p.player}: ${g.area} goal at risk`));
  if (atRisk.length) { lines.push(''); lines.push('## Player goals at risk'); lines.push(...atRisk.map((x) => `- ${x}`)); }
  const prov = rules.filter((r) => r.status !== 'confirmed');
  lines.push(''); lines.push('## Rules not confirmed');
  lines.push(...(prov.length ? prov.map((r) => `- ${r.label} (${r.title}): ${r.status} — ${r.version}`) : ['- All confirmed.']));
  lines.push(''); lines.push('## Decisions pending');
  lines.push(...pending.map((p) => `- ${p}`));
  return lines.join('\n');
}
