# PlanDon Terral Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the PlanDon Terral web app. It has one link with two roles. Don sees the full backstage of the Terral project. Terral sees a summary that the database enforces. The app is seeded once from the execution Google Sheet.

**Architecture:**
- A Vite + React + TypeScript single-page app talks directly to Supabase:
  - Postgres with row-level security (RLS)
  - Auth
  - Storage
  - Realtime
  - one Edge Function
- Terral-only access is enforced in SQL. Don-only columns live in Don-only side tables. Terral writes go through security-definer RPCs.
- A pure TypeScript risk engine runs on the client over whatever data the role can read.
- A one-time import turns JSON snapshots of the sheet into rows.

**Tech Stack:**

| Area | Tools |
|---|---|
| App | React 19, Vite, TypeScript (strict), react-router 7, @tanstack/react-query 5, motion (motion/react), @supabase/supabase-js 2 |
| Unit tests | Vitest, @testing-library/react |
| Browser tests | @playwright/test |
| Scripts | tsx |
| Backend | Supabase CLI via `npx supabase`, Docker for the local stack |
| Hosting | Cloudflare Pages |

**Spec:** `docs/superpowers/specs/2026-10-21-plandon-terral-design.md`. Read it before any task. The visual reference is `docs/design/home-mockup.html`.

## Global Constraints

- **Language.**
  - UI copy is Brazilian Portuguese.
  - Code, identifiers, commits and repo files are English.
  - DB columns and TS domain fields share the same snake_case names. There is no mapping layer.
- **Dates and numbers.**
  - Time zone: America/Sao_Paulo.
  - Dates show as dd/mm or dd/mm/aaaa.
  - Hours show with a decimal comma: "3,5 h".
  - Stored dates are ISO `YYYY-MM-DD`.
- **Light only.**
  - `color-scheme: light` on `:root`.
  - No `prefers-color-scheme: dark` rule anywhere.
  - No dark tokens.
- **Tokens.** Use these values exactly:

  | Token | Value |
  |---|---|
  | `--bg` | #F5F5F7 |
  | `--surface` | #FFFFFF |
  | `--ink` | #100F0F |
  | `--mute` | #86868B |
  | `--don` | #FF911A |
  | `--don-ink` | #B35C00 |
  | `--don-soft` | #FFF1E2 |
  | `--ok` | #1E9E5A |
  | `--warn` | #C27C00 |
  | `--bad` | #D93A2F |

  Each status color has a soft tint, taken from the mockup. The card radius is 18px.
- **Font.** The system font stack (`-apple-system, system-ui, …`). No Montserrat.
- **Motion.**
  - Springs: damping 1.0 (`bounce: 0`), response 0.3–0.4 s.
  - Feedback on pointer-down.
  - `prefers-reduced-motion` turns motion into cross-fades.
  - `prefers-reduced-transparency` makes surfaces solid.
- **Accessibility.**
  - WCAG AA contrast.
  - Visible focus.
  - Touch targets of at least 44px.
  - Full keyboard use.
- **What Terral never sees.** Never through the UI and never through the API:
  - Don hours, Don person names, tasks, blocks, load
  - manual risks, divergências (X-items), Don-only open items
  - `owner_raw`, history
- **Wording.**
  - The word "margem" never stands for "paridade".
  - Text shown to Terral names positions, not Don people.
  - Don authors are shown to Terral as "Equipe Don".
- **Secrets.**
  - The browser gets only the Supabase URL and anon key.
  - The service-role key lives only in `.env.local` (git-ignored, used by the import script) and in the Edge Function secret.
- **Data in the repo.** The sheet snapshot in `data/import/` is client data. The repo stays private, and nothing is pushed or deployed without the user's go-ahead.
- **Wrong counts.** If an import count does not match the Painel, stop and report. Never edit a test to make the data pass.

## Review Focus

1. **In-use dates as text.** In-use and window cells can hold text ranges ("23 e 24/11/2026", "de 30/11/2026 a 29/01/2027"), "—", or be blank. Parsing must give start/end or null and never throw. Owner: Task 1 and Task 2 tests.
2. **The check fails to save.** A check whose write fails (offline or RLS error) must roll back visibly with a message, not stay ticked. Owner: Task 9 test.
3. **Pending or blocked accounts.** A pending or blocked user has a valid session but must read nothing. Owner: Task 4 RLS test.
4. **"Today" outside the window.** Before 26/10/2026 or after 30/04/2027, the engine returns no false risks, and "Hoje" shows an empty state. Owner: Task 6 test, Task 9 empty state.
5. **Phone width.** At 375px, no screen scrolls sideways, even with long deliverable names. Owner: Task 14 Playwright check over every route.

---

## File Structure

```
plandon-app/
  package.json  vite.config.ts  tsconfig.json  index.html  .env.example  .gitignore  README.md
  public/_redirects                     # SPA fallback for Cloudflare Pages
  data/import/<tab>.json                # raw sheet snapshots, string[][] per tab
  supabase/config.toml
  supabase/migrations/0001_schema.sql   # tables
  supabase/migrations/0002_security.sql # app_role(), RLS, RPCs, storage
  supabase/migrations/0003_history.sql  # history trigger
  supabase/functions/set-temp-password/index.ts
  scripts/import/parse.ts               # raw tabs -> ImportResult (pure)
  scripts/import/load.ts                # ImportResult -> Supabase (service role), admin seed, verify
  src/domain/types.ts                   # all domain row types
  src/domain/dates.ts                   # parse/format pt-BR, today()
  src/domain/textGuard.ts               # banned words, owner rewrite, code extraction
  src/domain/risk.ts                    # risk engine + health
  src/domain/terralView.ts              # PlanData -> TerralData projection
  src/lib/supabase.ts                   # client
  src/lib/data.ts                       # usePlanData/useTerralData, realtime invalidation, mutations
  src/styles/tokens.css  src/styles/base.css
  src/ui/*.tsx                          # primitives (Card, Pill, Ring, Check, Toast, Sheet, Timeline, LoadBar, Empty)
  src/app/App.tsx  src/app/routes.ts  src/app/Shell.tsx
  src/auth/*.tsx                        # Login, Signup, Pending, Blocked, NewPassword, useSession
  src/don/*.tsx                         # one file per Don section
  src/terral/*.tsx                      # one file per Terral section
  src/shared/Comments.tsx  src/shared/Evidence.tsx  src/shared/HistoryList.tsx
  src/meeting/Meeting.tsx
  tests/*.test.ts(x)                    # Vitest, colocated by module name
  tests/rls.test.ts                     # needs the local Supabase running
  e2e/smoke.spec.ts
```

---

### Task 1: Repo scaffold, tokens, dates

