// Scrim AI — the contract between the hub and the AI model (V1.13).
// Plain JavaScript with no imports, so the same file runs in the Supabase Edge Function (Deno) and in
// the hub and its tests (Node / browser). It holds: which titles have AI capture, the JSON schemas the
// model must answer in, the prompts, and the request/response helpers. Hub-side checks of what the
// model returns live in src/core/capture.js, src/core/debrief.js and src/core/patterns.js.
//
// Rules the prompts enforce: read only what is on the screen, never guess a number, mark what is
// unclear. The coach confirms every value before it is saved; nothing here writes a record by itself.

export const PROMPT_VERSION = 'scrim-ai-2026-11-28.1';   // V1.26 plan blocks, debrief drills, weekly, meta_extract, meta_fit; V1.27 prematch, scout_day, brainstorm
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
  metaChars: 12000,               // V1.26 pasted patch notes / stats / tier list
  digestFacts: 200,
  digestExcerpts: 60,
  excerptChars: 600,
  findings: 5,
  digestFeedback: 30,             // staff marks on earlier findings sent with a digest
  planReports: 10,                // V1.17 next-session plan: latest reports sent
  planFindings: 8,
  summaryFacts: 80,               // V1.20 weekly leadership summary
  prepItems: 40,                  // V1.20 preparation pack: items per list
  tagReports: 20,                 // V1.20 weakness tags: reports per call
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
// V1.26: when the session had planned drills, the note also says per drill whether it met its criterion.
export const DRILL_CALLS = ['yes', 'no', 'not tried', 'not said'];
export const debriefSchema = () => obj({ ...Object.fromEntries(DEBRIEF_FIELDS.map((k) => [k, str])), not_placed: str,
  drills: { type: 'array', items: obj({ index: int, met: { type: 'string', enum: DRILL_CALLS }, quote: str }) } });

// V1.17 next-session plan: one suggested focus, built only from the coaches' own reports and findings.
// V1.26: plus 2-4 timed drills, each with an objective and a success criterion.
export const planSchema = () => obj({
  focus: str, why: str, drill: str, measure: str,
  based_on: { type: 'array', items: str },
  alternatives: { type: 'array', items: str },
  blocks: { type: 'array', items: obj({ name: str, minutes: int, objective: str, criterion: str, based_on: { type: 'array', items: str } }) },
});
// V1.26 weekly trend draft per title (from the computed trend only).
export const weeklySchema = () => obj({
  headline: str,
  lines: { type: 'array', items: obj({ text: str, sources: { type: 'array', items: str } }) },
  practise_next: { type: 'array', items: str },
});
// V1.26 meta: entries pulled out of pasted text, each with the exact line it came from.
export const META_CATEGORIES = ['patch', 'change', 'strong', 'weak', 'strategy'];
export const metaExtractSchema = () => obj({
  patch: str,
  entries: { type: 'array', items: obj({ category: { type: 'string', enum: META_CATEGORIES }, item: str, text: str, quote: str }) },
});
// V1.26 meta against our own data: aligned, exposed, what to practise, and a short brief.
// V1.27 WEC scouting: one-page pre-match brief and the day's summary per opponent. Every line cites item ids.
const cited = obj({ text: str, sources: { type: 'array', items: str } });
export const prematchSchema = () => obj({
  likely: { type: 'array', items: cited }, threats: { type: 'array', items: cited },
  key_points: { type: 'array', items: cited }, watch: { type: 'array', items: cited }, tbd: { type: 'array', items: str },
});
export const scoutDaySchema = () => obj({
  opponents: { type: 'array', items: obj({ nation: str, learned: { type: 'array', items: cited }, next_time: { type: 'array', items: str } }) },
  tbd: { type: 'array', items: str },
});
// V1.27 Brainstorm: one reply in a coach / analyst session, with its sources and things it could become in the hub.
export const BRAIN_KINDS = ['session', 'proposal', 'note'];
export const brainstormSchema = () => obj({
  reply: str, sources: { type: 'array', items: str }, follow_ups: { type: 'array', items: str },
  suggestions: { type: 'array', items: obj({ kind: { type: 'string', enum: BRAIN_KINDS }, title: str, detail: str, sources: { type: 'array', items: str } }) },
});
export const metaFitSchema = () => obj({
  aligned: { type: 'array', items: obj({ text: str, meta_ids: { type: 'array', items: str }, our_ids: { type: 'array', items: str } }) },
  exposed: { type: 'array', items: obj({ text: str, meta_ids: { type: 'array', items: str }, our_ids: { type: 'array', items: str } }) },
  practise: { type: 'array', items: obj({ text: str, meta_ids: { type: 'array', items: str }, our_ids: { type: 'array', items: str } }) },
  brief: str,
  tbd: { type: 'array', items: str },
});

