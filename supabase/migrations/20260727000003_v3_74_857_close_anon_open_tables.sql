-- ════════════════════════════════════════════════════════════════════════════
-- v3.74.857 — إغلاق الجداول المفتوحة للزوار المجهولين
-- ════════════════════════════════════════════════════════════════════════════
--
-- 🔴 الفجوة (سببٌ جذرىٌّ واحد تكرَّر ١٢ مرة):
--
--   سياساتٌ سُمّيت باسم «حساب الخدمة» (service_role) لكنها كُتبت بلا
--   `TO service_role`. وفى Postgres، سياسةٌ متساهلة بلا تحديد دور تسرى على
--   `PUBLIC` — أى على **كل** الأدوار بما فيها `anon` (الزائر المجهول).
--   ولأن السياسات المتساهلة تُجمع بـ«أو»، فسياسةٌ واحدة `USING (true)`
--   تُلغى أثر كل السياسات المحكمة بجوارها.
--
--   والمفارقة: `service_role` له `rolbypassrls = true` — أى أنه يتخطى
--   الحماية أصلاً ولم يكن يحتاج هذه السياسات قط. أثرها الوحيد كان فتح الباب.
--
--   النتيجة قبل هذا الملف: أى زائر يحمل المفتاح العام (وهو منشور فى المتصفح)
--   كان يستطيع قراءة ١٧٤٬٣٩٥ صفاً من `system_logs` وحذفها كلها، وقراءة بريد
--   كل عميل سجَّل شركة، وحذف نسخهم الاحتياطية، وإدخال قيود تدقيق مزوَّرة.
--
-- 🟢 المبدأ المطبَّق هنا:
--   ١) تُحذف السياسة الزائدة فقط — وتُترك السياسات المحكمة الموجودة بجوارها.
--   ٢) ما يكتبه المستخدم يُقيَّد بعضوية شركته (`fn_user_company_ids()`).
--   ٣) ما هو بنية تحتية بحتة (السجلات، الحدود، المهام) يصير حكراً على
--      حساب الخدمة — والكود المقابل حُوِّل إليه فى نفس الإصدار.
--   ٤) تُسحب المنح (`GRANT`) من `anon` كطبقة دفاع ثانية: لو عاد أحدٌ يوماً
--      وكتب سياسةً مفتوحة بالخطأ، فلا منحة تسندها.
--
-- ⚠️ لا يمسّ هذا الملف أى بيانات محاسبية أو مخزنية. ولا يحذف أى سجل
--    (باستثناء صفٍّ واحدٍ تالفٍ فى `pending_companies` موثَّقٍ أدناه).
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- ١) السجلات النظامية — بنية تحتية: حكرٌ على حساب الخدمة
--    lib/logger.ts حُوِّل إلى createServiceClient() فى نفس الإصدار، وصفحات
--    saas-admin كذلك. لا يبقى مسارٌ شرعىٌّ يمرّ عبر دور المستخدم.
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS system_logs_service_role ON public.system_logs;
REVOKE ALL ON public.system_logs FROM anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- ٢) حدود معدَّل الطلبات — بنية تحتية بحتة.
--    المسار الوحيد إليها دالة SECURITY DEFINER تتخطى الحماية، فلا يتأثر شىء.
--    بقاؤها مفتوحة كان يعنى أن المهاجم يمسح سجل محاولاته ثم يعاود بلا حد.
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS rate_limits_service_role ON public.api_rate_limits;
REVOKE ALL ON public.api_rate_limits FROM anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- ٣) طابور المهام الخلفية — القراءة تبقى محصورة بشركات المستخدم عبر
--    jobs_queue_company_select، والكتابة كانت ممنوعة أصلاً (CHECK false).
--    صفحات saas-admin حُوِّلت إلى حساب الخدمة لتُبقى الرؤية الشاملة.
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS service_role_full_access_jobs ON public.jobs_queue;
REVOKE INSERT, UPDATE, DELETE ON public.jobs_queue FROM anon, authenticated;
REVOKE ALL ON public.jobs_queue FROM anon;

