-- In-app account deletion: remove multiplayer records and the anonymous auth user.
--
-- Security model (parameterless RPC):
--   • Identity comes only from auth.uid() via public._mp_require_auth(); no client user id.
--   • SECURITY DEFINER is required solely to DELETE FROM auth.users.
--   • search_path is empty; all objects referenced with schema qualification.
--   • Entire function runs in one transaction; any error rolls back all changes.
--   • Deletes are scoped to uid = auth.uid() only. Other users' accounts are never touched.
--   • Hosted-room DELETE cascades room-scoped rows for that lobby only (shared session data).

CREATE OR REPLACE FUNCTION public.delete_my_data()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  uid uuid := public._mp_require_auth();
BEGIN
  -- Belt-and-suspenders: uid must match the invoker's JWT subject.
  IF uid IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED' USING ERRCODE = 'P0001';
  END IF;

  -- Abandon in-progress rooms this user participates in (status only; no cross-user deletes).
  UPDATE public.rooms r
  SET status = 'abandoned'
  WHERE r.status IN ('waiting', 'playing')
    AND (
      r.host_user_id = uid
      OR EXISTS (
        SELECT 1
        FROM public.room_players rp
        WHERE rp.room_id = r.id
          AND rp.user_id = uid
      )
    );

  -- Remove rows owned by this user (user_id = uid only).
  DELETE FROM public.h2h_picks pk WHERE pk.user_id = uid;
  DELETE FROM public.match_results mr WHERE mr.user_id = uid;
  DELETE FROM public.room_players rp WHERE rp.user_id = uid;

  -- Delete lobbies hosted by this user. ON DELETE CASCADE removes room-scoped rows
  -- (h2h_matches, h2h_rounds, h2h_picks, match_results, room_players) for those rooms only.
  DELETE FROM public.rooms r WHERE r.host_user_id = uid;

  -- h2h_matches.p1_user_id / p2_user_id lack ON DELETE CASCADE; clear remaining participations
  -- (e.g. guest in someone else's lobby). Does not delete other users or their accounts.
  DELETE FROM public.h2h_matches m
  WHERE m.p1_user_id = uid OR m.p2_user_id = uid;

  -- Requires SECURITY DEFINER; scoped to the caller's uid only.
  DELETE FROM auth.users u WHERE u.id = uid;

  RETURN pg_catalog.jsonb_build_object('ok', true, 'deleted', true);
END;
$$;

REVOKE ALL ON FUNCTION public.delete_my_data() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_my_data() FROM anon;
REVOKE ALL ON FUNCTION public.delete_my_data() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.delete_my_data() TO authenticated;
