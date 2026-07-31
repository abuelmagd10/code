/**
 * lib/product-costs.ts
 * ---------------------------------------------------------------------------
 * v3.74.909 — المسار الوحيد الذى تُقرأ به تكلفة المنتج فى الواجهة.
 *
 * القاعدة كُتبت فى 906 (`can_view_purchase_cost`) والمسار المخوَّل هو
 * `product_costs(ids)`. وهذا الملف هو وجهه فى الكود: لا شاشة تسأل الجدول
 * عن `cost_price` بعد اليوم، بل تسأل هذا.
 *
 * **لماذا هذا الشكل بالذات** — إلحاقٌ على الصفوف لا استبدالٌ لها: الشاشات
 * تقرأ `product.cost_price` فى عشرات المواضع (بطاقات، جداول، حسابات ربح).
 * فلو أعدتُ خريطةً منفصلة لوجب تعديل كل قارئ؛ ولو غيّرتُ شكل الصف لانكسر
 * ما لم أره. فالإلحاق يُبقى كل قارئٍ كما هو، ويغيّر **مصدر** الرقم وحده.
 *
 * ومن لا يستحق الرؤية لا يحصل على صفٍّ من الدالة أصلاً، فتُكتب حقوله
 * `null` صراحةً — لا تُترك كما جاءت من الجدول. وهذا مقصود: `null` تعنى
 * «محجوب» وتُعرض «—»، بينما تركُ الحقل غائباً يجعل الواجهة تعرض صفراً،
 * وصفرٌ كاذبٌ أسوأ من فراغٍ صادق.
 *
 * ⚠️ الإصدار التالى يسحب `SELECT` على الأعمدة الثلاثة من `authenticated`،
 *    فيصير كل قارئٍ مباشرٍ **خطأ صلاحية** لا مجرد تجاوزٍ للقاعدة. وحارس
 *    `check-product-cost-direct-read.js` يعدّ القرّاء المباشرين ويشترط
 *    بقاءهم صفراً من الآن.
 * ---------------------------------------------------------------------------
 */

export type ProductCostRow = {
  product_id: string
  cost_price: number | null
  original_cost_price: number | null
  display_cost_price: number | null
}

/** حدُّ الدفعة: مصفوفةٌ ضخمة فى نداءٍ واحد تُثقل الطلب بلا داعٍ. */
const CHUNK = 500

/**
 * عميلٌ بلا نوعٍ صارم — عمداً.
 *
 * `SupabaseClient` نوعٌ مُعمَّم بتحميلاتٍ زائدة لـ`rpc`، فأى واجهةٍ
 * بنيويةٍ أضيق منه تُرفض عند التمرير (اصطاده `tsc` بست رسائل). والمُراد
 * هنا نداءُ دالةٍ واحدة لا وصفُ العميل كله، والنوع الصارم يُشترى بثمن
 * تحويلاتٍ فى كل مُستدعٍ — وهو ثمنٌ يُدفع فى وضوح الكود لا فى أمانه.
 */
type AnyClient = any

/** خريطة `product_id → أعمدة التكلفة` لمن يستحق، فارغةٌ لمن لا يستحق. */
export async function fetchProductCostMap(
  supabase: AnyClient,
  productIds: Array<string | null | undefined>
): Promise<Map<string, ProductCostRow>> {
  const ids = Array.from(new Set((productIds || []).filter(Boolean) as string[]))
  const map = new Map<string, ProductCostRow>()
  if (ids.length === 0) return map

  for (let i = 0; i < ids.length; i += CHUNK) {
    const slice = ids.slice(i, i + CHUNK)
    const { data, error } = await supabase.rpc("product_costs", { p_product_ids: slice })
    // خطأٌ هنا ليس إذناً بعرض رقمٍ قديم: تُترك الحقول `null` ويُسجَّل السبب.
    if (error) {
      console.error("[product-costs] product_costs failed:", error)
      continue
    }
    for (const row of (data as ProductCostRow[] | null) || []) {
      if (row?.product_id) map.set(row.product_id, row)
    }
  }
  return map
}

/**
 * يُلحق أعمدة التكلفة بصفوفٍ تحمل `id` (أو بمُعرِّفٍ يُستخرج بـ`idOf`).
 * يُعيد نفس المصفوفة بعد التعديل كى يبقى الاستدعاء سطراً واحداً.
 */
export async function attachProductCosts<T extends Record<string, any>>(
  supabase: AnyClient,
  rows: T[] | null | undefined,
  idOf: (row: T) => string | null | undefined = (row) => row?.id
): Promise<T[]> {
  const list = (rows || []).filter(Boolean)
  if (list.length === 0) return list
  const map = await fetchProductCostMap(supabase, list.map(idOf))
  for (const row of list) {
    const id = idOf(row)
    const cost = id ? map.get(id) : undefined
    // الصفّ يُكتب عليه كسجلٍّ مفتوح: `T` قد لا تُعلن حقول التكلفة أصلاً،
    // وهو المقصود — الإلحاق يُضيفها لمن لم يكن يحملها.
    const target = row as Record<string, any>
    target.cost_price = cost ? cost.cost_price : null
    target.original_cost_price = cost ? cost.original_cost_price : null
    target.display_cost_price = cost ? cost.display_cost_price : null
  }
  return list
}
