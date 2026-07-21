/**
 * financial-trace.ts
 * ---------------------------------------------------------------------------
 * One place to record who performed a financial operation.
 *
 * Why this file exists
 * --------------------
 * A survey of this codebase found `createTrace` / `linkTrace` privately
 * re-implemented in FIFTEEN command services. They have already drifted:
 * customer-payment-command orders its lookup by created_at, purchase-return
 * does not, so the two return different rows when a trace has several links of
 * the same entity type. That is a latent bug, and every new copy multiplies it.
 *
 * This helper was written when two more call sites needed tracing, rather than
 * making it seventeen. It does not attempt to replace the existing fifteen —
 * consolidating those means choosing one behaviour for every financial service
 * at once, which deserves its own session and its own testing. This is the
 * shared implementation new code should use.
 *
 * Design rules, learned the hard way in v3.74.774-776
 * ---------------------------------------------------
 * 1. TRACING MUST NEVER BREAK THE OPERATION IT OBSERVES.
 *    Every failure here is logged and swallowed. If the audit write fails, the
 *    payment correction has still happened and must still be reported as
 *    happened. An audit trail that can fail a financial operation is a worse
 *    problem than a missing audit row.
 *
 * 2. THE ACTOR IS RECORDED HONESTLY, INCLUDING WHEN THERE ISN'T ONE.
 *    Pass null rather than substituting a service account. A trail that invents
 *    an actor is worse than one that admits it had none.
 *
 * 3. LINKS ARE DERIVED FROM WHAT THE OPERATION ACTUALLY RETURNED,
 *    not from what it was asked to do. A correction that produced no reversal
 *    entry should not carry a link claiming it did.
 * ---------------------------------------------------------------------------
 */

/**
 * The narrowest shape this helper actually needs.
 *
 * Deliberately loose in two places, because the first version was too strict
 * and tsc rejected every real caller:
 *
 *   - `fn` is `any`, not `string`. supabase-js types the function name as a
 *     union of the names in the generated schema, and a plain `string`
 *     parameter is not assignable from it.
 *   - the return is `PromiseLike`, not `Promise`. `.rpc()` returns a
 *     PostgrestFilterBuilder that is awaitable but is not a Promise.
 *
 * Both were caught by tsc before shipping, which is the point of running it.
 * Widening here rather than casting at each call site keeps the looseness in
 * one documented place instead of scattering `as any` through the routes.
 */
type MinimalClient = {
  rpc: (fn: any, args?: any) => PromiseLike<{ data: any; error: any }>
}

export type TraceLink = {
  /** Table-ish noun: 'payment', 'journal_entry', 'invoice', ... */
  entityType: string
  entityId: string | null | undefined
  /** 'source' for the originating record; otherwise usually the entity type. */
  linkRole?: string
}

export type TraceOutcome = {
  traceId: string | null
  linked: number
  failures: string[]
}

/**
 * Record a financial operation and link the entities it touched.
 *
 * Returns rather than throws. Callers should surface `failures` in logs but
 * must not fail the request because of them — see rule 1 above.
 */
export async function recordFinancialTrace(
  client: MinimalClient,
  params: {
    companyId: string
    /** The record the operation started from, e.g. a correction request. */
    sourceEntity: string
    sourceId: string
    /** What happened, e.g. 'payment_correction'. Matches the journal reference. */
    eventType: string
    /** The signed-in user, or null when no human initiated it. */
    actorId: string | null
    /** Deterministic and unique per operation. */
    idempotencyKey: string
    metadata?: Record<string, unknown>
    links: TraceLink[]
  }
): Promise<TraceOutcome> {
  const failures: string[] = []

  const { data: traceId, error: traceErr } = await client.rpc("create_financial_operation_trace", {
    p_company_id: params.companyId,
    p_source_entity: params.sourceEntity,
    p_source_id: params.sourceId,
    p_event_type: params.eventType,
    p_actor_id: params.actorId,
    p_idempotency_key: params.idempotencyKey,
    p_request_hash: null,
    p_metadata: params.metadata ?? {},
    p_audit_flags: params.actorId ? null : ["no_session_actor"],
  })

  if (traceErr || !traceId) {
    // The operation itself already succeeded. Say so loudly and move on.
    const detail = traceErr?.message ?? "no transaction id returned"
    console.error(`[TRACE_FAILED] ${params.eventType} ${params.sourceId}: ${detail}`)
    return { traceId: null, linked: 0, failures: [`trace: ${detail}`] }
  }

  let linked = 0
  for (const link of params.links) {
    // Rule 3: skip links whose entity the operation did not actually produce.
    if (!link.entityId) continue

    const { error: linkErr } = await client.rpc("link_financial_operation_trace", {
      p_transaction_id: traceId,
      p_entity_type: link.entityType,
      p_entity_id: link.entityId,
      p_link_role: link.linkRole ?? link.entityType,
      p_reference_type: params.eventType,
    })
    if (linkErr) {
      failures.push(`${link.entityType}: ${linkErr.message}`)
    } else {
      linked++
    }
  }

  if (failures.length > 0) {
    console.error(
      `[TRACE_LINK_INCOMPLETE] ${params.eventType} ${params.sourceId}: ` +
        `${linked} linked, ${failures.length} failed — ${failures.join("; ")}`
    )
  }

  return { traceId: String(traceId), linked, failures }
}
