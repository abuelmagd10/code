-- =====================================================
-- 🧪 COMPREHENSIVE ACCOUNTING PATTERN TEST
-- =====================================================
-- هذا السكريبت يختبر النمط المحاسبي Cash Basis بشكل شامل
-- يجب تشغيله على قاعدة بيانات اختبار فقط!

-- =====================================================
-- 📋 SETUP: إعداد بيانات الاختبار
-- =====================================================

-- 1️⃣ الحصول على معرفات الشركة والفرع والمستودع
DO $$
DECLARE
  v_company_id UUID;
  v_branch_id UUID;
  v_warehouse_id UUID;
  v_cost_center_id UUID;
  v_customer_id UUID;
  v_supplier_id UUID;
  v_product_id UUID;
  v_cash_account_id UUID;
  v_ar_account_id UUID;
  v_ap_account_id UUID;
  v_revenue_account_id UUID;
  v_expense_account_id UUID;
  v_inventory_account_id UUID;
  v_cogs_account_id UUID;
BEGIN
  -- الحصول على أول شركة
  SELECT id INTO v_company_id FROM companies LIMIT 1;
  
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'لا توجد شركات في قاعدة البيانات!';
  END IF;
  
  RAISE NOTICE '✅ Company ID: %', v_company_id;
  
  -- الحصول على أول فرع
  SELECT id INTO v_branch_id FROM branches WHERE company_id = v_company_id LIMIT 1;
  
  IF v_branch_id IS NULL THEN
    RAISE EXCEPTION 'لا توجد فروع للشركة!';
  END IF;
  
  RAISE NOTICE '✅ Branch ID: %', v_branch_id;
  
  -- الحصول على أول مستودع
  SELECT id INTO v_warehouse_id FROM warehouses WHERE company_id = v_company_id LIMIT 1;
  
  IF v_warehouse_id IS NULL THEN
    RAISE EXCEPTION 'لا توجد مستودعات للشركة!';
  END IF;
  
  RAISE NOTICE '✅ Warehouse ID: %', v_warehouse_id;
  
  -- الحصول على أول مركز تكلفة
  SELECT id INTO v_cost_center_id FROM cost_centers WHERE company_id = v_company_id LIMIT 1;
  
  RAISE NOTICE '✅ Cost Center ID: %', v_cost_center_id;
  
  -- الحصول على أول عميل
  SELECT id INTO v_customer_id FROM customers WHERE company_id = v_company_id LIMIT 1;
  
  IF v_customer_id IS NULL THEN
    RAISE EXCEPTION 'لا يوجد عملاء للشركة!';
  END IF;
  
  RAISE NOTICE '✅ Customer ID: %', v_customer_id;
  
  -- الحصول على أول مورد
  SELECT id INTO v_supplier_id FROM suppliers WHERE company_id = v_company_id LIMIT 1;
  
  IF v_supplier_id IS NULL THEN
    RAISE EXCEPTION 'لا يوجد موردين للشركة!';
  END IF;
  
  RAISE NOTICE '✅ Supplier ID: %', v_supplier_id;
  
  -- الحصول على أول منتج
  SELECT id INTO v_product_id FROM products WHERE company_id = v_company_id LIMIT 1;
  
  IF v_product_id IS NULL THEN
    RAISE EXCEPTION 'لا توجد منتجات للشركة!';
  END IF;
  
  RAISE NOTICE '✅ Product ID: %', v_product_id;
  
  -- الحصول على الحسابات المحاسبية
  SELECT id INTO v_cash_account_id FROM chart_of_accounts 
  WHERE company_id = v_company_id AND account_type = 'asset' AND name ILIKE '%نقدية%' LIMIT 1;
  
  SELECT id INTO v_ar_account_id FROM chart_of_accounts 
  WHERE company_id = v_company_id AND account_type = 'asset' AND name ILIKE '%عملاء%' LIMIT 1;
  
  SELECT id INTO v_ap_account_id FROM chart_of_accounts 
  WHERE company_id = v_company_id AND account_type = 'liability' AND name ILIKE '%موردين%' LIMIT 1;
  
  SELECT id INTO v_revenue_account_id FROM chart_of_accounts 
  WHERE company_id = v_company_id AND account_type = 'revenue' LIMIT 1;
  
  SELECT id INTO v_expense_account_id FROM chart_of_accounts 
  WHERE company_id = v_company_id AND account_type = 'expense' LIMIT 1;
  
  SELECT id INTO v_inventory_account_id FROM chart_of_accounts 
  WHERE company_id = v_company_id AND account_type = 'asset' AND name ILIKE '%مخزون%' LIMIT 1;
  
  SELECT id INTO v_cogs_account_id FROM chart_of_accounts 
  WHERE company_id = v_company_id AND account_type = 'expense' AND name ILIKE '%تكلفة%' LIMIT 1;
  
  RAISE NOTICE '✅ Cash Account: %', v_cash_account_id;
  RAISE NOTICE '✅ AR Account: %', v_ar_account_id;
  RAISE NOTICE '✅ AP Account: %', v_ap_account_id;
  RAISE NOTICE '✅ Revenue Account: %', v_revenue_account_id;
  RAISE NOTICE '✅ Expense Account: %', v_expense_account_id;
  RAISE NOTICE '✅ Inventory Account: %', v_inventory_account_id;
  RAISE NOTICE '✅ COGS Account: %', v_cogs_account_id;
  
  -- حفظ المعرفات في جدول مؤقت
  CREATE TEMP TABLE test_ids (
    company_id UUID,
    branch_id UUID,
    warehouse_id UUID,
    cost_center_id UUID,
    customer_id UUID,
    supplier_id UUID,
    product_id UUID,
    cash_account_id UUID,
    ar_account_id UUID,
    ap_account_id UUID,
    revenue_account_id UUID,
    expense_account_id UUID,
    inventory_account_id UUID,
    cogs_account_id UUID
  );
  
  INSERT INTO test_ids VALUES (
    v_company_id,
    v_branch_id,
    v_warehouse_id,
    v_cost_center_id,
    v_customer_id,
    v_supplier_id,
    v_product_id,
    v_cash_account_id,
    v_ar_account_id,
    v_ap_account_id,
    v_revenue_account_id,
    v_expense_account_id,
    v_inventory_account_id,
    v_cogs_account_id
  );
  
  RAISE NOTICE '✅ تم إعداد بيانات الاختبار بنجاح!';
