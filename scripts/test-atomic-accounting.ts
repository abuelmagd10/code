
import { createClient } from '../lib/supabase/server'
import { AccountingTransactionService } from '../lib/accounting-transaction-service'

async function runTest() {
    const supabase = await createClient()
    const accountingService = new AccountingTransactionService(supabase)

    console.log('--- Starting Atomic Accounting Verification ---')

    // 1. Identify a test invoice
    const { data: invoice } = await supabase
        .from('invoices')
        .select('*')
        .eq('status', 'draft')
        .limit(1)
        .single()

    if (!invoice) {
        console.log('No draft invoice found for testing. Please create one manually or skip invoice posting test.')
    } else {
        console.log(`Testing Invoice Posting for: ${invoice.invoice_number}`)
        // Call postInvoiceAtomic
        // Note: This might fail if items are missing or other governance issues, but we want to see the error or success
        const result = await accountingService.postInvoiceAtomic(
            invoice.id,
            invoice.company_id
        )
        console.log('Invoice Posting Result:', result)
    }

    // 2. Test Payment (Mock Data)
    // We need a sent/unpaid invoice for this.
    const { data: unpaidInvoice } = await supabase
        .from('invoices')
        .select('*')
        .neq('status', 'draft')
        .neq('status', 'paid')
        .limit(1)
        .single()

    if (unpaidInvoice) {
        console.log(`Testing Payment for Invoice: ${unpaidInvoice.invoice_number}`)
        const paymentData = {
            company_id: unpaidInvoice.company_id,
            branch_id: unpaidInvoice.branch_id,
            cost_center_id: unpaidInvoice.cost_center_id,
            warehouse_id: unpaidInvoice.warehouse_id,
            invoice_id: unpaidInvoice.id,
            customer_id: unpaidInvoice.customer_id,
            amount: 10, // Small amount
            payment_date: new Date().toISOString().slice(0, 10),
            payment_method: 'cash',
            reference: 'TEST-ATOMIC-PAY',
            notes: 'Automated Test Payment',
            account_id: undefined // Optional
        }

        const paymentResult = await accountingService.postPaymentAtomic(paymentData)
        console.log('Payment Posting Result:', paymentResult)
    } else {
        console.log('No unpaid invoice found for payment test.')
    }

    // 3. Test Sales Return (Mock Data)
    // We need a sent invoice (can return)
    // Reuse unpaidInvoice or find another
    const returnInvoice = unpaidInvoice || invoice
    if (returnInvoice && (returnInvoice.status === 'sent' || returnInvoice.status === 'partially_paid' || returnInvoice.status === 'paid')) {
        console.log(`Testing Sales Return for Invoice: ${returnInvoice.invoice_number}`)

        // Need items to return
        const { data: items } = await supabase.from('invoice_items').select('*').eq('invoice_id', returnInvoice.id)

        if (items && items.length > 0) {
            const itemToReturn = items[0]
            const returnItems = [{
                id: itemToReturn.id,
                product_id: itemToReturn.product_id,
                name: 'Test Item',
                quantity: itemToReturn.quantity,
                maxQty: itemToReturn.quantity,
                qtyToReturn: 1, // Return 1 unit
                cost_price: 0, // Should be fetched but for test maybe 0 is accepted or fetched inside? 
                // prepareSalesReturnData fetches data, but returnItems passed as params need some info.
                // Let's rely on what prepareSalesReturnData needs.
                // It needs unit_price, tax_rate etc.
                unit_price: itemToReturn.unit_price,
                tax_rate: itemToReturn.tax_rate,
                discount_percent: itemToReturn.discount_percent,
                line_total: itemToReturn.unit_price // approx
            }]

            const returnResult = await accountingService.postSalesReturnAtomic({
                invoiceId: returnInvoice.id,
                invoiceNumber: returnInvoice.invoice_number,
                returnItems: returnItems as any[],
                returnMode: 'partial',
                companyId: returnInvoice.company_id,
                userId: 'test-user', // Mock
                lang: 'en'
            })
            console.log('Sales Return Result:', returnResult)
        } else {
            console.log('No items found for return test.')
        }
    }

    console.log('--- Verification Complete ---')
}

// To run this, we need a way to execute it in Next.js environment context or similar.
// Since we don't have a runner easily, this file serves as a reference or could be placed in a temporary route.
