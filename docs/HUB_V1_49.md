# Hub V1.48–V1.49 — MLBB Women workspace; support staff page rebuilt for phones (23 Nov 2026)

## V1.48 — MLBB Women workspace
- The MLBB Women title coach gets the same five tabs as MLBB Men (My team, Opponents, Meta, Ask AI, Match prep),
  with the women's own data:
  - **Opponents:** the 3 rivals in the women's field (Egypt, Argentina, Türkiye), never the men's.
  - **"Little public data"** shows on every rival page.
  - **Draft plan:** our own scrim drafts.
  - **Ask AI starters:** name the women's opponents ("What should we ban against Egypt?").
  - **Meta:** the official MLBB snapshot, with "the women's pro scene may differ".
- **Desk research added** (search summaries, marked "to confirm"):
  - Türkiye's Unohana (jungle) and Kujou (mid) played the Türkiye qualifier of the 2026 MLBB Women's International,
    which club FUT Esports FE won (11th at MWI).
  - Egypt's Syrinx and Nucci appear among the Egyptian players at MWI 2026 (Falcons Vega MENA reached the playoffs).
  - Argentina's Mizz played WEC25.
  - Türkiye's two roles are on the roster, flagged "confirm".
- **Switch:** `WORKSPACE_TITLES` in `src/core/workspace.js` is now `['MLBB', 'MLBB Women']`.

## V1.49 — support staff page, rebuilt for phones (owner's request: tidy, seamless, UI/UX first)
**Why:**
- Coach Donny's page stacked seven panels, two with nearly the same 7-day numbers.
- Each staff member saw the same week twice ("My week" and "My summary").
- Their daily report sat below two dashboards.
- Wide tables needed sideways scrolling on a phone.

**Support staff (the page opens on their own work):**
1. **The week as seven tiles:**
   - green = reported, dashed = today not yet, faint = days to come
   - one line underneath ("2/7 hari · 9 atlet · 1 tindak lanjut terbuka", plus pain drop for physios and session counts
     for psychologists)
   - ‹ › arrows change the week
   - tap a day to open that day's reports
2. **Today's report straight after.** The open follow-ups at its top are tidied: short dates, and Done / Add to today as
   two equal buttons on their own line.
3. **History (14 days)**, folded.
4. "My week" and "My summary" are gone: their numbers are in the one line.

**Coach Donny, Head Coach, admins (most urgent first):**
1. **To check:** athletes from the last 14 days with high pain, worse after treatment, 3+ visits or an open follow-up.
   Six shown, the rest one tap away.
2. **Today: "3 of 5 reported":** names as green (in) or dashed (not yet) chips, who missed yesterday, and "Send a
   WhatsApp reminder". Shown for the current week only.
3. **This week:**
   - three big numbers (reports, athletes, follow-ups) with the change from last week
   - one line per staff member with **7 dots** instead of a wide table
   - per role (pain drop and "better" for physio, formal / informal for psychologists) and per team
   - pain spots and "edited after saving" one tap away
   - "Copy the week for WhatsApp" (counts only)
4. **History (14 days)** and their own report form, both folded. The form opens by itself while editing.
5. "Support team progress (7 days)" is gone (it repeated block 3).

**Top bar for support-only accounts:** their page, Guide, language and Sign out. No Home, Demo sandbox or "Show all".

**Style:**
- Phone first: no wide tables, tiles and buttons at least 44 px, the same card style throughout.
- Big numbers, small labels. Colour only where it means something.
- Bahasa by default; role labels from the dictionary (Fisio putri, Psikolog putra).

**Not changed:**
- the report form (WhatsApp paste and AI fill, group session, pain map)
- who can read what
- WhatsApp copies hold counts only

**Checked:** both views rendered at 375 × 812 (phone) in Bahasa with sample data.

## Tests
- `tests/web/coach_menu_web.test.js`: the MLBB Women workspace test (own field, data label, starters, meta note).
- `tests/web/support_web.test.js`:
  - the staff strip
  - blocks in order (to check, today, this week)
  - no table on the support page
  - edit history still recorded
- `tests/v145.test.js`: the week block with dots, week arrows, the counts-only copy.

## Put it live
Merge to `main`. No database or AI change.