END $$;

-- =====================================================
-- 🧪 TEST 1: دورة البيع الكاملة (Sales Cycle)
-- =====================================================

RAISE NOTICE '';
RAISE NOTICE '🧪 ========================================';
RAISE NOTICE '🧪 TEST 1: دورة البيع الكاملة';
RAISE NOTICE '🧪 ========================================';

-- 1️⃣ التحقق من المخزون الأولي
DO $$
DECLARE
  v_product_id UUID;
  v_warehouse_id UUID;
  v_initial_qty NUMERIC;
BEGIN
  SELECT product_id, warehouse_id INTO v_product_id, v_warehouse_id FROM test_ids;

  SELECT quantity INTO v_initial_qty
  FROM inventory
  WHERE product_id = v_product_id AND warehouse_id = v_warehouse_id;

  RAISE NOTICE '📦 المخزون الأولي: % وحدة', COALESCE(v_initial_qty, 0);

  -- حفظ المخزون الأولي
  CREATE TEMP TABLE IF NOT EXISTS test_results (
    test_name TEXT,
    expected_value TEXT,
    actual_value TEXT,
    status TEXT
  );

  INSERT INTO test_results VALUES (
    'Initial Inventory',
    'N/A',
    COALESCE(v_initial_qty::TEXT, '0'),
    'INFO'
  );
END $$;

-- 2️⃣ إنشاء Sales Order
DO $$
DECLARE
  v_company_id UUID;
  v_branch_id UUID;
  v_customer_id UUID;
  v_product_id UUID;
  v_so_id UUID;
  v_user_id UUID;
BEGIN
  SELECT company_id, branch_id, customer_id, product_id
  INTO v_company_id, v_branch_id, v_customer_id, v_product_id
  FROM test_ids;

  -- الحصول على أول مستخدم
  SELECT id INTO v_user_id FROM auth.users LIMIT 1;

  -- إنشاء Sales Order
  INSERT INTO sales_orders (
    company_id,
    branch_id,
    customer_id,
    order_date,
    status,
    total_amount,
    created_by
  ) VALUES (
    v_company_id,
    v_branch_id,
    v_customer_id,
    CURRENT_DATE,
    'pending',
    1000.00,
    v_user_id
  ) RETURNING id INTO v_so_id;

  -- إضافة بند للـ SO
  INSERT INTO sales_order_items (
    sales_order_id,
    product_id,
    quantity,
    unit_price,
    total
  ) VALUES (
    v_so_id,
    v_product_id,
    10,
    100.00,
    1000.00
  );

  RAISE NOTICE '✅ تم إنشاء Sales Order: %', v_so_id;

  -- حفظ معرف الـ SO
  ALTER TABLE test_ids ADD COLUMN IF NOT EXISTS so_id UUID;
  UPDATE test_ids SET so_id = v_so_id;

  INSERT INTO test_results VALUES (
    'Sales Order Created',
    'Success',
    v_so_id::TEXT,
    'PASS'
  );
