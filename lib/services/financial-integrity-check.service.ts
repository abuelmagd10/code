type SupabaseLike = any

export type FinancialIntegritySeverity = "high" | "medium" | "low"

export type FinancialIntegrityFilters = {
  companyId: string
  from?: string | null
  to?: string | null
  severity?: FinancialIntegritySeverity | null
  limit?: number | null
}

export type FinancialIntegrityFinding = {
  id: string
  check: string
  severity: FinancialIntegritySeverity
  title: string
  description: string
  transaction_id?: string | null
  entity_type?: string | null
  entity_id?: string | null
  metadata?: Record<string, unknown>
}

export type FinancialIntegrityResult = {
  filters: FinancialIntegrityFilters
  checked_at: string
  summary: {
    total_findings: number
    high: number
    medium: number
    low: number
    checks: Record<string, number>
  }
  findings: FinancialIntegrityFinding[]
}

type TraceRow = {
  transaction_id: string
  source_entity: string
  source_id: string
  event_type: string
  idempotency_key: string | null
  request_hash: string | null
  created_at: string
}

type TraceLinkRow = {
  id: string
  transaction_id: string
  entity_type: string
  entity_id: string
  link_role: string | null
  reference_type: string | null
  created_at: string
}

type JournalEntryRow = {
  id: string
  entry_number?: string | null
  reference_type?: string | null
  reference_id?: string | null
  entry_date?: string | null
  status?: string | null
  created_at?: string | null
}

const DEFAULT_LIMIT = 200
const MAX_LIMIT = 500

const ENTITY_TABLES: Record<string, string> = {
  advance_application: "advance_applications",
  bill: "bills",
  capital_contribution: "capital_contributions",
  consolidation_run: "consolidation_runs",
  customer: "customers",
  customer_credit: "customer_credits",
  elimination_entry: "elimination_entries",
  intercompany_document: "intercompany_documents",
  intercompany_reconciliation_result: "intercompany_reconciliation_results",
  intercompany_transaction: "intercompany_transactions",
  inventory_transaction: "inventory_transactions",
  invoice: "invoices",
  journal_entry: "journal_entries",
  journal_entry_line: "journal_entry_lines",
  payment: "payments",
  payment_allocation: "payment_allocations",
  purchase_order: "purchase_orders",
  purchase_return: "purchase_returns",
  sales_order: "sales_orders",
  sales_return: "sales_returns",
  supplier: "suppliers",
  vendor_credit: "vendor_credits",
}

const POSTING_LINK_TYPES = new Set([
  "advance_application",
  "capital_contribution",
  "consolidation_run",
  "customer_credit",
  "inventory_transaction",
  "journal_entry",
  "journal_entry_line",
  "payment",
  "payment_allocation",
  "vendor_credit",
])

const POSTING_EVENT_KEYWORDS = [
  "consolidation",
  "contribution",
  "journal",
  "payment",
  "posting",
  "receipt",
  "refund",
  "return",
  "transfer",
  "voucher",
]

const normalizeLimit = (limit?: number | null) =>
  Math.min(Math.max(Number(limit || DEFAULT_LIMIT), 1), MAX_LIMIT)

const isPostingEvent = (eventType: string) => {
  const normalized = String(eventType || "").toLowerCase()
  return POSTING_EVENT_KEYWORDS.some((keyword) => normalized.includes(keyword))
}

const unique = (values: string[]) => Array.from(new Set(values.filter(Boolean)))

export class FinancialIntegrityCheckService {
  constructor(private readonly adminSupabase: SupabaseLike) {}

  async run(filters: FinancialIntegrityFilters): Promise<FinancialIntegrityResult> {
    if (!filters.companyId) throw new Error("Company is required")

    const limit = normalizeLimit(filters.limit)
    const traces = await this.loadTraces({ ...filters, limit })
    const traceIds = traces.map((trace) => trace.transaction_id)
    const links = await this.loadLinks(traceIds)
    const linksByTrace = this.groupLinksByTrace(links)

    const findings = [
      ...(await this.checkOrphanJournalEntries({ ...filters, limit })),
      ...this.checkTracePostingArtifacts(traces, linksByTrace),
      ...this.checkIdempotencyViolations(traces),
      ...(await this.checkBrokenLinks(links)),
    ]

    const filteredFindings = filters.severity
      ? findings.filter((finding) => finding.severity === filters.severity)
      : findings

    return {
      filters: { ...filters, limit },
      checked_at: new Date().toISOString(),
      summary: this.buildSummary(filteredFindings),
      findings: filteredFindings,
    }
  }

  private async loadTraces(filters: FinancialIntegrityFilters): Promise<TraceRow[]> {
    let query = this.adminSupabase
      .from("financial_operation_traces")
      .select("transaction_id, source_entity, source_id, event_type, idempotency_key, request_hash, created_at")
      .eq("company_id", filters.companyId)
      .order("created_at", { ascending: false })
      .limit(normalizeLimit(filters.limit))

    if (filters.from) query = query.gte("created_at", `${filters.from}T00:00:00.000Z`)
    if (filters.to) query = query.lte("created_at", `${filters.to}T23:59:59.999Z`)

    const { data, error } = await query
    if (error) throw new Error(error.message || "Failed to load financial traces for integrity checks")
    return (data || []) as TraceRow[]
  }

