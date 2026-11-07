// V1.14 Draft Room screens (MLBB, MLBB Women): mock draft with a clock, draft books per opponent, hero
// pools, draft patterns (ours, and public pro games kept apart), drills, and the pro-game import.
// All logic and checks live in src/core/draftroom.js; this file only draws and saves.
import { heroesFor } from './capture_ui.js';
import { latestGames } from '../core/capture.js';
import { FIELDS } from '../core/competitors.js';
import { owner, TITLES as WEC_TITLES } from '../core/staff.js';
import * as D from '../core/draftroom.js';

const SECTIONS = [['mock', 'Mock draft'], ['book', 'Draft books'], ['pools', 'Hero pools'], ['patterns', 'Draft patterns'], ['drills', 'Drills'], ['pro', 'Pro games']];
const COLL = { pools: 'draft_pools', books: 'draft_books', mocks: 'mock_drafts', drills: 'draft_drills', pro: 'pro_games' };
const pct = (x) => (x == null ? '—' : `${Math.round(x * 100)}%`);
const mmss = (s) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.max(0, s) % 60).padStart(2, '0')}`;

export function draftRoomUi(ctx) {
  const { S, esc, tag, banner, setMsg, val, render, meName, sid } = ctx;
  S.dr ||= { section: {}, mock: {}, drill: {}, proPreview: {} };
  for (const k of Object.keys(COLL)) S[`dr_${k}`] ||= [];
  const H = (title) => heroesFor(title);
  const mine = (k, title) => S[`dr_${k}`].filter((x) => x.title === title);
  const roster = (title) => (S.roster[title] || []).filter(Boolean);
  const approvers = (title) => [...new Set([owner(title).name, 'Fayad', WEC_TITLES.find((t) => t.id === title)?.coach].filter((x) => x && !/TBD|see WEC/.test(x)))];
  const opponents = (title) => FIELDS[title] || [];
  const datalist = (id, title, exclude = new Set()) => `<datalist id="${id}">${H(title).names.filter((n) => !exclude.has(n)).map((n) => `<option value="${esc(n)}">`).join('')}</datalist>`;

  async function put(k, rec) {
    if (S.db) await S.db.collection(COLL[k]).doc(sid(rec.id)).set(rec);
    const list = S[`dr_${k}`]; const i = list.findIndex((x) => x.id === rec.id);
    if (i >= 0) list[i] = rec; else list.push(rec);
  }
  // The running mock draft lives on this device until it is finished (a refresh does not lose it).
  const mkKey = (title) => `hub-mock-${title}`;
  function running(title) {
    if (S.dr.mock[title] === undefined) { let x = null; try { x = JSON.parse(localStorage.getItem(mkKey(title)) || 'null'); } catch { x = null; } S.dr.mock[title] = x && x.status === 'running' ? x : null; }
    return S.dr.mock[title];
  }
  function keepMock(title) { try { const m = S.dr.mock[title]; if (m) localStorage.setItem(mkKey(title), JSON.stringify(m)); else localStorage.removeItem(mkKey(title)); } catch { /* per-device convenience */ } }

  // ---------------------------------------------------------------- page
  function page(title) {
    const sec = S.dr.section[title] || 'mock';
    const nav = `<div class="drseg" role="tablist">${SECTIONS.map(([k, l]) => `<button type="button" role="tab" aria-selected="${k === sec}" data-dr-section="${k}" data-dr-title="${esc(title)}">${esc(l)}</button>`).join('')}</div>`;
    const body = { mock: mockSection, book: bookSection, pools: poolSection, patterns: patternSection, drills: drillSection, pro: proSection }[sec](title);
    return `<div class="panel hero-panel"><div class="lead">Draft <em>Room</em> — ${esc(title)}</div>
      <p class="note">The hub's own draft tools. Our numbers come only from national-team scrims and mock drafts; public pro games are imported by staff and always shown apart. ${esc(D.ORDER_NOTE)}</p>${nav}</div>${body}`;
  }

  // ---------------------------------------------------------------- mock draft
  function slots(m, side, action) {
    const st = D.mockState(m); const have = (action === 'ban' ? st.bans : st.picks)[side];
    const n = m.order.filter((x) => x.side === side && x.action === action).length;
    return `<div class="dr-slots ${action}">${Array.from({ length: n }, (_, i) => `<span class="dr-slot ${have[i] ? 'on' : ''} ${have[i] === '' ? 'lost' : ''}">${have[i] ? esc(have[i]) : have[i] === '' ? 'no ban' : ''}</span>`).join('')}</div>`;
  }
  function board(m) {
    const side = (s) => `<div class="dr-side ${s} ${m.ourSide === s ? 'ours' : ''}"><div class="dr-side-h">${s === 'blue' ? 'Blue' : 'Red'} · ${m.ourSide === s ? 'Indonesia' : esc(m.opponent || 'Opponent')}</div>
      <div class="dr-lab">Bans</div>${slots(m, s, 'ban')}<div class="dr-lab">Picks</div>${slots(m, s, 'pick')}</div>`;
    return `<div class="dr-board">${side('blue')}${side('red')}</div>`;
  }
  function mockSection(title) {
    const m = running(title);
    const past = mine('mocks', title).filter((x) => x.status === 'done').sort((a, b) => String(b.finishedAt).localeCompare(String(a.finishedAt))).slice(0, 8);
    const pastHtml = `<div class="panel"><h2>Recent mock drafts</h2>${past.length ? `<div class="tw"><table><thead><tr><th>When</th><th>Side</th><th>Opponent</th><th>Our picks</th><th class="n">Over time</th><th>Result</th></tr></thead><tbody>${past.map((x) => {
      const st = D.mockState(x); return `<tr><td>${esc(String(x.finishedAt).slice(0, 10))}</td><td>${esc(x.ourSide)}</td><td>${esc(x.opponent || '—')}${x.standInFor ? ` <span class="note">(stand-in for ${esc(x.standInFor)})</span>` : ''}</td><td>${esc(st.picks[x.ourSide].join(', '))}</td><td class="n">${x.overSteps || 0}</td><td>${esc(x.result || '—')}</td></tr>`; }).join('')}</tbody></table></div>` : '<p class="empty">No mock draft yet.</p>'}</div>`;
    if (!m) {
      return `<div class="panel"><h2>Start a mock draft</h2>
        <div class="grid3"><label class="field" for="drSide">Our side<select id="drSide"><option value="blue">Blue (first ban, first pick)</option><option value="red">Red</option></select></label>
        <label class="field" for="drOpp">Opponent (partner or WEC nation)<input id="drOpp" list="drOppList" placeholder="e.g. Myanmar"></label>
        <label class="field" for="drStand">Stand-in for (WEC nation, optional)<select id="drStand"><option value="">—</option>${opponents(title).map((n) => `<option>${esc(n)}</option>`).join('')}</select></label>
        <label class="field" for="drSec">Seconds per step<input id="drSec" type="number" inputmode="numeric" min="10" max="120" value="${D.STEP_SECONDS}"></label>
        <label class="field" for="drBy">Run by<input id="drBy" value="${esc(meName())}"></label></div>
        <datalist id="drOppList">${opponents(title).map((n) => `<option value="${esc(n)}">`).join('')}</datalist>
        <div class="toolbar"><button class="btn primary" data-dr-start="${esc(title)}">Start the clock</button><span class="msg" id="msg-dr-mock" role="status"></span></div></div>${pastHtml}`;
    }
    const st = D.mockState(m);
    if (st.done) {
      return `${board(m)}<div class="panel"><h2>Draft complete</h2>
        <div class="grid3"><label class="field" for="drResult">Result (if the game was played)<select id="drResult"><option value="">—</option><option value="win">Win</option><option value="loss">Loss</option><option value="not played">Not played</option></select></label>
        <label class="field wide" for="drNote">Note<input id="drNote" placeholder="What we learnt from this draft"></label></div>
        <div class="toolbar"><button class="btn primary" data-dr-finish="${esc(title)}">Save mock draft</button><button class="btn" data-dr-undo="${esc(title)}">Undo last step</button><button class="btn ghost" data-dr-abandon="${esc(title)}">Discard</button><span class="msg" id="msg-dr-mock" role="status"></span></div></div>`;
    }
    const left = m.stepSeconds - Math.round((Date.now() - new Date(m.stepStartedAt)) / 1000);
    const ours = st.team === 'ours';
    // Quick picks: on our turn, our players' main and can-play heroes; on theirs, the heroes pro teams take most.
    const pool = ours ? [...new Set(mine('pools', title).flatMap((p) => Object.entries(p.heroes || {}).filter(([, v]) => v.tier !== 'learning').map(([h]) => h)))] : D.proFacts(mine('pro', title)).priority.map((r) => r.hero);
    const quick = pool.filter((h) => !st.used.has(h)).slice(0, 12);
    return `${board(m)}<div class="panel dr-turn ${st.next.side}">
      <div class="dr-now"><span class="dr-step">Step ${st.step + 1} / ${st.total}</span><b>${st.next.side === 'blue' ? 'Blue' : 'Red'} ${st.next.action === 'ban' ? 'ban' : 'pick'}</b> ${ours ? tag('k-observed', 'our turn') : tag('k-hypothesis', 'their turn')}
        <span class="dr-clock ${left < 0 ? 'over' : left <= 5 ? 'low' : ''}" id="drClock" data-start="${esc(m.stepStartedAt)}" data-secs="${m.stepSeconds}">${left < 0 ? `+${mmss(-left)}` : mmss(left)}</span></div>
      <div class="dr-pick"><label class="field" for="drHero">Hero<input id="drHero" list="drHeroes" autocomplete="off" placeholder="Type a hero"></label>${datalist('drHeroes', title, st.used)}
        <button class="btn primary" data-dr-lock="${esc(title)}">Lock in</button>${st.next.action === 'ban' ? `<button class="btn" data-dr-skip="${esc(title)}">No ban (time ran out)</button>` : ''}<button class="btn ghost" data-dr-undo="${esc(title)}" ${st.step ? '' : 'disabled'}>Undo</button></div>
      ${quick.length ? `<div class="chips"><span class="note">${ours ? 'Our pools:' : 'Pro priority:'}</span>${quick.map((h) => `<button type="button" class="chip" data-dr-quick="${esc(h)}" data-dr-title="${esc(title)}">${esc(h)}</button>`).join('')}</div>` : ''}
      <span class="msg" id="msg-dr-mock" role="status"></span></div>`;
  }
  // The clock ticks without redrawing the page (typing is never interrupted).
  let ticker = null;
  function tick() {
    const el = document.getElementById('drClock'); if (!el) { clearInterval(ticker); ticker = null; return; } // stops when the clock leaves the page
    const left = Number(el.dataset.secs) - Math.round((Date.now() - new Date(el.dataset.start)) / 1000);
    el.textContent = left < 0 ? `+${mmss(-left)}` : mmss(left); el.className = `dr-clock ${left < 0 ? 'over' : left <= 5 ? 'low' : ''}`;
  }
  function startTicker() { if (!ticker && typeof setInterval === 'function') ticker = setInterval(tick, 1000); }

  // ---------------------------------------------------------------- draft books
  function bookSection(title) {
    const opp = S.dr.bookOpp?.[title] || opponents(title)[0] || '';
    const book = mine('books', title).find((b) => b.opponent === opp) || null;
    const all = mine('books', title).sort((a, b) => a.opponent.localeCompare(b.opponent));
    const ap = approvers(title);
    const v = (k) => esc(book ? (Array.isArray(book[k]) ? book[k].join(', ') : book[k]) : '');
    return `<div class="panel"><h2>Draft book</h2>
      <div class="toolbar"><label class="field" for="drBookOpp">Opponent<select id="drBookOpp" data-dr-bookopp="${esc(title)}">${[...new Set([...opponents(title), ...all.map((b) => b.opponent)])].map((n) => `<option ${n === opp ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></label>
        ${book ? `${tag(book.status === 'approved' ? 's-done' : 's-proposed', book.status === 'approved' ? `approved by ${book.approvedBy}` : 'draft')} <span class="note">v${book.version} · ${esc(book.updatedBy)} · ${esc(String(book.updatedAt).slice(0, 10))}</span>` : '<span class="note">No book for this opponent yet.</span>'}</div>
      ${datalist('drBookHeroes', title)}
      <div class="grid3"><label class="field" for="drBans">Ban list (comma separated)<input id="drBans" list="drBookHeroes" value="${v('bans')}"></label>
        <label class="field" for="drProtect">Protect (do not let them have)<input id="drProtect" value="${v('protect')}"></label>
        <label class="field" for="drFlex">Flex picks<input id="drFlex" value="${v('flex')}"></label></div>
      <div class="grid2"><label class="field" for="drBlue">Plan on blue side<textarea id="drBlue" rows="3">${v('blue')}</textarea></label>
        <label class="field" for="drRed">Plan on red side<textarea id="drRed" rows="3">${v('red')}</textarea></label></div>
      <label class="field" for="drNotes">Notes (from VODs, scrims vs stand-ins, pro games)<textarea id="drNotes" rows="2">${v('notes')}</textarea></label>
      <div class="toolbar"><label class="field" for="drBookBy">Written by<input id="drBookBy" value="${esc(meName())}"></label><button class="btn primary" data-dr-savebook="${esc(title)}">Save new version</button>
        ${book && book.status === 'draft' ? `<label class="field" for="drApprover">Approver<select id="drApprover">${ap.map((n) => `<option>${esc(n)}</option>`).join('')}</select></label><button class="btn" data-dr-approve="${esc(title)}">Approve this version</button>` : ''}
        <span class="msg" id="msg-dr-book" role="status"></span></div>
      <p class="note">Approval: ${esc(ap.join(', '))}; not the writer of the version. The approved book is shown on the opponent card and the match-day runbook (90 minutes before).</p>
      ${book?.history?.length ? `<details><summary class="btn ghost">Earlier versions (${book.history.length})</summary><ul class="plain">${book.history.slice().reverse().map((h) => `<li>v${h.version} · ${esc(h.by)} · ${esc(String(h.at).slice(0, 10))} · bans ${esc((h.bans || []).join(', ') || '—')}${h.status === 'approved' ? ` ${tag('s-done', 'was approved')}` : ''}</li>`).join('')}</ul></details>` : ''}</div>
      <div class="panel"><h2>All books — ${esc(title)}</h2>${all.length ? `<ul class="plain">${all.map((b) => `<li><b>${esc(b.opponent)}</b> v${b.version} ${tag(b.status === 'approved' ? 's-done' : 's-proposed', b.status)} <span class="note">bans ${esc(b.bans.join(', ') || '—')}</span></li>`).join('')}</ul>` : '<p class="empty">None yet.</p>'}</div>`;
  }

  // ---------------------------------------------------------------- hero pools
  function poolSection(title) {
    const players = roster(title);
    if (!players.length) return `<div class="panel">${banner('warn', 'Enter the roster first (Staff → rosters), then rate heroes per player.')}</div>`;
    const who = S.dr.poolPlayer?.[title] && players.includes(S.dr.poolPlayer[title]) ? S.dr.poolPlayer[title] : players[0];
    const pool = mine('pools', title).find((p) => p.player === who) || null;
    const games = latestGames((S.games || []).filter((g) => g.title === title));
    const sugg = D.poolSuggestions(games, who, pool);
    const byTier = (t) => Object.entries(pool?.heroes || {}).filter(([, v]) => v.tier === t).map(([h]) => h).sort();
    const overview = players.map((p) => { const x = mine('pools', title).find((q) => q.player === p); const n = (t) => Object.values(x?.heroes || {}).filter((v) => v.tier === t).length;
      return `<tr><td><button type="button" class="linkbtn" data-dr-player="${esc(p)}" data-dr-title="${esc(title)}">${esc(p)}</button></td><td class="n">${n('main')}</td><td class="n">${n('can')}</td><td class="n">${n('learning')}</td></tr>`; }).join('');
    return `<div class="cols"><div class="panel"><h2>Hero pool — ${esc(who)}</h2>
      ${D.TIERS.map((t) => `<div class="dr-tier"><span class="dr-tier-h">${esc(D.TIER_LABEL[t])}</span>${byTier(t).map((h) => `<button type="button" class="chip on" title="Remove" data-dr-unrate="${esc(h)}" data-dr-title="${esc(title)}">${esc(h)} ✕</button>`).join('') || '<span class="note">—</span>'}</div>`).join('')}
      ${datalist('drPoolHeroes', title)}
      <div class="toolbar"><label class="field" for="drPoolHero">Hero<input id="drPoolHero" list="drPoolHeroes"></label><label class="field" for="drPoolTier">Rating<select id="drPoolTier">${D.TIERS.map((t) => `<option value="${t}">${esc(D.TIER_LABEL[t])}</option>`).join('')}</select></label>
        <button class="btn primary" data-dr-rate="${esc(title)}">Save rating</button><span class="msg" id="msg-dr-pool" role="status"></span></div>
      <p class="note">The coach's rating, not a computed score. Suggestions below come from confirmed scrim games.</p>
      ${sugg.length ? `<div class="tw"><table><thead><tr><th>Played in scrims</th><th class="n">Games</th><th class="n">Won</th><th>Rated</th></tr></thead><tbody>${sugg.slice(0, 12).map((s) => `<tr><td>${esc(s.hero)}</td><td class="n">${s.games}</td><td class="n">${s.wins}</td><td>${s.rated ? esc(D.TIER_LABEL[s.rated]) : `<button type="button" class="chip" data-dr-suggest="${esc(s.hero)}" data-dr-title="${esc(title)}">Rate…</button>`}</td></tr>`).join('')}</tbody></table></div>` : '<p class="empty">No confirmed scrim games for this player yet.</p>'}</div>
      <div class="panel"><h2>Squad</h2><div class="tw"><table><thead><tr><th>Player</th><th class="n">Main</th><th class="n">Can play</th><th class="n">Learning</th></tr></thead><tbody>${overview}</tbody></table></div></div></div>`;
  }

  // ---------------------------------------------------------------- patterns
  function patternSection(title) {
    const games = latestGames((S.games || []).filter((g) => g.title === title));
    const f = D.ourDraftFacts({ games, mocks: mine('mocks', title) });
    const p = D.proFacts(mine('pro', title));
    const gaps = D.poolGaps(mine('pro', title), mine('pools', title));
    const low = (n) => (n < D.MIN_N ? ` ${tag('c-Low', `under ${D.MIN_N} games`)}` : '');
    const rows = (xs, f2) => xs.map(f2).join('') || '<tr><td colspan="3" class="empty">—</td></tr>';
    return `<div class="cols"><div class="panel"><h2>Ours — national-team scrims</h2>
      <p class="note">${f.games} confirmed games, ${f.drafted} with a draft screenshot${low(f.drafted)}. ${f.mocks} mock drafts${f.mocks ? `: ${f.mockOverSteps} steps over time, ${f.mockAvgSeconds} s a step on average` : ''}.</p>
      <div class="tw"><table><thead><tr><th>Banned against us</th><th class="n">Games</th><th class="n">Of</th></tr></thead><tbody>${rows(f.bansAgainstUs, (r) => `<tr><td>${esc(r.hero)}</td><td class="n">${r.n}</td><td class="n">${r.of}</td></tr>`)}</tbody></table></div>
      <div class="tw"><table><thead><tr><th>Our first pick</th><th class="n">Games</th><th class="n">Of</th></tr></thead><tbody>${rows(f.firstPicks, (r) => `<tr><td>${esc(r.hero)}</td><td class="n">${r.n}</td><td class="n">${r.of}</td></tr>`)}</tbody></table></div>
      <div class="tw"><table><thead><tr><th>Our heroes</th><th class="n">Games</th><th class="n">Won</th></tr></thead><tbody>${rows(f.heroes, (r) => `<tr><td>${esc(r.hero)}${r.lowSample ? ` ${tag('c-Low', 'few games')}` : ''}</td><td class="n">${r.n}</td><td class="n">${r.won}</td></tr>`)}</tbody></table></div></div>
      <div class="panel pro"><h2>Public pro games ${tag('x-club', 'not our team')}</h2>
      ${p.games ? `<p class="note">${p.games} games${p.events.length ? ` · ${esc(p.events.join(', '))}` : ''} · ${esc(p.from)} to ${esc(p.to)} · blue side won ${pct(p.blueWinRate)}${low(p.games)}. Imported by staff from public sources.</p>
      <div class="tw"><table><thead><tr><th>Hero</th><th class="n">Picked or banned</th><th class="n">Picks</th><th class="n">Bans</th><th class="n">Win when picked</th></tr></thead><tbody>${p.priority.slice(0, 15).map((r) => `<tr><td>${esc(r.hero)}</td><td class="n">${pct(r.presence)}</td><td class="n">${r.picked}</td><td class="n">${r.banned}</td><td class="n">${r.winRate == null ? `<span class="note">under ${D.MIN_N} picks</span>` : pct(r.winRate)}</td></tr>`).join('')}</tbody></table></div>` : `<p class="empty">No pro games imported. Add them under <button type="button" class="linkbtn" data-dr-section="pro" data-dr-title="${esc(title)}">Pro games</button>.</p>`}
      ${gaps.length ? `<h3>Pro priority heroes nobody on our squad rates main or can play</h3><p class="note">A question for the coach: ban them, or learn one.</p><div class="chips">${gaps.map((g) => `<span class="chip">${esc(g.hero)} · ${pct(g.presence)}</span>`).join('')}</div>` : ''}</div></div>`;
  }

  // ---------------------------------------------------------------- drills
  function drillSection(title) {
    const drills = mine('drills', title);
    const run = S.dr.drill[title];
    const d = run ? drills.find((x) => x.id === run.id) : null;
    const runner = d ? `<div class="panel dr-turn ${d.ask.side}"><h2>${esc(d.name)}</h2>
      <p>${esc(d.prompt)}</p><p class="note">Draft so far: ${d.prefill.map((a) => `${a.side} ${a.action} ${a.hero || '(no ban)'}`).map(esc).join(' · ') || '—'}. Now: <b>${esc(d.ask.side)} ${esc(d.ask.action)}</b>. Time: ${d.seconds} s.</p>
      <div class="dr-pick">${run.startedAt ? `<span class="dr-clock" id="drClock" data-start="${esc(run.startedAt)}" data-secs="${d.seconds}">${mmss(d.seconds)}</span>` : ''}
        <label class="field" for="drDrillPlayer">Player<select id="drDrillPlayer">${roster(title).map((p) => `<option>${esc(p)}</option>`).join('')}</select></label>
        ${run.startedAt ? `<label class="field" for="drDrillHero">Answer<input id="drDrillHero" list="drDrillHeroes" autocomplete="off"></label>${datalist('drDrillHeroes', title, new Set(d.prefill.map((a) => a.hero)))}<button class="btn primary" data-dr-answer="${esc(title)}">Submit answer</button>` : `<button class="btn primary" data-dr-go="${esc(title)}">Start the clock</button>`}
        <button class="btn ghost" data-dr-closedrill="${esc(title)}">Close</button></div><span class="msg" id="msg-dr-drill" role="status"></span>
      ${d.attempts.length ? `<div class="tw"><table><thead><tr><th>Player</th><th class="n">Tries</th><th class="n">Accepted answer in time</th><th class="n">In time</th></tr></thead><tbody>${D.drillSummary(d).map((r) => `<tr><td>${esc(r.player)}</td><td class="n">${r.tries}</td><td class="n">${r.good}</td><td class="n">${r.inTime}</td></tr>`).join('')}</tbody></table></div>` : ''}</div>` : '';
    return `${runner}<div class="panel"><h2>Drills</h2>${drills.length ? `<ul class="plain">${drills.map((x) => `<li><b>${esc(x.name)}</b> <span class="note">${esc(x.ask.side)} ${esc(x.ask.action)} · ${x.seconds} s · ${x.attempts.length} answers · accepted: ${esc(x.accept.join(', ') || 'coach judges')}</span> <button type="button" class="btn ghost" data-dr-run="${esc(x.id)}" data-dr-title="${esc(title)}">Run</button></li>`).join('')}</ul>` : '<p class="empty">No drills yet.</p>'}</div>
      <div class="panel"><h2>New drill</h2>${datalist('drDrillAll', title)}
      <div class="grid3"><label class="field" for="drDName">Name<input id="drDName" placeholder="e.g. Answer a Fanny first pick"></label>
        <label class="field" for="drDSide">Our side<select id="drDSide"><option value="blue">Blue</option><option value="red">Red</option></select></label>
        <label class="field" for="drDSec">Seconds<input id="drDSec" type="number" inputmode="numeric" min="5" max="120" value="${D.STEP_SECONDS}"></label></div>
      <label class="field" for="drDPrefill">Draft so far, in draft order (comma separated; leave a ban empty as two commas)<input id="drDPrefill" list="drDrillAll"></label>
      <label class="field" for="drDPrompt">Question for the player<input id="drDPrompt" placeholder="e.g. They took Fanny. What is our first pick?"></label>
      <label class="field" for="drDAccept">Answers the coach accepts (comma separated, optional)<input id="drDAccept"></label>
      <div class="toolbar"><button class="btn primary" data-dr-newdrill="${esc(title)}">Save drill</button><span class="msg" id="msg-dr-newdrill" role="status"></span></div></div>`;
  }

  // ---------------------------------------------------------------- pro games
  function proSection(title) {
    const pro = mine('pro', title); const prev = S.dr.proPreview[title];
    const byEvent = [...pro.reduce((m, g) => m.set(g.event || '—', (m.get(g.event || '—') || 0) + 1), new Map())];
    return `<div class="panel"><h2>Import public pro games</h2>
      <p class="note">One row per game. Columns: <code>${D.PRO_COLUMNS.join(',')}</code>. Heroes in a cell separated by <code>|</code>; <code>winner</code> is blue or red; <code>source</code> is the page you read it from. Public data from Liquipedia is CC BY-SA 3.0: keep the source link. These games never enter our scrim numbers.</p>
      <label class="field" for="drCsv">Paste CSV, or load a file<textarea id="drCsv" rows="5" placeholder="${esc(D.PRO_COLUMNS.join(','))}"></textarea></label>
      <div class="toolbar"><input type="file" id="drCsvFile" accept=".csv,text/csv" data-dr-csvfile="${esc(title)}"><button class="btn" data-dr-check="${esc(title)}">Check</button>${prev?.games.length ? `<button class="btn primary" data-dr-import="${esc(title)}">Import ${prev.games.length} game${prev.games.length > 1 ? 's' : ''}</button>` : ''}<span class="msg" id="msg-dr-pro" role="status"></span></div>
      ${prev ? `${prev.errors.length ? banner('warn', `<div><b>${prev.errors.length} row(s) left out:</b><ul class="plain">${prev.errors.slice(0, 12).map((e) => `<li>${esc(e)}</li>`).join('')}</ul></div>`) : ''}${prev.games.length ? `<p class="note">${prev.games.length} game(s) ready${prev.dupes ? `, ${prev.dupes} already imported (will be replaced)` : ''}.</p>` : ''}` : ''}</div>
      <div class="panel"><h2>Imported — ${esc(title)}</h2>${pro.length ? `<ul class="plain">${byEvent.map(([e, n]) => `<li>${esc(e)}: <b>${n}</b> games</li>`).join('')}</ul>` : '<p class="empty">None yet.</p>'}</div>`;
  }

  // ---------------------------------------------------------------- events
  async function onClick(t) {
    const ds = t.dataset; const title = ds.drTitle || ds.drStart || ds.drLock || ds.drSkip || ds.drUndo || ds.drFinish || ds.drAbandon || ds.drSavebook || ds.drApprove || ds.drRate || ds.drNewdrill || ds.drGo || ds.drAnswer || ds.drClosedrill || ds.drCheck || ds.drImport;
    const heroes = title ? H(title) : null;
    try {
      if (ds.drSection) { S.dr.section[title] = ds.drSection; render(); return true; }
      if (ds.drStart) { S.dr.mock[title] = D.newMock({ title, ourSide: val('drSide'), opponent: val('drOpp'), standInFor: val('drStand'), stepSeconds: val('drSec'), by: val('drBy') }); keepMock(title); render(); startTicker(); return true; }
      if (ds.drLock || ds.drQuick || ds.drSkip) {
        const hero = ds.drSkip ? '' : ds.drQuick || val('drHero');
        if (!ds.drSkip && !String(hero).trim()) throw new Error('Type a hero, or tap one.');
        S.dr.mock[title] = D.applyStep(running(title), hero, { heroes }); keepMock(title); render();
        document.getElementById('drHero')?.focus(); return true;
      }
      if (ds.drUndo) { S.dr.mock[title] = D.undoStep(running(title)); keepMock(title); render(); return true; }
      if (ds.drAbandon) { S.dr.mock[title] = null; keepMock(title); render(); return true; }
      if (ds.drFinish) { const rec = D.finishMock(running(title), { result: val('drResult'), note: val('drNote') }); await put('mocks', rec); S.dr.mock[title] = null; keepMock(title); render(); setMsg('msg-dr-mock', 'Saved.', 'ok'); return true; }
      if (ds.drSavebook) {
        const opp = val('drBookOpp'); const prev = mine('books', title).find((b) => b.opponent === opp) || null;
        const rec = D.saveBook(prev, { bans: val('drBans'), protect: val('drProtect'), flex: val('drFlex'), blue: val('drBlue'), red: val('drRed'), notes: val('drNotes') }, { title, opponent: opp, by: val('drBookBy'), heroes });
        await put('books', rec); render(); setMsg('msg-dr-book', `Saved as version ${rec.version} (draft).`, 'ok'); return true;
      }
      if (ds.drApprove) { const opp = val('drBookOpp'); const b = mine('books', title).find((x) => x.opponent === opp); const rec = D.approveBook(b, { by: val('drApprover'), approvers: approvers(title) }); await put('books', rec); render(); setMsg('msg-dr-book', 'Approved.', 'ok'); return true; }
      if (ds.drPlayer) { S.dr.poolPlayer = { ...(S.dr.poolPlayer || {}), [title]: ds.drPlayer }; render(); return true; }
      if (ds.drSuggest) { const el = document.getElementById('drPoolHero'); if (el) { el.value = ds.drSuggest; el.focus(); } return true; }
      if (ds.drRate || ds.drUnrate) {
        const players = roster(title); const who = S.dr.poolPlayer?.[title] && players.includes(S.dr.poolPlayer[title]) ? S.dr.poolPlayer[title] : players[0];
        const prev = mine('pools', title).find((p) => p.player === who) || null;
        const rec = D.setPoolHero(prev, { title, player: who, hero: ds.drUnrate || val('drPoolHero'), tier: ds.drUnrate ? '' : val('drPoolTier'), by: meName() || 'staff', heroes });
        await put('pools', rec); render(); setMsg('msg-dr-pool', 'Saved.', 'ok'); return true;
      }
      if (ds.drNewdrill) {
        const rec = D.newDrill({ title, name: val('drDName'), ourSide: val('drDSide'), prefill: val('drDPrefill').split(',').map((s) => s.trim()), prompt: val('drDPrompt'), accept: val('drDAccept'), seconds: val('drDSec'), by: meName() || 'staff', heroes });
        await put('drills', rec); render(); setMsg('msg-dr-newdrill', 'Saved.', 'ok'); return true;
      }
      if (ds.drRun) { S.dr.drill[title] = { id: ds.drRun, startedAt: '' }; render(); return true; }
      if (ds.drGo) { S.dr.drill[title] = { ...S.dr.drill[title], startedAt: new Date().toISOString() }; render(); startTicker(); document.getElementById('drDrillHero')?.focus(); return true; }
      if (ds.drClosedrill) { S.dr.drill[title] = null; render(); return true; }
      if (ds.drAnswer) {
        const run = S.dr.drill[title]; const d = mine('drills', title).find((x) => x.id === run.id);
        const seconds = Math.round((Date.now() - new Date(run.startedAt)) / 1000);
        const rec = D.recordAttempt(d, { player: val('drDrillPlayer'), hero: val('drDrillHero'), seconds, by: meName() || 'staff', heroes });
        await put('drills', rec); S.dr.drill[title] = { id: d.id, startedAt: '' }; render();
        const a = rec.attempts.at(-1); setMsg('msg-dr-drill', `${a.hero || 'No answer'} in ${a.seconds} s: ${a.accepted ? 'an accepted answer' : 'not on the accepted list (coach judges)'}${a.inTime ? '' : ', over time'}.`, a.accepted && a.inTime ? 'ok' : ''); return true;
      }
      if (ds.drCheck) {
        const r = D.parseProCsv(val('drCsv'), { title, heroes, by: meName() || 'staff' });
        const have = new Set(mine('pro', title).map((g) => g.id)); S.dr.proPreview[title] = { ...r, dupes: r.games.filter((g) => have.has(g.id)).length }; render(); return true;
      }
      if (ds.drImport) { const p = S.dr.proPreview[title]; for (const g of p.games) await put('pro', g); S.dr.proPreview[title] = null; render(); setMsg('msg-dr-pro', `Imported ${p.games.length} game(s).`, 'ok'); return true; }
    } catch (e) {
      const where = ds.drSavebook || ds.drApprove ? 'msg-dr-book' : ds.drRate || ds.drUnrate ? 'msg-dr-pool' : ds.drNewdrill ? 'msg-dr-newdrill' : ds.drAnswer || ds.drGo ? 'msg-dr-drill' : ds.drCheck || ds.drImport ? 'msg-dr-pro' : 'msg-dr-mock';
      setMsg(where, e.message, 'err'); return true;
    }
    return false;
  }
  async function onChange(e) {
    const t = e.target;
    if (t.dataset.drBookopp) { S.dr.bookOpp = { ...(S.dr.bookOpp || {}), [t.dataset.drBookopp]: t.value }; render(); return true; }
    if (t.dataset.drCsvfile && t.files?.[0]) {
      const text = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => rej(r.error); r.readAsText(t.files[0]); });
      const el = document.getElementById('drCsv'); if (el) el.value = text; return true;
    }
    return false;
  }
  function onKey(e) {
    if (e.key === 'Enter' && e.target.id === 'drHero') { e.preventDefault(); document.querySelector('[data-dr-lock]')?.click(); return true; }
    if (e.key === 'Enter' && e.target.id === 'drDrillHero') { e.preventDefault(); document.querySelector('[data-dr-answer]')?.click(); return true; }
    return false;
  }
  function subscribe(db) {
    for (const [k, c] of Object.entries(COLL)) db.collection(c).onSnapshot((snap) => { S[`dr_${k}`] = snap.docs.map((x) => x.data()).filter((x) => x?.origin === 'operational'); render(); }, () => {});
  }
  // For the opponent card and the runbook: the approved (or latest) book for an opponent.
  function bookFor(title, opponent) {
    const b = mine('books', title).find((x) => x.opponent === opponent);
    return b ? { status: b.status, version: b.version, approvedBy: b.approvedBy, bans: b.bans, protect: b.protect, flex: b.flex, blue: b.blue, red: b.red } : null;
  }
  return { page, onClick, onChange, onKey, subscribe, bookFor, startTicker };
}
