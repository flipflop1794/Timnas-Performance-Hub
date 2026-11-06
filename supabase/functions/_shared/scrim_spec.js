// Scrim AI — the contract between the hub and the AI model (V1.13).
// Plain JavaScript with no imports, so the same file runs in the Supabase Edge Function (Deno) and in
// the hub and its tests (Node / browser). It holds: which titles have AI capture, the JSON schemas the
// model must answer in, the prompts, and the request/response helpers. Hub-side checks of what the
// model returns live in src/core/capture.js, src/core/debrief.js and src/core/patterns.js.
//
// Rules the prompts enforce: read only what is on the screen, never guess a number, mark what is
// unclear. The coach confirms every value before it is saved; nothing here writes a record by itself.

export const PROMPT_VERSION = 'scrim-ai-2026-11-07.1';
export const DEFAULT_MODEL = 'claude-sonnet-5-5';

// Titles with screenshot capture. MLBB Women plays the same game client as MLBB.
export const CAPTURE_GAMES = {
  MLBB: 'mlbb',
  'MLBB Women': 'mlbb',
  'Dota 2': 'dota',
};
export const GAME_SIDES = { mlbb: ['blue', 'red'], dota: ['radiant', 'dire'] };
export const gameOf = (title) => CAPTURE_GAMES[title] || null;

// Fields a player row may carry. -1 means "not shown on this screen" (never 0 as a guess).
export const PLAYER_FIELDS = ['kills', 'deaths', 'assists', 'gold', 'hero_damage', 'tower_damage', 'damage_taken', 'last_hits', 'denies', 'gpm', 'xpm', 'rating'];
export const UNCERTAIN_FIELDS = ['side', 'name', 'hero', ...PLAYER_FIELDS];

export const LIMITS = {
  imageBytes: 2_500_000,          // decoded image size; the hub sends ~150 KB WebP
  debriefChars: 4000,
  digestFacts: 200,
  digestExcerpts: 60,
  excerptChars: 600,
  findings: 5,
};

const str = { type: 'string' };
const int = { type: 'integer' };
const obj = (properties) => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });

// One schema for both MOBA titles: fields a game does not show come back as -1.
export function scoreboardSchema(game) {
  const sides = GAME_SIDES[game];
  if (!sides) throw new Error(`No screenshot capture for ${game}.`);
  const player = obj({
    side: { type: 'string', enum: [...sides, 'unknown'] },
    slot: int,
    name_seen: str,
    hero: str,
    ...Object.fromEntries(PLAYER_FIELDS.map((k) => [k, k === 'rating' ? { type: 'number' } : int])),
    mvp: { type: 'boolean' },
    uncertain_fields: { type: 'array', items: { type: 'string', enum: UNCERTAIN_FIELDS } },
  });
  return obj({
    screen_kind: { type: 'string', enum: ['scoreboard', 'data_tab', 'draft_or_loading', 'other'] },
    readable: { type: 'boolean' },
    winner_side: { type: 'string', enum: [...sides, 'unknown'] },
    duration_seconds: int,
    score: obj(Object.fromEntries(sides.map((s) => [s, int]))),
    players: { type: 'array', items: player },
    notes: str,
  });
}

export function draftSchema(game) {
  const sides = GAME_SIDES[game];
  if (!sides) throw new Error(`No screenshot capture for ${game}.`);
  return obj({
    screen_kind: { type: 'string', enum: ['draft', 'loading', 'scoreboard', 'other'] },
    readable: { type: 'boolean' },
    first_pick_side: { type: 'string', enum: [...sides, 'unknown'] },
    actions: {
      type: 'array',
      items: obj({ order: int, side: { type: 'string', enum: [...sides, 'unknown'] }, action: { type: 'string', enum: ['pick', 'ban'] }, hero: str, player_name: str, uncertain: { type: 'boolean' } }),
    },
    notes: str,
  });
}

