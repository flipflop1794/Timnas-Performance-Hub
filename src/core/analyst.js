// V1.24 helpers for coaches and analysts, computed only from the hub's own records (confirmed games, scrim
// reports, weakness labels, the partner bank, sessions). Nothing is predicted or scored; every line says what it
// is compared with, and small samples are left out rather than guessed.
import { STAT_DEFS, latestGames, durationText } from './capture.js';
import { tagsOf, weaknessCounts } from './weakness.js';
import { FIELDS } from './competitors.js';
import { REPORT_TITLES, resultText } from './reports.js';
import { hasContactNumber } from './pii.js';
import { localDay, shiftDay } from './dates.js';

const need = (c, m) => { if (!c) throw new Error(m); };
const lc = (s) => String(s || '').trim().toLowerCase();
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);

// ---------- 5. Game breakdown draft for the analyst ----------
// Each of our players is compared with their own usual level: the median of their earlier confirmed games
// (at least BASE_MIN). A stat FLAG_PCT % or more away from it is a stand-out; better or worse follows the stat.
export const BASE_MIN = 3;
export const FLAG_PCT = 30;
export function gameBreakdown(game, games) {
  const defs = (STAT_DEFS[game.game] || []).filter((d) => d.trail && d.higher != null);
  const earlier = latestGames(games).filter((g) => g.title === game.title && g.id !== game.id
    && (g.date < game.date || (g.date === game.date && String(g.createdAt) < String(game.createdAt))));
  const players = game.players.filter((p) => p.team === 'ours').map((p) => {
    const hist = p.player && p.player !== 'stand-in' ? earlier.flatMap((g) => g.players.filter((x) => x.team === 'ours' && x.player === p.player)) : [];
    const flags = [];
    for (const d of defs) {
      const vals = hist.map((x) => x.stats?.[d.key]).filter((v) => Number.isFinite(v));
      const v = p.stats?.[d.key];
      if (vals.length < BASE_MIN || !Number.isFinite(v)) continue;
      const med = median(vals); if (!med) continue;
      const pct = Math.round(((v - med) / med) * 100);
      if (Math.abs(pct) >= FLAG_PCT) flags.push({ stat: d.label, key: d.key, value: v, usual: Math.round(med * 10) / 10, pct, better: (pct > 0) === d.higher, n: vals.length });
    }
    flags.sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct));
    const s = p.stats || {};
    return { player: p.player || p.nameSeen || '—', hero: p.hero, kda: `${s.kills ?? '—'}/${s.deaths ?? '—'}/${s.assists ?? '—'}`, baseN: hist.length, flags };
  });
  const pick = (team, action) => (game.draft || []).filter((a) => a.team === team && a.action === action).map((a) => a.hero);
  const durs = earlier.map((g) => g.durationS).filter((v) => Number.isFinite(v));
  return {
    id: game.id, title: game.title, date: game.date, partner: game.partner, gameNo: game.gameNo, reportId: game.reportId, result: game.result,
    duration: durationText(game.durationS), usualDuration: durs.length >= BASE_MIN ? durationText(Math.round(median(durs))) : null,
    side: game.mapSide || game.ourSide, draft: game.draft?.length ? { ourPicks: pick('ours', 'pick'), ourBans: pick('ours', 'ban'), theirPicks: pick('partner', 'pick'), theirBans: pick('partner', 'ban'), firstPick: game.firstPick } : null,
    players, flagged: players.reduce((a, p) => a + p.flags.length, 0),
  };
}
// Plain text the analyst edits and adds to the scrim report (as a follow-up note: the report itself never changes).
export function breakdownText(b, lang = 'en') {
  const id = lang === 'id';
  const L = [];
  L.push(`${id ? 'Game' : 'Game'} ${b.gameNo} vs ${b.partner || '—'} (${b.date}): ${id ? (b.result === 'win' ? 'menang' : 'kalah') : b.result}, ${b.duration}${b.usualDuration ? ` (${id ? 'biasanya' : 'usual'} ${b.usualDuration})` : ''}${b.side ? `, ${b.side}` : ''}.`);
  if (b.draft) L.push(`Draft: ${id ? 'kita' : 'ours'} ${b.draft.ourPicks.join(', ') || '—'}${b.draft.ourBans.length ? ` · ban ${b.draft.ourBans.join(', ')}` : ''}; ${id ? 'lawan' : 'theirs'} ${b.draft.theirPicks.join(', ') || '—'}${b.draft.theirBans.length ? ` · ban ${b.draft.theirBans.join(', ')}` : ''}.`);
  const out = b.players.filter((p) => p.flags.length);
  if (out.length) {
    L.push(id ? 'Menonjol dibanding level biasa tiap pemain (median game terkonfirmasi sebelumnya):' : "Stand-outs against each player's usual level (median of earlier confirmed games):");
    for (const p of out) for (const f of p.flags.slice(0, 2)) L.push(`- ${p.player} (${p.hero}): ${f.stat} ${f.value} ${id ? 'vs biasanya' : 'vs usual'} ${f.usual} (${f.pct > 0 ? '+' : ''}${f.pct}%), ${f.better ? (id ? 'lebih baik' : 'better') : (id ? 'lebih buruk' : 'worse')}.`);
  } else L.push(id ? 'Tidak ada angka yang menonjol dibanding level biasa pemain (atau riwayat belum cukup).' : "No stat stands out against the players' usual level (or not enough history yet).");
  L.push(id ? 'Catatan analis:' : 'Analyst notes:');
  return L.join('\n');
}

