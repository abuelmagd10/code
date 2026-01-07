#!/usr/bin/env node

/**
 * 📦 BACKUP DATABASE BEFORE MIGRATION
 * ====================================
 * Creates a backup of critical tables before running migration
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Load environment variables
function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env.local');
  if (!fs.existsSync(envPath)) {
    console.error('❌ Error: .env.local file not found');
    process.exit(1);
  }

  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const [key, ...valueParts] = trimmed.split('=');
      const value = valueParts.join('=').trim();
      if (key && value) {
        process.env[key.trim()] = value.replace(/^["']|["']$/g, '');
      }
    }
  });
}

loadEnv();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const BACKUP_DIR = path.join(__dirname, '..', 'backups');
const TIMESTAMP = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);

async function createBackup() {
  console.log('📦 Starting database backup...');
  console.log(`⏰ Timestamp: ${TIMESTAMP}`);
  console.log('');

  // Create backup directory
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }

  const backup = {
    timestamp: new Date().toISOString(),
    tables: {}
  };

  // Tables to backup
  const tables = [
    'customer_debit_notes',
    'customer_debit_note_items',
    'customer_debit_note_applications'
  ];

  for (const table of tables) {
    console.log(`📋 Backing up table: ${table}...`);
    
    const { data, error, count } = await supabase
      .from(table)
      .select('*', { count: 'exact' });

    if (error) {
      console.error(`❌ Error backing up ${table}:`, error.message);
      continue;
    }

    backup.tables[table] = {
      count: count || 0,
      data: data || []
    };

    console.log(`   ✅ Backed up ${count || 0} rows from ${table}`);
  }

  // Save backup to file
  const backupFile = path.join(BACKUP_DIR, `backup-${TIMESTAMP}.json`);
  fs.writeFileSync(backupFile, JSON.stringify(backup, null, 2));

  console.log('');
  console.log('✅ Backup completed successfully!');
  console.log(`📁 Backup file: ${backupFile}`);
  console.log('');
  console.log('📊 Backup Summary:');
  for (const [table, info] of Object.entries(backup.tables)) {
    console.log(`   - ${table}: ${info.count} rows`);
  }
  console.log('');
  console.log('💡 To restore from this backup, use:');
  console.log(`   node scripts/restore-backup.js ${backupFile}`);
}

createBackup().catch(error => {
  console.error('❌ Backup failed:', error);
  process.exit(1);
});

