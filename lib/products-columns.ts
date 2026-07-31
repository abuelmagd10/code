/**
 * lib/products-columns.ts
 * ---------------------------------------------------------------------------
 * v3.74.908 — أعمدة `products` تُطلب **بالاسم**، لا بنجمة.
 *
 * لماذا: القرار المُتخذ فى 906 هو حجب تكلفة الشراء عمّن لا يحق له. والحجب
 * الحقيقى — سحب `SELECT` على أعمدة التكلفة من دور `authenticated` — يجعل
 * **كل** `select("*")` على `products` يسقط بخطأ صلاحية، لأن النجمة تطلب كل
 * عمود بما فيه المسحوب. وقياساً على الكود وقتها: **١٢ موضعاً** يطلب النجمة،
 * منها خمسة مسارات تصنيع تعمل بجلسة المستخدم لا بمفتاح الخدمة، فتنكسر فعلاً
 * لا نظرياً.
 *
 * ⇒ هذا الإصدار **لا يحجب شيئاً**. يُصفّى الأرض فحسب: النجمة تصير قائمة
 *   أعمدةٍ مسمّاة، فيصير الحجب فى الإصدار التالى تغييراً فى الصلاحيات لا
 *   انهياراً فى الشاشات.
 *
 * القائمتان:
 *   `PRODUCT_COLUMNS_NO_COST`   — كل الأعمدة إلا أعمدة التكلفة الثلاثة.
 *                                 تستعملها مسارات التصنيع: قِيس أنها لا تقرأ
 *                                 `cost_price` إطلاقاً (صفر إشارة فى
 *                                 `app/manufacturing` و`components/manufacturing`
 *                                 و`lib/manufacturing` و`app/api/manufacturing`).
 *   `PRODUCT_COLUMNS_WITH_COST` — القائمة كاملةً بأعمدة التكلفة.
 *                                 تستعملها شاشة الأصناف ومسار `products-list`
 *                                 وحدهما، لأنهما **يعرضان التكلفة اليوم**.
 *                                 وحذفها منهما هنا كان سيكون حجباً مُتسلِّلاً
 *                                 قبل أوانه — والإصدار التالى يحوّلهما إلى
 *                                 `product_costs(ids)` المخوَّل.
 *
 * ولماذا «كل الأعمدة إلا التكلفة» بدل قائمةٍ مختصرة؟ لأن الاختصار يحذف حقلاً
 * تستعمله شاشةٌ لم أقِسها، فيصير `undefined` صامتاً فى واجهةٍ لا تشتكى. وهذا
 * إصدارُ تصفيةٍ لا إصدارُ تحسين: يُبقى السلوك كما هو حرفياً، ويُزيل النجمة.
 *
 * وحارس `check-products-select-star.js` يقيس هاتين القائمتين مقابل الجدول
 * الحىّ فى كل دفعة: عمودٌ جديدٌ يُضاف إلى `products` ولا يُضاف هنا يجعل
 * القائمة تكذب على الشاشات — فيُرفض الدفع.
 * ---------------------------------------------------------------------------
 */

/** أعمدة التكلفة — وهى وحدها ما سيُسحب فى إصدار الحجب. */
export const PRODUCT_COST_COLUMNS = [
  "cost_price",
  "original_cost_price",
  "display_cost_price",
] as const

/**
 * كل أعمدة `products` عدا التكلفة.
 *
 * ⚠️ نصٌّ حرفىٌّ واحد لا مصفوفةٌ تُوصَل بـ`join`: `supabase-js` يقرأ نص
 * `select` **وقت الترجمة** ليستنتج نوع الصف. وقائمةٌ من نوع `string` تجعله
 * يعيد `GenericStringError`، فيسقط كل `product.id` فى المشروع. اصطاده `tsc`
 * فى بطارية الدفع (٧ أخطاء) قبل أن يصل إلى أحد.
 */
export const PRODUCT_COLUMNS_NO_COST =
  "id, company_id, sku, name, description, unit_price, unit, quantity_on_hand, reorder_level, is_active, created_at, updated_at, original_currency, original_unit_price, display_currency, display_unit_price, display_rate, exchange_rate_used, item_type, income_account_id, expense_account_id, cost_center, tax_code_id, selling_price, branch_id, warehouse_id, cost_center_id, track_inventory, product_type, image_urls, shelf_life_days, units_per_carton, requires_withdrawal_approval" as const

/**
 * القائمة كاملةً — للموضعين اللذين يعرضان التكلفة اليوم.
 * يُحوَّلان إلى `product_costs(ids)` فى إصدار الحجب، فتختفى هذه القائمة معهما.
 */
export const PRODUCT_COLUMNS_WITH_COST =
  `${PRODUCT_COLUMNS_NO_COST}, cost_price, original_cost_price, display_cost_price` as const
