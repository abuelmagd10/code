import { requireOpenFinancialPeriod } from "@/lib/core/security/financial-lock-guard"
import { getBranchDefaults } from "@/lib/governance-branch-defaults"
import { validateShippingProvider } from "@/lib/third-party-inventory"

const SALES_INVOICE_UPDATE_EVENT = "sales_invoice_update_command"

type SupabaseLike = any
type TraceRecord = { transaction_id: string; request_hash: string | null }

export type SalesInvoiceUpdateActor = {
  actorId: string
  actorRole: string
  actorBranchId?: string | null
  actorCostCenterId?: string | null
  actorWarehouseId?: string | null
}

export type SalesInvoiceUpdateItem = {
  id?: string | null
  product_id: string
  quantity: number
  unit_price: number
  tax_rate: number
  discount_percent?: number | null
  line_total: number
  returned_quantity?: number | null
  item_type?: "product" | "service"
}

export type SalesInvoiceUpdateCommand = {
  companyId: string
  invoiceId: string
  customer_id: string
  invoice_date: string
  due_date?: string | null
  subtotal: number
  tax_amount: number
  total_amount: number
  original_subtotal: number
  original_tax_amount: number
  original_total: number
  discount_type?: string | null
  discount_value?: number | null
  discount_position?: string | null
  tax_inclusive?: boolean | null
  shipping?: number | null
  shipping_tax_rate?: number | null
  shipping_provider_id?: string | null
  adjustment?: number | null
  branch_id?: string | null
  cost_center_id?: string | null
  warehouse_id?: string | null
  items: SalesInvoiceUpdateItem[]
  uiSurface?: string | null
}

export type SalesInvoiceUpdateResult = {
  success: boolean
  cached: boolean
  invoiceId: string
  linkedSalesOrderId: string | null
  inventoryTransactionIds: string[]
  transactionId: string | null
  eventType: typeof SALES_INVOICE_UPDATE_EVENT
}

const PRIVILEGED_ROLES = new Set(["owner", "admin", "manager", "general_manager"])
const normalizeRole = (role: string | null | undefined) => String(role || "").trim().toLowerCase()
const duplicateTrace = (message?: string | null) =>
  !!message && (message.includes("duplicate key value violates unique constraint") || message.includes("idx_financial_operation_traces_idempotency"))

export class SalesInvoiceUpdateCommandService {
  constructor(private readonly adminSupabase: SupabaseLike) {}

