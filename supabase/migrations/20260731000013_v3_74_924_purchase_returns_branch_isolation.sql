-- ═══════════════════════════════════════════════════════════════════
-- v3.74.924 — مرتجعات الشراء تُعزل بالفرع، ومعها تخصيصاتُ مخازنها
-- ═══════════════════════════════════════════════════════════════════
--
-- رابع جدولٍ من التسعة عشر — **وأول واحدٍ لا يُنسخ عليه حلُّ سابق**.
--
-- ═══════════ ما قِيس قبل الكتابة ═══════════
--
-- **الثغرة أوسع من 921**: سياسةُ قراءةٍ واحدة على مستوى الشركة، ولا عزلَ
-- بالفرع قط. وبالانتحال على الإنتاج: **الأدوار السبعة كلُّها** ترى مرتجعَى
-- مدينة نصر **وبنودَهما** — المحاسب والمدير ومسئول التصنيع ومسئول
-- المشتريات ومدير المخزن والموظف. لا استثناء.
--
-- **وفى البنود `unit_price`** — سعرُ الشراء نفسه الذى بُنى له كلُّ ما فُعل
-- من 906 إلى 916. فهذا بابٌ خلفىٌّ على الرقم المحجوب.
--
-- **وفى التطبيق**: شاشة المرتجعات تفلتر بالفرع بالفعل، وأحدَ عشرَ مساراً
-- يقرأ الجدول — تسعةٌ بجلسة المستخدم واثنان بمفتاح الخدمة لا تمسّهما
-- السياسة.
--
-- ═══════════ والشكل الجديد الذى منع النسخ ═══════════
--
-- المشروع يصنع **مرتجعاً متعدد المخازن**، و**يضع `branch_id = NULL` عمداً**
-- فى رأسه (مكتوبٌ نصّاً فى تعليق الشاشة). ومعه جدولٌ ثالثٌ لم يكن فى قائمة
-- التسعة عشر: `purchase_return_warehouse_allocations` — يحمل **فرعَه
-- بنفسه** و**مبلغاً لكل مخزن**، وسياستُه أيضاً على مستوى الشركة.
--
-- فالمرتجع المتعدد **لا فرعَ له، وإنما فروعٌ فى تخصيصاته**. و
-- `can_access_record_branch` تُمرّر السجلَّ بلا فرعٍ **للجميع** بحكم
-- تصميمها المعلن (بياناتٌ على مستوى الشركة). فلو نُسخ حلُّ 921 كما هو
-- لبقى البابُ مفتوحاً على مصراعيه **ولبدا مغلقاً**.
--
-- **وعلى البيانات اليوم**: صفر مرتجعٍ متعدد، وصفر تخصيص. فالمسار فى الكود
-- ولم يُستعمل بعد. والباب يُغلق قبل أن يُفتح، لا بعده.
--
-- ═══════════ والحكم (قرار المالك) ═══════════
--
-- **نصيبُ فرعه وحده**: عضو الفرع يرى المرتجع المتعدد **إن كان له تخصيصٌ فى
-- فرعه**، ويرى من بنوده وتخصيصاته **ما يخصّ فرعه فقط**. وهو نفس ما تفعله
-- الشاشة اليوم (`getUserQty`)، فصار الحكمُ فى القاعدة والشاشةُ طبقةً ثانية.
--
-- وثلاث دوالّ تحمل الحكم، لا شرطٌ مكرَّرٌ فى ثلاث سياسات:
--   `current_user_is_branch_unbounded` — من لا يقيّده فرع (الأدوار العامة،
--       والمالك المسجَّل، وعضو الشركة بلا فرعٍ فى عضويته).
--   `can_access_purchase_return`       — الرأس.
--   `can_access_purchase_return_item`  — البند، وفيه السعر.
--
-- وكلُّها `SECURITY DEFINER` — درس 915: دالةُ عزلٍ تقرأ بصلاحية المُنادى
-- تعود بـNULL عن صفٍّ محجوبٍ عنه، فتُمرّر ما وُجدت لتمنعه.
-- ═══════════════════════════════════════════════════════════════════

-- ═══════ (١) من لا يقيّده فرع ═══════

