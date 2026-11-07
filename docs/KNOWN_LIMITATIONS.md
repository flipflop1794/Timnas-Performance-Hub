# Known limitations and post-launch backlog (V1.12, + V1.13 AI capture)

## Limitations at launch
1. **Not yet run against the live Supabase project or Vercel** from the build environment: their APIs are outside its network.
   The access rules are tested on Postgres 16 with a Supabase stand-in, and the website flows on a fake backend.
   The release checklist in DEPLOY.md §6 is the first real end-to-end run.
2. ~~Last write wins~~ — fixed in V1.12: a save based on an outdated copy is refused with the name and time of the other change.
   Remaining edge: a device that has not yet loaded a collection falls back to a plain save (does not happen in the app's normal flow).
3. **Realtime refresh reloads the whole table** that changed. Fine at this size (hundreds of rows); revisit past ~5,000 rows per table.
4. **Email**: Supabase's built-in sender allows only a few emails per hour (invites, password resets). Custom SMTP fixes this.
5. **Free tiers**: Supabase Free pauses after ~7 days idle; Vercel Hobby is for non-commercial use (see DEPLOY.md).
6. **OpenDota refresh** now calls the OpenDota API directly from the browser; if OpenDota blocks it, use the file / paste route.
7. **Athlete readiness** remains the V1.7 preview with placeholder athletes (no real data, by design).
8. Drafts (half-typed reports) are kept per device and are not synced.
9. ~~Unassigned title tabs visible to title coaches~~ — fixed in V1.12: they see only their games (a direct link still shows the notice).
10. The Claude artifact remains online; it does not share data with the website.

## V1.13 AI capture (branch feature/ai-scrim-capture, not deployed)
11. **Hero portraits are the weak field.** On six real MLBB result screens, 13 of 60 heroes could be read with certainty
    (12 right); the rest are left for the coach with suggestions. Coaches will pick about 4 of 5 heroes per game by
    hand until a draft screenshot is added. A hero filled as "sure" can still be wrong (1 in 13 in the test): the
    coach must look. The real model's accuracy is unmeasured: run `tools/eval_screenshots.mjs` on 20+ pelatnas screenshots.
12. **Dota match ID** is stored with the game but not used yet; whether lobby games can be pulled from a match API is untested.
13. **Screenshot retention (90 days)** is a policy, not automated: delete old files in Supabase Storage by hand or add a
    scheduled job. Storage policies were not tested locally (the test database has no Storage).
14. **Supabase Free storage is 1 GB**: about a month of compressed screenshots at ~18 games a day.
15. **Patterns need volume**: under 5 games per split every number is labelled an early sign; problems on such splits are refused.
16. Half-checked games are kept per device (like report drafts), not synced.

## Backlog (in order)
1. Custom SMTP sender for invites and resets.
2. Invite people from the admin page (needs a small Supabase Edge Function with the service key kept server-side).
3. Coach Donny's readiness system: API provider or embed (docs/READINESS_INTEGRATION.md).
4. Restore drill: restore last night's backup into a scratch project once, and time it.
5. Decide wellbeing visibility (Head Coach) and widen the rule if agreed.

17. Balance review (7 Nov 2026) re-checked the engines' statistics; it did not re-validate the thresholds themselves (rule-of-thumb load ratio 1.5, wellness 1 SD, 5-game pattern bar) against Indonesian team data. Revisit after the first two pelatnas weeks.
18. The role-by-role website sweep was last run in Chrome for the V1.13 flows; the full 58-screen sweep this time ran on the artifact build (one role, demo data).
19. Prompt caching only helps when screenshots follow each other within 5 minutes (the cache lifetime); a lone call costs 25% more on its cached part. Check the cache share on the admin page after the first pelatnas week.
20. AI cost on the admin page uses a price table in `src/core/ai_cost.js` (Sonnet 5.5, read 7 Nov 2026); a new model or price needs that file updated.
21. Rival rosters were last read on wec.iesf.org on 3 Nov; this workspace could not reach the site on 7 Nov.
