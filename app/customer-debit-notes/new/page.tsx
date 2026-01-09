"use client"

import { useState, useEffect, useMemo } from "react"
import { useSupabase } from "@/lib/supabase/hooks"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Plus, Trash2, Save } from "lucide-react"
import { useRouter } from "next/navigation"
import { Sidebar } from "@/components/sidebar"
import { CustomerSearchSelect } from "@/components/CustomerSearchSelect"
import { useToast } from "@/hooks/use-toast"
import { toastActionError, toastActionSuccess } from "@/lib/notifications"
import { BranchCostCenterSelector } from "@/components/branch-cost-center-selector"
import { canAction } from "@/lib/authz"

type Customer = {
  id: string
  name: string
  phone?: string
}

type Invoice = {
  id: string
  invoice_number: string
  invoice_date: string
  total_amount: number
}

type ItemRow = {
  description: string
  quantity: number
  unit_price: number
  tax_rate: number
  item_type: string
  line_total: number
}

export default function NewCustomerDebitNotePage() {
  const router = useRouter()
  const supabase = useSupabase()
  const { toast } = useToast()
  const [appLang, setAppLang] = useState<'ar' | 'en'>('ar')
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [customers, setCustomers] = useState<Customer[]>([])
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [saving, setSaving] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  // Branch, Cost Center, Warehouse
  const [branchId, setBranchId] = useState<string | null>(null)
  const [costCenterId, setCostCenterId] = useState<string | null>(null)
  const [warehouseId, setWarehouseId] = useState<string | null>(null)
  const [canOverrideContext, setCanOverrideContext] = useState(false)

  // Permissions
  const [permWriteCustomers, setPermWriteCustomers] = useState(false)

  // تهيئة اللغة بعد hydration
  useEffect(() => {
    try { setAppLang((localStorage.getItem('app_language') || 'ar') === 'en' ? 'en' : 'ar') } catch { }
  }, [])

  const [form, setForm] = useState({
    customer_id: '',
    source_invoice_id: '',
    debit_note_date: new Date().toISOString().slice(0, 10),
    reference_type: 'additional_fees',
    reason: '',
    notes: ''
  })

  const [items, setItems] = useState<ItemRow[]>([
    { description: '', quantity: 1, unit_price: 0, tax_rate: 14, item_type: 'charge', line_total: 0 }
  ])

  // Check permissions
  useEffect(() => {
    const checkPerms = async () => {
      const writeCustomers = await canAction(supabase, "customers", "write")
      setPermWriteCustomers(writeCustomers)
    }
    checkPerms()
  }, [supabase])

  async function loadData() {
    try {
      setIsLoading(true)
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // استخدام getActiveCompanyId لدعم المستخدمين المدعوين
      const { getActiveCompanyId } = await import("@/lib/company")
      const loadedCompanyId = await getActiveCompanyId(supabase)
      if (!loadedCompanyId) return

      setCompanyId(loadedCompanyId)
      setUserId(user.id)

      // Get user context (branch, cost center, warehouse)
      const { data: memberData } = await supabase
        .from("company_members")
        .select("role, branch_id, cost_center_id, warehouse_id")
        .eq("company_id", loadedCompanyId)
        .eq("user_id", user.id)
        .maybeSingle()

      const { data: companyData } = await supabase
        .from("companies")
        .select("user_id")
        .eq("id", loadedCompanyId)
        .single()

      const isOwner = companyData?.user_id === user.id
      const role = isOwner ? "owner" : (memberData?.role || "staff")

      // 🔐 Set default context from user (مركز التكلفة يُقرأ تلقائياً)
      if (memberData?.branch_id) setBranchId(memberData.branch_id)
      if (memberData?.cost_center_id) setCostCenterId(memberData.cost_center_id)
      if (memberData?.warehouse_id) setWarehouseId(memberData.warehouse_id)

      // Check if user can override context
      setCanOverrideContext(["owner", "admin", "manager"].includes(role))

      // 🔐 Load customers based on access control (نفس نمط صفحة العملاء)
      const { getAccessFilter } = await import("@/lib/validation")
      const accessFilter = getAccessFilter(
        role,
        user.id,
        memberData?.branch_id || null,
        memberData?.cost_center_id || null
      )

      let customersList: Customer[] = []

      if (accessFilter.filterByCreatedBy && accessFilter.createdByUserId) {
        // موظف عادي: يرى فقط العملاء الذين أنشأهم
        const { data: ownCust } = await supabase
          .from("customers")
          .select("id, name, phone")
          .eq("company_id", loadedCompanyId)
          .eq("created_by_user_id", accessFilter.createdByUserId)
          .order('name')
        customersList = ownCust || []

        // جلب العملاء المشتركين (permission_sharing)
        const { data: sharedPerms } = await supabase
          .from("permission_sharing")
          .select("grantor_user_id")
          .eq("grantee_user_id", user.id)
          .eq("company_id", loadedCompanyId)
          .eq("is_active", true)

        if (sharedPerms && sharedPerms.length > 0) {
          const grantorIds = sharedPerms.map((p: any) => p.grantor_user_id)
          const { data: sharedData } = await supabase
            .from("customers")
            .select("id, name, phone")
            .eq("company_id", loadedCompanyId)
            .in("created_by_user_id", grantorIds)
            .order('name')
          const existingIds = new Set(customersList.map(c => c.id))
            ; (sharedData || []).forEach((c: Customer) => {
              if (!existingIds.has(c.id)) customersList.push(c)
            })
        }
      } else if (accessFilter.filterByBranch && accessFilter.branchId) {
        // مدير: يرى عملاء الفرع
        const { data: branchCust } = await supabase
          .from("customers")
          .select("id, name, phone")
          .eq("company_id", loadedCompanyId)
          .eq("branch_id", accessFilter.branchId)
          .order('name')
        customersList = branchCust || []
      } else if (accessFilter.filterByCostCenter && accessFilter.costCenterId) {
        // مشرف: يرى عملاء مركز التكلفة
        const { data: ccCust } = await supabase
          .from("customers")
          .select("id, name, phone")
          .eq("company_id", loadedCompanyId)
          .eq("cost_center_id", accessFilter.costCenterId)
          .order('name')
        customersList = ccCust || []
      } else {
        // owner/admin: جميع العملاء
        const { data: allCust } = await supabase
          .from("customers")
          .select("id, name, phone")
          .eq("company_id", loadedCompanyId)
          .order('name')
        customersList = allCust || []
      }

      setCustomers(customersList)
      setIsLoading(false)
    } catch (error) {
      console.error("Error loading data:", error)
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  // Load invoices when customer changes
  useEffect(() => {
    if (form.customer_id && companyId) {
      loadInvoices()
    } else {
      setInvoices([])
    }
  }, [form.customer_id, companyId])

  async function loadInvoices() {
    if (!companyId || !form.customer_id || !userId) return

    try {
      // 🔐 تحميل الفواتير مع مراعاة صلاحيات المستخدم
      const { data: memberData } = await supabase
        .from("company_members")
        .select("role, branch_id, cost_center_id")
        .eq("company_id", companyId)
        .eq("user_id", userId)
        .maybeSingle()

      const { data: companyData } = await supabase
        .from("companies")
        .select("user_id")
        .eq("id", companyId)
        .single()

      const isOwner = companyData?.user_id === userId
      const role = isOwner ? "owner" : (memberData?.role || "staff")

      let query = supabase
        .from('invoices')
        .select('id, invoice_number, invoice_date, total_amount, branch_id, cost_center_id, warehouse_id, created_by_user_id')
        .eq('company_id', companyId)
        .eq('customer_id', form.customer_id)
        .in('status', ['sent', 'paid', 'partially_paid', 'overdue'])

      // تصفية حسب الصلاحيات
      if (role === 'staff') {
        // الموظف يرى فقط فواتيره
        query = query.eq('created_by_user_id', userId)
      } else if (role === 'manager' && memberData?.branch_id) {
        // المدير يرى فواتير فرعه
        query = query.eq('branch_id', memberData.branch_id)
      } else if (role === 'accountant' && memberData?.cost_center_id) {
        // المحاسب يرى فواتير مركز تكلفته
        query = query.eq('cost_center_id', memberData.cost_center_id)
      }
      // owner/admin يرون جميع الفواتير

      const { data } = await query
        .order('invoice_date', { ascending: false })
        .limit(100)

      setInvoices(data || [])
    } catch (error) {
      console.error('Error loading invoices:', error)
      setInvoices([])
    }
  }

  // Update item calculations
  const updateItem = (idx: number, patch: Partial<ItemRow>) => {
    setItems(prev => {
      const next = [...prev]
      next[idx] = { ...next[idx], ...patch }
      const qty = Number(next[idx].quantity || 0)
      const price = Number(next[idx].unit_price || 0)
      const taxRate = Number(next[idx].tax_rate || 0)
      const subtotal = qty * price
      const tax = subtotal * (taxRate / 100)
      next[idx].line_total = Number((subtotal + tax).toFixed(2))
      return next
    })
  }

  const addItem = () => setItems(prev => [...prev, { description: '', quantity: 1, unit_price: 0, tax_rate: 14, item_type: 'charge', line_total: 0 }])
  const removeItem = (idx: number) => setItems(prev => prev.filter((_, i) => i !== idx))

  // Calculations
  const subtotal = useMemo(() => items.reduce((sum, it) => {
    const qty = Number(it.quantity || 0)
    const price = Number(it.unit_price || 0)
    return sum + (qty * price)
  }, 0), [items])

  const taxAmount = useMemo(() => items.reduce((sum, it) => {
    const qty = Number(it.quantity || 0)
    const price = Number(it.unit_price || 0)
    const taxRate = Number(it.tax_rate || 0)
    return sum + ((qty * price) * (taxRate / 100))
  }, 0), [items])

  const total = subtotal + taxAmount

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (!companyId || !userId) {
      toastActionError(toast, appLang === 'en' ? 'Missing required data' : 'بيانات مفقودة', appLang)
      return
    }

    if (!form.customer_id || !form.source_invoice_id) {
      toastActionError(toast, appLang === 'en' ? 'Please select customer and invoice' : 'الرجاء اختيار العميل والفاتورة', appLang)
      return
    }

    if (items.length === 0 || items.every(it => !it.description)) {
      toastActionError(toast, appLang === 'en' ? 'Please add at least one item' : 'الرجاء إضافة بند واحد على الأقل', appLang)
      return
    }

    setSaving(true)

    try {
      // Prepare items JSON
      const itemsJson = items
        .filter(it => it.description.trim())
        .map(it => ({
          description: it.description,
          quantity: Number(it.quantity),
          unit_price: Number(it.unit_price),
          tax_rate: Number(it.tax_rate),
          item_type: it.item_type
        }))

      // Call the create function
      const { data, error } = await supabase.rpc('create_customer_debit_note', {
        p_company_id: companyId,
        p_branch_id: branchId,
        p_cost_center_id: costCenterId,
        p_customer_id: form.customer_id,
        p_source_invoice_id: form.source_invoice_id,
        p_debit_note_date: form.debit_note_date,
        p_reference_type: form.reference_type,
        p_reason: form.reason,
        p_items: itemsJson,
        p_notes: form.notes,
        p_created_by: userId
      })

      if (error) throw error

      // إنشاء إشعار للمحاسب والمدير
      if (data && data.id) {
        try {
          const { notifyCustomerDebitNoteCreated } = await import('@/lib/notification-helpers')
          await notifyCustomerDebitNoteCreated({
            companyId,
            debitNoteId: data.id,
            branchId: branchId || undefined,
            costCenterId: costCenterId || undefined,
            createdBy: userId,
            appLang
          })
        } catch (notifError) {
          console.error("Error creating notification:", notifError)
          // لا نوقف العملية إذا فشل إنشاء الإشعار
        }
      }

      toastActionSuccess(toast, appLang === 'en' ? 'Debit note created successfully' : 'تم إنشاء الإشعار بنجاح', appLang)
      router.push('/customer-debit-notes')
    } catch (error: any) {
      console.error('Error creating debit note:', error)
      toastActionError(toast, error.message || (appLang === 'en' ? 'Failed to create debit note' : 'فشل إنشاء الإشعار'), appLang)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
      <Sidebar />
      <main className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8 space-y-4 sm:space-y-6 overflow-x-hidden">
        <Card>
          <CardHeader>
            <CardTitle className="text-base sm:text-lg">
              {appLang === 'en' ? 'New Customer Debit Note' : 'إشعار مدين عميل جديد'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Branch & Cost Center Selector */}
              <BranchCostCenterSelector
                companyId={companyId}
                branchId={branchId}
                costCenterId={costCenterId}
                onBranchChange={setBranchId}
                onCostCenterChange={setCostCenterId}
                canOverride={canOverrideContext}
                lang={appLang}
              />

              {/* Header Info */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>{appLang === 'en' ? 'Customer' : 'العميل'} *</Label>
                  <CustomerSearchSelect
                    customers={customers}
                    value={form.customer_id}
                    onValueChange={(v) => setForm({ ...form, customer_id: v, source_invoice_id: '' })}
                    placeholder={appLang === 'en' ? 'Select customer' : 'اختر العميل'}
                    canCreate={permWriteCustomers}
                  />
                </div>

                <div className="space-y-2">
                  <Label>{appLang === 'en' ? 'Source Invoice' : 'الفاتورة المصدر'} *</Label>
                  <select
                    className="w-full border rounded px-3 py-2 dark:bg-slate-800 dark:border-slate-700"
                    value={form.source_invoice_id}
                    onChange={(e) => setForm({ ...form, source_invoice_id: e.target.value })}
                    disabled={!form.customer_id}
                  >
                    <option value="">{appLang === 'en' ? 'Select invoice' : 'اختر الفاتورة'}</option>
                    {invoices.map(inv => (
                      <option key={inv.id} value={inv.id}>
                        {inv.invoice_number} - {new Date(inv.invoice_date).toLocaleDateString(appLang === 'en' ? 'en-US' : 'ar-EG')} - {inv.total_amount.toFixed(2)}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <Label>{appLang === 'en' ? 'Date' : 'التاريخ'} *</Label>
                  <Input
                    type="date"
                    value={form.debit_note_date}
                    onChange={(e) => setForm({ ...form, debit_note_date: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{appLang === 'en' ? 'Reference Type' : 'نوع المرجع'} *</Label>
                  <select
                    className="w-full border rounded px-3 py-2 dark:bg-slate-800 dark:border-slate-700"
                    value={form.reference_type}
                    onChange={(e) => setForm({ ...form, reference_type: e.target.value })}
                  >
                    <option value="additional_fees">{appLang === 'en' ? 'Additional Fees' : 'رسوم إضافية'}</option>
                    <option value="price_difference">{appLang === 'en' ? 'Price Difference' : 'فرق سعر'}</option>
                    <option value="penalty">{appLang === 'en' ? 'Penalty' : 'غرامة'}</option>
                    <option value="correction">{appLang === 'en' ? 'Correction' : 'تصحيح'}</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <Label>{appLang === 'en' ? 'Reason' : 'السبب'} *</Label>
                  <Input
                    value={form.reason}
                    onChange={(e) => setForm({ ...form, reason: e.target.value })}
                    placeholder={appLang === 'en' ? 'Enter reason' : 'أدخل السبب'}
                  />
                </div>
              </div>

              {/* Items Table */}
              <div className="space-y-2">
                <Label>{appLang === 'en' ? 'Items' : 'البنود'}</Label>
                <div className="overflow-x-auto">
                  <table className="w-full border text-sm">
                    <thead className="bg-gray-100 dark:bg-slate-800">
                      <tr>
                        <th className="p-2 text-right">{appLang === 'en' ? 'Description' : 'الوصف'}</th>
                        <th className="p-2 text-right w-24">{appLang === 'en' ? 'Qty' : 'الكمية'}</th>
                        <th className="p-2 text-right w-32">{appLang === 'en' ? 'Price' : 'السعر'}</th>
                        <th className="p-2 text-right w-24">{appLang === 'en' ? 'Tax %' : 'الضريبة %'}</th>
                        <th className="p-2 text-right w-32">{appLang === 'en' ? 'Total' : 'الإجمالي'}</th>
                        <th className="p-2 w-16"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((it, idx) => (
                        <tr key={idx} className="border-t">
                          <td className="p-2">
                            <Input
                              value={it.description}
                              onChange={(e) => updateItem(idx, { description: e.target.value })}
                              placeholder={appLang === 'en' ? 'Item description' : 'وصف البند'}
                            />
                          </td>
                          <td className="p-2">
                            <Input
                              type="number"
                              min="0"
                              step="0.01"
                              value={it.quantity}
                              onChange={(e) => updateItem(idx, { quantity: Number(e.target.value) })}
                            />
                          </td>
                          <td className="p-2">
                            <Input
                              type="number"
                              min="0"
                              step="0.01"
                              value={it.unit_price}
                              onChange={(e) => updateItem(idx, { unit_price: Number(e.target.value) })}
                            />
                          </td>
                          <td className="p-2">
                            <Input
                              type="number"
                              min="0"
                              max="100"
                              step="0.01"
                              value={it.tax_rate}
                              onChange={(e) => updateItem(idx, { tax_rate: Number(e.target.value) })}
                            />
                          </td>
                          <td className="p-2 text-right font-semibold">
                            {it.line_total.toFixed(2)}
                          </td>
                          <td className="p-2">
                            {items.length > 1 && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => removeItem(idx)}
                                className="h-8 w-8"
                              >
                                <Trash2 className="h-4 w-4 text-red-500" />
                              </Button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Button type="button" variant="outline" onClick={addItem} className="mt-2">
                  <Plus className="h-4 w-4 mr-2" />
                  {appLang === 'en' ? 'Add Item' : 'إضافة بند'}
                </Button>
              </div>

              {/* Totals */}
              <div className="border-t pt-4">
                <div className="flex flex-col items-end gap-2 text-sm">
                  <div>{appLang === 'en' ? 'Subtotal' : 'المجموع'}: <span className="font-semibold">{subtotal.toFixed(2)}</span></div>
                  <div>{appLang === 'en' ? 'Tax' : 'الضريبة'}: <span className="font-semibold">{taxAmount.toFixed(2)}</span></div>
                  <div className="text-lg">{appLang === 'en' ? 'Total' : 'الإجمالي'}: <span className="font-bold">{total.toFixed(2)}</span></div>
                </div>
              </div>

              {/* Notes */}
              <div className="space-y-2">
                <Label>{appLang === 'en' ? 'Notes' : 'ملاحظات'}</Label>
                <Textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  placeholder={appLang === 'en' ? 'Optional notes' : 'ملاحظات اختيارية'}
                  rows={3}
                />
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => router.push('/customer-debit-notes')}
                  disabled={saving}
                >
                  {appLang === 'en' ? 'Cancel' : 'إلغاء'}
                </Button>
                <Button type="submit" disabled={saving} className="bg-blue-600 hover:bg-blue-700">
                  <Save className="h-4 w-4 mr-2" />
                  {saving ? (appLang === 'en' ? 'Saving...' : 'جاري الحفظ...') : (appLang === 'en' ? 'Save' : 'حفظ')}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}

