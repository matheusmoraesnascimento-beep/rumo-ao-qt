# Anotações como página + aulas de revisão espaçada — design

Data: 2026-10-26 · App: Rumo ao QT (React 19 + Vite + Supabase + TanStack Query + Tailwind, PWA)

## Intenção
Hoje, cada assunto do edital (folha da árvore em `Edital.tsx`) tem uma caixa de texto pequena ("Anotações (Markdown simples)"). O usuário quer escrever ali um **resumo real do que aprendeu**, como uma página de Word. Ao **concluir** o assunto, esse resumo vira uma **aula de revisão** agendada por repetição espaçada, para reler o próprio resumo nos intervalos certos.

## Fluxo aprovado (mockup aprovado pelo usuário em 2026-10-26)
1. Usuário clica num assunto-folha no Edital → abre a **página de anotações** com editor rico, autosave e botão "Concluir assunto".
2. "Concluir assunto" → passo 1: pergunta **quantas questões fez** sobre o assunto (feitas e acertos; **opcional**, pode deixar em branco e pular).
3. Salvar → vai **direto para a aba Revisões**, onde a aula já aparece agendada.
4. Cada revisão é uma "aula": mostra o resumo do assunto; o usuário relê e dá a nota; a nota define o próximo intervalo.

## Objetivos
- Editor rico tipo documento: negrito/itálico/sublinhado, títulos H1–H3, listas (marcadores, numeradas, tarefas), código, citação, tabela, destaque. Autosave. Funciona no celular (PWA).
- Concluir assunto cria 1 aula de revisão por assunto, agendada pelo mecanismo SRS que já existe.
- Registro opcional de questões feitas/acertos por assunto ao concluir.
- Notas antigas (texto plano em `topic_progress.notes`) continuam aparecendo e não são perdidas.

## Não-objetivos (v1)
- Sem colaboração/compartilhamento, sem exportar para Word/PDF, sem imagens coladas no editor, sem versionamento do texto.
- Sem teste ativo (perguntas/cloze) dentro da aula; a revisão é reler + nota. Cards manuais de frente/verso existentes continuam como estão.
- Sem mudar o painel Análise para usar as questões registradas (só guardar o dado).

## Anti-objetivos
- Perder anotações já escritas.
- Criar aulas duplicadas do mesmo assunto, ou contar revisão em duplicidade (idempotência já existe no RPC `review_card`; manter).
- Salvar HTML não confiável que execute script (XSS).

## Decisões do usuário
- Anotações como página estilo Word, concluir gera revisão espaçada baseada em neurociência.
- Após concluir: questões feitas é opcional; em seguida vai direto à lista de revisões.

- Aulas só nascem ao clicar em "Concluir assunto". **Sem backfill**: assuntos já marcados como revisando/consolidado não ganham aula automaticamente.

## Minhas decisões (marcadas como minhas; ajustar se discordar)
1. **Reusar o motor SRS existente** (`interval-v1`: 1, 3, 7, 14, 30, 60 dias; nota 0–5 com `RATING_LABELS`; RPC `review_card`) em vez dos 4 botões e intervalos do mockup. Motivo: consistência e zero código novo de agendamento. A tela de revisão da aula usa os mesmos 6 botões.
2. **Editor: Tiptap** (`@tiptap/react` + StarterKit + extensões de tabela, tarefa, sublinhado, destaque). Conteúdo salvo como **HTML** em coluna nova `topic_progress.notes_html`. A leitura (aula) renderiza com o próprio Tiptap em modo somente leitura (schema restringe nós/marcas), sem `dangerouslySetInnerHTML`.
3. **Migração das notas antigas**: se `notes_html` é nulo, o editor abre com `notes` (texto plano) convertido em parágrafos; no primeiro salvamento grava `notes_html`. `notes` não é apagada.
4. **Aula = linha em `review_cards`** com coluna nova `kind text not null default 'card' check (kind in ('card','aula'))`; `front` = nome do assunto, `back` vazio, `topic_id` preenchido. Índice único parcial `(user_id, topic_id) where kind='aula'` evita duplicata. Primeira revisão: `firstDueAt` (amanhã, fuso America/Sao_Paulo).
5. **"Concluir"** muda `topic_progress.status` para `revisando` e define `first_studied_at`/`last_studied_at` se vazios. Concluir de novo um assunto que já tem aula: não cria outra; só atualiza o texto (a aula lê sempre as notas atuais).
6. **Questões feitas/acertos**: tabela nova `topic_question_logs (id, user_id, topic_id, done int > 0, correct int null, logged_at)` com RLS por `user_id` como as demais. Campos vazios = nada gravado. `correct <= done`.
7. **Layout**: clicar numa folha abre página dedicada em rota `/edital/:topicId` (largura total, botão voltar), em vez do painel lateral estreito. Árvore do Edital permanece.
8. **Revisões**: se o card é `kind='aula'`, o passo "Mostrar verso" é substituído por exibir o resumo (somente leitura, botão "Editar resumo" leva à página do assunto) e as notas 0–5 aparecem direto abaixo. Cards `kind='card'` não mudam.
9. Concluir com resumo vazio mostra aviso e pede confirmação.

