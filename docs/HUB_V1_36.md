# Hub V1.36 — support reports by row, editing with history, summaries, real names (20 Nov 2026)

From the support staff's feedback (voice note and messages) and the BTN TIMNAS WEC 2026 dashboard.

## Put it live
1. **Database:** `supabase/RUN_ON_LIVE_V1_35.sql`, then `supabase/RUN_ON_LIVE_V1_36.sql`.
   V1.36 adds one table (`record_history`), lets scrim reports be updated, and narrows `support_summary()`.
2. **AI:** redeploy `scrim-ai` (prompt `scrim-ai-2026-12-02.1`: follow-up as text, session type, prognosis).
3. **Website:** merge to `main`.

## Performance → Support staff
- **One row per athlete, the same on input and output:** Athlete · What was done (Doctor / Physio / Physical coach /
  Psychologist) · Findings · Follow-up (text). WhatsApp copy uses the same Bahasa labels.
- **Psychologists:** session type (formal counselling, informal counselling, observation) and a **Prognosis** text.
- **Physios** keep body region and VAS before/after; doctors and physios keep the athlete's response.
- **Edit:** the author edits their own report; Coach Donny, the Head Coach and admins can edit any. Saving updates the
  same report (no duplicate, notices to coaches are not sent twice).
- **Edit history:** the database records every change (who, before, after, date and time). "Edited N× · last by …"
  opens the history. Nobody can change or delete it.
- **My summary (7 days)** for each support staff member: their own reports only (days reported, athletes handled,
  open follow-ups, VAS drop for physios, formal/informal counselling for psychologists, per team, to watch).
  Other support staff cannot see it.
- **Support team progress (7 days)** for Coach Donny, the Head Coach and admins (Aufa, Fayad): per person, who has
  not reported in 14 days, visits per team, what to watch, and every edit this week.
- **Main dashboard:** one numbers-only line for leadership, Coach Donny, the Head Coach and admins.
- Title coaches no longer see support counts; they still get the lines the staff tick for them.

## Scrim reports can be edited
- "Edit" on a saved report (the author, the Head Coach, assistant coaches and admins) opens it in the form;
  "Save changes" updates it in place. The old version stays in the edit history ("Edited N×", same overlay).
- Corrections already written stay shown.

## Real names
- Athletes and coaches by full name from the BTN TIMNAS WEC 2026 list (nickname beside it): Team page squad
  (with captain and coaches), Trends players, game breakdowns, Dota pools, support report athlete lists.
- The AI matches nicknames and "Kak/Bang/Mbak …" forms to the full name.

## Bahasa Indonesia
- Every new label, message and history line is translated; English stays available with the EN switch.
