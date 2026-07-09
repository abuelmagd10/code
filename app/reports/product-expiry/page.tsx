"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useSupabase } from "@/lib/supabase/hooks"
import { getActiveCompanyId } from "@/lib/company"
import { Download, ArrowRight, AlertTriangle, Calendar, Package, Save, ChevronDown, ChevronUp, History, CheckCircle2, Scissors, Plus, Trash2, Boxes } from "lucide-react"
import { useRouter } from "next/navigation"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog"
import { useAutoRefresh } from "@/hooks/use-auto-refresh"
import { useToast } from "@/hooks/use-toast"
import { toastActionError, toastActionSuccess } from "@/lib/notifications"

/**
 * v3.74.580 — التقرير أصبح يعرض المخزون الحى من fifo_cost_lots
 * (دفعات لها تاريخ صلاحية وكمية متبقية > 0) مع تعديل تاريخ الصلاحية
 * لكل دفعة عبر RPC update_lot_expiry (بصلاحيات المستخدم المسجل).
 * تجميع الإهلاك القديم أصبح قسماً ثانوياً (writeoff_history).
 *
 * v3.74.586 — أعمدة رقم اللوط والكراتين + شارة FEFO (الأقرب انتهاءً) +
 * تقسيم اللوط غير المستهلك إلى لوطات فرعية عبر RPC split_fifo_lot
 * (بصلاحيات المستخدم المسجل — الـ RPC يفرض الأدوار بنفسه).
 */

interface LiveLot {
  id: string
  product_id: string
  product_name: string
  product_sku: string
  lot_number: string | null
  original_quantity: number
  units_per_carton: number | null
  cartons: number | null
  branch_id: string | null
  branch_name: string
  warehouse_id: string | null
  warehouse_name: string
  lot_date: string
  expiry_date: string
  remaining_quantity: number
  unit_cost: number
  total_cost: number
  days_until_expiry: number
  status: "expired" | "expiring_soon" | "valid"
}

interface SplitRow {
  quantity: string
  expiry_date: string
}

interface WriteOffHistoryItem {
  product_id: string
  product_name: string
  product_sku: string
  expiry_date: string
  quantity: number
  unit_cost: number
  total_cost: number
  days_until_expiry: number
  status: "expired" | "expiring_soon" | "valid"
  branch_name?: string
  warehouse_name?: string
}

interface Summary {
  total_lots: number
  expired_count: number
  expiring_soon_count: number
  valid_count: number
  total_quantity: number
  total_cost: number
}

const EMPTY_SUMMARY: Summary = {
  total_lots: 0,
  expired_count: 0,
  expiring_soon_count: 0,
  valid_count: 0,
  total_quantity: 0,
  total_cost: 0
}

