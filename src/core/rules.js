// Rules profiles: every rule an analysis depends on, with version, source and confirmation status.
// Objectives store the versions they were proposed under; when a profile changes, those objectives
// (and the analyses listed in `affects`) are flagged for re-check.

export const RULE_STATUS = ['confirmed', 'provisional', 'unverified', 'blocked'];

// V1.38 (21 Nov 2026): formats, patch and maps from the desk research of 21 Nov (research_notes/WEC26_deep_research_2026-11-21.md).
// IESF has published no WEC26 rulebook yet (iesf.org/rules-regulations: "available soon"), so nothing is "confirmed".
// `replaces`: earlier default versions. A saved copy still on one of them, never edited by the staff, moves to the new
// default (see mergeRules); one the staff changed is left as they set it.
const CHECKED = 'Checked 21 Nov 2026.';
export const DEFAULT_RULES = [
  { id: 'dota-patch', title: 'Dota 2', label: 'Game patch', version: '7.42 (live 18 Nov 2026)', status: 'provisional',
    source: `Patch 7.42 went live 18 Nov 2026 (Forbes, talkesport, cyberscore; official notes dota2.com/patches/7.42): hero base HP 120→200, fixed 90 passive GPM, +50 XP/min, Item Potency, 7 new items, Tormentor at 15:00 drops a mega-creep item. A 7.42a hotfix is likely before WEC. WEC patch lock not announced. Hero pools in the hub are club games since 7.41 (old patch). ${CHECKED}`,
    replaces: ['7.41 (OpenDota patch 60)'],
    affects: ['dota-team', 'dota-post', 'dota-scout', 'dota-draft'] },
  { id: 'dota-format', title: 'Dota 2', label: 'Event format', version: '2 groups of 6, Bo1 round robin (top 4 advance) · playoffs Bo3 · 16–20 Dec', status: 'provisional',
    source: `esports.id (20 Nov, citing IESF) and dota2protips. Groups per cybersport.ru (single source): A = Indonesia, Mongolia, Kazakhstan, Egypt, Venezuela, North Macedonia; B = Greece, Iran, Belarus, Argentina, New Zealand, South Africa. Grand-final length not published. ${CHECKED}`,
    affects: [] },
  { id: 'cs2-format', title: 'CS2', label: 'Event format (Open and Women)', version: '2 groups of 6, Bo1 round robin (top 4 advance) · playoffs Bo3', status: 'provisional',
    source: `esports.id (20 Nov, citing IESF), same for CS2 Open and CS2 Women. Groups, veto procedure and dates per stage not published. ${CHECKED}`,
    affects: [] },
  { id: 'cs2-map-pool', title: 'CS2', label: 'Map pool', version: 'Active Duty: Ancient, Anubis, Cache, Dust II, Inferno, Mirage, Nuke', status: 'provisional',
    source: `Valve Active Duty since July 2026 (Cache replaced Overpass). WEC pool not published; assumed Active Duty. 19 Nov patch closed the Inferno Church → B Dark utility exploit. ${CHECKED}`,
    affects: [] },
  { id: 'mlbb-format', title: 'MLBB', label: 'Event format', version: 'GSL groups of 4, Bo3 (top 2 advance) · playoffs Bo3 · final Bo5 · draft 5 bans per team', status: 'provisional',
    source: `Format: esports.id (20 Nov, citing IESF) and Liquipedia. Draft: IESF 2025 rulebook (Tournament Mode, 5 bans), 2026 rulebook not published. Group draw not published. ${CHECKED}`,
    affects: [] },
  { id: 'mlbbw-format', title: 'MLBB Women', label: 'Event format', version: '4 teams, double elimination', status: 'provisional',
    source: `esports.id (20 Nov, single source). Best-of per stage not published. Field: Indonesia, Egypt, Türkiye, Argentina. ${CHECKED}`,
    affects: [] },
  { id: 'pubgm-format', title: 'PUBG Mobile', label: 'Event format', version: '16 teams, 18 matches over 3 days (6 a day) · Erangel, Miramar, Rondo · tie-break: chicken dinners, then placement points', status: 'provisional',
    source: `esports.id (20 Nov, citing IESF); tie-break from Liquipedia (search summary). Map order per match not published. ${CHECKED}`,
    affects: [] },
  { id: 'efootball-format', title: 'eFootball', label: 'Event format', version: '1v1 · 16 groups (each pairing plays home and away) · knockout Bo3 · final Bo5', status: 'unverified',
    source: `esports.id (20 Nov, citing IESF); 1v1 because every nation lists one player on wec.iesf.org. Platform reported as mobile (one search summary only) and match settings are NOT published: confirm with PB ESI. ${CHECKED}`,
    affects: [] },
  { id: 'dota-draft-order', title: 'Dota 2', label: 'Draft order', version: 'CM 24-step, observed 7.41', status: 'provisional',
    source: 'Observed in 2 OpenDota tournament drafts. IESF WEC draft rules not published.', affects: ['dota-draft'] },
  { id: 'pubgm-scoring', title: 'PUBG Mobile', label: 'Scoring table', version: 'standard_10_6 v1', status: 'unverified',
    source: 'Common 10-6-5-4-3-2-1-1 + 1/elimination. No rulebook retrieved; WEC table not published.', affects: ['pubgm-team', 'pubgm-sim', 'staff-measure'] },
  { id: 'wec-live-coaching', title: 'All', label: 'Live coaching / external tools during matches', version: 'unknown', status: 'blocked',
    source: 'Not published. Owner: PB ESI international relations.', affects: ['pubgm-sim', 'dota-draft'] },
];

