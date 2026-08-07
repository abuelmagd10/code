/**
 * lib/purchase-money.ts
 * ---------------------------------------------------------------------------
 * v3.74.936 — المسارُ الوحيد الذى تُقرأ به مبالغُ الشراء فى الواجهة.
 *
 * القاعدة كُتبت فى 906 ومُقيِّدت بالفرع فى 914 (`can_view_purchase_cost`)،
 * والمنفذُ المخوَّل بُنى فى 933 (النوافذُ المقنَّعة `..._masked`). وهذا
 * الملف وجهُهما فى الكود: **لا شاشةَ تسأل جدولاً عن مبلغ شراءٍ بعد اليوم،
 * ولا شاشةَ تُقرّر بقائمة أدوارٍ من عندها** (درس 934).
 *
 * ═══ ثلاثةُ أشياء، وثلاثتُها تُخطئ حين تُترك لكل شاشةٍ تُعيد اختراعَها ═══
 *
 * **(١) «هل أرى التكلفة؟» يُسأل عنه القاعدة.** وخطأُ السؤال ليس إذناً:
 * العجزُ عن التحقق يُغلق ولا يفتح (درس 865). ولذلك تُعيد `false` عند أى
 * فشل، ولا تُعيد `undefined` تتركها الشاشةُ تُفسَّر كما تشاء.
 *
 * **(٢) المبلغُ المحجوب `null`، ويُعرض «—» لا صفراً.** والفرقُ ليس
 * تجميلاً: `Number(x || 0).toFixed(2)` تكتب «0.00» مكان مبلغٍ موجود،
 * **فتكذب على قارئها بثقة**. والصفرُ الكاذب أسوأ من الفراغ الصادق، لأن
 * من يرى صفراً يبنى عليه.
 *
 * **(٣) وما لا يُقرأ لا يُحسب.** كلُّ فعلٍ يبنى مستنداً من سعرٍ مقروء —
 * مرتجعُ شراءٍ من بنود فاتورة، أو نسخُ إجمالياتٍ إلى أمر شراء — **يجب أن
 * يُمنع على غير جمهور التكلفة قبل أن يبدأ**. فلو مضى بـ`null` لكتب
 * أصفاراً فى دفترٍ حقيقى: لا حجبٌ بل إتلاف. وهذا امتدادُ قرار المالك
 * (منعِ شاشات التحرير) لا قراراً جديداً.
 * ---------------------------------------------------------------------------
 */

/**
 * عميلٌ بلا نوعٍ صارم — عمداً، وللسبب نفسه المشروح فى `lib/product-costs.ts`:
 * `SupabaseClient` نوعٌ مُعمَّم بتحميلاتٍ زائدة لـ`rpc`، وأى واجهةٍ أضيق
 * منه تُرفض عند التمرير.
 */
type AnyClient = any

/**
 * هل يرى هذا المستخدمُ مبالغَ الشراء فى هذه الشركة (وفى هذا الفرع)؟
 *
 * تُنادى **القاعدة** لا قائمةَ أدوارٍ محلية. و`branchId` هو فرعُ المستند
 * أو الصنف محلِّ السؤال؛ فإن كان `null` سُئل السؤالُ العام «هل هو من
 * جمهور التكلفة أصلاً؟» بلا قيدِ فرع — وهو ما تحتاجه الشاشةُ لتقرّر إظهارَ
 * عمودٍ أو إتاحةَ فعل.
 */
export async function fetchCanViewPurchaseCost(
  supabase: AnyClient,
  companyId: string | null | undefined,
  branchId: string | null = null
): Promise<boolean> {
  if (!companyId) return false
  try {
    const { data, error } = await supabase.rpc("can_view_purchase_cost", {
      p_company_id: companyId,
      p_created_by: null,
      p_product_branch_id: branchId,
      p_scope_by_branch: branchId != null,
    })
    if (error) {
      // فشلُ السؤال يُغلق ولا يفتح (865).
      console.error("[purchase-money] can_view_purchase_cost failed:", error)
      return false
    }
    return data === true
  } catch (err) {
    console.error("[purchase-money] can_view_purchase_cost threw:", err)
    return false
  }
}