CREATE OR REPLACE FUNCTION public.current_user_is_branch_unbounded(p_company_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_role   TEXT;
  v_branch UUID;
  v_found  BOOLEAN := FALSE;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN FALSE;
  END IF;

  SELECT cm.role, cm.branch_id, TRUE
    INTO v_role, v_branch, v_found
    FROM public.company_members cm
   WHERE cm.user_id = auth.uid()
     AND cm.company_id = p_company_id
   LIMIT 1;

  -- ليس عضواً: يبقى مالك الشركة المسجَّل (درس ٨٣٦).
  IF NOT COALESCE(v_found, FALSE) THEN
    RETURN EXISTS (
      SELECT 1 FROM public.companies c
       WHERE c.id = p_company_id AND c.user_id = auth.uid()
    );
  END IF;

  IF lower(btrim(v_role)) IN ('owner', 'admin', 'general_manager', 'gm', 'generalmanager') THEN
    RETURN TRUE;
  END IF;

  RETURN v_branch IS NULL;
END;
$function$;

-- ═══════ (٢) الرأس ═══════

CREATE OR REPLACE FUNCTION public.can_access_purchase_return(p_return_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_company UUID;
  v_branch  UUID;
  v_mine    UUID;
BEGIN
  SELECT pr.company_id, pr.branch_id
    INTO v_company, v_branch
    FROM public.purchase_returns pr
   WHERE pr.id = p_return_id;

  IF v_company IS NULL THEN
    RETURN FALSE;
  END IF;

  IF public.current_user_is_branch_unbounded(v_company) THEN
    RETURN TRUE;
  END IF;

  v_mine := public.current_user_branch_id(v_company);
  IF v_mine IS NULL THEN
    RETURN FALSE;
  END IF;

  -- مرتجعُ فرعٍ واحد: فرعُه أو لا شىء.
  IF v_branch IS NOT NULL THEN
    RETURN v_branch = v_mine;
  END IF;

  -- مرتجعٌ متعدد المخازن: يُرى إن كان لفرعى نصيبٌ فيه.
  RETURN EXISTS (
    SELECT 1 FROM public.purchase_return_warehouse_allocations a
     WHERE a.purchase_return_id = p_return_id AND a.branch_id = v_mine
  ) OR EXISTS (
    SELECT 1 FROM public.purchase_return_items i
      JOIN public.warehouses w ON w.id = i.warehouse_id
     WHERE i.purchase_return_id = p_return_id AND w.branch_id = v_mine
  );
END;
$function$;

-- ═══════ (٣) البند — وفيه السعر ═══════

CREATE OR REPLACE FUNCTION public.can_access_purchase_return_item(p_item_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_return      UUID;
  v_company     UUID;
  v_head_branch UUID;
  v_warehouse   UUID;
  v_allocation  UUID;
  v_mine        UUID;
BEGIN
  SELECT i.purchase_return_id, pr.company_id, pr.branch_id, i.warehouse_id, i.warehouse_allocation_id
    INTO v_return, v_company, v_head_branch, v_warehouse, v_allocation
    FROM public.purchase_return_items i
    JOIN public.purchase_returns pr ON pr.id = i.purchase_return_id
   WHERE i.id = p_item_id;

  IF v_return IS NULL THEN
    RETURN FALSE;
  END IF;

  -- البند لا يُقرأ إن كان رأسُه محجوباً.
  IF NOT public.can_access_purchase_return(v_return) THEN
    RETURN FALSE;
  END IF;

  IF public.current_user_is_branch_unbounded(v_company) THEN
    RETURN TRUE;
  END IF;

  -- رأسٌ بفرعٍ واحد وقد مرّ: بنودُه كلُّها لذلك الفرع.
  IF v_head_branch IS NOT NULL THEN
    RETURN TRUE;
  END IF;

  v_mine := public.current_user_branch_id(v_company);
  IF v_mine IS NULL THEN
    RETURN FALSE;
  END IF;

  -- مرتجعٌ متعدد: بندُ فرعى وحده — والسعر فيه.
  IF v_allocation IS NOT NULL THEN
    RETURN EXISTS (
      SELECT 1 FROM public.purchase_return_warehouse_allocations a
       WHERE a.id = v_allocation AND a.branch_id = v_mine
    );
  END IF;

  IF v_warehouse IS NOT NULL THEN
    RETURN EXISTS (
      SELECT 1 FROM public.warehouses w
       WHERE w.id = v_warehouse AND w.branch_id = v_mine
    );
  END IF;

  -- بندٌ فى مرتجعٍ متعددٍ بلا مخزنٍ ولا تخصيص: لا يُنسب إلى فرع، فلا يُقرأ
  -- إلا بلا قيدٍ مكانى. (صفر صفٍّ من هذا الشكل عند الكتابة — قِيس.)
  RETURN FALSE;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.current_user_is_branch_unbounded(uuid)  TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_purchase_return(uuid)        TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_purchase_return_item(uuid)   TO authenticated;

-- ═══════ والسياسات: واحدةٌ لكل جدول ═══════

DROP POLICY IF EXISTS purchase_returns_select      ON public.purchase_returns;
DROP POLICY IF EXISTS purchase_return_items_select ON public.purchase_return_items;
DROP POLICY IF EXISTS company_members_read_prwa    ON public.purchase_return_warehouse_allocations;

CREATE POLICY purchase_returns_select_branch_isolation ON public.purchase_returns
FOR SELECT
USING (
  company_id IN (SELECT get_user_company_ids())
  AND public.can_access_purchase_return(id)
);

CREATE POLICY purchase_return_items_select_branch_isolation ON public.purchase_return_items
FOR SELECT
USING (
  public.can_access_purchase_return_item(id)
);

CREATE POLICY prwa_select_branch_isolation ON public.purchase_return_warehouse_allocations
FOR SELECT
USING (
  company_id IN (SELECT get_user_company_ids())
  AND public.can_access_record_branch(company_id, branch_id)
);

COMMENT ON POLICY purchase_returns_select_branch_isolation ON public.purchase_returns IS
  'v3.74.924 — مرتجعُ الفرع لفرعه، والمرتجعُ المتعدد لمن له نصيبٌ فيه.';
COMMENT ON POLICY purchase_return_items_select_branch_isolation ON public.purchase_return_items IS
  'v3.74.924 — بندُ المرتجع يُقرأ بقيد فرعه، وفيه سعر الشراء.';
COMMENT ON POLICY prwa_select_branch_isolation ON public.purchase_return_warehouse_allocations IS
  'v3.74.924 — التخصيص يحمل فرعَه بنفسه، فيُقرأ بقيده.';
