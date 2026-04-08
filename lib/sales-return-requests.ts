export const SALES_RETURN_REQUEST_STATUSES = {
  pendingLevel1: 'pending_approval_level_1',
  pendingWarehouse: 'pending_warehouse_approval',
  approvedCompleted: 'approved_completed',
  rejectedLevel1: 'rejected_level_1',
  rejectedWarehouse: 'rejected_warehouse',
  legacyPending: 'pending',
  legacyApproved: 'approved',
  legacyRejected: 'rejected',
} as const

export type SalesReturnRequestStatus =
  (typeof SALES_RETURN_REQUEST_STATUSES)[keyof typeof SALES_RETURN_REQUEST_STATUSES]

export type SalesReturnRequestPhase =
  | 'pending_level_1'
  | 'pending_warehouse'
  | 'approved_completed'
  | 'rejected_level_1'
  | 'rejected_warehouse'
  | 'unknown'

export type SalesReturnRequestItemPayload = {
  id: string
  product_id: string | null
  name: string
  quantity: number
  maxQty: number
  qtyToReturn: number
  qtyCreditOnly?: number
  cost_price: number
  unit_price: number
  tax_rate: number
  discount_percent: number
  line_total: number
}

export const SALES_RETURN_LEVEL1_APPROVER_ROLES = [
  'owner',
  'admin',
  'general_manager',
  'manager',
  'accountant',
] as const

export const SALES_RETURN_WAREHOUSE_ROLES = [
  'store_manager',
  'warehouse_manager',
] as const

export const SALES_RETURN_ACTIVE_REQUEST_STATUSES: SalesReturnRequestStatus[] = [
  SALES_RETURN_REQUEST_STATUSES.pendingLevel1,
  SALES_RETURN_REQUEST_STATUSES.pendingWarehouse,
  SALES_RETURN_REQUEST_STATUSES.legacyPending,
]

export function normalizeSalesReturnRequestStatus(status?: string | null): SalesReturnRequestPhase {
  switch (String(status || '').toLowerCase()) {
    case SALES_RETURN_REQUEST_STATUSES.pendingLevel1:
    case SALES_RETURN_REQUEST_STATUSES.legacyPending:
      return 'pending_level_1'
    case SALES_RETURN_REQUEST_STATUSES.pendingWarehouse:
      return 'pending_warehouse'
    case SALES_RETURN_REQUEST_STATUSES.approvedCompleted:
    case SALES_RETURN_REQUEST_STATUSES.legacyApproved:
      return 'approved_completed'
    case SALES_RETURN_REQUEST_STATUSES.rejectedLevel1:
      return 'rejected_level_1'
    case SALES_RETURN_REQUEST_STATUSES.rejectedWarehouse:
      return 'rejected_warehouse'
    case SALES_RETURN_REQUEST_STATUSES.legacyRejected:
      return 'rejected_level_1'
    default:
      return 'unknown'
  }
}

export function isSalesReturnPendingLevel1(status?: string | null) {
  return normalizeSalesReturnRequestStatus(status) === 'pending_level_1'
}

export function isSalesReturnPendingWarehouse(status?: string | null) {
  return normalizeSalesReturnRequestStatus(status) === 'pending_warehouse'
}

export function isSalesReturnRequestActive(status?: string | null) {
  const phase = normalizeSalesReturnRequestStatus(status)
  return phase === 'pending_level_1' || phase === 'pending_warehouse'
}

export function getSalesReturnRequestStatusLabel(status?: string | null, lang: 'ar' | 'en' = 'ar') {
  const phase = normalizeSalesReturnRequestStatus(status)
  switch (phase) {
    case 'pending_level_1':
      return lang === 'en' ? 'Pending Management Approval' : 'بانتظار اعتماد الإدارة'
    case 'pending_warehouse':
      return lang === 'en' ? 'Pending Warehouse Approval' : 'بانتظار اعتماد المخزن'
    case 'approved_completed':
      return lang === 'en' ? 'Approved & Completed' : 'مكتمل بعد الاعتماد'
    case 'rejected_level_1':
      return lang === 'en' ? 'Rejected by Management' : 'مرفوض من الإدارة'
    case 'rejected_warehouse':
      return lang === 'en' ? 'Rejected by Warehouse' : 'مرفوض من المخزن'
    default:
      return status || (lang === 'en' ? 'Unknown' : 'غير معروف')
  }
}

export function buildSalesReturnItemsForExecution(items: unknown): SalesReturnRequestItemPayload[] {
  if (!Array.isArray(items)) return []

  return items
    .map((item) => {
      const row = item as Partial<SalesReturnRequestItemPayload>
      return {
        id: String(row.id || ''),
        product_id: row.product_id ? String(row.product_id) : null,
        name: String(row.name || ''),
        quantity: Number(row.quantity || 0),
        maxQty: Number(row.maxQty || 0),
        qtyToReturn: Number(row.qtyToReturn || 0),
        qtyCreditOnly: Number(row.qtyCreditOnly || 0),
        cost_price: Number(row.cost_price || 0),
        unit_price: Number(row.unit_price || 0),
        tax_rate: Number(row.tax_rate || 0),
        discount_percent: Number(row.discount_percent || 0),
        line_total: Number(row.line_total || 0),
      }
    })
    .filter((item) => item.id && item.qtyToReturn > 0)
}
