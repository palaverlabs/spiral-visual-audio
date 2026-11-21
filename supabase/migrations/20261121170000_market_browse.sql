-- Step 3 of the marketplace build spec: one row per public limited-edition release for /market browse.
-- buy_price = cheapest way to get a copy now: lowest ask, or the artist's price while editions are left.
-- change_7d_pct = latest resale vs the reference price 7 days ago (last resale before then, else original), only when a resale happened in the last 7 days.
CREATE OR REPLACE VIEW public.market_browse WITH (security_invoker = true) AS
SELECT
  s.record_id,
  r.title,
  r.artist,
  r.genre,
  r.cover_path,
  r.thumbnail_path,
  r.created_at,
  r.user_id AS artist_id,
  s.edition_size,
  s.minted_count,
  s.edition_size - s.minted_count AS editions_left,
  s.original_price,
  s.floor_ask,
  s.listings_count,
  s.last_sale_price,
  s.last_sale_at,
  s.owners_count,
  s.volume_7d,
  s.sales_7d,
  NULLIF(LEAST(
    COALESCE(s.floor_ask, 2147483647),
    CASE WHEN s.edition_size > s.minted_count AND s.original_price IS NOT NULL THEN s.original_price ELSE 2147483647 END
  ), 2147483647) AS buy_price,
  ll.latest_listed_at,
  CASE WHEN s.last_sale_at > now() - interval '7 days' AND ref.price > 0
       THEN round((s.last_sale_price - ref.price) * 100.0 / ref.price)::int END AS change_7d_pct
FROM public.release_market_stats s
JOIN public.records r ON r.id = s.record_id
LEFT JOIN LATERAL (
  SELECT max(l.created_at) AS latest_listed_at
  FROM public.listings l JOIN public.collections c ON c.id = l.collection_id
  WHERE c.record_id = s.record_id AND l.status = 'active'
) ll ON true
LEFT JOIN LATERAL (
  SELECT COALESCE(
    (SELECT t.price FROM public.transactions t
       WHERE t.record_id = s.record_id AND t.type = 'secondary' AND t.created_at <= now() - interval '7 days'
       ORDER BY t.created_at DESC LIMIT 1),
    s.original_price) AS price
) ref ON true
WHERE r.is_public;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.market_browse FROM anon, authenticated;
GRANT SELECT ON public.market_browse TO anon, authenticated;
