import { AlertTriangle, Info, CheckCircle, XCircle } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'

interface AccountingPatternAlertProps {
  orderType: 'sales' | 'purchase'
  orderStatus: string
  invoiceStatus?: string
  hasInvoice?: boolean
  hasPayments?: boolean
  lang: 'ar' | 'en'
}

export const AccountingPatternAlert = ({
  orderType,
  orderStatus,
  invoiceStatus,
  hasInvoice,
  hasPayments,
  lang
}: AccountingPatternAlertProps) => {
  
  const getAlertContent = () => {
    // حالة المسودة
    if (orderStatus === 'draft' && (!hasInvoice || invoiceStatus === 'draft')) {
      return {
        type: 'info' as const,
        icon: Info,
        title: lang === 'en' ? 'Draft State' : 'حالة المسودة',
        message: lang === 'en' 
          ? `This ${orderType} order is in draft state. You can edit or delete it. The linked ${orderType === 'sales' ? 'invoice' : 'bill'} can only be modified through this order.`
          : `هذا ${orderType === 'sales' ? 'أمر البيع' : 'أمر الشراء'} في حالة مسودة. يمكنك تعديله أو حذفه. ${orderType === 'sales' ? 'الفاتورة' : 'فاتورة الشراء'} المرتبطة يمكن تعديلها فقط من خلال هذا الأمر.`
      }
    }

    // حالة مرسلة
    if (invoiceStatus === 'sent' && !hasPayments) {
      return {
        type: 'warning' as const,
        icon: AlertTriangle,
        title: lang === 'en' ? 'Order Locked' : 'الأمر مقفل',
        message: lang === 'en'
          ? `This order cannot be edited because the ${orderType === 'sales' ? 'invoice' : 'bill'} has been sent. All modifications must be done through the ${orderType === 'sales' ? 'invoice' : 'bill'} only.`
          : `لا يمكن تعديل هذا الأمر لأن ${orderType === 'sales' ? 'الفاتورة' : 'فاتورة الشراء'} تم إرسالها. جميع التعديلات يجب أن تتم من خلال ${orderType === 'sales' ? 'الفاتورة' : 'فاتورة الشراء'} فقط.`
      }
    }

    // حالة مدفوعة
    if (hasPayments) {
      return {
        type: 'error' as const,
        icon: XCircle,
        title: lang === 'en' ? 'Order Permanently Locked' : 'الأمر مقفل نهائياً',
        message: lang === 'en'
          ? `This order cannot be edited or deleted because it has payments. All modifications must be done through the ${orderType === 'sales' ? 'invoice' : 'bill'} only to maintain accounting integrity.`
          : `لا يمكن تعديل أو حذف هذا الأمر لأنه له مدفوعات. جميع التعديلات يجب أن تتم من خلال ${orderType === 'sales' ? 'الفاتورة' : 'فاتورة الشراء'} فقط للحفاظ على سلامة المحاسبة.`
      }
    }

    // حالة عادية
    return {
      type: 'success' as const,
      icon: CheckCircle,
      title: lang === 'en' ? 'Order Active' : 'الأمر نشط',
      message: lang === 'en'
        ? 'This order follows the accounting pattern correctly.'
        : 'هذا الأمر يتبع النمط المحاسبي بشكل صحيح.'
    }
  }

  const { type, icon: Icon, title, message } = getAlertContent()

  const alertStyles = {
    info: 'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-200',
    warning: 'border-yellow-200 bg-yellow-50 text-yellow-800 dark:border-yellow-800 dark:bg-yellow-950 dark:text-yellow-200',
    error: 'border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200',
    success: 'border-green-200 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-200'
  }

  return (
    <Alert className={alertStyles[type]}>
      <Icon className="h-4 w-4" />
      <AlertDescription>
        <div className="font-medium mb-1">{title}</div>
        <div className="text-sm">{message}</div>
      </AlertDescription>
    </Alert>
  )
}