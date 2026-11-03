# Regras de ciclos e passagens

As regras abaixo descrevem a implementação própria `cycles-v1` de `src/lib/cycles.ts` e o contrato SQL candidato. São regras locais auditáveis, não fórmulas proprietárias ou metodologia oficial de terceiros. Persistência em produção depende dos gates de [migração](MIGRACAO_PAPIRO_LIKE.md); os resultados de testes ficam em [validação](VALIDACAO_IMPLANTACAO.md).

## Edital, adoção e preferências

O plano usa exatamente os tópicos-folha da versão selecionada: tópico sem filhos nessa versão. Pais não entram novamente no denominador e um tópico sem questões continua obrigatório. O seed local de CP-T/Informática 2026 contém 158 nós e 122 folhas; a UI deve rotular essa edição como referência provisória, sem inventar edital/data oficial de 2027.

O progresso antigo da aba Edital mede assuntos iniciados pelo critério anterior. Não é uma primeira passagem confirmada. Adoção e sessão guiada não reescrevem seus status/notas nem inferem conclusão a partir de minutos. A aba e seus IDs são preservados.

A prévia é local e não grava. A ativação confirma versão, sequência e preferências exibidas, registrando o evento e configurações anteriores. Preferências comuns continuam em `user_settings`. Na ausência de valor, defaults: 120 min segunda–sexta, 0 no fim de semana, meta 40/50, revisão diária limitada a 20, amostra mínima de 10 distintas, alerta abaixo de 70%, janela de 30 dias. Zero minutos é escolha válida. Baseline 21/50 de 2026 é histórico declarado, nunca simulado recente. Data vazia significa a confirmar.

## Cursor, sessão e passagem

O cursor aponta o item atual a executar, identificado por ID. A rotação começa nele, percorre a sequência persistida e ignora itens concluídos, pausados ou pulados na data local. Reordenar preserva os IDs; faltar um dia não conclui nada. `Pular por hoje` exige motivo, mantém pendência e seleciona outro item; pausa não equivale a conclusão.

O timer tem estados `running`, `paused` e `finished`, uma sessão aberta por usuário. O navegador exibe estimativa; a RPC calcula os segundos ativos no servidor, preservando pausas. Finalizar insere exatamente uma sessão real em `study_sessions` e guarda seu ID no controle guiado. Retentativa do mesmo comando retorna o resultado idempotente; revisão de plano evita transições conflitantes. Uma sessão finalizada não é reinserida com uma segunda chave.

Salvar parcial conserva tempo/evidência e mantém a passagem em andamento. Cumprir o orçamento de minutos sozinho nunca conclui objetivos. A conclusão guiada exige confirmação de conteúdo/objetivos, autoavaliação registrada e notas; da passagem 2 em diante exige também prática/consolidação confirmada. Há unicidade por usuário+versão+tópico+número. Conclusão atualiza a etapa e avança o cursor na mesma transação.

| Passagem | Objetivo local |
|---|---|
| 1 | Compreensão, teoria, definições e exemplos |
| 2 | Fixação, revisão direcionada e exercícios/questões; exercício manual serve quando não há questões históricas |
| 3 e seguintes | Consolidação/manutenção com questões mistas, bibliografia e tratamento de erros |

A disciplina completa a passagem N quando todas as suas folhas a concluírem. O mapa mostra concluídos/total nas passagens 1, 2 e 3. A próxima passagem do plano só abre por ação explícita quando **todos** os itens obrigatórios terminarem a atual, inclusive os pausados; não pula pendências para inflar cobertura.

Equivalência de legado exige prévia de um assunto, progresso anterior elegível ou sessão real, justificativa de pelo menos 20 caracteres e confirmação. Cria somente a primeira passagem com origem `legacy_verified`; não cria sessão nova nem migra todo o histórico. Reabertura exige justificativa, volta a etapa a andamento e conserva eventos anteriores; o cursor retorna ao assunto. Não há conversão silenciosa em lote.

## Roteiro diário e prioridade

A disponibilidade considera horário salvo, dia bloqueado e exceção por data, além do seletor flexível 0/15/25/45/60/90/120 min de Hoje. O seletor ajusta o roteiro exibido; exceção persistente exige salvar data/minutos/motivo no plano. Com 0 minutos, a fila permanece visível sem criar débito ou eventos fictícios.

