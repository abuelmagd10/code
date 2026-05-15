"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Factory, ClipboardList, CheckCircle2, Clock, AlertCircle, ArrowRight } from "lucide-react"
import Link from "next/link"

interface Props {
  companyId: string
  appLang: "ar" | "en"
  branchId?: string | null
}

interface MfgStats {
  total: number
  draft: number
  released: number
  inProgress: number
  completed: number
  cancelled: number
  pendingIssues: number
  pendingReceives: number
}

export default function DashboardManufacturingStats({ companyId, appLang, branchId }: Props) {
  const supabase = createClient()
  const [stats, setStats] = useState<MfgStats | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const t = (en: string, ar: string) => appLang === "en" ? en : ar

  useEffect(() => {
    if (!companyId) return
    const load = async () => {
      setIsLoading(true)
      try {
        // أوامر الإنتاج
        let q = supabase
          .from("manufacturing_production_orders")
          .select("status")
          .eq("company_id", companyId)
          .limit(1000)
        if (branchId) q = q.eq("branch_id", branchId)
        const { data: orders } = await q

        // طلبات صرف مواد معلقة
        let qIssue = supabase
          .from("manufacturing_material_issue_approvals")
          .select("id", { count: "exact", head: true })
          .eq("company_id", companyId)
          .eq("status", "pending")
        if (branchId) qIssue = qIssue.eq("branch_id", branchId)
        const { count: issueCount } = await qIssue

        // طلبات استلام منتج معلقة
        let qRecv = supabase
          .from("manufacturing_product_receive_approvals")
          .select("id", { count: "exact", head: true })
          .eq("company_id", companyId)
          .eq("status", "pending")
        if (branchId) qRecv = qRecv.eq("branch_id", branchId)
        const { count: recvCount } = await qRecv

        const orderList = (orders || []) as { status: string }[]
        const s: MfgStats = {
          total:          orderList.length,
          draft:          orderList.filter(o => o.status === "draft").length,
          released:       orderList.filter(o => o.status === "released").length,
          inProgress:     orderList.filter(o => o.status === "in_progress").length,
          completed:      orderList.filter(o => o.status === "completed" || o.status === "closed").length,
          cancelled:      orderList.filter(o => o.status === "cancelled").length,
          pendingIssues:  issueCount ?? 0,
          pendingReceives: recvCount ?? 0,
        }
        setStats(s)
      } finally { setIsLoading(false) }
    }
    load()
  }, [companyId, branchId])

  if (isLoading) return (
    <Card className="animate-pulse">
      <CardContent className="py-6">
        <div className="h-4 bg-muted rounded w-1/3 mb-4" />
        <div className="grid grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => <div key={i} className="h-16 bg-muted rounded" />)}
        </div>
      </CardContent>
    </Card>
  )

  if (!stats) return null

  const hasPendingApprovals = stats.pendingIssues > 0 || stats.pendingReceives > 0

  return (
    <Card className="border border-orange-200 dark:border-orange-900/40">
      <CardHeader className="pb-2 pt-4 px-5">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Factory className="w-4 h-4 text-orange-500" />
            {t("Manufacturing Overview", "نظرة عامة على التصنيع")}
            {hasPendingApprovals && (
              <span className="inline-flex items-center gap-1 text-xs bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300 px-2 py-0.5 rounded-full font-medium">
                <AlertCircle className="w-3 h-3" />
                {stats.pendingIssues + stats.pendingReceives} {t("pending", "معلق")}
              </span>
            )}
          </CardTitle>
          <Link href="/reports/manufacturing/production-orders" className="text-xs text-orange-600 hover:underline flex items-center gap-1">
            {t("Full report", "التقرير الكامل")} <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
      </CardHeader>
      <CardContent className="px-5 pb-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
          {/* In Progress */}
          <div className="bg-yellow-50 dark:bg-yellow-900/20 rounded-lg p-3 text-center">
            <Clock className="w-4 h-4 text-yellow-600 mx-auto mb-1" />
            <p className="text-2xl font-bold text-yellow-700 dark:text-yellow-400">{stats.inProgress}</p>
            <p className="text-xs text-yellow-600 dark:text-yellow-500">{t("In Progress", "جارٍ التنفيذ")}</p>
          </div>
          {/* Released */}
          <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 text-center">
            <ClipboardList className="w-4 h-4 text-blue-600 mx-auto mb-1" />
            <p className="text-2xl font-bold text-blue-700 dark:text-blue-400">{stats.released}</p>
            <p className="text-xs text-blue-600 dark:text-blue-500">{t("Released", "مُصدَر")}</p>
          </div>
          {/* Completed */}
          <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-3 text-center">
            <CheckCircle2 className="w-4 h-4 text-green-600 mx-auto mb-1" />
            <p className="text-2xl font-bold text-green-700 dark:text-green-400">{stats.completed}</p>
            <p className="text-xs text-green-600 dark:text-green-500">{t("Completed", "مكتمل")}</p>
          </div>
          {/* Total */}
          <div className="bg-orange-50 dark:bg-orange-900/20 rounded-lg p-3 text-center">
            <Factory className="w-4 h-4 text-orange-600 mx-auto mb-1" />
            <p className="text-2xl font-bold text-orange-700 dark:text-orange-400">{stats.total}</p>
            <p className="text-xs text-orange-600 dark:text-orange-500">{t("Total Orders", "إجمالي الأوامر")}</p>
          </div>
        </div>

        {/* Pending Approvals */}
        {hasPendingApprovals && (
          <div className="grid grid-cols-2 gap-2">
            {stats.pendingIssues > 0 && (
              <Link href="/manufacturing/material-issue">
                <div className="flex items-center gap-2 p-2 rounded-lg border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20 hover:shadow-sm transition-shadow cursor-pointer">
                  <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
                  <div>
                    <p className="text-xs font-semibold text-red-700 dark:text-red-300">{stats.pendingIssues} {t("Issue Approvals", "موافقات صرف")}</p>
                    <p className="text-[10px] text-red-500">{t("Waiting approval", "تنتظر الموافقة")}</p>
                  </div>
                </div>
              </Link>
            )}
            {stats.pendingReceives > 0 && (
              <Link href="/manufacturing/product-receive">
                <div className="flex items-center gap-2 p-2 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20 hover:shadow-sm transition-shadow cursor-pointer">
                  <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />
                  <div>
                    <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">{stats.pendingReceives} {t("Receive Approvals", "موافقات استلام")}</p>
                    <p className="text-[10px] text-amber-500">{t("Waiting approval", "تنتظر الموافقة")}</p>
                  </div>
                </div>
              </Link>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
