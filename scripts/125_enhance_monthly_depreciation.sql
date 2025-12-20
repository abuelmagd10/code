-- =============================================
-- Enhanced Monthly Depreciation System
-- نظام الإهلاك الشهري المحسّن
-- =============================================
-- هذا السكريبت يحسّن نظام الإهلاك لضمان:
-- 1. دقة الفترات الشهرية
-- 2. توزيع منتظم للإهلاك
-- 3. عدم المساس بالأنظمة المحاسبية القائمة
-- =============================================

-- =====================================
-- 1️⃣ تحسين دالة إنشاء جدول الإهلاك
-- =====================================
-- تحسين generate_depreciation_schedule لضمان:
-- - دقة الفترات الشهرية (بداية كل شهر)
-- - توزيع منتظم للإهلاك
-- - التحقق من العمر الإنتاجي
CREATE OR REPLACE FUNCTION generate_depreciation_schedule(p_asset_id UUID)
RETURNS INTEGER AS $$
DECLARE
  v_asset RECORD;
  v_period INTEGER := 1;
  v_current_date DATE;
  v_depreciation DECIMAL(15, 2);
  v_accumulated DECIMAL(15, 2) := 0;
  v_book_value DECIMAL(15, 2);
  v_periods_count INTEGER := 0;
  v_depreciable_base DECIMAL(15, 2);
  v_monthly_depreciation DECIMAL(15, 2);
  v_last_period_depreciation DECIMAL(15, 2);
  v_remaining_months INTEGER;
BEGIN
  -- جلب بيانات الأصل
  SELECT * INTO v_asset FROM fixed_assets WHERE id = p_asset_id;

  IF v_asset IS NULL THEN
    RAISE EXCEPTION 'Asset not found: %', p_asset_id;
  END IF;

  -- التحقق من صحة البيانات
  IF v_asset.useful_life_months IS NULL OR v_asset.useful_life_months <= 0 THEN
    RAISE EXCEPTION 'Invalid useful life months: %. Must be greater than 0', v_asset.useful_life_months;
  END IF;

  IF v_asset.purchase_cost IS NULL OR v_asset.purchase_cost <= 0 THEN
    RAISE EXCEPTION 'Invalid purchase cost: %. Must be greater than 0', v_asset.purchase_cost;
  END IF;

  IF v_asset.salvage_value IS NULL OR v_asset.salvage_value < 0 THEN
    RAISE EXCEPTION 'Invalid salvage value: %. Must be greater than or equal to 0', v_asset.salvage_value;
  END IF;

  IF v_asset.salvage_value >= v_asset.purchase_cost THEN
    RAISE EXCEPTION 'Salvage value (%) cannot be greater than or equal to purchase cost (%)', 
      v_asset.salvage_value, v_asset.purchase_cost;
  END IF;

  -- حذف الجدول القديم (فقط الفترات غير المرحلة)
  DELETE FROM depreciation_schedules
  WHERE asset_id = p_asset_id AND status IN ('pending', 'approved');

  -- تهيئة القيم
  v_book_value := v_asset.purchase_cost;
  v_depreciable_base := v_asset.purchase_cost - v_asset.salvage_value;
  
  -- تحديد تاريخ البداية (بداية الشهر)
  v_current_date := DATE_TRUNC('month', v_asset.depreciation_start_date)::DATE;

  -- حساب الإهلاك الشهري للطريقة الخطية (للاستخدام في التحقق)
  IF v_asset.depreciation_method = 'straight_line' THEN
    v_monthly_depreciation := ROUND(v_depreciable_base / v_asset.useful_life_months, 2);
  END IF;

  -- إنشاء جدول الإهلاك
  WHILE v_period <= v_asset.useful_life_months LOOP
    -- حساب الإهلاك حسب الطريقة
    IF v_asset.depreciation_method = 'straight_line' THEN
      -- طريقة القسط الثابت: توزيع منتظم على جميع الفترات
      v_depreciation := v_monthly_depreciation;
      
      -- في الفترة الأخيرة، تأكد من أن الإهلاك المتبقي يصل بالضبط إلى salvage_value
      v_remaining_months := v_asset.useful_life_months - v_period + 1;
      IF v_remaining_months = 1 THEN
        -- الفترة الأخيرة: استخدم القيمة المتبقية بالضبط
        v_depreciation := v_book_value - v_asset.salvage_value;
      END IF;
      
    ELSIF v_asset.depreciation_method = 'declining_balance' THEN
      -- طريقة القسط المتناقص
      v_depreciation := calc_declining_balance_depreciation(
        v_book_value,
        v_asset.salvage_value,
        v_asset.declining_balance_rate,
        v_asset.useful_life_months,
        v_period
      );
    ELSE
      -- افتراضي: طريقة القسط الثابت
      v_depreciation := v_monthly_depreciation;
    END IF;

    -- التأكد من عدم تجاوز القيمة المتبقية
    IF (v_book_value - v_depreciation) < v_asset.salvage_value THEN
      v_depreciation := GREATEST(v_book_value - v_asset.salvage_value, 0);
    END IF;

    -- التأكد من أن الإهلاك غير سالب
    IF v_depreciation < 0 THEN
      v_depreciation := 0;
    END IF;

    -- تحديث القيم
    v_accumulated := v_accumulated + v_depreciation;
    v_book_value := v_asset.purchase_cost - v_accumulated;

    -- التأكد من أن book_value لا يقل عن salvage_value
    IF v_book_value < v_asset.salvage_value THEN
      v_book_value := v_asset.salvage_value;
      v_accumulated := v_asset.purchase_cost - v_asset.salvage_value;
    END IF;

    -- إدراج فترة الإهلاك (بداية كل شهر)
    INSERT INTO depreciation_schedules (
      company_id, asset_id, period_number, period_date,
      depreciation_amount, accumulated_depreciation, book_value, status
    ) VALUES (
      v_asset.company_id, p_asset_id, v_period, v_current_date,
      ROUND(v_depreciation, 2), ROUND(v_accumulated, 2), ROUND(v_book_value, 2), 'pending'
    );

    v_periods_count := v_periods_count + 1;
    v_period := v_period + 1;
    
    -- الانتقال إلى بداية الشهر التالي
    v_current_date := (v_current_date + INTERVAL '1 month')::DATE;
    v_current_date := DATE_TRUNC('month', v_current_date)::DATE;
    
    -- إيقاف إذا وصلنا إلى salvage_value
    IF v_book_value <= v_asset.salvage_value THEN
      EXIT;
    END IF;
  END LOOP;

  -- التحقق النهائي من دقة الإهلاك
  IF v_asset.depreciation_method = 'straight_line' THEN
    -- في طريقة القسط الثابت، يجب أن يكون book_value النهائي = salvage_value
    IF ABS(v_book_value - v_asset.salvage_value) > 0.01 THEN
      RAISE WARNING 'Final book value (%) does not match salvage value (%). Difference: %', 
        v_book_value, v_asset.salvage_value, ABS(v_book_value - v_asset.salvage_value);
    END IF;
  END IF;

  RETURN v_periods_count;
