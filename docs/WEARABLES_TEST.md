# WHOOP and Garmin — test branch `test/wearables`

Real connections for Coach Donny's readiness system. Not live: this branch only.

## How it works
1. **Coach Donny** opens his system in the hub → **Integrasi**. The yellow card "WHOOP & Garmin — koneksi nyata
   (uji coba)" lists every athlete. **Buat link WHOOP / Buat link Garmin** makes a personal link (copied; send it by
   WhatsApp). One use, valid 14 days.
2. **The athlete** opens the link (no hub account needed), reads what is shared and who sees it, ticks consent,
   and logs in on **WHOOP's or Garmin's own page**. The hub never sees the password.
3. **Data arrives by itself:**
   - WHOOP sends a signed notification when a sleep / recovery / workout is ready; the server fetches the last
     3 days. "Sinkron WHOOP sekarang" fetches the last 7 days for everyone.
   - Garmin sends each summary (dailies, sleep, HRV, pulse ox, breathing, body composition, blood pressure, stress /
     Body Battery) to the notification address, either with the data (push) or a link to fetch it (ping).
4. **Into his system:** when the Integrasi page opens, new days go through his own `terimaDataWearable()`. His
   consent check applies: without the athlete's **Data wearable** consent the day is refused (and listed).
   Garmin values win where both send one; WHOOP fills the rest. WHOOP-only numbers (recovery %, strain, skin
   temperature) are kept in the hub's table (`extra`) for later.
5. **Disconnect:** "Putuskan" (staff), or the athlete removes the hub in the WHOOP / Garmin Connect app (Garmin
   tells the hub; WHOOP keys stop working).

Who can read: Coach Donny (readiness owner) and admins only, like all wellbeing data. Access keys sit in a table no
signed-in user can read; only the server function uses them.

## Setup (Coach Donny or an admin; secrets are pasted by you, never written in code)
**Database:** `supabase/migrations/20261205120000_wearables.sql` (5 new tables; nothing existing changes).

**Server function:** `supabase/functions/wearables` (+ `_shared/wearables*.js`), deployed with **Verify JWT off**.
Secrets (Supabase → Edge Functions → Secrets): `WHOOP_CLIENT_ID`, `WHOOP_CLIENT_SECRET`, `GARMIN_CLIENT_ID`,
`GARMIN_CLIENT_SECRET`, `GARMIN_WEBHOOK_KEY` (any long random text), `HUB_URL` (the test site address),
`FUNCTION_URL` = `https://<project>.supabase.co/functions/v1/wearables`, optional `SYNC_KEY` for a daily job.

**WHOOP developer dashboard** (developer-dashboard.whoop.com, needs a WHOOP account) → create an app:
- Redirect URL: `https://<project>.supabase.co/functions/v1/wearables/callback/whoop`
- Webhook URL (model version v2): `https://<project>.supabase.co/functions/v1/wearables/webhook/whoop`
- Scopes: offline, read:recovery, read:cycles, read:sleep, read:workout, read:profile, read:body_measurement

**Garmin Connect Developer Program** (once approved) → Health API app:
- OAuth 2.0 redirect: `https://<project>.supabase.co/functions/v1/wearables/callback/garmin`
- Notification (push) addresses, one per summary type and the deregistration / permission change addresses:
  `https://<project>.supabase.co/functions/v1/wearables/webhook/garmin/<GARMIN_WEBHOOK_KEY>`
- **Check against Garmin's documentation at approval:** login and token addresses, the user-id address, and field
  names (marked "Garmin: confirm" in `_shared/wearables.js`). Garmin's docs are only given to approved partners.

## Tests
`tests/wearables.test.js` (simulated WHOOP and Garmin servers: login, signed notifications, push and ping, renewal
of expired keys, disconnect, staff-only actions) and `tests/wearables_import.test.js` (Coach Donny's real system:
consent decides, Garmin first, no rewrites).
