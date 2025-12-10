"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { Sidebar } from "@/components/sidebar"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { useSupabase } from "@/lib/supabase/hooks"
import { Plus, Edit2, Trash2, Search, Users, AlertCircle } from "lucide-react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"
import { toastActionError, toastActionSuccess } from "@/lib/notifications"
import { getExchangeRate, getActiveCurrencies, type Currency } from "@/lib/currency-service"
import { getActiveCompanyId } from "@/lib/company"
import { canAction } from "@/lib/authz"
import { countries, governorates, cities, getGovernoratesByCountry, getCitiesByGovernorate } from "@/lib/locations-data"
import { Textarea } from "@/components/ui/textarea"

// دالة تطبيع رقم الهاتف - تحويل الأرقام العربية والهندية للإنجليزية وإزالة الفراغات والرموز
const normalizePhone = (phone: string): string => {
  if (!phone) return ''

  // تحويل الأرقام العربية (٠-٩) والهندية (۰-۹) إلى إنجليزية
  const arabicNums = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩']
  const hindiNums = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹']

  let normalized = phone
  arabicNums.forEach((num, idx) => {
    normalized = normalized.replace(new RegExp(num, 'g'), String(idx))
  })
  hindiNums.forEach((num, idx) => {
    normalized = normalized.replace(new RegExp(num, 'g'), String(idx))
  })

  // إزالة جميع الفراغات والرموز غير الرقمية
  normalized = normalized.replace(/[\s\-\(\)\+]/g, '')

  // إزالة بادئة الدولة المصرية (002, 02, 2)
  if (normalized.startsWith('002')) {
    normalized = normalized.substring(3)
  } else if (normalized.startsWith('02') && normalized.length > 10) {
    normalized = normalized.substring(2)
  } else if (normalized.startsWith('2') && normalized.length === 12) {
    normalized = normalized.substring(1)
  }

  // التأكد من أن الرقم يبدأ بـ 0 إذا كان رقم مصري
  if (normalized.length === 10 && normalized.startsWith('1')) {
    normalized = '0' + normalized
  }

  return normalized
}

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

