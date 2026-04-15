type SupabaseLike = any

export type FinancialTraceExplorerFilters = {
  companyId: string
  from?: string | null
  to?: string | null
  cursor?: string | null
  sourceEntity?: string | null
  sourceId?: string | null
  eventType?: string | null
  idempotencyKey?: string | null
  entityType?: string | null
  entityId?: string | null
  limit?: number | null
}

export type FinancialTraceExplorerStatus = "success" | "reversed" | "partial" | "orphan-suspect"

export type FinancialTraceExplorerTrace = {
  transaction_id: string
  company_id: string
  source_entity: string
  source_id: string
  event_type: string
  idempotency_key: string | null
  actor_id: string | null
  request_hash: string | null
  audit_flags: unknown
  metadata: Record<string, unknown>
  created_at: string
  status: FinancialTraceExplorerStatus
  links: FinancialTraceExplorerLink[]
}

export type FinancialTraceExplorerLink = {
  id: string
  transaction_id: string
  entity_type: string
  entity_id: string
  link_role: string | null
  reference_type: string | null
  created_at: string
}

export type FinancialTraceExplorerResult = {
  filters: FinancialTraceExplorerFilters
  traces: FinancialTraceExplorerTrace[]
  pageInfo: {
    next_cursor: string | null
    has_more: boolean
    limit: number
  }
  summary: {
    trace_count: number
    link_count: number
    event_types: Record<string, number>
    source_entities: Record<string, number>
    with_idempotency: number
    with_request_hash: number
  }
}

const MAX_LIMIT = 200
const DEFAULT_LIMIT = 50
const POSTING_LINK_TYPES = new Set([
  "journal_entry",
  "journal_entry_line",
  "inventory_transaction",
  "payment",
  "payment_allocation",
  "advance_application",
  "vendor_credit",
  "customer_credit",
  "bill",
  "invoice",
  "purchase_return",
  "capital_contribution",
  "consolidation_run",
])

const encodeCursor = (createdAt: string) =>
  Buffer.from(JSON.stringify({ created_at: createdAt }), "utf8").toString("base64")

const decodeCursor = (cursor?: string | null) => {
  if (!cursor) return null
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64").toString("utf8"))
    return typeof parsed?.created_at === "string" ? parsed.created_at : null
  } catch {
    return cursor
  }
}

export class FinancialTraceExplorerService {
  constructor(private readonly adminSupabase: SupabaseLike) {}

