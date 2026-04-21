
import { SupabaseClient } from '@supabase/supabase-js'
import { prepareInvoiceRevenueJournal, prepareCOGSJournalOnDelivery } from './accrual-accounting-engine'
import { prepareFIFOConsumptionData } from './fifo-engine'
import { enterpriseFinanceFlags } from './enterprise-finance-flags'

export interface AtomicTransactionResult {
    success: boolean
    journalEntryIds?: string[]
    inventoryTransactionIds?: string[]
    cogsTransactionIds?: string[]
    payment_ids?: string[]
    returnIds?: string[]
    creditIds?: string[]
    thirdPartyInventoryIds?: string[]
    customerCreditLedgerIds?: string[]
    transactionId?: string
    sourceEntity?: string
    sourceId?: string
    eventType?: string
    error?: string
}

/**
 * خدمة المعاملات المحاسبية الذرية
 * Atomic Accounting Transaction Service
 * 
 * الهدف: ضمان أن جميع العمليات (المخزون، التكلفة، القيود) تتم كحزمة واحدة
 * إما أن تنجح كلها أو تفشل كلها (All or Nothing)
 */
export class AccountingTransactionService {
    constructor(private supabase: SupabaseClient) { }

    private isAmbiguousPostAccountingEventError(message?: string | null): boolean {
        if (!message) return false
        return (
            message.includes('Could not choose the best candidate function between') &&
            message.includes('post_accounting_event')
        )
    }

    private async executeRpcWithV2Fallback(
        primaryRpcName: string,
        primaryRpcParams: Record<string, any>,
        fallback?: {
            rpcName: string
            rpcParams: Record<string, any>
            reasonLabel: string
        }
    ) {
        const primaryResult = await this.supabase.rpc(primaryRpcName as any, primaryRpcParams)

        if (!primaryResult.error || !fallback) {
            return primaryResult
        }

        if (!this.isAmbiguousPostAccountingEventError(primaryResult.error.message)) {
            return primaryResult
        }

        console.warn(
            `[AccountingTransactionService] Ambiguous legacy RPC during ${fallback.reasonLabel}. Retrying with ${fallback.rpcName}.`
        )

        return await this.supabase.rpc(fallback.rpcName as any, fallback.rpcParams)
    }

