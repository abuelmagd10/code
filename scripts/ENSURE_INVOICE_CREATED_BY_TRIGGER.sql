-- Trigger: ضمان created_by_user_id تلقائياً للفواتير الجديدة
-- يمنع إنشاء فواتير بدون created_by_user_id في المستقبل

-- =====================================================
-- Function: تعيين created_by_user_id تلقائياً عند إنشاء فاتورة
-- =====================================================
CREATE OR REPLACE FUNCTION ensure_invoice_created_by()
RETURNS TRIGGER AS $$
BEGIN
  -- إذا لم يكن created_by_user_id موجوداً
  IF NEW.created_by_user_id IS NULL THEN
    -- محاولة 1: من أمر البيع المرتبط
    IF NEW.sales_order_id IS NOT NULL THEN
      SELECT created_by_user_id INTO NEW.created_by_user_id
      FROM sales_orders
      WHERE id = NEW.sales_order_id
      LIMIT 1;
    END IF;
    
    -- محاولة 2: من المستخدم الحالي (auth.uid())
    IF NEW.created_by_user_id IS NULL THEN
      -- في Supabase، يمكن استخدام auth.uid() للحصول على المستخدم الحالي
      -- لكن في trigger، نستخدم auth.uid() مباشرة
      NEW.created_by_user_id := auth.uid();
    END IF;
    
    -- محاولة 3: من audit_logs (إذا كان موجوداً)
    IF NEW.created_by_user_id IS NULL THEN
      SELECT user_id INTO NEW.created_by_user_id
      FROM audit_logs
      WHERE target_table = 'invoices'
        AND action = 'INSERT'
        AND record_id = NEW.id
      ORDER BY created_at DESC
      LIMIT 1;
    END IF;
    
    -- محاولة 4: من owner/admin في الشركة (fallback أخير)
    IF NEW.created_by_user_id IS NULL THEN
      SELECT cm.user_id INTO NEW.created_by_user_id
      FROM company_members cm
      WHERE cm.company_id = NEW.company_id
        AND cm.role IN ('owner', 'admin')
      ORDER BY cm.role, cm.user_id
      LIMIT 1;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- Trigger: قبل إدراج فاتورة جديدة
-- =====================================================
DROP TRIGGER IF EXISTS trg_ensure_invoice_created_by ON invoices;
CREATE TRIGGER trg_ensure_invoice_created_by
  BEFORE INSERT ON invoices
  FOR EACH ROW
  EXECUTE FUNCTION ensure_invoice_created_by();

-- =====================================================
-- Function: ضمان created_by_user_id لأوامر البيع
-- =====================================================
CREATE OR REPLACE FUNCTION ensure_sales_order_created_by()
RETURNS TRIGGER AS $$
BEGIN
  -- إذا لم يكن created_by_user_id موجوداً
  IF NEW.created_by_user_id IS NULL THEN
    -- محاولة 1: من المستخدم الحالي (auth.uid())
    NEW.created_by_user_id := auth.uid();
    
    -- محاولة 2: من owner/admin في الشركة (fallback)
    IF NEW.created_by_user_id IS NULL THEN
      SELECT cm.user_id INTO NEW.created_by_user_id
      FROM company_members cm
      WHERE cm.company_id = NEW.company_id
        AND cm.role IN ('owner', 'admin')
      ORDER BY cm.role, cm.user_id
      LIMIT 1;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- Trigger: قبل إدراج أمر بيع جديد
-- =====================================================
DROP TRIGGER IF EXISTS trg_ensure_sales_order_created_by ON sales_orders;
CREATE TRIGGER trg_ensure_sales_order_created_by
  BEFORE INSERT ON sales_orders
  FOR EACH ROW
  EXECUTE FUNCTION ensure_sales_order_created_by();

-- =====================================================
-- التحقق من نجاح إنشاء الـ triggers
-- =====================================================
SELECT 
  'Triggers created successfully' as status,
  tgname as trigger_name,
  tgrelid::regclass as table_name
FROM pg_trigger
WHERE tgname IN ('trg_ensure_invoice_created_by', 'trg_ensure_sales_order_created_by')
ORDER BY tgname;
