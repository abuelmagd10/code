-- =============================================
-- إعادة حساب accumulated_depreciation و book_value للأصول الثابتة
-- Recalculate Fixed Assets Depreciation
-- =============================================
-- هذا السكريبت يعيد حساب مجمع الإهلاك والقيمة الدفترية
-- بناءً على جداول الإهلاك المرحلة (posted) فقط
-- =============================================

-- =====================================
-- دالة لإعادة حساب الإهلاك لأصل معين
-- =====================================
CREATE OR REPLACE FUNCTION recalculate_asset_depreciation(p_asset_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_asset RECORD;
  v_total_posted_depreciation DECIMAL(15, 2);
  v_calculated_accumulated DECIMAL(15, 2);
  v_calculated_book_value DECIMAL(15, 2);
  v_new_status TEXT;
BEGIN
  -- جلب بيانات الأصل
  SELECT * INTO v_asset FROM fixed_assets WHERE id = p_asset_id;
  
  IF v_asset IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Asset not found'
    );
  END IF;

  -- حساب إجمالي الإهلاك من الجداول المرحلة فقط
  SELECT COALESCE(SUM(depreciation_amount), 0)
  INTO v_total_posted_depreciation
  FROM depreciation_schedules
  WHERE asset_id = p_asset_id
    AND status = 'posted';

  -- حساب مجمع الإهلاك والقيمة الدفترية
  v_calculated_accumulated := v_total_posted_depreciation;
  v_calculated_book_value := v_asset.purchase_cost - v_calculated_accumulated;

  -- التأكد من أن book_value لا يقل عن salvage_value
  IF v_calculated_book_value < v_asset.salvage_value THEN
    v_calculated_book_value := v_asset.salvage_value;
    v_calculated_accumulated := v_asset.purchase_cost - v_asset.salvage_value;
  END IF;

  -- تحديث status فقط إذا كانت الحالة active أو fully_depreciated
  -- منع الكتابة على الحالات التشغيلية (suspended, sold, disposed)
  IF v_asset.status = 'active' OR v_asset.status = 'fully_depreciated' THEN
    v_new_status := CASE
      WHEN v_calculated_book_value <= v_asset.salvage_value THEN 'fully_depreciated'
      ELSE 'active'
    END;
  ELSE
    -- الاحتفاظ بالحالة الحالية للأصول المشغلة
    v_new_status := v_asset.status;
  END IF;

  -- تحديث الأصل
  UPDATE fixed_assets
  SET
    accumulated_depreciation = ROUND(v_calculated_accumulated, 2),
    book_value = ROUND(v_calculated_book_value, 2),
    status = v_new_status,
    updated_at = CURRENT_TIMESTAMP
  WHERE id = p_asset_id;

  RETURN jsonb_build_object(
    'success', true,
    'asset_id', p_asset_id,
    'old_accumulated_depreciation', v_asset.accumulated_depreciation,
    'new_accumulated_depreciation', v_calculated_accumulated,
    'old_book_value', v_asset.book_value,
    'new_book_value', v_calculated_book_value,
    'old_status', v_asset.status,
    'new_status', v_new_status
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================
-- إعادة حساب جميع الأصول الثابتة
-- =====================================
DO $$
DECLARE
  v_asset RECORD;
  v_result JSONB;
  v_success_count INTEGER := 0;
  v_error_count INTEGER := 0;
BEGIN
  -- حلقة على جميع الأصول الثابتة
  FOR v_asset IN 
    SELECT id, name, asset_code 
    FROM fixed_assets
    ORDER BY name
  LOOP
    BEGIN
      -- إعادة حساب الإهلاك
      v_result := recalculate_asset_depreciation(v_asset.id);
      
      IF (v_result->>'success')::BOOLEAN THEN
        v_success_count := v_success_count + 1;
        RAISE NOTICE '✅ تم تحديث الأصل: % (%) - مجمع الإهلاك: % → %, القيمة الدفترية: % → %',
          v_asset.name,
          v_asset.asset_code,
          v_result->>'old_accumulated_depreciation',
          v_result->>'new_accumulated_depreciation',
          v_result->>'old_book_value',
          v_result->>'new_book_value';
      ELSE
        v_error_count := v_error_count + 1;
        RAISE WARNING '❌ فشل تحديث الأصل: % (%) - %',
          v_asset.name,
          v_asset.asset_code,
          v_result->>'error';
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_error_count := v_error_count + 1;
      RAISE WARNING '❌ خطأ عند تحديث الأصل: % (%) - %',
        v_asset.name,
        v_asset.asset_code,
        SQLERRM;
    END;
  END LOOP;

  -- تقرير نهائي
  RAISE NOTICE '========================================';
  RAISE NOTICE '✅ تم تحديث % أصل بنجاح', v_success_count;
  RAISE NOTICE '❌ فشل تحديث % أصل', v_error_count;
  RAISE NOTICE '========================================';
END $$;

-- =====================================
-- التحقق من النتائج
-- =====================================
SELECT 
  fa.id,
  fa.asset_code,
  fa.name,
  fa.purchase_cost,
  fa.accumulated_depreciation,
  fa.book_value,
  fa.status,
  COUNT(ds.id) FILTER (WHERE ds.status = 'posted') as posted_schedules_count,
  COALESCE(SUM(ds.depreciation_amount) FILTER (WHERE ds.status = 'posted'), 0) as calculated_depreciation,
  CASE 
    WHEN fa.accumulated_depreciation = COALESCE(SUM(ds.depreciation_amount) FILTER (WHERE ds.status = 'posted'), 0) 
    THEN '✅ متطابق'
    ELSE '⚠️ غير متطابق'
  END as match_status
FROM fixed_assets fa
LEFT JOIN depreciation_schedules ds ON ds.asset_id = fa.id
GROUP BY fa.id, fa.asset_code, fa.name, fa.purchase_cost, fa.accumulated_depreciation, fa.book_value, fa.status
ORDER BY fa.name;

-- =====================================
-- رسالة النجاح
-- =====================================
SELECT 'تم إعادة حساب الإهلاك لجميع الأصول الثابتة بنجاح' as status;
