import { randomUUID } from "crypto"
import { requireOpenFinancialPeriod } from "@/lib/core/security/financial-lock-guard"

const CAPITAL_CONTRIBUTION_EVENT = "shareholder_capital_contribution_posting"

type SupabaseLike = any
type TraceRecord = { transaction_id: string; request_hash: string | null }

export type ShareholderCapitalContributionCommand = {
  companyId: string
  shareholderId: string
  contributionDate: string
  amount: number
  paymentAccountId: string
  notes?: string | null
  branchId?: string | null
  costCenterId?: string | null
  uiSurface?: string | null
}

export type ShareholderCapitalActor = {
  actorId: string
  actorRole: string
  actorBranchId?: string | null
  actorCostCenterId?: string | null
}

export type ShareholderCapitalContributionResult = {
  success: boolean
  cached: boolean
  contributionId: string | null
  journalEntryId: string | null
  transactionId: string | null
  eventType: typeof CAPITAL_CONTRIBUTION_EVENT
}

const PRIVILEGED_ROLES = new Set(["owner", "admin", "manager", "general_manager", "accountant"])
const normalizeRole = (role: string | null | undefined) => String(role || "").trim().toLowerCase()
const duplicateTrace = (message?: string | null) =>
  !!message && (message.includes("duplicate key value violates unique constraint") || message.includes("idx_financial_operation_traces_idempotency"))

export class ShareholderCapitalCommandService {
  constructor(private readonly adminSupabase: SupabaseLike) {}

