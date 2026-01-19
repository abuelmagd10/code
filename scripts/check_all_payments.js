// =====================================================
// فحص جميع المدفوعات
// =====================================================

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://hfvsbsizokxontflgdyn.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhmdnNic2l6b2t4b250ZmxnZHluIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI1MDAxMjEsImV4cCI6MjA3ODA3NjEyMX0.sOp6ULrun11tZs9lhuPPtVCfi3XyYKAvhW3EiNR1G1A';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function checkAllPayments() {
  console.log('\n🔍 فحص جميع المدفوعات\n');
  
  try {
    // جلب جميع المدفوعات
    const { data: payments, error: paymentsError } = await supabase
      .from('payments')
      .select('*')
      .order('payment_date', { ascending: false });
    
    if (paymentsError) {
      console.error('❌ خطأ في جلب المدفوعات:', paymentsError);
      return;
    }
    
    console.log(`📊 إجمالي المدفوعات: ${payments?.length || 0}\n`);
    
    if (payments && payments.length > 0) {
      // جلب الفواتير المرتبطة
      const billIds = [...new Set(payments.map(p => p.bill_id).filter(Boolean))];
      const { data: bills } = await supabase
        .from('bills')
        .select('id, bill_number, total_amount, returned_amount, supplier_id, company_id')
        .in('id', billIds);
      
      const billsMap = new Map(bills?.map(b => [b.id, b]) || []);
      
      payments.forEach((p, idx) => {
        const bill = billsMap.get(p.bill_id);
        console.log(`${idx + 1}. مدفوعة ID: ${p.id}`);
        console.log(`   تاريخ: ${p.payment_date}`);
        console.log(`   المبلغ: ${p.amount}`);
        console.log(`   الطريقة: ${p.payment_method || 'غير محدد'}`);
        console.log(`   فاتورة مرتبطة: ${bill ? bill.bill_number : 'لا توجد'}`);
        if (bill) {
          const originalTotal = (bill.total_amount || 0) + (bill.returned_amount || 0);
          const netAmount = bill.total_amount || 0;
          const difference = p.amount - netAmount;
          console.log(`   المبلغ الصافي للفاتورة: ${netAmount}`);
          console.log(`   الفرق: ${difference}`);
          if (difference > 0) {
            console.log(`   ⚠️ مدفوعة زائدة بمقدار: ${difference}`);
          }
        }
        console.log('');
      });
      
      // ملخص
      const paymentsWithBills = payments.filter(p => p.bill_id && billsMap.has(p.bill_id));
      const overpayments = paymentsWithBills.filter(p => {
        const bill = billsMap.get(p.bill_id);
        return p.amount > (bill.total_amount || 0);
      });
      
      const totalOverpayment = overpayments.reduce((sum, p) => {
        const bill = billsMap.get(p.bill_id);
        return sum + (p.amount - (bill.total_amount || 0));
      }, 0);
      
      console.log('='.repeat(80));
      console.log('الملخص:');
      console.log(`   إجمالي المدفوعات: ${payments.length}`);
      console.log(`   المدفوعات المرتبطة بفواتير: ${paymentsWithBills.length}`);
      console.log(`   المدفوعات الزائدة: ${overpayments.length}`);
      console.log(`   إجمالي المبالغ الزائدة: ${totalOverpayment.toFixed(2)}`);
      
    } else {
      console.log('⚠️ لا توجد مدفوعات في قاعدة البيانات');
    }
    
  } catch (error) {
    console.error('❌ خطأ:', error);
  }
}

checkAllPayments();
