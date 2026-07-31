-- ═══════════════════════════════════════════════════════════════════
-- v3.74.914 — رؤية التكلفة تُقيَّد بالفرع، لا بالدور وحده
-- ═══════════════════════════════════════════════════════════════════
--
-- طلب المالك (31/7، بنصّه): «المستخدمون التابعون للفرع يمكنهم رؤية أسعار
-- الشراء للمنتجات التابعة لفرعهم — مسئول المشتريات والمحاسب ومدير الفرع.
-- والمنتجات غير المرتبطة بفرع لا يراها مستخدمو الفروع أصلاً».
--
-- وقاعدة 906 كانت تقيس **الدور وحده**: محاسبٌ فى فرعٍ يرى تكلفة منتجات
-- كل الفروع. وهذا الإصدار يضيف الشرط الثانى: **فرع المنتج = فرع العضو**.
--
-- ثلاثة تغييرات فى القاعدة:
--   ١) `manager` (المعروض «مدير فرع») يدخل جمهور الوضع الافتراضى — بنصّ
--      المالك — ولم يكن فيه من قبل.
--   ٢) العضو **المرتبط بفرع** لا يرى إلا تكلفة منتجات فرعه.
--      والعضو **بلا فرع** (على مستوى الشركة) يبقى بلا قيدٍ مكانى.
--   ٣) منتجٌ **بلا فرع** تكلفتُه للمالك والمدير العام وحدهما — فهو منتج
--      الشركة لا منتج فرع، وسياسة الشراء عليه لهما (يأتى إنفاذها فى
--      إصدارها).
--
-- والمالك والمدير العام بلا قيدٍ فى كل الأحوال، ولو كان صفّ عضويتهما
-- يحمل فرعاً — وهو حال **كل** الأعضاء على الإنتاج اليوم (قِيس: ١٢ من ١٢
-- مرتبطون بفرع، ومنهم المالك). فلو قِيس المالكُ بفرعه لانحجبت عنه تكلفة
-- باقى فروعه، وهو عكس المقصود تماماً.
--
-- ⚠️ ما لا يفعله هذا الإصدار: **لا يمسّ رؤية المنتج نفسه** ولا يمنع
--    الشراء. البضاعة المنقولة إلى فرعٍ تُباع فيه بلا رؤية تكلفتها — وهذا
--    يتحقق هنا لأن بطاقة المنتج تبقى لفرعها الأصلى (قِيس: النقل يحرّك
--    الكمية ولا يمسّ البطاقة). أما إظهار المنقول لبائعه فمكانه إصدار
--    الرؤية، وقد قِيس له اليوم: ٥٤ حركة على ٣ فروع، و**صفر** منتجٍ تحرّك
--    خارج فرعه حتى الآن — أى أن المسألة مستقبلية لا قائمة.
-- ═══════════════════════════════════════════════════════════════════

-- ═══════════ (أ) القاعدة: دورٌ **وفرع** ═══════════

-- التوقيع يتغيّر (يُضاف فرع المنتج وعلَم التقييد)، والقديم ذو الوسيطين
-- **يُحذف أولاً**: بقاؤه مع الجديد ذى القيم الافتراضية يجعل نداءً
-- بوسيطين **ملتبساً** (`function is not unique`) — فيسقط نداء الواجهة
-- الذى يسأل «هل يرى التكلفة أصلاً؟» فى مسار تعديل الصنف (913)، ويُفهم
-- سقوطه على أنه «لا يرى»، فتُنزع تكلفةٌ من حمولةِ من يملكها.
-- ولا معنى لخطر الحذف: `product_costs` وحدها تناديه فى القاعدة، وتُعاد
-- كتابتها فى نفس هذه الهجرة.
DROP FUNCTION IF EXISTS public.can_view_purchase_cost(uuid, uuid);

CREATE OR REPLACE FUNCTION public.can_view_purchase_cost(
  p_company_id uuid,
  p_created_by uuid DEFAULT NULL,
  p_product_branch_id uuid DEFAULT NULL,
  p_scope_by_branch boolean DEFAULT false
)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_actor        uuid := auth.uid();
  v_role         text;
  v_member_branch uuid;
  v_mode         text;
