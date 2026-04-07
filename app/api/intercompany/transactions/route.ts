import { NextRequest, NextResponse } from "next/server"
import { secureApiRequest, badRequestError, serverError } from "@/lib/api-security-enhanced"
import { enterpriseFinanceFlags } from "@/lib/enterprise-finance-flags"
import { buildFinancialRequestHash, resolveFinancialIdempotencyKey } from "@/lib/financial-operation-utils"
import { IntercompanyService } from "@/lib/services/intercompany.service"
import { createClient, createServiceClient } from "@/lib/supabase/server"

function intercompanyDisabledResponse() {
  return NextResponse.json(
    { success: false, error: "Intercompany transactions are not enabled" },
    { status: 403 }
  )
}

function toActor(user: any) {
  return {
    userId: user?.id || "",
    email: user?.email || null,
  }
}

export async function GET(req: NextRequest) {
  try {
    if (!enterpriseFinanceFlags.intercompanyEnabled) {
      return intercompanyDisabledResponse()
    }

    const authSupabase = await createClient()
    const { user, error } = await secureApiRequest(req, {
      requireAuth: true,
      requireCompany: true,
      supabase: authSupabase,
    })
    if (error) return error

    const service = new IntercompanyService(createServiceClient() as any, authSupabase as any)
    const transactions = await service.listTransactionsForActor(user.id)

    return NextResponse.json({
      success: true,
      data: transactions,
    })
  } catch (error: any) {
    return serverError(`Failed to list intercompany transactions: ${error?.message || "unknown_error"}`)
  }
}

export async function POST(req: NextRequest) {
  try {
    if (!enterpriseFinanceFlags.intercompanyEnabled) {
      return intercompanyDisabledResponse()
    }

    const authSupabase = await createClient()
    const { user, error } = await secureApiRequest(req, {
      requireAuth: true,
      requireCompany: true,
      supabase: authSupabase,
    })
    if (error) return error

    const body = await req.json()
    const sellerCompanyId = String(body?.sellerCompanyId || "").trim()
    const buyerCompanyId = String(body?.buyerCompanyId || "").trim()
    const sourceFlowType = String(body?.sourceFlowType || "").trim()
    const transactionDate = String(body?.transactionDate || "").trim()
    const transactionCurrency = String(body?.transactionCurrency || "").trim()
    const transactionAmount = Number(body?.transactionAmount || 0)
    const pricingPolicy = String(body?.pricingPolicy || "").trim()

    if (!sellerCompanyId) return badRequestError("sellerCompanyId is required")
    if (!buyerCompanyId) return badRequestError("buyerCompanyId is required")
    if (!sourceFlowType) return badRequestError("sourceFlowType is required")
    if (!transactionDate) return badRequestError("transactionDate is required")
    if (!transactionCurrency) return badRequestError("transactionCurrency is required")
    if (!transactionAmount || transactionAmount <= 0) return badRequestError("transactionAmount must be greater than zero")
    if (!pricingPolicy) return badRequestError("pricingPolicy is required")

    const idempotencyKey = resolveFinancialIdempotencyKey(
      req.headers.get("Idempotency-Key"),
      [
        "intercompany-create",
        sellerCompanyId,
        buyerCompanyId,
        sourceFlowType,
        transactionDate,
        transactionCurrency,
        transactionAmount.toFixed(4),
        pricingPolicy,
      ]
    )

    const requestHash = buildFinancialRequestHash(body)
    const service = new IntercompanyService(createServiceClient() as any, authSupabase as any)
    const result = await service.createIntercompanyTransaction(
      {
        sellerCompanyId,
        buyerCompanyId,
        sourceFlowType: sourceFlowType as any,
        transactionDate,
        transactionCurrency,
        transactionAmount,
        pricingPolicy: pricingPolicy as any,
        pricingReference: body?.pricingReference || {},
        operationalContext: body?.operationalContext || {},
        requestedShipDate: body?.requestedShipDate || null,
        sellerExchangeRate: body?.sellerExchangeRate ?? null,
        sellerRateSource: body?.sellerRateSource ?? null,
        sellerRateTimestamp: body?.sellerRateTimestamp ?? null,
        buyerExchangeRate: body?.buyerExchangeRate ?? null,
        buyerRateSource: body?.buyerRateSource ?? null,
        buyerRateTimestamp: body?.buyerRateTimestamp ?? null,
        idempotencyKey,
        requestHash,
      },
      toActor(user)
    )

    return NextResponse.json({
      success: true,
      transaction: result.transaction,
      traceId: result.traceId || null,
      alreadyExists: !!result.alreadyExists,
    })
  } catch (error: any) {
    return serverError(`Failed to create intercompany transaction: ${error?.message || "unknown_error"}`)
  }
}
