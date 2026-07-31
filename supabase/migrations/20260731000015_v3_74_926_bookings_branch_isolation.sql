-- ═══════════════════════════════════════════════════════════════════
-- v3.74.926 — عائلة الحجوزات تُعزل بالفرع، والتكليفُ يفتح ما يفتحه
-- ═══════════════════════════════════════════════════════════════════
--
-- سادس جدولٍ من التسعة عشر — **وهو ثمانية جداول لا جدولان**.
--
-- ═══════════ ما قِيس قبل الكتابة ═══════════
--
-- بالانتحال على الإنتاج، وما يراه عضو الفرع من **حجزَى مدينة نصر**:
--
--   `bookings`                    نظام رؤية (v5)   الموظف ٢ · الباقون ٠
--   `booking_staff_assignments`   مستوى الشركة     **الجميع ٢**
--   `booking_notes`               مستوى الشركة     **الجميع ٢**
--   `booking_stock_withdrawals`   مستوى الشركة     ٠ (لا بيانات بعد)
--   `booking_bundle_selections`   مستوى الشركة ALL ٠ (لا بيانات بعد)
--   `booking_extra_items`         مستوى الشركة ALL ٠ (لا بيانات بعد)
--   `booking_status_history`      يسأل عن حجزه     ٠ ✅ يتبع أباه
--   `booking_payments`            `can_access_record_branch` ✅ أُغلق من قبل
--
-- **والملاحظات أخطرُ مما تبدو**: نصٌّ حرٌّ عن عميل فرعٍ آخر يقرؤه كلُّ
-- موظف. **والتكليفات** تكشف من يخدم من فى فرعٍ ليس فرعَه.
--
-- **وشاهدٌ يستحق التسجيل**: `booking_payments` أُغلقت صحيحاً بالقاعدة
-- نفسها قبل هذه الدفعة. فالقاعدة كانت معروفةً فى المشروع **ولم تُعمَّم** —
-- وهذا بالضبط ما يفعله الحارس منذ 921: يمنع أن تُعرف قاعدةٌ فى مكانٍ
-- وتُنسى فى سبعة.
--
-- ═══════════ والحالة التى لم تظهر فى الخمسة السابقة ═══════════
--
-- حجزا نصر: **أنشأهما مسئولُ تصنيعٍ من الفرع الرئيسى**، و**الموظفُ
-- المكلَّف بهما من الفرع الرئيسى**، ومُدرَجٌ عليهما فى جدول التكليفات.
--
-- فهذا **عملٌ حقيقىٌّ عابرٌ للفروع**. ولو طُبّق «الفرع فوق الإنشاء» كما فى
-- 922 و923 **لفقد الموظفُ الحجزَ الذى كُلّف بخدمته** — وذلك كسرٌ للعمل لا
-- إغلاقٌ لثغرة.
--
-- **والفرق عن 922**: هناك «أنا من أنشأه» — ادعاءُ ماضٍ لا يُلزم أحداً.
-- وهنا «أنا مكلَّفٌ بخدمته» — **تكليفٌ قائم** أصدره صاحبُ الحجز.
--
-- ═══════════ الحكم (قرار المالك) ═══════════
--
-- **التكليفُ يفتح الحجزَ وحده**: من كُلّف بحجزٍ رآه ورأى ما يتبعه، ولم
-- تُفتح له بقيةُ حجوز ذلك الفرع. **والإنشاءُ وحده لا يعبر الجدار** (كما
-- 922)، **والمشاركةُ لا تعبره** (كما 922).
--
-- وحكمٌ واحدٌ فى دالةٍ واحدة (`can_access_booking`) تستعمله السياساتُ
-- كلُّها — فلا يُكتب الشرط ثمانى مرات ويُنسى فى واحدة.
--
-- ⚠️ **ومصيدةٌ لولا الانتباه**: لو سأل شرطُ الحجز عن جدول التكليفات
-- **داخل السياسة مباشرةً**، لطُبّقت سياسةُ التكليفات على ذلك السؤال —
-- فيُحجب صفُّ التكليف عن صاحبه، فيسقط ذراعُ التكليف من حيث أراد أن يفتح.
-- ولهذا السؤالُ فى دالة `SECURITY DEFINER`، **وصفُّ التكليف مفتوحٌ
-- لصاحبه** فى سياسته.
-- ═══════════════════════════════════════════════════════════════════