END $$;

-- 3️⃣ إنشاء Invoice (Draft)
DO $$
DECLARE
  v_company_id UUID;
  v_branch_id UUID;
  v_warehouse_id UUID;
  v_cost_center_id UUID;
  v_customer_id UUID;
  v_product_id UUID;
  v_so_id UUID;
  v_invoice_id UUID;
  v_user_id UUID;
  v_inventory_before NUMERIC;
  v_inventory_after NUMERIC;
  v_journal_count INTEGER;
BEGIN
  SELECT company_id, branch_id, warehouse_id, cost_center_id, customer_id, product_id, so_id
  INTO v_company_id, v_branch_id, v_warehouse_id, v_cost_center_id, v_customer_id, v_product_id, v_so_id
  FROM test_ids;

  SELECT id INTO v_user_id FROM auth.users LIMIT 1;

  -- المخزون قبل
  SELECT COALESCE(quantity, 0) INTO v_inventory_before
  FROM inventory
  WHERE product_id = v_product_id AND warehouse_id = v_warehouse_id;

  -- إنشاء Invoice (Draft)
  INSERT INTO invoices (
    company_id,
    branch_id,
    warehouse_id,
    cost_center_id,
    customer_id,
    sales_order_id,
    invoice_date,
    status,
    subtotal,
    tax_amount,
    total_amount,
    created_by
  ) VALUES (
    v_company_id,
    v_branch_id,
    v_warehouse_id,
    v_cost_center_id,
    v_customer_id,
    v_so_id,
    CURRENT_DATE,
    'draft',
    1000.00,
    0.00,
    1000.00,
    v_user_id
  ) RETURNING id INTO v_invoice_id;

  -- إضافة بند للفاتورة
  INSERT INTO invoice_items (
    invoice_id,
    product_id,
    quantity,
    unit_price,
    total
  ) VALUES (
    v_invoice_id,
    v_product_id,
    10,
    100.00,
    1000.00
  );

  -- المخزون بعد
  SELECT COALESCE(quantity, 0) INTO v_inventory_after
  FROM inventory
  WHERE product_id = v_product_id AND warehouse_id = v_warehouse_id;

  -- عدد القيود
  SELECT COUNT(*) INTO v_journal_count
  FROM journal_entries
  WHERE reference_type = 'invoice' AND reference_id = v_invoice_id;

  RAISE NOTICE '✅ تم إنشاء Invoice (Draft): %', v_invoice_id;
  RAISE NOTICE '📦 المخزون قبل: %, بعد: %', v_inventory_before, v_inventory_after;
  RAISE NOTICE '📒 عدد القيود: %', v_journal_count;

  -- حفظ معرف الفاتورة
  ALTER TABLE test_ids ADD COLUMN IF NOT EXISTS invoice_id UUID;
  UPDATE test_ids SET invoice_id = v_invoice_id;

  -- التحقق: لا تغيير في المخزون
  IF v_inventory_before = v_inventory_after THEN
    INSERT INTO test_results VALUES (
      'Invoice Draft - No Inventory Change',
      v_inventory_before::TEXT,
      v_inventory_after::TEXT,
      'PASS'
    );
  ELSE
    INSERT INTO test_results VALUES (
      'Invoice Draft - No Inventory Change',
      v_inventory_before::TEXT,
      v_inventory_after::TEXT,
      'FAIL'
    );
  END IF;

  -- التحقق: لا قيود محاسبية
  IF v_journal_count = 0 THEN
    INSERT INTO test_results VALUES (
      'Invoice Draft - No Journal Entries',
      '0',
      v_journal_count::TEXT,
      'PASS'
    );
  ELSE
    INSERT INTO test_results VALUES (
      'Invoice Draft - No Journal Entries',
      '0',
      v_journal_count::TEXT,
      'FAIL'
    );
  END IF;
END $$;

-- 4️⃣ تحويل Invoice من Draft إلى Sent
DO $$
DECLARE
  v_invoice_id UUID;
  v_product_id UUID;
  v_warehouse_id UUID;
  v_inventory_before NUMERIC;
  v_inventory_after NUMERIC;
  v_journal_count INTEGER;
  v_movement_count INTEGER;
