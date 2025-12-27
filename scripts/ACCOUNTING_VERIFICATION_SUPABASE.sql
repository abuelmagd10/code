-- =============================================
-- 🔍 سكربت التحقق من سلامة النظام المحاسبي
-- Accounting System Verification Script (Supabase Compatible)
-- =============================================
-- التاريخ: 2025-12-27
-- الهدف: التحقق من سلامة البيانات المحاسبية بعد التصحيح
-- الاستخدام: يُنفذ بعد تطبيق ACCOUNTING_CORRECTION_SCRIPT.sql
-- ملاحظة: هذه النسخة متوافقة مع Supabase SQL Editor
-- =============================================

-- =============================================
-- الفحص 1: توازن القيود المحاسبية
-- Check 1: Journal Entries Balance
-- =============================================

SELECT '1️⃣ فحص توازن القيود المحاسبية' as check_name;

SELECT 
  '❌ قيود غير متوازنة' as status,
  COUNT(*) as count,
  SUM(ABS(difference)) as total_imbalance
FROM (
  SELECT 
    je.id,
    je.entry_date,
    je.description,
    COALESCE(SUM(jel.debit_amount), 0) - COALESCE(SUM(jel.credit_amount), 0) as difference
  FROM journal_entries je
  LEFT JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
  GROUP BY je.id
  HAVING ABS(COALESCE(SUM(jel.debit_amount), 0) - COALESCE(SUM(jel.credit_amount), 0)) > 0.01
) unbalanced;

-- تفاصيل القيود غير المتوازنة (إن وجدت)
SELECT 
  je.id,
  je.entry_date,
  je.description,
  je.reference_type,
  COALESCE(SUM(jel.debit_amount), 0) as total_debit,
  COALESCE(SUM(jel.credit_amount), 0) as total_credit,
  COALESCE(SUM(jel.debit_amount), 0) - COALESCE(SUM(jel.credit_amount), 0) as difference
FROM journal_entries je
LEFT JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
GROUP BY je.id
HAVING ABS(COALESCE(SUM(jel.debit_amount), 0) - COALESCE(SUM(jel.credit_amount), 0)) > 0.01
ORDER BY ABS(COALESCE(SUM(jel.debit_amount), 0) - COALESCE(SUM(jel.credit_amount), 0)) DESC
LIMIT 10;

-- =============================================
-- الفحص 2: قيود COGS للفواتير
-- Check 2: COGS Entries for Invoices
-- =============================================

SELECT '2️⃣ فحص قيود COGS للفواتير' as check_name;

SELECT 
  '📊 إحصائيات قيود COGS' as status,
  COUNT(*) FILTER (WHERE status IN ('sent', 'paid')) as total_invoices,
  COUNT(*) FILTER (WHERE status IN ('sent', 'paid') AND has_inventory) as invoices_with_inventory,
  COUNT(*) FILTER (WHERE status IN ('sent', 'paid') AND has_inventory AND has_cogs) as invoices_with_cogs,
  COUNT(*) FILTER (WHERE status IN ('sent', 'paid') AND has_inventory AND NOT has_cogs) as missing_cogs
FROM (
  SELECT 
    i.id,
    i.status,
    EXISTS (
      SELECT 1 FROM invoice_items ii
      JOIN products p ON p.id = ii.product_id
      WHERE ii.invoice_id = i.id AND p.track_inventory = true
    ) as has_inventory,
    EXISTS (
      SELECT 1 FROM journal_entries je
      WHERE je.reference_type = 'invoice_cogs' AND je.reference_id = i.id::text
    ) as has_cogs
  FROM invoices i
) invoice_stats;

-- الفواتير التي تحتاج إلى قيود COGS (إن وجدت)
SELECT 
  i.id,
  i.invoice_number,
  i.invoice_date,
  i.status,
  i.total_amount,
  COUNT(ii.id) as item_count
FROM invoices i
JOIN invoice_items ii ON ii.invoice_id = i.id
JOIN products p ON p.id = ii.product_id
WHERE i.status IN ('sent', 'paid')
  AND p.track_inventory = true
  AND NOT EXISTS (
    SELECT 1 FROM journal_entries je
    WHERE je.reference_type = 'invoice_cogs' AND je.reference_id = i.id::text
  )
GROUP BY i.id
ORDER BY i.invoice_date DESC
LIMIT 10;

-- =============================================
-- الفحص 3: ربط المخزون مع القيود
-- Check 3: Inventory-Journal Links
-- =============================================

SELECT '3️⃣ فحص ربط حركات المخزون مع القيود' as check_name;

SELECT 
  '📦 إحصائيات ربط المخزون' as status,
  COUNT(*) as total_transactions,
  COUNT(*) FILTER (WHERE journal_entry_id IS NOT NULL) as linked_transactions,
  COUNT(*) FILTER (WHERE journal_entry_id IS NULL) as unlinked_transactions,
  ROUND(COUNT(*) FILTER (WHERE journal_entry_id IS NOT NULL)::NUMERIC / NULLIF(COUNT(*), 0) * 100, 2) as link_percentage
