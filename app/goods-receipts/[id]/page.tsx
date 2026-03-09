"use client"

import { useEffect, useState, useMemo } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { Sidebar } from "@/components/sidebar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { useSupabase } from "@/lib/supabase/hooks"
import { useToast } from "@/hooks/use-toast"
import { toastActionError, toastActionSuccess } from "@/lib/notifications"
import { getActiveCompanyId } from "@/lib/company"
import { ArrowLeft, Loader2, CheckCircle, XCircle, Package, AlertCircle } from "lucide-react"
import { type UserContext, GOODS_RECEIPT_ROLE_PERMISSIONS } from "@/lib/validation"
import { useUserContext } from "@/hooks/use-user-context"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { notifyGRNApproved, notifyGRNRejected } from "@/lib/notification-helpers"
import { StatusBadge } from "@/components/DataTableFormatters"

interface GoodsReceipt {
  id: string
  company_id: string
  grn_number: string
  receipt_date: string
  status: string
  purchase_order_id: string | null
  bill_id: string | null
  warehouse_id: string | null
  branch_id: string | null
  cost_center_id: string | null
  notes: string | null
  created_by: string | null
  approved_by: string | null
  rejected_by: string | null
  rejection_reason: string | null
  purchase_order?: { id: string; po_number: string }
  bill?: { id: string; bill_number: string }
  warehouses?: { name: string }
  goods_receipt_items?: Array<{
    id: string
    product_id: string
    quantity_ordered: number
    quantity_received: number
    quantity_accepted: number
    quantity_rejected: number
    rejection_reason: string | null
    unit_price: number
    products?: { name: string; sku: string | null }
  }>
}

