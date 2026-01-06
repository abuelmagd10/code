-- =====================================================
-- Migration: إنشاء Vendor Credits للمرتجعات الموجودة
-- Create Vendor Credits for existing purchase returns
-- =====================================================

-- هذا السكريبت يقوم بـ:
-- 1. البحث عن جميع مرتجعات المشتريات الموجودة
-- 2. التحقق من حالة الفاتورة المرتبطة (Paid/Partially Paid)
-- 3. إنشاء Vendor Credits مقابلة للمرتجعات التي تستوفي الشروط
-- 4. منع الازدواج (عدم إنشاء vendor_credit إذا كان موجوداً مسبقاً)

DO $$
DECLARE
  v_return RECORD;
  v_bill RECORD;
  v_credit_number VARCHAR(50);
  v_vendor_credit_id UUID;
  v_item RECORD;
  v_count INTEGER := 0;
  v_skipped INTEGER := 0;
BEGIN
  RAISE NOTICE '🔄 Starting migration of existing purchase returns to vendor credits...';
  
  -- حلقة على جميع مرتجعات المشتريات
  FOR v_return IN 
    SELECT 
      pr.id,
      pr.company_id,
      pr.supplier_id,
      pr.bill_id,
      pr.return_number,
      pr.return_date,
      pr.subtotal,
      pr.tax_amount,
      pr.total_amount,
      pr.journal_entry_id,
      pr.original_currency,
      pr.original_subtotal,
      pr.original_tax_amount,
      pr.original_total_amount,
      pr.exchange_rate_used,
      pr.exchange_rate_id,
      pr.status
    FROM purchase_returns pr
    WHERE pr.bill_id IS NOT NULL  -- فقط المرتجعات المرتبطة بفاتورة
      AND pr.status = 'completed'  -- فقط المرتجعات المكتملة
    ORDER BY pr.return_date, pr.created_at
  LOOP
    -- التحقق من وجود vendor_credit مسبق
    IF EXISTS (
      SELECT 1 FROM vendor_credits 
      WHERE source_purchase_return_id = v_return.id
    ) THEN
      RAISE NOTICE '⏭️  Skipping return % - Vendor Credit already exists', v_return.return_number;
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;
    
    -- جلب معلومات الفاتورة
    SELECT 
      b.id,
      b.status,
      b.branch_id,
      b.cost_center_id,
      b.warehouse_id,
      b.paid_amount,
      b.total_amount
    INTO v_bill
    FROM bills b
    WHERE b.id = v_return.bill_id;
    
    -- التحقق من حالة الفاتورة: فقط Paid أو Partially Paid
    IF v_bill.status NOT IN ('paid', 'partially_paid') THEN
      RAISE NOTICE '⏭️  Skipping return % - Bill status is % (not Paid/Partially Paid)', 
        v_return.return_number, v_bill.status;
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;
    
    -- إنشاء رقم إشعار دائن
    v_credit_number := 'VC-' || REPLACE(v_return.return_number, 'PRET-', '');
    
    -- إنشاء Vendor Credit
    INSERT INTO vendor_credits (
      company_id,
      supplier_id,
      bill_id,
      source_purchase_invoice_id,
      source_purchase_return_id,
      credit_number,
      credit_date,
      subtotal,
      tax_amount,
      total_amount,
      applied_amount,
      status,
      reference_type,
      reference_id,
      journal_entry_id,
      branch_id,
      cost_center_id,
      notes,
      original_currency,
      original_subtotal,
      original_tax_amount,
      original_total_amount,
      exchange_rate_used,
      exchange_rate_id,
      created_at,
      updated_at
    ) VALUES (
      v_return.company_id,
      v_return.supplier_id,
      v_return.bill_id,
      v_return.bill_id,
      v_return.id,
      v_credit_number,
      v_return.return_date,
      v_return.subtotal,
      v_return.tax_amount,
      v_return.total_amount,
      0,  -- applied_amount
      'open',  -- status
      'purchase_return',
      v_return.id,
      v_return.journal_entry_id,
      v_bill.branch_id,
      v_bill.cost_center_id,
      'إشعار دائن تلقائي من مرتجع المشتريات ' || v_return.return_number || ' (Migration)',
      COALESCE(v_return.original_currency, 'EGP'),
      COALESCE(v_return.original_subtotal, v_return.subtotal),
      COALESCE(v_return.original_tax_amount, v_return.tax_amount),
      COALESCE(v_return.original_total_amount, v_return.total_amount),
      COALESCE(v_return.exchange_rate_used, 1),
      v_return.exchange_rate_id,
      NOW(),
      NOW()
    )
    RETURNING id INTO v_vendor_credit_id;
    
    -- إنشاء بنود Vendor Credit من بنود المرتجع
    INSERT INTO vendor_credit_items (
      vendor_credit_id,
      product_id,
      description,
      quantity,
      unit_price,
      tax_rate,
      discount_percent,
      line_total,
      created_at
    )
    SELECT
      v_vendor_credit_id,
      pri.product_id,
      pri.description,
      pri.quantity,
      pri.unit_price,
      pri.tax_rate,
      pri.discount_percent,
      pri.line_total,
      NOW()
    FROM purchase_return_items pri
    WHERE pri.purchase_return_id = v_return.id;
    
    v_count := v_count + 1;
    RAISE NOTICE '✅ Created Vendor Credit % for return % (Bill: %, Status: %)', 
      v_credit_number, v_return.return_number, v_bill.status, 'open';
      
  END LOOP;
  
  RAISE NOTICE '✅ Migration completed: % vendor credits created, % skipped', v_count, v_skipped;
  
END $$;

