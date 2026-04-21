import { config as loadDotenv } from "dotenv"
import { createClient } from "@supabase/supabase-js"

loadDotenv({ path: ".env.local" })

type SupabaseLike = any

const DEFAULT_TEST_COMPANY_ID = "8ef6338c-1713-4202-98ac-863633b76526"
const DEFAULT_BILL_NUMBERS = [
  "BILL-CANARY-20260417-01",
  "BILL-CANARY-20260417-01-850692a0",
  "BILL-CANARY-20260417-01-9ca6f8da",
]

type CleanupArgs = {
  companyId: string
  billNumbers: string[]
}

type CleanupSummary = {
  companyId: string
  billIds: string[]
  billNumbers: string[]
  deleted: Record<string, number>
  verification: Record<string, number>
}

function getArg(flag: string) {
  const index = process.argv.indexOf(flag)
  if (index === -1) return null
  return String(process.argv[index + 1] || "").trim() || null
}

function getArgs(flag: string) {
  const values: string[] = []
  for (let index = 0; index < process.argv.length; index += 1) {
    if (process.argv[index] === flag) {
      const next = String(process.argv[index + 1] || "").trim()
      if (next) values.push(next)
    }
  }
  return values
}

function parseArgs(): CleanupArgs {
  const providedBillNumbers = getArgs("--bill-number")
  return {
    companyId: getArg("--company-id") || DEFAULT_TEST_COMPANY_ID,
    billNumbers: providedBillNumbers.length > 0 ? providedBillNumbers : DEFAULT_BILL_NUMBERS,
  }
}

function requireEnv(name: string) {
  const value = String(process.env[name] || "").trim()
  if (!value) {
    throw new Error(`MISSING_ENV: ${name}`)
  }
  return value
}

function createServiceSupabase() {
  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL")
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY")
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
      },
    },
  })
}

async function deleteByIds(
  supabase: SupabaseLike,
  table: string,
  column: string,
  ids: string[] | null | undefined
) {
  const values = Array.isArray(ids) ? ids.filter(Boolean) : []
  if (values.length === 0) return 0

  const { error, count } = await supabase
    .from(table)
    .delete({ count: "exact" })
    .in(column, values)

  if (error) {
    throw new Error(`${table}: ${error.message || "delete failed"}`)
  }

  return Number(count || 0)
}

async function selectIds(
  supabase: SupabaseLike,
  table: string,
  select: string,
  filter: (query: SupabaseLike) => SupabaseLike
) {
  const query = filter(supabase.from(table).select(select))
  const { data, error } = await query
  if (error) {
    throw new Error(`${table}: ${error.message || "select failed"}`)
  }
  return Array.isArray(data) ? data : []
}

