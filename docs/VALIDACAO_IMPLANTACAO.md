# Validação e implantação

## Estado verificável em 03/11/2026

A implementação está sendo validada localmente. A proposta SQL de ciclos **não foi aplicada ao Supabase hospedado**. Nenhum backup restaurável, restauração, clone de produção, contagem privada antes/depois ou teste multiusuário remoto foi concluído. Não há aceite integral de migração.

| Evidência | Resultado e limite |
|---|---|
| Baseline Git antes da evolução | `main` atualizado por fast-forward de `de988cff9` a `f5d81210c39a99fe44021c8c3fe0f10e948649eb` |
| Deploy anterior | GitHub Actions `41432094962`, sucesso no baseline `f5d8121`; não contém esta evolução |
| Site anterior | <https://matheusmoraesnascimento-beep.github.io/rumo-ao-qt/> |
| Saúde Auth público | `/auth/v1/health`: HTTP 200; não prova acesso aos dados pessoais |
| REST anônimo | `/rest/v1`: 401; consultas mínimas a `topics` e `study_sessions`: 401/42501; nenhum conteúdo pessoal obtido |
| Catálogo no seed local | 158 nós, 122 folhas, 13 raízes, CP-T/Informática 2026; não prova contagens hospedadas |
| Progresso 17/122 | Declarado pelo usuário; não verificado no banco nesta sessão |
| Segredos de frontend | Configuração usa apenas valores públicos VITE; nenhuma credencial PostgreSQL disponível para auditoria/migração |
| SQL candidato | Proposta local; aplicação remota pendente dos gates de migração |
| Deploy desta evolução | **Pendente**: registrar commit, run, URL e smoke após conclusão real |

Verificações direcionadas iniciais informadas pelo executor: **8 testes de banco, 32 de domínio e 12 de UI/utilitários de revisão passaram**. São resultados intermediários; não substituem a suite final após as últimas alterações.

## Comandos desta evolução

Resultados devem ser preenchidos após o processo encerrar com código de saída conhecido. Não executar checks simultâneos que disputem memória/portas e não confundir uma execução anterior com o código final.

| Comando | Resultado desta evolução |
|---|---|
| `npm run lint` | `eslint src tests scripts`: 0 erros (03/11/2026; `eslint .` falha por varrer `.claude/worktrees`) |
| `npm run typecheck` | 0 erros (03/11/2026) |
| `npm test` | `vitest run tests/`: 24 arquivos passaram, 1 ignorado; 270 testes passaram, 16 ignorados (03/11/2026). Node 23.0.0 local exige shim zstd (`NODE_OPTIONS=--require`) para jsdom; CI usa Node 22 |
| `npm run build` | passou (03/11/2026) |
| `npm run test:e2e` | Pendente de evidência final; distinguir smoke/PWA de fluxo autenticado |
| Workflow Pages e smoke da URL | Pendente para esta evolução |

Registro histórico de **02/11/2026**: build e lint passaram, Vitest passou com 190 testes em 15 arquivos. Os 22 casos E2E daquele registro exibiram `ok`, mas o encerramento ainda era aguardado ao documentá-los. Esses resultados não validam a evolução atual de ciclos.

## O que precisa de demonstração

Os testes de domínio verificam regras puras; PGlite verifica o SQL versionado com roles/`auth.uid()` simulados. Nenhum deles prova equivalência com o banco hospedado. Os E2E smoke sem login também não comprovam persistência com conta preexistente.

Conferir e registrar o resultado efetivo de: aplicação/reaplicação da proposta, fixture legada antes/depois, partial→refresh→resume, checklist e evidência, conclusão/retry idempotente, conflito entre abas, REST e RPC com owners diferentes, FKs cruzadas, proveniência de gabarito, janelas e amostra distinta, São Paulo, fim de semana, bloqueios e exceções. Revisar assunto no ChatGPT deve atualizar somente SRS, com próxima data após confirmação, sem contar outra passagem.

No navegador autenticado de homologação: confirmar login anterior, Edital/IDs/notas/progresso intactos, prévia sem escrita, ativação explícita, retomada de timer, falha de rede sem falso sucesso, equivalência/reabertura auditadas, disponibilidade 0/15/25/120 min, tópicos sem questões, mapa/diagnóstico, revisão por assunto/data, mobile e teclado. Exercitar questões, simulados, redação, agenda e exportação para regressão. **Estes são itens de verificação, não resultados aprovados.**

## Publicação e aceite operacional

O workflow `.github/workflows/deploy.yml` executa instalação, lint, typecheck, testes, build com base path, varredura de segredos, deploy Pages e smoke HTTP/título. Não executa migrations Supabase. Registrar novo run e commit após sucesso; o frontend publicado pode continuar com ciclos desativados enquanto o banco aguarda auditoria/backup/clone.

Antes de declarar adoção completa, preencher o manifesto de cada tabela pessoal com contagens reais antes/depois e preservação de IDs/owners/timestamps, evidência de restauração, aplicação em clone, migration remota e RLS com duas contas. Seguir [MIGRACAO_PAPIRO_LIKE.md](MIGRACAO_PAPIRO_LIKE.md) para rollout e retorno conservador. Nenhum desses gates deve ser inferido de um deploy verde.
