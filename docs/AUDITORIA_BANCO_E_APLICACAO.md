# Auditoria da aplicação e plano de compatibilidade

## Atualização de 03/11/2026

A especificação `IMPLEMENTACAO_METODO_PAPIRO_RUMO_AO_QT.md` foi lida integralmente. Este relatório distingue código versionado, conectividade observada e dados privados **não acessíveis**. Não certifica o schema de produção. O registro anterior de 02/11 permanece no final como histórico, e suas limitações são atualizadas aqui.

### Evidências e ambiente

- Checkout inicial `main@988cff9`; alterações apenas `.claude/` e `.superpowers/` preexistentes, não rastreadas e preservadas. Remoto `matheusmoraesnascimento-beep/rumo-ao-qt` estava um commit à frente, sem divergência. A implementação sincronizou por fast-forward para `f5d8121` antes das alterações novas. Esse commit não acrescentou migrations.
- Produção `https://matheusmoraesnascimento-beep.github.io/rumo-ao-qt/`: workflow `41432094962` com sucesso, head `f5d8121`, conforme consulta GitHub somente leitura nesta sessão.
- React 19, TypeScript, Vite, Tailwind, HashRouter, TanStack Query, React Hook Form/Zod, Supabase JS. CI executa lint, typecheck, Vitest, build e publicação Pages; base `/rumo-ao-qt/`.
- Não foi encontrado `AGENTS.md` adicional no workspace. Análise e implementação foram delegadas conforme preferência recebida: `gpt-6-astra high` e `gpt-6.1-sol high`, respectivamente.
- Existem `psql` e `gh` autenticado. Não há CLI Supabase no PATH, `.env.local`, variáveis de conexão PostgreSQL/Supabase, `.pgpass` ou token Supabase disponível. `~/.supabase` contém somente telemetria. Não há ferramenta Supabase conectada nesta sessão.
- GitHub Actions possui três variáveis públicas VITE; URL/chave pública foram usadas somente em memória para GETs. Segredos configurados são do lembrete/Web Push, não acesso SQL. Nenhum segredo foi impresso ou adicionado ao repositório.
- Sondagens reais: `/auth/v1/health` HTTP 200; `/rest/v1/`, `topics?select=id&limit=1` e `study_sessions?select=id&limit=1` HTTP 401; consultas às tabelas retornaram `42501` (permissão negada). Isso demonstra conectividade/restrição anônima, **não** contagens, schema completo ou isolamento entre duas contas.
- Nenhuma escrita no banco real, migration, exportação privada, backup de produção ou restauração foi executada. Não há sessão pessoal nem credencial administrativa para isso.

### Decisão do gate e limite de autorização

**Auditoria de produção: pendente, não concluída.** O inventário do repositório e o plano de compatibilidade estão concluídos para permitir a exceção expressa da especificação: sem acesso, fornecer auditoria somente leitura, implementar o seguro no repositório e identificar o bloqueio. Assim, pode ser elaborada e testada localmente uma **migration candidata**, baseada exclusivamente no schema versionado auditado. Isso não a torna validada nem aplicável em produção. A operação remota continua bloqueada até auditoria autorizada, backup restaurável e homologação em clone.

### Catálogo e proteção do Edital

Inspeção do **arquivo** `supabase/seed.sql`: 5 provas históricas 2022–2026, 1 versão provisória CP-T/2026, 158 tópicos, **122 folhas**, 13 raízes, 16 temas de redação e zero pais órfãos. São contagens do arquivo, não de produção. Portanto 122 por si só não significa outro concurso: neste catálogo é o denominador de folhas do CP-T/2026.

O usuário informa **17/122**; a consulta privada não confirmou esse progresso. Não transformar essa declaração em fixture de produção, backfill ou passagens fictícias. `Edital.tsx` conta folhas com `topic_progress.status != 'nao_iniciado'`, o que significa assunto iniciado, não passagem concluída. Preservar integralmente `src/features/edital/`, árvore, IDs, status, notas, aulas e funções usadas pela aba. Cobertura por passagem será indicador separado. Não executar seed para instalar o recurso.

