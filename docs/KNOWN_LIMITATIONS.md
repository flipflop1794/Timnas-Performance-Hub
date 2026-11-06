# Known limitations and post-launch backlog (V1.11)

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

## Backlog (in order)
1. Custom SMTP sender for invites and resets.
2. Invite people from the admin page (needs a small Supabase Edge Function with the service key kept server-side).
4. Coach Donny's readiness system: API provider or embed (docs/READINESS_INTEGRATION.md).
5. Restore drill: restore last night's backup into a scratch project once, and time it.
6. Decide wellbeing visibility (Head Coach) and widen the rule if agreed.