  async updateInvoice(
    actor: SalesInvoiceUpdateActor,
    command: SalesInvoiceUpdateCommand,
    options: { idempotencyKey: string; requestHash: string }
  ): Promise<SalesInvoiceUpdateResult> {
    if (!command.companyId) throw new Error("Company is required")
    if (!command.invoiceId) throw new Error("Invoice is required")
    if (!command.customer_id) throw new Error("Customer is required")
    if (!command.invoice_date) throw new Error("Invoice date is required")
    if (!Array.isArray(command.items) || command.items.length === 0) throw new Error("Invoice items are required")

    for (const item of command.items) {
      if (!item.product_id) throw new Error("Every invoice item must have a product")
      if (!Number.isFinite(item.quantity) || item.quantity <= 0) throw new Error("Every invoice item must have a positive quantity")
      if (!Number.isFinite(item.unit_price) || item.unit_price < 0) throw new Error("Every invoice item must have a valid unit price")
    }

    const existingTrace = await this.findTraceByIdempotency(command.companyId, options.idempotencyKey)
    if (existingTrace) {
      if (existingTrace.request_hash && existingTrace.request_hash !== options.requestHash) {
        throw new Error("Idempotency key already used with a different invoice update payload")
      }
      return {
        success: true,
        cached: true,
        invoiceId: command.invoiceId,
        linkedSalesOrderId: await this.findLinkedEntityId(existingTrace.transaction_id, "sales_order"),
        inventoryTransactionIds: await this.findLinkedEntityIds(existingTrace.transaction_id, "inventory_transaction"),
        transactionId: existingTrace.transaction_id,
        eventType: SALES_INVOICE_UPDATE_EVENT,
      }
    }

    const invoice = await this.loadInvoice(command.companyId, command.invoiceId)
    if (!invoice) throw new Error("Invoice was not found")
    if (invoice.status === "paid" || invoice.status === "partially_paid") {
      throw new Error("Cannot edit a paid or partially paid invoice")
    }
    if (invoice.status !== "draft" && invoice.status !== "sent") {
      throw new Error(`Invoice status '${invoice.status || "unknown"}' is not editable through this command`)
    }

    const isPrivileged = PRIVILEGED_ROLES.has(normalizeRole(actor.actorRole))
    if (!isPrivileged && actor.actorBranchId && invoice.branch_id && actor.actorBranchId !== invoice.branch_id) {
      throw new Error("You do not have permission to update this invoice")
    }

    await requireOpenFinancialPeriod(command.companyId, command.invoice_date)

    const governance = await this.resolveGovernance(command)
    let traceId: string | null = null
    const inventoryTransactionIds: string[] = []

    try {
      traceId = await this.createTrace({
        companyId: command.companyId,
        sourceEntity: "invoice",
        sourceId: command.invoiceId,
        eventType: SALES_INVOICE_UPDATE_EVENT,
        actorId: actor.actorId,
        idempotencyKey: options.idempotencyKey,
        requestHash: options.requestHash,
        metadata: {
          invoice_id: command.invoiceId,
          invoice_number: invoice.invoice_number || null,
          previous_status: invoice.status || null,
          invoice_date: command.invoice_date,
          customer_id: command.customer_id,
          linked_sales_order_id: invoice.sales_order_id || null,
          total_amount: command.total_amount,
          branch_id: governance.branch_id,
          warehouse_id: governance.warehouse_id,
          cost_center_id: governance.cost_center_id,
          item_count: command.items.length,
          ui_surface: command.uiSurface || "invoice_edit_page",
        },
      })

      await this.updateInvoiceRecord(command, governance)
      await this.replaceInvoiceItems(command)
      await this.deletePreviousPostings(command, governance)

      if (invoice.status === "sent") {
        const insertedInventoryIds = await this.postInventoryOnly(command, invoice, governance)
        inventoryTransactionIds.push(...insertedInventoryIds)
      }

      await this.recalculatePaymentStatus(command.companyId, command.invoiceId, command.total_amount, invoice.status)
      if (invoice.sales_order_id) {
        await this.syncLinkedSalesOrder(command, invoice.sales_order_id)
      }

      await this.linkTrace(traceId, "invoice", command.invoiceId, "updated_invoice", "sales_invoice_update")
      if (invoice.sales_order_id) {
        await this.linkTrace(traceId, "sales_order", invoice.sales_order_id, "synced_sales_order", "sales_invoice_update")
      }
      for (const transactionId of inventoryTransactionIds) {
        await this.linkTrace(traceId, "inventory_transaction", transactionId, "invoice_inventory_update", "sales_invoice_update")
      }

      return {
        success: true,
        cached: false,
        invoiceId: command.invoiceId,
        linkedSalesOrderId: invoice.sales_order_id || null,
        inventoryTransactionIds,
        transactionId: traceId,
        eventType: SALES_INVOICE_UPDATE_EVENT,
      }
    } catch (error) {
      if (traceId) {
        await this.adminSupabase.from("financial_operation_trace_links").delete().eq("transaction_id", traceId)
        await this.adminSupabase.from("financial_operation_traces").delete().eq("transaction_id", traceId)
      }
      throw error
    }
  }

  private async updateInvoiceRecord(command: SalesInvoiceUpdateCommand, governance: { branch_id: string | null; warehouse_id: string | null; cost_center_id: string | null }) {
    const { error } = await this.adminSupabase
      .from("invoices")
      .update({
        customer_id: command.customer_id,
        invoice_date: command.invoice_date,
        due_date: command.due_date || null,
        subtotal: command.subtotal,
        tax_amount: command.tax_amount,
        total_amount: command.total_amount,
        original_subtotal: command.original_subtotal,
        original_tax_amount: command.original_tax_amount,
        original_total: command.original_total,
        discount_type: command.discount_type || "amount",
        discount_value: Number(command.discount_value || 0),
        discount_position: command.discount_position || "before_tax",
        tax_inclusive: !!command.tax_inclusive,
        shipping: Number(command.shipping || 0),
        shipping_tax_rate: Number(command.shipping_tax_rate || 0),
        shipping_provider_id: command.shipping_provider_id || null,
        adjustment: Number(command.adjustment || 0),
        branch_id: governance.branch_id,
        cost_center_id: governance.cost_center_id,
        warehouse_id: governance.warehouse_id,
      })
      .eq("id", command.invoiceId)
      .eq("company_id", command.companyId)
    if (error) throw new Error(error.message || "Failed to update invoice")
  }

  private async replaceInvoiceItems(command: SalesInvoiceUpdateCommand) {
    const { error: deleteError } = await this.adminSupabase
      .from("invoice_items")
      .delete()
      .eq("invoice_id", command.invoiceId)
    if (deleteError) throw new Error(deleteError.message || "Failed to delete invoice items")

    const rows = command.items.map((item) => ({
      invoice_id: command.invoiceId,
      product_id: item.product_id,
      quantity: item.quantity,
      unit_price: item.unit_price,
      tax_rate: item.tax_rate,
      discount_percent: Number(item.discount_percent || 0),
      line_total: item.line_total,
      returned_quantity: Number(item.returned_quantity || 0),
    }))

    const { error: insertError } = await this.adminSupabase.from("invoice_items").insert(rows)
    if (insertError) throw new Error(insertError.message || "Failed to insert invoice items")
  }

