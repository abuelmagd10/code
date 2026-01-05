-- ============================================
-- ⚠️ DISABLED: Cash Basis Only
-- ============================================
-- هذا الملف معطل - النظام يستخدم Cash Basis فقط
-- DO NOT USE - System uses Cash Basis only
-- ============================================

-- =============================================
-- تطبيق محرك المحاسبة على أساس الاستحقاق لشركة foodcana
-- Apply Accrual Accounting Engine for foodcana Company
-- =============================================
-- Company: foodcana
-- Company ID: 3a663f6b-0689-4952-93c1-6d958c737089
-- =============================================

-- 1. تطبيق محرك المحاسبة على أساس الاستحقاق
\i ACCRUAL_ACCOUNTING_ENGINE.sql

-- 2. إصلاح البيانات الحالية لشركة foodcana
SELECT fix_existing_data_with_opening_balances('3a663f6b-0689-4952-93c1-6d958c737089');

-- 3. التحقق من صحة التطبيق
SELECT 
  test_name as "اختبار",
  status as "النتيجة", 
  details as "التفاصيل"
FROM validate_accrual_accounting('3a663f6b-0689-4952-93c1-6d958c737089');

-- 4. فحص الأرصدة الحالية بعد التطبيق
WITH account_balances AS (
  SELECT 
    coa.account_name,
    coa.sub_type,
    coa.account_type,
    COALESCE(SUM(
      CASE 
        WHEN coa.account_type IN ('asset', 'expense') 
        THEN jel.debit_amount - jel.credit_amount
        ELSE jel.credit_amount - jel.debit_amount
      END
    ), 0) + COALESCE(coa.opening_balance, 0) as balance
  FROM chart_of_accounts coa
  LEFT JOIN journal_entry_lines jel ON jel.account_id = coa.id
  LEFT JOIN journal_entries je ON jel.journal_entry_id = je.id
  WHERE coa.company_id = '3a663f6b-0689-4952-93c1-6d958c737089'
    AND coa.is_active = true
    AND (je.company_id = '3a663f6b-0689-4952-93c1-6d958c737089' OR je.id IS NULL)
  GROUP BY coa.id, coa.account_name, coa.sub_type, coa.account_type, coa.opening_balance
  HAVING ABS(COALESCE(SUM(
    CASE 
      WHEN coa.account_type IN ('asset', 'expense') 
      THEN jel.debit_amount - jel.credit_amount
      ELSE jel.credit_amount - jel.debit_amount
    END
  ), 0) + COALESCE(coa.opening_balance, 0)) > 0.01
)
SELECT 
  account_name as "اسم الحساب",
  sub_type as "النوع الفرعي",
  account_type as "نوع الحساب",
  balance as "الرصيد"
FROM account_balances
ORDER BY account_type, account_name;

-- 5. فحص قائمة الدخل على أساس الاستحقاق
WITH income_statement AS (
  -- الإيرادات (من الفواتير المرسلة)
  SELECT 
    'الإيرادات' as category,
    'إيرادات المبيعات' as item,
    COALESCE(SUM(jel.credit_amount), 0) as amount
  FROM journal_entry_lines jel
  JOIN journal_entries je ON jel.journal_entry_id = je.id
  JOIN chart_of_accounts coa ON jel.account_id = coa.id
  WHERE je.company_id = '3a663f6b-0689-4952-93c1-6d958c737089'
    AND je.reference_type = 'invoice'
    AND coa.sub_type = 'sales_revenue'
  
  UNION ALL
  
  -- تكلفة البضاعة المباعة (من التسليمات)
  SELECT 
    'تكلفة البضاعة المباعة' as category,
    'COGS' as item,
    COALESCE(SUM(jel.debit_amount), 0) as amount
  FROM journal_entry_lines jel
  JOIN journal_entries je ON jel.journal_entry_id = je.id
  JOIN chart_of_accounts coa ON jel.account_id = coa.id
  WHERE je.company_id = '3a663f6b-0689-4952-93c1-6d958c737089'
    AND je.reference_type = 'invoice_cogs'
    AND coa.sub_type IN ('cogs', 'cost_of_goods_sold')
  
  UNION ALL
  
  -- المصروفات التشغيلية
  SELECT 
    'المصروفات التشغيلية' as category,
    'مصروفات أخرى' as item,
    COALESCE(SUM(jel.debit_amount), 0) as amount
  FROM journal_entry_lines jel
  JOIN journal_entries je ON jel.journal_entry_id = je.id
  JOIN chart_of_accounts coa ON jel.account_id = coa.id
  WHERE je.company_id = '3a663f6b-0689-4952-93c1-6d958c737089'
    AND coa.account_type = 'expense'
    AND coa.sub_type NOT IN ('cogs', 'cost_of_goods_sold')
)
SELECT 
  category as "البند",
  item as "التفصيل",
  amount as "المبلغ"
