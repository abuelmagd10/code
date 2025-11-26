-- =============================================
-- نظام سجل المراجعة (Audit Log)
-- لتتبع جميع العمليات التي يقوم بها المستخدمون
-- =============================================

-- 1. إنشاء جدول سجل المراجعة
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  user_email TEXT,
  user_name TEXT,
  action TEXT NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
  table_name TEXT NOT NULL,
  record_id UUID,
  record_identifier TEXT, -- رقم الفاتورة أو اسم المنتج مثلاً
  old_data JSONB,
  new_data JSONB,
  changed_fields TEXT[], -- الحقول التي تغيرت
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. إنشاء فهارس للأداء
CREATE INDEX IF NOT EXISTS idx_audit_logs_company_id ON audit_logs(company_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_table_name ON audit_logs(table_name);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_record_id ON audit_logs(record_id);

-- 3. تفعيل RLS
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- 4. سياسة القراءة - المالك والمدير فقط
DROP POLICY IF EXISTS audit_logs_select ON audit_logs;
CREATE POLICY audit_logs_select ON audit_logs FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM company_members cm 
    WHERE cm.company_id = audit_logs.company_id 
    AND cm.user_id = auth.uid() 
    AND cm.role IN ('owner', 'admin')
  ));

-- 5. سياسة الإدراج - للنظام فقط (عبر service role)
DROP POLICY IF EXISTS audit_logs_insert ON audit_logs;
CREATE POLICY audit_logs_insert ON audit_logs FOR INSERT
  WITH CHECK (true);

-- 5.1 سياسة الحذف - المالك فقط
DROP POLICY IF EXISTS audit_logs_delete ON audit_logs;
CREATE POLICY audit_logs_delete ON audit_logs FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM company_members cm
    WHERE cm.company_id = audit_logs.company_id
    AND cm.user_id = auth.uid()
    AND cm.role = 'owner'
  ));

-- 6. دالة لإنشاء سجل المراجعة
CREATE OR REPLACE FUNCTION create_audit_log(
  p_company_id UUID,
  p_user_id UUID,
  p_action TEXT,
  p_table_name TEXT,
  p_record_id UUID,
  p_record_identifier TEXT,
  p_old_data JSONB,
  p_new_data JSONB
) RETURNS UUID AS $$
DECLARE
  v_user_email TEXT;
  v_user_name TEXT;
  v_changed_fields TEXT[];
  v_log_id UUID;
  v_key TEXT;
BEGIN
  -- جلب بيانات المستخدم
  SELECT email, raw_user_meta_data->>'full_name'
  INTO v_user_email, v_user_name
  FROM auth.users WHERE id = p_user_id;

  -- حساب الحقول التي تغيرت
  IF p_action = 'UPDATE' AND p_old_data IS NOT NULL AND p_new_data IS NOT NULL THEN
    SELECT array_agg(key)
    INTO v_changed_fields
    FROM (
      SELECT key FROM jsonb_each(p_new_data)
      EXCEPT
      SELECT key FROM jsonb_each(p_old_data) WHERE p_old_data->key = p_new_data->key
    ) changed;
  END IF;

  -- إدراج السجل
  INSERT INTO audit_logs (
    company_id, user_id, user_email, user_name,
    action, table_name, record_id, record_identifier,
    old_data, new_data, changed_fields
  ) VALUES (
    p_company_id, p_user_id, v_user_email, COALESCE(v_user_name, v_user_email),
    p_action, p_table_name, p_record_id, p_record_identifier,
    p_old_data, p_new_data, v_changed_fields
  ) RETURNING id INTO v_log_id;

  RETURN v_log_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. دالة عامة للـ Trigger
CREATE OR REPLACE FUNCTION audit_trigger_function() RETURNS TRIGGER AS $$
DECLARE
  v_company_id UUID;
  v_record_identifier TEXT;
  v_old_data JSONB;
  v_new_data JSONB;
