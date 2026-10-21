/**
 * True when a display name reads as "Equipe Don" (Don authors appear to Terral under that name).
 * Mirrors public.is_reserved_display_name (0007): NFKD, drop every non-ASCII character (accents, invisible marks,
 * fillers), lower-case, split on non-alphanumerics, look for the words "equipe don" or "equipedon".
 * The database refuses these names anyway; this only gives a clear message at sign-up.
 */
export const isReservedName = (name: string) =>
  / equipe ?don /.test(` ${name.normalize('NFKD').replace(/[^\x00-\x7f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()} `)