FROM income_statement
WHERE amount > 0
ORDER BY 
  CASE category 
    WHEN 'الإيرادات' THEN 1
    WHEN 'تكلفة البضاعة المباعة' THEN 2
    WHEN 'المصروفات التشغيلية' THEN 3
  END;

-- 6. حساب النتائج النهائية
WITH financial_summary AS (
  SELECT 
    -- الإيرادات
    (SELECT COALESCE(SUM(jel.credit_amount), 0)
     FROM journal_entry_lines jel
     JOIN journal_entries je ON jel.journal_entry_id = je.id
     JOIN chart_of_accounts coa ON jel.account_id = coa.id
     WHERE je.company_id = '3a663f6b-0689-4952-93c1-6d958c737089'
       AND je.reference_type = 'invoice'
       AND coa.sub_type = 'sales_revenue') as revenue,
    
    -- تكلفة البضاعة المباعة
    (SELECT COALESCE(SUM(jel.debit_amount), 0)
     FROM journal_entry_lines jel
     JOIN journal_entries je ON jel.journal_entry_id = je.id
     JOIN chart_of_accounts coa ON jel.account_id = coa.id
     WHERE je.company_id = '3a663f6b-0689-4952-93c1-6d958c737089'
       AND je.reference_type = 'invoice_cogs'
       AND coa.sub_type IN ('cogs', 'cost_of_goods_sold')) as cogs,
    
    -- المصروفات التشغيلية
    (SELECT COALESCE(SUM(jel.debit_amount), 0)
     FROM journal_entry_lines jel
     JOIN journal_entries je ON jel.journal_entry_id = je.id
     JOIN chart_of_accounts coa ON jel.account_id = coa.id
     WHERE je.company_id = '3a663f6b-0689-4952-93c1-6d958c737089'
       AND coa.account_type = 'expense'
       AND coa.sub_type NOT IN ('cogs', 'cost_of_goods_sold')) as operating_expenses
)
SELECT 
  '🟪 الإيرادات' as "البند",
  revenue as "المبلغ",
  '💡 مسجلة عند إصدار الفاتورة (أساس الاستحقاق)' as "ملاحظة"
FROM financial_summary
WHERE revenue > 0

UNION ALL

SELECT 
  '🟧 تكلفة البضاعة المباعة',
  cogs,
  '💡 مسجلة عند التسليم (أساس الاستحقاق)'
FROM financial_summary
WHERE cogs > 0

UNION ALL

SELECT 
  '🟩 مجمل الربح',
  revenue - cogs,
  '💡 الإيرادات - تكلفة البضاعة المباعة'
FROM financial_summary

UNION ALL

SELECT 
  '🟨 المصروفات التشغيلية',
  operating_expenses,
  '💡 مصروفات غير مرتبطة بالمبيعات'
FROM financial_summary
WHERE operating_expenses > 0

UNION ALL

SELECT 
  '🎯 صافي الربح',
  (revenue - cogs) - operating_expenses,
  CASE 
    WHEN (revenue - cogs) - operating_expenses > 0 THEN '✅ ربح'
    WHEN (revenue - cogs) - operating_expenses < 0 THEN '❌ خسارة'
    ELSE '⚖️ تعادل'
  END
FROM financial_summary;

-- 7. التحقق من معايير النجاح النهائية
DO $$
DECLARE
  v_company_id UUID := '3a663f6b-0689-4952-93c1-6d958c737089';
  v_revenue NUMERIC;
  v_cogs NUMERIC;
  v_ar_balance NUMERIC;
  v_inventory_balance NUMERIC;
  v_total_debits NUMERIC;
  v_total_credits NUMERIC;
  v_success_count INTEGER := 0;
