// V1.41: database functions closed to visitors who are not signed in; the one-paste live file matches the migration.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const mig = read('supabase/migrations/20261204120000_function_access.sql');

test('the five functions the Supabase advisor flagged lose visitor access; signed-in users keep it', () => {
  for (const f of ['can_support_read()', 'can_support_write()', 'log_edit()', 'support_summary(date, date)', 'title_from_slug(text)']) assert.ok(mig.includes(`public.${f}`), f);
  assert.match(mig, /^revoke execute on function[\s\S]+?from public, anon;$/m);
  assert.match(mig, /^grant execute on function[\s\S]+?to authenticated;$/m);
});

test('new functions, tables and sequences start closed to visitors; search_path pinned on the two flagged functions', () => {
  assert.match(mig, /alter default privileges for role postgres in schema public revoke execute on functions from public, anon;/);
  assert.match(mig, /revoke all on tables from anon;/); assert.match(mig, /revoke all on sequences from anon;/);
  assert.match(mig, /alter function public\.block_update\(\) set search_path = public;/);
  assert.match(mig, /alter function public\.jsonb_prefix\(jsonb, jsonb\) set search_path = public;/);
});

test('the V1.41 one-paste file is exactly its migration, in one transaction (no drift)', () => {
  const one = read('supabase/RUN_ON_LIVE_V1_41.sql');
  assert.ok(one.includes(mig)); assert.match(one, /^begin;$/m); assert.match(one, /^commit;$/m);
});

// V1.45 audit: a per-schema default cannot close new functions (PostgreSQL grants EXECUTE to PUBLIC by a built-in
// rule), so every function a migration adds after the core file must be revoked from anon by name, in that file or a
// later one. The core file ends with a blanket revoke for its own functions.
test('every function added after the core migration is revoked from visitors by name', async () => {
  const { readdirSync } = await import('node:fs');
  const dir = new URL('../supabase/migrations/', import.meta.url);
  const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  const text = files.map((f) => readFileSync(new URL(f, dir), 'utf8'));
  const missing = []; const seen = new Set();
  // A function redefined later ("create or replace") keeps the access it had, so only its first creation counts.
  for (const m of text[0].matchAll(/create\s+(?:or\s+replace\s+)?function\s+public\.(\w+)\s*\(/gi)) seen.add(m[1]);
  files.forEach((f, i) => {
    if (i === 0) return;
    for (const m of text[i].matchAll(/create\s+(?:or\s+replace\s+)?function\s+public\.(\w+)\s*\(/gi)) {
      if (seen.has(m[1])) continue; seen.add(m[1]);
      const later = text.slice(i).join('\n');
      const revoked = [...later.matchAll(/revoke\s+(?:execute|all)\s+on\s+function\s+([\s\S]*?)\s+from\s+([^;]*);/gi)].some((r) => r[1].replace(/\s+/g, '').includes(`public.${m[1]}(`) && /\banon\b/.test(r[2]));
      if (!revoked) missing.push(`${f}: ${m[1]}`);
    }
  });
  assert.deepEqual([...new Set(missing)], []);
});
