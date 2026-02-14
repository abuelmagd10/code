
import { SupabaseClient } from '@supabase/supabase-js'
import { prepareInvoiceRevenueJournal, prepareCOGSJournalOnDelivery } from './accrual-accounting-engine'
import { prepareFIFOConsumptionData } from './fifo-engine'

export interface AtomicTransactionResult {
    success: boolean
    journalEntryIds?: string[]
    inventoryTransactionIds?: string[]
    cogsTransactionIds?: string[]
    payment_ids?: string[]
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
        currentUserId?: string
    ): Promise<AtomicTransactionResult> {
        try {
            console.log(`Starting atomic posting for invoice: ${invoiceId}`)

            // 1. الحصول على تفاصيل الفاتورة لتحديد المنتجات
            const { data: invoiceItems, error: itemsError } = await this.supabase
                .from('invoice_items')
                .select(`
           product_id, quantity,
           invoices!inner (
             branch_id, cost_center_id, warehouse_id, status, invoice_date
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
                revenueJournal = await prepareInvoiceRevenueJournal(this.supabase, invoiceId, companyId)
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

            if (inventoryAlreadyDeducted) {
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
            if (!existingCOGSJournal && totalTransactionCOGS > 0) {
                cogsJournal = await prepareCOGSJournalOnDelivery(
                    this.supabase,
                    invoiceId,
                    companyId,
                    totalTransactionCOGS
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
            const { data: rpcResult, error: rpcError } = await this.supabase.rpc('post_accounting_event', {
                p_event_type: 'invoice_posting',
                p_company_id: companyId,
                p_inventory_transactions: allInventoryTx,
                p_cogs_transactions: allCogsTx,
                p_fifo_consumptions: allFifoConsumptions,
                p_journal_entries: journalEntries,
                p_update_source: { id: invoiceId, status: 'sent' } // هنا نثبت الحالة sent كحد أدنى، أو يمكننا تمرير الحالة المطلوبة كبارامتر
            })

            if (rpcError) {
                throw new Error(`RPC Execution Failed: ${rpcError.message}`)
            }

            return {
                success: true,
                journalEntryIds: rpcResult.journal_entry_ids,
                inventoryTransactionIds: rpcResult.inventory_transaction_ids,
                cogsTransactionIds: rpcResult.cogs_transaction_ids
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
        currentUserId?: string
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

            // 3. التنفيذ الذري
            const { data: rpcResult, error: rpcError } = await this.supabase.rpc('post_accounting_event', {
                p_event_type: 'payment_posting',
                p_company_id: paymentData.company_id,
                p_payments: [paymentWithId],
                p_journal_entries: [journalEntry]
            })

            if (rpcError) {
                throw new Error(`RPC Execution Failed (Payment): ${rpcError.message}`)
            }

            return {
                success: true,
                // @ts-ignore
                payment_ids: rpcResult.payment_ids,
                journalEntryIds: rpcResult.journal_entry_ids
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

            // 3. استدعاء RPC
            const { data: rpcResult, error: rpcError } = await this.supabase.rpc('post_accounting_event', {
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
            })

            if (rpcError) {
                console.error('Atomic Sales Return RPC Error:', rpcError)
                throw new Error(rpcError.message)
            }

            return {
                success: true,
                // @ts-ignore
                returnIds: rpcResult.return_ids,
                // @ts-ignore
                creditIds: rpcResult.credit_ids,
                journalEntryIds: rpcResult.journal_entry_ids
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

            // 2. استدعاء RPC
            const { data: rpcResult, error: rpcError } = await this.supabase.rpc('post_purchase_transaction', {
                p_transaction_type: 'post_bill',
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
     * يشمل:
     * 1. سجل المرتجع (Purchase Return Record)
     * 2. إشعار دائن المورد (Vendor Credit)
     * 3. حركات المخزون (Inventory Reversal)
     * 4. القيود المحاسبية (Journal Entries)
     * 5. تحديث الفاتورة والبنود (Bill & Items Update)
     */
    async postPurchaseReturnAtomic(
        params: {
            billId: string
            billNumber: string
            companyId: string
            supplierId: string
            branchId: string
            warehouseId: string
            costCenterId: string
            returnItems: any[]
            returnMethod: 'credit' | 'cash' | 'bank'
            returnAccountId?: string | null
            isPaid: boolean
            lang: 'ar' | 'en'
        },
        accountMapping: {
            companyId: string
            ap: string
            inventory?: string
            expense?: string
            vendorCreditLiability?: string
            cash?: string
            bank?: string
        }
    ): Promise<AtomicTransactionResult> {
        try {
            console.log(`Starting atomic purchase return for bill: ${params.billNumber}`)

            const { preparePurchaseReturnData } = await import('./purchase-returns-preparation')

            // 1. تحضير جميع البيانات
            const preparation = await preparePurchaseReturnData(this.supabase, params, accountMapping)

            if (!preparation.success || !preparation.payload) {
                throw new Error(preparation.error || 'Failed to prepare purchase return data')
            }

            // 2. استدعاء RPC
            const { data: rpcResult, error: rpcError } = await this.supabase.rpc('post_purchase_transaction', {
                p_transaction_type: 'purchase_return',
                p_company_id: params.companyId,
                p_bill_id: params.billId,
                p_bill_update: preparation.payload.billUpdate,
                p_journal_entry: preparation.payload.journal,
                p_inventory_transactions: preparation.payload.inventoryTransactions,
                p_purchase_return: preparation.payload.purchaseReturn,
                p_vendor_credit: preparation.payload.vendorCredit,
                p_vendor_credit_items: preparation.payload.vendorCreditItems,
                p_update_source: {
                    bill_items_update: preparation.payload.billItemsUpdate
                }
            })

            if (rpcError) {
                console.error('Atomic Purchase Return RPC Error:', rpcError)
                throw new Error(rpcError.message)
            }

            return {
                success: true,
                journalEntryIds: rpcResult?.journal_entry_id ? [rpcResult.journal_entry_id] : []
            }

        } catch (error: any) {
            console.error('Atomic Purchase Return Error:', error)
            return { success: false, error: error.message }
        }
    }
}

