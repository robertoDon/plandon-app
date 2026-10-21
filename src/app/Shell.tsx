import { useEffect, useRef, useState, type ReactNode } from 'react'
import { NavLink, matchPath, useLocation } from 'react-router'
import { motion, useAnimationControls, useDragControls, useReducedMotion } from 'motion/react'
import { signOut, useSession } from '../auth/useSession'
import { spring } from '../lib/motion'
import { matchRoute } from './routes'
import { Icon } from './icons'
import './shell.css'

export interface Section {
  path: string
  label: string
  /** Tab bar label when the full one is too long for a phone tab. */
  short?: string
  icon: string
  group?: string
  /** Active only on the exact path (for a section whose path prefixes others, like /t). */
  end?: boolean
  badge?: number
}

const isActive = (s: Section, path: string) => !!matchPath({ path: s.path, end: !!s.end }, path)

/** Sidebar of 248 px from 900 px wide; below that, a bottom tab bar of the first 4 sections plus "Mais". */
export function Shell({ sections, children }: { sections: Section[]; children: ReactNode }) {
  const { pathname } = useLocation()
  const [moreOpen, setMoreOpen] = useState(false)
  const scrolled = useScrolled(40)
  const title = matchRoute(pathname)?.title ?? ''
  const tabs = sections.slice(0, 4)
  const overflow = sections.slice(4)
  const overflowActive = overflow.some((s) => isActive(s, pathname))
  const main = useRef<HTMLElement>(null)
  const first = useRef(true)
  const focusAfterSheet = useRef(false)
  const focusMain = () => main.current?.focus({ preventScroll: true })

  // Route change: focus moves to the new content (screen readers start there). From the sheet, it waits until
  // the dialog has closed, since closing returns focus to "Mais".
  useEffect(() => {
    if (first.current) return void (first.current = false)
    if (moreOpen) {
      focusAfterSheet.current = true
      setMoreOpen(false)
    } else focusMain()
    // only the path matters
  }, [pathname])

  return (
    <div className="shell">
      <a className="skip" href="#main">Pular para o conteúdo</a>
      <aside className="sidebar" aria-label="Navegação">
        <Brand />
        <nav className="side-nav">
          {sections.map((s, i) => (
            <div key={s.path}>
              {s.group && s.group !== sections[i - 1]?.group && <div className="navh">{s.group}</div>}
              <NavLink to={s.path} end={s.end} className={({ isActive }) => `nav${isActive ? ' on' : ''}`}>
                <Icon name={s.icon} size={20} />
                <span>{s.label}</span>
                {!!s.badge && <em aria-label={`${s.badge} itens`}>{s.badge}</em>}
              </NavLink>
            </div>
          ))}
        </nav>
        <Me />
      </aside>

      <div className="shell-main">
        <header className={`topbar${scrolled ? ' scrolled' : ''}`}>
          <span className="topbar-title" aria-hidden={!scrolled}>{title}</span>
        </header>
        <main id="main" ref={main} tabIndex={-1}>{children}</main>
      </div>

      <nav className="tabbar" aria-label="Seções">
        {tabs.map((s) => (
          <NavLink key={s.path} to={s.path} end={s.end} className={({ isActive }) => `tab${isActive ? ' on' : ''}`}>
            <span className="tab-icon"><Icon name={s.icon} size={25} />{!!s.badge && <em>{s.badge}</em>}</span>
            <span className="tab-label">{s.short ?? s.label}</span>
          </NavLink>
        ))}
        <button type="button" className={`tab${overflowActive ? ' on' : ''}`} aria-current={overflowActive ? 'page' : undefined}
          aria-haspopup="dialog" aria-expanded={moreOpen} onClick={() => setMoreOpen(true)}>
          <span className="tab-icon"><Icon name="more" size={25} /></span>
          <span className="tab-label">Mais</span>
        </button>
      </nav>

      <MoreSheet open={moreOpen} onClose={() => setMoreOpen(false)} sections={overflow}
        onClosed={() => {
          if (!focusAfterSheet.current) return
          focusAfterSheet.current = false
          focusMain()
        }} />
    </div>
  )
}

