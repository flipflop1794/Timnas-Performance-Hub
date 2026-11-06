// Screenshot test set for AI capture (V1.13): sends each real screenshot in data/eval/<mlbb|dota>/ to the
// model with the production prompt and schema, runs the hub's own checks, and compares the result with the
// hand-entered answer next to it (<name>.json, same shape as a confirmed game's players: side, player,
// hero, kills, deaths, assists, ... plus ourSide, result, durationS). Prints per-field accuracy.
// Run it before changing the prompt or the model, and after each game client update:
//   ANTHROPIC_API_KEY=... node tools/eval_screenshots.mjs [mlbb|dota] [--model claude-sonnet-5-5]
// Screenshots stay on this computer; only the model call leaves it.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { scoreboardSchema, scoreboardPrompt, messagesRequest, imageBlock, parseModelJson, DEFAULT_MODEL, PROMPT_VERSION } from '../supabase/functions/_shared/scrim_spec.js';
import { HEROES } from '../supabase/functions/_shared/catalog.gen.js';
import { heroIndex, proposeGame, STAT_DEFS } from '../src/core/capture.js';

const key = process.env.ANTHROPIC_API_KEY; if (!key) { console.error('Set ANTHROPIC_API_KEY.'); process.exit(1); }
const games = process.argv.slice(2).filter((a) => ['mlbb', 'dota'].includes(a));
const mi = process.argv.indexOf('--model'); const model = mi > 0 ? process.argv[mi + 1] : DEFAULT_MODEL;
const TITLE = { mlbb: 'MLBB', dota: 'Dota 2' };
const TYPE = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' };
const roster = JSON.parse(readFileSync(new URL('../data/eval/roster.json', import.meta.url), 'utf8'));

for (const game of games.length ? games : ['mlbb', 'dota']) {
  const dir = new URL(`../data/eval/${game}/`, import.meta.url);
  if (!existsSync(dir)) { console.log(`${game}: no data/eval/${game}/ folder yet.`); continue; }
  const heroes = heroIndex(HEROES[game].map((name) => ({ name })));
  const files = readdirSync(dir).filter((f) => TYPE[f.split('.').pop().toLowerCase()] && existsSync(new URL(f.replace(/\.[^.]+$/, '.json'), dir)));
  const tally = {}; const bump = (k, ok) => { tally[k] ||= [0, 0]; tally[k][0] += ok ? 1 : 0; tally[k][1] += 1; };
  for (const f of files) {
    const want = JSON.parse(readFileSync(new URL(f.replace(/\.[^.]+$/, '.json'), dir), 'utf8'));
    const b64 = readFileSync(new URL(f, dir)).toString('base64');
    const req = messagesRequest({ model, system: scoreboardPrompt(game, heroes.names), schema: scoreboardSchema(game), content: [imageBlock(b64, TYPE[f.split('.').pop().toLowerCase()]), { type: 'text', text: `Title: ${TITLE[game]}. Read this end-of-game screen.` }] });
    const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' }, body: JSON.stringify(req) });
    let got; try { got = proposeGame({ title: TITLE[game], raw: parseModelJson(await r.json()), roster: roster[TITLE[game]] || [], heroes }); } catch (e) { console.log(`${f}: ${e.message}`); continue; }
    bump('ourSide', got.ourSide === want.ourSide); bump('result', got.result === want.result); bump('durationS', got.durationS === want.durationS);
    want.players.forEach((w, i) => {
      const g = got.players.find((p) => p.side === w.side && p.slot === w.slot) || got.players[i] || { stats: {} };
      bump('hero', g.hero === w.hero); bump('player', (g.player || '') === (w.player || ''));
      for (const d of STAT_DEFS[game]) if (w[d.key] != null) bump(d.key, g.stats?.[d.key] === w[d.key]);
    });
    console.log(`${f}: ${got.issues.length} issue(s) flagged`);
  }
  console.log(`\n${TITLE[game]} — ${files.length} screenshot(s), model ${model}, prompt ${PROMPT_VERSION}`);
  for (const [k, [ok, n]] of Object.entries(tally)) console.log(`  ${k.padEnd(13)} ${ok}/${n}  ${Math.round((ok / n) * 100)}%`);
}
