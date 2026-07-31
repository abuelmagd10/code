-- ═══════════════════════════════════════════════════════════════════
-- v3.74.923 — عروض الأسعار تُعزل بالفرع
-- ═══════════════════════════════════════════════════════════════════
--
-- ثالث جدولٍ من التسعة عشر، ونظيرُ 922 حرفاً بحرف فى شكله — ولهذا لم
-- يُطرح فيه سؤالٌ جديد: القرار المتّخذ فى 922 (**الفرعُ فوق الإنشاء**)
-- ينطبق كما هو.
--
-- ═══════════ ما قِيس قبل الكتابة ═══════════
--
-- **بالانتحال على الإنتاج** (عرضان: واحدٌ للرئيسى وواحدٌ لمدينة نصر):
--     المحاسب ٠ · المدير ١ (لا شىء من غير فرعه) · مسئول التصنيع ٠ ·
--     مسئول المشتريات ٠ · مدير المخزن ٠ · المالك ٢ · المالك المسجَّل ٢ ·
--     **والموظف ١ — وهو عرضُ نصر وحده، وبندُه معه**.
--
-- فالموظف عضوٌ فى **الفرع الرئيسى**، ويرى عرض نصر لأنه مُنشئه لا لأن
-- الفرع فرعُه. ونفس الذراع يحمل `has_shared_access` خارج قيد الفرع.
--
-- ═══════════ وثلاث سياساتٍ زائدة، قِيست ولم تُفترض ═══════════
--
-- هنا — بخلاف أوامر البيع — ثلاث سياساتٍ متساهلةٍ تفتح للمالك المسجَّل
-- ما هو مفتوحٌ له أصلاً بغيرها:
--     `estimates_owner_dml`          (ALL)
--     `estimate_items_owner_dml`     (ALL)
--     `estimate_items_owner_select`  (SELECT)
--
-- **ولماذا هى زائدة**: `can_modify_data` و`can_delete_resource` تبدآن
-- كلتاهما بـ«المالك المسجَّل ⇒ صحيح»، و`estimate_items_select` تُمرّره
-- عبر `is_company_member`، والسياسة الجديدة تُمرّره عبر
-- `current_user_resource_visibility` = 'company'. فلا تمنحه هذه الثلاث
-- شيئاً لم يكن ليناله.
--
-- **وقِيس ذلك على الاختبار فى معاملةٍ ملغاة**: بعد حذف الثلاث، المالك
-- المسجَّل **أنشأ عرضاً وبنداً، وقرأ البند، وعدّل الاثنين، وحذفهما** —
-- كلُّها نجحت. والموظف فقد عرض نصر وبندَه فى الوقت نفسه.
--
-- وتُحذف لأنها **أبوابٌ متساهلةٌ ثانيةٌ بجوار العزل** — وهو الشكل الذى
-- أنتج مصيدة 917. ولا يكفى أن يكون نصُّها صحيحاً اليوم.
--
-- ═══════════ والحكم، وهو حكم 922 نفسه ═══════════
--
-- نظام الرؤية يبقى كما هو (شركة · فرع · مستنداتى · مشاركة)، ويُلفّ كلُّه
-- داخل `can_access_record_branch`.
-- ═══════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS estimates_owner_dml         ON public.estimates;
DROP POLICY IF EXISTS estimate_items_owner_dml    ON public.estimate_items;
DROP POLICY IF EXISTS estimate_items_owner_select ON public.estimate_items;
DROP POLICY IF EXISTS estimates_select_v4         ON public.estimates;

CREATE POLICY estimates_select_branch_isolation ON public.estimates
FOR SELECT
USING (
  public.is_company_member(company_id)
  AND (
       public.current_user_resource_visibility(company_id, 'estimates') = 'company'
    OR (public.current_user_resource_visibility(company_id, 'estimates') = 'branch'
        AND (branch_id IS NULL OR branch_id = public.current_user_branch_id(company_id)))
    OR (public.current_user_resource_visibility(company_id, 'estimates') = 'own'
        AND created_by_user_id = auth.uid())
    OR public.has_shared_access(company_id, 'estimates', created_by_user_id)
  )
  AND public.can_access_record_branch(company_id, branch_id)
);

COMMENT ON POLICY estimates_select_branch_isolation ON public.estimates IS
  'v3.74.923 — نظام الرؤية كما هو ملفوفاً داخل قيد الفرع (نظير 922). وحلّت محل سياسة القراءة القديمة وثلاث سياساتٍ متساهلةٍ للمالك المسجَّل قِيست زائدةً ولم تُفترض.';
