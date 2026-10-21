import { useInfiniteQuery } from '@tanstack/react-query'
import { useSession } from '../auth/useSession'
import { addDays } from '../domain/dates'
import type { HistoryRow } from '../domain/types'
import { usePlanData } from '../lib/data'
import { supabase } from '../lib/supabase'
import { Empty } from '../ui'
import { longDay } from '../don/blocks'
import { namesOf } from '../don/plan'
import { historyText, historyWhere } from './historyText'
import '../don/plan.css'

export const HISTORY_PAGE = 50
/** Filter value for changes with no signed-in user (the loader, triggers). */
export const SYSTEM_USER = 'system'

const TZ = 'America/Sao_Paulo'
const dayOf = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date(iso))
const timeOf = (iso: string) => new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }).format(new Date(iso))
const exact = (iso: string) => new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, dateStyle: 'short', timeStyle: 'medium' }).format(new Date(iso))

export interface HistoryFilter { table?: string; row_ref?: string; user?: string }

/**
 * Newest first, 50 rows a page, straight from the history table (the plan cache keeps only the newest 1000).
 * Pages go by id cursor, so rows arriving meanwhile never repeat a row. The key sits under ['plan'], so every
 * write and every Realtime refresh of the plan refreshes the loaded pages too.
 */
export function useHistory(f: HistoryFilter) {
  const { profile } = useSession()
  return useInfiniteQuery({
    queryKey: ['plan', 'history', f.table ?? '', f.row_ref ?? '', f.user ?? ''],
    enabled: profile?.role === 'don',
    initialPageParam: null as number | null,
    queryFn: async ({ pageParam }) => {
      let q = supabase.from('history').select('*')
      if (f.table) q = q.eq('table_name', f.table)
      if (f.row_ref) q = q.eq('row_ref', f.row_ref)
      if (f.user === SYSTEM_USER) q = q.is('user_id', null)
      else if (f.user) q = q.eq('user_id', f.user)
      if (pageParam !== null) q = q.lt('id', pageParam)
      const { data, error } = await q.order('id', { ascending: false }).range(0, HISTORY_PAGE - 1)
      if (error) throw error
      return (data ?? []) as HistoryRow[]
    },
    getNextPageParam: (last) => (last.length === HISTORY_PAGE ? last[last.length - 1].id : undefined),
  })
}

/**
 * A history feed grouped by day ("Hoje", "Ontem", "Terça, 10 de novembro"), one readable sentence per change, with
 * "Carregar mais". Per entity: <HistoryList table="deliverable" row_ref="3.1" />. `subject` adds what changed
 * (the global feed).
 */
export function HistoryList({ table, row_ref, user, subject }: HistoryFilter & { subject?: boolean }) {
  const plan = usePlanData()
  const h = useHistory({ table, row_ref, user })
  const names = plan.data ? namesOf(plan.data) : {}

  if (h.status === 'pending') return <p className="don-quiet" aria-busy="true">Carregando o histórico…</p>
  if (h.status === 'error') return <Empty title="Não deu para carregar o histórico." hint="Confira a internet e tente de novo." />
  const seen = new Set<number>()
  const rows = h.data.pages.flat().filter((r) => !seen.has(r.id) && !!seen.add(r.id))
  if (!rows.length) return <p className="don-quiet">Nenhuma alteração registrada ainda.</p>

  const now = dayOf(new Date().toISOString())
  const label = (d: string) => (d === now ? 'Hoje' : d === addDays(now, -1) ? 'Ontem' : `${longDay(d)}${d.slice(0, 4) !== now.slice(0, 4) ? ` de ${d.slice(0, 4)}` : ''}`)
  const days: [string, HistoryRow[]][] = []
  for (const r of rows) {
    const d = dayOf(r.at)
    if (days.at(-1)?.[0] === d) days.at(-1)![1].push(r)
    else days.push([d, [r]])
  }

  return (
    <div className="hist">
      {days.map(([d, rs]) => (
        <section key={d} className="hist-day" aria-label={label(d)}>
          <h3 className="hist-hd">{label(d)}</h3>
          <ol className="hist-list">
            {rs.map((r) => (
              <li key={r.id} className="hist-item">
                <time dateTime={r.at} title={exact(r.at)} className="num">{timeOf(r.at)}</time>
                <div>
                  <p className="hist-t">{historyText(r, names)}</p>
                  {subject && <p className="hist-d">{historyWhere(r)}</p>}
                </div>
              </li>
            ))}
          </ol>
        </section>
      ))}
      {h.hasNextPage && (
        <button type="button" className="dbtn small hist-more" onClick={() => void h.fetchNextPage()} disabled={h.isFetchingNextPage}>
          {h.isFetchingNextPage ? 'Carregando…' : 'Carregar mais'}
        </button>
      )}
    </div>
  )
}
