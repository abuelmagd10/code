-- =============================================================================
-- ERP Financial Core: GL-Driven Enterprise
-- 1) branch_id NOT NULL on journal_entries
-- 2) fiscal_periods (year, month, status)
-- 3) Period locking (block create/edit/delete when closed)
-- 4) Reversal-only: no UPDATE/DELETE on posted; reversal_of_entry_id
-- 5) system_audit_log (immutable)
-- 6) Chart of Accounts: archive instead of delete
--
-- بعد التشغيل: أي INSERT لـ journal_entries يجب أن يضمّن branch_id (غير null).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) branch_id إجباري في journal_entries
-- -----------------------------------------------------------------------------
-- 1.1 تعيين القيود التاريخية ذات branch_id IS NULL إلى الفرع الرئيسي (أو أول فرع) للشركة
DO $$
DECLARE
  r RECORD;
  v_branch_id UUID;
BEGIN
  FOR r IN
    SELECT DISTINCT je.company_id
    FROM journal_entries je
    WHERE je.branch_id IS NULL
  LOOP
    -- الفرع الرئيسي (is_main = true) أو أول فرع نشط
    SELECT id INTO v_branch_id
    FROM branches
    WHERE company_id = r.company_id AND is_active = TRUE
    ORDER BY is_main DESC NULLS LAST, name
    LIMIT 1;

    IF v_branch_id IS NOT NULL THEN
      UPDATE journal_entries
      SET branch_id = v_branch_id
      WHERE company_id = r.company_id AND branch_id IS NULL;
    ELSE
      -- إذا لم يوجد فرع: إنشاء فرع "HQ" افتراضي
      INSERT INTO branches (company_id, name, code, is_active, is_main)
      VALUES (r.company_id, 'HQ', 'HQ', TRUE, TRUE)
      RETURNING id INTO v_branch_id;

      IF v_branch_id IS NOT NULL THEN
        UPDATE journal_entries
        SET branch_id = v_branch_id
        WHERE company_id = r.company_id AND branch_id IS NULL;
      END IF;
    END IF;
  END LOOP;
END $$;

-- 1.2 جعل branch_id إجبارياً
ALTER TABLE journal_entries
  ALTER COLUMN branch_id SET NOT NULL;

-- 1.3 منع إنشاء قيد بدون branch_id (ضمان على مستوى DB)
-- يتم ضمانه بـ NOT NULL أعلاه

-- -----------------------------------------------------------------------------
-- 2) جدول fiscal_periods (سنة، شهر، حالة)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.fiscal_periods (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id      UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  year            SMALLINT NOT NULL,
  month           SMALLINT NOT NULL CHECK (month >= 1 AND month <= 12),
  status          TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'locked')),
  closed_at       TIMESTAMPTZ,
  closed_by       UUID REFERENCES auth.users(id),
  reopened_at     TIMESTAMPTZ,
  reopened_by     UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (company_id, year, month)
);

CREATE INDEX IF NOT EXISTS idx_fiscal_periods_company_year_month
  ON public.fiscal_periods (company_id, year, month);

COMMENT ON TABLE public.fiscal_periods IS 'فترات محاسبية شهرية: open/closed/locked. منع القيود عند closed/locked.';

-- -----------------------------------------------------------------------------
-- 3) دالة التحقق من قفل الفترة (بناءً على fiscal_periods)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_fiscal_period_locked(
  p_company_id UUID,
  p_entry_date DATE
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.fiscal_periods fp
    WHERE fp.company_id = p_company_id
      AND fp.year = EXTRACT(YEAR FROM p_entry_date)::SMALLINT
      AND fp.month = EXTRACT(MONTH FROM p_entry_date)::SMALLINT
      AND fp.status IN ('closed', 'locked')
  );
$$;