export default function ProductExpiryPage() {
  const supabase = useSupabase()
  const router = useRouter()
  const { toast } = useToast()
  const [lots, setLots] = useState<LiveLot[]>([])
  const [writeoffHistory, setWriteoffHistory] = useState<WriteOffHistoryItem[]>([])
  const [summary, setSummary] = useState<Summary>(EMPTY_SUMMARY)
  const [products, setProducts] = useState<Array<{ id: string; name: string; sku: string }>>([])
  const [isLoading, setIsLoading] = useState(true)
  const [appLang, setAppLang] = useState<'ar' | 'en'>('ar')
  const [companyId, setCompanyId] = useState<string | null>(null)

  // v3.74.580: تعديل تاريخ الصلاحية inline لكل دفعة
  const [editDates, setEditDates] = useState<Record<string, string>>({})
  const [savingLotId, setSavingLotId] = useState<string | null>(null)
  const [showHistory, setShowHistory] = useState(false)

  // v3.74.586: تقسيم اللوط غير المستهلك إلى لوطات فرعية
  const [splitLot, setSplitLot] = useState<LiveLot | null>(null)
  const [splitRows, setSplitRows] = useState<SplitRow[]>([])
  const [isSplitting, setIsSplitting] = useState(false)

  const [fromDate, setFromDate] = useState<string>("")
  const [toDate, setToDate] = useState<string>("")
  const [selectedProduct, setSelectedProduct] = useState<string>("")
  const [statusFilter, setStatusFilter] = useState<'all' | 'expired' | 'expiring_soon' | 'valid'>('all')

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
  const numberFmt = new Intl.NumberFormat(appLang === 'en' ? "en-EG" : "ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  // Load products + company id (لاستدعاء RPC تعديل الصلاحية)
  useEffect(() => {
    const loadProducts = async () => {
      const cid = await getActiveCompanyId(supabase)
      if (!cid) return
      setCompanyId(cid)

      const { data } = await supabase
        .from("products")
        .select("id, name, sku")
        .eq("company_id", cid)
        .or("item_type.is.null,item_type.eq.product")
        .order("name")

      setProducts((data || []) as Array<{ id: string; name: string; sku: string }>)
    }
    loadProducts()
  }, [supabase])

  useEffect(() => {
    loadData()
  }, [fromDate, toDate, selectedProduct, statusFilter])

  /**
   * ✅ تحميل بيانات صلاحيات المنتجات
   * ⚠️ OPERATIONAL REPORT - تقرير تشغيلي (من fifo_cost_lots و inventory_write_off_items مباشرة)
   * راجع: docs/OPERATIONAL_REPORTS_GUIDE.md
   */
  // v3.74.59 — تَحديث تِلقائى عِندَ العَودَة للنّافِذَة/التَّبويب
  useAutoRefresh({ onRefresh: () => loadData() })

  const loadData = async () => {
    try {
      setIsLoading(true)
      const params = new URLSearchParams({ status: statusFilter })
      if (fromDate) params.set('from', fromDate)
      if (toDate) params.set('to', toDate)
      if (selectedProduct) params.set('product_id', selectedProduct)

      const res = await fetch(`/api/product-expiry?${params.toString()}`)
      if (!res.ok) {
        console.error("API Error:", res.status)
        setLots([])
        setWriteoffHistory([])
        setSummary(EMPTY_SUMMARY)
        return
      }

      const data = await res.json()
      setLots(Array.isArray(data.data) ? data.data : [])
      setWriteoffHistory(Array.isArray(data.writeoff_history) ? data.writeoff_history : [])
      setSummary(data.summary || EMPTY_SUMMARY)
    } catch (error) {
      console.error("Error loading expiry data:", error)
      setLots([])
      setWriteoffHistory([])
      setSummary(EMPTY_SUMMARY)
    } finally {
      setIsLoading(false)
    }
  }

  /**
   * v3.74.580 — حفظ تاريخ صلاحية الدفعة عبر RPC update_lot_expiry
   * ⚠️ يُستدعى بجلسة المستخدم المسجل (browser client) — الـ RPC يفرض الأدوار بنفسه
   *    ويرفض غير المصرح لهم برسالة عربية واضحة نعرضها كما هى.
   */
  const handleSaveExpiry = async (lot: LiveLot) => {
    const newDate = editDates[lot.id]
    if (!newDate || newDate === lot.expiry_date) return
    if (!companyId) {
      toastActionError(toast, t('Company not found', 'لم يتم العثور على الشركة'))
      return
    }
    try {
      setSavingLotId(lot.id)
      const { error } = await supabase.rpc('update_lot_expiry', {
        p_company_id: companyId,
        p_lot_id: lot.id,
        p_expiry_date: newDate,
      })
      if (error) throw error
      toastActionSuccess(toast, t('Batch expiry date updated', 'تم تحديث تاريخ صلاحية الدفعة'))
      setEditDates(prev => {
        const next = { ...prev }
        delete next[lot.id]
        return next
      })
      loadData()
    } catch (e: any) {
      // إظهار رسالة الـ RPC (عربية) كما هى
      toastActionError(toast, e?.message || t('Failed to update expiry date', 'فشل تحديث تاريخ الصلاحية'))
    } finally {
      setSavingLotId(null)
    }
  }

  /**
   * v3.74.586 — تقسيم اللوط غير المستهلك (المتبقى = الأصلى) إلى لوطات فرعية
   * عبر RPC split_fifo_lot بجلسة المستخدم المسجل — الـ RPC يفرض الأدوار بنفسه
   * ويرفض غير المصرح لهم برسالة عربية واضحة نعرضها كما هى.
   */
  const openSplitDialog = (lot: LiveLot) => {
    setSplitLot(lot)
    setSplitRows([
      { quantity: "", expiry_date: lot.expiry_date },
      { quantity: "", expiry_date: lot.expiry_date },
    ])
  }

  const closeSplitDialog = () => {
    if (isSplitting) return
    setSplitLot(null)
    setSplitRows([])
  }

  // «تقسيم بالكراتين» — صفوف بعدد عبوات الكرتونة والباقى فى الصف الأخير
  const prefillByCartons = () => {
    if (!splitLot || !splitLot.units_per_carton || splitLot.units_per_carton <= 0) return
    const upc = splitLot.units_per_carton
    const total = splitLot.original_quantity
    const rows: SplitRow[] = []
    let remaining = total
    while (remaining > upc) {
      rows.push({ quantity: String(upc), expiry_date: splitLot.expiry_date })
      remaining -= upc
    }
    rows.push({ quantity: String(remaining), expiry_date: splitLot.expiry_date })
    if (rows.length < 2) return // الكمية لا تكفى لأكثر من كرتونة واحدة
    setSplitRows(rows)
  }

  const splitTarget = splitLot ? Number(splitLot.original_quantity || 0) : 0
  const splitSum = splitRows.reduce((sum, r) => sum + (Number(r.quantity) || 0), 0)
  const splitSumOk = splitLot !== null && Math.abs(splitSum - splitTarget) < 0.000001
  const splitRowsValid = splitRows.length >= 2 && splitRows.every(r => Number(r.quantity) > 0 && !!r.expiry_date)
  const canSubmitSplit = !!splitLot && !!companyId && splitSumOk && splitRowsValid && !isSplitting

  const handleSplitSubmit = async () => {
    if (!splitLot || !canSubmitSplit) return
    if (!companyId) {
      toastActionError(toast, t('Company not found', 'لم يتم العثور على الشركة'))
      return
    }
    try {
      setIsSplitting(true)
      const { data, error } = await supabase.rpc('split_fifo_lot', {
        p_company_id: companyId,
        p_lot_id: splitLot.id,
        p_splits: splitRows.map(r => ({
          quantity: Number(r.quantity),
          expiry_date: r.expiry_date,
        })),
      })
      if (error) throw error
      const result = data as { success?: boolean; lots_created?: number; lot_numbers?: string[] } | null
      if (!result?.success) {
        throw new Error((result as any)?.error || t('Failed to split lot', 'فشل تقسيم اللوط'))
      }
      const lotNumbers = (result.lot_numbers || []) as string[]
      // عرض أرقام اللوطات الجديدة ليكتبها المدير على الكراتين
      toast({
        title: t('Lot split successfully', 'تم تقسيم اللوط بنجاح'),
        description: `${t('New lot numbers', 'أرقام اللوطات الجديدة')}: ${lotNumbers.join(' ، ')}`,
        duration: 15000,
      })
      setSplitLot(null)
      setSplitRows([])
      loadData()
    } catch (e: any) {
      // إظهار رسالة الـ RPC (عربية) كما هى
      toastActionError(toast, e?.message || t('Failed to split lot', 'فشل تقسيم اللوط'))
    } finally {
      setIsSplitting(false)
    }
  }

  // v3.74.586 — FEFO: داخل كل (منتج + مخزن) اللوط صاحب أقرب تاريخ انتهاء غير فارغ
  const fefoLotIds = (() => {
    const best = new Map<string, LiveLot>()
    for (const l of lots) {
      if (!l.expiry_date) continue
      const key = `${l.product_id}__${l.warehouse_id || ''}`
      const cur = best.get(key)
      if (!cur || String(l.expiry_date) < String(cur.expiry_date)) best.set(key, l)
    }
    return new Set(Array.from(best.values()).map(l => l.id))
  })()

  const handleExportCsv = () => {
    const headers = ["product_sku", "product_name", "branch_name", "warehouse_name", "lot_date", "expiry_date", "remaining_quantity", "unit_cost", "total_cost", "days_until_expiry", "status"]
    const rowsCsv = lots.map((lot) => [
      lot.product_sku,
      lot.product_name,
      lot.branch_name || "",
      lot.warehouse_name || "",
      lot.lot_date || "",
      lot.expiry_date,
      lot.remaining_quantity.toString(),
      lot.unit_cost.toFixed(2),
      lot.total_cost.toFixed(2),
      lot.days_until_expiry.toString(),
      lot.status
    ])
    const csv = [headers.join(","), ...rowsCsv.map((r) => r.join(","))].join("\n")
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const aEl = document.createElement("a")
    aEl.href = url
    aEl.download = `product-expiry-lots-${new Date().toISOString().slice(0, 10)}.csv`
    aEl.click()
    URL.revokeObjectURL(url)
  }

  const getStatusBadge = (status: string, days: number) => {
    if (status === "expired") {
      return <Badge className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300">{t("Expired", "منتهى الصلاحية")}</Badge>
    } else if (status === "expiring_soon") {
      return <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">{t(`Expiring in ${days} days`, `ينتهى خلال ${days} يوم`)}</Badge>
    } else {
      return <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">{t("Valid", "سارى")}</Badge>
    }
  }

  // إجمالى التكلفة المعرضة للخطر (منتهى + يقترب من الانتهاء)
  const atRiskCost = lots
    .filter((l) => l.status !== 'valid')
    .reduce((sum, l) => sum + l.total_cost, 0)

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
      <main className="flex-1 md:mr-64 p-4 md:p-8 pt-20 md:pt-8">
        <div className="space-y-6">
          {/* Header */}
          <Card className="bg-white dark:bg-slate-900 border-0 shadow-sm">
            <CardContent className="py-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-gradient-to-br from-orange-500 to-red-600 rounded-xl shadow-lg">
                    <Calendar className="w-7 h-7 text-white" />
                  </div>
                  <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                      {t("Product Expiry Report", "تقرير صلاحيات المنتجات")}
                    </h1>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                      {t("Live stock batches by expiry date", "دفعات المخزون الحى حسب تاريخ الصلاحية")}
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
            <Card className="dark:bg-gray-800 border-r-4 border-r-red-500">
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{t("Expired", "منتهى الصلاحية")}</p>
                    <p className="text-2xl font-bold text-red-600">{summary.expired_count}</p>
                  </div>
                  <AlertTriangle className="w-8 h-8 text-red-500" />
                </div>
              </CardContent>
            </Card>
            <Card className="dark:bg-gray-800 border-r-4 border-r-amber-500">
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{t("Expiring Soon (≤30 days)", "يقترب من الانتهاء (≤30 يوم)")}</p>
                    <p className="text-2xl font-bold text-amber-600">{summary.expiring_soon_count}</p>
                  </div>
                  <AlertTriangle className="w-8 h-8 text-amber-500" />
                </div>
              </CardContent>
            </Card>
            <Card className="dark:bg-gray-800 border-r-4 border-r-green-500">
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{t("Valid", "سارى")}</p>
                    <p className="text-2xl font-bold text-green-600">{summary.valid_count}</p>
                  </div>
                  <CheckCircle2 className="w-8 h-8 text-green-500" />
                </div>
              </CardContent>
            </Card>
            <Card className="dark:bg-gray-800">
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{t("At-Risk Cost", "تكلفة معرضة للخطر")}</p>
                    <p className="text-2xl font-bold">{numberFmt.format(atRiskCost)}</p>
                    <p className="text-xs text-gray-400">{t("Expired + expiring soon", "منتهى + يقترب من الانتهاء")}</p>
                  </div>
                  <Package className="w-8 h-8 text-orange-500" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Filters */}
          <Card className="dark:bg-gray-800">
            <CardContent className="py-4">
              <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                <div>
                  <Label className="text-xs">{t("Expiry From", "الصلاحية من تاريخ")}</Label>
                  <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="w-full" />
                </div>
                <div>
                  <Label className="text-xs">{t("Expiry To", "الصلاحية إلى تاريخ")}</Label>
                  <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="w-full" />
                </div>
                <div>
                  <Label className="text-xs">{t("Status", "الحالة")}</Label>
                  <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as 'all' | 'expired' | 'expiring_soon' | 'valid')}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t("All", "الكل")}</SelectItem>
                      <SelectItem value="expired">{t("Expired", "منتهى الصلاحية")}</SelectItem>
                      <SelectItem value="expiring_soon">{t("Expiring Soon", "يقترب من الانتهاء")}</SelectItem>
                      <SelectItem value="valid">{t("Valid", "سارى")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">{t("Product", "المنتج")}</Label>
                  <Select value={selectedProduct || '__all__'} onValueChange={(v) => setSelectedProduct(v === '__all__' ? '' : v)}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder={t("All Products", "جميع المنتجات")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">{t("All Products", "جميع المنتجات")}</SelectItem>
                      {products.map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.name} ({p.sku})</SelectItem>
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

          {/* Live Lots Table */}
          <Card className="dark:bg-gray-800">
            <CardHeader>
              <CardTitle>{t("Live Stock Batches", "دفعات المخزون الحى")} ({lots.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="text-center py-8 text-gray-500">{t("Loading...", "جاري التحميل...")}</div>
              ) : lots.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <Calendar className="w-12 h-12 mx-auto text-gray-300 mb-4" />
                  <p>{t("No live batches with expiry dates found", "لا توجد دفعات حية لها تاريخ صلاحية")}</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b dark:border-gray-700">
                        <th className="text-right py-3 px-2">{t("Product", "المنتج")}</th>
                        <th className="text-right py-3 px-2">{t("Lot", "اللوط")}</th>
                        <th className="text-right py-3 px-2">{t("Branch", "الفرع")}</th>
                        <th className="text-right py-3 px-2">{t("Warehouse", "المخزن")}</th>
                        <th className="text-right py-3 px-2">{t("Batch Date", "تاريخ الدفعة")}</th>
                        <th className="text-right py-3 px-2">{t("Expiry Date", "تاريخ الانتهاء")}</th>
                        <th className="text-right py-3 px-2">{t("Remaining Qty", "الكمية المتبقية")}</th>
                        <th className="text-right py-3 px-2">{t("Cartons", "كراتين")}</th>
                        <th className="text-right py-3 px-2">{t("Days Left", "باقى (أيام)")}</th>
                        <th className="text-right py-3 px-2">{t("Status", "الحالة")}</th>
                        <th className="text-right py-3 px-2">{t("Actions", "إجراءات")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lots.map((lot) => (
                        <tr key={lot.id} className="border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-slate-700">
                          <td className="py-3 px-2">
                            <div>
                              <div className="font-medium">{lot.product_name}</div>
                              <div className="text-xs text-gray-500">{lot.product_sku}</div>
                              {/* v3.74.586: شارة FEFO — أقرب لوط انتهاءً داخل (المنتج + المخزن) */}
                              {fefoLotIds.has(lot.id) && (
                                <Badge className="mt-1 bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 text-[10px] font-normal">
                                  {t("Expires first — issue from this one", "الأقرب انتهاءً — اصرف منه أولاً")}
                                </Badge>
                              )}
                            </div>
                          </td>
                          <td className="py-3 px-2 font-mono text-xs">{lot.lot_number || "—"}</td>
                          <td className="py-3 px-2">{lot.branch_name || "—"}</td>
                          <td className="py-3 px-2">{lot.warehouse_name || "—"}</td>
                          <td className="py-3 px-2">{lot.lot_date || "—"}</td>
                          <td className="py-3 px-2">
                            {/* v3.74.580: تعديل تاريخ الصلاحية inline — الـ RPC يفرض الصلاحيات بنفسه */}
                            <div className="flex items-center gap-1">
                              <Input
                                type="date"
                                className="w-36 h-8 text-xs"
                                value={editDates[lot.id] ?? lot.expiry_date}
                                onChange={(e) => setEditDates(prev => ({ ...prev, [lot.id]: e.target.value }))}
                              />
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 px-2"
                                disabled={savingLotId === lot.id || !editDates[lot.id] || editDates[lot.id] === lot.expiry_date}
                                onClick={() => handleSaveExpiry(lot)}
                                title={t("Save expiry date", "حفظ تاريخ الصلاحية")}
                              >
                                <Save className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          </td>
                          <td className="py-3 px-2">{lot.remaining_quantity}</td>
                          <td className="py-3 px-2">
                            {/* v3.74.586: الكمية بالكراتين (عند تعريف عدد العبوات فى الكرتونة) */}
                            {lot.cartons !== null && lot.cartons !== undefined ? lot.cartons : "—"}
                          </td>
                          <td className={`py-3 px-2 font-semibold ${lot.days_until_expiry < 0 ? 'text-red-600' : lot.days_until_expiry <= 30 ? 'text-amber-600' : 'text-green-600'}`}>
                            {lot.days_until_expiry}
                          </td>
                          <td className="py-3 px-2">
                            {getStatusBadge(lot.status, lot.days_until_expiry)}
                          </td>
                          <td className="py-3 px-2">
                            {/* v3.74.586: تقسيم اللوط — متاح فقط للوط غير المستهلك (المتبقى = الأصلى) */}
                            {lot.original_quantity === lot.remaining_quantity ? (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 px-2"
                                onClick={() => openSplitDialog(lot)}
                                title={t("Split this lot into sub-lots", "تقسيم هذا اللوط إلى لوطات فرعية")}
                              >
                                <Scissors className="w-3.5 h-3.5 ml-1" />
                                {t("Split", "تقسيم")}
                              </Button>
                            ) : (
                              <span className="text-xs text-gray-400">—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* v3.74.580: تاريخ الإهلاك — قسم ثانوى قابل للطى */}
          <Card className="dark:bg-gray-800">
            <CardHeader className="cursor-pointer" onClick={() => setShowHistory(!showHistory)}>
              <CardTitle className="flex items-center justify-between text-base">
                <span className="flex items-center gap-2">
                  <History className="w-4 h-4 text-gray-400" />
                  {t("Write-off History (expired items)", "سجل الإهلاك السابق (أصناف منتهية)")} ({writeoffHistory.length})
                </span>
                {showHistory ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </CardTitle>
            </CardHeader>
            {showHistory && (
              <CardContent>
                {writeoffHistory.length === 0 ? (
                  <div className="text-center py-6 text-gray-500 text-sm">
                    {t("No write-off history with expiry dates", "لا يوجد سجل إهلاك بتواريخ صلاحية")}
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b dark:border-gray-700">
                          <th className="text-right py-3 px-2">{t("Product", "المنتج")}</th>
                          <th className="text-right py-3 px-2">{t("Expiry Date", "تاريخ الانتهاء")}</th>
                          <th className="text-right py-3 px-2">{t("Quantity", "الكمية")}</th>
                          <th className="text-right py-3 px-2">{t("Unit Cost", "تكلفة الوحدة")}</th>
                          <th className="text-right py-3 px-2">{t("Total Cost", "إجمالي التكلفة")}</th>
                          <th className="text-right py-3 px-2">{t("Branch/Warehouse", "الفرع/المخزن")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {writeoffHistory.map((item, idx) => (
                          <tr key={idx} className="border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-slate-700">
                            <td className="py-3 px-2">
                              <div>
                                <div className="font-medium">{item.product_name}</div>
                                <div className="text-xs text-gray-500">{item.product_sku}</div>
                              </div>
                            </td>
                            <td className="py-3 px-2">{item.expiry_date}</td>
                            <td className="py-3 px-2">{item.quantity}</td>
                            <td className="py-3 px-2">{numberFmt.format(item.unit_cost)}</td>
                            <td className="py-3 px-2 font-semibold">{numberFmt.format(item.total_cost)}</td>
                            <td className="py-3 px-2 text-xs">
                              {item.branch_name && <div>{item.branch_name}</div>}
                              {item.warehouse_name && <div className="text-gray-500">{item.warehouse_name}</div>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            )}
          </Card>

          {/* v3.74.586: حوار تقسيم اللوط غير المستهلك إلى لوطات فرعية (RPC split_fifo_lot) */}
          <Dialog open={!!splitLot} onOpenChange={(open) => { if (!open) closeSplitDialog() }}>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Scissors className="w-4 h-4" />
                  {t("Split Lot", "تقسيم اللوط")} {splitLot?.lot_number ? <span className="font-mono text-sm">{splitLot.lot_number}</span> : null}
                </DialogTitle>
                <DialogDescription>
                  {splitLot && (
                    <>
                      <span className="font-medium">{splitLot.product_name}</span>
                      {" — "}
                      {t("Lot quantity", "كمية اللوط")}: <span className="font-semibold">{splitLot.original_quantity}</span>
                      {splitLot.units_per_carton && splitLot.cartons !== null && (
                        <> {" "}({t(`≈ ${splitLot.cartons} cartons of ${splitLot.units_per_carton}`, `≈ ${splitLot.cartons} كرتونة × ${splitLot.units_per_carton} عبوة`)})</>
                      )}
                    </>
                  )}
                </DialogDescription>
              </DialogHeader>

              {splitLot && (
                <div className="space-y-3">
                  {/* تقسيم بالكراتين — تعبئة تلقائية بصفوف بعدد عبوات الكرتونة */}
                  {splitLot.units_per_carton && splitLot.units_per_carton > 0 && splitLot.original_quantity > splitLot.units_per_carton ? (
                    <Button type="button" size="sm" variant="secondary" onClick={prefillByCartons} disabled={isSplitting}>
                      <Boxes className="w-3.5 h-3.5 ml-1" />
                      {t("Split by cartons", "تقسيم بالكراتين")}
                      <span className="mr-1 text-xs text-muted-foreground">({splitLot.units_per_carton} {t("units each", "عبوة لكل صف")})</span>
                    </Button>
                  ) : null}

                  {/* صفوف التقسيم — كمية + تاريخ صلاحية لكل لوط فرعى */}
                  <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                    <div className="grid grid-cols-[1fr_1fr_2rem] gap-2 text-xs text-gray-500">
                      <span>{t("Quantity", "الكمية")}</span>
                      <span>{t("Expiry Date", "تاريخ الانتهاء")}</span>
                      <span></span>
                    </div>
                    {splitRows.map((row, idx) => (
                      <div key={idx} className="grid grid-cols-[1fr_1fr_2rem] gap-2 items-center">
                        <Input
                          type="number"
                          min={0}
                          step="any"
                          className="h-9"
                          value={row.quantity}
                          onChange={(e) => setSplitRows(prev => prev.map((r, i) => i === idx ? { ...r, quantity: e.target.value } : r))}
                          disabled={isSplitting}
                        />
                        <Input
                          type="date"
                          className="h-9"
                          value={row.expiry_date}
                          onChange={(e) => setSplitRows(prev => prev.map((r, i) => i === idx ? { ...r, expiry_date: e.target.value } : r))}
                          disabled={isSplitting}
                        />
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-9 px-2 text-red-500 hover:text-red-600"
                          onClick={() => setSplitRows(prev => prev.filter((_, i) => i !== idx))}
                          disabled={isSplitting || splitRows.length <= 2}
                          title={t("Remove row", "حذف الصف")}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>

                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setSplitRows(prev => [...prev, { quantity: "", expiry_date: splitLot.expiry_date }])}
                    disabled={isSplitting}
                  >
                    <Plus className="w-3.5 h-3.5 ml-1" />
                    {t("Add row", "إضافة صف")}
                  </Button>

                  {/* مؤشر المجموع الحى — يجب أن يساوى كمية اللوط بالضبط */}
                  <div className={`text-sm font-semibold rounded-md px-3 py-2 ${splitSumOk ? 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-300' : 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300'}`}>
                    {t("Sum", "المجموع")}: {Math.round(splitSum * 1000) / 1000} / {splitTarget}
                    {!splitSumOk && (
                      <span className="mr-2 font-normal text-xs">
                        {t("(must equal the lot quantity exactly)", "(يجب أن يساوى كمية اللوط بالضبط)")}
                      </span>
                    )}
                  </div>
                </div>
              )}

              <DialogFooter className="gap-2">
                <Button variant="outline" onClick={closeSplitDialog} disabled={isSplitting}>
                  {t("Cancel", "إلغاء")}
                </Button>
                <Button onClick={handleSplitSubmit} disabled={!canSubmitSplit}>
                  {isSplitting ? t("Splitting...", "جارى التقسيم...") : t("Split", "تقسيم")}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </main>
    </div>
  )
}