// ---------------------------------------------------------------- V1.20 coach AI
// Weakness tags per kind of game. The model may only use these; coaches can correct them.
export const WEAKNESS_TAGS = {
  moba: ['draft', 'early game / laning', 'rotation', 'objective timing', 'vision', 'teamfight', 'late game / macro', 'communication', 'mechanics', 'discipline'],
  br: ['drop', 'rotation', 'zone timing', 'vehicles', 'fights', 'third party', 'endgame', 'communication', 'utility', 'discipline'],
  football: ['defensive shape', 'set pieces', 'transitions', 'finishing', 'build-up', 'game management', 'mechanics', 'discipline'],
  fps: ['utility', 'entries', 'retakes', 'economy', 'clutches', 'mid-round calls', 'communication', 'mechanics', 'discipline'],
};
export const FAMILY = { MLBB: 'moba', 'MLBB Women': 'moba', 'Dota 2': 'moba', 'PUBG Mobile': 'br', eFootball: 'football', CS2: 'fps', 'CS2 Women': 'fps' };
export const tagsOf = (title) => WEAKNESS_TAGS[FAMILY[title]] || [];
export const tagsSchema = (title) => obj({
  reports: { type: 'array', items: obj({ id: str, tags: { type: 'array', items: { type: 'string', enum: tagsOf(title) } } }) },
});
// Weekly summary for the Ketua BTN and Dewan Pengawas, from the dashboard's own figures.
export const summarySchema = () => obj({
  headline: str,
  titles: { type: 'array', items: obj({ title: str, line: str }) },
  attention: { type: 'array', items: str },
  next_week: { type: 'array', items: str },
});
// Preparation pack for one WEC match.
const cite = { type: 'array', items: str };
export const prepSchema = () => obj({
  summary: str,
  their_tendencies: { type: 'array', items: obj({ text: str, sources: cite }) },
  our_focus: { type: 'array', items: obj({ focus: str, drill: str, measure: str, sources: cite }) },
  scrims: { type: 'array', items: obj({ day: int, partner: str, focus: str }) },
  watch_out: { type: 'array', items: str },
});
// PUBG Mobile end-of-match screen.
export const brResultSchema = () => obj({
  screen_kind: { type: 'string', enum: ['team_result', 'lobby_standings', 'other'] },
  readable: { type: 'boolean' },
  map: str,
  placement: int,
  team_kills: int,
  players: { type: 'array', items: obj({ name_seen: str, kills: int, damage: int, survived_seconds: int, uncertain: { type: 'boolean' } }) },
  lobby: { type: 'array', items: obj({ rank: int, team_name: str, kills: int, points: int }) },
  notes: str,
});

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
    '- drills: when the message starts with PLANNED DRILLS (index, name, success criterion), return one entry per drill: met "yes" or "no" only when the note clearly says whether that criterion was reached, "not tried" when the note says it was skipped, otherwise "not said". quote: the few words of the note it rests on ("" for not said). With no planned drills return [].',
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
    '- FEEDBACK lists earlier findings and how the staff marked them: useful, known (they already knew it), wrong (they judged it a misreading), promoted (turned into a coaching proposal). Do not raise again what is marked known or promoted; for one marked wrong, do not repeat that reading of the same facts. Prefer findings of the kinds the staff marked useful.',
    '- If the facts show nothing worth acting on, return an empty findings list.',
  ].join('\n');
}

