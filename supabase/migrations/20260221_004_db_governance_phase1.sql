-- ============================================================
-- 🛡️ PHASE 1: DATABASE GOVERNANCE - FINANCIAL PROTECTION LAYER
-- ============================================================
-- Date: 2026-02-21
-- Scope: Journal Balance Enforcement, Line Immutability,
--        Duplicate Prevention, RLS on financial tables,
--        Audit triggers, Performance indexes.
--
-- This migration moves the system from
--   "accounting correct in logic"
-- to
--   "accounting enforced at the database engine level".
--
-- All operations are idempotent (safe to re-run).
-- ============================================================

BEGIN;

-- ============================================================
-- SECTION 1: JOURNAL ENTRY BALANCE ENFORCEMENT
-- ============================================================
-- Principle: Every POSTED journal entry MUST satisfy:
--   SUM(debit_amount) = SUM(credit_amount)
--   COUNT(lines) >= 2
--
-- Design: DEFERRABLE INITIALLY DEFERRED trigger on
-- journal_entry_lines so that the RPC can insert the header
-- (as 'posted') and then all lines within the same
-- transaction before the constraint is checked at COMMIT.
-- ============================================================

CREATE OR REPLACE FUNCTION enforce_journal_entry_balance()
RETURNS TRIGGER AS $$
DECLARE
  v_entry_id    UUID;
  v_status      TEXT;
  v_total_debit NUMERIC(20, 6);
  v_total_credit NUMERIC(20, 6);
  v_line_count  INT;
  v_diff        NUMERIC(20, 6);
BEGIN
  -- Identify the affected journal entry
  IF TG_OP = 'DELETE' THEN
    v_entry_id := OLD.journal_entry_id;
  ELSE
    v_entry_id := NEW.journal_entry_id;
  END IF;

  -- Read status of the parent journal entry
  SELECT status
    INTO v_status
    FROM public.journal_entries
   WHERE id = v_entry_id;

  -- Only enforce balance on POSTED entries.
  -- Draft entries may be temporarily unbalanced while being built.
  IF v_status IS DISTINCT FROM 'posted' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Compute totals including the effect of the current operation
  SELECT
    COALESCE(SUM(debit_amount),  0),
    COALESCE(SUM(credit_amount), 0),
    COUNT(*)
    INTO v_total_debit, v_total_credit, v_line_count
    FROM public.journal_entry_lines
   WHERE journal_entry_id = v_entry_id;

  v_diff := ABS(v_total_debit - v_total_credit);

  -- Enforce balance (tolerance: 0.01 for floating-point rounding)
  IF v_diff > 0.01 THEN
    RAISE EXCEPTION
      'ACCOUNTING_BALANCE_VIOLATION: Journal entry [%] violates the '
      'double-entry principle. '
      'Total Debit = % | Total Credit = % | Difference = %. '
      'All posted journal entries must be perfectly balanced. '
      'Check that every debit line has a corresponding credit line '
      'of equal total value.',
      v_entry_id,
      ROUND(v_total_debit::NUMERIC,  4),
      ROUND(v_total_credit::NUMERIC, 4),
      ROUND(v_diff::NUMERIC,         4);
  END IF;

  -- Enforce minimum 2 lines
  IF v_line_count < 2 THEN
    RAISE EXCEPTION
      'ACCOUNTING_LINES_VIOLATION: Journal entry [%] has only % line(s). '
      'A valid journal entry requires at least one debit and one '
      'credit line (minimum 2 lines total).',
      v_entry_id, v_line_count;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Drop and recreate as CONSTRAINT TRIGGER (DEFERRABLE INITIALLY DEFERRED)
-- This fires at COMMIT, not immediately after each line insert.
DROP TRIGGER IF EXISTS trg_enforce_journal_balance ON public.journal_entry_lines;

CREATE CONSTRAINT TRIGGER trg_enforce_journal_balance
  AFTER INSERT OR UPDATE OR DELETE
  ON public.journal_entry_lines
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION enforce_journal_entry_balance();

-- ============================================================
-- SECTION 2: JOURNAL ENTRY LINES — IMMUTABILITY FOR POSTED ENTRIES
-- ============================================================
-- Once a journal entry is POSTED, its lines must not be
-- modified or deleted. Any correction requires a reversal entry.
-- INSERT is allowed so the RPC can add lines to a 'posted'
-- entry within the same transaction (before COMMIT).
-- ============================================================

