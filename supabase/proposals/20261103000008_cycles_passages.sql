-- CANDIDATA LOCAL: schema de produção não auditado; exige backup restaurável e clone antes de aplicar.
-- Aditiva: não altera progresso, gabaritos, revisões nem sessões legadas.
create table if not exists public.study_plans (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 syllabus_version_id uuid not null references public.syllabus_versions(id), exam_id uuid references public.exams(id),
 name text not null check (length(name) between 1 and 100), active boolean not null default true,
 current_item_id uuid, passage_number integer not null default 1 check(passage_number>0),
 revision integer not null default 0, algorithm_version text not null default 'cycles-v1',
 preferences jsonb not null default '{}', exceptions jsonb not null default '{}', created_at timestamptz not null default now(),
 unique(id,user_id)
);
create unique index if not exists study_plans_one_active on public.study_plans(user_id) where active;
create table if not exists public.study_cycle_items (
 id uuid primary key default gen_random_uuid(), user_id uuid not null, plan_id uuid not null,
 topic_id uuid not null references public.topics(id), ordinal integer not null check(ordinal>=0),
 budget_minutes integer not null default 45 check(budget_minutes between 5 and 240),
 manual_weight numeric not null default 1 check(manual_weight between .5 and 2), paused boolean not null default false,
 skipped_on date, unique(plan_id,topic_id), unique(id,user_id,plan_id),
 foreign key(plan_id,user_id) references public.study_plans(id,user_id) on delete cascade
);
do $$ begin
 if not exists(select 1 from pg_constraint where conname='study_plan_cursor_owner' and conrelid='public.study_plans'::regclass) then
  alter table public.study_plans add constraint study_plan_cursor_owner foreign key(current_item_id,user_id,id) references public.study_cycle_items(id,user_id,plan_id) deferrable initially deferred;
 end if;
end $$;
create index if not exists study_items_order on public.study_cycle_items(user_id,plan_id,ordinal);
create table if not exists public.guided_study_sessions (
 id uuid primary key default gen_random_uuid(), user_id uuid not null, plan_id uuid not null, item_id uuid not null,
 topic_id uuid not null references public.topics(id), passage_number integer not null check(passage_number>0),
 state text not null check(state in ('running','paused','finished')),
 elapsed_seconds numeric not null default 0 check(elapsed_seconds between 0 and 86400),
 started_at timestamptz not null default now(), resumed_at timestamptz, notes text,
 study_session_id uuid references public.study_sessions(id), completed_passage boolean not null default false, difficulty integer check(difficulty between 0 and 5),
 foreign key(item_id,user_id,plan_id) references public.study_cycle_items(id,user_id,plan_id) on delete cascade,
 unique(id,user_id)
);
create unique index if not exists guided_one_open on public.guided_study_sessions(user_id) where state<>'finished';
create index if not exists guided_history on public.guided_study_sessions(user_id,plan_id,started_at);
create table if not exists public.topic_passages (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 syllabus_version_id uuid not null references public.syllabus_versions(id), topic_id uuid not null references public.topics(id),
 passage_number integer not null check(passage_number>0), status text not null check(status in ('in_progress','completed')),
 checklist jsonb not null default '{}', checklist_version text not null default 'passage-v1',
 completed_at timestamptz, completion_source text not null default 'tracked' check(completion_source in ('tracked','manual_verified','legacy_verified')),
 evidence_session_id uuid references public.study_sessions(id), evidence_note text,
 unique(user_id,syllabus_version_id,topic_id,passage_number),
 check(status<>'completed' or (completed_at is not null and checklist @> '{"covered":true,"assessed":true}'::jsonb and (evidence_session_id is not null or coalesce(length(trim(evidence_note))>=20,false))))
);
create index if not exists passage_history on public.topic_passages(user_id,syllabus_version_id,topic_id,passage_number);
create table if not exists public.study_plan_events (
 id uuid primary key default gen_random_uuid(), user_id uuid not null, plan_id uuid not null,
 client_key uuid not null, kind text not null, payload jsonb not null, result jsonb not null,
 created_at timestamptz not null default now(), unique(user_id,client_key),
 foreign key(plan_id,user_id) references public.study_plans(id,user_id) on delete cascade
);
create index if not exists study_events_history on public.study_plan_events(user_id,plan_id,created_at);