-- ═══════ (١) هل أنا مكلَّفٌ بهذا الحجز؟ ═══════

CREATE OR REPLACE FUNCTION public.is_booking_assignee(p_booking_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN FALSE;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.booking_staff_assignments bsa
     WHERE bsa.booking_id = p_booking_id
       AND bsa.user_id = auth.uid()
  );
END;
$function$;

-- ═══════ (٢) الحكم كلُّه فى موضعٍ واحد ═══════

CREATE OR REPLACE FUNCTION public.can_access_booking(p_booking_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_company UUID;
  v_branch  UUID;
  v_creator UUID;
  v_staff   UUID;
  v_vis     TEXT;
BEGIN
  SELECT b.company_id, b.branch_id, b.created_by_user_id, b.staff_user_id
    INTO v_company, v_branch, v_creator, v_staff
    FROM public.bookings b
   WHERE b.id = p_booking_id;

  IF v_company IS NULL THEN
    RETURN FALSE;
  END IF;

  IF NOT public.is_company_member(v_company) THEN
    RETURN FALSE;
  END IF;

  v_vis := public.current_user_resource_visibility(v_company, 'bookings');

  IF v_vis = 'company' THEN
    RETURN TRUE;
  END IF;

  IF v_vis = 'branch' THEN
    RETURN v_branch IS NULL OR v_branch = public.current_user_branch_id(v_company);
  END IF;

  IF v_vis = 'own' THEN
    -- التكليفُ القائم يعبر الجدار: هذا عملٌ أُسند إليه.
    IF v_staff IS NOT NULL AND v_staff = auth.uid() THEN
      RETURN TRUE;
    END IF;

    IF public.is_booking_assignee(p_booking_id) THEN
      RETURN TRUE;
    END IF;

    -- والإنشاءُ وحده لا يعبره (قاعدة 922)، وكذلك حجزٌ بلا موظفٍ مسنَد.
    IF (v_creator = auth.uid() OR v_staff IS NULL)
       AND public.can_access_record_branch(v_company, v_branch) THEN
      RETURN TRUE;
    END IF;
  END IF;

  -- والمشاركةُ لا تعبر الجدار (قاعدة 922).
  RETURN public.has_shared_access(v_company, 'bookings', v_creator)
     AND public.can_access_record_branch(v_company, v_branch);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.is_booking_assignee(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_booking(uuid)  TO authenticated;

-- ═══════ (٣) الحجز نفسه ═══════

DROP POLICY IF EXISTS bookings_select_v5 ON public.bookings;

CREATE POLICY bookings_select_branch_isolation ON public.bookings
FOR SELECT
USING (
  company_id IN (SELECT get_user_company_ids())
  AND public.can_access_booking(id)
);

-- ═══════ (٤) جداولُ تحمل فرعَها بنفسها ═══════
-- وصفُّ التكليف مفتوحٌ لصاحبه دائماً: هو الدليل على تكليفه، ولولا ذلك
-- لَما رأى الموظفُ سببَ فتح الحجز له.

DROP POLICY IF EXISTS booking_staff_assignments_select ON public.booking_staff_assignments;

CREATE POLICY booking_staff_assignments_select_branch_isolation ON public.booking_staff_assignments
FOR SELECT
USING (
  company_id IN (SELECT get_user_company_ids())
  AND (
       public.can_access_record_branch(company_id, branch_id)
    OR user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS bsw_company_select ON public.booking_stock_withdrawals;

CREATE POLICY booking_stock_withdrawals_select_branch_isolation ON public.booking_stock_withdrawals
FOR SELECT
USING (
  company_id IN (SELECT get_user_company_ids())
  AND public.can_access_record_branch(company_id, branch_id)
);

-- ═══════ (٥) جداولٌ بلا عمود فرع: تتبع حجزَها ═══════

DROP POLICY IF EXISTS booking_notes_select ON public.booking_notes;

CREATE POLICY booking_notes_select_branch_isolation ON public.booking_notes
FOR SELECT
USING (
  company_id IN (SELECT get_user_company_ids())
  AND public.can_access_booking(booking_id)
);

-- والاثنتان التاليتان كانتا سياسةً واحدةً لكل العمليات (ALL)، فتُقسم:
-- القراءةُ تتبع الحجز، والكتابةُ تبقى **كما كانت حرفاً بحرف** — فليست
-- هذه دفعةَ تغييرِ صلاحياتِ كتابة.

DROP POLICY IF EXISTS bbs_company_isolation ON public.booking_bundle_selections;

CREATE POLICY booking_bundle_selections_select_branch_isolation ON public.booking_bundle_selections
FOR SELECT
USING (
  company_id IN (SELECT get_user_company_ids())
  AND public.can_access_booking(booking_id)
);

-- ⚠️ ولا تُكتب الكتابةُ بـ`FOR ALL`: سياسةُ ALL تشمل القراءةَ أيضاً،
--    وتعدُّدُ السياسات المتساهلة يُجمع بـOR — فتُعيد فتحَ ما أُغلق للتوّ.
--    وهذه مصيدة 917 نفسها، تدخل من باب «حفظِ صلاحيات الكتابة».
CREATE POLICY bbs_company_insert ON public.booking_bundle_selections
FOR INSERT
WITH CHECK (
  company_id IN (SELECT company_members.company_id FROM public.company_members
                  WHERE company_members.user_id = auth.uid())
);

CREATE POLICY bbs_company_update ON public.booking_bundle_selections
FOR UPDATE
USING (
  company_id IN (SELECT company_members.company_id FROM public.company_members
                  WHERE company_members.user_id = auth.uid())
)
WITH CHECK (
  company_id IN (SELECT company_members.company_id FROM public.company_members
                  WHERE company_members.user_id = auth.uid())
);

CREATE POLICY bbs_company_delete ON public.booking_bundle_selections
FOR DELETE
USING (
  company_id IN (SELECT company_members.company_id FROM public.company_members
                  WHERE company_members.user_id = auth.uid())
);

DROP POLICY IF EXISTS bei_company_isolation ON public.booking_extra_items;

CREATE POLICY booking_extra_items_select_branch_isolation ON public.booking_extra_items
FOR SELECT
USING (
  company_id IN (SELECT get_user_company_ids())
  AND public.can_access_booking(booking_id)
);

CREATE POLICY bei_company_insert ON public.booking_extra_items
FOR INSERT
WITH CHECK (
  company_id IN (SELECT company_members.company_id FROM public.company_members
                  WHERE company_members.user_id = auth.uid())
);

CREATE POLICY bei_company_update ON public.booking_extra_items
FOR UPDATE
USING (
  company_id IN (SELECT company_members.company_id FROM public.company_members
                  WHERE company_members.user_id = auth.uid())
)
WITH CHECK (
  company_id IN (SELECT company_members.company_id FROM public.company_members
                  WHERE company_members.user_id = auth.uid())
);

CREATE POLICY bei_company_delete ON public.booking_extra_items
FOR DELETE
USING (
  company_id IN (SELECT company_members.company_id FROM public.company_members
                  WHERE company_members.user_id = auth.uid())
);

COMMENT ON POLICY bookings_select_branch_isolation ON public.bookings IS
  'v3.74.926 — التكليفُ القائم يفتح الحجز، والإنشاءُ والمشاركةُ لا يعبران الفرع.';
COMMENT ON POLICY booking_staff_assignments_select_branch_isolation ON public.booking_staff_assignments IS
  'v3.74.926 — التكليف بقيد فرعه، وصفُّ المرء مفتوحٌ له دائماً — وهو دليلُ تكليفه.';
COMMENT ON POLICY booking_notes_select_branch_isolation ON public.booking_notes IS
  'v3.74.926 — الملاحظة نصٌّ حرٌّ عن عميل، فتتبع حجزَها ولا تُقرأ بعضوية الشركة.';
