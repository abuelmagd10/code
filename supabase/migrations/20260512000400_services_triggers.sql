-- ==============================================================================
-- Services & Booking Module — Phase 1 / B4
-- Purpose:
--   Triggers for services tables.
-- Scope:
--   - updated_at auto-maintenance
--   - service_code immutability guard
--   - schedule overlap validation on INSERT/UPDATE
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1) services — updated_at
-- ------------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_services_set_updated_at ON public.services;
CREATE TRIGGER trg_services_set_updated_at
  BEFORE UPDATE ON public.services
  FOR EACH ROW EXECUTE FUNCTION public.svc_set_updated_at();

-- ------------------------------------------------------------------------------
-- 2) services — guard: service_code must not change after creation
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.svc_guard_service_code_immutable()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.service_code IS DISTINCT FROM OLD.service_code THEN
    RAISE EXCEPTION
      'service_code is immutable after creation. service_id=%', OLD.id
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_services_guard_code ON public.services;
CREATE TRIGGER trg_services_guard_code
  BEFORE UPDATE ON public.services
  FOR EACH ROW
  WHEN (NEW.service_code IS DISTINCT FROM OLD.service_code)
  EXECUTE FUNCTION public.svc_guard_service_code_immutable();

-- ------------------------------------------------------------------------------
-- 3) service_schedules — updated_at
-- ------------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_service_schedules_set_updated_at ON public.service_schedules;
CREATE TRIGGER trg_service_schedules_set_updated_at
  BEFORE UPDATE ON public.service_schedules
  FOR EACH ROW EXECUTE FUNCTION public.svc_set_updated_at();

-- ------------------------------------------------------------------------------
-- 4) service_schedules — validate no time overlap on same service+day
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.svc_trg_validate_schedule()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
BEGIN
  PERFORM public.svc_validate_schedule_no_overlap(
    NEW.service_id,
    NEW.day_of_week,
    NEW.start_time,
    NEW.end_time,
    CASE WHEN TG_OP = 'UPDATE' THEN OLD.id ELSE NULL END
  );
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_service_schedules_validate ON public.service_schedules;
CREATE TRIGGER trg_service_schedules_validate
  BEFORE INSERT OR UPDATE ON public.service_schedules
  FOR EACH ROW EXECUTE FUNCTION public.svc_trg_validate_schedule();