-- تحديث trigger القيد ليتحقق من fiscal_periods أيضاً (إذا وُجدت صفوف)
-- الحالي يعتمد على accounting_periods؛ نضيف التحقق من fiscal_periods
CREATE OR REPLACE FUNCTION enforce_period_lock_header()
RETURNS TRIGGER AS $$
DECLARE
  v_entry_date DATE;
  v_is_closing BOOLEAN;
  v_company_id UUID;
  v_fiscal_locked BOOLEAN;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_entry_date := OLD.entry_date;
    v_is_closing := OLD.is_closing_entry;
    v_company_id := OLD.company_id;
  ELSE
    v_entry_date := NEW.entry_date;
    v_is_closing := NEW.is_closing_entry;
    v_company_id := NEW.company_id;
  END IF;

  IF v_is_closing THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- التحقق من fiscal_periods (سنة/شهر)
  SELECT public.check_fiscal_period_locked(v_company_id, v_entry_date) INTO v_fiscal_locked;
  IF v_fiscal_locked THEN
    RAISE EXCEPTION 'Action blocked: Fiscal period %-% is CLOSED or LOCKED.', EXTRACT(YEAR FROM v_entry_date), EXTRACT(MONTH FROM v_entry_date);
  END IF;

  -- التحقق من accounting_periods (إن وُجدت)
  IF EXISTS (
    SELECT 1 FROM accounting_periods
    WHERE company_id = v_company_id
      AND v_entry_date BETWEEN period_start AND period_end
      AND (is_locked = TRUE OR status = 'closed')
  ) THEN
    RAISE EXCEPTION 'Action blocked: This accounting period is CLOSED or LOCKED. Date: %', v_entry_date;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- -----------------------------------------------------------------------------
-- 4) Reversal-Only: منع UPDATE/DELETE على القيود المرحلة + reversal_of_entry_id
-- -----------------------------------------------------------------------------
ALTER TABLE journal_entries
  ADD COLUMN IF NOT EXISTS reversal_of_entry_id UUID REFERENCES journal_entries(id);

CREATE INDEX IF NOT EXISTS idx_journal_entries_reversal_of
  ON journal_entries(reversal_of_entry_id) WHERE reversal_of_entry_id IS NOT NULL;

-- منع UPDATE و DELETE لأي قيد حالته posted
CREATE OR REPLACE FUNCTION enforce_posted_entry_no_edit()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status = 'posted' THEN
      RAISE EXCEPTION 'Cannot DELETE a posted journal entry. Use Reversal (create reversal entry) instead. Entry id: %', OLD.id;
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.status = 'posted' THEN
      -- السماح فقط بتحديثات معينة غير مالية (مثل الملاحظات إن وُجدت) أو منع أي تحديث
      IF OLD.entry_date IS DISTINCT FROM NEW.entry_date
         OR OLD.description IS DISTINCT FROM NEW.description
         OR OLD.reference_type IS DISTINCT FROM NEW.reference_type
         OR OLD.reference_id IS DISTINCT FROM NEW.reference_id
         OR OLD.branch_id IS DISTINCT FROM NEW.branch_id
         OR OLD.cost_center_id IS DISTINCT FROM NEW.cost_center_id
         OR OLD.warehouse_id IS DISTINCT FROM NEW.warehouse_id
         OR OLD.status IS DISTINCT FROM NEW.status THEN
        RAISE EXCEPTION 'Cannot UPDATE a posted journal entry. Use Reversal (create reversal entry) instead. Entry id: %', OLD.id;
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_posted_entry_no_edit ON journal_entries;
CREATE TRIGGER trg_posted_entry_no_edit
  BEFORE UPDATE OR DELETE ON journal_entries
  FOR EACH ROW EXECUTE FUNCTION enforce_posted_entry_no_edit();

-- منع إضافة/تعديل/حذف سطور قيد مرتبط بقيد مرحّل
CREATE OR REPLACE FUNCTION enforce_posted_entry_lines_no_edit()
RETURNS TRIGGER AS $$
DECLARE
  v_status TEXT;
  v_je_id UUID;
BEGIN
  v_je_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.journal_entry_id ELSE NEW.journal_entry_id END;
  SELECT status INTO v_status FROM journal_entries WHERE id = v_je_id;

  IF v_status = 'posted' THEN
    IF TG_OP = 'DELETE' THEN
      RAISE EXCEPTION 'Cannot modify lines of a posted journal entry. Use Reversal instead.';
    END IF;
    IF TG_OP = 'UPDATE' THEN
      RAISE EXCEPTION 'Cannot modify lines of a posted journal entry. Use Reversal instead.';
    END IF;
    IF TG_OP = 'INSERT' THEN
      RAISE EXCEPTION 'Cannot add lines to a posted journal entry. Use Reversal instead.';
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_posted_entry_lines_no_edit ON journal_entry_lines;
CREATE TRIGGER trg_posted_entry_lines_no_edit
  BEFORE INSERT OR UPDATE OR DELETE ON journal_entry_lines
  FOR EACH ROW EXECUTE FUNCTION enforce_posted_entry_lines_no_edit();

