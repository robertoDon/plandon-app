import { diffDays, fmtDate, fmtHours, type ISODate } from './dates'
import type { Block, Dependency, Person, PlanData, Severity, ToSchedulePlan } from './types'

// Risk engine (spec section 8): pure, recomputed from scratch on every change.

export type RuleId =
  | 'terral_dependency_overdue'
  | 'decision_late_blocking'
  | 'day_over_capacity'
  | 'week_over_capacity'
  | 'hours_unconfirmed'
  | 'confirmed_not_distributed'
  | 'deliverable_no_in_use_date'
  | 'behind_plan'
  | 'slack_exhausted'

export interface Risk {
  id: string // stable: rule + ref/person/date
  rule: RuleId | 'manual'
  severity: Severity
  title: string // pt-BR; no Don names or hours when the input is TerralData
  codes: string[] // deliverables held up, transitively
  person_id?: string
  date?: ISODate
  ref?: string
}

export type Health = 'on_time' | 'attention' | 'late'

export type EngineInput = Pick<PlanData, 'deliverables' | 'decisions' | 'to_schedule' | 'open_items' | 'dependencies'> &
  Partial<Pick<PlanData, 'people' | 'blocks' | 'to_schedule_plan' | 'manual_risks'>>

// The sheet marks on-site days in Matão as "Bloco presencial"; the spec calls them "Deslocamento".
const TRAVEL = new Set(['Deslocamento', 'Bloco presencial'])
const TRAVEL_CAP_H = 9
const RANK: Record<Severity, number> = { high: 0, medium: 1, low: 2 }

const sum = <T>(xs: T[], f: (x: T) => number) => xs.reduce((s, x) => s + f(x), 0)

/** A person's cap for one day's blocks: the daily cap, raised to 9 h on a travel / on-site day. */
export const dayCap = (p: Pick<Person, 'daily_cap_h'>, dayBlocks: Pick<Block, 'type'>[]) =>
  dayBlocks.some((b) => TRAVEL.has(b.type)) ? Math.max(p.daily_cap_h, TRAVEL_CAP_H) : p.daily_cap_h

/**
 * Hours left in the net capacity: net - reserved - planned blocks - hours still to schedule (not yet distributed).
 * Null when the person has no net capacity.
 */
export function slackOf(p: Pick<Person, 'id' | 'net_capacity_h' | 'reserved_h'>, blocks: Pick<Block, 'person_id' | 'hours'>[], plans: Pick<ToSchedulePlan, 'person_id' | 'hours' | 'distributed'>[]): number | null {
  if (p.net_capacity_h === null) return null
  const undistributed = sum(plans.filter((x) => x.person_id === p.id && !x.distributed), (x) => x.hours)
  return p.net_capacity_h - p.reserved_h - sum(blocks.filter((b) => b.person_id === p.id), (b) => b.hours) - undistributed
}

function groupBy<T>(xs: T[], key: (x: T) => string | null): Map<string, T[]> {
  const m = new Map<string, T[]>()
  for (const x of xs) {
    const k = key(x)
    if (k !== null) m.set(k, [...(m.get(k) ?? []), x])
  }
  return m
}

/** Deliverables reached from the start codes, start included, following deliverable -> deliverable edges (BFS). */
function closure(start: string[], deps: Dependency[]): string[] {
  const seen = [...new Set(start)]
  for (let i = 0; i < seen.length; i++)
    for (const d of deps) if (d.from_kind === 'deliverable' && d.from_ref === seen[i] && !seen.includes(d.to_code)) seen.push(d.to_code)
  return seen
}

const unlocks = (deps: Dependency[], kind: Dependency['from_kind'], ref: string) =>
  deps.filter((d) => d.from_kind === kind && d.from_ref === ref).map((d) => d.to_code)

