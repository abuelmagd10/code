// =====================================================
// سكريبت Node.js لتحليل المدفوعات الزائدة
// =====================================================

const { createClient } = require('@supabase/supabase-js');

// معلومات الاتصال من mcp.json
const SUPABASE_URL = 'https://hfvsbsizokxontflgdyn.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhmdnNic2l6b2t4b250ZmxnZHluIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI1MDAxMjEsImV4cCI6MjA3ODA3NjEyMX0.sOp6ULrun11tZs9lhuPPtVCfi3XyYKAvhW3EiNR1G1A';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function analyzeOverpayments() {
  console.log('\n🔍 تحليل المدفوعات الزائدة...\n');
  
  try {
    // جلب المدفوعات
    const { data: payments, error: paymentsError } = await supabase
      .from('payments')
      .select('id, payment_date, amount, bill_id, supplier_id, company_id')
      .not('bill_id', 'is', null);
    
    if (paymentsError) {
      console.error('❌ خطأ في جلب المدفوعات:', paymentsError);
      return;
    }
    
    // جلب الفواتير
    const billIds = [...new Set(payments.map(p => p.bill_id).filter(Boolean))];
    const { data: bills, error: billsError } = await supabase
      .from('bills')
      .select('id, bill_number, total_amount, returned_amount, supplier_id, company_id')
      .in('id', billIds);
    
    if (billsError) {
      console.error('❌ خطأ في جلب الفواتير:', billsError);
      return;
    }
    
    // جلب الموردين والشركات
    const supplierIds = [...new Set([...payments.map(p => p.supplier_id), ...bills.map(b => b.supplier_id)].filter(Boolean))];
    const companyIds = [...new Set([...payments.map(p => p.company_id), ...bills.map(b => b.company_id)].filter(Boolean))];
    
    const { data: suppliers } = await supabase
      .from('suppliers')
      .select('id, name')
      .in('id', supplierIds);
    
    const { data: companies } = await supabase
      .from('companies')
      .select('id, name')
      .in('id', companyIds);
    
    // دمج البيانات
    const billsMap = new Map(bills.map(b => [b.id, b]));
    const suppliersMap = new Map(suppliers?.map(s => [s.id, s]) || []);
    const companiesMap = new Map(companies?.map(c => [c.id, c]) || []);
    
    const paymentsWithBills = payments.map(p => {
      const bill = billsMap.get(p.bill_id);
      return {
        ...p,
        bills: bill ? {
          ...bill,
          suppliers: bill.supplier_id ? suppliersMap.get(bill.supplier_id) : null,
          companies: bill.company_id ? companiesMap.get(bill.company_id) : null
        } : null
      };
    });
    
    // فلترة المدفوعات الزائدة
    const overpayments = paymentsWithBills.filter(p => {
      const bill = p.bills;
      if (!bill) return false;
      const netAmount = bill.total_amount || 0;
      return p.amount > netAmount;
    });
    
    console.log(`\n${'='.repeat(80)}`);
    console.log('1. المدفوعات الزائدة');
    console.log('='.repeat(80));
    
    if (overpayments.length === 0) {
      console.log('✅ لا توجد مدفوعات زائدة');
    } else {
      overpayments.forEach(p => {
        const bill = p.bills;
        const originalTotal = (bill.total_amount || 0) + (bill.returned_amount || 0);
        const netAmount = bill.total_amount || 0;
        const overpayment = p.amount - netAmount;
        
        console.log(`\n📄 فاتورة: ${bill.bill_number}`);
        console.log(`   المورد: ${bill.suppliers?.name || 'غير معروف'}`);
        console.log(`   الشركة: ${bill.companies?.name || 'غير معروف'}`);
        console.log(`   تاريخ الدفع: ${p.payment_date}`);
        console.log(`   الإجمالي الأصلي: ${originalTotal.toFixed(2)}`);
        console.log(`   المرتجعات: ${(bill.returned_amount || 0).toFixed(2)}`);
        console.log(`   المبلغ الصافي: ${netAmount.toFixed(2)}`);
        console.log(`   المدفوع: ${p.amount.toFixed(2)}`);
        console.log(`   الزيادة: ${overpayment.toFixed(2)} ⚠️`);
      });
    }
    
    // ملخص
    const totalOverpayment = overpayments.reduce((sum, p) => {
      const bill = p.bills;
      const netAmount = bill?.total_amount || 0;
      return sum + (p.amount - netAmount);
    }, 0);
    
    const affectedCompanies = [...new Set(overpayments.map(p => p.bills?.companies?.name).filter(Boolean))];
    
    console.log(`\n${'='.repeat(80)}`);
    console.log('2. ملخص المدفوعات الزائدة');
    console.log('='.repeat(80));
    console.log(`   عدد المدفوعات الزائدة: ${overpayments.length}`);
    console.log(`   إجمالي المبالغ الزائدة: ${totalOverpayment.toFixed(2)}`);
    console.log(`   الشركات المتأثرة: ${affectedCompanies.join(', ') || 'لا توجد'}`);
    
    return {
      overpaymentCount: overpayments.length,
      totalOverpayment,
      companies: affectedCompanies
    };
    
  } catch (error) {
    console.error('❌ خطأ:', error);
    throw error;
  }
}