BEGIN
  RAISE NOTICE '======================================';
  RAISE NOTICE 'معايير النجاح النهائي - Zoho Books Compliance';
  RAISE NOTICE '======================================';
  
  -- معيار 1: الربح يظهر قبل التحصيل
  SELECT COALESCE(SUM(jel.credit_amount), 0) INTO v_revenue
  FROM journal_entry_lines jel
  JOIN journal_entries je ON jel.journal_entry_id = je.id
  JOIN chart_of_accounts coa ON jel.account_id = coa.id
  WHERE je.company_id = v_company_id
    AND je.reference_type = 'invoice'
    AND coa.sub_type = 'sales_revenue';
  
  IF v_revenue > 0 THEN
    RAISE NOTICE '✅ الربح يظهر قبل التحصيل: %', v_revenue;
    v_success_count := v_success_count + 1;
  ELSE
    RAISE NOTICE '❌ الربح لا يظهر قبل التحصيل';
  END IF;
  
  -- معيار 2: المخزون له قيمة محاسبية
  SELECT COALESCE(SUM(jel.debit_amount - jel.credit_amount), 0) INTO v_inventory_balance
  FROM journal_entry_lines jel
  JOIN journal_entries je ON jel.journal_entry_id = je.id
  JOIN chart_of_accounts coa ON jel.account_id = coa.id
  WHERE je.company_id = v_company_id
    AND coa.sub_type = 'inventory';
  
  IF v_inventory_balance > 0 THEN
    RAISE NOTICE '✅ المخزون له قيمة محاسبية: %', v_inventory_balance;
    v_success_count := v_success_count + 1;
  ELSE
    RAISE NOTICE '❌ المخزون ليس له قيمة محاسبية';
  END IF;
  
  -- معيار 3: COGS مسجل عند البيع
  SELECT COALESCE(SUM(jel.debit_amount), 0) INTO v_cogs
  FROM journal_entry_lines jel
  JOIN journal_entries je ON jel.journal_entry_id = je.id
  JOIN chart_of_accounts coa ON jel.account_id = coa.id
  WHERE je.company_id = v_company_id
    AND je.reference_type = 'invoice_cogs'
    AND coa.sub_type IN ('cogs', 'cost_of_goods_sold');
  
  IF v_cogs > 0 THEN
    RAISE NOTICE '✅ COGS مسجل عند البيع: %', v_cogs;
    v_success_count := v_success_count + 1;
  ELSE
    RAISE NOTICE '❌ COGS غير مسجل عند البيع';
  END IF;
  
  -- معيار 4: Trial Balance دائماً متزن
  SELECT 
    COALESCE(SUM(jel.debit_amount), 0),
    COALESCE(SUM(jel.credit_amount), 0)
  INTO v_total_debits, v_total_credits
  FROM journal_entry_lines jel
  JOIN journal_entries je ON jel.journal_entry_id = je.id
  WHERE je.company_id = v_company_id;
  
  IF ABS(v_total_debits - v_total_credits) < 0.01 THEN
    RAISE NOTICE '✅ Trial Balance متزن: مدين=% دائن=%', v_total_debits, v_total_credits;
    v_success_count := v_success_count + 1;
  ELSE
    RAISE NOTICE '❌ Trial Balance غير متزن: مدين=% دائن=%', v_total_debits, v_total_credits;
  END IF;
  
  -- معيار 5: لا علاقة مباشرة بين Cash والربح
  SELECT COALESCE(SUM(jel.debit_amount - jel.credit_amount), 0) INTO v_ar_balance
  FROM journal_entry_lines jel
  JOIN journal_entries je ON jel.journal_entry_id = je.id
  JOIN chart_of_accounts coa ON jel.account_id = coa.id
  WHERE je.company_id = v_company_id
    AND coa.sub_type = 'accounts_receivable';
  
  IF v_ar_balance > 0 AND v_revenue > 0 THEN
    RAISE NOTICE '✅ لا علاقة مباشرة بين Cash والربح: AR=% Revenue=%', v_ar_balance, v_revenue;
    v_success_count := v_success_count + 1;
  ELSE
    RAISE NOTICE '❌ علاقة مباشرة بين Cash والربح';
  END IF;
  
  RAISE NOTICE '======================================';
  IF v_success_count = 5 THEN
    RAISE NOTICE '🎉 نجح التطبيق! مطابق 100%% لـ Zoho Books';
    RAISE NOTICE '✅ جميع معايير النجاح محققة (%/5)', v_success_count;
  ELSE
    RAISE NOTICE '⚠️  التطبيق غير مكتمل (%/5)', v_success_count;
    RAISE NOTICE 'يرجى مراجعة المعايير الفاشلة أعلاه';
  END IF;
  RAISE NOTICE '======================================';
END $$;