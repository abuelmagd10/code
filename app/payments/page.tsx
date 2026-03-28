// =====================================================
// 📌 PAYMENTS ACCOUNTING PATTERN – MANDATORY SPECIFICATION
// =====================================================
// 📌 المرجع: docs/ACCOUNTING_PATTERN.md
// هذا النمط المحاسبي الصارم (ERP Professional):
//
// 📌 فواتير المبيعات:
// - Sent: ✅ خصم مخزون فقط - ❌ لا قيد محاسبي
// - Payment (أول دفعة): ✅ قيد الفاتورة (AR/Revenue) + ✅ قيد السداد (Cash/AR)
// - Payment (دفعات لاحقة): ✅ قيد السداد فقط (Cash/AR)
// - ❌ لا COGS في أي مرحلة
//
// 📌 فواتير المشتريات:
// - Received: ✅ زيادة مخزون فقط - ❌ لا قيد محاسبي
// - Payment (أول دفعة): ✅ قيد الفاتورة (Inventory/AP) + ✅ قيد السداد (AP/Cash)
// - Payment (دفعات لاحقة): ✅ قيد السداد فقط (AP/Cash)
//
// 📌 أي كود يخالف هذا النمط يُعد خطأ جسيم ويجب تعديله فورًا
// =====================================================

"use client"

import { useEffect, useState, useTransition, useCallback, useRef } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { NumericInput } from "@/components/ui/numeric-input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { useSupabase } from "@/lib/supabase/hooks"
import Link from "next/link"
import { useToast } from "@/hooks/use-toast"
import { toastActionError, toastActionSuccess } from "@/lib/notifications"
import { CreditCard } from "lucide-react"
import { getExchangeRate, getActiveCurrencies, calculateFXGainLoss, createFXGainLossEntry, type Currency } from "@/lib/currency-service"
import { CustomerSearchSelect } from "@/components/CustomerSearchSelect"
import { getActiveCompanyId } from "@/lib/company"
import { computeLeafAccountBalancesAsOf } from "@/lib/ledger"
import { canAction } from "@/lib/authz"
import { validateBankAccountAccess, type UserContext, getAccessFilter } from "@/lib/validation"
import { useBranchFilter } from "@/hooks/use-branch-filter"
import { BranchFilter } from "@/components/BranchFilter"
import { useRealtimeTable } from "@/hooks/use-realtime-table"
import { SupplierPaymentAllocationUI } from "@/components/payments/SupplierPaymentAllocationUI"
import { CustomerPaymentAllocationUI } from "@/components/payments/CustomerPaymentAllocationUI"
import { notifyPaymentApprovalRequest } from "@/lib/notification-helpers"
import { PaymentDetailsModal } from "@/components/payments/PaymentDetailsModal"
import { Eye } from "lucide-react"

interface Customer { 
  id: string; 
  name: string; 
  phone?: string | null;
  branch_id?: string | null;
  cost_center_id?: string | null;
}
interface Supplier { id: string; name: string }
interface Payment {
  id: string;
  customer_id?: string;
  supplier_id?: string;
  invoice_id?: string | null;
  purchase_order_id?: string | null;
  bill_id?: string | null;
  payment_date: string;
  amount: number;
  payment_method?: string;
  reference_number?: string;
  notes?: string;
  account_id?: string | null;
  display_currency?: string;
  display_amount?: number;
  original_currency?: string;
  currency_code?: string;
  exchange_rate_used?: number;
  exchange_rate?: number;
  branch_id?: string | null;
  cost_center_id?: string | null;
  branches?: { name: string } | null;
  // ✅ Approval Workflow
  status?: string; // 'pending_approval' | 'approved' | 'rejected'
  created_by?: string | null;
  approved_by?: string | null;
  approved_at?: string | null;
  rejected_by?: string | null;
  rejected_at?: string | null;
  rejection_reason?: string | null;
}

interface Branch { id: string; name: string }
interface InvoiceRow {
  id: string;
  invoice_number: string;
  invoice_date?: string;
  total_amount: number;
  paid_amount: number;
  status: string;
  branch_id?: string | null;
  branches?: { name: string } | null;
}
interface PORow {
  id: string;
  po_number: string;
  total_amount: number;
  received_amount: number;
  status: string;
  branch_id?: string | null;
  branches?: { name: string } | null;
}
interface BillRow {
  id: string;
  bill_number: string;
  bill_date?: string;
  total_amount: number;
  paid_amount: number;
  returned_amount?: number;
  status: string;
  branch_id?: string | null;
  branches?: { name: string } | null;
}
interface Account { id: string; account_code: string; account_name: string; account_type: string }
interface AccountMapping {
  companyId: string;
  ar: string | undefined;
  ap: string | undefined;
  cash: string | undefined;
  bank: string | undefined;
  revenue: string | undefined;
  inventory: string | undefined;
  cogs: string | undefined;
  vatPayable: string | undefined;
  shippingAccount: string | undefined;
  supplierAdvance: string | undefined;
  customerAdvance: string | undefined;
  branchId: string | null;
  costCenterId: string | null;
  fxGain?: string;
  fxLoss?: string;
}

