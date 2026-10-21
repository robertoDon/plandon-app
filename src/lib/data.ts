import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
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

const refetchAll = (qc: QueryClient) =>
  Promise.all([qc.invalidateQueries({ queryKey: PLAN }), qc.invalidateQueries({ queryKey: TERRAL })])

/** Every write carries this key (plus its table), so a refetch can wait until no write is in flight. */
const WRITE = ['write'] as const
const writing = (qc: QueryClient) => qc.isMutating({ mutationKey: WRITE })

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
          // Held while a write is in flight: its own refetch at the end brings this change too, and a refetch
          // now would wipe the optimistic state on screen.
          if (!writing(qc)) void refetchAll(qc)
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
 * Optimistic writes in flight on a client: the plan as the server last confirmed it (`base`) and the changes
 * still waiting for an answer. The cache shows base + every pending change, so one write's rollback removes only
 * its own change and keeps the others.
 */
type Change = (d: DonData) => DonData
const inflight = new WeakMap<QueryClient, { base: DonData; changes: Map<number, Change> }>()
let seq = 0
const replay = (p: { base: DonData; changes: Map<number, Change> }) => [...p.changes.values()].reduce((d, f) => f(d), p.base)

/**
 * Writes one table (or calls one RPC). Records nothing itself: a database trigger writes the history.
 * `optimistic` updates the plan cache at once; an error rolls back that write's change only and shows a toast
 * (unless `silent`: the caller then shows the error, for example inline in a form).
 * The plan is refetched (fire-and-forget) once the last write in flight settles, so the promise of
 * `mutateAsync` resolves as soon as the server answers.
 */
export function useMutate<T extends Write>(table: string, opts: { optimistic?: (old: DonData, vars: T) => DonData; silent?: boolean } = {}) {
  const qc = useQueryClient()
  const toast = useToast()
  return useMutation({
    mutationKey: [...WRITE, table],
    mutationFn: async (w: T) => {
      const { data, error } = await run(table, w)
      if (error) throw error
      return data
    },
    onMutate: async (vars: T) => {
      if (!opts.optimistic) return
      await qc.cancelQueries({ queryKey: PLAN })
      const cur = qc.getQueryData<DonData>(PLAN)
      if (!cur) return
      let p = inflight.get(qc)
      if (!p) inflight.set(qc, (p = { base: cur, changes: new Map() }))
      const id = ++seq
      const change: Change = (d) => opts.optimistic!(d, vars)
      p.changes.set(id, change)
      qc.setQueryData(PLAN, change(cur))
      return { id }
    },
    onSuccess: (_data, _vars, ctx) => {
      const p = inflight.get(qc)
      const change = ctx?.id ? p?.changes.get(ctx.id) : undefined
      if (!p || !change) return
      p.base = change(p.base) // the server took it
      p.changes.delete(ctx!.id)
    },
    onError: (e, _vars, ctx) => {
      const p = inflight.get(qc)
      if (p && ctx?.id && p.changes.delete(ctx.id)) qc.setQueryData(PLAN, replay(p))
      if (!opts.silent) toast.show(errorText(e), { tone: 'error' }) // silent: the caller shows the error itself
    },
    onSettled: () => {
      const p = inflight.get(qc)
      if (p && !p.changes.size) inflight.delete(qc)
      // This write still counts as in flight here. Only the last one refetches, without waiting for it.
      if (writing(qc) <= 1) void refetchAll(qc)
    },
  })
}
