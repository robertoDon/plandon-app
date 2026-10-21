import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from './supabase'
import { useToast } from '../ui/Toast'
import { useSession } from '../auth/useSession'
import { TABLE_OF, type HistoryRow, type PlanData, type Profile } from '../domain/types'
import { TERRAL_KEYS, toTerralData, type TerralData } from '../domain/terralView'

/** Everything Don reads: the plan, plus the history feed and the accounts (author names, Acessos). */
export type DonData = PlanData & { history: HistoryRow[]; profiles: Profile[] }

const PLAN = ['plan'] as const
const TERRAL = ['terral'] as const

const rows = async <T>(q: PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> => {
  const { data, error } = await q
  if (error) throw error
  return data ?? []
}

// Don-only embeds: the real author of each comment and evidence file.
const SELECT: Record<string, string> = {
  comment: '*, comment_author(author_id)',
  evidence: '*, evidence_uploader(uploader_id)',
}

async function loadPlan(): Promise<DonData> {
  const keys = Object.keys(TABLE_OF) as (keyof PlanData)[]
  // ponytail: one request per table, capped by PostgREST max_rows (1000). Blocks are 440 today;
  // page with .range() if a table outgrows it. History keeps only the newest 1000 rows here.
  const [tables, history, profiles] = await Promise.all([
    Promise.all(keys.map((k) => rows(supabase.from(TABLE_OF[k]).select(SELECT[TABLE_OF[k]] ?? '*')))),
    rows<HistoryRow>(supabase.from('history').select('*').order('id', { ascending: false }).limit(1000)),
    rows<Profile>(supabase.from('profiles').select('*')),
  ])
  return { ...(Object.fromEntries(keys.map((k, i) => [k, tables[i]])) as unknown as PlanData), history, profiles }
}

/** Terral's own reads: only the shared tables. RLS filters the rows (visible open items, comments, evidence). */
async function loadTerral(): Promise<TerralData> {
  const tables = await Promise.all(TERRAL_KEYS.map((k) => rows(supabase.from(TABLE_OF[k]).select('*'))))
  return Object.fromEntries(TERRAL_KEYS.map((k, i) => [k, tables[i]])) as unknown as TerralData
}

/** Don's data seen as Terral sees it (preview, meeting mode): same filters as RLS, and no author ids. */
function donAsTerral(d: DonData): TerralData {
  const t = toTerralData(d)
  return {
    ...t,
    comments: t.comments.map(({ comment_author: _, ...c }) => c),
    evidence: t.evidence.map(({ evidence_uploader: _, ...e }) => e),
  }
}

/** Don only: one query loads every table. */
export function usePlanData() {
  const { profile } = useSession()
  return useQuery({ queryKey: PLAN, queryFn: loadPlan, enabled: profile?.role === 'don' })
}

/** Terral data: Terral's own selects, or derived from the plan when a Don user looks (preview, meeting). */
export function useTerralData() {
  const { profile } = useSession()
  const don = useQuery({ queryKey: PLAN, queryFn: loadPlan, enabled: profile?.role === 'don', select: donAsTerral })
  const terral = useQuery({ queryKey: TERRAL, queryFn: loadTerral, enabled: profile?.role === 'terral' })
  return profile?.role === 'don' ? don : terral
}

const refetchAll = (qc: ReturnType<typeof useQueryClient>) =>
  Promise.all([qc.invalidateQueries({ queryKey: PLAN }), qc.invalidateQueries({ queryKey: TERRAL })])

/**
 * One Realtime channel on every table in the publication. A burst of changes (a loader run, a multi-row edit)
 * becomes one refetch; the old data stays on screen until the new arrives, so nothing flickers.
 */
export function useLive() {
  const qc = useQueryClient()
  const { profile } = useSession()
  const on = profile?.status === 'approved' && !!profile.role
  useEffect(() => {
    if (!on) return
    let timer: ReturnType<typeof setTimeout> | undefined
    const ch = supabase
      .channel('live')
      .on('postgres_changes', { event: '*', schema: 'public' }, () => {
        // throttle, not debounce: a steady stream still refreshes every 300 ms
        timer ??= setTimeout(() => {
          timer = undefined
          void refetchAll(qc)
        }, 300)
      })
      .subscribe()
    return () => {
      clearTimeout(timer)
      void supabase.removeChannel(ch)
    }
  }, [on, qc])
}

type Row = Record<string, unknown>
/** A write. For `rpc`, the table argument of useMutate is the function name. */
export type Write =
  | { insert: Row | Row[] }
  | { upsert: Row | Row[] }
  | { update: Row; match: Row }
  | { delete: Row }
  | { rpc: Row }

function run(table: string, w: Write) {
  if ('rpc' in w) return supabase.rpc(table, w.rpc)
  const t = supabase.from(table)
  if ('insert' in w) return t.insert(w.insert).select()
  if ('upsert' in w) return t.upsert(w.upsert).select()
  if ('update' in w) return t.update(w.update).match(w.match).select()
  return t.delete().match(w.delete).select()
}

export function errorText(e: unknown): string {
  const code = (e as { code?: string } | null)?.code
  if (code === '42501') return 'Você não tem permissão para isso.'
  if (code === '23505') return 'Isso já existe.'
  if (e instanceof TypeError) return 'Sem conexão. Tente de novo.'
  return 'Não salvou. Tente de novo.'
}

/**
 * Writes one table (or calls one RPC). Records nothing itself: a database trigger writes the history.
 * `optimistic` updates the plan cache at once; an error rolls it back and shows a toast.
 */
export function useMutate<T extends Write>(table: string, opts: { optimistic?: (old: DonData, vars: T) => DonData } = {}) {
  const qc = useQueryClient()
  const toast = useToast()
  return useMutation({
    mutationFn: async (w: T) => {
      const { data, error } = await run(table, w)
      if (error) throw error
      return data
    },
    onMutate: async (vars: T) => {
      if (!opts.optimistic) return
      await qc.cancelQueries({ queryKey: PLAN })
      const prev = qc.getQueryData<DonData>(PLAN)
      if (prev) qc.setQueryData(PLAN, opts.optimistic(prev, vars))
      return { prev }
    },
    onError: (e, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(PLAN, ctx.prev)
      toast.show(errorText(e), { tone: 'error' })
    },
    onSettled: () => refetchAll(qc),
  })
}
