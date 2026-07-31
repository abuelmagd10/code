-- ═══════════════════════════════════════════════════════════════════
-- v3.74.911 — الحجب يقع: تُسحب قراءة أعمدة التكلفة من `authenticated`
-- ═══════════════════════════════════════════════════════════════════
--
-- هذا أول إصدارٍ **يُخفى شيئاً فعلاً** منذ قرار 906. وما قبله كان تمهيداً
-- مكتوباً بصراحة أنه لا يحجب:
--   906 — القاعدة تُكتب مرةً واحدة (`can_view_purchase_cost`).
--   908 — لا نجمة على `products` (النجمة تطلب المسحوب فتسقط).
--   909 — كل عرضٍ يمرّ بـ`product_costs`، والمالك يملك مفتاح الأوضاع.
--   910 — الدفاتر تستقل عن عمود العرض، ويسقط رقمان مخترعان.
--
-- ⚠️ الحقيقة التى تجعل هذا الإصدار ممكناً: **السحب على الدور لا على
--    الشخص**. `authenticated` دورٌ واحدٌ يجمع المالك وموظف المبيعات معاً،
--    فلا يمكن أن يُقرأ العمود لبعضهم دون بعض. ولذلك لا يقرأ العمود
--    **أحدٌ** بعد اليوم — ومنهم المالك — ويقرأه الجميع بقدر حقّهم عبر
--    `product_costs` (SECURITY DEFINER) التى تطبّق قاعدة 906.
--
-- ⚠️ ومصيدةٌ فى Postgres تُبطل هذا كله لو غُفلت: **صلاحية جدولٍ كاملة
--    تبتلع أى سحبٍ على عمود**. فلو بقى `GRANT SELECT ON products` قائماً
--    لما فعل `REVOKE SELECT (cost_price)` شيئاً على الإطلاق — ولظُنّ
--    الحجب واقعاً وهو لم يقع. ولهذا تُسحب صلاحية الجدول أولاً، ثم تُمنح
--    الأعمدة الثلاثة والثلاثون بالاسم.
--
-- والقائمة هنا يجب أن تطابق `PRODUCT_COLUMNS_NO_COST` فى
-- `lib/products-columns.ts` حرفاً بحرف — وحارس
-- `check-product-cost-grant.js` يقيس الاثنين مقابل القاعدة الحيّة فى كل
-- دفعة: عمودٌ يُضاف إلى الجدول ولا يُمنح يختفى من كل الشاشات صامتاً،
-- وعمود تكلفةٍ يُمنح ثانيةً يفتح ما أُغلق.
--
-- `service_role` يبقى على صلاحيته كاملة: مفتاح الخدمة ليس مستخدماً، وهو
-- ما تعمل به المهام الخلفية والهجرات.
-- ═══════════════════════════════════════════════════════════════════

-- ═══════════ (أ) السحب، ثم المنح بالاسم ═══════════

REVOKE SELECT ON public.products FROM authenticated;

GRANT SELECT (
  id,
  company_id,
  sku,
  name,
  description,
  unit_price,
  unit,
  quantity_on_hand,
  reorder_level,
  is_active,
  created_at,
  updated_at,
  original_currency,
  original_unit_price,
  display_currency,
  display_unit_price,
  display_rate,
  exchange_rate_used,
  item_type,
  income_account_id,
  expense_account_id,
  cost_center,
  tax_code_id,
  selling_price,
  branch_id,
  warehouse_id,
  cost_center_id,
  track_inventory,
  product_type,
  image_urls,
  shelf_life_days,
  units_per_carton,
  requires_withdrawal_approval
) ON public.products TO authenticated;

-- و`anon` يُعامَل بالمثل — دفاعاً فى العمق لا حاجةً قائمة: سياسات الصفوف
-- على `products` كلها تشترط `auth.uid()`، فالزائر المجهول لا يقرأ صفاً
-- أصلاً (وحارس 892 يحرس ذلك). لكن سياسةً تُضاف غداً لكتالوجٍ عام كانت
-- ستُسرّب التكلفة معها؛ والمنع الآن أرخص من تذكُّره حينها.
REVOKE SELECT ON public.products FROM anon;

GRANT SELECT (
  id,
  company_id,
  sku,
  name,
  description,
  unit_price,
  unit,
  quantity_on_hand,
  reorder_level,
  is_active,
  created_at,
  updated_at,
  original_currency,
  original_unit_price,
  display_currency,
  display_unit_price,
  display_rate,
  exchange_rate_used,
  item_type,
  income_account_id,
  expense_account_id,
  cost_center,
  tax_code_id,
  selling_price,
  branch_id,
  warehouse_id,
  cost_center_id,
  track_inventory,
  product_type,
  image_urls,
  shelf_life_days,
  units_per_carton,
  requires_withdrawal_approval
) ON public.products TO anon;

-- الكتابة لا تتغيّر: من كان يُنشئ منتجاً أو يعدّل تكلفته يبقى كذلك.
-- المسحوب هو **القراءة** وحدها، وهى وحدها ما يُسرِّب.
GRANT INSERT, UPDATE, DELETE ON public.products TO authenticated;

COMMENT ON COLUMN public.products.cost_price IS
  'v3.74.911 — محجوب عن دور authenticated. يُقرأ عبر product_costs(ids) وحدها، بقاعدة can_view_purchase_cost (906).';
COMMENT ON COLUMN public.products.original_cost_price IS
  'v3.74.911 — محجوب عن دور authenticated. يُقرأ عبر product_costs(ids) وحدها.';
COMMENT ON COLUMN public.products.display_cost_price IS
  'v3.74.911 — محجوب عن دور authenticated. يُقرأ عبر product_costs(ids) وحدها.';