O plano novo deve selecionar `syllabus_versions` existente e suas folhas, validar `exam_id` correspondente no servidor e mostrar CP-T/2026 como referência provisória. Não criar versão/data 2027. Consultas novas filtram versão sem mudar globalmente `getTopics/useTopics`, utilizados pelo Edital.

### Inventário versionado e mapeamento

Sete migrations preexistentes: `20261023000001_schema.sql`, `20261023000002_rls_rpc.sql`, `20261023000003_storage.sql`, `20261024000004_storage_admin_upload.sql`, `20261024000005_answer_keys.sql`, `20261024000006_push_reminders.sql`, `20261026000007_notas_aulas.sql`. Definem 28 tabelas públicas; implantação efetiva depende de auditoria SQL.

| Entidade | Tabelas/colunas no SQL versionado | Antes real | Estratégia | Depois real / evidência |
|---|---|---|---|---|
| Perfil | `profiles(id,timezone,display_name,created_at)` | não acessível | reutilizar Auth/fuso | não aferido; 01/02 |
| Preferências | `user_settings(user_id,goal_correct,baseline_2026,exam_date,daily_review_cap,weekly_availability,writing_cadence,include_writing,min_new_topic_share,theme,reminder_enabled,reminder_time)` | não acessível | preservar; defaults só ausentes | não aferido; 01/06 |
| Edital | `exams`, `syllabus_versions(exam_id,year,status)`, `topics(syllabus_version_id,parent_id,ordinal)` | não acessível | seleção explícita; preservar IDs | não aferido; 01/seed |
| Progresso/notas | `topic_progress(user_id,topic_id,status,confidence,notes,notes_html,first_studied_at,last_studied_at,updated_at)` | 17/122 declarado; linhas desconhecidas | nenhuma conversão automática | não aferido; 01/07 |
| Sessões | `study_sessions(id,user_id,topic_id,started_at,ended_at,duration_minutes,kind,source,notes,retroactive,created_at)` | não acessível | só inserir sessão real ao finalizar uma vez | não aferido; 01 |
| Agenda | `study_blocks(scheduled_at,minutes,topic_id,status)`, `blocked_days(user_id,day,reason)` | não acessível | manter; não representam ciclo sequencial | não aferido; 01 |
| Questões | `questions`, `question_topics`, `user_question_topics`, `question_flags`, `question_reports` | 250 slots esperados; não aferidos | preservar IDs, OCR, relações N:N | não aferido; 01/05 |
| Correção | `answer_keys(question_id,status,source_file,booklet_color,imported_at)`; `question_attempts(selected_option,self_grade,key_status,is_correct,simulation_id,created_at)` | não acessível | fonte do servidor; sem gabarito inventado/reclassificação silenciosa | não aferido; 01/05 |
| Exercícios manuais | `topic_question_logs(user_id,topic_id,done,correct,logged_at)` | não acessível | agregados autodeclarados, não questões distintas identificadas | não aferido; 07 |
| Revisões | `review_cards(kind,algorithm,level,due_at,lapses,review_count)`, `review_events(client_event_id,previous_due_at,next_due_at,algorithm)`, `review_reschedule_log` | não acessível | manter estado/eventos/vencimentos | não aferido; 01/02/07 |
| Simulados | `simulations`, FK composta nas tentativas | não acessível | manter conclusão/conferência | não aferido; 01/02/05 |
| Redação | `writing_prompts`, `writing_submissions`, `writing_feedback` | não acessível | manter textos, versões e anexos | não aferido; 01/02/03 |
| Administração/lembretes | `admins`, `import_audit`, `push_subscriptions`, `reminder_bots` | não acessível | sem alterações | não aferido; 01/02/06 |

