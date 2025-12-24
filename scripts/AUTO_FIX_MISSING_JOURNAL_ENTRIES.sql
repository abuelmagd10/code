-- =====================================================
-- 🔧 إصلاح تلقائي للقيود المحاسبية الناقصة
-- Auto-Fix Missing Journal Entries
-- =====================================================
-- تاريخ الإنشاء: 2025-01-XX
-- الهدف: إنشاء القيود المحاسبية الناقصة تلقائياً
-- =====================================================
-- 
-- ⚠️ تحذير: هذا السكربت ينشئ قيود محاسبية جديدة
-- يُنصح بعمل نسخة احتياطية قبل التنفيذ
-- =====================================================

-- =====================================================
-- Function: إيجاد الحسابات المطلوبة للشركة
-- =====================================================
CREATE OR REPLACE FUNCTION find_company_accounts(p_company_id UUID)
RETURNS TABLE(
  ar_account_id UUID,
  ap_account_id UUID,
  revenue_account_id UUID,
  expense_account_id UUID,
  cash_account_id UUID,
  bank_account_id UUID,
  vat_payable_account_id UUID,
  shipping_account_id UUID
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    -- AR (Accounts Receivable)
    (SELECT id FROM chart_of_accounts 
     WHERE company_id = p_company_id 
     AND sub_type = 'accounts_receivable' 
     AND is_active = true 
     LIMIT 1) as ar_account_id,
    
    -- AP (Accounts Payable)
    (SELECT id FROM chart_of_accounts 
     WHERE company_id = p_company_id 
     AND sub_type = 'accounts_payable' 
     AND is_active = true 
     LIMIT 1) as ap_account_id,
    
    -- Revenue
    (SELECT id FROM chart_of_accounts 
     WHERE company_id = p_company_id 
     AND account_type = 'income' 
     AND is_active = true 
     ORDER BY account_code 
     LIMIT 1) as revenue_account_id,
    
    -- Expense
    (SELECT id FROM chart_of_accounts 
     WHERE company_id = p_company_id 
     AND account_type = 'expense' 
     AND is_active = true 
     ORDER BY account_code 
     LIMIT 1) as expense_account_id,
    
    -- Cash
    (SELECT id FROM chart_of_accounts 
     WHERE company_id = p_company_id 
     AND sub_type = 'cash' 
     AND is_active = true 
     LIMIT 1) as cash_account_id,
    
    -- Bank
    (SELECT id FROM chart_of_accounts 
     WHERE company_id = p_company_id 
     AND sub_type IN ('bank', 'checking', 'savings') 
     AND is_active = true 
     LIMIT 1) as bank_account_id,
    
    -- VAT Payable
    (SELECT id FROM chart_of_accounts 
     WHERE company_id = p_company_id 
     AND (account_name ILIKE '%vat%' OR account_name ILIKE '%ضريبة%' OR account_name ILIKE '%tax%')
     AND account_type = 'liability'
     AND is_active = true 
     LIMIT 1) as vat_payable_account_id,
    
    -- Shipping
    (SELECT id FROM chart_of_accounts 
     WHERE company_id = p_company_id 
     AND (account_name ILIKE '%shipping%' OR account_name ILIKE '%شحن%' OR account_name ILIKE '%freight%')
     AND is_active = true 
     LIMIT 1) as shipping_account_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- Function: إنشاء قيد AR/Revenue للفاتورة
-- =====================================================
CREATE OR REPLACE FUNCTION create_invoice_ar_revenue_entry(
  p_invoice_id UUID,
  p_company_id UUID,
  p_entry_date DATE,
  p_description TEXT
)
RETURNS UUID AS $$
DECLARE
  v_entry_id UUID;
  v_accounts RECORD;
  v_invoice RECORD;
  v_subtotal DECIMAL(15, 2);
  v_tax_amount DECIMAL(15, 2);
  v_shipping DECIMAL(15, 2);
  v_total DECIMAL(15, 2);
  v_adjustment DECIMAL(15, 2);
BEGIN
  -- جلب بيانات الفاتورة
  SELECT 
    subtotal, tax_amount, shipping, total_amount, invoice_number
  INTO v_invoice
  FROM invoices
  WHERE id = p_invoice_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'الفاتورة غير موجودة: %', p_invoice_id;
  END IF;
  
  v_subtotal := COALESCE(v_invoice.subtotal, 0);
  v_tax_amount := COALESCE(v_invoice.tax_amount, 0);
  v_shipping := COALESCE(v_invoice.shipping, 0);
  v_total := COALESCE(v_invoice.total_amount, 0);
  
  -- إيجاد الحسابات المطلوبة
  SELECT * INTO v_accounts FROM find_company_accounts(p_company_id);
  
  IF v_accounts.ar_account_id IS NULL OR v_accounts.revenue_account_id IS NULL THEN
    RAISE EXCEPTION 'حسابات AR أو Revenue غير موجودة للشركة: %', p_company_id;
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
    COALESCE(p_description, 'قيد فاتورة: ' || v_invoice.invoice_number),
    'posted'
  ) RETURNING id INTO v_entry_id;
  
  -- إنشاء سطور القيد
  -- 1. AR (Debit)
  INSERT INTO journal_entry_lines (
    journal_entry_id,
    account_id,
    debit_amount,
    credit_amount,
    description
  ) VALUES (
    v_entry_id,
    v_accounts.ar_account_id,
    v_total,
    0,
    'الذمم المدينة'
  );
  
  -- 2. Revenue (Credit)
  INSERT INTO journal_entry_lines (
    journal_entry_id,
    account_id,
    debit_amount,
    credit_amount,
    description
  ) VALUES (
    v_entry_id,
    v_accounts.revenue_account_id,
    0,
    v_subtotal,
    'إيرادات المبيعات'
  );
  
  -- 3. VAT Payable (Credit) - إن وجد
  IF v_tax_amount > 0 AND v_accounts.vat_payable_account_id IS NOT NULL THEN
    INSERT INTO journal_entry_lines (
      journal_entry_id,
      account_id,
      debit_amount,
      credit_amount,
      description
    ) VALUES (
      v_entry_id,
      v_accounts.vat_payable_account_id,
      0,
      v_tax_amount,
      'ضريبة القيمة المضافة'
    );
  END IF;
  
  -- 4. Shipping (Credit) - إن وجد
  IF v_shipping > 0 AND v_accounts.shipping_account_id IS NOT NULL THEN
    INSERT INTO journal_entry_lines (
      journal_entry_id,
      account_id,
      debit_amount,
      credit_amount,
      description
    ) VALUES (
      v_entry_id,
      v_accounts.shipping_account_id,
      0,
      v_shipping,
      'الشحن'
    );
  END IF;
  
  -- إذا لم يكن هناك حساب VAT أو Shipping، نضيف الفرق إلى Revenue
  IF (v_tax_amount > 0 AND v_accounts.vat_payable_account_id IS NULL) OR 
     (v_shipping > 0 AND v_accounts.shipping_account_id IS NULL) THEN
    v_adjustment := v_total - v_subtotal - 
      CASE WHEN v_accounts.vat_payable_account_id IS NOT NULL THEN v_tax_amount ELSE 0 END -
      CASE WHEN v_accounts.shipping_account_id IS NOT NULL THEN v_shipping ELSE 0 END;
    
    IF v_adjustment != 0 THEN
      UPDATE journal_entry_lines
      SET credit_amount = credit_amount + v_adjustment
      WHERE journal_entry_id = v_entry_id
      AND account_id = v_accounts.revenue_account_id;
    END IF;
  END IF;
  
  RETURN v_entry_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- Function: إنشاء قيد الدفع للفاتورة
