"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useSupabase } from "@/lib/supabase/hooks"
import { getActiveCompanyId } from "@/lib/company"
import { Lock, Plus, AlertTriangle } from "lucide-react"
import { CompanyHeader } from "@/components/company-header"
import { useToast } from "@/hooks/use-toast"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useAutoRefresh } from "@/hooks/use-auto-refresh"
import { DataTable, type DataTableColumn } from "@/components/DataTable"
import { DataPagination } from "@/components/data-pagination"
import { usePagination } from "@/lib/pagination"

interface AccountingPeriod {
  id: string
  period_name: string
  period_start: string
  period_end: string
  status: "open" | "closed" | "locked"
  is_locked: boolean
  journal_entry_id?: string
  closed_by?: string
  closed_at?: string
  notes?: string
}

interface PeriodClosingResult {
  success: boolean
  journalEntryId?: string
  periodId?: string
  netIncome?: number
  retainedEarningsBalance?: number
  error?: string
}

export default function PeriodClosingPage() {
  const supabase = useSupabase()
  const { toast } = useToast()
  const [periods, setPeriods] = useState<AccountingPeriod[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isClosing, setIsClosing] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [userRole, setUserRole] = useState<string>("")

  // Close period dialog
  const [showCloseDialog, setShowCloseDialog] = useState(false)
  const [selectedPeriod, setSelectedPeriod] = useState<{ id?: string; start: string; end: string; name?: string } | null>(null)
  const [periodName, setPeriodName] = useState("")
  const [notes, setNotes] = useState("")

  // Create period dialog
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [newPeriodName, setNewPeriodName] = useState("")
  const [newPeriodStart, setNewPeriodStart] = useState("")
  const [newPeriodEnd, setNewPeriodEnd] = useState("")
  const [newPeriodNotes, setNewPeriodNotes] = useState("")

  const [appLang, setAppLang] = useState<'ar' | 'en'>('ar')
  const [hydrated, setHydrated] = useState(false)
  const numberFmt = new Intl.NumberFormat(appLang === 'en' ? 'en-EG' : 'ar-EG', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })

  // Pagination (standard DataTable pattern) — hook declared before any conditional returns
  const [pageSize, setPageSize] = useState(10)
  const {
    currentPage,
    totalPages,
    totalItems,
    paginatedItems: paginatedPeriods,
    goToPage,
    setPageSize: updatePageSize,
  } = usePagination(periods, { pageSize })
  const handlePageSizeChange = (newSize: number) => {
    setPageSize(newSize)
    updatePageSize(newSize)
  }

  useEffect(() => {
    setHydrated(true)
    loadPeriods()
    loadUserRole()
    const handler = () => {
      try {
        const docLang = document.documentElement?.lang
        if (docLang === 'en') { setAppLang('en'); return }
        const fromCookie = document.cookie.split('; ').find((x) => x.startsWith('app_language='))?.split('=')[1]
        const v = fromCookie || localStorage.getItem('app_language') || 'ar'
        setAppLang(v === 'en' ? 'en' : 'ar')
      } catch {}
    }
    handler()
    window.addEventListener('app_language_changed', handler)
    window.addEventListener('storage', (e: any) => { if (e?.key === 'app_language') handler() })
    return () => { window.removeEventListener('app_language_changed', handler) }
  }, [])

  // v3.74.61 — تَحديث تِلقائى عِندَ العَودَة للنّافِذَة/التَّبويب
  useAutoRefresh({ onRefresh: () => loadUserRole() })

  const loadUserRole = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const companyId = await getActiveCompanyId(supabase)
      if (!companyId) return
      const { data: member } = await supabase
        .from("company_members")
        .select("role")
        .eq("company_id", companyId)
        .eq("user_id", user.id)
        .maybeSingle()
      setUserRole(member?.role || "")
    } catch {}
  }

  const loadPeriods = async () => {
    try {
      setIsLoading(true)
      const res = await fetch("/api/accounting-periods")
      if (!res.ok) throw new Error("Failed to load periods")
      const data = await res.json()
      setPeriods(data.data || [])
    } catch (error: any) {
      toast({
        title: appLang === 'en' ? "Error" : "خطأ",
        description: error.message || (appLang === 'en' ? "Failed to load periods" : "فشل تحميل الفترات"),
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleCreatePeriod = async () => {
    if (!newPeriodName || !newPeriodStart || !newPeriodEnd) {
      toast({
        title: appLang === 'en' ? "Validation Error" : "بيانات ناقصة",
        description: appLang === 'en' ? "Please fill all required fields" : "يرجى ملء جميع الحقول المطلوبة",
        variant: "destructive",
      })
      return
    }
    if (newPeriodStart > newPeriodEnd) {
      toast({
        title: appLang === 'en' ? "Invalid Dates" : "تواريخ غير صحيحة",
        description: appLang === 'en' ? "Start date must be before end date" : "تاريخ البداية يجب أن يكون قبل تاريخ النهاية",
        variant: "destructive",
      })
      return
    }
    try {
      setIsCreating(true)
      const res = await fetch("/api/accounting-periods", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          period_name: newPeriodName,
          period_start: newPeriodStart,
          period_end: newPeriodEnd,
          notes: newPeriodNotes || undefined,
        }),
      })
      const result = await res.json()
      if (!res.ok || result.error) throw new Error(result.error || "Failed to create period")
      toast({
        title: appLang === 'en' ? "✅ Success" : "✅ تم بنجاح",
        description: appLang === 'en'
          ? `Accounting period "${newPeriodName}" created and opened successfully.`
          : `تم إنشاء وفتح الفترة المحاسبية "${newPeriodName}" بنجاح.`,
      })
      setShowCreateDialog(false)
      setNewPeriodName("")
      setNewPeriodStart("")
      setNewPeriodEnd("")
      setNewPeriodNotes("")
      loadPeriods()
    } catch (error: any) {
      toast({
        title: appLang === 'en' ? "Error" : "❌ خطأ",
        description: error.message || (appLang === 'en' ? "Failed to create period" : "فشل إنشاء الفترة"),
        variant: "destructive",
      })
    } finally {
      setIsCreating(false)
    }
  }

  const openCreateDialogForCurrentMonth = () => {
    const today = new Date()
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1)
    const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0)
    setNewPeriodStart(firstDay.toISOString().split("T")[0])
    setNewPeriodEnd(lastDay.toISOString().split("T")[0])
    setNewPeriodName(`${firstDay.toLocaleDateString('ar-EG', { month: 'long', year: 'numeric' })}`)
    setNewPeriodNotes("")
    setShowCreateDialog(true)
  }

  const handleClosePeriod = async () => {
    if (!selectedPeriod) return
    try {
      setIsClosing(true)
      const companyId = await getActiveCompanyId(supabase)
      if (!companyId) {
        toast({ title: appLang === 'en' ? "Error" : "خطأ", description: appLang === 'en' ? "Company not found" : "الشركة غير موجودة", variant: "destructive" })
        return
      }
      const checkRes = await fetch(`/api/period-closing?periodStart=${selectedPeriod.start}&periodEnd=${selectedPeriod.end}`)
      const checkData = await checkRes.json()
      if (!checkData.canClose) {
        toast({
          title: appLang === 'en' ? "Cannot Close Period" : "❌ لا يمكن إقفال الفترة",
          description: checkData.error || (appLang === 'en' ? "Period is already closed or locked" : "الفترة مغلقة أو مقفلة بالفعل"),
          variant: "destructive",
        })
        return
      }
      const closeRes = await fetch("/api/period-closing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ periodStart: selectedPeriod.start, periodEnd: selectedPeriod.end, periodName: periodName || selectedPeriod.name, notes: notes || undefined }),
      })
      const result: PeriodClosingResult = await closeRes.json()
      if (!result.success) throw new Error(result.error || (appLang === 'en' ? "Failed to close period" : "فشل إقفال الفترة"))
      toast({
        title: appLang === 'en' ? "Success" : "✅ نجح",
        description: appLang === 'en'
          ? `Period closed successfully. Net Income: ${numberFmt.format(result.netIncome || 0)}`
          : `تم إقفال الفترة بنجاح. صافي الربح: ${numberFmt.format(result.netIncome || 0)}`,
      })
      setShowCloseDialog(false)
      setSelectedPeriod(null)
      setPeriodName("")
      setNotes("")
      loadPeriods()
    } catch (error: any) {
      toast({ title: appLang === 'en' ? "Error" : "❌ خطأ", description: error.message || (appLang === 'en' ? "Failed to close period" : "فشل إقفال الفترة"), variant: "destructive" })
    } finally {
      setIsClosing(false)
    }
  }

  const getStatusBadge = (status: string, isLocked: boolean) => {
    if (status === "closed" || isLocked) {
      return (
        <span className="px-2 py-1 rounded text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200">
          {appLang === 'en' ? 'Locked' : 'مقفلة'}
        </span>
      )
    }
    return (
      <span className="px-2 py-1 rounded text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
        {appLang === 'en' ? 'Open' : 'مفتوحة'}
      </span>
    )
  }

  // أعمدة الجدول الموحّد (نفس الأعمدة والترتيب الأصلي)
  const tableColumns: DataTableColumn<AccountingPeriod>[] = [
    {
      key: 'period_name',
      header: (hydrated && appLang === 'en') ? 'Period Name' : 'اسم الفترة',
      type: 'text',
      align: 'right',
      className: 'font-medium',
    },
    {
      key: 'period_start',
      header: (hydrated && appLang === 'en') ? 'Start Date' : 'تاريخ البداية',
      type: 'date',
      align: 'right',
    },
    {
      key: 'period_end',
      header: (hydrated && appLang === 'en') ? 'End Date' : 'تاريخ النهاية',
      type: 'date',
      align: 'right',
    },
    {
      key: 'status',
      header: (hydrated && appLang === 'en') ? 'Status' : 'الحالة',
      type: 'status',
      align: 'right',
      format: (_value, row) => getStatusBadge(row.status, row.is_locked),
    },
    {
      key: 'journal_entry_id',
      header: (hydrated && appLang === 'en') ? 'Journal Entry' : 'القيد المحاسبي',
      type: 'custom',
      align: 'right',
      format: (_value, row) => (
        row.journal_entry_id ? (
          <a href={`/journal-entries?entry_id=${row.journal_entry_id}`} className="text-blue-600 hover:underline">
            {row.journal_entry_id.substring(0, 8)}...
          </a>
        ) : (
          <span className="text-gray-400">-</span>
        )
      ),
    },
    {
      key: 'closed_at',
      header: (hydrated && appLang === 'en') ? 'Closed At' : 'تاريخ الإقفال',
      type: 'date',
      align: 'right',
      format: (_value, row) => (row.closed_at ? new Date(row.closed_at).toLocaleDateString('ar-EG') : "-"),
    },
  ]

  const isOwnerOrAdmin = ["owner", "admin"].includes(userRole)

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
      <main className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8 overflow-x-hidden">
        <div className="space-y-4 sm:space-y-6 max-w-full">
          <CompanyHeader />
          <div className="flex flex-col sm:flex-row sm:justify-between items-start gap-3">
            <div>
              <h1 className="text-xl sm:text-3xl font-bold text-gray-900 dark:text-white" suppressHydrationWarning>
                {(hydrated && appLang === 'en') ? 'Accounting Periods' : 'الفترات المحاسبية'}
              </h1>
              <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mt-1 sm:mt-2" suppressHydrationWarning>
                {(hydrated && appLang === 'en') ? 'Manage, open and close accounting periods' : 'إدارة وفتح وإقفال الفترات المحاسبية'}
              </p>
            </div>
            {isOwnerOrAdmin && (
              <div className="flex gap-2 flex-wrap">
                <Button
                  onClick={openCreateDialogForCurrentMonth}
                  className="bg-green-600 hover:bg-green-700"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  {(hydrated && appLang === 'en') ? 'New Period' : 'فترة جديدة'}
                </Button>
                <Button
                  onClick={() => {
                    setSelectedPeriod(null)
                    setPeriodName("")
                    setNotes("")
                    setShowCloseDialog(true)
                  }}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  <Lock className="w-4 h-4 mr-2" />
                  {(hydrated && appLang === 'en') ? 'Close Period' : 'إقفال فترة'}
                </Button>
              </div>
            )}
          </div>

          {isLoading ? (
            <div className="flex justify-center items-center py-20">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600"></div>
            </div>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle suppressHydrationWarning>
                  {(hydrated && appLang === 'en') ? 'Accounting Periods' : 'الفترات المحاسبية'}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {periods.length === 0 ? (
                  <div className="flex flex-col items-center gap-3 py-8 text-gray-500">
                    <div className="w-12 h-12 rounded-full bg-gray-100 dark:bg-slate-800 flex items-center justify-center">
                      <Lock className="w-6 h-6 text-gray-400" />
                    </div>
                    <p suppressHydrationWarning>{(hydrated && appLang === 'en') ? 'No accounting periods found' : 'لا توجد فترات محاسبية'}</p>
                    {isOwnerOrAdmin && (
                      <Button size="sm" onClick={openCreateDialogForCurrentMonth} className="bg-green-600 hover:bg-green-700">
                        <Plus className="w-4 h-4 mr-1" />
                        {(hydrated && appLang === 'en') ? 'Create first period' : 'إنشاء أول فترة'}
                      </Button>
                    )}
                  </div>
                ) : (
                  <>
                    <DataTable
                      columns={tableColumns}
                      data={paginatedPeriods}
                      keyField="id"
                      lang={appLang}
                      emptyMessage={(hydrated && appLang === 'en') ? 'No accounting periods found' : 'لا توجد فترات محاسبية'}
                    />
                    <DataPagination
                      currentPage={currentPage}
                      totalPages={totalPages}
                      totalItems={totalItems}
                      pageSize={pageSize}
                      onPageChange={goToPage}
                      onPageSizeChange={handlePageSizeChange}
                      lang={appLang}
                    />
                  </>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </main>

      {/* Dialog: Create New Period */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle suppressHydrationWarning>
              {(hydrated && appLang === 'en') ? 'Create New Accounting Period' : 'إنشاء فترة محاسبية جديدة'}
            </DialogTitle>
            <DialogDescription suppressHydrationWarning>
              {(hydrated && appLang === 'en')
                ? 'Create an open accounting period to allow financial transactions within its date range.'
                : 'إنشاء فترة محاسبية مفتوحة تسمح بتسجيل العمليات المالية خلال نطاقها الزمني.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label suppressHydrationWarning>{(hydrated && appLang === 'en') ? 'Period Name *' : 'اسم الفترة *'}</Label>
              <Input
                value={newPeriodName}
                onChange={(e) => setNewPeriodName(e.target.value)}
                placeholder={appLang === 'en' ? 'e.g., May 2026' : 'مثال: مايو 2026'}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label suppressHydrationWarning>{(hydrated && appLang === 'en') ? 'Start Date *' : 'تاريخ البداية *'}</Label>
                <Input type="date" value={newPeriodStart} onChange={(e) => setNewPeriodStart(e.target.value)} />
              </div>
              <div>
                <Label suppressHydrationWarning>{(hydrated && appLang === 'en') ? 'End Date *' : 'تاريخ النهاية *'}</Label>
                <Input type="date" value={newPeriodEnd} onChange={(e) => setNewPeriodEnd(e.target.value)} />
              </div>
            </div>
            <div>
              <Label suppressHydrationWarning>{(hydrated && appLang === 'en') ? 'Notes (Optional)' : 'ملاحظات (اختياري)'}</Label>
              <textarea
                className="w-full border rounded p-2 text-sm"
                value={newPeriodNotes}
                onChange={(e) => setNewPeriodNotes(e.target.value)}
                rows={2}
                placeholder={appLang === 'en' ? 'Additional notes...' : 'ملاحظات إضافية...'}
              />
            </div>
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded p-3">
              <p className="text-sm text-blue-800 dark:text-blue-200" suppressHydrationWarning>
                {(hydrated && appLang === 'en')
                  ? 'The period will be created with status "Open", allowing financial transactions within this date range.'
                  : 'ستُنشأ الفترة بحالة "مفتوحة"، مما يتيح تسجيل الحركات المالية خلال هذا النطاق الزمني.'}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)} disabled={isCreating}>
              {(hydrated && appLang === 'en') ? 'Cancel' : 'إلغاء'}
            </Button>
            <Button onClick={handleCreatePeriod} disabled={isCreating} className="bg-green-600 hover:bg-green-700">
              {isCreating
                ? (hydrated && appLang === 'en' ? 'Creating...' : 'جاري الإنشاء...')
                : (hydrated && appLang === 'en' ? 'Create Period' : 'إنشاء الفترة')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Close Period */}
      <Dialog open={showCloseDialog} onOpenChange={setShowCloseDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle suppressHydrationWarning>
              {(hydrated && appLang === 'en') ? 'Close Accounting Period' : 'إقفال فترة محاسبية'}
            </DialogTitle>
            <DialogDescription suppressHydrationWarning>
              {(hydrated && appLang === 'en')
                ? 'This action will create a period closing entry and lock the period. This cannot be undone.'
                : 'سيتم إنشاء قيد إقفال الفترة وقفل الفترة. لا يمكن التراجع عن هذه العملية.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
              <div>
                <Label suppressHydrationWarning>{(hydrated && appLang === 'en') ? 'Select Open Period' : 'اختر الفترة المفتوحة المراد إقفالها'}</Label>
                <select 
                  className="w-full border rounded p-2 mt-1 bg-white dark:bg-slate-900"
                  value={selectedPeriod?.id || ""}
                  onChange={(e) => {
                    const selected = periods.find(p => p.id === e.target.value)
                    if (selected) {
                      setSelectedPeriod({ id: selected.id, start: selected.period_start, end: selected.period_end, name: selected.period_name })
                      setPeriodName(selected.period_name)
                    } else {
                      setSelectedPeriod(null)
                      setPeriodName("")
                    }
                  }}
                >
                  <option value="" disabled>{(hydrated && appLang === 'en') ? 'Select a period...' : 'اختر فترة...'}</option>
                  {periods.filter(p => p.status === 'open').map(p => (
                    <option key={p.id} value={p.id}>{p.period_name} ({p.period_start} - {p.period_end})</option>
                  ))}
                </select>
                {periods.filter(p => p.status === 'open').length === 0 && (
                  <p className="text-red-500 text-sm mt-1">{(hydrated && appLang === 'en') ? 'No open periods available.' : 'لا توجد فترات مفتوحة.'}</p>
                )}
              </div>
            <div>
              <Label suppressHydrationWarning>{(hydrated && appLang === 'en') ? 'Period Name (Optional)' : 'اسم الفترة (اختياري)'}</Label>
              <Input value={periodName} onChange={(e) => setPeriodName(e.target.value)} placeholder={appLang === 'en' ? 'e.g., January 2026' : 'مثال: يناير 2026'} />
            </div>
            <div>
              <Label suppressHydrationWarning>{(hydrated && appLang === 'en') ? 'Notes (Optional)' : 'ملاحظات (اختياري)'}</Label>
              <textarea className="w-full border rounded p-2" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder={appLang === 'en' ? 'Additional notes...' : 'ملاحظات إضافية...'} />
            </div>
            <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded p-3">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-5 h-5 text-yellow-600 dark:text-yellow-400 mt-0.5" />
                <div className="text-sm text-yellow-800 dark:text-yellow-200" suppressHydrationWarning>
                  {(hydrated && appLang === 'en')
                    ? 'Warning: After closing, you will not be able to add or modify any accounting entries in this period.'
                    : 'تحذير: بعد الإقفال، لن يمكنك إضافة أو تعديل أي قيود محاسبية في هذه الفترة.'}
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCloseDialog(false)} disabled={isClosing}>
              {(hydrated && appLang === 'en') ? 'Cancel' : 'إلغاء'}
            </Button>
            <Button onClick={handleClosePeriod} disabled={isClosing} className="bg-red-600 hover:bg-red-700">
              {isClosing
                ? (hydrated && appLang === 'en' ? 'Closing...' : 'جاري الإقفال...')
                : (hydrated && appLang === 'en' ? 'Close Period' : 'إقفال الفترة')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