function Brand() {
  const { profile } = useSession()
  return (
    <div className="brand">
      <div className="logo" aria-hidden="true">DON</div>
      <div><b>PlanDon</b><span>{profile?.role === 'don' ? 'Bastidores' : 'Terral'}</span></div>
    </div>
  )
}

const initials = (name: string) =>
  name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') || '?'

function Me({ inSheet = false }: { inSheet?: boolean }) {
  const { profile } = useSession()
  if (!profile) return null
  const don = profile.role === 'don'
  return (
    <div className={inSheet ? 'me me-sheet' : 'me'}>
      <div className={`av${don ? ' av-don' : ''}`} aria-hidden="true">{initials(profile.display_name)}</div>
      <div className="me-text"><b>{profile.display_name}</b><span>{don ? 'Equipe Don' : 'Terral'}</span></div>
      <button type="button" className="icon-btn" onClick={() => void signOut()} aria-label="Sair" title="Sair">
        <Icon name="logout" size={20} />
      </button>
    </div>
  )
}

/** "Mais" on the phone: a bottom sheet (native dialog: focus trap, Esc, focus return). Drag the handle down to close. */
function MoreSheet({ open, onClose, onClosed, sections }: { open: boolean; onClose: () => void; onClosed: () => void; sections: Section[] }) {
  const dlg = useRef<HTMLDialogElement>(null)
  const sheet = useAnimationControls()
  const drag = useDragControls()
  const reduce = useReducedMotion()
  const variants = reduce
    ? { open: { opacity: 1, y: 0 }, closed: { opacity: 0, y: 0 } }
    : { open: { y: 0 }, closed: { y: '100%' } }

  useEffect(() => {
    const d = dlg.current
    if (!d) return
    if (open && !d.open) d.showModal()
    let current = true
    void sheet.start(open ? 'open' : 'closed').then(() => {
      if (current && !open && d.open) {
        d.close()
        onClosed()
      }
    })
    return () => {
      current = false // reopened mid-close: keep the dialog
    }
    // onClosed is read when the close finishes; it does not restart the animation
  }, [open, sheet])

  return (
    <dialog ref={dlg} className="sheet-dialog" aria-label="Mais seções"
      onCancel={(e) => { e.preventDefault(); onClose() }}>
      <motion.div className="scrim" initial={false} animate={{ opacity: open ? 1 : 0 }} transition={spring} onClick={onClose} />
      <motion.div className="sheet" initial="closed" animate={sheet} variants={variants} transition={spring}
        drag={reduce ? false : 'y'} dragControls={drag} dragListener={false}
        dragConstraints={{ top: 0, bottom: 0 }} dragElastic={{ top: 0.04, bottom: 1 }}
        onDragEnd={(_, info) => (info.offset.y > 96 || info.velocity.y > 500 ? onClose() : void sheet.start('open'))}>
        <div className="sheet-head" onPointerDown={(e) => drag.start(e)}>
          <span className="grabber" aria-hidden="true" />
          <h2>Mais</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Fechar"><Icon name="close" size={20} /></button>
        </div>
        <nav className="sheet-list">
          {sections.map((s) => (
            <NavLink key={s.path} to={s.path} end={s.end} className={({ isActive }) => `nav${isActive ? ' on' : ''}`}>
              <Icon name={s.icon} size={22} />
              <span>{s.label}</span>
              {!!s.badge && <em>{s.badge}</em>}
            </NavLink>
          ))}
        </nav>
        <Me inSheet />
      </motion.div>
    </dialog>
  )
}

/** True once the page has scrolled past `y`: the top bar then shows the title the large heading carried. */
function useScrolled(y: number) {
  const [past, setPast] = useState(false)
  useEffect(() => {
    const on = () => setPast(window.scrollY > y)
    on()
    window.addEventListener('scroll', on, { passive: true })
    return () => window.removeEventListener('scroll', on)
  }, [y])
  return past
}
