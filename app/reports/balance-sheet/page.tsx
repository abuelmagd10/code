'use client'

import { useState, useEffect } from 'react'
import { getBalanceSheet, type BalanceSheetRow } from '@/actions/financial-reports'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableRow
} from '@/components/ui/table'
import { Loader2 } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { useAccess } from '@/lib/access-context'
import { ReportFilters } from '@/components/reports/report-filters'
import { ExportButton } from '@/components/reports/export-button'

export default function BalanceSheetPage() {
  const { profile } = useAccess()
  const [asOfDate, setAsOfDate] = useState(new Date().toISOString().split('T')[0])
  const [branchId, setBranchId] = useState<string | undefined>()
  const [costCenterId, setCostCenterId] = useState<string | undefined>()
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<BalanceSheetRow[]>([])

  // Financial Aggregates
  const [aggregates, setAggregates] = useState({
    assets: 0,
    liabilities: 0,
    equity: 0
  })

  async function fetchData() {
    if (!profile?.company_id) return

    setLoading(true)
    try {
      const result = await getBalanceSheet(
        profile.company_id,
        asOfDate,
        branchId,
        costCenterId
      )
      setData(result)

      const assets = result.filter(r => r.section === 'Assets').reduce((sum, r) => sum + Number(r.balance), 0)
      const liabilities = result.filter(r => r.section === 'Liabilities').reduce((sum, r) => sum + Number(r.balance), 0)
      const equity = result.filter(r => r.section === 'Equity').reduce((sum, r) => sum + Number(r.balance), 0)

      setAggregates({
        assets,
        liabilities,
        equity
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
  }, [profile?.company_id, asOfDate, branchId, costCenterId])

  const renderSection = (title: string, sectionFilter: string) => {
    const rows = data.filter(r => r.section === sectionFilter)
    const total = rows.reduce((sum, r) => sum + Number(r.balance), 0)

    return (
      <div className="mb-8">
        <h3 className="text-lg font-bold mb-2 px-2 py-1 bg-muted/40 rounded border-l-4 border-primary">{title}</h3>
        <Table>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow><TableCell className="text-muted-foreground text-sm italic">No records</TableCell></TableRow>
            ) : rows.map(row => (
              <TableRow key={row.account_id} className="hover:bg-transparent">
                <TableCell className="w-[100px] text-muted-foreground">{row.account_code}</TableCell>
                <TableCell>{row.account_name}</TableCell>
                <TableCell className="text-right font-mono">{formatCurrency(row.balance)}</TableCell>
              </TableRow>
            ))}
            <TableRow className="font-bold bg-muted/20 border-t-2 border-black/20">
              <TableCell colSpan={2}>Total {title}</TableCell>
              <TableCell className="text-right font-mono text-lg">{formatCurrency(total)}</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold tracking-tight">Balance Sheet</h1>
        <ExportButton
          data={data}
          filename="balance_sheet"
          columns={[
            { key: 'section', label: 'Section' },
            { key: 'account_code', label: 'Code' },
            { key: 'account_name', label: 'Account Name' },
            { key: 'balance', label: 'Balance' },
          ]}
        />
      </div>

      <ReportFilters
        asOfDate={asOfDate}
        branchId={branchId}
        costCenterId={costCenterId}
        onFilterChange={(filters) => {
          if (filters.asOfDate !== undefined) setAsOfDate(filters.asOfDate)
          if (filters.branchId !== undefined) setBranchId(filters.branchId)
          if (filters.costCenterId !== undefined) setCostCenterId(filters.costCenterId)
        }}
        onReset={() => {
          setBranchId(undefined)
          setCostCenterId(undefined)
        }}
        showAsOfDate
      />

      <Card>
        <CardHeader className="pb-3 border-b">
          <div className="flex justify-between items-end">
            <div className="space-y-1">
              <CardTitle>Statement of Financial Position</CardTitle>
              <p className="text-sm text-muted-foreground">As of {asOfDate}</p>
            </div>

            <Button size="sm" onClick={fetchData} disabled={loading}>
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Run Report'}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12 max-w-6xl mx-auto">
            {/* LEFT COLUMN: ASSETS */}
            <div>
              {renderSection('Assets', 'Asset')}
            </div>

            {/* RIGHT COLUMN: LIABILITIES & EQUITY */}
            <div>
              {renderSection('Liabilities', 'Liability')}
              {renderSection('Equity', 'Equity')}

              <div className="mt-8 pt-4 border-t-4 border-double border-primary/50">
                <div className="flex justify-between items-center text-xl font-bold">
                  <span>Total Liabilities & Equity</span>
                  <span>{formatCurrency(totals.liabilities + totals.equity)}</span>
                </div>
                {Math.abs(totals.assets - (totals.liabilities + totals.equity)) > 0.01 && (
                  <div className="mt-2 text-sm text-red-500 font-medium">
                    Warning: Unbalanced ({formatCurrency(totals.assets - (totals.liabilities + totals.equity))})
                  </div>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
