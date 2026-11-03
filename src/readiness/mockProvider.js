// DUMMY readiness provider for the UI preview. Every name and number here is invented.
// Athletes are placeholders ("Dota 2 · Athlete 1"), not real Timnas players, so no one
// reads demo numbers as a real player's health data. Statuses are hard-wired from the
// dummy numbers below; this is NOT a scoring method and must not be reused as one.

const SIZE = { 'Dota 2': 5, MLBB: 6, 'MLBB Women': 6, 'PUBG Mobile': 4, CS2: 5, 'CS2 Women': 5, eFootball: 1 };
export const MOCK_TITLES = Object.keys(SIZE);
const SHORT = { 'Dota 2': 'D', MLBB: 'M', 'MLBB Women': 'MW', 'PUBG Mobile': 'P', CS2: 'C', 'CS2 Women': 'CW', eFootball: 'E' };
const THRESHOLDS = { red: 35, ready: 45, label: 'example thresholds (Donny sets the real ones)' };

function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; }; }
const hash = (str) => [...str].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
const r1 = (x) => Math.round(x * 10) / 10;
const statusOf = (v) => (v == null ? 'none' : v < THRESHOLDS.red ? 'red' : v < THRESHOLDS.ready ? 'amber' : 'green');

function athletesFor(title, date) {
  const R = rng(hash(`${title}|${date}`));
  return Array.from({ length: SIZE[title] }, (_, i) => {
    const checkedIn = !(i === SIZE[title] - 1 && SIZE[title] > 3 && R() < 0.7);
    const readiness = checkedIn ? r1(28 + R() * 50) : null;
    const st = statusOf(readiness);
    return { id: `${SHORT[title]}${i + 1}`, name: `${title} · Athlete ${i + 1}`, title, checkedIn, checkInTime: checkedIn ? `0${7 + Math.floor(R() * 3)}:${String(Math.floor(R() * 60)).padStart(2, '0')}` : undefined,
      readiness, status: st, wellness: checkedIn ? Math.round(12 + R() * 13 + (readiness - 50) / 6) : null, sleepZ: checkedIn ? r1(-3 + R() * 4.5) : null, loadAU: checkedIn ? Math.round(900 + R() * 1400) : null,
      reason: st === 'red' ? `Readiness ${readiness} below the red threshold (${THRESHOLDS.red}).` : st === 'amber' ? `Readiness ${readiness} below ready (${THRESHOLDS.ready}).` : st === 'none' ? 'No check-in yet today.' : '' };
  });
}
const order = { red: 0, amber: 1, none: 2, green: 3 };
const sortNeed = (a) => a.sort((x, y) => order[x.status] - order[y.status] || (x.readiness ?? 99) - (y.readiness ?? 99));
const titlesFor = (title) => (title === 'All titles' ? MOCK_TITLES : [title]);

export const mockProvider = {
  id: 'mock', label: 'Dummy data (UI preview)', kind: 'mock', preview: true,
  async getTeamDay({ title, date }) {
    return { date, title, athletes: sortNeed(titlesFor(title).flatMap((t) => athletesFor(t, date))), thresholds: THRESHOLDS, scale: { min: 0, max: 100 } };
  },
  async getTrend({ title, date, days }) {
    return Array.from({ length: days }, (_, k) => {
      const d = new Date(Date.parse(date) - (days - 1 - k) * 86400000).toISOString().slice(0, 10);
      const scored = titlesFor(title).flatMap((t) => athletesFor(t, d)).filter((a) => a.readiness != null);
      return { date: d, n: scored.length, avg: scored.length ? r1(scored.reduce((s, a) => s + a.readiness, 0) / scored.length) : null };
    });
  },
  async getAlerts({ title, date }) {
    const t = await this.getTeamDay({ title, date });
    return t.athletes.filter((a) => a.status === 'red' || a.status === 'amber' || !a.checkedIn)
      .map((a) => ({ athleteId: a.id, name: a.name, title: a.title, status: a.status, text: a.reason, action: a.checkedIn ? 'Talk to the athlete before training; adjust load if needed.' : 'Remind the athlete to check in.' }));
  },
};
