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
import { Pencil, ArrowLeft, Loader2, CheckCircle, XCircle, FileText, AlertCircle, ShoppingCart } from "lucide-react"
import { type UserContext, PURCHASE_REQUEST_ROLE_PERMISSIONS } from "@/lib/validation"
import { useUserContext } from "@/hooks/use-user-context"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { notifyPurchaseRequestApproved, notifyPurchaseRequestRejected, notifyPurchaseRequestConverted } from "@/lib/notification-helpers"

interface PurchaseRequest {
  id: string
  company_id: string
  request_number: string
  request_date: string
  required_date: string | null
  priority: string
  status: string
  approval_status: string
  total_estimated_cost: number
  currency: string
  branch_id: string | null
  cost_center_id: string | null
  warehouse_id: string | null
  requested_by: string
  approved_by: string | null
  rejected_by: string | null
  rejection_reason: string | null
  converted_to_po_id: string | null
  converted_at: string | null
  notes: string | null
  requested_by_user?: { email: string }
  approved_by_user?: { email: string }
  converted_to_po?: { id: string; po_number: string }
  purchase_request_items?: Array<{
    id: string
    product_id: string | null
    description: string | null
    quantity_requested: number
    quantity_approved: number
    estimated_unit_price: number
    estimated_total: number
    item_type: string
    products?: { name: string; sku: string | null }
  }>
}

interface Supplier {
  id: string
  name: string
}

