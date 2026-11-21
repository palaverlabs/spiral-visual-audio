-- Step 1 of the marketplace build spec: lock down the ledger.
-- - Balance and ledger tables are writable only through SECURITY DEFINER RPCs.
-- - Collectors may own multiple editions of one release.
-- - Edition numbers come from records.minted_count, not COUNT(*).
-- - One settlement path (settle_sale) with rates in fee_config.
-- - Transactions are hash-chained; verify_ledger() checks the chain.
-- - collection_values never uses the owner's own ask.

-- ── Client privileges ────────────────────────────────────────────────
-- users: clients may only edit profile fields. Rows are created by the auth trigger.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.users FROM anon, authenticated;
GRANT UPDATE (username, avatar_url, bio) ON public.users TO authenticated;

-- Ledger tables: read-only to clients; all writes go through RPCs.
DROP POLICY IF EXISTS "collections_insert" ON public.collections;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.collections, public.listings, public.transactions FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.collection_values FROM anon, authenticated;

-- records: owners can insert and delete their own and edit descriptive fields only.
-- Edition size, price, play count and minted count are not client-editable after insert.
REVOKE UPDATE, TRUNCATE ON public.records FROM anon, authenticated;
REVOKE INSERT, DELETE ON public.records FROM anon;
GRANT UPDATE (title, artist, description, album, genre, is_public, cover_path, thumbnail_path) ON public.records TO authenticated;

-- ── Multiple editions per collector ─────────────────────────────────
ALTER TABLE public.collections DROP CONSTRAINT IF EXISTS collections_record_id_user_id_key;
CREATE INDEX IF NOT EXISTS collections_user_idx ON public.collections (user_id, record_id);

-- ── Stable edition numbering ────────────────────────────────────────
ALTER TABLE public.records ADD COLUMN IF NOT EXISTS minted_count integer NOT NULL DEFAULT 0;
UPDATE public.records r SET minted_count = COALESCE(
  (SELECT max(edition_number) FROM public.collections c WHERE c.record_id = r.id), 0);

CREATE OR REPLACE FUNCTION public.records_before_insert()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  NEW.minted_count := 0;
  NEW.plays := 0;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS records_before_insert ON public.records;
CREATE TRIGGER records_before_insert BEFORE INSERT ON public.records
  FOR EACH ROW EXECUTE FUNCTION public.records_before_insert();

-- ── Fee config ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.fee_config (
  id                boolean PRIMARY KEY DEFAULT true CHECK (id),
  royalty_bps       integer NOT NULL CHECK (royalty_bps BETWEEN 0 AND 10000),
  secondary_fee_bps integer NOT NULL CHECK (secondary_fee_bps BETWEEN 0 AND 10000),
  primary_fee_bps   integer NOT NULL CHECK (primary_fee_bps BETWEEN 0 AND 10000)
);
INSERT INTO public.fee_config (royalty_bps, secondary_fee_bps, primary_fee_bps)
  VALUES (1000, 500, 500) ON CONFLICT (id) DO NOTHING;
ALTER TABLE public.fee_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "fee_config_select" ON public.fee_config;
CREATE POLICY "fee_config_select" ON public.fee_config FOR SELECT USING (true);
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.fee_config FROM anon, authenticated;

-- ── Hash chain ──────────────────────────────────────────────────────
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS prev_hash text;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS hash text;

CREATE OR REPLACE FUNCTION public.tx_hash(t public.transactions)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $$
  SELECT encode(sha256(convert_to(concat_ws('|',
    COALESCE(t.prev_hash, ''), t.id, t.record_id, t.edition_number, t.type,
    t.buyer_id, COALESCE(t.seller_id::text, ''), t.price, t.royalty_amount,
    t.platform_fee, t.seller_proceeds, extract(epoch FROM t.created_at)::text
  ), 'UTF8')), 'hex');
$$;

-- Backfill any existing rows in order.
DO $$
DECLARE t public.transactions; v_prev text := NULL;
BEGIN
  FOR t IN SELECT * FROM public.transactions ORDER BY created_at, id LOOP
    t.prev_hash := v_prev;
    UPDATE public.transactions SET prev_hash = v_prev, hash = public.tx_hash(t) WHERE id = t.id;
    v_prev := public.tx_hash(t);
  END LOOP;
END $$;

-- Returns the id of the first transaction whose hash or link is wrong, or NULL if the chain verifies.
CREATE OR REPLACE FUNCTION public.verify_ledger()
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE t public.transactions; v_prev text := NULL;
BEGIN
  FOR t IN SELECT * FROM public.transactions ORDER BY created_at, id LOOP
    IF t.prev_hash IS DISTINCT FROM v_prev OR t.hash IS DISTINCT FROM public.tx_hash(t) THEN
      RETURN t.id;
    END IF;
    v_prev := t.hash;
  END LOOP;
  RETURN NULL;
END;
$$;

