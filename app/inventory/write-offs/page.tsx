"use client"
import { useState, useEffect, useCallback } from "react"
import { useSupabase } from "@/lib/supabase/hooks"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useToast } from "@/hooks/use-toast"
import { Loader2, Plus, Trash2, FileDown, Check, X, AlertTriangle, Package, Eye, RotateCcw } from "lucide-react"
import { getActiveCompanyId } from "@/lib/company"
import { canAction, canAdvancedAction } from "@/lib/authz"
import { Sidebar } from "@/components/sidebar"
import { CompanyHeader } from "@/components/company-header"

// تنسيق العملة
function formatCurrency(amount: number, currency: string = "EGP"): string {
  return new Intl.NumberFormat("ar-EG", { style: "currency", currency }).format(amount)
}

// أسباب الإهلاك
const WRITE_OFF_REASONS = [
  { value: "damaged", label_ar: "تالف", label_en: "Damaged" },
  { value: "expired", label_ar: "منتهي الصلاحية", label_en: "Expired" },
  { value: "lost", label_ar: "مفقود", label_en: "Lost" },
  { value: "obsolete", label_ar: "متقادم", label_en: "Obsolete" },
  { value: "theft", label_ar: "سرقة", label_en: "Theft" },
  { value: "other", label_ar: "أخرى", label_en: "Other" },
]

// حالات الإهلاك
const STATUS_LABELS: Record<string, { label_ar: string; label_en: string; color: string }> = {
  pending: { label_ar: "قيد الانتظار", label_en: "Pending", color: "bg-yellow-100 text-yellow-800" },
  approved: { label_ar: "معتمد", label_en: "Approved", color: "bg-green-100 text-green-800" },
  rejected: { label_ar: "مرفوض", label_en: "Rejected", color: "bg-red-100 text-red-800" },
  cancelled: { label_ar: "ملغي", label_en: "Cancelled", color: "bg-gray-100 text-gray-800" },
}

interface WriteOffItem {
  id?: string
  product_id: string
  product_name?: string
  quantity: number
  unit_cost: number
  total_cost: number
  batch_number?: string
  expiry_date?: string
  item_reason?: string
  notes?: string
  available_qty?: number
}

interface WriteOff {
  id: string
  write_off_number: string
  write_off_date: string
  status: string
  reason: string
  reason_details?: string
  total_cost: number
  created_by: string
  created_at: string
  approved_by?: string
  approved_at?: string
  items?: WriteOffItem[]
}