export function planPrompt(title) {
  return [
    `You help the ${title} coaching staff of a national esports team choose the focus of their NEXT practice session.`,
    'You receive REPORTS (the latest scrim reports: id, date, partner, result, focus, plan-followed rating 1-5, what worked, what failed, the adjustment, and whether the previous adjustment was fixed), FINDINGS (pattern findings with ids) and OBJECTIVES (accepted coaching objectives).',
    'Suggest ONE focus for the next session:',
    '- focus: one short line the coach can write on the board. drill: one concrete practice activity for a scrim or drill session. measure: how the coach will know it worked in the next report (observable, no invented targets).',
    '- why: one or two sentences that point to the material, quoting report ids or finding ids in brackets, e.g. [RP-20261120-ab12]. based_on: those ids.',
    '- Prefer an adjustment that keeps coming back or was marked "No change" or "Better, not fixed yet"; then repeated failures; then findings marked useful; then accepted objectives.',
    '- Use only what is in the material. Do not invent statistics, opponents, heroes or players. Copy any number exactly from the material, or write none.',
    '- Write in the language the coaches used (Bahasa Indonesia, English or mixed). No comments on health, mood or wellbeing.',
    '- alternatives: up to 2 other one-line focuses, or [].',
    '- If there is too little material (no reports), say so in why and leave focus, drill and measure empty.',
    '- V1.26 blocks: also return 2 to 4 timed drills for the session (name, minutes 5-120, objective, criterion = how the coach will see it worked in this session, based_on = the ids or labels it comes from). Start from UNFIXED adjustments, then WEAKNESSES that are flagged, then recurring VOD THEMES. Minutes add up to a normal session (about 60-150). No invented targets or numbers that are not in the material; a criterion is something the coach can observe. With too little material return [].',
  ].join('\n');
}