-- Banco valida também as relações tópicos/versão/evidência; REST não pode forjar conclusões.
create or replace function public.validate_study_cycle_relation() returns trigger language plpgsql set search_path='' as $$
declare v_version uuid; v_topic uuid;
begin
 if tg_table_name='study_cycle_items' then
  select syllabus_version_id into v_version from public.study_plans where id=new.plan_id and user_id=new.user_id;
 elsif tg_table_name='guided_study_sessions' then
  select p.syllabus_version_id,i.topic_id into v_version,v_topic from public.study_plans p join public.study_cycle_items i on i.plan_id=p.id where i.id=new.item_id and i.user_id=new.user_id and p.id=new.plan_id;
  if v_topic is distinct from new.topic_id then raise exception 'Assunto não pertence ao item'; end if;
 else v_version:=new.syllabus_version_id;
 end if;
 if not exists(select 1 from public.topics where id=new.topic_id and syllabus_version_id=v_version) then raise exception 'Assunto fora da versão do edital'; end if;
 if tg_table_name in ('topic_passages','guided_study_sessions') then
  if tg_table_name='topic_passages' then
   if new.evidence_session_id is not null and not exists(select 1 from public.study_sessions s where s.id=new.evidence_session_id and s.user_id=new.user_id and s.topic_id=new.topic_id and s.duration_minutes>0) then raise exception 'Evidência de sessão inválida'; end if;
  else
   if new.study_session_id is not null and not exists(select 1 from public.study_sessions s where s.id=new.study_session_id and s.user_id=new.user_id and s.topic_id=new.topic_id) then raise exception 'Sessão pertence a outro usuário/assunto'; end if;
  end if;
 end if;
 return new;
end $$;
drop trigger if exists study_item_relation on public.study_cycle_items;
create trigger study_item_relation before insert or update on public.study_cycle_items for each row execute function public.validate_study_cycle_relation();
drop trigger if exists guided_relation on public.guided_study_sessions;
create trigger guided_relation before insert or update on public.guided_study_sessions for each row execute function public.validate_study_cycle_relation();
drop trigger if exists passage_relation on public.topic_passages;
create trigger passage_relation before insert or update on public.topic_passages for each row execute function public.validate_study_cycle_relation();

