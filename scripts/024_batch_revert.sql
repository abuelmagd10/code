-- =============================================
-- نظام التراجع الشامل (Batch Revert)
-- لإلغاء مجموعة عمليات مرتبطة دفعة واحدة
-- =============================================

-- 1. إضافة عمود batch_id لربط العمليات المرتبطة
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS batch_id UUID;
CREATE INDEX IF NOT EXISTS idx_audit_logs_batch_id ON audit_logs(batch_id);

-- 2. إضافة عمود parent_record_id لربط العمليات الفرعية بالعملية الرئيسية
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS parent_record_id UUID;
CREATE INDEX IF NOT EXISTS idx_audit_logs_parent_record_id ON audit_logs(parent_record_id);

-- 3. دالة للحصول على جميع السجلات المرتبطة بسجل معين
CREATE OR REPLACE FUNCTION get_related_audit_logs(
  p_log_id UUID
) RETURNS TABLE (
  id UUID,
  action TEXT,
  target_table TEXT,
  record_id UUID,
  record_identifier TEXT,
  created_at TIMESTAMPTZ,
  relation_type TEXT
) AS $$
DECLARE
  v_log RECORD;
  v_batch_id UUID;
  v_record_id UUID;
  v_table_name TEXT;
BEGIN
  -- جلب السجل الأصلي
  SELECT * INTO v_log FROM audit_logs al WHERE al.id = p_log_id;
  IF NOT FOUND THEN RETURN; END IF;
  
  v_batch_id := v_log.batch_id;
  v_record_id := v_log.record_id;
  v_table_name := v_log.target_table;
  
  -- إرجاع السجلات المرتبطة بنفس batch_id
  IF v_batch_id IS NOT NULL THEN
    RETURN QUERY
    SELECT al.id, al.action, al.target_table, al.record_id,
           al.record_identifier, al.created_at, 'batch'::TEXT as relation_type
    FROM audit_logs al
    WHERE al.batch_id = v_batch_id
    ORDER BY al.created_at DESC;
  ELSE
    -- البحث عن جميع السجلات المرتبطة بأي طريقة
    RETURN QUERY
    WITH RECURSIVE related AS (
      -- السجل الأصلي
      SELECT al.id, al.action, al.target_table, al.record_id,
             al.record_identifier, al.created_at, 'main'::TEXT as relation_type,
             al.new_data, al.old_data
      FROM audit_logs al WHERE al.id = p_log_id

      UNION ALL

      -- السجلات المرتبطة (INSERT, UPDATE, DELETE)
      SELECT al.id, al.action, al.target_table, al.record_id,
             al.record_identifier, al.created_at, 'child'::TEXT as relation_type,
             al.new_data, al.old_data
      FROM audit_logs al, related r
      WHERE al.id != r.id
        AND al.company_id = v_log.company_id
        AND al.created_at BETWEEN v_log.created_at - INTERVAL '10 seconds'
                              AND v_log.created_at + INTERVAL '10 seconds'
        AND (
          -- القيود المرتبطة (INSERT/UPDATE: new_data, DELETE: old_data)
          (al.target_table = 'journal_entries'
           AND (COALESCE(al.new_data->>'reference_id', al.old_data->>'reference_id')::UUID = v_record_id))
          OR
          -- عناصر الفاتورة
          (al.target_table = 'invoice_items'
           AND (COALESCE(al.new_data->>'invoice_id', al.old_data->>'invoice_id')::UUID = v_record_id))
          OR
          -- عناصر فاتورة المشتريات
          (al.target_table = 'bill_items'
           AND (COALESCE(al.new_data->>'bill_id', al.old_data->>'bill_id')::UUID = v_record_id))
          OR
          -- خطوط القيود
          (al.target_table = 'journal_entry_lines'
           AND (COALESCE(al.new_data->>'journal_entry_id', al.old_data->>'journal_entry_id')::UUID = r.record_id)
           AND r.target_table = 'journal_entries')
          OR
          -- حركات المخزون
          (al.target_table = 'inventory_transactions'
           AND (COALESCE(al.new_data->>'reference_id', al.old_data->>'reference_id')::UUID = v_record_id))
          OR
          -- المدفوعات المرتبطة
          (al.target_table = 'payments'
           AND (COALESCE(al.new_data->>'invoice_id', al.old_data->>'invoice_id')::UUID = v_record_id
                OR COALESCE(al.new_data->>'bill_id', al.old_data->>'bill_id')::UUID = v_record_id))
          OR
          -- عناصر عروض الأسعار
          (al.target_table = 'estimate_items'
           AND (COALESCE(al.new_data->>'estimate_id', al.old_data->>'estimate_id')::UUID = v_record_id))
          OR
          -- عناصر أوامر البيع
          (al.target_table = 'sales_order_items'
           AND (COALESCE(al.new_data->>'sales_order_id', al.old_data->>'sales_order_id')::UUID = v_record_id))
          OR
          -- عناصر أوامر الشراء
          (al.target_table = 'purchase_order_items'
           AND (COALESCE(al.new_data->>'purchase_order_id', al.old_data->>'purchase_order_id')::UUID = v_record_id))
          OR
          -- أي سجل يشير لنفس record_id (INSERT/UPDATE/DELETE)
          (COALESCE(al.new_data->>'reference_id', al.old_data->>'reference_id')::UUID = v_record_id)
          OR
          -- أي سجل تم بواسطة نفس المستخدم في نفس الوقت تقريباً
          (al.user_id = v_log.user_id
           AND al.created_at BETWEEN v_log.created_at - INTERVAL '2 seconds'
                                 AND v_log.created_at + INTERVAL '2 seconds')
        )
    )
    SELECT DISTINCT r.id, r.action, r.target_table, r.record_id,
           r.record_identifier, r.created_at, r.relation_type
    FROM related r
    ORDER BY r.created_at DESC;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. دالة التراجع الشامل
