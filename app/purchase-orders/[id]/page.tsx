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
import { canAction } from "@/lib/authz"
import { getActiveCompanyId } from "@/lib/company"
import { Pencil, ArrowRight, ArrowLeft, Loader2, Mail, Send, FileText, CreditCard, RotateCcw, DollarSign, Package, Receipt, ShoppingCart, Plus, CheckCircle, Clock, AlertCircle, Ban } from "lucide-react"
import { type UserContext, validatePurchaseOrderAction, canViewPurchasePrices } from "@/lib/validation"

interface Supplier { id: string; name: string; email?: string; address?: string; phone?: string }
interface POItem {
  id: string
  product_id: string
  quantity: number
  unit_price: number
  tax_rate: number
  discount_percent?: number
  line_total: number
  received_quantity: number
  billed_quantity?: number
  approved_billed_quantity?: number // ✅ الكميات المفوترة من الفواتير المعتمدة فقط
  products?: { name: string; sku: string }
}
interface PO {
  id: string
  po_number: string
  po_date: string
  due_date: string | null
  subtotal: number
  tax_amount: number
  total_amount: number
  total?: number
  received_amount: number
  status: string
  supplier_id?: string
  suppliers?: Supplier
  notes?: string
  currency?: string
  discount_type?: string
  discount_value?: number
  shipping?: number
  shipping_tax_rate?: number
  adjustment?: number
  bill_id?: string
}

interface LinkedBill {
  id: string
  bill_number: string
  bill_date: string
  due_date: string | null
  total_amount: number
  status: string
  paid_amount?: number
}

interface LinkedPayment {
  id: string
  reference_number: string
  payment_date: string
  amount: number
  payment_method: string
  notes?: string
  bill_id?: string
}

interface LinkedReturn {
  id: string
  return_number: string
  return_date: string
  total_amount: number
  status: string
  reason?: string
  bill_id?: string
}

