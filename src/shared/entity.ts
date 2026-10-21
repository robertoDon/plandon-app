import { useSession } from '../auth/useSession'
import { usePlanData, useTerralData } from '../lib/data'
import type { Comment, Evidence } from '../domain/types'

/** Kinds Terral may see (mirrors public.terral_visible); anything else (task, block, ...) is Don-only. */
export const TERRAL_KINDS = ['deliverable', 'decision', 'to_schedule', 'goal', 'open_item']
export const shareable = (kind: string) => TERRAL_KINDS.includes(kind)

/** Terral's own query key in lib/data (its writes are not in the plan cache). */
export const TERRAL_QUERY = ['terral'] as const

type Rows = { comments: Comment; evidence: Evidence }

/**
 * Comments or evidence of one entity, oldest first, from the caller's own data: the plan for Don,
 * Terral's reads (already RLS-filtered: visible rows on visible entities) for Terral.
 * `asTerral` (Don's "Visão da Terral" preview): Terral's projection of the plan, whatever the role.
 */
export function useEntityRows<K extends keyof Rows>(key: K, kind: string, ref: string, asTerral = false) {
  const { profile } = useSession()
  const don = usePlanData()
  const terral = useTerralData()
  const role = profile?.role ?? null
  const q = role === 'don' && !asTerral ? don : terral
  const all = (q.data?.[key] ?? []) as Rows[K][]
  const rows = all
    .filter((r) => r.entity_kind === kind && r.entity_ref === ref)
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
  return { role, uid: profile?.id ?? null, rows, status: q.status }
}

const rtf = new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto' })
const full = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric' })
const fullTime = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
})

/** "agora", "há 5 minutos", "há 3 horas", "ontem", "há 4 dias", then dd/mm/aaaa (São Paulo). */
export function relTime(iso: string, now = Date.now()): string {
  const s = Math.max(0, (now - Date.parse(iso)) / 1000)
  if (s < 60) return 'agora'
  if (s < 3600) return rtf.format(-Math.floor(s / 60), 'minute')
  if (s < 86_400) return rtf.format(-Math.floor(s / 3600), 'hour')
  if (s < 7 * 86_400) return rtf.format(-Math.floor(s / 86_400), 'day')
  return full.format(new Date(iso))
}

/** Full date and time for a tooltip. */
export const exactTime = (iso: string) => fullTime.format(new Date(iso))
