// =====================================================
// سكريبت Node.js لتحليل المدفوعات الزائدة
// =====================================================

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// معلومات الاتصال من mcp.json
const SUPABASE_URL = 'https://hfvsbsizokxontflgdyn.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhmdnNic2l6b2t4b250ZmxnZHluIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI1MDAxMjEsImV4cCI6MjA3ODA3NjEyMX0.sOp6ULrun11tZs9lhuPPtVCfi3XyYKAvhW3EiNR1G1A';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function runQuery(query, description) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(description);
  console.log('='.repeat(60));
  
  try {
    const { data, error } = await supabase.rpc('exec_sql', { sql_query: query });
    
    if (error) {
      // إذا لم تكن هناك دالة exec_sql، نجرب طريقة أخرى
      console.log('⚠️ RPC method not available, trying direct query...');
      
      // نحاول تنفيذ الاستعلام مباشرة
      const { data: directData, error: directError } = await supabase
        .from('payments')
        .select('*')
        .limit(1);
      
      if (directError) {
        console.error('❌ Error:', directError.message);
        return null;
      }
      
      // للأسف، Supabase JS client لا يدعم تنفيذ SQL مباشرة
      // نحتاج إلى استخدام REST API أو psql
      console.log('ℹ️ Direct SQL execution not supported via JS client');
      console.log('📋 Please run the SQL scripts directly using psql or Supabase SQL Editor');
      return null;
    }
    
    console.table(data);
    return data;
  } catch (err) {
    console.error('❌ Error:', err.message);
    return null;
  }
}

async function analyzePayments() {
  console.log('\n🔍 Starting Payment Analysis...\n');
  
  // 1. تحليل المدفوعات الزائدة
  const overpaymentQuery = `
    SELECT
      '1. Overpayments' AS check_type,
      p.id AS payment_id,
      p.payment_date,
      p.amount AS payment_amount,
      b.bill_number,
      COALESCE(b.total_amount, 0) + COALESCE(b.returned_amount, 0) AS original_bill_total,
      COALESCE(b.returned_amount, 0) AS total_returns,
      b.total_amount AS net_bill_amount,
      p.amount - b.total_amount AS overpayment_amount,
      s.name AS supplier_name,
      c.name AS company_name,
      CASE
        WHEN p.amount > b.total_amount THEN '⚠️ مدفوعة زائدة'
        WHEN p.amount = b.total_amount THEN '✅ المدفوعة صحيحة'
        ELSE 'ℹ️ المدفوعة أقل من المبلغ الصافي'
      END AS status
    FROM payments p
    JOIN bills b ON b.id = p.bill_id
    LEFT JOIN suppliers s ON s.id = p.supplier_id
    LEFT JOIN companies c ON c.id = p.company_id
    WHERE p.amount > b.total_amount
    ORDER BY (p.amount - b.total_amount) DESC;
  `;
  
  // 2. ملخص المدفوعات الزائدة
  const summaryQuery = `
    SELECT
      '2. Overpayment Summary' AS check_type,
      COUNT(*) AS overpayment_count,
      SUM(p.amount - b.total_amount) AS total_overpayment,
      STRING_AGG(DISTINCT c.name, ', ') AS companies
    FROM payments p
    JOIN bills b ON b.id = p.bill_id
    LEFT JOIN companies c ON c.id = p.company_id
    WHERE p.amount > b.total_amount;
  `;
  
  // للأسف، Supabase JS client لا يدعم تنفيذ SQL مباشرة
  console.log('📋 SQL Queries prepared. Please run them using:');
  console.log('   1. psql command line');
  console.log('   2. Supabase SQL Editor');
  console.log('   3. Or use the SQL scripts directly\n');
  
  console.log('📄 Query 1: Overpayments');
  console.log(overpaymentQuery);
  console.log('\n📄 Query 2: Summary');
  console.log(summaryQuery);
}

// تشغيل التحليل
analyzePayments().catch(console.error);
