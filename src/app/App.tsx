import { lazy, Suspense, useEffect, type ComponentType, type ReactNode } from 'react'
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from 'react-router'
import { useSession } from '../auth/useSession'
import { supabase } from '../lib/supabase'
import { useLive } from '../lib/data'
import Login from '../auth/Login'
import Signup from '../auth/Signup'
import Pending from '../auth/Pending'
import Blocked from '../auth/Blocked'
import NewPassword from '../auth/NewPassword'
import { matchRoute, navPath, ROUTES, routeFor, sectionsFor, type AppRoute } from './routes'
import { Shell, type Section } from './Shell'
import './app.css'

const PUBLIC: Record<string, ComponentType> = {
  '/login': Login, '/cadastro': Signup, '/aguardando': Pending, '/bloqueado': Blocked, '/nova-senha': NewPassword,
}

// View registry: a route's `view` is a file under src/views, loaded lazily (tests/routes.test.ts checks each exists).
const files = import.meta.glob<{ default: ComponentType }>('../views/**/*.tsx')
const viewFor = (r: AppRoute): ComponentType => lazy(files[`../views/${r.view}.tsx`])
const VIEWS = new Map(ROUTES.filter((r) => r.view).map((r) => [r.path, viewFor(r)]))

const toSection = (r: AppRoute): Section => ({ path: navPath(r), label: r.title, short: r.nav!.short, icon: r.nav!.icon, group: r.nav!.group, end: r.nav!.end })
const SECTIONS = { don: sectionsFor('don').map(toSection), terral: sectionsFor('terral').map(toSection) }

function Splash() {
  return <div className="splash" aria-busy="true" aria-label="Carregando"><div className="logo-big" aria-hidden="true">DON</div></div>
}

/** The profile could not be read: say so and offer a retry. The session is kept unless the person leaves
 * (local sign-out: it needs no server, which may be the thing that is down). */
function Offline({ retry }: { retry: () => Promise<void> }) {
  return (
    <div className="splash">
      <div className="offline" role="alert">
        <div className="logo-big logo-now" aria-hidden="true">DON</div>
        <h1>Sem conexão</h1>
        <p className="sub">Não deu para falar com o servidor. Confira a internet e tente de novo.</p>
        <div className="offline-actions">
          <button type="button" className="btn-retry" onClick={() => void retry()}>Tentar de novo</button>
          <button type="button" className="btn-retry btn-quiet" onClick={() => void supabase.auth.signOut({ scope: 'local' })}>Sair</button>
        </div>
      </div>
    </div>
  )
}

/** Sends everyone where routeFor says; renders nothing protected until the profile is known. */
function Guard({ children }: { children: ReactNode }) {
  const { session, profile, loading, error, refresh } = useSession()
  const { pathname } = useLocation()
  const route = matchRoute(pathname)
  useLive()

  useEffect(() => {
    document.title = route ? `${route.title} · PlanDon` : 'PlanDon'
  }, [route])

  const to = routeFor(loading ? undefined : profile, pathname)
  if (to) return <Navigate to={to} replace />
  // With a session, the profile decides the screen: show the splash, not the login form or another public page.
  if (loading && (session || route?.area !== 'public')) return error ? <Offline retry={refresh} /> : <Splash />
  return children
}

function Area({ role }: { role: 'don' | 'terral' }) {
  return (
    <Shell sections={SECTIONS[role]}>
      <Suspense fallback={null}>
        <Outlet />
      </Suspense>
    </Shell>
  )
}

const routesOf = (area: AppRoute['area']) =>
  ROUTES.filter((r) => r.area === area).map((r) => {
    const View = VIEWS.get(r.path)!
    return <Route key={r.path} path={r.path} element={<View />} />
  })

export default function App() {
  return (
    <BrowserRouter>
      <Guard>
        <Routes>
          {Object.entries(PUBLIC).map(([path, C]) => <Route key={path} path={path} element={<C />} />)}
          <Route element={<Area role="don" />}>{routesOf('don')}</Route>
          <Route element={<Area role="terral" />}>{routesOf('terral')}</Route>
          {ROUTES.filter((r) => r.area === 'both').map((r) => {
            const View = VIEWS.get(r.path)!
            return <Route key={r.path} path={r.path} element={<Suspense fallback={<Splash />}><View /></Suspense>} />
          })}
          {/* unknown paths never render: the guard redirects them (or shows the splash while loading) */}
          <Route path="*" element={null} />
        </Routes>
      </Guard>
    </BrowserRouter>
  )
}