-- ── Settlement ──────────────────────────────────────────────────────
-- Internal: moves credits for one sale and appends the hash-chained transaction.
-- Primary: buyer → artist (minus platform fee). Secondary: buyer → seller, minus royalty to artist and platform fee.
CREATE OR REPLACE FUNCTION public.settle_sale(
  p_record_id uuid, p_collection_id uuid, p_edition integer, p_type text,
  p_buyer uuid, p_seller uuid, p_price integer
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_cfg public.fee_config; v_artist uuid;
  v_royalty integer := 0; v_fee integer; v_proceeds integer; v_payee uuid;
  v_tx public.transactions;
BEGIN
  SELECT * INTO v_cfg FROM public.fee_config;
  SELECT user_id INTO v_artist FROM public.records WHERE id = p_record_id;

  UPDATE public.users SET balance = balance - p_price WHERE id = p_buyer AND balance >= p_price;
  IF NOT FOUND THEN RAISE EXCEPTION 'Insufficient balance'; END IF;

  IF p_type = 'primary' THEN
    v_fee := floor(p_price * v_cfg.primary_fee_bps / 10000.0);
    v_payee := v_artist;
  ELSE
    v_royalty := floor(p_price * v_cfg.royalty_bps / 10000.0);
    v_fee := floor(p_price * v_cfg.secondary_fee_bps / 10000.0);
    v_payee := p_seller;
    UPDATE public.users SET balance = balance + v_royalty WHERE id = v_artist;
  END IF;
  v_proceeds := p_price - v_royalty - v_fee;
  UPDATE public.users SET balance = balance + v_proceeds WHERE id = v_payee;

  -- Serialize chain appends so every transaction links to exactly one predecessor.
  PERFORM pg_advisory_xact_lock(hashtext('spiral_ledger'));
  v_tx.id := gen_random_uuid();
  v_tx.record_id := p_record_id; v_tx.collection_id := p_collection_id;
  v_tx.edition_number := p_edition; v_tx.type := p_type;
  v_tx.buyer_id := p_buyer; v_tx.seller_id := p_seller; v_tx.price := p_price;
  v_tx.royalty_amount := v_royalty; v_tx.platform_fee := v_fee; v_tx.seller_proceeds := v_proceeds;
  v_tx.created_at := clock_timestamp();
  SELECT hash INTO v_tx.prev_hash FROM public.transactions ORDER BY created_at DESC, id DESC LIMIT 1;
  v_tx.hash := public.tx_hash(v_tx);
  INSERT INTO public.transactions SELECT v_tx.*;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.settle_sale(uuid, uuid, integer, text, uuid, uuid, integer) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.purchase_edition(p_record_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  r public.records; v_buyer uuid := auth.uid(); v_num integer; v_collection_id uuid;
BEGIN
  IF v_buyer IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  SELECT * INTO r FROM public.records WHERE id = p_record_id FOR UPDATE;
  IF r.id IS NULL THEN RAISE EXCEPTION 'Not found'; END IF;
  IF r.edition_size IS NULL THEN RAISE EXCEPTION 'Not a limited edition'; END IF;
  IF r.price IS NULL THEN RAISE EXCEPTION 'Not for sale'; END IF;
  IF r.minted_count >= r.edition_size THEN RAISE EXCEPTION 'Sold out'; END IF;

  v_num := r.minted_count + 1;
  UPDATE public.records SET minted_count = v_num WHERE id = p_record_id;
  INSERT INTO public.collections (record_id, user_id, edition_number)
    VALUES (p_record_id, v_buyer, v_num) RETURNING id INTO v_collection_id;

  PERFORM public.settle_sale(p_record_id, v_collection_id, v_num, 'primary', v_buyer, NULL, r.price);
  RETURN v_num;
END;
$$;

CREATE OR REPLACE FUNCTION public.buy_listing(p_listing_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_listing public.listings; v_col public.collections; v_buyer uuid := auth.uid();
BEGIN
  IF v_buyer IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  SELECT * INTO v_listing FROM public.listings WHERE id = p_listing_id AND status = 'active' FOR UPDATE;
  IF v_listing.id IS NULL THEN RAISE EXCEPTION 'Listing not active'; END IF;
  IF v_listing.seller_id = v_buyer THEN RAISE EXCEPTION 'Cannot buy your own listing'; END IF;

  SELECT * INTO v_col FROM public.collections WHERE id = v_listing.collection_id FOR UPDATE;
  IF v_col.user_id IS DISTINCT FROM v_listing.seller_id THEN
    UPDATE public.listings SET status = 'cancelled', resolved_at = now() WHERE id = p_listing_id;
    RAISE EXCEPTION 'Listing not active';
  END IF;

  PERFORM public.settle_sale(v_col.record_id, v_col.id, v_col.edition_number, 'secondary',
                             v_buyer, v_listing.seller_id, v_listing.ask_price);
  UPDATE public.collections SET user_id = v_buyer WHERE id = v_col.id;
  UPDATE public.listings SET status = 'sold', resolved_at = now() WHERE id = p_listing_id;
END;
$$;

-- ── Collection value ────────────────────────────────────────────────
-- Last sale of that exact copy, else the release floor from other copies' asks, else original price.
CREATE OR REPLACE VIEW public.collection_values WITH (security_invoker = true) AS
SELECT
  c.id AS collection_id,
  c.user_id,
  c.record_id,
  c.edition_number,
  COALESCE(
    (SELECT t.price FROM public.transactions t
       WHERE t.collection_id = c.id
       ORDER BY t.created_at DESC LIMIT 1),
    (SELECT min(l.ask_price) FROM public.listings l
       JOIN public.collections c2 ON c2.id = l.collection_id
       WHERE c2.record_id = c.record_id AND l.status = 'active' AND l.collection_id <> c.id),
    r.price
  ) AS current_value
FROM public.collections c
JOIN public.records r ON r.id = c.record_id;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.collection_values FROM anon, authenticated;

-- ── Starting grant for accounts created before the 500-credit sign-up grant ──
UPDATE public.users u SET balance = 500
WHERE u.balance = 0
  AND NOT EXISTS (SELECT 1 FROM public.transactions t WHERE t.buyer_id = u.id OR t.seller_id = u.id);
