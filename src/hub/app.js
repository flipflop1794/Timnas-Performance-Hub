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
import { staffObservation, recommendationRecord } from '../core/records.js';
import { FIELDS, FIELD_SOURCE, TIERS, board as rivalBoard, rivalNote, crossTitle, nationProfile, coverage } from '../core/competitors.js';
import { planScrim, completeScrim, summary as scrimSummary, FORMATS, KINDS as SCRIM_KINDS } from '../core/scrims.js';
import { EVENT, defaultRunbook, tLabel, wecMatch, tick, setResult, gameNote, markApplied } from '../core/matchday.js';
import { VOD_TAGS, vod, reviewVod, LEVELS, partner as partnerRec, partnerStats, AREAS, GOAL_STATUS, goal as goalRec, updateGoal, plan as newPlan } from '../core/library.js';
import { weeklyBrief } from '../core/brief.js';
import { seedRosters, effective, editPlayers, recordCheck, checkStatus, dotaPool, ACCOUNT_KIND, ROLE_HINT, rosterKey, CHECK_EVERY_DAYS } from '../core/rosters.js';
import { loadReadiness, READINESS_SLOT } from '../readiness/contract.js';
import { mockProvider, MOCK_TITLES } from '../readiness/mockProvider.js';
import { readinessView } from '../readiness/view.js';
import { translateDom, tr as trId } from './i18n.js';
import { autoCard, cardPlan, approveCard, cardMarkdown } from '../core/oppcard.js';
import { checkin, session as loadSession, teamDay, ITEMS, ITEM_LABEL, THRESHOLDS, MIN_BASELINE_DAYS } from '../core/wellbeing.js';

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
  me: (() => { try { return localStorage.getItem('hub-me') || 'aufa'; } catch { return 'aufa'; } })(),
  // Rosters: Dota 2 and PUBGM from wec.iesf.org (3 Nov); MLBB core and eFootball from the project decision log; others to be entered.
  roster: { 'Dota 2': ['Whitemon', 'Fbz', 'Jhocam', 'jikroy', 'Mikoto'], 'PUBG Mobile': ['AKxSatarrrGOLD', 'AKxAmetzGOLD', 'AKxVinzGOLD', 'AKxZaoo7GOLD'],
    MLBB: ['Aran', 'Kevin', 'Drichel', 'Lyoni', 'Jull.'], 'MLBB Women': [], eFootball: ['ELGA'], CS2: [], 'CS2 Women': [] },
  rivals: [], tiers: {}, scrims: [],
  runbooks: {}, wecMatches: [], tourTitle: 'Dota 2', tourMatch: null, vods: [], partners: [], plans: {}, planTitle: 'Dota 2', planPlayer: null, lang: (() => { try { return localStorage.getItem('hub-lang') === 'id' ? 'id' : 'en'; } catch { return 'en'; } })(), rd: { title: 'All titles', date: new Date().toISOString().slice(0, 10), data: null, key: null }, rivalSeed: seedRosters(DATA.rivalRosters), rosterEdits: {}, oppCards: {}, crTitle: 'Dota 2', crNation: 'All', ocTitle: 'Dota 2', ocNation: 'Mongolia', compNation: 'Egypt', compAllEf: false, briefDate: new Date().toISOString().slice(0, 10),
  well: { checkins: [], loads: [] }, wellTitle: 'Dota 2', wellDate: new Date().toISOString().slice(0, 10),
  selMatch: 9057681759, selNation: 'MGL', selDay: null, freshPools: {}, importReport: null, lastFlag: null,
};
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
const today = () => new Date().toISOString().slice(0, 10);

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
const TITLES = [
  { id: 'home', label: 'Today', tabs: [['today', 'My day'], ['board', 'Juara Umum board'], ['brief', 'Weekly brief']] },
  { id: 'comp', label: 'Competitors', tabs: [['comp-overview', 'All nations'], ['comp-nation', 'Nation profile'], ['comp-rosters', 'Rosters & players'], ['comp-card', 'Opponent card'], ['comp-coverage', 'Scouting coverage']] },
  { id: 'tour', label: 'Tournament', tabs: [['tour-runbook', 'Match-day runbook'], ['tour-series', 'Between games']] },
  { id: 'dota', label: 'Dota 2', tabs: [['dota-team', 'Team'], ['dota-scrims', 'Scrims & practice'], ['dota-post', 'Post-match'], ['dota-scout', 'Competitors'], ['dota-draft', 'Draft room'], ['dota-review', 'Series review']] },
  { id: 'pubgm', label: 'PUBG Mobile', tabs: [['pubgm-team', 'Team'], ['pubgm-scrims', 'Scrims & practice'], ['pubgm-log', 'Log & import'], ['pubgm-rivals', 'Competitors'], ['pubgm-sim', 'Strategy sim'], ['pubgm-review', 'Match-day review']] },
  { id: 'mlbb', label: 'Other titles', tabs: [['mlbb', 'MLBB'], ['t-mlbbw', 'MLBB Women'], ['t-efootball', 'eFootball'], ['t-cs2', 'CS2'], ['t-cs2w', 'CS2 Women']] },
  { id: 'well', label: 'Performance', tabs: [['readiness', 'Athlete readiness (preview)'], ['players', 'Player plans'], ['well-day', 'Wellbeing check'], ['well-log', 'Log check-in & load']] },
  { id: 'staff', label: 'Staff', tabs: [['staff-cycle', 'Coaching cycle'], ['staff-measure', 'Is it working?'], ['staff-rules', 'Rules & decisions'], ['staff-sources', 'Sources & limits']] },
];
const viewOf = () => { const h = location.hash.slice(1); return TITLES.some((t) => t.tabs.some(([id]) => id === h)) ? h : 'today'; };
function renderNav(view) {
  const title = TITLES.find((t) => t.tabs.some(([id]) => id === view));
  const pending = S.cycle.filter((o) => o.status === 'proposed').length;
  const me = STAFF.find((x) => x.id === S.me);
  $('#titles').innerHTML = `<label class="me" for="meSel">I am <select id="meSel">${STAFF.map((x) => `<option value="${x.id}" ${x.id === S.me ? 'selected' : ''}>${esc(x.name.split(' ')[0])}</option>`).join('')}</select></label>` + TITLES.map((t) => `<button type="button" data-go="${t.tabs[0][0]}" aria-pressed="${t === title}">${esc(t.label)}${t.id === 'staff' && pending ? ` · ${pending}` : ''}</button>`).join('')
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
  if (S.wellAccess === 'denied') return `<div class="panel"><h2>Wellbeing</h2>${banner('block', '<div>Wellbeing records are visible to editors only.</div>')}</div>`;
  const date = new Date().toISOString().slice(0, 10);
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
    return `<div class="panel"><h2>${esc(title)}</h2>${L.length ? `<ul class="plain today">${L.map(todayCard).join('')}</ul>` : `<p class="empty">No objectives yet. Add a staff observation from Draft Lab, VOD or scrims.</p>`}<div class="toolbar"><a class="btn" href="#mlbb">Add observation</a></div></div>`;
  };
  const titles = me.id === 'donny' ? [] : me.id === 'fayad' ? ['PUBG Mobile', 'eFootball', 'MLBB Women', 'Dota 2', 'MLBB'] : me.focus;
  return `<div class="panel"><div class="lead">What do we <em>train today</em>?</div>
    <p>Accepted objectives first. Anything not yet reviewed is a proposal, not a training decision. Choose who you are at the top to see your queue.</p></div>
    ${queueHtml(me.id)}
    ${me.id === 'donny' || me.id === 'fayad' ? wellTodayPanel() : ''}
    ${(() => { const mine = me.id === 'aufa' ? me.focus : WEC_TITLES.map((t) => t.id); const up = S.scrims.filter((x) => mine.includes(x.title) && x.status === 'planned').sort((a, b) => a.date.localeCompare(b.date)).slice(0, 6);
      return up.length ? `<div class="panel"><h2>Scrims and practice coming up</h2><ul class="plain">${up.map((x) => `<li><b>${esc(x.date)}</b> ${esc(x.time)} · ${esc(x.title)} · ${esc(x.kind)}${x.partner ? ` vs ${esc(x.partner)}` : ''}${x.mirrors ? ` (stand-in for ${esc(x.mirrors)})` : ''}${x.date < today() ? ' — <b>result not logged</b>' : ''}</li>`).join('')}</ul></div>` : ''; })()}
    <div class="cols">${titles.map(titlePanel).join('')}</div>`;
};

