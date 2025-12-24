-- =====================================================
-- 🔐 Migration: إصلاحات الامتثال المحاسبي - البنود الآمنة فقط
-- Accounting Pattern Compliance - Safe Items Only
-- =====================================================
-- تاريخ: 2025-01-XX
-- الحالة: ✅ آمن 100% للإنتاج - لا يؤثر على البيانات الحالية
-- =====================================================
--
-- ⚠️ تحذير مهم:
-- هذا Migration يحتوي فقط على:
--   ✅ Functions للقراءة فقط
--   ✅ Helper Functions (لا triggers)
--   ✅ Indexes (تحسين الأداء فقط)
--   ✅ Views (قراءة فقط)
--
-- ❌ لا يحتوي على:
--   ❌ Triggers
--   ❌ UPDATE statements
--   ❌ DELETE statements
--   ❌ ALTER statements التي تمس البيانات الموجودة
--
-- ✅ التأثير: صفر على البيانات الحالية
-- ✅ يمكن التطبيق بأمان على الإنتاج
-- =====================================================

-- =====================================================
-- الجزء 1: Function لحساب paid_amount من القيود فقط
-- =====================================================
-- الوصف: حساب المبلغ المدفوع للفاتورة من القيود المحاسبية فقط
-- التأثير: قراءة فقط - لا يغير أي بيانات
-- الاستخدام: يمكن استخدامها في التقارير والاستعلامات
CREATE OR REPLACE FUNCTION calculate_invoice_paid_amount(p_invoice_id UUID)
RETURNS DECIMAL(15, 2) AS $$
DECLARE
  v_paid_amount DECIMAL(15, 2) := 0;
BEGIN
  -- حساب المبلغ المدفوع من القيود المحاسبية فقط
  -- ملاحظة: نستخدم status إذا كان موجوداً، وإلا نعتبر جميع القيود posted
  SELECT COALESCE(SUM(jel.debit_amount), 0) INTO v_paid_amount
  FROM journal_entries je
  JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
  JOIN chart_of_accounts ca ON ca.id = jel.account_id
  WHERE je.reference_type = 'invoice_payment'
    AND je.reference_id = p_invoice_id
    AND (je.status = 'posted' OR je.status IS NULL) -- دعم القيود القديمة بدون status
    AND (ca.sub_type = 'cash' OR ca.sub_type = 'bank' OR ca.account_type = 'asset');
  
  RETURN v_paid_amount;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION calculate_invoice_paid_amount IS 'حساب المبلغ المدفوع للفاتورة من القيود المحاسبية فقط (قراءة فقط - لا يؤثر على البيانات)';

-- =====================================================
-- الجزء 2: Function لحساب account_balance من القيود فقط
-- =====================================================
-- الوصف: حساب رصيد الحساب من القيود المحاسبية فقط
-- التأثير: قراءة فقط - لا يغير أي بيانات
-- الاستخدام: يمكن استخدامها في التقارير والاستعلامات
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
    AND (je.status = 'posted' OR je.status IS NULL) -- دعم القيود القديمة بدون status
    AND je.entry_date <= p_balance_date;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION calculate_account_balance IS 'حساب رصيد الحساب من القيود المحاسبية فقط (قراءة فقط - لا يؤثر على البيانات)';

