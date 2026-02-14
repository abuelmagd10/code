'use client'

import { useState, useEffect } from 'react'
import { getTrialBalance, type TrialBalanceRow } from '@/actions/financial-reports'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
import { useCompany } from '@/hooks/use-company' // Hypothetical hook, will use hardcoded or context if not available

export default function TrialBalancePage() {
  // Config
  const [startDate, setStartDate] = useState(new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0])
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0])
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<TrialBalanceRow[]>([])
  const [totals, setTotals] = useState({ debit: 0, credit: 0 })

  // In a real app, this comes from context/auth
  // For now, we'll fetch the first company or use a placeholder
  const companyId = 'bf507664-071a-4ea8-9a48-47700a604246' // Replace with logic to get actual ID

  async function fetchData() {
    setLoading(true)
    try {
      const result = await getTrialBalance(companyId, startDate, endDate)
      setData(result)

      // Calculate totals
      const t = result.reduce((acc, row) => ({
        debit: acc.debit + Number(row.total_debit),
        credit: acc.credit + Number(row.total_credit)
      }), { debit: 0, credit: 0 })
      setTotals(t)

    } catch (error) {
      console.error(error)
      // toast.error('Failed to load report')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, []) // Initial load

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold tracking-tight">Trial Balance</h1>
        <Button variant="outline" onClick={() => window.print()}>
          <Printer className="mr-2 h-4 w-4" /> Print
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle>Report Parameters</CardTitle>
          <div className="flex items-end gap-4">
            <div className="grid gap-1.5">
              <label className="text-sm font-medium">Start Date</label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <label className="text-sm font-medium">End Date</label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
            <Button onClick={fetchData} disabled={loading}>
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Run Report
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
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
                    <TableCell className="text-right">{formatCurrency(totals.debit)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(totals.credit)}</TableCell>
                    <TableCell className="text-right">{(totals.debit - totals.credit).toFixed(2)}</TableCell>
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
