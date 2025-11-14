"use client"

import { useState, useEffect } from "react"
import { Sidebar } from "@/components/sidebar"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useSupabase } from "@/lib/supabase/hooks"
import { Plus, Eye, Trash2 } from "lucide-react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { useToast } from "@/hooks/use-toast"
import { toastDeleteSuccess, toastDeleteError } from "@/lib/notifications"

interface JournalEntry {
  id: string
  entry_date: string
  description: string
  reference_type: string
  created_at: string
}

export default function JournalEntriesPage() {
  const supabase = useSupabase()
  const [entries, setEntries] = useState<JournalEntry[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const { toast } = useToast()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const searchParams = useSearchParams()
  const accountIdParam = searchParams.get("account_id") || ""
  const fromParam = searchParams.get("from") || ""
  const toParam = searchParams.get("to") || ""

  useEffect(() => {
    loadEntries()
  }, [accountIdParam, fromParam, toParam])

  const loadEntries = async () => {
    try {
      setIsLoading(true)

      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return

      const { data: companyData } = await supabase.from("companies").select("id").eq("user_id", user.id).single()

      if (!companyData) return

      let query = supabase
        .from("journal_entries")
        .select("*, journal_entry_lines!inner(account_id)")
        .eq("company_id", companyData.id)
        .order("entry_date", { ascending: false })

      if (accountIdParam) {
        query = query.eq("journal_entry_lines.account_id", accountIdParam)
      }
      if (fromParam) {
        query = query.gte("entry_date", fromParam)
      }
      if (toParam) {
        query = query.lte("entry_date", toParam)
      }

      const { data } = await query

      setEntries(data || [])
    } catch (error) {
      console.error("Error loading journal entries:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase.from("journal_entries").delete().eq("id", id)

      if (error) throw error
      loadEntries()
      toastDeleteSuccess(toast, "القيد")
    } catch (error) {
      console.error("Error deleting entry:", error)
      toastDeleteError(toast, "القيد")
    }
  }

  const requestDelete = (id: string) => {
    setPendingDeleteId(id)
    setConfirmOpen(true)
  }

  return (
    <>
    <div className="flex min-h-screen bg-gray-50 dark:bg-slate-950">
      <Sidebar />

      <main className="flex-1 md:mr-64 p-4 md:p-8">
        <div className="space-y-8">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">قيود اليومية</h1>
              <p className="text-gray-600 dark:text-gray-400 mt-2">سجل القيود المحاسبية</p>
              {(accountIdParam || fromParam || toParam) && (
                <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  <span>تصفية: </span>
                  {accountIdParam && <span>حساب #{accountIdParam} </span>}
                  {fromParam && <span>من {new Date(fromParam).toLocaleDateString("ar")} </span>}
                  {toParam && <span>إلى {new Date(toParam).toLocaleDateString("ar")} </span>}
                  <Link href="/journal-entries" className="ml-2 underline">مسح التصفية</Link>
                </div>
              )}
            </div>
            <Link href="/journal-entries/new">
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                قيد جديد
              </Button>
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">إجمالي القيود</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{entries.length}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">قيود هذا الشهر</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {
                    entries.filter((e) => {
                      const entryDate = new Date(e.entry_date)
                      const now = new Date()
                      return entryDate.getMonth() === now.getMonth() && entryDate.getFullYear() === now.getFullYear()
                    }).length
                  }
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">آخر قيد</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-sm font-semibold">
                  {entries.length > 0 ? new Date(entries[0].entry_date).toLocaleDateString("ar") : "-"}
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>قائمة القيود</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <p className="text-center py-8 text-gray-500">جاري التحميل...</p>
              ) : entries.length === 0 ? (
                <p className="text-center py-8 text-gray-500">لا توجد قيود حتى الآن</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b bg-gray-50 dark:bg-slate-900">
                      <tr>
                        <th className="px-4 py-3 text-right">التاريخ</th>
                        <th className="px-4 py-3 text-right">الوصف</th>
                        <th className="px-4 py-3 text-right">النوع</th>
                        <th className="px-4 py-3 text-right">التاريخ المرجعي</th>
                        <th className="px-4 py-3 text-right">الإجراءات</th>
                      </tr>
                    </thead>
                    <tbody>
                      {entries.map((entry) => (
                        <tr key={entry.id} className="border-b hover:bg-gray-50 dark:hover:bg-slate-900">
                          <td className="px-4 py-3 font-medium">
                            {new Date(entry.entry_date).toLocaleDateString("ar")}
                          </td>
                          <td className="px-4 py-3">{entry.description}</td>
                          <td className="px-4 py-3">
                            <span className="px-2 py-1 bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 rounded text-xs font-medium">
                              {entry.reference_type}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-gray-600">
                            {new Date(entry.created_at).toLocaleDateString("ar")}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex gap-2">
                              <Link href={`/journal-entries/${entry.id}`}>
                                <Button variant="outline" size="sm">
                                  <Eye className="w-4 h-4" />
                                </Button>
                              </Link>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => requestDelete(entry.id)}
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
    <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
      <AlertDialogContent dir="rtl">
        <AlertDialogHeader>
          <AlertDialogTitle>تأكيد الحذف</AlertDialogTitle>
          <AlertDialogDescription>
            هل أنت متأكد من حذف هذا القيد؟ لا يمكن التراجع عن هذا الإجراء.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>إلغاء</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              if (pendingDeleteId) {
                handleDelete(pendingDeleteId)
              }
              setConfirmOpen(false)
              setPendingDeleteId(null)
            }}
          >
            حذف
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  )
}
