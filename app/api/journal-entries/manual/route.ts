import { NextRequest, NextResponse } from "next/server"
import { apiGuard } from "@/lib/core/security/api-guard"
import { buildFinancialRequestHash, resolveFinancialIdempotencyKey } from "@/lib/financial-operation-utils"
import { createServiceClient } from "@/lib/supabase/server"
import {
  ManualJournalCommandService,
  type ManualJournalCommand,
  type ManualJournalLine,
} from "@/lib/services/manual-journal-command.service"

const toNumber = (value: unknown, fallback = 0) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

const toNullableString = (value: unknown) => {
  const parsed = String(value || "").trim()
  return parsed.length > 0 ? parsed : null
}

export async function POST(request: NextRequest) {
  const { context, errorResponse } = await apiGuard(request)
  if (errorResponse || !context) return errorResponse

  try {
    const body = await request.json()
    const entryId = toNullableString(body?.entryId || body?.entry_id)
    const lines: ManualJournalLine[] = (Array.isArray(body?.lines) ? body.lines : []).map((line: any) => ({
      account_id: String(line?.account_id || line?.accountId || "").trim(),
      debit_amount: toNumber(line?.debit_amount ?? line?.debitAmount),
      credit_amount: toNumber(line?.credit_amount ?? line?.creditAmount),
      description: line?.description || null,
      original_debit: toNumber(line?.original_debit ?? line?.originalDebit ?? line?.debit_amount ?? line?.debitAmount),
      original_credit: toNumber(line?.original_credit ?? line?.originalCredit ?? line?.credit_amount ?? line?.creditAmount),
      original_currency: toNullableString(line?.original_currency || line?.originalCurrency),
      exchange_rate_used: toNumber(line?.exchange_rate_used ?? line?.exchangeRateUsed, 1),
      exchange_rate_id: toNullableString(line?.exchange_rate_id || line?.exchangeRateId),
      branch_id: toNullableString(line?.branch_id || line?.branchId),
      cost_center_id: toNullableString(line?.cost_center_id || line?.costCenterId),
    }))

    const command: ManualJournalCommand = {
      companyId: context.companyId,
      entryId,
      entryDate: String(body?.entryDate || body?.entry_date || "").trim(),
      description: String(body?.description || "").trim(),
      justification: String(body?.justification || body?.reason || body?.description || "").trim(),
      supportingReference: toNullableString(body?.supportingReference || body?.supporting_reference),
      branchId: toNullableString(body?.branchId || body?.branch_id),
      costCenterId: toNullableString(body?.costCenterId || body?.cost_center_id),
      lines,
      uiSurface: body?.uiSurface || body?.ui_surface || "manual_journal",
    }

    const operation = entryId ? "update" : "create"
    const idempotencyKey = resolveFinancialIdempotencyKey(
      request.headers.get("Idempotency-Key"),
      ["manual-journal", operation, context.companyId, entryId || "new", command.entryDate, command.description]
    )
    const requestHash = buildFinancialRequestHash({ ...command, actorId: context.user.id, operation })

    const service = new ManualJournalCommandService(createServiceClient())
    const actor = {
      actorId: context.user.id,
      actorRole: context.member.role,
      actorBranchId: context.member.branch_id,
      actorCostCenterId: context.member.cost_center_id,
    }
    const result = entryId
      ? await service.updateDraftManualJournal(actor, command, { idempotencyKey, requestHash })
      : await service.createManualJournal(actor, command, { idempotencyKey, requestHash })

    return NextResponse.json(result)
  } catch (error: any) {
    console.error("[MANUAL_JOURNAL_COMMAND]", error)
    const message = String(error?.message || "Unexpected error while posting manual journal")
    const status = message.includes("Idempotency key already used") ? 409 :
      message.includes("permission") ? 403 :
      message.includes("not found") ? 404 :
      message.includes("required") || message.includes("balanced") || message.includes("Cannot") || message.includes("must") ? 400 :
      500
    return NextResponse.json({ success: false, error: message }, { status })
  }
}
