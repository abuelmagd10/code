/**
 * 📌 Purchase Posting Preparation Functions
 * دوال تجهيز بيانات اعتماد فواتير الشراء (Calculate Phase)
 * 
 * Pattern: Calculate-then-Commit
 * - NO database writes
 * - Returns structured payloads for RPC
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export interface BillPostingParams {
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
}

export interface BillPostingResult {
    success: boolean
    error?: string
    payload?: {
        journal?: {
            company_id: string
            branch_id: string | null
            cost_center_id: string | null
            entry_date: string
            description: string
            reference_type: string
            reference_id: string
            status: string
            validation_status: string
            lines: Array<{
                account_id: string
                description: string
                debit_amount: number
                credit_amount: number
                branch_id: string | null
                cost_center_id: string | null
            }>
        }
        inventoryTransactions?: Array<{
            company_id: string
            branch_id: string
            warehouse_id: string
            cost_center_id: string
            product_id: string
            transaction_type: string
            quantity_change: number
            reference_id: string
            reference_type: string
            notes: string
            transaction_date: string
        }>
        billUpdate?: {
            status: string
            receipt_status?: string
            received_by?: string
            received_at?: string
        }
    }
}

export type BillReceiptReplayPayload = {
    operation: 'bill_receipt_posting'
    payload_version: 'bill_receipt_v1'
    bill: {
        bill_id: string
        bill_number: string | null
        bill_date: string
        purchase_order_id: string | null
        supplier_id: string | null
        branch_id: string
        warehouse_id: string
        cost_center_id: string
        subtotal: number
        tax_amount: number
        total_amount: number
        currency_code: string
        exchange_rate: number
        status: 'received'
        receipt_status: 'received'
        received_by: string
        received_at: string
        effective_receipt_date: string
    }
    account_mapping: {
        company_id: string
        accounts_payable: string
        inventory: string | null
        purchases: string | null
        vat_input: string | null
        mapping_source: string
        mapping_version: string
    }
    account_mapping_snapshot: {
        accounts_payable: BillReceiptReplayAccountSnapshot
        inventory: BillReceiptReplayAccountSnapshot | null
        purchases: BillReceiptReplayAccountSnapshot | null
        vat_input: BillReceiptReplayAccountSnapshot | null
    }
    monetary_snapshot: {
        subtotal: number
        tax_amount: number
        total_amount: number
        shipping: number
        shipping_tax_rate: number
        adjustment: number
        precision: number
    }
    currency_snapshot: {
        currency_code: string
        exchange_rate: number
        original_currency: string
        original_subtotal: number | null
        original_tax_amount: number | null
        original_total: number | null
        display_currency: string | null
        display_subtotal: number | null
        display_total: number | null
    }
    discount_snapshot: {
        discount_type: string
        discount_value: number
        discount_position: string
        line_discount_source: string
        header_discount_source: string
    }
    tax_snapshot: {
        tax_inclusive: boolean
        tax_amount: number
        shipping_tax_rate: number
        vat_input_account_id: string | null
        breakdown: Array<{
            tax_type: string
            amount: number
            account_id: string | null
            source: string
        }>
    }
    calculation_policy: {
        monetary_precision: number
        line_total_source: string
        tax_source: string
        discount_source: string
        shipping_source: string
        adjustment_source: string
        tax_inclusive: boolean
    }
    inventory_policy: {
        valuation_replay_mode: 'verify_only'
        valuation_method: string
        fifo_lot_replay: string
        batch_lot_tracking: string
        quantity_source: string
        cost_source: string
        warehouse_id: string
        cost_center_id: string
    }
    artifact_expectations: {
        stockable_item_count: number
        line_item_count: number
        expects_inventory: boolean
    }
    line_items: Array<{
        bill_item_id: string
        product_id: string | null
        item_type: string | null
        quantity: number
        unit_price: number
        tax_rate: number
        discount_percent: number
        line_total: number
        gross_amount: number
        discount_amount: number
        tax_amount: number
        stockable: boolean
    }>
}

export type BillReceiptReplayAccountSnapshot = {
    id: string
    account_code: string | null
    account_name: string | null
    account_type: string | null
    sub_type: string | null
}

function isValidNumber(value: unknown) {
    return Number.isFinite(Number(value))
}

function invalidPayload(error: string): BillPostingResult {
    return { success: false, error }
}

/**
 * 📌 تجهيز بيانات اعتماد الفاتورة (Bill Posting)
 * 
 * Returns:
 * - Journal Entry (Inventory/Purchases + VAT vs AP)
 * - Inventory Transactions (Stock In)
 * - Bill Status Update
 */
