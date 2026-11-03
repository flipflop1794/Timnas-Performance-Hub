// Supported Dota 2 match import with actionable feedback.
// Supported path (works everywhere): save the OpenDota match JSON as a file and load it into the hub.
// Convenience path (Claude desktop app only): fetch through the browser pane, same validation.

import { reduceOpenDotaMatch } from './data.js';

export const IMPORT_HELP = [
  'Open https://www.opendota.com/matches/<MATCH_ID> and, if the page says the replay is not parsed, press "Request parse" and wait a few minutes.',
  'Open https://api.opendota.com/api/matches/<MATCH_ID> in any browser.',
  'Save the page (Ctrl/Cmd+S) as <MATCH_ID>.json — or select all and copy.',
  'In the hub: Dota 2 → Post-match → "Load OpenDota JSON file", or paste into the box.',
];

export function importMatch(text, { ourAccounts = [], known = [] } = {}) {
  const problems = [], warnings = [];
  const t = (text || '').trim();
  if (!t) return { ok: false, problems: ['The file or box is empty.'], warnings };
  if (t.startsWith('<')) return { ok: false, problems: ['This is a web page (HTML), not the API JSON. Use the api.opendota.com/api/matches/<id> address, not opendota.com/matches/<id>.'], warnings };
  let raw;
  try { raw = JSON.parse(t); }
  catch (e) {
    const truncated = /end of (JSON )?(data|input)|Unterminated|Unexpected end/i.test(e.message);
    return { ok: false, problems: [truncated ? 'The JSON is cut off before its end — the copy or download was incomplete. Save the page as a file instead of copying it.' : `Not valid JSON (${e.message}).`], warnings };
  }
  if (raw && raw.error) return { ok: false, problems: [`OpenDota returned an error: "${raw.error}". Check the match ID, or wait a minute if you hit the rate limit.`], warnings };
  if (Array.isArray(raw)) return { ok: false, problems: ['This is a list, not one match. Use /api/matches/<id>.'], warnings };
  let m;
  try { m = reduceOpenDotaMatch(raw); } catch (e) { return { ok: false, problems: [e.message], warnings }; }
  if (m.pl.length !== 10) problems.push(`Expected 10 players, found ${m.pl.length}.`);
  const ours = new Set(ourAccounts.map(Number));
  const tracked = m.pl.filter((p) => ours.has(p.acc));
  if (!tracked.length) problems.push('None of the national players\' accounts are in this match. Check the ID, or add the players\' scrim accounts in the roster settings (see backlog).');
  if (known.includes(m.id)) warnings.push('This match is already in the hub; it will be replaced with this copy.');
  if (!m.parsed) warnings.push('Replay not parsed: no fights, gold timeline or lane gold at 10:00. Request a parse on opendota.com and import again for a full report.');
  if (!m.gadv) warnings.push('No gold-advantage timeline: swing analysis will be skipped.');
  if (!m.tf.length && m.parsed) warnings.push('No teamfights recorded in this match.');
  const sides = new Set(tracked.map((p) => p.slot < 128));
  if (sides.size > 1) warnings.push('National players are on both sides of this match: analysis uses the side with more of them.');
  return { ok: !problems.length, match: problems.length ? null : m, tracked: tracked.length, problems, warnings };
}
