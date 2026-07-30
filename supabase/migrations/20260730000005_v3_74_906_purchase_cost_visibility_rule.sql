-- ═══════════════════════════════════════════════════════════════════════════
-- v3.74.906 — قاعدة رؤية تكلفة الشراء (قرار المالك 30/7)
--
-- الحادثة: سأل عميلٌ فعلىٌّ أن يُخفى سعر الشراء عن مستخدميه، فنُصح بأن
-- يشترى على الفرع الرئيسى ثم ينقل المخزون للفرع البائع. **والقياس على
-- الإنتاج أثبت أن هذا لا يخفى شيئاً**: بانتحال هوية موظفٍ بدور `staff`
-- فى فرعٍ واحد قُرئت تكلفة 12 منتجاً (أعلاها 200.00)، و6 فواتير
-- مشتريات، و11 بند فاتورة (أعلى سعر وحدة 50.00)، و39 حركة مخزون.
-- السبب: `products_select` = `is_company_member(company_id)` بلا أى قيد
-- بفرعٍ أو دور — فالتكلفة تعيش فى بطاقة المنتج لا فى المستند، والنقل
-- بين الفروع لا يمسّها. وسياسات «عزل الفرع» على الفواتير وحركات المخزون
-- مكتوبةٌ ومُبطَلة: سياسات RLS المتعددة PERMISSIVE تُجمع بـ OR فتغلبها
-- سياسة «أى عضو فى الشركة».
--
-- القرار (بنص المالك، وقد نضج على ثلاث خطوات بعد عرض أثر كلٍّ منها):
--   * الأصل: «لا يرى سعر الشراء إلا منشئه، ويُستثنى المالك والمدير العام».
--   * ثم: **قابلة للضبط لكل شركة** — لأن عملاءه يختلفون.
--   * ثم: الجمهور الافتراضى = المالك + المدير العام + **المحاسب**
--     (لا يُقفل دفترٌ ولا تُطابَق تكلفة مبيعاتٍ بلا تكلفة) + **مسئول
--     المشتريات** (وظيفته التفاوض، وقد أُقرّ له ذلك فى 905)، ويبقى
--     **منح المنشئ** لمستنده هو.
--   * وتكلفة المنتج نفسها (`products.cost_price`) **بلا استثناء منشئ** —
--     لأن منشئ المنتج قد يكون موظف مبيعات، والتكلفة تتغير بمشترياتٍ لا
--     شأن له بها؛ فربطها بمنشئ المنتج يفتح باباً من حيث أُغلق الآخر.
--
-- الأوضاع الثلاثة (`companies.purchase_cost_visibility`):
--   `open`       — كل عضوٍ فى الشركة يرى (السلوك القديم).
--   `restricted` — المالك + المدير العام + المحاسب + مسئول المشتريات
--                  + منشئ المستند. **الافتراضى**.
--   `strict`     — المالك + المدير العام + منشئ المستند.
--
-- تنبيهٌ موثَّق: `products` **لا يحمل عمود منشئ إطلاقاً**، وكذلك طبقات
-- FIFO وتقييم المخزون — فما لا منشئ له يُقاس بالدور وحده، وهو المقصود.
--
-- هذا الإصدار **يضع القاعدة ولا يحجب بعد** — الحجب الفعلى (سحب صلاحية
-- العمود + تحويل القراءات للمسار المخوَّل) يأتى بعد تصفية 11 موضع
-- `select("*")` على products، حتى لا ينكسر شىءٌ يعمل. لا حجبَ مسرحىٌّ
-- يُقال عنه إنه حجب.
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════ (أ) الإعداد على مستوى الشركة ═══════════

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS purchase_cost_visibility text NOT NULL DEFAULT 'restricted';

-- يُكتب الافتراضى صراحةً لا اعتماداً على وجود العمود: قاعدةٌ أُنشئ فيها
-- العمود بافتراضٍ أقدم تُصحَّح هنا، وقاعدةٌ جديدة تُنشأ صحيحة — والملف
-- واحدٌ فى الحالتين (درس 894: الملف والقاعدة نصٌّ واحد).
ALTER TABLE public.companies
  ALTER COLUMN purchase_cost_visibility SET DEFAULT 'restricted';

-- القيد يُرفع قبل تصحيح القيم لا بعده: قيدٌ قديم يحرس أسماءً قديمة
-- سيرفض القيمة الجديدة وهى تُكتب (اصطاده التطبيق الأول حرفياً).
ALTER TABLE public.companies
  DROP CONSTRAINT IF EXISTS companies_purchase_cost_visibility_check;

UPDATE public.companies
   SET purchase_cost_visibility = 'restricted'
 WHERE purchase_cost_visibility IS NULL
    OR purchase_cost_visibility NOT IN ('open', 'restricted', 'strict');

ALTER TABLE public.companies
  ADD CONSTRAINT companies_purchase_cost_visibility_check
  CHECK (purchase_cost_visibility IN ('open', 'restricted', 'strict'));