// ---------- 6. Our own VOD review: timestamped marks, grouped into recurring themes ----------
// Kept in the VOD library with kind "own" (no nation), so the rival VOD pages never show them.
const TIME = /^(\d{1,2}:)?\d{1,2}:\d{2}$/;
export const toSeconds = (t) => String(t).split(':').map(Number).reduce((a, x) => a * 60 + x, 0);
export function ownVod(x) {
  need(REPORT_TITLES.includes(x.title), 'Pick a title.');
  need(/^https?:\/\/\S+$/.test((x.url || '').trim()), 'A full video link (https://…) is required.');
  need(x.event && x.event.trim(), 'Say which game it is (e.g. "Scrim vs Team X, game 2").');
  need(/^\d{4}-\d{2}-\d{2}$/.test(x.date || ''), 'Date is required (YYYY-MM-DD).');
  need(x.by && x.by.trim(), 'Who added it is required.');
  return { id: `OV-${x.date.replace(/-/g, '')}-${Math.random().toString(36).slice(2, 7)}`, kind: 'own', title: x.title, nation: '', url: x.url.trim(), event: x.event.trim(), date: x.date,
    reportId: x.reportId || '', marks: [], by: x.by.trim(), reviewed: false, origin: 'operational', added: localDay() };
}
export function addMark(v, x) {
  need(TIME.test(String(x.t || '').trim()), 'Time must look like 12:30 (or 1:02:30).');
  need(tagsOf(v.title).includes(x.tag), 'Pick a label from the list.');
  need(x.player && x.player.trim(), 'Pick the player (or Team).');
  const note = String(x.note || '').trim();
  need(note, 'Write what happened at that moment.');
  need(note.length <= 240, 'Keep a mark short (240 characters at most).');
  need(!hasContactNumber(note), 'Remove phone or ID numbers; performance notes only.');
  need(x.by && x.by.trim(), 'Who marked it is required.');
  return { ...v, marks: [...(v.marks || []), { t: String(x.t).trim(), player: x.player.trim(), tag: x.tag, note, by: x.by.trim(), at: new Date().toISOString() }] };
}
// A link that opens the video at the mark (YouTube and Twitch understand t=).
export function clipUrl(url, t) {
  const s = toSeconds(t);
  try { const u = new URL(url); if (/youtu\.?be|youtube\.com|twitch\.tv/.test(u.hostname)) { u.searchParams.set('t', /twitch/.test(u.hostname) ? `${s}s` : String(s)); return u.toString(); } } catch { /* not a URL */ }
  return url;
}
// Recurring themes: the same label for the same player (or the team) marked THEME_AT+ times in at least two
// different games within the window.
export const THEME_AT = 3;
export function vodThemes(vods, title, asOf = localDay(), days = 28) {
  const from = shiftDay(asOf, -(days - 1));
  const mine = vods.filter((v) => v.kind === 'own' && v.title === title && v.date >= from && v.date <= asOf);
  const groups = {};
  for (const v of mine) for (const m of v.marks || []) {
    const k = `${m.player}|${m.tag}`;
    const g = (groups[k] ||= { player: m.player, tag: m.tag, n: 0, vods: new Set(), clips: [] });
    g.n++; g.vods.add(v.id); g.clips.push({ url: clipUrl(v.url, m.t), t: m.t, note: m.note, event: v.event, date: v.date });
  }
  return Object.values(groups).map((g) => ({ ...g, games: g.vods.size, vods: undefined, recurring: g.n >= THEME_AT && g.vods.size >= 2,
    clips: g.clips.sort((a, b) => b.date.localeCompare(a.date)) }))
    .sort((a, b) => Number(b.recurring) - Number(a.recurring) || b.n - a.n || a.player.localeCompare(b.player));
}