// V1.26 Focus 1 and 2.
export function weeklyPrompt(title) {
  return [
    `You draft the weekly practice trend of the ${title} national team for its coaching staff (Bahasa Indonesia unless the material is all English).`,
    'You receive the TREND computed by the hub: the period, the number of reports now and in the previous 14 days (low_sample when under 5), weakness labels that no longer show (FIXED), that persist (PERSISTING), that are new (NEW), which partner exposed which weakness (EXPOSED_BY) and drill results (DRILLS).',
    '- headline: one sentence. lines: up to 5 plain lines, each citing the section it comes from in sources (e.g. ["PERSISTING:vision"]). practise_next: up to 3 one-line suggestions from PERSISTING, NEW or EXPOSED_BY.',
    '- When low_sample is true, say "early sign" and do not call anything fixed or a problem.',
    `- ${'Every digit you write must be copied exactly from the material. Write no other number: no totals, differences, percentages or rankings you worked out. Lines with any other number are removed automatically.'}`,
    '- No predictions of WEC results, no player rankings, no comments on health, mood, wellbeing, contracts or money.',
  ].join('\n');
}
export function metaExtractPrompt(title) {
  return [
    `You help analysts of the ${title} national team keep a meta tracker. You receive TEXT an analyst pasted (patch notes, tournament statistics, a tier list or their own notes) and its SOURCE.`,
    '- patch: the game version the text is about, exactly as written, or "".',
    '- entries: what the text says, as items: category "patch" (version and date), "change" (a hero, item, map or system that was changed), "strong" (said to be strong, picked or banned a lot, high win rate), "weak" (said to be weak or rarely picked), "strategy" (a draft, lineup, rotation, loadout or formation said to work or not).',
    '- item: the hero / map / item / strategy name exactly as written. text: one short line in the text\'s own words. quote: the exact words from TEXT it comes from (copied character for character).',
    '- Only what the text says. Never add your own knowledge of the game, never complete lists, never invent statistics. Copy numbers exactly.',
    '- If the text is not about this game, return an empty list.',
  ].join('\n');
}
// V1.27 — shared rules for the scouting and brainstorm prompts. PREFS are the staff's approved preferences
// (from their feedback on earlier AI output): follow them unless they conflict with these rules.
const GROUNDED = [
  '- Use only the material. Every line cites the ids of the items it rests on in sources (at least one). Never invent heroes, picks, players, strategies, statistics, patches or results.',
  '- Every digit you write must be copied exactly from the material. Write no other number. Lines with any other number or an unknown id are removed automatically.',
  '- Counts marked small (under 3 sightings or low_sample) are "early sign", never a certainty. Say "TBD" for what the material does not show.',
  '- No predictions of results or win chances, no player rankings, no comments on health, mood, wellbeing, contracts or money.',
  '- If PREFS are given (the staff\'s approved preferences), follow them.',
].join('\n');
export function prematchPrompt(title) {
  return [
    `You draft a one-page pre-match brief for the Indonesian ${title} players and coaches, for a match at IESF WEC 2026 between games or just before it (Bahasa Indonesia unless the material is all English).`,
    'You receive BRIEF (what the staff know about the opponent: known, to confirm, watch for; each item with an id), LIVE (today\'s and earlier live scouting observations, each with an id, type pick / ban / strategy / player / tendency / note, and how often), BOOK (our approved draft book, MOBA only) and STANDIN (our results against partners who play like them).',
    '- likely: up to 5 picks, bans or strategies they are likely to use. threats: up to 3 players or tendencies to watch. key_points: exactly 3 short, concrete points the players can act on in this match. watch: up to 3 things to check during the match. tbd: what we do not know.',
    GROUNDED,
  ].join('\n');
}
export function scoutDayPrompt(title) {
  return [
    `You write the end-of-day scouting summary for the Indonesian ${title} staff at IESF WEC 2026 (Bahasa Indonesia unless the material is all English).`,
    'You receive LIVE: the day\'s live scouting observations grouped per opponent nation, each with an id. Summarise per nation what we learned today (learned) and what to look at next time we watch them (next_time).',
    GROUNDED,
  ].join('\n');
}
export function brainstormPrompt(title, purpose) {
  return [
    `You are a thinking partner for the ${title} coaching staff of the Indonesian national esports team in a brainstorming session (Bahasa Indonesia unless the staff write English). Purpose: ${purpose === 'opponent' ? 'prepare for one opponent' : 'plan the next practice sessions'}.`,
    'You receive MATERIAL (the title\'s own records, each with an id), HISTORY (the session so far) and QUESTION.',
    '- reply: a direct, practical answer in a few short paragraphs or bullet lines. Ask back when the question is unclear. Offer a counter-view when the staff seem settled too fast. sources: the ids you used.',
    '- follow_ups: up to 3 short questions the staff could ask next. suggestions: up to 3 things the answer could become in the hub: "session" (a practice session with drills: title = focus, detail = the drills with minutes and a success criterion each), "proposal" (a coaching objective: title = the problem, detail = drill and how to measure), "note" (a scouting note about the opponent: title = the nation, detail = the note). Each cites sources.',
    GROUNDED,
  ].join('\n');
}
export function metaFitPrompt(title) {
  return [
    `You compare the current ${title} meta with the Indonesian national team's own records, for its coaching staff (Bahasa Indonesia unless the material is all English).`,
    'You receive META (tracker entries with ids, category strong / weak / change / strategy, and whether an analyst confirmed them) and OURS (facts with ids from our confirmed scrim games, hero pools and scrim reports: what we play, how often, results, comfort).',
    '- aligned: where the meta and what we already do well match. exposed: strong meta items we do not play or have no answer to, or weak items we rely on. practise: up to 4 one-line things to practise. Every line cites meta_ids and our_ids it rests on (at least one meta id).',
    '- Entries not confirmed by an analyst may only be mentioned with "to confirm". Facts with low samples are "early sign".',
    '- brief: four to six sentences for the staff on what this meta means for us. tbd: what we cannot judge from the material.',
    '- Every digit you write must be copied exactly from the material. Write no other number. Never invent heroes, picks, patches or statistics that are not in the material.',
    '- No predictions of WEC results or win chances, no player rankings, no comments on health, mood, wellbeing, contracts or money.',
  ].join('\n');
}

const NUMBERS_RULE = 'Every digit you write must be copied exactly from FACTS (or from the item you cite). Write no other number: no totals, differences, percentages or rankings you worked out. Lines with any other number are removed automatically.';
const SAFE_RULE = 'No predictions of WEC results or win chances, no player rankings, no comments on health, mood, wellbeing, contracts or money.';

export function tagsPrompt(title) {
  return [
    `You label scrim reports of the ${title} national team so the coaches can see which weaknesses keep coming back.`,
    'You receive REPORTS: id, what failed in the session and the adjustment the coach chose for next time (Indonesian, English or mixed).',
    `For each report return up to 3 tags from this list only: ${tagsOf(title).join(', ')}.`,
    'Tag what the coach wrote as a problem, not what went well. A report with nothing failing gets []. Do not guess beyond the text.',
  ].join('\n');
}

