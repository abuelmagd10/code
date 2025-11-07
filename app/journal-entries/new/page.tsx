"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { Sidebar } from "@/components/sidebar"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useSupabase } from "@/lib/supabase/hooks"
import { useRouter } from "next/navigation"
import { Trash2, Plus } from "lucide-react"

interface Account {
  id: string
  account_code: string
  account_name: string
}

interface EntryLine {
  account_id: string
  debit_amount: number
  credit_amount: number
  description: string
}

export default function NewJournalEntryPage() {
  const supabase = useSupabase()
  const [accounts, setAccounts] = useState<Account[]>([])
  const [entryLines, setEntryLines] = useState<EntryLine[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const router = useRouter()

  const [formData, setFormData] = useState({
    entry_date: new Date().toISOString().split("T")[0],
    description: "",
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

      const { data: accountsData } = await supabase
        .from("chart_of_accounts")
        .select("id, account_code, account_name")
        .eq("company_id", companyData.id)
        .order("account_code")

      setAccounts(accountsData || [])
    } catch (error) {
      console.error("Error loading accounts:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const addEntryLine = () => {
    setEntryLines([
      ...entryLines,
      {
        account_id: "",
        debit_amount: 0,
        credit_amount: 0,
        description: "",
      },
    ])
  }

  const removeEntryLine = (index: number) => {
    setEntryLines(entryLines.filter((_, i) => i !== index))
  }

  const updateEntryLine = (index: number, field: string, value: any) => {
    const newLines = [...entryLines]
    ;(newLines[index] as any)[field] = value
    setEntryLines(newLines)
  }

  const calculateTotals = () => {
    let totalDebit = 0
    let totalCredit = 0

    entryLines.forEach((line) => {
      totalDebit += line.debit_amount
      totalCredit += line.credit_amount
    })

    return { totalDebit, totalCredit }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (entryLines.length === 0) {
      alert("يرجى إضافة عناصر للقيد")
      return
    }

    const { totalDebit, totalCredit } = calculateTotals()
    if (Math.abs(totalDebit - totalCredit) > 0.01) {
      alert("الديون والدائنين غير متوازنة")
      return
    }

    try {
      setIsSaving(true)

      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return

      const { data: companyData } = await supabase.from("companies").select("id").eq("user_id", user.id).single()

      if (!companyData) return

      // Create journal entry
      const { data: entryData, error: entryError } = await supabase
        .from("journal_entries")
        .insert([
          {
            company_id: companyData.id,
            entry_date: formData.entry_date,
            description: formData.description,
            reference_type: "manual_entry",
          },
        ])
        .select()
        .single()

      if (entryError) throw entryError

      // Create journal entry lines
      const linesToInsert = entryLines.map((line) => ({
        journal_entry_id: entryData.id,
        account_id: line.account_id,
        debit_amount: line.debit_amount,
        credit_amount: line.credit_amount,
        description: line.description,
      }))

      const { error: linesError } = await supabase.from("journal_entry_lines").insert(linesToInsert)

      if (linesError) throw linesError

      router.push("/journal-entries")
    } catch (error) {
      console.error("Error creating entry:", error)
      alert("خطأ في إنشاء القيد")
    } finally {
      setIsSaving(false)
    }
  }

  const { totalDebit, totalCredit } = calculateTotals()
  const isBalanced = Math.abs(totalDebit - totalCredit) < 0.01

  return (
    <div className="flex min-h-screen bg-gray-50 dark:bg-slate-950">
      <Sidebar />

      <main className="flex-1 md:mr-64 p-4 md:p-8">
        <div className="space-y-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">قيد يومي جديد</h1>
            <p className="text-gray-600 dark:text-gray-400 mt-2">إضافة قيد يومي جديد</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>بيانات القيد</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="entry_date">التاريخ</Label>
                    <Input
                      id="entry_date"
                      type="date"
                      value={formData.entry_date}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          entry_date: e.target.value,
                        })
                      }
                      required
                    />
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
                      placeholder="وصف القيد"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex justify-between items-center">
                  <CardTitle>عناصر القيد</CardTitle>
                  <Button type="button" variant="outline" size="sm" onClick={addEntryLine}>
                    <Plus className="w-4 h-4 mr-2" />
                    إضافة عنصر
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {entryLines.length === 0 ? (
                  <p className="text-center py-8 text-gray-500">لم تضف أي عناصر حتى الآن</p>
                ) : (
                  <div className="space-y-4">
                    {entryLines.map((line, index) => (
                      <div key={index} className="p-4 border rounded-lg space-y-3">
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                          <div>
                            <Label>الحساب</Label>
                            <select
                              value={line.account_id}
                              onChange={(e) => updateEntryLine(index, "account_id", e.target.value)}
                              className="w-full px-3 py-2 border rounded-lg text-sm"
                              required
                            >
                              <option value="">اختر حساب</option>
                              {accounts.map((acc) => (
                                <option key={acc.id} value={acc.id}>
                                  {acc.account_code} - {acc.account_name}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <Label>مدين</Label>
                            <Input
                              type="number"
                              step="0.01"
                              value={line.debit_amount}
                              onChange={(e) =>
                                updateEntryLine(index, "debit_amount", Number.parseFloat(e.target.value) || 0)
                              }
                              className="text-sm"
                            />
                          </div>

                          <div>
                            <Label>دائن</Label>
                            <Input
                              type="number"
                              step="0.01"
                              value={line.credit_amount}
                              onChange={(e) =>
                                updateEntryLine(index, "credit_amount", Number.parseFloat(e.target.value) || 0)
                              }
                              className="text-sm"
                            />
                          </div>

                          <div>
                            <Label>الوصف</Label>
                            <Input
                              type="text"
                              value={line.description}
                              onChange={(e) => updateEntryLine(index, "description", e.target.value)}
                              className="text-sm"
                            />
                          </div>
                        </div>

                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => removeEntryLine(index)}
                          className="text-red-600 hover:text-red-700"
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          حذف
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card
              className={`border-2 ${
                isBalanced
                  ? "border-green-200 bg-green-50 dark:bg-green-900/20"
                  : "border-red-200 bg-red-50 dark:bg-red-900/20"
              }`}
            >
              <CardContent className="pt-6">
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">إجمالي المديون</p>
                    <p className="text-2xl font-bold">{totalDebit.toFixed(2)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">إجمالي الدائن</p>
                    <p className="text-2xl font-bold">{totalCredit.toFixed(2)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">الفرق</p>
                    <p className={`text-2xl font-bold ${isBalanced ? "text-green-600" : "text-red-600"}`}>
                      {Math.abs(totalDebit - totalCredit).toFixed(2)}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="flex gap-3">
              <Button type="submit" disabled={isSaving || !isBalanced} className="disabled:opacity-50">
                {isSaving ? "جاري الحفظ..." : "إنشاء القيد"}
              </Button>
              <Button type="button" variant="outline" onClick={() => router.back()}>
                إلغاء
              </Button>
            </div>
          </form>
        </div>
      </main>
    </div>
  )
}
