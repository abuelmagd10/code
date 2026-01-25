"use client"
import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useSupabase } from "@/lib/supabase/hooks"
import { getActiveCompanyId } from "@/lib/company"
import { ArrowLeft, TrendingUp, TrendingDown, Download, RefreshCw } from "lucide-react"
import Link from "next/link"

interface FXEntry {
  id: string
  entry_date: string
  description: string
  reference_type: string
  reference_id: string
  amount: number
  is_gain: boolean
  invoice_number?: string
  payment_id?: string
}

export default function FXGainsLossesReportPage() {
  const supabase = useSupabase()
  const [entries, setEntries] = useState<FXEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [companyId, setCompanyId] = useState<string>("")
  const [dateFrom, setDateFrom] = useState<string>(() => {
    const d = new Date()
    d.setMonth(d.getMonth() - 1)
    return d.toISOString().slice(0, 10)
  })
  const [dateTo, setDateTo] = useState<string>(new Date().toISOString().slice(0, 10))
  const [appLang, setAppLang] = useState<'ar' | 'en'>('ar')
  const [totalGains, setTotalGains] = useState(0)
  const [totalLosses, setTotalLosses] = useState(0)
  const [baseCurrency, setBaseCurrency] = useState('EGP')

  useEffect(() => {
    try { setAppLang(localStorage.getItem('app_language') === 'en' ? 'en' : 'ar') } catch { }
    try { setBaseCurrency(localStorage.getItem('app_currency') || 'EGP') } catch { }
    loadData()
  }, [])

  /**
   * ✅ تحميل بيانات أرباح وخسائر فروق الصرف
   * ✅ ACCOUNTING REPORT - تقرير محاسبي (من journal_entries فقط)
   * ✅ يستخدم journal_entry_lines لحسابات FX Gain/Loss
   * راجع: docs/ACCOUNTING_REPORTS_ARCHITECTURE.md
   */
  const loadData = async () => {
    setLoading(true)
    try {
      const cid = await getActiveCompanyId(supabase)
      if (!cid) return
      setCompanyId(cid)

      // ✅ جلب حسابات FX Gain/Loss
      const { data: fxGainAccount } = await supabase
        .from('chart_of_accounts')
        .select('id')
        .eq('company_id', cid)
        .eq('account_code', '4200')
        .single()

      const { data: fxLossAccount } = await supabase
        .from('chart_of_accounts')
        .select('id')
        .eq('company_id', cid)
        .eq('account_code', '5200')
        .single()

      if (!fxGainAccount && !fxLossAccount) {
        setEntries([])
        return
      }

      // ✅ جلب القيود المحاسبية (تقرير محاسبي - من journal_entries فقط)
      const accountIds = [fxGainAccount?.id, fxLossAccount?.id].filter(Boolean)

      const { data: lines } = await supabase
        .from('journal_entry_lines')
        .select(`
          id,
          account_id,
          debit_amount,
          credit_amount,
          description,
          journal_entries!inner (
            id,
            entry_date,
            description,
            reference_type,
            reference_id,
            deleted_at
          )
        `)
        .in('account_id', accountIds)
        .is('journal_entries.deleted_at', null) // ✅ استثناء القيود المحذوفة
        .gte('journal_entries.entry_date', dateFrom)
        .lte('journal_entries.entry_date', dateTo)
        .order('journal_entries(entry_date)', { ascending: false })

      const fxEntries: FXEntry[] = []
      let gains = 0
      let losses = 0

      for (const line of (lines || [])) {
        const je = (line as any).journal_entries
        const isGain = line.account_id === fxGainAccount?.id
        const amount = isGain ? (line.credit_amount || 0) : (line.debit_amount || 0)

        if (amount > 0) {
          fxEntries.push({
            id: line.id,
            entry_date: je.entry_date,
            description: line.description || je.description,
            reference_type: je.reference_type,
            reference_id: je.reference_id,
            amount,
            is_gain: isGain
          })

          if (isGain) gains += amount
          else losses += amount
        }
      }

      setEntries(fxEntries)
      setTotalGains(gains)
      setTotalLosses(losses)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  const handleRefresh = () => {
    loadData()
  }

  const netResult = totalGains - totalLosses
  const isNetGain = netResult >= 0

  if (loading) return <div className="p-8 text-center">{appLang === 'en' ? 'Loading...' : 'جاري التحميل...'}</div>

  return (
    <div className="p-3 sm:p-4 md:p-6 pt-20 md:pt-6 max-w-6xl mx-auto space-y-4 sm:space-y-6 overflow-x-hidden" dir={appLang === 'ar' ? 'rtl' : 'ltr'}>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <Link href="/reports"><Button variant="ghost" size="icon" className="flex-shrink-0"><ArrowLeft className="h-4 w-4 sm:h-5 sm:w-5" /></Button></Link>
          <h1 className="text-lg sm:text-2xl font-bold truncate">{appLang === 'en' ? 'FX Gains & Losses' : 'أرباح/خسائر الصرف'}</h1>
        </div>
        <Button onClick={handleRefresh} variant="outline">
          <RefreshCw className="h-4 w-4 mr-2" />
          {appLang === 'en' ? 'Refresh' : 'تحديث'}
        </Button>
      </div>

      {/* Date Filter */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex gap-4 items-end">
            <div>
              <Label>{appLang === 'en' ? 'From Date' : 'من تاريخ'}</Label>
              <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
            </div>
            <div>
              <Label>{appLang === 'en' ? 'To Date' : 'إلى تاريخ'}</Label>
              <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} />
            </div>
            <Button onClick={loadData}>{appLang === 'en' ? 'Apply Filter' : 'تطبيق'}</Button>
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-green-50 border-green-200">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <TrendingUp className="h-8 w-8 text-green-600" />
              <div>
                <p className="text-sm text-green-700">{appLang === 'en' ? 'Total FX Gains' : 'إجمالي أرباح الصرف'}</p>
                <p className="text-2xl font-bold text-green-800">{totalGains.toFixed(2)} {baseCurrency}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-red-50 border-red-200">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <TrendingDown className="h-8 w-8 text-red-600" />
              <div>
                <p className="text-sm text-red-700">{appLang === 'en' ? 'Total FX Losses' : 'إجمالي خسائر الصرف'}</p>
                <p className="text-2xl font-bold text-red-800">{totalLosses.toFixed(2)} {baseCurrency}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className={isNetGain ? 'bg-blue-50 border-blue-200' : 'bg-orange-50 border-orange-200'}>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              {isNetGain ? <TrendingUp className="h-8 w-8 text-blue-600" /> : <TrendingDown className="h-8 w-8 text-orange-600" />}
              <div>
                <p className={`text-sm ${isNetGain ? 'text-blue-700' : 'text-orange-700'}`}>
                  {appLang === 'en' ? 'Net Result' : 'صافي النتيجة'}
                </p>
                <p className={`text-2xl font-bold ${isNetGain ? 'text-blue-800' : 'text-orange-800'}`}>
                  {isNetGain ? '+' : ''}{netResult.toFixed(2)} {baseCurrency}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Entries Table */}
      <Card>
        <CardHeader>
          <CardTitle>{appLang === 'en' ? 'FX Transactions' : 'معاملات فروق الصرف'}</CardTitle>
        </CardHeader>
        <CardContent>
          {entries.length === 0 ? (
            <p className="text-center py-8 text-gray-500 dark:text-gray-400">
              {appLang === 'en' ? 'No FX gain/loss entries found for this period' : 'لا توجد قيود فروق صرف لهذه الفترة'}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{appLang === 'en' ? 'Date' : 'التاريخ'}</TableHead>
                  <TableHead>{appLang === 'en' ? 'Description' : 'الوصف'}</TableHead>
                  <TableHead>{appLang === 'en' ? 'Reference' : 'المرجع'}</TableHead>
                  <TableHead>{appLang === 'en' ? 'Type' : 'النوع'}</TableHead>
                  <TableHead className="text-right">{appLang === 'en' ? 'Amount' : 'المبلغ'}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map(entry => (
                  <TableRow key={entry.id}>
                    <TableCell>{entry.entry_date}</TableCell>
                    <TableCell>{entry.description}</TableCell>
                    <TableCell className="text-sm text-gray-500 dark:text-gray-400">{entry.reference_type}</TableCell>
                    <TableCell>
                      <span className={`px-2 py-1 rounded text-xs ${entry.is_gain ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        {entry.is_gain ? (appLang === 'en' ? 'Gain' : 'ربح') : (appLang === 'en' ? 'Loss' : 'خسارة')}
                      </span>
                    </TableCell>
                    <TableCell className={`text-right font-mono ${entry.is_gain ? 'text-green-600' : 'text-red-600'}`}>
                      {entry.is_gain ? '+' : '-'}{entry.amount.toFixed(2)} {baseCurrency}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Info Card */}
      <Card className="bg-blue-50 border-blue-200">
        <CardContent className="pt-4">
          <p className="text-sm text-blue-700">
            {appLang === 'en'
              ? '💡 FX Gains/Losses occur when payments are made at different exchange rates than the original invoice. This report shows all realized foreign exchange differences.'
              : '💡 تحدث أرباح/خسائر فروق الصرف عندما تتم المدفوعات بأسعار صرف مختلفة عن الفاتورة الأصلية. يعرض هذا التقرير جميع فروق الصرف المحققة.'}
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