export default function PaymentsPage() {
  const supabase = useSupabase()
  const { toast } = useToast()
  const [appLang, setAppLang] = useState<'ar' | 'en'>('ar')
  const [selectedPaymentDetailsId, setSelectedPaymentDetailsId] = useState<string | null>(null)
  const [online, setOnline] = useState<boolean>(true)
  const [customers, setCustomers] = useState<Customer[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [customerPayments, setCustomerPayments] = useState<Payment[]>([])
  const [supplierPayments, setSupplierPayments] = useState<Payment[]>([])
  // 🔐 المدفوعات الخام (قبل الفلترة بناءً على فرع الفاتورة) - للمستخدمين العاديين
  const [rawCustomerPayments, setRawCustomerPayments] = useState<Payment[]>([])
  const [rawSupplierPayments, setRawSupplierPayments] = useState<Payment[]>([])
  const [invoiceNumbers, setInvoiceNumbers] = useState<Record<string, string>>({})
  const [billNumbers, setBillNumbers] = useState<Record<string, string>>({})
  const [poNumbers, setPoNumbers] = useState<Record<string, string>>({})
  const [billToPoMap, setBillToPoMap] = useState<Record<string, string>>({})
  const [accountNames, setAccountNames] = useState<Record<string, string>>({}) // Map bill_id -> purchase_order_id
  const [branches, setBranches] = useState<Branch[]>([])
  const [branchNames, setBranchNames] = useState<Record<string, string>>({})
  const [invoiceToSalesOrderMap, setInvoiceToSalesOrderMap] = useState<Record<string, { id: string; so_number: string }>>({}) // Map invoice_id -> sales_order
  const [invoiceBranchMap, setInvoiceBranchMap] = useState<Record<string, string>>({}) // Map invoice_id -> branch_id
  const [billBranchMap, setBillBranchMap] = useState<Record<string, string>>({}) // Map bill_id -> branch_id
  // 🔐 حفظ سياق الفلترة للاستخدام في useEffect لاحقاً
  const [pendingBranchFilter, setPendingBranchFilter] = useState<{ userBranchId: string | null; isPrivileged: boolean } | null>(null)
  const [loading, setLoading] = useState(true)

  // Currency support - using CurrencyService
  const [currencies, setCurrencies] = useState<Currency[]>([])
  const [paymentCurrency, setPaymentCurrency] = useState<string>(() => {
    if (typeof window === 'undefined') return 'EGP'
    try { return localStorage.getItem('app_currency') || 'EGP' } catch { return 'EGP' }
  })
  const [baseCurrency, setBaseCurrency] = useState<string>(() => {
    if (typeof window === 'undefined') return 'EGP'
    try { return localStorage.getItem('app_currency') || 'EGP' } catch { return 'EGP' }
  })
  const [exchangeRate, setExchangeRate] = useState<number>(1)
  const [exchangeRateId, setExchangeRateId] = useState<string | undefined>(undefined)
  const [rateSource, setRateSource] = useState<string>('api')
  const [fetchingRate, setFetchingRate] = useState<boolean>(false)
  const [companyId, setCompanyId] = useState<string | null>(null)

  const currencySymbols: Record<string, string> = {
    EGP: '£', USD: '$', EUR: '€', GBP: '£', SAR: '﷼', AED: 'د.إ',
    KWD: 'د.ك', QAR: '﷼', BHD: 'د.ب', OMR: '﷼', JOD: 'د.أ', LBP: 'ل.ل'
  }
  const currencySymbol = currencySymbols[paymentCurrency] || paymentCurrency

  // Helper: Get display amount (use converted if available)
  const getDisplayAmount = (payment: Payment): number => {
    if (payment.display_currency === paymentCurrency && payment.display_amount != null) {
      return payment.display_amount
    }
    return payment.amount
  }

  // New payment form states
  const [newCustPayment, setNewCustPayment] = useState({ customer_id: "", amount: 0, date: new Date().toISOString().slice(0, 10), method: "cash", ref: "", notes: "", account_id: "" })
  const [newSuppPayment, setNewSuppPayment] = useState({ supplier_id: "", amount: 0, date: new Date().toISOString().slice(0, 10), method: "cash", ref: "", notes: "", account_id: "" })
  const [supplierQuery, setSupplierQuery] = useState("")
  // متغيرات اختيارية كانت مستخدمة ضمن ربط تلقائي للدفع بالفواتير
  const [selectedFormBillId, setSelectedFormBillId] = useState<string>("")
  const [selectedFormInvoiceId, setSelectedFormInvoiceId] = useState<string>("")
  const [newSuppAccountType] = useState<string>("")
  const [formCustomerInvoices, setFormCustomerInvoices] = useState<InvoiceRow[]>([])
  const [formSupplierBills, setFormSupplierBills] = useState<BillRow[]>([])

  // Apply dialogs
  const [applyInvoiceOpen, setApplyInvoiceOpen] = useState(false)
  const [applyPoOpen, setApplyPoOpen] = useState(false)
  const [applyBillOpen, setApplyBillOpen] = useState(false)
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null)
  const [customerInvoices, setCustomerInvoices] = useState<InvoiceRow[]>([])
  const [supplierPOs, setSupplierPOs] = useState<PORow[]>([])
  const [supplierBills, setSupplierBills] = useState<BillRow[]>([])
  const [applyAmount, setApplyAmount] = useState<number>(0)
  const [applyDocId, setApplyDocId] = useState<string>("")
  const [saving, setSaving] = useState(false)
  const [isPending, startTransition] = useTransition()

  // Edit/Delete dialogs
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [editingPayment, setEditingPayment] = useState<Payment | null>(null)
  const [deletingPayment, setDeletingPayment] = useState<Payment | null>(null)
  const [editFields, setEditFields] = useState({ payment_date: "", payment_method: "", reference_number: "", notes: "", account_id: "" })

  // ✅ Approval Workflow state
  const [rejectOpen, setRejectOpen] = useState(false)
  const [rejectionReason, setRejectionReason] = useState("")
  const [approvingPaymentId, setApprovingPaymentId] = useState<string | null>(null)
  const [rejectingPayment, setRejectingPayment] = useState<Payment | null>(null)

  // === إصلاح أمني: صلاحيات التعديل والحذف ===
  const [permUpdate, setPermUpdate] = useState(false)
  const [permDelete, setPermDelete] = useState(false)
  const [permWrite, setPermWrite] = useState(false)

  // 🔐 ERP Access Control - سياق المستخدم
  const [userContext, setUserContext] = useState<UserContext | null>(null)
  const [canOverrideContext, setCanOverrideContext] = useState(false)

  // 🔐 فلتر الفروع الموحد - يظهر فقط للأدوار المميزة (Owner/Admin/General Manager)
  const branchFilter = useBranchFilter()

  // 🔐 ERP Governance: التحقق من صلاحية الدفع على فاتورة/فاتورة مورد
  // Owner/Admin/General Manager: يمكنهم الدفع على أي فاتورة
  // باقي المستخدمين: يمكنهم الدفع فقط على فواتير فرعهم
  const canPayOnDocument = useCallback((documentBranchId: string | null): boolean => {
    if (!userContext) return false

    // Owner, Admin, General Manager يمكنهم الدفع على أي فاتورة
    const privilegedRoles = ['owner', 'admin', 'general_manager']
    if (userContext.role && privilegedRoles.includes(userContext.role)) {
      return true
    }

    // باقي المستخدمين: يجب أن تكون الفاتورة من نفس الفرع
    // إذا لم يكن للمستخدم فرع محدد، يمكنه الدفع على الفواتير بدون فرع فقط
    if (!userContext.branch_id) {
      return !documentBranchId // يمكنه الدفع فقط على الفواتير بدون فرع
    }

    // إذا كان للمستخدم فرع، يجب أن تكون الفاتورة من نفس الفرع أو بدون فرع
    return !documentBranchId || documentBranchId === userContext.branch_id
  }, [userContext])

  // التحقق من الصلاحيات
  // تهيئة القيم بعد hydration
  useEffect(() => {
    try {
      setAppLang((localStorage.getItem('app_language') || 'ar') === 'en' ? 'en' : 'ar')
      setOnline(navigator.onLine)
    } catch { }
  }, [])

  useEffect(() => {
    const checkPerms = async () => {
      const [write, update, del] = await Promise.all([
        canAction(supabase, "payments", "write"),
        canAction(supabase, "payments", "update"),
        canAction(supabase, "payments", "delete"),
      ])
      setPermWrite(write)
      setPermUpdate(update)
      setPermDelete(del)
    }
    checkPerms()
  }, [supabase])

  // مراقبة الاتصال بالإنترنت
  useEffect(() => {
    const handleOnline = () => setOnline(true)
    const handleOffline = () => {
      setOnline(false)
      toast({ title: "انقطاع الاتصال", description: "لا يوجد اتصال بالإنترنت. بعض الإجراءات ستتوقف.", variant: "default" })
    }
    window.addEventListener("online", handleOnline)
    window.addEventListener("offline", handleOffline)
    return () => {
      window.removeEventListener("online", handleOnline)
      window.removeEventListener("offline", handleOffline)
    }
  }, [toast])

  // Listen for currency changes
  useEffect(() => {
    let isHandling = false // منع معالجة متعددة في نفس الوقت
    const handleCurrencyChange = () => {
      if (isHandling) return // تجاهل إذا كانت المعالجة جارية
      isHandling = true
      
      const newCurrency = localStorage.getItem('app_currency') || 'EGP'
      if (newCurrency !== paymentCurrency) {
      setPaymentCurrency(newCurrency)
        // ✅ تحديث العملة فقط بدون إعادة تحميل كامل للصفحة
        // البيانات ستُحدث تلقائياً عند تغيير paymentCurrency
      }
      
      // إعادة تعيين flag بعد تأخير قصير
      setTimeout(() => {
        isHandling = false
      }, 1000)
    }
    window.addEventListener('app_currency_changed', handleCurrencyChange)
    return () => window.removeEventListener('app_currency_changed', handleCurrencyChange)
  }, [paymentCurrency])

  useEffect(() => {
    ; (async () => {
      try {
        setLoading(true)
        const activeCompanyId = await getActiveCompanyId(supabase)
        if (!activeCompanyId) return
        setCompanyId(activeCompanyId)

        // 🔐 ERP Access Control - جلب سياق المستخدم
        const { data: { user } } = await supabase.auth.getUser()
        let currentRole = 'viewer'
        let currentBranchId: string | null = null
        let currentCostCenterId: string | null = null
        let currentWarehouseId: string | null = null
        
        if (user) {
          const { data: memberData } = await supabase
            .from("company_members")
            .select("role, branch_id, cost_center_id, warehouse_id")
            .eq("company_id", activeCompanyId)
            .eq("user_id", user.id)
            .maybeSingle()

          const { data: companyData } = await supabase
            .from("companies")
            .select("user_id")
            .eq("id", activeCompanyId)
            .single()

          const isOwner = companyData?.user_id === user.id
          currentRole = isOwner ? "owner" : (memberData?.role || "viewer")
          currentBranchId = isOwner ? null : (memberData?.branch_id || null)
          currentCostCenterId = isOwner ? null : (memberData?.cost_center_id || null)
          currentWarehouseId = isOwner ? null : (memberData?.warehouse_id || null)

          const context: UserContext = {
            user_id: user.id,
            company_id: activeCompanyId,
            branch_id: currentBranchId,
            cost_center_id: currentCostCenterId,
            warehouse_id: currentWarehouseId,
            role: currentRole,
          }
          setUserContext(context)
          setCanOverrideContext(["owner", "admin", "manager"].includes(currentRole))
        }

        // Load currencies from database
        const dbCurrencies = await getActiveCurrencies(supabase, activeCompanyId)
        if (dbCurrencies.length > 0) {
          setCurrencies(dbCurrencies)
          const base = dbCurrencies.find(c => c.is_base)
          if (base) setBaseCurrency(base.code)
        }

        // 🔐 ERP Access Control - جلب العملاء مع تطبيق الصلاحيات
        // استخدام القيم المحلية بدلاً من userContext لأن setState غير متزامن
        const accessFilter = getAccessFilter(
          currentRole,
          user?.id || '',
          currentBranchId,
          currentCostCenterId
        );

        let allCustomers: Customer[] = [];
        if (accessFilter.filterByCreatedBy && accessFilter.createdByUserId) {
          // موظف عادي: يرى فقط العملاء الذين أنشأهم
          let query = supabase.from("customers").select("id, name, phone").eq("company_id", activeCompanyId).eq("created_by_user_id", accessFilter.createdByUserId);
          const { data: ownCust } = await query;
          allCustomers = ownCust || [];
          // جلب العملاء المشتركين
          const { data: sharedPerms } = await supabase.from("permission_sharing").select("grantor_user_id").eq("grantee_user_id", user?.id || '').eq("company_id", activeCompanyId).eq("is_active", true).or("resource_type.eq.all,resource_type.eq.customers");
          if (sharedPerms && sharedPerms.length > 0) {
            const grantorIds = sharedPerms.map((p: any) => p.grantor_user_id);
            const { data: sharedCust } = await supabase.from("customers").select("id, name, phone").eq("company_id", activeCompanyId).in("created_by_user_id", grantorIds);
            const existingIds = new Set(allCustomers.map(c => c.id));
            (sharedCust || []).forEach((c: Customer) => { if (!existingIds.has(c.id)) allCustomers.push(c); });
          }
        } else if (accessFilter.filterByBranch) {
          // مدير/محاسب: يرى عملاء الفرع
          if (accessFilter.branchId) {
            // ✅ جلب عملاء الفرع
            const { data: branchCust, error: branchCustError } = await supabase
              .from("customers")
              .select("id, name, phone, branch_id, cost_center_id")
              .eq("company_id", activeCompanyId)
              .eq("branch_id", accessFilter.branchId);
            
            if (branchCustError) {
              console.error("[Payments] Error fetching branch customers:", branchCustError);
              allCustomers = [];
            } else {
          allCustomers = branchCust || [];
              
              // ✅ إضافة فلتر مركز التكلفة إذا كان مفعلاً
              if (accessFilter.filterByCostCenter && accessFilter.costCenterId) {
                allCustomers = allCustomers.filter((c: any) => 
                  !c.cost_center_id || c.cost_center_id === accessFilter.costCenterId
                );
              }
              
              // ✅ إضافة العملاء بدون branch_id (NULL) - قد يكونون عملاء عامين
              // جلبهم بشكل منفصل ودمجهم مع عملاء الفرع
              const { data: nullBranchCust } = await supabase
                .from("customers")
                .select("id, name, phone, branch_id, cost_center_id")
                .eq("company_id", activeCompanyId)
                .is("branch_id", null);
              
              if (nullBranchCust && nullBranchCust.length > 0) {
                // دمج العملاء بدون branch_id مع عملاء الفرع
                const existingIds = new Set(allCustomers.map((c: Customer) => c.id));
                (nullBranchCust as Customer[]).forEach((c: Customer) => {
                  if (!existingIds.has(c.id)) {
                    // ✅ إضافة فقط إذا لم يكن هناك فلتر مركز التكلفة أو إذا كان cost_center_id null أو متطابق
                    if (!accessFilter.filterByCostCenter || !accessFilter.costCenterId || 
                        !c.cost_center_id || c.cost_center_id === accessFilter.costCenterId) {
                      allCustomers.push(c);
                    }
                  }
                });
              }
            }
        } else {
            // إذا لم يكن هناك branch_id محدد، جلب جميع العملاء (fallback)
            // هذا يحدث عندما يكون المستخدم مدير/محاسب لكن بدون فرع محدد
            const { data: allCust } = await supabase.from("customers").select("id, name, phone").eq("company_id", activeCompanyId);
            allCustomers = allCust || [];
          }
        } else {
          // owner/admin: جميع العملاء
          const { data: allCust } = await supabase.from("customers").select("id, name, phone").eq("company_id", activeCompanyId);
          allCustomers = allCust || [];
        }
        setCustomers(allCustomers)
        // 🔐 ERP Access Control - جلب الموردين مع تطبيق الصلاحيات (نفس منطق العملاء)
        let allSuppliers: Supplier[] = [];
        if (accessFilter.filterByCreatedBy && accessFilter.createdByUserId) {
          // موظف عادي: يرى فقط الموردين الذين أنشأهم
          const { data: ownSupps } = await supabase
            .from("suppliers")
            .select("id, name")
            .eq("company_id", activeCompanyId)
            .eq("created_by_user_id", accessFilter.createdByUserId);
          allSuppliers = ownSupps || [];
          // جلب الموردين المشتركين
          const { data: sharedPerms } = await supabase
            .from("permission_sharing")
            .select("grantor_user_id")
            .eq("grantee_user_id", user?.id || '')
            .eq("company_id", activeCompanyId)
            .eq("is_active", true)
            .or("resource_type.eq.all,resource_type.eq.suppliers");
          if (sharedPerms && sharedPerms.length > 0) {
            const grantorIds = sharedPerms.map((p: any) => p.grantor_user_id);
            const { data: sharedSupps } = await supabase
              .from("suppliers")
              .select("id, name")
              .eq("company_id", activeCompanyId)
              .in("created_by_user_id", grantorIds);
            const existingIds = new Set(allSuppliers.map((s: Supplier) => s.id));
            (sharedSupps || []).forEach((s: Supplier) => { if (!existingIds.has(s.id)) allSuppliers.push(s); });
          }
        } else if (accessFilter.filterByBranch && accessFilter.branchId) {
          // مدير/محاسب: يرى موردين الفرع + الموردين بدون فرع
          const { data: branchSupps } = await supabase
            .from("suppliers")
            .select("id, name")
            .eq("company_id", activeCompanyId)
            .eq("branch_id", accessFilter.branchId);
          allSuppliers = branchSupps || [];
          // إضافة الموردين بدون branch_id
          const { data: nullBranchSupps } = await supabase
            .from("suppliers")
            .select("id, name")
            .eq("company_id", activeCompanyId)
            .is("branch_id", null);
          const existingIds = new Set(allSuppliers.map((s: Supplier) => s.id));
          (nullBranchSupps || []).forEach((s: Supplier) => { if (!existingIds.has(s.id)) allSuppliers.push(s); });
        } else {
          // owner/admin: جميع الموردين
          const { data: supps, error: suppsErr } = await supabase.from("suppliers").select("id, name").eq("company_id", activeCompanyId)
          if (suppsErr) {
            toastActionError(toast, "الجلب", "الموردين", "تعذر جلب قائمة الموردين")
          }
          allSuppliers = supps || [];
        }
        setSuppliers(allSuppliers)
        // 🔐 ERP Access Control - جلب الحسابات مع تصفية حسب سياق المستخدم
        let accountsQuery = supabase
          .from("chart_of_accounts")
          .select("id, account_code, account_name, account_type, sub_type, branch_id, cost_center_id, parent_id")
          .eq("company_id", activeCompanyId)
          .eq("is_active", true)

        const { data: accs, error: accsErr } = await accountsQuery
        if (accsErr) {
          toastActionError(toast, "الجلب", "شجرة الحسابات", "تعذر جلب الحسابات")
        }

        // ✅ استخدام filterCashBankAccounts للحصول على حسابات النقد والبنك (نفس المنطق في صفحة الأعمال المصرفية)
        // هذا يضمن ظهور نفس الحسابات في جميع الصفحات
        const { filterCashBankAccounts } = await import("@/lib/accounts")
        const cashBankAccounts = filterCashBankAccounts(accs || [], true)

        // ✅ حسابات النقد والبنك مرئية لجميع المستخدمين في الشركة (حسابات دفع مشتركة)
        // لا نطبق فلتر الفرع/مركز التكلفة على حسابات النقد والبنك
        setAccounts(cashBankAccounts as any)

        // 🔐 ERP Access Control - جلب المدفوعات مع تطبيق الصلاحيات
        // Owner/Admin/General Manager: يرون جميع المدفوعات
        // باقي المستخدمين: يرون فقط مدفوعات فرعهم
        const { buildDataVisibilityFilter, applyDataVisibilityFilter } = await import("@/lib/data-visibility-control")
        const context: UserContext = {
          user_id: user?.id || '',
          company_id: activeCompanyId,
          branch_id: currentBranchId,
          cost_center_id: currentCostCenterId,
          warehouse_id: currentWarehouseId,
          role: currentRole,
        }
        const visibilityRules = buildDataVisibilityFilter(context)

        // 🔐 الأدوار المميزة التي يمكنها فلترة الفروع
        const PRIVILEGED_ROLES = ['owner', 'admin', 'general_manager']
        const isPrivileged = PRIVILEGED_ROLES.includes(currentRole.toLowerCase())
        const selectedBranchId = branchFilter.getFilteredBranchId()
        const userBranchId = visibilityRules.branchId || null

        // جلب مدفوعات العملاء
        let custPaysQuery = supabase
          .from("payments")
          .select("*, branches:branch_id(name)")
          .eq("company_id", activeCompanyId)
          .not("customer_id", "is", null)

        // 🔐 المستخدم المميز: يمكنه فلترة بفرع معين (اختياري)
        // المستخدم العادي: نجلب كل المدفوعات ونفلترها لاحقاً بناءً على فرع الفاتورة
        if (isPrivileged && selectedBranchId) {
          custPaysQuery = custPaysQuery.eq("branch_id", selectedBranchId)
        }
        // ملاحظة: للمستخدم العادي، لا نفلتر هنا - سنفلتر لاحقاً بناءً على فرع الفاتورة

        const { data: custPays, error: custPaysErr } = await custPaysQuery
          .order("payment_date", { ascending: false })
        if (custPaysErr) {
          toastActionError(toast, "الجلب", "مدفوعات العملاء", "تعذر جلب مدفوعات العملاء")
        }

        // 🔐 للمستخدم العادي: حفظ المدفوعات الخام للفلترة لاحقاً
        if (!isPrivileged && userBranchId) {
          setRawCustomerPayments(custPays || [])
          setPendingBranchFilter({ userBranchId, isPrivileged: false })
          // لا نعرض شيء حتى يتم الفلترة بناءً على فرع الفاتورة
          setCustomerPayments([])
        } else {
          setCustomerPayments(custPays || [])
          setRawCustomerPayments([])
        }

        // جلب مدفوعات الموردين
        let suppPaysQuery = supabase
          .from("payments")
          .select("*, branches:branch_id(name)")
          .eq("company_id", activeCompanyId)
          .not("supplier_id", "is", null)

        // 🔐 الأدوار المميزة: فلترة اختيارية بالفرع المحدد
        if (isPrivileged && selectedBranchId) {
          suppPaysQuery = suppPaysQuery.eq("branch_id", selectedBranchId)
        }
        // 🔐 الأدوار العادية: فلترة مباشرة بفرع المستخدم في القاعدة (ERP standard)
        if (!isPrivileged && userBranchId) {
          suppPaysQuery = suppPaysQuery.eq("branch_id", userBranchId)
        }

        const { data: suppPays, error: suppPaysErr } = await suppPaysQuery
          .order("payment_date", { ascending: false })
        if (suppPaysErr) {
          toastActionError(toast, "الجلب", "مدفوعات الموردين", "تعذر جلب مدفوعات الموردين")
        }

        // ✅ دائماً نعرض المدفوعات مباشرة (مفلترة في القاعدة)
        setSupplierPayments(suppPays || [])
        setRawSupplierPayments([])

        // 🔐 جلب قائمة الفروع للعرض في الجداول
        const { data: branchesData } = await supabase
          .from("branches")
          .select("id, name")
          .eq("company_id", activeCompanyId)
          .order("name")
        setBranches(branchesData || [])

        // إنشاء خريطة أسماء الفروع للوصول السريع
        const branchNameMap: Record<string, string> = {}
        ;(branchesData || []).forEach((b: Branch) => { branchNameMap[b.id] = b.name })
        setBranchNames(branchNameMap)
      } finally {
        setLoading(false)
      }
    })()
  }, [branchFilter.selectedBranchId]) // إعادة تحميل البيانات عند تغيير الفرع المحدد

  // 🔄 الاستماع لتغيير الشركة وإعادة تحميل الصفحة
  useEffect(() => {
    let isReloading = false // منع reload متعدد
    const handleCompanyChange = () => {
      if (isReloading) return // تجاهل إذا كان reload جارياً
      isReloading = true
      // تأخير قصير قبل reload لمنع reload متعدد
      setTimeout(() => {
      window.location.reload();
      }, 100)
    };
    window.addEventListener('company_updated', handleCompanyChange);
    return () => window.removeEventListener('company_updated', handleCompanyChange);
  }, []);

  // 🔄 Realtime: تحديث قائمة المدفوعات تلقائياً عند أي تغيير
  const reloadPaymentsRef = useRef<() => void>(() => {
    window.location.reload()
  })

  // 🔄 دالة مشتركة لإعادة تحميل المدفوعات مع تطبيق الفلترة الصحيحة
  const reloadPaymentsWithFilters = useCallback(async () => {
    if (!companyId || !userContext) return
    try {
      const { buildDataVisibilityFilter } = await import("@/lib/data-visibility-control")
      const visibilityRules = buildDataVisibilityFilter(userContext)

      const PRIVILEGED_ROLES = ['owner', 'admin', 'general_manager']
      const isPrivileged = PRIVILEGED_ROLES.includes((userContext.role || '').toLowerCase())
      const selectedBranchId = branchFilter.getFilteredBranchId()
      const userBranchId = visibilityRules.branchId || null

      // جلب مدفوعات العملاء
      let custPaysQuery = supabase
        .from("payments")
        .select("*, branches:branch_id(name)")
        .eq("company_id", companyId)
        .not("customer_id", "is", null)

      // 🔐 المستخدم المميز: يمكنه فلترة بفرع معين (اختياري)
      if (isPrivileged && selectedBranchId) {
        custPaysQuery = custPaysQuery.eq("branch_id", selectedBranchId)
      }

      const { data: custPays } = await custPaysQuery.order("payment_date", { ascending: false })

      // 🔐 للمستخدم العادي: حفظ المدفوعات الخام للفلترة لاحقاً
      if (!isPrivileged && userBranchId) {
        setRawCustomerPayments(custPays || [])
        setPendingBranchFilter({ userBranchId, isPrivileged: false })
        setCustomerPayments([])
      } else {
        setCustomerPayments(custPays || [])
        setRawCustomerPayments([])
      }

      // جلب مدفوعات الموردين مع فرع الفاتورة وأمر الشراء مباشرةً
      let suppPaysQuery = supabase
        .from("payments")
        .select("*, branches:branch_id(name), bill:bill_id(id, branch_id, bill_branches:branch_id(name), purchase_order_id, purchase_order:purchase_order_id(branch_id, po_branches:branch_id(name)))")
        .eq("company_id", companyId)
        .not("supplier_id", "is", null)

      // 🔐 المستخدم المميز: يمكنه فلترة بفرع معين (اختياري)
      if (isPrivileged && selectedBranchId) {
        suppPaysQuery = suppPaysQuery.eq("branch_id", selectedBranchId)
      }

      // 🔐 المستخدم العادي: تطبيق فلتر الفرع مباشرة في الاستعلام (ERP standard)
      if (!isPrivileged && userBranchId) {
        suppPaysQuery = suppPaysQuery.eq("branch_id", userBranchId)
      }

      const { data: suppPays } = await suppPaysQuery.order("payment_date", { ascending: false })

      // ✅ المستخدم العادي يرى مدفوعات فرعه فقط (مفلترة في القاعدة)
      setSupplierPayments(suppPays || [])
      setRawSupplierPayments([])
    } catch (err) {
      console.error("Error reloading payments with filters:", err)
    }
  }, [companyId, userContext, branchFilter, supabase])

  const handlePaymentsRealtimeEvent = useCallback(() => {
    console.log('🔄 [Payments] Realtime event received, refreshing payments list...')
    reloadPaymentsRef.current()
  }, [])

  useRealtimeTable({
    table: 'payments',
    enabled: true,
    onInsert: handlePaymentsRealtimeEvent,
    onUpdate: handlePaymentsRealtimeEvent,
    onDelete: handlePaymentsRealtimeEvent,
  })

  // Load invoice numbers, branch_ids and related sales orders for displayed customer payments
  // 🔐 للمستخدم العادي: نجلب بيانات الفواتير من المدفوعات الخام ثم نفلتر
  // ✅ إصلاح: إزالة customerPayments من dependencies لمنع infinite loop
  useEffect(() => {
    ; (async () => {
      try {
        // استخدام المدفوعات الخام للمستخدم العادي، أو المدفوعات المفلترة للمستخدم المميز
        const paymentsToProcess = rawCustomerPayments.length > 0 ? rawCustomerPayments : customerPayments
        const ids = Array.from(new Set((paymentsToProcess || []).map((p) => p.invoice_id).filter(Boolean))) as string[]
        if (!ids.length) {
          setInvoiceNumbers({})
          setInvoiceToSalesOrderMap({})
          setInvoiceBranchMap({})
          // 🔐 للمستخدم العادي: إذا لا توجد فواتير، نعرض قائمة فارغة
          if (rawCustomerPayments.length > 0 && pendingBranchFilter) {
            setCustomerPayments([])
          }
          return
        }
        // ✅ جلب branch_id مع بيانات الفاتورة لعرض الفرع الصحيح في قائمة المدفوعات
        const { data: invs } = await supabase.from("invoices").select("id, invoice_number, sales_order_id, branch_id").in("id", ids)
        const map: Record<string, string> = {}
        const branchMap: Record<string, string> = {} // invoice_id -> branch_id
        const salesOrderIds: string[] = []
        ; (invs || []).forEach((r: any) => {
          map[r.id] = r.invoice_number
          if (r.branch_id) branchMap[r.id] = r.branch_id
          if (r.sales_order_id) salesOrderIds.push(r.sales_order_id)
        })
        setInvoiceNumbers(map)
        setInvoiceBranchMap(branchMap)

        // 🔐 للمستخدم العادي: فلترة المدفوعات بناءً على فرع الفاتورة
        if (rawCustomerPayments.length > 0 && pendingBranchFilter && pendingBranchFilter.userBranchId) {
          const userBranchId = pendingBranchFilter.userBranchId
          const filteredPayments = rawCustomerPayments.filter((p) => {
            // 1. إذا الدفعة لها branch_id ويطابق فرع المستخدم
            if (p.branch_id === userBranchId) return true
            // 2. إذا الفاتورة المرتبطة من فرع المستخدم
            if (p.invoice_id && branchMap[p.invoice_id] === userBranchId) return true
            // 3. إذا الدفعة بدون branch_id والفاتورة بدون branch_id (fallback)
            if (!p.branch_id && p.invoice_id && !branchMap[p.invoice_id]) return true
            return false
          })
          setCustomerPayments(filteredPayments)
        }

        // جلب بيانات أوامر البيع المرتبطة
        if (salesOrderIds.length > 0) {
          const uniqueSoIds = Array.from(new Set(salesOrderIds))
          const { data: salesOrders } = await supabase.from("sales_orders").select("id, so_number").in("id", uniqueSoIds)
          const soMap: Record<string, { id: string; so_number: string }> = {}
          // ربط الفاتورة بأمر البيع
          ; (invs || []).forEach((inv: any) => {
            if (inv.sales_order_id) {
              const so = (salesOrders || []).find((s: any) => s.id === inv.sales_order_id)
              if (so) {
                soMap[inv.id] = { id: so.id, so_number: so.so_number }
              }
            }
          })
          setInvoiceToSalesOrderMap(soMap)
        } else {
          setInvoiceToSalesOrderMap({})
        }
      } catch (e) { /* ignore */ }
    })()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawCustomerPayments, pendingBranchFilter, supabase])

  // Load bill numbers and branch_ids for displayed supplier payments
  // ✅ يدعم كلاً من: bill_id مباشر على الدفعة + payment_allocations (نظام التوزيع الجديد)
  useEffect(() => {
    ;(async () => {
      try {
        const paymentsToProcess = rawSupplierPayments.length > 0 ? rawSupplierPayments : supplierPayments
        if (!paymentsToProcess.length) {
          setBillNumbers({})
          setBillBranchMap({})
          setBillToPoMap({})
          setPoNumbers({})
          return
        }

        // 1. bill_ids المباشرة على الدفعة (النظام القديم)
        const directBillIds = Array.from(new Set(paymentsToProcess.map((p) => p.bill_id).filter(Boolean))) as string[]

        // 2. bill_ids من payment_allocations (نظام التوزيع الجديد)
        const paymentIds = paymentsToProcess.map((p) => p.id)
        let allocBillIds: string[] = []
        if (paymentIds.length > 0) {
          const { data: allocs } = await supabase
            .from("payment_allocations")
            .select("payment_id, bill_id")
            .in("payment_id", paymentIds)
            .not("bill_id", "is", null)
          allocBillIds = Array.from(new Set((allocs || []).map((a: any) => a.bill_id).filter(Boolean))) as string[]
        }

        const ids = Array.from(new Set([...directBillIds, ...allocBillIds]))
        if (!ids.length) {
          setBillNumbers({})
          setBillBranchMap({})
          setBillToPoMap({})
          setPoNumbers({})
          // 🔐 للمستخدم العادي: إذا لا توجد فواتير مرتبطة → قائمة فارغة
          if (rawSupplierPayments.length > 0) setSupplierPayments([])
          return
        }

        // ✅ جلب branch_id مع بيانات الفاتورة
        const { data: bills } = await supabase
          .from("bills")
          .select("id, bill_number, purchase_order_id, branch_id")
          .in("id", ids)
        const map: Record<string, string> = {}
        const branchMap: Record<string, string> = {} // bill_id -> branch_id
        const billPoMap: Record<string, string> = {}  // bill_id -> purchase_order_id
        ;(bills || []).forEach((r: any) => {
          map[r.id] = r.bill_number
          if (r.branch_id) branchMap[r.id] = r.branch_id
          if (r.purchase_order_id) billPoMap[r.id] = r.purchase_order_id
        })
        setBillNumbers(map)
        setBillBranchMap(branchMap)
        setBillToPoMap(billPoMap)

        // ✅ جلب أرقام أوامر الشراء
        const poIds = Array.from(new Set((bills || []).map((b: any) => b.purchase_order_id).filter(Boolean))) as string[]
        if (poIds.length > 0) {
          const { data: pos } = await supabase.from("purchase_orders").select("id, po_number").in("id", poIds)
          const poMap: Record<string, string> = {}
          ;(pos || []).forEach((po: any) => { poMap[po.id] = po.po_number })
          setPoNumbers(poMap)
        } else {
          setPoNumbers({})
        }

      } catch (e) { /* ignore */ }
    })()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supplierPayments, supabase])

  // Load account names for displayed supplier payments
  useEffect(() => {
    ; (async () => {
      try {
        const accountIds = Array.from(new Set((supplierPayments || []).map((p) => p.account_id).filter(Boolean))) as string[]
        if (!accountIds.length) { setAccountNames({}); return }
        const { data: accs } = await supabase.from("chart_of_accounts").select("id, account_name, account_code").in("id", accountIds)
        const map: Record<string, string> = {}
        ; (accs || []).forEach((a: any) => { 
          map[a.id] = `${a.account_name} (${a.account_code})`
        })
        setAccountNames(map)
      } catch (e) { /* ignore */ }
    })()
  }, [supplierPayments, supabase])

  // جلب فواتير العميل غير المسددة بالكامل عند اختيار عميل في نموذج إنشاء دفعة
  // 🔐 ERP Governance: فلترة حسب الفرع للمستخدمين غير المميزين
  useEffect(() => {
    ; (async () => {
      try {
        setSelectedFormInvoiceId("")
        if (!newCustPayment.customer_id) { setFormCustomerInvoices([]); return }

        let query = supabase
          .from("invoices")
          .select("id, invoice_number, invoice_date, total_amount, paid_amount, status, branch_id, branches:branch_id(name)")
          .eq("customer_id", newCustPayment.customer_id)
          .in("status", ["sent", "partially_paid", "partially_returned"]) // غير مسددة بالكامل (بما فيها المرتجعة جزئياً)

        // 🔐 ERP Governance: فلترة حسب الفرع للمستخدمين غير المميزين
        if (userContext && !canOverrideContext && userContext.branch_id) {
          query = query.eq("branch_id", userContext.branch_id)
        }

        const { data: invs } = await query.order("invoice_date", { ascending: false })
        setFormCustomerInvoices(invs || [])
      } catch (e) { /* ignore */ }
    })()
  }, [newCustPayment.customer_id, userContext, canOverrideContext])

  // جلب فواتير المورد غير المسددة بالكامل عند اختيار مورد في نموذج إنشاء دفعة
  // 🔐 ERP Governance: فلترة حسب الفرع للمستخدمين غير المميزين
  useEffect(() => {
    ; (async () => {
      try {
        setSelectedFormBillId("")
        if (!newSuppPayment.supplier_id) { setFormSupplierBills([]); return }
        if (!companyId) return

        let query = supabase
          .from("bills")
          .select("id, bill_number, bill_date, total_amount, paid_amount, returned_amount, status, branch_id, branches:branch_id(name)")
          .eq("supplier_id", newSuppPayment.supplier_id)
          .eq("company_id", companyId)
          .in("status", ["received", "partially_paid", "partially_returned"]) // ✅ فقط بعد الاستلام المخزني

        // 🔐 ERP Governance: فلترة حسب الفرع للمستخدمين غير المميزين
        if (userContext && !canOverrideContext && userContext.branch_id) {
          // ✅ يرى فواتير فرعه + الفواتير بدون branch_id (فواتير عامة للشركة)
          query = query.or(`branch_id.eq.${userContext.branch_id},branch_id.is.null`)
        }

        const { data: bills, error: billsFetchErr } = await query.order("bill_date", { ascending: false })
        if (billsFetchErr) console.error("Error loading supplier bills:", billsFetchErr)
        setFormSupplierBills(bills || [])
      } catch (e) {
        console.error("Error loading supplier bills:", e)
        setFormSupplierBills([])
      }
    })()
  }, [newSuppPayment.supplier_id, companyId, supabase, userContext, canOverrideContext])

  // 🔍 دالة للتحقق من كفاية رصيد الحساب البنكي/الخزنة
  const checkAccountBalance = async (accountId: string | null, amount: number, paymentDate: string): Promise<{ sufficient: boolean; currentBalance: number; accountName?: string }> => {
    if (!accountId || !companyId) {
      // إذا لم يتم اختيار حساب، نعتبر أن الرصيد كافٍ (سيستخدم الحساب الافتراضي)
      return { sufficient: true, currentBalance: 0 }
    }

    try {
      // جلب معلومات الحساب
      const { data: accountData } = await supabase
        .from("chart_of_accounts")
        .select("id, account_code, account_name, account_type, opening_balance, sub_type")
        .eq("id", accountId)
        .eq("company_id", companyId)
        .single()

      if (!accountData) {
        return { sufficient: false, currentBalance: 0 }
      }

      // حساب الرصيد الحالي حتى تاريخ الدفع
      const balances = await computeLeafAccountBalancesAsOf(supabase, companyId, paymentDate)
      const accountBalance = balances.find(b => b.account_id === accountId)

      if (!accountBalance) {
        // إذا لم يتم العثور على الرصيد، نستخدم opening_balance
        const currentBalance = Number(accountData.opening_balance || 0)
        return {
          sufficient: currentBalance >= amount,
          currentBalance,
          accountName: accountData.account_name
        }
      }

      // التحقق من كفاية الرصيد
      // للحسابات البنكية/الخزنة (أصول): الرصيد الطبيعي مدين، يجب أن يكون >= المبلغ
      const currentBalance = accountBalance.balance

      // للحسابات البنكية/الخزنة: الرصيد يجب أن يكون >= المبلغ المطلوب
      return {
        sufficient: currentBalance >= amount,
        currentBalance,
        accountName: accountData.account_name
      }
    } catch (error) {
      console.error("Error checking account balance:", error)
      // 🔒 في حالة الخطأ، نمنع الدفع للحماية من الأخطاء المحاسبية
      // إذا لم نتمكن من التحقق من الرصيد، من الأفضل منع العملية
      return { sufficient: false, currentBalance: 0 }
    }
  }

  const createCustomerPayment = async () => {
    try {
      setSaving(true)

      // 🚫 منع المبالغ السالبة - المرتجعات يجب أن تكون في sales_returns
      if (newCustPayment.amount < 0) {
        toast({
          title: appLang === 'en' ? 'Invalid Amount' : 'مبلغ غير صحيح',
          description: appLang === 'en'
            ? 'Payment amount cannot be negative. For returns, use the Returns feature in the invoice page.'
            : 'لا يمكن أن يكون مبلغ الدفعة سالباً. للمرتجعات، استخدم ميزة المرتجعات في صفحة الفاتورة.',
          variant: 'destructive'
        })
        setSaving(false)
        return
      }

      if (!newCustPayment.customer_id || newCustPayment.amount <= 0) return
      if (!companyId) return

      // ✅ دفعات العملاء هي مقبوضات (مدخلات) - لا نحتاج للتحقق من الرصيد
      // المال يدخل للحساب، لذا لا يوجد مشكلة في الرصيد

      // 🔐 ERP Access Control - التحقق من صلاحية استخدام الحساب البنكي
      if (userContext && newCustPayment.account_id) {
        // جلب معلومات الحساب للتحقق من الفرع ومركز التكلفة
        const { data: accountData } = await supabase
          .from("chart_of_accounts")
          .select("branch_id, cost_center_id")
          .eq("id", newCustPayment.account_id)
          .single()

        if (accountData) {
          const accessResult = validateBankAccountAccess(
            userContext,
            accountData.branch_id,
            accountData.cost_center_id,
            appLang
          )
          if (!accessResult.isValid && accessResult.error) {
            toast({
              title: accessResult.error.title,
              description: accessResult.error.description,
              variant: "destructive"
            })
            setSaving(false)
            return
          }
        }
      }

      // Attempt insert including account_id; fallback if column not exists
      const basePayload: any = {
        company_id: companyId,
        customer_id: newCustPayment.customer_id,
        payment_date: newCustPayment.date,
        amount: newCustPayment.amount,
        payment_method: newCustPayment.method,
        reference_number: newCustPayment.ref || null,
        notes: newCustPayment.notes || null,
        account_id: newCustPayment.account_id || null,
        // Multi-currency support - store original and converted values
        currency_code: paymentCurrency,
        exchange_rate: exchangeRate,
        exchange_rate_used: exchangeRate,
        exchange_rate_id: exchangeRateId || null, // Reference to exchange_rates table
        rate_source: rateSource, // 'api', 'manual', 'database'
        base_currency_amount: paymentCurrency !== baseCurrency ? newCustPayment.amount * exchangeRate : newCustPayment.amount,
        // Store original values (never modified)
        original_amount: newCustPayment.amount,
        original_currency: paymentCurrency,
      }
      let insertErr: any = null
      {
        const { error } = await supabase.from("payments").insert(basePayload)
        insertErr = error || null
      }
      if (insertErr) {
        const msg = String(insertErr?.message || insertErr || "")
        const mentionsAccountId = msg.toLowerCase().includes("account_id")
        const looksMissingColumn = mentionsAccountId && (
          msg.toLowerCase().includes("does not exist") ||
          msg.toLowerCase().includes("not found") ||
          msg.toLowerCase().includes("schema cache") ||
          msg.toLowerCase().includes("column")
        )
        if (looksMissingColumn || mentionsAccountId) {
          console.warn("payments.insert fallback: removing account_id due to schema mismatch:", msg)
          const fallbackPayload = { ...basePayload }
          delete fallbackPayload.account_id
          const { error: retryError } = await supabase.from("payments").insert(fallbackPayload)
          if (retryError) throw retryError
        } else {
          throw insertErr
        }
      }

      // Journal: treat as customer advance if not linked to invoice yet
      const mapping = await findAccountIds()
      if (mapping) {
        const cashAccountId = newCustPayment.account_id || mapping.cash || mapping.bank
        const advanceId = mapping.customerAdvance
        // ✅ ERP-Grade: Period Lock Check
        try {
          const { assertPeriodNotLocked } = await import("@/lib/accounting-period-lock")
          const { createClient } = await import("@supabase/supabase-js")
          const serviceSupabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
          )
          await assertPeriodNotLocked(serviceSupabase, {
            companyId: mapping.companyId,
            date: newCustPayment.date,
          })
        } catch (lockError: any) {
          toast({
            title: "❌ الفترة المحاسبية مقفلة",
            description: lockError.message || "لا يمكن تسجيل دفعة في فترة محاسبية مغلقة",
            variant: "destructive",
          })
          return
        }

        if (cashAccountId && advanceId) {
          const { data: entry } = await supabase
            .from("journal_entries").insert({
              company_id: mapping.companyId,
              reference_type: "customer_payment",
              reference_id: null,
              entry_date: newCustPayment.date,
              description: `سداد عميل كسلفة(${newCustPayment.method})`,
              branch_id: mapping.branchId!,
              cost_center_id: mapping.costCenterId || null,
            }).select().single()
          if (entry?.id) {
            await supabase.from("journal_entry_lines").insert([
              { journal_entry_id: entry.id, account_id: cashAccountId, debit_amount: newCustPayment.amount, credit_amount: 0, description: "نقد/بنك", original_debit: newCustPayment.amount, original_credit: 0, original_currency: paymentCurrency, exchange_rate_used: exchangeRate },
              { journal_entry_id: entry.id, account_id: advanceId, debit_amount: 0, credit_amount: newCustPayment.amount, description: "سلف من العملاء", original_debit: 0, original_credit: newCustPayment.amount, original_currency: paymentCurrency, exchange_rate_used: exchangeRate },
            ])
          }
        }
      }
      const savedCustomerId = newCustPayment.customer_id
      const savedAmount = newCustPayment.amount
      setNewCustPayment({ customer_id: "", amount: 0, date: newCustPayment.date, method: "cash", ref: "", notes: "", account_id: "" })
      toastActionSuccess(toast, "الإنشاء", "الدفعة")
      // 🔐 إعادة تحميل المدفوعات مع تطبيق الفلترة الصحيحة
      await reloadPaymentsWithFilters()
      // إذا اختار المستخدم فاتورة من الجدول في النموذج: اربط أحدث دفعة عميل بهذه الفاتورة مباشرة
      if (selectedFormInvoiceId && customerPayments && customerPayments.length > 0) {
        const latest = customerPayments.find((p: any) => p.customer_id === savedCustomerId && !p.invoice_id) || customerPayments[0]
        try {
          await applyPaymentToInvoiceWithOverrides(latest as any, selectedFormInvoiceId, Number(latest?.amount || savedAmount || 0))
        } catch (linkErr) {
          console.error("Error auto-linking payment to invoice:", linkErr)
        }
      }
    } catch (err: any) {
      console.error("Error creating customer payment:", { message: err?.message, details: err })
      toastActionError(toast, "الإنشاء", "الدفعة", "فشل إنشاء الدفعة")
    } finally {
      setSaving(false)
    }
  }

  const createSupplierPayment = async () => {
    try {
      setSaving(true)

      // 🚫 منع المبالغ السالبة - المرتجعات يجب أن تكون في purchase_returns
      if (newSuppPayment.amount < 0) {
        toast({
          title: appLang === 'en' ? 'Invalid Amount' : 'مبلغ غير صحيح',
          description: appLang === 'en'
            ? 'Payment amount cannot be negative. For returns, use the Returns feature in the bill page.'
            : 'لا يمكن أن يكون مبلغ الدفعة سالباً. للمرتجعات، استخدم ميزة المرتجعات في صفحة الفاتورة.',
          variant: 'destructive'
        })
        setSaving(false)
        return
      }

      // ❗ Guard: reset saving if supplier/amount/company missing
      if (!newSuppPayment.supplier_id || newSuppPayment.amount <= 0 || !companyId) {
        toast({
          title: appLang === 'en' ? 'Missing Fields' : 'حقول مفقودة',
          description: appLang === 'en'
            ? 'Please select a supplier, enter an amount greater than 0, and ensure you are connected.'
            : 'يرجى اختيار مورد، وإدخال مبلغ أكبر من صفر.',
          variant: 'destructive'
        })
        setSaving(false)
        return
      }

      // 🔍 التحقق من كفاية الرصيد قبل إنشاء الدفعة
      const balanceCheck = await checkAccountBalance(
        newSuppPayment.account_id || null,
        newSuppPayment.amount,
        newSuppPayment.date
      )

      if (!balanceCheck.sufficient) {
        toast({
          title: appLang === 'en' ? 'Insufficient Balance' : 'رصيد غير كافٍ',
          description: appLang === 'en'
            ? `The account "${balanceCheck.accountName || 'Selected Account'}" has insufficient balance. Current balance: ${balanceCheck.currentBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}. Required: ${newSuppPayment.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}.`
            : `رصيد الحساب "${balanceCheck.accountName || 'الحساب المختار'}" غير كافٍ. الرصيد الحالي: ${balanceCheck.currentBalance.toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}. المطلوب: ${newSuppPayment.amount.toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}.`,
          variant: 'destructive'
        })
        setSaving(false)
        return
      }

      // Validate selected cash/bank account belongs to company and exists
      if (newSuppPayment.account_id) {
        const { data: acct, error: acctErr } = await supabase
          .from("chart_of_accounts")
          .select("id, company_id, branch_id, cost_center_id")
          .eq("id", newSuppPayment.account_id)
          .eq("company_id", companyId)
          .single()
        if (acctErr || !acct) {
          toastActionError(toast, "التحقق", "الحساب", "الحساب المختار غير موجود أو لا يتبع الشركة")
          return
        }

        // 🔐 ERP Access Control - التحقق من صلاحية استخدام الحساب البنكي
        if (userContext) {
          const accessResult = validateBankAccountAccess(
            userContext,
            acct.branch_id,
            acct.cost_center_id,
            appLang
          )
          if (!accessResult.isValid && accessResult.error) {
            toast({
              title: accessResult.error.title,
              description: accessResult.error.description,
              variant: "destructive"
            })
            setSaving(false)
            return
          }
        }
      }
      // Attempt insert including account_id; fallback if column not exists
      // ✅ APPROVAL WORKFLOW: determine role
      const PRIVILEGED_ROLES = ['owner', 'admin', 'general_manager']
      const isPrivilegedRole = !!(userContext?.role && PRIVILEGED_ROLES.includes(userContext.role))
      const currentUserId = (await supabase.auth.getUser()).data.user?.id || null

      // ✅ Get the bill's branch_id if a bill is selected (use it over user's branch for accuracy)
      const selectedBillData = selectedFormBillId
        ? formSupplierBills.find((b: any) => b.id === selectedFormBillId)
        : null
      const billBranchId = (selectedBillData as any)?.branch_id || null

      const basePayload: any = {
        company_id: companyId,
        supplier_id: newSuppPayment.supplier_id,
        payment_date: newSuppPayment.date,
        amount: newSuppPayment.amount,
        payment_method: newSuppPayment.method,
        reference_number: newSuppPayment.ref || null,
        notes: newSuppPayment.notes || null,
        account_id: newSuppPayment.account_id || null,
        // Multi-currency support
        currency_code: paymentCurrency,
        exchange_rate: exchangeRate,
        exchange_rate_used: exchangeRate,
        exchange_rate_id: exchangeRateId || null,
        rate_source: rateSource,
        base_currency_amount: paymentCurrency !== baseCurrency ? newSuppPayment.amount * exchangeRate : newSuppPayment.amount,
        original_amount: newSuppPayment.amount,
        original_currency: paymentCurrency,
        // ✅ Audit trail
        created_by: currentUserId,
        // ✅ Branch: bill's branch takes priority over user's branch
        branch_id: billBranchId || userContext?.branch_id || null,
        // ✅ Store bill_id even for pending (triggers only fire for status='approved')
        ...(selectedFormBillId ? { bill_id: selectedFormBillId } : {}),
        // ✅ Role-based status
        status: isPrivilegedRole ? 'approved' : 'pending_approval',
        ...(isPrivilegedRole ? { approved_by: currentUserId, approved_at: new Date().toISOString() } : {}),
      }
      let insertErr: any = null
      let insertedPayment: any = null
      {
        const { data, error } = await supabase
          .from("payments")
          .insert(basePayload)
          .select()
          .single()
        insertErr = error || null
        insertedPayment = data || null

      }
      if (insertErr) {
        const msg = String(insertErr?.message || insertErr || "")
        if (msg.includes('column "account_id" does not exist') || msg.toLowerCase().includes("account_id") && msg.toLowerCase().includes("does not exist")) {
          const fallbackPayload = { ...basePayload }
          delete fallbackPayload.account_id
          const { error: retryError } = await supabase
            .from("payments")
            .insert(fallbackPayload)
            .select()
            .single()
          if (retryError) throw retryError
        } else {
          throw insertErr
        }
      }

      // === منطق القيود المحاسبية ===
      // ✅ APPROVAL WORKFLOW: skip journal entries and bill linking for pending payments
      if (!isPrivilegedRole) {
        // 🔔 Non-privileged: notify managers for approval via SECURITY DEFINER RPC
        // ✅ استخدام notifyPaymentApprovalRequest بدلاً من الاستعلام المباشر عن company_members
        // لأن RLS تمنع المستخدمين العاديين من رؤية بيانات الأدوار الإدارية
        try {
          const supplierName = suppliers.find(s => s.id === newSuppPayment.supplier_id)?.name || 'مورد'
          await notifyPaymentApprovalRequest({
            companyId,
            paymentId: insertedPayment?.id || '',
            partyName: supplierName,
            amount: newSuppPayment.amount,
            currency: paymentCurrency,
            branchId: userContext?.branch_id || undefined,
            createdBy: currentUserId || '',
            paymentType: 'supplier',
            appLang
          })
        } catch (notifErr) {
          console.warn('⚠️ Failed to send payment approval notification:', notifErr)
          // لا نوقف العملية بسبب فشل الإشعار
        }
        // Reset form and refresh list
        setNewSuppPayment({ supplier_id: "", amount: 0, date: newSuppPayment.date, method: "cash", ref: "", notes: "", account_id: "" })
        setSelectedFormBillId("")
        // 🔐 إعادة تحميل المدفوعات مع تطبيق الفلترة الصحيحة لجلب Joins
        await reloadPaymentsWithFilters()
        toast({
          title: appLang === 'en' ? '⏳ Pending Approval' : '⏳ في انتظار الاعتماد',
          description: appLang === 'en'
            ? 'Your payment request has been submitted and is awaiting approval from a manager.'
            : 'تم تقديم طلب الدفع وهو في انتظار اعتماد المدير. لن تتأثر الفاتورة حتى يتم الاعتماد.',
        })
        setSaving(false)
        return
      }

      // === Privileged role: execute journal entries immediately ===
      const mapping = await findAccountIds()
      const willLinkToBill = !!selectedFormBillId

      if (mapping && !willLinkToBill) {
        // لا توجد فاتورة محددة - إنشاء قيد سلفة فقط
        const cashAccountId = newSuppPayment.account_id || mapping.cash || mapping.bank
        const advanceId = mapping.supplierAdvance
        if (cashAccountId && advanceId) {
          const { data: entry } = await supabase
            .from("journal_entries").insert({
              company_id: mapping.companyId,
              reference_type: "supplier_payment",
              reference_id: insertedPayment?.id || null,
              entry_date: newSuppPayment.date,
              description: `سداد مورّد كسلفة (${newSuppPayment.method})`,
              branch_id: mapping.branchId!,
              cost_center_id: mapping.costCenterId || null,
            }).select().single()
          if (entry?.id) {
            const { error: linesErr } = await supabase.from("journal_entry_lines").insert([
              { journal_entry_id: entry.id, account_id: advanceId, debit_amount: newSuppPayment.amount, credit_amount: 0, description: "سلف للموردين", original_debit: newSuppPayment.amount, original_credit: 0, original_currency: paymentCurrency, exchange_rate_used: exchangeRate },
              { journal_entry_id: entry.id, account_id: cashAccountId, debit_amount: 0, credit_amount: newSuppPayment.amount, description: "نقد/بنك", original_debit: 0, original_credit: newSuppPayment.amount, original_currency: paymentCurrency, exchange_rate_used: exchangeRate },
            ])
            if (linesErr) throw linesErr
          }
        }
      }
      // ملاحظة: إذا willLinkToBill = true، سيتم إنشاء قيد bill_payment فقط في applyPaymentToBillWithOverrides

      setNewSuppPayment({ supplier_id: "", amount: 0, date: newSuppPayment.date, method: "cash", ref: "", notes: "", account_id: "" })
      const { data: suppPays } = await supabase
        .from("payments").select("*")
        .eq("company_id", companyId)
        .not("supplier_id", "is", null)
        .order("payment_date", { ascending: false })
      setSupplierPayments(suppPays || [])

      // إذا تم اختيار فاتورة، نربط الدفعة بها (وينشأ قيد bill_payment فقط)
      if (selectedFormBillId && insertedPayment) {
        try {
          await applyPaymentToBillWithOverrides(insertedPayment as any, selectedFormBillId, Number(insertedPayment?.amount || newSuppPayment.amount || 0), newSuppAccountType)
        } catch (linkErr) {
          console.error("Error auto-linking payment to bill:", linkErr)
        }
      } else if (selectedFormBillId && suppPays && suppPays.length > 0) {
        // fallback: البحث عن الدفعة الأخيرة إذا لم نحصل على insertedPayment
        const latest = suppPays.find((p: any) => p.supplier_id === newSuppPayment.supplier_id && !p.bill_id) || suppPays[0]
        try {
          await applyPaymentToBillWithOverrides(latest as any, selectedFormBillId, Number(latest?.amount || newSuppPayment.amount || 0), newSuppAccountType)
        } catch (linkErr) {
          console.error("Error auto-linking payment to bill:", linkErr)
        }
      }
    } catch (err: any) {
      // اطبع الكائن الأصلي للخطأ لتسهيل التشخيص
      console.error("Error creating supplier payment:", err)
      const msg = typeof err === "string"
        ? err
        : (err?.message || err?.hint || err?.details || err?.error || "فشل إنشاء الدفعة")
      toastActionError(toast, "الإنشاء", "دفعة المورد", String(msg))
    } finally {
      setSaving(false)
    }
  }

  // ✅ APPROVAL WORKFLOW: Approve a pending payment (Multi-Level)
  const approvePayment = async (payment: Payment) => {
    if (!companyId) return
    try {
      setSaving(true)
      const currentUserId = (await supabase.auth.getUser()).data.user?.id || null

      // 1. Process stage securely via DB RPC
      const { error: rpcErr } = await supabase.rpc('process_payment_approval_stage', {
        p_payment_id: payment.id,
        p_action: 'APPROVE',
        p_rejection_reason: null
      })
      if (rpcErr) throw rpcErr

      // 2. Fetch updated payment status to see if it reached final approval
      const { data: updatedPayment, error: fetchErr } = await supabase
        .from('payments')
        .select('status, approved_by')
        .eq('id', payment.id)
        .single()
      if (fetchErr) throw fetchErr

      // 3. Only if FULLY approved do we generate journal entries and link bills
      if (updatedPayment.status === 'approved') {
        const mapping = await findAccountIds()
        if (mapping) {
          const paymentCurr = payment.original_currency || payment.currency_code || baseCurrency
          const exRate = payment.exchange_rate_used || payment.exchange_rate || 1

          if (payment.bill_id) {
            // Apply payment to bill directly
            await applyPaymentToBillWithOverrides(payment, payment.bill_id, Number(payment.amount || 0), "")
          } else {
            // Check if there are allocations, if so we don't need a single standalone advance entry
            const { data: allocations } = await supabase.from('payment_allocations').select('*').eq('payment_id', payment.id)
            if (!allocations || allocations.length === 0) {
              // Standalone advance payment (legacy)
              const cashAccountId = payment.account_id || mapping.cash || mapping.bank
              const advanceId = mapping.supplierAdvance
              if (cashAccountId && advanceId) {
                const { data: entry } = await supabase.from("journal_entries").insert({
                  company_id: mapping.companyId,
                  reference_type: "supplier_payment",
                  reference_id: payment.id,
                  entry_date: payment.payment_date,
                  description: `سداد مورّد كسلفة (${payment.payment_method || 'نقد'})`,
                  branch_id: mapping.branchId!,
                  cost_center_id: mapping.costCenterId || null,
                }).select().single()
                if (entry?.id) {
                  await supabase.from("journal_entry_lines").insert([
                    { journal_entry_id: entry.id, account_id: advanceId, debit_amount: payment.amount, credit_amount: 0, description: "سلف للموردين", original_debit: payment.amount, original_credit: 0, original_currency: paymentCurr, exchange_rate_used: exRate },
                    { journal_entry_id: entry.id, account_id: cashAccountId, debit_amount: 0, credit_amount: payment.amount, description: "نقد/بنك", original_debit: 0, original_credit: payment.amount, original_currency: paymentCurr, exchange_rate_used: exRate },
                  ])
                }
              }
            }
          }
        }
        
        // Notify creator of final approval
        if (payment.created_by) {
          const supplierName = suppliers.find(s => s.id === payment.supplier_id)?.name || 'مورد'
          await supabase.from("notifications").insert({
            company_id: companyId,
            reference_type: "payment_approval",
            reference_id: payment.id,
            created_by: currentUserId,
            assigned_to_user: payment.created_by,
            title: appLang === 'en' ? '✅ Payment Approved' : '✅ تمت الموافقة النهائية على الدفعة',
            message: appLang === 'en'
              ? `Your payment of ${Number(payment.amount).toFixed(2)} for "${supplierName}" has been finally approved and posted.`
              : `تمت الموافقة النهائية على دفعتك بمبلغ ${Number(payment.amount).toFixed(2)} للمورد "${supplierName}" وتم قيدها دفترياً.`,
            priority: "normal",
            event_key: "payment_approved",
            status: "unread"
          })
        }
      }

      // 4. Refresh list
      await reloadPaymentsWithFilters()
      setApprovingPaymentId(null)
      toast({
        title: appLang === 'en' ? '✅ Stage Approved' : '✅ تمت الموافقة',
        description: updatedPayment.status === 'approved' ? (appLang === 'en' ? 'Payment posted to accounts.' : 'تم تسجيل القيود المحاسبية.') : (appLang === 'en' ? 'Stage approved successfully.' : 'تم إتمام مرحلة الاعتماد بنجاح.'),
      })
    } catch (err: any) {
      toastActionError(toast, "الاعتماد", "الدفعة", String(err?.message || err))
    } finally {
      setSaving(false)
    }
  }

  // ✅ APPROVAL WORKFLOW: Reject a pending payment (privileged roles only)
  const rejectPayment = async () => {
    if (!rejectingPayment || !companyId || !rejectionReason.trim()) return
    try {
      setSaving(true)
      const currentUserId = (await supabase.auth.getUser()).data.user?.id || null
      const { error: updateErr } = await supabase.from("payments").update({
        status: 'rejected',
        rejected_by: currentUserId,
        rejected_at: new Date().toISOString(),
        rejection_reason: rejectionReason.trim(),
      }).eq("id", rejectingPayment.id)
      if (updateErr) throw updateErr

      // Notify the payment creator
      if (rejectingPayment.created_by) {
        const supplierName = suppliers.find(s => s.id === rejectingPayment.supplier_id)?.name || 'مورد'
        await supabase.from("notifications").insert({
          company_id: companyId,
          reference_type: "payment_approval",
          reference_id: rejectingPayment.id,
          created_by: currentUserId,
          assigned_to_user: rejectingPayment.created_by,
          title: appLang === 'en' ? '❌ Payment Rejected' : '❌ تم رفض الدفعة',
          message: appLang === 'en'
            ? `Your payment of ${Number(rejectingPayment.amount).toFixed(2)} for "${supplierName}" was rejected. Reason: ${rejectionReason.trim()}`
            : `تم رفض دفعتك بمبلغ ${Number(rejectingPayment.amount).toFixed(2)} للمورد "${supplierName}". السبب: ${rejectionReason.trim()}`,
          priority: "high",
          event_key: "payment_rejected",
          status: "unread",
        })
      }

      const { data: suppPays } = await supabase.from("payments").select("*")
        .eq("company_id", companyId).not("supplier_id", "is", null)
        .order("payment_date", { ascending: false })
      setSupplierPayments(suppPays || [])
      setRejectOpen(false)
      setRejectingPayment(null)
      setRejectionReason("")
      toast({
        title: appLang === 'en' ? '❌ Payment Rejected' : '❌ تم رفض الدفعة',
        description: appLang === 'en' ? 'The payment has been rejected.' : 'تم رفض الدفعة وإشعار المنشئ.',
      })
    } catch (err: any) {
      toastActionError(toast, "الرفض", "الدفعة", String(err?.message || err))
    } finally {
      setSaving(false)
    }
  }

  const findAccountIds = async (): Promise<AccountMapping | null> => {
    if (!companyId) return null
    const { data: accounts } = await supabase
      .from("chart_of_accounts")
      .select("id, account_code, account_type, account_name, sub_type, parent_id")
      .eq("company_id", companyId)
    if (!accounts) return null

    // اعمل على الحسابات الورقية فقط (ليست آباء لغيرها)
    const parentIds = new Set((accounts || []).map((a: any) => a.parent_id).filter(Boolean))
    const leafAccounts = (accounts || []).filter((a: any) => !parentIds.has(a.id))

    const byCode = (code: string) => leafAccounts.find((a: any) => String(a.account_code || "").toUpperCase() === code)?.id
    const byType = (type: string) => leafAccounts.find((a: any) => a.account_type === type)?.id
    const byNameIncludes = (name: string) => leafAccounts.find((a: any) => (a.account_name || "").toLowerCase().includes(name.toLowerCase()))?.id
    const bySubType = (st: string) => leafAccounts.find((a: any) => String(a.sub_type || "").toLowerCase() === st.toLowerCase())?.id

    const ar = bySubType("accounts_receivable") || byCode("AR") || byNameIncludes("receivable") || byNameIncludes("الحسابات المدينة") || byType("asset")
    const ap = bySubType("accounts_payable") || byCode("AP") || byNameIncludes("payable") || byNameIncludes("الموردين") || byType("liability")
    const cash = bySubType("cash") || byCode("CASH") || byNameIncludes("cash") || byNameIncludes("الصندوق") || byType("asset")
    const bank = bySubType("bank") || byNameIncludes("bank") || byNameIncludes("البنك") || byType("asset")

    // حساب الإيرادات
    const revenue = byCode("4100") || byNameIncludes("إيرادات المبيعات") || byNameIncludes("sales") || byNameIncludes("revenue") || byType("income")

    // حساب المخزون وتكلفة البضاعة المباعة
    const inventory = bySubType("inventory") || byCode("1300") || byNameIncludes("inventory") || byNameIncludes("المخزون") || byNameIncludes("مخزون") || byType("asset")
    const cogs = bySubType("cogs") || byCode("5100") || byNameIncludes("cost of goods") || byNameIncludes("cogs") || byNameIncludes("تكلفة المبيعات") || byNameIncludes("تكلفة البضاعة") || byType("expense")

    // حساب الضريبة
    const vatPayable = byNameIncludes("VAT") || byNameIncludes("ضريبة القيمة المضافة") || byNameIncludes("ضريبة المبيعات") || byNameIncludes("tax payable") || byType("liability")

    // حساب الشحن
    const shippingAccount = byNameIncludes("shipping") || byNameIncludes("الشحن") || byNameIncludes("شحن") || byNameIncludes("freight")

    // حساب "سلف للموردين"
    const supplierAdvance =
      bySubType("supplier_advance") ||
      byCode("1400") ||
      byNameIncludes("supplier advance") ||
      byNameIncludes("advance to suppliers") ||
      byNameIncludes("advances") ||
      byNameIncludes("prepaid to suppliers") ||
      byNameIncludes("prepayment") ||
      byType("asset")
    // حساب "سلف من العملاء" (التزامات)
    const customerAdvance =
      bySubType("customer_advance") ||
      byCode("1500") ||
      byNameIncludes("customer advance") ||
      byNameIncludes("advance from customers") ||
      byNameIncludes("deposit") ||
      byType("liability")

    // branch_id إجباري لـ journal_entries: استخدام فرع المستخدم أو الفرع الافتراضي للشركة
    let branchId = userContext?.branch_id ?? null
    if (!branchId) {
      const { data: defBranch } = await supabase
        .from("branches")
        .select("id")
        .eq("company_id", companyId)
        .eq("is_active", true)
        .order("is_main", { ascending: false })
        .order("name")
        .limit(1)
        .maybeSingle()
      branchId = defBranch?.id ?? null
    }

    // 📌 أرباح وخسائر فروق صرف العملة
    const fxGain = byCode("4200") || byNameIncludes("أرباح فروق صرف") || byNameIncludes("fx gain") || byNameIncludes("exchange gain")
    const fxLoss = byCode("5200") || byNameIncludes("خسائر فروق صرف") || byNameIncludes("fx loss") || byNameIncludes("exchange loss")

    return { 
      companyId, 
      ar, 
      ap, 
      cash, 
      bank, 
      revenue, 
      inventory, 
      cogs, 
      vatPayable, 
      shippingAccount, 
      supplierAdvance, 
      customerAdvance,
      branchId,
      costCenterId: userContext?.cost_center_id || null,
      fxGain,
      fxLoss
    }
  }

  // === دالة تحديث حالة أمر الشراء المرتبط بالفاتورة ===
  const updateLinkedPurchaseOrderStatus = async (billId: string) => {
    try {
      // جلب الفاتورة للحصول على purchase_order_id
      const { data: billData } = await supabase
        .from("bills")
        .select("purchase_order_id")
        .eq("id", billId)
        .single()

      if (!billData?.purchase_order_id) return // لا يوجد أمر شراء مرتبط

      const poId = billData.purchase_order_id

      // جلب بنود أمر الشراء
      const { data: poItems } = await supabase
        .from("purchase_order_items")
        .select("product_id, quantity")
        .eq("purchase_order_id", poId)

      // جلب جميع الفواتير المرتبطة بأمر الشراء
      const { data: linkedBills } = await supabase
        .from("bills")
        .select("id")
        .eq("purchase_order_id", poId)

      const billIds = (linkedBills || []).map((b: { id: string }) => b.id)

      // جلب بنود كل الفواتير المرتبطة
      const { data: allBillItems } = await supabase
        .from("bill_items")
        .select("product_id, quantity")
        .in("bill_id", billIds.length > 0 ? billIds : [''])

      // حساب الكميات المفوترة لكل منتج
      const billedQtyMap: Record<string, number> = {}
      for (const item of (allBillItems || []) as any[]) {
        billedQtyMap[item.product_id] = (billedQtyMap[item.product_id] || 0) + Number(item.quantity || 0)
      }

      // تحديد الحالة الجديدة
      let newStatus = 'draft'
      if (billIds.length > 0) {
        const allFullyBilled = (poItems || []).every((item: any) => {
          const ordered = Number(item.quantity || 0)
          const billed = billedQtyMap[item.product_id] || 0
          return billed >= ordered
        })

        const anyBilled = Object.values(billedQtyMap).some(qty => qty > 0)

        if (allFullyBilled) {
          newStatus = 'billed'
        } else if (anyBilled) {
          newStatus = 'partially_billed'
        }
      }

      // تحديث حالة أمر الشراء
      await supabase
        .from("purchase_orders")
        .update({ status: newStatus })
        .eq("id", poId)

      console.log(`✅ Updated linked PO ${poId} status to: ${newStatus}`)
    } catch (err) {
      console.warn("Failed to update linked PO status:", err)
    }
  }

  const openApplyToInvoice = async (p: Payment) => {
    setSelectedPayment(p)
    setApplyAmount(p.amount)
    setApplyDocId("")
    const { data: invs } = await supabase
      .from("invoices")
      .select("id, invoice_number, total_amount, paid_amount, status")
      .eq("customer_id", p.customer_id)
      .in("status", ["sent", "partially_paid"])
      .order("invoice_date", { ascending: false })
    setCustomerInvoices(invs || [])
    setApplyInvoiceOpen(true)
  }

  const openApplyToPO = async (p: Payment) => {
    setSelectedPayment(p)
    setApplyAmount(p.amount)
    setApplyDocId("")
    const { data: pos } = await supabase
      .from("purchase_orders")
      .select("id, po_number, total_amount, received_amount, status")
      .eq("supplier_id", p.supplier_id)
      .in("status", ["received_partial", "received"])
    setSupplierPOs(pos || [])
    setApplyPoOpen(true)
  }

  const openApplyToBill = async (p: Payment) => {
    setSelectedPayment(p)
    setApplyAmount(p.amount)
    setApplyDocId("")
    const { data: bills } = await supabase
      .from("bills")
      .select("id, bill_number, total_amount, paid_amount, returned_amount, status")
      .eq("supplier_id", p.supplier_id)
      .in("status", ["sent", "received", "partially_paid"]) // قابلة للدفع - لا تشمل draft
      .order("bill_date", { ascending: false })
    setSupplierBills(bills || [])
    setApplyBillOpen(true)
  }

  // تنفيذ ربط دفع عميل بفاتورة عميل باستخدام معطيات محددة دون الاعتماد على حالة الواجهة
  const applyPaymentToInvoiceWithOverrides = async (payment: Payment, invoiceId: string, rawAmount: number) => {
    try {
      if (!payment || !invoiceId || rawAmount <= 0) return
      // ✅ منع التكرار
      if (saving) {
        console.log("جاري الحفظ بالفعل...")
        return
      }
      setSaving(true)
      const mapping = await findAccountIds()
      if (!mapping || !mapping.ar) return
      const { data: inv } = await supabase.from("invoices").select("*").eq("id", invoiceId).single()
      if (!inv) return

      // 🔐 ERP Governance: التحقق من صلاحية الدفع على هذه الفاتورة
      if (!canPayOnDocument(inv.branch_id)) {
        toast({
          title: appLang === 'en' ? 'Access Denied' : 'غير مصرح',
          description: appLang === 'en'
            ? 'You cannot make payments on invoices from other branches. Please contact your administrator.'
            : 'لا يمكنك إجراء دفعات على فواتير من فروع أخرى. يرجى التواصل مع المسؤول.',
          variant: 'destructive'
        })
        setSaving(false)
        return
      }
      const remaining = Math.max(Number(inv.total_amount || 0) - Number(inv.paid_amount || 0), 0)
      const amount = Math.min(rawAmount, remaining)

      // ===== التحقق: هل هذه أول دفعة على فاتورة مرسلة؟ =====
      const isFirstPaymentOnSentInvoice = inv.status === "sent"

      // تحديث الفاتورة مع حفظ القيمة الأصلية
      const newPaid = Number(inv.paid_amount || 0) + amount
      const newStatus = newPaid >= Number(inv.total_amount || 0) ? "paid" : "partially_paid"
      const { data: currentInv } = await supabase.from("invoices").select("original_paid").eq("id", inv.id).single()
      const currentOriginalPaid = currentInv?.original_paid ?? inv.paid_amount ?? 0
      const newOriginalPaid = Number(currentOriginalPaid) + amount
      const { error: invErr } = await supabase.from("invoices").update({ paid_amount: newPaid, original_paid: newOriginalPaid, status: newStatus }).eq("id", inv.id)
      if (invErr) throw invErr

      // ربط الدفعة
      const { error: payErr } = await supabase.from("payments").update({ invoice_id: inv.id }).eq("id", payment.id)
      if (payErr) throw payErr

      // ===== إنشاء القيود المحاسبية =====
      // استخدام حساب النقد/البنك المحدد في الدفعة
      const paymentCashAccountId = payment.account_id || mapping.cash || mapping.bank

      // التحقق من وجود قيد دفع سابق لهذه الفاتورة
      const { data: existingPaymentJournal } = await supabase
        .from("journal_entries")
        .select("id")
        .eq("company_id", mapping.companyId)
        .eq("reference_type", "invoice_payment")
        .eq("reference_id", inv.id)
        .limit(1)

      // ===== 📌 النمط المحاسبي الصارم (MANDATORY) =====
      // 📌 المرجع: docs/ACCOUNTING_PATTERN.md
      // عند الدفع الأول على فاتورة Sent: قيد الفاتورة (AR/Revenue) + قيد السداد (Cash/AR)
      // عند الدفعات اللاحقة: قيد السداد فقط (Cash/AR)
      if (isFirstPaymentOnSentInvoice) {
        // 1️⃣ إنشاء قيد الفاتورة (AR/Revenue) - لأنه لم يُنشأ عند Sent
        await postInvoiceJournalOnFirstPayment(inv, mapping)
      }
      // 2️⃣ إنشاء قيد السداد (Cash/AR)
      await postPaymentJournalOnly(inv, amount, payment.payment_date, mapping, paymentCashAccountId)

      await supabase.from("advance_applications").insert({
        company_id: mapping.companyId,
        customer_id: payment.customer_id || null,
        supplier_id: null,
        payment_id: payment.id,
        invoice_id: inv.id,
        bill_id: null,
        amount_applied: amount,
        applied_date: payment.payment_date,
        notes: "تطبيق سلفة عميل على فاتورة",
      })

      // 🔐 إعادة تحميل المدفوعات مع تطبيق الفلترة الصحيحة
      await reloadPaymentsWithFilters()
    } catch (err) {
      console.error("Error applying payment to invoice (overrides):", err)
    } finally {
      setSaving(false)
    }
  }

  // ===== 📌 النمط المحاسبي الصارم: قيد الفاتورة عند الدفع الأول =====
  // 📌 المرجع: docs/ACCOUNTING_PATTERN.md
  // عند الدفع الأول على فاتورة Sent: إنشاء قيد الفاتورة (AR/Revenue)
  const postInvoiceJournalOnFirstPayment = async (inv: any, mapping: any) => {
    try {
      if (!inv || !mapping) return
      if (!mapping.ar || !mapping.revenue) {
        console.warn("Missing AR or Revenue account for invoice journal")
        return
      }

      // التحقق من عدم وجود قيد فاتورة سابق
      const { data: existingInvoiceJournal } = await supabase
        .from("journal_entries")
        .select("id")
        .eq("company_id", mapping.companyId)
        .eq("reference_type", "invoice")
        .eq("reference_id", inv.id)
        .limit(1)

      if (existingInvoiceJournal && existingInvoiceJournal.length > 0) {
        console.log(`⚠️ قيد الفاتورة موجود مسبقاً للفاتورة ${inv.invoice_number}`)
        return
      }

      // جلب معلومات الفرع ومركز التكلفة من الفاتورة
      const { data: invoiceData } = await supabase
        .from("invoices")
        .select("branch_id, cost_center_id")
        .eq("id", inv.id)
        .single()

      // إنشاء قيد الفاتورة: Debit AR / Credit Revenue
      const { data: invEntry, error: invError } = await supabase
        .from("journal_entries")
        .insert({
          company_id: mapping.companyId,
          reference_type: "invoice",
          reference_id: inv.id,
          entry_date: inv.invoice_date || new Date().toISOString().slice(0, 10),
          description: `فاتورة مبيعات ${inv.invoice_number}`,
          branch_id: invoiceData?.branch_id || mapping.branchId!,
          cost_center_id: invoiceData?.cost_center_id || null,
        })
        .select()
        .single()

      if (!invError && invEntry) {
        await supabase.from("journal_entry_lines").insert([
          { journal_entry_id: invEntry.id, account_id: mapping.ar, debit_amount: Number(inv.total_amount || 0), credit_amount: 0, description: "الذمم المدينة", branch_id: invoiceData?.branch_id || mapping.branchId!, cost_center_id: invoiceData?.cost_center_id || null },
          { journal_entry_id: invEntry.id, account_id: mapping.revenue, debit_amount: 0, credit_amount: Number(inv.total_amount || 0), description: "إيرادات المبيعات", branch_id: invoiceData?.branch_id || mapping.branchId!, cost_center_id: invoiceData?.cost_center_id || null },
        ])
        console.log(`✅ تم إنشاء قيد الفاتورة ${inv.invoice_number} عند الدفع الأول - مبلغ: ${inv.total_amount}`)
      }
    } catch (err) {
      console.error("Error posting invoice journal on first payment:", err)
    }
  }

  // ===== 📌 Cash Basis: قيد فاتورة الشراء عند الدفع الأول =====
  // 📌 المرجع: docs/ACCOUNTING_PATTERN.md
  // عند الدفع الأول على فاتورة Sent/Received: إنشاء قيد الفاتورة (Inventory/AP)
  const postBillJournalOnFirstPayment = async (bill: any, mapping: any, billCurrency: string, billExRate: number) => {
    try {
      if (!bill || !mapping) return
      if (!mapping.ap) {
        console.warn("Missing AP account for bill journal")
        return
      }

      // التحقق من عدم وجود قيد فاتورة سابق
      const { data: existingBillJournal } = await supabase
        .from("journal_entries")
        .select("id")
        .eq("company_id", mapping.companyId)
        .eq("reference_type", "bill")
        .eq("reference_id", bill.id)
        .limit(1)

      if (existingBillJournal && existingBillJournal.length > 0) {
        console.log(`⚠️ قيد الفاتورة موجود مسبقاً للفاتورة ${bill.bill_number}`)
        return
      }

      // إنشاء قيد الفاتورة
      const { data: billEntry, error: billEntryErr } = await supabase
        .from("journal_entries").insert({
          company_id: mapping.companyId,
          reference_type: "bill",
          reference_id: bill.id,
          entry_date: bill.bill_date,
          description: `فاتورة شراء ${bill.bill_number}`,
          branch_id: bill.branch_id || mapping.branchId!,
          cost_center_id: bill.cost_center_id || null,
        }).select().single()

      if (billEntryErr) {
        console.error("Error creating bill journal entry:", billEntryErr)
        return
      }

      const invOrExp = mapping.inventory || mapping.cogs
      const billLines: any[] = []

      // ✅ حساب المبالغ بناءً على total_amount الحالي (بعد المرتجعات)
      // حساب الإجمالي الأصلي (قبل المرتجعات)
      const originalTotal = Number(bill.total_amount || 0) + Number(bill.returned_amount || 0)
      const currentTotal = Number(bill.total_amount || 0)
      
      // حساب نسبة المرتجع لتطبيقها على subtotal و tax_amount
      const returnRatio = originalTotal > 0 ? currentTotal / originalTotal : 1
      
      // حساب subtotal و tax_amount الحاليين بناءً على النسبة
      const currentSubtotal = Number(bill.subtotal || 0) * returnRatio
      const currentTaxAmount = Number(bill.tax_amount || 0) * returnRatio
      const currentShipping = Number(bill.shipping_charge || 0) * returnRatio

      // Debit: المخزون أو المصروفات (المجموع الفرعي الحالي)
      if (invOrExp && currentSubtotal > 0) {
        billLines.push({
          journal_entry_id: billEntry.id,
          account_id: invOrExp,
          debit_amount: currentSubtotal,
          credit_amount: 0,
          description: mapping.inventory ? "المخزون" : "تكلفة البضاعة المباعة",
          original_debit: currentSubtotal,
          original_credit: 0,
          original_currency: billCurrency,
          exchange_rate_used: billExRate
        })
      }

      // Debit: الضريبة (إن وجدت) - المبلغ الحالي بعد المرتجع
      if (currentTaxAmount > 0) {
        const vatInputAccount = accounts.find(a =>
          a.account_type === 'asset' && (
            (a as any).sub_type === 'vat_input' ||
            a.account_code?.toLowerCase().includes('vatin') ||
            a.account_name?.toLowerCase().includes('vat') ||
            a.account_name?.includes('ضريبة')
          )
        )
        if (vatInputAccount) {
          billLines.push({
            journal_entry_id: billEntry.id,
            account_id: vatInputAccount.id,
            debit_amount: currentTaxAmount,
            credit_amount: 0,
            description: "ضريبة المدخلات",
            original_debit: currentTaxAmount,
            original_credit: 0,
            original_currency: billCurrency,
            exchange_rate_used: billExRate
          })
        }
      }

      // Debit: الشحن (إن وجد) - المبلغ الحالي بعد المرتجع
      if (currentShipping > 0 && mapping.shippingAccount) {
        billLines.push({
          journal_entry_id: billEntry.id,
          account_id: mapping.shippingAccount,
          debit_amount: currentShipping,
          credit_amount: 0,
          description: "مصاريف الشحن",
          original_debit: currentShipping,
          original_credit: 0,
          original_currency: billCurrency,
          exchange_rate_used: billExRate
        })
      }

      // Credit: الحسابات الدائنة (الإجمالي الحالي بعد المرتجع)
      billLines.push({
        journal_entry_id: billEntry.id,
        account_id: mapping.ap,
        debit_amount: 0,
        credit_amount: currentTotal,
        description: "حسابات دائنة",
        original_debit: 0,
        original_credit: currentTotal,
        original_currency: billCurrency,
        exchange_rate_used: billExRate
      })

      if (billLines.length > 0) {
        const { error: billLinesErr } = await supabase.from("journal_entry_lines").insert(billLines)
        if (billLinesErr) {
          console.error("Error creating bill journal lines:", billLinesErr)
          return
        }
      }
      console.log(`✅ تم إنشاء قيد فاتورة الشراء ${bill.bill_number} عند الدفع الأول - مبلغ: ${bill.total_amount}`)
    } catch (err) {
      console.error("Error posting bill journal on first payment:", err)
    }
  }

  // ===== 📌 النمط المحاسبي الصارم: قيد السداد =====
  // 📌 المرجع: docs/ACCOUNTING_PATTERN.md
  // قيد السداد: Debit Cash / Credit AR
  const postPaymentJournalOnly = async (inv: any, paymentAmount: number, paymentDate: string, mapping: any, paymentAccountId?: string | null) => {
    try {
      if (!inv || !mapping) return

      // استخدام حساب النقد/البنك المحدد في الدفعة أولاً، ثم الحساب الافتراضي
      const cashAccountId = paymentAccountId || mapping.cash || mapping.bank

      if (!cashAccountId || !mapping.ar) {
        console.warn("Missing cash or AR account for payment journal")
        return
      }

      // جلب معلومات الفرع ومركز التكلفة من الفاتورة
      const { data: invoiceData } = await supabase
        .from("invoices")
        .select("branch_id, cost_center_id")
        .eq("id", inv.id)
        .single()

      const { data: payEntry, error: payError } = await supabase
        .from("journal_entries")
        .insert({
          company_id: mapping.companyId,
          reference_type: "invoice_payment",
          reference_id: inv.id,
          entry_date: paymentDate,
          description: `دفعة على فاتورة ${inv.invoice_number}`,
          branch_id: invoiceData?.branch_id || mapping.branchId!,
          cost_center_id: invoiceData?.cost_center_id || null,
        })
        .select()
        .single()

      if (!payError && payEntry) {
        // قيد السداد: Debit Cash / Credit AR
        await supabase.from("journal_entry_lines").insert([
          { journal_entry_id: payEntry.id, account_id: cashAccountId, debit_amount: paymentAmount, credit_amount: 0, description: "نقد/بنك", branch_id: invoiceData?.branch_id || mapping.branchId!, cost_center_id: invoiceData?.cost_center_id || null },
          { journal_entry_id: payEntry.id, account_id: mapping.ar, debit_amount: 0, credit_amount: paymentAmount, description: "الذمم المدينة", branch_id: invoiceData?.branch_id || mapping.branchId!, cost_center_id: invoiceData?.cost_center_id || null },
        ])
        console.log(`✅ تم إنشاء قيد السداد للفاتورة ${inv.invoice_number} - مبلغ: ${paymentAmount}`)
      }
    } catch (err) {
      console.error("Error posting payment journal:", err)
    }
  }

  const applyPaymentToInvoice = async () => {
    if (!selectedPayment || !applyDocId || applyAmount <= 0) return

    // ✅ منع التكرار
    if (saving) {
      console.log("جاري الحفظ بالفعل...")
      return
    }

    // ⚡ INP Fix: إظهار loading state فوراً قبل أي await
    setSaving(true)

    // ⚡ INP Fix: تأجيل العمليات الثقيلة باستخدام setTimeout
    setTimeout(async () => {
      try {
        const mapping = await findAccountIds()
        if (!mapping || !mapping.ar) {
          startTransition(() => {
            setSaving(false)
          })
          return
        }
        // Load invoice to compute remaining
        const { data: inv } = await supabase.from("invoices").select("*").eq("id", applyDocId).single()
        if (!inv) return

        // 🔐 ERP Governance: التحقق من صلاحية الدفع على هذه الفاتورة
        if (!canPayOnDocument(inv.branch_id)) {
          toast({
            title: appLang === 'en' ? 'Access Denied' : 'غير مصرح',
            description: appLang === 'en'
              ? 'You cannot make payments on invoices from other branches. Please contact your administrator.'
              : 'لا يمكنك إجراء دفعات على فواتير من فروع أخرى. يرجى التواصل مع المسؤول.',
            variant: 'destructive'
          })
          startTransition(() => {
            setSaving(false)
          })
          return
        }
        const remaining = Math.max(Number(inv.total_amount || 0) - Number(inv.paid_amount || 0), 0)
        const amount = Math.min(applyAmount, remaining)

        // ✅ تطبيق دفعة على فاتورة بيع = مقبوضات (مدخلات) - لا نحتاج للتحقق من الرصيد
        // المال يدخل للحساب من العميل

        // Update invoice with original_paid
        const newPaid = Number(inv.paid_amount || 0) + amount
        const newStatus = newPaid >= Number(inv.total_amount || 0) ? "paid" : "partially_paid"
        const { data: currentInv } = await supabase.from("invoices").select("original_paid").eq("id", inv.id).single()
        const currentOriginalPaid = currentInv?.original_paid ?? inv.paid_amount ?? 0
        const newOriginalPaid = Number(currentOriginalPaid) + amount
        const { error: invErr } = await supabase.from("invoices").update({ paid_amount: newPaid, original_paid: newOriginalPaid, status: newStatus }).eq("id", inv.id)
        if (invErr) throw invErr

        // Update payment to link invoice
        const { error: payErr } = await supabase.from("payments").update({ invoice_id: inv.id }).eq("id", selectedPayment.id)
        if (payErr) throw payErr

        // ===== 📌 نظام النقدية (Cash Basis): قيد الدفع فقط =====
        // 📌 المرجع: docs/ACCOUNTING_PATTERN.md
        // عند الدفع: إنشاء قيد AR/Revenue (إذا لم يكن موجوداً) + قيد السداد
        // قيد الفاتورة: Dr. AR / Cr. Revenue (عند أول دفعة)
        // قيد السداد: Dr. Cash / Cr. AR (مع كل دفعة)

        // ⚠️ حماية: التأكد من وجود قيد الفاتورة قبل إنشاء قيد الدفعة
        const { data: existingInvoiceEntry } = await supabase
          .from("journal_entries")
          .select("id")
          .eq("company_id", mapping.companyId)
          .eq("reference_type", "invoice")
          .eq("reference_id", inv.id)
          .limit(1)

        const hasInvoiceEntry = existingInvoiceEntry && existingInvoiceEntry.length > 0

        if (!hasInvoiceEntry) {
          console.warn("⚠️ لا يوجد قيد فاتورة - سيتم إنشاء قيد AR/Revenue أولاً")
          await postInvoiceJournalOnFirstPayment(inv, mapping)
        }

        // إنشاء قيد السداد (Cash/AR)
        const selectedPaymentCashAccountId = selectedPayment.account_id || mapping.cash || mapping.bank
        await postPaymentJournalOnly(inv, amount, selectedPayment.payment_date, mapping, selectedPaymentCashAccountId)

        // Calculate FX Gain/Loss if invoice and payment have different exchange rates
        const invoiceRate = inv.exchange_rate_used || inv.exchange_rate || 1
        const payExRate2 = (selectedPayment as any).exchange_rate_used || (selectedPayment as any).exchange_rate || 1
        if (invoiceRate !== payExRate2 && companyId && mapping.fxGain && mapping.fxLoss && mapping.ar) {
          const fxResult = calculateFXGainLoss(amount, invoiceRate, payExRate2)
          if (fxResult.hasGainLoss && Math.abs(fxResult.amount) >= 0.01) {
            await createFXGainLossEntry(
              supabase, 
              companyId, 
              fxResult, 
              'payment', 
              selectedPayment.id, 
              mapping.fxGain, 
              mapping.fxLoss, 
              mapping.ar, 
              `فرق صرف - فاتورة ${inv.invoice_number}`, 
              paymentCurrency
            )
          }
        }

        toastActionSuccess(toast, "التحديث", "الفاتورة")

        // Link advance application record
        await supabase.from("advance_applications").insert({
          company_id: mapping.companyId,
          customer_id: selectedPayment.customer_id || null,
          supplier_id: null,
          payment_id: selectedPayment.id,
          invoice_id: inv.id,
          bill_id: null,
          amount_applied: amount,
          applied_date: selectedPayment.payment_date,
          notes: "تطبيق سلفة عميل على فاتورة",
        })

        // refresh lists
        startTransition(() => {
          setApplyInvoiceOpen(false)
          setSelectedPayment(null)
        })
        // 🔐 إعادة تحميل المدفوعات مع تطبيق الفلترة الصحيحة
        await reloadPaymentsWithFilters()
        startTransition(() => {
          setSaving(false)
        })
      } catch (err) {
        console.error("Error applying payment to invoice:", err)
        startTransition(() => {
          setSaving(false)
        })
        toastActionError(toast, "التحديث", "الفاتورة", "فشل تطبيق الدفعة على الفاتورة")
      }
    }, 0)
  }

  const applyPaymentToPO = async () => {
    try {
      if (!selectedPayment || !applyDocId || applyAmount <= 0) return
      setSaving(true)
      const mapping = await findAccountIds()
      if (!mapping || !mapping.supplierAdvance || !mapping.cash) return
      const { data: po } = await supabase.from("purchase_orders").select("*").eq("id", applyDocId).single()
      if (!po) return
      const remaining = Math.max(Number(po.total_amount || 0) - Number(po.received_amount || 0), 0)
      const amount = Math.min(applyAmount, remaining)

      // Update PO
      const newReceived = Number(po.received_amount || 0) + amount
      const newStatus = newReceived >= Number(po.total_amount || 0) ? "received" : "received_partial"
      const { error: poErr } = await supabase.from("purchase_orders").update({ received_amount: newReceived, status: newStatus }).eq("id", po.id)
      if (poErr) throw poErr

      // Link payment
      const { error: payErr } = await supabase.from("payments").update({ purchase_order_id: po.id }).eq("id", selectedPayment.id)
      if (payErr) throw payErr

      // Post journal
      const cashAccountId = selectedPayment?.account_id || mapping.cash
      const { data: entry, error: entryErr } = await supabase
        .from("journal_entries").insert({
          company_id: mapping.companyId,
          reference_type: "po_payment",
          reference_id: po.id,
          entry_date: selectedPayment.payment_date,
          description: `سداد مرتبط بأمر شراء ${po.po_number}`,
          branch_id: po.branch_id || mapping.branchId!,
          cost_center_id: po.cost_center_id || null,
        }).select().single()
      if (entryErr) throw entryErr
      const poCurrency = selectedPayment.original_currency || selectedPayment.currency_code || 'EGP'
      const poExRate = selectedPayment.exchange_rate_used || selectedPayment.exchange_rate || 1
      const { error: linesErr } = await supabase.from("journal_entry_lines").insert([
        { journal_entry_id: entry.id, account_id: mapping.supplierAdvance, debit_amount: amount, credit_amount: 0, description: "سلف للموردين", original_debit: amount, original_credit: 0, original_currency: poCurrency, exchange_rate_used: poExRate },
        { journal_entry_id: entry.id, account_id: cashAccountId, debit_amount: 0, credit_amount: amount, description: "نقد/بنك", original_debit: 0, original_credit: amount, original_currency: poCurrency, exchange_rate_used: poExRate },
      ])
      if (linesErr) throw linesErr

      toastActionSuccess(toast, "التحديث", "أمر الشراء")

      setApplyPoOpen(false)
      setSelectedPayment(null)
      const { data: suppPays } = await supabase
        .from("payments").select("*")
        .eq("company_id", mapping.companyId)
        .not("supplier_id", "is", null)
        .order("payment_date", { ascending: false })
      setSupplierPayments(suppPays || [])
    } catch (err) {
      console.error("Error applying payment to PO:", err)
      toastActionError(toast, "التحديث", "أمر الشراء", "فشل تطبيق الدفعة على أمر الشراء")
    } finally {
      setSaving(false)
    }
  }

  const applyPaymentToBill = async () => {
    try {
      if (!selectedPayment || !applyDocId || applyAmount <= 0) return
      setSaving(true)
      const mapping = await findAccountIds()
      if (!mapping || !mapping.ap) return
      const { data: bill } = await supabase.from("bills").select("*").eq("id", applyDocId).single()
      if (!bill) return

      // 🔐 ERP Governance: التحقق من صلاحية الدفع على هذه الفاتورة
      if (!canPayOnDocument(bill.branch_id)) {
        toast({
          title: appLang === 'en' ? 'Access Denied' : 'غير مصرح',
          description: appLang === 'en'
            ? 'You cannot make payments on bills from other branches. Please contact your administrator.'
            : 'لا يمكنك إجراء دفعات على فواتير من فروع أخرى. يرجى التواصل مع المسؤول.',
          variant: 'destructive'
        })
        setSaving(false)
        return
      }

      // 🔐 Net Outstanding = total - returned - paid (overpayment guard)
      const netOutstanding = Math.max(
        Number(bill.total_amount || 0) - Number(bill.returned_amount || 0) - Number(bill.paid_amount || 0),
        0
      )
      const remaining = netOutstanding
      const amount = Math.min(applyAmount, remaining)

      // 🔍 التحقق من كفاية الرصيد قبل تطبيق الدفعة
      const paymentAccountId = selectedPayment.account_id || mapping.cash || mapping.bank || null
      const balanceCheck = await checkAccountBalance(
        paymentAccountId,
        amount,
        selectedPayment.payment_date || new Date().toISOString().slice(0, 10)
      )

      if (!balanceCheck.sufficient) {
        toast({
          title: appLang === 'en' ? 'Insufficient Balance' : 'رصيد غير كافٍ',
          description: appLang === 'en'
            ? `The account "${balanceCheck.accountName || 'Selected Account'}" has insufficient balance. Current balance: ${balanceCheck.currentBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}. Required: ${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}.`
            : `رصيد الحساب "${balanceCheck.accountName || 'الحساب المختار'}" غير كافٍ. الرصيد الحالي: ${balanceCheck.currentBalance.toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}. المطلوب: ${amount.toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}.`,
          variant: 'destructive'
        })
        setSaving(false)
        return
      }

      // Link payment first, then update bill; rollback on failure
      const originalPaid = Number(bill.paid_amount || 0)
      const isFirstPayment = originalPaid === 0 && (bill.status === 'sent' || bill.status === 'received')

      {
        // ✅ ربط الدفعة بالفاتورة وأمر الشراء المرتبط (إن وجد)
        const updateData: any = { bill_id: bill.id }
        if (bill.purchase_order_id) {
          updateData.purchase_order_id = bill.purchase_order_id
        }
        const { error: payErr } = await supabase.from("payments").update(updateData).eq("id", selectedPayment.id)
        if (payErr) throw payErr
      }
      {
        const newPaid = originalPaid + amount
        // Use net amount (total - returned) for status determination
        const netAmount = Math.max(Number(bill.total_amount || 0) - Number(bill.returned_amount || 0), 0)
        const newStatus = newPaid >= netAmount ? "paid" : "partially_paid"
        const { error: billErr } = await supabase.from("bills").update({ paid_amount: newPaid, status: newStatus }).eq("id", bill.id)
        if (billErr) {
          await supabase.from("payments").update({ bill_id: null }).eq("id", selectedPayment.id)
          throw billErr
        }
      }

      const billCurrency = bill.original_currency || bill.currency_code || selectedPayment.original_currency || selectedPayment.currency_code || 'EGP'
      const billExRate = bill.exchange_rate_used || selectedPayment.exchange_rate_used || selectedPayment.exchange_rate || 1
      const cashAccountId = selectedPayment.account_id || mapping.cash || mapping.bank

      // ===== 📌 Cash Basis: قيد الفاتورة والدفع عند الدفع =====
      // عند الدفع الأول: إنشاء قيد AP/Inventory + قيد السداد
      // عند الدفعات التالية: قيد السداد فقط (Dr. AP / Cr. Cash)

      // ⚠️ حماية: التحقق من وجود قيد الفاتورة قبل إنشاء قيد الدفعة
      const { data: existingBillEntry } = await supabase
        .from("journal_entries")
        .select("id")
        .eq("company_id", mapping.companyId)
        .eq("reference_type", "bill")
        .eq("reference_id", bill.id)
        .limit(1)

      const hasBillEntry = existingBillEntry && existingBillEntry.length > 0

      if (!hasBillEntry) {
        console.warn("⚠️ لا يوجد قيد فاتورة - سيتم إنشاء قيد AP/Inventory عند الدفع الأول (Cash Basis)")
        // إنشاء قيد الفاتورة (AP/Expense) إذا لم يكن موجوداً
        const { data: billEntry, error: billEntryErr } = await supabase
          .from("journal_entries").insert({
            company_id: mapping.companyId,
            reference_type: "bill",
            reference_id: bill.id,
            entry_date: bill.bill_date,
            description: `فاتورة شراء ${bill.bill_number}`,
            branch_id: bill.branch_id || mapping.branchId!,
            cost_center_id: bill.cost_center_id || null,
          }).select().single()
        if (billEntryErr) throw billEntryErr

        const invOrExp = mapping.inventory || mapping.cogs
        const billLines: any[] = []

        // ✅ حساب المبالغ بناءً على total_amount الحالي (بعد المرتجعات)
        // حساب الإجمالي الأصلي (قبل المرتجعات)
        const originalTotal = Number(bill.total_amount || 0) + Number(bill.returned_amount || 0)
        const currentTotal = Number(bill.total_amount || 0)
        
        // حساب نسبة المرتجع لتطبيقها على subtotal و tax_amount
        const returnRatio = originalTotal > 0 ? currentTotal / originalTotal : 1
        
        // حساب subtotal و tax_amount الحاليين بناءً على النسبة
        const currentSubtotal = Number(bill.subtotal || 0) * returnRatio
        const currentTaxAmount = Number(bill.tax_amount || 0) * returnRatio
        const currentShipping = Number(bill.shipping_charge || 0) * returnRatio

        // Debit: المخزون أو المصروفات (المجموع الفرعي الحالي)
        if (invOrExp && currentSubtotal > 0) {
          billLines.push({
            journal_entry_id: billEntry.id,
            account_id: invOrExp,
            debit_amount: currentSubtotal,
            credit_amount: 0,
            description: mapping.inventory ? "المخزون" : "تكلفة البضاعة المباعة",
            original_debit: currentSubtotal,
            original_credit: 0,
            original_currency: billCurrency,
            exchange_rate_used: billExRate
          })
        }

        // Debit: الضريبة (إن وجدت) - المبلغ الحالي بعد المرتجع
        if (currentTaxAmount > 0) {
          const vatInputAccount = accounts.find(a =>
            a.account_type === 'asset' && (
              (a as any).sub_type === 'vat_input' ||
              a.account_code?.toLowerCase().includes('vatin') ||
              a.account_name?.toLowerCase().includes('vat') ||
              a.account_name?.includes('ضريبة')
            )
          )
          if (vatInputAccount) {
            billLines.push({
              journal_entry_id: billEntry.id,
              account_id: vatInputAccount.id,
              debit_amount: currentTaxAmount,
              credit_amount: 0,
              description: "ضريبة المدخلات",
              original_debit: currentTaxAmount,
              original_credit: 0,
              original_currency: billCurrency,
              exchange_rate_used: billExRate
            })
          }
        }

        // Debit: الشحن (إن وجد) - المبلغ الحالي بعد المرتجع
        if (currentShipping > 0 && mapping.shippingAccount) {
          billLines.push({
            journal_entry_id: billEntry.id,
            account_id: mapping.shippingAccount,
            debit_amount: currentShipping,
            credit_amount: 0,
            description: "مصاريف الشحن",
            original_debit: currentShipping,
            original_credit: 0,
            original_currency: billCurrency,
            exchange_rate_used: billExRate
          })
        }

        // Credit: الحسابات الدائنة (الإجمالي الحالي بعد المرتجع)
        billLines.push({
          journal_entry_id: billEntry.id,
          account_id: mapping.ap,
          debit_amount: 0,
          credit_amount: currentTotal,
          description: "حسابات دائنة",
          original_debit: 0,
          original_credit: currentTotal,
          original_currency: billCurrency,
          exchange_rate_used: billExRate
        })

        if (billLines.length > 0) {
          const { error: billLinesErr } = await supabase.from("journal_entry_lines").insert(billLines)
          if (billLinesErr) throw billLinesErr
        }
        console.log(`✅ تم إنشاء قيد AP/Expense للفاتورة ${bill.bill_number}`)
      }

      // === التحقق إذا كانت الدفعة لها قيد سلفة سابق ===
      // إذا كان لها قيد سلفة: نُسوّي من حساب السلف بدلاً من النقد
      // إذا لم يكن: نخصم من النقد مباشرة (حالة الربط المباشر عند الإنشاء)
      const { data: existingAdvanceEntry } = await supabase
        .from("journal_entries")
        .select("id")
        .eq("company_id", mapping.companyId)
        .eq("reference_type", "supplier_payment")
        .eq("reference_id", selectedPayment.id)
        .maybeSingle()

      const hasAdvanceEntry = !!existingAdvanceEntry
      // إذا كان لها قيد سلفة، نستخدم حساب السلف. وإلا نستخدم النقد
      const creditAccountId = hasAdvanceEntry && mapping.supplierAdvance
        ? mapping.supplierAdvance
        : cashAccountId
      const creditDescription = hasAdvanceEntry && mapping.supplierAdvance
        ? "تسوية سلف الموردين"
        : "نقد/بنك"

      // 2. قيد الدفع (الحسابات الدائنة مدين / سلف أو نقد دائن)
      const { data: payEntry, error: payEntryErr } = await supabase
        .from("journal_entries").insert({
          company_id: mapping.companyId,
          reference_type: "bill_payment",
          reference_id: bill.id,
          entry_date: selectedPayment.payment_date,
          description: `سداد فاتورة مورد ${bill.bill_number}`,
          branch_id: bill.branch_id || mapping.branchId!,
          cost_center_id: bill.cost_center_id || null,
        }).select().single()
      if (payEntryErr) throw payEntryErr

      const { error: payLinesErr } = await supabase.from("journal_entry_lines").insert([
        {
          journal_entry_id: payEntry.id,
          account_id: mapping.ap,
          debit_amount: amount,
          credit_amount: 0,
          description: "حسابات دائنة",
          original_debit: amount,
          original_credit: 0,
          original_currency: billCurrency,
          exchange_rate_used: billExRate
        },
        {
          journal_entry_id: payEntry.id,
          account_id: creditAccountId,
          debit_amount: 0,
          credit_amount: amount,
          description: creditDescription,
          original_debit: 0,
          original_credit: amount,
          original_currency: billCurrency,
          exchange_rate_used: billExRate
        },
      ])
      if (payLinesErr) throw payLinesErr
      console.log(`✅ تم إنشاء قيد الدفع فقط (AP/Cash) - نظام الاستحقاق`)

      // Link advance application record
      await supabase.from("advance_applications").insert({
        company_id: mapping.companyId,
        customer_id: null,
        supplier_id: selectedPayment.supplier_id || null,
        payment_id: selectedPayment.id,
        invoice_id: null,
        bill_id: bill.id,
        amount_applied: amount,
        applied_date: selectedPayment.payment_date,
        notes: isFirstPayment ? "الدفعة الأولى - تفعيل الفاتورة محاسبياً" : "دفعة إضافية على فاتورة شراء",
      })

      // تحديث حالة أمر الشراء المرتبط
      await updateLinkedPurchaseOrderStatus(bill.id)

      setApplyBillOpen(false)
      setSelectedPayment(null)
      const { data: suppPays } = await supabase
        .from("payments").select("*")
        .eq("company_id", mapping.companyId)
        .not("supplier_id", "is", null)
        .order("payment_date", { ascending: false })
      setSupplierPayments(suppPays || [])
    } catch (err: any) {
      console.error("Error applying payment to bill:", { message: String(err?.message || err || ""), details: err?.details ?? err })
    } finally { setSaving(false) }
  }

  // تنفيذ ربط دفع مورّد بفاتورة مورد باستخدام معطيات محددة دون الاعتماد على حالة الواجهة
  const applyPaymentToBillWithOverrides = async (payment: Payment, billId: string, rawAmount: number, _accountType?: string) => {
    try {
      if (!payment || !billId || rawAmount <= 0) return
      setSaving(true)
      const mapping = await findAccountIds()
      if (!mapping || !mapping.ap) {
        toast({ title: appLang === 'en' ? 'AP Account Missing' : 'حساب AP مفقود', description: appLang === 'en' ? 'Configure Accounts Payable in chart of accounts.' : 'يرجى إعداد حساب الذمم الدائنة في شجرة الحسابات.', variant: 'destructive' })
        setSaving(false); return
      }
      if (!mapping.cash && !mapping.bank) {
        toast({ title: appLang === 'en' ? 'No Cash/Bank Account' : 'لا يوجد حساب نقد/بنك', description: appLang === 'en' ? 'No cash or bank account found in chart of accounts.' : 'لم يتم العثور على حساب نقدي أو بنكي في شجرة الحسابات.', variant: 'destructive' })
        setSaving(false); return
      }
      const { data: bill } = await supabase.from("bills").select("*").eq("id", billId).single()
      if (!bill) {
        toast({ title: appLang === 'en' ? 'Bill Not Found' : 'الفاتورة غير موجودة', description: appLang === 'en' ? 'Could not load the selected bill.' : 'تعذر تحميل الفاتورة المختارة.', variant: 'destructive' })
        setSaving(false); return
      }

      // 🔐 ERP Governance: التحقق من صلاحية الدفع على هذه الفاتورة
      if (!canPayOnDocument(bill.branch_id)) {
        toast({
          title: appLang === 'en' ? 'Access Denied' : 'غير مصرح',
          description: appLang === 'en'
            ? 'You cannot make payments on bills from other branches. Please contact your administrator.'
            : 'لا يمكنك إجراء دفعات على فواتير من فروع أخرى. يرجى التواصل مع المسؤول.',
          variant: 'destructive'
        })
        setSaving(false)
        return
      }
      // 🔐 Net Outstanding = total - returned - paid (overpayment guard)
      const netOutstandingOvr = Math.max(
        Number(bill.total_amount || 0) - Number(bill.returned_amount || 0) - Number(bill.paid_amount || 0),
        0
      )
      const remaining = netOutstandingOvr
      const amount = Math.min(rawAmount, remaining)
      if (amount <= 0) {
        toast({
          title: appLang === 'en' ? 'Bill fully settled' : 'الفاتورة مسددة بالكامل',
          description: appLang === 'en'
            ? 'Net outstanding is 0 after deducting returns. No payment needed.'
            : 'الصافي المستحق = 0 بعد خصم المرتجعات. لا توجد دفعة مطلوبة.',
          variant: 'destructive'
        })
        setSaving(false)
        return
      }

      // Track state for potential rollback
      const originalPaid = Number(bill.paid_amount || 0)
      const isFirstPayment = originalPaid === 0 && (bill.status === 'sent' || bill.status === 'received')
      let linkedPayment = false

      // 1) Link payment first to avoid updating bill when link fails (RLS/constraints)
      {
        // ✅ ربط الدفعة بالفاتورة وأمر الشراء المرتبط (إن وجد)
        const updateData: any = { bill_id: bill.id }
        if (bill.purchase_order_id) {
          updateData.purchase_order_id = bill.purchase_order_id
        }
        const { error: payErr } = await supabase.from("payments").update(updateData).eq("id", payment.id)
        if (payErr) throw payErr
        linkedPayment = true
      }

      // 2) Update bill totals/status
      {
        const newPaid = originalPaid + amount
        // Use net amount (total - returned) for status determination
        const netAmountOvr = Math.max(Number(bill.total_amount || 0) - Number(bill.returned_amount || 0), 0)
        const newStatus = newPaid >= netAmountOvr ? "paid" : "partially_paid"
        const { error: billErr } = await supabase.from("bills").update({ paid_amount: newPaid, status: newStatus }).eq("id", bill.id)
        if (billErr) {
          if (linkedPayment) {
            await supabase.from("payments").update({ bill_id: null }).eq("id", payment.id)
          }
          throw billErr
        }
      }

      const billCurrency2 = bill.original_currency || bill.currency_code || payment.original_currency || payment.currency_code || 'EGP'
      const billExRate2 = bill.exchange_rate_used || payment.exchange_rate_used || payment.exchange_rate || 1
      const cashAccountId = payment.account_id || mapping.cash || mapping.bank

      // ===== 📌 نظام الاستحقاق (Accrual Basis): قيد الدفع فقط =====
      // 📌 المرجع: ACCRUAL_ACCOUNTING_PATTERN.md
      // قيد AP/Expense تم إنشاؤه عند Sent/Received
      // الآن ننشئ قيد الدفع فقط: Dr. AP / Cr. Cash

      // ⚠️ حماية: التأكد من وجود قيد الفاتورة قبل إنشاء قيد الدفعة
      const { data: existingBillEntry2 } = await supabase
        .from("journal_entries")
        .select("id")
        .eq("company_id", mapping.companyId)
        .eq("reference_type", "bill")
        .eq("reference_id", bill.id)
        .limit(1)

      const hasBillEntry2 = existingBillEntry2 && existingBillEntry2.length > 0

      if (!hasBillEntry2) {
        console.warn("⚠️ لا يوجد قيد فاتورة - سيتم إنشاء قيد AP/Expense أولاً")
        await postBillJournalOnFirstPayment(bill, mapping, billCurrency2, billExRate2)
      }

      // === التحقق إذا كانت الدفعة لها قيد سلفة سابق ===
      const { data: existingAdvanceEntry2 } = await supabase
        .from("journal_entries")
        .select("id")
        .eq("company_id", mapping.companyId)
        .eq("reference_type", "supplier_payment")
        .eq("reference_id", payment.id)
        .maybeSingle()

      const hasAdvanceEntry2 = !!existingAdvanceEntry2
      // إذا كان لها قيد سلفة، نستخدم حساب السلف. وإلا نستخدم النقد
      const creditAccountId2 = hasAdvanceEntry2 && mapping.supplierAdvance
        ? mapping.supplierAdvance
        : cashAccountId
      const creditDescription2 = hasAdvanceEntry2 && mapping.supplierAdvance
        ? "تسوية سلف الموردين"
        : "نقد/بنك"

      // قيد السداد: Debit AP / Credit Cash
      const { data: payEntry, error: payEntryErr } = await supabase
        .from("journal_entries").insert({
          company_id: mapping.companyId,
          reference_type: "bill_payment",
          reference_id: bill.id,
          entry_date: payment.payment_date,
          description: `سداد فاتورة مورد ${bill.bill_number}`,
          branch_id: bill.branch_id || mapping.branchId!,
          cost_center_id: bill.cost_center_id || null,
        }).select().single()
      if (payEntryErr) throw payEntryErr

      const { error: payLinesErr } = await supabase.from("journal_entry_lines").insert([
        { journal_entry_id: payEntry.id, account_id: mapping.ap, debit_amount: amount, credit_amount: 0, description: "حسابات دائنة", original_debit: amount, original_credit: 0, original_currency: billCurrency2, exchange_rate_used: billExRate2 },
        { journal_entry_id: payEntry.id, account_id: creditAccountId2, debit_amount: 0, credit_amount: amount, description: creditDescription2, original_debit: 0, original_credit: amount, original_currency: billCurrency2, exchange_rate_used: billExRate2 },
      ])
      if (payLinesErr) throw payLinesErr
      console.log(`✅ تم إنشاء قيد السداد للفاتورة ${bill.bill_number} - مبلغ: ${amount}`)

      // Calculate FX Gain/Loss if bill and payment have different exchange rates
      const payExRate3 = payment.exchange_rate_used || payment.exchange_rate || 1
      if (billExRate2 !== payExRate3 && mapping.fxGain && mapping.fxLoss && mapping.ap) {
        const fxResult = calculateFXGainLoss(amount, billExRate2, payExRate3)
        if (fxResult.hasGainLoss && Math.abs(fxResult.amount) >= 0.01) {
          await createFXGainLossEntry(
            supabase,
            mapping.companyId,
            fxResult,
            'supplier_payment',
            payment.id,
            mapping.fxGain,
            mapping.fxLoss,
            mapping.ap,
            `فرق صرف - فاتورة المورد ${bill.bill_number}`,
            billCurrency2
          )
        }
      }

      await supabase.from("advance_applications").insert({
        company_id: mapping.companyId,
        customer_id: null,
        supplier_id: payment.supplier_id || null,
        payment_id: payment.id,
        invoice_id: null,
        bill_id: bill.id,
        amount_applied: amount,
        applied_date: payment.payment_date,
        notes: isFirstPayment ? "الدفعة الأولى - تفعيل الفاتورة محاسبياً" : "دفعة إضافية على فاتورة شراء",
      })

      // تحديث حالة أمر الشراء المرتبط
      await updateLinkedPurchaseOrderStatus(bill.id)

      const { data: suppPays } = await supabase
        .from("payments").select("*")
        .eq("company_id", mapping.companyId)
        .not("supplier_id", "is", null)
        .order("payment_date", { ascending: false })
      setSupplierPayments(suppPays || [])
    } catch (err: any) {
      const msg = String(err?.message || err || "")
      const details = err?.details ?? err
      console.error("Error applying payment to bill (overrides):", { message: msg, details })
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
        <main className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8">
          <p className="py-8 text-center">{appLang === 'en' ? 'Loading...' : 'جاري التحميل...'}</p>
        </main>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
      {/* Main Content - تحسين للهاتف */}
      <main className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8 space-y-4 sm:space-y-6 overflow-x-hidden">
        {/* رأس الصفحة - تحسين للهاتف */}
        <div className="bg-white dark:bg-slate-900 rounded-xl sm:rounded-2xl shadow-sm border border-gray-200 dark:border-slate-800 p-4 sm:p-6">
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="p-2 sm:p-3 bg-green-100 dark:bg-green-900/30 rounded-lg sm:rounded-xl flex-shrink-0">
              <CreditCard className="w-5 h-5 sm:w-6 sm:h-6 text-green-600 dark:text-green-400" />
            </div>
            <div className="min-w-0">
              <h1 className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white truncate">{appLang === 'en' ? 'Payments' : 'المدفوعات'}</h1>
              <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-0.5 sm:mt-1 truncate">{appLang === 'en' ? 'Manage customer and supplier payments' : 'إدارة مدفوعات العملاء والموردين'}</p>
              {/* 🔐 Governance Notice */}
              {(userContext?.role === 'manager' || userContext?.role === 'accountant') && (
                <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                  {appLang === 'en' ? '🏢 Showing payments from your branch only' : '🏢 تعرض المدفوعات الخاصة بفرعك فقط'}
                </p>
              )}
              {(userContext?.role === 'staff' || userContext?.role === 'sales' || userContext?.role === 'employee') && (
                <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                  {appLang === 'en' ? '👨‍💼 Showing payments you created only' : '👨‍💼 تعرض المدفوعات التي أنشأتها فقط'}
                </p>
              )}
            </div>
          </div>
          {!online && (
            <div className="mt-3 sm:mt-4 p-2 sm:p-3 rounded border border-amber-300 bg-amber-50 text-amber-700 text-xs sm:text-sm">
              {appLang === 'en' ? 'Offline - Save actions disabled' : 'غير متصل - التخزين معطّل'}
            </div>
          )}
        </div>

        {/* 🔐 فلتر الفروع الموحد - يظهر فقط للأدوار المميزة (Owner/Admin/General Manager) */}
        <Card>
          <CardContent className="pt-6">
            <BranchFilter
              lang={appLang}
              externalHook={branchFilter}
              className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800"
            />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6 space-y-6">
            <div className="flex justify-between items-center gap-4">
              <h2 className="text-xl font-semibold">{appLang === 'en' ? 'Customer Payments' : 'مدفوعات العملاء'}</h2>
              {permWrite && (
                <CustomerPaymentAllocationUI
                  appLang={appLang}
                  customers={customers}
                  accounts={accounts}
                  currencies={currencies}
                  baseCurrency={baseCurrency}
                  currencySymbols={currencySymbols}
                  onSuccess={async () => {
                    const { data: custPays } = await supabase
                      .from("payments").select("*")
                      .eq("company_id", companyId || "")
                      .not("customer_id", "is", null)
                      .order("payment_date", { ascending: false })
                    setCustomerPayments(custPays || [])
                  }}
                />
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
              <div>
                <Label>{appLang === 'en' ? 'Customer' : 'العميل'}</Label>
                <CustomerSearchSelect
                  customers={customers}
                  value={newCustPayment.customer_id}
                  onValueChange={(v) => setNewCustPayment({ ...newCustPayment, customer_id: v })}
                  placeholder={appLang === 'en' ? 'Select a customer' : 'اختر عميلًا'}
                  searchPlaceholder={appLang === 'en' ? 'Search by name or phone...' : 'ابحث بالاسم أو الهاتف...'}
                />
              </div>
              <div>
                <Label>{appLang === 'en' ? 'Account (Cash/Bank)' : 'الحساب (نقد/بنك)'}</Label>
                <select className="w-full border rounded px-2 py-1" value={newCustPayment.account_id} onChange={(e) => setNewCustPayment({ ...newCustPayment, account_id: e.target.value })}>
                  <option value="">{appLang === 'en' ? 'Select payment account' : 'اختر حساب الدفع'}</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>{a.account_name} ({a.account_code})</option>
                  ))}
                </select>
              </div>
              <div>
                <Label>{appLang === 'en' ? 'Amount' : 'المبلغ'}</Label>
                <NumericInput min={0} step={0.01} value={newCustPayment.amount} onChange={(val) => setNewCustPayment({ ...newCustPayment, amount: val })} decimalPlaces={2} />
              </div>
              <div>
                <Label>{appLang === 'en' ? 'Date' : 'تاريخ'}</Label>
                <Input type="date" value={newCustPayment.date} onChange={(e) => setNewCustPayment({ ...newCustPayment, date: e.target.value })} />
              </div>
              <div>
                <Label>{appLang === 'en' ? 'Method' : 'طريقة'}</Label>
                <select className="w-full border rounded px-2 py-1" value={newCustPayment.method} onChange={(e) => setNewCustPayment({ ...newCustPayment, method: e.target.value })}>
                  <option value="cash">{appLang === 'en' ? 'Cash' : 'كاش'}</option>
                  <option value="transfer">{appLang === 'en' ? 'Transfer' : 'تحويل'}</option>
                  <option value="check">{appLang === 'en' ? 'Check' : 'شيك'}</option>
                </select>
              </div>
              <div>
                <Label>{appLang === 'en' ? 'Currency' : 'العملة'}</Label>
                <div className="flex gap-2 items-center">
                  <select className="border rounded px-2 py-1" value={paymentCurrency} onChange={async (e) => {
                    const v = e.target.value
                    setPaymentCurrency(v)
                    if (v === baseCurrency) {
                      setExchangeRate(1)
                      setExchangeRateId(undefined)
                      setRateSource('same_currency')
                    } else {
                      setFetchingRate(true)
                      try {
                        // Use CurrencyService for rate lookup
                        const result = await getExchangeRate(supabase, v, baseCurrency)
                        setExchangeRate(result.rate)
                        setExchangeRateId(result.rateId)
                        setRateSource(result.source)
                      } catch {
                        // Fallback to direct API
                        try {
                          const res = await fetch(`https://api.exchangerate-api.com/v4/latest/${v}`)
                          const data = await res.json()
                          setExchangeRate(data.rates?.[baseCurrency] || 1)
                          setRateSource('api_fallback')
                        } catch { setExchangeRate(1) }
                      }
                      setFetchingRate(false)
                    }
                  }}>
                    {currencies.length > 0 ? (
                      currencies.map((c) => (
                        <option key={c.code} value={c.code}>{c.symbol} {c.code}</option>
                      ))
                    ) : (
                      Object.entries(currencySymbols).map(([code, symbol]) => (
                        <option key={code} value={code}>{symbol} {code}</option>
                      ))
                    )}
                  </select>
                  {paymentCurrency !== baseCurrency && (
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {fetchingRate ? '...' : (
                        <>
                          1 {paymentCurrency} = {exchangeRate.toFixed(4)} {baseCurrency}
                          <span className="text-blue-500 ml-1">({rateSource})</span>
                        </>
                      )}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex gap-2">
                <Button onClick={createCustomerPayment} disabled={saving || !online || !newCustPayment.customer_id || newCustPayment.amount <= 0 || !newCustPayment.account_id}>{appLang === 'en' ? 'Create' : 'إنشاء'}</Button>
              </div>
            </div>

            {newCustPayment.customer_id && (
              <div className="mt-4 border rounded p-3">
                <h3 className="text-base font-semibold mb-2">{appLang === 'en' ? 'Customer invoices not fully paid' : 'فواتير العميل غير المسددة بالكامل'}</h3>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-gray-50 dark:bg-slate-900">
                      <th className="px-2 py-2 text-right">{appLang === 'en' ? 'Invoice No.' : 'رقم الفاتورة'}</th>
                      <th className="px-2 py-2 text-right">{appLang === 'en' ? 'Date' : 'التاريخ'}</th>
                      <th className="px-2 py-2 text-right">{appLang === 'en' ? 'Branch' : 'الفرع'}</th>
                      <th className="px-2 py-2 text-right">{appLang === 'en' ? 'Total' : 'المبلغ'}</th>
                      <th className="px-2 py-2 text-right">{appLang === 'en' ? 'Paid' : 'المدفوع'}</th>
                      <th className="px-2 py-2 text-right">{appLang === 'en' ? 'Remaining' : 'المتبقي'}</th>
                      <th className="px-2 py-2 text-right">{appLang === 'en' ? 'Select' : 'اختيار'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {formCustomerInvoices.map((inv) => {
                      const outstanding = Math.max(Number(inv.total_amount || 0) - Number(inv.paid_amount || 0), 0)
                      if (outstanding <= 0) return null
                      return (
                        <tr key={inv.id} className="border-b">
                          <td className="px-2 py-2">{inv.invoice_number}</td>
                          <td className="px-2 py-2">{inv.invoice_date || "-"}</td>
                          <td className="px-2 py-2">
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                              {inv.branches?.name || (inv.branch_id ? branchNames[inv.branch_id] : null) || (appLang === 'en' ? 'Main' : 'رئيسي')}
                            </span>
                          </td>
                          <td className="px-2 py-2">{Number(inv.total_amount || 0).toFixed(2)} {currencySymbols[baseCurrency] || baseCurrency}</td>
                          <td className="px-2 py-2">{Number(inv.paid_amount || 0).toFixed(2)} {currencySymbols[baseCurrency] || baseCurrency}</td>
                          <td className="px-2 py-2 font-semibold">{outstanding.toFixed(2)} {currencySymbols[baseCurrency] || baseCurrency}</td>
                          <td className="px-2 py-2">
                            <Button variant={selectedFormInvoiceId === inv.id ? "default" : "outline"} size="sm" onClick={() => {
                              setSelectedFormInvoiceId(inv.id)
                              setNewCustPayment({ ...newCustPayment, amount: outstanding })
                            }}>{appLang === 'en' ? 'Select' : 'اختيار'}</Button>
                          </td>
                        </tr>
                      )
                    })}
                    {formCustomerInvoices.length === 0 && (
                      <tr><td colSpan={7} className="px-2 py-2 text-center text-gray-500 dark:text-gray-400">{appLang === 'en' ? 'No unpaid invoices for this customer' : 'لا توجد فواتير غير مسددة بالكامل لهذا العميل'}</td></tr>
                    )}
                  </tbody>
                </table>
                {selectedFormInvoiceId && (
                  <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">{appLang === 'en' ? 'Invoice selected; amount auto-filled with remaining.' : 'تم اختيار الفاتورة، وتم تعبئة خانة المبلغ تلقائيًا بالمبلغ المتبقي.'}</p>
                )}
              </div>
            )}

            <div className="border-t pt-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50 dark:bg-slate-900">
                    <th className="px-2 py-2 text-right">{appLang === 'en' ? 'Date' : 'التاريخ'}</th>
                    <th className="px-2 py-2 text-right">{appLang === 'en' ? 'Branch' : 'الفرع'}</th>
                    <th className="px-2 py-2 text-right">{appLang === 'en' ? 'Amount' : 'المبلغ'}</th>
                    <th className="px-2 py-2 text-right">{appLang === 'en' ? 'Reference' : 'مرجع'}</th>
                    <th className="px-2 py-2 text-right">{appLang === 'en' ? 'Linked Invoice' : 'الفاتورة المرتبطة'}</th>
                    <th className="px-2 py-2 text-right">{appLang === 'en' ? 'Sales Order' : 'أمر البيع'}</th>
                    <th className="px-2 py-2 text-right">{appLang === 'en' ? 'Action' : 'إجراء'}</th>
                  </tr>
                </thead>
                <tbody>
                  {customerPayments.map((p) => (
                    <tr key={p.id} className="border-b">
                      <td className="px-2 py-2">{p.payment_date}</td>
                      <td className="px-2 py-2">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                          {/* ✅ عرض الفرع: من الفاتورة المرتبطة (invoiceBranchMap) → من الدفعة → fallback */}
                          {(p.invoice_id && invoiceBranchMap[p.invoice_id] ? branchNames[invoiceBranchMap[p.invoice_id]] : null) || p.branches?.name || (p.branch_id ? branchNames[p.branch_id] : null) || (appLang === 'en' ? 'Main' : 'رئيسي')}
                        </span>
                      </td>
                      <td className="px-2 py-2">{getDisplayAmount(p).toFixed(2)} {currencySymbol}</td>
                      <td className="px-2 py-2">{p.reference_number || "-"}</td>
                      <td className="px-2 py-2">
                        {p.invoice_id ? (
                          <Link href={`/invoices/${p.invoice_id}`} className="text-blue-600 hover:underline">
                            {invoiceNumbers[p.invoice_id] || p.invoice_id}
                          </Link>
                        ) : (
                          <span className="text-gray-400">{appLang === 'en' ? 'Not linked' : 'غير مرتبط'}</span>
                        )}
                      </td>
                      <td className="px-2 py-2">
                        {p.invoice_id && invoiceToSalesOrderMap[p.invoice_id] ? (
                          <Link href={`/sales-orders/${invoiceToSalesOrderMap[p.invoice_id].id}`} className="text-green-600 hover:underline">
                            {invoiceToSalesOrderMap[p.invoice_id].so_number}
                          </Link>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-2 py-2">
                        <div className="flex gap-2">
                          <Button variant="ghost" size="icon" title={appLang === 'en' ? 'View Details' : 'عرض التفاصيل'} onClick={() => setSelectedPaymentDetailsId(p.id)}>
                            <Eye className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                          </Button>
                          {!p.invoice_id && permWrite && (
                            <Button variant="outline" onClick={() => openApplyToInvoice(p)} disabled={!online}>{appLang === 'en' ? 'Apply to Invoice' : 'تطبيق على فاتورة'}</Button>
                          )}
                          {permUpdate && (
                            <Button variant="ghost" disabled={!online} onClick={() => {
                              setEditingPayment(p)
                              setEditFields({
                                payment_date: p.payment_date,
                                payment_method: p.payment_method || "cash",
                                reference_number: p.reference_number || "",
                                notes: p.notes || "",
                                account_id: p.account_id || "",
                              })
                              setEditOpen(true)
                            }}>{appLang === 'en' ? 'Edit' : 'تعديل'}</Button>
                          )}
                          {permDelete && (
                            <Button variant="destructive" disabled={!online} onClick={() => { setDeletingPayment(p); setDeleteOpen(true) }}>{appLang === 'en' ? 'Delete' : 'حذف'}</Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6 space-y-6">
            <h2 className="text-xl font-semibold">{appLang === 'en' ? 'Supplier Payments' : 'مدفوعات الموردين'}</h2>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
              <div>
                <Label>{appLang === 'en' ? 'Supplier' : 'المورد'}</Label>
                <Select value={newSuppPayment.supplier_id} onValueChange={(v) => setNewSuppPayment({ ...newSuppPayment, supplier_id: v })}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={appLang === 'en' ? 'Select a supplier' : 'اختر مورّدًا'} />
                  </SelectTrigger>
                  <SelectContent className="min-w-[260px]">
                    <div className="p-2">
                      <Input value={supplierQuery} onChange={(e) => setSupplierQuery(e.target.value)} placeholder={appLang === 'en' ? 'Search suppliers...' : 'ابحث عن مورد...'} className="text-sm" />
                    </div>
                    {suppliers.filter((s) => {
                      const q = supplierQuery.trim().toLowerCase()
                      if (!q) return true
                      return String(s.name || '').toLowerCase().includes(q)
                    }).map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{appLang === 'en' ? 'Account (Cash/Bank)' : 'الحساب (نقد/بنك)'}</Label>
                <select className="w-full border rounded px-2 py-1" value={newSuppPayment.account_id} onChange={(e) => setNewSuppPayment({ ...newSuppPayment, account_id: e.target.value })}>
                  <option value="">{appLang === 'en' ? 'Select payment account' : 'اختر حساب السداد'}</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>{a.account_name} ({a.account_code})</option>
                  ))}
                </select>
              </div>
              <div>
                <Label>{appLang === 'en' ? 'Amount' : 'المبلغ'}</Label>
                <NumericInput min={0} step={0.01} value={newSuppPayment.amount} onChange={(val) => setNewSuppPayment({ ...newSuppPayment, amount: val })} decimalPlaces={2} />
              </div>
              <div>
                <Label>{appLang === 'en' ? 'Date' : 'تاريخ'}</Label>
                <Input type="date" value={newSuppPayment.date} onChange={(e) => setNewSuppPayment({ ...newSuppPayment, date: e.target.value })} />
              </div>
              <div>
                <Label>{appLang === 'en' ? 'Method' : 'طريقة'}</Label>
                <select className="w-full border rounded px-2 py-1" value={newSuppPayment.method} onChange={(e) => setNewSuppPayment({ ...newSuppPayment, method: e.target.value })}>
                  <option value="cash">{appLang === 'en' ? 'Cash' : 'كاش'}</option>
                  <option value="transfer">{appLang === 'en' ? 'Transfer' : 'تحويل'}</option>
                  <option value="check">{appLang === 'en' ? 'Check' : 'شيك'}</option>
                </select>
              </div>
              <div>
                <Label>{appLang === 'en' ? 'Currency' : 'العملة'}</Label>
                <div className="flex gap-2 items-center">
                  <select className="border rounded px-2 py-1" value={paymentCurrency} onChange={async (e) => {
                    const v = e.target.value
                    setPaymentCurrency(v)
                    if (v === baseCurrency) {
                      setExchangeRate(1)
                      setExchangeRateId(undefined)
                      setRateSource('same_currency')
                    } else {
                      setFetchingRate(true)
                      try {
                        // Use CurrencyService for rate lookup
                        const result = await getExchangeRate(supabase, v, baseCurrency)
                        setExchangeRate(result.rate)
                        setExchangeRateId(result.rateId)
                        setRateSource(result.source)
                      } catch {
                        // Fallback to direct API
                        try {
                          const res = await fetch(`https://api.exchangerate-api.com/v4/latest/${v}`)
                          const data = await res.json()
                          setExchangeRate(data.rates?.[baseCurrency] || 1)
                          setRateSource('api_fallback')
                        } catch { setExchangeRate(1) }
                      }
                      setFetchingRate(false)
                    }
                  }}>
                    {currencies.length > 0 ? (
                      currencies.map((c) => (
                        <option key={c.code} value={c.code}>{c.symbol} {c.code}</option>
                      ))
                    ) : (
                      Object.entries(currencySymbols).map(([code, symbol]) => (
                        <option key={code} value={code}>{symbol} {code}</option>
                      ))
                    )}
                  </select>
                  {paymentCurrency !== baseCurrency && (
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {fetchingRate ? '...' : (
                        <>
                          1 {paymentCurrency} = {exchangeRate.toFixed(4)} {baseCurrency}
                          <span className="text-blue-500 ml-1">({rateSource})</span>
                        </>
                      )}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex gap-2 w-full md:col-span-5 mt-2">
                <Button onClick={createSupplierPayment} disabled={saving || !online || !newSuppPayment.supplier_id || newSuppPayment.amount <= 0 || !newSuppPayment.account_id}>{appLang === 'en' ? 'Create Single Payment' : 'إنشاء دفعة لمورد'}</Button>
                
                <div className="mr-auto">
                  <SupplierPaymentAllocationUI
                    appLang={appLang}
                    suppliers={suppliers}
                    accounts={accounts}
                    currencies={currencies}
                    baseCurrency={baseCurrency}
                    currencySymbols={currencySymbols}
                    onSuccess={reloadPaymentsWithFilters}
                  />
                </div>
              </div>
            </div>

            {newSuppPayment.supplier_id && (
              <div className="mt-4 border rounded p-3">
                <h3 className="text-base font-semibold mb-2">{appLang === 'en' ? 'Supplier bills not fully paid' : 'فواتير المورد غير المسددة بالكامل'}</h3>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-gray-50 dark:bg-slate-900">
                      <th className="px-2 py-2 text-right">{appLang === 'en' ? 'Bill No.' : 'رقم الفاتورة'}</th>
                      <th className="px-2 py-2 text-right">{appLang === 'en' ? 'Date' : 'التاريخ'}</th>
                      <th className="px-2 py-2 text-right">{appLang === 'en' ? 'Branch' : 'الفرع'}</th>
                      <th className="px-2 py-2 text-right">{appLang === 'en' ? 'Total' : 'المبلغ'}</th>
                      <th className="px-2 py-2 text-right">{appLang === 'en' ? 'Paid' : 'المدفوع'}</th>
                      <th className="px-2 py-2 text-right text-orange-600">{appLang === 'en' ? 'Returns' : 'المرتجعات'}</th>
                      <th className="px-2 py-2 text-right text-red-600">{appLang === 'en' ? 'Net Outstanding' : 'الصافي المستحق'}</th>
                      <th className="px-2 py-2 text-right">{appLang === 'en' ? 'Select' : 'اختيار'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {formSupplierBills.map((b) => {
                      // ✅ Net Outstanding = total - returned - paid (ERP standard)
                      const returnedAmt = Number((b as any).returned_amount || 0)
                      const netOutstanding = Math.max(
                        Number(b.total_amount || 0) - returnedAmt - Number(b.paid_amount || 0),
                        0
                      )
                      // Only show bills with net outstanding > 0
                      if (netOutstanding <= 0) return null
                      return (
                        <tr key={b.id} className="border-b">
                          <td className="px-2 py-2">{b.bill_number}</td>
                          <td className="px-2 py-2">{b.bill_date || "-"}</td>
                          <td className="px-2 py-2">
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300">
                              {b.branches?.name || (b.branch_id ? branchNames[b.branch_id] : null) || (appLang === 'en' ? 'Main' : 'رئيسي')}
                            </span>
                          </td>
                          <td className="px-2 py-2">{Number(b.total_amount || 0).toFixed(2)} {currencySymbols[baseCurrency] || baseCurrency}</td>
                          <td className="px-2 py-2">{Number(b.paid_amount || 0).toFixed(2)} {currencySymbols[baseCurrency] || baseCurrency}</td>
                          <td className="px-2 py-2 text-orange-600">
                            {returnedAmt > 0 ? `-${returnedAmt.toFixed(2)} ${currencySymbols[baseCurrency] || baseCurrency}` : '-'}
                          </td>
                          <td className="px-2 py-2 font-semibold text-red-600">{netOutstanding.toFixed(2)} {currencySymbols[baseCurrency] || baseCurrency}</td>
                          <td className="px-2 py-2">
                            <Button variant={selectedFormBillId === b.id ? "default" : "outline"} size="sm" onClick={() => {
                              setSelectedFormBillId(b.id)
                              // ✅ Auto-fill with net outstanding (not gross remaining)
                              setNewSuppPayment({ ...newSuppPayment, amount: netOutstanding })
                            }}>{appLang === 'en' ? 'Select' : 'اختيار'}</Button>
                          </td>
                        </tr>
                      )
                    })}
                    {formSupplierBills.length === 0 && (
                      <tr><td colSpan={8} className="px-2 py-2 text-center text-gray-500 dark:text-gray-400">{appLang === 'en' ? 'No unpaid bills for this supplier' : 'لا توجد فواتير غير مسددة بالكامل لهذا المورد'}</td></tr>
                    )}
                  </tbody>
                </table>
                {selectedFormBillId && (
                  <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">{appLang === 'en' ? 'Bill selected; amount auto-filled with net outstanding.' : 'تم اختيار الفاتورة، وتم تعبئة خانة المبلغ تلقائيًا بالصافي المستحق.'}</p>
                )}
              </div>
            )}

            <div className="border-t pt-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50 dark:bg-slate-900">
                    <th className="px-2 py-2 text-right">{appLang === 'en' ? 'Date' : 'التاريخ'}</th>
                    <th className="px-2 py-2 text-right">{appLang === 'en' ? 'Branch' : 'الفرع'}</th>
                    <th className="px-2 py-2 text-right">{appLang === 'en' ? 'Amount' : 'المبلغ'}</th>
                    <th className="px-2 py-2 text-right">{appLang === 'en' ? 'Reference' : 'مرجع'}</th>
                    <th className="px-2 py-2 text-right">{appLang === 'en' ? 'Account (Cash/Bank)' : 'الحساب (نقد/بنك)'}</th>
                    <th className="px-2 py-2 text-right">{appLang === 'en' ? 'Linked Supplier Bill' : 'فاتورة المورد المرتبطة'}</th>
                    <th className="px-2 py-2 text-right">{appLang === 'en' ? 'Linked Purchase Order' : 'أمر الشراء المرتبط'}</th>
                    <th className="px-2 py-2 text-right">{appLang === 'en' ? 'Status' : 'الحالة'}</th>
                    <th className="px-2 py-2 text-right">{appLang === 'en' ? 'Action' : 'إجراء'}</th>
                  </tr>
                </thead>
                <tbody>
                  {supplierPayments.map((p) => {
                    const userRole = userContext?.role || ''
                    // ✅ Multi-Level Approval check
                    let canApprove = false;
                    if (p.status === 'pending_approval' && ['owner', 'admin', 'general_manager', 'manager'].includes(userRole)) canApprove = true;
                    if (p.status === 'pending_manager' && ['owner', 'admin', 'general_manager', 'manager'].includes(userRole)) canApprove = true;
                    if (p.status === 'pending_director' && ['owner', 'admin', 'general_manager'].includes(userRole)) canApprove = true;
                    
                    const isPending = p.status?.startsWith('pending_')
                    const isRejected = p.status === 'rejected'
                    return (
                    <tr key={p.id} className={`border-b ${isPending ? 'bg-yellow-50 dark:bg-yellow-900/10' : isRejected ? 'bg-red-50 dark:bg-red-900/10 opacity-60' : ''}`}>
                      <td className="px-2 py-2">{p.payment_date}</td>
                      <td className="px-2 py-2">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300">
                          {/* ✅ priority: bill.branch → PO.branch → billBranchMap → payment.branch */}
                          {((p as any).bill?.bill_branches?.name)
                            || ((p as any).bill?.branch_id ? branchNames[(p as any).bill.branch_id] : null)
                            || ((p as any).bill?.purchase_order?.po_branches?.name)
                            || ((p as any).bill?.purchase_order?.branch_id ? branchNames[(p as any).bill.purchase_order.branch_id] : null)
                            || (p.bill_id && billBranchMap[p.bill_id] ? branchNames[billBranchMap[p.bill_id]] : null)
                            || (p.branch_id ? branchNames[p.branch_id] : null)
                            || p.branches?.name
                            || (appLang === 'en' ? 'Main' : 'رئيسي')}
                        </span>
                      </td>
                      <td className="px-2 py-2">{getDisplayAmount(p).toFixed(2)} {currencySymbol}</td>
                      <td className="px-2 py-2">{p.reference_number || "-"}</td>
                      <td className="px-2 py-2">{p.account_id ? (accountNames[p.account_id] || "-") : "-"}</td>
                      <td className="px-2 py-2">
                        {p.bill_id ? (
                          <Link href={`/bills/${p.bill_id}`} className="text-blue-600 hover:underline">
                            {billNumbers[p.bill_id] || p.bill_id}
                          </Link>
                        ) : ("غير مرتبط")}
                      </td>
                      <td className="px-2 py-2">
                        {(() => {
                          if (p.purchase_order_id) {
                            const poNumber = poNumbers[p.purchase_order_id]
                            return poNumber ? (<Link href={`/purchase-orders/${p.purchase_order_id}`} className="text-blue-600 hover:underline">{poNumber}</Link>) : p.purchase_order_id
                          }
                          if (p.bill_id && billToPoMap[p.bill_id]) {
                            const poId = billToPoMap[p.bill_id]
                            const poNumber = poNumbers[poId]
                            return poNumber ? (<Link href={`/purchase-orders/${poId}`} className="text-blue-600 hover:underline">{poNumber}</Link>) : poId
                          }
                          return "غير مرتبط"
                        })()}
                      </td>
                      {/* ✅ Status Badge */}
                      <td className="px-2 py-2">
                        {isPending && (
                          <div className="flex flex-col gap-1">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300">
                              ⏳ {appLang === 'en' ? 'Pending' : 'في الانتظار'}
                            </span>
                            <span className="text-[10px] text-yellow-600 dark:text-yellow-400 font-semibold px-1">
                              {p.status === 'pending_manager' && (appLang === 'en' ? 'Manager Approval' : 'اعتماد مدير الإدارة')}
                              {p.status === 'pending_director' && (appLang === 'en' ? 'Director Approval' : 'اعتماد الإدارة العليا')}
                            </span>
                          </div>
                        )}
                        {p.status === 'approved' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">
                            ✅ {appLang === 'en' ? 'Approved' : 'معتمد'}
                          </span>
                        )}
                        {isRejected && (
                          <div>
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300">
                              ❌ {appLang === 'en' ? 'Rejected' : 'مرفوض'}
                            </span>
                            {p.rejection_reason && <p className="text-xs text-red-600 mt-0.5">{p.rejection_reason}</p>}
                          </div>
                        )}
                        {!p.status && <span className="text-xs text-gray-400">—</span>}
                      </td>
                      <td className="px-2 py-2">
                        <div className="flex gap-2 flex-wrap">
                          <Button variant="ghost" size="icon" title={appLang === 'en' ? 'View Details' : 'عرض التفاصيل'} onClick={() => setSelectedPaymentDetailsId(p.id)}>
                            <Eye className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                          </Button>
                          {!p.bill_id && permWrite && (
                            <Button variant="outline" onClick={() => openApplyToBill(p)} disabled={!online}>{appLang === 'en' ? 'Apply to Bill' : 'تطبيق على فاتورة'}</Button>
                          )}
                          {(() => {
                            // ✅ إخفاء زر "على أمر شراء" إذا كان هناك أمر شراء مرتبط (مباشر أو عبر الفاتورة)
                            const hasDirectPO = !!p.purchase_order_id
                            const hasPOViaBill = !!(p.bill_id && billToPoMap[p.bill_id])
                            const hasAnyPO = hasDirectPO || hasPOViaBill
                            return !hasAnyPO && permWrite && (
                            <Button variant="ghost" onClick={() => openApplyToPO(p)} disabled={!online}>{appLang === 'en' ? 'Apply to PO' : 'على أمر شراء'}</Button>
                            )
                          })()}
                          {permUpdate && (
                            <Button variant="ghost" disabled={!online} onClick={() => {
                              setEditingPayment(p)
                              setEditFields({
                                payment_date: p.payment_date,
                                payment_method: p.payment_method || "cash",
                                reference_number: p.reference_number || "",
                                notes: p.notes || "",
                                account_id: p.account_id || "",
                              })
                              setEditOpen(true)
                            }}>{appLang === 'en' ? 'Edit' : 'تعديل'}</Button>
                          )}
                          {permDelete && (
                            <Button variant="destructive" disabled={!online} onClick={() => { setDeletingPayment(p); setDeleteOpen(true) }}>{appLang === 'en' ? 'Delete' : 'حذف'}</Button>
                          )}
                          {/* ✅ Approve/Reject buttons for privileged roles on pending payments */}
                          {canApprove && isPending && (
                            <>
                              <Button variant="outline" size="sm" className="text-green-700 border-green-300 hover:bg-green-50" disabled={saving} onClick={() => approvePayment(p)}>
                                {appLang === 'en' ? '✅ Approve' : '✅ اعتماد'}
                              </Button>
                              <Button variant="outline" size="sm" className="text-red-700 border-red-300 hover:bg-red-50" disabled={saving} onClick={() => { setRejectingPayment(p); setRejectionReason(''); setRejectOpen(true) }}>
                                {appLang === 'en' ? '❌ Reject' : '❌ رفض'}
                              </Button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Edit Payment Dialog */}
        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{appLang === 'en' ? 'Edit Payment' : 'تعديل الدفعة'}</DialogTitle>
            </DialogHeader>
            {editingPayment && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>{appLang === 'en' ? 'Payment Date' : 'تاريخ الدفع'}</Label>
                    <Input type="date" value={editFields.payment_date} onChange={(e) => setEditFields({ ...editFields, payment_date: e.target.value })} />
                  </div>
                  <div>
                    <Label>{appLang === 'en' ? 'Payment Method' : 'طريقة الدفع'}</Label>
                    <select className="w-full border rounded px-2 py-1" value={editFields.payment_method} onChange={(e) => setEditFields({ ...editFields, payment_method: e.target.value })}>
                      <option value="cash">{appLang === 'en' ? 'Cash' : 'كاش'}</option>
                      <option value="transfer">{appLang === 'en' ? 'Transfer' : 'تحويل'}</option>
                      <option value="check">{appLang === 'en' ? 'Check' : 'شيك'}</option>
                    </select>
                  </div>
                  <div>
                    <Label>{appLang === 'en' ? 'Reference' : 'مرجع'}</Label>
                    <Input value={editFields.reference_number} onChange={(e) => setEditFields({ ...editFields, reference_number: e.target.value })} />
                  </div>
                  <div>
                    <Label>{appLang === 'en' ? 'Account (Cash/Bank)' : 'الحساب (نقد/بنك)'}</Label>
                    <select 
                      className="w-full border rounded px-2 py-1" 
                      value={editFields.account_id} 
                      onChange={async (e) => {
                        const newAccountId = e.target.value
                        const oldAccountId = editingPayment?.account_id || ""
                        
                        // التحقق من رصيد الحساب عند تغيير الحساب
                        if (editingPayment && newAccountId && newAccountId !== oldAccountId) {
                          const balanceCheck = await checkAccountBalance(
                            newAccountId,
                            editingPayment.amount,
                            editFields.payment_date || editingPayment.payment_date
                          )
                          
                          if (!balanceCheck.sufficient) {
                            toast({
                              title: appLang === 'en' ? 'Insufficient Balance' : 'رصيد غير كافٍ',
                              description: appLang === 'en'
                                ? `The account "${balanceCheck.accountName || 'Selected Account'}" has insufficient balance. Current balance: ${balanceCheck.currentBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}. Required: ${editingPayment.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}.`
                                : `رصيد الحساب "${balanceCheck.accountName || 'الحساب المختار'}" غير كافٍ. الرصيد الحالي: ${balanceCheck.currentBalance.toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}. المطلوب: ${editingPayment.amount.toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}.`,
                              variant: 'destructive'
                            })
                            // إعادة الحساب الأصلي
                            return
                          }
                        }
                        
                        setEditFields({ ...editFields, account_id: newAccountId })
                      }}
                    >
                      <option value="">اختر حساب الدفع</option>
                      {accounts.map((a) => (
                        <option key={a.id} value={a.id}>{a.account_name} ({a.account_code})</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <Label>{appLang === 'en' ? 'Notes' : 'ملاحظات'}</Label>
                  <Input value={editFields.notes} onChange={(e) => setEditFields({ ...editFields, notes: e.target.value })} />
                </div>
                {(editingPayment.invoice_id || editingPayment.bill_id || editingPayment.purchase_order_id) ? (
                  <p className="text-sm text-amber-600">{appLang === 'en' ? 'Payment is linked to a document; amount cannot be changed. Edit reference/notes only.' : 'الدفع مرتبط بمستند؛ لا يمكن تعديل المبلغ. عدّل المرجع/الملاحظات فقط عند الحاجة.'}</p>
                ) : (
                  <p className="text-sm text-gray-500 dark:text-gray-400">{appLang === 'en' ? 'Changing amount via edit is not supported. Use delete then create a new payment if needed.' : 'لا ندعم تغيير المبلغ عبر التعديل. استخدم حذف ثم إنشاء دفعة جديدة إذا لزم.'}</p>
                )}
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => { setEditOpen(false); setEditingPayment(null) }}>{appLang === 'en' ? 'Cancel' : 'إلغاء'}</Button>
              <Button onClick={async () => {
                try {
                  if (!editingPayment) return
                  if (!online) { toastActionError(toast, "الاتصال", "التعديل", "لا يوجد اتصال بالإنترنت"); return }
                  setSaving(true)
                  const mapping = await findAccountIds()
                  const isCustomer = !!editingPayment.customer_id
                  const isApplied = !!(editingPayment.invoice_id || editingPayment.bill_id || editingPayment.purchase_order_id)

                  // إذا لم تكن مرتبطة بأي مستند: ننفذ قيد عكسي ثم نقيد الدفعة بالقيم الجديدة لضمان اتساق القيود
                  if (!isApplied) {
                    const cashAccountIdOriginal = editingPayment.account_id || (mapping ? (mapping.cash || mapping.bank) : undefined)
                    if (mapping && cashAccountIdOriginal) {
                      const { data: revEntry } = await supabase
                        .from("journal_entries").insert({
                          company_id: mapping.companyId,
                          reference_type: isCustomer ? "customer_payment_reversal" : "supplier_payment_reversal",
                          reference_id: null,
                          entry_date: new Date().toISOString().slice(0, 10),
                          description: isCustomer ? "عكس دفعة عميل غير مرتبطة" : "عكس دفعة مورد غير مرتبطة",
                          branch_id: mapping.branchId!,
                          cost_center_id: mapping.costCenterId || null,
                        }).select().single()
                      if (revEntry?.id) {
                        const editCurrency = editingPayment.original_currency || editingPayment.currency_code || 'EGP'
                        const editExRate = editingPayment.exchange_rate_used || editingPayment.exchange_rate || 1
                        if (isCustomer) {
                          if (mapping.customerAdvance) {
                            await supabase.from("journal_entry_lines").insert([
                              { journal_entry_id: revEntry.id, account_id: mapping.customerAdvance, debit_amount: editingPayment.amount, credit_amount: 0, description: "عكس سلف العملاء", original_debit: editingPayment.amount, original_credit: 0, original_currency: editCurrency, exchange_rate_used: editExRate },
                              { journal_entry_id: revEntry.id, account_id: cashAccountIdOriginal, debit_amount: 0, credit_amount: editingPayment.amount, description: "عكس نقد/بنك", original_debit: 0, original_credit: editingPayment.amount, original_currency: editCurrency, exchange_rate_used: editExRate },
                            ])
                          }
                        } else {
                          if (mapping.supplierAdvance) {
                            await supabase.from("journal_entry_lines").insert([
                              { journal_entry_id: revEntry.id, account_id: cashAccountIdOriginal, debit_amount: editingPayment.amount, credit_amount: 0, description: "عكس نقد/بنك", original_debit: editingPayment.amount, original_credit: 0, original_currency: editCurrency, exchange_rate_used: editExRate },
                              { journal_entry_id: revEntry.id, account_id: mapping.supplierAdvance, debit_amount: 0, credit_amount: editingPayment.amount, description: "عكس سلف الموردين", original_debit: 0, original_credit: editingPayment.amount, original_currency: editCurrency, exchange_rate_used: editExRate },
                            ])
                          }
                        }
                      }
                    }

                    // قيد جديد بالقيم المحدّثة
                    const cashAccountIdNew = editFields.account_id || (mapping ? (mapping.cash || mapping.bank) : undefined)
                    
                    // 🔍 التحقق من رصيد الحساب الجديد قبل التعديل (للدفعات غير المرتبطة)
                    if (cashAccountIdNew && cashAccountIdOriginal && cashAccountIdNew !== cashAccountIdOriginal) {
                      const balanceCheck = await checkAccountBalance(
                        cashAccountIdNew,
                        editingPayment.amount,
                        editFields.payment_date || editingPayment.payment_date
                      )
                      
                      if (!balanceCheck.sufficient) {
                        toast({
                          title: appLang === 'en' ? 'Insufficient Balance' : 'رصيد غير كافٍ',
                          description: appLang === 'en'
                            ? `The account "${balanceCheck.accountName || 'Selected Account'}" has insufficient balance. Current balance: ${balanceCheck.currentBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}. Required: ${editingPayment.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}.`
                            : `رصيد الحساب "${balanceCheck.accountName || 'الحساب المختار'}" غير كافٍ. الرصيد الحالي: ${balanceCheck.currentBalance.toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}. المطلوب: ${editingPayment.amount.toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}.`,
                          variant: 'destructive'
                        })
                        setSaving(false)
                        return
                      }
                    }
                    
                    if (mapping && cashAccountIdNew) {
                      const { data: newEntry } = await supabase
                        .from("journal_entries").insert({
                          company_id: mapping.companyId,
                          reference_type: isCustomer ? "customer_payment" : "supplier_payment",
                          reference_id: null,
                          entry_date: editFields.payment_date || editingPayment.payment_date,
                          description: isCustomer ? `سداد عميل (${editFields.payment_method || editingPayment.payment_method || "cash"})` : `سداد مورّد (${editFields.payment_method || editingPayment.payment_method || "cash"})`,
                          branch_id: mapping.branchId!,
                          cost_center_id: mapping.costCenterId || null,
                        }).select().single()
                      if (newEntry?.id) {
                        const newCurrency = editingPayment.original_currency || editingPayment.currency_code || 'EGP'
                        const newExRate = editingPayment.exchange_rate_used || editingPayment.exchange_rate || 1
                        if (isCustomer) {
                          if (mapping.customerAdvance) {
                            await supabase.from("journal_entry_lines").insert([
                              { journal_entry_id: newEntry.id, account_id: cashAccountIdNew, debit_amount: editingPayment.amount, credit_amount: 0, description: "نقد/بنك", original_debit: editingPayment.amount, original_credit: 0, original_currency: newCurrency, exchange_rate_used: newExRate },
                              { journal_entry_id: newEntry.id, account_id: mapping.customerAdvance, debit_amount: 0, credit_amount: editingPayment.amount, description: "سلف من العملاء", original_debit: 0, original_credit: editingPayment.amount, original_currency: newCurrency, exchange_rate_used: newExRate },
                            ])
                          }
                        } else {
                          if (mapping.supplierAdvance) {
                            await supabase.from("journal_entry_lines").insert([
                              { journal_entry_id: newEntry.id, account_id: mapping.supplierAdvance, debit_amount: editingPayment.amount, credit_amount: 0, description: "سلف للموردين", original_debit: editingPayment.amount, original_credit: 0, original_currency: newCurrency, exchange_rate_used: newExRate },
                              { journal_entry_id: newEntry.id, account_id: cashAccountIdNew, debit_amount: 0, credit_amount: editingPayment.amount, description: "نقد/بنك", original_debit: 0, original_credit: editingPayment.amount, original_currency: newCurrency, exchange_rate_used: newExRate },
                            ])
                          }
                        }
                      }
                    }
                    if (!mapping || !cashAccountIdOriginal || !cashAccountIdNew || (isCustomer && !mapping?.customerAdvance) || (!isCustomer && !mapping?.supplierAdvance)) {
                      toast({ title: "تحذير", description: "تم حفظ التعديل لكن تعذر تسجيل قيود عكسية/مستحدثة لغياب إعدادات الحسابات.", variant: "default" })
                    }
                  } else {
                    // ✅ الدفعة مرتبطة بمستند: عند تغيير حساب النقد/البنك، يجب عكس القيد الأصلي بالكامل وإنشاء قيد جديد
                    const oldCashId = editingPayment.account_id || (mapping ? (mapping.cash || mapping.bank) : null)
                    const newCashId = editFields.account_id || (mapping ? (mapping.cash || mapping.bank) : null)
                    
                    if (mapping && oldCashId && newCashId && oldCashId !== newCashId) {
                      // 🔍 التحقق من رصيد الحساب الجديد قبل التعديل
                      const balanceCheck = await checkAccountBalance(
                        newCashId,
                        editingPayment.amount,
                        editFields.payment_date || editingPayment.payment_date
                      )
                      
                      if (!balanceCheck.sufficient) {
                        toast({
                          title: appLang === 'en' ? 'Cannot Change Payment Account' : 'لا يمكن تغيير حساب الدفع',
                          description: appLang === 'en'
                            ? `Cannot change payment account due to insufficient balance. Current balance: ${balanceCheck.currentBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}. Required: ${editingPayment.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}.`
                            : `لا يمكن تغيير حساب الدفع لعدم كفاية رصيد الحساب المحدد. الرصيد الحالي: ${balanceCheck.currentBalance.toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}. المطلوب: ${editingPayment.amount.toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}.`,
                          variant: 'destructive'
                        })
                        setSaving(false)
                        return
                      }
                      
                      const paymentCurrency = editingPayment.original_currency || editingPayment.currency_code || 'EGP'
                      const paymentExRate = editingPayment.exchange_rate_used || editingPayment.exchange_rate || 1
                      
                      // ✅ 1. البحث عن القيد الأصلي المرتبط بالدفعة
                      let originalEntryId: string | null = null
                      let originalEntryLines: any[] = []
                      
                      if (editingPayment.invoice_id) {
                        // البحث عن قيد invoice_payment
                        const { data: originalEntry } = await supabase
                          .from("journal_entries")
                          .select("id")
                          .eq("company_id", mapping.companyId)
                          .eq("reference_type", "invoice_payment")
                          .eq("reference_id", editingPayment.invoice_id)
                          .order("entry_date", { ascending: false })
                          .limit(1)
                          .maybeSingle()
                        
                        if (originalEntry?.id) {
                          originalEntryId = originalEntry.id
                          const { data: lines } = await supabase
                            .from("journal_entry_lines")
                            .select("*")
                            .eq("journal_entry_id", originalEntryId)
                          originalEntryLines = lines || []
                        }
                      } else if (editingPayment.bill_id) {
                        // البحث عن قيد bill_payment
                        const { data: originalEntry } = await supabase
                          .from("journal_entries")
                          .select("id")
                          .eq("company_id", mapping.companyId)
                          .eq("reference_type", "bill_payment")
                          .eq("reference_id", editingPayment.bill_id)
                          .order("entry_date", { ascending: false })
                          .limit(1)
                          .maybeSingle()
                        
                        if (originalEntry?.id) {
                          originalEntryId = originalEntry.id
                          const { data: lines } = await supabase
                            .from("journal_entry_lines")
                            .select("*")
                            .eq("journal_entry_id", originalEntryId)
                          originalEntryLines = lines || []
                        }
                      }
                      
                      // ✅ 2. عكس القيد الأصلي بالكامل (إن وجد)
                      if (originalEntryId && originalEntryLines.length > 0) {
                        const { data: revEntry } = await supabase
                        .from("journal_entries").insert({
                          company_id: mapping.companyId,
                            reference_type: isCustomer ? "invoice_payment_reversal" : "bill_payment_reversal",
                            reference_id: editingPayment.invoice_id || editingPayment.bill_id || null,
                          entry_date: editFields.payment_date || editingPayment.payment_date,
                            description: isCustomer 
                              ? `عكس قيد سداد فاتورة (تغيير حساب الدفع)`
                              : `عكس قيد سداد فاتورة مورد (تغيير حساب الدفع)`,
                          branch_id: mapping.branchId!,
                          cost_center_id: mapping.costCenterId || null,
                        }).select().single()
                        
                        if (revEntry?.id) {
                          // عكس جميع بنود القيد الأصلي
                          const reversedLines = originalEntryLines.map((line: any) => ({
                            journal_entry_id: revEntry.id,
                            account_id: line.account_id,
                            debit_amount: line.credit_amount, // عكس: مدين ← دائن
                            credit_amount: line.debit_amount,  // عكس: دائن ← مدين
                            description: `عكس: ${line.description || ""}`,
                            original_debit: line.original_credit || 0,
                            original_credit: line.original_debit || 0,
                            original_currency: line.original_currency || paymentCurrency,
                            exchange_rate_used: line.exchange_rate_used || paymentExRate,
                            branch_id: line.branch_id || mapping.branchId!,
                            cost_center_id: line.cost_center_id || null,
                          }))
                          
                          await supabase.from("journal_entry_lines").insert(reversedLines)
                        }
                      }
                      
                      // ✅ 3. إنشاء قيد جديد بالكامل بالحساب الجديد
                      const referenceId = editingPayment.invoice_id || editingPayment.bill_id || null
                      const referenceType = editingPayment.invoice_id ? "invoice_payment" : "bill_payment"
                      
                      // جلب بيانات المستند للحصول على branch_id و cost_center_id
                      let branchId = mapping.branchId || null
                      let costCenterId = mapping.costCenterId || null
                      
                      if (editingPayment.invoice_id) {
                        const { data: inv } = await supabase
                          .from("invoices")
                          .select("branch_id, cost_center_id, invoice_number")
                          .eq("id", editingPayment.invoice_id)
                          .maybeSingle()
                        if (inv) {
                          branchId = inv.branch_id || branchId
                          costCenterId = inv.cost_center_id || costCenterId
                        }
                      } else if (editingPayment.bill_id) {
                        const { data: bill } = await supabase
                          .from("bills")
                          .select("branch_id, cost_center_id, bill_number")
                          .eq("id", editingPayment.bill_id)
                          .maybeSingle()
                        if (bill) {
                          branchId = bill.branch_id || branchId
                          costCenterId = bill.cost_center_id || costCenterId
                        }
                      }
                      
                      const { data: newEntry } = await supabase
                        .from("journal_entries").insert({
                          company_id: mapping.companyId,
                          reference_type: referenceType,
                          reference_id: referenceId,
                          entry_date: editFields.payment_date || editingPayment.payment_date,
                          description: isCustomer 
                            ? `سداد فاتورة (حساب دفع محدث)`
                            : `سداد فاتورة مورد (حساب دفع محدث)`,
                          branch_id: branchId || mapping.branchId!,
                          cost_center_id: costCenterId,
                        }).select().single()
                      
                      if (newEntry?.id) {
                        // إنشاء بنود القيد الجديد
                        if (isCustomer && mapping.ar) {
                          // قيد سداد فاتورة عميل: Dr. Cash/Bank / Cr. AR
                          await supabase.from("journal_entry_lines").insert([
                            {
                              journal_entry_id: newEntry.id,
                              account_id: newCashId,
                              debit_amount: editingPayment.amount,
                              credit_amount: 0,
                              description: "نقد/بنك",
                              original_debit: editingPayment.amount,
                              original_credit: 0,
                              original_currency: paymentCurrency,
                              exchange_rate_used: paymentExRate,
                              branch_id: branchId,
                              cost_center_id: costCenterId,
                            },
                            {
                              journal_entry_id: newEntry.id,
                              account_id: mapping.ar,
                              debit_amount: 0,
                              credit_amount: editingPayment.amount,
                              description: "الذمم المدينة",
                              original_debit: 0,
                              original_credit: editingPayment.amount,
                              original_currency: paymentCurrency,
                              exchange_rate_used: paymentExRate,
                              branch_id: branchId,
                              cost_center_id: costCenterId,
                            },
                          ])
                        } else if (!isCustomer && mapping.ap) {
                          // قيد سداد فاتورة مورد: Dr. AP / Cr. Cash/Bank
                          await supabase.from("journal_entry_lines").insert([
                            {
                              journal_entry_id: newEntry.id,
                              account_id: mapping.ap,
                              debit_amount: editingPayment.amount,
                              credit_amount: 0,
                              description: "حسابات دائنة",
                              original_debit: editingPayment.amount,
                              original_credit: 0,
                              original_currency: paymentCurrency,
                              exchange_rate_used: paymentExRate,
                              branch_id: branchId,
                              cost_center_id: costCenterId,
                            },
                            {
                              journal_entry_id: newEntry.id,
                              account_id: newCashId,
                              debit_amount: 0,
                              credit_amount: editingPayment.amount,
                              description: "نقد/بنك",
                              original_debit: 0,
                              original_credit: editingPayment.amount,
                              original_currency: paymentCurrency,
                              exchange_rate_used: paymentExRate,
                              branch_id: branchId,
                              cost_center_id: costCenterId,
                            },
                          ])
                        }
                      }
                    }
                  }

                  // تحديث صف الدفعة
                  const { error: updErr } = await supabase.from("payments").update({
                    payment_date: editFields.payment_date || editingPayment.payment_date,
                    payment_method: editFields.payment_method || editingPayment.payment_method,
                    reference_number: editFields.reference_number || null,
                    notes: editFields.notes || null,
                    account_id: editFields.account_id || null,
                  }).eq("id", editingPayment.id)
                  if (updErr) throw updErr

                  toastActionSuccess(toast, "التحديث", "الدفعة")
                  setEditOpen(false)
                  setEditingPayment(null)

                  // 🔐 إعادة تحميل المدفوعات مع تطبيق الفلترة الصحيحة
                  await reloadPaymentsWithFilters()
                } catch (err) {
                  console.error("Error updating payment:", err)
                  toastActionError(toast, "التحديث", "الدفعة", "فشل تعديل الدفعة")
                } finally { setSaving(false) }
              }}>{appLang === 'en' ? 'Save' : 'حفظ'}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Payment Dialog */}
        <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{appLang === 'en' ? 'Delete Payment' : 'حذف الدفعة'}</DialogTitle>
            </DialogHeader>
            {deletingPayment && (
              <div className="space-y-3">
                {(deletingPayment.invoice_id || deletingPayment.bill_id || deletingPayment.purchase_order_id) ? (
                  <p className="text-amber-600">{appLang === 'en' ? 'Deletion will be handled professionally: reverse linked journals (invoice/bill/PO), update documents, then delete the payment.' : 'ستتم معالجة الحذف بشكل احترافي: سنعكس القيود المرتبطة (فاتورة/فاتورة مورد/أمر شراء)، ونُحدّث المستندات، ثم نحذف الدفعة.'}</p>
                ) : (
                  <p>{appLang === 'en' ? 'A reversal journal will be created for consistency, then the payment will be deleted.' : 'سيتم إنشاء قيد عكسي للحفاظ على الاتساق ثم حذف الدفعة نهائيًا.'}</p>
                )}
                <p className="text-sm text-gray-600 dark:text-gray-400">المبلغ: {Number(deletingPayment.amount || 0).toFixed(2)} | التاريخ: {deletingPayment.payment_date}</p>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => { setDeleteOpen(false); setDeletingPayment(null) }}>{appLang === 'en' ? 'Cancel' : 'إلغاء'}</Button>
              <Button variant="destructive" onClick={async () => {
                try {
                  if (!deletingPayment) return
                  if (!online) { toastActionError(toast, "الاتصال", "الحذف", "لا يوجد اتصال بالإنترنت"); return }
                  setSaving(true)
                  const mapping = await findAccountIds()
                  const isCustomer = !!deletingPayment.customer_id
                  const cashAccountId = deletingPayment.account_id || (mapping ? (mapping.cash || mapping.bank) : undefined)
                  let skipBaseReversal = false
                  // 1) إذا كانت الدفعة مرتبطة بمستند، نعكس القيود ونُحدّث المستند
                  if (deletingPayment.invoice_id) {
                    if (!mapping || !mapping.ar) throw new Error("غياب إعدادات الذمم المدينة (AR)")
                    const { data: inv } = await supabase.from("invoices").select("id, invoice_number, total_amount, paid_amount, status").eq("id", deletingPayment.invoice_id).single()
                    if (!inv) throw new Error("الفاتورة غير موجودة")
                    const { data: apps } = await supabase
                      .from("advance_applications")
                      .select("amount_applied")
                      .eq("payment_id", deletingPayment.id)
                      .eq("invoice_id", inv.id)
                    const applied = (apps || []).reduce((s: number, r: any) => s + Number(r.amount_applied || 0), 0)
                    if (applied > 0) {
                      const { data: revEntry } = await supabase
                        .from("journal_entries").insert({
                          company_id: mapping.companyId,
                          reference_type: "invoice_payment_reversal",
                          reference_id: inv.id,
                          entry_date: new Date().toISOString().slice(0, 10),
                          description: `عكس تطبيق دفعة على فاتورة ${inv.invoice_number}`,
                          branch_id: inv.branch_id || mapping.branchId!,
                          cost_center_id: inv.cost_center_id || mapping.costCenterId || null,
                        }).select().single()
                      if (revEntry?.id) {
                        const creditAdvanceId = mapping.customerAdvance || cashAccountId
                        const delCurrency = deletingPayment.original_currency || deletingPayment.currency_code || 'EGP'
                        const delExRate = deletingPayment.exchange_rate_used || deletingPayment.exchange_rate || 1
                        await supabase.from("journal_entry_lines").insert([
                          { journal_entry_id: revEntry.id, account_id: mapping.ar, debit_amount: applied, credit_amount: 0, description: "عكس ذمم مدينة", original_debit: applied, original_credit: 0, original_currency: delCurrency, exchange_rate_used: delExRate },
                          { journal_entry_id: revEntry.id, account_id: creditAdvanceId!, debit_amount: 0, credit_amount: applied, description: mapping.customerAdvance ? "عكس تسوية سلف العملاء" : "عكس نقد/بنك", original_debit: 0, original_credit: applied, original_currency: delCurrency, exchange_rate_used: delExRate },
                        ])
                      }
                      // تحديث الفاتورة
                      const newPaid = Math.max(Number(inv.paid_amount || 0) - applied, 0)
                      const newStatus = newPaid <= 0 ? "sent" : "partially_paid"
                      await supabase.from("invoices").update({ paid_amount: newPaid, status: newStatus }).eq("id", inv.id)
                      // إزالة سجلات التطبيق
                      await supabase.from("advance_applications").delete().eq("payment_id", deletingPayment.id).eq("invoice_id", inv.id)
                      // إزالة الربط من الدفعة
                      await supabase.from("payments").update({ invoice_id: null }).eq("id", deletingPayment.id)
                    } else {
                      // دفع مباشر على الفاتورة بدون سجلات سلفة: نعكس نقد/بنك -> ذمم مدينة
                      const { data: revEntryDirect } = await supabase
                        .from("journal_entries").insert({
                          company_id: mapping.companyId,
                          reference_type: "invoice_payment_reversal",
                          reference_id: inv.id,
                          entry_date: new Date().toISOString().slice(0, 10),
                          description: `عكس دفع مباشر للفاتورة ${inv.invoice_number}`,
                          branch_id: inv.branch_id || mapping.branchId!,
                          cost_center_id: inv.cost_center_id || mapping.costCenterId || null,
                        }).select().single()
                      if (revEntryDirect?.id && cashAccountId) {
                        const directCurrency = deletingPayment.original_currency || deletingPayment.currency_code || 'EGP'
                        const directExRate = deletingPayment.exchange_rate_used || deletingPayment.exchange_rate || 1
                        await supabase.from("journal_entry_lines").insert([
                          { journal_entry_id: revEntryDirect.id, account_id: mapping.ar, debit_amount: Number(deletingPayment.amount || 0), credit_amount: 0, description: "عكس الذمم المدينة", original_debit: Number(deletingPayment.amount || 0), original_credit: 0, original_currency: directCurrency, exchange_rate_used: directExRate },
                          { journal_entry_id: revEntryDirect.id, account_id: cashAccountId, debit_amount: 0, credit_amount: Number(deletingPayment.amount || 0), description: "عكس نقد/بنك", original_debit: 0, original_credit: Number(deletingPayment.amount || 0), original_currency: directCurrency, exchange_rate_used: directExRate },
                        ])
                      }
                      const newPaid = Math.max(Number(inv.paid_amount || 0) - Number(deletingPayment.amount || 0), 0)
                      const newStatus = newPaid <= 0 ? "sent" : "partially_paid"
                      await supabase.from("invoices").update({ paid_amount: newPaid, status: newStatus }).eq("id", inv.id)
                      await supabase.from("payments").update({ invoice_id: null }).eq("id", deletingPayment.id)
                      // لا نعكس القيد الأساسي لاحقًا لأن الدفعة لم تُسجّل كسلفة
                      skipBaseReversal = true
                    }
                  } else if (deletingPayment.bill_id) {
                    if (!mapping || !mapping.ap) throw new Error("غياب إعدادات الحسابات الدائنة (AP)")
                    const { data: bill } = await supabase.from("bills").select("id, bill_number, total_amount, paid_amount, status").eq("id", deletingPayment.bill_id).single()
                    if (!bill) throw new Error("فاتورة المورد غير موجودة")
                    const { data: apps } = await supabase
                      .from("advance_applications")
                      .select("amount_applied")
                      .eq("payment_id", deletingPayment.id)
                      .eq("bill_id", bill.id)
                    const applied = (apps || []).reduce((s: number, r: any) => s + Number(r.amount_applied || 0), 0)
                    if (applied > 0) {
                      const { data: revEntry } = await supabase
                        .from("journal_entries").insert({
                          company_id: mapping.companyId,
                          reference_type: "bill_payment_reversal",
                          reference_id: bill.id,
                          entry_date: new Date().toISOString().slice(0, 10),
                          description: `عكس تطبيق دفعة على فاتورة مورد ${bill.bill_number}`,
                          branch_id: bill.branch_id || mapping.branchId!,
                          cost_center_id: bill.cost_center_id || mapping.costCenterId || null,
                        }).select().single()
                      if (revEntry?.id) {
                        const debitAdvanceId = mapping.supplierAdvance || cashAccountId
                        const billDelCurrency = deletingPayment.original_currency || deletingPayment.currency_code || 'EGP'
                        const billDelExRate = deletingPayment.exchange_rate_used || deletingPayment.exchange_rate || 1
                        await supabase.from("journal_entry_lines").insert([
                          { journal_entry_id: revEntry.id, account_id: debitAdvanceId!, debit_amount: applied, credit_amount: 0, description: mapping.supplierAdvance ? "عكس تسوية سلف الموردين" : "عكس نقد/بنك", original_debit: applied, original_credit: 0, original_currency: billDelCurrency, exchange_rate_used: billDelExRate },
                          { journal_entry_id: revEntry.id, account_id: mapping.ap, debit_amount: 0, credit_amount: applied, description: "عكس حسابات دائنة", original_debit: 0, original_credit: applied, original_currency: billDelCurrency, exchange_rate_used: billDelExRate },
                        ])
                      }
                      const newPaid = Math.max(Number(bill.paid_amount || 0) - applied, 0)
                      const newStatus = newPaid <= 0 ? "sent" : "partially_paid"
                      await supabase.from("bills").update({ paid_amount: newPaid, status: newStatus }).eq("id", bill.id)
                      await supabase.from("advance_applications").delete().eq("payment_id", deletingPayment.id).eq("bill_id", bill.id)
                      await supabase.from("payments").update({ bill_id: null }).eq("id", deletingPayment.id)
                    }
                  } else if (deletingPayment.purchase_order_id) {
                    // عكس تطبيق الدفعة على أمر شراء: الأصل كان (سلف للموردين مدين / نقد دائن)
                    const { data: po } = await supabase.from("purchase_orders").select("id, po_number, total_amount, received_amount, status").eq("id", deletingPayment.purchase_order_id).single()
                    if (po && mapping) {
                      const { data: revEntry } = await supabase
                        .from("journal_entries").insert({
                          company_id: mapping.companyId,
                          reference_type: "po_payment_reversal",
                          reference_id: po.id,
                          entry_date: new Date().toISOString().slice(0, 10),
                          description: `عكس تطبيق دفعة على أمر شراء ${po.po_number}`,
                          branch_id: (po as any).branch_id || mapping.branchId!,
                          cost_center_id: (po as any).cost_center_id || mapping.costCenterId || null,
                        }).select().single()
                      if (revEntry?.id && cashAccountId && mapping.supplierAdvance) {
                        const poDelCurrency = deletingPayment.original_currency || deletingPayment.currency_code || 'EGP'
                        const poDelExRate = deletingPayment.exchange_rate_used || deletingPayment.exchange_rate || 1
                        await supabase.from("journal_entry_lines").insert([
                          { journal_entry_id: revEntry.id, account_id: cashAccountId, debit_amount: deletingPayment.amount, credit_amount: 0, description: "عكس نقد/بنك", original_debit: deletingPayment.amount, original_credit: 0, original_currency: poDelCurrency, exchange_rate_used: poDelExRate },
                          { journal_entry_id: revEntry.id, account_id: mapping.supplierAdvance, debit_amount: 0, credit_amount: deletingPayment.amount, description: "عكس سلف الموردين", original_debit: 0, original_credit: deletingPayment.amount, original_currency: poDelCurrency, exchange_rate_used: poDelExRate },
                        ])
                      }
                      const newReceived = Math.max(Number(po.received_amount || 0) - Number(deletingPayment.amount || 0), 0)
                      const newStatus = newReceived <= 0 ? "received_partial" : (newReceived >= Number(po.total_amount || 0) ? "received" : "received_partial")
                      await supabase.from("purchase_orders").update({ received_amount: newReceived, status: newStatus }).eq("id", po.id)
                      await supabase.from("payments").update({ purchase_order_id: null }).eq("id", deletingPayment.id)
                    }
                  }

                  // 2) عكس قيد إنشاء الدفعة (نقد/سلف) إن لم يكن دفعًا مباشرًا على الفاتورة
                  if (!skipBaseReversal && mapping && cashAccountId) {
                    const { data: revEntryBase } = await supabase
                      .from("journal_entries").insert({
                        company_id: mapping.companyId,
                        reference_type: isCustomer ? "customer_payment_deletion" : "supplier_payment_deletion",
                        reference_id: deletingPayment.id,
                        entry_date: new Date().toISOString().slice(0, 10),
                        description: isCustomer ? "حذف دفعة عميل" : "حذف دفعة مورد",
                        branch_id: mapping.branchId!,
                        cost_center_id: mapping.costCenterId || null,
                      }).select().single()
                    if (revEntryBase?.id) {
                      const baseDelCurrency = deletingPayment.original_currency || deletingPayment.currency_code || 'EGP'
                      const baseDelExRate = deletingPayment.exchange_rate_used || deletingPayment.exchange_rate || 1
                      if (isCustomer && mapping.customerAdvance) {
                        await supabase.from("journal_entry_lines").insert([
                          { journal_entry_id: revEntryBase.id, account_id: mapping.customerAdvance, debit_amount: deletingPayment.amount, credit_amount: 0, description: "عكس سلف العملاء", original_debit: deletingPayment.amount, original_credit: 0, original_currency: baseDelCurrency, exchange_rate_used: baseDelExRate },
                          { journal_entry_id: revEntryBase.id, account_id: cashAccountId, debit_amount: 0, credit_amount: deletingPayment.amount, description: "عكس نقد/بنك", original_debit: 0, original_credit: deletingPayment.amount, original_currency: baseDelCurrency, exchange_rate_used: baseDelExRate },
                        ])
                      } else if (!isCustomer && mapping.supplierAdvance) {
                        await supabase.from("journal_entry_lines").insert([
                          { journal_entry_id: revEntryBase.id, account_id: cashAccountId, debit_amount: deletingPayment.amount, credit_amount: 0, description: "عكس نقد/بنك", original_debit: deletingPayment.amount, original_credit: 0, original_currency: baseDelCurrency, exchange_rate_used: baseDelExRate },
                          { journal_entry_id: revEntryBase.id, account_id: mapping.supplierAdvance, debit_amount: 0, credit_amount: deletingPayment.amount, description: "عكس سلف الموردين", original_debit: 0, original_credit: deletingPayment.amount, original_currency: baseDelCurrency, exchange_rate_used: baseDelExRate },
                        ])
                      }
                    }
                  }
                  if (!mapping || !cashAccountId) {
                    toast({ title: "تحذير", description: "تم حذف الدفعة لكن تعذر تسجيل بعض القيود لغياب إعدادات الحسابات.", variant: "default" })
                  }
                  const { error: delErr } = await supabase.from("payments").delete().eq("id", deletingPayment.id)
                  if (delErr) {
                    // رمز 23503 يعبّر عادة عن قيود مفاتيح خارجية
                    if ((delErr as any).code === "23503") {
                      toastActionError(toast, "الحذف", "الدفعة", "تعذر حذف الدفعة لارتباطها بسجلات أخرى")
                      return
                    }
                    throw delErr
                  }
                  toastActionSuccess(toast, "الحذف", "الدفعة")
                  setDeleteOpen(false)
                  setDeletingPayment(null)
                  if (!companyId) return
                  // 🔐 إعادة تحميل المدفوعات مع تطبيق الفلترة الصحيحة
                  await reloadPaymentsWithFilters()
                } catch (err) {
                  console.error("Error deleting payment:", err)
                  toastActionError(toast, "الحذف", "الدفعة", "فشل حذف الدفعة")
                } finally { setSaving(false) }
              }}>{appLang === 'en' ? 'Confirm Delete' : 'تأكيد الحذف'}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Apply to Invoice Dialog */}
        <Dialog open={applyInvoiceOpen} onOpenChange={setApplyInvoiceOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{appLang === 'en' ? 'Apply payment to invoice' : 'تطبيق دفعة على فاتورة'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>{appLang === 'en' ? 'Document' : 'الوثيقة'}</Label>
                <select className="w-full border rounded px-2 py-1" value={applyDocId} onChange={(e) => setApplyDocId(e.target.value)}>
                  <option value="">{appLang === 'en' ? 'Select an invoice' : 'اختر فاتورة'}</option>
                  {customerInvoices.map((inv) => {
                    const outstanding = Math.max(Number(inv.total_amount || 0) - Number(inv.paid_amount || 0), 0)
                    return (
                      <option key={inv.id} value={inv.id}>
                        {inv.invoice_number} — {appLang === 'en' ? 'Remaining' : 'متبقّي'} {outstanding.toFixed(2)}
                      </option>
                    )
                  })}
                </select>
              </div>
              <div>
                <Label>{appLang === 'en' ? 'Amount to apply' : 'المبلغ للتطبيق'}</Label>
                <NumericInput min={0} step={0.01} value={applyAmount} onChange={(val) => setApplyAmount(val)} decimalPlaces={2} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setApplyInvoiceOpen(false)}>{appLang === 'en' ? 'Cancel' : 'إلغاء'}</Button>
              <Button onClick={applyPaymentToInvoice} disabled={saving || !applyDocId || applyAmount <= 0}>{appLang === 'en' ? 'Apply' : 'تطبيق'}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Apply to PO Dialog */}
        <Dialog open={applyPoOpen} onOpenChange={setApplyPoOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{appLang === 'en' ? 'Apply payment to purchase order' : 'تطبيق سداد على أمر شراء'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>{appLang === 'en' ? 'Document' : 'الوثيقة'}</Label>
                <select className="w-full border rounded px-2 py-1" value={applyDocId} onChange={(e) => setApplyDocId(e.target.value)}>
                  <option value="">{appLang === 'en' ? 'Select a purchase order' : 'اختر أمر شراء'}</option>
                  {supplierPOs.map((po) => {
                    const outstanding = Math.max(Number(po.total_amount || 0) - Number(po.received_amount || 0), 0)
                    return (
                      <option key={po.id} value={po.id}>
                        {po.po_number} — {appLang === 'en' ? 'Remaining' : 'متبقّي'} {outstanding.toFixed(2)}
                      </option>
                    )
                  })}
                </select>
              </div>
              <div>
                <Label>{appLang === 'en' ? 'Amount to apply' : 'المبلغ للتطبيق'}</Label>
                <NumericInput min={0} step={0.01} value={applyAmount} onChange={(val) => setApplyAmount(val)} decimalPlaces={2} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setApplyPoOpen(false)}>{appLang === 'en' ? 'Cancel' : 'إلغاء'}</Button>
              <Button onClick={applyPaymentToPO} disabled={saving || !applyDocId || applyAmount <= 0}>{appLang === 'en' ? 'Apply' : 'تطبيق'}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Apply to Bill Dialog */}
        <Dialog open={applyBillOpen} onOpenChange={setApplyBillOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{appLang === 'en' ? 'Apply payment to supplier bill' : 'تطبيق سداد على فاتورة مورد'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>{appLang === 'en' ? 'Document' : 'الوثيقة'}</Label>
                <select className="w-full border rounded px-2 py-1" value={applyDocId} onChange={(e) => setApplyDocId(e.target.value)}>
                  <option value="">{appLang === 'en' ? 'Select a bill' : 'اختر فاتورة'}</option>
                  {supplierBills.map((b) => {
                    const outstanding = Math.max(Number(b.total_amount || 0) - Number(b.paid_amount || 0), 0)
                    return (
                      <option key={b.id} value={b.id}>
                        {b.bill_number} — {appLang === 'en' ? 'Remaining' : 'متبقّي'} {outstanding.toFixed(2)}
                      </option>
                    )
                  })}
                </select>
              </div>
              <div>
                <Label>{appLang === 'en' ? 'Amount to apply' : 'المبلغ للتطبيق'}</Label>
                <NumericInput min={0} step={0.01} value={applyAmount} onChange={(val) => setApplyAmount(val)} decimalPlaces={2} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setApplyBillOpen(false)}>{appLang === 'en' ? 'Cancel' : 'إلغاء'}</Button>
              <Button onClick={applyPaymentToBill} disabled={saving || !applyDocId || applyAmount <= 0}>{appLang === 'en' ? 'Apply' : 'تطبيق'}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ✅ Rejection Reason Dialog */}
        <Dialog open={rejectOpen} onOpenChange={(open) => { setRejectOpen(open); if (!open) { setRejectingPayment(null); setRejectionReason("") } }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{appLang === 'en' ? '❌ Reject Payment' : '❌ رفض الدفعة'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {appLang === 'en'
                  ? `You are about to reject a payment of ${Number(rejectingPayment?.amount || 0).toFixed(2)}. Please provide a reason (required).`
                  : `أنت على وشك رفض دفعة بمبلغ ${Number(rejectingPayment?.amount || 0).toFixed(2)}. يرجى توضيح سبب الرفض (إلزامي).`}
              </p>
              <div>
                <Label>{appLang === 'en' ? 'Rejection Reason' : 'سبب الرفض'} *</Label>
                <textarea
                  className="w-full border rounded px-3 py-2 text-sm mt-1 min-h-[80px] dark:bg-slate-800 dark:border-slate-600"
                  placeholder={appLang === 'en' ? 'Enter reason for rejection...' : 'أدخل سبب الرفض...'}
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setRejectOpen(false); setRejectingPayment(null); setRejectionReason("") }}>
                {appLang === 'en' ? 'Cancel' : 'إلغاء'}
              </Button>
              <Button variant="destructive" disabled={saving || !rejectionReason.trim()} onClick={rejectPayment}>
                {saving ? (appLang === 'en' ? 'Rejecting...' : 'جاري الرفض...') : (appLang === 'en' ? 'Confirm Rejection' : 'تأكيد الرفض')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </main>
      
      <PaymentDetailsModal 
        paymentId={selectedPaymentDetailsId} 
        isOpen={!!selectedPaymentDetailsId} 
        onClose={() => setSelectedPaymentDetailsId(null)} 
        appLang={appLang} 
      />
    </div>
  )
}