// ---------- 7. Sparring partner plan ----------
// From scrim reports and the partner bank: how we do against each partner, and up to five suggestions, each
// with its reason: re-test a recurring weakness against the partner that exposed it, keep a stand-in for every
// rival the staff rate, keep enough sessions against Tier 1, and do not let Tier 1 contacts go cold.
export const STANDIN_DAYS = 14;
export const IDLE_DAYS = 21;
const TOP = ['Tier 1 international', 'Tier 1 domestic'];
export function partnerPlan(title, { partners = [], reports = [], wtags = [], tiers = {}, scrims = [], asOf = localDay() } = {}) {
  const bank = partners.filter((p) => p.title === title);
  const reps = reports.filter((r) => r.title === title);
  const tagsOfReport = Object.fromEntries(wtags.filter((t) => t.title === title).map((t) => [t.reportId, t.tags || []]));
  const statFor = (name) => {
    const rs = reps.filter((r) => lc(r.partner) === lc(name));
    const wl = rs.filter((r) => r.result?.mode === 'wl');
    const won = wl.reduce((a, r) => a + r.result.won, 0); const lost = wl.reduce((a, r) => a + r.result.lost, 0);
    const pts = rs.filter((r) => r.result?.mode === 'points');
    const labels = {}; for (const r of rs) for (const t of tagsOfReport[r.id] || []) labels[t] = (labels[t] || 0) + 1;
    const last = rs.map((r) => r.date).sort().at(-1) || null;
    return { sessions: rs.length, won, lost, points: pts.reduce((a, r) => a + r.result.points, 0), matches: pts.reduce((a, r) => a + r.result.played, 0),
      progress: rs.length ? Math.round((rs.reduce((a, r) => a + Number(r.progress || 0), 0) / rs.length) * 10) / 10 : null, last, idle: last ? daysBetween(last, asOf) : null, labels };
  };
  const rows = bank.map((p) => ({ name: p.name, level: p.level, resembles: p.resembles || '', ...statFor(p.name) }))
    .sort((a, b) => (b.last || '').localeCompare(a.last || '') || a.name.localeCompare(b.name));
  const unbanked = [...new Set(reps.map((r) => r.partner).filter((n) => n && lc(n) !== 'internal' && !bank.some((p) => lc(p.name) === lc(n))))];
  const out = [];
  // a) recurring weaknesses
  for (const w of weaknessCounts(wtags, title, asOf, 14).filter((x) => x.flagged)) {
    const best = rows.filter((r) => r.labels[w.tag]).sort((a, b) => b.labels[w.tag] - a.labels[w.tag])[0];
    if (best) out.push({ kind: 'weakness', partner: best.name, text: `Re-test "${w.tag}" against ${best.name}: it showed up in ${best.labels[w.tag]} of ${best.sessions} reports against them.` });
  }
  // b) stand-ins for rated rivals
  const rated = (FIELDS[title] || []).filter((n) => ['main threat', 'contender'].includes(tiers[`${title}|${n}`]?.tier));
  for (const nation of rated) {
    const like = bank.filter((p) => p.resembles === nation);
    const lastStandIn = scrims.filter((s) => s.title === title && s.mirrors === nation && s.status === 'done').map((s) => s.date).sort().at(-1);
    if (!like.length) out.push({ kind: 'standin-missing', nation, text: `No partner in the bank plays like ${nation} (rated ${tiers[`${title}|${nation}`].tier}): add one.` });
    else if (!lastStandIn || daysBetween(lastStandIn, asOf) > STANDIN_DAYS) out.push({ kind: 'standin', nation, partner: like[0].name, text: `Book ${like[0].name} as a stand-in for ${nation}: ${lastStandIn ? `last stand-in scrim ${lastStandIn}` : 'no stand-in scrim yet'}.` });
  }
  // c) level mix over 14 days
  const recent = reps.filter((r) => daysBetween(r.date, asOf) < 14);
  const levelOf = (r) => r.partnerLevel || bank.find((p) => lc(p.name) === lc(r.partner))?.level || '';
  const top = recent.filter((r) => TOP.includes(levelOf(r))).length;
  const topBank = rows.filter((r) => TOP.includes(r.level));
  if (recent.length >= 4 && top / recent.length < 0.3 && topBank.length) out.push({ kind: 'level', text: `Only ${top} of ${recent.length} sessions in 14 days were against Tier 1 partners: book ${topBank.slice(0, 2).map((r) => r.name).join(' or ')}.` });
  // d) Tier 1 contacts going cold
  for (const r of topBank.filter((x) => x.idle != null && x.idle >= IDLE_DAYS)) out.push({ kind: 'idle', partner: r.name, text: `${r.name} (${r.level}) last played ${r.idle} days ago: keep the contact warm.` });
  return { title, rows, unbanked, suggestions: out.slice(0, 5) };
}

