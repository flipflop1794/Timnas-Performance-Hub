# Timnas Performance Hub V1 — audit, research, architecture, validation, limits

Prepared 3 Nov 2026 (Asst. Head Coach workstream, IESF WEC 2026). Confirmed facts, assumptions and pending items are labelled.

## Phase 1 — Audit of the MLBB Draft Lab

**What could be audited.** The Draft Lab source code lives in a separate workspace that this session could not open (no repo or folder connected). The audit therefore used the published artifacts and the project's own write-ups: "Draft Lab MLBB: progress to date" (25 Oct), the Draft Lab Pelatnas edition, and the Draft LAB Pro demo. A code-level review of the engine is still open (V2 item 1).

| Draft Lab component | Reused in the hub? | Why |
|---|---|---|
| Evidence discipline: pre-registered experiments, frozen forward tests, struck-through corrections | **Yes — as a principle** | Measurement framework and Coach C follow it |
| "Presence over win rate" (S18 hero win rates vary no more than chance, p = 0.65) | **Yes** | Dota proficiency shrinks win rates hard; ban plans rank by presence |
| Confidence labels High / Medium / Low / Blocked by sample size | **Yes** | `core/evidence.js` |
| National-edition layout (Brief, Squad, Draft profile, Drills, Field, Opponents, Audit) and visual family | **Yes** | Hub shell uses the same family |
| Opponent dossier + roster-to-account matching workflow | **Yes — re-implemented for Dota** | `dota/scout.js` |
| Draft engine weights, hero ratings, role layer, learned forecast | **No** | MLBB-specific; Dota rebuilt from scratch |
| Coach A / B / C personas | **Not found** in the reachable Draft Lab material (E1's "model C" is an engine variant). The three coaches were implemented from the mission brief. | — |
| Replay / series analysis | MLBB has VOD tagging, not replay parsing; Dota uses OpenDota's parsed replays instead | — |

MLBB module status: unchanged (v19 production, byte-identical; E1 blind review and E3 playoff test pending).

## Phase 2 — Research findings (3 Nov 2026)

| Topic | Finding | Status |
|---|---|---|
| WEC 2026 Dota 2 field | 12 nations: Indonesia, Greece, South Africa, Egypt, Venezuela, Argentina, Kazakhstan, Mongolia, Iran, Belarus, North Macedonia, New Zealand | Verified (wec.iesf.org) |
| WEC 2026 PUBGM field | 16 nations incl. Indonesia, Türkiye, Egypt, Malaysia, Myanmar, Mongolia… | Verified |
| Indonesia Dota 2 roster | Whitemon (C), Fbz, Jhocam, jikroy, Mikoto; coach Gregorius Arvindra Prasetyo | Verified; OpenDota accounts matched 5/5 (name + country ID) |
| Indonesia PUBGM roster | AKxSatarrrGOLD (C), AKxAmetzGOLD, AKxVinzGOLD, AKxZaoo7GOLD; coach Christie Onibala | Verified |
| Format, draft rules, patch, PUBGM scoring at WEC | Not published | **Blocked** — owner PB ESI intl. relations |
| Dota patch | OpenDota: 7.41 (24 Mar 2026). Liquipedia lists 7.41d (4 Jun); a news item mentions 7.41e before TI 2026 | Conflict on the letter patch |
| CM draft order | 24 steps (14 bans, 10 picks), observed identical in 2 tournament drafts | Observed |
| OpenDota access | Free tier, no key, rate-limited; attribution expected. Not reachable from the cloud workspace; reached through the Claude desktop browser pane | Works in the desktop app |
| STRATZ | Not used (needs an API token; licensing to confirm) | V2 |
| PUBGM per-match data | No public API or export for national-team scrims | Staff logging workflow built |
| PUBGM scoring | 10-6-5-4-3-2-1-1 + 1/elim widely used but no rulebook retrieved | Unverified assumption |

Notable observations from the real data (club context): the five have never all played one tournament match together (max 3 in one lobby, sometimes on opposite sides); Fbz + jikroy share 104 club games; Mongolia's NARMAN plays for Team Nemesis with Indonesia's Jhocam; Mongolia's captain "Se" has no matched account and "11" is ambiguous.

## Phase 3 — Architecture

```
            ┌──────────── hub page (one HTML file) ────────────┐
            │  Today │ MLBB → Draft Lab │ Dota 2 │ PUBGM │ Staff │
            └──────┬─────────────────────┬──────────┬──────────┘
   OpenDota via browser pane ─┐          │          │  CSV logs (staff)
                              ▼          ▼          ▼
                        src/dota/*   src/pubgm/*   shared db (logs, matches, sessions)
                              │          │
                              └────► src/core: evidence · coaches A/B/C + verdict · measure · registry
```

- Two engines share only the evidence model, coaches, measurement and registry. Adding a title = a data parser, an engine emitting findings, a training rule set and a coach adapter.
- Storage: the artifact's shared database holds analysed Dota matches, refreshed player pools, PUBGM logs and the training log. Access is by claude.ai sharing (auth-ready: nothing is public by default).
- Deterministic coaches: same input, same output; testable; no hidden model in the advice path.

## Phase 4 — What V1 does

**Dota 2.** Hero proficiency per player (tournament games, recency, shrunk win rate, Ready/Practising/Risky); position inference; flex picks; ban-depth stress; CM draft room with step-by-step suggestions and reasons; draft evaluation in four separable terms (player comfort, composition, opponent denial, matchups — the last switched off without data); A-vs-B draft comparison; opponent draft-pattern recognition from picks/bans; post-match analysis (10-min lanes, gold swings, Roshan and post-Roshan conversion, buildings and high ground, teamfights, vision, smokes, buybacks, item timings vs same position) with timestamps; pool-based scouting with ban plan, contested heroes and explicit blocked items; series review of recurring problems.

**PUBG Mobile.** Scoring profiles (WEC blocked, common table unverified, custom); standings, placement vs elimination mix, survival by zone phase, consistency, maps, lobby strength, elimination timing; drop/rotation analysis from staff tags (contest, zone-1 exits, vehicles, late/forced entries, edge vs centre as correlation only); fight classification (favourable / unfavourable / avoidable / necessary) and knock→finish conversion; Monte Carlo strategy simulator (bootstrap of logged matches per strategy, else editable assumptions) with P10/P50/P90 and rival comparison; match-day review; CSV logging with validation.

**Shared.** Three coaches + combined verdict on every analysis; Today page with three objectives per title; training log; before/after indicator comparison with fairness flags; source registry.

## Phase 5 — Validation

- `npm test`: **26/26 pass** (23 engine tests + 3 headless UI tests).
- Source checks: shared club matches agree between two players' independent pulls (≥50 matches, results and durations identical); CM order checked against both real drafts; match facts asserted (OG took both Roshans in 9057681759; 1win lost a tier-3 116 s after the second); Mongolia counts asserted (Kez 31 games for 423).
- Synthetic PUBGM: engine detects the planted contested-drop and survival problems; validator rejects broken rows; simulator reproducible by seed.
- Not yet validated: whether recommendations improve scrim indicators (needs pelatnas data), scouting accuracy (needs WEC matches), live browser fetch inside the published page (interface unverified until first use).

## Known limitations
1. All Dota evidence is club data; national-five synergy is unmeasured until scrims are analysed.
2. Counterpick/synergy not scored (no hero-matchup table).
3. One rival scouted (Mongolia, 4/5 players). Ten Dota rivals and all PUBGM rivals pending.
4. PUBGM analysis depends on staff logging; shipped data is synthetic.
5. No positional data: no heatmaps, routes or zone prediction (by design).
6. WEC format, draft rules, patch and scoring unpublished.
7. Live fetch only inside the Claude desktop app; elsewhere paste JSON.
8. Draft Lab source code not audited at code level.

## V2 roadmap (prioritised)
1. **Pelatnas scrim pipeline** — every Dota scrim match ID and every PUBGM scrim logged same day; reports replace club data. *Highest coaching value.*
2. **Scout the remaining Dota finalists** (Greece first: 2/5 accounts already found), then PUBGM rivals from official event results.
3. **Hero matchup table** (OpenDota /heroes/{id}/matchups, current patch) to switch on counterpick and synergy terms, with sample-size gates.
4. **Plug in WEC rules** as soon as IESF publishes: draft order, series length, patch, PUBGM scoring → profile and draft config.
5. **Forward test** in the Draft Lab style: freeze scouting predictions before WEC, score them after.
6. **Code-level audit** of Draft Lab for shared components (scrim log, timer, stage view).
7. **VOD tagging** for PUBGM fights (timestamps + clips) and Dota ward-map review.
8. CS2 / eFootball modules if the staff want them.
