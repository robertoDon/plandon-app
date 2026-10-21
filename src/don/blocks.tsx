import { useEffect, useState, type ReactNode } from 'react'
import { useSession } from '../auth/useSession'
import { addDays, fmtDate, fmtHours, today as todayOf, type ISODate } from '../domain/dates'
import type { Block, Person } from '../domain/types'
import { useMutate, type DonData } from '../lib/data'
import { Check, Segmented, useToast } from '../ui'
import './don.css'

type BlockWrite = { update: Pick<Block, 'done' | 'done_at'>; match: { id: string } }

const withBlock = (old: DonData, w: BlockWrite): DonData => ({
  ...old,
  blocks: old.blocks.map((b) => (b.id === w.match.id ? { ...b, ...w.update } : b)),
})

/**
 * toggleBlock(id, done): ticks or unticks a block at once (optimistic cache update), saves done + done_at, and
 * offers "Desfazer" (the inverse write). A failed save rolls the cache back and useMutate shows "Não salvou".
 */
export function useToggleBlock() {
  const toast = useToast()
  const m = useMutate<BlockWrite>('block', { optimistic: withBlock })
  const toggleBlock = (id: string, done: boolean, undoable = true): void => {
    // mutateAsync, not mutate's callbacks: those fire for the latest call only, and each tick needs its own undo.
    m.mutateAsync({ update: { done, done_at: done ? new Date().toISOString() : null }, match: { id } }).then(
      () => undoable && toast.show(done ? 'Feito.' : 'Desmarcado.', { undo: () => toggleBlock(id, !done, false) }),
      () => {}, // the error toast and the rollback are useMutate's
    )
  }
  return toggleBlock
}

/** Today (São Paulo, or ?today=), re-checked every minute and on return to the tab, so a page left open moves
 * on at midnight. */
export function useToday(): ISODate {
  const [t, setT] = useState(todayOf)
  useEffect(() => {
    const check = () => setT(todayOf())
    const timer = setInterval(check, 60_000)
    window.addEventListener('focus', check)
    document.addEventListener('visibilitychange', check)
    return () => {
      clearInterval(timer)
      window.removeEventListener('focus', check)
      document.removeEventListener('visibilitychange', check)
    }
  }, [])
  return t
}

/**
 * The person whose day this is: the signed-in account's person. An account with no person (or one not in the
 * plan) gets a picker instead.
 */
export function usePerson(people: Person[]) {
  const { profile } = useSession()
  const linked = people.find((p) => p.id === profile?.person_id)
  const [picked, setPicked] = useState<string | null>(null)
  const sorted = [...people].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
  const id = linked?.id ?? picked ?? sorted[0]?.id ?? null
  const picker = linked || !sorted.length ? null : (
    <Segmented label="Pessoa" value={id ?? ''} onChange={setPicked} options={sorted.map((p) => ({ value: p.id, label: p.name }))} />
  )
  return { person: people.find((p) => p.id === id) ?? null, picker }
}

const WEEKDAY = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']
const MONTH = new Intl.DateTimeFormat('pt-BR', { month: 'long', timeZone: 'UTC' })
const at = (d: ISODate) => new Date(`${d}T00:00:00Z`)

export const weekday = (d: ISODate) => WEEKDAY[at(d).getUTCDay()]
export const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
/** "Terça, 10 de novembro" */
export const longDay = (d: ISODate) => `${cap(weekday(d))}, ${at(d).getUTCDate()} de ${MONTH.format(at(d))}`
/** Monday to Sunday of the week holding `d`. */
export const weekOf = (d: ISODate): ISODate[] => {
  const mon = addDays(d, -((at(d).getUTCDay() + 6) % 7))
  return Array.from({ length: 7 }, (_, i) => addDays(mon, i))
}

export const sumHours = (bs: Pick<Block, 'hours'>[]) => bs.reduce((s, b) => s + b.hours, 0)

/** Stable order: rows come back from the server in any order (an update moves a row), and a list must not jump. */
export const byOrder = (a: Block, b: Block) =>
  a.date.localeCompare(b.date) || (a.code ?? '').localeCompare(b.code ?? '', 'pt-BR', { numeric: true }) || a.description.localeCompare(b.description, 'pt-BR') || a.id.localeCompare(b.id)

/** The project window: first and last block date. */
export const windowOf = (blocks: Block[]) => {
  const ds = blocks.map((b) => b.date).sort()
  return ds.length ? { start: ds[0], end: ds[ds.length - 1] } : null
}

/** Said when a span of days has no blocks because it lies before or after the project; null inside it. */
export function windowText(from: ISODate, to: ISODate, blocks: Block[]): string | null {
  const w = windowOf(blocks)
  if (w && to < w.start) return `O projeto começa em ${fmtDate(w.start)}.`
  if (w && from > w.end) return `O projeto terminou em ${fmtDate(w.end)}.`
  return null
}

/** One block with its done-check: description, deliverable, type, hours. */
export function BlockRow({ block: b, names, onToggle, children }: {
  block: Block; names: Map<string, string>; onToggle: (id: string, done: boolean) => void; children?: ReactNode
}) {
  const what = [b.code && `${b.code} ${names.get(b.code) ?? ''}`.trim(), b.type !== 'Tarefa' && b.type.toLowerCase(), b.due && `prazo ${fmtDate(b.due)}`]
    .filter(Boolean).join(' · ')
  return (
    <li className={b.done ? 'don-block done' : 'don-block'}>
      <Check checked={b.done} onChange={(v) => onToggle(b.id, v)} label={b.description} />
      <div className="don-block-text">
        <div className="t">{b.description}</div>
        {what && <div className="d">{what}</div>}
      </div>
      {children}
      <span className="don-block-h num">{fmtHours(b.hours)}</span>
    </li>
  )
}
