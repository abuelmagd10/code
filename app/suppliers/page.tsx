"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog"
import { useSupabase } from "@/lib/supabase/hooks"
import { useToast } from "@/hooks/use-toast"
import { toastActionError } from "@/lib/notifications"
import { getActiveCompanyId } from "@/lib/company"
import { canAction } from "@/lib/authz"
import { Plus, Edit2, Trash2, Search, Truck } from "lucide-react"
import { PageContainer } from "@/components/ui/page-container"
import { PageHeader } from "@/components/ui/page-header"

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
    <PageContainer>
      <PageHeader
        title="الموردين"
        titleEn="Suppliers"
        description="إدارة قائمة موردينك"
        descriptionEn="Manage your suppliers list"
        icon={Truck}
        iconColor="orange"
        lang={appLang}
      >
        {permWrite ? (
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button
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
              <Plus className="w-4 h-4 ml-2" />
              {appLang==='en' ? 'New Supplier' : 'مورد جديد'}
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{editingId ? (appLang==='en' ? 'Edit Supplier' : 'تعديل مورد') : (appLang==='en' ? 'Add New Supplier' : 'إضافة مورد جديد')}</DialogTitle>
              <DialogDescription className="sr-only">{editingId ? 'تعديل بيانات المورد' : 'إضافة مورد جديد'}</DialogDescription>
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

        <Card className="bg-white dark:bg-slate-900 border-0 shadow-sm">
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

        <Card className="bg-white dark:bg-slate-900 border-0 shadow-sm">
          <CardHeader className="border-b border-gray-100 dark:border-slate-800">
            <CardTitle>{appLang==='en' ? 'Suppliers List' : 'قائمة الموردين'}</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-600" />
              </div>
            ) : filteredSuppliers.length === 0 ? (
              <p className="text-center py-12 text-gray-500">{appLang==='en' ? 'No suppliers yet' : 'لا يوجد موردين حتى الآن'}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-[640px] w-full text-sm">
                  <thead className="border-b bg-gray-50 dark:bg-slate-800/50">
                    <tr>
                      <th className="px-4 py-3 text-right font-semibold text-gray-600 dark:text-gray-300">{appLang==='en' ? 'Name' : 'الاسم'}</th>
                      <th className="px-4 py-3 text-right font-semibold text-gray-600 dark:text-gray-300">{appLang==='en' ? 'Email' : 'البريد الإلكتروني'}</th>
                      <th className="px-4 py-3 text-right font-semibold text-gray-600 dark:text-gray-300">{appLang==='en' ? 'Phone' : 'الهاتف'}</th>
                      <th className="px-4 py-3 text-right font-semibold text-gray-600 dark:text-gray-300">{appLang==='en' ? 'City' : 'المدينة'}</th>
                      <th className="px-4 py-3 text-right font-semibold text-gray-600 dark:text-gray-300">{appLang==='en' ? 'Payment Terms' : 'شروط الدفع'}</th>
                      {(permUpdate || permDelete) ? (<th className="px-4 py-3 text-right font-semibold text-gray-600 dark:text-gray-300">{appLang==='en' ? 'Actions' : 'الإجراءات'}</th>) : null}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
                    {filteredSuppliers.map((supplier) => (
                      <tr key={supplier.id} className="hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-colors">
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
      </PageHeader>
    </PageContainer>
  )
}