export function summaryPrompt() {
  return [
    'You write the weekly half-page summary of the Indonesian national esports teams for the Ketua BTN and the Dewan Pengawas (supervisory board), in Bahasa Indonesia, plain and factual.',
    'You receive FACTS from the hub: days to IESF WEC 2026, and per title the practice-quality score (0-100, how rigorously the team practises) and its change, sessions and scrim record in the last 7 days, plan-followed rating (1-5), results trend verdict (Better / Worse / No clear change / Not enough data), overdue follow-ups, recurring weaknesses and the next WEC match.',
    '- headline: one sentence on the overall picture.',
    '- titles: one line per title that has data (skip titles without records); say what is going well or not, using the facts.',
    '- attention: up to 3 points leadership should know or support (e.g. a title with no reports, overdue follow-ups, a weakness that keeps returning).',
    '- next_week: up to 3 points about the coming week (WEC matches, what the staff will focus on). Only from the facts.',
    `- ${NUMBERS_RULE}`,
    '- "Better"/"Worse" may only be said when the fact says so; "No clear change" and "Not enough data" must not be described as improvement or decline.',
    `- ${SAFE_RULE}`,
  ].join('\n');
}

export function prepPrompt(title) {
  return [
    `You help the ${title} coaching staff of the Indonesian national team prepare for one IESF WEC 2026 match.`,
    'You receive MATCH (opponent nation, date, days left), CARD (the opponent card: tier, observed notes, hypotheses, VOD takeaways, roster, ban candidates), STANDINS (our scrim results against partners who stand in for this opponent), WEAKNESSES (our recurring weaknesses with counts), REPORTS (our latest scrim reports), BOOK (the approved draft book, MOBA only) and PARTNERS (sparring partners in the bank, with level and which nation they resemble). Every item has an id.',
    '- summary: two or three sentences on what this match will ask of us.',
    '- their_tendencies: up to 4 things the opponent tends to do, only from CARD or STANDINS, each citing the item ids in sources.',
    '- our_focus: up to 3 practice focuses for the days before the match; each with a concrete drill and an observable measure, citing ids (prefer recurring weaknesses that matter against this opponent).',
    '- scrims: up to 4 suggested scrim sessions before the match: day = days from today (1 = tomorrow, never past MATCH.days_left), partner = a name from PARTNERS (prefer ones resembling the opponent) or "internal", focus = one of our_focus.',
    '- watch_out: up to 3 risks, only from the material.',
    `- ${NUMBERS_RULE}`,
    '- Use only the material. Do not invent heroes, players, strategies or partners. Write in the language the coaches used.',
    `- ${SAFE_RULE}`,
    '- If the material is too thin, say so in summary and keep the lists short or empty.',
  ].join('\n');
}

export function brResultPrompt() {
  return [
    'You read one PUBG Mobile screenshot taken by a national-team coach after a scrim match and return what it shows as JSON.',
    'Screens: TEAM RESULT (screen_kind "team_result"): the screenshot owner\'s team placement ("#3", "Peringkat 3" or "Winner Winner Chicken Dinner" = 1), map name if shown, and per player name, kills (finishes), damage, survival time. LOBBY STANDINGS (screen_kind "lobby_standings", custom-room or tournament result list): rank, team name, kills and points per team.',
    'Rules:',
    '- Read only what is visible. Never estimate or complete a number: use -1 when a value is not shown or not readable, and set uncertain=true on that player.',
    '- survived_seconds: convert mm:ss to seconds; -1 if not shown. team_kills: the team kill total if printed, else the sum is NOT computed: use -1.',
    '- map: as printed (Erangel, Miramar, Sanhok, Vikendi, Livik, Rondo...), "" if not shown. placement: -1 if not shown.',
    '- lobby: [] unless the screen lists several teams.',
    '- notes: one short sentence about anything the coach must check. Empty if none.',
    '- If the screenshot is not a result screen, return screen_kind "other", readable=false and empty lists.',
  ].join('\n');
}

// ---------------------------------------------------------------- request / response helpers
export function messagesRequest({ model = DEFAULT_MODEL, system, content, schema, maxTokens = 4096 }) {
  return {
    model,
    max_tokens: maxTokens,
    // One cacheable block: the instructions and hero list repeat for every screenshot, so calls after the
    // first within 5 minutes read them from the prompt cache (about a tenth of the input price or less).
    system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
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

export const usageOf = (resp) => ({ input_tokens: resp?.usage?.input_tokens || 0, output_tokens: resp?.usage?.output_tokens || 0,
  cache_read_tokens: resp?.usage?.cache_read_input_tokens || 0, cache_write_tokens: resp?.usage?.cache_creation_input_tokens || 0 });

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
