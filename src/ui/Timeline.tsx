import { useLayoutEffect, useRef, useState } from 'react'
import { diffDays, fmtDate, type ISODate } from '../domain/dates'
import type { Tone } from './Pill'

export interface TimelineItem { date: ISODate; label: string; tone: Tone; shape?: 'dot' | 'diamond' }

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
const ROW = 38
const GAP = 12
const MONTH_W = 28 // room a month label needs before `to`

/**
 * Horizontal journey from `from` to `to`: month ticks, a "hoje" line, items placed by date. Labels that would
 * collide drop to the next free row; a label that would run past the right edge flips to the left of its dot, and
 * one too long for either side is cut with an ellipsis (full text in the title and for screen readers). Items outside the range are counted in a hint under the track.
 */
export function Timeline({ from, to, today, items }: { from: ISODate; to: ISODate; today: ISODate; items: TimelineItem[] }) {
  const span = Math.max(1, diffDays(to, from))
  const pos = (d: ISODate) => (diffDays(d, from) / span) * 100
  const inside = items.filter((i) => i.date >= from && i.date <= to).sort((a, b) => a.date.localeCompare(b.date))
  const before = items.filter((i) => i.date < from).length
  const after = items.filter((i) => i.date > to).length

  const track = useRef<HTMLOListElement>(null)
  const [width, setWidth] = useState(0)
  const [place, setPlace] = useState<{ row: number; flip: boolean; max?: number }[]>([])
  useLayoutEffect(() => {
    const el = track.current
    if (!el) return
    const measure = () => {
      const w = el.clientWidth
      setWidth(w)
      const ends: number[] = [] // right edge of the last label in each row
      setPlace([...el.children].map((li, i) => {
        const x = (pos(inside[i].date) / 100) * w
        const text = li.querySelector('.ui-tl-text') as HTMLElement
        // natural width, even when an earlier pass truncated the text, but never past the CSS max-width of the text
        const cap = parseFloat(getComputedStyle(text).maxWidth) || Infinity
        const natural = (li as HTMLElement).offsetWidth - text.clientWidth + Math.min(text.scrollWidth, cap)
        const right = w - x + 7 // room when the label runs right of its dot
        const left = x + 7
        const flip = natural > right && left > right
        const lw = Math.min(natural, flip ? left : right)
        const start = flip ? x + 7 - lw : x - 7
        let row = ends.findIndex((end) => end + GAP <= start)
        if (row < 0) row = ends.length
        ends[row] = start + lw
        return { row, flip, max: lw < natural ? lw : undefined }
      }))
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
    // pos/inside derive from these
  }, [items, from, to])

  const months: { key: string; label: string; at: number }[] = []
  for (let d = `${from.slice(0, 7)}-01`; d <= to; d = nextMonth(d)) {
    months.push({ key: d, label: MONTHS[+d.slice(5, 7) - 1], at: pos(d < from ? from : d) })
  }
  const rows = Math.max(1, ...place.map((p) => p.row + 1))
  const showToday = today >= from && today <= to

  return (
    <div className="ui-tl">
      <div className="ui-tl-months" aria-hidden="true">
        {/* a month with no room for its label (just before `to`, or a first partial month right before the next): skip it */}
        {months.filter((m, i) => !width || (i === 0 ? i + 1 >= months.length || ((months[i + 1].at - m.at) / 100) * width >= MONTH_W : ((100 - m.at) / 100) * width >= MONTH_W))
          .map((m) => <span key={m.key} style={{ left: `${m.at}%` }}>{m.label}</span>)}
      </div>
      <div style={{ position: 'relative' }}>
        {showToday && <div className="ui-tl-today" style={{ left: `${pos(today)}%` }} aria-hidden="true"><span>hoje</span></div>}
        <ol ref={track} className="ui-tl-track" aria-label="Linha do tempo" style={{ height: rows * ROW }}>
          {inside.map((it, i) => (
            <li key={i} className={`ui-tl-item ${it.tone}${place[i]?.flip ? ' flip' : ''}`}
              style={{ left: `${pos(it.date)}%`, top: (place[i]?.row ?? 0) * ROW + 8, maxWidth: place[i]?.max }}>
              <span className={it.shape === 'diamond' ? 'ui-tl-dot diamond' : 'ui-tl-dot'} aria-hidden="true" />
              <span className="ui-tl-label"><span className="ui-tl-text" title={it.label}>{it.label}</span> <small>{fmtDate(it.date)}</small></span>
            </li>
          ))}
        </ol>
      </div>
      {showToday && <p className="ui-sr">Hoje é {fmtDate(today)}.</p>}
      {(before > 0 || after > 0) && (
        <p className="ui-tl-more">
          {[before > 0 && `${before} antes de ${fmtDate(from)}`, after > 0 && `${after} depois de ${fmtDate(to)}`].filter(Boolean).join(' · ')}
        </p>
      )}
    </div>
  )
}

function nextMonth(d: ISODate): ISODate {
  const y = +d.slice(0, 4)
  const m = +d.slice(5, 7)
  return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`
}
