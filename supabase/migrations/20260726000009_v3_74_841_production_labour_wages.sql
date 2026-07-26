-- ============================================================================
-- v3.74.841 — أجور عمالة التصنيع: الفعلى يُسجَّل، والمعيارى يُقيَّم، والفرق يُقاس
-- ============================================================================
-- بعد حوار مع المالك حول «من أين تُدفع أجور عمالة التصنيع؟».
--
-- ── الخلاصة المحاسبية ────────────────────────────────────────────────────
-- التصنيع **لا يدفع لأحد**. هو يُعيد تصنيف قيمة العمل من مصروف الشهر إلى قيمة
-- المنتج (٥٤١٥ أجور محمَّلة). والدفع يحدث فى مكانين لا ثالث لهما:
--   • **موظف دائم** ← شاشة المرتبات.
--   • **عامل مؤقت** ← صرف نقدى/بنكى، وهو ما تبنيه هذه النشرة.
-- وصافى تكلفة العمالة فى قائمة الدخل = الفعلى − المُستوعَب.
--
-- ── لماذا رُفض اقتراح «التصنيع يُحدِّد ما يُدفع» ─────────────────────────
-- الاقتراح الأول كان: يوزّع النظام تقدير التصنيع على العمال، بشرط ألا يزيد
-- المدفوع ولا ينقص عنه. ولو فُعل ذلك لصار **التقدير يُحقّق نفسه**، فيصير
-- الانحراف صفراً بالتصميم — ونفقد الرقم الوحيد الذى يقول إن سعر الساعة خاطئ.
-- والأسوأ: الواقع لا يُطيع تقديراً (عامل غاب، وآخر عمل إضافياً)، فإلزام
-- الفعلى بمساواة المُقدَّر يعنى ظلم عامل أو تزوير رقم — كلاهما ليقنع برنامجاً.
-- ⇒ **يُدخل المستخدم ما دُفع فعلاً، ويُظهر النظام الفرق. ولا يُجبر الواقع على
--    مطابقة التقدير أبداً.**
--
-- ── الموظف بمرتب ثابت: تُسجَّل ساعاته ولا يُدفع له من هنا ────────────────
-- مرتبه مدفوع أصلاً فى المرتبات، والتصنيع يستوعب جزءاً منه. فصرف مبلغ له من
-- هذه الشاشة = **دفع مرتين**. ولذلك `payment_mode='hours_only'`: بلا خزينة،
-- بلا مبلغ، بلا قيد — والقاعدة تمنع صرفه (لا الشاشة وحدها).
--
-- ── فصل المهام (بطلب المالك) ─────────────────────────────────────────────
--   مسؤول التصنيع يُنشئ ويُرسل → المالك/المدير العام يعتمد → محاسب الفرع يصرف
-- ثلاثة أشخاص، فلا أحد يُنشئ ويعتمد ويصرف. ومحاسب الفرع مقيَّد بخزائن فرعه.
--
-- ── 🔒 سرية المرتبات ─────────────────────────────────────────────────────
-- الشاشة تظهر تحت «الموظفين والمرتبات»، **لكن بمفتاح صلاحية مستقل**
-- (`production_labour_wages`). ولو رُبطت بصلاحية `payroll` لانفتحت مرتبات كل
-- الموظفين لمحاسب الفرع ولمسؤول التصنيع — ومنها مرتب المدير العام.
-- ⇒ **موضع القائمة وحق الوصول شيئان مختلفان.**
-- تحقق بعد التطبيق: محاسب الفرع لا يرى `payroll` ولا `employees`، ومسؤول
-- التصنيع كذلك.
--
-- ── الكتابة بالدوال الذرية وحدها ─────────────────────────────────────────
-- لا سياسة INSERT/UPDATE/DELETE على الجداول الثلاثة، والصلاحيات مسحوبة من
-- المتصفح. فلا يمكن القفز فوق الاعتماد بأى طريق، ولو عُدِّلت الواجهة.
--
-- ── التحقق (اثنا عشر فحصاً على بيانات الإنتاج داخل معاملة أُلغيت) ────────
--   خزينة فرع آخر ✗ · إجمالى صفر ✗ · نفس العامل مرتين ✗ · مؤقت كساعات ✗
--   صرف بلا اعتماد ✗ · اعتماد قبل الإرسال ✗ · صرف لموظف بمرتب ثابت ✗
--   الدورة الكاملة ✓ · القيد: مدين ٥٢١١ ١٠٠ / دائن ١١١٢ ١٠٠ متوازن ✓
--   مركز التكلفة مضبوط ✓ · الصرف مرتين لا يُنشئ قيداً ثانياً ✓
--
-- ── وثلاثة أخطاء فى التصميم أمسكها الاختبار ──────────────────────────────
-- ١. قيد «الإجمالى > صفر» كان على الجدول — والترويسة تُدرَج بصفر ثم يُحسب
--    الإجمالى من السطور، فكان القيد يمنع الإنشاء أصلاً. **موضع القاعدة كان
--    خطأ**: نُقل لبوابة الإرسال.
-- ٢. فحص التكرار كان **بعد** فحص الحالة، فالضغط مرتين على «صرف» يُعطى «لا
--    يُصرف إلا معتمد (حالته: paid)» — رسالة تبدو عطباً وهى نجاح سابق.
-- ٣. حارس ٨٣٥ كان يقبل أى حقل زمن من أربعة، بينما حساب التكلفة يقرأ
--    `labor_time_minutes` و`machine_time_minutes` **وحدهما**. فمسار بزمن
--    تشغيل ٣٠ يمرّ **وتكلفته صفر** — نفس العطب الذى جاء الحارس ليمنعه.
--    (مُصلَح فى هذه النشرة؛ ورسالته تُسمّى الحقلين المطلوبين.)
--
-- ── وحارس بلا مخرج ───────────────────────────────────────────────────────
-- حارس مركز التكلفة كان يمنع تفعيل مركز عمل بلا مركز تكلفة — **والشاشة لا
-- تحتوى الحقل أصلاً**. أى منع بلا طريق للامتثال. فضُبطت مراكز التكلفة من
-- الفروع، **ويُضاف الحقل للشاشة فى نفس النشرة**.
-- ============================================================================

