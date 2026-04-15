import { requireOpenFinancialPeriod } from "@/lib/core/security/financial-lock-guard"

const SALES_INVOICE_DRAFT_DELETE_EVENT = "sales_invoice_draft_delete"

type SupabaseLike = any
type TraceRecord = { transaction_id: string; request_hash: string | null }

export type SalesInvoiceDraftDeleteActor = {
  actorId: string
  actorRole: string
  actorBranchId?: string | null
}

export type SalesInvoiceDraftDeleteCommand = {
  companyId: string
  invoiceId: string
  uiSurface?: string | null
}

export type SalesInvoiceDraftDeleteResult = {
  success: boolean
  cached: boolean
  invoiceId: string
  linkedSalesOrderId: string | null
  transactionId: string | null
  eventType: typeof SALES_INVOICE_DRAFT_DELETE_EVENT
}

const PRIVILEGED_ROLES = new Set(["owner", "admin", "manager", "general_manager"])
const normalizeRole = (role: string | null | undefined) => String(role || "").trim().toLowerCase()
const duplicateTrace = (message?: string | null) =>
  !!message && (message.includes("duplicate key value violates unique constraint") || message.includes("idx_financial_operation_traces_idempotency"))

export class SalesInvoiceDraftDeleteCommandService {
  constructor(private readonly adminSupabase: SupabaseLike) {}

  async deleteDraftInvoice(
    actor: SalesInvoiceDraftDeleteActor,
    command: SalesInvoiceDraftDeleteCommand,
    options: { idempotencyKey: string; requestHash: string }
  ): Promise<SalesInvoiceDraftDeleteResult> {
    if (!command.companyId) throw new Error("Company is required")
    if (!command.invoiceId) throw new Error("Invoice is required")

    const existingTrace = await this.findTraceByIdempotency(command.companyId, options.idempotencyKey)
    if (existingTrace) {
      if (existingTrace.request_hash && existingTrace.request_hash !== options.requestHash) {
        throw new Error("Idempotency key already used with a different invoice delete payload")
      }
      return {
        success: true,
        cached: true,
        invoiceId: command.invoiceId,
        linkedSalesOrderId: await this.findLinkedEntityId(existingTrace.transaction_id, "sales_order"),
        transactionId: existingTrace.transaction_id,
        eventType: SALES_INVOICE_DRAFT_DELETE_EVENT,
      }
    }

    const invoice = await this.loadInvoice(command.companyId, command.invoiceId)
    if (!invoice) throw new Error("Invoice was not found")
    if (invoice.status !== "draft") throw new Error("Only draft invoices can be deleted")

    const isPrivileged = PRIVILEGED_ROLES.has(normalizeRole(actor.actorRole))
    if (!isPrivileged && actor.actorBranchId && invoice.branch_id && actor.actorBranchId !== invoice.branch_id) {
      throw new Error("You do not have permission to delete this invoice")
    }

    await requireOpenFinancialPeriod(command.companyId, invoice.invoice_date || new Date().toISOString().slice(0, 10))
    await this.assertNoFinancialLinks(command.companyId, command.invoiceId, invoice)

    let traceId: string | null = null
    try {
      traceId = await this.createTrace({
        companyId: command.companyId,
        sourceEntity: "invoice",
        sourceId: command.invoiceId,
        eventType: SALES_INVOICE_DRAFT_DELETE_EVENT,
        actorId: actor.actorId,
        idempotencyKey: options.idempotencyKey,
        requestHash: options.requestHash,
        metadata: {
          invoice_id: command.invoiceId,
          invoice_number: invoice.invoice_number || null,
          invoice_date: invoice.invoice_date || null,
          status: invoice.status || null,
          linked_sales_order_id: invoice.sales_order_id || null,
          branch_id: invoice.branch_id || null,
          warehouse_id: invoice.warehouse_id || null,
          cost_center_id: invoice.cost_center_id || null,
          ui_surface: command.uiSurface || "invoices_page",
        },
      })

      await this.linkTrace(traceId, "invoice", command.invoiceId, "deleted_draft_invoice", "invoice_delete")
      if (invoice.sales_order_id) {
        await this.linkTrace(traceId, "sales_order", invoice.sales_order_id, "reset_linked_sales_order", "invoice_delete")
      }

      const { error: itemsError } = await this.adminSupabase
        .from("invoice_items")
        .delete()
        .eq("invoice_id", command.invoiceId)
      if (itemsError) throw new Error(itemsError.message || "Failed to delete invoice items")

      const { error: invoiceError } = await this.adminSupabase
        .from("invoices")
        .delete()
        .eq("id", command.invoiceId)
        .eq("company_id", command.companyId)
        .eq("status", "draft")
      if (invoiceError) throw new Error(invoiceError.message || "Failed to delete draft invoice")

      if (invoice.sales_order_id) {
        const { error: salesOrderError } = await this.adminSupabase
          .from("sales_orders")
          .update({ status: "draft", invoice_id: null })
          .eq("id", invoice.sales_order_id)
          .eq("company_id", command.companyId)
        if (salesOrderError) throw new Error(salesOrderError.message || "Failed to reset linked sales order")
      }

      return {
        success: true,
        cached: false,
        invoiceId: command.invoiceId,
        linkedSalesOrderId: invoice.sales_order_id || null,
        transactionId: traceId,
        eventType: SALES_INVOICE_DRAFT_DELETE_EVENT,
      }
    } catch (error) {
      if (traceId) {
        await this.adminSupabase.from("financial_operation_trace_links").delete().eq("transaction_id", traceId)
        await this.adminSupabase.from("financial_operation_traces").delete().eq("transaction_id", traceId)
      }
      throw error
    }
  }

