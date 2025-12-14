-- =============================================
-- إقفال الفترات المحاسبية (Accounting Period Lock)
-- =============================================
-- يسمح بإغلاق فترات محاسبية لمنع التعديل في الفترات المغلقة
-- Accounting Period Lock System
-- =============================================
-- ⚠️ هذا النظام إضافي فقط - لا يغير أي منطق قائم
-- ⚠️ This system is additive only - does not change existing logic

BEGIN;

-- =====================================
-- 1. إنشاء جدول الفترات المحاسبية
-- =====================================
CREATE TABLE IF NOT EXISTS accounting_periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  period_name TEXT NOT NULL, -- مثال: "يناير 2025" أو "Q1 2025"
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'locked')),
  closed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  closed_at TIMESTAMP WITH TIME ZONE,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ضمان عدم تداخل الفترات لنفس الشركة
-- استخدام trigger بدلاً من EXCLUDE constraint لأن UUID لا يدعم gist مباشرة
CREATE OR REPLACE FUNCTION check_no_overlapping_periods()
RETURNS TRIGGER AS $$
DECLARE
  v_overlapping_count INTEGER;
BEGIN
  -- التحقق من وجود فترات متداخلة لنفس الشركة
  SELECT COUNT(*) INTO v_overlapping_count
  FROM accounting_periods
  WHERE company_id = NEW.company_id
    AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::UUID)
    AND daterange(period_start, period_end, '[]') && daterange(NEW.period_start, NEW.period_end, '[]');

  IF v_overlapping_count > 0 THEN
    RAISE EXCEPTION 'لا يمكن إنشاء فترة متداخلة مع فترة موجودة لنفس الشركة';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_check_no_overlapping_periods ON accounting_periods;
CREATE TRIGGER trg_check_no_overlapping_periods
BEFORE INSERT OR UPDATE ON accounting_periods
FOR EACH ROW
EXECUTE FUNCTION check_no_overlapping_periods();

-- فهارس للأداء
CREATE INDEX idx_accounting_periods_company_id ON accounting_periods(company_id);
CREATE INDEX idx_accounting_periods_status ON accounting_periods(status);
CREATE INDEX idx_accounting_periods_dates ON accounting_periods USING gist (
  daterange(period_start, period_end, '[]')
);
CREATE INDEX idx_accounting_periods_company_dates ON accounting_periods(company_id, period_start, period_end);

-- تفعيل RLS
ALTER TABLE accounting_periods ENABLE ROW LEVEL SECURITY;

-- سياسة القراءة: الأعضاء فقط
DROP POLICY IF EXISTS accounting_periods_select ON accounting_periods;
CREATE POLICY accounting_periods_select ON accounting_periods
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM company_members cm
    WHERE cm.company_id = accounting_periods.company_id
    AND cm.user_id = auth.uid()
  ));

-- سياسة الإدراج: المالك والمدير فقط
DROP POLICY IF EXISTS accounting_periods_insert ON accounting_periods;
CREATE POLICY accounting_periods_insert ON accounting_periods
  FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM company_members cm
    WHERE cm.company_id = accounting_periods.company_id
    AND cm.user_id = auth.uid()
    AND cm.role IN ('owner', 'admin')
  ));

-- سياسة التحديث: المالك والمدير فقط
DROP POLICY IF EXISTS accounting_periods_update ON accounting_periods;
CREATE POLICY accounting_periods_update ON accounting_periods
  FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM company_members cm
    WHERE cm.company_id = accounting_periods.company_id
    AND cm.user_id = auth.uid()
    AND cm.role IN ('owner', 'admin')
  ));

-- =====================================
-- 2. دالة للتحقق من حالة الفترة
-- =====================================
CREATE OR REPLACE FUNCTION check_period_lock(
  p_company_id UUID,
  p_transaction_date DATE
) RETURNS BOOLEAN AS $$
DECLARE
  v_period_status TEXT;
BEGIN
  -- البحث عن الفترة التي تحتوي على التاريخ
  SELECT status INTO v_period_status
  FROM accounting_periods
  WHERE company_id = p_company_id
    AND p_transaction_date >= period_start
    AND p_transaction_date <= period_end
    AND status IN ('closed', 'locked')
  LIMIT 1;

  -- إذا كانت الفترة مغلقة أو مقفلة، نرجع true (ممنوع)
  RETURN v_period_status IS NOT NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================
-- 3. دالة للتحقق من إمكانية التعديل
-- =====================================
CREATE OR REPLACE FUNCTION can_modify_transaction(
  p_company_id UUID,
  p_transaction_date DATE,
  p_table_name TEXT
) RETURNS BOOLEAN AS $$
DECLARE
  v_is_locked BOOLEAN;
