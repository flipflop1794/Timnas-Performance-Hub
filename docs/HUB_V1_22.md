# Hub V1.22 — Bahasa Indonesia sweep (13 Nov 2026)

V1.21 made Bahasa Indonesia the default language. This release fills the screens that still showed English.
Website only: no database change.

| Area | Now in Bahasa Indonesia |
|---|---|
| Scrim report form | All error messages (required fields, numbers, PUBG Mobile wins and placement, phone numbers in notes, corrections), download messages, the "Say it once" note. |
| Trends | Page intro, the "Better / Worse" explanation, empty states, "What the staff changed". |
| Weaknesses, Patterns | Intros, empty states, the AI findings explanation. |
| Pelatnas | Schedule and attendance, player availability (form, answers, WhatsApp message), the "dates not final" note. |
| Main dashboard, Practice quality, Weekly brief | Intros, the practice-quality explanation, empty states. |
| Tournament | Preparation packs intro and empty states. |
| PUBG Mobile log | Screenshot results section. |
| Draft Room, Scouting coverage, Readiness | Intros and empty states. |

How it was found: every screen was opened in Bahasa Indonesia for three staff profiles, and any text that still
looked English was listed. Flagged strings fell from 316 to the remaining data, which stays as written by design:
rival results and research notes, Dota match analysis, source names, player and hero names.

Not translated on purpose: rival notes and public results (sources are English), the Dota engine's match findings,
and the in-app Guide's names of buttons (they quote the English button labels a user switching to EN would see).

Tests: `tests/i18n.test.js` checks the new translations; `npm test` 216 pass, 0 fail (35 database tests skipped
locally; CI runs them); Coach Donny's suite 105 pass; build OK.
