"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { useSupabase } from "@/lib/supabase/hooks"
import { getActiveCompanyId } from "@/lib/company"
import { useToast } from "@/hooks/use-toast"
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
import { Package, Check, X, Box, Info, Search, Factory, FileText, AlertTriangle } from "lucide-react"
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
type ApprovalType = "sales" | "manufacturing"
interface UnifiedRow {
  _type: ApprovalType
  id: string
  reference: string        // invoice_number OR order_no
  date: string
  party: string            // customer name OR product name
  warehouse: string
  extra: string            // shipping provider OR branch
  raw: DispatchInvoice | ManufacturingApproval
}

type TypeFilter = "all" | "sales" | "manufacturing"

export default function DispatchApprovalsPage() {
  const supabase = useSupabase()
  const router = useRouter()
  const { toast } = useToast()

  const [rows, setRows] = useState<UnifiedRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all")

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

  const loadAll = useCallback(async () => {
    try {
      setIsLoading(true)
      const companyId = await getActiveCompanyId(supabase)
      if (!companyId) return

      // ── 1. فواتير المبيعات ──────────────────────────────────────────────────
      const { data: invData, error: invError } = await supabase
        .from('invoices')
        .select(`
          id, invoice_number, invoice_date, total_amount, warehouse_status,
          customers (name),
          shipping_providers (provider_name)
        `)
        .eq('company_id', companyId)
        .eq('warehouse_status', 'pending')
        .in('status', ['sent', 'paid'])
        .order('invoice_date', { ascending: false })

      if (invError) throw invError

      const invoiceIds = (invData || []).map((i: any) => i.id)
      let itemsCounts: Record<string, number> = {}
      if (invoiceIds.length > 0) {
        const { data: items } = await supabase
          .from('invoice_items')
          .select('invoice_id')
          .in('invoice_id', invoiceIds)
        items?.forEach((item: any) => {
          itemsCounts[item.invoice_id] = (itemsCounts[item.invoice_id] || 0) + 1
        })
      }

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
        return {
          _type: "sales",
          id: inv.id,
          reference: inv.invoice_number,
          date: inv.invoice_date,
          party: inv.customers?.name || "-",
          warehouse: "-",
          extra: inv.shipping_providers?.provider_name || "-",
          raw,
        }
      })

      // ── 2. اعتمادات صرف مواد التصنيع ───────────────────────────────────────
      const mfgRes = await fetch(`/api/manufacturing/material-issue-approvals?status=pending,rejected,partially_approved&company_id=${companyId}`)
      let mfgRows: UnifiedRow[] = []
      if (mfgRes.ok) {
        const mfgJson = await mfgRes.json()
        mfgRows = ((mfgJson.data || []) as ManufacturingApproval[]).map((apv) => ({
          _type: "manufacturing" as ApprovalType,
          id: apv.id,
          reference: apv.production_order?.order_no || apv.id,
          date: apv.requested_at,
          party: apv.production_order?.product?.name || "-",
          warehouse: apv.warehouse?.name || "-",
          extra: apv.branch?.name || "-",
          raw: apv,
        }))
      }

      setRows([...salesRows, ...mfgRows])
    } catch (error: any) {
      console.error("Error loading approvals:", error)
      toast({ title: appLang === 'en' ? "Error" : "خطأ", description: appLang === 'en' ? "Could not load approvals." : "تعذر تحميل طلبات الاعتماد.", variant: "destructive" })
    } finally {
      setIsLoading(false)
    }
  }, [supabase, appLang]) // eslint-disable-line

  useEffect(() => { loadAll() }, [loadAll])

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

  const columns: DataTableColumn<UnifiedRow>[] = [
    {
      header: appLang === 'en' ? "Type" : "النوع",
      key: "_type",
      format: (_: any, row: UnifiedRow) => (
        row._type === "sales" ? (
          <Badge variant="outline" className="gap-1 text-blue-700 border-blue-300 bg-blue-50 whitespace-nowrap">
            <FileText className="w-3 h-3" />{appLang === 'en' ? "Sales Invoice" : "فاتورة مبيعات"}
          </Badge>
        ) : (
          <Badge variant="outline" className="gap-1 text-orange-700 border-orange-300 bg-orange-50 whitespace-nowrap">
            <Factory className="w-3 h-3" />{appLang === 'en' ? "Mfg. Issue" : "صرف تصنيع"}
          </Badge>
        )
      )
    },
    {
      header: appLang === 'en' ? "Reference #" : "الرقم المرجعي",
      key: "reference",
      format: (_: any, row: UnifiedRow) => (
        <div className="font-medium text-blue-600 dark:text-blue-400">{row.reference}</div>
      )
    },
    {
      header: appLang === 'en' ? "Date" : "التاريخ",
      key: "date",
      format: (_: any, row: UnifiedRow) => (
        <div>{new Date(row.date).toLocaleDateString(appLang === 'en' ? 'en-US' : 'ar-EG')}</div>
      )
    },
    {
      header: appLang === 'en' ? "Customer / Product" : "العميل / المنتج",
      key: "party",
      format: (_: any, row: UnifiedRow) => <div>{row.party}</div>
    },
    {
      header: appLang === 'en' ? "Warehouse" : "المستودع",
      key: "warehouse",
      format: (_: any, row: UnifiedRow) => (
        <div className="flex items-center text-gray-500">
          <Box className={`w-4 h-4 ${appLang === 'en' ? 'mr-2' : 'ml-2'}`} />
          {row.warehouse}
        </div>
      )
    },
    {
      header: appLang === 'en' ? "Shipping / Branch" : "شركة الشحن / الفرع",
      key: "extra",
      format: (_: any, row: UnifiedRow) => <div>{row.extra}</div>
    },
    {
      header: appLang === 'en' ? "Action" : "إجراء",
      key: "action",
      format: (_: any, row: UnifiedRow) => (
        <div className="flex gap-2">
          {row._type === "manufacturing" ? (
            /* طلبات التصنيع: توجيه لصفحة التفاصيل */
            <Button
              size="sm"
              variant="outline"
              className="text-orange-600 hover:text-orange-700 hover:bg-orange-50"
              onClick={() => router.push(`/inventory/dispatch-approvals/${row.id}`)}
            >
              <Check className={`w-4 h-4 ${appLang === 'en' ? 'mr-1' : 'ml-1'}`} /> {appLang === 'en' ? "Review & Approve" : "مراجعة واعتماد"}
            </Button>
          ) : (
            /* فواتير المبيعات: السلوك القديم */
            <Button
              size="sm"
              variant="outline"
              className="text-green-600 hover:text-green-700 hover:bg-green-50"
              onClick={() => handleActionClick(row, "approve")}
              disabled={actionLoading === row.id}
            >
              <Check className={`w-4 h-4 ${appLang === 'en' ? 'mr-1' : 'ml-1'}`} /> {appLang === 'en' ? "Approve" : "اعتماد"}
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            className="text-red-600 hover:text-red-700 hover:bg-red-50"
            onClick={() => handleActionClick(row, "reject")}
            disabled={actionLoading === row.id}
          >
            <X className={`w-4 h-4 ${appLang === 'en' ? 'mr-1' : 'ml-1'}`} /> {appLang === 'en' ? "Reject" : "رفض"}
          </Button>
        </div>
      )
    }
  ]

  const filteredRows = rows.filter(row => {
    if (typeFilter !== "all" && row._type !== typeFilter) return false
    if (searchQuery && !row.reference.toLowerCase().includes(searchQuery.toLowerCase()) && !row.party.toLowerCase().includes(searchQuery.toLowerCase())) return false
    return true
  })

  const salesCount = rows.filter(r => r._type === "sales").length
  const mfgCount = rows.filter(r => r._type === "manufacturing").length

  if (!hydrated) return null

  return (
    <div className={`flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900 ${appLang === 'ar' ? 'rtl' : 'ltr'}`} dir={appLang === 'ar' ? 'rtl' : 'ltr'}>
      <main className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8 space-y-4 sm:space-y-6 overflow-x-hidden">
        <CompanyHeader />

        <div className="bg-white dark:bg-slate-900 rounded-xl sm:rounded-2xl shadow-sm border border-gray-200 dark:border-slate-800 p-4 sm:p-6 mb-6">
          <ERPPageHeader
            title={appLang === 'en' ? 'Dispatch Approvals' : 'اعتمادات إخراج المخزون'}
            description={appLang === 'en'
              ? 'Review & manage pending dispatch requests — sales invoices and manufacturing material issues'
              : 'إدارة ومراجعة طلبات الاعتماد المعلقة — فواتير المبيعات وصرف مواد التصنيع'}
            lang={appLang}
          />
        </div>

        <Card className="dark:bg-slate-900 dark:border-slate-800">
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle>{appLang === 'en' ? 'Pending Approvals' : 'طلبات قيد الانتظار'}</CardTitle>
                <CardDescription className="mt-1">
                  {appLang === 'en'
                    ? 'All pending warehouse approvals — sales and manufacturing'
                    : 'جميع طلبات الاعتماد المعلقة — المبيعات والتصنيع'}
                </CardDescription>
              </div>
              {/* ── فلتر النوع ── */}
              <div className="flex items-center gap-2 flex-wrap">
                {(["all", "sales", "manufacturing"] as TypeFilter[]).map((t) => {
                  const label = {
                    all: appLang === 'en' ? `All (${rows.length})` : `الكل (${rows.length})`,
                    sales: appLang === 'en' ? `Sales (${salesCount})` : `مبيعات (${salesCount})`,
                    manufacturing: appLang === 'en' ? `Mfg. Issue (${mfgCount})` : `صرف تصنيع (${mfgCount})`,
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
