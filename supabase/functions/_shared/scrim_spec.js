// Scrim AI — the contract between the hub and the AI model (V1.13).
// Plain JavaScript with no imports, so the same file runs in the Supabase Edge Function (Deno) and in
// the hub and its tests (Node / browser). It holds: which titles have AI capture, the JSON schemas the
// model must answer in, the prompts, and the request/response helpers. Hub-side checks of what the
// model returns live in src/core/capture.js, src/core/debrief.js and src/core/patterns.js.
//
// Rules the prompts enforce: read only what is on the screen, never guess a number, mark what is
// unclear. The coach confirms every value before it is saved; nothing here writes a record by itself.

export const PROMPT_VERSION = 'scrim-ai-2026-11-07.3';
export const DEFAULT_MODEL = 'claude-sonnet-5-5';

// Titles with screenshot capture. MLBB Women plays the same game client as MLBB.
export const CAPTURE_GAMES = {
  MLBB: 'mlbb',
  'MLBB Women': 'mlbb',
  'Dota 2': 'dota',
};
// How the end screens group the two teams. MLBB's result screen always puts the screenshot owner's team
// on the LEFT (blue header) and the other team on the RIGHT, whatever map side they played; Dota labels
// Radiant and Dire. The MLBB map side (blue / red base) is not on the result screen: the coach sets it.
export const GAME_SIDES = { mlbb: ['left', 'right'], dota: ['radiant', 'dire'] };
export const MAP_SIDES = { mlbb: ['blue', 'red'], dota: ['radiant', 'dire'] };
export const OUTCOMES = ['victory', 'defeat', 'invalid', 'radiant_victory', 'dire_victory', 'not_shown'];
export const gameOf = (title) => CAPTURE_GAMES[title] || null;

// Fields a player row may carry. -1 means "not shown on this screen" (never 0 as a guess).
export const PLAYER_FIELDS = ['kills', 'deaths', 'assists', 'gold', 'hero_damage', 'tower_damage', 'damage_taken', 'last_hits', 'denies', 'gpm', 'xpm', 'rating'];
export const UNCERTAIN_FIELDS = ['side', 'name', ...PLAYER_FIELDS];

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
// Heroes: both games show portraits (often skins), so the model gives its best guess, says whether it is
// sure, and lists up to 3 candidates; the hub fills only sure answers and offers the rest as choices.
export function scoreboardSchema(game) {
  const sides = GAME_SIDES[game];
  if (!sides) throw new Error(`No screenshot capture for ${game}.`);
  const player = obj({
    side: { type: 'string', enum: [...sides, 'unknown'] },
    slot: int,
    name_seen: str,
    hero: str,
    hero_sure: { type: 'boolean' },
    hero_candidates: { type: 'array', items: str },
    ...Object.fromEntries(PLAYER_FIELDS.map((k) => [k, k === 'rating' ? { type: 'number' } : int])),
    mvp: { type: 'boolean' },
    uncertain_fields: { type: 'array', items: { type: 'string', enum: UNCERTAIN_FIELDS } },
  });
  return obj({
    screen_kind: { type: 'string', enum: ['result', 'stats_detail', 'draft_or_loading', 'other'] },
    readable: { type: 'boolean' },
    outcome: { type: 'string', enum: OUTCOMES },
    duration_seconds: int,
    score: obj(Object.fromEntries(sides.map((s) => [s, int]))),
    team_names: obj(Object.fromEntries(sides.map((s) => [s, str]))),
    players: { type: 'array', items: player },
    notes: str,
  });
}