    /**
     * ترحيل فاتورة المبيعات (Atomic Posting)
     * 1. تحضير قيد الإيراد
     * 2. تحضير استهلاك FIFO (المخزون + التكلفة) - إذا لم يتم الخصم مسبقاً
     * 3. تحضير قيد التكلفة (COGS)
     * 4. إرسال الكل في معاملة واحدة RPC
     */
    async postInvoiceAtomic(
        invoiceId: string,
        companyId: string,
        currentUserId?: string,
        options?: { idempotencyKey?: string; requestHash?: string }
    ): Promise<AtomicTransactionResult> {
        try {
            console.log(`Starting atomic posting for invoice: ${invoiceId}`)

            // 1. الحصول على تفاصيل الفاتورة لتحديد المنتجات
            const { data: invoiceItems, error: itemsError } = await this.supabase
                .from('invoice_items')
                .select(`
           product_id, quantity,
           invoices!inner (
             branch_id, cost_center_id, warehouse_id, status, invoice_date, shipping_provider_id
           )
        `)
                .eq('invoice_id', invoiceId)

            if (itemsError) throw new Error(`Error fetching invoice items: ${itemsError.message}`)
            if (!invoiceItems || invoiceItems.length === 0) throw new Error('Invoice has no items')

            const invoiceData = invoiceItems[0].invoices as any

            // 2. تحضير قيد الإيراد (Revenue Journal)
            // التحقق من وجود قيد إيراد سابق لهذه الفاتورة
            const { data: existingRevenue } = await this.supabase
                .from('journal_entries')
                .select('id')
                .eq('reference_id', invoiceId)
                .eq('reference_type', 'invoice')
                .maybeSingle()

            let revenueJournal = null
            if (!existingRevenue) {
                revenueJournal = await prepareInvoiceRevenueJournal(this.supabase, invoiceId, companyId, {
                    allowDraft: true,
                })
                if (!revenueJournal && invoiceData.status === 'draft') {
                    // قد يكون طبيعياً للفواتير المسودة
                    console.warn('Revenue journal not prepared (possibly draft)')
                }
            } else {
                console.log('Revenue journal already exists. Skipping creation.')
            }

            // 3. تحضير حركات المخزون واستهلاك FIFO
            // التحقق هل تم خصم المخزون مسبقاً؟ (مثلاً عند status = sent)
            const { data: existingInvTx } = await this.supabase
                .from('inventory_transactions')
                .select('id')
                .eq('reference_id', invoiceId)
                .eq('transaction_type', 'sale')
                .limit(1)

            const inventoryAlreadyDeducted = existingInvTx && existingInvTx.length > 0

            let allInventoryTx: any[] = []
            let allFifoConsumptions: any[] = []
            let allCogsTx: any[] = []
            let totalTransactionCOGS = 0

            const requiresWarehouseApproval = !!invoiceData.shipping_provider_id;

            if (requiresWarehouseApproval) {
                console.log('Invoice requires warehouse approval (shipping provider assigned). Skipping direct inventory deduction and COGS in postInvoiceAtomic.')
                // Inventory will be formally deducted when Warehouse Manager approves via `approve_sales_delivery` RPC.
            } else if (inventoryAlreadyDeducted) {
                console.log('Inventory already deducted. Skipping FIFO calculation and using existing COGS.')
                // جلب إجمالي COGS من cogs_transactions المسجلة سابقاً
                const { data: cogsData, error: cogsError } = await this.supabase
                    .from('cogs_transactions')
                    .select('total_cost')
                    .eq('source_id', invoiceId)
                    .eq('source_type', 'invoice')

                if (cogsError) throw new Error(`Error fetching existing COGS: ${cogsError.message}`)

                totalTransactionCOGS = (cogsData || []).reduce((sum, item) => sum + Number(item.total_cost || 0), 0)

            } else {
                // لم يتم الخصم - نحسب FIFO الآن
                for (const item of invoiceItems) {
                    // تخطي المنتجات الخدمية (غير المخزنية) - يمكن التحقق من نوع المنتج هنا
                    // سنفترض مؤقتاً أن كل البنود في invoice_items هي منتجات مخزنية

                    const fifoResult = await prepareFIFOConsumptionData(this.supabase, {
                        companyId,
                        branchId: invoiceData.branch_id,
                        costCenterId: invoiceData.cost_center_id,
                        warehouseId: invoiceData.warehouse_id || '',
                        productId: item.product_id,
                        quantity: item.quantity,
                        sourceType: 'invoice',
                        sourceId: invoiceId,
                        transactionDate: invoiceData.invoice_date,
                        createdByUserId: currentUserId
                    })

                    if (!fifoResult.success) {
                        throw new Error(`FIFO Error for product ${item.product_id}: ${fifoResult.error}`)
                    }

                    allInventoryTx.push(...fifoResult.inventoryTransactions)
                    allFifoConsumptions.push(...fifoResult.fifoConsumptions)
                    allCogsTx.push(...fifoResult.cogsTransactions)
                    totalTransactionCOGS += fifoResult.totalCOGS
                }
            }

            // 4. تحضير قيد التكلفة (COGS Journal)
            // في النظام القديم (Cash Basis) لم يكن هناك قيد COGS
            const { data: existingCOGSJournal } = await this.supabase
                .from('journal_entries')
                .select('id')
                .eq('reference_id', invoiceId)
                .eq('reference_type', 'invoice_cogs')
                .maybeSingle()

            let cogsJournal = null
            if (!requiresWarehouseApproval && !existingCOGSJournal && totalTransactionCOGS > 0) {
                cogsJournal = await prepareCOGSJournalOnDelivery(
                    this.supabase,
                    invoiceId,
                    companyId,
                    totalTransactionCOGS,
                    { allowDraft: true }
                )
            }

            // تجميع القيود المحاسبية
            const journalEntries = []
            if (revenueJournal) journalEntries.push(revenueJournal)
            if (cogsJournal) journalEntries.push(cogsJournal)

            if (journalEntries.length === 0 && allInventoryTx.length === 0) {
                // لا يوجد شيء لفعله، ولكن قد نحتاج لتحديث الحالة فقط؟
                // سنرسل طلب فارغ (تحديث الحالة فقط)
                console.log('No accounting entries needed. Proceeding to update status only.')
            }

            // 5. التنفيذ الذري (Atomic Commit via RPC)
            const v2RpcParams = {
                p_company_id: companyId,
                p_invoice_id: invoiceId,
                p_inventory_transactions: allInventoryTx,
                p_cogs_transactions: allCogsTx,
                p_fifo_consumptions: allFifoConsumptions,
                p_journal_entries: journalEntries,
                p_update_source: { id: invoiceId, status: 'sent' },
                p_effective_date: invoiceData.invoice_date,
                p_actor_id: currentUserId || null,
                p_idempotency_key: options?.idempotencyKey || null,
                p_request_hash: options?.requestHash || null,
                p_trace_metadata: {
                    requiresWarehouseApproval,
                    inventoryAlreadyDeducted,
                },
            }

            const legacyRpcParams = {
                p_event_type: 'invoice_posting',
                p_company_id: companyId,
                p_inventory_transactions: allInventoryTx,
                p_cogs_transactions: allCogsTx,
                p_fifo_consumptions: allFifoConsumptions,
                p_journal_entries: journalEntries,
                p_update_source: { id: invoiceId, status: 'sent' }
            }

            const { data: rpcResult, error: rpcError } = await this.executeRpcWithV2Fallback(
                enterpriseFinanceFlags.invoicePostV2 ? 'post_invoice_atomic_v2' : 'post_accounting_event',
                enterpriseFinanceFlags.invoicePostV2 ? v2RpcParams : legacyRpcParams,
                enterpriseFinanceFlags.invoicePostV2
                    ? undefined
                    : {
                        rpcName: 'post_invoice_atomic_v2',
                        rpcParams: v2RpcParams,
                        reasonLabel: 'invoice posting',
                    }
            )

            if (rpcError) {
                throw new Error(`RPC Execution Failed: ${rpcError.message}`)
            }

            const result = (rpcResult || {}) as any

            return {
                success: true,
                journalEntryIds: result.journal_entry_ids,
                inventoryTransactionIds: result.inventory_transaction_ids,
                cogsTransactionIds: result.cogs_transaction_ids,
                transactionId: result.transaction_id,
                sourceEntity: result.source_entity,
                sourceId: result.source_id,
                eventType: result.event_type,
            }

        } catch (error: any) {
            console.error('Atomic Posting Error:', error)
            return {
                success: false,
                error: error.message
            }
        }
    }

