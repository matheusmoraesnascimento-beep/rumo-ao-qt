# Anotações como página + aulas de revisão — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Editor rico por assunto do edital; "Concluir assunto" cria uma aula de revisão espaçada (motor SRS existente) e leva a `/revisoes`.

**Architecture:** Coluna `notes_html` em `topic_progress` + `kind='aula'` em `review_cards` + RPC atômico `concluir_assunto`. Frontend: página `/edital/:topicId` com Tiptap (mesma lista de extensões no editor e na leitura), autosave com rascunho local, diálogo de conclusão; Revisões ganha ramo para cards `aula`.

**Tech Stack:** React 19, Vite, TanStack Query, Supabase (SQL + RLS), Tiptap, Vitest + Testing Library, PGlite (testes de banco).

**Spec:** `docs/superpowers/specs/2026-10-26-anotacoes-aulas-revisao-design.md` (decisões numeradas 1–17 citadas abaixo como "D#").

## Global Constraints

- Sem `any`; sem `dangerouslySetInnerHTML`; leitura do resumo só via Tiptap `editable: false`.
- Algoritmo SRS inalterado: `interval-v1`, intervalos `1,3,7,14,30,60`, nota `0–5`, fuso `America/Sao_Paulo`, primeira revisão = `firstDueAt` (amanhã, meia-noite local).
- `topic_progress.notes_html text` com `check (char_length(notes_html) <= 200000)`; `notes` antigo nunca é apagado.
- `review_cards.kind text not null default 'card' check (kind in ('card','aula'))`; índice único parcial `(user_id, topic_id) where kind='aula'`.
- `topic_question_logs (id, user_id, topic_id, done int > 0, correct int null, logged_at)`, `correct <= done`, RLS por `user_id` como as demais tabelas privadas (enable + force).
- Concluir só em assunto-folha existente. Reconcluir: cronograma da aula intocado; status `estudando`/`nao_iniciado` → `revisando`; `consolidado`/`revisando` ficam.
- Rota `/edital/:topicId`; id inexistente ou não-folha → redireciona para `/edital`. Após concluir: navegação simples para `/revisoes`.
- Strings de UI em português, seguindo o tom existente. Tema/estilo: componentes de `@/components/ui`.
- Comandos de verificação do projeto: `npm run lint && npm run typecheck && npm run test`.

## Review Focus

1. Duplo clique em "Concluir" (ou duas chamadas simultâneas) → exatamente 1 aula e 1 evento de status (Task 1 + Task 5).
2. Nota antiga com `<script>`, `<`, `&` → aparece como texto, nunca como HTML executável (Task 2).
3. Falha de salvamento (offline): texto permanece na tela, aviso "não salvo", rascunho local recuperado ao reabrir (Task 3).
4. `/edital/<id inexistente>` e `/edital/<assunto pai>` → redireciona para `/edital` (Task 5).
5. Concluir com resumo vazio pede confirmação; `acertos > feitas`, só `acertos`, ou `feitas = 0` bloqueiam com mensagem (Tasks 2 e 5).
6. Reconcluir assunto `consolidado` não o rebaixa e não reagenda a aula; excluir a aula e reconcluir a recria (Task 1).

---

### Task 1: Migration, RPC `concluir_assunto` e testes de banco

**Files:**
- Create: `supabase/migrations/20261026000007_notas_aulas.sql`
- Modify: `tests/db/harness.ts` (adicionar o novo arquivo à lista de migrations carregadas)
- Modify: `tests/db/rls.test.ts:47` (incluir `'topic_question_logs'` em `priv`)
- Create: `tests/db/aulas.test.ts`

**Interfaces:**
- Produces (SQL): `concluir_assunto(p_topic_id uuid, p_done int default null, p_correct int default null, p_now timestamptz default now(), p_tz text default 'America/Sao_Paulo') returns public.review_cards` — `security invoker`, `search_path = public`. Devolve a aula (existente ou recém-criada).
- Produces (schema): colunas `topic_progress.notes_html`, `review_cards.kind`; tabela `topic_question_logs`.

