# Hub V1.41 — safer and simpler (21 Nov 2026)

Improvement 1 of 5 in the pre-WEC plan. No new features: it tightens the database and trims the menu. It ships
together with V1.40 (`docs/HUB_V1_40.md`) and V1.42 (`docs/HUB_V1_42.md`).

## Put it live (V1.40–V1.42 together)
1. **Database:** run `supabase/RUN_ON_LIVE_V1_41.sql` once in Supabase → SQL Editor. It is safe to run twice.
2. **Leaked passwords (owner, one switch):** Supabase → Authentication → Sign In / Providers → Email → turn on
   "Prevent use of leaked passwords". This is a security setting, so the owner changes it, not the Hub.
3. **AI function:** redeploy `scrim-ai` (V1.40 prompt version `scrim-ai-2026-12-03.1`) via GitHub → Actions →
   Go-live, step 2.
4. **Website:** merge to `main`.
5. **Check:** Supabase → Advisors → Security should no longer list "Public can execute SECURITY DEFINER function" or
   "Function search path mutable".

## Database: closed to visitors who are not signed in
- **The finding:** the Supabase security advisor (21 Nov) found 5 functions that anyone with the public site key
  could call without signing in:
  - `can_support_read`
  - `can_support_write`
  - `log_edit`
  - `support_summary`
  - `title_from_slug`
- **Risk:** none of them returned data to a visitor, because each one checks who is signed in. The support summary,
  for example, returns nothing without a staff account. Still, none of them should be callable.
- **Cause:** Supabase gives visitors rights on every new function and table by default. Earlier versions closed each
  new table by hand, but these 5 functions (V1.30–V1.36) were missed.
- **Fix:**
  - Visitor access is revoked on the 5 functions. Signed-in users keep it, because the access rules use these
    functions.
  - The default is changed: new functions, tables and sequences now start closed to visitors.
  - `block_update` and `jsonb_prefix` get a fixed search_path (a second advisor warning).
- **Not changed:** the advisor also lists 31 functions that signed-in users can call. That is intended. The access
  rules call the role checks, and each role check looks at the signed-in user. The others are database triggers,
  which refuse to run when called directly.

## Menu: screens with no entries yet fold behind "More"
- On the live site after the camp's first week, these screens had no entries at all, so focus mode now hides them:
  - Draft rooms (Dota 2, MLBB, MLBB Women)
  - Player plans
  - Camp schedule & attendance
  - Camp availability
- This adds to the screens focus mode already hid (Juara Umum board, Is it working?, Between games, Dota
  post-match and series review, PUBGM strategy sim).
- **A tab bar with hidden screens now ends in "More · n"** ("Lainnya · n" in Bahasa). One tap shows every tool, the
  same as the existing "Show all tools" button.
- Nothing is deleted. A hidden screen opened by link still works and shows its own tab.
- Focus mode applies to the website only. The offline file shows everything, as before.
- Coaches already see only their assigned games (since V1.12).

## Version
`package.json` is now 1.42.0 (V1.40–V1.42 ship together), so the header shows V1.42.

## Tests
- `tests/v141.test.js`: the migration and the one-paste file match.
- `tests/web/focus_web.test.js`: a Dota coach's menu, "More", the Bahasa label, and opening a folded screen by link.
- 323 tests: 288 pass, 0 fail, 35 skipped (database tests that need a local Postgres, as before). Typecheck is clean.
- The SQL was not run against a test Postgres here. It uses only standard statements; the advisor check after step 1
  confirms it on the live site.
