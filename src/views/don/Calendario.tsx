import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { addDays, fmtDate, fmtHours, type ISODate } from '../../domain/dates'
import { dayCap } from '../../domain/risk'
import type { Block } from '../../domain/types'
import { usePlanData, type DonData } from '../../lib/data'
import { Card, Empty, Pill, Segmented, Sheet } from '../../ui'
import { BlockForm } from '../../don/BlockForm'
import { byOrder, cap, longDay, sumHours, useToday, weekday, weekOf, windowText } from '../../don/blocks'
import { useEditor } from '../../don/fields'
import { DonPage } from '../../don/Page'
import { BLOCK_TYPES, personName, projectWindow, typeOf, weekCode } from '../../don/plan'
import '../../don/plan.css'

type Mode = 'month' | 'week'
const NO_PERSON = '_none'
const MONTH = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' })
const monthTitle = (d: ISODate) => cap(MONTH.format(new Date(`${d.slice(0, 7)}-01T00:00:00Z`)))
/** First day of the month `n` months from `d`'s month. */
const monthStart = (d: ISODate, n = 0) => {
  const x = new Date(`${d.slice(0, 7)}-01T00:00:00Z`)
  x.setUTCMonth(x.getUTCMonth() + n)
  return x.toISOString().slice(0, 10)
}
const STEP: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/**
 * Don: every block by month or week, coloured by type with a letter mark (and a legend that filters), filtered by
 * person. A day over a person's cap carries a "!" badge. A block opens the same editor as the deliverable detail;
 * a move shows here, in the load and in the risks at once (one shared plan cache).
 */
