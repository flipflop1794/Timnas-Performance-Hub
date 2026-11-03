// Timnas Performance Hub — page shell. All analysis comes from src/core, src/dota, src/pubgm.
import { DATA } from './data.gen.js';
import { parseHeroes, parsePlayerMatches, reduceOpenDotaMatch, fromOpenDotaPlayerMatches } from '../dota/data.js';
import { buildPools, teamFindings } from '../dota/team.js';
import { CM_ORDER, CM_ORDER_STATUS, evaluateDraft, compareDrafts, suggest } from '../dota/draft.js';
import { analyseMatch } from '../dota/match.js';
import { scoutingReport } from '../dota/scout.js';
import { recommendations as dotaRecs, dotaAdapter } from '../dota/training.js';
import { runCoaches } from '../core/coaches.js';
import { KPIS, compareWindows } from '../core/measure.js';
import { SOURCES } from '../core/registry.js';
import { parseCSV, scorer, validateMatches, MATCH_COLUMNS, FIGHT_COLUMNS } from '../pubgm/scoring.js';
import { perfFindings, dropFindings, fightFindings, standings, teamSummary } from '../pubgm/analytics.js';
import { simulate, DEFAULT_ASSUMPTIONS } from '../pubgm/simulator.js';
import { recommendations as pubgmRecs, pubgmAdapter } from '../pubgm/training.js';
import { mmss, round, pct } from '../core/stats.js';

// ---------- state ----------
const S = {
  heroes: parseHeroes(DATA.heroesCsv),
  players: parsePlayerMatches(DATA.inaCsv),
  matches: Object.fromEntries(DATA.matches.map((m) => [m.id, { m, source: 'Shipped with V1 (OpenDota, 2026-11-03)' }])),
  opp: DATA.opp,
  asOf: Math.floor(Date.now() / 1000),
  pubgm: { profile: 'standard_10_6', dataset: 'demo', team: 'INA (demo)', logged: { matches: [], fights: [] } },
  draft: { firstUs: true, steps: [], opp: 'MGL', saved: {} },
  sessions: [],
  db: null, dbState: 'connecting', mcp: undefined,
  selMatch: 9057681759, selNation: 'MGL', selDay: null, freshPools: {},
};
const heroByName = () => Object.fromEntries(Object.values(S.heroes).map((h) => [h.name.toLowerCase(), h.id]));
const accounts = () => Object.values(S.players).map((p) => p.account);
const pools = () => buildPools(S.players, S.heroes, S.asOf);
const WEC_DOTA = ['Greece', 'South Africa', 'Egypt', 'Venezuela', 'Argentina', 'Kazakhstan', 'Mongolia', 'Iran', 'Belarus', 'North Macedonia', 'New Zealand'];
const WEC_PUBGM = ['Türkiye', 'Egypt', 'Morocco', 'Colombia', 'Brazil', 'Kyrgyzstan', 'Uzbekistan', 'Mongolia', 'Bangladesh', 'Malaysia', 'Myanmar', 'Belarus', 'Montenegro', 'Romania', 'Serbia'];

// ---------- helpers ----------
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = (sel, root = document) => root.querySelector(sel);
const hname = (id) => S.heroes[id]?.name || `#${id}`;
const tag = (cls, text) => `<span class="tag ${cls}">${esc(text)}</span>`;

function findingList(F, { limit = 99 } = {}) {
  if (!F.length) return '<p class="empty">No findings for this data.</p>';
  return `<ul class="findings">${F.slice(0, limit).map((f) => `<li><span class="sev ${f.severity < 0 ? 'neg' : f.severity > 0 ? 'pos' : ''}" aria-hidden="true"></span><div>
    <div class="t">${f.at != null ? `<span class="ts">${mmss(f.at)}</span> ` : ''}${esc(f.title)}</div>
    <div class="meta">${tag(`k-${f.kind}`, f.kind)}${tag(`c-${f.confidence}`, f.confidence)}${f.n != null ? `<span class="note">n = ${f.n}</span>` : ''}</div>
    ${f.detail ? `<div class="d">${esc(f.detail)}</div>` : ''}</div></li>`).join('')}</ul>`;
}
function recList(R, { limit = 99 } = {}) {
  if (!R.length) return '<p class="empty">No training recommendation triggered by this data.</p>';
  return `<div class="recs">${R.slice(0, limit).map((r) => `<div class="rec"><div class="p">${esc(r.problem)} ${tag(`c-${r.confidence}`, r.confidence)}</div><dl>
    <dt>Evidence</dt><dd>${r.evidence.map(esc).join('<br>')}</dd><dt>Why</dt><dd>${esc(r.explanation)}</dd>
    <dt>Drill</dt><dd>${esc(r.drill)}</dd><dt>Success</dt><dd>${esc(r.success)}</dd><dt>Owner</dt><dd>${esc(r.owner)}</dd></dl></div>`).join('')}</div>`;
}
function coachPanel(o) {
  const li = (arr, f) => arr.length ? arr.map(f).join('') : '<li>—</li>';
  return `<div class="coaches">
    <section class="coach A"><header><span class="letter">A</span><h3>Strategic Analyst</h3></header><p class="note">${esc(o.a.focus)}</p>
      <ul>${li(o.a.points, (p) => `<li>${p.stance === 'fix' ? '<b>Fix</b>' : '<b>Build on</b>'} · ${esc(p.text)}</li>`)}</ul></section>
    <section class="coach B"><header><span class="letter">B</span><h3>Tactical Execution</h3></header><p class="note">${esc(o.b.focus)}</p>
      <ul>${li(o.b.points, (p) => `<li>${p.at != null ? `<span class="ts">${mmss(p.at)}</span> ` : ''}${esc(p.text.replace(/^\d+:\d\d — /, ''))}</li>`)}</ul></section>
    <section class="coach C"><header><span class="letter">C</span><h3>Critical Challenger</h3></header><p class="note">${esc(o.c.focus)}</p>
      <ul>${li(o.c.challenges, (c) => `<li><b>${c.verdict === 'downgrade' ? 'Downgrade' : 'Caution'}</b> · ${esc(c.text)}</li>`)}
      ${o.c.exploits.map((e) => `<li><b>Exploit</b> · ${esc(e.text)}</li>`).join('')}
      ${o.c.blindSpots.map((b) => `<li><b>Blind spot</b> · ${esc(b)}</li>`).join('')}</ul></section>
  </div>
  <div class="verdict"><div class="h3">Combined coaching verdict</div>
    ${o.verdict.priorities.length ? `<ol>${o.verdict.priorities.map((r) => `<li><b>${esc(r.problem)}</b> <span class="note">— ${esc(r.success)}</span></li>`).join('')}</ol>` : '<p class="empty">No action reaches consensus on this evidence.</p>'}
    ${o.verdict.disputed.length ? `<p class="note"><b>Disputed:</b> ${o.verdict.disputed.map((d) => `${esc(d.rec.problem)} (${esc(d.why)})`).join(' · ')}</p>` : ''}
    <p class="note">${esc(o.verdict.humanReview)}</p></div>`;
}
const banner = (kind, html) => `<div class="banner ${kind}">${html}</div>`;
const CLUB_BANNER = banner('real', '<div><b>Real data, club context.</b> Pools and matches come from OpenDota tournament lobbies since patch 7.41 — the players\' club games, not the national five together. Treat patterns as starting hypotheses for pelatnas scrims.</div>');
const SYNTH_BANNER = () => S.pubgm.dataset === 'demo' ? banner('synth', '<div><b>SYNTHETIC demo data.</b> No public per-match PUBG Mobile data exists for the national squad. These 24 scrim matches are invented to show the workflow; log real scrims under Log &amp; annotate to replace them.</div>') : banner('real', `<div><b>Logged scrims.</b> ${S.pubgm.logged.matches.length} match rows and ${S.pubgm.logged.fights.length} fight rows entered by staff.</div>`);

