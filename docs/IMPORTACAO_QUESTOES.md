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

## Gabaritos

Proibidos no seed. Um módulo de correção automática só pode existir com importação **separada** de gabaritos oficiais, fonte e aprovação humana — nunca deduzidos por LLM.
