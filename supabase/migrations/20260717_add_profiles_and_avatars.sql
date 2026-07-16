-- Run in Supabase SQL Editor after the first migration.
create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9_]{3,20}$'),
  avatar_path text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Users view their own profile" on public.profiles
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users update their own profile" on public.profiles
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create or replace function public.create_profile_for_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  chosen_username text := lower(trim(new.raw_user_meta_data ->> 'username'));
begin
  if chosen_username !~ '^[a-z0-9_]{3,20}$' then
    raise exception 'Uporabniško ime naj ima 3–20 znakov: male črke, številke ali podčrtaj.';
  end if;
  insert into public.profiles (user_id, username) values (new.id, chosen_username);
  return new;
end;
$$;

drop trigger if exists create_profile_on_signup on auth.users;
create trigger create_profile_on_signup
  after insert on auth.users
  for each row execute procedure public.create_profile_for_new_user();

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do update set public = true;

create policy "Avatar images are public" on storage.objects
  for select using (bucket_id = 'avatars');
create policy "Users upload only their own avatar" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid()::text));
create policy "Users update only their own avatar" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid()::text));
create policy "Users delete only their own avatar" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid()::text));
