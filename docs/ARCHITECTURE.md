# Architecture (V1.11 — website)

```
Browser (phone / laptop)
  index.html + assets/app-<hash>.js      ← Vercel (static, built from GitHub on every push)
     src/web/main.ts   sign-in, set password, roles, then starts the hub
     src/web/db.ts     the hub's document interface on top of Supabase (+ realtime refresh)
     src/hub/app.js    the V1.10 hub, unchanged logic (src/core, src/dota, src/pubgm, src/readiness)
        │  HTTPS (anon key + user's session token)
        ▼
Supabase
  Auth      invite-only email + password
  Postgres  tables + Row Level Security (every request is checked as the signed-in person)
  Realtime  change events → other devices refresh within ~0.3 s
```

V1.13 adds one server function, `scrim-ai` (Supabase Edge Function), for AI reading of screenshots, debrief notes
and pattern findings. It runs with the coach's own session, so the database rules below still decide everything;
the AI key is a function secret. Details: HUB_V1_13.md.

Apart from that function, there is no server code of our own: the permission rules live in the database (`supabase/migrations`),
so hiding a button is never the only protection.

## Where each record lives

| App collection | Table | Title column from | Notes |
|---|---|---|---|
| scrim_reports | scrim_reports + scrim_report_corrections | record | insert-only; corrections are separate rows |
| scrims | scrim_sessions | record | planned and completed sessions |
| cycle | coaching_objectives | record | approval guarded by trigger |
| rivals, rival_tiers, rival_rosters, vods, opp_cards | scouting_notes, rival_tiers, rival_rosters, rival_vods, opponent_cards | record | scouting |
| partners | sparring_partners | record | |
| wec_matches | wec_matches | record | match-day cards, runbook ticks, between-games notes |
| player_plans | player_plans | record | |
| pubgm_logs / dota_matches / dota_pools | same names | fixed (PUBG Mobile / Dota 2) | |
| wellbeing_checkins / wellbeing_load | wellbeing_checkins / wellbeing_loads | record | readiness owner + admin only |
| config/runbooks, config/rules | app_config | — | runbooks: HC, admin, assistant coaches; rules: HC, admin |
| config/roster | roster_players | — | via `set_roster()` |
| (people) | profiles, user_roles, user_titles | — | admin manages |
| scrim_games | scrim_games | record | V1.13; insert-only, a fix supersedes; must belong to a report of the same title |
| scrim_captures, pattern_findings, player_aliases | same names | record | V1.13 |
| (AI calls) | ai_usage | record | V1.13; own rows, admins all; daily cap |
| (history) | audit_log | — | every insert/update/delete with old and new row; admin read-only |

Each operational row: `id`, `title`, `data` (the app's record), `created_by`, `created_at`, `updated_by`, `updated_at`.
Triggers set the author and times from the session and the title from the record, so the client cannot fake them.
Rows must carry `data.origin = 'operational'`: the demo sandbox never writes.

Times are stored in UTC (`timestamptz`); the hub shows dates and "entered at" in WIB.

## Build outputs

- `npm run build` → `dist/hub.html`: the Claude-artifact version (unchanged behaviour).
- `npm run build:web` → `dist-web/`: the website (needs `SUPABASE_URL`, `SUPABASE_ANON_KEY`).
- Tests: `npm test` = core (82, from V1.10) + database rules on real Postgres + website flows (jsdom, shared fake backend).
