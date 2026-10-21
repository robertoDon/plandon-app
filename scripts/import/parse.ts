import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { parseBrDate, parseBrRange, parseHours } from '../../src/domain/dates'
import { DON_NAMES, extractCodes, fold, ownerPublic } from '../../src/domain/textGuard'
import type {
  Block, Decision, Deliverable, Dependency, Goal, OpenItem, OpenItemInternal, PlanData, Person,
  Ritual, RitualOccurrence, Task, TaskStatus, ToSchedule, ToSchedulePlan, Traceability,
} from '../../src/domain/types'

export type TabName =
  | 'painel' | 'prioridades' | 'plano' | 'agendar' | 'entregaveis'
  | 'governanca' | 'metas' | 'pendencias' | 'rastreabilidade'
/** Raw `values` of each tab, header row first (row 6 of the sheet; Painel starts at row 1). */
export type RawWorkbook = Record<TabName, string[][]>
export type ImportResult = Omit<PlanData, 'manual_risks' | 'comments' | 'evidence'> & { warnings: string[] }

// ---------- helpers ----------

const clean = (v: unknown): string => {
  const s = String(v ?? '').trim()
  return s === '—' ? '' : s
}
const orNull = (s: string): string | null => (s === '' ? null : s)
const isBlank = (r: string[]) => r.every((c) => clean(c) === '')
const isTotal = (r: string[]) => r.some((c) => clean(c).toUpperCase() === 'TOTAL')

/** Deterministic uuid: the import is repeatable and ids stay stable between runs. */
function uid(ns: string, key: string): string {
  const h = createHash('sha1').update(`${ns}:${key}`).digest('hex')
  const v = ((parseInt(h.slice(16, 18), 16) & 0x3f) | 0x80).toString(16)
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${v}${h.slice(18, 20)}-${h.slice(20, 32)}`
}

/** Content-keyed id: same key twice gets occurrence 1, 2, ... so a re-import keeps ids while the sheet changes. */
function keyedUid(ns: string) {
  const seen = new Map<string, number>()
  return (key: string): string => {
    const n = (seen.get(key) ?? 0) + 1
    seen.set(key, n)
    return uid(ns, `${key}#${n}`)
  }
}

/** Rows of a table: after the header (index 0), up to the first blank row. Notes ("·") and TOTAL rows are skipped. */
function table(rows: string[][], from = 1): string[][] {
  const out: string[][] = []
  for (const r of rows.slice(from)) {
    if (isBlank(r)) break
    if (clean(r[0]).startsWith('·') || isTotal(r)) continue
    out.push(r.map(clean))
  }
  return out
}

const donId = (name: string): string | null => {
  const n = DON_NAMES.find((d) => fold(d) === fold(name))
  return n ? n.toLowerCase() : null
}

const TASK_STATUS: Record<string, TaskStatus> = {
  'nao iniciado': 'not_started',
  'em andamento': 'in_progress',
  'concluido': 'done',
  'concluida': 'done',
}

// ---------- parser ----------

