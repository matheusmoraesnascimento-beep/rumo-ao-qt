-- RLS em todas as tabelas + RPCs. Políticas sempre baseadas em auth.uid().

-- ---------- catálogo: leitura autenticada, escrita SOMENTE por service role/migração ----------
do $$
declare t text;
begin
  foreach t in array array['exams','syllabus_versions','topics','questions','question_topics'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "catalog_read" on public.%I', t);
    execute format('create policy "catalog_read" on public.%I for select to authenticated using (true)', t);
    execute format('revoke insert, update, delete, truncate on public.%I from anon, authenticated', t);
    execute format('revoke select on public.%I from anon', t);
  end loop;
end $$;

-- import_audit: sem política => inacessível pela API
alter table public.import_audit enable row level security;
alter table public.import_audit force row level security;
revoke all on public.import_audit from anon, authenticated;
revoke all on public.admins from anon, authenticated;

-- writing_prompts: catálogo (owner null) legível; usuário gerencia apenas os próprios temas
alter table public.writing_prompts enable row level security;
alter table public.writing_prompts force row level security;
drop policy if exists wp_select on public.writing_prompts;
drop policy if exists wp_insert on public.writing_prompts;
drop policy if exists wp_update on public.writing_prompts;
drop policy if exists wp_delete on public.writing_prompts;
create policy wp_select on public.writing_prompts for select to authenticated
  using (owner_id is null or owner_id = auth.uid());
create policy wp_insert on public.writing_prompts for insert to authenticated
  with check (owner_id = auth.uid() and official = false);
create policy wp_update on public.writing_prompts for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid() and official = false);
create policy wp_delete on public.writing_prompts for delete to authenticated
  using (owner_id = auth.uid());
revoke select on public.writing_prompts from anon;

-- ---------- profiles ----------
alter table public.profiles enable row level security;
alter table public.profiles force row level security;
drop policy if exists profiles_select on public.profiles;
drop policy if exists profiles_insert on public.profiles;
drop policy if exists profiles_update on public.profiles;
drop policy if exists profiles_delete on public.profiles;
create policy profiles_select on public.profiles for select to authenticated using (auth.uid() = id);
create policy profiles_insert on public.profiles for insert to authenticated with check (auth.uid() = id);
create policy profiles_update on public.profiles for update to authenticated
  using (auth.uid() = id) with check (auth.uid() = id);
create policy profiles_delete on public.profiles for delete to authenticated using (auth.uid() = id);
revoke all on public.profiles from anon;

