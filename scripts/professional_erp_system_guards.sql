-- نظام الحوكمة والحماية الشامل للـ ERP
-- System Guards & Governance للوصول لمستوى Zoho Books/Next ERP

-- =====================================================
-- 1. System Guards الأساسية
-- =====================================================

-- منع حذف أي مستند له حركة مخزون أو قيد محاسبي
CREATE OR REPLACE FUNCTION prevent_document_deletion_with_transactions()
RETURNS TRIGGER AS $$
BEGIN
    -- فحص وجود حركات مخزون
    IF EXISTS (
        SELECT 1 FROM inventory_transactions 
        WHERE reference_id = OLD.id
    ) THEN
        RAISE EXCEPTION 'Cannot delete document with inventory transactions. Use void/cancel instead.';
    END IF;
    
    -- فحص وجود قيود محاسبية
    IF EXISTS (
        SELECT 1 FROM journal_entries 
        WHERE reference_id = OLD.id
    ) THEN
        RAISE EXCEPTION 'Cannot delete document with journal entries. Use void/cancel instead.';
    END IF;
    
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- تطبيق الحماية على جميع المستندات
DROP TRIGGER IF EXISTS prevent_invoice_deletion_trigger ON invoices;
CREATE TRIGGER prevent_invoice_deletion_trigger
    BEFORE DELETE ON invoices
    FOR EACH ROW EXECUTE FUNCTION prevent_document_deletion_with_transactions();

DROP TRIGGER IF EXISTS prevent_bill_deletion_trigger ON bills;
CREATE TRIGGER prevent_bill_deletion_trigger
    BEFORE DELETE ON bills
    FOR EACH ROW EXECUTE FUNCTION prevent_document_deletion_with_transactions();

DROP TRIGGER IF EXISTS prevent_so_deletion_trigger ON sales_orders;
CREATE TRIGGER prevent_so_deletion_trigger
    BEFORE DELETE ON sales_orders
    FOR EACH ROW EXECUTE FUNCTION prevent_document_deletion_with_transactions();

DROP TRIGGER IF EXISTS prevent_po_deletion_trigger ON purchase_orders;
CREATE TRIGGER prevent_po_deletion_trigger
    BEFORE DELETE ON purchase_orders
    FOR EACH ROW EXECUTE FUNCTION prevent_document_deletion_with_transactions();

-- =====================================================
-- 2. Period Locking System
-- =====================================================

-- جدول قفل الفترات المحاسبية
CREATE TABLE IF NOT EXISTS accounting_periods (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id),
    period_year INTEGER NOT NULL,
    period_month INTEGER NOT NULL,
    period_name TEXT NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'locked')),
    closed_by UUID REFERENCES auth.users(id),
    closed_at TIMESTAMP,
    locked_by UUID REFERENCES auth.users(id),
    locked_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(company_id, period_year, period_month)
);

-- دالة فحص قفل الفترة
CREATE OR REPLACE FUNCTION check_period_lock(
    p_company_id UUID,
    p_transaction_date DATE
)
RETURNS BOOLEAN AS $$
DECLARE
    period_status TEXT;
BEGIN
    SELECT status INTO period_status
    FROM accounting_periods
    WHERE company_id = p_company_id
    AND p_transaction_date BETWEEN start_date AND end_date;
    
    -- إذا لم توجد فترة، السماح بالعملية
    IF period_status IS NULL THEN
        RETURN TRUE;
    END IF;
    
    -- منع العمليات في الفترات المقفلة
    IF period_status IN ('closed', 'locked') THEN
        RETURN FALSE;
    END IF;
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- تطبيق فحص قفل الفترة على القيود
CREATE OR REPLACE FUNCTION enforce_period_lock()
RETURNS TRIGGER AS $$
BEGIN
    IF NOT check_period_lock(NEW.company_id, NEW.entry_date) THEN
        RAISE EXCEPTION 'Cannot modify transactions in closed/locked period. Period: %', NEW.entry_date;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS period_lock_trigger ON journal_entries;
CREATE TRIGGER period_lock_trigger
    BEFORE INSERT OR UPDATE ON journal_entries
    FOR EACH ROW EXECUTE FUNCTION enforce_period_lock();

-- =====================================================
-- 3. Chart of Accounts Engine
-- =====================================================

-- دالة التحقق من صحة استخدام الحساب
CREATE OR REPLACE FUNCTION validate_account_usage(
    p_account_id UUID,
    p_transaction_type TEXT,
    p_reference_type TEXT
)
RETURNS BOOLEAN AS $$
DECLARE
    account_sub_type TEXT;