  private async deletePreviousPostings(command: SalesInvoiceUpdateCommand, governance: { branch_id: string | null; warehouse_id: string | null; cost_center_id: string | null }) {
    const { error: inventoryError } = await this.adminSupabase
      .from("inventory_transactions")
      .delete()
      .eq("company_id", command.companyId)
      .eq("branch_id", governance.branch_id)
      .eq("warehouse_id", governance.warehouse_id)
      .eq("cost_center_id", governance.cost_center_id)
      .eq("reference_id", command.invoiceId)
    if (inventoryError) throw new Error(inventoryError.message || "Failed to delete previous invoice inventory transactions")

    const { data: existingJournals, error: journalLookupError } = await this.adminSupabase
      .from("journal_entries")
      .select("id")
      .eq("reference_id", command.invoiceId)
      .in("reference_type", ["invoice", "invoice_cogs", "invoice_reversal", "invoice_cogs_reversal", "invoice_inventory_reversal"])
    if (journalLookupError) throw new Error(journalLookupError.message || "Failed to load previous invoice journals")

    const journalIds = (existingJournals || []).map((journal: any) => journal.id).filter(Boolean)
    if (journalIds.length === 0) return

    const { error: linesError } = await this.adminSupabase.from("journal_entry_lines").delete().in("journal_entry_id", journalIds)
    if (linesError) throw new Error(linesError.message || "Failed to delete previous invoice journal lines")

    const { error: entriesError } = await this.adminSupabase.from("journal_entries").delete().in("id", journalIds)
    if (entriesError) throw new Error(entriesError.message || "Failed to delete previous invoice journal entries")
  }

  private async postInventoryOnly(
    command: SalesInvoiceUpdateCommand,
    invoice: any,
    governance: { branch_id: string | null; warehouse_id: string | null; cost_center_id: string | null }
  ): Promise<string[]> {
    const productIds = command.items.map((item) => item.product_id).filter(Boolean)
    if (productIds.length === 0) return []

    const { data: productsInfo, error: productsError } = await this.adminSupabase
      .from("products")
      .select("id, item_type")
      .in("id", productIds)
    if (productsError) throw new Error(productsError.message || "Failed to load invoice products")

    const productItems = command.items.filter((item) => {
      const product = (productsInfo || []).find((row: any) => row.id === item.product_id)
      return item.product_id && (!product || product.item_type !== "service")
    })
    if (productItems.length === 0) return []

    const shippingValidation = await validateShippingProvider(this.adminSupabase as never, command.invoiceId)
    if (shippingValidation.valid && shippingValidation.shippingProviderId) {
      return []
    }

    const rows = productItems.map((item) => ({
      company_id: command.companyId,
      product_id: item.product_id,
      transaction_type: "sale",
      quantity_change: -Number(item.quantity || 0),
      reference_id: command.invoiceId,
      journal_entry_id: null,
      notes: `خصم مخزون للفاتورة ${invoice.invoice_number || ""} (بدون شحن)`,
      branch_id: governance.branch_id,
      cost_center_id: governance.cost_center_id,
      warehouse_id: governance.warehouse_id,
    }))

    const { data, error } = await this.adminSupabase.from("inventory_transactions").insert(rows).select("id")
    if (error) throw new Error(error.message || "Failed to create invoice inventory transactions")
    return (data || []).map((row: any) => String(row.id)).filter(Boolean)
  }

  private async recalculatePaymentStatus(companyId: string, invoiceId: string, totalAmount: number, previousStatus: string | null) {
    const { data: payments, error: paymentsError } = await this.adminSupabase
      .from("payments")
      .select("amount")
      .eq("invoice_id", invoiceId)
    if (paymentsError) throw new Error(paymentsError.message || "Failed to recalculate invoice payments")

    const totalPaid = (payments || []).reduce((sum: number, payment: any) => sum + Number(payment.amount || 0), 0)
    let nextStatus = previousStatus === "draft" ? "draft" : "sent"
    if (totalPaid > 0 && totalPaid >= totalAmount) {
      nextStatus = "paid"
    } else if (totalPaid > 0) {
      nextStatus = "partially_paid"
    }

    const { error } = await this.adminSupabase
      .from("invoices")
      .update({ paid_amount: totalPaid, status: nextStatus })
      .eq("id", invoiceId)
      .eq("company_id", companyId)
    if (error) throw new Error(error.message || "Failed to update invoice payment status")
  }

