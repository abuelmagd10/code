import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY! || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

async function cleanTestSales() {
    try {
        console.log('Searching for company containing "تست"...');
        const { data: company, error: companyErr } = await supabase
            .from('companies')
            .select('id, name')
            .ilike('name', '%تست%')
            .limit(1)
            .single();

        if (companyErr || !company) { 
            console.log('Test company not found or error:', companyErr?.message); 
            return; 
        }
        
        const companyId = company.id;
        console.log(`✅ Found company: ${company.name} (${companyId})`);

        // 1. Delete third_party_inventory completely for this company
        console.log('🗑️ Deleting third_party_inventory...');
        await supabase.from('third_party_inventory').delete().eq('company_id', companyId);

        // 2. Fetch all invoices for the test company
        const { data: invoices } = await supabase.from('invoices').select('id').eq('company_id', companyId);
        const invoiceIds = invoices ? invoices.map(i => i.id) : [];

        if (invoiceIds.length > 0) {
            console.log(`🗑️ Deleting ${invoiceIds.length} invoices and related records...`);
            
            // Delete associated dispatch approvals
            await supabase.from('inventory_dispatch_approvals').delete().in('invoice_id', invoiceIds);
            
            // Delete inventory transactions (sales)
            await supabase.from('inventory_transactions').delete().eq('transaction_type', 'sale').in('reference_id', invoiceIds);
            
            // Delete cogs transactions
            await supabase.from('cogs_transactions').delete().in('source_id', invoiceIds);
            
            // Delete Journal Entries
            await supabase.from('journal_entries').delete().in('reference_type', ['invoice', 'invoice_cogs']).in('reference_id', invoiceIds);
            
            // Delete invoice items
            await supabase.from('invoice_items').delete().in('invoice_id', invoiceIds);
            
            // Finally delete the invoices
            await supabase.from('invoices').delete().in('id', invoiceIds);
            console.log('✅ Invoices deleted completely.');
        } else {
            console.log('⚠️ No invoices found to delete.');
        }

        // 3. Delete sales orders
        const { data: orders } = await supabase.from('sales_orders').select('id').eq('company_id', companyId);
        const orderIds = orders ? orders.map(o => o.id) : [];

        if (orderIds.length > 0) {
             console.log(`🗑️ Deleting ${orderIds.length} sales orders and items...`);
             await supabase.from('sales_order_items').delete().in('sales_order_id', orderIds);
             await supabase.from('sales_orders').delete().in('id', orderIds);
             console.log('✅ Sales orders deleted completely.');
        } else {
             console.log('⚠️ No sales orders found to delete.');
        }
        
        console.log('🎉 Cleanup routine completed successfully.');
    } catch (err) {
        console.error('❌ Error during cleanup:', err);
    }
}

cleanTestSales();
