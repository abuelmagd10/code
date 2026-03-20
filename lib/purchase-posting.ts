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
