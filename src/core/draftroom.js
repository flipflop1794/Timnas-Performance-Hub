// Draft Room (V1.14): the hub's own MLBB draft tools for MLBB and MLBB Women. Built inside the hub; it
// does not use or copy any outside draft tool. Five parts, all stored per title with title-scoped access:
//   hero pools   per player, the coach's rating of each hero (main / can play / learning), with
//                suggestions from confirmed scrim games;
//   draft books  per opponent: bans, heroes to protect, flex picks, plans per side; versioned, approved;
//   mock drafts  a timed draft in tournament order, logged with the time each step took;
//   patterns     numbers from our confirmed scrim drafts and mock drafts, and (kept apart, labelled)
//                public pro games the staff import;
//   drills       a draft situation, a question, the answers the coach accepts and a time limit.

// Tournament draft with 10 bans, as used in MPL: 3 bans each, picks 1-2-2-1, 2 bans each, picks 1-2-1.
// Blue opens. IESF has not published the WEC draft rules (decision log: pending), so this is the
// default and can be replaced per title in the hub's rules.
export const MPL_ORDER = [
  ...['blue', 'red', 'blue', 'red', 'blue', 'red'].map((side) => ({ side, action: 'ban', phase: 1 })),
  ...['blue', 'red', 'red', 'blue', 'blue', 'red'].map((side) => ({ side, action: 'pick', phase: 1 })),
  ...['red', 'blue', 'red', 'blue'].map((side) => ({ side, action: 'ban', phase: 2 })),
  ...['red', 'blue', 'blue', 'red'].map((side) => ({ side, action: 'pick', phase: 2 })),
];
export const ORDER_NOTE = 'MPL order (10 bans). WEC draft rules not published yet: confirm with PB ESI before 15 Dec.';
export const STEP_SECONDS = 30;
export const DRAFT_TITLES = ['MLBB', 'MLBB Women'];
export const TIERS = ['main', 'can', 'learning'];
export const TIER_LABEL = { main: 'Main', can: 'Can play', learning: 'Learning' };
export const MIN_N = 5; // same bar as scrim patterns