**Files:**
- Create: the scaffold files above (package.json, vite, tsconfig, index.html, .gitignore with `.env.local` and `node_modules`)
- Create: `src/styles/tokens.css`, `src/styles/base.css`, `src/domain/dates.ts`, `tests/dates.test.ts`

**Interfaces:**
- Produces:
  - `type ISODate = string`
  - `parseBrDate(s: string): ISODate | null`
  - `parseBrRange(s: string): { start: ISODate | null; end: ISODate | null }`
  - `parseHours(s: string): number`
  - `fmtDate(d: ISODate, withYear?: boolean): string`
  - `fmtHours(h: number): string`
  - `today(): ISODate`
  - `addDays(d: ISODate, n: number): ISODate`
  - `diffDays(a: ISODate, b: ISODate): number` (a − b)
- `today()` reads `?today=YYYY-MM-DD` from the URL, then `import.meta.env.VITE_TODAY`, then the real date in America/Sao_Paulo.

- [ ] **Step 1: Init the repo.** In `plandon-app/`, run `git init`. Scaffold Vite react-ts and install the stack. Add the scripts: `dev`, `build`, `test` (vitest run), `e2e`, `import:parse`, `import:load`.
- [ ] **Step 2: Write the failing test** `tests/dates.test.ts`:

```ts
expect(parseBrDate('26/10/2026')).toBe('2026-10-26')
expect(parseBrDate('—')).toBeNull(); expect(parseBrDate('')).toBeNull()
expect(parseBrRange('23 e 24/11/2026')).toEqual({ start: '2026-11-23', end: '2026-11-24' })
expect(parseBrRange('de 30/11/2026 a 29/01/2027')).toEqual({ start: '2026-11-30', end: '2027-01-29' })
expect(parseBrRange('antes de 18/12/2026')).toEqual({ start: null, end: '2026-12-18' })
expect(parseBrRange('fora desta etapa')).toEqual({ start: null, end: null })
expect(parseBrRange('11/12/2026')).toEqual({ start: '2026-12-11', end: '2026-12-11' })
expect(parseHours('3,0')).toBe(3); expect(parseHours('1.331,5')).toBe(1331.5); expect(parseHours('2')).toBe(2)
expect(fmtHours(3.5)).toBe('3,5 h'); expect(fmtDate('2026-10-26')).toBe('26/10')
expect(diffDays('2026-11-06', '2026-10-27')).toBe(10)
```

- [ ] **Step 3: Run it.** `npx vitest run tests/dates.test.ts` must FAIL (module missing).
- [ ] **Step 4: Implement `src/domain/dates.ts`.** Do the date math on UTC midnight of the ISO date, so there is no DST drift.
- [ ] **Step 5: Run it again.** The test must PASS.
- [ ] **Step 6: Write the styles.**
  - `tokens.css`: the Global Constraints tokens plus the soft tints, copied from `docs/design/home-mockup.html`.
  - `base.css`: the type scale, with tracking set per size as in the mockup, `color-scheme: light`, and the reduced-motion and reduced-transparency rules.
- [ ] **Step 7: Commit.**

```bash
git add -A && git commit -m "chore: scaffold app, tokens, date utils"
```

  The commit includes `docs/`.

---

### Task 2: Sheet snapshot and parser

> Order: do Task 3 before this task's Step 4. The parser uses its helpers.
> PlanData keys are plural (`open_items_internal`). The tables are singular (`open_item_internal`). The loader and `data.ts` map between them with one constant, `TABLE_OF: Record<keyof PlanData, string>`, defined in `types.ts`.

**Files:**
- Create: `data/import/*.json`, `src/domain/types.ts`, `scripts/import/parse.ts`, `tests/parse.test.ts`

**Interfaces:**
- Consumes: `dates.ts`.
- Produces in `types.ts`: one row type per table in Task 4, with field names equal to the column names. The key types:
  - `Person`
  - `Deliverable`
  - `Task`
  - `Block`
  - `Ritual`, `RitualOccurrence`
  - `Decision`
  - `ToSchedule`, `ToSchedulePlan`
  - `OpenItem`, `OpenItemInternal`
  - `Goal`, `Traceability`, `Dependency`
  - `ManualRisk`
  - `Comment`, `Evidence`, `HistoryRow`, `Profile`
  - `type Severity = 'high' | 'medium' | 'low'`
  - `interface PlanData { people; deliverables; tasks; blocks; rituals; ritual_occurrences; decisions; to_schedule; to_schedule_plan; open_items; open_items_internal; goals; traceability; dependencies; manual_risks; comments; evidence }` (each one an array)
- Produces in `parse.ts`:
  - `type RawWorkbook = Record<TabName, string[][]>`
  - `parseWorkbook(raw: RawWorkbook): ImportResult`
  - `ImportResult = Omit<PlanData, 'manual_risks' | 'comments' | 'evidence'> & { warnings: string[] }`

- [ ] **Step 1: Snapshot the sheet (Claude in the session).**
  - Use the Google Sheets connector `get_values` on spreadsheet `1l_YzujPHJ52hFlWQBAfpdsi3O1Jp3Z3nEq2Op8J5hmI` for each of these tabs, rows 6 to end, all columns:
    - Painel (all rows)
    - Prioridades
    - Plano Diário
    - A Agendar
    - Entregáveis e Aceite
    - Governança (all rows)
    - Árvore de Metas
    - Pendências
    - Rastreabilidade Anexo A
  - Write each as `data/import/<slug>.json` holding the raw `values` array.
- [ ] **Step 2: Write the failing test** `tests/parse.test.ts`. It loads the real JSON files and checks the result.

```ts
const r = parseWorkbook(loadRaw())
expect(r.deliverables).toHaveLength(19)                 // 14 Escopo 2 + 5 instruments
expect(r.deliverables.filter(d => d.origin === 'instrumento')).toHaveLength(5)
expect(r.tasks).toHaveLength(85)
expect(r.blocks).toHaveLength(440)
expect(r.decisions.map(d => d.code)).toEqual(['D01', /* … */ 'D15'])
expect(r.decisions.find(d => d.code === 'D02')!.date).toBe('2026-11-06')
expect(r.open_items.filter(o => o.kind === 'pendencia').length).toBe(26)
expect(r.open_items.filter(o => o.kind === 'divergencia').length).toBe(6)
expect(sumBy(r.blocks, 'david')).toBeCloseTo(505.5); expect(sumBy(r.blocks, 'lucas')).toBeCloseTo(482); expect(sumBy(r.blocks, 'beto')).toBeCloseTo(240)
expect(r.to_schedule_plan.reduce((s, p) => s + p.hours, 0)).toBeCloseTo(104)
expect(r.to_schedule).toHaveLength(8)
expect(r.people.find(p => p.id === 'david')!.net_capacity_h).toBeCloseTo(667.3)
expect(r.people.find(p => p.id === 'lucas')!.net_capacity_h).toBeNull()
const d312 = r.deliverables.find(d => d.code === '3.12')!
expect([d312.in_use_start, d312.in_use_end]).toEqual(['2026-11-23', '2026-11-24'])
expect(r.open_items.find(o => o.code === 'X-04')!.visible_to_terral).toBe(false)
expect(r.open_items.find(o => o.code === 'P-26')!.visible_to_terral).toBe(true)
expect(r.open_items.find(o => o.code === 'P-01')!.owner_public).toBe('Diretoria Terral com a Don')
expect(r.rituals.length).toBeGreaterThanOrEqual(5)
expect(r.ritual_occurrences.length).toBeGreaterThan(0)
```

