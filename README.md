# Timnas Performance Hub

Coaching hub for Indonesia's national esports teams at IESF WEC 2026 (15–20 Dec 2026, ICE BSD City):
seven title hubs (Dota 2, PUBG Mobile, MLBB, MLBB Women, eFootball, CS2, CS2 Women), daily scrim reports,
coaching objectives with review and approval, scouting and opponent cards, match-day runbooks, player plans,
weekly brief, readiness preview, English / Bahasa Indonesia.

- **Website** (V1.11): Supabase (login, Postgres with Row Level Security, realtime) + Vercel. See `docs/DEPLOY.md`.
- **Architecture:** `docs/ARCHITECTURE.md`. **Limitations and backlog:** `docs/KNOWN_LIMITATIONS.md`.
- Release notes per version: `docs/HUB_V1_*.md`.

## Develop

```
npm ci
npm test                 # all tests; database tests need Postgres (DATABASE_URL), skipped if none
npm run typecheck
npm run build            # dist/hub.html — Claude artifact version
SUPABASE_URL=… SUPABASE_ANON_KEY=… npm run build:web   # dist-web/ — website
```

Secrets never go in the repository. The website needs only the public anon key; the build refuses a service key.
