import { requireOpenFinancialPeriod } from "@/lib/core/security/financial-lock-guard"
import { checkInventoryAvailability } from "@/lib/inventory-check"
import { validateShippingProvider } from "@/lib/third-party-inventory"

const SALES_INVOICE_EDIT_EVENT = "sales_invoice_edit_command"

type SupabaseLike = any
type TraceRecord = { transaction_id: string; request_hash: string | null }

export type SalesInvoiceEditItem = {
  id?: string | null
  product_id: string
  quantity: number
  unit_price: number
  tax_rate: number
  discount_percent?: number | null
  returned_quantity?: number | null
  item_type?: string | null
}

export type SalesInvoiceEditCommand = {
  companyId: string
  invoiceId: string
  customerId: string
  invoiceDate: string
  dueDate: string
  totals: {
    subtotal: number
    tax: number
    total: number
  }
  taxInclusive: boolean
  discountType: "amount" | "percent"
  discountValue: number
  discountPosition: "before_tax" | "after_tax"
  shipping: number
  shippingTaxRate: number
  shippingProviderId?: string | null
  adjustment: number
  branchId?: string | null
  costCenterId?: string | null
  warehouseId?: string | null
  items: SalesInvoiceEditItem[]
  uiSurface?: string | null
}

export type SalesInvoiceEditActor = {
  actorId: string
  actorRole: string
  actorBranchId?: string | null
  actorCostCenterId?: string | null
  actorWarehouseId?: string | null
}

export type SalesInvoiceEditResult = {
  success: boolean
  cached: boolean
  invoiceId: string
  status: string | null
  transactionId: string | null
  eventType: typeof SALES_INVOICE_EDIT_EVENT
}

const PRIVILEGED_ROLES = new Set(["owner", "admin", "manager", "general_manager"])
const normalizeRole = (role: string | null | undefined) => String(role || "").trim().toLowerCase()
const duplicateTrace = (message?: string | null) =>
  !!message && (message.includes("duplicate key value violates unique constraint") || message.includes("idx_financial_operation_traces_idempotency"))

export class SalesInvoiceEditCommandService {
  constructor(private readonly adminSupabase: SupabaseLike) {}

