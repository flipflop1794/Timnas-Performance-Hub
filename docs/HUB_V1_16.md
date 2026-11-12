# Hub V1.16 — approvals you can trust, safer storage and AI spend, practice quality (12 Nov 2026)

Branch `phase3/hardening-and-practice-quality`. Fixes the High items of the 12 Nov audit, then adds the first
cross-title view for management.

## What changed

| Area | Before | Now |
|---|---|---|
| Draft books, opponent cards | "Approved by" was a name picked on screen; any coach of the title could approve as anyone | Approved only through the database (`approve_record`), as the signed-in person; the writer of a version cannot approve it |
| Who approves | Head Coach, admins, assistant coaches **of their assigned titles** | Head Coach, admins and **every assistant coach, all titles** (decided 12 Nov) |
| Coaching cycle | Reviewer and "decided by" were typed; history could be rewritten | Reviews, sessions and decisions are append-only; new reviews and decisions carry the signed-in name; drill/success and status changes without a decision are approvers only |
| Display names | Anyone could rename themselves | Admin only (Staff → Users & access) |
| Failed loads | Looked like "no records yet" | A notice names what could not be loaded |
| Screenshot storage | Manual clean-up; 1 GB fills in about a month | Users & access shows storage used (warnings at 60% and 80%) and deletes screenshots older than 90 days after a confirmation. Games read from them are kept |
| AI spend | Per-person daily limit only | Plus a whole-staff daily limit (`TEAM_DAILY_CALL_CAP`, default 600 calls); "is AI on?" needs sign-in |
| Phones | 13px fields made iPhones zoom in; Dota Team page wider than the screen | 16px fields on phones; long tags wrap |
| New: Trends tab in every title | — | Weekly lines over 4–8 weeks: team win rate / points, plan followed, PUBGM placement and early exits; per player KDA, K, D, A from confirmed games (MLBB, MLBB Women, Dota 2). "Better"/"Worse" only when the last 2 weeks differ from the 2 before beyond chance, with 6+ values each side. Objectives accepted in the period listed alongside |
| New: Staff → Practice quality | — | One row per title: planned sessions held, objectives, reports, reports filed by next day, plan followed, follow-ups on time, proposals reviewed; score and change from the previous period |

## Put it live (about 10 minutes)

1. **Database:** Supabase → SQL Editor → paste all of `supabase/RUN_ON_LIVE_V1_16.sql` → Run.
   It needs `RUN_ON_LIVE_V1_13_TO_V1_15.sql` to have been run before. It only adds or replaces functions,
   triggers and one policy; no data is changed.
2. **AI function** (only if `scrim-ai` is deployed): redeploy it (`supabase functions deploy scrim-ai`).
   Optional secret `TEAM_DAILY_CALL_CAP` (default 600). Until the database step is done, the team limit is skipped.
3. **Website:** merge the branch; Vercel deploys.
4. **Check:** sign in as a title coach → a draft book shows no Approve button. Sign in as an assistant coach →
   "Approve this version as <your name>". Staff → Practice quality opens. Users & access shows Screenshot storage.

## Not verified here

- The database tests (`tests/db/*.test.js`, including the new `approvals_rls.test.js`) need Postgres; they were
  **not run in this workspace** (no Postgres available). CI runs them on every push (`REQUIRE_DB=1`).
- The storage functions read `storage.objects`; they are exercised on the website test backend, not on real Storage.

## Changed behaviour to tell the staff

- Coaches can no longer change their own display name; ask the admin.
- The writer of an opponent card can no longer approve it (this was already the rule for draft books).
- Assistant coaches can now review and approve for every title, not only their assigned ones.
