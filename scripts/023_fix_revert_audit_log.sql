-- =============================================
-- إصلاح دالة التراجع عن التغييرات (Revert)
-- لمعالجة أنواع البيانات بشكل صحيح خاصة التواريخ
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
  v_column_info RECORD;
  v_cast_expr TEXT;
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
      EXECUTE format('DELETE FROM %I WHERE id = $1', v_log.target_table)
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
        -- بناء استعلام التحديث مع تحديد نوع البيانات الصحيح من الجدول
        SELECT string_agg(
          format('%I = ($1->>%L)::%s', 
            key, 
            key,
            COALESCE(
              (SELECT data_type 
               FROM information_schema.columns 
               WHERE table_name = v_log.target_table 
               AND column_name = key),
              CASE
                WHEN jsonb_typeof(v_log.old_data->key) = 'number' THEN 'numeric'
                WHEN jsonb_typeof(v_log.old_data->key) = 'boolean' THEN 'boolean'
                WHEN v_log.old_data->>key ~ '^\d{4}-\d{2}-\d{2}' THEN 'timestamp with time zone'
                ELSE 'text'
              END
            )
          ), ', ')
        INTO v_sql
        FROM jsonb_object_keys(v_log.old_data) AS key
        WHERE key NOT IN ('id', 'created_at', 'company_id', 'updated_at');

        IF v_sql IS NOT NULL THEN
          EXECUTE format('UPDATE %I SET %s WHERE id = $2', v_log.target_table, v_sql)
          USING v_log.old_data, v_log.record_id;
        END IF;

        v_result := jsonb_build_object(
          'success', true,
          'message', 'تم استرجاع البيانات السابقة',
          'action', 'REVERT_UPDATE',
          'record_id', v_log.record_id
        );
      ELSE
        v_result := jsonb_build_object('success', false, 'error', 'لا توجد بيانات سابقة للاسترجاع');
      END IF;

    WHEN 'DELETE' THEN
      -- إذا كانت العملية حذف، نعيد إدراج السجل
      IF v_log.old_data IS NOT NULL THEN
        EXECUTE format(
          'INSERT INTO %I SELECT * FROM jsonb_populate_record(null::%I, $1)',
          v_log.target_table, v_log.target_table
        ) USING v_log.old_data;

        v_result := jsonb_build_object(
          'success', true,
          'message', 'تم استعادة السجل المحذوف',
          'action', 'RESTORE',
          'record_id', v_log.record_id
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
      company_id, user_id, action, target_table, record_id,
      record_identifier, old_data, new_data
    ) VALUES (
      v_log.company_id, p_user_id, 'REVERT', v_log.target_table, v_log.record_id,
      'تراجع عن: ' || COALESCE(v_log.record_identifier, ''),
      v_log.new_data, v_log.old_data
    );
  END IF;

  RETURN v_result;
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- منح الصلاحيات
GRANT EXECUTE ON FUNCTION revert_audit_log(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION revert_audit_log(UUID, UUID) TO service_role;