- [ ] **Step 3: Run it.** It must FAIL.
- [ ] **Step 4: Implement `parseWorkbook`.** The rules:
  - **Header row.** It is row index 0 of each snapshot. Stop at the first empty row. Skip note rows that start with "·".
  - **Empty values.** "—" means empty.
  - **People.** `id` is the lowercased name from `Quem`, for David, Lucas and Beto only. Rows owned by "Diretoria Terral" get `person_id = null`.
  - **Capacity.** David's `net_capacity_h` comes from Painel "Capacidade líquida". The defaults are `daily_cap_h` 8 and `weekly_cap_h` 40.
  - **Tasks.** One per Prioridades row.
    - `kind` from Prioridades: "Preparação de decisão" becomes `decision_prep`, "Decisão da diretoria" becomes `board_decision`, everything else is `task`.
    - `status` "Não iniciado" becomes `not_started`.
  - **Block → task link.** Link a block to the task with the same `code` and `person_id` whose `description` the block's description starts with. If none, use the earliest task with the same code and person whose due date is on or after the block date. If still none, set `task_id` null and add a warning.
  - **Ritual occurrences.** Each block of type "Rito" adds one occurrence, matched by ritual name.
  - **Governança.** Split it at the row "AS QUINZE DECISÕES COM DATA".
  - **Decision unlocks.** The "O que destrava" codes become `dependencies` with `from_kind = 'decision'` and `suggested = false`.
  - **Text links.** Use `extractCodes` from Task 3 on each open item's text and effect. Each code found becomes a dependency with `from_kind = 'open_item'` and `suggested = true`.
  - **Open item owners.** `owner_public` comes from `ownerPublic(raw)` (Task 3). `owner_raw` goes to `open_items_internal`.
  - **Open item visibility.** `visible_to_terral` is true when `kind = 'pendencia'` and the raw owner matches `/Terral|FP&A|Júlio|Diretoria/i`.
  - **Rows marked RESOLVIDA** get `status = 'resolved'`.
  - **A Agendar.**
    - `to_schedule.id` is the deliverable code plus an index.
    - `window_*` come from `parseBrRange`.
    - `to_schedule_plan` takes `person_id` from "Quem conduz" and `hours`.
  - **Totals.** Write no hours on deliverables or tasks. Compare the per-deliverable and per-task sums of block hours against the sheet columns, and push a warning for each mismatch.

  Task 2 depends on Task 3's helpers. Implement Task 3 first if you work in order, or stub the helpers.
- [ ] **Step 5: Run it again.** The test must PASS. If a count differs from the Painel, stop and report the exact difference. Do not change the expected numbers.
- [ ] **Step 6: Commit.**

```bash
git commit -am "feat(import): sheet snapshot and parser"
```

---

### Task 3: Text guard, owner rewrite, code extraction

**Files:**
- Create: `src/domain/textGuard.ts`, `tests/textGuard.test.ts`

**Interfaces:**
- Produces:
  - `DON_NAMES = ['David', 'Lucas', 'Beto', 'Roberto']`
  - `findBanned(text: string): string[]`. It matches whole words, ignoring case and accents.
  - `ownerPublic(raw: string): string`
  - `extractCodes(text: string): string[]`. It returns the deliverable codes 3.1–3.14 and I1–I5, unique, in order.

- [ ] **Step 1: Write the failing test.**

```ts
expect(findBanned('Preparar com David')).toEqual(['David'])
expect(findBanned('Davidson e margens')).toEqual([])   // whole word only
expect(findBanned('A MARGEM do canal')).toEqual(['margem'])
expect(ownerPublic('David com Júlio')).toBe('Diretoria Terral com a Don')
expect(ownerPublic('David')).toBe('Equipe Don')
expect(ownerPublic('Lucas e Beto')).toBe('Equipe Don')
expect(ownerPublic('FP&A')).toBe('FP&A'); expect(ownerPublic('Terral')).toBe('Terral')
expect(extractCodes('O 3.12 não tem data de uso; ver 3.1 e I2')).toEqual(['3.12', '3.1', 'I2'])
expect(extractCodes('247.47 h em 11/12/2026, R$ 105,6')).toEqual([])
```

- [ ] **Step 2: Run it.** It must FAIL.
- [ ] **Step 3: Implement.**
  - The code regex: `/(?<![\d.])(3\.(?:1[0-4]|[1-9])|I[1-5])(?![\d])/g`.
  - For accents, normalize with NFD and strip the combining marks.
- [ ] **Step 4: Run it again.** The test must PASS. Run the Task 2 parse test too.
- [ ] **Step 5: Commit.**

```bash
git commit -am "feat(domain): text guard and owner rewrite"
```

---

### Task 4: Database schema, security, history

**Files:**
- Create: `supabase/config.toml` (via `npx supabase init`), `supabase/migrations/0001_schema.sql`, `0002_security.sql`, `0003_history.sql`, `tests/rls.test.ts`, `tests/helpers/supa.ts`

**Interfaces:**
- **Tables.** Column names equal the `types.ts` fields. All tables are in `public`.
- **Don-only tables** (marked `[D]`):
  - `person` [D]: id text pk, name, net_capacity_h numeric null, daily_cap_h numeric default 8, weekly_cap_h numeric default 40
  - `task` [D]: id uuid, sort int, due date, kind, front, code, description, person_id, status
  - `block` [D]: id uuid, date, week, type, front, code, description, person_id, hours numeric, due, task_id → task on delete set null, done bool default false, done_at timestamptz
  - `to_schedule_plan` [D]: to_schedule_id pk, person_id, hours, distributed bool default false
  - `open_item_internal` [D]: code pk, owner_raw
  - `traceability` [D]
  - `manual_risk` [D]: id, title, severity, links text[], person_id, status, note, created_by
  - `history` [D]: id bigserial, table_name, row_ref, action, old jsonb, new jsonb, user_id, at
