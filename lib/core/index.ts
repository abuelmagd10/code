/**
 * Core ERP Infrastructure — Barrel Export
 *
 * استيراد موحد لجميع طبقات البنية التحتية.
 * بدلاً من كتابة مسارات طويلة في كل ملف:
 *   import { apiGuard } from '@/lib/core/security/api-guard'
 *   import { ErrorHandler } from '@/lib/core/errors/error-handler'
 *
 * يمكن الاستيراد من مكان واحد:
 *   import { apiGuard, ErrorHandler, requireRole, asyncAuditLog } from '@/lib/core'
 */

// Security
export { apiGuard, type ERPContext, type GuardOptions, type Role } from './security/api-guard';
export { requireOpenFinancialPeriod } from './security/financial-lock-guard';
export { requireRole } from './security/require-role';

// Errors
export { ERPError, type ERPErrorCode } from './errors/erp-errors';
export { ErrorHandler } from './errors/error-handler';

// Audit
export { asyncAuditLog, type AuditEventPayload } from './audit/async-audit-engine';

// Database
export { executeAtomicOperation } from './db/transaction-runner';

// Queue
export { globalQueue } from './queue/in-process-queue';
