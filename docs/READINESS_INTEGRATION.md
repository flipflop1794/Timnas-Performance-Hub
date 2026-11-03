# Athlete Readiness — integration guide (for Coach Donny's system)

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
