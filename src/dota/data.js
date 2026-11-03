// Dota 2 data layer: parsers for the files the hub ships with and for OpenDota JSON.
// Works in Node (tests) and the browser (hub page): callers pass strings/objects in.

export function parseHeroes(csv) {
  const out = {};
  for (const line of csv.trim().split(/\r?\n/).slice(1)) {
    const [id, name, attr, attack, roles] = line.split(',');
    out[+id] = { id: +id, name, attr, attack, roles: roles.split('|') };
  }
  return out;
}

// Player-match CSV with "#player,<ign>,<account>" section headers.
export function parsePlayerMatches(csv) {
  const players = {};
  let cur = null;
  for (const raw of csv.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('#player,')) {
      const [, ign, acc] = line.split(',');
      cur = players[ign] = { ign, account: +acc, games: [] };
      continue;
    }
    if (line.startsWith('#') || !cur) continue;
    const [match, start, hero, win, dur, k, d, a, lane] = line.split(',').map(Number);
    cur.games.push({ match, start, hero, win: win === 1, dur, k, d, a, lane });
  }
  return players;
}

// OpenDota /api/players/{id}/matches rows -> our game rows.
export function fromOpenDotaPlayerMatches(rows) {
  return rows.map((x) => ({
    match: x.match_id, start: x.start_time, hero: x.hero_id,
    win: (x.player_slot < 128) === x.radiant_win, dur: x.duration,
    k: x.kills, d: x.deaths, a: x.assists, lane: x.lane_role,
  }));
}

// OpenDota /api/matches/{id} full JSON -> the reduced record the analyser uses.
// The same reduction runs in the hub when a coach pastes or fetches a match.
const KEY_ITEMS = new Set(['blink', 'black_king_bar', 'bfury', 'manta', 'aghanims_shard', 'ultimate_scepter', 'force_staff', 'glimmer_cape', 'blade_mail', 'pipe', 'radiance', 'desolator', 'skadi', 'butterfly', 'satanic', 'hand_of_midas', 'maelstrom', 'mjollnir', 'diffusal_blade', 'orchid', 'bloodthorn', 'sheepstick', 'refresher', 'shivas_guard', 'crimson_guard', 'heavens_halberd', 'aether_lens', 'spirit_vessel', 'greater_crit', 'echo_sabre', 'harpoon', 'disperser', 'solar_crest', 'lotus_orb', 'boots_of_bearing', 'guardian_greaves', 'eternal_shroud', 'nullifier', 'abyssal_blade', 'silver_edge', 'assault']);
export function reduceOpenDotaMatch(m) {
  if (!m || !m.match_id || !Array.isArray(m.players)) throw new Error('Not an OpenDota match JSON (needs match_id and players).');
  const parsed = !!(m.od_data && m.od_data.has_parsed) || !!m.version;
  return {
    id: m.match_id, parsed, patch: m.patch, start: m.start_time, dur: m.duration, rw: m.radiant_win,
    league: m.league && m.league.name, leagueid: m.leagueid, series: [m.series_id, m.series_type],
    rteam: m.radiant_team && m.radiant_team.name, dteam: m.dire_team && m.dire_team.name,
    picks: (m.picks_bans || []).map((p) => [p.is_pick ? 1 : 0, p.hero_id, p.team, p.order]),
    gadv: m.radiant_gold_adv || null, xadv: m.radiant_xp_adv || null,
    obj: (m.objectives || []).filter((o) => /roshan|tower|barracks|aegis|firstblood|building/i.test(`${o.type}${o.key || ''}`)).map((o) => [o.time, o.type, o.key || '', o.team ?? o.player_slot ?? '']),
    tf: (m.teamfights || []).map((t) => [t.start, t.end, t.deaths,
      t.players.reduce((acc, p, i) => { acc[i < 5 ? 0 : 1] += p.deaths; return acc; }, [0, 0]),
      t.players.reduce((acc, p, i) => { acc[i < 5 ? 0 : 1] += p.gold_delta; return acc; }, [0, 0])]),
    pl: m.players.map((p) => ({
      acc: p.account_id, name: p.name || p.personaname, slot: p.player_slot, h: p.hero_id, lane: p.lane_role,
      k: p.kills, d: p.deaths, a: p.assists,
      lh10: p.lh_t ? p.lh_t[10] ?? null : null, dn10: p.dn_t ? p.dn_t[10] ?? null : null,
      g10: p.gold_t ? p.gold_t[10] ?? null : null, x10: p.xp_t ? p.xp_t[10] ?? null : null,
      nw: p.net_worth, gpm: p.gold_per_min, xpm: p.xp_per_min, obs: p.obs_placed ?? null, sen: p.sen_placed ?? null,
      bb: (p.buyback_log || []).map((b) => b.time), smoke: p.item_uses ? p.item_uses.smoke_of_deceit || 0 : null,
      stun: p.stuns != null ? Math.round(p.stuns) : null, tfp: p.teamfight_participation ?? null,
      td: p.tower_damage, hd: p.hero_damage, rosh: p.roshans_killed ?? null,
      items: (p.purchase_log || []).filter((x) => KEY_ITEMS.has(x.key)).map((x) => [x.time, x.key]),
    })),
  };
}