BEGIN
  SELECT invoice_id, product_id, warehouse_id
  INTO v_invoice_id, v_product_id, v_warehouse_id
  FROM test_ids;

  -- المخزون قبل
  SELECT COALESCE(quantity, 0) INTO v_inventory_before
  FROM inventory
  WHERE product_id = v_product_id AND warehouse_id = v_warehouse_id;

  -- تحويل الحالة إلى Sent
  UPDATE invoices SET status = 'sent' WHERE id = v_invoice_id;

  -- المخزون بعد
  SELECT COALESCE(quantity, 0) INTO v_inventory_after
  FROM inventory
  WHERE product_id = v_product_id AND warehouse_id = v_warehouse_id;

  -- عدد القيود
  SELECT COUNT(*) INTO v_journal_count
  FROM journal_entries
  WHERE reference_type = 'invoice' AND reference_id = v_invoice_id;

  -- عدد حركات المخزون
  SELECT COUNT(*) INTO v_movement_count
  FROM inventory_movements
  WHERE reference_type = 'invoice' AND reference_id = v_invoice_id AND movement_type = 'sale';

  RAISE NOTICE '✅ تم تحويل Invoice إلى Sent';
  RAISE NOTICE '📦 المخزون قبل: %, بعد: %', v_inventory_before, v_inventory_after;
  RAISE NOTICE '📒 عدد القيود: %', v_journal_count;
  RAISE NOTICE '📦 عدد حركات المخزون: %', v_movement_count;

  -- التحقق: خصم المخزون
  IF v_inventory_after = v_inventory_before - 10 THEN
    INSERT INTO test_results VALUES (
      'Invoice Sent - Inventory Decreased',
      (v_inventory_before - 10)::TEXT,
      v_inventory_after::TEXT,
      'PASS'
    );
  ELSE
    INSERT INTO test_results VALUES (
      'Invoice Sent - Inventory Decreased',
      (v_inventory_before - 10)::TEXT,
      v_inventory_after::TEXT,
      'FAIL'
    );
  END IF;

  -- التحقق: لا قيود محاسبية (Cash Basis)
  IF v_journal_count = 0 THEN
    INSERT INTO test_results VALUES (
      'Invoice Sent - No Journal Entries (Cash Basis)',
      '0',
      v_journal_count::TEXT,
      'PASS'
    );
  ELSE
    INSERT INTO test_results VALUES (
      'Invoice Sent - No Journal Entries (Cash Basis)',
      '0',
      v_journal_count::TEXT,
      'FAIL'
    );
  END IF;

  -- التحقق: حركة مخزون واحدة (sale)
  IF v_movement_count = 1 THEN
    INSERT INTO test_results VALUES (
      'Invoice Sent - One Inventory Movement',
      '1',
      v_movement_count::TEXT,
      'PASS'
    );
  ELSE
    INSERT INTO test_results VALUES (
      'Invoice Sent - One Inventory Movement',
      '1',
      v_movement_count::TEXT,
      'FAIL'
    );
  END IF;
END $$;

-- 5️⃣ إنشاء دفعة جزئية (Partial Payment)
DO $$
DECLARE
  v_company_id UUID;
  v_branch_id UUID;
  v_cost_center_id UUID;
  v_invoice_id UUID;
  v_customer_id UUID;
  v_cash_account_id UUID;
  v_ar_account_id UUID;
  v_revenue_account_id UUID;
  v_payment_id UUID;
  v_user_id UUID;
  v_journal_count_before INTEGER;
  v_journal_count_after INTEGER;
  v_ar_entry_count INTEGER;
  v_payment_entry_count INTEGER;