END;
$$ LANGUAGE plpgsql;

-- =====================================
-- 2️⃣ دالة لترحيل الإهلاك الشهري التلقائي
-- =====================================
-- هذه الدالة ترحل جميع فترات الإهلاك المستحقة للشهر الحالي
CREATE OR REPLACE FUNCTION auto_post_monthly_depreciation(
  p_company_id UUID,
  p_user_id UUID DEFAULT NULL
)
RETURNS TABLE(
  posted_count INTEGER,
  total_depreciation DECIMAL(15, 2),
  errors TEXT[]
) AS $$
DECLARE
  v_schedule RECORD;
  v_posted_count INTEGER := 0;
  v_total_depreciation DECIMAL(15, 2) := 0;
  v_errors TEXT[] := ARRAY[]::TEXT[];
  v_journal_id UUID;
  v_current_month_start DATE;
  v_current_month_end DATE;
BEGIN
  -- تحديد بداية ونهاية الشهر الحالي
  v_current_month_start := DATE_TRUNC('month', CURRENT_DATE)::DATE;
  v_current_month_end := (DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month' - INTERVAL '1 day')::DATE;

  -- جلب جميع فترات الإهلاك المستحقة للشهر الحالي
  FOR v_schedule IN
    SELECT ds.id, ds.asset_id, ds.period_number, ds.period_date,
           ds.depreciation_amount, ds.accumulated_depreciation, ds.book_value,
           fa.company_id, fa.name as asset_name,
           fa.depreciation_expense_account_id,
           fa.accumulated_depreciation_account_id,
           fa.salvage_value
    FROM depreciation_schedules ds
    INNER JOIN fixed_assets fa ON ds.asset_id = fa.id
    WHERE ds.company_id = p_company_id
      AND ds.status = 'approved'  -- فقط الفترات المعتمدة
      AND ds.period_date >= v_current_month_start
      AND ds.period_date <= v_current_month_end
      AND ds.period_date <= CURRENT_DATE  -- ⚠️ ERP Professional: منع ترحيل الفترات المستقبلية
      AND fa.status = 'active'  -- فقط الأصول النشطة
    ORDER BY ds.period_date, ds.period_number
  LOOP
    BEGIN
      -- ترحيل الإهلاك
      SELECT post_depreciation(v_schedule.id, COALESCE(p_user_id, auth.uid())) INTO v_journal_id;
      
      v_posted_count := v_posted_count + 1;
      v_total_depreciation := v_total_depreciation + v_schedule.depreciation_amount;
    EXCEPTION
      WHEN OTHERS THEN
        -- تسجيل الخطأ والمتابعة
        v_errors := array_append(v_errors, 
          format('Error posting schedule %s for asset %s: %s', 
            v_schedule.id, v_schedule.asset_name, SQLERRM));
    END;
  END LOOP;

  RETURN QUERY SELECT v_posted_count, v_total_depreciation, v_errors;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================
-- 3️⃣ دالة للتحقق من صحة جداول الإهلاك
-- =====================================
CREATE OR REPLACE FUNCTION validate_depreciation_schedule(p_asset_id UUID)
RETURNS TABLE(
  is_valid BOOLEAN,
  errors TEXT[]
) AS $$
DECLARE
  v_asset RECORD;
  v_schedules RECORD;
  v_errors TEXT[] := ARRAY[]::TEXT[];
  v_expected_periods INTEGER;
  v_actual_periods INTEGER;
  v_total_depreciation DECIMAL(15, 2) := 0;
  v_expected_total DECIMAL(15, 2);
  v_last_period_date DATE;
  v_current_period_date DATE;
BEGIN
  -- جلب بيانات الأصل
  SELECT * INTO v_asset FROM fixed_assets WHERE id = p_asset_id;

  IF v_asset IS NULL THEN
    RETURN QUERY SELECT FALSE, ARRAY['Asset not found']::TEXT[];
    RETURN;
  END IF;

  -- التحقق من عدد الفترات
  SELECT COUNT(*) INTO v_actual_periods
  FROM depreciation_schedules
  WHERE asset_id = p_asset_id AND status != 'cancelled';

  v_expected_periods := v_asset.useful_life_months;

  IF v_actual_periods != v_expected_periods THEN
    v_errors := array_append(v_errors, 
      format('Expected %s periods, but found %s', v_expected_periods, v_actual_periods));
  END IF;

  -- التحقق من توزيع الفترات الشهرية
  SELECT MAX(period_date) INTO v_last_period_date
  FROM depreciation_schedules
  WHERE asset_id = p_asset_id AND status != 'cancelled';

  v_current_period_date := DATE_TRUNC('month', v_asset.depreciation_start_date)::DATE;
  
  FOR v_schedules IN
    SELECT period_number, period_date
    FROM depreciation_schedules
    WHERE asset_id = p_asset_id AND status != 'cancelled'
    ORDER BY period_number
  LOOP
    -- التحقق من أن تاريخ الفترة هو بداية الشهر
    IF DATE_TRUNC('month', v_schedules.period_date)::DATE != v_schedules.period_date THEN
      v_errors := array_append(v_errors, 
        format('Period %s date (%) is not at the start of the month', 
          v_schedules.period_number, v_schedules.period_date));
    END IF;

    -- التحقق من تسلسل الفترات
    IF v_schedules.period_date != v_current_period_date THEN
      v_errors := array_append(v_errors, 
        format('Period %s date (%) does not match expected date (%)', 
          v_schedules.period_number, v_schedules.period_date, v_current_period_date));
    END IF;

    v_current_period_date := (v_current_period_date + INTERVAL '1 month')::DATE;
    v_current_period_date := DATE_TRUNC('month', v_current_period_date)::DATE;
  END LOOP;

  -- التحقق من إجمالي الإهلاك
  SELECT SUM(depreciation_amount) INTO v_total_depreciation
  FROM depreciation_schedules
  WHERE asset_id = p_asset_id AND status != 'cancelled';

  v_expected_total := v_asset.purchase_cost - v_asset.salvage_value;

  IF ABS(v_total_depreciation - v_expected_total) > 0.01 THEN
    v_errors := array_append(v_errors, 
      format('Total depreciation (%) does not match expected (%). Difference: %', 
        v_total_depreciation, v_expected_total, ABS(v_total_depreciation - v_expected_total)));
  END IF;

  RETURN QUERY SELECT (array_length(v_errors, 1) IS NULL), v_errors;
END;
$$ LANGUAGE plpgsql;

-- =====================================
-- 4️⃣ منح الصلاحيات
-- =====================================
GRANT EXECUTE ON FUNCTION generate_depreciation_schedule(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION generate_depreciation_schedule(UUID) TO anon;
GRANT EXECUTE ON FUNCTION auto_post_monthly_depreciation(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION validate_depreciation_schedule(UUID) TO authenticated;

-- =====================================
-- 5️⃣ رسالة التأكيد
-- =====================================
DO $$
BEGIN
  RAISE NOTICE '✓ Enhanced monthly depreciation system installed successfully';
  RAISE NOTICE '✓ generate_depreciation_schedule function updated';
  RAISE NOTICE '✓ auto_post_monthly_depreciation function created';
  RAISE NOTICE '✓ validate_depreciation_schedule function created';
END $$;