BEGIN
  -- تحديد company_id
  IF TG_OP = 'DELETE' THEN
    v_company_id := OLD.company_id;
  ELSE
    v_company_id := NEW.company_id;
  END IF;

  -- تحديد معرف السجل (الاسم أو الرقم)
  v_record_identifier := CASE TG_TABLE_NAME
    WHEN 'invoices' THEN COALESCE(
      CASE WHEN TG_OP = 'DELETE' THEN OLD.invoice_number ELSE NEW.invoice_number END, 
      'INV'
    )
    WHEN 'bills' THEN COALESCE(
      CASE WHEN TG_OP = 'DELETE' THEN OLD.bill_number ELSE NEW.bill_number END,
      'BILL'
    )
    WHEN 'products' THEN COALESCE(
      CASE WHEN TG_OP = 'DELETE' THEN OLD.name ELSE NEW.name END,
      'PRODUCT'
    )
    WHEN 'customers' THEN COALESCE(
      CASE WHEN TG_OP = 'DELETE' THEN OLD.name ELSE NEW.name END,
      'CUSTOMER'
    )
    WHEN 'suppliers' THEN COALESCE(
      CASE WHEN TG_OP = 'DELETE' THEN OLD.name ELSE NEW.name END,
      'SUPPLIER'
    )
    WHEN 'payments' THEN COALESCE(
      CASE WHEN TG_OP = 'DELETE' THEN OLD.payment_number ELSE NEW.payment_number END,
      'PAYMENT'
    )
    WHEN 'journal_entries' THEN COALESCE(
      CASE WHEN TG_OP = 'DELETE' THEN OLD.entry_number ELSE NEW.entry_number END,
      'JE'
    )
    WHEN 'chart_of_accounts' THEN COALESCE(
      CASE WHEN TG_OP = 'DELETE' THEN OLD.account_name ELSE NEW.account_name END,
      'ACCOUNT'
    )
    WHEN 'tax_codes' THEN COALESCE(
      CASE WHEN TG_OP = 'DELETE' THEN OLD.code ELSE NEW.code END,
      'TAX'
    )
    WHEN 'estimates' THEN COALESCE(
      CASE WHEN TG_OP = 'DELETE' THEN OLD.estimate_number ELSE NEW.estimate_number END,
      'EST'
    )
    WHEN 'sales_orders' THEN COALESCE(
      CASE WHEN TG_OP = 'DELETE' THEN OLD.order_number ELSE NEW.order_number END,
      'SO'
    )
    WHEN 'purchase_orders' THEN COALESCE(
      CASE WHEN TG_OP = 'DELETE' THEN OLD.order_number ELSE NEW.order_number END,
      'PO'
    )
    WHEN 'sales_returns' THEN COALESCE(
      CASE WHEN TG_OP = 'DELETE' THEN OLD.return_number ELSE NEW.return_number END,
      'SR'
    )
    ELSE 'RECORD'
  END;

  -- تحويل البيانات إلى JSON
  IF TG_OP = 'DELETE' THEN
    v_old_data := to_jsonb(OLD);
    v_new_data := NULL;
  ELSIF TG_OP = 'INSERT' THEN
    v_old_data := NULL;
    v_new_data := to_jsonb(NEW);
  ELSE -- UPDATE
    v_old_data := to_jsonb(OLD);
    v_new_data := to_jsonb(NEW);
  END IF;

  -- إنشاء سجل المراجعة
  PERFORM create_audit_log(
    v_company_id,
    auth.uid(),
    TG_OP,
    TG_TABLE_NAME,
    CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END,
    v_record_identifier,
    v_old_data,
    v_new_data
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================
-- 8. إنشاء Triggers على الجداول الرئيسية
-- =============================================

-- Invoices
DROP TRIGGER IF EXISTS audit_invoices ON invoices;
CREATE TRIGGER audit_invoices
  AFTER INSERT OR UPDATE OR DELETE ON invoices
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

-- Bills
DROP TRIGGER IF EXISTS audit_bills ON bills;
CREATE TRIGGER audit_bills
  AFTER INSERT OR UPDATE OR DELETE ON bills
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

-- Products
DROP TRIGGER IF EXISTS audit_products ON products;
CREATE TRIGGER audit_products
  AFTER INSERT OR UPDATE OR DELETE ON products
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

-- Customers
DROP TRIGGER IF EXISTS audit_customers ON customers;
CREATE TRIGGER audit_customers
  AFTER INSERT OR UPDATE OR DELETE ON customers
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

-- Suppliers
DROP TRIGGER IF EXISTS audit_suppliers ON suppliers;
CREATE TRIGGER audit_suppliers
  AFTER INSERT OR UPDATE OR DELETE ON suppliers
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

-- Payments
DROP TRIGGER IF EXISTS audit_payments ON payments;
CREATE TRIGGER audit_payments
  AFTER INSERT OR UPDATE OR DELETE ON payments
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

-- Journal Entries
DROP TRIGGER IF EXISTS audit_journal_entries ON journal_entries;
CREATE TRIGGER audit_journal_entries
  AFTER INSERT OR UPDATE OR DELETE ON journal_entries
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

-- Chart of Accounts
DROP TRIGGER IF EXISTS audit_chart_of_accounts ON chart_of_accounts;
CREATE TRIGGER audit_chart_of_accounts
  AFTER INSERT OR UPDATE OR DELETE ON chart_of_accounts
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

-- Tax Codes
DROP TRIGGER IF EXISTS audit_tax_codes ON tax_codes;
CREATE TRIGGER audit_tax_codes
  AFTER INSERT OR UPDATE OR DELETE ON tax_codes
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

-- Estimates
DROP TRIGGER IF EXISTS audit_estimates ON estimates;
CREATE TRIGGER audit_estimates
  AFTER INSERT OR UPDATE OR DELETE ON estimates
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

-- Sales Orders
DROP TRIGGER IF EXISTS audit_sales_orders ON sales_orders;
CREATE TRIGGER audit_sales_orders
  AFTER INSERT OR UPDATE OR DELETE ON sales_orders
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

-- Purchase Orders
DROP TRIGGER IF EXISTS audit_purchase_orders ON purchase_orders;
CREATE TRIGGER audit_purchase_orders
  AFTER INSERT OR UPDATE OR DELETE ON purchase_orders
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

-- Sales Returns
DROP TRIGGER IF EXISTS audit_sales_returns ON sales_returns;
CREATE TRIGGER audit_sales_returns
  AFTER INSERT OR UPDATE OR DELETE ON sales_returns
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

-- Shareholders
DROP TRIGGER IF EXISTS audit_shareholders ON shareholders;
CREATE TRIGGER audit_shareholders
  AFTER INSERT OR UPDATE OR DELETE ON shareholders
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

-- =============================================
-- 9. دالة لجلب ملخص النشاط
-- =============================================
CREATE OR REPLACE FUNCTION get_activity_summary(
  p_company_id UUID,
  p_days INTEGER DEFAULT 7
) RETURNS TABLE (
  user_id UUID,
  user_email TEXT,
  user_name TEXT,
  total_actions BIGINT,
  inserts BIGINT,
  updates BIGINT,
  deletes BIGINT,
  last_action TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    al.user_id,
    al.user_email,
    al.user_name,
    COUNT(*) as total_actions,
    COUNT(*) FILTER (WHERE al.action = 'INSERT') as inserts,
    COUNT(*) FILTER (WHERE al.action = 'UPDATE') as updates,
    COUNT(*) FILTER (WHERE al.action = 'DELETE') as deletes,
    MAX(al.created_at) as last_action
  FROM audit_logs al
  WHERE al.company_id = p_company_id
    AND al.created_at >= NOW() - (p_days || ' days')::INTERVAL
  GROUP BY al.user_id, al.user_email, al.user_name
  ORDER BY total_actions DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- =============================================
-- 11. دالة التراجع عن التغييرات (Revert)
-- للمالك فقط
-- =============================================
CREATE OR REPLACE FUNCTION revert_audit_log(
  p_log_id UUID,
  p_user_id UUID
) RETURNS JSONB AS $$
DECLARE
  v_log RECORD;
  v_result JSONB;
  v_company_role TEXT;
  v_sql TEXT;
BEGIN
  -- جلب سجل المراجعة
  SELECT * INTO v_log FROM audit_logs WHERE id = p_log_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'السجل غير موجود');
  END IF;

  -- التحقق من صلاحية المالك
  SELECT role INTO v_company_role
  FROM company_members
  WHERE company_id = v_log.company_id AND user_id = p_user_id;

  IF v_company_role != 'owner' THEN
    RETURN jsonb_build_object('success', false, 'error', 'غير مصرح - المالك فقط يمكنه التراجع');
  END IF;

  -- تنفيذ التراجع حسب نوع العملية
  CASE v_log.action
    WHEN 'INSERT' THEN
      -- إذا كانت العملية إضافة، نحذف السجل
      EXECUTE format('DELETE FROM %I WHERE id = $1', v_log.table_name)
      USING v_log.record_id;
      v_result := jsonb_build_object(
        'success', true,
        'message', 'تم حذف السجل المضاف',
        'action', 'DELETE',
        'record_id', v_log.record_id
      );

    WHEN 'UPDATE' THEN
      -- إذا كانت العملية تعديل، نرجع البيانات القديمة
      IF v_log.old_data IS NOT NULL THEN
        -- بناء استعلام التحديث ديناميكياً
        SELECT string_agg(format('%I = $1->%L', key, key), ', ')
        INTO v_sql
        FROM jsonb_object_keys(v_log.old_data) AS key
        WHERE key != 'id' AND key != 'created_at' AND key != 'company_id';

        IF v_sql IS NOT NULL THEN
          EXECUTE format('UPDATE %I SET %s WHERE id = $2', v_log.table_name, v_sql)
          USING v_log.old_data, v_log.record_id;
        END IF;

        v_result := jsonb_build_object(
          'success', true,
          'message', 'تم استرجاع البيانات السابقة',
          'action', 'REVERT_UPDATE',
          'record_id', v_log.record_id,
          'restored_data', v_log.old_data
        );
      ELSE
        v_result := jsonb_build_object('success', false, 'error', 'لا توجد بيانات سابقة للاسترجاع');
      END IF;

    WHEN 'DELETE' THEN
      -- إذا كانت العملية حذف، نعيد إدراج السجل
      IF v_log.old_data IS NOT NULL THEN
        EXECUTE format(
          'INSERT INTO %I SELECT * FROM jsonb_populate_record(null::%I, $1)',
          v_log.table_name, v_log.table_name
        ) USING v_log.old_data;

        v_result := jsonb_build_object(
          'success', true,
          'message', 'تم استعادة السجل المحذوف',
          'action', 'RESTORE',
          'record_id', v_log.record_id,
          'restored_data', v_log.old_data
        );
      ELSE
        v_result := jsonb_build_object('success', false, 'error', 'لا توجد بيانات للاستعادة');
      END IF;

    ELSE
      v_result := jsonb_build_object('success', false, 'error', 'نوع العملية غير معروف');
  END CASE;

  -- تسجيل عملية التراجع
  IF (v_result->>'success')::boolean THEN
    INSERT INTO audit_logs (
      company_id, user_id, action, table_name, record_id,
      record_identifier, old_data, new_data
    )
    SELECT
      v_log.company_id, p_user_id, 'REVERT', v_log.table_name, v_log.record_id,
      'تراجع عن: ' || v_log.record_identifier,
      v_log.new_data, v_log.old_data;
  END IF;

  RETURN v_result;
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- إضافة REVERT كنوع عملية مسموح
ALTER TABLE audit_logs DROP CONSTRAINT IF EXISTS audit_logs_action_check;
ALTER TABLE audit_logs ADD CONSTRAINT audit_logs_action_check
  CHECK (action IN ('INSERT', 'UPDATE', 'DELETE', 'REVERT'));

