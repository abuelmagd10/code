-- ═══════════════════════════════════════════════════════════════════
-- v3.74.928 — بضاعةُ الطرف الثالث: الحوكمةُ المكتوبةُ تُفعَّل
-- ═══════════════════════════════════════════════════════════════════
--
-- ثامن جدولٍ من التسعة عشر — **ومصيدةُ 917 فى أنقى صورها**.
--
-- ═══════════ ما قِيس قبل الكتابة ═══════════
--
-- على الجدول **سياستا قراءةٍ متساهلتان جنباً إلى جنب**:
--
--   `third_party_inventory_select_governance` — مكتوبةٌ بعناية: تعرف
--       الأدوار والفروع والمخازن، وفيها ذراعٌ لمدير المخزن الرئيسى وذراعٌ
--       لموظفٍ أنشأ أمر البيع.
--   `third_party_inventory_select`            — `company_id IN
--       (company_members)` وحدها. **مفتوحةٌ على مصراعيها.**
--
-- والمتساهلتان تُجمعان بـOR، **فالثانيةُ تبتلع الأولى بالكامل**. وقياسُ
-- الإنتاج يؤكده: **الأدوار السبعة كلُّها ترى الأربعة**، ومنها صفُّ مدينة
-- نصر — والجدول يحمل `unit_cost` و`total_cost`.
--
-- **ونفسُ الازدواج على الإدراج والتعديل والحذف**: حوكمةٌ دقيقة، وبجوارها
-- سياسةٌ على مستوى الشركة تُلغيها. فأى عضوٍ كان يعدّل صفَّ فرعٍ آخر —
-- **وفيه التكلفة**.
--
-- فمن كتب الحوكمة **لم يحذف القديمة**. وهذه رابعُ مرة تظهر فيها قاعدةٌ
-- معروفةٌ ولم تُنفَّذ (بعد `booking_payments` فى 926 ودوالِّ كتابة الموردين
-- فى 927) — لكنها **الأولى التى تكون فيها القاعدةُ مكتوبةً على الجدول
-- نفسه ومعطَّلةً بجاره**. وهذا أخبثُ الأشكال: قارئُ النصّ يراها ويطمئن.
--
-- ═══════════ الحكم: لا أوسّع ولا أضيّق — أُفعّل ما كُتب ═══════════
--
-- تُحذف المتساهلاتُ الأربع، وتبقى الحوكمةُ كما هى. وسُئل المالكُ عن
-- ذراعَيها العابرَين للفرع، **فأقرّهما كليهما**:
--
--   • **مدير المخزن الرئيسى** يرى بضاعة كل الفروع — إشرافٌ مقصود، وهو
--     حىٌّ اليوم (مديرُ مخزنٍ واحدٌ عندك، وعلى المخزن الرئيسى فعلاً).
--   • **الموظف مُنشئ أمر البيع** يتابع شحنته حتى تصل ولو عبرت فرعاً آخر.
--     وهو **يخالف قاعدة 922** عن قصدٍ من المالك: هناك «أنا من أنشأه»
--     ادعاءُ ماضٍ، وهنا متابعةُ شحنةٍ قائمة.
--
-- وتُضاف **ثغرتان تفرضهما قاعدة 917**، لم تكن الحوكمةُ تراهما:
--   • **المالك المسجَّل** غير العضو (`companies.user_id`) — كانت الحوكمة
--     تسأل `company_members` وحدها فتحجب عنه ما يملك.
--   • **عضو الشركة بلا فرعٍ فى عضويته** — كانت أذرعُها تطلب تطابق الفرع،
--     و`NULL` لا يطابق شيئاً، فيُحجب عنه كلُّ شىء.
-- وكلتاهما تُغطَّيان بـ`current_user_is_branch_unbounded` المضافة فى 924.
-- ═══════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS third_party_inventory_select ON public.third_party_inventory;
DROP POLICY IF EXISTS third_party_inventory_insert ON public.third_party_inventory;
DROP POLICY IF EXISTS third_party_inventory_update ON public.third_party_inventory;
DROP POLICY IF EXISTS third_party_inventory_delete ON public.third_party_inventory;

DROP POLICY IF EXISTS third_party_inventory_select_governance ON public.third_party_inventory;

CREATE POLICY third_party_inventory_select_governance ON public.third_party_inventory
FOR SELECT
USING (
  company_id IN (SELECT get_user_company_ids())
  AND (
       -- المالك المسجَّل، والأدوار العامة، وعضو الشركة بلا فرع (917 · 924)
       public.current_user_is_branch_unbounded(company_id)
    OR EXISTS (
         SELECT 1 FROM public.company_members cm
          WHERE cm.company_id = third_party_inventory.company_id
            AND cm.user_id = auth.uid()
            AND (
                 -- مدير المخزن الرئيسى: إشرافٌ على كل الفروع (أقرّه المالك)
                 (cm.role = 'store_manager' AND EXISTS (
                    SELECT 1 FROM public.warehouses w
                     WHERE w.id = cm.warehouse_id AND w.is_main = true))
                 -- ومدير مخزنٍ آخر: فرعُه وحده
              OR (cm.role = 'store_manager' AND cm.branch_id = third_party_inventory.branch_id)
              OR (cm.role IN ('manager', 'accountant') AND cm.branch_id = third_party_inventory.branch_id)
                 -- والبائع يتابع شحنته حتى تصل (أقرّه المالك)
              OR (cm.role IN ('staff', 'sales', 'employee') AND EXISTS (
                    SELECT 1 FROM public.invoices inv
                      JOIN public.sales_orders so ON inv.sales_order_id = so.id
                     WHERE inv.id = third_party_inventory.invoice_id
                       AND so.created_by_user_id = auth.uid()))
            )
       )
  )
);

COMMENT ON POLICY third_party_inventory_select_governance ON public.third_party_inventory IS
  'v3.74.928 — الحوكمةُ المكتوبةُ منذ زمن صارت نافذة، بعد حذف السياسة التى كانت تبتلعها بالـOR. وأُضيف المالك المسجَّل وعضو الشركة بلا فرع.';
