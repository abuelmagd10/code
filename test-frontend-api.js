// Test API call directly
fetch('/api/sales-orders')
  .then(response => response.json())
  .then(data => {
    console.log('API Response:', data);
    if (data.success && data.data) {
      console.log(`Found ${data.data.length} sales orders:`);
      data.data.forEach(order => {
        console.log(`- SO-${order.so_number}: ${order.status}`);
      });
    } else {
      console.log('No orders or error:', data.error);
    }
  })
  .catch(error => {
    console.error('API Error:', error);
  });