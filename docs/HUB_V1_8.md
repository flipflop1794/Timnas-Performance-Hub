# Timnas Performance Hub V1.8 — Bahasa Indonesia

Prepared 3 Nov 2026.

- An **EN | ID** switch in the header. The choice is remembered per viewer in their own browser and defaults to English.
- **Translated:**
  - navigation, tabs, page titles, headings, labels, buttons, table headers;
  - banners and explanations, status words, dropdown labels;
  - the match-day runbook items, the weekly brief on screen;
  - the whole athlete readiness preview, including its label: "Pratinjau — Sistem Kesiapan Atlet Coach Donny (Integrasi Mendatang)."
- **Kept as written, in English:**
  - automated Dota and PUBG analysis findings;
  - staff and competitor notes, player names, data sources;
  - form validation messages;
  - downloaded files (weekly brief .md, opponent card .md).

  A short note says so on the pages concerned. Esports terms the staff already use (scrim, draft, ban, pick, roster, VOD, check-in, wellbeing) are kept as is.
- **How it works:** `src/hub/i18n.js` translates the rendered page (exact phrases, sentence openings, and patterns with data in them). Dropdown values stay in English, so the app logic is unchanged. Add or correct a translation by editing that one file.
- 63 automated tests pass. New tests check that redraws stay stable, that dropdown values and filtering still work in Bahasa Indonesia, and that switching back to English works. Pages were checked in Bahasa Indonesia at desktop and phone width.
