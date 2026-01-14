const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing required environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function analyzeCompanyTestEmployees() {
  try {
    console.log('🔍 Analyzing company "تست" employees and their branch context...\n');
    
    // الحصول على معلومات شركة تست
    const { data: testCompany } = await supabase
      .from('companies')
      .select('*')
      .eq('name', 'تست')
      .single();
      
    if (!testCompany) {
      console.log('❌ Company "تست" not found');
      return;
    }
    
    console.log('✅ Company "تست" details:');
    console.log('Company ID:', testCompany.id);
    console.log('Company Name:', testCompany.name);
    console.log('Base Currency:', testCompany.base_currency);
    console.log('Created At:', testCompany.created_at);
    
    // الحصول على جميع موظفي الشركة
    console.log('\n🔍 Fetching company employees...');
    const { data: employees, error: empError } = await supabase
      .from('company_members')
      .select('*')
      .eq('company_id', testCompany.id);
      
    if (empError) {
      console.log('❌ Error fetching employees:', empError.message);
      return;
    }
    
    console.log(`✅ Found ${employees?.length || 0} employees`);
    
    // تحليل كل موظف
    for (let i = 0; i < (employees?.length || 0); i++) {
      const employee = employees[i];
      console.log(`\n${'='.repeat(60)}`);
      console.log(`Employee ${i + 1}:`);
      console.log('User ID:', employee.user_id);
      console.log('Email:', employee.email);
      console.log('Role:', employee.role);
      console.log('Branch ID:', employee.branch_id);
      console.log('Direct Cost Center ID:', employee.cost_center_id);
      console.log('Direct Warehouse ID:', employee.warehouse_id);
      
      if (!employee.branch_id) {
        console.log('❌ CRITICAL: Employee has no branch assigned!');
        continue;
      }
      
      // التحقق من تفاصيل الفرع
      const { data: branch, error: branchError } = await supabase
        .from('branches')
        .select('*')
        .eq('id', employee.branch_id)
        .single();
        
      if (branchError || !branch) {
        console.log('❌ Branch not found for branch ID:', employee.branch_id);
        continue;
      }
      
      console.log('\nBranch Details:');
      console.log('Branch ID:', branch.id);
      console.log('Branch Name:', branch.name);
      console.log('Branch Code:', branch.code);
      console.log('Is Main:', branch.is_main);
      console.log('Is Active:', branch.is_active);
      console.log('Default Cost Center ID:', branch.default_cost_center_id);
      console.log('Default Warehouse ID:', branch.default_warehouse_id);
      
      // التحقق من مركز التكلفة الافتراضي
      if (branch.default_cost_center_id) {
        const { data: costCenter, error: ccError } = await supabase
          .from('cost_centers')
          .select('*')
          .eq('id', branch.default_cost_center_id)
          .single();
          
        if (costCenter) {
          console.log('\nDefault Cost Center:');
          console.log('ID:', costCenter.id);
          console.log('Name:', costCenter.cost_center_name);
          console.log('Code:', costCenter.cost_center_code);
          console.log('Is Main:', costCenter.is_main);
          console.log('Is Active:', costCenter.is_active);
        } else {
          console.log('\n❌ Default cost center not found!');
        }
      } else {
        console.log('\n⚠️  Branch has no default cost center assigned!');
      }
      
      // التحقق من المخزن الافتراضي
      if (branch.default_warehouse_id) {
        const { data: warehouse, error: whError } = await supabase
          .from('warehouses')
          .select('*')
          .eq('id', branch.default_warehouse_id)
          .single();
          
        if (warehouse) {
          console.log('\nDefault Warehouse:');
          console.log('ID:', warehouse.id);
          console.log('Name:', warehouse.name);
          console.log('Code:', warehouse.code);
          console.log('Is Main:', warehouse.is_main);
          console.log('Is Active:', warehouse.is_active);
        } else {
          console.log('\n❌ Default warehouse not found!');
        }
      } else {
        console.log('\n⚠️  Branch has no default warehouse assigned!');
      }
      
      // التحقق من عمليات أمر البيع
      console.log('\n🔍 Checking recent sales orders for this employee...');
      const { data: salesOrders } = await supabase
        .from('sales_orders')
        .select('*')
        .eq('created_by', employee.user_id)
        .order('created_at', { ascending: false })
        .limit(3);
        
      if (salesOrders && salesOrders.length > 0) {
        console.log(`Found ${salesOrders.length} recent sales orders:`);
        salesOrders.forEach((order, index) => {
          console.log(`\nOrder ${index + 1}:`);
          console.log('ID:', order.id);
          console.log('Number:', order.order_number);
          console.log('Date:', order.order_date);
          console.log('Cost Center ID:', order.cost_center_id || 'NULL');
          console.log('Warehouse ID:', order.warehouse_id || 'NULL');
          console.log('Status:', order.status);
          
          if (!order.cost_center_id) {
            console.log('❌ ORDER ISSUE: No cost center assigned!');
          }
          if (!order.warehouse_id) {
            console.log('❌ ORDER ISSUE: No warehouse assigned!');
          }
        });
      } else {
        console.log('ℹ️  No sales orders found for this employee');
      }
    }
    
    // التحقق من الحوكمة العامة
    console.log(`\n${'='.repeat(60)}`);
    console.log('🔍 Overall Governance Analysis:');
    
    const { data: governanceCheck } = await supabase
      .from('company_members')
      .select('*')
      .eq('company_id', testCompany.id);
      
    const issues = {
      noBranch: 0,
      noDefaultCC: 0,
      noDefaultWH: 0,
      directLinks: 0
    };
    
    for (const emp of governanceCheck || []) {
      if (!emp.branch_id) issues.noBranch++;
      if (emp.cost_center_id) issues.directLinks++;
      if (emp.warehouse_id) issues.directLinks++;
      
      if (emp.branch_id) {
        const { data: branch } = await supabase
          .from('branches')
          .select('default_cost_center_id, default_warehouse_id')
          .eq('id', emp.branch_id)
          .single();
          
        if (branch) {
          if (!branch.default_cost_center_id) issues.noDefaultCC++;
          if (!branch.default_warehouse_id) issues.noDefaultWH++;
        }
      }
    }
    
    console.log('\nGovernance Issues Summary:');
    console.log(`Employees without branch: ${issues.noBranch}`);
    console.log(`Branches without default cost center: ${issues.noDefaultCC}`);
    console.log(`Branches without default warehouse: ${issues.noDefaultWH}`);
    console.log(`Employees with direct cost center/warehouse links: ${issues.directLinks}`);
    
    if (issues.noBranch > 0 || issues.noDefaultCC > 0 || issues.noDefaultWH > 0) {
      console.log('\n⚠️  GOVERNANCE ISSUES DETECTED!');
      console.log('The system needs governance rules to be applied.');
    } else {
      console.log('\n✅ All governance rules are properly applied!');
    }
    
  } catch (error) {
    console.error('❌ Error analyzing company:', error.message);
  }
}

analyzeCompanyTestEmployees();