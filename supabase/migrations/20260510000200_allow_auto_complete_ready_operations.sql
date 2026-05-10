-- Finished-goods receipt approval can auto-complete a fully received production
-- order. The route stamps actual start/end and completed quantity in the same
-- update, so allow that specific ready -> completed operation transition.

CREATE OR REPLACE FUNCTION public.mpo_is_operation_transition_allowed(
  p_old_status TEXT,
  p_new_status TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $function$
  SELECT CASE COALESCE(p_old_status, '')
    WHEN 'pending' THEN COALESCE(p_new_status, '') IN ('pending', 'ready', 'cancelled')
    WHEN 'ready' THEN COALESCE(p_new_status, '') IN ('ready', 'in_progress', 'completed', 'cancelled')
    WHEN 'in_progress' THEN COALESCE(p_new_status, '') IN ('in_progress', 'completed')
    WHEN 'completed' THEN COALESCE(p_new_status, '') IN ('completed')
    WHEN 'cancelled' THEN COALESCE(p_new_status, '') IN ('cancelled')
    ELSE false
  END;
$function$;
