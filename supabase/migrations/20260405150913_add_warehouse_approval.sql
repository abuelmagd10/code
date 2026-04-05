
-- 1. إضافة عمود warehouse_status لجدول الفواتير
ALTER TABLE invoices
ADD COLUMN IF NOT EXISTS warehouse_status TEXT DEFAULT 'pending'
CHECK (warehouse_status IN ('pending', 'approved', 'rejected'));

-- 2. إنشاء RPC للموافقة
CREATE OR REPLACE FUNCTION approve_sales_delivery(
  p_invoice_id UUID,
  p_confirmed_by UUID,
  p_notes TEXT DEFAULT NULL
) RETURNS JSONB AS $\$
DECLARE
  v_invoice RECORD;
  v_item RECORD;
BEGIN
  -- 1. جلب الفاتورة والتحقق من حالتها
  SELECT i.*, s.warehouse_id, s.branch_id, s.cost_center_id, s.shipping_provider_id
  INTO v_invoice
  FROM invoices i
  JOIN sales_orders s ON s.id = i.sales_order_id
  WHERE i.id = p_invoice_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invoice not found');
  END IF;
  
  IF v_invoice.warehouse_status != 'pending' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Delivery already processed');
  END IF;

  IF v_invoice.status != 'sent' AND v_invoice.status != 'paid' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invoice must be posted (sent/paid) before warehouse dispatch');
  END IF;

  -- 2. لكل صنف: إخراج من المخزن + تسجيل في third_party_inventory
  FOR v_item IN 
    SELECT ii.*, p.name AS product_name
    FROM invoice_items ii
    JOIN products p ON p.id = ii.product_id
    WHERE ii.invoice_id = p_invoice_id
  LOOP
    -- حركة مخزون سالبة (إخراج من مخزن الفرع)
    INSERT INTO inventory_transactions (
      company_id, product_id, transaction_type, quantity_change,
      reference_id, reference_type, notes,
      branch_id, cost_center_id, warehouse_id,
      from_location_type, from_location_id,
      to_location_type, to_location_id,
      unit_cost, total_cost
    ) VALUES (
      v_invoice.company_id, v_item.product_id, 'sale_dispatch', -v_item.quantity,
      p_invoice_id, 'invoice', COALESCE(p_notes, 'إخراج بضاعة - فاتورة مبيعات'),
      v_invoice.branch_id, v_invoice.cost_center_id, v_invoice.warehouse_id,
      'warehouse', v_invoice.warehouse_id,
      'third_party', v_invoice.shipping_provider_id,
      v_item.unit_price, v_item.line_total
    );

    -- تسجيل في third_party_inventory (بضائع لدى الغير)
    INSERT INTO third_party_inventory (
      company_id, shipping_provider_id, product_id, invoice_id,
      quantity, unit_cost, total_cost, status,
      branch_id, cost_center_id, warehouse_id,
      customer_id, sales_order_id
    ) VALUES (
      v_invoice.company_id, v_invoice.shipping_provider_id, v_item.product_id, p_invoice_id,
      v_item.quantity, v_item.unit_price, v_item.line_total, 'open',
      v_invoice.branch_id, v_invoice.cost_center_id, v_invoice.warehouse_id,
      v_invoice.customer_id, v_invoice.sales_order_id
    );
  END LOOP;

  -- 3. تحديث حالة الفاتورة
  UPDATE invoices SET warehouse_status = 'approved' WHERE id = p_invoice_id;

  RETURN jsonb_build_object('success', true, 'message', 'Inventory dispatched successfully');
END;
$\$ LANGUAGE plpgsql SECURITY DEFINER;


-- 3. إنشاء RPC للرفض
CREATE OR REPLACE FUNCTION reject_sales_delivery(
  p_invoice_id UUID,
  p_confirmed_by UUID,
  p_notes TEXT DEFAULT NULL
) RETURNS JSONB AS $\$
DECLARE
  v_invoice RECORD;
BEGIN
  -- جلب الفاتورة للتحقق
  SELECT *
  INTO v_invoice
  FROM invoices
  WHERE id = p_invoice_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invoice not found');
  END IF;
  
  IF v_invoice.warehouse_status != 'pending' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Delivery already processed');
  END IF;

  UPDATE invoices SET warehouse_status = 'rejected' WHERE id = p_invoice_id;

  -- يمكن مستقبلاً إضافة إشعار للمبيعات هنا أو إضافة notes داخل جدول مخصص
  
  RETURN jsonb_build_object('success', true, 'message', 'Delivery rejected');
END;
$\$ LANGUAGE plpgsql SECURITY DEFINER;
