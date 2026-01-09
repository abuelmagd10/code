#!/usr/bin/env node

/**
 * Customer Debit Notes - Installation Script
 * تثبيت نظام إشعارات مدين العملاء
 *
 * This script installs the Customer Debit Notes system to Supabase
 * Uses Supabase Management API for SQL execution
 */

const fs = require('fs');
const path = require('path');

// Load environment variables
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials in .env.local');
  process.exit(1);
}

// Extract project ref from URL (e.g., hfvsbsizokxontflgdyn)
const projectRef = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/)[1];

// SQL files to execute in order
const sqlFiles = [
  '096_customer_debit_notes_schema.sql',
  '097_customer_debit_notes_functions.sql',
  '097b_apply_debit_note_function.sql',
  '098_create_customer_debit_note_function.sql',
  '099_customer_debit_notes_guards.sql'
];

async function executeSqlFile(filename) {
  const filePath = path.join(__dirname, filename);

  console.log(`\n📄 Reading: ${filename}`);

  if (!fs.existsSync(filePath)) {
    console.error(`❌ File not found: ${filePath}`);
    return false;
  }

  const sql = fs.readFileSync(filePath, 'utf8');

  console.log(`⚙️  Executing: ${filename}...`);
  console.log(`   Size: ${(sql.length / 1024).toFixed(2)} KB`);

  try {
    // Use Supabase Management API to execute SQL query
    const response = await fetch(
      `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseKey}`
        },
        body: JSON.stringify({ query: sql })
      }
    );

    const result = await response.json();

    if (!response.ok || result.error) {
      console.error(`❌ Error executing ${filename}:`);
      console.error(result.error || result.message || 'Unknown error');
      return false;
    }

    console.log(`✅ Success: ${filename}`);
    return true;
  } catch (err) {
    console.error(`❌ Exception executing ${filename}:`, err.message);
    return false;
  }
}

async function main() {
  console.log('🚀 Customer Debit Notes - Installation');
  console.log('='.repeat(50));
  console.log(`📍 Database: ${supabaseUrl}`);
  console.log(`📅 Date: ${new Date().toISOString()}`);
  console.log('='.repeat(50));

  let successCount = 0;
  let failCount = 0;

  for (const file of sqlFiles) {
    const success = await executeSqlFile(file);
    if (success) {
      successCount++;
    } else {
      failCount++;
      console.log('\n⚠️  Installation stopped due to error');
      break;
    }
  }

  console.log('\n' + '='.repeat(50));
  console.log('📊 Installation Summary');
  console.log('='.repeat(50));
  console.log(`✅ Successful: ${successCount}/${sqlFiles.length}`);
  console.log(`❌ Failed: ${failCount}/${sqlFiles.length}`);

  if (failCount === 0) {
    console.log('\n🎉 Installation Complete!');
    console.log('\n📚 Next Steps:');
    console.log('1. Run verification: node scripts/verify-customer-debit-notes.js');
    console.log('2. Read documentation: START_HERE_CUSTOMER_DEBIT_NOTES.md');
    console.log('3. Test the system: See CUSTOMER_DEBIT_NOTES_GUIDE.md');
  } else {
    console.log('\n❌ Installation Failed');
    console.log('Please check the errors above and try again.');
    process.exit(1);
  }
}

main().catch(console.error);

