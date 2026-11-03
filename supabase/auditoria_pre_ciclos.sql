-- Somente leitura. Um único resultado. Sem dados pessoais.
with t(nome) as (values ('profiles'),('user_settings'),('exams'),('syllabus_versions'),('topics'),('topic_progress'),('study_sessions'),('review_cards'),('review_events'),('questions'),('question_attempts'),('simulations'),('study_plans'),('topic_passages'),('guided_study_sessions'),('study_plan_events'),('study_cycle_items'))
select t.nome as tabela,
  (c.oid is not null) as existe,
  coalesce(c.relrowsecurity,false) as rls,
  (select count(*) from information_schema.columns where table_schema='public' and table_name=t.nome) as colunas,
  case when c.oid is not null then (xpath('/row/n/text()', query_to_xml(format('select count(*) as n from public.%I', t.nome), false, true, '')))[1]::text end as linhas
from t left join pg_class c on c.relname=t.nome and c.relkind='r' and c.relnamespace='public'::regnamespace
order by t.nome;
