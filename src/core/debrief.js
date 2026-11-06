// Debrief dump (V1.13): the coach dictates one note after a scrim; the AI splits it into the report
// fields. This module checks the split before it reaches the form: the AI may only move the coach's
// own words around, so any field carrying words the coach did not say is flagged for a look, and
// anything about health or contact details is kept out (scrim reports are performance only).
import { DEBRIEF_FIELDS, LIMITS } from '../../supabase/functions/_shared/scrim_spec.js';

// Report form field each AI field fills.
export const DEBRIEF_TO_FORM = { focus: 'focus', worked: 'worked', failed: 'failed', adjust: 'adjust', player_notes: 'players', detail: 'detail' };
const words = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter((w) => w.length >= 4);
// Words the hub refuses in a performance note (EN + ID): health, sleep, injury, mood, family.
const SENSITIVE = /\b(sakit|cedera|demam|pusing|obat|dokter|rumah sakit|tidur|insomnia|stres|depresi|cemas|keluarga|pacar|sick|injur\w*|fever|medic\w*|doctor|hospital|sleep\w*|depress\w*|anxi\w*|family|girlfriend|boyfriend)\b/i;
const PHONE = /(?:\d[\s().-]*){9,}/;

export function checkDebriefInput(text) {
  const t = String(text || '').trim();
  if (!t) throw new Error('Type or dictate the note first.');
  if (t.length > LIMITS.debriefChars) throw new Error(`Keep the note under ${LIMITS.debriefChars} characters (now ${t.length}).`);
  if (PHONE.test(t)) throw new Error('Remove phone or ID numbers from the note; keep performance notes only.');
  return t;
}

// raw: the model's answer (scrim_spec.debriefSchema). Returns { fields: {formKey: text}, flags: [...], notPlaced }.
export function checkDebriefSplit(source, raw, roster = []) {
  const have = new Set(words(source));
  for (const n of roster) for (const w of words(n)) have.add(w);
  const fields = {}; const flags = [];
  for (const k of DEBRIEF_FIELDS) {
    let v = String(raw?.[k] || '').trim().slice(0, 1000);
    if (!v) continue;
    if (SENSITIVE.test(v) || PHONE.test(v)) { flags.push({ field: DEBRIEF_TO_FORM[k], text: 'Left out: this part mentions health, personal or contact details. Scrim reports are performance only (wellbeing goes through Coach Donny).' }); continue; }
    const w = words(v); const added = w.filter((x) => !have.has(x));
    if (w.length && added.length / w.length > 0.25) flags.push({ field: DEBRIEF_TO_FORM[k], text: `Check this field: it contains words you did not say (${[...new Set(added)].slice(0, 5).join(', ')}).` });
    fields[DEBRIEF_TO_FORM[k]] = v;
  }
  const notPlaced = String(raw?.not_placed || '').trim();
  return { fields, flags, notPlaced: SENSITIVE.test(notPlaced) ? '(a part about health or personal matters was left out)' : notPlaced.slice(0, 600) };
}
