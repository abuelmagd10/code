/**
 * 📌 Purchase Returns Preparation Functions
 * دوال تجهيز بيانات مرتجعات المشتريات (Calculate Phase)
 * 
 * Pattern: Calculate-then-Commit
 * - NO database writes
 * - Returns structured payloads for RPC
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { processPurchaseReturnFIFOReversal } from './purchase-return-fifo-reversal'

export interface PurchaseReturnItem {
    item_id: string
    product_id: string | null
    product_name: string
    return_qty: number
    unit_price: number
    tax_rate: number
    discount_percent: number
}

export interface PurchaseReturnParams {
    billId: string
    billNumber: string
    companyId: string
    supplierId: string
    branchId: string
    warehouseId: string
    costCenterId: string
    returnItems: PurchaseReturnItem[]
    returnMethod: 'credit' | 'cash' | 'bank'
    returnAccountId?: string | null
    isPaid: boolean
    lang: 'ar' | 'en'
}

export interface PurchaseReturnResult {
    success: boolean
    error?: string
    payload?: {
        purchaseReturn: {
            company_id: string
            supplier_id: string
            bill_id: string
            return_number: string
            return_date: string
            subtotal: number
            tax_amount: number
            total_amount: number
            settlement_method: string
            status: string
            reason: string
            notes: string
            branch_id: string
            cost_center_id: string
            warehouse_id: string
        }
        vendorCredit?: {
            company_id: string
            supplier_id: string
            bill_id: string
            credit_number: string
            credit_date: string
            status: string
            subtotal: number
            tax_amount: number
            total_amount: number
            applied_amount: number
            branch_id: string
            cost_center_id: string
            warehouse_id: string
            notes: string
        }
        vendorCreditItems?: Array<{
            product_id: string
            description: string
            quantity: number
            unit_price: number
            tax_rate: number
            discount_percent: number
            line_total: number
        }>
        journal: {
            company_id: string
            branch_id: string
            cost_center_id: string
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
                branch_id: string
                cost_center_id: string
            }>
        }
        inventoryTransactions: Array<{
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
        billUpdate: {
            status?: string
            returned_amount?: number
            return_status?: string
        }
        billItemsUpdate: Array<{
            id: string
            returned_quantity: number
        }>
    }
}

/**
 * 📌 تجهيز بيانات مرتجع المشتريات (Purchase Return)
 * 
 * Returns:
 * - Purchase Return Record
 * - Vendor Credit (if applicable)
 * - Journal Entry (Reversal)
 * - Inventory Transactions (Stock Out)
 * - Bill Updates
 */
