/**
 * POST /api/manufacturing/material-issue-approvals/[id]/approve
 * اعتماد طلب صرف المواد مع فحص رصيد المخزون
 *
 * - إذا كانت المواد متوفرة → اعتماد وبدء أمر الإنتاج
 * - إذا كانت المواد غير كافية → إشعار للأدوار العليا + محاسب الفرع + رفض
 */
import { NextRequest, NextResponse } from "next/server"
import { asyncAuditLog } from "@/lib/core"
import { createClient, createServiceClient } from "@/lib/supabase/server"
import { getActiveCompanyId } from "@/lib/company"

const ALLOWED_APPROVER_ROLES = ["store_manager", "manager", "owner", "admin", "general_manager", "warehouse_manager"]

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

/** إرسال إشعار عبر RPC مباشرةً (آمن من السيرفر) */
async function sendNotification(admin: any, params: {
  companyId: string; branchId: string | null; role: string | null;
  userId?: string | null; title: string; message: string;
  referenceId: string; referenceType: string; createdBy: string; eventKey: string;
}) {
  try {
    console.log(`[MMIA_NOTIFICATION] Sending notification: role=${params.role}, branchId=${params.branchId}, eventKey=${params.eventKey}`)
    const { data, error } = await admin.rpc("create_notification", {
      p_company_id: params.companyId,
      p_branch_id: params.branchId,
      p_assigned_to_role: params.role,
      p_assigned_to_user: params.userId ?? null,
      p_title: params.title,
      p_message: params.message,
      p_reference_id: params.referenceId,
      p_reference_type: params.referenceType,
      p_created_by: params.createdBy,
      p_priority: "high",
      p_severity: "warning",
      p_category: "approvals",
      p_event_key: params.eventKey,
    })
    if (error) {
      console.error(`[MMIA_NOTIFICATION] ❌ RPC error for role=${params.role}, branch=${params.branchId}:`, error.message, error.details)
    } else {
      console.log(`[MMIA_NOTIFICATION] ✅ Notification created: role=${params.role}, branch=${params.branchId}, id=${data}`)
    }
  } catch (err: any) {
    console.error(`[MMIA_NOTIFICATION] ❌ Exception for role=${params.role}:`, err?.message)
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // ── مصادقة المستخدم
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

    // ── التحقق من الدور
    const { data: memberRow } = await supabase
      .from("company_members")
      .select("role, branch_id, warehouse_id")
      .eq("company_id", companyId)
      .eq("user_id", user.id)
      .single()

    if (!memberRow || !ALLOWED_APPROVER_ROLES.includes(memberRow.role)) {
      return NextResponse.json(
        { success: false, error: "غير مصرح لك بالاعتماد. مخصص لمسؤولي المخزن والإدارة فقط" },
        { status: 403 }
      )
    }

    const admin = createServiceClient()

    // ── قراءة البيانات من الطلب
    let notes: string | null = null
    let approvedItems: { requirement_id: string; approved_quantity: number }[] | null = null
    let requestedIssueType: string | null = null
    let warehouseApprovalNotes: string | null = null
    try {
      const body = await request.json()
      notes = body?.notes ?? null
      approvedItems = body?.approved_items ?? null
      requestedIssueType = body?.issue_type ?? null
      warehouseApprovalNotes = body?.warehouse_approval_notes ?? null
    } catch { /* body فارغ */ }

    // ── جلب طلب الاعتماد (بدون JOIN لتجنب أخطاء FK schema)
    const { data: approval, error: fetchError } = await admin
      .from("manufacturing_material_issue_approvals")
      .select("*")
      .eq("id", id)
      .eq("company_id", companyId)
      .single()

    if (fetchError || !approval) {
      return NextResponse.json(
        { success: false, error: "طلب الاعتماد غير موجود", debug: fetchError?.message },
        { status: 404 }
      )
    }

    const role = String(memberRow.role || "").trim().toLowerCase()
    const companyWideRoles = new Set(["owner", "admin", "general_manager", "manager"])
    if (!companyWideRoles.has(role)) {
      const scopedWarehouseId = memberRow.warehouse_id || null
      const scopedBranchId = memberRow.branch_id || null
      let approvalWarehouseBranchId: string | null = null

      if (approval.warehouse_id) {
        const { data: approvalWarehouse } = await admin
          .from("warehouses")
          .select("branch_id")
          .eq("id", approval.warehouse_id)
          .eq("company_id", companyId)
          .maybeSingle()
        approvalWarehouseBranchId = approvalWarehouse?.branch_id ?? null
      }

      const isInWarehouseScope = scopedWarehouseId && approval.warehouse_id === scopedWarehouseId
      const isInBranchScope = scopedBranchId && (
        approval.branch_id === scopedBranchId ||
        approvalWarehouseBranchId === scopedBranchId
      )

      if (!isInWarehouseScope && !isInBranchScope) {
        return NextResponse.json(
          { success: false, error: "لا يمكنك اعتماد طلب صرف مواد خارج نطاق فرعك أو مخزنك" },
          { status: 403 }
        )
      }
    }

    const APPROVABLE_STATUSES = ["pending", "management_approved", "partially_approved"]
    if (!APPROVABLE_STATUSES.includes(approval.status)) {
      return NextResponse.json(
        { success: false, error: `لا يمكن الاعتماد — حالة الطلب الحالية: ${approval.status}` },
        { status: 422 }
      )
    }

    // ── جلب أمر الإنتاج بشكل منفصل (مع planned_quantity و bom_version_id)
    const { data: productionOrder, error: poError } = await admin
      .from("manufacturing_production_orders")
      .select("id, order_no, status, branch_id, issue_warehouse_id, planned_quantity, bom_version_id")
      .eq("id", approval.production_order_id)
      .single()

    if (poError || !productionOrder) {
      return NextResponse.json(
        { success: false, error: "أمر الإنتاج غير موجود", debug: poError?.message },
        { status: 404 }
      )
    }

    const { error: syncError } = await admin.rpc("sync_manufacturing_production_order_materials_atomic", {
      p_company_id: companyId,
      p_production_order_id: approval.production_order_id,
      p_user_id: user.id,
    })
    if (syncError) throw syncError

    // ── جلب متطلبات المواد (production_order_material_requirements أولاً) ──────
    const { data: requirements, error: reqError } = await admin
      .from("production_order_material_requirements")
      .select("id, product_id, warehouse_id, branch_id, gross_required_qty, issue_uom, is_optional, approved_quantity, issued_quantity")
      .eq("production_order_id", approval.production_order_id)
      .eq("company_id", companyId)

    if (reqError) throw reqError

    interface MaterialToCheck {
      id: string | null
      product_id: string
      warehouse_id: string | null
      branch_id: string | null
      gross_required_qty: number
      approved_quantity: number
      issued_quantity: number
      issue_uom: string
      is_optional: boolean
    }

    // ── إذا كانت requirements فارغة → fallback إلى BOM lines ──────────────
    let materialsToCheck: MaterialToCheck[] = []
    if ((requirements || []).length > 0) {
      materialsToCheck = (requirements || []).map((r: any) => ({
        id:                 r.id,
        product_id:         r.product_id,
        warehouse_id:       r.warehouse_id,
        branch_id:          r.branch_id,
        gross_required_qty: Number(r.gross_required_qty),
        approved_quantity:  Number(r.approved_quantity ?? 0),
        issued_quantity:    Number(r.issued_quantity ?? 0),
        issue_uom:          r.issue_uom,
        is_optional:        r.is_optional,
      }))
    } else if (productionOrder?.bom_version_id) {
      // Fallback: احسب الكميات المطلوبة مباشرة من BOM lines
      const { data: bomLines } = await admin
        .from("manufacturing_bom_lines")
        .select("component_product_id, quantity_per, scrap_percent, issue_uom, is_optional, line_type")
        .eq("bom_version_id", productionOrder.bom_version_id)
        .eq("company_id", companyId)
        .neq("line_type", "byproduct")  // تجاهل المنتجات الثانوية

      const plannedQty = Number(productionOrder.planned_quantity ?? 1)
      for (const line of (bomLines || [])) {
        const qtyPer   = Number(line.quantity_per ?? 0)
        const scrapPct = Number(line.scrap_percent ?? 0)
        const grossQty = qtyPer * plannedQty * (1 + scrapPct / 100)
        materialsToCheck.push({
          id:                 null,
          product_id:         line.component_product_id,
          warehouse_id:       productionOrder.issue_warehouse_id,
          branch_id:          productionOrder.branch_id,
          gross_required_qty: grossQty,
          approved_quantity:  0,
          issued_quantity:    0,
          issue_uom:          line.issue_uom,
          is_optional:        line.is_optional ?? false,
        })
      }
    }

    interface ShortageItem {
      product_id: string
      product_name: string
      required_qty: number
      available_qty: number
      uom: string
    }
    const shortages: ShortageItem[] = []
    let checkedCount = 0
    const debugLog: string[] = [
      `requirements_count=${(requirements || []).length}`,
      `materialsToCheck_count=${materialsToCheck.length}`,
      `bom_version_id=${productionOrder?.bom_version_id ?? "null"}`,
      `planned_quantity=${productionOrder?.planned_quantity ?? "null"}`,
    ]

    const stockWarehouseIds = Array.from(new Set([
      approval.warehouse_id,
      productionOrder?.issue_warehouse_id,
      ...materialsToCheck.map((m) => m.warehouse_id),
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

    const availableQtyByMaterialId: Record<string, number> = {}
    const openReservationQtyByRequirement = await loadOpenReservationQtyByRequirement(
      admin,
      companyId,
      approval.production_order_id
    )

    for (const req of materialsToCheck) {
      if (req.is_optional) continue  // تخطى المواد الاختيارية

      const warehouseId = req.warehouse_id || approval.warehouse_id || productionOrder?.issue_warehouse_id
      const branchId = (warehouseId && warehouseBranchMap[warehouseId])
        || approval.branch_id
        || req.branch_id
        || productionOrder?.branch_id

      if (!warehouseId || !branchId || !req.product_id) {
        debugLog.push(`skipped product=${req.product_id} wh=${warehouseId} br=${branchId}`)
        continue
      }

      // جلب الرصيد الحر (بعد خصم الحجوزات) من دالة Supabase
      const { data: snapRows, error: snapError } = await admin
        .rpc("get_inventory_reservation_snapshot", {
          p_company_id:   companyId,
          p_branch_id:    branchId,
          p_warehouse_id: warehouseId,
          p_product_id:   req.product_id,
        })

      if (snapError) {
        // لا نسمح بالمرور إذا فشل فحص المخزون
        return NextResponse.json(
          { success: false, error: "تعذّر فحص رصيد المخزون", debug: snapError.message },
          { status: 500 }
        )
      }

      const snap = Array.isArray(snapRows) ? snapRows[0] : snapRows
      const freeQty: number = Number(snap?.free_quantity ?? 0)
      const onHandQty: number = Number(snap?.on_hand_quantity ?? 0)
      const ownReservedQty = req.id ? Number(openReservationQtyByRequirement[req.id] || 0) : 0
      const issueAvailableQty = Math.max(0, Math.min(onHandQty, freeQty + ownReservedQty))
      if (req.id) availableQtyByMaterialId[req.id] = issueAvailableQty
      availableQtyByMaterialId[req.product_id] = issueAvailableQty
      const remainingQty = Math.max(0, req.gross_required_qty - Math.max(req.approved_quantity, req.issued_quantity))
      checkedCount++
      debugLog.push(`checked product=${req.product_id} branch=${branchId} warehouse=${warehouseId} remaining=${remainingQty} required=${req.gross_required_qty} free=${freeQty} own_reserved=${ownReservedQty} issue_available=${issueAvailableQty}`)

      if (issueAvailableQty < remainingQty) {
        shortages.push({
          product_id:    req.product_id,
          product_name:  "",   // سيتم ملؤه بعد اكتمال الحلقة
          required_qty:  remainingQty,
          available_qty: issueAvailableQty,
          uom:           req.issue_uom,
        })
      }
    }

    // ── safeguard: لا تسمح بالاعتماد إذا لم يتم فحص أي مادة فعلياً ──────────
    if (materialsToCheck.length > 0 && checkedCount === 0) {
      return NextResponse.json(
        { success: false, error: "تعذّر فحص أي مادة من مواد الإنتاج", debug: debugLog.join(" | ") },
        { status: 500 }
      )
    }
    // ── safeguard: لا تسمح بالاعتماد إذا لم يكن هناك أي مواد للفحص أصلاً ────
    // (production order يجب أن يحتوى على BOM lines أو requirements)
    if (materialsToCheck.length === 0) {
      return NextResponse.json(
        { success: false, error: "أمر الإنتاج لا يحتوى على متطلبات مواد ولا BOM lines — لا يمكن الاعتماد", debug: debugLog.join(" | ") },
        { status: 422 }
      )
    }

    // ── جلب أسماء المنتجات للمواد الناقصة ────────────────────────────────
    if (shortages.length > 0) {
      const productIds = shortages.map((s) => s.product_id)
      const { data: products } = await admin
        .from("products")
        .select("id, name")
        .in("id", productIds)
        .eq("company_id", companyId)

      const productMap: Record<string, string> = {}
      for (const p of (products || [])) {
        productMap[p.id] = p.name
      }
      for (const s of shortages) {
        s.product_name = productMap[s.product_id] || s.product_id
      }
    }

    // ── تحديد نوع الصرف (كامل أو جزئي) ───────────────────────────────────
    // إذا تم إرسال approved_items من صفحة التفاصيل الجديدة
    const isDetailedApproval = approvedItems && approvedItems.length > 0
    let finalIssueType: "full" | "partial" = "full"

    if (isDetailedApproval) {
      // حساب نوع الصرف من الكميات المعتمدة
      let allFull = true
      let anyApproved = false
      for (const item of approvedItems!) {
        const mat = materialsToCheck.find((m: any) => m.id === item.requirement_id || m.product_id === item.requirement_id)
        if (!mat) continue
        const requestedQty = Number(item.approved_quantity ?? 0)
        const remainingQty = Math.max(0, mat.gross_required_qty - Math.max(mat.approved_quantity, mat.issued_quantity))
        const availableQty = availableQtyByMaterialId[String(mat.id || mat.product_id)] ?? 0
        if (requestedQty < 0 || requestedQty > remainingQty) {
          return NextResponse.json(
            { success: false, error: "لا يمكن اعتماد كمية أكبر من الكمية المتبقية للمادة الخام" },
            { status: 422 }
          )
        }
        if (requestedQty > availableQty) {
          return NextResponse.json(
            { success: false, error: "لا يمكن اعتماد كمية أكبر من الرصيد المتاح في المخزن" },
            { status: 422 }
          )
        }
        if (requestedQty > 0) anyApproved = true
        if (requestedQty < remainingQty) allFull = false
      }
      if (!anyApproved) {
        return NextResponse.json(
          { success: false, error: "يجب اعتماد كمية واحدة على الأقل من المواد المتبقية" },
          { status: 422 }
        )
      }
      finalIssueType = allFull ? "full" : "partial"
      if (requestedIssueType === "partial") finalIssueType = "partial"
    } else if (shortages.length > 0) {
      // السلوك القديم: إذا كان هناك نقص → إرسال إشعارات ورفض
      const orderNo  = productionOrder?.order_no || approval.production_order_id
      const shortageMsg = `أمر الإنتاج ${orderNo} — نقص في ${shortages.length} مادة خام. المخزون غير كافٍ لتنفيذ الصرف.`

      let warehouseBranchId: string | null = null
      if (productionOrder?.issue_warehouse_id) {
        const { data: wh } = await admin
          .from("warehouses")
          .select("branch_id")
          .eq("id", productionOrder.issue_warehouse_id)
          .single()
        warehouseBranchId = wh?.branch_id ?? null
      }
      const accountantBranchId = warehouseBranchId || productionOrder?.branch_id || null

      for (const role of ["general_manager"]) {
        await sendNotification(admin, {
          companyId, branchId: accountantBranchId, role,
          title: "⚠️ نقص مخزون — طلب صرف مواد تصنيع",
          message: shortageMsg,
          referenceId: id,
          referenceType: "manufacturing_material_issue_approval",
          createdBy: user.id,
          eventKey: `mmia_shortage_${id}_${role}`,
        })
      }

      if (accountantBranchId) {
        await sendNotification(admin, {
          companyId, branchId: accountantBranchId, role: "accountant",
          title: "⚠️ نقص مخزون — صرف مواد تصنيع",
          message: shortageMsg,
          referenceId: id,
          referenceType: "manufacturing_material_issue_approval",
          createdBy: user.id,
          eventKey: `mmia_shortage_${id}_accountant`,
        })
      }

      return NextResponse.json({
        success: false,
        error: "لا توجد كميات كافية في المخزن لصرف المواد المطلوبة",
        shortages,
      }, { status: 422 })
    }

    // ── تحديث الكميات المعتمدة لكل سطر في POMR ────────────────────────────
    const issueLines: { material_requirement_id: string; issued_qty: number; notes?: string | null }[] = []

    if (isDetailedApproval && (requirements || []).length > 0) {
      for (const item of approvedItems!) {
        const mat = (requirements || []).find((r: any) => r.id === item.requirement_id)
        if (!mat) continue
        const issueQty = Number(item.approved_quantity ?? 0)
        if (issueQty > 0) {
          issueLines.push({
            material_requirement_id: item.requirement_id,
            issued_qty: issueQty,
            notes: warehouseApprovalNotes || notes || null,
          })
        }
        const requiredQty = Number((mat as any).gross_required_qty)
        const previousApprovedQty = Number((mat as any).approved_quantity ?? 0)
        const previousIssuedQty = Number((mat as any).issued_quantity ?? 0)
        const newApprovedQty = Math.max(previousApprovedQty, previousIssuedQty) + Number(item.approved_quantity ?? 0)
        const shortage = Math.max(0, requiredQty - newApprovedQty)
        const lineStatus = newApprovedQty >= requiredQty
          ? "fully_issued" : newApprovedQty > 0 ? "partially_issued" : "pending"

        await admin
          .from("production_order_material_requirements")
          .update({
            approved_quantity: newApprovedQty,
            shortage_quantity: shortage,
            line_issue_status: lineStatus,
            approved_by: user.id,
            approved_at: new Date().toISOString(),
          })
          .eq("id", item.requirement_id)
      }
    } else if (!isDetailedApproval && finalIssueType === "full" && (requirements || []).length > 0) {
      for (const mat of (requirements || [])) {
        if ((mat as any).is_optional) continue
        const requiredQty = Number((mat as any).gross_required_qty ?? 0)
        const issuedQty = Number((mat as any).issued_quantity ?? 0)
        const issueQty = Math.max(0, requiredQty - issuedQty)
        const approvedQty = Math.max(requiredQty, issuedQty)
        if (issueQty > 0) {
          issueLines.push({
            material_requirement_id: (mat as any).id,
            issued_qty: issueQty,
            notes: warehouseApprovalNotes || notes || null,
          })
        }

        await admin
          .from("production_order_material_requirements")
          .update({
            approved_quantity: approvedQty,
            shortage_quantity: 0,
            line_issue_status: "fully_issued",
            approved_by: user.id,
            approved_at: new Date().toISOString(),
          })
          .eq("id", (mat as any).id)
      }
    }

    if (issueLines.length === 0) {
      return NextResponse.json(
        { success: false, error: "لا توجد كميات متبقية صالحة للصرف من المخزن" },
        { status: 422 }
      )
    }

    const issueCommandKey = `mmia-${id}-${Date.now()}`
    const { data: issueResult, error: issueError } = await admin.rpc("issue_manufacturing_production_order_materials_atomic", {
      p_company_id: companyId,
      p_production_order_id: approval.production_order_id,
      p_posted_by: user.id,
      p_lines: issueLines,
      p_posted_at: null,
      p_notes: warehouseApprovalNotes || notes || `صرف مواد معتمد من طلب ${id}`,
      p_command_key: issueCommandKey,
    })
    if (issueError) throw issueError

    // ─────────────────────────────────────────────────────────────────────────
    // 🆕 v3.8.0 — IAS 2: Post manufacturing material issue journal (Dr WIP / Cr Raw Materials)
    // Non-fatal: failure logged but does NOT block the material issue.
    // Created journal has status='draft' and requires approval before affecting trial balance.
    // ─────────────────────────────────────────────────────────────────────────
    try {
      // Resolve the issue_event_id created by the RPC
      let issueEventId: string | null = null
      if (issueResult && typeof issueResult === "object") {
        issueEventId =
          (issueResult as any).issue_event_id ||
          (issueResult as any).event_id ||
          ((Array.isArray((issueResult as any).events) && (issueResult as any).events[0]?.id) ?? null)
      }
      if (!issueEventId) {
        // Fallback: look up by command_key in event_number
        const { data: latestEvent } = await admin
          .from("production_order_issue_events")
          .select("id")
          .eq("company_id", companyId)
          .eq("production_order_id", approval.production_order_id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle()
        issueEventId = latestEvent?.id ?? null
      }
      if (issueEventId) {
        const { postMaterialIssueJournal } = await import("@/lib/manufacturing/manufacturing-accounting")
        const journalResult = await postMaterialIssueJournal(admin, {
          companyId,
          issueEventId,
          userId: user.id,
        })
        if (!journalResult.success) {
          console.warn(
            `[MMIA_ACCOUNTING] Material issue journal failed for event ${issueEventId}:`,
            journalResult.error,
          )
        } else if (journalResult.totalCost && journalResult.totalCost > 0) {
          console.log(
            `[MMIA_ACCOUNTING] ✅ Journal ${journalResult.entryNumber} posted (draft) - ${journalResult.totalCost} EGP`,
          )
        }
      } else {
        console.warn("[MMIA_ACCOUNTING] Could not resolve issue_event_id; skipping journal posting")
      }
    } catch (journalErr: any) {
      // Never block the material issue on accounting failure
      console.error("[MMIA_ACCOUNTING] Exception while posting journal:", journalErr?.message)
    }

    // ── تنفيذ الاعتماد ────────────────────────────────────────────────────
    const approvalStatus = finalIssueType === "full" ? "approved" : "partially_approved"

    // تحديث سجل الاعتماد
    const { error: updateApprovalError } = await admin
      .from("manufacturing_material_issue_approvals")
      .update({
        status:      approvalStatus,
        approved_by: user.id,
        approved_at: new Date().toISOString(),
        notes:       notes ?? approval.notes,
        issue_type:  finalIssueType,
        warehouse_approval_notes: warehouseApprovalNotes,
      })
      .eq("id", id)
    if (updateApprovalError) throw updateApprovalError

    // تحديث حالة الاعتماد في أمر الإنتاج
    await admin
      .from("manufacturing_production_orders")
      .update({ material_issue_approval_status: approvalStatus })
      .eq("id", approval.production_order_id)
      .eq("company_id", companyId)

    // إشعار لمقدم الطلب
    const approvalMsg = finalIssueType === "full"
      ? `تمت الموافقة على طلب صرف مواد أمر الإنتاج ${productionOrder?.order_no || ""} وتم خصم المواد من المخزن`
      : `تمت الموافقة الجزئية على صرف مواد أمر الإنتاج ${productionOrder?.order_no || ""} وتم خصم الكميات المعتمدة من المخزن`

    await sendNotification(admin, {
      companyId, branchId: null, role: null,
      userId: approval.requested_by,
      title:   finalIssueType === "full" ? "✅ تمت الموافقة على صرف المواد" : "⚠️ موافقة جزئية على صرف المواد",
      message: approvalMsg,
      referenceId:   id,
      referenceType: "manufacturing_material_issue_approval",
      createdBy:     user.id,
      eventKey:      `mmia_${approvalStatus}_${id}_${Date.now()}`,
    })

    // إشعار محاسب الفرع بالنقص (عند الصرف الجزئي)
    if (finalIssueType === "partial") {
      let warehouseBranchId: string | null = null
      if (productionOrder?.issue_warehouse_id) {
        const { data: wh } = await admin
          .from("warehouses")
          .select("branch_id")
          .eq("id", productionOrder.issue_warehouse_id)
          .single()
        warehouseBranchId = wh?.branch_id ?? null
      }
      const accountantBranchId = warehouseBranchId || productionOrder?.branch_id || null
      if (accountantBranchId) {
        await sendNotification(admin, {
          companyId, branchId: accountantBranchId, role: "accountant",
          title: "⚠️ صرف جزئي — مواد تصنيع ناقصة",
          message: `تمت الموافقة الجزئية على صرف مواد أمر الإنتاج ${productionOrder?.order_no || ""} — يرجى مراجعة النواقص وإنشاء أمر شراء`,
          referenceId: id,
          referenceType: "manufacturing_material_issue_approval",
          createdBy: user.id,
          eventKey: `mmia_partial_${id}_accountant`,
        })
      }
    }

    asyncAuditLog({
      companyId,
      userId: user.id,
      userEmail: user.email ?? undefined,
      action: "UPDATE",
      table: "manufacturing_material_issue_approvals",
      recordId: id,
      recordIdentifier: String(approval.production_order_id),
      oldData: { status: approval.status },
      newData: { status: approvalStatus, issue_type: finalIssueType, approved_by: user.id, issue_result: issueResult },
      reason: finalIssueType === "full"
        ? "Approved material issue request — inventory issued from warehouse"
        : "Partially approved material issue — approved quantities issued from warehouse",
    })

    return NextResponse.json({
      success: true,
      message: finalIssueType === "full"
        ? "تمت الموافقة على صرف المواد وتم خصمها من المخزن"
        : "تمت الموافقة الجزئية على صرف المواد وتم خصم الكميات المعتمدة من المخزن",
      issue_type: finalIssueType,
      issue_result: issueResult,
    })
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || "Internal server error" },
      { status: 500 }
    )
  }
}
