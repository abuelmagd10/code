import { NextRequest, NextResponse } from "next/server"
import { apiGuard } from "@/lib/core/security/api-guard"
import { buildFinancialRequestHash, resolveFinancialIdempotencyKey } from "@/lib/financial-operation-utils"
import { createServiceClient } from "@/lib/supabase/server"
import {
  SalesInvoiceUpdateCommandService,
  type SalesInvoiceUpdateCommand,
  type SalesInvoiceUpdateItem,
} from "@/lib/services/sales-invoice-update-command.service"

const toNumber = (value: unknown, fallback = 0) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

const toNullableString = (value: unknown) => {
  const parsed = String(value || "").trim()
  return parsed.length > 0 ? parsed : null
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { context, errorResponse } = await apiGuard(request)
  if (errorResponse || !context) return errorResponse

  try {
    const body = await request.json()
    const items = Array.isArray(body?.items) ? body.items : []
    const commandItems: SalesInvoiceUpdateItem[] = items.map((item: any) => ({
      id: item?.id || null,
      product_id: String(item?.product_id || "").trim(),
      quantity: toNumber(item?.quantity),
      unit_price: toNumber(item?.unit_price),
      tax_rate: toNumber(item?.tax_rate),
      discount_percent: toNumber(item?.discount_percent),
      line_total: toNumber(item?.line_total),
      returned_quantity: toNumber(item?.returned_quantity),
      item_type: item?.item_type === "service" ? "service" : "product",
    }))

    const command: SalesInvoiceUpdateCommand = {
      companyId: context.companyId,
      invoiceId: id,
      customer_id: String(body?.customer_id || body?.customerId || "").trim(),
      invoice_date: String(body?.invoice_date || body?.invoiceDate || "").trim(),
      due_date: toNullableString(body?.due_date || body?.dueDate),
      subtotal: toNumber(body?.subtotal),
      tax_amount: toNumber(body?.tax_amount || body?.taxAmount),
      total_amount: toNumber(body?.total_amount || body?.totalAmount),
      original_subtotal: toNumber(body?.original_subtotal || body?.originalSubtotal || body?.subtotal),
      original_tax_amount: toNumber(body?.original_tax_amount || body?.originalTaxAmount || body?.tax_amount || body?.taxAmount),
      original_total: toNumber(body?.original_total || body?.originalTotal || body?.total_amount || body?.totalAmount),
      discount_type: body?.discount_type || body?.discountType || "amount",
      discount_value: toNumber(body?.discount_value || body?.discountValue),
      discount_position: body?.discount_position || body?.discountPosition || "before_tax",
      tax_inclusive: !!(body?.tax_inclusive ?? body?.taxInclusive),
      shipping: toNumber(body?.shipping),
      shipping_tax_rate: toNumber(body?.shipping_tax_rate || body?.shippingTaxRate),
      shipping_provider_id: toNullableString(body?.shipping_provider_id || body?.shippingProviderId),
      adjustment: toNumber(body?.adjustment),
      branch_id: toNullableString(body?.branch_id || body?.branchId),
      cost_center_id: toNullableString(body?.cost_center_id || body?.costCenterId),
      warehouse_id: toNullableString(body?.warehouse_id || body?.warehouseId),
      items: commandItems,
      uiSurface: body?.uiSurface || body?.ui_surface || "invoice_edit_page",
    }

    const idempotencyKey = resolveFinancialIdempotencyKey(
      request.headers.get("Idempotency-Key"),
      ["sales-invoice-update", context.companyId, id, command.invoice_date, command.total_amount.toFixed(2)]
    )
    const requestHash = buildFinancialRequestHash({ ...command, actorId: context.user.id })

    const service = new SalesInvoiceUpdateCommandService(createServiceClient())
    const result = await service.updateInvoice(
      {
        actorId: context.user.id,
        actorRole: context.member.role,
        actorBranchId: context.member.branch_id,
        actorCostCenterId: context.member.cost_center_id,
        actorWarehouseId: context.member.warehouse_id,
      },
      command,
      { idempotencyKey, requestHash }
    )

    return NextResponse.json(result)
  } catch (error: any) {
    console.error("[SALES_INVOICE_UPDATE_COMMAND]", error)
    const message = String(error?.message || "Unexpected error while updating invoice")
    const status = message.includes("Idempotency key already used") ? 409 :
      message.includes("permission") ? 403 :
      message.includes("not found") ? 404 :
      message.includes("required") || message.includes("Cannot edit") || message.includes("not editable") ? 400 :
      500
    return NextResponse.json({ success: false, error: message }, { status })
  }
}