export default function GoodsReceiptDetailPage() {
  const supabase = useSupabase()
  const params = useParams()
  const router = useRouter()
  const { toast } = useToast()
  const [appLang, setAppLang] = useState<'ar' | 'en'>('ar')
  const grnId = params.id as string
  const [grn, setGrn] = useState<GoodsReceipt | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isProcessing, setIsProcessing] = useState(false)
  const [userContext, setUserContext] = useState<UserContext | null>(null)
  const [isApproveDialogOpen, setIsApproveDialogOpen] = useState(false)
  const [isRejectDialogOpen, setIsRejectDialogOpen] = useState(false)
  const [rejectionReason, setRejectionReason] = useState("")

  const { userContext: contextFromHook } = useUserContext()
  useEffect(() => {
    if (contextFromHook) {
      setUserContext(contextFromHook)
    }
  }, [contextFromHook])

  const permissions = useMemo(() => {
    if (!userContext) return null
    const role = userContext.role as keyof typeof GOODS_RECEIPT_ROLE_PERMISSIONS
    return GOODS_RECEIPT_ROLE_PERMISSIONS[role] || GOODS_RECEIPT_ROLE_PERMISSIONS.staff
  }, [userContext])

  useEffect(() => {
    try {
      const fromCookie = document.cookie.split('; ').find((x) => x.startsWith('app_language='))?.split('=')[1]
      setAppLang((fromCookie || localStorage.getItem('app_language') || 'ar') === 'en' ? 'en' : 'ar')
    } catch { }
  }, [])

  // Load GRN
  useEffect(() => {
    const loadGRN = async () => {
      try {
        setIsLoading(true)
        const companyId = await getActiveCompanyId(supabase)
        if (!companyId) return

        const { data, error } = await supabase
          .from("goods_receipts")
          .select(`
            *,
            purchase_order:purchase_orders!purchase_order_id (id, po_number),
            bill:bills!bill_id (id, bill_number),
            warehouses (id, name),
            goods_receipt_items (
              *,
              products (id, name, sku)
            )
          `)
          .eq("id", grnId)
          .eq("company_id", companyId)
          .single()

        if (error) throw error
        setGrn(data)
      } catch (err: any) {
        console.error("Error loading GRN:", err)
        toastActionError(toast, appLang === 'en' ? 'Load' : 'تحميل', appLang === 'en' ? 'Goods Receipt' : 'إيصال الاستلام')
      } finally {
        setIsLoading(false)
      }
    }

    if (grnId) {
      loadGRN()
    }
  }, [supabase, grnId])

  // Process GRN (approve/reject/receive)
  const handleProcessGRN = async (action: 'approve' | 'reject' | 'receive') => {
    if (!grn || !userContext) return

    try {
      setIsProcessing(true)
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const response = await fetch(`/api/goods-receipts/${grnId}/process`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          reason: action === 'reject' ? rejectionReason : null
        })
      })

      const result = await response.json()
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to process GRN')
      }

      // Send notifications
      if (action === 'approve') {
        await notifyGRNApproved({
          companyId: userContext.company_id,
          grnId: grn.id,
          grnNumber: grn.grn_number,
          supplierName: grn.purchase_order?.po_number || "Unknown",
          warehouseId: grn.warehouse_id || undefined,
          branchId: grn.branch_id || undefined,
          createdBy: grn.created_by || "",
          approvedBy: user.id,
          appLang
        })
      } else if (action === 'reject') {
        await notifyGRNRejected({
          companyId: userContext.company_id,
          grnId: grn.id,
          grnNumber: grn.grn_number,
          supplierName: grn.purchase_order?.po_number || "Unknown",
          warehouseId: grn.warehouse_id || undefined,
          branchId: grn.branch_id || undefined,
          createdBy: grn.created_by || "",
          rejectedBy: user.id,
          reason: rejectionReason,
          appLang
        })
      }

      toastActionSuccess(toast, appLang === 'en' ? action : action === 'approve' ? 'الموافقة' : action === 'reject' ? 'الرفض' : 'الاستلام', appLang === 'en' ? 'Goods Receipt' : 'إيصال الاستلام')
      setIsApproveDialogOpen(false)
      setIsRejectDialogOpen(false)
      setRejectionReason("")
      router.refresh()
      window.location.reload()
    } catch (err: any) {
      console.error("Error processing GRN:", err)
      toastActionError(toast, appLang === 'en' ? action : action === 'approve' ? 'الموافقة' : action === 'reject' ? 'الرفض' : 'الاستلام', appLang === 'en' ? 'Goods Receipt' : 'إيصال الاستلام')
    } finally {
      setIsProcessing(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
        <Sidebar />
        <main className="flex-1 md:mr-64 p-8 pt-20 md:pt-8 flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        </main>
      </div>
    )
  }

  if (!grn) {
    return (
      <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
        <Sidebar />
        <main className="flex-1 md:mr-64 p-8 pt-20 md:pt-8">
          <Card>
            <CardContent className="pt-6">
              <p className="text-center text-gray-500">{appLang === 'en' ? 'Goods Receipt not found' : 'إيصال الاستلام غير موجود'}</p>
            </CardContent>
          </Card>
        </main>
      </div>
    )
  }

  const canApprove = permissions?.canProcess && (grn.status === 'draft' || grn.status === 'pending_approval')
  const canReceive = permissions?.canProcess && grn.status === 'approved'

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
      <Sidebar />
      <main className="flex-1 md:mr-64 p-8 pt-20 md:pt-8">
        <div className="mb-4">
          <Button variant="ghost" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4 ml-1" />
            {appLang === 'en' ? 'Back' : 'رجوع'}
          </Button>
        </div>

        <Card>
          <CardHeader>
            <div className="flex justify-between items-start">
              <div>
                <CardTitle className="text-2xl">{grn.grn_number}</CardTitle>
                <div className="flex gap-2 mt-2">
                  <StatusBadge status={grn.status} lang={appLang} />
                </div>
              </div>
              <div className="flex gap-2">
                {canApprove && (
                  <>
                    <Button
                      variant="default"
                      className="bg-green-600 hover:bg-green-700"
                      onClick={() => setIsApproveDialogOpen(true)}
                    >
                      <CheckCircle className="h-4 w-4 ml-1" />
                      {appLang === 'en' ? 'Approve' : 'موافقة'}
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={() => setIsRejectDialogOpen(true)}
                    >
                      <XCircle className="h-4 w-4 ml-1" />
                      {appLang === 'en' ? 'Reject' : 'رفض'}
                    </Button>
                  </>
                )}
                {canReceive && (
                  <Button
                    variant="default"
                    onClick={() => handleProcessGRN('receive')}
                  >
                    <Package className="h-4 w-4 ml-1" />
                    {appLang === 'en' ? 'Receive Items' : 'استلام البضاعة'}
                  </Button>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="details" className="w-full">
              <TabsList>
                <TabsTrigger value="details">{appLang === 'en' ? 'Details' : 'التفاصيل'}</TabsTrigger>
                <TabsTrigger value="items">{appLang === 'en' ? 'Items' : 'العناصر'}</TabsTrigger>
              </TabsList>

              <TabsContent value="details" className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label className="text-gray-500">{appLang === 'en' ? 'Receipt Date' : 'تاريخ الاستلام'}</Label>
                    <p>{new Date(grn.receipt_date).toLocaleDateString(appLang === 'en' ? 'en-US' : 'ar-EG')}</p>
                  </div>
                  <div>
                    <Label className="text-gray-500">{appLang === 'en' ? 'Purchase Order' : 'أمر الشراء'}</Label>
                    {grn.purchase_order ? (
                      <Link href={`/purchase-orders/${grn.purchase_order.id}`} className="text-blue-600 hover:underline">
                        {grn.purchase_order.po_number}
                      </Link>
                    ) : (
                      <p>-</p>
                    )}
                  </div>
                  <div>
                    <Label className="text-gray-500">{appLang === 'en' ? 'Warehouse' : 'المخزن'}</Label>
                    <p>{grn.warehouses?.name || '-'}</p>
                  </div>
                  {grn.bill && (
                    <div>
                      <Label className="text-gray-500">{appLang === 'en' ? 'Bill' : 'الفاتورة'}</Label>
                      <Link href={`/bills/${grn.bill.id}`} className="text-blue-600 hover:underline">
                        {grn.bill.bill_number}
                      </Link>
                    </div>
                  )}
                  {grn.rejection_reason && (
                    <div className="md:col-span-2">
                      <Label className="text-gray-500">{appLang === 'en' ? 'Rejection Reason' : 'سبب الرفض'}</Label>
                      <p className="text-red-600">{grn.rejection_reason}</p>
                    </div>
                  )}
                  {grn.notes && (
                    <div className="md:col-span-2">
                      <Label className="text-gray-500">{appLang === 'en' ? 'Notes' : 'ملاحظات'}</Label>
                      <p className="whitespace-pre-wrap">{grn.notes}</p>
                    </div>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="items">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 dark:bg-slate-800 border-b">
                      <tr>
                        <th className="px-3 py-3 text-right">{appLang === 'en' ? 'Product' : 'المنتج'}</th>
                        <th className="px-3 py-3 text-center">{appLang === 'en' ? 'Ordered' : 'المطلوب'}</th>
                        <th className="px-3 py-3 text-center">{appLang === 'en' ? 'Received' : 'المستلم'}</th>
                        <th className="px-3 py-3 text-center">{appLang === 'en' ? 'Accepted' : 'المقبول'}</th>
                        <th className="px-3 py-3 text-center">{appLang === 'en' ? 'Rejected' : 'المرفوض'}</th>
                        <th className="px-3 py-3 text-center">{appLang === 'en' ? 'Rejection Reason' : 'سبب الرفض'}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {grn.goods_receipt_items?.map((item) => (
                        <tr key={item.id}>
                          <td className="px-3 py-3">
                            {item.products?.name || item.product_id}
                            {item.products?.sku && (
                              <span className="text-xs text-gray-500 ml-2">({item.products.sku})</span>
                            )}
                          </td>
                          <td className="px-3 py-3 text-center">{item.quantity_ordered}</td>
                          <td className="px-3 py-3 text-center">{item.quantity_received}</td>
                          <td className="px-3 py-3 text-center text-green-600 font-semibold">{item.quantity_accepted}</td>
                          <td className="px-3 py-3 text-center text-red-600">{item.quantity_rejected}</td>
                          <td className="px-3 py-3 text-center text-sm">
                            {item.rejection_reason || '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-gray-50 dark:bg-slate-800 border-t">
                      <tr>
                        <td colSpan={2} className="px-3 py-3 text-right font-semibold">
                          {appLang === 'en' ? 'Totals' : 'الإجمالي'}:
                        </td>
                        <td className="px-3 py-3 text-center font-semibold">
                          {grn.goods_receipt_items?.reduce((sum, item) => sum + item.quantity_received, 0) || 0}
                        </td>
                        <td className="px-3 py-3 text-center font-semibold text-green-600">
                          {grn.goods_receipt_items?.reduce((sum, item) => sum + item.quantity_accepted, 0) || 0}
                        </td>
                        <td className="px-3 py-3 text-center font-semibold text-red-600">
                          {grn.goods_receipt_items?.reduce((sum, item) => sum + item.quantity_rejected, 0) || 0}
                        </td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        {/* Approve Dialog */}
        <Dialog open={isApproveDialogOpen} onOpenChange={setIsApproveDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{appLang === 'en' ? 'Approve Goods Receipt' : 'الموافقة على إيصال الاستلام'}</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {appLang === 'en' 
                ? `Are you sure you want to approve ${grn.grn_number}? This will update inventory.`
                : `هل أنت متأكد من الموافقة على ${grn.grn_number}؟ سيتم تحديث المخزون.`}
            </p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsApproveDialogOpen(false)}>
                {appLang === 'en' ? 'Cancel' : 'إلغاء'}
              </Button>
              <Button onClick={() => handleProcessGRN('approve')} disabled={isProcessing} className="bg-green-600 hover:bg-green-700">
                {isProcessing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin ml-1" />
                    {appLang === 'en' ? 'Approving...' : 'جاري الموافقة...'}
                  </>
                ) : (
                  <>
                    <CheckCircle className="h-4 w-4 ml-1" />
                    {appLang === 'en' ? 'Approve' : 'موافقة'}
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Reject Dialog */}
        <Dialog open={isRejectDialogOpen} onOpenChange={setIsRejectDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{appLang === 'en' ? 'Reject Goods Receipt' : 'رفض إيصال الاستلام'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {appLang === 'en' 
                  ? `Please provide a reason for rejecting ${grn.grn_number}:`
                  : `يرجى إدخال سبب رفض ${grn.grn_number}:`}
              </p>
              <div>
                <Label>{appLang === 'en' ? 'Rejection Reason' : 'سبب الرفض'} *</Label>
                <Textarea
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  rows={3}
                  placeholder={appLang === 'en' ? 'Enter rejection reason...' : 'أدخل سبب الرفض...'}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsRejectDialogOpen(false)}>
                {appLang === 'en' ? 'Cancel' : 'إلغاء'}
              </Button>
              <Button 
                variant="destructive" 
                onClick={() => handleProcessGRN('reject')} 
                disabled={isProcessing || !rejectionReason.trim()}
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin ml-1" />
                    {appLang === 'en' ? 'Rejecting...' : 'جاري الرفض...'}
                  </>
                ) : (
                  <>
                    <XCircle className="h-4 w-4 ml-1" />
                    {appLang === 'en' ? 'Reject' : 'رفض'}
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  )
}
