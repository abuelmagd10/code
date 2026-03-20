/**
 * 📋 Logger — lib/logger.ts
 * Phase 8: Centralized structured logging to system_logs table
 *
 * All writes are fire-and-forget (non-blocking).
 * Slow API calls (>500ms) auto-escalate to 'warn'.
 */

import { createClient } from '@/lib/supabase/server'

// ─── Types ────────────────────────────────────────────────────
export type LogLevel = 'info' | 'warn' | 'error'
export type LogCategory = 'api' | 'job' | 'event' | 'auth' | 'system'

interface LogEntry {
  level: LogLevel
  category: LogCategory
  message: string
  companyId?: string
  userId?: string
  route?: string
  method?: string
  statusCode?: number
  durationMs?: number
  errorCode?: string
  stackTrace?: string
  metadata?: Record<string, any>
}

// ─── Core: fire-and-forget write ──────────────────────────────
function writeLog(entry: LogEntry): void {
  // Non-blocking: deliberately not awaited
  ;(async () => {
    try {
      const supabase = await createClient()
      await supabase.from('system_logs').insert({
        level: entry.level,
        category: entry.category,
        message: entry.message,
        company_id: entry.companyId ?? null,
        user_id: entry.userId ?? null,
        route: entry.route ?? null,
        method: entry.method ?? null,
        status_code: entry.statusCode ?? null,
        duration_ms: entry.durationMs ?? null,
        error_code: entry.errorCode ?? null,
        stack_trace: entry.stackTrace ?? null,
        metadata: entry.metadata ?? {},
      })
    } catch {
      // Logging must never crash the app — silently ignore
    }
  })()
}

// ─── Public API ───────────────────────────────────────────────

export const logger = {
  info(category: LogCategory, message: string, meta?: Partial<LogEntry>): void {
    writeLog({ level: 'info', category, message, ...meta })
  },

  warn(category: LogCategory, message: string, meta?: Partial<LogEntry>): void {
    writeLog({ level: 'warn', category, message, ...meta })
  },

  error(category: LogCategory, message: string, meta?: Partial<LogEntry>): void {
    writeLog({ level: 'error', category, message, ...meta })
  },

  /**
   * Log an API request result (called from middleware)
   * Auto-escalates to 'warn' if durationMs > 500
   */
  apiRequest(params: {
    route: string
    method: string
    statusCode: number
    durationMs: number
    companyId?: string
    userId?: string
    metadata?: Record<string, any>
  }): void {
    const level: LogLevel =
      params.statusCode >= 500 ? 'error' :
      params.statusCode >= 400 ? 'warn' :
      params.durationMs > 500 ? 'warn' : 'info'

    writeLog({
      level,
      category: 'api',
      message: `${params.method} ${params.route} → ${params.statusCode} (${params.durationMs}ms)`,
      route: params.route,
      method: params.method,
      statusCode: params.statusCode,
      durationMs: params.durationMs,
      companyId: params.companyId,
      userId: params.userId,
      metadata: params.metadata,
    })
  },

  /**
   * Log a background job result
   */
  jobResult(params: {
    jobType: string
    jobId: string
    status: 'completed' | 'failed'
    durationMs?: number
    companyId?: string
    error?: string
    metadata?: Record<string, any>
  }): void {
    const level: LogLevel = params.status === 'failed' ? 'error' : 'info'
    writeLog({
      level,
      category: 'job',
      message: `Job ${params.jobType} [${params.jobId}] → ${params.status}${params.error ? ': ' + params.error : ''}`,
      companyId: params.companyId,
      durationMs: params.durationMs,
      errorCode: params.error ? 'JOB_FAILED' : undefined,
      metadata: { job_id: params.jobId, job_type: params.jobType, ...params.metadata },
    })
  },

  /**
   * Log an auth event
   */
  auth(message: string, userId?: string, meta?: Record<string, any>): void {
    writeLog({ level: 'info', category: 'auth', message, userId, metadata: meta })
  },
}
