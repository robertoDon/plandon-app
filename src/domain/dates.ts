export type ISODate = string

const DAY_MS = 86_400_000
const FULL = /(\d{1,2})\/(\d{1,2})\/(\d{4})/g

const pad = (n: number) => String(n).padStart(2, '0')
// Date math on UTC midnight: no DST drift.
const toMs = (d: ISODate) => Date.parse(`${d}T00:00:00Z`)

function iso(d: string, m: string, y: string): ISODate | null {
  const s = `${y}-${pad(+m)}-${pad(+d)}`
  const t = new Date(`${s}T00:00:00Z`)
  // rejects 31/02 and out-of-range day/month (toISOString throws on Invalid Date)
  return Number.isNaN(t.getTime()) || t.toISOString().slice(0, 10) !== s ? null : s
}

export function parseBrDate(s: string): ISODate | null {
  const m = /^\s*(\d{1,2})\/(\d{1,2})\/(\d{4})\s*$/.exec(s)
  return m ? iso(m[1], m[2], m[3]) : null
}

export function parseBrRange(s: string): { start: ISODate | null; end: ISODate | null } {
  const dates = [...s.matchAll(FULL)].map((m) => iso(m[1], m[2], m[3]))
  if (!dates.length) return { start: null, end: null }
  if (/^\s*antes de/i.test(s)) return { start: null, end: dates[0] }
  // "23 e 24/11/2026": first day shares month/year with the second
  const pair = /(?<![\d/])(\d{1,2})\s+e\s+(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s)
  if (pair) return { start: iso(pair[1], pair[3], pair[4]), end: iso(pair[2], pair[3], pair[4]) }
  return { start: dates[0], end: dates[dates.length - 1] }
}

export function parseHours(s: string): number {
  const n = Number(s.trim().replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}

export function fmtDate(d: ISODate, withYear = false): string {
  const [y, m, day] = d.split('-')
  return withYear ? `${day}/${m}/${y}` : `${day}/${m}`
}

export function fmtHours(h: number): string {
  return `${String(Math.round(h * 100) / 100).replace('.', ',')} h`
}

export function addDays(d: ISODate, n: number): ISODate {
  return new Date(toMs(d) + n * DAY_MS).toISOString().slice(0, 10)
}

export function diffDays(a: ISODate, b: ISODate): number {
  return Math.round((toMs(a) - toMs(b)) / DAY_MS)
}

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/

export function today(): ISODate {
  const q = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('today') : null
  if (q && ISO_RE.test(q)) return q
  const env = import.meta.env?.VITE_TODAY
  if (env && ISO_RE.test(env)) return env
  // en-CA formats as YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
}