-- =====================================================
CREATE OR REPLACE FUNCTION create_invoice_payment_entry(
  p_invoice_id UUID,
  p_payment_id UUID,
  p_company_id UUID,
  p_entry_date DATE,
  p_amount DECIMAL(15, 2),
  p_payment_method TEXT,
  p_description TEXT
)
RETURNS UUID AS $$
DECLARE
  v_entry_id UUID;
  v_accounts RECORD;
  v_invoice RECORD;
  v_cash_bank_account_id UUID;
BEGIN
  -- جلب بيانات الفاتورة
  SELECT invoice_number INTO v_invoice
  FROM invoices
  WHERE id = p_invoice_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'الفاتورة غير موجودة: %', p_invoice_id;
  END IF;
  
  -- إيجاد الحسابات المطلوبة
  SELECT * INTO v_accounts FROM find_company_accounts(p_company_id);
  
  IF v_accounts.ar_account_id IS NULL THEN
    RAISE EXCEPTION 'حساب AR غير موجود للشركة: %', p_company_id;
  END IF;
  
  -- تحديد حساب النقد/البنك
  IF p_payment_method ILIKE '%bank%' OR p_payment_method ILIKE '%بنك%' OR p_payment_method ILIKE '%transfer%' THEN
    v_cash_bank_account_id := v_accounts.bank_account_id;
  ELSE
    v_cash_bank_account_id := v_accounts.cash_account_id;
  END IF;
  
  IF v_cash_bank_account_id IS NULL THEN
    RAISE EXCEPTION 'حساب النقد/البنك غير موجود للشركة: %', p_company_id;
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
    'invoice_payment',
    COALESCE(p_payment_id, p_invoice_id),
    p_entry_date,
    COALESCE(p_description, 'قيد دفع فاتورة: ' || v_invoice.invoice_number),
    'posted'
  ) RETURNING id INTO v_entry_id;
  
  -- إنشاء سطور القيد
  -- 1. Cash/Bank (Debit)
  INSERT INTO journal_entry_lines (
    journal_entry_id,
    account_id,
    debit_amount,
    credit_amount,
    description
  ) VALUES (
    v_entry_id,
    v_cash_bank_account_id,
    p_amount,
    0,
    'النقد/البنك'
  );
  
  -- 2. AR (Credit)
  INSERT INTO journal_entry_lines (
    journal_entry_id,
    account_id,
    debit_amount,
    credit_amount,
    description
  ) VALUES (
    v_entry_id,
    v_accounts.ar_account_id,
    0,
    p_amount,
    'الذمم المدينة'
  );
  
  RETURN v_entry_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- Function: إنشاء قيد AP/Expense لفاتورة الشراء
