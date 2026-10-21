export const DON_NAMES = ['David', 'Lucas', 'Beto', 'Roberto']

/**
 * Lowercase, accent-free, and with invisible characters removed: NFKD folds look-alike forms (full-width letters),
 * then \p{M} (combining marks) and \p{Cf} (zero-width, soft hyphen, bidi marks) go, so "Da\u200Bvid" reads "david".
 * ponytail: letters of other scripts that only look Latin (Cyrillic "а") are not folded.
 */
export const fold = (s: string) => s.normalize('NFKD').replace(/[\p{M}\p{Cf}]/gu, '').toLowerCase()
const BANNED = [...DON_NAMES, 'margem']
// An amount of hours: "21 h", "21,5h", "21  h", "8 horas", "1 hora", "21 hrs", "2h30".
// ponytail: a clock time ("09h", "18h30") cannot be told from a duration, so it is flagged too; write "às 9 da manhã".
const HOURS = /\d+h\d+|\d+(?:[.,]\d+)?\s*(?:h(?![a-z\d])|hrs?\b|horas?\b)/gi
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

export function findHours(text: string): string[] {
  return unique(text.replace(/\p{Cf}/gu, '').match(HOURS) ?? [])
}

export const findForbidden = (text: string): string[] => unique([...findBanned(text), ...findHours(text)])

/** Terral-safe owner label: Don people never shown by name. */
export function ownerPublic(raw: string): string {
  if (!findBanned(raw).some((w) => DON_NAMES.includes(w))) return raw
  const f = fold(raw)
  if (/(?<![a-z])julio(?![a-z])/.test(f)) return 'Diretoria Terral com a Don'
  // co-owned with the Terral side (Terral itself or its BI developer): say so, without the Don name
  return /(?<![a-z])com (?:a |o )?(?:terral|desenvolvedor)/.test(f) ? 'Equipe Don com a Terral' : 'Equipe Don'
}

export const extractCodes = (text: string): string[] => unique(text.match(CODE) ?? [])
