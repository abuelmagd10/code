// =====================================================
// فحص جميع الفواتير والمدفوعات
// =====================================================

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://hfvsbsizokxontflgdyn.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhmdnNic2l6b2t4b250ZmxnZHluIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MjUwMDEyMSwiZXhwIjoyMDc4MDc2MTIxfQ.2pITPH3Xeo68u24BSyQawqVIUNSIHvhlWBMls4meTA4';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function checkAllBills() {
  console.log('\n🔍 فحص جميع الفواتير والمدفوعات\n');
  
  try {
    // جلب جميع الفواتير
    const { data: bills, error: billsError } = await supabase
      .from('bills')
      .select('id, bill_number, total_amount, returned_amount, paid_amount, status, supplier_id, company_id')
      .order('bill_date', { ascending: false })
      .limit(20);
    
    if (billsError) {
      console.error('❌ خطأ في جلب الفواتير:', billsError);
      return;
    }
    
    // جلب جميع المدفوعات
    const { data: payments, error: paymentsError } = await supabase
      .from('payments')
      .select('id, bill_id, amount, payment_date, payment_method')
      .not('bill_id', 'is', null);
    
    if (paymentsError) {
      console.error('❌ خطأ في جلب المدفوعات:', paymentsError);
      return;
    }
    
    // جلب الموردين والشركات
    const supplierIds = [...new Set(bills.map(b => b.supplier_id).filter(Boolean))];
    const companyIds = [...new Set(bills.map(b => b.company_id).filter(Boolean))];
    
    const { data: suppliers } = await supabase
      .from('suppliers')
      .select('id, name')
      .in('id', supplierIds);
    
    const { data: companies } = await supabase
      .from('companies')
      .select('id, name')
      .in('id', companyIds);
    
    const suppliersMap = new Map(suppliers?.map(s => [s.id, s]) || []);
    const companiesMap = new Map(companies?.map(c => [c.id, c]) || []);
    const paymentsByBill = new Map();
    
    payments.forEach(p => {
      if (!paymentsByBill.has(p.bill_id)) {
        paymentsByBill.set(p.bill_id, []);
      }
      paymentsByBill.get(p.bill_id).push(p);
    });
    
    console.log('📄 الفواتير والمدفوعات:\n');
    
    bills.forEach(bill => {
      const supplier = suppliersMap.get(bill.supplier_id);
      const company = companiesMap.get(bill.company_id);
      const billPayments = paymentsByBill.get(bill.id) || [];
      const totalPaid = billPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
      const originalTotal = (bill.total_amount || 0) + (bill.returned_amount || 0);
      const netAmount = bill.total_amount || 0;
      const difference = totalPaid - netAmount;
      
      console.log(`📄 ${bill.bill_number} (${company?.name || 'غير معروف'})`);
      console.log(`   المورد: ${supplier?.name || 'غير معروف'}`);
      console.log(`   الإجمالي الأصلي: ${originalTotal}`);
      console.log(`   المرتجعات: ${bill.returned_amount || 0}`);
      console.log(`   المبلغ الصافي: ${netAmount}`);
      console.log(`   المدفوعات: ${billPayments.length} مدفوعة (إجمالي: ${totalPaid})`);
      
      if (difference > 0) {
        console.log(`   ⚠️ مدفوعة زائدة: ${difference}`);
      } else if (difference === 0) {
        console.log(`   ✅ متطابق`);
      } else {
        console.log(`   ℹ️ المدفوعات أقل: ${Math.abs(difference)}`);
      }
      console.log('');
    });
    
    // ملخص
    const overpayments = bills.filter(bill => {
      const billPayments = paymentsByBill.get(bill.id) || [];
      const totalPaid = billPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
      return totalPaid > (bill.total_amount || 0);
    });
    
    const totalOverpayment = overpayments.reduce((sum, bill) => {
      const billPayments = paymentsByBill.get(bill.id) || [];
      const totalPaid = billPayments.reduce((s, p) => s + (p.amount || 0), 0);
      return sum + (totalPaid - (bill.total_amount || 0));
    }, 0);
    
    console.log('='.repeat(80));
    console.log('الملخص:');
    console.log(`   عدد الفواتير: ${bills.length}`);
    console.log(`   عدد الفواتير بمدفوعات زائدة: ${overpayments.length}`);
    console.log(`   إجمالي المبالغ الزائدة: ${totalOverpayment.toFixed(2)}`);
    
  } catch (error) {
    console.error('❌ خطأ:', error);
  }
}

checkAllBills();