export default function Calendario() {
  const state = usePlanData()
  const t = useToday()
  const [mode, setMode] = useState<Mode>('month')
  const [sel, setSel] = useState<ISODate | null>(null)
  const [person, setPerson] = useState('')
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const ed = useEditor<Block>()
  const grid = useRef<HTMLDivElement>(null)
  const moved = useRef(false)

  useEffect(() => {
    if (!moved.current) return
    moved.current = false
    grid.current?.querySelector<HTMLElement>('[aria-pressed="true"]')?.focus()
  })

  return (
    <DonPage eyebrow="Plano" title="Calendário" state={state} sub={() => 'Os blocos de todos, por mês ou por semana. Toque num bloco para mudar a data, a pessoa ou as horas.'}>
      {(d) => {
        const win = projectWindow(d)
        const clamp = (x: ISODate) => (x < win.start ? win.start : x > win.end ? win.end : x)
        const day = clamp(sel ?? t)
        const select = (x: ISODate) => setSel(clamp(x))
        const mine = (b: Block) => !person || (person === NO_PERSON ? !b.person_id : b.person_id === person)
        const shown = d.blocks.filter((b) => mine(b) && !hidden.has(b.type))
        const on = (x: ISODate) => shown.filter((b) => b.date === x).sort(byOrder)
        const over = overByDay(d, person)

        const days = mode === 'week' ? weekOf(day) : monthDays(day)
        const first = mode === 'week' ? days[0] : monthStart(day)
        const last = mode === 'week' ? days[6] : addDays(monthStart(day, 1), -1)
        const go = (dir: -1 | 1) => select(mode === 'week' ? addDays(day, 7 * dir) : dir < 0 ? addDays(monthStart(day), -1) : monthStart(day, 1))
        const title = mode === 'week' ? `${fmtDate(days[0])} a ${fmtDate(days[6])} · ${weekCode(days[0])}` : monthTitle(day)
        const types = [...BLOCK_TYPES.map((x) => x.type as string), ...new Set(d.blocks.map((b) => b.type))].filter((x, i, a) => a.indexOf(x) === i)
        const people = [...d.people].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))

        const onKey = (e: KeyboardEvent) => {
          const n = STEP[e.key]
          if (!n || e.altKey || e.metaKey || e.ctrlKey || e.shiftKey) return
          e.preventDefault()
          const next = clamp(addDays(day, n))
          if (next === day) return
          moved.current = true
          setSel(next)
        }
        const open = (b: Block) => ed.show(b)

        return (
          <>
            <div className="dfilters cal-filters">
              <Segmented label="Visão" value={mode} onChange={setMode} options={[{ value: 'month', label: 'Mês' }, { value: 'week', label: 'Semana' }]} />
              <Segmented label="Pessoa" value={person} onChange={setPerson}
                options={[{ value: '', label: 'Todos' }, ...people.map((p) => ({ value: p.id, label: p.name })), { value: NO_PERSON, label: 'Diretoria' }]} />
            </div>
            <div className="cal-legend" role="group" aria-label="Tipos de bloco (toque para mostrar ou esconder)">
              {types.map((x) => {
                const ty = typeOf(x)
                const off = hidden.has(x)
                return (
                  <button key={x} type="button" className={`cal-type t-${ty.cls}`} aria-pressed={!off}
                    onClick={() => setHidden((s) => {
                      const n = new Set(s)
                      if (!n.delete(x)) n.add(x)
                      return n
                    })}>
                    <i className="cal-mark" aria-hidden="true">{ty.mark}</i>{ty.label}
                  </button>
                )
              })}
            </div>

            <Card className="cal">
              <div className="cal-nav">
                <button type="button" className="cal-step" onClick={() => go(-1)} disabled={first <= win.start} aria-label={mode === 'week' ? 'Semana anterior' : 'Mês anterior'}>‹</button>
                <h2 aria-live="polite">{title}</h2>
                <button type="button" className="cal-step" onClick={() => go(1)} disabled={last >= win.end} aria-label={mode === 'week' ? 'Próxima semana' : 'Próximo mês'}>›</button>
                <button type="button" className="dbtn small" onClick={() => setSel(null)} disabled={day === clamp(t)}>Hoje</button>
              </div>
              {mode === 'month' ? (
                <div className="cal-month" ref={grid} role="group" aria-label={`${title}. Setas mudam o dia.`} onKeyDown={onKey}>
                  {['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'].map((w) => <span key={w} className="cal-wd" aria-hidden="true">{w}</span>)}
                  {days.map((x) => {
                    const bs = on(x)
                    const who = over.get(x)
                    const out = x < win.start || x > win.end
                    const marks = [...new Set(bs.map((b) => b.type))].map(typeOf)
                    const label = [`${weekday(x)}, ${fmtDate(x)}`, bs.length ? `${plural(bs.length, 'bloco', 'blocos')}, ${fmtHours(sumHours(bs))}` : 'sem blocos',
                      who && `acima do limite (${who.join(', ')})`].filter(Boolean).join(', ')
                    return (
                      <button key={x} type="button" data-day={x} aria-label={label} aria-pressed={x === day} aria-current={x === t ? 'date' : undefined}
                        tabIndex={x === day ? 0 : -1} className={`cal-day${x.slice(0, 7) !== day.slice(0, 7) ? ' other' : ''}${out ? ' out' : ''}${x === t ? ' today' : ''}`}
                        onClick={() => select(x)}>
                        <span className="cal-num" aria-hidden="true">{Number(x.slice(8))}{who && <i className="cal-over">!</i>}</span>
                        <span className="cal-marks" aria-hidden="true">
                          {marks.slice(0, 4).map((m) => <i key={m.type} className={`cal-mark t-${m.cls}`}>{m.mark}</i>)}
                        </span>
                        <span className="cal-lines" aria-hidden="true">
                          {bs.slice(0, 3).map((b) => <span key={b.id} className={`cal-line t-${typeOf(b.type).cls}${b.done ? ' done' : ''}`}>{b.description}</span>)}
                          {bs.length > 3 && <span className="cal-more">+{bs.length - 3}</span>}
                        </span>
                        {!!bs.length && <span className="cal-h num" aria-hidden="true">{fmtHours(sumHours(bs))}</span>}
                      </button>
                    )
                  })}
                </div>
              ) : (
                <div className="cal-week">
                  {days.map((x) => {
                    const bs = on(x)
                    const who = over.get(x)
                    return (
                      <section key={x} className={`cal-col${x === t ? ' today' : ''}`} aria-label={`${weekday(x)}, ${fmtDate(x)}`}>
                        <h3 className="cal-col-hd">
                          <span>{cap(weekday(x)).slice(0, 3)} <b className="num">{fmtDate(x)}</b>{x === t && <span className="cal-now"> · hoje</span>}</span>
                          {!!bs.length && <span className="num cal-h">{fmtHours(sumHours(bs))}</span>}
                        </h3>
                        {who && <Pill tone="bad">! Acima do limite: {who.join(', ')}</Pill>}
                        {bs.length ? <ul className="cal-blks">{bs.map((b) => <li key={b.id}><BlockChip b={b} d={d} onOpen={open} /></li>)}</ul>
                          : <p className="cal-empty">—</p>}
                      </section>
                    )
                  })}
                </div>
              )}
            </Card>

            {mode === 'month' && (
              <Card title={longDay(day)} action={on(day).length ? <span className="num">{fmtHours(sumHours(on(day)))}</span> : undefined}>
                {over.get(day) && <Pill tone="bad">! Acima do limite: {over.get(day)!.join(', ')}</Pill>}
                {on(day).length ? <ul className="cal-blks agenda" aria-label={`Blocos de ${fmtDate(day)}`}>{on(day).map((b) => <li key={b.id}><BlockChip b={b} d={d} onOpen={open} /></li>)}</ul>
                  : <Empty title={windowText(day, day, d.blocks) ?? 'Nada agendado para este dia.'} hint={hidden.size || person ? 'Os filtros podem estar escondendo blocos.' : undefined} />}
              </Card>
            )}

            <Sheet {...ed.sheet('Bloco')}>{ed.item && <BlockForm key={ed.item.id} block={ed.item} data={d} onDone={ed.close} />}</Sheet>
          </>
        )
      }}
    </DonPage>
  )
}