export function parseWorkbook(raw: RawWorkbook): ImportResult {
  const warnings: string[] = []
  const warn = (m: string) => warnings.push(m)
  // Don person id for an owner cell; Terral-side owners (Diretoria...) are null, anything else non-empty is odd
  const personId = (name: string, where: string): string | null => {
    const id = donId(name)
    if (!id && name !== '' && !/^Diretoria/i.test(name)) warn(`${where}: unknown owner "${name}", person_id null`)
    return id
  }

  // --- deliverables ---
  const deliverableRows = table(raw.entregaveis)
  const deliverables: Deliverable[] = deliverableRows.map((r, i) => {
    const inUse = r[5]
    const range = parseBrRange(inUse)
    return {
      code: r[0],
      name: r[1],
      front: r[2],
      origin: fold(r[3]).startsWith('instrumento') ? 'instrumento' : 'escopo2',
      built_date: parseBrDate(r[4]),
      in_use_start: range.start,
      in_use_end: range.end,
      in_use_text: orNull(inUse),
      in_use_confirmed: false,
      built_at: null,
      in_use_at: null,
      target_ritual: orNull(r[7] ?? ''),
      terral_owner: orNull(r[8] ?? ''),
      published_flag: null,
      sort: i + 1,
    }
  })
  const deliverableCodes = new Set(deliverables.map((d) => d.code))
  const sheetHours = new Map(deliverableRows.map((r) => [r[0], parseHours(r[6])]))

  // --- blocks (Plano Diário) ---
  const blocks: Block[] = []
  const blockUid = keyedUid('block')
  table(raw.plano).forEach((r, i) => {
    const date = parseBrDate(r[0])
    if (!date) return warn(`Plano Diário row ${i + 2}: invalid date "${r[0]}", row skipped`)
    const person_id = personId(r[8], `Plano Diário row ${i + 2}`)
    blocks.push({
      id: blockUid(`${date}|${person_id ?? ''}|${r[5]}|${r[7]}`),
      date,
      week: r[2],
      type: r[3],
      front: r[4],
      code: orNull(r[5]),
      description: r[7],
      person_id,
      hours: parseHours(r[9] ?? ''),
      due: parseBrDate(r[10] ?? ''),
      task_id: null,
      done: false,
      done_at: null,
    })
  })

  // --- tasks: one per distinct (code, description) among Prioridades "Tarefa" / "Tarefa com a Terral" rows ---
  const tasks: Task[] = []
  const taskSheetHours = new Map<string, number>()
  const groups = new Map<string, string[][]>()
  for (const r of table(raw.prioridades)) {
    if (!r[2].startsWith('Tarefa')) continue
    const k = `${r[4]}|${r[6]}`
    groups.set(k, [...(groups.get(k) ?? []), r])
  }
  for (const rows of groups.values()) {
    const first = rows[0]
    const byPerson = new Map<string, number>()
    for (const r of rows) byPerson.set(r[7], (byPerson.get(r[7]) ?? 0) + parseHours(r[8]))
    // primary owner = most hours; ties keep the first one seen (Map keeps insertion order)
    const owner = [...byPerson.entries()].reduce((a, b) => (b[1] > a[1] ? b : a))[0]
    const status = TASK_STATUS[fold(first[9] ?? '')]
    if (!status) warn(`Prioridades #${first[0]}: unknown status "${first[9]}", using not_started`)
    const t: Task = {
      id: uid('task', `${first[4]}|${first[6]}`),
      sort: Math.min(...rows.map((r) => Number(r[0]) || 0)),
      due: parseBrDate(first[1]),
      kind: first[2] === 'Tarefa com a Terral' ? 'with_terral' : 'task',
      front: first[3],
      code: first[4],
      description: first[6],
      person_id: personId(owner, `Prioridades #${first[0]}`),
      status: status ?? 'not_started',
    }
    tasks.push(t)
    taskSheetHours.set(t.id, [...byPerson.values()].reduce((a, b) => a + b, 0))
  }
  tasks.sort((a, b) => a.sort - b.sort)

  // --- block -> task ---
  for (const b of blocks) {
    if (!b.type.startsWith('Tarefa')) continue
    // 1. same code, task description is the start of the block description (prefer same person)
    const same = tasks
      .filter((t) => t.code === b.code && b.description.startsWith(t.description))
      .sort((x, y) => y.description.length - x.description.length)
    let match = same.find((t) => t.person_id === b.person_id) ?? same[0]
    // 2. earliest task of same code and person due on or after the block date
    match ??= tasks
      .filter((t) => t.code === b.code && t.person_id === b.person_id && t.due && t.due >= b.date)
      .sort((x, y) => (x.due! < y.due! ? -1 : 1))[0]
    if (match) b.task_id = match.id
    else warn(`Block ${b.date} ${b.code} "${b.description}" (${b.person_id}) has no matching task`)
  }

  // --- rituals + occurrences (Governança top table) ---
  const gov = raw.governanca
  const splitAt = gov.findIndex((r) => clean(r[0]).toUpperCase().startsWith('AS QUINZE DECISÕES'))
  const ritualRows = table(splitAt >= 0 ? gov.slice(0, splitAt) : gov)
  if (splitAt < 0) warn('Governança: "AS QUINZE DECISÕES COM DATA" not found')
  const rituals: Ritual[] = ritualRows.map((r, i) => {
    const range = parseBrRange(r[5] ?? '')
    return {
      id: uid('ritual', r[0]),
      name: r[0],
      cadence: r[1],
      first_date: range.start,
      last_date: range.end,
      sort: i + 1,
    }
  })
  const ritual_occurrences: RitualOccurrence[] = []
  // keyed on public facts only (ritual + date): Terral reads these ids, so they must not encode the Don person of the block
  const occUid = keyedUid('occ')
  for (const b of blocks) {
    if (b.type !== 'Rito') continue
    const rit = rituals.find((x) => x.name === b.description)
    if (!rit) {
      warn(`Rito block ${b.date} "${b.description}" matches no ritual`)
      continue
    }
    ritual_occurrences.push({ id: occUid(`${rit.id}|${b.date}`), ritual_id: rit.id, date: b.date, week: b.week })
  }
  ritualRows.forEach((r, i) => {
    const got = ritual_occurrences.filter((o) => o.ritual_id === rituals[i].id).length
    const expected = parseInt(r[2] ?? '', 10)
    // rituals without Rito blocks (decision prep, travel) have no occurrences by design
    if (got > 0 && expected !== got) warn(`Ritual "${r[0]}": sheet says ${expected} occurrences, found ${got}`)
  })

  // --- decisions ---
  const decRows = splitAt >= 0 ? table(gov, splitAt + 2) : []
  const decisions: Decision[] = decRows.map((r) => ({
    code: r[0],
    title: r[1],
    date: parseBrDate(r[2]),
    prepared_on: parseBrDate(r[3] ?? ''),
    status: 'pending',
    outcome: null,
    decided_by: null,
    decided_at: null,
  }))

  // --- to schedule ---
  const to_schedule: ToSchedule[] = []
  const to_schedule_plan: ToSchedulePlan[] = []
  const perCode = new Map<string, number>()
  for (const r of table(raw.agendar)) {
    const n = (perCode.get(r[0]) ?? 0) + 1
    perCode.set(r[0], n)
    const id = `${r[0]}-${n}`
    const w = parseBrRange(r[6] ?? '')
    to_schedule.push({
      id,
      code: r[0],
      what: r[3],
      window_start: w.start,
      window_end: w.end,
      window_text: orNull(r[6] ?? ''),
      confirmed_date: null,
    })
    to_schedule_plan.push({ to_schedule_id: id, person_id: personId(r[4] ?? '', `A Agendar ${r[0]}`), hours: parseHours(r[5] ?? ''), distributed: false })
  }

  // --- people: Don team members that own blocks, tasks or to-schedule items ---
  const people: Person[] = []
  for (const id of [...blocks.map((b) => b.person_id), ...tasks.map((t) => t.person_id), ...to_schedule_plan.map((p) => p.person_id)]) {
    if (!id || people.some((p) => p.id === id)) continue
    const name = DON_NAMES.find((d) => d.toLowerCase() === id)!
    people.push({ id, name, net_capacity_h: null, reserved_h: 0, daily_cap_h: 8, weekly_cap_h: 40 })
  }
  // Governança "Deslocamento..." row: hours that fill the leader's agenda but are not blocks
  ritualRows
    .filter((r) => fold(r[0]).startsWith('deslocamento'))
    .forEach((r) => {
      const p = people.find((x) => x.id === donId(r[4] ?? ''))
      if (p) p.reserved_h += parseHours(r[3] ?? '')
    })
  // Painel: "CAPACIDADE DE <NAME>" section holds "Capacidade líquida"
  const painel = raw.painel.map((r) => r.map(clean))
  const painelValue = (label: string): number | null => {
    const row = painel.find((r) => r[0] === label)
    return row ? parseHours(row[1] ?? '') : null
  }
  painel.forEach((r, i) => {
    const m = /^CAPACIDADE DE (.+)$/i.exec(r[0] ?? '')
    const p = m && people.find((x) => fold(x.name) === fold(m[1]))
    if (!p) return
    const net = painel.slice(i + 1).find((x) => x[0] === 'Capacidade líquida')
    if (net) p.net_capacity_h = parseHours(net[1])
  })

  // --- open items ---
  const open_items: OpenItem[] = []
  const open_items_internal: OpenItemInternal[] = []
  for (const r of table(raw.pendencias)) {
    const [code, text, owner, due, effect] = [r[0], r[1], r[2] ?? '', r[3] ?? '', r[4] ?? '']
    if (!/^[PX]-\d+$/.test(code)) {
      warn(`Pendências: unexpected code "${code}", row skipped`)
      continue
    }
    const kind = code.startsWith('P') ? 'pendencia' : 'divergencia'
    const exact = parseBrDate(due)
    const range = parseBrRange(due)
    open_items.push({
      code,
      kind,
      text,
      owner_public: ownerPublic(owner),
      due: exact ?? (/^\s*antes de/i.test(due) ? range.end : null),
      due_text: exact ? null : orNull(due),
      effect: orNull(effect),
      status: /^RESOLVIDA/i.test(text) ? 'resolved' : 'open',
      visible_to_terral: kind === 'pendencia' && /terral|fp&a|julio|diretoria/.test(fold(owner)),
    })
    open_items_internal.push({ code, owner_raw: owner })
  }

  // --- goals ---
  const goalUid = keyedUid('goal')
  const goals: Goal[] = table(raw.metas).map((r, i) => ({
    id: goalUid(`${r[0]}|${r[1]}|${r[2]}`),
    sort: i + 1,
    level: r[0],
    position: r[1],
    metric: r[2],
    baseline: orNull(r[3] ?? ''),
    state: r[4] ?? '',
    // the placeholder means "Terral decides at D11"; no target yet
    target: /^\[DECISÃO TERRAL\]$/i.test(r[5] ?? '') ? null : orNull(r[5] ?? ''),
  }))

  // --- traceability ---
  const traceUid = keyedUid('trace')
  const traceability: Traceability[] = table(raw.rastreabilidade).map((r) => {
    const lead = (r[4] ?? '').split(' ')[0]
    return {
      id: traceUid(`${r[0]}|${r[1]}|${r[2]}`),
      annex_tab: r[0],
      field: r[1],
      col: r[2],
      n: Number(r[3]) || 0,
      deliverable_code: deliverableCodes.has(lead) ? lead : null,
      task_description: r[5] ?? '',
      filled_by: r[6] ?? '',
    }
  })

  // --- dependencies ---
  const dependencies: Dependency[] = []
  const seen = new Set<string>()
  const dep = (from_kind: Dependency['from_kind'], from_ref: string, to_code: string, suggested: boolean) => {
    const key = `${from_kind}|${from_ref}|${to_code}`
    if (seen.has(key) || !deliverableCodes.has(to_code)) return
    seen.add(key)
    dependencies.push({ id: uid('dep', key), from_kind, from_ref, to_code, suggested })
  }
  // hard: decision "O que destrava"
  decRows.forEach((r) => extractCodes(r[5] ?? '').forEach((c) => dep('decision', r[0], c, false)))
  // hard: a to-schedule item belongs to its deliverable
  to_schedule.forEach((s) => dep('to_schedule', s.id, s.code, false))
  // suggested: deliverable codes found in free text
  decisions.forEach((d) => extractCodes(d.title).forEach((c) => dep('decision', d.code, c, true)))
  open_items.forEach((o) => extractCodes(`${o.text} ${o.effect ?? ''}`).forEach((c) => dep('open_item', o.code, c, true)))

  // --- cross-checks: warnings only ---
  const blockSum = (f: (b: Block) => boolean) => blocks.filter(f).reduce((s, b) => s + b.hours, 0)
  const differs = (a: number, b: number, tol = 0.01) => Math.abs(a - b) > tol
  for (const t of tasks) {
    const got = blockSum((b) => b.task_id === t.id)
    const want = taskSheetHours.get(t.id)!
    if (differs(got, want)) warn(`Task ${t.code} "${t.description}": blocks sum ${got} h, Prioridades ${want} h`)
  }
  for (const d of deliverables) {
    // deliverable hours = task blocks + presencial blocks + to-schedule hours
    const got =
      blockSum((b) => b.code === d.code && (b.type.startsWith('Tarefa') || b.type === 'Bloco presencial')) +
      to_schedule_plan.filter((p) => to_schedule.find((s) => s.id === p.to_schedule_id)!.code === d.code).reduce((s, p) => s + p.hours, 0)
    const want = sheetHours.get(d.code) ?? 0
    if (differs(got, want)) warn(`Deliverable ${d.code}: blocks + to-schedule ${got} h, Entregáveis ${want} h`)
  }
  const painelChecks: [string, number][] = [
    ['Entregas no total', deliverables.length],
    ['Tarefas no cronograma', tasks.length],
    ['Itens com data neste controle', blocks.length],
    ['Marcos de uso', deliverables.length],
  ]
  for (const [label, actual] of painelChecks) {
    const want = painelValue(label)
    if (want !== null && want !== actual) warn(`Painel "${label}": ${want}, parsed ${actual}`)
  }
  const teamAt = painel.findIndex((r) => r[0] === 'Pessoa')
  if (teamAt >= 0) {
    for (const r of painel.slice(teamAt + 1)) {
      const p = people.find((x) => x.name === r[0])
      if (!p) break
      const sched = blockSum((b) => b.person_id === p.id)
      const toSched = to_schedule_plan.filter((x) => x.person_id === p.id).reduce((s, x) => s + x.hours, 0)
      // the Painel shows one decimal (505,5 for 505.47)
      if (differs(sched, parseHours(r[2]), 0.06)) warn(`Painel ${p.name} programadas ${r[2]}, blocks ${sched}`)
      if (differs(toSched, parseHours(r[3]))) warn(`Painel ${p.name} a agendar ${r[3]}, plan ${toSched}`)
    }
  }

  return {
    people, deliverables, tasks, blocks, rituals, ritual_occurrences, decisions,
    to_schedule, to_schedule_plan, open_items, open_items_internal, goals, traceability, dependencies,
    warnings,
  }
}

const FILES: Record<TabName, string> = {
  painel: 'painel', prioridades: 'prioridades', plano: 'plano-diario', agendar: 'a-agendar',
  entregaveis: 'entregaveis', governanca: 'governanca', metas: 'arvore-de-metas',
  pendencias: 'pendencias', rastreabilidade: 'rastreabilidade',
}

/** Reads the sheet snapshot (data/import/*.json). */
export const loadRaw = (dir = 'data/import'): RawWorkbook =>
  Object.fromEntries(
    Object.entries(FILES).map(([k, f]) => [k, JSON.parse(readFileSync(`${dir}/${f}.json`, 'utf8'))]),
  ) as RawWorkbook

// `npm run import:parse`: print counts and warnings
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { warnings, ...data } = parseWorkbook(loadRaw())
  for (const [k, v] of Object.entries(data)) console.log(k.padEnd(20), v.length)
  console.log(warnings.length ? `\n${warnings.length} warnings:\n- ${warnings.join('\n- ')}` : '\nno warnings')
}
