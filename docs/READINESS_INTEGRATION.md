# Athlete Readiness — integration guide (for Coach Donny's system)

## Update 8 Nov 2026 (V1.14): connected

Coach Donny's system: github.com/donnyakusuma/esportsindonesiamonitoring (main @ 56d88c2, 6 Nov), published on
GitHub Pages at https://donnyakusuma.github.io/esportsindonesiamonitoring/. Stage 1 of his PRD (30 Oct): daily
check-in, sessions/sRPE, wellness and readiness score (formula v1.1, thresholds red 35 / amber 45), team board,
notes, threads and follow-ups, consent and guardians, access and audit log; an experimental Performance Index
(Garmin, p1). His 105 tests pass. It runs entirely in the browser with demo data rebuilt on each load: no
HTTP API, no stored data and no real sign-in yet (his README, "Belum dibangun").

What the hub does now:
- **Option B, live:** Performance → Athlete readiness opens on *Coach Donny's system*, his app in a frame
  (sandboxed, no referrer) with *Open in a new tab*. The website's security headers allow framing only
  `https://donnyakusuma.github.io`. Shown only to people with wellbeing access (readiness owner and admins)
  until visibility is decided.
- **Option A, ready:** `src/readiness/donnyProvider.js` translates his result shapes (`BarisPapanTim`,
  `DailyScore`, `ScoreConfig`, `Athlete.kelompok`) into the hub contract. Statuses map hijau/kuning/merah/abu_abu
  → green/amber/red/none; sleep z and session load (AU, not Garmin minutes) come from his components; his
  thresholds and formula version are shown. His seven "nomor" names map to the hub's seven titles. No score is
  computed in the hub and none of his code is copied.
- When he adds a read API, set `READINESS_SLOT.apiUrl` (contract.js): the *Hub view* tab then shows his data in
  the hub's board instead of the dummy preview. Proposed endpoints (read-only, his sign-in token):
  `GET /papan-tim?tanggal=`, `GET /tren-tim?dari=&sampai=`, `GET /konfigurasi-skor`.

Still to agree with Donny: the API above (or his own), sign-in for hub users, whether the hub's interim
wellbeing check-in is retired, and who sees readiness. His prototype's sign-in screen shows a demo admin
password; it must be replaced before real athlete data goes in.

Status (3 Nov 2026): **UI preview only.** The hub shows dummy data under the label
"Preview — Coach Donny's Athlete Readiness System (Future Integration)." It has no backend, database,
scoring logic or working check-in, and it calls no API.

## Principle
Coach Donny's system owns check-ins, readiness scoring, thresholds, alerts and athlete records.
The hub only displays them. Nothing is rebuilt or duplicated in the hub.

## Where things live
| File | Role | Changes at integration? |
|---|---|---|
| `src/readiness/contract.js` | Data shapes (`TeamDay`, `AthleteDay`, `TrendPoint`, `Alert`, `ReadinessProvider`), `READINESS_SLOT`, `loadReadiness()` | Only `READINESS_SLOT` |
| `src/readiness/mockProvider.js` | Dummy provider for the preview (invented "Athlete N" names; not a scoring method) | Removed, or kept for demos |
| `src/readiness/view.js` | Rendering only, in the Timnas Hub design system | No |
| `src/hub/app.js` (`V.readiness`, `READINESS_PROVIDERS`) | Wires the view into Performance → Athlete readiness | One line: register the new provider |

## Option A — API provider (best fit if Donny's system has an API)
Add `src/readiness/donnyProvider.js` implementing `ReadinessProvider`:
- `getTeamDay({ title, date })` → `TeamDay`: athletes listed most-in-need first, with `status` decided by his system, plus his thresholds and scale.
- `getTrend({ title, date, days })` → `TrendPoint[]`.
- `getAlerts({ title, date })` → `Alert[]`.

Register it in `READINESS_PROVIDERS` and set `READINESS_SLOT.use = 'donny'`. To be agreed with Donny:
- Endpoint URLs and authentication.
- Group names that map to the hub's seven titles.
- Field names, or a small mapping layer inside the provider.
- How "All titles" is served.

## Option B — embedded dashboard (if his system is a web app without an API)
Set `READINESS_SLOT = { use: 'embed', embedUrl: '<his URL>' }` and add a small embed branch in `V.readiness` (not built yet).
This needs his app to allow framing from the hub's origin, and his own sign-in. The hub's preview view would then be retired.

## Decisions needed (owner)
- API or embed, depending on how his system is built (Donny).
- Who can see readiness data (Donny only, or Donny + Head Coach). The same question is open for the hub's wellbeing records (Fayad / Donny).
- Whether the hub's interim wellbeing check-in (Performance → Wellbeing check / Log) is retired once his system is live, so athletes check in only once (Donny).
- Athlete consent and data location for his system. Consent is recorded for the hub's wellbeing module (3 Nov); confirm it covers his system too (Donny).
