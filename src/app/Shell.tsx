import { useEffect, useRef, useState, type ReactNode } from 'react'
import { NavLink, matchPath, useLocation } from 'react-router'
import { signOut, useSession } from '../auth/useSession'
import { Sheet } from '../ui'
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
    window.scrollTo(0, 0) // a new page starts at its top, not where the last one was scrolled
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

/** "Mais" on the phone: the shared bottom sheet with the overflow sections and the me-card. */
function MoreSheet({ open, onClose, onClosed, sections }: { open: boolean; onClose: () => void; onClosed: () => void; sections: Section[] }) {
  return (
    <Sheet open={open} onClose={onClose} onClosed={onClosed} title="Mais">
      <nav className="sheet-list" aria-label="Mais seções">
        {sections.map((s) => (
          <NavLink key={s.path} to={s.path} end={s.end} className={({ isActive }) => `nav${isActive ? ' on' : ''}`}>
            <Icon name={s.icon} size={22} />
            <span>{s.label}</span>
            {!!s.badge && <em>{s.badge}</em>}
          </NavLink>
        ))}
      </nav>
      <Me inSheet />
    </Sheet>
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
