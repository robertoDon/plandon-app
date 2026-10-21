import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { AnimatePresence, motion, useReducedMotion, type PanInfo } from 'motion/react'
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
import { healthOf, milestones, projectSpan, terralTodos, weekNo } from '../terral/model'
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
  const [[step, dir], setNav] = useState<[number, number]>([0, 1])
  const [fs, setFs] = useState(() => !!document.fullscreenElement)
  const [idle, setIdle] = useState(false)
  const asked = useRef(false)
  const first = useRef(true)
  const home = HOME[profile?.role ?? 'terral']

  const go = (to: number) => setNav((cur) => {
    const t = Math.max(0, Math.min(LAST, to))
    return t === cur[0] ? cur : [t, t > cur[0] ? 1 : -1]
  })
  const move = (by: number) => setNav((cur) => {
    const t = Math.max(0, Math.min(LAST, cur[0] + by))
    return t === cur[0] ? cur : [t, by]
  })
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
              drag="x" dragConstraints={{ left: 0, right: 0 }} dragElastic={0.2} onDragEnd={onDragEnd}>
              <Step i={step} d={q.data} today={today} hid={`${uid}-h${step}`} preview={profile?.role !== 'terral'} />
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
    </div>
  )
}

/** "+N" under a list cut to fit the screen. */
const More = ({ n, what }: { n: number; what: string }) => (n > 0 ? <p className="m-more"><b>{`+${n}`}</b> {what}</p> : null)

function Step({ i, d, today, hid, preview }: { i: number; d: TerralData; today: ISODate; hid: string; preview: boolean }) {
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
  if (i === 2) return <Decisoes d={d} today={today} head={head} preview={preview} />
  return <Pendencias d={d} today={today} head={head} preview={preview} />
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

function Marcos({ d, today, head }: StepProps) {
  const until = addDays(today, 30)
  const ms = useMemo(() => milestones(d, { rituals: false }).filter((m) => !m.done && m.date >= today && m.date <= until), [d, today, until])
  return (
    <>
      {head(`Próximos 30 dias, até ${fmtDate(until, true)}.`)}
      <div className="m-body">
        <Card>
          {ms.length ? (
            <ul className="t-list" aria-label="Marcos dos próximos 30 dias">
              {ms.slice(0, CAP.milestones).map((m) => <Row key={m.key} date={m.date} title={m.title} detail={m.detail} side={sideOf(m, today)} clamp />)}
            </ul>
          ) : <Empty title="Nenhum marco nos próximos 30 dias." hint="O próximo aparece aqui quando estiver a um mês." />}
          <More n={ms.length - CAP.milestones} what="marcos nesse período" />
        </Card>
      </div>
    </>
  )
}

function Decisoes({ d, today, head, preview }: StepProps & { preview: boolean }) {
  const editor = useEditor<Decision>()
  // dated within a week either side of today; open ones first (the room acts on those), then by date and code
  const list = useMemo(() => d.decisions
    .filter((x) => x.date && Math.abs(diffDays(x.date, today)) <= 7)
    .sort((a, b) => Number(a.status === 'decided') - Number(b.status === 'decided') || a.date!.localeCompare(b.date!) || a.code.localeCompare(b.code, 'pt-BR', { numeric: true })),
  [d, today])
  const open = list.filter((x) => x.status !== 'decided').length
  return (
    <>
      {head(`De ${fmtDate(addDays(today, -7))} a ${fmtDate(addDays(today, 7))}. ${open === 0 ? 'Nenhuma em aberto.' : open === 1 ? '1 em aberto.' : `${open} em aberto.`}${preview ? ' Registrar fica com a Terral.' : ''}`)}
      <div className="m-body">
        <Card>
          {list.length ? (
            <ul className="t-list" aria-label="Decisões da semana">
              {list.slice(0, CAP.decisions).map((x) => <DecisionRow key={x.code} x={x} today={today} preview={preview} onRegister={editor.show} />)}
            </ul>
          ) : <Empty title="Nenhuma decisão nesta semana." hint="As decisões com data a até 7 dias de hoje aparecem aqui." />}
          <More n={list.length - CAP.decisions} what="decisões nesta janela" />
        </Card>
      </div>
      <Sheet {...editor.sheet('Registrar decisão')}>
        {editor.item && <DecisionForm key={editor.item.code} decision={editor.item} today={today} onDone={editor.close} />}
      </Sheet>
    </>
  )
}

function Pendencias({ d, today, head, preview }: StepProps & { preview: boolean }) {
  const confirm = useConfirmDate()
  const { urgent } = useMemo(() => healthOf(d, today), [d, today])
  const todos = useMemo(() => terralTodos(d), [d])
  const items = todos.filter((x) => x.kind === 'open_item')
  const dates = todos.filter((x) => x.kind === 'to_schedule' && !x.item.confirmed_date)
  const list = (xs: typeof todos, name: string) => (
    <ul className="t-list" aria-label={name}>
      {xs.slice(0, CAP.todos).map((x) => <TodoRow key={x.key} x={x} today={today} urgent={urgent} preview={preview} onConfirm={confirm.ask} />)}
    </ul>
  )
  return (
    <>
      {head('O que depende da Terral.')}
      <div className="m-body m-cols">
        <Card title={`Pendências em aberto (${items.length})`}>
          {items.length ? list(items, 'Pendências em aberto') : <Empty title="Nenhuma pendência aberta." />}
          <More n={items.length - CAP.todos} what="pendências" />
        </Card>
        <Card title={`Datas a confirmar (${dates.length})`}>
          {dates.length ? list(dates, 'Datas a confirmar') : <Empty title="Nenhuma data a confirmar." />}
          <More n={dates.length - CAP.todos} what="datas" />
        </Card>
      </div>
      {confirm.sheet}
    </>
  )
}
