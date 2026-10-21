# PlanDon Terral

Execution plan app for Don and Terral. React + Vite + Supabase. Hosted on Cloudflare Pages (free tier).

## Local development

```bash
npx supabase start                 # local stack (needs Docker)
cp .env.example .env.local         # fill from: npx supabase status -o env
npm run import:load -- --reset     # load data/import into the local DB (creates the admin user)
npm run dev                        # http://localhost:5173
```

- `?today=YYYY-MM-DD` overrides "today" on any page (e.g. `/don/hoje?today=2026-11-10`).
- `npm test` runs the unit and RLS tests (needs the local stack).
- `npm run e2e` runs the Playwright smoke tests (needs the local stack with the import loaded; first time: `npx playwright install chromium`). It ticks and unticks one block on 2026-11-10 and restores the original state in teardown, even after a failed run. It creates and deletes its own `*.plandon.test` users and refuses to run unless `SUPABASE_URL` is localhost.

## Deploy (in this order)

1. **Create the Supabase project** (supabase.com, free plan). Note the project ref, URL, anon key and service-role key.
2. **Push the schema.** `npx supabase link --project-ref <ref>`, then `npx supabase db push` (migrations 0001 to 0009).
3. **Auth settings** (Dashboard, Authentication): turn off "Confirm email"; set minimum password length to 8; set Site URL to the Cloudflare Pages URL (add it to Redirect URLs).
4. **Edge Function.** Supabase injects `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` into Edge Functions, so there is no secret to set. Deploy: `npx supabase functions deploy set-temp-password`.
5. **Load the data.** Make a separate prod env file `.env.local` (never commit) with the prod `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `VITE_SUPABASE_*`, and a REAL `ADMIN_EMAIL` and a strong `ADMIN_PASSWORD`. Then `npm run import:load -- --reset --yes-remote`. Switch `.env.local` back to local values afterwards. First deploy only: `--reset` wipes the domain tables, comments, evidence and history. Never run it on a live project with real edits.
6. **Cloudflare Pages.** Connect the repo. Build command `npm run build`, output directory `dist`. Env vars: `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (anon key only). `public/_redirects` gives the SPA fallback.
7. **Keep it alive.** Supabase free projects pause after about 7 days without traffic. Daily use prevents it. If it pauses, restore it from the dashboard.

### Security checklist

- The service-role key lives only in `.env.local` (git-ignored) and the Edge Function secret. Never in Cloudflare env vars, never in the browser.
- After the first prod login, change the admin password.
- The `evidence` storage bucket stays private.
- Never run the e2e or RLS tests against prod. The e2e refuses non-local URLs; the RLS tests skip unless the URL is local.
- Each deploy or publish waits for the owner's go-ahead.
