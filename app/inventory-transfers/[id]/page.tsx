"use client"

import { useState, useEffect, use } from "react"
import { Sidebar } from "@/components/sidebar"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { createClient } from "@/lib/supabase/client"
import { useToast } from "@/hooks/use-toast"
import { getActiveCompanyId } from "@/lib/company"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { ArrowLeftRight, Warehouse, Package, CheckCircle2, Clock, XCircle, Truck, ArrowLeft, User, Calendar, FileText, Send, PackageCheck, X } from "lucide-react"

interface TransferData {
  id: string
  transfer_number: string
  status: string
  transfer_date: string
  expected_arrival_date?: string
  received_date?: string
  notes?: string
  rejection_reason?: string
  source_warehouse_id: string
  destination_warehouse_id: string
  created_by: string
  received_by?: string
  source_warehouses?: { id: string; name: string }
  destination_warehouses?: { id: string; name: string }
  items?: TransferItem[]
}

interface TransferItem {
  id: string
  product_id: string
  quantity_requested: number
  quantity_sent: number
  quantity_received: number
  notes?: string
  products?: { id: string; name: string; sku: string }
}

export default function TransferDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params)
  const supabase = createClient()
  const { toast } = useToast()
  const router = useRouter()

  const [appLang, setAppLang] = useState<'ar' | 'en'>('ar')
  const [transfer, setTransfer] = useState<TransferData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isProcessing, setIsProcessing] = useState(false)
  const [userRole, setUserRole] = useState<string>("")
  const [userId, setUserId] = useState<string>("")
  const [companyId, setCompanyId] = useState<string>("")
  const [userWarehouseId, setUserWarehouseId] = useState<string | null>(null)

  // للاستلام
  const [receivedQuantities, setReceivedQuantities] = useState<Record<string, number>>({})
  const [rejectionReason, setRejectionReason] = useState("")

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

  useEffect(() => {
    loadData()
  }, [resolvedParams.id])

  const loadData = async () => {
    try {
      setIsLoading(true)
      const cId = await getActiveCompanyId(supabase)
      if (!cId) return
      setCompanyId(cId)

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setUserId(user.id)

      const { data: member } = await supabase
        .from("company_members")
        .select("role, warehouse_id")
        .eq("company_id", cId)
        .eq("user_id", user.id)
        .single()

      setUserRole(member?.role || "staff")
      setUserWarehouseId(member?.warehouse_id || null)

      // جلب تفاصيل النقل
      const { data: transferData, error } = await supabase
        .from("inventory_transfers")
        .select(`
          *,
          source_warehouses:warehouses!inventory_transfers_source_warehouse_id_fkey(id, name),
          destination_warehouses:warehouses!inventory_transfers_destination_warehouse_id_fkey(id, name)
        `)
        .eq("id", resolvedParams.id)
        .single()

      if (error) throw error

      // جلب البنود
      const { data: itemsData } = await supabase
        .from("inventory_transfer_items")
        .select(`
          *,
          products(id, name, sku)
        `)
        .eq("transfer_id", resolvedParams.id)

      setTransfer({ ...transferData, items: itemsData || [] })

      // تهيئة الكميات المستلمة
      const initReceived: Record<string, number> = {}
        ; (itemsData || []).forEach((item: TransferItem) => {
          initReceived[item.id] = item.quantity_sent || item.quantity_requested
        })
      setReceivedQuantities(initReceived)
    } catch (error) {
      console.error("Error loading transfer:", error)
      toast({ title: appLang === 'en' ? 'Error loading data' : 'خطأ في تحميل البيانات', variant: 'destructive' })
    } finally {
      setIsLoading(false)
    }
  }

  const canManage = ["owner", "admin", "manager"].includes(userRole)
  // صلاحية الاستلام: فقط مسؤول المخزن الوجهة أو owner/admin
  const isDestinationWarehouseManager = transfer?.destination_warehouse_id === userWarehouseId && userWarehouseId !== null
  const canReceive = ["owner", "admin"].includes(userRole) || isDestinationWarehouseManager

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge className="gap-1 bg-yellow-100 text-yellow-800 border-yellow-300"><Clock className="w-3 h-3" />{appLang === 'en' ? 'Pending Approval' : 'قيد الانتظار'}</Badge>
      case 'in_transit':
        return <Badge className="gap-1 bg-blue-100 text-blue-800 border-blue-300"><Truck className="w-3 h-3" />{appLang === 'en' ? 'In Transit' : 'قيد النقل'}</Badge>
      case 'received':
        return <Badge className="gap-1 bg-green-100 text-green-800 border-green-300"><CheckCircle2 className="w-3 h-3" />{appLang === 'en' ? 'Received' : 'تم الاستلام'}</Badge>
      case 'cancelled':
        return <Badge className="gap-1 bg-gray-100 text-gray-800 border-gray-300"><XCircle className="w-3 h-3" />{appLang === 'en' ? 'Cancelled' : 'ملغي'}</Badge>
      case 'rejected':
        return <Badge variant="destructive" className="gap-1"><XCircle className="w-3 h-3" />{appLang === 'en' ? 'Rejected' : 'مرفوض'}</Badge>
      default:
        return <Badge variant="outline">{status}</Badge>
    }
  }

  // بدء النقل (خصم من المصدر)
  const handleStartTransfer = async () => {
    if (!transfer) return
    try {
      setIsProcessing(true)
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // تحديث حالة النقل
      const { error: updateError } = await supabase
        .from("inventory_transfers")
        .update({
          status: 'in_transit',
          approved_by: user.id,
          updated_at: new Date().toISOString()
        })
        .eq("id", transfer.id)

      if (updateError) throw updateError

      // تحديث الكميات المرسلة
      for (const item of transfer.items || []) {
        await supabase
          .from("inventory_transfer_items")
          .update({ quantity_sent: item.quantity_requested })
          .eq("id", item.id)
      }

      // إنشاء حركات خصم من المخزن المصدر
      for (const item of transfer.items || []) {
        await supabase
          .from("inventory_transactions")
          .insert({
            company_id: companyId,
            product_id: item.product_id,
            warehouse_id: transfer.source_warehouse_id,
            transaction_type: 'transfer_out',
            quantity_change: -item.quantity_requested,
            reference_type: 'transfer',
            reference_id: transfer.id,
            notes: `نقل إلى ${(transfer.destination_warehouses as any)?.name || 'مخزن آخر'} - ${transfer.transfer_number}`,
            created_by: user.id
          })
      }

      toast({ title: appLang === 'en' ? 'Transfer started successfully' : 'تم بدء النقل بنجاح' })
      loadData()
    } catch (error) {
      console.error("Error:", error)
      toast({ title: appLang === 'en' ? 'Error starting transfer' : 'خطأ في بدء النقل', variant: 'destructive' })
    } finally {
      setIsProcessing(false)
    }
  }

  // اعتماد الاستلام
  const handleReceive = async () => {
    if (!transfer) return
    try {
      setIsProcessing(true)
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // تحديث حالة النقل
      const { error: updateError } = await supabase
        .from("inventory_transfers")
        .update({
          status: 'received',
          received_by: user.id,
          received_date: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq("id", transfer.id)

      if (updateError) throw updateError

      // تحديث الكميات المستلمة وإضافة للمخزن الوجهة
      for (const item of transfer.items || []) {
        const receivedQty = receivedQuantities[item.id] || item.quantity_sent || item.quantity_requested

        await supabase
          .from("inventory_transfer_items")
          .update({ quantity_received: receivedQty })
          .eq("id", item.id)

        // إضافة للمخزن الوجهة
        await supabase
          .from("inventory_transactions")
          .insert({
            company_id: companyId,
            product_id: item.product_id,
            warehouse_id: transfer.destination_warehouse_id,
            transaction_type: 'transfer_in',
            quantity_change: receivedQty,
            reference_type: 'transfer',
            reference_id: transfer.id,
            notes: `استلام من ${(transfer.source_warehouses as any)?.name || 'مخزن آخر'} - ${transfer.transfer_number}`,
            created_by: user.id
          })
      }

      toast({ title: appLang === 'en' ? 'Products received successfully' : 'تم استلام المنتجات بنجاح' })
      loadData()
    } catch (error) {
      console.error("Error:", error)
      toast({ title: appLang === 'en' ? 'Error receiving products' : 'خطأ في استلام المنتجات', variant: 'destructive' })
    } finally {
      setIsProcessing(false)
    }
  }

  // إلغاء النقل
  const handleCancel = async () => {
    if (!transfer) return
    try {
      setIsProcessing(true)

      await supabase
        .from("inventory_transfers")
        .update({
          status: 'cancelled',
          rejection_reason: rejectionReason || null,
          updated_at: new Date().toISOString()
        })
        .eq("id", transfer.id)

      toast({ title: appLang === 'en' ? 'Transfer cancelled' : 'تم إلغاء النقل' })
      loadData()
    } catch (error) {
      console.error("Error:", error)
      toast({ title: appLang === 'en' ? 'Error cancelling transfer' : 'خطأ في إلغاء النقل', variant: 'destructive' })
    } finally {
      setIsProcessing(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
        <Sidebar />
        <main className="flex-1 md:mr-64 p-4 md:p-8 pt-20 md:pt-8">
          <div className="animate-pulse space-y-4 max-w-4xl mx-auto">
            <div className="h-24 bg-gray-200 dark:bg-slate-800 rounded-2xl"></div>
            <div className="h-64 bg-gray-200 dark:bg-slate-800 rounded-2xl"></div>
          </div>
        </main>
      </div>
    )
  }

  if (!transfer) {
    return (
      <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
        <Sidebar />
        <main className="flex-1 md:mr-64 p-4 md:p-8 pt-20 md:pt-8">
          <div className="text-center py-12">
            <p className="text-gray-500">{appLang === 'en' ? 'Transfer not found' : 'طلب النقل غير موجود'}</p>
            <Link href="/inventory-transfers">
              <Button variant="outline" className="mt-4 gap-2">
                <ArrowLeft className="w-4 h-4" />
                {appLang === 'en' ? 'Back to Transfers' : 'العودة لطلبات النقل'}
              </Button>
            </Link>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
      <Sidebar />
      <main className="flex-1 md:mr-64 p-4 md:p-8 pt-20 md:pt-8">
        <div className="space-y-6 max-w-4xl mx-auto">
          {/* Header */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-800 p-6">
            <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-4">
              <div className="flex items-center gap-4">
                <Link href="/inventory-transfers">
                  <Button variant="ghost" size="icon"><ArrowLeft className="w-5 h-5" /></Button>
                </Link>
                <div className="p-3 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl shadow-lg">
                  <ArrowLeftRight className="w-8 h-8 text-white" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
                    {transfer.transfer_number}
                    {getStatusBadge(transfer.status)}
                  </h1>
                  <p className="text-gray-500 dark:text-gray-400 flex items-center gap-2 mt-1">
                    <Calendar className="w-4 h-4" />
                    {new Date(transfer.transfer_date).toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' })}
                  </p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2 flex-wrap">
                {transfer.status === 'pending' && canManage && (
                  <>
                    <Button onClick={handleStartTransfer} disabled={isProcessing} className="gap-2 bg-blue-600 hover:bg-blue-700">
                      <Send className="w-4 h-4" />
                      {appLang === 'en' ? 'Start Transfer' : 'بدء النقل'}
                    </Button>
                    <Button variant="destructive" onClick={handleCancel} disabled={isProcessing} className="gap-2">
                      <X className="w-4 h-4" />
                      {appLang === 'en' ? 'Cancel' : 'إلغاء'}
                    </Button>
                  </>
                )}
                {transfer.status === 'in_transit' && canReceive && (
                  <Button onClick={handleReceive} disabled={isProcessing} className="gap-2 bg-green-600 hover:bg-green-700">
                    <PackageCheck className="w-4 h-4" />
                    {appLang === 'en' ? 'Confirm Receipt' : 'اعتماد الاستلام'}
                  </Button>
                )}
              </div>
            </div>
          </div>

          {/* Warehouse Info */}
          <div className="grid md:grid-cols-2 gap-4">
            <Card className="bg-white dark:bg-slate-900 border-0 shadow-sm">
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-2">
                  <Warehouse className="w-4 h-4" />
                  {appLang === 'en' ? 'Source Warehouse' : 'المخزن المصدر'}
                </CardDescription>
                <CardTitle className="text-lg">{(transfer.source_warehouses as any)?.name || '-'}</CardTitle>
              </CardHeader>
            </Card>
            <Card className="bg-white dark:bg-slate-900 border-0 shadow-sm border-r-4 border-r-green-500">
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-2">
                  <Warehouse className="w-4 h-4 text-green-500" />
                  {appLang === 'en' ? 'Destination Warehouse' : 'المخزن الوجهة'}
                </CardDescription>
                <CardTitle className="text-lg">{(transfer.destination_warehouses as any)?.name || '-'}</CardTitle>
              </CardHeader>
            </Card>
          </div>

          {/* Products Table */}
          <Card className="bg-white dark:bg-slate-900 border-0 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Package className="w-5 h-5 text-indigo-500" />
                {appLang === 'en' ? 'Products' : 'المنتجات'}
                <Badge variant="secondary">{transfer.items?.length || 0}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-slate-800">
                  <tr>
                    <th className="px-4 py-3 text-right">{appLang === 'en' ? 'Product' : 'المنتج'}</th>
                    <th className="px-4 py-3 text-center">{appLang === 'en' ? 'SKU' : 'الكود'}</th>
                    <th className="px-4 py-3 text-center">{appLang === 'en' ? 'Requested' : 'المطلوب'}</th>
                    <th className="px-4 py-3 text-center">{appLang === 'en' ? 'Sent' : 'المرسل'}</th>
                    <th className="px-4 py-3 text-center">{appLang === 'en' ? 'Received' : 'المستلم'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
                  {(transfer.items || []).map((item) => (
                    <tr key={item.id}>
                      <td className="px-4 py-3 font-medium">{(item.products as any)?.name || '-'}</td>
                      <td className="px-4 py-3 text-center text-gray-500">{(item.products as any)?.sku || '-'}</td>
                      <td className="px-4 py-3 text-center">{item.quantity_requested}</td>
                      <td className="px-4 py-3 text-center">{item.quantity_sent || '-'}</td>
                      <td className="px-4 py-3 text-center">
                        {transfer.status === 'in_transit' && canReceive ? (
                          <Input
                            type="number"
                            className="w-20 mx-auto text-center"
                            value={receivedQuantities[item.id] || 0}
                            onChange={e => setReceivedQuantities({ ...receivedQuantities, [item.id]: parseInt(e.target.value) || 0 })}
                            min={0}
                            max={item.quantity_sent || item.quantity_requested}
                          />
                        ) : (
                          item.quantity_received || '-'
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>

          {/* Notes */}
          {transfer.notes && (
            <Card className="bg-white dark:bg-slate-900 border-0 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <FileText className="w-4 h-4 text-gray-500" />
                  {appLang === 'en' ? 'Notes' : 'ملاحظات'}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-600 dark:text-gray-400">{transfer.notes}</p>
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </div>
  )
}
