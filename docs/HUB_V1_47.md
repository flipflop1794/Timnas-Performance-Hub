# Hub V1.47 — one workspace per category: MLBB Men first (23 Nov 2026)

The owner approved the category-workspace plan on 23 Nov ("Approve, start MLBB"). MLBB Men is the template. It
ships together with V1.46 (`docs/HUB_V1_46.md`), whose short coach menu it replaces.

## The workspace (MLBB Men's title coach)
- **Five tabs, nothing from other games:**

  | Tab | Opens | Inside |
  |---|---|---|
  | **My team** (the landing page) | Scrim reports | A small sub-menu: Scrim reports · Trends · Roster; the support staff's lines for the team; "What repeats" |
  | **Opponents** | The opponent page | Only this category's opponents |
  | **Meta** | | The official MLBB snapshot, then the tracker |
  | **Ask AI** | | One box for any question |
  | **Match prep** | The match-day runbook | Starts on MLBB |

- "More" (top bar) shows the full hub; "Short menu" returns. No title picker on Opponents: the coach has one category.
- Other categories keep the full menu until their workspace switches on. To add one: `WORKSPACE_TITLES` in
  `src/core/workspace.js`.

## Opponents: the category's own list
- Starts from the official WEC entry list for that category. MLBB Men: 7 nations. MLBB Women: 3.
- **"Edit the opponent list"** (folded under the selector):
  - hide a team you will not meet
  - add one worth studying (a scrim partner, a club)
  - show a hidden one again; remove an added one
- Each change is a dated record kept with the scouting notes (kind "field"), so **no database change**.
- An added opponent gets a page with its own notes.

## Ask AI (replaces Brainstorm's purpose menu)
- One box. **Starter questions per game** fill it with one tap, each naming a real opponent:
  - MLBB: "What should we ban against Malaysia?", "Which of our heroes get banned most in scrims?", "What keeps failing
    in the last 2 weeks…", "Which meta heroes do we not have covered?", "Plan three scrim sessions…"
  - Starters for Dota 2, CS2, PUBG Mobile and eFootball are written and switch on with their workspaces.
- **What it always knows, without the coach typing it** (each item with an id the answer must cite):
  - category, our squad and coach, the opponent list, the event and today's date, WEC matches entered
  - the meta tracker and, for MLBB, the official snapshot
  - the title's practice records (reports, what repeats, partners), as before
- **The opponent comes from the question:**
  - naming one ("Malaysia", "Turkey", "Turki") adds that opponent's brief and, for MLBB, the draft plan
  - no opponent named: practice material only
- **Screenshots:** a result or draft screen is read first by the hub's existing reader, then goes with the question.
  The AI answers from what was read, not from the image.
- **"Save to Malaysia's profile":** keeps an answer on the opponent page as an unconfirmed note ("Ask AI, date, from
  W2, R1; saved by …").
- As before: every number must come from the records, uncited numbers are flagged, and the AI says so when the
  records do not hold the answer.
- **No change to the AI function itself:** the current server version is used as is. The function still calls the
  session a "brainstorm" internally.

## Meta: the official MLBB data
- **No public MLBB API exists** (checked 23 Nov).
- **The official page** mobilelegends.com/rank shows win, pick and ban rates from ranked play. Shipped as a dated
  snapshot (`src/core/meta_live.js`):
  - read 23 Nov 2026
  - "Past 1 day", all ranks, the 20 heroes the page lists, sorted by win rate (page updated 23-11-2026 04:25)
- **"Strong right now (official)":** the table, "Banned most" (30% or more), and how often each hero appears in our
  confirmed scrim games.
- **"Ideas to test in scrims":** strong heroes none of our scrim games used yet, with "often banned: test it as a first
  pick or plan a counter". A question for the coach, not a recommendation.
- Labelled as ranked play, not pro play. MLBB Women sees the same snapshot with "the women's pro scene may differ".
- **Refresh:** read the page weekly and update `MLBB_RANK`.

## Not in this version
- Workspaces for the other six categories (next, one by one).
- Video in Ask AI (after WEC, as approved).
- A full hero list from the official page: only the top 20 by win rate could be read reliably.

## Tests
- `tests/v147.test.js` (new).
- `tests/web/coach_menu_web.test.js`, rewritten for the five tabs, with an Ask AI test using a stand-in AI.

## Put it live
Merge to `main`. No database change. No AI function change.
