"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { useSupabase } from "@/lib/supabase/hooks"
import { useToast } from "@/hooks/use-toast"
import { useOrderPermissions } from "@/hooks/use-order-permissions"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Sidebar } from "@/components/sidebar"
import { ClipboardList, Save, Loader2 } from "lucide-react"
import { toastActionError, toastActionSuccess } from "@/lib/notifications"

export default function EditPurchaseOrderPage() {
  const supabase = useSupabase()
  const router = useRouter()
  const params = useParams()
  const { toast } = useToast()
  const orderId = Array.isArray(params?.id) ? params.id[0] : (params?.id as string)
  const { checkPurchaseOrderPermissions, showPermissionError } = useOrderPermissions()

  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [canEdit, setCanEdit] = useState(false)
  const [appLang, setAppLang] = useState<'ar' | 'en'>('ar')

  const [formData, setFormData] = useState({
    supplier_id: "",
    po_number: "",
    po_date: "",
    due_date: "",
    notes: "",
    subtotal: 0,
    tax_amount: 0,
    total: 0
  })

  useEffect(() => {
    loadOrder()
  }, [orderId])

  const loadOrder = async () => {
    try {
      setIsLoading(true)
      
      const { data: order } = await supabase
        .from("purchase_orders")
        .select("*")
        .eq("id", orderId)
        .single()

      if (order) {
        setFormData({
          supplier_id: order.supplier_id,
          po_number: order.po_number || "",
          po_date: order.po_date?.slice(0, 10) || "",
          due_date: order.due_date?.slice(0, 10) || "",
          notes: order.notes || "",
          subtotal: Number(order.subtotal || 0),
          tax_amount: Number(order.tax_amount || 0),
          total: Number(order.total || 0)
        })

        // التحقق من صلاحيات التعديل
        const permissions = await checkPurchaseOrderPermissions(orderId)
        setCanEdit(permissions.canEdit)
        if (!permissions.canEdit && permissions.reason) {
          showPermissionError(permissions.reason, appLang)
        }
      }
    } catch (error) {
      console.error("Error loading purchase order:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    
    // التحقق من الصلاحيات قبل الحفظ
    if (!canEdit) {
      const permissions = await checkPurchaseOrderPermissions(orderId)
      if (!permissions.canEdit) {
        showPermissionError(permissions.reason || 'Cannot edit this order', appLang)
        return
      }
    }

    try {
      setIsSaving(true)

      const { error } = await supabase
        .from("purchase_orders")
        .update({
          supplier_id: formData.supplier_id,
          po_number: formData.po_number,
          po_date: formData.po_date,
          due_date: formData.due_date,
          notes: formData.notes,
          updated_at: new Date().toISOString()
        })
        .eq("id", orderId)

      if (error) throw error

      toastActionSuccess(toast, appLang === 'en' ? "Update" : "التحديث", appLang === 'en' ? "Purchase Order" : "أمر الشراء")
      router.push(`/purchase-orders/${orderId}`)
    } catch (error: any) {
      console.error("Error updating purchase order:", error)
      toastActionError(toast, appLang === 'en' ? "Update" : "التحديث", appLang === 'en' ? "Purchase Order" : "أمر الشراء")
    } finally {
      setIsSaving(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen bg-white dark:bg-slate-950">
        <Sidebar />
        <main className="flex-1 md:mr-64 p-8 pt-20 md:pt-8">
          <div className="flex items-center justify-center h-64">
            <Loader2 className="h-8 w-8 animate-spin text-orange-600" />
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen bg-white dark:bg-slate-950">
      <Sidebar />
      <main className="flex-1 md:mr-64 p-8 pt-20 md:pt-8">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-2 bg-orange-100 dark:bg-orange-900/30 rounded-lg">
                <ClipboardList className="w-5 h-5 text-orange-600 dark:text-orange-400" />
              </div>
              <CardTitle>{appLang === 'en' ? 'Edit Purchase Order' : 'تعديل أمر الشراء'}</CardTitle>
              {!canEdit && (
                <div className="mr-auto px-3 py-1 bg-red-100 text-red-800 rounded-full text-sm">
                  {appLang === 'en' ? 'Read Only' : 'للقراءة فقط'}
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSave} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>{appLang === 'en' ? 'PO Number' : 'رقم أمر الشراء'}</Label>
                  <Input 
                    value={formData.po_number} 
                    onChange={(e) => setFormData({...formData, po_number: e.target.value})}
                    disabled={!canEdit}
                  />
                </div>
                <div>
                  <Label>{appLang === 'en' ? 'Order Date' : 'تاريخ الأمر'}</Label>
                  <Input 
                    type="date" 
                    value={formData.po_date} 
                    onChange={(e) => setFormData({...formData, po_date: e.target.value})}
                    disabled={!canEdit}
                  />
                </div>
                <div>
                  <Label>{appLang === 'en' ? 'Due Date' : 'تاريخ الاستحقاق'}</Label>
                  <Input 
                    type="date" 
                    value={formData.due_date} 
                    onChange={(e) => setFormData({...formData, due_date: e.target.value})}
                    disabled={!canEdit}
                  />
                </div>
                <div>
                  <Label>{appLang === 'en' ? 'Notes' : 'ملاحظات'}</Label>
                  <Input 
                    value={formData.notes} 
                    onChange={(e) => setFormData({...formData, notes: e.target.value})}
                    disabled={!canEdit}
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3">
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => router.push(`/purchase-orders/${orderId}`)}
                >
                  {appLang === 'en' ? 'Cancel' : 'إلغاء'}
                </Button>
                <Button 
                  type="submit" 
                  disabled={isSaving || !canEdit} 
                  className="bg-orange-600 hover:bg-orange-700 disabled:opacity-50"
                >
                  {isSaving ? (
                    <><Loader2 className="h-4 w-4 animate-spin ml-2" />{appLang === 'en' ? 'Saving...' : 'جاري الحفظ...'}</>
                  ) : (
                    <><Save className="h-4 w-4 ml-2" />{appLang === 'en' ? 'Save Changes' : 'حفظ التغييرات'}</>
                  )}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}