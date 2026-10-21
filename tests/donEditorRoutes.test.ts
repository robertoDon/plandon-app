import { describe, expect, it } from 'vitest'
import { matchRoute, routeFor, sectionsFor } from '../src/app/routes'
import type { Profile } from '../src/domain/types'

const profile = (role: 'don' | 'terral') => ({ id: 'u', role, status: 'approved', must_change_password: false }) as Profile

describe('Don editors routes', () => {
  it('/don/agendar and /don/metas are Don screens in the Plano group, after the first four tabs', () => {
    const paths = sectionsFor('don').map((r) => r.path)
    for (const p of ['/don/agendar', '/don/metas']) {
      expect(matchRoute(p)).toMatchObject({ area: 'don', nav: { group: 'Plano' } })
      expect(paths.indexOf(p)).toBeGreaterThanOrEqual(4)
      expect(routeFor(profile('don'), p)).toBeNull()
      expect(routeFor(profile('terral'), p)).toBe('/t')
    }
    expect(paths.slice(0, 4)).toEqual(['/don/hoje', '/don/semana', '/don/riscos', '/don/pendencias'])
  })
})
