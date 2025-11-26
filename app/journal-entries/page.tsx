"use client"

import { useState, useEffect } from "react"
import { Sidebar } from "@/components/sidebar"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuCheckboxItem, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useSupabase } from "@/lib/supabase/hooks"
import { getActiveCompanyId } from "@/lib/company"
import { canAction } from "@/lib/authz"
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

interface AmountMap { [id: string]: number }
interface CashBasisMap { [id: string]: boolean }

export default function JournalEntriesPage() {
  const supabase = useSupabase()
  const [entries, setEntries] = useState<JournalEntry[]>([])
  const [amountById, setAmountById] = useState<AmountMap>({})
  const [cashBasisById, setCashBasisById] = useState<CashBasisMap>({})
  const [isLoading, setIsLoading] = useState(true)
  const [accountName, setAccountName] = useState("")
  const { toast } = useToast()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const searchParams = useSearchParams()
  const appLang = typeof window !== 'undefined' ? ((localStorage.getItem('app_language') || 'ar') === 'en' ? 'en' : 'ar') : 'ar'
  const numberFmt = new Intl.NumberFormat(appLang==='en' ? 'en-EG' : 'ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const accountIdParam = searchParams.get("account_id") || ""
  const fromParam = searchParams.get("from") || ""
  const toParam = searchParams.get("to") || ""
  const [permWrite, setPermWrite] = useState(false)
  const [permDelete, setPermDelete] = useState(false)
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const [refFrom, setRefFrom] = useState("")
  const [refTo, setRefTo] = useState("")
  const [typeFilter, setTypeFilter] = useState("all")
  const [descSelected, setDescSelected] = useState<string[]>([])
  const [amountMin, setAmountMin] = useState("")
  const [amountMax, setAmountMax] = useState("")
  const [descOptions, setDescOptions] = useState<string[]>([])
  const [typeOptions, setTypeOptions] = useState<string[]>([])
  const [descOpen, setDescOpen] = useState(false)
  const [amountBasisFilter, setAmountBasisFilter] = useState<'all' | 'cash_only' | 'cash_first'>('all')
  const toggleDesc = (val: string, checked: boolean) => {
    setDescSelected((prev) => {
      const set = new Set(prev)
      if (checked) set.add(val)
      else set.delete(val)
      return Array.from(set)
    })
  }

  useEffect(() => {
    ;(async () => {
      setPermWrite(await canAction(supabase, 'journal', 'write'))
      setPermDelete(await canAction(supabase, 'journal', 'delete'))
    })()
    loadEntries()
  }, [accountIdParam, fromParam, toParam])
  useEffect(() => {
    const handler = async () => {
      setPermWrite(await canAction(supabase, 'journal', 'write'))
      setPermDelete(await canAction(supabase, 'journal', 'delete'))
    }
    if (typeof window !== 'undefined') window.addEventListener('permissions_updated', handler)
    return () => { if (typeof window !== 'undefined') window.removeEventListener('permissions_updated', handler) }
  }, [])

  useEffect(() => {
    const ds = Array.from(new Set(entries.map((e) => String(e.description || "")).filter((s) => s.length > 0))).sort((a, b) => a.localeCompare(b))
    setDescOptions(ds)
    const ts = Array.from(new Set(entries.map((e) => String(e.reference_type || "")).filter((s) => s.length > 0)))
    setTypeOptions(ts)
  }, [entries])

  const loadEntries = async () => {
    try {
      setIsLoading(true)

      const companyId = await getActiveCompanyId(supabase)
      if (!companyId) return

      if (accountIdParam) {
        const { data: acc } = await supabase
          .from("chart_of_accounts")
          .select("account_name")
          .eq("id", accountIdParam)
          .single()
        setAccountName(String((acc as any)?.account_name || ""))
      } else {
        setAccountName("")
      }

      let query = supabase
        .from("journal_entries")
        .select("*, journal_entry_lines!inner(account_id)")
        .eq("company_id", companyId)
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
      const ids = (data || []).map((e: any) => String(e.id))
      if (ids.length > 0) {
        try {
          const res = await fetch(`/api/journal-amounts?ids=${encodeURIComponent(ids.join(','))}`)
          if (res.ok) {
            const arr = await res.json()
            const agg: AmountMap = {}
            const cashMap: CashBasisMap = {}
            for (const r of (Array.isArray(arr) ? arr : [])) {
              const id = String((r as any).journal_entry_id)
              agg[id] = Number((r as any).amount || 0)
              const basis = String((r as any).basis || '')
              cashMap[id] = basis === 'cash'
            }
            setAmountById(agg)
            setCashBasisById(cashMap)
          } else {
            setAmountById({})
            setCashBasisById({})
          }
        } catch { setAmountById({}) }
      } else {
        setAmountById({})
        setCashBasisById({})
      }
    } catch (error) {
      console.error("Error loading journal entries:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleDelete = async (id: string) => {
    try {
      // Get the journal entry info first
      const { data: entry } = await supabase
        .from("journal_entries")
        .select("id, reference_type, reference_id, description")
        .eq("id", id)
        .single()

      // Update related invoice/bill status before deletion
      if (entry?.reference_type && entry?.reference_id) {
        const refType = entry.reference_type
        const refId = entry.reference_id

        // Handle invoice payment deletion - restore invoice status
        if (refType === "invoice_payment") {
          const { data: lines } = await supabase
            .from("journal_entry_lines")
            .select("debit_amount")
            .eq("journal_entry_id", id)
          const payAmount = (lines || []).reduce((sum: number, l: any) => sum + Number(l.debit_amount || 0), 0)

          const { data: inv } = await supabase.from("invoices").select("paid_amount, total_amount").eq("id", refId).single()
          if (inv) {
            const newPaid = Math.max(0, Number(inv.paid_amount || 0) - payAmount)
            const newStatus = newPaid <= 0 ? "sent" : newPaid < Number(inv.total_amount) ? "partially_paid" : "paid"
            await supabase.from("invoices").update({ paid_amount: newPaid, status: newStatus }).eq("id", refId)
          }
        }

        // Handle bill payment deletion - restore bill status
        if (refType === "bill_payment") {
          const { data: lines } = await supabase
            .from("journal_entry_lines")
            .select("credit_amount")
            .eq("journal_entry_id", id)
          const payAmount = (lines || []).reduce((sum: number, l: any) => sum + Number(l.credit_amount || 0), 0)

          const { data: bill } = await supabase.from("bills").select("paid_amount, total_amount").eq("id", refId).single()
          if (bill) {
            const newPaid = Math.max(0, Number(bill.paid_amount || 0) - payAmount)
            const newStatus = newPaid <= 0 ? "sent" : newPaid < Number(bill.total_amount) ? "partially_paid" : "paid"
            await supabase.from("bills").update({ paid_amount: newPaid, status: newStatus }).eq("id", refId)
          }
        }

        // Handle invoice reversal deletion - reset return status
        if (refType === "invoice_reversal" || refType === "credit_note") {
          await supabase.from("invoices").update({ return_status: null, returned_amount: 0 }).eq("id", refId)
        }

        // Handle bill reversal deletion - reset return status
        if (refType === "bill_reversal" || refType === "vendor_credit") {
          await supabase.from("bills").update({ return_status: null, returned_amount: 0 }).eq("id", refId)
        }

        // Handle vendor credit deletion - update vendor_credits
        if (refType === "vendor_credit") {
          await supabase.from("vendor_credits").update({ journal_entry_id: null }).eq("id", refId)
        }

        // Handle sales return deletion
        if (refType === "sales_return") {
          await supabase.from("sales_returns").update({ journal_entry_id: null, status: "cancelled" }).eq("id", refId)
        }
      }

      // Delete linked records (triggers will handle some, but explicit is safer)
      await supabase.from("journal_entry_lines").delete().eq("journal_entry_id", id)
      await supabase.from("inventory_transactions").delete().eq("journal_entry_id", id)

      // Delete payments linked to this journal entry
      await supabase.from("payments").delete().eq("journal_entry_id", id)

      // Finally delete the journal entry
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

  const filteredEntries = entries.filter((e) => {
    const dOk = (!dateFrom || String(e.entry_date || '').slice(0,10) >= dateFrom) && (!dateTo || String(e.entry_date || '').slice(0,10) <= dateTo)
    const tOk = typeFilter === 'all' || String(e.reference_type || '') === typeFilter
    const descOk = descSelected.length === 0 || descSelected.includes(String(e.description || ''))
    const rOk = (!refFrom || String(e.entry_date || '').slice(0,10) >= refFrom) && (!refTo || String(e.entry_date || '').slice(0,10) <= refTo)
    const amt = Number(amountById[e.id] || 0)
    const minOk = amountMin === '' || amt >= Number(amountMin)
    const maxOk = amountMax === '' || amt <= Number(amountMax)
    return dOk && tOk && descOk && rOk && minOk && maxOk
  })

  return (
    <>
    <div className="flex min-h-screen bg-gray-50 dark:bg-slate-950">
      <Sidebar />

      <main className="flex-1 md:mr-64 p-4 md:p-8">
        <div className="space-y-8">
          <div className="flex flex-col sm:flex-row sm:justify-between items-start gap-3">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{appLang==='en' ? 'Journal Entries' : 'قيود اليومية'}</h1>
              <p className="text-gray-600 dark:text-gray-400 mt-2">{appLang==='en' ? 'General ledger journal records' : 'سجل القيود المحاسبية'}</p>
              {(accountIdParam || fromParam || toParam) && (
                <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  <span>{appLang==='en' ? 'Filter: ' : 'تصفية: '}</span>
                  {accountIdParam && <span>{appLang==='en' ? `Account: ${accountName || accountIdParam} ` : `الحساب: ${accountName || accountIdParam} `}</span>}
                  {fromParam && <span>{appLang==='en' ? `From ${new Date(fromParam).toLocaleDateString('en')} ` : `من ${new Date(fromParam).toLocaleDateString('ar')} `}</span>}
                  {toParam && <span>{appLang==='en' ? `To ${new Date(toParam).toLocaleDateString('en')} ` : `إلى ${new Date(toParam).toLocaleDateString('ar')} `}</span>}
                  <Link href="/journal-entries" className="ml-2 underline">{appLang==='en' ? 'Clear' : 'مسح التصفية'}</Link>
                </div>
              )}
            </div>
            {permWrite ? (
              <Link href="/journal-entries/new">
                <Button>
                  <Plus className="w-4 h-4 mr-2" />
                  {appLang==='en' ? 'New Entry' : 'قيد جديد'}
                </Button>
              </Link>
            ) : null}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">{appLang==='en' ? 'Total Entries' : 'إجمالي القيود'}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{entries.length}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">{appLang==='en' ? 'Entries This Month' : 'قيود هذا الشهر'}</CardTitle>
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
                <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">{appLang==='en' ? 'Last Entry' : 'آخر قيد'}</CardTitle>
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
              <CardTitle>{appLang==='en' ? 'Entries List' : 'قائمة القيود'}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-7 gap-2 mb-4">
                <div>
                  <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm" />
                </div>
                <div>
                  <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm" />
                </div>
                <div>
                  <DropdownMenu open={descOpen} onOpenChange={setDescOpen}>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" className="w-full justify-between">
                        {(() => {
                          const count = descSelected.length
                          if (count === 0) return appLang==='en' ? 'Description: All' : 'الوصف: الكل'
                          if (count === 1) return (appLang==='en' ? 'Description: ' : 'الوصف: ') + (descSelected[0] || '')
                          return (appLang==='en' ? 'Description: ' : 'الوصف: ') + count + (appLang==='en' ? ' selected' : ' محدد')
                        })()}
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="w-64">
                      <DropdownMenuLabel>{appLang==='en' ? 'Filter by description' : 'تصفية حسب الوصف'}</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      <div className="px-2 pb-2">
                        <Input
                          placeholder={appLang==='en' ? 'Search descriptions' : 'بحث في الأوصاف'}
                          value={(descSelected as any).__search || ''}
                          onChange={(e) => {
                            const v = e.target.value
                            ;(descSelected as any).__search = v
                            setDescOptions((prev) => prev.slice())
                          }}
                        />
                      </div>
                      <DropdownMenuItem onSelect={(e) => { e.preventDefault(); setDescSelected([]) }}>{appLang==='en' ? 'Show all' : 'إظهار الكل'}</DropdownMenuItem>
                      <DropdownMenuSeparator />
                      {descOptions.filter((d) => {
                        const s = String((descSelected as any).__search || '').toLowerCase()
                        if (!s) return true
                        return d.toLowerCase().includes(s)
                      }).map((d) => (
                        <DropdownMenuCheckboxItem key={d} checked={descSelected.includes(d)} onSelect={(e) => e.preventDefault()} onCheckedChange={(c) => toggleDesc(d, Boolean(c))}>
                          {d}
                        </DropdownMenuCheckboxItem>
                      ))}
                      <div className="px-2 pt-2">
                        <Button variant="outline" className="w-full" onClick={() => setDescOpen(false)}>{appLang==='en' ? 'Close' : 'إغلاق'}</Button>
                      </div>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <div>
                  <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm">
                    <option value="all">{appLang==='en' ? 'All types' : 'كل الأنواع'}</option>
                    {typeOptions.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <select value={amountBasisFilter} onChange={(e) => setAmountBasisFilter(e.target.value as any)} className="w-full px-3 py-2 border rounded-lg text-sm">
                    <option value="all">{appLang==='en' ? 'Amounts: All' : 'المبالغ: الكل'}</option>
                    <option value="cash_only">{appLang==='en' ? 'Amounts: Net cash only' : 'المبالغ: صافي نقد فقط'}</option>
                    <option value="cash_first">{appLang==='en' ? 'Amounts: Highlight cash first' : 'المبالغ: إبراز النقد أولاً'}</option>
                  </select>
                </div>
                <div>
                  <input type="date" value={refFrom} onChange={(e) => setRefFrom(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm" />
                </div>
                <div>
                  <input type="date" value={refTo} onChange={(e) => setRefTo(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm" />
                </div>
                <div>
                  <input type="number" step="0.01" value={amountMin} onChange={(e) => setAmountMin(e.target.value)} placeholder={appLang==='en' ? 'Min amount' : 'الحد الأدنى'} className="w-full px-3 py-2 border rounded-lg text-sm" />
                </div>
                <div>
                  <input type="number" step="0.01" value={amountMax} onChange={(e) => setAmountMax(e.target.value)} placeholder={appLang==='en' ? 'Max amount' : 'الحد الأقصى'} className="w-full px-3 py-2 border rounded-lg text-sm" />
                </div>
                <div className="md:col-span-2 flex items-center gap-2 flex-wrap">
                  <Button variant="outline" onClick={() => { setDateFrom(''); setDateTo(''); setDescSelected([]); setTypeFilter('all'); setRefFrom(''); setRefTo(''); setAmountMin(''); setAmountMax(''); setAmountBasisFilter('all') }}>{appLang==='en' ? 'Clear' : 'مسح'}</Button>
                </div>
              </div>
              {isLoading ? (
                <p className="text-center py-8 text-gray-500">{appLang==='en' ? 'Loading...' : 'جاري التحميل...'}</p>
              ) : entries.length === 0 ? (
                <p className="text-center py-8 text-gray-500">{appLang==='en' ? 'No entries yet' : 'لا توجد قيود حتى الآن'}</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-[640px] w-full text-sm">
                    <thead className="border-b bg-gray-50 dark:bg-slate-900">
                      <tr>
                        <th className="px-4 py-3 text-right">{appLang==='en' ? 'Entry Date' : 'تاريخ القيد'}</th>
                        <th className="px-4 py-3 text-right">{appLang==='en' ? 'Description' : 'الوصف'}</th>
                        <th className="px-4 py-3 text-right">{appLang==='en' ? 'Type' : 'النوع'}</th>
                        
                        <th className="px-4 py-3 text-right">{appLang==='en' ? 'Amount' : 'المبلغ'}</th>
                        <th className="px-4 py-3 text-right">{appLang==='en' ? 'Actions' : 'الإجراءات'}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        const basisOk = (e: JournalEntry) => amountBasisFilter !== 'cash_only' || Boolean(cashBasisById[e.id])
                        const filtered = filteredEntries.filter((e) => basisOk(e))
                        const displayed = amountBasisFilter === 'cash_first' ? [...filtered].sort((a, b) => (cashBasisById[b.id] ? 1 : 0) - (cashBasisById[a.id] ? 1 : 0)) : filtered
                        return displayed
                      })().map((entry) => (
                        <tr key={entry.id} className="border-b hover:bg-gray-50 dark:hover:bg-slate-900">
                          <td className="px-4 py-3 font-medium">
                            {new Date(entry.entry_date).toLocaleDateString(appLang==='en' ? 'en' : 'ar')}
                          </td>
                          <td className="px-4 py-3">{entry.description}</td>
                          <td className="px-4 py-3">
                            <span className="px-2 py-1 bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 rounded text-xs font-medium">
                              {entry.reference_type}
                            </span>
                          </td>
                          
                          <td className="px-4 py-3 text-left">
                            {(() => {
                              const amt = Number(amountById[entry.id] || 0)
                              const isCash = Boolean(cashBasisById[entry.id])
                              const cls = amt > 0 ? "text-green-600" : (amt < 0 ? "text-red-600" : "text-gray-600")
                              const sign = amt > 0 ? "+" : ""
                              return (
                                <div className="flex items-center gap-2">
                                  <span className={cls + " font-semibold"}>{sign}{numberFmt.format(amt)}</span>
                                  {isCash ? (<span className="px-2 py-1 rounded text-xs font-medium bg-slate-100 text-slate-800">{appLang==='en' ? 'Net cash' : 'صافي نقد'}</span>) : null}
                                </div>
                              )
                            })()}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex gap-2 flex-wrap">
                              <Link href={`/journal-entries/${entry.id}`}>
                                <Button variant="outline" size="sm">
                                  <Eye className="w-4 h-4" />
                                </Button>
                              </Link>
                              {permDelete ? (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => requestDelete(entry.id)}
                                  className="text-red-600 hover:text-red-700"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              ) : null}
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
      <AlertDialogContent dir={appLang==='en' ? 'ltr' : 'rtl'}>
        <AlertDialogHeader>
          <AlertDialogTitle>{appLang==='en' ? 'Confirm Delete' : 'تأكيد الحذف'}</AlertDialogTitle>
          <AlertDialogDescription>
            {appLang==='en' ? 'Are you sure you want to delete this entry? This action cannot be undone.' : 'هل أنت متأكد من حذف هذا القيد؟ لا يمكن التراجع عن هذا الإجراء.'}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{appLang==='en' ? 'Cancel' : 'إلغاء'}</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              if (pendingDeleteId) {
                handleDelete(pendingDeleteId)
              }
              setConfirmOpen(false)
              setPendingDeleteId(null)
            }}
          >
            {appLang==='en' ? 'Delete' : 'حذف'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  )
}
