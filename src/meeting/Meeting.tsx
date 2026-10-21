import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { AnimatePresence, motion, useDragControls, useReducedMotion, type PanInfo } from 'motion/react'
import { useSession } from '../auth/useSession'
import { addDays, diffDays, fmtDate, type ISODate } from '../domain/dates'
import type { TerralData } from '../domain/terralView'
import type { Decision } from '../domain/types'
import { useTerralData } from '../lib/data'
import { spring } from '../lib/motion'
import { HOME } from '../app/routes'
import { useToday } from '../shared/useToday'
import { useEditor } from '../don/fields'
import { Card, Empty, Sheet } from '../ui'
import { DecisionForm, useConfirmDate } from '../terral/actions'
import { DecisionRow } from '../terral/Decisions'
import { sideOf } from '../terral/Milestones'
import { healthOf, milestones, projectSpan, terralTodos, weekNo, type TerralTodo } from '../terral/model'
import { HealthCard, TodoRow } from '../terral/Overview'
import { Row } from '../terral/Page'
import '../don/forms.css'
import '../terral/terral.css'
import './meeting.css'

// Meeting mode: the checkpoint agenda on the big screen. It reads useTerralData only, so a Don user running the
// meeting shows exactly what Terral sees. Writes stay Terral's: in a Don session they are off, as in the preview.

export const STEPS = ['Saúde', 'Marcos', 'Decisões da semana', 'Pendências'] as const
const LAST = STEPS.length - 1
// What fits at 1920×1080 (and any 16:9, the type scales with the viewport); the rest becomes "+N".
const CAP = { milestones: 6, decisions: 6, todos: 5 }
const IDLE_MS = 2500
/** Disabled writes in a Don session: plain, no "prévia" (this is the meeting, not the preview). */
const DON_HINT = 'Só a Terral faz isso.'

/** ?passo=1..4 → step index; anything else is step 1. */
export const stepOf = (v: string | null) => {
  const n = Number(v)
  return Number.isInteger(n) && n >= 1 && n <= STEPS.length ? n - 1 : 0
}

const label = (i: number) => `Passo ${i + 1} de ${STEPS.length}: ${STEPS[i]}`
/** Keys belong to the field or the open sheet while one has focus. */
const busy = (t: EventTarget | null) =>
  !!document.querySelector('dialog[open]') ||
  (t instanceof Element && !!t.closest('input, textarea, select, [contenteditable="true"], [contenteditable=""], dialog'))

/** Resolves true once in full screen; false when unsupported or refused (the page just stays windowed). */
async function requestFs(): Promise<boolean> {
  const el = document.documentElement
  if (document.fullscreenElement) return true
  if (!el.requestFullscreen) return false
  try { await el.requestFullscreen(); return true } catch { return false }
}
function exitFs() {
  if (!document.fullscreenElement || !document.exitFullscreen) return
  try { void document.exitFullscreen().catch(() => {}) } catch { /* already out */ }
}