    /**
     * تسجيل دفعة جديدة ذرياً (Atomic Payment)
     * 1. تحضير قيد الدفع
     * 2. إرسال الدفعة + قيد الدفع في معاملة واحدة RPC
     */
    async postPaymentAtomic(
        paymentData: {
            company_id: string
            branch_id: string
            cost_center_id: string
            warehouse_id: string
            invoice_id: string
            customer_id: string
            amount: number
            payment_date: string
            payment_method: string
            reference: string
            notes: string
            account_id?: string // حساب النقد/البنك المختار
        },
        currentUserId?: string,
        options?: { idempotencyKey?: string; requestHash?: string }
    ): Promise<AtomicTransactionResult> {
        try {
            console.log(`Starting atomic payment posting for invoice: ${paymentData.invoice_id}`)

            // استيراد دالة التحضير ديناميكياً
            const { preparePaymentJournalFromData } = await import('./accrual-accounting-engine')

            // 1. تحضير ID الدفعة وتجهيز البيانات
            // ملاحظة: crypto.randomUUID() متاح في معظم بيئات الحديثة Node/Browser
            const paymentId = crypto.randomUUID()
            const paymentWithId = { ...paymentData, id: paymentId, created_by_user_id: currentUserId }

            // 2. تحضير قيد الدفع
            const journalEntry = await preparePaymentJournalFromData(
                this.supabase,
                paymentWithId,
                paymentData.company_id
            )

            if (!journalEntry) {
                throw new Error('Failed to prepare payment journal')
            }

            const v2RpcParams = {
                p_event_type: 'payment_posting',
                p_company_id: paymentData.company_id,
                p_payments: [paymentWithId],
                p_journal_entries: [journalEntry],
                p_source_entity: 'payment',
                p_source_id: paymentId,
                p_effective_date: paymentData.payment_date,
                p_actor_id: currentUserId || null,
                p_idempotency_key: options?.idempotencyKey || null,
                p_request_hash: options?.requestHash || null,
                p_trace_metadata: {
                    invoice_id: paymentData.invoice_id,
                    payment_method: paymentData.payment_method,
                },
            }

            const legacyRpcParams = {
                p_event_type: 'payment_posting',
                p_company_id: paymentData.company_id,
                p_payments: [paymentWithId],
                p_journal_entries: [journalEntry]
            }

            // 3. التنفيذ الذري
            const { data: rpcResult, error: rpcError } = await this.executeRpcWithV2Fallback(
                enterpriseFinanceFlags.paymentV2 ? 'post_accounting_event_v2' : 'post_accounting_event',
                enterpriseFinanceFlags.paymentV2 ? v2RpcParams : legacyRpcParams,
                enterpriseFinanceFlags.paymentV2
                    ? undefined
                    : {
                        rpcName: 'post_accounting_event_v2',
                        rpcParams: v2RpcParams,
                        reasonLabel: 'invoice payment posting',
                    }
            )

            if (rpcError) {
                throw new Error(`RPC Execution Failed (Payment): ${rpcError.message}`)
            }

            const result = (rpcResult || {}) as any

            return {
                success: true,
                payment_ids: result.payment_ids,
                journalEntryIds: result.journal_entry_ids,
                transactionId: result.transaction_id,
                sourceEntity: result.source_entity,
                sourceId: result.source_id,
                eventType: result.event_type,
            }

        } catch (error: any) {
            console.error('Atomic Payment Error:', error)
            return {
                success: false,
                error: error.message
            }
        }
    }

