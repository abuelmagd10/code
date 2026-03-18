const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing credentials");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  // Check RLS policies on bills
  const { data: bills, error: err1 } = await supabase.rpc('exec_sql', {
    query: `SELECT policyname, permissive, command, qual, with_check FROM pg_policies WHERE tablename = 'bills'`
  });
  
  if (err1) {
    console.error("RPC failed, trying pg_policies directly", err1.message);
    const { data: policies, error: err2 } = await supabase
      .from('pg_policies')
      .select('*')
      .eq('tablename', 'bills');
      
    console.log("pg_policies directly:", policies, err2);
  } else {
    console.log("Bills Policies:", bills);
  }
}

check();