CREATE OR REPLACE FUNCTION prevent_posted_line_modification()
RETURNS TRIGGER AS $$
DECLARE
  v_entry_id UUID;
  v_status   TEXT;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_entry_id := OLD.journal_entry_id;
  ELSE
    v_entry_id := NEW.journal_entry_id;
  END IF;

  SELECT status
    INTO v_status
    FROM public.journal_entries
   WHERE id = v_entry_id;

  IF v_status = 'posted' THEN
    RAISE EXCEPTION
      'IMMUTABILITY_VIOLATION: Cannot % a line of posted journal '
      'entry [%]. Posted entries are immutable. '
      'Create a reversal entry to correct this entry.',
      TG_OP, v_entry_id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_posted_line_modification
  ON public.journal_entry_lines;

CREATE TRIGGER trg_prevent_posted_line_modification
  BEFORE UPDATE OR DELETE
  ON public.journal_entry_lines
  FOR EACH ROW
  EXECUTE FUNCTION prevent_posted_line_modification();

-- ============================================================
-- SECTION 3: DUPLICATE JOURNAL ENTRY PREVENTION
-- ============================================================
-- No two non-deleted journal entries may share the same
-- (company_id, reference_type, reference_id).
-- Manual entries (NULL reference) are exempt.
-- ============================================================

CREATE OR REPLACE FUNCTION prevent_duplicate_journal_entry_v2()
RETURNS TRIGGER AS $$
DECLARE
  v_count INT;
BEGIN
  -- Only enforce when both reference fields are provided
  IF NEW.reference_type IS NULL OR NEW.reference_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*)
    INTO v_count
    FROM public.journal_entries
   WHERE company_id     = NEW.company_id
     AND reference_type = NEW.reference_type
     AND reference_id   = NEW.reference_id
     AND (is_deleted IS NULL OR is_deleted = FALSE)
     AND deleted_at IS NULL;

  IF v_count > 0 THEN
    RAISE EXCEPTION
      'DUPLICATE_JOURNAL_VIOLATION: A journal entry with '
      'reference_type=[%] and reference_id=[%] already exists '
      'for company [%]. '
      'Duplicate accounting entries are not permitted. '
      'Use a reversal entry to correct an existing posted entry.',
      NEW.reference_type, NEW.reference_id, NEW.company_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop both old and new versions
DROP TRIGGER IF EXISTS trg_prevent_duplicate_journal_entry
  ON public.journal_entries;

-- Activate the trigger (was commented out in governance scripts)
CREATE TRIGGER trg_prevent_duplicate_journal_entry
  BEFORE INSERT
  ON public.journal_entries
  FOR EACH ROW
  EXECUTE FUNCTION prevent_duplicate_journal_entry_v2();

-- ============================================================
-- SECTION 4: ROW LEVEL SECURITY (RLS)
-- ============================================================
-- Principle: A user may only read/write records belonging to
-- a company they are a member of (or own).
-- Note: Supabase service_role bypasses RLS automatically —
-- all server-side API routes (using service_role_key) are
-- unaffected. RLS is an additional safety net for direct
-- client access and anon/authenticated PostgREST calls.
-- ============================================================

-- ─── 4.1  journal_entries ───────────────────────────────────

ALTER TABLE public.journal_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "journal_entries_company_isolation"
  ON public.journal_entries;

CREATE POLICY "journal_entries_company_isolation"
  ON public.journal_entries
  FOR ALL
  USING (
    company_id IN (
      SELECT cm.company_id
        FROM public.company_members cm
       WHERE cm.user_id = auth.uid()
      UNION
      SELECT c.id
        FROM public.companies c
       WHERE c.user_id = auth.uid()
    )
  )
  WITH CHECK (
    company_id IN (
      SELECT cm.company_id
        FROM public.company_members cm
       WHERE cm.user_id = auth.uid()
      UNION
      SELECT c.id
        FROM public.companies c
       WHERE c.user_id = auth.uid()
    )
  );

-- ─── 4.2  journal_entry_lines ───────────────────────────────
-- No direct company_id column — derive it via journal_entries.

ALTER TABLE public.journal_entry_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "journal_entry_lines_company_isolation"
  ON public.journal_entry_lines;

CREATE POLICY "journal_entry_lines_company_isolation"
  ON public.journal_entry_lines
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
        FROM public.journal_entries je
       WHERE je.id = journal_entry_lines.journal_entry_id
         AND je.company_id IN (
               SELECT cm.company_id
                 FROM public.company_members cm
                WHERE cm.user_id = auth.uid()
               UNION
               SELECT c.id
                 FROM public.companies c
                WHERE c.user_id = auth.uid()
             )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
        FROM public.journal_entries je
       WHERE je.id = journal_entry_lines.journal_entry_id
         AND je.company_id IN (
               SELECT cm.company_id
                 FROM public.company_members cm
                WHERE cm.user_id = auth.uid()
               UNION
               SELECT c.id
                 FROM public.companies c
                WHERE c.user_id = auth.uid()
             )
    )
  );

