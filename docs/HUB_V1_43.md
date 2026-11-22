# Hub V1.43 — "lower is better" verdicts fixed (23 Nov 2026)

Found in the balance review of 23 Nov.

## The bug
For a measure where a lower number is better, the before/after verdict called almost every comparison a change.
These measures were affected:
- deaths
- average placement
- goals conceded
- out before zone 3
- repeated mistakes

The verdict checked the wrong side of the 95% interval (`dir * lo > 0`, which for "lower is better" means `lo < 0`,
true for nearly any interval).

In 2,000 simulated before/after comparisons with no real change in them:

| Kind of measure | Called "better" or "worse" | Expected |
|---|---|---|
| Higher is better | 5% | about 5% |
| Lower is better | **100%** | about 5% |

Real, large changes still pointed the right way, so the harm was mostly false "better" or "worse" labels where
there was no clear change.

## Where it showed
- Analysis → trends:
  - Average placement (reports and match log)
  - Goals conceded per match
  - Out before zone 3
  - Per-player deaths
- Staff → "Is it working?": PUBGM "Out before zone 3".
- The AI's summary of the results trend reads the same verdict.

The trends only give a verdict with at least 6 values on each side, so few titles had reached one yet.

## The fix
`src/core/measure.js`:
- A change is clear only when the whole interval is on one side of zero.
- "Better" or "worse" then follows from that side and from the measure's direction.

## Tests
- `tests/balance.test.js`, new test:
  - On random data with no real change, "lower is better" and "higher is better" give a verdict equally often,
    and under 10% of the time.
  - Real drops and rises keep their direction.
  - The test fails on the old code.
- `tests/trends.test.js`: the PUBGM placement test used windows with no spread at all (every match 12, then
  every match 4). By the 7 Nov rule, the Hub makes no claim on zero spread; the old bug hid that. The test data
  now has a realistic spread (12–14, then 3–5) and still checks "better".
- 337 tests: 302 pass, 0 fail, 35 skipped (database tests), in Jakarta and UTC time.

## Put it live
Merge to `main`. No database or AI change.
