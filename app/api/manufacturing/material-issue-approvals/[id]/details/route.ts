/**
 * GET /api/manufacturing/material-issue-approvals/[id]/details
 * تفاصيل طلب صرف المواد مع فحص الكميات المتوفرة في المخزن
 *
 * يُستخدم لعرض صفحة تفاصيل الطلب لمسؤول المخزن ومحاسب الفرع
 */
import { NextRequest, NextResponse } from "next/server"
import { createClient, createServiceClient } from "@/lib/supabase/server"
import { getActiveCompanyId } from "@/lib/company"

const ALLOWED_ROLES = [
  "store_manager", "manager", "owner", "admin", "general_manager",
  "warehouse_manager", "accountant"
]

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const companyIdParam = searchParams.get("company_id")
    const companyId = companyIdParam || await getActiveCompanyId(supabase)
    if (!companyId) {
      return NextResponse.json({ success: false, error: "No active company" }, { status: 404 })
    }

    // التحقق من الدور
    const { data: memberRow } = await supabase
      .from("company_members")
      .select("role, branch_id")
      .eq("company_id", companyId)
      .eq("user_id", user.id)
      .single()

    if (!memberRow || !ALLOWED_ROLES.includes(memberRow.role)) {
      return NextResponse.json(
        { success: false, error: "غير مصرح بالوصول" },
        { status: 403 }
      )
    }

    const admin = createServiceClient()

    // جلب طلب الاعتماد
    const { data: approval, error: fetchError } = await admin
      .from("manufacturing_material_issue_approvals")
      .select(`
        id, status, requested_at, approved_at, rejected_at,
        rejection_reason, notes, warehouse_id, branch_id,
        requested_by, approved_by, rejected_by,
        production_order_id,
        issue_type, warehouse_approval_notes,
        warehouse:warehouses ( id, name ),
        branch:branches ( id, name )
      `)
      .eq("id", id)
      .eq("company_id", companyId)
      .single()

    if (fetchError || !approval) {
      return NextResponse.json(
        { success: false, error: "طلب الاعتماد غير موجود" },
        { status: 404 }
      )
    }

    // جلب أمر الإنتاج
    const { data: productionOrder } = await admin
      .from("manufacturing_production_orders")
      .select(`
        id, order_no, status, branch_id, issue_warehouse_id,
        planned_quantity, order_uom, bom_version_id,
        product:products ( id, name, sku )
      `)
      .eq("id", approval.production_order_id)
      .single()

    // جلب اسم مقدم الطلب
    let requestedByName = ""
    if (approval.requested_by) {
      const { data: reqUser } = await admin.auth.admin.getUserById(approval.requested_by)
      requestedByName = reqUser?.user?.user_metadata?.full_name || reqUser?.user?.email || ""
    }

    // جلب اسم المعتمد
    let approvedByName = ""
    if (approval.approved_by) {
      const { data: appUser } = await admin.auth.admin.getUserById(approval.approved_by)
      approvedByName = appUser?.user?.user_metadata?.full_name || appUser?.user?.email || ""
    }

    // جلب متطلبات المواد
    const { data: requirements } = await admin
      .from("production_order_material_requirements")
      .select(`
        id, product_id, warehouse_id, branch_id,
        gross_required_qty, net_required_qty, issue_uom, is_optional,
        quantity_per, scrap_percent,
        approved_quantity, issued_quantity, shortage_quantity,
        line_issue_status, approved_by, approved_at, warehouse_approval_notes
      `)
      .eq("production_order_id", approval.production_order_id)
      .eq("company_id", companyId)
      .order("line_no", { ascending: true })

    // إذا كانت requirements فارغة → fallback إلى BOM lines
    let materialsToCheck: any[] = []
    if ((requirements || []).length > 0) {
      materialsToCheck = requirements || []
    } else if (productionOrder?.bom_version_id) {
      const { data: bomLines } = await admin
        .from("manufacturing_bom_lines")
        .select("id, component_product_id, quantity_per, scrap_percent, issue_uom, is_optional, line_type")
        .eq("bom_version_id", productionOrder.bom_version_id)
        .eq("company_id", companyId)
        .neq("line_type", "byproduct")

      const plannedQty = Number(productionOrder.planned_quantity ?? 1)
      materialsToCheck = (bomLines || []).map((line: any) => {
        const qtyPer = Number(line.quantity_per ?? 0)
        const scrapPct = Number(line.scrap_percent ?? 0)
        const grossQty = qtyPer * plannedQty * (1 + scrapPct / 100)
        return {
          id: line.id,
          product_id: line.component_product_id,
          warehouse_id: productionOrder.issue_warehouse_id,
          branch_id: productionOrder.branch_id,
          gross_required_qty: grossQty,
          net_required_qty: qtyPer * plannedQty,
          issue_uom: line.issue_uom,
          is_optional: line.is_optional ?? false,
          quantity_per: qtyPer,
          scrap_percent: scrapPct,
          approved_quantity: 0,
          issued_quantity: 0,
          shortage_quantity: 0,
          line_issue_status: "pending",
          approved_by: null,
          approved_at: null,
          warehouse_approval_notes: null,
        }
      })
    }

    // جلب أسماء المنتجات + فحص المخزون
    const productIds = materialsToCheck.map((m: any) => m.product_id).filter(Boolean)
    let productMap: Record<string, string> = {}
    if (productIds.length > 0) {
      const { data: products } = await admin
        .from("products")
        .select("id, name")
        .in("id", productIds)
        .eq("company_id", companyId)
      for (const p of (products || [])) {
        productMap[p.id] = p.name
      }
    }

    // فحص المخزون المتوفر لكل مادة
    const materials = []
    for (const req of materialsToCheck) {
      const warehouseId = req.warehouse_id || productionOrder?.issue_warehouse_id
      const branchId = req.branch_id || productionOrder?.branch_id

      let availableQty = 0
      if (warehouseId && branchId && req.product_id) {
        const { data: snapRows } = await admin
          .rpc("get_inventory_reservation_snapshot", {
            p_company_id: companyId,
            p_branch_id: branchId,
            p_warehouse_id: warehouseId,
            p_product_id: req.product_id,
          })
        const snap = Array.isArray(snapRows) ? snapRows[0] : snapRows
        availableQty = Number(snap?.free_quantity ?? 0)
      }

      const requiredQty = Number(req.gross_required_qty)
      const approvedQty = Number(req.approved_quantity ?? 0)
      const shortageQty = Math.max(0, requiredQty - availableQty)

      let lineStatus = "pending"
      if (availableQty >= requiredQty) lineStatus = "fully_available"
      else if (availableQty > 0) lineStatus = "partially_available"
      else lineStatus = "unavailable"

      // إذا تم الاعتماد سابقاً، استخدم الحالة المخزنة
      if (req.line_issue_status && req.line_issue_status !== "pending") {
        lineStatus = req.line_issue_status
      }

      materials.push({
        requirement_id: req.id,
        product_id: req.product_id,
        product_name: productMap[req.product_id] || req.product_id,
        required_qty: requiredQty,
        available_qty: availableQty,
        approved_qty: approvedQty,
        issued_qty: Number(req.issued_quantity ?? 0),
        shortage_qty: shortageQty,
        uom: req.issue_uom,
        is_optional: req.is_optional,
        line_status: lineStatus,
        warehouse_approval_notes: req.warehouse_approval_notes,
      })
    }

    // تحديد صلاحيات المستخدم
    const canApprove = ["store_manager", "warehouse_manager", "manager", "owner", "admin", "general_manager"]
      .includes(memberRow.role)
    const isAccountant = memberRow.role === "accountant"
    const hasShortages = materials.some((m: any) => m.shortage_qty > 0)
    const upperRoles = ["owner", "admin", "general_manager", "manager"]
    const canCreatePO = (upperRoles.includes(memberRow.role) || isAccountant) && hasShortages
      && ["rejected", "partially_approved", "pending", "approved"].includes(approval.status)

    return NextResponse.json({
      success: true,
      data: {
        approval: {
          ...approval,
          requested_by_name: requestedByName,
          approved_by_name: approvedByName,
          production_order_id: (approval as any).production_order_id,
        },
        production_order: productionOrder,
        materials,
        user_can_approve: canApprove && (approval.status === "pending" || approval.status === "partially_approved"),
        user_can_reject: canApprove && (approval.status === "pending" || approval.status === "partially_approved"),
        user_is_accountant: isAccountant,
        user_can_create_po: canCreatePO,
        user_role: memberRow.role,
      },
    })
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || "Internal server error" },
      { status: 500 }
    )
  }
}
