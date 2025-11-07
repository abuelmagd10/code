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

interface Account {
  id: string
  account_code: string
  account_name: string
  account_type: string
  description: string
  opening_balance: number
  is_active: boolean
}

const ACCOUNT_TYPES = [
  { value: "asset", label: "أصول" },
  { value: "liability", label: "التزامات" },
  { value: "equity", label: "حقوق الملكية" },
  { value: "income", label: "الإيرادات" },
  { value: "expense", label: "المصروفات" },
]

export default function ChartOfAccountsPage() {
  const supabase = useSupabase()
  const [accounts, setAccounts] = useState<Account[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [filterType, setFilterType] = useState<string>("all")
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formData, setFormData] = useState({
    account_code: "",
    account_name: "",
    account_type: "asset",
    description: "",
    opening_balance: 0,
  })

  useEffect(() => {
    loadAccounts()
  }, [])

  const loadAccounts = async () => {
    try {
      setIsLoading(true)

      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return

      const { data: companyData } = await supabase.from("companies").select("id").eq("user_id", user.id).single()

      if (!companyData) return

      const { data } = await supabase
        .from("chart_of_accounts")
        .select("*")
        .eq("company_id", companyData.id)
        .order("account_code")

      setAccounts(data || [])
    } catch (error) {
      console.error("Error loading accounts:", error)
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
        const { error } = await supabase.from("chart_of_accounts").update(formData).eq("id", editingId)

        if (error) throw error
      } else {
        const { error } = await supabase.from("chart_of_accounts").insert([{ ...formData, company_id: companyData.id }])

        if (error) throw error
      }

      setIsDialogOpen(false)
      setEditingId(null)
      setFormData({
        account_code: "",
        account_name: "",
        account_type: "asset",
        description: "",
        opening_balance: 0,
      })
      loadAccounts()
    } catch (error) {
      console.error("Error saving account:", error)
    }
  }

  const handleEdit = (account: Account) => {
    setFormData({
      account_code: account.account_code,
      account_name: account.account_name,
      account_type: account.account_type,
      description: account.description,
      opening_balance: account.opening_balance,
    })
    setEditingId(account.id)
    setIsDialogOpen(true)
  }

  const handleDelete = async (id: string) => {
    if (!confirm("هل أنت متأكد من حذف هذا الحساب؟")) return

    try {
      const { error } = await supabase.from("chart_of_accounts").delete().eq("id", id)

      if (error) throw error
      loadAccounts()
    } catch (error) {
      console.error("Error deleting account:", error)
    }
  }

  const filteredAccounts = accounts.filter((account) => {
    const matchSearch =
      account.account_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      account.account_code.toLowerCase().includes(searchTerm.toLowerCase())
    const matchType = filterType === "all" || account.account_type === filterType
    return matchSearch && matchType
  })

  const getTypeLabel = (type: string) => {
    return ACCOUNT_TYPES.find((t) => t.value === type)?.label || type
  }

  const getTypeColor = (type: string) => {
    const colors: Record<string, string> = {
      asset: "bg-blue-100 text-blue-800",
      liability: "bg-red-100 text-red-800",
      equity: "bg-purple-100 text-purple-800",
      income: "bg-green-100 text-green-800",
      expense: "bg-orange-100 text-orange-800",
    }
    return colors[type] || "bg-gray-100 text-gray-800"
  }

  return (
    <div className="flex min-h-screen bg-gray-50 dark:bg-slate-950">
      <Sidebar />

      <main className="flex-1 md:mr-64 p-4 md:p-8">
        <div className="space-y-8">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">الشجرة المحاسبية</h1>
              <p className="text-gray-600 dark:text-gray-400 mt-2">إدارة الحسابات المحاسبية</p>
            </div>
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button
                  onClick={() => {
                    setEditingId(null)
                    setFormData({
                      account_code: "",
                      account_name: "",
                      account_type: "asset",
                      description: "",
                      opening_balance: 0,
                    })
                  }}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  حساب جديد
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>{editingId ? "تعديل حساب" : "إضافة حساب جديد"}</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="account_code">رمز الحساب</Label>
                    <Input
                      id="account_code"
                      value={formData.account_code}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          account_code: e.target.value,
                        })
                      }
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="account_name">اسم الحساب</Label>
                    <Input
                      id="account_name"
                      value={formData.account_name}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          account_name: e.target.value,
                        })
                      }
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="account_type">نوع الحساب</Label>
                    <select
                      id="account_type"
                      value={formData.account_type}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          account_type: e.target.value,
                        })
                      }
                      className="w-full px-3 py-2 border rounded-lg"
                    >
                      {ACCOUNT_TYPES.map((type) => (
                        <option key={type.value} value={type.value}>
                          {type.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="description">الوصف</Label>
                    <Input
                      id="description"
                      value={formData.description}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          description: e.target.value,
                        })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="opening_balance">الرصيد الافتتاحي</Label>
                    <Input
                      id="opening_balance"
                      type="number"
                      step="0.01"
                      value={formData.opening_balance}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          opening_balance: Number.parseFloat(e.target.value),
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

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-2">
                  <Search className="w-4 h-4 text-gray-400" />
                  <Input
                    placeholder="البحث عن حساب..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="flex-1"
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <select
                  value={filterType}
                  onChange={(e) => setFilterType(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg"
                >
                  <option value="all">جميع الأنواع</option>
                  {ACCOUNT_TYPES.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            {ACCOUNT_TYPES.map((type) => {
              const count = accounts.filter((a) => a.account_type === type.value).length
              return (
                <Card key={type.value}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">{type.label}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{count}</div>
                  </CardContent>
                </Card>
              )
            })}
          </div>

          <Card>
            <CardHeader>
              <CardTitle>الحسابات</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <p className="text-center py-8 text-gray-500">جاري التحميل...</p>
              ) : filteredAccounts.length === 0 ? (
                <p className="text-center py-8 text-gray-500">لا توجد حسابات حتى الآن</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b bg-gray-50 dark:bg-slate-900">
                      <tr>
                        <th className="px-4 py-3 text-right">الرمز</th>
                        <th className="px-4 py-3 text-right">الاسم</th>
                        <th className="px-4 py-3 text-right">النوع</th>
                        <th className="px-4 py-3 text-right">الرصيد الافتتاحي</th>
                        <th className="px-4 py-3 text-right">الوصف</th>
                        <th className="px-4 py-3 text-right">الإجراءات</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredAccounts.map((account) => (
                        <tr key={account.id} className="border-b hover:bg-gray-50 dark:hover:bg-slate-900">
                          <td className="px-4 py-3 font-medium">{account.account_code}</td>
                          <td className="px-4 py-3">{account.account_name}</td>
                          <td className="px-4 py-3">
                            <span
                              className={`px-2 py-1 rounded text-xs font-medium ${getTypeColor(account.account_type)}`}
                            >
                              {getTypeLabel(account.account_type)}
                            </span>
                          </td>
                          <td className="px-4 py-3">{account.opening_balance.toFixed(2)}</td>
                          <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{account.description}</td>
                          <td className="px-4 py-3">
                            <div className="flex gap-2">
                              <Button variant="outline" size="sm" onClick={() => handleEdit(account)}>
                                <Edit2 className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleDelete(account.id)}
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