-- =====================================================
CREATE OR REPLACE FUNCTION create_bill_ap_expense_entry(
  p_bill_id UUID,
  p_company_id UUID,
  p_entry_date DATE,
  p_description TEXT
)
RETURNS UUID AS $$
DECLARE
  v_entry_id UUID;
  v_accounts RECORD;
  v_bill RECORD;
  v_subtotal DECIMAL(15, 2);
  v_tax_amount DECIMAL(15, 2);
  v_total DECIMAL(15, 2);
BEGIN
  -- جلب بيانات فاتورة الشراء
  SELECT 
    subtotal, tax_amount, total_amount, bill_number
  INTO v_bill
  FROM bills
  WHERE id = p_bill_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'فاتورة الشراء غير موجودة: %', p_bill_id;
  END IF;
  
  v_subtotal := COALESCE(v_bill.subtotal, 0);
  v_tax_amount := COALESCE(v_bill.tax_amount, 0);
  v_total := COALESCE(v_bill.total_amount, 0);
  
  -- إيجاد الحسابات المطلوبة
  SELECT * INTO v_accounts FROM find_company_accounts(p_company_id);
  
  IF v_accounts.ap_account_id IS NULL OR v_accounts.expense_account_id IS NULL THEN
    RAISE EXCEPTION 'حسابات AP أو Expense غير موجودة للشركة: %', p_company_id;
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
    'bill',
    p_bill_id,
    p_entry_date,
    COALESCE(p_description, 'قيد فاتورة شراء: ' || v_bill.bill_number),
    'posted'
  ) RETURNING id INTO v_entry_id;
  
  -- إنشاء سطور القيد
  -- 1. Expense (Debit)
  INSERT INTO journal_entry_lines (
    journal_entry_id,
    account_id,
    debit_amount,
    credit_amount,
    description
  ) VALUES (
    v_entry_id,
    v_accounts.expense_account_id,
    v_subtotal,
    0,
    'المصروفات/التكاليف'
  );
  
  -- 2. VAT Payable (Debit) - إن وجد
  IF v_tax_amount > 0 AND v_accounts.vat_payable_account_id IS NOT NULL THEN
    INSERT INTO journal_entry_lines (
      journal_entry_id,
      account_id,
      debit_amount,
      credit_amount,
      description
    ) VALUES (
      v_entry_id,
      v_accounts.vat_payable_account_id,
      v_tax_amount,
      0,
      'ضريبة القيمة المضافة (مدخلات)'
    );
  END IF;
  
  -- 3. AP (Credit)
  INSERT INTO journal_entry_lines (
    journal_entry_id,
    account_id,
    debit_amount,
    credit_amount,
    description
  ) VALUES (
    v_entry_id,
    v_accounts.ap_account_id,
    0,
    v_total,
    'الذمم الدائنة'
  );
  
  -- إذا لم يكن هناك حساب VAT، نضيف الفرق إلى Expense
  IF v_tax_amount > 0 AND v_accounts.vat_payable_account_id IS NULL THEN
    UPDATE journal_entry_lines
    SET debit_amount = debit_amount + v_tax_amount
    WHERE journal_entry_id = v_entry_id
    AND account_id = v_accounts.expense_account_id;
  END IF;
  
  RETURN v_entry_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- Function: إنشاء قيد الدفع لفاتورة الشراء
