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

import { useEffect, useState, useTransition } from "react"
import { Sidebar } from "@/components/sidebar"
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

interface Customer { id: string; name: string; phone?: string | null }
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
}
interface InvoiceRow { id: string; invoice_number: string; invoice_date?: string; total_amount: number; paid_amount: number; status: string }
interface PORow { id: string; po_number: string; total_amount: number; received_amount: number; status: string }
interface BillRow { id: string; bill_number: string; bill_date?: string; total_amount: number; paid_amount: number; status: string }
interface Account { id: string; account_code: string; account_name: string; account_type: string }

export default function PaymentsPage() {
  const supabase = useSupabase()
  const { toast } = useToast()
  const [appLang, setAppLang] = useState<'ar' | 'en'>('ar')
  const [online, setOnline] = useState<boolean>(true)
  const [customers, setCustomers] = useState<Customer[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [customerPayments, setCustomerPayments] = useState<Payment[]>([])
  const [supplierPayments, setSupplierPayments] = useState<Payment[]>([])
  const [invoiceNumbers, setInvoiceNumbers] = useState<Record<string, string>>({})
  const [billNumbers, setBillNumbers] = useState<Record<string, string>>({})
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

  // === إصلاح أمني: صلاحيات التعديل والحذف ===
  const [permUpdate, setPermUpdate] = useState(false)
  const [permDelete, setPermDelete] = useState(false)
  const [permWrite, setPermWrite] = useState(false)

  // 🔐 ERP Access Control - سياق المستخدم
  const [userContext, setUserContext] = useState<UserContext | null>(null)
  const [canOverrideContext, setCanOverrideContext] = useState(false)

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
    const handleCurrencyChange = () => {
      const newCurrency = localStorage.getItem('app_currency') || 'EGP'
      setPaymentCurrency(newCurrency)
      // Trigger data reload by dispatching event
      window.location.reload()
    }
    window.addEventListener('app_currency_changed', handleCurrencyChange)
    return () => window.removeEventListener('app_currency_changed', handleCurrencyChange)
  }, [])

  useEffect(() => {
    ; (async () => {
      try {
        setLoading(true)
        const activeCompanyId = await getActiveCompanyId(supabase)
        if (!activeCompanyId) return
        setCompanyId(activeCompanyId)

        // 🔐 ERP Access Control - جلب سياق المستخدم
        const { data: { user } } = await supabase.auth.getUser()
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
          const role = isOwner ? "owner" : (memberData?.role || "viewer")

          const context: UserContext = {
            user_id: user.id,
            company_id: activeCompanyId,
            branch_id: isOwner ? null : (memberData?.branch_id || null),
            cost_center_id: isOwner ? null : (memberData?.cost_center_id || null),
            warehouse_id: isOwner ? null : (memberData?.warehouse_id || null),
            role: role,
          }
          setUserContext(context)
          setCanOverrideContext(["owner", "admin", "manager"].includes(role))
        }

        // Load currencies from database
        const dbCurrencies = await getActiveCurrencies(supabase, activeCompanyId)
        if (dbCurrencies.length > 0) {
          setCurrencies(dbCurrencies)
          const base = dbCurrencies.find(c => c.is_base)
          if (base) setBaseCurrency(base.code)
        }

        // 🔐 ERP Access Control - جلب العملاء مع تطبيق الصلاحيات
        const accessFilter = getAccessFilter(
          userContext?.role || 'viewer',
          user?.id || '',
          userContext?.branch_id || null,
          userContext?.cost_center_id || null
        );

        let allCustomers: Customer[] = [];
        if (accessFilter.filterByCreatedBy && accessFilter.createdByUserId) {
          // موظف عادي: يرى فقط العملاء الذين أنشأهم
          const { data: ownCust } = await supabase.from("customers").select("id, name, phone").eq("company_id", activeCompanyId).eq("created_by_user_id", accessFilter.createdByUserId);
          allCustomers = ownCust || [];
          // جلب العملاء المشتركين
          const { data: sharedPerms } = await supabase.from("permission_sharing").select("grantor_user_id").eq("grantee_user_id", user?.id || '').eq("company_id", activeCompanyId).eq("is_active", true).or("resource_type.eq.all,resource_type.eq.customers");
          if (sharedPerms && sharedPerms.length > 0) {
            const grantorIds = sharedPerms.map((p: any) => p.grantor_user_id);
            const { data: sharedCust } = await supabase.from("customers").select("id, name, phone").eq("company_id", activeCompanyId).in("created_by_user_id", grantorIds);
            const existingIds = new Set(allCustomers.map(c => c.id));
            (sharedCust || []).forEach((c: Customer) => { if (!existingIds.has(c.id)) allCustomers.push(c); });
          }
        } else if (accessFilter.filterByBranch && accessFilter.branchId) {
          const { data: branchCust } = await supabase.from("customers").select("id, name, phone").eq("company_id", activeCompanyId).eq("branch_id", accessFilter.branchId);
          allCustomers = branchCust || [];
        } else {
          const { data: allCust } = await supabase.from("customers").select("id, name, phone").eq("company_id", activeCompanyId);
          allCustomers = allCust || [];
        }
        setCustomers(allCustomers)
        const { data: supps, error: suppsErr } = await supabase.from("suppliers").select("id, name").eq("company_id", activeCompanyId)
        if (suppsErr) {
          toastActionError(toast, "الجلب", "الموردين", "تعذر جلب قائمة الموردين")
        }
        setSuppliers(supps || [])
        // 🔐 ERP Access Control - جلب الحسابات مع تصفية حسب سياق المستخدم
        let accountsQuery = supabase
          .from("chart_of_accounts")
          .select("id, account_code, account_name, account_type, branch_id, cost_center_id")
          .eq("company_id", activeCompanyId)

        const { data: accs, error: accsErr } = await accountsQuery
        if (accsErr) {
          toastActionError(toast, "الجلب", "شجرة الحسابات", "تعذر جلب الحسابات")
        }
        // نرشّح الحسابات ذات النوع أصل (مثل النقد والبنك)
        // مع تصفية حسب الفرع ومركز التكلفة للمستخدم
        const assetAccounts = (accs || []).filter((a: any) => (a.account_type || "").toLowerCase() === "asset")

        // تصفية الحسابات حسب سياق المستخدم (للأدوار غير المديرة)
        const { data: memberData2 } = await supabase
          .from("company_members")
          .select("role, branch_id, cost_center_id")
          .eq("company_id", activeCompanyId)
          .eq("user_id", user?.id || "")
          .maybeSingle()

        const userRole = memberData2?.role || "staff"
        const canOverrideAccounts = ["owner", "admin", "manager"].includes(userRole)

        const filteredAccounts = canOverrideAccounts ? assetAccounts : assetAccounts.filter((a: any) => {
          // إذا الحساب ليس له فرع محدد، يمكن للجميع استخدامه
          if (!a.branch_id) return true
          // إذا المستخدم ليس له فرع محدد، يمكنه رؤية كل الحسابات
          if (!memberData2?.branch_id) return true
          // تحقق من تطابق الفرع
          if (a.branch_id !== memberData2.branch_id) return false
          // تحقق من مركز التكلفة إذا كان محدداً
          if (a.cost_center_id && memberData2?.cost_center_id && a.cost_center_id !== memberData2.cost_center_id) return false
          return true
        })

        setAccounts(filteredAccounts)

        const { data: custPays, error: custPaysErr } = await supabase
          .from("payments")
          .select("*")
          .eq("company_id", activeCompanyId)
          .not("customer_id", "is", null)
          .order("payment_date", { ascending: false })
        if (custPaysErr) {
          toastActionError(toast, "الجلب", "مدفوعات العملاء", "تعذر جلب مدفوعات العملاء")
        }
        setCustomerPayments(custPays || [])

        const { data: suppPays, error: suppPaysErr } = await supabase
          .from("payments")
          .select("*")
          .eq("company_id", activeCompanyId)
          .not("supplier_id", "is", null)
          .order("payment_date", { ascending: false })
        if (suppPaysErr) {
          toastActionError(toast, "الجلب", "مدفوعات الموردين", "تعذر جلب مدفوعات الموردين")
        }
        setSupplierPayments(suppPays || [])
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  // 🔄 الاستماع لتغيير الشركة وإعادة تحميل الصفحة
  useEffect(() => {
    const handleCompanyChange = () => {
      window.location.reload();
    };
    window.addEventListener('company_updated', handleCompanyChange);
    return () => window.removeEventListener('company_updated', handleCompanyChange);
  }, []);

  // Load invoice numbers for displayed customer payments
  useEffect(() => {
    ; (async () => {
      try {
        const ids = Array.from(new Set((customerPayments || []).map((p) => p.invoice_id).filter(Boolean))) as string[]
        if (!ids.length) { setInvoiceNumbers({}); return }
        const { data: invs } = await supabase.from("invoices").select("id, invoice_number").in("id", ids)
        const map: Record<string, string> = {}
          ; (invs || []).forEach((r: any) => { map[r.id] = r.invoice_number })
        setInvoiceNumbers(map)
      } catch (e) { /* ignore */ }
    })()
  }, [customerPayments])

  // Load bill numbers for displayed supplier payments
  useEffect(() => {
    ; (async () => {
      try {
        const ids = Array.from(new Set((supplierPayments || []).map((p) => p.bill_id).filter(Boolean))) as string[]
        if (!ids.length) { setBillNumbers({}); return }
        const { data: bills } = await supabase.from("bills").select("id, bill_number").in("id", ids)
        const map: Record<string, string> = {}
          ; (bills || []).forEach((r: any) => { map[r.id] = r.bill_number })
        setBillNumbers(map)
      } catch (e) { /* ignore */ }
    })()
  }, [supplierPayments])

  // جلب فواتير العميل غير المسددة بالكامل عند اختيار عميل في نموذج إنشاء دفعة
  useEffect(() => {
    ; (async () => {
      try {
        setSelectedFormInvoiceId("")
        if (!newCustPayment.customer_id) { setFormCustomerInvoices([]); return }
        const { data: invs } = await supabase
          .from("invoices")
          .select("id, invoice_number, invoice_date, total_amount, paid_amount, status")
          .eq("customer_id", newCustPayment.customer_id)
          .in("status", ["sent", "partially_paid", "partially_returned"]) // غير مسددة بالكامل (بما فيها المرتجعة جزئياً)
          .order("invoice_date", { ascending: false })
        setFormCustomerInvoices(invs || [])
      } catch (e) { /* ignore */ }
    })()
  }, [newCustPayment.customer_id])

  // جلب فواتير المورد غير المسددة بالكامل عند اختيار مورد في نموذج إنشاء دفعة
  useEffect(() => {
    ; (async () => {
      try {
        setSelectedFormBillId("")
        if (!newSuppPayment.supplier_id) { setFormSupplierBills([]); return }
        const { data: bills } = await supabase
          .from("bills")
          .select("id, bill_number, bill_date, total_amount, paid_amount, status")
          .eq("supplier_id", newSuppPayment.supplier_id)
          .in("status", ["sent", "received", "partially_paid", "partially_returned"]) // قابلة للدفع (بما فيها المرتجعة جزئياً)
          .order("bill_date", { ascending: false })
        setFormSupplierBills(bills || [])
      } catch (e) { /* ignore */ }
    })()
  }, [newSuppPayment.supplier_id])

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
        if (cashAccountId && advanceId) {
          const { data: entry } = await supabase
            .from("journal_entries").insert({
              company_id: mapping.companyId,
              reference_type: "customer_payment",
              reference_id: null,
              entry_date: newCustPayment.date,
              description: `سداد عميل كسلفة(${newCustPayment.method})`,
              branch_id: mapping.branchId || null,
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
      setNewCustPayment({ customer_id: "", amount: 0, date: newCustPayment.date, method: "cash", ref: "", notes: "", account_id: "" })
      toastActionSuccess(toast, "الإنشاء", "الدفعة")
      // reload list
      const { data: custPays } = await supabase
        .from("payments").select("*")
        .eq("company_id", companyId)
        .not("customer_id", "is", null)
        .order("payment_date", { ascending: false })
      setCustomerPayments(custPays || [])
      // إذا اختار المستخدم فاتورة من الجدول في النموذج: اربط أحدث دفعة عميل بهذه الفاتورة مباشرة
      if (selectedFormInvoiceId && custPays && custPays.length > 0) {
        const latest = custPays.find((p: any) => p.customer_id === newCustPayment.customer_id && !p.invoice_id) || custPays[0]
        try {
          await applyPaymentToInvoiceWithOverrides(latest as any, selectedFormInvoiceId, Number(latest?.amount || newCustPayment.amount || 0))
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

      if (!newSuppPayment.supplier_id || newSuppPayment.amount <= 0) return
      if (!companyId) return

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
      const basePayload: any = {
        company_id: companyId,
        supplier_id: newSuppPayment.supplier_id,
        payment_date: newSuppPayment.date,
        amount: newSuppPayment.amount,
        payment_method: newSuppPayment.method,
        reference_number: newSuppPayment.ref || null,
        notes: newSuppPayment.notes || null,
        account_id: newSuppPayment.account_id || null,
        // Multi-currency support - store original and converted values
        currency_code: paymentCurrency,
        exchange_rate: exchangeRate,
        exchange_rate_used: exchangeRate,
        exchange_rate_id: exchangeRateId || null, // Reference to exchange_rates table
        rate_source: rateSource, // 'api', 'manual', 'database'
        base_currency_amount: paymentCurrency !== baseCurrency ? newSuppPayment.amount * exchangeRate : newSuppPayment.amount,
        // Store original values (never modified)
        original_amount: newSuppPayment.amount,
        original_currency: paymentCurrency,
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
      // إذا تم اختيار فاتورة للربط المباشر: لا ننشئ قيد سلفة، بل سنربط الدفعة بالفاتورة
      // وقيد الدفع سيكون: مدين حسابات دائنة / دائن النقد
      // إذا لم يتم اختيار فاتورة: ننشئ قيد سلفة (مدين سلف للموردين / دائن النقد)

      const mapping = await findAccountIds()
      const willLinkToBill = !!selectedFormBillId // هل سيتم الربط بفاتورة؟

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
              branch_id: mapping.branchId || null,
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

  const findAccountIds = async () => {
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

    return { companyId, ar, ap, cash, bank, revenue, inventory, cogs, vatPayable, shippingAccount, supplierAdvance, customerAdvance }
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
      .select("id, bill_number, total_amount, paid_amount, status")
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

      const { data: custPays } = await supabase
        .from("payments").select("*")
        .eq("company_id", mapping.companyId)
        .not("customer_id", "is", null)
        .order("payment_date", { ascending: false })
      setCustomerPayments(custPays || [])
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
          branch_id: invoiceData?.branch_id || null,
          cost_center_id: invoiceData?.cost_center_id || null,
        })
        .select()
        .single()

      if (!invError && invEntry) {
        await supabase.from("journal_entry_lines").insert([
          { journal_entry_id: invEntry.id, account_id: mapping.ar, debit_amount: Number(inv.total_amount || 0), credit_amount: 0, description: "الذمم المدينة", branch_id: invoiceData?.branch_id || null, cost_center_id: invoiceData?.cost_center_id || null },
          { journal_entry_id: invEntry.id, account_id: mapping.revenue, debit_amount: 0, credit_amount: Number(inv.total_amount || 0), description: "إيرادات المبيعات", branch_id: invoiceData?.branch_id || null, cost_center_id: invoiceData?.cost_center_id || null },
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
          branch_id: bill.branch_id || null,
          cost_center_id: bill.cost_center_id || null,
        }).select().single()

      if (billEntryErr) {
        console.error("Error creating bill journal entry:", billEntryErr)
        return
      }

      const invOrExp = mapping.inventory || mapping.cogs
      const billLines: any[] = []

      // Debit: المخزون أو المصروفات (المجموع الفرعي)
      if (invOrExp && Number(bill.subtotal || 0) > 0) {
        billLines.push({
          journal_entry_id: billEntry.id,
          account_id: invOrExp,
          debit_amount: Number(bill.subtotal || 0),
          credit_amount: 0,
          description: mapping.inventory ? "المخزون" : "تكلفة البضاعة المباعة",
          original_debit: Number(bill.subtotal || 0),
          original_credit: 0,
          original_currency: billCurrency,
          exchange_rate_used: billExRate
        })
      }

      // Debit: الضريبة (إن وجدت)
      if (Number(bill.tax_amount || 0) > 0) {
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
            debit_amount: Number(bill.tax_amount || 0),
            credit_amount: 0,
            description: "ضريبة المدخلات",
            original_debit: Number(bill.tax_amount || 0),
            original_credit: 0,
            original_currency: billCurrency,
            exchange_rate_used: billExRate
          })
        }
      }

      // Credit: الحسابات الدائنة (الإجمالي)
      billLines.push({
        journal_entry_id: billEntry.id,
        account_id: mapping.ap,
        debit_amount: 0,
        credit_amount: Number(bill.total_amount || 0),
        description: "حسابات دائنة",
        original_debit: 0,
        original_credit: Number(bill.total_amount || 0),
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
          branch_id: invoiceData?.branch_id || null,
          cost_center_id: invoiceData?.cost_center_id || null,
        })
        .select()
        .single()

      if (!payError && payEntry) {
        // قيد السداد: Debit Cash / Credit AR
        await supabase.from("journal_entry_lines").insert([
          { journal_entry_id: payEntry.id, account_id: cashAccountId, debit_amount: paymentAmount, credit_amount: 0, description: "نقد/بنك", branch_id: invoiceData?.branch_id || null, cost_center_id: invoiceData?.cost_center_id || null },
          { journal_entry_id: payEntry.id, account_id: mapping.ar, debit_amount: 0, credit_amount: paymentAmount, description: "الذمم المدينة", branch_id: invoiceData?.branch_id || null, cost_center_id: invoiceData?.cost_center_id || null },
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
        if (invoiceRate !== payExRate2 && companyId) {
          const fxResult = calculateFXGainLoss(amount, invoiceRate, payExRate2)
          if (fxResult.hasGainLoss && Math.abs(fxResult.amount) >= 0.01) {
            await createFXGainLossEntry(supabase, companyId, fxResult, 'payment', selectedPayment.id, '', '', '', `فرق صرف - فاتورة ${inv.invoice_number}`, paymentCurrency)
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
        const { data: custPays } = await supabase
          .from("payments").select("*")
          .eq("company_id", mapping.companyId)
          .not("customer_id", "is", null)
          .order("payment_date", { ascending: false })
        startTransition(() => {
          setCustomerPayments(custPays || [])
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
          branch_id: po.branch_id || null,
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
      const remaining = Math.max(Number(bill.total_amount || 0) - Number(bill.paid_amount || 0), 0)
      const amount = Math.min(applyAmount, remaining)

      // 🔍 التحقق من كفاية الرصيد قبل تطبيق الدفعة
      const paymentAccountId = selectedPayment.account_id || mapping.cash || mapping.bank
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
        const { error: payErr } = await supabase.from("payments").update({ bill_id: bill.id }).eq("id", selectedPayment.id)
        if (payErr) throw payErr
      }
      {
        const newPaid = originalPaid + amount
        const newStatus = newPaid >= Number(bill.total_amount || 0) ? "paid" : "partially_paid"
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
            branch_id: bill.branch_id || null,
            cost_center_id: bill.cost_center_id || null,
          }).select().single()
        if (billEntryErr) throw billEntryErr

        const invOrExp = mapping.inventory || mapping.cogs
        const billLines: any[] = []

        // Debit: المخزون أو المصروفات (المجموع الفرعي)
        if (invOrExp && Number(bill.subtotal || 0) > 0) {
          billLines.push({
            journal_entry_id: billEntry.id,
            account_id: invOrExp,
            debit_amount: Number(bill.subtotal || 0),
            credit_amount: 0,
            description: mapping.inventory ? "المخزون" : "تكلفة البضاعة المباعة",
            original_debit: Number(bill.subtotal || 0),
            original_credit: 0,
            original_currency: billCurrency,
            exchange_rate_used: billExRate
          })
        }

        // Debit: الضريبة (إن وجدت)
        if (Number(bill.tax_amount || 0) > 0) {
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
              debit_amount: Number(bill.tax_amount || 0),
              credit_amount: 0,
              description: "ضريبة المدخلات",
              original_debit: Number(bill.tax_amount || 0),
              original_credit: 0,
              original_currency: billCurrency,
              exchange_rate_used: billExRate
            })
          }
        }

        // Debit: الشحن (إن وجد)
        if (Number(bill.shipping_charge || 0) > 0 && mapping.shippingAccount) {
          billLines.push({
            journal_entry_id: billEntry.id,
            account_id: mapping.shippingAccount,
            debit_amount: Number(bill.shipping_charge || 0),
            credit_amount: 0,
            description: "مصاريف الشحن",
            original_debit: Number(bill.shipping_charge || 0),
            original_credit: 0,
            original_currency: billCurrency,
            exchange_rate_used: billExRate
          })
        }

        // Credit: الحسابات الدائنة (الإجمالي)
        billLines.push({
          journal_entry_id: billEntry.id,
          account_id: mapping.ap,
          debit_amount: 0,
          credit_amount: Number(bill.total_amount || 0),
          description: "حسابات دائنة",
          original_debit: 0,
          original_credit: Number(bill.total_amount || 0),
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
          branch_id: bill.branch_id || null,
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
      if (!mapping || !mapping.ap || !mapping.cash) return
      const { data: bill } = await supabase.from("bills").select("*").eq("id", billId).single()
      if (!bill) return
      const remaining = Math.max(Number(bill.total_amount || 0) - Number(bill.paid_amount || 0), 0)
      const amount = Math.min(rawAmount, remaining)

      // Track state for potential rollback
      const originalPaid = Number(bill.paid_amount || 0)
      const isFirstPayment = originalPaid === 0 && (bill.status === 'sent' || bill.status === 'received')
      let linkedPayment = false

      // 1) Link payment first to avoid updating bill when link fails (RLS/constraints)
      {
        const { error: payErr } = await supabase.from("payments").update({ bill_id: bill.id }).eq("id", payment.id)
        if (payErr) throw payErr
        linkedPayment = true
      }

      // 2) Update bill totals/status
      {
        const newPaid = originalPaid + amount
        const newStatus = newPaid >= Number(bill.total_amount || 0) ? "paid" : "partially_paid"
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
          branch_id: bill.branch_id || null,
          cost_center_id: bill.cost_center_id || null,
        }).select().single()
      if (payEntryErr) throw payEntryErr

      const { error: payLinesErr } = await supabase.from("journal_entry_lines").insert([
        { journal_entry_id: payEntry.id, account_id: mapping.ap, debit_amount: amount, credit_amount: 0, description: "حسابات دائنة", original_debit: amount, original_credit: 0, original_currency: billCurrency2, exchange_rate_used: billExRate2 },
        { journal_entry_id: payEntry.id, account_id: creditAccountId2, debit_amount: 0, credit_amount: amount, description: creditDescription2, original_debit: 0, original_credit: amount, original_currency: billCurrency2, exchange_rate_used: billExRate2 },
      ])
      if (payLinesErr) throw payLinesErr
      console.log(`✅ تم إنشاء قيد السداد للفاتورة ${bill.bill_number} - مبلغ: ${amount}`)

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
        <Sidebar />
        <main className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8">
          <p className="py-8 text-center">{appLang === 'en' ? 'Loading...' : 'جاري التحميل...'}</p>
        </main>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
      <Sidebar />
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
              <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-0.5 sm:mt-1 truncate">{appLang === 'en' ? 'Customer/supplier payments' : 'مدفوعات العملاء والموردين'}</p>
            </div>
          </div>
          {!online && (
            <div className="mt-3 sm:mt-4 p-2 sm:p-3 rounded border border-amber-300 bg-amber-50 text-amber-700 text-xs sm:text-sm">
              {appLang === 'en' ? 'Offline - Save actions disabled' : 'غير متصل - التخزين معطّل'}
            </div>
          )}
        </div>

        <Card>
          <CardContent className="pt-6 space-y-6">
            <h2 className="text-xl font-semibold">{appLang === 'en' ? 'Customer Payments' : 'مدفوعات العملاء'}</h2>
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
                      <tr><td colSpan={6} className="px-2 py-2 text-center text-gray-500 dark:text-gray-400">{appLang === 'en' ? 'No unpaid invoices for this customer' : 'لا توجد فواتير غير مسددة بالكامل لهذا العميل'}</td></tr>
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
                    <th className="px-2 py-2 text-right">{appLang === 'en' ? 'Amount' : 'المبلغ'}</th>
                    <th className="px-2 py-2 text-right">{appLang === 'en' ? 'Reference' : 'مرجع'}</th>
                    <th className="px-2 py-2 text-right">{appLang === 'en' ? 'Linked Invoice' : 'الفاتورة المرتبطة'}</th>
                    <th className="px-2 py-2 text-right">{appLang === 'en' ? 'Action' : 'إجراء'}</th>
                  </tr>
                </thead>
                <tbody>
                  {customerPayments.map((p) => (
                    <tr key={p.id} className="border-b">
                      <td className="px-2 py-2">{p.payment_date}</td>
                      <td className="px-2 py-2">{getDisplayAmount(p).toFixed(2)} {currencySymbol}</td>
                      <td className="px-2 py-2">{p.reference_number || "-"}</td>
                      <td className="px-2 py-2">
                        {p.invoice_id ? (
                          <Link href={`/invoices/${p.invoice_id}`} className="text-blue-600 hover:underline">
                            {invoiceNumbers[p.invoice_id] || p.invoice_id}
                          </Link>
                        ) : (
                          "غير مرتبط"
                        )}
                      </td>
                      <td className="px-2 py-2">
                        <div className="flex gap-2">
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
              <div className="flex gap-2">
                <Button onClick={createSupplierPayment} disabled={saving || !online || !newSuppPayment.supplier_id || newSuppPayment.amount <= 0 || !newSuppPayment.account_id}>{appLang === 'en' ? 'Create' : 'إنشاء'}</Button>
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
                      <th className="px-2 py-2 text-right">{appLang === 'en' ? 'Total' : 'المبلغ'}</th>
                      <th className="px-2 py-2 text-right">{appLang === 'en' ? 'Paid' : 'المدفوع'}</th>
                      <th className="px-2 py-2 text-right">{appLang === 'en' ? 'Remaining' : 'المتبقي'}</th>
                      <th className="px-2 py-2 text-right">{appLang === 'en' ? 'Select' : 'اختيار'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {formSupplierBills.map((b) => {
                      const remaining = Math.max(Number(b.total_amount || 0) - Number(b.paid_amount || 0), 0)
                      if (remaining <= 0) return null
                      return (
                        <tr key={b.id} className="border-b">
                          <td className="px-2 py-2">{b.bill_number}</td>
                          <td className="px-2 py-2">{b.bill_date || "-"}</td>
                          <td className="px-2 py-2">{Number(b.total_amount || 0).toFixed(2)} {currencySymbols[baseCurrency] || baseCurrency}</td>
                          <td className="px-2 py-2">{Number(b.paid_amount || 0).toFixed(2)} {currencySymbols[baseCurrency] || baseCurrency}</td>
                          <td className="px-2 py-2 font-semibold">{remaining.toFixed(2)} {currencySymbols[baseCurrency] || baseCurrency}</td>
                          <td className="px-2 py-2">
                            <Button variant={selectedFormBillId === b.id ? "default" : "outline"} size="sm" onClick={() => {
                              setSelectedFormBillId(b.id)
                              setNewSuppPayment({ ...newSuppPayment, amount: remaining })
                            }}>{appLang === 'en' ? 'Select' : 'اختيار'}</Button>
                          </td>
                        </tr>
                      )
                    })}
                    {formSupplierBills.length === 0 && (
                      <tr><td colSpan={6} className="px-2 py-2 text-center text-gray-500 dark:text-gray-400">{appLang === 'en' ? 'No unpaid bills for this supplier' : 'لا توجد فواتير غير مسددة بالكامل لهذا المورد'}</td></tr>
                    )}
                  </tbody>
                </table>
                {selectedFormBillId && (
                  <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">تم اختيار الفاتورة، وتم تعبئة خانة المبلغ تلقائيًا بالمبلغ المتبقي.</p>
                )}
              </div>
            )}

            <div className="border-t pt-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50 dark:bg-slate-900">
                    <th className="px-2 py-2 text-right">{appLang === 'en' ? 'Date' : 'التاريخ'}</th>
                    <th className="px-2 py-2 text-right">{appLang === 'en' ? 'Amount' : 'المبلغ'}</th>
                    <th className="px-2 py-2 text-right">{appLang === 'en' ? 'Reference' : 'مرجع'}</th>
                    <th className="px-2 py-2 text-right">{appLang === 'en' ? 'Linked Supplier Bill' : 'فاتورة المورد المرتبطة'}</th>
                    <th className="px-2 py-2 text-right">{appLang === 'en' ? 'Linked Purchase Order' : 'أمر الشراء المرتبط'}</th>
                    <th className="px-2 py-2 text-right">{appLang === 'en' ? 'Action' : 'إجراء'}</th>
                  </tr>
                </thead>
                <tbody>
                  {supplierPayments.map((p) => (
                    <tr key={p.id} className="border-b">
                      <td className="px-2 py-2">{p.payment_date}</td>
                      <td className="px-2 py-2">{getDisplayAmount(p).toFixed(2)} {currencySymbol}</td>
                      <td className="px-2 py-2">{p.reference_number || "-"}</td>
                      <td className="px-2 py-2">
                        {p.bill_id ? (
                          <Link href={`/bills/${p.bill_id}`} className="text-blue-600 hover:underline">
                            {billNumbers[p.bill_id] || p.bill_id}
                          </Link>
                        ) : (
                          "غير مرتبط"
                        )}
                      </td>
                      <td className="px-2 py-2">{p.purchase_order_id ? p.purchase_order_id : "غير مرتبط"}</td>
                      <td className="px-2 py-2">
                        <div className="flex gap-2">
                          {!p.bill_id && permWrite && (
                            <Button variant="outline" onClick={() => openApplyToBill(p)} disabled={!online}>{appLang === 'en' ? 'Apply to Bill' : 'تطبيق على فاتورة'}</Button>
                          )}
                          {!p.purchase_order_id && permWrite && (
                            <Button variant="ghost" onClick={() => openApplyToPO(p)} disabled={!online}>{appLang === 'en' ? 'Apply to PO' : 'على أمر شراء'}</Button>
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
                    <select className="w-full border rounded px-2 py-1" value={editFields.account_id} onChange={(e) => setEditFields({ ...editFields, account_id: e.target.value })}>
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
                          branch_id: mapping.branchId || null,
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
                    if (mapping && cashAccountIdNew) {
                      const { data: newEntry } = await supabase
                        .from("journal_entries").insert({
                          company_id: mapping.companyId,
                          reference_type: isCustomer ? "customer_payment" : "supplier_payment",
                          reference_id: null,
                          entry_date: editFields.payment_date || editingPayment.payment_date,
                          description: isCustomer ? `سداد عميل (${editFields.payment_method || editingPayment.payment_method || "cash"})` : `سداد مورّد (${editFields.payment_method || editingPayment.payment_method || "cash"})`,
                          branch_id: mapping.branchId || null,
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
                    // الدفعة مرتبطة بمستند: إذا تغيّر حساب النقد/البنك، ننفذ قيد إعادة تصنيف بين الحسابين
                    const oldCashId = editingPayment.account_id || null
                    const newCashId = editFields.account_id || null
                    if (mapping && oldCashId && newCashId && oldCashId !== newCashId) {
                      const reclassCurrency = editingPayment.original_currency || editingPayment.currency_code || 'EGP'
                      const reclassExRate = editingPayment.exchange_rate_used || editingPayment.exchange_rate || 1
                      const { data: reclassEntry } = await supabase
                        .from("journal_entries").insert({
                          company_id: mapping.companyId,
                          reference_type: isCustomer ? "customer_payment_reclassification" : "supplier_payment_reclassification",
                          reference_id: editingPayment.id,
                          entry_date: editFields.payment_date || editingPayment.payment_date,
                          description: "إعادة تصنيف حساب الدفع: نقل من حساب قديم إلى حساب جديد",
                          branch_id: mapping.branchId || null,
                          cost_center_id: mapping.costCenterId || null,
                        }).select().single()
                      if (reclassEntry?.id) {
                        await supabase.from("journal_entry_lines").insert([
                          { journal_entry_id: reclassEntry.id, account_id: newCashId, debit_amount: editingPayment.amount, credit_amount: 0, description: "تحويل إلى حساب جديد (نقد/بنك)", original_debit: editingPayment.amount, original_credit: 0, original_currency: reclassCurrency, exchange_rate_used: reclassExRate },
                          { journal_entry_id: reclassEntry.id, account_id: oldCashId, debit_amount: 0, credit_amount: editingPayment.amount, description: "تحويل من الحساب القديم (نقد/بنك)", original_debit: 0, original_credit: editingPayment.amount, original_currency: reclassCurrency, exchange_rate_used: reclassExRate },
                        ])
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

                  // إعادة تحميل القوائم
                  if (!companyId) return
                  const { data: custPays } = await supabase
                    .from("payments").select("*")
                    .eq("company_id", companyId)
                    .not("customer_id", "is", null)
                    .order("payment_date", { ascending: false })
                  setCustomerPayments(custPays || [])
                  const { data: suppPays } = await supabase
                    .from("payments").select("*")
                    .eq("company_id", companyId)
                    .not("supplier_id", "is", null)
                    .order("payment_date", { ascending: false })
                  setSupplierPayments(suppPays || [])
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
                          branch_id: inv.branch_id || mapping.branchId || null,
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
                          branch_id: inv.branch_id || mapping.branchId || null,
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
                          branch_id: bill.branch_id || mapping.branchId || null,
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
                          branch_id: (po as any).branch_id || mapping.branchId || null,
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
                        branch_id: mapping.branchId || null,
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
                  const { data: custPays } = await supabase
                    .from("payments").select("*")
                    .eq("company_id", companyId)
                    .not("customer_id", "is", null)
                    .order("payment_date", { ascending: false })
                  setCustomerPayments(custPays || [])
                  const { data: suppPays } = await supabase
                    .from("payments").select("*")
                    .eq("company_id", companyId)
                    .not("supplier_id", "is", null)
                    .order("payment_date", { ascending: false })
                  setSupplierPayments(suppPays || [])
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
      </main>
    </div>
  )
}