export function draftSchema(game) {
  const sides = GAME_SIDES[game];
  if (!sides) throw new Error(`No screenshot capture for ${game}.`);
  return obj({
    screen_kind: { type: 'string', enum: ['draft', 'loading', 'result', 'other'] },
    readable: { type: 'boolean' },
    first_pick_side: { type: 'string', enum: [...sides, 'unknown'] },
    actions: {
      type: 'array',
      items: obj({ order: int, side: { type: 'string', enum: [...sides, 'unknown'] }, action: { type: 'string', enum: ['pick', 'ban'] }, hero: str, hero_sure: { type: 'boolean' }, hero_candidates: { type: 'array', items: str }, player_name: str, order_sure: { type: 'boolean' } }),
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
  mlbb: [
    'MLBB has two post-game screens. RESULT screen (screen_kind "result"): VICTORY / DEFEAT / INVALID at the top with each team\'s kill score beside it, "Duration mm:ss" under it, and two teams of five: the LEFT team (blue header) is always the team of the person who took the screenshot, the RIGHT team (red header) is the other team. Per player: hero portrait (no hero name is printed), player name with a team tag in front, K, D, A, gold, a medal with a rating number, MVP on one player per team.',
    'IMPORTANT: on the right team the columns are mirrored: gold comes FIRST, then K, D, A. On the left team the order is K, D, A, gold.',
    'outcome: "victory" or "defeat" exactly as printed (it is from the LEFT team\'s point of view), "invalid" if the game was voided. side: "left" or "right". score: left = number left of the title, right = number right of it.',
    'DATA tab (screen_kind "stats_detail"): per player hero damage, damage taken, turret damage (tower_damage) and team-fight participation; fill those and leave the rest -1.',
    'Last hits, denies, GPM and XPM do not exist in MLBB: always -1. team_names: "" (not shown).',
  ].join('\n'),
  dota: [
    'Dota 2 has two post-game screens. OVERVIEW (screen_kind "result"): "Radiant Victory" / "Dire Victory", kill score, duration, team names, and a card per hero with hero name, player name, level, K/D/A and net worth. SCOREBOARD tab (screen_kind "stats_detail"): per player last hits / denies, GPM / XPM, hero damage, healing, building damage, sometimes after a sideways scroll.',
    'outcome: "radiant_victory" or "dire_victory" as printed. side: "radiant" (top / left group) or "dire". Put net worth in gold, building damage in tower_damage. damage_taken and rating do not exist: always -1. mvp: false unless the screen marks one. A tooltip covering numbers: mark those fields uncertain.',
  ].join('\n'),
};

export function scoreboardPrompt(game, heroNames) {
  return [
    `You read one screenshot taken by a national-team coach after a ${GAME_NAME[game]} scrim game and return what it shows as JSON.`,
    FIELD_HELP[game],
    'Rules:',
    '- Read only what is visible. Never estimate, complete or infer a number. If a value is not on this screen or cannot be read, use -1 and add the field to uncertain_fields.',
    `- hero: your best guess, spelled exactly as in this list ("" if you have no idea). hero_sure: true only if you are certain (the name is printed, or the portrait is unmistakable); portraits are often skins, so when in doubt say false. hero_candidates: up to 3 likely heroes from the list when not sure, else []. Heroes: ${heroNames.join(', ')}.`,
    '- name_seen: the player name exactly as printed, including team tags; "" if unreadable.',
    '- slot: 1-5, top to bottom within the team.',
    '- duration_seconds: game length in seconds; -1 if not shown. outcome "not_shown" if the screen does not say.',
    '- screen_kind: what the screenshot is. If it is not one of the post-game screens, return readable=false and an empty players list.',
    '- notes: one short sentence about anything the coach must check (cropped, blurred, overlapping text, tooltip). Empty if none.',
    'Return all 10 players when visible, in screen order.',
  ].join('\n');
}

export function draftPrompt(game, heroNames) {
  return [
    `You read one screenshot of a ${GAME_NAME[game]} draft (pick/ban) or loading screen from a national-team scrim and return the picks and bans as JSON.`,
    game === 'mlbb' ? 'side: "left" for the team shown on the left (the screenshot owner\'s team), "right" for the other.' : 'side: "radiant" or "dire".',
    'Rules:',
    '- Report only heroes you can see as picked or banned. Do not complete a draft from knowledge of the meta.',
    `- hero: best guess spelled exactly as in this list; hero_sure true only when certain (name printed or portrait unmistakable); hero_candidates up to 3 when not sure. Heroes: ${heroNames.join(', ')}.`,
    '- order: the order of the action in the draft when the screen shows it; otherwise the order shown per team, with order_sure=false.',
    '- player_name: for picks, the player shown with the hero, else "".',
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
    '- Each finding cites the fact ids it rests on in fact_ids (at least one). Every digit you write must be copied exactly from a cited fact (n, won, lost, winRate, count, share, averages, or the numbers in its label). Write no other digits at all: no game numbers, minutes, timings, rankings ("top 1"), differences or ratios you worked out. Findings with any other number are discarded automatically.',
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
  let out; try { out = JSON.parse(text); } catch { throw new Error('The AI answer could not be read. Try again, or enter the values by hand.'); }
  if (!out || typeof out !== 'object' || Array.isArray(out)) throw new Error('The AI answer was not in the expected form. Try again, or enter the values by hand.');
  return out;
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
