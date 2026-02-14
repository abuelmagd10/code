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
import { Loader2 } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { useAccess } from '@/lib/access-context'
import { ReportFilters } from '@/components/reports/report-filters'
import { ExportButton } from '@/components/reports/export-button'

export default function TrialBalancePage() {
  const { profile } = useAccess()
  const [startDate, setStartDate] = useState(new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0])
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0])
  const [branchId, setBranchId] = useState<string | undefined>()
  const [costCenterId, setCostCenterId] = useState<string | undefined>()
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<TrialBalanceRow[]>([])
  const [totalDebit, setTotalDebit] = useState(0)
  const [totalCredit, setTotalCredit] = useState(0)

  async function fetchData() {
    if (!profile?.company_id) return

    setLoading(true)
    try {
      const result = await getTrialBalance(
        profile.company_id,
        startDate,
        endDate,
        branchId,
        costCenterId
      )
      setData(result)

      const debit = result.reduce((sum, r) => sum + Number(r.total_debit), 0)
      const credit = result.reduce((sum, r) => sum + Number(r.total_credit), 0)
      setTotalDebit(debit)
      setTotalCredit(credit)

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
  }, [profile?.company_id, startDate, endDate, branchId, costCenterId])

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold tracking-tight">Trial Balance</h1>
        <ExportButton
          data={data}
          filename="trial_balance"
          columns={[
            { key: 'account_code', label: 'Code' },
            { key: 'account_name', label: 'Account Name' },
            { key: 'account_type', label: 'Type' },
            { key: 'total_debit', label: 'Debit' },
            { key: 'total_credit', label: 'Credit' },
            { key: 'balance', label: 'Balance' },
          ]}
        />
      </div>

      <ReportFilters
        startDate={startDate}
        endDate={endDate}
        branchId={branchId}
        costCenterId={costCenterId}
        onFilterChange={(filters) => {
          if (filters.startDate !== undefined) setStartDate(filters.startDate)
          if (filters.endDate !== undefined) setEndDate(filters.endDate)
          if (filters.branchId !== undefined) setBranchId(filters.branchId)
          if (filters.costCenterId !== undefined) setCostCenterId(filters.costCenterId)
        }}
        onReset={() => {
          setBranchId(undefined)
          setCostCenterId(undefined)
        }}
        showDateRange
      />

      <Card>
        <CardHeader className="pb-3">
          <div className="flex justify-between items-center">
            <CardTitle>Report Data</CardTitle>
            <Button onClick={fetchData} disabled={loading} size="sm">
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
                    <TableCell className="text-right">{formatCurrency(totalDebit)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(totalCredit)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(totalDebit - totalCredit)}</TableCell>
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