async function main() {
  const args = parseArgs()
  const supabase = createServiceSupabase()

  const { data: bills, error: billsError } = await supabase
    .from("bills")
    .select("id, bill_number, company_id")
    .eq("company_id", args.companyId)
    .in("bill_number", args.billNumbers)
    .order("bill_number")

  if (billsError) {
    throw new Error(billsError.message || "Failed to load target bills")
  }

  const billRows = Array.isArray(bills) ? bills : []
  const foundNumbers = new Set(billRows.map((row) => String(row.bill_number || "")))
  const missingNumbers = args.billNumbers.filter((billNumber) => !foundNumbers.has(billNumber))
  if (missingNumbers.length > 0) {
    throw new Error(`TARGET_BILLS_NOT_FOUND: ${missingNumbers.join(", ")}`)
  }

  const billIds = billRows.map((row) => String(row.id))

  const billItems = await selectIds(
    supabase,
    "bill_items",
    "id, bill_id",
    (query) => query.in("bill_id", billIds)
  )
  const notifications = await selectIds(
    supabase,
    "notifications",
    "id, reference_id",
    (query) => query.eq("reference_type", "bill").in("reference_id", billIds)
  )
  const notificationIds = notifications.map((row: any) => String(row.id))

  const notificationStates = notificationIds.length
    ? await selectIds(
        supabase,
        "notification_user_states",
        "notification_id",
        (query) => query.in("notification_id", notificationIds)
      )
    : []

  const traces = await selectIds(
    supabase,
    "financial_operation_traces",
    "transaction_id, event_type, source_id",
    (query) => query.eq("source_entity", "bill").in("source_id", billIds)
  )
  const traceIds = traces.map((row: any) => String(row.transaction_id))

  const traceLinks = traceIds.length
    ? await selectIds(
        supabase,
        "financial_operation_trace_links",
        "transaction_id, entity_id",
        (query) => query.in("transaction_id", traceIds)
      )
    : await selectIds(
        supabase,
        "financial_operation_trace_links",
        "transaction_id, entity_id",
        (query) => query.eq("entity_type", "bill").in("entity_id", billIds)
      )

  const commitIntents = traceIds.length
    ? await selectIds(
        supabase,
        "financial_replay_commit_intents",
        "id, source_trace_id",
        (query) => query.in("source_trace_id", traceIds)
      )
    : []
  const commitIntentIds = commitIntents.map((row: any) => String(row.id))

  const replayExecutions = commitIntentIds.length
    ? await selectIds(
        supabase,
        "financial_replay_executions",
        "id, intent_id",
        (query) => query.in("intent_id", commitIntentIds)
      )
    : []
  const replayExecutionIds = replayExecutions.map((row: any) => String(row.id))

  const auditLogs = await selectIds(
    supabase,
    "audit_logs",
    "id, record_id",
    (query) => query.eq("target_table", "bills").in("record_id", billIds)
  )

  const outboxEvents = await selectIds(
    supabase,
    "notification_outbox_events",
    "event_id, aggregate_id",
    (query) =>
      query
        .eq("aggregate_type", "bill")
        .in("aggregate_id", billIds)
  )

  const goodsReceipts = await selectIds(
    supabase,
    "goods_receipts",
    "id, bill_id",
    (query) => query.in("bill_id", billIds)
  )

  const inventoryTransactions = await selectIds(
    supabase,
    "inventory_transactions",
    "id, reference_id",
    (query) => query.eq("reference_type", "bill").in("reference_id", billIds)
  )

  const journalEntries = await selectIds(
    supabase,
    "journal_entries",
    "id, reference_id",
    (query) => query.eq("reference_type", "bill").in("reference_id", billIds)
  )
  const journalEntryIds = journalEntries.map((row: any) => String(row.id))

  const journalEntryLines = journalEntryIds.length
    ? await selectIds(
        supabase,
        "journal_entry_lines",
        "id, journal_entry_id",
        (query) => query.in("journal_entry_id", journalEntryIds)
      )
    : []

  const deleted: Record<string, number> = {}

  deleted.notification_user_states = await deleteByIds(
    supabase,
    "notification_user_states",
    "notification_id",
    notificationStates.map((row: any) => String(row.notification_id))
  )
  deleted.notifications = await deleteByIds(
    supabase,
    "notifications",
    "id",
    notificationIds
  )
  deleted.financial_replay_executions = await deleteByIds(
    supabase,
    "financial_replay_executions",
    "id",
    replayExecutionIds
  )
  deleted.financial_replay_commit_intents = await deleteByIds(
    supabase,
    "financial_replay_commit_intents",
    "id",
    commitIntentIds
  )
  deleted.notification_outbox_events = await deleteByIds(
    supabase,
    "notification_outbox_events",
    "event_id",
    outboxEvents.map((row: any) => String(row.event_id))
  )
  deleted.financial_operation_trace_links = await deleteByIds(
    supabase,
    "financial_operation_trace_links",
    "transaction_id",
    traceLinks.map((row: any) => String(row.transaction_id))
  )
  deleted.audit_logs = await deleteByIds(
    supabase,
    "audit_logs",
    "id",
    auditLogs.map((row: any) => String(row.id))
  )
  deleted.goods_receipts = await deleteByIds(
    supabase,
    "goods_receipts",
    "id",
    goodsReceipts.map((row: any) => String(row.id))
  )
  deleted.inventory_transactions = await deleteByIds(
    supabase,
    "inventory_transactions",
    "id",
    inventoryTransactions.map((row: any) => String(row.id))
  )
  deleted.journal_entry_lines = await deleteByIds(
    supabase,
    "journal_entry_lines",
    "id",
    journalEntryLines.map((row: any) => String(row.id))
  )
  deleted.journal_entries = await deleteByIds(
    supabase,
    "journal_entries",
    "id",
    journalEntryIds
  )
  deleted.financial_operation_traces = await deleteByIds(
    supabase,
    "financial_operation_traces",
    "transaction_id",
    traceIds
  )
  deleted.bill_items = await deleteByIds(
    supabase,
    "bill_items",
    "bill_id",
    billIds
  )
  deleted.bills = await deleteByIds(
    supabase,
    "bills",
    "id",
    billIds
  )
  deleted.audit_logs_post_delete = await deleteByIds(
    supabase,
    "audit_logs",
    "record_id",
    billIds
  )

  const verification: Record<string, number> = {}

  verification.bills = (
    await selectIds(supabase, "bills", "id", (query) => query.eq("company_id", args.companyId).in("id", billIds))
  ).length
  verification.bill_items = (
    await selectIds(supabase, "bill_items", "id", (query) => query.in("bill_id", billIds))
  ).length
  verification.notifications = (
    await selectIds(
      supabase,
      "notifications",
      "id",
      (query) => query.eq("reference_type", "bill").in("reference_id", billIds)
    )
  ).length
  verification.traces = (
    await selectIds(
      supabase,
      "financial_operation_traces",
      "transaction_id",
      (query) => query.eq("source_entity", "bill").in("source_id", billIds)
    )
  ).length
  verification.audit_logs = (
    await selectIds(
      supabase,
      "audit_logs",
      "id",
      (query) => query.eq("target_table", "bills").in("record_id", billIds)
    )
  ).length

  const summary: CleanupSummary = {
    companyId: args.companyId,
    billIds,
    billNumbers: billRows.map((row) => String(row.bill_number || "")),
    deleted,
    verification,
  }

  console.log(JSON.stringify(summary, null, 2))
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        error: error instanceof Error ? error.message : String(error),
      },
      null,
      2
    )
  )
  process.exit(1)
})
