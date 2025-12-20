import { useSupabase } from '@/lib/supabase/hooks'
import { useToast } from '@/hooks/use-toast'

interface OrderStatus {
  canEdit: boolean
  canDelete: boolean
  reason?: string
  status: string
}

export const useOrderPermissions = () => {
  const supabase = useSupabase()
  const { toast } = useToast()

  const checkSalesOrderPermissions = async (orderId: string): Promise<OrderStatus> => {
    try {
      // جلب حالة أمر البيع والفاتورة المرتبطة
      const { data: order } = await supabase
        .from('sales_orders')
        .select(`
          status,
          invoices!sales_order_id (
            id, status,
            invoice_payments (amount)
          )
        `)
        .eq('id', orderId)
        .single()

      if (!order) {
        return { canEdit: false, canDelete: false, reason: 'Order not found', status: 'unknown' }
      }

      const invoice = order.invoices?.[0]
      const hasPaidAmount = invoice?.invoice_payments?.some((p: any) => p.amount > 0)

      // حالة المسودة: يمكن التعديل والحذف
      if (order.status === 'draft') {
        return { canEdit: true, canDelete: true, status: order.status }
      }

      // حالة مرسلة بدون دفع: لا يمكن تعديل الأمر، يجب التعديل من الفاتورة
      if (order.status === 'sent' && !hasPaidAmount) {
        return { 
          canEdit: false, 
          canDelete: false, 
          reason: 'Order is sent. Edit through invoice only.',
          status: order.status 
        }
      }

      // حالة مدفوعة: لا يمكن تعديل الأمر نهائياً
      if (hasPaidAmount) {
        return { 
          canEdit: false, 
          canDelete: false, 
          reason: 'Order has payments. Edit through invoice only.',
          status: 'paid' 
        }
      }

      return { canEdit: false, canDelete: false, status: order.status }
    } catch (error) {
      console.error('Error checking sales order permissions:', error)
      return { canEdit: false, canDelete: false, reason: 'Error checking permissions', status: 'error' }
    }
  }

  const checkPurchaseOrderPermissions = async (orderId: string): Promise<OrderStatus> => {
    try {
      // جلب حالة أمر الشراء والفاتورة المرتبطة
      const { data: order } = await supabase
        .from('purchase_orders')
        .select(`
          status,
          bills!purchase_order_id (
            id, status,
            bill_payments (amount)
          )
        `)
        .eq('id', orderId)
        .single()

      if (!order) {
        return { canEdit: false, canDelete: false, reason: 'Order not found', status: 'unknown' }
      }

      const bill = order.bills?.[0]
      const hasPaidAmount = bill?.bill_payments?.some((p: any) => p.amount > 0)

      // حالة المسودة: يمكن التعديل والحذف
      if (order.status === 'draft') {
        return { canEdit: true, canDelete: true, status: order.status }
      }

      // حالة مرسلة بدون دفع: لا يمكن تعديل الأمر
      if (order.status === 'sent' && !hasPaidAmount) {
        return { 
          canEdit: false, 
          canDelete: false, 
          reason: 'Order is sent. Edit through bill only.',
          status: order.status 
        }
      }

      // حالة مدفوعة: لا يمكن تعديل الأمر نهائياً
      if (hasPaidAmount) {
        return { 
          canEdit: false, 
          canDelete: false, 
          reason: 'Order has payments. Edit through bill only.',
          status: 'paid' 
        }
      }

      return { canEdit: false, canDelete: false, status: order.status }
    } catch (error) {
      console.error('Error checking purchase order permissions:', error)
      return { canEdit: false, canDelete: false, reason: 'Error checking permissions', status: 'error' }
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