// ---------- capabilities ----------
async function initCaps() {
  try {
    const db = await window.claude?.use?.('db');
    if (!db) { S.dbState = 'off'; render(); return; }
    S.db = db; S.dbState = 'live';
    const t = setTimeout(() => { S.dbState = 'slow'; render(); }, 10000);
    db.collection('dota_matches').onSnapshot((snap) => {
      clearTimeout(t); S.dbState = 'live';
      for (const d of snap.docs) { const x = d.data(); if (x && x.m) S.matches[x.m.id] = { m: x.m, source: x.source || 'Shared store' }; }
      render();
    }, () => { S.dbState = 'off'; render(); });
    db.collection('pubgm_logs').onSnapshot((snap) => {
      const m = [], f = [];
      for (const d of snap.docs) { const x = d.data(); if (!x) continue; (x.kind === 'fights' ? f : m).push(...(x.rows || [])); }
      S.pubgm.logged = { matches: m, fights: f };
      if (m.length && S.pubgm.dataset === 'demo' && !S.pubgm.userPicked) { S.pubgm.dataset = 'logged'; S.pubgm.team = m[0].team; }
      render();
    }, () => {});
    db.collection('sessions').onSnapshot((snap) => { S.sessions = snap.docs.map((d) => ({ id: d.id, ...d.data() })); render(); }, () => {});
    db.collection('dota_pools').onSnapshot((snap) => {
      for (const d of snap.docs) { const x = d.data(); if (x?.games && S.players[d.id]) { S.players[d.id].games = x.games; S.freshPools[d.id] = x.at; } }
      render();
    }, () => {});
  } catch { S.dbState = 'off'; render(); }
}
async function browserFetchJSON(url) {
  if (S.mcp === undefined) S.mcp = (await window.claude?.use?.('mcp')) || null;
  if (!S.mcp) throw new Error('The Claude desktop browser is not available in this view. Open the hub in the Claude desktop app, or paste the JSON below.');
  await S.mcp.callTool('host:claude_browser', 'navigate', { url });
  const r = await S.mcp.callTool('host:claude_browser', 'get_page_text', { max_chars: 4000000 });
  let text = typeof r.payload === 'string' ? r.payload : (r.content || []).find((c) => c.type === 'text')?.text || JSON.stringify(r.payload ?? '');
  const a = Math.min(...['{', '['].map((c) => { const i = text.indexOf(c); return i < 0 ? Infinity : i; }));
  const b = Math.max(text.lastIndexOf('}'), text.lastIndexOf(']'));
  if (a === Infinity || b < a) throw new Error('The page did not return JSON. OpenDota may be rate-limiting; wait a minute or paste the JSON.');
  return JSON.parse(text.slice(a, b + 1));
}

// ---------- routing ----------
const TITLES = [
  { id: 'home', label: 'Today', tabs: [['today', 'Before training']] },
  { id: 'mlbb', label: 'MLBB', tabs: [['mlbb', 'Draft Lab']] },
  { id: 'dota', label: 'Dota 2', tabs: [['dota-team', 'Team'], ['dota-draft', 'Draft room'], ['dota-post', 'Post-match'], ['dota-scout', 'Scouting'], ['dota-review', 'Series review']] },
  { id: 'pubgm', label: 'PUBG Mobile', tabs: [['pubgm-team', 'Team'], ['pubgm-log', 'Log & annotate'], ['pubgm-sim', 'Strategy sim'], ['pubgm-review', 'Match-day review']] },
  { id: 'staff', label: 'Staff', tabs: [['staff-measure', 'Is it working?'], ['staff-sources', 'Sources & limits']] },
];
const viewOf = () => { const h = location.hash.slice(1); return TITLES.some((t) => t.tabs.some(([id]) => id === h)) ? h : 'today'; };
function renderNav(view) {
  const title = TITLES.find((t) => t.tabs.some(([id]) => id === view));
  $('#titles').innerHTML = TITLES.map((t) => `<button type="button" data-go="${t.tabs[0][0]}" aria-pressed="${t === title}">${esc(t.label)}</button>`).join('');
  $('#tabs').innerHTML = title.tabs.map(([id, label]) => `<a href="#${id}" ${id === view ? 'aria-current="page"' : ''}>${esc(label)}</a>`).join('');
}

// ---------- Dota computations ----------
function dotaTeam() {
  const P = pools();
  const F = teamFindings(P, S.players, S.asOf);
  const R = dotaRecs(F);
  return { P, F, R, coach: runCoaches(F, R, dotaAdapter, { clubData: true, matchupsLoaded: false }) };
}
function pubgmCtx() {
  const prof = S.pubgm.profile === 'wec26' ? null : DATA.profiles[S.pubgm.profile];
  const sc = prof ? scorer(prof) : scorer(DATA.profiles.standard_10_6);
  const rows = S.pubgm.dataset === 'demo' ? parseCSV(DATA.pubgmMatchesCsv) : S.pubgm.logged.matches;
  const fights = S.pubgm.dataset === 'demo' ? parseCSV(DATA.pubgmFightsCsv) : S.pubgm.logged.fights;
  const teams = [...new Set(rows.map((r) => r.team))];
  if (!teams.includes(S.pubgm.team)) S.pubgm.team = teams[0];
  return { sc, rows, fights, teams, team: S.pubgm.team };
}
function pubgmAll(ctx, filter = () => true) {
  const rows = ctx.rows.filter(filter);
  const ids = new Set(rows.map((r) => r.match_id));
  const fights = ctx.fights.filter((f) => ids.has(f.match_id));
  const drops = dropFindings(rows, ctx.team, ctx.sc);
  const ff = fightFindings(fights, ctx.team);
  const F = [...perfFindings(rows, ctx.team, ctx.sc), ...drops.findings, ...ff.findings];
  const R = pubgmRecs(F);
  return { rows, F, R, drops, ff, coach: runCoaches(F, R, pubgmAdapter, { synthetic: S.pubgm.dataset === 'demo', fightsLogged: fights.length > 0 }) };
}
function topObjectives(coach, recs) {
  const out = [...coach.verdict.priorities];
  for (const r of recs) if (out.length < 3 && !out.includes(r) && !coach.verdict.disputed.some((d) => d.rec === r)) out.push(r);
  return out.slice(0, 3);
}

// ---------- views ----------
const V = {};
V.today = () => {
  const d = dotaTeam();
  const pctx = pubgmCtx();
  const p = pubgmAll(pctx);
  const obj = (list) => list.length ? `<ol class="plain">${list.map((r) => `<li><b>${esc(r.problem)}</b><br><span class="note">Drill: ${esc(r.drill)}</span><br><span class="note">Done when: ${esc(r.success)}</span></li>`).join('')}</ol>` : '<p class="empty">Nothing triggered yet.</p>';
  const weak = (F) => findingList(F.filter((f) => f.severity < 0).sort((a, b) => a.severity - b.severity), { limit: 4 });
  return `<div class="panel"><div class="lead">What do we <em>train today</em> to win the next match?</div>
    <p>Three practice objectives per title, picked by the combined coaching verdict. Every objective links back to its evidence on the title's Team tab. Staff sign-off comes first.</p>
    <div class="stats"><div class="stat"><span class="k">Dota 2 evidence</span><span class="v">${Object.values(S.players).reduce((a, p) => a + p.games.length, 0)}</span><span class="note">club tournament player-games</span></div>
    <div class="stat"><span class="k">Dota 2 matches analysed</span><span class="v">${Object.keys(S.matches).length}</span></div>
    <div class="stat"><span class="k">PUBGM matches</span><span class="v">${new Set(pctx.rows.map((r) => r.match_id)).size}</span><span class="note">${S.pubgm.dataset === 'demo' ? 'synthetic demo' : 'logged'}</span></div>
    <div class="stat"><span class="k">WEC opens</span><span class="v">15 Dec</span><span class="note">ICE BSD City</span></div></div></div>
  <div class="cols">
    <div class="panel"><h2>Dota 2 — today's objectives</h2>${CLUB_BANNER}${obj(topObjectives(d.coach, d.R))}<div class="h3">Current weaknesses</div>${weak(d.F)}<div class="toolbar"><a class="btn" href="#dota-team">Open Dota 2 team view</a></div></div>
    <div class="panel"><h2>PUBG Mobile — today's objectives</h2>${SYNTH_BANNER()}${obj(topObjectives(p.coach, p.R))}<div class="h3">Current weaknesses</div>${weak(p.F)}<div class="toolbar"><a class="btn" href="#pubgm-team">Open PUBG Mobile team view</a></div></div>
  </div>
  <div class="panel"><h2>Other titles</h2><p>MLBB and MLBB Women run in Draft Lab (unchanged). CS2, CS2 Women and eFootball are not covered by this V1.</p><div class="toolbar"><a class="btn" href="#mlbb">MLBB in Draft Lab</a></div></div>`;
};

