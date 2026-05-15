/**
 * GET /api/manufacturing/material-issue-approvals
 * قائمة طلبات اعتماد صرف المواد — لمسؤولي المخزن والإدارة
 * يدعم فلترة بالحالة والمستودع والفرع
 *
 * الأدوار المسموح لها: store_manager, owner, admin, general_manager, manager
 * لا يستخدم getManufacturingApiContext لأن store_manager لا يملك صلاحية manufacturing_boms
 */
import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createServiceClient } from "@/lib/supabase/server"
import { getActiveCompanyId } from "@/lib/company"

const ALLOWED_ROLES = ["store_manager", "owner", "admin", "general_manager", "manager", "warehouse_manager", "accountant"]

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)

    // نحاول أولاً من query param (أكثر موثوقية)، ثم من الكوكيز كـ fallback
    const companyIdParam = searchParams.get("company_id")
    const companyId = companyIdParam || await getActiveCompanyId(supabase)
    if (!companyId) {
      return NextResponse.json({ success: false, error: "No active company" }, { status: 404 })
    }

    // التحقق من الدور — يُسمح لمسؤولي المخزن والإدارة + manufacturing_officer (يرى طلباته فقط)
    const MANUFACTURING_OFFICER_ROLE = "manufacturing_officer"
    const { data: member } = await supabase
      .from("company_members")
      .select("role, branch_id, warehouse_id")
      .eq("company_id", companyId)
      .eq("user_id", user.id)
      .single()

    const isManufacturingOfficer = member?.role === MANUFACTURING_OFFICER_ROLE
    if (!member || (!ALLOWED_ROLES.includes(member.role) && !isManufacturingOfficer)) {
      return NextResponse.json(
        { success: false, error: "غير مصرح — مخصص لمسؤولي المخزن والإدارة فقط" },
        { status: 403 }
      )
    }

    // manufacturing_officer: يرى طلبات الصرف التي قدّمها هو فقط (supabase كافٍ — RLS يحمي)
    if (isManufacturingOfficer) {
      let query = supabase
        .from("manufacturing_material_issue_approvals")
        .select(`
          id, status, requested_at, approved_at, rejected_at,
          rejection_reason, notes, warehouse_id, branch_id, requested_by,
          production_order:manufacturing_production_orders (
            id, order_no, status, planned_quantity, order_uom,
            product:products ( id, name, sku )
          ),
          warehouse:warehouses ( id, name ),
          branch:branches ( id, name )
        `)
        .eq("company_id", companyId)
        .eq("requested_by", user.id)
        .order("requested_at", { ascending: false })

      const { data, error } = await query
      if (error) throw error
      return NextResponse.json({ success: true, data: data || [], meta: { total: (data || []).length } })
    }

    const admin = createServiceClient()

    const status = searchParams.get("status") || "pending"
    const warehouseId = searchParams.get("warehouse_id")
    const branchId = searchParams.get("branch_id")
    const role = String(member.role || "").trim().toLowerCase()
    const companyWideRoles = new Set(["owner", "admin", "general_manager", "manager"])
    const isCompanyWideRole = companyWideRoles.has(role)

    let query = admin
      .from("manufacturing_material_issue_approvals")
      .select(`
        id,
        status,
        requested_at,
        approved_at,
        rejected_at,
        rejection_reason,
        notes,
        warehouse_id,
        branch_id,
        requested_by,
        approved_by,
        rejected_by,
        production_order:manufacturing_production_orders (
          id,
          order_no,
          status,
          planned_quantity,
          order_uom,
          issue_warehouse_id,
          branch_id,
          product:products ( id, name, sku )
        ),
        warehouse:warehouses ( id, name ),
        branch:branches ( id, name )
      `)
      .eq("company_id", companyId)
      .order("requested_at", { ascending: false })

    if (status !== "all") {
      // Support comma-separated statuses like "pending,rejected"
      const statuses = status.split(",").map(s => s.trim()).filter(Boolean)
      if (statuses.length === 1) {
        query = query.eq("status", statuses[0])
      } else if (statuses.length > 1) {
        query = query.in("status", statuses)
      }
    }

    if (isCompanyWideRole) {
      if (warehouseId) {
        query = query.eq("warehouse_id", warehouseId)
      }
      if (branchId) {
        query = query.eq("branch_id", branchId)
      }
    } else {
      const scopedBranchId = member.branch_id || null
      const scopedWarehouseId = member.warehouse_id || null

      if (!scopedBranchId && !scopedWarehouseId) {
        return NextResponse.json(
          { success: false, error: "حسابك غير مرتبط بفرع أو مخزن، يرجى مراجعة إعدادات المستخدم" },
          { status: 403 }
        )
      }

      if (branchId && scopedBranchId && branchId !== scopedBranchId) {
        return NextResponse.json(
          { success: false, error: "لا يمكنك عرض طلبات صرف مواد تصنيع خارج فرعك" },
          { status: 403 }
        )
      }

      if (warehouseId && scopedWarehouseId && warehouseId !== scopedWarehouseId) {
        return NextResponse.json(
          { success: false, error: "لا يمكنك عرض طلبات صرف مواد تصنيع خارج مخزنك" },
          { status: 403 }
        )
      }

      if (scopedWarehouseId) {
        // لمسؤول المخزن، المخزن هو نطاق الاعتماد الحاكم. قد يكون فرع أمر الإنتاج
        // مختلفًا عن فرع المخزن، لذلك لا نقيّد القائمة بفرع السجل مع المخزن معًا.
        query = query.eq("warehouse_id", scopedWarehouseId)
      } else if (scopedBranchId) {
        const { data: branchWarehouses } = await admin
          .from("warehouses")
          .select("id")
          .eq("company_id", companyId)
          .eq("branch_id", scopedBranchId)

        const scopedWarehouseIds = (branchWarehouses || [])
          .map((warehouse: any) => warehouse.id)
          .filter(Boolean)

        if (warehouseId) {
          if (!scopedWarehouseIds.includes(warehouseId)) {
            return NextResponse.json(
              { success: false, error: "لا يمكنك عرض طلبات صرف مواد تصنيع خارج مخازن فرعك" },
              { status: 403 }
            )
          }
          query = query.eq("warehouse_id", warehouseId)
        } else if (scopedWarehouseIds.length > 0) {
          query = query.or(`branch_id.eq.${scopedBranchId},warehouse_id.in.(${scopedWarehouseIds.join(",")})`)
        } else {
          query = query.eq("branch_id", scopedBranchId)
        }
      }
    }

    const { data, error } = await query

    if (error) throw error

    return NextResponse.json({
      success: true,
      data: data || [],
      meta: { total: (data || []).length },
    })
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || "Internal server error" },
      { status: 500 }
    )
  }
}