-- RPC: إنشاء قيد عكسي
CREATE OR REPLACE FUNCTION public.create_reversal_entry(
  p_original_entry_id UUID,
  p_reversal_date DATE DEFAULT CURRENT_DATE,
  p_posted_by UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_orig RECORD;
  v_new_id UUID;
  v_line RECORD;
BEGIN
  SELECT id, company_id, entry_date, description, reference_type, reference_id,
         branch_id, cost_center_id, warehouse_id, status
  INTO v_orig
  FROM journal_entries
  WHERE id = p_original_entry_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Journal entry not found: %', p_original_entry_id;
  END IF;

  IF v_orig.status <> 'posted' THEN
    RAISE EXCEPTION 'Only posted entries can be reversed. Entry % has status %.', p_original_entry_id, v_orig.status;
  END IF;

  -- التحقق من قفل الفترة لتاريخ ال reversal
  IF public.check_fiscal_period_locked(v_orig.company_id, p_reversal_date) THEN
    RAISE EXCEPTION 'Cannot create reversal: fiscal period for date % is closed or locked.', p_reversal_date;
  END IF;

  INSERT INTO journal_entries (
    company_id, entry_date, description, reference_type, reference_id,
    branch_id, cost_center_id, warehouse_id, status,
    reversal_of_entry_id, is_closing_entry
  ) VALUES (
    v_orig.company_id,
    p_reversal_date,
    'Reversal: ' || COALESCE(v_orig.description, ''),
    'reversal',
    p_original_entry_id::TEXT,
    v_orig.branch_id,
    v_orig.cost_center_id,
    v_orig.warehouse_id,
    'posted',
    p_original_entry_id,
    FALSE
  ) RETURNING id INTO v_new_id;

  -- نسخ السطور بعكس المدين والدائن
  FOR v_line IN
    SELECT account_id, debit_amount, credit_amount, description
    FROM journal_entry_lines
    WHERE journal_entry_id = p_original_entry_id
  LOOP
    INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit_amount, credit_amount, description)
    VALUES (
      v_new_id,
      v_line.account_id,
      v_line.credit_amount,
      v_line.debit_amount,
      COALESCE(v_line.description, '') || ' (عكسي)'
    );
  END LOOP;

  RETURN v_new_id;
END;
$$;

