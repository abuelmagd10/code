-- =============================================
-- تحسين نظام Audit Trail الموجود
-- =============================================
-- Enhanced Audit Trail - تحسينات إضافية فقط
-- =============================================
-- ⚠️ هذا الملف يحسن النظام الموجود فقط - لا يغير البنية
-- ⚠️ This file enhances existing system only - does not change structure

BEGIN;

-- =====================================
-- 1. دالة محسّنة لتسجيل تغييرات الأسعار
-- =====================================
CREATE OR REPLACE FUNCTION audit_price_changes()
RETURNS TRIGGER AS $$
DECLARE
  v_company_id UUID;
  v_user_id UUID;
  v_old_data JSONB;
  v_new_data JSONB;
BEGIN
  v_user_id := auth.uid();
  v_company_id := NEW.company_id;

  -- التحقق من تغيير السعر
  IF OLD.unit_price IS DISTINCT FROM NEW.unit_price OR
     OLD.cost_price IS DISTINCT FROM NEW.cost_price THEN
    
    v_old_data := jsonb_build_object(
      'unit_price', OLD.unit_price,
      'cost_price', OLD.cost_price,
      'product_id', OLD.id,
      'product_name', OLD.name
    );

    v_new_data := jsonb_build_object(
      'unit_price', NEW.unit_price,
      'cost_price', NEW.cost_price,
      'product_id', NEW.id,
      'product_name', NEW.name
    );

    -- تسجيل في audit_logs
    PERFORM create_audit_log(
      v_company_id,
      v_user_id,
      'UPDATE',
      'products',
      NEW.id,
      'product_' || NEW.id::TEXT || ' - تغيير سعر',
      v_old_data,
      v_new_data
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger على products لتسجيل تغييرات الأسعار
DROP TRIGGER IF EXISTS audit_products_price_changes ON products;
CREATE TRIGGER audit_products_price_changes
AFTER UPDATE ON products
FOR EACH ROW
WHEN (
  OLD.unit_price IS DISTINCT FROM NEW.unit_price OR
  OLD.cost_price IS DISTINCT FROM NEW.cost_price
)
EXECUTE FUNCTION audit_price_changes();

-- =====================================
-- 2. دالة لتسجيل تغيير حالة المستندات
-- =====================================
CREATE OR REPLACE FUNCTION audit_status_changes()
RETURNS TRIGGER AS $$
DECLARE
  v_company_id UUID;
  v_user_id UUID;
  v_old_data JSONB;
  v_new_data JSONB;
  v_record_identifier TEXT;
BEGIN
  v_user_id := auth.uid();
  v_company_id := NEW.company_id;

  -- التحقق من تغيير الحالة
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    
    -- تحديد معرف السجل حسب نوع الجدول
    IF TG_TABLE_NAME = 'invoices' THEN
      v_record_identifier := 'invoice_' || COALESCE(NEW.invoice_number, NEW.id::TEXT);
    ELSIF TG_TABLE_NAME = 'bills' THEN
      v_record_identifier := 'bill_' || COALESCE(NEW.bill_number, NEW.id::TEXT);
    ELSIF TG_TABLE_NAME = 'purchase_orders' THEN
      v_record_identifier := 'po_' || COALESCE(NEW.po_number, NEW.id::TEXT);
    ELSE
      v_record_identifier := TG_TABLE_NAME || '_' || NEW.id::TEXT;
    END IF;

    v_old_data := jsonb_build_object(
      'status', OLD.status,
      'id', OLD.id
    );

    v_new_data := jsonb_build_object(
      'status', NEW.status,
      'id', NEW.id
    );

    -- تسجيل في audit_logs
    PERFORM create_audit_log(
      v_company_id,
      v_user_id,
      'UPDATE',
      TG_TABLE_NAME,
      NEW.id,
      v_record_identifier || ' - تغيير حالة: ' || OLD.status || ' → ' || NEW.status,
      v_old_data,
      v_new_data
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Triggers لتسجيل تغييرات الحالة
DROP TRIGGER IF EXISTS audit_invoices_status_changes ON invoices;
CREATE TRIGGER audit_invoices_status_changes
AFTER UPDATE ON invoices
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION audit_status_changes();

DROP TRIGGER IF EXISTS audit_bills_status_changes ON bills;
CREATE TRIGGER audit_bills_status_changes
AFTER UPDATE ON bills
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION audit_status_changes();

DROP TRIGGER IF EXISTS audit_purchase_orders_status_changes ON purchase_orders;
CREATE TRIGGER audit_purchase_orders_status_changes
AFTER UPDATE ON purchase_orders
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION audit_status_changes();

-- =====================================
-- 3. دالة محسّنة لتسجيل تعديلات العملاء
-- =====================================
-- تسجل كل التعديلات ما عدا حقول العنوان
CREATE OR REPLACE FUNCTION audit_customer_changes()
RETURNS TRIGGER AS $$
DECLARE
  v_company_id UUID;
  v_user_id UUID;
  v_old_data JSONB;
  v_new_data JSONB;
  v_has_non_address_changes BOOLEAN := FALSE;
BEGIN
  v_user_id := auth.uid();
  v_company_id := NEW.company_id;

  -- التحقق من وجود تغييرات في حقول غير العنوان
  IF (
    OLD.name IS DISTINCT FROM NEW.name OR
    OLD.email IS DISTINCT FROM NEW.email OR
    OLD.phone IS DISTINCT FROM NEW.phone OR
    OLD.tax_id IS DISTINCT FROM NEW.tax_id OR
    OLD.credit_limit IS DISTINCT FROM NEW.credit_limit OR
    OLD.payment_terms IS DISTINCT FROM NEW.payment_terms OR
    OLD.is_active IS DISTINCT FROM NEW.is_active
  ) THEN
    v_has_non_address_changes := TRUE;
  END IF;

  -- تسجيل فقط إذا كانت هناك تغييرات في حقول غير العنوان
  IF v_has_non_address_changes THEN
    v_old_data := jsonb_build_object(
      'name', OLD.name,
      'email', OLD.email,
      'phone', OLD.phone,
      'tax_id', OLD.tax_id,
      'credit_limit', OLD.credit_limit,
      'payment_terms', OLD.payment_terms,
      'is_active', OLD.is_active
    );

    v_new_data := jsonb_build_object(
      'name', NEW.name,
      'email', NEW.email,
      'phone', NEW.phone,
      'tax_id', NEW.tax_id,
      'credit_limit', NEW.credit_limit,
      'payment_terms', NEW.payment_terms,
      'is_active', NEW.is_active
    );

    -- تسجيل في audit_logs
    PERFORM create_audit_log(
      v_company_id,
      v_user_id,
      'UPDATE',
      'customers',
      NEW.id,
      'customer_' || COALESCE(NEW.name, NEW.id::TEXT) || ' - تعديل بيانات',
      v_old_data,
      v_new_data
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger على customers (يستبدل الـ trigger العام الموجود)
-- ملاحظة: الـ trigger العام audit_customers موجود في 022_audit_log.sql
-- هذا الـ trigger إضافي لتسجيل تفاصيل أكثر
DROP TRIGGER IF EXISTS audit_customers_detailed ON customers;
CREATE TRIGGER audit_customers_detailed
AFTER UPDATE ON customers
FOR EACH ROW
EXECUTE FUNCTION audit_customer_changes();

-- =====================================
-- 4. دالة لإنشاء تقرير Audit Trail
-- =====================================
CREATE OR REPLACE FUNCTION get_audit_trail_report(
  p_company_id UUID,
  p_start_date TIMESTAMP WITH TIME ZONE DEFAULT NOW() - INTERVAL '30 days',
  p_end_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  p_table_name TEXT DEFAULT NULL,
  p_action TEXT DEFAULT NULL
) RETURNS TABLE (
  id UUID,
  user_name TEXT,
  user_email TEXT,
  action TEXT,
  target_table TEXT,
  record_identifier TEXT,
  changed_fields TEXT[],
  created_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    al.id,
    al.user_name,
    al.user_email,
    al.action,
    al.target_table,
    al.record_identifier,
    al.changed_fields,
    al.created_at
  FROM audit_logs al
  WHERE al.company_id = p_company_id
    AND al.created_at >= p_start_date
    AND al.created_at <= p_end_date
    AND (p_table_name IS NULL OR al.target_table = p_table_name)
    AND (p_action IS NULL OR al.action = p_action)
  ORDER BY al.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================
-- 5. دالة للبحث في Audit Trail
-- =====================================
CREATE OR REPLACE FUNCTION search_audit_trail(
  p_company_id UUID,
  p_search_term TEXT,
  p_limit INTEGER DEFAULT 100
) RETURNS TABLE (
  id UUID,
  user_name TEXT,
  action TEXT,
  target_table TEXT,
  record_identifier TEXT,
  created_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    al.id,
    al.user_name,
    al.action,
    al.target_table,
    al.record_identifier,
    al.created_at
  FROM audit_logs al
  WHERE al.company_id = p_company_id
    AND (
      al.record_identifier ILIKE '%' || p_search_term || '%' OR
      al.user_name ILIKE '%' || p_search_term || '%' OR
      al.user_email ILIKE '%' || p_search_term || '%' OR
      al.target_table ILIKE '%' || p_search_term || '%'
    )
  ORDER BY al.created_at DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================
-- 6. منح الصلاحيات
-- =====================================
GRANT EXECUTE ON FUNCTION get_audit_trail_report TO authenticated;
GRANT EXECUTE ON FUNCTION search_audit_trail TO authenticated;

COMMIT;

-- =============================================
-- ملاحظات:
-- 1. هذا الملف يحسن النظام الموجود فقط
-- 2. لا يغير بنية جدول audit_logs
-- 3. يضيف تسجيل تلقائي لعمليات إضافية:
--    - تغيير أسعار المنتجات
--    - تغيير حالة المستندات
--    - تعديل بيانات العملاء (ما عدا العنوان)
-- 4. جميع التسجيلات تلقائية - لا حاجة لتسجيل يدوي
-- =============================================
