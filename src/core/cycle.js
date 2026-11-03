// The coaching cycle: evidence -> proposed objective -> title-coach review -> practice session
// -> result -> next decision. Pure functions over plain objects so the hub, tests and any
// future backend share one set of rules. Nothing here decides on a coach's behalf.

import { assertOperational } from './records.js';
import { changedSince } from './rules.js';

export const REVIEW = ['accepted', 'modified', 'rejected'];
export const DECISIONS = ['continue', 'adjust', 'retire', 'gather-evidence'];
export const EXECUTION = ['as-planned', 'partly', 'not-run'];
export const RESULT = ['met', 'partly-met', 'not-met', 'not-measured'];

const now = () => new Date().toISOString();
const need = (cond, msg) => { if (!cond) throw new Error(msg); };

export function propose(recRecord, { title, by, rulesSnapshot, at = now(), origin = 'operational' }) {
  need(origin === 'operational', 'Demo data cannot become a practice objective.');
  assertOperational([{ origin }], 'propose');
  need(title, 'Title (game) is required.');
  need(by, 'Who proposed it is required (a person, or "Hub" for an engine proposal).');
  return {
    id: `OBJ-${at.slice(0, 10).replace(/-/g, '')}-${Math.random().toString(36).slice(2, 7)}`,
    title, origin, status: 'proposed', createdAt: at, proposedBy: by,
    rec: recRecord, objective: { drill: recRecord.drill, success: recRecord.success },
    rules: rulesSnapshot || {}, reviews: [], sessions: [], decisions: [],
  };
}

export function review(obj, { decision, reviewer, reason = '', drill, success, at = now() }) {
  need(REVIEW.includes(decision), `Decision must be one of ${REVIEW.join(', ')}.`);
  need(reviewer && reviewer.trim(), 'Reviewer name is required.');
  need(['proposed', 'rejected', 'accepted', 'modified'].includes(obj.status) && !obj.decisions.some((d) => d.decision === 'retire'), 'This objective is closed.');
  if (decision !== 'accepted') need(reason && reason.trim(), 'A reason is required when modifying or rejecting.');
  if (decision === 'modified') need((drill && drill.trim()) || (success && success.trim()), 'A modification must change the drill or the success criterion.');
  const before = { ...obj.objective };
  const objective = decision === 'modified' ? { drill: drill?.trim() || before.drill, success: success?.trim() || before.success } : before;
  return { ...obj, status: decision, objective, reviews: [...obj.reviews, { decision, reviewer: reviewer.trim(), reason: reason.trim(), at, before, after: objective }] };
}

export function logSession(obj, { owner, date, execution, result, measure = '', context = {}, notes = '', at = now() }) {
  need(['accepted', 'modified'].includes(obj.status), 'Only an accepted or modified objective can be practised. Review it first.');
  need(owner && owner.trim(), 'Session owner is required.');
  need(date, 'Session date is required.');
  need(EXECUTION.includes(execution), `Execution must be one of ${EXECUTION.join(', ')}.`);
  need(RESULT.includes(result), `Result must be one of ${RESULT.join(', ')}.`);
  if (result !== 'not-measured' && execution !== 'not-run') need(measure.trim(), 'Record the measured value against the success criterion (or choose "not-measured").');
  const s = { id: `S${obj.sessions.length + 1}`, owner: owner.trim(), date, execution, result, measure: measure.trim(), context, notes, objective: { ...obj.objective }, at };
  return { ...obj, sessions: [...obj.sessions, s] };
}

export function decide(obj, { decision, by, reason, sessionId, at = now() }) {
  need(DECISIONS.includes(decision), `Decision must be one of ${DECISIONS.join(', ')}.`);
  need(by && by.trim(), 'Who decided is required.');
  need(reason && reason.trim(), 'A reason is required.');
  if (decision !== 'gather-evidence') need(obj.sessions.length, 'Log at least one session before deciding to continue, adjust or retire.');
  const sid = sessionId || obj.sessions[obj.sessions.length - 1]?.id || null;
  const d = { decision, by: by.trim(), reason: reason.trim(), sessionId: sid, at };
  const status = decision === 'retire' ? 'retired' : decision === 'adjust' ? 'proposed' : decision === 'gather-evidence' ? 'evidence-needed' : obj.status;
  return { ...obj, status, decisions: [...obj.decisions, d] };
}

// What the staff should do next with this objective.
export function nextStep(obj, rules) {
  const changed = rules ? changedSince(obj.rules, rules) : [];
  const flag = changed.length ? ` Rules changed since proposal (${changed.map((c) => c.label || c.id).join(', ')}): re-check before use.` : '';
  switch (obj.status) {
    case 'proposed': return `Waiting for title-coach review.${flag}`;
    case 'rejected': return `Rejected by ${obj.reviews.at(-1).reviewer}: ${obj.reviews.at(-1).reason}`;
    case 'accepted': case 'modified': {
      const last = obj.sessions.at(-1);
      const decidedLast = last && obj.decisions.some((d) => d.sessionId === last.id);
      if (!last) return `Schedule a practice session.${flag}`;
      if (!decidedLast) return `Session ${last.id} logged: decide continue / adjust / retire / gather evidence.${flag}`;
      return `Continue: schedule the next session.${flag}`;
    }
    case 'evidence-needed': return 'More evidence needed: log scrims or review VOD, then re-propose.';
    case 'retired': return 'Closed.';
    default: return '';
  }
}

// Session -> objective -> decision chain, for audit and display.
export function trail(obj) {
  return obj.sessions.map((s) => ({ session: s, decision: obj.decisions.find((d) => d.sessionId === s.id) || null }));
}
