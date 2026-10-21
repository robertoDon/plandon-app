import { diffDays, fmtDate, type ISODate } from '../domain/dates'
import type { Health } from '../domain/risk'
import type { Deliverable, OpenItem, ToSchedule } from '../domain/types'
import type { TerralData } from '../domain/terralView'
import type { Tone } from '../ui'

// Pure helpers of the Terral view. Input is TerralData only: no hours, no Don people, no tasks or blocks.

/** Phase 2 as the plan states it; used when the data has no ritual dates to derive it from. */
export const PHASE = { start: '2026-10-26', end: '2027-04-30' } as const

/** The project span: first and last ritual occurrence (the plan's calendar), else PHASE. */
export function projectSpan(t: Pick<TerralData, 'ritual_occurrences'>): { start: ISODate; end: ISODate; weeks: number } {
  const dates = t.ritual_occurrences.map((o) => o.date).sort()
  const start = dates[0] ?? PHASE.start
  const end = dates.at(-1) ?? PHASE.end
  return { start, end, weeks: Math.ceil((diffDays(end, start) + 1) / 7) }
}

/** Week of the project: 0 before the start, capped at the last week. */
export const weekNo = (today: ISODate, start: ISODate, weeks: number) =>
  today < start ? 0 : Math.min(weeks, Math.floor(diffDays(today, start) / 7) + 1)

/** Hour in São Paulo (0–23). */
export const spHour = (now = new Date()) =>
  Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Sao_Paulo', hour: '2-digit', hourCycle: 'h23' }).format(now))

export const greeting = (hour: number) => (hour >= 5 && hour < 12 ? 'Bom dia' : hour >= 12 && hour < 18 ? 'Boa tarde' : 'Boa noite')

const MON = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ']
export const monthShort = (d: ISODate) => MON[+d.slice(5, 7) - 1]
const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
export const monthLong = (d: ISODate) => `${MONTHS[+d.slice(5, 7) - 1]} de ${d.slice(0, 4)}`

export const byCode = (a: { code: string }, b: { code: string }) => a.code.localeCompare(b.code, 'pt-BR', { numeric: true })

/** Status of a deliverable as Terral reads it. In use and built are Don's events; the rest is the engine's health. */
export function deliverableStatus(d: Deliverable, health: Health | undefined): { tone: Tone; label: string } {
  if (d.in_use_at) return { tone: 'ok', label: 'Em uso' }
  if (health === 'late') return { tone: 'bad', label: 'Atrasada' }
  if (health === 'attention') return { tone: 'warn', label: 'Atenção' }
  if (d.built_at) return { tone: 'don', label: 'Construída' }
  return { tone: 'ok', label: 'No prazo' }
}

export const HEALTH: Record<Health, { tone: Tone; label: string; head: string }> = {
  on_time: { tone: 'ok', label: 'No prazo', head: 'O projeto segue no rumo.' },
  attention: { tone: 'warn', label: 'Atenção', head: 'Alguns pontos pedem atenção.' },
  late: { tone: 'bad', label: 'Atrasado', head: 'Há entregas fora do prazo.' },
}

/** The in-use date as text: the confirmed or planned date, else the sheet's own words ("A definir"). */
export function inUseText(d: Deliverable): string {
  if (d.in_use_start && (d.in_use_confirmed || !d.in_use_text)) {
    return d.in_use_end && d.in_use_end !== d.in_use_start ? `${fmtDate(d.in_use_start)} a ${fmtDate(d.in_use_end, true)}` : fmtDate(d.in_use_start, true)
  }
  return d.in_use_text ?? 'A definir'
}

export type MilestoneKind = 'use' | 'decision' | 'ritual'
export interface Milestone {
  key: string
  date: ISODate
  kind: MilestoneKind
  title: string
  detail: string
  /** deliverable code, decision code(s), ritual id */
  refs: string[]
  done: boolean
  confirmed?: boolean
}

