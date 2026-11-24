# Hub V1.51 — Whoop in the hub (Coach Donny's device integration, MLBB Women first) (24 Nov 2026)

**Coach Donny's ask (WhatsApp, 23 Nov):** bring his dashboard's device integration into the hub. The athletes just
log in to Whoop, starting with MLBB Women, and the data comes in by itself.

**What was taken from his repo** (`donnyakusuma/ESPORTSINDONESIAMONITORING`):
- the Whoop connection: official Whoop login (OAuth 2.0), Whoop API v2, refresh tokens
- how a night becomes one day: the local date the main sleep ended, naps skipped, recovery and strain matched through
  the sleep's own ids
- his **Indeks Kesiapan Bermain (IKB)**, with the app's settings: a baseline of at least 2 earlier days within 28,
  bands normal ≥ 45, watch ≥ 35, low below. Checked against the worked example in his file (40.05).

**What was not taken:**
- his check-in, wellness and notes: the hub already has them
- the Garmin login: it asks for the athlete's Garmin password through an unofficial route
- the habit of saving athletes' data into a GitHub repo

## How it works
1. **Once:** Coach Donny (or an admin) opens Support staff → **Kesiapan pagi · Whoop** → "Sekali saja: aplikasi Whoop".
   - He pastes the Client ID and Client Secret of the Whoop app he already made (developer-dashboard.whoop.com).
   - He adds the Redirect URL shown there to that Whoop app.
2. **For each athlete:** "Belum terhubung" → **Salin link Whoop** → paste in WhatsApp.
   - The athlete opens it on their phone and signs in to Whoop (Whoop's own page: no password reaches the hub).
   - A page in Bahasa confirms "Whoop tersambung".
   - Each link works once, for 7 days.
3. **After that:** the last 30 days come in at once, then every 3 hours by themselves (a database job). "Tarik data
   sekarang" pulls on demand.

## Who sees what
- **Coach Donny, the Head Coach, admins:**
  - one line per athlete: a recovery ring in Whoop's colours (green 67–100, yellow 34–66, red 0–33), sleep, strain,
    HRV and the IKB tag
  - tap the line: 14 days of recovery dots, the 7-day average, RHR, SpO2, sleep performance and breathing rate
  - **Putuskan** (tap twice) revokes the access at Whoop and deletes that athlete's tokens and numbers from the hub
- **A title's coaches (MLBB Women):** in My team, one line per connected athlete with the recovery ring and sleep.
  Nothing else. Shown only when someone is connected.
- **Everyone else:** nothing. Every Whoop table is closed to the website; only the `whoop` server function opens
  them, and it checks who is asking.
- **Tokens:** encrypted (AES-GCM) before they are stored. The Client Secret is stored the same way.

## Put it live (needs the go-ahead)
1. **Database:** `supabase/migrations/20261205120000_wearables.sql`. It adds four closed tables and switches on the
   pg_cron and pg_net extensions for the 3-hourly pull.
2. **Server function `whoop`:** deployed with the platform's sign-in check off, because the athlete's phone has no hub
   account. The function checks every staff action itself.
3. **Website:** merge to `main`.
4. **Coach Donny:** the one-time setup above.

## Tests
- `tests/whoop_handler.test.js`, with a fake Whoop and a fake database:
  - invite → Whoop login → callback
  - tokens and secret sealed; 30 days pulled across pages
  - coaches get recovery and sleep only; another title's coach gets nothing
  - the cron needs its secret
  - an expired token is refreshed; a refused one asks for a new link
  - disconnect deletes; old or unknown links give a page in Bahasa
- `tests/web/whoop_web.test.js`:
  - Coach Donny: setup, ring, numbers, dots, link copied for WhatsApp, pull now
  - the MLBB Women coach: recovery and sleep only
  - no panel without the server function
- IKB against Donny's worked example.
