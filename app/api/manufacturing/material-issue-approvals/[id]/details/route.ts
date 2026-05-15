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
  "warehouse_manager", "accountant", "manufacturing_officer"
]

async function loadOpenReservationQtyByRequirement(
  admin: any,
  companyId: string,
  productionOrderId: string
): Promise<Record<string, number>> {
  const closedStatuses = new Set(["consumed", "released", "cancelled", "expired", "closed"])

  const { data: reservations, error: reservationError } = await admin
    .from("inventory_reservations")
    .select("id, status")
    .eq("company_id", companyId)
    .eq("source_type", "production_order")
    .eq("source_id", productionOrderId)

  if (reservationError) throw reservationError

  const reservationIds = (reservations || [])
    .filter((reservation: any) => !closedStatuses.has(String(reservation.status || "")))
    .map((reservation: any) => reservation.id)
    .filter(Boolean)

  if (reservationIds.length === 0) return {}

  const { data: lines, error: lineError } = await admin
    .from("inventory_reservation_lines")
    .select("id, source_line_id")
    .in("reservation_id", reservationIds)

  if (lineError) throw lineError

  const lineToRequirement: Record<string, string> = {}
  for (const line of (lines || [])) {
    if (line.id && line.source_line_id) {
      lineToRequirement[line.id] = line.source_line_id
    }
  }

  const lineIds = Object.keys(lineToRequirement)
  if (lineIds.length === 0) return {}

  const { data: allocations, error: allocationError } = await admin
    .from("inventory_reservation_allocations")
    .select("reservation_line_id, allocated_qty, consumed_qty, released_qty, status")
    .in("reservation_line_id", lineIds)
    .eq("status", "active")

  if (allocationError) throw allocationError

  const qtyByRequirement: Record<string, number> = {}
  for (const allocation of (allocations || [])) {
    const requirementId = lineToRequirement[allocation.reservation_line_id]
    if (!requirementId) continue

    const openQty = Math.max(
      Number(allocation.allocated_qty ?? 0)
        - Number(allocation.consumed_qty ?? 0)
        - Number(allocation.released_qty ?? 0),
      0
    )
    qtyByRequirement[requirementId] = (qtyByRequirement[requirementId] || 0) + openQty
  }

  return qtyByRequirement
}

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
      .select("role, branch_id, warehouse_id")
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
        warehouse:warehouses ( id, name, branch_id ),
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

    const role = String(memberRow.role || "").trim().toLowerCase()

    // manufacturing_officer يرى طلبات الصرف التي قدّمها هو فقط
    if (role === "manufacturing_officer" && (approval as any).requested_by !== user.id) {
      return NextResponse.json({ success: false, error: "طلب الاعتماد غير موجود" }, { status: 404 })
    }

    const companyWideRoles = new Set(["owner", "admin", "general_manager", "manager"])
    if (!companyWideRoles.has(role)) {
      const scopedWarehouseId = memberRow.warehouse_id || null
      const scopedBranchId = memberRow.branch_id || null
      const approvalWarehouseBranchId = (approval as any).warehouse?.branch_id || null

      const isInWarehouseScope = scopedWarehouseId && approval.warehouse_id === scopedWarehouseId
      const isInBranchScope = scopedBranchId && (
        approval.branch_id === scopedBranchId ||
        approvalWarehouseBranchId === scopedBranchId
      )

      if (!isInWarehouseScope && !isInBranchScope) {
        return NextResponse.json(
          { success: false, error: "طلب صرف المواد خارج نطاق فرعك أو مخزنك" },
          { status: 403 }
        )
      }
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

    const stockWarehouseIds = Array.from(new Set([
      approval.warehouse_id,
      productionOrder?.issue_warehouse_id,
      ...materialsToCheck.map((m: any) => m.warehouse_id),
    ].filter(Boolean)))

    const warehouseBranchMap: Record<string, string> = {}
    if (stockWarehouseIds.length > 0) {
      const { data: stockWarehouses } = await admin
        .from("warehouses")
        .select("id, branch_id")
        .eq("company_id", companyId)
        .in("id", stockWarehouseIds)

      for (const warehouse of (stockWarehouses || [])) {
        if (warehouse.id && warehouse.branch_id) {
          warehouseBranchMap[warehouse.id] = warehouse.branch_id
        }
      }
    }

    const openReservationQtyByRequirement = await loadOpenReservationQtyByRequirement(
      admin,
      companyId,
      approval.production_order_id
    )

    let effectiveApprovalBranch = (approval as any).branch
    const approvalWarehouseBranchId = (approval as any).warehouse?.branch_id || null
    if (approvalWarehouseBranchId && approvalWarehouseBranchId !== approval.branch_id) {
      const { data: warehouseBranch } = await admin
        .from("branches")
        .select("id, name")
        .eq("id", approvalWarehouseBranchId)
        .eq("company_id", companyId)
        .maybeSingle()

      effectiveApprovalBranch = warehouseBranch || effectiveApprovalBranch
    }

    // فحص المخزون المتوفر لكل مادة
    const materials = []
    for (const req of materialsToCheck) {
      const warehouseId = req.warehouse_id || approval.warehouse_id || productionOrder?.issue_warehouse_id
      const branchId = (warehouseId && warehouseBranchMap[warehouseId])
        || approvalWarehouseBranchId
        || approval.branch_id
        || req.branch_id
        || productionOrder?.branch_id

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
        const freeQty = Number(snap?.free_quantity ?? 0)
        const onHandQty = Number(snap?.on_hand_quantity ?? 0)
        const ownReservedQty = req.id ? Number(openReservationQtyByRequirement[req.id] || 0) : 0
        availableQty = Math.max(0, Math.min(onHandQty, freeQty + ownReservedQty))
      }

      const requiredQty = Number(req.gross_required_qty)
      const cumulativeApprovedQty = Number(req.approved_quantity ?? 0)
      const issuedQty = Number(req.issued_quantity ?? 0)
      const consumedQty = Math.max(cumulativeApprovedQty, issuedQty)
      const remainingQty = Math.max(0, requiredQty - consumedQty)
      const isRemainingRequest = approval.status === "pending" && consumedQty > 0
      const displayRequiredQty = isRemainingRequest ? remainingQty : requiredQty
      const approvedQty = isRemainingRequest ? 0 : cumulativeApprovedQty
      const shortageQty = Math.max(0, displayRequiredQty - availableQty)

      let lineStatus = "pending"
      if (remainingQty <= 0) lineStatus = "fully_issued"
      else if (consumedQty > 0) lineStatus = "partially_issued"
      else if (availableQty >= displayRequiredQty) lineStatus = "fully_available"
      else if (availableQty > 0) lineStatus = "partially_available"
      else lineStatus = "unavailable"

      // إذا تم الاعتماد سابقاً، استخدم الحالة المخزنة
      if (!isRemainingRequest && req.line_issue_status && req.line_issue_status !== "pending") {
        lineStatus = req.line_issue_status
      }

      materials.push({
        requirement_id: req.id,
        product_id: req.product_id,
        product_name: productMap[req.product_id] || req.product_id,
        required_qty: displayRequiredQty,
        original_required_qty: requiredQty,
        cumulative_approved_qty: cumulativeApprovedQty,
        remaining_qty: remainingQty,
        available_qty: availableQty,
        approved_qty: approvedQty,
        issued_qty: issuedQty,
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
          branch_id: effectiveApprovalBranch?.id || approval.branch_id,
          branch: effectiveApprovalBranch,
          requested_by_name: requestedByName,
          approved_by_name: approvedByName,
          production_order_id: (approval as any).production_order_id,
        },
        production_order: productionOrder,
        materials,
        user_can_approve: canApprove && ["pending", "management_approved", "partially_approved"].includes(approval.status),
        user_can_reject: canApprove && ["pending", "management_approved", "partially_approved"].includes(approval.status),
        user_can_management_approve: ["admin", "owner", "general_manager", "manager"].includes(memberRow.role) && approval.status === "pending",
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