export default function CustomersPage() {
  const supabase = useSupabase()
  const { toast } = useToast()
  const [customers, setCustomers] = useState<Customer[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const appLang = typeof window !== 'undefined' ? ((localStorage.getItem('app_language') || 'ar') === 'en' ? 'en' : 'ar') : 'ar'

  // صلاحيات المستخدم
  const [permWrite, setPermWrite] = useState(false)
  const [permUpdate, setPermUpdate] = useState(false)
  const [permDelete, setPermDelete] = useState(false)
  const [permissionsLoaded, setPermissionsLoaded] = useState(false)

  // Currency support
  const [appCurrency, setAppCurrency] = useState<string>(() => {
    if (typeof window === 'undefined') return 'EGP'
    try { return localStorage.getItem('app_currency') || 'EGP' } catch { return 'EGP' }
  })
  const currencySymbols: Record<string, string> = {
    EGP: '£', USD: '$', EUR: '€', GBP: '£', SAR: '﷼', AED: 'د.إ',
    KWD: 'د.ك', QAR: '﷼', BHD: 'د.ب', OMR: '﷼', JOD: 'د.أ', LBP: 'ل.ل'
  }
  const currencySymbol = currencySymbols[appCurrency] || appCurrency

  // Listen for currency changes
  useEffect(() => {
    const handleCurrencyChange = () => {
      const newCurrency = localStorage.getItem('app_currency') || 'EGP'
      setAppCurrency(newCurrency)
    }
    window.addEventListener('app_currency_changed', handleCurrencyChange)
    return () => window.removeEventListener('app_currency_changed', handleCurrencyChange)
  }, [])
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    address: "",
    governorate: "",
    city: "",
    country: "EG", // الافتراضي مصر
    detailed_address: "",
    tax_id: "",
    credit_limit: 0,
    payment_terms: "Net 30",
  })
  // حالات التحقق من صحة البيانات
  const [formErrors, setFormErrors] = useState<Record<string, string>>({})
  // المحافظات والمدن المتاحة بناءً على الاختيارات
  const [availableGovernorates, setAvailableGovernorates] = useState(getGovernoratesByCountry("EG"))
  const [availableCities, setAvailableCities] = useState<typeof cities>([])

  // تحديث المحافظات عند تغيير الدولة
  useEffect(() => {
    const govs = getGovernoratesByCountry(formData.country)
    setAvailableGovernorates(govs)
    // إعادة ضبط المحافظة والمدينة عند تغيير الدولة
    if (formData.governorate && !govs.find(g => g.id === formData.governorate)) {
      setFormData(prev => ({ ...prev, governorate: "", city: "" }))
      setAvailableCities([])
    }
  }, [formData.country])

  // تحديث المدن عند تغيير المحافظة
  useEffect(() => {
    if (formData.governorate) {
      const cts = getCitiesByGovernorate(formData.governorate)
      setAvailableCities(cts)
      // إعادة ضبط المدينة إذا لم تكن متاحة
      if (formData.city && !cts.find(c => c.id === formData.city)) {
        setFormData(prev => ({ ...prev, city: "" }))
      }
    } else {
      setAvailableCities([])
    }
  }, [formData.governorate])
  const [accounts, setAccounts] = useState<{ id: string; account_code: string; account_name: string; account_type: string }[]>([])
  const [voucherOpen, setVoucherOpen] = useState(false)
  const [voucherCustomerId, setVoucherCustomerId] = useState<string>("")
  const [voucherAmount, setVoucherAmount] = useState<number>(0)
  const [voucherDate, setVoucherDate] = useState<string>(() => new Date().toISOString().slice(0,10))
  const [voucherMethod, setVoucherMethod] = useState<string>("cash")
  const [voucherRef, setVoucherRef] = useState<string>("")
  const [voucherNotes, setVoucherNotes] = useState<string>("")
  const [voucherAccountId, setVoucherAccountId] = useState<string>("")
  const [balances, setBalances] = useState<Record<string, { advance: number; applied: number; available: number }>>({})
  // الذمم المدينة لكل عميل (المبالغ المستحقة من الفواتير)
  const [receivables, setReceivables] = useState<Record<string, number>>({})
  // حالات صرف رصيد العميل الدائن
  const [refundOpen, setRefundOpen] = useState(false)
  const [refundCustomerId, setRefundCustomerId] = useState<string>("")
  const [refundCustomerName, setRefundCustomerName] = useState<string>("")
  const [refundMaxAmount, setRefundMaxAmount] = useState<number>(0)
  const [refundAmount, setRefundAmount] = useState<number>(0)
  const [refundDate, setRefundDate] = useState<string>(() => new Date().toISOString().slice(0,10))
  const [refundMethod, setRefundMethod] = useState<string>("cash")
  const [refundAccountId, setRefundAccountId] = useState<string>("")
  const [refundNotes, setRefundNotes] = useState<string>("")

  // Multi-currency support for voucher
  const [currencies, setCurrencies] = useState<Currency[]>([])
  const [voucherCurrency, setVoucherCurrency] = useState<string>("EGP")
  const [voucherExRate, setVoucherExRate] = useState<{ rate: number; rateId: string | null; source: string }>({ rate: 1, rateId: null, source: 'same_currency' })
  // Multi-currency support for refund
  const [refundCurrency, setRefundCurrency] = useState<string>("EGP")
  const [refundExRate, setRefundExRate] = useState<{ rate: number; rateId: string | null; source: string }>({ rate: 1, rateId: null, source: 'same_currency' })
  const [companyId, setCompanyId] = useState<string | null>(null)

  // حالة التحقق من تكرار الهاتف في الوقت الفعلي
  const [isCheckingPhone, setIsCheckingPhone] = useState(false)

  // التحقق من الصلاحيات
  useEffect(() => {
    const checkPerms = async () => {
      const [write, update, del] = await Promise.all([
        canAction(supabase, "customers", "write"),
        canAction(supabase, "customers", "update"),
        canAction(supabase, "customers", "delete"),
      ])
      setPermWrite(write)
      setPermUpdate(update)
      setPermDelete(del)
      setPermissionsLoaded(true)
      console.log("[Customers] Permissions loaded:", { write, update, delete: del })
    }
    checkPerms()
  }, [supabase])

  useEffect(() => {
    loadCustomers()
  }, [])

  const loadCustomers = async () => {
    try {
      setIsLoading(true)

      // استخدم الشركة الفعّالة (تعمل مع المالك والأعضاء المدعوين)
      const activeCompanyId = await getActiveCompanyId(supabase)
      if (!activeCompanyId) return

      const { data } = await supabase.from("customers").select("*").eq("company_id", activeCompanyId)

      setCustomers(data || [])
      const { data: accs } = await supabase
        .from("chart_of_accounts")
        .select("id, account_code, account_name, account_type")
        .eq("company_id", activeCompanyId)
      setAccounts((accs || []).filter((a: any) => (a.account_type || "").toLowerCase() === "asset"))

      const { data: pays } = await supabase
        .from("payments")
        .select("customer_id, amount, invoice_id")
        .eq("company_id", activeCompanyId)
        .not("customer_id", "is", null)
      const { data: apps } = await supabase
        .from("advance_applications")
        .select("customer_id, amount_applied")
        .eq("company_id", activeCompanyId)
      const advMap: Record<string, number> = {}
      ;(pays || []).forEach((p: any) => {
        const cid = String(p.customer_id || "")
        if (!cid) return
        const amt = Number(p.amount || 0)
        if (!p.invoice_id) {
          advMap[cid] = (advMap[cid] || 0) + amt
        }
      })
      const appMap: Record<string, number> = {}
      ;(apps || []).forEach((a: any) => {
        const cid = String(a.customer_id || "")
        if (!cid) return
        const amt = Number(a.amount_applied || 0)
        appMap[cid] = (appMap[cid] || 0) + amt
      })
      const allIds = Array.from(new Set([...(data || []).map((c: any)=>String(c.id||""))]))
      const out: Record<string, { advance: number; applied: number; available: number }> = {}
      allIds.forEach((id) => {
        const adv = Number(advMap[id] || 0)
        const ap = Number(appMap[id] || 0)
        out[id] = { advance: adv, applied: ap, available: Math.max(adv - ap, 0) }
      })
      setBalances(out)

      // جلب الذمم المدينة (المبالغ المستحقة من الفواتير غير المدفوعة بالكامل)
      const { data: invoicesData } = await supabase
        .from("invoices")
        .select("customer_id, total_amount, paid_amount, status")
        .eq("company_id", activeCompanyId)
        .in("status", ["sent", "partially_paid"])

      const recMap: Record<string, number> = {}
      ;(invoicesData || []).forEach((inv: any) => {
        const cid = String(inv.customer_id || "")
        if (!cid) return
        const due = Math.max(Number(inv.total_amount || 0) - Number(inv.paid_amount || 0), 0)
        recMap[cid] = (recMap[cid] || 0) + due
      })
      setReceivables(recMap)

      // Load currencies for multi-currency support
      setCompanyId(activeCompanyId)
      const curr = await getActiveCurrencies(supabase, activeCompanyId)
      if (curr.length > 0) setCurrencies(curr)
      setVoucherCurrency(appCurrency)
      setRefundCurrency(appCurrency)
    } catch (error) {
      console.error("Error loading customers:", error)
    } finally {
      setIsLoading(false)
    }
  }

  // Update voucher exchange rate when currency changes
  useEffect(() => {
    const updateVoucherRate = async () => {
      if (voucherCurrency === appCurrency) {
        setVoucherExRate({ rate: 1, rateId: null, source: 'same_currency' })
      } else if (companyId) {
        const result = await getExchangeRate(supabase, companyId, voucherCurrency, appCurrency)
        setVoucherExRate({ rate: result.rate, rateId: result.rateId || null, source: result.source })
      }
    }
    updateVoucherRate()
  }, [voucherCurrency, companyId, appCurrency])

  // Update refund exchange rate when currency changes
  useEffect(() => {
    const updateRefundRate = async () => {
      if (refundCurrency === appCurrency) {
        setRefundExRate({ rate: 1, rateId: null, source: 'same_currency' })
      } else if (companyId) {
        const result = await getExchangeRate(supabase, companyId, refundCurrency, appCurrency)
        setRefundExRate({ rate: result.rate, rateId: result.rateId || null, source: result.source })
      }
    }
    updateRefundRate()
  }, [refundCurrency, companyId, appCurrency])

  // دالة التحقق من صحة البيانات
  const validateForm = (): boolean => {
    const errors: Record<string, string> = {}

    // 1. التحقق من الاسم - يجب أن يكون جزئين على الأقل
    const nameParts = formData.name.trim().split(/\s+/)
    if (nameParts.length < 2 || nameParts.some(part => part.length === 0)) {
      errors.name = appLang === 'en'
        ? 'Name must contain at least first name and family name'
        : 'الاسم يجب أن يحتوي على الاسم الأول واسم العائلة على الأقل'
    }

    // 2. التحقق من رقم الهاتف - 11 رقم بدون حروف أو رموز
    const phoneClean = formData.phone.replace(/\s/g, '')
    if (phoneClean) {
      if (!/^\d+$/.test(phoneClean)) {
        errors.phone = appLang === 'en'
          ? 'Phone must contain numbers only'
          : 'رقم الهاتف يجب أن يحتوي على أرقام فقط'
      } else if (phoneClean.length !== 11) {
        errors.phone = appLang === 'en'
          ? 'Phone must be exactly 11 digits'
          : 'رقم الهاتف يجب أن يكون 11 رقم'
      }
    } else {
      errors.phone = appLang === 'en' ? 'Phone is required' : 'رقم الهاتف مطلوب'
    }

    // 3. التحقق من العنوان
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

  // دالة التحقق من تكرار رقم الهاتف في الوقت الفعلي
  const checkPhoneDuplicate = async (phone: string) => {
    const normalizedPhone = normalizePhone(phone)
    if (!normalizedPhone || normalizedPhone.length !== 11) return

    try {
      setIsCheckingPhone(true)
      const activeCompanyId = await getActiveCompanyId(supabase)
      if (!activeCompanyId) return

      const { data: existingCustomers } = await supabase
        .from("customers")
        .select("id, name, phone")
        .eq("company_id", activeCompanyId)

      const duplicate = existingCustomers?.find(c => {
        if (editingId && c.id === editingId) return false
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
      console.error("Error checking phone duplicate:", err)
    } finally {
      setIsCheckingPhone(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    // التحقق من الصلاحيات أولاً
    if (editingId) {
      if (!permUpdate) {
        console.error("[Customers] Update denied - no permission")
        toast({
          title: appLang === 'en' ? 'Permission Denied' : 'غير مصرح',
          description: appLang === 'en' ? 'You do not have permission to update customers' : 'ليس لديك صلاحية تعديل العملاء',
          variant: 'destructive'
        })
        return
      }
    } else {
      if (!permWrite) {
        console.error("[Customers] Create denied - no permission")
        toast({
          title: appLang === 'en' ? 'Permission Denied' : 'غير مصرح',
          description: appLang === 'en' ? 'You do not have permission to add customers' : 'ليس لديك صلاحية إضافة عملاء',
          variant: 'destructive'
        })
        return
      }
    }

    // التحقق من صحة البيانات قبل الحفظ
    if (!validateForm()) {
      toast({
        title: appLang === 'en' ? 'Validation Error' : 'خطأ في البيانات',
        description: appLang === 'en' ? 'Please correct the errors below' : 'يرجى تصحيح الأخطاء أدناه',
        variant: 'destructive'
      })
      return
    }

    try {
      const activeCompanyId = await getActiveCompanyId(supabase)
      if (!activeCompanyId) {
        console.error("[Customers] No active company ID")
        toast({
          title: appLang === 'en' ? 'Error' : 'خطأ',
          description: appLang === 'en' ? 'No active company found' : 'لم يتم العثور على شركة نشطة',
          variant: 'destructive'
        })
        return
      }

      // تحضير البيانات للحفظ مع تنظيف رقم الهاتف
      const normalizedPhone = normalizePhone(formData.phone)
      const dataToSave = {
        ...formData,
        phone: normalizedPhone,
      }

      // التحقق من عدم تكرار رقم الهاتف
      console.log("[Customers] Checking for duplicate phone:", normalizedPhone)
      const { data: existingCustomers } = await supabase
        .from("customers")
        .select("id, name, phone")
        .eq("company_id", activeCompanyId)

      // البحث عن تطابق رقم الهاتف بعد التطبيع
      const duplicateCustomer = existingCustomers?.find(c => {
        if (editingId && c.id === editingId) return false // تجاهل العميل الحالي عند التعديل
        const existingNormalized = normalizePhone(c.phone)
        return existingNormalized === normalizedPhone
      })

      if (duplicateCustomer) {
        console.error("[Customers] Duplicate phone found:", duplicateCustomer)
        toast({
          title: appLang === 'en' ? 'Duplicate Phone Number' : 'رقم الهاتف مكرر',
          description: appLang === 'en'
            ? `Cannot register customer. Phone number is already used by: ${duplicateCustomer.name}`
            : `لا يمكن تسجيل العميل، رقم الهاتف مستخدم بالفعل لعميل آخر: ${duplicateCustomer.name}`,
          variant: 'destructive'
        })
        setFormErrors(prev => ({ ...prev, phone: appLang === 'en' ? 'Phone number already exists' : 'رقم الهاتف مستخدم بالفعل' }))
        return
      }

      if (editingId) {
        console.log("[Customers] Updating customer:", editingId, dataToSave)
        const { error } = await supabase.from("customers").update(dataToSave).eq("id", editingId)
        if (error) {
          console.error("[Customers] Update error:", error)
          throw error
        }
        console.log("[Customers] Customer updated successfully:", editingId)
        toastActionSuccess(toast, appLang === 'en' ? 'Update' : 'التحديث', appLang === 'en' ? 'Customer' : 'العميل')
      } else {
        console.log("[Customers] Creating customer:", dataToSave)
        const { data: created, error } = await supabase
          .from("customers")
          .insert([{ ...dataToSave, company_id: activeCompanyId }])
          .select("id")
          .single()
        if (error) {
          console.error("[Customers] Create error:", error)
          throw error
        }
        console.log("[Customers] Customer created successfully:", created?.id)
        toastActionSuccess(toast, appLang === 'en' ? 'Create' : 'الإنشاء', appLang === 'en' ? 'Customer' : 'العميل')
      }

      setIsDialogOpen(false)
      setEditingId(null)
      setFormErrors({})
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
      loadCustomers()
    } catch (error: any) {
      console.error("[Customers] Error saving customer:", error)
      const errorMessage = error?.message || error?.details || String(error)

      // التحقق من رسالة خطأ تكرار رقم الهاتف من Database Trigger
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

      toastActionError(toast, appLang === 'en' ? 'Save' : 'الحفظ', appLang === 'en' ? 'Customer' : 'العميل', errorMessage)
    }
  }

  const handleEdit = (customer: Customer) => {
    // تحديث المحافظات والمدن المتاحة أولاً
    const country = customer.country || "EG"
    const govs = getGovernoratesByCountry(country)
    setAvailableGovernorates(govs)

    if (customer.governorate) {
      setAvailableCities(getCitiesByGovernorate(customer.governorate))
    }

    setFormData({
      name: customer.name,
      email: customer.email,
      phone: customer.phone,
      address: customer.address || "",
      governorate: customer.governorate || "",
      city: customer.city,
      country: country,
      detailed_address: customer.detailed_address || "",
      tax_id: customer.tax_id,
      credit_limit: customer.credit_limit,
      payment_terms: customer.payment_terms,
    })
    setFormErrors({})
    setEditingId(customer.id)
    setIsDialogOpen(true)
  }

  const handleDelete = async (id: string) => {
    // التحقق من صلاحية الحذف
    if (!permDelete) {
      console.error("[Customers] Delete denied - no permission")
      toast({
        title: appLang === 'en' ? 'Permission Denied' : 'غير مصرح',
        description: appLang === 'en' ? 'You do not have permission to delete customers' : 'ليس لديك صلاحية حذف العملاء',
        variant: 'destructive'
      })
      return
    }

    try {
      console.log("[Customers] Checking if customer can be deleted:", id)

      // الحصول على company_id الفعّال
      const activeCompanyId = await getActiveCompanyId(supabase)
      if (!activeCompanyId) {
        throw new Error(appLang === 'en' ? 'No active company' : 'لا توجد شركة نشطة')
      }

      // التحقق من عدم وجود فواتير مرتبطة بالعميل
      const { data: invoices, error: invoicesError } = await supabase
        .from("invoices")
        .select("id, invoice_number")
        .eq("customer_id", id)
        .eq("company_id", activeCompanyId)
        .limit(5)

      if (invoicesError) {
        console.error("[Customers] Error checking invoices:", invoicesError)
      }

      if (invoices && invoices.length > 0) {
        const invoiceNumbers = invoices.map(inv => inv.invoice_number).join(', ')
        const moreText = invoices.length >= 5 ? (appLang === 'en' ? ' and more...' : ' والمزيد...') : ''
        toast({
          title: appLang === 'en' ? 'Cannot Delete Customer' : 'لا يمكن حذف العميل',
          description: appLang === 'en'
            ? `This customer has ${invoices.length}+ invoice(s): ${invoiceNumbers}${moreText}`
            : `هذا العميل مرتبط بـ ${invoices.length}+ فاتورة: ${invoiceNumbers}${moreText}`,
          variant: 'destructive'
        })
        return
      }

      // التحقق من عدم وجود أوامر بيع مرتبطة بالعميل
      const { data: salesOrders, error: salesOrdersError } = await supabase
        .from("sales_orders")
        .select("id, order_number")
        .eq("customer_id", id)
        .eq("company_id", activeCompanyId)
        .limit(5)

      if (salesOrdersError) {
        console.error("[Customers] Error checking sales orders:", salesOrdersError)
      }

      if (salesOrders && salesOrders.length > 0) {
        const orderNumbers = salesOrders.map(so => so.order_number).join(', ')
        const moreText = salesOrders.length >= 5 ? (appLang === 'en' ? ' and more...' : ' والمزيد...') : ''
        toast({
          title: appLang === 'en' ? 'Cannot Delete Customer' : 'لا يمكن حذف العميل',
          description: appLang === 'en'
            ? `This customer has ${salesOrders.length}+ sales order(s): ${orderNumbers}${moreText}`
            : `هذا العميل مرتبط بـ ${salesOrders.length}+ أمر بيع: ${orderNumbers}${moreText}`,
          variant: 'destructive'
        })
        return
      }

      // تأكيد الحذف
      const confirmMessage = appLang === 'en'
        ? 'Are you sure you want to delete this customer?'
        : 'هل أنت متأكد من حذف هذا العميل؟'
      if (!window.confirm(confirmMessage)) {
        return
      }

      console.log("[Customers] Deleting customer:", id)

      // الحذف مع التأكد من company_id
      const { error, count } = await supabase
        .from("customers")
        .delete({ count: 'exact' })
        .eq("id", id)
        .eq("company_id", activeCompanyId)

      if (error) {
        console.error("[Customers] Delete error:", error)
        throw error
      }

      // التحقق من أن الحذف تم فعلاً
      if (count === 0) {
        console.error("[Customers] Delete failed - no rows affected, possibly RLS policy blocked")
        throw new Error(appLang === 'en'
          ? 'Failed to delete customer. You may not have permission.'
          : 'فشل حذف العميل. قد لا يكون لديك صلاحية.')
      }

      console.log("[Customers] Customer deleted successfully:", id, "rows affected:", count)
      toastActionSuccess(toast, appLang === 'en' ? 'Delete' : 'الحذف', appLang === 'en' ? 'Customer' : 'العميل')
      loadCustomers()
    } catch (error: any) {
      console.error("[Customers] Error deleting customer:", error)
      const errorMessage = error?.message || error?.details || String(error)
      toastActionError(toast, appLang === 'en' ? 'Delete' : 'الحذف', appLang === 'en' ? 'Customer' : 'العميل', errorMessage)
    }
  }

  const filteredCustomers = customers.filter((customer) => {
    const query = searchTerm.trim().toLowerCase()
    if (!query) return true

    // Detect input type
    const isNumeric = /^\d+$/.test(query)
    const isAlphabetic = /^[\u0600-\u06FF\u0750-\u077Fa-zA-Z\s]+$/.test(query)

    if (isNumeric) {
      // Search by phone only
      return (customer.phone || '').includes(query)
    } else if (isAlphabetic) {
      // Search by name only
      return customer.name.toLowerCase().includes(query)
    } else {
      // Mixed - search in both name, phone, and email
      return (
        customer.name.toLowerCase().includes(query) ||
        (customer.phone || '').toLowerCase().includes(query) ||
        customer.email.toLowerCase().includes(query)
      )
    }
  })

  const createCustomerVoucher = async () => {
    try {
      if (!voucherCustomerId || voucherAmount <= 0) return
      const activeCompanyId = await getActiveCompanyId(supabase)
      if (!activeCompanyId) return
      if (voucherAccountId) {
        const { data: acct, error: acctErr } = await supabase
          .from("chart_of_accounts")
          .select("id, company_id")
          .eq("id", voucherAccountId)
          .eq("company_id", activeCompanyId)
          .single()
        if (acctErr || !acct) {
          toastActionError(toast, "التحقق", "الحساب", appLang==='en' ? "Selected account invalid" : "الحساب المختار غير صالح")
          return
        }
      }
      const payload: any = {
        company_id: activeCompanyId,
        customer_id: voucherCustomerId,
        payment_date: voucherDate,
        amount: voucherAmount,
        payment_method: voucherMethod === "bank" ? "bank" : (voucherMethod === "cash" ? "cash" : "refund"),
        reference_number: voucherRef || null,
        notes: voucherNotes || null,
        account_id: voucherAccountId || null,
      }
            let insertedPayment: any = null
            let insertErr: any = null
            {
              const { data, error } = await supabase.from("payments").insert(payload).select().single()
              insertedPayment = data || null
              insertErr = error || null
            }
      if (insertErr) {
        const msg = String(insertErr?.message || insertErr || "")
        const mentionsAccountId = msg.toLowerCase().includes("account_id")
        const looksMissingColumn = mentionsAccountId && (msg.toLowerCase().includes("does not exist") || msg.toLowerCase().includes("not found") || msg.toLowerCase().includes("column"))
        if (looksMissingColumn || mentionsAccountId) {
          const fallback = { ...payload }
          delete (fallback as any).account_id
          const { error: retryError } = await supabase.from("payments").insert(fallback)
          if (retryError) throw retryError
        } else {
          throw insertErr
        }
            }
            try {
              const { data: accounts } = await supabase
                .from("chart_of_accounts")
                .select("id, account_code, account_type, account_name, sub_type")
                .eq("company_id", company.id)
        const find = (f: (a: any) => boolean) => (accounts || []).find(f)?.id
        const customerAdvance = find((a: any) => String(a.sub_type || "").toLowerCase() === "customer_advance") || find((a: any) => String(a.account_name || "").toLowerCase().includes("advance")) || find((a: any) => String(a.account_name || "").toLowerCase().includes("deposit"))
        const cash = find((a: any) => String(a.sub_type || "").toLowerCase() === "cash") || find((a: any) => String(a.account_name || "").toLowerCase().includes("cash"))
        const bank = find((a: any) => String(a.sub_type || "").toLowerCase() === "bank") || find((a: any) => String(a.account_name || "").toLowerCase().includes("bank"))
        const cashAccountId = voucherAccountId || bank || cash
        if (customerAdvance && cashAccountId) {
          // Calculate base amounts for multi-currency
          const baseAmount = voucherCurrency === appCurrency ? voucherAmount : Math.round(voucherAmount * voucherExRate.rate * 10000) / 10000

          const { data: entry } = await supabase
            .from("journal_entries")
            .insert({
              company_id: company.id,
              reference_type: "customer_voucher",
              reference_id: null,
              entry_date: voucherDate,
              description: appLang==='en' ? 'Customer payment voucher' : 'سند صرف عميل',
            })
            .select()
            .single()
          if (entry?.id) {
            await supabase.from("journal_entry_lines").insert([
              {
                journal_entry_id: entry.id,
                account_id: customerAdvance,
                debit_amount: baseAmount,
                credit_amount: 0,
                description: appLang==='en' ? 'Customer advance' : 'سلف العملاء',
                original_currency: voucherCurrency,
                original_debit: voucherAmount,
                original_credit: 0,
                exchange_rate_used: voucherExRate.rate,
                exchange_rate_id: voucherExRate.rateId,
                rate_source: voucherExRate.source
              },
              {
                journal_entry_id: entry.id,
                account_id: cashAccountId,
                debit_amount: 0,
                credit_amount: baseAmount,
                description: appLang==='en' ? 'Cash/Bank' : 'نقد/بنك',
                original_currency: voucherCurrency,
                original_debit: 0,
                original_credit: voucherAmount,
                exchange_rate_used: voucherExRate.rate,
                exchange_rate_id: voucherExRate.rateId,
                rate_source: voucherExRate.source
              },
            ])
          }
              }
            } catch (_) { /* ignore journal errors, voucher still created */ }
            try {
              if (insertedPayment?.id && voucherCustomerId) {
                const { data: invoices } = await supabase
                  .from("invoices")
                  .select("id, total_amount, paid_amount, status")
                  .eq("company_id", company.id)
                  .eq("customer_id", voucherCustomerId)
                  .in("status", ["sent", "partially_paid"])
                  .order("issue_date", { ascending: true })
                let remaining = Number(voucherAmount || 0)
                for (const inv of (invoices || [])) {
                  if (remaining <= 0) break
                  const due = Math.max(Number(inv.total_amount || 0) - Number(inv.paid_amount || 0), 0)
                  const applyAmt = Math.min(remaining, due)
                  if (applyAmt > 0) {
                    await supabase.from("advance_applications").insert({ company_id: company.id, customer_id: voucherCustomerId, invoice_id: inv.id, amount_applied: applyAmt, payment_id: insertedPayment.id })
                    await supabase.from("invoices").update({ paid_amount: Number(inv.paid_amount || 0) + applyAmt, status: Number(inv.total_amount || 0) <= (Number(inv.paid_amount || 0) + applyAmt) ? "paid" : "partially_paid" }).eq("id", inv.id)
                    remaining -= applyAmt
                  }
                }
              }
            } catch (_) {}
      toastActionSuccess(toast, appLang==='en' ? 'Create' : 'الإنشاء', appLang==='en' ? 'Customer voucher' : 'سند صرف عميل')
      setVoucherOpen(false)
      setVoucherCustomerId("")
      setVoucherAmount(0)
      setVoucherRef("")
      setVoucherNotes("")
      setVoucherAccountId("")
    } catch (err: any) {
      toastActionError(toast, appLang==='en' ? 'Create' : 'الإنشاء', appLang==='en' ? 'Customer voucher' : 'سند صرف عميل', String(err?.message || err || 'فشل إنشاء سند الصرف'))
    }
  }

  // ===== فتح نافذة صرف رصيد العميل الدائن =====
  const openRefundDialog = (customer: Customer) => {
    const bal = balances[customer.id]
    const available = bal?.available || 0
    if (available <= 0) {
      toastActionError(toast, appLang==='en' ? 'Refund' : 'الصرف', appLang==='en' ? 'Customer credit' : 'رصيد العميل', appLang==='en' ? 'No available credit balance' : 'لا يوجد رصيد دائن متاح')
      return
    }
    setRefundCustomerId(customer.id)
    setRefundCustomerName(customer.name)
    setRefundMaxAmount(available)
    setRefundAmount(available)
    setRefundDate(new Date().toISOString().slice(0,10))
    setRefundMethod("cash")
    setRefundAccountId("")
    setRefundNotes("")
    setRefundOpen(true)
  }

  // ===== صرف رصيد العميل الدائن =====
  const processCustomerRefund = async () => {
    try {
      if (!refundCustomerId || refundAmount <= 0) return
      if (refundAmount > refundMaxAmount) {
        toastActionError(toast, appLang==='en' ? 'Refund' : 'الصرف', appLang==='en' ? 'Amount' : 'المبلغ', appLang==='en' ? 'Amount exceeds available balance' : 'المبلغ يتجاوز الرصيد المتاح')
        return
      }
      const activeCompanyId = await getActiveCompanyId(supabase)
      if (!activeCompanyId) return

      // جلب الحسابات
      const { data: accts } = await supabase
        .from("chart_of_accounts")
        .select("id, account_code, account_type, account_name, sub_type")
        .eq("company_id", activeCompanyId)
      const find = (f: (a: any) => boolean) => (accts || []).find(f)?.id

      // حساب رصيد العميل الدائن
      const customerCredit = find((a: any) => String(a.sub_type || "").toLowerCase() === "customer_credit") ||
        find((a: any) => String(a.sub_type || "").toLowerCase() === "customer_advance") ||
        find((a: any) => String(a.account_name || "").toLowerCase().includes("customer credit")) ||
        find((a: any) => String(a.account_name || "").toLowerCase().includes("رصيد العملاء")) ||
        find((a: any) => String(a.account_name || "").toLowerCase().includes("سلف العملاء"))

      // حساب النقد أو البنك
      const cash = find((a: any) => String(a.sub_type || "").toLowerCase() === "cash") || find((a: any) => String(a.account_name || "").toLowerCase().includes("cash"))
      const bank = find((a: any) => String(a.sub_type || "").toLowerCase() === "bank") || find((a: any) => String(a.account_name || "").toLowerCase().includes("bank"))

      // تحديد حساب الصرف
      let paymentAccount: string | null = null
      if (refundAccountId) {
        paymentAccount = refundAccountId
      } else if (refundMethod === "bank" && bank) {
        paymentAccount = bank
      } else if (cash) {
        paymentAccount = cash
      }

      if (!paymentAccount) {
        toastActionError(toast, appLang==='en' ? 'Refund' : 'الصرف', appLang==='en' ? 'Account' : 'الحساب', appLang==='en' ? 'No payment account found' : 'لم يتم العثور على حساب للصرف')
        return
      }

      // ===== إنشاء قيد صرف رصيد العميل =====
      // القيد المحاسبي:
      // مدين: رصيد العميل الدائن (تقليل الالتزام)
      // دائن: النقد/البنك (خروج المبلغ)

      // Calculate base amounts for multi-currency
      const baseRefundAmount = refundCurrency === appCurrency ? refundAmount : Math.round(refundAmount * refundExRate.rate * 10000) / 10000

      const { data: entry } = await supabase
        .from("journal_entries")
        .insert({
          company_id: activeCompanyId,
          reference_type: "customer_credit_refund",
          reference_id: refundCustomerId,
          entry_date: refundDate,
          description: appLang==='en' ? `Customer credit refund - ${refundCustomerName}` : `صرف رصيد دائن للعميل - ${refundCustomerName}`,
        })
        .select()
        .single()

      if (entry?.id) {
        const lines = []
        if (customerCredit) {
          lines.push({
            journal_entry_id: entry.id,
            account_id: customerCredit,
            debit_amount: baseRefundAmount,
            credit_amount: 0,
            description: appLang==='en' ? 'Customer credit refund' : 'صرف رصيد العميل الدائن',
            original_currency: refundCurrency,
            original_debit: refundAmount,
            original_credit: 0,
            exchange_rate_used: refundExRate.rate,
            exchange_rate_id: refundExRate.rateId,
            rate_source: refundExRate.source
          })
        }
        lines.push({
          journal_entry_id: entry.id,
          account_id: paymentAccount,
          debit_amount: 0,
          credit_amount: baseRefundAmount,
          description: appLang==='en' ? 'Cash/Bank payment' : 'صرف نقدي/بنكي',
          original_currency: refundCurrency,
          original_debit: 0,
          original_credit: refundAmount,
          exchange_rate_used: refundExRate.rate,
          exchange_rate_id: refundExRate.rateId,
          rate_source: refundExRate.source
        })
        await supabase.from("journal_entry_lines").insert(lines)
      }

      // ===== إنشاء سجل دفعة صرف =====
      const payload: any = {
        company_id: company.id,
        customer_id: refundCustomerId,
        payment_date: refundDate,
        amount: -refundAmount, // سالب لأنه صرف للعميل
        payment_method: refundMethod === "bank" ? "bank" : "cash",
        reference_number: `REF-${Date.now()}`,
        notes: refundNotes || (appLang==='en' ? `Credit refund to customer ${refundCustomerName}` : `صرف رصيد دائن للعميل ${refundCustomerName}`),
        account_id: paymentAccount,
      }
      try {
        const { error: payErr } = await supabase.from("payments").insert(payload)
        if (payErr) {
          const msg = String(payErr?.message || "")
          if (msg.toLowerCase().includes("account_id")) {
            const fallback = { ...payload }
            delete (fallback as any).account_id
            await supabase.from("payments").insert(fallback)
          }
        }
      } catch {}

      toastActionSuccess(toast, appLang==='en' ? 'Refund' : 'الصرف', appLang==='en' ? 'Customer credit refund' : 'صرف رصيد العميل')
      setRefundOpen(false)
      setRefundCustomerId("")
      setRefundCustomerName("")
      setRefundMaxAmount(0)
      setRefundAmount(0)
      setRefundNotes("")
      setRefundAccountId("")
      loadCustomers()
    } catch (err: any) {
      toastActionError(toast, appLang==='en' ? 'Refund' : 'الصرف', appLang==='en' ? 'Customer credit' : 'رصيد العميل', String(err?.message || err || 'فشل صرف الرصيد'))
    }
  }

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
      <Sidebar />

      {/* Main Content - تحسين للهاتف */}
      <main className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8 overflow-x-hidden">
        <div className="space-y-4 sm:space-y-6 max-w-full">
          {/* رأس الصفحة - تحسين للهاتف */}
          <div className="bg-white dark:bg-slate-900 rounded-xl sm:rounded-2xl shadow-sm border border-gray-200 dark:border-slate-800 p-4 sm:p-6">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 sm:gap-4">
              <div className="flex items-center gap-3 sm:gap-4">
                <div className="p-2 sm:p-3 bg-blue-100 dark:bg-blue-900/30 rounded-lg sm:rounded-xl flex-shrink-0">
                  <Users className="w-5 h-5 sm:w-6 sm:h-6 text-blue-600 dark:text-blue-400" />
                </div>
                <div className="min-w-0">
                  <h1 className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white truncate">{appLang==='en' ? 'Customers' : 'العملاء'}</h1>
                  <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-0.5 sm:mt-1 truncate">{appLang==='en' ? 'Manage customers' : 'إدارة العملاء'}</p>
                </div>
              </div>
            <Dialog open={isDialogOpen} onOpenChange={(open) => {
              setIsDialogOpen(open)
              if (!open) setFormErrors({})
            }}>
              <DialogTrigger asChild>
                <Button
                  className="h-10 sm:h-11 text-sm sm:text-base px-3 sm:px-4 self-start sm:self-auto"
                  disabled={!permWrite}
                  title={!permWrite ? (appLang === 'en' ? 'No permission to add customers' : 'لا توجد صلاحية لإضافة عملاء') : ''}
                  onClick={() => {
                    setEditingId(null)
                    setFormErrors({})
                    setAvailableGovernorates(getGovernoratesByCountry("EG"))
                    setAvailableCities([])
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
                  }}
                >
                  <Plus className="w-4 h-4 ml-1 sm:ml-2" />
                  {appLang==='en' ? 'New' : 'جديد'}
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>{editingId ? (appLang==='en' ? 'Edit Customer' : 'تعديل عميل') : (appLang==='en' ? 'Add New Customer' : 'إضافة عميل جديد')}</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                  {/* اسم العميل */}
                  <div className="space-y-2">
                    <Label htmlFor="name" className="flex items-center gap-1">
                      {appLang==='en' ? 'Customer Name' : 'اسم العميل'} <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) => {
                        setFormData({ ...formData, name: e.target.value })
                        if (formErrors.name) setFormErrors(prev => ({ ...prev, name: '' }))
                      }}
                      placeholder={appLang==='en' ? 'First name and family name' : 'الاسم الأول + اسم العائلة'}
                      className={formErrors.name ? 'border-red-500' : ''}
                    />
                    {formErrors.name && <p className="text-red-500 text-xs">{formErrors.name}</p>}
                  </div>

                  {/* رقم الهاتف */}
                  <div className="space-y-2">
                    <Label htmlFor="phone" className="flex items-center gap-1">
                      {appLang==='en' ? 'Phone' : 'رقم الهاتف'} <span className="text-red-500">*</span>
                      {isCheckingPhone && <span className="text-xs text-gray-400 mr-2">({appLang==='en' ? 'checking...' : 'جاري التحقق...'})</span>}
                    </Label>
                    <Input
                      id="phone"
                      value={formData.phone}
                      onChange={(e) => {
                        // منع إدخال الحروف والرموز
                        const value = e.target.value.replace(/[^\d\s]/g, '')
                        setFormData({ ...formData, phone: value })
                        if (formErrors.phone) setFormErrors(prev => ({ ...prev, phone: '' }))
                      }}
                      onBlur={(e) => checkPhoneDuplicate(e.target.value)}
                      placeholder={appLang==='en' ? '01XXXXXXXXX (11 digits)' : '01XXXXXXXXX (11 رقم)'}
                      maxLength={13}
                      className={formErrors.phone ? 'border-red-500' : ''}
                    />
                    {formErrors.phone && <p className="text-red-500 text-xs">{formErrors.phone}</p>}
                  </div>

                  {/* البريد الإلكتروني */}
                  <div className="space-y-2">
                    <Label htmlFor="email">{appLang==='en' ? 'Email' : 'البريد الإلكتروني'}</Label>
                    <Input
                      id="email"
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      placeholder={appLang==='en' ? 'email@example.com' : 'email@example.com'}
                    />
                  </div>

                  {/* قسم العنوان */}
                  <div className="border-t pt-4">
                    <h3 className="font-semibold mb-3 text-sm text-gray-700 dark:text-gray-300">
                      {appLang==='en' ? 'Address Details' : 'تفاصيل العنوان'}
                    </h3>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {/* الدولة */}
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

                      {/* المحافظة */}
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

                      {/* المدينة */}
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

                    {/* العنوان التفصيلي */}
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

                  {/* معلومات إضافية */}
                  <div className="border-t pt-4">
                    <h3 className="font-semibold mb-3 text-sm text-gray-700 dark:text-gray-300">
                      {appLang==='en' ? 'Additional Information' : 'معلومات إضافية'}
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label htmlFor="tax_id">{appLang==='en' ? 'Tax ID' : 'الرقم الضريبي'}</Label>
                        <Input
                          id="tax_id"
                          value={formData.tax_id}
                          onChange={(e) => setFormData({ ...formData, tax_id: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="credit_limit">{appLang==='en' ? 'Credit Limit' : 'حد الائتمان'}</Label>
                        <Input
                          id="credit_limit"
                          type="number"
                          value={formData.credit_limit}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              credit_limit: Number.parseFloat(e.target.value) || 0,
                            })
                          }
                        />
                      </div>
                    </div>
                  </div>

                  <Button type="submit" className="w-full">
                    {editingId ? (appLang==='en' ? 'Update' : 'تحديث') : (appLang==='en' ? 'Add' : 'إضافة')}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
            </div>
          </div>

          {/* Search Bar */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 flex-wrap">
                <Search className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                <Input
                  placeholder={appLang==='en' ? 'Search by name or phone...' : 'ابحث بالاسم أو رقم الهاتف...'}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="flex-1 w-full"
                />
              </div>
            </CardContent>
          </Card>

          {/* Customers Table */}
          <Card>
            <CardHeader>
              <CardTitle>{appLang==='en' ? 'Customers List' : 'قائمة العملاء'}</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <p className="text-center py-8 text-gray-500 dark:text-gray-400">{appLang==='en' ? 'Loading...' : 'جاري التحميل...'}</p>
              ) : filteredCustomers.length === 0 ? (
                <p className="text-center py-8 text-gray-500 dark:text-gray-400">{appLang==='en' ? 'No customers yet' : 'لا توجد عملاء حتى الآن'}</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-[480px] w-full text-sm">
                    <thead className="border-b bg-gray-50 dark:bg-slate-800">
                      <tr>
                        <th className="px-3 py-3 text-right font-semibold text-gray-900 dark:text-white">{appLang==='en' ? 'Name' : 'الاسم'}</th>
                        <th className="px-3 py-3 text-right font-semibold text-gray-900 dark:text-white hidden lg:table-cell">{appLang==='en' ? 'Email' : 'البريد'}</th>
                        <th className="px-3 py-3 text-right font-semibold text-gray-900 dark:text-white hidden sm:table-cell">{appLang==='en' ? 'Phone' : 'الهاتف'}</th>
                        <th className="px-3 py-3 text-right font-semibold text-gray-900 dark:text-white hidden xl:table-cell">{appLang==='en' ? 'Address' : 'العنوان'}</th>
                        <th className="px-3 py-3 text-right font-semibold text-gray-900 dark:text-white hidden lg:table-cell">{appLang==='en' ? 'City' : 'المدينة'}</th>
                        <th className="px-3 py-3 text-right font-semibold text-gray-900 dark:text-white hidden md:table-cell">{appLang==='en' ? 'Credit' : 'الائتمان'}</th>
                        <th className="px-3 py-3 text-right font-semibold text-gray-900 dark:text-white">{appLang==='en' ? 'Receivables' : 'الذمم'}</th>
                        <th className="px-3 py-3 text-right font-semibold text-gray-900 dark:text-white hidden sm:table-cell">{appLang==='en' ? 'Balance' : 'الرصيد'}</th>
                        <th className="px-3 py-3 text-right font-semibold text-gray-900 dark:text-white">{appLang==='en' ? 'Actions' : 'إجراءات'}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredCustomers.map((customer) => (
                        <tr key={customer.id} className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-slate-800/50">
                          <td className="px-3 py-3 font-medium text-gray-900 dark:text-white">{customer.name}</td>
                          <td className="px-3 py-3 text-gray-600 dark:text-gray-400 hidden lg:table-cell text-xs">{customer.email || '-'}</td>
                          <td className="px-3 py-3 text-gray-700 dark:text-gray-300 hidden sm:table-cell">{customer.phone || '-'}</td>
                          <td className="px-3 py-3 text-gray-600 dark:text-gray-400 hidden xl:table-cell text-xs max-w-[150px] truncate">{customer.address || '-'}</td>
                          <td className="px-3 py-3 text-gray-600 dark:text-gray-400 hidden lg:table-cell">{customer.city || '-'}</td>
                          <td className="px-3 py-3 text-gray-700 dark:text-gray-300 hidden md:table-cell">{customer.credit_limit.toLocaleString()} {currencySymbol}</td>
                          <td className="px-3 py-3">
                            {(() => {
                              const rec = receivables[customer.id] || 0
                              return (
                                <span className={rec > 0 ? "text-red-600 dark:text-red-400 font-semibold" : "text-gray-400 dark:text-gray-500"}>
                                  {rec > 0 ? rec.toLocaleString('ar-EG', { minimumFractionDigits: 2 }) : '—'} {rec > 0 ? currencySymbol : ''}
                                </span>
                              )
                            })()}
                          </td>
                          <td className="px-3 py-3 hidden sm:table-cell">
                            {(() => {
                              const b = balances[customer.id] || { advance: 0, applied: 0, available: 0 }
                              const available = b.available
                              return (
                                <span className={available > 0 ? "text-green-600 dark:text-green-400 font-semibold" : "text-gray-600 dark:text-gray-400"}>
                                  {available.toLocaleString('ar-EG', { minimumFractionDigits: 2 })}
                                </span>
                              )
                            })()}
                          </td>
                          <td className="px-3 py-3">
                            <div className="flex gap-1 flex-wrap">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleEdit(customer)}
                                disabled={!permUpdate}
                                title={!permUpdate ? (appLang === 'en' ? 'No permission to edit' : 'لا توجد صلاحية للتعديل') : ''}
                              >
                                <Edit2 className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleDelete(customer.id)}
                                className="text-red-600 hover:text-red-700"
                                disabled={!permDelete}
                                title={!permDelete ? (appLang === 'en' ? 'No permission to delete' : 'لا توجد صلاحية للحذف') : ''}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => { setVoucherCustomerId(customer.id); setVoucherOpen(true) }}
                              >
                                {appLang==='en' ? 'Payment Voucher' : 'سند صرف'}
                              </Button>
                              {/* زر صرف رصيد العميل الدائن */}
                              {(balances[customer.id]?.available || 0) > 0 && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => openRefundDialog(customer)}
                                  className="text-green-600 hover:text-green-700 border-green-300"
                                >
                                  {appLang==='en' ? 'Refund Credit' : 'صرف الرصيد'}
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
      <Dialog open={voucherOpen} onOpenChange={setVoucherOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{appLang==='en' ? 'Customer Payment Voucher' : 'سند صرف عميل'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{appLang==='en' ? 'Amount' : 'المبلغ'}</Label>
                <Input type="number" value={voucherAmount} onChange={(e) => setVoucherAmount(Number(e.target.value || 0))} />
              </div>
              <div className="space-y-2">
                <Label>{appLang==='en' ? 'Currency' : 'العملة'}</Label>
                <Select value={voucherCurrency} onValueChange={setVoucherCurrency}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {currencies.length > 0 ? (
                      currencies.map(c => <SelectItem key={c.code} value={c.code}>{c.code}</SelectItem>)
                    ) : (
                      <>
                        <SelectItem value="EGP">EGP</SelectItem>
                        <SelectItem value="USD">USD</SelectItem>
                        <SelectItem value="EUR">EUR</SelectItem>
                        <SelectItem value="SAR">SAR</SelectItem>
                      </>
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {voucherCurrency !== appCurrency && voucherAmount > 0 && (
              <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded text-sm">
                <div>{appLang==='en' ? 'Exchange Rate' : 'سعر الصرف'}: <strong>1 {voucherCurrency} = {voucherExRate.rate.toFixed(4)} {appCurrency}</strong> ({voucherExRate.source})</div>
                <div>{appLang==='en' ? 'Base Amount' : 'المبلغ الأساسي'}: <strong>{(voucherAmount * voucherExRate.rate).toFixed(2)} {appCurrency}</strong></div>
              </div>
            )}
            <div className="space-y-2">
              <Label>{appLang==='en' ? 'Date' : 'التاريخ'}</Label>
              <Input type="date" value={voucherDate} onChange={(e) => setVoucherDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>{appLang==='en' ? 'Payment Method' : 'طريقة الدفع'}</Label>
              <Select value={voucherMethod} onValueChange={setVoucherMethod}>
                <SelectTrigger><SelectValue placeholder={appLang==='en' ? 'Method' : 'الطريقة'} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">{appLang==='en' ? 'Cash' : 'نقد'}</SelectItem>
                  <SelectItem value="bank">{appLang==='en' ? 'Bank' : 'بنك'}</SelectItem>
                  <SelectItem value="refund">{appLang==='en' ? 'Refund' : 'استرداد'}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{appLang==='en' ? 'Account' : 'الحساب'}</Label>
              <Select value={voucherAccountId} onValueChange={setVoucherAccountId}>
                <SelectTrigger><SelectValue placeholder={appLang==='en' ? 'Select account' : 'اختر الحساب'} /></SelectTrigger>
                <SelectContent>
                  {(accounts || []).map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.account_name} {a.account_code ? `(${a.account_code})` : ''}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{appLang==='en' ? 'Reference' : 'مرجع'}</Label>
              <Input value={voucherRef} onChange={(e) => setVoucherRef(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>{appLang==='en' ? 'Notes' : 'ملاحظات'}</Label>
              <Input value={voucherNotes} onChange={(e) => setVoucherNotes(e.target.value)} />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setVoucherOpen(false)}>{appLang==='en' ? 'Cancel' : 'إلغاء'}</Button>
              <Button onClick={createCustomerVoucher}>{appLang==='en' ? 'Create' : 'إنشاء'}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* نافذة صرف رصيد العميل الدائن */}
      <Dialog open={refundOpen} onOpenChange={setRefundOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{appLang==='en' ? 'Refund Customer Credit' : 'صرف رصيد العميل الدائن'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
              <p className="text-sm text-gray-600 dark:text-gray-400">{appLang==='en' ? 'Customer' : 'العميل'}: <span className="font-semibold">{refundCustomerName}</span></p>
              <p className="text-sm text-gray-600 dark:text-gray-400">{appLang==='en' ? 'Available Balance' : 'الرصيد المتاح'}: <span className="font-semibold text-green-600">{refundMaxAmount.toLocaleString('ar-EG', { minimumFractionDigits: 2 })}</span></p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{appLang==='en' ? 'Refund Amount' : 'مبلغ الصرف'}</Label>
                <Input
                  type="number"
                  value={refundAmount}
                  max={refundMaxAmount}
                  onChange={(e) => setRefundAmount(Math.min(Number(e.target.value || 0), refundMaxAmount))}
                />
              </div>
              <div className="space-y-2">
                <Label>{appLang==='en' ? 'Currency' : 'العملة'}</Label>
                <Select value={refundCurrency} onValueChange={setRefundCurrency}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {currencies.length > 0 ? (
                      currencies.map(c => <SelectItem key={c.code} value={c.code}>{c.code}</SelectItem>)
                    ) : (
                      <>
                        <SelectItem value="EGP">EGP</SelectItem>
                        <SelectItem value="USD">USD</SelectItem>
                        <SelectItem value="EUR">EUR</SelectItem>
                        <SelectItem value="SAR">SAR</SelectItem>
                      </>
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {refundCurrency !== appCurrency && refundAmount > 0 && (
              <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded text-sm">
                <div>{appLang==='en' ? 'Exchange Rate' : 'سعر الصرف'}: <strong>1 {refundCurrency} = {refundExRate.rate.toFixed(4)} {appCurrency}</strong> ({refundExRate.source})</div>
                <div>{appLang==='en' ? 'Base Amount' : 'المبلغ الأساسي'}: <strong>{(refundAmount * refundExRate.rate).toFixed(2)} {appCurrency}</strong></div>
              </div>
            )}
            <div className="space-y-2">
              <Label>{appLang==='en' ? 'Date' : 'التاريخ'}</Label>
              <Input type="date" value={refundDate} onChange={(e) => setRefundDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>{appLang==='en' ? 'Payment Method' : 'طريقة الصرف'}</Label>
              <Select value={refundMethod} onValueChange={setRefundMethod}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">{appLang==='en' ? 'Cash' : 'نقداً'}</SelectItem>
                  <SelectItem value="bank">{appLang==='en' ? 'Bank Transfer' : 'تحويل بنكي'}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{appLang==='en' ? 'Account' : 'الحساب'}</Label>
              <Select value={refundAccountId} onValueChange={setRefundAccountId}>
                <SelectTrigger>
                  <SelectValue placeholder={appLang==='en' ? 'Select account' : 'اختر الحساب'} />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((acc) => (
                    <SelectItem key={acc.id} value={acc.id}>{acc.account_code} - {acc.account_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{appLang==='en' ? 'Notes' : 'ملاحظات'}</Label>
              <Input value={refundNotes} onChange={(e) => setRefundNotes(e.target.value)} placeholder={appLang==='en' ? 'Optional notes' : 'ملاحظات اختيارية'} />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setRefundOpen(false)}>{appLang==='en' ? 'Cancel' : 'إلغاء'}</Button>
              <Button onClick={processCustomerRefund} className="bg-green-600 hover:bg-green-700">{appLang==='en' ? 'Confirm Refund' : 'تأكيد الصرف'}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
