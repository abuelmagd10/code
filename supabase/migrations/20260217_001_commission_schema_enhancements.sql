-- =============================================
-- ENTERPRISE COMMISSION SYSTEM - SCHEMA ENHANCEMENTS
-- Date: 2026-02-17
-- Description:
-- Upgrade commission system to support:
-- - Credit Note Reversal (Auto Clawback)
-- - Tiered Calculations (Progressive/Slab)
-- - Workflow Controls (Draft→Approved→Posted→Paid)
-- - Full Accounting Integration
-- - Strict Double Dipping Prevention
-- =============================================

-- =============================================
-- 1. ENHANCE commission_ledger
-- =============================================

-- Add Credit Note tracking
ALTER TABLE public.commission_ledger 
ADD COLUMN IF NOT EXISTS source_credit_note_id UUID REFERENCES credit_notes(id);

-- Add Plan tracking
ALTER TABLE public.commission_ledger 
ADD COLUMN IF NOT EXISTS commission_plan_id UUID REFERENCES commission_plans(id);

-- Add Run tracking (links to commission_runs, created below)
ALTER TABLE public.commission_ledger 
ADD COLUMN IF NOT EXISTS commission_run_id UUID;

-- Add Status tracking
ALTER TABLE public.commission_ledger 
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'draft' 
CHECK (status IN ('draft', 'approved', 'posted', 'paid', 'reversed'));

-- Add Journal Entry tracking
ALTER TABLE public.commission_ledger 
ADD COLUMN IF NOT EXISTS journal_entry_id UUID REFERENCES journal_entries(id);

-- Add Reversal Amount (for partial clawbacks)
ALTER TABLE public.commission_ledger 
ADD COLUMN IF NOT EXISTS reversal_amount DECIMAL(15,2) DEFAULT 0;

-- Add Notes
ALTER TABLE public.commission_ledger 
ADD COLUMN IF NOT EXISTS notes TEXT;

-- Update UNIQUE constraint to include commission_plan_id
-- This prevents double dipping per plan (allows multiple plans on same invoice)
ALTER TABLE public.commission_ledger 
DROP CONSTRAINT IF EXISTS uniq_commission_source;

ALTER TABLE public.commission_ledger 
ADD CONSTRAINT uniq_commission_source 
UNIQUE (company_id, employee_id, source_type, source_id, commission_plan_id);

-- Add index for Credit Note lookups
CREATE INDEX IF NOT EXISTS idx_commission_ledger_credit_note 
ON public.commission_ledger(source_credit_note_id) WHERE source_credit_note_id IS NOT NULL;

-- Add index for Run lookups
CREATE INDEX IF NOT EXISTS idx_commission_ledger_run 
ON public.commission_ledger(commission_run_id) WHERE commission_run_id IS NOT NULL;

-- Add index for Status filtering
CREATE INDEX IF NOT EXISTS idx_commission_ledger_status 
ON public.commission_ledger(company_id, status);

-- =============================================
-- 2. ENHANCE commission_plans
-- =============================================

-- Add Calculation Basis (Before/After Discount/VAT)
ALTER TABLE public.commission_plans 
ADD COLUMN IF NOT EXISTS calculation_basis TEXT DEFAULT 'after_discount' 
CHECK (calculation_basis IN ('before_discount', 'after_discount', 'before_vat', 'after_vat'));

-- Add Tier Type (Progressive vs Slab)
ALTER TABLE public.commission_plans 
ADD COLUMN IF NOT EXISTS tier_type TEXT DEFAULT 'progressive' 
CHECK (tier_type IN ('progressive', 'slab'));

-- Add Return Handling Policy
ALTER TABLE public.commission_plans 
ADD COLUMN IF NOT EXISTS handle_returns TEXT DEFAULT 'auto_reverse' 
CHECK (handle_returns IN ('auto_reverse', 'manual_adjustment', 'ignore'));

-- Add Description
ALTER TABLE public.commission_plans 
ADD COLUMN IF NOT EXISTS description TEXT;

-- Add Effective Dates
ALTER TABLE public.commission_plans 
ADD COLUMN IF NOT EXISTS effective_from DATE;

ALTER TABLE public.commission_plans 
ADD COLUMN IF NOT EXISTS effective_to DATE;

-- =============================================
-- 3. CREATE commission_runs TABLE
-- =============================================

CREATE TABLE IF NOT EXISTS public.commission_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    
    -- Period
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    
    -- Workflow Status
    status TEXT DEFAULT 'draft' 
    CHECK (status IN ('draft', 'reviewed', 'approved', 'posted', 'paid', 'cancelled')),
    
    -- Totals
    total_commission DECIMAL(15,2) DEFAULT 0,
    total_clawbacks DECIMAL(15,2) DEFAULT 0,
    net_commission DECIMAL(15,2) DEFAULT 0,
    
    -- Accounting References
    journal_entry_id UUID REFERENCES journal_entries(id), -- Accrual entry
    payment_journal_id UUID REFERENCES journal_entries(id), -- Payment entry
    
    -- Workflow Tracking
    created_by UUID REFERENCES auth.users(id),
    reviewed_by UUID REFERENCES auth.users(id),
    approved_by UUID REFERENCES auth.users(id),
    posted_by UUID REFERENCES auth.users(id),
    paid_by UUID REFERENCES auth.users(id),
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    reviewed_at TIMESTAMPTZ,
    approved_at TIMESTAMPTZ,
    posted_at TIMESTAMPTZ,
    paid_at TIMESTAMPTZ,
    
    -- Notes
    notes TEXT,
    
    -- Prevent duplicate runs for same period
    CONSTRAINT uniq_commission_run_period UNIQUE (company_id, period_start, period_end)
);