// V1.38: the live hub keeps its rules in the database (config/rules), so new default profiles would never reach it.
// Saved rules win; a default missing from the saved list is added; a saved rule the staff never changed (no history) that
// is still on an earlier default version moves to the new default, with a dated history line, so objectives proposed under
// the old version are flagged for re-check as with any rule change.
export function mergeRules(saved, defaults, { at = new Date().toISOString() } = {}) {
  if (!Array.isArray(saved) || !saved.length) return defaults;
  const out = saved.map((r) => {
    const d = defaults.find((x) => x.id === r.id);
    if (!d || r.history?.length || !(d.replaces || []).includes(r.version)) return r;
    return { ...r, version: d.version, status: d.status, source: d.source, affects: d.affects,
      history: [{ from: r.version, to: d.version, status: d.status, by: 'Hub V1.38 (default update)', at, reason: 'New default from the 21 Nov 2026 desk research; the old default had not been changed by the staff.' }] };
  });
  for (const d of defaults) if (!out.some((r) => r.id === d.id)) out.push(d);
  return out;
}

// V1.38: the rule profiles of one title (format, patch, map pool, scoring) as AI material, so prep packs and briefs
// work from the current facts. Each item has an id the AI can cite; "provisional" / "unverified" travel with it.
// CS2 Women shares the CS2 profiles (one format and map pool for both events).
export function rulesMaterial(rules, title) {
  const t = title === 'CS2 Women' ? 'CS2' : title;
  return (rules || []).filter((r) => r.title === t).map((r) => ({ id: `R-${r.id}`, text: `${r.label}: ${r.version} (${r.status})` }));
}

export function snapshot(rules, ids) {
  const out = {};
  for (const r of rules) if (!ids || ids.includes(r.id)) out[r.id] = r.version;
  return out;
}

// Which rule profiles changed since a stored snapshot?
export function changedSince(snap, rules) {
  const out = [];
  for (const [id, ver] of Object.entries(snap || {})) {
    const cur = rules.find((r) => r.id === id);
    if (!cur) out.push({ id, from: ver, to: '(removed)' });
    else if (cur.version !== ver) out.push({ id, from: ver, to: cur.version, label: cur.label });
  }
  return out;
}

// Update a profile; returns new rules array and the analyses to flag.
export function updateRule(rules, id, patch, { by, at = new Date().toISOString(), reason } = {}) {
  if (!by) throw new Error('Rule changes need the name of the person making them.');
  if (!reason) throw new Error('Rule changes need a reason or source.');
  if (patch.status && !RULE_STATUS.includes(patch.status)) throw new Error(`bad status ${patch.status}`);
  let affected = [];
  const next = rules.map((r) => {
    if (r.id !== id) return r;
    affected = r.affects;
    return { ...r, ...patch, history: [...(r.history || []), { from: r.version, to: patch.version ?? r.version, status: patch.status ?? r.status, by, at, reason }] };
  });
  if (!affected.length && !rules.some((r) => r.id === id)) throw new Error(`unknown rule ${id}`);
  return { rules: next, affected };
}

export const provisional = (rules, view) => rules.filter((r) => r.affects.includes(view) && r.status !== 'confirmed');
