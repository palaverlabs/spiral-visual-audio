-- Run this in your Supabase SQL editor to set up the schema.

-- Users table (extends auth.users)
create table if not exists public.users (
  id          uuid primary key references auth.users(id) on delete cascade,
  username    text unique not null,
  avatar_url  text,
  bio         text,
  created_at  timestamptz default now()
);

-- Auto-create user row on sign-up
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.users (id, username)
  values (new.id, split_part(new.email, '@', 1));
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Records table
create table if not exists public.records (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users(id) on delete cascade,
  title       text not null,
  artist      text,
  duration    float,
  quality     int,
  turns       int,
  sample_rate int,
  stereo      bool default false,
  file_path   text not null,
  file_size   bigint,
  plays       int default 0,
  is_public   bool default true,
  created_at  timestamptz default now()
);

-- Row-level security
alter table public.users  enable row level security;
alter table public.records enable row level security;

-- Users: readable by anyone, writable by owner
create policy "users_select" on public.users for select using (true);
create policy "users_update" on public.users for update using (auth.uid() = id);

-- Records: public ones readable by anyone; private only by owner
create policy "records_select" on public.records for select
  using (is_public or auth.uid() = user_id);

create policy "records_insert" on public.records for insert
  with check (auth.uid() = user_id);

create policy "records_update" on public.records for update
  using (auth.uid() = user_id);

create policy "records_delete" on public.records for delete
  using (auth.uid() = user_id);

-- Storage bucket: create a public bucket named "records" in the Supabase dashboard,
-- then add this policy so authenticated users can upload to their own folder:
--
-- Bucket: records
-- Policy name: "Authenticated users upload to own folder"
-- Allowed operation: INSERT
-- Target roles: authenticated
-- Policy: (bucket_id = 'records') AND (auth.uid()::text = (storage.foldername(name))[1])
--
-- And a public read policy:
-- Policy name: "Public read"
-- Allowed operation: SELECT
-- Target roles: public
-- Policy: bucket_id = 'records'
