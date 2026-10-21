# PlanDon Terral — design

Date: 2026-10-21
Author: Roberto (Beto), Don Consultoria. Written with Claude.
Status: approved in conversation. This document is the description to plan from.

Marking used below:
- **(user)**: the user decided this.
- **(my call)**: Claude decided it. The user can override it.

## 1. Intent and why

Don Consultoria won the Terral project. Phase 1 (diagnosis) closed on 09/10/2026. Phase 2 runs from 26/10/2026 to 30/04/2027, 27 weeks. In Phase 2 Don builds Terral's commercial structure:
- 14 deliverables from Escopo 2 (codes 3.1–3.14)
- 5 instruments (I1–I5)

All of it is driven by 15 board decisions (D01–D15) and a set of rituals.

Today the plan lives in one Google Sheet, "TERRAL | PLANO DE EXECUÇÃO DON INTERNO" (id 1l_YzujPHJ52hFlWQBAfpdsi3O1Jp3Z3nEq2Op8J5hmI). It holds:
- 85 tasks
- 440 dated work blocks
- the open items (pendências) and conflicts between documents (divergências)
- the goal tree

A sheet cannot warn anyone. It does not show that a Terral dependency is 3 days late and holds up four deliverables, or that David's Thursday has 11 hours in it.

PlanDon Terral is a web app that replaces the sheet as the source of truth. It has one link and two roles:
- **Terral** (Júlio and the leaders) sees the project in summary: is it healthy, what comes next, what depends on us. Terral can record decisions and confirm dates.
- **Don** (David, Lucas, Beto) sees the backstage: every task, every hour and every risk, early enough to act.

Success looks like this:
- Don stops opening the sheet.
- Every morning each Don person opens "Hoje", ticks yesterday's blocks and sees the risks.
- In the War Room checkpoint, the meeting runs on the big screen from the app's meeting mode.

An earlier prototype exists in the vault at vaults/Terral/99 - Sistema/plandon/, published as https://claude.ai/artifact/7hnQ3qWYVZtFCrvP1rHoAo. It was built from an older plan spreadsheet, and its data is superseded. Use it only as a reference for what was tried. Do not copy its data.

## 2. Goals

1. One app, one link, two roles. The role is enforced by the database, not only by the UI. **(user)**
2. The Terral view answers two questions in the first 30 seconds: project health, and the next milestones. **(user)**
3. The Don view shows four things first. **(user)**
   - risks and bottlenecks
   - my day and my week
   - open items
   - document conflicts
4. Don marks progress every day. Ticking a block done is one tap, with undo. **(user)**
5. Don edits everything. **(user)**
   - It creates, moves (changes the date of) and reassigns tasks and blocks.
   - It edits deliverables, decisions, open items, goals and dependencies.
   - Load, slack and risks recalculate at once.
   - Every change is kept in a history: who, when, before and after.
6. Terral can do four things. **(user)**
   - Record a decision: what was decided.
   - Confirm dates.
   - Comment.
   - Attach evidence.
7. Risks come from two places: automatic detection by fixed rules, and manual risks that Don enters. **(user)**
8. Meeting mode is a full-screen view in steps that follows the checkpoint agenda **(user)**:
   1. Health
   2. Milestones
   3. Decisions of the week
   4. Open items
9. The app works well on a notebook, a phone, and a big meeting screen. **(user)**
10. The UX/UI must be excellent, in the spirit of Apple's design guidance. Quality comes before speed. **(user)**

## 3. Non-goals

- More than one client. This app is only for Terral. **(user)**
- Email or push notifications at the start. **(user)**
- Writing back to the Google Sheet. The import runs once, and then the sheet is history only. **(user)**
- Dark mode. Never, not even as an option. **(user)**
- A custom domain. The free hosting address is enough for now. **(user)**
- Native mobile apps. A responsive web app is enough. **(my call)**
- Drag-and-drop scheduling in v1. To move a task, Don changes its date and owner in a sheet or popover. Drag can come later. **(my call)**
- Offline mode. **(my call)**

## 4. Anti-goals: things that make it a failure even if it works

