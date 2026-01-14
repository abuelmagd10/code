const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing required environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function governanceCheck() {
  try {
    console.log('🔍 Running governance check...');
    
    // التحقق من المستخدمين الذين لا يملكون فرع
    const { data: usersMissingBranch, error: usersErr } = await supabase
      .from("company_members")
      .select("user_id, email, company_id")
      .is("branch_id", null);

    if (usersErr) {
      console.error('❌ Users check failed:', usersErr.message);
    } else {
      console.log(`👥 Users missing branch: ${usersMissingBranch?.length || 0}`);
      if (usersMissingBranch?.length > 0) {
        usersMissingBranch.forEach(user => {
          console.log(`   - User: ${user.email} (Company: ${user.company_id})`);
        });
      }
    }

    // التحقق من الفروع التي تحتاج إلى افتراضيات
    const { data: branchesMissingDefaults, error: branchesErr } = await supabase
      .from("branches")
      .select("id, name, company_id")
      .or("default_cost_center_id.is.null,default_warehouse_id.is.null");

    if (branchesErr) {
      console.error('❌ Branches check failed:', branchesErr.message);
    } else {
      console.log(`🏢 Branches missing defaults: ${branchesMissingDefaults?.length || 0}`);
      if (branchesMissingDefaults?.length > 0) {
        branchesMissingDefaults.forEach(branch => {
          console.log(`   - Branch: ${branch.name} (Company: ${branch.company_id})`);
        });
      }
    }

    // التحقق من وجود روابط مباشرة للمستخدمين
    const { data: usersWithDirectLinks, error: directLinksErr } = await supabase
      .from("company_members")
      .select("user_id, email, company_id, cost_center_id, warehouse_id")
      .or("cost_center_id.not.is.null,warehouse_id.not.is.null");

    if (directLinksErr) {
      console.error('❌ Direct links check failed:', directLinksErr.message);
    } else {
      console.log(`🔗 Users with direct links: ${usersWithDirectLinks?.length || 0}`);
      if (usersWithDirectLinks?.length > 0) {
        usersWithDirectLinks.forEach(user => {
          console.log(`   - User: ${user.email} (CC: ${user.cost_center_id}, WH: ${user.warehouse_id})`);
        });
      }
    }

    // ملخص
    console.log('\n📋 Governance Check Summary:');
    console.log('===========================');
    console.log(`✅ Users missing branch: ${usersMissingBranch?.length || 0}`);
    console.log(`✅ Branches missing defaults: ${branchesMissingDefaults?.length || 0}`);
    console.log(`✅ Users with direct links: ${usersWithDirectLinks?.length || 0}`);
    
    if ((usersMissingBranch?.length || 0) === 0 && 
        (branchesMissingDefaults?.length || 0) === 0 && 
        (usersWithDirectLinks?.length || 0) === 0) {
      console.log('\n🎉 All governance rules are properly applied!');
    } else {
      console.log('\n⚠️  Some governance issues need attention.');
    }

  } catch (error) {
    console.error('❌ Governance check failed:', error.message);
    process.exit(1);
  }
}

governanceCheck();