import { hasContactNumber } from './pii.js';
// Daily scrim reports: what a coach writes after a scrim session. One report = one session
// (one sparring partner). The daily roll-up groups the day's sessions. Reports are never edited
// or deleted: a mistake is fixed with a dated correction note, so the record stays trustworthy.
// Operational data only. Player notes are performance notes: no health, personal or contact details.

export const REPORT_TITLES = ['Dota 2', 'MLBB', 'MLBB Women', 'PUBG Mobile', 'eFootball', 'CS2', 'CS2 Women'];

// How each game records a result, and which game-specific detail a coach is asked for.
export const GAME_SPEC = {
  'Dota 2': { mode: 'wl', unit: 'games', detail: 'Draft and key heroes', hint: 'e.g. Radiant: banned X, Y; first phase picks A, B; lost lane priority in game 2' },
  MLBB: { mode: 'wl', unit: 'games', detail: 'Draft and key heroes', hint: 'e.g. Blue side: bans A, B; flex pick C; early rotations too slow in game 2' },
  'MLBB Women': { mode: 'wl', unit: 'games', detail: 'Draft and key heroes', hint: 'e.g. Red side: bans A, B; flex pick C; objective timing late in game 1' },
  'PUBG Mobile': { mode: 'points', unit: 'matches', detail: 'Maps, drops and rotations', hint: 'e.g. Erangel x2, Miramar x1; contested drop at Pochinki failed twice; late rotation' },
  eFootball: { mode: 'wl', unit: 'matches', detail: 'Formation, tactics and goals', hint: 'e.g. 4-2-3-1 presets; conceded from set pieces; goals 5 for, 3 against' },
  CS2: { mode: 'wl', unit: 'maps', detail: 'Maps and round scores', hint: 'e.g. Mirage 13-9 (CT 8-4), Inferno 10-13; utility timing on B site' },
  'CS2 Women': { mode: 'wl', unit: 'maps', detail: 'Maps and round scores', hint: 'e.g. Mirage 13-9 (CT 8-4), Inferno 10-13; utility timing on B site' },
};
export const PROGRESS = [
  [1, 'Far from the plan'], [2, 'Mostly off the plan'], [3, 'Partly followed the plan'], [4, 'Mostly followed the plan'], [5, 'Followed the plan well'],
];
export const ROSTER_PLAYED = ['Full national roster', 'Partial roster / stand-ins', 'Not applicable'];

const need = (c, m) => { if (!c) throw new Error(m); };
const num = (v) => (v === '' || v == null ? null : Number(v));
const int = (v, label) => { const n = num(v); if (n == null) return null; need(Number.isInteger(n) && n >= 0 && n <= 999, `${label} must be a whole number from 0 to 999.`); return n; };
// Phone-like numbers do not belong in a performance note.
// Applied to free text about people only; round scores and formations in game notes are allowed.
const clean = (s, label) => { const t = (s || '').trim(); need(!hasContactNumber(t), `${label}: remove phone or ID numbers; keep performance notes only.`); return t; };
const plain = (s) => (s || '').trim();

export function scrimReport(x) {
  const spec = GAME_SPEC[x.title];
  need(spec, 'Pick a title.');
  need(/^\d{4}-\d{2}-\d{2}$/.test(x.date || ''), 'Date is required (YYYY-MM-DD).');
  need(!x.asOf || x.date <= x.asOf, 'A report cannot be dated in the future.');
  need(x.by && x.by.trim(), 'Who wrote the report is required.');
  need(x.partner && x.partner.trim(), 'Name the sparring partner (or "internal").');
  need(x.focus && x.focus.trim(), 'Write what the session was meant to practise.');
  need(Number(x.progress) >= 1 && Number(x.progress) <= 5, 'Rate how closely the team followed the plan (1 to 5).');
  need((x.worked || '').trim() || (x.failed || '').trim(), 'Write what worked or what failed.');
  need(x.adjust && x.adjust.trim(), 'Write the adjustment for the next session.');
  let result;
  if (spec.mode === 'points') {
    const played = int(x.played, 'Matches played'); const points = int(x.points, 'Points');
    need(played, 'Matches played is required (at least 1).'); need(points != null, 'Total points is required.');
    const avgPlacement = num(x.avgPlacement); if (avgPlacement != null) need(avgPlacement >= 1 && avgPlacement <= 25, 'Average placement must be between 1 and 25.');
    result = { mode: 'points', played, points, avgPlacement, wins: int(x.chicken, 'Wins') ?? 0 };
  } else {
    const won = int(x.won, 'Won') ?? 0; const lost = int(x.lost, 'Lost') ?? 0; const drawn = int(x.drawn, 'Drawn') ?? 0;
    need(won + lost + drawn > 0, `Record at least one ${spec.unit.slice(0, -1)} played (won, lost or drawn).`);
    result = { mode: 'wl', won, lost, drawn };
  }
  return {
    id: `RP-${x.date.replace(/-/g, '')}-${Math.random().toString(36).slice(2, 6)}`,
    title: x.title, date: x.date, time: (x.time || '').trim(), by: x.by.trim(), partner: x.partner.trim(),
    partnerLevel: x.partnerLevel || '', format: x.format || '', roster: ROSTER_PLAYED.includes(x.roster) ? x.roster : 'Not applicable',
    result, focus: x.focus.trim(), progress: Number(x.progress),
    detail: plain(x.detail), worked: plain(x.worked), failed: plain(x.failed),
    playerNotes: clean(x.playerNotes, 'Player notes'), adjust: plain(x.adjust),
    vod: (x.vod || '').trim(), scrimId: x.scrimId || '', notes: [], origin: 'operational', createdAt: new Date().toISOString(),
  };
}