-- ─────────────────────────────────────────────────────────────────────────────
-- ٤) سجل الأحداث — تُترك السياستان المحكمتان كما هما:
--      app_events_company_insert / app_events_company_select
--    لأن كل نداءات emitEvent() تمرّ بدور المستخدم عمداً، فيسرى فحص الشركة.
--    تُحذف الزائدة فقط.
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS app_events_service_role ON public.app_events;
REVOKE ALL ON public.app_events FROM anon;
REVOKE DELETE ON public.app_events FROM authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- ٥) تقدُّم الإعداد — هنا تُصلَح فجوةٌ ثانية اكتُشفت أثناء الفحص:
--    app/api/onboarding/complete-step/route.ts يأخذ company_id من جسم الطلب
--    **بلا أى تحقق من عضوية المستخدم فيها**. أى مستخدم مسجَّل كان يستطيع
--    الكتابة على تقدُّم إعداد أى شركة أخرى.
--    السياسة الجديدة تفرض ما نسيه الكود: لا كتابة إلا فى شركةٍ أنت عضو فيها.
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS onboarding_service_write ON public.onboarding_progress;

CREATE POLICY onboarding_member_insert ON public.onboarding_progress
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (company_id IN (SELECT fn_user_company_ids()));

CREATE POLICY onboarding_member_update ON public.onboarding_progress
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING (company_id IN (SELECT fn_user_company_ids()))
  WITH CHECK (company_id IN (SELECT fn_user_company_ids()));

REVOKE ALL ON public.onboarding_progress FROM anon;
REVOKE DELETE ON public.onboarding_progress FROM authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- ٦) الاشتراكات ومقاييس الاستهلاك — جداول فوترة.
--    القراءة تبقى محصورة بشركة المستخدم؛ الكتابة حكرٌ على حساب الخدمة.
--    كان أى زائر مجهول يستطيع تعديل خطة اشتراك أى شركة.
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS subscriptions_service_write ON public.subscriptions;
REVOKE ALL ON public.subscriptions FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.subscriptions FROM authenticated;

DROP POLICY IF EXISTS usage_metrics_service_write ON public.usage_metrics;
REVOKE ALL ON public.usage_metrics FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.usage_metrics FROM authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- ٧) تصعيد الإشعارات — الكاتب الوحيد دالة حافّة تستعمل حساب الخدمة صراحةً.
--    تبقى القراءة محصورة بأعضاء الشركة.
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS service_role_can_insert_escalations ON public.notification_escalations;
REVOKE ALL ON public.notification_escalations FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.notification_escalations FROM authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- ٨) سجل التدقيق — القراءة والحذف كانا محكمين (مالك/مدير)، لكن الإدخال
--    كان `WITH CHECK (true)` للعموم: أى مجهول يستطيع دسّ قيد تدقيق مزوَّر
--    على أى شركة. وسجل التدقيق فى نظام محاسبى لا تقوم له قائمة إن أمكن تزويره.
--    ولا يُحذف أى صفّ من الـ٧٬٥٠٣ الموجودة.
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS audit_logs_insert ON public.audit_logs;

CREATE POLICY audit_logs_insert ON public.audit_logs
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (
    company_id IS NULL
    OR company_id IN (SELECT fn_user_company_ids())
  );