Ownership normalmente `user_id → auth.users`; `profiles` usa `id`, temas particulares usam `owner_id`. SQL possui RLS ENABLE/FORCE pessoal, catálogo somente leitura autenticada e gabaritos/admin/importação/bots inacessíveis ao usuário. FKs compostas protegem simulados/tentativas, cards/eventos e redação/feedback. Storage `provas` e `redacoes` privado, sem migração necessária.

### Fluxos, motores e limites

| Área | Encontrado | Integração necessária |
|---|---|---|
| Hoje | `useStudyData/useDerived`, `planner.ts`, sugestões explicadas e disponibilidade | manter legado desativado por usuário; plano ativo assume recomendação sem duas filas concorrentes |
| Edital/notas | árvore por folhas, Tiptap/autosave, RPC `concluir_assunto` | preservar integralmente |
| Agenda/estudos | timer local pausável, retroativas, check-in sequencial | preservar; ciclo usa transação/idempotência |
| Revisões | fila limitada, `review_card/reschedule_card`, aulas com resumo | agenda por tópico e roteiro ChatGPT, mesmo scheduler |
| Questões/simulados | tentativas reais, conferência privada no servidor | amostra/fonte/janela claras |
| Análise | heatmap, taxas, classificações | passagens, constância e aderência |
| Config | metas, horários, exportação e lembrete | plano sem apagar legado, ativação por usuário |

O SRS encontrado é **`interval-v1` `[1,3,7,14,30,60]`**, espelhado em TS/SQL. `kind='aula'` cria D+1 e usa o mesmo motor. Não existe sequência D+1/3/7/15/30/45 implementada. RPC faz row lock e evento idempotente; `review_events` imutável. Não refazer vencimentos ao adotar ciclos.

`f5d8121` já trouxe `verifiedDistinct` (último resultado verificado por questão), correção do sinal de dificuldade e separação de fontes nos gráficos. Preservar. Ainda faltam janela temporal, pesos configuráveis, cursor e critérios de passagem. Abaixo do mínimo, diagnóstico insuficiente; logs manuais não alimentam amostra verificada/distinta.

Consultas antigas limitam sessões a 2.000 e tentativas/cards a 5.000, além do limite REST. Métricas completas exigem paginação/agregação autorizada. `getTopics` não filtra versão. Fluxos antigos gravam sessão/progresso/card separadamente, não servem como conclusão transacional. O trigger atual de gabarito não cobre UPDATE direto somente de `is_correct/key_status`: testar/proteger a proveniência via REST sem recalcular dados antigos antes de declarar métricas resistentes à adulteração.

### Armazenamento local e backup

`localStorage`: `timer-v1`, tema, sessão Auth e rascunhos de autosave; não há IndexedDB no código. Navegador pessoal não acessado, pendências desconhecidas. Não limpar ou reimportar chaves. Exportação de rascunhos/timer deve excluir tokens Auth e usar IDs estáveis; timer sem owner exige identificação explícita, sem atribuição automática.

Backup v1 exporta `topic_progress`, `study_sessions`, `question_attempts`, `question_flags`, `review_cards`, `review_events`, `writing_submissions`, `blocked_days`, `user_settings`. Omite relações/tabelas/anexos; restauração não restaura settings e remove vínculo de simulado. **Não é backup PostgreSQL restaurável de produção.** Antes de implantação: dump apropriado fora do Git, manifestos de schema/contagem/IDs/owners/timestamps, objetos Storage quando necessários, restauração em destino isolado e migration em clone. Não executado nesta sessão. Rollback por desativação e versão anterior do app; não apagar eventos/tabelas.

### Modelo mínimo acordado para implementação candidata