export default function PurchaseRequestDetailPage() {
  const supabase = useSupabase()
  const params = useParams()
  const router = useRouter()
  const { toast } = useToast()
  const [appLang, setAppLang] = useState<'ar' | 'en'>('ar')
  const requestId = params.id as string
  const [request, setRequest] = useState<PurchaseRequest | null>(null)
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isProcessing, setIsProcessing] = useState(false)
  const [userContext, setUserContext] = useState<UserContext | null>(null)
  const [isApproveDialogOpen, setIsApproveDialogOpen] = useState(false)
  const [isRejectDialogOpen, setIsRejectDialogOpen] = useState(false)
  const [isConvertDialogOpen, setIsConvertDialogOpen] = useState(false)
  const [rejectionReason, setRejectionReason] = useState("")
  const [selectedSupplierId, setSelectedSupplierId] = useState("")

  const { userContext: contextFromHook } = useUserContext()
  useEffect(() => {
    if (contextFromHook) {
      setUserContext(contextFromHook)
    }
  }, [contextFromHook])

  const permissions = useMemo(() => {
    if (!userContext) return null
    const role = userContext.role as keyof typeof PURCHASE_REQUEST_ROLE_PERMISSIONS
    return PURCHASE_REQUEST_ROLE_PERMISSIONS[role] || PURCHASE_REQUEST_ROLE_PERMISSIONS.staff
  }, [userContext])

  useEffect(() => {
    try {
      const fromCookie = document.cookie.split('; ').find((x) => x.startsWith('app_language='))?.split('=')[1]
      setAppLang((fromCookie || localStorage.getItem('app_language') || 'ar') === 'en' ? 'en' : 'ar')
    } catch { }
  }, [])

  // Load request
  useEffect(() => {
    const loadRequest = async () => {
      try {
        setIsLoading(true)
        const companyId = await getActiveCompanyId(supabase)
        if (!companyId) return

        const { data, error } = await supabase
          .from("purchase_requests")
          .select(`
            *,
            requested_by_user:requested_by (id, email),
            approved_by_user:approved_by (id, email),
            converted_to_po:purchase_orders!converted_to_po_id (id, po_number),
            purchase_request_items (
              *,
              products (id, name, sku)
            )
          `)
          .eq("id", requestId)
          .eq("company_id", companyId)
          .single()

        if (error) throw error
        setRequest(data)

        // Load suppliers for conversion
        const { data: suppData } = await supabase
          .from("suppliers")
          .select("id, name")
          .eq("company_id", companyId)
          .order("name")
        setSuppliers(suppData || [])
      } catch (err: any) {
        console.error("Error loading request:", err)
        toastActionError(toast, appLang === 'en' ? 'Load' : 'تحميل', appLang === 'en' ? 'Purchase Request' : 'طلب الشراء')
      } finally {
        setIsLoading(false)
      }
    }

    if (requestId) {
      loadRequest()
    }
  }, [supabase, requestId])

  // Approve request
  const handleApprove = async () => {
    if (!request || !userContext) return

    try {
      setIsProcessing(true)
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { error } = await supabase
        .from("purchase_requests")
        .update({
          status: 'approved',
          approval_status: 'approved',
          approved_by: user.id,
          approved_at: new Date().toISOString()
        })
        .eq("id", requestId)

      if (error) throw error

      // Notify requester
      await notifyPurchaseRequestApproved({
        companyId: userContext.company_id,
        requestId: request.id,
        requestNumber: request.request_number,
        amount: request.total_estimated_cost,
        currency: request.currency,
        branchId: request.branch_id || undefined,
        costCenterId: request.cost_center_id || undefined,
        createdBy: request.requested_by,
        approvedBy: user.id,
        appLang
      })

      toastActionSuccess(toast, appLang === 'en' ? 'Approve' : 'الموافقة', appLang === 'en' ? 'Purchase Request' : 'طلب الشراء')
      setIsApproveDialogOpen(false)
      router.refresh()
      window.location.reload()
    } catch (err: any) {
      console.error("Error approving request:", err)
      toastActionError(toast, appLang === 'en' ? 'Approve' : 'الموافقة', appLang === 'en' ? 'Purchase Request' : 'طلب الشراء')
    } finally {
      setIsProcessing(false)
    }
  }

  // Reject request
  const handleReject = async () => {
    if (!request || !userContext || !rejectionReason.trim()) return

    try {
      setIsProcessing(true)
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { error } = await supabase
        .from("purchase_requests")
        .update({
          status: 'rejected',
          approval_status: 'rejected',
          rejected_by: user.id,
          rejected_at: new Date().toISOString(),
          rejection_reason: rejectionReason
        })
        .eq("id", requestId)

      if (error) throw error

      // Notify requester
      await notifyPurchaseRequestRejected({
        companyId: userContext.company_id,
        requestId: request.id,
        requestNumber: request.request_number,
        amount: request.total_estimated_cost,
        currency: request.currency,
        branchId: request.branch_id || undefined,
        costCenterId: request.cost_center_id || undefined,
        createdBy: request.requested_by,
        rejectedBy: user.id,
        reason: rejectionReason,
        appLang
      })

      toastActionSuccess(toast, appLang === 'en' ? 'Reject' : 'الرفض', appLang === 'en' ? 'Purchase Request' : 'طلب الشراء')
      setIsRejectDialogOpen(false)
      setRejectionReason("")
      router.refresh()
      window.location.reload()
    } catch (err: any) {
      console.error("Error rejecting request:", err)
      toastActionError(toast, appLang === 'en' ? 'Reject' : 'الرفض', appLang === 'en' ? 'Purchase Request' : 'طلب الشراء')
    } finally {
      setIsProcessing(false)
    }
  }

  // Convert to PO
  const handleConvert = async () => {
    if (!request || !userContext || !selectedSupplierId) return

    try {
      setIsProcessing(true)
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const response = await fetch(`/api/purchase-requests/${requestId}/convert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ supplier_id: selectedSupplierId })
      })

      const result = await response.json()
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to convert request')
      }

      // Notify requester
      await notifyPurchaseRequestConverted({
        companyId: userContext.company_id,
        requestId: request.id,
        requestNumber: request.request_number,
        poId: result.data.po_id,
        poNumber: result.data.po_number,
        createdBy: request.requested_by,
        appLang
      })

      toastActionSuccess(toast, appLang === 'en' ? 'Convert' : 'التحويل', appLang === 'en' ? 'Purchase Request converted to PO' : 'تم تحويل طلب الشراء إلى أمر شراء')
      setIsConvertDialogOpen(false)
      router.push(`/purchase-orders/${result.data.po_id}`)
    } catch (err: any) {
      console.error("Error converting request:", err)
      toastActionError(toast, appLang === 'en' ? 'Convert' : 'التحويل', appLang === 'en' ? 'Purchase Request' : 'طلب الشراء', err.message)
    } finally {
      setIsProcessing(false)
    }
  }

  const getStatusBadge = (status: string) => {
    const colors: Record<string, string> = {
      draft: 'bg-gray-100 text-gray-800',
      submitted: 'bg-blue-100 text-blue-800',
      pending_approval: 'bg-yellow-100 text-yellow-800',
      approved: 'bg-green-100 text-green-800',
      rejected: 'bg-red-100 text-red-800',
      converted_to_po: 'bg-purple-100 text-purple-800',
      cancelled: 'bg-gray-100 text-gray-800'
    }
    const labels: Record<string, { ar: string; en: string }> = {
      draft: { ar: 'مسودة', en: 'Draft' },
      submitted: { ar: 'مقدم', en: 'Submitted' },
      pending_approval: { ar: 'في انتظار الموافقة', en: 'Pending Approval' },
      approved: { ar: 'معتمد', en: 'Approved' },
      rejected: { ar: 'مرفوض', en: 'Rejected' },
      converted_to_po: { ar: 'محول إلى أمر شراء', en: 'Converted to PO' },
      cancelled: { ar: 'ملغي', en: 'Cancelled' }
    }
    return (
      <span className={`px-3 py-1 rounded-full text-sm font-medium ${colors[status] || colors.draft}`}>
        {labels[status]?.[appLang] || status}
      </span>
    )
  }

  const getPriorityBadge = (priority: string) => {
    const colors: Record<string, string> = {
      low: 'bg-gray-100 text-gray-800',
      normal: 'bg-blue-100 text-blue-800',
      high: 'bg-orange-100 text-orange-800',
      urgent: 'bg-red-100 text-red-800'
    }
    const labels: Record<string, { ar: string; en: string }> = {
      low: { ar: 'منخفض', en: 'Low' },
      normal: { ar: 'عادي', en: 'Normal' },
      high: { ar: 'عالي', en: 'High' },
      urgent: { ar: 'عاجل', en: 'Urgent' }
    }
    return (
      <span className={`px-3 py-1 rounded-full text-sm font-medium ${colors[priority] || colors.normal}`}>
        {labels[priority]?.[appLang] || priority}
      </span>
    )
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

  if (!request) {
    return (
      <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
        <Sidebar />
        <main className="flex-1 md:mr-64 p-8 pt-20 md:pt-8">
          <Card>
            <CardContent className="pt-6">
              <p className="text-center text-gray-500">{appLang === 'en' ? 'Purchase Request not found' : 'طلب الشراء غير موجود'}</p>
            </CardContent>
          </Card>
        </main>
      </div>
    )
  }

  const canApprove = permissions?.canApprove && (request.status === 'submitted' || request.status === 'pending_approval')
  const canConvert = permissions?.canConvert && request.status === 'approved' && !request.converted_to_po_id
  const canEdit = permissions?.canEditDraft && request.status === 'draft'

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
                <CardTitle className="text-2xl">{request.request_number}</CardTitle>
                <div className="flex gap-2 mt-2">
                  {getStatusBadge(request.status)}
                  {getPriorityBadge(request.priority)}
                </div>
              </div>
              <div className="flex gap-2">
                {canEdit && (
                  <Link href={`/purchase-requests/${requestId}/edit`}>
                    <Button variant="outline">
                      <Pencil className="h-4 w-4 ml-1" />
                      {appLang === 'en' ? 'Edit' : 'تعديل'}
                    </Button>
                  </Link>
                )}
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
                {canConvert && (
                  <Button
                    variant="default"
                    onClick={() => setIsConvertDialogOpen(true)}
                  >
                    <ShoppingCart className="h-4 w-4 ml-1" />
                    {appLang === 'en' ? 'Convert to PO' : 'تحويل إلى أمر شراء'}
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
                    <Label className="text-gray-500">{appLang === 'en' ? 'Request Date' : 'تاريخ الطلب'}</Label>
                    <p>{new Date(request.request_date).toLocaleDateString(appLang === 'en' ? 'en-US' : 'ar-EG')}</p>
                  </div>
                  <div>
                    <Label className="text-gray-500">{appLang === 'en' ? 'Required Date' : 'تاريخ الحاجة'}</Label>
                    <p>{request.required_date ? new Date(request.required_date).toLocaleDateString(appLang === 'en' ? 'en-US' : 'ar-EG') : '-'}</p>
                  </div>
                  <div>
                    <Label className="text-gray-500">{appLang === 'en' ? 'Requested By' : 'طلب بواسطة'}</Label>
                    <p>{request.requested_by_user?.email || request.requested_by}</p>
                  </div>
                  <div>
                    <Label className="text-gray-500">{appLang === 'en' ? 'Estimated Cost' : 'التكلفة المقدرة'}</Label>
                    <p className="font-semibold">{request.currency} {Number(request.total_estimated_cost || 0).toFixed(2)}</p>
                  </div>
                  {request.approved_by && (
                    <div>
                      <Label className="text-gray-500">{appLang === 'en' ? 'Approved By' : 'وافق عليه'}</Label>
                      <p>{request.approved_by_user?.email || request.approved_by}</p>
                    </div>
                  )}
                  {request.rejected_by && (
                    <div>
                      <Label className="text-gray-500">{appLang === 'en' ? 'Rejected By' : 'رفضه'}</Label>
                      <p>{request.rejected_by}</p>
                      {request.rejection_reason && (
                        <p className="text-red-600 mt-1">{request.rejection_reason}</p>
                      )}
                    </div>
                  )}
                  {request.converted_to_po && (
                    <div>
                      <Label className="text-gray-500">{appLang === 'en' ? 'Converted to PO' : 'محول إلى أمر شراء'}</Label>
                      <Link href={`/purchase-orders/${request.converted_to_po.id}`} className="text-blue-600 hover:underline">
                        {request.converted_to_po.po_number}
                      </Link>
                    </div>
                  )}
                  {request.notes && (
                    <div className="md:col-span-2">
                      <Label className="text-gray-500">{appLang === 'en' ? 'Notes' : 'ملاحظات'}</Label>
                      <p className="whitespace-pre-wrap">{request.notes}</p>
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
                        <th className="px-3 py-3 text-center">{appLang === 'en' ? 'Qty Requested' : 'الكمية المطلوبة'}</th>
                        <th className="px-3 py-3 text-center">{appLang === 'en' ? 'Qty Approved' : 'الكمية المعتمدة'}</th>
                        <th className="px-3 py-3 text-center">{appLang === 'en' ? 'Est. Price' : 'السعر المقدر'}</th>
                        <th className="px-3 py-3 text-center">{appLang === 'en' ? 'Total' : 'الإجمالي'}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {request.purchase_request_items?.map((item) => (
                        <tr key={item.id}>
                          <td className="px-3 py-3">
                            {item.products?.name || item.description || item.product_id || '-'}
                            {item.products?.sku && (
                              <span className="text-xs text-gray-500 ml-2">({item.products.sku})</span>
                            )}
                          </td>
                          <td className="px-3 py-3 text-center">{item.quantity_requested}</td>
                          <td className="px-3 py-3 text-center">
                            <span className={item.quantity_approved > 0 ? 'font-semibold text-green-600' : ''}>
                              {item.quantity_approved}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-center">{request.currency} {Number(item.estimated_unit_price || 0).toFixed(2)}</td>
                          <td className="px-3 py-3 text-center">{request.currency} {Number(item.estimated_total || 0).toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-gray-50 dark:bg-slate-800 border-t">
                      <tr>
                        <td colSpan={4} className="px-3 py-3 text-right font-semibold">
                          {appLang === 'en' ? 'Total Estimated Cost' : 'إجمالي التكلفة المقدرة'}:
                        </td>
                        <td className="px-3 py-3 text-center font-semibold">
                          {request.currency} {Number(request.total_estimated_cost || 0).toFixed(2)}
                        </td>
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
              <DialogTitle>{appLang === 'en' ? 'Approve Purchase Request' : 'الموافقة على طلب الشراء'}</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {appLang === 'en' 
                ? `Are you sure you want to approve ${request.request_number}?`
                : `هل أنت متأكد من الموافقة على ${request.request_number}؟`}
            </p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsApproveDialogOpen(false)}>
                {appLang === 'en' ? 'Cancel' : 'إلغاء'}
              </Button>
              <Button onClick={handleApprove} disabled={isProcessing} className="bg-green-600 hover:bg-green-700">
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
              <DialogTitle>{appLang === 'en' ? 'Reject Purchase Request' : 'رفض طلب الشراء'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {appLang === 'en' 
                  ? `Please provide a reason for rejecting ${request.request_number}:`
                  : `يرجى إدخال سبب رفض ${request.request_number}:`}
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
                onClick={handleReject} 
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

        {/* Convert Dialog */}
        <Dialog open={isConvertDialogOpen} onOpenChange={setIsConvertDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{appLang === 'en' ? 'Convert to Purchase Order' : 'تحويل إلى أمر شراء'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {appLang === 'en' 
                  ? `Select a supplier to convert ${request.request_number} to a Purchase Order:`
                  : `اختر مورداً لتحويل ${request.request_number} إلى أمر شراء:`}
              </p>
              <div>
                <Label>{appLang === 'en' ? 'Supplier' : 'المورد'} *</Label>
                <Select value={selectedSupplierId} onValueChange={setSelectedSupplierId}>
                  <SelectTrigger>
                    <SelectValue placeholder={appLang === 'en' ? 'Select supplier' : 'اختر المورد'} />
                  </SelectTrigger>
                  <SelectContent>
                    {suppliers.map(s => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsConvertDialogOpen(false)}>
                {appLang === 'en' ? 'Cancel' : 'إلغاء'}
              </Button>
              <Button 
                onClick={handleConvert} 
                disabled={isProcessing || !selectedSupplierId}
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin ml-1" />
                    {appLang === 'en' ? 'Converting...' : 'جاري التحويل...'}
                  </>
                ) : (
                  <>
                    <ShoppingCart className="h-4 w-4 ml-1" />
                    {appLang === 'en' ? 'Convert' : 'تحويل'}
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
