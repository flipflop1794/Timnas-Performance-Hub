# Hub V1.19 — Main dashboard for leadership, Leadership role, Home button (19 Nov 2026)

| Area | What changed |
|---|---|
| **Main dashboard** (Today → Main dashboard, or the Home button) | One page with where every title stands: days to WEC, sessions in the last 7 days, average practice quality, overdue follow-ups, proposals waiting; per title: practice quality (and change), last 7 days' record or points, plan followed, results trend (Better / Worse only beyond chance), next WEC match, overdue follow-ups; the next WEC matches. Team level only: no individual wellbeing values, no compensation, no win probabilities. Each number links to its page. Title coaches see only their titles. |
| **Leadership role** | For the Ketua BTN and the Dewan Pengawas. Reads every title; cannot save, approve or change anything (refused by the database); does not see wellbeing or Coach Donny's readiness data. Lands on the Main dashboard after sign-in; other pages carry a read-only note. |
| **Home button** | ⌂ Home in the top bar, for everyone, always back to the Main dashboard. |

## Put it live

1. **Database:** `supabase/RUN_ON_LIVE_V1_19.sql` has two statements. Run them as **two separate runs** in the
   Supabase SQL Editor (the new role must be saved before the second statement uses it). Neither changes any data.
2. **Website:** merge to `main`; Vercel deploys.
3. **Give the accounts:** invite the Ketua BTN and the Dewan Pengawas members (Supabase → Authentication → Invite user),
   then Staff → Users & access → tick **Leadership** only, no titles needed.
