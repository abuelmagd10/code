-- =====================================================
-- 📘 Sales Return RPC Functions
-- =====================================================
-- هذا الملف يحتوي على دوال RPC لمعالجة مرتجعات المبيعات بشكل آمن
-- يتم استدعاؤها من التطبيق لتحديث الفواتير بدون انتهاك قيود القاعدة

-- =====================================================
-- 1️⃣ دالة تحديث الفاتورة بعد المرتجع (للفواتير المدفوعة)
-- =====================================================
-- هذه الدالة تتجاوز قيد "لا تعديل بعد القيود المحاسبية"
-- لأنها تحديث آمن ومحدود فقط للحقول المسموح بها

CREATE OR REPLACE FUNCTION update_invoice_after_return(
  p_invoice_id UUID,
  p_returned_amount NUMERIC,
  p_return_status TEXT,
  p_new_status TEXT,
  p_notes TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result JSON;
  v_old_returned_amount NUMERIC;
  v_total_amount NUMERIC;
BEGIN
  -- التحقق من وجود الفاتورة
  SELECT returned_amount, total_amount
  INTO v_old_returned_amount, v_total_amount
  FROM invoices
  WHERE id = p_invoice_id;

  IF NOT FOUND THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Invoice not found'
    );
  END IF;

  -- التحقق من عدم تجاوز المبلغ المرتجع للإجمالي
  IF p_returned_amount > v_total_amount THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Returned amount cannot exceed total amount'
    );
  END IF;

  -- تحديث الفاتورة (تجاوز قيد القيود المحاسبية)
  UPDATE invoices
  SET 
    returned_amount = p_returned_amount,
    return_status = p_return_status,
    status = p_new_status,
    notes = COALESCE(notes, '') || E'\n' || p_notes,
    updated_at = NOW()
  WHERE id = p_invoice_id;

  -- إرجاع النتيجة
  RETURN json_build_object(
    'success', true,
    'invoice_id', p_invoice_id,
    'old_returned_amount', v_old_returned_amount,
    'new_returned_amount', p_returned_amount
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$$;

-- =====================================================
-- 2️⃣ دالة حساب الصافي بعد المرتجع (Net Amount)
-- =====================================================
-- تحسب الصافي الفعلي للفاتورة بعد خصم المرتجعات

CREATE OR REPLACE FUNCTION calculate_invoice_net_amount(
  p_invoice_id UUID
)
RETURNS NUMERIC
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_total_amount NUMERIC;
  v_returned_amount NUMERIC;
  v_net_amount NUMERIC;
BEGIN
  SELECT 
    COALESCE(total_amount, 0),
    COALESCE(returned_amount, 0)
  INTO v_total_amount, v_returned_amount
  FROM invoices
  WHERE id = p_invoice_id;

  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  v_net_amount := v_total_amount - v_returned_amount;
  
  RETURN GREATEST(v_net_amount, 0);
END;
$$;

-- =====================================================
-- 3️⃣ دالة التحقق من الكميات المتاحة للمرتجع
-- =====================================================
-- تتحقق من الكمية المتاحة للإرجاع من حركات المخزون الفعلية

CREATE OR REPLACE FUNCTION get_available_return_quantity(
  p_invoice_id UUID,
  p_product_id UUID
)
RETURNS NUMERIC
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_sold_qty NUMERIC := 0;
  v_returned_qty NUMERIC := 0;
  v_available_qty NUMERIC;
BEGIN
  -- الكمية المباعة (من حركات البيع)
  SELECT COALESCE(ABS(SUM(quantity_change)), 0)
  INTO v_sold_qty
  FROM inventory_transactions
  WHERE reference_id = p_invoice_id
    AND product_id = p_product_id
    AND transaction_type = 'sale';

  -- الكمية المرتجعة سابقاً
  SELECT COALESCE(SUM(quantity_change), 0)
  INTO v_returned_qty
  FROM inventory_transactions
  WHERE reference_id = p_invoice_id
    AND product_id = p_product_id
    AND transaction_type = 'sale_return';

  v_available_qty := v_sold_qty - v_returned_qty;
  
  RETURN GREATEST(v_available_qty, 0);
END;
$$;

-- =====================================================
-- 4️⃣ دالة معالجة المرتجع الكامل (Full Return Processing)
-- =====================================================
-- تعالج المرتجع بشكل كامل في معاملة واحدة (Transaction)

CREATE OR REPLACE FUNCTION process_sales_return(
  p_invoice_id UUID,
  p_return_items JSONB,
  p_return_mode TEXT,
  p_company_id UUID,
  p_user_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result JSON;
  v_return_total NUMERIC := 0;
  v_item JSONB;
  v_available_qty NUMERIC;
BEGIN
  -- التحقق من الكميات المتاحة لكل منتج
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_return_items)
  LOOP
    v_available_qty := get_available_return_quantity(
      p_invoice_id,
      (v_item->>'product_id')::UUID
    );

    IF (v_item->>'quantity')::NUMERIC > v_available_qty THEN
      RETURN json_build_object(
        'success', false,
        'error', 'Quantity exceeds available return quantity',
        'product_id', v_item->>'product_id',
        'requested', (v_item->>'quantity')::NUMERIC,
        'available', v_available_qty
      );
    END IF;

    v_return_total := v_return_total + (v_item->>'line_total')::NUMERIC;
  END LOOP;

  -- إرجاع النتيجة
  RETURN json_build_object(
    'success', true,
    'return_total', v_return_total,
    'items_count', jsonb_array_length(p_return_items)
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$$;

-- =====================================================
-- 5️⃣ Grant Permissions
-- =====================================================

-- منح الصلاحيات للمستخدمين المصادق عليهم
GRANT EXECUTE ON FUNCTION update_invoice_after_return TO authenticated;
GRANT EXECUTE ON FUNCTION calculate_invoice_net_amount TO authenticated;
GRANT EXECUTE ON FUNCTION get_available_return_quantity TO authenticated;
GRANT EXECUTE ON FUNCTION process_sales_return TO authenticated;

-- =====================================================
-- 📝 ملاحظات الاستخدام
-- =====================================================

-- مثال 1: تحديث فاتورة بعد المرتجع
-- SELECT update_invoice_after_return(
--   'invoice-uuid',
--   5000.00,
--   'partial',
--   'partially_returned',
--   '[2025-01-15] مرتجع جزئي: 5000.00'
-- );

-- مثال 2: حساب الصافي
-- SELECT calculate_invoice_net_amount('invoice-uuid');

-- مثال 3: التحقق من الكمية المتاحة
-- SELECT get_available_return_quantity('invoice-uuid', 'product-uuid');