BEGIN
  SELECT company_id, branch_id, cost_center_id, invoice_id, customer_id,
         cash_account_id, ar_account_id, revenue_account_id
  INTO v_company_id, v_branch_id, v_cost_center_id, v_invoice_id, v_customer_id,
       v_cash_account_id, v_ar_account_id, v_revenue_account_id
  FROM test_ids;

  SELECT id INTO v_user_id FROM auth.users LIMIT 1;

  -- عدد القيود قبل
  SELECT COUNT(*) INTO v_journal_count_before
  FROM journal_entries
  WHERE reference_type = 'invoice' AND reference_id = v_invoice_id;

  -- إنشاء دفعة جزئية (500 من أصل 1000)
  INSERT INTO payments (
    company_id,
    branch_id,
    cost_center_id,
    payment_date,
    payment_type,
    payment_method,
    amount,
    reference_type,
    reference_id,
    account_id,
    created_by
  ) VALUES (
    v_company_id,
    v_branch_id,
    v_cost_center_id,
    CURRENT_DATE,
    'receipt',
    'cash',
    500.00,
    'invoice',
    v_invoice_id,
    v_cash_account_id,
    v_user_id
  ) RETURNING id INTO v_payment_id;

  -- عدد القيود بعد
  SELECT COUNT(*) INTO v_journal_count_after
  FROM journal_entries
  WHERE reference_type = 'invoice' AND reference_id = v_invoice_id;

  -- عدد قيود AR/Revenue (يجب أن يكون 1 فقط - عند أول دفعة)
  SELECT COUNT(*) INTO v_ar_entry_count
  FROM journal_entries
  WHERE reference_type = 'invoice'
    AND reference_id = v_invoice_id
    AND entry_type = 'ar_revenue';

  -- عدد قيود الدفع
  SELECT COUNT(*) INTO v_payment_entry_count
  FROM journal_entries
  WHERE reference_type = 'payment'
    AND reference_id = v_payment_id;

  RAISE NOTICE '✅ تم إنشاء دفعة جزئية: % (500 من 1000)', v_payment_id;
  RAISE NOTICE '📒 عدد القيود قبل: %, بعد: %', v_journal_count_before, v_journal_count_after;
  RAISE NOTICE '📒 عدد قيود AR/Revenue: %', v_ar_entry_count;
  RAISE NOTICE '📒 عدد قيود الدفع: %', v_payment_entry_count;

  -- حفظ معرف الدفعة
  ALTER TABLE test_ids ADD COLUMN IF NOT EXISTS payment1_id UUID;
  UPDATE test_ids SET payment1_id = v_payment_id;

  -- التحقق: تم إنشاء قيد AR/Revenue (مرة واحدة فقط)
  IF v_ar_entry_count = 1 THEN
    INSERT INTO test_results VALUES (
      'First Payment - AR/Revenue Entry Created',
      '1',
      v_ar_entry_count::TEXT,
      'PASS'
    );
  ELSE
    INSERT INTO test_results VALUES (
      'First Payment - AR/Revenue Entry Created',
      '1',
      v_ar_entry_count::TEXT,
      'FAIL'
    );
  END IF;

  -- التحقق: تم إنشاء قيد الدفع
  IF v_payment_entry_count = 1 THEN
    INSERT INTO test_results VALUES (
      'First Payment - Payment Entry Created',
      '1',
      v_payment_entry_count::TEXT,
      'PASS'
    );
  ELSE
    INSERT INTO test_results VALUES (
      'First Payment - Payment Entry Created',
      '1',
      v_payment_entry_count::TEXT,
      'FAIL'
    );
  END IF;
END $$;

-- 6️⃣ إنشاء دفعة ثانية (تكملة السداد)
DO $$
DECLARE
  v_company_id UUID;
  v_branch_id UUID;
  v_cost_center_id UUID;
  v_invoice_id UUID;
  v_cash_account_id UUID;
  v_payment_id UUID;
  v_user_id UUID;
  v_ar_entry_count INTEGER;
  v_payment_entry_count INTEGER;
