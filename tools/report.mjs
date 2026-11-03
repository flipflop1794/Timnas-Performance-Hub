// Builds the sample reports (markdown) from the shipped data, using the same engines as the hub.
import { readFileSync, writeFileSync } from 'node:fs';
import { parseHeroes, parsePlayerMatches } from '../src/dota/data.js';
import { buildPools, teamFindings } from '../src/dota/team.js';
import { analyseMatch } from '../src/dota/match.js';
import { scoutingReport } from '../src/dota/scout.js';
import { suggest } from '../src/dota/draft.js';
import { recommendations as dotaRecs, dotaAdapter } from '../src/dota/training.js';
import { runCoaches } from '../src/core/coaches.js';
import { parseCSV, scorer } from '../src/pubgm/scoring.js';
import { perfFindings, dropFindings, fightFindings, teamSummary } from '../src/pubgm/analytics.js';
import { simulate } from '../src/pubgm/simulator.js';
import { recommendations as pubgmRecs, pubgmAdapter } from '../src/pubgm/training.js';
import { mmss, round } from '../src/core/stats.js';

const rd = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const heroes = parseHeroes(rd('data/dota/heroes.csv'));
const players = parsePlayerMatches(rd('data/dota/ina_pro_matches.csv'));
const matches = JSON.parse(rd('data/dota/matches_parsed.json')).matches;
const mgl = JSON.parse(rd('data/dota/opp_MGL.json'));
const ASOF = 1793696400;
const pools = buildPools(players, heroes, ASOF);
const INA = Object.values(players).map((p) => p.account);

const fl = (F) => F.map((f) => `- **[${f.kind} · ${f.confidence}${f.n != null ? ` · n=${f.n}` : ''}]** ${f.at != null ? `${mmss(f.at)} — ` : ''}${f.title}${f.detail ? `  \n  _${f.detail}_` : ''}`).join('\n');
const rl = (R) => R.map((r, i) => `${i + 1}. **${r.problem}** (confidence ${r.confidence})\n   - Evidence: ${r.evidence.join(' · ')}\n   - Why: ${r.explanation}\n   - Drill: ${r.drill}\n   - Success: ${r.success}`).join('\n');
const coachMd = (o) => `**${o.a.name}** — ${o.a.focus}\n${o.a.points.map((p) => `- (${p.stance}) ${p.text}`).join('\n') || '- —'}\n\n**${o.b.name}** — ${o.b.focus}\n${o.b.points.map((p) => `- (${p.stance}) ${p.text}`).join('\n') || '- —'}\n\n**${o.c.name}** — ${o.c.focus}\n${o.c.challenges.map((c) => `- (${c.verdict}) ${c.text}`).join('\n')}\n${o.c.exploits.map((e) => `- Exploit: ${e.text}`).join('\n')}\n${o.c.blindSpots.map((b) => `- Blind spot: ${b}`).join('\n')}\n\n**Combined verdict**\n- Priorities: ${o.verdict.priorities.map((r) => r.problem).join(' | ') || 'none yet'}\n- Disputed: ${o.verdict.disputed.map((d) => `${d.rec.problem} (${d.why})`).join(' | ') || 'none'}\n- ${o.verdict.humanReview}`;

let md = `# IESF Performance Hub V1 — sample reports\nGenerated ${new Date().toISOString().slice(0, 10)} from the data shipped in /data. Dota 2 data is real (OpenDota, club tournament games since patch 7.41). PUBG Mobile data is SYNTHETIC demo data.\n\n`;

// Dota team overview
const TF = teamFindings(pools, players, ASOF);
md += `## 1. Dota 2 — Indonesia team overview (Workflow A)\n\n| Player | Position | Games | Win % | Top ready heroes |\n|---|---|---|---|---|\n${pools.map((p) => `| ${p.player} | ${p.posLabel} | ${p.games} | ${round(p.winRate * 100)}% | ${p.pool.filter((e) => e.tier === 'Ready').slice(0, 5).map((e) => `${e.name} (${e.games})`).join(', ')} |`).join('\n')}\n\n${fl(TF)}\n\n### Training recommendations\n${rl(dotaRecs(TF))}\n\n### Three-coach read\n${coachMd(runCoaches(TF, dotaRecs(TF), dotaAdapter, { clubData: true }))}\n\n`;

