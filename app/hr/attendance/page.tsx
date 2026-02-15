"use client"
import { Sidebar } from "@/components/sidebar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { useSupabase } from "@/lib/supabase/hooks"
import { useEffect, useState, useMemo } from "react" // Added useMemo
import { useToast } from "@/hooks/use-toast"
import { getActiveCompanyId } from "@/lib/company"
import { format } from "date-fns" // For date formatting
import { PageHeaderList } from "@/components/PageHeader" // Standard Header
import { DataTable, type DataTableColumn } from "@/components/DataTable" // Standard Table
import { FilterContainer } from "@/components/ui/filter-container" // Standard Filters
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog" // For popup form
import { Plus, Filter, RefreshCw, Calendar as CalendarIcon } from "lucide-react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { StatusBadge } from "@/components/DataTableFormatters"

export default function AttendancePage() {
  const supabase = useSupabase()
  const { toast } = useToast()
  const [appLang, setAppLang] = useState<'ar' | 'en'>('ar')
  const [companyId, setCompanyId] = useState<string>("")
  const [employees, setEmployees] = useState<any[]>([])
  const [attendanceRecords, setAttendanceRecords] = useState<any[]>([]) // List of records
  const [loading, setLoading] = useState(false)
  const [dataLoading, setDataLoading] = useState(true) // Loading state for table

  // Filter States
  const [filterStartDate, setFilterStartDate] = useState<string>(new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10)) // First day of current month
  const [filterEndDate, setFilterEndDate] = useState<string>(new Date().toISOString().slice(0, 10)) // Today
  const [filterEmployeeId, setFilterEmployeeId] = useState<string>("all")

  // Dialog & Form States
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [recordForm, setRecordForm] = useState({
    employeeId: "",
    dayDate: new Date().toISOString().slice(0, 10),
    status: "present"
  })

  // Language Setup
  useEffect(() => {
    const handler = () => {
      try {
        const v = localStorage.getItem('app_language') || 'ar'
        setAppLang(v === 'en' ? 'en' : 'ar')
      } catch { }
    }
    handler()
    window.addEventListener('app_language_changed', handler)
    return () => window.removeEventListener('app_language_changed', handler)
  }, [])
  const t = (en: string, ar: string) => appLang === 'en' ? en : ar

  // Initial Load
  useEffect(() => {
    (async () => {
      const cid = await getActiveCompanyId(supabase);
      if (cid) {
        setCompanyId(cid);
        await Promise.all([
          loadEmployees(cid),
          loadAttendance(cid)
        ])
      }
    })()
  }, [supabase])

  // Reload when filters change
  useEffect(() => {
    if (companyId) {
      loadAttendance(companyId)
    }
  }, [filterStartDate, filterEndDate, filterEmployeeId])

  const loadEmployees = async (cid: string) => {
    try {
      const res = await fetch(`/api/hr/employees?companyId=${encodeURIComponent(cid)}`);
      const data = res.ok ? await res.json() : [];
      setEmployees(Array.isArray(data) ? data : [])
    } catch { setEmployees([]) }
  }

  const loadAttendance = async (cid: string) => {
    setDataLoading(true)
    try {
      const queryParams = new URLSearchParams({
        companyId: cid,
        from: filterStartDate,
        to: filterEndDate
      })
      if (filterEmployeeId && filterEmployeeId !== 'all') {
        queryParams.append('employeeId', filterEmployeeId)
      }

      const res = await fetch(`/api/hr/attendance?${queryParams.toString()}`)
      const data = res.ok ? await res.json() : []
      setAttendanceRecords(Array.isArray(data) ? data : [])
    } catch (e) {
      console.error(e)
      setAttendanceRecords([])
    } finally {
      setDataLoading(false)
    }
  }

  const recordAttendance = async () => {
    if (!companyId || !recordForm.employeeId || !recordForm.dayDate) return
    setLoading(true)
    try {
      const res = await fetch('/api/hr/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId,
          employeeId: recordForm.employeeId,
          dayDate: recordForm.dayDate,
          status: recordForm.status
        })
      })

      if (res.ok) {
        toast({ title: t('Attendance recorded', 'تم تسجيل الحضور') })
        setIsDialogOpen(false)
        // Reset form but keep date
        setRecordForm(prev => ({ ...prev, employeeId: "", status: "present" }))
        // Reload list
        loadAttendance(companyId)
      } else {
        const j = await res.json();
        toast({ title: t('Error', 'خطأ'), description: j?.error || t('Failed to record', 'فشل التسجيل'), variant: "destructive" })
      }
    } catch {
      toast({ title: t('Network error', 'خطأ الشبكة'), variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }

  // Calculate active filters count
  const activeDetailFiltersCount = [
    filterEmployeeId !== 'all',
    filterStartDate !== new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10),
    filterEndDate !== new Date().toISOString().slice(0, 10)
  ].filter(Boolean).length

  // Clear filters handler
  const clearFilters = () => {
    setFilterEmployeeId("all")
    setFilterStartDate(new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10))
    setFilterEndDate(new Date().toISOString().slice(0, 10))
  }

  // --- Table Configuration ---
  const columns: DataTableColumn[] = [
    {
      key: "day_date",
      header: t("Date", "التاريخ"),
      type: "date",
      width: "w-[150px]",
      sortable: true
    },
    {
      key: "employee_name", // We need to map this manually since API might return raw ID
      header: t("Employee", "الموظف"),
      type: "text",
      format: (val, row) => {
        // Try to find employee name from loaded list if not present in row
        const emp = employees.find(e => e.id === row.employee_id)
        return emp ? emp.full_name : (row.employees?.full_name || row.employee_id)
      }
    },
    {
      key: "status",
      header: t("Status", "الحالة"),
      type: "custom",
      align: "center",
      width: "w-[120px]",
      format: (val) => <StatusBadge status={val} lang={appLang} />
    },
    {
      key: "check_in",
      header: t("Check In", "دخول"),
      type: "text",
      align: "center",
      format: (val) => val ? val.slice(0, 5) : '-'
    },
    {
      key: "check_out",
      header: t("Check Out", "خروج"),
      type: "text",
      align: "center",
      format: (val) => val ? val.slice(0, 5) : '-'
    },
    {
      key: "notes",
      header: t("Notes", "ملاحظات"),
      type: "text",
      hidden: "md"
    }
  ]

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
      <Sidebar />
      <main className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8 overflow-x-hidden">
        <div className="space-y-4 sm:space-y-6 max-w-full">

          {/* Header */}
          <PageHeaderList
            title={t('Attendance', 'الحضور والانصراف')}
            description={t('Track and record employee attendance', 'تتبع وتسجيل حضور الموظفين')}
            icon={CalendarIcon}
            additionalActions={[{
              label: t('Record Attendance', 'تسجيل حضور'),
              icon: Plus,
              onClick: () => setIsDialogOpen(true),
              variant: "default",
              className: "bg-blue-600 hover:bg-blue-700 text-white"
            }]}
          />

          {/* Filters */}
          <FilterContainer
            title={t('Search & Filter', 'بحث وتصفية')}
            activeCount={activeDetailFiltersCount}
            onClear={clearFilters}
            className="mb-4"
          >
            <div className="flex flex-wrap gap-3 items-end">
              <div className="w-full sm:w-auto">
                <Label className="text-xs mb-1.5 block">{t('From Date', 'من تاريخ')}</Label>
                <Input
                  type="date"
                  value={filterStartDate}
                  onChange={(e) => setFilterStartDate(e.target.value)}
                  className="w-full sm:w-[150px] h-9"
                />
              </div>
              <div className="w-full sm:w-auto">
                <Label className="text-xs mb-1.5 block">{t('To Date', 'إلى تاريخ')}</Label>
                <Input
                  type="date"
                  value={filterEndDate}
                  onChange={(e) => setFilterEndDate(e.target.value)}
                  className="w-full sm:w-[150px] h-9"
                />
              </div>
              <div className="w-full sm:w-[200px]">
                <Label className="text-xs mb-1.5 block">{t('Employee', 'الموظف')}</Label>
                <select
                  className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  value={filterEmployeeId}
                  onChange={(e) => setFilterEmployeeId(e.target.value)}
                >
                  <option value="all">{t('All Employees', 'جميع الموظفين')}</option>
                  {employees.map((e) => (<option key={e.id} value={e.id}>{e.full_name}</option>))}
                </select>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="h-9 gap-2"
                onClick={() => { companyId && loadAttendance(companyId) }}
              >
                <RefreshCw className="h-3.5 w-3.5" />
                {t('Refresh', 'تحديث')}
              </Button>
            </div>
          </FilterContainer>

          {/* Data Table */}
          <Card>
            <CardContent className="p-0">
              {dataLoading ? (
                <div className="p-8 text-center text-gray-500">{t('Loading...', 'جاري التحميل...')}</div>
              ) : (
                <DataTable
                  columns={columns}
                  data={attendanceRecords}
                  keyField="id"
                  lang={appLang}
                  emptyMessage={t('No attendance records found', 'لا توجد سجلات حضور')}
                />
              )}
            </CardContent>
          </Card>
        </div>
      </main>

      {/* Record Attendance Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>{t('Record Attendance', 'تسجيل حضور')}</DialogTitle>
            <DialogDescription>
              {t('Select employee and status to record attendance.', 'اختر الموظف والحالة لتسجيل الحضور.')}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>{t('Employee', 'الموظف')}</Label>
              <Select
                value={recordForm.employeeId}
                onValueChange={(val) => setRecordForm({ ...recordForm, employeeId: val })}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('Select Employee', 'اختر الموظف')} />
                </SelectTrigger>
                <SelectContent>
                  {employees.map((e) => (
                    <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label>{t('Date', 'التاريخ')}</Label>
              <Input
                type="date"
                value={recordForm.dayDate}
                onChange={(e) => setRecordForm({ ...recordForm, dayDate: e.target.value })}
              />
            </div>

            <div className="grid gap-2">
              <Label>{t('Status', 'الحالة')}</Label>
              <Select
                value={recordForm.status}
                onValueChange={(val) => setRecordForm({ ...recordForm, status: val })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="present">{t('Present', 'حضور')}</SelectItem>
                  <SelectItem value="absent">{t('Absent', 'غياب')}</SelectItem>
                  <SelectItem value="leave">{t('Leave', 'إجازة')}</SelectItem>
                  <SelectItem value="sick">{t('Sick', 'مرضية')}</SelectItem>
                  <SelectItem value="late">{t('Late', 'تأخير')}</SelectItem>
                  <SelectItem value="early_leave">{t('Early Leave', 'انصراف مبكر')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>{t('Cancel', 'إلغاء')}</Button>
            <Button disabled={loading} onClick={recordAttendance}>{t('Record', 'تسجيل')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
