-- NOTE: new schema changes live in supabase/migrations/. This file is the original baseline.
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

-- Atomic play counter (bypasses RLS so any visitor can increment)
CREATE OR REPLACE FUNCTION public.increment_plays(record_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER AS $$
  UPDATE public.records SET plays = plays + 1 WHERE id = record_id;
$$;

-- Custom cover art, description, album, genre
ALTER TABLE public.records ADD COLUMN IF NOT EXISTS cover_path text;
ALTER TABLE public.records ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE public.records ADD COLUMN IF NOT EXISTS album text;
ALTER TABLE public.records ADD COLUMN IF NOT EXISTS genre text;

-- ============================================================
-- Marketplace: credits ledger, pricing, secondary listings, royalties
-- ============================================================

-- Credits balance (internal ledger for now — not real currency).
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS balance integer NOT NULL DEFAULT 0;

-- Grant a starting balance so new users can try buying immediately.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.users (id, username, balance)
  VALUES (NEW.id, split_part(NEW.email, '@', 1), 500);
  RETURN NEW;
END;
$$;

-- Primary-sale price in credits. NULL = not for sale (never paired with edition_size).
ALTER TABLE public.records ADD COLUMN IF NOT EXISTS price integer DEFAULT NULL;
ALTER TABLE public.records ADD CONSTRAINT records_price_requires_edition
  CHECK (price IS NULL OR edition_size IS NOT NULL);
ALTER TABLE public.records ADD CONSTRAINT records_price_positive
  CHECK (price IS NULL OR price > 0);

-- Secondary-market listings: one active ask per owned numbered copy at a time.
CREATE TABLE IF NOT EXISTS public.listings (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id uuid NOT NULL REFERENCES public.collections(id) ON DELETE CASCADE,
  seller_id     uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  ask_price     integer NOT NULL CHECK (ask_price > 0),
  status        text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'sold', 'cancelled')),
  created_at    timestamptz DEFAULT now(),
  resolved_at   timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS listings_one_active_per_collection
  ON public.listings (collection_id) WHERE (status = 'active');
CREATE INDEX IF NOT EXISTS listings_active_idx ON public.listings (status, created_at DESC)
  WHERE (status = 'active');

ALTER TABLE public.listings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "listings_select" ON public.listings FOR SELECT USING (true);
-- No insert/update policy for the client role — all writes go through the
-- SECURITY DEFINER RPCs below, same pattern as claim_edition/collections today.

-- Append-only ledger of every primary purchase and secondary resale.
-- Source of truth for "last sale price" per copy and for buy/sell history.
CREATE TABLE IF NOT EXISTS public.transactions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  record_id       uuid NOT NULL REFERENCES public.records(id) ON DELETE CASCADE,
  collection_id   uuid REFERENCES public.collections(id) ON DELETE SET NULL,
  edition_number  integer NOT NULL,
  type            text NOT NULL CHECK (type IN ('primary', 'secondary')),
  buyer_id        uuid NOT NULL REFERENCES public.users(id),
  seller_id       uuid REFERENCES public.users(id),      -- NULL for primary sales
  price           integer NOT NULL,                       -- total paid by buyer
  royalty_amount  integer NOT NULL DEFAULT 0,              -- paid to the original artist
  platform_fee    integer NOT NULL DEFAULT 0,              -- retained by the platform
  seller_proceeds integer NOT NULL DEFAULT 0,              -- what the seller received
  created_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS transactions_record_idx ON public.transactions (record_id, created_at DESC);
CREATE INDEX IF NOT EXISTS transactions_record_edition_idx
  ON public.transactions (record_id, edition_number, created_at DESC);