  private async loadInvoice(companyId: string, invoiceId: string) {
    const { data, error } = await this.adminSupabase
      .from("invoices")
      .select("id, invoice_number, invoice_date, status, sales_order_id, branch_id, warehouse_id, cost_center_id")
      .eq("id", invoiceId)
      .eq("company_id", companyId)
      .maybeSingle()
    if (error || !data) return null
    return data
  }

  private async assertNoFinancialLinks(companyId: string, invoiceId: string, invoice: any) {
    const [inventoryTx, payments, journalEntries] = await Promise.all([
      this.adminSupabase
        .from("inventory_transactions")
        .select("id")
        .eq("company_id", companyId)
        .eq("branch_id", invoice.branch_id)
        .eq("warehouse_id", invoice.warehouse_id)
        .eq("cost_center_id", invoice.cost_center_id)
        .eq("reference_id", invoiceId)
        .limit(1),
      this.adminSupabase
        .from("payments")
        .select("id")
        .eq("invoice_id", invoiceId)
        .limit(1),
      this.adminSupabase
        .from("journal_entries")
        .select("id")
        .eq("reference_id", invoiceId)
        .limit(1),
    ])

    if (inventoryTx.error) throw new Error(inventoryTx.error.message || "Failed to validate invoice inventory links")
    if (payments.error) throw new Error(payments.error.message || "Failed to validate invoice payments")
    if (journalEntries.error) throw new Error(journalEntries.error.message || "Failed to validate invoice journal links")
    if ((inventoryTx.data || []).length > 0) throw new Error("This invoice has inventory transactions. Use Return instead of delete.")
    if ((payments.data || []).length > 0) throw new Error("This invoice has linked payments. Use Return instead of delete.")
    if ((journalEntries.data || []).length > 0) throw new Error("This invoice has journal entries. Use Return instead of delete.")
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
      throw new Error(error.message || "Failed to create invoice delete trace")
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
      .eq("event_type", SALES_INVOICE_DRAFT_DELETE_EVENT)
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

export { SALES_INVOICE_DRAFT_DELETE_EVENT }