- [ ] **Step 1: Escrever `tests/db/aulas.test.ts` (usa `createDb/createUser/asUser/err` de `./harness`, como `tests/db/lembretes.test.ts`).** Cenários, cada um um `it`:
  - `cria aula amanhã (SP) com front = nome do assunto, kind='aula', topic_id` e status vira `revisando` com `first_studied_at` preenchido.
  - `duas chamadas seguidas devolvem o mesmo card e deixam 1 aula` (count `review_cards where kind='aula'` = 1).
  - `reconcluir não altera due_at/level da aula` (rodar `review_card` com nota 4 antes; due_at igual depois).
  - `status consolidado permanece consolidado ao reconcluir`; `estudando` → `revisando`.
  - `excluir a aula e reconcluir cria outra`.
  - `grava log só quando p_done informado`: sem `p_done` → 0 linhas; `(10, 7)` → 1 linha; `(10, null)` → ok.
  - `rejeita`: assunto pai (tem filhos), id inexistente, `p_done=0`, `p_correct=5,p_done=3`, `p_correct` sem `p_done` — todos com `errcode 22023` (use `err`).
  - `isolamento`: usuário B não vê `topic_question_logs` de A e não consegue concluir como A (insert com `user_id` alheio falha).
  - `notes_html` acima de 200001 chars é rejeitado pelo check.
- [ ] **Step 2: Rodar `npx vitest run tests/db/aulas.test.ts` — esperado FAIL (função/colunas inexistentes).**
- [ ] **Step 3: Escrever a migration.** Colunas e check; `topic_question_logs` com RLS no mesmo padrão `do $$ foreach` de `20261023000002_rls_rpc.sql:56-75`; índice `uq_card_aula_por_assunto`; RPC `concluir_assunto`: valida folha (`not exists (select 1 from topics where parent_id = p_topic_id)`) e existência; valida `done/correct`; `insert into topic_progress ... on conflict (user_id, topic_id) do update` com `status = case when topic_progress.status in ('nao_iniciado','estudando') then 'revisando' else topic_progress.status end`, `first_studied_at = coalesce(...)`, `last_studied_at = coalesce(...)` (D5/D11); calcula `due` com a mesma conta de meia-noite local do `review_card` (`((p_now at time zone p_tz)::date + 1)::timestamp at time zone p_tz`); `insert into review_cards (user_id, topic_id, kind, front, due_at) ... on conflict (user_id, topic_id) where kind='aula' do nothing`; seleciona e retorna a aula; insere log se `p_done is not null`. Re-concluir também insere novo log (D16: uma linha por conclusão).
- [ ] **Step 4: Adicionar `'20261026000007_notas_aulas.sql'` ao array em `tests/db/harness.ts` e `'topic_question_logs'` a `priv` em `rls.test.ts`.**
- [ ] **Step 5: `npx vitest run tests/db` — esperado PASS (inclui suites antigas).**
- [ ] **Step 6: Commit** — `feat(db): notes_html, aulas de revisão e RPC concluir_assunto`.

### Task 2: Tipos, API e helpers puros de notas

**Files:**
- Modify: `src/types/db.ts` (`TopicProgress.notes_html: string | null`; `ReviewCard.kind: 'card' | 'aula'`)
- Modify: `src/lib/api.ts` (junto de `upsertProgress`, ~linha 53)
- Create: `src/lib/notas.ts`
- Test: `tests/notas.test.ts`

**Interfaces:**
- Produces (`src/lib/notas.ts`):
  - `plainToHtml(text: string): string` — escapa `& < > " '`, uma `<p>` por linha não vazia; vazio → `''`.
  - `initialNotesHtml(p: Pick<TopicProgress, 'notes' | 'notes_html'> | undefined): string` — `notes_html` se não-nulo (mesmo vazio, D15); senão `plainToHtml(notes ?? '')`.
  - `isEmptyNotes(html: string): boolean` — true se sem texto visível (só tags/espacos/`<p></p>`).
  - `validarQuestoes(done: string, correct: string): string | null` — mensagem de erro ou null. Campos vazios = ok; `done` inteiro ≥ 1; `correct` inteiro ≥ 0, exige `done`, `correct <= done`.
- Produces (`src/lib/api.ts`):
  - `saveNotesHtml(topicId: string, html: string): Promise<void>` — `upsertProgress({ topic_id, notes_html })` (preserva status/confiança: o upsert parcial não os sobrescreve; confirmar que `upsertProgress` já faz isso passando só campos fornecidos, caso contrário ler status atual).
  - `concluirAssunto(p: { topicId: string; done?: number; correct?: number }): Promise<ReviewCard>` — `supabase.rpc('concluir_assunto', { p_topic_id, p_done: done ?? null, p_correct: correct ?? null, p_tz: DEFAULT_TZ })`.

