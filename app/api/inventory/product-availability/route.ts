/**
 * API Route: Get Product Availability Across All Branches
 * 
 * Returns available inventory quantity for a product across all branches/warehouses
 * Read-only endpoint - no modifications allowed
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { enforceGovernance } from "@/lib/governance-middleware"
import { getAccessFilter } from "@/lib/authz"

export interface ProductAvailabilityResult {
  branch_id: string
  branch_name: string
  warehouse_id: string
  warehouse_name: string
  cost_center_id: string | null
  cost_center_name: string | null
  available_quantity: number
}

/**
 * GET /api/inventory/product-availability
 * 
 * Query params:
 * - product_id: UUID of the product to check
 * - company_id: UUID of the company (optional, will use from governance)
 */
export async function GET(request: NextRequest) {
  try {
    // 1️⃣ تطبيق الحوكمة الأساسية
    const governance = await enforceGovernance(request)
    const supabase = await createClient()
    
    // 2️⃣ جلب معاملات البحث
    const searchParams = request.nextUrl.searchParams
    const productId = searchParams.get("product_id")
    const companyId = governance.companyId || searchParams.get("company_id")
    
    if (!productId) {
      return NextResponse.json(
        { 
          error: "product_id is required",
          error_ar: "معرف المنتج مطلوب"
        },
        { status: 400 }
      )
    }
    
    if (!companyId) {
      return NextResponse.json(
        { 
          error: "company_id is required",
          error_ar: "معرف الشركة مطلوب"
        },
        { status: 400 }
      )
    }
    
    // 3️⃣ التحقق من صلاحيات المستخدم على الفروع
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized", error_ar: "غير مصرح" },
        { status: 401 }
      )
    }
    
    // جلب صلاحيات المستخدم على الفروع
    const { data: memberData } = await supabase
      .from("company_members")
      .select("role, branch_id, allowed_branches")
      .eq("company_id", companyId)
      .eq("user_id", user.id)
      .maybeSingle()
    
    if (!memberData) {
      return NextResponse.json(
        { error: "User not found in company", error_ar: "المستخدم غير موجود في الشركة" },
        { status: 403 }
      )
    }
    
    // 4️⃣ تحديد الفروع المسموح للمستخدم بالاطلاع عليها
    const accessFilter = getAccessFilter(memberData.role, memberData.branch_id, memberData.allowed_branches)
    let allowedBranchIds: string[] | null = null
    
    if (accessFilter.branchId) {
      // المستخدم مقيد بفرع واحد
      allowedBranchIds = [accessFilter.branchId]
    } else if (accessFilter.allowedBranchIds && accessFilter.allowedBranchIds.length > 0) {
      // المستخدم لديه قائمة فروع مسموحة
      allowedBranchIds = accessFilter.allowedBranchIds
    }
    // إذا كان null، يعني يمكنه رؤية جميع الفروع (owner/admin)
    
    // 5️⃣ جلب جميع الفروع والمخازن في الشركة
    let branchesQuery = supabase
      .from("branches")
      .select("id, name, branch_name")
      .eq("company_id", companyId)
      .eq("is_active", true)
    
    if (allowedBranchIds) {
      branchesQuery = branchesQuery.in("id", allowedBranchIds)
    }
    
    const { data: branches, error: branchesError } = await branchesQuery
    
    if (branchesError) {
      console.error("Error fetching branches:", branchesError)
      return NextResponse.json(
        { 
          error: "Failed to fetch branches",
          error_ar: "فشل جلب الفروع"
        },
        { status: 500 }
      )
    }
    
    if (!branches || branches.length === 0) {
      return NextResponse.json({ data: [] })
    }
    
    const branchIds = branches.map(b => b.id)
    
    // 6️⃣ جلب جميع المخازن في الفروع المسموحة
    let warehousesQuery = supabase
      .from("warehouses")
      .select("id, name, branch_id, cost_center_id")
      .eq("company_id", companyId)
      .eq("is_active", true)
      .in("branch_id", branchIds)
    
    const { data: warehouses, error: warehousesError } = await warehousesQuery
    
    if (warehousesError) {
      console.error("Error fetching warehouses:", warehousesError)
      return NextResponse.json(
        { 
          error: "Failed to fetch warehouses",
          error_ar: "فشل جلب المخازن"
        },
        { status: 500 }
      )
    }
    
    if (!warehouses || warehouses.length === 0) {
      return NextResponse.json({ data: [] })
    }
    
    // 7️⃣ جلب مراكز التكلفة
    const costCenterIds = warehouses
      .map(w => w.cost_center_id)
      .filter((id): id is string => id !== null)
    
    let costCentersMap = new Map<string, string>()
    if (costCenterIds.length > 0) {
      const { data: costCenters } = await supabase
        .from("cost_centers")
        .select("id, cost_center_name")
        .in("id", costCenterIds)
      
      if (costCenters) {
        costCentersMap = new Map(
          costCenters.map(cc => [cc.id, cc.cost_center_name || ""])
        )
      }
    }
    
    // 8️⃣ حساب الكمية المتاحة لكل مخزن
    const results: ProductAvailabilityResult[] = []
    
    for (const warehouse of warehouses) {
      const branch = branches.find(b => b.id === warehouse.branch_id)
      if (!branch) continue
      
      // استخدام دالة SQL لحساب الكمية المتاحة
      const { data: availableQty, error: qtyError } = await supabase.rpc(
        'get_available_inventory_quantity',
        {
          p_company_id: companyId,
          p_branch_id: warehouse.branch_id,
          p_warehouse_id: warehouse.id,
          p_cost_center_id: warehouse.cost_center_id,
          p_product_id: productId
        }
      )
      
      if (qtyError) {
        console.error(`Error checking quantity for warehouse ${warehouse.id}:`, qtyError)
        // نستمر مع القيمة 0 بدلاً من إيقاف العملية
      }
      
      const availableQuantity = Number(availableQty || 0)
      
      // إضافة النتيجة فقط إذا كانت الكمية > 0 (اختياري - يمكن عرض 0 أيضاً)
      // لكن سنعرض جميع النتائج حتى لو كانت 0 ليعرف المستخدم أن المخزن موجود لكن فارغ
      results.push({
        branch_id: branch.id,
        branch_name: branch.name || branch.branch_name || "غير معروف",
        warehouse_id: warehouse.id,
        warehouse_name: warehouse.name || "غير معروف",
        cost_center_id: warehouse.cost_center_id,
        cost_center_name: warehouse.cost_center_id 
          ? (costCentersMap.get(warehouse.cost_center_id) || null)
          : null,
        available_quantity: Math.max(0, availableQuantity)
      })
    }
    
    // 9️⃣ ترتيب النتائج حسب الكمية (من الأكبر للأصغر)
    results.sort((a, b) => b.available_quantity - a.available_quantity)
    
    return NextResponse.json({ 
      data: results,
      product_id: productId,
      company_id: companyId
    })
    
  } catch (error: any) {
    console.error("Error in product availability API:", error)
    return NextResponse.json(
      { 
        error: error?.message || "Internal server error",
        error_ar: "خطأ داخلي في الخادم"
      },
      { status: 500 }
    )
  }
}
