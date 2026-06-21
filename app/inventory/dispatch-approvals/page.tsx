"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { useSupabase } from "@/lib/supabase/hooks"
import { getActiveCompanyId } from "@/lib/company"
import { useToast } from "@/hooks/use-toast"
import { useAutoRefresh } from "@/hooks/use-auto-refresh"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ERPPageHeader } from "@/components/erp-page-header"
import { CompanyHeader } from "@/components/company-header"
import { Package, Check, X, Box, Info, Search, Factory, FileText, AlertTriangle, Loader2, Eye, ArrowLeftRight, Send } from "lucide-react"
import { DataTable, type DataTableColumn } from "@/components/DataTable"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { FilterContainer } from "@/components/ui/filter-container"
import { LoadingState } from "@/components/ui/loading-state"
import { EmptyState } from "@/components/ui/empty-state"

// ─── Sales Invoice approval ───────────────────────────────────────────────────
interface DispatchInvoice {
  id: string
  invoice_number: string
  invoice_date: string
  customer?: { name: string }
  warehouse?: { name: string }
  shipping_provider?: { provider_name: string }
  total_amount: number
  warehouse_status: string
  items_count: number
}

// ─── Manufacturing material-issue approval ────────────────────────────────────
interface ManufacturingApproval {
  id: string
  status: string
  requested_at: string
  rejection_reason?: string
  notes?: string
  warehouse?: { id: string; name: string }
  branch?: { id: string; name: string }
  production_order?: {
    id: string
    order_no: string
    status: string
    planned_quantity: number
    order_uom: string
    product?: { id: string; name: string; sku: string }
  }
}

// ─── Unified row (discriminated union) ───────────────────────────────────────
// v3.74.51 — added "transfer" so warehouse managers see approved transfer
// requests in the same place they handle invoice & manufacturing dispatches.
type ApprovalType = "sales" | "manufacturing" | "transfer"
interface UnifiedRow {
  _type: ApprovalType
  id: string
  reference: string        // invoice_number OR order_no
  date: string
  // v3.74.5 — split fields for richer table layout
  customer: string         // sales: customer name | manufacturing: "—"
  product: string          // sales: first item product (+N) | manufacturing: order's product
  quantity: number         // sales: sum of item quantities | manufacturing: planned_quantity
  uom: string              // unit of measure (manufacturing only); sales = ""
  warehouse: string
  branch: string
  shipping: string         // sales: shipping provider | manufacturing: "—"
  raw: DispatchInvoice | ManufacturingApproval
}

// ─── History row ──────────────────────────────────────────────────────────────
interface HistoryRow {
  _type: ApprovalType
  id: string
  reference: string
  date: string            // decision date
  party: string
  warehouse: string
  branch: string
  shippingProvider: string
  status: string          // approved | rejected
  reason?: string
  decidedBy?: string
  amount?: number
  items?: Array<{ product_name: string; quantity: number; product_type?: string }>
}

type TypeFilter = "all" | "sales" | "manufacturing" | "transfer"
type HistoryStatusFilter = "all" | "approved" | "rejected"