- [ ] **Step 1: Testes em `tests/notas.test.ts`:** `plainToHtml('a <script>alert(1)</script> & b')` não contém `<script>` e contém `&lt;script&gt;` e `&amp;`; duas linhas → duas `<p>`; `initialNotesHtml({notes:'x',notes_html:''})` = `''` e `({notes:'x',notes_html:null})` = `<p>x</p>`; `isEmptyNotes('<p></p>')` e `('<p> </p>')` true, `('<p>oi</p>')` false; `validarQuestoes('', '')` null, `('10','7')` null, `('10','')` null, `('', '5')` erro, `('3','5')` erro, `('0','')` erro, `('2.5','')` erro.
- [ ] **Step 2: `npx vitest run tests/notas.test.ts` — FAIL.**
- [ ] **Step 3: Implementar os tipos, `src/lib/notas.ts` e as duas funções de `api.ts`.**
- [ ] **Step 4: `npx vitest run tests/notas.test.ts && npm run typecheck` — PASS.**
- [ ] **Step 5: Commit** — `feat(notas): tipos, api e helpers de anotações`.

### Task 3: Autosave com rascunho local

**Files:**
- Create: `src/lib/useAutosave.ts`
- Test: `tests/useAutosave.test.tsx`

**Interfaces:**
- Produces: `useAutosave(opts: { storageKey: string; value: string; saved: string; save: (v: string) => Promise<void>; delayMs?: number }): { status: 'salvo' | 'salvando' | 'nao-salvo'; flush: () => Promise<void>; draft: string | null }`
  - `delayMs` padrão 1500. Quando `value !== saved`: grava `localStorage[storageKey]` imediatamente (try/catch), agenda `save(value)` com debounce. Sucesso → remove o rascunho, status `salvo`. Falha → status `nao-salvo`, mantém rascunho, reagenda nova tentativa em 5 s (D14). `flush` salva já (usado antes de concluir). `draft` = valor do rascunho existente no mount (null se não há), para a página iniciar o editor com ele.

- [ ] **Step 1: Testes com `vi.useFakeTimers()`:** não chama `save` antes do debounce e chama uma vez com o último valor depois; sucesso limpa `localStorage` e status `salvo`; `save` rejeitando → status `nao-salvo`, rascunho permanece, segunda tentativa após 5 s chama `save` de novo; no mount com rascunho pré-existente, `draft` o retorna; `flush` chama `save` imediatamente; localStorage lançando exceção não quebra o hook.
- [ ] **Step 2: Rodar — FAIL.**
- [ ] **Step 3: Implementar o hook.**
- [ ] **Step 4: Rodar — PASS.**
- [ ] **Step 5: Commit** — `feat(notas): autosave com rascunho local e retry`.

### Task 4: Editor Tiptap e leitura

**Files:**
- Modify: `package.json` (dependências `@tiptap/react`, `@tiptap/pm`, `@tiptap/starter-kit`, `@tiptap/extension-underline`, `@tiptap/extension-highlight`, `@tiptap/extension-table` (+ `-row`, `-cell`, `-header`), `@tiptap/extension-task-list`, `@tiptap/extension-task-item`; versões estáveis mais recentes, instalar com `npm i`)
- Create: `src/features/edital/extensoes.ts`
- Create: `src/features/edital/NotasEditor.tsx`
- Create: `src/features/edital/NotasLeitura.tsx`
- Modify: `tests/setup.ts` (polyfills de jsdom que o ProseMirror exige, ex.: `Range.prototype.getClientRects`, `document.elementFromPoint`, só se os testes falharem sem eles)
- Test: `tests/notas-editor.test.tsx`

**Interfaces:**
- Produces: `extensoes: Extensions` (StarterKit com H1–H3, Underline, Highlight, Table+Row+Cell+Header, TaskList+TaskItem) — **única lista usada por editor e leitura** (D13).
- `NotasEditor({ initialHtml, onChange, ariaLabel }: { initialHtml: string; onChange: (html: string) => void; ariaLabel: string }): JSX.Element` — toolbar com botões acessíveis (`aria-label`): Negrito, Itálico, Sublinhado, Título 1/2/3, Lista, Lista numerada, Tarefas, Código, Citação, Tabela, Destaque. Toolbar rola na horizontal no celular. Área editável `role="textbox"` com o `ariaLabel`.
- `NotasLeitura({ html }: { html: string }): JSX.Element` — Tiptap `editable: false`, mesma lista `extensoes`.

