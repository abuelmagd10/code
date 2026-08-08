-- =============================================================================
-- v3.74.989 — إخراجُ البضاعة عهدةٌ، والعهدةُ لها صاحب
-- =============================================================================
-- البابُ الأوّلُ من البابين اللذين أشرتُ إليهما فى ٩٨٧. وقُيس فى ثلاث طبقاتٍ
-- **ولم يوجد فحصٌ للدور فى أىٍّ منها**:
--
--   • ثلاثةُ أبوابٍ (اعتمادُ التسليم · اعتمادٌ مع شحن · رفضُ التسليم) لا تقرأ
--     الدورَ إطلاقاً — تتحقّق من تسجيل الدخول ومن الشركة، ثمّ تمضى.
--   • والخدمةُ التى خلفها **لا تستقبل الدورَ أصلاً** — تعرف الشركةَ والمستخدمَ
--     فقط.
--   • ودوالُّ القاعدة الثلاثُ (`approve_sales_delivery` · `..._v2` ·
--     `reject_sales_delivery`) **لا تذكر company_members ولا role إطلاقاً**،
--     وكلُّها SECURITY DEFINER وتنفيذُها ممنوحٌ لـ authenticated.
--
-- فأىُّ موظّفٍ مسجَّلٍ فى الشركة كان يستطيع اعتمادَ خروج البضاعة — **وهو الذى
-- يخصم المخزونَ ويُقيّد التكلفةَ والإيراد** — أو رفضَ التسليم، **وقد يحوّل
-- دفعةَ عميلٍ إلى رصيدٍ دائن**.
--
-- **والنظامُ نفسُه كان يقول القاعدةَ ولا يطبّقها**: رسالتُه المكتوبةُ منذ ٦٦٤
-- «تمّ اعتمادُ إخراج البضاعة **من قِبل مسؤول المخزن**» — واسمٌ يُذكر ولا يُفحص
-- **طمأنينةٌ كاذبة**.
--
-- > **وقرارُ المالك: مسؤولُ مخزن الفرع يعتمد، ومعه المالكُ والمدير العامُّ
-- > دائماً. وإن لم يكن للفرع مسؤولُ مخزنٍ مضى الإخراجُ كما يمضى اليوم —
-- > فخطوةٌ لا صاحبَ لها لا تُوقف العمل.** (قاعدة ٤ نفسُها.)
--
-- وثلاثةُ بيوتٍ كانت تجيب عن سؤالٍ واحد — «أللفرع مسؤولُ مخزن؟» — **وكانت
-- تفترق فعلاً**:
--   • بيتُ الـTypeScript يبحث عن دورين: store_manager و **warehouse_manager**.
--   • وبيتُ القاعدة يبحث عن store_manager وحدَه.
--   • **و`warehouse_manager` ليس من الأدوار الاثنى عشر المسموح بها أصلاً** —
--     نصفُ القائمة يبحث عن دورٍ لا يستطيع أحدٌ أن يشغله.
-- فصار البيتُ واحداً، ويُسأل من الطبقتين معاً.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- ١) بيتٌ واحدٌ يعرف صاحبَ العهدة
-- -----------------------------------------------------------------------------
-- بلا مستخدم: أثمّة صاحبُ عهدةٍ لهذا الفرع/المخزن أصلاً؟
-- بمستخدم:   أهذا المستخدمُ هو صاحبُها؟
-- سؤالان بشكلٍ واحد، فلا يفترقان غداً.

CREATE OR REPLACE FUNCTION public.branch_warehouse_custodian(
    p_company_id   uuid,
    p_branch_id    uuid,
    p_warehouse_id uuid,
    p_user_id      uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.company_members cm
    LEFT JOIN public.warehouses w
      ON w.id = p_warehouse_id AND w.company_id = p_company_id
    WHERE cm.company_id = p_company_id
      AND cm.role = 'store_manager'
      AND (p_user_id IS NULL OR cm.user_id = p_user_id)
      AND (
            (p_warehouse_id IS NOT NULL AND cm.warehouse_id = p_warehouse_id)
         OR (cm.warehouse_id IS NULL
             AND cm.branch_id IS NOT NULL
             AND cm.branch_id = COALESCE(p_branch_id, w.branch_id))
      )
  );
$function$;