export function evaluate(
  data: EngineInput,
  today: ISODate,
): { risks: Risk[]; health: Record<string, Health>; project: { status: Health; reasons: string[] } } {
  const { deliverables, decisions, to_schedule, open_items, dependencies: deps } = data
  const people = data.people ?? []
  const blocks = data.blocks ?? []
  const plans = data.to_schedule_plan ?? []
  const risks: Risk[] = []
  const add = (r: Omit<Risk, 'id'>, key: string) => risks.push({ id: `${r.rule}:${key}`, ...r })
  const nameOf = (id: string) => people.find((p) => p.id === id)?.name ?? id

  // Next milestone of a deliverable: the first of built_date / in_use_start not yet passed.
  const nextDate = (code: string) => {
    const d = deliverables.find((x) => x.code === code)
    return [d?.built_date, d?.in_use_start].filter((x): x is string => !!x && x >= today).sort()[0] ?? null
  }

  for (const o of open_items) {
    if (o.kind !== 'pendencia' || !o.visible_to_terral || o.status !== 'open' || !o.due || o.due >= today) continue
    const codes = closure(unlocks(deps, 'open_item', o.code), deps)
    const soon = codes.some((c) => {
      const nd = nextDate(c)
      return nd !== null && diffDays(nd, today) <= 14
    })
    const held = codes.length ? `; segura ${codes.join(', ')}` : ''
    add({ rule: 'terral_dependency_overdue', severity: soon ? 'high' : 'medium', title: `Pendência ${o.code} venceu em ${fmtDate(o.due)}${held}`, codes, ref: o.code, date: o.due }, o.code)
  }

  for (const d of decisions) {
    if (d.status !== 'pending' || !d.date || d.date >= today) continue
    const direct = unlocks(deps, 'decision', d.code)
    if (!direct.length) continue
    const codes = closure(direct, deps)
    add({ rule: 'decision_late_blocking', severity: 'high', title: `Decisão ${d.code} atrasada desde ${fmtDate(d.date)}; segura ${codes.join(', ')}`, codes, ref: d.code, date: d.date }, d.code)
  }

  // Capacity: only from today on; the past cannot be re-planned.
  for (const p of people) {
    const mine = blocks.filter((b) => b.person_id === p.id)
    for (const [date, bs] of groupBy(mine, (b) => (b.date >= today ? b.date : null))) {
      const cap = dayCap(p, bs)
      const over = sum(bs, (b) => b.hours) - cap
      if (over > 0)
        add({ rule: 'day_over_capacity', severity: over > 2 ? 'high' : 'medium', title: `${p.name}: ${fmtHours(over + cap)} em ${fmtDate(date)} (limite ${fmtHours(cap)})`, codes: [], person_id: p.id, date }, `${p.id}:${date}`)
    }
    for (const [week, bs] of groupBy(mine, (b) => b.week)) {
      const total = sum(bs, (b) => b.hours)
      const last = bs.map((b) => b.date).sort().at(-1)!
      if (last >= today && total > p.weekly_cap_h)
        add({ rule: 'week_over_capacity', severity: 'medium', title: `${p.name}: ${fmtHours(total)} na semana ${week} (limite ${fmtHours(p.weekly_cap_h)})`, codes: [], person_id: p.id, ref: week }, `${p.id}:${week}`)
    }
  }

  for (const t of to_schedule) {
    if (t.confirmed_date || !t.window_end) continue
    const left = diffDays(t.window_end, today)
    if (left <= 21)
      add({ rule: 'hours_unconfirmed', severity: left < 0 ? 'high' : 'medium', title: `${t.code}: agendamento sem data confirmada; a janela ${left < 0 ? 'fechou' : 'fecha'} em ${fmtDate(t.window_end)}`, codes: [t.code], ref: t.id, date: t.window_end }, t.id)
  }

  for (const pl of plans) {
    const t = to_schedule.find((x) => x.id === pl.to_schedule_id)
    if (!t?.confirmed_date || pl.distributed) continue
    const who = pl.person_id ? `${nameOf(pl.person_id)}: ` : ''
    add({
      rule: 'confirmed_not_distributed', severity: diffDays(t.confirmed_date, today) <= 7 ? 'high' : 'medium',
      title: `${who}${fmtHours(pl.hours)} de ${t.code} confirmadas para ${fmtDate(t.confirmed_date)} e ainda sem blocos`,
      codes: [t.code], ref: t.id, date: t.confirmed_date, ...(pl.person_id ? { person_id: pl.person_id } : {}),
    }, `${t.id}:${pl.person_id ?? ''}`)
  }

  for (const d of deliverables) {
    if (d.in_use_at) continue
    const openBlockers = deps
      .filter((x) => x.from_kind === 'open_item' && !x.suggested && x.to_code === d.code)
      .filter((x) => open_items.some((o) => o.code === x.from_ref && o.status === 'open'))
      .map((x) => x.from_ref)
    if (!d.in_use_start || openBlockers.length)
      add({
        rule: 'deliverable_no_in_use_date', severity: 'medium', codes: [d.code], ref: d.code,
        title: d.in_use_start ? `${d.code}: data de uso depende de ${openBlockers.join(', ')}` : `${d.code} sem data de uso`,
      }, d.code)
  }

  for (const d of deliverables) {
    const past = blocks.filter((b) => b.code === d.code && b.date < today)
    const planned = sum(past, (b) => b.hours)
    const short = planned > 0 ? (planned - sum(past.filter((b) => b.done), (b) => b.hours)) / planned : 0
    if (short > 0.15)
      add({ rule: 'behind_plan', severity: short > 0.3 ? 'medium' : 'low', title: `${d.code} atrás do plano: ${Math.round(short * 100)}% das horas previstas até ontem não feitas`, codes: [d.code], ref: d.code }, d.code)
  }

  for (const p of people) {
    const slack = slackOf(p, blocks, plans)
    if (slack === null) continue
    if (slack < 0)
      add({ rule: 'slack_exhausted', severity: 'high', title: `${p.name}: plano passa a capacidade líquida em ${fmtHours(-slack)}`, codes: [], person_id: p.id }, p.id)
  }

  const codesSet = new Set(deliverables.map((d) => d.code))
  for (const m of data.manual_risks ?? [])
    if (m.status === 'open')
      risks.push({ id: m.id, rule: 'manual', severity: m.severity, title: m.title, codes: m.links.filter((l) => codesSet.has(l)), ...(m.person_id ? { person_id: m.person_id } : {}) })

  risks.sort((a, b) => RANK[a.severity] - RANK[b.severity])

  // Health
  const health: Record<string, Health> = {}
  const late: string[] = []
  for (const d of deliverables) {
    const use = d.in_use_end ?? d.in_use_start
    if ((d.built_date && d.built_date < today && !d.built_at) || (use && use < today && !d.in_use_at)) {
      health[d.code] = 'late'
      late.push(!d.built_at && d.built_date && d.built_date < today ? `${d.code} atrasada: construção prevista para ${fmtDate(d.built_date)}` : `${d.code} atrasada: uso previsto para ${fmtDate(use!)}`)
    } else
      health[d.code] = d.published_flag || risks.some((r) => r.severity !== 'low' && r.codes.includes(d.code)) ? 'attention' : 'on_time'
  }
  const statuses = Object.values(health)
  const status: Health = statuses.includes('late') ? 'late' : statuses.includes('attention') ? 'attention' : 'on_time'
  const flags = deliverables.filter((d) => d.published_flag).map((d) => `${d.code}: ${d.published_flag}`)
  const reasons = [
    ...late,
    ...risks.filter((r) => r.severity === 'high').map((r) => r.title),
    ...risks.filter((r) => r.severity === 'medium').map((r) => r.title),
    ...flags,
  ].slice(0, 3)

  return { risks, health, project: { status, reasons } }
}
