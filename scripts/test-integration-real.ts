
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })
import { createClient } from '@supabase/supabase-js'
import { AccountingTransactionService } from '../lib/accounting-transaction-service'

// Initialize Supabase Client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY! // Must be service role for admin tasks

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('❌ Missing Environment Variables: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
    process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)
const accountingService = new AccountingTransactionService(supabase)

async function runTest() {
    console.log('🚀 Starting Real Integration Test for Equity Engine...')

    try {
        // 1. Identify a test invoice (Draft)
        console.log('🔍 Finding a draft invoice for testing...')
        const { data: invoice } = await supabase
            .from('invoices')
            .select('*')
            .eq('status', 'draft')
            .limit(1)
            .maybeSingle()

        if (!invoice) {
            console.warn('⚠️ No draft invoice found. Please create one manually to test Invoice Posting.')
        } else {
            console.log(`✅ Found Draft Invoice: ${invoice.invoice_number} (${invoice.id})`)

            // 2. Post Invoice Atomic
            console.log('⚡ Testing Atomic Invoice Posting...')
            const postResult = await accountingService.postInvoiceAtomic(
                invoice.id,
                invoice.company_id,
                'TEST-USER-ID' // Should be a valid user ID ideally, or mock
            )

            if (postResult.success) {
                console.log('✅ Invoice Posted Successfully!')
                console.log('   - Journal Entries:', postResult.journalEntryIds?.length)
                console.log('   - Inventory Tx:', postResult.inventoryTransactionIds?.length)
                console.log('   - COGS Tx:', postResult.cogsTransactionIds?.length)
            } else {
                console.error('❌ Invoice Posting Failed:', postResult.error)
            }
        }

        // 3. Test Payment (Find a Sent or Partially Paid invoice)
        console.log('🔍 Finding an unpaid invoice for payment test...')
        const { data: unpaidInvoice } = await supabase
            .from('invoices')
            .select('*')
            .neq('status', 'draft')
            .neq('status', 'paid')
            .neq('status', 'cancelled')
            .limit(1)
            .maybeSingle()

        if (unpaidInvoice) {
            console.log(`✅ Found Unpaid Invoice: ${unpaidInvoice.invoice_number} (${unpaidInvoice.id})`)

            const paymentAmount = 10 // Small test amount
            console.log(`⚡ Testing Atomic Payment Posting (${paymentAmount})...`)

            const paymentResult = await accountingService.postPaymentAtomic({
                company_id: unpaidInvoice.company_id,
                branch_id: unpaidInvoice.branch_id,
                cost_center_id: unpaidInvoice.cost_center_id,
                warehouse_id: unpaidInvoice.warehouse_id,
                invoice_id: unpaidInvoice.id,
                customer_id: unpaidInvoice.customer_id,
                amount: paymentAmount,
                payment_date: new Date().toISOString().slice(0, 10),
                payment_method: 'cash',
                reference: 'TEST-INT-PAY-' + Date.now(),
                notes: 'Automated Integration Test Payment',
                account_id: undefined // Will fallback to default Cash account
            })

            if (paymentResult.success) {
                console.log('✅ Payment Posted Successfully!')
                console.log('   - Payment IDs:', paymentResult.payment_ids)
                console.log('   - Journal Entries:', paymentResult.journalEntryIds)
            } else {
                console.error('❌ Payment Posting Failed:', paymentResult.error)
            }
        } else {
            console.warn('⚠️ No unpaid invoice found for payment test.')
        }

        // 4. Test Sales Return (Find a Paid or Partially Paid invoice)
        // We can reuse unpaidInvoice if it was just paid, or find another one.
        // Let's try to find a 'paid' one for full return scenario or 'partially_paid'
        console.log('🔍 Finding a paid/partially_paid invoice for return test...')
        const { data: returnInvoice } = await supabase
            .from('invoices')
            .select('*')
            .in('status', ['paid', 'partially_paid'])
            .limit(1)
            .maybeSingle()

        if (returnInvoice) {
            console.log(`✅ Found Invoice for Return: ${returnInvoice.invoice_number} (${returnInvoice.id})`)

            // Get items to return
            const { data: items } = await supabase
                .from('invoice_items')
                .select('*')
                .eq('invoice_id', returnInvoice.id)
                .limit(1)

            if (items && items.length > 0) {
                const itemToReturn = items[0]
                console.log(`   - Returning Item: ${itemToReturn.product_id} (Qty: 1)`)

                const returnItems = [{
                    id: itemToReturn.id,
                    product_id: itemToReturn.product_id,
                    name: 'Test Return Item',
                    quantity: itemToReturn.quantity,
                    maxQty: itemToReturn.quantity,
                    qtyToReturn: 1,
                    unit_price: itemToReturn.unit_price,
                    tax_rate: itemToReturn.tax_rate || 0,
                    discount_percent: itemToReturn.discount_percent || 0,
                    line_total: itemToReturn.unit_price,
                    cost_price: 0 // Will be handled by system
                }]

                console.log('⚡ Testing Atomic Sales Return...')
                const returnResult = await accountingService.postSalesReturnAtomic({
                    invoiceId: returnInvoice.id,
                    invoiceNumber: returnInvoice.invoice_number,
                    returnItems: returnItems,
                    returnMode: 'partial',
                    companyId: returnInvoice.company_id,
                    userId: 'TEST-USER-ID',
                    lang: 'en'
                })

                if (returnResult.success) {
                    console.log('✅ Sales Return Processed Successfully!')
                    console.log('   - Return ID:', (returnResult as any).returnIds)
                    console.log('   - Credit Note ID:', (returnResult as any).creditIds)
                    console.log('   - Journal Entries:', returnResult.journalEntryIds)
                } else {
                    console.error('❌ Sales Return Failed:', returnResult.error)
                }

            } else {
                console.warn('⚠️ Invoice has no items to return.')
            }
        } else {
            console.warn('⚠️ No paid/partially_paid invoice found for return test.')
        }

        console.log('🏁 Integration Test Complete.')

    } catch (error) {
        console.error('❌ Unexpected Error during test:', error)
        process.exit(1)
    }
}

runTest()
