/**
 * 🚀 Event Bus — lib/event-bus.ts
 * Phase 6: Lightweight event-driven architecture
 *
 * Feature Flag: set ENABLE_EVENT_BUS=false in .env to disable
 *
 * Pattern:
 *   API Route → emitEvent('po.approved', ...) → app_events table
 *   Worker (pg_cron) → processUnhandledEvents() → listeners run
 *
 * Known Events:
 *   po.created        — purchase order created
 *   po.approved       — purchase order approved
 *   po.rejected       — purchase order rejected
 *   bill.created      — bill created
 *   bill.paid         — bill fully paid
 *   bill.voided       — bill voided
 *   inventory.low_stock  — product below reorder level
 *   inventory.out_of_stock — product at 0 qty
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { logBulk } from '@/lib/audit-log'

// ─── Feature Flag ─────────────────────────────────────────────
const ENABLE_EVENT_BUS = process.env.ENABLE_EVENT_BUS !== 'false'

// ─── Types ────────────────────────────────────────────────────
export type EventName =
  | 'po.created' | 'po.approved' | 'po.rejected' | 'po.cancelled'
  | 'bill.created' | 'bill.paid' | 'bill.voided' | 'bill.approved'
  | 'inventory.low_stock' | 'inventory.out_of_stock'
  | 'user.role_changed' | 'user.branch_changed'
  | 'invoice.posted' | 'delivery.approved' | 'payment.recorded' | 'sales_return.approved'
  | 'intercompany.created' | 'intercompany.submitted' | 'intercompany.approved'
  | 'intercompany.reconciled' | 'intercompany.elimination_triggered'
  | 'consolidation.run_created' | 'consolidation.executed' | 'consolidation.completed'

export interface EmitEventParams {
  companyId: string
  eventName: EventName
  entityType?: string
  entityId?: string
  actorId?: string
  payload?: Record<string, any>
  /** Idempotency key — prevents duplicate processing. If not provided, auto-generated. */
  idempotencyKey?: string
}

export interface AppEvent {
  id: string
  company_id: string
  event_name: string
  entity_type: string | null
  entity_id: string | null
  actor_id: string | null
  payload: Record<string, any>
  idempotency_key: string | null
  processed_at: string | null
  processing_attempts: number
  created_at: string
}

// ─── Listener Registry ────────────────────────────────────────
type EventListener = (supabase: SupabaseClient, event: AppEvent) => Promise<void>

const LISTENERS: Partial<Record<string, EventListener[]>> = {}

export function registerListener(eventName: EventName, listener: EventListener): void {
  if (!LISTENERS[eventName]) LISTENERS[eventName] = []
  LISTENERS[eventName]!.push(listener)
}

// ─── Core Functions ───────────────────────────────────────────

/**
 * Emit an event — non-blocking
 * Use after any significant business action
 */
export async function emitEvent(
  supabase: SupabaseClient,
  params: EmitEventParams
): Promise<{ success: boolean; eventId?: string }> {
  if (!ENABLE_EVENT_BUS) return { success: true }

  // Auto-generate idempotency key if not provided
  const idempotencyKey = params.idempotencyKey
    ?? (params.entityType && params.entityId
        ? `${params.entityType}:${params.entityId}:${params.eventName}`
        : undefined)

  try {
    const { data, error } = await supabase
      .from('app_events')
      .insert({
        company_id: params.companyId,
        event_name: params.eventName,
        entity_type: params.entityType ?? null,
        entity_id: params.entityId ?? null,
        actor_id: params.actorId ?? null,
        payload: params.payload ?? {},
        idempotency_key: idempotencyKey ?? null,
      })
      .select('id')
      .single()

    if (error) {
      // Unique violation on idempotency_key = already emitted (idempotent)
      if (error.code === '23505') {
        console.log('[EventBus] Duplicate event skipped (idempotent):', idempotencyKey)
        return { success: true }
      }
      throw error
    }

    return { success: true, eventId: data.id }
  } catch (err: any) {
    // Non-critical: event emission failure should NEVER block the main flow
    console.error('[EventBus] emitEvent failed (non-blocking):', err?.message)
    return { success: false }
  }
}

/**
 * Process all unhandled events (called by worker every N minutes)
 * Marks events as processed after all listeners run
 */
export async function processUnhandledEvents(
  supabase: SupabaseClient,
  opts?: { companyId?: string; limit?: number }
): Promise<{ processed: number; errors: number }> {
  if (!ENABLE_EVENT_BUS) return { processed: 0, errors: 0 }

  let query = supabase
    .from('app_events')
    .select('*')
    .is('processed_at', null)
    .lt('processing_attempts', 5) // stop after 5 failed attempts
    .order('created_at', { ascending: true })
    .limit(opts?.limit ?? 50)

  if (opts?.companyId) query = query.eq('company_id', opts.companyId)

  const { data: events, error } = await query
  if (error || !events) {
    console.error('[EventBus] fetchUnhandled error:', error)
    return { processed: 0, errors: 1 }
  }

  let processed = 0
  let errors = 0

  for (const event of events) {
    const listeners = LISTENERS[event.event_name] ?? []
    let success = true

    // Increment attempt count first
    await supabase
      .from('app_events')
      .update({ processing_attempts: (event.processing_attempts ?? 0) + 1 })
      .eq('id', event.id)

    for (const listener of listeners) {
      try {
        await listener(supabase, event as AppEvent)
      } catch (err: any) {
        console.error(`[EventBus] Listener error for ${event.event_name}:`, err?.message)
        success = false
        errors++
      }
    }

    if (success) {
      await supabase
        .from('app_events')
        .update({ processed_at: new Date().toISOString() })
        .eq('id', event.id)
      processed++
    }
  }

  return { processed, errors }
}

// ─── Default Listeners (built-in) ────────────────────────────

/**
 * Auto-audit: all events get logged to audit_logs automatically
 * Register this once at app startup / edge function init
 */
export function registerAuditListener(supabase: SupabaseClient): void {
  const auditableEvents: EventName[] = [
    'po.approved', 'po.rejected', 'po.cancelled',
    'bill.paid', 'bill.voided', 'bill.approved',
    'invoice.posted', 'delivery.approved', 'payment.recorded', 'sales_return.approved',
    'intercompany.created', 'intercompany.submitted', 'intercompany.approved',
    'intercompany.reconciled', 'intercompany.elimination_triggered',
    'consolidation.run_created', 'consolidation.executed', 'consolidation.completed',
  ]

  for (const eventName of auditableEvents) {
    registerListener(eventName, async (supa, event) => {
      const action = eventName.split('.')[1] as any
      await logBulk(supa, [{
        company_id: event.company_id,
        user_id: event.actor_id ?? 'system',
        action,
        target_table: event.entity_type ?? 'unknown',
        record_id: event.entity_id ?? 'unknown',
        metadata: { event_id: event.id, event_payload: event.payload },
      }])
    })
  }
}
