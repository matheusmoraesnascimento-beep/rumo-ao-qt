import { expect, test } from '@playwright/test'

const BASE = '/rumo-ao-qt/'

test('deep link em subpasta + refresh funcionam (HashRouter) e rota protegida cai no login/configuração', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(`${BASE}#/edital`)
  await expect(page).toHaveURL(/#\/entrar/)
  // Sem VITE_SUPABASE_* no build de teste, o app mostra a tela de configuração (não quebra).
  await expect(page.getByRole('heading', { name: 'Configuração pendente' })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Configuração pendente' })).toBeVisible()
  expect(errors).toEqual([])
})

test('rodapé de independência, título e idioma', async ({ page }) => {
  await page.goto(`${BASE}#/entrar`)
  await expect(page.getByText('Ferramenta independente de estudos. Não oficial e sem vínculo com a Marinha do Brasil.')).toBeVisible()
  await expect(page).toHaveTitle('Rumo ao QT')
  expect(await page.locator('html').getAttribute('lang')).toBe('pt-BR')
})

test('sem rolagem horizontal (layout responsivo)', async ({ page }) => {
  await page.goto(`${BASE}#/entrar`)
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBeLessThanOrEqual(0)
})

test('assets só públicos: nenhuma prova/recorte é servido pelo Pages', async ({ request }) => {
  for (const p of ['dados/questoes_2022_2026.json', 'provas/CPT-2026-Q01.webp', 'referencias/CP-T 2026 INFORMATICA ROSA.pdf']) {
    const r = await request.get(`${BASE}${p}`)
    const ct = r.headers()['content-type'] ?? ''
    // SPA fallback pode devolver index.html (text/html); nunca o arquivo real.
    expect(ct).not.toMatch(/json|webp|pdf/)
  }
})