export async function prepareBillPosting(
    supabase: SupabaseClient,
    params: BillPostingParams,
    accountMapping: {
        companyId: string
        ap: string
        inventory?: string
        purchases?: string
        vatInput?: string
    }
): Promise<BillPostingResult> {
    try {
        const {
            billId,
            billNumber,
            billDate,
            companyId,
            branchId,
            warehouseId,
            costCenterId,
            subtotal,
            taxAmount,
            totalAmount,
            status,
            receiptStatus,
            receivedBy,
            receivedAt
        } = params

        // Validation
        if (!accountMapping.ap || (!accountMapping.inventory && !accountMapping.purchases)) {
            return {
                success: false,
                error: 'Account mapping incomplete: AP and (Inventory or Purchases) required'
            }
        }

        if (!branchId || !warehouseId || !costCenterId) {
            return {
                success: false,
                error: 'Branch, Warehouse, and Cost Center are required for bill posting'
            }
        }

        // 1️⃣ Fetch Bill Items (Products only, not services)
        const { data: billItems, error: itemsError } = await supabase
            .from('bill_items')
            .select('product_id, quantity, unit_price, products(item_type)')
            .eq('bill_id', billId)

        if (itemsError) {
            return {
                success: false,
                error: `Failed to fetch bill items: ${itemsError.message}`
            }
        }

        const productItems = (billItems || []).filter(
            (it: any) => it.product_id && it.products?.item_type !== 'service'
        )

        // 2️⃣ Prepare Journal Entry Lines
        const journalLines: Array<{
            account_id: string
            description: string
            debit_amount: number
            credit_amount: number
            branch_id: string | null
            cost_center_id: string | null
        }> = []

        // Debit: Inventory/Purchases (Asset)
        journalLines.push({
            account_id: accountMapping.inventory || accountMapping.purchases!,
            description: 'المخزون (أصل)',
            debit_amount: subtotal,
            credit_amount: 0,
            branch_id: branchId,
            cost_center_id: costCenterId
        })

        // Debit: VAT Input (if applicable)
        if (accountMapping.vatInput && taxAmount > 0) {
            journalLines.push({
                account_id: accountMapping.vatInput,
                description: 'ضريبة القيمة المضافة المدفوعة',
                debit_amount: taxAmount,
                credit_amount: 0,
                branch_id: branchId,
                cost_center_id: costCenterId
            })
        }

        // Credit: Accounts Payable
        journalLines.push({
            account_id: accountMapping.ap,
            description: 'الذمم الدائنة (الموردين)',
            debit_amount: 0,
            credit_amount: totalAmount,
            branch_id: branchId,
            cost_center_id: costCenterId
        })

        // 3️⃣ Prepare Inventory Transactions
        const inventoryTransactions = productItems.map((item: any) => ({
            company_id: companyId,
            branch_id: branchId,
            warehouse_id: warehouseId,
            cost_center_id: costCenterId,
            product_id: item.product_id,
            transaction_type: 'purchase',
            quantity_change: Number(item.quantity || 0),
            reference_id: billId,
            reference_type: 'bill',
            notes: `فاتورة شراء ${billNumber}`,
            transaction_date: billDate
        }))

        // 4️⃣ Build Payload
        return {
            success: true,
            payload: {
                journal: {
                    company_id: companyId,
                    branch_id: branchId,
                    cost_center_id: costCenterId,
                    entry_date: billDate,
                    description: `فاتورة مشتريات ${billNumber}`,
                    reference_type: 'bill',
                    reference_id: billId,
                    status: 'posted',
                    validation_status: 'valid',
                    lines: journalLines
                },
                inventoryTransactions: inventoryTransactions.length > 0 ? inventoryTransactions : undefined,
                billUpdate: {
                    status: status || 'received',
                    receipt_status: receiptStatus,
                    received_by: receivedBy,
                    received_at: receivedAt
                }
            }
        }
    } catch (error: any) {
        return {
            success: false,
            error: `Preparation failed: ${error.message}`
        }
    }
}

/**
 * تجهيز بيانات اعتماد الفاتورة من event snapshot فقط.
 *
 * هذا هو عقد replay-safe: لا يقرأ من قاعدة البيانات، ولا يسمح بأي fallback.
 * إذا كان payload ناقصًا نُفشل مبكرًا حتى لا يتحول replay إلى قراءة حالة حالية.
 */
