-- Run in Supabase SQL Editor, after 20260720_collaborative_sharing.sql.
--
-- Fixes "infinite recursion detected in policy" (surfaced to the app as a
-- 500 / FUNCTION_INVOCATION_FAILED on GET /api/notes, even for a user's own
-- notes). Cause: the notes SELECT policy queries note_collaborators, and
-- note_collaborators' owner-management policy queries notes right back —
-- Postgres re-applies RLS to both sides of that plain subquery, so it loops.
--
-- Fix: move each cross-table check into a `security definer` function. Such
-- a function runs as its (table-owning) creator, which bypasses RLS for the
-- query *inside* the function — breaking the cycle — the same pattern
-- already used by get_shared_note/search_profiles/etc.

create or replace function public.is_note_owner(note_id_input uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.notes where id = note_id_input and user_id = auth.uid()
  );
$$;

create or replace function public.get_my_collaborator_permission(note_id_input uuid)
returns text
language sql
security definer
set search_path = public
stable
as $$
  select permission from public.note_collaborators
  where note_id = note_id_input and user_id = auth.uid()
  limit 1;
$$;

revoke all on function public.is_note_owner(uuid) from public;
grant execute on function public.is_note_owner(uuid) to authenticated;
revoke all on function public.get_my_collaborator_permission(uuid) from public;
grant execute on function public.get_my_collaborator_permission(uuid) to authenticated;

drop policy if exists "Collaborators can view shared notes" on public.notes;
create policy "Collaborators can view shared notes" on public.notes
  for select to authenticated
  using (public.get_my_collaborator_permission(notes.id) is not null);

drop policy if exists "Editors can update shared notes" on public.notes;
create policy "Editors can update shared notes" on public.notes
  for update to authenticated
  using (public.get_my_collaborator_permission(notes.id) = 'edit')
  with check (public.get_my_collaborator_permission(notes.id) = 'edit');

drop policy if exists "Owners manage collaborators on their notes" on public.note_collaborators;
create policy "Owners manage collaborators on their notes" on public.note_collaborators
  for all to authenticated
  using (public.is_note_owner(note_collaborators.note_id))
  with check (public.is_note_owner(note_collaborators.note_id));
