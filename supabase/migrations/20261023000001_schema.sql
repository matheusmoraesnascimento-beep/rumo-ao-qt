-- Rumo ao QT — schema base (idempotente). Catálogo público-autenticado + dados privados por usuário.
-- NENHUMA coluna de gabarito existe em `questions` (por desenho).


-- ---------- helpers ----------
create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------- admins (gerenciado apenas via SQL/service role) ----------
create table if not exists public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table public.admins enable row level security;
alter table public.admins force row level security;
-- sem políticas: ninguém lê/escreve via API.

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where user_id = auth.uid())
$$;

-- ---------- perfis e preferências ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text check (char_length(display_name) <= 80),
  timezone text not null default 'America/Sao_Paulo',
  created_at timestamptz not null default now()
);

create table if not exists public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  goal_correct int not null default 40 check (goal_correct between 1 and 50),
  baseline_2026 int not null default 21 check (baseline_2026 between 0 and 50),
  exam_date date,                                   -- null = "a confirmar"
  daily_review_cap int not null default 20 check (daily_review_cap between 1 and 200),
  weekly_availability jsonb not null default
    '{"mon":120,"tue":120,"wed":120,"thu":120,"fri":120,"sat":0,"sun":0}'::jsonb,
  writing_cadence text not null default 'auto' check (writing_cadence in ('auto','off','weekly','biweekly','triweekly')),
  include_writing boolean not null default true,
  min_new_topic_share numeric not null default 0.2 check (min_new_topic_share between 0 and 1),
  theme text not null default 'system' check (theme in ('system','light','dark')),
  updated_at timestamptz not null default now()
);
drop trigger if exists trg_user_settings_updated on public.user_settings;
create trigger trg_user_settings_updated before update on public.user_settings
  for each row execute function public.set_updated_at();

-- cria perfil + preferências no cadastro
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
    values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)))
    on conflict do nothing;
  insert into public.user_settings (user_id) values (new.id) on conflict do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- catálogo ----------
create table if not exists public.exams (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  year int not null,
  type text not null default 'CP-T',
  specialty text not null default 'Informática',
  official_status text not null default 'historica',
  source_url text
);

create table if not exists public.syllabus_versions (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid references public.exams(id),
  year int not null,
  label text not null,
  status text not null default 'provisorio' check (status in ('provisorio','oficial','substituido')),
  published_at date,
  source_url text,
  checksum text,
  unique (year, label)
);

create table if not exists public.topics (
  id uuid primary key default gen_random_uuid(),
  syllabus_version_id uuid not null references public.syllabus_versions(id),
  parent_id uuid references public.topics(id),
  name text not null,
  slug text not null,
  ordinal int not null default 0,
  notes text,
  source_exam_year int,
  historical_weight numeric,                         -- desconhecido (null) até classificação real
  unique (syllabus_version_id, slug)
);
create index if not exists idx_topics_version_parent on public.topics (syllabus_version_id, parent_id);

create table if not exists public.questions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,                         -- CPT-2026-Q01
  exam_id uuid not null references public.exams(id),
  number int not null check (number between 1 and 50),
  source_pdf text,
  source_page int,
  source_column text check (source_column in ('left','right','full')),
  source_spans jsonb,
  ocr_body text,
  options jsonb not null default '[]'::jsonb,
  image_path text,
  image_status text,
  ocr_status text not null default 'pending_review'
    check (ocr_status in ('pending_review','needs_manual_transcription','reviewed')),
  has_figure boolean,
  text_hash text,
  reviewed_at timestamptz,
  unique (exam_id, number)
);
create index if not exists idx_questions_exam_number on public.questions (exam_id, number);
create index if not exists idx_questions_fts on public.questions
  using gin (to_tsvector('portuguese', coalesce(ocr_body, '')));

create table if not exists public.question_topics (
  question_id uuid not null references public.questions(id) on delete cascade,
  topic_id uuid not null references public.topics(id),
  confidence numeric,
  review_status text not null default 'pending',
  primary key (question_id, topic_id)
);

