# Hub V1.29 — scrim report in about a minute (18 Nov 2026)

Goal: fewer taps and less typing for coaches and analysts filing a scrim report. Website only: no database or AI
function change. Going live = merge to `main`.

## Start from the plan
- **Catat hasil (laporan scrim)** on every planned session that is due (Scrims & practice) and **Catat hasil** next to
  it on Today. It opens the title's report with partner, format, partner level, focus and the session's drills already
  filled, and the report closes that planned session when saved.
- Opening Scrim reports directly with exactly one session planned today (and nothing typed yet) starts from that
  session too ("Diisi dari rencana hari ini: vs …").

## Three steps instead of one long form
1. **Hasil** — date, partner (quick picks), screenshots for MLBB / Dota 2, score chips; PUBG Mobile gets
   "matches played" chips (4 / 5 / 6 / 8) so only the points are typed.
2. **Jalannya sesi** — the voice / free-text note ("Cukup sekali", AI fills the boxes) comes first; then focus,
   "did we fix it?", what worked / failed, **one-tap weakness words** for "what failed" (the title's own labels, so
   the Weaknesses tab gets cleaner input), the adjustment and the planned drills.
3. **Cek dan simpan** — the plan rating (one tap), optional details, and a **Save bar that stays on screen** with a
   live line: "4 dari 6 selesai — masih perlu: penyesuaian, nilai rencana".

Unchanged: the rules (performance notes only, saved reports are fixed, corrections appended), drafts kept on the
device, "copy setup from last report", setup kept after saving for the next partner.

## Small fix
- An untouched report box now takes its new value when the page redraws (before, an empty box could stay empty
  after the plan had loaded).
- `tests/web/coach_ai_web.test.js` waits for a complete test build (it could read a half-written file when the
  whole suite ran in parallel).

## Tests
- `tests/web/web_ui.test.js`: planned session → Catat hasil → set-up form → live "still needed" line → weakness
  word → save → planned session closed; auto-start from today's only plan.
- `tests/i18n.test.js`: the new lines in Bahasa Indonesia.
- Full suite: 282 tests, 247 pass, 0 fail, 35 skipped (database); Donny 105 pass.

## Next (not built)
- One entry for several partners in an evening (one row per partner, shared story).
- "Catat cepat sekarang, lengkapi nanti" (needs an "unfinished" report state that trends and dashboards skip).
