import { NextRequest, NextResponse } from "next/server"
import { apiGuard } from "@/lib/core/security/api-guard"
import { buildFinancialRequestHash, resolveFinancialIdempotencyKey } from "@/lib/financial-operation-utils"
import { createClient, createServiceClient } from "@/lib/supabase/server"
import { PurchaseReturnCommandService, isPrivilegedRole, type CreatePurchaseReturnCommand } from "@/lib/services/purchase-return-command.service"
import { PurchaseReturnNotificationService } from "@/lib/services/purchase-return-notification.service"

function asString(value: unknown) {
  return String(value || "").trim()
}

export async function POST(request: NextRequest) {
  const { context, errorResponse } = await apiGuard(request)
  if (errorResponse || !context) {
    return errorResponse
  }

  try {
    const body = await request.json()
    const mode = asString(body?.mode || "create").toLowerCase() === "resubmit" ? "resubmit" : "create"
    const strategy = Array.isArray(body?.warehouseGroups || body?.warehouse_groups) && (body?.warehouseGroups || body?.warehouse_groups).length > 1
      ? "multi"
      : "single"

    const supplierId = asString(body?.supplierId || body?.supplier_id)
    const billId = asString(body?.billId || body?.bill_id)
    const returnId = asString(body?.returnId || body?.return_id) || null
    const purchaseReturn = body?.purchaseReturn || body?.purchase_return || {}
    const returnItems = body?.returnItems || body?.return_items || []
    const warehouseGroups = body?.warehouseGroups || body?.warehouse_groups || []
    const uiSurface = body?.uiSurface || body?.ui_surface || "purchase_returns_page"
    const appLang = String(body?.appLang || body?.app_lang || "ar").trim().toLowerCase() === "en" ? "en" : "ar"

    if (!supplierId && mode !== "resubmit") {
      return NextResponse.json({ success: false, error: "Supplier is required" }, { status: 400 })
    }

    if (!billId && mode !== "resubmit") {
      return NextResponse.json({ success: false, error: "Bill is required" }, { status: 400 })
    }

    if (mode === "resubmit" && !returnId) {
      return NextResponse.json({ success: false, error: "Return id is required for resubmission" }, { status: 400 })
    }

    const authSupabase = await createClient()
    const adminSupabase = createServiceClient()

    if (mode === "resubmit") {
      const { data: existingReturn, error } = await adminSupabase
        .from("purchase_returns")
        .select("id, company_id, created_by, bill_id, supplier_id")
        .eq("id", returnId)
        .eq("company_id", context.companyId)
        .maybeSingle()

      if (error || !existingReturn) {
        return NextResponse.json({ success: false, error: "Purchase return not found" }, { status: 404 })
      }

      if (existingReturn.created_by !== context.user.id) {
        return NextResponse.json({ success: false, error: "Only the creator can resubmit this purchase return" }, { status: 403 })
      }
    } else {
      const { data: bill, error } = await adminSupabase
        .from("bills")
        .select("id, supplier_id, branch_id")
        .eq("id", billId)
        .eq("company_id", context.companyId)
        .maybeSingle()

      if (error || !bill) {
        return NextResponse.json({ success: false, error: "Purchase bill not found" }, { status: 404 })
      }

      if (asString(bill.supplier_id) !== supplierId) {
        return NextResponse.json({ success: false, error: "Supplier does not match the selected bill" }, { status: 400 })
      }

      if (!isPrivilegedRole(context.member.role) && context.member.branch_id && bill.branch_id !== context.member.branch_id) {
        return NextResponse.json({ success: false, error: "Bill is outside your branch scope" }, { status: 403 })
      }
    }

    const command: CreatePurchaseReturnCommand = {
      mode,
      strategy,
      supplierId: supplierId || asString(purchaseReturn?.supplier_id),
      billId: billId || asString(purchaseReturn?.bill_id),
      returnId,
      purchaseReturn,
      returnItems,
      warehouseGroups,
      uiSurface,
    }

    const idempotencyKey = resolveFinancialIdempotencyKey(
      request.headers.get("Idempotency-Key"),
      [
        "purchase-return-command",
        mode,
        strategy,
        context.companyId,
        returnId || billId,
        asString(purchaseReturn?.return_number),
        Number(purchaseReturn?.total_amount || 0).toFixed(2),
      ]
    )

    const requestHash = buildFinancialRequestHash({
      mode,
      strategy,
      supplierId: command.supplierId,
      billId: command.billId,
      returnId,
      purchaseReturn,
      returnItems,
      warehouseGroups,
      uiSurface,
      actorId: context.user.id,
    })

    const service = new PurchaseReturnCommandService(authSupabase, adminSupabase)
    const result = await service.createReturn(
      {
        companyId: context.companyId,
        actorId: context.user.id,
        actorRole: context.member.role,
        actorBranchId: context.member.branch_id,
        actorWarehouseId: context.member.warehouse_id,
      },
      command,
      { idempotencyKey, requestHash }
    )

    if (!result.cached) {
      const notificationService = new PurchaseReturnNotificationService(adminSupabase)
      if (mode === "resubmit") {
        await notificationService.archiveApprovalRequestNotifications({
          companyId: context.companyId,
          purchaseReturnId: result.purchaseReturnId,
          branchId: command.purchaseReturn?.branch_id || null,
          costCenterId: command.purchaseReturn?.cost_center_id || null,
        })
      }

      await notificationService.notifyApprovalRequested({
        companyId: context.companyId,
        purchaseReturnId: result.purchaseReturnId,
        actorUserId: context.user.id,
        appLang,
        isResubmission: mode === "resubmit",
      })
    }

    return NextResponse.json(result, { status: 200 })
  } catch (error: any) {
    console.error("[PURCHASE_RETURNS_CREATE]", error)
    const message = String(error?.message || "Unexpected error while creating purchase return")
    const status = message.includes("Idempotency key already used") ? 409 : 500
    return NextResponse.json({ success: false, error: message }, { status })
  }
}
