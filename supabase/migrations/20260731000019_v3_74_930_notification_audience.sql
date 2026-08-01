-- ═══════════════════════════════════════════════════════════════════
-- v3.74.930 — الإشعارُ يصل إلى صاحبه وحده
-- ═══════════════════════════════════════════════════════════════════
--
-- **وهذا هو البابُ الذى بدأت منه السلسلة كلُّها.** فى 917 أغلقنا فاتورةَ
-- مدينة نصر عن محاسب الفرع الرئيسى — لكن **الإشعار** الذى دلّه عليها،
-- وفيه اسمُ المورد والرقم ٩٨٦٫١٠ نصّاً، بقى كما هو.
--
-- **وإغلاقُ المستند دون الإشعار الذى يصفه إغلاقٌ ناقص.**
--
-- ═══════════ ما قِيس على الإنتاج ═══════════
--
-- من ٥٠٥ إشعاراتٍ فى الشركة، **كلُّ دورٍ كان يرى ٥٠٣**:
--
--   المحاسب ٥٠٣ · المدير ٥٠٣ · مسئول التصنيع ٥٠٣ · مسئول المشتريات ٥٠٣ ·
--   الموظف ٥٠٣ · مدير المخزن ٥٠٣
--
-- ومنها **٧٧ إشعاراً لمدينة نصر** يراها الجميع، و**٢٥٠ إلى ٢٧٤ إشعاراً
-- موجَّهاً بالاسم إلى شخصٍ آخر** — كلٌّ يقرأ بريد زميله.
--
-- ═══════════ ولماذا؟ سياستان، وفى إحداهما خطأٌ مطبعى ═══════════
--
-- **(١) `Users can view their own notifications`** فيها ذراع
-- `assigned_to_user IS NULL` بلا أى قيدٍ آخر — فكلُّ إشعارٍ غير موجَّهٍ
-- لشخصٍ بعينه مفتوحٌ لكل عضوٍ فى الشركة، أياً كان فرعُه ودورُه.
--
-- **(٢) `Users can view their notifications`** كُتبت لتقيّد بالفرع، وفيها:
--
--     (cm.branch_id IS NULL) OR (cm.branch_id = cm.branch_id)
--
-- **وهذا الشرطُ صادقٌ دائماً**: يقارن فرعَ العضو **بنفسه**، لا بفرع
-- الإشعار. والصواب `notifications.branch_id = cm.branch_id`. ومثلُه فى
-- المخزن حرفاً بحرف.
--
-- فالسياسةُ **تبدو مقيَّدةً بالفرع وليست كذلك**. وهو شكلٌ أخبثُ مما رأيناه
-- فى 928: هناك سياسةٌ صحيحةٌ يبتلعها جارُها، وهنا **سياسةٌ واحدةٌ تكذب على
-- قارئها بحرفٍ واحد**.
--
-- ═══════════ والحكم: الجمهورُ لا الفرعُ وحده ═══════════
--
-- الإشعارُ ليس مستنداً، فلا يكفى فيه سؤالُ الفرع. سؤالُه: **لمن كُتب؟**
--
--   ١. **موجَّهٌ إلىَّ بالاسم** ⇒ أقرؤه، **ولو كان لفرعٍ آخر** — شخصٌ
--      قصدنى، وحجبُه يترك إشعاراً لا يقرؤه أحد.
--   ٢. **الإدارة العليا والمالك المسجَّل** ⇒ يرون إشعارات الشركة كلَّها،
--      كما كانت السياسة الأولى تنصّ.
--   ٣. **غيرُ موجَّهٍ لشخص** ⇒ يُقرأ بشرطين معاً: **دورى** (أو بلا دور)،
--      و**فرعى** (`can_access_record_branch`).
--
-- وتُطبَّق القاعدةُ نفسُها على **التعديل**: من لا يقرأ الإشعار لا يعلّمه
-- مقروءاً. (وكانت سياسةُ التعديل القديمة تسمح لأى صاحب دورٍ أن يعلّم إشعار
-- زميله.)
--
-- ═══════════ وما لم يُغلق، ويُسجَّل ═══════════
--
-- **٣٠٠ من ٥٠٥ إشعاراً بلا فرعٍ أصلاً** — ومنها ٥٩ إشعارَ فاتورة شراء و٤٧
-- إشعارَ أمر شراء. فمن يكتب الإشعار لا يختم عليه فرعَ مستنده، فيبقى
-- «إشعارَ شركة» ويُقرأ بالدور وحده.
--
-- وذلك **عطبٌ فى الكاتب لا فى القارئ**، وعلاجُه ختمُ الفرع فى كل مُنشئ
-- إشعار — عملٌ يمسّ محفِّزاتٍ كثيرة، فلا يُخلط بدفعةٍ أمنيةٍ للقراءة.
-- سُجّل فى دفتر التسليم بالأرقام.
-- ═══════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "Users can view their notifications"       ON public.notifications;
DROP POLICY IF EXISTS "Users can view their own notifications"   ON public.notifications;
DROP POLICY IF EXISTS "Users can update their notifications"     ON public.notifications;
DROP POLICY IF EXISTS "Users can update their own notifications" ON public.notifications;

