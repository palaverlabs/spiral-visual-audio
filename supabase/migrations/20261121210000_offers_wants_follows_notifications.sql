-- Step 5 of the marketplace build spec: offers (with escrow), wantlist, follows, notifications.
-- Offers can target any edition of a release (edition_number NULL) or one specific number.
-- Offer credits move from balance to held_balance until accepted, cancelled, declined or expired.
-- Credit invariant: sum(balance) + sum(held_balance) + platform fees = grants.

-- ── Escrow ──────────────────────────────────────────────────────────
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS held_balance integer NOT NULL DEFAULT 0 CHECK (held_balance >= 0);

-- ── Offers ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.offers (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  record_id      uuid NOT NULL REFERENCES public.records(id) ON DELETE CASCADE,
  edition_number integer,                       -- NULL = any edition
  buyer_id       uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  price          integer NOT NULL CHECK (price > 0),
  status         text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'accepted', 'cancelled', 'declined', 'expired')),
  expires_at     timestamptz NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  resolved_at    timestamptz,
  collection_id  uuid REFERENCES public.collections(id) ON DELETE SET NULL,  -- the copy it bought, once accepted
  seller_id      uuid REFERENCES public.users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS offers_record_active_idx ON public.offers (record_id, status, price DESC);
CREATE INDEX IF NOT EXISTS offers_buyer_idx ON public.offers (buyer_id, status);
ALTER TABLE public.offers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "offers_select" ON public.offers FOR SELECT USING (true);
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.offers FROM anon, authenticated;

-- Refund and close every active offer past its expiry. Safe to call any time.
CREATE OR REPLACE FUNCTION public.expire_offers()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE o public.offers; n integer := 0;
BEGIN
  FOR o IN SELECT * FROM public.offers WHERE status = 'active' AND expires_at <= now() FOR UPDATE SKIP LOCKED LOOP
    UPDATE public.users SET held_balance = held_balance - o.price, balance = balance + o.price WHERE id = o.buyer_id;
    UPDATE public.offers SET status = 'expired', resolved_at = now() WHERE id = o.id;
    n := n + 1;
  END LOOP;
  RETURN n;
END;
$$;

