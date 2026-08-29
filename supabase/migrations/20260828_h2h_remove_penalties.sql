-- Remove matchup penalties: both players keep full raw value on every position.
CREATE OR REPLACE FUNCTION public.calculate_head_to_head_penalty(
  winner_value numeric,
  loser_value numeric
)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  RETURN 0;
END;
$$;
