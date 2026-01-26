/**
 * API Route: Get Product Availability Across All Branches
 * 
 * Returns available inventory quantity for a product across all branches/warehouses
 * Read-only endpoint - no modifications allowed
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { cookies } from "next/headers"
import { enforceGovernance } from "@/lib/governance-middleware"

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
    
    // 3️⃣ جلب جميع الفروع والمخازن في الشركة
    // 📋 استثناء: صفحة توفر المنتجات متاحة لجميع الأعضاء في الشركة
    // الهدف: تمكين الموظفين من إبلاغ العملاء بتوفر المنتج في فروع أخرى
    // لذلك نسمح برؤية جميع الفروع في الشركة بغض النظر عن صلاحيات المستخدم
    const { data: branches, error: branchesError } = await supabase
      .from("branches")
      .select("id, name, branch_name")
      .eq("company_id", companyId)
      .eq("is_active", true)
    
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
    
    // 5️⃣ جلب جميع المخازن في الفروع المسموحة
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
    
    // 6️⃣ جلب مراكز التكلفة
    const costCenterIds = warehouses
      .map((w: any) => w.cost_center_id)
      .filter((id: any): id is string => id !== null)
    
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
    
    // 7️⃣ حساب الكمية المتاحة لكل مخزن
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
    
    // 8️⃣ ترتيب النتائج حسب الكمية (من الأكبر للأصغر)
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
