-- Patch: fix infinite recursion in room_players SELECT RLS policy.
-- Safe to run once against a database that already applied
-- 20260810_phase1_private_1v1_rooms.sql.
-- Does not disable RLS. Does not reopen tables to anon/public.

-- Cause:
-- room_players_select_member queried public.room_players inside its own
-- USING expression, which re-entered the same policy and recursed.
-- rooms_select_member also queried room_players and could hit the same loop.

-- ---------------------------------------------------------------------------
-- SECURITY DEFINER membership helper (bypasses RLS; uses auth.uid() only)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_room_member(p_room_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.room_players rp
    WHERE rp.room_id = p_room_id
      AND rp.user_id = auth.uid()
  );
$$;

REVOKE ALL ON FUNCTION public.is_room_member(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_room_member(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.is_room_member(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Recreate member-only SELECT policies (non-recursive)
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS rooms_select_member ON public.rooms;
CREATE POLICY rooms_select_member
  ON public.rooms
  FOR SELECT
  TO authenticated
  USING (public.is_room_member(id));

DROP POLICY IF EXISTS room_players_select_member ON public.room_players;
CREATE POLICY room_players_select_member
  ON public.room_players
  FOR SELECT
  TO authenticated
  USING (public.is_room_member(room_id));

-- Keep RLS enabled and table grants unchanged:
-- authenticated may SELECT only; mutations remain RPC-only.
-- anon/public still have no table access from the original migration.
