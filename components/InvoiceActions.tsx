import { Button } from '@/components/ui/button'
import { Eye, Pencil, Trash2, Send, CreditCard, RotateCcw, FileX } from 'lucide-react'
import Link from 'next/link'

interface InvoiceActionsProps {
  invoiceId: string
  invoiceType: 'sales' | 'purchase'
  invoiceStatus: string
  salesOrderId?: string | null
  purchaseOrderId?: string | null
  hasPayments?: boolean
  totalPaid?: number
  totalAmount?: number
  onDelete?: () => void
  onSend?: () => void
  onRecordPayment?: () => void
  onCreateReturn?: () => void
  onCancel?: () => void
  lang: 'ar' | 'en'
  permissions: {
    canView: boolean
    canEdit: boolean
    canDelete: boolean
    canSend: boolean
    canPay: boolean
  }
}

export const InvoiceActions = ({
  invoiceId,
  invoiceType,
  invoiceStatus,
  salesOrderId,
  purchaseOrderId,
  hasPayments,
  totalPaid = 0,
  totalAmount = 0,
  onDelete,
  onSend,
  onRecordPayment,
  onCreateReturn,
  onCancel,
  lang,
  permissions
}: InvoiceActionsProps) => {
  
  // تحديد ما إذا كانت الفاتورة مرتبطة بأمر في حالة مسودة
  const isLinkedToDraftOrder = !!(salesOrderId || purchaseOrderId)
  
  // تحديد الإجراءات المسموحة حسب النمط المحاسبي
  const canEditDirectly = invoiceStatus === 'draft' && !isLinkedToDraftOrder
  const canDeleteDirectly = invoiceStatus === 'draft' && !hasPayments && !isLinkedToDraftOrder
  const canSendInvoice = invoiceStatus === 'draft' && permissions.canSend
  const canRecordPayment = invoiceStatus === 'sent' && permissions.canPay
  const canCreateReturn = (invoiceStatus === 'sent' || invoiceStatus === 'paid' || invoiceStatus === 'partially_paid') && totalPaid > 0
  const canCancel = invoiceStatus === 'draft' && !hasPayments

  const getEditTooltip = () => {
    if (isLinkedToDraftOrder) {
      return lang === 'en' 
        ? 'Cannot edit directly - edit through linked order'
        : 'لا يمكن التعديل مباشرة - عدل من خلال الأمر المرتبط'
    }
    if (invoiceStatus !== 'draft') {
      return lang === 'en'
        ? 'Can only edit draft invoices'
        : 'يمكن تعديل الفواتير في حالة المسودة فقط'
    }
    return lang === 'en' ? 'Edit' : 'تعديل'
  }

  const getDeleteTooltip = () => {
    if (isLinkedToDraftOrder) {
      return lang === 'en'
        ? 'Cannot delete - linked to order'
        : 'لا يمكن الحذف - مرتبطة بأمر'
    }
    if (hasPayments) {
      return lang === 'en'
        ? 'Cannot delete - has payments'
        : 'لا يمكن الحذف - لها مدفوعات'
    }
    if (invoiceStatus !== 'draft') {
      return lang === 'en'
        ? 'Can only delete draft invoices'
        : 'يمكن حذف الفواتير في حالة المسودة فقط'
    }
    return lang === 'en' ? 'Delete' : 'حذف'
  }

  return (
    <div className="flex items-center gap-1">
      {/* عرض - متاح دائماً */}
      {permissions.canView && (
        <Link href={`/${invoiceType === 'sales' ? 'invoices' : 'bills'}/${invoiceId}`}>
          <Button variant="ghost" size="icon" className="h-8 w-8" title={lang === 'en' ? 'View' : 'عرض'}>
            <Eye className="h-4 w-4 text-gray-500" />
          </Button>
        </Link>
      )}

      {/* تعديل - حسب النمط المحاسبي */}
      {permissions.canEdit && (
        <div>
          {canEditDirectly ? (
            <Link href={`/${invoiceType === 'sales' ? 'invoices' : 'bills'}/${invoiceId}/edit`}>
              <Button variant="ghost" size="icon" className="h-8 w-8" title={getEditTooltip()}>
                <Pencil className="h-4 w-4 text-blue-500" />
              </Button>
            </Link>
          ) : (
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-8 w-8 opacity-50 cursor-not-allowed" 
              title={getEditTooltip()}
            >
              <Pencil className="h-4 w-4 text-gray-400" />
            </Button>
          )}
        </div>
      )}

      {/* حذف - حسب النمط المحاسبي */}
      {permissions.canDelete && (
        <div>
          {canDeleteDirectly ? (
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-8 w-8" 
              onClick={onDelete}
              title={getDeleteTooltip()}
            >
              <Trash2 className="h-4 w-4 text-red-500" />
            </Button>
          ) : (
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-8 w-8 opacity-50 cursor-not-allowed"
              title={getDeleteTooltip()}
            >
              <Trash2 className="h-4 w-4 text-gray-400" />
            </Button>
          )}
        </div>
      )}

      {/* إرسال - فقط للفواتير في حالة مسودة */}
      {canSendInvoice && (
        <Button 
          variant="ghost" 
          size="icon" 
          className="h-8 w-8" 
          onClick={onSend}
          title={lang === 'en' ? 'Send Invoice' : 'إرسال الفاتورة'}
        >
          <Send className="h-4 w-4 text-green-500" />
        </Button>
      )}

      {/* تسجيل دفعة - فقط للفواتير المرسلة */}
      {canRecordPayment && (
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

      {/* إنشاء مرتجع - فقط للفواتير المدفوعة */}
      {canCreateReturn && (
        <Button 
          variant="ghost" 
          size="icon" 
          className="h-8 w-8" 
          onClick={onCreateReturn}
          title={lang === 'en' ? 'Create Return' : 'إنشاء مرتجع'}
        >
          <RotateCcw className="h-4 w-4 text-orange-500" />
        </Button>
      )}

      {/* إلغاء - فقط للفواتير في حالة مسودة بدون مدفوعات */}
      {canCancel && (
        <Button 
          variant="ghost" 
          size="icon" 
          className="h-8 w-8" 
          onClick={onCancel}
          title={lang === 'en' ? 'Cancel Invoice' : 'إلغاء الفاتورة'}
        >
          <FileX className="h-4 w-4 text-red-500" />
        </Button>
      )}

      {/* عرض الأمر المرتبط */}
      {(salesOrderId || purchaseOrderId) && (
        <Link href={`/${salesOrderId ? 'sales-orders' : 'purchase-orders'}/${salesOrderId || purchaseOrderId}`}>
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-8 w-8" 
            title={lang === 'en' ? 'View Linked Order' : 'عرض الأمر المرتبط'}
          >
            <Eye className="h-4 w-4 text-blue-500" />
          </Button>
        </Link>
      )}
    </div>
  )
}