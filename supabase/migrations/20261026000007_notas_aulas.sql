-- Anotações como HTML por assunto + aulas de revisão (review_cards.kind='aula') + log de questões.

alter table public.topic_progress
  add column if not exists notes_html text;
alter table public.topic_progress
  drop constraint if exists topic_progress_notes_html_len;
alter table public.topic_progress
  add constraint topic_progress_notes_html_len check (char_length(notes_html) <= 200000);

alter table public.review_cards
  add column if not exists kind text not null default 'card';
alter table public.review_cards
  drop constraint if exists review_cards_kind_check;
alter table public.review_cards
  add constraint review_cards_kind_check check (kind in ('card','aula'));
create unique index if not exists uq_card_aula_por_assunto
  on public.review_cards (user_id, topic_id) where kind = 'aula';

create table if not exists public.topic_question_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  topic_id uuid not null references public.topics(id),
  done int not null check (done > 0),
  correct int check (correct >= 0),
  logged_at timestamptz not null default now(),
  check (correct is null or correct <= done)
);
create index if not exists idx_topic_question_logs_user_topic
  on public.topic_question_logs (user_id, topic_id, logged_at desc);

alter table public.topic_question_logs enable row level security;
alter table public.topic_question_logs force row level security;
drop policy if exists "topic_question_logs_select" on public.topic_question_logs;
drop policy if exists "topic_question_logs_insert" on public.topic_question_logs;
drop policy if exists "topic_question_logs_update" on public.topic_question_logs;
drop policy if exists "topic_question_logs_delete" on public.topic_question_logs;
create policy "topic_question_logs_select" on public.topic_question_logs for select to authenticated using (auth.uid() = user_id);
create policy "topic_question_logs_insert" on public.topic_question_logs for insert to authenticated with check (auth.uid() = user_id);
create policy "topic_question_logs_update" on public.topic_question_logs for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "topic_question_logs_delete" on public.topic_question_logs for delete to authenticated using (auth.uid() = user_id);
revoke all on public.topic_question_logs from anon;

create or replace function public.concluir_assunto(
  p_topic_id uuid,
  p_done int default null,
  p_correct int default null,
  p_now timestamptz default now(),
  p_tz text default 'America/Sao_Paulo'
) returns public.review_cards
language plpgsql security invoker set search_path = public as $$
declare
  v_name text;
  v_due timestamptz;
  v_card public.review_cards;
begin
  select name into v_name from public.topics where id = p_topic_id;
  if not found then
    raise exception 'assunto não encontrado' using errcode = '22023';
  end if;
  if exists (select 1 from public.topics where parent_id = p_topic_id) then
    raise exception 'só é possível concluir assunto sem subtópicos' using errcode = '22023';
  end if;
  if p_done is not null and p_done < 1 then
    raise exception 'questões feitas deve ser maior que zero' using errcode = '22023';
  end if;
  if p_correct is not null and (p_done is null or p_correct < 0 or p_correct > p_done) then
    raise exception 'acertos inválidos para as questões feitas' using errcode = '22023';
  end if;

  insert into public.topic_progress (user_id, topic_id, status, first_studied_at, last_studied_at)
  values (auth.uid(), p_topic_id, 'revisando', p_now, p_now)
  on conflict (user_id, topic_id) do update set
    status = case when topic_progress.status in ('nao_iniciado','estudando') then 'revisando' else topic_progress.status end,
    first_studied_at = coalesce(topic_progress.first_studied_at, excluded.first_studied_at),
    last_studied_at = coalesce(topic_progress.last_studied_at, excluded.last_studied_at),
    updated_at = now();

  v_due := (((p_now at time zone p_tz)::date + 1)::timestamp) at time zone p_tz;

  insert into public.review_cards (user_id, topic_id, kind, front, due_at)
  values (auth.uid(), p_topic_id, 'aula', v_name, v_due)
  on conflict (user_id, topic_id) where kind = 'aula' do nothing;

  select * into v_card from public.review_cards
   where user_id = auth.uid() and topic_id = p_topic_id and kind = 'aula';

  if p_done is not null then
    insert into public.topic_question_logs (user_id, topic_id, done, correct, logged_at)
    values (auth.uid(), p_topic_id, p_done, p_correct, p_now);
  end if;

  return v_card;
end $$;
