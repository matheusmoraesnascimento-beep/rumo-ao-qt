-- Lembrete diário por Web Push. O remetente (GitHub Actions agendado) NÃO usa service_role:
-- chama RPCs restritas por um token próprio e revogável (guardado só como hash no banco).

alter table public.user_settings add column if not exists reminder_enabled boolean not null default false;
alter table public.user_settings add column if not exists reminder_time text not null default '19:00'
  check (reminder_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique check (endpoint like 'https://%'),
  p256dh text not null,
  auth text not null,
  user_agent text,
  last_sent_on date,
  created_at timestamptz not null default now()
);
create index if not exists idx_push_user on public.push_subscriptions (user_id);
alter table public.push_subscriptions enable row level security;
alter table public.push_subscriptions force row level security;
drop policy if exists push_select on public.push_subscriptions;
drop policy if exists push_insert on public.push_subscriptions;
drop policy if exists push_delete on public.push_subscriptions;
create policy push_select on public.push_subscriptions for select to authenticated using (auth.uid() = user_id);
create policy push_insert on public.push_subscriptions for insert to authenticated with check (auth.uid() = user_id);
create policy push_delete on public.push_subscriptions for delete to authenticated using (auth.uid() = user_id);
revoke all on public.push_subscriptions from anon;
revoke update on public.push_subscriptions from authenticated;   -- chaves não mudam; recriar a inscrição

-- Tokens do remetente (só hash). Sem políticas: inacessível pela API.
create table if not exists public.reminder_bots (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);
alter table public.reminder_bots enable row level security;
alter table public.reminder_bots force row level security;
revoke all on public.reminder_bots from anon, authenticated;

create or replace function public._reminder_bot_ok(p_token text) returns boolean
language sql stable security definer set search_path = public as $$
  select p_token is not null and length(p_token) >= 32 and exists (
    select 1 from public.reminder_bots
     where revoked_at is null and token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex'))
$$;
revoke all on function public._reminder_bot_ok(text) from public, anon, authenticated;

-- Quem deve receber lembrete AGORA (já dentro da janela do horário escolhido, 1x por dia local).
-- Regras: dia bloqueado não recebe; sem revisão vencida só recebe se não estudou nas últimas 20 h.
create or replace function public.reminders_due(p_token text, p_now timestamptz default now())
returns table (sub_id uuid, endpoint text, p256dh text, auth text, due_count int, kind text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public._reminder_bot_ok(p_token) then raise exception 'não autorizado' using errcode = '28000'; end if;
  return query
  with cand as (
    select s.id, s.endpoint, s.p256dh, s.auth, s.user_id,
           (p_now at time zone p.timezone)::date as local_day,
           (extract(hour from (p_now at time zone p.timezone))::int * 60 + extract(minute from (p_now at time zone p.timezone))::int) as local_min,
           (split_part(us.reminder_time, ':', 1)::int * 60 + split_part(us.reminder_time, ':', 2)::int) as rem_min,
           s.last_sent_on
      from public.push_subscriptions s
      join public.user_settings us on us.user_id = s.user_id
      join public.profiles p on p.id = s.user_id
     where us.reminder_enabled
  ), ok as (
    select * from cand c
     where c.local_min >= c.rem_min and c.local_min <= least(c.rem_min + 180, 1439)   -- janela de 3 h após o horário
       and c.last_sent_on is distinct from c.local_day
       and not exists (select 1 from public.blocked_days b where b.user_id = c.user_id and b.day = c.local_day)
  )
  select o.id, o.endpoint, o.p256dh, o.auth,
         d.n,
         case when d.n > 0 then 'revisoes' else 'estudo' end
    from ok o
    cross join lateral (select count(*)::int as n from public.review_cards rc where rc.user_id = o.user_id and rc.due_at <= p_now) d
   where d.n > 0
      or not exists (select 1 from public.study_sessions ss where ss.user_id = o.user_id and ss.started_at >= p_now - interval '20 hours');
end $$;

create or replace function public.reminders_mark_sent(p_token text, p_sub_ids uuid[], p_now timestamptz default now())
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not public._reminder_bot_ok(p_token) then raise exception 'não autorizado' using errcode = '28000'; end if;
  update public.push_subscriptions s set last_sent_on = (p_now at time zone p.timezone)::date
    from public.profiles p where p.id = s.user_id and s.id = any(p_sub_ids);
  get diagnostics n = row_count;
  return n;
end $$;

-- Inscrições mortas (endpoint expirou: 404/410) são removidas pelo remetente.
create or replace function public.reminders_prune(p_token text, p_sub_ids uuid[])
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not public._reminder_bot_ok(p_token) then raise exception 'não autorizado' using errcode = '28000'; end if;
  delete from public.push_subscriptions where id = any(p_sub_ids);
  get diagnostics n = row_count;
  return n;
end $$;

revoke all on function public.reminders_due(text, timestamptz) from public;
revoke all on function public.reminders_mark_sent(text, uuid[], timestamptz) from public;
revoke all on function public.reminders_prune(text, uuid[]) from public;
grant execute on function public.reminders_due(text, timestamptz) to anon, authenticated;
grant execute on function public.reminders_mark_sent(text, uuid[], timestamptz) to anon, authenticated;
grant execute on function public.reminders_prune(text, uuid[]) to anon, authenticated;