BEGIN
    SELECT sub_type INTO account_sub_type
    FROM chart_of_accounts
    WHERE id = p_account_id;
    
    -- قواعد استخدام الحسابات
    CASE account_sub_type
        WHEN 'cash' THEN
            IF p_reference_type NOT IN ('payment', 'receipt', 'cash_transaction') THEN
                RAISE EXCEPTION 'Cash accounts can only be used in payments and receipts';
            END IF;
        WHEN 'accounts_receivable', 'ar' THEN
            IF p_reference_type NOT IN ('invoice', 'sales_return', 'customer_payment') THEN
                RAISE EXCEPTION 'AR accounts can only be used with customer transactions';
            END IF;
        WHEN 'accounts_payable', 'ap' THEN
            IF p_reference_type NOT IN ('bill', 'purchase_return', 'supplier_payment') THEN
                RAISE EXCEPTION 'AP accounts can only be used with supplier transactions';
            END IF;
        WHEN 'inventory' THEN
            IF p_reference_type NOT IN ('purchase', 'sale', 'inventory_adjustment') THEN
                RAISE EXCEPTION 'Inventory accounts can only be used with inventory transactions';
            END IF;
        ELSE
            -- حسابات أخرى مسموحة
            NULL;
    END CASE;
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- تطبيق التحقق على سطور القيود
CREATE OR REPLACE FUNCTION validate_journal_line_account()
RETURNS TRIGGER AS $$
DECLARE
    entry_reference_type TEXT;
BEGIN
    SELECT reference_type INTO entry_reference_type
    FROM journal_entries
    WHERE id = NEW.journal_entry_id;
    
    PERFORM validate_account_usage(
        NEW.account_id,
        'journal_entry',
        entry_reference_type
    );
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS validate_account_trigger ON journal_entry_lines;
CREATE TRIGGER validate_account_trigger
    BEFORE INSERT OR UPDATE ON journal_entry_lines
    FOR EACH ROW EXECUTE FUNCTION validate_journal_line_account();

-- =====================================================
-- 4. Enhanced Permissions System
-- =====================================================

-- جدول الصلاحيات المتقدمة
CREATE TABLE IF NOT EXISTS advanced_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id),
    company_id UUID NOT NULL REFERENCES companies(id),
    permission_type TEXT NOT NULL,
    resource_type TEXT NOT NULL,
    branch_id UUID REFERENCES branches(id),
    cost_center_id UUID REFERENCES cost_centers(id),
    warehouse_id UUID REFERENCES warehouses(id),
    can_view_prices BOOLEAN DEFAULT FALSE,
    can_view_costs BOOLEAN DEFAULT FALSE,
    can_approve BOOLEAN DEFAULT FALSE,
    can_post BOOLEAN DEFAULT FALSE,
    max_amount NUMERIC DEFAULT NULL,
    granted_by UUID REFERENCES auth.users(id),
    granted_at TIMESTAMP DEFAULT NOW(),
    expires_at TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE,
    UNIQUE(user_id, company_id, permission_type, resource_type, branch_id, cost_center_id)
);

-- دالة فحص الصلاحيات المتقدمة
CREATE OR REPLACE FUNCTION check_advanced_permission(
    p_user_id UUID,
    p_company_id UUID,
    p_permission_type TEXT,
    p_resource_type TEXT,
    p_branch_id UUID DEFAULT NULL,
    p_cost_center_id UUID DEFAULT NULL,
    p_amount NUMERIC DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
    has_permission BOOLEAN := FALSE;
BEGIN
    SELECT EXISTS(
        SELECT 1 FROM advanced_permissions
        WHERE user_id = p_user_id
        AND company_id = p_company_id
        AND permission_type = p_permission_type
        AND resource_type = p_resource_type
        AND (branch_id IS NULL OR branch_id = p_branch_id)
        AND (cost_center_id IS NULL OR cost_center_id = p_cost_center_id)
        AND (max_amount IS NULL OR max_amount >= COALESCE(p_amount, 0))
        AND is_active = TRUE
        AND (expires_at IS NULL OR expires_at > NOW())
    ) INTO has_permission;
    
    RETURN has_permission;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 5. Professional Audit Log
-- =====================================================

-- جدول سجل التدقيق المحسن
CREATE TABLE IF NOT EXISTS enhanced_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id),
    company_id UUID NOT NULL REFERENCES companies(id),
    branch_id UUID REFERENCES branches(id),
    cost_center_id UUID REFERENCES cost_centers(id),
    action_type TEXT NOT NULL,
    resource_type TEXT NOT NULL,
    resource_id UUID,
    page_url TEXT,
    ip_address INET,
    user_agent TEXT,
    old_values JSONB,
    new_values JSONB,
    description TEXT,
    session_id TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    -- فهرسة للبحث السريع
    INDEX (user_id, created_at),
    INDEX (company_id, created_at),
    INDEX (resource_type, resource_id),
    INDEX (action_type, created_at)
);