- **Shared tables:**
  - `deliverable`: code pk, name, front, origin, built_date, in_use_start, in_use_end, in_use_text, in_use_confirmed bool, built_at, in_use_at, target_ritual, terral_owner, published_flag text null, sort
  - `ritual`, `ritual_occurrence`
  - `decision`: code pk, title, date, prepared_on, status, outcome, decided_by, decided_at
  - `to_schedule`: id pk, code, what, window_start, window_end, window_text, confirmed_date
  - `open_item`: code pk, kind, text, owner_public, due, due_text, effect, status, visible_to_terral
  - `goal`
  - `dependency`: id uuid, from_kind, from_ref, to_code, suggested bool
  - `comment`: id, entity_kind, entity_ref, author_id, author_role, body, visible_to_terral bool default true, created_at
  - `evidence`: id, entity_kind, entity_ref, storage_path, file_name, uploader_id, uploader_role, visible_to_terral, created_at
- **Profiles.** `profiles`: id uuid pk → auth.users, display_name, role check ('don','terral') null, status check ('pending','approved','blocked') default 'pending', person_id null, must_change_password bool default false. A trigger on `auth.users` insert creates the row, with `display_name` from the signup metadata.
- **SQL functions:**
  - `app_role() returns text`, stable, security definer: the role when status is 'approved', else null.
  - `record_decision(p_code text, p_outcome text, p_decided_by text, p_decided_at date)`: requires `app_role() in ('don','terral')` and sets status 'decided'.
  - `confirm_date(p_kind text, p_ref text, p_date date)`:
    - For 'deliverable': sets `in_use_start = in_use_end = p_date` and `in_use_confirmed = true`.
    - For 'to_schedule': sets `confirmed_date`.
- **RLS policies:**
  - **Don-only tables:** every operation when `app_role()='don'`.
  - **Shared tables:** select when `app_role() in ('don','terral')`. Insert, update and delete when `app_role()='don'`.
  - **Row filters for Terral:**
    - `open_item`: `visible_to_terral`.
    - `comment` and `evidence`: `visible_to_terral`, and the target entity is Terral-visible.
    - `dependency`: `from_kind <> 'open_item'`, or the open item is visible.
  - **Terral inserts:** `comment` and `evidence` rows with `author_id = auth.uid()` and `author_role = 'terral'`.
  - **profiles:**
    - Select: own row, or `app_role()='don'`.
    - Update: only when `app_role()='don'`.
    - The user's own `must_change_password` is cleared only through the RPC `clear_must_change_password()`.
- **Storage.** A private bucket `evidence` with a 25 MB limit. Allowed MIME types: pdf, png, jpeg, webp, docx, xlsx, pptx.
  - Read: Don, or an `evidence` row exists with that `storage_path` and `visible_to_terral`.
  - Insert: Don or Terral.
- **History.** `log_history()` is a trigger function that inserts `history(table_name, row_ref, action, old, new, auth.uid(), now())`. It is attached AFTER INSERT/UPDATE/DELETE to every domain table except `history`.

- [ ] **Step 1: Start the local stack.**
  - Run `npx supabase init`.
  - In `supabase/config.toml`, set `[auth.email] enable_confirmations = false`.
  - Run `npx supabase start`.
  - Put the local URL, anon key and service key into `.env.local`.
- [ ] **Step 2: Write the failing test** `tests/rls.test.ts`.
  - `tests/helpers/supa.ts` builds the fixtures with the service role:
    - users don@x.test, terral@x.test, pending@x.test, blocked@x.test
    - one row in each table
    - one Don-only open item (X-04)
    - one hidden comment
  - The assertions:

```ts
for (const t of ['person','task','block','to_schedule_plan','open_item_internal','traceability','manual_risk','history'])
  expect((await terral.from(t).select('*')).data).toEqual([])
expect((await terral.from('open_item').select('code')).data!.map(r => r.code)).not.toContain('X-04')
expect(Object.keys((await terral.from('deliverable').select('*').limit(1)).data![0])).not.toContain('hours')
expect((await terral.from('comment').select('id')).data!.map(r => r.id)).not.toContain(hiddenCommentId)
expect((await terral.from('deliverable').update({ name: 'x' }).eq('code', '3.1').select()).data).toEqual([])
expect((await terral.rpc('record_decision', { p_code: 'D01', p_outcome: 'ok', p_decided_by: 'Diretoria', p_decided_at: '2026-10-27' })).error).toBeNull()
expect((await terral.from('profiles').update({ role: 'don' }).eq('id', terralId).select()).data).toEqual([])
for (const c of [pending, blocked]) expect((await c.from('deliverable').select('*')).data).toEqual([])
expect((await pending.rpc('record_decision', { p_code: 'D01', p_outcome: 'x', p_decided_by: 'x', p_decided_at: '2026-10-27' })).error).not.toBeNull()
expect((await terral.storage.from('evidence').download(hiddenEvidencePath)).error).not.toBeNull()
await don.from('deliverable').update({ name: 'Novo' }).eq('code', '3.1')
expect((await don.from('history').select('*').eq('row_ref', '3.1')).data!.length).toBeGreaterThan(0)
```

- [ ] **Step 3: Run it.** `npx vitest run tests/rls.test.ts` must FAIL (no tables).
- [ ] **Step 4: Write the migrations.**
  - Write the three migration files.
  - Apply them with `npx supabase db reset`.
- [ ] **Step 5: Run it again.** The test must PASS.
- [ ] **Step 6: Commit.**

```bash
git commit -am "feat(db): schema, RLS, RPCs, history"
```

---

### Task 5: Loader, admin seed, verification

**Files:**
- Create: `scripts/import/load.ts`, `.env.example`

**Interfaces:**
- Consumes: `parseWorkbook`, the Task 4 schema.
- Produces: the command `npm run import:load`. It reads `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_EMAIL` and `ADMIN_PASSWORD` from `.env.local`, then does five things:
  1. Truncates the domain tables, but only with `--reset`.
  2. Inserts all `ImportResult` arrays in foreign-key order.
  3. Creates or updates the admin auth user with `role='don'`, `status='approved'` and `person_id='beto'`.
  4. Re-reads the counts from the DB.
  5. Prints a verification table.

- [ ] **Step 1: Run against the empty local DB.** `npm run import:load -- --reset` must FAIL, because the script does not exist yet.
- [ ] **Step 2: Implement `load.ts`.**
  - Use the service-role client.
  - Insert in batches of 500.
  - Exit with code 1 when any DB count differs from the Task 2 expected numbers (19 / 85 / 440 / 15 / 26 + 6 / 8).
  - Exit with code 1 when the per-person block hours differ (David 505,5; Lucas 482; Beto 240) or when the to-schedule hours are not 104.
  - Before inserting, run `findBanned` on every Terral-visible text field:
    - deliverable name and terral_owner
    - decision title and outcome
    - to_schedule `what`
    - text, effect and owner_public of open items with `visible_to_terral`
    - goal fields

    Exit 1 and list each hit (table, key, word). The fix goes in the snapshot or in the item's visibility, never in the guard.
  - Also print:
    - David's slack: `net_capacity − sum(blocks) − sum(unscheduled to_schedule_plan)`, next to the Painel's "Folga medida 25,8". Do not fail on this one.
    - the parser warnings