-- Somente leitura por proprietário. Escritas são exclusivamente RPC transacional.
do $$ declare t text; begin
 foreach t in array array['study_plans','study_cycle_items','guided_study_sessions','topic_passages','study_plan_events'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('alter table public.%I force row level security',t);
  execute format('drop policy if exists cycle_owner_read on public.%I',t);
  execute format('create policy cycle_owner_read on public.%I for select to authenticated using (auth.uid()=user_id)',t);
  execute format('revoke all on public.%I from anon,authenticated',t);
  execute format('grant select on public.%I to authenticated',t);
 end loop;
end $$;

create or replace function public.study_plan_command(p_operation text,p_payload jsonb,p_key uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 u uuid:=auth.uid(); p public.study_plans; i public.study_cycle_items; s public.guided_study_sessions;
 ev public.study_plan_events; result jsonb; settings_before jsonb; v_version uuid; v_exam uuid;
 ids uuid[]; tid uuid; cfg jsonb; prefs jsonb; entry jsonb; n integer:=0; seconds numeric; saved_id uuid;
 v_checklist jsonb; next_id uuid; stamp timestamptz:=clock_timestamp(); today date; val numeric; k text;
begin
 if u is null then raise exception 'Autenticação obrigatória'; end if;
 if p_key is null or jsonb_typeof(p_payload)<>'object' then raise exception 'Comando inválido'; end if;
 perform pg_advisory_xact_lock(hashtext(u::text));
 select * into ev from public.study_plan_events where user_id=u and client_key=p_key;
 if found then
  if ev.kind<>p_operation or (ev.payload-'resolved_topic_id')<>p_payload then raise exception 'Chave idempotente reutilizada com outro comando'; end if;
  return ev.result;
 end if;
 today:=(stamp at time zone coalesce((select timezone from public.profiles where id=u),'America/Sao_Paulo'))::date;
 if p_operation='save_plan' then
  v_version:=(p_payload->>'syllabus_version_id')::uuid;
  select exam_id into v_exam from public.syllabus_versions where id=v_version;
  if not found then raise exception 'Versão do edital inexistente'; end if;
  select array_agg(value::uuid) into ids from jsonb_array_elements_text(p_payload->'topic_ids');
  if coalesce(cardinality(ids),0)=0 or cardinality(ids)<>(select count(distinct x) from unnest(ids)x) then raise exception 'Seleção de assuntos inválida'; end if;
  if exists(select 1 from public.topics t where t.syllabus_version_id=v_version and not exists(select 1 from public.topics c where c.parent_id=t.id and c.syllabus_version_id=v_version) and not(t.id=any(ids))) or exists(select 1 from unnest(ids)x where not exists(select 1 from public.topics t where t.id=x and t.syllabus_version_id=v_version and not exists(select 1 from public.topics c where c.parent_id=t.id and c.syllabus_version_id=v_version))) then raise exception 'Plano deve incluir exatamente todos os assuntos-folha da versão'; end if;
  cfg:=p_payload->'settings'; prefs:=p_payload->'preferences';
  if jsonb_typeof(cfg)<>'object' or jsonb_typeof(prefs)<>'object' then raise exception 'Preferências inválidas'; end if;
  foreach k in array array['mon','tue','wed','thu','fri','sat','sun'] loop
   val:=(cfg->'weekly_availability'->>k)::numeric;
   if val is null or val<0 or val>1440 or val<>floor(val) then raise exception 'Disponibilidade inválida'; end if;
  end loop;
  if not((cfg->>'goal_correct')::integer between 1 and 50) or not((cfg->>'daily_review_cap')::integer between 1 and 200) then raise exception 'Metas inválidas'; end if;
  if not((prefs->>'min_verified_sample')::integer between 1 and 100) or not((prefs->>'alert_threshold')::numeric between 0 and 1) or not((prefs->>'window_days')::integer between 1 and 365) then raise exception 'Critérios inválidos'; end if;
  foreach k in array array['reviewOverdue','editalCoverageGap','demonstratedDifficulty','daysSinceContact','manualPriority'] loop
   val:=(prefs->'weights'->>k)::numeric; if val is null or val<0 or val>10 then raise exception 'Peso inválido'; end if;
  end loop;
  foreach k in array array['review','cycle','questions','errors'] loop
   val:=(prefs->'time_shares'->>k)::numeric; if val is null or val<0 or val>1 then raise exception 'Distribuição inválida'; end if;
  end loop;
  select to_jsonb(us) into settings_before from public.user_settings us where user_id=u;
  if p_payload->>'plan_id' is not null then
   select * into p from public.study_plans where id=(p_payload->>'plan_id')::uuid and user_id=u for update;
   if not found then raise exception 'Plano indisponível'; end if;
   if p_payload->>'expected_revision' is null or p.revision<>(p_payload->>'expected_revision')::integer then raise exception 'Plano atualizado em outra aba. Recarregue.'; end if;
   if p.syllabus_version_id<>v_version then raise exception 'Crie outro plano para trocar a versão'; end if;
  else
   if exists(select 1 from public.guided_study_sessions where user_id=u and state<>'finished') then raise exception 'Finalize a sessão antes de trocar o plano'; end if;
   update public.study_plans set active=false where user_id=u and active;
   insert into public.study_plans(user_id,syllabus_version_id,exam_id,name,preferences) values(u,v_version,v_exam,p_payload->>'name',prefs) returning * into p;
  end if;
  if jsonb_array_length(p_payload->'items')<>cardinality(ids) then raise exception 'Itens incompletos'; end if;
  foreach tid in array ids loop
   select value into entry from jsonb_array_elements(p_payload->'items') where value->>'topic_id'=tid::text;
   if entry is null then raise exception 'Item ausente'; end if;
   insert into public.study_cycle_items(user_id,plan_id,topic_id,ordinal,budget_minutes,manual_weight,paused)
    values(u,p.id,tid,n,(entry->>'budget_minutes')::integer,(entry->>'manual_weight')::numeric,(entry->>'paused')::boolean)
    on conflict(plan_id,topic_id) do update set ordinal=excluded.ordinal,budget_minutes=excluded.budget_minutes,manual_weight=excluded.manual_weight,paused=excluded.paused;
   n:=n+1;
  end loop;
  update public.user_settings set weekly_availability=cfg->'weekly_availability',goal_correct=(cfg->>'goal_correct')::integer,exam_date=nullif(cfg->>'exam_date','')::date,daily_review_cap=(cfg->>'daily_review_cap')::integer where user_id=u;
  update public.study_plans set name=p_payload->>'name',preferences=prefs,active=true,revision=revision+1,current_item_id=coalesce(current_item_id,(select id from public.study_cycle_items where plan_id=p.id order by ordinal limit 1)) where id=p.id returning * into p;
  result:=jsonb_build_object('plan_id',p.id,'revision',p.revision,'settings_before',settings_before);
 else
  select * into p from public.study_plans where id=(p_payload->>'plan_id')::uuid and user_id=u and (active or p_operation='enable') for update;
  if not found then raise exception 'Plano indisponível'; end if;
  if p_operation in ('start','skip','next_passage','reopen','legacy_passage','disable','enable','exception') and (p_payload->>'expected_revision' is null or p.revision<>(p_payload->>'expected_revision')::integer) then raise exception 'Plano atualizado em outra aba. Recarregue.'; end if;
  if p_operation in ('enable','disable') then
   if exists(select 1 from public.guided_study_sessions where user_id=u and state<>'finished') then raise exception 'Finalize a sessão em andamento'; end if;
   if p_operation='enable' then update public.study_plans set active=false where user_id=u and active; end if;
   update public.study_plans set active=(p_operation='enable'),revision=revision+1 where id=p.id;
   result:=jsonb_build_object('active',p_operation='enable');
  end if;
  if p_operation in ('start','skip') then
   select * into i from public.study_cycle_items where id=(p_payload->>'item_id')::uuid and plan_id=p.id and user_id=u;
   if not found then raise exception 'Item indisponível'; end if;
  end if;
  if p_operation='start' then
   if i.paused then raise exception 'Item pausado'; end if;
   if exists(select 1 from public.topic_passages where user_id=u and syllabus_version_id=p.syllabus_version_id and topic_id=i.topic_id and passage_number=p.passage_number and status='completed') then raise exception 'Passagem já concluída'; end if;
   select * into s from public.guided_study_sessions where user_id=u and state<>'finished';
   if found and s.item_id<>i.id then raise exception 'Há outra sessão em andamento'; end if;
   if s.id is null then
    insert into public.guided_study_sessions(user_id,plan_id,item_id,topic_id,passage_number,state,resumed_at) values(u,p.id,i.id,i.topic_id,p.passage_number,'running',stamp) returning * into s;
    insert into public.topic_passages(user_id,syllabus_version_id,topic_id,passage_number,status) values(u,p.syllabus_version_id,i.topic_id,p.passage_number,'in_progress') on conflict do nothing;
   end if;
   result:=to_jsonb(s);
  elsif p_operation in ('pause','resume','finish') then
   select * into s from public.guided_study_sessions where id=(p_payload->>'session_id')::uuid and user_id=u and plan_id=p.id for update;
   if not found then raise exception 'Sessão indisponível'; end if;
   if s.state='finished' then
    if coalesce((p_payload->>'complete')::boolean,false) is distinct from s.completed_passage and p_operation='finish' then raise exception 'Sessão já salva com outra conclusão. Recarregue para conferir o estado real.'; end if;
    return to_jsonb(s);
   else
    seconds:=least(86400,s.elapsed_seconds+case when s.state='running' then greatest(0,extract(epoch from stamp-s.resumed_at)) else 0 end);
    if p_operation='pause' then
     update public.guided_study_sessions set state='paused',elapsed_seconds=seconds,resumed_at=null where id=s.id returning * into s;
    elsif p_operation='resume' then
     if s.state='paused' then update public.guided_study_sessions set state='running',resumed_at=stamp where id=s.id returning * into s; end if;
    else
     if seconds<=0 then raise exception 'Registre tempo de estudo antes de salvar'; end if;
     if coalesce((p_payload->>'complete')::boolean,false) then
      v_checklist:=p_payload->'checklist';
      if not coalesce(v_checklist @> '{"covered":true,"assessed":true}'::jsonb,false) or length(trim(coalesce(p_payload->>'notes','')))=0 or (s.passage_number>=2 and not coalesce((v_checklist->>'practice')::boolean,false)) then raise exception 'Checklist e evidências obrigatórios'; end if;
     end if;
     insert into public.study_sessions(user_id,topic_id,started_at,ended_at,duration_minutes,kind,source,notes) values(u,s.topic_id,s.started_at,stamp,seconds/60,'teoria','ciclo guiado',p_payload->>'notes') returning id into saved_id;
     update public.guided_study_sessions set state='finished',elapsed_seconds=seconds,resumed_at=null,study_session_id=saved_id,completed_passage=coalesce((p_payload->>'complete')::boolean,false),notes=p_payload->>'notes',difficulty=(p_payload->>'difficulty')::integer where id=s.id returning * into s;
     update public.topic_passages set evidence_session_id=saved_id,evidence_note=p_payload->>'notes' where user_id=u and syllabus_version_id=p.syllabus_version_id and topic_id=s.topic_id and passage_number=s.passage_number;
     if coalesce((p_payload->>'complete')::boolean,false) then
      update public.topic_passages set status='completed',checklist=v_checklist,completed_at=stamp,completion_source='tracked' where user_id=u and syllabus_version_id=p.syllabus_version_id and topic_id=s.topic_id and passage_number=s.passage_number;
      select id into next_id from public.study_cycle_items where plan_id=p.id and ordinal>(select ordinal from public.study_cycle_items where id=s.item_id) order by ordinal limit 1;
      update public.study_plans set current_item_id=coalesce(next_id,(select id from public.study_cycle_items where plan_id=p.id order by ordinal limit 1)),revision=revision+1 where id=p.id;
     end if;
    end if;
    result:=to_jsonb(s);
   end if;
  elsif p_operation='skip' then
   if length(trim(coalesce(p_payload->>'reason','')))=0 then raise exception 'Informe o motivo'; end if;
   update public.study_cycle_items set skipped_on=today where id=i.id;
   select id into next_id from public.study_cycle_items where plan_id=p.id and ordinal>i.ordinal order by ordinal limit 1;
   update public.study_plans set current_item_id=coalesce(next_id,(select id from public.study_cycle_items where plan_id=p.id order by ordinal limit 1)),revision=revision+1 where id=p.id;
   result:=jsonb_build_object('skipped_item_id',i.id);
  elsif p_operation='next_passage' then
   if exists(select 1 from public.guided_study_sessions where user_id=u and state<>'finished') then raise exception 'Finalize a sessão em andamento'; end if;
   if exists(select 1 from public.study_cycle_items ci where ci.plan_id=p.id and not exists(select 1 from public.topic_passages st where st.user_id=u and st.syllabus_version_id=p.syllabus_version_id and st.topic_id=ci.topic_id and st.passage_number=p.passage_number and st.status='completed')) then raise exception 'Há assuntos pendentes nesta passagem'; end if;
   update public.study_plans set passage_number=passage_number+1,revision=revision+1,current_item_id=(select id from public.study_cycle_items where plan_id=p.id order by ordinal limit 1) where id=p.id;
   result:=jsonb_build_object('passage_number',p.passage_number+1);
  elsif p_operation in ('legacy_passage','reopen') then
   if exists(select 1 from public.guided_study_sessions where user_id=u and state<>'finished') then raise exception 'Finalize a sessão antes de corrigir a passagem'; end if;
   tid:=(p_payload->>'topic_id')::uuid;
   if not exists(select 1 from public.study_cycle_items where topic_id=tid and plan_id=p.id) or length(trim(coalesce(p_payload->>'reason','')))<20 then raise exception 'Assunto/justificativa inválidos (mínimo 20 caracteres)'; end if;
   if p_operation='legacy_passage' then
    if not coalesce((p_payload->>'confirmed')::boolean,false) or not exists(select 1 from public.topic_progress where user_id=u and topic_id=tid and status<>'nao_iniciado') and not exists(select 1 from public.study_sessions where user_id=u and topic_id=tid and duration_minutes>0) then raise exception 'Equivalência exige confirmação e evidência legada'; end if;
    insert into public.topic_passages(user_id,syllabus_version_id,topic_id,passage_number,status,checklist,completed_at,completion_source,evidence_note) values(u,p.syllabus_version_id,tid,1,'completed','{"covered":true,"assessed":true}',stamp,'legacy_verified',p_payload->>'reason') on conflict(user_id,syllabus_version_id,topic_id,passage_number) do update set status='completed',checklist=excluded.checklist,completed_at=excluded.completed_at,completion_source='legacy_verified',evidence_note=excluded.evidence_note;
   else
    update public.topic_passages set status='in_progress',completed_at=null where user_id=u and syllabus_version_id=p.syllabus_version_id and topic_id=tid and passage_number=(p_payload->>'passage_number')::integer;
    if not found then raise exception 'Passagem inexistente'; end if;
    update public.study_plans set passage_number=least(passage_number,(p_payload->>'passage_number')::integer),current_item_id=(select id from public.study_cycle_items where plan_id=p.id and topic_id=tid) where id=p.id;
   end if;
   update public.study_plans set revision=revision+1 where id=p.id;
   result:=jsonb_build_object('topic_id',tid,'operation',p_operation);
  elsif p_operation in ('enable','disable') then
   null;
  elsif p_operation='exception' then
   if not((p_payload->>'minutes')::integer between 0 and 1440) or length(trim(coalesce(p_payload->>'reason','')))=0 then raise exception 'Exceção inválida'; end if;
   perform (p_payload->>'day')::date;
   update public.study_plans set exceptions=exceptions||jsonb_build_object(p_payload->>'day',jsonb_build_object('minutes',(p_payload->>'minutes')::integer,'reason',p_payload->>'reason')),revision=revision+1 where id=p.id;
   result:=jsonb_build_object('day',p_payload->>'day');
  else raise exception 'Operação desconhecida';
  end if;
 end if;
 insert into public.study_plan_events(user_id,plan_id,client_key,kind,payload,result) values(u,p.id,p_key,p_operation,p_payload||jsonb_build_object('resolved_topic_id',coalesce(s.topic_id,i.topic_id,tid)),result);
 return result;
end $$;
revoke all on function public.study_plan_command(text,jsonb,uuid) from public,anon;
grant execute on function public.study_plan_command(text,jsonb,uuid) to authenticated;

-- Hardening da correção: só o servidor pode determinar proveniência verificada.
-- Não atualiza/reclassifica nenhuma tentativa existente.
drop trigger if exists trg_apply_answer_key on public.question_attempts;
create trigger trg_apply_answer_key before insert or update of selected_option,question_id,simulation_id,is_correct,key_status
 on public.question_attempts for each row execute function public.apply_answer_key();
