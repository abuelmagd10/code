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
import { useToast } from "@/hooks/use-toast"
import { toastActionError } from "@/lib/notifications"
import { getActiveCompanyId } from "@/lib/company"
import { canAction } from "@/lib/authz"
import { Plus, Edit2, Trash2, Search, Truck } from "lucide-react"

interface Supplier {
  id: string
  name: string
  email: string
  phone: string
  city: string
  country: string
  tax_id: string
  payment_terms: string
}

export default function SuppliersPage() {
  const supabase = useSupabase()
  const { toast } = useToast()
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const appLang = typeof window !== 'undefined' ? ((localStorage.getItem('app_language') || 'ar') === 'en' ? 'en' : 'ar') : 'ar'

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
  const [permView, setPermView] = useState(true)
  const [permWrite, setPermWrite] = useState(false)
  const [permUpdate, setPermUpdate] = useState(false)
  const [permDelete, setPermDelete] = useState(false)
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    city: "",
    country: "",
    tax_id: "",
    payment_terms: "Net 30",
  })

  useEffect(() => {
    (async () => {
      setPermView(await canAction(supabase, 'suppliers', 'read'))
      setPermWrite(await canAction(supabase, 'suppliers', 'write'))
      setPermUpdate(await canAction(supabase, 'suppliers', 'update'))
      setPermDelete(await canAction(supabase, 'suppliers', 'delete'))
    })()
    loadSuppliers()
  }, [])
  useEffect(() => {
    const reloadPerms = async () => {
      setPermView(await canAction(supabase, 'suppliers', 'read'))
      setPermWrite(await canAction(supabase, 'suppliers', 'write'))
      setPermUpdate(await canAction(supabase, 'suppliers', 'update'))
      setPermDelete(await canAction(supabase, 'suppliers', 'delete'))
    }
    const handler = () => { reloadPerms() }
    if (typeof window !== 'undefined') window.addEventListener('permissions_updated', handler)
    return () => { if (typeof window !== 'undefined') window.removeEventListener('permissions_updated', handler) }
  }, [])

  const loadSuppliers = async () => {
    try {
      setIsLoading(true)
      const companyId = await getActiveCompanyId(supabase)
      if (!companyId) return

      const { data, error } = await supabase.from("suppliers").select("*").eq("company_id", companyId)
      if (error) {
        toastActionError(toast, "الجلب", "الموردين", "تعذر جلب قائمة الموردين")
      }

      setSuppliers(data || [])
    } catch (error) {
      console.error("Error loading suppliers:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const companyId = await getActiveCompanyId(supabase)
      if (!companyId) return

      if (editingId) {
        const { error } = await supabase.from("suppliers").update(formData).eq("id", editingId)

        if (error) throw error
      } else {
        const { error } = await supabase.from("suppliers").insert([{ ...formData, company_id: companyId }])

        if (error) throw error
      }

      setIsDialogOpen(false)
      setEditingId(null)
      setFormData({
        name: "",
        email: "",
        phone: "",
        city: "",
        country: "",
        tax_id: "",
        payment_terms: "Net 30",
      })
      loadSuppliers()
    } catch (error) {
      console.error("Error saving supplier:", error)
    }
  }

  const handleEdit = (supplier: Supplier) => {
    setFormData(supplier)
    setEditingId(supplier.id)
    setIsDialogOpen(true)
  }

  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase.from("suppliers").delete().eq("id", id)

      if (error) throw error
      loadSuppliers()
    } catch (error) {
      console.error("Error deleting supplier:", error)
      toastActionError(toast, "الحذف", "المورد", "تعذر حذف المورد")
    }
  }

  const filteredSuppliers = suppliers.filter(
    (supplier) =>
      supplier.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      supplier.email.toLowerCase().includes(searchTerm.toLowerCase()),
  )

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
                <div className="p-2 sm:p-3 bg-orange-100 dark:bg-orange-900/30 rounded-lg sm:rounded-xl flex-shrink-0">
                  <Truck className="w-5 h-5 sm:w-6 sm:h-6 text-orange-600 dark:text-orange-400" />
                </div>
                <div className="min-w-0">
                  <h1 className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white truncate">{appLang==='en' ? 'Suppliers' : 'الموردين'}</h1>
                  <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-0.5 sm:mt-1 truncate">{appLang==='en' ? 'Manage suppliers' : 'إدارة الموردين'}</p>
                </div>
              </div>
            {permWrite ? (
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button
                  className="h-10 sm:h-11 text-sm sm:text-base px-3 sm:px-4 self-start sm:self-auto"
                  onClick={() => {
                    setEditingId(null)
                    setFormData({
                      name: "",
                      email: "",
                      phone: "",
                      city: "",
                      country: "",
                      tax_id: "",
                      payment_terms: "Net 30",
                    })
                  }}
                >
                  <Plus className="w-4 h-4 ml-1 sm:ml-2" />
                  {appLang==='en' ? 'New' : 'جديد'}
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>{editingId ? (appLang==='en' ? 'Edit Supplier' : 'تعديل مورد') : (appLang==='en' ? 'Add New Supplier' : 'إضافة مورد جديد')}</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">{appLang==='en' ? 'Supplier Name' : 'اسم المورد'}</Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">{appLang==='en' ? 'Email' : 'البريد الإلكتروني'}</Label>
                    <Input
                      id="email"
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone">{appLang==='en' ? 'Phone' : 'رقم الهاتف'}</Label>
                    <Input
                      id="phone"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="city">{appLang==='en' ? 'City' : 'المدينة'}</Label>
                    <Input
                      id="city"
                      value={formData.city}
                      onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="country">{appLang==='en' ? 'Country' : 'الدولة'}</Label>
                    <Input
                      id="country"
                      value={formData.country}
                      onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="tax_id">{appLang==='en' ? 'Tax ID' : 'الرقم الضريبي'}</Label>
                    <Input
                      id="tax_id"
                      value={formData.tax_id}
                      onChange={(e) => setFormData({ ...formData, tax_id: e.target.value })}
                    />
                  </div>
                  <Button type="submit" className="w-full">
                    {editingId ? (appLang==='en' ? 'Update' : 'تحديث') : (appLang==='en' ? 'Add' : 'إضافة')}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
            ) : null}
            </div>
          </div>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2">
                <Search className="w-4 h-4 text-gray-400" />
                <Input
                  placeholder={appLang==='en' ? 'Search supplier...' : 'البحث عن مورد...'}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="flex-1"
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{appLang==='en' ? 'Suppliers List' : 'قائمة الموردين'}</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <p className="text-center py-8 text-gray-500">{appLang==='en' ? 'Loading...' : 'جاري التحميل...'}</p>
              ) : filteredSuppliers.length === 0 ? (
                <p className="text-center py-8 text-gray-500">{appLang==='en' ? 'No suppliers yet' : 'لا يوجد موردين حتى الآن'}</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-[640px] w-full text-sm">
                    <thead className="border-b bg-gray-50 dark:bg-slate-900">
                      <tr>
                        <th className="px-4 py-3 text-right">{appLang==='en' ? 'Name' : 'الاسم'}</th>
                        <th className="px-4 py-3 text-right">{appLang==='en' ? 'Email' : 'البريد الإلكتروني'}</th>
                        <th className="px-4 py-3 text-right">{appLang==='en' ? 'Phone' : 'الهاتف'}</th>
                        <th className="px-4 py-3 text-right">{appLang==='en' ? 'City' : 'المدينة'}</th>
                        <th className="px-4 py-3 text-right">{appLang==='en' ? 'Payment Terms' : 'شروط الدفع'}</th>
                        {(permUpdate || permDelete) ? (<th className="px-4 py-3 text-right">{appLang==='en' ? 'Actions' : 'الإجراءات'}</th>) : null}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredSuppliers.map((supplier) => (
                        <tr key={supplier.id} className="border-b hover:bg-gray-50 dark:hover:bg-slate-900">
                          <td className="px-4 py-3">{supplier.name}</td>
                          <td className="px-4 py-3">{supplier.email}</td>
                          <td className="px-4 py-3">{supplier.phone}</td>
                          <td className="px-4 py-3">{supplier.city}</td>
                          <td className="px-4 py-3">{supplier.payment_terms}</td>
                          {(permUpdate || permDelete) ? (
                            <td className="px-4 py-3">
                              <div className="flex gap-2 flex-wrap">
                                {permUpdate ? (
                                  <Button variant="outline" size="sm" onClick={() => handleEdit(supplier)}>
                                    <Edit2 className="w-4 ه-4" />
                                  </Button>
                                ) : null}
                                {permDelete ? (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleDelete(supplier.id)}
                                    className="text-red-600 hover:text-red-700"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </Button>
                                ) : null}
                              </div>
                            </td>
                          ) : null}
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
    </div>
  )
}
