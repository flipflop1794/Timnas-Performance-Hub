// Rules profiles: every rule an analysis depends on, with version, source and confirmation status.
// Objectives store the versions they were proposed under; when a profile changes, those objectives
// (and the analyses listed in `affects`) are flagged for re-check.

export const RULE_STATUS = ['confirmed', 'provisional', 'unverified', 'blocked'];

export const DEFAULT_RULES = [
  { id: 'dota-patch', title: 'Dota 2', label: 'Game patch', version: '7.41 (OpenDota patch 60)', status: 'provisional',
    source: 'OpenDota /constants/patch, 3 Nov 2026. Letter patch unclear (Liquipedia 7.41d; a news item reports 7.41e). WEC patch not announced.',
    affects: ['dota-team', 'dota-post', 'dota-scout', 'dota-draft'] },
  { id: 'dota-draft-order', title: 'Dota 2', label: 'Draft order', version: 'CM 24-step, observed 7.41', status: 'provisional',
    source: 'Observed in 2 OpenDota tournament drafts. IESF WEC draft rules not published.', affects: ['dota-draft'] },
  { id: 'pubgm-scoring', title: 'PUBG Mobile', label: 'Scoring table', version: 'standard_10_6 v1', status: 'unverified',
    source: 'Common 10-6-5-4-3-2-1-1 + 1/elimination. No rulebook retrieved; WEC table not published.', affects: ['pubgm-team', 'pubgm-sim', 'staff-measure'] },
  { id: 'wec-live-coaching', title: 'All', label: 'Live coaching / external tools during matches', version: 'unknown', status: 'blocked',
    source: 'Not published. Owner: PB ESI international relations.', affects: ['pubgm-sim', 'dota-draft'] },
];

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