- **Terral sees internal data.** Terral must never see Don hours, Don person names, tasks, work blocks, load, manual risks, divergências, or Don-only open items, and never by calling the API directly. A UI that only hides them is not enough.
- **Ticking progress is slow.** If marking a block done takes more than one tap and a short wait, Don goes back to the sheet.
- **It looks like a spreadsheet.** Dense grids are allowed only in the Don detail tables. Everything else is designed.
- **Imported numbers do not match the sheet.** The import is correct only when these match:
  - 19 deliverables
  - 85 tasks
  - 440 dated blocks
  - 15 decisions
  - P-01..P-26 and X-01..X-06
  - per-person hours: David 609.5, Lucas 482, Beto 240
  - deliverable hours as in "Entregáveis e Aceite"
- **Wording breaks the project's rules** (see the vault CLAUDE.md):
  - "Paridade" is never called "margem".
  - Deliverables shown to Terral name positions, never individuals (clause 4.3).

## 5. Constraints

- **Language.** The UI is in Brazilian Portuguese. Code, identifiers, commits and repo files are in English.
- **Time zone and formats.**
  - Time zone: America/Sao_Paulo.
  - Dates show as dd/mm or dd/mm/aaaa.
  - Hours use a decimal comma (3,5 h).
- **Free tiers.** Supabase free and Cloudflare Pages free. Supabase free projects pause after about a week without traffic. Daily use prevents this. Note it in the README.
- **Accounts.** The user creates the Supabase project and the Cloudflare account. Claude cannot create accounts. Until they exist, the build runs against a local Supabase (Docker is available on the machine).
- **Secrets.**
  - The front end gets only the Supabase URL and the anon key.
  - The service-role key is used in two places only: the local seed script, and the Edge Function that sets temporary passwords (as a Supabase secret). It is never sent to the browser and never committed.
- **Data sensitivity.** The import snapshot (JSON) holds client data. It stays in the repo, and the repo stays private. Never put it in a public place.

## 6. Users, roles and access

Sign-up and login use email and password through Supabase Auth. **(user)**

The account flow:
1. A person signs up.
2. Their account is pending. They see a calm "aguardando liberação" screen and nothing else.
3. A Don admin approves the account and sets its role: Don or Terral. **(user)**

Admin rules:
- Any approved Don user can approve accounts, change roles and block accounts. **(my call)** The team is three people, so a separate admin level adds nothing.
- The first Don account is made Don and approved by the seed script. That account is the user's.
- Email confirmation on sign-up is off. The admin approval replaces it. **(my call)**
- Forgotten password: a Don user sets a temporary password for the account from "Acessos". This goes through a Supabase Edge Function that holds the service-role key server-side. On the next login the person must choose a new password. **(my call)**
  - Why: Supabase's built-in email only delivers to the Supabase org's own members and has a very low hourly limit. A real SMTP needs a verified domain, which is out of scope.
  - Self-service reset by email can be added later, once the user provides an SMTP.

Role data lives in a profiles table: user id, display name, role (don | terral), status (pending | approved | blocked).

All access rules key off this table through row-level security.

## 7. Domain model

All tables below are imported from the sheet. The header rows are on row 6 of each tab. The exact mapping from columns to fields is left to the builder. The sample rows in section 13 show the shape.

