// The scrim-ai server function's logic, in plain JavaScript so it is tested in Node with fakes
// (tests/scrim_ai_handler.test.js) and run unchanged in the Supabase Edge Function (scrim-ai/index.ts).
//
// Every request runs AS THE SIGNED-IN COACH: the Supabase client carries their session, so storage
// uploads, capture rows and usage rows pass the same Row Level Security as the website. There is no
// service-role key in this function. The AI key lives only in the function's secrets.
//
// Actions:
//   scoreboard / draft  { title, image: { data: base64, mediaType }, day }  -> { captureId, raw, model }
//   debrief             { title, text, roster: [names] }                   -> { raw, model }
//   digest              { title, facts: [...], excerpts: [...] }           -> { raw, model }
import {
  PROMPT_VERSION, DEFAULT_MODEL, LIMITS, gameOf, scoreboardSchema, draftSchema, debriefSchema, digestSchema, planSchema,
  scoreboardPrompt, draftPrompt, debriefPrompt, digestPrompt, planPrompt, messagesRequest, imageBlock, parseModelJson, usageOf, capturePath,
  tagsSchema, tagsPrompt, tagsOf, summarySchema, summaryPrompt, prepSchema, prepPrompt, brResultSchema, brResultPrompt,
  weeklySchema, weeklyPrompt, metaExtractSchema, metaExtractPrompt, metaFitSchema, metaFitPrompt,
  prematchSchema, prematchPrompt, scoutDaySchema, scoutDayPrompt, brainstormSchema, brainstormPrompt,
} from './scrim_spec.js';

// V1.20: summary (weekly, all titles), prep (one WEC match), tags (weakness labels), br_result (PUBG Mobile screenshot).
const ACTIONS = ['scoreboard', 'draft', 'debrief', 'digest', 'plan', 'summary', 'prep', 'tags', 'br_result', 'weekly', 'meta_extract', 'meta_fit', 'prematch', 'scout_day', 'brainstorm'];
const IMAGE_ACTIONS = ['scoreboard', 'draft', 'br_result'];
// Calls per day (WIB) for the whole staff, unless the TEAM_DAILY_CALL_CAP secret says otherwise.
export const TEAM_DAILY_CAP = 600;
export const RETRIES = 2;
const RETRYABLE = [429, 500, 502, 503, 504, 529];
export function backoff(attempt, retryAfter) {
  const ra = Number(retryAfter);
  if (Number.isFinite(ra) && ra > 0) return Math.min(8000, ra * 1000);
  return attempt === 1 ? 1000 : 3000;
}
const json = (status, body) => ({ status, body });
const fail = (status, error) => json(status, { error });

