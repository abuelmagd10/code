// =====================================================
// فحص تفصيلي لفاتورة BILL-0001
// =====================================================

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://hfvsbsizokxontflgdyn.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhmdnNic2l6b2t4b250ZmxnZHluIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI1MDAxMjEsImV4cCI6MjA3ODA3NjEyMX0.sOp6ULrun11tZs9lhuPPtVCfi3XyYKAvhW3EiNR1G1A';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function checkBill0001() {
  console.log('\n🔍 فحص تفصيلي لفاتورة BILL-0001\n');
  
  try {
    // جلب الفاتورة
    const { data: bills, error: billsError } = await supabase
      .from('bills')
      .select('*')
      .eq('bill_number', 'BILL-0001')
      .limit(1);
    
    if (billsError) {
      console.error('❌ خطأ في جلب الفاتورة:', billsError);
      return;
    }
    
    if (!bills || bills.length === 0) {
      console.log('⚠️ لم يتم العثور على فاتورة BILL-0001');
      return;
    }
    
    const bill = bills[0];
    
    console.log('📄 تفاصيل الفاتورة:');
    console.log(`   رقم الفاتورة: ${bill.bill_number}`);
    console.log(`   تاريخ الفاتورة: ${bill.bill_date}`);
    console.log(`   المبلغ الإجمالي (total_amount): ${bill.total_amount}`);
    console.log(`   المرتجعات (returned_amount): ${bill.returned_amount || 0}`);
    console.log(`   المدفوع (paid_amount): ${bill.paid_amount || 0}`);
    console.log(`   الحالة: ${bill.status}`);
    
    const originalTotal = (bill.total_amount || 0) + (bill.returned_amount || 0);
    console.log(`   الإجمالي الأصلي (محسوب): ${originalTotal}`);
    
    // جلب المدفوعات
    const { data: payments, error: paymentsError } = await supabase
      .from('payments')
      .select('*')
      .eq('bill_id', bill.id);
    
    if (paymentsError) {
      console.error('❌ خطأ في جلب المدفوعات:', paymentsError);
      return;
    }
    
    console.log(`\n💰 المدفوعات (${payments?.length || 0}):`);
    if (payments && payments.length > 0) {
      payments.forEach((p, idx) => {
        console.log(`   ${idx + 1}. تاريخ: ${p.payment_date}, المبلغ: ${p.amount}, الطريقة: ${p.payment_method}`);
      });
      const totalPaid = payments.reduce((sum, p) => sum + (p.amount || 0), 0);
      console.log(`   إجمالي المدفوع: ${totalPaid}`);
      console.log(`   المبلغ الصافي للفاتورة: ${bill.total_amount}`);
      console.log(`   الفرق: ${totalPaid - bill.total_amount}`);
      
      if (totalPaid > bill.total_amount) {
        console.log(`   ⚠️ مدفوعة زائدة بمقدار: ${totalPaid - bill.total_amount}`);
      } else if (totalPaid === bill.total_amount) {
        console.log(`   ✅ المدفوعات تطابق المبلغ الصافي`);
      } else {
        console.log(`   ℹ️ المدفوعات أقل من المبلغ الصافي`);
      }
    } else {
      console.log('   لا توجد مدفوعات');
    }
    
    // جلب إشعارات الدائن المرتبطة
    const { data: vendorCredits, error: vcError } = await supabase
      .from('vendor_credits')
      .select('*')
      .eq('bill_id', bill.id)
      .in('status', ['approved', 'applied', 'open', 'partially_applied']);
    
    if (vcError) {
      console.error('❌ خطأ في جلب إشعارات الدائن:', vcError);
      return;
    }
    
    console.log(`\n📋 إشعارات الدائن المرتبطة (${vendorCredits?.length || 0}):`);
    if (vendorCredits && vendorCredits.length > 0) {
      vendorCredits.forEach((vc, idx) => {
        console.log(`   ${idx + 1}. رقم: ${vc.credit_number}, المبلغ: ${vc.total_amount}, الحالة: ${vc.status}`);
      });
      const totalCredits = vendorCredits.reduce((sum, vc) => sum + (vc.total_amount || 0), 0);
      console.log(`   إجمالي إشعارات الدائن: ${totalCredits}`);
    } else {
      console.log('   لا توجد إشعارات دائنة مرتبطة مباشرة');
    }
    
  } catch (error) {
    console.error('❌ خطأ:', error);
  }
}

checkBill0001();
