-- ============================================================================
-- 🔒 v3.74.844 — دوال جديدة كانت متاحة للزائر بالوراثة (أمسكها فحص لوحة التحكم)
-- ============================================================================
-- ظهر فى لوحة سلامة النظام: **«دوال تقرأ بيانات شركة ويمكن نداؤها بدون تسجيل
-- دخول» — انحراف واحد متوسط**. والمُشار إليها `plw_next_payment_no` التى
-- كتبتها فى ٨٤١.
--
-- ── السبب: `CREATE FUNCTION` يمنح EXECUTE لـ PUBLIC تلقائياً ──────────────
-- و`PUBLIC` تشمل `anon` (الزائر غير المسجَّل). ومنحُ الصلاحية صراحةً
-- (`GRANT ... TO authenticated`) **لا يُلغى** المنح الموروث — فالدالة تبقى
-- متاحة للجميع رغم أن السطر التالى يبدو وكأنه يحصرها.
--
-- ولذلك، بفحص كل ما أنشأته أمس واليوم، تبيّن أن **عشر دوال** مفتوحة للزائر لا
-- واحدة: دوال مسار الأجور كلها، ومساعداتها، وحارسان.
--
-- ── الأثر الفعلى ─────────────────────────────────────────────────────────
-- محدود لكنه حقيقى: `plw_next_payment_no` تقرأ `production_labour_payments`
-- بمُعرِّف شركة يُمرَّر إليها، فيستطيع زائر استكشاف ترقيم صرفيات أى شركة.
-- أما دوال المسار (إنشاء/اعتماد/صرف) فتفحص الدور داخلياً وتردّ الزائر
-- («none»)، لكن **إتاحتها له أصلاً خطأ**: طبقة دفاع تُترك مفتوحة اعتماداً على
-- طبقة أخرى.
--
-- ── العلاج ───────────────────────────────────────────────────────────────
-- • **مساعدات داخلية** (`plw_caller_role` · `plw_next_payment_no` ·
--   `mr_assert_routing_operations_costable` ·
--   `mpoe_assert_materials_issued_before_receipt`): تُسحب من الجميع.
--   لا يتعطّل شىء: تُنادى من داخل دوال SECURITY DEFINER تعمل بصلاحية مالكها.
-- • **دوال المسار**: تُسحب من PUBLIC و anon، وتُمنح لـ authenticated وحده.
-- • `auth_email_state` تبقى متاحة للزائر **عن قصد** (شاشة ما قبل الدخول)،
--   وهى محدودة المعدّل داخلياً وتُرجع بتاً واحداً — والفحص لا يُشير إليها
--   لأنها لا تقرأ بيانات شركة.
--
-- ── التحقق ───────────────────────────────────────────────────────────────
-- `ic_anon_reachable_readers()` على الإنتاج: **صفر** بعد الإصلاح.
--
-- ── الدرس ────────────────────────────────────────────────────────────────
-- **كل دالة جديدة تُسحب صلاحيتها من PUBLIC صراحةً، ثم تُمنح لمن يحتاجها.**
-- والمنح الصريح لا يُغنى عن السحب — وهذا ما فات فى ٨٤١، ولم يكشفه أى فحص من
-- فحوصى، بل **فحص سلامة النظام الذى بناه المشروع لنفسه**.
-- ============================================================================

REVOKE ALL ON FUNCTION public.plw_caller_role(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.plw_next_payment_no(uuid, date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mr_assert_routing_operations_costable(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mpoe_assert_materials_issued_before_receipt(uuid) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.plw_create_labour_payment(uuid,uuid,date,date,text,text,uuid,jsonb,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.plw_submit_labour_payment(uuid,uuid)  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.plw_approve_labour_payment(uuid,uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.plw_reject_labour_payment(uuid,uuid,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.plw_pay_labour_payment(uuid,uuid,date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.plw_upsert_casual_worker(uuid,text,text,text,uuid,uuid,boolean) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.plw_create_labour_payment(uuid,uuid,date,date,text,text,uuid,jsonb,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.plw_submit_labour_payment(uuid,uuid)  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.plw_approve_labour_payment(uuid,uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.plw_reject_labour_payment(uuid,uuid,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.plw_pay_labour_payment(uuid,uuid,date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.plw_upsert_casual_worker(uuid,text,text,text,uuid,uuid,boolean) TO authenticated, service_role;
