"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Plus } from "lucide-react"
import { useSupabase } from "@/lib/supabase/hooks"
import { useToast } from "@/hooks/use-toast"
import { toastActionError, toastActionSuccess } from "@/lib/notifications"
import { getActiveCompanyId } from "@/lib/company"
import { canAction } from "@/lib/authz"
import { countries, governorates, cities, getGovernoratesByCountry, getCitiesByGovernorate } from "@/lib/locations-data"
import { validateEmail, validatePhone, validateTaxId, validateCreditLimit, validatePaymentTerms, getValidationError, validateField } from "@/lib/validation"
import { normalizePhone } from "@/lib/phone-utils"

interface Customer {
  id: string
  name: string
  email: string
  phone: string
  address?: string
  governorate?: string
  city: string
  country: string
  detailed_address?: string
  tax_id: string
  credit_limit: number
  payment_terms: string
}

interface CustomerFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  editingCustomer?: Customer | null
  onSaveComplete: () => void
  trigger?: React.ReactNode
}

interface FormData {
  name: string
  email: string
  phone: string
  address: string
  governorate: string
  city: string
  country: string
  detailed_address: string
  tax_id: string
  credit_limit: number
  payment_terms: string
}

interface FormErrors {
  [key: string]: string
}

export function CustomerFormDialog({
  open,
  onOpenChange,
  editingCustomer,
  onSaveComplete,
  trigger
}: CustomerFormDialogProps) {
  const supabase = useSupabase()
  const { toast } = useToast()
  const appLang = typeof window !== 'undefined' ? ((localStorage.getItem('app_language') || 'ar') === 'en' ? 'en' : 'ar') : 'ar'

  // Permissions
  const [permWrite, setPermWrite] = useState(false)
  const [permUpdate, setPermUpdate] = useState(false)
  const [permissionsLoaded, setPermissionsLoaded] = useState(false)

  // تتبع الفواتير النشطة التي تمنع التعديل
  const [hasActiveInvoices, setHasActiveInvoices] = useState(false)
  const [activeInvoicesCount, setActiveInvoicesCount] = useState(0)
  const [isCheckingInvoices, setIsCheckingInvoices] = useState(false)

  // v3.74.44 — أيضاً نتبع رصيد العميل الدائن (من المرتجعات/الدفعات الزائدة)
  // وذمم مدينة (من فواتير غير مدفوعة). أي من الاثنين يُغلق التعديل.
  const [hasCreditBalance, setHasCreditBalance] = useState(false)
  const [creditBalanceAmount, setCreditBalanceAmount] = useState(0)
  const [hasReceivable, setHasReceivable] = useState(false)
  const [receivableAmount, setReceivableAmount] = useState(0)

  // أي حالة من الثلاث تقفل التعديل
  const isCustomerLocked = hasActiveInvoices || hasCreditBalance || hasReceivable

  // حقول العنوان المسموح بتعديلها دائماً
  const ADDRESS_FIELDS = ['address', 'governorate', 'city', 'country', 'detailed_address']

  // Form state
  const [formData, setFormData] = useState<FormData>({
    name: "",
    email: "",
    phone: "",
    address: "",
    governorate: "",
    city: "",
    country: "EG",
    detailed_address: "",
    tax_id: "",
    credit_limit: 0,
    payment_terms: "Net 30",
  })

  const [formErrors, setFormErrors] = useState<FormErrors>({})
  const [isProcessing, setIsProcessing] = useState(false)
  const [isCheckingPhone, setIsCheckingPhone] = useState(false)

  // Location data
  const [availableGovernorates, setAvailableGovernorates] = useState(getGovernoratesByCountry("EG"))
  const [availableCities, setAvailableCities] = useState<typeof cities>([])

  // Load permissions - تحميل الصلاحيات فوراً وعند فتح Dialog
  useEffect(() => {
    const checkPerms = async () => {
      const [write, update] = await Promise.all([
        canAction(supabase, "customers", "write"),
        canAction(supabase, "customers", "update"),
      ])
      setPermWrite(write)
      setPermUpdate(update)
      setPermissionsLoaded(true)
    }
    // تحميل الصلاحيات فوراً لتفعيل الزر
    checkPerms()
  }, [supabase])

  // إعادة فحص الصلاحيات عند فتح Dialog
  useEffect(() => {
    if (open) {
      const recheckPerms = async () => {
        const [write, update] = await Promise.all([
          canAction(supabase, "customers", "write"),
          canAction(supabase, "customers", "update"),
        ])
        setPermWrite(write)
        setPermUpdate(update)
      }
      recheckPerms()
    }
  }, [supabase, open])

  // Update governorates when country changes
  useEffect(() => {
    const govs = getGovernoratesByCountry(formData.country)
    setAvailableGovernorates(govs)
    if (formData.governorate && !govs.find(g => g.id === formData.governorate)) {
      setFormData(prev => ({ ...prev, governorate: "", city: "" }))
      setAvailableCities([])
    }
  }, [formData.country])

  // Update cities when governorate changes
  useEffect(() => {
    if (formData.governorate) {
      const cts = getCitiesByGovernorate(formData.governorate)
      setAvailableCities(cts)
      if (formData.city && !cts.find(c => c.id === formData.city)) {
        setFormData(prev => ({ ...prev, city: "" }))
      }
    } else {
      setAvailableCities([])
    }
  }, [formData.governorate])

  // Load customer data when editing
  useEffect(() => {
    if (open && editingCustomer) {
      setFormData({
        name: editingCustomer.name,
        email: editingCustomer.email,
        phone: editingCustomer.phone,
        address: editingCustomer.address || "",
        governorate: editingCustomer.governorate || "",
        city: editingCustomer.city,
        country: editingCustomer.country,
        detailed_address: editingCustomer.detailed_address || "",
        tax_id: editingCustomer.tax_id,
        credit_limit: editingCustomer.credit_limit,
        payment_terms: editingCustomer.payment_terms,
      })
      // Update location data
      const govs = getGovernoratesByCountry(editingCustomer.country)
      setAvailableGovernorates(govs)
      if (editingCustomer.governorate) {
        const cts = getCitiesByGovernorate(editingCustomer.governorate)
        setAvailableCities(cts)
      }
    } else if (open) {
      // Reset form for new customer
      setFormData({
        name: "",
        email: "",
        phone: "",
        address: "",
        governorate: "",
        city: "",
        country: "EG",
        detailed_address: "",
        tax_id: "",
        credit_limit: 0,
        payment_terms: "Net 30",
      })
      setAvailableGovernorates(getGovernoratesByCountry("EG"))
      setAvailableCities([])
    }
    setFormErrors({})
    // إعادة تعيين حالة القفل (v3.74.44)
    setHasActiveInvoices(false)
    setActiveInvoicesCount(0)
    setHasCreditBalance(false)
    setCreditBalanceAmount(0)
    setHasReceivable(false)
    setReceivableAmount(0)
  }, [open, editingCustomer])

  // v3.74.44 — التحقق من حالات قفل تعديل العميل عند فتح Dialog للتعديل
  // ثلاث حالات تُلزم القفل: فواتير نشطة، رصيد دائن، ذمم مدينة.
  useEffect(() => {
    const checkLockingConditions = async () => {
      if (!open || !editingCustomer) {
        setHasActiveInvoices(false)
        setActiveInvoicesCount(0)
        setHasCreditBalance(false)
        setCreditBalanceAmount(0)
        setHasReceivable(false)
        setReceivableAmount(0)
        return
      }

      setIsCheckingInvoices(true)
      try {
        const activeCompanyId = await getActiveCompanyId(supabase)
        if (!activeCompanyId) return

        // 1) الفواتير النشطة (sent/partially_paid/paid)
        const { data: invoices } = await supabase
          .from("invoices")
          .select("id, status, total_amount, paid_amount")
          .eq("company_id", activeCompanyId)
          .eq("customer_id", editingCustomer.id)
          .in("status", ["sent", "partially_paid", "paid"])

        const activeInvList = invoices || []
        setHasActiveInvoices(activeInvList.length > 0)
        setActiveInvoicesCount(activeInvList.length)

        // 2) الرصيد الدائن — مجموع customer_credits غير المستخدمة
        //    (active فقط؛ amount - used_amount - applied_amount > 0)
        // v3.74.89: نَطرَح applied_amount أَيضاً — RPC apply_customer_credit_to_invoice
        // يَزيدُه (لا used_amount) عِندَما يُستَخدَم الرَّصيد لتَسديد فاتورة.
        const { data: credits } = await supabase
          .from("customer_credits")
          .select("amount, used_amount, applied_amount, status")
          .eq("company_id", activeCompanyId)
          .eq("customer_id", editingCustomer.id)
          .eq("status", "active")

        const totalCredit = (credits || []).reduce(
          (sum: number, c: any) =>
            sum + Math.max(
              0,
              Number(c.amount || 0) - Number(c.used_amount || 0) - Number(c.applied_amount || 0)
            ),
          0
        )
        setHasCreditBalance(totalCredit > 0)
        setCreditBalanceAmount(totalCredit)

        // 3) الذمم المدينة — مجموع المتبقي من الفواتير غير المدفوعة بالكامل
        //    (sent + partially_paid فقط؛ paid لا تُساهم)
        const totalReceivable = activeInvList
          .filter((inv: any) => inv.status === "sent" || inv.status === "partially_paid")
          .reduce(
            (sum: number, inv: any) =>
              sum + Math.max(0, Number(inv.total_amount || 0) - Number(inv.paid_amount || 0)),
            0
          )
        setHasReceivable(totalReceivable > 0)
        setReceivableAmount(totalReceivable)
      } catch (error) {
        console.error("Error checking customer lock conditions:", error)
      } finally {
        setIsCheckingInvoices(false)
      }
    }

    checkLockingConditions()
  }, [open, editingCustomer, supabase])

  const validateForm = (): boolean => {
    const errors: FormErrors = {}

    // 1. Validate name - must be at least two parts
    const nameParts = formData.name.trim().split(/\s+/)
    if (nameParts.length < 2 || nameParts.some(part => part.length === 0)) {
      errors.name = appLang === 'en'
        ? 'Name must contain at least first name and family name'
        : 'الاسم يجب أن يحتوي على الاسم الأول واسم العائلة على الأقل'
    }

    // 2. Validate phone
    const phoneValidation = validateField(formData.phone, 'phone')
    if (!phoneValidation.isValid) {
      errors.phone = phoneValidation.error || ''
    }

    // 3. Validate email
    if (formData.email) {
      const emailValidation = validateField(formData.email, 'email')
      if (!emailValidation.isValid) {
        errors.email = emailValidation.error || ''
      }
    }

    // 4. Validate tax ID
    if (formData.tax_id) {
      const taxValidation = validateField(formData.tax_id, 'taxId')
      if (!taxValidation.isValid) {
        errors.tax_id = taxValidation.error || ''
      }
    }

    // 5. Validate credit limit
    const creditValidation = validateField(String(formData.credit_limit), 'amount')
    if (!creditValidation.isValid) {
      errors.credit_limit = creditValidation.error || ''
    }

    // 6. Validate payment terms
    const paymentValidation = validateField(String(formData.payment_terms), 'number')
    if (!paymentValidation.isValid) {
      errors.payment_terms = paymentValidation.error || ''
    }

    // 7. Validate address
    if (!formData.country) {
      errors.country = appLang === 'en' ? 'Country is required' : 'الدولة مطلوبة'
    }
    if (!formData.governorate) {
      errors.governorate = appLang === 'en' ? 'Governorate is required' : 'المحافظة مطلوبة'
    }
    if (!formData.city) {
      errors.city = appLang === 'en' ? 'City is required' : 'المدينة مطلوبة'
    }
    if (!formData.detailed_address || formData.detailed_address.trim().length < 10) {
      errors.detailed_address = appLang === 'en'
        ? 'Detailed address is required (at least 10 characters)'
        : 'العنوان التفصيلي مطلوب (10 أحرف على الأقل)'
    }

    setFormErrors(errors)
    return Object.keys(errors).length === 0
  }

  const checkPhoneDuplicate = async (phone: string) => {
    const normalizedPhone = normalizePhone(phone)
    const phoneValidation = validateField(phone, 'phone')
    if (!phoneValidation.isValid) return

    try {
      setIsCheckingPhone(true)
      const activeCompanyId = await getActiveCompanyId(supabase)
      if (!activeCompanyId) return

      const { data: existingCustomers } = await supabase
        .from("customers")
        .select("id, name, phone")
        .eq("company_id", activeCompanyId)

      const duplicate = existingCustomers?.find((c: Customer) => {
        if (editingCustomer && c.id === editingCustomer.id) return false
        return normalizePhone(c.phone) === normalizedPhone
      })

      if (duplicate) {
        setFormErrors(prev => ({
          ...prev,
          phone: appLang === 'en'
            ? `Phone already used by: ${duplicate.name}`
            : `رقم الهاتف مستخدم بالفعل لعميل: ${duplicate.name}`
        }))
      }
    } catch (err) {
      // Silently handle phone check errors
    } finally {
      setIsCheckingPhone(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    // Check permissions first
    if (editingCustomer) {
      if (!permUpdate) {
        toast({
          title: appLang === 'en' ? 'Permission Denied' : 'غير مصرح',
          description: appLang === 'en' ? 'You do not have permission to update customers' : 'ليس لديك صلاحية تعديل العملاء',
          variant: 'destructive'
        })
        return
      }
    } else {
      if (!permWrite) {
        toast({
          title: appLang === 'en' ? 'Permission Denied' : 'غير مصرح',
          description: appLang === 'en' ? 'You do not have permission to add customers' : 'ليس لديك صلاحية إضافة عملاء',
          variant: 'destructive'
        })
        return
      }
    }

    // Validate data before saving
    if (!validateForm()) {
      toast({
        title: appLang === 'en' ? 'Validation Error' : 'خطأ في البيانات',
        description: appLang === 'en' ? 'Please correct the errors below' : 'يرجى تصحيح الأخطاء أدناه',
        variant: 'destructive'
      })
      return
    }

    setIsProcessing(true)

    try {
      const activeCompanyId = await getActiveCompanyId(supabase)
      if (!activeCompanyId) {
        toast({
          title: appLang === 'en' ? 'Error' : 'خطأ',
          description: appLang === 'en' ? 'No active company found' : 'لم يتم العثور على شركة نشطة',
          variant: 'destructive'
        })
        return
      }

      // Prepare data for saving with phone normalization
      const normalizedPhone = normalizePhone(formData.phone)
      const dataToSave = {
        ...formData,
        phone: normalizedPhone,
      }

      // Check for duplicate phone - جلب معلومات المنشئ أيضاً
      const { data: existingCustomers } = await supabase
        .from("customers")
        .select("id, name, phone, created_by_user_id")
        .eq("company_id", activeCompanyId)

      // Search for phone match after normalization
      const duplicateCustomer = existingCustomers?.find((c: any) => {
        if (editingCustomer && c.id === editingCustomer.id) return false // Ignore current customer when editing
        const existingNormalized = normalizePhone(c.phone)
        return existingNormalized === normalizedPhone
      })

      if (duplicateCustomer) {
        // جلب معلومات الموظف الذي أنشأ العميل المكرر
        let employeeInfo = ""
        if (duplicateCustomer.created_by_user_id) {
          // جلب معلومات المستخدم من company_members مع الاسم من user_profiles
          const { data: memberInfo } = await supabase
            .from("company_members")
            .select("role, user:user_id(email)")
            .eq("company_id", activeCompanyId)
            .eq("user_id", duplicateCustomer.created_by_user_id)
            .maybeSingle()

          // جلب اسم المستخدم من user_profiles
          const { data: profileInfo } = await supabase
            .from("user_profiles")
            .select("username, full_name")
            .eq("user_id", duplicateCustomer.created_by_user_id)
            .maybeSingle()

          if (memberInfo || profileInfo) {
            const userName = profileInfo?.full_name || profileInfo?.username || (memberInfo?.user as any)?.email || ""
            const roleMap: Record<string, string> = {
              owner: appLang === 'en' ? 'Owner' : 'مالك',
              admin: appLang === 'en' ? 'Admin' : 'مدير',
              accountant: appLang === 'en' ? 'Accountant' : 'محاسب',
              sales: appLang === 'en' ? 'Sales' : 'مبيعات',
              inventory: appLang === 'en' ? 'Inventory' : 'مخازن',
              viewer: appLang === 'en' ? 'Viewer' : 'مشاهد',
            }
            const roleName = roleMap[memberInfo?.role || ""] || memberInfo?.role || ""
            employeeInfo = userName ? ` (${userName}${roleName ? ` - ${roleName}` : ""})` : ""
          }
        }

        toast({
          title: appLang === 'en' ? 'Duplicate Phone Number' : 'رقم الهاتف مكرر',
          description: appLang === 'en'
            ? `Cannot register customer. Phone number is already used by: ${duplicateCustomer.name}${employeeInfo ? ` - Registered by${employeeInfo}` : ""}`
            : `لا يمكن تسجيل العميل، رقم الهاتف مستخدم بالفعل لعميل آخر: ${duplicateCustomer.name}${employeeInfo ? ` - مسجل لدى${employeeInfo}` : ""}`,
          variant: 'destructive'
        })
        setFormErrors(prev => ({ ...prev, phone: appLang === 'en' ? 'Phone number already exists' : 'رقم الهاتف مستخدم بالفعل' }))
        return
      }

      if (editingCustomer) {
        // تحديد البيانات المراد إرسالها
        // v3.74.44: إذا كان العميل مقفلاً (فواتير/رصيد/ذمم)، أرسل حقول العنوان فقط
        const dataForUpdate = isCustomerLocked
          ? {
              address: formData.address,
              governorate: formData.governorate,
              city: formData.city,
              country: formData.country,
              detailed_address: formData.detailed_address,
            }
          : dataToSave

        // استخدام API للتعديل مع التحقق من الصلاحيات
        const response = await fetch('/api/customers/update', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            customerId: editingCustomer.id,
            companyId: activeCompanyId,
            data: dataForUpdate
          })
        })

        const result = await response.json()

        if (!response.ok || !result.success) {
          toast({
            title: appLang === 'en' ? 'Error' : 'خطأ',
            description: appLang === 'en' ? result.error : result.error_ar,
            variant: 'destructive'
          })
          return
        }

        toastActionSuccess(toast, appLang === 'en' ? 'Update' : 'التحديث', appLang === 'en' ? 'Customer' : 'العميل')
      } else {
        // 🔐 إضافة عميل جديد عبر API مع الحوكمة الإلزامية
        // API يقوم تلقائياً بتعيين branch_id من فرع الموظف المنشئ
        const response = await fetch('/api/customers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...dataToSave,
            company_id: activeCompanyId
            // 🏢 branch_id يتم تعيينه تلقائياً من governance-middleware
            // لا يمكن للموظف تجاوز هذا - يتم فرضه من الخادم
          })
        })

        const result = await response.json()

        if (!response.ok || !result.success) {
          toast({
            title: appLang === 'en' ? 'Error' : 'خطأ',
            description: appLang === 'en' ? result.error : (result.error_ar || result.error),
            variant: 'destructive'
          })
          return
        }

        toastActionSuccess(toast, appLang === 'en' ? 'Create' : 'الإنشاء', appLang === 'en' ? 'Customer' : 'العميل')
      }

      onOpenChange(false)
      onSaveComplete()

    } catch (error: any) {
      const errorMessage = error?.message || error?.details || String(error)

      // Check for duplicate phone error from Database Trigger
      if (errorMessage.includes('DUPLICATE_PHONE')) {
        const customerName = errorMessage.match(/DUPLICATE_PHONE: (.+)/)?.[1] || ''
        toast({
          title: appLang === 'en' ? 'Duplicate Phone Number' : 'رقم الهاتف مكرر',
          description: appLang === 'en'
            ? `Cannot register customer. Phone number is already used by another customer.`
            : `لا يمكن تسجيل العميل، رقم الهاتف مستخدم بالفعل لعميل آخر: ${customerName}`,
          variant: 'destructive'
        })
        setFormErrors(prev => ({ ...prev, phone: appLang === 'en' ? 'Phone number already exists' : 'رقم الهاتف مستخدم بالفعل' }))
        return
      }

      toastActionError(toast, appLang === 'en' ? 'Save' : 'الحفظ', appLang === 'en' ? 'Customer' : 'العميل', errorMessage, appLang)
    } finally {
      setIsProcessing(false)
    }
  }

  const defaultTrigger = (
    <DialogTrigger asChild>
      <Button
        className="h-10 sm:h-11 text-sm sm:text-base px-3 sm:px-4"
        disabled={!permWrite}
        title={!permWrite ? (appLang === 'en' ? 'No permission to add customers' : 'لا توجد صلاحية لإضافة عملاء') : ''}
      >
        <Plus className="w-4 h-4 ml-1 sm:ml-2" />
        {appLang==='en' ? 'New' : 'جديد'}
      </Button>
    </DialogTrigger>
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : defaultTrigger}
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editingCustomer ? (appLang==='en' ? 'Edit Customer' : 'تعديل عميل') : (appLang==='en' ? 'Add New Customer' : 'إضافة عميل جديد')}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* v3.74.44 — تحذير شامل: فواتير + رصيد دائن + ذمم مدينة */}
          {editingCustomer && isCustomerLocked && (
            <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-300 dark:border-yellow-700 rounded-lg p-3">
              <div className="flex items-start gap-2">
                <span className="text-yellow-600 text-lg">⚠️</span>
                <div className="text-sm space-y-1">
                  <p className="font-semibold text-yellow-800 dark:text-yellow-200">
                    {appLang === 'en'
                      ? 'This customer is linked to financial records:'
                      : 'هذا العميل مرتبط بتعاملات مالية:'}
                  </p>
                  <ul className="text-yellow-700 dark:text-yellow-300 list-disc pr-5 space-y-0.5">
                    {hasActiveInvoices && (
                      <li>
                        {appLang === 'en'
                          ? `${activeInvoicesCount} active invoice(s)`
                          : `${activeInvoicesCount} فاتورة نشطة`}
                      </li>
                    )}
                    {hasReceivable && (
                      <li>
                        {appLang === 'en'
                          ? `Receivable balance: ${receivableAmount.toFixed(2)} EGP`
                          : `ذمم مدينة بقيمة: ${receivableAmount.toFixed(2)} ج.م`}
                      </li>
                    )}
                    {hasCreditBalance && (
                      <li>
                        {appLang === 'en'
                          ? `Credit balance: ${creditBalanceAmount.toFixed(2)} EGP`
                          : `رصيد دائن بقيمة: ${creditBalanceAmount.toFixed(2)} ج.م`}
                      </li>
                    )}
                  </ul>
                  <p className="text-yellow-700 dark:text-yellow-300 mt-2 pt-2 border-t border-yellow-300 dark:border-yellow-700">
                    {appLang === 'en'
                      ? '🔒 Only address fields can be edited. Other fields are locked.'
                      : '🔒 يمكن تعديل حقول العنوان فقط. الحقول الأخرى مقفلة.'}
                  </p>
                </div>
              </div>
            </div>
          )}

          {isCheckingInvoices && (
            <div className="text-center text-sm text-gray-500">
              {appLang === 'en' ? 'Checking invoices...' : 'جاري التحقق من الفواتير...'}
            </div>
          )}

          {/* Customer Name */}
          <div className="space-y-2">
            <Label htmlFor="name" className="flex items-center gap-1">
              {appLang==='en' ? 'Customer Name' : 'اسم العميل'} <span className="text-red-500">*</span>
              {editingCustomer && isCustomerLocked && <span className="text-xs text-yellow-600 mr-2">🔒</span>}
            </Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => {
                setFormData({ ...formData, name: e.target.value })
                if (formErrors.name) setFormErrors(prev => ({ ...prev, name: '' }))
              }}
              placeholder={appLang==='en' ? 'First name and family name' : 'الاسم الأول + اسم العائلة'}
              className={`${formErrors.name ? 'border-red-500' : ''} ${editingCustomer && isCustomerLocked ? 'bg-gray-100 dark:bg-gray-800 cursor-not-allowed' : ''}`}
              disabled={!!editingCustomer && isCustomerLocked}
            />
            {formErrors.name && <p className="text-red-500 text-xs">{formErrors.name}</p>}
          </div>

          {/* Phone */}
          <div className="space-y-2">
            <Label htmlFor="phone" className="flex items-center gap-1">
              {appLang==='en' ? 'Phone' : 'رقم الهاتف'} <span className="text-red-500">*</span>
              {isCheckingPhone && <span className="text-xs text-gray-400 mr-2">({appLang==='en' ? 'checking...' : 'جاري التحقق...'})</span>}
              {editingCustomer && isCustomerLocked && <span className="text-xs text-yellow-600 mr-2">🔒</span>}
            </Label>
            <Input
              id="phone"
              value={formData.phone}
              onChange={(e) => {
                const value = e.target.value.replace(/[^\d\s]/g, '')
                setFormData({ ...formData, phone: value })
                if (formErrors.phone) setFormErrors(prev => ({ ...prev, phone: '' }))
              }}
              onBlur={(e) => checkPhoneDuplicate(e.target.value)}
              placeholder={appLang==='en' ? '01XXXXXXXXX (11 digits)' : '01XXXXXXXXX (11 رقم)'}
              maxLength={13}
              className={`${formErrors.phone ? 'border-red-500' : ''} ${editingCustomer && isCustomerLocked ? 'bg-gray-100 dark:bg-gray-800 cursor-not-allowed' : ''}`}
              disabled={!!editingCustomer && isCustomerLocked}
            />
            {formErrors.phone && <p className="text-red-500 text-xs">{formErrors.phone}</p>}
          </div>

          {/* Email */}
          <div className="space-y-2">
            <Label htmlFor="email" className="flex items-center gap-1">
              {appLang==='en' ? 'Email' : 'البريد الإلكتروني'}
              {editingCustomer && isCustomerLocked && <span className="text-xs text-yellow-600 mr-2">🔒</span>}
            </Label>
            <Input
              id="email"
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              placeholder={appLang==='en' ? 'email@example.com' : 'email@example.com'}
              className={editingCustomer && isCustomerLocked ? 'bg-gray-100 dark:bg-gray-800 cursor-not-allowed' : ''}
              disabled={!!editingCustomer && isCustomerLocked}
            />
            {formErrors.email && <p className="text-red-500 text-xs">{formErrors.email}</p>}
          </div>

          {/* Address Section */}
          <div className="border-t pt-4">
            <h3 className="font-semibold mb-3 text-sm text-gray-700 dark:text-gray-300 flex items-center gap-2">
              {appLang==='en' ? 'Address Details' : 'تفاصيل العنوان'}
              {editingCustomer && isCustomerLocked && (
                <span className="text-xs text-green-600 bg-green-50 dark:bg-green-900/20 px-2 py-0.5 rounded">
                  ✅ {appLang === 'en' ? 'Editable' : 'قابل للتعديل'}
                </span>
              )}
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Country */}
              <div className="space-y-2">
                <Label className="flex items-center gap-1">
                  {appLang==='en' ? 'Country' : 'الدولة'} <span className="text-red-500">*</span>
                </Label>
                <Select
                  value={formData.country}
                  onValueChange={(value) => {
                    setFormData({ ...formData, country: value, governorate: "", city: "" })
                    if (formErrors.country) setFormErrors(prev => ({ ...prev, country: '' }))
                  }}
                >
                  <SelectTrigger className={formErrors.country ? 'border-red-500' : ''}>
                    <SelectValue placeholder={appLang==='en' ? 'Select country' : 'اختر الدولة'} />
                  </SelectTrigger>
                  <SelectContent>
                    {countries.map(c => (
                      <SelectItem key={c.code} value={c.code}>
                        {appLang==='en' ? c.name_en : c.name_ar}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {formErrors.country && <p className="text-red-500 text-xs">{formErrors.country}</p>}
              </div>

              {/* Governorate */}
              <div className="space-y-2">
                <Label className="flex items-center gap-1">
                  {appLang==='en' ? 'Governorate' : 'المحافظة'} <span className="text-red-500">*</span>
                </Label>
                <Select
                  value={formData.governorate}
                  onValueChange={(value) => {
                    setFormData({ ...formData, governorate: value, city: "" })
                    if (formErrors.governorate) setFormErrors(prev => ({ ...prev, governorate: '' }))
                  }}
                  disabled={!formData.country || availableGovernorates.length === 0}
                >
                  <SelectTrigger className={formErrors.governorate ? 'border-red-500' : ''}>
                    <SelectValue placeholder={
                      !formData.country
                        ? (appLang==='en' ? 'Select country first' : 'اختر الدولة أولاً')
                        : (appLang==='en' ? 'Select governorate' : 'اختر المحافظة')
                    } />
                  </SelectTrigger>
                  <SelectContent>
                    {availableGovernorates.map(g => (
                      <SelectItem key={g.id} value={g.id}>
                        {appLang==='en' ? g.name_en : g.name_ar}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {formErrors.governorate && <p className="text-red-500 text-xs">{formErrors.governorate}</p>}
              </div>

              {/* City */}
              <div className="space-y-2 sm:col-span-2">
                <Label className="flex items-center gap-1">
                  {appLang==='en' ? 'City/Area' : 'المدينة/المنطقة'} <span className="text-red-500">*</span>
                </Label>
                <Select
                  value={formData.city}
                  onValueChange={(value) => {
                    setFormData({ ...formData, city: value })
                    if (formErrors.city) setFormErrors(prev => ({ ...prev, city: '' }))
                  }}
                  disabled={!formData.governorate || availableCities.length === 0}
                >
                  <SelectTrigger className={formErrors.city ? 'border-red-500' : ''}>
                    <SelectValue placeholder={
                      !formData.governorate
                        ? (appLang==='en' ? 'Select governorate first' : 'اختر المحافظة أولاً')
                        : (appLang==='en' ? 'Select city' : 'اختر المدينة')
                    } />
                  </SelectTrigger>
                  <SelectContent>
                    {availableCities.map(c => (
                      <SelectItem key={c.id} value={c.id}>
                        {appLang==='en' ? c.name_en : c.name_ar}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {formErrors.city && <p className="text-red-500 text-xs">{formErrors.city}</p>}
              </div>
            </div>

            {/* Detailed Address */}
            <div className="space-y-2 mt-3">
              <Label className="flex items-center gap-1">
                {appLang==='en' ? 'Detailed Address' : 'العنوان التفصيلي'} <span className="text-red-500">*</span>
              </Label>
              <Textarea
                value={formData.detailed_address}
                onChange={(e) => {
                  setFormData({ ...formData, detailed_address: e.target.value })
                  if (formErrors.detailed_address) setFormErrors(prev => ({ ...prev, detailed_address: '' }))
                }}
                placeholder={appLang==='en'
                  ? 'Street name, building number, floor, landmark...'
                  : 'اسم الشارع، رقم المبنى، الدور، أقرب معلم...'}
                rows={2}
                className={formErrors.detailed_address ? 'border-red-500' : ''}
              />
              {formErrors.detailed_address && <p className="text-red-500 text-xs">{formErrors.detailed_address}</p>}
            </div>
          </div>

          {/* Additional Information */}
          <div className="border-t pt-4">
            <h3 className="font-semibold mb-3 text-sm text-gray-700 dark:text-gray-300">
              {appLang==='en' ? 'Additional Information' : 'معلومات إضافية'}
              {editingCustomer && isCustomerLocked && <span className="text-xs text-yellow-600 mr-2"> 🔒</span>}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="tax_id" className="flex items-center gap-1">
                  {appLang==='en' ? 'Tax ID' : 'الرقم الضريبي'}
                  {editingCustomer && isCustomerLocked && <span className="text-xs text-yellow-600">🔒</span>}
                </Label>
                <Input
                  id="tax_id"
                  value={formData.tax_id}
                  onChange={(e) => {
                    setFormData({ ...formData, tax_id: e.target.value })
                    if (formErrors.tax_id) setFormErrors(prev => ({ ...prev, tax_id: '' }))
                  }}
                  className={`${formErrors.tax_id ? 'border-red-500' : ''} ${editingCustomer && isCustomerLocked ? 'bg-gray-100 dark:bg-gray-800 cursor-not-allowed' : ''}`}
                  disabled={!!editingCustomer && isCustomerLocked}
                />
                {formErrors.tax_id && <p className="text-red-500 text-xs">{formErrors.tax_id}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="credit_limit" className="flex items-center gap-1">
                  {appLang==='en' ? 'Credit Limit' : 'حد الائتمان'}
                  {editingCustomer && isCustomerLocked && <span className="text-xs text-yellow-600">🔒</span>}
                </Label>
                <Input
                  id="credit_limit"
                  type="number"
                  value={formData.credit_limit}
                  onChange={(e) => {
                    setFormData({ ...formData, credit_limit: Number.parseFloat(e.target.value) || 0 })
                    if (formErrors.credit_limit) setFormErrors(prev => ({ ...prev, credit_limit: '' }))
                  }}
                  className={`${formErrors.credit_limit ? 'border-red-500' : ''} ${editingCustomer && isCustomerLocked ? 'bg-gray-100 dark:bg-gray-800 cursor-not-allowed' : ''}`}
                  disabled={!!editingCustomer && isCustomerLocked}
                />
                {formErrors.credit_limit && <p className="text-red-500 text-xs">{formErrors.credit_limit}</p>}
              </div>
            </div>
          </div>

          <Button type="submit" className="w-full" disabled={isProcessing}>
            {isProcessing 
              ? (appLang==='en' ? 'Processing...' : 'جاري المعالجة...')
              : (editingCustomer ? (appLang==='en' ? 'Update' : 'تحديث') : (appLang==='en' ? 'Add' : 'إضافة'))
            }
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}