-- -----------------------------------------------------------------------------
-- 5) system_audit_log غير قابل للتعديل (Immutable Audit Trail)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.system_audit_log (
  id              BIGSERIAL PRIMARY KEY,
  user_id         UUID REFERENCES auth.users(id),
  company_id      UUID REFERENCES public.companies(id),
  action          TEXT NOT NULL,
  entity_type     TEXT NOT NULL,
  entity_id       TEXT,
  before_snapshot  JSONB,
  after_snapshot   JSONB,
  metadata        JSONB,
  created_at      TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- منع UPDATE و DELETE على system_audit_log
CREATE OR REPLACE FUNCTION prevent_audit_log_modification()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'system_audit_log is immutable. UPDATE and DELETE are not allowed.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_system_audit_log_immutable ON system_audit_log;
CREATE TRIGGER trg_system_audit_log_immutable
  BEFORE UPDATE OR DELETE ON system_audit_log
  FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_modification();

CREATE INDEX IF NOT EXISTS idx_system_audit_log_entity ON system_audit_log (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_system_audit_log_created ON system_audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_system_audit_log_company ON system_audit_log (company_id, created_at DESC);

COMMENT ON TABLE public.system_audit_log IS 'سجل تدقيق ثابت: لا يسمح بتعديل أو حذف. Post Journal, Reverse, Close/Reopen Period, Permission changes.';

-- دالة مساعدة: تسجيل في system_audit_log (للاستدعاء من RPC أو التطبيق)
CREATE OR REPLACE FUNCTION public.system_audit_log_insert(
  p_user_id UUID,
  p_company_id UUID,
  p_action TEXT,
  p_entity_type TEXT,
  p_entity_id TEXT,
  p_before_snapshot JSONB DEFAULT NULL,
  p_after_snapshot JSONB DEFAULT NULL,
  p_metadata JSONB DEFAULT NULL
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_id BIGINT;
BEGIN
  INSERT INTO public.system_audit_log (user_id, company_id, action, entity_type, entity_id, before_snapshot, after_snapshot, metadata)
  VALUES (p_user_id, p_company_id, p_action, p_entity_type, p_entity_id, p_before_snapshot, p_after_snapshot, p_metadata)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- إغلاق فترة محاسبية (fiscal_periods)
CREATE OR REPLACE FUNCTION public.close_fiscal_period(
  p_company_id UUID,
  p_year SMALLINT,
  p_month SMALLINT,
  p_closed_by UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_id UUID;
  v_old RECORD;
BEGIN
  INSERT INTO public.fiscal_periods (company_id, year, month, status, closed_at, closed_by, updated_at)
  VALUES (p_company_id, p_year, p_month, 'closed', NOW(), p_closed_by, NOW())
  ON CONFLICT (company_id, year, month)
  DO UPDATE SET status = 'closed', closed_at = NOW(), closed_by = p_closed_by, updated_at = NOW()
  RETURNING id INTO v_id;

  SELECT * INTO v_old FROM public.fiscal_periods WHERE id = v_id;
  PERFORM public.system_audit_log_insert(
    p_closed_by, p_company_id, 'close_period', 'fiscal_period', v_id::TEXT,
    NULL, to_jsonb(v_old), jsonb_build_object('year', p_year, 'month', p_month)
  );
  RETURN v_id;
END;
$$;

-- إعادة فتح فترة محاسبية (صلاحية خاصة — يُستدعى من واجهة مصرح بها فقط)
CREATE OR REPLACE FUNCTION public.reopen_fiscal_period(
  p_company_id UUID,
  p_year SMALLINT,
  p_month SMALLINT,
  p_reopened_by UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_id UUID;
  v_before RECORD;
  v_after RECORD;
BEGIN
  SELECT id INTO v_id FROM public.fiscal_periods
  WHERE company_id = p_company_id AND year = p_year AND month = p_month;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Fiscal period %-% not found for company.', p_year, p_month;
  END IF;

  SELECT * INTO v_before FROM public.fiscal_periods WHERE id = v_id;

  UPDATE public.fiscal_periods
  SET status = 'open', reopened_at = NOW(), reopened_by = p_reopened_by, closed_at = NULL, closed_by = NULL, updated_at = NOW()
  WHERE id = v_id
  RETURNING * INTO v_after;

  PERFORM public.system_audit_log_insert(
    p_reopened_by, p_company_id, 'reopen_period', 'fiscal_period', v_id::TEXT,
    to_jsonb(v_before), to_jsonb(v_after), jsonb_build_object('year', p_year, 'month', p_month)
  );
  RETURN v_id;
END;
$$;

-- -----------------------------------------------------------------------------
-- 6) دليل الحسابات: استبدال الحذف بالأرشفة (archive)
-- -----------------------------------------------------------------------------
ALTER TABLE chart_of_accounts
  ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT FALSE;

-- تحديث دالة الحماية: عند الحذف إذا كان للحساب قيود → أرشفة بدلاً من الحذف
CREATE OR REPLACE FUNCTION prevent_critical_account_changes()
RETURNS TRIGGER AS $$
DECLARE
  has_transactions BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM journal_entry_lines WHERE account_id = OLD.id LIMIT 1
  ) INTO has_transactions;

  IF TG_OP = 'DELETE' THEN
    IF OLD.is_system THEN
      RAISE EXCEPTION 'Cannot delete a system account.';
    END IF;

    IF has_transactions THEN
      -- استبدال الحذف بالأرشفة: تحديث السجل ثم إلغاء الحذف
      UPDATE chart_of_accounts
      SET is_archived = TRUE, is_active = FALSE, updated_at = NOW()
      WHERE id = OLD.id;
      RETURN NULL; -- إلغاء عملية الحذف
    END IF;

    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.account_type IS DISTINCT FROM NEW.account_type AND has_transactions THEN
      RAISE EXCEPTION 'Cannot change account type of % because it has transactions. This would corrupt historical financial statements.', OLD.account_name;
    END IF;

    IF OLD.is_system THEN
      IF OLD.account_code IS DISTINCT FROM NEW.account_code THEN
        RAISE EXCEPTION 'Cannot change account code of a system account.';
      END IF;
      IF OLD.account_type IS DISTINCT FROM NEW.account_type THEN
        RAISE EXCEPTION 'Cannot change account type of a system account.';
      END IF;
    END IF;

    -- منع إعادة تفعيل حساب مُؤرشف له قيود (اختياري: يمكن السماح بالقراءة فقط)
    IF OLD.is_archived = TRUE AND NEW.is_archived = FALSE AND has_transactions THEN
      RAISE EXCEPTION 'Cannot unarchive account with existing transactions. Account: %', OLD.account_name;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- التأكد من وجود updated_at في chart_of_accounts إن لزم
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'chart_of_accounts' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE chart_of_accounts ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
  END IF;
END $$;
