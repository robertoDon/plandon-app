export const DON_NAMES = ['David', 'Lucas', 'Beto', 'Roberto']

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const BANNED = [...DON_NAMES, 'margem']
const HOURS = /\d+(?:[.,]\d+)?\s?h\b/gi
const CODE = /(?<![\d.])(3\.(?:1[0-4]|[1-9])|I[1-5])(?![\d])/g

const unique = (a: string[]) => [...new Set(a)]

/** Banned words found (whole word, case/accent-insensitive), unique, in order of appearance. */
export function findBanned(text: string): string[] {
  const t = fold(text)
  return BANNED.map((w) => ({ w, i: t.search(new RegExp(`(?<![a-z0-9])${fold(w)}(?![a-z0-9])`)) }))
    .filter((x) => x.i >= 0)
    .sort((a, b) => a.i - b.i)
    .map((x) => x.w)
}

// ponytail: clock times like "09h" are false positives; accepted (Terral text rarely has them).
export function findHours(text: string): string[] {
  return unique(text.match(HOURS) ?? [])
}

export const findForbidden = (text: string): string[] => unique([...findBanned(text), ...findHours(text)])

/** Terral-safe owner label: Don people never shown by name. */
export function ownerPublic(raw: string): string {
  if (!findBanned(raw).some((w) => DON_NAMES.includes(w))) return raw
  return /(?<![a-z])julio(?![a-z])/.test(fold(raw)) ? 'Diretoria Terral com a Don' : 'Equipe Don'
}

export const extractCodes = (text: string): string[] => unique(text.match(CODE) ?? [])