const need = (c, m) => { if (!c) throw new Error(m); };
const clean = (s, max = 400) => String(s ?? '').trim().slice(0, max);
const uid = (p) => `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
const other = (side) => (side === 'blue' ? 'red' : 'blue');

// ---------------------------------------------------------------- mock drafts
export function newMock({ title, ourSide, opponent = '', standInFor = '', by, stepSeconds = STEP_SECONDS, order = MPL_ORDER, now = new Date() }) {
  need(DRAFT_TITLES.includes(title), 'The Draft Room is for MLBB and MLBB Women.');
  need(['blue', 'red'].includes(ourSide), 'Choose our side (blue or red).');
  need(clean(by), 'Who is running the draft?');
  const s = Number(stepSeconds); need(Number.isFinite(s) && s >= 10 && s <= 120, 'Time per step: 10 to 120 seconds.');
  return { id: uid('MD'), title, ourSide, opponent: clean(opponent, 80), standInFor: clean(standInFor, 80), by: clean(by, 80), stepSeconds: s,
    order: order.map((x) => ({ ...x })), actions: [], startedAt: now.toISOString(), stepStartedAt: now.toISOString(), status: 'running', origin: 'operational' };
}

export function mockState(m) {
  const bans = { blue: [], red: [] }; const picks = { blue: [], red: [] };
  for (const a of m.actions) (a.action === 'ban' ? bans : picks)[a.side].push(a.hero);
  const used = new Set(m.actions.map((a) => a.hero).filter(Boolean));
  const next = m.order[m.actions.length] || null;
  return { step: m.actions.length, total: m.order.length, next, done: !next, bans, picks, used, team: next ? (next.side === m.ourSide ? 'ours' : 'theirs') : null };
}

// hero '' = the step ran out of time with nothing chosen (a lost ban; a pick cannot be skipped).
export function applyStep(m, hero, { heroes, now = new Date() }) {
  need(m.status === 'running', 'This draft is finished.');
  const st = mockState(m); need(st.next, 'The draft is complete.');
  const name = hero ? heroes.find(hero) : '';
  if (hero) need(name, `"${hero}" is not a hero in the list.`);
  need(name || st.next.action === 'ban', 'A pick cannot be skipped: choose a hero.');
  if (name) need(!st.used.has(name), `${name} is already banned or picked.`);
  const seconds = Math.max(0, Math.round((now - new Date(m.stepStartedAt)) / 1000));
  return { ...m, actions: [...m.actions, { ...st.next, hero: name, seconds, over: seconds > m.stepSeconds }], stepStartedAt: now.toISOString() };
}
export function undoStep(m, { now = new Date() } = {}) {
  need(m.status === 'running' && m.actions.length, 'Nothing to undo.');
  return { ...m, actions: m.actions.slice(0, -1), stepStartedAt: now.toISOString() };
}
export function finishMock(m, { result = '', note = '', now = new Date() } = {}) {
  need(mockState(m).done, 'Finish every step first (or undo to change one).');
  need(['', 'win', 'loss', 'not played'].includes(result), 'Result: win, loss, not played, or leave blank.');
  const over = m.actions.filter((a) => a.over).length;
  return { ...m, status: 'done', result, note: clean(note, 600), finishedAt: now.toISOString(), overSteps: over,
    avgSeconds: Math.round(m.actions.reduce((s, a) => s + a.seconds, 0) / m.actions.length) };
}

// ---------------------------------------------------------------- hero pools
export function setPoolHero(pool, { title, player, hero, tier, by, heroes, now = new Date() }) {
  need(DRAFT_TITLES.includes(title), 'Hero pools are for MLBB and MLBB Women.');
  need(clean(player), 'Choose a player.');
  const name = heroes.find(hero); need(name, `"${hero}" is not a hero in the list.`);
  need(tier === '' || TIERS.includes(tier), 'Rating: main, can play or learning.');
  need(clean(by), 'Who is rating?');
  const base = pool || { id: `pool-${title}-${player}`.replace(/\s+/g, '_'), title, player: clean(player, 60), heroes: {}, origin: 'operational' };
  const heroesNext = { ...base.heroes };
  if (tier) heroesNext[name] = { tier, by: clean(by, 80), at: now.toISOString() }; else delete heroesNext[name];
  return { ...base, heroes: heroesNext, updatedBy: clean(by, 80), updatedAt: now.toISOString() };
}
// Heroes a player has used in confirmed scrim games, most games first, with wins. Suggestions only:
// the coach sets the rating.
export function poolSuggestions(games, player, pool = null) {
  const m = new Map();
  for (const g of games) for (const p of g.players || []) if (p.team === 'ours' && p.player === player && p.hero) {
    const r = m.get(p.hero) || { hero: p.hero, games: 0, wins: 0 }; r.games++; if (g.result === 'win') r.wins++; m.set(p.hero, r);
  }
  return [...m.values()].map((r) => ({ ...r, rated: pool?.heroes?.[r.hero]?.tier || '' })).sort((a, b) => b.games - a.games || a.hero.localeCompare(b.hero));
}

// ---------------------------------------------------------------- draft books
const list = (xs, heroes, what) => {
  const out = [];
  for (const x of (Array.isArray(xs) ? xs : String(xs || '').split(/[,;\n]/)).map((s) => clean(s, 40)).filter(Boolean)) {
    const n = heroes.find(x); need(n, `${what}: "${x}" is not a hero in the list.`);
    if (!out.includes(n)) out.push(n);
  }
  return out;
};
export function saveBook(prev, fields, { title, opponent, by, heroes, now = new Date() }) {
  need(DRAFT_TITLES.includes(title), 'Draft books are for MLBB and MLBB Women.');
  need(clean(opponent), 'Choose the opponent (a WEC nation, or a scrim partner).');
  need(clean(by), 'Who is writing?');
  const v = {
    bans: list(fields.bans, heroes, 'Bans'), protect: list(fields.protect, heroes, 'Protect'), flex: list(fields.flex, heroes, 'Flex picks'),
    blue: clean(fields.blue, 600), red: clean(fields.red, 600), notes: clean(fields.notes, 1000),
  };
  need(v.bans.length <= 10, 'At most 10 heroes on the ban list.');
  const clash = v.bans.find((h) => v.protect.includes(h)); need(!clash, `${clash} is on both the ban list and the protect list.`);
  need(v.bans.length || v.protect.length || v.flex.length || v.blue || v.red, 'Add at least one ban, protect, flex pick or side plan.');
  const version = (prev?.version || 0) + 1;
  const history = prev ? [...(prev.history || []), { version: prev.version, by: prev.updatedBy, at: prev.updatedAt, bans: prev.bans, protect: prev.protect, flex: prev.flex, status: prev.status }].slice(-20) : [];
  return { id: prev?.id || `book-${title}-${opponent}`.replace(/\s+/g, '_'), title, opponent: clean(opponent, 80), ...v, version, history,
    status: 'draft', approvedBy: '', approvedAt: '', updatedBy: clean(by, 80), updatedAt: now.toISOString(), origin: 'operational' };
}
// approvers: names allowed to approve for this title (focus owner, title coach, Head Coach).
export function approveBook(book, { by, approvers = [], now = new Date() }) {
  need(book && book.status === 'draft', 'Only a draft version can be approved.');
  need(approvers.includes(by), `Approval for ${book.title} is by ${approvers.join(' or ') || 'the focus owner or title coach'}.`);
  need(by !== book.updatedBy, 'Ask another coach to approve: the writer of this version cannot approve it.');
  return { ...book, status: 'approved', approvedBy: by, approvedAt: now.toISOString() };
}

// ---------------------------------------------------------------- public pro games
// CSV header: date,event,blue,red,winner,blue_bans,red_bans,blue_picks,red_picks,source
// Heroes within a cell separated by "|". winner is "blue" or "red". source: link to the page read.
export const PRO_COLUMNS = ['date', 'event', 'blue', 'red', 'winner', 'blue_bans', 'red_bans', 'blue_picks', 'red_picks', 'source'];
function csvRows(text) {
  const rows = []; let row = []; let cell = ''; let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; continue; }
    if (c === '"') q = true; else if (c === ',') { row.push(cell); cell = ''; } else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; } else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim()));
}
export function parseProCsv(text, { title, heroes, by, now = new Date() }) {
  need(DRAFT_TITLES.includes(title), 'Pro games are for MLBB and MLBB Women.');
  const rows = csvRows(String(text || ''));
  need(rows.length >= 2, 'The file needs a header row and at least one game.');
  const head = rows[0].map((h) => h.trim().toLowerCase());
  const miss = PRO_COLUMNS.filter((c) => c !== 'source' && !head.includes(c));
  need(!miss.length, `Missing column(s): ${miss.join(', ')}.`);
  const col = (r, c) => clean(r[head.indexOf(c)] ?? '', 300);
  const games = []; const errors = [];
  rows.slice(1).forEach((r, i) => {
    const line = i + 2;
    try {
      const date = col(r, 'date'); need(/^\d{4}-\d{2}-\d{2}$/.test(date), 'date must be YYYY-MM-DD');
      const winner = col(r, 'winner').toLowerCase(); need(['blue', 'red'].includes(winner), 'winner must be blue or red');
      const blue = col(r, 'blue'); const red = col(r, 'red'); need(blue && red && blue !== red, 'two different team names needed');
      const hs = (c, n, exact) => { const xs = col(r, c).split('|').map((s) => s.trim()).filter(Boolean).map((x) => { const h = heroes.find(x); need(h, `unknown hero "${x}" in ${c}`); return h; });
        need(exact ? xs.length === n : xs.length <= n, `${c} needs ${exact ? '' : 'at most '}${n} heroes (has ${xs.length})`); return xs; };
      const g = { blueBans: hs('blue_bans', 5, false), redBans: hs('red_bans', 5, false), bluePicks: hs('blue_picks', 5, true), redPicks: hs('red_picks', 5, true) };
      const all = [...g.blueBans, ...g.redBans, ...g.bluePicks, ...g.redPicks]; need(new Set(all).size === all.length, 'a hero appears twice in one game');
      const source = col(r, 'source');
      games.push({ id: `pro-${title}-${date}-${blue}-${red}-${games.filter((x) => x.date === date && x.blue === blue && x.red === red).length + 1}`.replace(/[^\w-]+/g, '_').slice(0, 190),
        title, date, event: col(r, 'event'), blue, red, winner, ...g, source, kind: 'public pro', importedBy: clean(by, 80), importedAt: now.toISOString(), origin: 'operational' });
    } catch (e) { errors.push(`Line ${line}: ${e.message}.`); }
  });
  return { games, errors };
}

// ---------------------------------------------------------------- patterns
const count = (xs) => { const m = new Map(); for (const x of xs) m.set(x, (m.get(x) || 0) + 1); return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])); };
// Our side of things: from confirmed scrim games that have a draft, and finished mock drafts.
export function ourDraftFacts({ games = [], mocks = [] }) {
  const drafted = games.filter((g) => (g.draft || []).length);
  const bansVs = count(drafted.flatMap((g) => g.draft.filter((a) => a.action === 'ban' && a.team === 'partner').map((a) => a.hero)));
  const ourBans = count(drafted.flatMap((g) => g.draft.filter((a) => a.action === 'ban' && a.team === 'ours').map((a) => a.hero)));
  const firstPicks = count(drafted.map((g) => g.draft.find((a) => a.action === 'pick' && a.team === 'ours')?.hero).filter(Boolean));
  const picks = new Map();
  for (const g of games) for (const p of g.players || []) if (p.team === 'ours' && p.hero) { const r = picks.get(p.hero) || { hero: p.hero, n: 0, won: 0 }; r.n++; if (g.result === 'win') r.won++; picks.set(p.hero, r); }
  const done = mocks.filter((m) => m.status === 'done');
  const mockOver = done.reduce((s, m) => s + (m.overSteps || 0), 0);
  return {
    games: games.length, drafted: drafted.length,
    bansAgainstUs: bansVs.slice(0, 8).map(([hero, n]) => ({ hero, n, of: drafted.length })),
    ourBans: ourBans.slice(0, 8).map(([hero, n]) => ({ hero, n, of: drafted.length })),
    firstPicks: firstPicks.slice(0, 5).map(([hero, n]) => ({ hero, n, of: drafted.length })),
    heroes: [...picks.values()].sort((a, b) => b.n - a.n).slice(0, 12).map((r) => ({ ...r, lowSample: r.n < MIN_N })),
    mocks: done.length, mockOverSteps: mockOver, mockAvgSeconds: done.length ? Math.round(done.reduce((s, m) => s + m.avgSeconds, 0) / done.length) : null,
    lowSample: drafted.length < MIN_N,
  };
}
// Public pro games: hero priority (share of games where the hero was picked or banned), win rate when
// picked (only shown from MIN_N picks), and side win rates. Never mixed into our numbers.
export function proFacts(pro = []) {
  const n = pro.length; const pres = new Map();
  const bump = (h, k, won) => { const r = pres.get(h) || { hero: h, picked: 0, banned: 0, won: 0 }; r[k]++; if (won) r.won++; pres.set(h, r); };
  for (const g of pro) {
    for (const h of [...g.blueBans, ...g.redBans]) bump(h, 'banned', false);
    for (const h of g.bluePicks) bump(h, 'picked', g.winner === 'blue');
    for (const h of g.redPicks) bump(h, 'picked', g.winner === 'red');
  }
  const priority = [...pres.values()].map((r) => ({ ...r, presence: n ? (r.picked + r.banned) / n : 0, winRate: r.picked >= MIN_N ? r.won / r.picked : null }))
    .sort((a, b) => b.presence - a.presence || a.hero.localeCompare(b.hero));
  const blueWins = pro.filter((g) => g.winner === 'blue').length;
  const events = [...new Set(pro.map((g) => g.event).filter(Boolean))];
  const dates = pro.map((g) => g.date).sort();
  return { games: n, priority: priority.slice(0, 20), blueWinRate: n ? blueWins / n : null, events, from: dates[0] || '', to: dates.at(-1) || '', lowSample: n < MIN_N };
}
// High-priority pro heroes (picked or banned in at least `share` of games) that no player of ours rates
// main or can play: either a likely ban for us, or a hero to learn. A question for the coach, not a verdict.
export function poolGaps(pro, pools, { share = 0.4 } = {}) {
  const f = proFacts(pro); if (f.games < MIN_N) return [];
  const covered = new Set(pools.flatMap((p) => Object.entries(p.heroes || {}).filter(([, v]) => v.tier === 'main' || v.tier === 'can').map(([h]) => h)));
  return f.priority.filter((r) => r.presence >= share && !covered.has(r.hero)).map((r) => ({ hero: r.hero, presence: r.presence, games: f.games }));
}

// ---------------------------------------------------------------- drills
export function newDrill({ title, name, ourSide, prefill = [], prompt, accept = [], seconds = STEP_SECONDS, by, heroes, order = MPL_ORDER }) {
  need(DRAFT_TITLES.includes(title), 'Drills are for MLBB and MLBB Women.');
  need(clean(name), 'Name the drill.'); need(clean(prompt), 'Write the question the player answers.'); need(clean(by), 'Who wrote it?');
  need(['blue', 'red'].includes(ourSide), 'Choose our side.');
  const s = Number(seconds); need(Number.isFinite(s) && s >= 5 && s <= 120, 'Time limit: 5 to 120 seconds.');
  let m = { ...newMock({ title, ourSide, by, order }), stepSeconds: s };
  // In draft order; an empty entry is a ban lost to the clock. Trailing empties are ignored.
  const steps = (Array.isArray(prefill) ? prefill : String(prefill || '').split(',')).map((x) => clean(x, 40));
  while (steps.length && !steps.at(-1)) steps.pop();
  for (const h of steps) m = applyStep(m, h, { heroes });
  const st = mockState(m); need(st.next, 'The draft so far fills every step: leave at least one step for the question.');
  return { id: uid('DR'), title, name: clean(name, 80), ourSide, prefill: m.actions.map(({ side, action, hero }) => ({ side, action, hero })), ask: st.next,
    prompt: clean(prompt, 400), accept: list(accept, heroes, 'Accepted answers').filter((h) => !st.used.has(h)), seconds: s, by: clean(by, 80), attempts: [], origin: 'operational' };
}
export function recordAttempt(drill, { player, hero, seconds, by, heroes, now = new Date() }) {
  need(clean(player), 'Who answered?');
  const h = hero ? heroes.find(hero) : ''; if (hero) need(h, `"${hero}" is not a hero in the list.`);
  need(!h || !drill.prefill.some((a) => a.hero === h), `${h} is already banned or picked in this drill.`);
  const s = Math.max(0, Math.round(Number(seconds) || 0));
  const inTime = !!h && s <= drill.seconds;
  const accepted = !!h && drill.accept.includes(h);
  const a = { player: clean(player, 60), hero: h, seconds: s, inTime, accepted, by: clean(by, 80), at: now.toISOString() };
  return { ...drill, attempts: [...drill.attempts, a].slice(-100) };
}
export function drillSummary(drill) {
  const per = new Map();
  for (const a of drill.attempts) { const r = per.get(a.player) || { player: a.player, tries: 0, good: 0, inTime: 0 }; r.tries++; if (a.accepted && a.inTime) r.good++; if (a.inTime) r.inTime++; per.set(a.player, r); }
  return [...per.values()].sort((a, b) => a.player.localeCompare(b.player));
}

export { other as otherSide };