  async recordContribution(
    actor: ShareholderCapitalActor,
    command: ShareholderCapitalContributionCommand,
    options: { idempotencyKey: string; requestHash: string }
  ): Promise<ShareholderCapitalContributionResult> {
    if (!PRIVILEGED_ROLES.has(normalizeRole(actor.actorRole))) {
      throw new Error("Insufficient permission to record shareholder capital contributions")
    }
    if (!command.companyId) throw new Error("Company is required")
    if (!command.shareholderId) throw new Error("Shareholder is required")
    if (!command.paymentAccountId) throw new Error("Payment account is required")
    if (!command.contributionDate) throw new Error("Contribution date is required")
    if (!Number.isFinite(command.amount) || command.amount <= 0) throw new Error("Contribution amount must be greater than zero")

    const existingTrace = await this.findTraceByIdempotency(command.companyId, options.idempotencyKey)
    if (existingTrace) {
      if (existingTrace.request_hash && existingTrace.request_hash !== options.requestHash) {
        throw new Error("Idempotency key already used with a different capital contribution payload")
      }
      return {
        success: true,
        cached: true,
        contributionId: await this.findLinkedEntityId(existingTrace.transaction_id, "capital_contribution"),
        journalEntryId: await this.findLinkedEntityId(existingTrace.transaction_id, "journal_entry"),
        transactionId: existingTrace.transaction_id,
        eventType: CAPITAL_CONTRIBUTION_EVENT,
      }
    }

    await requireOpenFinancialPeriod(command.companyId, command.contributionDate)

    const shareholder = await this.loadShareholder(command.companyId, command.shareholderId)
    if (!shareholder) throw new Error("Shareholder was not found")

    const paymentAccount = await this.loadPaymentAccount(command.companyId, command.paymentAccountId)
    if (!paymentAccount) throw new Error("Payment account was not found")

    const capitalAccount = await this.loadCapitalAccount(command.companyId, shareholder.name)
    if (!capitalAccount) throw new Error(`Capital account was not found for ${shareholder.name}`)

    const branchId = await this.resolveBranchId(command.companyId, command.branchId || actor.actorBranchId || null)
    if (!branchId) throw new Error("No branch available to record the journal entry. Please create a branch first.")
    const costCenterId = command.costCenterId || actor.actorCostCenterId || null

    let traceId: string | null = null
    let contributionId: string | null = null
    let journalEntryId: string | null = null
    try {
      const { data: contribution, error: contributionError } = await this.adminSupabase
        .from("capital_contributions")
        .insert({
          company_id: command.companyId,
          shareholder_id: command.shareholderId,
          contribution_date: command.contributionDate,
          amount: command.amount,
          notes: command.notes || null,
        })
        .select("id")
        .single()
      if (contributionError || !contribution?.id) throw new Error(contributionError?.message || "Failed to create capital contribution")
      contributionId = String(contribution.id)

      traceId = await this.createTrace({
        companyId: command.companyId,
        sourceEntity: "capital_contribution",
        sourceId: contributionId,
        eventType: CAPITAL_CONTRIBUTION_EVENT,
        actorId: actor.actorId,
        idempotencyKey: options.idempotencyKey,
        requestHash: options.requestHash,
        metadata: {
          shareholder_id: command.shareholderId,
          shareholder_name: shareholder.name,
          payment_account_id: command.paymentAccountId,
          capital_account_id: capitalAccount.id,
          contribution_date: command.contributionDate,
          amount: command.amount,
          branch_id: branchId,
          cost_center_id: costCenterId,
          ui_surface: command.uiSurface || "shareholders_page",
        },
      })

      const { data: journalEntry, error: journalError } = await this.adminSupabase
        .from("journal_entries")
        .insert({
          company_id: command.companyId,
          reference_type: "capital_contribution",
          reference_id: contributionId,
          entry_date: command.contributionDate,
          description: command.notes || `Capital contribution from ${shareholder.name}`,
          branch_id: branchId,
          cost_center_id: costCenterId,
          status: "draft",
        })
        .select("id")
        .single()
      if (journalError || !journalEntry?.id) throw new Error(journalError?.message || "Failed to create capital contribution journal entry")
      journalEntryId = String(journalEntry.id)

      const { error: linesError } = await this.adminSupabase.from("journal_entry_lines").insert([
        {
          journal_entry_id: journalEntryId,
          account_id: paymentAccount.id,
          debit_amount: command.amount,
          credit_amount: 0,
          description: `Capital contribution received from ${shareholder.name}`,
          branch_id: branchId,
          cost_center_id: costCenterId,
        },
        {
          journal_entry_id: journalEntryId,
          account_id: capitalAccount.id,
          debit_amount: 0,
          credit_amount: command.amount,
          description: `Capital contribution from ${shareholder.name}`,
          branch_id: branchId,
          cost_center_id: costCenterId,
        },
      ])
      if (linesError) throw new Error(linesError.message || "Failed to create capital contribution journal lines")

      const { error: postError } = await this.adminSupabase
        .from("journal_entries")
        .update({ status: "posted" })
        .eq("id", journalEntryId)
      if (postError) throw new Error(postError.message || "Failed to post capital contribution journal entry")

      await this.linkTrace(traceId, "capital_contribution", contributionId, "capital_contribution", "capital_contribution")
      await this.linkTrace(traceId, "journal_entry", journalEntryId, "capital_contribution_journal", "capital_contribution")

      return {
        success: true,
        cached: false,
        contributionId,
        journalEntryId,
        transactionId: traceId,
        eventType: CAPITAL_CONTRIBUTION_EVENT,
      }
    } catch (error) {
      if (journalEntryId) {
        await this.adminSupabase.from("journal_entry_lines").delete().eq("journal_entry_id", journalEntryId)
        await this.adminSupabase.from("journal_entries").delete().eq("id", journalEntryId)
      }
      if (contributionId) {
        await this.adminSupabase.from("capital_contributions").delete().eq("id", contributionId)
      }
      if (traceId) {
        await this.adminSupabase.from("financial_operation_trace_links").delete().eq("transaction_id", traceId)
        await this.adminSupabase.from("financial_operation_traces").delete().eq("transaction_id", traceId)
      }
      throw error
    }
  }

