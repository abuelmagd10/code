const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://hfvsbsizokxontflgdyn.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhmdnNic2l6b2t4b250ZmxnZHluIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MjUwMDEyMSwiZXhwIjoyMDc4MDc2MTIxfQ.2pITPH3Xeo68u24BSyQawqVIUNSIHvhlWBMls4meTA4';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function createGovernanceContextForAllUsers() {
  console.log('🔧 CREATING GOVERNANCE CONTEXT FOR ALL USERS');
  console.log('============================================\n');
  
  try {
    // 1. Get all company members
    const { data: members, error: membersError } = await supabase
      .from('company_members')
      .select('user_id, company_id, role, branch_id, cost_center_id');
    
    if (membersError) {
      console.log('❌ Error fetching company members:', membersError.message);
      return;
    }
    
    console.log(`👥 Found ${members?.length || 0} company members\n`);
    
    if (!members || members.length === 0) {
      console.log('✅ No members found');
      return;
    }
    
    let createdCount = 0;
    let existingCount = 0;
    let errorCount = 0;
    
    // 2. Process each member
    for (const member of members) {
      console.log(`🔍 Processing user ${member.user_id}...`);
      
      // Check if governance context already exists
      const { data: existing } = await supabase
        .from('user_branch_cost_center')
        .select('id')
        .eq('user_id', member.user_id)
        .eq('company_id', member.company_id)
        .single();
      
      if (existing) {
        console.log('   ✅ Already has governance context');
        existingCount++;
        continue;
      }
      
      // Create governance context
      const governanceData = {
        user_id: member.user_id,
        company_id: member.company_id,
        branch_id: member.branch_id,
        cost_center_id: member.cost_center_id,
        is_default: true
      };
      
      const { error: insertError } = await supabase
        .from('user_branch_cost_center')
        .insert(governanceData);
      
      if (insertError) {
        console.log(`   ❌ Error creating governance context: ${insertError.message}`);
        errorCount++;
      } else {
        console.log('   ✅ Created governance context');
        createdCount++;
      }
    }
    
    console.log('\n🎯 SUMMARY:');
    console.log(`   Total members processed: ${members.length}`);
    console.log(`   Governance contexts created: ${createdCount}`);
    console.log(`   Already existing: ${existingCount}`);
    console.log(`   Errors: ${errorCount}`);
    
    console.log('\n✅ GOVERNANCE CONTEXT CREATION COMPLETED!');
    console.log('All users now have proper governance context for the ERP system.');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

createGovernanceContextForAllUsers();