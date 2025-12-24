console.log('Starting test...');

const fs = require('fs');
const path = require('path');

console.log('Loading environment...');

// قراءة ملف .env.local
function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env.local');
  console.log('Env path:', envPath);
  
  if (!fs.existsSync(envPath)) {
    console.error('❌ خطأ: لم يتم العثور على ملف .env.local');
    process.exit(1);
  }
  
  const envContent = fs.readFileSync(envPath, 'utf8');
  const lines = envContent.split('\n');
  
  lines.forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const [key, ...valueParts] = trimmed.split('=');
      const value = valueParts.join('=').trim();
      if (key && value) {
        process.env[key.trim()] = value.replace(/^["']|["']$/g, '');
      }
    }
  });
  
  console.log('Environment loaded');
}

try {
  loadEnv();
  
  console.log('Supabase URL:', process.env.NEXT_PUBLIC_SUPABASE_URL ? 'Found' : 'Not found');
  console.log('Supabase Key:', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? 'Found' : 'Not found');
  
  const { createClient } = require('@supabase/supabase-js');
  
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  
  if (!supabaseUrl || !supabaseKey) {
    console.error('❌ خطأ: لم يتم العثور على بيانات Supabase');
    process.exit(1);
  }
  
  const supabase = createClient(supabaseUrl, supabaseKey);
  
  console.log('Supabase client created');
  
  // اختبار الاتصال
  async function test() {
    console.log('Testing connection...');
    
    const { data, error } = await supabase
      .from('companies')
      .select('id, name')
      .limit(1);
    
    if (error) {
      console.error('Error:', error.message);
      return;
    }
    
    console.log('Connection successful!');
    console.log('Sample company:', data);
  }
  
  test().then(() => {
    console.log('Test completed');
  }).catch(err => {
    console.error('Test failed:', err);
  });
  
} catch (error) {
  console.error('Error:', error.message);
  console.error(error);
}

