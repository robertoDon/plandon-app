import { createContext, useContext, type ReactNode } from 'react'
import { fmtDate, type ISODate } from '../domain/dates'
import type { TerralData } from '../domain/terralView'
import { useTerralData } from '../lib/data'
import { Card } from '../ui'
import { monthShort } from './model'
import '../don/forms.css'
import './terral.css'

/**
 * Where the Terral screens are mounted: '/t' for Terral, '/don/terral' for Don's preview. In the preview every write
 * (decision, date, comment, file) is off: Don must not act as Terral.
 */
export const TerralCtx = createContext<{ base: string; preview: boolean }>({ base: '/t', preview: false })
export const useTerralCtx = () => useContext(TerralCtx)

/** Page frame of a Terral screen: header, then a skeleton while loading, a calm retry on error, the body with data. */
export function TerralPage({ eyebrow, title, sub, back, children }: {
  back?: ReactNode
  eyebrow?: ReactNode | ((t: TerralData | undefined) => ReactNode); title: ReactNode | ((t: TerralData | undefined) => ReactNode); sub?: (t: TerralData) => ReactNode; children: (t: TerralData) => ReactNode
}) {
  const q = useTerralData()
  const { data } = q
  return (
    <div className="t-page">
      <header className="t-head">
        {back}
        {eyebrow && <div className="eyebrow">{typeof eyebrow === 'function' ? eyebrow(data) : eyebrow}</div>}
        <h1>{typeof title === 'function' ? title(data) : title}</h1>
        {data && sub && <p className="sub">{sub(data)}</p>}
      </header>
      {data ? children(data) : q.status === 'error' ? (
        <Card>
          <div className="t-retry" role="alert">
            <b>Não deu para carregar agora.</b>
            <p>Confira a internet e tente de novo. Nada do que você fez se perdeu.</p>
            <button type="button" className="dbtn primary small" onClick={() => void q.refetch()} disabled={q.isFetching}>
              {q.isFetching ? 'Tentando…' : 'Tentar de novo'}
            </button>
          </div>
        </Card>
      ) : <Skeleton />}
    </div>
  )
}

/** Card-shaped placeholders. They fade in after a beat, so a fast load shows nothing at all. */
function Skeleton() {
  return (
    <div className="t-skel" aria-busy="true" aria-label="Carregando">
      <div className="t-skel-card tall" />
      <div className="t-skel-card" />
      <div className="t-skel-row"><div className="t-skel-card" /><div className="t-skel-card" /></div>
    </div>
  )
}

/** "NOV / 23" date block of the mockup; the full date is read out. Null date: a dash. */
export function DateBlock({ date }: { date: ISODate | null }) {
  if (!date) return <div className="t-date" aria-hidden="true">—</div>
  return (
    <div className="t-date">
      <span aria-hidden="true">{monthShort(date)}<b>{date.slice(8)}</b></span>
      <span className="ui-sr">{fmtDate(date, true)}</span>
    </div>
  )
}

/** One list row: date block, title and detail, and a side slot (pill, tag or button). */
export function Row({ date, title, detail, side, clamp }: { date: ISODate | null; title: ReactNode; detail?: ReactNode; side?: ReactNode; clamp?: boolean }) {
  return (
    <li className="t-li">
      <DateBlock date={date} />
      <div className="t-li-text">
        <div className={clamp ? 't clamp' : 't'}>{title}</div>
        {detail && <div className="d">{detail}</div>}
      </div>
      {side && <div className="t-li-side">{side}</div>}
    </li>
  )
}

/** A gray tag; `you` is the orange one ("Sua decisão"). */
export const Tag = ({ you, children }: { you?: boolean; children: ReactNode }) => <span className={you ? 't-tag you' : 't-tag'}>{children}</span>

/** Explains why a write is off in the preview, next to the disabled control. */
export const PREVIEW_HINT = 'Só a Terral faz isso. Na prévia fica desligado.'