// ---------- 8. End-of-day summary for coaches ----------
// Only today's records: sessions, reports, results, "Did we fix it?" answers, labels; and up to three
// priorities for tomorrow, each traceable to a record.
export function daySummary(titles, date, { reports = [], scrims = [], wtags = [] } = {}) {
  return titles.map((title) => {
    const reps = reports.filter((r) => r.title === title && r.date === date).sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
    const planned = scrims.filter((s) => s.title === title && s.date === date);
    const notLogged = planned.filter((s) => s.status === 'planned');
    const wl = reps.filter((r) => r.result?.mode === 'wl'); const pts = reps.filter((r) => r.result?.mode === 'points');
    const result = wl.length ? resultText({ mode: 'wl', won: wl.reduce((a, r) => a + r.result.won, 0), lost: wl.reduce((a, r) => a + r.result.lost, 0), drawn: wl.reduce((a, r) => a + r.result.drawn, 0) })
      : pts.length ? resultText({ mode: 'points', points: pts.reduce((a, r) => a + r.result.points, 0), played: pts.reduce((a, r) => a + r.result.played, 0), avgPlacement: null, wins: 0 }) : null;
    const fix = {}; for (const r of reps) if (r.fixCheck) fix[r.fixCheck] = (fix[r.fixCheck] || 0) + 1;
    const todayTags = {}; for (const t of wtags.filter((x) => x.title === title && x.date === date)) for (const g of t.tags || []) todayTags[g] = (todayTags[g] || 0) + 1;
    const flagged = new Set(weaknessCounts(wtags, title, date, 14).filter((x) => x.flagged).map((x) => x.tag));
    const pri = [];
    for (const s of notLogged) pri.push({ kind: 'log', text: `Log the result of today's session${s.partner ? ` vs ${s.partner}` : ''}.` });
    for (const r of reps.filter((x) => x.fixCheck === 'No change' && x.prevAdjust)) pri.push({ kind: 'unfixed', text: `Still not fixed: ${r.prevAdjust}` });
    for (const g of Object.keys(todayTags).filter((x) => flagged.has(x))) pri.push({ kind: 'recurring', text: `"${g}" keeps coming back (flagged in Weaknesses): plan a drill for it.` });
    const last = reps.at(-1); if (last?.adjust) pri.push({ kind: 'carry', text: `Start tomorrow from: ${last.adjust}` });
    return { title, date, sessions: reps.length, planned: planned.length, notLogged: notLogged.length, result,
      progress: reps.length ? Math.round((reps.reduce((a, r) => a + Number(r.progress || 0), 0) / reps.length) * 10) / 10 : null,
      fix, labels: Object.entries(todayTags).sort((a, b) => b[1] - a[1]).map(([tag, n]) => ({ tag, n })), priorities: pri.slice(0, 3) };
  });
}
// The day as a message to paste in the staff group (WhatsApp).
export function dayText(rows, date, lang = 'en') {
  const id = lang === 'id';
  const L = [id ? `Ringkasan latihan ${date}` : `Practice summary ${date}`];
  for (const r of rows) {
    if (!r.sessions && !r.planned) continue;
    L.push('', `*${r.title}*: ${r.sessions} ${id ? 'laporan' : `report${r.sessions === 1 ? '' : 's'}`}${r.result ? `, ${r.result}` : ''}${r.progress != null ? `, ${id ? 'rencana diikuti' : 'plan followed'} ${r.progress}/5` : ''}${r.notLogged ? `, ${r.notLogged} ${id ? 'sesi belum dicatat' : 'session(s) not logged'}` : ''}.`);
    if (r.labels.length) L.push(`${id ? 'Yang gagal' : 'What failed'}: ${r.labels.map((x) => `${x.tag} (${x.n})`).join(', ')}.`);
    if (r.priorities.length) { L.push(id ? 'Prioritas besok:' : 'Tomorrow:'); r.priorities.forEach((p, i) => L.push(`${i + 1}. ${p.text}`)); }
  }
  if (L.length === 1) L.push(id ? 'Belum ada sesi atau laporan hari ini.' : 'No sessions or reports today yet.');
  return L.join('\n');
}
