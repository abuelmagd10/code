/**
 * أنواع البيانات لمنظومة النسخ الاحتياطي والاستعادة
 * Backup & Restore System Types
 */

export type QueueStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'DRY_RUN_SUCCESS' | 'DRY_RUN_FAILED';

export interface RestoreQueueEntry {
  id: string;
  company_id: string;
  user_id: string;
  status: QueueStatus;
  backup_file_url?: string;
  backup_data?: any; // JSONB
  report?: any;      // Validation Report
  created_at: string;
  processed_at?: string;
  ip_address?: string;
}

export interface BackupMetadata {
  version: string // Backup Format Version (e.g., "2.0")
  system_version: string // App Version
  schema_version: string // DB Schema Version (e.g., "2026.02")
  erp_version: string // Core Logic Version
  created_at: string
  created_by: string
  company_id: string
  company_name: string
  backup_type: 'full' | 'partial'
  total_records: number
  checksum: string // SHA-256
}

export interface SchemaInfo {
  tables: string[]
  table_versions: Record<string, string>
}

export interface BackupData {
  metadata: BackupMetadata
  schema_info: SchemaInfo
  data: Record<string, any[]>
  excluded_data: {
    reason: string
    tables: string[]
  }
}

export interface ValidationResult {
  valid: boolean
  errors: ValidationError[]
  warnings: ValidationWarning[]
  report: ValidationReport
}

export interface ValidationError {
  type: 'system_version' | 'schema_mismatch' | 'foreign_key' | 'accounting_integrity'
  message: string
  details?: any
}

export interface ValidationWarning {
  type: 'data_loss' | 'data_replacement' | 'performance'
  message: string
  severity: 'low' | 'medium' | 'high'
}

export interface ValidationReport {
  summary: {
    totalRecords: number
    recordsToInsert: number
    recordsToUpdate: number
    recordsToDelete: number
    estimatedTime: string
  }
  breakdown: Record<string, {
    count: number
    action: 'insert' | 'update' | 'delete' | 'skip'
  }>
  warnings: string[]
  risks: {
    dataLoss: 'none' | 'low' | 'medium' | 'high'
    recommendation: string
  }
}

export interface RestoreOptions {
  mode: 'restore_to_empty' | 'restore_with_merge'
  companyId: string
  userId: string
  skipValidation?: boolean
  dryRun?: boolean
  ipAddress?: string // For Audit Log
}

export interface RestoreResult {
  success: boolean;
  mode: 'DRY_RUN' | 'RESTORE';
  report?: any;
  error?: string;
  recordsRestored?: number;
  duration?: number;
  warnings?: string[];
}

export interface AuditLogEntry {
  id: string
  company_id: string
  user_id: string
  action: 'export' | 'restore' | 'restore_failed' | 'validate'
  timestamp: string
  details: {
    backup_file?: string
    records_count: number
    duration_seconds: number
    success: boolean
    error_message?: string
  }
}

// ترتيب الجداول للتصدير والاستعادة (Topological Order)
export const EXPORT_ORDER = [
  // 1. Core Config (No FKs or Self-Ref)
  'companies',
  'branches',
  'warehouses',
  'cost_centers',
  'chart_of_accounts', // Beware of Parent-Child

  // 2. Entities
  'customers',
  'suppliers',
  'employees',
  'shareholders',
  'company_members', // Users/Permissions

  // 3. Catalog
  'products',
  'services',

  // 4. Sales Cycle
  'estimates',
  'sales_orders',
  'sales_order_items',
  'invoices',
  'invoice_items',
  'sales_returns',
  'sales_return_items',
  'customer_debit_notes',
  'customer_debit_note_items',
  'customer_credits',
  'customer_credit_applications',

  // 5. Purchase Cycle
  'purchase_orders',
  'purchase_order_items',
  'bills',
  'bill_items',
  'purchase_returns',
  'purchase_return_items',
  'supplier_debit_notes',
  'vendor_credits',

  // 6. Inventory & Assets
  'inventory_transactions',
  'inventory_write_offs',
  'fixed_assets',
  'asset_categories',
  'asset_transactions',
  'depreciation_schedules',

  // 7. Finance & Accounting (The Result of above)
  'journal_entries',
  'journal_entry_lines',
  'payments',
  'bank_accounts',
  'bank_transactions',
  'bank_reconciliations',

  // 8. HR
  'payroll_runs',
  'payslips',
  'user_bonuses'
] as const

// الجداول المستثناة من التصدير (أمان)
export const EXCLUDED_TABLES = [
  'auth.users',
  'auth.sessions',
  'auth.refresh_tokens',
  'company_invitations',
  'audit_logs',
  'restore_queue'
] as const

export type ExportTable = typeof EXPORT_ORDER[number]
export type ExcludedTable = typeof EXCLUDED_TABLES[number]

