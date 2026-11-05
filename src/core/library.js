// Rival VOD library, sparring-partner bank and individual player plans.

import { FIELDS } from './competitors.js';
import { localDay } from './dates.js';

const need = (c, m) => { if (!c) throw new Error(m); };
const today = () => localDay();

export const VOD_TAGS = ['draft', 'early game', 'objectives', 'teamfight', 'late game', 'drops', 'rotation', 'endgame', 'map veto', 'tactics', 'set piece', 'individual player'];
export function vod(x) {
  need(x.title && FIELDS[x.title], 'Title is required.');
  need(FIELDS[x.title].includes(x.nation), `${x.nation || 'Nation'} is not in the published ${x.title} field.`);
  need(/^https?:\/\/\S+$/.test((x.url || '').trim()), 'A full video link (https://…) is required.');
  need(x.event && x.event.trim(), 'Event is required (tournament, qualifier or scrim).');
  need(x.by && x.by.trim(), 'Who added it is required.');
  return { title: x.title, nation: x.nation, url: x.url.trim(), event: x.event.trim(), date: x.date || '', game: x.game || '', tags: x.tags || [], players: (x.players || '').trim(),
    notes: (x.notes || '').trim(), by: x.by.trim(), reviewed: false, reviewedBy: null, origin: 'operational', added: today() };
}
export function reviewVod(v, { by, note }) {
  need(by && by.trim(), 'Reviewer is required.');
  return { ...v, reviewed: true, reviewedBy: by.trim(), reviewNote: (note || '').trim(), reviewedAt: today() };
}

export const LEVELS = ['Tier 1 international', 'Tier 1 domestic', 'Tier 2', 'Academy / amateur'];
export function partner(x) {
  need(x.title, 'Title is required.');
  need(x.name && x.name.trim(), 'Team name is required.');
  need(LEVELS.includes(x.level), 'Choose a level.');
  need(x.contactOwner && x.contactOwner.trim(), 'Which staff member holds the contact is required (no phone numbers here).');
  if (x.resembles) need(FIELDS[x.title]?.includes(x.resembles), `${x.resembles} is not in the ${x.title} field.`);
  return { title: x.title, name: x.name.trim(), region: (x.region || '').trim(), level: x.level, resembles: x.resembles || '', why: (x.why || '').trim(), availability: (x.availability || '').trim(), contactOwner: x.contactOwner.trim(), origin: 'operational', added: today() };
}
// Partner history from logged scrims.
export function partnerStats(p, scrims) {
  const mine = scrims.filter((s) => s.title === p.title && s.partner.toLowerCase() === p.name.toLowerCase() && s.status === 'done');
  return { scrims: mine.length, last: mine.map((s) => s.date).sort().at(-1) || null };
}

export const AREAS = ['game', 'physical', 'mental'];
export const GOAL_STATUS = ['not started', 'on track', 'at risk', 'done', 'dropped'];
export function goal(x) {
  need(AREAS.includes(x.area), `Area must be ${AREAS.join(', ')}.`);
  need(x.goal && x.goal.trim(), 'Write the goal.');
  need(x.measure && x.measure.trim(), 'Write how it will be measured.');
  need(x.owner && x.owner.trim(), 'Owner is required.');
  return { id: `G-${Math.random().toString(36).slice(2, 7)}`, area: x.area, goal: x.goal.trim(), measure: x.measure.trim(), due: x.due || '', owner: x.owner.trim(), status: 'not started', updates: [] };
}
export function updateGoal(g, { status, note, by }) {
  need(GOAL_STATUS.includes(status), 'Choose a status.');
  need(by && by.trim(), 'Who updated it is required.');
  return { ...g, status, updates: [...g.updates, { status, note: (note || '').trim(), by: by.trim(), at: new Date().toISOString() }] };
}
export function plan(title, player) { return { title, player, role: '', goals: [], origin: 'operational' }; }
