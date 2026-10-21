import { describe, expect, it } from 'vitest'
import { routeFor } from '../src/app/routes'
import type { Profile } from '../src/domain/types'

const p = (role: Profile['role'], status: Profile['status'], must = false) => ({ id: 'u', role, status, must_change_password: must }) as Profile

describe('routeFor', () => {
  it('follows the brief', () => {
    expect(routeFor(null, '/don/hoje')).toBe('/login')
    expect(routeFor(null, '/cadastro')).toBeNull()
    expect(routeFor(p(null, 'pending'), '/t')).toBe('/aguardando')
    expect(routeFor(p('terral', 'blocked'), '/t')).toBe('/bloqueado')
    expect(routeFor(p('terral', 'approved'), '/don/hoje')).toBe('/t')
    expect(routeFor(p('terral', 'approved'), '/reuniao')).toBeNull()
    expect(routeFor(p('don', 'approved'), '/')).toBe('/don/hoje')
    expect(routeFor(p('don', 'approved', true), '/don/hoje')).toBe('/nova-senha')
  })

  it('does not redirect while the session is loading', () => {
    for (const path of ['/', '/don/hoje', '/t', '/login', '/qualquer']) expect(routeFor(undefined, path)).toBeNull()
  })

  it('signed out: only login and sign-up are open', () => {
    expect(routeFor(null, '/login')).toBeNull()
    for (const path of ['/', '/t', '/reuniao', '/aguardando', '/bloqueado', '/nova-senha', '/x']) expect(routeFor(null, path)).toBe('/login')
  })

  it('pending goes to /aguardando from any path, and stays there', () => {
    for (const path of ['/', '/login', '/cadastro', '/don/hoje', '/reuniao', '/nova-senha', '/bloqueado']) expect(routeFor(p(null, 'pending'), path)).toBe('/aguardando')
    expect(routeFor(p(null, 'pending'), '/aguardando')).toBeNull()
    expect(routeFor(p('don', 'pending', true), '/don/hoje')).toBe('/aguardando') // pending wins over the password flag
    expect(routeFor(p(null, 'approved'), '/t')).toBe('/aguardando') // approved without a role is not usable yet
  })

  it('blocked goes to /bloqueado from any path, whatever the role', () => {
    for (const role of ['don', 'terral', null] as const) {
      for (const path of ['/', '/don/hoje', '/t', '/reuniao', '/aguardando']) expect(routeFor(p(role, 'blocked'), path)).toBe('/bloqueado')
      expect(routeFor(p(role, 'blocked'), '/bloqueado')).toBeNull()
    }
  })

  it('must_change_password forces /nova-senha for both roles', () => {
    for (const role of ['don', 'terral'] as const) {
      for (const path of ['/', '/don/hoje', '/t', '/reuniao', '/login']) expect(routeFor(p(role, 'approved', true), path)).toBe('/nova-senha')
      expect(routeFor(p(role, 'approved', true), '/nova-senha')).toBeNull()
    }
  })

  it('Don: own areas and /reuniao stay; anything else goes to /don/hoje', () => {
    const don = p('don', 'approved')
    for (const path of ['/don/hoje', '/don/semana', '/don/riscos', '/don/pendencias', '/don/entregas', '/don/entregas/3.1', '/don/calendario',
      '/don/equipe', '/don/decisoes', '/don/terral', '/don/terral/entregas/3.1', '/don/historico', '/don/acessos', '/reuniao', '/don/hoje/'])
      expect(routeFor(don, path), path).toBeNull()
    for (const path of ['/', '/login', '/cadastro', '/aguardando', '/nova-senha', '/t', '/t/marcos', '/don', '/don/nada', '/x'])
      expect(routeFor(don, path), path).toBe('/don/hoje')
  })

  it('Terral: own areas and /reuniao stay; anything else goes to /t', () => {
    const terral = p('terral', 'approved')
    for (const path of ['/t', '/t/marcos', '/t/entregas', '/t/entregas/I2', '/t/decisoes', '/t/metas', '/reuniao'])
      expect(routeFor(terral, path), path).toBeNull()
    for (const path of ['/', '/login', '/aguardando', '/don/terral', '/don/acessos', '/t/nada', '/x'])
      expect(routeFor(terral, path), path).toBe('/t')
  })
})