  private async syncLinkedSalesOrder(command: SalesInvoiceUpdateCommand, salesOrderId: string) {
    const { data: invoice, error: invoiceError } = await this.adminSupabase
      .from("invoices")
      .select("sales_order_id, customer_id, invoice_date, due_date, subtotal, tax_amount, total_amount, discount_type, discount_value, discount_position, tax_inclusive, shipping, shipping_tax_rate, adjustment, currency_code, exchange_rate, shipping_provider_id")
      .eq("id", command.invoiceId)
      .eq("company_id", command.companyId)
      .maybeSingle()
    if (invoiceError) throw new Error(invoiceError.message || "Failed to load invoice for sales order sync")
    if (!invoice?.sales_order_id) return

    const { error: orderError } = await this.adminSupabase
      .from("sales_orders")
      .update({
        customer_id: invoice.customer_id,
        so_date: invoice.invoice_date,
        due_date: invoice.due_date,
        subtotal: invoice.subtotal,
        tax_amount: invoice.tax_amount,
        total: invoice.total_amount,
        total_amount: invoice.total_amount,
        discount_type: invoice.discount_type,
        discount_value: invoice.discount_value,
        discount_position: invoice.discount_position,
        tax_inclusive: invoice.tax_inclusive,
        shipping: invoice.shipping,
        shipping_tax_rate: invoice.shipping_tax_rate,
        shipping_provider_id: invoice.shipping_provider_id,
        adjustment: invoice.adjustment,
        currency: invoice.currency_code,
        exchange_rate: invoice.exchange_rate,
        updated_at: new Date().toISOString(),
      })
      .eq("id", salesOrderId)
      .eq("company_id", command.companyId)
    if (orderError) throw new Error(orderError.message || "Failed to sync linked sales order")

    const { error: deleteError } = await this.adminSupabase
      .from("sales_order_items")
      .delete()
      .eq("sales_order_id", salesOrderId)
    if (deleteError) throw new Error(deleteError.message || "Failed to delete linked sales order items")

    const rows = command.items.map((item) => ({
      sales_order_id: salesOrderId,
      product_id: item.product_id,
      description: "",
      quantity: item.quantity,
      unit_price: item.unit_price,
      tax_rate: item.tax_rate,
      discount_percent: Number(item.discount_percent || 0),
      line_total: item.quantity * item.unit_price * (1 - Number(item.discount_percent || 0) / 100),
      item_type: item.item_type || "product",
    }))
    if (rows.length === 0) return

    const { error: insertError } = await this.adminSupabase.from("sales_order_items").insert(rows)
    if (insertError) throw new Error(insertError.message || "Failed to insert linked sales order items")
  }

  private async resolveGovernance(command: SalesInvoiceUpdateCommand) {
    let branchId = command.branch_id || null
    let warehouseId = command.warehouse_id || null
    let costCenterId = command.cost_center_id || null

    if (!branchId && warehouseId) {
      const { data: warehouse, error } = await this.adminSupabase
        .from("warehouses")
        .select("branch_id")
        .eq("company_id", command.companyId)
        .eq("id", warehouseId)
        .maybeSingle()
      if (error) throw new Error(error.message || "Failed to resolve invoice warehouse branch")
      branchId = warehouse?.branch_id || null
    }

    if (branchId && (!warehouseId || !costCenterId)) {
      const defaults = await getBranchDefaults(this.adminSupabase as never, branchId)
      if (!warehouseId) warehouseId = defaults.default_warehouse_id
      if (!costCenterId) costCenterId = defaults.default_cost_center_id
    }

    return { branch_id: branchId, warehouse_id: warehouseId, cost_center_id: costCenterId }
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
      throw new Error(error.message || "Failed to create invoice update trace")
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
      .eq("event_type", SALES_INVOICE_UPDATE_EVENT)
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle()
    if (error || !data) return null
    return data as TraceRecord
  }

  private async findLinkedEntityId(traceId: string, entityType: string): Promise<string | null> {
    const ids = await this.findLinkedEntityIds(traceId, entityType)
    return ids[0] || null
  }

  private async findLinkedEntityIds(traceId: string, entityType: string): Promise<string[]> {
    const { data, error } = await this.adminSupabase
      .from("financial_operation_trace_links")
      .select("entity_id")
      .eq("transaction_id", traceId)
      .eq("entity_type", entityType)
      .order("created_at", { ascending: true })
    if (error || !data) return []
    return data.map((row: any) => String(row.entity_id)).filter(Boolean)
  }
}

export { SALES_INVOICE_UPDATE_EVENT }
