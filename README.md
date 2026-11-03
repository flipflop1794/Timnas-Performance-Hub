# Timnas Performance Hub V1 — Dota 2 & PUBG Mobile (IESF WEC 2026)

Built 3 Nov 2026 for Indonesia's national coaching staff. One hub, three title modules
(MLBB | Dota 2 | PUBG Mobile), two separate analytical engines on a shared core.

```
npm install          # esbuild + jsdom (dev only)
npm test             # 26 automated tests (engines + headless UI)
npm run build        # dist/hub.html — the self-contained hub page
node tools/report.mjs   # docs/SAMPLE_REPORTS.md from the shipped data
node tools/gen_pubgm_demo.mjs   # regenerate the SYNTHETIC PUBGM demo log
```

## Layout
| Path | What it is |
|---|---|
| `src/core/` | Shared platform: evidence model (observed / inferred / hypothesis + confidence), three coaches + combined verdict, measurement framework, stats, source registry |
| `src/dota/` | Dota 2 engine: OpenDota parsers, player proficiency, CM draft (evaluate / compare / suggest / patterns), post-match analysis, pool-based scouting, training rules + coach adapter |
| `src/pubgm/` | PUBG Mobile engine: scoring profiles + CSV validation, tournament / drop / rotation / fight analytics, Monte Carlo strategy simulator, training rules + coach adapter |
| `src/hub/` | The page shell (vanilla JS, bundled by esbuild into one HTML file) |
| `data/dota/` | REAL data from OpenDota, pulled 2026-11-03 (5 national players' club tournament games since 7.41, 2 parsed matches, Mongolia scouting pools) |
| `data/pubgm/` | Scoring profiles + SYNTHETIC demo logs (clearly stamped) |
| `docs/` | Audit, research, architecture, validation, limits & roadmap (`HUB_V1.md`), sample reports |

## Rules this code keeps
- MLBB Draft Lab is not modified; the hub links to it. No MLBB formula is reused.
- No statistic is invented. Real data is attributed; synthetic data is labelled on every screen it appears.
- Every recommendation carries evidence, explanation, drill, measurable success criteria and confidence.
- Coach C challenges sample size and context; the verdict always requires staff sign-off.
- Win-probability claims are never made; measurement reports indicator changes only.