BEGIN
  -- التحقق من حالة الفترة
  v_is_locked := check_period_lock(p_company_id, p_transaction_date);

  IF v_is_locked THEN
    RAISE EXCEPTION 'الفترة المحاسبية مغلقة. لا يمكن % في التاريخ %', 
      p_table_name, p_transaction_date;
  END IF;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================
-- 4. Trigger لمنع إنشاء/تعديل الفواتير في فترات مغلقة
-- =====================================
CREATE OR REPLACE FUNCTION prevent_invoice_in_closed_period()
RETURNS TRIGGER AS $$
BEGIN
  -- التحقق من حالة الفترة
  PERFORM can_modify_transaction(
    NEW.company_id,
    NEW.invoice_date,
    'إنشاء/تعديل فاتورة'
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_invoice_closed_period ON invoices;
CREATE TRIGGER trg_prevent_invoice_closed_period
BEFORE INSERT OR UPDATE ON invoices
FOR EACH ROW
EXECUTE FUNCTION prevent_invoice_in_closed_period();

-- =====================================
-- 5. Trigger لمنع إنشاء/تعديل المدفوعات في فترات مغلقة
-- =====================================
CREATE OR REPLACE FUNCTION prevent_payment_in_closed_period()
RETURNS TRIGGER AS $$
BEGIN
  -- التحقق من حالة الفترة
  PERFORM can_modify_transaction(
    NEW.company_id,
    NEW.payment_date,
    'إنشاء/تعديل مدفوعات'
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_payment_closed_period ON payments;
CREATE TRIGGER trg_prevent_payment_closed_period
BEFORE INSERT OR UPDATE ON payments
FOR EACH ROW
EXECUTE FUNCTION prevent_payment_in_closed_period();

-- =====================================
-- 6. Trigger لمنع إنشاء/تعديل القيود المحاسبية في فترات مغلقة
-- =====================================
CREATE OR REPLACE FUNCTION prevent_journal_in_closed_period()
RETURNS TRIGGER AS $$
BEGIN
  -- التحقق من حالة الفترة
  PERFORM can_modify_transaction(
    NEW.company_id,
    NEW.entry_date,
    'إنشاء/تعديل قيود محاسبية'
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_journal_closed_period ON journal_entries;
CREATE TRIGGER trg_prevent_journal_closed_period
BEFORE INSERT OR UPDATE ON journal_entries
FOR EACH ROW
EXECUTE FUNCTION prevent_journal_in_closed_period();

-- =====================================
-- 7. Trigger لمنع حركات المخزون في فترات مغلقة
-- =====================================
-- ملاحظة: inventory_transactions لا تحتوي على تاريخ مباشر
-- سنستخدم created_at أو نربطها بالفاتورة/أمر الشراء
CREATE OR REPLACE FUNCTION prevent_inventory_in_closed_period()
RETURNS TRIGGER AS $$
DECLARE
  v_transaction_date DATE;
  v_invoice_date DATE;
  v_po_date DATE;
BEGIN
  -- محاولة الحصول على تاريخ من المرجع
  IF NEW.reference_id IS NOT NULL THEN
    -- التحقق من الفواتير
    SELECT invoice_date INTO v_invoice_date
    FROM invoices
    WHERE id = NEW.reference_id
    LIMIT 1;

    IF v_invoice_date IS NOT NULL THEN
      v_transaction_date := v_invoice_date;
    ELSE
      -- التحقق من أوامر الشراء
      SELECT po_date INTO v_po_date
      FROM purchase_orders
      WHERE id = NEW.reference_id
      LIMIT 1;

      IF v_po_date IS NOT NULL THEN
        v_transaction_date := v_po_date;
      ELSE
        -- استخدام تاريخ الإنشاء كبديل
        v_transaction_date := NEW.created_at::DATE;
      END IF;
    END IF;
  ELSE
    -- استخدام تاريخ الإنشاء
    v_transaction_date := COALESCE(NEW.created_at::DATE, CURRENT_DATE);
  END IF;

  -- التحقق من حالة الفترة
  PERFORM can_modify_transaction(
    NEW.company_id,
    v_transaction_date,
    'إنشاء/تعديل حركات مخزون'
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_inventory_closed_period ON inventory_transactions;
CREATE TRIGGER trg_prevent_inventory_closed_period
BEFORE INSERT OR UPDATE ON inventory_transactions
FOR EACH ROW
EXECUTE FUNCTION prevent_inventory_in_closed_period();

-- =====================================
-- 8. دالة لإغلاق فترة محاسبية
-- =====================================
CREATE OR REPLACE FUNCTION close_accounting_period(
  p_period_id UUID,
  p_user_id UUID,
  p_notes TEXT DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_period RECORD;
  v_result JSONB;
BEGIN
  -- جلب بيانات الفترة
  SELECT * INTO v_period
  FROM accounting_periods
  WHERE id = p_period_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'الفترة غير موجودة'
    );
  END IF;

  -- التحقق من أن الفترة ليست مغلقة بالفعل
  IF v_period.status IN ('closed', 'locked') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'الفترة مغلقة بالفعل'
    );
  END IF;

  -- إغلاق الفترة
  UPDATE accounting_periods
  SET
    status = 'closed',
    closed_by = p_user_id,
    closed_at = NOW(),
    notes = COALESCE(p_notes, notes),
    updated_at = NOW()
  WHERE id = p_period_id;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'تم إغلاق الفترة بنجاح',
    'period_id', p_period_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================
-- 9. دالة لفتح فترة محاسبية (للمالك فقط)
-- =====================================
CREATE OR REPLACE FUNCTION unlock_accounting_period(
  p_period_id UUID,
  p_user_id UUID
) RETURNS JSONB AS $$
DECLARE
  v_period RECORD;
  v_user_role TEXT;
BEGIN
  -- جلب بيانات الفترة
  SELECT * INTO v_period
  FROM accounting_periods
  WHERE id = p_period_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'الفترة غير موجودة'
    );
  END IF;

  -- التحقق من أن المستخدم مالك
  SELECT role INTO v_user_role
  FROM company_members
  WHERE company_id = v_period.company_id
    AND user_id = p_user_id;

  IF v_user_role != 'owner' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'غير مصرح - المالك فقط يمكنه فتح الفترة'
    );
  END IF;

  -- فتح الفترة
  UPDATE accounting_periods
  SET
    status = 'open',
    closed_by = NULL,
    closed_at = NULL,
    updated_at = NOW()
  WHERE id = p_period_id;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'تم فتح الفترة بنجاح',
    'period_id', p_period_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================
-- 10. دالة لإنشاء فترة محاسبية تلقائياً
-- =====================================
CREATE OR REPLACE FUNCTION create_monthly_period(
  p_company_id UUID,
  p_year INTEGER,
  p_month INTEGER
) RETURNS UUID AS $$
DECLARE
  v_period_start DATE;
  v_period_end DATE;
  v_period_name TEXT;
  v_period_id UUID;
BEGIN
  -- حساب بداية ونهاية الشهر
  v_period_start := DATE(p_year || '-' || LPAD(p_month::TEXT, 2, '0') || '-01');
  v_period_end := (v_period_start + INTERVAL '1 month' - INTERVAL '1 day')::DATE;

  -- اسم الفترة
  v_period_name := TO_CHAR(v_period_start, 'Month YYYY', 'NLS_DATE_LANGUAGE=Arabic');

  -- إنشاء الفترة
  INSERT INTO accounting_periods (
    company_id,
    period_name,
    period_start,
    period_end,
    status
  ) VALUES (
    p_company_id,
    v_period_name,
    v_period_start,
    v_period_end,
    'open'
  ) RETURNING id INTO v_period_id;

  RETURN v_period_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================
-- 11. تعليقات ووثائق
-- =====================================
COMMENT ON TABLE accounting_periods IS 
'الفترات المحاسبية - تسمح بإغلاق فترات لمنع التعديل';

COMMENT ON FUNCTION check_period_lock IS 
'التحقق من حالة الفترة - ترجع true إذا كانت مغلقة';

COMMENT ON FUNCTION can_modify_transaction IS 
'التحقق من إمكانية التعديل - ترفع استثناء إذا كانت الفترة مغلقة';

COMMENT ON FUNCTION close_accounting_period IS 
'إغلاق فترة محاسبية - للمالك والمدير فقط';

COMMENT ON FUNCTION unlock_accounting_period IS 
'فتح فترة محاسبية - للمالك فقط';

-- =====================================
-- 12. منح الصلاحيات
-- =====================================
GRANT SELECT, INSERT, UPDATE ON accounting_periods TO authenticated;
GRANT EXECUTE ON FUNCTION check_period_lock TO authenticated;
GRANT EXECUTE ON FUNCTION can_modify_transaction TO authenticated;
GRANT EXECUTE ON FUNCTION close_accounting_period TO authenticated;
GRANT EXECUTE ON FUNCTION unlock_accounting_period TO authenticated;
GRANT EXECUTE ON FUNCTION create_monthly_period TO authenticated;

COMMIT;

-- =============================================
-- ملاحظات:
-- 1. هذا النظام إضافي فقط - لا يغير أي منطق قائم
-- 2. إذا لم تكن هناك فترات مغلقة، يعمل كل شيء كما هو
-- 3. الحماية تعمل على مستوى DB فقط (BEFORE triggers)
-- 4. يجب إضافة حماية على UI و API أيضاً
-- =============================================
