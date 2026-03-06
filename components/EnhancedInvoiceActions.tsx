/**
 * 📌 Enhanced Invoice Actions Component
 * مكون محسن لإجراءات الفواتير مع التحقق من النمط المحاسبي الصارم
 */

import { Button } from '@/components/ui/button'
import {
  Eye, Pencil, Trash2, Send, CreditCard, RotateCcw,
  FileX, Receipt, AlertTriangle, CheckCircle
} from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'
import { useToast } from '@/hooks/use-toast'
import {
  canReturnInvoice,
  getInvoiceOperationError,
  requiresJournalEntries,
  type UserContext
} from '@/lib/validation'

interface EnhancedInvoiceActionsProps {
  invoiceId: string
  invoiceType: 'sales' | 'purchase'
  invoiceStatus: string
  invoiceNumber: string
  salesOrderId?: string | null
  purchaseOrderId?: string | null
  hasPayments?: boolean
  totalPaid?: number
  totalAmount?: number
  returnedAmount?: number
  userContext?: UserContext
  onDelete?: () => void
  onSend?: () => void
  onRecordPayment?: () => void
  onCreateReturn?: (mode: 'partial' | 'full') => void
  onCancel?: () => void
  lang: 'ar' | 'en'
  allowPartialReturn?: boolean
  permissions: {
    canView: boolean
    canEdit: boolean
    canDelete: boolean
    canSend: boolean
    canPay: boolean
    canReturn: boolean
  }
}

