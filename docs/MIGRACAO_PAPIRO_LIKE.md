# Migração para ciclos e passagens

## Estado em 03/11/2026

A auditoria do repositório e o plano de compatibilidade estão em [AUDITORIA_BANCO_E_APLICACAO.md](AUDITORIA_BANCO_E_APLICACAO.md). O schema privado do Supabase hospedado, suas contagens e o progresso pessoal 17/122 **não foram confirmados**: as consultas anônimas às tabelas retornaram 401/42501. Nenhuma migration, seed, backfill ou restauração foi executada em produção nesta etapa.

O SQL `20261103000008_cycles_passages.sql` é uma **proposta local** baseada nas migrations versionadas e submetida a testes locais. Está mantido em `supabase/proposals/`, fora da sequência automática de migrations, até concluir os gates abaixo. Uma execução local com fixtures não equivale a testar um clone da produção. Resultados dos testes e do frontend estão em [VALIDACAO_IMPLANTACAO.md](VALIDACAO_IMPLANTACAO.md).

## Compatibilidade da proposta

| Estrutura | Operação proposta | Preservação |
|---|---|---|
| `exams`, `syllabus_versions`, `topics` | Somente leitura; selecionar versão e todas as folhas | Não recriar catálogo, IDs ou edital; não executar seed para adotar ciclos |
| `topic_progress`, notas/aulas e Edital | Nenhum backfill automático | Status, notas e 17/122 declarado não viram passagem silenciosamente |
| `study_sessions` | Inserir apenas ao finalizar sessão guiada real | Sessões antigas mantêm IDs, owner, timestamps e conteúdo; nenhuma cópia fictícia |
| `user_settings` | Atualizar horários/metas/limite somente ao confirmar plano | Prévia não grava; evento do plano registra configuração e valores anteriores |
| `review_cards`, `review_events` | Reutilizar scheduler/eventos existentes | Conservar `interval-v1`, nível e vencimentos; revisão não cria passagem |
| Questões, tentativas, simulados, redações e anexos | Reutilizar fluxos existentes | Sem importar questões, alterar gabaritos ou reclassificar histórico |
| `study_plans`, `study_cycle_items` | Novos plano/cursor/revisão e sequência | Um plano ativo por usuário; troca de versão conserva o plano anterior |
| `guided_study_sessions`, `topic_passages`, `study_plan_events` | Novos timer/etapas/eventos de controle | Estado único por usuário+versão+tópico+passagem e idempotência por evento |

As novas tabelas pessoais têm RLS e leitura por proprietário. Escritas devem passar pela RPC `study_plan_command`, com autenticação, bloqueio transacional por usuário, validação de ownership/versão, chave idempotente e revisão otimista nas transições pertinentes. O navegador não recebe permissão para forjar passagem por INSERT/UPDATE direto. Esses controles dependem da instalação validada do SQL; não foram auditados no ambiente hospedado.

Equivalência legada é uma ação explícita por assunto: prévia, histórico elegível, justificativa e confirmação criam apenas a passagem 1 como `legacy_verified`. Reabrir conserva os eventos anteriores e exige justificativa. Não há conversão em lote automática nem migração de armazenamento local.

## Gates antes de instalar em produção

1. **Auditar o destino correto em leitura.** Executar `supabase/auditoria_somente_leitura.sql` com conexão autorizada e complementar o inventário de constraints, policies, grants, triggers, funções, enumerações, versões e FKs. Conferir a versão real e suas folhas, owners, órfãos, cards duplicados e integridade de tentativas/simulados. Guardar resultados privados fora do Git; publicar apenas resumos agregados.
2. **Gerar backup restaurável.** Usar as ferramentas PostgreSQL/Supabase apropriadas ao ambiente para schema, dados e objetos Storage necessários. Armazenar fora do repositório, com acesso restrito, identificação do projeto, instante e versão. O JSON de Config é exportação parcial e não substitui um dump/restauração PostgreSQL.
3. **Restaurar em destino isolado.** Comprovar login, catálogo, notas, sessões, revisão, questões e anexos nesse destino. Registrar comando, ferramenta/versão, horário e evidência; backup sem teste de restauração não fecha este gate.
4. **Testar a candidata no clone.** Comparar o schema real com a proposta antes de promovê-la a `supabase/migrations/`. Executar em homologação e repetir a aplicação para conferir a idempotência. Repetir RLS/REST com duas contas reais, duas abas, retry após resposta perdida e rejeição de referências cruzadas. Uma divergência bloqueia a aplicação, não autoriza reset.
5. **Comparar os dados legados.** Para cada tabela pessoal, registrar totais e manifesto estável de IDs, owner, `created_at` e conteúdo relevante antes/depois; verificar FKs, notas e vencimentos. Aumento de contagem só por ações novas explicitamente realizadas. Guardar manifestos privados fora do Git. Pausar se houver linha perdida, owner alterado ou timestamp reescrito sem autorização.
6. **Instalar e observar com escopo reduzido.** Somente após os gates, aplicar a migration revisada ao projeto confirmado, registrar seu identificador e resultado e ativar primeiro um plano da conta de teste autorizada. O frontend pode ser publicado antes: sem tabelas/RPC compatíveis, o guard deve manter ativação indisponível e permitir o fluxo anterior.

Pendentes nesta sessão: acesso privado de auditoria, manifestos antes/depois reais, backup restaurável, restauração, clone, aplicação da proposta e teste com duas contas no Supabase hospedado.

## Rollout e retorno seguro

A adoção é por usuário: prévia não persiste; ativar cria/atualiza plano e confirma preferências mostradas. Manter a conta antiga, a aba Edital e os demais módulos acessíveis. Uma atualização do frontend ou deploy Pages não instala SQL.

Se o recurso apresentar falha, suspender sua ativação e usar o painel/agenda anteriores. Em Meu plano, desativar os ciclos preserva plano, sessões, passagens e eventos e permite voltar ao fluxo anterior. A reativação é explícita; finalize a sessão aberta antes de trocar esse estado. Não usar exclusão como rollback. Também é possível republicar o último frontend validado, mantendo as tabelas e eventos aditivos. Identificar o commit e os dados escritos desde a ativação antes de recuar.

Não oferecer um `down` com DROP/DELETE como retorno padrão. Reverter o frontend não desfaz uma sessão legítima nem restaura preferências alteradas por confirmação; se necessário, conferir o evento com valores anteriores e restaurar pontualmente com rastreabilidade. Restauração integral é procedimento de recuperação de incidente, em destino isolado e com reconciliação dos dados posteriores ao backup, para não apagar estudo recente.
