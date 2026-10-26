# Decisões

| Tema | Decisão | Motivo |
|---|---|---|
| Roteamento | `HashRouter` | Refresh/deep link no Pages sem rewrite |
| Auth | Fluxo **PKCE**; `redirectTo` = raiz do site (sem hash) | O fluxo implícito devolve `#access_token`, que colide com o HashRouter |
| Imagens das provas | Bucket **privado** + URL assinada de 5 min | Direitos de redistribuição não confirmados |
| Material de prova no Git | Excluído (`dados/`, `referencias/`, `seed_questoes.sql`) | Idem; repositório pode ser público |
| SRS | `interval-v1` `[1,3,7,14,30,60]`, nível 0–6, em SQL (RPC) e TS (espelho testado) | Auditável, determinístico; FSRS só com migração de estado |
| Datas | Timestamps em UTC; vencimento = meia-noite local `America/Sao_Paulo` | "Dia" do aluno, sem misturar fusos/DST |
| Rating 5 | +2 níveis só com ≥ 2 revisões prévias; rating 3 mantém nível; 0–2 → nível 0 | Regras da especificação |
| Plano diário | Score explicável 0,35/0,25/0,20/0,10/0,10; "ajuste pessoal" = (5 − confiança)/5 | Pesos pedagógicos iniciais, não estatística da banca |
| Dificuldade por tópico | Só de questões **classificadas pelo usuário**; sem classificação = 0 | Não fabricar estatística |
| Pontuação | Gabarito oficial (SSPM) aplicado no servidor; autoavaliação continua opcional; anuladas marcadas e fora da conta | Nota efetiva = gabarito oficial > autoavaliação; não é a nota oficial do concurso |
| Redação | Temas autorais navais/nacionais (`official=false`); rubrica pedagógica editável | Sem nota oficial inventada |
| Editor OCR `/admin` | Não publicado | Exigiria papel de admin verificado no servidor; revisão por SQL/CLI |
| shadcn/ui | Componentes próprios em Tailwind (`src/components/ui.tsx`) no estilo shadcn | Menos dependências; podem ser trocados |
| Modo offline | Não implementado | Não prometer sync sem reconciliação |
| Lembrete diário | Web Push enviado por GitHub Actions agendado (30 min), autorizado por token próprio revogável (hash em `reminder_bots`), sem `service_role` | Sem servidor e sem expor chave privilegiada; trade-off: atraso de minutos e pausa do GitHub após 60 dias sem atividade |
| PWA | Service worker só do casco estático; sem `skipWaiting`; outras origens (Supabase) nunca interceptadas | Dados sempre frescos; versão nova não quebra abas abertas; não promete offline |
| Anotações e aulas | Resumo por assunto em HTML (`topic_progress.notes_html`, Tiptap); "Concluir assunto" cria 1 aula (`review_cards.kind='aula'`) pelo RPC `concluir_assunto`, reaproveitando `interval-v1`; sem backfill das notas antigas (`notes` é mostrado escapado até a primeira edição) | Sem segundo motor de revisão; HTML só é renderizado por Tiptap `editable:false`, nunca por `dangerouslySetInnerHTML` |
