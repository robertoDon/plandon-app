// @vitest-environment node
// The sign-up check (client) and public.is_reserved_display_name (server) agree on every case.
import { describe, expect, it } from 'vitest'
import { isReservedName } from '../src/auth/reservedName'
import { admin, localStack } from './helpers/supa'
import { ALLOWED, RESERVED } from './helpers/reservedNames'

const cases = [...RESERVED.map((n) => [n, true] as const), ...ALLOWED.map((n) => [n, false] as const)]

describe('reserved name "Equipe Don"', () => {
  it('client', () => {
    for (const [name, want] of cases) expect(isReservedName(name), JSON.stringify(name)).toBe(want)
  })

  it.skipIf(!localStack)('server agrees with the client', async () => {
    const a = admin()
    for (const [name, want] of cases) {
      const { data, error } = await a.rpc('is_reserved_display_name', { p_name: name })
      expect(error).toBeNull()
      expect(data, JSON.stringify(name)).toBe(want)
    }
  })
})
