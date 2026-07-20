-- Run in Supabase SQL Editor.
--
-- Adds real collaborative note sharing: a collaborators table with per-user
-- view/edit permission, replacing the old copy-a-link-to-import flow (which
-- is left in place, untouched, for backward compatibility — nothing calls
-- it from the UI anymore). Also enables Realtime on notes so collaborators
-- see each other's saved changes live.

-- 1. Collaborators table -----------------------------------------------

create table if not exists public.note_collaborators (
  id uuid primary key default gen_random_uuid(),
  note_id uuid not null references public.notes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  permission text not null default 'view' check (permission in ('view', 'edit')),
  invited_by uuid references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (note_id, user_id)
);

alter table public.note_collaborators enable row level security;

create index if not exists note_collaborators_user_idx on public.note_collaborators (user_id);

-- 2. Expand notes RLS: owner keeps full control; collaborators get SELECT;
--    edit-collaborators also get UPDATE. --------------------------------

drop policy if exists "Users manage only their notes" on public.notes;

create policy "Owners manage their notes" on public.notes
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Collaborators can view shared notes" on public.notes
  for select to authenticated
  using (
    exists (
      select 1 from public.note_collaborators c
      where c.note_id = notes.id and c.user_id = (select auth.uid())
    )
  );

create policy "Editors can update shared notes" on public.notes
  for update to authenticated
  using (
    exists (
      select 1 from public.note_collaborators c
      where c.note_id = notes.id and c.user_id = (select auth.uid()) and c.permission = 'edit'
    )
  )
  with check (
    exists (
      select 1 from public.note_collaborators c
      where c.note_id = notes.id and c.user_id = (select auth.uid()) and c.permission = 'edit'
    )
  );

-- 3. Guard trigger: RLS "with check" only validates the resulting row, not
--    which columns changed — without this, an edit-collaborator could PATCH
--    notes.user_id (stealing ownership) or share_token via a raw REST call.

create or replace function public.notes_guard_update()
returns trigger
language plpgsql
as $$
begin
  if new.user_id is distinct from old.user_id then
    raise exception 'notes.user_id is immutable';
  end if;

  if new.created_at is distinct from old.created_at then
    new.created_at := old.created_at;
  end if;

  -- Only the owner may touch the legacy share link.
  if new.share_token is distinct from old.share_token and auth.uid() is distinct from old.user_id then
    new.share_token := old.share_token;
  end if;

  return new;
end;
$$;

drop trigger if exists notes_guard_update on public.notes;
create trigger notes_guard_update
  before update on public.notes
  for each row execute function public.notes_guard_update();

-- 4. RLS on note_collaborators: owner manages rows; a collaborator can see
--    their own row (needed so they can tell which notes are shared with
--    them, and what their own permission is). ---------------------------

create policy "Owners manage collaborators on their notes" on public.note_collaborators
  for all to authenticated
  using (
    exists (select 1 from public.notes n where n.id = note_collaborators.note_id and n.user_id = (select auth.uid()))
  )
  with check (
    exists (select 1 from public.notes n where n.id = note_collaborators.note_id and n.user_id = (select auth.uid()))
  );

create policy "Collaborators view their own collaboration rows" on public.note_collaborators
  for select to authenticated
  using ((select auth.uid()) = user_id);

-- 5. RPCs — profiles are otherwise only readable by their own owner, so a
--    "share with this person" picker needs a narrow, security-definer path.

create or replace function public.search_profiles(query text)
returns table (user_id uuid, username text, avatar_path text)
language sql
security definer
set search_path = public
stable
as $$
  select p.user_id, p.username, p.avatar_path
  from public.profiles p
  where length(btrim(query)) >= 2
    and p.username ilike replace(replace(query, '%', '\%'), '_', '\_') || '%'
    and p.user_id <> auth.uid()
  limit 10;
$$;

revoke all on function public.search_profiles(text) from public;
grant execute on function public.search_profiles(text) to authenticated;

create or replace function public.get_note_collaborators(note_id_input uuid)
returns table (user_id uuid, username text, avatar_path text, permission text)
language sql
security definer
set search_path = public
stable
as $$
  select c.user_id, p.username, p.avatar_path, c.permission
  from public.note_collaborators c
  join public.profiles p on p.user_id = c.user_id
  where c.note_id = note_id_input
    and (
      exists (select 1 from public.notes n where n.id = note_id_input and n.user_id = auth.uid())
      or exists (select 1 from public.note_collaborators c2 where c2.note_id = note_id_input and c2.user_id = auth.uid())
    );
$$;

revoke all on function public.get_note_collaborators(uuid) from public;
grant execute on function public.get_note_collaborators(uuid) to authenticated;

create or replace function public.get_note_owner(note_id_input uuid)
returns table (user_id uuid, username text, avatar_path text)
language sql
security definer
set search_path = public
stable
as $$
  select p.user_id, p.username, p.avatar_path
  from public.notes n
  join public.profiles p on p.user_id = n.user_id
  where n.id = note_id_input
    and exists (
      select 1 from public.note_collaborators c
      where c.note_id = note_id_input and c.user_id = auth.uid()
    );
$$;

revoke all on function public.get_note_owner(uuid) from public;
grant execute on function public.get_note_owner(uuid) to authenticated;

-- 6. Realtime — so a collaborator sees saved changes without reloading.
--    Idempotent: safe to re-run even though a hosted project already ships
--    an (empty) supabase_realtime publication.

do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notes'
  ) then
    alter publication supabase_realtime add table public.notes;
  end if;
end $$;
