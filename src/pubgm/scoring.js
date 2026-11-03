// PUBG Mobile scoring: tournaments do not share one table, so scoring is always a profile.

export function scorer(profile) {
  if (!profile || !profile.placement || profile.per_elim == null) {
    throw new Error(`Scoring profile "${profile?.label || '?'}" is not usable (status: ${profile?.status || 'missing'}).`);
  }
  return {
    placementPts: (place) => profile.placement[place - 1] ?? 0,
    elimPts: (elims) => elims * profile.per_elim,
    total(row) { return this.placementPts(row.placement) + this.elimPts(row.elims); },
    label: profile.label, status: profile.status,
  };
}

// CSV parser for the hub's PUBGM log formats (header row required).
export function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/).filter((l) => l.trim() && !l.startsWith('#'));
  const head = lines.shift().split(',').map((h) => h.trim());
  return lines.map((l) => {
    const cells = l.split(',');
    const o = {};
    head.forEach((h, i) => {
      const v = (cells[i] ?? '').trim();
      o[h] = v !== '' && !isNaN(+v) ? +v : v;
    });
    return o;
  });
}

export const MATCH_COLUMNS = ['match_id', 'date', 'session', 'event', 'map', 'lobby_strength', 'team', 'placement', 'elims', 'elims_early', 'elims_mid', 'elims_late', 'survival_s', 'drop_spot', 'drop_contested', 'vehicle_by_3min', 'died_phase', 'zone_entry', 'position', 'strategy'];
export const FIGHT_COLUMNS = ['match_id', 'team', 't_s', 'phase', 'initiator', 'zone_forced', 'knocks_for', 'knocks_against', 'finishes_for', 'team_deaths', 'third_party', 'notes'];

export function validateMatches(rows) {
  const errors = [];
  rows.forEach((r, i) => {
    for (const c of ['match_id', 'map', 'team', 'placement', 'elims']) if (r[c] === '' || r[c] == null) errors.push(`row ${i + 2}: ${c} missing`);
    if (r.placement && (r.placement < 1 || r.placement > 16)) errors.push(`row ${i + 2}: placement ${r.placement} outside 1–16`);
    if (r.elims_early !== '' && r.elims_early != null && r.elims_early + r.elims_mid + r.elims_late !== r.elims) errors.push(`row ${i + 2}: phase elims do not add up to elims`);
  });
  // A lobby cannot have two teams in the same place.
  const seen = {};
  rows.forEach((r) => { const k = `${r.match_id}:${r.placement}`; if (seen[k]) errors.push(`match ${r.match_id}: two teams placed ${r.placement}`); seen[k] = 1; });
  return errors;
}
