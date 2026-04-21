-- ==============================================================================
-- Reservation System - Step 3
-- Purpose:
--   Add helper functions, sequence, and reservation_number generation only.
-- Scope:
--   - global reservation number sequence
--   - formatting helper
--   - generator helper
--   - default reservation_number generation on inventory_reservations
-- Excludes:
--   - triggers
--   - RLS
--   - views
--   - status transition guards
--   - rollup logic
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1) Global sequence for reservation numbers
-- ------------------------------------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS public.inventory_reservation_number_seq
  AS BIGINT
  START WITH 1
  INCREMENT BY 1
  MINVALUE 1
  NO MAXVALUE
  CACHE 1;

-- ------------------------------------------------------------------------------
-- 2) Deterministic formatter
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ir_format_reservation_number(
  p_sequence_value BIGINT,
  p_reference_ts TIMESTAMPTZ
)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $function$
BEGIN
  RETURN 'RSV-' ||
    TO_CHAR(TIMEZONE('UTC', p_reference_ts), 'YYYYMM') ||
    '-' ||
    CASE
      WHEN p_sequence_value < 1000000 THEN LPAD(p_sequence_value::TEXT, 6, '0')
      ELSE p_sequence_value::TEXT
    END;
END;
$function$;

-- ------------------------------------------------------------------------------
-- 3) Sequence-backed generator
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ir_generate_reservation_number(
  p_reference_ts TIMESTAMPTZ DEFAULT NOW()
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_sequence_value BIGINT;
  v_reference_ts   TIMESTAMPTZ := COALESCE(p_reference_ts, NOW());
BEGIN
  v_sequence_value := nextval('public.inventory_reservation_number_seq');
  RETURN public.ir_format_reservation_number(v_sequence_value, v_reference_ts);
END;
$function$;

-- ------------------------------------------------------------------------------
-- 4) Default reservation number generation
-- ------------------------------------------------------------------------------
ALTER TABLE public.inventory_reservations
  ALTER COLUMN reservation_number
  SET DEFAULT public.ir_generate_reservation_number();
