"use client"

import { useState, useEffect, useMemo } from "react"
import { Sidebar } from "@/components/sidebar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useSupabase } from "@/lib/supabase/hooks"
import { FileText, ShoppingCart, AlertCircle, CheckCircle, Clock, Download } from "lucide-react"
import Link from "next/link"

interface PurchaseOrder {
  id: string
  po_number: string
  po_date: string
  due_date: string | null
  supplier_id: string
  suppliers: { name: string } | null
  status: string
  total_amount: number
  currency: string
}

interface BilledData {
  purchase_order_id: string
  total_billed: number
  bill_count: number
}

export default function PurchaseOrdersStatusReport() {
  const supabase = useSupabase()
  const [isLoading, setIsLoading] = useState(true)
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([])
  const [billedData, setBilledData] = useState<Record<string, BilledData>>({})
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [dateFrom, setDateFrom] = useState<string>("")
  const [dateTo, setDateTo] = useState<string>("")
  const [appLang, setAppLang] = useState<'ar'|'en'>('ar')

  const currencySymbols: Record<string, string> = {
    EGP: '£', USD: '$', EUR: '€', GBP: '£', SAR: '﷼', AED: 'د.إ'
  }

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

  useEffect(() => { loadData() }, [])

  /**
   * ✅ تحميل بيانات حالة أوامر الشراء
   * ⚠️ OPERATIONAL REPORT - تقرير تشغيلي (من purchase_orders و bills مباشرة)
   * راجع: docs/OPERATIONAL_REPORTS_GUIDE.md
   */
  const loadData = async () => {
    try {
      setIsLoading(true)
      const { getActiveCompanyId } = await import("@/lib/company")
      const companyId = await getActiveCompanyId(supabase)
      if (!companyId) return

      // ✅ جلب أوامر الشراء (تقرير تشغيلي - من purchase_orders مباشرة)
      // ⚠️ ملاحظة: هذا تقرير تشغيلي وليس محاسبي رسمي
      const { data: poData } = await supabase
        .from("purchase_orders")
        .select("id, po_number, po_date, due_date, supplier_id, suppliers(name), status, total_amount, currency")
        .eq("company_id", companyId)
        .or("is_deleted.is.null,is_deleted.eq.false") // ✅ استثناء الأوامر المحذوفة
        .order("po_date", { ascending: false })

      setPurchaseOrders(poData || [])

      // ✅ جلب الفواتير المرتبطة (تقرير تشغيلي - من bills مباشرة)
      const { data: billsData } = await supabase
        .from("bills")
        .select("purchase_order_id, total_amount")
        .eq("company_id", companyId)
        .or("is_deleted.is.null,is_deleted.eq.false") // ✅ استثناء الفواتير المحذوفة
        .not("purchase_order_id", "is", null)

      const billedMap: Record<string, BilledData> = {}
      ;(billsData || []).forEach((bill: any) => {
        if (!billedMap[bill.purchase_order_id]) {
          billedMap[bill.purchase_order_id] = { purchase_order_id: bill.purchase_order_id, total_billed: 0, bill_count: 0 }
        }
        billedMap[bill.purchase_order_id].total_billed += Number(bill.total_amount || 0)
        billedMap[bill.purchase_order_id].bill_count += 1
      })
      setBilledData(billedMap)
    } catch (err) {
      console.error("Error loading PO status report:", err)
    } finally {
      setIsLoading(false)
    }
  }

  const t = (en: string, ar: string) => appLang === 'en' ? en : ar

  const filteredOrders = useMemo(() => {
    return purchaseOrders.filter(po => {
      // Status filter
      const billed = billedData[po.id]
      const totalBilled = billed?.total_billed || 0
      const poTotal = Number(po.total_amount || 0)
      
      let billingStatus = 'unbilled'
      if (totalBilled >= poTotal && poTotal > 0) {
        billingStatus = 'fully_billed'
      } else if (totalBilled > 0) {
        billingStatus = 'partially_billed'
      }

      if (statusFilter !== 'all' && billingStatus !== statusFilter) return false

      // Date filter
      if (dateFrom && po.po_date < dateFrom) return false
      if (dateTo && po.po_date > dateTo) return false

      return true
    })
  }, [purchaseOrders, billedData, statusFilter, dateFrom, dateTo])

  const summary = useMemo(() => {
    let unbilled = 0, partiallyBilled = 0, fullyBilled = 0
    let unbilledAmount = 0, partialAmount = 0, billedAmount = 0

    purchaseOrders.forEach(po => {
      const billed = billedData[po.id]
      const totalBilled = billed?.total_billed || 0
      const poTotal = Number(po.total_amount || 0)

      if (totalBilled >= poTotal && poTotal > 0) {
        fullyBilled++
        billedAmount += poTotal
      } else if (totalBilled > 0) {
        partiallyBilled++
        partialAmount += poTotal
      } else {
        unbilled++
        unbilledAmount += poTotal
      }
    })

    return { unbilled, partiallyBilled, fullyBilled, unbilledAmount, partialAmount, billedAmount }
  }, [purchaseOrders, billedData])

  const getStatusBadge = (po: PurchaseOrder) => {
    const billed = billedData[po.id]
    const totalBilled = billed?.total_billed || 0
    const poTotal = Number(po.total_amount || 0)

    if (totalBilled >= poTotal && poTotal > 0) {
      return <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"><CheckCircle className="h-3 w-3" />{t('Fully Billed', 'مفوتر بالكامل')}</span>
    } else if (totalBilled > 0) {
      return <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400"><AlertCircle className="h-3 w-3" />{t('Partially Billed', 'مفوتر جزئياً')}</span>
    }
    return <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400"><Clock className="h-3 w-3" />{t('Unbilled', 'غير مفوتر')}</span>
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
        <Sidebar />
        <main className="flex-1 md:mr-64 p-4 md:p-8 pt-20 md:pt-8">
          <p className="text-center py-8">{t('Loading...', 'جاري التحميل...')}</p>
        </main>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
      <Sidebar />
      <main className="flex-1 md:mr-64 p-4 md:p-8 pt-20 md:pt-8">
        <div className="space-y-6">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <ShoppingCart className="h-6 w-6" />
                {t('Purchase Orders Status Report', 'تقرير حالة أوامر الشراء')}
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                {t('Track billing status of purchase orders', 'تتبع حالة فوترة أوامر الشراء')}
              </p>
            </div>
          </div>

          {/* Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card className="dark:bg-gray-800 dark:border-gray-700">
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-gray-100 dark:bg-gray-700 rounded-lg">
                    <Clock className="h-6 w-6 text-gray-600 dark:text-gray-400" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{t('Unbilled', 'غير مفوتر')}</p>
                    <p className="text-2xl font-bold text-gray-900 dark:text-white">{summary.unbilled}</p>
                    <p className="text-xs text-gray-500">{currencySymbols['EGP']}{summary.unbilledAmount.toFixed(2)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="dark:bg-gray-800 dark:border-gray-700">
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-orange-100 dark:bg-orange-900/30 rounded-lg">
                    <AlertCircle className="h-6 w-6 text-orange-600 dark:text-orange-400" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{t('Partially Billed', 'مفوتر جزئياً')}</p>
                    <p className="text-2xl font-bold text-orange-600">{summary.partiallyBilled}</p>
                    <p className="text-xs text-gray-500">{currencySymbols['EGP']}{summary.partialAmount.toFixed(2)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="dark:bg-gray-800 dark:border-gray-700">
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-green-100 dark:bg-green-900/30 rounded-lg">
                    <CheckCircle className="h-6 w-6 text-green-600 dark:text-green-400" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{t('Fully Billed', 'مفوتر بالكامل')}</p>
                    <p className="text-2xl font-bold text-green-600">{summary.fullyBilled}</p>
                    <p className="text-xs text-gray-500">{currencySymbols['EGP']}{summary.billedAmount.toFixed(2)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Filters */}
          <Card className="dark:bg-gray-800 dark:border-gray-700">
            <CardContent className="pt-6">
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <div>
                  <Label>{t('Status', 'الحالة')}</Label>
                  <select className="w-full border rounded p-2 dark:bg-gray-700 dark:border-gray-600" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                    <option value="all">{t('All', 'الكل')}</option>
                    <option value="unbilled">{t('Unbilled', 'غير مفوتر')}</option>
                    <option value="partially_billed">{t('Partially Billed', 'مفوتر جزئياً')}</option>
                    <option value="fully_billed">{t('Fully Billed', 'مفوتر بالكامل')}</option>
                  </select>
                </div>
                <div>
                  <Label>{t('From Date', 'من تاريخ')}</Label>
                  <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
                </div>
                <div>
                  <Label>{t('To Date', 'إلى تاريخ')}</Label>
                  <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
                </div>
                <div className="flex items-end">
                  <Button variant="outline" onClick={() => { setStatusFilter('all'); setDateFrom(''); setDateTo('') }}>
                    {t('Reset', 'إعادة تعيين')}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Table */}
          <Card className="dark:bg-gray-800 dark:border-gray-700">
            <CardContent className="pt-6">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-gray-50 dark:bg-slate-900">
                      <th className="px-4 py-3 text-right">{t('PO Number', 'رقم الأمر')}</th>
                      <th className="px-4 py-3 text-right">{t('Date', 'التاريخ')}</th>
                      <th className="px-4 py-3 text-right">{t('Supplier', 'المورد')}</th>
                      <th className="px-4 py-3 text-right">{t('Order Total', 'إجمالي الأمر')}</th>
                      <th className="px-4 py-3 text-right">{t('Billed', 'المفوتر')}</th>
                      <th className="px-4 py-3 text-right">{t('Remaining', 'المتبقي')}</th>
                      <th className="px-4 py-3 text-right">{t('Status', 'الحالة')}</th>
                      <th className="px-4 py-3 text-right">{t('Actions', 'إجراءات')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredOrders.map((po) => {
                      const billed = billedData[po.id]
                      const totalBilled = billed?.total_billed || 0
                      const poTotal = Number(po.total_amount || 0)
                      const remaining = Math.max(0, poTotal - totalBilled)
                      const symbol = currencySymbols[po.currency || 'EGP'] || po.currency

                      return (
                        <tr key={po.id} className="border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50">
                          <td className="px-4 py-3 font-medium">{po.po_number}</td>
                          <td className="px-4 py-3">{new Date(po.po_date).toLocaleDateString(appLang === 'en' ? 'en' : 'ar')}</td>
                          <td className="px-4 py-3">{po.suppliers?.name || '-'}</td>
                          <td className="px-4 py-3">{symbol}{poTotal.toFixed(2)}</td>
                          <td className="px-4 py-3 text-green-600">{symbol}{totalBilled.toFixed(2)}</td>
                          <td className={`px-4 py-3 ${remaining > 0 ? 'text-orange-600 font-medium' : 'text-green-600'}`}>{symbol}{remaining.toFixed(2)}</td>
                          <td className="px-4 py-3">{getStatusBadge(po)}</td>
                          <td className="px-4 py-3">
                            <Link href={`/purchase-orders/${po.id}`}>
                              <Button variant="ghost" size="sm">{t('View', 'عرض')}</Button>
                            </Link>
                          </td>
                        </tr>
                      )
                    })}
                    {filteredOrders.length === 0 && (
                      <tr>
                        <td colSpan={8} className="px-4 py-8 text-center text-gray-500">
                          {t('No purchase orders found', 'لا توجد أوامر شراء')}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}