1. `study_plans`: concurso/versão, ativação, configurações específicas versionadas, cursor `item_id`, revisão de concorrência, número do ciclo. Pode incorporar `study_cycles` sem tabela equivalente duplicada.
2. `study_cycle_items`: folhas da versão, ordem editável, passagem alvo, orçamento/residual, pausa/motivo; preservar registros históricos.
3. `topic_passages`: chave única usuário+versão+tópico+passagem, checklist/evidência e reabertura auditada; nenhum backfill automático.
4. `guided_study_sessions`: running/paused/finished e timer servidor; finalizar insere exatamente uma `study_sessions` e referencia ID. Não inflar agregados antigos com sessões em execução nem copiar sessões antigas para eventos.
5. `study_plan_events`: append-only, idempotência por usuário e histórico de cursor/configuração/passagem. Exceções por data precisam chave/data/plano e histórico; podem integrar esse modelo se sem perder rastreabilidade.

Preferências comuns continuam em `user_settings`; alteração apenas por confirmação explícita do usuário com auditoria old/new. Evitar horários contraditórios entre Agenda e Meu plano. RPC restrita com auth, search_path seguro, row lock, expected revision, idempotência, FKs compostas e validação de versão/folha/owner. Impedir UPDATE/INSERT direto de estados pelo REST que burle checklist/cursor. Testar dois requests com chaves distintas e duas abas.

Passagens só concluem com checklist e evidência própria vinculada ao tópico. Minutos/estudo parcial/revisão isolada não concluem. Matéria exige todas as folhas obrigatórias. Pular por hoje mantém pendência; reorder conserva cursor por ID. Reabertura conserva eventos anteriores. Vínculo de sessão antiga é opcional, sem duplicação ou troca de ID.

### Revisões realizadas no ChatGPT

Direção adicional recebida em 03/11: usuário revisa no ChatGPT e precisa saber **o que revisar e quando**. Priorizar assuntos vencidos/próximas datas, motivo, notas e roteiro copiável. Não exigir flashcards, criar integração paga nem enviar notas automaticamente a terceiros.

Roteiro: tópico e notas pessoais, recordação ativa, questões graduais/exercícios, correção fundamentada sem inventar gabarito oficial. Conclusão com dificuldade 0–5 reutiliza `review_card`, ID estável para retry; mostrar data retornada após persistência. Agrupar cards por tópico visualmente não autoriza concluir todos em lote. Cards antigos continuam acessíveis.

Após conteúdo novo, oferecer agendar aula D+1 usando `review_cards.kind='aula'` e UNIQUE `(user_id,topic_id) WHERE kind='aula'`. Se já existir, preservar due_at/algoritmo/nível/histórico. **Não usar `concluir_assunto` apenas para agendar**, pois altera progresso do Edital. Operação específica insere aula ausente com ownership/idempotência; não conclui passagem por consequência. Intervalos são locais, não fórmula proprietária do Método Papiro.

### SQL somente leitura pendente

Executar `supabase/auditoria_somente_leitura.sql` com conexão autorizada. Já cobre tabelas/colunas/RLS/policies/constraints/índices/triggers/funções e gera contagens. Complementar abaixo, adaptando nomes ao inventário real. Resultados privados completos fora do Git. **Não executado no banco hospedado.**

