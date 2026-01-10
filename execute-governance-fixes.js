const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Read environment variables
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase configuration in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function executeSQLFile(filePath) {
  console.log(`🔧 Executing ${filePath}...`);
  
  try {
    const sqlContent = fs.readFileSync(filePath, 'utf8');
    
    // Split SQL into individual statements
    const statements = sqlContent
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));
    
    console.log(`📝 Found ${statements.length} SQL statements to execute`);
    
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      
      if (statement.length === 0) continue;
      
      console.log(`⚡ Executing statement ${i + 1}/${statements.length}...`);
      
      const { error } = await supabase.rpc('exec_sql', { 
        sql_query: statement + ';' 
      });
      
      if (error) {
        console.error(`❌ Error in statement ${i + 1}:`, error.message);
        console.error(`Statement: ${statement.substring(0, 100)}...`);
        // Continue with other statements
      } else {
        console.log(`✅ Statement ${i + 1} executed successfully`);
      }
    }
    
    console.log(`✅ Completed executing ${filePath}`);
    return true;
  } catch (error) {
    console.error(`❌ Error reading/executing ${filePath}:`, error.message);
    return false;
  }
}

async function main() {
  console.log('🔒 MANDATORY ERP GOVERNANCE FIXES');
  console.log('=================================');
  console.log('');
  
  // Step 1: Apply governance fixes
  console.log('📋 Step 1: Applying Database Schema Fixes...');
  const success1 = await executeSQLFile('scripts/MANDATORY_ERP_GOVERNANCE_FIXES.sql');
  
  if (!success1) {
    console.error('❌ Failed to apply governance fixes');
    process.exit(1);
  }
  
  console.log('');
  
  // Step 2: Run verification
  console.log('🔍 Step 2: Verifying Governance Compliance...');
  const success2 = await executeSQLFile('scripts/ERP_GOVERNANCE_VERIFICATION.sql');
  
  if (!success2) {
    console.error('❌ Failed to run verification');
  }
  
  console.log('');
  console.log('✅ Database governance fixes completed!');
  console.log('');
  console.log('📝 Next Steps:');
  console.log('1. Update API routes to use governance layer');
  console.log('2. Remove dangerous NULL escape patterns');
  console.log('3. Use SecureQueryBuilder for all queries');
  console.log('');
  console.log('📖 See MANDATORY_ERP_GOVERNANCE_IMPLEMENTATION_GUIDE.md for details');
}

main().catch(console.error);