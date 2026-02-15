'use client'

import { useState, useEffect } from 'react'
import { getTrialBalance, type TrialBalanceRow } from '@/actions/financial-reports'
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
import { formatCurrency } from '@/lib/utils' // Assuming usage of existing util


import { useAccess } from '@/lib/access-context'

export default function TrialBalancePage() {
  const { profile, isLoading: isAccessLoading } = useAccess()
  // Config
  const [startDate, setStartDate] = useState(new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0])
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0])
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<TrialBalanceRow[]>([])
  const [totalDebit, setTotalDebit] = useState(0)
  const [totalCredit, setTotalCredit] = useState(0)

  // In a real app, this comes from context/auth
  // For now, we'll fetch the first company or use a placeholder
  // Use dynamic company ID from AccessContext
  // Placeholder Company ID removed
  // const companyId = 'bf507664-071a-4ea8-9a48-47700a604246'

  async function fetchData() {
    if (!profile?.company_id) return

    setLoading(true)
    try {
      const result = await getTrialBalance(profile.company_id, startDate, endDate)
      setData(result)

      const debit = result.reduce((sum, r) => sum + Number(r.total_debit), 0)
      const credit = result.reduce((sum, r) => sum + Number(r.total_credit), 0)
      setTotalDebit(debit)
      setTotalCredit(credit)

    } catch (error) {
      console.error(error)
      // toast.error('Failed to load report')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (profile?.company_id) {
      fetchData()
    }
  }, [profile?.company_id]) // Initial load

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center print:hidden">
        <h1 className="text-3xl font-bold tracking-tight">Trial Balance</h1>
        <div className="flex gap-2">
          <ExportActions onPrint={() => window.print()} />
        </div>
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
                title="Trial Balance"
                startDate={startDate}
                endDate={endDate}
              />
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[100px]">Code</TableHead>
                  <TableHead>Account Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Debit</TableHead>
                  <TableHead className="text-right">Credit</TableHead>
                  <TableHead className="text-right">Net Balance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center h-24 text-muted-foreground">
                      No data found for this period.
                    </TableCell>
                  </TableRow>
                ) : (
                  data.map((row) => (
                    <TableRow key={row.account_id}>
                      <TableCell className="font-medium">{row.account_code}</TableCell>
                      <TableCell>{row.account_name}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">{row.account_type}</TableCell>
                      <TableCell className="text-right font-mono">
                        {Number(row.total_debit) > 0 ? formatCurrency(row.total_debit) : '-'}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {Number(row.total_credit) > 0 ? formatCurrency(row.total_credit) : '-'}
                      </TableCell>
                      <TableCell className="text-right font-mono font-medium">
                        {formatCurrency(row.balance)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
              {data.length > 0 && (
                <TableBody className="border-t-2 border-primary/20 bg-muted/30 font-bold">
                  <TableRow>
                    <TableCell colSpan={3} className="text-right">Totals:</TableCell>
                    <TableCell className="text-right font-mono">{formatCurrency(totalDebit)}</TableCell>
                    <TableCell className="text-right font-mono">{formatCurrency(totalCredit)}</TableCell>
                    <TableCell className="text-right font-mono">
                      <span className={Math.abs(totalDebit - totalCredit) > 0.01 ? "text-red-500" : "text-green-500"}>
                        {formatCurrency(totalDebit - totalCredit)}
                      </span>
                    </TableCell>
                  </TableRow>
                </TableBody>
              )}
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
