-- ═══════════════════════════════════════════════════════════════════
-- v3.74.933 — أسعارُ الشراء: المسارُ المخوَّل يُبنى أولاً (المرحلة ١ من ٣)
-- ═══════════════════════════════════════════════════════════════════
--
-- ═══════════ قرارُ المالك المسجَّل ═══════════
--
-- **يُحجب البندُ والإجمالى معاً**. وسببُه حسابىٌّ لا ذوقى: فاتورةُ شراءٍ
-- ببندٍ واحدٍ إجمالُها ١٠٠٠ لعشر وحدات **تقول سعرَ الشراء بالقسمة**. فحجبُ
-- سطر السعر وحده حجبٌ يبدو تاماً وهو مكشوف — وهذا أسوأ من لا حجب، لأن
-- من يراه يطمئن.
--
-- ═══════════ ولماذا ثلاثُ مراحل لا دفعةٌ واحدة؟ ═══════════
--
-- **درس 909 حرفياً**: المسارُ المخوَّل يُبنى **قبل** سحب العمود، لا بعده.
-- ففى 906 كُتب المسار ثم ظهر عند التحويل أن الشاشات تقرأ عمودين آخرين لم
-- يحملهما المسار. ولو كان السحبُ قد سبق، لكانت الشاشاتُ قد كُسرت على
-- المستخدمين بين الإصدارين.
--
--   المرحلة ١ (هذه): المسارُ يُبنى ولا يقرأ منه أحدٌ بعد. **أثرُها على
--                   المستخدم صفر** — لا عمودَ يُسحب، ولا شاشةَ تتغير.
--   المرحلة ٢: تُحوَّل الشاشاتُ إلى المسار، والأعمدةُ ما زالت ممنوحة.
--   المرحلة ٣: يُسحب العمودُ من `authenticated` و`anon`، ويُضاف الحارس.
--
-- ═══════════ ولماذا **نافذةٌ مقنَّعة** لا دالةٌ تُنادى؟ ═══════════
--
-- 909 حجب تكلفةَ المنتج بدالةٍ تُنادى (`product_costs(ids)`). وقِيست هنا
-- الشاشاتُ فخرج ما يمنع تكرارَ ذلك الشكل: **٢١ موضعَ قراءةٍ يطلب
-- `select('*')`** على هذه الجداول الستة. وسحبُ العمود يُسقط `*` كلَّها
-- بخطأ صلاحية — **حتى لجمهور التكلفة نفسه**. فالدواءُ الذى يكسر المحاسبَ
-- ليس دواء.
--
-- فالمنفذُ نافذةٌ لكل جدول: نفسُ الأعمدة بنفس الأسماء وبنفس الترتيب،
-- **والمبالغُ فيها تأتى من دالةٍ مخوَّلة لا من الجدول**. فمن لا يملك
-- التكلفة يقرأ `NULL` مكانَ الرقم — لا خطأً ولا صفراً كاذباً — و`*` تبقى
-- تعمل كما هى.
--
-- ⚠️ **وشرطُ الصحة**: النافذةُ `security_invoker = true` — أى أن **عزلَ
-- الفروع يُطبَّق كما لو قرأ المستخدمُ الجدولَ بنفسه**. ولو كانت النافذةُ
-- بحقوق مالكها لالتفّت على كل ما بُنى من 917 إلى 932 فى ضربةٍ واحدة.
-- ولذلك أيضاً **لا تقرأ النافذةُ عمودَ مالٍ من الجدول مباشرةً**: لو قرأته
-- لانكسرت هى نفسُها يوم يُسحب العمود فى المرحلة ٣.
--
-- ═══════════ وحكمٌ واحدٌ يُنادى من موضعين ═══════════
--
-- دالةُ المال تحتاج أن تسأل: **هل يرى هذا الرجلُ هذا المستندَ أصلاً؟**
-- ولأنها `SECURITY DEFINER` فإن سياسةَ الصف لا تُطبَّق داخلها — فلو
-- أعادت كتابةَ الحكم بيدها لصار للحكم نسختان، وأولُ تعديلٍ على إحداهما
-- يفتح ثغرةً فى الأخرى صامتة.
--
-- فيُستخرج حكمُ كل رأسٍ إلى دالةٍ واحدة تُنادى **من السياسة ومن دالة
-- المال معاً**: `can_access_bill` · `can_access_purchase_order` ·
-- `can_access_purchase_return` (وهذه كانت موجودة). والبنودُ تُنادى دوالَّ
-- بنودها القائمة كما هى. **فالحكمُ واحدٌ فى موضعٍ واحد.**
--
-- وحكمُ الجمهور نفسُه لم يُخترع هنا: `can_view_purchase_cost` مكتوبةٌ منذ
-- 906 ومقيَّدةٌ بالفرع منذ 914 — وتُنادى بفرع المستند و**بمنشئه**، فيبقى
-- استثناءُ المنشئ الذى قرّره المالك: من كتب المستند يرى مالَه.
--
-- **وقياسٌ يسبق القرار**: صفرُ مستندٍ من الثلاثة بلا فرع (٨ فواتير · ٩
-- أوامر · ٢ مرتجع) — فقيدُ الفرع لا يُيتّم اليوم رقماً.
-- ═══════════════════════════════════════════════════════════════════