// base64 -> bytes, refusing anything that is not plain base64.
function decode(b64) {
  if (typeof b64 !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(b64)) throw new Error('bad image');
  const bin = atob(b64); const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
// Magic bytes, so a renamed file of another kind is refused before it reaches storage or the AI.
function sniff(bytes) {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png';
  if (String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP') return 'image/webp';
  return '';
}

// deps: { env: { ANTHROPIC_API_KEY, SCRIM_AI_MODEL?, DAILY_CALL_CAP? }, fetch, clientFor(authHeader), uuid(), heroes: { mlbb: [...], dota: [...] }, now() }
export async function handle(req, deps) {
  if (req.method !== 'POST') return fail(405, 'Use POST.');
  const auth = req.headers.authorization || req.headers.Authorization || '';
  if (!/^Bearer\s+\S+/.test(auth)) return fail(401, 'Sign in first.');
  let body; try { body = await req.json(); } catch { return fail(400, 'Bad request.'); }
  // V1.15: the hub asks once after sign-in whether AI is switched on (no AI call, nothing logged).
  // V1.18: only a signed-in session gets the answer.
  if (body?.action === 'ping') {
    const { data: me, error: pingErr } = await deps.clientFor(auth).auth.getUser();
    if (pingErr || !me?.user) return fail(401, 'Sign in first.');
    return json(200, { ok: true, ai: !!deps.env.ANTHROPIC_API_KEY, actions: ACTIONS });
  }
  if (!deps.env.ANTHROPIC_API_KEY) return fail(503, 'AI capture is not switched on yet (the AI key is not set on the server). Enter the values by hand.');
  const { action, title } = body || {};
  if (!ACTIONS.includes(action)) return fail(400, 'Unknown action.');
  const game = gameOf(title);
  if (['scoreboard', 'draft'].includes(action) && !game) return fail(400, `Screenshot capture is not set up for ${title}.`);
  if (action === 'br_result' && title !== 'PUBG Mobile') return fail(400, 'This screenshot reader is for PUBG Mobile.');
  // The weekly summary covers every title: only those who write every title (Head Coach, admin) may ask for it.
  const allTitles = action === 'summary';
  if (!allTitles && (typeof title !== 'string' || !title)) return fail(400, 'Title is required.');

  const db = deps.clientFor(auth);
  const { data: who, error: authErr } = await db.auth.getUser();
  if (authErr || !who?.user) return fail(401, 'Your session has ended. Sign in again.');
  const { data: canWrite, error: permErr } = await db.rpc('can_write_title', { t: allTitles ? null : title });
  if (permErr || canWrite !== true) return fail(403, allTitles ? 'The weekly summary is written by the Head Coach or an admin.' : `You are not assigned to ${title}. Ask the admin for access.`);
  const cap = Number(deps.env.DAILY_CALL_CAP || 300);
  const { data: used } = await db.rpc('ai_calls_today');
  if (Number(used) >= cap) return fail(429, `Daily AI limit reached (${cap} calls). Enter the values by hand today, or ask the admin to raise the limit.`);
  // V1.16: one limit for the whole staff as well, so many coaches together cannot run up the bill.
  const teamCap = Number(deps.env.TEAM_DAILY_CALL_CAP || TEAM_DAILY_CAP);
  const { data: teamUsed, error: teamErr } = await db.rpc('ai_calls_today_all');
  if (!teamErr && Number(teamUsed) >= teamCap) return fail(429, `The staff's daily AI limit is reached (${teamCap} calls). Enter the values by hand today, or ask the admin to raise TEAM_DAILY_CALL_CAP.`);

  const model = deps.env.SCRIM_AI_MODEL || DEFAULT_MODEL;
  let request; let bytes = null; let mediaType = '';
  try {
    if (IMAGE_ACTIONS.includes(action)) {
      bytes = decode(body.image?.data);
      if (bytes.length > LIMITS.imageBytes) return fail(413, 'The screenshot is too large (over 2.5 MB). Take it again or crop it.');
      mediaType = sniff(bytes);
      if (!mediaType) return fail(415, 'This file is not a WebP, JPEG or PNG image.');
      if (action === 'br_result') {
        request = messagesRequest({ model, system: brResultPrompt(), schema: brResultSchema(), maxTokens: 2048,
          content: [imageBlock(body.image.data, mediaType), { type: 'text', text: 'Title: PUBG Mobile. Read this end-of-match screen.' }] });
      } else {
        const names = deps.heroes[game] || [];
        request = messagesRequest({
          model, system: action === 'scoreboard' ? scoreboardPrompt(game, names) : draftPrompt(game, names),
          schema: action === 'scoreboard' ? scoreboardSchema(game) : draftSchema(game),
          content: [imageBlock(body.image.data, mediaType), { type: 'text', text: `Title: ${title}. Read this ${action === 'scoreboard' ? 'end-of-game screen' : 'draft screen'}.` }],
        });
      }
    } else if (action === 'tags') {
      const clip = (v, n = 500) => String(v ?? '').slice(0, n);
      if (!tagsOf(title).length) return fail(400, `No weakness tags are set up for ${title}.`);
      const reports = (Array.isArray(body.reports) ? body.reports : []).slice(0, LIMITS.tagReports).map((r) => ({ id: clip(r.id, 60), failed: clip(r.failed), adjustment: clip(r.adjust) }));
      if (!reports.length) return fail(400, 'No reports to tag.');
      request = messagesRequest({ model, system: tagsPrompt(title), schema: tagsSchema(title), maxTokens: 1500, content: [{ type: 'text', text: JSON.stringify({ REPORTS: reports }) }] });
    } else if (action === 'summary' || action === 'prep') {
      const payload = JSON.stringify(body.material || {});
      if (payload.length < 20) return fail(400, 'Nothing to summarise yet.');
      if (payload.length > 60000) return fail(413, 'Too much material for one call.');
      request = messagesRequest({ model, system: action === 'summary' ? summaryPrompt() : prepPrompt(title), schema: action === 'summary' ? summarySchema() : prepSchema(), maxTokens: 2500, content: [{ type: 'text', text: payload }] });
    } else if (action === 'weekly' || action === 'meta_fit') {
      const payload = JSON.stringify(body.material || {});
      if (payload.length < 20) return fail(400, 'Nothing to draft from yet.');
      if (payload.length > 60000) return fail(413, 'Too much material for one call.');
      request = messagesRequest({ model, system: action === 'weekly' ? weeklyPrompt(title) : metaFitPrompt(title), schema: action === 'weekly' ? weeklySchema() : metaFitSchema(), maxTokens: action === 'weekly' ? 1200 : 2000, content: [{ type: 'text', text: payload }] });
    } else if (action === 'prematch' || action === 'scout_day') {
      const payload = JSON.stringify(body.material || {});
      if (payload.length < 20) return fail(400, 'Nothing to brief from yet: log some observations first.');
      if (payload.length > 60000) return fail(413, 'Too much material for one call.');
      request = messagesRequest({ model, system: action === 'prematch' ? prematchPrompt(title) : scoutDayPrompt(title), schema: action === 'prematch' ? prematchSchema() : scoutDaySchema(), maxTokens: 1800, content: [{ type: 'text', text: payload }] });
    } else if (action === 'brainstorm') {
      const question = String(body.question || '').trim();
      if (!question) return fail(400, 'Ask a question first.');
      if (question.length > 1500) return fail(413, 'Keep the question under 1,500 characters.');
      const history = (Array.isArray(body.history) ? body.history : []).slice(-8).map((h) => ({ role: h.role === 'ai' ? 'ai' : 'staff', text: String(h.text || '').slice(0, 1500) }));
      const material = JSON.stringify(body.material || {});
      if (material.length > 50000) return fail(413, 'Too much material for one call.');
      // The material is the same for every message of a session: cached after the first one.
      request = messagesRequest({ model, system: `${brainstormPrompt(title, body.purpose)}\n\nMATERIAL:\n${material}`, schema: brainstormSchema(), maxTokens: 1500,
        content: [{ type: 'text', text: JSON.stringify({ PREFS: (Array.isArray(body.prefs) ? body.prefs : []).slice(0, 10).map((p) => String(p).slice(0, 200)), HISTORY: history, QUESTION: question }) }] });
    } else if (action === 'meta_extract') {
      const text = String(body.text || '').trim();
      if (!text) return fail(400, 'Paste the text first.');
      if (text.length > LIMITS.metaChars) return fail(413, `Paste at most ${LIMITS.metaChars} characters at a time.`);
      request = messagesRequest({ model, system: metaExtractPrompt(title), schema: metaExtractSchema(), maxTokens: 3000, content: [{ type: 'text', text: JSON.stringify({ SOURCE: String(body.source || '').slice(0, 200), TEXT: text }) }] });
    } else if (action === 'debrief') {
      const text = String(body.text || '').trim();
      if (!text) return fail(400, 'Type or dictate the note first.');
      if (text.length > LIMITS.debriefChars) return fail(413, `Keep the note under ${LIMITS.debriefChars} characters.`);
      const roster = (Array.isArray(body.roster) ? body.roster : []).map(String).slice(0, 12);
      // V1.26: the session's planned drills, so the note can be read per drill.
      const blocks = (Array.isArray(body.blocks) ? body.blocks : []).slice(0, 4).map((b, i) => `${i}. ${String(b.name || '').slice(0, 80)} — criterion: ${String(b.criterion || '').slice(0, 200)}`);
      const content = blocks.length ? `PLANNED DRILLS:\n${blocks.join('\n')}\n\nNOTE:\n${text}` : text;
      request = messagesRequest({ model, system: debriefPrompt(title, roster), schema: debriefSchema(), maxTokens: 2048, content: [{ type: 'text', text: content }] });
    } else if (action === 'plan') {
      const clip = (v, n = 400) => String(v ?? '').slice(0, n);
      const reports = (Array.isArray(body.reports) ? body.reports : []).slice(0, LIMITS.planReports).map((r) => ({
        id: clip(r.id, 60), date: clip(r.date, 10), partner: clip(r.partner, 80), result: clip(r.result, 60), focus: clip(r.focus), plan_followed: Number(r.progress) || null,
        worked: clip(r.worked), failed: clip(r.failed), adjustment: clip(r.adjust), previous_adjustment: clip(r.prevAdjust), previous_adjustment_check: clip(r.fixCheck, 40) }));
      if (!reports.length) return fail(400, 'No scrim reports yet for this title: file one first.');
      const findings = (Array.isArray(body.findings) ? body.findings : []).slice(0, LIMITS.planFindings).map((f) => ({ id: clip(f.id, 60), claim: clip(f.claim), staff_mark: clip(f.status, 20) }));
      const objectives = (Array.isArray(body.objectives) ? body.objectives : []).slice(0, 8).map((o) => clip(o, 200));
      // V1.26: what the timed drills should start from (computed by the hub).
      const m = body.material || {};
      const list = (v, n) => (Array.isArray(v) ? v : []).slice(0, n);
      request = messagesRequest({ model, system: planPrompt(title), schema: planSchema(), maxTokens: 2000, content: [{ type: 'text', text: JSON.stringify({ REPORTS: reports, FINDINGS: findings, OBJECTIVES: objectives,
        UNFIXED: list(m.unfixed, 4), WEAKNESSES: list(m.weaknesses, 6), THEMES: list(m.themes, 4) }) }] });
    } else {
      const facts = (Array.isArray(body.facts) ? body.facts : []).slice(0, LIMITS.digestFacts);
      const feedback = (Array.isArray(body.feedback) ? body.feedback : []).slice(0, LIMITS.digestFeedback);
      const excerpts = (Array.isArray(body.excerpts) ? body.excerpts : []).slice(0, LIMITS.digestExcerpts);
      if (!facts.length) return fail(400, 'No confirmed games yet: nothing to look for patterns in.');
      const payload = JSON.stringify({ FACTS: facts, EXCERPTS: excerpts, FEEDBACK: feedback });
      if (payload.length > 120000) return fail(413, 'Too much data for one digest. Pick a shorter period.');
      request = messagesRequest({ model, system: digestPrompt(title), schema: digestSchema(), maxTokens: 3000, content: [{ type: 'text', text: payload }] });
    }
  } catch (e) { return fail(400, e.message === 'bad image' ? 'The screenshot could not be read. Upload it again.' : e.message); }

  // Upload first: the screenshot is kept (90 days) so any extracted number can be traced back.
  const id = deps.uuid();
  let storagePath = '';
  if (bytes) {
    const day = /^\d{4}-\d{2}-\d{2}$/.test(body.day || '') ? body.day : deps.now().toISOString().slice(0, 10);
    storagePath = capturePath(title, day, id, mediaType);
    const up = await db.storage.from('scrim-captures').upload(storagePath, bytes, { contentType: mediaType, upsert: false });
    if (up.error) return fail(403, `The screenshot could not be stored (${up.error.message}).`);
  }

  let resp; let raw; let errText = ''; let attempts = 0;
  const sleep = deps.sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));
  try {
    const base = (deps.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com').replace(/\/+$/, '');
    // Busy or passing server errors are retried twice (about 1 s, then 3 s; the service's retry-after is
    // followed up to 8 s) so a coach at the pelatnas does not have to press again.
    for (;;) {
      attempts++;
      let r;
      try {
        r = await deps.fetch(`${base}/v1/messages`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-api-key': deps.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
          body: JSON.stringify(request),
        });
      } catch (netErr) {
        if (attempts <= RETRIES) { await sleep(backoff(attempts, null)); continue; }
        throw new Error('The AI service could not be reached. Check the connection and try again.');
      }
      resp = await r.json().catch(() => null);
      if (!r.ok && RETRYABLE.includes(r.status) && attempts <= RETRIES) { await sleep(backoff(attempts, r.headers?.get?.('retry-after'))); continue; }
      if (!r.ok) throw new Error(r.status === 429 || r.status === 529 ? 'The AI service is busy. Try again in a minute.' : `The AI service returned an error: ${resp?.error?.message || r.status}.`);
      break;
    }
    raw = parseModelJson(resp);
  } catch (e) { errText = e.message || 'AI call failed.'; }

  const u = usageOf(resp);
  await db.from('ai_usage').insert({ title: allTitles ? null : title, action, model, input_tokens: u.input_tokens, output_tokens: u.output_tokens, cache_read_tokens: u.cache_read_tokens, cache_write_tokens: u.cache_write_tokens, attempts, ok: !errText, error: errText.slice(0, 300) });
  if (errText) return fail(502, `${errText} You can enter the values by hand.`);

  if (bytes) {
    const rec = { title, kind: action, storagePath, mediaType, model, promptVersion: PROMPT_VERSION, raw, status: 'extracted', origin: 'operational', createdAt: deps.now().toISOString() };
    const ins = await db.from('scrim_captures').insert({ id, data: rec });
    if (ins.error) return fail(403, `The reading could not be saved (${ins.error.message}).`);
    return json(200, { captureId: id, raw, model, promptVersion: PROMPT_VERSION });
  }
  return json(200, { raw, model, promptVersion: PROMPT_VERSION });
}

// CORS: only the hub's own site(s) may call the function from a browser.
export function corsHeaders(origin, allowed) {
  const list = String(allowed || '').split(',').map((s) => s.trim()).filter(Boolean);
  const ok = list.includes(origin);
  return {
    ...(ok ? { 'Access-Control-Allow-Origin': origin } : {}),
    Vary: 'Origin',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Max-Age': '600',
  };
}
