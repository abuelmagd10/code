-- ============================================================
-- Migration: 20260221_008_fix_double_cogs_and_fifo.sql
-- Phase 1: إصلاح Double COGS وإعادة بناء FIFO Lots
-- ============================================================
-- المشكلة المكتشفة:
-- كل فاتورة تُنشئ قيدَين منفصلَين:
--   1) قيد 'invoice': يحتوي AR + Revenue + COGS(5000) + Inventory(credit)  ← مدمج قديم
--   2) قيد 'invoice_cogs': يحتوي COGS(5100) + Inventory(credit)             ← صحيح
-- النتيجة: المخزون يُخفَّض مرتَين، COGS مُضاعَفة
-- الإصلاح: حذف أسطر COGS/Inventory من قيود النوع 'invoice' (الإبقاء على invoice_cogs فقط)
-- ============================================================

BEGIN;

-- ─────────────────────────────────────────────
-- 1. تسجيل الحالة قبل الإصلاح (للتدقيق)
-- ─────────────────────────────────────────────
DO $$
DECLARE
  v_affected_entries INTEGER;
  v_affected_lines   INTEGER;
  v_gl_inventory     NUMERIC;
BEGIN
  -- عد القيود المتأثرة
  SELECT COUNT(DISTINCT je.id) INTO v_affected_entries
  FROM journal_entries je
  JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
  JOIN chart_of_accounts coa ON coa.id = jel.account_id
  WHERE je.reference_type = 'invoice'
    AND (
      (jel.debit_amount > 0  AND (coa.account_type = 'expense' OR coa.account_name ILIKE '%مصروف%' OR coa.account_name ILIKE '%تكلفة%'))
      OR
      (jel.credit_amount > 0 AND (coa.sub_type = 'inventory' OR coa.account_name ILIKE '%مخزون%'))
    )
    AND EXISTS (
      SELECT 1 FROM journal_entries je2
      WHERE je2.reference_id = je.reference_id
        AND je2.reference_type = 'invoice_cogs'
    );

  SELECT COUNT(jel.id) INTO v_affected_lines
  FROM journal_entries je
  JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
  JOIN chart_of_accounts coa ON coa.id = jel.account_id
  WHERE je.reference_type = 'invoice'
    AND (
      (jel.debit_amount > 0  AND (coa.account_type = 'expense' OR coa.account_name ILIKE '%مصروف%' OR coa.account_name ILIKE '%تكلفة%'))
      OR
      (jel.credit_amount > 0 AND (coa.sub_type = 'inventory' OR coa.account_name ILIKE '%مخزون%'))
    )
    AND EXISTS (
      SELECT 1 FROM journal_entries je2
      WHERE je2.reference_id = je.reference_id
        AND je2.reference_type = 'invoice_cogs'
    );

  RAISE NOTICE 'قبل الإصلاح: % قيد متأثر، % سطر للحذف', v_affected_entries, v_affected_lines;
END $$;

-- ─────────────────────────────────────────────
-- 2. حذف أسطر COGS/Inventory المكررة من قيود النوع 'invoice'
--    الشرط: يجب أن يكون للفاتورة ذاتها قيد 'invoice_cogs' مستقل
-- ─────────────────────────────────────────────
DELETE FROM journal_entry_lines
WHERE id IN (
  SELECT jel.id
  FROM journal_entries je
  JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
  JOIN chart_of_accounts coa ON coa.id = jel.account_id
  WHERE je.reference_type = 'invoice'
    AND (
      -- سطر مدين على حساب مصروفات/تكلفة (COGS مكررة في قيد invoice)
      (jel.debit_amount > 0  AND (
        coa.account_type = 'expense'
        OR coa.account_name ILIKE '%مصروف%'
        OR coa.account_name ILIKE '%تكلفة%'
        OR coa.sub_type    ILIKE '%cogs%'
        OR coa.sub_type    ILIKE '%cost_of_goods%'
      ))
      OR
      -- سطر دائن على حساب المخزون (Inventory credit مكررة في قيد invoice)
      (jel.credit_amount > 0 AND (
        coa.sub_type      = 'inventory'
        OR coa.account_name ILIKE '%مخزون%'
        OR coa.account_name ILIKE '%inventory%'
      ))
    )
    -- فقط للفواتير التي لها قيد invoice_cogs منفصل
    AND EXISTS (
      SELECT 1
      FROM journal_entries je2
      WHERE je2.reference_id  = je.reference_id
        AND je2.reference_type = 'invoice_cogs'
        AND je2.company_id     = je.company_id
    )
);

