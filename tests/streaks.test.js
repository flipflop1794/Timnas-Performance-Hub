// V1.59 streaks and milestones: days with activity, two days off a week allowed, Road to WEC, the badges.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { streak, bestStreak, bestWeek, roadToWec, daysToWec, supportBadges, coachBadges, newlyEarned, ROAD_FROM, ROAD_TO } from '../src/core/streaks.js';

test('streak: a weekend off does not break it; a third day off in one week does; today is not over yet', () => {
  // A title that reports Tuesday to Friday, then Monday and Tuesday (weekend off), seen on Wednesday morning.
  const cs2 = ['2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-23', '2026-11-24'];
  assert.deepEqual(streak(cs2, '2026-11-25'), { n: 6, first: '2026-11-17' });
  assert.equal(streak([...cs2, '2026-11-25'], '2026-11-25').n, 7, 'today counts once it has activity');
  // The week of 16-22 had three days off (16, 21, 22): the streak starts on the 17th.
  assert.equal(streak(cs2, '2026-11-25').first, '2026-11-17');
  // Three days off in the same week break it.
  assert.equal(streak(['2026-11-23', '2026-11-27'], '2026-11-28').n, 1, '24, 25, 26 off: only the 27th counts');
  assert.equal(streak([], '2026-11-25').n, 0);
  assert.equal(bestStreak(cs2, '2026-11-25'), 6); assert.equal(bestWeek(cs2, '2026-11-25'), 4);
  assert.equal(bestWeek(['2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26', '2026-11-27'], '2026-11-29'), 5);
});

test('Road to WEC: from the day it went live to the day before WEC, at most two days off a week', () => {
  assert.equal(ROAD_FROM, '2026-11-26'); assert.equal(ROAD_TO, '2026-12-14'); assert.equal(daysToWec('2026-11-25'), 20);
  assert.equal(roadToWec([], '2026-11-25').state, 'soon');
  const every = []; for (let d = ROAD_FROM; d <= ROAD_TO; d = new Date(Date.parse(d) + 86400000).toISOString().slice(0, 10)) every.push(d);
  const weekdays = every.filter((d) => ![0, 6].includes(new Date(`${d}T00:00:00Z`).getUTCDay()));
  assert.deepEqual(roadToWec(weekdays, '2026-12-03'), { state: 'on', day: 8, total: 19, active: 6 }, 'weekends off: still on');
  assert.equal(roadToWec(weekdays, '2026-12-15').state, 'earned');
  const gap = weekdays.filter((d) => !['2026-12-01', '2026-12-02'].includes(d));
  assert.equal(roadToWec(gap, '2026-12-05').state, 'on', 'two weekdays off in a week: not yet broken');
  assert.equal(roadToWec(gap, '2026-12-07').state, 'broken', 'then the weekend makes four days off that week');
  assert.equal(roadToWec(weekdays.filter((d) => d !== '2026-12-03'), '2026-12-03').state, 'on', 'today has no report yet: not a day off');
});

test('badges: support staff and coaches; count milestones in tiers; what a save just earned', () => {
  const days = ['2026-11-23', '2026-11-24'];
  const s = supportBadges({ reportDays: days, visits: 31, closed: 7, loginDays: ['2026-11-24', '2026-11-25'], asOf: '2026-11-25', disc: 'physio' });
  const by = Object.fromEntries(s.map((b) => [b.id, b]));
  assert.equal(by.first.earned, true); assert.equal(by.streak7.earned, false); assert.equal(by.streak7.have, 2);
  assert.deepEqual([by.week5.have, by.week5.need], [2, 5], 'this week so far');
  assert.deepEqual([by.visits50.have, by.visits50.need, by.visits50.earned], [31, 50, false], 'physios: 50 visits');
  assert.equal(by.closed5.earned, true); assert.equal(by.closed15.need, 15, 'after 5, the next goal is 15');
  // V1.60 balance: a psychologist (about one visit a day) aims for 15, then 30.
  const psy = Object.fromEntries(supportBadges({ reportDays: days, visits: 16, asOf: '2026-11-25', disc: 'psych' }).map((b) => [b.id, b]));
  assert.equal(psy.visits15.earned, true); assert.equal(psy.visits30.need, 30);
  assert.equal(by.login7.have, 2); assert.equal(by.wec.need, 19);
  assert.ok(!supportBadges({ reportDays: days, asOf: '2026-11-25' }).some((b) => b.id === 'login7'), 'no login milestone until the database records logins');
  const c = coachBadges({ reportDays: ['2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-23', '2026-11-24'], reports: 9, loginDays: [], asOf: '2026-11-25' });
  const cb = Object.fromEntries(c.map((b) => [b.id, b]));
  assert.equal(cb.streak5.earned, true); assert.equal(cb.week5.earned, false); assert.deepEqual([cb.reports15.have, cb.reports15.need], [9, 15]);
  const before = supportBadges({ reportDays: [], visits: 0, asOf: '2026-11-25' });
  const after = supportBadges({ reportDays: ['2026-11-25'], visits: 2, asOf: '2026-11-25' });
  assert.deepEqual(newlyEarned(before, after).map((b) => b.id), ['first']);
});
