# Arquitetura

```
Navegador (GitHub Pages, estático)
  React SPA ── HashRouter ── TanStack Query ── src/lib/api.ts (repositório)
        │                                        │
        │ chave anon/publishable                 ▼
        └──────────────────────────────► Supabase
                                          ├─ Auth (PKCE)
                                          ├─ Postgres + RLS (auth.uid())
                                          │    ├─ catálogo (somente leitura p/ autenticados)
                                          │    └─ dados do estudante (CRUD só do dono)
                                          ├─ RPC review_card / reschedule_card / delete_my_account
                                          └─ Storage privado: provas (URL assinada), redacoes (pasta = uid)
```

## Camadas

- `src/lib/api.ts` — único ponto que fala com o Supabase; erros viram exceções com mensagem útil.
- `src/lib/{srs,planner,simulado,filtros,metrics,backup}.ts` — lógica pura e testável (sem React).
- `src/features/*` — telas: dashboard, edital, estudos (check-in), calendario (agenda), questoes, simulados, revisoes, redacao, relatorios (análise), config, auth.
- `supabase/migrations` — schema, RLS, RPCs, storage. `supabase/seed*.sql` — gerados por `scripts/gerar-seed.ts`.

## Segurança

- RLS **ENABLE + FORCE** em todas as tabelas privadas, políticas `auth.uid() = user_id` (SELECT/INSERT/UPDATE/DELETE com `WITH CHECK`).
- Chaves estrangeiras **compostas** `(id,user_id)` impedem forjar `review_events`, `writing_feedback` ou `question_attempts` apontando para registros de outro usuário, mesmo com `user_id` falsificado.
- Catálogo (`exams`, `topics`, `questions`, …): `REVOKE INSERT/UPDATE/DELETE` para `anon`/`authenticated` e sem políticas de escrita; importação só por migração/service_role fora do browser.
- `review_events` e `review_reschedule_log`: imutáveis (sem UPDATE/DELETE; trigger bloqueia UPDATE).
- `questions` **não tem coluna de gabarito** (teste automatizado garante). O gabarito oficial vive em `answer_keys` (RLS sem políticas, `REVOKE` para `anon/authenticated`): só os RPCs `reveal_answer` (exige tentativa avulsa do próprio usuário), `finalize_simulation` e `simulation_review` (só após finalizar, só do dono) o expõem; o gatilho `apply_answer_key` grava `is_correct`/`key_status` no servidor e ignora valores enviados pelo cliente.
- Privilégio elevado só em `delete_my_account()` (`SECURITY DEFINER`, `search_path` fixo, executa apenas para `authenticated`, apaga somente `auth.uid()`).
- Nenhum `admin` por flag local ou `VITE_*`: tabela `admins` sem política e sem rota de admin no front.