FROM inventory_transactions
WHERE transaction_type IN ('sale', 'purchase', 'write_off', 'sale_return');

-- حركات المخزون غير المرتبطة بقيود (إن وجدت)
SELECT 
  it.id,
  it.transaction_type,
  it.transaction_date,
  p.product_name,
  it.quantity_change,
  it.reference_id
FROM inventory_transactions it
LEFT JOIN products p ON p.id = it.product_id
WHERE it.transaction_type IN ('sale', 'purchase', 'write_off', 'sale_return')
  AND it.journal_entry_id IS NULL
ORDER BY it.transaction_date DESC
LIMIT 10;

-- =============================================
-- الفحص 4: فصل الضرائب (VAT)
-- Check 4: VAT Separation
-- =============================================

SELECT '4️⃣ فحص فصل الضرائب (VAT Input/Output)' as check_name;

SELECT 
  '💰 إحصائيات الضرائب' as status,
  COUNT(DISTINCT ca.id) FILTER (WHERE ca.sub_type = 'vat_output') as vat_output_accounts,
  COUNT(DISTINCT ca.id) FILTER (WHERE ca.sub_type = 'vat_input') as vat_input_accounts,
  SUM(jel.credit_amount) FILTER (WHERE ca.sub_type = 'vat_output') as total_vat_output,
  SUM(jel.debit_amount) FILTER (WHERE ca.sub_type = 'vat_input') as total_vat_input
FROM journal_entry_lines jel
JOIN chart_of_accounts ca ON ca.id = jel.account_id
WHERE ca.sub_type IN ('vat_output', 'vat_input');

-- =============================================
-- الفحص 5: حالة القيود (Posted Status)
-- Check 5: Journal Entry Status
-- =============================================

SELECT '5️⃣ فحص حالة القيود (Posted Status)' as check_name;

SELECT
  '📋 إحصائيات حالة القيود' as status,
  COUNT(*) as total_entries,
  COUNT(*) FILTER (WHERE status = 'posted') as posted_entries,
  COUNT(*) FILTER (WHERE status = 'draft') as draft_entries,
  COUNT(*) FILTER (WHERE status IS NULL) as null_status
FROM journal_entries;

-- =============================================
-- الفحص 6: القيود المكررة
-- Check 6: Duplicate Entries
-- =============================================

SELECT '6️⃣ فحص القيود المكررة' as check_name;

SELECT
  '🔄 القيود المكررة' as status,
  COUNT(*) as duplicate_count
FROM (
  SELECT
    company_id,
    reference_type,
    reference_id,
    COUNT(*) as count
  FROM journal_entries
  WHERE reference_type IS NOT NULL AND reference_id IS NOT NULL
  GROUP BY company_id, reference_type, reference_id
  HAVING COUNT(*) > 1
) duplicates;

-- تفاصيل القيود المكررة (إن وجدت)
SELECT
  je.company_id,
  je.reference_type,
  je.reference_id,
  COUNT(*) as duplicate_count,
  STRING_AGG(je.id::text, ', ') as entry_ids
FROM journal_entries je
WHERE reference_type IS NOT NULL AND reference_id IS NOT NULL
GROUP BY je.company_id, je.reference_type, je.reference_id
HAVING COUNT(*) > 1
LIMIT 10;

-- =============================================
-- الفحص 7: أرصدة العملاء والموردين
-- Check 7: Customer & Supplier Balances
-- =============================================

SELECT '7️⃣ فحص أرصدة العملاء والموردين' as check_name;

-- أرصدة العملاء من القيود
SELECT
  '👥 أرصدة العملاء' as status,
  COUNT(DISTINCT c.id) as total_customers,
  SUM(COALESCE(jel.debit_amount, 0) - COALESCE(jel.credit_amount, 0)) as total_ar_balance
FROM customers c
LEFT JOIN chart_of_accounts ca ON ca.sub_type = 'accounts_receivable' AND ca.company_id = c.company_id
LEFT JOIN journal_entry_lines jel ON jel.account_id = ca.id AND jel.entity_id = c.id
WHERE c.company_id IS NOT NULL;

-- أرصدة الموردين من القيود
SELECT
  '🏭 أرصدة الموردين' as status,
  COUNT(DISTINCT s.id) as total_suppliers,
  SUM(COALESCE(jel.credit_amount, 0) - COALESCE(jel.debit_amount, 0)) as total_ap_balance
FROM suppliers s
LEFT JOIN chart_of_accounts ca ON ca.sub_type = 'accounts_payable' AND ca.company_id = s.company_id
LEFT JOIN journal_entry_lines jel ON jel.account_id = ca.id AND jel.entity_id = s.id
WHERE s.company_id IS NOT NULL;

