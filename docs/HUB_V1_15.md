# Timnas Performance Hub V1.15 — Coach Donny's readiness system inside the hub

Status: branch `feature/ai-scrim-capture` (V1.13 + V1.14 + V1.15). **Not pushed, not deployed.** Live site: V1.12.
Decision (Aufa, 8 Nov 2026): integrate Coach Donny's code inside the hub; Donny agreed; staff only for now.

## What changes for staff

**Performance → Athlete readiness** opens on *Coach Donny's system*: his own screens, running in the hub.
- Team board, athletes, notes and follow-ups, inbox, session scheduling, score settings, team members, audit
  log, Garmin page: exactly his screens (Bahasa Indonesia), with his rules (formula v1.1, red < 35, amber < 45).
- **Signed in with the hub account.** No separate password. The hub finds you in his team list (Aufa → Aufa
  Bassam, Donny → Dr. Donny Ardy Kusuma, Fayad → Muslih Wahyudi Rahman, others by first name). Admins can
  *View as* another staff member. Someone not in his list sees a short note instead.
- **Saved.** Everything is stored in the hub database (`readiness_store`), so it survives reloads and appears
  on other devices. Who may see it: readiness owner (Donny) and admins, like wellbeing data, until the Head
  Coach decides otherwise. Every change is in the hub audit log under the hub user who made it.
- **Staff only.** Athletes have no hub accounts. *Enter for an athlete (staff entry)* opens that athlete's own
  screens (check-in, session RPE, reports, trend) so staff fill them in; a yellow bar says it is a staff entry.
  His rule stays: check-ins count only after the Super admin records the athlete's data consent (as BTN chair
  / team manager in his list, via *View as*).
- **Starts with his team structure, no scores.** The first time it opens, the hub saves his clean structure
  (BTN, management, coaching staff, coach and athletes per title: 30 athletes). His sample data appears only
  in the hub's Demo sandbox, and is not saved.
- **Hub view** tab: the hub's readiness board now reads his scores (no dummy athletes). If his data cannot be
  read, it falls back to the dummy preview with a warning.

## How it is built

| Part | File | Notes |
|---|---|---|
| His code, unchanged | `vendor/donny-monitoring/` | `main` @ 56d88c2 (6 Nov 2026). Provenance and update steps: `UPSTREAM.md`. His 105 tests run in `npm test` |
| Storage in the hub database | `src/readiness/donny/store.ts` | His storage interface kept; every change written through to `readiness_store`, one row per record; list items (audit, notifications, replies) one row each so two devices never overwrite each other; ids unique per device; Garmin secrets never stored; removed records kept as marker rows |
| Hub shell around his screens | `src/readiness/donny/mount.tsx` | Hub sign-in → his staff member, admin *View as*, staff entry for athletes, his styles isolated in a shadow root |
| Hub board fed from his service | `src/readiness/donny/source.ts`, `src/readiness/donnyProvider.js` | Read-only |
| Database | `supabase/migrations/20261113120000_readiness_store.sql` | Wellbeing rules (readiness owner + admins), audited, realtime |
| Build | `tools/build.mjs` | React 18 and his TypeScript bundled into the hub (website script grows by about 150 KB) |

The GitHub Pages frame from V1.14 is gone (and the website no longer allows outside frames).

## Tests

`npm test`: **175 pass** + his **105**. New: storage bridge (unique ids, rows, list merge from two devices,
marker rows, no secrets), database rules (only Donny and admins; hub user recorded; demo refused), website
with real accounts (Donny's sign-in, saved once, loaded on Aufa's device, title coach kept out), page tests.
Checked in Chrome at 1280 px and 412 px: no sideways scrolling, no errors. All 58 hub screens swept.

## Not done yet
- Athlete accounts (deliberately: staff only for now).
- His audit log names the athlete for a staff entry; the hub's audit log names the staff member.
- Two people changing the *same* record at the same moment: the later save wins (separate records and list
  items are safe).
- The hub's own interim wellbeing check-in (Performance → Wellbeing check / Log) still exists; retire it once
  Donny confirms his check-in replaces it.