export function prepareBillPostingFromPayload(payload: BillReceiptReplayPayload): BillPostingResult {
    try {
        if (payload.operation !== 'bill_receipt_posting' || payload.payload_version !== 'bill_receipt_v1') {
            return invalidPayload('Unsupported bill receipt replay payload contract')
        }

        const bill = payload.bill
        const mapping = payload.account_mapping

        if (!bill.bill_id || !bill.effective_receipt_date || !bill.branch_id || !bill.warehouse_id || !bill.cost_center_id) {
            return invalidPayload('Bill receipt replay payload requires bill id, effective date, branch, warehouse, and cost center')
        }

        if (!mapping.accounts_payable || (!mapping.inventory && !mapping.purchases)) {
            return invalidPayload('Account mapping snapshot incomplete: AP and (Inventory or Purchases) required')
        }

        if (
            payload.account_mapping_snapshot?.accounts_payable?.id !== mapping.accounts_payable ||
            (mapping.inventory && payload.account_mapping_snapshot.inventory?.id !== mapping.inventory) ||
            (mapping.purchases && payload.account_mapping_snapshot.purchases?.id !== mapping.purchases) ||
            (mapping.vat_input && payload.account_mapping_snapshot.vat_input?.id !== mapping.vat_input)
        ) {
            return invalidPayload('Account mapping snapshot must match the account ids used for replay preparation')
        }

        if (!payload.currency_snapshot?.currency_code || !isValidNumber(payload.currency_snapshot.exchange_rate)) {
            return invalidPayload('Currency snapshot is required for deterministic bill receipt replay')
        }

        if (
            !payload.monetary_snapshot ||
            !isValidNumber(payload.monetary_snapshot.subtotal) ||
            !isValidNumber(payload.monetary_snapshot.tax_amount) ||
            !isValidNumber(payload.monetary_snapshot.total_amount)
        ) {
            return invalidPayload('Monetary snapshot is required for deterministic bill receipt replay')
        }

        if (
            payload.inventory_policy?.valuation_replay_mode !== 'verify_only' ||
            payload.inventory_policy.warehouse_id !== bill.warehouse_id ||
            payload.inventory_policy.cost_center_id !== bill.cost_center_id
        ) {
            return invalidPayload('Inventory replay policy must be verify_only and match the receipt context')
        }

        if (!Array.isArray(payload.line_items) || payload.line_items.length === 0) {
            return invalidPayload('Line item snapshot is required for deterministic bill receipt replay')
        }

        const invalidLine = payload.line_items.find((line) => (
            !line.bill_item_id ||
            !isValidNumber(line.quantity) ||
            !isValidNumber(line.unit_price) ||
            !isValidNumber(line.tax_rate) ||
            !isValidNumber(line.discount_percent) ||
            !isValidNumber(line.line_total) ||
            typeof line.stockable !== 'boolean'
        ))

        if (invalidLine) {
            return invalidPayload('Line item snapshot is incomplete for deterministic bill receipt replay')
        }

        const inventoryAccount = mapping.inventory || mapping.purchases!
        const stockableItems = payload.line_items.filter((line) => line.stockable && line.product_id)
        const subtotal = Number(payload.monetary_snapshot.subtotal || bill.subtotal || 0)
        const taxAmount = Number(payload.monetary_snapshot.tax_amount || bill.tax_amount || 0)
        const totalAmount = Number(payload.monetary_snapshot.total_amount || bill.total_amount || 0)

        const journalLines: Array<{
            account_id: string
            description: string
            debit_amount: number
            credit_amount: number
            branch_id: string | null
            cost_center_id: string | null
        }> = [
            {
                account_id: inventoryAccount,
                description: 'المخزون (أصل)',
                debit_amount: subtotal,
                credit_amount: 0,
                branch_id: bill.branch_id,
                cost_center_id: bill.cost_center_id
            }
        ]

        if (mapping.vat_input && taxAmount > 0) {
            journalLines.push({
                account_id: mapping.vat_input,
                description: 'ضريبة القيمة المضافة المدفوعة',
                debit_amount: taxAmount,
                credit_amount: 0,
                branch_id: bill.branch_id,
                cost_center_id: bill.cost_center_id
            })
        }

        journalLines.push({
            account_id: mapping.accounts_payable,
            description: 'الذمم الدائنة (الموردين)',
            debit_amount: 0,
            credit_amount: totalAmount,
            branch_id: bill.branch_id,
            cost_center_id: bill.cost_center_id
        })

        return {
            success: true,
            payload: {
                journal: {
                    company_id: mapping.company_id,
                    branch_id: bill.branch_id,
                    cost_center_id: bill.cost_center_id,
                    entry_date: bill.effective_receipt_date,
                    description: `فاتورة مشتريات ${bill.bill_number || bill.bill_id}`,
                    reference_type: 'bill',
                    reference_id: bill.bill_id,
                    status: 'posted',
                    validation_status: 'valid',
                    lines: journalLines
                },
                inventoryTransactions: stockableItems.length > 0
                    ? stockableItems.map((line) => ({
                        company_id: mapping.company_id,
                        branch_id: bill.branch_id,
                        warehouse_id: bill.warehouse_id,
                        cost_center_id: bill.cost_center_id,
                        product_id: line.product_id!,
                        transaction_type: 'purchase',
                        quantity_change: Number(line.quantity || 0),
                        reference_id: bill.bill_id,
                        reference_type: 'bill',
                        notes: `فاتورة شراء ${bill.bill_number || bill.bill_id}`,
                        transaction_date: bill.effective_receipt_date
                    }))
                    : undefined,
                billUpdate: {
                    status: bill.status || 'received',
                    receipt_status: bill.receipt_status,
                    received_by: bill.received_by,
                    received_at: bill.received_at
                }
            }
        }
    } catch (error: any) {
        return {
            success: false,
            error: `Payload preparation failed: ${error.message}`
        }
    }
}
