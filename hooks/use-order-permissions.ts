import { useSupabase } from '@/lib/supabase/hooks'
import { useToast } from '@/hooks/use-toast'

interface OrderStatus {
  canEdit: boolean
  canDelete: boolean
  canEditThroughInvoice: boolean
  reason?: string
  status: string
  invoiceStatus?: string
  syncDirection: 'order_to_invoice' | 'invoice_to_order' | 'locked'
}

export const useOrderPermissions = () => {
  const supabase = useSupabase()
  const { toast } = useToast()

  const checkSalesOrderPermissions = async (orderId: string): Promise<OrderStatus> => {
    try {
      // جلب حالة أمر البيع والفاتورة المرتبطة مع تفاصيل المدفوعات
      const { data: order } = await supabase
        .from('sales_orders')
        .select(`
          status,
          invoices!sales_order_id (
            id, status, total_amount, paid_amount,
            payments!invoice_id (amount)
          )
        `)
        .eq('id', orderId)
        .single()

      if (!order) {
        return { 
          canEdit: false, 
          canDelete: false, 
          canEditThroughInvoice: false,
          reason: 'Order not found', 
          status: 'unknown',
          syncDirection: 'locked'
        }
      }

      const invoice = order.invoices?.[0]
      const totalPaid = invoice?.payments?.reduce((sum: number, p: any) => sum + (p.amount || 0), 0) || 0
      const hasPaidAmount = totalPaid > 0
      const invoiceStatus = invoice?.status

      // 1️⃣ حالة المسودة: التعديل من الأمر فقط، مزامنة للفاتورة
      if (order.status === 'draft') {
        return { 
          canEdit: true, 
          canDelete: true, 
          canEditThroughInvoice: false,
          status: order.status,
          invoiceStatus,
          syncDirection: 'order_to_invoice'
        }
      }

      // 2️⃣ حالة مرسلة: التعديل من الفاتورة فقط، مزامنة للأمر
      if (order.status === 'sent' || invoiceStatus === 'sent') {
        return { 
          canEdit: false, 
          canDelete: false, 
          canEditThroughInvoice: true,
          reason: 'Order is sent. Edit through invoice only.',
          status: order.status,
          invoiceStatus,
          syncDirection: 'invoice_to_order'
        }
      }

      // 3️⃣ حالة مدفوعة: التعديل من الفاتورة فقط، مزامنة للأمر
      if (hasPaidAmount || invoiceStatus === 'paid' || invoiceStatus === 'partially_paid') {
        return { 
          canEdit: false, 
          canDelete: false, 
          canEditThroughInvoice: true,
          reason: 'Order has payments. Edit through invoice only.',
          status: 'paid',
          invoiceStatus,
          syncDirection: 'invoice_to_order'
        }
      }

      return { 
        canEdit: false, 
        canDelete: false, 
        canEditThroughInvoice: false,
        status: order.status,
        invoiceStatus,
        syncDirection: 'locked'
      }
    } catch (error) {
      console.error('Error checking sales order permissions:', error)
      return { 
        canEdit: false, 
        canDelete: false, 
        canEditThroughInvoice: false,
        reason: 'Error checking permissions', 
        status: 'error',
        syncDirection: 'locked'
      }
    }
  }

  const checkPurchaseOrderPermissions = async (orderId: string): Promise<OrderStatus> => {
    try {
      // جلب حالة أمر الشراء وفاتورة الشراء المرتبطة مع تفاصيل المدفوعات
      const { data: order } = await supabase
        .from('purchase_orders')
        .select(`
          status,
          bills!purchase_order_id (
            id, status, total_amount, paid_amount,
            payments!bill_id (amount)
          )
        `)
        .eq('id', orderId)
        .single()

      if (!order) {
        return { 
          canEdit: false, 
          canDelete: false, 
          canEditThroughInvoice: false,
          reason: 'Order not found', 
          status: 'unknown',
          syncDirection: 'locked'
        }
      }

      const bill = order.bills?.[0]
      const totalPaid = bill?.payments?.reduce((sum: number, p: any) => sum + (p.amount || 0), 0) || 0
      const hasPaidAmount = totalPaid > 0
      const billStatus = bill?.status

      // 1️⃣ حالة المسودة: التعديل من الأمر فقط، مزامنة للفاتورة
      if (order.status === 'draft') {
        return { 
          canEdit: true, 
          canDelete: true, 
          canEditThroughInvoice: false,
          status: order.status,
          invoiceStatus: billStatus,
          syncDirection: 'order_to_invoice'
        }
      }

      // 2️⃣ حالة مرسلة: التعديل من الفاتورة فقط، مزامنة للأمر
      if (order.status === 'sent' || billStatus === 'sent') {
        return { 
          canEdit: false, 
          canDelete: false, 
          canEditThroughInvoice: true,
          reason: 'Order is sent. Edit through bill only.',
          status: order.status,
          invoiceStatus: billStatus,
          syncDirection: 'invoice_to_order'
        }
      }

      // 3️⃣ حالة مدفوعة: التعديل من الفاتورة فقط، مزامنة للأمر
      if (hasPaidAmount || billStatus === 'paid' || billStatus === 'partially_paid') {
        return { 
          canEdit: false, 
          canDelete: false, 
          canEditThroughInvoice: true,
          reason: 'Order has payments. Edit through bill only.',
          status: 'paid',
          invoiceStatus: billStatus,
          syncDirection: 'invoice_to_order'
        }
      }

      return { 
        canEdit: false, 
        canDelete: false, 
        canEditThroughInvoice: false,
        status: order.status,
        invoiceStatus: billStatus,
        syncDirection: 'locked'
      }
    } catch (error) {
      console.error('Error checking purchase order permissions:', error)
      return { 
        canEdit: false, 
        canDelete: false, 
        canEditThroughInvoice: false,
        reason: 'Error checking permissions', 
        status: 'error',
        syncDirection: 'locked'
      }
    }
  }

  const showPermissionError = (reason: string, lang: 'ar' | 'en' = 'ar') => {
    const messages = {
      'Order is sent. Edit through invoice only.': {
        ar: 'الأمر مرسل. يجب التعديل من خلال الفاتورة فقط.',
        en: 'Order is sent. Edit through invoice only.'
      },
      'Order is sent. Edit through bill only.': {
        ar: 'الأمر مرسل. يجب التعديل من خلال فاتورة الشراء فقط.',
        en: 'Order is sent. Edit through bill only.'
      },
      'Order has payments. Edit through invoice only.': {
        ar: 'الأمر له مدفوعات. يجب التعديل من خلال الفاتورة فقط.',
        en: 'Order has payments. Edit through invoice only.'
      },
      'Order has payments. Edit through bill only.': {
        ar: 'الأمر له مدفوعات. يجب التعديل من خلال فاتورة الشراء فقط.',
        en: 'Order has payments. Edit through bill only.'
      }
    }

    const message = messages[reason as keyof typeof messages]?.[lang] || reason

    toast({
      title: lang === 'en' ? 'Action Not Allowed' : 'العملية غير مسموحة',
      description: message,
      variant: 'destructive'
    })
  }

  return {
    checkSalesOrderPermissions,
    checkPurchaseOrderPermissions,
    showPermissionError
  }
}