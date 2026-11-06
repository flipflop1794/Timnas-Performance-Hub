// Timnas Performance Hub V1.8 — page shell. Analysis lives in src/core, src/dota, src/pubgm;
// evidence/demo boundaries in src/hub/pipeline.js; the coaching cycle in src/core/cycle.js.
import { DATA } from './data.gen.js';
import { parseHeroes, parsePlayerMatches, fromOpenDotaPlayerMatches } from '../dota/data.js';
import { importMatch, IMPORT_HELP } from '../dota/importer.js';
import { CM_ORDER, evaluateDraft, compareDrafts, suggest } from '../dota/draft.js';
import { scoutingReport } from '../dota/scout.js';
import { dotaAdapter } from '../dota/training.js';
import { runCoaches } from '../core/coaches.js';
import { KPIS, compareWindows } from '../core/measure.js';
import { SOURCES } from '../core/registry.js';
import { CONTEXT_LABEL, tagOrigin, assertOperational } from '../core/records.js';
import { DEFAULT_RULES, snapshot, changedSince, updateRule, provisional } from '../core/rules.js';
import { propose, review, logSession, decide, nextStep, trail, REVIEW, DECISIONS, EXECUTION, RESULT } from '../core/cycle.js';
import { parseCSV, scorer, validateMatches, MATCH_COLUMNS, FIGHT_COLUMNS } from '../pubgm/scoring.js';
import { standings, teamSummary } from '../pubgm/analytics.js';
import { simulate, DEFAULT_ASSUMPTIONS } from '../pubgm/simulator.js';
import { dotaTeamPipeline, dotaMatchPipeline, pubgmPipeline, todayList, PUBGM_MIN_MATCHES } from './pipeline.js';
import { mmss, round, pct } from '../core/stats.js';
import { STAFF, TITLES as WEC_TITLES, WELLBEING, owner, ownerNote, reviewersFor, queueFor } from '../core/staff.js';
// Website build: the signed-in account (src/web/main.ts). Absent in the Claude artifact build.
const HUB_USER = (typeof window !== 'undefined' && window.__HUB_USER__) || null;
const PLATFORM = (typeof window !== 'undefined' && window.__HUB_PLATFORM__) || null;
if (HUB_USER && !HUB_USER.staffKey) {
  const ROLE_LABEL = { admin: 'Admin', head_coach: 'Head Coach', assistant_coach: 'Assistant coach', readiness_owner: 'Readiness owner', title_coach: 'Title coach', analyst: 'Analyst' };
  STAFF.push({ id: 'user', name: HUB_USER.name, role: HUB_USER.roles.map((r) => ROLE_LABEL[r] || r).join(', '), focus: HUB_USER.titles.length ? HUB_USER.titles : WEC_TITLES.map((t) => t.id) });
}
import { staffObservation, recommendationRecord } from '../core/records.js';
import { FIELDS, FIELD_SOURCE, TIERS, board as rivalBoard, rivalNote, crossTitle, nationProfile, coverage } from '../core/competitors.js';
import { planScrim, completeScrim, summary as scrimSummary, FORMATS, KINDS as SCRIM_KINDS } from '../core/scrims.js';
import { EVENT, defaultRunbook, tLabel, wecMatch, tick, setResult, gameNote, markApplied } from '../core/matchday.js';
import { VOD_TAGS, vod, reviewVod, LEVELS, partner as partnerRec, partnerStats, AREAS, GOAL_STATUS, goal as goalRec, updateGoal, plan as newPlan } from '../core/library.js';
import { weeklyBrief } from '../core/brief.js';
import { localDay, shiftDay } from '../core/dates.js';
import { scrimReport, addNote as reportNote, byDay as reportDays, reportSummary, reportsCsv, resultText, GAME_SPEC, PROGRESS, ROSTER_PLAYED } from '../core/reports.js';
import { seedRosters, effective, editPlayers, recordCheck, checkStatus, dotaPool, ACCOUNT_KIND, ROLE_HINT, rosterKey, CHECK_EVERY_DAYS } from '../core/rosters.js';
import { loadReadiness, READINESS_SLOT } from '../readiness/contract.js';
import { mockProvider, MOCK_TITLES } from '../readiness/mockProvider.js';
import { readinessView } from '../readiness/view.js';
import { translateDom, tr as trId } from './i18n.js';
import { autoCard, cardPlan, approveCard, cardMarkdown } from '../core/oppcard.js';
import { checkin, session as loadSession, teamDay, ITEMS, ITEM_LABEL, THRESHOLDS, MIN_BASELINE_DAYS } from '../core/wellbeing.js';
import { captureUi } from './capture_ui.js';
import { gameOf } from '../core/capture.js';
import { statGoal } from '../core/patterns.js';

// ---------- state ----------
const SHIPPED = '2026-11-03';
const S = {
  mode: 'live', // 'live' = operational data only; 'demo' = demo sandbox
  heroes: parseHeroes(DATA.heroesCsv),
  players: parsePlayerMatches(DATA.inaCsv),
  matches: Object.fromEntries(DATA.matches.map((m) => [m.id, { m, origin: 'operational', retrieved: SHIPPED, source: 'Shipped with V1 (OpenDota)' }])),
  opp: DATA.opp,
  asOf: Math.floor(Date.now() / 1000),
  rules: JSON.parse(JSON.stringify(DEFAULT_RULES)).map((r) => (r.id === 'pubgm-scoring' ? { ...r, table: DATA.profiles.standard_10_6.placement, perElim: 1 } : r)),
  pubgm: { team: null, logged: { matches: [], fights: [] }, sim: null },
  draft: { firstUs: true, steps: [], opp: 'MGL', saved: {} },
  cycle: [], db: null, dbState: 'connecting', mcp: undefined,
  me: HUB_USER ? (HUB_USER.staffKey || 'user') : (() => { try { return localStorage.getItem('hub-me') || 'aufa'; } catch { return 'aufa'; } })(),
  // Rosters: Dota 2 and PUBGM from wec.iesf.org (3 Nov); MLBB core and eFootball from the project decision log; others to be entered.
  roster: { 'Dota 2': ['Whitemon', 'Fbz', 'Jhocam', 'jikroy', 'Mikoto'], 'PUBG Mobile': ['AKxSatarrrGOLD', 'AKxAmetzGOLD', 'AKxVinzGOLD', 'AKxZaoo7GOLD'],
    MLBB: ['Aran', 'Kevin', 'Drichel', 'Lyoni', 'Jull.'], 'MLBB Women': [], eFootball: ['ELGA'], CS2: [], 'CS2 Women': [] },
  rivals: [], tiers: {}, scrims: [], reports: [],
  runbooks: {}, wecMatches: [], tourTitle: 'Dota 2', tourMatch: null, vods: [], partners: [], plans: {}, planTitle: 'Dota 2', planPlayer: null, lang: (() => { try { return localStorage.getItem('hub-lang') === 'id' ? 'id' : 'en'; } catch { return 'en'; } })(), rd: { title: 'All titles', date: localDay(), data: null, key: null }, rivalSeed: seedRosters(DATA.rivalRosters), rosterEdits: {}, oppCards: {}, crTitle: 'Dota 2', crNation: 'All', ocTitle: 'Dota 2', ocNation: 'Mongolia', compNation: 'Egypt', compAllEf: false, briefDate: localDay(),
  well: { checkins: [], loads: [] }, wellTitle: 'Dota 2', wellDate: localDay(),
  selMatch: 9057681759, selNation: 'MGL', selDay: null, freshPools: {}, importReport: null, lastFlag: null,
};
// V1.13 AI capture, debrief, patterns and trails (src/hub/capture_ui.js). Created on first use, once
// every helper below exists.
let CAP = null;
const capUi = () => (CAP ||= captureUi({ S, esc, tag, banner, setMsg, val, render, meName, sid, fillReport, localToday: localDay, shiftDay, PLATFORM,
  staffObservation, recommendationRecord, propose, saveObj, owner, rulesFor: (title) => snapshot(S.rules, title === 'PUBG Mobile' ? ['pubgm-scoring'] : title === 'Dota 2' ? ['dota-patch'] : []) }));
const heroByName = () => Object.fromEntries(Object.values(S.heroes).map((h) => [h.name.toLowerCase(), h.id]));
const accounts = () => Object.values(S.players).map((p) => p.account);
const WEC_DOTA = ['Greece', 'South Africa', 'Egypt', 'Venezuela', 'Argentina', 'Kazakhstan', 'Mongolia', 'Iran', 'Belarus', 'North Macedonia', 'New Zealand'];

// ---------- helpers ----------
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = (sel, root = document) => root.querySelector(sel);
const hname = (id) => S.heroes[id]?.name || `#${id}`;
const tag = (cls, text) => `<span class="tag ${cls}">${esc(text)}</span>`;
const ctxTag = (c) => (c ? tag(`x-${c}`, CONTEXT_LABEL[c] || c) : '');
const banner = (kind, html) => `<div class="banner ${kind}">${html}</div>`;
const rule = (id) => S.rules.find((r) => r.id === id);
const today = () => localDay();

function scoringNow() {
  const r = rule('pubgm-scoring');
  return { sc: scorer({ label: r.version, status: r.status, placement: r.table, per_elim: r.perElim }), id: r.version, status: r.status };
}

function findingList(F, { limit = 99 } = {}) {
  if (!F.length) return '<p class="empty">No findings for this data.</p>';
  return `<ul class="findings">${F.slice(0, limit).map((f) => `<li><span class="sev ${f.severity < 0 ? 'neg' : f.severity > 0 ? 'pos' : ''}" aria-hidden="true"></span><div>
    <div class="t">${f.at != null ? `<span class="ts">${mmss(f.at)}</span> ` : ''}${esc(f.title)}</div>
    <div class="meta">${tag(`k-${f.kind}`, f.kind)}${tag(`c-${f.confidence}`, f.confidence)}${ctxTag(f.context)}${f.n != null ? `<span class="note">n = ${f.n}</span>` : ''}</div>
    ${f.detail ? `<div class="d">${esc(f.detail)}</div>` : ''}</div></li>`).join('')}</ul>`;
}
function evidenceBox(ev) {
  if (!ev.length) return '';
  const e = ev[0];
  return `<dl class="kv small"><dt>Source</dt><dd>${esc(e.source)} · retrieved ${esc(e.retrieved)}</dd><dt>Roster context</dt><dd>${ctxTag(e.context)}</dd>
    <dt>Window</dt><dd>${esc(e.window || '—')}${e.patch ? ` · ${esc(e.patch)}` : ''}</dd><dt>Completeness</dt><dd>${esc(e.completeness)}</dd>
    ${e.limitations.length ? `<dt>Limits</dt><dd>${e.limitations.map(esc).join('<br>')}</dd>` : ''}</dl>`;
}
function recList(R, title, { limit = 99 } = {}) {
  if (S.mode === 'demo') return '<p class="empty">Demo sandbox: recommendations are not generated from demo data.</p>';
  if (!R.length) return '<p class="empty">No recommendation triggered by this evidence.</p>';
  const inCycle = new Set(S.cycle.filter((o) => o.title === title && !['retired', 'rejected'].includes(o.status)).map((o) => o.rec.problem));
  return `<div class="recs">${R.slice(0, limit).map((r, i) => `<div class="rec"><div class="p">${esc(r.problem)} ${tag(`c-${r.confidence}`, r.confidence)} ${r.contexts.map(ctxTag).join('')}</div><dl>
    <dt>Evidence</dt><dd>${r.evidence.map((e) => `${e.at != null ? `<span class="ts">${mmss(e.at)}</span> ` : ''}${esc(e.title)} <span class="note">(${esc(e.kind)}, n=${e.n ?? '—'})</span>`).join('<br>')}</dd>
    <dt>Why</dt><dd>${esc(r.explanation)}</dd><dt>Drill</dt><dd>${esc(r.drill)}</dd><dt>Success</dt><dd>${esc(r.success)}</dd>
    <dt>Uncertainty</dt><dd>${r.uncertainty.length ? r.uncertainty.map(esc).join('<br>') : 'None recorded'}</dd></dl>
    <div class="toolbar">${inCycle.has(r.problem) ? tag('c-Medium', 'In the coaching cycle') : r.sufficient
      ? `<button class="btn" type="button" data-propose="${i}" data-title="${esc(title)}">Send to coach review</button>`
      : `<span class="note">Not enough evidence to propose as a practice objective.</span>`}</div></div>`).join('')}</div>`;
}
function coachPanel(o) {
  if (!o) return '';
  const li = (arr, f) => (arr.length ? arr.map(f).join('') : '<li>—</li>');
  return `<p class="note">${esc(o.verdict.independence)}</p><div class="coaches">
    <section class="coach A"><header><span class="letter">A</span><h3>Strategic rules</h3></header><p class="note">${esc(o.a.focus)}</p>
      <ul>${li(o.a.points, (p) => `<li>${p.stance === 'fix' ? '<b>Fix</b>' : '<b>Build on</b>'} · ${esc(p.text)}</li>`)}</ul></section>
    <section class="coach B"><header><span class="letter">B</span><h3>Execution rules</h3></header><p class="note">${esc(o.b.focus)}</p>
      <ul>${li(o.b.points, (p) => `<li>${p.at != null ? `<span class="ts">${mmss(p.at)}</span> ` : ''}${esc(p.text.replace(/^\d+:\d\d — /, ''))}</li>`)}</ul></section>
    <section class="coach C"><header><span class="letter">C</span><h3>Challenge rules</h3></header><p class="note">${esc(o.c.focus)}</p>
      <ul>${li(o.c.challenges, (c) => `<li><b>${c.verdict === 'downgrade' ? 'Downgrade' : 'Caution'}</b> · ${esc(c.text)}</li>`)}
      ${o.c.exploits.map((e) => `<li><b>Exploit</b> · ${esc(e.text)}</li>`).join('')}</ul></section></div>
  <div class="verdict"><div class="h3">Where the rule sets disagree, and what is missing</div>
    ${o.verdict.disputed.length ? `<p><b>Disputed:</b> ${o.verdict.disputed.map((d) => `${esc(d.rec.problem)} — ${esc(d.why)}`).join(' · ')}</p>` : '<p class="note">No proposal was downgraded by the challenge rules.</p>'}
    ${o.verdict.disagreements.length ? `<p class="note"><b>Challenges raised:</b> ${o.verdict.disagreements.length}</p>` : ''}
    <ul class="plain note">${o.verdict.missing.map((m) => `<li>${esc(m)}</li>`).join('')}</ul>
    <p class="note"><b>${esc(o.verdict.humanReview)}</b></p></div>`;
}
const CLUB_BANNER = banner('real', '<div><b>Real data, club context.</b> OpenDota tournament lobbies since patch 7.41 — the players\' club games, not the national five together. Nothing here describes national-team performance.</div>');
const DEMO_BANNER = banner('synth', '<div><b>DEMO SANDBOX — synthetic data.</b> Shown only to demonstrate the software. It never feeds Today, objectives, the coaching cycle, measurement or exports.</div>');
function rulesFlag(view) {
  const p = provisional(S.rules, view);
  if (!p.length) return '';
  return banner(p.some((r) => r.status === 'blocked') ? 'block' : 'synth', `<div><b>Provisional rules affect this view:</b> ${p.map((r) => `${esc(r.label)} — ${esc(r.version)} (${esc(r.status)})`).join('; ')}. <a href="#staff-rules">Rules &amp; decisions</a></div>`);
}

// ---------- capabilities / persistence ----------
async function saveObj(o) {
  assertOperational([o], 'coaching cycle');
  const i = S.cycle.findIndex((x) => x.id === o.id);
  if (i >= 0) S.cycle[i] = o; else S.cycle.push(o);
  if (S.db) await S.db.collection('cycle').doc(o.id).set(o);
}
async function saveRules() { if (S.db) await S.db.collection('config').doc('rules').set({ rules: S.rules }); }
async function initCaps() {
  try {
    const db = await window.claude?.use?.('db');
    if (!db) { S.dbState = 'off'; render(); return; }
    S.db = db; S.dbState = 'live';
    const t = setTimeout(() => { S.dbState = 'slow'; render(); }, 10000);
    const fail = () => { S.dbState = 'off'; render(); };
    db.collection('dota_matches').onSnapshot((snap) => {
      clearTimeout(t);
      for (const d of snap.docs) { const x = d.data(); if (x?.m && x.origin === 'operational') S.matches[x.m.id] = { m: x.m, origin: 'operational', retrieved: x.retrieved || x.at?.slice(0, 10), source: x.source || 'Shared store' }; }
      render();
    }, fail);
    db.collection('pubgm_logs').onSnapshot((snap) => {
      const m = [], f = [];
      for (const d of snap.docs) { const x = d.data(); if (!x || x.origin !== 'operational') continue; (x.kind === 'fights' ? f : m).push(...tagOrigin(x.rows || [], 'operational')); }
      S.pubgm.logged = { matches: m, fights: f }; render();
    }, fail);
    db.collection('cycle').onSnapshot((snap) => { S.cycle = snap.docs.map((d) => d.data()).filter((o) => o?.origin === 'operational'); render(); }, fail);
    db.collection('rivals').onSnapshot((snap) => { S.rivals = snap.docs.map((d) => d.data()).filter((x) => x?.origin === 'operational'); render(); }, () => {});
    db.collection('rival_tiers').onSnapshot((snap) => { S.tiers = Object.fromEntries(snap.docs.map((d) => { const x = d.data(); return [`${x.title}|${x.nation}`, x]; })); render(); }, () => {});
    db.collection('scrims').onSnapshot((snap) => { S.scrims = snap.docs.map((d) => d.data()).filter((x) => x?.origin === 'operational'); render(); }, () => {});
    db.collection('scrim_reports').onSnapshot((snap) => { S.reports = snap.docs.map((d) => d.data()).filter((x) => x?.origin === 'operational'); render(); }, () => {});
    try { capUi().subscribe(db); } catch { /* older store without the V1.13 collections */ }
    db.collection('wec_matches').onSnapshot((snap) => { S.wecMatches = snap.docs.map((d) => d.data()).filter((x) => x?.origin === 'operational'); render(); }, () => {});
    db.doc('config/runbooks').onSnapshot((d) => { const x = d.data(); if (x?.runbooks) S.runbooks = x.runbooks; render(); }, () => {});
    db.collection('vods').onSnapshot((snap) => { S.vods = snap.docs.map((d) => ({ ...d.data(), id: d.id })).filter((x) => x?.origin === 'operational'); render(); }, () => {});
    db.collection('partners').onSnapshot((snap) => { S.partners = snap.docs.map((d) => ({ ...d.data(), id: d.id })).filter((x) => x?.origin === 'operational'); render(); }, () => {});
    db.collection('player_plans').onSnapshot((snap) => { S.plans = Object.fromEntries(snap.docs.map((d) => [d.id, d.data()]).filter(([, x]) => x?.origin === 'operational')); render(); }, () => {});
    db.collection('rival_rosters').onSnapshot((snap) => { S.rosterEdits = Object.fromEntries(snap.docs.map((d) => d.data()).filter((x) => x?.origin === 'operational' && x.key).map((x) => [x.key, x])); render(); }, () => {});
    db.collection('opp_cards').onSnapshot((snap) => { S.oppCards = Object.fromEntries(snap.docs.map((d) => d.data()).filter((x) => x?.origin === 'operational' && x.key).map((x) => [x.key, x])); render(); }, () => {});
    db.doc('config/roster').onSnapshot((d) => { const x = d.data(); if (x?.roster) S.roster = { ...S.roster, ...x.roster }; render(); }, () => {});
    // Wellbeing collections are readable and writable by editors only (declared in the page's db rules).
    db.collection('wellbeing_checkins').onSnapshot((snap) => { S.well.checkins = snap.docs.map((d) => d.data()).filter((x) => x?.origin === 'operational'); S.wellAccess = 'ok'; render(); }, () => { S.wellAccess = 'denied'; render(); });
    db.collection('wellbeing_load').onSnapshot((snap) => { S.well.loads = snap.docs.map((d) => d.data()).filter((x) => x?.origin === 'operational'); render(); }, () => {});
    db.doc('config/rules').onSnapshot((d) => { const x = d.data(); if (x?.rules) S.rules = x.rules; render(); }, () => {});
    db.collection('dota_pools').onSnapshot((snap) => {
      for (const d of snap.docs) { const x = d.data(); if (x?.games && S.players[d.id]) { S.players[d.id].games = x.games; S.freshPools[d.id] = x.at; } }
      render();
    }, () => {});
  } catch { S.dbState = 'off'; render(); }
}
async function browserFetchText(url) {
  if (HUB_USER) { const r = await fetch(url); if (!r.ok) throw new Error(`OpenDota answered ${r.status}. Try again later or use the file / paste route.`); return r.text(); }
  if (S.mcp === undefined) S.mcp = (await window.claude?.use?.('mcp')) || null;
  if (!S.mcp) throw new Error('Fetching needs the Claude desktop app. Use the file or paste route below — it works everywhere.');
  await S.mcp.callTool('host:claude_browser', 'navigate', { url });
  const r = await S.mcp.callTool('host:claude_browser', 'get_page_text', { max_chars: 4000000 });
  const text = typeof r.payload === 'string' ? r.payload : (r.content || []).find((c) => c.type === 'text')?.text || JSON.stringify(r.payload ?? '');
  const a = Math.min(...['{', '['].map((c) => { const i = text.indexOf(c); return i < 0 ? Infinity : i; }));
  const b = Math.max(text.lastIndexOf('}'), text.lastIndexOf(']'));
  return a === Infinity || b < a ? text : text.slice(a, b + 1);
}

// ---------- data contexts ----------
function pubgmData() {
  const demo = S.mode === 'demo';
  const rows = demo ? tagOrigin(parseCSV(DATA.pubgmMatchesCsv), 'demo') : S.pubgm.logged.matches;
  const fights = demo ? tagOrigin(parseCSV(DATA.pubgmFightsCsv), 'demo') : S.pubgm.logged.fights;
  const teams = [...new Set(rows.map((r) => r.team))];
  let team = S.pubgm.team;
  if (!teams.includes(team)) team = demo ? 'INA (demo)' : teams.find((t) => /^INA|indonesia/i.test(t)) || teams[0] || null;
  const { sc, id, status } = scoringNow();
  return { rows, fights, teams, team, sc, scoringId: id, scoringStatus: status, origin: demo ? 'demo' : 'operational' };
}
const pubgmRun = (d, filter = () => true) => {
  const rows = d.rows.filter(filter); const ids = new Set(rows.map((r) => r.match_id));
  return pubgmPipeline({ rows, fights: d.fights.filter((f) => ids.has(f.match_id)), team: d.team, sc: d.sc, origin: d.origin, scoringId: d.scoringId });
};
const dotaTeam = () => dotaTeamPipeline(S.players, S.heroes, S.asOf, Object.keys(S.freshPools).length ? `refreshed ${Object.values(S.freshPools)[0].slice(0, 10)}` : SHIPPED);

// ---------- routing ----------
// Every title outside the two engine-backed ones (Dota 2, PUBG Mobile) gets the same four tabs.
const GAME_HUBS = [
  { id: 'mlbb', label: 'MLBB', title: 'MLBB', team: 'mlbb', draft: true },
  { id: 'mlbbw', label: 'MLBB Women', title: 'MLBB Women', team: 't-mlbbw', draft: true },
  { id: 'efootball', label: 'eFootball', title: 'eFootball', team: 't-efootball' },
  { id: 'cs2', label: 'CS2', title: 'CS2', team: 't-cs2' },
  { id: 'cs2w', label: 'CS2 Women', title: 'CS2 Women', team: 't-cs2w' },
];
const hubTabs = (h) => [[h.team, 'Team'], [`${h.team}-scrims`, 'Scrims & practice'], [`${h.team}-reports`, 'Scrim reports'], ...(gameOf(h.title) ? [[`${h.team}-patterns`, 'Patterns']] : []), [`${h.team}-rivals`, 'Competitors'], ...(h.draft ? [[`${h.team}-draft`, 'Draft Lab']] : [])];
const TITLES = [
  { id: 'home', label: 'Today', tabs: [['today', 'My day'], ['board', 'Juara Umum board'], ['reports-all', 'Scrim reports'], ['brief', 'Weekly brief']] },
  { id: 'comp', label: 'Competitors', tabs: [['comp-overview', 'All nations'], ['comp-nation', 'Nation profile'], ['comp-rosters', 'Rosters & players'], ['comp-card', 'Opponent card'], ['comp-coverage', 'Scouting coverage']] },
  { id: 'tour', label: 'Tournament', tabs: [['tour-runbook', 'Match-day runbook'], ['tour-series', 'Between games']] },
  { id: 'dota', label: 'Dota 2', tabs: [['dota-team', 'Team'], ['dota-scrims', 'Scrims & practice'], ['dota-reports', 'Scrim reports'], ['dota-patterns', 'Patterns'], ['dota-post', 'Post-match'], ['dota-scout', 'Competitors'], ['dota-draft', 'Draft room'], ['dota-review', 'Series review']] },
  { id: 'pubgm', label: 'PUBG Mobile', tabs: [['pubgm-team', 'Team'], ['pubgm-scrims', 'Scrims & practice'], ['pubgm-reports', 'Scrim reports'], ['pubgm-log', 'Log & import'], ['pubgm-rivals', 'Competitors'], ['pubgm-sim', 'Strategy sim'], ['pubgm-review', 'Match-day review']] },
  ...GAME_HUBS.map((h) => ({ id: h.id, label: h.label, tabs: hubTabs(h) })),
  { id: 'well', label: 'Performance', tabs: [['readiness', 'Athlete readiness (preview)'], ['players', 'Player plans'], ['well-day', 'Wellbeing check'], ['well-log', 'Log check-in & load']] },
  { id: 'staff', label: 'Staff', tabs: [['staff-cycle', 'Coaching cycle'], ['staff-measure', 'Is it working?'], ['staff-rules', 'Rules & decisions'], ['staff-sources', 'Sources & limits'], ...(HUB_USER?.isAdmin ? [['admin-users', 'Users & access']] : [])] },
];
const viewOf = () => { const h = location.hash.slice(1); return TITLES.some((t) => t.tabs.some(([id]) => id === h)) ? h : 'today'; };
function renderNav(view) {
  const title = TITLES.find((t) => t.tabs.some(([id]) => id === view));
  const pending = S.cycle.filter((o) => o.status === 'proposed').length;
  const me = STAFF.find((x) => x.id === S.me);
  $('#titles').innerHTML = (HUB_USER ? `<span class="me" title="${esc(HUB_USER.email)}">${esc(HUB_USER.name)}</span><button type="button" id="signOutBtn" class="mode">Sign out</button>`
    : `<label class="me" for="meSel">I am <select id="meSel">${STAFF.map((x) => `<option value="${x.id}" ${x.id === S.me ? 'selected' : ''}>${esc(x.name.split(' ')[0])}</option>`).join('')}</select></label>`) + TITLES.filter(groupVisible).map((t) => `<button type="button" data-go="${t.tabs[0][0]}" aria-pressed="${t === title}">${esc(t.label)}${t.id === 'staff' && pending ? ` · ${pending}` : ''}</button>`).join('')
    + `<button type="button" id="langBtn" class="lang" aria-label="${S.lang === 'id' ? 'Switch to English' : 'Ganti ke Bahasa Indonesia'}"><b${S.lang === 'en' ? ' class="on"' : ''}>EN</b><b${S.lang === 'id' ? ' class="on"' : ''}>ID</b></button>`
    + `<button type="button" id="modeBtn" class="mode ${S.mode}" aria-pressed="${S.mode === 'demo'}">${S.mode === 'demo' ? 'Leave demo sandbox' : 'Demo sandbox'}</button>`;
  $('#tabs').innerHTML = title.tabs.map(([id, label]) => `<a href="#${id}" ${id === view ? 'aria-current="page"' : ''}>${esc(label)}</a>`).join('');
}

// ---------- views ----------
const V = {};
let LAST = { recs: {} }; // recommendation records shown on the current view, for the propose buttons

