// Test script to verify the enhanced repair-invoice logic
// This script simulates the API logic without requiring authentication

const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client with dummy credentials (same as .env.local)
const supabaseUrl = 'https://your-project.supabase.co';
const supabaseKey = 'your-anon-key';

const supabase = createClient(supabaseUrl, supabaseKey);

async function testRepairInvoiceLogic() {
  console.log('🧪 Testing Enhanced Repair Invoice Logic');
  console.log('==========================================');
  
  const invoiceNumber = 'INV-0028';
  const companyId = 'test-company-id'; // This would normally come from auth
  
  console.log(`🔍 Testing search for invoice: ${invoiceNumber}`);
  console.log(`🏢 Company ID: ${companyId}`);
  
  try {
    // Step 1: Test exact match search
    console.log('\n📍 Step 1: Testing exact match search...');
    const { data: exactInvoice, error: exactError } = await supabase
      .from("invoices")
      .select("id, invoice_number, status, subtotal, tax_amount, total_amount, shipping, paid_amount, invoice_date, invoice_type, returned_amount, refund_amount, customer_id, bill_id, supplier_id")
      .eq("company_id", companyId)
      .eq("invoice_number", invoiceNumber)
      .maybeSingle();
    
    if (exactError) {
      console.log(`❌ Exact search error: ${exactError.message}`);
    } else if (exactInvoice) {
      console.log(`✅ Found exact match:`);
      console.log(`   Invoice Number: ${exactInvoice.invoice_number}`);
      console.log(`   Invoice Type: ${exactInvoice.invoice_type}`);
      console.log(`   Status: ${exactInvoice.status}`);
      console.log(`   Total Amount: ${exactInvoice.total_amount}`);
    } else {
      console.log(`⚠️  No exact match found for ${invoiceNumber}`);
      
      // Step 2: Test similar invoice search
      console.log('\n📍 Step 2: Testing similar invoice search...');
      const { data: similarInvoices, error: similarError } = await supabase
        .from("invoices")
        .select("id, invoice_number, status, subtotal, tax_amount, total_amount, shipping, paid_amount, invoice_date, invoice_type, returned_amount, refund_amount, customer_id, bill_id, supplier_id")
        .eq("company_id", companyId)
        .or(`invoice_number.ilike.%${invoiceNumber}%,invoice_number.ilike.${invoiceNumber}%`)
        .limit(5);
      
      if (similarError) {
        console.log(`❌ Similar search error: ${similarError.message}`);
      } else if (similarInvoices && similarInvoices.length > 0) {
        console.log(`✅ Found ${similarInvoices.length} similar invoices:`);
        similarInvoices.forEach((inv, index) => {
          console.log(`   ${index + 1}. ${inv.invoice_number} (${inv.invoice_type}) - ${inv.status} - ${inv.total_amount}`);
        });
      } else {
        console.log(`⚠️  No similar invoices found`);
      }
      
      // Step 3: Test return invoice search
      console.log('\n📍 Step 3: Testing return invoice search...');
      if (invoiceNumber.toLowerCase().includes('sr') || invoiceNumber.toLowerCase().includes('return')) {
        console.log(`🔍 Searching for return invoices with pattern: ${invoiceNumber.replace(/[^0-9]/g, '')}`);
        
        const { data: returnInvoices, error: returnError } = await supabase
          .from("invoices")
          .select("id, invoice_number, status, subtotal, tax_amount, total_amount, shipping, paid_amount, invoice_date, invoice_type, returned_amount, refund_amount, customer_id, bill_id, supplier_id")
          .eq("company_id", companyId)
          .eq("invoice_type", "sales_return")
          .or(`invoice_number.ilike.%${invoiceNumber.replace(/[^0-9]/g, '')}%`)
          .limit(5);
        
        if (returnError) {
          console.log(`❌ Return invoice search error: ${returnError.message}`);
        } else if (returnInvoices && returnInvoices.length > 0) {
          console.log(`✅ Found ${returnInvoices.length} return invoices:`);
          returnInvoices.forEach((inv, index) => {
            console.log(`   ${index + 1}. ${inv.invoice_number} (${inv.invoice_type}) - ${inv.status} - ${inv.total_amount}`);
          });
        } else {
          console.log(`⚠️  No return invoices found`);
        }
      } else {
        console.log(`ℹ️  Invoice number doesn't contain 'SR' or 'return', skipping return invoice search`);
      }
    }
    
    console.log('\n✅ Test completed successfully');
    
  } catch (error) {
    console.log(`❌ Test failed with error: ${error.message}`);
  }
}

// Run the test
testRepairInvoiceLogic();