-- =====================================================
CREATE OR REPLACE FUNCTION create_bill_payment_entry(
  p_bill_id UUID,
  p_payment_id UUID,
  p_company_id UUID,
  p_entry_date DATE,
  p_amount DECIMAL(15, 2),
  p_payment_method TEXT,
  p_description TEXT
)
RETURNS UUID AS $$
DECLARE
  v_entry_id UUID;
  v_accounts RECORD;
  v_bill RECORD;
  v_cash_bank_account_id UUID;
BEGIN
  -- جلب بيانات فاتورة الشراء
  SELECT bill_number INTO v_bill
  FROM bills
  WHERE id = p_bill_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'فاتورة الشراء غير موجودة: %', p_bill_id;
  END IF;
  
  -- إيجاد الحسابات المطلوبة
  SELECT * INTO v_accounts FROM find_company_accounts(p_company_id);
  
  IF v_accounts.ap_account_id IS NULL THEN
    RAISE EXCEPTION 'حساب AP غير موجود للشركة: %', p_company_id;
  END IF;
  
  -- تحديد حساب النقد/البنك
  IF p_payment_method ILIKE '%bank%' OR p_payment_method ILIKE '%بنك%' OR p_payment_method ILIKE '%transfer%' THEN
    v_cash_bank_account_id := v_accounts.bank_account_id;
  ELSE
    v_cash_bank_account_id := v_accounts.cash_account_id;
  END IF;
  
  IF v_cash_bank_account_id IS NULL THEN
    RAISE EXCEPTION 'حساب النقد/البنك غير موجود للشركة: %', p_company_id;
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
    'bill_payment',
    COALESCE(p_payment_id, p_bill_id),
    p_entry_date,
    COALESCE(p_description, 'قيد دفع فاتورة شراء: ' || v_bill.bill_number),
    'posted'
  ) RETURNING id INTO v_entry_id;
  
  -- إنشاء سطور القيد
  -- 1. AP (Debit)
  INSERT INTO journal_entry_lines (
    journal_entry_id,
    account_id,
    debit_amount,
    credit_amount,
    description
  ) VALUES (
    v_entry_id,
    v_accounts.ap_account_id,
    p_amount,
    0,
    'الذمم الدائنة'
  );
  
  -- 2. Cash/Bank (Credit)
  INSERT INTO journal_entry_lines (
    journal_entry_id,
    account_id,
    debit_amount,
    credit_amount,
    description
  ) VALUES (
    v_entry_id,
    v_cash_bank_account_id,
    0,
    p_amount,
    'النقد/البنك'
  );
  
  RETURN v_entry_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- Function: إنشاء قيد دفع عام (للدفعات بدون فاتورة)