/** A block as a tappable chip: type mark (not colour alone), what, who, hours. */
function BlockChip({ b, d, onOpen }: { b: Block; d: DonData; onOpen: (b: Block) => void }) {
  const ty = typeOf(b.type)
  const who = personName(d, b.person_id)
  return (
    <button type="button" className={`cal-blk t-${ty.cls}${b.done ? ' done' : ''}`} onClick={() => onOpen(b)}
      aria-label={`${ty.label}: ${b.description}, ${who}, ${fmtHours(b.hours)}${b.done ? ', feito' : ''}`}>
      <i className="cal-mark" aria-hidden="true">{ty.mark}</i>
      <span className="cal-blk-text" aria-hidden="true">
        <span className="t">{b.description}</span>
        <span className="d">{[who, b.code, fmtHours(b.hours), b.done && 'feito'].filter(Boolean).join(' · ')}</span>
      </span>
    </button>
  )
}

/** Monday-to-Sunday weeks covering the month of `d`. */
function monthDays(d: ISODate): ISODate[] {
  const start = weekOf(monthStart(d))[0]
  const end = weekOf(addDays(monthStart(d, 1), -1))[6]
  const out: ISODate[] = []
  for (let x = start; x <= end; x = addDays(x, 1)) out.push(x)
  return out
}

/** Date → names of the people over their daily cap that day (all their blocks count, whatever the type filter). */
function overByDay(d: DonData, person: string): Map<ISODate, string[]> {
  const out = new Map<ISODate, string[]>()
  for (const p of d.people) {
    if (person && person !== p.id) continue
    const byDate = new Map<ISODate, Block[]>()
    for (const b of d.blocks) if (b.person_id === p.id) byDate.set(b.date, [...(byDate.get(b.date) ?? []), b])
    for (const [date, bs] of byDate) if (sumHours(bs) > dayCap(p, bs)) out.set(date, [...(out.get(date) ?? []), p.name])
  }
  return out
}