V.mlbb = () => `<div class="panel"><div class="lead">MLBB stays in <em>Draft Lab</em>.</div>
  <p>The MLBB module is the existing Draft Lab, kept as it is. This hub links to it rather than copying its engine: none of its formulas, hero ratings or draft weights are reused for Dota 2 or PUBG Mobile.</p>
  <dl class="kv"><dt>Production app</dt><dd>Draft Lab v19 — 174 MPL ID S18 games, verified against 6 official VODs and 1 broadcast</dd>
  <dt>National edition</dt><dd>Draft Lab Pelatnas — TLID-based squad, ban stress test, WEC field, opponent dossiers</dd>
  <dt>Open tests</dt><dd>E1 blind coach review (needs reviewers) · E3 playoff forward test (MPL ID playoffs 4–8 Nov)</dd>
  <dt>What came across</dt><dd>The evidence discipline (presence over noisy win rates, pre-registered tests, confidence labels), the three-coach review idea, and the national-edition layout. Not the MLBB math.</dd></dl>
  <div class="toolbar"><a class="btn primary" href="https://claude.ai/code/artifact/2b3103c5-81c9-4ad4-ba3e-3303778a8259" target="_blank" rel="noopener">Open Draft Lab Pelatnas</a><a class="btn" href="https://claude.ai/artifact/VatjYMhyVs5DLHgp8Yx4Rj" target="_blank" rel="noopener">Open Draft Lab MLBB v19</a></div></div>`;

V['dota-team'] = () => {
  const d = dotaTeam();
  return `<div class="panel"><h2>Dota 2 national five</h2>${CLUB_BANNER}
    <div class="tw"><table><thead><tr><th>Player</th><th>Position</th><th class="n">Games</th><th class="n">Won</th><th>Ready heroes (games)</th><th>Data</th></tr></thead><tbody>
    ${d.P.map((p) => `<tr><td><b>${esc(p.player)}</b><br><span class="note">acc ${p.account}</span></td><td>${esc(p.posLabel)}</td><td class="n">${p.games}</td><td class="n">${pct(p.winRate)}</td>
      <td><div class="chips">${p.pool.filter((e) => e.tier === 'Ready').slice(0, 7).map((e) => `<span class="chip ${e.stale ? 'stale' : ''}" title="${e.wins} wins · last ${e.daysSince} days ago">${esc(e.name)} <small>${e.games}</small></span>`).join('')}</div></td>
      <td class="note">${S.freshPools[p.player] ? `refreshed ${esc(S.freshPools[p.player].slice(0, 10))}` : 'pulled 3 Nov'}</td></tr>`).join('')}</tbody></table></div>
    <p class="note">"Ready" = 6+ tournament games, last played within 120 days. Faded chips were last played over 45 days ago. Win rates are shown for context only: on samples this size they say little about hero strength.</p>
    <div class="toolbar"><button class="btn" type="button" id="refreshPools">Refresh pools from OpenDota</button><span class="msg" id="poolMsg"></span></div></div>
  <div class="cols"><div class="panel"><h2>Strengths and weaknesses</h2>${findingList(d.F)}</div>
  <div class="panel"><h2>Training recommendations</h2>${recList(d.R)}</div></div>
  <div class="panel"><h2>Three-coach read</h2>${coachPanel(d.coach)}</div>`;
};