export const DEBRIEF_FIELDS = ['focus', 'worked', 'failed', 'adjust', 'player_notes', 'detail'];
export const debriefSchema = () => obj({ ...Object.fromEntries(DEBRIEF_FIELDS.map((k) => [k, str])), not_placed: str });

export const FINDING_KINDS = ['problem', 'strength', 'tendency', 'opponent'];
export const digestSchema = () => obj({
  findings: { type: 'array', items: obj({ fact_ids: { type: 'array', items: str }, kind: { type: 'string', enum: FINDING_KINDS }, claim: str, why_it_matters: str }) },
});

// ---------------------------------------------------------------- prompts
const GAME_NAME = { mlbb: 'Mobile Legends: Bang Bang (MLBB)', dota: 'Dota 2' };
const FIELD_HELP = {
  mlbb: 'MLBB end screen: Victory/Defeat, team kill score, match duration, per player name, hero portrait, K/D/A, gold, rating and MVP medal. The Data tab adds hero damage, damage taken and turret (tower) damage. Last hits, denies, GPM and XPM do not exist in MLBB: always -1.',
  dota: 'Dota 2 post-game scoreboard: Radiant/Dire victory, kill score, duration, per player name, hero portrait, level, K/D/A, net worth (put it in gold), last hits / denies, GPM / XPM, hero damage, building damage (tower_damage), items. damage_taken and rating do not exist on this screen: always -1. mvp is false unless the screen marks one.',
};

export function scoreboardPrompt(game, heroNames) {
  return [
    `You read one screenshot taken by a national-team coach after a ${GAME_NAME[game]} scrim game and return what it shows as JSON.`,
    FIELD_HELP[game],
    'Rules:',
    '- Read only what is visible. Never estimate, complete or infer a number. If a value is not on this screen or cannot be read, use -1 and add the field to uncertain_fields.',
    `- hero: the hero's name exactly as in this list, or "" if you cannot identify the portrait with confidence (then add "hero" to uncertain_fields). Heroes: ${heroNames.join(', ')}.`,
    '- name_seen: the player name exactly as printed, including team tags; "" if unreadable.',
    '- side: which team the row belongs to. If the screen does not show which side is which, use "unknown". slot: 1-5 in the order shown within the team.',
    '- score: kills per side as printed at the top; -1 if not shown. duration_seconds: game length; -1 if not shown.',
    '- winner_side: only if the screen says who won; otherwise "unknown".',
    '- screen_kind: what the screenshot is. If it is not a scoreboard or data tab, return readable=false and an empty players list.',
    '- notes: one short sentence about anything the coach must check (cropped, blurred, overlapping text). Empty if none.',
    'Return all 10 players when visible, in screen order.',
  ].join('\n');
}

export function draftPrompt(game, heroNames) {
  return [
    `You read one screenshot of a ${GAME_NAME[game]} draft (pick/ban) or loading screen from a national-team scrim and return the picks and bans as JSON.`,
    'Rules:',
    '- Report only heroes you can see as picked or banned. Do not complete a draft from knowledge of the meta.',
    `- hero: exactly as in this list; "" with uncertain=true when a portrait is not recognisable. Heroes: ${heroNames.join(', ')}.`,
    '- order: the order of the action in the draft when the screen shows it (ban and pick slots read left to right per phase); otherwise the order shown per team, and set uncertain=true.',
    '- side: the team that made the pick or ban; "unknown" if not shown. player_name: for picks, the player shown with the hero, else "".',
    '- first_pick_side: only if the screen shows it.',
    '- notes: one short sentence about anything the coach must check. Empty if none.',
  ].join('\n');
}

