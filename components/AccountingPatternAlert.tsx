import { AlertTriangle, Info, CheckCircle, XCircle, ArrowRight, ArrowLeft, Lock } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'

interface AccountingPatternAlertProps {
  orderType: 'sales' | 'purchase'
  orderStatus: string
  invoiceStatus?: string
  hasInvoice?: boolean
  hasPayments?: boolean
  syncDirection?: 'order_to_invoice' | 'invoice_to_order' | 'locked'
  lang: 'ar' | 'en'
}

export const AccountingPatternAlert = ({
  orderType,
  orderStatus,
  invoiceStatus,
  hasInvoice,
  hasPayments,
  syncDirection = 'locked',
  lang
}: AccountingPatternAlertProps) => {
  
  const getSyncIcon = () => {
    switch (syncDirection) {
      case 'order_to_invoice':
        return <ArrowRight className="h-3 w-3 text-blue-500" />
      case 'invoice_to_order':
        return <ArrowLeft className="h-3 w-3 text-orange-500" />
      case 'locked':
        return <Lock className="h-3 w-3 text-red-500" />
      default:
        return null
    }
  }

  const getSyncLabel = () => {
    const orderName = orderType === 'sales' ? (lang === 'en' ? 'Order' : 'الأمر') : (lang === 'en' ? 'PO' : 'أ.ش')
    const invoiceName = orderType === 'sales' ? (lang === 'en' ? 'Invoice' : 'الفاتورة') : (lang === 'en' ? 'Bill' : 'ف.ش')
    
    switch (syncDirection) {
      case 'order_to_invoice':
        return `${orderName} → ${invoiceName}`
      case 'invoice_to_order':
        return `${invoiceName} → ${orderName}`
      case 'locked':
        return lang === 'en' ? 'Locked' : 'مقفل'
      default:
        return ''
    }
  }
  
  const getAlertContent = () => {
    // 1️⃣ حالة المسودة - المزامنة من الأمر للفاتورة
    if (orderStatus === 'draft' && (!hasInvoice || invoiceStatus === 'draft')) {
      return {
        type: 'info' as const,
        icon: Info,
        title: lang === 'en' ? '📝 Draft State - Full Control' : '📝 حالة المسودة - تحكم كامل',
        message: lang === 'en' 
          ? 'Edit/delete through order only. Changes sync automatically to invoice.'
          : 'التعديل/الحذف من خلال الأمر فقط. التغييرات تنتقل تلقائياً للفاتورة.'
      }
    }

    // 2️⃣ حالة مرسلة - المزامنة من الفاتورة للأمر
    if (invoiceStatus === 'sent' && !hasPayments) {
      return {
        type: 'warning' as const,
        icon: AlertTriangle,
        title: lang === 'en' ? '📤 Sent State - Invoice Control' : '📤 حالة مرسلة - تحكم من الفاتورة',
        message: lang === 'en'
          ? 'Order is locked. Edit through invoice only. Changes sync back to order.'
          : 'الأمر مغلق. التعديل من خلال الفاتورة فقط. التغييرات تنتقل للأمر.'
      }
    }

    // 3️⃣ حالة مدفوعة - المزامنة من الفاتورة للأمر
    if (hasPayments) {
      return {
        type: 'error' as const,
        icon: XCircle,
        title: lang === 'en' ? '💰 Paid State - Invoice Control Only' : '💰 حالة مدفوعة - تحكم من الفاتورة فقط',
        message: lang === 'en'
          ? 'Order permanently locked. All changes through invoice only.'
          : 'الأمر مغلق نهائياً. جميع التغييرات من خلال الفاتورة فقط.'
      }
    }

    // حالة عادية
    return {
      type: 'success' as const,
      icon: CheckCircle,
      title: lang === 'en' ? '✅ Normal State' : '✅ حالة طبيعية',
      message: lang === 'en'
        ? 'Order and invoice are properly synchronized.'
        : 'الأمر والفاتورة متزامنان بشكل صحيح.'
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
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4" />
        <div className="flex items-center gap-1 text-xs font-mono">
          {getSyncIcon()}
          <span>{getSyncLabel()}</span>
        </div>
      </div>
      <AlertDescription>
        <div className="font-medium mb-1">{title}</div>
        <div className="text-sm">{message}</div>
      </AlertDescription>
    </Alert>
  )
}