// Draft room
function draftState() {
  const st = { ours: [], theirs: [], ourBans: [], theirBans: [] };
  S.draft.steps.forEach((h, i) => {
    const [kind, side] = CM_ORDER[i];
    const us = (side === 'A') === S.draft.firstUs;
    if (kind === 'pick') (us ? st.ours : st.theirs).push(h); else (us ? st.ourBans : st.theirBans).push(h);
  });
  return st;
}
V['dota-draft'] = () => {
  const P = pools();
  const oppAgg = S.opp[S.draft.opp];
  const oppPools = oppAgg ? scoutingReport(oppAgg, S.heroes, P).players : [];
  const ctx = { heroes: S.heroes, pools: P, oppPools };
  const i = S.draft.steps.length;
  const done = i >= CM_ORDER.length;
  const st = draftState();
  const [kind, side] = done ? ['', ''] : CM_ORDER[i];
  const usTurn = !done && ((side === 'A') === S.draft.firstUs);
  let sug = [];
  if (!done && usTurn) sug = suggest(st, ctx, { kind, top: 6 });
  if (!done && !usTurn) {
    const taken = new Set(S.draft.steps);
    sug = oppPools.flatMap((op) => [...op.pool].sort((a, b) => b.games - a.games).slice(0, 4).filter((e) => !taken.has(e.hero)).map((e) => ({ hero: e.hero, name: e.name, score: e.games / 10, reasons: [`${op.player}: ${e.games} tournament games — likely ${kind === 'ban' ? 'protected or banned around' : 'pick'}`] })))
      .sort((a, b) => b.score - a.score).slice(0, 6);
  }
  const ev = evaluateDraft(st, ctx);
  const board = CM_ORDER.map(([k, sd], j) => {
    const us = (sd === 'A') === S.draft.firstUs;
    const h = S.draft.steps[j];
    return `<div class="slot ${us ? 'us' : 'them'} ${k} ${j === i ? 'cur' : ''}"><span class="s">${j + 1} · ${us ? 'Us' : 'Them'} ${k}</span><span class="h">${h ? esc(hname(h)) : '—'}</span></div>`;
  }).join('');
  const names = Object.values(S.heroes).map((h) => `<option value="${esc(h.name)}"></option>`).join('');
  const saved = Object.keys(S.draft.saved);
  return `<div class="panel"><h2>Draft room — Captains Mode</h2>
    <p class="note">${esc(CM_ORDER_STATUS)} Suggestions weigh our players' tournament comfort, composition gaps and denial of the opponent's comfort heroes. Counterpick and synergy are <b>not scored</b> in V1 (no matchup table loaded) — the coach decides those.</p>
    <div class="form"><label class="field" for="dFirst">First action<select id="dFirst"><option value="us" ${S.draft.firstUs ? 'selected' : ''}>Indonesia</option><option value="them" ${!S.draft.firstUs ? 'selected' : ''}>Opponent</option></select></label>
    <label class="field" for="dOpp">Opponent<select id="dOpp"><option value="">No scouting data</option>${Object.values(S.opp).map((o) => `<option value="${o.code}" ${S.draft.opp === o.code ? 'selected' : ''}>${esc(o.nation)}</option>`).join('')}</select></label>
    <label class="field" for="dHero">${done ? 'Draft complete' : `Step ${i + 1}: ${usTurn ? 'our' : 'their'} ${kind}`}<input type="text" id="dHero" list="heroNames" placeholder="Type a hero" ${done ? 'disabled' : ''}></label></div>
    <datalist id="heroNames">${names}</datalist>
    <div class="toolbar"><button class="btn primary" type="button" id="dLock" ${done ? 'disabled' : ''}>Lock in</button><button class="btn" type="button" id="dUndo" ${i ? '' : 'disabled'}>Undo</button><button class="btn" type="button" id="dReset">Reset</button>
      <button class="btn" type="button" id="dSaveA">Save as Draft A</button><button class="btn" type="button" id="dSaveB">Save as Draft B</button><span class="msg" id="dMsg"></span></div>
    <div class="board">${board}</div></div>
  <div class="cols">
    <div class="panel"><h2>${done ? 'Draft finished' : usTurn ? `Our ${kind}: suggestions` : `Their ${kind}: what to expect`}</h2>
      ${done ? '<p class="empty">All 24 steps filled.</p>' : sug.length ? `<div class="sugg">${sug.map((s) => `<button type="button" data-hero="${s.hero}"><b>${esc(s.name)}</b><span class="sc">${usTurn ? `+${round(s.score, 2)}` : ''}</span><small>${s.reasons.map(esc).join(' · ')}</small></button>`).join('')}</div>` : '<p class="empty">No evidence-backed suggestion here. Load scouting data for the opponent or pick from the coach\'s plan.</p>'}</div>
    <div class="panel"><h2>Our draft so far</h2>
      <div class="terms"><div class="stat"><span class="k">Player comfort</span><span class="v">${round(ev.terms.execution, 2)}</span></div><div class="stat"><span class="k">Composition</span><span class="v">${round(ev.terms.structure, 1)}</span></div><div class="stat"><span class="k">Denial</span><span class="v">${round(ev.terms.denial, 2)}</span></div><div class="stat"><span class="k">Matchups</span><span class="v">off</span></div></div>
      ${ev.assignment.length ? `<div class="h3">Who plays what</div><div class="chips">${ev.assignment.map((a) => `<span class="chip">${esc(hname(a.hero))} <small>${esc(a.player)} · ${round(a.comfort, 1)}</small></span>`).join('')}</div>` : ''}
      <div class="h3">Vulnerabilities</div>${ev.vulns.length ? `<ul class="plain">${ev.vulns.map((v) => `<li>${esc(v)}</li>`).join('')}</ul>` : '<p class="empty">None flagged yet.</p>'}</div>
  </div>
  <div class="panel"><h2>Compare two drafts</h2>${saved.length < 2 ? '<p class="empty">Save a draft as A and another as B to see which the engine prefers and why.</p>' : (() => {
    const c = compareDrafts(S.draft.saved.A, S.draft.saved.B, ctx, ['Draft A', 'Draft B']);
    const line = (n, d) => `<b>${n}</b>: ${d.ours.map(hname).join(', ') || '—'}`;
    return `<p>${line('A', S.draft.saved.A)}<br>${line('B', S.draft.saved.B)}</p><p class="lead" style="font-size:24px"><em>${c.preferred}</em> preferred by ${round(c.margin, 2)}</p><ul class="plain">${c.reasons.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>${c.caveat ? `<p class="note">${esc(c.caveat)}</p>` : ''}`;
  })()}</div>`;
};

function goldChart(m, a) {
  if (!m.gadv) return '';
  const sign = a.side === 'radiant' ? 1 : -1;
  const g = m.gadv.map((v) => v * sign);
  const W = 720, H = 220, L = 52, R = 12, T = 14, B = 26;
  const max = Math.max(2000, ...g.map(Math.abs)); const lim = Math.ceil(max / 5000) * 5000;
  const x = (i) => L + (i / (g.length - 1)) * (W - L - R), y = (v) => T + (1 - (v + lim) / (2 * lim)) * (H - T - B);
  const path = g.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
  const ticks = [-lim, -lim / 2, 0, lim / 2, lim];
  const mins = g.length - 1; const step = mins > 40 ? 10 : 5;
  const roshes = m.obj.filter((o) => o[1] === 'CHAT_MESSAGE_ROSHAN_KILL');
  const roshTeamOurs = a.side === 'radiant' ? 2 : 3;
  return `<div class="chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Net worth difference over time, our side positive">
    ${ticks.map((t) => `<line x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}" stroke="var(--line)" stroke-width="${t === 0 ? 1.5 : 1}"/><text x="${L - 6}" y="${y(t) + 4}" text-anchor="end">${t > 0 ? '+' : ''}${t / 1000}k</text>`).join('')}
    ${Array.from({ length: Math.floor(mins / step) + 1 }, (_, k) => k * step).map((mm) => `<text x="${x(mm)}" y="${H - 8}" text-anchor="middle">${mm}'</text>`).join('')}
    <path d="${path}" fill="none" stroke="var(--gold)" stroke-width="2"/>
    ${roshes.map((r) => { const xi = x(Math.min(mins, r[0] / 60)); const us = +r[3] === roshTeamOurs; return `<line x1="${xi}" x2="${xi}" y1="${T}" y2="${H - B}" stroke="${us ? 'var(--good)' : 'var(--merah)'}" stroke-dasharray="3 3"/><text x="${xi + 3}" y="${T + 10}">${us ? 'Our' : 'Their'} Rosh</text>`; }).join('')}
    <circle cx="${x(g.length - 1)}" cy="${y(g[g.length - 1])}" r="3.5" fill="var(--gold)"/>
  </svg><p class="note">Net worth difference by minute from our side (above zero = we lead). Dashed lines mark Roshan kills.</p></div>`;
}
V['dota-post'] = () => {
  const ids = Object.keys(S.matches).map(Number).sort((a, b) => S.matches[b].m.start - S.matches[a].m.start);
  if (!S.matches[S.selMatch]) S.selMatch = ids[0];
  const rec = S.matches[S.selMatch];
  let body = '<p class="empty">No match selected.</p>';
  if (rec) {
    try {
      const a = analyseMatch(rec.m, accounts(), S.heroes);
      const R = dotaRecs(a.findings);
      const o = runCoaches(a.findings, R, dotaAdapter, { clubData: a.tracked < 5, matchupsLoaded: false });
      body = `<div class="panel"><h2>${esc(a.ourTeam || 'Our side')} vs ${esc(a.opponent || 'opponent')} — ${a.won ? 'won' : 'lost'} in ${mmss(a.duration)}</h2>
        <p class="note">Match ${a.matchId} · ${esc(a.league || 'league n/a')} · ${a.tracked}/5 national players on the ${a.side} side · ${esc(rec.source)}${rec.m.parsed ? '' : ' · <b>not replay-parsed</b>: no fights or timelines'}</p>
        ${a.tracked < 5 ? CLUB_BANNER : ''}${goldChart(rec.m, a)}</div>
        <div class="cols"><div class="panel"><h2>Findings, in match order</h2>${findingList([...a.findings].sort((x, y) => (x.at ?? -1) - (y.at ?? -1)))}</div>
        <div class="panel"><h2>Post-match coaching report</h2>${recList(R)}</div></div>
        <div class="panel"><h2>Three-coach read</h2>${coachPanel(o)}</div>`;
    } catch (e) { body = banner('block', `<div>${esc(e.message)}</div>`); }
  }
  return `<div class="panel"><h2>Analyse a match</h2>
    <p>Enter a Dota 2 match ID. In the Claude desktop app the hub opens it on OpenDota through your browser pane; elsewhere, open <span class="note">api.opendota.com/api/matches/&lt;id&gt;</span> yourself, copy the page and paste it below. Ask OpenDota to parse the replay first (on the match page) so fights and timelines exist.</p>
    <div class="form"><label class="field" for="mSel">Analysed matches<select id="mSel">${ids.map((id) => `<option value="${id}" ${id === S.selMatch ? 'selected' : ''}>${id} · ${esc(S.matches[id].m.rteam || '?')} vs ${esc(S.matches[id].m.dteam || '?')}</option>`).join('')}</select></label>
    <label class="field" for="mId">Match ID<input type="text" id="mId" inputmode="numeric" placeholder="e.g. 9057681759"></label></div>
    <div class="toolbar"><button class="btn primary" type="button" id="mFetch">Fetch from OpenDota</button><span class="msg" id="mMsg"></span></div>
    <label class="field" for="mPaste">Or paste OpenDota match JSON<textarea id="mPaste" placeholder='{"match_id": …, "players": […]}'></textarea></label>
    <div class="toolbar"><button class="btn" type="button" id="mParse">Analyse pasted JSON</button></div></div>${body}`;
};

V['dota-scout'] = () => {
  const P = pools();
  const agg = S.opp[S.selNation];
  const list = WEC_DOTA.map((n) => { const o = Object.values(S.opp).find((x) => x.nation === n); return `<option value="${o ? o.code : ''}" ${o && o.code === S.selNation ? 'selected' : ''} ${o ? '' : 'disabled'}>${esc(n)}${o ? '' : ' — not loaded'}</option>`; }).join('');
  let body = '';
  if (agg) {
    const r = scoutingReport(agg, S.heroes, P);
    const o = runCoaches(r.findings, [], dotaAdapter, { clubData: true, matchupsLoaded: false });
    const banSug = suggest({ ours: [], theirs: [], ourBans: [], theirBans: [] }, { heroes: S.heroes, pools: P, oppPools: r.players }, { kind: 'ban', top: 5 });
    body = `<div class="panel"><h2>Scouting report — ${esc(r.nation)}</h2>${CLUB_BANNER}
      <p class="note">Coach: ${esc(r.coach)}. ${esc(agg._source)}</p>
      <div class="tw"><table><thead><tr><th>Player</th><th>Likely role</th><th class="n">Games</th><th class="n">Won</th><th>Most played</th><th class="n">5+ game heroes</th></tr></thead><tbody>
      ${r.players.map((p) => `<tr><td><b>${esc(p.player)}</b></td><td>${esc(p.posLabel)}</td><td class="n">${p.games}</td><td class="n">${pct(p.winRate)}</td><td><div class="chips">${[...p.pool].sort((a, b) => b.games - a.games).slice(0, 5).map((e) => `<span class="chip">${esc(e.name)} <small>${e.games}</small></span>`).join('')}</div></td><td class="n">${p.depth}</td></tr>`).join('')}
      ${agg.roster.filter((x) => !x.account).map((x) => `<tr><td><b>${esc(x.ign)}</b></td><td colspan="5">${tag('c-Blocked', 'No data')} ${esc(x.match_status)}</td></tr>`).join('')}</tbody></table></div></div>
      <div class="cols"><div class="panel"><h2>Countermeasures</h2>
        <div class="h3">Ban plan (presence)</div><ol class="plain">${r.banPlan.map((b) => `<li><b>${esc(b.name)}</b> — ${esc(b.player)}, ${b.games} games (${pct(b.share)} of his games)</li>`).join('')}</ol>
        <div class="h3">Engine first-phase bans (comfort-weighted)</div><div class="chips">${banSug.map((b) => `<span class="chip">${esc(b.name)} <small>${esc(b.reasons[0])}</small></span>`).join('')}</div>
        <div class="h3">Contested heroes</div>${r.contested.length ? `<ul class="plain">${r.contested.slice(0, 10).map((c) => `<li><b>${esc(c.name)}</b>: ${esc(c.us)} / ${esc(c.them)}</li>`).join('')}</ul><p class="note">Heroes both sides like: first-phase pick or ban priority.</p>` : '<p class="empty">None.</p>'}
        <div class="h3">Not available yet</div><ul class="plain">${r.blocked.map((b) => `<li>${esc(b)}</li>`).join('')}</ul></div>
      <div class="panel"><h2>Findings</h2>${findingList(r.findings)}</div></div>
      <div class="panel"><h2>Three-coach read</h2>${coachPanel(o)}</div>`;
  }
  return `<div class="panel"><h2>Before the match — opponent scouting</h2>
    <p>Reports are built from each registered player's own tournament games, matched from the WEC26 roster page to OpenDota. Mongolia is loaded in V1; the other ten finalists need the same roster-to-account matching (about 15 minutes each, checked by a person).</p>
    <label class="field" for="nSel">Opponent<select id="nSel">${list}</select></label></div>${body}`;
};

V['dota-review'] = () => {
  const ids = Object.keys(S.matches).map(Number);
  const analyses = ids.map((id) => { try { return analyseMatch(S.matches[id].m, accounts(), S.heroes); } catch { return null; } }).filter(Boolean);
  const byArea = {};
  for (const a of analyses) for (const f of a.findings) if (f.severity < 0) (byArea[f.area] ||= new Set()).add(a.matchId);
  const recurring = Object.entries(byArea).filter(([, s]) => s.size >= 2).sort((a, b) => b[1].size - a[1].size);
  const wins = analyses.filter((a) => a.won).length;
  return `<div class="panel"><h2>Series / match-day review</h2>
    <p>Across every analysed match: which problems repeat, and which happened once. Repeats become next session's priorities; one-offs go to VOD review.</p>${CLUB_BANNER}
    <div class="stats"><div class="stat"><span class="k">Matches</span><span class="v">${analyses.length}</span></div><div class="stat"><span class="k">Won</span><span class="v">${wins}</span></div></div></div>
    <div class="cols"><div class="panel"><h2>Recurring problems</h2>${recurring.length ? `<ul class="plain">${recurring.map(([area, s]) => `<li><b>${esc(area)}</b> — in ${s.size} of ${analyses.length} matches</li>`).join('')}</ul>` : '<p class="empty">Nothing repeats yet.</p>'}
      <p class="note">Based on club matches until pelatnas scrims are analysed here. Two matches do not make a pattern; this list fills up as scrims are logged.</p></div>
    <div class="panel"><h2>Per match</h2><div class="tw"><table><thead><tr><th>Match</th><th>Result</th><th class="n">Problems</th><th>Worst</th></tr></thead><tbody>
      ${analyses.map((a) => { const neg = a.findings.filter((f) => f.severity < 0).sort((x, y) => x.severity - y.severity); return `<tr><td>${a.matchId}<br><span class="note">${esc(a.ourTeam)} vs ${esc(a.opponent)}</span></td><td>${a.won ? 'Won' : 'Lost'}</td><td class="n">${neg.length}</td><td>${esc(neg[0]?.title || '—')}</td></tr>`; }).join('')}</tbody></table></div></div></div>`;
};

// PUBG Mobile
function profileControls(ctx) {
  const p = DATA.profiles[S.pubgm.profile];
  return `<div class="form"><label class="field" for="pProf">Scoring profile<select id="pProf">${Object.entries(DATA.profiles).map(([k, v]) => `<option value="${k}" ${k === S.pubgm.profile ? 'selected' : ''}>${esc(v.label)} — ${esc(v.status)}</option>`).join('')}</select></label>
    <label class="field" for="pData">Data<select id="pData"><option value="demo" ${S.pubgm.dataset === 'demo' ? 'selected' : ''}>Synthetic demo</option><option value="logged" ${S.pubgm.dataset === 'logged' ? 'selected' : ''} ${S.pubgm.logged.matches.length ? '' : 'disabled'}>Logged scrims (${S.pubgm.logged.matches.length} rows)</option></select></label>
    <label class="field" for="pTeam">Our team label<select id="pTeam">${ctx.teams.map((t) => `<option ${t === ctx.team ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></label></div>
    ${S.pubgm.profile === 'wec26' ? banner('block', `<div><b>WEC 2026 scoring is not published.</b> ${esc(p.verification)} Totals below use the common 10-6-5 table until it is.</div>`) : banner('synth', `<div><b>${esc(p.status)} scoring.</b> ${esc(p.verification)}</div>`)}`;
}
V['pubgm-team'] = () => {
  const ctx = pubgmCtx();
  if (!ctx.rows.length) return `<div class="panel"><h2>PUBG Mobile</h2><p class="empty">No matches yet. Add scrims under Log &amp; annotate.</p></div>`;
  const p = pubgmAll(ctx);
  const st = standings(ctx.rows, ctx.sc);
  const me = teamSummary(ctx.rows, ctx.team, ctx.sc);
  const classes = ['favourable', 'unfavourable', 'avoidable', 'necessary', 'necessary-lost', 'even'];
  return `<div class="panel"><h2>Tournament performance</h2>${SYNTH_BANNER()}${profileControls(ctx)}
    <div class="stats"><div class="stat"><span class="k">Points</span><span class="v">${me.total}</span></div><div class="stat"><span class="k">Per match</span><span class="v">${round(me.ppm, 1)}</span><span class="note">${round(me.placePPM, 1)} place + ${round(me.elimPPM, 1)} elim</span></div>
    <div class="stat"><span class="k">Avg placement</span><span class="v">${round(me.avgPlace, 1)}</span></div><div class="stat"><span class="k">Top-8</span><span class="v">${me.top8}/${me.matches}</span></div><div class="stat"><span class="k">vs lobby avg</span><span class="v">${me.relLobby > 0 ? '+' : ''}${round(me.relLobby, 1)}</span></div></div></div>
  <div class="cols"><div class="panel"><h2>Findings</h2>${findingList(p.F)}</div><div class="panel"><h2>Training recommendations</h2>${recList(p.R)}</div></div>
  <div class="cols"><div class="panel"><h2>Drops</h2><div class="tw"><table><thead><tr><th>Drop</th><th class="n">Times</th><th class="n">Contested</th><th class="n">Out zone 1</th><th class="n">Vehicle by 3:00</th><th class="n">Pts/match</th></tr></thead><tbody>
    ${p.drops.table.map((d) => `<tr><td>${esc(d.spot)}</td><td class="n">${d.n}</td><td class="n">${d.contested}</td><td class="n">${d.earlyOut}</td><td class="n">${d.vehicle}</td><td class="n">${round(d.ppm, 1)}</td></tr>`).join('')}</tbody></table></div>
    <p class="note">From staff tags, not coordinates. Map overlays need positional data that is not available for PUBG Mobile scrims.</p></div>
   <div class="panel"><h2>Fights</h2>${p.ff.rows.length ? `<div class="stats">${classes.map((c) => `<div class="stat"><span class="k">${esc(c)}</span><span class="v">${p.ff.rows.filter((r) => r.cls === c).length}</span></div>`).join('')}</div>
    <p class="note">Favourable: we finished without losses or won the knock exchange by 2+. Avoidable: we lost 2+ in a fight we started or one that was third-partied. Necessary: zone-forced.</p>` : '<p class="empty">No fights logged.</p>'}</div></div>
  <div class="panel"><h2>Lobby standings</h2><div class="tw"><table><thead><tr><th>#</th><th>Team</th><th class="n">Pts</th><th class="n">Place</th><th class="n">Elim</th><th class="n">WWCD</th><th class="n">Avg place</th></tr></thead><tbody>
    ${st.map((t, i) => `<tr ${t.team === ctx.team ? 'style="background:var(--gold-soft)"' : ''}><td>${i + 1}</td><td>${esc(t.team)}</td><td class="n">${t.total}</td><td class="n">${round(t.placePPM * t.matches)}</td><td class="n">${round(t.elimPPM * t.matches)}</td><td class="n">${t.wwcd}</td><td class="n">${round(t.avgPlace, 1)}</td></tr>`).join('')}</tbody></table></div></div>
  <div class="panel"><h2>Three-coach read</h2>${coachPanel(p.coach)}</div>`;
};

const MATCH_TEMPLATE = `${MATCH_COLUMNS.join(',')}\nS101,2026-11-10,D1,Pelatnas scrim,Erangel,4,INA,6,5,2,3,0,1610,Yasnaya,0,1,4,early,edge,balanced`;
const FIGHT_TEMPLATE = `${FIGHT_COLUMNS.join(',')}\nS101,INA,640,2,us,0,2,1,2,0,0,compound fight east`;
V['pubgm-log'] = () => `<div class="panel"><h2>Log scrims and fights</h2>
  <p>One row per team per match (the whole lobby, so standings and lobby strength work), plus one row per fight your analysts tag from VOD. Paste CSV or load a file. Rows are checked before they are saved to the shared log every staff member sees.</p>
  ${S.dbState === 'live' ? banner('real', '<div><b>Shared log connected.</b> Saved rows are visible to everyone with access to this hub.</div>') : banner('synth', `<div><b>Shared log not connected</b> (${esc(S.dbState)}). Rows stay in this browser tab only.</div>`)}
  <div class="cols"><div class="panel" style="border:0;padding:0">
    <label class="field" for="lMatches">Match rows (CSV)<textarea id="lMatches" placeholder="${esc(MATCH_TEMPLATE)}"></textarea></label>
    <div class="toolbar"><input type="file" id="lMatchFile" accept=".csv,text/csv" aria-label="Load match CSV file"><button class="btn" type="button" data-copy="match">Copy template</button></div></div>
  <div class="panel" style="border:0;padding:0">
    <label class="field" for="lFights">Fight rows (CSV)<textarea id="lFights" placeholder="${esc(FIGHT_TEMPLATE)}"></textarea></label>
    <div class="toolbar"><input type="file" id="lFightFile" accept=".csv,text/csv" aria-label="Load fight CSV file"><button class="btn" type="button" data-copy="fight">Copy template</button></div></div></div>
  <div class="toolbar"><button class="btn primary" type="button" id="lSave">Check and save</button><span class="msg" id="lMsg"></span></div>
  <details><summary class="note">Column guide</summary><ul class="plain note">
    <li><b>lobby_strength</b> 1–5 staff estimate · <b>died_phase</b> zone phase the team was eliminated in (0 = won / alive at end) · <b>drop_contested</b>, <b>vehicle_by_3min</b> 0/1</li>
    <li><b>zone_entry</b> early / late / forced · <b>position</b> edge / center · <b>strategy</b> aggressive / balanced / passive (feeds the simulator)</li>
    <li>Fights: <b>initiator</b> us / them / third · <b>zone_forced</b>, <b>third_party</b> 0/1 · knocks and finishes as counts</li></ul></details></div>
  <div class="panel"><h2>Logged so far</h2><p>${S.pubgm.logged.matches.length} match rows · ${S.pubgm.logged.fights.length} fight rows. Switch the Team tab's data selector to "Logged scrims" to analyse them.</p></div>`;

V['pubgm-sim'] = () => {
  const ctx = pubgmCtx();
  const cfg = S.pubgm.sim || (S.pubgm.sim = { matches: 6, ourPts: 0, rival: '', rivalPts: 0, assumptions: JSON.parse(JSON.stringify(DEFAULT_ASSUMPTIONS)) });
  let out;
  try { out = simulate({ rows: ctx.rows, team: ctx.team, sc: ctx.sc, matches: cfg.matches, iters: 3000, assumptions: cfg.assumptions, rival: cfg.rival ? { team: cfg.rival, ourPoints: cfg.ourPts, theirPoints: cfg.rivalPts } : null }); }
  catch (e) { return `<div class="panel">${banner('block', esc(e.message))}</div>`; }
  const max = Math.max(...out.results.map((r) => r.p90)) * 1.08 || 1;
  return `<div class="panel"><h2>Strategy simulator</h2>${SYNTH_BANNER()}
    <p>Compare plans for the matches left. Each plan is a bootstrap of our own logged matches played that way (6+ needed), otherwise our overall history adjusted by the assumptions below, which you can edit. Results are ranges.</p>
    ${banner('block', '<div><b>Tournament rules.</b> IESF rules on live coaching, external tools and player communications during WEC matches are not published (owner: PB ESI intl. relations). Use the hub between matches only, until the rulebook says otherwise.</div>')}
    <div class="form"><label class="field" for="sN">Matches left<input type="number" id="sN" min="1" max="24" value="${cfg.matches}"></label>
    <label class="field" for="sOur">Our points now<input type="number" id="sOur" value="${cfg.ourPts}"></label>
    <label class="field" for="sRival">Rival<select id="sRival"><option value="">None</option>${ctx.teams.filter((t) => t !== ctx.team).map((t) => `<option ${t === cfg.rival ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></label>
    <label class="field" for="sRivalPts">Rival points now<input type="number" id="sRivalPts" value="${cfg.rivalPts}"></label></div>
    <div class="toolbar"><button class="btn primary" type="button" id="sRun">Run</button></div></div>
  <div class="panel"><h2>Points over the next ${cfg.matches} matches</h2>
    ${out.results.map((r) => `<div class="simrow"><div><b>${esc(r.label)}</b><br><span class="note">${esc(r.basis === 'data' ? 'from our matches' : 'assumption-based')}</span></div>
      <div class="simtrack" aria-label="P10 ${round(r.p10)}, median ${round(r.p50)}, P90 ${round(r.p90)}"><span class="rng" style="left:${(r.p10 / max) * 100}%;width:${((r.p90 - r.p10) / max) * 100}%"></span><span class="med" style="left:${(r.p50 / max) * 100}%"></span></div>
      <div class="note">P10 <b>${round(r.p10)}</b> · median <b>${round(r.p50)}</b> · P90 <b>${round(r.p90)}</b>${r.pBeatRival != null ? `<br>Finish ahead of ${esc(cfg.rival)}: <b>${pct(r.pBeatRival)}</b>` : ''}</div></div>`).join('')}
    <p class="note">${esc(out.caveat)} P10 is the downside: one run in ten scores less than that.</p>
    <ul class="plain note">${out.results.map((r) => `<li>${esc(r.label)}: ${esc(r.source)}</li>`).join('')}</ul></div>
  <div class="panel"><h2>Assumptions (used only where a plan has fewer than 6 logged matches)</h2><div class="tw"><table><thead><tr><th>Plan</th><th>Elims ×</th><th>Early-exit change</th><th>Placement shift</th></tr></thead><tbody>
    ${Object.entries(cfg.assumptions).map(([k, a]) => `<tr><td>${esc(a.label)}</td><td><input type="number" step="0.1" id="as-${k}-elimMult" value="${a.elimMult}" aria-label="${esc(a.label)} elimination multiplier"></td><td><input type="number" step="0.01" id="as-${k}-earlyExitAdd" value="${a.earlyExitAdd}" aria-label="${esc(a.label)} early exit change"></td><td><input type="number" step="1" id="as-${k}-placeShift" value="${a.placeShift}" aria-label="${esc(a.label)} placement shift"></td></tr>`).join('')}</tbody></table></div>
    <p class="note">Placement shift is in places (negative = better). These are staff judgements, not measured effects.</p></div>`;
};

V['pubgm-review'] = () => {
  const ctx = pubgmCtx();
  const sessions = [...new Set(ctx.rows.map((r) => r.session))].sort();
  if (!sessions.length) return '<div class="panel"><p class="empty">No logged sessions.</p></div>';
  if (!sessions.includes(S.selDay)) S.selDay = sessions[sessions.length - 1];
  const day = pubgmAll(ctx, (r) => r.session === S.selDay);
  const before = ctx.rows.filter((r) => r.session < S.selDay);
  const today = teamSummary(day.rows, ctx.team, ctx.sc);
  const prev = before.length ? teamSummary(before, ctx.team, ctx.sc) : null;
  const delta = (a, b, d = 1) => (b == null ? '' : `<span class="note">${a - b >= 0 ? '+' : ''}${round(a - b, d)} vs earlier days</span>`);
  return `<div class="panel"><h2>Match-day review</h2>${SYNTH_BANNER()}
    <label class="field" for="dayS">Session<select id="dayS">${sessions.map((s) => `<option ${s === S.selDay ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select></label>
    <div class="stats"><div class="stat"><span class="k">Pts/match</span><span class="v">${round(today.ppm, 1)}</span>${delta(today.ppm, prev?.ppm)}</div>
    <div class="stat"><span class="k">Avg placement</span><span class="v">${round(today.avgPlace, 1)}</span>${delta(today.avgPlace, prev?.avgPlace)}</div>
    <div class="stat"><span class="k">Elim pts/match</span><span class="v">${round(today.elimPPM, 1)}</span>${delta(today.elimPPM, prev?.elimPPM)}</div></div>
    <p class="note">One day is ${today.matches} matches: differences this size are usually noise. Look for the same problem on several days.</p></div>
  <div class="cols"><div class="panel"><h2>What happened</h2>${findingList(day.F)}</div><div class="panel"><h2>Next session</h2>${recList(day.R, { limit: 3 })}</div></div>`;
};

// Staff
V['staff-measure'] = () => {
  const ctx = pubgmCtx();
  const dates = [...new Set(ctx.rows.map((r) => r.date))].sort();
  const split = S.splitDate && dates.includes(S.splitDate) ? S.splitDate : dates[Math.floor(dates.length / 2)];
  S.splitDate = split;
  const mine = ctx.rows.filter((r) => r.team === ctx.team);
  const A = mine.filter((r) => r.date < split), B = mine.filter((r) => r.date >= split);
  const k = KPIS.pubgm;
  const cmp = [
    compareWindows(k[0], A.map((r) => ctx.sc.total(r)), B.map((r) => ctx.sc.total(r))),
    compareWindows(k[3], A.map((r) => r.placement <= 8), B.map((r) => r.placement <= 8)),
    compareWindows(k[4], A.map((r) => r.died_phase > 0 && r.died_phase <= 2), B.map((r) => r.died_phase > 0 && r.died_phase <= 2)),
  ];
  const sess = [...S.sessions].sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const done = sess.filter((s) => s.completed === 'yes').length, adopted = sess.filter((s) => s.adopted === 'yes').length;
  const ratings = sess.map((s) => +s.rating).filter((x) => x >= 1);
  return `<div class="panel"><div class="lead">Is the hub <em>helping</em>?</div>
    <p>The hub never claims to raise win probability. It tracks whether recommendations are used, whether the targeted indicators move in comparable scrims, and whether coaches rate the advice as useful. An indicator change is reported as just that.</p></div>
  <div class="cols"><div class="panel"><h2>Training log</h2>
    <div class="form"><label class="field" for="tDate">Date<input type="date" id="tDate"></label><label class="field" for="tTitle">Title<select id="tTitle"><option>Dota 2</option><option>PUBG Mobile</option><option>MLBB</option></select></label>
    <label class="field" for="tObj">Objective worked on<input type="text" id="tObj" placeholder="e.g. Aegis minus 3 drill"></label>
    <label class="field" for="tDone">Objective met?<select id="tDone"><option value="yes">Yes</option><option value="partly">Partly</option><option value="no">No</option></select></label>
    <label class="field" for="tAdopt">Came from a hub recommendation?<select id="tAdopt"><option value="yes">Yes</option><option value="no">No</option></select></label>
    <label class="field" for="tRate">Usefulness (1–5)<select id="tRate"><option value="">—</option><option>1</option><option>2</option><option>3</option><option>4</option><option>5</option></select></label></div>
    <div class="toolbar"><button class="btn primary" type="button" id="tSave">Add to log</button><span class="msg" id="tMsg"></span></div>
    <div class="stats"><div class="stat"><span class="k">Sessions</span><span class="v">${sess.length}</span></div><div class="stat"><span class="k">Objectives met</span><span class="v">${sess.length ? pct(done / sess.length) : '—'}</span></div><div class="stat"><span class="k">From the hub</span><span class="v">${sess.length ? pct(adopted / sess.length) : '—'}</span></div><div class="stat"><span class="k">Usefulness</span><span class="v">${ratings.length ? round(ratings.reduce((a, b) => a + b, 0) / ratings.length, 1) : '—'}</span></div></div>
    ${sess.length ? `<div class="tw"><table><thead><tr><th>Date</th><th>Title</th><th>Objective</th><th>Met</th><th>Hub</th><th class="n">Rating</th></tr></thead><tbody>${sess.slice(0, 15).map((s) => `<tr><td>${esc(s.date)}</td><td>${esc(s.title)}</td><td>${esc(s.objective)}</td><td>${esc(s.completed)}</td><td>${esc(s.adopted)}</td><td class="n">${esc(s.rating || '—')}</td></tr>`).join('')}</tbody></table></div>` : '<p class="empty">No sessions logged yet. Add the first one after today\'s practice.</p>'}</div>
  <div class="panel"><h2>Before / after — PUBG Mobile</h2>${SYNTH_BANNER()}
    <label class="field" for="mSplit">Change introduced on<select id="mSplit">${dates.map((d) => `<option ${d === split ? 'selected' : ''}>${esc(d)}</option>`).join('')}</select></label>
    <div class="tw"><table><thead><tr><th>Indicator</th><th class="n">Before</th><th class="n">After</th><th>Verdict</th></tr></thead><tbody>
    ${cmp.map((c) => `<tr><td>${esc(c.label)}</td><td class="n">${typeof c.before === 'number' ? round(c.before, 2) : '—'}</td><td class="n">${typeof c.after === 'number' ? round(c.after, 2) : '—'}</td><td><b>${esc(c.status)}</b>${c.flags.length ? `<br><span class="note">${c.flags.map(esc).join('; ')}</span>` : ''}</td></tr>`).join('')}</tbody></table></div>
    <p class="note">"No clear change" means the 95% interval includes zero. Opponent strength, patch and circle luck are not controlled in scrims; flags say when a comparison is not fair yet.</p>
    <div class="h3">Tracked indicators</div><ul class="plain note">${[...KPIS.dota, ...KPIS.shared].map((x) => `<li>${esc(x.label)}</li>`).join('')}</ul></div></div>`;
};
V['staff-sources'] = () => `<div class="panel"><h2>Source registry</h2><div class="tw"><table><thead><tr><th>Source</th><th>Collected</th><th>Version</th><th>Scope</th><th>Completeness</th><th>Status</th><th>Access</th></tr></thead><tbody>
  ${SOURCES.map((s) => `<tr><td><b>${esc(s.name)}</b><br><span class="note">${/^https?:/.test(s.url) ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.url)}</a>` : esc(s.url)}</span></td><td>${esc(s.collected)}</td><td>${esc(s.version)}</td><td>${esc(s.scope)}</td><td>${esc(s.completeness)}</td><td>${tag(/Verified|Pulled/.test(s.status) ? 'c-Verified' : /SYNTH|Unverified|Conflict|TBD|Needs/.test(s.status) ? 'c-Unverified' : 'c-Medium', s.status.split(/[;—(]/)[0].trim())}<br><span class="note">${esc(s.status)}</span></td><td>${esc(s.access)}</td></tr>`).join('')}</tbody></table></div>
  <p class="note">Built ${esc(DATA.builtAt.slice(0, 16).replace('T', ' '))} UTC. Data is attributed to OpenDota (Dota 2) and the IESF WEC26 site (rosters). Liquipedia and broadcast-derived facts are treated as secondary.</p></div>
  <div class="cols"><div class="panel"><h2>Built in V1</h2><ul class="plain">
    <li>Dota 2: player hero proficiency, CM draft room with reasons, draft comparison, flex picks, ban-depth stress, post-match analysis from OpenDota (laning, gold swings, Roshan conversion, fights, vision, buybacks, item timings), pool-based scouting (Mongolia), series review.</li>
    <li>PUBG Mobile: scoring profiles, standings and points mix, survival by zone, drop and rotation tags, fight classification, strategy simulator with ranges, match-day review, CSV logging with validation.</li>
    <li>Shared: evidence labels, three coaches with a combined verdict, training recommendations with drills and success criteria, training log, before/after measurement, source registry.</li></ul></div>
  <div class="panel"><h2>Known limits</h2><ul class="plain">
    <li>All Dota 2 evidence is club data; the national five have not played tournament games together.</li>
    <li>Counterpick and synergy are not scored: no hero-matchup table is loaded.</li>
    <li>Only Mongolia is scouted; ten Dota finalists and all PUBGM rivals still need roster matching.</li>
    <li>PUBG Mobile has no public per-match data: analysis depends on staff logging; the shipped data is synthetic.</li>
    <li>No positional data: no heatmaps, routes or safe-zone prediction (by design).</li>
    <li>IESF format, draft rules, patch and scoring for WEC 2026 are unpublished.</li>
    <li>Live fetch works in the Claude desktop app only; elsewhere, paste JSON.</li></ul></div></div>`;

// ---------- events ----------
function render() {
  const view = viewOf();
  renderNav(view);
  try { $('#main').innerHTML = V[view](); } catch (e) { $('#main').innerHTML = `<div class="panel">${banner('block', `<div>Something failed while building this view: ${esc(e.message)}</div>`)}</div>`; console.error(e); }
}
const setMsg = (id, text, cls = '') => { const el = document.getElementById(id); if (el) { el.textContent = text; el.className = `msg ${cls}`; } };
async function saveMatch(m, source) {
  S.matches[m.id] = { m, source }; S.selMatch = m.id;
  if (S.db) { try { await S.db.collection('dota_matches').doc(String(m.id)).set({ m, source, at: new Date().toISOString() }); } catch { /* kept in session */ } }
  render();
}
document.addEventListener('click', async (e) => {
  const t = e.target.closest('button, [data-go]');
  if (!t) return;
  if (t.dataset.go) { location.hash = t.dataset.go; return; }
  const id = t.id;
  if (t.dataset.hero && viewOf() === 'dota-draft') { S.draft.steps.push(+t.dataset.hero); render(); return; }
  if (id === 'dLock') { const v = $('#dHero').value.trim().toLowerCase(); const h = heroByName()[v]; if (!h) return setMsg('dMsg', 'Pick a hero name from the list.', 'err'); if (S.draft.steps.includes(h)) return setMsg('dMsg', 'Already picked or banned.', 'err'); S.draft.steps.push(h); render(); }
  if (id === 'dUndo') { S.draft.steps.pop(); render(); }
  if (id === 'dReset') { S.draft.steps = []; render(); }
  if (id === 'dSaveA' || id === 'dSaveB') { const st = draftState(); if (!st.ours.length) return setMsg('dMsg', 'Pick at least one hero first.', 'err'); S.draft.saved[id === 'dSaveA' ? 'A' : 'B'] = st; render(); }
  if (id === 'mFetch') {
    const mid = $('#mId').value.trim(); if (!/^\d{6,12}$/.test(mid)) return setMsg('mMsg', 'Enter a numeric match ID.', 'err');
    setMsg('mMsg', 'Opening OpenDota in your browser pane…');
    try { const raw = await browserFetchJSON(`https://api.opendota.com/api/matches/${mid}`); const m = reduceOpenDotaMatch(raw); await saveMatch(m, `OpenDota, fetched ${new Date().toISOString().slice(0, 10)}`); }
    catch (err) { setMsg('mMsg', err.message, 'err'); }
  }
  if (id === 'mParse') { try { const m = reduceOpenDotaMatch(JSON.parse($('#mPaste').value)); await saveMatch(m, `OpenDota JSON pasted ${new Date().toISOString().slice(0, 10)}`); } catch (err) { setMsg('mMsg', `Could not read that JSON: ${err.message}`, 'err'); } }
  if (id === 'refreshPools') {
    setMsg('poolMsg', 'Fetching each player through your browser pane…');
    try {
      const proj = ['hero_id', 'start_time', 'duration', 'player_slot', 'radiant_win', 'kills', 'deaths', 'assists', 'lane_role'].map((p) => `project=${p}`).join('&');
      for (const p of Object.values(S.players)) {
        const raw = await browserFetchJSON(`https://api.opendota.com/api/players/${p.account}/matches?lobby_type=1&date=230&${proj}`);
        const games = fromOpenDotaPlayerMatches(raw).filter((g) => g.start >= 1774313459);
        if (games.length) { p.games = games; S.freshPools[p.ign] = new Date().toISOString(); if (S.db) await S.db.collection('dota_pools').doc(p.ign).set({ games, at: S.freshPools[p.ign] }); }
      }
      S.asOf = Math.floor(Date.now() / 1000); render();
    } catch (err) { setMsg('poolMsg', err.message, 'err'); }
  }
  if (t.dataset.copy) { const txt = t.dataset.copy === 'match' ? MATCH_TEMPLATE : FIGHT_TEMPLATE; try { await navigator.clipboard.writeText(txt); t.textContent = 'Copied'; } catch { const ta = t.dataset.copy === 'match' ? $('#lMatches') : $('#lFights'); ta.value = txt; ta.select(); } }
  if (id === 'lSave') {
    const m = $('#lMatches').value.trim(), f = $('#lFights').value.trim();
    const rows = m ? parseCSV(m) : [], fights = f ? parseCSV(f) : [];
    const errs = validateMatches(rows);
    for (const [i, r] of fights.entries()) if (!r.match_id || !r.team) errs.push(`fight row ${i + 2}: match_id and team are required`);
    if (!rows.length && !fights.length) return setMsg('lMsg', 'Paste or load at least one CSV.', 'err');
    if (errs.length) return setMsg('lMsg', `${errs.length} problem(s): ${errs.slice(0, 3).join(' · ')}`, 'err');
    if (S.db) {
      try { if (rows.length) await S.db.collection('pubgm_logs').add({ kind: 'matches', rows, at: new Date().toISOString() }); if (fights.length) await S.db.collection('pubgm_logs').add({ kind: 'fights', rows: fights, at: new Date().toISOString() }); }
      catch (err) { return setMsg('lMsg', `Could not save to the shared log (${err.code || err.message}). Check that you have edit access.`, 'err'); }
    } else { S.pubgm.logged.matches.push(...rows); S.pubgm.logged.fights.push(...fights); }
    S.pubgm.dataset = 'logged'; S.pubgm.userPicked = true; S.pubgm.team = rows[0]?.team || S.pubgm.team;
    setMsg('lMsg', `Saved ${rows.length} match rows and ${fights.length} fight rows.`, 'ok'); render();
  }
  if (id === 'sRun') {
    const c = S.pubgm.sim; c.matches = Math.max(1, Math.min(24, +$('#sN').value || 6)); c.ourPts = +$('#sOur').value || 0; c.rival = $('#sRival').value; c.rivalPts = +$('#sRivalPts').value || 0;
    for (const k of Object.keys(c.assumptions)) for (const f of ['elimMult', 'earlyExitAdd', 'placeShift']) { const v = document.getElementById(`as-${k}-${f}`)?.value; if (v !== undefined && v !== '' && !isNaN(+v)) c.assumptions[k][f] = +v; }
    render();
  }
  if (id === 'tSave') {
    const s = { date: $('#tDate').value || new Date().toISOString().slice(0, 10), title: $('#tTitle').value, objective: $('#tObj').value.trim(), completed: $('#tDone').value, adopted: $('#tAdopt').value, rating: $('#tRate').value };
    if (!s.objective) return setMsg('tMsg', 'Write the objective first.', 'err');
    if (S.db) { try { await S.db.collection('sessions').add(s); } catch (err) { return setMsg('tMsg', `Not saved (${err.code || err.message}).`, 'err'); } } else { S.sessions.push(s); render(); }
  }
});
document.addEventListener('change', (e) => {
  const id = e.target.id;
  if (id === 'dFirst') { S.draft.firstUs = e.target.value === 'us'; S.draft.steps = []; render(); }
  if (id === 'dOpp') { S.draft.opp = e.target.value; render(); }
  if (id === 'mSel') { S.selMatch = +e.target.value; render(); }
  if (id === 'nSel') { S.selNation = e.target.value; render(); }
  if (id === 'pProf') { S.pubgm.profile = e.target.value; render(); }
  if (id === 'pData') { S.pubgm.dataset = e.target.value; S.pubgm.userPicked = true; render(); }
  if (id === 'pTeam') { S.pubgm.team = e.target.value; render(); }
  if (id === 'dayS') { S.selDay = e.target.value; render(); }
  if (id === 'mSplit') { S.splitDate = e.target.value; render(); }
  if (id === 'lMatchFile' || id === 'lFightFile') {
    const file = e.target.files?.[0]; if (!file) return;
    const r = new FileReader(); r.onload = () => { (id === 'lMatchFile' ? $('#lMatches') : $('#lFights')).value = r.result; }; r.readAsText(file);
  }
});
document.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.id === 'dHero') $('#dLock')?.click(); });
window.addEventListener('hashchange', render);
render();
initCaps();
