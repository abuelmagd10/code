import { useOrderPermissions } from '@/hooks/use-order-permissions'
import { Button } from '@/components/ui/button'
import { Eye, Pencil, Trash2, FileText, Send, Receipt, CreditCard } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useState } from 'react'

interface OrderActionsProps {
  orderId: string
  orderType: 'sales' | 'purchase'
  orderStatus: string
  invoiceId?: string | null
  invoiceStatus?: string
  hasPayments?: boolean
  onDelete?: () => void
  onConvertToInvoice?: () => void
  onSendInvoice?: () => void
  onRecordPayment?: () => void
  lang: 'ar' | 'en'
  permissions: {
    canView: boolean
    canEdit: boolean
    canDelete: boolean
    canCreate: boolean
  }
}

export const OrderActions = ({
  orderId,
  orderType,
  orderStatus,
  invoiceId,
  invoiceStatus,
  hasPayments,
  onDelete,
  onConvertToInvoice,
  onSendInvoice,
  onRecordPayment,
  lang,
  permissions
}: OrderActionsProps) => {
  const { checkSalesOrderPermissions, checkPurchaseOrderPermissions, showPermissionError } = useOrderPermissions()
  const [canEdit, setCanEdit] = useState(false)
  const [canDelete, setCanDelete] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const checkPermissions = async () => {
      setLoading(true)
      try {
        const orderPermissions = orderType === 'sales'
          ? await checkSalesOrderPermissions(orderId)
          : await checkPurchaseOrderPermissions(orderId)

        setCanEdit(orderPermissions.canEdit)
        setCanDelete(orderPermissions.canDelete)
      } catch (error) {
        console.error('Error checking permissions:', error)
        setCanEdit(false)
        setCanDelete(false)
      } finally {
        setLoading(false)
      }
    }

    checkPermissions()
  }, [orderId, orderType, orderStatus, invoiceId, invoiceStatus, hasPayments])

  if (loading) {
    return <div className="flex gap-1 animate-pulse">
      <div className="w-8 h-8 bg-gray-200 rounded"></div>
      <div className="w-8 h-8 bg-gray-200 rounded"></div>
    </div>
  }

  const handleEditClick = () => {
    if (!canEdit) {
      showPermissionError(
        orderType === 'sales' 
          ? 'Order is sent. Edit through invoice only.'
          : 'Order is sent. Edit through bill only.',
        lang
      )
      return
    }
  }

  const handleDeleteClick = () => {
    if (!canDelete) {
      showPermissionError(
        orderType === 'sales'
          ? 'Order has payments. Edit through invoice only.'
          : 'Order has payments. Edit through bill only.',
        lang
      )
      return
    }
    onDelete?.()
  }

  return (
    <div className="flex items-center gap-1">
      {/* عرض الأمر - متاح دائماً */}
      {permissions.canView && (
        <Link href={`/${orderType === 'sales' ? 'sales-orders' : 'purchase-orders'}/${orderId}`}>
          <Button variant="ghost" size="icon" className="h-8 w-8" title={lang === 'en' ? 'View Order' : 'عرض الأمر'}>
            <Eye className="h-4 w-4 text-gray-500" />
          </Button>
        </Link>
      )}

      {/* تعديل - فقط في حالة المسودة أو حسب النمط المحاسبي */}
      {permissions.canEdit && (
        <div>
          {canEdit ? (
            <Link href={`/${orderType === 'sales' ? 'sales-orders' : 'purchase-orders'}/${orderId}/edit`}>
              <Button variant="ghost" size="icon" className="h-8 w-8" title={lang === 'en' ? 'Edit' : 'تعديل'}>
                <Pencil className="h-4 w-4 text-blue-500" />
              </Button>
            </Link>
          ) : (
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-8 w-8 opacity-50 cursor-not-allowed" 
              onClick={handleEditClick}
              title={lang === 'en' ? 'Cannot edit - order is sent/paid' : 'لا يمكن التعديل - الأمر مرسل/مدفوع'}
            >
              <Pencil className="h-4 w-4 text-gray-400" />
            </Button>
          )}
        </div>
      )}

      {/* حذف - فقط في حالة المسودة */}
      {permissions.canDelete && (
        <div>
          {canDelete ? (
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-8 w-8" 
              onClick={handleDeleteClick}
              title={lang === 'en' ? 'Delete' : 'حذف'}
            >
              <Trash2 className="h-4 w-4 text-red-500" />
            </Button>
          ) : (
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-8 w-8 opacity-50 cursor-not-allowed"
              onClick={handleDeleteClick}
              title={lang === 'en' ? 'Cannot delete - order is sent/paid' : 'لا يمكن الحذف - الأمر مرسل/مدفوع'}
            >
              <Trash2 className="h-4 w-4 text-gray-400" />
            </Button>
          )}
        </div>
      )}

      {/* تحويل لفاتورة - فقط إذا لم تكن هناك فاتورة مرتبطة */}
      {orderType === 'sales' && !invoiceId && permissions.canCreate && (
        <Button 
          variant="ghost" 
          size="icon" 
          className="h-8 w-8" 
          onClick={onConvertToInvoice}
          title={lang === 'en' ? 'Convert to Invoice' : 'تحويل لفاتورة'}
        >
          <FileText className="h-4 w-4 text-green-500" />
        </Button>
      )}

      {/* إرسال الفاتورة - فقط إذا كانت الفاتورة في حالة مسودة */}
      {invoiceId && invoiceStatus === 'draft' && permissions.canEdit && (
        <Button 
          variant="ghost" 
          size="icon" 
          className="h-8 w-8" 
          onClick={onSendInvoice}
          title={lang === 'en' ? 'Send Invoice' : 'إرسال الفاتورة'}
        >
          <Send className="h-4 w-4 text-blue-500" />
        </Button>
      )}

      {/* تسجيل دفعة - فقط إذا كانت الفاتورة مرسلة */}
      {invoiceId && invoiceStatus === 'sent' && permissions.canEdit && (
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={onRecordPayment}
          title={lang === 'en' ? 'Record Payment' : 'تسجيل دفعة'}
        >
          <CreditCard className="h-4 w-4 text-purple-500" />
        </Button>
      )}
    </div>
  )
}