  private async loadLinks(transactionIds: string[]): Promise<TraceLinkRow[]> {
    if (transactionIds.length === 0) return []
    const { data, error } = await this.adminSupabase
      .from("financial_operation_trace_links")
      .select("id, transaction_id, entity_type, entity_id, link_role, reference_type, created_at")
      .in("transaction_id", transactionIds)
      .order("created_at", { ascending: true })

    if (error) throw new Error(error.message || "Failed to load financial trace links for integrity checks")
    return (data || []) as TraceLinkRow[]
  }

  private async checkOrphanJournalEntries(filters: FinancialIntegrityFilters): Promise<FinancialIntegrityFinding[]> {
    let query = this.adminSupabase
      .from("journal_entries")
      .select("id, entry_number, reference_type, reference_id, entry_date, status, created_at")
      .eq("company_id", filters.companyId)
      .neq("is_deleted", true)
      .order("entry_date", { ascending: false })
      .limit(normalizeLimit(filters.limit))

    if (filters.from) query = query.gte("entry_date", filters.from)
    if (filters.to) query = query.lte("entry_date", filters.to)

    const { data: entries, error } = await query
    if (error) {
      return [this.systemFinding("orphan_journal_entries", "low", "Journal orphan check unavailable", error.message)]
    }

    const journalEntries = (entries || []) as JournalEntryRow[]
    const journalEntryIds = journalEntries.map((entry) => entry.id)
    if (journalEntryIds.length === 0) return []

    const { data: linkedRows, error: linkError } = await this.adminSupabase
      .from("financial_operation_trace_links")
      .select("entity_id")
      .eq("entity_type", "journal_entry")
      .in("entity_id", journalEntryIds)

    if (linkError) {
      return [this.systemFinding("orphan_journal_entries", "low", "Journal trace link check unavailable", linkError.message)]
    }

    const linkedIds = new Set((linkedRows || []).map((row: any) => String(row.entity_id)))
    return journalEntries
      .filter((entry) => !linkedIds.has(entry.id))
      .map((entry) => ({
        id: `orphan_journal_entry:${entry.id}`,
        check: "orphan_journal_entries",
        severity: String(entry.status || "").toLowerCase() === "posted" ? "high" : "medium",
        title: "Journal entry has no financial trace",
        description: "A journal entry exists without a financial_operation_trace link.",
        entity_type: "journal_entry",
        entity_id: entry.id,
        metadata: {
          entry_number: entry.entry_number || null,
          reference_type: entry.reference_type || null,
          reference_id: entry.reference_id || null,
          entry_date: entry.entry_date || null,
          status: entry.status || null,
        },
      } satisfies FinancialIntegrityFinding))
  }

  private checkTracePostingArtifacts(
    traces: TraceRow[],
    linksByTrace: Map<string, TraceLinkRow[]>
  ): FinancialIntegrityFinding[] {
    const findings: FinancialIntegrityFinding[] = []
    for (const trace of traces) {
      if (!isPostingEvent(trace.event_type)) continue
      const links = linksByTrace.get(trace.transaction_id) || []
      if (links.length === 0) {
        findings.push({
          id: `trace_without_links:${trace.transaction_id}`,
          check: "trace_without_posting",
          severity: "high",
          title: "Financial trace has no linked artifacts",
          description: "A posting-like trace exists without any concrete lineage links.",
          transaction_id: trace.transaction_id,
          entity_type: trace.source_entity,
          entity_id: trace.source_id,
          metadata: {
            event_type: trace.event_type,
            idempotency_key: trace.idempotency_key || null,
            request_hash: trace.request_hash || null,
          },
        })
        continue
      }

      if (!links.some((link) => POSTING_LINK_TYPES.has(link.entity_type))) {
        findings.push({
          id: `trace_without_posting_artifact:${trace.transaction_id}`,
          check: "trace_without_posting",
          severity: "medium",
          title: "Financial trace has no posting artifact link",
          description: "A posting-like trace is linked, but none of the links point to posting artifacts such as journals, inventory, payments, credits, or consolidation runs.",
          transaction_id: trace.transaction_id,
          entity_type: trace.source_entity,
          entity_id: trace.source_id,
          metadata: {
            event_type: trace.event_type,
            linked_entity_types: unique(links.map((link) => link.entity_type)),
          },
        })
      }
    }
    return findings
  }

