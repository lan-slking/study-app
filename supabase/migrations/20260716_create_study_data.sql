-- Run this once in Supabase: SQL Editor -> New query -> Run.
-- Every private row belongs to auth.uid(); RLS blocks all cross-user access.

create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  title text not null default '',
  content text not null default '',
  subject text not null default '',
  mode text not null default '',
  test_date date,
  quiz_json jsonb,
  flashcards_json jsonb,
  fill_blank_json jsonb,
  share_token text unique,
  last_quiz_correct integer,
  last_quiz_total integer,
  last_flashcards_correct integer,
  last_flashcards_total integer,
  last_fill_blank_correct integer,
  last_fill_blank_total integer,
  last_reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.activity (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  note_id uuid not null references public.notes(id) on delete cascade,
  type text not null check (type in ('quiz', 'flashcards', 'fill_blank')),
  correct integer,
  total integer,
  created_at timestamptz not null default now()
);

create index if not exists notes_user_updated_idx on public.notes (user_id, updated_at desc);
create index if not exists activity_user_created_idx on public.activity (user_id, created_at desc);

alter table public.notes enable row level security;
alter table public.activity enable row level security;

create policy "Users manage only their notes" on public.notes
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users manage only their activity" on public.activity
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