export function Meeting() {
  const { profile } = useSession()
  const navigate = useNavigate()
  const q = useTerralData()
  const today = useToday()
  const reduce = useReducedMotion()
  const uid = useId()
  // the step lives in the URL (?passo=N, replaced, not pushed): a reload or a shared link keeps it, Back leaves the meeting
  const [params, setParams] = useSearchParams()
  const step = stepOf(params.get('passo'))
  const [dir, setDir] = useState(1)
  const drag = useDragControls()
  const editor = useEditor<Decision>()
  const confirm = useConfirmDate()
  const preview = profile?.role !== 'terral'
  const [fs, setFs] = useState(() => !!document.fullscreenElement)
  const [idle, setIdle] = useState(false)
  const asked = useRef(false)
  const first = useRef(true)
  const home = HOME[profile?.role ?? 'terral']

  const go = (to: number) => {
    const t = Math.max(0, Math.min(LAST, to))
    if (t === step) return
    setDir(t > step ? 1 : -1)
    setParams((p) => { const n = new URLSearchParams(p); n.set('passo', String(t + 1)); return n }, { replace: true })
  }
  const move = (by: number) => go(step + by)
  // full screen on the first click or key (a user gesture); unsupported or refused: the page just stays windowed
  // (a refused request, e.g. a gesture the browser did not count, is tried again on the next one)
  const firstGesture = () => {
    if (asked.current) return
    asked.current = true
    void requestFs().then((ok) => { if (!ok) asked.current = false })
  }

  const keys = useRef<(e: KeyboardEvent) => void>(() => {})
  keys.current = (e) => {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || busy(e.target)) return
    const onControl = e.target instanceof Element && !!e.target.closest('button, a, summary')
    switch (e.key) {
      case 'ArrowRight': case 'PageDown': move(1); break
      case 'ArrowLeft': case 'PageUp': move(-1); break
      case ' ':
        if (onControl) return // Space presses the focused button
        move(1)
        break
      case 'Escape':
        exitFs()
        navigate(home)
        return
      default: return
    }
    e.preventDefault()
    firstGesture()
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => keys.current(e)
    // not from the bar's buttons: they decide themselves (the full-screen toggle, Sair)
    const onDown = (e: PointerEvent) => { if (!(e.target instanceof Element && e.target.closest('.m-bar-actions'))) firstGesture() }
    const onFs = () => setFs(!!document.fullscreenElement)
    window.addEventListener('keydown', onKey)
    window.addEventListener('pointerdown', onDown)
    document.addEventListener('fullscreenchange', onFs)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointerdown', onDown)
      document.removeEventListener('fullscreenchange', onFs)
      exitFs()
    }
  }, [])

  // In full screen the top bar fades after a pause; a mouse move, a key or focus inside it brings it back.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const wake = () => {
      setIdle(false)
      clearTimeout(timer)
      timer = setTimeout(() => setIdle(true), IDLE_MS)
    }
    wake()
    for (const ev of ['pointermove', 'pointerdown', 'keydown'] as const) window.addEventListener(ev, wake)
    return () => {
      clearTimeout(timer)
      for (const ev of ['pointermove', 'pointerdown', 'keydown'] as const) window.removeEventListener(ev, wake)
    }
  }, [])

  // the new step's heading takes focus, so a screen reader lands on it and Tab starts there
  useEffect(() => {
    if (first.current) { first.current = false; return }
    const id = requestAnimationFrame(() => document.getElementById(`${uid}-h${step}`)?.focus({ preventScroll: true }))
    return () => cancelAnimationFrame(id)
  }, [step, uid])

  const onDragEnd = (_: unknown, info: PanInfo) => {
    // a short flick counts as much as a long drag: project the release velocity a little forward
    const x = info.offset.x + info.velocity.x * 0.2
    if (x < -80) move(1)
    else if (x > 80) move(-1)
  }

  const slide = {
    enter: (d: number) => (reduce ? { x: 0, opacity: 0 } : { x: `${d * 100}%`, opacity: 1 }),
    center: { x: 0, opacity: 1 },
    exit: (d: number) => (reduce ? { x: 0, opacity: 0 } : { x: `${d * -100}%`, opacity: 1 }),
  }

  return (
    <div className={`m-root${fs && idle ? ' is-idle' : ''}`}>
      <header className="m-bar">
        <span className="m-bar-label" aria-hidden="true">Modo reunião · <b>{step + 1} de {STEPS.length}</b> · {STEPS[step]}</span>
        <nav className="m-dots" aria-label="Passos da reunião">
          {STEPS.map((s, i) => (
            <button key={s} type="button" aria-label={label(i)} aria-current={i === step ? 'step' : undefined} onClick={() => go(i)}>
              <i />
            </button>
          ))}
        </nav>
        <div className="m-bar-actions">
          {document.fullscreenEnabled && (
            <button type="button" className="m-icon" onClick={() => (fs ? exitFs() : void requestFs())} aria-label={fs ? 'Sair da tela cheia' : 'Tela cheia'} title={fs ? 'Sair da tela cheia' : 'Tela cheia'}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                {fs ? <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" /> : <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />}
              </svg>
            </button>
          )}
          <button type="button" className="m-exit" onClick={() => { exitFs(); navigate(home) }}>Sair</button>
        </div>
      </header>
      <p className="ui-sr m-live" role="status" aria-live="polite">{label(step)}</p>

      <main className="m-stage">
        {q.data ? (
          <AnimatePresence initial={false} custom={dir}>
            <motion.section key={step} className="m-step" role="region" aria-labelledby={`${uid}-h${step}`}
              custom={dir} variants={slide} initial="enter" animate="center" exit="exit"
              transition={reduce ? { duration: 0.2 } : spring}
              // swipe is for touch and pen only: a mouse selects text and clicks, it never changes the step
              drag="x" dragListener={false} dragControls={drag} onPointerDown={(e) => { if (e.pointerType !== 'mouse') drag.start(e) }}
              dragConstraints={{ left: 0, right: 0 }} dragElastic={0.2} onDragEnd={onDragEnd}>
              <Step i={step} d={q.data} today={today} hid={`${uid}-h${step}`} preview={preview} onRegister={editor.show} onConfirm={confirm.ask} />
            </motion.section>
          </AnimatePresence>
        ) : (
          <div className="m-wait" role={q.status === 'error' ? 'alert' : undefined} aria-busy={q.status !== 'error'}>
            {q.status === 'error' ? (
              <>
                <b>Não deu para carregar agora.</b>
                <button type="button" className="dbtn primary" onClick={() => void q.refetch()} disabled={q.isFetching}>
                  {q.isFetching ? 'Tentando…' : 'Tentar de novo'}
                </button>
              </>
            ) : 'Carregando…'}
          </div>
        )}
      </main>
      {/* sheets outside the sliding step: a drag or a step change never touches an open form */}
      <Sheet {...editor.sheet('Registrar decisão')}>
        {editor.item && <DecisionForm key={editor.item.code} decision={editor.item} today={today} onDone={editor.close} />}
      </Sheet>
      {confirm.sheet}
    </div>
  )
}

