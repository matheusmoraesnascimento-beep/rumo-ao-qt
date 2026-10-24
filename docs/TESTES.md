# Testes

`npm run lint && npm run typecheck && npm run test && npm run build` (o mesmo que o CI roda).

| Suíte | Arquivo | Cobre |
|---|---|---|
| RLS/RPC em Postgres real (PGlite) | `tests/db/rls.test.ts` | isolamento A×B, escrita proibida no catálogo, FKs cruzadas forjadas, simulado = 50 itens, SRS no SQL (UTC/São Paulo, idempotência, cliques rápidos), eventos imutáveis, exclusão de conta, ausência de coluna de gabarito |
| Importação + seed | `tests/importacao.test.ts` | 5×50, Q01–Q50, sem gabarito, imagens, seed idempotente, não sobrescreve `reviewed` (pulado sem `dados/`) |
| Lógica | `tests/lib.test.ts` | SRS (0–5, lapso, 30 dias, semana sem abrir, fuso), planejador, simulado (50, ordem, semente), métricas (verificada N/A) |
| Filtros/backup | `tests/filtros-backup.test.ts` | filtros, mistura, CSV, restauração |
| UI | `tests/ui.test.tsx` | imagem por padrão, "Gabarito não incluído", 21/50 só como base, retomada de simulado, revisão antes de finalizar |
| Auth | `tests/auth.test.tsx` | cadastro, login, validação, logout/sessão, recuperação de senha |
| Redação | `tests/redacao.test.tsx` | autosave, versões, rótulos não oficiais |
| E2E | `tests/e2e/smoke.spec.ts` | build em `/rumo-ao-qt/`, deep link/refresh, mobile sem scroll horizontal, provas não servidas pelo Pages |

## Limites conhecidos

- O RLS é provado em Postgres real (PGlite) com um *stub* de `auth.uid()`/roles; a prova final no Supabase hospedado é feita com **dois usuários reais** (checklist abaixo).
- E2E com login real exige um projeto Supabase de teste e dois usuários; não é executado no CI público.

## Checklist manual no seu projeto Supabase (QA multiusuário)

1. Crie as contas A e B. Com A: registre sessão, resposta, card, redação.
2. Com o JWT de B (copie o ccess_token da sessão de B em Application > Local Storage), consulte via REST:
   `curl "$URL/rest/v1/study_sessions?select=*" -H "apikey: $ANON" -H "Authorization: Bearer $JWT_B"` → deve retornar `[]`.
3. Mesmo teste em `review_cards`, `writing_submissions`, `question_attempts`, `simulations`.
4. `curl -X POST "$URL/rest/v1/questions" … -H "Authorization: Bearer $JWT_B" -d '{"code":"x"}'` → deve falhar (permissão negada).
5. Teste de reset de senha: "Esqueci a senha" → e-mail → abre `#/redefinir-senha`.
