import { matchPath } from 'react-router'
import type { Profile } from '../domain/types'

export type Area = 'public' | 'don' | 'terral' | 'both'

export interface AppRoute {
  path: string
  area: Area
  /** File under src/views without extension. A missing file renders the "Em construção" placeholder. */
  view?: string
  title: string
  /** Shown in the sidebar / tab bar. The first 4 nav entries of a role fill the phone tab bar. */
  nav?: { icon: string; group?: string; end?: boolean; short?: string }
}

export const ROUTES: AppRoute[] = [
  { path: '/login', area: 'public', title: 'Entrar' },
  { path: '/cadastro', area: 'public', title: 'Criar conta' },
  { path: '/aguardando', area: 'public', title: 'Aguardando liberação' },
  { path: '/bloqueado', area: 'public', title: 'Acesso bloqueado' },
  { path: '/nova-senha', area: 'public', title: 'Nova senha' },

  { path: '/don/hoje', area: 'don', view: 'don/Hoje', title: 'Hoje', nav: { icon: 'today' } },
  { path: '/don/semana', area: 'don', view: 'don/Semana', title: 'Minha semana', nav: { icon: 'week', short: 'Semana' } },
  { path: '/don/riscos', area: 'don', view: 'don/Riscos', title: 'Riscos', nav: { icon: 'risk' } },
  { path: '/don/pendencias', area: 'don', view: 'don/Pendencias', title: 'Pendências', nav: { icon: 'pending' } },
  { path: '/don/entregas', area: 'don', view: 'don/Entregas', title: 'Entregas e tarefas', nav: { icon: 'deliverable', group: 'Plano' } },
  { path: '/don/entregas/:code', area: 'don', view: 'don/Entrega', title: 'Entrega' },
  { path: '/don/calendario', area: 'don', view: 'don/Calendario', title: 'Calendário', nav: { icon: 'calendar', group: 'Plano' } },
  { path: '/don/equipe', area: 'don', view: 'don/Equipe', title: 'Equipe e carga', nav: { icon: 'team', group: 'Plano' } },
  { path: '/don/decisoes', area: 'don', view: 'don/Decisoes', title: 'Decisões', nav: { icon: 'decision', group: 'Plano' } },
  { path: '/don/terral/*', area: 'don', view: 'don/VisaoTerral', title: 'Visão da Terral', nav: { icon: 'eye', group: 'Plano' } },
  { path: '/don/historico', area: 'don', view: 'don/Historico', title: 'Histórico', nav: { icon: 'history', group: 'Administração' } },
  { path: '/don/acessos', area: 'don', view: 'don/Acessos', title: 'Acessos', nav: { icon: 'people', group: 'Administração' } },

  { path: '/t', area: 'terral', view: 'terral/VisaoGeral', title: 'Visão geral', nav: { icon: 'overview', end: true } },
  { path: '/t/marcos', area: 'terral', view: 'terral/Marcos', title: 'Marcos', nav: { icon: 'flag' } },
  { path: '/t/entregas', area: 'terral', view: 'terral/Entregas', title: 'Entregas', nav: { icon: 'deliverable' } },
  { path: '/t/entregas/:code', area: 'terral', view: 'terral/Entrega', title: 'Entrega' },
  { path: '/t/decisoes', area: 'terral', view: 'terral/Decisoes', title: 'Decisões', nav: { icon: 'decision' } },
  { path: '/t/metas', area: 'terral', view: 'terral/Metas', title: 'Metas', nav: { icon: 'goal' } },

  { path: '/reuniao', area: 'both', view: 'Reuniao', title: 'Modo reunião', nav: { icon: 'present', group: 'Reunião' } },
]

export const HOME = { don: '/don/hoje', terral: '/t' } as const
const SIGNED_OUT_OK = ['/login', '/cadastro']

/** Nav path for a route: '/don/terral/*' links to '/don/terral'. */
export const navPath = (r: AppRoute) => r.path.replace(/\/\*$/, '')

/** The role's nav sections, in order. */
export const sectionsFor = (role: 'don' | 'terral') => ROUTES.filter((r) => r.nav && (r.area === role || r.area === 'both'))

export const matchRoute = (path: string) => ROUTES.find((r) => matchPath(r.path, path))

/**
 * Where the user must go, or null to stay. `profile` is undefined while the session loads (never redirect then),
 * null when signed out.
 */
export function routeFor(profile: Profile | null | undefined, path: string): string | null {
  if (profile === undefined) return null
  const stay = (target: string) => (matchPath(target, path) ? null : target)
  if (!profile) return SIGNED_OUT_OK.some((p) => matchPath(p, path)) ? null : '/login'
  if (profile.status === 'blocked') return stay('/bloqueado')
  if (profile.status === 'pending' || !profile.role) return stay('/aguardando')
  if (profile.must_change_password) return stay('/nova-senha')
  const area = matchRoute(path)?.area
  return area === profile.role || area === 'both' ? null : HOME[profile.role]
}