-- ─── 4.3  invoices ──────────────────────────────────────────

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "invoices_company_isolation"
  ON public.invoices;

CREATE POLICY "invoices_company_isolation"
  ON public.invoices
  FOR ALL
  USING (
    company_id IN (
      SELECT cm.company_id
        FROM public.company_members cm
       WHERE cm.user_id = auth.uid()
      UNION
      SELECT c.id
        FROM public.companies c
       WHERE c.user_id = auth.uid()
    )
  )
  WITH CHECK (
    company_id IN (
      SELECT cm.company_id
        FROM public.company_members cm
       WHERE cm.user_id = auth.uid()
      UNION
      SELECT c.id
        FROM public.companies c
       WHERE c.user_id = auth.uid()
    )
  );

-- ─── 4.4  bills ─────────────────────────────────────────────

ALTER TABLE public.bills ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "bills_company_isolation"
  ON public.bills;

CREATE POLICY "bills_company_isolation"
  ON public.bills
  FOR ALL
  USING (
    company_id IN (
      SELECT cm.company_id
        FROM public.company_members cm
       WHERE cm.user_id = auth.uid()
      UNION
      SELECT c.id
        FROM public.companies c
       WHERE c.user_id = auth.uid()
    )
  )
  WITH CHECK (
    company_id IN (
      SELECT cm.company_id
        FROM public.company_members cm
       WHERE cm.user_id = auth.uid()
      UNION
      SELECT c.id
        FROM public.companies c
       WHERE c.user_id = auth.uid()
    )
  );

-- ─── 4.5  payments ──────────────────────────────────────────

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "payments_company_isolation"
  ON public.payments;

CREATE POLICY "payments_company_isolation"
  ON public.payments
  FOR ALL
  USING (
    company_id IN (
      SELECT cm.company_id
        FROM public.company_members cm
       WHERE cm.user_id = auth.uid()
      UNION
      SELECT c.id
        FROM public.companies c
       WHERE c.user_id = auth.uid()
    )
  )
  WITH CHECK (
    company_id IN (
      SELECT cm.company_id
        FROM public.company_members cm
       WHERE cm.user_id = auth.uid()
      UNION
      SELECT c.id
        FROM public.companies c
       WHERE c.user_id = auth.uid()
    )
  );

-- ============================================================
-- SECTION 5: AUDIT TRIGGERS
-- ============================================================

-- ─── 5.1  journal_entries ───────────────────────────────────
-- audit_trigger_function() already handles company_id from NEW/OLD.

DROP TRIGGER IF EXISTS audit_journal_entries ON public.journal_entries;

CREATE TRIGGER audit_journal_entries
  AFTER INSERT OR UPDATE OR DELETE
  ON public.journal_entries
  FOR EACH ROW
  EXECUTE FUNCTION audit_trigger_function();

-- ─── 5.2  journal_entry_lines ───────────────────────────────
-- Custom lightweight audit: journal_entry_lines has no company_id.
-- We track DELETE and UPDATE (the dangerous mutations on financial lines).
-- INSERT is not tracked individually to avoid log explosion;
-- it is covered by the parent journal_entries INSERT event.

CREATE OR REPLACE FUNCTION audit_journal_entry_lines_func()
RETURNS TRIGGER AS $$
DECLARE
  v_entry_id   UUID;
  v_company_id UUID;
BEGIN
  -- Determine which row is affected
  IF TG_OP = 'DELETE' THEN
    v_entry_id := OLD.journal_entry_id;
  ELSE
    v_entry_id := NEW.journal_entry_id;
  END IF;

  -- Look up company_id from parent
  SELECT company_id
    INTO v_company_id
    FROM public.journal_entries
   WHERE id = v_entry_id;

  -- Call the centralised audit log function (SECURITY DEFINER, immune to RLS)
  BEGIN
    PERFORM create_audit_log(
      v_company_id,                                         -- p_company_id
      auth.uid(),                                           -- p_user_id
      TG_OP,                                                -- p_action
      'journal_entry_lines',                                -- p_target_table
      COALESCE(NEW.id, OLD.id),                             -- p_record_id
      'JE:' || v_entry_id::TEXT,                            -- p_record_identifier
      CASE WHEN TG_OP IN ('UPDATE','DELETE')
           THEN to_jsonb(OLD) ELSE NULL END,                -- p_old_data
      CASE WHEN TG_OP IN ('INSERT','UPDATE')
           THEN to_jsonb(NEW) ELSE NULL END                 -- p_new_data
    );
  EXCEPTION WHEN OTHERS THEN
    -- Audit failures must NEVER block financial operations.
    RAISE WARNING
      'audit_journal_entry_lines_func: failed to write audit log '
      'for entry [%]: %', v_entry_id, SQLERRM;
  END;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS audit_journal_entry_lines
  ON public.journal_entry_lines;