  async updateInvoice(
    actor: SalesInvoiceEditActor,
    command: SalesInvoiceEditCommand,
    options: { idempotencyKey: string; requestHash: string }
  ): Promise<SalesInvoiceEditResult> {
    if (!command.companyId) throw new Error("Company is required")
    if (!command.invoiceId) throw new Error("Invoice is required")
    if (!command.customerId) throw new Error("Customer is required")
    if (!command.invoiceDate) throw new Error("Invoice date is required")
    if (!command.items.length) throw new Error("Invoice items are required")
    if (!command.shippingProviderId) throw new Error("Shipping provider is required")

    const existingTrace = await this.findTraceByIdempotency(command.companyId, options.idempotencyKey)
    if (existingTrace) {
      if (existingTrace.request_hash && existingTrace.request_hash !== options.requestHash) {
        throw new Error("Idempotency key already used with a different invoice edit payload")
      }
      const invoice = await this.loadInvoice(command.companyId, command.invoiceId)
      return {
        success: true,
        cached: true,
        invoiceId: command.invoiceId,
        status: invoice?.status || null,
        transactionId: existingTrace.transaction_id,
        eventType: SALES_INVOICE_EDIT_EVENT,
      }
    }

    const invoice = await this.loadInvoice(command.companyId, command.invoiceId)
    if (!invoice) throw new Error("Invoice was not found")
    if (invoice.status === "paid" || invoice.status === "partially_paid") {
      throw new Error("This invoice has payments. Please create a return or credit note instead.")
    }

    const isPrivileged = PRIVILEGED_ROLES.has(normalizeRole(actor.actorRole))
    if (!isPrivileged && actor.actorBranchId && invoice.branch_id && actor.actorBranchId !== invoice.branch_id) {
      throw new Error("You do not have permission to update this invoice")
    }

    await requireOpenFinancialPeriod(command.companyId, command.invoiceDate)

    if (invoice.status !== "draft") {
      const availability = await checkInventoryAvailability(
        this.adminSupabase,
        command.items.map((item) => ({ product_id: item.product_id, quantity: Number(item.quantity || 0) })),
        command.invoiceId,
        {
          company_id: command.companyId,
          branch_id: command.branchId || actor.actorBranchId || null,
          warehouse_id: command.warehouseId || actor.actorWarehouseId || null,
          cost_center_id: command.costCenterId || actor.actorCostCenterId || null,
        }
      )
      if (!availability.success) {
        throw new Error(`Insufficient inventory for ${availability.shortages.length} item(s)`)
      }
    }

    await this.updateInvoiceCore(command)
    await this.replaceInvoiceItems(command)
    await this.deletePreviousPostings(command)

    if (invoice.status === "sent") {
      await this.postInventoryOnly(command, invoice)
    }

    const status = await this.recalculatePaymentStatus(command, invoice.status)
    await this.syncLinkedSalesOrder(command)

    const traceId = await this.createTrace({
      companyId: command.companyId,
      sourceEntity: "invoice",
      sourceId: command.invoiceId,
      eventType: SALES_INVOICE_EDIT_EVENT,
      actorId: actor.actorId,
      idempotencyKey: options.idempotencyKey,
      requestHash: options.requestHash,
      metadata: {
        invoice_id: command.invoiceId,
        invoice_number: invoice.invoice_number || null,
        previous_status: invoice.status || null,
        new_status: status,
        items_count: command.items.length,
        branch_id: command.branchId || null,
        warehouse_id: command.warehouseId || null,
        cost_center_id: command.costCenterId || null,
        ui_surface: command.uiSurface || "invoice_edit_page",
      },
    })
    await this.linkTrace(traceId, "invoice", command.invoiceId, "edited_invoice", "invoice_edit")

    return {
      success: true,
      cached: false,
      invoiceId: command.invoiceId,
      status,
      transactionId: traceId,
      eventType: SALES_INVOICE_EDIT_EVENT,
    }
  }

  private async updateInvoiceCore(command: SalesInvoiceEditCommand) {
    const { error } = await this.adminSupabase
      .from("invoices")
      .update({
        customer_id: command.customerId,
        invoice_date: command.invoiceDate,
        due_date: command.dueDate,
        subtotal: command.totals.subtotal,
        tax_amount: command.totals.tax,
        total_amount: command.totals.total,
        original_subtotal: command.totals.subtotal,
        original_tax_amount: command.totals.tax,
        original_total: command.totals.total,
        discount_type: command.discountType,
        discount_value: Math.max(0, Number(command.discountValue || 0)),
        discount_position: command.discountPosition,
        tax_inclusive: !!command.taxInclusive,
        shipping: Math.max(0, Number(command.shipping || 0)),
        shipping_tax_rate: Math.max(0, Number(command.shippingTaxRate || 0)),
        shipping_provider_id: command.shippingProviderId || null,
        adjustment: Number(command.adjustment || 0),
        branch_id: command.branchId || null,
        cost_center_id: command.costCenterId || null,
        warehouse_id: command.warehouseId || null,
      })
      .eq("id", command.invoiceId)
      .eq("company_id", command.companyId)
    if (error) throw new Error(error.message || "Failed to update invoice")
  }