COMMENT ON COLUMN public.companies.purchase_cost_visibility IS
  'v3.74.906 — من يرى تكلفة الشراء: open (كل عضو) / restricted (مالك + مدير عام + محاسب + مسئول مشتريات + منشئ المستند، الافتراضى) / strict (مالك + مدير عام + منشئ المستند).';

-- ═══════════ (ب) القاعدة — مرجعٌ وحيد لا يتكرر ═══════════

CREATE OR REPLACE FUNCTION public.can_view_purchase_cost(p_company_id uuid, p_created_by uuid DEFAULT NULL)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_role  text;
  v_mode  text;
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

  -- مالك الشركة المسجَّل فى companies.user_id مالكٌ ولو لم يُذكر عضواً.
  IF EXISTS (SELECT 1 FROM companies c WHERE c.id = p_company_id AND c.user_id = v_actor) THEN
    RETURN true;
  END IF;

  SELECT lower(btrim(cm.role)) INTO v_role
    FROM company_members cm
   WHERE cm.company_id = p_company_id AND cm.user_id = v_actor
   LIMIT 1;

  -- من ليس عضواً فى الشركة لا يُسأل عن دوره.
  IF v_role IS NULL THEN
    RETURN false;
  END IF;

  -- الوضع المفتوح: السلوك القديم لمن لا يريد حجباً.
  IF v_mode = 'open' THEN
    RETURN true;
  END IF;

  -- الاستثناء بنص المالك: المالك والمدير العام (وتهجئاتهما) فى كل وضع.
  IF v_role IN ('owner', 'general_manager', 'gm', 'generalmanager') THEN
    RETURN true;
  END IF;

  -- وفى الوضع الافتراضى: المحاسب (لا يُقفل دفترٌ ولا تُطابَق تكلفة
  -- مبيعاتٍ بلا تكلفة) ومسئول المشتريات (وظيفته التفاوض — قرار 905).
  IF v_mode = 'restricted' AND v_role IN ('accountant', 'purchasing_officer') THEN
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

-- تُقرأ من الشاشات لتصدُق الواجهة قبل أن ترسم عموداً سيُحجب.
REVOKE EXECUTE ON FUNCTION public.can_view_purchase_cost(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.can_view_purchase_cost(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.can_view_purchase_cost(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_view_purchase_cost(uuid, uuid) TO service_role;

-- ═══════════ (ج) المسار المخوَّل لقراءة تكلفة المنتجات ═══════════
-- يُستهلك بدل قراءة العمود مباشرة. يعمل اليوم بلا أثر (العمود ما زال
-- مقروءاً)، ويصير المسار الوحيد فور سحب الصلاحية فى الإصدار التالى.
-- يُنادى القاعدة بـ NULL: تكلفة المنتج بلا استثناء منشئ (قرار المالك).

CREATE OR REPLACE FUNCTION public.product_costs(p_product_ids uuid[])
 RETURNS TABLE(product_id uuid, cost_price numeric)
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
  SELECT p.id, p.cost_price
    FROM products p
   WHERE p.id = ANY(COALESCE(p_product_ids, ARRAY[]::uuid[]))
     AND public.can_view_purchase_cost(p.company_id, NULL);
$function$;

REVOKE EXECUTE ON FUNCTION public.product_costs(uuid[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.product_costs(uuid[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.product_costs(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.product_costs(uuid[]) TO service_role;

-- ═══════════ (د) ضبط الإعداد — بيد المالك وحده ═══════════
-- إعدادٌ لا يستطيع أحدٌ تغييره إعدادٌ ميت؛ وواجهته تأتى مع إصدار الحجب،
-- فيبقى هذا هو الباب الوحيد حتى ذلك الحين — ومقصورٌ على المالك.

CREATE OR REPLACE FUNCTION public.set_purchase_cost_visibility(p_company_id uuid, p_mode text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_is_owner boolean;
  v_rows int;
BEGIN
  IF v_actor IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'NO_ACTOR');
  END IF;
  IF p_mode IS NULL OR p_mode NOT IN ('open', 'restricted', 'strict') THEN
    RETURN jsonb_build_object('success', false, 'error', 'BAD_MODE');
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM companies c WHERE c.id = p_company_id AND c.user_id = v_actor
    UNION ALL
    SELECT 1 FROM company_members cm
     WHERE cm.company_id = p_company_id AND cm.user_id = v_actor
       AND lower(btrim(cm.role)) = 'owner'
  ) INTO v_is_owner;

  -- من يرى التكلفة لا يقرر من يراها — القرار للمالك وحده.
  IF NOT COALESCE(v_is_owner, false) THEN
    RETURN jsonb_build_object('success', false, 'error', 'OWNER_ONLY');
  END IF;

  UPDATE companies SET purchase_cost_visibility = p_mode WHERE id = p_company_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RETURN jsonb_build_object('success', false, 'error', 'NOT_FOUND');
  END IF;

  RETURN jsonb_build_object('success', true, 'mode', p_mode);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.set_purchase_cost_visibility(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_purchase_cost_visibility(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.set_purchase_cost_visibility(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_purchase_cost_visibility(uuid, text) TO service_role;