function todayCard(item) {
  if (item.kind === 'reviewed') {
    const o = item.obj; const rv = o.reviews.at(-1);
    return `<li>${tag('c-Verified', o.status === 'modified' ? 'Modified by coach' : 'Accepted by coach')} <b>${esc(o.rec.problem)}</b><br><span class="note">${esc(rv.reviewer)}, ${esc(rv.at.slice(0, 10))} · Drill: ${esc(o.objective.drill)}</span><br><span class="note">Done when: ${esc(o.objective.success)}</span><br><span class="note">Next: ${esc(nextStep(o, S.rules))}</span></li>`;
  }
  if (item.kind === 'awaiting-review') return `<li>${tag('c-Low', 'Proposed — awaiting coach review')} <b>${esc(item.obj.rec.problem)}</b><br><span class="note">Not a training decision until the title coach reviews it. <a href="#staff-cycle">Review</a></span></li>`;
  return `<li>${tag('c-Low', 'Engine proposal — not reviewed')} <b>${esc(item.rec.problem)}</b> ${item.rec.contexts.map(ctxTag).join('')}<br><span class="note">${esc(item.rec.uncertainty[0] || '')}</span></li>`;
}
function queueHtml(meId) {
  const me = STAFF.find((x) => x.id === meId);
  const q = queueFor(meId, S.cycle);
  const reviews = q.filter((o) => o.status === 'proposed');
  const toLog = q.filter((o) => ['accepted', 'modified'].includes(o.status) && (!o.sessions.length || o.decisions.some((d) => d.sessionId === o.sessions.at(-1).id)));
  const toDecide = q.filter((o) => o.sessions.length && !o.decisions.some((d) => d.sessionId === o.sessions.at(-1).id));
  const flagged = S.cycle.filter((o) => changedSince(o.rules, S.rules).length && !['retired', 'rejected'].includes(o.status));
  const item = (o, what) => `<li><b>${esc(o.title)}</b> · ${esc(o.rec.problem)} <span class="note">— ${esc(what)}</span> <a href="#staff-cycle">Open</a></li>`;
  return `<div class="panel"><h2>${esc(me.name)} — ${esc(me.role)}</h2><p class="note">Focus: ${esc(me.focus.join(', '))}${me.oversight ? ` · oversees ${esc(me.oversight)}` : ''}</p>
    <div class="stats"><div class="stat"><span class="k">To review</span><span class="v">${reviews.length}</span></div><div class="stat"><span class="k">To practise / log</span><span class="v">${toLog.length}</span></div><div class="stat"><span class="k">Decisions due</span><span class="v">${toDecide.length}</span></div>${meId === 'fayad' ? `<div class="stat"><span class="k">Rule changes to re-check</span><span class="v">${flagged.length}</span></div>` : ''}</div>
    ${reviews.length + toLog.length + toDecide.length ? `<ul class="plain">${reviews.map((o) => item(o, 'review: accept, modify or reject')).join('')}${toDecide.map((o) => item(o, `decide after ${o.sessions.at(-1).id}`)).join('')}${toLog.map((o) => item(o, 'run the drill and log the session')).join('')}</ul>` : '<p class="empty">Nothing in your queue.</p>'}</div>`;
}
function wellTodayPanel() {
  if (S.wellAccess === 'denied') return `<div class="panel"><h2>Wellbeing</h2>${banner('block', HUB_USER ? '<div>Wellbeing records are limited to the readiness owner and admins.</div>' : '<div>Wellbeing records are visible to editors only.</div>')}</div>`;
  const date = localDay();
  const rows = WEC_TITLES.map((t) => ({ t: t.id, d: teamDay(S.roster[t.id] || [], date, S.well.checkins, S.well.loads) }));
  const flagged = rows.flatMap((r) => r.d.toCheck.map((x) => ({ title: r.t, ...x })));
  return `<div class="panel"><h2>Wellbeing today</h2><div class="tw"><table><thead><tr><th>Title</th><th class="n">Check-ins</th><th class="n">To talk to</th></tr></thead><tbody>
    ${rows.map((r) => `<tr><td>${esc(r.t)}</td><td class="n">${r.d.total ? `${r.d.done}/${r.d.total}` : 'roster not entered'}</td><td class="n">${r.d.toCheck.length}</td></tr>`).join('')}</tbody></table></div>
    ${flagged.length ? `<ul class="plain">${flagged.map((f) => `<li><b>${esc(f.player)}</b> (${esc(f.title)}): ${f.flags.filter((x) => x.level === 'check').map((x) => esc(x.text)).join(' ')}</li>`).join('')}</ul>` : '<p class="note">No flags today.</p>'}<div class="toolbar"><a class="btn" href="#well-day">Daily check</a></div></div>`;
}
V.today = () => {
  if (S.mode === 'demo') return `<div class="panel">${DEMO_BANNER}<p>Today shows operational evidence only. Leave the demo sandbox to see it.</p></div>`;
  const me = STAFF.find((x) => x.id === S.me) || STAFF[0];
  const d = dotaTeam();
  const pd = pubgmData(); const p = pubgmRun(pd);
  const titlePanel = (title) => {
    if (title === 'Dota 2') { const L = todayList(S.cycle, d.recs, 'Dota 2'); return `<div class="panel"><h2>Dota 2</h2>${CLUB_BANNER}${L.length ? `<ul class="plain today">${L.map(todayCard).join('')}</ul>` : '<p class="empty">No proposals with enough evidence.</p>'}<div class="toolbar"><a class="btn" href="#dota-team">Evidence</a></div></div>`; }
    if (title === 'PUBG Mobile') { const L = todayList(S.cycle, p.insufficient ? [] : p.recs, 'PUBG Mobile'); return `<div class="panel"><h2>PUBG Mobile</h2>${p.insufficient ? banner('block', `<div><b>Not enough operational evidence.</b> ${esc(p.insufficient)} <a href="#pubgm-log">Log scrims</a>.</div>`) : ''}${L.length ? `<ul class="plain today">${L.map(todayCard).join('')}</ul>` : ''}</div>`; }
    const L = todayList(S.cycle, [], title);
    return `<div class="panel"><h2>${esc(title)}</h2>${L.length ? `<ul class="plain today">${L.map(todayCard).join('')}</ul>` : `<p class="empty">No objectives yet. Add a staff observation from Draft Lab, VOD or scrims.</p>`}<div class="toolbar"><a class="btn" href="#${TEAM_TAB[title] || 'mlbb'}">Add observation</a></div></div>`;
  };
  const titles = me.id === 'donny' ? [] : me.id === 'fayad' ? ['PUBG Mobile', 'eFootball', 'MLBB Women', 'Dota 2', 'MLBB'] : me.focus;
  return `<div class="panel"><div class="lead">What do we <em>train today</em>?</div>
    <p>Accepted objectives first. Anything not yet reviewed is a proposal, not a training decision. Choose who you are at the top to see your queue.</p></div>
    ${queueHtml(me.id)}
    ${me.id === 'donny' || me.id === 'fayad' ? wellTodayPanel() : ''}
    ${(() => { const mine = me.id === 'aufa' || me.id === 'user' ? me.focus : WEC_TITLES.map((t) => t.id); const up = S.scrims.filter((x) => mine.includes(x.title) && x.status === 'planned').sort((a, b) => a.date.localeCompare(b.date)).slice(0, 6);
      return up.length ? `<div class="panel"><h2>Scrims and practice coming up</h2><ul class="plain">${up.map((x) => `<li><b>${esc(x.date)}</b> ${esc(x.time)} · ${esc(x.title)} · ${esc(x.kind)}${x.partner ? ` vs ${esc(x.partner)}` : ''}${x.mirrors ? ` (stand-in for ${esc(x.mirrors)})` : ''}${x.date < today() ? ' — <b>result not logged</b>' : ''}</li>`).join('')}</ul></div>` : ''; })()}
    ${(() => { const mine = me.id === 'aufa' || me.id === 'user' ? me.focus : WEC_TITLES.map((t) => t.id); const t0 = localToday();
      const rows = mine.filter((t) => GAME_SPEC[t]).map((t) => ({ t, s: reportSummary(S.reports, t, t0) }));
      return rows.length ? `<div class="panel"><h2>Scrim reports</h2><ul class="plain">${rows.map((r) => `<li><b>${esc(r.t)}</b> — ${r.s.last ? (r.s.daysSince === 0 ? 'report filed today' : `last report ${r.s.daysSince} day(s) ago`) : 'no report yet'} <a href="#${REPORT_TAB[r.t]}">${r.s.daysSince === 0 ? 'Open' : 'File one'}</a></li>`).join('')}</ul></div>` : ''; })()}
    <div class="cols">${titles.map(titlePanel).join('')}</div>`;
};

// Juara Umum board: every title on one page, for the Head Coach and the BOD conversation.
const PLAN_V3 = { 'MLBB Women': 75, MLBB: 40, eFootball: 40, 'PUBG Mobile': 35, 'Dota 2': 35, CS2: 10, 'CS2 Women': 5 };
V.board = () => {
  const since = shiftDay(localDay(), -7);
  const today = localDay();
  const rows = WEC_TITLES.map((t) => {
    const objs = S.cycle.filter((o) => o.title === t.id);
    const active = objs.filter((o) => ['accepted', 'modified'].includes(o.status)).length;
    const pending = objs.filter((o) => o.status === 'proposed').length;
    const sess7 = objs.reduce((a, o) => a + o.sessions.filter((x) => x.date >= since).length, 0);
    const met = objs.flatMap((o) => o.sessions).filter((x) => x.result === 'met').length;
    const roster = S.roster[t.id] || [];
    const wd = teamDay(roster, today, S.well.checkins, S.well.loads);
    let evidence;
    if (t.id === 'Dota 2') { const nat = Object.values(S.matches).filter((r) => { try { return dotaMatchPipeline(r, accounts(), S.heroes).context.context === 'national'; } catch { return false; } }).length; evidence = nat ? `${nat} national match(es) imported` : 'Club data only — no national scrims yet'; }
    else if (t.id === 'PUBG Mobile') { const n = new Set(S.pubgm.logged.matches.map((r) => r.match_id)).size; evidence = n ? `${n} scrim match(es) logged` : 'No scrims logged'; }
    else if (t.engine === 'draftlab') evidence = t.id === 'MLBB' ? 'Draft Lab: MPL ID S18 (TLID club data)' : 'Draft Lab: no women\'s data yet';
    else evidence = 'Staff observations only';
    const blockers = [...provisional(S.rules, t.id === 'Dota 2' ? 'dota-draft' : t.id === 'PUBG Mobile' ? 'pubgm-team' : 'none').filter((r) => r.status === 'blocked' || r.status === 'unverified').map((r) => r.label)];
    if (!roster.length) blockers.push('Roster not entered in hub');
    if (t.id === 'eFootball') blockers.push('Coach not named; entry not on IESF site');
    const rb = rivalBoard(t.id, S.rivals, S.tiers); const ss = scrimSummary(S.scrims, t.id, localDay());
    return { t, own: ownerNote(t.id), objs: objs.length, active, pending, sess7, met, wd, roster, evidence, blockers, rb, ss };
  });
  return `<div class="panel"><div class="lead">Road to <em>Juara Umum</em></div>
    <p>One line per title: who owns it, what evidence exists, whether the coaching cycle is running, and what blocks it. The overall-title scoring rule is not published yet, so the board does not compute medal tables.</p>
    ${banner('block', '<div><b>Overall-title (Juara Umum) scoring: not published.</b> Owner: PB ESI intl. relations. Until it is, gold count is the working target (BOD plan: Juara Umum primary, 4 golds stretch).</div>')}
    <div class="tw"><table class="board-t"><thead><tr><th>Title</th><th>Focus owner</th><th>Title coach</th><th>Evidence</th><th class="n">Objectives (active / to review)</th><th class="n">Sessions 7 d</th><th class="n">Scrims 7 d / planned</th><th class="n">Rivals with notes</th><th class="n">Wellbeing check-ins today</th><th>Blockers</th></tr></thead><tbody>
    ${rows.map((r) => `<tr><td><b>${esc(r.t.id)}</b></td><td>${esc(r.own)}</td><td>${esc(r.t.coach)}</td><td>${esc(r.evidence)}</td><td class="n">${r.active} / ${r.pending}</td><td class="n">${r.sess7}</td><td class="n">${r.ss.last7} / ${r.ss.upcoming.length}</td><td class="n">${r.rb.covered}/${r.rb.field}</td><td class="n">${r.roster.length ? `${r.wd.done}/${r.wd.total}` : '—'}</td><td class="note">${r.blockers.map(esc).join('; ') || '—'}</td></tr>`).join('')}</tbody></table></div></div>
  <div class="cols"><div class="panel"><h2>Where the cycle is not running</h2><ul class="plain">${rows.filter((r) => !r.active).map((r) => `<li><b>${esc(r.t.id)}</b> — no accepted objective. ${r.pending ? `${r.pending} waiting for ${esc(owner(r.t.id).name)}.` : 'Nothing proposed yet.'}</li>`).join('') || '<li>Every title has an accepted objective.</li>'}</ul></div>
    <div class="panel"><h2>BOD planning assumptions (29 Oct, v3)</h2><p class="note">Staff estimates of each title's gold chance from the BOD plan. Not computed by the hub and not evidence: shown so the staff can see where the plan expects golds and revise it.</p>
      <div class="tw"><table><thead><tr><th>Title</th><th class="n">Plan estimate</th></tr></thead><tbody>${Object.entries(PLAN_V3).map(([k, v]) => `<tr><td>${esc(k)}</td><td class="n">${v}%</td></tr>`).join('')}</tbody></table></div>
      <p class="note">v3 total ≈ 2.4 golds base, 16% chance of 4+ (decision log). Revise in the planning workbook, not here.</p></div></div>`;
};

