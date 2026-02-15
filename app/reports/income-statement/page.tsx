'use client'

import { useState, useEffect } from 'react'
import { getIncomeStatement, type IncomeStatementRow } from '@/actions/financial-reports'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ExportActions } from '@/components/reports/export-actions'
import { ReportHeader } from '@/components/reports/report-header'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table'
import { Loader2, Printer } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'

import { useAccess } from '@/lib/access-context'

export default function IncomeStatementPage() {
  const { profile, isLoading: isAccessLoading } = useAccess()
  const [startDate, setStartDate] = useState(new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0])
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0])
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<IncomeStatementRow[]>([])

  // Financial Aggregates
  const [aggregates, setAggregates] = useState({
    revenue: 0,
    cogs: 0,
    expenses: 0,
    grossProfit: 0,
    netIncome: 0
  })

  async function fetchData() {
    if (!profile?.company_id) return

    setLoading(true)
    try {
      const result = await getIncomeStatement(profile.company_id, startDate, endDate)
      setData(result)

      const rev = result.filter(r => r.section === 'Revenue').reduce((sum, r) => sum + Number(r.amount), 0)
      const cogs = result.filter(r => r.section === 'COGS').reduce((sum, r) => sum + Number(r.amount), 0)
      const exp = result.filter(r => r.section === 'Expense').reduce((sum, r) => sum + Number(r.amount), 0)

      setAggregates({
        revenue: rev,
        cogs: cogs,
        expenses: exp,
        grossProfit: rev - cogs,
        netIncome: (rev - cogs) - exp
      })

    } catch (error) {
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (profile?.company_id) {
      fetchData()
    }
  }, [profile?.company_id])

  const renderSection = (title: string, sectionFilter: string) => {
    const rows = data.filter(r => r.section === sectionFilter)
    if (rows.length === 0) return null

    return (
      <>
        <TableRow className="bg-muted/50 font-bold">
          <TableCell colSpan={2}>{title}</TableCell>
          <TableCell></TableCell>
        </TableRow>
        {rows.map(row => (
          <TableRow key={row.account_id}>
            <TableCell className="pl-8 text-muted-foreground">{row.account_code}</TableCell>
            <TableCell className="pl-8">{row.account_name}</TableCell>
            <TableCell className="text-right font-mono">{formatCurrency(row.amount)}</TableCell>
          </TableRow>
        ))}
        <TableRow className="font-semibold">
          <TableCell colSpan={2} className="pl-8">Total {title}</TableCell>
          <TableCell className="text-right font-mono border-t border-black/20">
            {formatCurrency(rows.reduce((sum, r) => sum + Number(r.amount), 0))}
          </TableCell>
        </TableRow>
      </>
    )
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold tracking-tight">Income Statement</h1>
        <Button variant="outline" onClick={() => window.print()}>
          <div className="flex gap-2">
            <ExportActions onPrint={() => window.print()} />
          </div>
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3 print:hidden">
          <CardTitle>Report Parameters</CardTitle>
          <div className="flex items-end gap-4">
            <div className="grid gap-1.5">
              <label className="text-sm font-medium">Period</label>
              <div className="flex gap-2">
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-[150px]"
                />
                <span className="self-center">-</span>
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-[150px]"
                />
              </div>
            </div>
            <Button onClick={fetchData} disabled={loading}>
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Run Report
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border print:border-none">
            <div className="hidden print:block mb-6">
              <ReportHeader
                title="Income Statement"
                startDate={startDate}
                endDate={endDate}
              />
            </div>
            <Table>
              <TableBody>
                {/* REVENUE */}
                {renderSection('Revenue', 'Revenue')}

                {/* COGS */}
                {renderSection('Cost of Goods Sold', 'COGS')}

                {/* GROSS PROFIT */}
                <TableRow className="bg-blue-50/50 text-blue-900 text-lg font-bold border-t-2 border-blue-200">
                  <TableCell colSpan={2}>Gross Profit</TableCell>
                  <TableCell className="text-right font-mono">{formatCurrency(aggregates.grossProfit)}</TableCell>
                </TableRow>

                {/* SPACING */}
                <TableRow><TableCell colSpan={3} className="h-4"></TableCell></TableRow>

                {/* EXPENSES */}
                {renderSection('Operating Expenses', 'Expense')}

                {/* NET INCOME */}
                <TableRow className={`text-xl font-bold border-t-4 border-double ${aggregates.netIncome >= 0 ? 'bg-green-50 text-green-900 border-green-200' : 'bg-red-50 text-red-900 border-red-200'}`}>
                  <TableCell colSpan={2}>Net Income</TableCell>
                  <TableCell className="text-right font-mono">{formatCurrency(aggregates.netIncome)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