  async search(filters: FinancialTraceExplorerFilters): Promise<FinancialTraceExplorerResult> {
    if (!filters.companyId) throw new Error("Company is required")

    const limit = Math.min(Math.max(Number(filters.limit || DEFAULT_LIMIT), 1), MAX_LIMIT)
    let linkedTransactionIds: string[] | null = null

    if (filters.entityType || filters.entityId) {
      let linkQuery = this.adminSupabase
        .from("financial_operation_trace_links")
        .select("transaction_id")
        .limit(MAX_LIMIT)

      if (filters.entityType) linkQuery = linkQuery.eq("entity_type", filters.entityType)
      if (filters.entityId) linkQuery = linkQuery.eq("entity_id", filters.entityId)

      const { data: linkedRows, error: linkFilterError } = await linkQuery
      if (linkFilterError) throw new Error(linkFilterError.message || "Failed to filter trace links")
      linkedTransactionIds = Array.from(new Set((linkedRows || []).map((row: any) => String(row.transaction_id || "")).filter(Boolean)))
      if (linkedTransactionIds.length === 0) {
        return this.emptyResult(filters)
      }
    }

    const cursorCreatedAt = decodeCursor(filters.cursor)
    let traceQuery = this.adminSupabase
      .from("financial_operation_traces")
      .select("transaction_id, company_id, source_entity, source_id, event_type, idempotency_key, actor_id, request_hash, audit_flags, metadata, created_at")
      .eq("company_id", filters.companyId)
      .order("created_at", { ascending: false })
      .limit(limit + 1)

    if (filters.from) traceQuery = traceQuery.gte("created_at", `${filters.from}T00:00:00.000Z`)
    if (filters.to) traceQuery = traceQuery.lte("created_at", `${filters.to}T23:59:59.999Z`)
    if (cursorCreatedAt) traceQuery = traceQuery.lt("created_at", cursorCreatedAt)
    if (filters.sourceEntity) traceQuery = traceQuery.eq("source_entity", filters.sourceEntity)
    if (filters.sourceId) traceQuery = traceQuery.eq("source_id", filters.sourceId)
    if (filters.eventType) traceQuery = traceQuery.eq("event_type", filters.eventType)
    if (filters.idempotencyKey) traceQuery = traceQuery.eq("idempotency_key", filters.idempotencyKey)
    if (linkedTransactionIds) traceQuery = traceQuery.in("transaction_id", linkedTransactionIds)

    const { data: traces, error: traceError } = await traceQuery
    if (traceError) throw new Error(traceError.message || "Failed to load financial traces")

    const rawTraces = traces || []
    const hasMore = rawTraces.length > limit
    const pageTraces = hasMore ? rawTraces.slice(0, limit) : rawTraces
    const transactionIds = pageTraces.map((trace: any) => String(trace.transaction_id || "")).filter(Boolean)
    let links: FinancialTraceExplorerLink[] = []
    if (transactionIds.length > 0) {
      const { data: linkRows, error: linksError } = await this.adminSupabase
        .from("financial_operation_trace_links")
        .select("id, transaction_id, entity_type, entity_id, link_role, reference_type, created_at")
        .in("transaction_id", transactionIds)
        .order("created_at", { ascending: true })
      if (linksError) throw new Error(linksError.message || "Failed to load financial trace links")
      links = (linkRows || []) as FinancialTraceExplorerLink[]
    }

    const linksByTrace = new Map<string, FinancialTraceExplorerLink[]>()
    for (const link of links) {
      const existing = linksByTrace.get(link.transaction_id) || []
      existing.push(link)
      linksByTrace.set(link.transaction_id, existing)
    }

    const mappedTraces = pageTraces.map((trace: any) => ({
      ...trace,
      metadata: trace.metadata || {},
      links: linksByTrace.get(String(trace.transaction_id)) || [],
    })).map((trace: FinancialTraceExplorerTrace) => ({
      ...trace,
      status: this.deriveStatus(trace),
    })) as FinancialTraceExplorerTrace[]
    const lastTrace = mappedTraces[mappedTraces.length - 1]

    return {
      filters: { ...filters, limit },
      traces: mappedTraces,
      pageInfo: {
        next_cursor: hasMore && lastTrace?.created_at ? encodeCursor(lastTrace.created_at) : null,
        has_more: hasMore,
        limit,
      },
      summary: this.buildSummary(mappedTraces),
    }
  }

  private emptyResult(filters: FinancialTraceExplorerFilters): FinancialTraceExplorerResult {
    return {
      filters,
      traces: [],
      pageInfo: {
        next_cursor: null,
        has_more: false,
        limit: Math.min(Math.max(Number(filters.limit || DEFAULT_LIMIT), 1), MAX_LIMIT),
      },
      summary: {
        trace_count: 0,
        link_count: 0,
        event_types: {},
        source_entities: {},
        with_idempotency: 0,
        with_request_hash: 0,
      },
    }
  }

  private buildSummary(traces: FinancialTraceExplorerTrace[]) {
    const eventTypes: Record<string, number> = {}
    const sourceEntities: Record<string, number> = {}
    let linkCount = 0
    let withIdempotency = 0
    let withRequestHash = 0

    for (const trace of traces) {
      eventTypes[trace.event_type] = (eventTypes[trace.event_type] || 0) + 1
      sourceEntities[trace.source_entity] = (sourceEntities[trace.source_entity] || 0) + 1
      linkCount += trace.links.length
      if (trace.idempotency_key) withIdempotency += 1
      if (trace.request_hash) withRequestHash += 1
    }

    return {
      trace_count: traces.length,
      link_count: linkCount,
      event_types: eventTypes,
      source_entities: sourceEntities,
      with_idempotency: withIdempotency,
      with_request_hash: withRequestHash,
    }
  }

  private deriveStatus(trace: FinancialTraceExplorerTrace): FinancialTraceExplorerStatus {
    const eventType = String(trace.event_type || "").toLowerCase()
    const links = trace.links || []
    if (links.some((link) => String(link.link_role || "").toLowerCase().includes("reversal")) || eventType.includes("reversal")) {
      return "reversed"
    }
    if (links.length === 0) {
      return "orphan-suspect"
    }
    if (links.some((link) => POSTING_LINK_TYPES.has(String(link.entity_type || "")))) {
      return "success"
    }
    return "partial"
  }
}
