const { createClient } = require('@supabase/supabase-js');

async function debugInvoiceSearch() {
  // Initialize Supabase client
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://dummy.supabase.co',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'dummy_key'
  );

  try {
    // Test authentication first
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError) {
      console.log('❌ Authentication error:', authError.message);
      return;
    }
    
    if (!user) {
      console.log('❌ No authenticated user found');
      return;
    }
    
    console.log('✅ Authenticated as user:', user.email);
    
    // Get company ID
    const { data: company } = await supabase
      .from("companies")
      .select("id")
      .eq("user_id", user.id)
      .single();
    
    if (!company) {
      console.log('❌ No company found for user');
      return;
    }
    
    console.log('✅ Company ID:', company.id);
    
    // Search for invoice INV-0028
    console.log('\n🔍 Searching for invoice INV-0028...');
    
    const { data: invoice, error: invoiceError } = await supabase
      .from("invoices")
      .select("id, invoice_number, status, subtotal, tax_amount, total_amount, shipping, paid_amount, invoice_date, invoice_type, returned_amount, refund_amount, customer_id, bill_id, supplier_id")
      .eq("company_id", company.id)
      .eq("invoice_number", "INV-0028")
      .maybeSingle();
    
    if (invoiceError) {
      console.log('❌ Error searching for invoice:', invoiceError.message);
    } else if (!invoice) {
      console.log('❌ Invoice INV-0028 not found');
      
      // Let's search for similar invoices
      console.log('\n🔍 Searching for similar invoices (containing "0028")...');
      const { data: similarInvoices } = await supabase
        .from("invoices")
        .select("id, invoice_number, status, invoice_type, total_amount")
        .eq("company_id", company.id)
        .ilike("invoice_number", "%0028%");
      
      if (similarInvoices && similarInvoices.length > 0) {
        console.log('✅ Found similar invoices:');
        similarInvoices.forEach(inv => {
          console.log(`  - ${inv.invoice_number}: ${inv.invoice_type} | ${inv.status} | ${inv.total_amount}`);
        });
      } else {
        console.log('❌ No similar invoices found');
      }
      
      // Let's also check all return invoices
      console.log('\n🔍 Searching for all return invoices...');
      const { data: returnInvoices } = await supabase
        .from("invoices")
        .select("id, invoice_number, status, invoice_type, total_amount")
        .eq("company_id", company.id)
        .eq("invoice_type", "sales_return");
      
      if (returnInvoices && returnInvoices.length > 0) {
        console.log('✅ Found return invoices:');
        returnInvoices.forEach(inv => {
          console.log(`  - ${inv.invoice_number}: ${inv.invoice_type} | ${inv.status} | ${inv.total_amount}`);
        });
      } else {
        console.log('❌ No return invoices found');
      }
      
    } else {
      console.log('✅ Invoice found:');
      console.log('  Invoice ID:', invoice.id);
      console.log('  Invoice Number:', invoice.invoice_number);
      console.log('  Invoice Type:', invoice.invoice_type);
      console.log('  Status:', invoice.status);
      console.log('  Total Amount:', invoice.total_amount);
      console.log('  Customer ID:', invoice.customer_id);
      console.log('  Returned Amount:', invoice.returned_amount);
      console.log('  Refund Amount:', invoice.refund_amount);
    }
    
  } catch (error) {
    console.error('❌ Unexpected error:', error);
  }
}

// Run the debug script
debugInvoiceSearch();