| Entity | Source tab | Key fields | Terral can read |
|---|---|---|---|
| Person (Don team) | derived from "Quem" | name, net capacity in hours, daily cap | no |
| Front | "Frente" values | name (Gestão, Vendas, Marketing, …) | yes |
| Deliverable | Entregáveis e Aceite | code, name, front, origin (Escopo 2 / Instrumento), built date (Don acceptance), in-use date (shared milestone; may be a range or text such as "23 e 24/11/2026"), hours, target ritual, Terral owner of use (a position) | yes, but not hours |
| Task | Prioridades | order, due date, type (task / decision prep / board decision), front, deliverable or decision code, description, owner person, hours, status | no |
| Work block | Plano Diário | date, weekday, week (S01..S27), type (Tarefa, Rito, Preparação de decisão, Deslocamento, …), front, code, description, person, hours, due date; link to its task when one matches | no |
| Ritual | Governança (top table) | name, cadence, number of occurrences, hours, first and last date | name, cadence and dates only |
| Decision | Governança ("As quinze decisões") | code D01..D15, title, date, prepared on, what it unlocks, status (pending / decided), outcome text, decided by, decided at | yes |
| To schedule | A Agendar | deliverable code, what it is, who leads, hours, possible window, confirmed date | yes, but not hours or who leads |
| Open item | Pendências | code (P-xx = pendência, X-xx = divergência), text, owner, due, effect if not resolved, status, visible to Terral | only rows with visible to Terral = true |
| Goal | Árvore de Metas | level (Grupo / Vendas atacado / Vendas varejo / Marketing), position (Norte / Suporte n / Operacional n), metric, baseline, state (definida / mensurável / linha de base apurada), target | yes |
| Traceability | Rastreabilidade Anexo A | Anexo A tab, field, column, number, target deliverable, producing task, who fills it | no |
| Dependency | see below | from (deliverable / decision / open item / to-schedule) → to (deliverable) | yes, for Terral-visible nodes |
| Manual risk | entered in the app | title, severity, linked items, owner, status, note | no |
| Comment | in the app | target entity, author, text, time | Terral reads and writes comments on Terral-visible entities. Don comments are internal unless marked "visible to Terral". **(my call)** |
| Evidence | in the app | target entity, file (Supabase Storage), uploader, time | yes, on Terral-visible entities |
| History | Postgres triggers | table, row, action, old and new values, user, time | no |

Imported, not shown as screens of their own:
- **Painel.** Its numbers are recomputed by the app. **(my call)**
- **Calendário, Consolidado por Rito, Agenda Semanal.** They are views over Plano Diário and become app screens.

### Rules for the open items

- **Open items shown to Terral.** At import, a row gets "visible to Terral" = true when it is a P-item and its owner names the Terral side ("Terral", "FP&A", "… com Júlio", or a Terral position). X-items (divergências) are always Don-only. Don can switch the flag per item. **(my call)** Example: X-04 is about Don's price and must never reach Terral.
- **Owners.** Terral never sees Don people's names. Each owner value is rewritten for Terral as follows. **(my call)**

  | Owner value | Terral sees |
  |---|---|
  | Don name alone (David, Lucas, Beto) | "Equipe Don" |
  | "<Don name> com Júlio" | "Diretoria Terral com a Don" |
  | Terral positions and areas (Terral, FP&A, Diretoria Terral, …) | as they are |

- **Authors.** Don comments and evidence shown to Terral show "Equipe Don" as the author.
- **Text guard.** Free text that Terral can read may still contain a Don name or a banned word. This covers decision titles, "o que destrava", open-item text and effect, to-schedule "o que é", and goals. **(my call)**
  - **Hard rule.** A banned word is one of two things:
    - a Don person's name
    - "margem" used where "paridade" is meant
  - **At import:** a guard step scans every Terral-visible text field for banned words. It lists the hits, and the import fails until each one is fixed in the snapshot or the item is made Don-only.
  - **In the app:** Don edit forms run the same check on Terral-visible fields. They warn and block the save until the text is fixed or the item is set Don-only.

### Dependencies

The sheet has no explicit dependency columns, so the import builds links in two steps:
1. **Hard links.** A block or task that carries a code links to that deliverable or decision. A decision's "O que destrava" links to the deliverables it names.
2. **Suggested links.** Deliverable codes found in free text (for example, "O 3.12 não tem data de uso" in P-01) become links marked "suggested". Don confirms or removes them in the app.

After the import, Don maintains dependencies by hand. **(my call)**

### Hours and capacity (my call)

- **Hours are derived, never stored twice.**
  - A task's hours are the sum of its blocks.
  - A deliverable's hours are the sum of its tasks, plus its to-schedule hours that have no blocks yet.
  - The hours imported from "Entregáveis e Aceite" and "Prioridades" are used only to verify the import.
  - When Don moves or deletes a block, every total moves with it.
- **Net capacity per person:**
  - David's comes from the Painel tab: gross 785,0 h, minus a 15% reserve, gives net 667,3 h.
  - Lucas and Beto have no capacity in the sheet. Their net capacity starts empty, and the "slack exhausted" rule does not fire for them until Don enters a number in "Equipe e carga". The daily and weekly cap rules apply to everyone.
