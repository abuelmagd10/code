-- ════════════════════════════════════════════════════════════════════
-- PHASE 2: حماية العمليات من التكرار والفشل
-- Operations Protection: Idempotency + Atomic Payroll + Period Lock
-- ════════════════════════════════════════════════════════════════════
-- التاريخ: 2026-02-21
-- المرحلة: 2 من 4

-- ────────────────────────────────────────────────────────────────────
-- 1. جدول Idempotency Keys
--    يمنع تكرار العمليات المالية (Double Submission)
-- ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.idempotency_keys (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  idempotency_key TEXT NOT NULL,
  company_id      UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  operation_type  TEXT NOT NULL, -- 'invoice_post' | 'payment_create' | 'payroll_pay' | 'commission_pay'
  status          TEXT NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'completed', 'failed')),
  request_hash    TEXT,          -- hash of the request body for validation
  response_data   JSONB,         -- stored response to replay on duplicate
  created_by      UUID,
  created_at      TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  completed_at    TIMESTAMPTZ,
  expires_at      TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '24 hours') NOT NULL
);

-- فهرس فريد: لا يسمح بنفس المفتاح لنفس العملية في نفس الشركة
CREATE UNIQUE INDEX IF NOT EXISTS idx_idempotency_keys_unique
  ON public.idempotency_keys (idempotency_key, company_id, operation_type)
  WHERE status IN ('processing', 'completed');

-- فهرس للتنظيف التلقائي (cleanup بعد الانتهاء)
CREATE INDEX IF NOT EXISTS idx_idempotency_keys_expires
  ON public.idempotency_keys (expires_at)
  WHERE status IN ('completed', 'failed');

CREATE INDEX IF NOT EXISTS idx_idempotency_keys_company
  ON public.idempotency_keys (company_id, operation_type, created_at DESC);

