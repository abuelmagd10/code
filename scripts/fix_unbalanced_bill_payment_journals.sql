-- =====================================================
-- إصلاح القيود المحاسبية غير المتوازنة للمدفوعات وإشعارات الدائن
-- =====================================================
-- المشكلة: قيود bill_payment و vendor_credit تحتوي على Debit فقط بدون Credit
-- الحل: إضافة سطر Credit لحساب الصندوق/البنك أو حذف القيد وإعادة إنشائه

-- 1. فحص القيود غير المتوازنة
WITH UnbalancedEntries AS (
  SELECT 
    je.id AS entry_id,
    je.reference_type,
    je.reference_id,
    je.description,
    je.entry_date,
    je.company_id,
    SUM(jel.debit_amount) AS total_debit,
    SUM(jel.credit_amount) AS total_credit,
    ABS(SUM(jel.debit_amount) - SUM(jel.credit_amount)) AS imbalance
  FROM journal_entries je
  JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
  WHERE je.reference_type IN ('bill_payment', 'vendor_credit')
    AND je.deleted_at IS NULL
  GROUP BY je.id, je.reference_type, je.reference_id, je.description, je.entry_date, je.company_id
  HAVING ABS(SUM(jel.debit_amount) - SUM(jel.credit_amount)) > 0.01
)
SELECT 
  'Unbalanced Entries' AS check_type,
  COUNT(*) AS unbalanced_count,
  SUM(imbalance) AS total_imbalance
FROM UnbalancedEntries;

-- 2. عرض تفاصيل القيود غير المتوازنة
WITH UnbalancedEntries AS (
  SELECT 
    je.id AS entry_id,
    je.reference_type,
    je.reference_id,
    je.description,
    je.entry_date,
    je.company_id,
    SUM(jel.debit_amount) AS total_debit,
    SUM(jel.credit_amount) AS total_credit,
    ABS(SUM(jel.debit_amount) - SUM(jel.credit_amount)) AS imbalance
  FROM journal_entries je
  JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
  WHERE je.reference_type IN ('bill_payment', 'vendor_credit')
    AND je.deleted_at IS NULL
  GROUP BY je.id, je.reference_type, je.reference_id, je.description, je.entry_date, je.company_id
  HAVING ABS(SUM(jel.debit_amount) - SUM(jel.credit_amount)) > 0.01
)
SELECT 
  'Entry Details' AS check_type,
  ue.entry_id,
  ue.reference_type,
  ue.description,
  ue.entry_date,
  ue.total_debit,
  ue.total_credit,
  ue.imbalance,
  -- جلب حساب AP المستخدم
  (SELECT account_id FROM journal_entry_lines WHERE journal_entry_id = ue.entry_id AND debit_amount > 0 LIMIT 1) AS ap_account_id,
  -- جلب حساب الصندوق/البنك (إن وجد)
  (SELECT account_id FROM journal_entry_lines WHERE journal_entry_id = ue.entry_id AND credit_amount > 0 LIMIT 1) AS cash_account_id
FROM UnbalancedEntries ue
ORDER BY ue.imbalance DESC;

-- 3. إصلاح القيود غير المتوازنة (إضافة سطر Credit)
-- ⚠️ تحذير: يجب التأكد من حساب الصندوق/البنك الصحيح قبل التنفيذ
DO $$
DECLARE
  v_entry RECORD;
  v_cash_account_id UUID;
  v_ap_account_id UUID;
  v_amount NUMERIC;
BEGIN
  FOR v_entry IN
    SELECT 
      je.id AS entry_id,
      je.company_id,
      SUM(jel.debit_amount) AS total_debit,
      SUM(jel.credit_amount) AS total_credit
    FROM journal_entries je
    JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
    WHERE je.reference_type IN ('bill_payment', 'vendor_credit')
      AND je.deleted_at IS NULL
    GROUP BY je.id, je.company_id
    HAVING ABS(SUM(jel.debit_amount) - SUM(jel.credit_amount)) > 0.01
  LOOP
    -- حساب المبلغ المطلوب (الفرق بين Debit و Credit)
    v_amount := v_entry.total_debit - v_entry.total_credit;
    
    -- جلب حساب AP (الذي تم استخدامه في Debit)
    SELECT account_id INTO v_ap_account_id
    FROM journal_entry_lines
    WHERE journal_entry_id = v_entry.entry_id
      AND debit_amount > 0
    LIMIT 1;
    
    -- جلب حساب الصندوق/البنك للشركة
    SELECT id INTO v_cash_account_id
    FROM chart_of_accounts
    WHERE company_id = v_entry.company_id
      AND (
        sub_type IN ('cash', 'bank') OR
        account_code LIKE '101%' OR  -- حسابات الصندوق عادة تبدأ بـ 101
        account_name ILIKE '%صندوق%' OR
        account_name ILIKE '%بنك%' OR
        account_name ILIKE '%cash%' OR
        account_name ILIKE '%bank%'
      )
      AND is_active = true
    ORDER BY 
      CASE WHEN sub_type IN ('cash', 'bank') THEN 1 ELSE 2 END,
      account_code
    LIMIT 1;
    
    -- إذا لم نجد حساب صندوق، نستخدم حساب الصندوق الافتراضي
    IF v_cash_account_id IS NULL THEN
      SELECT id INTO v_cash_account_id
      FROM chart_of_accounts
      WHERE company_id = v_entry.company_id
        AND account_type = 'asset'
        AND is_active = true
      ORDER BY account_code
      LIMIT 1;
    END IF;
    
    -- إضافة سطر Credit
    IF v_cash_account_id IS NOT NULL AND v_amount > 0 THEN
      INSERT INTO journal_entry_lines (
        journal_entry_id,
        account_id,
        debit_amount,
        credit_amount,
        description
      ) VALUES (
        v_entry.entry_id,
        v_cash_account_id,
        0,
        v_amount,
        CASE 
          WHEN v_entry.entry_id IN (SELECT id FROM journal_entries WHERE reference_type = 'bill_payment') 
          THEN 'نقد/بنك (إصلاح)'
          ELSE 'مخزون/ضريبة (إصلاح)'
        END
      );
      
      RAISE NOTICE '✅ تم إصلاح القيد % - أضيف Credit: %', v_entry.entry_id, v_amount;
    ELSE
      RAISE WARNING '⚠️ لم يتم إصلاح القيد % - حساب الصندوق غير موجود', v_entry.entry_id;
    END IF;
  END LOOP;
END $$;

-- 4. التحقق من النتيجة
WITH EntryBalances AS (
  SELECT 
    je.id AS entry_id,
    je.reference_type,
    SUM(jel.debit_amount) AS total_debit,
    SUM(jel.credit_amount) AS total_credit,
    ABS(SUM(jel.debit_amount) - SUM(jel.credit_amount)) AS imbalance
  FROM journal_entries je
  JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
  WHERE je.reference_type IN ('bill_payment', 'vendor_credit')
    AND je.deleted_at IS NULL
  GROUP BY je.id, je.reference_type
)
SELECT 
  'Verification' AS check_type,
  reference_type,
  COUNT(*) AS total_entries,
  SUM(CASE WHEN imbalance > 0.01 THEN 1 ELSE 0 END) AS unbalanced_count,
  SUM(imbalance) AS total_imbalance
FROM EntryBalances
GROUP BY reference_type;