// ---------- competitors & scrims (all titles) ----------
const sid = (x) => x.replace(/[^A-Za-z0-9_\-.]/g, '_');
function competitorsPanel(title) {
  const B = rivalBoard(title, S.rivals, S.tiers);
  const big = B.field > 20;
  const shown = big ? B.rows.filter((r) => r.notes.length || r.tier !== 'not assessed') : B.rows;
  const fid = sid(title);
  return `<div class="panel"><h2>Competitors — ${esc(title)}</h2>
    <p class="note">Field: ${B.field} nations (${esc(FIELD_SOURCE)}). ${B.covered} with notes. Threat tiers are staff judgements with a reason, never computed.</p>
    ${shown.length ? `<div class="tw"><table><thead><tr><th>Nation</th><th>Staff tier</th><th class="n">Titles at WEC</th><th>What we know</th></tr></thead><tbody>
      ${shown.map((r) => `<tr><td><b>${esc(r.nation)}</b></td><td>${tag(r.tier === 'main threat' ? 'c-Blocked' : r.tier === 'contender' ? 'c-Low' : r.tier === 'watch' ? 'c-Medium' : 'k-observed', r.tier)}${r.tierBy ? `<br><span class="note">${esc(r.tierBy)}: ${esc(r.tierWhy)}</span>` : ''}</td><td class="n">${r.multi}</td>
        <td>${r.notes.length ? r.notes.slice(0, 3).map((n) => `<div>${tag(`k-${n.kind}`, n.kind)} ${esc(n.note)} <span class="note">— ${esc(n.source)}, ${esc(n.date)}${n.by ? `, ${esc(n.by)}` : ''}</span></div>`).join('') : '<span class="note">Nothing yet</span>'}</td></tr>`).join('')}</tbody></table></div>` : '<p class="empty">No nation assessed yet.</p>'}
    ${big ? `<details><summary class="note">Full field (${B.field})</summary><p class="note">${B.rows.map((r) => esc(r.nation)).join(' · ')}</p></details>` : ''}
    ${S.mode === 'demo' ? '' : `<details><summary class="btn">Add a note or set a tier</summary><div class="form">
      <label class="field" for="rvN-${fid}">Nation<select id="rvN-${fid}">${(FIELDS[title] || []).map((n) => `<option>${esc(n)}</option>`).join('')}</select></label>
      <label class="field" for="rvK-${fid}">Kind<select id="rvK-${fid}"><option value="observed">Observed</option><option value="hypothesis">Hypothesis</option></select></label>
      <label class="field" for="rvS-${fid}">Source<input type="text" id="rvS-${fid}" placeholder="VOD link, tournament, Liquipedia page, scrim"></label>
      <label class="field" for="rvB-${fid}">By<input type="text" id="rvB-${fid}" value="${esc(STAFF.find((x) => x.id === S.me)?.name || '')}"></label></div>
      <label class="field" for="rvT-${fid}">Note<input type="text" id="rvT-${fid}" placeholder="Roster, style, draft habits, recent results"></label>
      <div class="toolbar"><button class="btn primary" type="button" data-rival-note="${esc(title)}">Save note</button></div>
      <div class="form"><label class="field" for="tiT-${fid}">Tier<select id="tiT-${fid}">${TIERS.map((t) => `<option>${t}</option>`).join('')}</select></label><label class="field" for="tiW-${fid}">Why (required)<input type="text" id="tiW-${fid}"></label></div>
      <div class="toolbar"><button class="btn" type="button" data-rival-tier="${esc(title)}">Set tier for selected nation</button><span class="msg" id="rvMsg-${fid}"></span></div></details>`}</div>${vodPanel(title)}`;
}
function scrimsPanel(title) {
  const Sm = scrimSummary(S.scrims, title, localDay());
  const objs = S.cycle.filter((o) => o.title === title && ['accepted', 'modified'].includes(o.status));
  const fid = sid(title);
  const objName = (id) => S.cycle.find((o) => o.id === id)?.rec.problem || id;
  const card = (sc) => `<div class="obj"><header><div><span class="note">${esc(sc.date)}${sc.time ? ` ${esc(sc.time)}` : ''} · ${esc(sc.kind)}${sc.format ? ` · ${esc(sc.format)}` : ''} · owner ${esc(sc.owner)}</span><h3>${sc.partner ? `vs ${esc(sc.partner)}` : esc(sc.kind)}${sc.mirrors ? ` <span class="note">(stand-in for ${esc(sc.mirrors)})</span>` : ''}</h3></div>${tag(sc.status === 'done' ? 'c-Verified' : sc.status === 'cancelled' ? 'c-Blocked' : 'c-Low', sc.status)}</header>
    ${sc.objectives.length ? `<p class="note">Practising: ${sc.objectives.map((id) => esc(objName(id))).join('; ')}</p>` : '<p class="note">No objective attached: free scrim.</p>'}
    ${sc.result ? `<p>${sc.result.score ? `<b>${esc(sc.result.score)}</b> · ` : ''}${sc.result.matchIds.length ? `matches ${sc.result.matchIds.map(esc).join(', ')} · ` : ''}${esc(sc.result.notes || sc.result.cancelledWhy)} <span class="note">— ${esc(sc.result.by)}</span></p>` : `<details><summary class="btn">Log result</summary><div class="form">
      <label class="field" for="scS-${sc.id}">${title === 'PUBG Mobile' ? 'Points / placement' : 'Score (e.g. 2-1)'}<input type="text" id="scS-${sc.id}"></label>
      <label class="field" for="scM-${sc.id}">Match IDs (comma-separated)<input type="text" id="scM-${sc.id}"></label>
      <label class="field" for="scB-${sc.id}">Logged by<input type="text" id="scB-${sc.id}" value="${esc(STAFF.find((x) => x.id === S.me)?.name || '')}"></label>
      <label class="field" for="scN-${sc.id}">Notes<input type="text" id="scN-${sc.id}"></label></div>
      ${sc.objectives.map((id) => `<div class="form"><label class="field" for="scR-${sc.id}-${id}">Result for: ${esc(objName(id))}<select id="scR-${sc.id}-${id}"><option value="">skip</option><option>met</option><option>partly-met</option><option>not-met</option><option>not-measured</option></select></label><label class="field" for="scV-${sc.id}-${id}">Measured value<input type="text" id="scV-${sc.id}-${id}"></label></div>`).join('')}
      <div class="toolbar"><button class="btn primary" type="button" data-scrim-done="${esc(sc.id)}">Save result</button><button class="btn" type="button" data-scrim-cancel="${esc(sc.id)}">Cancelled</button><span class="msg" id="scMsg-${sc.id}"></span></div></details>`}</div>`;
  return `<div class="panel"><h2>Scrims &amp; practice — ${esc(title)}</h2>
    <div class="stats"><div class="stat"><span class="k">Planned</span><span class="v">${Sm.upcoming.length}</span></div><div class="stat"><span class="k">Overdue to log</span><span class="v">${Sm.overdue.length}</span></div><div class="stat"><span class="k">Done, last 7 days</span><span class="v">${Sm.last7}</span></div>
    <div class="stat"><span class="k">Done with an objective</span><span class="v">${Sm.done.length ? `${Sm.withObjective}/${Sm.done.length}` : '—'}</span></div><div class="stat"><span class="k">Rivals practised against (stand-ins)</span><span class="v">${Sm.mirrored.length}</span></div></div>
    <p class="note">Attach accepted objectives to a scrim; logging its result also logs a session on each of them. Use "stand-in for" when a sparring partner plays like a WEC rival.</p></div>
  ${S.mode === 'demo' ? '' : `<div class="panel"><h2>Plan a session</h2><div class="form">
    <label class="field" for="spD-${fid}">Date<input type="date" id="spD-${fid}" value="${today()}"></label><label class="field" for="spTm-${fid}">Time<input type="text" id="spTm-${fid}" placeholder="19:00 WIB"></label>
    <label class="field" for="spK-${fid}">Kind<select id="spK-${fid}">${SCRIM_KINDS.map((k) => `<option>${k}</option>`).join('')}</select></label>
    <label class="field" for="spF-${fid}">Format<select id="spF-${fid}"><option value=""></option>${FORMATS.map((k) => `<option ${title === 'PUBG Mobile' && k === 'Lobby (BR)' ? 'selected' : ''}>${k}</option>`).join('')}</select></label>
    <label class="field" for="spP-${fid}">Sparring partner<input type="text" id="spP-${fid}" placeholder="Team name" list="pbList-${fid}"></label><datalist id="pbList-${fid}">${S.partners.filter((p) => p.title === title).map((p) => `<option value="${esc(p.name)}">${esc(p.level)}${p.resembles ? ` · like ${esc(p.resembles)}` : ''}</option>`).join('')}</datalist>
    <label class="field" for="spL-${fid}">Partner level<select id="spL-${fid}"><option value=""></option><option>Tier 1 international</option><option>Tier 1 domestic</option><option>Tier 2</option><option>Academy / amateur</option></select></label>
    <label class="field" for="spMi-${fid}">Stand-in for (WEC rival)<select id="spMi-${fid}"><option value=""></option>${(FIELDS[title] || []).map((n) => `<option>${esc(n)}</option>`).join('')}</select></label>
    <label class="field" for="spO-${fid}">Owner<input type="text" id="spO-${fid}" value="${esc(STAFF.find((x) => x.id === S.me)?.name || '')}"></label></div>
    ${objs.length ? `<fieldset class="objpick"><legend class="note">Objectives to practise</legend>${objs.map((o) => `<label><input type="checkbox" name="spObj-${fid}" value="${esc(o.id)}"> ${esc(o.rec.problem)}</label>`).join('')}</fieldset>` : '<p class="note">No accepted objective for this title yet: the scrim will be logged without one.</p>'}
    <div class="toolbar"><button class="btn primary" type="button" data-scrim-plan="${esc(title)}">Add to plan</button><span class="msg" id="spMsg-${fid}"></span></div></div>`}
  <div class="cols"><div class="panel"><h2>Upcoming${Sm.overdue.length ? ' and overdue' : ''}</h2>${[...Sm.overdue, ...Sm.upcoming].map(card).join('') || '<p class="empty">Nothing planned.</p>'}</div>
  <div class="panel"><h2>Done</h2>${Sm.done.slice(0, 12).map(card).join('') || '<p class="empty">No scrims logged yet.</p>'}
    ${Object.keys(Sm.partners).length ? `<div class="h3">Sparring partners</div><ul class="plain">${Object.entries(Sm.partners).map(([k, v]) => `<li>${esc(k)} — ${v.length} scrim${v.length > 1 ? 's' : ''}</li>`).join('')}</ul>` : ''}</div></div>${partnerPanel(title)}`;
}
const OBS_TITLES = ['MLBB', 'MLBB Women', 'eFootball', 'CS2', 'CS2 Women', 'Dota 2', 'PUBG Mobile'];
function observationForm(defTitle) {
  return `<div class="form"><label class="field" for="obT">Title<select id="obT">${OBS_TITLES.map((t) => `<option ${t === defTitle ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></label>
    <label class="field" for="obBy">Observed by<input type="text" id="obBy" list="staffNames" value="${esc(STAFF.find((x) => x.id === S.me)?.name || '')}"></label>
    <label class="field" for="obSrc">Source<input type="text" id="obSrc" placeholder="Scrim ID, VOD link, Draft Lab view"></label>
    <label class="field" for="obN">Games it is based on<input type="number" id="obN" min="1" placeholder="e.g. 4"></label>
    <label class="field" for="obK">Kind<select id="obK"><option value="observed">Observed (seen in the games)</option><option value="hypothesis">Hypothesis (needs checking)</option></select></label>
    <label class="field" for="obC">Roster context<select id="obC"><option value="national">National team</option><option value="mixed">Partial roster</option><option value="club">Club games</option></select></label></div>
    <label class="field" for="obO">Observation (the problem)<input type="text" id="obO" placeholder="e.g. Red-side drafts lose the lane-priority heroes in phase 1"></label>
    <div class="form"><label class="field" for="obD">Proposed drill<input type="text" id="obD"></label><label class="field" for="obS">Success criterion (measurable)<input type="text" id="obS"></label></div>
    <datalist id="staffNames">${STAFF.map((x) => `<option value="${esc(x.name)}"></option>`).join('')}${WEC_TITLES.filter((t) => !/TBD|see WEC/.test(t.coach)).map((t) => `<option value="${esc(t.coach)}"></option>`).join('')}</datalist>
    <div class="toolbar"><button class="btn primary" type="button" id="obSave">Send to review</button><span class="msg" id="obMsg"></span></div>`;
}
// ---------- scrim reports (all titles) ----------
const localToday = localDay;
const safeUrl = (u) => (/^https?:\/\//i.test(u) ? u : '');
const trendTag = (t) => (t === 'up' ? tag('c-Verified', 'improving') : t === 'down' ? tag('c-Blocked', 'slipping') : t === 'steady' ? tag('k-observed', 'steady') : '');
function reportCard(r) {
  const spec = GAME_SPEC[r.title];
  const pl = PROGRESS.find(([n]) => n === r.progress)?.[1] || '';
  return `<div class="obj"><header><div><span class="note">${esc(r.date)}${r.time ? ` ${esc(r.time)}` : ''}${r.format ? ` · ${esc(r.format)}` : ''} · ${esc(r.roster)} · written by ${esc(r.by)}${r._entered?.by && r._entered.by !== r.by ? ` (entered by ${esc(r._entered.by)}, ${esc(new Date(r._entered.at).toLocaleString('en-GB', { timeZone: 'Asia/Jakarta', dateStyle: 'medium', timeStyle: 'short' }))} WIB)` : ''}</span><h3>vs ${esc(r.partner)}${r.partnerLevel ? ` <span class="note">(${esc(r.partnerLevel)})</span>` : ''}</h3></div>${tag(r.progress >= 4 ? 'c-Verified' : r.progress <= 2 ? 'c-Blocked' : 'c-Low', `Plan ${r.progress}/5`)}</header>
    <p><b>${esc(resultText(r.result))}</b> · <span class="note">Practised: ${esc(r.focus)} · ${esc(pl)}</span></p>
    ${r.worked ? `<p><b>Worked:</b> ${esc(r.worked)}</p>` : ''}${r.failed ? `<p><b>Failed:</b> ${esc(r.failed)}</p>` : ''}
    ${r.detail ? `<p><b>${esc(spec.detail)}:</b> ${esc(r.detail)}</p>` : ''}${r.playerNotes ? `<p><b>Player notes:</b> ${esc(r.playerNotes)}</p>` : ''}
    <p><b>Next session:</b> ${esc(r.adjust)}</p>${safeUrl(r.vod) ? `<p class="note">VOD: <a href="${esc(safeUrl(r.vod))}" target="_blank" rel="noopener">${esc(r.vod)}</a></p>` : r.vod ? `<p class="note">VOD: ${esc(r.vod)}</p>` : ''}
    ${(r.notes || []).map((n) => `<p class="note">Correction ${esc(n.at.slice(0, 10))} — ${esc(n.by)}: ${esc(n.text)}</p>`).join('')}
    ${S.mode === 'demo' ? '' : `<details><summary class="note">Add a correction</summary><div class="form"><label class="field" for="rpN-${r.id}">Correction or follow-up<input type="text" id="rpN-${r.id}" placeholder="e.g. Score was 2-0, not 2-1"></label></div>
      <div class="toolbar"><button class="btn" type="button" data-report-note="${esc(r.id)}">Add note</button><span class="msg" id="rpNMsg-${r.id}"></span></div></details>`}</div>`;
}

// ---------- scrim report trends: two small charts, one measure each (no dual axis) ----------
function trendSvg({ days, values, kind, min = 0, max, ticks, fmt, label, tip }) {
  const W = 320, H = 132, L = 38, R = 6, T = 10, B = 22, iw = W - L - R, ih = H - T - B, n = days.length, band = iw / n;
  const y = (v) => T + ih - ((v - min) / (max - min)) * ih; const x = (i) => L + band * i + band / 2;
  const grid = ticks.map((v) => `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" class="tg"/><text x="${L - 5}" y="${y(v) + 3.5}" class="tl" text-anchor="end">${fmt(v)}</text>`).join('');
  const xl = [0, Math.floor((n - 1) / 2), n - 1].map((i) => `<text x="${x(i)}" y="${H - 6}" class="tl" text-anchor="middle">${days[i].slice(8)}/${days[i].slice(5, 7)}</text>`).join('');
  let marks = '';
  if (kind === 'bar') {
    const w = Math.max(4, band * 0.62);
    marks = values.map((v, i) => {
      if (v == null) return '';
      const x0 = x(i) - w / 2, y0 = y(v), base = T + ih, r = Math.min(4, w / 2, base - y0);
      const d = r > 0 ? `M${x0},${base}V${y0 + r}Q${x0},${y0} ${x0 + r},${y0}H${x0 + w - r}Q${x0 + w},${y0} ${x0 + w},${y0 + r}V${base}Z` : `M${x0},${base}H${x0 + w}V${base - 1}H${x0}Z`;
      return `<g class="tm"><rect x="${L + band * i}" y="${T}" width="${band}" height="${ih}" fill="transparent"/><path d="${d}" class="tb"/><title>${esc(tip(i))}</title></g>`;
    }).join('');
  } else {
    const pts = values.map((v, i) => (v == null ? null : [x(i), y(v)]));
    const segs = []; let cur = [];
    for (const p of pts) { if (p) cur.push(p); else if (cur.length) { segs.push(cur); cur = []; } }
    if (cur.length) segs.push(cur);
    marks = segs.filter((sg) => sg.length > 1).map((sg) => `<polyline points="${sg.map((p) => p.join(',')).join(' ')}" class="tline"/>`).join('')
      + pts.map((p, i) => (p ? `<g class="tm"><rect x="${L + band * i}" y="${T}" width="${band}" height="${ih}" fill="transparent"/><circle cx="${p[0]}" cy="${p[1]}" r="4" class="tdot"/><title>${esc(tip(i))}</title></g>` : '')).join('');
  }
  return `<figure class="trend"><figcaption>${esc(label)}</figcaption><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}">${grid}<line x1="${L}" x2="${W - R}" y1="${T + ih}" y2="${T + ih}" class="ta"/>${marks}${xl}</svg></figure>`;
}
function reportTrends(title) {
  const t0 = localToday(); const days = Array.from({ length: 14 }, (_, i) => shiftDay(t0, i - 13));
  const byDate = Object.fromEntries(reportDays(S.reports, title).map((d) => [d.date, d]));
  if (!days.some((d) => byDate[d])) return '';
  const pts = GAME_SPEC[title].mode === 'points';
  const res = days.map((d) => { const r = byDate[d]; if (!r) return null; if (pts) return r.points; const n = r.won + r.lost + r.drawn; return n ? Math.round((r.won / n) * 100) : null; });
  const prog = days.map((d) => byDate[d]?.progress ?? null);
  const maxPts = Math.max(10, ...res.filter((v) => v != null)); const step = Math.ceil(maxPts / 2 / 10) * 10;
  const tipRes = (i) => { const r = byDate[days[i]]; return pts ? `${days[i]}: ${r.points} pts in ${r.played} matches, ${r.n} session(s)` : `${days[i]}: ${r.won}-${r.lost}${r.drawn ? `-${r.drawn}` : ''} (${res[i]}%), ${r.n} session(s)`; };
  return `<div class="panel"><h2>Last 14 days</h2><div class="trends">
    ${trendSvg({ days, values: res, kind: 'bar', max: pts ? step * 2 : 100, ticks: pts ? [0, step, step * 2] : [0, 50, 100], fmt: (v) => (pts ? `${v}` : `${v}%`), label: pts ? 'Points by day' : `Win rate by day (${GAME_SPEC[title].unit} won)`, tip: tipRes })}
    ${trendSvg({ days, values: prog, kind: 'line', min: 1, max: 5, ticks: [1, 3, 5], fmt: (v) => `${v}`, label: 'Plan followed by day (1–5)', tip: (i) => `${days[i]}: plan followed ${prog[i]}/5 (average of ${byDate[days[i]].n} report(s))` })}
    </div><p class="note">Days without a report are left empty. Hover or tap a day for its numbers; the full list is under "Day by day".</p></div>`;
}

function reportsPanel(title) {
  const spec = GAME_SPEC[title]; const fid = sid(title); const t0 = localToday();
  const mine = S.reports.filter((r) => r.title === title);
  const Sm = reportSummary(S.reports, title, t0); const days = reportDays(S.reports, title);
  const pts = spec.mode === 'points';
  const planned = S.scrims.filter((x) => x.title === title && x.status === 'planned').sort((a, b) => a.date.localeCompare(b.date));
  const stale = Sm.daysSince != null && Sm.daysSince >= 3;
  const unit = spec.unit;
  const ready = Sm.carryOver ? `<div class="panel"><h2>Start the next session from here</h2><p>${esc(Sm.carryOver.adjust)}</p><p class="note">Adjustment written by ${esc(Sm.carryOver.by)} on ${esc(Sm.carryOver.date)}. If the next report does not mention it, ask whether it was tried.</p></div>` : '';
  const form = S.mode === 'demo' ? '' : reportForm(title, { fid, spec, pts, unit, planned, t0 });
  return `<div class="panel"><h2>Scrim reports — ${esc(title)}</h2>
    <div class="stats"><div class="stat"><span class="k">Sessions, last 7 days</span><span class="v">${Sm.sessions}</span></div>
    <div class="stat"><span class="k">${pts ? 'Points, last 7 days' : 'Record, last 7 days'}</span><span class="v">${Sm.sessions ? (pts ? `${Sm.points} (${Sm.matches} m)` : `${Sm.won}-${Sm.lost}${Sm.drawn ? `-${Sm.drawn}` : ''}`) : '—'}</span></div>
    <div class="stat"><span class="k">Plan followed (average, 1–5)</span><span class="v">${Sm.progress ?? '—'}</span>${trendTag(Sm.trend)}</div>
    <div class="stat"><span class="k">Last report</span><span class="v">${Sm.last ? (Sm.daysSince === 0 ? 'today' : `${Sm.daysSince} d ago`) : '—'}</span></div></div>
    ${stale ? banner('synth', `<div><b>No report for ${Sm.daysSince} days.</b> If sessions took place, please file them.</div>`) : ''}
    ${!mine.length ? '<p class="empty">No report yet.</p>' : ''}
    <p class="note">Progress is the coach's rating of how closely the team followed the plan of the day. It is not computed, and ratings from different coaches are not directly comparable.</p></div>
  ${reportTrends(title)}${ready}${form}
  <div class="panel"><h2>Day by day</h2>${days.length ? days.slice(0, 14).map((d) => `<details ${d.date === t0 ? 'open' : ''}><summary><b>${esc(d.date)}</b> · ${d.n} session${d.n > 1 ? 's' : ''} · ${pts ? `${d.points} pts in ${d.played} m` : `${d.won}-${d.lost}${d.drawn ? `-${d.drawn}` : ''}`} · plan ${d.progress}/5 <span class="note">— ${esc(d.focus.join('; '))}</span></summary>${d.sessions.map(reportCard).join('')}</details>`).join('') : '<p class="empty">Nothing filed yet.</p>'}
    ${days.length > 14 ? `<p class="note">${days.length - 14} older day(s) are in the CSV download.</p>` : ''}
    ${mine.length ? `<div class="toolbar"><button class="btn" type="button" data-report-csv="${esc(title)}">Download CSV</button><span class="msg" id="rpCsvMsg-${fid}"></span></div>` : ''}</div>`;
}
V['reports-all'] = () => {
  const t0 = localToday(); const dayList = Array.from({ length: 7 }, (_, i) => shiftDay(t0, i - 6));
  const rows = WEC_TITLES.filter((t) => titleVisible(t.id)).map((t) => ({ t, s: reportSummary(S.reports, t.id, t0), pts: GAME_SPEC[t.id].mode === 'points', per: dayList.map((d) => S.reports.filter((r) => r.title === t.id && r.date === d).length) }));
  const missing = rows.filter((r) => !r.per.at(-1));
  return `<div class="panel"><div class="lead">Scrim <em>reports</em></div>
    <p>What every coach filed in the last seven days, all titles. Open a title's <b>Scrim reports</b> tab to file or read the details.</p>
    ${S.reports.length ? '' : '<p class="empty">No reports filed yet. Coaches file them from each title\'s Scrim reports tab.</p>'}
    <div class="tw"><table><thead><tr><th>Title</th><th>Title coach</th>${dayList.map((d) => `<th class="n">${esc(d.slice(5))}</th>`).join('')}<th class="n">Sessions 7 d</th><th class="n">Result 7 d</th><th class="n">Plan followed</th><th>Last report</th></tr></thead><tbody>
    ${rows.map((r) => `<tr><td><b>${esc(r.t.id)}</b></td><td>${esc(r.t.coach)}</td>${r.per.map((n) => `<td class="n">${n || '<span class="note">—</span>'}</td>`).join('')}<td class="n">${r.s.sessions}</td><td class="n">${r.s.sessions ? (r.pts ? `${r.s.points} pts` : `${r.s.won}-${r.s.lost}`) : '—'}</td><td class="n">${r.s.progress ?? '—'} ${trendTag(r.s.trend)}</td><td>${r.s.last ? `${esc(r.s.last.date)} · ${esc(r.s.last.by)}` : '<span class="note">none</span>'}</td></tr>`).join('')}</tbody></table></div>
    <p class="note">Numbers in the day columns are sessions reported that day. Not every title trains every day, so an empty day is not automatically a miss.</p>
    ${S.reports.length ? '<div class="toolbar"><button class="btn" type="button" data-report-csv="*">Download all as CSV</button><span class="msg" id="rpCsvMsg-all"></span></div>' : ''}</div>
  <div class="cols"><div class="panel"><h2>No report yet today</h2>${missing.length ? `<ul class="plain">${missing.map((r) => `<li><b>${esc(r.t.id)}</b> <a href="#${REPORT_TAB[r.t.id]}">File</a> <span class="note">— last ${r.s.last ? esc(r.s.last.date) : 'never'}</span></li>`).join('')}</ul>` : '<p class="note">Every title has a report for today.</p>'}</div>
  <div class="panel"><h2>Next session starts from</h2>${rows.filter((r) => r.s.carryOver).length ? `<ul class="plain">${rows.filter((r) => r.s.carryOver).map((r) => `<li><b>${esc(r.t.id)}</b> — ${esc(r.s.carryOver.adjust)} <span class="note">(${esc(r.s.carryOver.by)}, ${esc(r.s.carryOver.date)})</span></li>`).join('')}</ul>` : '<p class="empty">Nothing yet.</p>'}</div></div>`;
};


// ---------- fast report entry: drafts, quick picks, progress buttons ----------
// Drafts are a per-device convenience (this browser only). The saved report is what counts.
const RP_KEYS = ['date', 'time', 'by', 'partner', 'level', 'format', 'roster', 'scrim', 'won', 'lost', 'drawn', 'played', 'points', 'avg', 'chicken', 'focus', 'progress', 'worked', 'failed', 'detail', 'players', 'adjust', 'vod'];
const RP_RE = new RegExp(`^rp-(.+)-(${RP_KEYS.join('|')})$`);
const RP_KEEP_AFTER_SAVE = ['time', 'by', 'level', 'format', 'roster', 'focus'];
const cap = (x) => x.charAt(0).toUpperCase() + x.slice(1);
const RP_OPTIONAL = ['time', 'level', 'format', 'roster', 'scrim', 'detail', 'players', 'vod', 'avg', 'chicken', 'drawn'];
const PROG_SHORT = { 1: 'Far off', 2: 'Mostly off', 3: 'Partly', 4: 'Mostly', 5: 'Fully' };
const rpDrafts = {};
function rpDraft(fid) {
  if (!rpDrafts[fid]) { let d = {}; try { d = JSON.parse(localStorage.getItem(`hub-rp-draft-${fid}`) || '{}') || {}; } catch { d = {}; } rpDrafts[fid] = d; }
  return rpDrafts[fid];
}
function storeDraft(fid, d) {
  rpDrafts[fid] = d;
  try { if (Object.keys(d).some((k) => k !== 'at' && d[k] !== '')) localStorage.setItem(`hub-rp-draft-${fid}`, JSON.stringify(d)); else localStorage.removeItem(`hub-rp-draft-${fid}`); } catch { /* per-device convenience only */ }
}
function draftField(el) {
  const m = el?.id?.match(RP_RE); if (!m) return;
  const d = { ...rpDraft(m[1]), [m[2]]: el.value, at: new Date().toISOString() }; storeDraft(m[1], d);
  el.removeAttribute('aria-invalid');
}
function fillReport(fid, values) {
  for (const [k, v] of Object.entries(values)) {
    const el = document.getElementById(`rp-${fid}-${k}`); if (!el) continue;
    if (el.tagName === 'SELECT' && v && ![...el.options].some((o) => o.value === v)) continue;
    el.value = v; draftField(el);
    if (k === 'progress') document.querySelectorAll(`[data-rp-prog="${fid}"]`).forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.v === String(v))));
    if (RP_OPTIONAL.includes(k) && v && !(k === 'roster' && v === ROSTER_PLAYED[0])) { const det = el.closest('details'); if (det) det.open = true; }
  }
}
const ERR_FIELD = [[/future|Date/, 'date'], [/Who wrote/, 'by'], [/sparring partner/, 'partner'], [/Matches played/, 'played'], [/Total points|points is required/i, 'points'], [/placement/, 'avg'], [/Won|Lost|Drawn|at least one|whole number/, 'won'], [/practise/, 'focus'], [/1 to 5/, 'progress'], [/worked or what failed/, 'worked'], [/adjustment/, 'adjust'], [/Player notes/, 'players']];
function markInvalid(fid, message) {
  const key = ERR_FIELD.find(([re]) => re.test(message))?.[1]; if (!key) return;
  const el = key === 'progress' ? document.querySelector(`[data-rp-prog="${fid}"]`) : document.getElementById(`rp-${fid}-${key}`); if (!el) return;
  const det = el.closest('details'); if (det) det.open = true;
  if (key !== 'progress') el.setAttribute('aria-invalid', 'true');
  el.focus();
}
const chip = (fid, values, label, extra = '') => `<button type="button" class="chip${extra}" data-rp-fill="${esc(JSON.stringify({ fid, v: values }))}">${esc(label)}</button>`;
function reportForm(title, { fid, spec, pts, unit, planned, t0 }) {
  const d = rpDraft(fid); const dv = (k, def = '') => (d[k] != null ? d[k] : def);
  const mine = S.reports.filter((r) => r.title === title).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  const last = mine[0];
  const uniq = (xs) => [...new Set(xs.filter(Boolean))];
  const plannedToday = planned.filter((x) => x.date === t0 && x.partner);
  const partners = uniq(mine.map((r) => r.partner)).filter((p) => !plannedToday.some((x) => x.partner === p)).slice(0, 5);
  const objectives = S.cycle.filter((o) => o.title === title && ['accepted', 'modified'].includes(o.status)).map((o) => o.rec.problem);
  const focuses = uniq([...objectives, ...mine.map((r) => r.focus)]).slice(0, 5);
  const scores = title === 'eFootball' ? [['1-0', 1, 0, 0], ['0-1', 0, 1, 0], ['Draw', 0, 0, 1], ['2-0', 2, 0, 0], ['1-1', 1, 1, 0], ['0-2', 0, 2, 0]] : [['2-0', 2, 0, 0], ['2-1', 2, 1, 0], ['1-2', 1, 2, 0], ['0-2', 0, 2, 0], ['1-0', 1, 0, 0], ['0-1', 0, 1, 0]];
  const hasDraft = Object.keys(d).some((k) => k !== 'at' && d[k] !== '');
  const isDefault = (k, v) => (k === 'roster' && v === ROSTER_PLAYED[0]) || (k === 'format' && pts && v === 'Lobby (BR)');
  const optOpen = RP_OPTIONAL.some((k) => d[k] && !isDefault(k, d[k])) ? ' open' : '';
  const num = (k, label, attrs = 'min="0" max="999"') => `<label class="field" for="rp-${fid}-${k}">${label}<input type="number" inputmode="${k === 'avg' ? 'decimal' : 'numeric'}" ${attrs} id="rp-${fid}-${k}" value="${esc(dv(k))}"></label>`;
  const txt = (k, label, ph = '', area = false) => (area
    ? `<label class="field" for="rp-${fid}-${k}">${label}<textarea rows="2" id="rp-${fid}-${k}" placeholder="${esc(ph)}">${esc(dv(k))}</textarea></label>`
    : `<label class="field" for="rp-${fid}-${k}">${label}<input type="text" id="rp-${fid}-${k}" placeholder="${esc(ph)}" value="${esc(dv(k))}"></label>`);
  const sel = (k, label, opts, def = '') => `<label class="field" for="rp-${fid}-${k}">${label}<select id="rp-${fid}-${k}">${opts.map(([v, l]) => `<option value="${esc(v)}" ${v === dv(k, def) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`;
  const prog = dv('progress');
  return `<div class="panel rp"><h2>File a scrim report — ${esc(title)}</h2>
    <p class="note">One report per sparring partner, the same day. Required fields first; everything under "More details" is optional. Reports cannot be edited afterwards: add a correction note instead. Performance notes only: no health, personal or contact details (wellbeing goes through Coach Donny).</p>
    ${hasDraft ? `<p class="note draftnote">Draft kept on this device${d.at ? ` (last typed ${esc(new Date(d.at).toTimeString().slice(0, 5))})` : ''}. <button type="button" class="linkbtn" data-rp-clear="${esc(fid)}">Clear form</button></p>` : ''}
    ${last ? `<div class="toolbar">${chip(fid, { partner: last.partner, level: last.partnerLevel, format: last.format, roster: last.roster, focus: last.focus, by: last.by }, 'Copy setup from last report', ' wide')}<span class="note">vs ${esc(last.partner)}, ${esc(last.date)}</span></div>` : ''}
    <div class="form">
      <label class="field" for="rp-${fid}-date">Date<input type="date" id="rp-${fid}-date" value="${esc(dv('date', t0))}" max="${t0}"></label>
      <label class="field" for="rp-${fid}-by">Written by<input type="text" id="rp-${fid}-by" list="staffNames" value="${esc(dv('by', meName()))}"></label>
      <label class="field" for="rp-${fid}-partner">Sparring partner<input type="text" id="rp-${fid}-partner" list="pbList-${fid}" placeholder="Team name, or internal" value="${esc(dv('partner'))}"></label>
    </div><datalist id="pbList-${fid}">${S.partners.filter((p) => p.title === title).map((p) => `<option value="${esc(p.name)}">${esc(p.level)}${p.resembles ? ` · like ${esc(p.resembles)}` : ''}</option>`).join('')}</datalist>
    ${plannedToday.length || partners.length ? `<div class="chips"><span class="note">Quick pick:</span>${plannedToday.map((x) => chip(fid, { partner: x.partner, scrim: x.id, format: x.format, level: x.partnerLevel }, `Planned today: ${x.partner}`, ' planned')).join('')}${partners.map((p) => chip(fid, { partner: p }, p)).join('')}</div>` : ''}
    ${capUi().gamesSection(title, fid)}
    <div class="h3">Result</div>
    ${gameOf(title) && (S.cap[fid]?.ready || []).length ? '<p class="note">Filled from the confirmed games above.</p>' : ''}
    ${pts || (gameOf(title) && (S.cap[fid]?.ready || []).length) ? '' : `<div class="chips"><span class="note">Quick score:</span>${scores.map(([l, w, lo, dr]) => chip(fid, { won: String(w), lost: String(lo), drawn: dr ? String(dr) : '' }, l)).join('')}</div>`}
    <div class="form">
    ${pts ? `${num('played', 'Matches played')}${num('points', 'Total points')}` : `${num('won', `${esc(cap(unit))} won`)}${num('lost', `${esc(cap(unit))} lost`)}`}
    </div>
    <div class="h3">Progress</div>
    ${capUi().debriefSection(title, fid)}
    ${txt('focus', 'What was this session meant to practise?', 'e.g. Early rotations; fallback drop; set-piece defending')}
    ${focuses.length ? `<div class="chips"><span class="note">Recent and active objectives:</span>${focuses.map((f) => chip(fid, { focus: f }, f.length > 48 ? `${f.slice(0, 46)}…` : f)).join('')}</div>` : ''}
    <div class="field"><span id="rp-${fid}-proglabel">How closely did the team follow the plan?</span><input type="hidden" id="rp-${fid}-progress" value="${esc(prog)}">
      <div class="seg" role="group" aria-labelledby="rp-${fid}-proglabel">${PROGRESS.map(([n, l]) => `<button type="button" data-rp-prog="${esc(fid)}" data-v="${n}" aria-pressed="${String(prog) === String(n)}" title="${esc(l)}"><b>${n}</b> ${esc(PROG_SHORT[n])}</button>`).join('')}</div></div>
    <div class="form">${txt('worked', 'What worked', '', true)}${txt('failed', 'What failed', '', true)}</div>
    ${txt('adjust', 'Adjustment for the next session', 'One concrete change to try next time', true)}
    <details class="more"${optOpen}><summary>More details (optional)</summary><div class="form">
      <label class="field" for="rp-${fid}-time">Time<input type="text" id="rp-${fid}-time" placeholder="19:00 WIB" value="${esc(dv('time'))}"></label>
      ${sel('level', 'Partner level', [['', ''], ...['Tier 1 international', 'Tier 1 domestic', 'Tier 2', 'Academy / amateur'].map((x) => [x, x])])}
      ${sel('format', 'Format', [['', ''], ...FORMATS.map((x) => [x, x])], pts ? 'Lobby (BR)' : '')}
      ${sel('roster', 'Who played', ROSTER_PLAYED.map((x) => [x, x]))}
      ${planned.length ? sel('scrim', 'Close a planned session', [['', ''], ...planned.map((x) => [x.id, `${x.date}${x.partner ? ` vs ${x.partner}` : ` ${x.kind}`}`])]) : ''}
      ${pts ? `${num('avg', 'Average placement (optional)', 'min="1" max="25" step="0.1"')}${num('chicken', 'Match wins (optional)')}` : num('drawn', `${esc(cap(unit))} drawn (optional)`)}
      </div>
      ${txt('detail', `${esc(spec.detail)} (optional)`, spec.hint)}
      ${txt('players', 'Player notes (optional, performance only)', 'e.g. Aran: strong first lane, hesitates on second tower')}
      ${txt('vod', 'VOD link or timestamp (optional)')}</details>
    <div class="toolbar"><button class="btn primary" type="button" data-report-save="${esc(title)}">Save report</button><span class="msg" id="rpMsg-${fid}" role="status"></span></div></div>`;
}


// ---------- website: users & access (admins only; the database enforces it too) ----------
const ROLES = [['admin', 'Admin'], ['head_coach', 'Head Coach'], ['assistant_coach', 'Assistant coach'], ['readiness_owner', 'Readiness owner'], ['title_coach', 'Title coach'], ['analyst', 'Analyst']];
async function loadAdminUsers() {
  S.admin = { ...(S.admin || {}), loading: true, error: '' };
  try { S.admin.users = await PLATFORM.admin.listUsers(); } catch (e) { S.admin.error = e.message; }
  S.admin.loading = false; render();
}
V['admin-users'] = () => {
  if (!HUB_USER?.isAdmin || !PLATFORM?.admin) return `<div class="panel">${banner('block', '<div>Admins only.</div>')}</div>`;
  S.admin ||= { users: null, loading: false, error: '' };
  if (!S.admin.users && !S.admin.loading && !S.admin.error) setTimeout(loadAdminUsers, 0);
  const users = S.admin.users || [];
  const row = (u) => `<div class="obj"><header><div><span class="note">${esc(u.email)}</span><h3>${esc(u.display_name || u.email)}</h3></div>${u.roles.length ? tag('c-Verified', u.roles.join(', ')) : tag('c-Blocked', 'no access')}</header>
    <div class="form"><label class="field" for="ad-${u.id}-name">Display name<input type="text" id="ad-${u.id}-name" value="${esc(u.display_name)}"></label>
    <label class="field" for="ad-${u.id}-staff">Staff routing<select id="ad-${u.id}-staff"><option value="">— (title coach / analyst)</option>${STAFF.filter((x) => x.id !== 'user').map((x) => `<option value="${x.id}" ${u.staff_key === x.id ? 'selected' : ''}>${esc(x.name)} — ${esc(x.role)}</option>`).join('')}</select></label></div>
    <fieldset class="objpick"><legend class="note">Roles</legend>${ROLES.map(([k, l]) => `<label><input type="checkbox" id="ad-${u.id}-role-${k}" ${u.roles.includes(k) ? 'checked' : ''}> ${l}</label>`).join('')}</fieldset>
    <fieldset class="objpick"><legend class="note">Assigned titles</legend>${WEC_TITLES.map((t) => `<label><input type="checkbox" id="ad-${u.id}-title-${sid(t.id)}" ${u.titles.includes(t.id) ? 'checked' : ''}> ${esc(t.id)}</label>`).join('')}</fieldset>
    <div class="toolbar"><button class="btn primary" type="button" data-admin-save="${esc(u.id)}">Save access</button><span class="msg" id="adMsg-${u.id}" role="status"></span></div></div>`;
  return `<div class="panel"><div class="lead">Users &amp; <em>access</em></div>
    <p>Who can sign in and what they can see. The database enforces these rules for every request; this page only changes them.</p>
    <ul class="plain"><li><b>Admin, Head Coach, assistant coaches:</b> read every title. Admin and Head Coach write every title; assistant coaches write their assigned titles and approve proposals there.</li>
    <li><b>Title coaches, analysts:</b> read and write only their assigned titles.</li><li><b>Wellbeing:</b> readiness owner and admins only (until visibility is decided).</li></ul>
    <p class="note">To add someone: Supabase dashboard → Authentication → Users → Invite user (their email). They set a password from the email, then appear here with no access until you tick a role.</p>
    <div class="toolbar"><button class="btn" type="button" id="adReload">Reload list</button><button class="btn" type="button" id="adExport">Export all data (JSON)</button><span class="msg" id="adExportMsg" role="status"></span></div>
    ${S.admin.error ? banner('block', `<div>${esc(S.admin.error)}</div>`) : ''}</div>
  <div class="panel"><h2>People (${users.length})</h2>${S.admin.loading && !users.length ? '<p>Loading…</p>' : users.map(row).join('') || '<p class="empty">Nobody yet.</p>'}</div>`;
};
// Title coaches and analysts see only their assigned games (the database hides the rest anyway).
const restricted = () => !!HUB_USER && !HUB_USER.seesAllTitles;
const titleVisible = (t) => !restricted() || HUB_USER.titles.includes(t);
function groupTitle(gid) { return gid === 'dota' ? 'Dota 2' : gid === 'pubgm' ? 'PUBG Mobile' : GAME_HUBS.find((h) => h.id === gid)?.title || null; }
function groupVisible(g) { const t = groupTitle(g.id); return !t || titleVisible(t); }
// Which title a view belongs to (for the "not assigned" notice).
function viewTitle(view) {
  const g = TITLES.find((t) => t.tabs.some(([id]) => id === view)); if (!g) return null;
  if (g.id === 'dota') return 'Dota 2'; if (g.id === 'pubgm') return 'PUBG Mobile';
  return GAME_HUBS.find((h) => h.id === g.id)?.title || null;
}

// ---------- title hubs (MLBB, MLBB Women, eFootball, CS2, CS2 Women) ----------
function teamPage(title) {
  const objs = S.cycle.filter((o) => o.title === title && !['retired', 'rejected'].includes(o.status));
  const hub = GAME_HUBS.find((h) => h.title === title); const dl = !!hub?.draft; const t0 = localToday();
  const wt = WEC_TITLES.find((t) => t.id === title); const squad = S.roster[title] || [];
  const Sm = reportSummary(S.reports, title, t0); const spec = GAME_SPEC[title];
  const matches = S.wecMatches.filter((m) => m.title === title && m.date >= t0 && !m.result).sort((a, b) => a.date.localeCompare(b.date));
  return `<div class="panel"><div class="lead">${esc(title)}</div>
    <p class="note">Focus owner: ${esc(ownerNote(title))} · title coach: ${esc(wt?.coach || 'TBD')}. No analysis engine in the hub${dl ? '; Draft Lab is the MLBB engine' : ''}. What staff see in ${dl ? 'Draft Lab, ' : ''}VOD or scrims enters the coaching cycle as a staff observation.</p>
    ${dl ? `<div class="toolbar"><a class="btn" href="${DRAFT_LAB.pelatnas}" target="_blank" rel="noopener">Open Draft Lab Pelatnas</a><a class="btn" href="${DRAFT_LAB.v19}" target="_blank" rel="noopener">Open Draft Lab MLBB v19</a></div>` : ''}</div>
  <div class="cols"><div class="panel"><h2>Squad</h2>${squad.length ? `<p>${squad.map(esc).join(' · ')}</p><p class="note">Names as listed on the WEC site or in the decision log. Roles and details are not stored here.</p>` : '<p class="empty">Roster not entered in the hub yet (TBD: confirm with the title coach).</p>'}</div>
    <div class="panel"><h2>Scrim reports, last 7 days</h2>${Sm.sessions ? `<p><b>${spec.mode === 'points' ? `${Sm.points} points in ${Sm.matches} matches` : `${Sm.won}-${Sm.lost}${Sm.drawn ? `-${Sm.drawn}` : ''}`}</b> over ${Sm.sessions} session${Sm.sessions > 1 ? 's' : ''} · plan followed ${Sm.progress}/5 ${trendTag(Sm.trend)}</p>` : '<p class="empty">No report in the last 7 days.</p>'}
      ${Sm.carryOver ? `<p class="note">Next session starts from: ${esc(Sm.carryOver.adjust)} (${esc(Sm.carryOver.by)}, ${esc(Sm.carryOver.date)})</p>` : ''}<div class="toolbar"><a class="btn" href="#${hub.team}-reports">${S.mode === 'demo' ? 'Open reports' : 'File or read reports'}</a></div></div></div>
  ${matches.length ? `<div class="panel"><h2>WEC matches coming up</h2><ul class="plain">${matches.map((m) => `<li><b>${esc(m.date)}</b> ${esc(m.time)} · ${esc(m.stage || 'stage TBD')} · vs ${esc(m.opponent)} <a href="#tour-runbook">Runbook</a></li>`).join('')}</ul></div>` : ''}
  <div class="panel"><h2>Objectives</h2>${objs.length ? `<ul class="plain">${objs.map((o) => `<li>${tag(`s-${o.status}`, o.status)} ${esc(o.rec.problem)} <span class="note">— ${esc(nextStep(o, S.rules))}</span></li>`).join('')}</ul>` : '<p class="empty">No objectives yet.</p>'}
    ${S.mode === 'demo' ? '' : `<details><summary class="btn">Add a staff observation</summary>${observationForm(title)}</details>`}</div>`;
}
const DRAFT_LAB = { pelatnas: 'https://claude.ai/code/artifact/2b3103c5-81c9-4ad4-ba3e-3303778a8259', v19: 'https://claude.ai/artifact/VatjYMhyVs5DLHgp8Yx4Rj' };
function draftLabPage(title) {
  return `<div class="panel"><div class="lead">Draft <em>Lab</em> — ${esc(title)}</div>
    <p>Draft Lab is the MLBB analysis tool the staff already use. It stays a separate page, so its data and licence terms are untouched. Use it for the draft book; bring what you learn back here as a staff observation or in a scrim report.</p>
    <div class="toolbar"><a class="btn primary" href="${DRAFT_LAB.pelatnas}" target="_blank" rel="noopener">Open Draft Lab Pelatnas</a><a class="btn" href="${DRAFT_LAB.v19}" target="_blank" rel="noopener">Open Draft Lab MLBB v19</a></div>
    <p class="note">${title === 'MLBB Women' ? 'No women\'s data is loaded in Draft Lab yet (see the Juara Umum board). Draft observations from scrims go into the scrim reports meanwhile.' : 'Draft Lab data: MPL ID S18 (club data, not national-team games). Treat its findings as club context until national scrims are logged.'}</p></div>`;
}
for (const h of GAME_HUBS) {
  V[h.team] = () => teamPage(h.title);
  V[`${h.team}-scrims`] = () => scrimsPanel(h.title);
  V[`${h.team}-reports`] = () => reportsPanel(h.title);
  if (gameOf(h.title)) V[`${h.team}-patterns`] = () => capUi().patternsPage(h.title);
  V[`${h.team}-rivals`] = () => competitorsPanel(h.title);
  if (h.draft) V[`${h.team}-draft`] = () => draftLabPage(h.title);
}
V['dota-scrims'] = () => scrimsPanel('Dota 2');
V['dota-reports'] = () => reportsPanel('Dota 2');
V['dota-patterns'] = () => capUi().patternsPage('Dota 2');
V['pubgm-scrims'] = () => scrimsPanel('PUBG Mobile');
V['pubgm-reports'] = () => reportsPanel('PUBG Mobile');
V['pubgm-rivals'] = () => competitorsPanel('PUBG Mobile');

V['dota-team'] = () => {
  const d = dotaTeam(); LAST.recs['Dota 2'] = d.recs;
  return `<div class="panel"><h2>Dota 2 national five — club evidence</h2>${CLUB_BANNER}${rulesFlag('dota-team')}
    <div class="tw"><table><thead><tr><th>Player</th><th>Club position</th><th class="n">Club games</th><th>Most-played in club tournaments (6+ games, last 120 days)</th><th>Data</th></tr></thead><tbody>
    ${d.pools.map((p) => `<tr><td><b>${esc(p.player)}</b><br><span class="note">acc ${p.account}</span></td><td>${esc(p.posLabel)}</td><td class="n">${p.games}</td>
      <td><div class="chips">${p.pool.filter((e) => e.tier === 'Established').sort((a, b) => b.games - a.games).slice(0, 7).map((e) => `<span class="chip ${e.stale ? 'stale' : ''}" title="last played ${e.daysSince} days before ${esc(SHIPPED)}">${esc(e.name)} <small>${e.games}</small></span>`).join('')}</div></td>
      <td class="note">${S.freshPools[p.player] ? `refreshed ${esc(S.freshPools[p.player].slice(0, 10))}` : `retrieved ${SHIPPED}`}</td></tr>`).join('')}</tbody></table></div>
    <p class="note">These counts describe club experience on a hero, not readiness for the national team. Faded chips: last played over 45 days ago. Win rates are left out: at these sample sizes they say little.</p>
    <div class="toolbar"><button class="btn" type="button" id="refreshPools">Refresh from OpenDota (desktop app)</button><span class="msg" id="poolMsg"></span></div>
    ${evidenceBox(d.evidence)}</div>
  <div class="cols"><div class="panel"><h2>Findings</h2>${findingList(d.evidence)}</div>
  <div class="panel"><h2>Proposals for the title coach</h2>${recList(d.recs, 'Dota 2')}</div></div>
  <div class="panel"><h2>Rule-based review</h2>${coachPanel(d.coach)}</div>`;
};

function draftState() {
  const st = { ours: [], theirs: [], ourBans: [], theirBans: [] };
  S.draft.steps.forEach((h, i) => { const [kind, side] = CM_ORDER[i]; const us = (side === 'A') === S.draft.firstUs; if (kind === 'pick') (us ? st.ours : st.theirs).push(h); else (us ? st.ourBans : st.theirBans).push(h); });
  return st;
}
V['dota-draft'] = () => {
  const P = dotaTeam().pools;
  const oppAgg = S.opp[S.draft.opp];
  const oppPools = oppAgg ? scoutingReport(oppAgg, S.heroes, P).players : [];
  const ctx = { heroes: S.heroes, pools: P, oppPools };
  const i = S.draft.steps.length, done = i >= CM_ORDER.length, st = draftState();
  const [kind, side] = done ? ['', ''] : CM_ORDER[i];
  const usTurn = !done && ((side === 'A') === S.draft.firstUs);
  let sug = [];
  if (!done && usTurn) sug = suggest(st, ctx, { kind, top: 6 });
  if (!done && !usTurn) {
    const taken = new Set(S.draft.steps);
    sug = oppPools.flatMap((op) => [...op.pool].sort((a, b) => b.games - a.games).slice(0, 4).filter((e) => !taken.has(e.hero)).map((e) => ({ hero: e.hero, name: e.name, score: e.games / 10, reasons: [`${op.player}: ${e.games} club tournament games`] }))).sort((a, b) => b.score - a.score).slice(0, 6);
  }
  const ev = evaluateDraft(st, ctx);
  const board = CM_ORDER.map(([k, sd], j) => { const us = (sd === 'A') === S.draft.firstUs; const h = S.draft.steps[j]; return `<div class="slot ${us ? 'us' : 'them'} ${k} ${j === i ? 'cur' : ''}"><span class="s">${j + 1} · ${us ? 'Us' : 'Them'} ${k}</span><span class="h">${h ? esc(hname(h)) : '—'}</span></div>`; }).join('');
  const names = Object.values(S.heroes).map((h) => `<option value="${esc(h.name)}"></option>`).join('');
  return `<div class="panel"><h2>Draft room — Captains Mode</h2>${rulesFlag('dota-draft')}
    <p class="note">A preparation tool. Suggestions weigh our players' <b>club</b> hero experience, composition gaps and denial of the opponent's club comfort heroes. Counterpick and synergy are not scored. The coach decides.</p>
    <div class="form"><label class="field" for="dFirst">First action<select id="dFirst"><option value="us" ${S.draft.firstUs ? 'selected' : ''}>Indonesia</option><option value="them" ${!S.draft.firstUs ? 'selected' : ''}>Opponent</option></select></label>
    <label class="field" for="dOpp">Opponent<select id="dOpp"><option value="">No scouting data</option>${Object.values(S.opp).map((o) => `<option value="${o.code}" ${S.draft.opp === o.code ? 'selected' : ''}>${esc(o.nation)}</option>`).join('')}</select></label>
    <label class="field" for="dHero">${done ? 'Draft complete' : `Step ${i + 1}: ${usTurn ? 'our' : 'their'} ${kind}`}<input type="text" id="dHero" list="heroNames" placeholder="Type a hero" ${done ? 'disabled' : ''}></label></div>
    <datalist id="heroNames">${names}</datalist>
    <div class="toolbar"><button class="btn primary" type="button" id="dLock" ${done ? 'disabled' : ''}>Lock in</button><button class="btn" type="button" id="dUndo" ${i ? '' : 'disabled'}>Undo</button><button class="btn" type="button" id="dReset">Reset</button>
      <button class="btn" type="button" id="dSaveA">Save as Draft A</button><button class="btn" type="button" id="dSaveB">Save as Draft B</button><span class="msg" id="dMsg"></span></div>
    <div class="board">${board}</div></div>
  <div class="cols"><div class="panel"><h2>${done ? 'Draft finished' : usTurn ? `Our ${kind}: suggestions` : `Their ${kind}: what to expect`}</h2>
      ${done ? '<p class="empty">All 24 steps filled.</p>' : sug.length ? `<div class="sugg">${sug.map((s) => `<button type="button" data-hero="${s.hero}"><b>${esc(s.name)}</b><span class="sc"></span><small>${s.reasons.map(esc).join(' · ')}</small></button>`).join('')}</div>` : '<p class="empty">No evidence-backed suggestion here.</p>'}</div>
    <div class="panel"><h2>Our draft so far</h2>
      <div class="terms"><div class="stat"><span class="k">Club comfort</span><span class="v">${round(ev.terms.execution, 2)}</span></div><div class="stat"><span class="k">Composition gaps</span><span class="v">${round(ev.terms.structure, 1)}</span></div><div class="stat"><span class="k">Denial</span><span class="v">${round(ev.terms.denial, 2)}</span></div><div class="stat"><span class="k">Matchups</span><span class="v">not scored</span></div></div>
      ${ev.assignment.length ? `<div class="h3">Who plays what</div><div class="chips">${ev.assignment.map((a) => `<span class="chip">${esc(hname(a.hero))} <small>${esc(a.player)}</small></span>`).join('')}</div>` : ''}
      <div class="h3">Vulnerabilities</div>${ev.vulns.length ? `<ul class="plain">${ev.vulns.map((v) => `<li>${esc(v)}</li>`).join('')}</ul>` : '<p class="empty">None flagged yet.</p>'}</div></div>
  <div class="panel"><h2>Compare two drafts</h2>${Object.keys(S.draft.saved).length < 2 ? '<p class="empty">Save a draft as A and another as B.</p>' : (() => {
    const c = compareDrafts(S.draft.saved.A, S.draft.saved.B, ctx, ['Draft A', 'Draft B']);
    return `<p><b>A</b>: ${S.draft.saved.A.ours.map(hname).join(', ')}<br><b>B</b>: ${S.draft.saved.B.ours.map(hname).join(', ')}</p><p><b>${c.preferred}</b> scores higher on these terms (margin ${round(c.margin, 2)}):</p><ul class="plain">${c.reasons.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>${c.caveat ? `<p class="note">${esc(c.caveat)}</p>` : ''}`;
  })()}</div>`;
};

function goldChart(m, a) {
  if (!m.gadv) return '';
  const sign = a.side === 'radiant' ? 1 : -1; const g = m.gadv.map((v) => v * sign);
  const W = 720, H = 220, L = 52, R = 12, T = 14, B = 26;
  const lim = Math.ceil(Math.max(2000, ...g.map(Math.abs)) / 5000) * 5000;
  const x = (i) => L + (i / (g.length - 1)) * (W - L - R), y = (v) => T + (1 - (v + lim) / (2 * lim)) * (H - T - B);
  const mins = g.length - 1, step = mins > 40 ? 10 : 5, roshTeamOurs = a.side === 'radiant' ? 2 : 3;
  return `<div class="chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Net worth difference by minute, our side positive">
    ${[-lim, -lim / 2, 0, lim / 2, lim].map((t) => `<line x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}" stroke="var(--line)" stroke-width="${t === 0 ? 1.5 : 1}"/><text x="${L - 6}" y="${y(t) + 4}" text-anchor="end">${t > 0 ? '+' : ''}${t / 1000}k</text>`).join('')}
    ${Array.from({ length: Math.floor(mins / step) + 1 }, (_, k) => k * step).map((mm) => `<text x="${x(mm)}" y="${H - 8}" text-anchor="middle">${mm}'</text>`).join('')}
    <path d="${g.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('')}" fill="none" stroke="var(--gold)" stroke-width="2"/>
    ${m.obj.filter((o) => o[1] === 'CHAT_MESSAGE_ROSHAN_KILL').map((r) => { const xi = x(Math.min(mins, r[0] / 60)); const us = +r[3] === roshTeamOurs; return `<line x1="${xi}" x2="${xi}" y1="${T}" y2="${H - B}" stroke="${us ? 'var(--good)' : 'var(--merah)'}" stroke-dasharray="3 3"/><text x="${xi + 3}" y="${T + 10}">${us ? 'Our' : 'Their'} Rosh</text>`; }).join('')}
  </svg><p class="note">Net worth difference by minute from our side. Dashed lines: Roshan kills.</p></div>`;
}
function importReportBox() {
  const r = S.importReport; if (!r) return '';
  return banner(r.ok ? 'real' : 'block', `<div><b>${r.ok ? `Imported match ${r.match.id}` : 'Import failed'}.</b>${r.problems.length ? `<ul class="plain">${r.problems.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>` : ''}${r.warnings.length ? `<ul class="plain">${r.warnings.map((w) => `<li>${esc(w)}</li>`).join('')}</ul>` : ''}</div>`);
}
V['dota-post'] = () => {
  const ids = Object.keys(S.matches).map(Number).sort((a, b) => S.matches[b].m.start - S.matches[a].m.start);
  if (!S.matches[S.selMatch]) S.selMatch = ids[0];
  const rec = S.matches[S.selMatch];
  let body = '';
  if (rec) {
    try {
      const r = dotaMatchPipeline(rec, accounts(), S.heroes); const a = r.analysis; LAST.recs['Dota 2'] = r.recs;
      body = `<div class="panel"><h2>${esc(a.ourTeam || 'Our side')} vs ${esc(a.opponent || 'opponent')} — ${a.won ? 'won' : 'lost'} in ${mmss(a.duration)} ${ctxTag(r.context.context)}</h2>
        ${r.context.context !== 'national' ? banner('real', `<div><b>${r.context.tracked}/5 national players in this match.</b> This is a club match: it describes those players in their club, not the national team.</div>`) : ''}
        ${rulesFlag('dota-post')}${goldChart(rec.m, a)}${evidenceBox(r.evidence)}</div>
        <div class="cols"><div class="panel"><h2>Findings, in match order</h2>${findingList([...r.evidence].sort((x, y) => (x.at ?? -1) - (y.at ?? -1)))}</div>
        <div class="panel"><h2>Proposals for the title coach</h2>${recList(r.recs, 'Dota 2')}</div></div>
        <div class="panel"><h2>Rule-based review</h2>${coachPanel(r.coach)}</div>`;
    } catch (e) { body = banner('block', `<div>${esc(e.message)}</div>`); }
  }
  return `<div class="panel"><h2>Import a match</h2>
    <p><b>Supported route (works everywhere):</b></p><ol class="plain">${IMPORT_HELP.map((h) => `<li>${esc(h)}</li>`).join('')}</ol>
    <div class="form"><label class="field" for="mFile">Load OpenDota JSON file<input type="file" id="mFile" accept=".json,application/json,.txt"></label>
    <label class="field" for="mSel">Imported matches<select id="mSel">${ids.map((id) => `<option value="${id}" ${id === S.selMatch ? 'selected' : ''}>${id} · ${esc(S.matches[id].m.rteam || '?')} vs ${esc(S.matches[id].m.dteam || '?')}</option>`).join('')}</select></label></div>
    <label class="field" for="mPaste">Or paste the JSON<textarea id="mPaste" placeholder='{"match_id": …, "players": […]}'></textarea></label>
    <div class="toolbar"><button class="btn primary" type="button" id="mParse">Import pasted JSON</button></div>
    <p class="note"><b>Desktop shortcut (Claude desktop app only, not yet verified on the published page):</b></p>
    <div class="toolbar"><input type="text" id="mId" inputmode="numeric" placeholder="Match ID" aria-label="Match ID" style="max-width:200px"><button class="btn" type="button" id="mFetch">Fetch via browser pane</button><span class="msg" id="mMsg"></span></div>
    ${importReportBox()}</div>${body}`;
};

V['dota-scout'] = () => {
  const P = dotaTeam().pools; const agg = S.opp[S.selNation];
  const list = WEC_DOTA.map((n) => { const o = Object.values(S.opp).find((x) => x.nation === n); return `<option value="${o ? o.code : ''}" ${o && o.code === S.selNation ? 'selected' : ''} ${o ? '' : 'disabled'}>${esc(n)}${o ? '' : ' — not scouted'}</option>`; }).join('');
  let body = '';
  if (agg) {
    const r = scoutingReport(agg, S.heroes, P);
    const o = runCoaches(r.findings, [], dotaAdapter, { clubData: true, matchupsLoaded: false });
    body = `<div class="panel"><h2>Scouting report — ${esc(r.nation)}</h2>${banner('real', '<div><b>Club evidence of their players.</b> No national-team draft data exists for this five.</div>')}${rulesFlag('dota-scout')}
      <p class="note">Coach: ${esc(r.coach)}. ${esc(agg._source)}</p>
      <div class="tw"><table><thead><tr><th>Player</th><th>Likely role</th><th class="n">Club games</th><th>Most played</th><th class="n">Heroes with 5+ games</th></tr></thead><tbody>
      ${r.players.map((p) => `<tr><td><b>${esc(p.player)}</b></td><td>${esc(p.posLabel)}</td><td class="n">${p.games}</td><td><div class="chips">${[...p.pool].sort((a, b) => b.games - a.games).slice(0, 5).map((e) => `<span class="chip">${esc(e.name)} <small>${e.games}</small></span>`).join('')}</div></td><td class="n">${p.depth}</td></tr>`).join('')}
      ${agg.roster.filter((x) => !x.account).map((x) => `<tr><td><b>${esc(x.ign)}</b></td><td colspan="4">${tag('c-Blocked', 'No data')} ${esc(x.match_status)}</td></tr>`).join('')}</tbody></table></div></div>
      <div class="cols"><div class="panel"><h2>Countermeasures to consider</h2><div class="h3">Ban candidates (most played)</div><ol class="plain">${r.banPlan.map((b) => `<li><b>${esc(b.name)}</b> — ${esc(b.player)}, ${b.games} games (${pct(b.share)} of his games)</li>`).join('')}</ol>
        <div class="h3">Contested heroes</div>${r.contested.length ? `<ul class="plain">${r.contested.slice(0, 10).map((c) => `<li><b>${esc(c.name)}</b>: ${esc(c.us)} / ${esc(c.them)}</li>`).join('')}</ul>` : '<p class="empty">None.</p>'}
        <div class="h3">Not available</div><ul class="plain">${r.blocked.map((b) => `<li>${esc(b)}</li>`).join('')}</ul></div>
      <div class="panel"><h2>Findings</h2>${findingList(r.findings.map((f) => ({ ...f, context: 'club' })))}</div></div>
      <div class="panel"><h2>Rule-based review</h2>${coachPanel(o)}</div>`;
  }
  return `${competitorsPanel('Dota 2')}<div class="panel"><h2>Player-pool scouting</h2><p class="note">Built from each registered player's club tournament games on OpenDota. Loaded: Mongolia.</p><label class="field" for="nSel">Opponent<select id="nSel">${list}</select></label></div>${body}`;
};

V['dota-review'] = () => {
  const recs = Object.values(S.matches).map((rec) => { try { return dotaMatchPipeline(rec, accounts(), S.heroes); } catch { return null; } }).filter(Boolean);
  const nat = recs.filter((r) => r.context.context === 'national');
  const byArea = {};
  for (const r of nat) for (const f of r.evidence) if (f.severity < 0) (byArea[f.area] ||= new Set()).add(r.analysis.matchId);
  const rec = Object.entries(byArea).filter(([, s]) => s.size >= 2);
  return `<div class="panel"><h2>Series / match-day review — national-team matches only</h2>
    ${nat.length ? '' : banner('block', `<div><b>No national-team matches imported yet.</b> ${recs.length} club match(es) are in the hub; they are excluded here so club results are not read as national-team form. Import pelatnas scrims with all five players.</div>`)}
    ${nat.length ? `<h3 class="h3">Recurring problems (2+ matches)</h3>${rec.length ? `<ul class="plain">${rec.map(([a, s]) => `<li><b>${esc(a)}</b> — ${s.size} of ${nat.length} matches</li>`).join('')}</ul>` : '<p class="empty">Nothing repeats yet.</p>'}` : ''}
    <div class="tw"><table><thead><tr><th>Match</th><th>Context</th><th>Result</th><th class="n">Problems</th></tr></thead><tbody>
    ${recs.map((r) => `<tr><td>${r.analysis.matchId}</td><td>${ctxTag(r.context.context)}</td><td>${r.analysis.won ? 'Won' : 'Lost'}</td><td class="n">${r.evidence.filter((f) => f.severity < 0).length}</td></tr>`).join('')}</tbody></table></div></div>`;
};

// PUBG Mobile
function pubgmHeader(d) {
  return `${S.mode === 'demo' ? DEMO_BANNER : banner('real', `<div><b>Operational data only.</b> ${S.pubgm.logged.matches.length} logged match rows, ${S.pubgm.logged.fights.length} fight rows.</div>`)}${rulesFlag('pubgm-team')}
    ${d.teams.length ? `<label class="field" for="pTeam">Our team label<select id="pTeam">${d.teams.map((t) => `<option ${t === d.team ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></label>` : ''}`;
}
V['pubgm-team'] = () => {
  const d = pubgmData(); const p = pubgmRun(d); LAST.recs['PUBG Mobile'] = p.recs;
  if (p.insufficient) return `<div class="panel"><h2>PUBG Mobile</h2>${pubgmHeader(d)}${banner('block', `<div><b>Not enough evidence.</b> ${esc(p.insufficient)}</div>`)}<div class="toolbar"><a class="btn primary" href="#pubgm-log">Log scrims</a>${S.mode === 'live' ? '<button class="btn" type="button" id="modeBtn2">See the demo sandbox</button>' : ''}</div></div>`;
  const me = teamSummary(d.rows, d.team, d.sc); const st = standings(d.rows, d.sc);
  const classes = ['favourable', 'unfavourable', 'avoidable', 'necessary', 'necessary-lost', 'even'];
  return `<div class="panel"><h2>Tournament performance ${ctxTag(S.mode === 'demo' ? 'demo' : 'national')}</h2>${pubgmHeader(d)}
    <div class="stats"><div class="stat"><span class="k">Points</span><span class="v">${me.total}</span></div><div class="stat"><span class="k">Per match</span><span class="v">${round(me.ppm, 1)}</span><span class="note">${round(me.placePPM, 1)} place + ${round(me.elimPPM, 1)} elim</span></div>
    <div class="stat"><span class="k">Avg placement</span><span class="v">${round(me.avgPlace, 1)}</span></div><div class="stat"><span class="k">Top-8</span><span class="v">${me.top8}/${me.matches}</span></div></div>${evidenceBox(p.evidence)}</div>
  <div class="cols"><div class="panel"><h2>Findings</h2>${findingList(p.evidence)}</div><div class="panel"><h2>Proposals for the title coach</h2>${recList(p.recs, 'PUBG Mobile')}</div></div>
  <div class="cols"><div class="panel"><h2>Drops</h2><div class="tw"><table><thead><tr><th>Drop</th><th class="n">Times</th><th class="n">Contested</th><th class="n">Out zone 1</th><th class="n">Vehicle by 3:00</th><th class="n">Pts/match</th></tr></thead><tbody>
    ${p.drops.table.map((x) => `<tr><td>${esc(x.spot)}</td><td class="n">${x.n}</td><td class="n">${x.contested}</td><td class="n">${x.earlyOut}</td><td class="n">${x.vehicle}</td><td class="n">${round(x.ppm, 1)}</td></tr>`).join('')}</tbody></table></div><p class="note">From staff tags, not coordinates.</p></div>
   <div class="panel"><h2>Fights</h2>${p.ff.rows.length ? `<div class="stats">${classes.map((c) => `<div class="stat"><span class="k">${esc(c)}</span><span class="v">${p.ff.rows.filter((r) => r.cls === c).length}</span></div>`).join('')}</div>` : '<p class="empty">No fights logged.</p>'}</div></div>
  <div class="panel"><h2>Lobby standings</h2><div class="tw"><table><thead><tr><th>#</th><th>Team</th><th class="n">Pts</th><th class="n">WWCD</th><th class="n">Avg place</th></tr></thead><tbody>
    ${st.map((t, i) => `<tr ${t.team === d.team ? 'class="me"' : ''}><td>${i + 1}</td><td>${esc(t.team)}</td><td class="n">${t.total}</td><td class="n">${t.wwcd}</td><td class="n">${round(t.avgPlace, 1)}</td></tr>`).join('')}</tbody></table></div></div>
  <div class="panel"><h2>Rule-based review</h2>${coachPanel(p.coach)}</div>`;
};

const MATCH_TEMPLATE = `${MATCH_COLUMNS.join(',')}\nS101,2026-11-10,D1,Pelatnas scrim,Erangel,4,INA,6,5,2,3,0,1610,Yasnaya,0,1,4,early,edge,balanced`;
const FIGHT_TEMPLATE = `${FIGHT_COLUMNS.join(',')}\nS101,INA,640,2,us,0,2,1,2,0,0,compound fight east`;
export function checkPubgmImport(mText, fText) {
  const errs = [];
  const rows = mText ? parseCSV(mText) : [], fights = fText ? parseCSV(fText) : [];
  if (/SYNTHETIC/i.test(mText + fText)) errs.push('These rows are marked SYNTHETIC. Demo data cannot be imported as operational data.');
  if (rows.length) { const missing = ['match_id', 'date', 'session', 'map', 'team', 'placement', 'elims', 'died_phase'].filter((c) => !(c in rows[0])); if (missing.length) errs.push(`Match CSV is missing column(s): ${missing.join(', ')}. Copy the template header.`); }
  errs.push(...validateMatches(rows));
  fights.forEach((r, i) => { if (!r.match_id || !r.team) errs.push(`fight row ${i + 2}: match_id and team are required`); });
  if (!rows.length && !fights.length) errs.push('Paste or load at least one CSV.');
  return { rows, fights, errs };
}
V['pubgm-log'] = () => `<div class="panel"><h2>Log scrims and fights</h2>
  ${S.mode === 'demo' ? DEMO_BANNER + '<p class="empty">Logging is switched off in the demo sandbox.</p>' : `
  <p>One row per team per match (the whole lobby), plus one row per fight tagged from VOD. Rows are checked, stamped as operational and saved to the shared log.</p>
  ${S.dbState === 'live' ? banner('real', '<div><b>Shared log connected.</b></div>') : banner('synth', `<div><b>Shared log not connected</b> (${esc(S.dbState)}). Rows stay in this browser tab only and are lost on reload.</div>`)}
  <div class="cols"><div><label class="field" for="lMatches">Match rows (CSV)<textarea id="lMatches" placeholder="${esc(MATCH_TEMPLATE)}"></textarea></label>
    <div class="toolbar"><input type="file" id="lMatchFile" accept=".csv,text/csv" aria-label="Load match CSV file"><button class="btn" type="button" data-copy="match">Copy template</button></div></div>
  <div><label class="field" for="lFights">Fight rows (CSV)<textarea id="lFights" placeholder="${esc(FIGHT_TEMPLATE)}"></textarea></label>
    <div class="toolbar"><input type="file" id="lFightFile" accept=".csv,text/csv" aria-label="Load fight CSV file"><button class="btn" type="button" data-copy="fight">Copy template</button></div></div></div>
  <div class="toolbar"><button class="btn primary" type="button" id="lSave">Check and save</button></div><div id="lMsg" class="msg" role="status"></div>
  <details><summary class="note">Column guide</summary><ul class="plain note">
    <li><b>lobby_strength</b> 1–5 staff estimate · <b>died_phase</b> 0 = alive at end · <b>drop_contested</b>, <b>vehicle_by_3min</b> 0/1</li>
    <li><b>zone_entry</b> early / late / forced · <b>position</b> edge / center · <b>strategy</b> aggressive / balanced / passive</li></ul></details>
  <p class="note">${S.pubgm.logged.matches.length} match rows · ${S.pubgm.logged.fights.length} fight rows logged.</p>`}</div>`;

V['pubgm-sim'] = () => {
  const d = pubgmData();
  const nm = new Set(d.rows.filter((r) => r.team === d.team).map((r) => r.match_id)).size;
  if (nm < PUBGM_MIN_MATCHES) return `<div class="panel"><h2>Strategy simulator</h2>${pubgmHeader(d)}${banner('block', `<div><b>Not enough logged matches (${nm}).</b> The simulator needs at least ${PUBGM_MIN_MATCHES} of our matches to draw from.</div>`)}</div>`;
  const cfg = S.pubgm.sim || (S.pubgm.sim = { matches: 6, ourPts: 0, rival: '', rivalPts: 0, assumptions: JSON.parse(JSON.stringify(DEFAULT_ASSUMPTIONS)) });
  const out = simulate({ rows: d.rows, team: d.team, sc: d.sc, matches: cfg.matches, iters: 3000, assumptions: cfg.assumptions, rival: cfg.rival ? { team: cfg.rival, ourPoints: cfg.ourPts, theirPoints: cfg.rivalPts } : null });
  const max = Math.max(...out.results.map((r) => r.p90)) * 1.08 || 1;
  return `<div class="panel"><h2>Strategy simulator</h2>${pubgmHeader(d)}${rulesFlag('pubgm-sim')}
    <p>Ranges of points from our own logged matches (or editable assumptions where a plan has fewer than 6 logged matches). Not a prediction of WEC results.</p>
    <div class="form"><label class="field" for="sN">Matches left<input type="number" id="sN" min="1" max="24" value="${cfg.matches}"></label><label class="field" for="sOur">Our points now<input type="number" id="sOur" value="${cfg.ourPts}"></label>
    <label class="field" for="sRival">Rival<select id="sRival"><option value="">None</option>${d.teams.filter((t) => t !== d.team).map((t) => `<option ${t === cfg.rival ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></label><label class="field" for="sRivalPts">Rival points now<input type="number" id="sRivalPts" value="${cfg.rivalPts}"></label></div>
    <div class="toolbar"><button class="btn primary" type="button" id="sRun">Run</button></div>
    ${out.results.map((r) => `<div class="simrow"><div><b>${esc(r.label)}</b><br><span class="note">${esc(r.basis === 'data' ? 'from our matches' : 'assumption-based')}</span></div>
      <div class="simtrack"><span class="rng" style="left:${(r.p10 / max) * 100}%;width:${((r.p90 - r.p10) / max) * 100}%"></span><span class="med" style="left:${(r.p50 / max) * 100}%"></span></div>
      <div class="note">P10 <b>${round(r.p10)}</b> · median <b>${round(r.p50)}</b> · P90 <b>${round(r.p90)}</b>${r.pBeatRival != null ? `<br>Ahead of ${esc(cfg.rival)} in ${pct(r.pBeatRival)} of simulated runs` : ''}</div></div>`).join('')}
    <p class="note">${esc(out.caveat)}</p></div>
  <div class="panel"><h2>Assumptions</h2><div class="tw"><table><thead><tr><th>Plan</th><th>Elims ×</th><th>Early-exit change</th><th>Placement shift</th></tr></thead><tbody>
    ${Object.entries(cfg.assumptions).map(([k, a]) => `<tr><td>${esc(a.label)}</td><td><input type="number" step="0.1" id="as-${k}-elimMult" value="${a.elimMult}" aria-label="${esc(a.label)} elimination multiplier"></td><td><input type="number" step="0.01" id="as-${k}-earlyExitAdd" value="${a.earlyExitAdd}" aria-label="${esc(a.label)} early exit change"></td><td><input type="number" step="1" id="as-${k}-placeShift" value="${a.placeShift}" aria-label="${esc(a.label)} placement shift"></td></tr>`).join('')}</tbody></table></div><p class="note">Staff judgements, not measured effects.</p></div>`;
};

V['pubgm-review'] = () => {
  const d = pubgmData();
  const sessions = [...new Set(d.rows.map((r) => r.session))].sort();
  if (!sessions.length) return `<div class="panel"><h2>Match-day review</h2>${pubgmHeader(d)}<p class="empty">No logged sessions.</p></div>`;
  if (!sessions.includes(S.selDay)) S.selDay = sessions.at(-1);
  const day = pubgmRun(d, (r) => r.session === S.selDay);
  return `<div class="panel"><h2>Match-day review</h2>${pubgmHeader(d)}<label class="field" for="dayS">Session<select id="dayS">${sessions.map((s) => `<option ${s === S.selDay ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select></label>
    ${day.insufficient ? banner('block', `<div>${esc(day.insufficient)} Single-day findings need a full session.</div>`) : findingList(day.evidence)}</div>`;
};

// Staff: coaching cycle
const opt = (arr, sel) => arr.map((x) => `<option ${x === sel ? 'selected' : ''}>${esc(x)}</option>`).join('');
function cycleCard(o) {
  const changed = changedSince(o.rules, S.rules);
  const t = trail(o);
  const open = !['retired'].includes(o.status);
  return `<article class="obj" id="${esc(o.id)}"><header><div><span class="note">${esc(o.title)} · ${esc(o.id)} · proposed ${esc(o.createdAt.slice(0, 10))} by ${esc(o.proposedBy)} · <b>for ${esc(o.assignedTo || owner(o.title).name)}</b></span>
      <h3>${esc(o.rec.problem)}</h3></div>${tag(`s-${o.status}`, o.status.replace('-', ' '))}</header>
    ${changed.length ? banner('block', `<div><b>Rules changed since proposal:</b> ${changed.map((c) => `${esc(c.label || c.id)} ${esc(c.from)} → ${esc(c.to)}`).join('; ')}. Re-check the evidence before practising.</div>`) : ''}
    <dl class="kv small"><dt>Evidence</dt><dd>${o.rec.evidence.map((e) => `${esc(e.title)} <span class="note">(${esc(e.kind)}, n=${e.n ?? '—'}, ${esc(CONTEXT_LABEL[e.context] || e.context)}, ${esc(e.source)}, ${esc(e.retrieved)})</span>`).join('<br>')}</dd>
      <dt>Uncertainty</dt><dd>${o.rec.uncertainty.length ? o.rec.uncertainty.map(esc).join('<br>') : '—'}</dd>
      <dt>Drill</dt><dd>${esc(o.objective.drill)}</dd><dt>Success</dt><dd>${esc(o.objective.success)}</dd><dt>Next step</dt><dd><b>${esc(nextStep(o, S.rules))}</b></dd></dl>
    ${o.reviews.length ? `<div class="h3">Reviews</div><ul class="plain">${o.reviews.map((r) => `<li><b>${esc(r.decision)}</b> by ${esc(r.reviewer)}, ${esc(r.at.slice(0, 16).replace('T', ' '))}${r.reason ? ` — ${esc(r.reason)}` : ''}</li>`).join('')}</ul>` : ''}
    ${t.length ? `<div class="h3">Sessions → decisions</div><ul class="plain">${t.map(({ session: s, decision: d }) => `<li><b>${esc(s.id)}</b> ${esc(s.date)} · ${esc(s.owner)} · ${esc(s.execution)} · result <b>${esc(s.result)}</b>${s.measure ? ` (${esc(s.measure)})` : ''}${s.context?.opponent ? ` · vs ${esc(s.context.opponent)}` : ''}${d ? ` → <b>${esc(d.decision)}</b> by ${esc(d.by)}: ${esc(d.reason)}` : ' → <i>no decision yet</i>'}</li>`).join('')}</ul>` : ''}
    ${open ? `<details ${o.status === 'proposed' ? 'open' : ''}><summary class="btn">Review</summary><div class="form">
      <label class="field" for="rv-d-${o.id}">Decision<select id="rv-d-${o.id}">${opt(REVIEW)}</select></label><label class="field" for="rv-n-${o.id}">Reviewer<input type="text" id="rv-n-${o.id}" list="rv-l-${o.id}" value="${esc(STAFF.find((x) => x.id === S.me)?.name || '')}"></label><datalist id="rv-l-${o.id}">${reviewersFor(o.title).map((n) => `<option value="${esc(n)}"></option>`).join('')}</datalist>
      <label class="field" for="rv-r-${o.id}">Reason (required to modify or reject)<input type="text" id="rv-r-${o.id}"></label></div>
      <div class="form"><label class="field" for="rv-dr-${o.id}">Changed drill (if modifying)<input type="text" id="rv-dr-${o.id}"></label><label class="field" for="rv-s-${o.id}">Changed success criterion<input type="text" id="rv-s-${o.id}"></label></div>
      <div class="toolbar"><button class="btn primary" type="button" data-act="review" data-id="${esc(o.id)}">Save review</button></div></details>
    ${['accepted', 'modified'].includes(o.status) ? `<details><summary class="btn">Log a session</summary><div class="form">
      <label class="field" for="ss-o-${o.id}">Owner<input type="text" id="ss-o-${o.id}"></label><label class="field" for="ss-d-${o.id}">Date<input type="date" id="ss-d-${o.id}" value="${today()}"></label>
      <label class="field" for="ss-e-${o.id}">Executed<select id="ss-e-${o.id}">${opt(EXECUTION)}</select></label><label class="field" for="ss-r-${o.id}">Result vs success criterion<select id="ss-r-${o.id}">${opt(RESULT)}</select></label>
      <label class="field" for="ss-m-${o.id}">Measured value<input type="text" id="ss-m-${o.id}" placeholder="e.g. 3 of 4 reps"></label><label class="field" for="ss-op-${o.id}">Scrim opponent<input type="text" id="ss-op-${o.id}"></label>
      <label class="field" for="ss-p-${o.id}">Patch / version<input type="text" id="ss-p-${o.id}"></label><label class="field" for="ss-n-${o.id}">Notes<input type="text" id="ss-n-${o.id}"></label></div>
      <div class="toolbar"><button class="btn primary" type="button" data-act="session" data-id="${esc(o.id)}">Save session</button></div></details>` : ''}
    <details><summary class="btn">Decide next step</summary><div class="form">
      <label class="field" for="dc-d-${o.id}">Decision<select id="dc-d-${o.id}">${opt(DECISIONS)}</select></label><label class="field" for="dc-b-${o.id}">Decided by<input type="text" id="dc-b-${o.id}"></label>
      <label class="field" for="dc-r-${o.id}">Reason<input type="text" id="dc-r-${o.id}"></label></div>
      <div class="toolbar"><button class="btn primary" type="button" data-act="decide" data-id="${esc(o.id)}">Save decision</button></div></details>` : ''}
    <div class="msg" id="msg-${esc(o.id)}" role="status"></div></article>`;
}
V['staff-cycle'] = () => {
  if (S.mode === 'demo') return `<div class="panel">${DEMO_BANNER}<p class="empty">The coaching cycle holds operational records only.</p></div>`;
  const groups = [['proposed', 'Awaiting review'], ['accepted', 'In practice'], ['modified', 'In practice (modified)'], ['evidence-needed', 'Gathering evidence'], ['rejected', 'Rejected'], ['retired', 'Closed']];
  return `<div class="panel"><div class="lead">Coaching <em>cycle</em></div>
    <p>Evidence → proposed objective → review by the focus owner → practice session → result → next decision. Dota 2 and MLBB go to Aufa; PUBG Mobile, eFootball and MLBB Women to Fayad, who oversees every title; wellbeing to Donny. Reviews, sessions and decisions keep their names, times and reasons.</p>
    ${S.dbState === 'live' ? '' : banner('synth', `<div><b>Shared store ${esc(S.dbState)}.</b> Records stay in this tab only.</div>`)}</div>
    ${groups.map(([st, label]) => { const list = S.cycle.filter((o) => o.status === st); return list.length ? `<div class="panel"><h2>${esc(label)} (${list.length})</h2>${list.map(cycleCard).join('')}</div>` : ''; }).join('') || '<div class="panel"><p class="empty">No objectives yet. Open Dota 2 → Team and press "Send to coach review" on a proposal.</p></div>'}
    <div class="panel"><h2>Export</h2><p class="note">Operational records only, as JSON for the decision log or a spreadsheet.</p><div class="toolbar"><button class="btn" type="button" id="exportBtn">Show export</button></div><textarea id="exportBox" readonly hidden aria-label="Exported records"></textarea></div>`;
};

V['staff-measure'] = () => {
  if (S.mode === 'demo') return `<div class="panel">${DEMO_BANNER}<p class="empty">Measurement uses operational records only.</p></div>`;
  const objs = S.cycle; const sess = objs.flatMap((o) => o.sessions.map((s) => ({ ...s, title: o.title, status: o.status })));
  const count = (st) => objs.filter((o) => o.reviews.some((r) => r.decision === st)).length;
  const measured = sess.filter((s) => s.result !== 'not-measured');
  const d = pubgmData(); const mine = d.rows.filter((r) => r.team === d.team);
  const dates = [...new Set(mine.map((r) => r.date))].sort();
  let cmpHtml = banner('block', `<div><b>Not enough logged PUBG Mobile matches</b> for a before/after comparison (${mine.length}; 16 needed, 8 per side).</div>`);
  if (mine.length >= 16 && dates.length >= 2) {
    const split = S.splitDate && dates.includes(S.splitDate) ? S.splitDate : dates[Math.floor(dates.length / 2)]; S.splitDate = split;
    const A = mine.filter((r) => r.date < split), B = mine.filter((r) => r.date >= split); const k = KPIS.pubgm;
    const cmp = [compareWindows(k[0], A.map((r) => d.sc.total(r)), B.map((r) => d.sc.total(r))), compareWindows(k[3], A.map((r) => r.placement <= 8), B.map((r) => r.placement <= 8)), compareWindows(k[4], A.map((r) => r.died_phase > 0 && r.died_phase <= 2), B.map((r) => r.died_phase > 0 && r.died_phase <= 2))];
    cmpHtml = `<label class="field" for="mSplit">Change introduced on<select id="mSplit">${opt(dates, split)}</select></label><div class="tw"><table><thead><tr><th>Indicator</th><th class="n">Before</th><th class="n">After</th><th>Verdict</th></tr></thead><tbody>
      ${cmp.map((c) => `<tr><td>${esc(c.label)}</td><td class="n">${round(c.before ?? NaN, 2)}</td><td class="n">${round(c.after ?? NaN, 2)}</td><td><b>${esc(c.status)}</b>${c.flags.length ? `<br><span class="note">${c.flags.map(esc).join('; ')}</span>` : ''}</td></tr>`).join('')}</tbody></table></div>`;
  }
  return `<div class="panel"><div class="lead">Is the hub <em>helping</em>?</div><p>Workflow use and indicator changes only. The hub does not estimate win probability or claim that a drill caused a change.</p>
    <div class="stats"><div class="stat"><span class="k">Proposed</span><span class="v">${objs.length}</span></div><div class="stat"><span class="k">Accepted</span><span class="v">${count('accepted')}</span></div><div class="stat"><span class="k">Modified</span><span class="v">${count('modified')}</span></div><div class="stat"><span class="k">Rejected</span><span class="v">${count('rejected')}</span></div>
    <div class="stat"><span class="k">Sessions</span><span class="v">${sess.length}</span></div><div class="stat"><span class="k">Criterion met</span><span class="v">${measured.length ? `${measured.filter((s) => s.result === 'met').length}/${measured.length}` : '—'}</span></div>
    <div class="stat"><span class="k">Decisions</span><span class="v">${objs.reduce((a, o) => a + o.decisions.length, 0)}</span></div></div>
    ${objs.length < 5 ? '<p class="note">Fewer than 5 objectives: too early to judge whether the workflow is useful.</p>' : ''}</div>
  <div class="panel"><h2>Before / after — PUBG Mobile (operational logs)</h2>${cmpHtml}</div>`;
};

V['staff-rules'] = () => {
  const r = rule('pubgm-scoring');
  return `<div class="panel"><h2>Rules profiles</h2><p>Every analysis names the rules it depends on. Changing a profile flags the affected views and every objective proposed under the old version.</p>
    ${S.lastFlag ? banner('synth', `<div><b>Changed:</b> ${esc(S.lastFlag.label)}. Affected views: ${S.lastFlag.affected.map(esc).join(', ')}. Objectives flagged: ${S.lastFlag.objs}.</div>`) : ''}
    <div class="tw"><table><thead><tr><th>Rule</th><th>Version</th><th>Status</th><th>Source</th><th>Affects</th></tr></thead><tbody>
    ${S.rules.map((x) => `<tr><td><b>${esc(x.label)}</b><br><span class="note">${esc(x.title)}</span></td><td>${esc(x.version)}</td><td>${tag(x.status === 'confirmed' ? 'c-Verified' : x.status === 'blocked' ? 'c-Blocked' : 'c-Low', x.status)}</td><td class="note">${esc(x.source)}${x.history?.length ? `<br>Last change: ${esc(x.history.at(-1).by)}, ${esc(x.history.at(-1).at.slice(0, 10))} — ${esc(x.history.at(-1).reason)}` : ''}</td><td class="note">${x.affects.map(esc).join(', ')}</td></tr>`).join('')}</tbody></table></div></div>
  <div class="panel"><h2>Update a rule</h2><div class="form">
    <label class="field" for="ruId">Rule<select id="ruId">${S.rules.map((x) => `<option value="${esc(x.id)}">${esc(x.label)} (${esc(x.title)})</option>`).join('')}</select></label>
    <label class="field" for="ruVer">New version<input type="text" id="ruVer" placeholder="e.g. WEC26 rulebook v1"></label>
    <label class="field" for="ruSt">Status<select id="ruSt">${opt(['confirmed', 'provisional', 'unverified', 'blocked'])}</select></label>
    <label class="field" for="ruBy">Changed by<input type="text" id="ruBy"></label><label class="field" for="ruWhy">Source / reason<input type="text" id="ruWhy"></label></div>
    <div class="form"><label class="field" for="ruTable">PUBGM placement points 1–16 (scoring rule only)<input type="text" id="ruTable" value="${esc(r.table.join(','))}"></label><label class="field" for="ruElim">Points per elimination<input type="number" id="ruElim" value="${r.perElim}"></label></div>
    <div class="toolbar"><button class="btn primary" type="button" id="ruSave">Save rule change</button><span class="msg" id="ruMsg"></span></div></div>
  <div class="panel"><h2>Decisions that need people</h2><ul class="plain">
    <li>WEC Dota 2 draft rules, patch, series length — PB ESI intl. relations</li><li>WEC PUBG Mobile scoring table and substitute rule — PB ESI intl. relations</li>
    <li>Live-coaching and external-tool rules during matches — PB ESI intl. relations</li><li>Pelatnas dates, venue, budget — PB ESI BOD</li>
    <li>Who reviews hub proposals per title (title coach or Head Coach) — Head Coach</li><li>Who logs scrims per title (analyst) — Head Coach / BOD (support staff headcount)</li></ul>
    <p class="note">Recorded from the project decision log; the hub does not change these.</p></div>`;
};

V['staff-sources'] = () => `<div class="panel"><h2>Source registry</h2><div class="tw"><table><thead><tr><th>Source</th><th>Collected</th><th>Scope</th><th>Status</th><th>Access</th></tr></thead><tbody>
  ${SOURCES.map((s) => `<tr><td><b>${esc(s.name)}</b><br><span class="note">${/^https?:/.test(s.url) ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.url)}</a>` : esc(s.url)}</span></td><td>${esc(s.collected)}</td><td>${esc(s.scope)}<br><span class="note">${esc(s.completeness)}</span></td><td class="note">${esc(s.status)}</td><td class="note">${esc(s.access)}</td></tr>`).join('')}</tbody></table></div>
  <p class="note">Built ${esc(DATA.builtAt.slice(0, 16).replace('T', ' '))} UTC · V1.1.</p></div>`;

// Wellbeing (Donny). Editors only; screening flags, never diagnoses or scores.
const WELL_NOTE = 'Health and mental-wellbeing data, recorded with the players\' consent (confirmed 3 Nov 2026). Visible to editors of this page only; whether access narrows to Donny alone is still open. Flags are prompts to talk to the player, not diagnoses.';
V['well-day'] = () => {
  if (S.mode === 'demo') return `<div class="panel">${DEMO_BANNER}<p class="empty">Wellbeing uses operational records only.</p></div>`;
  if (S.wellAccess === 'denied') return `<div class="panel">${banner('block', HUB_USER ? '<div><b>Restricted.</b> Wellbeing records are limited to the readiness owner (Coach Donny) and admins until the Head Coach decides who else may see them.</div>' : '<div><b>Editors only.</b> Ask the page owner for edit access to see wellbeing records.</div>')}</div>`;
  const t = S.wellTitle, roster = S.roster[t] || [];
  const d = teamDay(roster, S.wellDate, S.well.checkins, S.well.loads);
  return `<div class="panel"><h2>Daily check — ${esc(t)}</h2>${banner('synth', `<div>${esc(WELL_NOTE)}</div>`)}
    <div class="form"><label class="field" for="wT">Title<select id="wT">${WEC_TITLES.map((x) => `<option ${x.id === t ? 'selected' : ''}>${esc(x.id)}</option>`).join('')}</select></label><label class="field" for="wD">Date<input type="date" id="wD" value="${esc(S.wellDate)}"></label></div>
    ${roster.length ? `<p>${d.done} of ${d.total} players checked in.</p><div class="tw"><table><thead><tr><th>Player</th><th class="n">Wellness /25</th><th class="n">Sleep h</th><th>Flags</th></tr></thead><tbody>
      ${d.rows.map((r) => { const c = S.well.checkins.find((x) => x.player === r.player && x.date === S.wellDate); return `<tr><td><b>${esc(r.player)}</b></td><td class="n">${c ? c.wellness : '—'}</td><td class="n">${c ? c.sleepH : '—'}</td><td>${r.flags.map((f) => `<div class="${f.level === 'check' ? 'flag-check' : 'note'}">${esc(f.text)}</div>`).join('')}</td></tr>`; }).join('')}</tbody></table></div>`
      : banner('block', '<div>No roster for this title in the hub yet. Add it below (names as on the WEC roster).</div>')}
    <p class="note">Flags: wellness ${THRESHOLDS.wellnessSD} SD below the player's own 28-day average (after ${MIN_BASELINE_DAYS} check-ins); under ${THRESHOLDS.shortSleepH} h sleep ${THRESHOLDS.shortSleepDays} days running; 7-day session load above ${THRESHOLDS.loadRatio}× the previous 3-week average. Thresholds are Donny's to change.</p></div>
  <div class="panel"><h2>Roster — ${esc(t)}</h2><label class="field" for="wR">Players (comma-separated)<input type="text" id="wR" value="${esc(roster.join(', '))}"></label><div class="toolbar"><button class="btn" type="button" id="wRSave">Save roster</button><span class="msg" id="wRMsg"></span></div></div>`;
};
V['well-log'] = () => {
  if (S.mode === 'demo') return `<div class="panel">${DEMO_BANNER}<p class="empty">Wellbeing uses operational records only.</p></div>`;
  const t = S.wellTitle, roster = S.roster[t] || [];
  const sel = (id, lo, hi) => `<select id="${id}">${Array.from({ length: hi - lo + 1 }, (_, i) => `<option ${i + lo === 3 ? 'selected' : ''}>${i + lo}</option>`).join('')}</select>`;
  return `<div class="panel"><h2>Check-in</h2>${banner('synth', `<div>${esc(WELL_NOTE)}</div>`)}
    <div class="form"><label class="field" for="wT">Title<select id="wT">${WEC_TITLES.map((x) => `<option ${x.id === t ? 'selected' : ''}>${esc(x.id)}</option>`).join('')}</select></label>
    <label class="field" for="ciP">Player<select id="ciP">${roster.map((p) => `<option>${esc(p)}</option>`).join('')}</select></label><label class="field" for="ciD">Date<input type="date" id="ciD" value="${esc(S.wellDate)}"></label>
    <label class="field" for="ciH">Sleep hours<input type="number" id="ciH" step="0.5" min="0" max="16" value="7"></label>
    ${ITEMS.map((k) => `<label class="field" for="ci-${k}">${esc(ITEM_LABEL[k])} (1–5)${sel(`ci-${k}`, 1, 5)}</label>`).join('')}
    <label class="field" for="ciBy">Entered by<input type="text" id="ciBy" value="${esc(STAFF.find((x) => x.id === S.me)?.name || '')}"></label></div>
    <div class="toolbar"><button class="btn primary" type="button" id="ciSave" ${roster.length ? '' : 'disabled'}>Save check-in</button><span class="msg" id="ciMsg"></span></div>
    <p class="note">5 = very good on every item (fresh, not sore, not stressed). Keep notes out of this form; talk to the player instead.</p></div>
  <div class="panel"><h2>Session load</h2><div class="form">
    <label class="field" for="slP">Player<select id="slP">${roster.map((p) => `<option>${esc(p)}</option>`).join('')}</select></label><label class="field" for="slD">Date<input type="date" id="slD" value="${esc(S.wellDate)}"></label>
    <label class="field" for="slK">Session<select id="slK"><option>scrim</option><option>individual practice</option><option>physical training</option><option>review</option><option>official match</option></select></label>
    <label class="field" for="slM">Minutes<input type="number" id="slM" min="1" max="600" value="120"></label><label class="field" for="slR">Session RPE (0–10, asked 30 min after)<input type="number" id="slR" min="0" max="10" value="5"></label></div>
    <div class="toolbar"><button class="btn primary" type="button" id="slSave" ${roster.length ? '' : 'disabled'}>Save load</button><span class="msg" id="slMsg"></span></div></div>`;
};

// ---------- V1.4: tournament week, VOD library, partner bank, player plans, weekly brief ----------
const meName = () => STAFF.find((x) => x.id === S.me)?.name || '';
const titleSelect = (id, cur) => `<select id="${id}">${WEC_TITLES.map((x) => `<option ${x.id === cur ? 'selected' : ''}>${esc(x.id)}</option>`).join('')}</select>`;
const runbookFor = (t) => S.runbooks[t] || defaultRunbook(t);
async function saveRunbooks() { if (S.db) await S.db.doc('config/runbooks').set({ runbooks: S.runbooks }); }
async function saveMatch(m) {
  assertOperational([m], 'WEC match tracker');
  const i = S.wecMatches.findIndex((x) => x.id === m.id); if (i >= 0) S.wecMatches[i] = m; else S.wecMatches.push(m);
  if (S.db) await S.db.collection('wec_matches').doc(m.id).set(m);
}
const liveRuleBanner = () => { const r = rule('wec-live-coaching'); return r && r.status !== 'confirmed' ? banner('block', `<div><b>WEC coaching-contact rules: ${esc(r.status)}.</b> IESF has not published when coaches may talk to players (between games, pauses, draft). Use the between-games sheet only within what the rules allow; Fayad confirms the rule before 15 Dec (Staff → Rules).</div>`) : ''; };
const SIDES = { 'Dota 2': ['Radiant', 'Dire'], MLBB: ['Blue', 'Red'], 'MLBB Women': ['Blue', 'Red'], CS2: ['CT start', 'T start'], 'CS2 Women': ['CT start', 'T start'], 'PUBG Mobile': ['Erangel', 'Miramar', 'Sanhok', 'Vikendi', 'Livik', 'Rondo'], eFootball: ['Home', 'Away'] };

V['tour-runbook'] = () => {
  if (S.mode === 'demo') return `<div class="panel">${DEMO_BANNER}<p class="empty">The match tracker uses operational records only.</p></div>`;
  const t = S.tourTitle, rb = runbookFor(t);
  const ms = S.wecMatches.filter((m) => m.title === t).sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`));
  const card = (m) => {
    const n = rb.filter((x) => m.done[x.id]).length;
    return `<div class="obj"><header><div><span class="note">${esc(m.date)}${m.time ? ` ${esc(m.time)}` : ''}${m.stage ? ` · ${esc(m.stage)}` : ''}${m.format ? ` · ${esc(m.format)}` : ''}</span><h3>vs ${esc(m.opponent)}</h3></div>${m.result ? tag(m.result.result === 'won' ? 'c-High' : m.result.result === 'lost' ? 'c-Blocked' : 'c-Medium', `${m.result.result}${m.result.score ? ` ${m.result.score}` : ''}`) : tag('c-Low', `${n}/${rb.length} ready`)}</header>
      <ul class="plain check">${rb.map((x) => `<li><button type="button" class="tick ${m.done[x.id] ? 'on' : ''}" data-tick="${esc(m.id)}|${esc(x.id)}" aria-pressed="${!!m.done[x.id]}">${m.done[x.id] ? '✓' : ''}</button> <span class="mono">${esc(tLabel(x.t))}</span> ${esc(x.item)} <span class="note">— ${esc(x.owner)}${m.done[x.id] ? ` · ticked by ${esc(m.done[x.id].by)}` : ''}</span></li>`).join('')}</ul>
      ${m.result ? `<p class="note">Result recorded by ${esc(m.result.by)}.</p>` : `<div class="form"><label class="field" for="wrR-${m.id}">Result<select id="wrR-${m.id}"><option value="">—</option><option>won</option><option>lost</option><option>draw</option><option>placed</option></select></label><label class="field" for="wrS-${m.id}">Score / placement<input type="text" id="wrS-${m.id}" placeholder="2-1 or 3rd, 45 pts"></label></div>`}
      <div class="toolbar">${m.result ? '' : `<button class="btn" type="button" data-wm-result="${esc(m.id)}">Save result</button>`}${m.opponent !== 'TBD' ? `<button class="btn" type="button" data-card="${esc(m.title)}|${esc(m.opponent)}">Opponent card</button>` : ''}<button class="btn" type="button" data-series="${esc(m.id)}">Between-games sheet (${m.games.length})</button><span class="msg" id="wmMsg-${m.id}"></span></div></div>`;
  };
  return `<div class="panel"><div class="lead">Tournament <em>week</em></div>
    <p>WEC finals: ${esc(EVENT.start)} to ${esc(EVENT.end)}, ${esc(EVENT.venue)}. One match-day runbook per title, then one card per WEC match with the checklist ticked by whoever did it.</p>
    ${banner('block', '<div><b>Bracket, match times and format not published.</b> Enter each match when IESF announces it; nothing here is a schedule until then.</div>')}
    <div class="form"><label class="field" for="tourT">Title${titleSelect('tourT', t)}</label></div></div>
  <div class="cols"><div class="panel"><h2>Match-day runbook — ${esc(t)}</h2>
    <p class="note">${S.runbooks[t] ? 'Edited by the staff.' : 'Starting template proposed by the hub, not yet agreed. Fayad and Donny to agree it; edit freely.'} Times are relative to match start.</p>
    <div class="tw"><table><thead><tr><th>When</th><th>Item</th><th>Owner</th><th></th></tr></thead><tbody>${rb.map((x) => `<tr><td class="mono">${esc(tLabel(x.t))}</td><td>${esc(x.item)}</td><td class="note">${esc(x.owner)}</td><td>${x.t === 0 ? '' : `<button class="btn small" type="button" data-rb-del="${esc(x.id)}" aria-label="Remove ${esc(x.item)}">Remove</button>`}</td></tr>`).join('')}</tbody></table></div>
    <details><summary class="btn">Add an item</summary><div class="form"><label class="field" for="rbT">Minutes before start<input type="number" id="rbT" min="0" max="2880" value="20"></label><label class="field" for="rbI">Item<input type="text" id="rbI"></label><label class="field" for="rbO">Owner<input type="text" id="rbO" value="${esc(meName())}"></label></div>
      <div class="toolbar"><button class="btn primary" type="button" id="rbAdd">Add</button><button class="btn" type="button" id="rbReset">Reset to template</button><span class="msg" id="rbMsg"></span></div></details></div>
  <div class="panel"><h2>Add a WEC match</h2><div class="form">
    <label class="field" for="wmD">Date<input type="date" id="wmD" min="${EVENT.start}" max="${EVENT.end}" value="${EVENT.start}"></label><label class="field" for="wmTm">Time<input type="text" id="wmTm" placeholder="13:00 WIB"></label>
    <label class="field" for="wmSt">Stage<input type="text" id="wmSt" placeholder="Group B, upper bracket R1…"></label>
    <label class="field" for="wmO">Opponent<select id="wmO"><option>TBD</option>${(FIELDS[t] || []).map((n) => `<option>${esc(n)}</option>`).join('')}</select></label>
    <label class="field" for="wmF">Format<select id="wmF"><option value=""></option>${FORMATS.map((k) => `<option>${k}</option>`).join('')}</select></label></div>
    <div class="toolbar"><button class="btn primary" type="button" id="wmAdd">Add match</button><span class="msg" id="wmAddMsg"></span></div></div></div>
  <div class="panel"><h2>WEC matches — ${esc(t)}</h2>${ms.map(card).join('') || '<p class="empty">No WEC match entered for this title yet.</p>'}</div>`;
};

V['tour-series'] = () => {
  if (S.mode === 'demo') return `<div class="panel">${DEMO_BANNER}<p class="empty">Operational records only.</p></div>`;
  const all = [...S.wecMatches].sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`));
  const m = all.find((x) => x.id === S.tourMatch) || all.find((x) => !x.result) || all[0];
  const head = `<div class="panel"><div class="lead">Between <em>games</em></div><p>One entry per game: what worked, what failed, the one adjustment for the next game, and at most one call per player. Short enough to fill in during a break.</p>${liveRuleBanner()}`;
  if (!m) return `${head}<p class="empty">No WEC match yet. Add one in <a href="#tour-runbook">Match-day runbook</a>.</p></div>`;
  const roster = S.roster[m.title] || [];
  const applied = m.games.filter((g) => g.applied !== null);
  const sides = SIDES[m.title] || [];
  return `${head}<div class="form"><label class="field" for="tsM">Match<select id="tsM">${all.map((x) => `<option value="${esc(x.id)}" ${x.id === m.id ? 'selected' : ''}>${esc(x.date)} · ${esc(x.title)} vs ${esc(x.opponent)}${x.stage ? ` (${esc(x.stage)})` : ''}</option>`).join('')}</select></label></div>
    ${applied.length ? `<p class="note">Adjustments used in the next game: ${applied.filter((g) => g.applied).length} of ${applied.length} marked.</p>` : ''}</div>
  <div class="cols"><div class="panel"><h2>${esc(m.title)} vs ${esc(m.opponent)}</h2>${m.games.map((g) => `<div class="obj"><header><div><span class="note">Game ${g.game}${g.side ? ` · ${esc(g.side)}` : ''} · ${esc(g.by)}</span><h3>${esc(g.outcome || 'outcome not set')}</h3></div>${g.applied === null ? '' : tag(g.applied ? 'c-High' : 'c-Low', g.applied ? 'adjustment used' : 'not used')}</header>
      ${g.worked ? `<p><b>Worked:</b> ${esc(g.worked)}</p>` : ''}${g.failed ? `<p><b>Failed:</b> ${esc(g.failed)}</p>` : ''}<p><b>Next game:</b> ${esc(g.adjust)}</p>
      ${Object.keys(g.calls).length ? `<ul class="plain">${Object.entries(g.calls).map(([k, v]) => `<li><b>${esc(k)}</b>: ${esc(v)}</li>`).join('')}</ul>` : ''}
      ${g.game < m.games.length + 1 && g.applied === null && m.games.some((x) => x.game === g.game + 1) ? `<div class="toolbar"><span class="note">Was it used in game ${g.game + 1}?</span><button class="btn small" type="button" data-applied="${esc(m.id)}|${g.game}|1">Yes</button><button class="btn small" type="button" data-applied="${esc(m.id)}|${g.game}|0">No</button></div>` : ''}</div>`).join('') || '<p class="empty">No game noted yet.</p>'}</div>
  <div class="panel"><h2>Game ${m.games.length + 1} — note</h2><div class="form">
    <label class="field" for="gnSide">${m.title === 'PUBG Mobile' ? 'Map' : 'Side'}<select id="gnSide"><option value=""></option>${sides.map((x) => `<option>${esc(x)}</option>`).join('')}</select></label>
    <label class="field" for="gnOut">Outcome<select id="gnOut"><option value=""></option><option>won</option><option>lost</option><option>draw</option>${m.title === 'PUBG Mobile' ? '<option>top 4</option><option>outside top 4</option>' : ''}</select></label>
    <label class="field" for="gnBy">By<input type="text" id="gnBy" value="${esc(meName())}"></label></div>
    <label class="field" for="gnW">What worked<input type="text" id="gnW"></label><label class="field" for="gnF">What failed<input type="text" id="gnF"></label>
    <label class="field" for="gnA">The one adjustment for the next game (required)<input type="text" id="gnA" placeholder="${m.title === 'Dota 2' || m.title.startsWith('MLBB') ? 'e.g. ban X first phase; we pick Y last' : m.title.startsWith('CS2') ? 'e.g. stack B on their eco' : 'e.g. rotate early on edge'}"></label>
    ${roster.length ? `<fieldset class="objpick"><legend class="note">One call per player (optional)</legend>${roster.map((p, i) => `<label class="field" for="gnC-${i}">${esc(p)}<input type="text" id="gnC-${i}" data-player="${esc(p)}"></label>`).join('')}</fieldset>` : `<p class="note">No roster entered for ${esc(m.title)}; add it under Players → Wellbeing check to get one line per player.</p>`}
    <div class="toolbar"><button class="btn primary" type="button" id="gnSave">Save game ${m.games.length + 1}</button><span class="msg" id="gnMsg"></span></div></div></div>`;
};

function vodPanel(title) {
  const fid = sid(title);
  const list = S.vods.filter((v) => v.title === title).sort((a, b) => a.nation.localeCompare(b.nation) || (b.date || '').localeCompare(a.date || ''));
  return `<div class="panel"><h2>Rival VOD library — ${esc(title)}</h2>
    <p class="note">Links to rival games, tagged so any coach can find them. A reviewed VOD can become a competitor note with the link as its source. The hub stores links only, not video.</p>
    ${list.length ? `<div class="tw"><table><thead><tr><th>Nation</th><th>Event</th><th>Tags</th><th>Notes</th><th>Review</th></tr></thead><tbody>${list.map((v) => `<tr><td><b>${esc(v.nation)}</b>${v.players ? `<br><span class="note">${esc(v.players)}</span>` : ''}</td>
      <td><a href="${esc(v.url)}" target="_blank" rel="noopener">${esc(v.event)}</a><br><span class="note">${esc(v.date)}${v.game ? ` · ${esc(v.game)}` : ''} · added by ${esc(v.by)}</span></td>
      <td>${v.tags.map((x) => tag('k-observed', x)).join(' ')}</td><td>${esc(v.notes)}${v.reviewNote ? `<br><b>Review:</b> ${esc(v.reviewNote)}` : ''}</td>
      <td>${v.reviewed ? `${tag('c-Verified', 'reviewed')}<br><span class="note">${esc(v.reviewedBy)}</span>${S.mode === 'demo' ? '' : `<br><button class="btn small" type="button" data-vod-note="${esc(v.id)}">Make competitor note</button>`}` : S.mode === 'demo' ? '' : `<input type="text" id="vrN-${esc(v.id)}" aria-label="Review note" placeholder="Key takeaway"><button class="btn small" type="button" data-vod-review="${esc(v.id)}">Mark reviewed</button>`}<span class="msg" id="vrMsg-${esc(v.id)}"></span></td></tr>`).join('')}</tbody></table></div>` : '<p class="empty">No VOD added for this title yet.</p>'}
    ${S.mode === 'demo' ? '' : `<details><summary class="btn">Add a VOD</summary><div class="form">
      <label class="field" for="vdN-${fid}">Nation<select id="vdN-${fid}">${(FIELDS[title] || []).map((n) => `<option>${esc(n)}</option>`).join('')}</select></label>
      <label class="field" for="vdU-${fid}">Video link<input type="url" id="vdU-${fid}" placeholder="https://"></label>
      <label class="field" for="vdE-${fid}">Event<input type="text" id="vdE-${fid}" placeholder="Qualifier, league, scrim"></label>
      <label class="field" for="vdD-${fid}">Date played<input type="date" id="vdD-${fid}"></label>
      <label class="field" for="vdG-${fid}">Game / map<input type="text" id="vdG-${fid}" placeholder="Game 2, Erangel…"></label>
      <label class="field" for="vdP-${fid}">Players to watch<input type="text" id="vdP-${fid}"></label>
      <label class="field" for="vdB-${fid}">Added by<input type="text" id="vdB-${fid}" value="${esc(meName())}"></label></div>
      <fieldset class="objpick"><legend class="note">Tags</legend>${VOD_TAGS.map((x) => `<label><input type="checkbox" name="vdTag-${fid}" value="${esc(x)}"> ${esc(x)}</label>`).join('')}</fieldset>
      <label class="field" for="vdX-${fid}">Notes<input type="text" id="vdX-${fid}"></label>
      <div class="toolbar"><button class="btn primary" type="button" data-vod-add="${esc(title)}">Save VOD</button><span class="msg" id="vdMsg-${fid}"></span></div></details>`}</div>`;
}

function partnerPanel(title) {
  const fid = sid(title);
  const list = S.partners.filter((p) => p.title === title);
  return `<div class="panel"><h2>Sparring partner bank — ${esc(title)}</h2>
    <p class="note">Teams we can scrim, how strong they are, and which WEC rival they play like. Record which staff member holds the contact; no phone numbers or personal details here. Partners appear as suggestions when planning a scrim.</p>
    ${list.length ? `<div class="tw"><table><thead><tr><th>Team</th><th>Level</th><th>Plays like</th><th>Availability</th><th>Contact held by</th><th class="n">Scrims done</th></tr></thead><tbody>${list.map((p) => { const st = partnerStats(p, S.scrims); return `<tr><td><b>${esc(p.name)}</b>${p.region ? `<br><span class="note">${esc(p.region)}</span>` : ''}</td><td>${esc(p.level)}</td><td>${p.resembles ? `${esc(p.resembles)}${p.why ? `<br><span class="note">${esc(p.why)}</span>` : ''}` : '—'}</td><td>${esc(p.availability || '—')}</td><td>${esc(p.contactOwner)}</td><td class="n">${st.scrims}${st.last ? `<br><span class="note">last ${esc(st.last)}</span>` : ''}</td></tr>`; }).join('')}</tbody></table></div>` : '<p class="empty">No partner in the bank yet.</p>'}
    ${S.mode === 'demo' ? '' : `<details><summary class="btn">Add a partner</summary><div class="form">
      <label class="field" for="ptN-${fid}">Team<input type="text" id="ptN-${fid}"></label>
      <label class="field" for="ptL-${fid}">Level<select id="ptL-${fid}">${LEVELS.map((x) => `<option>${esc(x)}</option>`).join('')}</select></label>
      <label class="field" for="ptR-${fid}">Region / server<input type="text" id="ptR-${fid}"></label>
      <label class="field" for="ptM-${fid}">Plays like (WEC rival)<select id="ptM-${fid}"><option value=""></option>${(FIELDS[title] || []).map((n) => `<option>${esc(n)}</option>`).join('')}</select></label>
      <label class="field" for="ptW-${fid}">Why they resemble that rival<input type="text" id="ptW-${fid}"></label>
      <label class="field" for="ptA-${fid}">Availability<input type="text" id="ptA-${fid}" placeholder="Weeknights 19:00 WIB"></label>
      <label class="field" for="ptC-${fid}">Contact held by (staff)<input type="text" id="ptC-${fid}" value="${esc(meName())}"></label></div>
      <div class="toolbar"><button class="btn primary" type="button" data-partner-add="${esc(title)}">Save partner</button><span class="msg" id="ptMsg-${fid}"></span></div></details>`}</div>`;
}

const planKey = (t, p) => sid(`${t}_${p}`);
V.players = () => {
  if (S.mode === 'demo') return `<div class="panel">${DEMO_BANNER}<p class="empty">Player plans use operational records only.</p></div>`;
  const t = S.planTitle, roster = S.roster[t] || [];
  const p = roster.includes(S.planPlayer) ? S.planPlayer : roster[0];
  const head = `<div class="panel"><div class="lead">Player <em>plans</em></div><p>Two or three goals per player, each with how it is measured and who owns it. Game goals belong to the title coach; physical and mental goals are agreed with Donny.</p>
    ${banner('synth', '<div>Visible to everyone with access to this page. Write goals and measures only; no diagnoses, health details or check-in values (those stay in Wellbeing, editors only).</div>')}
    <div class="form"><label class="field" for="plT">Title${titleSelect('plT', t)}</label>${roster.length ? `<label class="field" for="plP">Player<select id="plP">${roster.map((x) => `<option ${x === p ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></label>` : ''}</div></div>`;
  if (!roster.length) return `${head}<div class="panel">${banner('block', `<div>No roster for ${esc(t)} yet. Add it under <a href="#well-day">Wellbeing check</a>.</div>`)}</div>`;
  const pl = S.plans[planKey(t, p)] || newPlan(t, p);
  const overview = roster.map((x) => { const g = S.plans[planKey(t, x)]?.goals || []; return { x, n: g.filter((y) => !['done', 'dropped'].includes(y.status)).length, risk: g.filter((y) => y.status === 'at risk').length, done: g.filter((y) => y.status === 'done').length }; });
  return `${head}<div class="panel"><h2>${esc(t)} — all players</h2><div class="tw"><table><thead><tr><th>Player</th><th class="n">Open goals</th><th class="n">At risk</th><th class="n">Done</th></tr></thead><tbody>${overview.map((r) => `<tr class="${r.x === p ? 'me' : ''}"><td><b>${esc(r.x)}</b></td><td class="n">${r.n}</td><td class="n">${r.risk}</td><td class="n">${r.done}</td></tr>`).join('')}</tbody></table></div></div>
  <div class="cols"><div class="panel"><h2>${esc(p)}</h2>${AREAS.map((a) => { const gs = pl.goals.filter((g) => g.area === a); return `<div class="h3">${esc(a[0].toUpperCase() + a.slice(1))}</div>${gs.map((g) => `<div class="obj"><header><div><span class="note">Owner ${esc(g.owner)}${g.due ? ` · due ${esc(g.due)}` : ''}</span><h3>${esc(g.goal)}</h3></div>${tag(g.status === 'done' ? 'c-High' : g.status === 'at risk' ? 'c-Blocked' : g.status === 'on track' ? 'c-Medium' : 'c-Low', g.status)}</header>
      <p class="note">Measured by: ${esc(g.measure)}</p>${capUi().goalStatNote(t, p, g)}${g.updates.length ? `<p class="note">Last update: ${esc(g.updates.at(-1).note || g.updates.at(-1).status)} — ${esc(g.updates.at(-1).by)}, ${esc(g.updates.at(-1).at.slice(0, 10))}</p>` : ''}
      <div class="form"><label class="field" for="guS-${g.id}">Status<select id="guS-${g.id}">${GOAL_STATUS.map((s) => `<option ${s === g.status ? 'selected' : ''}>${s}</option>`).join('')}</select></label><label class="field" for="guN-${g.id}">Note<input type="text" id="guN-${g.id}"></label></div>
      <div class="toolbar"><button class="btn small" type="button" data-goal-upd="${esc(g.id)}">Update</button><span class="msg" id="guMsg-${g.id}"></span></div></div>`).join('') || '<p class="note">No goal.</p>'}`; }).join('')}</div>
  <div class="panel"><h2>Add a goal</h2><div class="form">
    <label class="field" for="gaA">Area<select id="gaA">${AREAS.map((a) => `<option>${a}</option>`).join('')}</select></label>
    <label class="field" for="gaD">Due<input type="date" id="gaD"></label><label class="field" for="gaO">Owner<input type="text" id="gaO" value="${esc(meName())}"></label></div>
    <label class="field" for="gaG">Goal<input type="text" id="gaG" placeholder="${t === 'Dota 2' ? 'e.g. two more established heroes for pos 4' : 'e.g. widen hero/agent pool by two'}"></label>
    <label class="field" for="gaM">How it is measured<input type="text" id="gaM" placeholder="e.g. 6+ scrim games on each by 1 Dec, coach sign-off"></label>
    ${capUi().goalStatFields(t)}
    <div class="toolbar"><button class="btn primary" type="button" id="gaAdd">Add goal</button><span class="msg" id="gaMsg"></span></div></div></div>
  ${capUi().trailPanel(t, p)}`;
};

// Decisions still open (decision log, 3 Nov). Edit here when they are settled.
const PENDING = [
  'Juara Umum (overall title) scoring rule — PB ESI intl. relations to obtain from IESF.',
  'WEC coaching-contact rules (between games, pauses) — Fayad to confirm with IESF.',
  'Pelatnas dates and player availability — to be collected and confirmed.',
  'Player SK publication date and process — to be confirmed.',
  'Player compensation — under discussion; no figures to be communicated.',
  'Wellbeing record access: editors, or Donny only — Fayad/Donny to decide.',
  'Who logs PUBG Mobile scrims and session RPE — Fayad to assign.',
  'CS2 and CS2 Women focus owner on the staff — Fayad to assign.',
];
const briefText = () => weeklyBrief({ asOf: S.briefDate, cycle: S.cycle, scrims: S.scrims, rivals: S.rivals, tiers: S.tiers, checkins: S.well.checkins, roster: S.roster, rules: S.rules, pending: PENDING, plans: Object.values(S.plans), reports: S.reports });
function mdHtml(md) {
  const out = []; let tbl = null, ul = false;
  const flush = () => { if (tbl) { out.push(`<div class="tw"><table><thead><tr>${tbl[0].map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${tbl.slice(1).map((r) => `<tr>${r.map((c, i) => `<td${i > 1 ? ' class="n"' : ''}>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`); tbl = null; } if (ul) { out.push('</ul>'); ul = false; } };
  for (const l of md.split('\n')) {
    if (l.startsWith('|')) { if (/^\|[-| ]+\|$/.test(l)) continue; (tbl ||= []).push(l.slice(1, -1).split('|').map((x) => x.trim())); continue; }
    if (l.startsWith('- ')) { if (tbl) flush(); if (!ul) { out.push('<ul class="plain">'); ul = true; } out.push(`<li>${esc(l.slice(2))}</li>`); continue; }
    flush();
    if (l.startsWith('# ')) out.push(`<h2>${esc(l.slice(2))}</h2>`); else if (l.startsWith('## ')) out.push(`<div class="h3">${esc(l.slice(3))}</div>`); else if (l.trim()) out.push(`<p>${esc(l)}</p>`);
  }
  flush(); return out.join('');
}
V.brief = () => {
  if (S.mode === 'demo') return `<div class="panel">${DEMO_BANNER}<p class="empty">The brief uses operational records only.</p></div>`;
  const md = briefText();
  return `<div class="panel"><div class="lead">Weekly <em>brief</em></div><p>One page for Fayad and the BOD, built from the same records the staff use. Team-level counts only: no individual wellbeing values, no compensation, no win probabilities. Nothing is sent from here; Fayad decides what goes to the BOD.</p>
    <div class="form"><label class="field" for="brD">Week ending<input type="date" id="brD" value="${esc(S.briefDate)}"></label></div>
    <div class="toolbar"><button class="btn" type="button" id="brCopy">Copy text</button><button class="btn" type="button" id="brDl">Download .md</button><span class="msg" id="brMsg"></span></div></div>
  <div class="panel brief">${mdHtml(md)}</div>`;
};

// ---------- V1.5: Competitors (all titles) ----------
const TITLE_TAB = { 'Dota 2': 'dota-scout', 'PUBG Mobile': 'pubgm-rivals', ...Object.fromEntries(GAME_HUBS.map((h) => [h.title, `${h.team}-rivals`])) };
const REPORT_TAB = { 'Dota 2': 'dota-reports', 'PUBG Mobile': 'pubgm-reports', ...Object.fromEntries(GAME_HUBS.map((h) => [h.title, `${h.team}-reports`])) };
const TEAM_TAB = { 'Dota 2': 'dota-team', 'PUBG Mobile': 'pubgm-team', ...Object.fromEntries(GAME_HUBS.map((h) => [h.title, h.team])) };
const SHORT = { 'Dota 2': 'Dota', MLBB: 'MLBB', 'MLBB Women': 'MLBB W', 'PUBG Mobile': 'PUBGM', CS2: 'CS2', 'CS2 Women': 'CS2 W', eFootball: 'eFb' };
const tierTag = (tier, label) => tag(tier === 'main threat' ? 'c-Blocked' : tier === 'contender' ? 'c-Low' : tier === 'watch' ? 'c-Medium' : 'k-observed', label ?? tier);
const compData = () => ({ rivals: S.rivals, tiers: S.tiers, vods: S.vods, partners: S.partners, scrims: S.scrims, matches: S.wecMatches });
const compHead = (sub) => `<div class="panel"><div class="lead">Competitor <em>analysis</em></div><p>${sub}</p><p class="note">Fields: ${esc(FIELD_SOURCE)}. Threat tiers are staff judgements with a reason; nothing here is scored or predicted.</p></div>`;

V['comp-overview'] = () => {
  if (S.mode === 'demo') return `<div class="panel">${DEMO_BANNER}<p class="empty">Competitor analysis uses operational records only.</p></div>`;
  const rows = crossTitle(compData(), { includeEfootballUnscouted: S.compAllEf });
  const multi = rows.filter((r) => r.titles.length > 1);
  const threats = rows.flatMap((r) => r.per.filter((x) => x.tier === 'main threat').map((x) => ({ nation: r.nation, ...x })));
  return `${compHead('Every nation Indonesia can meet at WEC, across all seven titles, in one place. Pick a nation to see everything the staff hold on it.')}
  <div class="stats"><div class="stat"><span class="k">Nations in our fields</span><span class="v">${crossTitle(compData(), { includeEfootballUnscouted: true }).length}</span></div><div class="stat"><span class="k">In 2+ of our titles</span><span class="v">${multi.length}</span></div><div class="stat"><span class="k">Main threats set</span><span class="v">${threats.length}</span></div><div class="stat"><span class="k">Nations with notes</span><span class="v">${rows.filter((r) => r.notes).length}</span></div></div>
  ${threats.length ? `<div class="panel"><h2>Main threats (staff)</h2><ul class="plain">${threats.map((x) => `<li>${tierTag('main threat', SHORT[x.title])} <b>${esc(x.nation)}</b> — ${esc(x.tierWhy)} <span class="note">(${esc(x.tierBy)})</span></li>`).join('')}</ul></div>` : ''}
  <div class="panel"><h2>All nations</h2>
    <p class="note">Sorted by main threats, then how many of our titles they enter, then notes. ${S.compAllEf ? '' : 'eFootball-only nations are hidden until someone scouts them.'} <button class="btn small" type="button" id="compEf">${S.compAllEf ? 'Hide' : 'Show'} eFootball-only nations</button></p>
    <div class="tw"><table><thead><tr><th>Nation</th><th>Titles (staff tier)</th><th class="n">Notes</th><th class="n">VODs</th><th class="n">Stand-in scrims</th><th>Last update</th></tr></thead><tbody>
    ${rows.map((r) => `<tr><td><button class="linkbtn" type="button" data-nation="${esc(r.nation)}">${esc(r.nation)}</button></td><td>${r.per.map((x) => tierTag(x.tier, `${SHORT[x.title]}${x.tier === 'not assessed' ? '' : ` · ${x.tier}`}`)).join(' ')}</td><td class="n">${r.notes || '—'}</td><td class="n">${r.vods || '—'}</td><td class="n">${r.scrimsDone || '—'}</td><td class="note">${esc(r.updated || '—')}</td></tr>`).join('')}</tbody></table></div></div>`;
};

V['comp-nation'] = () => {
  if (S.mode === 'demo') return `<div class="panel">${DEMO_BANNER}<p class="empty">Operational records only.</p></div>`;
  const all = crossTitle(compData(), { includeEfootballUnscouted: true }).map((r) => r.nation).sort((a, b) => a.localeCompare(b));
  const n = all.includes(S.compNation) ? S.compNation : 'Egypt';
  const P = nationProfile(n, compData());
  const section = (x) => `<div class="obj"><header><div><span class="note">${x.updated ? `Last update ${esc(x.updated)}` : 'Not scouted yet'}</span><h3>${esc(x.title)}</h3></div>${tierTag(x.tier)}</header>
    ${x.tierWhy ? `<p class="note">Tier by ${esc(x.tierBy)}: ${esc(x.tierWhy)}</p>` : ''}
    ${(() => { const tm = rosterOf(x.title, P.nation); if (!tm) return ''; const st = checkStatus(tm, today()); return `<div class="h3">Roster</div><p>${tm.players.map((p) => `${esc(p.ign)}${p.captain ? ' (C)' : ''}${p.role ? ` <span class="note">${esc(p.role)}</span>` : ''}`).join(', ')}${tm.coach ? ` <span class="note">· coach ${esc(tm.coach)}</span>` : ''}</p><p class="note">Checked ${esc(st.last.date)}${st.changed.length ? ' · <b>roster changed</b>' : ''}${st.due ? ' · check due' : ''}</p>`; })()}
    <div class="h3">What we know</div>${x.notes.length ? x.notes.map((m) => `<div>${tag(`k-${m.kind}`, m.kind)} ${esc(m.note)} <span class="note">— ${esc(m.source)}, ${esc(m.date)}${m.by ? `, ${esc(m.by)}` : ''}</span></div>`).join('') : '<p class="note">Nothing yet.</p>'}
    <div class="h3">VODs</div>${x.vods.length ? `<ul class="plain">${x.vods.map((v) => `<li><a href="${esc(v.url)}" target="_blank" rel="noopener">${esc(v.event)}</a> ${v.tags.map((t) => tag('k-observed', t)).join(' ')} ${v.reviewed ? tag('c-Verified', 'reviewed') : tag('c-Low', 'not reviewed')}</li>`).join('')}</ul>` : '<p class="note">No VOD yet.</p>'}
    <div class="h3">Practice against their style</div><p>${x.standIns.length ? `Partners who play like them: ${x.standIns.map((p) => `<b>${esc(p.name)}</b> (${esc(p.level)})`).join(', ')}.` : 'No sparring partner in the bank plays like them yet.'} ${x.scrimsDone ? `${x.scrimsDone} stand-in scrim${x.scrimsDone > 1 ? 's' : ''} done, last ${esc(x.lastScrim)}.` : 'No stand-in scrim logged.'}${x.scrimsPlanned ? ` ${x.scrimsPlanned} planned.` : ''}</p>
    ${x.wecMatches.length ? `<div class="h3">WEC matches</div><ul class="plain">${x.wecMatches.map((m) => `<li>${esc(m.date)}${m.stage ? ` · ${esc(m.stage)}` : ''} — ${m.result ? `${esc(m.result.result)} ${esc(m.result.score)}` : 'to play'}${m.games.length ? ` · ${m.games.length} game note(s)` : ''}</li>`).join('')}</ul>` : ''}
    <div class="toolbar"><a class="btn" href="#${TITLE_TAB[x.title]}">Add a note, tier or VOD in ${esc(x.title)}</a><button class="btn" type="button" data-card="${esc(x.title)}|${esc(P.nation)}">Opponent card</button></div></div>`;
  return `${compHead('Everything the staff hold on one nation, across every title we meet them in. Use it before a match, or to share scouting work between title coaches.')}
  <div class="panel"><div class="form"><label class="field" for="cnN">Nation<select id="cnN">${all.map((x) => `<option ${x === n ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></label></div>
    <p><b>${esc(n)}</b> enters ${P.titles.length} of our titles: ${P.titles.map(esc).join(', ')}.${P.titles.length > 1 ? ' One scouting effort here can serve several title coaches.' : ''}</p></div>
  <div class="cols">${P.per.map(section).join('')}</div>`;
};

V['comp-coverage'] = () => {
  if (S.mode === 'demo') return `<div class="panel">${DEMO_BANNER}<p class="empty">Operational records only.</p></div>`;
  const C = coverage(compData());
  return `${compHead('How much of each field the staff have scouted, and who to scout next. Suggestions favour nations we meet in several titles, so one piece of work helps more coaches.')}
  <div class="panel"><div class="tw"><table><thead><tr><th>Title</th><th>Focus owner</th><th class="n">Field</th><th class="n">With notes</th><th class="n">Tier set</th><th class="n">VOD reviewed</th><th>Scout next (suggestion)</th></tr></thead><tbody>
  ${C.map((c) => `<tr><td><b>${esc(c.title)}</b></td><td>${esc(owner(c.title).name)}</td><td class="n">${c.field}</td><td class="n">${c.noted} (${c.field ? Math.round((c.noted / c.field) * 100) : 0}%)</td><td class="n">${c.tiered}</td><td class="n">${c.vodRev}</td><td>${c.next.map((x) => `<button class="linkbtn" type="button" data-nation="${esc(x)}">${esc(x)}</button>`).join(', ') || 'Field covered'}</td></tr>`).join('')}</tbody></table></div>
  <p class="note">eFootball's finals format is not published; its 96-nation list is the entry list, not the bracket.</p></div>`;
};

// ---------- V1.7: Athlete readiness — UI preview of Coach Donny's system (src/readiness) ----------
// The hub only renders; the provider supplies everything. Swap the provider in READINESS_SLOT later.
const READINESS_PROVIDERS = { mock: mockProvider };
function ensureReadiness() {
  const key = `${S.rd.title}|${S.rd.date}`; if (S.rd.key === key) return;
  S.rd.key = key; S.rd.data = null;
  const provider = READINESS_PROVIDERS[READINESS_SLOT.use] || mockProvider;
  loadReadiness(provider, { title: S.rd.title, date: S.rd.date }).then((d) => { if (S.rd.key === key) { S.rd.data = d; if (viewOf() === 'readiness') render(); } }).catch((e) => { S.rd.error = e.message; render(); });
}
V.readiness = () => { ensureReadiness(); return readinessView({ data: S.rd.data, titles: MOCK_TITLES, title: S.rd.title, date: S.rd.date }); };

// ---------- V1.6: rival rosters & player tracker, pre-match opponent card ----------
const rosterOf = (title, nation) => effective(S.rivalSeed, S.rosterEdits, rosterKey(title, nation));
async function saveRoster(team) {
  const key = rosterKey(team.title, team.nation); S.rosterEdits = { ...S.rosterEdits, [key]: team };
  if (S.db) await S.db.collection('rival_rosters').doc(sid(key)).set({ ...team, key });
}
const heroName = (id) => S.heroes[id]?.name || `#${id}`;
const titleOpts = (id, cur, list = WEC_TITLES.map((x) => x.id).filter((x) => x !== 'eFootball')) => `<select id="${id}">${list.map((x) => `<option ${x === cur ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select>`;

V['comp-rosters'] = () => {
  if (S.mode === 'demo') return `<div class="panel">${DEMO_BANNER}<p class="empty">Operational records only.</p></div>`;
  const t = S.crTitle; const field = FIELDS[t] || [];
  const nations = S.crNation === 'All' || !field.includes(S.crNation) ? field : [S.crNation];
  const today0 = today();
  const teams = field.map((n) => rosterOf(t, n)).filter(Boolean);
  const due = teams.filter((x) => checkStatus(x, today0).due).length;
  const changed = teams.filter((x) => checkStatus(x, today0).changed.length);
  const card = (n) => {
    const tm = rosterOf(t, n); const key = rosterKey(t, n); const fk = sid(key);
    if (!tm) return `<div class="obj"><h3>${esc(n)}</h3><p class="note">No roster on file.</p></div>`;
    const st = checkStatus(tm, today0);
    return `<div class="obj"><header><div><span class="note">${tm.coach ? `Coach ${esc(tm.coach)} · ` : ''}last checked ${esc(st.last.date)} (${esc(st.last.by)})</span><h3>${esc(n)}</h3></div>${st.due ? tag('c-Low', 'check due') : tag('c-Verified', 'checked')}${st.changed.length ? ` ${tag('c-Blocked', 'roster changed')}` : ''}</header>
      ${tm.note ? `<p class="note">${esc(tm.note)}</p>` : ''}
      ${st.changed.map((c) => `<p class="flag-check">${esc(c.date)} (${esc(c.by)}): ${c.added.length ? `added ${c.added.map(esc).join(', ')}` : ''}${c.added.length && c.removed.length ? '; ' : ''}${c.removed.length ? `removed ${c.removed.map(esc).join(', ')}` : ''}</p>`).join('')}
      <div class="tw"><table><thead><tr><th>Player</th><th>Role</th><th>Club</th><th>${esc(ACCOUNT_KIND[t] || 'Account')}</th>${t === 'Dota 2' ? '<th>Most played since 7.41 (club tournament games)</th>' : ''}</tr></thead><tbody>
      ${tm.players.map((p) => { const pool = t === 'Dota 2' ? dotaPool(n, p.ign, DATA) : null;
        return `<tr><td><b>${esc(p.ign)}</b>${p.captain ? ' <span class="note">(C)</span>' : ''}${p.flags.map((f) => `<div class="note">⚠ ${esc(f)}</div>`).join('')}${p.note ? `<div class="note">${esc(p.note)}</div>` : ''}</td><td>${esc(p.role || '—')}</td><td>${esc(p.club || '—')}</td>
        <td>${p.account ? (t === 'Dota 2' && /^\d+$/.test(p.account) ? `<a href="https://www.opendota.com/players/${esc(p.account)}" target="_blank" rel="noopener">${esc(p.account)}</a>` : esc(p.account)) : '<span class="note">not found yet</span>'}${p.accountNote ? `<div class="note">${esc(p.accountNote)}</div>` : ''}</td>
        ${t === 'Dota 2' ? `<td>${pool ? (pool.n ? `${pool.heroes.slice(0, 4).map((h) => `${esc(heroName(h.hero))} <span class="note">${h.games}g ${h.wins}w</span>`).join(', ')}<div class="note">${pool.n} games, ${Math.round((pool.w / pool.n) * 100)}% won</div>` : '<span class="note">no tournament game since 7.41</span>') : '<span class="note">no data</span>'}</td>` : ''}</tr>`; }).join('')}</tbody></table></div>
      <details><summary class="btn small">Edit players</summary>${tm.players.map((p, i) => `<div class="form"><label class="field" for="rr-${fk}-${i}-role">${esc(p.ign)} role<input type="text" id="rr-${fk}-${i}-role" value="${esc(p.role)}" placeholder="${esc(ROLE_HINT[t] || '')}"></label><label class="field" for="rr-${fk}-${i}-club">Club<input type="text" id="rr-${fk}-${i}-club" value="${esc(p.club)}"></label><label class="field" for="rr-${fk}-${i}-account">${esc(ACCOUNT_KIND[t] || 'Account')}<input type="text" id="rr-${fk}-${i}-account" value="${esc(p.account)}"></label><label class="field" for="rr-${fk}-${i}-note">Note<input type="text" id="rr-${fk}-${i}-note" value="${esc(p.note)}"></label></div>`).join('')}
        <div class="toolbar"><button class="btn primary" type="button" data-roster-save="${esc(key)}">Save players</button><span class="msg" id="rrMsg-${fk}"></span></div></details>
      <details><summary class="btn small">Record weekly check</summary><p class="note">Open <a href="https://wec.iesf.org/editions/wec-2026/teams/${esc(tm.code || '')}" target="_blank" rel="noopener">the ${esc(n)} page on wec.iesf.org</a> and enter the ${esc(t)} names as listed today, one per line.</p>
        <label class="field" for="rc-${fk}-names">Names on the site today<textarea id="rc-${fk}-names" rows="5">${esc(tm.players.map((p) => p.ign).join('\n'))}</textarea></label>
        <div class="toolbar"><button class="btn primary" type="button" data-roster-check="${esc(key)}">Save check</button><span class="msg" id="rcMsg-${fk}"></span></div></details></div>`;
  };
  return `${compHead('Every rival player, from the official WEC team pages, with role, club and game account added by the staff. Re-check each roster weekly; changes are flagged here and on the nation profile.')}
  <div class="panel"><div class="form"><label class="field" for="crT">Title${titleOpts('crT', t)}</label><label class="field" for="crN">Nation<select id="crN"><option>All</option>${field.map((n) => `<option ${n === S.crNation ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></label></div>
    <p class="note">Source: ${esc(DATA.rivalRosters.source)}, read ${esc(DATA.rivalRosters.read)} (${esc(DATA.rivalRosters.method)}) Names marked ⚠ need checking on the site.${t === 'Dota 2' ? ` Dota accounts and pools: ${esc(DATA.rivalPools._source)}` : ''}</p>
    <div class="stats"><div class="stat"><span class="k">Teams</span><span class="v">${teams.length}</span></div><div class="stat"><span class="k">Checks due (${CHECK_EVERY_DAYS}+ days)</span><span class="v">${due}</span></div><div class="stat"><span class="k">Rosters changed</span><span class="v">${changed.length}</span></div>${t === 'Dota 2' ? `<div class="stat"><span class="k">Players with an account</span><span class="v">${teams.reduce((a, x) => a + x.players.filter((p) => p.account).length, 0)}/${teams.reduce((a, x) => a + x.players.length, 0)}</span></div>` : ''}</div></div>
  <div class="panel">${nations.map(card).join('')}</div>`;
};

function oppCardHtml(a, plan, ours) {
  return `<article class="oppcard"><header><div><span class="note">${esc(a.title)} · opponent card · internal</span><h2>Indonesia vs ${esc(a.nation)}</h2></div>${plan ? tag(plan.status === 'approved' ? 'c-Verified' : 'c-Low', plan.status === 'approved' ? `approved · ${plan.approvedBy}` : `draft · ${plan.by}`) : tag('c-Low', 'no plan yet')}</header>
    ${plan ? `<div class="h3">Three things to know</div><ol>${plan.keys.map((k) => `<li>${esc(k)}</li>`).join('')}</ol>
      ${plan.theirPlan ? `<div class="h3">What they are likely to do</div><p>${esc(plan.theirPlan)}</p>` : ''}
      <div class="h3">Our answer</div><p><b>${esc(plan.ourAnswer)}</b></p>
      ${Object.keys(plan.focus).length ? `<div class="h3">One focus per player</div><ul class="plain">${Object.entries(plan.focus).map(([k, v]) => `<li><b>${esc(k)}</b>: ${esc(v)}</li>`).join('')}</ul>` : ''}` : `<p class="empty">The title coach writes three key points and our answer (form on this page).</p>`}
    <div class="h3">Their roster${a.coach ? ` · coach ${esc(a.coach)}` : ''}</div>
    <div class="tw"><table><thead><tr><th>Player</th><th>Role / club</th>${a.title === 'Dota 2' ? '<th>Most played (club games since 7.41)</th>' : ''}</tr></thead><tbody>${a.roster.map((p) => `<tr><td><b>${esc(p.ign)}</b>${p.captain ? ' (C)' : ''}${p.flags.length ? ' <span class="note">⚠</span>' : ''}</td><td>${esc([p.role, p.club].filter(Boolean).join(' · ') || '—')}${p.pool?.lane ? `<div class="note">${esc(p.pool.lane)}</div>` : ''}</td>${a.title === 'Dota 2' ? `<td>${p.pool?.n ? `${p.pool.top.map((h) => `${esc(h.name)} <span class="note">${h.games}</span>`).join(', ')}<div class="note">${p.pool.n} games${p.pool.probable ? ' · account probable' : ''}</div>` : '<span class="note">no data</span>'}</td>` : ''}</tr>`).join('')}</tbody></table></div>
    ${a.banCandidates.length ? `<div class="h3">Most-played heroes — ban candidates</div><ul class="plain">${a.banCandidates.map((b) => `<li><b>${esc(b.hero)}</b> — ${esc(b.player)}, ${b.games} of ${b.of} games${b.probable ? ' <span class="note">(account probable)</span>' : ''}</li>`).join('')}</ul><p class="note">Presence in club games, not proof they will draft it for the national team.</p>` : ''}
    <div class="h3">What we know · staff tier: ${esc(a.tier)}</div>${a.tierWhy ? `<p class="note">${esc(a.tierBy)}: ${esc(a.tierWhy)}</p>` : ''}
    ${a.observed.length || a.hypotheses.length || a.vods.length ? `<ul class="plain">${a.observed.map((n) => `<li>${tag('k-observed', 'observed')} ${esc(n.note)} <span class="note">— ${esc(n.source)}, ${esc(n.date)}</span></li>`).join('')}${a.hypotheses.map((n) => `<li>${tag('k-hypothesis', 'unconfirmed')} ${esc(n.note)} <span class="note">— ${esc(n.source)}</span></li>`).join('')}${a.vods.map((v) => `<li>${tag('k-observed', 'VOD')} <a href="${esc(v.url)}" target="_blank" rel="noopener">${esc(v.event)}</a>: ${esc(v.takeaway)}</li>`).join('')}</ul>` : '<p class="note">No notes or reviewed VODs yet.</p>'}
    ${a.standIns.length || a.scrimsDone ? `<p class="note">Practised against their style: ${a.scrimsDone} stand-in scrim(s)${a.standIns.length ? ` with ${a.standIns.map(esc).join(', ')}` : ''}.</p>` : ''}
    ${capUi().standInLine(a.title, a.nation)}
    ${a.gaps.length ? `<div class="noprint">${banner('block', `<div><b>Gaps before this card is match-ready:</b> ${a.gaps.map(esc).join(' ')}</div>`)}</div>` : ''}
    <p class="note">Our players: ${ours.length ? ours.map(esc).join(', ') : 'roster not entered'}.</p></article>`;
}
V['comp-card'] = () => {
  if (S.mode === 'demo') return `<div class="panel">${DEMO_BANNER}<p class="empty">Operational records only.</p></div>`;
  const t = S.ocTitle; const field = FIELDS[t] || []; const n = field.includes(S.ocNation) ? S.ocNation : field[0];
  const per = nationProfile(n, compData()).per.find((x) => x.title === t);
  const a = autoCard({ title: t, nation: n, per, team: rosterOf(t, n), data: DATA, heroes: S.heroes });
  const plan = S.oppCards[rosterKey(t, n)] || null; const ours = S.roster[t] || [];
  return `<div class="noprint">${compHead('One page per opponent for the opponent brief two hours before a match. The hub fills in what the staff already hold; the title coach writes three key points and our answer, and the focus owner approves it.')}
    <div class="panel"><div class="form"><label class="field" for="ocT">Title${titleOpts('ocT', t, WEC_TITLES.map((x) => x.id))}</label><label class="field" for="ocN">Opponent<select id="ocN">${field.map((x) => `<option ${x === n ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></label></div>
      <div class="toolbar"><button class="btn" type="button" id="ocPrint">Print</button><button class="btn" type="button" id="ocDl">Download .md</button><span class="msg" id="ocMsg"></span></div></div></div>
  <div class="cols"><div class="panel">${oppCardHtml(a, plan, ours)}</div>
  <div class="panel noprint"><h2>${plan ? 'Edit the plan' : 'Write the plan'}</h2>
    ${[0, 1, 2].map((i) => `<label class="field" for="ocK${i}">Key point ${i + 1}${i ? ' (optional)' : ''}<input type="text" id="ocK${i}" value="${esc(plan?.keys[i] || '')}"></label>`).join('')}
    <label class="field" for="ocTh">What they are likely to do<input type="text" id="ocTh" value="${esc(plan?.theirPlan || '')}" placeholder="${t === 'Dota 2' || t.startsWith('MLBB') ? 'first-phase bans, comfort picks, side' : t === 'PUBG Mobile' ? 'drops per map, rotation style' : t.startsWith('CS2') ? 'map picks and bans, default setups' : 'formation, tempo'}"></label>
    <label class="field" for="ocA">Our answer (required)<input type="text" id="ocA" value="${esc(plan?.ourAnswer || '')}"></label>
    ${ours.length ? `<fieldset class="objpick"><legend class="note">One focus per player (optional)</legend>${ours.map((p, i) => `<label class="field" for="ocF${i}">${esc(p)}<input type="text" id="ocF${i}" data-player="${esc(p)}" value="${esc(plan?.focus[p] || '')}"></label>`).join('')}</fieldset>` : ''}
    <label class="field" for="ocBy">Written by<input type="text" id="ocBy" value="${esc(meName())}"></label>
    <div class="toolbar"><button class="btn primary" type="button" id="ocSave">Save draft</button><span class="msg" id="ocSaveMsg"></span></div>
    ${plan && plan.status !== 'approved' ? `<div class="form"><label class="field" for="ocAp">Approve as (${esc(owner(t).name)} or the title coach)<input type="text" id="ocAp" value="${esc(meName())}"></label></div><div class="toolbar"><button class="btn" type="button" id="ocApprove">Approve card</button><span class="msg" id="ocApMsg"></span></div>` : ''}
    <p class="note">Editing an approved card returns it to draft.</p></div></div>`;
};

// ---------- render & events ----------
let KEEP_FORMS = true; let LAST_VIEW = null;
function captureForms() {
  const m = $('#main'); if (!m) return null;
  const vals = {};
  for (const el of m.querySelectorAll('input[id],select[id],textarea[id]')) { if (el.type === 'file') continue; vals[el.id] = el.type === 'checkbox' || el.type === 'radio' ? { c: el.checked } : { v: el.value }; }
  const a = document.activeElement;
  const focus = a && a.id && m.contains(a) ? { id: a.id, s: typeof a.selectionStart === 'number' ? a.selectionStart : null, e: typeof a.selectionEnd === 'number' ? a.selectionEnd : null } : null;
  return { vals, open: [...m.querySelectorAll('details')].map((d) => d.open), focus };
}
function restoreForms(st) {
  const m = $('#main');
  for (const [id, x] of Object.entries(st.vals)) {
    const el = document.getElementById(id); if (!el || !m.contains(el)) continue;
    if ('c' in x) el.checked = x.c;
    else if (el.value !== x.v && !(el.tagName === 'SELECT' && ![...el.options].some((o) => o.value === x.v))) el.value = x.v;
  }
  for (const b of m.querySelectorAll('[data-rp-prog]')) { const h = document.getElementById(`rp-${b.dataset.rpProg}-progress`); if (h) b.setAttribute('aria-pressed', String(h.value === b.dataset.v)); }
  const ds = m.querySelectorAll('details'); if (ds.length === st.open.length) ds.forEach((d, i) => { d.open = st.open[i]; });
  if (st.focus) { const el = document.getElementById(st.focus.id); if (el) { el.focus({ preventScroll: true }); try { if (st.focus.s != null) el.setSelectionRange(st.focus.s, st.focus.e); } catch { /* not a text field */ } } }
}
function render() {
  const view = viewOf(); const kept = KEEP_FORMS && view === LAST_VIEW ? captureForms() : null;
  renderNav(view); LAST = { recs: {} };
  document.documentElement.classList.toggle('demo', S.mode === 'demo');
  try { $('#main').innerHTML = V[view](); } catch (e) { $('#main').innerHTML = `<div class="panel">${banner('block', `<div>Something failed while building this view: ${esc(e.message)}</div>`)}</div>`; console.error(e); }
  document.documentElement.lang = S.lang;
  if (S.lang === 'id') {
    translateDom(document.querySelector('header.top'), 'id'); translateDom($('#main'), 'id');
    if (ORIGINAL_LANG_VIEWS.test(view)) $('#main').insertAdjacentHTML('afterbegin', '<p class="note lang-note">Catatan: temuan analisis otomatis, catatan staf, nama dan sumber data ditampilkan dalam bahasa aslinya (Inggris).</p>');
  }
  if (HUB_USER && !HUB_USER.seesAllTitles) {
    const vt = viewTitle(view);
    if (vt && !HUB_USER.titles.includes(vt)) $('#main').insertAdjacentHTML('afterbegin', `<div class="panel">${banner('synth', `<div><b>You are not assigned to ${esc(vt)}.</b> Its records are hidden and you cannot save here. Ask the admin if you need access.</div>`)}</div>`);
  }
  if (kept) restoreForms(kept);
  LAST_VIEW = view;
}
// Views that show engine findings or data notes, which stay in English.
const ORIGINAL_LANG_VIEWS = /^(dota-team|dota-post|dota-scout|dota-draft|dota-review|pubgm-(team|log|rivals|sim|review)|comp-nation|comp-card|comp-rosters|staff-sources|staff-rules)/;
const setMsg = (id, text, cls = '') => { const el = document.getElementById(id); if (el) { el.textContent = S.lang === 'id' ? (trId(text) ?? text) : text; el.className = `msg ${cls}`; } };
const val = (id) => document.getElementById(id)?.value ?? '';
async function doImport(text, label) {
  const r = importMatch(text, { ourAccounts: accounts(), known: Object.keys(S.matches).map(Number) });
  S.importReport = r;
  if (r.ok) {
    const rec = { m: r.match, origin: 'operational', retrieved: today(), source: label };
    S.matches[r.match.id] = rec; S.selMatch = r.match.id;
    if (S.db) { try { await S.db.collection('dota_matches').doc(String(r.match.id)).set({ ...rec, at: new Date().toISOString() }); } catch (e) { r.warnings.push(`Saved in this tab only: the shared store refused the write (${e.code || e.message}).`); } }
  }
  render();
}
async function cycleAct(act, id) {
  const o = S.cycle.find((x) => x.id === id); if (!o) return;
  try {
    let n;
    if (act === 'review') n = review(o, { decision: val(`rv-d-${id}`), reviewer: val(`rv-n-${id}`), reason: val(`rv-r-${id}`), drill: val(`rv-dr-${id}`), success: val(`rv-s-${id}`) });
    if (act === 'session') n = logSession(o, { owner: val(`ss-o-${id}`), date: val(`ss-d-${id}`), execution: val(`ss-e-${id}`), result: val(`ss-r-${id}`), measure: val(`ss-m-${id}`), context: { opponent: val(`ss-op-${id}`), patch: val(`ss-p-${id}`) }, notes: val(`ss-n-${id}`) });
    if (act === 'decide') n = decide(o, { decision: val(`dc-d-${id}`), by: val(`dc-b-${id}`), reason: val(`dc-r-${id}`) });
    await saveObj(n); render();
  } catch (e) { setMsg(`msg-${id}`, e.message, 'err'); }
}
async function onClick(e) {
  const t = e.target.closest('button, [data-go]'); if (!t) return;
  if (t.dataset.go) { location.hash = t.dataset.go; return; }
  // V1.13 capture / patterns buttons only, so every other click stays synchronous until its own first await.
  if (Object.keys(t.dataset).some((k) => /^(cap|pat)[A-Z]/.test(k)) && await capUi().onClick(t)) return;
  const id = t.id;
  if (id === 'langBtn') { S.lang = S.lang === 'id' ? 'en' : 'id'; try { localStorage.setItem('hub-lang', S.lang); } catch { /* per-viewer convenience only */ } render(); return; }
  if (id === 'modeBtn' || id === 'modeBtn2') { S.mode = S.mode === 'demo' ? 'live' : 'demo'; S.pubgm.team = null; S.pubgm.sim = null; render(); return; }
  if (t.dataset.hero && viewOf() === 'dota-draft') { S.draft.steps.push(+t.dataset.hero); render(); return; }
  if (t.dataset.propose != null) {
    const rec = LAST.recs[t.dataset.title]?.[+t.dataset.propose]; if (!rec) return;
    const ids = t.dataset.title === 'PUBG Mobile' ? ['pubgm-scoring'] : ['dota-patch', 'dota-draft-order'];
    try { await saveObj(propose(rec, { title: t.dataset.title, by: 'Hub (engine proposal)', rulesSnapshot: snapshot(S.rules, ids) })); render(); } catch (err) { t.insertAdjacentHTML('afterend', `<span class="msg err">${esc(err.message)}</span>`); }
    return;
  }
  if (t.dataset.act) { await cycleAct(t.dataset.act, t.dataset.id); return; }
  if (t.dataset.card) { const [ti, na] = t.dataset.card.split('|'); S.ocTitle = ti; S.ocNation = na; location.hash = 'comp-card'; if (viewOf() === 'comp-card') render(); return; }
  if (t.dataset.rosterSave || t.dataset.rosterCheck) {
    const key = t.dataset.rosterSave || t.dataset.rosterCheck; const [ti, na] = key.split('|'); const fk = sid(key); const tm = rosterOf(ti, na); if (!tm) return;
    try {
      let n;
      if (t.dataset.rosterSave) { const up = {}; tm.players.forEach((p, i) => { up[p.ign] = Object.fromEntries(['role', 'club', 'account', 'note'].map((k) => [k, val(`rr-${fk}-${i}-${k}`)])); }); n = editPlayers(tm, up, meName() || S.me); }
      else n = recordCheck(tm, { date: today(), by: meName() || S.me, names: val(`rc-${fk}-names`) });
      await saveRoster(n); render();
    } catch (err) { setMsg(`${t.dataset.rosterSave ? 'rrMsg' : 'rcMsg'}-${fk}`, err.message, 'err'); }
    return;
  }
  if (id === 'ocSave' || id === 'ocApprove' || id === 'ocDl' || id === 'ocPrint') {
    const ti = S.ocTitle, field = FIELDS[ti] || [], na = field.includes(S.ocNation) ? S.ocNation : field[0]; const key = rosterKey(ti, na);
    try {
      if (id === 'ocPrint') { window.print(); return; }
      if (id === 'ocDl') {
        const per = nationProfile(na, compData()).per.find((x) => x.title === ti);
        const md = cardMarkdown(autoCard({ title: ti, nation: na, per, team: rosterOf(ti, na), data: DATA, heroes: S.heroes }), S.oppCards[key] || null);
        const dl = await window.claude?.use?.('downloads'); if (!dl) throw new Error('Downloads are not available in this view; use Print.');
        await dl.save({ filename: `opponent-card-${sid(ti)}-${sid(na)}.md`, data: md }); setMsg('ocMsg', 'Saved.', 'ok'); return;
      }
      const plan = id === 'ocSave'
        ? cardPlan({ keys: [0, 1, 2].map((i) => val(`ocK${i}`)), theirPlan: val('ocTh'), ourAnswer: val('ocA'), by: val('ocBy'), focus: Object.fromEntries([...document.querySelectorAll('input[id^="ocF"]')].map((x) => [x.dataset.player, x.value])) })
        : approveCard(S.oppCards[key], { by: val('ocAp') });
      const doc = { ...plan, key, title: ti, nation: na };
      S.oppCards = { ...S.oppCards, [key]: doc }; if (S.db) await S.db.collection('opp_cards').doc(sid(key)).set(doc);
      render();
    } catch (err) { setMsg(id === 'ocSave' ? 'ocSaveMsg' : id === 'ocApprove' ? 'ocApMsg' : 'ocMsg', err.code === 'declined' ? 'Download cancelled.' : err.message, 'err'); }
    return;
  }
  if (t.dataset.nation) { S.compNation = t.dataset.nation; location.hash = 'comp-nation'; if (viewOf() === 'comp-nation') render(); return; }
  if (id === 'compEf') { S.compAllEf = !S.compAllEf; render(); return; }
  // ---- V1.4 handlers ----
  if (id === 'rbAdd' || id === 'rbReset' || t.dataset.rbDel) {
    const ti = S.tourTitle;
    try {
      let rb = runbookFor(ti).map((x) => ({ ...x }));
      if (id === 'rbReset') rb = defaultRunbook(ti);
      else if (t.dataset.rbDel) rb = rb.filter((x) => x.id !== t.dataset.rbDel);
      else {
        const mins = +val('rbT'); const item = val('rbI').trim(); const ow = val('rbO').trim();
        if (!item || !ow || isNaN(mins) || mins < 0) throw new Error('Minutes, item and owner are required.');
        rb.push({ id: `R${Date.now().toString(36)}`, t: -mins, item, owner: ow }); rb.sort((a, b) => a.t - b.t);
      }
      S.runbooks = { ...S.runbooks, [ti]: rb }; await saveRunbooks(); render();
    } catch (err) { setMsg('rbMsg', err.message, 'err'); }
    return;
  }
  if (id === 'wmAdd') {
    try { await saveMatch(wecMatch({ title: S.tourTitle, date: val('wmD'), time: val('wmTm').trim(), stage: val('wmSt').trim(), opponent: val('wmO'), format: val('wmF') })); render(); }
    catch (err) { setMsg('wmAddMsg', err.message, 'err'); }
    return;
  }
  if (t.dataset.tick) {
    const [mid, iid] = t.dataset.tick.split('|'); const m = S.wecMatches.find((x) => x.id === mid); if (!m) return;
    try { await saveMatch(tick(m, iid, meName() || S.me)); render(); } catch (err) { setMsg(`wmMsg-${mid}`, err.message, 'err'); }
    return;
  }
  if (t.dataset.wmResult) {
    const m = S.wecMatches.find((x) => x.id === t.dataset.wmResult); if (!m) return;
    try { await saveMatch(setResult(m, { result: val(`wrR-${m.id}`), score: val(`wrS-${m.id}`), by: meName() || S.me })); render(); } catch (err) { setMsg(`wmMsg-${m.id}`, err.message, 'err'); }
    return;
  }
  if (t.dataset.series) { S.tourMatch = t.dataset.series; location.hash = 'tour-series'; return; }
  if (id === 'gnSave') {
    const all = [...S.wecMatches].sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`));
    const m = all.find((x) => x.id === S.tourMatch) || all.find((x) => !x.result) || all[0]; if (!m) return;
    try {
      const calls = Object.fromEntries([...document.querySelectorAll('input[id^="gnC-"]')].map((x) => [x.dataset.player, x.value]));
      await saveMatch(gameNote(m, { side: val('gnSide'), outcome: val('gnOut'), worked: val('gnW'), failed: val('gnF'), adjust: val('gnA'), calls, by: val('gnBy') }));
      S.tourMatch = m.id; render();
    } catch (err) { setMsg('gnMsg', err.message, 'err'); }
    return;
  }
  if (t.dataset.applied) {
    const [mid, g, yes] = t.dataset.applied.split('|'); const m = S.wecMatches.find((x) => x.id === mid); if (!m) return;
    await saveMatch(markApplied(m, +g, yes === '1')); render(); return;
  }
  if (t.dataset.vodAdd) {
    const title = t.dataset.vodAdd, fid = sid(title);
    try {
      if (S.mode === 'demo') throw new Error('Not available in the demo sandbox.');
      const v = vod({ title, nation: val(`vdN-${fid}`), url: val(`vdU-${fid}`), event: val(`vdE-${fid}`), date: val(`vdD-${fid}`), game: val(`vdG-${fid}`), players: val(`vdP-${fid}`), notes: val(`vdX-${fid}`), by: val(`vdB-${fid}`), tags: [...document.querySelectorAll(`input[name="vdTag-${fid}"]:checked`)].map((x) => x.value) });
      v.id = `V${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
      if (S.db) await S.db.collection('vods').doc(v.id).set(v); else S.vods.push(v);
      render();
    } catch (err) { setMsg(`vdMsg-${fid}`, err.message, 'err'); }
    return;
  }
  if (t.dataset.vodReview || t.dataset.vodNote) {
    const vid = t.dataset.vodReview || t.dataset.vodNote; const v = S.vods.find((x) => x.id === vid); if (!v) return;
    try {
      if (t.dataset.vodReview) {
        const r = reviewVod(v, { by: meName() || S.me, note: val(`vrN-${vid}`) });
        if (S.db) await S.db.collection('vods').doc(vid).set(r); else Object.assign(v, r);
      } else {
        const n = rivalNote({ title: v.title, nation: v.nation, note: v.reviewNote || v.notes || `VOD reviewed: ${v.event}`, source: v.url, kind: 'observed', by: meName() || S.me });
        if (S.db) await S.db.collection('rivals').add(n); else S.rivals.push(n);
      }
      render();
    } catch (err) { setMsg(`vrMsg-${vid}`, err.message, 'err'); }
    return;
  }
  if (t.dataset.partnerAdd) {
    const title = t.dataset.partnerAdd, fid = sid(title);
    try {
      if (/\d{6,}/.test(`${val(`ptA-${fid}`)} ${val(`ptW-${fid}`)} ${val(`ptC-${fid}`)}`)) throw new Error('Looks like a phone number: record who holds the contact instead.');
      const p = partnerRec({ title, name: val(`ptN-${fid}`), level: val(`ptL-${fid}`), region: val(`ptR-${fid}`), resembles: val(`ptM-${fid}`), why: val(`ptW-${fid}`), availability: val(`ptA-${fid}`), contactOwner: val(`ptC-${fid}`) });
      p.id = sid(`${title}_${p.name}`);
      if (S.db) await S.db.collection('partners').doc(p.id).set(p); else S.partners = [...S.partners.filter((x) => x.id !== p.id), p];
      render();
    } catch (err) { setMsg(`ptMsg-${fid}`, err.message, 'err'); }
    return;
  }
  if (id === 'gaAdd' || t.dataset.goalUpd) {
    const ti = S.planTitle, roster = S.roster[ti] || []; const p = roster.includes(S.planPlayer) ? S.planPlayer : roster[0]; if (!p) return;
    const key = planKey(ti, p); const pl = JSON.parse(JSON.stringify(S.plans[key] || newPlan(ti, p)));
    try {
      if (id === 'gaAdd') { const gr = goalRec({ area: val('gaA'), goal: val('gaG'), measure: val('gaM'), due: val('gaD'), owner: val('gaO') }); if (val('gaSK')) gr.stat = statGoal({ key: val('gaSK'), op: val('gaSO'), target: val('gaST') }, gameOf(ti)); pl.goals.push(gr); }
      else { const gid = t.dataset.goalUpd; pl.goals = pl.goals.map((g) => (g.id === gid ? updateGoal(g, { status: val(`guS-${gid}`), note: val(`guN-${gid}`), by: meName() || S.me }) : g)); }
      S.plans = { ...S.plans, [key]: pl };
      if (S.db) await S.db.collection('player_plans').doc(key).set(pl);
      render();
    } catch (err) { setMsg(id === 'gaAdd' ? 'gaMsg' : `guMsg-${t.dataset.goalUpd}`, err.message, 'err'); }
    return;
  }
  if (id === 'brCopy') { try { await navigator.clipboard.writeText(briefText()); setMsg('brMsg', 'Copied.', 'ok'); } catch { setMsg('brMsg', 'Copy is blocked here; use Download.', 'err'); } return; }
  if (id === 'brDl') {
    try {
      const dl = await window.claude?.use?.('downloads');
      if (!dl) throw new Error('Downloads are not available in this view; use Copy text.');
      await dl.save({ filename: `timnas-brief-${S.briefDate}.md`, data: briefText() }); setMsg('brMsg', 'Saved.', 'ok');
    } catch (err) { setMsg('brMsg', err.code === 'declined' ? 'Download cancelled.' : err.message, err.code === 'declined' ? '' : 'err'); }
    return;
  }
  if (id === 'dLock') { const h = heroByName()[val('dHero').trim().toLowerCase()]; if (!h) return setMsg('dMsg', 'Pick a hero name from the list.', 'err'); if (S.draft.steps.includes(h)) return setMsg('dMsg', 'Already picked or banned.', 'err'); S.draft.steps.push(h); render(); }
  if (id === 'dUndo') { S.draft.steps.pop(); render(); }
  if (id === 'dReset') { S.draft.steps = []; render(); }
  if (id === 'dSaveA' || id === 'dSaveB') { const st = draftState(); if (!st.ours.length) return setMsg('dMsg', 'Pick at least one hero first.', 'err'); S.draft.saved[id === 'dSaveA' ? 'A' : 'B'] = st; render(); }
  if (id === 'mParse') await doImport(val('mPaste'), 'OpenDota JSON (pasted)');
  if (id === 'mFetch') {
    const mid = val('mId').trim(); if (!/^\d{6,12}$/.test(mid)) return setMsg('mMsg', 'Enter a numeric match ID.', 'err');
    setMsg('mMsg', 'Opening OpenDota in your browser pane…');
    try { await doImport(await browserFetchText(`https://api.opendota.com/api/matches/${mid}`), 'OpenDota (fetched in desktop app)'); } catch (err) { setMsg('mMsg', err.message, 'err'); }
  }
  if (id === 'refreshPools') {
    setMsg('poolMsg', 'Fetching each player through your browser pane…');
    try {
      const proj = ['hero_id', 'start_time', 'duration', 'player_slot', 'radiant_win', 'kills', 'deaths', 'assists', 'lane_role'].map((p) => `project=${p}`).join('&');
      for (const p of Object.values(S.players)) {
        const games = fromOpenDotaPlayerMatches(JSON.parse(await browserFetchText(`https://api.opendota.com/api/players/${p.account}/matches?lobby_type=1&date=230&${proj}`))).filter((g) => g.start >= 1774313459);
        if (games.length) { p.games = games; S.freshPools[p.ign] = new Date().toISOString(); if (S.db) await S.db.collection('dota_pools').doc(p.ign).set({ games, at: S.freshPools[p.ign] }); }
      }
      S.asOf = Math.floor(Date.now() / 1000); render();
    } catch (err) { setMsg('poolMsg', err.message, 'err'); }
  }
  if (t.dataset.copy) { const txt = t.dataset.copy === 'match' ? MATCH_TEMPLATE : FIGHT_TEMPLATE; try { await navigator.clipboard.writeText(txt); t.textContent = 'Copied'; } catch { const ta = t.dataset.copy === 'match' ? $('#lMatches') : $('#lFights'); ta.value = txt; ta.select(); } }
  if (id === 'lSave') {
    const { rows, fights, errs } = checkPubgmImport(val('lMatches').trim(), val('lFights').trim());
    const box = document.getElementById('lMsg');
    if (errs.length) { box.className = 'msg err'; box.innerHTML = `<b>${errs.length} problem(s), nothing saved:</b><ul class="plain">${errs.slice(0, 8).map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`; return; }
    const mr = tagOrigin(rows, 'operational'), fr = tagOrigin(fights, 'operational');
    if (S.db) {
      try { if (mr.length) await S.db.collection('pubgm_logs').add({ kind: 'matches', origin: 'operational', rows: mr, at: new Date().toISOString() }); if (fr.length) await S.db.collection('pubgm_logs').add({ kind: 'fights', origin: 'operational', rows: fr, at: new Date().toISOString() }); }
      catch (err) { box.className = 'msg err'; box.textContent = `Could not save to the shared log (${err.code || err.message}). Check that you have edit access.`; return; }
    } else { S.pubgm.logged.matches.push(...mr); S.pubgm.logged.fights.push(...fr); }
    render(); const b2 = document.getElementById('lMsg'); if (b2) { b2.className = 'msg ok'; b2.textContent = `Saved ${mr.length} match rows and ${fr.length} fight rows as operational data.`; }
  }
  if (id === 'sRun') {
    const c = S.pubgm.sim; c.matches = Math.max(1, Math.min(24, +val('sN') || 6)); c.ourPts = +val('sOur') || 0; c.rival = val('sRival'); c.rivalPts = +val('sRivalPts') || 0;
    for (const k of Object.keys(c.assumptions)) for (const f of ['elimMult', 'earlyExitAdd', 'placeShift']) { const v = val(`as-${k}-${f}`); if (v !== '' && !isNaN(+v)) c.assumptions[k][f] = +v; }
    render();
  }
  if (id === 'ruSave') {
    try {
      const rid = val('ruId'); const patch = { status: val('ruSt') };
      if (val('ruVer').trim()) patch.version = val('ruVer').trim();
      if (rid === 'pubgm-scoring') {
        const tbl = val('ruTable').split(',').map((x) => +x.trim());
        if (tbl.length !== 16 || tbl.some((x) => isNaN(x) || x < 0)) throw new Error('Placement table needs 16 non-negative numbers.');
        const pe = +val('ruElim'); if (isNaN(pe) || pe < 0) throw new Error('Points per elimination must be a number.');
        const cur = rule(rid);
        if (tbl.join() !== cur.table.join() || pe !== cur.perElim) { patch.table = tbl; patch.perElim = pe; if (!patch.version) patch.version = `custom ${tbl.slice(0, 3).join('-')}… +${pe}/elim (${today()})`; }
      }
      if (!patch.version && patch.status === rule(rid).status) throw new Error('Nothing changed: set a new version or status.');
      const { rules, affected } = updateRule(S.rules, rid, patch, { by: val('ruBy').trim(), reason: val('ruWhy').trim() });
      S.rules = rules; await saveRules();
      const objs = S.cycle.filter((o) => changedSince(o.rules, S.rules).length).length;
      S.lastFlag = { label: rule(rid).label, affected, objs }; render();
    } catch (err) { setMsg('ruMsg', err.message, 'err'); }
  }
  if (t.dataset.rivalNote || t.dataset.rivalTier) {
    const title = t.dataset.rivalNote || t.dataset.rivalTier; const fid = sid(title);
    try {
      if (S.mode === 'demo') throw new Error('Not available in the demo sandbox.');
      const nation = val(`rvN-${fid}`);
      if (t.dataset.rivalNote) {
        const n = rivalNote({ title, nation, note: val(`rvT-${fid}`), source: val(`rvS-${fid}`), kind: val(`rvK-${fid}`), by: val(`rvB-${fid}`) });
        if (S.db) await S.db.collection('rivals').add(n); else S.rivals.push(n);
      } else {
        const tier = val(`tiT-${fid}`), why = val(`tiW-${fid}`).trim(), by = val(`rvB-${fid}`).trim();
        if (!why || !by) throw new Error('A tier needs a reason and a name.');
        const x = { title, nation, tier, why, by, at: new Date().toISOString(), origin: 'operational' };
        if (S.db) await S.db.collection('rival_tiers').doc(sid(`${title}|${nation}`)).set(x); else S.tiers[`${title}|${nation}`] = x;
      }
      render();
    } catch (err) { setMsg(`rvMsg-${fid}`, err.message, 'err'); }
    return;
  }
  if (id === 'signOutBtn') { await PLATFORM?.signOut(); return; }
  if (id === 'adReload') { S.admin = { users: null, loading: false, error: '' }; render(); return; }
  if (id === 'adExport') {
    try { setMsg('adExportMsg', 'Exporting…'); const json = await PLATFORM.admin.exportAll(); await PLATFORM.download({ filename: `timnas-hub-export-${localDay()}.json`, data: json }); setMsg('adExportMsg', 'Saved. It may contain wellbeing data: store it securely.', 'ok'); }
    catch (err) { setMsg('adExportMsg', err.message, 'err'); }
    return;
  }
  if (t.dataset.adminSave) {
    const uid = t.dataset.adminSave; const u = (S.admin?.users || []).find((x) => x.id === uid); if (!u) return;
    const want = { display_name: val(`ad-${uid}-name`).trim(), staff_key: val(`ad-${uid}-staff`) || null,
      roles: ROLES.map(([k]) => k).filter((k) => document.getElementById(`ad-${uid}-role-${k}`)?.checked),
      titles: WEC_TITLES.map((x) => x.id).filter((x) => document.getElementById(`ad-${uid}-title-${sid(x)}`)?.checked) };
    try { await PLATFORM.admin.saveUser(uid, want, u); Object.assign(u, want); setMsg(`adMsg-${uid}`, 'Saved. The person sees the change after reloading the page.', 'ok'); }
    catch (err) { setMsg(`adMsg-${uid}`, err.message, 'err'); }
    return;
  }
  if (t.dataset.rpFill) { try { const { fid, v } = JSON.parse(t.dataset.rpFill); fillReport(fid, v); } catch { /* malformed chip */ } return; }
  if (t.dataset.rpProg) { fillReport(t.dataset.rpProg, { progress: t.dataset.v }); return; }
  if (t.dataset.rpClear) { storeDraft(t.dataset.rpClear, {}); render(); return; }
  if (t.dataset.reportSave) {
    const title = t.dataset.reportSave; const fid = sid(title); const g = (k) => val(`rp-${fid}-${k}`);
    try {
      const fromGames = capUi().beforeSave(title, fid);
      if (fromGames) fillReport(fid, { won: String(fromGames.won), lost: String(fromGames.lost) });
      const r = scrimReport({ title, date: g('date'), time: g('time'), by: g('by'), partner: g('partner'), partnerLevel: g('level'), format: g('format'), roster: g('roster'), scrimId: g('scrim'),
        won: g('won'), lost: g('lost'), drawn: g('drawn'), played: g('played'), points: g('points'), avgPlacement: g('avg'), chicken: g('chicken'),
        focus: g('focus'), progress: g('progress'), worked: g('worked'), failed: g('failed'), detail: g('detail'), playerNotes: g('players'), adjust: g('adjust'), vod: g('vod'), asOf: localToday() });
      // Closing a planned session here avoids typing the same result twice.
      const sc = r.scrimId ? S.scrims.find((x) => x.id === r.scrimId && x.status === 'planned') : null;
      const done = sc ? completeScrim(sc, { score: resultText(r.result), notes: r.worked || r.failed, by: r.by, matchIds: [], perObjective: {} }) : null;
      if (S.db) { await S.db.collection('scrim_reports').doc(r.id).set(r); if (done) await S.db.collection('scrims').doc(sc.id).set(done); }
      else { S.reports.push(r); if (done) Object.assign(sc, done); }
      const nGames = (S.cap[fid]?.ready || []).length;
      try { await capUi().afterSave(title, fid, r); } catch (err) { render(); return setMsg(`rpMsg-${fid}`, `Report saved, but its games were not (${err.message}). They are kept on this device: use "Retry saving games" under Games.`, 'err'); }
      const keep = Object.fromEntries(RP_KEEP_AFTER_SAVE.map((k) => [k, g(k)]).filter(([, v]) => v));
      storeDraft(fid, { ...keep, at: new Date().toISOString() });
      render(); setMsg(`rpMsg-${fid}`, `Report saved (${resultText(r.result)} vs ${r.partner}${nGames ? `, ${nGames} game${nGames > 1 ? 's' : ''} with stats` : ''}). Next partner? The setup is kept.`, 'ok');
    } catch (err) { setMsg(`rpMsg-${fid}`, err.message, 'err'); markInvalid(fid, err.message); }
    return;
  }
  if (t.dataset.reportNote) {
    const rid = t.dataset.reportNote; const r = S.reports.find((x) => x.id === rid); if (!r) return;
    try {
      const n = reportNote(r, { text: val(`rpN-${rid}`), by: meName() || S.me });
      if (S.db) await S.db.collection('scrim_reports').doc(rid).set(n); else Object.assign(r, n);
      render();
    } catch (err) { setMsg(`rpNMsg-${rid}`, err.message, 'err'); }
    return;
  }
  if (t.dataset.reportCsv) {
    const ti = t.dataset.reportCsv; const msgId = ti === '*' ? 'rpCsvMsg-all' : `rpCsvMsg-${sid(ti)}`;
    try {
      const rows = S.reports.filter((r) => ti === '*' || r.title === ti);
      const dl = await window.claude?.use?.('downloads'); if (!dl) throw new Error('Downloads are not available in this view; copy the day cards instead.');
      await dl.save({ filename: `scrim-reports-${ti === '*' ? 'all-titles' : sid(ti).toLowerCase()}-${localToday()}.csv`, data: reportsCsv(rows) }); setMsg(msgId, 'Saved.', 'ok');
    } catch (err) { setMsg(msgId, err.code === 'declined' ? 'Download cancelled.' : err.message, err.code === 'declined' ? '' : 'err'); }
    return;
  }
  if (t.dataset.scrimPlan) {
    const title = t.dataset.scrimPlan; const fid = sid(title);
    try {
      const objectives = [...document.querySelectorAll(`input[name="spObj-${fid}"]:checked`)].map((x) => x.value);
      const sc = planScrim({ title, date: val(`spD-${fid}`), time: val(`spTm-${fid}`), kind: val(`spK-${fid}`), format: val(`spF-${fid}`), partner: val(`spP-${fid}`), partnerLevel: val(`spL-${fid}`), mirrors: val(`spMi-${fid}`), owner: val(`spO-${fid}`), objectives });
      if (S.db) await S.db.collection('scrims').doc(sc.id).set(sc); else S.scrims.push(sc);
      render();
    } catch (err) { setMsg(`spMsg-${fid}`, err.message, 'err'); }
    return;
  }
  if (t.dataset.scrimDone || t.dataset.scrimCancel) {
    const sid2 = t.dataset.scrimDone || t.dataset.scrimCancel; const sc = S.scrims.find((x) => x.id === sid2); if (!sc) return;
    try {
      const cancelled = !!t.dataset.scrimCancel;
      const per = {};
      for (const oid of sc.objectives) { const r = val(`scR-${sid2}-${oid}`); if (r) per[oid] = { result: r, measure: val(`scV-${sid2}-${oid}`) }; }
      const done = completeScrim(sc, { cancelled, cancelledWhy: cancelled ? (val(`scN-${sid2}`) || 'not given') : '', score: cancelled ? '' : val(`scS-${sid2}`), matchIds: val(`scM-${sid2}`).split(',').map((x) => x.trim()).filter(Boolean), notes: val(`scN-${sid2}`), by: val(`scB-${sid2}`), perObjective: per });
      // Each objective result becomes a coaching-cycle session linked to this scrim.
      const updated = [];
      for (const [oid, r] of Object.entries(per)) {
        const o = S.cycle.find((x) => x.id === oid); if (!o) continue;
        updated.push(logSession(o, { owner: done.result.by, date: sc.date, execution: 'as-planned', result: r.result, measure: r.measure, context: { opponent: sc.partner, mirrors: sc.mirrors, scrimId: sc.id }, notes: done.result.notes }));
      }
      if (S.db) await S.db.collection('scrims').doc(sc.id).set(done); else Object.assign(sc, done);
      for (const o of updated) await saveObj(o);
      render();
    } catch (err) { setMsg(`scMsg-${sid2}`, err.message, 'err'); }
    return;
  }
  if (id === 'obSave') {
    try {
      const title = val('obT');
      const ev = staffObservation({ title, observation: val('obO'), source: val('obSrc'), kind: val('obK'), n: val('obN'), context: val('obC'), by: val('obBy') });
      if (!val('obD').trim() || !val('obS').trim()) throw new Error('Add a proposed drill and a measurable success criterion.');
      const rec = recommendationRecord({ problem: val('obO').trim(), drill: val('obD').trim(), success: val('obS').trim(), explanation: `Staff observation (${ev.kind}) from ${ev.source}.`, priority: 2, confidence: ev.confidence, area: 'staff', findings: [ev.id] }, [ev]);
      await saveObj(propose(rec, { title, by: val('obBy').trim(), rulesSnapshot: snapshot(S.rules, title === 'PUBG Mobile' ? ['pubgm-scoring'] : title === 'Dota 2' ? ['dota-patch'] : []) }));
      render(); setMsg('obMsg', `Sent to ${owner(title).name} for review.`, 'ok');
    } catch (err) { setMsg('obMsg', err.message, 'err'); }
  }
  if (id === 'wRSave') {
    const list = val('wR').split(',').map((x) => x.trim()).filter(Boolean);
    S.roster = { ...S.roster, [S.wellTitle]: list };
    if (S.db) { try { await S.db.doc('config/roster').set({ roster: S.roster }); } catch (err) { return setMsg('wRMsg', `Not saved (${err.code || err.message}).`, 'err'); } }
    render();
  }
  if (id === 'ciSave') {
    try {
      const c = checkin({ player: val('ciP'), title: S.wellTitle, date: val('ciD'), sleepH: val('ciH'), by: val('ciBy'), ...Object.fromEntries(ITEMS.map((k) => [k, val(`ci-${k}`)])) });
      if (S.db) await S.db.collection('wellbeing_checkins').doc(`${c.date}_${c.title}_${c.player}`.replace(/[^A-Za-z0-9_\-.]/g, '_')).set(c);
      else { S.well.checkins = S.well.checkins.filter((x) => !(x.player === c.player && x.date === c.date)); S.well.checkins.push(c); }
      setMsg('ciMsg', `Saved ${c.player}, wellness ${c.wellness}/25.`, 'ok');
    } catch (err) { setMsg('ciMsg', err.code === 'permission_denied' || /permission|not_granted/.test(err.code || '') ? 'Only editors can save wellbeing records.' : err.message, 'err'); }
  }
  if (id === 'slSave') {
    try {
      const x = loadSession({ player: val('slP'), title: S.wellTitle, date: val('slD'), kind: val('slK'), minutes: val('slM'), rpe: val('slR') });
      if (S.db) await S.db.collection('wellbeing_load').add(x); else S.well.loads.push(x);
      setMsg('slMsg', `Saved ${x.load} AU for ${x.player}.`, 'ok');
    } catch (err) { setMsg('slMsg', err.message, 'err'); }
  }
  if (id === 'exportBtn') {
    const box = $('#exportBox'); const ops = assertOperational(S.cycle, 'export');
    box.value = JSON.stringify({ exported: new Date().toISOString(), origin: 'operational', rules: S.rules.map(({ id: i, version, status }) => ({ id: i, version, status })), objectives: ops }, null, 2); box.hidden = false; box.select();
  }
}
// A button action (save, add, tick) redraws with fresh forms. Any other redraw — a colleague's save
// arriving from the shared database, a filter, the language switch — keeps what is being typed.
document.addEventListener('click', async (e) => {
  const b = e.target.closest('button');
  KEEP_FORMS = !b || b.id === 'langBtn' || b.id === 'modeBtn' || 'rpFill' in b.dataset || 'rpProg' in b.dataset;
  try { await onClick(e); } finally { KEEP_FORMS = true; }
});
for (const ev of ['input', 'change']) document.addEventListener(ev, (e) => draftField(e.target));

document.addEventListener('change', (e) => {
  if (e.target.dataset?.capShot || e.target.dataset?.capDraft || e.target.dataset?.patPeriod) { capUi().onChange(e); return; }
  const id = e.target.id;
  if (id === 'meSel') { S.me = e.target.value; try { localStorage.setItem('hub-me', S.me); } catch { /* per-viewer convenience only */ } render(); }
  if (id === 'wT') { S.wellTitle = e.target.value; render(); }
  if (id === 'rdT') { S.rd.title = e.target.value; render(); }
  if (id === 'rdD') { S.rd.date = e.target.value || today(); render(); }
  if (id === 'crT') { S.crTitle = e.target.value; S.crNation = 'All'; render(); }
  if (id === 'crN') { S.crNation = e.target.value; render(); }
  if (id === 'ocT') { S.ocTitle = e.target.value; render(); }
  if (id === 'ocN') { S.ocNation = e.target.value; render(); }
  if (id === 'cnN') { S.compNation = e.target.value; render(); }
  if (id === 'tourT') { S.tourTitle = e.target.value; render(); }
  if (id === 'tsM') { S.tourMatch = e.target.value; render(); }
  if (id === 'plT') { S.planTitle = e.target.value; S.planPlayer = null; render(); }
  if (id === 'plP') { S.planPlayer = e.target.value; render(); }
  if (id === 'brD') { S.briefDate = e.target.value || today(); render(); }
  if (id === 'wD') { S.wellDate = e.target.value; render(); }
  if (id === 'dFirst') { S.draft.firstUs = e.target.value === 'us'; S.draft.steps = []; render(); }
  if (id === 'dOpp') { S.draft.opp = e.target.value; render(); }
  if (id === 'mSel') { S.selMatch = +e.target.value; S.importReport = null; render(); }
  if (id === 'nSel') { S.selNation = e.target.value; render(); }
  if (id === 'pTeam') { S.pubgm.team = e.target.value; render(); }
  if (id === 'dayS') { S.selDay = e.target.value; render(); }
  if (id === 'mSplit') { S.splitDate = e.target.value; render(); }
  if (id === 'mFile') { const f = e.target.files?.[0]; if (!f) return; const r = new FileReader(); r.onload = () => doImport(String(r.result), `OpenDota JSON file ${f.name}`); r.readAsText(f); }
  if (id === 'lMatchFile' || id === 'lFightFile') { const f = e.target.files?.[0]; if (!f) return; const r = new FileReader(); r.onload = () => { (id === 'lMatchFile' ? $('#lMatches') : $('#lFights')).value = r.result; }; r.readAsText(f); }
});
document.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.id === 'dHero') $('#dLock')?.click(); });
window.addEventListener('hashchange', render);
if (restricted() && HUB_USER.titles[0] && (!location.hash || location.hash === '#')) history.replaceState(null, '', `#${REPORT_TAB[HUB_USER.titles[0]]}`);
render();
initCaps();