export const EnhancedInvoiceActions = (props: EnhancedInvoiceActionsProps) => {
  const {
    invoiceId,
    invoiceType,
    invoiceStatus,
    invoiceNumber,
    salesOrderId,
    purchaseOrderId,
    hasPayments,
    totalPaid = 0,
    totalAmount = 0,
    returnedAmount = 0,
    userContext,
    onDelete,
    onSend,
    onRecordPayment,
    onCreateReturn,
    onCancel,
    lang,
    permissions
  } = props

  const { toast } = useToast()
  const [loading, setLoading] = useState(false)

  // 📌 حساب القيم المالية
  const netAmount = totalAmount - returnedAmount
  const remainingAmount = Math.max(0, netAmount - totalPaid)
  const hasCredit = totalPaid > netAmount && netAmount > 0

  // 📌 تحديد الإجراءات المسموحة حسب النمط المحاسبي
  const isLinkedToDraftOrder = !!(salesOrderId || purchaseOrderId)
  const canEditDirectly = invoiceStatus === 'draft' && !isLinkedToDraftOrder
  const canDeleteDirectly = invoiceStatus === 'draft' && !hasPayments && !isLinkedToDraftOrder
  const canSendInvoice = invoiceStatus === 'draft' && permissions.canSend
  const canRecordPayment = invoiceStatus === 'sent' && permissions.canPay
  const canCreatePartialReturn = canReturnInvoice(invoiceStatus) && permissions.canReturn && remainingAmount < netAmount && (props.allowPartialReturn !== false)
  const canCreateFullReturn = canReturnInvoice(invoiceStatus) && permissions.canReturn && netAmount > 0
  const canCancelInvoice = invoiceStatus === 'draft' && !hasPayments

  // 📌 دوال المساعدة للرسائل
  const getActionTooltip = (action: string): string => {
    const tooltips = {
      edit_linked: lang === 'en'
        ? 'Cannot edit directly - edit through linked order'
        : 'لا يمكن التعديل مباشرة - عدل من خلال الأمر المرتبط',
      edit_not_draft: lang === 'en'
        ? 'Can only edit draft invoices'
        : 'يمكن تعديل الفواتير في حالة المسودة فقط',
      delete_linked: lang === 'en'
        ? 'Cannot delete - linked to order'
        : 'لا يمكن الحذف - مرتبطة بأمر',
      delete_has_payments: lang === 'en'
        ? 'Cannot delete - has payments'
        : 'لا يمكن الحذف - لها مدفوعات',
      delete_not_draft: lang === 'en'
        ? 'Can only delete draft invoices'
        : 'يمكن حذف الفواتير في حالة المسودة فقط',
      return_not_allowed: lang === 'en'
        ? 'Returns not allowed for this invoice status'
        : 'المرتجعات غير مسموحة لهذه الحالة'
    }
    return tooltips[action as keyof typeof tooltips] || action
  }

  const handleReturnClick = (mode: 'partial' | 'full') => {
    if (!canReturnInvoice(invoiceStatus)) {
      const error = getInvoiceOperationError(invoiceStatus, 'return', lang)
      if (error) {
        toast({
          title: error.title,
          description: error.description,
          variant: 'destructive'
        })
      }
      return
    }
    onCreateReturn?.(mode)
  }

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {/* 👁️ عرض - متاح دائماً */}
      {permissions.canView && (
        <Link href={`/${invoiceType === 'sales' ? 'invoices' : 'bills'}/${invoiceId}`}>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            title={lang === 'en' ? 'View' : 'عرض'}
          >
            <Eye className="h-4 w-4 text-gray-500" />
          </Button>
        </Link>
      )}

      {/* ✏️ تعديل - حسب النمط المحاسبي */}
      {permissions.canEdit && (
        <div>
          {canEditDirectly ? (
            <Link href={`/${invoiceType === 'sales' ? 'invoices' : 'bills'}/${invoiceId}/edit`}>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                title={lang === 'en' ? 'Edit' : 'تعديل'}
              >
                <Pencil className="h-4 w-4 text-blue-500" />
              </Button>
            </Link>
          ) : (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 opacity-50 cursor-not-allowed"
              title={isLinkedToDraftOrder ? getActionTooltip('edit_linked') : getActionTooltip('edit_not_draft')}
            >
              <Pencil className="h-4 w-4 text-gray-400" />
            </Button>
          )}
        </div>
      )}

      {/* 🗑️ حذف - حسب النمط المحاسبي */}
      {permissions.canDelete && (
        <div>
          {canDeleteDirectly ? (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={onDelete}
              title={lang === 'en' ? 'Delete' : 'حذف'}
            >
              <Trash2 className="h-4 w-4 text-red-500" />
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 opacity-50 cursor-not-allowed"
              title={
                isLinkedToDraftOrder ? getActionTooltip('delete_linked') :
                  hasPayments ? getActionTooltip('delete_has_payments') :
                    getActionTooltip('delete_not_draft')
              }
            >
              <Trash2 className="h-4 w-4 text-gray-400" />
            </Button>
          )}
        </div>
      )}

      {/* 📤 إرسال - فقط للفواتير في حالة مسودة */}
      {canSendInvoice && (
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={onSend}
          disabled={loading}
          title={lang === 'en' ? 'Send Invoice' : 'إرسال الفاتورة'}
        >
          <Send className="h-4 w-4 text-green-500" />
        </Button>
      )}

      {/* 💳 تسجيل دفعة - فقط للفواتير المرسلة */}
      {canRecordPayment && (
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={onRecordPayment}
          disabled={loading}
          title={lang === 'en' ? 'Record Payment' : 'تسجيل دفعة'}
        >
          <CreditCard className="h-4 w-4 text-purple-500" />
        </Button>
      )}

      {/* 🔄 مرتجع جزئي */}
      {canCreatePartialReturn && (
        <Button
          variant="ghost"
          size="sm"
          className="h-8 text-xs px-2"
          onClick={() => handleReturnClick('partial')}
          disabled={loading}
          title={lang === 'en' ? 'Partial Return' : 'مرتجع جزئي'}
        >
          <RotateCcw className="h-3 w-3 mr-1" />
          {lang === 'en' ? 'P.Ret' : 'جزئي'}
        </Button>
      )}

      {/* 🔄 مرتجع كامل */}
      {canCreateFullReturn && (
        <Button
          variant="ghost"
          size="sm"
          className="h-8 text-xs px-2"
          onClick={() => handleReturnClick('full')}
          disabled={loading}
          title={lang === 'en' ? 'Full Return' : 'مرتجع كامل'}
        >
          <RotateCcw className="h-3 w-3 mr-1" />
          {lang === 'en' ? 'F.Ret' : 'كامل'}
        </Button>
      )}

      {/* ❌ إلغاء - فقط للفواتير في حالة مسودة بدون مدفوعات */}
      {canCancelInvoice && (
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={onCancel}
          disabled={loading}
          title={lang === 'en' ? 'Cancel Invoice' : 'إلغاء الفاتورة'}
        >
          <FileX className="h-4 w-4 text-red-500" />
        </Button>
      )}

      {/* 📄 عرض الأمر المرتبط */}
      {(salesOrderId || purchaseOrderId) && (
        <Link href={`/${salesOrderId ? 'sales-orders' : 'purchase-orders'}/${salesOrderId || purchaseOrderId}`}>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            title={lang === 'en' ? 'View Linked Order' : 'عرض الأمر المرتبط'}
          >
            <Receipt className="h-4 w-4 text-blue-500" />
          </Button>
        </Link>
      )}

      {/* 💰 مؤشر الرصيد الدائن */}
      {hasCredit && (
        <div className="flex items-center gap-1 px-2 py-1 bg-blue-50 dark:bg-blue-900/20 rounded text-xs">
          <CheckCircle className="h-3 w-3 text-blue-500" />
          <span className="text-blue-700 dark:text-blue-300 font-medium">
            {lang === 'en' ? 'Credit' : 'رصيد دائن'}
          </span>
        </div>
      )}

      {/* ⚠️ مؤشر المرتجعات */}
      {returnedAmount > 0 && (
        <div className="flex items-center gap-1 px-2 py-1 bg-orange-50 dark:bg-orange-900/20 rounded text-xs">
          <AlertTriangle className="h-3 w-3 text-orange-500" />
          <span className="text-orange-700 dark:text-orange-300 font-medium">
            {lang === 'en' ? 'Returned' : 'مرتجع'}
          </span>
        </div>
      )}
    </div>
  )
}