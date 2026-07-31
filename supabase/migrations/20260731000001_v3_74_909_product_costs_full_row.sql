-- ═══════════════════════════════════════════════════════════════════
-- v3.74.909 — المسار المخوَّل يحمل **أعمدة التكلفة الثلاثة** لا واحداً
-- ═══════════════════════════════════════════════════════════════════
--
-- 906 كتب `product_costs(ids)` وهو يعيد `cost_price` وحده. وحين جاء وقت
-- تحويل الشاشات إليه ظهر ما لم يُقَس وقتها: الشاشة **لا تعرض
-- `cost_price`**، بل تعرض `display_cost_price` حين تطابق عملةُ العرض
-- عملةَ التطبيق، وتحتفظ بـ`original_cost_price` لتحرير الصنف بعملته
-- الأصلية. فمسارٌ يعيد عموداً واحداً كان سيترك الشاشتين تقرآن العمودين
-- الآخرين من الجدول مباشرةً — أى **حجبٌ ثلثُه فقط**، وهو أسوأ من لا حجب
-- لأنه يبدو تاماً.
--
-- ⇒ يُعاد تعريف المسار ليحمل الثلاثة معاً. والقاعدة نفسها لم تتغير:
--   `can_view_purchase_cost(company_id, NULL)` — بالدور وحده، بلا استثناء
--   منشئ، لأن المنتج لا منشئ له أصلاً (قِيس فى 906: لا عمود منشئ فى
--   `products` إطلاقاً).
--
-- والتوقيع تغيّر فى نوع العائد، فلا تكفى `CREATE OR REPLACE`: تُحذف
-- الدالة أولاً. ولا خطر فى الحذف — قِيس أن **لا سطر واحد** فى الكود
-- يناديها بعد (`grep product_costs` لا يجد إلا تعليقين).
-- ═══════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.product_costs(uuid[]);

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
     AND public.can_view_purchase_cost(p.company_id, NULL);
$function$;

REVOKE EXECUTE ON FUNCTION public.product_costs(uuid[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.product_costs(uuid[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.product_costs(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.product_costs(uuid[]) TO service_role;

COMMENT ON FUNCTION public.product_costs(uuid[]) IS
  'v3.74.909 — المسار المخوَّل الوحيد لقراءة تكلفة المنتج: يعيد الأعمدة الثلاثة لمن تسمح له قاعدة can_view_purchase_cost، ولا شىء لغيره.';