-- ── (١) حساب أجور عمالة التصنيع: مفصولاً عن مرتبات الإدارة ────────────────
-- بدونه تختلط أجور المصنع بـ٥٢١٠، فيصير قياس الانحراف بلا معنى.
INSERT INTO public.chart_of_accounts_template
  (account_code, account_name, account_name_en, account_type, normal_balance, sub_type, parent_code, level, is_active)
VALUES
  ('5211', 'أجور عمالة تصنيع', 'Manufacturing Labour Wages', 'expense', 'debit',
   'manufacturing_labour', '5200', 3, true)
ON CONFLICT (account_code) DO UPDATE
  SET account_name = EXCLUDED.account_name, account_name_en = EXCLUDED.account_name_en,
      sub_type = EXCLUDED.sub_type, parent_code = EXCLUDED.parent_code, level = EXCLUDED.level;

INSERT INTO public.chart_of_accounts
  (company_id, account_code, account_name, account_type, normal_balance, sub_type,
   parent_id, level, is_active, is_system)
SELECT c.id, '5211', 'أجور عمالة تصنيع', 'expense', 'debit', 'manufacturing_labour',
       (SELECT p.id FROM public.chart_of_accounts p WHERE p.company_id = c.id AND p.account_code = '5200' LIMIT 1),
       3, true, true
FROM public.companies c
WHERE NOT EXISTS (SELECT 1 FROM public.chart_of_accounts a
                   WHERE a.company_id = c.id AND a.account_code = '5211');

