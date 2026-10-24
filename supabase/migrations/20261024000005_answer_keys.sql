-- Gabaritos OFICIAIS (importados separadamente, com fonte). O navegador NUNCA lê a tabela:
-- a alternativa correta só é revelada por RPC, depois que o usuário respondeu.
-- Questões anuladas continuam no banco, apenas marcadas (questions.annulled).

alter table public.questions add column if not exists annulled boolean not null default false;
alter table public.questions add column if not exists annulled_note text;

create table if not exists public.answer_keys (
  question_id uuid primary key references public.questions(id) on delete cascade,
  correct_option text check (correct_option in ('A','B','C','D','E')),
  status text not null check (status in ('valida','anulada','alterada')),
  note text,
  booklet_color text not null,
  source_file text not null,
  imported_at timestamptz not null default now(),
  constraint key_consistent check ((status = 'anulada' and correct_option is null) or (status <> 'anulada' and correct_option is not null))
);
alter table public.answer_keys enable row level security;
alter table public.answer_keys force row level security;
revoke all on public.answer_keys from anon, authenticated;     -- sem políticas: inacessível pela API

alter table public.question_attempts add column if not exists key_status text check (key_status in ('valida','anulada','alterada'));
alter table public.question_attempts add column if not exists is_correct boolean;

-- Verificação automática da tentativa avulsa (e das de simulado já finalizado).
create or replace function public.apply_answer_key() returns trigger
language plpgsql security definer set search_path = public as $$
declare k public.answer_keys; sim_done boolean := true;
begin
  new.key_status := null; new.is_correct := null;
  if new.simulation_id is not null then
    select (status = 'finalizado') into sim_done from public.simulations where id = new.simulation_id and user_id = new.user_id;
    if not coalesce(sim_done, false) then return new; end if;   -- simulado em andamento: nada é revelado
  end if;
  select * into k from public.answer_keys where question_id = new.question_id;
  if not found then return new; end if;
  new.key_status := k.status;
  if k.status <> 'anulada' and new.selected_option is not null then
    new.is_correct := (new.selected_option = k.correct_option);
  end if;
  return new;
end $$;
drop trigger if exists trg_apply_answer_key on public.question_attempts;
create trigger trg_apply_answer_key before insert or update of selected_option, question_id, simulation_id
  on public.question_attempts for each row execute function public.apply_answer_key();

-- Revela o gabarito de UMA questão somente a quem já respondeu fora de simulado.
create or replace function public.reveal_answer(p_question_id uuid)
returns table (correct_option text, status text, note text)
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'não autenticado' using errcode = '28000'; end if;
  if not exists (select 1 from public.question_attempts a
                  where a.user_id = auth.uid() and a.question_id = p_question_id and a.simulation_id is null) then
    raise exception 'responda a questão para ver o gabarito' using errcode = '42501';
  end if;
  return query select k.correct_option, k.status, k.note from public.answer_keys k where k.question_id = p_question_id;
end $$;

-- Finaliza o simulado e libera a conferência (verificação das tentativas do próprio usuário).
create or replace function public.finalize_simulation(p_sim_id uuid, p_elapsed_seconds int default 0)
returns public.simulations
language plpgsql security definer set search_path = public as $$
declare s public.simulations;
begin
  if auth.uid() is null then raise exception 'não autenticado' using errcode = '28000'; end if;
  select * into s from public.simulations where id = p_sim_id and user_id = auth.uid() for update;
  if not found then raise exception 'simulado não encontrado' using errcode = 'P0002'; end if;
  if s.status = 'finalizado' then return s; end if;
  update public.simulations
     set status = 'finalizado', finished_at = now(),
         elapsed_seconds = greatest(0, coalesce(p_elapsed_seconds, 0)),
         duration_seconds = greatest(0, coalesce(p_elapsed_seconds, 0))
   where id = p_sim_id returning * into s;
  -- reaplica o gabarito (o gatilho agora vê status = finalizado)
  update public.question_attempts set selected_option = selected_option
   where simulation_id = p_sim_id and user_id = auth.uid();
  return s;
end $$;

-- Conferência do simulado: só depois de finalizado e só do dono.
create or replace function public.simulation_review(p_sim_id uuid)
returns table (question_id uuid, correct_option text, status text, note text)
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'não autenticado' using errcode = '28000'; end if;
  if not exists (select 1 from public.simulations s where s.id = p_sim_id and s.user_id = auth.uid() and s.status = 'finalizado') then
    raise exception 'finalize o simulado para ver a conferência' using errcode = '42501';
  end if;
  return query
    select k.question_id, k.correct_option, k.status, k.note
      from public.answer_keys k
      join public.simulations s on k.question_id = any(s.question_ids)
     where s.id = p_sim_id;
end $$;

revoke all on function public.apply_answer_key() from public, anon, authenticated;
revoke all on function public.reveal_answer(uuid) from public, anon;
revoke all on function public.finalize_simulation(uuid, int) from public, anon;
revoke all on function public.simulation_review(uuid) from public, anon;
grant execute on function public.reveal_answer(uuid) to authenticated;
grant execute on function public.finalize_simulation(uuid, int) to authenticated;
grant execute on function public.simulation_review(uuid) to authenticated;