-- ═══════ (١) حكمُ الرأس يُستخرج ليُنادى من موضعين ═══════
--
-- نصُّ الدالتين هو **نصُّ السياستين القائمتين حرفاً بحرف** — لا توسيعَ ولا
-- تضييق. والبرهانُ بالقياس: الأعدادُ لكل دورٍ قبل وبعد.

CREATE OR REPLACE FUNCTION public.can_access_bill(p_bill_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.bills b
     WHERE b.id = p_bill_id
       AND b.company_id IN (SELECT public.get_user_company_ids())
       AND public.can_access_record_branch(b.company_id, b.branch_id)
  );
$function$;

REVOKE ALL    ON FUNCTION public.can_access_bill(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_bill(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.can_access_purchase_order(p_purchase_order_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.purchase_orders po
     WHERE po.id = p_purchase_order_id
       AND po.company_id IN (SELECT public.get_user_company_ids())
       AND public.can_access_record_branch(po.company_id, po.branch_id)
  );
$function$;

REVOKE ALL    ON FUNCTION public.can_access_purchase_order(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_purchase_order(uuid) TO authenticated, service_role;

-- ═══════ (٢) والسياستان تُناديان الحكمَ نفسه ═══════
--
-- بابٌ واحدٌ لكل جدول كما استقرّ فى 931، والحكمُ فيه نداءٌ لا نصّ.

DROP POLICY IF EXISTS bills_select_branch_isolation ON public.bills;
CREATE POLICY bills_select_branch_isolation ON public.bills
FOR SELECT
USING (public.can_access_bill(id));

DROP POLICY IF EXISTS purchase_orders_select_branch_isolation ON public.purchase_orders;
CREATE POLICY purchase_orders_select_branch_isolation ON public.purchase_orders
FOR SELECT
USING (public.can_access_purchase_order(id));

-- ═══════ (٣) دوالُّ المال: الرقمُ لجمهوره، و NULL لغيره ═══════
--
-- كلُّ دالةٍ تسأل سؤالين قبل أن تعطى رقماً: **هل يُرى المستند؟** (بحكم
-- جدوله الواحد) و**هل يُرى مالُه؟** (بـ `can_view_purchase_cost` بفرع
-- المستند ومنشئه). فإن سقط أحدُهما فالجوابُ NULL لا خطأ — فالصفُّ يبقى
-- مقروءاً وبضاعتُه تُستلم، والمالُ وحده يغيب.
--
-- وهى آمنةٌ للنداء المباشر: من نادى بمعرِّف مستندٍ لا يراه أخذ NULL،
-- لأن الشرطَ الأول يُقاس داخلها لا خارجها.

CREATE OR REPLACE FUNCTION public.bill_money(p_id uuid)
 RETURNS TABLE(subtotal numeric, tax_amount numeric, total_amount numeric, discount_value numeric, shipping numeric, adjustment numeric, paid_amount numeric, returned_amount numeric, base_currency_total numeric, original_total numeric, display_total numeric, display_subtotal numeric, original_subtotal numeric, original_tax_amount numeric, pre_receipt_refund_amount numeric)
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
  SELECT
         CASE WHEN t.ok THEN b.subtotal END,
         CASE WHEN t.ok THEN b.tax_amount END,
         CASE WHEN t.ok THEN b.total_amount END,
         CASE WHEN t.ok THEN b.discount_value END,
         CASE WHEN t.ok THEN b.shipping END,
         CASE WHEN t.ok THEN b.adjustment END,
         CASE WHEN t.ok THEN b.paid_amount END,
         CASE WHEN t.ok THEN b.returned_amount END,
         CASE WHEN t.ok THEN b.base_currency_total END,
         CASE WHEN t.ok THEN b.original_total END,
         CASE WHEN t.ok THEN b.display_total END,
         CASE WHEN t.ok THEN b.display_subtotal END,
         CASE WHEN t.ok THEN b.original_subtotal END,
         CASE WHEN t.ok THEN b.original_tax_amount END,
         CASE WHEN t.ok THEN b.pre_receipt_refund_amount END
  FROM public.bills b
   CROSS JOIN LATERAL (
     SELECT public.can_access_bill(b.id)
        AND public.can_view_purchase_cost(b.company_id, COALESCE(b.created_by_user_id, b.created_by), b.branch_id, TRUE) AS ok
   ) t
 WHERE b.id = p_id;
$function$;

REVOKE ALL    ON FUNCTION public.bill_money(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bill_money(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.purchase_order_money(p_id uuid)
 RETURNS TABLE(subtotal numeric, tax_amount numeric, total_amount numeric, received_amount numeric, discount_value numeric, shipping numeric, total numeric, adjustment numeric, returned_amount numeric)
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
  SELECT
         CASE WHEN t.ok THEN b.subtotal END,
         CASE WHEN t.ok THEN b.tax_amount END,
         CASE WHEN t.ok THEN b.total_amount END,
         CASE WHEN t.ok THEN b.received_amount END,
         CASE WHEN t.ok THEN b.discount_value END,
         CASE WHEN t.ok THEN b.shipping END,
         CASE WHEN t.ok THEN b.total END,
         CASE WHEN t.ok THEN b.adjustment END,
         CASE WHEN t.ok THEN b.returned_amount END
  FROM public.purchase_orders b
   CROSS JOIN LATERAL (
     SELECT public.can_access_purchase_order(b.id)
        AND public.can_view_purchase_cost(b.company_id, b.created_by_user_id, b.branch_id, TRUE) AS ok
   ) t
 WHERE b.id = p_id;
$function$;

REVOKE ALL    ON FUNCTION public.purchase_order_money(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.purchase_order_money(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.purchase_return_money(p_id uuid)
 RETURNS TABLE(subtotal numeric, tax_amount numeric, total_amount numeric, settlement_amount numeric, original_subtotal numeric, original_tax_amount numeric, original_total_amount numeric)
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
  SELECT
         CASE WHEN t.ok THEN b.subtotal END,
         CASE WHEN t.ok THEN b.tax_amount END,
         CASE WHEN t.ok THEN b.total_amount END,
         CASE WHEN t.ok THEN b.settlement_amount END,
         CASE WHEN t.ok THEN b.original_subtotal END,
         CASE WHEN t.ok THEN b.original_tax_amount END,
         CASE WHEN t.ok THEN b.original_total_amount END
  FROM public.purchase_returns b
   CROSS JOIN LATERAL (
     SELECT public.can_access_purchase_return(b.id)
        AND public.can_view_purchase_cost(b.company_id, b.created_by, b.branch_id, TRUE) AS ok
   ) t
 WHERE b.id = p_id;
$function$;

REVOKE ALL    ON FUNCTION public.purchase_return_money(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.purchase_return_money(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.bill_item_money(p_id uuid)
 RETURNS TABLE(unit_price numeric, line_total numeric)
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
  SELECT
         CASE WHEN t.ok THEN b.unit_price END,
         CASE WHEN t.ok THEN b.line_total END
  FROM public.bill_items b
  JOIN public.bills h ON h.id = b.bill_id
   CROSS JOIN LATERAL (
     SELECT public.can_access_bill_items(b.bill_id)
        AND public.can_view_purchase_cost(h.company_id, COALESCE(h.created_by_user_id, h.created_by), h.branch_id, TRUE) AS ok
   ) t
 WHERE b.id = p_id;
$function$;

REVOKE ALL    ON FUNCTION public.bill_item_money(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bill_item_money(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.purchase_order_item_money(p_id uuid)
 RETURNS TABLE(unit_price numeric, line_total numeric)
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
  SELECT
         CASE WHEN t.ok THEN b.unit_price END,
         CASE WHEN t.ok THEN b.line_total END
  FROM public.purchase_order_items b
  JOIN public.purchase_orders h ON h.id = b.purchase_order_id
   CROSS JOIN LATERAL (
     SELECT public.can_access_purchase_order_items(b.purchase_order_id)
        AND public.can_view_purchase_cost(h.company_id, h.created_by_user_id, h.branch_id, TRUE) AS ok
   ) t
 WHERE b.id = p_id;
$function$;

REVOKE ALL    ON FUNCTION public.purchase_order_item_money(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.purchase_order_item_money(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.purchase_return_item_money(p_id uuid)
 RETURNS TABLE(unit_price numeric, line_total numeric)
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
  SELECT
         CASE WHEN t.ok THEN b.unit_price END,
         CASE WHEN t.ok THEN b.line_total END
  FROM public.purchase_return_items b
  JOIN public.purchase_returns h ON h.id = b.purchase_return_id
   CROSS JOIN LATERAL (
     SELECT public.can_access_purchase_return_item(b.id)
        AND public.can_view_purchase_cost(h.company_id, h.created_by, h.branch_id, TRUE) AS ok
   ) t
 WHERE b.id = p_id;
$function$;

REVOKE ALL    ON FUNCTION public.purchase_return_item_money(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.purchase_return_item_money(uuid) TO authenticated, service_role;

-- ═══════ (٤) النوافذُ المقنَّعة: نفسُ الأعمدة، والمالُ من المسار ═══════
--
-- لكل جدولٍ نافذةٌ باسمه + `_masked`، فيها **كلُّ أعمدة الجدول بنفس
-- الأسماء وبنفس الترتيب** — فـ`select('*')` تعمل كما هى، والفارقُ الوحيد
-- أن أعمدةَ المال تأتى من `LEFT JOIN LATERAL` على دالة المال.
--
-- ⚠️ `security_invoker = true`: عزلُ الفروع يُطبَّق على القارئ نفسه.
-- ⚠️ ولا عمودَ مالٍ يُقرأ من `b` مباشرةً: النافذةُ تنجو من سحب المرحلة ٣.
--
-- وعددُ الأعمدة المقنَّعة: ١٥ على الفواتير · ٩ على أوامر الشراء · ٧ على
-- المرتجعات · واثنان على كل جدول بنود (السعر والإجمالى). ولم تُقنَّع
-- **النسبُ ولا الأسعارُ الصرفية** (`tax_rate` · `discount_percent` ·
-- `exchange_rate` · `display_rate`) ولا الكميات: نسبةٌ لا تقول مبلغاً.
--
-- ⚠️ **ودرسٌ من عائلة 919/929 ظهر بالقياس هنا**: `ALTER DEFAULT PRIVILEGES`
-- على هذه القاعدة يمنح **كل الصلاحيات** لـ`authenticated` على كل جدولٍ
-- ونافذةٍ تُنشأ. فأولُ كتابةٍ للنافذة أعطت المستخدمَ INSERT و UPDATE و
-- DELETE و TRUNCATE عليها — قِيست فى `role_table_grants` بعد الإنشاء.
-- ولذلك `REVOKE ALL ... FROM PUBLIC, anon, authenticated` **قبل** منح
-- القراءة وحدها. **ولا يُكتفى بمنح ما نريد: يُسحب ما لم نُرِده أولاً.**

DROP VIEW IF EXISTS public.bills_masked;
CREATE VIEW public.bills_masked WITH (security_invoker = true) AS
SELECT
       b.id,
       b.company_id,
       b.supplier_id,
       b.bill_number,
       b.bill_date,
       b.due_date,
       m.subtotal,
       m.tax_amount,
       m.total_amount,
       b.discount_type,
       m.discount_value,
       b.discount_position,
       b.tax_inclusive,
       m.shipping,
       b.shipping_tax_rate,
       m.adjustment,
       m.paid_amount,
       b.status,
       b.notes,
       b.created_at,
       b.updated_at,
       b.is_deleted,
       b.deleted_at,
       b.deleted_by,
       m.returned_amount,
       b.return_status,
       b.currency_code,
       b.exchange_rate,
       m.base_currency_total,
       b.original_currency,
       m.original_total,
       b.display_currency,
       m.display_total,
       m.display_subtotal,
       b.display_rate,
       b.exchange_rate_used,
       m.original_subtotal,
       m.original_tax_amount,
       b.exchange_rate_id,
       b.rate_source,
       b.purchase_order_id,
       b.shipping_method,
       b.shipping_provider_id,
       b.branch_id,
       b.cost_center_id,
       b.warehouse_id,
       b.created_by_user_id,
       b.approval_status,
       b.approved_by,
       b.approved_at,
       b.received_by,
       b.received_at,
       b.receipt_status,
       b.receipt_rejection_reason,
       b.rejection_reason,
       b.rejected_by,
       b.rejected_at,
       b.created_by,
       b.goods_receipt_id,
       b.last_edited_by_user_id,
       b.pre_receipt_refund_at,
       b.pre_receipt_refund_by,
       m.pre_receipt_refund_amount,
       b.pre_receipt_refund_mode,
       b.pre_receipt_refund_reason,
       b.pre_receipt_refund_je_id,
       b.voided_by,
       b.voided_at,
       b.voided_reason
  FROM public.bills b
  LEFT JOIN LATERAL public.bill_money(b.id) m ON TRUE;

REVOKE ALL   ON public.bills_masked FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.bills_masked TO authenticated, service_role;

DROP VIEW IF EXISTS public.purchase_orders_masked;
CREATE VIEW public.purchase_orders_masked WITH (security_invoker = true) AS
SELECT
       b.id,
       b.company_id,
       b.supplier_id,
       b.po_number,
       b.po_date,
       b.due_date,
       m.subtotal,
       m.tax_amount,
       m.total_amount,
       m.received_amount,
       b.status,
       b.notes,
       b.created_at,
       b.updated_at,
       b.discount_type,
       m.discount_value,
       m.shipping,
       b.currency,
       b.bill_id,
       m.total,
       b.discount_position,
       b.tax_inclusive,
       b.shipping_tax_rate,
       m.adjustment,
       b.exchange_rate,
       b.shipping_method,
       b.shipping_provider_id,
       b.branch_id,
       b.cost_center_id,
       b.warehouse_id,
       m.returned_amount,
       b.return_status,
       b.created_by_user_id,
       b.rejection_reason,
       b.rejected_by,
       b.rejected_at,
       b.approved_by,
       b.approved_at,
       b.goods_receipt_id
  FROM public.purchase_orders b
  LEFT JOIN LATERAL public.purchase_order_money(b.id) m ON TRUE;

REVOKE ALL   ON public.purchase_orders_masked FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.purchase_orders_masked TO authenticated, service_role;

DROP VIEW IF EXISTS public.purchase_returns_masked;
CREATE VIEW public.purchase_returns_masked WITH (security_invoker = true) AS
SELECT
       b.id,
       b.company_id,
       b.supplier_id,
       b.bill_id,
       b.return_number,
       b.return_date,
       m.subtotal,
       m.tax_amount,
       m.total_amount,
       m.settlement_amount,
       b.settlement_method,
       b.status,
       b.reason,
       b.notes,
       b.journal_entry_id,
       b.original_currency,
       m.original_subtotal,
       m.original_tax_amount,
       m.original_total_amount,
       b.exchange_rate_used,
       b.exchange_rate_id,
       b.created_at,
       b.updated_at,
       b.branch_id,
       b.cost_center_id,
       b.warehouse_id,
       b.workflow_status,
       b.created_by,
       b.confirmed_by,
       b.confirmed_at,
       b.confirmation_notes,
       b.approved_by,
       b.approved_at,
       b.rejected_by,
       b.rejected_at,
       b.rejection_reason,
       b.is_locked,
       b.draft_financial_data,
       b.warehouse_rejection_reason,
       b.warehouse_rejected_by,
       b.warehouse_rejected_at,
       b.financial_status,
       b.exchange_rate_at_return,
       b.refund_account_id
  FROM public.purchase_returns b
  LEFT JOIN LATERAL public.purchase_return_money(b.id) m ON TRUE;

REVOKE ALL   ON public.purchase_returns_masked FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.purchase_returns_masked TO authenticated, service_role;

DROP VIEW IF EXISTS public.bill_items_masked;
CREATE VIEW public.bill_items_masked WITH (security_invoker = true) AS
SELECT
       b.id,
       b.bill_id,
       b.product_id,
       b.description,
       b.quantity,
       m.unit_price,
       b.tax_rate,
       b.discount_percent,
       m.line_total,
       b.created_at,
       b.returned_quantity,
       b.item_type,
       b.tax_code_id
  FROM public.bill_items b
  LEFT JOIN LATERAL public.bill_item_money(b.id) m ON TRUE;

REVOKE ALL   ON public.bill_items_masked FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.bill_items_masked TO authenticated, service_role;

DROP VIEW IF EXISTS public.purchase_order_items_masked;
CREATE VIEW public.purchase_order_items_masked WITH (security_invoker = true) AS
SELECT
       b.id,
       b.purchase_order_id,
       b.product_id,
       b.description,
       b.quantity,
       m.unit_price,
       b.tax_rate,
       m.line_total,
       b.received_quantity,
       b.created_at,
       b.item_type,
       b.discount_percent,
       b.tax_code_id
  FROM public.purchase_order_items b
  LEFT JOIN LATERAL public.purchase_order_item_money(b.id) m ON TRUE;

REVOKE ALL   ON public.purchase_order_items_masked FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.purchase_order_items_masked TO authenticated, service_role;

DROP VIEW IF EXISTS public.purchase_return_items_masked;
CREATE VIEW public.purchase_return_items_masked WITH (security_invoker = true) AS
SELECT
       b.id,
       b.purchase_return_id,
       b.bill_item_id,
       b.product_id,
       b.description,
       b.quantity,
       m.unit_price,
       b.tax_rate,
       b.discount_percent,
       m.line_total,
       b.created_at,
       b.warehouse_id,
       b.warehouse_allocation_id,
       b.is_deducted
  FROM public.purchase_return_items b
  LEFT JOIN LATERAL public.purchase_return_item_money(b.id) m ON TRUE;

REVOKE ALL   ON public.purchase_return_items_masked FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.purchase_return_items_masked TO authenticated, service_role;

-- ═══════ (٥) وتوثيقٌ يبقى فى القاعدة ═══════

COMMENT ON FUNCTION public.can_access_bill(uuid) IS
  'v3.74.933 — حكمُ رؤية فاتورة الشراء فى موضعٍ واحد: تُناديه سياسةُ الصف ودالةُ المال معاً، فلا تفترق النسختان.';
COMMENT ON FUNCTION public.can_access_purchase_order(uuid) IS
  'v3.74.933 — حكمُ رؤية أمر الشراء فى موضعٍ واحد: تُناديه سياسةُ الصف ودالةُ المال معاً.';
COMMENT ON FUNCTION public.bill_money(uuid) IS
  'v3.74.933 — المسارُ المخوَّل لمبالغ فاتورة الشراء: الرقمُ لجمهور التكلفة فى فرع المستند أو لمنشئه، و NULL لغيرهم.';
COMMENT ON FUNCTION public.bill_item_money(uuid) IS
  'v3.74.933 — سعرُ بند فاتورة الشراء وإجمالُه، لجمهوره وحده.';
COMMENT ON VIEW public.bills_masked IS
  'v3.74.933 — منفذُ القراءة المقنَّع لفواتير الشراء. security_invoker=true فيبقى عزلُ الفروع كما هو، والمبالغُ من bill_money لا من الجدول.';
COMMENT ON VIEW public.bill_items_masked IS
  'v3.74.933 — منفذُ القراءة المقنَّع لبنود فواتير الشراء.';
