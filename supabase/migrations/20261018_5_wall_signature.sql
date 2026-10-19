-- Wall of Fame signatures: an inducted player stamps the name shown on the wall, once.
-- Requires 20261018_2_wall_of_fame.sql. Apply manually in the Supabase SQL Editor. Safe to re-run.

ALTER TABLE public.wall_of_fame
  ADD COLUMN IF NOT EXISTS display_name text,
  ADD COLUMN IF NOT EXISTS signed_at timestamptz;

ALTER TABLE public.wall_of_fame DROP CONSTRAINT IF EXISTS wall_of_fame_display_name_check;
ALTER TABLE public.wall_of_fame
  ADD CONSTRAINT wall_of_fame_display_name_check
  CHECK (display_name IS NULL OR display_name ~ '^[[:alpha:][:digit:] .''-]{2,24}$');

-- Stamp once. Repeat calls return the stored signature unchanged.
CREATE OR REPLACE FUNCTION public.stamp_wall_of_fame(p_name text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_name text := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
  w public.wall_of_fame%ROWTYPE;
BEGIN
  IF v_uid IS NULL OR coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) THEN
    RAISE EXCEPTION 'permanent_account_required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO w FROM public.wall_of_fame WHERE user_id = v_uid FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_inducted' USING ERRCODE = 'P0001';
  END IF;

  IF w.display_name IS NULL THEN
    IF v_name !~ '^[[:alpha:][:digit:] .''-]{2,24}$' THEN
      RAISE EXCEPTION 'invalid_name' USING ERRCODE = '22023';
    END IF;
    UPDATE public.wall_of_fame
    SET display_name = v_name, signed_at = now()
    WHERE user_id = v_uid
    RETURNING * INTO w;
  END IF;

  RETURN jsonb_build_object(
    'display_name', w.display_name,
    'signed_at', w.signed_at,
    'inducted_at', w.inducted_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.stamp_wall_of_fame(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.stamp_wall_of_fame(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_my_wall_signature()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT coalesce((
    SELECT jsonb_build_object('inducted_at', inducted_at, 'display_name', display_name, 'signed_at', signed_at)
    FROM public.wall_of_fame WHERE user_id = auth.uid()
  ), '{}'::jsonb);
$$;

REVOKE ALL ON FUNCTION public.get_my_wall_signature() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_wall_signature() TO authenticated;

-- Public list shows the stamped name (falls back to the username until stamped).
CREATE OR REPLACE FUNCTION public.get_wall_of_fame(p_limit integer DEFAULT 500)
RETURNS TABLE (username text, inducted_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT coalesce(w.display_name, p.username), w.inducted_at
  FROM public.wall_of_fame w
  INNER JOIN public.profiles p ON p.user_id = w.user_id
  ORDER BY w.inducted_at ASC, p.username_normalized ASC
  LIMIT greatest(1, least(coalesce(p_limit, 500), 1000));
$$;

REVOKE ALL ON FUNCTION public.get_wall_of_fame(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_wall_of_fame(integer) TO anon, authenticated;