- [ ] **Step 3: Run it again.**
  - `npm run import:load -- --reset` must print all checks as "ok" and exit 0.
  - Re-run `tests/rls.test.ts`. It must still pass, because it uses its own fixtures.
- [ ] **Step 4: Commit.**

```bash
git commit -am "feat(import): loader with verification and admin seed"
```

Report the slack line and the warnings to the user in the task summary.

---

### Task 6: Risk engine and health

**Files:**
- Create: `src/domain/risk.ts`, `src/domain/terralView.ts`, `tests/risk.test.ts`, `tests/terralView.test.ts`

**Interfaces:**
- Consumes: `types.ts`, `dates.ts`.
- Produces:
  - `type RuleId = 'terral_dependency_overdue' | 'decision_late_blocking' | 'day_over_capacity' | 'week_over_capacity' | 'hours_unconfirmed' | 'confirmed_not_distributed' | 'deliverable_no_in_use_date' | 'behind_plan' | 'slack_exhausted'`
  - `interface Risk { id: string; rule: RuleId | 'manual'; severity: Severity; title: string; codes: string[]; person_id?: string; date?: ISODate; ref?: string }`. `codes` is the deliverables held up, transitively. `title` is pt-BR and holds no Don names when its inputs come from `TerralData`.
  - `type Health = 'on_time' | 'attention' | 'late'`
  - `evaluate(data: EngineInput, today: ISODate): { risks: Risk[]; health: Record<string, Health>; project: { status: Health; reasons: string[] } }`. `reasons` has at most 3 items.
  - `type EngineInput = Pick<PlanData, 'deliverables' | 'decisions' | 'to_schedule' | 'open_items' | 'dependencies'> & Partial<Pick<PlanData, 'people' | 'blocks' | 'to_schedule_plan' | 'manual_risks'>>`
  - `type TerralData = Pick<PlanData, 'deliverables' | 'rituals' | 'ritual_occurrences' | 'decisions' | 'to_schedule' | 'open_items' | 'goals' | 'dependencies' | 'comments' | 'evidence'>`
  - `toTerralData(p: PlanData): TerralData`. It applies the same row filters as the RLS in Task 4.
- **The rules.** Section 8 of the spec is the source. These are the exact thresholds:

  | Rule | Fires when | Severity |
  |---|---|---|
  | terral_dependency_overdue | An open item with `kind='pendencia'`, `visible_to_terral` and `status='open'` has `due < today` | high when it reaches, through dependencies, a deliverable whose next date (the first not-yet-passed of `built_date` and `in_use_start`) is within 14 days; else medium |
  | decision_late_blocking | A decision is `pending`, has `date < today`, and has at least one unlocked deliverable | high; `codes` holds the transitive closure over `dependency` |
  | day_over_capacity | One person's block hours on one date exceed the cap. The cap is `daily_cap_h`, or 9 if the person has a block of type "Deslocamento" that day | high when more than 2 h over; else medium |
  | week_over_capacity | One person's block hours in one `week` exceed `weekly_cap_h` | medium |
  | hours_unconfirmed | `confirmed_date` is null and `window_end − today ≤ 21` | high when `window_end < today`; else medium |
  | confirmed_not_distributed | `confirmed_date` is set and the plan's `distributed` is false. Needs `to_schedule_plan` | high when `confirmed_date − today ≤ 7`; else medium |
  | deliverable_no_in_use_date | `in_use_start` is null, or an open, non-suggested `open_item` dependency points at the deliverable | medium |
  | behind_plan | For each deliverable: planned = hours of blocks dated before today, done = the hours of those that are done; fires when planned > 0 and the shortfall is more than 15% | medium when more than 30%; else low |
  | slack_exhausted | `net_capacity_h` is not null and `net_capacity_h − Σ block hours − Σ undistributed plan hours < 0` | high |
  | Manual risks | `status='open'` | passed through with `rule='manual'` |

- **Health.**
  - `late`: `built_date < today && !built_at`, or `(in_use_end ?? in_use_start) < today && !in_use_at`.
  - `attention`: a high or medium risk has the deliverable in `codes`, or `published_flag` is set.
  - `on_time`: otherwise.
  - The project status is the worst deliverable status.
  - The reasons are ordered: late deliverables first, then high risks, then medium risks.

- [ ] **Step 1: Write the failing tests.** Use one small fixture builder `mk()` that returns a minimal valid `PlanData`, with today = '2026-11-10'. The tests:
  - `decision_late_blocking`: D02 pending on 2026-11-06 unlocks 3.1, and 3.1 → I2 (dependency from deliverable). Expect one high risk with `codes` equal to `['3.1', 'I2']`.
  - The same decision with `status: 'decided'` gives no risk.
  - `day_over_capacity`: David has 10 h on 2026-11-12. Expect medium. With 11 h, expect high. With 9 h plus a "Deslocamento" block, expect no risk.
  - `week_over_capacity`: 41 h in S03. Expect medium.
  - `hours_unconfirmed`: `window_end` 2026-11-25 (15 days away). Expect medium. With `window_end` 2026-11-01, expect high.
  - `confirmed_not_distributed`: confirmed 2026-11-14, `distributed` false. Expect high.
  - `terral_dependency_overdue`: P-26 is due 2026-10-26 and links to 3.1, whose `built_date` is 2026-11-20. Expect high. If the deliverable is 60 days away, expect medium.
  - `behind_plan`: 10 h planned before today and 8 h done. Expect low (20%). With 6 h done, expect medium.
  - `slack_exhausted`: net 100, blocks 90, undistributed 20. Expect high.
  - **Health:** `built_date` 2026-11-01 with no `built_at` gives `'late'`, and `project.status` is `'late'`.
  - **Outside the window:** with today = '2026-10-21' and the real imported fixture (`parseWorkbook` on `data/import`), expect no `behind_plan`, no `day_over_capacity` from the past, and a project status that is not 'late'.
  - **Terral subset:** `evaluate(toTerralData(p), today)` never yields the rules `day_over_capacity`, `week_over_capacity`, `behind_plan`, `slack_exhausted` or `confirmed_not_distributed`.
  - **`tests/terralView.test.ts`:** `toTerralData(p)` has no key `blocks`, `tasks`, `people` or `open_items_internal`. It drops X-items, open items with `visible_to_terral: false`, and comments with `visible_to_terral: false`. For every open item, `findBanned(o.text + o.owner_public)` is empty.
