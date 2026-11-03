// Bundles the hub page: engines + shipped data + UI into one self-contained HTML file.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { build } from 'esbuild';

const rd = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const data = {
  heroesCsv: rd('data/dota/heroes.csv'),
  inaCsv: rd('data/dota/ina_pro_matches.csv'),
  matches: JSON.parse(rd('data/dota/matches_parsed.json')).matches,
  opp: { MGL: JSON.parse(rd('data/dota/opp_MGL.json')) },
  rivalRosters: JSON.parse(rd('data/wec/rival_rosters.json')),
  rivalPools: JSON.parse(rd('data/wec/rival_dota_pools.json')),
  profiles: JSON.parse(rd('data/pubgm/scoring_profiles.json')).profiles,
  pubgmMatchesCsv: rd('data/pubgm/demo_matches.csv'),
  pubgmFightsCsv: rd('data/pubgm/demo_fights.csv'),
  builtAt: new Date().toISOString(),
};
writeFileSync(new URL('../src/hub/data.gen.js', import.meta.url), `export const DATA = ${JSON.stringify(data)};\n`);
const out = await build({ entryPoints: [new URL('../src/hub/app.js', import.meta.url).pathname], bundle: true, format: 'iife', write: false, minify: true, target: 'es2020' });
const js = out.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const html = rd('src/hub/index.html').replace('/*__APP__*/', () => js);
mkdirSync(new URL('../dist/', import.meta.url), { recursive: true });
writeFileSync(new URL('../dist/hub.html', import.meta.url), html);
console.log(`dist/hub.html ${(html.length / 1024).toFixed(0)} KB`);