-- ── (٢) سجل العمالة المؤقتة: ليسوا موظفين — لا مرتب ولا تأمينات ───────────
CREATE TABLE IF NOT EXISTS public.casual_workers (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  branch_id    UUID REFERENCES public.branches(id),
  name         TEXT NOT NULL,
  phone        TEXT,
  national_id  TEXT,
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  notes        TEXT,
  created_by   UUID,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_casual_worker_name_not_blank CHECK (btrim(name) <> '')
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_casual_worker_identity
  ON public.casual_workers (company_id, lower(btrim(name)), COALESCE(btrim(phone), ''));
CREATE INDEX IF NOT EXISTS ix_casual_workers_company ON public.casual_workers (company_id, is_active);

-- ── (٣) ترويسة الصرف ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.production_labour_payments (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  branch_id           UUID NOT NULL REFERENCES public.branches(id),
  production_order_id UUID NOT NULL REFERENCES public.manufacturing_production_orders(id) ON DELETE RESTRICT,
  work_center_id      UUID REFERENCES public.manufacturing_work_centers(id),
  cost_center_id      UUID REFERENCES public.cost_centers(id),
  payment_no          TEXT,
  period_from         DATE NOT NULL,
  period_to           DATE NOT NULL,
  labour_type         TEXT NOT NULL,
  payment_mode        TEXT NOT NULL DEFAULT 'paid',
  payment_account_id  UUID REFERENCES public.chart_of_accounts(id),
  total_amount        NUMERIC(15,2) NOT NULL DEFAULT 0,
  estimated_amount    NUMERIC(15,2) NOT NULL DEFAULT 0,
  status              TEXT NOT NULL DEFAULT 'draft',
  notes               TEXT,
  submitted_by UUID, submitted_at TIMESTAMPTZ,
  approved_by  UUID, approved_at  TIMESTAMPTZ,
  rejected_by  UUID, rejected_at  TIMESTAMPTZ, rejection_reason TEXT,
  paid_by      UUID, paid_at      TIMESTAMPTZ,
  journal_entry_id    UUID REFERENCES public.journal_entries(id),
  created_by   UUID,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_plp_labour_type  CHECK (labour_type IN ('casual','employee')),
  CONSTRAINT chk_plp_payment_mode CHECK (payment_mode IN ('paid','hours_only')),
  CONSTRAINT chk_plp_status CHECK (status IN ('draft','pending_approval','approved','rejected','paid','cancelled')),
  CONSTRAINT chk_plp_period CHECK (period_to >= period_from),
  -- الصرف يلزمه خزينة؛ وتسجيل الساعات بلا خزينة ولا مبلغ.
  -- أما «الإجمالى > صفر» فموضعه بوابة الإرسال لا القيد: الترويسة تُدرَج بصفر
  -- ثم يُحسب الإجمالى من السطور، فقيدٌ يشترطه لحظة الإدراج يمنع الإنشاء أصلاً.
  CONSTRAINT chk_plp_paid_needs_account CHECK (
    (payment_mode = 'paid'       AND payment_account_id IS NOT NULL AND total_amount >= 0) OR
    (payment_mode = 'hours_only' AND payment_account_id IS NULL     AND total_amount = 0)
  ),
  -- العامل المؤقت يُحاسب باليوم: لا معنى لتسجيل ساعاته بلا أجر
  CONSTRAINT chk_plp_casual_is_always_paid CHECK (
    NOT (labour_type = 'casual' AND payment_mode = 'hours_only')
  )
);
CREATE INDEX IF NOT EXISTS ix_plp_order   ON public.production_labour_payments (production_order_id);
CREATE INDEX IF NOT EXISTS ix_plp_company ON public.production_labour_payments (company_id, status);
CREATE INDEX IF NOT EXISTS ix_plp_branch  ON public.production_labour_payments (company_id, branch_id, status);

-- ── (٤) السطور: عامل مؤقت أو موظف — واحد لا كلاهما، ولا يتكرر ─────────────
CREATE TABLE IF NOT EXISTS public.production_labour_payment_lines (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  payment_id       UUID NOT NULL REFERENCES public.production_labour_payments(id) ON DELETE CASCADE,
  casual_worker_id UUID REFERENCES public.casual_workers(id),
  employee_id      UUID REFERENCES public.employees(id),
  hours            NUMERIC(10,2) NOT NULL DEFAULT 0,
  amount           NUMERIC(15,2) NOT NULL DEFAULT 0,
  notes            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_plpl_one_person CHECK (
    (casual_worker_id IS NOT NULL AND employee_id IS NULL) OR
    (casual_worker_id IS NULL     AND employee_id IS NOT NULL)
  ),
  CONSTRAINT chk_plpl_amount_not_negative CHECK (amount >= 0),
  CONSTRAINT chk_plpl_hours_not_negative  CHECK (hours  >= 0)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_plpl_casual   ON public.production_labour_payment_lines (payment_id, casual_worker_id) WHERE casual_worker_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_plpl_employee ON public.production_labour_payment_lines (payment_id, employee_id)      WHERE employee_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_plpl_payment ON public.production_labour_payment_lines (payment_id);

-- ── (٥) القراءة بحدود الشركة والفرع · والكتابة بالدوال الذرية وحدها ───────
ALTER TABLE public.casual_workers                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_labour_payments      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_labour_payment_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS casual_workers_select ON public.casual_workers;
CREATE POLICY casual_workers_select ON public.casual_workers FOR SELECT
USING (company_id IN (SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid()));

DROP POLICY IF EXISTS plp_select ON public.production_labour_payments;
CREATE POLICY plp_select ON public.production_labour_payments FOR SELECT
USING (
  company_id IN (SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid())
  AND (
    EXISTS (SELECT 1 FROM public.companies c WHERE c.id = production_labour_payments.company_id AND c.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.company_members cm
                WHERE cm.company_id = production_labour_payments.company_id AND cm.user_id = auth.uid()
                  AND (cm.role IN ('owner','admin','manager') OR cm.branch_id = production_labour_payments.branch_id))
  )
);

DROP POLICY IF EXISTS plpl_select ON public.production_labour_payment_lines;
CREATE POLICY plpl_select ON public.production_labour_payment_lines FOR SELECT
USING (EXISTS (SELECT 1 FROM public.production_labour_payments p
                WHERE p.id = production_labour_payment_lines.payment_id));

REVOKE INSERT, UPDATE, DELETE ON public.casual_workers                  FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.production_labour_payments      FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.production_labour_payment_lines FROM anon, authenticated;

-- ── (٦) 🔒 الصلاحية المستقلة: سرية المرتبات مصونة ─────────────────────────
INSERT INTO public.company_role_permissions
  (company_id, role, resource, can_access, can_read, can_write, can_update, can_delete, all_access, allowed_actions)
SELECT c.id, v.role, 'production_labour_wages', TRUE, TRUE, v.can_write, v.can_update, FALSE, FALSE, v.actions
FROM public.companies c
CROSS JOIN (VALUES
  ('manufacturing_officer', TRUE,  TRUE,  ARRAY['read','create','update','submit']),
  ('accountant',            FALSE, FALSE, ARRAY['read','pay']),
  ('owner',                 TRUE,  TRUE,  ARRAY['read','create','update','submit','approve','reject','pay']),
  ('admin',                 TRUE,  TRUE,  ARRAY['read','create','update','submit','approve','reject','pay']),
  ('manager',               FALSE, FALSE, ARRAY['read','approve','reject'])
) AS v(role, can_write, can_update, actions)
WHERE NOT EXISTS (SELECT 1 FROM public.company_role_permissions p
                   WHERE p.company_id = c.id AND p.role = v.role AND p.resource = 'production_labour_wages');

-- وتُزرع للشركات الجديدة: تُرقَّع `seed_default_role_permissions` بمراسٍ
-- موثَّقة، كل واحدة تُطابق **مرة واحدة بالضبط** وإلا تتوقف.
DO $patch$
DECLARE
  d TEXT;
  a1 TEXT := E'    (p_company_id, ''accountant'', ''banking'',                 true, true, true,  true,  true,  false);';
  r1 TEXT := E'    (p_company_id, ''accountant'', ''banking'',                 true, true, true,  true,  true,  false),\n    -- v3.74.841 — محاسب الفرع يصرف أجور عمالة التصنيع، **بلا** حق على المرتبات:\n    -- سرية الرواتب تبقى مصونة لأن الصلاحية مفتاح مستقل لا فرع من payroll.\n    (p_company_id, ''accountant'', ''production_labour_wages'', true, true, false, false, false, false);';
  a2 TEXT := E'    (p_company_id, ''manufacturing_officer'', ''approvals'',          true, true, true, true, false, false);';
  r2 TEXT := E'    (p_company_id, ''manufacturing_officer'', ''approvals'',          true, true, true, true, false, false),\n    -- v3.74.841 — يُنشئ صرف أجور العمالة ويُرسله، ولا يعتمد ولا يصرف\n    (p_company_id, ''manufacturing_officer'', ''production_labour_wages'', true, true, true, true, false, false);';
  a3 TEXT := E'    (''manufacturing_boms''), (''approvals'')';
  r3 TEXT := E'    (''manufacturing_boms''), (''approvals''), (''production_labour_wages'')';
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO d
    FROM pg_proc p JOIN pg_namespace nn ON nn.oid = p.pronamespace
   WHERE nn.nspname = 'public' AND p.proname = 'seed_default_role_permissions';
  IF d IS NULL OR d LIKE '%production_labour_wages%' THEN RETURN; END IF;
  IF (length(d)-length(replace(d,a1,'')))/length(a1) <> 1 THEN RAISE EXCEPTION 'seed anchor 1 not unique'; END IF;
  IF (length(d)-length(replace(d,a2,'')))/length(a2) <> 1 THEN RAISE EXCEPTION 'seed anchor 2 not unique'; END IF;
  IF (length(d)-length(replace(d,a3,'')))/length(a3) <> 1 THEN RAISE EXCEPTION 'seed anchor 3 not unique'; END IF;
  d := replace(d, a1, r1); d := replace(d, a2, r2); d := replace(d, a3, r3);
  EXECUTE d;
END $patch$;

-- ── (٧) إصلاح بيانات: مركز تكلفة لكل مركز عمل من فرعه ─────────────────────
-- الحارس أدناه يمنع تفعيل مركز عمل بلا مركز تكلفة؛ وهذه تُهيئ القائم منها
-- حتى لا يكون المنع بلا مخرج.
UPDATE public.manufacturing_work_centers wc
   SET cost_center_id = cc.id, updated_at = NOW()
  FROM public.cost_centers cc
 WHERE wc.cost_center_id IS NULL
   AND cc.company_id = wc.company_id AND cc.branch_id = wc.branch_id AND cc.is_active IS TRUE;

-- ── (٨) الدوال والحوارس ───────────────────────────────────────────────────
-- تُلحَق أدناه **من القاعدة الحيّة** عبر scripts/append-function-to-migration.js
-- فى سكربت النشر، لا بالنسخ اليدوى: الملف سجل لما طُبِّق لا نسخة منه (درس 834).
--
-- والمُشغِّل يُلحَق **بعدها**، لأنه ينفّذ دالة يجب أن تكون مُعرَّفة قبله. ولو
-- كُتب هنا لسبق تعريفها، ولفشل الملف على قاعدة جديدة عند أول سطر مُشغِّل.
-- (وهذا ما كشفه الفحص: أداة الإلحاق ظنّت الدالة موجودة لأن سطر المُشغِّل
--  يذكر اسمها — فتُفحص الآن عن **تعريف** لا عن ذِكر.)

CREATE OR REPLACE FUNCTION public.mr_assert_routing_operations_costable(p_routing_version_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_op_count INTEGER;
  v_bad RECORD;
BEGIN
  SELECT COUNT(*) INTO v_op_count
    FROM public.manufacturing_routing_operations
   WHERE routing_version_id = p_routing_version_id;

  IF COALESCE(v_op_count, 0) = 0 THEN
    RAISE EXCEPTION 'لا يمكن اعتماد مسار تصنيع بلا أى عملية — أضف عمليات المسار أولاً. | A routing version cannot be approved with no operations.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- (أ) مركز العمل له أسعار والعملية بلا زمن **مؤثِّر فى التكلفة**
  -- v3.74.841 — تضييق: حساب تكلفة التحويل يقرأ `labor_time_minutes` و
  -- `machine_time_minutes` **وحدهما**. أما `setup_time_minutes` و
  -- `run_time_minutes_per_unit` فللجدولة لا للتكلفة. وحارس 835 كان يقبل أياً
  -- من الأربعة، فيمرّ مسار بزمن تشغيل ٣٠ دقيقة **وتكلفته صفر** — نفس العطب
  -- الذى جاء الحارس ليمنعه. يُفحص ما يستهلكه الحساب فعلاً، لا مجموعة أوسع.
  SELECT ro.operation_no, ro.operation_name, wc.code AS wc_code, wc.name AS wc_name
    INTO v_bad
    FROM public.manufacturing_routing_operations ro
    JOIN public.manufacturing_work_centers wc ON wc.id = ro.work_center_id
   WHERE ro.routing_version_id = p_routing_version_id
     AND (COALESCE(wc.labor_cost_rate,0) + COALESCE(wc.machine_cost_rate,0)
        + COALESCE(wc.variable_overhead_rate,0) + COALESCE(wc.fixed_overhead_rate,0)) > 0
     AND (COALESCE(ro.labor_time_minutes,0) + COALESCE(ro.machine_time_minutes,0)) = 0
   ORDER BY ro.operation_no
   LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'العملية % «%» على مركز العمل % «%» بلا «زمن عمالة» ولا «زمن آلة»، ومركز العمل له أسعار تكلفة — فتكلفة التحويل ستكون صفراً ويدخل المنتج التام بتكلفة ناقصة. املأ «زمن العمالة (دقائق)» و«زمن الآلة (دقائق)»؛ فزمن التحضير وزمن التشغيل للجدولة لا للتكلفة. | Operation % "%" at work centre % "%" has neither labour nor machine minutes while the work centre has cost rates; conversion cost would be zero. Setup and run time drive scheduling, not cost.',
      v_bad.operation_no, v_bad.operation_name, v_bad.wc_code, v_bad.wc_name,
      v_bad.operation_no, v_bad.operation_name, v_bad.wc_code, v_bad.wc_name
      USING ERRCODE = 'check_violation';
  END IF;

  -- (ب) مركز العمل كل أسعاره صفر ⇒ أى منتج يمرّ به يُقيَّم بالمواد فقط
  SELECT ro.operation_no, ro.operation_name, wc.code AS wc_code, wc.name AS wc_name
    INTO v_bad
    FROM public.manufacturing_routing_operations ro
    JOIN public.manufacturing_work_centers wc ON wc.id = ro.work_center_id
   WHERE ro.routing_version_id = p_routing_version_id
     AND (COALESCE(wc.labor_cost_rate,0) + COALESCE(wc.machine_cost_rate,0)
        + COALESCE(wc.variable_overhead_rate,0) + COALESCE(wc.fixed_overhead_rate,0)) = 0
   ORDER BY ro.operation_no
   LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'مركز العمل % «%» (المستخدم فى العملية % «%») كل أسعار تكلفته صفر — فكل منتج يمرّ به يُقيَّم بالمواد فقط بلا أجور ولا أعباء. اضبط أسعار مركز العمل قبل الاعتماد. | Work centre % "%" (used by operation % "%") has all cost rates at zero; every product through it would be valued at materials only.',
      v_bad.wc_code, v_bad.wc_name, v_bad.operation_no, v_bad.operation_name,
      v_bad.wc_code, v_bad.wc_name, v_bad.operation_no, v_bad.operation_name
      USING ERRCODE = 'check_violation';
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.plw_caller_role(p_company_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_uid UUID := auth.uid(); v_role TEXT;
BEGIN
  IF v_uid IS NULL THEN RETURN 'service'; END IF;
  IF EXISTS (SELECT 1 FROM public.companies WHERE id = p_company_id AND user_id = v_uid) THEN
    RETURN 'owner';
  END IF;
  SELECT cm.role INTO v_role FROM public.company_members cm
   WHERE cm.company_id = p_company_id AND cm.user_id = v_uid LIMIT 1;
  RETURN COALESCE(v_role, 'none');
END;
$function$;

CREATE OR REPLACE FUNCTION public.plw_next_payment_no(p_company_id uuid, p_date date)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_prefix TEXT; v_n INTEGER;
BEGIN
  v_prefix := 'PLW-' || to_char(p_date, 'YYYYMM') || '-';
  SELECT COALESCE(MAX(NULLIF(regexp_replace(payment_no, '^.*-', ''), ''))::INTEGER, 0) + 1
    INTO v_n FROM public.production_labour_payments
   WHERE company_id = p_company_id AND payment_no LIKE v_prefix || '%';
  RETURN v_prefix || LPAD(v_n::TEXT, 4, '0');
END;
$function$;

CREATE OR REPLACE FUNCTION public.plw_create_labour_payment(p_company_id uuid, p_production_order_id uuid, p_period_from date, p_period_to date, p_labour_type text, p_payment_mode text, p_payment_account_id uuid, p_lines jsonb, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_role TEXT; v_uid UUID := auth.uid();
  v_order RECORD; v_wc RECORD; v_acct RECORD;
  v_branch UUID; v_total NUMERIC(15,2) := 0; v_id UUID; v_line JSONB;
  v_est NUMERIC(15,2) := 0; v_conv NUMERIC(15,2);
BEGIN
  PERFORM public.assert_company_access(p_company_id);
  v_role := public.plw_caller_role(p_company_id);
  IF v_role NOT IN ('owner','admin','manager','manufacturing_officer','service') THEN
    RAISE EXCEPTION 'لا تملك صلاحية إنشاء صرف أجور عمالة تصنيع — هذه مهمة مسؤول التصنيع أو المدير. | You are not permitted to create a production labour payment.'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_order FROM public.manufacturing_production_orders
   WHERE id = p_production_order_id AND company_id = p_company_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'أمر الإنتاج غير موجود. | Production order not found.' USING ERRCODE='check_violation';
  END IF;
  IF COALESCE(v_order.status,'') NOT IN ('released','in_progress','completed') THEN
    RAISE EXCEPTION 'لا تُصرف أجور على أمر إنتاج حالته «%» — يجب أن يكون مُصدَراً أو جارياً أو مكتملاً. | Labour cannot be paid on a production order in status "%".',
      v_order.status, v_order.status USING ERRCODE='check_violation';
  END IF;

  SELECT wc.* INTO v_wc FROM public.manufacturing_production_order_operations o
    JOIN public.manufacturing_work_centers wc ON wc.id = o.work_center_id
   WHERE o.production_order_id = p_production_order_id
   ORDER BY o.operation_no LIMIT 1;

  v_branch := COALESCE(v_wc.branch_id, v_order.branch_id);
  IF v_branch IS NULL THEN
    RAISE EXCEPTION 'لا يمكن تحديد فرع الصرف. | Cannot determine the paying branch.' USING ERRCODE='check_violation';
  END IF;

  IF EXISTS (SELECT 1 FROM public.accounting_periods ap
              WHERE ap.company_id = p_company_id
                AND p_period_to BETWEEN ap.period_start AND ap.period_end
                AND (ap.is_locked IS TRUE OR ap.status IN ('closed','locked'))) THEN
    RAISE EXCEPTION 'الفترة المحاسبية لتاريخ % مقفلة — لا يُقيَّد صرف فيها. | The accounting period covering % is locked.',
      p_period_to, p_period_to USING ERRCODE='check_violation';
  END IF;

  IF p_payment_mode = 'paid' THEN
    IF p_payment_account_id IS NULL THEN
      RAISE EXCEPTION 'اختر الخزينة أو البنك الذى يُصرف منه. | Choose the treasury or bank to pay from.' USING ERRCODE='check_violation';
    END IF;
    SELECT * INTO v_acct FROM public.chart_of_accounts
     WHERE id = p_payment_account_id AND company_id = p_company_id;
    IF NOT FOUND OR COALESCE(v_acct.sub_type,'') NOT IN ('cash','bank') THEN
      RAISE EXCEPTION 'حساب الصرف يجب أن يكون خزينة أو حساباً بنكياً. | The payment account must be a cash or bank account.'
        USING ERRCODE='check_violation';
    END IF;
    IF v_acct.branch_id IS NOT NULL AND v_acct.branch_id <> v_branch THEN
      RAISE EXCEPTION 'الخزينة «%» تابعة لفرع آخر — اختر خزينة فرع الإنتاج. | Treasury "%" belongs to another branch.',
        v_acct.account_name, v_acct.account_name USING ERRCODE='check_violation';
    END IF;
  END IF;

  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'أضف عاملاً واحداً على الأقل. | Add at least one worker.' USING ERRCODE='check_violation';
  END IF;

  SELECT COALESCE(SUM((COALESCE(o.labor_time_minutes,0)/60.0) * COALESCE(w.labor_cost_rate,0)), 0)
    INTO v_conv
    FROM public.manufacturing_production_order_operations o
    JOIN public.manufacturing_work_centers w ON w.id = o.work_center_id
   WHERE o.production_order_id = p_production_order_id;
  v_est := ROUND(v_conv, 2);

  INSERT INTO public.production_labour_payments (
    company_id, branch_id, production_order_id, work_center_id, cost_center_id,
    payment_no, period_from, period_to, labour_type, payment_mode,
    payment_account_id, total_amount, estimated_amount, status, notes, created_by)
  VALUES (
    p_company_id, v_branch, p_production_order_id, v_wc.id, v_wc.cost_center_id,
    public.plw_next_payment_no(p_company_id, p_period_to), p_period_from, p_period_to,
    p_labour_type, p_payment_mode, p_payment_account_id, 0, v_est,
    CASE WHEN p_payment_mode = 'hours_only' THEN 'approved' ELSE 'draft' END,
    p_notes, v_uid)
  RETURNING id INTO v_id;

  FOR v_line IN SELECT value FROM jsonb_array_elements(p_lines) LOOP
    INSERT INTO public.production_labour_payment_lines
      (company_id, payment_id, casual_worker_id, employee_id, hours, amount, notes)
    VALUES (p_company_id, v_id,
      NULLIF(v_line->>'casual_worker_id','')::UUID,
      NULLIF(v_line->>'employee_id','')::UUID,
      COALESCE((v_line->>'hours')::NUMERIC, 0),
      CASE WHEN p_payment_mode = 'hours_only' THEN 0
           ELSE COALESCE((v_line->>'amount')::NUMERIC, 0) END,
      NULLIF(v_line->>'notes',''));
  END LOOP;

  SELECT COALESCE(SUM(amount),0) INTO v_total
    FROM public.production_labour_payment_lines WHERE payment_id = v_id;

  IF p_payment_mode = 'paid' AND v_total <= 0 THEN
    RAISE EXCEPTION 'إجمالى الصرف صفر — أدخل المبلغ المدفوع لكل عامل. | The total is zero; enter what each worker was paid.'
      USING ERRCODE='check_violation';
  END IF;

  UPDATE public.production_labour_payments
     SET total_amount = v_total, updated_at = NOW() WHERE id = v_id;

  RETURN jsonb_build_object('ok', true, 'id', v_id, 'total', v_total, 'estimated', v_est,
    'branch_id', v_branch, 'cost_center_id', v_wc.cost_center_id,
    'status', CASE WHEN p_payment_mode = 'hours_only' THEN 'approved' ELSE 'draft' END);
END;
$function$;

CREATE OR REPLACE FUNCTION public.plw_submit_labour_payment(p_company_id uuid, p_payment_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_p RECORD; v_role TEXT; v_lines INTEGER; v_sum NUMERIC(15,2);
BEGIN
  PERFORM public.assert_company_access(p_company_id);
  v_role := public.plw_caller_role(p_company_id);
  IF v_role NOT IN ('owner','admin','manager','manufacturing_officer','service') THEN
    RAISE EXCEPTION 'لا تملك صلاحية إرسال صرف الأجور للاعتماد. | Not permitted to submit for approval.' USING ERRCODE='check_violation';
  END IF;
  SELECT * INTO v_p FROM public.production_labour_payments
   WHERE id = p_payment_id AND company_id = p_company_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'الصرف غير موجود. | Payment not found.' USING ERRCODE='check_violation'; END IF;
  IF v_p.payment_mode = 'hours_only' THEN
    RAISE EXCEPTION 'تسجيل الساعات لا يحتاج اعتماداً — لا مال يتحرك فيه. | An hours-only record needs no approval; no money moves.'
      USING ERRCODE='check_violation';
  END IF;
  IF v_p.status NOT IN ('draft','rejected') THEN
    RAISE EXCEPTION 'لا يُرسل للاعتماد إلا صرف بحالة مسودة أو مرفوض (حالته: %). | Only a draft or rejected payment can be submitted (status: %).',
      v_p.status, v_p.status USING ERRCODE='check_violation';
  END IF;
  SELECT COUNT(*), COALESCE(SUM(amount),0) INTO v_lines, v_sum
    FROM public.production_labour_payment_lines WHERE payment_id = p_payment_id;
  IF v_lines = 0 THEN
    RAISE EXCEPTION 'لا يُرسل صرف بلا عمال. | Cannot submit a payment with no workers.' USING ERRCODE='check_violation';
  END IF;
  IF v_sum <= 0 THEN
    RAISE EXCEPTION 'إجمالى الصرف صفر — أدخل المبلغ المدفوع لكل عامل قبل الإرسال. | The total is zero; enter what each worker was paid.'
      USING ERRCODE='check_violation';
  END IF;
  UPDATE public.production_labour_payments
     SET total_amount = v_sum, status='pending_approval', submitted_by=auth.uid(), submitted_at=NOW(),
         rejected_by=NULL, rejected_at=NULL, rejection_reason=NULL, updated_at=NOW()
   WHERE id = p_payment_id;
  RETURN jsonb_build_object('ok', true, 'id', p_payment_id, 'status', 'pending_approval', 'total', v_sum);
END;
$function$;

CREATE OR REPLACE FUNCTION public.plw_approve_labour_payment(p_company_id uuid, p_payment_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_p RECORD; v_role TEXT; v_uid UUID := auth.uid(); v_sum NUMERIC(15,2);
BEGIN
  PERFORM public.assert_company_access(p_company_id);
  v_role := public.plw_caller_role(p_company_id);
  IF v_role NOT IN ('owner','admin','manager','service') THEN
    RAISE EXCEPTION 'الاعتماد من اختصاص المالك أو المدير العام وحدهما. | Only the owner or general manager may approve.'
      USING ERRCODE='check_violation';
  END IF;
  SELECT * INTO v_p FROM public.production_labour_payments
   WHERE id = p_payment_id AND company_id = p_company_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'الصرف غير موجود. | Payment not found.' USING ERRCODE='check_violation'; END IF;
  IF v_p.status <> 'pending_approval' THEN
    RAISE EXCEPTION 'لا يُعتمد إلا صرف بانتظار الاعتماد (حالته: %). | Only a payment awaiting approval can be approved (status: %).',
      v_p.status, v_p.status USING ERRCODE='check_violation';
  END IF;
  IF v_p.created_by IS NOT NULL AND v_p.created_by = v_uid AND v_role <> 'owner' THEN
    RAISE EXCEPTION 'لا تعتمد صرفاً أنشأتَه بنفسك — الاعتماد من المالك أو المدير العام. | You cannot approve a payment you created yourself.'
      USING ERRCODE='check_violation';
  END IF;
  SELECT COALESCE(SUM(amount),0) INTO v_sum
    FROM public.production_labour_payment_lines WHERE payment_id = p_payment_id;
  IF ROUND(v_sum,2) <> ROUND(v_p.total_amount,2) THEN
    RAISE EXCEPTION 'إجمالى الصرف (%) لا يساوى مجموع سطور العمال (%) — راجع البيانات قبل الاعتماد. | The total (%) does not equal the sum of worker lines (%).',
      v_p.total_amount, v_sum, v_p.total_amount, v_sum USING ERRCODE='check_violation';
  END IF;
  UPDATE public.production_labour_payments
     SET status='approved', approved_by=v_uid, approved_at=NOW(), updated_at=NOW()
   WHERE id = p_payment_id;
  RETURN jsonb_build_object('ok', true, 'id', p_payment_id, 'status', 'approved', 'total', v_sum);
END;
$function$;

CREATE OR REPLACE FUNCTION public.plw_reject_labour_payment(p_company_id uuid, p_payment_id uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_p RECORD; v_role TEXT;
BEGIN
  PERFORM public.assert_company_access(p_company_id);
  v_role := public.plw_caller_role(p_company_id);
  IF v_role NOT IN ('owner','admin','manager','service') THEN
    RAISE EXCEPTION 'الرفض من اختصاص المالك أو المدير العام. | Only the owner or general manager may reject.' USING ERRCODE='check_violation';
  END IF;
  IF COALESCE(btrim(p_reason),'') = '' THEN
    RAISE EXCEPTION 'اكتب سبب الرفض — فمن حق مسؤول التصنيع أن يعرف ما يُصلحه. | Write a rejection reason.' USING ERRCODE='check_violation';
  END IF;
  SELECT * INTO v_p FROM public.production_labour_payments
   WHERE id = p_payment_id AND company_id = p_company_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'الصرف غير موجود. | Payment not found.' USING ERRCODE='check_violation'; END IF;
  IF v_p.status <> 'pending_approval' THEN
    RAISE EXCEPTION 'لا يُرفض إلا صرف بانتظار الاعتماد (حالته: %). | Only a payment awaiting approval can be rejected (status: %).',
      v_p.status, v_p.status USING ERRCODE='check_violation';
  END IF;
  UPDATE public.production_labour_payments
     SET status='rejected', rejected_by=auth.uid(), rejected_at=NOW(),
         rejection_reason=btrim(p_reason), updated_at=NOW()
   WHERE id = p_payment_id;
  RETURN jsonb_build_object('ok', true, 'id', p_payment_id, 'status', 'rejected');
END;
$function$;

CREATE OR REPLACE FUNCTION public.plw_pay_labour_payment(p_company_id uuid, p_payment_id uuid, p_payment_date date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_p RECORD; v_role TEXT; v_uid UUID := auth.uid();
  v_acct RECORD; v_wage_acct UUID; v_entry UUID; v_date DATE;
  v_member_branch UUID; v_order_no TEXT;
BEGIN
  PERFORM public.assert_company_access(p_company_id);
  v_role := public.plw_caller_role(p_company_id);
  IF v_role NOT IN ('accountant','owner','admin','service') THEN
    RAISE EXCEPTION 'الصرف من اختصاص محاسب الفرع. | Paying is the branch accountant''s task.' USING ERRCODE='check_violation';
  END IF;
  SELECT * INTO v_p FROM public.production_labour_payments
   WHERE id = p_payment_id AND company_id = p_company_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'الصرف غير موجود. | Payment not found.' USING ERRCODE='check_violation'; END IF;

  -- v3.74.841 — فحص التكرار **قبل** فحص الحالة.
  -- كان بعده، فالضغط مرتين على «صرف» يُعطى «لا يُصرف إلا معتمد (حالته: paid)»
  -- — رسالة تُربك المحاسب وتبدو عطباً وهى نجاح سابق. الصرف المُنفَّذ يُعاد
  -- تأكيده بلا قيد ثانٍ.
  IF v_p.journal_entry_id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'id', p_payment_id, 'status', v_p.status,
      'journal_entry_id', v_p.journal_entry_id, 'amount', v_p.total_amount, 'idempotent', true);
  END IF;

  IF v_p.payment_mode = 'hours_only' THEN
    RAISE EXCEPTION 'تسجيل الساعات لا يُصرف — الموظف بمرتب ثابت مدفوع فى المرتبات. | An hours-only record is not paid.'
      USING ERRCODE='check_violation';
  END IF;
  IF v_p.status <> 'approved' THEN
    RAISE EXCEPTION 'لا يُصرف إلا صرف معتمد (حالته: %) — لا صرف بلا اعتماد المالك أو المدير العام. | Only an approved payment can be paid (status: %).',
      v_p.status, v_p.status USING ERRCODE='check_violation';
  END IF;
  IF v_role = 'accountant' THEN
    SELECT cm.branch_id INTO v_member_branch FROM public.company_members cm
     WHERE cm.company_id = p_company_id AND cm.user_id = v_uid LIMIT 1;
    IF v_member_branch IS NOT NULL AND v_member_branch <> v_p.branch_id THEN
      RAISE EXCEPTION 'هذا الصرف تابع لفرع آخر — محاسب الفرع يصرف من فرعه وحده. | This payment belongs to another branch.'
        USING ERRCODE='check_violation';
    END IF;
  END IF;
  v_date := COALESCE(p_payment_date, CURRENT_DATE);
  IF EXISTS (SELECT 1 FROM public.accounting_periods ap
              WHERE ap.company_id = p_company_id
                AND v_date BETWEEN ap.period_start AND ap.period_end
                AND (ap.is_locked IS TRUE OR ap.status IN ('closed','locked'))) THEN
    RAISE EXCEPTION 'الفترة المحاسبية لتاريخ % مقفلة. | The accounting period covering % is locked.',
      v_date, v_date USING ERRCODE='check_violation';
  END IF;
  SELECT * INTO v_acct FROM public.chart_of_accounts
   WHERE id = v_p.payment_account_id AND company_id = p_company_id;
  IF NOT FOUND OR COALESCE(v_acct.sub_type,'') NOT IN ('cash','bank') THEN
    RAISE EXCEPTION 'حساب الصرف لم يعد خزينة أو بنكاً. | The payment account is no longer a cash or bank account.' USING ERRCODE='check_violation';
  END IF;
  SELECT id INTO v_wage_acct FROM public.chart_of_accounts
   WHERE company_id = p_company_id AND (sub_type = 'manufacturing_labour' OR account_code = '5211')
   ORDER BY (sub_type = 'manufacturing_labour') DESC LIMIT 1;
  IF v_wage_acct IS NULL THEN
    RAISE EXCEPTION 'حساب «أجور عمالة تصنيع» (٥٢١١) غير موجود فى دليل الحسابات. | The manufacturing labour account (5211) is missing.'
      USING ERRCODE='check_violation';
  END IF;
  SELECT order_no INTO v_order_no FROM public.manufacturing_production_orders WHERE id = v_p.production_order_id;

  PERFORM set_config('app.allow_direct_post', 'true', true);

  INSERT INTO public.journal_entries
    (company_id, branch_id, cost_center_id, entry_number, entry_date, description,
     reference_type, reference_id, status, posted_by, posted_at)
  VALUES (p_company_id, v_p.branch_id, v_p.cost_center_id, v_p.payment_no, v_date,
    'صرف أجور عمالة تصنيع ' || COALESCE(v_p.payment_no,'') || ' — أمر ' || COALESCE(v_order_no,'') ||
    ' للفترة ' || v_p.period_from || ' إلى ' || v_p.period_to,
    'production_labour_payment', p_payment_id, 'posted', v_uid, NOW())
  RETURNING id INTO v_entry;

  INSERT INTO public.journal_entry_lines
    (journal_entry_id, account_id, debit_amount, credit_amount, description, branch_id, cost_center_id)
  VALUES
    (v_entry, v_wage_acct, v_p.total_amount, 0,
     'أجور عمالة تصنيع فعلية — أمر ' || COALESCE(v_order_no,''), v_p.branch_id, v_p.cost_center_id),
    (v_entry, v_p.payment_account_id, 0, v_p.total_amount,
     'صرف من ' || v_acct.account_name, v_p.branch_id, v_p.cost_center_id);

  PERFORM set_config('app.allow_direct_post', 'false', true);

  UPDATE public.production_labour_payments
     SET status='paid', paid_by=v_uid, paid_at=NOW(), journal_entry_id=v_entry, updated_at=NOW()
   WHERE id = p_payment_id;

  RETURN jsonb_build_object('ok', true, 'id', p_payment_id, 'status', 'paid',
    'journal_entry_id', v_entry, 'amount', v_p.total_amount,
    'estimated', v_p.estimated_amount,
    'variance', ROUND(v_p.total_amount - v_p.estimated_amount, 2));
END;
$function$;

CREATE OR REPLACE FUNCTION public.mwc_guard_work_centre_cost_centre()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- v3.74.841 — مركز عمل نشط بلا مركز تكلفة يجعل أجوره وأعباءه بلا جهة تُحمَّل
  -- عليها، فيستحيل تحليل تكلفة الإنتاج أو مقارنة المُستوعَب بالفعلى.
  -- يُفحص عند التفعيل فقط، فلا يُعطَّل تحرير مسودة قيد الإعداد.
  IF COALESCE(NEW.status, '') = 'active' AND NEW.cost_center_id IS NULL THEN
    RAISE EXCEPTION 'مركز العمل % «%» بلا مركز تكلفة — اختر مركز تكلفة له قبل تفعيله، وإلا تُحمَّل أجوره وأعباؤه بلا جهة فتستحيل مقارنة التكلفة الفعلية بالمعيارية. | Work centre % "%" has no cost centre; set one before activating it.',
      NEW.code, NEW.name, NEW.code, NEW.name
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_work_centre_cost_centre_required ON public.manufacturing_work_centers;
CREATE TRIGGER trg_work_centre_cost_centre_required
BEFORE INSERT OR UPDATE ON public.manufacturing_work_centers
FOR EACH ROW EXECUTE FUNCTION public.mwc_guard_work_centre_cost_centre();