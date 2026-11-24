# Hub V1.55 — Visual pass: shorter menu, calmer colours, plain plurals (25 Nov 2026)

Owner's request (24 Nov): improve the overall look, and fix typos across the site. The dark theme, the fonts and the
pages themselves stay as they are: coaches already know where things are.

## 1. Top menu in one row
- **Top row:** Home, Today, the person's own titles (up to three), the title they are on, EN / ID, and **Menu**.
- **Under Menu:** the other groups (Pelatnas, Competitors, Tournament, the other titles, Performance, Guide, Staff),
  the account name, Sign out, Demo sandbox and Focus mode. Changing page closes it.
- An admin on a phone had five rows of buttons; now two short ones.
- On phones the edition line is hidden, and under 480px Home and Menu show their icon only.
- A title coach's short menu (V1.46) is unchanged apart from Sign out moving under Menu.

## 2. Red for the main action and errors only
- Links and tappable names take the text colour with an underline. They were red, so staff names in a list read
  as warnings.
- Still red: the main button of a form, the page you are on in the menu, and errors.
- The Focus mode button is neutral.

## 3. Plain plurals
- "2 session(s)" reads "2 sessions"; "1 line(s) left out" reads "1 line left out". About 45 messages.
- Done on the finished English text (`plural` in `src/hub/i18n.js`), so the Indonesian rules are untouched.

## 4. Spelling
- A scan of every text on the site found three slips: "diagnosa" (now "diagnosis"), "Respon atlet" (now "Respons
  atlet"), and "1 reports".

## 5. Phones
- Small buttons and chips are at least 40px high.

## 6. Fix to V1.54: the group copy names no one
- "Copy the week for WhatsApp" is counts only again: no athlete names and no staff names. V1.54 had added one line
  per staff member to it, and that copy goes to the group.
- The per-person list has its own button, **Copy the staff list (Head Coach team only)**, and says so after copying.
- A past week with no report from someone says "No report that week".

## Testing note
- Tests that read the offline hub (`dist/hub.html`) need `node tools/build.mjs` first (`npm test` does it; a bare
  `node --test` does not). Runs on 24 Nov after 14:10 used a stale copy; the full suite was re-run on a fresh build.

## Not in this version
- The scrim report form already folds its optional boxes under "More details (optional)"; it was not restructured.
- One date format everywhere and one tile style for numbers: not done.
- English lines that still show in Indonesian mode (for example the "screenshots were read but never confirmed"
  notice): not done.

## Put it live
- **Website only:** merge to `main`.

## Files
- `src/hub/app.js` (`renderNav`, the Menu button), `src/hub/index.html` (styles), `src/hub/i18n.js` (`plural`,
  `pluralDom`), `src/hub/capture_ui.js`
- Tests: `tests/v155.test.js`
