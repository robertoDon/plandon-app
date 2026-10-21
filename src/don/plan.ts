import { diffDays, fmtDate, type ISODate } from '../domain/dates'
import type { Health } from '../domain/risk'
import { TABLE_OF, type Block, type Deliverable, type PlanData } from '../domain/types'
import { useMutate, type DonData, type Write } from '../lib/data'
import { useToast, type Tone } from '../ui'

// Deliverables, tasks, blocks and the calendar: shared helpers and the write hook with undo.

type Row = Record<string, unknown>
type Key = keyof PlanData

/** Phase 2 (spec §1): 26/10/2026 to 30/04/2027. Week S01 starts on Monday 26/10 (the sheet's "Sem." column counts the same). */
export const PROJECT_START: ISODate = '2026-10-26'
export const PROJECT_END: ISODate = '2027-04-30'

/**
 * Dates Don may pick: from 26/10/2026 (hard: the week count starts there) to the latest of 30/04/2027, any block date and any
 * deliverable date (soft: a plan that slips past April must stay editable). Forms validate only a date that changed, so a row
 * already outside the window can still be saved.
 */
export function projectWindow(d: Pick<DonData, 'blocks' | 'deliverables'>): { start: ISODate; end: ISODate } {
  let end = PROJECT_END
  for (const b of d.blocks) if (b.date > end) end = b.date
  for (const x of d.deliverables)
    for (const v of [x.built_date, x.in_use_start, x.in_use_end, x.built_at, x.in_use_at]) if (v && v > end) end = v
  return { start: PROJECT_START, end }
}
const ISO = /^\d{4}-\d{2}-\d{2}$/
/** pt-BR error for a picked date, or null when it is a real date inside the window. */
export function dateError(v: string, win: { start: ISODate; end: ISODate }): string | null {
  if (!ISO.test(v) || Number.isNaN(Date.parse(`${v}T00:00:00Z`))) return 'Escolha uma data válida.'
  if (v < win.start || v > win.end) return `Use uma data do projeto, de ${fmtDate(win.start, true)} a ${fmtDate(win.end, true)}.`
  return null
}
export const weekCode = (d: ISODate) => `S${String(Math.floor(diffDays(d, PROJECT_START) / 7) + 1).padStart(2, '0')}`

const matches = (r: Row, m: Row) => Object.entries(m).every(([k, v]) => r[k] === v)

/** The optimistic image of one write on the cached plan. */
export function applyWrite(old: DonData, key: Key, w: Write): DonData {
  const rows = old[key] as unknown as Row[]
  if ('insert' in w) return { ...old, [key]: [...rows, ...[w.insert].flat()] }
  if ('update' in w) return { ...old, [key]: rows.map((r) => (matches(r, w.match) ? { ...r, ...w.update } : r)) }
  if ('delete' in w) return { ...old, [key]: rows.filter((r) => !matches(r, w.delete)) }
  return old
}

/**
 * Optimistic writes on one plan table, with "Desfazer". Each call resolves when the server took it and rejects on
 * failure (useMutate has then rolled the cache back and shown "Não salvou"). The undo is the inverse write.
 */
export function useRowWrites<K extends Key>(key: K, pk = 'id') {
  const toast = useToast()
  const m = useMutate<Write>(TABLE_OF[key], { optimistic: (old, w) => applyWrite(old, key, w) })
  const run = (w: Write) => m.mutateAsync(w)
  const quiet = (w: Write) => void run(w).catch(() => {})
  return {
    run,
    async update(id: string, change: Row, before: Row, msg?: string) {
      await run({ update: change, match: { [pk]: id } })
      if (msg) toast.show(msg, { undo: () => quiet({ update: before, match: { [pk]: id } }) })
    },
    async create(row: Row, msg?: string) {
      await run({ insert: row })
      if (msg) toast.show(msg, { undo: () => quiet({ delete: { [pk]: row[pk] } }) })
    },
    async remove(row: Row, msg: string) {
      await run({ delete: { [pk]: row[pk] } })
      toast.show(msg, { undo: () => quiet({ insert: row }) })
    },
  }
}

export const HEALTH: Record<Health, { tone: Tone; label: string }> = {
  on_time: { tone: 'ok', label: 'No prazo' },
  attention: { tone: 'warn', label: 'Atenção' },
  late: { tone: 'bad', label: 'Atrasada' },
}

/** Planned and done hours of a deliverable: the sum of its blocks (hours are never stored twice). */
export function progressOf(code: string, blocks: Block[]) {
  let planned = 0
  let done = 0
  for (const b of blocks) if (b.code === code) {
    planned += b.hours
    if (b.done) done += b.hours
  }
  return { planned, done, pct: planned ? Math.round((done / planned) * 100) : 0 }
}

/** The deliverable's next milestone, as a short phrase. */
export function nextOf(d: Deliverable): string {
  if (!d.built_at && d.built_date) return `Construção ${fmtDate(d.built_date)}`
  if (d.in_use_at) return `Em uso desde ${fmtDate(d.in_use_at)}`
  if (d.in_use_start) return `Uso ${fmtDate(d.in_use_start)}${d.in_use_end && d.in_use_end !== d.in_use_start ? ` a ${fmtDate(d.in_use_end)}` : ''}`
  return d.in_use_text ? `Uso: ${d.in_use_text}` : 'Uso a definir'
}

/** Block types, their colour class and a short mark, so a chip never relies on colour alone. */
export const BLOCK_TYPES = [
  { type: 'Tarefa', label: 'Tarefa', mark: 'T', cls: 'task' },
  { type: 'Tarefa com a Terral', label: 'Com a Terral', mark: 'TT', cls: 'terral' },
  { type: 'Rito', label: 'Rito', mark: 'R', cls: 'rite' },
  { type: 'Preparação de decisão', label: 'Preparação', mark: 'P', cls: 'prep' },
  { type: 'Decisão da diretoria', label: 'Decisão', mark: 'D', cls: 'decision' },
  { type: 'Bloco presencial', label: 'Presencial', mark: 'BP', cls: 'site' },
] as const
export const typeOf = (t: string) => BLOCK_TYPES.find((x) => x.type === t) ?? { type: t, label: t, mark: t.charAt(0).toUpperCase(), cls: 'other' }

export const personName = (d: DonData, id: string | null) => (id ? d.people.find((p) => p.id === id)?.name ?? id : 'Diretoria Terral')

/** user ids and person ids → display names, for historyText. */
export const namesOf = (d: Pick<DonData, 'profiles' | 'people'>): Record<string, string> =>
  Object.fromEntries([...d.people.map((p) => [p.id, p.name]), ...d.profiles.map((p) => [p.id, p.display_name])])

export const newId = () => crypto.randomUUID()
