-- =====================================================
-- 🔐 Migration: إصلاح الامتثال للنمط المحاسبي القياسي
-- Accounting Pattern Compliance Fix
-- =====================================================
-- تاريخ: 2025-01-XX
-- الهدف: ضمان الامتثال الكامل للنمط المحاسبي القياسي (Zoho Books / Odoo)
-- =====================================================

-- =====================================================
-- الجزء 1: التأكد من وجود status في journal_entries
-- =====================================================
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'journal_entries' 
    AND column_name = 'status'
  ) THEN
    ALTER TABLE journal_entries 
    ADD COLUMN status TEXT DEFAULT 'posted' NOT NULL;
    
    RAISE NOTICE '✅ Added status column to journal_entries table';
  ELSE
    RAISE NOTICE 'ℹ️ Status column already exists in journal_entries table';
  END IF;
END $$;

-- تحديث القيود الموجودة إلى posted
UPDATE journal_entries 
SET status = 'posted' 
WHERE status IS NULL OR status = '';

-- إضافة constraint للقيم الصالحة
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'journal_entries_status_check'
  ) THEN
    ALTER TABLE journal_entries 
    ADD CONSTRAINT journal_entries_status_check 
    CHECK (status IN ('draft', 'posted', 'voided'));
    
    RAISE NOTICE '✅ Added status check constraint';
  END IF;
END $$;

-- =====================================================
-- الجزء 2: Function لحساب paid_amount من القيود فقط
-- =====================================================
CREATE OR REPLACE FUNCTION calculate_invoice_paid_amount(p_invoice_id UUID)
RETURNS DECIMAL(15, 2) AS $$
DECLARE
  v_paid_amount DECIMAL(15, 2) := 0;
BEGIN
  -- حساب المبلغ المدفوع من القيود المحاسبية فقط (posted)
  SELECT COALESCE(SUM(jel.debit_amount), 0) INTO v_paid_amount
  FROM journal_entries je
  JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
  JOIN chart_of_accounts ca ON ca.id = jel.account_id
  WHERE je.reference_type = 'invoice_payment'
    AND je.reference_id = p_invoice_id
    AND je.status = 'posted'
    AND (ca.sub_type = 'cash' OR ca.sub_type = 'bank' OR ca.account_type = 'asset');
  
  RETURN v_paid_amount;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION calculate_invoice_paid_amount IS 'حساب المبلغ المدفوع للفاتورة من القيود المحاسبية فقط';

