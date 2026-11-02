# Auditoria inicial: aplicação e compatibilidade

Auditoria do repositório em 02/11/2026, branch `main`, commit `7194368`; árvore inicialmente sem alterações rastreadas. O banco implantado **não foi inspecionado**: não havia CLI PostgreSQL/Supabase nem conexão administrativa disponíveis. As migrations são evidência do esquema pretendido, não prova do estado de produção. Contagens, órfãos, políticas efetivas e propriedade de dados permanecem desconhecidos.

| Entidade | Evidência no repositório | Estratégia de compatibilidade | Contagens antes/depois |
|---|---|---|---|
| Perfil e preferências | `profiles`, `user_settings` | Reutilizar metas e disponibilidade; não substituir preferências | desconhecidas |
| Edital e progresso | `exams`, `syllabus_versions`, `topics`, `topic_progress` | Preservar IDs; selecionar explicitamente uma versão antes de calcular ciclos | desconhecidas |
| Sessões e agenda | `study_sessions`, `study_blocks`, `blocked_days` | Reutilizar sessões; não inferir passagens concluídas | desconhecidas |
| Questões e tentativas | `questions`, `question_attempts`, `user_question_topics`, migration de gabaritos | Preservar IDs, respostas, autoavaliações e proveniência | desconhecidas |
| Revisões | `review_cards`, `review_events`, RPC `review_card` | Preservar `interval-v1`, eventos e vencimentos | desconhecidas |
| Simulados e redação | `simulations`, `writing_submissions`, `writing_feedback` | Manter intactos | desconhecidas |

O temporizador em `Agenda.tsx` usa `localStorage` (`timer-v1`), e o tema também usa armazenamento local. Não houve limpeza ou importação. O aplicativo possui `HashRouter`, build Vite e workflow de GitHub Pages. Os limites de consulta atuais de sessões, tentativas e cards impedem afirmar que métricas incluem todo histórico.

Antes de escrever migrations, executar `supabase/auditoria_somente_leitura.sql` com conexão autorizada ao banco correto, registrar resultados agregados sem dados pessoais e comparar com as migrations locais. Verificar também constraints, índices, triggers, funções, versões e referências cruzadas; conferir com duas contas e preparar backup restaurável e clone. A existência de chave pública em configuração local não equivale a acesso administrativo nem autoriza contornar RLS. Não executar backfill automático de passagens.