-- =====================================================
-- الجزء 3: Helper Function لإنشاء قيد فاتورة (لا trigger)
-- =====================================================
-- الوصف: Function مساعدة لإنشاء قيد محاسبي للفاتورة
-- التأثير: Function فقط - لا يتم استدعاؤها تلقائيًا
-- الاستخدام: يمكن استدعاؤها من الكود عند الحاجة
-- ملاحظة: لا يوجد trigger مرتبط - آمن تماماً
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
    description
  ) VALUES (
    p_company_id,
    'invoice',
    p_invoice_id,
    p_entry_date,
    'فاتورة مبيعات'
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

COMMENT ON FUNCTION auto_create_invoice_journal IS 'Helper Function لإنشاء قيد محاسبي للفاتورة (لا trigger - يتم استدعاؤها من الكود فقط)';

-- =====================================================
-- الجزء 4: Indexes لتحسين الأداء (لا تؤثر على البيانات)
-- =====================================================
-- الوصف: Indexes لتحسين أداء الاستعلامات على القيود
-- التأثير: تحسين الأداء فقط - لا يغير أي بيانات
-- ملاحظة: Index على status يحتاج status column أولاً، لذلك سنستخدم index عام

-- Index لتحسين البحث في journal_entry_lines
CREATE INDEX IF NOT EXISTS idx_journal_entry_lines_account_journal
ON journal_entry_lines(account_id, journal_entry_id)
INCLUDE (debit_amount, credit_amount);

COMMENT ON INDEX idx_journal_entry_lines_account_journal IS 'Index لتحسين أداء استعلامات أرصدة الحسابات من القيود';

-- Index لتحسين البحث في journal_entries حسب reference
CREATE INDEX IF NOT EXISTS idx_journal_entries_reference_lookup
ON journal_entries(company_id, reference_type, reference_id, entry_date);

COMMENT ON INDEX idx_journal_entries_reference_lookup IS 'Index لتحسين البحث في القيود حسب المرجع (invoice, payment, etc.)';

-- =====================================================
-- الجزء 5: View لحساب الأرصدة من القيود (قراءة فقط)
-- =====================================================
-- الوصف: View لحساب أرصدة الحسابات من القيود المحاسبية فقط
-- التأثير: قراءة فقط - لا يغير أي بيانات
-- الاستخدام: يمكن استخدامها في التقارير والاستعلامات
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
  AND (je.status = 'posted' OR je.status IS NULL) -- دعم القيود القديمة بدون status
GROUP BY ca.company_id, ca.id, ca.account_code, ca.account_name, ca.account_type;

COMMENT ON VIEW v_account_balances_from_journals IS 'أرصدة الحسابات المحسوبة من القيود المحاسبية فقط (قراءة فقط - لا يؤثر على البيانات)';

-- =====================================================
-- ملخص التنفيذ
-- =====================================================
DO $$
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE '✅ تم تطبيق البنود الآمنة فقط';
  RAISE NOTICE '========================================';
  RAISE NOTICE '1. ✅ Function: calculate_invoice_paid_amount()';
  RAISE NOTICE '2. ✅ Function: calculate_account_balance()';
  RAISE NOTICE '3. ✅ Function: auto_create_invoice_journal()';
  RAISE NOTICE '4. ✅ Index: idx_journal_entry_lines_account_journal';
  RAISE NOTICE '5. ✅ Index: idx_journal_entries_reference_lookup';
  RAISE NOTICE '6. ✅ View: v_account_balances_from_journals';
  RAISE NOTICE '========================================';
  RAISE NOTICE '✅ لا يوجد Triggers';
  RAISE NOTICE '✅ لا يوجد UPDATE statements';
  RAISE NOTICE '✅ لا يوجد DELETE statements';
  RAISE NOTICE '✅ لا يوجد ALTER statements على البيانات';
  RAISE NOTICE '✅ التأثير على البيانات الحالية: صفر';
  RAISE NOTICE '========================================';
END $$;

-- =====================================================
-- شرح مختصر
-- =====================================================
-- 
-- ما أضافه هذا Migration:
-- =====================================================
-- 1. Functions للقراءة فقط:
--    - calculate_invoice_paid_amount(): حساب المبلغ المدفوع من القيود
--    - calculate_account_balance(): حساب رصيد الحساب من القيود
--
-- 2. Helper Function (لا trigger):
--    - auto_create_invoice_journal(): Function مساعدة لإنشاء قيد فاتورة
--      (يتم استدعاؤها من الكود فقط - لا تعمل تلقائيًا)
--
-- 3. Indexes لتحسين الأداء:
--    - idx_journal_entry_lines_account_journal: تحسين استعلامات الأرصدة
--    - idx_journal_entries_reference_lookup: تحسين البحث في القيود
--
-- 4. View للقراءة فقط:
--    - v_account_balances_from_journals: حساب الأرصدة من القيود
--
-- لماذا لا يؤثر على البيانات الحالية:
-- =====================================================
-- ✅ جميع Functions للقراءة فقط - لا تعدل أي بيانات
-- ✅ Helper Function لا يتم استدعاؤها تلقائيًا (لا trigger)
-- ✅ Indexes فقط تحسين الأداء - لا تغير البيانات
-- ✅ View للقراءة فقط - لا تعدل أي بيانات
-- ✅ لا يوجد Triggers - لا تأثير تلقائي
-- ✅ لا يوجد UPDATE/DELETE/ALTER على البيانات
--
-- الاستخدام:
-- =====================================================
-- يمكن استخدام Functions و View في:
--   - التقارير المالية
--   - الاستعلامات المحاسبية
--   - التحقق من الأرصدة
--   - المقارنة مع account_balances
--
-- يمكن استدعاء auto_create_invoice_journal() من الكود:
--   SELECT auto_create_invoice_journal(invoice_id, company_id, entry_date);
--
-- =====================================================
-- ✅ هذا Migration آمن 100% للإنتاج
-- ✅ يمكن تطبيقه بأمان على قاعدة البيانات الحالية
-- ✅ لا يحتاج نسخة احتياطية (لكن يُنصح بها دائماً)
-- =====================================================

