"use client"

import { useState, useEffect } from "react"
import { Sidebar } from "@/components/sidebar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useSupabase } from "@/lib/supabase/hooks"
import { getActiveCompanyId } from "@/lib/company"
import { Download, ArrowRight, LogIn, LogOut, User, Calendar, Activity } from "lucide-react"
import { useRouter } from "next/navigation"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"

interface LoginActivity {
  id: string
  user_id: string
  user_email: string
  user_name: string
  action: "LOGIN" | "LOGOUT"
  ip_address?: string
  user_agent?: string
  created_at: string
}

interface Summary {
  total_logins: number
  total_logouts: number
  unique_users: number
  total_activities: number
}

interface UserOption {
  user_id: string
  user_email: string
  user_name: string
}

export default function LoginActivityPage() {
  const supabase = useSupabase()
  const router = useRouter()
  const [activities, setActivities] = useState<LoginActivity[]>([])
  const [summary, setSummary] = useState<Summary>({
    total_logins: 0,
    total_logouts: 0,
    unique_users: 0,
    total_activities: 0
  })
  const [users, setUsers] = useState<UserOption[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [appLang, setAppLang] = useState<'ar' | 'en'>('ar')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)

  // Helper function to format date
  const formatLocalDate = (date: Date): string => {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  const today = new Date()
  const defaultTo = formatLocalDate(today)
  const defaultFrom = formatLocalDate(new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000)) // 30 days ago

  const [fromDate, setFromDate] = useState<string>(defaultFrom)
  const [toDate, setToDate] = useState<string>(defaultTo)
  const [selectedUser, setSelectedUser] = useState<string>("")
  const [actionType, setActionType] = useState<'all' | 'LOGIN' | 'LOGOUT'>('all')

  useEffect(() => {
    const handler = () => {
      try {
        const v = localStorage.getItem('app_language') || 'ar'
        setAppLang(v === 'en' ? 'en' : 'ar')
      } catch {}
    }
    handler()
    window.addEventListener('app_language_changed', handler)
    return () => window.removeEventListener('app_language_changed', handler)
  }, [])

  const t = (en: string, ar: string) => appLang === 'en' ? en : ar
  const dateFmt = new Intl.DateTimeFormat(appLang === 'en' ? "en-EG" : "ar-EG", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  })

  useEffect(() => {
    if (fromDate && toDate) {
      loadData()
    }
  }, [fromDate, toDate, selectedUser, actionType, page])

  /**
   * ✅ تحميل بيانات نشاط الدخول والخروج
   * ⚠️ OPERATIONAL REPORT - تقرير تشغيلي (من audit_logs مباشرة)
   * راجع: docs/OPERATIONAL_REPORTS_GUIDE.md
   */
  const loadData = async () => {
    try {
      setIsLoading(true)
      const params = new URLSearchParams({
        from: fromDate,
        to: toDate,
        action_type: actionType,
        page: page.toString(),
        limit: "50"
      })
      if (selectedUser) params.set('user_id', selectedUser)

      const res = await fetch(`/api/login-activity?${params.toString()}`)
      if (!res.ok) {
        console.error("API Error:", res.status)
        setActivities([])
        setSummary({
          total_logins: 0,
          total_logouts: 0,
          unique_users: 0,
          total_activities: 0
        })
        return
      }

      const data = await res.json()
      setActivities(Array.isArray(data.data) ? data.data : [])
      setSummary(data.summary || {
        total_logins: 0,
        total_logouts: 0,
        unique_users: 0,
        total_activities: 0
      })
      setUsers(data.users || [])
      setTotalPages(data.pagination?.totalPages || 1)
    } catch (error) {
      console.error("Error loading login activity:", error)
      setActivities([])
      setSummary({
        total_logins: 0,
        total_logouts: 0,
        unique_users: 0,
        total_activities: 0
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleExportCsv = () => {
    const headers = ["user_name", "user_email", "action", "ip_address", "user_agent", "created_at"]
    const rowsCsv = activities.map((item) => [
      item.user_name,
      item.user_email,
      item.action,
      item.ip_address || "",
      item.user_agent || "",
      item.created_at
    ])
    const csv = [headers.join(","), ...rowsCsv.map((r) => r.join(","))].join("\n")
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const aEl = document.createElement("a")
    aEl.href = url
    aEl.download = `login-activity-${fromDate}-${toDate}.csv`
    aEl.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
      <Sidebar />
      <main className="flex-1 md:mr-64 p-4 md:p-8 pt-20 md:pt-8">
        <div className="space-y-6">
          {/* Header */}
          <Card className="bg-white dark:bg-slate-900 border-0 shadow-sm">
            <CardContent className="py-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl shadow-lg">
                    <Activity className="w-7 h-7 text-white" />
                  </div>
                  <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                      {t("Login Activity Report", "تقرير نشاط الدخول والخروج")}
                    </h1>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                      {t("Track user login and logout activities", "تتبع أنشطة دخول وخروج المستخدمين")}
                    </p>
                  </div>
                </div>
                <Button variant="outline" onClick={() => router.push("/reports")}>
                  <ArrowRight className="w-4 h-4 ml-2" />
                  {t("Back", "العودة")}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card className="dark:bg-gray-800">
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{t("Total Logins", "إجمالي عمليات الدخول")}</p>
                    <p className="text-2xl font-bold text-green-600">{summary.total_logins}</p>
                  </div>
                  <LogIn className="w-8 h-8 text-green-500" />
                </div>
              </CardContent>
            </Card>
            <Card className="dark:bg-gray-800">
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{t("Total Logouts", "إجمالي عمليات الخروج")}</p>
                    <p className="text-2xl font-bold text-red-600">{summary.total_logouts}</p>
                  </div>
                  <LogOut className="w-8 h-8 text-red-500" />
                </div>
              </CardContent>
            </Card>
            <Card className="dark:bg-gray-800">
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{t("Unique Users", "المستخدمون الفريدون")}</p>
                    <p className="text-2xl font-bold">{summary.unique_users}</p>
                  </div>
                  <User className="w-8 h-8 text-blue-500" />
                </div>
              </CardContent>
            </Card>
            <Card className="dark:bg-gray-800">
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{t("Total Activities", "إجمالي الأنشطة")}</p>
                    <p className="text-2xl font-bold">{summary.total_activities}</p>
                  </div>
                  <Activity className="w-8 h-8 text-purple-500" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Filters */}
          <Card className="dark:bg-gray-800">
            <CardContent className="py-4">
              <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                <div>
                  <Label className="text-xs">{t("From Date", "من تاريخ")}</Label>
                  <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="w-full" />
                </div>
                <div>
                  <Label className="text-xs">{t("To Date", "إلى تاريخ")}</Label>
                  <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="w-full" />
                </div>
                <div>
                  <Label className="text-xs">{t("Action Type", "نوع العملية")}</Label>
                  <Select value={actionType} onValueChange={(v) => setActionType(v as 'all' | 'LOGIN' | 'LOGOUT')}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t("All", "الكل")}</SelectItem>
                      <SelectItem value="LOGIN">{t("Login", "دخول")}</SelectItem>
                      <SelectItem value="LOGOUT">{t("Logout", "خروج")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">{t("User", "المستخدم")}</Label>
                  <Select value={selectedUser} onValueChange={setSelectedUser}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder={t("All Users", "جميع المستخدمين")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">{t("All Users", "جميع المستخدمين")}</SelectItem>
                      {users.map((u) => (
                        <SelectItem key={u.user_id} value={u.user_id}>{u.user_name} ({u.user_email})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-end gap-2">
                  <Button onClick={loadData} className="flex-1">
                    {t("Load", "تحميل")}
                  </Button>
                  <Button variant="outline" onClick={handleExportCsv}>
                    <Download className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Table */}
          <Card className="dark:bg-gray-800">
            <CardHeader>
              <CardTitle>{t("Login Activity", "نشاط الدخول والخروج")} ({activities.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="text-center py-8 text-gray-500">{t("Loading...", "جاري التحميل...")}</div>
              ) : activities.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <Activity className="w-12 h-12 mx-auto text-gray-300 mb-4" />
                  <p>{t("No login activity found", "لا توجد أنشطة دخول/خروج")}</p>
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b dark:border-gray-700">
                          <th className="text-right py-3 px-2">{t("User", "المستخدم")}</th>
                          <th className="text-right py-3 px-2">{t("Action", "العملية")}</th>
                          <th className="text-right py-3 px-2">{t("IP Address", "عنوان IP")}</th>
                          <th className="text-right py-3 px-2">{t("User Agent", "متصفح المستخدم")}</th>
                          <th className="text-right py-3 px-2">{t("Date & Time", "التاريخ والوقت")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {activities.map((item, idx) => (
                          <tr key={idx} className="border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-slate-700">
                            <td className="py-3 px-2">
                              <div>
                                <div className="font-medium">{item.user_name}</div>
                                <div className="text-xs text-gray-500">{item.user_email}</div>
                              </div>
                            </td>
                            <td className="py-3 px-2">
                              {item.action === "LOGIN" ? (
                                <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">
                                  <LogIn className="w-3 h-3 mr-1" />
                                  {t("Login", "دخول")}
                                </Badge>
                              ) : (
                                <Badge className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300">
                                  <LogOut className="w-3 h-3 mr-1" />
                                  {t("Logout", "خروج")}
                                </Badge>
                              )}
                            </td>
                            <td className="py-3 px-2 text-xs font-mono">{item.ip_address || "-"}</td>
                            <td className="py-3 px-2 text-xs max-w-xs truncate" title={item.user_agent || ""}>
                              {item.user_agent || "-"}
                            </td>
                            <td className="py-3 px-2">{dateFmt.format(new Date(item.created_at))}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {/* Pagination */}
                  {totalPages > 1 && (
                    <div className="flex items-center justify-between mt-4 pt-4 border-t dark:border-gray-700">
                      <div className="text-sm text-gray-500">
                        {t(`Page ${page} of ${totalPages}`, `صفحة ${page} من ${totalPages}`)}
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setPage(p => Math.max(1, p - 1))}
                          disabled={page === 1}
                        >
                          {t("Previous", "السابق")}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                          disabled={page === totalPages}
                        >
                          {t("Next", "التالي")}
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}