for (const m of matches) {
  const a = analyseMatch(m, INA, heroes);
  const R = dotaRecs(a.findings);
  md += `## 2. Dota 2 post-match — ${a.ourTeam} vs ${a.opponent}, match ${a.matchId} (${a.league})\nTracked national players in this match: ${a.tracked}/5 (club match). Result: **${a.won ? 'won' : 'lost'}** in ${mmss(a.duration)}.\n\n${fl(a.findings)}\n\n### Recommendations\n${rl(R) || '_None triggered._'}\n\n### Three-coach read\n${coachMd(runCoaches(a.findings, R, dotaAdapter, { clubData: true }))}\n\n`;
}

const S = scoutingReport(mgl, heroes, pools);
const oppPools = S.players;
const firstPhase = suggest({ ours: [], theirs: [], ourBans: [], theirBans: [] }, { heroes, pools, oppPools }, { kind: 'ban', top: 5 });
md += `## 3. Dota 2 scouting report — ${S.nation} (coach ${S.coach})\n\n| Player | Likely role | Games | Most-played | Depth (5+ games) |\n|---|---|---|---|---|\n${S.players.map((p) => `| ${p.player} | ${p.posLabel} | ${p.games} | ${p.topHero.name} (${p.topHero.games}g, ${p.topHero.wins}w) | ${p.depth} |`).join('\n')}\n\n**Ban plan (presence-based):** ${S.banPlan.map((b) => `${b.name} → ${b.player} (${b.games} games, ${round(b.share * 100)}% of his games)`).join('; ')}\n\n**Engine first-phase ban suggestions:** ${firstPhase.map((b) => `${b.name} (${b.reasons[0]})`).join('; ')}\n\n${fl(S.findings)}\n\n**Not available (blocked):**\n${S.blocked.map((b) => `- ${b}`).join('\n')}\n\n`;

// PUBGM
const profiles = JSON.parse(rd('data/pubgm/scoring_profiles.json')).profiles;
const sc = scorer(profiles.standard_10_6);
const rows = parseCSV(rd('data/pubgm/demo_matches.csv'));
const fights = parseCSV(rd('data/pubgm/demo_fights.csv'));
const T = 'INA (demo)';
const F = [...perfFindings(rows, T, sc), ...dropFindings(rows, T, sc).findings, ...fightFindings(fights, T).findings];
const PR = pubgmRecs(F);
const sum = teamSummary(rows, T, sc);
const sim = simulate({ rows, team: T, sc, matches: 6, iters: 4000 });
md += `## 4. PUBG Mobile — SYNTHETIC demo team, 24 scrim matches\nScoring profile: ${sc.label} (**${sc.status}**).\n\n${sum.total} pts, ${round(sum.ppm, 1)} per match, avg place ${round(sum.avgPlace, 1)}, ${sum.wwcd} WWCD.\n\n${fl(F)}\n\n### Strategy simulator (6 matches)\n| Strategy | Basis | P10 | Median | P90 |\n|---|---|---|---|---|\n${sim.results.map((r) => `| ${r.label} | ${r.source} | ${round(r.p10)} | ${round(r.p50)} | ${round(r.p90)} |`).join('\n')}\n\n_${sim.caveat}_\n\n### Recommendations\n${rl(PR)}\n\n### Three-coach read\n${coachMd(runCoaches(F, PR, pubgmAdapter, { synthetic: true, fightsLogged: true }))}\n`;

writeFileSync(new URL('../docs/SAMPLE_REPORTS.md', import.meta.url), md);
console.log(md.length, 'chars');