  private async loadShareholder(companyId: string, shareholderId: string) {
    const { data, error } = await this.adminSupabase
      .from("shareholders")
      .select("id, name")
      .eq("id", shareholderId)
      .eq("company_id", companyId)
      .maybeSingle()
    if (error || !data) return null
    return data
  }

  private async loadPaymentAccount(companyId: string, accountId: string) {
    const { data, error } = await this.adminSupabase
      .from("chart_of_accounts")
      .select("id, account_type, account_name, sub_type, is_active")
      .eq("id", accountId)
      .eq("company_id", companyId)
      .eq("is_active", true)
      .maybeSingle()
    if (error || !data) return null
    return data
  }

  private async loadCapitalAccount(companyId: string, shareholderName: string) {
    const capitalAccountName = `رأس مال - ${shareholderName}`
    const { data, error } = await this.adminSupabase
      .from("chart_of_accounts")
      .select("id, account_code, account_name")
      .eq("company_id", companyId)
      .eq("account_type", "equity")
      .eq("account_name", capitalAccountName)
      .maybeSingle()
    if (error || !data) return null
    return data
  }

  private async resolveBranchId(companyId: string, preferredBranchId: string | null) {
    if (preferredBranchId) return preferredBranchId
    const { data: mainBranch } = await this.adminSupabase
      .from("branches")
      .select("id")
      .eq("company_id", companyId)
      .eq("is_main", true)
      .maybeSingle()
    if (mainBranch?.id) return String(mainBranch.id)
    const { data: anyBranch } = await this.adminSupabase
      .from("branches")
      .select("id")
      .eq("company_id", companyId)
      .limit(1)
      .maybeSingle()
    return anyBranch?.id ? String(anyBranch.id) : null
  }

  private async createTrace(params: {
    companyId: string
    sourceEntity: string
    sourceId: string
    eventType: string
    actorId: string
    idempotencyKey: string
    requestHash: string
    metadata: Record<string, unknown>
  }) {
    const { data, error } = await this.adminSupabase.rpc("create_financial_operation_trace", {
      p_company_id: params.companyId,
      p_source_entity: params.sourceEntity,
      p_source_id: params.sourceId,
      p_event_type: params.eventType,
      p_actor_id: params.actorId,
      p_idempotency_key: params.idempotencyKey,
      p_request_hash: params.requestHash,
      p_metadata: params.metadata,
      p_audit_flags: [],
    })
    if (error) {
      if (duplicateTrace(error.message)) {
        const existing = await this.findTraceByIdempotency(params.companyId, params.idempotencyKey)
        if (existing?.transaction_id) return existing.transaction_id
      }
      throw new Error(error.message || "Failed to create capital contribution trace")
    }
    return String(data)
  }

  private async linkTrace(traceId: string, entityType: string, entityId: string, linkRole: string, referenceType: string) {
    await this.adminSupabase.from("financial_operation_trace_links").upsert({
      transaction_id: traceId,
      entity_type: entityType,
      entity_id: entityId,
      link_role: linkRole,
      reference_type: referenceType,
    }, { onConflict: "transaction_id,entity_type,entity_id" })
  }

  private async findTraceByIdempotency(companyId: string, idempotencyKey: string): Promise<TraceRecord | null> {
    const { data, error } = await this.adminSupabase
      .from("financial_operation_traces")
      .select("transaction_id, request_hash")
      .eq("company_id", companyId)
      .eq("event_type", CAPITAL_CONTRIBUTION_EVENT)
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle()
    if (error || !data) return null
    return data as TraceRecord
  }

  private async findLinkedEntityId(traceId: string, entityType: string): Promise<string | null> {
    const { data, error } = await this.adminSupabase
      .from("financial_operation_trace_links")
      .select("entity_id")
      .eq("transaction_id", traceId)
      .eq("entity_type", entityType)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle()
    if (error || !data?.entity_id) return null
    return String(data.entity_id)
  }
}

export { CAPITAL_CONTRIBUTION_EVENT }
