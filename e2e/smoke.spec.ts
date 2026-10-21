import { expect, test, type Page } from '@playwright/test'

const cred = (k: 'DON' | 'TERRAL' | 'PENDING') => ({ email: process.env[`E2E_${k}_EMAIL`]!, password: process.env[`E2E_${k}_PASSWORD`]! })

async function login(page: Page, who: 'DON' | 'TERRAL' | 'PENDING') {
  const { email, password } = cred(who)
  await page.goto('/login')
  await page.getByLabel('E-mail').fill(email)
  await page.getByLabel('Senha').fill(password)
  await page.getByRole('button', { name: 'Entrar' }).click()
}

// Center the first block first: the sticky top bar would cover it after Playwright's default scroll.
const tap = async (page: Page) => {
  const box = page.locator('.don-blocks input[type=checkbox]').first()
  await box.evaluate((el) => el.scrollIntoView({ block: 'center' }))
  const r = (await box.boundingBox())!
  await page.mouse.click(r.x + r.width / 2, r.y + r.height / 2)
}

const code = () => process.env.E2E_CODE!
const DON_ROUTES = ['hoje', 'semana', 'riscos', 'pendencias', 'entregas', 'calendario', 'equipe', 'decisoes', 'terral', 'historico', 'acessos'].map((r) => `/don/${r}`)
const TERRAL_ROUTES = ['/t', '/t/marcos', '/t/entregas', '/t/decisoes', '/t/metas']

test('Don ticks the first block, it survives a reload, then unticks it', async ({ page }) => {
  await login(page, 'DON')
  await expect(page).toHaveURL(/\/don\/hoje/)
  await page.goto('/don/hoje?today=2026-11-10')
  const first = page.locator('.don-blocks input[type=checkbox]').first()
  await expect(first).toBeVisible()
  const was = await first.isChecked() // a leftover tick is fine: the test flips it and flips it back
  try {
    await tap(page)
    await expect(first).toBeChecked({ checked: !was })
    await expect(page.getByText(was ? 'Desmarcado.' : 'Feito.')).toBeVisible() // toast: the write was saved
    await page.reload()
    await expect(page.locator('.don-blocks input[type=checkbox]').first()).toBeChecked({ checked: !was })
  } finally {
    // best effort; global teardown restores the original state anyway
    await page.goto('/don/hoje?today=2026-11-10')
    const box = page.locator('.don-blocks input[type=checkbox]').first()
    if ((await box.isChecked()) !== was) await tap(page)
  }
  await expect(page.locator('.don-blocks input[type=checkbox]').first()).toBeChecked({ checked: was })
  await page.reload()
  await expect(page.locator('.don-blocks input[type=checkbox]').first()).toBeChecked({ checked: was })
})

test('Terral user lands on /t, sees N/19 and no Don names or hours', async ({ page }) => {
  await login(page, 'TERRAL')
  await expect(page).toHaveURL(/\/t$/)
  await expect(page.locator('.ui-ring')).toContainText(/\d+\/19/)
  const text = await page.locator('body').innerText()
  for (const w of ['David', 'Lucas', 'Beto']) expect(text).not.toContain(w)
  expect(text).not.toMatch(/\d\s?h\b/) // "3,5 h"
  await page.goto('/don/hoje')
  await expect(page).toHaveURL(/\/t$/) // wrong area: sent home
})

test('Terral network never carries block, task or person rows', async ({ page }) => {
  const leaks: string[] = []
  page.on('response', async (res) => {
    const u = new URL(res.url())
    if (!/\/rest\/v1\/(block|task|person)(\?|$)/.test(u.pathname + u.search)) return
    if (res.status() >= 400) return // refused: fine
    const body = await res.json().catch(() => null)
    if (Array.isArray(body) && body.length) leaks.push(`${u.pathname} -> ${body.length} rows`)
  })
  await login(page, 'TERRAL')
  for (const r of TERRAL_ROUTES) {
    await page.goto(r)
    await expect(page.locator('main, [role=main], body')).toBeVisible()
  }
  await page.waitForLoadState('networkidle')
  expect(leaks).toEqual([])
})

test('a pending signup lands on /aguardando', async ({ page }) => {
  await login(page, 'PENDING')
  await expect(page).toHaveURL(/\/aguardando/)
  await page.goto('/don/hoje')
  await expect(page).toHaveURL(/\/aguardando/)
})

test.describe('phone width 375x812: no horizontal overflow', () => {
  test.use({ viewport: { width: 375, height: 812 } })
  const overflow = async (page: Page, routes: string[]) => {
    for (const r of routes) {
      await page.goto(r)
      await expect(page).toHaveURL(new RegExp(r.replace(/[/.]/g, '\\$&') + '$'))
      await expect(page.locator('h1').first()).toBeVisible()
      await page.waitForLoadState('networkidle')
      const w = await page.evaluate(() => document.documentElement.scrollWidth)
      expect(w, `${r} scrollWidth`).toBeLessThanOrEqual(375)
    }
  }
  test('Don routes', async ({ page }) => {
    await login(page, 'DON')
    await expect(page).toHaveURL(/\/don\/hoje/)
    await overflow(page, [...DON_ROUTES, `/don/entregas/${code()}`, '/reuniao'])
  })
  test('Terral routes', async ({ page }) => {
    await login(page, 'TERRAL')
    await expect(page).toHaveURL(/\/t$/)
    await overflow(page, [...TERRAL_ROUTES, `/t/entregas/${code()}`, '/reuniao'])
  })
})

test.describe('meeting mode at 1920x1080', () => {
  test.use({ viewport: { width: 1920, height: 1080 } })
  test('no vertical scrollbar on any step', async ({ page }) => {
    await login(page, 'DON')
    await expect(page).toHaveURL(/\/don\/hoje/)
    await page.goto('/reuniao')
    for (let step = 1; step <= 4; step++) {
      await expect(page.locator('.m-bar-label b')).toHaveText(new RegExp(`^${step} de 4`))
      await page.waitForLoadState('networkidle')
      const { sh, ih } = await page.evaluate(() => ({ sh: document.documentElement.scrollHeight, ih: window.innerHeight }))
      expect(sh, `step ${step}`).toBeLessThanOrEqual(ih)
      if (step < 4) await page.keyboard.press('ArrowRight')
    }
  })
})
