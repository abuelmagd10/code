-- =====================================================================
-- v3.74.602 (+602b) — resync notifications: valid category, isolation,
-- and invoice deep-link for the accountant.
-- (applied to production via Supabase MCP on 2026-07-10 as two
--  migrations: v3_74_602_resync_notification_category_fix and
--  v3_74_602b_accountant_notification_targets_invoice; mirrored here.
--  Authoritative full bodies live in those MCP migrations.)
--
-- (602) 23514 on the post-execution addon edit: the resync
-- notifications used category='bookings', which is NOT allowed by
-- notifications_category_check (allowed incl. 'sales'). Fixed to
-- 'sales' + each notification wrapped in its own BEGIN/EXCEPTION so a
-- notification failure can NEVER roll back the financial sync again.
-- Verified booking/invoice state intact (each earlier failure was a
-- full rollback): booking 510 = invoice 510 = lines sum, draft,
-- warehouse pending, booto stock untouched.
--
-- (602b) Owner: clicking the accountant's "راجع الفاتورة واستكمل"
-- notification must open the INVOICE page. reference switched to
-- ('invoice', invoice_id) — lib/notification-routing.ts already maps
-- it to /invoices/{id}. FYI notifications keep the booking reference.
-- New trigger notif_done_invoice_posted: when an invoice leaves draft
-- (sent/paid/cancelled), its kind='action' notifications flip to
-- 'actioned' (v3.74.588 lifecycle) — the accountant's inbox item
-- completes itself the moment they post.
-- The already-delivered notification row was repointed to the invoice.
-- =====================================================================

DROP TRIGGER IF EXISTS notif_done_invoice_posted ON public.invoices;
CREATE TRIGGER notif_done_invoice_posted
AFTER UPDATE ON public.invoices
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status
      AND OLD.status = 'draft'
      AND NEW.status IN ('sent','paid','cancelled'))
EXECUTE FUNCTION public.notif_complete_actions();

-- resync_booking_invoice(): see MCP migration
-- v3_74_602b_accountant_notification_targets_invoice for the full
-- CREATE OR REPLACE body (category 'sales', isolated notification
-- blocks, accountant reference = invoice, FYI loop over
-- owner/general_manager/manager).