REVOKE ALL ON public.audit_logs FROM anon;
REVOKE UPDATE ON public.audit_logs FROM authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- ٩) النسخ الاحتياطية لاسم الشركة (pending_companies)
--
--    كانت السياسات الثلاث `true` للعموم:
--      • القراءة → أى زائر يسحب بريد كل عميل سجَّل، مع اسم شركته.
--      • الحذف   → أى زائر يمحو النسخة الاحتياطية لأى عميل، فيفقد اسم شركته
--                  عند التأكيد. وهو بالضبط العطب الذى أصلحناه فى 856 —
--                  لكنه كان مفتوحاً للعالم كله، لا لخطأ ترتيبٍ فى الكود.
--
--    التصميم الجديد: `anon` له **الإدخال فقط**. لا قراءة، لا تعديل، لا حذف.
--    والمستخدم المسجَّل يقرأ ويحذف سجلّ **بريده هو** لا غير.
-- ─────────────────────────────────────────────────────────────────────────────

-- ٩-أ) صفٌّ تالف من عهد الباب المفتوح: قيمة `user_email` فيه "water way"
--      وليست بريداً إلكترونياً أصلاً، فلا يمكن أن تطابق أى حساب إطلاقاً.
--      (اسم الشركة المسجَّل فيه: "Water way" — وله صفٌّ سليمٌ مقابل بالبريد
--      waci8989@gmail.com بنفس الاسم، فلا تضيع معلومة.)
DELETE FROM public.pending_companies
WHERE user_email !~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$';

-- ٩-ب) قيود بنيوية: بريدٌ صحيح، بحروف صغيرة، وسجلٌّ واحدٌ لكل بريد.
ALTER TABLE public.pending_companies
  DROP CONSTRAINT IF EXISTS pending_companies_email_shape;
ALTER TABLE public.pending_companies
  ADD CONSTRAINT pending_companies_email_shape
  CHECK (
    user_email = lower(user_email)
    AND user_email ~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$'
  );

-- ٩-ج) السياسات الجديدة
DROP POLICY IF EXISTS "Anyone can insert pending company" ON public.pending_companies;
DROP POLICY IF EXISTS "Users can read their pending company" ON public.pending_companies;
DROP POLICY IF EXISTS "Users can delete their pending company" ON public.pending_companies;

-- الإدخال يجب أن يبقى مفتوحاً: يحدث قبل وجود الحساب أصلاً (شاشة التسجيل).
CREATE POLICY pending_companies_signup_insert ON public.pending_companies
  AS PERMISSIVE FOR INSERT TO anon, authenticated
  WITH CHECK (true);

-- القراءة والحذف يحدثان بعد تأكيد البريد وتسجيل الدخول — فيُربطان بصاحبهما.
CREATE POLICY pending_companies_owner_select ON public.pending_companies
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (user_email = lower(coalesce(auth.jwt() ->> 'email', '')));

CREATE POLICY pending_companies_owner_delete ON public.pending_companies
  AS PERMISSIVE FOR DELETE TO authenticated
  USING (user_email = lower(coalesce(auth.jwt() ->> 'email', '')));

REVOKE ALL ON public.pending_companies FROM anon;
GRANT INSERT ON public.pending_companies TO anon;
REVOKE UPDATE ON public.pending_companies FROM anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- ١٠) طبقة دفاع ثانية على البيانات المرجعية العامة
--
--     هذه الجداول قراءتها للعموم **مقصودة** (شاشة التسجيل تعرض العملات
--     والخطط والدول قبل وجود حساب). لكن `anon` كان يملك عليها منح
--     INSERT/UPDATE/DELETE أيضاً — بلا سياسة تسمح بها، فالحماية تمنعها اليوم.
--
--     تُسحب المنح رغم ذلك: فلو أضاف أحدٌ يوماً سياسةً متساهلة بالخطأ، لا
--     تجد منحةً تسندها. الحماية طبقتان لا طبقة.
-- ─────────────────────────────────────────────────────────────────────────────
REVOKE INSERT, UPDATE, DELETE ON
  public.country_vat_rates,
  public.global_currencies,
  public.subscription_plans,
  public.volume_discount_tiers,
  public.permissions,
  public.roles,
  public.role_default_permissions,
  public.integrity_check_definitions
FROM anon;

COMMIT;