REVOKE ALL ON FUNCTION public.branch_warehouse_custodian(uuid, uuid, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.branch_warehouse_custodian(uuid, uuid, uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.branch_warehouse_custodian(uuid, uuid, uuid, uuid) TO authenticated, service_role;

-- والبيتُ القديمُ من ٩٨٣ يبقى باسمه ويُفوِّض — فلا يُكسَر من ينادِيه، ولا
-- تبقى نسختان تفترقان.
CREATE OR REPLACE FUNCTION public.warehouse_has_store_manager(
    p_company_id uuid,
    p_warehouse_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
  SELECT p_warehouse_id IS NOT NULL
     AND public.branch_warehouse_custodian(p_company_id, NULL, p_warehouse_id, NULL);
$function$;

-- -----------------------------------------------------------------------------
-- ٢) والقاعدةُ نفسُها فى بيتٍ واحد — تُرجع NULL إن جاز، وإلّا فالسببَ بالعربيّة
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.sales_delivery_actor_error(
    p_company_id   uuid,
    p_branch_id    uuid,
    p_warehouse_id uuid,
    p_user_id      uuid
)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_role text;
BEGIN
  IF p_company_id IS NULL OR p_user_id IS NULL THEN
    -- ولا أحكم بلا مقياس
    RETURN NULL;
  END IF;

  SELECT cm.role INTO v_role
  FROM public.company_members cm
  WHERE cm.company_id = p_company_id AND cm.user_id = p_user_id
  LIMIT 1;

  IF v_role IS NULL THEN
    RETURN 'لستَ عضواً فى هذه الشركة';
  END IF;

  -- الإدارةُ توقّع دائماً — لا أحدَ فوقها لتنتظره
  IF v_role IN ('owner', 'admin', 'general_manager') THEN
    RETURN NULL;
  END IF;

  -- وصاحبُ العهدة يوقّع على عهدته
  IF public.branch_warehouse_custodian(p_company_id, p_branch_id, p_warehouse_id, p_user_id) THEN
    RETURN NULL;
  END IF;

  -- (قاعدة ٤) وخطوةٌ لا صاحبَ لها لا تُوقف العمل: فرعٌ بلا مسؤول مخزنٍ
  -- يمضى إخراجُه كما كان يمضى — وهو بعينُه المسارُ التلقائىُّ المبنىُّ منذ ٦٦٤.
  IF NOT public.branch_warehouse_custodian(p_company_id, p_branch_id, p_warehouse_id, NULL) THEN
    RETURN NULL;
  END IF;

  RETURN 'إخراجُ البضاعة عهدةُ مسؤول مخزن الفرع — ودورُك «' || v_role || '». اطلب منه الاعتماد، أو من المالك أو المدير العامّ';
END;
$function$;

REVOKE ALL ON FUNCTION public.sales_delivery_actor_error(uuid, uuid, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sales_delivery_actor_error(uuid, uuid, uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.sales_delivery_actor_error(uuid, uuid, uuid, uuid) TO authenticated, service_role;

-- والفاتورةُ تُقرأ مرّةً واحدةً هنا، فلا يحمل النداءُ فرعاً ولا مخزناً من عنده
CREATE OR REPLACE FUNCTION public.sales_delivery_decision_error(
    p_invoice_id uuid,
    p_user_id    uuid
)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_company uuid;
  v_branch  uuid;
  v_wh      uuid;
BEGIN
  SELECT i.company_id, i.branch_id, i.warehouse_id
    INTO v_company, v_branch, v_wh
  FROM public.invoices i
  WHERE i.id = p_invoice_id;

  IF NOT FOUND THEN
    -- فاتورةٌ لا وجودَ لها ليست تهمةً على أحد؛ الدالّةُ الأصليّةُ تقولها
    RETURN NULL;
  END IF;

  RETURN public.sales_delivery_actor_error(v_company, v_branch, v_wh, p_user_id);
END;
$function$;

REVOKE ALL ON FUNCTION public.sales_delivery_decision_error(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sales_delivery_decision_error(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.sales_delivery_decision_error(uuid, uuid) TO authenticated, service_role;

-- وصيغةٌ ترفع الخطأ، لتُدسَّ سطراً واحداً فى دوالِّ القاعدة
CREATE OR REPLACE FUNCTION public.assert_sales_delivery_decision(
    p_invoice_id uuid,
    p_user_id    uuid
)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_error text;
BEGIN
  v_error := public.sales_delivery_decision_error(p_invoice_id, p_user_id);
  IF v_error IS NOT NULL THEN
    RAISE EXCEPTION '%', v_error USING ERRCODE = 'P0001';
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.assert_sales_delivery_decision(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.assert_sales_delivery_decision(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.assert_sales_delivery_decision(uuid, uuid) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- ٣) والحارسُ يُدَسُّ فى الطابق السفلىّ — فى الدوالِّ الثلاثِ نفسِها
-- -----------------------------------------------------------------------------
-- **فحصٌ عند الباب وحدَه مسكّن**: تبقى الدوالُّ الثلاثُ ممنوحةً لـ authenticated
-- ويستطيع أىُّ نداءٍ مباشرٍ أن يتخطّى الشاشةَ كلَّها. فيُدَسُّ سطرٌ واحدٌ بعد
-- أوّل BEGIN فى كلٍّ منها، يحكم على **الفاعل المصرَّح به** `p_confirmed_by`
-- لا على الجلسة — فيعمل من أىِّ طريقٍ جاء النداء.
--
-- ويُتحقَّق من الاستبدال بعكسه: يُعاد النصُّ الجديدُ إلى القديم، فإن لم يطابقه
-- **حرفاً بحرف** تُلغى الهجرةُ كلُّها. **ولا أكتب فى دالّةٍ لا أستطيع أن أُثبت
-- أنّى لم أُفسد منها حرفاً.**

DO $rewrite$
DECLARE
  r RECORD;
  v_def text;
  v_new text;
  v_line text := E'  -- v3.74.989 — إخراجُ البضاعة عهدةُ مسؤول مخزن الفرع.\n  PERFORM public.assert_sales_delivery_decision(p_invoice_id, p_confirmed_by);\n';
  v_n int := 0;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('approve_sales_delivery', 'approve_sales_delivery_v2', 'reject_sales_delivery')
  LOOP
    v_def := pg_get_functiondef(r.oid);

    -- مُدسوسٌ سلفاً: لا تُكرَّر
    IF position('assert_sales_delivery_decision' in v_def) > 0 THEN
      CONTINUE;
    END IF;

    IF position(E'\nBEGIN\n' in v_def) = 0 THEN
      RAISE EXCEPTION 'v3.74.989: لم أجد مرساةَ BEGIN فى %  — ولا أكتب على العمياء.', r.proname;
    END IF;

    v_new := overlay(v_def placing (E'\nBEGIN\n' || v_line)
                     from position(E'\nBEGIN\n' in v_def)
                     for  length(E'\nBEGIN\n'));

    -- والعكسُ يُثبت أنّى لم أمسّ حرفاً غيرَ ما قصدتُ
    IF replace(v_new, v_line, '') IS DISTINCT FROM v_def THEN
      RAISE EXCEPTION 'v3.74.989: الاستبدالُ فى % لم يعكس نفسَه — أُلغيت الهجرة.', r.proname;
    END IF;

    EXECUTE v_new;
    v_n := v_n + 1;
  END LOOP;

  IF v_n = 0 AND NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'approve_sales_delivery'
      AND position('assert_sales_delivery_decision' in p.prosrc) > 0
  ) THEN
    RAISE EXCEPTION 'v3.74.989: لم أُحصّن دالّةً واحدة — ولا أقول «تمّ» ولم يتمّ.';
  END IF;

  RAISE NOTICE 'v3.74.989 · حُصّنت % دالّة.', v_n;
END $rewrite$;

-- -----------------------------------------------------------------------------
-- ٤) وفحصٌ مرجعىٌّ يُثبت الاتّجاهات بأعضاءَ حقيقيّين من القاعدة لا بافتراض
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.assert_baseline_v3_74_989_check()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_company uuid;
  v_branch  uuid;
  v_wh      uuid;
  v_keeper  uuid;
  v_owner   uuid;
  v_other   uuid;
  v_other_role text;
  v_stranger uuid := '11111111-1111-1111-1111-111111111111'::uuid;
  v_n int;
BEGIN
  -- صاحبُ عهدةٍ حقيقىٌّ — يُقرأ ولا يُفترض
  SELECT cm.company_id, cm.branch_id, cm.warehouse_id, cm.user_id
    INTO v_company, v_branch, v_wh, v_keeper
  FROM public.company_members cm
  WHERE cm.role = 'store_manager'
  LIMIT 1;

  IF v_company IS NULL THEN
    -- **وبحثٌ لا يجد ليس دليلَ غياب**: لا صاحبَ عهدةٍ فى النظام كلِّه، فلا
    -- يُقاس اتّجاهُ المنع. ويُكتفى بإثبات أنّ الحارسَ مدسوسٌ فى الدوالّ.
    SELECT count(*) INTO v_n
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('approve_sales_delivery','approve_sales_delivery_v2','reject_sales_delivery')
      AND position('assert_sales_delivery_decision' in p.prosrc) > 0;
    IF v_n < 3 THEN
      RAISE EXCEPTION 'BASELINE FAIL: الحارسُ غائبٌ عن % دالّة من ثلاث (v3.74.989)', 3 - v_n;
    END IF;
    RAISE NOTICE 'v3.74.989 · لا صاحبَ عهدةٍ فى النظام — أُثبت دسُّ الحارس ولم يُدَّعَ قياسُ المنع.';
    RETURN;
  END IF;

  -- والحارسُ مدسوسٌ فى الثلاث — فحصٌ عند الباب وحدَه مسكّن
  SELECT count(*) INTO v_n
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN ('approve_sales_delivery','approve_sales_delivery_v2','reject_sales_delivery')
    AND position('assert_sales_delivery_decision' in p.prosrc) > 0;
  IF v_n < 3 THEN
    RAISE EXCEPTION 'BASELINE FAIL: الحارسُ غائبٌ عن % دالّة من ثلاث (v3.74.989)', 3 - v_n;
  END IF;

  -- ١) صاحبُ العهدة يوقّع على عهدته
  IF public.sales_delivery_actor_error(v_company, v_branch, v_wh, v_keeper) IS NOT NULL THEN
    RAISE EXCEPTION 'BASELINE FAIL: منع صاحبَ العهدة من اعتماد عهدته (v3.74.989)';
  END IF;

  -- ٢) والمالكُ يوقّع دائماً
  SELECT cm.user_id INTO v_owner
  FROM public.company_members cm
  WHERE cm.company_id = v_company AND cm.role = 'owner' LIMIT 1;
  IF v_owner IS NOT NULL
     AND public.sales_delivery_actor_error(v_company, v_branch, v_wh, v_owner) IS NOT NULL THEN
    RAISE EXCEPTION 'BASELINE FAIL: منع المالكَ من اعتماد الإخراج (v3.74.989)';
  END IF;

  -- ٣) وغيرُهما يُمنع حيث توجد عهدةٌ لها صاحب
  SELECT cm.user_id, cm.role INTO v_other, v_other_role
  FROM public.company_members cm
  WHERE cm.company_id = v_company
    AND cm.role NOT IN ('owner','admin','general_manager','store_manager')
  LIMIT 1;
  IF v_other IS NOT NULL
     AND public.sales_delivery_actor_error(v_company, v_branch, v_wh, v_other) IS NULL THEN
    RAISE EXCEPTION 'BASELINE FAIL: أجاز لـ«%» اعتمادَ إخراجٍ ليس عهدتَه وللفرع صاحبُ عهدة (v3.74.989)', v_other_role;
  END IF;

  -- ٤) ومن ليس عضواً لا يوقّع
  IF public.sales_delivery_actor_error(v_company, v_branch, v_wh, v_stranger) IS NULL THEN
    RAISE EXCEPTION 'BASELINE FAIL: أجاز لمن ليس عضواً فى الشركة (v3.74.989)';
  END IF;

  -- ٥) (قاعدة ٤) وفرعٌ لا صاحبَ عهدةٍ له لا يتوقّف عملُه
  IF v_other IS NOT NULL
     AND public.sales_delivery_actor_error(
           v_company,
           '22222222-2222-2222-2222-222222222222'::uuid,
           NULL,
           v_other) IS NOT NULL THEN
    RAISE EXCEPTION 'BASELINE FAIL: أوقف الإخراجَ فى فرعٍ لا مسؤولَ مخزنٍ له (v3.74.989)';
  END IF;

  -- ٦) والبيتُ القديمُ يُفوِّض ولا يفترق
  IF public.warehouse_has_store_manager(v_company, v_wh)
     IS DISTINCT FROM public.branch_warehouse_custodian(v_company, NULL, v_wh, NULL) THEN
    RAISE EXCEPTION 'BASELINE FAIL: بيتُ ٩٨٣ افترق عن البيت الواحد (v3.74.989)';
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.assert_baseline_v3_74_989_check() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.assert_baseline_v3_74_989_check() FROM anon;
GRANT EXECUTE ON FUNCTION public.assert_baseline_v3_74_989_check() TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- ولا تمرّ الدفعةُ إلّا بعد أن تُثبت نفسَها بالتشغيل
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  PERFORM public.assert_baseline_v3_74_989_check();
  RAISE NOTICE 'v3.74.989 · تمّت وأثبتت نفسَها.';
END $$;
