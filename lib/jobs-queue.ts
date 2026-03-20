/**
 * ⚡ Background Jobs Queue — lib/jobs-queue.ts
 * Phase 6: Async job execution outside the request cycle
 *
 * Feature Flag: set ENABLE_JOBS_QUEUE=false in .env to disable
 *
 * Job Types:
 *   send_notification — queue notification delivery
 *   refresh_mv        — manually trigger MV refresh
 *   send_email        — email delivery (future)
 *   sync_gl           — GL reconciliation (future)
 */

import type { SupabaseClient } from '@supabase/supabase-js'

// ─── Feature Flag ─────────────────────────────────────────────
const ENABLE_JOBS_QUEUE = process.env.ENABLE_JOBS_QUEUE !== 'false'

// ─── Types ────────────────────────────────────────────────────
export type JobType =
  | 'send_notification'
  | 'refresh_mv'
  | 'send_email'
  | 'sync_gl'
  | 'export_report'

export type JobStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled'

export interface EnqueueJobParams {
  companyId?: string
  jobType: JobType
  payload: Record<string, any>
  priority?: number           // 1 (highest) → 10 (lowest), default 5
  scheduledAt?: Date          // future scheduling, default now
  maxAttempts?: number        // default 3
}

export interface JobRow {
  id: string
  company_id: string | null
  job_type: string
  payload: Record<string, any>
  status: JobStatus
  priority: number
  attempts: number
  max_attempts: number
  scheduled_at: string
  started_at: string | null
  completed_at: string | null
  error: string | null
  created_at: string
}

// ─── Core Functions ───────────────────────────────────────────

/**
 * أضف job إلى الطابور
 * يُستخدم من أي Server Action أو API route
 */
export async function enqueueJob(
  supabase: SupabaseClient,
  params: EnqueueJobParams
): Promise<{ success: boolean; jobId?: string; error?: string }> {
  if (!ENABLE_JOBS_QUEUE) {
    console.log('[JobsQueue] DISABLED — skipping enqueue for:', params.jobType)
    return { success: true }
  }
  try {
    const { data, error } = await supabase
      .from('jobs_queue')
      .insert({
        company_id: params.companyId || null,
        job_type: params.jobType,
        payload: params.payload,
        priority: params.priority ?? 5,
        scheduled_at: params.scheduledAt?.toISOString() ?? new Date().toISOString(),
        max_attempts: params.maxAttempts ?? 3,
        status: 'pending',
      })
      .select('id')
      .single()

    if (error) throw error
    return { success: true, jobId: data.id }
  } catch (err: any) {
    console.error('[JobsQueue] enqueueJob failed:', err?.message)
    return { success: false, error: err?.message }
  }
}

/**
 * Shortcut: queue notification delivery
 * يُستخدم بدلاً من createNotification مباشرة (async pattern)
 */
export async function enqueueNotification(
  supabase: SupabaseClient,
  params: {
    companyId: string
    referenceType: string
    referenceId: string
    title: string
    message: string
    assignedToRole?: string
    assignedToUser?: string
    priority?: 'low' | 'normal' | 'high' | 'urgent'
    eventKey?: string
    category?: string
    branchId?: string
  }
): Promise<{ success: boolean; jobId?: string; error?: string }> {
  return enqueueJob(supabase, {
    companyId: params.companyId,
    jobType: 'send_notification',
    payload: params,
    priority: params.priority === 'urgent' ? 1 :
              params.priority === 'high' ? 2 :
              params.priority === 'normal' ? 5 : 8,
    maxAttempts: 3,
  })
}

/**
 * Shortcut: queue MV refresh (manual trigger)
 */
export async function enqueueRefreshMV(
  supabase: SupabaseClient,
  viewName: 'mv_bills_summary' | 'mv_purchase_orders_summary' | 'mv_inventory_snapshot' | 'mv_daily_revenue',
  opts?: { priority?: number }
): Promise<{ success: boolean; jobId?: string; error?: string }> {
  return enqueueJob(supabase, {
    jobType: 'refresh_mv',
    payload: { view_name: viewName },
    priority: opts?.priority ?? 3,
    maxAttempts: 2,
  })
}

/**
 * Mark a job as processing (called by worker — uses FOR UPDATE SKIP LOCKED)
 * Returns null if no jobs available
 */
export async function claimNextJob(
  supabase: SupabaseClient,
  jobType?: JobType
): Promise<JobRow | null> {
  try {
    // Raw SQL for FOR UPDATE SKIP LOCKED
    const jobTypeFilter = jobType ? `AND job_type = '${jobType}'` : ''
    const { data, error } = await supabase.rpc('claim_next_job', { p_job_type: jobType ?? null })

    if (error) throw error
    return (data as JobRow) || null
  } catch (err: any) {
    console.error('[JobsQueue] claimNextJob failed:', err?.message)
    return null
  }
}

/**
 * Mark a job as completed
 */
export async function completeJob(
  supabase: SupabaseClient,
  jobId: string
): Promise<void> {
  await supabase
    .from('jobs_queue')
    .update({ status: 'completed', completed_at: new Date().toISOString() })
    .eq('id', jobId)
}

/**
 * Mark a job as failed (will retry if attempts < max_attempts)
 */
export async function failJob(
  supabase: SupabaseClient,
  jobId: string,
  error: string
): Promise<void> {
  // First get current attempts
  const { data: job } = await supabase
    .from('jobs_queue')
    .select('attempts, max_attempts')
    .eq('id', jobId)
    .single()

  if (!job) return

  const newAttempts = (job.attempts || 0) + 1
  const shouldRetry = newAttempts < (job.max_attempts || 3)

  await supabase
    .from('jobs_queue')
    .update({
      status: shouldRetry ? 'pending' : 'failed',
      attempts: newAttempts,
      error: error,
      // Exponential backoff: retry after 2^attempts minutes
      scheduled_at: shouldRetry
        ? new Date(Date.now() + Math.pow(2, newAttempts) * 60_000).toISOString()
        : undefined,
    })
    .eq('id', jobId)
}

/**
 * Get job status
 */
export async function getJobStatus(
  supabase: SupabaseClient,
  jobId: string
): Promise<JobRow | null> {
  const { data } = await supabase
    .from('jobs_queue')
    .select('*')
    .eq('id', jobId)
    .maybeSingle()
  return data as JobRow | null
}

/**
 * Cancel a pending job
 */
export async function cancelJob(
  supabase: SupabaseClient,
  jobId: string
): Promise<void> {
  await supabase
    .from('jobs_queue')
    .update({ status: 'cancelled' })
    .eq('id', jobId)
    .eq('status', 'pending')
}