- **Hours to schedule.**
  - The 104 h of "A Agendar" belong to David. They count in his load as "a agendar" and have no day.
  - When Terral confirms a date, nothing is generated automatically. The item becomes "confirmado, a distribuir", and Don spreads it into blocks by hand. Until then the risk engine flags it (see section 8).
- **Who is who.** Each Don profile links to one plan person through a column on the profile. That is how "Hoje" knows whose blocks to show.

### Progress model

- The unit of daily progress is the **work block**. Don ticks a block done.
- A task's progress is its done hours divided by its planned hours.
- A deliverable's progress is the same calculation over its tasks.
- A deliverable has two separate states. **(my call)**
  - **Construído:** Don marks it as accepted, with a date.
  - **Em uso:** Don marks it in use, with a date.
- When Terral **confirms an in-use date**, the agreed date is fixed and shown as "data confirmada". The deliverable does **not** become Em uso. Only Don toggles Construído and Em uso.
- On Terral's health card, "x/19 entregas" counts deliverables that are Em uso. **(my call)**

## 8. Risk engine

There is one pure TypeScript module. It takes the loaded data and "today" as input, and returns a list of risks and a health status for each deliverable. It runs on the client:
- on load
- after every edit
- once a minute, so the passage of time is picked up

The data set is small (about 600 rows), so a full recompute on each change is fine. Automatic risks are computed, not stored.

### Automatic rules

These come from the user's list. The thresholds are my call.

| Rule | Fires when | Severity |
|---|---|---|
| Overdue Terral dependency | A Terral-owned open item or a to-schedule item is past its due date and unresolved | high when it blocks a deliverable whose next date is within 14 days; medium otherwise |
| Decision late and blocking | A decision is past its date and still pending, and it unlocks at least one deliverable | high; the risk card shows the whole chain of deliverable codes it holds up, transitively |
| Day over capacity | A person's blocks on one day add up to more than their daily cap. The default cap is 8 h, and 9 h on travel days in Matão. The cap is editable per person. | medium; high when more than 2 h over |
| Week over capacity | A person's blocks in one week exceed their weekly cap (default 40 h) | medium |
| Hours without a confirmed date | A to-schedule item has no confirmed date and its window closes within 21 days | medium; high when the window has closed |
| Confirmed but not distributed | A to-schedule item has a confirmed date, but its hours are not yet spread into blocks | medium; high within 7 days of the date |
| Deliverable without an in-use date | A deliverable's in-use date is empty, TBD, or depends on an open item | medium |
| Behind plan | A deliverable's done hours are below its planned hours up to yesterday, by more than 15% | low; medium when more than 30% |
| Slack exhausted | A person's remaining planned hours exceed their remaining net capacity | high |

Manual risks sit beside the automatic ones in the same list, marked "manual".

### Health

- **Deliverable health:**
  - Atrasado (late): its built date or in-use date has passed without the event happening.
  - Atenção (attention): any high or medium risk touches it.
  - No prazo (on time): otherwise.
- **Project health:** the worst deliverable status, shown with the reasons ("por quê"), at most 3, listed in plain words.

### What Terral sees of health (my call)

Terral's client can read only Terral-safe data, so it runs the same engine on that subset. Rules that need Don-only data (capacity, behind plan, slack) do not fire for Terral.

Don can also publish an "attention" flag on a deliverable, with a short note that Terral can read. Don uses it to tell Terral about internal trouble that matters to them.

Don's backstage will often show risks that Terral does not see yet. This is intended: Don sees early and decides what to escalate.

## 9. Screens

### Shared shell

- **Notebook:**
  - a sidebar with the role's sections
  - a large title per page
  - a translucent top bar
  - content cards on the light background
- **Phone:**
  - a bottom tab bar with the 4–5 main sections
  - other sections are reached from "Mais"
- **Big screen:** meeting mode only.

### Terral view (as in the approved mockup)