/** ما يُعرض مكان مبلغٍ محجوب. رمزٌ واحدٌ فى كل الشاشات، لا اجتهادَ لكل واحدة. */
export const HIDDEN_MONEY = "—"

/** تلميحٌ يُشرح الفراغ، فلا يُظنّ عطباً فى الشاشة. */
export const HIDDEN_MONEY_HINT_AR = "غير مصرَّح لك برؤية تكلفة الشراء"
export const HIDDEN_MONEY_HINT_EN = "You are not allowed to see the purchase cost"

/**
 * مبلغٌ للعرض: «—» إن كان محجوباً (`null`/`undefined`)، وإلا رقمٌ بمنزلتين.
 *
 * ⚠️ لا تستعمل `Number(x || 0)` مع مبالغ الشراء: صفرٌ حقيقىٌّ ومبلغٌ محجوب
 * يصيران واحداً، **والكاذبُ منهما يُصدَّق**.
 */
export function money(value: number | string | null | undefined, digits = 2): string {
  // v3.74.974 — والنصُّ الفارغُ محجوبٌ أيضاً: Number("") = 0، فلولا هذا
  // السطرِ لكتب صفراً واثقاً مكان مبلغٍ لم يُقرأ.
  if (value === null || value === undefined || value === "") return HIDDEN_MONEY
  const n = typeof value === "string" ? Number(value) : value
  if (!Number.isFinite(n)) return HIDDEN_MONEY
  return n.toFixed(digits)
}

/**
 * هل حُجبت مبالغُ هذا الصفِّ كلُّها؟
 *
 * ⚠️ **درس 938**: `null` فى عمودٍ مقنَّع يحتمل معنيين — «محجوبٌ عنك» و«لا
 * قيمةَ أصلاً». وعمودٌ كـ`shipping` افتراضُه صفرٌ ويقبل الفراغ، فلو قيس
 * الحجبُ عليه لظهرت «—» لكل أمرٍ بلا شحن — **حجبٌ كاذبٌ يراه الجميع**.
 *
 * فيُسأل عن **شاهدٍ لا يقبل الفراغ فى الجدول الأصل**: `total_amount` فى
 * الرؤوس (`bills` · `purchase_orders` · `purchase_returns`)، و`unit_price`
 * أو `line_total` فى البنود — كلُّها `NOT NULL` **مقيسةً**. ففراغُها لا يأتى
 * إلا من التقنيع. والقيدُ نفسُه محروسٌ فى
 * `scripts/check-purchase-cost-masked-path.js`، فإن سقط يوماً صاح الحارسُ
 * بدل أن يصمت الحجب.
 */
export function rowMoneyHidden(witness: number | string | null | undefined): boolean {
  return isHiddenMoney(witness)
}

/** هل هذا المبلغُ محجوبٌ عنى؟ (لتقرير عرضِ تلميحٍ أو تعطيلِ زر) */
export function isHiddenMoney(value: number | string | null | undefined): boolean {
  if (value === null || value === undefined) return true
  const n = typeof value === "string" ? Number(value) : value
  return !Number.isFinite(n)
}

/**
 * جمعٌ آمن لمبالغَ بعضُها محجوب.
 *
 * والقاعدةُ هنا **ليست** تجاهلَ المحجوب: مجموعٌ ينقصه بندٌ محجوبٌ **رقمٌ
 * خاطئٌ يبدو صحيحاً**. فإن كان فى المجموعة مبلغٌ واحدٌ محجوب فالمجموعُ
 * كلُّه محجوب — `null` — وتعرضه الشاشةُ «—».
 */
export function sumOrHidden(values: Array<number | string | null | undefined>): number | null {
  let total = 0
  for (const v of values) {
    if (isHiddenMoney(v)) return null
    total += typeof v === "string" ? Number(v) : (v as number)
  }
  return total
}
