-- ═══════════════════════════════════════════════════════════════════
-- v3.74.916 — المنتج الذى بلا فرع: لا يُشترى ولا يُباع إلا بحقّه
-- ═══════════════════════════════════════════════════════════════════
--
-- الشقّ الأخير من طلب المالك (31/7، بنصّه): «المنتجات التى غير مرتبطة
-- بفرع… المستخدمون التابعون لفرع لم يروا هذه المنتجات ولا يمكنهم اتمام
-- عملية شراء عليها، وبالتالى المالك أو المدير العام هم فقط من لهم حق
-- تنفيذ عملية الشراء».
--
-- والرؤية أُغلقت فى 915. وهنا **الإنفاذ**، بثلاثة أجزاء:
--
--   (أ) **الشراء** على منتجٍ بلا فرع: للمالك والمدير العام وحدهما.
--   (ب) **البيع** عليه من فرعٍ: ممنوعٌ حتى تصله بضاعةٌ منه فعلاً.
--   (ج) وأعمدة الحوكمة فى مستندات الشراء تصير **ممنوعةً من الفراغ**.
--
-- ولماذا لا تكفى الرؤية وحدها؟ لأن إخفاء الصنف من الشاشة يمنع
-- **الاختيار** لا **الفعل**. يبقى نداءٌ مباشر للجدول، وشاشةٌ تُكتب غداً
-- بفلترةٍ أوسع، ومسارٌ يُنشئ فاتورةً من أمر شراءٍ قديم. وقد اختار المالك
-- صراحةً موضع المنع: **فى القاعدة، محفِّزٌ يرفض البند**.
--
-- ═══════════ قرار البيع، ونصّ المالك فيه ═══════════
--
-- سُئل: منتجٌ بلا فرع اشتراه المالك — أيُباع على فاتورة فرعٍ قبل نقله؟
-- فاختار المنع: «الصنف الذى بلا فرع لا يُباع على فاتورة أى فرعٍ إلا بعد
-- أن تصله بضاعةٌ منه فعلاً بحركةٍ مسجّلة… ميزتُه أن كل بيعٍ يقابله دخولٌ
-- مسجَّل، فالرصيد بالفرع صادق دائماً».
--
-- وشرح تصميمه بنفسه، وهو ما تُنفّذه هذه الهجرة حرفاً بحرف: «عند قيام
-- المالك أو المدير العام بالشراء… يجب تحديد الفرع ومركز التكلفة والمخزن
-- التابع لفرع، وعليه هذه العملية للشراء مرتبطة بفرع… وهنا المالك ينقل
-- البضائع المشتراة… إلى مخازن مرتبطة بفروع مستخدمين بالكمية المحددة،
-- وهنا تدخل الكمية فى مخزنهم ويمكنهم تنفيذ البيع دون رؤية تكاليفه».
--
-- فصار المنتج الذى بلا فرع يُعامَل فى البيع **معاملةَ منتج الفرع الآخر
-- تماماً**: لا يُباع من فرعٍ إلا إن دخلته بضاعتُه. وبهذا يتوحّد الشرط
-- ولا يبقى بابان.
--
-- ⚠️ قِيس قبل الكتابة: **صفر** منتجٍ بلا فرع على الإنتاج (١٣/١٣ لها
--    فرع)، ولا عضوَ يحمل دور `admin` أو `general_manager` هناك اليوم،
--    و**صفر** أمر نقلٍ منذ بدء النظام. فلا صفَّ واحدٌ يتغيّر حالُه الآن،
--    وإنما يُغلق البابان قبل أول منتجٍ بلا فرع.
-- ═══════════════════════════════════════════════════════════════════

