-- expire_offers runs from pg_cron and inside the offer RPCs; clients have no reason to call it directly.
REVOKE EXECUTE ON FUNCTION public.expire_offers() FROM PUBLIC, anon, authenticated;