CREATE POLICY notifications_select_addressee_and_branch ON public.notifications
FOR SELECT
USING (
  company_id IN (SELECT get_user_company_ids())
  AND (
       assigned_to_user = auth.uid()
    OR EXISTS (
         SELECT 1 FROM public.company_members cm
          WHERE cm.company_id = notifications.company_id
            AND cm.user_id = auth.uid()
            AND lower(btrim(cm.role)) IN ('owner','admin','general_manager','gm','generalmanager'))
    OR EXISTS (
         SELECT 1 FROM public.companies c
          WHERE c.id = notifications.company_id AND c.user_id = auth.uid())
    OR (
         assigned_to_user IS NULL
         AND (
              assigned_to_role IS NULL
           OR EXISTS (
                SELECT 1 FROM public.company_members cm2
                 WHERE cm2.company_id = notifications.company_id
                   AND cm2.user_id = auth.uid()
                   AND cm2.role = notifications.assigned_to_role)
         )
         AND public.can_access_record_branch(company_id, branch_id)
       )
  )
);

CREATE POLICY notifications_update_addressee_and_branch ON public.notifications
FOR UPDATE
USING (
  company_id IN (SELECT get_user_company_ids())
  AND (
       assigned_to_user = auth.uid()
    OR EXISTS (
         SELECT 1 FROM public.company_members cm
          WHERE cm.company_id = notifications.company_id
            AND cm.user_id = auth.uid()
            AND lower(btrim(cm.role)) IN ('owner','admin','general_manager','gm','generalmanager'))
    OR EXISTS (
         SELECT 1 FROM public.companies c
          WHERE c.id = notifications.company_id AND c.user_id = auth.uid())
    OR (
         assigned_to_user IS NULL
         AND (
              assigned_to_role IS NULL
           OR EXISTS (
                SELECT 1 FROM public.company_members cm2
                 WHERE cm2.company_id = notifications.company_id
                   AND cm2.user_id = auth.uid()
                   AND cm2.role = notifications.assigned_to_role)
         )
         AND public.can_access_record_branch(company_id, branch_id)
       )
  )
);

COMMENT ON POLICY notifications_select_addressee_and_branch ON public.notifications IS
  'v3.74.930 — الإشعارُ لصاحبه: موجَّهٌ إلىَّ بالاسم، أو بدورى وفرعى، أو للإدارة العليا. وحلّت محل سياستين إحداهما تقارن فرعَ العضو بنفسه.';
COMMENT ON POLICY notifications_update_addressee_and_branch ON public.notifications IS
  'v3.74.930 — من لا يقرأ الإشعار لا يعلّمه مقروءاً.';