CREATE OR REPLACE FUNCTION public.place_offer(p_record_id uuid, p_price integer, p_edition integer DEFAULT NULL, p_days integer DEFAULT 7)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE r public.records; v_buyer uuid := auth.uid(); v_id uuid;
BEGIN
  IF v_buyer IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  PERFORM public.expire_offers();
  IF p_price IS NULL OR p_price <= 0 THEN RAISE EXCEPTION 'Invalid price'; END IF;
  IF p_days IS NULL OR p_days < 1 OR p_days > 30 THEN RAISE EXCEPTION 'Expiry must be 1 to 30 days'; END IF;
  SELECT * INTO r FROM public.records WHERE id = p_record_id;
  IF r.id IS NULL OR r.edition_size IS NULL THEN RAISE EXCEPTION 'Not a limited edition'; END IF;
  IF p_edition IS NOT NULL THEN
    IF p_edition < 1 OR p_edition > r.edition_size THEN RAISE EXCEPTION 'No such edition'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.collections WHERE record_id = p_record_id AND edition_number = p_edition) THEN
      RAISE EXCEPTION 'That edition has not been minted yet';
    END IF;
    IF EXISTS (SELECT 1 FROM public.collections WHERE record_id = p_record_id AND edition_number = p_edition AND user_id = v_buyer) THEN
      RAISE EXCEPTION 'You already own that edition';
    END IF;
  END IF;

  UPDATE public.users SET balance = balance - p_price, held_balance = held_balance + p_price
    WHERE id = v_buyer AND balance >= p_price;
  IF NOT FOUND THEN RAISE EXCEPTION 'Insufficient balance'; END IF;

  INSERT INTO public.offers (record_id, edition_number, buyer_id, price, expires_at)
    VALUES (p_record_id, p_edition, v_buyer, p_price, now() + make_interval(days => p_days))
    RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_offer(p_offer_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE o public.offers;
BEGIN
  SELECT * INTO o FROM public.offers WHERE id = p_offer_id AND buyer_id = auth.uid() AND status = 'active' FOR UPDATE;
  IF o.id IS NULL THEN RAISE EXCEPTION 'Offer not active'; END IF;
  UPDATE public.users SET held_balance = held_balance - o.price, balance = balance + o.price WHERE id = o.buyer_id;
  UPDATE public.offers SET status = 'cancelled', resolved_at = now() WHERE id = o.id;
END;
$$;

-- The owner of a specific edition can turn down an offer on it. Any-edition offers stay open for other owners.
CREATE OR REPLACE FUNCTION public.decline_offer(p_offer_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE o public.offers;
BEGIN
  SELECT * INTO o FROM public.offers WHERE id = p_offer_id AND status = 'active' FOR UPDATE;
  IF o.id IS NULL THEN RAISE EXCEPTION 'Offer not active'; END IF;
  IF o.edition_number IS NULL THEN RAISE EXCEPTION 'Offers on any edition cannot be declined'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.collections WHERE record_id = o.record_id AND edition_number = o.edition_number AND user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Not your copy';
  END IF;
  UPDATE public.users SET held_balance = held_balance - o.price, balance = balance + o.price WHERE id = o.buyer_id;
  UPDATE public.offers SET status = 'declined', resolved_at = now(), seller_id = auth.uid() WHERE id = o.id;
END;
$$;

-- Sell one of your copies to an offer. Same settlement as a purchase, so royalties apply.
CREATE OR REPLACE FUNCTION public.accept_offer(p_offer_id uuid, p_collection_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE o public.offers; c public.collections; v_seller uuid := auth.uid();
BEGIN
  IF v_seller IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  SELECT * INTO o FROM public.offers WHERE id = p_offer_id FOR UPDATE;
  IF o.id IS NULL OR o.status <> 'active' THEN RAISE EXCEPTION 'Offer not active'; END IF;
  IF o.expires_at <= now() THEN PERFORM public.expire_offers(); RAISE EXCEPTION 'Offer expired'; END IF;

  SELECT * INTO c FROM public.collections WHERE id = p_collection_id FOR UPDATE;
  IF c.id IS NULL OR c.user_id IS DISTINCT FROM v_seller THEN RAISE EXCEPTION 'Not your copy'; END IF;
  IF c.record_id <> o.record_id THEN RAISE EXCEPTION 'Offer is for a different release'; END IF;
  IF o.edition_number IS NOT NULL AND o.edition_number <> c.edition_number THEN RAISE EXCEPTION 'Offer is for a different edition'; END IF;
  IF o.buyer_id = v_seller THEN RAISE EXCEPTION 'Cannot accept your own offer'; END IF;

  -- A listed copy sold by offer is no longer for sale.
  UPDATE public.listings SET status = 'cancelled', resolved_at = now() WHERE collection_id = c.id AND status = 'active';

  -- Release the hold, then settle exactly like a purchase.
  UPDATE public.users SET held_balance = held_balance - o.price, balance = balance + o.price WHERE id = o.buyer_id;
  PERFORM public.settle_sale(c.record_id, c.id, c.edition_number, 'secondary', o.buyer_id, v_seller, o.price);
  UPDATE public.collections SET user_id = o.buyer_id WHERE id = c.id;
  UPDATE public.offers SET status = 'accepted', resolved_at = now(), collection_id = c.id, seller_id = v_seller WHERE id = o.id;
END;
$$;

-- ── Wantlist ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.wants (
  user_id    uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  record_id  uuid NOT NULL REFERENCES public.records(id) ON DELETE CASCADE,
  max_price  integer CHECK (max_price IS NULL OR max_price > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, record_id)
);
ALTER TABLE public.wants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wants_select" ON public.wants FOR SELECT USING (true);
CREATE POLICY "wants_insert" ON public.wants FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "wants_update" ON public.wants FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "wants_delete" ON public.wants FOR DELETE TO authenticated USING (user_id = auth.uid());
REVOKE ALL ON public.wants FROM anon;
GRANT SELECT ON public.wants TO anon;
REVOKE TRUNCATE ON public.wants FROM authenticated;

-- ── Follows ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.follows (
  follower_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  followee_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (follower_id, followee_id),
  CHECK (follower_id <> followee_id)
);
CREATE INDEX IF NOT EXISTS follows_followee_idx ON public.follows (followee_id);
ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "follows_select" ON public.follows FOR SELECT USING (true);
CREATE POLICY "follows_insert" ON public.follows FOR INSERT TO authenticated WITH CHECK (follower_id = auth.uid());
CREATE POLICY "follows_delete" ON public.follows FOR DELETE TO authenticated USING (follower_id = auth.uid());
REVOKE ALL ON public.follows FROM anon;
GRANT SELECT ON public.follows TO anon;
REVOKE UPDATE, TRUNCATE ON public.follows FROM authenticated;

-- ── Notifications ───────────────────────────────────────────────────
-- Types: want_listed, offer_received, offer_accepted, copy_sold, edition_collected, followed_released
CREATE TABLE IF NOT EXISTS public.notifications (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  type           text NOT NULL,
  record_id      uuid REFERENCES public.records(id) ON DELETE CASCADE,
  edition_number integer,
  actor_id       uuid REFERENCES public.users(id) ON DELETE SET NULL,
  amount         integer,
  read_at        timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notifications_user_idx ON public.notifications (user_id, created_at DESC);
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notifications_select_own" ON public.notifications FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "notifications_update_own" ON public.notifications FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
REVOKE ALL ON public.notifications FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.notifications FROM authenticated;
GRANT SELECT ON public.notifications TO authenticated;
GRANT UPDATE (read_at) ON public.notifications TO authenticated;

-- Listing → wantlist alerts (ask at or under the want's max price, or any price when no max).
CREATE OR REPLACE FUNCTION public.notify_on_listing()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_record uuid; v_edition integer;
BEGIN
  SELECT record_id, edition_number INTO v_record, v_edition FROM public.collections WHERE id = NEW.collection_id;
  INSERT INTO public.notifications (user_id, type, record_id, edition_number, actor_id, amount)
  SELECT w.user_id, 'want_listed', v_record, v_edition, NEW.seller_id, NEW.ask_price
  FROM public.wants w
  WHERE w.record_id = v_record AND w.user_id <> NEW.seller_id
    AND (w.max_price IS NULL OR NEW.ask_price <= w.max_price);
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS listings_notify ON public.listings;
CREATE TRIGGER listings_notify AFTER INSERT ON public.listings FOR EACH ROW EXECUTE FUNCTION public.notify_on_listing();

-- Offer placed → owners who could accept it. Offer accepted → the buyer.
CREATE OR REPLACE FUNCTION public.notify_on_offer()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.notifications (user_id, type, record_id, edition_number, actor_id, amount)
    SELECT DISTINCT c.user_id, 'offer_received', NEW.record_id, NEW.edition_number, NEW.buyer_id, NEW.price
    FROM public.collections c
    WHERE c.record_id = NEW.record_id AND c.user_id <> NEW.buyer_id
      AND (NEW.edition_number IS NULL OR c.edition_number = NEW.edition_number);
  ELSIF NEW.status = 'accepted' AND OLD.status = 'active' THEN
    INSERT INTO public.notifications (user_id, type, record_id, edition_number, actor_id, amount)
    SELECT NEW.buyer_id, 'offer_accepted', NEW.record_id, c.edition_number, NEW.seller_id, NEW.price
    FROM public.collections c WHERE c.id = NEW.collection_id;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS offers_notify ON public.offers;
CREATE TRIGGER offers_notify AFTER INSERT OR UPDATE OF status ON public.offers FOR EACH ROW EXECUTE FUNCTION public.notify_on_offer();

-- Sale → seller (resale) or artist (primary).
CREATE OR REPLACE FUNCTION public.notify_on_sale()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.type = 'secondary' AND NEW.seller_id IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, type, record_id, edition_number, actor_id, amount)
    VALUES (NEW.seller_id, 'copy_sold', NEW.record_id, NEW.edition_number, NEW.buyer_id, NEW.price);
  ELSIF NEW.type = 'primary' THEN
    INSERT INTO public.notifications (user_id, type, record_id, edition_number, actor_id, amount)
    SELECT r.user_id, 'edition_collected', NEW.record_id, NEW.edition_number, NEW.buyer_id, NEW.price
    FROM public.records r WHERE r.id = NEW.record_id AND r.user_id <> NEW.buyer_id;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS transactions_notify ON public.transactions;
CREATE TRIGGER transactions_notify AFTER INSERT ON public.transactions FOR EACH ROW EXECUTE FUNCTION public.notify_on_sale();

-- New public release → the artist's followers.
CREATE OR REPLACE FUNCTION public.notify_on_release()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.is_public THEN
    INSERT INTO public.notifications (user_id, type, record_id, actor_id)
    SELECT f.follower_id, 'followed_released', NEW.id, NEW.user_id FROM public.follows f WHERE f.followee_id = NEW.user_id;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS records_notify ON public.records;
CREATE TRIGGER records_notify AFTER INSERT ON public.records FOR EACH ROW EXECUTE FUNCTION public.notify_on_release();

REVOKE EXECUTE ON FUNCTION public.notify_on_listing(), public.notify_on_offer(), public.notify_on_sale(), public.notify_on_release() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.expire_offers() FROM anon;

-- ── Market stats: highest offer ─────────────────────────────────────
CREATE OR REPLACE VIEW public.release_offer_stats WITH (security_invoker = true) AS
SELECT record_id, max(price) AS top_offer, count(*) AS offers_count
FROM public.offers WHERE status = 'active' AND expires_at > now()
GROUP BY record_id;
GRANT SELECT ON public.release_offer_stats TO anon, authenticated;

-- ── Expire offers hourly ────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pg_cron;
SELECT cron.schedule('expire-offers', '7 * * * *', 'SELECT public.expire_offers()');
