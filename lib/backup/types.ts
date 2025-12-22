/**
 * أنواع البيانات لمنظومة النسخ الاحتياطي والاستعادة
 * Backup & Restore System Types
 */

export interface BackupMetadata {
  version: string
  system_version: string
  created_at: string
  created_by: string
  company_id: string
  company_name: string
  backup_type: 'full' | 'partial'
  total_records: number
  checksum: string
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
}

export interface RestoreResult {
  success: boolean
  recordsRestored: number
  duration: number
  errors: string[]
  warnings: string[]
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

// ترتيب الجداول للتصدير والاستعادة
export const EXPORT_ORDER = [
  // 1. الجداول المستقلة (No Dependencies)
  'companies',
  'chart_of_accounts',
  'customers',
  'suppliers',
  'products',
  'employees',
  'shareholders',
  'branches',
  'cost_centers',
  'warehouses',
  'bank_accounts',
  
  // 2. المستندات الرئيسية
  'estimates',
  'sales_orders',
  'invoices',
  'bills',
  'purchase_orders',
  
  // 3. تفاصيل المستندات
  'estimate_items',
  'sales_order_items',
  'invoice_items',
  'bill_items',
  'purchase_order_items',
  
  // 4. المرتجعات
  'sales_returns',
  'sales_return_items',
  'purchase_returns',
  'purchase_return_items',
  
  // 5. الإشعارات
  'customer_credits',
  'customer_credit_applications',
  'vendor_credits',
  'supplier_debit_notes',
  
  // 6. القيود والمدفوعات
  'journal_entries',
  'journal_entry_lines',
  'payments',
  
  // 7. المخزون والأصول
  'inventory_transactions',
  'inventory_write_offs',
  'fixed_assets',
  'asset_categories',
  'depreciation_schedules',
  
  // 8. الموارد البشرية
  'payroll_runs',
  'payslips',
  'user_bonuses',
  
  // 9. البنوك
  'bank_transactions',
  'bank_reconciliations'
] as const

// الجداول المستثناة من التصدير (أمان)
export const EXCLUDED_TABLES = [
  'auth.users',
  'auth.sessions',
  'auth.refresh_tokens',
  'company_invitations',
  'audit_logs',
  'company_members' // سيتم التعامل معها بشكل خاص
] as const

export type ExportTable = typeof EXPORT_ORDER[number]
export type ExcludedTable = typeof EXCLUDED_TABLES[number]

