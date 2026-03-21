"use client"

import { useEffect, useState } from "react"
import { Sidebar } from "@/components/sidebar"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useSupabase } from "@/lib/supabase/hooks"
import { useRouter, useParams } from "next/navigation"
import {
  ArrowRight, ArrowLeft, CheckCircle2, XCircle, Clock,
  AlertTriangle, Package, FileText, Pencil, RotateCcw,
  DollarSign, User, Calendar, Warehouse, Building2, Hash
} from "lucide-react"
import { getActiveCompanyId } from "@/lib/company"

const PRIVILEGED_ROLES = ['owner', 'admin', 'general_manager']

type ReturnDetail = {
  id: string
  return_number: string
  return_date: string
  status: string
  workflow_status: string
  reason: string
  notes: string | null
  settlement_method: string
  subtotal: number
  tax_amount: number
  total_amount: number
  original_currency: string
  is_locked: boolean
  created_by: string | null
  approved_by: string | null
  approved_at: string | null
  rejected_by: string | null
  rejected_at: string | null
  rejection_reason: string | null
  warehouse_rejected_by: string | null
  warehouse_rejected_at: string | null
  warehouse_rejection_reason: string | null
  suppliers?: { name: string } | null
  bills?: { id: string; bill_number: string } | null
  branches?: { name: string } | null
  warehouses?: { name: string } | null
  purchase_return_items?: Array<{
    id: string
    product_id: string | null
    bill_item_id: string | null
    description: string | null
    quantity: number
    unit_price: number
    tax_rate: number
    discount_percent: number
    line_total: number
    products?: { name: string } | null
  }>
}

