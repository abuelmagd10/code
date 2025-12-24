-- =============================================
-- FIFO Cost Lots System (Zoho Books Compatible)
-- =============================================
-- نظام تتبع دفعات الشراء بأسعارها الفعلية (FIFO Layers)
-- مطابق لنظام Zoho Books في حساب COGS
-- =============================================

-- 1️⃣ جدول دفعات التكلفة (FIFO Cost Lots)
CREATE TABLE IF NOT EXISTS fifo_cost_lots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  
  -- معلومات الدفعة
  lot_date DATE NOT NULL DEFAULT CURRENT_DATE,
  lot_type TEXT NOT NULL, -- 'opening_stock', 'purchase', 'purchase_return_reversal'
  reference_type TEXT, -- 'bill', 'opening_stock', 'adjustment'
  reference_id UUID, -- bill_id or adjustment_id
  
  -- الكميات والتكاليف
  original_quantity NUMERIC NOT NULL, -- الكمية الأصلية للدفعة
  remaining_quantity NUMERIC NOT NULL, -- الكمية المتبقية (تقل مع البيع)
  unit_cost NUMERIC NOT NULL, -- تكلفة الوحدة لهذه الدفعة
  
  -- معلومات إضافية
  notes TEXT,
  branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
  warehouse_id UUID REFERENCES warehouses(id) ON DELETE SET NULL,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  
  -- قيود
  CONSTRAINT chk_quantities CHECK (remaining_quantity >= 0 AND remaining_quantity <= original_quantity),
  CONSTRAINT chk_unit_cost CHECK (unit_cost >= 0)
);

-- Indexes للأداء
CREATE INDEX IF NOT EXISTS idx_fifo_lots_product ON fifo_cost_lots(product_id, lot_date);
CREATE INDEX IF NOT EXISTS idx_fifo_lots_company ON fifo_cost_lots(company_id);
CREATE INDEX IF NOT EXISTS idx_fifo_lots_remaining ON fifo_cost_lots(product_id, remaining_quantity) WHERE remaining_quantity > 0;
CREATE INDEX IF NOT EXISTS idx_fifo_lots_reference ON fifo_cost_lots(reference_type, reference_id);

-- 2️⃣ جدول استهلاك الدفعات (FIFO Lot Consumption)
-- يتتبع أي دفعة تم استخدامها في أي عملية بيع
CREATE TABLE IF NOT EXISTS fifo_lot_consumptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  
  -- الدفعة المستهلكة
  lot_id UUID NOT NULL REFERENCES fifo_cost_lots(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  
  -- معلومات الاستهلاك
  consumption_type TEXT NOT NULL, -- 'sale', 'write_off', 'adjustment_out'
  reference_type TEXT NOT NULL, -- 'invoice', 'write_off', 'adjustment'
  reference_id UUID NOT NULL, -- invoice_id, write_off_id, etc.
  
  -- الكمية والتكلفة
  quantity_consumed NUMERIC NOT NULL, -- الكمية المستهلكة من هذه الدفعة
  unit_cost NUMERIC NOT NULL, -- تكلفة الوحدة (نسخة من الدفعة)
  total_cost NUMERIC NOT NULL, -- إجمالي التكلفة = quantity * unit_cost
  
  -- معلومات إضافية
  consumption_date DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  
  -- قيود
  CONSTRAINT chk_consumption_qty CHECK (quantity_consumed > 0),
  CONSTRAINT chk_consumption_cost CHECK (unit_cost >= 0 AND total_cost >= 0)
);

-- Indexes للأداء
CREATE INDEX IF NOT EXISTS idx_fifo_consumption_lot ON fifo_lot_consumptions(lot_id);
CREATE INDEX IF NOT EXISTS idx_fifo_consumption_product ON fifo_lot_consumptions(product_id);
CREATE INDEX IF NOT EXISTS idx_fifo_consumption_reference ON fifo_lot_consumptions(reference_type, reference_id);
CREATE INDEX IF NOT EXISTS idx_fifo_consumption_date ON fifo_lot_consumptions(consumption_date);