/** "+N …" under a list cut to fit the screen: a button that opens the rest in place (the step then scrolls). */
function More({ n, what, open, onToggle }: { n: number; what: string; open: boolean; onToggle: () => void }) {
  if (n <= 0) return null
  return (
    <button type="button" className="m-more" aria-expanded={open} onClick={onToggle}>
      {open ? 'Mostrar menos' : <><b>{`+${n}`}</b> {what}</>}
    </button>
  )
}

/** First `cap` items, or all once opened. Each step remounts on change, so it starts closed again. */
function useCap<T>(xs: T[], cap: number) {
  const [open, setOpen] = useState(false)
  return { total: xs.length, shown: open ? xs : xs.slice(0, cap), more: { n: xs.length - cap, open, onToggle: () => setOpen(!open) } }
}

type Writes = { preview: boolean; onRegister: (x: Decision) => void; onConfirm: ReturnType<typeof useConfirmDate>['ask'] }

function Step({ i, d, today, hid, ...w }: { i: number; d: TerralData; today: ISODate; hid: string } & Writes) {
  const { start, weeks } = projectSpan(d)
  const head = (sub?: ReactNode) => (
    <header className="m-head">
      <div className="eyebrow">Checkpoint · semana {weekNo(today, start, weeks)} de {weeks} · {fmtDate(today, true)}</div>
      <h1 id={hid} tabIndex={-1}>{STEPS[i]}</h1>
      {sub && <p className="sub">{sub}</p>}
    </header>
  )
  if (i === 0) return <Health d={d} today={today} head={head} />
  if (i === 1) return <Marcos d={d} today={today} head={head} />
  if (i === 2) return <Decisoes d={d} today={today} head={head} {...w} />
  return <Pendencias d={d} today={today} head={head} {...w} />
}

type StepProps = { d: TerralData; today: ISODate; head: (sub?: ReactNode) => ReactNode }

function Health({ d, today, head }: StepProps) {
  const h = useMemo(() => healthOf(d, today), [d, today])
  return (
    <>
      {head()}
      <div className="m-body m-center"><HealthCard h={h} className="m-health" ring={240} /></div>
    </>
  )
}

/** In-use dates and board decisions not done yet, from today to day 30 (rites left out: the meeting is one). */
export const meetingMilestones = (d: TerralData, today: ISODate) => {
  const until = addDays(today, 30)
  return milestones(d, { rituals: false }).filter((m) => !m.done && m.date >= today && m.date <= until)
}

function Marcos({ d, today, head }: StepProps) {
  const ms = useMemo(() => meetingMilestones(d, today), [d, today])
  const { shown, more } = useCap(ms, CAP.milestones)
  return (
    <>
      {head(`Próximos 30 dias, até ${fmtDate(addDays(today, 30), true)}. Entregas e decisões; os ritos ficam de fora.`)}
      <div className="m-body">
        <Card>
          {ms.length ? (
            <ul className="t-list" aria-label="Marcos dos próximos 30 dias">
              {shown.map((m) => <Row key={m.key} date={m.date} title={m.title} detail={m.detail} side={sideOf(m, today)} clamp />)}
            </ul>
          ) : <Empty title="Nenhum marco nos próximos 30 dias." hint="O próximo aparece aqui quando estiver a um mês." />}
          <More {...more} what="marcos nesse período" />
        </Card>
      </div>
    </>
  )
}

