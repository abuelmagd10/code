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
      // جلب حالة أمر البيع مع invoice_id
      const { data: order, error: orderError } = await supabase
        .from('sales_orders')
        .select('status, invoice_id')
        .eq('id', orderId)
        .single()

      if (orderError || !order) {
        return {
          canEdit: false,
          canDelete: false,
          canEditThroughInvoice: false,
          reason: 'Order not found',
          status: 'unknown',
          syncDirection: 'locked'
        }
      }

      // جلب الفاتورة المرتبطة إذا وجدت
      let invoice: any = null
      let totalPaid = 0

      if (order.invoice_id) {
        const { data: invoiceData } = await supabase
          .from('invoices')
          .select('id, status, total_amount, paid_amount')
          .eq('id', order.invoice_id)
          .single()

        invoice = invoiceData

        // جلب المدفوعات للفاتورة
        if (invoice) {
          const { data: paymentsData } = await supabase
            .from('payments')
            .select('amount')
            .eq('invoice_id', invoice.id)

          totalPaid = paymentsData?.reduce((sum: number, p: any) => sum + (p.amount || 0), 0) || 0
        }
      }

      const hasPaidAmount = totalPaid > 0
      const invoiceStatus = invoice?.status

      // 1️⃣ حالة المسودة: التعديل من الأمر فقط، مزامنة للفاتورة
      // (لكن إذا كانت الفاتورة المرتبطة مرسلة أو مدفوعة، لا يمكن التعديل)
      if (order.status === 'draft' && (!invoiceStatus || invoiceStatus === 'draft')) {
        return {
          canEdit: true,
          canDelete: !invoice, // يمكن الحذف فقط إذا لم تكن هناك فاتورة مرتبطة
          canEditThroughInvoice: false,
          status: order.status,
          invoiceStatus,
          syncDirection: 'order_to_invoice'
        }
      }

      // 1.5️⃣ حالة invoiced (تم التحويل لفاتورة): التحقق من حالة الفاتورة
      if (order.status === 'invoiced') {
        // إذا الفاتورة لا تزال مسودة، يمكن التعديل من الفاتورة
        if (invoiceStatus === 'draft') {
          return {
            canEdit: false,
            canDelete: false,
            canEditThroughInvoice: true,
            reason: 'Order is invoiced. Edit through invoice only.',
            status: order.status,
            invoiceStatus,
            syncDirection: 'invoice_to_order'
          }
        }
      }

      // 2️⃣ حالة مرسلة: التعديل من الفاتورة فقط، مزامنة للأمر
      if (order.status === 'sent' || order.status === 'invoiced' || invoiceStatus === 'sent') {
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
      // جلب حالة أمر الشراء مع bill_id
      const { data: order, error: orderError } = await supabase
        .from('purchase_orders')
        .select('status, bill_id')
        .eq('id', orderId)
        .single()

      if (orderError || !order) {
        return {
          canEdit: false,
          canDelete: false,
          canEditThroughInvoice: false,
          reason: 'Order not found',
          status: 'unknown',
          syncDirection: 'locked'
        }
      }

      // جلب الفاتورة المرتبطة إذا وجدت
      let bill: any = null
      let totalPaid = 0

      if (order.bill_id) {
        const { data: billData } = await supabase
          .from('bills')
          .select('id, status, total_amount, paid_amount')
          .eq('id', order.bill_id)
          .single()

        bill = billData

        // جلب المدفوعات للفاتورة
        if (bill) {
          const { data: paymentsData } = await supabase
            .from('payments')
            .select('amount')
            .eq('bill_id', bill.id)

          totalPaid = paymentsData?.reduce((sum: number, p: any) => sum + (p.amount || 0), 0) || 0
        }
      }

      const hasPaidAmount = totalPaid > 0
      const billStatus = bill?.status

      // 1️⃣ حالة المسودة: التعديل من الأمر فقط، مزامنة للفاتورة
      // (لكن إذا كانت الفاتورة المرتبطة مرسلة أو مدفوعة، لا يمكن التعديل)
      if (order.status === 'draft' && (!billStatus || billStatus === 'draft')) {
        return {
          canEdit: true,
          canDelete: !bill, // يمكن الحذف فقط إذا لم تكن هناك فاتورة مرتبطة
          canEditThroughInvoice: false,
          status: order.status,
          invoiceStatus: billStatus,
          syncDirection: 'order_to_invoice'
        }
      }

      // 1.5️⃣ حالة billed (تم التحويل لفاتورة): التحقق من حالة الفاتورة
      if (order.status === 'billed') {
        // إذا الفاتورة لا تزال مسودة، يمكن التعديل من الفاتورة
        if (billStatus === 'draft') {
          return {
            canEdit: false,
            canDelete: false,
            canEditThroughInvoice: true,
            reason: 'Order is billed. Edit through bill only.',
            status: order.status,
            invoiceStatus: billStatus,
            syncDirection: 'invoice_to_order'
          }
        }
      }

      // 2️⃣ حالة مرسلة: التعديل من الفاتورة فقط، مزامنة للأمر
      if (order.status === 'sent' || order.status === 'billed' || billStatus === 'sent') {
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
      'Order is invoiced. Edit through invoice only.': {
        ar: 'الأمر تم تحويله لفاتورة. يجب التعديل من خلال الفاتورة فقط.',
        en: 'Order is invoiced. Edit through invoice only.'
      },
      'Order has payments. Edit through invoice only.': {
        ar: 'الأمر له مدفوعات. يجب التعديل من خلال الفاتورة فقط.',
        en: 'Order has payments. Edit through invoice only.'
      },
      'Order has payments. Edit through bill only.': {
        ar: 'الأمر له مدفوعات. يجب التعديل من خلال فاتورة الشراء فقط.',
        en: 'Order has payments. Edit through bill only.'
      },
      'Order is billed. Edit through bill only.': {
        ar: 'الأمر تم تحويله لفاتورة شراء. يجب التعديل من خلال فاتورة الشراء فقط.',
        en: 'Order is billed. Edit through bill only.'
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