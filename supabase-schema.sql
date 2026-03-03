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

-- Limited editions
ALTER TABLE public.records ADD COLUMN IF NOT EXISTS edition_size integer DEFAULT NULL;

-- Thumbnail (JPEG preview captured at publish time)
ALTER TABLE public.records ADD COLUMN IF NOT EXISTS thumbnail_path text;

-- Collections table (fan library)
CREATE TABLE IF NOT EXISTS public.collections (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  record_id      uuid NOT NULL REFERENCES public.records(id) ON DELETE CASCADE,
  user_id        uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  edition_number integer NOT NULL,
  collected_at   timestamptz DEFAULT now(),
  UNIQUE(record_id, user_id),
  UNIQUE(record_id, edition_number)
);

ALTER TABLE public.collections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "collections_select" ON public.collections FOR SELECT USING (true);
CREATE POLICY "collections_insert" ON public.collections FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Atomic edition claim (prevents race conditions)
CREATE OR REPLACE FUNCTION public.claim_edition(p_record_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_size  integer;
  v_count integer;
  v_num   integer;
BEGIN
  SELECT edition_size INTO v_size FROM public.records WHERE id = p_record_id;
  IF v_size IS NULL THEN RAISE EXCEPTION 'Not a limited edition'; END IF;

  SELECT COUNT(*) INTO v_count FROM public.collections WHERE record_id = p_record_id;
  IF v_count >= v_size THEN RAISE EXCEPTION 'Sold out'; END IF;

  v_num := v_count + 1;
  INSERT INTO public.collections (record_id, user_id, edition_number)
    VALUES (p_record_id, auth.uid(), v_num);
  RETURN v_num;
END;
$$;

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
