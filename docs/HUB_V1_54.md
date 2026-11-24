# Hub V1.54 — Support staff: the work behind the numbers (24 Nov 2026)

Owner's request (24 Nov): a weekly summary on the support staff's own page that shows what they have done, week by
week and day by day, as a reminder and a reward; and a weekly summary for the Head Coach team (the owner, Coach Fayad,
Coach Donny) of how each support staff member is doing, for them only.

Both already existed as numbers (V1.50 "My week", and a row of dots per person for the readers). This version shows
the work itself. No new page, no database change, no AI.

## 1. For each support staff member: "My work this week"
- **Where:** the first block on their Support staff page (it was "My week so far").
- **Day by day:** every day of the week up to today.
  - A day with a report opens to who they saw and what they did, in their own words, with the follow-up.
  - A past day without a report says "no report" with **Add it**; today says "not reported yet today" with
    **Fill it now**. Both open the form on that date.
- **What you have done so far:** totals since their first report.
  - days reported, athletes helped, visits, follow-ups closed
  - days in a row, once it is two or more
  - their role's own result (see the table)
- Earlier weeks: the arrows, as before.
- They see their own work only. No ranking, no comparison with colleagues.

| Role | Result shown |
|---|---|
| Physio | average pain drop; athletes better after treatment |
| Doctor | athletes better after treatment |
| Psychologist | formal and informal sessions |
| Physical coach | sessions reported |

## 2. For the owner, Coach Fayad and Coach Donny: "Team support this week"
- **Where:** in the week block of the Support staff page (it was a row of dots per person).
- **One line per staff member**, also those who filed nothing:
  - days reported out of 7, with the dots
  - athletes and visits, with the change from the week before
  - follow-ups written, closed and still open
  - their role's result
  - with no report this week: the date of their last report, or "No report filed in the hub yet"
- **Tap a name:** that person's week day by day, the same list they see.
- **Copy the week for WhatsApp** now ends with one line per staff member: staff names and counts only, no athlete
  names, no findings.
- Sorted by role, then name. It is a list, not a ranking.
- A line under the list says what it is: it counts the reports filed in the hub, not all the work done.

## Who sees what
- Nothing changes in the database rules. A support report is read by its author and by admin, Head Coach and readiness
  owner accounts. On 24 Nov those roles are held by the owner, Coach Fayad and Coach Donny only.
- Support staff do not see each other's work or the team list.

## Put it live
- **Website only:** merge to `main`. No database step, no server function.

## Files
- **Logic:** `src/core/support.js` (`myDays`, `reportStreak`, `soFar`, `roleResult`, `teamBoard`, `boardText`)
- **Page:** `src/hub/support_ui.js`, styles in `src/hub/index.html`
- **Tests:** `tests/v154.test.js`, `tests/web/support_v154_web.test.js`
