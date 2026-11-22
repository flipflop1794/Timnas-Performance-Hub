// V1.39: database functions closed to visitors who are not signed in; the one-paste live file matches the migration.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const mig = read('supabase/migrations/20261203120000_function_access.sql');

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

test('the V1.39 one-paste file is exactly its migration, in one transaction (no drift)', () => {
  const one = read('supabase/RUN_ON_LIVE_V1_39.sql');
  assert.ok(one.includes(mig)); assert.match(one, /^begin;$/m); assert.match(one, /^commit;$/m);
});
