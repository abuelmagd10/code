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
import { Plus, Edit2, Trash2, Search } from "lucide-react"

interface Customer {
  id: string
  name: string
  email: string
  phone: string
  city: string
  country: string
  tax_id: string
  credit_limit: number
  payment_terms: string
}

export default function CustomersPage() {
  const supabase = useSupabase()
  const [customers, setCustomers] = useState<Customer[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    city: "",
    country: "",
    tax_id: "",
    credit_limit: 0,
    payment_terms: "Net 30",
  })

  useEffect(() => {
    loadCustomers()
  }, [])

  const loadCustomers = async () => {
    try {
      setIsLoading(true)
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return

      const { data: companyData } = await supabase.from("companies").select("id").eq("user_id", user.id).single()

      if (!companyData) return

      const { data } = await supabase.from("customers").select("*").eq("company_id", companyData.id)

      setCustomers(data || [])
    } catch (error) {
      console.error("Error loading customers:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return

      const { data: companyData } = await supabase.from("companies").select("id").eq("user_id", user.id).single()

      if (!companyData) return

      if (editingId) {
        const { error } = await supabase.from("customers").update(formData).eq("id", editingId)

        if (error) throw error
      } else {
        const { error } = await supabase.from("customers").insert([{ ...formData, company_id: companyData.id }])

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
        credit_limit: 0,
        payment_terms: "Net 30",
      })
      loadCustomers()
    } catch (error) {
      console.error("Error saving customer:", error)
    }
  }

  const handleEdit = (customer: Customer) => {
    setFormData(customer)
    setEditingId(customer.id)
    setIsDialogOpen(true)
  }

  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase.from("customers").delete().eq("id", id)

      if (error) throw error
      loadCustomers()
    } catch (error) {
      console.error("Error deleting customer:", error)
    }
  }

  const filteredCustomers = customers.filter(
    (customer) =>
      customer.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      customer.email.toLowerCase().includes(searchTerm.toLowerCase()),
  )

  return (
    <div className="flex min-h-screen bg-gray-50 dark:bg-slate-950">
      <Sidebar />

      <main className="flex-1 md:mr-64 p-4 md:p-8">
        <div className="space-y-8">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">العملاء</h1>
              <p className="text-gray-600 dark:text-gray-400 mt-2">إدارة قائمة عملائك</p>
            </div>
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
                      credit_limit: 0,
                      payment_terms: "Net 30",
                    })
                  }}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  عميل جديد
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>{editingId ? "تعديل عميل" : "إضافة عميل جديد"}</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">اسم العميل</Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">البريد الإلكتروني</Label>
                    <Input
                      id="email"
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone">رقم الهاتف</Label>
                    <Input
                      id="phone"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="city">المدينة</Label>
                    <Input
                      id="city"
                      value={formData.city}
                      onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="country">الدولة</Label>
                    <Input
                      id="country"
                      value={formData.country}
                      onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="tax_id">الرقم الضريبي</Label>
                    <Input
                      id="tax_id"
                      value={formData.tax_id}
                      onChange={(e) => setFormData({ ...formData, tax_id: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="credit_limit">حد الائتمان</Label>
                    <Input
                      id="credit_limit"
                      type="number"
                      value={formData.credit_limit}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          credit_limit: Number.parseFloat(e.target.value),
                        })
                      }
                    />
                  </div>
                  <Button type="submit" className="w-full">
                    {editingId ? "تحديث" : "إضافة"}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          {/* Search Bar */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2">
                <Search className="w-4 h-4 text-gray-400" />
                <Input
                  placeholder="البحث عن عميل..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="flex-1"
                />
              </div>
            </CardContent>
          </Card>

          {/* Customers Table */}
          <Card>
            <CardHeader>
              <CardTitle>قائمة العملاء</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <p className="text-center py-8 text-gray-500">جاري التحميل...</p>
              ) : filteredCustomers.length === 0 ? (
                <p className="text-center py-8 text-gray-500">لا توجد عملاء حتى الآن</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b bg-gray-50 dark:bg-slate-900">
                      <tr>
                        <th className="px-4 py-3 text-right">الاسم</th>
                        <th className="px-4 py-3 text-right">البريد الإلكتروني</th>
                        <th className="px-4 py-3 text-right">الهاتف</th>
                        <th className="px-4 py-3 text-right">المدينة</th>
                        <th className="px-4 py-3 text-right">حد الائتمان</th>
                        <th className="px-4 py-3 text-right">الإجراءات</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredCustomers.map((customer) => (
                        <tr key={customer.id} className="border-b hover:bg-gray-50 dark:hover:bg-slate-900">
                          <td className="px-4 py-3">{customer.name}</td>
                          <td className="px-4 py-3">{customer.email}</td>
                          <td className="px-4 py-3">{customer.phone}</td>
                          <td className="px-4 py-3">{customer.city}</td>
                          <td className="px-4 py-3">{customer.credit_limit}</td>
                          <td className="px-4 py-3">
                            <div className="flex gap-2">
                              <Button variant="outline" size="sm" onClick={() => handleEdit(customer)}>
                                <Edit2 className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleDelete(customer.id)}
                                className="text-red-600 hover:text-red-700"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
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
    </div>
  )
}