- [ ] **Step 1: Testes:** `NotasLeitura` com `<p>oi</p><table>…</table><mark>x</mark>` mostra "oi", a tabela e o destaque (nós não são descartados); com `<script>alert(1)</script><p>ok</p>` não existe `<script>` no DOM e "ok" aparece; `NotasEditor` renderiza botões "Negrito" e "Tabela" e `onChange` é chamado com HTML contendo `<strong>` depois de clicar em Negrito com texto selecionado (usar `editor` via interação do usuário; se seleção em jsdom for instável, inserir texto e acionar o comando pelo botão com `userEvent.keyboard('{Control>}b{/Control}')`).
- [ ] **Step 2: Rodar — FAIL.**
- [ ] **Step 3: Instalar dependências, implementar `extensoes.ts`, `NotasEditor.tsx`, `NotasLeitura.tsx`; estilos do conteúdo (`.notas-doc`, tabela com borda, tarefa com checkbox) em `src/index.css` seguindo as variáveis de cor existentes.**
- [ ] **Step 4: `npx vitest run tests/notas-editor.test.tsx && npm run typecheck` — PASS.**
- [ ] **Step 5: Commit** — `feat(notas): editor rico Tiptap e leitura segura`.

### Task 5: Página do assunto, conclusão e Edital

**Files:**
- Create: `src/features/edital/NotasPage.tsx` (default export, lazy)
- Create: `src/features/edital/ConcluirDialog.tsx`
- Modify: `src/features/edital/Edital.tsx` (folha navega para `/edital/${t.id}`; remover `sel`, `selTopic`, `TopicPanel` e imports mortos)
- Modify: `src/app/App.tsx` (rota `edital/:topicId` lazy)
- Test: `tests/notas-page.test.tsx`

**Interfaces:**
- Consumes: `initialNotesHtml`, `isEmptyNotes`, `validarQuestoes` (Task 2); `saveNotesHtml`, `concluirAssunto`, `upsertProgress` (Task 2/existente); `useAutosave` (Task 3); `NotasEditor` (Task 4); `qk`, `useTopics`, `useProgress`, `Checkin`.
- Produces: `ConcluirDialog({ topicName, onCancel, onConfirm }: { topicName: string; onCancel: () => void; onConfirm: (v: { done?: number; correct?: number }) => Promise<void> }): JSX.Element` — modal com campos "Questões feitas" e "Acertos" (opcionais), botão "Salvar e ir para revisões" (desabilitado enquanto envia), erro de `validarQuestoes` visível (`role="alert"`).
- `NotasPage`: título do assunto, voltar (histórico, fallback `/edital`), selects Situação e Confiança (comportamento do antigo `TopicPanel`), "Último estudo", `NotasEditor` com `initialHtml = draft ?? initialNotesHtml(progress)`, indicador `salvo/salvando/não salvo`, botão "Registrar estudo de teoria" (abre `Checkin` como antes), botão "Concluir assunto". Ao concluir: `flush()`; se `isEmptyNotes` mostra `confirm`-style aviso (usar o mesmo padrão `confirm()` já usado em `Revisoes.tsx`); abre `ConcluirDialog`; no `onConfirm` chama `concluirAssunto`, invalida `qk.progress` e `qk.cards`, navega para `/revisoes`.

- [ ] **Step 1: Testes (api mockada com `vi.hoisted` + `vi.mock('@/lib/api')`, como `tests/redacao.test.tsx`; `MemoryRouter` com `Routes`):** (a) assunto com `notes` antigo `'linha <b>'` e `notes_html: null` mostra o texto literal na tela; (b) id inexistente e id de assunto pai redirecionam para `/edital` (página sentinela no teste); (c) digitar chama `saveNotesHtml` após debounce e mostra "salvo"; falha mostra "não salvo" e o texto continua; (d) "Concluir assunto" com resumo vazio pede confirmação (recusar → nada chamado); (e) diálogo: `acertos > feitas` mostra erro e não chama `concluirAssunto`; campos vazios chama com `{}`; `feitas=10, acertos=7` chama com `{ topicId, done: 10, correct: 7 }`; após sucesso navega para `/revisoes`; (f) duplo clique em "Salvar e ir para revisões" chama `concluirAssunto` uma vez.
- [ ] **Step 2: Rodar — FAIL.**
- [ ] **Step 3: Implementar `ConcluirDialog`, `NotasPage`, ajuste de `Edital.tsx` e rota em `App.tsx`.**
- [ ] **Step 4: `npx vitest run tests/notas-page.test.tsx && npm run typecheck && npm run lint` — PASS.**
- [ ] **Step 5: Commit** — `feat(edital): página de anotações e conclusão de assunto`.