-- ---------- tabelas privadas: CRUD só do dono ----------
do $$
declare t text;
begin
  foreach t in array array[
    'user_settings','topic_progress','study_sessions','study_blocks','blocked_days',
    'simulations','question_attempts','question_flags','question_reports',
    'user_question_topics','review_cards','writing_submissions','writing_feedback'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('drop policy if exists "%s_select" on public.%I', t, t);
    execute format('drop policy if exists "%s_insert" on public.%I', t, t);
    execute format('drop policy if exists "%s_update" on public.%I', t, t);
    execute format('drop policy if exists "%s_delete" on public.%I', t, t);
    execute format('create policy "%s_select" on public.%I for select to authenticated using (auth.uid() = user_id)', t, t);
    execute format('create policy "%s_insert" on public.%I for insert to authenticated with check (auth.uid() = user_id)', t, t);
    execute format('create policy "%s_update" on public.%I for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id)', t, t);
    execute format('create policy "%s_delete" on public.%I for delete to authenticated using (auth.uid() = user_id)', t, t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

-- review_events e review_reschedule_log: apenas SELECT/INSERT (imutáveis)
do $$
declare t text;
begin
  foreach t in array array['review_events','review_reschedule_log'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('drop policy if exists "%s_select" on public.%I', t, t);
    execute format('drop policy if exists "%s_insert" on public.%I', t, t);
    execute format('create policy "%s_select" on public.%I for select to authenticated using (auth.uid() = user_id)', t, t);
    execute format('create policy "%s_insert" on public.%I for insert to authenticated with check (auth.uid() = user_id)', t, t);
    execute format('revoke all on public.%I from anon', t);
    execute format('revoke update, delete, truncate on public.%I from authenticated', t);
  end loop;
end $$;

-- ---------- integridade de simulados ----------
create or replace function public.validate_simulation() returns trigger
language plpgsql security invoker set search_path = public as $$
declare n_found int; n_distinct int; n_exam int;
begin
  select count(*) into n_found from public.questions where id = any(new.question_ids);
  select count(distinct x) into n_distinct from unnest(new.question_ids) x;
  if n_distinct <> 50 or n_found <> 50 then
    raise exception 'simulado exige 50 questões distintas e existentes' using errcode = '23514';
  end if;
  if new.mode = 'year' then
    select count(*) into n_exam from public.questions
      where id = any(new.question_ids) and exam_id = new.exam_id;
    if n_exam <> 50 then
      raise exception 'simulado por ano exige 50 questões da mesma prova' using errcode = '23514';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_validate_simulation on public.simulations;
create trigger trg_validate_simulation before insert on public.simulations
  for each row execute function public.validate_simulation();

-- ---------- SRS interval-v1: atualização do card + evento, atômico e idempotente ----------
create or replace function public.review_card(
  p_card_id uuid,
  p_rating int,
  p_client_event_id uuid,
  p_reviewed_at timestamptz default now(),
  p_tz text default 'America/Sao_Paulo'
) returns public.review_cards
language plpgsql security invoker set search_path = public as $$
declare
  v_card public.review_cards;
  v_intervals int[] := array[1,3,7,14,30,60];
  v_new_level int;
  v_days int;
  v_lapses int;
  v_due timestamptz;
  v_local date;
  v_inserted uuid;
begin
  if p_rating is null or p_rating < 0 or p_rating > 5 then
    raise exception 'rating inválido' using errcode = '22023';
  end if;
  if p_reviewed_at > now() + interval '5 minutes' then
    raise exception 'data de revisão no futuro' using errcode = '22023';
  end if;

  select * into v_card from public.review_cards where id = p_card_id for update;  -- RLS filtra dono
  if not found then
    raise exception 'card não encontrado' using errcode = 'P0002';
  end if;

  -- idempotência: evento já registrado => devolve o estado atual
  if exists (select 1 from public.review_events
             where user_id = auth.uid() and client_event_id = p_client_event_id) then
    return v_card;
  end if;

  v_lapses := v_card.lapses;
  if p_rating <= 2 then
    v_new_level := 0; v_days := 1; v_lapses := v_lapses + 1;
  elsif p_rating = 3 then
    v_new_level := greatest(1, v_card.level); v_days := v_intervals[v_new_level];
  else
    v_new_level := least(6, v_card.level + case when p_rating = 5 and v_card.review_count >= 2 then 2 else 1 end);
    v_days := v_intervals[v_new_level];
  end if;

  v_local := (p_reviewed_at at time zone p_tz)::date;
  v_due := ((v_local + v_days)::timestamp) at time zone p_tz;   -- meia-noite local

  insert into public.review_events
    (user_id, card_id, rating, reviewed_at, previous_due_at, next_due_at, previous_level, next_level, algorithm, client_event_id)
  values
    (auth.uid(), p_card_id, p_rating, p_reviewed_at, v_card.due_at, v_due, v_card.level, v_new_level, v_card.algorithm, p_client_event_id)
  on conflict (user_id, client_event_id) do nothing
  returning id into v_inserted;

  if v_inserted is null then
    return v_card;
  end if;

  update public.review_cards
     set level = v_new_level, due_at = v_due, last_reviewed_at = p_reviewed_at,
         lapses = v_lapses, review_count = review_count + 1
   where id = p_card_id
   returning * into v_card;
  return v_card;
end $$;

-- remarcar revisão com log
create or replace function public.reschedule_card(p_card_id uuid, p_new_due timestamptz, p_reason text default null)
returns public.review_cards
language plpgsql security invoker set search_path = public as $$
declare v_card public.review_cards; v_old timestamptz;
begin
  select * into v_card from public.review_cards where id = p_card_id for update;
  if not found then raise exception 'card não encontrado' using errcode = 'P0002'; end if;
  v_old := v_card.due_at;
  insert into public.review_reschedule_log (user_id, card_id, from_due, to_due, reason)
    values (auth.uid(), p_card_id, v_old, p_new_due, p_reason);
  update public.review_cards set due_at = p_new_due where id = p_card_id returning * into v_card;
  return v_card;
end $$;

-- exclusão de conta (apaga auth.users; tudo pessoal cai em cascata)
create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = public, auth as $$
begin
  if auth.uid() is null then raise exception 'não autenticado' using errcode = '28000'; end if;
  delete from auth.users where id = auth.uid();
end $$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
revoke all on function public.review_card(uuid,int,uuid,timestamptz,text) from public, anon;
grant execute on function public.review_card(uuid,int,uuid,timestamptz,text) to authenticated;
revoke all on function public.reschedule_card(uuid,timestamptz,text) from public, anon;
grant execute on function public.reschedule_card(uuid,timestamptz,text) to authenticated;
revoke all on function public.is_admin() from public, anon;
