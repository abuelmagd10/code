"use client"

import { useEffect, useState, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Banknote, Calendar, Loader2, RefreshCw, AlertTriangle } from "lucide-react"
import { currencySymbols } from "./DashboardAmounts"

interface DailyIncomeRow {
  branchId: string | null
  branchName: string | null
  cashIncome: number
  bankIncome: number
  totalIncome: number
}

interface DashboardDailyIncomeCardProps {
  companyId: string
  defaultCurrency: string
  appLang: string
  canSwitchScope: boolean
  canSeeAllBranches: boolean
  userBranchId: string | null
  userBranchName?: string | null
  allBranches?: { id: string; name: string }[]
  userName?: string | null
}

export default function DashboardDailyIncomeCard({
  companyId,
  defaultCurrency,
  appLang,
  canSwitchScope,
  canSeeAllBranches,
  userBranchId,
  userBranchName,
  allBranches = [],
  userName
}: DashboardDailyIncomeCardProps) {
  const today = new Date().toISOString().slice(0, 10)
  const yesterday = new Date(Date.now() - 864e5).toISOString().slice(0, 10)
  const [selectedDate, setSelectedDate] = useState(today)
  const [data, setData] = useState<DailyIncomeRow[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchedAt, setFetchedAt] = useState<string | null>(null)
  const [scopeLabel, setScopeLabel] = useState<string>("")
  // 🔐 مزامنة مع Global Scope Switcher: الافتراضي = userBranchId إذا وجد
  const [branchIdParam, setBranchIdParam] = useState<string | null>(userBranchId || null)
  const [alertLimits, setAlertLimits] = useState<{ min_daily_cash?: number; max_daily_expense?: number } | null>(null)

  // 🔁 مزامنة مع Global Scope: عند تغيير الـ Scope من page.tsx يتبعه هذا الـ Widget تلقائياً
  useEffect(() => {
    // غير المميزين: مُقيَّدون بفرعهم دائماً (الـ API يُطبِّق ذلك)
    if (!canSeeAllBranches) {
      setBranchIdParam(userBranchId || null)
      return
    }
    // المميزون: عند اختيار فرع في الـ Scope Switcher الرئيسي → نُزامن
    // لكن نسمح لهم بالتغيير يدوياً داخل البطاقة (لا نُعيَّد التغيير)
    setBranchIdParam(userBranchId || null)
  }, [userBranchId, canSeeAllBranches])

  const fetchData = useCallback(async () => {
    if (!companyId) return
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.set("date", selectedDate)
      if (canSeeAllBranches && branchIdParam) params.set("branchId", branchIdParam)
      const res = await fetch(`/api/dashboard-daily-income?${params}`)
      if (!res.ok) throw new Error("Failed to fetch")
      const json = await res.json()
      setData(json.data ?? [])
      setAlertLimits(json.alertLimits ?? null)
      setFetchedAt(json.fetchedAt ?? new Date().toISOString())
      const scope = json.scope === "company" ? (appLang === "en" ? "All branches" : "كل الفروع") : (json.branchId ? (userBranchName || json.branchId) : (appLang === "en" ? "Branch" : "الفرع"))
      setScopeLabel(scope)
    } catch {
      setData([])
    } finally {
      setLoading(false)
    }
  }, [companyId, selectedDate, canSeeAllBranches, branchIdParam, appLang, userBranchName])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const currency = currencySymbols[defaultCurrency] || defaultCurrency
  const formatNum = (n: number) => Math.round(n * 100) / 100
  const isAr = appLang !== "en"

  return (
    <Card className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800">
      <CardHeader className="border-b border-gray-100 dark:border-slate-800 pb-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg">
              <Banknote className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <CardTitle className="text-base sm:text-lg">
              {isAr ? "الدخل اليومي (نقد + بنك)" : "Daily Income (Cash + Bank)"}
            </CardTitle>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => { setSelectedDate(today); setBranchIdParam(null) }}
              className={selectedDate === today ? "bg-emerald-50 dark:bg-emerald-900/20 border-emerald-300" : ""}
            >
              {isAr ? "اليوم" : "Today"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => { setSelectedDate(yesterday); setBranchIdParam(null) }}
              className={selectedDate === yesterday ? "bg-emerald-50 dark:bg-emerald-900/20 border-emerald-300" : ""}
            >
              {isAr ? "أمس" : "Yesterday"}
            </Button>
            <div className="flex items-center gap-1">
              <Calendar className="w-4 h-4 text-gray-500" />
              <Input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value.slice(0, 10))}
                className="w-[140px]"
              />
            </div>
            <Button variant="ghost" size="sm" onClick={fetchData} disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            </Button>
          </div>
        </div>
        {canSeeAllBranches && allBranches.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            <Button
              variant={!branchIdParam ? "secondary" : "outline"}
              size="sm"
              onClick={() => setBranchIdParam(null)}
            >
              {isAr ? "كل الفروع" : "All branches"}
            </Button>
            {allBranches.map((b) => (
              <Button
                key={b.id}
                variant={branchIdParam === b.id ? "secondary" : "outline"}
                size="sm"
                onClick={() => setBranchIdParam(b.id)}
              >
                {b.name}
              </Button>
            ))}
          </div>
        )}
      </CardHeader>
      <CardContent className="pt-4">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
          </div>
        ) : data.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400 py-4 text-center">
            {isAr ? "لا توجد حركات نقد/بنك لهذا اليوم." : "No Cash/Bank movements for this day."}
          </p>
        ) : (
          <>
            {/* KPI Alerts: min_daily_cash / max_daily_expense */}
            {alertLimits && data.length > 0 && (() => {
              const total = data.reduce((s, r) => s + r.totalIncome, 0)
              const alerts: string[] = []
              if (alertLimits.min_daily_cash != null && total < alertLimits.min_daily_cash) {
                alerts.push(isAr ? `الدخل اليومي (${formatNum(total)}) أقل من الحد الأدنى (${formatNum(alertLimits.min_daily_cash)})` : `Daily income (${formatNum(total)}) is below minimum (${formatNum(alertLimits.min_daily_cash)})`)
              }
              if (alertLimits.max_daily_expense != null && total < 0 && Math.abs(total) > alertLimits.max_daily_expense) {
                alerts.push(isAr ? `صافي المصروف اليومي (${formatNum(Math.abs(total))}) يتجاوز الحد الأقصى (${formatNum(alertLimits.max_daily_expense)})` : `Daily net expense (${formatNum(Math.abs(total))}) exceeds maximum (${formatNum(alertLimits.max_daily_expense)})`)
              }
              if (alerts.length === 0) return null
              return (
                <div className="mb-3 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 flex items-start gap-2">
                  <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-amber-800 dark:text-amber-200">
                    {alerts.map((a, i) => <p key={i}>{a}</p>)}
                  </div>
                </div>
              )
            })()}

            {/* KPI summary when multiple branches */}
            {data.length > 1 && (
              <div className="flex flex-wrap gap-4 mb-3 p-2 rounded-lg bg-gray-50 dark:bg-slate-800/50 text-sm">
                <span className="font-medium">
                  {isAr ? "الإجمالي اليوم:" : "Total today:"} {formatNum(data.reduce((s, r) => s + (r.totalIncome ?? r.cashIncome + r.bankIncome), 0)).toLocaleString("en-US")} {currency}
                </span>
                {data.length > 0 && (() => {
                  const total = (r: DailyIncomeRow) => r.totalIncome ?? r.cashIncome + r.bankIncome
                  const top = data.reduce((best, r) => (total(r) > total(best) ? r : best), data[0])
                  return (
                    <span className="text-gray-600 dark:text-gray-400">
                      {isAr ? "أعلى فرع:" : "Top branch:"} {top.branchName ?? (isAr ? "—" : "—")} ({formatNum(total(top)).toLocaleString("en-US")} {currency})
                    </span>
                  )
                })()}
              </div>
            )}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-slate-700">
                    <th className="text-left py-2 font-medium text-gray-700 dark:text-gray-300">
                      {isAr ? "الفرع" : "Branch"}
                    </th>
                    <th className="text-right py-2 font-medium text-gray-700 dark:text-gray-300">
                      {isAr ? "نقد بالخزنة" : "Cash in Treasury"}
                    </th>
                    <th className="text-right py-2 font-medium text-gray-700 dark:text-gray-300">
                      {isAr ? "إيداعات بنكية" : "Bank Deposits"}
                    </th>
                    <th className="text-right py-2 font-medium text-gray-700 dark:text-gray-300">
                      {isAr ? "الإجمالي" : "Total"}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((row) => {
                    const cash = row.cashIncome ?? 0
                    const bank = row.bankIncome ?? 0
                    const total = row.totalIncome ?? cash + bank
                    return (
                      <tr key={row.branchId ?? "company"} className="border-b border-gray-100 dark:border-slate-800">
                        <td className="py-2 text-gray-900 dark:text-gray-100">
                          {row.branchName ?? (isAr ? "الشركة (بدون فرع)" : "Company (no branch)")}
                        </td>
                        <td className="py-2 text-right text-gray-700 dark:text-gray-300">
                          {formatNum(cash).toLocaleString("en-US")} {currency}
                        </td>
                        <td className="py-2 text-right text-gray-700 dark:text-gray-300">
                          {formatNum(bank).toLocaleString("en-US")} {currency}
                        </td>
                        <td className="py-2 text-right font-medium">
                          {formatNum(total).toLocaleString("en-US")} {currency}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                {data.length > 1 && (
                  <tfoot>
                    <tr className="border-t-2 border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/50 font-medium">
                      <td className="py-2 text-gray-900 dark:text-gray-100">
                        {isAr ? "الإجمالي الكلي" : "Grand Total"}
                      </td>
                      <td className="py-2 text-right">
                        {formatNum(data.reduce((s, r) => s + (r.cashIncome ?? 0), 0)).toLocaleString("en-US")} {currency}
                      </td>
                      <td className="py-2 text-right">
                        {formatNum(data.reduce((s, r) => s + (r.bankIncome ?? 0), 0)).toLocaleString("en-US")} {currency}
                      </td>
                      <td className="py-2 text-right">
                        {formatNum(data.reduce((s, r) => s + (r.totalIncome ?? (r.cashIncome ?? 0) + (r.bankIncome ?? 0)), 0)).toLocaleString("en-US")} {currency}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </>
        )}

        {/* Audit trail */}
        <div className="mt-4 pt-3 border-t border-gray-100 dark:border-slate-800 text-xs text-gray-500 dark:text-gray-400 space-y-1">
          <p>
            {isAr ? "التاريخ المعروض:" : "Date shown:"} <span className="font-medium">{selectedDate}</span>
            {scopeLabel && ` · ${isAr ? "النطاق:" : "Scope:"} ${scopeLabel}`}
          </p>
          {fetchedAt && (
            <p>
              {isAr ? "آخر تحديث:" : "Last updated:"} {new Date(fetchedAt).toLocaleString(isAr ? "ar-EG" : "en-US")}
            </p>
          )}
          {userName && (
            <p>{isAr ? "عرض البيانات للمستخدم:" : "Data fetched by:"} {userName}</p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
