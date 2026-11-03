import { expect, test, type Page } from '@playwright/test'

const BASE = '/rumo-ao-qt/'
const userId = '00000000-0000-4000-8000-000000000001'
const topicId = '00000000-0000-4000-8000-000000000002'
const user = {
  id: userId,
  email: 'study@example.test',
  aud: 'authenticated',
  role: 'authenticated',
  app_metadata: {},
  user_metadata: {},
  created_at: '2026-01-01T00:00:00Z',
}
type Row = Record<string, unknown>

async function authenticatedApp(page: Page) {
  const token = [
    Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'),
    Buffer.from(JSON.stringify({ sub: userId, exp: 4102444800, role: 'authenticated' })).toString(
      'base64url',
    ),
    'test-signature',
  ].join('.')
  await page.addInitScript(
    ({ token, user }) =>
      localStorage.setItem(
        'sb-study-plan-auth-token',
        JSON.stringify({
          access_token: token,
          refresh_token: 'test-refresh',
          expires_at: 4102444800,
          expires_in: 3600,
          token_type: 'bearer',
          user,
        }),
      ),
    { token, user },
  )
  const topic = {
    id: topicId,
    syllabus_version_id: 'version',
    parent_id: null,
    name: 'Processos e threads',
    slug: 'processos',
    ordinal: 0,
    notes: null,
  }
  const plan = {
    id: 'plan',
    user_id: userId,
    syllabus_version_id: 'version',
    name: 'Meu plano',
    active: true,
    current_item_id: 'item',
    passage_number: 1,
    revision: 1,
    algorithm_version: 'cycles-v1',
    preferences: {},
    exceptions: {},
    created_at: '2026-11-01T12:00:00Z',
  }
  const item = {
    id: 'item',
    user_id: userId,
    plan_id: 'plan',
    topic_id: topicId,
    ordinal: 0,
    budget_minutes: 90,
    paused: false,
    manual_weight: 1,
    skipped_on: null,
  }
  const tables: Record<string, Row[]> = {
    topics: [topic],
    study_plans: [plan],
    study_cycle_items: [item],
    syllabus_versions: [
      { id: 'version', year: 2026, label: '2026 (referência provisória)', status: 'provisional' },
    ],
    topic_progress: [
      {
        user_id: userId,
        topic_id: topicId,
        status: 'estudando',
        confidence: 2,
        notes: null,
        notes_html: '<p>Processos compartilham recursos.</p>',
      },
    ],
    topic_passages: [],
    guided_study_sessions: [],
    study_plan_events: [],
    study_sessions: [],
    review_events: [],
    review_cards: [
      {
        id: 'review',
        user_id: userId,
        topic_id: topicId,
        kind: 'aula',
        front: 'Processos e threads',
        back: '',
        algorithm: 'interval-v1',
        level: 0,
        lapses: 0,
        review_count: 0,
        due_at: '2026-01-01T03:00:00Z',
        last_reviewed_at: null,
      },
    ],
  }
  const finishes: { key: string; payload: Row }[] = []
  let failFirstFinish = true
  await page.route('https://study-plan.test/**', async (route) => {
    const url = new URL(route.request().url())
    const resource = url.pathname.split('/').at(-1) ?? ''
    const headers = {
      'access-control-allow-origin': '*',
      'access-control-allow-headers': '*',
      'access-control-allow-methods': '*',
    }
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers })
    if (resource === 'study_plan_command') {
      const request = route.request().postDataJSON() as {
        p_operation: string
        p_payload: Row
        p_key: string
      }
      const session = tables.guided_study_sessions[0]
      if (request.p_operation === 'start')
        tables.guided_study_sessions = [
          {
            id: 'guided',
            plan_id: 'plan',
            item_id: 'item',
            topic_id: topicId,
            passage_number: 1,
            state: 'running',
            elapsed_seconds: 0,
            resumed_at: new Date().toISOString(),
            started_at: new Date().toISOString(),
            notes: null,
          },
        ]
      if (request.p_operation === 'pause')
        Object.assign(session, { state: 'paused', elapsed_seconds: 120, resumed_at: null })
      if (request.p_operation === 'finish') {
        finishes.push({ key: request.p_key, payload: request.p_payload })
        if (failFirstFinish) {
          failFirstFinish = false
          return route.fulfill({
            status: 503,
            headers,
            json: { message: 'Falha de rede simulada' },
          })
        }
        Object.assign(session, {
          state: 'finished',
          notes: request.p_payload.notes,
          study_session_id: 'saved',
        })
        tables.study_sessions = [
          {
            id: 'saved',
            user_id: userId,
            topic_id: topicId,
            kind: 'teoria',
            started_at: new Date().toISOString(),
            ended_at: new Date().toISOString(),
            duration_minutes: 2,
          },
        ]
        tables.topic_passages = [
          {
            id: 'stage',
            user_id: userId,
            syllabus_version_id: 'version',
            topic_id: topicId,
            passage_number: 1,
            status: 'in_progress',
            checklist: {},
            completed_at: null,
          },
        ]
      }
      return route.fulfill({ headers, json: { ok: true } })
    }
    if (resource === 'review_card') {
      const saved = {
        ...tables.review_cards[0],
        due_at: '2099-01-02T03:00:00Z',
        level: 1,
        review_count: 1,
      }
      tables.review_cards = [saved]
      return route.fulfill({ headers, json: saved })
    }
    if (resource === 'user') return route.fulfill({ headers, json: user })
    if (resource === 'user_settings')
      return route.fulfill({
        headers,
        json: {
          user_id: userId,
          daily_review_cap: 20,
          weekly_availability: { mon: 120, tue: 120, wed: 120, thu: 120, fri: 120, sat: 0, sun: 0 },
          goal_correct: 40,
          baseline_2026: 21,
          exam_date: null,
          theme: 'system',
          include_writing: false,
          min_new_topic_share: 0.2,
        },
      })
    if (resource === 'profiles')
      return route.fulfill({ headers, json: { id: userId, timezone: 'America/Sao_Paulo' } })
    return route.fulfill({ headers, json: tables[resource] ?? [] })
  })
  return { tables, finishes }
}

