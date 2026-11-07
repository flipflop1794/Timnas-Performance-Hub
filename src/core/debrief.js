// Debrief dump (V1.13): the coach dictates one note after a scrim; the AI splits it into the report
// fields. This module checks the split before it reaches the form: the AI may only move the coach's
// own words around, so any field carrying words the coach did not say is flagged for a look, and
// anything about health or contact details is kept out (scrim reports are performance only).
import { DEBRIEF_FIELDS, LIMITS } from '../../supabase/functions/_shared/scrim_spec.js';
import { hasContactNumber } from './pii.js';

// Report form field each AI field fills.
export const DEBRIEF_TO_FORM = { focus: 'focus', worked: 'worked', failed: 'failed', adjust: 'adjust', player_notes: 'players', detail: 'detail' };
const words = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter((w) => w.length >= 4);
// Words the hub refuses in a performance note (EN + ID): health, sleep, injury, mood, family.
const SENSITIVE = /\b(sakit|cedera|demam|pusing|obat|dokter|rumah sakit|tidur|insomnia|stres|depresi|cemas|keluarga|pacar|sick|injur\w*|fever|medic\w*|doctor|hospital|sleep\w*|depress\w*|anxi\w*|family|girlfriend|boyfriend)\b/i;


export function checkDebriefInput(text) {
  const t = String(text || '').trim();
  if (!t) throw new Error('Type or dictate the note first.');
  if (t.length > LIMITS.debriefChars) throw new Error(`Keep the note under ${LIMITS.debriefChars} characters (now ${t.length}).`);
  if (hasContactNumber(t)) throw new Error('Remove phone or ID numbers from the note; keep performance notes only.');
  return t;
}

// raw: the model's answer (scrim_spec.debriefSchema). Returns { fields: {formKey: text}, flags: [...], notPlaced }.
export function checkDebriefSplit(source, raw, roster = []) {
  const have = new Set(words(source));
  for (const n of roster) for (const w of words(n)) have.add(w);
  const fields = {}; const flags = [];
  for (const k of DEBRIEF_FIELDS) {
    let v = typeof raw?.[k] === 'string' ? raw[k].trim().slice(0, 1000) : '';
    if (!v) continue;
    // Leave out only the parts (a player's note, or a sentence) that mention health, personal or contact
    // details; the rest of the field stays.
    const parts = k === 'player_notes' ? v.split(/\s*;\s*/) : v.split(/(?<=[.!?])\s+/);
    const keepParts = parts.filter((x) => !SENSITIVE.test(x) && !hasContactNumber(x));
    if (keepParts.length < parts.length) {
      flags.push({ field: DEBRIEF_TO_FORM[k], text: `Left out ${parts.length - keepParts.length === parts.length ? 'this field' : 'part of this field'}: it mentions health, personal or contact details. Scrim reports are performance only (wellbeing goes through Coach Donny).` });
      v = keepParts.join(k === 'player_notes' ? '; ' : ' ').trim();
      if (!v) continue;
    }
    const w = words(v); const added = w.filter((x) => !have.has(x));
    if (w.length && added.length / w.length > 0.25) flags.push({ field: DEBRIEF_TO_FORM[k], text: `Check this field: it contains words you did not say (${[...new Set(added)].slice(0, 5).join(', ')}).` });
    fields[DEBRIEF_TO_FORM[k]] = v;
  }
  const notPlaced = typeof raw?.not_placed === 'string' ? raw.not_placed.trim() : '';
  return { fields, flags, notPlaced: SENSITIVE.test(notPlaced) ? '(a part about health or personal matters was left out)' : notPlaced.slice(0, 600) };
}
