-- Public Wall of Fame (2026-10-25). Requires 20261018_2_wall_of_fame.sql and 20261018_5_wall_signature.sql.
--
--   * Reaching a $1,000,000,000 Bank makes a player eligible (wall_of_fame row, unchanged).
--   * The public wall lists only players who have signed it, in signing order, numbered
--     No. 1, No. 2, … — signature + public username only, never account details.
--   * get_wall_of_fame_page pages through it so the wall can hold thousands of names.
--   * One signature per player (unchanged), and no two players share a signature
--     (case-insensitive) so nobody can pose as someone already on the wall.
--
-- In-game recognition only. Apply manually in the Supabase SQL Editor. Safe to re-run.

CREATE INDEX IF NOT EXISTS wall_of_fame_signed_idx ON public.wall_of_fame (signed_at, user_id)
  WHERE display_name IS NOT NULL;

-- Unique signatures from now on. Existing duplicates (if any) are left as they are.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.wall_of_fame
    WHERE display_name IS NOT NULL
    GROUP BY lower(display_name) HAVING count(*) > 1
  ) THEN
    CREATE UNIQUE INDEX IF NOT EXISTS wall_of_fame_signature_uidx
      ON public.wall_of_fame (lower(display_name)) WHERE display_name IS NOT NULL;
  END IF;
END;
$$;

-- Signing order number for a signed player (No. 1 is the first ever to sign).
CREATE OR REPLACE FUNCTION public.wall_of_fame_number(p_uid uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT CASE WHEN me.display_name IS NULL THEN NULL ELSE (
    SELECT count(*)::integer FROM public.wall_of_fame w
    WHERE w.display_name IS NOT NULL
      AND (w.signed_at, w.user_id) <= (me.signed_at, me.user_id)
  ) END
  FROM public.wall_of_fame me
  WHERE me.user_id = p_uid;
$$;

REVOKE ALL ON FUNCTION public.wall_of_fame_number(uuid) FROM PUBLIC, anon, authenticated;

-- One page of the public wall: { total, entries: [{ number, signature, username, signed_at }] }.
CREATE OR REPLACE FUNCTION public.get_wall_of_fame_page(p_offset integer DEFAULT 0, p_limit integer DEFAULT 120)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  WITH signed AS (
    SELECT row_number() OVER (ORDER BY w.signed_at, w.user_id)::integer AS number,
           w.display_name AS signature,
           p.username,
           w.signed_at
    FROM public.wall_of_fame w
    INNER JOIN public.profiles p ON p.user_id = w.user_id
    WHERE w.display_name IS NOT NULL
  )
  SELECT jsonb_build_object(
    'total', (SELECT count(*) FROM signed),
    'entries', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'number', s.number, 'signature', s.signature, 'username', s.username, 'signed_at', s.signed_at
      ) ORDER BY s.number)
      FROM (
        SELECT * FROM signed ORDER BY number
        OFFSET greatest(coalesce(p_offset, 0), 0)
        LIMIT greatest(1, least(coalesce(p_limit, 120), 500))
      ) s
    ), '[]'::jsonb)
  );
$$;

REVOKE ALL ON FUNCTION public.get_wall_of_fame_page(integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_wall_of_fame_page(integer, integer) TO anon, authenticated;

-- The caller's place: eligible (inducted), signature, signing number.
CREATE OR REPLACE FUNCTION public.get_my_wall_signature()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT coalesce((
    SELECT jsonb_build_object(
      'inducted_at', inducted_at,
      'display_name', display_name,
      'signed_at', signed_at,
      'number', public.wall_of_fame_number(user_id)
    )
    FROM public.wall_of_fame WHERE user_id = auth.uid()
  ), '{}'::jsonb);
$$;

REVOKE ALL ON FUNCTION public.get_my_wall_signature() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_wall_signature() TO authenticated;

-- Sign once. Repeat calls return the stored signature unchanged.
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
    IF EXISTS (
      SELECT 1 FROM public.wall_of_fame o
      WHERE o.user_id <> v_uid AND o.display_name IS NOT NULL AND lower(o.display_name) = lower(v_name)
    ) THEN
      RAISE EXCEPTION 'name_taken' USING ERRCODE = '23505';
    END IF;
    UPDATE public.wall_of_fame
    SET display_name = v_name, signed_at = now()
    WHERE user_id = v_uid
    RETURNING * INTO w;
  END IF;

  RETURN jsonb_build_object(
    'display_name', w.display_name,
    'signed_at', w.signed_at,
    'inducted_at', w.inducted_at,
    'number', public.wall_of_fame_number(v_uid)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.stamp_wall_of_fame(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.stamp_wall_of_fame(text) TO authenticated;

-- Older app builds: the same public list (signed players only, signature shown).
CREATE OR REPLACE FUNCTION public.get_wall_of_fame(p_limit integer DEFAULT 500)
RETURNS TABLE (username text, inducted_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT w.display_name, w.signed_at
  FROM public.wall_of_fame w
  WHERE w.display_name IS NOT NULL
  ORDER BY w.signed_at ASC, w.user_id ASC
  LIMIT greatest(1, least(coalesce(p_limit, 500), 1000));
$$;

REVOKE ALL ON FUNCTION public.get_wall_of_fame(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_wall_of_fame(integer) TO anon, authenticated;