create table if not exists public.writing_prompts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete cascade,  -- null = catálogo; senão tema do usuário
  origin text not null default 'autoral' check (origin in ('autoral','externo','usuario')),
  year int,
  title text not null,
  prompt_text text not null,
  official boolean not null default false,
  source_url text,
  constraint wp_user_not_official check (owner_id is null or official = false)
);

create table if not exists public.import_audit (
  id uuid primary key default gen_random_uuid(),
  batch_name text not null,
  checksum text,
  records_validated int,
  records_imported int,
  errors jsonb,
  created_at timestamptz not null default now()
);

-- ---------- dados do estudante ----------
create table if not exists public.topic_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  topic_id uuid not null references public.topics(id),
  status text not null default 'nao_iniciado'
    check (status in ('nao_iniciado','estudando','revisando','consolidado')),
  confidence int not null default 0 check (confidence between 0 and 5),
  notes text,
  first_studied_at timestamptz,
  last_studied_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, topic_id)
);

create table if not exists public.study_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  topic_id uuid references public.topics(id),
  started_at timestamptz not null,
  ended_at timestamptz,
  duration_minutes numeric not null check (duration_minutes >= 0 and duration_minutes <= 1440),
  kind text not null default 'teoria' check (kind in ('teoria','revisao','questoes','simulado','redacao')),
  source text,
  notes text,
  retroactive boolean not null default false,
  created_at timestamptz not null default now(),
  check (ended_at is null or ended_at >= started_at)
);
create index if not exists idx_sessions_user_created on public.study_sessions (user_id, created_at);
create index if not exists idx_sessions_user_started on public.study_sessions (user_id, started_at);

create table if not exists public.study_blocks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  scheduled_at date not null,
  minutes int not null check (minutes between 5 and 600),
  topic_id uuid references public.topics(id),
  kind text not null default 'teoria',
  status text not null default 'planejado' check (status in ('planejado','feito','pulado','remarcado')),
  reason text,
  created_at timestamptz not null default now()
);
create index if not exists idx_blocks_user_date on public.study_blocks (user_id, scheduled_at);

create table if not exists public.blocked_days (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  reason text,
  primary key (user_id, day)
);

create table if not exists public.simulations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  mode text not null check (mode in ('year','mixed')),
  exam_id uuid references public.exams(id),
  seed text,
  question_ids uuid[] not null,
  marked uuid[] not null default '{}',
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  time_limit_seconds int check (time_limit_seconds is null or time_limit_seconds > 0),
  elapsed_seconds int not null default 0 check (elapsed_seconds >= 0),
  duration_seconds int check (duration_seconds is null or duration_seconds >= 0),
  status text not null default 'em_andamento' check (status in ('em_andamento','finalizado','abandonado')),
  constraint sim_50 check (cardinality(question_ids) = 50),
  constraint sim_year_defined check (
    (mode = 'year' and exam_id is not null) or (mode = 'mixed' and seed is not null)),
  unique (id, user_id)
);
create index if not exists idx_sims_user_created on public.simulations (user_id, started_at);

create table if not exists public.question_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  question_id uuid not null references public.questions(id),
  simulation_id uuid,
  selected_option text check (selected_option in ('A','B','C','D','E')),
  time_seconds int not null default 0 check (time_seconds >= 0 and time_seconds <= 86400),
  confidence int check (confidence between 0 and 5),
  self_grade text check (self_grade in ('acertei','errei','nao_sei')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (simulation_id, user_id) references public.simulations(id, user_id) on delete cascade
);
create index if not exists idx_attempts_user_created on public.question_attempts (user_id, created_at);
create index if not exists idx_attempts_user_question on public.question_attempts (user_id, question_id);
create unique index if not exists uq_attempt_per_simulation
  on public.question_attempts (simulation_id, question_id) where simulation_id is not null;
drop trigger if exists trg_attempts_updated on public.question_attempts;
create trigger trg_attempts_updated before update on public.question_attempts
  for each row execute function public.set_updated_at();

