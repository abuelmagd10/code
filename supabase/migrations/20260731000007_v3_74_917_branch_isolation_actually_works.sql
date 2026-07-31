-- ═══════════════════════════════════════════════════════════════════
-- v3.74.917 — عزل الفروع يعمل فعلاً (كان مكتوباً ومعطَّلاً)
-- ═══════════════════════════════════════════════════════════════════
--
-- اكتشفها المالك بنفسه، بالصدفة: وصل إشعارٌ إلى **محاسب الفرع الرئيسى**
-- عن فاتورة مشتريات **فرع مدينة نصر**، ففتحها وقرأ المورد والكميات
-- و**سعر الوحدة ١٠٠ جنيه**. أُكِّدت بانتحال هويته على الإنتاج:
-- يرى الفاتورة (١)، ويرى بنودها (١)، ويقرأ السعر (١٠٠٫٠٠).
--
-- ═══════════ السبب: المصيدة نفسها التى حرسناها فى 915 ═══════════
--
-- على `bills` سياستان متساهلتان معاً:
--     bills_select_branch_isolation  →  can_access_record_branch(...)   ✔
--     bills_select                   →  is_company_member(company_id)   ✘
--
-- وسياسات الصفوف المتساهلة **تُجمع بـ OR**. فالثانية تبتلع الأولى، ويصير
-- عزل الفروع حبراً: مكتوبٌ فى القاعدة، ولا يمنع شيئاً. وهذا أخبث من ألا
-- يكون مكتوباً أصلاً، لأن قارئ القاعدة يراه فيطمئن.
--
-- ومسحُ القاعدة كلها أظهر أنها ليست فى الفواتير وحدها. **أربعة جداول**
-- تحمل نفس الازدواج حرفياً:
--     bills · invoices · journal_entries · payments
-- أى أن عزل الفروع معطَّلٌ على المشتريات والمبيعات و**القيود اليومية**
-- و**المدفوعات** جميعاً.
--
-- ═══════════ والأبناء أوسع من الآباء ═══════════
--
-- وحتى لو أُغلق الأب، يبقى الابن مفتوحاً: `can_access_bill_items` و
-- `can_access_invoice_items` و`can_access_journal_lines` ثلاثتها تقرأ
-- `company_id` من الأب ثم تقول `is_company_member` — بلا سؤالٍ عن الفرع.
-- فبندُ الفاتورة (وفيه **سعر الشراء**) يُقرأ لأى عضوٍ فى الشركة. ومثلها
-- سياسة `purchase_order_items_access_members`.
--
-- وهذا هو الباب الخلفى الذى يُبطل حجب التكلفة كله (906–916): سُحب العمود
-- من بطاقة الصنف، ويُقرأ الرقم نفسه من بند الفاتورة.
--
-- ═══════════ قِيس قبل الكتابة وبعدها ═══════════
--
-- على الإنتاج، بانتحال هوية كل عضو (٧ أعضاء، كلهم بالفرع الرئيسى):
--   **قبل**: كلٌّ منهم يرى ٧ فواتير شراء · ٧ فواتير بيع · ٧٥ قيداً ·
--            ١٩ دفعة — أى **كل شىء، كالمالك تماماً**.
--   **بعد** (فى معاملةٍ أُلغيت): ٥ · ٥ · ٦٠ · ٩، والمالك يبقى ٧ · ٧ ·
--            ٧٥ · ١٩. أى تختفى مستندات مدينة نصر وحدها.
--
-- ═══════════ وما لا يفعله هذا الإصدار ═══════════
--
-- **داخل الفرع الواحد** تبقى أسعار فواتير المورد مقروءةً لكل أعضائه —
-- ومنهم موظف المبيعات ومسئول المخزن. وقرار المالك أن تُقصر على جمهور
-- التكلفة (المالك والمدير العام ومحاسب الفرع ومسئول مشترياته ومديره).
-- وذلك حجبٌ **على مستوى العمود** لا الصف — فمسئول المخزن يحتاج الصنف
-- والكمية ليستلم البضاعة ولا يحتاج السعر — وهو عملُ إصدارٍ كاملٍ بمساره
-- المخوَّل وحارسه، كما كان حجب تكلفة الصنف (908–912). يُفصل عمداً: خلطُه
-- هنا يُفرغ شاشاتٍ كما أفرغ 912 شاشة الأصناف.
-- ═══════════════════════════════════════════════════════════════════