export default function DispatchApprovalsPage() {
  const supabase = useSupabase()
  const router = useRouter()
  const { toast } = useToast()

  const [rows, setRows] = useState<UnifiedRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all")
  const [activeTab, setActiveTab] = useState<"pending" | "history">("pending")

  // History state
  const [historyRows, setHistoryRows] = useState<HistoryRow[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historySearchQuery, setHistorySearchQuery] = useState("")
  const [historyStatusFilter, setHistoryStatusFilter] = useState<HistoryStatusFilter>("all")
  const [historyTypeFilter, setHistoryTypeFilter] = useState<TypeFilter>("all")

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [modalMode, setModalMode] = useState<"approve" | "reject">("approve")
  const [selectedRow, setSelectedRow] = useState<UnifiedRow | null>(null)
  const [notes, setNotes] = useState("")
  const [searchQuery, setSearchQuery] = useState("")

  // Shortage modal state
  interface ShortageItem { product_id: string; product_name: string; required_qty: number; available_qty: number; uom: string }
  const [shortageItems, setShortageItems] = useState<ShortageItem[]>([])
  const [isShortageModalOpen, setIsShortageModalOpen] = useState(false)

  const [appLang, setAppLang] = useState<'ar' | 'en'>('ar')
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    setHydrated(true)
    try {
      const fromCookie = document.cookie.split('; ').find((x) => x.startsWith('app_language='))?.split('=')[1]
      setAppLang((fromCookie || localStorage.getItem('app_language') || 'ar') === 'en' ? 'en' : 'ar')
    } catch { }
    const handler = () => {
      try {
        const fromCookie = document.cookie.split('; ').find((x) => x.startsWith('app_language='))?.split('=')[1]
        setAppLang((fromCookie || localStorage.getItem('app_language') || 'ar') === 'en' ? 'en' : 'ar')
      } catch { }
    }
    window.addEventListener('app_language_changed', handler)
    return () => window.removeEventListener('app_language_changed', handler)
  }, [])

  // v3.74.57 - تَحديث تِلقائى عِندَ العَودَة للنّافِذَة/التَّبويب
  useAutoRefresh({ onRefresh: () => loadAll() })

  const loadAll = useCallback(async () => {
    try {
      setIsLoading(true)
      const companyId = await getActiveCompanyId(supabase)
      if (!companyId) return

      // ── 1. فواتير المبيعات ──────────────────────────────────────────────────
      // v3.74.6 — explicit FK columns + explicit FK-named joins so PostgREST
      // can't get confused about which relationship to use. Without the FK
      // hint, the customers JOIN was returning an array PostgREST didn't
      // serialize as an object, leaving the customer cell blank.
      const { data: invData, error: invError } = await supabase
        .from('invoices')
        .select(`
          id, invoice_number, invoice_date, total_amount, warehouse_status,
          customer_id, warehouse_id, branch_id, shipping_provider_id,
          customers:customer_id (name),
          shipping_providers:shipping_provider_id (provider_name),
          warehouses:warehouse_id (name),
          branches:branch_id (name)
        `)
        .eq('company_id', companyId)
        .eq('warehouse_status', 'pending')
        // v3.74.249 — include partially_paid. A partially-paid invoice
        // still needs warehouse approval before the goods can ship; the
        // remaining cash is recognised as AR on the books, not blocked
        // on the operational side. Excluding it stranded INV-00005 in
        // company notniche between "money came in" and "ready to ship"
        // with no place in the queue.
        .in('status', ['sent', 'paid', 'partially_paid'])
        .order('invoice_date', { ascending: false })

      if (invError) throw invError

      const invoiceIds = (invData || []).map((i: any) => i.id)
      // Aggregate per-invoice: items count + total quantity + first product name
      type ItemSummary = { count: number; totalQty: number; firstProduct: string }
      const itemSummaries: Record<string, ItemSummary> = {}
      if (invoiceIds.length > 0) {
        const { data: items } = await supabase
          .from('invoice_items')
          .select('invoice_id, quantity, products(name)')
          .in('invoice_id', invoiceIds)
        items?.forEach((item: any) => {
          const id = item.invoice_id
          // v3.74.6 — products can be array or object via Supabase nested select
          const productNode = Array.isArray(item.products) ? item.products[0] : item.products
          const productName = productNode?.name || ''
          const qty = Number(item.quantity) || 0
          if (!itemSummaries[id]) {
            itemSummaries[id] = { count: 0, totalQty: 0, firstProduct: productName }
          }
          itemSummaries[id].count += 1
          itemSummaries[id].totalQty += qty
          if (!itemSummaries[id].firstProduct && productName) {
            itemSummaries[id].firstProduct = productName
          }
        })
      }
      // Keep the old itemsCounts for any consumer that still reads it
      const itemsCounts: Record<string, number> = {}
      Object.entries(itemSummaries).forEach(([id, s]) => { itemsCounts[id] = s.count })

      const salesRows: UnifiedRow[] = (invData || []).map((inv: any) => {
        const raw: DispatchInvoice = {
          id: inv.id,
          invoice_number: inv.invoice_number,
          invoice_date: inv.invoice_date,
          customer: inv.customers,
          shipping_provider: inv.shipping_providers,
          total_amount: inv.total_amount,
          warehouse_status: inv.warehouse_status,
          items_count: itemsCounts[inv.id] || 0,
        }
        // v3.74.6 — Supabase nested selects can return either an object or
        // an array depending on TS inference. Read both shapes defensively
        // so customer name actually shows up instead of em-dash.
        const pluck = (rel: any, field: string): string => {
          if (!rel) return ""
          if (Array.isArray(rel)) return String(rel[0]?.[field] || "")
          return String((rel as any)?.[field] || "")
        }
        const customerName = pluck(inv.customers, "name") || "—"
        const warehouseName = pluck(inv.warehouses, "name") || "—"
        const branchName = pluck(inv.branches, "name") || "—"
        const shippingName = pluck(inv.shipping_providers, "provider_name") || "—"

        const itemSummary = itemSummaries[inv.id]
        const productLabel = itemSummary && itemSummary.count > 0
          ? (itemSummary.count > 1
              ? `${itemSummary.firstProduct || ''}${itemSummary.firstProduct ? ' ' : ''}+${itemSummary.count - 1}`
              : itemSummary.firstProduct || '—')
          : '—'

        return {
          _type: "sales",
          id: inv.id,
          reference: inv.invoice_number,
          date: inv.invoice_date,
          customer: customerName,
          product: productLabel,
          quantity: itemSummary?.totalQty || 0,
          uom: '',
          warehouse: warehouseName,
          branch: branchName,
          shipping: shippingName,
          raw,
        }
      })

      // ── 2. اعتمادات صرف مواد التصنيع ───────────────────────────────────────
      // management_approved = Stage 2 (waiting warehouse) | partially_approved/rejected = for reference
      const mfgRes = await fetch(`/api/manufacturing/material-issue-approvals?status=management_approved,partially_approved,rejected&company_id=${companyId}`)
      let mfgRows: UnifiedRow[] = []
      if (mfgRes.ok) {
        const mfgJson = await mfgRes.json()
        mfgRows = ((mfgJson.data || []) as ManufacturingApproval[]).map((apv) => ({
          _type: "manufacturing" as ApprovalType,
          id: apv.id,
          reference: apv.production_order?.order_no || apv.id,
          date: apv.requested_at,
          customer: "—",
          product: apv.production_order?.product?.name || "—",
          quantity: apv.production_order?.planned_quantity || 0,
          uom: apv.production_order?.order_uom || '',
          warehouse: apv.warehouse?.name || "—",
          branch: apv.branch?.name || "—",
          shipping: "—",
          raw: apv,
        }))
      }

      // v3.74.51 ── 3. طَلَبات نَقل المَخزون المُعتَمَدَة (status='pending' = اعتُمِدَت وتَنتَظِر بَدء الإِرسال)
      // فِلتَر حَوكَمَة: store_manager يَرى فَقَط طَلَبات مَخزَنِه؛ Owner/Admin/Manager/GM يَرى الكُل
      const { data: { user: currentUser } } = await supabase.auth.getUser()
      let transferRows: UnifiedRow[] = []
      if (currentUser) {
        const { data: member } = await supabase
          .from("company_members")
          .select("role, warehouse_id, branch_id")
          .eq("company_id", companyId)
          .eq("user_id", currentUser.id)
          .single()
        const role = String((member as any)?.role || "").toLowerCase()
        const myWarehouseId = (member as any)?.warehouse_id || null
        const myBranchId = (member as any)?.branch_id || null

        let trQuery = supabase
          .from("inventory_transfers")
          .select(`
            id, transfer_number, transfer_date, status,
            source_warehouse_id, source_branch_id,
            destination_warehouse_id, destination_branch_id,
            source_warehouses:warehouses!inventory_transfers_source_warehouse_id_fkey(id, name),
            destination_warehouses:warehouses!inventory_transfers_destination_warehouse_id_fkey(id, name),
            source_branches:branches!inventory_transfers_source_branch_id_fkey(id, name),
            destination_branches:branches!inventory_transfers_destination_branch_id_fkey(id, name),
            items:inventory_transfer_items(quantity_requested, products(name))
          `)
          .eq("company_id", companyId)
          .eq("status", "pending")
          .is("deleted_at", null)

        // store_manager يَرى فَقَط طَلَبات مَخزَنِه (المَصدَر)
        if (role === "store_manager" && myWarehouseId && myBranchId) {
          trQuery = trQuery.eq("source_warehouse_id", myWarehouseId).eq("source_branch_id", myBranchId)
        }

        const { data: trData } = await trQuery.order("transfer_date", { ascending: false })
        transferRows = ((trData as any[]) || []).map((t: any): UnifiedRow => {
          const items: any[] = t.items || []
          const totalQty = items.reduce((s: number, it: any) => s + Number(it.quantity_requested || 0), 0)
          const firstProductName = items[0]?.products?.name || ""
          const productLabel = items.length > 1
            ? `${firstProductName}${firstProductName ? ' ' : ''}+${items.length - 1}`
            : (firstProductName || "—")
          const srcWh = Array.isArray(t.source_warehouses) ? t.source_warehouses[0] : t.source_warehouses
          const srcBr = Array.isArray(t.source_branches) ? t.source_branches[0] : t.source_branches
          const dstBr = Array.isArray(t.destination_branches) ? t.destination_branches[0] : t.destination_branches
          return {
            _type: "transfer",
            id: t.id,
            reference: t.transfer_number,
            date: t.transfer_date,
            customer: dstBr?.name ? `${appLang === 'en' ? 'To: ' : 'إِلى: '}${dstBr.name}` : "—",
            product: productLabel,
            quantity: totalQty,
            uom: '',
            warehouse: srcWh?.name || "—",
            branch: srcBr?.name || "—",
            shipping: "—",
            raw: t,
          }
        })
      }

      setRows([...salesRows, ...mfgRows, ...transferRows])
    } catch (error: any) {
      console.error("Error loading approvals:", error)
      toast({ title: appLang === 'en' ? "Error" : "خطأ", description: appLang === 'en' ? "Could not load approvals." : "تعذر تحميل طلبات الاعتماد.", variant: "destructive" })
    } finally {
      setIsLoading(false)
    }
  }, [supabase, appLang]) // eslint-disable-line

  useEffect(() => { loadAll() }, [loadAll])

  // ✅ تحميل سجل الإرسال (المعتمد + المرفوض)
  const loadHistory = useCallback(async () => {
    try {
      setHistoryLoading(true)
      const companyId = await getActiveCompanyId(supabase)
      if (!companyId) return

      // ── 1. فواتير مبيعات تم اعتمادها أو رفضها من المخزن ──
      const { data: invData } = await supabase
        .from('invoices')
        .select(`
          id, invoice_number, invoice_date, total_amount, warehouse_status,
          warehouse_rejection_reason, warehouse_rejected_at, approved_by,
          customers (name),
          shipping_providers (provider_name),
          branches (name),
          warehouses (name),
          invoice_items (quantity, products (name, product_type))
        `)
        .eq('company_id', companyId)
        .in('warehouse_status', ['approved', 'rejected'])
        .order('updated_at', { ascending: false })

      // Resolve approver names (same pattern as goods-receipt page)
      const approverIds = (invData || [])
        .map((inv: any) => inv.approved_by)
        .filter(Boolean)
      let approverMap: Record<string, string> = {}
      if (approverIds.length > 0) {
        const { data: usersData } = await supabase
          .from('user_profiles')
          .select('user_id, display_name, username')
          .in('user_id', [...new Set(approverIds)])
        if (usersData) {
          for (const u of usersData) {
            approverMap[u.user_id] = u.display_name || u.username || u.user_id
          }
        }
      }

      const salesHistory: HistoryRow[] = (invData || []).map((inv: any) => ({
        _type: "sales" as ApprovalType,
        id: inv.id,
        reference: inv.invoice_number,
        date: inv.warehouse_status === "rejected"
          ? (inv.warehouse_rejected_at || inv.invoice_date)
          : inv.invoice_date,
        party: inv.customers?.name || "-",
        warehouse: inv.warehouses?.name || "-",
        branch: inv.branches?.name || "-",
        shippingProvider: inv.shipping_providers?.provider_name || "-",
        status: inv.warehouse_status,
        reason: inv.warehouse_rejection_reason || undefined,
        decidedBy: inv.approved_by ? (approverMap[inv.approved_by] || inv.approved_by) : undefined,
        amount: inv.total_amount,
        items: (inv.invoice_items || []).map((item: any) => ({
          product_name: item.products?.name || "-",
          quantity: item.quantity,
          product_type: item.products?.product_type,
        })),
      }))

      // ── 2. طلبات صرف مواد التصنيع المعتمدة/المرفوضة ──
      const mfgRes = await fetch(`/api/manufacturing/material-issue-approvals?status=approved,rejected&company_id=${companyId}`)
      let mfgHistory: HistoryRow[] = []
      if (mfgRes.ok) {
        const mfgJson = await mfgRes.json()
        mfgHistory = ((mfgJson.data || []) as ManufacturingApproval[]).map((apv) => ({
          _type: "manufacturing" as ApprovalType,
          id: apv.id,
          reference: apv.production_order?.order_no || apv.id,
          date: (apv as any).approved_at || (apv as any).rejected_at || apv.requested_at,
          party: apv.production_order?.product?.name || "-",
          warehouse: apv.warehouse?.name || "-",
          branch: apv.branch?.name || "-",
          shippingProvider: "-",
          status: apv.status,
          reason: apv.rejection_reason || undefined,
          items: apv.production_order?.product ? [{
            product_name: apv.production_order.product.name,
            quantity: apv.production_order.planned_quantity,
            product_type: "manufactured",
          }] : undefined,
        }))
      }

      setHistoryRows([...salesHistory, ...mfgHistory].sort((a, b) =>
        new Date(b.date).getTime() - new Date(a.date).getTime()
      ))
    } catch (error: any) {
      console.error("Error loading dispatch history:", error)
    } finally {
      setHistoryLoading(false)
    }
  }, [supabase])

  // تحميل السجل عند التبديل إلى تبويب السجل
  useEffect(() => {
    if (activeTab === "history") {
      loadHistory()
    }
  }, [activeTab, loadHistory])

  const handleActionClick = (row: UnifiedRow, mode: "approve" | "reject") => {
    setSelectedRow(row)
    setModalMode(mode)
    setNotes("")
    setIsModalOpen(true)
  }

  const handleConfirmAction = async () => {
    if (!selectedRow) return
    try {
      setActionLoading(selectedRow.id)

      const companyId = await getActiveCompanyId(supabase)

      let endpoint: string
      if (selectedRow._type === "sales") {
        endpoint = modalMode === "approve"
          ? `/api/invoices/${selectedRow.id}/warehouse-approve`
          : `/api/invoices/${selectedRow.id}/warehouse-reject`
      } else {
        const qp = companyId ? `?company_id=${companyId}` : ""
        endpoint = `/api/manufacturing/material-issue-approvals/${selectedRow.id}/${modalMode}${qp}`
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(modalMode === "reject" ? { rejection_reason: notes } : { notes }),
      })

      const result = await response.json()

      // ── نقص في المخزون → عرض نافذة التفاصيل
      if (!result.success && result.shortages && result.shortages.length > 0) {
        setShortageItems(result.shortages)
        setIsModalOpen(false)
        setIsShortageModalOpen(true)
        return
      }

      if (!result.success) throw new Error(result.error || (appLang === 'en' ? "Unknown error" : "حدث خطأ غير معروف"))

      toast({ title: appLang === 'en' ? "Done" : "تم بنجاح", description: result.message })
      setIsModalOpen(false)
      loadAll()
    } catch (error: any) {
      toast({ title: appLang === 'en' ? "Error" : "خطأ", description: error.message, variant: "destructive" })
    } finally {
      setActionLoading(null)
    }
  }

  // v3.74.6 — Standard column definitions: use the DataTable's built-in
  // `type` + `align` so styling matches every other table in the project.
  // Type icon (📄/🏭) inlined into the Reference cell so we don't burn a
  // whole column on the type.
  const columns: DataTableColumn<UnifiedRow>[] = [
    {
      header: appLang === 'en' ? "Reference #" : "الرقم المرجعي",
      key: "reference",
      type: "text",
      format: (_: any, row: UnifiedRow) => (
        <span className="inline-flex items-center gap-1.5 font-medium text-blue-600 dark:text-blue-400">
          {row._type === "sales"
            ? <FileText className="w-3.5 h-3.5 flex-shrink-0" />
            : row._type === "manufacturing"
              ? <Factory className="w-3.5 h-3.5 flex-shrink-0 text-orange-600" />
              : <ArrowLeftRight className="w-3.5 h-3.5 flex-shrink-0 text-purple-600" /> /* v3.74.51 transfer icon */}
          {row.reference}
        </span>
      ),
    },
    {
      header: appLang === 'en' ? "Date" : "التاريخ",
      key: "date",
      type: "date",
      format: (_: any, row: UnifiedRow) =>
        new Date(row.date).toLocaleDateString(appLang === 'en' ? 'en-US' : 'ar-EG'),
    },
    {
      header: appLang === 'en' ? "Customer" : "العميل",
      key: "customer",
      type: "text",
    },
    {
      header: appLang === 'en' ? "Product" : "المنتج",
      key: "product",
      type: "text",
      format: (_: any, row: UnifiedRow) => (
        <span className="block max-w-[180px] truncate" title={row.product}>{row.product}</span>
      ),
    },
    {
      header: appLang === 'en' ? "Qty" : "الكمية",
      key: "quantity",
      type: "number",
      format: (_: any, row: UnifiedRow) =>
        row.quantity > 0
          ? `${Number(row.quantity).toLocaleString(appLang === 'en' ? 'en-US' : 'ar-EG')}${row.uom ? ` ${row.uom}` : ''}`
          : '—',
    },
    {
      header: appLang === 'en' ? "Branch" : "الفرع",
      key: "branch",
      type: "text",
    },
    {
      header: appLang === 'en' ? "Warehouse" : "المخزن",
      key: "warehouse",
      type: "text",
      format: (_: any, row: UnifiedRow) => (
        <span className="inline-flex items-center gap-1.5">
          <Box className="w-3.5 h-3.5 flex-shrink-0 text-gray-500" />
          {row.warehouse}
        </span>
      ),
    },
    {
      header: appLang === 'en' ? "Shipping" : "شركة الشحن",
      key: "shipping",
      type: "text",
    },
    {
      header: appLang === 'en' ? "Action" : "إجراء",
      key: "action",
      type: "actions",
      format: (_: any, row: UnifiedRow) => {
        const mfgStatus = row._type === "manufacturing" ? (row.raw as any)?.status : null
        const isRejected = mfgStatus === "rejected"
        const isPartial = mfgStatus === "partially_approved"

        // v3.74.51 — طَلَب نَقل مَخزون: زِر واحِد يَفتَح صَفحَة تَفاصيل النَّقل
        // حَيث يَستَطيع مَسؤول المَخزَن (أَو الأَدوار العُليا) ضَغط "بَدء النَّقل"
        if (row._type === "transfer") {
          return (
            <div className="flex gap-2 items-center">
              <Button
                size="sm"
                variant="outline"
                className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                onClick={() => router.push(`/inventory-transfers/${row.id}`)}
              >
                <Send className={`w-4 h-4 ${appLang === 'en' ? 'mr-1' : 'ml-1'}`} />
                {appLang === 'en' ? 'Start Dispatch' : 'بدء الإِرسال'}
              </Button>
            </div>
          )
        }

        return (
          <div className="flex gap-2 items-center">
            {row._type === "manufacturing" ? (
              <>
                {/* Status badge for manufacturing */}
                {isRejected && (
                  <span className="px-2 py-0.5 text-xs rounded-full bg-red-100 text-red-700 border border-red-200">
                    {appLang === 'en' ? "Rejected" : "مرفوض"}
                  </span>
                )}
                {isPartial && (
                  <span className="px-2 py-0.5 text-xs rounded-full bg-amber-100 text-amber-700 border border-amber-200">
                    {appLang === 'en' ? "Partial" : "جزئي"}
                  </span>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  className={isRejected 
                    ? "text-blue-600 hover:text-blue-700 hover:bg-blue-50" 
                    : "text-orange-600 hover:text-orange-700 hover:bg-orange-50"}
                  onClick={() => router.push(`/inventory/dispatch-approvals/${row.id}`)}
                >
                  {isRejected 
                    ? (<>{appLang === 'en' ? "View Details" : "عرض التفاصيل"}</>)
                    : (<><Check className={`w-4 h-4 ${appLang === 'en' ? 'mr-1' : 'ml-1'}`} /> {appLang === 'en' ? "Review & Approve" : "مراجعة واعتماد"}</>)
                  }
                </Button>
                {!isRejected && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                    onClick={() => handleActionClick(row, "reject")}
                    disabled={actionLoading === row.id}
                  >
                    <X className={`w-4 h-4 ${appLang === 'en' ? 'mr-1' : 'ml-1'}`} /> {appLang === 'en' ? "Reject" : "رفض"}
                  </Button>
                )}
              </>
            ) : (
              /* فواتير المبيعات: السلوك القديم */
              <>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-green-600 hover:text-green-700 hover:bg-green-50"
                  onClick={() => handleActionClick(row, "approve")}
                  disabled={actionLoading === row.id}
                >
                  <Check className={`w-4 h-4 ${appLang === 'en' ? 'mr-1' : 'ml-1'}`} /> {appLang === 'en' ? "Approve" : "اعتماد"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-red-600 hover:text-red-700 hover:bg-red-50"
                  onClick={() => handleActionClick(row, "reject")}
                  disabled={actionLoading === row.id}
                >
                  <X className={`w-4 h-4 ${appLang === 'en' ? 'mr-1' : 'ml-1'}`} /> {appLang === 'en' ? "Reject" : "رفض"}
                </Button>
              </>
            )}
          </div>
        )
      }
    }
  ]

  const filteredRows = rows.filter(row => {
    if (typeFilter !== "all" && row._type !== typeFilter) return false
    if (searchQuery) {
      // v3.74.5 — search across reference, customer, product, branch, warehouse, shipping
      const q = searchQuery.toLowerCase()
      const hay = [row.reference, row.customer, row.product, row.branch, row.warehouse, row.shipping]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  })

  const salesCount = rows.filter(r => r._type === "sales").length
  const mfgCount = rows.filter(r => r._type === "manufacturing").length
  // v3.74.51 — عَدّ طَلَبات النَّقل المُعتَمَدَة (status='pending' فى inventory_transfers)
  const transferCount = rows.filter(r => r._type === "transfer").length

  // ✅ فلترة سجل الإرسال
  const filteredHistoryRows = historyRows.filter(row => {
    if (historyTypeFilter !== "all" && row._type !== historyTypeFilter) return false
    if (historyStatusFilter !== "all" && row.status !== historyStatusFilter) return false
    if (historySearchQuery) {
      const q = historySearchQuery.toLowerCase()
      if (!row.reference.toLowerCase().includes(q) && !row.party.toLowerCase().includes(q)) return false
    }
    return true
  })

  const historySalesCount = historyRows.filter(r => r._type === "sales").length
  const historyMfgCount = historyRows.filter(r => r._type === "manufacturing").length
  const hasActiveHistoryFilters = historySearchQuery !== "" || historyStatusFilter !== "all" || historyTypeFilter !== "all"

  if (!hydrated) return null

  return (
    <div className={`flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900 ${appLang === 'ar' ? 'rtl' : 'ltr'}`} dir={appLang === 'ar' ? 'rtl' : 'ltr'}>
      <main className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8 space-y-4 sm:space-y-6 overflow-x-hidden">
        <CompanyHeader />

        <div className="bg-white dark:bg-slate-900 rounded-xl sm:rounded-2xl shadow-sm border border-gray-200 dark:border-slate-800 p-4 sm:p-6 mb-6">
          <ERPPageHeader
            title={appLang === 'en' ? 'Dispatch Approvals' : 'اعتمادات إخراج المخزون'}
            description={appLang === 'en'
              ? 'Review & manage dispatch requests — sales invoices and manufacturing material issues'
              : 'إدارة ومراجعة طلبات الاعتماد — فواتير المبيعات وصرف مواد التصنيع'}
            lang={appLang}
          />
        </div>

        {/* ── Tabs: بانتظار الاعتماد / سجل الإرسال ── */}
        <div className="flex border-b border-gray-200 dark:border-slate-800 mb-4">
          <button
            onClick={() => setActiveTab("pending")}
            className={`pb-3 px-4 text-sm font-medium transition-colors border-b-2 ${
              activeTab === "pending"
                ? "border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400"
                : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            }`}
          >
            {appLang === "en" ? "Pending Approvals" : "بانتظار الاعتماد"}
          </button>
          <button
            onClick={() => setActiveTab("history")}
            className={`pb-3 px-4 text-sm font-medium transition-colors border-b-2 ${
              activeTab === "history"
                ? "border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400"
                : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            }`}
          >
            {appLang === "en" ? "Dispatch History" : "سجل الإرسال"}
          </button>
        </div>

        {/* ── Pending Tab ── */}
        {activeTab === "pending" && (
        <Card className="dark:bg-slate-900 dark:border-slate-800">
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle>{appLang === 'en' ? 'Dispatch Approvals' : 'طلبات الاعتماد'}</CardTitle>
                <CardDescription className="mt-1">
                  {appLang === 'en'
                    ? 'All warehouse approvals — sales and manufacturing'
                    : 'جميع طلبات اعتماد المخزون — المبيعات والتصنيع'}
                </CardDescription>
              </div>
              {/* ── فلتر النوع ── */}
              <div className="flex items-center gap-2 flex-wrap">
                {/* v3.74.51 — أَضَفنا "transfer" لفِلتَر النَّوع */}
                {(["all", "sales", "manufacturing", "transfer"] as TypeFilter[]).map((t) => {
                  const label = {
                    all: appLang === 'en' ? `All (${rows.length})` : `الكل (${rows.length})`,
                    sales: appLang === 'en' ? `Sales (${salesCount})` : `مبيعات (${salesCount})`,
                    manufacturing: appLang === 'en' ? `Mfg. Issue (${mfgCount})` : `صرف تصنيع (${mfgCount})`,
                    transfer: appLang === 'en' ? `Transfers (${transferCount})` : `نقل مَخزون (${transferCount})`,
                  }[t]
                  return (
                    <Button
                      key={t}
                      size="sm"
                      variant={typeFilter === t ? "default" : "outline"}
                      onClick={() => setTypeFilter(t)}
                      className="h-8 text-xs"
                    >
                      {t === "sales" && <FileText className="w-3 h-3 mr-1 rtl:mr-0 rtl:ml-1" />}
                      {t === "manufacturing" && <Factory className="w-3 h-3 mr-1 rtl:mr-0 rtl:ml-1" />}
                      {t === "transfer" && <ArrowLeftRight className="w-3 h-3 mr-1 rtl:mr-0 rtl:ml-1" />}
                      {label}
                    </Button>
                  )
                })}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <FilterContainer
              title={appLang === 'en' ? "Search & Filters" : "البحث والفلاتر"}
              activeCount={(searchQuery ? 1 : 0) + (typeFilter !== "all" ? 1 : 0)}
              onClear={() => { setSearchQuery(""); setTypeFilter("all") }}
            >
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder={appLang === 'en' ? "Search by reference # or party..." : "البحث بالرقم المرجعي أو الاسم..."}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className={appLang === 'ar' ? 'pr-10' : 'pl-10'}
                />
              </div>
            </FilterContainer>

            {isLoading ? (
              <LoadingState
                message={appLang === 'en' ? "Loading pending approvals..." : "جاري تحميل الطلبات..."}
              />
            ) : filteredRows.length === 0 ? (
              <EmptyState
                icon={Package}
                title={searchQuery || typeFilter !== "all"
                  ? (appLang === 'en' ? "No Results" : "لا توجد نتائج")
                  : (appLang === 'en' ? "No Pending Approvals" : "لا توجد طلبات معلقة")}
                description={searchQuery || typeFilter !== "all"
                  ? (appLang === 'en' ? "No items matched your filters." : "لا توجد عناصر تطابق الفلاتر المحددة.")
                  : (appLang === 'en' ? "All approvals have been processed!" : "جميع طلبات الاعتماد قد تمت معالجتها بنجاح!")}
                action={(searchQuery || typeFilter !== "all") ? {
                  label: appLang === 'en' ? "Clear Filters" : "مسح الفلاتر",
                  onClick: () => { setSearchQuery(""); setTypeFilter("all") }
                } : undefined}
              />
            ) : (
              <DataTable
                columns={columns}
                data={filteredRows}
                keyField="id"
              />
            )}
          </CardContent>
        </Card>
        )}

        {/* ── History Tab ── */}
        {activeTab === "history" && (
        <Card className="dark:bg-slate-900 dark:border-slate-800">
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle>{appLang === 'en' ? 'Dispatch History' : 'سجل الإرسال'}</CardTitle>
                <CardDescription className="mt-1">
                  {appLang === 'en'
                    ? 'History of approved and rejected dispatch requests'
                    : 'سجل طلبات الإرسال المعتمدة والمرفوضة'}
                </CardDescription>
              </div>
              {historyRows.length > 0 && (
                <div className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">
                  {appLang === 'en'
                    ? `Total: ${filteredHistoryRows.length} records`
                    : `الإجمالي: ${filteredHistoryRows.length} سجل`}
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <FilterContainer
              title={appLang === 'en' ? "Search & Filters" : "البحث والفلاتر"}
              activeCount={(historySearchQuery ? 1 : 0) + (historyStatusFilter !== "all" ? 1 : 0) + (historyTypeFilter !== "all" ? 1 : 0)}
              onClear={() => { setHistorySearchQuery(""); setHistoryStatusFilter("all"); setHistoryTypeFilter("all") }}
            >
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder={appLang === 'en' ? "Search by reference # or name..." : "البحث بالرقم المرجعي أو الاسم..."}
                    value={historySearchQuery}
                    onChange={(e) => setHistorySearchQuery(e.target.value)}
                    className={appLang === 'ar' ? 'pr-10' : 'pl-10'}
                  />
                </div>
                <Select
                  value={historyStatusFilter}
                  onValueChange={(val) => setHistoryStatusFilter(val as HistoryStatusFilter)}
                >
                  <SelectTrigger className="w-full sm:w-44">
                    <SelectValue placeholder={appLang === 'en' ? "All statuses" : "كل الحالات"} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{appLang === 'en' ? "All statuses" : "كل الحالات"}</SelectItem>
                    <SelectItem value="approved">{appLang === 'en' ? "Approved" : "تم الاعتماد"}</SelectItem>
                    <SelectItem value="rejected">{appLang === 'en' ? "Rejected" : "مرفوض"}</SelectItem>
                  </SelectContent>
                </Select>
                <Select
                  value={historyTypeFilter}
                  onValueChange={(val) => setHistoryTypeFilter(val as TypeFilter)}
                >
                  <SelectTrigger className="w-full sm:w-48">
                    <SelectValue placeholder={appLang === 'en' ? "All types" : "كل الأنواع"} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{appLang === 'en' ? `All types (${historyRows.length})` : `كل الأنواع (${historyRows.length})`}</SelectItem>
                    <SelectItem value="sales">{appLang === 'en' ? `Sales (${historySalesCount})` : `مبيعات (${historySalesCount})`}</SelectItem>
                    <SelectItem value="manufacturing">{appLang === 'en' ? `Mfg. (${historyMfgCount})` : `تصنيع (${historyMfgCount})`}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </FilterContainer>

            {historyLoading ? (
              <div className="flex items-center justify-center py-10 text-gray-500 dark:text-gray-400">
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                {appLang === 'en' ? "Loading dispatch history..." : "جاري تحميل سجل الإرسال..."}
              </div>
            ) : filteredHistoryRows.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-gray-500 dark:text-gray-400">
                <Package className="w-10 h-10 mb-3 text-gray-300 dark:text-gray-600" />
                <p className="text-sm">
                  {hasActiveHistoryFilters
                    ? (appLang === 'en' ? "No records match your filters." : "لا توجد سجلات تطابق الفلاتر المحددة.")
                    : (appLang === 'en' ? "No dispatch history records found." : "لا توجد سجلات إرسال.")}
                </p>
                {hasActiveHistoryFilters && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3"
                    onClick={() => { setHistorySearchQuery(""); setHistoryStatusFilter("all"); setHistoryTypeFilter("all") }}
                  >
                    {appLang === 'en' ? "Clear Filters" : "مسح الفلاتر"}
                  </Button>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-[980px] w-full text-sm">
                  <thead className="bg-gray-50 dark:bg-slate-800">
                    <tr>
                      <th className="px-3 py-2 text-right">{appLang === 'en' ? "Type" : "النوع"}</th>
                      <th className="px-3 py-2 text-right">{appLang === 'en' ? "Reference #" : "الرقم المرجعي"}</th>
                      <th className="px-3 py-2 text-right">{appLang === 'en' ? "Customer" : "العميل"}</th>
                      <th className="px-3 py-2 text-right">{appLang === 'en' ? "Product" : "المنتج"}</th>
                      <th className="px-3 py-2 text-right">{appLang === 'en' ? "Qty" : "الكمية"}</th>
                      <th className="px-3 py-2 text-right">{appLang === 'en' ? "Branch" : "الفرع"}</th>
                      <th className="px-3 py-2 text-right">{appLang === 'en' ? "Warehouse" : "المخزن"}</th>
                      <th className="px-3 py-2 text-right">{appLang === 'en' ? "Decision Date" : "تاريخ القرار"}</th>
                      <th className="px-3 py-2 text-right">{appLang === 'en' ? "Amount" : "المبلغ"}</th>
                      <th className="px-3 py-2 text-right">{appLang === 'en' ? "Handled By" : "منفذ القرار"}</th>
                      <th className="px-3 py-2 text-center">{appLang === 'en' ? "Status" : "الحالة"}</th>
                      <th className="px-3 py-2 text-right">{appLang === 'en' ? "Reason" : "سبب الرفض"}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
                    {filteredHistoryRows.map((row) => (
                      <tr key={`${row._type}-${row.id}`} className="hover:bg-gray-50 dark:hover:bg-slate-800/60">
                        <td className="px-3 py-2">
                          {row._type === "sales" ? (
                            <Badge variant="outline" className="gap-1 text-blue-700 border-blue-300 bg-blue-50 dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-700 whitespace-nowrap">
                              <FileText className="w-3 h-3" />{appLang === 'en' ? "Sales" : "مبيعات"}
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="gap-1 text-orange-700 border-orange-300 bg-orange-50 dark:bg-orange-900/20 dark:text-orange-300 dark:border-orange-700 whitespace-nowrap">
                              <Factory className="w-3 h-3" />{appLang === 'en' ? "Mfg." : "تصنيع"}
                            </Badge>
                          )}
                        </td>
                        <td className="px-3 py-2 font-medium text-blue-600 dark:text-blue-400">
                          {row.reference}
                        </td>
                        <td className="px-3 py-2">{row.party}</td>
                        <td className="px-3 py-2">
                          {row.items && row.items.length > 0 ? (
                            <div className="space-y-0.5">
                              {row.items.map((item, idx) => (
                                <div key={idx} className="flex items-center gap-1 text-xs">
                                  <span className="font-medium">{item.product_name}</span>
                                  {item.product_type && (
                                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${
                                      item.product_type === "raw_material"
                                        ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
                                        : item.product_type === "manufactured"
                                          ? "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300"
                                          : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                                    }`}>
                                      {item.product_type === "raw_material" ? (appLang === 'en' ? "Raw" : "خام")
                                        : item.product_type === "manufactured" ? (appLang === 'en' ? "Mfg" : "مصنّع")
                                        : item.product_type}
                                    </span>
                                  )}
                                </div>
                              ))}
                            </div>
                          ) : "-"}
                        </td>
                        <td className="px-3 py-2">
                          {row.items && row.items.length > 0 ? (
                            <div className="space-y-0.5">
                              {row.items.map((item, idx) => (
                                <div key={idx} className="text-xs">{item.quantity}</div>
                              ))}
                            </div>
                          ) : "-"}
                        </td>
                        <td className="px-3 py-2">{row.branch}</td>
                        <td className="px-3 py-2">{row.warehouse}</td>
                        <td className="px-3 py-2">
                          {new Date(row.date).toLocaleDateString(appLang === 'en' ? 'en-US' : 'ar-EG')}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {row.amount != null ? Number(row.amount).toFixed(2) : "-"}
                        </td>
                        <td className={`px-3 py-2 font-medium ${
                          row.status === "rejected"
                            ? "text-red-700 dark:text-red-400"
                            : "text-emerald-700 dark:text-emerald-400"
                        }`}>
                          {row.decidedBy || "-"}
                        </td>
                        <td className="px-3 py-2 text-center">
                          <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs ${
                            row.status === "rejected"
                              ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300"
                              : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
                          }`}>
                            {row.status === "rejected"
                              ? (appLang === 'en' ? "Rejected" : "مرفوض")
                              : (appLang === 'en' ? "Approved" : "تم الاعتماد")}
                          </span>
                        </td>
                        <td className="px-3 py-2 max-w-[220px] truncate text-gray-600 dark:text-gray-300">
                          {row.status === "rejected" ? (row.reason || "-") : "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
        )}

        {/* ── Shortage Detail Modal ── */}
        <Dialog open={isShortageModalOpen} onOpenChange={setIsShortageModalOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
                <AlertTriangle className="w-5 h-5" />
                {appLang === 'en' ? "Insufficient Inventory — Cannot Approve" : "مخزون غير كافٍ — لا يمكن الاعتماد"}
              </DialogTitle>
              <DialogDescription>
                {appLang === 'en'
                  ? "The following raw materials are not available in sufficient quantities. Management and the branch accountant have been notified."
                  : "المواد الخام التالية غير متوفرة بالكميات الكافية. تم إشعار الإدارة ومحاسب الفرع تلقائياً."}
              </DialogDescription>
            </DialogHeader>

            <div className="py-2 space-y-2 max-h-72 overflow-y-auto">
              {shortageItems.map((item) => (
                <div key={item.product_id} className="flex items-center justify-between p-3 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800">
                  <div className="font-medium text-sm text-gray-800 dark:text-gray-200">
                    {item.product_name || item.product_id}
                  </div>
                  <div className="text-xs text-right rtl:text-left space-y-0.5">
                    <div className="text-red-600 dark:text-red-400 font-semibold">
                      {appLang === 'en' ? "Required: " : "المطلوب: "}{item.required_qty} {item.uom}
                    </div>
                    <div className="text-gray-500">
                      {appLang === 'en' ? "Available: " : "المتاح: "}{item.available_qty} {item.uom}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-start p-3 text-sm text-blue-800 border border-blue-200 rounded-lg bg-blue-50 dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-800">
              <Info className="flex-shrink-0 w-4 h-4 mr-2 rtl:mr-0 rtl:ml-2 mt-0.5" />
              <div>
                {appLang === 'en'
                  ? "An urgent notification has been sent to management (Owner, Admin) and the branch accountant to resolve this shortage."
                  : "تم إرسال إشعار عاجل للإدارة (المالك، الأدمن) ومحاسب الفرع لمعالجة هذا النقص."}
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setIsShortageModalOpen(false)}>
                {appLang === 'en' ? "Close" : "إغلاق"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ── Approve/Reject Modal ── */}
        <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {selectedRow?._type === "manufacturing"
                  ? (modalMode === "approve"
                    ? (appLang === 'en' ? "Approve Material Issue" : "اعتماد صرف مواد التصنيع")
                    : (appLang === 'en' ? "Reject Material Issue" : "رفض صرف مواد التصنيع"))
                  : (modalMode === "approve"
                    ? (appLang === 'en' ? "Approve Dispatch" : "اعتماد إخراج البضاعة")
                    : (appLang === 'en' ? "Reject Dispatch" : "رفض إخراج البضاعة"))
                }
              </DialogTitle>
              <DialogDescription>
                {appLang === 'en' ? "Reference: " : "الرقم المرجعي: "}
                <span className="font-bold">{selectedRow?.reference}</span>
                {selectedRow?._type === "manufacturing" && (
                  <Badge variant="outline" className="mr-2 rtl:mr-0 rtl:ml-2 gap-1 text-orange-700 border-orange-300 bg-orange-50">
                    <Factory className="w-3 h-3" />{appLang === 'en' ? "Manufacturing" : "تصنيع"}
                  </Badge>
                )}
              </DialogDescription>
            </DialogHeader>

            <div className="py-4 space-y-4">
              {modalMode === "approve" ? (
                <div className="flex items-start p-3 text-sm text-green-800 border border-green-300 rounded-lg bg-green-50 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800">
                  <Info className="flex-shrink-0 w-4 h-4 mr-3 rtl:mr-0 rtl:ml-3 mt-0.5" />
                  <div>
                    {selectedRow?._type === "manufacturing"
                      ? (appLang === 'en'
                        ? "Approving will automatically start the production order and issue materials from the warehouse."
                        : "عند الاعتماد، سيبدأ أمر الإنتاج تلقائياً وتُصرف المواد من المستودع.")
                      : (appLang === 'en'
                        ? "Approving will deduct quantities from stock and transfer them to the shipping provider."
                        : "عند الاعتماد، سيتم خصم الكميات من المخزن ونقلها إلى ذمة شركة الشحن بشكل تلقائي.")}
                  </div>
                </div>
              ) : (
                <div className="flex items-start p-3 text-sm text-red-800 border border-red-300 rounded-lg bg-red-50 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800">
                  <Info className="flex-shrink-0 w-4 h-4 mr-3 rtl:mr-0 rtl:ml-3 mt-0.5" />
                  <div>
                    {selectedRow?._type === "manufacturing"
                      ? (appLang === 'en'
                        ? "Rejecting will notify the requester with the reason. The order can be re-submitted after review."
                        : "عند الرفض، سيتم إشعار مقدم الطلب بالسبب، ويمكن إعادة تقديم الطلب بعد المراجعة.")
                      : (appLang === 'en'
                        ? "Rejecting will halt delivery. Stock balances will not be affected until reviewed."
                        : "عند الرفض، سيتم إيقاف تسليم البضاعة ولن يؤثر ذلك على أرصدة المخازن حتى تتم المراجعة.")}
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <label className="text-sm font-medium">
                  {appLang === 'en' ? "Notes" : "ملاحظات"}{modalMode === "reject" && <span className="text-red-500"> *</span>}
                </label>
                <Input
                  placeholder={modalMode === "approve"
                    ? (appLang === 'en' ? "Additional notes (optional)..." : "ملاحظات إضافية (اختياري)...")
                    : (appLang === 'en' ? "Rejection reason (required)..." : "سبب الرفض (مطلوب)...")}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="outline" onClick={() => setIsModalOpen(false)}>
                {appLang === 'en' ? "Cancel" : "إلغاء"}
              </Button>
              <Button
                variant={modalMode === "approve" ? "default" : "destructive"}
                onClick={handleConfirmAction}
                disabled={actionLoading !== null || (modalMode === "reject" && !notes.trim())}
                className={modalMode === "approve" ? "bg-green-600 hover:bg-green-700" : ""}
              >
                {actionLoading !== null
                  ? (appLang === 'en' ? "Processing..." : "جاري المعالجة...")
                  : (appLang === 'en' ? "Confirm" : "تأكيد")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  )
}
