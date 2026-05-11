-- ==============================================================================
-- Services & Booking Module — Hotfix
-- Purpose:
--   Remove illegal FOR UPDATE from aggregate queries in code generator helpers.
--   PostgreSQL raises 0A000 when FOR UPDATE is combined with aggregate functions.
--   The UNIQUE constraints on (company_id, service_code) and (company_id, booking_no)
--   already prevent duplicates under concurrent inserts — no additional locking needed.
-- ==============================================================================

-- 1) Fix svc_generate_service_code
CREATE OR REPLACE FUNCTION public.svc_generate_service_code(
  p_company_id UUID
)
RETURNS TEXT
LANGUAGE plpgsql
AS $function$
DECLARE
  v_next INTEGER;
BEGIN
  SELECT COALESCE(
    MAX(
      CASE
        WHEN service_code ~ '^SVC-[0-9]+$'
        THEN CAST(SPLIT_PART(service_code, '-', 2) AS INTEGER)
        ELSE 0
      END
    ), 0
  ) + 1
  INTO v_next
  FROM public.services
  WHERE company_id = p_company_id;

  RETURN 'SVC-' || LPAD(v_next::TEXT, 4, '0');
END;
$function$;

-- 2) Fix bkg_generate_booking_no
CREATE OR REPLACE FUNCTION public.bkg_generate_booking_no(
  p_company_id UUID
)
RETURNS TEXT
LANGUAGE plpgsql
AS $function$
DECLARE
  v_year   TEXT    := TO_CHAR(NOW(), 'YYYY');
  v_next   INTEGER;
  v_prefix TEXT;
BEGIN
  v_prefix := 'BKG-' || v_year || '-';

  SELECT COALESCE(
    MAX(
      CASE
        WHEN booking_no LIKE v_prefix || '%'
          AND REGEXP_REPLACE(booking_no, '^BKG-[0-9]{4}-', '') ~ '^[0-9]+$'
        THEN CAST(REGEXP_REPLACE(booking_no, '^BKG-[0-9]{4}-', '') AS INTEGER)
        ELSE 0
      END
    ), 0
  ) + 1
  INTO v_next
  FROM public.bookings
  WHERE company_id = p_company_id;

  RETURN v_prefix || LPAD(v_next::TEXT, 5, '0');
END;
$function$;