-- =====================================================
CREATE OR REPLACE FUNCTION create_generic_payment_entry(
  p_payment_id UUID,
  p_company_id UUID,
  p_entry_date DATE,
  p_amount DECIMAL(15, 2),
  p_payment_method TEXT,
  p_customer_id UUID,
  p_supplier_id UUID,
  p_description TEXT
)
RETURNS UUID AS $$
DECLARE
  v_entry_id UUID;
  v_accounts RECORD;
  v_cash_bank_account_id UUID;
  v_ar_ap_account_id UUID;
  v_reference_type TEXT;
BEGIN
  -- إيجاد الحسابات المطلوبة
  SELECT * INTO v_accounts FROM find_company_accounts(p_company_id);
  
  -- تحديد حساب النقد/البنك
  IF p_payment_method ILIKE '%bank%' OR p_payment_method ILIKE '%بنك%' OR p_payment_method ILIKE '%transfer%' THEN
    v_cash_bank_account_id := v_accounts.bank_account_id;
  ELSE
    v_cash_bank_account_id := v_accounts.cash_account_id;
  END IF;
  
  IF v_cash_bank_account_id IS NULL THEN
    RAISE EXCEPTION 'حساب النقد/البنك غير موجود للشركة: %', p_company_id;
  END IF;
  
  -- تحديد نوع القيد والحساب
  IF p_customer_id IS NOT NULL THEN
    v_reference_type := 'customer_payment';
    v_ar_ap_account_id := v_accounts.ar_account_id;
    IF v_ar_ap_account_id IS NULL THEN
      RAISE EXCEPTION 'حساب AR غير موجود للشركة: %', p_company_id;
    END IF;
  ELSIF p_supplier_id IS NOT NULL THEN
    v_reference_type := 'supplier_payment';
    v_ar_ap_account_id := v_accounts.ap_account_id;
    IF v_ar_ap_account_id IS NULL THEN
      RAISE EXCEPTION 'حساب AP غير موجود للشركة: %', p_company_id;
    END IF;
  ELSE
    RAISE EXCEPTION 'يجب تحديد عميل أو مورد للدفعة';
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
    v_reference_type,
    p_payment_id,
    p_entry_date,
    COALESCE(p_description, 'قيد دفعة عامة'),
    'posted'
  ) RETURNING id INTO v_entry_id;
  
  -- إنشاء سطور القيد
  IF p_customer_id IS NOT NULL THEN
    -- دفعة عميل: Cash/Bank (Debit) vs AR (Credit)
    INSERT INTO journal_entry_lines (
      journal_entry_id,
      account_id,
      debit_amount,
      credit_amount,
      description
    ) VALUES (
      v_entry_id,
      v_cash_bank_account_id,
      p_amount,
      0,
      'النقد/البنك'
    );
    
    INSERT INTO journal_entry_lines (
      journal_entry_id,
      account_id,
      debit_amount,
      credit_amount,
      description
    ) VALUES (
      v_entry_id,
      v_ar_ap_account_id,
      0,
      p_amount,
      'الذمم المدينة'
    );
  ELSE
    -- دفعة مورد: AP (Debit) vs Cash/Bank (Credit)
    INSERT INTO journal_entry_lines (
      journal_entry_id,
      account_id,
      debit_amount,
      credit_amount,
      description
    ) VALUES (
      v_entry_id,
      v_ar_ap_account_id,
      p_amount,
      0,
      'الذمم الدائنة'
    );
    
    INSERT INTO journal_entry_lines (
      journal_entry_id,
      account_id,
      debit_amount,
      credit_amount,
      description
    ) VALUES (
      v_entry_id,
      v_cash_bank_account_id,
      0,
      p_amount,
      'النقد/البنك'
    );
  END IF;
  
  RETURN v_entry_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- السكربت الرئيسي: إصلاح الفواتير بدون قيود
-- =====================================================
DO $$
DECLARE
  v_invoice RECORD;
  v_entry_id UUID;
  v_payment_entry_id UUID;
  v_count INTEGER := 0;