create table if not exists public.question_flags (
  user_id uuid not null references auth.users(id) on delete cascade,
  question_id uuid not null references public.questions(id),
  favorite boolean not null default false,
  tags text[] not null default '{}',
  note text,
  primary key (user_id, question_id)
);

create table if not exists public.question_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  question_id uuid not null references public.questions(id),
  message text not null check (char_length(message) between 3 and 2000),
  created_at timestamptz not null default now()
);

create table if not exists public.user_question_topics (
  user_id uuid not null references auth.users(id) on delete cascade,
  question_id uuid not null references public.questions(id),
  topic_id uuid not null references public.topics(id),
  primary key (user_id, question_id, topic_id)
);

create table if not exists public.review_cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  topic_id uuid references public.topics(id),
  question_id uuid references public.questions(id),
  front text not null check (char_length(front) between 1 and 4000),
  back text not null default '' check (char_length(back) <= 8000),
  algorithm text not null default 'interval-v1',
  level int not null default 0 check (level between 0 and 6),
  due_at timestamptz not null default now(),
  last_reviewed_at timestamptz,
  lapses int not null default 0 check (lapses >= 0),
  review_count int not null default 0 check (review_count >= 0),
  created_at timestamptz not null default now(),
  unique (id, user_id)
);
create index if not exists idx_cards_user_due on public.review_cards (user_id, due_at);
create unique index if not exists uq_card_error_per_question
  on public.review_cards (user_id, question_id) where question_id is not null;

create table if not exists public.review_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  card_id uuid not null,
  rating int not null check (rating between 0 and 5),
  reviewed_at timestamptz not null default now(),
  previous_due_at timestamptz,
  next_due_at timestamptz not null,
  previous_level int,
  next_level int,
  algorithm text not null default 'interval-v1',
  client_event_id uuid not null,
  unique (user_id, client_event_id),
  foreign key (card_id, user_id) references public.review_cards(id, user_id) on delete cascade
);
create index if not exists idx_events_user_reviewed on public.review_events (user_id, reviewed_at);

create table if not exists public.review_reschedule_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  card_id uuid not null,
  from_due timestamptz,
  to_due timestamptz not null,
  reason text,
  created_at timestamptz not null default now(),
  foreign key (card_id, user_id) references public.review_cards(id, user_id) on delete cascade
);

create table if not exists public.writing_submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  essay_id uuid not null default gen_random_uuid(),
  prompt_id uuid references public.writing_prompts(id),
  plan jsonb not null default '{}'::jsonb,
  draft text not null default '',
  word_count int not null default 0 check (word_count >= 0),
  writing_seconds int not null default 0 check (writing_seconds >= 0),
  version int not null default 1 check (version >= 1),
  status text not null default 'rascunho' check (status in ('rascunho','finalizada')),
  attachment_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  unique (user_id, essay_id, version)
);
create index if not exists idx_writing_user_created on public.writing_submissions (user_id, created_at);
drop trigger if exists trg_writing_updated on public.writing_submissions;
create trigger trg_writing_updated before update on public.writing_submissions
  for each row execute function public.set_updated_at();

create table if not exists public.writing_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  submission_id uuid not null,
  rubric jsonb not null default '{}'::jsonb,       -- eixos pedagógicos editáveis (NÃO é nota oficial)
  comments text,
  paragraph_comments jsonb not null default '[]'::jsonb,
  error_tags text[] not null default '{}',
  reviewer_type text not null default 'self' check (reviewer_type in ('self','teacher')),
  created_at timestamptz not null default now(),
  foreign key (submission_id, user_id) references public.writing_submissions(id, user_id) on delete cascade
);

-- ---------- eventos imutáveis ----------
create or replace function public.forbid_update() returns trigger
language plpgsql as $$
begin
  raise exception 'registro imutável (%.%)', tg_table_schema, tg_table_name using errcode = '42501';
end $$;
drop trigger if exists trg_review_events_immutable on public.review_events;
create trigger trg_review_events_immutable before update on public.review_events
  for each row execute function public.forbid_update();

