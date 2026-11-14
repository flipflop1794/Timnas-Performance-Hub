# Hub V1.27 — AI for WEC scouting, Brainstorm per title, and feedback so the AI improves (14 Nov 2026)

The three AI features chosen as most important: (1) the AI pre-match brief and end-of-day scouting summary for WEC,
(2) a Brainstorm session in every title, (3) feedback on every AI output. The hub's rules hold: the AI reads only the
records the hub gives it, each with an id; **the hub** drops any line that cites no known id or writes a number that
is not in those records; staff approve before anything is shared or saved; no predictions, rankings, wellbeing,
contracts or money. Not deployed.

## Put it live (together with V1.26)
1. **Database:** run `supabase/RUN_ON_LIVE_V1_26.sql` (now covers V1.26 and V1.27: it only widens the list of AI
   actions logged in `ai_usage`; no table, policy or data change).
2. **AI function:** redeploy `scrim-ai` (prompt version `scrim-ai-2026-11-28.1`).
3. **Website:** merge to `main`. Until 1–2 are done, the new AI buttons and the Brainstorm tab stay hidden.

## 1. WEC scouting with AI (Tournament → Live scouting)
- **Draft with AI** on the pre-match brief: likely picks / bans / strategies, threats, things to watch, 3 key points
  and TBD, each line citing the brief (K…, T…, W…), the live log (LV-…) or counts (C…). Counts seen fewer than 3
  times are marked small. The key points go into the editable fields; the coach edits and approves as before.
  When the AI cannot be reached, the Phase 1 brief (no AI) still works.
- **End of day — scouting:** today's live log per opponent; **Summarise today (AI)** gives what we learned and what
  to look at next time, per nation; **Approve** per nation stores it (kind `scout_day`), and approved lines show in
  that opponent's brief the next days ("Learned on …").

## 2. Brainstorm (new tab in every title)
- Purpose: **Plan next practice** (latest reports, weaknesses, VOD themes, unfixed adjustments, weekly trend,
  partner suggestions) or **Opponent prep** (the opponent brief, live log, counts, draft book, stand-in record).
- Each reply names the records it used; numbers not found in the records are flagged "unverified"; follow-up
  question chips; **Turn into…** a session plan (pre-fills Plan a session), a coaching proposal (goes to the title
  coach's review queue), or a scouting note (pre-fills the note form). Suggestions with an unknown number or no known
  source are left out.
- **Summarise the session**, **Copy the session**, **New session**. Sessions are not stored (no new table); up to 30
  messages per session. The records are sent once per session in the cached system prompt (cheaper after the first).

## 3. Feedback so the AI improves over time
- **"Was this useful?"** — useful / not useful / wrong (+ one line; required for wrong) under every AI output:
  Suggest a focus (plan with drills), weekly trend, meta from text, meta brief, pre-match brief, day summary,
  every Brainstorm reply.
- **Edits are kept:** when a coach changes the AI's key points before approving, or the AI's drills before adding
  a session, the hub keeps the before / after (rating "edited").
- **Admin → AI feedback from the staff:** per feature: useful / not useful / wrong / edited, useful share (marked
  "few" under 10 ratings) and the latest reasons.
- Stored with the scouting notes (kind `ai_feedback`): no new table. After WEC this becomes each title's team
  preferences (approved by the Head Coach, then sent to the AI as PREFS — the AI function already accepts them for
  Brainstorm) and a monthly AI quality review.

## AI cost (estimate, Sonnet 5.5)
| Action | Calls | Per call | Typical |
|---|---|---|---|
| prematch | ~5 / day at WEC | ~$0.03 | ~$0.15 / day |
| scout_day | ~7 / day at WEC | ~$0.03 | ~$0.20 / day |
| brainstorm | ~20 messages / title / day at most | ~$0.01–0.02 (material cached) | ≤ $3 / day across titles |
Within the existing caps (300 calls per person, 600 for the staff, per day).

## Tests
- `tests/ai_v127.test.js`: grounding (ids and numbers), feedback rules and stats, edits only when changed, scouting
  AI material and day summaries feeding the brief, Brainstorm material and reply checks, AI function routing (history
  capped at 8, material in the cached system prompt).
- `tests/web/ai_v127_web.test.js` (website, fake AI): Brainstorm reply grounded, unverified number flagged, bad
  suggestion left out, proposal sent for review, feedback saved; AI pre-match draft fills the key points and leaves
  out lines with an unknown number or source.

## Check by hand (staff)
1. Brainstorm in MLBB: "What should tomorrow focus on?" — are the cited records the right ones? Turn one idea into a session plan.
2. Live scouting during a streamed match: log 10 observations, Draft with AI, edit, approve, copy.
3. Mark a few AI outputs useful / wrong with a reason; check Admin → AI feedback.

## Still TBD
- Team preferences per title from the feedback (after WEC; Head Coach approves).
- Storing Brainstorm sessions (needs a table; after WEC if wanted) and who may read them.
- Venue scouting roles and how briefs reach players (head coaches).