```sql
BEGIN READ ONLY;
SELECT v.year,v.label,v.status,count(t.id) AS topicos,
 count(t.id) FILTER (WHERE NOT EXISTS (
  SELECT 1 FROM public.topics c WHERE c.parent_id=t.id
  AND c.syllabus_version_id=v.id)) AS folhas
FROM public.syllabus_versions v LEFT JOIN public.topics t
 ON t.syllabus_version_id=v.id
GROUP BY v.id,v.year,v.label,v.status ORDER BY v.year;
SELECT count(*) AS pais_orfaos FROM public.topics t
 LEFT JOIN public.topics p ON p.id=t.parent_id
 WHERE t.parent_id IS NOT NULL AND p.id IS NULL;
SELECT count(*) AS pais_outra_versao FROM public.topics t
 JOIN public.topics p ON p.id=t.parent_id
 WHERE p.syllabus_version_id<>t.syllabus_version_id;
SELECT count(*) AS progressos_orfaos FROM public.topic_progress p
 LEFT JOIN public.topics t ON t.id=p.topic_id WHERE t.id IS NULL;
SELECT count(*) AS eventos_cruzados FROM public.review_events e
 LEFT JOIN public.review_cards c ON c.id=e.card_id
 WHERE c.id IS NULL OR c.user_id<>e.user_id;
SELECT count(*) AS tentativas_cruzadas FROM public.question_attempts a
 LEFT JOIN public.simulations s ON s.id=a.simulation_id
 WHERE a.simulation_id IS NOT NULL AND (s.id IS NULL OR s.user_id<>a.user_id);
SELECT count(*) AS aulas_duplicadas FROM (
 SELECT user_id,topic_id FROM public.review_cards WHERE kind='aula'
 GROUP BY user_id,topic_id HAVING count(*)>1) d;
SELECT status,count(*) FROM public.topic_progress GROUP BY status;
SELECT algorithm,kind,count(*) FROM public.review_cards GROUP BY algorithm,kind;
SELECT key_status,is_correct,count(*) FROM public.question_attempts
 GROUP BY key_status,is_correct;
SELECT t.typname,e.enumlabel,e.enumsortorder FROM pg_type t
 JOIN pg_namespace n ON n.oid=t.typnamespace JOIN pg_enum e ON e.enumtypid=t.oid
 WHERE n.nspname='public' ORDER BY t.typname,e.enumsortorder;
SELECT grantee,table_name,privilege_type FROM information_schema.role_table_grants
 WHERE table_schema='public' AND grantee IN ('anon','authenticated')
 ORDER BY table_name,grantee,privilege_type;
SELECT c.relname,c.reloptions FROM pg_class c
 JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relkind IN ('v','m');
SELECT p.proname,pg_get_function_identity_arguments(p.oid),p.prosecdef,p.proconfig
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' ORDER BY p.proname;
-- Exemplo de manifesto: repetir para cada tabela pessoal e preservar
-- o conjunto legado ao comparar após novos eventos legítimos.
SELECT count(*) AS total,
 md5(coalesce(string_agg(md5(jsonb_build_array(id,user_id,created_at)::text),
 '' ORDER BY id),'')) AS identidade_owner_criacao FROM public.study_sessions;
SELECT count(*) AS total,
 md5(coalesce(string_agg(md5(to_jsonb(p)::text),'' ORDER BY user_id,topic_id),''))
 AS conteudo_integral_progresso FROM public.topic_progress p;
ROLLBACK;
```

Checar demais FKs conforme constraints reais. Hash é evidência de comparação, não backup nem autorização para publicar dados sensíveis; guardar manifestos reais fora do Git.

### Testes necessários e bloqueios

Existem Vitest domínio/UI/Auth, PGlite com roles/`auth.uid()` simulados, RLS/RPC/gabaritos/aulas e Playwright smoke/PWA. O harness carrega explicitamente cinco migrations de dados, sem Storage; incluir candidata nele. E2E existente não faz login no banco hospedado nem prova ciclos persistentes.

Verificar: migration candidata duas vezes; fixture legada antes/depois (IDs/owners/timestamps/notas); parcial→refresh→retomar; checklist/evidência; retry após resposta perdida; duas abas e revisão conflitante; escrita direta/RPC/FKs cruzadas; fontes/amostra/janela; São Paulo/semana/pausas; tópicos sem questões; revisão por assunto sem nova passagem; erro de rede sem falso sucesso; build/Pages e Edital sem regressão. Resultados reais dessa execução pertencem a `VALIDACAO_IMPLANTACAO.md`.

Continuam bloqueados: schema/contagens privadas e 17/122 não confirmados, backup/restauração/clone de produção, aplicação SQL e duas contas no Supabase hospedado. Não declarar migração, rollout ou aceite integral enquanto desconhecidos.

## Registro histórico de 02/11/2026 (limitações atualizadas acima)

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