CREATE OR REPLACE FUNCTION revert_batch_operations(
  p_log_id UUID,
  p_user_id UUID
) RETURNS JSONB AS $$
DECLARE
  v_log RECORD;
  v_related RECORD;
  v_company_role TEXT;
  v_reverted_count INT := 0;
  v_errors TEXT[] := ARRAY[]::TEXT[];
  v_result JSONB;
  v_batch_id UUID;
BEGIN
  -- جلب السجل الأصلي
  SELECT * INTO v_log FROM audit_logs WHERE id = p_log_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'السجل غير موجود');
  END IF;

  -- التحقق من صلاحية المالك
  SELECT role INTO v_company_role
  FROM company_members
  WHERE company_id = v_log.company_id AND user_id = p_user_id;

  IF v_company_role != 'owner' THEN
    RETURN jsonb_build_object('success', false, 'error', 'غير مصرح - المالك فقط');
  END IF;

  -- إنشاء batch_id جديد لعملية التراجع
  v_batch_id := gen_random_uuid();

  -- التراجع عن جميع السجلات المرتبطة بترتيب عكسي
  FOR v_related IN
    SELECT * FROM get_related_audit_logs(p_log_id) ORDER BY created_at DESC
  LOOP
    BEGIN
      -- تنفيذ التراجع حسب نوع العملية
      CASE v_related.action
        WHEN 'INSERT' THEN
          EXECUTE format('DELETE FROM %I WHERE id = $1', v_related.target_table)
          USING v_related.record_id;
          v_reverted_count := v_reverted_count + 1;

        WHEN 'UPDATE' THEN
          -- استعادة البيانات القديمة
          DECLARE
            v_old_data JSONB;
            v_sql TEXT;
          BEGIN
            SELECT old_data INTO v_old_data FROM audit_logs WHERE id = v_related.id;
            IF v_old_data IS NOT NULL THEN
              SELECT string_agg(
                format('%I = ($1->>%L)::%s', key, key,
                  COALESCE(
                    (SELECT data_type FROM information_schema.columns
                     WHERE table_name = v_related.target_table AND column_name = key),
                    'text'
                  )
                ), ', ')
              INTO v_sql
              FROM jsonb_object_keys(v_old_data) AS key
              WHERE key NOT IN ('id', 'created_at', 'company_id', 'updated_at');

              IF v_sql IS NOT NULL THEN
                EXECUTE format('UPDATE %I SET %s WHERE id = $2', v_related.target_table, v_sql)
                USING v_old_data, v_related.record_id;
                v_reverted_count := v_reverted_count + 1;
              END IF;
            END IF;
          END;

        WHEN 'DELETE' THEN
          -- استعادة السجل المحذوف
          DECLARE
            v_old_data JSONB;
          BEGIN
            SELECT old_data INTO v_old_data FROM audit_logs WHERE id = v_related.id;
            IF v_old_data IS NOT NULL THEN
              EXECUTE format(
                'INSERT INTO %I SELECT * FROM jsonb_populate_record(null::%I, $1)',
                v_related.target_table, v_related.target_table
              ) USING v_old_data;
              v_reverted_count := v_reverted_count + 1;
            END IF;
          END;

        ELSE
          NULL; -- تخطي REVERT وغيرها
      END CASE;

    EXCEPTION WHEN OTHERS THEN
      v_errors := array_append(v_errors, v_related.target_table || ': ' || SQLERRM);
    END;
  END LOOP;

  -- تسجيل عملية التراجع الشامل
  INSERT INTO audit_logs (
    company_id, user_id, action, target_table, record_id,
    record_identifier, batch_id, old_data
  ) VALUES (
    v_log.company_id, p_user_id, 'REVERT', 'batch_revert', p_log_id,
    'تراجع شامل: ' || v_reverted_count || ' عملية',
    v_batch_id,
    jsonb_build_object('original_log_id', p_log_id, 'reverted_count', v_reverted_count)
  );

  -- إرجاع النتيجة
  IF array_length(v_errors, 1) > 0 THEN
    RETURN jsonb_build_object(
      'success', true,
      'partial', true,
      'message', 'تم التراجع عن ' || v_reverted_count || ' عملية مع بعض الأخطاء',
      'reverted_count', v_reverted_count,
      'errors', to_jsonb(v_errors)
    );
  ELSE
    RETURN jsonb_build_object(
      'success', true,
      'message', 'تم التراجع الشامل عن ' || v_reverted_count || ' عملية بنجاح',
      'reverted_count', v_reverted_count
    );
  END IF;

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- منح الصلاحيات
GRANT EXECUTE ON FUNCTION get_related_audit_logs(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_related_audit_logs(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION revert_batch_operations(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION revert_batch_operations(UUID, UUID) TO service_role;

