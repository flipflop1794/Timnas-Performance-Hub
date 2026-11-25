# Hub V1.60 — streaks: balance, wording, visuals, one fix (26 Nov 2026)

Owner's ask: balance test, fix typos, improve the visuals, look for bugs (on V1.59 streaks and milestones).

**Balance (checked against the live numbers, counts only):** physios log 4–5 visits a day; the psychologists, the
team doctor and the physical coach about one; the busiest title files about 10 scrim reports in 8 days. With V1.59's
goals, most people could not reach a count milestone before WEC.

| Milestone | V1.59 | V1.60 |
|---|---|---|
| Visits, physios | 50, then 100 | 50, then 100 (unchanged) |
| Visits, psychologists, doctor, physical coach | 50, then 100 | **15, then 30** |
| Follow-ups closed | 10, then 25 | **5, then 15** |
| Scrim reports (coaches) | 25, then 50 | **15, then 30** |
| Full week (5 days) | no progress shown | **shows this week so far (2/5)** |

**Wording:** "signed in in a row" (English) → "login days in a row"; the milestone "Logged in 7 days in a row".

**Visuals:** milestones not reached yet have a dashed outline; reached ones are bold green.

**Fix:** the Head Coach team's login numbers were read once a day, so logins made later that day did not show until
the next day. They are now read again every 10 minutes. A failed login record is tried again after a minute.

**Tests:** `tests/streaks.test.js` (new goals, this-week progress), `tests/web/streaks_web.test.js` (wording).