-- ────────────────────────────────────────────────────────────────────
-- 2. دالة: check_and_claim_idempotency_key
--    تتحقق من وجود المفتاح وتُعيد:
--    - NULL إذا كانت العملية جديدة (يجب تنفيذها)
--    - JSONB إذا كانت مكتملة مسبقاً (يُعاد الرد المخزن)
--    - يرفع استثناء إذا كانت في معالجة (in-flight)
-- ────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.check_and_claim_idempotency_key(
  p_idempotency_key  TEXT,
  p_company_id       UUID,
  p_operation_type   TEXT,
  p_request_hash     TEXT DEFAULT NULL,
  p_created_by       UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_existing RECORD;
  v_new_id   UUID;
BEGIN
  -- البحث عن مفتاح موجود
  SELECT id, status, response_data, created_at, request_hash
  INTO v_existing
  FROM public.idempotency_keys
  WHERE idempotency_key = p_idempotency_key
    AND company_id = p_company_id
    AND operation_type = p_operation_type
  LIMIT 1;

  -- إذا وُجد المفتاح
  IF FOUND THEN
    -- إذا كانت العملية مكتملة → أعد الرد المخزن
    IF v_existing.status = 'completed' THEN
      RETURN jsonb_build_object(
        'cached', TRUE,
        'status', 'completed',
        'response', v_existing.response_data,
        'original_at', v_existing.created_at
      );
    END IF;

    -- إذا كانت العملية في معالجة → رفض (منع التكرار المتزامن)
    IF v_existing.status = 'processing' THEN
      -- إذا كانت قديمة أكثر من 5 دقائق، اعتبرها فاشلة
      IF v_existing.created_at < NOW() - INTERVAL '5 minutes' THEN
        UPDATE public.idempotency_keys
        SET status = 'failed', completed_at = NOW()
        WHERE id = v_existing.id;
      ELSE
        RAISE EXCEPTION 'IDEMPOTENCY_IN_FLIGHT: العملية جارية بالفعل. انتظر اكتمالها. Key: %', p_idempotency_key
          USING ERRCODE = 'P0001';
      END IF;
    END IF;

    -- إذا كانت فاشلة → اسمح بإعادة المحاولة (أنشئ جديدة)
    IF v_existing.status = 'failed' THEN
      DELETE FROM public.idempotency_keys WHERE id = v_existing.id;
    END IF;
  END IF;

  -- إنشاء مفتاح جديد والمطالبة به
  INSERT INTO public.idempotency_keys
    (idempotency_key, company_id, operation_type, status, request_hash, created_by)
  VALUES
    (p_idempotency_key, p_company_id, p_operation_type, 'processing', p_request_hash, p_created_by)
  RETURNING id INTO v_new_id;

  -- أعد NULL للدلالة على أن العملية جديدة يجب تنفيذها
  RETURN NULL;
END;
$$;

-- ────────────────────────────────────────────────────────────────────
-- 3. دالة: complete_idempotency_key
--    تُخزّن نتيجة العملية بعد نجاحها
-- ────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.complete_idempotency_key(
  p_idempotency_key TEXT,
  p_company_id      UUID,
  p_operation_type  TEXT,
  p_response_data   JSONB,
  p_success         BOOLEAN DEFAULT TRUE
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.idempotency_keys
  SET
    status = CASE WHEN p_success THEN 'completed' ELSE 'failed' END,
    response_data = p_response_data,
    completed_at = NOW()
  WHERE idempotency_key = p_idempotency_key
    AND company_id = p_company_id
    AND operation_type = p_operation_type
    AND status = 'processing';
END;
$$;

-- ────────────────────────────────────────────────────────────────────
-- 4. RPC: post_payroll_atomic
--    صرف الرواتب في معاملة واحدة ذرية كاملة
--    يتحقق من: Period Lock + تكرار الصرف + الأرصدة
-- ────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.post_payroll_atomic(
  p_company_id        UUID,
  p_payroll_run_id    UUID,
  p_payment_account_id UUID,
  p_expense_account_id UUID,
  p_payment_date      DATE,
  p_year              INT,
  p_month             INT,
  p_created_by        UUID,
  p_idempotency_key   TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_total           NUMERIC(15,2) := 0;
  v_entry_id        UUID;
  v_period_locked   BOOLEAN := FALSE;
  v_period_name     TEXT;
  v_existing_entry  UUID;
  v_idempotency_result JSONB;
  v_description     TEXT;
BEGIN
  -- ── 1. التحقق من Idempotency (منع التكرار)
  IF p_idempotency_key IS NOT NULL THEN
    v_idempotency_result := public.check_and_claim_idempotency_key(
      p_idempotency_key,
      p_company_id,
      'payroll_pay',
      NULL,
      p_created_by
    );

    -- إذا كانت العملية مكتملة مسبقاً → أعد الرد المخزن
    IF v_idempotency_result IS NOT NULL AND (v_idempotency_result->>'cached')::BOOLEAN THEN
      RETURN v_idempotency_result->'response';
    END IF;
  END IF;

  -- ── 2. التحقق من Period Lock
  SELECT EXISTS (
    SELECT 1 FROM public.accounting_periods
    WHERE company_id = p_company_id
      AND p_payment_date BETWEEN period_start AND period_end
      AND (is_locked = TRUE OR status IN ('closed', 'locked'))
  ) INTO v_period_locked;

  IF v_period_locked THEN
    SELECT period_name INTO v_period_name
    FROM public.accounting_periods
    WHERE company_id = p_company_id
      AND p_payment_date BETWEEN period_start AND period_end
      AND (is_locked = TRUE OR status IN ('closed', 'locked'))
    LIMIT 1;

    IF p_idempotency_key IS NOT NULL THEN
      PERFORM public.complete_idempotency_key(
        p_idempotency_key, p_company_id, 'payroll_pay',
        jsonb_build_object('error', 'PERIOD_LOCKED', 'period', v_period_name),
        FALSE
      );
    END IF;

    RAISE EXCEPTION 'PERIOD_LOCKED: الفترة المحاسبية "%" مقفلة. لا يمكن صرف الرواتب.', COALESCE(v_period_name, p_payment_date::TEXT)
      USING ERRCODE = 'P0002';
  END IF;

  -- ── 3. التحقق من عدم الصرف المسبق (منع التكرار على المرجع)
  SELECT id INTO v_existing_entry
  FROM public.journal_entries
  WHERE company_id = p_company_id
    AND reference_type = 'payroll_payment'
    AND reference_id = p_payroll_run_id
    AND (is_deleted IS NULL OR is_deleted = FALSE)
    AND deleted_at IS NULL
  LIMIT 1;

  IF v_existing_entry IS NOT NULL THEN
    IF p_idempotency_key IS NOT NULL THEN
      PERFORM public.complete_idempotency_key(
        p_idempotency_key, p_company_id, 'payroll_pay',
        jsonb_build_object('ok', TRUE, 'entry_id', v_existing_entry, 'cached', TRUE),
        TRUE
      );
    END IF;
    RETURN jsonb_build_object(
      'ok', TRUE,
      'entry_id', v_existing_entry,
      'message', 'تم صرف هذه الدفعة مسبقاً',
      'idempotent', TRUE
    );
  END IF;

  -- ── 4. حساب إجمالي الرواتب
  SELECT COALESCE(SUM(net_salary), 0)
  INTO v_total
  FROM public.payslips
  WHERE company_id = p_company_id
    AND payroll_run_id = p_payroll_run_id;

  IF v_total <= 0 THEN
    IF p_idempotency_key IS NOT NULL THEN
      PERFORM public.complete_idempotency_key(
        p_idempotency_key, p_company_id, 'payroll_pay',
        jsonb_build_object('error', 'NO_PAYSLIPS'),
        FALSE
      );
    END IF;
    RAISE EXCEPTION 'NO_PAYSLIPS: لا توجد كشوف مرتبات للصرف لهذه الدفعة'
      USING ERRCODE = 'P0003';
  END IF;

  -- ── 5. إنشاء القيد المحاسبي (Header)
  v_description := format('صرف مرتبات %s-%s', p_year, LPAD(p_month::TEXT, 2, '0'));

  INSERT INTO public.journal_entries (
    company_id, entry_date, description,
    reference_type, reference_id,
    status, created_by
  ) VALUES (
    p_company_id, p_payment_date, v_description,
    'payroll_payment', p_payroll_run_id,
    'posted', p_created_by
  )
  RETURNING id INTO v_entry_id;

  -- ── 6. إنشاء سطور القيد (مدين: مصاريف رواتب، دائن: حساب الدفع)
  INSERT INTO public.journal_entry_lines
    (journal_entry_id, account_id, debit_amount, credit_amount, description)
  VALUES
    (v_entry_id, p_expense_account_id, v_total, 0,      'مرتبات موظفين - حساب 6110'),
    (v_entry_id, p_payment_account_id, 0,       v_total, 'صرف من الحساب');

  -- ── 7. تحديث حالة دفعة الرواتب إلى 'paid'
  UPDATE public.payroll_runs
  SET status = 'paid', updated_at = NOW()
  WHERE id = p_payroll_run_id
    AND company_id = p_company_id;

  -- ── 8. تخزين نتيجة Idempotency
  IF p_idempotency_key IS NOT NULL THEN
    PERFORM public.complete_idempotency_key(
      p_idempotency_key, p_company_id, 'payroll_pay',
      jsonb_build_object('ok', TRUE, 'entry_id', v_entry_id, 'total', v_total),
      TRUE
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', TRUE,
    'entry_id', v_entry_id,
    'total', v_total,
    'description', v_description
  );

EXCEPTION
  WHEN OTHERS THEN
    -- في حالة الفشل، حدّث حالة Idempotency
    IF p_idempotency_key IS NOT NULL THEN
      BEGIN
        PERFORM public.complete_idempotency_key(
          p_idempotency_key, p_company_id, 'payroll_pay',
          jsonb_build_object('error', SQLERRM),
          FALSE
        );
      EXCEPTION WHEN OTHERS THEN NULL;
      END;
    END IF;
    RAISE;
END;
$$;

-- ────────────────────────────────────────────────────────────────────
-- 5. دالة: check_period_lock_for_date
--    دالة مساعدة للتحقق من Period Lock من التطبيق
-- ────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.check_period_lock_for_date(
  p_company_id UUID,
  p_date       DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  v_period RECORD;
BEGIN
  SELECT id, period_name, period_start, period_end, status, is_locked
  INTO v_period
  FROM public.accounting_periods
  WHERE company_id = p_company_id
    AND p_date BETWEEN period_start AND period_end
    AND (is_locked = TRUE OR status IN ('closed', 'locked'))
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'is_locked', TRUE,
      'period_id', v_period.id,
      'period_name', v_period.period_name,
      'period_start', v_period.period_start,
      'period_end', v_period.period_end,
      'status', v_period.status
    );
  END IF;

  RETURN jsonb_build_object('is_locked', FALSE);
END;
$$;

-- ────────────────────────────────────────────────────────────────────
-- 6. دالة: can_close_accounting_year
--    يمنع الإقفال السنوي إذا فشل أي اختبار محاسبي حرج
-- ────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.can_close_accounting_year(
  p_company_id UUID,
  p_year       INT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  v_unbalanced_count   INT := 0;
  v_duplicate_count    INT := 0;
  v_open_periods_count INT := 0;
  v_blocking_issues    JSONB[] := '{}';
  v_warnings           JSONB[] := '{}';
BEGIN
  -- ── اختبار 1: لا توجد قيود غير متوازنة
  SELECT COUNT(*) INTO v_unbalanced_count
  FROM (
    SELECT je.id FROM public.journal_entries je
    LEFT JOIN public.journal_entry_lines jel ON jel.journal_entry_id = je.id
    WHERE je.company_id = p_company_id
      AND je.status = 'posted'
      AND (je.is_deleted IS NULL OR je.is_deleted = FALSE)
      AND je.deleted_at IS NULL
      AND EXTRACT(YEAR FROM je.entry_date) = p_year
    GROUP BY je.id
    HAVING ABS(COALESCE(SUM(jel.debit_amount),0) - COALESCE(SUM(jel.credit_amount),0)) > 0.01
  ) u;

  IF v_unbalanced_count > 0 THEN
    v_blocking_issues := array_append(v_blocking_issues,
      jsonb_build_object(
        'code', 'UNBALANCED_ENTRIES',
        'message', format('يوجد %s قيد غير متوازن في سنة %s. يجب معالجتها قبل الإقفال.', v_unbalanced_count, p_year),
        'count', v_unbalanced_count
      )
    );
  END IF;

  -- ── اختبار 2: لا توجد قيود مكررة للسنة المحددة
  SELECT COUNT(*) INTO v_duplicate_count
  FROM (
    SELECT reference_type, reference_id, company_id
    FROM public.journal_entries
    WHERE company_id = p_company_id
      AND reference_type IS NOT NULL
      AND reference_id IS NOT NULL
      AND (is_deleted IS NULL OR is_deleted = FALSE)
      AND deleted_at IS NULL
      AND EXTRACT(YEAR FROM entry_date) = p_year
    GROUP BY reference_type, reference_id, company_id
    HAVING COUNT(*) > 1
  ) d;

  IF v_duplicate_count > 0 THEN
    v_blocking_issues := array_append(v_blocking_issues,
      jsonb_build_object(
        'code', 'DUPLICATE_ENTRIES',
        'message', format('يوجد %s مجموعة قيود مكررة في سنة %s. يجب معالجتها قبل الإقفال.', v_duplicate_count, p_year),
        'count', v_duplicate_count
      )
    );
  END IF;

  -- ── اختبار 3: جميع فترات السنة مغلقة
  SELECT COUNT(*) INTO v_open_periods_count
  FROM public.accounting_periods
  WHERE company_id = p_company_id
    AND EXTRACT(YEAR FROM period_start) = p_year
    AND status NOT IN ('closed', 'locked');

  IF v_open_periods_count > 0 THEN
    v_blocking_issues := array_append(v_blocking_issues,
      jsonb_build_object(
        'code', 'OPEN_PERIODS',
        'message', format('يوجد %s فترة محاسبية مفتوحة في سنة %s. يجب إقفال جميع الفترات أولاً.', v_open_periods_count, p_year),
        'count', v_open_periods_count
      )
    );
  END IF;

  -- ── النتيجة النهائية
  IF array_length(v_blocking_issues, 1) > 0 THEN
    RETURN jsonb_build_object(
      'can_close', FALSE,
      'year', p_year,
      'blocking_issues', to_jsonb(v_blocking_issues),
      'warnings', to_jsonb(v_warnings),
      'message', format('لا يمكن إقفال سنة %s: توجد %s مشكلة حرجة يجب معالجتها.', p_year, array_length(v_blocking_issues, 1))
    );
  END IF;

  RETURN jsonb_build_object(
    'can_close', TRUE,
    'year', p_year,
    'blocking_issues', '[]'::JSONB,
    'warnings', to_jsonb(v_warnings),
    'message', format('يمكن إقفال سنة %s. جميع الاختبارات نجحت.', p_year)
  );
END;
$$;

-- ────────────────────────────────────────────────────────────────────
-- 7. RLS على جدول idempotency_keys
-- ────────────────────────────────────────────────────────────────────
ALTER TABLE public.idempotency_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "idempotency_keys_company_isolation"
  ON public.idempotency_keys
  FOR ALL
  USING (
    company_id IN (
      SELECT cm.company_id
      FROM public.company_members cm
      WHERE cm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    company_id IN (
      SELECT cm.company_id
      FROM public.company_members cm
      WHERE cm.user_id = auth.uid()
    )
  );

-- ────────────────────────────────────────────────────────────────────
-- 8. دالة تنظيف تلقائي للمفاتيح المنتهية
-- ────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.cleanup_expired_idempotency_keys()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_deleted INT;
BEGIN
  DELETE FROM public.idempotency_keys
  WHERE expires_at < NOW()
    AND status IN ('completed', 'failed');

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

-- ────────────────────────────────────────────────────────────────────
-- 9. تعليق توثيقي على الجداول والدوال
-- ────────────────────────────────────────────────────────────────────
COMMENT ON TABLE public.idempotency_keys IS
  'Phase 2: يمنع تكرار العمليات المالية (Double Submission Protection)';

COMMENT ON FUNCTION public.post_payroll_atomic IS
  'Phase 2: صرف الرواتب بمعاملة ذرية واحدة مع Period Lock + Idempotency';

COMMENT ON FUNCTION public.can_close_accounting_year IS
  'Phase 2: يمنع الإقفال السنوي إذا فشل أي اختبار محاسبي حرج';

COMMENT ON FUNCTION public.check_period_lock_for_date IS
  'Phase 2: دالة مساعدة للتحقق من Period Lock من التطبيق أو DB';

-- ────────────────────────────────────────────────────────────────────
-- 10. التحقق من التثبيت
-- ────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  -- تحقق من وجود الجداول والدوال
  ASSERT EXISTS (SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'idempotency_keys'),
    'idempotency_keys table missing!';

  ASSERT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'post_payroll_atomic'),
    'post_payroll_atomic function missing!';

  ASSERT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'can_close_accounting_year'),
    'can_close_accounting_year function missing!';

  RAISE NOTICE '✅ Phase 2 DB objects installed successfully!';
END;
$$;
