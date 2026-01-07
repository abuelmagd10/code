'use client'

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Plus, Trash2, Save } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { Sidebar } from '@/components/sidebar'
import { getActiveCompanyId } from '@/lib/company'
import { CustomerSearchSelect } from '@/components/CustomerSearchSelect'
import { toast } from '@/hooks/use-toast'

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
  const supabase = createClient()
  const [appLang, setAppLang] = useState<'ar' | 'en'>('ar')
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [branchId, setBranchId] = useState<string | null>(null)
  const [customers, setCustomers] = useState<Customer[]>([])
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [saving, setSaving] = useState(false)

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

  useEffect(() => {
    const lang = localStorage.getItem('appLanguage') as 'ar' | 'en' || 'ar'
    setAppLang(lang)
    loadData()
  }, [])

  async function loadData() {
    const loadedCompanyId = await getActiveCompanyId()
    if (!loadedCompanyId) {
      router.push('/dashboard')
      return
    }
    setCompanyId(loadedCompanyId)

    // Get user ID
    const { data: { user } } = await supabase.auth.getUser()
    if (user) setUserId(user.id)

    // Get user's branch
    const { data: member } = await supabase
      .from('company_members')
      .select('branch_id')
      .eq('company_id', loadedCompanyId)
      .eq('user_id', user?.id)
      .single()

    if (member?.branch_id) setBranchId(member.branch_id)

    // Load customers
    const { data: customersList } = await supabase
      .from('customers')
      .select('id, name, phone')
      .eq('company_id', loadedCompanyId)
      .order('name')

    setCustomers(customersList || [])
  }

  // Load invoices when customer changes
  useEffect(() => {
    if (form.customer_id && companyId) {
      loadInvoices()
    } else {
      setInvoices([])
    }
  }, [form.customer_id, companyId])

  async function loadInvoices() {
    const { data } = await supabase
      .from('invoices')
      .select('id, invoice_number, invoice_date, total_amount')
      .eq('company_id', companyId)
      .eq('customer_id', form.customer_id)
      .eq('status', 'sent')
      .order('invoice_date', { ascending: false })
      .limit(50)

    setInvoices(data || [])
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

    if (!companyId || !userId || !branchId) {
      toast({ title: appLang === 'en' ? 'Error' : 'خطأ', description: appLang === 'en' ? 'Missing required data' : 'بيانات مفقودة', variant: 'destructive' })
      return
    }

    if (!form.customer_id || !form.source_invoice_id) {
      toast({ title: appLang === 'en' ? 'Error' : 'خطأ', description: appLang === 'en' ? 'Please select customer and invoice' : 'الرجاء اختيار العميل والفاتورة', variant: 'destructive' })
      return
    }

    if (items.length === 0 || items.every(it => !it.description)) {
      toast({ title: appLang === 'en' ? 'Error' : 'خطأ', description: appLang === 'en' ? 'Please add at least one item' : 'الرجاء إضافة بند واحد على الأقل', variant: 'destructive' })
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
        p_cost_center_id: null,
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

      toast({
        title: appLang === 'en' ? 'Success' : 'نجح',
        description: appLang === 'en' ? 'Debit note created successfully' : 'تم إنشاء الإشعار بنجاح'
      })

      router.push(`/customer-debit-notes/${data.debit_note_id}`)
    } catch (error: any) {
      console.error('Error creating debit note:', error)
      toast({
        title: appLang === 'en' ? 'Error' : 'خطأ',
        description: error.message || (appLang === 'en' ? 'Failed to create debit note' : 'فشل إنشاء الإشعار'),
        variant: 'destructive'
      })
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
              {/* Header Info */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>{appLang === 'en' ? 'Customer' : 'العميل'} *</Label>
                  <CustomerSearchSelect
                    customers={customers}
                    value={form.customer_id}
                    onValueChange={(v) => setForm({ ...form, customer_id: v, source_invoice_id: '' })}
                    placeholder={appLang === 'en' ? 'Select customer' : 'اختر العميل'}
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