/** Every dated milestone: in-use dates, board decisions (same day grouped) and ritual occurrences, by date. */
export function milestones(t: TerralData, opts: { rituals?: boolean } = {}): Milestone[] {
  const out: Milestone[] = []
  for (const d of t.deliverables) {
    if (!d.in_use_start) continue
    out.push({
      key: `use:${d.code}`, date: d.in_use_start, kind: 'use', title: `${d.name} em uso`,
      detail: [`Entrega ${d.code}`, d.terral_owner].filter(Boolean).join(' · '), refs: [d.code], done: !!d.in_use_at, confirmed: d.in_use_confirmed,
    })
  }
  const byDate = new Map<ISODate, TerralData['decisions']>()
  for (const x of t.decisions) if (x.date) byDate.set(x.date, [...(byDate.get(x.date) ?? []), x])
  for (const [date, ds] of byDate) {
    const sorted = [...ds].sort(byCode)
    const codes = sorted.map((x) => x.code)
    out.push(sorted.length === 1
      ? { key: `dec:${codes[0]}`, date, kind: 'decision', title: sorted[0].title, detail: `Decisão da diretoria · ${codes[0]}`, refs: codes, done: sorted[0].status === 'decided' }
      : { key: `dec:${date}`, date, kind: 'decision', title: `${sorted.length} decisões da diretoria`, detail: codes.join(', '), refs: codes, done: sorted.every((x) => x.status === 'decided') })
  }
  if (opts.rituals !== false) {
    const names = new Map(t.rituals.map((r) => [r.id, r]))
    for (const o of t.ritual_occurrences) {
      const r = names.get(o.ritual_id)
      if (r) out.push({ key: `rit:${o.id}`, date: o.date, kind: 'ritual', title: r.name, detail: r.cadence, refs: [r.id], done: false })
    }
  }
  const order: Record<MilestoneKind, number> = { decision: 0, use: 1, ritual: 2 }
  return out.sort((a, b) => a.date.localeCompare(b.date) || order[a.kind] - order[b.kind] || a.key.localeCompare(b.key))
}

/** What Terral owes: open pendências it can see, and to-schedule items, unconfirmed first, by date. */
export type TerralTodo =
  | { kind: 'open_item'; key: string; date: ISODate | null; item: OpenItem }
  | { kind: 'to_schedule'; key: string; date: ISODate | null; item: ToSchedule; deliverable?: Deliverable }

export function terralTodos(t: TerralData): TerralTodo[] {
  const names = new Map(t.deliverables.map((d) => [d.code, d]))
  const items: TerralTodo[] = [
    ...t.open_items.filter((o) => o.kind === 'pendencia' && o.status === 'open')
      .map((o): TerralTodo => ({ kind: 'open_item', key: `p:${o.code}`, date: o.due, item: o })),
    ...t.to_schedule.map((s): TerralTodo => ({ kind: 'to_schedule', key: `s:${s.id}`, date: s.confirmed_date ?? s.window_end, item: s, deliverable: names.get(s.code) })),
  ]
  const confirmed = (x: TerralTodo) => (x.kind === 'to_schedule' && x.item.confirmed_date ? 1 : 0)
  return items.sort((a, b) => confirmed(a) - confirmed(b) || (a.date ?? '9999').localeCompare(b.date ?? '9999') || a.key.localeCompare(b.key, 'pt-BR', { numeric: true }))
}

/** Due pill of an open item: overdue, today, within a week. */
export function dueTone(due: ISODate | null, today: ISODate): { tone: Tone; label: string } | null {
  if (!due) return null
  const n = diffDays(due, today)
  if (n < 0) return { tone: 'bad', label: n === -1 ? 'venceu ontem' : `venceu há ${-n} dias` }
  if (n === 0) return { tone: 'warn', label: 'vence hoje' }
  if (n <= 7) return { tone: 'warn', label: n === 1 ? 'amanhã' : `${n} dias` }
  return null
}

export const ISO_RE = /^\d{4}-\d{2}-\d{2}$/
/** A real calendar date in YYYY-MM-DD (rejects 2026-02-31). */
export const isIsoDate = (s: string) => ISO_RE.test(s) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s