    /**
     * اعتماد إخراج البضاعة ذرياً (Warehouse Approval)
     * المصدر المالي الحقيقي لخصم المخزون + FIFO + COGS + third_party_inventory
     */
    async approveSalesDeliveryAtomic(
        params: {
            invoiceId: string
            companyId: string
            confirmedBy: string
            notes?: string | null
        },
        options?: { idempotencyKey?: string; requestHash?: string }
    ): Promise<AtomicTransactionResult> {
        try {
            console.log(`Starting atomic warehouse approval for invoice: ${params.invoiceId}`)

            if (!enterpriseFinanceFlags.warehouseApprovalV2) {
                const { data, error } = await this.supabase.rpc('approve_sales_delivery', {
                    p_invoice_id: params.invoiceId,
                    p_confirmed_by: params.confirmedBy,
                    p_notes: params.notes || null,
                })

                if (error) {
                    throw new Error(error.message)
                }

                if (!data?.success) {
                    throw new Error(data?.error || 'Warehouse approval failed')
                }

                return {
                    success: true,
                    sourceEntity: 'invoice',
                    sourceId: params.invoiceId,
                    eventType: 'warehouse_approval',
                }
            }

            const { data: invoice, error: invoiceError } = await this.supabase
                .from('invoices')
                .select(`
                    id,
                    invoice_number,
                    invoice_date,
                    status,
                    warehouse_status,
                    company_id,
                    customer_id,
                    sales_order_id,
                    branch_id,
                    cost_center_id,
                    warehouse_id,
                    shipping_provider_id,
                    sales_orders!left (
                        id,
                        branch_id,
                        cost_center_id,
                        warehouse_id,
                        shipping_provider_id
                    )
                `)
                .eq('id', params.invoiceId)
                .eq('company_id', params.companyId)
                .maybeSingle()

            if (invoiceError || !invoice) {
                throw new Error(invoiceError?.message || 'Invoice not found')
            }

            if (invoice.warehouse_status !== 'pending') {
                throw new Error('Delivery already processed')
            }

            if (invoice.status !== 'sent' && invoice.status !== 'paid' && invoice.status !== 'partially_paid') {
                throw new Error('Invoice must be posted before warehouse dispatch')
            }

            const salesOrder = (invoice as any).sales_orders || {}
            const branchId = invoice.branch_id || salesOrder.branch_id
            const costCenterId = invoice.cost_center_id || salesOrder.cost_center_id
            const warehouseId = invoice.warehouse_id || salesOrder.warehouse_id
            const shippingProviderId = invoice.shipping_provider_id || salesOrder.shipping_provider_id

            if (!warehouseId || !branchId || !costCenterId) {
                throw new Error('Inventory governance context is missing for warehouse approval')
            }

            if (!shippingProviderId) {
                throw new Error('Shipping provider is required for warehouse approval')
            }

            const { data: invoiceItems, error: itemsError } = await this.supabase
                .from('invoice_items')
                .select(`
                    product_id,
                    quantity,
                    unit_price,
                    line_total,
                    products!inner (
                        id,
                        name,
                        cost_price,
                        item_type
                    )
                `)
                .eq('invoice_id', params.invoiceId)

            if (itemsError) {
                throw new Error(`Error fetching invoice items: ${itemsError.message}`)
            }

            const productItems = (invoiceItems || [])
                .map((item: any) => ({
                    ...item,
                    product: Array.isArray(item.products) ? item.products[0] : item.products,
                }))
                .filter((item: any) =>
                    item.product_id &&
                    Number(item.quantity || 0) > 0 &&
                    item.product?.item_type !== 'service'
                )

            const inventoryTransactions: any[] = []
            const cogsTransactions: any[] = []
            const fifoConsumptions: any[] = []
            const thirdPartyInventoryRecords: any[] = []
            const auditFlags = new Set<string>()
            let totalCOGS = 0

            for (const item of productItems) {
                const quantity = Number(item.quantity || 0)
                const productId = String(item.product_id)
                let itemInventoryTransactions: any[] = []
                let itemCogsTransactions: any[] = []
                let itemFifoConsumptions: any[] = []
                let itemTotalCost = 0
                let unitCost = 0

                const fifoResult = await prepareFIFOConsumptionData(this.supabase, {
                    companyId: params.companyId,
                    branchId,
                    costCenterId,
                    warehouseId,
                    productId,
                    quantity,
                    sourceType: 'invoice',
                    sourceId: params.invoiceId,
                    transactionDate: invoice.invoice_date,
                    createdByUserId: params.confirmedBy,
                })

                if (fifoResult.success) {
                    itemInventoryTransactions = fifoResult.inventoryTransactions || []
                    itemCogsTransactions = fifoResult.cogsTransactions || []
                    itemFifoConsumptions = fifoResult.fifoConsumptions || []
                    itemTotalCost = Number(fifoResult.totalCOGS || 0)
                    unitCost = quantity > 0 ? Number((itemTotalCost / quantity).toFixed(4)) : 0
                } else {
                    const fallbackUnitCost = Number(item.product?.cost_price || 0)
                    if (!enterpriseFinanceFlags.allowCostFallback || fallbackUnitCost <= 0) {
                        throw new Error(fifoResult.error || `FIFO cost is required for product ${productId}`)
                    }

                    auditFlags.add('COST_FALLBACK_USED')
                    unitCost = fallbackUnitCost
                    itemTotalCost = Number((unitCost * quantity).toFixed(4))

                    itemInventoryTransactions = [{
                        company_id: params.companyId,
                        branch_id: branchId,
                        warehouse_id: warehouseId,
                        cost_center_id: costCenterId,
                        product_id: productId,
                        transaction_type: 'sale',
                        quantity_change: -quantity,
                        reference_type: 'invoice',
                        reference_id: params.invoiceId,
                        notes: `Warehouse approval fallback cost for invoice ${invoice.invoice_number || params.invoiceId}`,
                        transaction_date: invoice.invoice_date,
                    }]

                    itemCogsTransactions = [{
                        company_id: params.companyId,
                        branch_id: branchId,
                        cost_center_id: costCenterId,
                        warehouse_id: warehouseId,
                        product_id: productId,
                        source_type: 'invoice',
                        source_id: params.invoiceId,
                        quantity,
                        unit_cost: unitCost,
                        total_cost: itemTotalCost,
                        transaction_date: invoice.invoice_date,
                        notes: 'COST_FALLBACK_USED',
                    }]
                }

                if (itemInventoryTransactions[0]) {
                    itemInventoryTransactions[0] = {
                        ...itemInventoryTransactions[0],
                        unit_cost: unitCost,
                        total_cost: itemTotalCost,
                        from_location_type: 'warehouse',
                        from_location_id: warehouseId,
                        to_location_type: 'third_party',
                        to_location_id: shippingProviderId,
                        shipping_provider_id: shippingProviderId,
                    }
                }

                inventoryTransactions.push(...itemInventoryTransactions)
                cogsTransactions.push(...itemCogsTransactions)
                fifoConsumptions.push(...itemFifoConsumptions)
                totalCOGS += itemTotalCost

                thirdPartyInventoryRecords.push({
                    company_id: params.companyId,
                    shipping_provider_id: shippingProviderId,
                    product_id: productId,
                    invoice_id: params.invoiceId,
                    quantity,
                    unit_cost: unitCost,
                    total_cost: itemTotalCost,
                    status: 'open',
                    branch_id: branchId,
                    cost_center_id: costCenterId,
                    warehouse_id: warehouseId,
                    customer_id: invoice.customer_id,
                    sales_order_id: invoice.sales_order_id,
                    notes: params.notes || 'Warehouse approval transfer',
                })
            }

            const { data: existingCOGSJournal } = await this.supabase
                .from('journal_entries')
                .select('id')
                .eq('reference_id', params.invoiceId)
                .eq('reference_type', 'invoice_cogs')
                .maybeSingle()

            const journalEntries: any[] = []
            if (!existingCOGSJournal && totalCOGS > 0) {
                const cogsJournal = await prepareCOGSJournalOnDelivery(
                    this.supabase,
                    params.invoiceId,
                    params.companyId,
                    totalCOGS
                )

                if (cogsJournal) {
                    journalEntries.push(cogsJournal)
                }
            }

            const { data: rpcResult, error: rpcError } = await this.supabase.rpc('approve_sales_delivery_v2', {
                p_company_id: params.companyId,
                p_invoice_id: params.invoiceId,
                p_confirmed_by: params.confirmedBy,
                p_inventory_transactions: inventoryTransactions,
                p_cogs_transactions: cogsTransactions,
                p_fifo_consumptions: fifoConsumptions,
                p_journal_entries: journalEntries,
                p_third_party_inventory_records: thirdPartyInventoryRecords,
                p_effective_date: invoice.invoice_date,
                p_notes: params.notes || null,
                p_idempotency_key: options?.idempotencyKey || null,
                p_request_hash: options?.requestHash || null,
                p_trace_metadata: {
                    invoice_number: invoice.invoice_number,
                    shipping_provider_id: shippingProviderId,
                    item_count: productItems.length,
                },
                p_audit_flags: Array.from(auditFlags),
            })

            if (rpcError) {
                throw new Error(`RPC Execution Failed (Warehouse Approval): ${rpcError.message}`)
            }

            const result = (rpcResult || {}) as any

            return {
                success: true,
                journalEntryIds: result.journal_entry_ids,
                inventoryTransactionIds: result.inventory_transaction_ids,
                cogsTransactionIds: result.cogs_transaction_ids,
                thirdPartyInventoryIds: result.third_party_inventory_ids,
                transactionId: result.transaction_id,
                sourceEntity: result.source_entity,
                sourceId: result.source_id,
                eventType: result.event_type,
            }
        } catch (error: any) {
            console.error('Atomic Warehouse Approval Error:', error)
            return {
                success: false,
                error: error.message,
            }
        }
    }
    /**
     * تنفيذ مرتجع مبيعات ذري (Atomic Sales Return)
     * يشمل:
     * 1. فواتير المرتجع (Sales Return Header & Items)
     * 2. حركات المخزون (Inventory Transactions)
     * 3. عكس استهلاك FIFO (FIFO Consumptions Reversal)
     * 4. عكس COGS (COGS Transactions Reversal)
     * 5. القيود المحاسبية (Journal Entries)
     * 6. أرصدة العملاء (Customer Credits)
     * 7. تحديث حالة الفاتورة والطلب (Update Invoice & Sales Order)
     */
    async postSalesReturnAtomic(
        params: {
            invoiceId: string
            invoiceNumber: string
            returnItems: any[]
            returnMode: 'partial' | 'full'
            companyId: string
            userId: string
            lang: 'ar' | 'en'
        },
        options?: {
            idempotencyKey?: string
            requestHash?: string
            salesReturnRequestId?: string
            traceMetadata?: Record<string, any>
        }
    ): Promise<AtomicTransactionResult> {
        try {
            console.log(`Starting atomic sales return for invoice: ${params.invoiceNumber}`)

            const { prepareSalesReturnData } = await import('./sales-returns')

            // 1. تحضير جميع البيانات
            const preparation = await prepareSalesReturnData(this.supabase, params)

            if (!preparation.success) {
                throw new Error(preparation.error || 'Failed to prepare sales return data')
            }

            // 2. تجميع القيود المحاسبية
            const journalEntries = []
            if (preparation.journalEntry) {
                journalEntries.push(preparation.journalEntry)
            }

            const v2RpcParams = {
                p_company_id: params.companyId,
                p_invoice_id: params.invoiceId,
                p_sales_return_request_id: options?.salesReturnRequestId || null,
                p_sales_returns: preparation.salesReturn ? [preparation.salesReturn] : [],
                p_sales_return_items: preparation.salesReturnItems || [],
                p_inventory_transactions: preparation.inventoryTransactions || [],
                p_cogs_transactions: preparation.cogsTransactions || [],
                p_fifo_consumptions: preparation.fifoConsumptions || [],
                p_journal_entries: journalEntries,
                p_customer_credits: preparation.customerCredits || [],
                p_customer_credit_ledger_entries: preparation.customerCreditLedgerEntries || [],
                p_update_source: preparation.updateSource,
                p_effective_date: preparation.salesReturn?.return_date || new Date().toISOString().slice(0, 10),
                p_actor_id: params.userId,
                p_idempotency_key: options?.idempotencyKey || null,
                p_request_hash: options?.requestHash || null,
                p_trace_metadata: {
                    invoice_number: params.invoiceNumber,
                    return_mode: params.returnMode,
                    items_count: params.returnItems.length,
                    ...(options?.traceMetadata || {}),
                },
            }

            const legacyRpcParams = {
                p_event_type: 'return',
                p_company_id: params.companyId,
                p_sales_returns: preparation.salesReturn ? [preparation.salesReturn] : [],
                p_sales_return_items: preparation.salesReturnItems || [],
                p_inventory_transactions: preparation.inventoryTransactions || [],
                p_cogs_transactions: preparation.cogsTransactions || [],
                p_fifo_consumptions: preparation.fifoConsumptions || [],
                p_journal_entries: journalEntries,
                p_customer_credits: preparation.customerCredits || [],
                p_update_source: preparation.updateSource
            }

            // 3. استدعاء RPC
            const { data: rpcResult, error: rpcError } = await this.executeRpcWithV2Fallback(
                enterpriseFinanceFlags.returnsV2 ? 'process_sales_return_atomic_v2' : 'post_accounting_event',
                enterpriseFinanceFlags.returnsV2 ? v2RpcParams : legacyRpcParams,
                enterpriseFinanceFlags.returnsV2
                    ? undefined
                    : {
                        rpcName: 'process_sales_return_atomic_v2',
                        rpcParams: v2RpcParams,
                        reasonLabel: 'sales return posting',
                    }
            )

            if (rpcError) {
                console.error('Atomic Sales Return RPC Error:', rpcError)
                throw new Error(rpcError.message)
            }

            const result = (rpcResult || {}) as any

            return {
                success: true,
                returnIds: result.return_ids,
                creditIds: result.credit_ids,
                customerCreditLedgerIds: result.customer_credit_ledger_ids,
                journalEntryIds: result.journal_entry_ids,
                transactionId: result.transaction_id,
                sourceEntity: result.source_entity,
                sourceId: result.source_id,
                eventType: result.event_type,
            }

        } catch (error: any) {
            console.error('Atomic Sales Return Error:', error)
            return { success: false, error: error.message }
        }
    }

