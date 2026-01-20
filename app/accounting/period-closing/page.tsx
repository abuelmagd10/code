"use client"

import { useState, useEffect } from "react"
import { Sidebar } from "@/components/sidebar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useSupabase } from "@/lib/supabase/hooks"
import { getActiveCompanyId } from "@/lib/company"
import { Download, Lock, Unlock, AlertTriangle } from "lucide-react"
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
  const [showCloseDialog, setShowCloseDialog] = useState(false)
  const [selectedPeriod, setSelectedPeriod] = useState<{
    start: string
    end: string
    name?: string
  } | null>(null)
  const [periodName, setPeriodName] = useState("")
  const [notes, setNotes] = useState("")

  const [appLang, setAppLang] = useState<'ar' | 'en'>('ar')
  const [hydrated, setHydrated] = useState(false)
  const numberFmt = new Intl.NumberFormat(appLang === 'en' ? 'en-EG' : 'ar-EG', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })

  useEffect(() => {
    setHydrated(true)
    loadPeriods()
    const handler = () => {
      try {
        const docLang = document.documentElement?.lang
        if (docLang === 'en') {
          setAppLang('en')
          return
        }
        const fromCookie = document.cookie.split('; ').find((x) => x.startsWith('app_language='))?.split('=')[1]
        const v = fromCookie || localStorage.getItem('app_language') || 'ar'
        setAppLang(v === 'en' ? 'en' : 'ar')
      } catch {}
    }
    handler()
    window.addEventListener('app_language_changed', handler)
    window.addEventListener('storage', (e: any) => {
      if (e?.key === 'app_language') handler()
    })
    return () => {
      window.removeEventListener('app_language_changed', handler)
    }
  }, [])

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

  const handleClosePeriod = async () => {
    if (!selectedPeriod) return

    try {
      setIsClosing(true)

      const companyId = await getActiveCompanyId(supabase)
      if (!companyId) {
        toast({
          title: appLang === 'en' ? "Error" : "خطأ",
          description: appLang === 'en' ? "Company not found" : "الشركة غير موجودة",
          variant: "destructive",
        })
        return
      }

      // التحقق من إمكانية الإقفال
      const checkRes = await fetch(
        `/api/period-closing?periodStart=${selectedPeriod.start}&periodEnd=${selectedPeriod.end}`
      )
      const checkData = await checkRes.json()

      if (!checkData.canClose) {
        toast({
          title: appLang === 'en' ? "Cannot Close Period" : "❌ لا يمكن إقفال الفترة",
          description: checkData.error || (appLang === 'en' ? "Period is already closed or locked" : "الفترة مغلقة أو مقفلة بالفعل"),
          variant: "destructive",
        })
        return
      }

      // إقفال الفترة
      const closeRes = await fetch("/api/period-closing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          periodStart: selectedPeriod.start,
          periodEnd: selectedPeriod.end,
          periodName: periodName || selectedPeriod.name,
          notes: notes || undefined,
        }),
      })

      const result: PeriodClosingResult = await closeRes.json()

      if (!result.success) {
        throw new Error(result.error || (appLang === 'en' ? "Failed to close period" : "فشل إقفال الفترة"))
      }

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
      toast({
        title: appLang === 'en' ? "Error" : "❌ خطأ",
        description: error.message || (appLang === 'en' ? "Failed to close period" : "فشل إقفال الفترة"),
        variant: "destructive",
      })
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

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
      <Sidebar />
      <main className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8 overflow-x-hidden">
        <div className="space-y-4 sm:space-y-6 max-w-full">
          <CompanyHeader />
          <div className="flex flex-col sm:flex-row sm:justify-between items-start gap-3">
            <div>
              <h1 className="text-xl sm:text-3xl font-bold text-gray-900 dark:text-white" suppressHydrationWarning>
                {(hydrated && appLang === 'en') ? 'Period Closing' : 'إقفال الفترات المحاسبية'}
              </h1>
              <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mt-1 sm:mt-2" suppressHydrationWarning>
                {(hydrated && appLang === 'en') ? 'Close accounting periods and lock transactions' : 'إقفال الفترات المحاسبية وقفل المعاملات'}
              </p>
            </div>
            <Button
              onClick={() => {
                const today = new Date()
                const firstDay = new Date(today.getFullYear(), today.getMonth(), 1)
                const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0)
                setSelectedPeriod({
                  start: firstDay.toISOString().split("T")[0],
                  end: lastDay.toISOString().split("T")[0],
                  name: `${firstDay.toLocaleDateString('ar-EG', { month: 'long', year: 'numeric' })}`,
                })
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
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-right p-2" suppressHydrationWarning>
                          {(hydrated && appLang === 'en') ? 'Period Name' : 'اسم الفترة'}
                        </th>
                        <th className="text-right p-2" suppressHydrationWarning>
                          {(hydrated && appLang === 'en') ? 'Start Date' : 'تاريخ البداية'}
                        </th>
                        <th className="text-right p-2" suppressHydrationWarning>
                          {(hydrated && appLang === 'en') ? 'End Date' : 'تاريخ النهاية'}
                        </th>
                        <th className="text-right p-2" suppressHydrationWarning>
                          {(hydrated && appLang === 'en') ? 'Status' : 'الحالة'}
                        </th>
                        <th className="text-right p-2" suppressHydrationWarning>
                          {(hydrated && appLang === 'en') ? 'Journal Entry' : 'القيد المحاسبي'}
                        </th>
                        <th className="text-right p-2" suppressHydrationWarning>
                          {(hydrated && appLang === 'en') ? 'Closed At' : 'تاريخ الإقفال'}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {periods.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="text-center p-4 text-gray-500" suppressHydrationWarning>
                            {(hydrated && appLang === 'en') ? 'No periods found' : 'لا توجد فترات'}
                          </td>
                        </tr>
                      ) : (
                        periods.map((period) => (
                          <tr key={period.id} className="border-b hover:bg-gray-50 dark:hover:bg-slate-900">
                            <td className="p-2">{period.period_name}</td>
                            <td className="p-2">{period.period_start}</td>
                            <td className="p-2">{period.period_end}</td>
                            <td className="p-2">{getStatusBadge(period.status, period.is_locked)}</td>
                            <td className="p-2">
                              {period.journal_entry_id ? (
                                <a
                                  href={`/journal-entries?entry_id=${period.journal_entry_id}`}
                                  className="text-blue-600 hover:underline"
                                >
                                  {period.journal_entry_id.substring(0, 8)}...
                                </a>
                              ) : (
                                <span className="text-gray-400">-</span>
                              )}
                            </td>
                            <td className="p-2">
                              {period.closed_at
                                ? new Date(period.closed_at).toLocaleDateString('ar-EG')
                                : "-"}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </main>

      {/* Dialog for Closing Period */}
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
              <Label suppressHydrationWarning>
                {(hydrated && appLang === 'en') ? 'Period Start' : 'تاريخ البداية'}
              </Label>
              <Input value={selectedPeriod?.start || ""} disabled />
            </div>
            <div>
              <Label suppressHydrationWarning>
                {(hydrated && appLang === 'en') ? 'Period End' : 'تاريخ النهاية'}
              </Label>
              <Input value={selectedPeriod?.end || ""} disabled />
            </div>
            <div>
              <Label suppressHydrationWarning>
                {(hydrated && appLang === 'en') ? 'Period Name (Optional)' : 'اسم الفترة (اختياري)'}
              </Label>
              <Input
                value={periodName}
                onChange={(e) => setPeriodName(e.target.value)}
                placeholder={appLang === 'en' ? 'e.g., January 2026' : 'مثال: يناير 2026'}
              />
            </div>
            <div>
              <Label suppressHydrationWarning>
                {(hydrated && appLang === 'en') ? 'Notes (Optional)' : 'ملاحظات (اختياري)'}
              </Label>
              <textarea
                className="w-full border rounded p-2"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder={appLang === 'en' ? 'Additional notes...' : 'ملاحظات إضافية...'}
              />
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