BEGIN
  RAISE NOTICE '🔧 بدء إصلاح الفواتير بدون قيود محاسبية...';
  
  FOR v_invoice IN 
    SELECT 
      i.id,
      i.company_id,
      i.invoice_number,
      i.invoice_date,
      i.status,
      i.total_amount,
      i.paid_amount
    FROM invoices i
    WHERE i.status IN ('sent', 'paid', 'partially_paid')
      AND (i.is_deleted IS NULL OR i.is_deleted = false)
      AND NOT EXISTS (
        SELECT 1 FROM journal_entries je 
        WHERE je.reference_id = i.id 
        AND je.reference_type = 'invoice'
      )
    ORDER BY i.invoice_date
  LOOP
    BEGIN
      -- التحقق من صحة البيانات
      IF v_invoice.total_amount IS NULL OR v_invoice.total_amount <= 0 THEN
        RAISE WARNING '⚠️ تخطي الفاتورة %: المبلغ الإجمالي غير صحيح', v_invoice.invoice_number;
      ELSIF v_invoice.invoice_date IS NULL THEN
        RAISE WARNING '⚠️ تخطي الفاتورة %: تاريخ الفاتورة NULL', v_invoice.invoice_number;
      ELSE
        -- التحقق من وجود الحسابات المطلوبة
        DECLARE
          v_accounts_check RECORD;
          v_skip BOOLEAN := FALSE;
        BEGIN
          SELECT * INTO v_accounts_check FROM find_company_accounts(v_invoice.company_id);
          
          IF v_accounts_check.ar_account_id IS NULL THEN
            RAISE WARNING '❌ فشل إصلاح الفاتورة %: حساب AR غير موجود للشركة', v_invoice.invoice_number;
            v_skip := TRUE;
          ELSIF v_accounts_check.revenue_account_id IS NULL THEN
            RAISE WARNING '❌ فشل إصلاح الفاتورة %: حساب Revenue غير موجود للشركة', v_invoice.invoice_number;
            v_skip := TRUE;
          END IF;
          
          IF NOT v_skip THEN
      
            -- إنشاء قيد AR/Revenue
            v_entry_id := create_invoice_ar_revenue_entry(
              v_invoice.id,
              v_invoice.company_id,
              v_invoice.invoice_date,
              'إصلاح تلقائي: قيد فاتورة ' || v_invoice.invoice_number
            );
            
            v_count := v_count + 1;
            RAISE NOTICE '✅ تم إنشاء قيد AR/Revenue للفاتورة: %', v_invoice.invoice_number;
            
            -- إذا كانت الفاتورة مدفوعة أو مدفوعة جزئياً، إنشاء قيد الدفع
            IF v_invoice.paid_amount > 0 THEN
              BEGIN
                v_payment_entry_id := create_invoice_payment_entry(
                  v_invoice.id,
                  NULL, -- payment_id
                  v_invoice.company_id,
                  v_invoice.invoice_date,
                  v_invoice.paid_amount,
                  'cash', -- payment_method افتراضي
                  'إصلاح تلقائي: قيد دفع فاتورة ' || v_invoice.invoice_number
                );
                
                RAISE NOTICE '✅ تم إنشاء قيد الدفع للفاتورة: %', v_invoice.invoice_number;
              EXCEPTION WHEN OTHERS THEN
                RAISE WARNING '⚠️ فشل إنشاء قيد الدفع للفاتورة %: %', v_invoice.invoice_number, SQLERRM;
              END;
            END IF;
          END IF;
        END;
      END IF;
      
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING '❌ فشل إصلاح الفاتورة %: %', v_invoice.invoice_number, SQLERRM;
    END;
  END LOOP;
  
  RAISE NOTICE '✅ تم إصلاح % فاتورة', v_count;
END $$;

-- =====================================================
-- السكربت الرئيسي: إصلاح فواتير الشراء بدون قيود
-- =====================================================
DO $$
DECLARE
  v_bill RECORD;
  v_entry_id UUID;
  v_payment_entry_id UUID;
  v_count INTEGER := 0;