export async function preparePurchaseReturnData(
    supabase: SupabaseClient,
    params: PurchaseReturnParams,
    accountMapping: {
        companyId: string
        ap: string
        inventory?: string
        expense?: string
        vendorCreditLiability?: string
        cash?: string
        bank?: string
    }
): Promise<PurchaseReturnResult> {
    try {
        const {
            billId,
            billNumber,
            companyId,
            supplierId,
            branchId,
            warehouseId,
            costCenterId,
            returnItems,
            returnMethod,
            returnAccountId,
            isPaid,
            lang
        } = params

        // Validation
        if (!branchId || !warehouseId || !costCenterId) {
            return {
                success: false,
                error: lang === 'en'
                    ? 'Branch, Warehouse, and Cost Center are required'
                    : 'الفرع والمخزن ومركز التكلفة مطلوبة'
            }
        }

        // 1️⃣ Calculate Return Totals
        const returnedSubtotal = returnItems.reduce((sum, item) => {
            const lineTotal = item.unit_price * (1 - (item.discount_percent || 0) / 100) * item.return_qty
            return sum + lineTotal
        }, 0)

        const returnedTax = returnItems.reduce((sum, item) => {
            const lineTotal = item.unit_price * (1 - (item.discount_percent || 0) / 100) * item.return_qty
            return sum + (lineTotal * (item.tax_rate || 0) / 100)
        }, 0)

        const returnTotal = returnedSubtotal + returnedTax

        // 2️⃣ Generate Return Number
        const returnNumber = `PRET-${Date.now().toString().slice(-8)}`
        const returnDate = new Date().toISOString().slice(0, 10)

        // 3️⃣ Prepare Purchase Return Record
        const purchaseReturn = {
            company_id: companyId,
            supplier_id: supplierId,
            bill_id: billId,
            return_number: returnNumber,
            return_date: returnDate,
            subtotal: returnedSubtotal,
            tax_amount: returnedTax,
            total_amount: returnTotal,
            settlement_method: returnMethod === 'credit' ? 'credit' : returnMethod === 'cash' ? 'cash' : 'bank',
            status: 'completed',
            reason: lang === 'en' ? 'Purchase return' : 'مرتجع مشتريات',
            notes: lang === 'en' ? `Purchase return for bill ${billNumber}` : `مرتجع مشتريات للفاتورة ${billNumber}`,
            branch_id: branchId,
            cost_center_id: costCenterId,
            warehouse_id: warehouseId
        }

        // 4️⃣ Prepare Vendor Credit (if credit method and paid bill)
        let vendorCredit: any = undefined
        let vendorCreditItems: any[] = []

        if (returnMethod === 'credit' && isPaid) {
            const creditNumber = `VC-${Date.now().toString().slice(-8)}`

            vendorCredit = {
                company_id: companyId,
                supplier_id: supplierId,
                bill_id: billId,
                credit_number: creditNumber,
                credit_date: returnDate,
                status: 'open',
                subtotal: returnedSubtotal,
                tax_amount: returnedTax,
                total_amount: returnTotal,
                applied_amount: 0,
                branch_id: branchId,
                cost_center_id: costCenterId,
                warehouse_id: warehouseId,
                notes: lang === 'en'
                    ? `Vendor credit for purchase return ${returnNumber}`
                    : `إشعار دائن للمرتجع ${returnNumber}`
            }

            vendorCreditItems = returnItems
                .filter(item => item.product_id && item.return_qty > 0)
                .map(item => ({
                    product_id: item.product_id!,
                    description: item.product_name,
                    quantity: item.return_qty,
                    unit_price: item.unit_price,
                    tax_rate: item.tax_rate || 0,
                    discount_percent: item.discount_percent || 0,
                    line_total: item.unit_price * (1 - (item.discount_percent || 0) / 100) * item.return_qty
                }))
        }

        // 5️⃣ Prepare Journal Entry Lines
        const journalLines: Array<{
            account_id: string
            description: string
            debit_amount: number
            credit_amount: number
            branch_id: string
            cost_center_id: string
        }> = []

        const invOrExp = accountMapping.inventory || accountMapping.expense

        if (returnMethod === 'credit') {
            // Credit Return - Vendor Credit Liability
            const vendorCreditAccount = accountMapping.vendorCreditLiability || accountMapping.ap

            journalLines.push({
                account_id: vendorCreditAccount,
                description: lang === 'en' ? 'Vendor Credit Liability (AP Contra)' : 'إشعار دائن المورد (AP Contra)',
                debit_amount: returnTotal,
                credit_amount: 0,
                branch_id: branchId,
                cost_center_id: costCenterId
            })

            if (invOrExp) {
                journalLines.push({
                    account_id: invOrExp,
                    description: accountMapping.inventory
                        ? (lang === 'en' ? 'Inventory returned to supplier' : 'مخزون مرتجع للمورد')
                        : (lang === 'en' ? 'Expense reversal' : 'عكس المصروف'),
                    debit_amount: 0,
                    credit_amount: returnTotal,
                    branch_id: branchId,
                    cost_center_id: costCenterId
                })
            }
        } else {
            // Cash/Bank Refund
            const refundAccount = returnAccountId || (returnMethod === 'cash' ? accountMapping.cash : accountMapping.bank)

            if (!refundAccount) {
                return {
                    success: false,
                    error: lang === 'en' ? 'No refund account found' : 'لم يتم العثور على حساب للاسترداد'
                }
            }

            journalLines.push({
                account_id: refundAccount,
                description: returnMethod === 'cash'
                    ? (lang === 'en' ? 'Cash refund received' : 'استرداد نقدي مستلم')
                    : (lang === 'en' ? 'Bank refund received' : 'استرداد بنكي مستلم'),
                debit_amount: returnTotal,
                credit_amount: 0,
                branch_id: branchId,
                cost_center_id: costCenterId
            })

            if (invOrExp) {
                journalLines.push({
                    account_id: invOrExp,
                    description: accountMapping.inventory
                        ? (lang === 'en' ? 'Inventory returned to supplier' : 'مخزون مرتجع للمورد')
                        : (lang === 'en' ? 'Expense reversal' : 'عكس المصروف'),
                    debit_amount: 0,
                    credit_amount: returnTotal,
                    branch_id: branchId,
                    cost_center_id: costCenterId
                })
            }
        }

        // 6️⃣ Prepare Inventory Transactions (Reversal)
        const inventoryTransactions = returnItems
            .filter(item => item.product_id && item.return_qty > 0)
            .map(item => ({
                company_id: companyId,
                branch_id: branchId,
                warehouse_id: warehouseId,
                cost_center_id: costCenterId,
                product_id: item.product_id!,
                transaction_type: 'purchase_return',
                quantity_change: -item.return_qty, // Negative for return
                reference_id: billId,
                reference_type: 'purchase_return',
                notes: lang === 'en' ? `Purchase return ${returnNumber}` : `مرتجع مشتريات ${returnNumber}`,
                transaction_date: returnDate
            }))

        // 7️⃣ Prepare Bill Update
        const billUpdate: any = {}

        // Fetch current bill data to calculate new returned amount
        const { data: currentBill } = await supabase
            .from('bills')
            .select('total_amount, returned_amount, status')
            .eq('id', billId)
            .single()

        if (currentBill) {
            const newReturnedAmount = (currentBill.returned_amount || 0) + returnTotal
            billUpdate.returned_amount = newReturnedAmount

            // Update return status
            if (newReturnedAmount >= currentBill.total_amount) {
                billUpdate.return_status = 'fully_returned'
            } else if (newReturnedAmount > 0) {
                billUpdate.return_status = 'partially_returned'
            }

            // Update bill status if not paid
            if (!isPaid) {
                const newTotalAmount = currentBill.total_amount - returnTotal
                if (newTotalAmount <= 0) {
                    billUpdate.status = 'voided'
                }
            }
        }

        // 8️⃣ Prepare Bill Items Update (returned_quantity)
        const billItemsUpdate = returnItems
            .filter(item => item.return_qty > 0)
            .map(item => {
                // We need to fetch current returned_quantity
                // For now, we'll just prepare the increment
                return {
                    id: item.item_id,
                    returned_quantity: item.return_qty // This will be added to existing
                }
            })

        // 9️⃣ Build Final Payload
        return {
            success: true,
            payload: {
                purchaseReturn,
                vendorCredit,
                vendorCreditItems: vendorCreditItems.length > 0 ? vendorCreditItems : undefined,
                journal: {
                    company_id: companyId,
                    branch_id: branchId,
                    cost_center_id: costCenterId,
                    entry_date: returnDate,
                    description: lang === 'en'
                        ? `Purchase return for bill ${billNumber}`
                        : `مرتجع مشتريات للفاتورة ${billNumber}`,
                    reference_type: 'purchase_return',
                    reference_id: billId,
                    status: 'posted',
                    validation_status: 'valid',
                    lines: journalLines
                },
                inventoryTransactions,
                billUpdate,
                billItemsUpdate
            }
        }
    } catch (error: any) {
        return {
            success: false,
            error: `Preparation failed: ${error.message}`
        }
    }
}
