const { createClient } = require('@supabase/supabase-js')

const supabaseUrl = 'https://hfvsbsizokxontflgdyn.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhmdnNic2l6b2t4b250ZmxnZHluIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MjUwMDEyMSwiZXhwIjoyMDc4MDc2MTIxfQ.2pITPH3Xeo68u24BSyQawqVIUNSIHvhlWBMls4meTA4'

const supabase = createClient(supabaseUrl, supabaseKey)

async function fullDatabaseAnalysis() {
  try {
    console.log('🔍 تحليل شامل لقاعدة البيانات...\n')

    // 1. فحص جميع الجداول
    console.log('📋 1. جميع الجداول في قاعدة البيانات:')
    const { data: tables } = await supabase
      .from('information_schema.tables')
      .select('table_name')
      .eq('table_schema', 'public')
      .order('table_name')

    console.log('الجداول الموجودة:', tables?.map(t => t.table_name).join(', '))

    // 2. فحص هيكل جدول sales_orders
    console.log('\n📊 2. هيكل جدول sales_orders:')
    const { data: soColumns } = await supabase
      .from('information_schema.columns')
      .select('column_name, data_type, is_nullable')
      .eq('table_name', 'sales_orders')
      .order('ordinal_position')

    console.log('أعمدة sales_orders:', soColumns)

    // 3. فحص RLS policies
    console.log('\n🛡️ 3. سياسات RLS:')
    const { data: policies } = await supabase
      .from('pg_policies')
      .select('*')
      .eq('tablename', 'sales_orders')

    console.log('عدد سياسات sales_orders:', policies?.length || 0)
    if (policies?.length > 0) {
      policies.forEach(p => {
        console.log(`- ${p.policyname}: ${p.cmd} - ${p.qual}`)
      })
    }

    // 4. فحص triggers
    console.log('\n⚙️ 4. Triggers على sales_orders:')
    const { data: triggers } = await supabase
      .from('information_schema.triggers')
      .select('*')
      .eq('event_object_table', 'sales_orders')

    console.log('عدد Triggers:', triggers?.length || 0)
    if (triggers?.length > 0) {
      triggers.forEach(t => {
        console.log(`- ${t.trigger_name}: ${t.event_manipulation}`)
      })
    }

    // 5. فحص views أو materialized views
    console.log('\n👁️ 5. Views المتعلقة بأوامر البيع:')
    const { data: views } = await supabase
      .from('information_schema.views')
      .select('table_name, view_definition')
      .ilike('table_name', '%sales%')

    console.log('عدد Views:', views?.length || 0)

    // 6. فحص البيانات الفعلية مع تفاصيل أكثر
    console.log('\n📊 6. البيانات الفعلية لـ SO-0001:')
    const companyId = '3a663f6b-0689-4952-93c1-6d958c737089'
    
    const { data: soData } = await supabase
      .from('sales_orders')
      .select('*')
      .eq('company_id', companyId)
      .eq('so_number', 'SO-0001')
      .single()

    console.log('جميع بيانات SO-0001:', soData)

    // 7. فحص العلاقات الخارجية
    console.log('\n🔗 7. العلاقات الخارجية:')
    const { data: constraints } = await supabase
      .from('information_schema.table_constraints')
      .select('*')
      .eq('table_name', 'sales_orders')
      .eq('constraint_type', 'FOREIGN KEY')

    console.log('عدد العلاقات الخارجية:', constraints?.length || 0)

    // 8. فحص indexes
    console.log('\n📇 8. Indexes على sales_orders:')
    const { data: indexes } = await supabase
      .from('pg_indexes')
      .select('*')
      .eq('tablename', 'sales_orders')

    console.log('عدد Indexes:', indexes?.length || 0)

    // 9. فحص permissions
    console.log('\n🔐 9. صلاحيات الجدول:')
    const { data: permissions } = await supabase
      .from('information_schema.role_table_grants')
      .select('*')
      .eq('table_name', 'sales_orders')

    console.log('عدد الصلاحيات:', permissions?.length || 0)

    // 10. محاولة query مباشر بدون supabase client
    console.log('\n🔍 10. استعلام SQL مباشر:')
    const { data: directQuery, error: directError } = await supabase
      .rpc('exec_sql', {
        query: `SELECT so_number, total, status, updated_at FROM sales_orders WHERE company_id = '${companyId}' AND so_number = 'SO-0001'`
      })

    if (directError) {
      console.log('خطأ في الاستعلام المباشر:', directError.message)
    } else {
      console.log('نتيجة الاستعلام المباشر:', directQuery)
    }

    // 11. فحص cache أو connection pooling
    console.log('\n⚡ 11. معلومات الاتصال:')
    const { data: connectionInfo } = await supabase
      .from('pg_stat_activity')
      .select('state, query')
      .limit(5)

    console.log('حالة الاتصالات:', connectionInfo?.length || 0)

  } catch (error) {
    console.error('❌ خطأ في التحليل:', error.message)
  }
}

fullDatabaseAnalysis()