const WORKFLOW_BADGES: Record<string, { ar: string; en: string; cls: string }> = {
  pending_admin_approval: { ar: 'بانتظار اعتماد الإدارة', en: 'Pending Admin Approval', cls: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300' },
  pending_warehouse:      { ar: 'بانتظار اعتماد المخزن',  en: 'Pending Warehouse',      cls: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300' },
  completed:              { ar: 'مكتمل',                   en: 'Completed',              cls: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' },
  confirmed:              { ar: 'مؤكد',                    en: 'Confirmed',              cls: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' },
  rejected:               { ar: 'مرفوض إدارياً',           en: 'Admin Rejected',         cls: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300' },
  warehouse_rejected:     { ar: 'مرفوض من المخزن',         en: 'Warehouse Rejected',     cls: 'bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300' },
  pending_approval:       { ar: 'بانتظار الاعتماد',        en: 'Pending Approval',       cls: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300' },
}

const SETTLEMENT_LABELS: Record<string, { ar: string; en: string }> = {
  debit_note:    { ar: 'إشعار خصم',    en: 'Debit Note' },
  cash:          { ar: 'نقداً',         en: 'Cash' },
  bank_transfer: { ar: 'تحويل بنكي',   en: 'Bank Transfer' },
  credit:        { ar: 'رصيد دائن',    en: 'Credit' },
}

export default function PurchaseReturnDetailPage() {
  const supabase  = useSupabase()
  const router    = useRouter()
  const params    = useParams()
  const returnId  = params.id as string

  const [pr, setPr]           = useState<ReturnDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [currentUserRole, setCurrentUserRole] = useState<string>('viewer')
  const [currentUserId, setCurrentUserId]     = useState<string | null>(null)
  const [appLang, setAppLang] = useState<'ar' | 'en'>('ar')

  useEffect(() => {
    try { setAppLang((localStorage.getItem('app_language') || 'ar') === 'en' ? 'en' : 'ar') } catch {}
  }, [])

  useEffect(() => {
    ;(async () => {
      const companyId = await getActiveCompanyId(supabase)
      if (!companyId) return

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setCurrentUserId(user.id)

      const [{ data: companyData }, { data: memberData }] = await Promise.all([
        supabase.from('companies').select('user_id').eq('id', companyId).single(),
        supabase.from('company_members').select('role').eq('company_id', companyId).eq('user_id', user.id).single(),
      ])
      setCurrentUserRole(companyData?.user_id === user.id ? 'owner' : (memberData?.role || 'viewer'))

      const { data } = await supabase
        .from('purchase_returns')
        .select(`
          id, return_number, return_date, status, workflow_status,
          reason, notes, settlement_method,
          subtotal, tax_amount, total_amount, original_currency,
          is_locked, created_by, approved_by, approved_at,
          rejected_by, rejected_at, rejection_reason,
          warehouse_rejected_by, warehouse_rejected_at, warehouse_rejection_reason,
          suppliers(name),
          bills(id, bill_number),
          branches(name),
          warehouses(name),
          purchase_return_items(
            id, product_id, bill_item_id, description, quantity,
            unit_price, tax_rate, discount_percent, line_total,
            products(name)
          )
        `)
        .eq('id', returnId)
        .single()

      if (data) setPr(data as unknown as ReturnDetail)
      setLoading(false)
    })()
  }, [returnId, supabase])

  const isPrivileged = PRIVILEGED_ROLES.includes(currentUserRole)
  const isCreator    = pr?.created_by === currentUserId
  const isRejected   = pr?.workflow_status === 'rejected' || pr?.workflow_status === 'warehouse_rejected'
  const dir          = appLang === 'ar' ? 'rtl' : 'ltr'

  const t = (ar: string, en: string) => appLang === 'en' ? en : ar

  function getWorkflowBadge(wfStatus: string) {
    const info = WORKFLOW_BADGES[wfStatus] ?? { ar: wfStatus, en: wfStatus, cls: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300' }
    return (
      <span className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap ${info.cls}`}>
        {appLang === 'en' ? info.en : info.ar}
      </span>
    )
  }

  const formatDate  = (d: string | null) => d ? new Date(d).toLocaleDateString(appLang === 'ar' ? 'ar-EG' : 'en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '—'
  const formatMoney = (n: number) => n.toLocaleString(appLang === 'ar' ? 'ar-EG' : 'en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  if (loading) {
    return (
      <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900" dir={dir}>
        <Sidebar />
        <main className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8 overflow-x-hidden flex items-center justify-center">
          <p className="text-gray-500 dark:text-gray-400 animate-pulse">{t('جارٍ التحميل...', 'Loading...')}</p>
        </main>
      </div>
    )
  }

  if (!pr) {
    return (
      <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900" dir={dir}>
        <Sidebar />
        <main className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8 overflow-x-hidden flex items-center justify-center">
          <p className="text-red-600 dark:text-red-400">{t('لم يُعثر على المرتجع.', 'Return not found.')}</p>
        </main>
      </div>
    )
  }

  const currency = pr.original_currency || 'EGP'
  const items    = pr.purchase_return_items || []

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900" dir={dir}>
      <Sidebar />
      <main className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8 overflow-x-hidden">
        <div className="space-y-4 sm:space-y-6 max-w-full">

          {/* ─── Header ─── */}
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3">
            {/* Title + status */}
            <div className="flex items-center gap-3 min-w-0">
              <Button
                variant="ghost" size="icon"
                className="dark:text-gray-300 flex-shrink-0"
                onClick={() => router.push('/purchase-returns')}
              >
                {appLang === 'ar' ? <ArrowRight className="h-5 w-5" /> : <ArrowLeft className="h-5 w-5" />}
              </Button>
              <div className="min-w-0">
                <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2 truncate">
                  <RotateCcw className="h-5 w-5 sm:h-6 sm:w-6 flex-shrink-0 text-orange-500" />
                  {pr.return_number}
                </h1>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  {getWorkflowBadge(pr.workflow_status)}
                  {pr.suppliers?.name && (
                    <span className="text-sm text-gray-500 dark:text-gray-400">
                      {t('المورد:', 'Supplier:')} {pr.suppliers.name}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-2 flex-wrap">
              {isCreator && isRejected && (
                <Button
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                  onClick={() => router.push(`/purchase-returns/new?edit=${pr.id}`)}
                >
                  <Pencil className="h-4 w-4 mr-1" />
                  {t('تعديل وإعادة إرسال', 'Edit & Resubmit')}
                </Button>
              )}
              {pr.bills && (
                <Button
                  variant="outline"
                  className="dark:border-gray-600 dark:text-gray-300"
                  onClick={() => router.push(`/bills/${pr.bills!.id}`)}
                >
                  <FileText className="h-4 w-4 mr-1" />
                  {t('عرض الفاتورة', 'View Bill')}
                </Button>
              )}
            </div>
          </div>

          {/* ─── Rejection alert ─── */}
          {pr.rejection_reason && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-start gap-2">
              <XCircle className="h-4 w-4 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-red-800 dark:text-red-200">{t('سبب الرفض الإداري:', 'Admin Rejection Reason:')}</p>
                <p className="text-sm text-red-700 dark:text-red-300 mt-0.5">{pr.rejection_reason}</p>
              </div>
            </div>
          )}
          {pr.warehouse_rejection_reason && (
            <div className="p-3 bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 rounded-lg flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-rose-600 dark:text-rose-400 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-rose-800 dark:text-rose-200">{t('سبب رفض مسؤول المخزن:', 'Warehouse Rejection Reason:')}</p>
                <p className="text-sm text-rose-700 dark:text-rose-300 mt-0.5">{pr.warehouse_rejection_reason}</p>
              </div>
            </div>
          )}

          {/* ─── Summary stat cards ─── */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
            <Card className="dark:bg-gray-800 dark:border-gray-700 p-3 sm:p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-orange-100 dark:bg-orange-900/30 rounded-lg">
                  <RotateCcw className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                </div>
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{t('المجموع قبل الضريبة', 'Subtotal')}</p>
                  <p className="text-base sm:text-lg font-bold text-orange-600 dark:text-orange-400">{formatMoney(pr.subtotal)}</p>
                </div>
              </div>
            </Card>
            <Card className="dark:bg-gray-800 dark:border-gray-700 p-3 sm:p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-yellow-100 dark:bg-yellow-900/30 rounded-lg">
                  <DollarSign className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
                </div>
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{t('الضريبة', 'Tax')}</p>
                  <p className="text-base sm:text-lg font-bold text-yellow-600 dark:text-yellow-400">{formatMoney(pr.tax_amount)}</p>
                </div>
              </div>
            </Card>
            <Card className="dark:bg-gray-800 dark:border-gray-700 p-3 sm:p-4 col-span-2 sm:col-span-2">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
                  <DollarSign className="h-5 w-5 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{t('الإجمالي', 'Total Amount')}</p>
                  <p className="text-xl sm:text-2xl font-bold text-green-600 dark:text-green-400">
                    {formatMoney(pr.total_amount)} <span className="text-sm font-normal">{currency}</span>
                  </p>
                </div>
              </div>
            </Card>
          </div>

          {/* ─── Details + Financial ─── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
            {/* Return Info */}
            <Card className="dark:bg-gray-800 dark:border-gray-700">
              <CardHeader className="pb-3 border-b dark:border-gray-700">
                <CardTitle className="text-base text-gray-900 dark:text-white">{t('بيانات المرتجع', 'Return Details')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 pt-4">
                <DetailRow icon={<Hash className="h-4 w-4" />}    label={t('رقم المرتجع', 'Return #')}       value={pr.return_number} />
                <DetailRow icon={<Calendar className="h-4 w-4" />} label={t('تاريخ المرتجع', 'Return Date')}   value={formatDate(pr.return_date)} />
                <DetailRow icon={<User className="h-4 w-4" />}    label={t('المورد', 'Supplier')}             value={pr.suppliers?.name || '—'} />
                <DetailRow icon={<FileText className="h-4 w-4" />} label={t('الفاتورة المرجعية', 'Bill')}      value={pr.bills?.bill_number || '—'} />
                {pr.branches?.name  && <DetailRow icon={<Building2 className="h-4 w-4" />} label={t('الفرع', 'Branch')}   value={pr.branches.name} />}
                {pr.warehouses?.name && <DetailRow icon={<Warehouse className="h-4 w-4" />} label={t('المخزن', 'Warehouse')} value={pr.warehouses.name} />}
                <DetailRow
                  icon={<DollarSign className="h-4 w-4" />}
                  label={t('طريقة التسوية', 'Settlement')}
                  value={appLang === 'en'
                    ? (SETTLEMENT_LABELS[pr.settlement_method]?.en || pr.settlement_method)
                    : (SETTLEMENT_LABELS[pr.settlement_method]?.ar || pr.settlement_method)}
                />
              </CardContent>
            </Card>

            {/* Approval Timeline */}
            <Card className="dark:bg-gray-800 dark:border-gray-700">
              <CardHeader className="pb-3 border-b dark:border-gray-700">
                <CardTitle className="text-base text-gray-900 dark:text-white">{t('مسار الاعتماد', 'Approval Timeline')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 pt-4">
                <TimelineStep
                  icon={<Clock className="h-4 w-4 text-blue-500" />}
                  label={t('تم إنشاء المرتجع', 'Return Created')}
                  sublabel={formatDate(pr.return_date)}
                  done
                />
                {(pr.workflow_status === 'pending_admin_approval' || pr.workflow_status === 'pending_approval') && (
                  <TimelineStep
                    icon={<Clock className="h-4 w-4 text-amber-500 animate-pulse" />}
                    label={t('بانتظار اعتماد الإدارة العليا', 'Awaiting Admin Approval')}
                    sublabel=""
                    done
                  />
                )}
                {pr.approved_at && (
                  <TimelineStep
                    icon={<CheckCircle2 className="h-4 w-4 text-green-500" />}
                    label={t('تمت الموافقة الإدارية', 'Admin Approved')}
                    sublabel={formatDate(pr.approved_at)}
                    done
                  />
                )}
                {pr.workflow_status === 'pending_warehouse' && (
                  <TimelineStep
                    icon={<Clock className="h-4 w-4 text-blue-500 animate-pulse" />}
                    label={t('بانتظار اعتماد مسؤول المخزن', 'Awaiting Warehouse Confirmation')}
                    sublabel=""
                    done
                  />
                )}
                {pr.rejected_at && (
                  <TimelineStep
                    icon={<XCircle className="h-4 w-4 text-red-500" />}
                    label={t('رُفض إدارياً', 'Admin Rejected')}
                    sublabel={formatDate(pr.rejected_at)}
                    done
                  />
                )}
                {pr.warehouse_rejected_at && (
                  <TimelineStep
                    icon={<AlertTriangle className="h-4 w-4 text-rose-500" />}
                    label={t('رُفض من مسؤول المخزن', 'Warehouse Rejected')}
                    sublabel={formatDate(pr.warehouse_rejected_at)}
                    done
                  />
                )}
                {(pr.workflow_status === 'completed' || pr.workflow_status === 'confirmed') && (
                  <TimelineStep
                    icon={<CheckCircle2 className="h-4 w-4 text-emerald-600" />}
                    label={t('تم تأكيد المخزن — المرتجع مكتمل ✅', 'Warehouse Confirmed — Completed ✅')}
                    sublabel=""
                    done
                  />
                )}
              </CardContent>
            </Card>
          </div>

          {/* ─── Reason & Notes ─── */}
          {(pr.reason || pr.notes) && (
            <Card className="dark:bg-gray-800 dark:border-gray-700">
              <CardHeader className="pb-3 border-b dark:border-gray-700">
                <CardTitle className="text-base text-gray-900 dark:text-white">{t('سبب الإرجاع والملاحظات', 'Reason & Notes')}</CardTitle>
              </CardHeader>
              <CardContent className="pt-4 space-y-2">
                {pr.reason && <p className="text-sm text-gray-800 dark:text-gray-200">{pr.reason}</p>}
                {pr.notes  && <p className="text-sm text-gray-500 dark:text-gray-400">{pr.notes}</p>}
              </CardContent>
            </Card>
          )}

          {/* ─── Return Items ─── */}
          {items.length > 0 && (
            <Card className="dark:bg-gray-800 dark:border-gray-700">
              <CardHeader className="pb-3 border-b dark:border-gray-700">
                <CardTitle className="text-base text-gray-900 dark:text-white flex items-center gap-2">
                  <Package className="h-4 w-4" />
                  {t('بنود المرتجع', 'Return Items')} ({items.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4 px-0 sm:px-6">
                {/* Desktop table */}
                <div className="hidden sm:block overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b dark:border-gray-700 text-gray-500 dark:text-gray-400">
                        <th className="text-right py-2 px-3 font-medium">{t('المنتج', 'Product')}</th>
                        <th className="text-right py-2 px-3 font-medium">{t('الكمية', 'Qty')}</th>
                        <th className="text-right py-2 px-3 font-medium">{t('سعر الوحدة', 'Unit Price')}</th>
                        <th className="text-right py-2 px-3 font-medium">{t('ضريبة', 'Tax')}</th>
                        <th className="text-right py-2 px-3 font-medium">{t('خصم', 'Disc')}</th>
                        <th className="text-right py-2 px-3 font-medium">{t('الإجمالي', 'Total')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item) => (
                        <tr key={item.id} className="border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/40 transition-colors">
                          <td className="py-2.5 px-3 font-medium text-gray-900 dark:text-white">
                            {item.products?.name || item.description || '—'}
                          </td>
                          <td className="py-2.5 px-3 text-gray-700 dark:text-gray-300">{item.quantity}</td>
                          <td className="py-2.5 px-3 text-gray-700 dark:text-gray-300">{formatMoney(item.unit_price)}</td>
                          <td className="py-2.5 px-3 text-gray-700 dark:text-gray-300">{item.tax_rate}%</td>
                          <td className="py-2.5 px-3 text-gray-700 dark:text-gray-300">{item.discount_percent}%</td>
                          <td className="py-2.5 px-3 font-semibold text-gray-900 dark:text-white">{formatMoney(item.line_total)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-gray-50 dark:bg-gray-700/30">
                        <td colSpan={5} className="py-2.5 px-3 text-right font-semibold text-gray-700 dark:text-gray-300">
                          {t('الإجمالي', 'Total')}
                        </td>
                        <td className="py-2.5 px-3 font-bold text-gray-900 dark:text-white">
                          {formatMoney(pr.total_amount)} {currency}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {/* Mobile cards */}
                <div className="sm:hidden space-y-3 px-4">
                  {items.map((item) => (
                    <div key={item.id} className="p-3 bg-gray-50 dark:bg-gray-700/30 rounded-lg border dark:border-gray-700 space-y-2">
                      <p className="font-medium text-sm text-gray-900 dark:text-white">
                        {item.products?.name || item.description || '—'}
                      </p>
                      <div className="grid grid-cols-2 gap-1 text-xs text-gray-600 dark:text-gray-400">
                        <span>{t('الكمية:', 'Qty:')} {item.quantity}</span>
                        <span>{t('السعر:', 'Price:')} {formatMoney(item.unit_price)}</span>
                        <span>{t('ضريبة:', 'Tax:')} {item.tax_rate}%</span>
                        <span className="font-semibold text-gray-900 dark:text-white">{t('الإجمالي:', 'Total:')} {formatMoney(item.line_total)}</span>
                      </div>
                    </div>
                  ))}
                  {/* Mobile total */}
                  <div className="flex justify-between items-center pt-2 border-t dark:border-gray-700">
                    <span className="font-semibold text-gray-700 dark:text-gray-300">{t('الإجمالي', 'Total')}</span>
                    <span className="font-bold text-gray-900 dark:text-white">{formatMoney(pr.total_amount)} {currency}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

        </div>
      </main>
    </div>
  )
}

// ─── Helper components ─────────────────────────────────────────────────────

function DetailRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 min-w-0">
        <span className="flex-shrink-0">{icon}</span>
        <span className="text-sm truncate">{label}</span>
      </div>
      <span className="text-sm font-medium text-gray-900 dark:text-white text-right">{value}</span>
    </div>
  )
}

function TimelineStep({ icon, label, sublabel, done }: { icon: React.ReactNode; label: string; sublabel: string; done: boolean }) {
  return (
    <div className={`flex items-start gap-3 ${done ? '' : 'opacity-40'}`}>
      <div className="mt-0.5 flex-shrink-0">{icon}</div>
      <div>
        <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{label}</p>
        {sublabel && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{sublabel}</p>}
      </div>
    </div>
  )
}