BEGIN
  -- بلا هوية لا إذن: العجز عن التحقق ليس إذناً (865).
  IF v_actor IS NULL OR p_company_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT COALESCE(c.purchase_cost_visibility, 'restricted') INTO v_mode
    FROM companies c WHERE c.id = p_company_id;

  -- شركةٌ لا وجود لها لا تُمنح عنها إذناً.
  IF v_mode IS NULL THEN
    RETURN false;
  END IF;

  -- مالك الشركة المسجَّل فى companies.user_id مالكٌ ولو لم يُذكر عضواً،
  -- ولا يُقاس بفرع: مِلكُه الشركة كلها.
  IF EXISTS (SELECT 1 FROM companies c WHERE c.id = p_company_id AND c.user_id = v_actor) THEN
    RETURN true;
  END IF;

  SELECT lower(btrim(cm.role)), cm.branch_id INTO v_role, v_member_branch
    FROM company_members cm
   WHERE cm.company_id = p_company_id AND cm.user_id = v_actor
   LIMIT 1;

  -- من ليس عضواً فى الشركة لا يُسأل عن دوره.
  IF v_role IS NULL THEN
    RETURN false;
  END IF;

  -- الاستثناء بنص المالك: المالك والمدير العام (وتهجئاتهما) فى كل وضع،
  -- وبلا قيد فرعٍ ولو حمل صفُّ عضويتهما فرعاً.
  IF v_role IN ('owner', 'general_manager', 'gm', 'generalmanager') THEN
    RETURN true;
  END IF;

  -- الوضع المفتوح: السلوك القديم لمن لا يريد حجباً.
  IF v_mode = 'open' THEN
    RETURN true;
  END IF;

  -- الوضع الافتراضى: المحاسب ومسئول المشتريات ومدير الفرع (914).
  IF v_mode = 'restricted' AND v_role IN ('accountant', 'purchasing_officer', 'manager') THEN
    -- v3.74.914 — وقيد الفرع: عضوٌ مربوطٌ بفرعٍ لا يرى إلا تكلفة منتجات
    -- فرعه. ولا يُطبَّق القيد إلا حين يُسأل عن **منتجٍ بعينه**
    -- (`p_scope_by_branch`)، فالسؤال العام «هل يرى التكلفة أصلاً؟» يبقى
    -- جوابه بالدور — وإلا لأخفت الشاشاتُ أعمدةً يستحقها.
    IF p_scope_by_branch AND v_member_branch IS NOT NULL THEN
      -- منتجٌ بلا فرع: منتج الشركة لا منتج الفرع — للمالك والمدير العام.
      IF p_product_branch_id IS NULL THEN
        RETURN false;
      END IF;
      RETURN p_product_branch_id = v_member_branch;
    END IF;
    RETURN true;
  END IF;

  -- ومنشئ المستند يرى مستنده. وما لا منشئ له (بطاقة المنتج، طبقات FIFO،
  -- تقييم المخزون) يُنادى بـ NULL فلا يمرّ من هنا — وهذا هو المقصود:
  -- تكلفة المنتج تتغير بمشترياتٍ لا شأن لمنشئ المنتج بها.
  IF p_created_by IS NOT NULL AND p_created_by = v_actor THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.can_view_purchase_cost(uuid, uuid, uuid, boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.can_view_purchase_cost(uuid, uuid, uuid, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.can_view_purchase_cost(uuid, uuid, uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_view_purchase_cost(uuid, uuid, uuid, boolean) TO service_role;

-- ═══════════ (ب) المسار المخوَّل يمرّر فرع المنتج ═══════════

CREATE OR REPLACE FUNCTION public.product_costs(p_product_ids uuid[])
 RETURNS TABLE(product_id uuid, cost_price numeric, original_cost_price numeric, display_cost_price numeric)
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
  SELECT p.id, p.cost_price, p.original_cost_price, p.display_cost_price
    FROM products p
   WHERE p.id = ANY(COALESCE(p_product_ids, ARRAY[]::uuid[]))
     AND public.can_view_purchase_cost(p.company_id, NULL, p.branch_id, true);
$function$;

REVOKE EXECUTE ON FUNCTION public.product_costs(uuid[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.product_costs(uuid[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.product_costs(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.product_costs(uuid[]) TO service_role;

COMMENT ON FUNCTION public.can_view_purchase_cost(uuid, uuid, uuid, boolean) IS
  'v3.74.914 — قاعدة رؤية تكلفة الشراء: دورٌ **وفرع**. تُنادى بفرع المنتج و p_scope_by_branch=true حين يُسأل عن منتجٍ بعينه؛ وبلا ذلك يبقى الجواب بالدور (سؤال «هل يرى التكلفة أصلاً؟»).';
