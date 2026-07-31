import { PRODUCT_COLUMNS_NO_COST } from "@/lib/products-columns"
import { attachProductCosts } from "@/lib/product-costs"
import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { secureApiRequest } from "@/lib/api-security-enhanced"
import { serverError, badRequestError } from "@/lib/api-security-enhanced"
import { buildBranchFilter } from "@/lib/branch-access-control"

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const { user, companyId, branchId, member, error } = await secureApiRequest(req, {
      requireAuth: true,
      requireCompany: true,
      requireBranch: false, // ✅ المنتجات قد لا تحتاج فرع
      requirePermission: { resource: "products", action: "read" }
    })

    if (error) return error
    if (!companyId) return badRequestError("معرف الشركة مطلوب")

    const supabase = await createClient()

    // ✅ بناء الاستعلام - تطبيق فلتر الفرع فقط إذا كان موجوداً
    // v3.74.637 — join the branch so each product carries its branch name;
    // the products page no longer depends on its own (client) branches list
    // to resolve names (which showed "Unknown" for branch-scoped roles).
    let query = supabase
      .from("products")
      .select(`${PRODUCT_COLUMNS_NO_COST}, branch:branch_id(branch_name)`)
      .eq("company_id", companyId)

    // v3.74.915 — لا فلترةَ فرعٍ هنا بعد اليوم. كانت هذه الأسطر تقول
    // `branch_id = فرع العضو` لغير المالك/المشرف/المدير العام، وهى قاعدةٌ
    // **أضيق مما طلبه المالك**: البضاعة المنقولة إلى فرعٍ تبقى بطاقتُها
    // لفرعها الأصلى (النقل يحرّك الكمية ولا يمسّ البطاقة)، فكان المنقول
    // **لا يظهر لمن استلمه** — فلا يبيعه، وهو نصّ الطلب.
    //
    // والقاعدة انتقلت إلى حيث لا تُنسى: سياسة الصفوف `products_select`
    // تقول «منتجُ فرعى **أو** ما تحرّك فى فرعى»، وتُطبَّق على كل نداء
    // للجدول لا على هذه الشاشة وحدها. وتَرْكُ الفلترة هنا كان يخالفها
    // صامتاً.

    const productType = req.nextUrl.searchParams.get("product_type")
    if (productType) {
      query = query.eq("product_type", productType)
    }

    const { data, error: dbError } = await query.order("name")

    if (dbError) {
      console.error("Error loading products:", dbError)
      return serverError(`خطأ في جلب المنتجات: ${dbError.message}`)
    }

    // Flatten the joined branch name onto each product row.
    const flattened = (data || []).map((p: any) => ({
      ...p,
      branch_name: p.branch?.branch_name ?? null,
      branch: undefined,
    }))

    // v3.74.912 — التكلفة تُلحَق من المسار المخوَّل، ولمن تسمح له قاعدة 906.
    // كانت تُطلب مع الأعمدة (`PRODUCT_COLUMNS_WITH_COST`)، فلمّا سُحبت
    // الصلاحية فى 911 سقط الاستعلام كله — لا التكلفة وحدها — **ففرغت شاشة
    // الأصناف عند الجميع**. عمودٌ واحدٌ محجوب يُسقط الصف كله، لا يُفرغه.
    await attachProductCosts(supabase, flattened as any[])

    return NextResponse.json({
      success: true,
      data: flattened
    })
  } catch (e: any) {
    console.error("Error in products-list API:", e)
    return serverError(`حدث خطأ أثناء جلب المنتجات: ${e?.message || "Unknown error"}`)
  }
}