export default function WriteOffsPage() {
  const supabase = useSupabase()
  const { toast } = useToast()
  const isAr = true // اللغة العربية افتراضياً

  // States
  const [loading, setLoading] = useState(true)
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [writeOffs, setWriteOffs] = useState<WriteOff[]>([])
  const [products, setProducts] = useState<any[]>([])
  const [accounts, setAccounts] = useState<any[]>([])
  
  // Permissions
  const [canCreate, setCanCreate] = useState(false)
  const [canApprove, setCanApprove] = useState(false)
  const [canCancel, setCanCancel] = useState(false)
  const [canExport, setCanExport] = useState(false)

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")

  // Dialogs
  const [showNewDialog, setShowNewDialog] = useState(false)
  const [showViewDialog, setShowViewDialog] = useState(false)
  const [showApproveDialog, setShowApproveDialog] = useState(false)
  const [showRejectDialog, setShowRejectDialog] = useState(false)
  const [showCancelDialog, setShowCancelDialog] = useState(false)
  const [selectedWriteOff, setSelectedWriteOff] = useState<WriteOff | null>(null)

  // New Write-off form
  const [newReason, setNewReason] = useState("damaged")
  const [newReasonDetails, setNewReasonDetails] = useState("")
  const [newNotes, setNewNotes] = useState("")
  const [newItems, setNewItems] = useState<WriteOffItem[]>([])
  const [saving, setSaving] = useState(false)

  // Approval form
  const [expenseAccountId, setExpenseAccountId] = useState("")
  const [inventoryAccountId, setInventoryAccountId] = useState("")
  const [rejectionReason, setRejectionReason] = useState("")
  const [cancellationReason, setCancellationReason] = useState("")

  // Load data
  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const cid = await getActiveCompanyId(supabase)
      if (!cid) return
      setCompanyId(cid)

      // Check permissions
      const [create, approve, cancel, exportPerm] = await Promise.all([
        canAction(supabase, "write_offs", "write"),
        canAdvancedAction(supabase, "write_offs", "approve"),
        canAdvancedAction(supabase, "write_offs", "cancel"),
        canAdvancedAction(supabase, "write_offs", "export"),
      ])
      setCanCreate(create)
      setCanApprove(approve)
      setCanCancel(cancel)
      setCanExport(exportPerm)

      // Load write-offs
      let query = supabase
        .from("inventory_write_offs")
        .select("*")
        .eq("company_id", cid)
        .order("created_at", { ascending: false })
      
      if (statusFilter !== "all") query = query.eq("status", statusFilter)
      if (dateFrom) query = query.gte("write_off_date", dateFrom)
      if (dateTo) query = query.lte("write_off_date", dateTo)

      const { data: wos } = await query
      setWriteOffs(wos || [])

      // Load products
      const { data: prods } = await supabase
        .from("products")
        .select("id, name, sku, cost_price, quantity_on_hand, item_type")
        .eq("company_id", cid)
        .eq("is_active", true)
        .neq("item_type", "service")
      setProducts(prods || [])

      // Load accounts
      const { data: accs } = await supabase
        .from("chart_of_accounts")
        .select("id, account_code, account_name, account_type")
        .eq("company_id", cid)
        .eq("is_active", true)
      setAccounts(accs || [])
    } finally {
      setLoading(false)
    }
  }, [supabase, statusFilter, dateFrom, dateTo])

  useEffect(() => { loadData() }, [loadData])

  // إضافة منتج جديد للإهلاك
  const addItem = () => {
    setNewItems([...newItems, {
      product_id: "",
      quantity: 1,
      unit_cost: 0,
      total_cost: 0,
      batch_number: "",
      expiry_date: "",
    }])
  }

  // تحديث عنصر
  const updateItem = (index: number, field: string, value: any) => {
    const updated = [...newItems]
    ;(updated[index] as any)[field] = value

    if (field === "product_id") {
      const prod = products.find(p => p.id === value)
      if (prod) {
        updated[index].unit_cost = prod.cost_price || 0
        updated[index].product_name = prod.name
        updated[index].available_qty = prod.quantity_on_hand
        updated[index].total_cost = updated[index].quantity * updated[index].unit_cost
      }
    }

    if (field === "quantity" || field === "unit_cost") {
      updated[index].total_cost = updated[index].quantity * updated[index].unit_cost
    }

    setNewItems(updated)
  }

  // حذف عنصر
  const removeItem = (index: number) => {
    setNewItems(newItems.filter((_, i) => i !== index))
  }

  // حساب الإجمالي
  const totalCost = newItems.reduce((sum, item) => sum + item.total_cost, 0)

  // حفظ إهلاك جديد
  const handleSaveWriteOff = async () => {
    if (!companyId || newItems.length === 0) {
      toast({ title: isAr ? "خطأ" : "Error", description: isAr ? "أضف منتجات للإهلاك" : "Add products to write off", variant: "destructive" })
      return
    }

    // التحقق من الكميات
    for (const item of newItems) {
      if (!item.product_id) {
        toast({ title: isAr ? "خطأ" : "Error", description: isAr ? "اختر منتج لكل عنصر" : "Select product for each item", variant: "destructive" })
        return
      }
      if (item.quantity <= 0) {
        toast({ title: isAr ? "خطأ" : "Error", description: isAr ? "الكمية يجب أن تكون أكبر من صفر" : "Quantity must be greater than zero", variant: "destructive" })
        return
      }
      if (item.available_qty !== undefined && item.quantity > item.available_qty) {
        toast({
          title: isAr ? "خطأ" : "Error",
          description: isAr ? `الكمية المطلوبة (${item.quantity}) أكبر من المتاحة (${item.available_qty}) للمنتج ${item.product_name}` :
                            `Requested quantity (${item.quantity}) exceeds available (${item.available_qty}) for ${item.product_name}`,
          variant: "destructive"
        })
        return
      }
    }

    setSaving(true)
    try {
      const { data: user } = await supabase.auth.getUser()

      // توليد رقم الإهلاك
      const { data: numData } = await supabase.rpc("generate_write_off_number", { p_company_id: companyId })
      const writeOffNumber = numData || `WO-${Date.now()}`

      // إنشاء الإهلاك
      const { data: wo, error: woErr } = await supabase
        .from("inventory_write_offs")
        .insert({
          company_id: companyId,
          write_off_number: writeOffNumber,
          write_off_date: new Date().toISOString().split("T")[0],
          status: "pending",
          reason: newReason,
          reason_details: newReasonDetails || null,
          total_cost: totalCost,
          notes: newNotes || null,
          created_by: user?.user?.id,
        })
        .select()
        .single()

      if (woErr) throw woErr

      // إضافة العناصر
      const itemsToInsert = newItems.map(item => ({
        write_off_id: wo.id,
        product_id: item.product_id,
        quantity: item.quantity,
        unit_cost: item.unit_cost,
        total_cost: item.total_cost,
        batch_number: item.batch_number || null,
        expiry_date: item.expiry_date || null,
        item_reason: item.item_reason || null,
        notes: item.notes || null,
      }))

      const { error: itemsErr } = await supabase
        .from("inventory_write_off_items")
        .insert(itemsToInsert)

      if (itemsErr) throw itemsErr

      toast({ title: isAr ? "تم" : "Success", description: isAr ? "تم إنشاء الإهلاك بنجاح" : "Write-off created successfully" })
      setShowNewDialog(false)
      resetForm()
      loadData()
    } catch (err: any) {
      toast({ title: isAr ? "خطأ" : "Error", description: err.message, variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  // إعادة تعيين النموذج
  const resetForm = () => {
    setNewReason("damaged")
    setNewReasonDetails("")
    setNewNotes("")
    setNewItems([])
  }

  // عرض تفاصيل الإهلاك
  const handleView = async (wo: WriteOff) => {
    const { data: items } = await supabase
      .from("inventory_write_off_items")
      .select("*, products(name, sku)")
      .eq("write_off_id", wo.id)

    setSelectedWriteOff({
      ...wo,
      items: (items || []).map((it: any) => ({
        ...it,
        product_name: it.products?.name,
      })),
    })
    setShowViewDialog(true)
  }

  // اعتماد الإهلاك
  const handleApprove = async () => {
    if (!selectedWriteOff || !expenseAccountId || !inventoryAccountId) {
      toast({ title: isAr ? "خطأ" : "Error", description: isAr ? "اختر الحسابات المحاسبية" : "Select accounting accounts", variant: "destructive" })
      return
    }

    setSaving(true)
    try {
      const { data: user } = await supabase.auth.getUser()
      const { data: result, error } = await supabase.rpc("approve_write_off", {
        p_write_off_id: selectedWriteOff.id,
        p_approved_by: user?.user?.id,
        p_expense_account_id: expenseAccountId,
        p_inventory_account_id: inventoryAccountId,
      })

      if (error) throw error
      if (!result?.success) throw new Error(result?.error || "Unknown error")

      toast({ title: isAr ? "تم" : "Success", description: isAr ? "تم اعتماد الإهلاك" : "Write-off approved" })
      setShowApproveDialog(false)
      setShowViewDialog(false)
      loadData()
    } catch (err: any) {
      toast({ title: isAr ? "خطأ" : "Error", description: err.message, variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  // رفض الإهلاك
  const handleReject = async () => {
    if (!selectedWriteOff || !rejectionReason) {
      toast({ title: isAr ? "خطأ" : "Error", description: isAr ? "أدخل سبب الرفض" : "Enter rejection reason", variant: "destructive" })
      return
    }

    setSaving(true)
    try {
      const { data: user } = await supabase.auth.getUser()
      const { error } = await supabase
        .from("inventory_write_offs")
        .update({
          status: "rejected",
          rejected_by: user?.user?.id,
          rejected_at: new Date().toISOString(),
          rejection_reason: rejectionReason,
        })
        .eq("id", selectedWriteOff.id)

      if (error) throw error

      toast({ title: isAr ? "تم" : "Success", description: isAr ? "تم رفض الإهلاك" : "Write-off rejected" })
      setShowRejectDialog(false)
      setShowViewDialog(false)
      loadData()
    } catch (err: any) {
      toast({ title: isAr ? "خطأ" : "Error", description: err.message, variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  // إلغاء الإهلاك المعتمد
  const handleCancel = async () => {
    if (!selectedWriteOff || !cancellationReason) {
      toast({ title: isAr ? "خطأ" : "Error", description: isAr ? "أدخل سبب الإلغاء" : "Enter cancellation reason", variant: "destructive" })
      return
    }

    setSaving(true)
    try {
      const { data: user } = await supabase.auth.getUser()
      const { data: result, error } = await supabase.rpc("cancel_approved_write_off", {
        p_write_off_id: selectedWriteOff.id,
        p_cancelled_by: user?.user?.id,
        p_cancellation_reason: cancellationReason,
      })

      if (error) throw error
      if (!result?.success) throw new Error(result?.error || "Unknown error")

      toast({ title: isAr ? "تم" : "Success", description: isAr ? "تم إلغاء الإهلاك" : "Write-off cancelled" })
      setShowCancelDialog(false)
      setShowViewDialog(false)
      loadData()
    } catch (err: any) {
      toast({ title: isAr ? "خطأ" : "Error", description: err.message, variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  // تصدير CSV
  const handleExport = () => {
    const headers = ["رقم الإهلاك", "التاريخ", "الحالة", "السبب", "التكلفة الإجمالية"]
    const rows = writeOffs.map(wo => [
      wo.write_off_number,
      wo.write_off_date,
      STATUS_LABELS[wo.status]?.label_ar || wo.status,
      WRITE_OFF_REASONS.find(r => r.value === wo.reason)?.label_ar || wo.reason,
      wo.total_cost.toFixed(2),
    ])

    const csv = [headers.join(","), ...rows.map(r => r.join(","))].join("\n")
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `write-offs-${new Date().toISOString().split("T")[0]}.csv`
    link.click()
  }

  // Get accounts by type (lowercase in database)
  const expenseAccounts = accounts.filter(a => a.account_type?.toLowerCase() === "expense")
  const assetAccounts = accounts.filter(a => a.account_type?.toLowerCase() === "asset")

  if (loading) {
    return (
      <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
        <Sidebar />
        <main className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8 overflow-x-hidden">
          <div className="flex items-center justify-center min-h-[60vh]">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
      <Sidebar />
      <main className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8 overflow-x-hidden">
        <div className="space-y-4 sm:space-y-6 max-w-full">
          <CompanyHeader />

          {/* Header - رأس الصفحة */}
          <div className="bg-white dark:bg-slate-900 rounded-xl sm:rounded-2xl shadow-sm border border-gray-200 dark:border-slate-800 p-4 sm:p-6">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 sm:gap-4">
              <div className="flex items-center gap-3 sm:gap-4">
                <div className="p-2 sm:p-3 bg-orange-100 dark:bg-orange-900/30 rounded-lg sm:rounded-xl flex-shrink-0">
                  <AlertTriangle className="w-5 h-5 sm:w-6 sm:h-6 text-orange-600 dark:text-orange-400" />
                </div>
                <div className="min-w-0">
                  <h1 className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white truncate">
                    {isAr ? "إهلاك المخزون" : "Inventory Write-offs"}
                  </h1>
                  <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-0.5 sm:mt-1 truncate">
                    {isAr ? "إدارة المنتجات التالفة والمفقودة" : "Manage damaged and lost products"}
                  </p>
                </div>
              </div>
              <div className="flex gap-2 flex-wrap">
                {canExport && (
                  <Button variant="outline" size="sm" onClick={handleExport} className="text-xs sm:text-sm">
                    <FileDown className="h-4 w-4 ml-1 sm:ml-2" />
                    {isAr ? "تصدير" : "Export"}
                  </Button>
                )}
                {canCreate && (
                  <Button size="sm" onClick={() => setShowNewDialog(true)} className="text-xs sm:text-sm">
                    <Plus className="h-4 w-4 ml-1 sm:ml-2" />
                    {isAr ? "إهلاك جديد" : "New Write-off"}
                  </Button>
                )}
              </div>
            </div>
          </div>

          {/* Stats Cards - بطاقات الإحصائيات */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-4">
            <Card className="p-2 sm:p-0">
              <CardHeader className="pb-1 sm:pb-2 p-2 sm:p-4">
                <CardTitle className="text-xs sm:text-sm font-medium text-gray-600 dark:text-gray-400">
                  {isAr ? "الإجمالي" : "Total"}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-2 sm:p-4 pt-0">
                <div className="text-lg sm:text-2xl font-bold">{writeOffs.length}</div>
              </CardContent>
            </Card>
            <Card className="p-2 sm:p-0">
              <CardHeader className="pb-1 sm:pb-2 p-2 sm:p-4">
                <CardTitle className="text-xs sm:text-sm font-medium text-gray-600 dark:text-gray-400">
                  {isAr ? "قيد الانتظار" : "Pending"}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-2 sm:p-4 pt-0">
                <div className="text-lg sm:text-2xl font-bold text-yellow-600">
                  {writeOffs.filter(w => w.status === "pending").length}
                </div>
              </CardContent>
            </Card>
            <Card className="p-2 sm:p-0">
              <CardHeader className="pb-1 sm:pb-2 p-2 sm:p-4">
                <CardTitle className="text-xs sm:text-sm font-medium text-gray-600 dark:text-gray-400">
                  {isAr ? "معتمد" : "Approved"}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-2 sm:p-4 pt-0">
                <div className="text-lg sm:text-2xl font-bold text-green-600">
                  {writeOffs.filter(w => w.status === "approved").length}
                </div>
              </CardContent>
            </Card>
            <Card className="p-2 sm:p-0">
              <CardHeader className="pb-1 sm:pb-2 p-2 sm:p-4">
                <CardTitle className="text-xs sm:text-sm font-medium text-gray-600 dark:text-gray-400">
                  {isAr ? "إجمالي التكلفة" : "Total Cost"}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-2 sm:p-4 pt-0">
                <div className="text-sm sm:text-2xl font-bold truncate">
                  {formatCurrency(writeOffs.filter(w => w.status === "approved").reduce((sum, w) => sum + w.total_cost, 0))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Filters - الفلاتر */}
          <Card>
            <CardContent className="p-3 sm:p-4">
              <div className="flex flex-wrap gap-2 sm:gap-4">
                <div className="w-full sm:w-40">
                  <Label className="text-xs sm:text-sm">{isAr ? "الحالة" : "Status"}</Label>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="h-9 text-xs sm:text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{isAr ? "الكل" : "All"}</SelectItem>
                      {Object.entries(STATUS_LABELS).map(([key, val]) => (
                        <SelectItem key={key} value={key}>{isAr ? val.label_ar : val.label_en}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex-1 min-w-[120px]">
                  <Label className="text-xs sm:text-sm">{isAr ? "من تاريخ" : "From"}</Label>
                  <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="h-9 text-xs sm:text-sm" />
                </div>
                <div className="flex-1 min-w-[120px]">
                  <Label className="text-xs sm:text-sm">{isAr ? "إلى تاريخ" : "To"}</Label>
                  <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="h-9 text-xs sm:text-sm" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Table - جدول الإهلاكات */}
          <Card>
            <CardHeader className="pb-2 sm:pb-4">
              <CardTitle className="text-sm sm:text-base">{isAr ? "قائمة الإهلاكات" : "Write-offs List"}</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-gray-50 dark:bg-slate-800">
                      <TableHead className="text-xs sm:text-sm">{isAr ? "الرقم" : "Number"}</TableHead>
                      <TableHead className="text-xs sm:text-sm">{isAr ? "التاريخ" : "Date"}</TableHead>
                      <TableHead className="text-xs sm:text-sm hidden sm:table-cell">{isAr ? "السبب" : "Reason"}</TableHead>
                      <TableHead className="text-xs sm:text-sm">{isAr ? "التكلفة" : "Cost"}</TableHead>
                      <TableHead className="text-xs sm:text-sm">{isAr ? "الحالة" : "Status"}</TableHead>
                      <TableHead className="text-xs sm:text-sm">{isAr ? "عرض" : "View"}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {writeOffs.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                          <Package className="h-12 w-12 mx-auto mb-2 opacity-50" />
                          {isAr ? "لا توجد إهلاكات" : "No write-offs found"}
                        </TableCell>
                      </TableRow>
                    ) : (
                      writeOffs.map(wo => (
                        <TableRow key={wo.id} className="hover:bg-gray-50 dark:hover:bg-slate-800/50">
                          <TableCell className="font-mono text-xs sm:text-sm">{wo.write_off_number}</TableCell>
                          <TableCell className="text-xs sm:text-sm">{wo.write_off_date}</TableCell>
                          <TableCell className="text-xs sm:text-sm hidden sm:table-cell">
                            {isAr
                              ? WRITE_OFF_REASONS.find(r => r.value === wo.reason)?.label_ar
                              : WRITE_OFF_REASONS.find(r => r.value === wo.reason)?.label_en}
                          </TableCell>
                          <TableCell className="text-xs sm:text-sm">{formatCurrency(wo.total_cost)}</TableCell>
                          <TableCell>
                            <Badge className={`text-xs ${STATUS_LABELS[wo.status]?.color}`}>
                              {isAr ? STATUS_LABELS[wo.status]?.label_ar : STATUS_LABELS[wo.status]?.label_en}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Button variant="ghost" size="sm" onClick={() => handleView(wo)}>
                              <Eye className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>{/* End of space-y-4 div */}

      {/* New Write-off Dialog */}
      <Dialog open={showNewDialog} onOpenChange={setShowNewDialog}>
        <DialogContent className="w-[95vw] max-w-4xl max-h-[90vh] overflow-y-auto p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle className="text-lg sm:text-xl">{isAr ? "إهلاك مخزون جديد" : "New Inventory Write-off"}</DialogTitle>
            <DialogDescription className="text-sm">{isAr ? "سجل المنتجات التالفة أو المفقودة" : "Record damaged or lost products"}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 sm:space-y-6">
            {/* Basic Info Section */}
            <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3 sm:p-4 space-y-4">
              <h3 className="font-semibold text-sm sm:text-base flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                {isAr ? "معلومات الإهلاك" : "Write-off Information"}
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                {/* تاريخ الإهلاك */}
                <div className="space-y-1.5">
                  <Label className="text-xs sm:text-sm">{isAr ? "تاريخ الإهلاك" : "Write-off Date"} *</Label>
                  <Input
                    type="date"
                    defaultValue={new Date().toISOString().split("T")[0]}
                    className="h-9 sm:h-10 text-sm"
                  />
                </div>

                {/* سبب الإهلاك */}
                <div className="space-y-1.5">
                  <Label className="text-xs sm:text-sm">{isAr ? "سبب الإهلاك" : "Write-off Reason"} *</Label>
                  <Select value={newReason} onValueChange={setNewReason}>
                    <SelectTrigger className="h-9 sm:h-10 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {WRITE_OFF_REASONS.map(r => (
                        <SelectItem key={r.value} value={r.value}>
                          {isAr ? r.label_ar : r.label_en}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* تفاصيل إضافية */}
              <div className="space-y-1.5">
                <Label className="text-xs sm:text-sm">{isAr ? "تفاصيل السبب" : "Reason Details"}</Label>
                <Input
                  value={newReasonDetails}
                  onChange={e => setNewReasonDetails(e.target.value)}
                  placeholder={isAr ? "وصف تفصيلي للسبب..." : "Detailed description..."}
                  className="h-9 sm:h-10 text-sm"
                />
              </div>
            </div>

            {/* Items Section */}
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <h3 className="font-semibold text-sm sm:text-base flex items-center gap-2">
                  <Package className="h-4 w-4 text-blue-500" />
                  {isAr ? "المنتجات المراد إهلاكها" : "Products to Write-off"}
                </h3>
                <Button type="button" variant="outline" size="sm" onClick={addItem} className="h-8 text-xs sm:text-sm">
                  <Plus className="h-3.5 w-3.5 ml-1" /> {isAr ? "إضافة منتج" : "Add Product"}
                </Button>
              </div>

              {/* Mobile: Card Layout */}
              <div className="block sm:hidden space-y-3">
                {newItems.length === 0 ? (
                  <div className="text-center py-8 text-gray-500 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                    <Package className="h-10 w-10 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">{isAr ? "اضغط على 'إضافة منتج' لبدء الإهلاك" : "Click 'Add Product' to start"}</p>
                  </div>
                ) : (
                  newItems.map((item, idx) => (
                    <div key={idx} className="bg-white dark:bg-gray-800 border rounded-lg p-3 space-y-3 shadow-sm">
                      {/* Product Select */}
                      <div className="space-y-1.5">
                        <Label className="text-xs text-gray-500">{isAr ? "المنتج" : "Product"}</Label>
                        <Select value={item.product_id} onValueChange={v => updateItem(idx, "product_id", v)}>
                          <SelectTrigger className="h-9 text-sm"><SelectValue placeholder={isAr ? "اختر منتج" : "Select product"} /></SelectTrigger>
                          <SelectContent>
                            {products.map(p => (
                              <SelectItem key={p.id} value={p.id}>
                                <span className="flex flex-col">
                                  <span>{p.name}</span>
                                  <span className="text-xs text-gray-500">{p.sku}</span>
                                </span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Quantity and Cost Row */}
                      <div className="grid grid-cols-3 gap-2">
                        <div className="space-y-1">
                          <Label className="text-xs text-gray-500">{isAr ? "المتاح" : "Available"}</Label>
                          <div className="h-9 flex items-center justify-center">
                            <Badge variant={item.available_qty > 0 ? "secondary" : "destructive"} className="text-xs">
                              {item.available_qty ?? "-"}
                            </Badge>
                          </div>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-gray-500">{isAr ? "الكمية" : "Qty"}</Label>
                          <Input
                            type="number"
                            min={1}
                            max={item.available_qty}
                            value={item.quantity}
                            onChange={e => updateItem(idx, "quantity", parseInt(e.target.value) || 0)}
                            className="h-9 text-sm text-center"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-gray-500">{isAr ? "التكلفة" : "Cost"}</Label>
                          <Input
                            type="number"
                            step="0.01"
                            value={item.unit_cost}
                            onChange={e => updateItem(idx, "unit_cost", parseFloat(e.target.value) || 0)}
                            className="h-9 text-sm text-center"
                          />
                        </div>
                      </div>

                      {/* Batch & Expiry (Optional) */}
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <Label className="text-xs text-gray-500">{isAr ? "رقم الدفعة" : "Batch No."}</Label>
                          <Input
                            value={(item as any).batch_number || ""}
                            onChange={e => updateItem(idx, "batch_number", e.target.value)}
                            placeholder="---"
                            className="h-8 text-xs"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-gray-500">{isAr ? "تاريخ الانتهاء" : "Expiry"}</Label>
                          <Input
                            type="date"
                            value={(item as any).expiry_date || ""}
                            onChange={e => updateItem(idx, "expiry_date", e.target.value)}
                            className="h-8 text-xs"
                          />
                        </div>
                      </div>

                      {/* Total and Delete */}
                      <div className="flex justify-between items-center pt-2 border-t">
                        <span className="font-bold text-sm">
                          {isAr ? "الإجمالي:" : "Total:"} {formatCurrency(item.total_cost)}
                        </span>
                        <Button variant="ghost" size="sm" onClick={() => removeItem(idx)} className="h-8 text-destructive hover:text-destructive">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Desktop: Table Layout */}
              <div className="hidden sm:block overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[200px]">{isAr ? "المنتج" : "Product"}</TableHead>
                      <TableHead className="text-center w-20">{isAr ? "المتاح" : "Avail."}</TableHead>
                      <TableHead className="w-24">{isAr ? "الكمية" : "Qty"}</TableHead>
                      <TableHead className="w-28">{isAr ? "التكلفة" : "Cost"}</TableHead>
                      <TableHead className="w-32">{isAr ? "رقم الدفعة" : "Batch"}</TableHead>
                      <TableHead className="w-32">{isAr ? "الانتهاء" : "Expiry"}</TableHead>
                      <TableHead className="text-left w-28">{isAr ? "الإجمالي" : "Total"}</TableHead>
                      <TableHead className="w-12"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {newItems.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center py-8 text-gray-500">
                          <Package className="h-8 w-8 mx-auto mb-2 opacity-30" />
                          {isAr ? "اضغط على 'إضافة منتج'" : "Click 'Add Product'"}
                        </TableCell>
                      </TableRow>
                    ) : (
                      newItems.map((item, idx) => (
                        <TableRow key={idx}>
                          <TableCell>
                            <Select value={item.product_id} onValueChange={v => updateItem(idx, "product_id", v)}>
                              <SelectTrigger className="w-full"><SelectValue placeholder={isAr ? "اختر منتج" : "Select"} /></SelectTrigger>
                              <SelectContent>
                                {products.map(p => (
                                  <SelectItem key={p.id} value={p.id}>
                                    {p.name} ({p.sku})
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge variant={item.available_qty > 0 ? "secondary" : "destructive"}>
                              {item.available_qty ?? "-"}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              min={1}
                              max={item.available_qty}
                              value={item.quantity}
                              onChange={e => updateItem(idx, "quantity", parseInt(e.target.value) || 0)}
                              className="w-full"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              step="0.01"
                              value={item.unit_cost}
                              onChange={e => updateItem(idx, "unit_cost", parseFloat(e.target.value) || 0)}
                              className="w-full"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              value={(item as any).batch_number || ""}
                              onChange={e => updateItem(idx, "batch_number", e.target.value)}
                              placeholder="---"
                              className="w-full"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="date"
                              value={(item as any).expiry_date || ""}
                              onChange={e => updateItem(idx, "expiry_date", e.target.value)}
                              className="w-full"
                            />
                          </TableCell>
                          <TableCell className="font-semibold">{formatCurrency(item.total_cost)}</TableCell>
                          <TableCell>
                            <Button variant="ghost" size="sm" onClick={() => removeItem(idx)}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>

              {/* Total */}
              {newItems.length > 0 && (
                <div className="flex justify-end">
                  <div className="bg-primary/10 rounded-lg px-4 py-2 text-base sm:text-lg font-bold">
                    {isAr ? "إجمالي التكلفة:" : "Total Cost:"} {formatCurrency(totalCost)}
                  </div>
                </div>
              )}
            </div>

            {/* Notes Section */}
            <div className="space-y-1.5">
              <Label className="text-xs sm:text-sm">{isAr ? "ملاحظات إضافية" : "Additional Notes"}</Label>
              <Textarea
                value={newNotes}
                onChange={e => setNewNotes(e.target.value)}
                placeholder={isAr ? "أي ملاحظات أو تعليقات..." : "Any notes or comments..."}
                className="min-h-[80px] text-sm"
              />
            </div>
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2 sm:gap-0 pt-4">
            <Button variant="outline" onClick={() => { setShowNewDialog(false); resetForm() }} className="w-full sm:w-auto order-2 sm:order-1">
              {isAr ? "إلغاء" : "Cancel"}
            </Button>
            <Button onClick={handleSaveWriteOff} disabled={saving || newItems.length === 0} className="w-full sm:w-auto order-1 sm:order-2">
              {saving && <Loader2 className="h-4 w-4 ml-2 animate-spin" />}
              {isAr ? "حفظ الإهلاك" : "Save Write-off"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Write-off Dialog */}
      <Dialog open={showViewDialog} onOpenChange={setShowViewDialog}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {isAr ? "تفاصيل الإهلاك" : "Write-off Details"} - {selectedWriteOff?.write_off_number}
            </DialogTitle>
          </DialogHeader>

          {selectedWriteOff && (
            <div className="space-y-4">
              {/* Info */}
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label className="text-muted-foreground">{isAr ? "التاريخ" : "Date"}</Label>
                  <p className="font-medium">{selectedWriteOff.write_off_date}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">{isAr ? "السبب" : "Reason"}</Label>
                  <p className="font-medium">
                    {isAr
                      ? WRITE_OFF_REASONS.find(r => r.value === selectedWriteOff.reason)?.label_ar
                      : WRITE_OFF_REASONS.find(r => r.value === selectedWriteOff.reason)?.label_en}
                  </p>
                </div>
                <div>
                  <Label className="text-muted-foreground">{isAr ? "الحالة" : "Status"}</Label>
                  <Badge className={STATUS_LABELS[selectedWriteOff.status]?.color}>
                    {isAr ? STATUS_LABELS[selectedWriteOff.status]?.label_ar : STATUS_LABELS[selectedWriteOff.status]?.label_en}
                  </Badge>
                </div>
              </div>

              {selectedWriteOff.reason_details && (
                <div>
                  <Label className="text-muted-foreground">{isAr ? "تفاصيل إضافية" : "Details"}</Label>
                  <p>{selectedWriteOff.reason_details}</p>
                </div>
              )}

              {/* Items Table */}
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{isAr ? "المنتج" : "Product"}</TableHead>
                    <TableHead>{isAr ? "الكمية" : "Quantity"}</TableHead>
                    <TableHead>{isAr ? "التكلفة" : "Unit Cost"}</TableHead>
                    <TableHead>{isAr ? "الإجمالي" : "Total"}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {selectedWriteOff.items?.map((item, idx) => (
                    <TableRow key={idx}>
                      <TableCell>{item.product_name}</TableCell>
                      <TableCell>{item.quantity}</TableCell>
                      <TableCell>{formatCurrency(item.unit_cost)}</TableCell>
                      <TableCell>{formatCurrency(item.total_cost)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              <div className="flex justify-end">
                <div className="text-lg font-bold">
                  {isAr ? "الإجمالي:" : "Total:"} {formatCurrency(selectedWriteOff.total_cost)}
                </div>
              </div>

              {/* Action Buttons */}
              {selectedWriteOff.status === "pending" && (
                <div className="flex gap-2 justify-end pt-4 border-t">
                  {canApprove && (
                    <>
                      <Button variant="destructive" onClick={() => setShowRejectDialog(true)}>
                        <X className="h-4 w-4 mr-2" />
                        {isAr ? "رفض" : "Reject"}
                      </Button>
                      <Button className="bg-green-600 hover:bg-green-700" onClick={() => setShowApproveDialog(true)}>
                        <Check className="h-4 w-4 mr-2" />
                        {isAr ? "اعتماد" : "Approve"}
                      </Button>
                    </>
                  )}
                </div>
              )}

              {selectedWriteOff.status === "approved" && canCancel && (
                <div className="flex gap-2 justify-end pt-4 border-t">
                  <Button variant="destructive" onClick={() => setShowCancelDialog(true)}>
                    <RotateCcw className="h-4 w-4 mr-2" />
                    {isAr ? "إلغاء الإهلاك" : "Cancel Write-off"}
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Approve Dialog */}
      <Dialog open={showApproveDialog} onOpenChange={setShowApproveDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isAr ? "اعتماد الإهلاك" : "Approve Write-off"}</DialogTitle>
            <DialogDescription>
              {isAr ? "اختر الحسابات المحاسبية لتسجيل القيد" : "Select accounting accounts for journal entry"}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label>{isAr ? "حساب مصروف الإهلاك" : "Write-off Expense Account"} *</Label>
              <Select value={expenseAccountId} onValueChange={setExpenseAccountId}>
                <SelectTrigger><SelectValue placeholder={isAr ? "اختر حساب" : "Select account"} /></SelectTrigger>
                <SelectContent>
                  {expenseAccounts.map(a => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.account_code} - {a.account_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{isAr ? "حساب المخزون" : "Inventory Account"} *</Label>
              <Select value={inventoryAccountId} onValueChange={setInventoryAccountId}>
                <SelectTrigger><SelectValue placeholder={isAr ? "اختر حساب" : "Select account"} /></SelectTrigger>
                <SelectContent>
                  {assetAccounts.map(a => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.account_code} - {a.account_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="bg-yellow-50 p-3 rounded-md flex items-start gap-2">
              <AlertTriangle className="h-5 w-5 text-yellow-600 mt-0.5" />
              <div className="text-sm text-yellow-800">
                {isAr
                  ? "سيتم خصم الكميات من المخزون وتسجيل قيد محاسبي"
                  : "Quantities will be deducted from inventory and a journal entry will be created"}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowApproveDialog(false)}>
              {isAr ? "إلغاء" : "Cancel"}
            </Button>
            <Button onClick={handleApprove} disabled={saving || !expenseAccountId || !inventoryAccountId}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {isAr ? "اعتماد" : "Approve"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Dialog */}
      <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isAr ? "رفض الإهلاك" : "Reject Write-off"}</DialogTitle>
          </DialogHeader>
          <div>
            <Label>{isAr ? "سبب الرفض" : "Rejection Reason"} *</Label>
            <Textarea value={rejectionReason} onChange={e => setRejectionReason(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRejectDialog(false)}>{isAr ? "إلغاء" : "Cancel"}</Button>
            <Button variant="destructive" onClick={handleReject} disabled={saving || !rejectionReason}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {isAr ? "رفض" : "Reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel Dialog */}
      <Dialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isAr ? "إلغاء الإهلاك المعتمد" : "Cancel Approved Write-off"}</DialogTitle>
            <DialogDescription>
              {isAr
                ? "سيتم إرجاع الكميات للمخزون وعكس القيد المحاسبي"
                : "Quantities will be restored and journal entry will be reversed"}
            </DialogDescription>
          </DialogHeader>
          <div>
            <Label>{isAr ? "سبب الإلغاء" : "Cancellation Reason"} *</Label>
            <Textarea value={cancellationReason} onChange={e => setCancellationReason(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCancelDialog(false)}>{isAr ? "رجوع" : "Back"}</Button>
            <Button variant="destructive" onClick={handleCancel} disabled={saving || !cancellationReason}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {isAr ? "إلغاء الإهلاك" : "Cancel Write-off"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </main>
    </div>
  )
}

