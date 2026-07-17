-- Run in Supabase SQL Editor. This is the only public read path: callers
-- must know the unguessable share token, and cannot query the notes table.
create or replace function public.get_shared_note(share_token_input text)
returns table (
  id uuid,
  title text,
  content text,
  subject text,
  quiz_json jsonb
)
language sql
security definer
set search_path = public
stable
as $$
  select n.id, n.title, n.content, n.subject, n.quiz_json
  from public.notes n
  where n.share_token = share_token_input
  limit 1;
$$;

revoke all on function public.get_shared_note(text) from public;
grant execute on function public.get_shared_note(text) to anon, authenticated;
