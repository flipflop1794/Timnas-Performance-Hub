# Hub V1.59 — streaks, daily login and milestones for support staff and coaches (25 Nov 2026)

**Owner's ask:** daily login / gamification / milestones on the support staff's and the coaches' own tab. Proposed as
streaks from saved reports; the owner chose "count logins too".

**The rules (src/core/streaks.js):**
- **🔥 Report streak:** days in a row with a saved report. Support staff: their own reports. Coaches: their title's
  scrim reports, whoever files them.
- **✅ Login streak (daily login):** days in a row the person opened the hub, signed in. Counted once a day.
- **Up to 2 days off in a calendar week (Mon–Sun) never break a streak**, and today without activity yet does not break
  it (the day is not over).
- **Road to WEC:** no break from 26 Nov (the day this goes live) to 14 Dec, the day before WEC.
- Personal: no points, no levels, no ranking between people.

**Milestones:**

| Support staff | Coaches |
|---|---|
| Laporan pertama | Laporan scrim pertama |
| 7 hari beruntun | 5 hari beruntun |
| Minggu penuh (5 hari) | Minggu penuh (5 hari) |
| 50 kunjungan, then 100 | 25 laporan scrim, then 50 |
| 10 tindak lanjut tuntas, then 25 | |
| Login 7 hari beruntun | Login 7 hari beruntun |
| Road to WEC | Road to WEC |

**Where it shows:**
- **Support staff, Progres mingguan:** "Pencapaian saya" at the top (🔥, ✅, days to WEC, the milestones); "Yang sudah
  Anda kerjakan" stays at the bottom. A small green dot on the week strip on the days they opened the hub.
- **Support staff, Laporan harian:** nothing new on the form; after Save, one line: "🔥 Hari ke-N berturut-turut", plus
  "Lencana baru: …" when a save reaches a milestone.
- **Coaches (a title's coaches and analysts), top of Scrim reports:** 🔥 the title's streak, ✅ their own login streak,
  days to WEC, today's report in or not, the milestones. The same streak line after saving a report.
- **Head Coach team (admins, Head Coach, readiness owner):** 🔥 and ✅ next to each name in "Tim support minggu ini";
  a Streak column per title and the coaches' login streaks under the table in Laporan scrim (all titles).

**Database (needs the go-ahead):** `supabase/migrations/20261207120000_checkins.sql` adds one table, `hub_checkins`:
one row per person per day (who, which day, first time). Only the day is sent; the database sets who and when. Each
person writes only their own row, only for today; nobody changes or deletes rows from the website. Read: own rows; the
Head Coach team reads everyone's. Until the table exists, the website counts reports only (no login parts, no error).

**Tests:** `tests/streaks.test.js` (rules, Road to WEC, milestones), `tests/web/streaks_web.test.js` (login recorded,
support staff, coach, Head Coach team, no table yet), `tests/db/checkins_rls.test.js` (database rules on Postgres).