- [ ] **Step 2: Run them.** `npx vitest run tests/risk.test.ts tests/terralView.test.ts` must FAIL.
- [ ] **Step 3: Implement `evaluate` and `toTerralData`.** The transitive closure is a BFS over `dependency` edges where `from_kind='deliverable'`.
- [ ] **Step 4: Run them again.** The tests must PASS.
- [ ] **Step 5: Commit.**

```bash
git commit -am "feat(domain): risk engine, health, terral projection"
```

---

### Task 7: Auth, routing, shell, data layer, temporary password

**Files:**
- Create: `src/lib/supabase.ts`, `src/lib/data.ts`, `src/auth/{useSession,Login,Signup,Pending,Blocked,NewPassword}.tsx`, `src/app/{App.tsx,routes.ts,Shell.tsx}`, `supabase/functions/set-temp-password/index.ts`, `tests/routes.test.ts`

**Interfaces:**
- Produces:
  - `useSession(): { session: Session | null; profile: Profile | null; loading: boolean }`
  - `routeFor(profile: Profile | null, path: string): string | null`. It returns the redirect target, or null to stay.
  - `usePlanData(): UseQueryResult<PlanData>` for Don. One query loads every table.
  - `useTerralData(): UseQueryResult<TerralData>`. It is built from Terral's own selects, or from `toTerralData(usePlanData())` when the role is Don (preview and meeting).
  - `useLive()`: one Realtime channel on all `public` tables. It invalidates the plan query.
  - `useMutate<T>(table, opts?: { optimistic?: (old: PlanData, vars: T) => PlanData })`
  - `<Shell sections={Section[]}>`: a sidebar of 248px on viewports of 900px and wider, and a bottom tab bar of the first 4 sections plus "Mais" below that.
- **Routes:**
  - Public: `/login`, `/cadastro`, `/aguardando`, `/bloqueado`, `/nova-senha`.
  - Don: `/don/hoje` (the default), `/don/semana`, `/don/riscos`, `/don/pendencias`, `/don/entregas`, `/don/entregas/:code`, `/don/calendario`, `/don/equipe`, `/don/decisoes`, `/don/terral/*`, `/don/historico`, `/don/acessos`.
  - Terral: `/t` (the default), `/t/marcos`, `/t/entregas`, `/t/entregas/:code`, `/t/decisoes`, `/t/metas`.
  - Both roles: `/reuniao`.
- **Edge function `set-temp-password`.** It takes a POST `{ user_id, password }` with the caller's JWT.
  1. It verifies that the caller's profile is `don` and `approved`. Otherwise it returns 403.
  2. It calls `auth.admin.updateUserById(user_id, { password })`.
  3. It sets `must_change_password = true`.

- [ ] **Step 1: Write the failing test** `tests/routes.test.ts`:

```ts
const p = (role, status, must = false) => ({ id: 'u', role, status, must_change_password: must }) as Profile
expect(routeFor(null, '/don/hoje')).toBe('/login')
expect(routeFor(null, '/cadastro')).toBeNull()
expect(routeFor(p(null, 'pending'), '/t')).toBe('/aguardando')
expect(routeFor(p('terral', 'blocked'), '/t')).toBe('/bloqueado')
expect(routeFor(p('terral', 'approved'), '/don/hoje')).toBe('/t')
expect(routeFor(p('terral', 'approved'), '/reuniao')).toBeNull()
expect(routeFor(p('don', 'approved'), '/')).toBe('/don/hoje')
expect(routeFor(p('don', 'approved', true), '/don/hoje')).toBe('/nova-senha')
```

- [ ] **Step 2: Run it.** It must FAIL.
- [ ] **Step 3: Implement the files listed above.**
  - The auth screens follow the mockup's visual language: a centered card, the Don mark, and pt-BR copy.
  - Signup collects name, email and password.
  - `/nova-senha` calls `auth.updateUser({ password })`, then `clear_must_change_password()`.
- [ ] **Step 4: Run it again.** The test must PASS.
- [ ] **Step 5: Check the flows in the browser.** Use the browser pane (`npm run dev`) against the local stack. Each flow must work:
  - Sign up → pending screen.
  - Log in as admin → `/don/hoje` (an empty shell is fine).
  - Approve is not built yet. Set the role through SQL to check `/t`.
- [ ] **Step 6: Commit.**

```bash
git commit -am "feat(app): auth, routing, shell, data layer"
```

---

### Task 8: UI primitives

**Files:**
- Create: `src/ui/{Card,Pill,Ring,Check,Toast,Sheet,Timeline,LoadBar,SeverityBar,Empty,Segmented}.tsx`, `src/ui/ui.css`, `tests/ui.test.tsx`

**Interfaces:**
- Produces:
  - `<Card title? action?>`
  - `<Pill tone: 'ok' | 'warn' | 'bad' | 'don' | 'mute'>`
  - `<Ring value: number; total: number; label: string>`
  - `<Check checked: boolean; onChange(next: boolean): void; label: string>`. It flips its visual on pointer-down and is a native checkbox under the hood.
  - `useToast(): { show(msg: string, opts?: { undo?: () => void; ms?: number }) }`. The default `ms` is 5000.
  - `<Sheet open onClose title>`. It is a side sheet on desktop and a bottom sheet on phone, with a spring, and it is interruptible.
  - `<Timeline from: ISODate; to: ISODate; today: ISODate; items: { date: ISODate; label: string; tone }[]>`
  - `<LoadBar used cap>`
  - `<SeverityBar severity>`
  - `<Empty title hint>`
  - `<Segmented options value onChange>`
- Copy each look from `docs/design/home-mockup.html`. Use the motion values from Global Constraints.

- [ ] **Step 1: Write the failing test** `tests/ui.test.tsx` (React Testing Library):
  - Pointer-down on `<Check>` sets `aria-checked=true` before `onChange` resolves.
  - `useToast().show('x', { undo })` renders a "Desfazer" button that calls `undo`.
  - `<Ring value={3} total={19}>` renders the text "3/19".
- [ ] **Step 2: Run it.** It must FAIL.
- [ ] **Step 3: Implement the primitives.**
- [ ] **Step 4: Run it again.** The test must PASS.
- [ ] **Step 5: Check the visuals.** Render a `/dev/ui` route, shown only in dev. Take a screenshot in the browser pane and compare it with the mockup: the radius, shadows, tracking, translucent top bar, and focus rings.
- [ ] **Step 6: Commit.**

```bash
git commit -am "feat(ui): primitives"
```

---