-- Track UPDATE and DELETE only (INSERT explosion avoided)
CREATE TRIGGER audit_journal_entry_lines
  AFTER UPDATE OR DELETE
  ON public.journal_entry_lines
  FOR EACH ROW
  EXECUTE FUNCTION audit_journal_entry_lines_func();

-- ============================================================
-- SECTION 6: PERFORMANCE INDEXES
-- ============================================================
-- These indexes support:
--   a) RLS policy subqueries (company_members lookups)
--   b) Duplicate prevention (reference lookups)
--   c) Balance check (journal_entry_lines by entry_id)
--   d) General query performance on financial tables
-- ============================================================

-- company_members: speed up RLS auth.uid() lookups
CREATE INDEX IF NOT EXISTS idx_company_members_user_id
  ON public.company_members (user_id);

CREATE INDEX IF NOT EXISTS idx_company_members_company_user
  ON public.company_members (company_id, user_id);

-- companies: speed up owner lookup in RLS
CREATE INDEX IF NOT EXISTS idx_companies_user_id
  ON public.companies (user_id);

-- journal_entries: compound index for RLS and reporting
CREATE INDEX IF NOT EXISTS idx_journal_entries_company_id
  ON public.journal_entries (company_id);

CREATE INDEX IF NOT EXISTS idx_journal_entries_company_status_date
  ON public.journal_entries (company_id, status, entry_date)
  WHERE (is_deleted IS NULL OR is_deleted = FALSE)
    AND deleted_at IS NULL;

-- journal_entries: reference lookup for duplicate prevention
CREATE INDEX IF NOT EXISTS idx_journal_entries_reference
  ON public.journal_entries (company_id, reference_type, reference_id)
  WHERE reference_type IS NOT NULL
    AND reference_id   IS NOT NULL
    AND (is_deleted IS NULL OR is_deleted = FALSE)
    AND deleted_at IS NULL;

-- journal_entry_lines: speed up balance check and RLS subquery
CREATE INDEX IF NOT EXISTS idx_journal_entry_lines_entry_id
  ON public.journal_entry_lines (journal_entry_id);

-- invoices: RLS and reporting
CREATE INDEX IF NOT EXISTS idx_invoices_company_id
  ON public.invoices (company_id);

CREATE INDEX IF NOT EXISTS idx_invoices_company_status_date
  ON public.invoices (company_id, status, invoice_date);

-- bills: RLS and reporting
CREATE INDEX IF NOT EXISTS idx_bills_company_id
  ON public.bills (company_id);

CREATE INDEX IF NOT EXISTS idx_bills_company_status_date
  ON public.bills (company_id, status, bill_date);

-- payments: RLS and reporting
CREATE INDEX IF NOT EXISTS idx_payments_company_id
  ON public.payments (company_id);

CREATE INDEX IF NOT EXISTS idx_payments_company_date
  ON public.payments (company_id, payment_date);

COMMIT;

-- ============================================================
-- ✅ PHASE 1 GOVERNANCE SUMMARY
-- ============================================================
-- Section 1 — Balance Enforcement (DEFERRED)
--   ✅ trg_enforce_journal_balance  (CONSTRAINT, DEFERRABLE)
--      → Fires at COMMIT; verifies SUM(debit)=SUM(credit)
--        and COUNT(lines)>=2 for every POSTED journal entry.
--
-- Section 2 — Line Immutability
--   ✅ trg_prevent_posted_line_modification
--      → Blocks UPDATE/DELETE on lines of posted entries.
--        INSERT is allowed (RPC builds lines in same transaction).
--
-- Section 3 — Duplicate Prevention (ACTIVATED)
--   ✅ trg_prevent_duplicate_journal_entry
--      → Blocks a second INSERT with the same
--        (company_id, reference_type, reference_id).
--
-- Section 4 — RLS on 5 Core Financial Tables
--   ✅ journal_entries         — company isolation
--   ✅ journal_entry_lines     — via parent join
--   ✅ invoices                — company isolation
--   ✅ bills                   — company isolation
--   ✅ payments                — company isolation
--
-- Section 5 — Audit Triggers
--   ✅ journal_entries         — INSERT/UPDATE/DELETE via audit_trigger_function()
--   ✅ journal_entry_lines     — UPDATE/DELETE via custom function
--                               (gets company_id from parent)
--
-- Section 6 — Performance Indexes (12 indexes)
--   ✅ company_members, companies, journal_entries (×3),
--      journal_entry_lines, invoices (×2), bills (×2), payments (×2)
-- ============================================================