BEGIN
  SELECT company_id, branch_id, cost_center_id, invoice_id, cash_account_id
  INTO v_company_id, v_branch_id, v_cost_center_id, v_invoice_id, v_cash_account_id
  FROM test_ids;

  SELECT id INTO v_user_id FROM auth.users LIMIT 1;

  -- إنشاء دفعة ثانية (500 - تكملة السداد)
  INSERT INTO payments (
    company_id,
    branch_id,
    cost_center_id,
    payment_date,
    payment_type,
    payment_method,
    amount,
    reference_type,
    reference_id,
    account_id,
    created_by
  ) VALUES (
    v_company_id,
    v_branch_id,
    v_cost_center_id,
    CURRENT_DATE,
    'receipt',
    'cash',
    500.00,
    'invoice',
    v_invoice_id,
    v_cash_account_id,
    v_user_id
  ) RETURNING id INTO v_payment_id;

  -- عدد قيود AR/Revenue (يجب أن يظل 1 - لا يتكرر)
  SELECT COUNT(*) INTO v_ar_entry_count
  FROM journal_entries
  WHERE reference_type = 'invoice'
    AND reference_id = v_invoice_id
    AND entry_type = 'ar_revenue';

  -- عدد قيود الدفع الثانية
  SELECT COUNT(*) INTO v_payment_entry_count
  FROM journal_entries
  WHERE reference_type = 'payment'
    AND reference_id = v_payment_id;

  RAISE NOTICE '✅ تم إنشاء دفعة ثانية: % (500 - تكملة)', v_payment_id;
  RAISE NOTICE '📒 عدد قيود AR/Revenue: % (يجب أن يظل 1)', v_ar_entry_count;
  RAISE NOTICE '📒 عدد قيود الدفع الثانية: %', v_payment_entry_count;

  -- حفظ معرف الدفعة
  ALTER TABLE test_ids ADD COLUMN IF NOT EXISTS payment2_id UUID;
  UPDATE test_ids SET payment2_id = v_payment_id;

  -- التحقق: لم يتم إنشاء قيد AR/Revenue جديد
  IF v_ar_entry_count = 1 THEN
    INSERT INTO test_results VALUES (
      'Second Payment - No New AR/Revenue Entry',
      '1',
      v_ar_entry_count::TEXT,
      'PASS'
    );
  ELSE
    INSERT INTO test_results VALUES (
      'Second Payment - No New AR/Revenue Entry',
      '1',
      v_ar_entry_count::TEXT,
      'FAIL'
    );
  END IF;

  -- التحقق: تم إنشاء قيد الدفع الثانية
  IF v_payment_entry_count = 1 THEN
    INSERT INTO test_results VALUES (
      'Second Payment - Payment Entry Created',
      '1',
      v_payment_entry_count::TEXT,
      'PASS'
    );
  ELSE
    INSERT INTO test_results VALUES (
      'Second Payment - Payment Entry Created',
      '1',
      v_payment_entry_count::TEXT,
      'FAIL'
    );
  END IF;
END $$;

-- 7️⃣ التحقق من توازن القيود
DO $$
DECLARE
  v_invoice_id UUID;
  v_total_debit NUMERIC;
  v_total_credit NUMERIC;
  v_is_balanced BOOLEAN;
BEGIN
  SELECT invoice_id INTO v_invoice_id FROM test_ids;

  -- حساب إجمالي المدين
  SELECT COALESCE(SUM(debit), 0) INTO v_total_debit
  FROM journal_entry_lines jel
  JOIN journal_entries je ON jel.journal_entry_id = je.id
  WHERE je.reference_type IN ('invoice', 'payment')
    AND (je.reference_id = v_invoice_id
         OR je.reference_id IN (SELECT payment1_id FROM test_ids UNION SELECT payment2_id FROM test_ids));

  -- حساب إجمالي الدائن
  SELECT COALESCE(SUM(credit), 0) INTO v_total_credit
  FROM journal_entry_lines jel
  JOIN journal_entries je ON jel.journal_entry_id = je.id
  WHERE je.reference_type IN ('invoice', 'payment')
    AND (je.reference_id = v_invoice_id
         OR je.reference_id IN (SELECT payment1_id FROM test_ids UNION SELECT payment2_id FROM test_ids));

  v_is_balanced := (v_total_debit = v_total_credit);

  RAISE NOTICE '📒 إجمالي المدين: %', v_total_debit;
  RAISE NOTICE '📒 إجمالي الدائن: %', v_total_credit;
  RAISE NOTICE '📒 متوازن: %', v_is_balanced;

  -- التحقق: القيود متوازنة
  IF v_is_balanced THEN
    INSERT INTO test_results VALUES (
      'Journal Entries Balanced',
      v_total_debit::TEXT,
      v_total_credit::TEXT,
      'PASS'
    );
  ELSE
    INSERT INTO test_results VALUES (
      'Journal Entries Balanced',
      v_total_debit::TEXT,
      v_total_credit::TEXT,
      'FAIL'
    );
  END IF;
END $$;

-- =====================================================
-- 🧪 TEST 2: اختبار المرتجعات (Sales Returns)
-- =====================================================

RAISE NOTICE '';
RAISE NOTICE '🧪 ========================================';
RAISE NOTICE '🧪 TEST 2: اختبار المرتجعات';
RAISE NOTICE '🧪 ========================================';

-- 8️⃣ مرتجع جزئي على فاتورة مدفوعة
DO $$
DECLARE
  v_invoice_id UUID;
  v_product_id UUID;
  v_warehouse_id UUID;
  v_inventory_before NUMERIC;
  v_inventory_after NUMERIC;
  v_return_movement_count INTEGER;
  v_return_entry_count INTEGER;
  v_customer_credit NUMERIC;