-- 3️⃣ دالة لإنشاء دفعة جديدة عند الشراء
CREATE OR REPLACE FUNCTION create_fifo_lot_on_purchase()
RETURNS TRIGGER AS $$
DECLARE
  v_unit_cost NUMERIC;
  v_bill_date DATE;
BEGIN
  -- فقط لحركات الشراء
  IF NEW.transaction_type NOT IN ('purchase', 'adjustment_in') THEN
    RETURN NEW;
  END IF;
  
  -- تجاهل الخدمات
  IF EXISTS (SELECT 1 FROM products WHERE id = NEW.product_id AND item_type = 'service') THEN
    RETURN NEW;
  END IF;
  
  -- الحصول على تكلفة الوحدة من الفاتورة
  IF NEW.transaction_type = 'purchase' AND NEW.reference_id IS NOT NULL THEN
    -- من bill_items
    SELECT bi.unit_price, b.bill_date
    INTO v_unit_cost, v_bill_date
    FROM bill_items bi
    JOIN bills b ON bi.bill_id = b.id
    WHERE bi.bill_id = NEW.reference_id 
      AND bi.product_id = NEW.product_id
    LIMIT 1;
  ELSE
    -- من products.cost_price (للتعديلات)
    SELECT cost_price INTO v_unit_cost FROM products WHERE id = NEW.product_id;
    v_bill_date := CURRENT_DATE;
  END IF;
  
  -- إنشاء دفعة جديدة
  INSERT INTO fifo_cost_lots (
    company_id,
    product_id,
    lot_date,
    lot_type,
    reference_type,
    reference_id,
    original_quantity,
    remaining_quantity,
    unit_cost,
    notes,
    branch_id,
    warehouse_id
  ) VALUES (
    NEW.company_id,
    NEW.product_id,
    v_bill_date,
    CASE 
      WHEN NEW.transaction_type = 'purchase' THEN 'purchase'
      ELSE 'adjustment'
    END,
    CASE 
      WHEN NEW.transaction_type = 'purchase' THEN 'bill'
      ELSE 'adjustment'
    END,
    NEW.reference_id,
    NEW.quantity_change,
    NEW.quantity_change,
    COALESCE(v_unit_cost, 0),
    NEW.notes,
    NEW.branch_id,
    NULL -- warehouse_id will be added later if needed
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger لإنشاء دفعات عند الشراء
DROP TRIGGER IF EXISTS trg_create_fifo_lot_on_purchase ON inventory_transactions;
CREATE TRIGGER trg_create_fifo_lot_on_purchase
AFTER INSERT ON inventory_transactions
FOR EACH ROW
EXECUTE FUNCTION create_fifo_lot_on_purchase();

-- 4️⃣ دالة لحساب COGS باستخدام FIFO
CREATE OR REPLACE FUNCTION calculate_fifo_cogs(
  p_product_id UUID,
  p_quantity NUMERIC,
  OUT total_cogs NUMERIC,
  OUT lots_used JSONB
)
AS $$
DECLARE
  v_lot RECORD;
  v_remaining_qty NUMERIC := p_quantity;
  v_qty_from_lot NUMERIC;
  v_cost_from_lot NUMERIC;
  v_lots_array JSONB := '[]'::JSONB;
BEGIN
  total_cogs := 0;

  -- الحصول على الدفعات بترتيب FIFO (الأقدم أولاً)
  FOR v_lot IN
    SELECT id, remaining_quantity, unit_cost, lot_date
    FROM fifo_cost_lots
    WHERE product_id = p_product_id
      AND remaining_quantity > 0
    ORDER BY lot_date ASC, created_at ASC
  LOOP
    -- إذا استهلكنا الكمية المطلوبة، نتوقف
    EXIT WHEN v_remaining_qty <= 0;

    -- الكمية التي سنأخذها من هذه الدفعة
    v_qty_from_lot := LEAST(v_lot.remaining_quantity, v_remaining_qty);
    v_cost_from_lot := v_qty_from_lot * v_lot.unit_cost;

    -- إضافة للتكلفة الإجمالية
    total_cogs := total_cogs + v_cost_from_lot;

    -- تسجيل الدفعة المستخدمة
    v_lots_array := v_lots_array || jsonb_build_object(
      'lot_id', v_lot.id,
      'quantity', v_qty_from_lot,
      'unit_cost', v_lot.unit_cost,
      'total_cost', v_cost_from_lot,
      'lot_date', v_lot.lot_date
    );

    -- تقليل الكمية المتبقية
    v_remaining_qty := v_remaining_qty - v_qty_from_lot;
  END LOOP;

  lots_used := v_lots_array;

  -- إذا لم نجد دفعات كافية، نرجع خطأ
  IF v_remaining_qty > 0 THEN
    RAISE WARNING 'Insufficient FIFO lots for product %. Missing quantity: %', p_product_id, v_remaining_qty;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- 5️⃣ دالة لاستهلاك الدفعات عند البيع (FIFO Consumption)
CREATE OR REPLACE FUNCTION consume_fifo_lots(
  p_company_id UUID,
  p_product_id UUID,
  p_quantity NUMERIC,
  p_consumption_type TEXT,
  p_reference_type TEXT,
  p_reference_id UUID,
  p_consumption_date DATE DEFAULT CURRENT_DATE
)
RETURNS NUMERIC AS $$
DECLARE
  v_lot RECORD;
  v_remaining_qty NUMERIC := p_quantity;
  v_qty_from_lot NUMERIC;
  v_cost_from_lot NUMERIC;
  v_total_cogs NUMERIC := 0;
BEGIN
  -- الحصول على الدفعات بترتيب FIFO
  FOR v_lot IN
    SELECT id, remaining_quantity, unit_cost
    FROM fifo_cost_lots
    WHERE product_id = p_product_id
      AND company_id = p_company_id
      AND remaining_quantity > 0
    ORDER BY lot_date ASC, created_at ASC
    FOR UPDATE -- قفل الصفوف لتجنب race conditions
  LOOP
    EXIT WHEN v_remaining_qty <= 0;

    -- الكمية من هذه الدفعة
    v_qty_from_lot := LEAST(v_lot.remaining_quantity, v_remaining_qty);
    v_cost_from_lot := v_qty_from_lot * v_lot.unit_cost;

    -- تسجيل الاستهلاك
    INSERT INTO fifo_lot_consumptions (
      company_id,
      lot_id,
      product_id,
      consumption_type,
      reference_type,
      reference_id,
      quantity_consumed,
      unit_cost,
      total_cost,
      consumption_date
    ) VALUES (
      p_company_id,
      v_lot.id,
      p_product_id,
      p_consumption_type,
      p_reference_type,
      p_reference_id,
      v_qty_from_lot,
      v_lot.unit_cost,
      v_cost_from_lot,
      p_consumption_date
    );

    -- تحديث الكمية المتبقية في الدفعة
    UPDATE fifo_cost_lots
    SET remaining_quantity = remaining_quantity - v_qty_from_lot,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = v_lot.id;

    -- إضافة للتكلفة الإجمالية
    v_total_cogs := v_total_cogs + v_cost_from_lot;
    v_remaining_qty := v_remaining_qty - v_qty_from_lot;
  END LOOP;

  -- إذا لم نجد دفعات كافية
  IF v_remaining_qty > 0 THEN
    RAISE WARNING 'Insufficient FIFO lots for product %. Missing quantity: %', p_product_id, v_remaining_qty;
  END IF;

  RETURN v_total_cogs;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6️⃣ دالة لعكس استهلاك الدفعات (عند المرتجعات)
CREATE OR REPLACE FUNCTION reverse_fifo_consumption(
  p_reference_type TEXT,
  p_reference_id UUID
)
RETURNS VOID AS $$
DECLARE
  v_consumption RECORD;
BEGIN
  -- الحصول على جميع الاستهلاكات المرتبطة بهذا المرجع
  FOR v_consumption IN
    SELECT lot_id, quantity_consumed
    FROM fifo_lot_consumptions
    WHERE reference_type = p_reference_type
      AND reference_id = p_reference_id
    ORDER BY created_at DESC -- عكس الترتيب (LIFO للعكس)
  LOOP
    -- إرجاع الكمية للدفعة
    UPDATE fifo_cost_lots
    SET remaining_quantity = remaining_quantity + v_consumption.quantity_consumed,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = v_consumption.lot_id;
  END LOOP;

  -- حذف سجلات الاستهلاك
  DELETE FROM fifo_lot_consumptions
  WHERE reference_type = p_reference_type
    AND reference_id = p_reference_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7️⃣ دالة لترحيل البيانات الحالية (Migration)
-- تنشئ دفعات FIFO من المشتريات الموجودة
CREATE OR REPLACE FUNCTION migrate_existing_purchases_to_fifo()
RETURNS TABLE(
  products_migrated INTEGER,
  lots_created INTEGER,
  total_value NUMERIC
) AS $$
DECLARE
  v_products_count INTEGER := 0;
  v_lots_count INTEGER := 0;
  v_total_value NUMERIC := 0;
  v_purchase RECORD;
BEGIN
  -- حذف الدفعات الموجودة (إن وجدت)
  DELETE FROM fifo_lot_consumptions;
  DELETE FROM fifo_cost_lots;

  -- إنشاء دفعات من المشتريات الموجودة
  FOR v_purchase IN
    SELECT
      it.company_id,
      it.product_id,
      it.quantity_change,
      it.reference_id,
      it.branch_id,
      it.created_at::DATE as purchase_date,
      bi.unit_price,
      b.bill_date,
      p.name as product_name
    FROM inventory_transactions it
    JOIN bill_items bi ON bi.bill_id = it.reference_id AND bi.product_id = it.product_id
    JOIN bills b ON b.id = it.reference_id
    JOIN products p ON p.id = it.product_id
    WHERE it.transaction_type = 'purchase'
      AND p.item_type != 'service'
      AND it.quantity_change > 0
    ORDER BY b.bill_date ASC, it.created_at ASC
  LOOP
    -- إنشاء دفعة
    INSERT INTO fifo_cost_lots (
      company_id,
      product_id,
      lot_date,
      lot_type,
      reference_type,
      reference_id,
      original_quantity,
      remaining_quantity,
      unit_cost,
      notes,
      branch_id
    ) VALUES (
      v_purchase.company_id,
      v_purchase.product_id,
      v_purchase.bill_date,
      'purchase',
      'bill',
      v_purchase.reference_id,
      v_purchase.quantity_change,
      v_purchase.quantity_change, -- في البداية، كل الكمية متبقية
      v_purchase.unit_price,
      'Migrated from existing purchase',
      v_purchase.branch_id
    );

    v_lots_count := v_lots_count + 1;
    v_total_value := v_total_value + (v_purchase.quantity_change * v_purchase.unit_price);
  END LOOP;

  -- حساب عدد المنتجات
  SELECT COUNT(DISTINCT product_id) INTO v_products_count FROM fifo_cost_lots;

  products_migrated := v_products_count;
  lots_created := v_lots_count;
  total_value := v_total_value;

  RETURN NEXT;

  RAISE NOTICE 'Migration completed: % products, % lots, total value: %',
    v_products_count, v_lots_count, v_total_value;
END;
$$ LANGUAGE plpgsql;

-- 8️⃣ دالة لإنشاء دفعات Opening Stock
CREATE OR REPLACE FUNCTION create_opening_stock_fifo_lots(
  p_company_id UUID
)
RETURNS INTEGER AS $$
DECLARE
  v_product RECORD;
  v_lots_created INTEGER := 0;
BEGIN
  -- إنشاء دفعات من المخزون الافتتاحي
  FOR v_product IN
    SELECT
      id,
      quantity_on_hand,
      cost_price,
      name
    FROM products
    WHERE company_id = p_company_id
      AND item_type != 'service'
      AND quantity_on_hand > 0
      AND NOT EXISTS (
        SELECT 1 FROM fifo_cost_lots
        WHERE product_id = products.id
          AND lot_type = 'opening_stock'
      )
  LOOP
    INSERT INTO fifo_cost_lots (
      company_id,
      product_id,
      lot_date,
      lot_type,
      reference_type,
      reference_id,
      original_quantity,
      remaining_quantity,
      unit_cost,
      notes
    ) VALUES (
      p_company_id,
      v_product.id,
      CURRENT_DATE,
      'opening_stock',
      'opening_stock',
      NULL,
      v_product.quantity_on_hand,
      v_product.quantity_on_hand,
      v_product.cost_price,
      'Opening stock for ' || v_product.name
    );

    v_lots_created := v_lots_created + 1;
  END LOOP;

  RETURN v_lots_created;
END;
$$ LANGUAGE plpgsql;

-- 9️⃣ View لعرض ملخص دفعات FIFO لكل منتج
CREATE OR REPLACE VIEW v_fifo_lots_summary AS
SELECT
  p.id as product_id,
  p.sku,
  p.name as product_name,
  p.cost_price as current_avg_cost,
  COUNT(fcl.id) as total_lots,
  SUM(fcl.remaining_quantity) as total_remaining_qty,
  SUM(fcl.remaining_quantity * fcl.unit_cost) as total_remaining_value,
  CASE
    WHEN SUM(fcl.remaining_quantity) > 0
    THEN SUM(fcl.remaining_quantity * fcl.unit_cost) / SUM(fcl.remaining_quantity)
    ELSE 0
  END as weighted_avg_cost,
  MIN(fcl.lot_date) as oldest_lot_date,
  MAX(fcl.lot_date) as newest_lot_date
FROM products p
LEFT JOIN fifo_cost_lots fcl ON p.id = fcl.product_id AND fcl.remaining_quantity > 0
WHERE p.item_type != 'service'
GROUP BY p.id, p.sku, p.name, p.cost_price;

-- 🔟 View لعرض تفاصيل استهلاك FIFO
CREATE OR REPLACE VIEW v_fifo_consumption_details AS
SELECT
  flc.id,
  flc.consumption_date,
  flc.consumption_type,
  flc.reference_type,
  flc.reference_id,
  p.sku,
  p.name as product_name,
  flc.quantity_consumed,
  flc.unit_cost,
  flc.total_cost,
  fcl.lot_date,
  fcl.lot_type,
  CASE
    WHEN flc.reference_type = 'invoice' THEN i.invoice_number
    ELSE NULL
  END as invoice_number
FROM fifo_lot_consumptions flc
JOIN products p ON flc.product_id = p.id
JOIN fifo_cost_lots fcl ON flc.lot_id = fcl.id
LEFT JOIN invoices i ON flc.reference_type = 'invoice' AND flc.reference_id = i.id
ORDER BY flc.consumption_date DESC, flc.created_at DESC;

-- ✅ منح الصلاحيات
GRANT SELECT ON v_fifo_lots_summary TO authenticated;
GRANT SELECT ON v_fifo_consumption_details TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON fifo_cost_lots TO authenticated;
GRANT SELECT, INSERT, DELETE ON fifo_lot_consumptions TO authenticated;

-- ✅ تفعيل RLS
ALTER TABLE fifo_cost_lots ENABLE ROW LEVEL SECURITY;
ALTER TABLE fifo_lot_consumptions ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY fifo_lots_company_isolation ON fifo_cost_lots
  FOR ALL USING (company_id IN (SELECT get_user_company_ids()));

CREATE POLICY fifo_consumption_company_isolation ON fifo_lot_consumptions
  FOR ALL USING (company_id IN (SELECT get_user_company_ids()));

