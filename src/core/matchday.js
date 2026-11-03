// Tournament week: match-day runbooks, the WEC match tracker and between-games series sheets.
// WEC26 runs 15–20 Dec 2026 (confirmed). The bracket and match times are not published, so matches
// are entered by staff as IESF announces them. Runbook times are relative to match start (T-minutes).

export const EVENT = { start: '2026-12-15', end: '2026-12-20', venue: 'ICE BSD City, Banten' };

// Starting templates: proposals for the staff to edit, not agreed routines.
// owner = role, so the list works before every name is confirmed.
const COMMON = [
  { t: -1440, item: 'Confirm match time, stage and opponent from the official schedule', owner: 'Head Coach' },
  { t: -720, item: 'Sleep window agreed (lights-out / wake-up) for match day', owner: 'Donny (sport science)' },
  { t: -240, item: 'Main meal finished; hydration plan started', owner: 'Donny (sport science)' },
  { t: -180, item: 'Arrive at venue; devices, peripherals and accounts checked', owner: 'Team manager / title coach' },
  { t: -120, item: 'Opponent brief from the opponent card (Competitors → Opponent card); no new strategy', owner: 'Title coach' },
  { t: -60, item: 'Physical warm-up (mobility, hands and wrists)', owner: 'Donny (sport science)' },
  { t: -45, item: 'Mental routine: breathing / focus cue, agreed comms words', owner: 'Donny (sport science)' },
  { t: -30, item: 'Game warm-up (aim, last hits or drills, per title)', owner: 'Title coach' },
  { t: -10, item: 'Final check of the rules that apply to coaching during the match', owner: 'Head Coach' },
  { t: 0, item: 'Match start', owner: '—' },
];
const BY_TITLE = {
  'Dota 2': [{ t: -90, item: 'Draft book: first-phase bans and three opening plans per side', owner: 'Aufa / Dota 2 coach' }],
  MLBB: [{ t: -90, item: 'Draft book from Draft Lab: bans, flex picks, side plans', owner: 'Aufa / MLBB coach' }],
  'MLBB Women': [{ t: -90, item: 'Draft book from Draft Lab: bans, flex picks, side plans', owner: 'MLBB Women coach' }],
  'PUBG Mobile': [{ t: -90, item: 'Drop and rotation plan per map; fallback drop agreed', owner: 'Fayad / PUBGM coach' }],
  eFootball: [{ t: -90, item: 'Opponent formation notes and in-game tactics presets saved', owner: 'eFootball coach (TBD)' }],
  CS2: [{ t: -90, item: 'Map veto plan and side preferences', owner: 'CS2 coach' }],
  'CS2 Women': [{ t: -90, item: 'Map veto plan and side preferences', owner: 'CS2 Women coach' }],
};
export function defaultRunbook(title) {
  return [...COMMON, ...(BY_TITLE[title] || [])].sort((a, b) => a.t - b.t).map((x, i) => ({ id: `R${i + 1}`, ...x }));
}
export const tLabel = (t) => (t === 0 ? 'Start' : t <= -1440 ? `D-${Math.round(-t / 1440)}` : `T-${-t >= 60 ? `${Math.floor(-t / 60)}h${-t % 60 ? ` ${-t % 60}m` : ''}` : `${-t}m`}`);

const need = (c, m) => { if (!c) throw new Error(m); };

export function wecMatch(x) {
  need(x.title, 'Title is required.');
  need(x.date >= EVENT.start && x.date <= EVENT.end, `Date must fall within WEC (${EVENT.start} to ${EVENT.end}).`);
  need(x.opponent && x.opponent.trim(), 'Opponent is required (or "TBD").');
  return { id: `WM-${x.date.replace(/-/g, '')}-${Math.random().toString(36).slice(2, 6)}`, title: x.title, date: x.date, time: x.time || '', stage: x.stage || '', opponent: x.opponent.trim(), format: x.format || '', done: {}, result: null, games: [], origin: 'operational' };
}
export function tick(match, itemId, by) {
  need(by && by.trim(), 'Who ticked it is required.');
  const done = { ...match.done };
  if (done[itemId]) delete done[itemId]; else done[itemId] = { by: by.trim(), at: new Date().toISOString() };
  return { ...match, done };
}
export function setResult(match, { result, score, by }) {
  need(['won', 'lost', 'draw', 'placed'].includes(result), 'Result must be won, lost, draw or placed.');
  need(by && by.trim(), 'Who recorded it is required.');
  return { ...match, result: { result, score: (score || '').trim(), by: by.trim(), at: new Date().toISOString() } };
}

// Between-games sheet: one entry per game in a series (or per match in a PUBGM day).
export function gameNote(match, x) {
  need(x.worked || x.failed, 'Write what worked or what failed.');
  need(x.adjust && x.adjust.trim(), 'Write the adjustment for the next game.');
  need(x.by && x.by.trim(), 'Who wrote it is required.');
  const n = match.games.length + 1;
  const calls = Object.fromEntries(Object.entries(x.calls || {}).filter(([, v]) => v && v.trim()).map(([k, v]) => [k, v.trim()]));
  const g = { game: n, side: x.side || '', outcome: x.outcome || '', worked: (x.worked || '').trim(), failed: (x.failed || '').trim(), adjust: x.adjust.trim(), calls, by: x.by.trim(), at: new Date().toISOString(), applied: null };
  return { ...match, games: [...match.games, g] };
}
// Mark whether game N's adjustment was actually used in game N+1 (learning for later series).
export function markApplied(match, game, applied) {
  return { ...match, games: match.games.map((g) => (g.game === game ? { ...g, applied: !!applied } : g)) };
}