-- دالة تسجيل العمليات
CREATE OR REPLACE FUNCTION log_audit_event(
    p_user_id UUID,
    p_company_id UUID,
    p_action_type TEXT,
    p_resource_type TEXT,
    p_resource_id UUID DEFAULT NULL,
    p_old_values JSONB DEFAULT NULL,
    p_new_values JSONB DEFAULT NULL,
    p_description TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    audit_id UUID;
BEGIN
    INSERT INTO enhanced_audit_log (
        user_id, company_id, action_type, resource_type,
        resource_id, old_values, new_values, description
    ) VALUES (
        p_user_id, p_company_id, p_action_type, p_resource_type,
        p_resource_id, p_old_values, p_new_values, p_description
    ) RETURNING id INTO audit_id;
    
    RETURN audit_id;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 6. Approval Workflows
-- =====================================================

-- جدول الموافقات
CREATE TABLE IF NOT EXISTS approval_workflows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id),
    workflow_type TEXT NOT NULL,
    resource_type TEXT NOT NULL,
    resource_id UUID NOT NULL,
    amount NUMERIC,
    requested_by UUID NOT NULL REFERENCES auth.users(id),
    requested_at TIMESTAMP DEFAULT NOW(),
    approver_id UUID REFERENCES auth.users(id),
    approved_at TIMESTAMP,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
    rejection_reason TEXT,
    notes TEXT,
    INDEX (company_id, status, requested_at),
    INDEX (resource_type, resource_id),
    INDEX (approver_id, status)
);

-- دالة طلب الموافقة
CREATE OR REPLACE FUNCTION request_approval(
    p_company_id UUID,
    p_workflow_type TEXT,
    p_resource_type TEXT,
    p_resource_id UUID,
    p_amount NUMERIC,
    p_requested_by UUID,
    p_notes TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    approval_id UUID;
BEGIN
    INSERT INTO approval_workflows (
        company_id, workflow_type, resource_type, resource_id,
        amount, requested_by, notes
    ) VALUES (
        p_company_id, p_workflow_type, p_resource_type, p_resource_id,
        p_amount, p_requested_by, p_notes
    ) RETURNING id INTO approval_id;
    
    RETURN approval_id;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 7. Data Integrity Validation
-- =====================================================

-- دالة التحقق الشامل من سلامة البيانات
CREATE OR REPLACE FUNCTION comprehensive_data_validation(
    p_company_id UUID
)
RETURNS TABLE(
    check_category TEXT,
    check_name TEXT,
    status TEXT,
    issue_count INTEGER,
    severity TEXT,
    description TEXT
) AS $$
BEGIN
    -- فحص توازن القيود
    RETURN QUERY
    SELECT 
        'Accounting'::TEXT,
        'Journal Entries Balance'::TEXT,
        CASE WHEN ABS(COALESCE(SUM(jel.debit_amount - jel.credit_amount), 0)) < 0.01 
             THEN 'PASS' ELSE 'FAIL' END::TEXT,
        CASE WHEN ABS(COALESCE(SUM(jel.debit_amount - jel.credit_amount), 0)) >= 0.01 
             THEN 1 ELSE 0 END::INTEGER,
        CASE WHEN ABS(COALESCE(SUM(jel.debit_amount - jel.credit_amount), 0)) >= 0.01 
             THEN 'CRITICAL' ELSE 'INFO' END::TEXT,
        'All journal entries must be balanced (debits = credits)'::TEXT
    FROM journal_entry_lines jel
    JOIN journal_entries je ON jel.journal_entry_id = je.id
    WHERE je.company_id = p_company_id;
    
    -- فحص الفواتير بدون قيود
    RETURN QUERY
    SELECT 
        'Accounting'::TEXT,
        'Invoices Without Journal Entries'::TEXT,
        CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'WARN' END::TEXT,
        COUNT(*)::INTEGER,
        CASE WHEN COUNT(*) > 0 THEN 'WARNING' ELSE 'INFO' END::TEXT,
        'Sent invoices should have corresponding journal entries'::TEXT
    FROM invoices i
    WHERE i.company_id = p_company_id
    AND i.status IN ('sent', 'paid', 'partially_paid')
    AND NOT EXISTS (
        SELECT 1 FROM journal_entries je 
        WHERE je.reference_id = i.id AND je.reference_type = 'invoice'
    );
    
    -- فحص المخزون السلبي
    RETURN QUERY
    SELECT 
        'Inventory'::TEXT,
        'Negative Inventory'::TEXT,
        CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'WARN' END::TEXT,
        COUNT(*)::INTEGER,
        CASE WHEN COUNT(*) > 0 THEN 'WARNING' ELSE 'INFO' END::TEXT,
        'Products should not have negative quantities'::TEXT
    FROM products p
    WHERE p.company_id = p_company_id
    AND p.quantity_on_hand < 0;
END;
$$ LANGUAGE plpgsql;

-- إنشاء فهارس للأداء
CREATE INDEX IF NOT EXISTS idx_journal_entries_company_date ON journal_entries(company_id, entry_date);
CREATE INDEX IF NOT EXISTS idx_journal_entry_lines_account ON journal_entry_lines(account_id, journal_entry_id);
CREATE INDEX IF NOT EXISTS idx_invoices_company_status ON invoices(company_id, status, invoice_date);
CREATE INDEX IF NOT EXISTS idx_bills_company_status ON bills(company_id, status, bill_date);

SELECT 'Professional ERP System Guards implemented successfully' as status;