BEGIN
  RAISE NOTICE '🔧 بدء إصلاح فواتير الشراء بدون قيود محاسبية...';
  
  FOR v_bill IN 
    SELECT 
      b.id,
      b.company_id,
      b.bill_number,
      b.bill_date,
      b.status,
      b.total_amount,
      b.paid_amount
    FROM bills b
    WHERE b.status IN ('sent', 'paid', 'partially_paid', 'received')
      AND (b.is_deleted IS NULL OR b.is_deleted = false)
      AND NOT EXISTS (
        SELECT 1 FROM journal_entries je 
        WHERE je.reference_id = b.id 
        AND je.reference_type = 'bill'
      )
    ORDER BY b.bill_date
  LOOP
    BEGIN
      -- التحقق من صحة البيانات
      IF v_bill.total_amount IS NULL OR v_bill.total_amount <= 0 THEN
        RAISE WARNING '⚠️ تخطي فاتورة الشراء %: المبلغ الإجمالي غير صحيح', v_bill.bill_number;
      ELSIF v_bill.bill_date IS NULL THEN
        RAISE WARNING '⚠️ تخطي فاتورة الشراء %: تاريخ الفاتورة NULL', v_bill.bill_number;
      -- إنشاء قيد AP/Expense (فقط إذا كانت مدفوعة)
      ELSIF v_bill.paid_amount > 0 AND v_bill.paid_amount IS NOT NULL THEN
        -- التحقق من وجود الحسابات المطلوبة
        DECLARE
          v_accounts_check RECORD;
          v_skip BOOLEAN := FALSE;
        BEGIN
          SELECT * INTO v_accounts_check FROM find_company_accounts(v_bill.company_id);
          
          IF v_accounts_check.ap_account_id IS NULL THEN
            RAISE WARNING '❌ فشل إصلاح فاتورة الشراء %: حساب AP غير موجود للشركة', v_bill.bill_number;
            v_skip := TRUE;
          ELSIF v_accounts_check.expense_account_id IS NULL THEN
            RAISE WARNING '❌ فشل إصلاح فاتورة الشراء %: حساب Expense غير موجود للشركة', v_bill.bill_number;
            v_skip := TRUE;
          END IF;
          
          IF NOT v_skip THEN
        
            v_entry_id := create_bill_ap_expense_entry(
              v_bill.id,
              v_bill.company_id,
              v_bill.bill_date,
              'إصلاح تلقائي: قيد فاتورة شراء ' || v_bill.bill_number
            );
            
            v_count := v_count + 1;
            RAISE NOTICE '✅ تم إنشاء قيد AP/Expense لفاتورة الشراء: %', v_bill.bill_number;
            
            -- إنشاء قيد الدفع
            BEGIN
              v_payment_entry_id := create_bill_payment_entry(
                v_bill.id,
                NULL, -- payment_id
                v_bill.company_id,
                v_bill.bill_date,
                v_bill.paid_amount,
                'cash', -- payment_method افتراضي
                'إصلاح تلقائي: قيد دفع فاتورة شراء ' || v_bill.bill_number
              );
              
              RAISE NOTICE '✅ تم إنشاء قيد الدفع لفاتورة الشراء: %', v_bill.bill_number;
            EXCEPTION WHEN OTHERS THEN
              RAISE WARNING '⚠️ فشل إنشاء قيد الدفع لفاتورة الشراء %: %', v_bill.bill_number, SQLERRM;
            END;
          END IF;
        END;
      ELSE
        RAISE NOTICE 'ℹ️ تخطي فاتورة الشراء %: لم يتم الدفع بعد (paid_amount = 0)', v_bill.bill_number;
      END IF;
      
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING '❌ فشل إصلاح فاتورة الشراء %: %', v_bill.bill_number, SQLERRM;
    END;
  END LOOP;
  
  RAISE NOTICE '✅ تم إصلاح % فاتورة شراء', v_count;
END $$;

-- =====================================================
-- السكربت الرئيسي: إصلاح المدفوعات بدون قيود
-- =====================================================
DO $$
DECLARE
  v_payment RECORD;
  v_entry_id UUID;
  v_count INTEGER := 0;
