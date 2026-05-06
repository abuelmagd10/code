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

/** إرسال إشعار عبر RPC مباشرةً (آمن من السيرفر) */
async function sendNotification(admin: any, params: {
  companyId: string; branchId: string | null; role: string | null;
  userId?: string | null; title: string; message: string;
  referenceId: string; referenceType: string; createdBy: string; eventKey: string;
}) {
  try {
    await admin.rpc("create_notification", {
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
  } catch { /* الإشعار غير حرج */ }
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
      .select("role")
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

    // ── قراءة الملاحظات (اختياري)
    let notes: string | null = null
    try {
      const body = await request.json()
      notes = body?.notes ?? null
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

    if (approval.status !== "pending") {
      return NextResponse.json(
        { success: false, error: `لا يمكن الاعتماد — حالة الطلب الحالية: ${approval.status}` },
        { status: 422 }
      )
    }

    // ── جلب أمر الإنتاج بشكل منفصل (مع planned_quantity و bom_version_id)
    const { data: productionOrder, error: poError } = await admin
      .from("manufacturing_production_orders")
      .select("id, order_no, status, branch_id, issue_warehouse_id, requested_by, planned_quantity, bom_version_id")
      .eq("id", approval.production_order_id)
      .single()

    if (poError || !productionOrder) {
      return NextResponse.json(
        { success: false, error: "أمر الإنتاج غير موجود", debug: poError?.message },
        { status: 404 }
      )
    }

    // ── جلب متطلبات المواد (production_order_material_requirements أولاً) ──────
    const { data: requirements, error: reqError } = await admin
      .from("production_order_material_requirements")
      .select("id, product_id, warehouse_id, branch_id, gross_required_qty, issue_uom, is_optional")
      .eq("production_order_id", approval.production_order_id)
      .eq("company_id", companyId)

    if (reqError) throw reqError

    interface MaterialToCheck {
      product_id: string
      warehouse_id: string | null
      branch_id: string | null
      gross_required_qty: number
      issue_uom: string
      is_optional: boolean
    }

    // ── إذا كانت requirements فارغة → fallback إلى BOM lines ──────────────
    let materialsToCheck: MaterialToCheck[] = []
    if ((requirements || []).length > 0) {
      materialsToCheck = (requirements || []).map((r: any) => ({
        product_id:         r.product_id,
        warehouse_id:       r.warehouse_id,
        branch_id:          r.branch_id,
        gross_required_qty: Number(r.gross_required_qty),
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
          product_id:         line.component_product_id,
          warehouse_id:       productionOrder.issue_warehouse_id,
          branch_id:          productionOrder.branch_id,
          gross_required_qty: grossQty,
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

    for (const req of materialsToCheck) {
      if (req.is_optional) continue  // تخطى المواد الاختيارية

      const warehouseId = req.warehouse_id || productionOrder?.issue_warehouse_id
      const branchId    = req.branch_id    || productionOrder?.branch_id

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
      checkedCount++
      debugLog.push(`checked product=${req.product_id} required=${req.gross_required_qty} free=${freeQty}`)

      if (freeQty < req.gross_required_qty) {
        shortages.push({
          product_id:    req.product_id,
          product_name:  "",   // سيتم ملؤه بعد اكتمال الحلقة
          required_qty:  req.gross_required_qty,
          available_qty: freeQty,
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

    // ── حالة النقص في المخزون ─────────────────────────────────────────────
    if (shortages.length > 0) {
      const orderNo  = productionOrder?.order_no || approval.production_order_id
      const branchId = productionOrder?.branch_id || null
      const shortageMsg = `أمر الإنتاج ${orderNo} — نقص في ${shortages.length} مادة خام. المخزون غير كافٍ لتنفيذ الصرف.`

      // إشعارات للأدوار العليا (لا يرتبطان بفرع محدد)
      for (const role of ["owner", "admin", "general_manager"]) {
        await sendNotification(admin, {
          companyId, branchId: null, role,
          title: "⚠️ نقص مخزون — طلب صرف مواد تصنيع",
          message: shortageMsg,
          referenceId: approval.production_order_id,
          referenceType: "manufacturing_material_issue_approval",
          createdBy: user.id,
          eventKey: `mmia_shortage_${id}_${role}`,
        })
      }

      // إشعار لمحاسب الفرع المرتبط بالمستودع
      if (branchId) {
        await sendNotification(admin, {
          companyId, branchId, role: "accountant",
          title: "⚠️ نقص مخزون — صرف مواد تصنيع",
          message: shortageMsg,
          referenceId: approval.production_order_id,
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

    // ── المخزون كافٍ → تنفيذ الاعتماد ────────────────────────────────────

    // 1. تشغيل أمر الإنتاج
    const { error: startError } = await admin.rpc("start_manufacturing_production_order_atomic", {
      p_company_id:          companyId,
      p_production_order_id: approval.production_order_id,
      p_started_by:          user.id,
      p_started_at:          null,
    })
    if (startError) throw startError

    // 2. تحديث سجل الاعتماد
    const { error: updateApprovalError } = await admin
      .from("manufacturing_material_issue_approvals")
      .update({
        status:      "approved",
        approved_by: user.id,
        approved_at: new Date().toISOString(),
        notes:       notes ?? approval.notes,
      })
      .eq("id", id)
    if (updateApprovalError) throw updateApprovalError

    // 3. تحديث حالة الاعتماد في أمر الإنتاج
    await admin
      .from("manufacturing_production_orders")
      .update({ material_issue_approval_status: "approved" })
      .eq("id", approval.production_order_id)
      .eq("company_id", companyId)

    // 4. إشعار لمقدم الطلب بالموافقة
    await sendNotification(admin, {
      companyId, branchId: null, role: null,
      userId: productionOrder?.requested_by ?? approval.requested_by,
      title:   "✅ تمت الموافقة على صرف المواد",
      message: `تمت الموافقة على طلب صرف مواد أمر الإنتاج ${productionOrder?.order_no || ""} — يمكن البدء في صرف المواد الآن`,
      referenceId:   approval.production_order_id,
      referenceType: "manufacturing_material_issue_approval",
      createdBy:     user.id,
      eventKey:      `mmia_approved_${id}`,
    })

    asyncAuditLog({
      companyId,
      userId: user.id,
      userEmail: user.email ?? undefined,
      action: "UPDATE",
      table: "manufacturing_material_issue_approvals",
      recordId: id,
      recordIdentifier: String(approval.production_order_id),
      oldData: { status: "pending" },
      newData: { status: "approved", approved_by: user.id },
      reason: "Approved material issue request — inventory checked OK — production order started",
    })

    return NextResponse.json({
      success: true,
      message: "تمت الموافقة على صرف المواد وتم بدء تنفيذ أمر الإنتاج",
    })
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || "Internal server error" },
      { status: 500 }
    )
  }
}
