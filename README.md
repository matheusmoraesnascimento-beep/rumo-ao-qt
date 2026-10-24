# Rumo ao QT

Plataforma pessoal de estudos para o **CP-T / Quadro Técnico (Informática) da Marinha — edição 2027**.
Ferramenta independente de estudos. Não oficial e sem vínculo com a Marinha do Brasil.

- **Front-end:** React 19 + TypeScript + Vite + Tailwind, `HashRouter`, TanStack Query, React Hook Form + Zod, Recharts.
- **Back-end:** Supabase (Auth, Postgres com RLS, Storage privado). Sem servidor próprio.
- **Hospedagem:** GitHub Pages, publicado por GitHub Actions.
- **Gabaritos:** não existem em nenhum arquivo, tabela ou imagem. Respostas são registradas e **autoavaliadas** (autodeclaradas).

> `21/50` (2026) é só a **linha de base histórica declarada**. A pontuação "verificada" é sempre **N/A** até existir gabarito oficial importado por processo separado.

## O que está implementado

| Módulo | Estado |
|---|---|
| Auth (e-mail/senha, link por e-mail, recuperação de senha, logout, exclusão de conta) | Real, Supabase Auth (PKCE) |
| Dashboard "O que faço hoje?" | Dados reais, plano explicável com "Por quê?" |
| Edital 2026 (provisório) em árvore, status/confiança/anotações, check-in de teoria + card | Real (158 tópicos) |
| Agenda: cronômetro pausável, sessão retroativa, disponibilidade por dia, dias bloqueados | Real |
| Banco de 250 questões: filtros, imagem original por padrão, resposta + autoavaliação + confiança, favoritas, tags, classificação por tópico, relato de OCR | Real |
| Simulados de 50: por ano (ordem original) ou misto com semente, cronômetro, retomada, revisão antes de finalizar | Real |
| Revisões espaçadas `interval-v1`, RPC atômica + idempotente, fila limitada, remarcação com log | Real |
| Oficina de redação: temas autorais navais/nacionais, rascunho automático, versões, timer, rubrica pedagógica | Real |
| Análise: heatmap, por ano/tópico/OCR, tempo × cobertura, 2022–2025 × 2026 (só com dados classificados) | Real |
| Config: metas, data da prova ("a confirmar"), exportação CSV/JSON, backup/restauração | Real |

**Não implementado (honesto):** editor `/admin/conferencia` de OCR (a revisão é feita por SQL/CLI, veja `docs/IMPORTACAO_QUESTOES.md`); PWA/offline; FSRS; IA para redação; gráfico de evolução usa só simulados com autoavaliação.

## Pré-requisitos

Node 22+, uma conta GitHub e uma conta Supabase (plano gratuito basta).

## 1. Rodar localmente

```bash
npm ci
cp .env.example .env.local    # preencha com URL e chave PÚBLICA (anon/publishable)
npm run dev
```

Sem `.env.local` o app abre na tela "Configuração pendente" (não quebra).

## 2. Criar o projeto Supabase (passo a passo)

1. https://supabase.com/dashboard → **New project** (guarde a senha do banco).
2. **Project Settings → API**: copie **Project URL** e a chave **anon / publishable**. **Nunca** copie a `service_role`/`secret` para o front, para o GitHub ou para commits.
3. **SQL Editor → New query**: cole e execute, **nesta ordem**:
   1. `supabase/migrations/20261023000001_schema.sql`
   2. `supabase/migrations/20261023000002_rls_rpc.sql`
   3. `supabase/migrations/20261023000003_storage.sql`
   3b. `supabase/migrations/20261024000004_storage_admin_upload.sql` (permite que administradores enviem recortes sem usar a service_role)
   4. `supabase/seed.sql` (provas, edital provisório, temas de redação)
   5. `supabase/seed_questoes.sql` (250 questões; gerado localmente, **não vai ao Git** — veja "Provas e direitos")

   Alternativa com a CLI: `supabase link --project-ref SEU_REF` e `supabase db push`; depois `psql "$DATABASE_URL" -f supabase/seed.sql -f supabase/seed_questoes.sql`.
