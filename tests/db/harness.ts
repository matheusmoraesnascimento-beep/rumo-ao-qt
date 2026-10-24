import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const MIG = path.resolve(__dirname, '../../supabase/migrations')

/** Postgres real (WASM) com stub mínimo do Supabase (roles, auth.uid(), auth.users). */
export async function createDb() {
  const db = new PGlite()
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create schema auth;
    create table auth.users (
      id uuid primary key default gen_random_uuid(),
      email text,
      raw_user_meta_data jsonb
    );
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema public, auth to anon, authenticated;
    alter default privileges in schema public grant all on tables to anon, authenticated;
    alter default privileges in schema public grant all on sequences to anon, authenticated;
  `)
  for (const f of ['20261023000001_schema.sql', '20261023000002_rls_rpc.sql', '20261024000005_answer_keys.sql', '20261024000006_push_reminders.sql']) {
    await db.exec(readFileSync(path.join(MIG, f), 'utf8'))
  }
  return db
}

export type Db = Awaited<ReturnType<typeof createDb>>

export async function createUser(db: Db, email: string): Promise<string> {
  const r = await db.query<{ id: string }>(
    `insert into auth.users (email) values ($1) returning id`,
    [email],
  )
  return r.rows[0].id
}

/** Executa como `authenticated` com o JWT sub = userId (RLS ativa). */
export async function asUser<T>(db: Db, userId: string | null, fn: () => Promise<T>): Promise<T> {
  await db.exec(`reset role`)
  if (userId) {
    await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [userId])
    await db.exec(`set role authenticated`)
  } else {
    await db.query(`select set_config('request.jwt.claim.sub', '', false)`)
    await db.exec(`set role anon`)
  }
  try {
    return await fn()
  } finally {
    await db.exec(`reset role`)
  }
}

/** Resultado de erro como string (ou null se não houve erro). */
export async function err(p: Promise<unknown>): Promise<string | null> {
  try {
    await p
    return null
  } catch (e) {
    return (e as Error).message
  }
}

/** Catálogo mínimo para testes: 2 provas x 50 questões. */
export async function seedCatalog(db: Db) {
  await db.exec(`
    insert into exams (slug, year) values ('cpt-2025', 2025), ('cpt-2026', 2026);
    insert into questions (code, exam_id, number, ocr_body)
      select 'CPT-' || e.year || '-Q' || lpad(n::text, 2, '0'), e.id, n, 'texto ' || n
      from exams e, generate_series(1, 50) n;
  `)
}