  private checkIdempotencyViolations(traces: TraceRow[]): FinancialIntegrityFinding[] {
    const findings: FinancialIntegrityFinding[] = []
    const byEventAndKey = new Map<string, TraceRow[]>()
    const byKey = new Map<string, TraceRow[]>()

    for (const trace of traces) {
      if (!trace.idempotency_key) continue
      const eventKey = `${trace.event_type}::${trace.idempotency_key}`
      byEventAndKey.set(eventKey, [...(byEventAndKey.get(eventKey) || []), trace])
      byKey.set(trace.idempotency_key, [...(byKey.get(trace.idempotency_key) || []), trace])
    }

    for (const [eventKey, rows] of byEventAndKey.entries()) {
      const requestHashes = unique(rows.map((row) => row.request_hash || "NULL"))
      if (requestHashes.length > 1) {
        findings.push({
          id: `idempotency_hash_mismatch:${eventKey}`,
          check: "idempotency_violations",
          severity: "high",
          title: "Idempotency key has multiple request hashes",
          description: "The same event/idempotency_key combination resolved to more than one request_hash.",
          metadata: {
            event_key: eventKey,
            request_hashes: requestHashes,
            transaction_ids: rows.map((row) => row.transaction_id),
          },
        })
      }
    }

    for (const [idempotencyKey, rows] of byKey.entries()) {
      const eventTypes = unique(rows.map((row) => row.event_type))
      const requestHashes = unique(rows.map((row) => row.request_hash || "NULL"))
      if (eventTypes.length > 1 && requestHashes.length > 1) {
        findings.push({
          id: `idempotency_reuse_cross_event:${idempotencyKey}`,
          check: "idempotency_violations",
          severity: "medium",
          title: "Idempotency key reused across event types",
          description: "The same idempotency_key appears across multiple event types with different request hashes.",
          metadata: {
            idempotency_key: idempotencyKey,
            event_types: eventTypes,
            request_hashes: requestHashes,
            transaction_ids: rows.map((row) => row.transaction_id),
          },
        })
      }
    }

    return findings
  }

  private async checkBrokenLinks(links: TraceLinkRow[]): Promise<FinancialIntegrityFinding[]> {
    const findings: FinancialIntegrityFinding[] = []
    const linksByEntityType = new Map<string, TraceLinkRow[]>()

    for (const link of links) {
      linksByEntityType.set(link.entity_type, [...(linksByEntityType.get(link.entity_type) || []), link])
    }

    for (const [entityType, entityLinks] of linksByEntityType.entries()) {
      const tableName = ENTITY_TABLES[entityType]
      if (!tableName) {
        findings.push({
          id: `unmapped_trace_link_entity_type:${entityType}`,
          check: "broken_linkage",
          severity: "low",
          title: "Trace link entity type is not mapped",
          description: "Integrity checks do not yet know how to verify this trace link entity type.",
          entity_type: entityType,
          metadata: {
            link_count: entityLinks.length,
            sample_entity_ids: entityLinks.slice(0, 5).map((link) => link.entity_id),
          },
        })
        continue
      }

      const ids = unique(entityLinks.map((link) => link.entity_id))
      const { data, error } = await this.adminSupabase
        .from(tableName)
        .select("id")
        .in("id", ids)

      if (error) {
        findings.push(this.systemFinding("broken_linkage", "low", `Trace link check unavailable for ${entityType}`, error.message, { entity_type: entityType, table_name: tableName }))
        continue
      }

      const foundIds = new Set((data || []).map((row: any) => String(row.id)))
      for (const link of entityLinks) {
        if (foundIds.has(link.entity_id)) continue
        findings.push({
          id: `broken_trace_link:${link.id}`,
          check: "broken_linkage",
          severity: "high",
          title: "Trace link points to a missing entity",
          description: "A financial trace link references an entity id that could not be found in its mapped table.",
          transaction_id: link.transaction_id,
          entity_type: link.entity_type,
          entity_id: link.entity_id,
          metadata: {
            link_role: link.link_role || null,
            reference_type: link.reference_type || null,
            table_name: tableName,
          },
        })
      }
    }

    return findings
  }

  private groupLinksByTrace(links: TraceLinkRow[]) {
    const grouped = new Map<string, TraceLinkRow[]>()
    for (const link of links) {
      grouped.set(link.transaction_id, [...(grouped.get(link.transaction_id) || []), link])
    }
    return grouped
  }

  private buildSummary(findings: FinancialIntegrityFinding[]) {
    const checks: Record<string, number> = {}
    let high = 0
    let medium = 0
    let low = 0

    for (const finding of findings) {
      checks[finding.check] = (checks[finding.check] || 0) + 1
      if (finding.severity === "high") high += 1
      if (finding.severity === "medium") medium += 1
      if (finding.severity === "low") low += 1
    }

    return {
      total_findings: findings.length,
      high,
      medium,
      low,
      checks,
    }
  }

  private systemFinding(
    check: string,
    severity: FinancialIntegritySeverity,
    title: string,
    description: string,
    metadata?: Record<string, unknown>
  ): FinancialIntegrityFinding {
    return {
      id: `${check}:system:${title}`,
      check,
      severity,
      title,
      description,
      metadata,
    }
  }
}
