-- Step 2 of the marketplace build spec: per-release market numbers for the price strip and browse cards.
-- "Last sale" counts resales only; primary purchases are the original price.
CREATE OR REPLACE VIEW public.release_market_stats WITH (security_invoker = true) AS
SELECT
  r.id AS record_id,
  r.edition_size,
  r.minted_count,
  r.price AS original_price,
  a.floor_ask,
  COALESCE(a.listings_count, 0) AS listings_count,
  ls.price AS last_sale_price,
  ls.created_at AS last_sale_at,
  (SELECT count(DISTINCT c.user_id) FROM public.collections c WHERE c.record_id = r.id) AS owners_count,
  COALESCE(v.volume_7d, 0) AS volume_7d,
  COALESCE(v.sales_7d, 0) AS sales_7d
FROM public.records r
LEFT JOIN LATERAL (
  SELECT min(l.ask_price) AS floor_ask, count(*) AS listings_count
  FROM public.listings l JOIN public.collections c ON c.id = l.collection_id
  WHERE c.record_id = r.id AND l.status = 'active'
) a ON true
LEFT JOIN LATERAL (
  SELECT t.price, t.created_at FROM public.transactions t
  WHERE t.record_id = r.id AND t.type = 'secondary'
  ORDER BY t.created_at DESC LIMIT 1
) ls ON true
LEFT JOIN LATERAL (
  SELECT sum(t.price) AS volume_7d, count(*) AS sales_7d FROM public.transactions t
  WHERE t.record_id = r.id AND t.type = 'secondary' AND t.created_at > now() - interval '7 days'
) v ON true
WHERE r.edition_size IS NOT NULL;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.release_market_stats FROM anon, authenticated;
GRANT SELECT ON public.release_market_stats TO anon, authenticated;

CREATE INDEX IF NOT EXISTS listings_collection_status_idx ON public.listings (collection_id, status);
