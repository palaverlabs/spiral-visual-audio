-- Step 4 of the marketplace build spec: collector profile.
-- Display name, and a four-slot showcase of pinned editions the owner must hold.

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS display_name text
  CHECK (display_name IS NULL OR char_length(display_name) <= 60);
ALTER TABLE public.users ADD CONSTRAINT users_bio_length CHECK (bio IS NULL OR char_length(bio) <= 500) NOT VALID;
GRANT UPDATE (display_name) ON public.users TO authenticated;

CREATE TABLE IF NOT EXISTS public.profile_pins (
  user_id       uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  slot          smallint NOT NULL CHECK (slot BETWEEN 1 AND 4),
  collection_id uuid NOT NULL REFERENCES public.collections(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, slot),
  UNIQUE (user_id, collection_id)
);
ALTER TABLE public.profile_pins ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profile_pins_select" ON public.profile_pins FOR SELECT USING (true);
CREATE POLICY "profile_pins_insert" ON public.profile_pins FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND EXISTS (
    SELECT 1 FROM public.collections c WHERE c.id = collection_id AND c.user_id = auth.uid()));
CREATE POLICY "profile_pins_delete" ON public.profile_pins FOR DELETE TO authenticated
  USING (user_id = auth.uid());
REVOKE ALL ON public.profile_pins FROM anon;
REVOKE UPDATE, TRUNCATE ON public.profile_pins FROM authenticated;
GRANT SELECT ON public.profile_pins TO anon, authenticated;
GRANT INSERT, DELETE ON public.profile_pins TO authenticated;

-- A pin stops counting once its copy is sold: drop it when ownership moves.
CREATE OR REPLACE FUNCTION public.drop_stale_pins()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    DELETE FROM public.profile_pins WHERE collection_id = NEW.id AND user_id = OLD.user_id;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.drop_stale_pins() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS collections_drop_stale_pins ON public.collections;
CREATE TRIGGER collections_drop_stale_pins AFTER UPDATE OF user_id ON public.collections
  FOR EACH ROW EXECUTE FUNCTION public.drop_stale_pins();