export function debriefPrompt(title, roster) {
  return [
    `A ${title} national-team coach dictated a short note after a scrim (Indonesian, English or both, often informal). Split it into the fields of the scrim report.`,
    'Fields: focus (what the session was meant to practise), worked (what went well), failed (what went badly), adjust (the one change for the next session), player_notes (per-player performance notes, "Name: note; Name: note"), detail (draft, heroes, map or game-specific detail).',
    'Rules:',
    '- Use the coach\'s own words and language. Do not translate, add advice, add facts, or soften criticism. Light clean-up of filler words is fine.',
    '- Every part of the note goes into exactly one field. Anything that fits no field goes into not_placed. A field the coach did not talk about stays "".',
    '- Performance only: if the note mentions health, injury, sleep, mood, family or contact details, leave that sentence out of every field and put it in not_placed.',
    roster.length ? `- Roster player names (match nicknames to these spellings): ${roster.join(', ')}.` : '',
  ].filter(Boolean).join('\n');
}

export function digestPrompt(title) {
  return [
    `You help the ${title} coaching staff of a national esports team find patterns across their scrim records.`,
    'You receive FACTS computed by the hub from coach-confirmed scrim games (each with an id, a label, a sample size and numbers) and EXCERPTS from coach reports (each with a report id).',
    `Write at most ${LIMITS.findings} findings a coach could act on in the next week of practice.`,
    'Rules:',
    '- Each finding cites the fact ids it rests on in fact_ids (at least one). Use only numbers that appear in those facts; copy them exactly. Never compute new percentages.',
    '- Facts marked low_sample=true may be mentioned only as "early sign" and never as the basis of a problem on their own.',
    '- Report excerpts may support a finding (quote at most a few words, with the report id in brackets) but cannot replace a fact.',
    '- No predictions of WEC results, no player rankings, no comments on health or wellbeing.',
    '- claim: one or two plain sentences with the numbers. why_it_matters: one sentence on what to practise or check. kind: problem, strength, tendency, or opponent (about partners or rival stand-ins).',
    '- If the facts show nothing worth acting on, return an empty findings list.',
  ].join('\n');
}

// ---------------------------------------------------------------- request / response helpers
export function messagesRequest({ model = DEFAULT_MODEL, system, content, schema, maxTokens = 4096 }) {
  return {
    model,
    max_tokens: maxTokens,
    system,
    messages: [{ role: 'user', content }],
    output_config: { format: { type: 'json_schema', schema } },
  };
}

export function imageBlock(base64, mediaType) {
  if (!['image/webp', 'image/jpeg', 'image/png'].includes(mediaType)) throw new Error('Screenshot must be WebP, JPEG or PNG.');
  return { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } };
}

// The model's JSON answer, or a plain error the coach can act on.
export function parseModelJson(resp) {
  if (!resp || resp.type === 'error') throw new Error(`The AI service returned an error: ${resp?.error?.message || 'unknown'}.`);
  if (resp.stop_reason === 'refusal') throw new Error('The AI declined to read this input. Enter the values by hand.');
  if (resp.stop_reason === 'max_tokens') throw new Error('The AI answer was cut off. Try again, or enter the values by hand.');
  const text = (resp.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
  try { return JSON.parse(text); } catch { throw new Error('The AI answer could not be read. Try again, or enter the values by hand.'); }
}

export const usageOf = (resp) => ({ input_tokens: resp?.usage?.input_tokens || 0, output_tokens: resp?.usage?.output_tokens || 0 });

// Storage path for a screenshot: <title-slug>/<YYYY-MM-DD>/<id>.<ext>. The title folder is what the
// storage access policy checks.
export const titleSlug = (title) => title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
export const SLUG_TITLE = Object.fromEntries(['Dota 2', 'MLBB', 'MLBB Women', 'PUBG Mobile', 'eFootball', 'CS2', 'CS2 Women'].map((t) => [titleSlug(t), t]));
export function capturePath(title, day, id, mediaType) {
  const ext = { 'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/png': 'png' }[mediaType];
  if (!ext) throw new Error('Screenshot must be WebP, JPEG or PNG.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error('Bad date.');
  return `${titleSlug(title)}/${day}/${id}.${ext}`;
}