export default function PurchaseOrderDetailPage() {
  const supabase = useSupabase()
  const params = useParams()
  const router = useRouter()
  const { toast } = useToast()
  const [appLang, setAppLang] = useState<'ar' | 'en'>('ar')
  const poId = params.id as string
  const [po, setPo] = useState<PO | null>(null)
  const [items, setItems] = useState<POItem[]>([])
  const [linkedBills, setLinkedBills] = useState<LinkedBill[]>([])
  const [linkedPayments, setLinkedPayments] = useState<LinkedPayment[]>([])
  const [linkedReturns, setLinkedReturns] = useState<LinkedReturn[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [permUpdate, setPermUpdate] = useState(false)
  const [permWriteBills, setPermWriteBills] = useState(false)
  const [permReadBills, setPermReadBills] = useState(false)
  const [permReadPayments, setPermReadPayments] = useState(false)
  const [linkedBillStatus, setLinkedBillStatus] = useState<string | null>(null)
  const [isSending, setIsSending] = useState(false)
  const [activeTab, setActiveTab] = useState("items")
  // 🔐 ERP Access Control
  const [userContext, setUserContext] = useState<UserContext | null>(null)
  const [canSendOrder, setCanSendOrder] = useState(false)
  const [canReceiveOrder, setCanReceiveOrder] = useState(false)
  const [canViewPrices, setCanViewPrices] = useState(false)
  const [poCreatedBy, setPoCreatedBy] = useState<string | null>(null)

  const currencySymbols: Record<string, string> = {
    EGP: '£', USD: '$', EUR: '€', GBP: '£', SAR: '﷼', AED: 'د.إ',
  }

  useEffect(() => {
    try {
      const fromCookie = document.cookie.split('; ').find((x) => x.startsWith('app_language='))?.split('=')[1]
      setAppLang((fromCookie || localStorage.getItem('app_language') || 'ar') === 'en' ? 'en' : 'ar')
    } catch { }
    const handler = () => {
      try {
        const fromCookie = document.cookie.split('; ').find((x) => x.startsWith('app_language='))?.split('=')[1]
        setAppLang((fromCookie || localStorage.getItem('app_language') || 'ar') === 'en' ? 'en' : 'ar')
      } catch { }
    }
    window.addEventListener('app_language_changed', handler)
    return () => window.removeEventListener('app_language_changed', handler)
  }, [])

  useEffect(() => {
    const checkPerms = async () => {
      const [update, writeBills, readBills, readPay] = await Promise.all([
        canAction(supabase, "purchase_orders", "update"),
        canAction(supabase, "bills", "write"),
        canAction(supabase, "bills", "read"),
        canAction(supabase, "payments", "read"),
      ])
      setPermUpdate(update)
      setPermWriteBills(writeBills)
      setPermReadBills(readBills)
      setPermReadPayments(readPay)
    }
    checkPerms()
  }, [supabase])

  useEffect(() => {
    load()
  }, [])

  const load = async () => {
    try {
      setIsLoading(true)

      // 🔐 ERP Access Control - جلب سياق المستخدم
      const companyId = await getActiveCompanyId(supabase)
      const { data: { user } } = await supabase.auth.getUser()
      if (user && companyId) {
        const { data: member } = await supabase
          .from("company_members")
          .select("role, branch_id, cost_center_id, warehouse_id")
          .eq("company_id", companyId)
          .eq("user_id", user.id)
          .single()

        const role = member?.role || "staff"
        const context: UserContext = {
          user_id: user.id,
          company_id: companyId,
          branch_id: member?.branch_id || null,
          cost_center_id: member?.cost_center_id || null,
          warehouse_id: member?.warehouse_id || null,
          role: role
        }
        setUserContext(context)
        setCanViewPrices(canViewPurchasePrices(context))
      }

      // تحميل أمر الشراء مع suppliers (بدون created_by لأنه غير موجود في الجدول)
      const { data: poData, error: poError } = await supabase
        .from("purchase_orders")
        .select("*, suppliers(*)")
        .eq("id", poId)
        .single()

      if (poError) {
        console.error('Error loading purchase order:', poError)
        toast({
          title: appLang === 'en' ? 'Error' : 'خطأ',
          description: appLang === 'en' ? 'Failed to load purchase order' : 'فشل تحميل أمر الشراء',
          variant: 'destructive'
        })
        setIsLoading(false)
        return
      }

      if (poData) {
        // تحميل shipping_provider بشكل منفصل إذا كان shipping_provider_id موجوداً
        if ((poData as any).shipping_provider_id) {
          const { data: shippingProvider } = await supabase
            .from("shipping_providers")
            .select("provider_name")
            .eq("id", (poData as any).shipping_provider_id)
            .single()

          if (shippingProvider) {
            (poData as any).shipping_providers = shippingProvider
          }
        }

        setPo(poData)
        // purchase_orders لا يحتوي على created_by - استخدام null
        setPoCreatedBy(null)

        // 🔐 تحديث صلاحيات الإرسال والاستلام
        // purchase_orders لا يحتوي على created_by - تمرير null
        if (userContext) {
          const sendValidation = validatePurchaseOrderAction(userContext, 'send', null, poData.status)
          setCanSendOrder(sendValidation.isValid)
          const receiveValidation = validatePurchaseOrderAction(userContext, 'receive', null, poData.status)
          setCanReceiveOrder(receiveValidation.isValid)
        }

        // Load linked bill status
        if (poData.bill_id) {
          const { data: billData } = await supabase.from("bills").select("status").eq("id", poData.bill_id).single()
          if (billData) setLinkedBillStatus(billData.status)
        }
      }
      const { data: itemsData } = await supabase
        .from("purchase_order_items")
        .select("*, products(name, sku)")
        .eq("purchase_order_id", poId)
      setItems(itemsData || [])

      // Load linked bills
      const billIds: string[] = []
      if (poData?.bill_id) billIds.push(poData.bill_id)

      const { data: billsData } = await supabase
        .from("bills")
        .select("id, bill_number, bill_date, due_date, total_amount, status, paid_amount, returned_amount, return_status, original_total")
        .or(`purchase_order_id.eq.${poId}${poData?.bill_id ? `,id.eq.${poData.bill_id}` : ''}`)

      const uniqueBills = billsData || []
      setLinkedBills(uniqueBills)

      // Load payments for all linked bills
      if (uniqueBills.length > 0) {
        const billIdsArray = uniqueBills.map((b: any) => b.id)
        const { data: paymentsData } = await supabase
          .from("payments")
          .select("id, reference_number, payment_date, amount, payment_method, notes, bill_id")
          .in("bill_id", billIdsArray)
          .order("payment_date", { ascending: false })
        setLinkedPayments(paymentsData || [])

        // Load purchase returns for all linked bills
        const { data: returnsData } = await supabase
          .from("purchase_returns")
          .select("id, return_number, return_date, total_amount, status, reason, bill_id")
          .in("bill_id", billIdsArray)
          .order("return_date", { ascending: false })
        setLinkedReturns(returnsData || [])
      } else {
        setLinkedPayments([])
        setLinkedReturns([])
      }

      // Load billed quantities for items - ✅ من جميع الفواتير (بما فيها Draft)
      if (uniqueBills.length > 0) {
        const billIdsArray = uniqueBills.map((b: any) => b.id)
        const { data: billItems } = await supabase
          .from("bill_items")
          .select("product_id, quantity, bill_id")
          .in("bill_id", billIdsArray)

        // ✅ حساب الكميات المفوترة من جميع الفواتير
        const billedQtyMap: Record<string, number> = {}
        // ✅ حساب الكميات المفوترة من الفواتير المعتمدة فقط (لحساب حالة "مفوتر بالكامل")
        const approvedBilledQtyMap: Record<string, number> = {}
        
        ; (billItems || []).forEach((bi: any) => {
          const bill = uniqueBills.find((b: any) => b.id === bi.bill_id)
          const isApproved = bill && bill.status && bill.status !== 'draft'
          
          // جميع الفواتير (للعرض)
          billedQtyMap[bi.product_id] = (billedQtyMap[bi.product_id] || 0) + Number(bi.quantity || 0)
          
          // الفواتير المعتمدة فقط (لحساب الحالة)
          if (isApproved) {
            approvedBilledQtyMap[bi.product_id] = (approvedBilledQtyMap[bi.product_id] || 0) + Number(bi.quantity || 0)
          }
        })

        // Update items with billed quantities (من جميع الفواتير)
        setItems(prev => prev.map(item => ({
          ...item,
          billed_quantity: billedQtyMap[item.product_id] || 0,
          approved_billed_quantity: approvedBilledQtyMap[item.product_id] || 0
        })))
      }
    } catch (err) {
      console.error("Error loading PO:", err)
    } finally {
      setIsLoading(false)
    }
  }

  // ✅ تحديث بيانات الفواتير المرتبطة تلقائياً عند أي تغيير
  useEffect(() => {
    const refreshBillsData = async () => {
      if (!poId) return

      // جلب جميع الفواتير المرتبطة بأمر الشراء
      const { data: billsData } = await supabase
        .from("bills")
        .select("id, bill_number, bill_date, due_date, total_amount, status, paid_amount, returned_amount, return_status, original_total")
        .or(`purchase_order_id.eq.${poId}${po?.bill_id ? `,id.eq.${po.bill_id}` : ''}`)

      if (billsData && billsData.length > 0) {
        setLinkedBills(billsData)

        // تحديث المدفوعات والمرتجعات
        const billIdsArray = billsData.map((b: any) => b.id)
        
        // جلب المدفوعات
        const { data: paymentsData } = await supabase
          .from("payments")
          .select("id, reference_number, payment_date, amount, payment_method, notes, bill_id")
          .in("bill_id", billIdsArray)
          .order("payment_date", { ascending: false })
        if (paymentsData) setLinkedPayments(paymentsData)

        // جلب المرتجعات
        const { data: returnsData } = await supabase
          .from("purchase_returns")
          .select("id, return_number, return_date, total_amount, status, reason, bill_id")
          .in("bill_id", billIdsArray)
          .order("return_date", { ascending: false })
        if (returnsData) setLinkedReturns(returnsData)

        // تحديث الكميات المفوترة في البنود
        if (billIdsArray.length > 0) {
          const { data: billItems } = await supabase
            .from("bill_items")
            .select("product_id, quantity, bill_id")
            .in("bill_id", billIdsArray)

          if (billItems) {
            const billedQtyMap: Record<string, number> = {}
            billItems.forEach((bi: any) => {
              billedQtyMap[bi.product_id] = (billedQtyMap[bi.product_id] || 0) + Number(bi.quantity || 0)
            })

            setItems(prev => prev.map(item => ({
              ...item,
              billed_quantity: billedQtyMap[item.product_id] || 0,
              approved_billed_quantity: billedQtyMap[item.product_id] || 0
            })))
          }
        }

        // 🔄 تحديث البيانات في الصفحة الرئيسية
        router.refresh()
      } else {
        // لا توجد فواتير مرتبطة
        setLinkedBills([])
        setLinkedPayments([])
        setLinkedReturns([])
      }
    }

    // ✅ تحديث فوري عند تحميل الصفحة
    refreshBillsData()
    
    // ✅ تحديث دوري كل 3 ثواني لمراقبة التغييرات على الفواتير المرتبطة
    const interval = setInterval(refreshBillsData, 3000)

    return () => clearInterval(interval)
  }, [poId, router, po?.bill_id, supabase]) // ✅ يتم التحديث عند تغيير poId أو bill_id

  // Calculate summary
  const currency = po?.currency || 'EGP'
  const symbol = currencySymbols[currency] || currency
  const total = Number(po?.total_amount || po?.total || 0)

  // ✅ حساب إجمالي المدفوع من جميع المدفوعات (نفس منطق صفحة الفواتير)
  const totalPaid = useMemo(() => {
    return linkedPayments.reduce((sum: number, p: any) => sum + Number(p.amount || 0), 0)
  }, [linkedPayments])

  // ✅ حساب إجمالي المرتجعات من جميع الفواتير المرتبطة (نفس منطق صفحة الفواتير)
  const totalReturned = useMemo(() => {
    return linkedBills.reduce((sum: number, b: any) => sum + Number(b.returned_amount || 0), 0)
  }, [linkedBills])

  // ✅ حساب إجمالي الفواتير (نفس منطق صفحة الفواتير تماماً)
  const summary = useMemo(() => {
    // ✅ نفس منطق صفحة الفواتير: نستخدم total_amount مباشرة من كل فاتورة
    // في صفحة الفواتير: Bill Total = bill.total_amount مباشرة
    // في صفحة أمر الشراء: Total Billed = مجموع total_amount من جميع الفواتير المرتبطة
    const totalBilled = linkedBills.length > 0 
      ? linkedBills.reduce((sum, b) => {
          // ✅ استخدام total_amount مباشرة (مثل صفحة الفواتير)
          return sum + Number(b.total_amount || 0)
        }, 0)
      : 0
    
    // ✅ صافي المتبقي = إجمالي الأمر - إجمالي الفواتير - المدفوع
    // نفس منطق صفحة الفواتير تماماً: netRemaining = bill.total_amount - paidTotal
    // في صفحة أمر الشراء: netRemaining = total - totalBilled - totalPaid
    // (لا نطرح المرتجعات لأن totalBilled = total_amount وهو بعد المرتجعات بالفعل)
    const netRemaining = total - totalBilled - totalPaid
    
    return { 
      totalBilled, // ✅ إجمالي الفواتير (total_amount من كل فاتورة)
      totalPaid, // ✅ إجمالي المدفوع
      totalReturned, // ✅ إجمالي المرتجعات (للعرض فقط)
      netRemaining // ✅ صافي المتبقي = total - totalBilled - totalPaid
    }
  }, [linkedBills, totalPaid, total])

  // Calculate remaining quantities
  const remainingItems = useMemo(() => {
    return items.map(item => ({
      ...item,
      remaining_quantity: Math.max(0, Number(item.quantity || 0) - Number(item.billed_quantity || 0))
    })).filter(item => item.remaining_quantity > 0)
  }, [items])

  // Check if fully billed - ✅ يعتمد على الفواتير المعتمدة فقط (غير Draft)
  const isFullyBilled = useMemo(() => {
    if (items.length === 0) return false
    // ✅ استخدام approved_billed_quantity لتحديد إذا كان مفوتر بالكامل
    return items.every(item => Number(item.approved_billed_quantity || 0) >= Number(item.quantity || 0))
  }, [items])

  // ✅ حساب حالة أمر الشراء الفعلية بناءً على الفواتير المعتمدة
  const actualStatus = useMemo(() => {
    // إذا كان مفوتر بالكامل بناءً على الفواتير المعتمدة، الحالة = "billed"
    if (isFullyBilled) return "billed"
    // إذا كانت هناك فواتير معتمدة جزئياً
    const approvedBills = linkedBills.filter((b: any) => b.status && b.status !== 'draft')
    if (approvedBills.length > 0) return "partially_billed"
    // إرجاع الحالة من قاعدة البيانات
    return po?.status || "draft"
  }, [isFullyBilled, linkedBills, po?.status])

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { icon: any; color: string; bgColor: string; label: string; labelEn: string }> = {
      // حالات أوامر الشراء
      draft: { icon: Clock, color: 'text-gray-600', bgColor: 'bg-gray-100 dark:bg-gray-800', label: 'مسودة', labelEn: 'Draft' },
      sent: { icon: Send, color: 'text-blue-600', bgColor: 'bg-blue-100 dark:bg-blue-900/30', label: 'تم الإرسال', labelEn: 'Sent' },
      received: { icon: CheckCircle, color: 'text-green-600', bgColor: 'bg-green-100 dark:bg-green-900/30', label: 'تم الاستلام', labelEn: 'Received' },
      partially_billed: { icon: AlertCircle, color: 'text-orange-600', bgColor: 'bg-orange-100 dark:bg-orange-900/30', label: 'مفوتر جزئياً', labelEn: 'Partially Billed' },
      billed: { icon: FileText, color: 'text-purple-600', bgColor: 'bg-purple-100 dark:bg-purple-900/30', label: 'مفوتر بالكامل', labelEn: 'Fully Billed' },
      cancelled: { icon: Ban, color: 'text-red-600', bgColor: 'bg-red-100 dark:bg-red-900/30', label: 'ملغي', labelEn: 'Cancelled' },
      closed: { icon: CheckCircle, color: 'text-gray-600', bgColor: 'bg-gray-100 dark:bg-gray-800', label: 'مغلق', labelEn: 'Closed' },
      // حالات الفواتير
      pending: { icon: Clock, color: 'text-yellow-600', bgColor: 'bg-yellow-100 dark:bg-yellow-900/30', label: 'معلقة', labelEn: 'Pending' },
      paid: { icon: CheckCircle, color: 'text-green-600', bgColor: 'bg-green-100 dark:bg-green-900/30', label: 'مدفوعة', labelEn: 'Paid' },
      partially_paid: { icon: AlertCircle, color: 'text-orange-600', bgColor: 'bg-orange-100 dark:bg-orange-900/30', label: 'مدفوعة جزئياً', labelEn: 'Partially Paid' },
      overdue: { icon: AlertCircle, color: 'text-red-600', bgColor: 'bg-red-100 dark:bg-red-900/30', label: 'متأخرة', labelEn: 'Overdue' },
      voided: { icon: Ban, color: 'text-gray-600', bgColor: 'bg-gray-100 dark:bg-gray-800', label: 'ملغية', labelEn: 'Voided' },
      fully_returned: { icon: RotateCcw, color: 'text-purple-600', bgColor: 'bg-purple-100 dark:bg-purple-900/30', label: 'مرتجعة بالكامل', labelEn: 'Fully Returned' },
    }
    const config = statusConfig[status] || statusConfig.draft
    const Icon = config.icon
    return (
      <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${config.bgColor} ${config.color}`}>
        <Icon className="h-3.5 w-3.5" />
        {appLang === 'en' ? config.labelEn : config.label}
      </span>
    )
  }

  // ===== 🔒 وفقاً للمواصفات: أوامر الشراء مستندات تجهيزية فقط =====
  // ❌ لا قيود محاسبية
  // ❌ لا حركات مخزون
  // ✅ القيود والمخزون تُنشأ فقط عند فاتورة الشراء (Bill)

  // دالة تحديث حالة الاستلام (بدون قيود أو مخزون)
  const markAsReceived = async () => {
    try {
      if (!po) return

      // تحديث كميات الاستلام في بنود الأمر (للتتبع فقط)
      const updates = items.map((it) => ({ id: it.id, received_quantity: it.quantity }))
      if (updates.length > 0) {
        const { error: updErr } = await supabase.from("purchase_order_items").update(updates).in("id", updates.map(u => u.id))
        if (updErr) console.warn("Failed updating items received quantities", updErr)
      }

      // ✅ ملاحظة: لا يتم إنشاء قيود محاسبية أو حركات مخزون هنا
      // القيود والمخزون تُنشأ فقط عند إنشاء فاتورة الشراء (Bill) من هذا الأمر
      console.log("✅ تم تحديث حالة الاستلام - القيود والمخزون تُنشأ عند فاتورة الشراء")
    } catch (err) {
      console.error("Error marking PO as received:", err)
    }
  }

  const changeStatus = async (newStatus: string) => {
    try {
      setIsSending(true)
      const { error } = await supabase.from("purchase_orders").update({ status: newStatus }).eq("id", poId)
      if (error) throw error

      if (newStatus === "sent") {
        // Try to send email to supplier if they have an email
        const supplierEmail = po?.suppliers?.email
        if (supplierEmail) {
          try {
            const companyId = await getActiveCompanyId(supabase)
            const res = await fetch("/api/send-purchase-order", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ purchaseOrderId: poId, companyId }),
            })
            const result = await res.json()
            if (result.emailSent) {
              toast({
                title: appLang === 'en' ? "Email Sent" : "تم الإرسال",
                description: appLang === 'en'
                  ? `Purchase order sent to ${supplierEmail}`
                  : `تم إرسال أمر الشراء إلى ${supplierEmail}`,
              })
            } else if (result.ok) {
              toast({
                title: appLang === 'en' ? "Status Updated" : "تم التحديث",
                description: result.message || (appLang === 'en' ? "Email service not configured" : "خدمة الإيميل غير مفعلة"),
                variant: "default",
              })
            }
          } catch (emailErr) {
            console.error("Error sending email:", emailErr)
            // Status already updated, just notify about email failure
            toast({
              title: appLang === 'en' ? "Status Updated" : "تم التحديث",
              description: appLang === 'en' ? "But email could not be sent" : "لكن تعذر إرسال الإيميل",
              variant: "default",
            })
          }
        } else {
          // No supplier email
          toast({
            title: appLang === 'en' ? "Marked as Sent" : "تم تحديد كمرسل",
            description: appLang === 'en'
              ? "Supplier has no email registered"
              : "المورد ليس لديه بريد إلكتروني مسجل",
          })
        }
      } else if (newStatus === "received") {
        // ✅ وفقاً للمواصفات: لا قيود ولا مخزون - فقط تحديث حالة الاستلام
        await markAsReceived()
        toast({
          title: appLang === 'en' ? "Marked as Received" : "تم تحديد كمستلم",
          description: appLang === 'en'
            ? "Note: Accounting entries and inventory will be created when converting to Bill"
            : "ملاحظة: القيود المحاسبية والمخزون سيتم إنشاؤها عند التحويل لفاتورة شراء",
        })
      } else {
        toastActionSuccess(toast, appLang === 'en' ? "Update" : "التحديث", appLang === 'en' ? "Purchase Order" : "أمر الشراء")
      }

      await load()
      // 🔄 تحديث البيانات في الصفحة الرئيسية أيضاً
      router.refresh()
    } catch (err) {
      console.error("Error updating PO status:", err)
      toastActionError(toast, appLang === 'en' ? "Update" : "التحديث", appLang === 'en' ? "Purchase Order" : "أمر الشراء", appLang === 'en' ? "Failed to update status" : "تعذر تحديث حالة أمر الشراء")
    } finally {
      setIsSending(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
        <Sidebar />
        <main className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8 overflow-x-hidden">
          <p className="py-8 text-center">{appLang === 'en' ? 'Loading...' : 'جاري التحميل...'}</p>
        </main>
      </div>
    )
  }

  if (!po) {
    return (
      <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
        <Sidebar />
        <main className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8 overflow-x-hidden">
          <p className="py-8 text-center text-red-600">{appLang === 'en' ? 'Purchase order not found' : 'لم يتم العثور على أمر الشراء'}</p>
        </main>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
      <Sidebar />
      <main className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8 overflow-x-hidden">
        <div className="space-y-4 sm:space-y-6 max-w-full">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3">
            <div className="flex items-center gap-3">
              <Link href="/purchase-orders">
                <Button variant="ghost" size="icon" className="dark:text-gray-300">
                  {appLang === 'ar' ? <ArrowRight className="h-5 w-5" /> : <ArrowLeft className="h-5 w-5" />}
                </Button>
              </Link>
              <div className="min-w-0">
                <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2 truncate">
                  <ShoppingCart className="h-5 w-5 sm:h-6 sm:w-6 flex-shrink-0" />
                  {po.po_number || (appLang === 'en' ? 'Purchase Order' : 'أمر الشراء')}
                </h1>
                <div className="mt-1">{getStatusBadge(actualStatus)}</div>
              </div>
            </div>
            <div className="flex gap-2 flex-wrap">
              {/* Create Bill button - show if not fully billed */}
              {permWriteBills && !isFullyBilled && remainingItems.length > 0 && (
                <Link href={`/bills/new?from_po=${poId}`}>
                  <Button className="bg-green-600 hover:bg-green-700 text-white">
                    <Plus className="h-4 w-4 mr-1" />
                    {appLang === 'en' ? 'Create Bill' : 'إنشاء فاتورة'}
                  </Button>
                </Link>
              )}
              {/* Edit button */}
              {permUpdate && (!linkedBillStatus || linkedBillStatus === 'draft') && (
                <Link href={`/purchase-orders/${poId}/edit`}>
                  <Button variant="outline">
                    <Pencil className="h-4 w-4 ml-1" />
                    {appLang === 'en' ? 'Edit' : 'تعديل'}
                  </Button>
                </Link>
              )}
              {/* 🔐 ERP Access Control: زر الإرسال - فقط للمسؤولين والمدراء */}
              {po.status === "draft" && canSendOrder && (
                <Button onClick={() => changeStatus("sent")} variant="outline" disabled={isSending}>
                  {isSending ? <Loader2 className="h-4 w-4 ml-1 animate-spin" /> : po.suppliers?.email ? <Mail className="h-4 w-4 ml-1" /> : <Send className="h-4 w-4 ml-1" />}
                  {appLang === 'en' ? 'Mark as Sent' : 'تحديد كمرسل'}
                </Button>
              )}
              {/* 🔐 ERP Access Control: زر الاستلام - للموظف الذي أنشأ الطلب أو المسؤولين */}
              {po.status === "sent" && canReceiveOrder && (
                <Button onClick={() => changeStatus("received")} className="bg-blue-600 hover:bg-blue-700" disabled={isSending}>
                  <Package className="h-4 w-4 ml-1" />
                  {appLang === 'en' ? 'Receive Items' : 'استلام البضاعة'}
                </Button>
              )}
            </div>
          </div>

          {/* Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
            <Card className="dark:bg-gray-800 dark:border-gray-700 p-3 sm:p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                  <FileText className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{appLang === 'en' ? 'Total Billed' : 'إجمالي الفواتير'}</p>
                  <p className="text-lg font-bold text-blue-600">{symbol}{summary.totalBilled.toFixed(2)}</p>
                </div>
              </div>
            </Card>
            <Card className="dark:bg-gray-800 dark:border-gray-700 p-3 sm:p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
                  <CreditCard className="h-5 w-5 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{appLang === 'en' ? 'Total Paid' : 'إجمالي المدفوع'}</p>
                  <p className="text-lg font-bold text-green-600">{symbol}{summary.totalPaid.toFixed(2)}</p>
                </div>
              </div>
            </Card>
            <Card className="dark:bg-gray-800 dark:border-gray-700 p-3 sm:p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-orange-100 dark:bg-orange-900/30 rounded-lg">
                  <RotateCcw className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                </div>
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{appLang === 'en' ? 'Total Returns' : 'إجمالي المرتجعات'}</p>
                  <p className="text-lg font-bold text-orange-600">{symbol}{summary.totalReturned.toFixed(2)}</p>
                </div>
              </div>
            </Card>
            <Card className="dark:bg-gray-800 dark:border-gray-700 p-3 sm:p-4">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${summary.netRemaining > 0 ? 'bg-red-100 dark:bg-red-900/30' : 'bg-green-100 dark:bg-green-900/30'}`}>
                  <DollarSign className={`h-5 w-5 ${summary.netRemaining > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`} />
                </div>
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{appLang === 'en' ? 'Net Remaining' : 'صافي المتبقي'}</p>
                  <p className={`text-lg font-bold ${summary.netRemaining > 0 ? 'text-red-600' : 'text-green-600'}`}>{symbol}{summary.netRemaining.toFixed(2)}</p>
                </div>
              </div>
            </Card>
          </div>

          {/* Order Info & Supplier */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
            <Card className="dark:bg-gray-800 dark:border-gray-700">
              <CardHeader className="pb-3">
                <CardTitle className="text-base dark:text-white flex items-center gap-2">
                  <ShoppingCart className="h-4 w-4" />
                  {appLang === 'en' ? 'Order Information' : 'معلومات الأمر'}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500 dark:text-gray-400">{appLang === 'en' ? 'Order Number' : 'رقم الأمر'}</span>
                  <span className="font-medium text-gray-900 dark:text-white">{po.po_number}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500 dark:text-gray-400">{appLang === 'en' ? 'Date' : 'التاريخ'}</span>
                  <span className="text-gray-900 dark:text-white">{po.po_date}</span>
                </div>
                {po.due_date && (
                  <div className="flex justify-between">
                    <span className="text-gray-500 dark:text-gray-400">{appLang === 'en' ? 'Due Date' : 'تاريخ الاستحقاق'}</span>
                    <span className="text-gray-900 dark:text-white">{po.due_date}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-gray-500 dark:text-gray-400">{appLang === 'en' ? 'Currency' : 'العملة'}</span>
                  <span className="text-gray-900 dark:text-white">{currency}</span>
                </div>
                {(po as any).shipping_providers?.provider_name && (
                  <div className="flex justify-between">
                    <span className="text-gray-500 dark:text-gray-400">{appLang === 'en' ? 'Shipping Company' : 'شركة الشحن'}</span>
                    <span className="text-gray-900 dark:text-white">{(po as any).shipping_providers.provider_name}</span>
                  </div>
                )}
                <div className="flex justify-between pt-2 border-t dark:border-gray-700">
                  <span className="text-gray-500 dark:text-gray-400 font-medium">{appLang === 'en' ? 'Order Total' : 'إجمالي الأمر'}</span>
                  <span className="font-bold text-gray-900 dark:text-white">{symbol}{total.toFixed(2)}</span>
                </div>
              </CardContent>
            </Card>

            <Card className="dark:bg-gray-800 dark:border-gray-700">
              <CardHeader className="pb-3">
                <CardTitle className="text-base dark:text-white">{appLang === 'en' ? 'Supplier' : 'المورد'}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <p className="font-medium text-gray-900 dark:text-white text-lg">{po.suppliers?.name || '-'}</p>
                {po.suppliers?.email && <p className="text-sm text-gray-600 dark:text-gray-400">{po.suppliers.email}</p>}
                {po.suppliers?.phone && <p className="text-sm text-gray-600 dark:text-gray-400">{po.suppliers.phone}</p>}
                {po.suppliers?.address && <p className="text-sm text-gray-500 dark:text-gray-500">{po.suppliers.address}</p>}
              </CardContent>
            </Card>
          </div>

          {/* Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-4 h-auto">
              <TabsTrigger value="items" className="text-xs sm:text-sm py-2">
                <Package className="h-4 w-4 mr-1 hidden sm:inline" />
                {appLang === 'en' ? 'Items' : 'البنود'}
              </TabsTrigger>
              <TabsTrigger value="bills" className="text-xs sm:text-sm py-2">
                <FileText className="h-4 w-4 mr-1 hidden sm:inline" />
                {appLang === 'en' ? 'Bills' : 'الفواتير'} ({linkedBills.length})
              </TabsTrigger>
              <TabsTrigger value="payments" className="text-xs sm:text-sm py-2">
                <CreditCard className="h-4 w-4 mr-1 hidden sm:inline" />
                {appLang === 'en' ? 'Payments' : 'المدفوعات'} ({linkedPayments.length})
              </TabsTrigger>
              <TabsTrigger value="returns" className="text-xs sm:text-sm py-2">
                <RotateCcw className="h-4 w-4 mr-1 hidden sm:inline" />
                {appLang === 'en' ? 'Returns' : 'المرتجعات'} ({linkedBills.filter(b => Number((b as any).returned_amount || 0) > 0).length})
              </TabsTrigger>
            </TabsList>

            {/* Items Tab */}
            <TabsContent value="items">
              <Card className="dark:bg-gray-800 dark:border-gray-700">
                <CardContent className="pt-6">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-gray-50 dark:bg-slate-900">
                          <th className="px-4 py-2 text-right">{appLang === 'en' ? 'Product' : 'المنتج'}</th>
                          <th className="px-4 py-2 text-right">{appLang === 'en' ? 'Ordered' : 'المطلوب'}</th>
                          <th className="px-4 py-2 text-right">{appLang === 'en' ? 'Billed' : 'المفوتر'}</th>
                          <th className="px-4 py-2 text-right">{appLang === 'en' ? 'Remaining' : 'المتبقي'}</th>
                          {/* 🔐 ERP Access Control: إخفاء الأسعار للموظفين */}
                          {canViewPrices && <th className="px-4 py-2 text-right">{appLang === 'en' ? 'Price' : 'السعر'}</th>}
                          {canViewPrices && <th className="px-4 py-2 text-right">{appLang === 'en' ? 'Tax' : 'الضريبة'}</th>}
                          {canViewPrices && <th className="px-4 py-2 text-right">{appLang === 'en' ? 'Total' : 'الإجمالي'}</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((item) => {
                          const remaining = Math.max(0, Number(item.quantity || 0) - Number(item.billed_quantity || 0))
                          return (
                            <tr key={item.id} className="border-b dark:border-gray-700">
                              <td className="px-4 py-2">{item.products?.name}</td>
                              <td className="px-4 py-2">{item.quantity}</td>
                              <td className="px-4 py-2 text-green-600">{item.billed_quantity || 0}</td>
                              <td className={`px-4 py-2 ${remaining > 0 ? 'text-orange-600 font-medium' : 'text-green-600'}`}>{remaining}</td>
                              {/* 🔐 ERP Access Control: إخفاء الأسعار للموظفين */}
                              {canViewPrices && <td className="px-4 py-2">{symbol}{item.unit_price.toFixed(2)}</td>}
                              {canViewPrices && <td className="px-4 py-2">{item.tax_rate}%</td>}
                              {canViewPrices && <td className="px-4 py-2 font-semibold">{symbol}{(item.quantity * item.unit_price * (1 + item.tax_rate / 100)).toFixed(2)}</td>}
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                  {/* 🔐 ERP Access Control: إخفاء الإجماليات للموظفين */}
                  {canViewPrices && (
                    <div className="border-t pt-6 flex justify-end dark:border-gray-700">
                      <div className="w-full md:w-80 space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span>{appLang === 'en' ? 'Subtotal:' : 'المجموع الفرعي:'}</span>
                          <span>{symbol}{(po.subtotal || 0).toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>{appLang === 'en' ? 'Tax:' : 'الضريبة:'}</span>
                          <span>{symbol}{(po.tax_amount || 0).toFixed(2)}</span>
                        </div>
                        {(po.discount_value || 0) > 0 && (
                          <div className="flex justify-between text-red-600">
                            <span>{appLang === 'en' ? 'Discount:' : 'الخصم:'}</span>
                            <span>-{po.discount_type === 'percent' ? `${po.discount_value}%` : `${symbol}${(po.discount_value || 0).toFixed(2)}`}</span>
                          </div>
                        )}
                        {(po.shipping || 0) > 0 && (
                          <div className="flex justify-between">
                            <span>{appLang === 'en' ? 'Shipping:' : 'الشحن:'}</span>
                            <span>{symbol}{(po.shipping || 0).toFixed(2)}</span>
                          </div>
                        )}
                        <div className="border-t pt-2 flex justify-between font-bold text-lg dark:border-gray-700">
                          <span>{appLang === 'en' ? 'Total:' : 'الإجمالي:'}</span>
                          <span>{symbol}{total.toFixed(2)}</span>
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Bills Tab */}
            <TabsContent value="bills">
              <Card className="dark:bg-gray-800 dark:border-gray-700">
                <CardContent className="pt-6">
                  {linkedBills.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                      <FileText className="h-12 w-12 mx-auto mb-3 opacity-30" />
                      <p>{appLang === 'en' ? 'No bills linked to this order' : 'لا توجد فواتير مرتبطة بهذا الأمر'}</p>
                      {permWriteBills && remainingItems.length > 0 && (
                        <Link href={`/bills/new?from_po=${poId}`}>
                          <Button className="mt-4 bg-green-600 hover:bg-green-700">
                            <Plus className="h-4 w-4 mr-1" />
                            {appLang === 'en' ? 'Create First Bill' : 'إنشاء أول فاتورة'}
                          </Button>
                        </Link>
                      )}
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b bg-gray-50 dark:bg-slate-900">
                            <th className="px-4 py-2 text-right">{appLang === 'en' ? 'Bill Number' : 'رقم الفاتورة'}</th>
                            <th className="px-4 py-2 text-right">{appLang === 'en' ? 'Date' : 'التاريخ'}</th>
                            <th className="px-4 py-2 text-right">{appLang === 'en' ? 'Amount' : 'المبلغ'}</th>
                            <th className="px-4 py-2 text-right">{appLang === 'en' ? 'Status' : 'الحالة'}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {linkedBills.map((bill) => (
                            <tr key={bill.id} className="border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50">
                              <td className="px-4 py-2 font-medium">{bill.bill_number}</td>
                              <td className="px-4 py-2">{new Date(bill.bill_date).toLocaleDateString(appLang === 'en' ? 'en' : 'ar')}</td>
                              <td className="px-4 py-2">{symbol}{Number(bill.total_amount || 0).toFixed(2)}</td>
                              <td className="px-4 py-2">{getStatusBadge(bill.status)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Payments Tab */}
            <TabsContent value="payments">
              <Card className="dark:bg-gray-800 dark:border-gray-700">
                <CardContent className="pt-6">
                  {linkedPayments.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                      <CreditCard className="h-12 w-12 mx-auto mb-3 opacity-30" />
                      <p>{appLang === 'en' ? 'No payments recorded' : 'لا توجد مدفوعات مسجلة'}</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b bg-gray-50 dark:bg-slate-900">
                            <th className="px-4 py-2 text-right">{appLang === 'en' ? 'Reference' : 'المرجع'}</th>
                            <th className="px-4 py-2 text-right">{appLang === 'en' ? 'Date' : 'التاريخ'}</th>
                            <th className="px-4 py-2 text-right">{appLang === 'en' ? 'Amount' : 'المبلغ'}</th>
                            <th className="px-4 py-2 text-right">{appLang === 'en' ? 'Method' : 'الطريقة'}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {linkedPayments.map((payment) => (
                            <tr key={payment.id} className="border-b dark:border-gray-700">
                              <td className="px-4 py-2 font-medium">{payment.reference_number}</td>
                              <td className="px-4 py-2">{new Date(payment.payment_date).toLocaleDateString(appLang === 'en' ? 'en' : 'ar')}</td>
                              <td className="px-4 py-2 text-green-600 font-medium">{symbol}{Number(payment.amount || 0).toFixed(2)}</td>
                              <td className="px-4 py-2">{payment.payment_method}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Returns Tab */}
            <TabsContent value="returns">
              <Card className="dark:bg-gray-800 dark:border-gray-700">
                <CardContent className="pt-6">
                  {(() => {
                    const billsWithReturns = linkedBills.filter(b => Number((b as any).returned_amount || 0) > 0)
                    if (billsWithReturns.length === 0) {
                      return (
                        <div className="text-center py-8 text-gray-500">
                          <RotateCcw className="h-12 w-12 mx-auto mb-3 opacity-30" />
                          <p>{appLang === 'en' ? 'No returns recorded' : 'لا توجد مرتجعات مسجلة'}</p>
                        </div>
                      )
                    }
                    return (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b bg-gray-50 dark:bg-slate-900">
                              <th className="px-4 py-2 text-right">{appLang === 'en' ? 'Bill Number' : 'رقم الفاتورة'}</th>
                              <th className="px-4 py-2 text-right">{appLang === 'en' ? 'Original Amount' : 'المبلغ الأصلي'}</th>
                              <th className="px-4 py-2 text-right">{appLang === 'en' ? 'Returned Amount' : 'المبلغ المرتجع'}</th>
                              <th className="px-4 py-2 text-right">{appLang === 'en' ? 'Net Amount' : 'المبلغ الصافي'}</th>
                              <th className="px-4 py-2 text-right">{appLang === 'en' ? 'Status' : 'الحالة'}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {billsWithReturns.map((bill) => {
                              const returned = Number((bill as any).returned_amount || 0)
                              const original = Number((bill as any).original_total || 0) || (Number(bill.total_amount || 0) + returned)
                              const netAmount = Number(bill.total_amount || 0)
                              const returnStatus = (bill as any).return_status === 'full' ? (appLang === 'en' ? 'Full Return' : 'مرتجع كامل') : (appLang === 'en' ? 'Partial Return' : 'مرتجع جزئي')
                              return (
                                <tr key={bill.id} className="border-b dark:border-gray-700">
                                  <td className="px-4 py-2 font-medium">
                                    <span className="text-gray-900 dark:text-white">{bill.bill_number}</span>
                                  </td>
                                  <td className="px-4 py-2">{symbol}{original.toFixed(2)}</td>
                                  <td className="px-4 py-2 text-orange-600 font-medium">-{symbol}{returned.toFixed(2)}</td>
                                  <td className="px-4 py-2 font-semibold">{symbol}{netAmount.toFixed(2)}</td>
                                  <td className="px-4 py-2">
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300">
                                      <RotateCcw className="h-3 w-3" />
                                      {returnStatus}
                                    </span>
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                        {/* إجمالي المرتجعات */}
                        <div className="mt-4 p-3 bg-orange-50 dark:bg-orange-900/20 rounded-lg flex justify-between items-center">
                          <span className="font-semibold text-gray-700 dark:text-gray-300">{appLang === 'en' ? 'Total Returns' : 'إجمالي المرتجعات'}</span>
                          <span className="font-bold text-orange-600">{symbol}{summary.totalReturned.toFixed(2)}</span>
                        </div>
                      </div>
                    )
                  })()}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          {/* Notes */}
          {po.notes && (
            <Card className="dark:bg-gray-800 dark:border-gray-700">
              <CardHeader className="pb-3">
                <CardTitle className="text-base dark:text-white">{appLang === 'en' ? 'Notes' : 'ملاحظات'}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-gray-600 dark:text-gray-400">{po.notes}</p>
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </div>
  )
}
