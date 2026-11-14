# Hub V1.23 — Keeping existing features current (14 Nov 2026)

Improvements to existing features only. Website only: no database change.

| Area | What changed |
|---|---|
| **Public results, editable in the hub** | Each title's Competitors tab has **Add, correct or retire a public result**. Every result line has **Correct** (fills the form; keep event and date to replace it) and **Retire** (hide it, with a reason). Staff lines show "entered by". Stored with the scouting notes (same title rules), marked as results, so they never count as scouting notes, coverage or "Scout next". Opponent cards, nation profiles and the Recent results panel use the corrected list. |
| **Today: less noise** | The 13 Nov re-read of the WEC team pages is now recorded as a dated "no change" check for the 32 unchanged MLBB, MLBB Women, Dota 2 and PUBG Mobile rosters, so their weekly check is due again from 20 Nov, not all at once. CS2 rosters were not re-read and stay due. Due checks are grouped per title ("CS2: 11 · CS2 W: 11"). |
| **Guide matches the buttons** | In Bahasa Indonesia, the Guide quotes the same Indonesian button names the screen shows (e.g. "Salin pengaturan dari laporan terakhir"). 15 more buttons were translated (Suggest a focus, Save attendance, Copy message, Scout next…). |
| **Steadier tests** | The AI website tests wait until the AI buttons appear (up to 3 s) instead of a fixed 120 ms; they failed under a full run on a slower machine. |

Tests: `npm test` 219 pass, 0 fail (35 database tests skipped locally; CI runs them); Coach Donny's suite 105 pass;
typecheck and build OK. New tests in `tests/competitor_form.test.js`.

Not deployed: V1.22 (Bahasa sweep) and V1.23 are on the local `release/v1.21` branch, uncommitted.