    /**
     * تنفيذ اعتماد فاتورة شراء ذري (Atomic Bill Posting)
     * يشمل:
     * 1. القيود المحاسبية (Inventory/Purchases + VAT vs AP)
     * 2. حركات المخزون (Inventory Transactions)
     * 3. تحديث حالة الفاتورة (Bill Status Update)
     */
    async postBillAtomic(
        params: {
            billId: string
            billNumber: string
            billDate: string
            companyId: string
            branchId: string | null
            warehouseId: string | null
            costCenterId: string | null
            subtotal: number
            taxAmount: number
            totalAmount: number
            status: string
            receiptStatus?: string
            receivedBy?: string
            receivedAt?: string
        },
        accountMapping: {
            companyId: string
            ap: string
            inventory?: string
            purchases?: string
            vatInput?: string
        }
    ): Promise<AtomicTransactionResult> {
        try {
            console.log(`Starting atomic bill posting for bill: ${params.billNumber}`)

            const { prepareBillPosting } = await import('./purchase-posting')

            // 1. تحضير جميع البيانات
            const preparation = await prepareBillPosting(this.supabase, params, accountMapping)

            if (!preparation.success || !preparation.payload) {
                throw new Error(preparation.error || 'Failed to prepare bill posting data')
            }

            // 2. استدعاء RPC متخصص لفاتورة الاستلام
            // نبتعد هنا عن post_purchase_transaction لأنه:
            // 1) overloaded في البيئة الحية ويسبب ambiguity في PostgREST
            // 2) يعتمد على transaction_date غير الموجود في inventory_transactions الحية
            const { data: rpcResult, error: rpcError } = await this.supabase.rpc('post_bill_receipt_atomic', {
                p_company_id: params.companyId,
                p_bill_id: params.billId,
                p_bill_update: preparation.payload.billUpdate,
                p_journal_entry: preparation.payload.journal,
                p_inventory_transactions: preparation.payload.inventoryTransactions
            })

            if (rpcError) {
                console.error('Atomic Bill Posting RPC Error:', rpcError)
                throw new Error(rpcError.message)
            }

            return {
                success: true,
                journalEntryIds: rpcResult?.journal_entry_id ? [rpcResult.journal_entry_id] : []
            }

        } catch (error: any) {
            console.error('Atomic Bill Posting Error:', error)
            return { success: false, error: error.message }
        }
    }