async function analyzeVendorCreditsExcess() {
  console.log('\n🔍 تحليل إشعارات الدائن الزائدة...\n');
  
  try {
    // جلب إشعارات الدائن
    const { data: vendorCredits, error: vcError } = await supabase
      .from('vendor_credits')
      .select(`
        id,
        credit_number,
        credit_date,
        total_amount,
        status,
        supplier_id,
        company_id,
        suppliers!inner (
          name
        ),
        companies!inner (
          name
        )
      `)
      .in('status', ['approved', 'applied', 'open', 'partially_applied']);
    
    if (vcError) {
      console.error('❌ خطأ في جلب إشعارات الدائن:', vcError);
      return;
    }
    
    // جلب الفواتير لكل supplier/company
    const { data: bills, error: billsError } = await supabase
      .from('bills')
      .select('supplier_id, company_id, total_amount')
      .in('status', ['sent', 'received', 'paid', 'partially_paid']);
    
    if (billsError) {
      console.error('❌ خطأ في جلب الفواتير:', billsError);
      return;
    }
    
    // حساب إجمالي إشعارات الدائن والفواتير لكل supplier/company
    const supplierTotals = new Map();
    
    vendorCredits.forEach(vc => {
      const key = `${vc.supplier_id}_${vc.company_id}`;
      if (!supplierTotals.has(key)) {
        supplierTotals.set(key, {
          supplierName: vc.suppliers?.name,
          companyName: vc.companies?.name,
          totalCredits: 0,
          totalBills: 0
        });
      }
      const totals = supplierTotals.get(key);
      totals.totalCredits += vc.total_amount || 0;
    });
    
    bills.forEach(bill => {
      const key = `${bill.supplier_id}_${bill.company_id}`;
      if (supplierTotals.has(key)) {
        const totals = supplierTotals.get(key);
        totals.totalBills += bill.total_amount || 0;
      }
    });
    
    // فلترة الإشعارات الزائدة
    const excessCredits = Array.from(supplierTotals.values()).filter(t => 
      t.totalCredits > t.totalBills
    );
    
    console.log(`\n${'='.repeat(80)}`);
    console.log('إشعارات الدائن الزائدة');
    console.log('='.repeat(80));
    
    if (excessCredits.length === 0) {
      console.log('✅ لا توجد إشعارات دائنة زائدة');
    } else {
      excessCredits.forEach(t => {
        const excess = t.totalCredits - t.totalBills;
        console.log(`\n📄 المورد: ${t.supplierName}`);
        console.log(`   الشركة: ${t.companyName}`);
        console.log(`   إجمالي إشعارات الدائن: ${t.totalCredits.toFixed(2)}`);
        console.log(`   إجمالي الفواتير: ${t.totalBills.toFixed(2)}`);
        console.log(`   الزيادة: ${excess.toFixed(2)} ⚠️`);
      });
    }
    
    const totalExcess = excessCredits.reduce((sum, t) => 
      sum + (t.totalCredits - t.totalBills), 0
    );
    
    console.log(`\n${'='.repeat(80)}`);
    console.log('ملخص إشعارات الدائن الزائدة');
    console.log('='.repeat(80));
    console.log(`   عدد الموردين المتأثرين: ${excessCredits.length}`);
    console.log(`   إجمالي المبالغ الزائدة: ${totalExcess.toFixed(2)}`);
    
    return {
      excessCount: excessCredits.length,
      totalExcess
    };
    
  } catch (error) {
    console.error('❌ خطأ:', error);
    throw error;
  }
}

async function main() {
  try {
    console.log('\n' + '='.repeat(80));
    console.log('تحليل المبالغ الزائدة في النظام');
    console.log('='.repeat(80));
    
    const overpaymentResult = await analyzeOverpayments();
    const vendorCreditsResult = await analyzeVendorCreditsExcess();
    
    console.log(`\n${'='.repeat(80)}`);
    console.log('الملخص النهائي');
    console.log('='.repeat(80));
    console.log(`   المدفوعات الزائدة: ${(overpaymentResult?.totalOverpayment || 0).toFixed(2)}`);
    console.log(`   إشعارات الدائن الزائدة: ${(vendorCreditsResult?.totalExcess || 0).toFixed(2)}`);
    console.log(`   الإجمالي: ${((overpaymentResult?.totalOverpayment || 0) + (vendorCreditsResult?.totalExcess || 0)).toFixed(2)}`);
    
  } catch (error) {
    console.error('\n❌ خطأ عام:', error);
    process.exit(1);
  }
}

main();