  private async replaceInvoiceItems(command: SalesInvoiceEditCommand) {
    const { error: deleteError } = await this.adminSupabase
      .from("invoice_items")
      .delete()
      .eq("invoice_id", command.invoiceId)
    if (deleteError) throw new Error(deleteError.message || "Failed to delete invoice items")

    const itemsToInsert = command.items.map((item) => {
      const rateFactor = 1 + Number(item.tax_rate || 0) / 100
      const discountFactor = 1 - Number(item.discount_percent || 0) / 100
      const base = Number(item.quantity || 0) * Number(item.unit_price || 0) * discountFactor
      const netLine = command.taxInclusive ? base / rateFactor : base
      return {
        invoice_id: command.invoiceId,
        product_id: item.product_id,
        quantity: Number(item.quantity || 0),
        unit_price: Number(item.unit_price || 0),
        tax_rate: Number(item.tax_rate || 0),
        discount_percent: Number(item.discount_percent || 0),
        line_total: netLine,
        returned_quantity: Number(item.returned_quantity || 0),
      }
    })

    const { error: insertError } = await this.adminSupabase.from("invoice_items").insert(itemsToInsert)
    if (insertError) throw new Error(insertError.message || "Failed to insert invoice items")
  }

  private async deletePreviousPostings(command: SalesInvoiceEditCommand) {
    const { data: existingTx, error: txError } = await this.adminSupabase
      .from("inventory_transactions")
      .select("id")
      .eq("company_id", command.companyId)
      .eq("branch_id", command.branchId)
      .eq("warehouse_id", command.warehouseId)
      .eq("cost_center_id", command.costCenterId)
      .eq("reference_id", command.invoiceId)
    if (txError) throw new Error(txError.message || "Failed to load previous inventory postings")

    if ((existingTx || []).length > 0) {
      const { error: deleteTxError } = await this.adminSupabase
        .from("inventory_transactions")
        .delete()
        .eq("company_id", command.companyId)
        .eq("branch_id", command.branchId)
        .eq("warehouse_id", command.warehouseId)
        .eq("cost_center_id", command.costCenterId)
        .eq("reference_id", command.invoiceId)
      if (deleteTxError) throw new Error(deleteTxError.message || "Failed to delete previous inventory postings")
    }

    const { data: existingJournals, error: journalsError } = await this.adminSupabase
      .from("journal_entries")
      .select("id")
      .eq("reference_id", command.invoiceId)
      .in("reference_type", ["invoice", "invoice_cogs", "invoice_reversal", "invoice_cogs_reversal", "invoice_inventory_reversal"])
    if (journalsError) throw new Error(journalsError.message || "Failed to load previous invoice journals")

    const journalIds = (existingJournals || []).map((journal: any) => journal.id).filter(Boolean)
    if (journalIds.length > 0) {
      const { error: linesError } = await this.adminSupabase.from("journal_entry_lines").delete().in("journal_entry_id", journalIds)
      if (linesError) throw new Error(linesError.message || "Failed to delete previous invoice journal lines")
      const { error: entriesError } = await this.adminSupabase.from("journal_entries").delete().in("id", journalIds)
      if (entriesError) throw new Error(entriesError.message || "Failed to delete previous invoice journals")
    }
  }

  private async postInventoryOnly(command: SalesInvoiceEditCommand, invoice: any) {
    const productIds = command.items.map((item) => item.product_id).filter(Boolean)
    if (productIds.length === 0) return

    const shippingValidation = await validateShippingProvider(this.adminSupabase, command.invoiceId)
    if (shippingValidation.valid && shippingValidation.shippingProviderId) return

    const { data: productsInfo, error } = await this.adminSupabase
      .from("products")
      .select("id, item_type")
      .in("id", productIds)
    if (error) throw new Error(error.message || "Failed to load invoice item products")

    const productItems = command.items.filter((item) => {
      const product = (productsInfo || []).find((row: any) => row.id === item.product_id)
      return item.product_id && (!product || product.item_type !== "service")
    })

    const invTx = productItems.map((item) => ({
      company_id: command.companyId,
      product_id: item.product_id,
      transaction_type: "sale",
      quantity_change: -Number(item.quantity || 0),
      reference_id: command.invoiceId,
      journal_entry_id: null,
      notes: `خصم مخزون للفاتورة ${invoice.invoice_number || ""} (بدون شحن)`,
      branch_id: command.branchId || null,
      cost_center_id: command.costCenterId || null,
      warehouse_id: command.warehouseId || null,
    }))

    if (invTx.length > 0) {
      const { error: insertError } = await this.adminSupabase.from("inventory_transactions").insert(invTx)
      if (insertError) throw new Error(insertError.message || "Failed to post invoice inventory transaction")
    }
  }