O motor reserva cobertura para o próximo item antes de consumir o backlog de revisão. Proporções padrão: revisão 12,5%, ciclo 37,5%, questões 37,5%, erros 12,5%, normalizadas quando editadas. São orçamentos, não duração comprovada de estudo. Cada revisão recebe estimativa de 2 min, respeitando limite diário; questões elegíveis recebem 3 min por padrão. Com até 25 min, reserva o bloco mínimo do ciclo e até 5 min para revisões devidas. Tempo sem tarefa elegível volta ao ciclo; não gera questão/card fictício.

Prioridade é a média ponderada dos fatores normalizados em [0,1]: atraso de revisão limitado a 14 dias (peso 0,30), lacuna de cobertura (0,25), dificuldade com evidência (0,20), tempo sem contato limitado a 30 dias (0,15), peso manual de 0,5 a 2 (0,10). Sem contato usa fator 1; sem amostra verificada suficiente, dificuldade é neutra 0,5 e o motivo informa diagnóstico pendente. Autoavaliação só pode substituir dificuldade por opção explícita; não é gabarito validado. Desempate: score decrescente, ordem do ciclo e ID.

A prioridade explica a sugestão e ordena tarefas elegíveis, sem substituir a reserva do cursor por uma fila interminável de fraquezas. As sugestões usam IDs reais do catálogo/fila. No roteiro, revisões são da fila SRS; questões novas elegíveis vêm do banco existente. Não há algoritmo de probabilidade de aprovação.

## Revisão no ChatGPT e SRS

O uso esperado é saber **qual assunto revisar e quando**, copiar o roteiro e conduzir a revisão no ChatGPT manualmente. Não há envio automático de notas nem API paga obrigatória. A tela deve permitir conferir assunto, vencimento e notas; cards antigos continuam acessíveis. Agrupar visualmente um assunto não autoriza concluir todos os cards em lote.

A conclusão usa o motor existente `interval-v1` e RPC `review_card` com dificuldade 0–5 e evento idempotente. Seus intervalos são 1/3/7/14/30/60 dias, não uma sequência inventada de outro método. A nova data só é sucesso após retorno da persistência. Uma revisão isolada não conclui passagem. Agendar revisão de conteúdo novo deve criar aula D+1 somente se ausente, preservando o vencimento e estado de uma aula existente e sem chamar a conclusão do Edital apenas para agendar.

## Desempenho e constância

A janela temporal é explícita. Tentativas totais e questões únicas são medidas diferentes; repetir uma questão aumenta tentativas, mas não a amostra de questões distintas. O percentual verificado usa apenas tentativas com `key_status` válido/alterado e `is_correct` booleano; sem gabarito fica N/D. O percentual autodeclarado usa `self_grade` em medida separada. Nenhum gabarito é inventado ou importado para reclassificar silenciosamente o passado.

O percentual é calculado sobre tentativas classificadas na janela; a confiança do diagnóstico usa o número de questões distintas. Abaixo de 10 distintas por padrão, o status é amostra insuficiente e não dispara alerta forte. Questões com vários tópicos podem aparecer em mais de uma matéria, mas cada amostra distinta deduplica por ID; o agregado global não soma contagens de matérias. Sem vínculo permanece no agregado global e é indicado para classificação, sem associação arbitrária.

Constância considera uma sessão encerrada válida com minutos positivos na data local de início; duas sessões no mesmo dia contam um dia. Aderência é dias planejados com estudo/dias planejados até hoje, desconsiderando dias de disponibilidade zero e respeitando exceções. O motor calcula sequência atual e maior sequência de dias civis; revisão isolada não conta como dia de estudo nesta regra. Default de fuso: `America/Sao_Paulo`. Horas líquidas vêm de sessões salvas, nunca do orçamento planejado.

Os indicadores refletem registros carregados: consultas legadas têm limites de paginação e o serviço novo também limita resultados. Não prometer histórico completo em contas além desses limites antes de implantar paginação/agregação apropriada. Cenários remotos, restauração, RLS efetiva e adoção operacional permanecem sujeitos à validação documentada.
