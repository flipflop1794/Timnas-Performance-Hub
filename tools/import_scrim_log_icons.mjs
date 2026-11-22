// Populate the local reference portraits required by Scrim Log's on-device scanner.
// Hero IDs follow the Scrim Log catalogue; eight newer official portraits are already
// copied from its dated public/hero-icons/2026-09-16 set.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const heroes = JSON.parse(readFileSync(new URL('data/mlbb/heroes.json', root))).heroes.map((x) => x.name);
const ids = JSON.parse(readFileSync(new URL('data/mlbb/scrim_log_hero_ids.json', root)));
const key = (name) => name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
const aliases = { yss: 'yisunshin' };
const out = new URL('public/mlbb-icons/', root);
mkdirSync(out, { recursive: true });
const manifest = {};
const missing = [];

for (let offset = 0; offset < heroes.length; offset += 40) {
  const batch = heroes.slice(offset, offset + 40);
  const titles = batch.map((name) => ids[aliases[key(name)] || key(name)]).filter(Boolean)
    .map((id) => `File:Hero${String(id).padStart(2, '0')}1-icon.png`).join('|');
  const url = `https://mobile-legends.fandom.com/api.php?action=query&titles=${encodeURIComponent(titles)}&prop=imageinfo&iiprop=url|mime|size&format=json`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Hero catalogue returned ${response.status}`);
  const pages = Object.values((await response.json()).query?.pages || {});
  const byId = new Map(pages.map((page) => [Number(page.title?.match(/^File:Hero(\d+)1-icon\.png$/i)?.[1]), page.imageinfo?.[0]])
    .filter(([id, info]) => id && info?.url && info.mime === 'image/png'));
  for (const name of batch) {
    const normalized = key(name);
    const file = new URL(`${normalized}.png`, out);
    const id = ids[aliases[normalized] || normalized];
    const info = byId.get(id);
    if (!info) { missing.push(name); continue; }
    const source = info.url.replace(/\/revision\/latest(?:\?.*)?$/i, '');
    manifest[normalized] = { name, id, source };
    if (existsSync(file)) continue; // keep the eight newer official portraits
    const image = await fetch(source);
    if (!image.ok || !String(image.headers.get('content-type')).includes('image/')) { missing.push(name); continue; }
    writeFileSync(file, Buffer.from(await image.arrayBuffer()));
  }
}
writeFileSync(new URL('data/mlbb/scrim_log_icon_sources.json', root), JSON.stringify(manifest, null, 2) + '\n');
if (missing.length) throw new Error(`Portraits missing: ${missing.join(', ')}`);
console.log(`${heroes.length} hero portraits available locally.`);