// Juara Umum board: every title on one page, for the Head Coach and the BOD conversation.
const PLAN_V3 = { 'MLBB Women': 75, MLBB: 40, eFootball: 40, 'PUBG Mobile': 35, 'Dota 2': 35, CS2: 10, 'CS2 Women': 5 };
V.board = () => {
  const since = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
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
    const rb = rivalBoard(t.id, S.rivals, S.tiers); const ss = scrimSummary(S.scrims, t.id);
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
  const Sm = scrimSummary(S.scrims, title);
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
function titlePage(title) {
  const objs = S.cycle.filter((o) => o.title === title && !['retired', 'rejected'].includes(o.status));
  const dl = title === 'MLBB' || title === 'MLBB Women';
  return `<div class="panel"><div class="lead">${esc(title)}</div>
    <p class="note">Focus owner: ${esc(ownerNote(title))} · title coach: ${esc(WEC_TITLES.find((t) => t.id === title)?.coach || 'TBD')}. No analysis engine in the hub${dl ? '; Draft Lab is the MLBB engine' : ''}. What staff see in ${dl ? 'Draft Lab, ' : ''}VOD or scrims enters the coaching cycle as a staff observation.</p>
    ${dl ? `<div class="toolbar"><a class="btn" href="https://claude.ai/code/artifact/2b3103c5-81c9-4ad4-ba3e-3303778a8259" target="_blank" rel="noopener">Open Draft Lab Pelatnas</a><a class="btn" href="https://claude.ai/artifact/VatjYMhyVs5DLHgp8Yx4Rj" target="_blank" rel="noopener">Open Draft Lab MLBB v19</a></div>` : ''}</div>
  <div class="panel"><h2>Objectives</h2>${objs.length ? `<ul class="plain">${objs.map((o) => `<li>${tag(`s-${o.status}`, o.status)} ${esc(o.rec.problem)} <span class="note">— ${esc(nextStep(o, S.rules))}</span></li>`).join('')}</ul>` : '<p class="empty">No objectives yet.</p>'}
    ${S.mode === 'demo' ? '' : `<details><summary class="btn">Add a staff observation</summary>${observationForm(title)}</details>`}</div>
  ${scrimsPanel(title)}${competitorsPanel(title)}`;
}
V.mlbb = () => titlePage('MLBB');
V['t-mlbbw'] = () => titlePage('MLBB Women');
V['t-efootball'] = () => titlePage('eFootball');
V['t-cs2'] = () => titlePage('CS2');
V['t-cs2w'] = () => titlePage('CS2 Women');
V['dota-scrims'] = () => scrimsPanel('Dota 2');
V['pubgm-scrims'] = () => scrimsPanel('PUBG Mobile');
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
  if (S.wellAccess === 'denied') return `<div class="panel">${banner('block', '<div><b>Editors only.</b> Ask the page owner for edit access to see wellbeing records.</div>')}</div>`;
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
      <p class="note">Measured by: ${esc(g.measure)}</p>${g.updates.length ? `<p class="note">Last update: ${esc(g.updates.at(-1).note || g.updates.at(-1).status)} — ${esc(g.updates.at(-1).by)}, ${esc(g.updates.at(-1).at.slice(0, 10))}</p>` : ''}
      <div class="form"><label class="field" for="guS-${g.id}">Status<select id="guS-${g.id}">${GOAL_STATUS.map((s) => `<option ${s === g.status ? 'selected' : ''}>${s}</option>`).join('')}</select></label><label class="field" for="guN-${g.id}">Note<input type="text" id="guN-${g.id}"></label></div>
      <div class="toolbar"><button class="btn small" type="button" data-goal-upd="${esc(g.id)}">Update</button><span class="msg" id="guMsg-${g.id}"></span></div></div>`).join('') || '<p class="note">No goal.</p>'}`; }).join('')}</div>
  <div class="panel"><h2>Add a goal</h2><div class="form">
    <label class="field" for="gaA">Area<select id="gaA">${AREAS.map((a) => `<option>${a}</option>`).join('')}</select></label>
    <label class="field" for="gaD">Due<input type="date" id="gaD"></label><label class="field" for="gaO">Owner<input type="text" id="gaO" value="${esc(meName())}"></label></div>
    <label class="field" for="gaG">Goal<input type="text" id="gaG" placeholder="${t === 'Dota 2' ? 'e.g. two more established heroes for pos 4' : 'e.g. widen hero/agent pool by two'}"></label>
    <label class="field" for="gaM">How it is measured<input type="text" id="gaM" placeholder="e.g. 6+ scrim games on each by 1 Dec, coach sign-off"></label>
    <div class="toolbar"><button class="btn primary" type="button" id="gaAdd">Add goal</button><span class="msg" id="gaMsg"></span></div></div></div>`;
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
const briefText = () => weeklyBrief({ asOf: S.briefDate, cycle: S.cycle, scrims: S.scrims, rivals: S.rivals, tiers: S.tiers, checkins: S.well.checkins, roster: S.roster, rules: S.rules, pending: PENDING, plans: Object.values(S.plans) });
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
const TITLE_TAB = { 'Dota 2': 'dota-scout', 'PUBG Mobile': 'pubgm-rivals', MLBB: 'mlbb', 'MLBB Women': 't-mlbbw', eFootball: 't-efootball', CS2: 't-cs2', 'CS2 Women': 't-cs2w' };
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
function render() {
  const view = viewOf(); renderNav(view); LAST = { recs: {} };
  document.documentElement.classList.toggle('demo', S.mode === 'demo');
  try { $('#main').innerHTML = V[view](); } catch (e) { $('#main').innerHTML = `<div class="panel">${banner('block', `<div>Something failed while building this view: ${esc(e.message)}</div>`)}</div>`; console.error(e); }
  document.documentElement.lang = S.lang;
  if (S.lang === 'id') {
    translateDom(document.querySelector('header.top'), 'id'); translateDom($('#main'), 'id');
    if (ORIGINAL_LANG_VIEWS.test(view)) $('#main').insertAdjacentHTML('afterbegin', '<p class="note lang-note">Catatan: temuan analisis otomatis, catatan staf, nama dan sumber data ditampilkan dalam bahasa aslinya (Inggris).</p>');
  }
}
// Views that show engine findings or data notes, which stay in English.
const ORIGINAL_LANG_VIEWS = /^(dota-team|dota-post|dota-scout|dota-draft|dota-review|pubgm-|comp-nation|comp-card|comp-rosters|staff-sources|staff-rules)/;
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
document.addEventListener('click', async (e) => {
  const t = e.target.closest('button, [data-go]'); if (!t) return;
  if (t.dataset.go) { location.hash = t.dataset.go; return; }
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
      if (id === 'gaAdd') pl.goals.push(goalRec({ area: val('gaA'), goal: val('gaG'), measure: val('gaM'), due: val('gaD'), owner: val('gaO') }));
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
});
document.addEventListener('change', (e) => {
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
render();
initCaps();