-- =============================================
-- الفحص 8: التحقق من الدوال والمحفزات
-- Check 8: Functions and Triggers
-- =============================================

SELECT '8️⃣ فحص الدوال والمحفزات' as check_name;

-- التحقق من وجود الدوال
SELECT
  '⚙️ الدوال المطلوبة' as status,
  COUNT(*) FILTER (WHERE proname = 'calculate_fifo_cost') as has_calculate_fifo_cost,
  COUNT(*) FILTER (WHERE proname = 'create_cogs_journal_for_invoice') as has_create_cogs_journal,
  COUNT(*) FILTER (WHERE proname = 'reverse_cogs_journal_for_return') as has_reverse_cogs_journal
FROM pg_proc
WHERE proname IN ('calculate_fifo_cost', 'create_cogs_journal_for_invoice', 'reverse_cogs_journal_for_return');

-- التحقق من وجود المحفزات
SELECT
  '🔔 المحفزات المطلوبة' as status,
  COUNT(*) FILTER (WHERE tgname = 'trg_create_cogs_on_invoice_sent') as has_cogs_trigger,
  COUNT(*) FILTER (WHERE tgname = 'trg_prevent_posted_entry_modification') as has_posted_protection_trigger
FROM pg_trigger
WHERE tgname IN ('trg_create_cogs_on_invoice_sent', 'trg_prevent_posted_entry_modification');

-- =============================================
-- الفحص 9: Views المحاسبية
-- Check 9: Accounting Views
-- =============================================

SELECT '9️⃣ فحص Views المحاسبية' as check_name;

SELECT
  '👁️ Views المطلوبة' as status,
  COUNT(*) FILTER (WHERE viewname = 'v_account_balances') as has_account_balances_view,
  COUNT(*) FILTER (WHERE viewname = 'v_customer_balances') as has_customer_balances_view,
  COUNT(*) FILTER (WHERE viewname = 'v_supplier_balances') as has_supplier_balances_view,
  COUNT(*) FILTER (WHERE viewname = 'v_invoices_with_cogs') as has_invoices_with_cogs_view
FROM pg_views
WHERE viewname IN ('v_account_balances', 'v_customer_balances', 'v_supplier_balances', 'v_invoices_with_cogs');

-- =============================================
-- الفحص 10: الملخص النهائي
-- Check 10: Final Summary
-- =============================================

SELECT '🎯 الملخص النهائي' as check_name;

SELECT
  '✅ النظام المحاسبي' as component,
  CASE
    WHEN unbalanced_count = 0
      AND missing_cogs_count = 0
      AND unlinked_inventory_count = 0
      AND duplicate_count = 0
    THEN '✅ سليم 100%'
    ELSE '⚠️ يحتاج إلى مراجعة'
  END as status,
  unbalanced_count as unbalanced_entries,
  missing_cogs_count as missing_cogs_entries,
  unlinked_inventory_count as unlinked_inventory,
  duplicate_count as duplicate_entries
FROM (
  SELECT
    -- عدد القيود غير المتوازنة
    (SELECT COUNT(*) FROM (
      SELECT je.id
      FROM journal_entries je
      LEFT JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
      GROUP BY je.id
      HAVING ABS(COALESCE(SUM(jel.debit_amount), 0) - COALESCE(SUM(jel.credit_amount), 0)) > 0.01
    ) x) as unbalanced_count,

    -- عدد الفواتير بدون قيود COGS
    (SELECT COUNT(*) FROM (
      SELECT i.id
      FROM invoices i
      WHERE i.status IN ('sent', 'paid')
        AND EXISTS (
          SELECT 1 FROM invoice_items ii
          JOIN products p ON p.id = ii.product_id
          WHERE ii.invoice_id = i.id AND p.track_inventory = true
        )
        AND NOT EXISTS (
          SELECT 1 FROM journal_entries je
          WHERE je.reference_type = 'invoice_cogs' AND je.reference_id = i.id::text
        )
    ) x) as missing_cogs_count,

    -- عدد حركات المخزون غير المرتبطة
    (SELECT COUNT(*) FROM inventory_transactions
     WHERE transaction_type IN ('sale', 'purchase', 'write_off', 'sale_return')
       AND journal_entry_id IS NULL) as unlinked_inventory_count,

    -- عدد القيود المكررة
    (SELECT COUNT(*) FROM (
      SELECT company_id, reference_type, reference_id
      FROM journal_entries
      WHERE reference_type IS NOT NULL AND reference_id IS NOT NULL
      GROUP BY company_id, reference_type, reference_id
      HAVING COUNT(*) > 1
    ) x) as duplicate_count
) summary;

-- =============================================
-- 🎉 انتهى الفحص
-- =============================================

SELECT '🎉 انتهى فحص النظام المحاسبي بنجاح!' as final_message;