### Task 6: Aulas na tela de Revisões

**Files:**
- Modify: `src/features/revisoes/Revisoes.tsx` (card atual e lista "Próximos cards")
- Test: `tests/revisoes-aula.test.tsx`

**Interfaces:**
- Consumes: `NotasLeitura` (Task 4), `initialNotesHtml` (Task 2), `useProgress`, `useTopics`, `ReviewCard.kind`.
- Comportamento (D8, D12): se `cur.kind === 'aula'`: título = nome atual do assunto (`topics.name`, não `front`); corpo = `NotasLeitura` com `initialNotesHtml(progress do assunto)`; link "Editar resumo" para `/edital/${topic_id}`; os 6 botões de nota 0–5 aparecem direto (sem "Mostrar verso"); `rate` continua o mesmo (mesmo `eventId` idempotente). Resumo vazio → texto "(resumo vazio)" e link para editar. Na lista de próximos, aulas mostram o nome do assunto e `Badge` "aula"; excluir aula usa confirmação "Excluir esta aula? O assunto continua como está e pode ser concluído de novo." Cards `kind='card'` sem mudança.

- [ ] **Step 1: Testes (api mockada; `MemoryRouter`):** aula vencida mostra o resumo e os 6 botões sem "Mostrar verso"; usa nome atual do assunto mesmo se `front` diferente; clicar na nota 4 chama `reviewCard(cardId, 4, <uuid>, 'America/Sao_Paulo')` e reenvio após falha usa o mesmo `client_event_id`; card normal continua exigindo "Mostrar verso"; lista de próximos mostra Badge "aula"; recusar a confirmação de exclusão não chama `deleteCard`.
- [ ] **Step 2: Rodar — FAIL.**
- [ ] **Step 3: Implementar o ramo `aula` em `Revisoes.tsx`.**
- [ ] **Step 4: `npx vitest run tests/revisoes-aula.test.tsx && npm run lint && npm run typecheck && npm run test` — tudo PASS.**
- [ ] **Step 5: Commit** — `feat(revisoes): aulas de revisão com resumo do assunto`.

### Task 7: Documentação e verificação final

**Files:**
- Modify: `docs/TESTES.md` (linhas das novas suítes: `tests/db/aulas.test.ts`, `notas*.test.*`, `useAutosave`, `revisoes-aula`)
- Modify: `docs/DECISOES.md` (decisão: aula = `review_cards.kind='aula'`, motor `interval-v1` reaproveitado, Tiptap + HTML, sem backfill)
- Modify: `docs/ARQUITETURA.md` (rota `/edital/:topicId`, RPC `concluir_assunto`)

- [ ] **Step 1: Atualizar os três documentos.**
- [ ] **Step 2: `npm run lint && npm run typecheck && npm run test && npm run build` — todos passam.**
- [ ] **Step 3: Verificação manual no navegador (`npm run dev`):** escrever resumo formatado, recarregar, concluir com e sem questões, ver aula em `/revisoes` como amanhã, simular falha de rede e confirmar "não salvo" + recuperação do rascunho, testar no viewport mobile (toolbar rola, sem scroll horizontal da página).
- [ ] **Step 4: Commit** — `docs: anotações, aulas de revisão e testes`.

---

## Self-review

- **Spec coverage:** editor rico (T4), autosave/rascunho/retry D14 (T3), migração de notas antigas D3 (T2 `initialNotesHtml`, T5 teste a), aula única e atômica D4/D10 (T1), reconcluir/status D5/D11 (T1), log de questões D6/D16 (T1, T2 validação, T5 diálogo), página `/edital/:topicId` e redirecionamentos D7/D17 (T5), revisão da aula e exclusão D8/D12 (T6), limite e segurança do HTML D13 (T1 check, T4 leitura), aviso de resumo vazio D9 (T5), sem backfill (nenhuma tarefa cria), docs (T7). Sem lacunas.
- **Tipos:** `initialNotesHtml`, `isEmptyNotes`, `validarQuestoes`, `saveNotesHtml`, `concluirAssunto`, `useAutosave`, `NotasEditor`, `NotasLeitura`, `ConcluirDialog` têm a mesma assinatura em todas as tarefas que os usam.
- **Risco conhecido:** Tiptap em jsdom pode exigir polyfills (T4 prevê); o `upsertProgress` parcial precisa preservar `status`/`confidence` (T2 manda confirmar).