    /**
     * تنفيذ مرتجع مشتريات ذري (Atomic Purchase Return)
     *
     * يستخدم process_purchase_return_atomic (migration 20260219_003) التي تضمن:
     *  - قفل FOR UPDATE على bill_items (منع race conditions)
     *  - pg_advisory_xact_lock على مستوى المنتج+المخزن
     *  - تحقق من الكميات بعد القفل (over-return protection)
     *  - COALESCE increment لـ returned_quantity (ليس overwrite)
     *  - إنشاء inventory_transactions داخل Transaction واحدة
     *
     * الـ accountMapping يشمل الآن vatInput لعكس ضريبة المدخلات عند المرتجع.
     */
    async postPurchaseReturnAtomic(
        params: {
            billId:           string
            billNumber:       string
            companyId:        string
            supplierId:       string
            branchId:         string
            warehouseId:      string
            costCenterId:     string
            returnItems:      any[]
            returnMethod:     'credit' | 'cash' | 'bank'
            returnAccountId?: string | null
            isPaid:           boolean
            lang:             'ar' | 'en'
        },
        accountMapping: {
            companyId:              string
            ap:                     string
            inventory?:             string
            expense?:               string
            vatInput?:              string   // ← required for proper VAT reversal
            vendorCreditLiability?: string
            cash?:                  string
            bank?:                  string
        }
    ): Promise<AtomicTransactionResult> {
        try {
            console.log(`Starting atomic purchase return for bill: ${params.billNumber}`)

            const { preparePurchaseReturnData } = await import('./purchase-returns-preparation')

            const preparation = await preparePurchaseReturnData(this.supabase, params, accountMapping)

            if (!preparation.success || !preparation.payload) {
                throw new Error(preparation.error || 'Failed to prepare purchase return data')
            }

            const p = preparation.payload

            // Switch to process_purchase_return_atomic which has:
            //  - proper row-level locking
            //  - over-return quantity check
            //  - incremental returned_quantity update (COALESCE + qty)
            //  - internal inventory_transaction creation
            const { data: rpcResult, error: rpcError } = await this.supabase.rpc(
                'process_purchase_return_atomic',
                {
                    p_company_id:         params.companyId,
                    p_supplier_id:        params.supplierId,
                    p_bill_id:            params.billId,
                    p_purchase_return:    p.purchaseReturn,
                    p_return_items:       p.returnItems,
                    p_journal_entry:      p.journalHeader,
                    p_journal_lines:      p.journalLines,
                    p_vendor_credit:      p.vendorCredit      ?? null,
                    p_vendor_credit_items: p.vendorCreditItems ?? null,
                    p_bill_update:        p.billUpdate,
                }
            )

            if (rpcError) {
                console.error('Atomic Purchase Return RPC Error:', rpcError)
                throw new Error(rpcError.message)
            }

            return {
                success: true,
                journalEntryIds: rpcResult?.journal_entry_id ? [rpcResult.journal_entry_id] : [],
            }

        } catch (error: any) {
            console.error('Atomic Purchase Return Error:', error)
            return { success: false, error: error.message }
        }
    }
}

