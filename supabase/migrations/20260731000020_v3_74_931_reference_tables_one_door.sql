-- ═══════════════════════════════════════════════════════════════════
-- v3.74.931 — المراجع الخمسة: بابٌ واحدٌ لكل جدول، والقرارُ مكتوب
-- ═══════════════════════════════════════════════════════════════════
--
-- ═══════════ القرار أولاً: تبقى على مستوى الشركة ═══════════
--
-- `chart_of_accounts` · `cost_centers` · `warehouses` ·
-- `branch_shipping_providers` · `user_branch_access` — قِيست، وقُرِّر
-- إبقاؤها على مستوى الشركة **عن اختيارٍ لا عن سهو**. وهذه أسبابُه الثلاثة:
--
-- **(١) لا واحدٌ منها يحمل مبلغاً.** هى أسماءٌ وبنية: اسمُ الحساب، واسمُ
-- مركز التكلفة، واسمُ المخزن، وأى شركةِ شحنٍ تخدم أى فرع، ومن يدخل أى فرع.
-- وأخطرُ ما فيها اسمُ «مخزن مدينة نصر» — والفروعُ نفسُها ظاهرةٌ فى الشاشات.
--
-- **(٢) عزلُ دليل الحسابات خطأٌ صريح**: ١٠٢ حساباً فى الشركة، **٣ فقط**
-- تحمل فرعاً. فهو دليلُ الشركة الواحد بطبيعته، وأرصدتُه تأتى من القيود —
-- **وهى معزولةٌ منذ 917**.
--
-- **(٣) تُقرأ فى الربط فى كل مكان**: اسمُ المخزن على المستند، ومركزُ
-- التكلفة فى القيد. فعزلُها **يُفرغ أسماءً من شاشاتٍ ولا يُغلق بياناً**.
--
-- ═══════════ وما يُصلَح فعلاً: تعدُّدُ الأبواب ═══════════
--
-- على هذه الجداول **سياساتٌ مكرَّرةٌ تقول الشىءَ نفسه**: `cost_centers`
-- عليها **ثلاثُ** سياسات قراءة، و`warehouses` و`user_branch_access` و
-- `chart_of_accounts` على كلٍّ **اثنتان**.
--
-- ولا ثغرةَ فيها اليوم — كلُّها «عضو الشركة» أو «المالك المسجَّل»، و
-- `is_company_member` تشمل الاثنين. لكنها **نفسُ شكل الأبواب المتساهلة
-- المتجاورة** الذى أوقعنا خمسَ مرات (921 · 928 · 929 · 930). ومتى تعدّدت
-- السياسات، صار **تعديلُ واحدةٍ لا يعنى شيئاً ما دامت الأخرى مفتوحة**.
--
-- فتُدمج القراءةُ فى سياسةٍ واحدةٍ لكل جدول، **بنفس الحكم حرفاً بحرف**: لا
-- توسيعَ ولا تضييق.
--
-- ⚠️ **وسياستا `FOR ALL` تُقسَّمان** (درس 926): سياسةُ ALL تشمل القراءة،
-- فتبقى باباً ثانياً مهما دُمجت سياساتُ القراءة. فتُعاد كتابتُها ثلاثَ
-- سياساتِ كتابةٍ **بنفس شرطها**، فلا يخسر أحدٌ صلاحيةً كانت له.
--
-- **وتصحيحٌ واحدٌ صغير**: `branch_shipping_providers` كانت تسأل
-- `company_members` وحدها، فتحجب عن **المالك المسجَّل** غير العضو ما يملك —
-- نفس السهو المصحَّح فى 925 و927. فصارت `get_user_company_ids`.
-- ═══════════════════════════════════════════════════════════════════

-- ═══════ (١) دليل الحسابات ═══════

DROP POLICY IF EXISTS chart_accounts_owner_select ON public.chart_of_accounts;
DROP POLICY IF EXISTS chart_accounts_owner_dml    ON public.chart_of_accounts;