const byDateCode = (a: Decision, b: Decision) => (a.date ?? '9999').localeCompare(b.date ?? '9999') || a.code.localeCompare(b.code, 'pt-BR', { numeric: true })

/**
 * The decisions of the week: "Em atraso" (still open and dated before the week, or with no date) first, then every
 * decision dated within 7 days either side of today, open ones first.
 */
export function weekDecisions(d: TerralData, today: ISODate) {
  const from = addDays(today, -7)
  const late = d.decisions.filter((x) => x.status !== 'decided' && (!x.date || x.date < from)).sort(byDateCode)
  const week = d.decisions.filter((x) => x.date && Math.abs(diffDays(x.date, today)) <= 7)
    .sort((a, b) => Number(a.status === 'decided') - Number(b.status === 'decided') || byDateCode(a, b))
  return { late, week }
}

function Decisoes({ d, today, head, preview, onRegister }: StepProps & Writes) {
  const { late, week } = useMemo(() => weekDecisions(d, today), [d, today])
  const all = [...late, ...week]
  const { shown, more } = useCap(all, CAP.decisions)
  const lateShown = shown.slice(0, late.length)
  const weekShown = shown.slice(late.length)
  const open = week.filter((x) => x.status !== 'decided').length
  const row = (x: Decision) => <DecisionRow key={x.code} x={x} today={today} preview={preview} hint={DON_HINT} onRegister={onRegister} />
  return (
    <>
      {head(`De ${fmtDate(addDays(today, -7))} a ${fmtDate(addDays(today, 7))}: ${open === 0 ? 'nenhuma em aberto' : open === 1 ? '1 em aberto' : `${open} em aberto`}${late.length ? `, e ${late.length} em atraso` : ''}.${preview ? ' Registrar fica com a Terral.' : ''}`)}
      <div className="m-body">
        <Card>
          {all.length ? (
            <>
              {lateShown.length > 0 && (
                <>
                  <h2 className="m-group">Em atraso</h2>
                  <ul className="t-list" aria-label="Decisões em atraso">{lateShown.map(row)}</ul>
                </>
              )}
              {weekShown.length > 0 && (
                <>
                  {late.length > 0 && <h2 className="m-group">Nesta semana</h2>}
                  <ul className="t-list" aria-label="Decisões da semana">{weekShown.map(row)}</ul>
                </>
              )}
            </>
          ) : <Empty title="Nenhuma decisão nesta semana." hint="As decisões com data a até 7 dias de hoje aparecem aqui." />}
          <More {...more} what="decisões" />
        </Card>
      </div>
    </>
  )
}

function Pendencias({ d, today, head, preview, onConfirm }: StepProps & Writes) {
  const { urgent } = useMemo(() => healthOf(d, today), [d, today])
  const todos = useMemo(() => terralTodos(d), [d])
  const items = useCap(todos.filter((x) => x.kind === 'open_item'), CAP.todos)
  const dates = useCap(todos.filter((x) => x.kind === 'to_schedule' && !x.item.confirmed_date), CAP.todos)
  const list = (xs: TerralTodo[], name: string) => (
    <ul className="t-list" aria-label={name}>
      {xs.map((x) => <TodoRow key={x.key} x={x} today={today} urgent={urgent} preview={preview} hint={DON_HINT} onConfirm={onConfirm} />)}
    </ul>
  )
  return (
    <>
      {head(`O que depende da Terral.${preview ? ' Confirmar data fica com a Terral.' : ''}`)}
      <div className="m-body m-cols">
        <Card title={`Pendências em aberto (${items.total})`}>
          {items.total ? list(items.shown, 'Pendências em aberto') : <Empty title="Nenhuma pendência aberta." />}
          <More {...items.more} what="pendências" />
        </Card>
        <Card title={`Datas a confirmar (${dates.total})`}>
          {dates.total ? list(dates.shown, 'Datas a confirmar') : <Empty title="Nenhuma data a confirmar." />}
          <More {...dates.more} what="datas" />
        </Card>
      </div>
    </>
  )
}
