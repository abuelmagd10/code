import { NextRequest, NextResponse } from "next/server"
import { apiGuard } from "@/lib/core/security/api-guard"
import { createClient, createServiceClient } from "@/lib/supabase/server"
import { buildFinancialRequestHash, resolveFinancialIdempotencyKey } from "@/lib/financial-operation-utils"
import { requireOpenFinancialPeriod } from "@/lib/core/security/financial-lock-guard"
import { SupplierPaymentCommandService, isPrivilegedRole, type CreateSupplierPaymentCommand } from "@/lib/services/supplier-payment-command.service"

type RawAllocation = {
  billId?: string
  bill_id?: string
  amount?: number
}

function normalizeAllocations(raw: unknown) {
  if (!Array.isArray(raw)) return []

  return raw
    .map((item) => item as RawAllocation)
    .map((item) => ({
      billId: String(item.billId || item.bill_id || "").trim(),
      amount: Number(item.amount || 0),
    }))
    .filter((item) => item.billId && item.amount > 0)
    .sort((left, right) => left.billId.localeCompare(right.billId))
}

export async function POST(request: NextRequest) {
  const { context, errorResponse } = await apiGuard(request)
  if (errorResponse || !context) {
    return errorResponse
  }

  try {
    const body = await request.json()
    const allocations = normalizeAllocations(body?.allocations)

    const supplierId = String(body?.supplierId || body?.supplier_id || "").trim()
    const amount = Number(body?.amount || body?.payment_amount || 0)
    const paymentDate = String(body?.paymentDate || body?.payment_date || "").trim()
    const paymentMethod = String(body?.paymentMethod || body?.payment_method || "").trim()
    const accountId = String(body?.accountId || body?.account_id || "").trim()
    const branchId = body?.branchId || body?.branch_id || context.member.branch_id || null
    const warehouseId = body?.warehouseId || body?.warehouse_id || null
    const referenceNumber = body?.referenceNumber || body?.reference_number || null
    const notes = body?.notes || null
    const currencyCode = String(body?.currencyCode || body?.currency_code || "EGP").trim() || "EGP"
    const exchangeRate = Number(body?.exchangeRate || body?.exchange_rate || 1)
    const baseCurrencyAmount = Number(body?.baseCurrencyAmount || body?.base_currency_amount || amount)
    const originalAmount = Number(body?.originalAmount || body?.original_amount || amount)
    const originalCurrency = String(body?.originalCurrency || body?.original_currency || currencyCode).trim() || currencyCode
    const exchangeRateId = body?.exchangeRateId || body?.exchange_rate_id || null
    const rateSource = body?.rateSource || body?.rate_source || null
    const uiSurface = body?.uiSurface || body?.ui_surface || "payments_page"

    if (!supplierId) {
      return NextResponse.json({ success: false, error: "Supplier is required" }, { status: 400 })
    }

    if (!paymentDate) {
      return NextResponse.json({ success: false, error: "Payment date is required" }, { status: 400 })
    }

    if (!paymentMethod) {
      return NextResponse.json({ success: false, error: "Payment method is required" }, { status: 400 })
    }

    if (!accountId) {
      return NextResponse.json({ success: false, error: "Payment account is required" }, { status: 400 })
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ success: false, error: "Payment amount must be greater than zero" }, { status: 400 })
    }

    const authSupabase = await createClient()
    const adminSupabase = createServiceClient()

    const { data: account, error: accountError } = await adminSupabase
      .from("chart_of_accounts")
      .select("id, company_id")
      .eq("id", accountId)
      .eq("company_id", context.companyId)
      .maybeSingle()

    if (accountError || !account) {
      return NextResponse.json({ success: false, error: "Selected payment account is invalid" }, { status: 400 })
    }

    if (allocations.length > 0) {
      const billIds = allocations.map((allocation) => allocation.billId)
      const { data: bills, error: billsError } = await adminSupabase
        .from("bills")
        .select("id, supplier_id, branch_id")
        .eq("company_id", context.companyId)
        .in("id", billIds)

      if (billsError || !bills || bills.length !== billIds.length) {
        return NextResponse.json({ success: false, error: "One or more target bills are invalid" }, { status: 400 })
      }

      const billMap = new Map((bills || []).map((bill: any) => [String(bill.id), bill]))
      for (const allocation of allocations) {
        const bill = billMap.get(allocation.billId)
        if (!bill || String(bill.supplier_id || "") !== supplierId) {
          return NextResponse.json({ success: false, error: "All allocations must belong to the selected supplier" }, { status: 400 })
        }

        if (!isPrivilegedRole(context.member.role) && context.member.branch_id && bill.branch_id !== context.member.branch_id) {
          return NextResponse.json({ success: false, error: "Bill is outside your branch scope" }, { status: 403 })
        }
      }
    } else if (!isPrivilegedRole(context.member.role) && context.member.branch_id && branchId && branchId !== context.member.branch_id) {
      return NextResponse.json({ success: false, error: "Payment is outside your branch scope" }, { status: 403 })
    }

    if (isPrivilegedRole(context.member.role)) {
      await requireOpenFinancialPeriod(context.companyId, paymentDate)
    }

    const command: CreateSupplierPaymentCommand = {
      companyId: context.companyId,
      supplierId,
      amount,
      paymentDate,
      paymentMethod,
      accountId,
      branchId,
      warehouseId,
      referenceNumber,
      notes,
      currencyCode,
      exchangeRate,
      baseCurrencyAmount,
      originalAmount,
      originalCurrency,
      exchangeRateId,
      rateSource,
      allocations,
      uiSurface,
    }

    const idempotencyKey = resolveFinancialIdempotencyKey(
      request.headers.get("Idempotency-Key"),
      [
        "supplier-payment-create",
        context.companyId,
        supplierId,
        paymentDate,
        amount.toFixed(2),
        paymentMethod,
        accountId,
        referenceNumber || "none",
        JSON.stringify(allocations),
      ]
    )

    const requestHash = buildFinancialRequestHash({
      supplierId,
      amount,
      paymentDate,
      paymentMethod,
      accountId,
      branchId,
      warehouseId,
      referenceNumber,
      notes,
      currencyCode,
      exchangeRate,
      baseCurrencyAmount,
      originalAmount,
      originalCurrency,
      exchangeRateId,
      rateSource,
      allocations,
      uiSurface,
    })

    const service = new SupplierPaymentCommandService(authSupabase, adminSupabase)
    const result = await service.createPayment(
      {
        companyId: context.companyId,
        actorId: context.user.id,
        actorRole: context.member.role,
        actorBranchId: context.member.branch_id,
      },
      command,
      { idempotencyKey, requestHash }
    )

    return NextResponse.json(result, { status: 200 })
  } catch (error: any) {
    console.error("[SUPPLIER_PAYMENTS_CREATE]", error)
    const message = String(error?.message || "Unexpected error while creating supplier payment")
    const status = message.includes("Idempotency key already used") ? 409 : 500
    return NextResponse.json({ success: false, error: message }, { status })
  }
}
