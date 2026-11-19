# Hub V1.34 — support staff daily reports (19 Nov 2026)

For the five support staff: Dokter Aji (team doctor), Bang Ilham (physio, men), Mba Dewi (physio, women),
Coach Ekky (physical conditioning), Fadhil (psychologist, men), Mbak Putu (psychologist, women).

## Put it live
1. **Database:** `supabase/RUN_ON_LIVE_V1_34.sql` (step 1: the new role `support`; step 2: the tables
   `support_reports` and `support_notices`, their access rules, `support_summary()`, the `support_job` column on
   profiles, and `support_parse` in the AI action list).
2. **AI function:** redeploy `scrim-ai` (prompt version `scrim-ai-2026-11-30.1`).
3. **Website:** merge to `main`.
4. **Logins:** invite the five, then in Staff → Users & access pick each one's **Support staff job** (this also
   gives the support role). They see only Performance → Support staff and the Guide.

## The report (Performance → Support staff)
- Three questions: **what you did, what you found, which athletes you saw** ("Seen today" fills itself).
- One row per athlete (picked from the roster; a name not in the roster is kept as written), with the words each
  role already uses: doctor S/O/A and P; physio complaint, body region, treatment, VAS before → after, response;
  physical coach and psychologist activity and finding. A part for a whole team or session.
- **Paste from WhatsApp → Fill the form (AI)**: the AI moves their own words into the rows (any format); they check
  and save. **Copy for WhatsApp** gives the text back for the group, which keeps going.
- **Tell the coach (no diagnosis)**: one neutral line per athlete for that team's coaches (Today → From the support
  staff). Nothing else of the report reaches the coaches.

## Who reads what (database rules)
- Full reports: the author, Coach Donny (readiness owner), the Head Coach (Coach Fayad) and admins (Aufa).
  The psychologists' notes (Fadhil, Mbak Putu) included: nobody else.
- Everyone else signed in (title coaches, analysts, leadership): **counts only** (`support_summary()`): no names,
  complaints, diagnoses or notes.

## Measurements (daily and weekly)
- This week vs the week before: reports filed, athlete visits, follow-ups, athletes seen 3+ times, physio pain drop
  (VAS), better after treatment; days with a report per role; visits per team; day by day.
- Signals: a team's visits doubling, athletes seen 3+ times, worse after treatment, still at pain 7/10+, a role with
  no report this week.
- With names (Coach Donny, Head Coach, admins): today's day board (who has reported), the watch list (open
  follow-ups, worse, still in pain, seen 3+ times) and the reports of the last 14 days, filtered by role.

## AI cost
`support_parse`: one call per pasted report, about $0.01–0.02 (Sonnet 5.5); five reports a day ≈ $0.10 / day.

## Tests
`tests/support.test.js` (rules, WhatsApp reading, measurements, AI routing and permission) and
`tests/web/support_web.test.js` (paste → AI → save; Coach Donny with names; a title coach with the line and counts
only; a support-only account sees only its page).