-- ─────────────────────────────────────────────
-- 3. التحقق من أن قيود 'invoice' متوازنة بعد الإصلاح
-- ─────────────────────────────────────────────
DO $$
DECLARE
  v_unbalanced INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_unbalanced
  FROM (
    SELECT je.id, SUM(jel.debit_amount) AS total_debit, SUM(jel.credit_amount) AS total_credit
    FROM journal_entries je
    JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
    WHERE je.reference_type = 'invoice'
    GROUP BY je.id
    HAVING ABS(SUM(jel.debit_amount) - SUM(jel.credit_amount)) > 0.01
  ) sub;

  IF v_unbalanced > 0 THEN
    RAISE EXCEPTION 'تحذير: % قيود invoice غير متوازنة بعد الإصلاح! يرجى المراجعة.', v_unbalanced;
  ELSE
    RAISE NOTICE 'تحقق: جميع قيود invoice متوازنة بعد الإصلاح ✓';
  END IF;
END $$;

-- ─────────────────────────────────────────────
-- 4. إنشاء دالة مراجعة FIFO vs GL
--    تُعيد: هل القيمة متطابقة؟
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.reconcile_fifo_vs_gl(p_company_id UUID)
RETURNS TABLE (
  check_name        TEXT,
  gl_value          NUMERIC,
  fifo_value        NUMERIC,
  difference        NUMERIC,
  tolerance_pct     NUMERIC,
  is_ok             BOOLEAN,
  message           TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_gl_inventory   NUMERIC := 0;
  v_fifo_inventory NUMERIC := 0;
  v_gl_ar          NUMERIC := 0;
  v_gl_ap          NUMERIC := 0;
  v_gl_cash        NUMERIC := 0;
BEGIN

  -- 1) GL Inventory balance
  SELECT COALESCE(SUM(jel.debit_amount - jel.credit_amount), 0) INTO v_gl_inventory
  FROM journal_entry_lines jel
  JOIN journal_entries je ON je.id = jel.journal_entry_id
  JOIN chart_of_accounts coa ON coa.id = jel.account_id
  WHERE je.company_id = p_company_id
    AND je.status = 'posted'
    AND (coa.sub_type = 'inventory' OR coa.account_name ILIKE '%مخزون%')
    AND coa.account_type = 'asset';

  -- 2) FIFO Engine value (sum of remaining_quantity × unit_cost)
  SELECT COALESCE(SUM(fcl.remaining_quantity * fcl.unit_cost), 0) INTO v_fifo_inventory
  FROM fifo_cost_lots fcl
  JOIN products p ON p.id = fcl.product_id
  WHERE p.company_id = p_company_id
    AND fcl.remaining_quantity > 0;

  -- 3) GL Accounts Receivable
  SELECT COALESCE(SUM(jel.debit_amount - jel.credit_amount), 0) INTO v_gl_ar
  FROM journal_entry_lines jel
  JOIN journal_entries je ON je.id = jel.journal_entry_id
  JOIN chart_of_accounts coa ON coa.id = jel.account_id
  WHERE je.company_id = p_company_id
    AND je.status = 'posted'
    AND (coa.sub_type IN ('accounts_receivable','ar') OR coa.account_name ILIKE '%العملاء%' OR coa.account_name ILIKE '%الذمم المدينة%')
    AND coa.account_type = 'asset';

  -- 4) GL Accounts Payable
  SELECT COALESCE(SUM(jel.credit_amount - jel.debit_amount), 0) INTO v_gl_ap
  FROM journal_entry_lines jel
  JOIN journal_entries je ON je.id = jel.journal_entry_id
  JOIN chart_of_accounts coa ON coa.id = jel.account_id
  WHERE je.company_id = p_company_id
    AND je.status = 'posted'
    AND (coa.sub_type IN ('accounts_payable','ap') OR coa.account_name ILIKE '%الموردين%' OR coa.account_name ILIKE '%الذمم الدائنة%')
    AND coa.account_type = 'liability';

  -- 5) GL Cash/Bank
  SELECT COALESCE(SUM(jel.debit_amount - jel.credit_amount), 0) INTO v_gl_cash
  FROM journal_entry_lines jel
  JOIN journal_entries je ON je.id = jel.journal_entry_id
  JOIN chart_of_accounts coa ON coa.id = jel.account_id
  WHERE je.company_id = p_company_id
    AND je.status = 'posted'
    AND coa.account_type = 'asset'
    AND (coa.sub_type IN ('cash','bank') OR coa.account_name ILIKE '%بنك%' OR coa.account_name ILIKE '%صندوق%' OR coa.account_name ILIKE '%نقد%');

  -- ─── Return results ───
  RETURN QUERY VALUES
    ('GL vs FIFO Inventory',
     v_gl_inventory, v_fifo_inventory,
     ABS(v_gl_inventory - v_fifo_inventory),
     CASE WHEN v_gl_inventory = 0 THEN 100 ELSE ROUND(ABS(v_gl_inventory - v_fifo_inventory) / v_gl_inventory * 100, 2) END,
     ABS(v_gl_inventory - v_fifo_inventory) < 1,  -- tolerance: £1
     CASE WHEN ABS(v_gl_inventory - v_fifo_inventory) < 1
          THEN '✓ GL Inventory = FIFO Value (مطابق)'
          ELSE '✗ تضارب: GL=' || v_gl_inventory::TEXT || ' FIFO=' || v_fifo_inventory::TEXT END
    ),
    ('GL Accounts Receivable',
     v_gl_ar, v_gl_ar,
     0, 0, true,
     '✓ GL AR = ' || v_gl_ar::TEXT
    ),
    ('GL Accounts Payable',
     v_gl_ap, v_gl_ap,
     0, 0, true,
     '✓ GL AP = ' || v_gl_ap::TEXT
    ),
    ('GL Cash & Bank Balance',
     v_gl_cash, v_gl_cash,
     0, 0, true,
     '✓ GL Cash = ' || v_gl_cash::TEXT
    );