10. **Concluir = um único RPC atômico** (`concluir_assunto`): atualiza status/datas, cria a aula com `on conflict do nothing` e grava o log de questões opcional, tudo numa transação. Duplo clique é seguro.
11. **Reconcluir**: cronograma da aula não muda; status volta para `revisando` se estava `estudando`/`nao_iniciado`, e `consolidado` fica como está. Checkin existente não mexe em aulas.
12. **Excluir aula**: permitido na lista de Revisões (com confirmação); o assunto continua `revisando` e reconcluir recria a aula. Aulas e cards contam igual nos lembretes/contagens. `front` é só snapshot; a UI mostra o nome atual do assunto (`topics.name`) para aulas. Cards criados pelo Checkin continuam `kind='card'`.
13. **HTML**: `check (char_length(notes_html) <= 200000)`. Editor e leitor usam a mesma lista de extensões Tiptap (tabela e destaque incluídos). Leitura só via Tiptap, sem `dangerouslySetInnerHTML`.
14. **Autosave**: debounce, e ao falhar mantém o texto na tela com aviso "não salvo" e tenta de novo; rascunho local (localStorage) como rede de segurança até confirmar o salvamento. Conflito entre dispositivos: último a salvar vence (sem versionamento).
15. **`notes_html` vazio mas não nulo** (usuário apagou tudo): fica vazio; `notes` antigo não reaparece.
16. **Log de questões**: uma linha por conclusão. Só `correct` preenchido ou `correct > done`: o formulário bloqueia com mensagem. Sem tela para ver os logs na v1.
17. **Rotas**: "Editar resumo" na aula leva a `/edital/:topicId`; "voltar" usa histórico, com fallback para `/edital`. Id inexistente ou assunto que não é folha → redireciona para `/edital`. Depois de concluir, navegação simples para `/revisoes` (sem destaque).

## Restrições do código existente
- Padrões do repo: componentes em `src/features/*`, dados via `src/lib/api.ts` + `src/lib/queries.ts` (`qk`), UI em `src/components/ui.tsx`, tipos em `src/types/db.ts`, migrations em `supabase/migrations/` (próxima: `20261026…`).
- Sem `any`. SRS em `src/lib/srs.ts` é espelho do SQL `review_card`; não alterar o algoritmo.
- Testes: Vitest + Testing Library em `tests/`, Playwright em `tests/e2e`. Adicionar testes para a nova lógica e telas.
- Versionamento de commit/push: ver CLAUDE.md do usuário (perguntar o tipo antes).

## Deixado para o construtor
Escolha exata das extensões Tiptap, estilo visual da barra de ferramentas (seguir o tema atual), debounce do autosave, texto das mensagens, como mostrar a aula quando o assunto tem notas muito longas, testes.

## Critérios de pronto
- Escrevo um resumo formatado num assunto, recarrego a página e ele está lá; notas antigas aparecem.
- Concluir (com ou sem questões) leva às Revisões e a aula aparece como "amanhã".
- Avaliar a aula reagenda conforme `interval-v1`; avaliar duas vezes por reenvio não duplica.
- `npm test` e type-check passam; migration aplica limpa.