-- =====================================================
-- الجزء 3: Function لحساب account_balances من القيود فقط
-- =====================================================
CREATE OR REPLACE FUNCTION calculate_account_balance(
  p_account_id UUID,
  p_balance_date DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE(
  debit_balance DECIMAL(15, 2),
  credit_balance DECIMAL(15, 2),
  net_balance DECIMAL(15, 2)
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COALESCE(SUM(jel.debit_amount), 0) as debit_balance,
    COALESCE(SUM(jel.credit_amount), 0) as credit_balance,
    COALESCE(SUM(jel.debit_amount - jel.credit_amount), 0) as net_balance
  FROM journal_entry_lines jel
  JOIN journal_entries je ON je.id = jel.journal_entry_id
  WHERE jel.account_id = p_account_id
    AND je.status = 'posted'
    AND je.entry_date <= p_balance_date;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION calculate_account_balance IS 'حساب رصيد الحساب من القيود المحاسبية فقط (posted)';

-- =====================================================
-- الجزء 4: Trigger للتحقق من توازن القيود (Debit = Credit)
-- =====================================================
CREATE OR REPLACE FUNCTION check_journal_entry_balance()
RETURNS TRIGGER AS $$
DECLARE
  v_total_debit DECIMAL(15, 2);
  v_total_credit DECIMAL(15, 2);
  v_difference DECIMAL(15, 2);
BEGIN
  -- حساب إجمالي المدين والدائن للقيد
  SELECT 
    COALESCE(SUM(debit_amount), 0),
    COALESCE(SUM(credit_amount), 0)
  INTO v_total_debit, v_total_credit
  FROM journal_entry_lines
  WHERE journal_entry_id = COALESCE(NEW.id, OLD.id);
  
  v_difference := ABS(v_total_debit - v_total_credit);
  
  -- التحقق من التوازن (يسمح بفرق صغير بسبب التقريب)
  IF v_difference > 0.01 THEN
    RAISE EXCEPTION 'القيد غير متوازن: المدين = %, الدائن = %, الفرق = %', 
      v_total_debit, v_total_credit, v_difference;
  END IF;
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing trigger if exists
DROP TRIGGER IF EXISTS trg_check_journal_balance_insert ON journal_entry_lines;
DROP TRIGGER IF EXISTS trg_check_journal_balance_update ON journal_entry_lines;
DROP TRIGGER IF EXISTS trg_check_journal_balance_delete ON journal_entry_lines;

-- Create triggers
CREATE TRIGGER trg_check_journal_balance_insert
AFTER INSERT ON journal_entry_lines
FOR EACH ROW
EXECUTE FUNCTION check_journal_entry_balance();

CREATE TRIGGER trg_check_journal_balance_update
AFTER UPDATE ON journal_entry_lines
FOR EACH ROW
EXECUTE FUNCTION check_journal_entry_balance();

CREATE TRIGGER trg_check_journal_balance_delete
AFTER DELETE ON journal_entry_lines
FOR EACH ROW
EXECUTE FUNCTION check_journal_entry_balance();

-- =====================================================
-- الجزء 5: Trigger لمنع حذف القيود المرحلة (Posted)
-- =====================================================
CREATE OR REPLACE FUNCTION prevent_delete_posted_journal()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status = 'posted' THEN
    RAISE EXCEPTION 'لا يمكن حذف القيد المرحلة (Posted). يجب إلغاؤه (Void) أولاً.';
  END IF;
  
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_prevent_delete_posted_journal ON journal_entries;
CREATE TRIGGER trg_prevent_delete_posted_journal
BEFORE DELETE ON journal_entries
FOR EACH ROW
EXECUTE FUNCTION prevent_delete_posted_journal();

-- =====================================================
-- الجزء 6: Trigger لمنع تعديل القيود المرحلة (Posted)
-- =====================================================
CREATE OR REPLACE FUNCTION prevent_update_posted_journal()
RETURNS TRIGGER AS $$
BEGIN
  -- السماح بتعديل status فقط (للترحيل أو الإلغاء)
  IF OLD.status = 'posted' AND (
    NEW.entry_date != OLD.entry_date OR
    NEW.description != OLD.description OR
    NEW.reference_type != OLD.reference_type OR
    NEW.reference_id != OLD.reference_id
  ) THEN
    RAISE EXCEPTION 'لا يمكن تعديل القيد المرحلة (Posted). يجب إلغاؤه (Void) أولاً.';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_prevent_update_posted_journal ON journal_entries;
CREATE TRIGGER trg_prevent_update_posted_journal
BEFORE UPDATE ON journal_entries
FOR EACH ROW
EXECUTE FUNCTION prevent_update_posted_journal();

-- =====================================================
-- الجزء 7: Trigger لمنع تعديل سطور القيود المرحلة
-- =====================================================
CREATE OR REPLACE FUNCTION prevent_update_posted_journal_lines()
RETURNS TRIGGER AS $$
DECLARE
  v_journal_status TEXT;
BEGIN
  -- التحقق من حالة القيد
  SELECT status INTO v_journal_status
  FROM journal_entries
  WHERE id = COALESCE(NEW.journal_entry_id, OLD.journal_entry_id);
  
  IF v_journal_status = 'posted' THEN
    RAISE EXCEPTION 'لا يمكن تعديل سطور القيد المرحلة (Posted). يجب إلغاء القيد أولاً.';
  END IF;
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_prevent_update_posted_journal_lines ON journal_entry_lines;
CREATE TRIGGER trg_prevent_update_posted_journal_lines
BEFORE UPDATE ON journal_entry_lines
FOR EACH ROW
EXECUTE FUNCTION prevent_update_posted_journal_lines();

DROP TRIGGER IF EXISTS trg_prevent_delete_posted_journal_lines ON journal_entry_lines;
CREATE TRIGGER trg_prevent_delete_posted_journal_lines
BEFORE DELETE ON journal_entry_lines
FOR EACH ROW
EXECUTE FUNCTION prevent_update_posted_journal_lines();

-- =====================================================
-- الجزء 8: Trigger تلقائي لإنشاء قيد عند تغيير invoice.status
-- =====================================================
-- ملاحظة: هذا Trigger معقد ويحتاج إلى حساب الحسابات تلقائيًا
-- لذلك سنستخدم Function يتم استدعاؤها من الكود بدلاً من Trigger
-- (لأن حساب الحسابات يحتاج إلى معرفة الحسابات من chart_of_accounts)

-- بدلاً من ذلك، سننشئ Function يمكن استدعاؤها من الكود
CREATE OR REPLACE FUNCTION auto_create_invoice_journal(
  p_invoice_id UUID,
  p_company_id UUID,
  p_entry_date DATE
)
RETURNS UUID AS $$
DECLARE
  v_ar_account_id UUID;
  v_revenue_account_id UUID;
  v_vat_account_id UUID;
  v_shipping_account_id UUID;
  v_invoice_total DECIMAL(15, 2);
  v_invoice_subtotal DECIMAL(15, 2);
  v_invoice_tax DECIMAL(15, 2);
  v_invoice_shipping DECIMAL(15, 2);
  v_journal_entry_id UUID;
  v_existing_entry_id UUID;
BEGIN
  -- التحقق من وجود قيد سابق
  SELECT id INTO v_existing_entry_id
  FROM journal_entries
  WHERE reference_type = 'invoice'
    AND reference_id = p_invoice_id
    AND company_id = p_company_id
  LIMIT 1;
  
  IF v_existing_entry_id IS NOT NULL THEN
    RETURN v_existing_entry_id;
  END IF;
  
  -- جلب بيانات الفاتورة
  SELECT 
    total_amount,
    subtotal,
    COALESCE(tax_amount, 0),
    COALESCE(shipping, 0)
  INTO v_invoice_total, v_invoice_subtotal, v_invoice_tax, v_invoice_shipping
  FROM invoices
  WHERE id = p_invoice_id;
  
  -- البحث عن الحسابات (يجب أن تكون موجودة في chart_of_accounts)
  SELECT id INTO v_ar_account_id
  FROM chart_of_accounts
  WHERE company_id = p_company_id
    AND (sub_type = 'accounts_receivable' OR account_name ILIKE '%receivable%' OR account_name ILIKE '%مدين%')
  LIMIT 1;
  
  SELECT id INTO v_revenue_account_id
  FROM chart_of_accounts
  WHERE company_id = p_company_id
    AND (account_type = 'income' OR account_name ILIKE '%revenue%' OR account_name ILIKE '%إيراد%')
  LIMIT 1;
  
  IF v_ar_account_id IS NULL OR v_revenue_account_id IS NULL THEN
    RAISE EXCEPTION 'الحسابات المطلوبة غير موجودة: AR أو Revenue';
  END IF;
  
  -- إنشاء القيد
  INSERT INTO journal_entries (
    company_id,
    reference_type,
    reference_id,
    entry_date,
    description,
    status
  ) VALUES (
    p_company_id,
    'invoice',
    p_invoice_id,
    p_entry_date,
    'فاتورة مبيعات',
    'posted'
  ) RETURNING id INTO v_journal_entry_id;
  
  -- إنشاء سطور القيد
  -- مدين: AR
  INSERT INTO journal_entry_lines (
    journal_entry_id,
    account_id,
    debit_amount,
    credit_amount,
    description
  ) VALUES (
    v_journal_entry_id,
    v_ar_account_id,
    v_invoice_total,
    0,
    'الذمم المدينة'
  );
  
  -- دائن: Revenue
  INSERT INTO journal_entry_lines (
    journal_entry_id,
    account_id,
    debit_amount,
    credit_amount,
    description
  ) VALUES (
    v_journal_entry_id,
    v_revenue_account_id,
    0,
    v_invoice_subtotal,
    'إيرادات المبيعات'
  );
  
  -- دائن: VAT (إن وجد)
  IF v_invoice_tax > 0 THEN
    SELECT id INTO v_vat_account_id
    FROM chart_of_accounts
    WHERE company_id = p_company_id
      AND (sub_type = 'vat_output' OR account_name ILIKE '%vat%' OR account_name ILIKE '%ضريب%')
    LIMIT 1;
    
    IF v_vat_account_id IS NOT NULL THEN
      INSERT INTO journal_entry_lines (
        journal_entry_id,
        account_id,
        debit_amount,
        credit_amount,
        description
      ) VALUES (
        v_journal_entry_id,
        v_vat_account_id,
        0,
        v_invoice_tax,
        'ضريبة المبيعات المستحقة'
      );
    END IF;
  END IF;
  
  -- دائن: Shipping (إن وجد)
  IF v_invoice_shipping > 0 THEN
    SELECT id INTO v_shipping_account_id
    FROM chart_of_accounts
    WHERE company_id = p_company_id
      AND (account_name ILIKE '%shipping%' OR account_name ILIKE '%شحن%')
    LIMIT 1;
    
    IF v_shipping_account_id IS NOT NULL THEN
      INSERT INTO journal_entry_lines (
        journal_entry_id,
        account_id,
        debit_amount,
        credit_amount,
        description
      ) VALUES (
        v_journal_entry_id,
        v_shipping_account_id,
        0,
        v_invoice_shipping,
        'الشحن'
      );
    END IF;
  END IF;
  
  RETURN v_journal_entry_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION auto_create_invoice_journal IS 'إنشاء قيد محاسبي تلقائي للفاتورة (يمكن استدعاؤه من الكود)';

-- =====================================================
-- الجزء 9: Trigger تلقائي لإنشاء قيد عند إنشاء Payment
-- =====================================================
CREATE OR REPLACE FUNCTION auto_create_payment_journal()
RETURNS TRIGGER AS $$
DECLARE
  v_ar_account_id UUID;
  v_ap_account_id UUID;
  v_cash_account_id UUID;
  v_bank_account_id UUID;
  v_journal_entry_id UUID;
  v_account_id UUID;
BEGIN
  -- إذا كان payment مرتبطًا بـ invoice
  IF NEW.invoice_id IS NOT NULL THEN
    -- البحث عن حساب AR
    SELECT id INTO v_ar_account_id
    FROM chart_of_accounts
    WHERE company_id = NEW.company_id
      AND (sub_type = 'accounts_receivable' OR account_name ILIKE '%receivable%')
    LIMIT 1;
    
    -- استخدام account_id من payment أو البحث عن cash/bank
    v_account_id := COALESCE(NEW.account_id, NULL);
    
    IF v_account_id IS NULL THEN
      SELECT id INTO v_account_id
      FROM chart_of_accounts
      WHERE company_id = NEW.company_id
        AND (sub_type = 'cash' OR sub_type = 'bank')
      LIMIT 1;
    END IF;
    
    IF v_ar_account_id IS NULL OR v_account_id IS NULL THEN
      RAISE WARNING 'الحسابات المطلوبة غير موجودة للدفعة';
      RETURN NEW;
    END IF;
    
    -- إنشاء القيد
    INSERT INTO journal_entries (
      company_id,
      reference_type,
      reference_id,
      entry_date,
      description,
      status
    ) VALUES (
      NEW.company_id,
      'invoice_payment',
      NEW.invoice_id,
      NEW.payment_date,
      'دفعة فاتورة',
      'posted'
    ) RETURNING id INTO v_journal_entry_id;
    
    -- سطور القيد
    INSERT INTO journal_entry_lines (
      journal_entry_id,
      account_id,
      debit_amount,
      credit_amount,
      description
    ) VALUES
    (v_journal_entry_id, v_account_id, NEW.amount, 0, 'نقد/بنك'),
    (v_journal_entry_id, v_ar_account_id, 0, NEW.amount, 'الذمم المدينة');
    
    -- ربط payment بالقيد
    UPDATE payments
    SET journal_entry_id = v_journal_entry_id
    WHERE id = NEW.id;
  END IF;
  
  -- إذا كان payment مرتبطًا بـ bill
  IF NEW.bill_id IS NOT NULL THEN
    -- البحث عن حساب AP
    SELECT id INTO v_ap_account_id
    FROM chart_of_accounts
    WHERE company_id = NEW.company_id
      AND (sub_type = 'accounts_payable' OR account_name ILIKE '%payable%')
    LIMIT 1;
    
    -- استخدام account_id من payment أو البحث عن cash/bank
    v_account_id := COALESCE(NEW.account_id, NULL);
    
    IF v_account_id IS NULL THEN
      SELECT id INTO v_account_id
      FROM chart_of_accounts
      WHERE company_id = NEW.company_id
        AND (sub_type = 'cash' OR sub_type = 'bank')
      LIMIT 1;
    END IF;
    
    IF v_ap_account_id IS NULL OR v_account_id IS NULL THEN
      RAISE WARNING 'الحسابات المطلوبة غير موجودة للدفعة';
      RETURN NEW;
    END IF;
    
    -- إنشاء القيد
    INSERT INTO journal_entries (
      company_id,
      reference_type,
      reference_id,
      entry_date,
      description,
      status
    ) VALUES (
      NEW.company_id,
      'bill_payment',
      NEW.bill_id,
      NEW.payment_date,
      'دفعة فاتورة شراء',
      'posted'
    ) RETURNING id INTO v_journal_entry_id;
    
    -- سطور القيد
    INSERT INTO journal_entry_lines (
      journal_entry_id,
      account_id,
      debit_amount,
      credit_amount,
      description
    ) VALUES
    (v_journal_entry_id, v_ap_account_id, NEW.amount, 0, 'الذمم الدائنة'),
    (v_journal_entry_id, v_account_id, 0, NEW.amount, 'نقد/بنك');
    
    -- ربط payment بالقيد
    UPDATE payments
    SET journal_entry_id = v_journal_entry_id
    WHERE id = NEW.id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_auto_create_payment_journal ON payments;
CREATE TRIGGER trg_auto_create_payment_journal
AFTER INSERT ON payments
FOR EACH ROW
WHEN (NEW.journal_entry_id IS NULL)
EXECUTE FUNCTION auto_create_payment_journal();

-- =====================================================
-- الجزء 10: تحديث account_balances من القيود فقط
-- =====================================================
CREATE OR REPLACE FUNCTION refresh_account_balances(
  p_company_id UUID,
  p_balance_date DATE DEFAULT CURRENT_DATE
)
RETURNS INTEGER AS $$
DECLARE
  v_updated_count INTEGER := 0;
BEGIN
  -- حذف الأرصدة القديمة لهذا التاريخ
  DELETE FROM account_balances
  WHERE company_id = p_company_id
    AND balance_date = p_balance_date;
  
  -- إعادة حساب الأرصدة من القيود فقط
  INSERT INTO account_balances (
    company_id,
    account_id,
    balance_date,
    debit_balance,
    credit_balance,
    updated_at
  )
  SELECT 
    ca.company_id,
    ca.id,
    p_balance_date,
    COALESCE(SUM(jel.debit_amount), 0),
    COALESCE(SUM(jel.credit_amount), 0),
    CURRENT_TIMESTAMP
  FROM chart_of_accounts ca
  LEFT JOIN journal_entry_lines jel ON jel.account_id = ca.id
  LEFT JOIN journal_entries je ON je.id = jel.journal_entry_id
    AND je.status = 'posted'
    AND je.entry_date <= p_balance_date
  WHERE ca.company_id = p_company_id
  GROUP BY ca.company_id, ca.id;
  
  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  
  RETURN v_updated_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION refresh_account_balances IS 'تحديث account_balances من القيود المحاسبية فقط (posted)';

-- =====================================================
-- الجزء 11: Indexes للأداء
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_journal_entries_status_posted 
ON journal_entries(company_id, status, entry_date) 
WHERE status = 'posted';

CREATE INDEX IF NOT EXISTS idx_journal_entry_lines_account_posted
ON journal_entry_lines(account_id, journal_entry_id)
INCLUDE (debit_amount, credit_amount);

-- =====================================================
-- الجزء 12: Views للإبلاغ
-- =====================================================
CREATE OR REPLACE VIEW v_account_balances_from_journals AS
SELECT 
  ca.company_id,
  ca.id as account_id,
  ca.account_code,
  ca.account_name,
  ca.account_type,
  CURRENT_DATE as balance_date,
  COALESCE(SUM(jel.debit_amount), 0) as debit_balance,
  COALESCE(SUM(jel.credit_amount), 0) as credit_balance,
  CASE 
    WHEN ca.account_type IN ('asset', 'expense') THEN 
      COALESCE(SUM(jel.debit_amount - jel.credit_amount), 0)
    ELSE 
      COALESCE(SUM(jel.credit_amount - jel.debit_amount), 0)
  END as net_balance
FROM chart_of_accounts ca
LEFT JOIN journal_entry_lines jel ON jel.account_id = ca.id
LEFT JOIN journal_entries je ON je.id = jel.journal_entry_id
  AND je.status = 'posted'
GROUP BY ca.company_id, ca.id, ca.account_code, ca.account_name, ca.account_type;

COMMENT ON VIEW v_account_balances_from_journals IS 'أرصدة الحسابات المحسوبة من القيود المحاسبية فقط (posted)';

-- =====================================================
-- ملخص التنفيذ
-- =====================================================
DO $$
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE '✅ تم تطبيق إصلاحات الامتثال للنمط المحاسبي';
  RAISE NOTICE '========================================';
  RAISE NOTICE '1. ✅ إضافة status إلى journal_entries';
  RAISE NOTICE '2. ✅ Functions لحساب الأرصدة من القيود فقط';
  RAISE NOTICE '3. ✅ Triggers للتحقق من توازن القيود';
  RAISE NOTICE '4. ✅ Triggers لمنع حذف/تعديل القيود posted';
  RAISE NOTICE '5. ✅ Trigger تلقائي لإنشاء قيود عند Payment';
  RAISE NOTICE '6. ✅ Function لتحديث account_balances';
  RAISE NOTICE '7. ✅ Views للإبلاغ';
  RAISE NOTICE '========================================';
END $$;

