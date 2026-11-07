# Local test stack (V1.13)

Runs the website, the database rules and the scrim-ai function together on one machine, without touching
Supabase or Vercel. Used on 7 Nov 2026 to test V1.13 end to end.

| Part | What runs | Real or stand-in |
|---|---|---|
| Database | Postgres 16 + `tests/db/supabase_stub.sql` + the Supabase Storage schema (`supabase/storage` repo, `migrations/tenant`) + all `supabase/migrations` | real rules (RLS, triggers, storage policies) |
| REST API | PostgREST 12.2.3 | real |
| scrim-ai | `supabase/functions/scrim-ai/index.ts` under Deno, `@supabase/supabase-js` via an import map | real code |
| Sign-in | small stand-in issuing signed JWTs (`/auth/v1/token`, `/user`) | stand-in |
| File upload | stand-in that inserts into `storage.objects` **as the user**, so the real storage policies decide | stand-in (rules real) |
| AI | stand-in for the Messages API (`ANTHROPIC_BASE_URL`), answers from a queue | stand-in |
| Website | `HUB_LOCAL_STACK=1 SUPABASE_URL=http://127.0.0.1:54321 … npm run build:web`, served with the `vercel.json` headers | real build |

`function_it.mjs` is the function's integration test (9 steps: storage path per title, title permission,
file type and size, wrong-form AI answer, daily cap, insert-only games, CORS). Not covered: live updates
(the stand-in has no realtime), real Supabase Auth emails, and the real AI model.