-- ═══════════ (أ) عضو الشركة بلا فرع لا يُحبس ═══════════
--
-- عطبٌ كامنٌ فى الدالة: عضوٌ **بلا فرعٍ فى عضويته** (عضو الشركة كلها)
-- كان يسقط على `v_user_branch_id = p_branch_id` ⇒ `NULL = X` ⇒ NULL ⇒
-- تُقرأ رفضاً. فيُحرم من **كل** مستندٍ مرتبطٍ بفرع. ولم يظهر لأن كل
-- أعضاء الإنتاج اليوم مرتبطون بفروع (٧/٧) — لكنه كان سينفجر عند أول
-- عضوٍ على مستوى الشركة، **ويوم يُفعَّل العزل لا قبله**. فيُغلق الآن مع
-- تفعيله، لا بعده.
CREATE OR REPLACE FUNCTION public.can_access_record_branch(p_company_id uuid, p_branch_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_role           TEXT;
  v_user_branch_id UUID;
  v_found          BOOLEAN := FALSE;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN FALSE;
  END IF;

  SELECT cm.role, cm.branch_id, TRUE
    INTO v_role, v_user_branch_id, v_found
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

  -- الأدوار العامة: كل الفروع.
  IF lower(btrim(v_role)) IN ('owner', 'admin', 'general_manager', 'gm', 'generalmanager') THEN
    RETURN TRUE;
  END IF;

  -- v3.74.917 — عضو الشركة كلها (بلا فرعٍ فى عضويته) بلا قيدٍ مكانى.
  IF v_user_branch_id IS NULL THEN
    RETURN TRUE;
  END IF;

  -- سجلٌّ بلا فرع: بيانات على مستوى الشركة.
  IF p_branch_id IS NULL THEN
    RETURN TRUE;
  END IF;

  RETURN v_user_branch_id = p_branch_id;
END;
$function$;

COMMENT ON FUNCTION public.can_access_record_branch(uuid, uuid) IS
  'v3.74.917 — وصول السجل بالفرع: الأدوار العامة ومالك الشركة المسجَّل وعضو الشركة بلا فرعٍ فى عضويته بلا قيد؛ وغيرهم فرعُه وحده (والسجل بلا فرع للجميع).';

-- ═══════════ (ب) تُحذف السياسة المفتوحة التى تبتلع العزل ═══════════
--
-- لا تُعدَّل ولا تُضيَّق: تُحذف. فسياسةٌ متساهلةٌ ثانية بجوار العزل لا
-- فائدة منها إلا أن تفتح ما أُغلق — والسياسة الصحيحة قائمةٌ بالفعل على
-- كلٍّ من الأربعة (`*_select_branch_isolation`)، وسياستا المالك المسجَّل
-- (`*_owner_select` و`*_owner_dml`) تُبقيان له كل شىء.
DROP POLICY IF EXISTS bills_select            ON public.bills;
DROP POLICY IF EXISTS invoices_select         ON public.invoices;
DROP POLICY IF EXISTS journal_entries_select  ON public.journal_entries;
DROP POLICY IF EXISTS payments_select         ON public.payments;

-- ═══════════ (ج) والأبناء يسألون عن الفرع كآبائهم ═══════════
--
-- ثلاث دوالٍ متطابقة الشكل، كلٌّ منها تقرأ `company_id` من الأب ثم تقول
-- `is_company_member` — فتفتح البند لمن أُغلق عنه المستند. والسعر يعيش
-- فى البند لا فى الرأس.

CREATE OR REPLACE FUNCTION public.can_access_bill_items(p_bill_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_company_id UUID;
  v_branch_id  UUID;
BEGIN
  SELECT company_id, branch_id INTO v_company_id, v_branch_id
    FROM bills WHERE id = p_bill_id;
  IF v_company_id IS NULL THEN
    RETURN FALSE;
  END IF;
  -- v3.74.917 — الفرع كالرأس: من لا يرى الفاتورة لا يرى سعر بندها.
  RETURN public.can_access_record_branch(v_company_id, v_branch_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.can_access_invoice_items(p_invoice_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_company_id UUID;
  v_branch_id  UUID;
BEGIN
  SELECT company_id, branch_id INTO v_company_id, v_branch_id
    FROM invoices WHERE id = p_invoice_id;
  IF v_company_id IS NULL THEN
    RETURN FALSE;
  END IF;
  RETURN public.can_access_record_branch(v_company_id, v_branch_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.can_access_journal_lines(p_journal_entry_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_company_id UUID;
  v_branch_id  UUID;
BEGIN
  SELECT company_id, branch_id INTO v_company_id, v_branch_id
    FROM journal_entries WHERE id = p_journal_entry_id;
  IF v_company_id IS NULL THEN
    RETURN FALSE;
  END IF;
  RETURN public.can_access_record_branch(v_company_id, v_branch_id);
END;
$function$;

-- وبنود أمر الشراء: سياستُها كانت «أى عضوٍ فى الشركة» صراحةً، وفيها سعر
-- الشراء كذلك. تُعاد كتابتها على نفس القاعدة.
CREATE OR REPLACE FUNCTION public.can_access_purchase_order_items(p_purchase_order_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_company_id UUID;
  v_branch_id  UUID;
BEGIN
  SELECT company_id, branch_id INTO v_company_id, v_branch_id
    FROM purchase_orders WHERE id = p_purchase_order_id;
  IF v_company_id IS NULL THEN
    RETURN FALSE;
  END IF;
  RETURN public.can_access_record_branch(v_company_id, v_branch_id);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.can_access_purchase_order_items(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.can_access_purchase_order_items(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.can_access_purchase_order_items(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_purchase_order_items(uuid) TO service_role;

DROP POLICY IF EXISTS purchase_order_items_access_members ON public.purchase_order_items;
CREATE POLICY purchase_order_items_access_members ON public.purchase_order_items
FOR SELECT
USING (public.can_access_purchase_order_items(purchase_order_id));

-- ⚠️ وهذه أمسكها القياس لا القراءة. اسمُها يوحى بأنها للمالك المسجَّل،
-- وأولُ سطرٍ منها يقول `companies.user_id = auth.uid()` — فمررتُ عليها
-- ثم قِستُ الأثر فوجدتُ موظف الفرع ما زال يرى بنود أوامر الفرع الآخر.
-- وفى ذيلها المقطوع عن نظرى: `UNION SELECT company_members.company_id
-- ... WHERE user_id = auth.uid()` — أى **كل عضوٍ فى الشركة**.
--   الدرس: تُقاس السياسة بأثرها لا بنصّها، ولا بأول سطرٍ منه.
DROP POLICY IF EXISTS purchase_order_items_select ON public.purchase_order_items;

COMMENT ON FUNCTION public.can_access_bill_items(uuid) IS
  'v3.74.917 — بند فاتورة المورد يُقرأ بقيد فرع الفاتورة (وفيه سعر الشراء). كان يقول is_company_member وحده.';
COMMENT ON FUNCTION public.can_access_invoice_items(uuid) IS
  'v3.74.917 — بند فاتورة البيع يُقرأ بقيد فرع الفاتورة. كان يقول is_company_member وحده.';
COMMENT ON FUNCTION public.can_access_journal_lines(uuid) IS
  'v3.74.917 — سطر القيد يُقرأ بقيد فرع القيد. كان يقول is_company_member وحده.';
COMMENT ON FUNCTION public.can_access_purchase_order_items(uuid) IS
  'v3.74.917 — بند أمر الشراء يُقرأ بقيد فرع الأمر (وفيه سعر الشراء).';

-- ═══════════ (د) والإشعار لا يحمل الرقم إلى غير أهله ═══════════
--
-- الإشعار الذى كشف الثغرة كان **هو نفسه** ثغرة: نصُّه يحمل قيمة الفاتورة
-- (٩٨٦٫١٠) إلى محاسب فرعٍ آخر. والسبب فى منطقه: يبحث عن محاسبى فرع
-- الفاتورة، فإن لم يجد **يسقط إلى كل محاسبى الشركة** — وليس فى مدينة نصر
-- محاسبٌ أصلاً، فسقط إلى محاسب الرئيسى.
--
-- والنيّة سليمة (ألا تمرّ فاتورةٌ بلا مراجع)، والسقوط خاطئ: يجب أن يكون
-- إلى **من يملك رؤية المستند أصلاً** — محاسبٌ على مستوى الشركة (بلا فرعٍ
-- فى عضويته)، فإن لم يوجد فإلى المالك والمدير العام. لا إلى محاسب فرعٍ
-- لا يملك المستند.
CREATE OR REPLACE FUNCTION public.bill_notify_accountant_trg()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_supplier_name text;
  v_currency text;
  v_actor uuid;
  v_accountant uuid;
  v_branch_count int;
  v_company_wide_count int;
  v_po_no text;
BEGIN
  v_actor    := COALESCE(NEW.created_by_user_id, NEW.created_by);
  v_currency := COALESCE(NEW.currency_code, 'EGP');

  BEGIN
    SELECT name INTO v_supplier_name FROM public.suppliers WHERE id = NEW.supplier_id;
  EXCEPTION WHEN OTHERS THEN v_supplier_name := NULL; END;

  BEGIN
    IF NEW.purchase_order_id IS NOT NULL THEN
      SELECT po_number INTO v_po_no FROM public.purchase_orders WHERE id = NEW.purchase_order_id;
    END IF;
  EXCEPTION WHEN OTHERS THEN v_po_no := NULL; END;

  -- محاسبو فرع الفاتورة أولاً.
  SELECT COUNT(*) INTO v_branch_count
    FROM public.company_members
   WHERE company_id = NEW.company_id
     AND role       = 'accountant'
     AND branch_id  = NEW.branch_id
     AND user_id    IS NOT NULL;

  -- فإن لم يوجد: محاسبو الشركة كلها (بلا فرعٍ فى عضويتهم).
  SELECT COUNT(*) INTO v_company_wide_count
    FROM public.company_members
   WHERE company_id = NEW.company_id
     AND role       = 'accountant'
     AND branch_id  IS NULL
     AND user_id    IS NOT NULL;

  FOR v_accountant IN
    SELECT user_id FROM public.company_members
     WHERE company_id = NEW.company_id
       AND user_id    IS NOT NULL
       AND (
         -- (١) محاسب الفرع.
         (v_branch_count > 0 AND role = 'accountant' AND branch_id = NEW.branch_id)
         OR
         -- (٢) وإلا فمحاسب الشركة كلها.
         (v_branch_count = 0 AND v_company_wide_count > 0
          AND role = 'accountant' AND branch_id IS NULL)
         OR
         -- (٣) وإلا فالمالك والمدير العام — لا محاسبُ فرعٍ آخر.
         (v_branch_count = 0 AND v_company_wide_count = 0
          AND lower(btrim(role)) IN ('owner', 'admin', 'general_manager', 'gm', 'generalmanager'))
       )
       AND (v_actor IS NULL OR user_id <> v_actor)
  LOOP
    INSERT INTO public.notifications (
      company_id, reference_type, reference_id, created_by,
      assigned_to_user, title, message,
      priority, severity, category, channel, created_at
    ) VALUES (
      NEW.company_id, 'bill', NEW.id, v_actor,
      v_accountant,
      'فاتورة مشتريات جديدة تحتاج إجراء',
      'فاتورة ' || NEW.bill_number ||
      CASE WHEN v_supplier_name IS NOT NULL THEN ' من المورد ' || v_supplier_name ELSE '' END ||
      CASE WHEN v_po_no IS NOT NULL THEN ' (من أمر شراء ' || v_po_no || ')' ELSE '' END ||
      ' بقيمة ' || NEW.total_amount::text || ' ' || v_currency ||
      ' — راجع الفاتورة وحضّر دورة الدفع.',
      'high', 'info', 'accountant_action', 'in_app', NOW()
    );
  END LOOP;

  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.bill_notify_accountant_trg() IS
  'v3.74.917 — إشعار فاتورة المشتريات: محاسب فرعها، وإلا محاسب الشركة كلها، وإلا المالك/المدير العام. ولا يسقط إلى محاسب فرعٍ آخر — فنصّ الإشعار يحمل قيمة الفاتورة.';
