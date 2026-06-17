-- v3.74.218 — Rename booking_status_history.created_at to changed_at to
-- match the BookingStatusHistory TypeScript type and the
-- BookingStatusTimeline component. The previous mismatch made
-- GET /api/bookings/[id] order by a non-existent column and return 500
-- (PostgREST error=42703). The trigger that writes into this table does
-- not reference the column by name, so the rename is safe.

ALTER TABLE public.booking_status_history
  RENAME COLUMN created_at TO changed_at;