CREATE INDEX IF NOT EXISTS transactions_buyer_idx ON public.transactions (buyer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS transactions_seller_idx ON public.transactions (seller_id, created_at DESC);

ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "transactions_select" ON public.transactions FOR SELECT USING (true);
-- No insert policy — written only by the RPCs below.

-- Current value of one owned copy: its active ask price, else the most recent
-- sale of that exact numbered copy, else its original purchase price.
CREATE OR REPLACE VIEW public.collection_values WITH (security_invoker = true) AS
SELECT
  c.id AS collection_id,
  c.user_id,
  c.record_id,
  c.edition_number,
  COALESCE(
    l.ask_price,
    (SELECT t.price FROM public.transactions t
       WHERE t.record_id = c.record_id AND t.edition_number = c.edition_number
       ORDER BY t.created_at DESC LIMIT 1),
    r.price
  ) AS current_value
FROM public.collections c
JOIN public.records r ON r.id = c.record_id
LEFT JOIN public.listings l ON l.collection_id = c.id AND l.status = 'active';

-- Buy an unclaimed numbered copy directly from the artist (replaces claim_edition).
CREATE OR REPLACE FUNCTION public.purchase_edition(p_record_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_size integer; v_price integer; v_artist uuid;
  v_claimed integer; v_num integer; v_buyer uuid := auth.uid();
  v_fee integer; v_artist_credit integer; v_collection_id uuid;
BEGIN
  IF v_buyer IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;

  SELECT edition_size, price, user_id INTO v_size, v_price, v_artist
    FROM public.records WHERE id = p_record_id FOR UPDATE;
  IF v_size IS NULL THEN RAISE EXCEPTION 'Not a limited edition'; END IF;
  IF v_price IS NULL THEN RAISE EXCEPTION 'Not for sale'; END IF;

  SELECT COUNT(*) INTO v_claimed FROM public.collections WHERE record_id = p_record_id;
  IF v_claimed >= v_size THEN RAISE EXCEPTION 'Sold out'; END IF;

  UPDATE public.users SET balance = balance - v_price
    WHERE id = v_buyer AND balance >= v_price;
  IF NOT FOUND THEN RAISE EXCEPTION 'Insufficient balance'; END IF;

  v_fee := floor(v_price * 0.05);           -- 5% platform fee on primary sales
  v_artist_credit := v_price - v_fee;
  UPDATE public.users SET balance = balance + v_artist_credit WHERE id = v_artist;

  v_num := v_claimed + 1;
  INSERT INTO public.collections (record_id, user_id, edition_number)
    VALUES (p_record_id, v_buyer, v_num)
    RETURNING id INTO v_collection_id;

  INSERT INTO public.transactions
    (record_id, collection_id, edition_number, type, buyer_id, seller_id,
     price, royalty_amount, platform_fee, seller_proceeds)
  VALUES
    (p_record_id, v_collection_id, v_num, 'primary', v_buyer, NULL,
     v_price, 0, v_fee, v_artist_credit);

  RETURN v_num;
END;
$$;

DROP FUNCTION IF EXISTS public.claim_edition(uuid);

-- List an owned copy for resale.
CREATE OR REPLACE FUNCTION public.create_listing(p_collection_id uuid, p_ask_price integer)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_owner uuid; v_id uuid;
BEGIN
  IF p_ask_price IS NULL OR p_ask_price <= 0 THEN RAISE EXCEPTION 'Invalid price'; END IF;

  SELECT user_id INTO v_owner FROM public.collections WHERE id = p_collection_id;
  IF v_owner IS NULL THEN RAISE EXCEPTION 'Not found'; END IF;
  IF v_owner != auth.uid() THEN RAISE EXCEPTION 'Not your copy'; END IF;

  IF EXISTS (SELECT 1 FROM public.listings WHERE collection_id = p_collection_id AND status = 'active') THEN
    RAISE EXCEPTION 'Already listed';
  END IF;

  INSERT INTO public.listings (collection_id, seller_id, ask_price)
  VALUES (p_collection_id, auth.uid(), p_ask_price)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- Cancel an active listing.
CREATE OR REPLACE FUNCTION public.cancel_listing(p_listing_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.listings SET status = 'cancelled', resolved_at = now()
    WHERE id = p_listing_id AND seller_id = auth.uid() AND status = 'active';
  IF NOT FOUND THEN RAISE EXCEPTION 'Not found or not yours'; END IF;
END;
$$;

-- Buy a listed copy on the secondary market. Artist earns a perpetual royalty
-- on every resale, even though they aren't a party to the trade.
CREATE OR REPLACE FUNCTION public.buy_listing(p_listing_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_listing public.listings%ROWTYPE;
  v_collection public.collections%ROWTYPE;
  v_artist uuid; v_buyer uuid := auth.uid();
  v_royalty integer; v_fee integer; v_seller_proceeds integer;
BEGIN
  IF v_buyer IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;

  SELECT * INTO v_listing FROM public.listings WHERE id = p_listing_id AND status = 'active' FOR UPDATE;
  IF v_listing IS NULL THEN RAISE EXCEPTION 'Listing not active'; END IF;
  IF v_listing.seller_id = v_buyer THEN RAISE EXCEPTION 'Cannot buy your own listing'; END IF;

  SELECT * INTO v_collection FROM public.collections WHERE id = v_listing.collection_id;
  SELECT user_id INTO v_artist FROM public.records WHERE id = v_collection.record_id;

  UPDATE public.users SET balance = balance - v_listing.ask_price
    WHERE id = v_buyer AND balance >= v_listing.ask_price;
  IF NOT FOUND THEN RAISE EXCEPTION 'Insufficient balance'; END IF;

  v_royalty := floor(v_listing.ask_price * 0.10);   -- 10% perpetual artist royalty
  v_fee := floor(v_listing.ask_price * 0.05);        -- 5% platform fee
  v_seller_proceeds := v_listing.ask_price - v_royalty - v_fee;

  UPDATE public.users SET balance = balance + v_royalty WHERE id = v_artist;
  UPDATE public.users SET balance = balance + v_seller_proceeds WHERE id = v_listing.seller_id;

  UPDATE public.collections SET user_id = v_buyer WHERE id = v_collection.id;
  UPDATE public.listings SET status = 'sold', resolved_at = now() WHERE id = p_listing_id;

  INSERT INTO public.transactions
    (record_id, collection_id, edition_number, type, buyer_id, seller_id,
     price, royalty_amount, platform_fee, seller_proceeds)
  VALUES
    (v_collection.record_id, v_collection.id, v_collection.edition_number, 'secondary',
     v_buyer, v_listing.seller_id, v_listing.ask_price, v_royalty, v_fee, v_seller_proceeds);
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