-- ═══════════ (أ) من يملك الشراء على منتج الشركة ═══════════
--
-- بنصّ المالك: «المالك أو المدير العام **هم فقط**». فلا يُوسَّع الجمهور
-- باجتهاد: التوسعة تُطلب فتُكتب، أما التضييق الخاطئ فيُرى فوراً (رفضٌ
-- مسموع) بخلاف التوسعة الخاطئة (تسريبٌ صامت).
CREATE OR REPLACE FUNCTION public.can_purchase_branchless_product(p_company_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_role  text;
BEGIN
  IF v_actor IS NULL OR p_company_id IS NULL THEN
    RETURN false;
  END IF;

  -- المالك المسجَّل فى companies.user_id مالكٌ ولو لم يُذكر عضواً (درس ٨٣٦:
  -- الاعتماد على العضوية وحدها أسقط المالك عن حقّه أكثر من مرة).
  IF EXISTS (SELECT 1 FROM companies c WHERE c.id = p_company_id AND c.user_id = v_actor) THEN
    RETURN true;
  END IF;

  SELECT lower(btrim(cm.role)) INTO v_role
    FROM company_members cm
   WHERE cm.company_id = p_company_id AND cm.user_id = v_actor
   LIMIT 1;

  RETURN v_role IN ('owner', 'general_manager', 'gm', 'generalmanager');
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.can_purchase_branchless_product(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.can_purchase_branchless_product(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.can_purchase_branchless_product(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_purchase_branchless_product(uuid) TO service_role;

COMMENT ON FUNCTION public.can_purchase_branchless_product(uuid) IS
  'v3.74.916 — الشراء على منتجٍ بلا فرع (منتج الشركة): للمالك المسجَّل وللمالك والمدير العام بالعضوية وحدهم، بنصّ المالك «هم فقط».';

-- ═══════════ (ب) الحارس القائم يحمل الشرطين الجديدين ═══════════
--
-- يُضافان داخل `validate_product_branch_isolation` لا فى محفِّزٍ ثانٍ: هى
-- معلَّقةٌ على الجداول الستة بالفعل، وتقرأ `products` مرةً واحدة، وصارت
-- `SECURITY DEFINER` فى 915 — فتقرأ فرع المنتج حقيقةً لا كما يُسمح
-- للمستخدم برؤيته. ومحفِّزٌ ثانٍ كان سيقرأ الجدول مرةً أخرى ويحتاج نفس
-- الامتياز، ويُنسى عند أول تعديلٍ لأخيه.
--
-- وموضع الشرطين دقيق: `v_pb IS NULL` كانت تعنى «منتج شركةٍ بلا فرع ⇒
-- يمرّ» بلا سؤال. الآن تُسأل: شراءً (بالحقّ) وبيعاً (بالوصول).
--
-- ⚠️ والفاعل المجهول قرارٌ مقيس لا سهو: حين تكون `auth.uid()` فارغة
--    (هجرةٌ أو مفتاح خدمة) يمرّ الشراء. وليس هذا «العجز عن التحقق إذناً»
--    (٨٦٥)، بل نتيجةُ قياس: مسارا الكتابة الوحيدان على هذين الجدولين
--    (`app/api/purchase-orders/route.ts` و`app/api/bills/[id]/confirm-receipt`)
--    يستعملان `createClient()` — أى جلسة المستخدم، فالهوية حاضرة دائماً؛
--    والملفاتُ الأربعة التى تحمل مفتاح الخدمة وتلمس هذين الجدولين
--    (تقريرا المشتريات وأسعار الفترات، ومقارنة أسعار الموردين، وإرسال أمر
--    الشراء) **قارئةٌ كلها** — لا `insert` ولا `update` فى أىٍّ منها؛ ومن
--    يملك مفتاح الخدمة يملك القاعدة كلها أصلاً، فالمنع لا يزيده شيئاً
--    ويكسر فى المقابل كل هجرةٍ مستقبلية تمسّ هذين الجدولين.
--    أما **البيع** فلا استثناء فيه للفاعل المجهول: شرطُه وصولُ البضاعة،
--    وهى حقيقةٌ فى الجدول لا هويةٌ فى الجلسة.
CREATE OR REPLACE FUNCTION public.validate_product_branch_isolation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_pb       UUID;
  v_db       UUID;
  v_company  UUID;
  v_tn       TEXT := TG_TABLE_NAME;
  v_p        UUID;
  v_arrived  BOOLEAN;
BEGIN
  IF NEW.product_id IS NULL THEN RETURN NEW; END IF;

  CASE v_tn
    WHEN 'purchase_order_items'  THEN v_p := NEW.purchase_order_id;  SELECT branch_id INTO v_db FROM purchase_orders  WHERE id = v_p;
    WHEN 'bill_items'            THEN v_p := NEW.bill_id;            SELECT branch_id INTO v_db FROM bills            WHERE id = v_p;
    WHEN 'sales_order_items'     THEN v_p := NEW.sales_order_id;     SELECT branch_id INTO v_db FROM sales_orders     WHERE id = v_p;
    WHEN 'invoice_items'         THEN v_p := NEW.invoice_id;         SELECT branch_id INTO v_db FROM invoices         WHERE id = v_p;
    WHEN 'purchase_return_items' THEN v_p := NEW.purchase_return_id; SELECT branch_id INTO v_db FROM purchase_returns WHERE id = v_p;
    WHEN 'vendor_credit_items'   THEN v_p := NEW.vendor_credit_id;   SELECT branch_id INTO v_db FROM vendor_credits   WHERE id = v_p;
    ELSE RETURN NEW;
  END CASE;

  IF v_db IS NULL THEN RETURN NEW; END IF;

  SELECT branch_id, company_id INTO v_pb, v_company FROM products WHERE id = NEW.product_id;

  -- منتجُ هذا الفرع بعينه: لا سؤال.
  IF v_pb IS NOT NULL AND v_pb = v_db THEN RETURN NEW; END IF;

  -- v3.74.916 — الشراء على منتجٍ بلا فرع: للمالك والمدير العام وحدهما.
  IF v_pb IS NULL
     AND v_tn IN ('purchase_order_items', 'bill_items')
     AND auth.uid() IS NOT NULL
     AND NOT public.can_purchase_branchless_product(v_company)
  THEN
    RAISE EXCEPTION 'BRANCHLESS_PRODUCT_PURCHASE_DENIED: هذا الصنف غير مرتبط بفرع، والشراء عليه للمالك أو المدير العام وحدهما.';
  END IF;

  -- v3.74.915/916 — البيع على ما وصل: يُسمح حين تكون بضاعةٌ من هذا الصنف
  -- قد **دخلت هذا الفرع فعلاً** (حركة موجبة: transfer_in أو شراء أو
  -- إنتاج). لا نيّةٌ ولا أمر نقلٍ معلَّق — دخولٌ مسجَّل. والشرط واحدٌ
  -- للمنقول ولمنتج الشركة معاً (916): كلاهما ليس منتج هذا الفرع.
  IF v_tn IN ('invoice_items', 'sales_order_items') THEN
    SELECT EXISTS (
      SELECT 1 FROM inventory_transactions t
       WHERE t.product_id = NEW.product_id
         AND t.branch_id  = v_db
         AND t.quantity_change > 0
    ) INTO v_arrived;

    IF v_arrived THEN RETURN NEW; END IF;

    IF v_pb IS NULL THEN
      RAISE EXCEPTION 'BRANCHLESS_PRODUCT_NOT_IN_BRANCH: هذا الصنف غير مرتبط بفرع ولم تصل منه بضاعةٌ إلى هذا الفرع بعد — انقل الكمية أولاً ثم بِع.';
    END IF;

    RAISE EXCEPTION 'Branch Isolation Violation';
  END IF;

  -- وما بقى (بلا فرع، أو فرعٌ آخر) على المستندات الأخرى: كما كان.
  IF v_pb IS NULL THEN RETURN NEW; END IF;

  RAISE EXCEPTION 'Branch Isolation Violation';
END;
$function$;

COMMENT ON FUNCTION public.validate_product_branch_isolation() IS
  'v3.74.916 — عزل الفروع على بنود المستندات: منتجٌ بلا فرع لا يُشترى إلا بيد المالك/المدير العام، ولا يُباع من فرعٍ حتى تصله بضاعتُه؛ ومنتج فرعٍ آخر لا يُباع إلا إن دخلت بضاعتُه هذا الفرع (915). SECURITY DEFINER ليقرأ فرع المنتج حقيقةً بعد تضييق products_select.';

-- ═══════════ (ج) أعمدة الحوكمة تُمنع من الفراغ فى مستندات الشراء ═══════════
--
-- تصميم المالك يقوم على أن **عملية الشراء مرتبطة بفرع** ومركز تكلفة
-- ومخزنٍ تابعٍ له — وبها تدخل البضاعة مخزن ذلك الفرع فيراها أهلُه وحدهم.
-- وكان ذلك محروساً بالعادة لا بالقاعدة:
--   • `invoices` و`sales_orders`: الأعمدة الثلاثة **NOT NULL** بالفعل.
--   • `bills`: تقبل الفراغ فى تعريف الجدول، ويحرسها محفِّز
--     `enforce_governance_on_insert` وحده.
--   • `purchase_orders`: تقبل الفراغ، و**لا محفِّز حوكمةٍ عليها أصلاً** —
--     الإلزام يعيش فى مسار الواجهة فقط (`resolvePurchaseBranchContext`
--     يرفع «branch_id is required» ويتحقق أن المخزن ومركز التكلفة من نفس
--     الفرع). ومسارُ واجهةٍ ليس قاعدة: يُتجاوَز بنداءٍ مباشر.
--
-- والقيد يُكتب الآن لأنه **لا يمسّ صفاً**: قِيس على الإنتاج ٨ أوامر شراء
-- و٧ فواتير موردين — صفرُ فراغٍ فى الأعمدة الثلاثة فى كلٍّ منها.
ALTER TABLE public.purchase_orders ALTER COLUMN branch_id      SET NOT NULL;
ALTER TABLE public.purchase_orders ALTER COLUMN cost_center_id SET NOT NULL;
ALTER TABLE public.purchase_orders ALTER COLUMN warehouse_id   SET NOT NULL;

ALTER TABLE public.bills ALTER COLUMN branch_id      SET NOT NULL;
ALTER TABLE public.bills ALTER COLUMN cost_center_id SET NOT NULL;
ALTER TABLE public.bills ALTER COLUMN warehouse_id   SET NOT NULL;

COMMENT ON COLUMN public.purchase_orders.branch_id IS
  'v3.74.916 — ممنوعٌ من الفراغ: عملية الشراء مرتبطة بفرع (قرار المالك)، وبه تدخل البضاعة مخزن ذلك الفرع فيراها أهلُه وحدهم.';
COMMENT ON COLUMN public.bills.branch_id IS
  'v3.74.916 — ممنوعٌ من الفراغ: عملية الشراء مرتبطة بفرع (قرار المالك). كان محروساً بمحفِّز الحوكمة وحده.';
