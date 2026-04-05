"use client"

import { useState, useEffect } from "react"
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
import { ERPPageHeader } from "@/components/erp-page-header"
import { CompanyHeader } from "@/components/company-header"
import { Package, Check, X, Box, Info, Search } from "lucide-react"
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

export default function DispatchApprovalsPage() {
  const supabase = useSupabase()
  const { toast } = useToast()

  const [invoices, setInvoices] = useState<DispatchInvoice[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  
  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [modalMode, setModalMode] = useState<"approve" | "reject">("approve")
  const [selectedInvoice, setSelectedInvoice] = useState<DispatchInvoice | null>(null)
  const [notes, setNotes] = useState("")
  const [searchQuery, setSearchQuery] = useState("")
  
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

  useEffect(() => {
    loadPendingInvoices()
  }, [])

  const loadPendingInvoices = async () => {
    try {
      setIsLoading(true)
      const companyId = await getActiveCompanyId(supabase)
      if (!companyId) return

      // Fetch invoices where status ('sent' or 'paid') and warehouse_status = 'pending'
      const { data, error } = await supabase
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

      if (error) throw error

      // Get items count
      const invoiceIds = data?.map((i: any) => i.id) || []
      let itemsCounts: Record<string, number> = {}
      
      if (invoiceIds.length > 0) {
        const { data: items } = await supabase
          .from('invoice_items')
          .select('invoice_id, quantity')
          .in('invoice_id', invoiceIds)
          
        items?.forEach((item: any) => {
          itemsCounts[item.invoice_id] = (itemsCounts[item.invoice_id] || 0) + 1
        })
      }

      // We need to fetch warehouse names separately if we want since it relates through sales_orders
      // But for simplicity let's map the basic data first.
      
      const formatted = (data || []).map((inv: any) => ({
        id: inv.id,
        invoice_number: inv.invoice_number,
        invoice_date: inv.invoice_date,
        customer: inv.customers,
        shipping_provider: inv.shipping_providers,
        total_amount: inv.total_amount,
        warehouse_status: inv.warehouse_status,
        items_count: itemsCounts[inv.id] || 0,
      }))

      setInvoices(formatted)
    } catch (error: any) {
      console.error("Error loading pending dispatches:", error)
      toast({
        title: "خطأ",
        description: "تعذر تحميل فواتير الاعتماد.",
        variant: "destructive"
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleActionClick = (invoice: DispatchInvoice, mode: "approve" | "reject") => {
    setSelectedInvoice(invoice)
    setModalMode(mode)
    setNotes("")
    setIsModalOpen(true)
  }

  const handleConfirmAction = async () => {
    if (!selectedInvoice) return

    try {
      setActionLoading(selectedInvoice.id)
      
      const endpoint = modalMode === "approve" 
        ? `/api/invoices/${selectedInvoice.id}/warehouse-approve`
        : `/api/invoices/${selectedInvoice.id}/warehouse-reject`

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes })
      })

      const result = await response.json()

      if (!result.success) {
        throw new Error(result.error || "حدث خطأ غير معروف")
      }

      toast({
        title: "تم بنجاح",
        description: result.message,
      })

      setIsModalOpen(false)
      loadPendingInvoices() // Refresh the list
    } catch (error: any) {
      console.error(`Error confirming ${modalMode}:`, error)
      toast({
        title: "خطأ",
        description: error.message,
        variant: "destructive"
      })
    } finally {
      setActionLoading(null)
    }
  }

  const columns: DataTableColumn<DispatchInvoice>[] = [
    {
      header: appLang === 'en' ? "Invoice #" : "رقم الفاتورة",
      key: "invoice_number",
      format: (_: any, inv: DispatchInvoice) => (
        <div className="font-medium text-blue-600 dark:text-blue-400">
          {inv.invoice_number}
        </div>
      )
    },
    {
      header: appLang === 'en' ? "Date" : "التاريخ",
      key: "invoice_date",
      format: (_: any, inv: DispatchInvoice) => (
        <div>{new Date(inv.invoice_date).toLocaleDateString(appLang === 'en' ? 'en-US' : 'ar-EG')}</div>
      )
    },
    {
      header: appLang === 'en' ? "Customer" : "العميل",
      key: "customer.name",
      format: (_: any, inv: DispatchInvoice) => (
        <div>{inv.customer?.name || "-"}</div>
      )
    },
    {
      header: appLang === 'en' ? "Shipping Provider" : "شركة الشحن",
      key: "shipping_provider.provider_name",
      format: (_: any, inv: DispatchInvoice) => (
        <div>{inv.shipping_provider?.provider_name || "-"}</div>
      )
    },
    {
      header: appLang === 'en' ? "Items" : "عدد الأصناف",
      key: "items_count",
      format: (_: any, inv: DispatchInvoice) => (
        <div className="flex items-center text-gray-500">
          <Box className={`w-4 h-4 ${appLang === 'en' ? 'mr-2' : 'ml-2'}`} />
          {inv.items_count} {appLang === 'en' ? "items" : "أصناف"}
        </div>
      )
    },
    {
      header: appLang === 'en' ? "Action" : "إجراء",
      key: "action",
      format: (_: any, inv: DispatchInvoice) => (
        <div className="flex gap-2">
          <Button 
            size="sm" 
            variant="outline" 
            className="text-green-600 hover:text-green-700 hover:bg-green-50"
            onClick={() => handleActionClick(inv, "approve")}
            disabled={actionLoading === inv.id}
          >
            <Check className={`w-4 h-4 ${appLang === 'en' ? 'mr-1' : 'ml-1'}`} /> {appLang === 'en' ? "Approve" : "اعتماد"}
          </Button>
          <Button 
            size="sm" 
            variant="outline" 
            className="text-red-600 hover:text-red-700 hover:bg-red-50"
            onClick={() => handleActionClick(inv, "reject")}
            disabled={actionLoading === inv.id}
          >
            <X className={`w-4 h-4 ${appLang === 'en' ? 'mr-1' : 'ml-1'}`} /> {appLang === 'en' ? "Reject" : "رفض"}
          </Button>
        </div>
      )
    }
  ]

  const filteredInvoices = invoices.filter(inv => 
    !searchQuery || inv.invoice_number.toLowerCase().includes(searchQuery.toLowerCase())
  )

  if (!hydrated) return null

  return (
    <div className={`flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900 ${appLang === 'ar' ? 'rtl' : 'ltr'}`} dir={appLang === 'ar' ? 'rtl' : 'ltr'}>
      <main className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8 space-y-4 sm:space-y-6 overflow-x-hidden">
        <CompanyHeader />

        <div className="bg-white dark:bg-slate-900 rounded-xl sm:rounded-2xl shadow-sm border border-gray-200 dark:border-slate-800 p-4 sm:p-6 mb-6">
          <ERPPageHeader 
            title={appLang === 'en' ? 'Dispatch Approvals' : 'اعتمادات إخراج المخزون'}
            description={appLang === 'en' ? 'Review & manage unfulfilled posted sales orders' : 'إدارة ومراجعة طلبات إخراج البضاعة للفواتير المُرحلة'}
            lang={appLang}
          />
        </div>

        <Card className="dark:bg-slate-900 dark:border-slate-800">
          <CardHeader>
            <CardTitle>{appLang === 'en' ? 'Pending Dispatches' : 'طلبات قيد الانتظار'}</CardTitle>
            <CardDescription>
              {appLang === 'en' 
                ? 'Posted invoices waiting for warehouse dispatch' 
                : 'الفواتير التي تم ترحيلها محاسبياً وتنتظر اعتماد المخزن للتسليم'}
            </CardDescription>
          </CardHeader>
          <CardContent>
          <FilterContainer
            title={appLang === 'en' ? "Search & Filters" : "البحث والفلاتر"}
            activeCount={searchQuery ? 1 : 0}
            onClear={() => setSearchQuery("")}
          >
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={appLang === 'en' ? "Search by invoice #..." : "البحث برقم الفاتورة..."}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={appLang === 'ar' ? 'pr-10' : 'pl-10'}
              />
            </div>
          </FilterContainer>

          {isLoading ? (
            <LoadingState 
              message={appLang === 'en' ? "Loading pending dispatches..." : "جاري تحميل الطلبات..."}
            />
          ) : filteredInvoices.length === 0 ? (
            <EmptyState
              icon={Package}
              title={searchQuery ? (appLang === 'en' ? "No Invoices Found" : "لا توجد نتائج بحث") : (appLang === 'en' ? "No Pending Dispatches" : "لا توجد طلبات معلقة")}
              description={searchQuery 
                ? (appLang === 'en' ? "No invoices matched your search." : "لم يتم العثور على فواتير تطابق بحثك.")
                : (appLang === 'en' ? "All posted invoices have been dispatched!" : "جميع الفواتير المرحلة قد تم اعتماد تسليمها بنجاح!")
              }
              action={searchQuery ? {
                label: appLang === 'en' ? "Clear Search" : "مسح البحث",
                onClick: () => setSearchQuery("")
              } : undefined}
            />
          ) : (
            <DataTable 
              columns={columns}
              data={filteredInvoices}
              keyField="id"
            />
          )}
        </CardContent>
      </Card>

      {/* Approve/Reject Modal */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {modalMode === "approve" ? "اعتماد إخراج البضاعة" : "رفض إخراج البضاعة"}
            </DialogTitle>
            <DialogDescription>
              الفاتورة رقم: <span className="font-bold">{selectedInvoice?.invoice_number}</span>
            </DialogDescription>
          </DialogHeader>

          <div className="py-4 space-y-4">
            {modalMode === "approve" ? (
              <div className="flex items-center p-3 text-sm text-green-800 border border-green-300 rounded-lg bg-green-50 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800">
                <Info className="flex-shrink-0 inline w-4 h-4 mr-3 rtl:mr-0 rtl:ml-3" />
                <span className="sr-only">Info</span>
                <div>
                  عند الاعتماد، سيتم خصم الكميات من المخزن ونقلها إلى ذمة شركة الشحن بشكل تلقائي.
                </div>
              </div>
            ) : (
              <div className="flex items-center p-3 text-sm text-red-800 border border-red-300 rounded-lg bg-red-50 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800">
                <Info className="flex-shrink-0 inline w-4 h-4 mr-3 rtl:mr-0 rtl:ml-3" />
                <span className="sr-only">Info</span>
                <div>
                  عند الرفض، سيتم إيقاف تسليم البضاعة ولن يؤثر ذلك على أرصدة المخازن حتى تتم المراجعة.
                </div>
              </div>
            )}

            <div className="space-y-2">
              <label className="text-sm font-medium">
                ملاحظات {modalMode === "reject" && <span className="text-red-500">*</span>}
              </label>
              <Input 
                placeholder={modalMode === "approve" ? "ملاحظات إضافية (اختياري)..." : "سبب الرفض (مطلوب)..."}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setIsModalOpen(false)}>
              إلغاء
            </Button>
            <Button 
              variant={modalMode === "approve" ? "default" : "destructive"}
              onClick={handleConfirmAction}
              disabled={actionLoading !== null || (modalMode === "reject" && !notes.trim())}
              className={modalMode === "approve" ? "bg-green-600 hover:bg-green-700" : ""}
            >
              {actionLoading !== null ? "جاري المعالجة..." : "تأكيد"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </main>
    </div>
  )
}
