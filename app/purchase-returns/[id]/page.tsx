"use client"

import { useEffect, useState } from "react"
import { Sidebar } from "@/components/sidebar"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useSupabase } from "@/lib/supabase/hooks"
import { useRouter, useParams } from "next/navigation"
import { ArrowRight, CheckCircle2, XCircle, Clock, AlertTriangle, Package, FileText, Pencil } from "lucide-react"
import { getActiveCompanyId } from "@/lib/company"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"

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

export default function PurchaseReturnDetailPage() {
  const supabase = useSupabase()
  const router = useRouter()
  const params = useParams()
  const returnId = params.id as string

  const [pr, setPr] = useState<ReturnDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [currentUserRole, setCurrentUserRole] = useState<string>('viewer')
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [appLang, setAppLang] = useState<'ar' | 'en'>('ar')
  const [userNames, setUserNames] = useState<Record<string, string>>({})

  useEffect(() => {
    try { setAppLang((localStorage.getItem('app_language') || 'ar') === 'en' ? 'en' : 'ar') } catch { }
  }, [])

  useEffect(() => {
    ;(async () => {
      const companyId = await getActiveCompanyId(supabase)
      if (!companyId) return

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setCurrentUserId(user.id)

      const { data: companyData } = await supabase
        .from('companies').select('user_id').eq('id', companyId).single()
      const { data: memberData } = await supabase
        .from('company_members')
        .select('role')
        .eq('company_id', companyId)
        .eq('user_id', user.id)
        .single()
      const isOwner = companyData?.user_id === user.id
      setCurrentUserRole(isOwner ? 'owner' : (memberData?.role || 'viewer'))

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

      if (data) {
        setPr(data as unknown as ReturnDetail)

        // جلب أسماء المستخدمين
        const userIds = [data.created_by, data.approved_by, data.rejected_by, data.warehouse_rejected_by]
          .filter(Boolean) as string[]
        if (userIds.length > 0) {
          const { data: profiles } = await supabase
            .from('company_members')
            .select('user_id, users:auth_user_id(email)')
            .in('user_id', userIds)
          // fallback: استخدم auth.users عبر profiles
          const names: Record<string, string> = {}
          for (const uid of userIds) {
            names[uid] = uid.slice(0, 8) + '...'
          }
          setUserNames(names)
        }
      }
      setLoading(false)
    })()
  }, [returnId, supabase])

  const isPrivileged = PRIVILEGED_ROLES.includes(currentUserRole)
  const isCreator = pr?.created_by === currentUserId

  function getWorkflowBadge(wfStatus: string) {
    const map: Record<string, { label: string; labelEn: string; color: string }> = {
      pending_admin_approval: { label: 'بانتظار اعتماد الإدارة', labelEn: 'Pending Admin Approval', color: 'bg-orange-100 text-orange-800 border-orange-300' },
      pending_warehouse:      { label: 'بانتظار اعتماد المخزن', labelEn: 'Pending Warehouse', color: 'bg-blue-100 text-blue-800 border-blue-300' },
      completed:              { label: 'مكتمل', labelEn: 'Completed', color: 'bg-green-100 text-green-800 border-green-300' },
      confirmed:              { label: 'مؤكد', labelEn: 'Confirmed', color: 'bg-green-100 text-green-800 border-green-300' },
      rejected:               { label: 'مرفوض إدارياً', labelEn: 'Admin Rejected', color: 'bg-red-100 text-red-800 border-red-300' },
      warehouse_rejected:     { label: 'مرفوض من المخزن', labelEn: 'Warehouse Rejected', color: 'bg-rose-100 text-rose-800 border-rose-300' },
      pending_approval:       { label: 'بانتظار الاعتماد', labelEn: 'Pending Approval', color: 'bg-yellow-100 text-yellow-800 border-yellow-300' },
    }
    const info = map[wfStatus] || { label: wfStatus, labelEn: wfStatus, color: 'bg-gray-100 text-gray-700 border-gray-300' }
    return (
      <span className={`inline-block px-3 py-1 rounded-full text-sm font-medium border ${info.color}`}>
        {appLang === 'en' ? info.labelEn : info.label}
      </span>
    )
  }

  function formatDate(d: string | null) {
    if (!d) return '—'
    return new Date(d).toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' })
  }

  function formatCurrency(n: number, currency = 'EGP') {
    return `${n.toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`
  }

  const settlementLabels: Record<string, { ar: string; en: string }> = {
    debit_note:    { ar: 'إشعار خصم', en: 'Debit Note' },
    cash:          { ar: 'نقداً', en: 'Cash' },
    bank_transfer: { ar: 'تحويل بنكي', en: 'Bank Transfer' },
    credit:        { ar: 'رصيد دائن', en: 'Credit' },
  }

  if (loading) {
    return (
      <div className="flex h-screen bg-background" dir={appLang === 'ar' ? 'rtl' : 'ltr'}>
        <Sidebar />
        <main className="flex-1 flex items-center justify-center">
          <div className="text-muted-foreground animate-pulse">{appLang === 'en' ? 'Loading...' : 'جارٍ التحميل...'}</div>
        </main>
      </div>
    )
  }

  if (!pr) {
    return (
      <div className="flex h-screen bg-background" dir={appLang === 'ar' ? 'rtl' : 'ltr'}>
        <Sidebar />
        <main className="flex-1 flex items-center justify-center">
          <div className="text-muted-foreground">{appLang === 'en' ? 'Return not found.' : 'لم يُعثر على المرتجع.'}</div>
        </main>
      </div>
    )
  }

  return (
    <div className="flex h-screen bg-background" dir={appLang === 'ar' ? 'rtl' : 'ltr'}>
      <Sidebar />
      <main className="flex-1 overflow-auto p-4 sm:p-6">
        <div className="max-w-4xl mx-auto space-y-6">

          {/* Header */}
          <div className="flex items-center justify-between">
            <Button variant="outline" size="sm" onClick={() => router.push('/purchase-returns')}>
              <ArrowRight className="w-4 h-4 mr-1" />
              {appLang === 'en' ? 'Back to Returns' : 'قائمة المرتجعات'}
            </Button>
            <h1 className="text-xl font-bold">
              {appLang === 'en' ? 'Return Details' : 'تفاصيل المرتجع'} — {pr.return_number}
            </h1>
            <div className="flex gap-2">
              {/* زر تعديل وإعادة إرسال للمنشئ */}
              {isCreator && (pr.workflow_status === 'rejected' || pr.workflow_status === 'warehouse_rejected') && (
                <Button
                  size="sm"
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                  onClick={() => router.push(`/purchase-returns/new?edit=${pr.id}`)}
                >
                  <Pencil className="w-4 h-4 mr-1" />
                  {appLang === 'en' ? 'Edit & Resubmit' : 'تعديل وإعادة إرسال'}
                </Button>
              )}
              {pr.bills && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => router.push(`/bills/${pr.bills!.id}`)}
                >
                  <FileText className="w-4 h-4 mr-1" />
                  {appLang === 'en' ? 'View Bill' : 'عرض الفاتورة'}
                </Button>
              )}
            </div>
          </div>

          {/* Status Banner */}
          <Card className="border-2">
            <CardContent className="pt-4 pb-4">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-sm text-muted-foreground mb-1">{appLang === 'en' ? 'Workflow Status' : 'حالة سير العمل'}</p>
                  {getWorkflowBadge(pr.workflow_status)}
                </div>
                <div className="text-right">
                  <p className="text-sm text-muted-foreground">{appLang === 'en' ? 'Total Amount' : 'الإجمالي'}</p>
                  <p className="text-2xl font-bold text-primary">{formatCurrency(pr.total_amount, pr.original_currency)}</p>
                </div>
              </div>

              {/* Rejection reason */}
              {pr.rejection_reason && (
                <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-sm font-medium text-red-700 flex items-center gap-1">
                    <XCircle className="w-4 h-4" />
                    {appLang === 'en' ? 'Admin Rejection Reason' : 'سبب الرفض الإداري'}
                  </p>
                  <p className="text-sm text-red-600 mt-1">{pr.rejection_reason}</p>
                </div>
              )}
              {pr.warehouse_rejection_reason && (
                <div className="mt-4 p-3 bg-rose-50 border border-rose-200 rounded-lg">
                  <p className="text-sm font-medium text-rose-700 flex items-center gap-1">
                    <AlertTriangle className="w-4 h-4" />
                    {appLang === 'en' ? 'Warehouse Rejection Reason' : 'سبب رفض المخزن'}
                  </p>
                  <p className="text-sm text-rose-600 mt-1">{pr.warehouse_rejection_reason}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Info Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">{appLang === 'en' ? 'Return Information' : 'معلومات المرتجع'}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <InfoRow label={appLang === 'en' ? 'Return Number' : 'رقم المرتجع'} value={pr.return_number} />
                <InfoRow label={appLang === 'en' ? 'Return Date' : 'تاريخ المرتجع'} value={formatDate(pr.return_date)} />
                <InfoRow
                  label={appLang === 'en' ? 'Settlement Method' : 'طريقة التسوية'}
                  value={appLang === 'en' ? (settlementLabels[pr.settlement_method]?.en || pr.settlement_method) : (settlementLabels[pr.settlement_method]?.ar || pr.settlement_method)}
                />
                <InfoRow label={appLang === 'en' ? 'Supplier' : 'المورد'} value={pr.suppliers?.name || '—'} />
                <InfoRow label={appLang === 'en' ? 'Bill' : 'الفاتورة'} value={pr.bills?.bill_number || '—'} />
                {pr.branches?.name && <InfoRow label={appLang === 'en' ? 'Branch' : 'الفرع'} value={pr.branches.name} />}
                {pr.warehouses?.name && <InfoRow label={appLang === 'en' ? 'Warehouse' : 'المخزن'} value={pr.warehouses.name} />}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">{appLang === 'en' ? 'Financial Summary' : 'الملخص المالي'}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <InfoRow label={appLang === 'en' ? 'Subtotal' : 'المجموع قبل الضريبة'} value={formatCurrency(pr.subtotal, pr.original_currency)} />
                <InfoRow label={appLang === 'en' ? 'Tax' : 'الضريبة'} value={formatCurrency(pr.tax_amount, pr.original_currency)} />
                <Separator />
                <InfoRow label={appLang === 'en' ? 'Total' : 'الإجمالي'} value={formatCurrency(pr.total_amount, pr.original_currency)} bold />
              </CardContent>
            </Card>
          </div>

          {/* Return Reason */}
          {pr.reason && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">{appLang === 'en' ? 'Return Reason' : 'سبب الإرجاع'}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm">{pr.reason}</p>
                {pr.notes && <p className="text-sm text-muted-foreground mt-2">{pr.notes}</p>}
              </CardContent>
            </Card>
          )}

          {/* Return Items */}
          {pr.purchase_return_items && pr.purchase_return_items.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Package className="w-4 h-4" />
                  {appLang === 'en' ? 'Return Items' : 'بنود المرتجع'}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-muted-foreground">
                        <th className="text-right py-2 px-2">{appLang === 'en' ? 'Product' : 'المنتج'}</th>
                        <th className="text-right py-2 px-2">{appLang === 'en' ? 'Qty' : 'الكمية'}</th>
                        <th className="text-right py-2 px-2">{appLang === 'en' ? 'Unit Price' : 'سعر الوحدة'}</th>
                        <th className="text-right py-2 px-2">{appLang === 'en' ? 'Tax' : 'الضريبة'}</th>
                        <th className="text-right py-2 px-2">{appLang === 'en' ? 'Total' : 'الإجمالي'}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pr.purchase_return_items.map((item) => (
                        <tr key={item.id} className="border-b hover:bg-muted/30">
                          <td className="py-2 px-2 font-medium">{item.products?.name || item.description || '—'}</td>
                          <td className="py-2 px-2">{item.quantity}</td>
                          <td className="py-2 px-2">{formatCurrency(item.unit_price, pr.original_currency)}</td>
                          <td className="py-2 px-2">{item.tax_rate}%</td>
                          <td className="py-2 px-2 font-medium">{formatCurrency(item.line_total, pr.original_currency)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Workflow Timeline */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{appLang === 'en' ? 'Approval Timeline' : 'مسار الاعتماد'}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <TimelineStep
                  icon={<Clock className="w-4 h-4 text-blue-500" />}
                  label={appLang === 'en' ? 'Return Created' : 'تم إنشاء المرتجع'}
                  date={formatDate(pr.return_date)}
                  done
                />
                {pr.approved_at && (
                  <TimelineStep
                    icon={<CheckCircle2 className="w-4 h-4 text-green-500" />}
                    label={appLang === 'en' ? 'Admin Approved' : 'تمت الموافقة الإدارية'}
                    date={formatDate(pr.approved_at)}
                    done
                  />
                )}
                {pr.rejected_at && (
                  <TimelineStep
                    icon={<XCircle className="w-4 h-4 text-red-500" />}
                    label={appLang === 'en' ? `Admin Rejected — ${pr.rejection_reason || ''}` : `رُفض إدارياً — ${pr.rejection_reason || ''}`}
                    date={formatDate(pr.rejected_at)}
                    done
                  />
                )}
                {pr.warehouse_rejected_at && (
                  <TimelineStep
                    icon={<AlertTriangle className="w-4 h-4 text-rose-500" />}
                    label={appLang === 'en' ? `Warehouse Rejected — ${pr.warehouse_rejection_reason || ''}` : `رُفض من المخزن — ${pr.warehouse_rejection_reason || ''}`}
                    date={formatDate(pr.warehouse_rejected_at)}
                    done
                  />
                )}
                {pr.workflow_status === 'completed' && (
                  <TimelineStep
                    icon={<CheckCircle2 className="w-4 h-4 text-emerald-600" />}
                    label={appLang === 'en' ? 'Warehouse Confirmed — Return Completed' : 'تأكيد المخزن — المرتجع مكتمل'}
                    date=""
                    done
                  />
                )}
              </div>
            </CardContent>
          </Card>

        </div>
      </main>
    </div>
  )
}

function InfoRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className={`text-sm ${bold ? 'font-bold text-base' : 'font-medium'}`}>{value}</span>
    </div>
  )
}

function TimelineStep({ icon, label, date, done }: { icon: React.ReactNode; label: string; date: string; done: boolean }) {
  return (
    <div className={`flex items-start gap-3 ${done ? '' : 'opacity-40'}`}>
      <div className="mt-0.5">{icon}</div>
      <div>
        <p className="text-sm font-medium">{label}</p>
        {date && <p className="text-xs text-muted-foreground">{date}</p>}
      </div>
    </div>
  )
}
