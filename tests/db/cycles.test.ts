// @vitest-environment node
import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { createDb, createUser, asUser, err, type Db } from './harness'
const migration = readFileSync('supabase/migrations/20261103000008_cycles_passages.sql', 'utf8')
let db: Db, a: string, b: string, version: string, topics: string[], plan: string, item: string
const key = () => crypto.randomUUID()
async function command(op: string, data: object, clientKey = key()) {
  const r = await db.query<{ result: Record<string, unknown> }>(
    'select public.study_plan_command($1,$2::jsonb,$3::uuid) result',
    [op, JSON.stringify(data), clientKey],
  )
  return r.rows[0].result
}
async function revision() {
  return (
    await db.query<{ revision: number }>('select revision from study_plans where id=$1', [plan])
  ).rows[0].revision
}
function config(extra = {}) {
  return {
    syllabus_version_id: version,
    name: 'Plano teste',
    topic_ids: topics,
    settings: {
      weekly_availability: { mon: 120, tue: 120, wed: 120, thu: 120, fri: 120, sat: 0, sun: 0 },
      goal_correct: 40,
      exam_date: null,
      daily_review_cap: 20,
    },
    preferences: {
      min_verified_sample: 10,
      alert_threshold: 0.7,
      window_days: 30,
      weights: {
        reviewOverdue: 0.3,
        editalCoverageGap: 0.25,
        demonstratedDifficulty: 0.2,
        daysSinceContact: 0.15,
        manualPriority: 0.1,
      },
      time_shares: { review: 0.125, cycle: 0.375, questions: 0.375, errors: 0.125 },
    },
    items: topics.map((topic_id) => ({
      topic_id,
      budget_minutes: 45,
      manual_weight: 1,
      paused: false,
    })),
    ...extra,
  }
}
beforeAll(async () => {
  db = await createDb()
  a = await createUser(db, 'cycles-a@example.test')
  b = await createUser(db, 'cycles-b@example.test')
  await db.exec(
    "insert into syllabus_versions(year,label) values(2026,'Referência CP-T'); insert into topics(syllabus_version_id,name,slug,ordinal) select id,'Assunto '||n,'t'||n,n from syllabus_versions,generate_series(1,2)n;",
  )
  version = (await db.query<{ id: string }>('select id from syllabus_versions')).rows[0].id
  topics = (await db.query<{ id: string }>('select id from topics order by ordinal')).rows.map(
    (r) => r.id,
  )
  await asUser(db, a, () =>
    db.query("insert into topic_progress(user_id,topic_id,status) values($1,$2,'revisando')", [
      a,
      topics[0],
    ]),
  )
  await db.exec(migration)
}, 30000)
afterAll(async () => {
  await db.close()
})
describe('ciclos: migração aditiva, transações e segurança real Postgres', () => {
  it('reexecução mantém IDs e progresso legado; não faz backfill', async () => {
    const before = await db.query('select * from topic_progress')
    await db.exec(migration)
    expect((await db.query('select * from topic_progress')).rows).toEqual(before.rows)
    expect((await db.query('select * from topic_passages')).rows).toHaveLength(0)
  })
  it('cria plano completo idempotente e seleciona somente folhas corretas', async () => {
    const c = config(),
      k = key()
    const out = await asUser(db, a, async () => command('save_plan', c, k))
    plan = String(out.plan_id)
    expect(await asUser(db, a, async () => command('save_plan', c, k))).toEqual(out)
    expect((await db.query('select * from study_plans')).rows).toHaveLength(1)
    item = (
      await db.query<{ id: string }>(
        'select id from study_cycle_items where plan_id=$1 order by ordinal',
        [plan],
      )
    ).rows[0].id
    expect(
      await asUser(db, a, async () =>
        err(command('save_plan', config({ topic_ids: [topics[0]] }))),
      ),
    ).toContain('todos os assuntos')
  })
  it('RLS e RPC não expõem nem permitem escrever/relacionar dados de A para B', async () => {
    expect((await asUser(db, b, () => db.query('select * from study_plans'))).rows).toHaveLength(0)
    expect(
      await asUser(db, b, async () =>
        err(command('start', { plan_id: plan, item_id: item, expected_revision: 1 })),
      ),
    ).toContain('Plano indisponível')
    expect(
      await asUser(db, a, () =>
        err(db.query('update study_plans set passage_number=99 where id=$1', [plan])),
      ),
    ).toMatch(/permission denied/)
    expect(
      await asUser(db, a, () =>
        err(
          db.query(
            "insert into topic_passages(user_id,syllabus_version_id,topic_id,passage_number,status) values($1,$2,$3,1,'in_progress')",
            [a, version, topics[0]],
          ),
        ),
      ),
    ).toMatch(/permission denied/)
    expect(
      await asUser(db, null, async () => err(command('start', { plan_id: plan, item_id: item }))),
    ).toMatch(/permission denied/)
  })
  it('sessão parcial mantém cursor, revisão não conta passagem e refresh recupera estado', async () => {
    const started = await asUser(db, a, async () =>
      command('start', { plan_id: plan, item_id: item, expected_revision: 1 }),
    )
    const id = String(started.id)
    expect(
      (
        await asUser(db, a, () =>
          db.query('select state from guided_study_sessions where id=$1', [id]),
        )
      ).rows[0],
    ).toEqual({ state: 'running' })
    await db.query(
      "update guided_study_sessions set resumed_at=now()-interval '20 minutes' where id=$1",
      [id],
    )
    await asUser(db, a, async () => command('pause', { plan_id: plan, session_id: id }))
    await asUser(db, a, async () => command('resume', { plan_id: plan, session_id: id }))
    await asUser(db, a, async () =>
      command('finish', {
        plan_id: plan,
        session_id: id,
        complete: false,
        notes: 'Estudo parcial',
        difficulty: 3,
      }),
    )
    expect((await db.query('select status from topic_passages')).rows[0]).toEqual({
      status: 'in_progress',
    })
    expect((await db.query('select current_item_id from study_plans')).rows[0]).toEqual({
      current_item_id: item,
    })
    expect((await db.query('select * from study_sessions')).rows).toHaveLength(1)
  })
  it('checklist obrigatório no banco e finish repetido cria um evento/sessão', async () => {
    const started = await asUser(db, a, async () =>
        command('start', { plan_id: plan, item_id: item, expected_revision: await revision() }),
      ),
      id = String(started.id)
    await db.query(
      "update guided_study_sessions set resumed_at=now()-interval '35 minutes' where id=$1",
      [id],
    )
    expect(
      await asUser(db, a, async () =>
        err(
          command('finish', {
            plan_id: plan,
            session_id: id,
            complete: true,
            notes: 'Conteúdo',
            difficulty: 2,
            checklist: { covered: true },
          }),
        ),
      ),
    ).toContain('Checklist')
    const payload = {
        plan_id: plan,
        session_id: id,
        complete: true,
        notes: 'Teoria e exemplos concluídos; dúvidas anotadas.',
        difficulty: 2,
        checklist: { covered: true, assessed: true },
      },
      k = key()
    const out = await asUser(db, a, async () => command('finish', payload, k))
    expect(await asUser(db, a, async () => command('finish', payload, k))).toEqual(out)
    await asUser(db, a, async () => command('finish', payload))
    expect((await db.query('select * from study_sessions')).rows).toHaveLength(2)
    expect(
      (await db.query("select * from topic_passages where status='completed'")).rows,
    ).toHaveLength(1)
    expect(
      (await db.query('select count(*)::int n from study_plan_events where client_key=$1', [k]))
        .rows[0],
    ).toEqual({ n: 1 })
    expect(
      await asUser(db, a, async () =>
        err(command('next_passage', { plan_id: plan, expected_revision: await revision() })),
      ),
    ).toContain('pendentes')
  })
  it('reordenação preserva cursor por ID; aba desatualizada falha sem duplicar', async () => {
    const old = (
        await db.query<{ current_item_id: string }>('select current_item_id from study_plans')
      ).rows[0].current_item_id,
      rev = await revision()
    await asUser(db, a, async () =>
      command(
        'save_plan',
        config({ plan_id: plan, expected_revision: rev, topic_ids: [...topics].reverse() }),
      ),
    )
    expect((await db.query('select current_item_id from study_plans')).rows[0]).toEqual({
      current_item_id: old,
    })
    expect(
      await asUser(db, a, async () =>
        err(
          command('skip', {
            plan_id: plan,
            item_id: item,
            expected_revision: rev,
            reason: 'Plantão',
          }),
        ),
      ),
    ).toContain('outra aba')
  })
  it('ownership validado por constraint/trigger inclusive chamadas administrativas', async () => {
    expect(
      await err(
        db.query(
          "insert into guided_study_sessions(user_id,plan_id,item_id,topic_id,passage_number,state) values($1,$2,$3,$4,1,'paused')",
          [b, plan, item, topics[0]],
        ),
      ),
    ).toMatch(/Assunto|foreign key/)
    const row = (await db.query<{ id: string }>('select id from study_sessions limit 1')).rows[0]
    expect(
      await err(
        db.query(
          "insert into topic_passages(user_id,syllabus_version_id,topic_id,passage_number,status,evidence_session_id) values($1,$2,$3,1,'in_progress',$4)",
          [b, version, topics[0], row.id],
        ),
      ),
    ).toContain('Evidência')
  })
  it('equivalência é explícita/auditada; reabertura preserva evento e progresso legado', async () => {
    await asUser(db, a, async () =>
      command('reopen', {
        plan_id: plan,
        topic_id: topics[0],
        passage_number: 1,
        expected_revision: await revision(),
        reason: 'Correção auditada da marcação de compreensão.',
      }),
    )
    const before = (await db.query('select * from topic_progress')).rows
    await asUser(db, a, async () =>
      command('legacy_passage', {
        plan_id: plan,
        topic_id: topics[0],
        expected_revision: await revision(),
        confirmed: true,
        reason: 'Verifiquei o material legado e a compreensão registrada.',
      }),
    )
    expect((await db.query('select * from topic_progress')).rows).toEqual(before)
    expect(
      (await db.query("select * from study_plan_events where kind='reopen'")).rows,
    ).toHaveLength(1)
  })
  it('requisições simultâneas finalizam uma única sessão e conclusão', async () => {
    const other = (
      await db.query<{ id: string }>(
        'select id from study_cycle_items where plan_id=$1 and topic_id=$2',
        [plan, topics[1]],
      )
    ).rows[0].id
    const started = await asUser(db, a, async () =>
      command('start', { plan_id: plan, item_id: other, expected_revision: await revision() }),
    )
    await db.query(
      "update guided_study_sessions set resumed_at=now()-interval '1 minute' where id=$1",
      [started.id],
    )
    const payload = {
      plan_id: plan,
      session_id: started.id,
      complete: true,
      notes: 'Estudei os objetivos e identifiquei as dificuldades.',
      difficulty: 2,
      checklist: { covered: true, assessed: true },
    }
    const before = (
      await db.query<{ n: number }>(
        "select count(*)::int n from study_plan_events where kind='finish'",
      )
    ).rows[0].n
    await asUser(db, a, async () =>
      Promise.all([command('finish', payload), command('finish', payload)]),
    )
    expect(
      (
        await db.query<{ n: number }>(
          "select count(*)::int n from study_plan_events where kind='finish'",
        )
      ).rows[0].n,
    ).toBe(before + 1)
    expect(
      (
        await db.query(
          'select * from study_sessions where id=(select study_session_id from guided_study_sessions where id=$1)',
          [started.id],
        )
      ).rows,
    ).toHaveLength(1)
    await asUser(db, a, async () =>
      command('next_passage', { plan_id: plan, expected_revision: await revision() }),
    )
    expect(
      (await db.query('select passage_number from study_plans where id=$1', [plan])).rows[0],
    ).toEqual({ passage_number: 2 })
  })
  it('retry com mesma chave e payload diferente é rejeitado; exceção não move cursor', async () => {
    const payload = {
        plan_id: plan,
        expected_revision: await revision(),
        day: '2026-11-04',
        minutes: 25,
        reason: 'Plantão com tempo reduzido',
      },
      k = key()
    const before = (await db.query('select current_item_id from study_plans where id=$1', [plan]))
      .rows[0]
    await asUser(db, a, async () => command('exception', payload, k))
    expect(
      await asUser(db, a, async () => err(command('exception', { ...payload, minutes: 90 }, k))),
    ).toContain('outro comando')
    expect(
      (await db.query('select current_item_id from study_plans where id=$1', [plan])).rows[0],
    ).toEqual(before)
  })
  it('flag por usuário desativa e reativa sem apagar histórico', async () => {
    const before = (await db.query('select id from topic_passages order by id')).rows
    await asUser(db, a, async () =>
      command('disable', { plan_id: plan, expected_revision: await revision() }),
    )
    expect(
      (await asUser(db, a, () => db.query('select * from study_plans where active'))).rows,
    ).toHaveLength(0)
    await asUser(db, a, async () =>
      command('enable', { plan_id: plan, expected_revision: await revision() }),
    )
    expect((await db.query('select id from topic_passages order by id')).rows).toEqual(before)
  })
  it('gabarito ausente permanece desconhecido mesmo ao forjar campos verificados', async () => {
    await db.exec(
      "insert into exams(slug,year) values('cpt-test',2026); insert into questions(code,exam_id,number) select 'CPT-test-Q01',id,1 from exams where slug='cpt-test'",
    )
    const q = (await db.query<{ id: string }>("select id from questions where code='CPT-test-Q01'"))
      .rows[0].id
    const at = await asUser(db, a, () =>
      db.query<{ id: string }>(
        'insert into question_attempts(user_id,question_id,time_seconds) values($1,$2,30) returning id',
        [a, q],
      ),
    )
    await asUser(db, a, () =>
      db.query("update question_attempts set is_correct=true,key_status='valida' where id=$1", [
        at.rows[0].id,
      ]),
    )
    expect(
      (
        await db.query('select is_correct,key_status from question_attempts where id=$1', [
          at.rows[0].id,
        ])
      ).rows[0],
    ).toEqual({ is_correct: null, key_status: null })
  })
})