BEGIN
  RAISE NOTICE '🔧 بدء إصلاح المدفوعات بدون قيود محاسبية...';
  
  FOR v_payment IN 
    SELECT 
      p.id,
      p.company_id,
      p.payment_date,
      p.amount,
      p.payment_method,
      p.customer_id,
      p.supplier_id,
      p.invoice_id,
      p.bill_id
    FROM payments p
    WHERE NOT EXISTS (
      SELECT 1 FROM journal_entries je 
      WHERE (je.reference_id = p.id OR je.reference_id = p.invoice_id OR je.reference_id = p.bill_id)
      AND je.reference_type IN ('customer_payment', 'supplier_payment', 'invoice_payment', 'bill_payment')
    )
    ORDER BY p.payment_date
  LOOP
    BEGIN
      -- إذا كانت الدفعة مرتبطة بفاتورة
      IF v_payment.invoice_id IS NOT NULL THEN
        v_entry_id := create_invoice_payment_entry(
          v_payment.invoice_id,
          v_payment.id,
          v_payment.company_id,
          v_payment.payment_date,
          v_payment.amount,
          COALESCE(v_payment.payment_method, 'cash'),
          'إصلاح تلقائي: قيد دفع مرتبط بفاتورة'
        );
        
        v_count := v_count + 1;
        RAISE NOTICE '✅ تم إنشاء قيد دفع فاتورة: %', v_payment.id;
        
      -- إذا كانت الدفعة مرتبطة بفاتورة شراء
      ELSIF v_payment.bill_id IS NOT NULL THEN
        v_entry_id := create_bill_payment_entry(
          v_payment.bill_id,
          v_payment.id,
          v_payment.company_id,
          v_payment.payment_date,
          v_payment.amount,
          COALESCE(v_payment.payment_method, 'cash'),
          'إصلاح تلقائي: قيد دفع مرتبط بفاتورة شراء'
        );
        
        v_count := v_count + 1;
        RAISE NOTICE '✅ تم إنشاء قيد دفع فاتورة شراء: %', v_payment.id;
        
      -- دفعة عامة (عميل أو مورد)
      ELSIF v_payment.customer_id IS NOT NULL OR v_payment.supplier_id IS NOT NULL THEN
        v_entry_id := create_generic_payment_entry(
          v_payment.id,
          v_payment.company_id,
          v_payment.payment_date,
          v_payment.amount,
          COALESCE(v_payment.payment_method, 'cash'),
          v_payment.customer_id,
          v_payment.supplier_id,
          'إصلاح تلقائي: قيد دفعة عامة'
        );
        
        v_count := v_count + 1;
        RAISE NOTICE '✅ تم إنشاء قيد دفعة عامة: %', v_payment.id;
      END IF;
      
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING '❌ فشل إصلاح الدفعة %: %', v_payment.id, SQLERRM;
    END;
  END LOOP;
  
  RAISE NOTICE '✅ تم إصلاح % دفعة', v_count;
END $$;

-- =====================================================
-- التحقق من النتائج
-- =====================================================
SELECT 
  'نتائج الإصلاح' as report_section,
  (SELECT COUNT(*) FROM invoices i
   WHERE i.status IN ('sent', 'paid', 'partially_paid')
   AND (i.is_deleted IS NULL OR i.is_deleted = false)
   AND NOT EXISTS (SELECT 1 FROM journal_entries je WHERE je.reference_id = i.id AND je.reference_type = 'invoice')
  ) as remaining_invoices_without_entries,
  (SELECT COUNT(*) FROM bills b
   WHERE b.status IN ('sent', 'paid', 'partially_paid', 'received')
   AND (b.is_deleted IS NULL OR b.is_deleted = false)
   AND NOT EXISTS (SELECT 1 FROM journal_entries je WHERE je.reference_id = b.id AND je.reference_type = 'bill')
  ) as remaining_bills_without_entries,
  (SELECT COUNT(*) FROM payments p
   WHERE NOT EXISTS (SELECT 1 FROM journal_entries je 
     WHERE (je.reference_id = p.id OR je.reference_id = p.invoice_id OR je.reference_id = p.bill_id)
     AND je.reference_type IN ('customer_payment', 'supplier_payment', 'invoice_payment', 'bill_payment'))
  ) as remaining_payments_without_entries;

-- =====================================================
-- نهاية السكربت
-- =====================================================
DO $$
BEGIN
  RAISE NOTICE '✅ اكتمل الإصلاح التلقائي!';
  RAISE NOTICE '📊 يُنصح بإعادة تنفيذ المراجعة المحاسبية الشاملة للتحقق من النتائج.';
END $$;

