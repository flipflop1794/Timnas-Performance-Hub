# Deploying the Timnas Performance Hub (GitHub → Supabase → Vercel)

Time needed: about 30 minutes, once. Nobody ever needs to paste a password or secret key into a chat:
the two values Vercel needs (project URL, anon key) are public by design, and access is enforced by the database.

## 1. Supabase (database + login)

1. supabase.com → New project. Name `timnas-hub`, region **Southeast Asia (Singapore)**, Free plan.
   Generate the database password and keep it in your password manager.
2. **SQL Editor → New query**: paste the whole of `supabase/migrations/20261105120000_core.sql` → Run.
   Then the same for `supabase/migrations/20261105120100_reference_data.sql`.
   (Or, with the Supabase CLI on your own machine: `supabase link` then `supabase db push`.)
3. **Authentication → Sign In / Providers → Email**: keep Email enabled; turn **"Allow new users to sign up" OFF** (invite-only).
4. **Authentication → URL Configuration**: Site URL = your Vercel URL (step 2.4), and add it under Redirect URLs.
5. **Authentication → Users → Invite user**: invite yourself. Open the email, follow the link: the hub asks you to set a password.
6. **SQL Editor**: open `supabase/bootstrap_admin.sql`, replace the email with yours, Run. You are now admin
   (and linked to Aufa's staff routing, assigned Dota 2 and MLBB).
7. **Project Settings → API**: copy the **Project URL** and the **anon / publishable key** for Vercel.
   Never use the `service_role` / secret key anywhere in the website (the build refuses it).

## 2. Vercel (website)

1. vercel.com → Add New → Project → import `Timnas-Performance-Hub` from GitHub. Framework: Other (vercel.json sets everything).
2. Environment Variables (Production and Preview): `SUPABASE_URL` = Project URL, `SUPABASE_ANON_KEY` = anon key.
3. Deploy. Every push to `main` deploys production; every other branch or pull request gets its own preview URL (staging).
4. Copy the production URL into Supabase step 1.4.

Plan note: Vercel Hobby (free) is for non-commercial use. If PB ESI counts as commercial use, switch to Pro, or host
`dist-web/` on Cloudflare Pages (free; build command `npm run build:web`, output `dist-web`, same two variables;
copy the headers from vercel.json into a `_headers` file).

## 3. People and access

- Invite each person (Supabase → Authentication → Users → Invite user). They set their own password from the email.
- In the hub, **Staff → Users & access** (admins only): tick roles and assigned titles, set "Staff routing" for Fayad and Donny.

| Role | Reads | Writes | Approves proposals | Wellbeing |
|---|---|---|---|---|
| Admin | all titles | all titles | all | yes |
| Head Coach (Fayad) | all titles | all titles | all | no (until decided) |
| Assistant coach (Aufa, Donny) | all titles | assigned titles | assigned titles | no |
| Readiness owner (Donny) | — | — | — | yes |
| Title coach / analyst | assigned titles | assigned titles | no | no |

Wellbeing stays limited to the readiness owner and admins until the Head Coach decides otherwise (decision log).

Email limits: Supabase's built-in email sends only a few emails per hour. For many invites or password resets, either
invite in small batches, or set up custom SMTP (Authentication → Emails → SMTP, e.g. a free Resend account).
Alternative without email: Authentication → Users → Add user → Create new user (auto-confirm) with a temporary password
given to the person in person; they change it after signing in (Forgot password).

## 4. Backups and recovery

- **Nightly encrypted backup** (`.github/workflows/backup.yml`, 02:00 WIB): add repository secrets `SUPABASE_DB_URL`
  (Supabase → Connect → Session pooler string) and `BACKUP_PASSPHRASE` (store it in your password manager).
  Run it once by hand: Actions → Nightly database backup → Run workflow. Files are kept 30 days.
- **Manual export:** Staff → Users & access → Export all data (JSON). Contains wellbeing data: store securely.
- **Restore** (new or same project):
  1. Download the artifact; `gpg -d hub-backup-<stamp>.tgz.gpg > b.tgz && tar xzf b.tgz`.
  2. New project: run both migrations (section 1.2).
  3. `psql "$SUPABASE_DB_URL" -f auth.sql` then `psql "$SUPABASE_DB_URL" -c "set session_replication_role = replica;" -f public.sql`
     (replica mode skips triggers so authors and dates are kept exactly).
  4. Update the Vercel variables if the project changed; redeploy.
- Supabase's own backups depend on the plan; the nightly dump above works on every plan.
- Free projects pause after about a week without use: open the hub (or the Supabase dashboard) at least weekly.

## 5. Rollback

- **Website:** Vercel → Deployments → pick the last good one → "Promote to Production" (instant). Or `git revert` and push.
- **Database:** migrations are additive. To undo a later migration, write a new one that reverses it; never edit an applied file.
  For data mistakes: the `audit_log` table (admins) holds every change with the previous row.

## 6. Release checklist (smoke test)

1. Production URL loads the sign-in page; unknown visitors see nothing else.
2. A title coach signs in on a phone, files a scrim report, signs out, signs in again: the report is there.
3. Fayad (another account, another device) sees the report without reloading.
4. A coach of another title does not see it and cannot file for that title.
5. Fayad opening Performance → Wellbeing check sees "Restricted"; Donny sees the page.
6. All seven title sections open. EN | ID switch works.
7. GitHub → Actions: CI green on the deployed commit; backup run succeeded.