// Append-only correction note. The original text stays; the note is shown under it.
export function addNote(report, { text, by }) {
  need(text && text.trim(), 'Write the correction or follow-up.');
  need(by && by.trim(), 'Who wrote it is required.');
  return { ...report, notes: [...(report.notes || []), { text: clean(text, 'Note'), by: by.trim(), at: new Date().toISOString() }] };
}

export const resultText = (r) => (r.mode === 'points'
  ? `${r.points} pts in ${r.played} match${r.played === 1 ? '' : 'es'}${r.avgPlacement != null ? `, avg place ${r.avgPlacement}` : ''}${r.wins ? `, ${r.wins} win${r.wins === 1 ? '' : 's'}` : ''}`
  : `${r.won}-${r.lost}${r.drawn ? `-${r.drawn}` : ''}`);

const dayDiff = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
const avg = (xs) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);

// One row per calendar day with a report, newest first.
export function byDay(reports, title) {
  const mine = reports.filter((r) => r.title === title);
  const days = {};
  for (const r of mine) (days[r.date] ||= []).push(r);
  return Object.entries(days).sort((a, b) => b[0].localeCompare(a[0])).map(([date, rs]) => {
    const wl = rs.filter((r) => r.result.mode === 'wl');
    return {
      date, sessions: rs, n: rs.length, progress: avg(rs.map((r) => r.progress)),
      won: wl.reduce((s, r) => s + r.result.won, 0), lost: wl.reduce((s, r) => s + r.result.lost, 0), drawn: wl.reduce((s, r) => s + r.result.drawn, 0),
      points: rs.filter((r) => r.result.mode === 'points').reduce((s, r) => s + r.result.points, 0),
      played: rs.filter((r) => r.result.mode === 'points').reduce((s, r) => s + r.result.played, 0),
      focus: [...new Set(rs.map((r) => r.focus))], authors: [...new Set(rs.map((r) => r.by))],
    };
  });
}

export function reportSummary(reports, title, asOf, windowDays = 7) {
  const mine = reports.filter((r) => r.title === title).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  const inWin = mine.filter((r) => dayDiff(r.date, asOf) >= 0 && dayDiff(r.date, asOf) < windowDays);
  const prev = mine.filter((r) => dayDiff(r.date, asOf) >= windowDays && dayDiff(r.date, asOf) < windowDays * 2);
  const wl = inWin.filter((r) => r.result.mode === 'wl');
  const won = wl.reduce((s, r) => s + r.result.won, 0); const lost = wl.reduce((s, r) => s + r.result.lost, 0); const drawn = wl.reduce((s, r) => s + r.result.drawn, 0);
  const pr = inWin.filter((r) => r.result.mode === 'points');
  const last = mine[0] || null;
  const prog = avg(inWin.map((r) => r.progress)); const progPrev = avg(prev.map((r) => r.progress));
  return {
    total: mine.length, sessions: inWin.length, daysCovered: new Set(inWin.map((r) => r.date)).size, won, lost, drawn,
    played: wl.length ? won + lost + drawn : 0, winRate: won + lost + drawn ? Math.round((won / (won + lost + drawn)) * 100) : null,
    points: pr.reduce((s, r) => s + r.result.points, 0), matches: pr.reduce((s, r) => s + r.result.played, 0),
    progress: prog, progressPrev: progPrev, trend: prog != null && progPrev != null ? (prog > progPrev + 0.2 ? 'up' : prog < progPrev - 0.2 ? 'down' : 'steady') : null,
    last, daysSince: last ? dayDiff(last.date, asOf) : null,
    // The most recent adjustment is what the next session should start from.
    carryOver: last ? { date: last.date, by: last.by, adjust: last.adjust } : null,
    partners: [...new Set(inWin.map((r) => r.partner))],
  };
}

const csvCell = (v) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
export function reportsCsv(reports) {
  const head = ['id', 'date', 'time', 'title', 'coach', 'partner', 'partner_level', 'format', 'roster', 'won', 'lost', 'drawn', 'matches_played', 'points', 'avg_placement', 'plan_followed_1_5', 'focus', 'detail', 'worked', 'failed', 'player_notes', 'next_adjustment', 'vod', 'corrections'];
  const rows = [...reports].sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt)).map((r) => {
    const p = r.result.mode === 'points';
    return [r.id, r.date, r.time, r.title, r.by, r.partner, r.partnerLevel, r.format, r.roster, p ? '' : r.result.won, p ? '' : r.result.lost, p ? '' : r.result.drawn, p ? r.result.played : '', p ? r.result.points : '', p ? (r.result.avgPlacement ?? '') : '', r.progress, r.focus, r.detail, r.worked, r.failed, r.playerNotes, r.adjust, r.vod, (r.notes || []).map((n) => `${n.at.slice(0, 10)} ${n.by}: ${n.text}`).join(' | ')];
  });
  return [head, ...rows].map((row) => row.map(csvCell).join(',')).join('\n');
}