-- Add FK constraint from commission_ledger to commission_runs
ALTER TABLE public.commission_ledger 
ADD CONSTRAINT fk_commission_ledger_run 
FOREIGN KEY (commission_run_id) REFERENCES commission_runs(id) ON DELETE SET NULL;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_commission_runs_company 
ON public.commission_runs(company_id);

CREATE INDEX IF NOT EXISTS idx_commission_runs_status 
ON public.commission_runs(company_id, status);

CREATE INDEX IF NOT EXISTS idx_commission_runs_period 
ON public.commission_runs(company_id, period_start, period_end);

-- =============================================
-- 4. RLS POLICIES
-- =============================================

ALTER TABLE public.commission_runs ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS commission_runs_company_isolation ON public.commission_runs;

-- Company isolation policy
CREATE POLICY commission_runs_company_isolation ON public.commission_runs
    USING (company_id IN (
        SELECT company_id FROM company_members WHERE user_id = auth.uid()
    ));

-- =============================================
-- 5. AUDIT TRIGGERS
-- =============================================

-- Trigger to log status changes in commission_runs
CREATE OR REPLACE FUNCTION log_commission_run_status_change()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status) THEN
        INSERT INTO audit_logs (
            action,
            company_id,
            user_id,
            details
        ) VALUES (
            'commission_run_status_change',
            NEW.company_id,
            auth.uid(),
            jsonb_build_object(
                'run_id', NEW.id,
                'old_status', OLD.status,
                'new_status', NEW.status,
                'period_start', NEW.period_start,
                'period_end', NEW.period_end,
                'total_commission', NEW.total_commission
            )
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_commission_run_status_change ON public.commission_runs;

CREATE TRIGGER trg_commission_run_status_change
    AFTER UPDATE ON public.commission_runs
    FOR EACH ROW
    EXECUTE FUNCTION log_commission_run_status_change();

-- =============================================
-- 6. VALIDATION FUNCTIONS
-- =============================================

-- Function to validate commission run state transitions
CREATE OR REPLACE FUNCTION validate_commission_run_transition(
    p_run_id UUID,
    p_new_status TEXT
) RETURNS BOOLEAN AS $$
DECLARE
    v_current_status TEXT;
    v_allowed BOOLEAN := FALSE;
BEGIN
    -- Get current status
    SELECT status INTO v_current_status 
    FROM commission_runs 
    WHERE id = p_run_id;
    
    IF v_current_status IS NULL THEN
        RAISE EXCEPTION 'Commission run not found';
    END IF;
    
    -- Validate transitions
    IF v_current_status = 'draft' THEN
        v_allowed := p_new_status IN ('reviewed', 'cancelled');
    ELSIF v_current_status = 'reviewed' THEN
        v_allowed := p_new_status IN ('approved', 'draft', 'cancelled');
    ELSIF v_current_status = 'approved' THEN
        v_allowed := p_new_status IN ('posted', 'cancelled');
    ELSIF v_current_status = 'posted' THEN
        v_allowed := p_new_status IN ('paid');
    ELSIF v_current_status = 'paid' THEN
        v_allowed := FALSE; -- Cannot change from paid
    ELSIF v_current_status = 'cancelled' THEN
        v_allowed := FALSE; -- Cannot change from cancelled
    END IF;
    
    IF NOT v_allowed THEN
        RAISE EXCEPTION 'Invalid status transition from % to %', v_current_status, p_new_status;
    END IF;
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================
-- 7. HELPER VIEWS
-- =============================================

-- View: Commission Summary by Employee
CREATE OR REPLACE VIEW v_commission_summary_by_employee AS
SELECT 
    cl.company_id,
    cl.employee_id,
    e.name as employee_name,
    cl.commission_run_id,
    cr.period_start,
    cr.period_end,
    cr.status as run_status,
    COUNT(*) FILTER (WHERE cl.is_clawback = FALSE) as invoice_count,
    COUNT(*) FILTER (WHERE cl.is_clawback = TRUE) as clawback_count,
    SUM(cl.amount) FILTER (WHERE cl.is_clawback = FALSE) as gross_commission,
    SUM(cl.amount) FILTER (WHERE cl.is_clawback = TRUE) as total_clawbacks,
    SUM(cl.amount) as net_commission
FROM commission_ledger cl
LEFT JOIN employees e ON cl.employee_id = e.id
LEFT JOIN commission_runs cr ON cl.commission_run_id = cr.id
GROUP BY 
    cl.company_id, 
    cl.employee_id, 
    e.name,
    cl.commission_run_id,
    cr.period_start,
    cr.period_end,
    cr.status;

-- =============================================
-- MIGRATION COMPLETE
-- =============================================

-- Add migration record
INSERT INTO audit_logs (action, company_id, user_id, details)
SELECT 
    'migration_applied',
    id,
    NULL,
    jsonb_build_object(
        'migration', '20260217_001_commission_schema_enhancements',
        'description', 'Enhanced commission system with Credit Note reversal, workflow controls, and strict constraints'
    )
FROM companies
ON CONFLICT DO NOTHING;