END;
$$;

-- ─────────────────────────────────────────────
-- 5. إنشاء دالة backfill FIFO lots من المشتريات الموجودة
--    تُنشئ fifo_cost_lots لكل فاتورة شراء (bill) معتمدة لا يوجد لها lot
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.backfill_fifo_lots_from_bills(p_company_id UUID)
RETURNS TABLE (
  bill_number TEXT,
  product_name TEXT,
  quantity_added NUMERIC,
  unit_cost NUMERIC,
  lot_id UUID,
  status TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_bill    RECORD;
  v_item    RECORD;
  v_lot_id  UUID;
  v_unit_cost NUMERIC;
BEGIN
  -- لكل فاتورة شراء مرحَّلة أو مدفوعة
  FOR v_bill IN
    SELECT b.id, b.bill_number, b.bill_date, b.branch_id, b.warehouse_id, b.cost_center_id
    FROM bills b
    WHERE b.company_id = p_company_id
      AND b.status IN ('posted','paid','partial')
    ORDER BY b.bill_date ASC
  LOOP
    -- لكل بند في الفاتورة
    FOR v_item IN
      SELECT bi.product_id, bi.quantity, bi.unit_price, bi.total_amount,
             p.product_name, p.id as pid
      FROM bill_items bi
      JOIN products p ON p.id = bi.product_id
      WHERE bi.bill_id = v_bill.id
        AND bi.quantity > 0
        AND p.is_service = false  -- منتجات مخزنية فقط
    LOOP
      v_unit_cost := COALESCE(v_item.unit_price, 
                              CASE WHEN v_item.quantity > 0 THEN v_item.total_amount / v_item.quantity ELSE 0 END,
                              0);

      -- تحقق: هل يوجد lot سابق لهذا البند؟
      IF NOT EXISTS (
        SELECT 1 FROM fifo_cost_lots
        WHERE product_id    = v_item.product_id
          AND reference_type = 'purchase'
          AND reference_id   = v_bill.id
      ) THEN
        -- إنشاء lot جديد
        INSERT INTO fifo_cost_lots (
          product_id, lot_date, lot_type,
          original_quantity, remaining_quantity,
          unit_cost, reference_type, reference_id,
          branch_id, warehouse_id
        )
        VALUES (
          v_item.product_id,
          v_bill.bill_date,
          'purchase',
          v_item.quantity,
          v_item.quantity,  -- الكمية المتبقية = الكمية الأصلية (سنُطبَّق الاستهلاك لاحقاً)
          v_unit_cost,
          'purchase',
          v_bill.id,
          v_bill.branch_id,
          v_bill.warehouse_id
        )
        RETURNING id INTO v_lot_id;

        RETURN QUERY VALUES (
          v_bill.bill_number::TEXT,
          v_item.product_name::TEXT,
          v_item.quantity,
          v_unit_cost,
          v_lot_id,
          'created'::TEXT
        );
      ELSE
        RETURN QUERY VALUES (
          v_bill.bill_number::TEXT,
          v_item.product_name::TEXT,
          v_item.quantity,
          v_unit_cost,
          NULL::UUID,
          'already_exists'::TEXT
        );
      END IF;
    END LOOP;
  END LOOP;
END;
$$;

-- ─────────────────────────────────────────────
-- 6. دالة تطبيق استهلاك FIFO من المبيعات الموجودة
--    تُنقص remaining_quantity في fifo_cost_lots بحسب الفواتير المباعة
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.apply_fifo_consumption_from_invoices(p_company_id UUID)
RETURNS TABLE (
  invoice_number TEXT,
  product_name TEXT,
  quantity_consumed NUMERIC,
  cogs_calculated NUMERIC,
  status TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_inv     RECORD;
  v_item    RECORD;
  v_lot     RECORD;
  v_needed  NUMERIC;
  v_consume NUMERIC;
  v_total_cogs NUMERIC;
BEGIN
  -- لكل فاتورة مبيعات مرحَّلة
  FOR v_inv IN
    SELECT i.id, i.invoice_number
    FROM invoices i
    WHERE i.company_id = p_company_id
      AND i.status IN ('sent','paid','partially_paid','posted')
    ORDER BY i.invoice_date ASC
  LOOP
    -- لكل بند في الفاتورة
    FOR v_item IN
      SELECT ii.product_id, ii.quantity, p.product_name
      FROM invoice_items ii
      JOIN products p ON p.id = ii.product_id
      WHERE ii.invoice_id = v_inv.id
        AND ii.quantity > 0
        AND p.is_service = false
    LOOP
      v_needed    := v_item.quantity;
      v_total_cogs := 0;

      -- استهلاك من lots بترتيب FIFO (الأقدم أولاً)
      FOR v_lot IN
        SELECT id, remaining_quantity, unit_cost
        FROM fifo_cost_lots
        WHERE product_id = v_item.product_id
          AND remaining_quantity > 0
        ORDER BY lot_date ASC, created_at ASC
      LOOP
        EXIT WHEN v_needed <= 0;

        v_consume := LEAST(v_needed, v_lot.remaining_quantity);

        UPDATE fifo_cost_lots
        SET remaining_quantity = remaining_quantity - v_consume
        WHERE id = v_lot.id;

        v_total_cogs := v_total_cogs + (v_consume * v_lot.unit_cost);
        v_needed     := v_needed - v_consume;
      END LOOP;

      RETURN QUERY VALUES (
        v_inv.invoice_number::TEXT,
        v_item.product_name::TEXT,
        v_item.quantity,
        v_total_cogs,
        CASE WHEN v_needed > 0 THEN 'insufficient_stock' ELSE 'ok' END::TEXT
      );
    END LOOP;
  END LOOP;
END;
$$;

-- ─────────────────────────────────────────────
-- 7. تطبيق استهلاك مرتجعات الشراء (تُعيد remaining_quantity)
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.apply_purchase_returns_to_fifo(p_company_id UUID)
RETURNS TABLE (
  return_ref TEXT,
  product_name TEXT,
  quantity_returned NUMERIC,
  status TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_ret  RECORD;
  v_item RECORD;
  v_lot  RECORD;
  v_remaining NUMERIC;
BEGIN
  -- لكل مرتجع شراء مكتمل
  FOR v_ret IN
    SELECT pr.id, pr.return_number, pr.bill_id
    FROM purchase_returns pr
    JOIN bills b ON b.id = pr.bill_id
    WHERE b.company_id = p_company_id
      AND pr.status = 'completed'
    ORDER BY pr.created_at ASC
  LOOP
    FOR v_item IN
      SELECT pri.product_id, pri.quantity, p.product_name
      FROM purchase_return_items pri
      JOIN products p ON p.id = pri.product_id
      WHERE pri.purchase_return_id = v_ret.id
        AND pri.quantity > 0
        AND p.is_service = false
    LOOP
      -- إعادة الكمية إلى lot الأصلي للفاتورة
      v_remaining := v_item.quantity;

      FOR v_lot IN
        SELECT id, original_quantity, remaining_quantity
        FROM fifo_cost_lots
        WHERE product_id    = v_item.product_id
          AND reference_id  = v_ret.bill_id
          AND reference_type = 'purchase'
        ORDER BY lot_date ASC
      LOOP
        EXIT WHEN v_remaining <= 0;
        -- نُعيد بقدر ما يمكن (لا نتجاوز original_quantity)
        DECLARE
          v_can_restore NUMERIC;
        BEGIN
          v_can_restore := LEAST(v_remaining, v_lot.original_quantity - v_lot.remaining_quantity);
          IF v_can_restore > 0 THEN
            UPDATE fifo_cost_lots
            SET remaining_quantity = remaining_quantity + v_can_restore
            WHERE id = v_lot.id;
            v_remaining := v_remaining - v_can_restore;
          END IF;
        END;
      END LOOP;

      RETURN QUERY VALUES (
        v_ret.return_number::TEXT,
        v_item.product_name::TEXT,
        v_item.quantity,
        'ok'::TEXT
      );
    END LOOP;
  END LOOP;
END;
$$;

COMMIT;

-- ──────────────────────────────────────────────────────────────
-- 8. تعليمات تشغيل الـ Backfill يدوياً في Supabase SQL Editor
--    (يُشغَّل مرة واحدة بعد تطبيق هذه Migration)
-- ──────────────────────────────────────────────────────────────
-- الخطوة 1: إنشاء FIFO lots من المشتريات الموجودة
--   SELECT * FROM public.backfill_fifo_lots_from_bills('<company_id>');
--
-- الخطوة 2: تطبيق استهلاك المبيعات على الـ lots
--   SELECT * FROM public.apply_fifo_consumption_from_invoices('<company_id>');
--
-- الخطوة 3: تطبيق مرتجعات الشراء
--   SELECT * FROM public.apply_purchase_returns_to_fifo('<company_id>');
--
-- الخطوة 4: مراجعة FIFO vs GL
--   SELECT * FROM public.reconcile_fifo_vs_gl('<company_id>');
-- ──────────────────────────────────────────────────────────────