4. **Authentication → Providers → Email**: habilitado. Recomendado manter "Confirm email" ligado.
5. **Authentication → URL Configuration**:
   - **Site URL**: `https://SEU-USUARIO.github.io/NOME-DO-REPO/`
   - **Redirect URLs** (adicione): `https://SEU-USUARIO.github.io/NOME-DO-REPO/` e, para testes locais, `http://localhost:5173/`
   O app usa fluxo **PKCE**: o link do e-mail volta como `?code=...` (sem conflito com o `#/` do HashRouter) e a recuperação de senha abre `#/redefinir-senha`.
6. **Storage**: os buckets privados `provas` e `redacoes` já são criados pela migração 3. Para enviar os 250 recortes (uma vez, da sua máquina):
   ```powershell
   $env:SUPABASE_URL="https://SEU-PROJETO.supabase.co"
   $env:SUPABASE_SERVICE_ROLE_KEY="<chave service_role — só neste terminal>"
   npm run enviar:imagens
   ```
   Feche o terminal depois. A chave `service_role` nunca entra em arquivo versionado.
   Alternativa sem `service_role`: insira seu usuário em `public.admins` (SQL) e envie os recortes autenticado como esse administrador; usuários comuns só têm leitura do bucket.

## 3. Publicar no GitHub Pages

1. Crie o repositório no GitHub (o nome do repo vira o `base` do site) e envie o código (`git init`, `git add .`, `git commit`, `git push -u origin main`). O `.gitignore` já exclui `dados/`, `referencias/` e `seed_questoes.sql`.
2. **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. **Settings → Secrets and variables → Actions → aba Variables → New repository variable**:
   - `VITE_SUPABASE_URL` = Project URL
   - `VITE_SUPABASE_ANON_KEY` = chave **anon/publishable** (pública por definição; a proteção é a RLS)
4. `git push` na `main` dispara `.github/workflows/deploy.yml`: `npm ci` → lint → typecheck → testes → build → varredura de segredos → deploy → smoke test da URL.
5. Acesse `https://SEU-USUARIO.github.io/NOME-DO-REPO/`, crie sua conta e confirme o e-mail.

Rotas ficam em `/NOME-DO-REPO/#/estudos`; refresh e deep link funcionam sem regras de rewrite.

## Provas e direitos (decisão)

Os PDFs e os recortes foram fornecidos para estudo pessoal. **Opção adotada: acervo privado.** Os recortes ficam em bucket **privado** do Supabase e são servidos por **URL assinada de 5 minutos** apenas a usuários autenticados; texto OCR fica no Postgres (leitura só para autenticados). Nada de prova vai para `public/`, para o Git ou para o Pages. Se um dia quiser publicar acervo em pasta pública, verifique antes as condições de redistribuição — este projeto não afirma nenhuma licença sobre as provas.

## Scripts

| Comando | O que faz |
|---|---|
| `npm run dev` / `build` | desenvolvimento / build estático |
| `npm run lint` · `typecheck` · `test` | qualidade (Vitest: unidade, UI, RLS em Postgres real via PGlite, importação) |
| `npm run test:e2e` | Playwright (smoke do build em subpasta, desktop + mobile) |
| `npm run seed:gen` | regenera `supabase/seed.sql` e `seed_questoes.sql` a partir de `dados/` e do edital |
| `npm run relatorio:questoes` | valida as 250 questões e imprime o relatório (dry-run) |
| `npm run import:questoes -- --apply` | upsert via API com service_role (alternativa ao SQL) |
| `npm run enviar:imagens` | envia recortes ao bucket privado |

Documentação: `docs/ARQUITETURA.md`, `docs/DECISOES.md`, `docs/IMPORTACAO_QUESTOES.md`, `docs/TESTES.md`.