CREATE POLICY chart_of_accounts_owner_insert ON public.chart_of_accounts
FOR INSERT
WITH CHECK (company_id IN (SELECT c.id FROM public.companies c WHERE c.user_id = auth.uid()));

CREATE POLICY chart_of_accounts_owner_update ON public.chart_of_accounts
FOR UPDATE
USING      (company_id IN (SELECT c.id FROM public.companies c WHERE c.user_id = auth.uid()))
WITH CHECK (company_id IN (SELECT c.id FROM public.companies c WHERE c.user_id = auth.uid()));

CREATE POLICY chart_of_accounts_owner_delete ON public.chart_of_accounts
FOR DELETE
USING (company_id IN (SELECT c.id FROM public.companies c WHERE c.user_id = auth.uid()));

-- ═══════ (٢) مراكز التكلفة ═══════

DROP POLICY IF EXISTS "Users can view cost centers of their companies" ON public.cost_centers;
DROP POLICY IF EXISTS company_owner_initial_read_cost_centers          ON public.cost_centers;
DROP POLICY IF EXISTS cost_centers_select_policy                       ON public.cost_centers;
DROP POLICY IF EXISTS "Users can manage cost centers of their companies" ON public.cost_centers;

CREATE POLICY cost_centers_select_company ON public.cost_centers
FOR SELECT
USING (is_company_member(company_id));

CREATE POLICY cost_centers_manage_insert ON public.cost_centers
FOR INSERT
WITH CHECK (company_id IN (
  SELECT cm.company_id FROM public.company_members cm
   WHERE cm.user_id = auth.uid() AND cm.role IN ('owner','admin','accountant')));

CREATE POLICY cost_centers_manage_update ON public.cost_centers
FOR UPDATE
USING (company_id IN (
  SELECT cm.company_id FROM public.company_members cm
   WHERE cm.user_id = auth.uid() AND cm.role IN ('owner','admin','accountant')));

CREATE POLICY cost_centers_manage_delete ON public.cost_centers
FOR DELETE
USING (company_id IN (
  SELECT cm.company_id FROM public.company_members cm
   WHERE cm.user_id = auth.uid() AND cm.role IN ('owner','admin','accountant')));

-- ═══════ (٣) المخازن ═══════

DROP POLICY IF EXISTS company_owner_initial_read_warehouses ON public.warehouses;
DROP POLICY IF EXISTS warehouses_select_policy              ON public.warehouses;

CREATE POLICY warehouses_select_company ON public.warehouses
FOR SELECT
USING (is_company_member(company_id));

-- ═══════ (٤) صلاحيات الوصول للفروع ═══════

DROP POLICY IF EXISTS user_branch_access_select        ON public.user_branch_access;
DROP POLICY IF EXISTS user_branch_access_select_policy ON public.user_branch_access;

CREATE POLICY user_branch_access_select_company ON public.user_branch_access
FOR SELECT
USING (is_company_member(company_id));

-- ═══════ (٥) شركات الشحن بالفروع — ويُضاف المالك المسجَّل ═══════

DROP POLICY IF EXISTS branch_shipping_providers_select ON public.branch_shipping_providers;

CREATE POLICY branch_shipping_providers_select_company ON public.branch_shipping_providers
FOR SELECT
USING (
  branch_id IN (
    SELECT b.id FROM public.branches b
     WHERE b.company_id IN (SELECT get_user_company_ids())
  )
);

COMMENT ON POLICY warehouses_select_company ON public.warehouses IS
  'v3.74.931 — بابٌ واحد. والمخازن على مستوى الشركة عن قرارٍ مكتوب: اسمٌ لا مبلغ، ويُقرأ فى الربط على كل مستند.';
COMMENT ON POLICY cost_centers_select_company ON public.cost_centers IS
  'v3.74.931 — بابٌ واحد بعد ثلاثة، بنفس الحكم حرفاً بحرف.';
COMMENT ON POLICY branch_shipping_providers_select_company ON public.branch_shipping_providers IS
  'v3.74.931 — وأُضيف المالك المسجَّل الذى كانت السياسة القديمة تنساه (نفس سهو 925 و927).';