BEGIN
  SELECT invoice_id, product_id, warehouse_id
  INTO v_invoice_id, v_product_id, v_warehouse_id
  FROM test_ids;

  -- المخزون قبل
  SELECT COALESCE(quantity, 0) INTO v_inventory_before
  FROM inventory
  WHERE product_id = v_product_id AND warehouse_id = v_warehouse_id;

  -- إنشاء مرتجع جزئي (3 وحدات من 10)
  INSERT INTO invoice_items (
    invoice_id,
    product_id,
    quantity,
    unit_price,
    total,
    is_return
  ) VALUES (
    v_invoice_id,
    v_product_id,
    -3,
    100.00,
    -300.00,
    true
  );

  -- تحديث الفاتورة
  UPDATE invoices
  SET subtotal = 700.00, total_amount = 700.00
  WHERE id = v_invoice_id;

  -- المخزون بعد
  SELECT COALESCE(quantity, 0) INTO v_inventory_after
  FROM inventory
  WHERE product_id = v_product_id AND warehouse_id = v_warehouse_id;

  -- عدد حركات المرتجع
  SELECT COUNT(*) INTO v_return_movement_count
  FROM inventory_movements
  WHERE reference_type = 'invoice'
    AND reference_id = v_invoice_id
    AND movement_type = 'sale_return';

  -- عدد قيود المرتجع
  SELECT COUNT(*) INTO v_return_entry_count
  FROM journal_entries
  WHERE reference_type = 'invoice'
    AND reference_id = v_invoice_id
    AND entry_type = 'sales_return';

  -- Customer Credit
  SELECT COALESCE(credit_balance, 0) INTO v_customer_credit
  FROM customers
  WHERE id = (SELECT customer_id FROM test_ids);

  RAISE NOTICE '✅ تم إنشاء مرتجع جزئي (3 وحدات)';
  RAISE NOTICE '📦 المخزون قبل: %, بعد: %', v_inventory_before, v_inventory_after;
  RAISE NOTICE '📦 عدد حركات المرتجع: %', v_return_movement_count;
  RAISE NOTICE '📒 عدد قيود المرتجع: %', v_return_entry_count;
  RAISE NOTICE '💰 Customer Credit: %', v_customer_credit;

  -- التحقق: استرجاع المخزون
  IF v_inventory_after = v_inventory_before + 3 THEN
    INSERT INTO test_results VALUES (
      'Partial Return - Inventory Restored',
      (v_inventory_before + 3)::TEXT,
      v_inventory_after::TEXT,
      'PASS'
    );
  ELSE
    INSERT INTO test_results VALUES (
      'Partial Return - Inventory Restored',
      (v_inventory_before + 3)::TEXT,
      v_inventory_after::TEXT,
      'FAIL'
    );
  END IF;

  -- التحقق: تم إنشاء قيد عكسي (لأن الفاتورة مدفوعة)
  IF v_return_entry_count = 1 THEN
    INSERT INTO test_results VALUES (
      'Partial Return - Reversal Entry Created',
      '1',
      v_return_entry_count::TEXT,
      'PASS'
    );
  ELSE
    INSERT INTO test_results VALUES (
      'Partial Return - Reversal Entry Created',
      '1',
      v_return_entry_count::TEXT,
      'FAIL'
    );
  END IF;

  -- التحقق: Customer Credit (المدفوع 1000 > الصافي 700)
  IF v_customer_credit = 300.00 THEN
    INSERT INTO test_results VALUES (
      'Partial Return - Customer Credit',
      '300.00',
      v_customer_credit::TEXT,
      'PASS'
    );
  ELSE
    INSERT INTO test_results VALUES (
      'Partial Return - Customer Credit',
      '300.00',
      v_customer_credit::TEXT,
      'FAIL'
    );
  END IF;
END $$;

-- =====================================================
-- 📊 عرض النتائج النهائية
-- =====================================================

RAISE NOTICE '';
RAISE NOTICE '📊 ========================================';
RAISE NOTICE '📊 نتائج الاختبار النهائية';
RAISE NOTICE '📊 ========================================';

DO $$
DECLARE
  v_total_tests INTEGER;
  v_passed_tests INTEGER;
  v_failed_tests INTEGER;
  v_pass_rate NUMERIC;
  rec RECORD;
