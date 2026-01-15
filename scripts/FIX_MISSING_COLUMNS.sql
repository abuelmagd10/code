-- =============================================
-- إصلاح الأعمدة المفقودة
-- Fix Missing Columns
-- =============================================
-- تاريخ: 2026-01-15
-- المشكلة: 
-- 1. جدول products لا يحتوي على track_inventory و item_type
-- 2. جدول fifo_cost_lots لا يحتوي على purchase_date
-- =============================================

-- 1. إضافة الأعمدة المفقودة لجدول products
DO $$ 
BEGIN
    -- إضافة track_inventory إذا لم يكن موجوداً
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'products' AND column_name = 'track_inventory'
    ) THEN
        ALTER TABLE products ADD COLUMN track_inventory BOOLEAN DEFAULT true;
        RAISE NOTICE 'Added track_inventory column to products table';
    END IF;
    
    -- إضافة item_type إذا لم يكن موجوداً
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'products' AND column_name = 'item_type'
    ) THEN
        ALTER TABLE products ADD COLUMN item_type TEXT DEFAULT 'product';
        RAISE NOTICE 'Added item_type column to products table';
    END IF;
END $$;

-- 2. إضافة purchase_date لجدول fifo_cost_lots
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'fifo_cost_lots' AND column_name = 'purchase_date'
    ) THEN
        -- إذا كان الجدول موجود، نضيف العمود
        IF EXISTS (
            SELECT 1 FROM information_schema.tables 
            WHERE table_name = 'fifo_cost_lots'
        ) THEN
            ALTER TABLE fifo_cost_lots ADD COLUMN purchase_date DATE DEFAULT CURRENT_DATE;
            -- تحديث purchase_date من created_at للسجلات الموجودة
            UPDATE fifo_cost_lots SET purchase_date = created_at::DATE WHERE purchase_date IS NULL;
            RAISE NOTICE 'Added purchase_date column to fifo_cost_lots table';
        END IF;
    END IF;
END $$;

-- 3. تعطيل trigger الـ COGS مؤقتاً إذا كانت هناك مشاكل
-- (هذا اختياري إذا كنت لا تريد COGS تلقائي)
-- DROP TRIGGER IF EXISTS trg_auto_create_cogs_on_invoice ON invoices;

-- 4. إصلاح الدالة لاستخدام created_at بدلاً من purchase_date إذا لم يكن موجوداً
CREATE OR REPLACE FUNCTION calculate_fifo_cost(
  p_product_id UUID,
  p_warehouse_id UUID,
  p_quantity NUMERIC
) RETURNS NUMERIC AS $$
DECLARE
  v_total_cost NUMERIC := 0;
  v_remaining_qty NUMERIC := p_quantity;
  v_lot RECORD;
BEGIN
  -- جلب اللوتات حسب FIFO (الأقدم أولاً)
  -- استخدام COALESCE للتعامل مع purchase_date إذا كان موجوداً
  FOR v_lot IN 
    SELECT id, remaining_quantity, unit_cost
    FROM fifo_cost_lots
    WHERE product_id = p_product_id
      AND (warehouse_id = p_warehouse_id OR warehouse_id IS NULL)
      AND remaining_quantity > 0
    ORDER BY COALESCE(purchase_date, created_at::DATE) ASC, created_at ASC
  LOOP
    IF v_remaining_qty <= 0 THEN
      EXIT;
    END IF;
    
    DECLARE
      v_qty_from_lot NUMERIC := LEAST(v_lot.remaining_quantity, v_remaining_qty);
    BEGIN
      v_total_cost := v_total_cost + (v_qty_from_lot * v_lot.unit_cost);
      v_remaining_qty := v_remaining_qty - v_qty_from_lot;
    END;
  END LOOP;
  
  RETURN v_total_cost;
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- التحقق من التطبيق
-- =============================================
DO $$
DECLARE
  v_track_inventory_exists BOOLEAN;
  v_item_type_exists BOOLEAN;
  v_purchase_date_exists BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'products' AND column_name = 'track_inventory'
  ) INTO v_track_inventory_exists;
  
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'products' AND column_name = 'item_type'
  ) INTO v_item_type_exists;
  
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'fifo_cost_lots' AND column_name = 'purchase_date'
  ) INTO v_purchase_date_exists;
  
  RAISE NOTICE '✓ products.track_inventory: %', v_track_inventory_exists;
  RAISE NOTICE '✓ products.item_type: %', v_item_type_exists;
  RAISE NOTICE '✓ fifo_cost_lots.purchase_date: %', v_purchase_date_exists;
END $$;
