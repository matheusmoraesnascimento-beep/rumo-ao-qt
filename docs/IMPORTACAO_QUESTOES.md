# Importação das 250 questões

Entrada: `dados/questoes_2022_2026.json` (250 objetos, `correct_option` sempre `null`) e `dados/questoes-originais/*.webp` (250 recortes).

## Regras

- Validação com Zod (`scripts/lib/importacao.ts`): 5 anos × 50, IDs `CPT-AAAA-Qnn` coerentes, sem duplicados, imagem existente, **qualquer `correct_option` ≠ null derruba a importação**.
- OCR com menos de 30 caracteres ⇒ `needs_manual_transcription` e **`ocr_body` nulo** (sem texto fabricado; imagem/página-fonte continuam ligadas).
- Hoje: 250 `pending_review`, 0 `reviewed`. O app mostra **a imagem original por padrão**; o texto OCR só sob demanda, com aviso.
- Reimportar **nunca sobrescreve** linhas `reviewed` (`ON CONFLICT … WHERE ocr_status <> 'reviewed'`).

## Fluxo

```bash
npm run relatorio:questoes      # dry-run: totais por ano, faltantes, duplicados, pendências
npm run seed:gen                # gera supabase/seed.sql e seed_questoes.sql
# aplicar no Supabase (SQL Editor ou psql), depois:
npm run enviar:imagens          # recortes -> bucket privado "provas"
```

## Revisão humana do OCR (CLI/SQL, sem rota admin)

No SQL Editor (service role), após conferir o recorte:

```sql
update public.questions
   set ocr_body = $$texto corrigido$$,
       options  = '[{"letter":"A","text":"…"},{"letter":"B","text":"…"}]'::jsonb,
       has_figure = true,
       ocr_status = 'reviewed', reviewed_at = now()
 where code = 'CPT-2026-Q01';
```

Relatos de usuários: `select q.code, r.message, r.created_at from question_reports r join questions q on q.id = r.question_id order by r.created_at;`
Questões `reviewed` passam a renderizar o texto como modo principal; as demais continuam em imagem.

## Gabaritos oficiais

Fonte: PDFs "gabaritos finais" do SSPM (um por ano, com várias disciplinas e **duas cores** por página). Coloque-os em `dados/gabaritos/` (fora do Git).

```bash
npm run gabaritos:extrair   # lê só a página "Informática" e a coluna da COR do seu caderno -> dados/gabaritos_informatica.json
npm run gabaritos:seed      # gera supabase/seed_gabaritos.sql (fora do Git); aplicar depois da migração 20261024000005
```

- **Cor do caderno** (`scripts/lib/gabaritos.ts`): 2022–2025 = **AMARELA** (rodapé "Prova: Amarela" / capa), 2026 = **ROSA** (capa "PROVA ROSA"). Em 2026 a coluna da esquerda é a Amarela: usar a errada trocaria quase todas as respostas.
- A extração **falha** (não chuta) se a cor não estiver na página, se a sequência de 100 entradas não for exata (2 cores × 50) ou se não houver exatamente 1 página de Informática.
- Estados: `valida`, `anulada` (sem alternativa; marca `questions.annulled`) e `alterada` (vale a alternativa final após recursos).
- Conferência feita: colunas lidas do texto do PDF = colunas vistas nas imagens (2026 e 2025), e questões resolvíveis por conteúdo (2023 Q1–7, 2024 Q1/Q4/Q5) batem.
- Anuladas na sua cor: 2022 Q28, 2024 Q03, 2025 Q17 e Q31. Gabarito alterado: 2022 Q01 → E.
- Novo edital/retificação: reimporte os PDFs; o seed é idempotente (`ON CONFLICT`).
