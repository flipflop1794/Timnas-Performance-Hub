# Hub V1.39 — MLBB hero list checked, hero avatars readable (21 Nov 2026)

Groundwork for reading MLBB scrim screenshots the Scrim Log way (two screenshots per game, read on the
device). Branch `feature/mlbb-scrim-log`. Nothing changes on screen yet: the avatar reader is wired in
when the screenshot reading (crop positions of the result screen and the Data tab) moves over from the
Scrim Log.

## Hero list
- `data/mlbb/heroes.json`: checked on 21 Nov 2026 against the official list on mobilelegends.com/rank
  (Original Server): the same 133 heroes, same spelling. Dori is on the Advance Server only (since Aug 2026)
  and is not in the list yet; add her when she is released.

## Hero avatars
- `data/mlbb/hero_icons.json`: one 96-byte reference per hero, read from the official 128 px icons on
  mobilelegends.com/rank, plus the icon file name. The icons themselves are not stored in the repo.
- `src/core/hero_icons.js`:
  - `readHero(crop, refs)` takes a crop of one portrait (canvas ImageData) and returns the hero when it is
    sure, else the three closest heroes as suggestions. `allow` limits the heroes (e.g. not banned).
  - `learnFrom(crop, hero)` keeps a confirmed crop as an extra reference, so a skin is read next time.
  - `referenceSet(iconData, learned)` builds the references (official + learned).
- The bundle ships the references as `DATA.mlbbHeroIcons` (about 17 KB).

### How it was checked
On the 133 official icons, in the browser, after: scaling to 44–60 px; a 3–4 px gold frame; a darker,
higher-contrast screenshot; loose crops with the portrait off-centre by 2–4 px. The right hero came first
in every case (133 of 133 each). With the thresholds used (closest ≤ 8 and runner-up ≥ 1.4 × farther),
none of the 133 flipped-and-recoloured or shifted portraits was filled in as sure. Tests:
`tests/hero_icons.test.js` (same code as the browser, checked value for value).

### Not covered yet
- Skins: a skin portrait differs from the official icon, so it comes back as suggestions until a coach
  confirms it once (then it is learned). Where learned crops are stored (table and RLS) is decided with
  the screenshot reading.
- Real screenshots have not been tried yet: the crop positions on the result screen and the Data tab
  come with the Scrim Log reading.

## Game screen changes (MLBB and MLBB Women)
- **Pick order is fixed by the rows:** the top row of each team is P1, then P2 … P5 (the result screen lists
  players in pick order). The pick-number boxes are gone; the column shows P1–P5. A number sent with a row
  is ignored, so two heroes can no longer share a pick number.
- **Side** shows just **FP** and **SP**.
- **Map** offers the four maps in use: Flying Clouds, Golden Turret, Healing Turtle, Revealing Wisps. A saved
  game with an older map (Default Map, Broken Walls, Dangerous Grass, Expanding River) keeps it, also when
  it is fixed.
- **Duration:** type the digits only; the box puts the colon in (`2040` → `20:40`, `905` → `9:05`). Three or
  four digits are always read as minutes and seconds (all titles); one or two digits are still minutes.
- **Players per division:** MLBB Women now has its roster (Cinnyyy, Chel, Fumi Eko, Vival, Vivian) in the
  hub's defaults and in a new migration (`20261203120000_mlbb_women_roster.sql`, insert only, rows already
  entered stay), so the "Our player" choices are filled for both MLBB divisions.
- **Hero suggestions** on the game screen (bans and picks, ours and theirs) list all 133 heroes of the
  checked official list.

## Put it live
- Merge to `main` and run the new migration on Supabase (`supabase db push`, or paste the file into the
  SQL editor). Nothing else changes in the database.

## Players typed, no doubles (MLBB and MLBB Women)
- A new game starts with the **player boxes empty**. The coach types each player; the division's roster
  (and "stand-in") is offered as suggestions, and a name in any case is matched to the roster's spelling.
  A name that is not on the roster is refused. (Screenshot-read games still fill the players they read.)
- **No doubles:** a hero entered twice anywhere in the game (our bans, their bans, our picks, their picks)
  or a player on two rows is marked red at once, with a line saying what is doubled; confirming refuses it.
  "stand-in" may be used on more than one row.
