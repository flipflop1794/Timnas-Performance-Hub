// Wellbeing and training load (owner: Donny, sport scientist). Screening flags only:
// the hub never diagnoses, never ranks players and never turns this into a readiness score.
// Flags compare each player with his or her own recent history, and say so.
//
// Check-in (staff-entered, ideally before the first session of the day):
//   sleepH (hours), sleepQ, fatigue, soreness, stress, mood: 1 (very poor) .. 5 (very good)
// Session load: minutes x session RPE (0-10 CR-10 scale) = sRPE load in arbitrary units.

export const ITEMS = ['sleepQ', 'fatigue', 'soreness', 'stress', 'mood'];
export const ITEM_LABEL = { sleepQ: 'Sleep quality', fatigue: 'Freshness (low = tired)', soreness: 'Body (low = sore)', stress: 'Stress (low = stressed)', mood: 'Mood' };
export const MIN_BASELINE_DAYS = 7;
// minSD: a player who scores the same every day has SD 0; without a floor a big drop would never flag.
export const THRESHOLDS = { wellnessSD: 1.0, minSD: 1.5, shortSleepH: 6, shortSleepDays: 2, loadRatio: 1.5, loadWeeksBaseline: 3 };

const need = (c, m) => { if (!c) throw new Error(m); };
const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const sd = (a) => { if (a.length < 2) return 0; const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); };

export function checkin(x) {
  need(x.player, 'Player is required.'); need(x.title, 'Title is required.'); need(/^\d{4}-\d{2}-\d{2}$/.test(x.date || ''), 'Date is required (YYYY-MM-DD).');
  for (const k of ITEMS) need(Number.isInteger(+x[k]) && +x[k] >= 1 && +x[k] <= 5, `${ITEM_LABEL[k]} must be 1–5.`);
  need(+x.sleepH >= 0 && +x.sleepH <= 16, 'Sleep hours must be 0–16.');
  const o = { player: x.player.trim(), title: x.title, date: x.date, sleepH: +x.sleepH, by: (x.by || '').trim(), notes: (x.notes || '').trim(), origin: x.origin || 'operational' };
  for (const k of ITEMS) o[k] = +x[k];
  o.wellness = ITEMS.reduce((s, k) => s + o[k], 0); // 5..25, higher = better
  return o;
}

export function session(x) {
  need(x.player, 'Player is required.'); need(/^\d{4}-\d{2}-\d{2}$/.test(x.date || ''), 'Date is required.');
  need(+x.minutes > 0 && +x.minutes <= 600, 'Minutes must be 1–600.');
  need(+x.rpe >= 0 && +x.rpe <= 10, 'Session RPE must be 0–10.');
  return { player: x.player.trim(), title: x.title, date: x.date, kind: x.kind || 'scrim', minutes: +x.minutes, rpe: +x.rpe, load: Math.round(+x.minutes * +x.rpe), origin: x.origin || 'operational' };
}

const days = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);

// Flags for one player on one day. Returns [] when nothing stands out; an explicit
// "baseline building" note when there is not enough history to compare.
export function flags(player, date, checkins, sessions) {
  const mine = checkins.filter((c) => c.player === player).sort((a, b) => a.date.localeCompare(b.date));
  const today = mine.find((c) => c.date === date);
  const out = [];
  if (!today) return [{ level: 'info', text: 'No check-in for this day.' }];
  const prior = mine.filter((c) => c.date < date && days(c.date, date) <= 28);
  if (prior.length < MIN_BASELINE_DAYS) out.push({ level: 'info', text: `Baseline building: ${prior.length} of ${MIN_BASELINE_DAYS} earlier check-ins in the last 28 days. Personal comparisons start after that.` });
  else {
    const m = mean(prior.map((c) => c.wellness)), s = Math.max(THRESHOLDS.minSD, sd(prior.map((c) => c.wellness)));
    if (today.wellness <= m - THRESHOLDS.wellnessSD * s) {
      const low = ITEMS.filter((k) => today[k] <= Math.round(mean(prior.map((c) => c[k]))) - 1).map((k) => ITEM_LABEL[k]);
      out.push({ level: 'check', text: `Wellness ${today.wellness}/25 vs own 28-day average ${m.toFixed(1)} (±${s.toFixed(1)}).${low.length ? ` Lower on: ${low.join(', ')}.` : ''} Talk to the player before training.` });
    }
  }
  const recentSleep = mine.filter((c) => c.date <= date && days(c.date, date) < THRESHOLDS.shortSleepDays);
  if (recentSleep.length >= THRESHOLDS.shortSleepDays && recentSleep.every((c) => c.sleepH < THRESHOLDS.shortSleepH)) out.push({ level: 'check', text: `Under ${THRESHOLDS.shortSleepH} h sleep on ${THRESHOLDS.shortSleepDays} consecutive days.` });
  const ss = sessions.filter((x) => x.player === player);
  const week = (end) => ss.filter((x) => { const d = days(x.date, end); return d >= 0 && d < 7; }).reduce((a, x) => a + x.load, 0);
  const cur = week(date);
  const base = [1, 2, 3].map((w) => week(new Date(Date.parse(date) - w * 7 * 86400000).toISOString().slice(0, 10)));
  if (base.filter((b) => b > 0).length >= THRESHOLDS.loadWeeksBaseline) {
    const avg = mean(base);
    if (cur > THRESHOLDS.loadRatio * avg) out.push({ level: 'check', text: `7-day load ${cur} AU is ${(cur / avg).toFixed(1)}× the player's previous 3-week average (${Math.round(avg)} AU). A rule of thumb for a sudden jump, not a validated injury predictor.` });
  }
  return out;
}

export function teamDay(players, date, checkins, sessions) {
  const done = players.filter((p) => checkins.some((c) => c.player === p && c.date === date));
  const rows = players.map((p) => ({ player: p, flags: flags(p, date, checkins, sessions) }));
  return { date, completion: players.length ? done.length / players.length : 0, done: done.length, total: players.length, rows, toCheck: rows.filter((r) => r.flags.some((f) => f.level === 'check')) };
}