test('sessão autenticada: parcial, erro/retry idempotente e refresh preservam assunto pendente', async ({
  page,
}) => {
  const { tables, finishes } = await authenticatedApp(page)
  await page.goto(`${BASE}#/sessao?item=item`)
  await expect(page.getByRole('heading', { name: 'Processos e threads' })).toBeVisible()
  await page.getByRole('button', { name: 'Iniciar sessão', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Pausar', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Pausar', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Retomar', exact: true })).toBeVisible()
  await page
    .getByLabel('Conteúdo estudado, dúvidas e próxima ação')
    .fill('Falta praticar sincronização; sessão parcial.')
  await expect(
    page.getByRole('button', { name: 'Finalizar e concluir passagem do assunto' }),
  ).toBeDisabled()
  await page.getByRole('button', { name: 'Salvar sessão parcial' }).click()
  await expect(page.getByRole('alert')).toContainText('Seu registro não foi confirmado')
  await expect(page.getByText('Sessão salva. O próximo bloco já está atualizado.')).toHaveCount(0)
  await page.getByRole('button', { name: 'Salvar sessão parcial' }).click()
  await expect(page.getByText('Sessão salva. O próximo bloco já está atualizado.')).toBeVisible()
  expect(finishes).toHaveLength(2)
  expect(finishes[0].key).toBe(finishes[1].key)
  expect(finishes[1].payload.complete).toBe(false)
  expect(tables.topic_passages[0].status).toBe('in_progress')
  await page.reload()
  await expect(page.getByRole('button', { name: 'Iniciar sessão', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Processos e threads' })).toBeVisible()
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(overflow).toBeLessThanOrEqual(0)
})

test('revisão autenticada orienta ChatGPT e confirma a data persistida', async ({ page }) => {
  await authenticatedApp(page)
  await page.goto(`${BASE}#/revisoes`)
  await expect(
    page.getByRole('heading', { name: 'Revisões por assunto', exact: true }),
  ).toBeVisible()
  const script = page.getByLabel('Roteiro para revisar no ChatGPT')
  await expect(script).toContainText('Processos compartilham recursos.')
  await expect(script).toContainText('Não invente gabarito oficial')
  await page.getByRole('button', { name: '4 Fácil', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('Próxima revisão: 02/01/2099 00:00')
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(overflow).toBeLessThanOrEqual(0)
})