BEGIN
  -- عدد الاختبارات
  SELECT COUNT(*) INTO v_total_tests FROM test_results WHERE status IN ('PASS', 'FAIL');
  SELECT COUNT(*) INTO v_passed_tests FROM test_results WHERE status = 'PASS';
  SELECT COUNT(*) INTO v_failed_tests FROM test_results WHERE status = 'FAIL';

  v_pass_rate := CASE WHEN v_total_tests > 0 THEN (v_passed_tests::NUMERIC / v_total_tests * 100) ELSE 0 END;

  RAISE NOTICE '';
  RAISE NOTICE '📊 إجمالي الاختبارات: %', v_total_tests;
  RAISE NOTICE '✅ نجح: %', v_passed_tests;
  RAISE NOTICE '❌ فشل: %', v_failed_tests;
  RAISE NOTICE '📈 نسبة النجاح: %%', ROUND(v_pass_rate, 2);
  RAISE NOTICE '';

  -- عرض تفاصيل الاختبارات
  RAISE NOTICE '📋 تفاصيل الاختبارات:';
  RAISE NOTICE '─────────────────────────────────────────────────────────────';

  FOR rec IN
    SELECT test_name, expected_value, actual_value, status
    FROM test_results
    ORDER BY
      CASE status
        WHEN 'FAIL' THEN 1
        WHEN 'PASS' THEN 2
        ELSE 3
      END,
      test_name
  LOOP
    IF rec.status = 'PASS' THEN
      RAISE NOTICE '✅ % | Expected: % | Actual: %', rec.test_name, rec.expected_value, rec.actual_value;
    ELSIF rec.status = 'FAIL' THEN
      RAISE NOTICE '❌ % | Expected: % | Actual: %', rec.test_name, rec.expected_value, rec.actual_value;
    ELSE
      RAISE NOTICE 'ℹ️  % | Value: %', rec.test_name, rec.actual_value;
    END IF;
  END LOOP;

  RAISE NOTICE '─────────────────────────────────────────────────────────────';
  RAISE NOTICE '';

  -- الخلاصة
  IF v_failed_tests = 0 THEN
    RAISE NOTICE '🎉 جميع الاختبارات نجحت! النظام متوافق 100%% مع Cash Basis';
  ELSE
    RAISE NOTICE '⚠️  يوجد % اختبار فشل - يحتاج مراجعة!', v_failed_tests;
  END IF;
END $$;

-- =====================================================
-- 🧹 تنظيف (اختياري)
-- =====================================================

-- RAISE NOTICE '';
-- RAISE NOTICE '🧹 تنظيف بيانات الاختبار...';

-- DO $$
-- DECLARE
--   v_invoice_id UUID;
--   v_so_id UUID;
--   v_payment1_id UUID;
--   v_payment2_id UUID;
-- BEGIN
--   SELECT invoice_id, so_id, payment1_id, payment2_id
--   INTO v_invoice_id, v_so_id, v_payment1_id, v_payment2_id
--   FROM test_ids;

--   -- حذف القيود
--   DELETE FROM journal_entry_lines WHERE journal_entry_id IN (
--     SELECT id FROM journal_entries
--     WHERE (reference_type = 'invoice' AND reference_id = v_invoice_id)
--        OR (reference_type = 'payment' AND reference_id IN (v_payment1_id, v_payment2_id))
--   );

--   DELETE FROM journal_entries
--   WHERE (reference_type = 'invoice' AND reference_id = v_invoice_id)
--      OR (reference_type = 'payment' AND reference_id IN (v_payment1_id, v_payment2_id));

--   -- حذف حركات المخزون
--   DELETE FROM inventory_movements
--   WHERE reference_type = 'invoice' AND reference_id = v_invoice_id;

--   -- حذف الدفعات
--   DELETE FROM payments WHERE id IN (v_payment1_id, v_payment2_id);

--   -- حذف الفاتورة
--   DELETE FROM invoice_items WHERE invoice_id = v_invoice_id;
--   DELETE FROM invoices WHERE id = v_invoice_id;

--   -- حذف أمر البيع
--   DELETE FROM sales_order_items WHERE sales_order_id = v_so_id;
--   DELETE FROM sales_orders WHERE id = v_so_id;

--   RAISE NOTICE '✅ تم تنظيف بيانات الاختبار';
-- END $$;

-- DROP TABLE IF EXISTS test_ids;
-- DROP TABLE IF EXISTS test_results;

RAISE NOTICE '';
RAISE NOTICE '✅ انتهى الاختبار الشامل!';
RAISE NOTICE '';