### Task 9: Don "Hoje" and "Minha semana"

**Files:**
- Create: `src/don/Today.tsx`, `src/don/Week.tsx`, `src/don/RiskCard.tsx`, `tests/today.test.tsx`

**Interfaces:**
- Consumes:
  - `usePlanData`
  - `useMutate('block', { optimistic })`
  - `evaluate`
  - `today()`
  - `useSession().profile.person_id`
- Produces:
  - `<RiskCard risks={Risk[]} limit?>`, reused by Riscos.
  - `toggleBlock(id: string, done: boolean)`: the optimistic update of `block.done` and `done_at`. On error it rolls back and shows the toast "Não salvou. Tente de novo."
- **Layout.** Follow the mockup's "Seu dia, <name>." screen:
  - the risks card (top 3)
  - the week strip (Mon–Sun of today's week; a dot per day with blocks; red when the day is over capacity)
  - the signed-in person's blocks for the selected day, each with a `<Check>`
  - a load bar per person for the week
  - "Pendências que vencem" (open items due within 7 days or overdue)
- **"Minha semana."** The person's blocks over 7 days. Unchecked past blocks get a `warn` pill "ficou para trás".
- **Empty states:**
  - No blocks today: "Nada agendado para hoje."
  - Today is outside the window: "O projeto começa em 26/10." or "O projeto terminou em 30/04."

- [ ] **Step 1: Write the failing test** `tests/today.test.tsx`. Mock the data layer with a fixture.
  - Tapping a block's check marks it done at once, and the toast with "Desfazer" appears.
  - Clicking "Desfazer" un-marks it.
  - When the mutation rejects, the check returns to unchecked and the text "Não salvou" shows.
  - With today = '2026-10-21', the text "O projeto começa em 26/10." shows.
- [ ] **Step 2: Run it.** It must FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run it again.** The test must PASS.
- [ ] **Step 5: Check it in the browser.** Use `?today=2026-11-10`, then a phone viewport, against the imported local data.
  - One tap ticks the block, with no visible delay.
  - A second tab shows the change through Realtime.
- [ ] **Step 6: Commit.**

```bash
git commit -am "feat(don): today and week"
```

---

### Task 10: Don Riscos, Pendências, Decisões, Equipe e carga

**Files:**
- Create: `src/don/{Risks,OpenItems,Decisions,Team}.tsx`, `src/don/forms.ts`, `tests/donForms.test.ts`

**Interfaces:**
- Produces:
  - `validateTerralVisible(fields: Record<string, string>): string | null`. It returns a pt-BR error naming the banned word, or null. It uses `findBanned`.
  - This guard runs before every save of a Terral-visible field: open item text, effect and owner_public, decision title, to-schedule `what`, goal fields, deliverable name, and comments with `visible_to_terral`.
- **Screens:**
  - **Riscos.**
    - The list combines automatic and manual risks.
    - Filters: source, severity, person.
    - A "Novo risco" sheet creates a `manual_risk`.
    - "Encerrar" sets `status='closed'`.
  - **Pendências.**
    - P-items and X-items in two segments.
    - Edit in a sheet: text, owner_public, owner_raw, due, effect, status, and the "visible to Terral" switch. X-items lock the switch off.
    - Resolve, with undo.
  - **Decisões.**
    - D01–D15 with date, status and outcome.
    - Don sees `prepared_on` and the prep hours, summed from blocks whose code is that decision.
    - Don can edit everything, including recording the outcome.
  - **Equipe e carga.** Per person:
    - net capacity (editable)
    - planned hours, done hours, "a agendar", slack
    - daily and weekly caps (editable)
    - the list of over-capacity days and weeks from the engine

- [ ] **Step 1: Write the failing test.**

```ts
expect(validateTerralVisible({ text: 'Fala com o David' })).toMatch(/David/)
expect(validateTerralVisible({ effect: 'reduz a margem' })).toMatch(/margem/)
expect(validateTerralVisible({ text: 'Base de vendas pendente' })).toBeNull()
```

- [ ] **Step 2: Run it.** It must FAIL.
- [ ] **Step 3: Implement the guard and the four screens.**
- [ ] **Step 4: Run it again.** The test must PASS.
- [ ] **Step 5: Check it in the browser.**
  - Saving "David" into a visible pendência is blocked, with the message shown.
  - Editing a capacity re-ranks the risks at once.
- [ ] **Step 6: Commit.**

```bash
git commit -am "feat(don): risks, open items, decisions, team load"
```

---

### Task 11: Don Entregas e tarefas, Calendário, Histórico, Acessos, comments and evidence

**Files:**
- Create: `src/don/{Deliverables,DeliverableDetail,Calendar,History,Access}.tsx`, `src/shared/{Comments,Evidence,HistoryList}.tsx`, `src/shared/historyText.ts`, `tests/historyText.test.ts`

**Interfaces:**
- Produces:
  - `historyText(row: HistoryRow, names: Record<string, string>): string`
  - `<Comments entity_kind entity_ref canHide: boolean>`
  - `<Evidence entity_kind entity_ref>`
  - `<HistoryList table row_ref>`
- **Screens:**
  - **Entregas e tarefas.**
    - The list: 19 deliverables with health pill, progress (done/planned hours), next date.
    - The detail has six parts:
      - the header, with toggles for Construído and Em uso, each with a date
      - the "Publicar atenção" note (`published_flag`)
      - tasks, then their blocks, with full CRUD in sheets: change date, reassign, hours, done
      - dependencies: add, remove, confirm suggested
      - the Anexo A fields (`traceability` where `deliverable_code` matches)
      - comments, evidence, history
    - Delete uses the undo toast, with no confirmation dialog.
  - **Calendário.**
    - Month and week segments.
    - Blocks colored by type.
    - Filters: person and type.
    - A tap opens the block sheet.
  - **Histórico.** A global feed from `history`, newest first, 50 per page.
  - **Acessos.**
    - The pending list: approve as Don or Terral, and set `person_id` for Don.
    - The approved list: change role, block (with a confirmation dialog, the only one in the app), and "Gerar senha temporária". The last one calls the Edge Function and shows the password once.
- **Comments.** A Don comment has a "Visível para a Terral" switch, on by default. The Don author is shown to Terral as "Equipe Don".
- **Evidence.** Files upload to `evidence/{entity_kind}/{entity_ref}/{uuid}-{file_name}`.

- [ ] **Step 1: Write the failing test.**

```ts
expect(historyText({ table_name: 'block', action: 'UPDATE', old: { date: '2026-11-12' }, new: { date: '2026-11-19' }, user_id: 'u1' } as HistoryRow, { u1: 'Beto' }))
  .toBe('Beto mudou a data de 12/11 para 19/11')
expect(historyText({ table_name: 'block', action: 'UPDATE', old: { done: false }, new: { done: true }, user_id: 'u1' } as HistoryRow, { u1: 'Lucas' }))
  .toBe('Lucas concluiu o bloco')
```

- [ ] **Step 2: Run it.** It must FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run it again.** The test must PASS. Re-run `tests/rls.test.ts`.
- [ ] **Step 5: Check it in the browser.**
  - Moving a block's date updates the calendar, the load and the risks without a reload.
  - Approving a new signup as Terral lets that user in at `/t`.
- [ ] **Step 6: Commit.**

```bash
git commit -am "feat(don): deliverables, calendar, history, access"
```

---

### Task 12: Terral view and Don "Visão da Terral"

**Files:**
- Create: `src/terral/{Overview,Milestones,Deliverables,DeliverableDetail,Decisions,Goals}.tsx`, `tests/terral.test.tsx`

**Interfaces:**
- Consumes: `useTerralData`, `evaluate`, `Comments`, `Evidence`, and the RPCs `record_decision` and `confirm_date`.
- **The data contract.** Each Terral component takes its data only from `useTerralData()`. It never calls `usePlanData`. That way `/don/terral/*` renders the same components on the projected data.
- **Visão geral.** As in the mockup:
  - "Bom dia, <first name>." The greeting varies by Sao Paulo hour: Bom dia, Boa tarde, Boa noite.
  - The health card:
    - `<Ring>` with "x/19", counting deliverables that have `in_use_at`
    - the status pill: No prazo, Atenção, Atrasado
    - at most 3 reasons
    - 4 KPIs: entregas em uso, próximo marco, decisões tomadas (x/15), pendências do lado da Terral
  - The timeline "A jornada" from 26/10/2026 to 30/04/2027.
  - "Próximos marcos": the next 5 of in-use dates, decisions and ritual occurrences.
  - "O que depende da Terral": open Terral-visible pendências and unconfirmed to-schedule items, each with a "Confirmar data" button.
- **The other sections:**
  - **Marcos:** a timeline and a list.
  - **Entregas:** the detail shows status, dates, Terral owner of use, target ritual, comments and evidence. No hours. A "Confirmar data de uso" button calls `confirm_date('deliverable', code, date)`. Afterwards the pill reads "data confirmada", and the deliverable does not become Em uso.
  - **Decisões:** "Registrar decisão" opens a sheet with outcome, decided by (a position) and date. It calls `record_decision`.
  - **Metas:** the goal tree grouped by level, with the state as a pill.

- [ ] **Step 1: Write the failing test** `tests/terral.test.tsx`. Render `<Overview>` with a `TerralData` fixture.
  - With 2 of 19 deliverables in use, the ring shows "2/19".
  - The rendered text never contains "David", "Lucas", "Beto" or " h ". Check this on a fixture whose Don data holds those names.
  - Submitting "Registrar decisão" calls `rpc('record_decision', …)` with the entered values.
- [ ] **Step 2: Run it.** It must FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run it again.** The test must PASS.
- [ ] **Step 5: Check it in the browser.**
  - Log in as a Terral user. In the network tab, no request to `block` or `task` succeeds with data.
  - `/don/terral` looks the same as the Terral login.
- [ ] **Step 6: Commit.**

```bash
git commit -am "feat(terral): executive view and preview"
```

---

### Task 13: Meeting mode

**Files:**
- Create: `src/meeting/Meeting.tsx`, `tests/meeting.test.tsx`

**Interfaces:**
- Consumes: `useTerralData` only. This holds even for Don users.
- **The steps.** There are four:
  1. Saúde: the health card, enlarged.
  2. Marcos: the next 30 days.
  3. Decisões da semana: decisions dated within 7 days either side of today. "Registrar" opens the record sheet.
  4. Pendências: open Terral-visible pendências and unconfirmed to-schedule items.
- **Navigation:**
  - ArrowRight, PageDown or Space goes to the next step. ArrowLeft or PageUp goes to the previous one.
  - Esc exits to the role's home.
  - Step dots are clickable.
  - Swipe works on touch.
- **Display:**
  - The type scales with `clamp()` for a 16:9 screen of 1920px.
  - A step change is a horizontal spring slide, or a cross-fade under reduced motion.
  - It requests full screen on the first click, through `requestFullscreen`.

- [ ] **Step 1: Write the failing test.**
  - ArrowRight moves from "Saúde" to "Marcos". PageUp goes back.
  - The fourth step plus ArrowRight stays on step 4.
  - Rendering with a Don session still uses projected data: a fixture X-item is not in the DOM.
- [ ] **Step 2: Run it.** It must FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run it again.** The test must PASS.
- [ ] **Step 5: Check it in the browser.** Use a 1920×1080 viewport.
  - The text is readable from across a room.
  - There are no scrollbars.
- [ ] **Step 6: Commit.**

```bash
git commit -am "feat(meeting): checkpoint meeting mode"
```

---

### Task 14: Smoke tests, responsive check, deploy readiness

**Files:**
- Create: `e2e/smoke.spec.ts`, `playwright.config.ts`, `public/_redirects`, `README.md`

- [ ] **Step 1: Write `e2e/smoke.spec.ts`.** Run it against `npm run dev` with the local stack and the import loaded. It covers:
  - The admin logs in, lands on `/don/hoje?today=2026-11-10`, ticks the first block and sees it checked after a reload.
  - A Terral user (fixture) logs in, lands on `/t`, and sees "x/19".
  - At a 375×812 viewport, every Don and Terral route has `document.documentElement.scrollWidth <= 375`.
  - `/reuniao` at 1920×1080 has no vertical scrollbar on any step.
- [ ] **Step 2: Run it.** `npx playwright test` must FAIL until the fixes are in, then PASS.
- [ ] **Step 3: Get ready to deploy.**
  - `public/_redirects` holds `/* /index.html 200`.
  - The README lists, in order:
    1. Create the Supabase project.
    2. `npx supabase link` + `db push`.
    3. In the dashboard, turn off email confirmation.
    4. Set the Edge Function secret, then `functions deploy set-temp-password`.
    5. Run `npm run import:load -- --reset` against prod with `.env.local`.
    6. On Cloudflare Pages, set the build command `npm run build`, the output `dist`, and the env vars `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
    7. Daily use keeps the free Supabase project from pausing.
  - `npm run build` must pass with no TS errors.
- [ ] **Step 4: Run the full suite.** `npm test && npx playwright test` must be all green.
- [ ] **Step 5: Commit.**

```bash
git commit -am "chore: smoke tests and deploy readiness"
```

- [ ] **Step 6: Stop.** Ask the user for the Supabase and Cloudflare accounts. Do not push, deploy or publish until they say go.
