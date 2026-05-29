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
// v3.61.0 A3: expanded from 38 → ~95 tables after a full DB audit.
// Order is parent-first → children-after so a transactional restore can satisfy
// FKs as it inserts. Items / lines tables follow their parent document.
export const EXPORT_ORDER = [
  // 1. Core config / hierarchy (no FKs to other company tables)
  'companies',
  'branches',
  'warehouses',
  'cost_centers',
  'fiscal_periods',
  'accounting_periods',
  'chart_of_accounts',
  'tax_codes',
  'currencies',
  'exchange_rates',
  'exchange_rate_log',

  // 2. Governance (CRITICAL — must be restored to preserve /settings/users config)
  'company_role_permissions',
  'permission_sharing',
  'permission_transfers',
  'user_branch_access',
  'user_branch_cost_center',

  // 3. Entities (master data)
  'company_members',
  'customers',
  'suppliers',
  'employees',
  'shareholders',
  'shareholder_percentage_history',
  'shipping_providers',

  // 4. Catalog
  'products',
  'product_bundle_items',
  'services',
  'service_staff',
  'service_schedules',

  // 5. Settings / configuration (after entities they may reference)
  'company_ai_settings',
  'company_dashboard_alert_limits',
  'company_drawings_settings',
  'company_expenses_settings',
  'expense_category_account_mappings',
  'attendance_payroll_settings',
  'attendance_shifts',
  'biometric_devices',
  'commission_plans',
  'employee_bonus_config',
  'profit_distribution_settings',
  'approval_workflows',
  'budgets',
  'budget_lines',

  // 6. Sales cycle (documents → items)
  'estimates',
  'estimate_items',
  'sales_orders',
  'sales_order_items',
  'invoices',
  'invoice_items',
  'sales_return_requests',
  'sales_returns',
  'sales_return_items',
  'customer_debit_notes',
  'customer_debit_note_items',
  'customer_debit_note_applications',
  'customer_credits',
  'customer_credit_ledger',
  'customer_credit_applications',
  'customer_refund_requests',
  'credit_notes',
  'shipments',
  'shipment_status_logs',

  // 7. Purchase cycle (documents → items)
  'purchase_requests',
  'purchase_request_items',
  'purchase_orders',
  'purchase_order_items',
  'goods_receipts',
  'goods_receipt_items',
  'bills',
  'bill_items',
  'purchase_returns',
  'purchase_return_items',
  'purchase_return_warehouse_allocations',
  'supplier_debit_credits',
  'vendor_credits',
  'vendor_credit_items',
  'vendor_credit_applications',
  'vendor_refund_requests',

  // 8. Inventory operations
  'inventory_transactions',
  'inventory_transfers',
  'inventory_transfer_items',
  'inventory_write_offs',
  'inventory_write_off_items',
  'third_party_inventory',
  'inventory_reservations',
  'inventory_reservation_lines',
  'inventory_reservation_allocations',
  'inventory_reservation_consumptions',
  'fifo_cost_lots',
  'fifo_lot_consumptions',
  'cogs_transactions',

  // 9. Manufacturing (BOMs → orders → events)
  'manufacturing_work_centers',
  'manufacturing_routings',
  'manufacturing_routing_versions',
  'manufacturing_routing_operations',
  'manufacturing_boms',
  'manufacturing_bom_versions',
  'manufacturing_bom_lines',
  'manufacturing_bom_line_substitutes',
  'manufacturing_production_orders',
  'manufacturing_production_order_operations',
  'manufacturing_material_issue_approvals',
  'manufacturing_product_receive_approvals',
  'production_order_material_requirements',
  'production_order_issue_events',
  'production_order_issue_lines',
  'production_order_receipt_events',
  'production_order_receipt_lines',
  'mrp_runs',
  'mrp_demand_rows',
  'mrp_supply_rows',
  'mrp_net_rows',
  'mrp_suggestions',

  // 10. Bookings / services scheduling
  'bookings',
  'booking_payments',
  'booking_status_history',

  // 11. Fixed assets
  'asset_categories',
  'fixed_assets',
  'asset_transactions',
  'depreciation_schedules',

  // 12. Finance & accounting (result of above)
  'journal_entries',
  'journal_entry_lines',
  'payments',
  'payment_allocations',
  'bank_accounts',
  'bank_transactions',
  'bank_reconciliations',
  'bank_reconciliation_lines',
  'bank_voucher_requests',
  'account_balances',
  'fiscal_year_closings',

  // 13. HR / Attendance / Payroll / Commissions
  'attendance_records',
  'attendance_raw_logs',
  'biometric_device_logs',
  'commission_ledger',
  'commission_runs',
  'commission_advance_payments',
  'employee_commissions',
  'advance_applications',
  'payroll_runs',
  'payroll_components',
  'payroll_ledger',
  'payslips',
  'payroll_items',
  'user_bonuses',

  // 14. Shareholders & profit distribution
  'capital_contributions',
  'shareholder_drawings',
  'dividend_payments',
  'profit_distributions',
  'profit_distribution_lines',

  // 15. Expenses
  'expenses',

  // 16. Approvals / dunning / workflow events
  'approval_requests',
  'dunning_events',

  // 17. Notifications (user-scoped state)
  'notifications',
  'user_notification_preferences',
  'notification_escalations',
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

