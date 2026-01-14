const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing required environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function analyzeSalesOrderIssue() {
  try {
    console.log('🔍 Analyzing sales order cost center/warehouse fetching issue...\n');
    
    // البحث عن شركة "تست"
    console.log('1. Searching for company "تست"...');
    const { data: testCompany, error: companyError } = await supabase
      .from('companies')
      .select('*')
      .ilike('name', '%تست%')
      .single();
      
    if (companyError || !testCompany) {
      console.log('❌ Company "تست" not found');
      
      // عرض جميع الشركات
      const { data: allCompanies } = await supabase
        .from('companies')
        .select('id, name')
        .limit(10);
        
      console.log('Available companies:');
      allCompanies?.forEach(company => {
        console.log(`- ${company.name} (${company.id})`);
      });
    } else {
      console.log('✅ Found company "تست":');
      console.log('Company ID:', testCompany.id);
      console.log('Company Name:', testCompany.name);
      
      await analyzeCompanyEmployees(testCompany.id);
    }
    
    console.log('\n2. Checking general sales order creation flow...');
    await checkSalesOrderCreationFlow();
    
  } catch (error) {
    console.error('❌ Error analyzing issue:', error.message);
  }
}

async function analyzeCompanyEmployees(companyId) {
  console.log('\n🔍 Analyzing employees for company', companyId);
  
  // الحصول على جميع موظفي الشركة
  const { data: employees, error: empError } = await supabase
    .from('company_members')
    .select(`
      *,
      users!inner(id, email, username, full_name),
      branches!inner(id, name, code, default_cost_center_id, default_warehouse_id)
    `)
    .eq('company_id', companyId);
    
  if (empError) {
    console.log('❌ Error fetching employees:', empError.message);
    return;
  }
  
  console.log(`✅ Found ${employees?.length || 0} employees`);
  
  employees?.forEach((employee, index) => {
    console.log(`\nEmployee ${index + 1}:`);
    console.log('User:', employee.users?.email || employee.users?.username);
    console.log('Branch:', employee.branches?.name);
    console.log('Branch ID:', employee.branch_id);
    console.log('Default Cost Center ID:', employee.branches?.default_cost_center_id);
    console.log('Default Warehouse ID:', employee.branches?.default_warehouse_id);
    console.log('Direct Cost Center ID:', employee.cost_center_id);
    console.log('Direct Warehouse ID:', employee.warehouse_id);
    
    // التحقق من المشاكل
    if (!employee.branch_id) {
      console.log('⚠️  ISSUE: Employee has no branch assigned!');
    }
    if (!employee.branches?.default_cost_center_id) {
      console.log('⚠️  ISSUE: Branch has no default cost center!');
    }
    if (!employee.branches?.default_warehouse_id) {
      console.log('⚠️  ISSUE: Branch has no default warehouse!');
    }
  });
}

async function checkSalesOrderCreationFlow() {
  console.log('\n3. Checking sales order creation mechanism...');
  
  // التحقق من صفحة إنشاء أمر البيع
  console.log('Checking app/sales-orders/new/page.tsx...');
  
  // التحقق من الـ hooks المستخدمة
  const { data: hooks } = await supabase
    .from('company_members')
    .select('*')
    .limit(1);
    
  if (hooks?.length > 0) {
    console.log('✅ Found company_members data structure');
    console.log('Available fields:', Object.keys(hooks[0]));
  }
  
  // التحقق من عمليات أمر البيع الأخيرة
  const { data: recentOrders } = await supabase
    .from('sales_orders')
    .select(`
      *,
      cost_centers(id, cost_center_name),
      warehouses(id, name),
      users(id, email)
    `)
    .order('created_at', { ascending: false })
    .limit(5);
    
  if (recentOrders?.length > 0) {
    console.log('\n✅ Recent sales orders:');
    recentOrders.forEach((order, index) => {
      console.log(`\nOrder ${index + 1}:`);
      console.log('ID:', order.id);
      console.log('Number:', order.order_number);
      console.log('Cost Center:', order.cost_centers?.cost_center_name || 'NULL');
      console.log('Warehouse:', order.warehouses?.name || 'NULL');
      console.log('Created By:', order.users?.email);
      console.log('Created At:', order.created_at);
      
      if (!order.cost_center_id) {
        console.log('⚠️  ORDER ISSUE: No cost center assigned!');
      }
      if (!order.warehouse_id) {
        console.log('⚠️  ORDER ISSUE: No warehouse assigned!');
      }
    });
  } else {
    console.log('ℹ️  No recent sales orders found');
  }
}

analyzeSalesOrderIssue();