Sections:
- **Visão geral.** Its parts:
  - the greeting
  - the health card: progress ring "x/19", status pill, the reasons, 4 KPIs (deliverables in use, next milestone, decisions taken out of 15, open items on Terral's side)
  - the timeline "A jornada" from October to April, with a "hoje" marker
  - the card "Próximos marcos"
  - the card "O que depende da Terral"
- **Marcos.** In-use milestones, decisions and ritual dates on a timeline or list.
- **Entregas.** The 19 deliverables. The detail shows status, dates, Terral owner of use, target ritual, comments and evidence. There are no tasks or hours.
- **Decisões.** D01–D15. Terral records the outcome: what was decided, by whom (a position), and when.
- **Metas.** The goal tree.
- **Modo reunião.**

Terral actions:
- record a decision
- confirm a date on a to-schedule item or an in-use milestone
- comment
- attach evidence

### Don view (as in the approved mockup)

Sections:
- **Hoje.** The default screen. Its parts:
  - the greeting
  - the risks card (top risks, with source, severity bar and blocked chain)
  - the week strip
  - today's blocks for the signed-in person, with the one-tap check
  - a load bar per person
  - "Pendências que vencem" (open items due soon)
- **Minha semana.** The person's blocks over 7 days. Yesterday's unchecked blocks are flagged.
- **Riscos.** All risks, filterable by automatic or manual, severity and person. Don can add a manual risk.
- **Pendências.** P-items and X-items. Don edits them, resolves them, and switches "visible to Terral".
- **Entregas e tarefas.** Deliverables, then their tasks, then their blocks. Don can do full CRUD:
  - create, edit, change date, reassign, delete (with undo)
  - edit dependencies
- **Calendário.** A month view and a week view of all blocks, filterable by person and type.
- **Equipe e carga.** Per person: capacity, planned hours, done hours, slack, and the over-capacity days and weeks.
- **Decisões.** As Terral sees them, plus the decision prep and hours.
- **Visão da Terral.** A preview of exactly what Terral sees.
- **Histórico.** Not in the mockup. It is a global feed of changes, and each item also shows its own history. **(my call)**
- **Acessos.** Pending sign-ups: approve and set the role. **(my call)**

### Meeting mode

- It is full screen, with large type for a projector or TV.
- It has four steps: Saúde, Marcos, Decisões da semana, Pendências.
- Navigation: arrow keys, a presentation clicker (page up/down), swipe, or the step dots.
- It shows **Terral-safe data only, even when a Don user opens it**, because Terral is in the room. **(my call)**
- A decision can be recorded live from the decisions step.
- It needs no editing beyond that.

### Auth screens

- login
- sign-up
- forgot password
- pending approval
- blocked

They are simple and calm, use the same visual language, and carry the Don mark.

## 10. Editing, history and undo

- **Check.**
  - The check is optimistic: the UI updates on pointer-down and the write happens in the background.
  - If the write fails, the check rolls back with a message.
  - After a check, an "Desfazer" (undo) toast stays for about 5 s.
- **Destructive edits** (delete a task or block) use undo, not a confirmation dialog. A confirmation dialog appears only for account blocking and role changes. **(my call)**
- **History.** Every insert, update and delete on domain tables writes a row to the history table through a Postgres trigger. The row holds the user, the time, and the old and new values. Each entity shows its history, readable as "Beto mudou a data de 12/11 para 19/11".
- **Realtime.** Open screens subscribe to changes with Supabase Realtime. A check by Lucas shows on David's screen, and a decision recorded in the meeting appears everywhere. **(my call)**

## 11. Visual design

The approved mockup is at docs/design/home-mockup.html in this repo. It is the reference for the look, both views and the density. The user's verdict was "do caceta". Build to it.

- **Base.** Apple-style and light. Use Apple's design guidance and the apple-design skill: springs (damping 1.0, response 0.3–0.4), feedback on pointer-down, translucent chrome with backdrop blur, tracking set per text size, and support for reduced motion and reduced transparency.
- **Color tokens** (from the mockup):

  | Token | Value |
  |---|---|
  | background | #F5F5F7 |
  | surface | #FFFFFF |
  | ink | #100F0F |
  | muted | #86868B |
  | accent (Don orange) | #FF911A |
  | accent text on light | #B35C00, because #FF911A fails contrast as text |
  | accent soft | #FFF1E2 |
  | ok | #1E9E5A |
  | warn | #C27C00 |
  | bad | #D93A2F |

  Each status color has a soft background tint. The radius is 18 px on cards.
- **Accent.** Orange is the only accent.
- **No dark mode.** Force color-scheme light, define no dark tokens, and do not react to the OS dark setting.
- **Typography.** Use the system font stack (-apple-system / system-ui), as in the mockup. Montserrat (the Don brand font) is not used in the UI. **(my call)**
- **Accessibility.**
  - WCAG AA contrast.
  - Full keyboard navigation.
  - Visible focus.
  - Hit targets of at least 44 px on touch.

## 12. Stack (my call, all of it)

- **Front end:**
  - React + TypeScript + Vite
  - React Router
  - TanStack Query for server state
  - Motion (motion.dev) for springs
  - plain CSS with the tokens above as custom properties; no CSS framework
- **Back end:** Supabase, for:
  - Postgres
  - Auth
  - row-level security
  - Storage (evidence files, up to 25 MB each: PDF, images, Office files)
  - Realtime
  - SQL migrations in the repo
- **Hosting:** Cloudflare Pages, free subdomain, SPA fallback.
- **Tests:**
  - Vitest for the risk engine and the import mapping.
  - One automated RLS test that signs in as a Terral user and proves that each Don-only table, column and file is unreachable through the API.
  - A short Playwright smoke test for login and the check.

### Database-level separation

Hours on deliverables, rituals and to-schedule rows are Don-only columns inside tables that Terral can partly read. The builder chooses how to enforce this:
- split tables (internal columns in a Don-only side table), or
- Terral reads only through restricted views with security_invoker.

Either way, the RLS test above must prove it.

## 13. Import

The import is a one-time, repeatable script. It runs in four stages:
1. **Fetch.** Read the sheet's tabs. Use the Google Sheets connector available in Claude's session to snapshot each tab as JSON into the repo (data/import/), so the build needs no Google credentials. **(my call)**
2. **Transform.** Turn rows into domain records:
   - parse Brazilian dates and decimal commas
   - normalize "—" to empty
   - link blocks to tasks and to deliverables or decisions by code
   - derive the dependencies (section 7)
3. **Load.** Load into Supabase with the service-role key, locally.
4. **Verify.** Print the counts and totals listed in section 4, and fail if they do not match.

After the user confirms that the import is right, the sheet becomes history. The user may add a "histórico" note to it. The app never writes to it.

Sample shapes (header row and one row):
- Plano Diário: Data, Dia, Sem., Tipo, Frente, Cód, Entregável, O que fazer neste dia, Quem, Horas, Prazo — "26/10/2026, segunda, S01, Tarefa, Vendas, 3.1, Segmentação e matriz de tier, Calcular potencial e gap por conta — construir o modelo, Beto, 2, 11/12/2026"
- Entregáveis e Aceite: Cód, Entregável, Frente, Origem, Construído, Em uso, Horas, Rito de destino, Dono do uso na Terral
- Prioridades: #, Prazo, Prioridade, Frente, Cód, Entregável, O que precisa ser feito, Responsável, Horas, Status
- Pendências: #, O que está em aberto, Dono, Prazo, Efeito se não for resolvido. Notes rows below the table are skipped.
- Governança: the rituals table, then "AS QUINZE DECISÕES COM DATA": #, Decisão, Data, Preparada em, Horas, O que destrava
- A Agendar: Cód, Entregável, Frente, O que é, Quem conduz, Horas, Janela possível
- Árvore de Metas: Nível, Posição, Métrica, Ponto de partida, Estado, Meta
- Rastreabilidade Anexo A: Aba do Anexo A, Campo, Coluna, Nº, Entregável de destino, Tarefa que produz, Quem preenche

## 14. Left to the builder

- The file and folder structure, and the component breakdown.
- Exact SQL schema names, the indexes, and the choice between split tables and views (section 12).
- How each sheet column maps to a field, within the shapes above.
- Empty, loading and error states. They must be designed, not default.
- The phone layouts of the Don detail tables. A card list on phone is fine.
- How "today" is simulated in development, since the project starts on 26/10/2026.
- Order of build. Suggestion:
  1. Schema + RLS + import
  2. Auth and approval
  3. Don "Hoje" with the check
  4. Risk engine
  5. Terral view
  6. Meeting mode
  7. The rest of the Don sections
  8. Deploy

## 15. Before deploy

The user must provide three things:
- the Supabase project URL and anon key
- the service-role key, used locally for the seed only
- access to the Cloudflare account

Each deploy or publish waits for the user's go-ahead.