  private async recalculatePaymentStatus(command: SalesInvoiceEditCommand, previousStatus: string | null) {
    const { data: payments, error } = await this.adminSupabase
      .from("payments")
      .select("amount")
      .eq("invoice_id", command.invoiceId)
    if (error) throw new Error(error.message || "Failed to recalculate invoice payment status")

    const totalPaid = (payments || []).reduce((sum: number, payment: any) => sum + Number(payment.amount || 0), 0)
    let newStatus = previousStatus === "draft" ? "draft" : "sent"
    if (totalPaid >= command.totals.total && totalPaid > 0) newStatus = "paid"
    else if (totalPaid > 0) newStatus = "partially_paid"

    const { error: updateError } = await this.adminSupabase
      .from("invoices")
      .update({ paid_amount: totalPaid, status: newStatus })
      .eq("id", command.invoiceId)
      .eq("company_id", command.companyId)
    if (updateError) throw new Error(updateError.message || "Failed to update invoice payment status")
    return newStatus
  }

  private async syncLinkedSalesOrder(command: SalesInvoiceEditCommand) {
    const { data: invoice, error } = await this.adminSupabase
      .from("invoices")
      .select("sales_order_id, customer_id, invoice_date, due_date, subtotal, tax_amount, total_amount, discount_type, discount_value, discount_position, tax_inclusive, shipping, shipping_tax_rate, adjustment, currency_code, exchange_rate, shipping_provider_id")
      .eq("id", command.invoiceId)
      .eq("company_id", command.companyId)
      .single()
    if (error) throw new Error(error.message || "Failed to load invoice for sales order sync")
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
      .eq("id", invoice.sales_order_id)
      .eq("company_id", command.companyId)
    if (orderError) throw new Error(orderError.message || "Failed to sync linked sales order")

    const { error: deleteItemsError } = await this.adminSupabase
      .from("sales_order_items")
      .delete()
      .eq("sales_order_id", invoice.sales_order_id)
    if (deleteItemsError) throw new Error(deleteItemsError.message || "Failed to delete linked sales order items")

    const orderItems = command.items.map((item) => ({
      sales_order_id: invoice.sales_order_id,
      product_id: item.product_id,
      description: "",
      quantity: Number(item.quantity || 0),
      unit_price: Number(item.unit_price || 0),
      tax_rate: Number(item.tax_rate || 0),
      discount_percent: Number(item.discount_percent || 0),
      line_total: Number(item.quantity || 0) * Number(item.unit_price || 0) * (1 - Number(item.discount_percent || 0) / 100),
      item_type: item.item_type || "product",
    }))

    if (orderItems.length > 0) {
      const { error: insertItemsError } = await this.adminSupabase.from("sales_order_items").insert(orderItems)
      if (insertItemsError) throw new Error(insertItemsError.message || "Failed to insert linked sales order items")
    }
  }

  private async loadInvoice(companyId: string, invoiceId: string) {
    const { data, error } = await this.adminSupabase
      .from("invoices")
      .select("id, invoice_number, invoice_date, status, branch_id, warehouse_id, cost_center_id")
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
      throw new Error(error.message || "Failed to create invoice edit trace")
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
      .eq("event_type", SALES_INVOICE_EDIT_EVENT)
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle()
    if (error || !data) return null
    return data as TraceRecord
  }
}

export { SALES_INVOICE_EDIT_EVENT }
