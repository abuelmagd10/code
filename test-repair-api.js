// Test script for the repair invoice API
async function testRepairInvoiceAPI() {
  const baseUrl = 'http://localhost:3000';
  const invoiceNumber = 'INV-0028';
  
  console.log(`🧪 Testing repair invoice API for: ${invoiceNumber}`);
  
  try {
    // Test GET request
    const response = await fetch(`${baseUrl}/api/repair-invoice?invoice_number=${invoiceNumber}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    
    console.log(`📊 Response Status: ${response.status}`);
    console.log(`📄 Response Headers: ${JSON.stringify(Object.fromEntries(response.headers.entries()), null, 2)}`);
    
    const text = await response.text();
    console.log('📄 Raw Response:', text.substring(0, 500));
    
    let data;
    try {
      data = JSON.parse(text);
      console.log('📄 Response Data:', JSON.stringify(data, null, 2));
    } catch (e) {
      console.log('❌ Response is not JSON, showing HTML content');
      console.log('📄 HTML Response:', text.substring(0, 1000));
      return;
    }
    
    if (response.status === 404) {
      console.log('❌ Invoice not found. Checking for suggestions...');
      if (data.suggestions && data.suggestions.length > 0) {
        console.log('💡 Suggestions found:');
        data.suggestions.forEach((suggestion, index) => {
          console.log(`  ${index + 1}. ${suggestion.invoice_number} (${suggestion.invoice_type}) - ${suggestion.status} - ${suggestion.total_amount}`);
        });
      }
    } else if (response.status === 200) {
      console.log('✅ Repair successful!');
      console.log(`📋 Summary: ${data.summary?.invoice_number} - ${data.summary?.invoice_type} - ${data.summary?.invoice_status}`);
    }
    
  } catch (error) {
    console.error('❌ API Test Error:', error.message);
  }
}

// Run the test
testRepairInvoiceAPI();