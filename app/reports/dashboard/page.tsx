'use client'

import { useState, useEffect } from 'react'
import { getFinancialSummary, type FinancialSummary } from '@/actions/financial-reports'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { DollarSign, TrendingUp, TrendingDown, Scale, Wallet } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'

export default function FinancialDashboard() {
    const [data, setData] = useState<FinancialSummary | null>(null)
    const [loading, setLoading] = useState(true)

    // Default to YTD
    const startDate = new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0]
    const endDate = new Date().toISOString().split('T')[0]
    const companyId = 'bf507664-071a-4ea8-9a48-47700a604246'

    useEffect(() => {
        async function fetch() {
            try {
                const result = await getFinancialSummary(companyId, startDate, endDate)
                setData(result)
            } catch (e) {
                console.error(e)
            } finally {
                setLoading(false)
            }
        }
        fetch()
    }, [])

    if (loading) return <div className="p-8 text-center text-muted-foreground">Loading financial data...</div>
    if (!data) return <div className="p-8 text-center text-muted-foreground">No data available</div>

    return (
        <div className="p-6 space-y-6">
            <h1 className="text-3xl font-bold tracking-tight mb-8">Financial Overview</h1>

            {/* KPI CARDS */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">

                {/* REVENUE */}
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
                        <DollarSign className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-green-700">{formatCurrency(data.total_revenue)}</div>
                        <p className="text-xs text-muted-foreground">Year to date</p>
                    </CardContent>
                </Card>

                {/* EXPENSES */}
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Expenses</CardTitle>
                        <TrendingDown className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-red-700">{formatCurrency(data.total_expenses + data.total_cogs)}</div>
                        <p className="text-xs text-muted-foreground">Excludes tax</p>
                    </CardContent>
                </Card>

                {/* NET INCOME */}
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Net Income</CardTitle>
                        <TrendingUp className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className={`text-2xl font-bold ${data.net_income >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {formatCurrency(data.net_income)}
                        </div>
                        <p className="text-xs text-muted-foreground">Profit margin: {data.total_revenue ? ((data.net_income / data.total_revenue) * 100).toFixed(1) : 0}%</p>
                    </CardContent>
                </Card>

                {/* EQUITY */}
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Equity</CardTitle>
                        <Wallet className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{formatCurrency(data.total_equity)}</div>
                        <p className="text-xs text-muted-foreground">Shareholder Value</p>
                    </CardContent>
                </Card>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
                <Card>
                    <CardHeader>
                        <CardTitle>Asset vs Liability</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <span className="font-medium">Total Assets</span>
                                <span className="text-green-600 font-bold">{formatCurrency(data.total_assets)}</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="font-medium">Total Liabilities</span>
                                <span className="text-red-600 font-bold">{formatCurrency(data.total_liabilities)}</span>
                            </div>
                            <div className="h-2 bg-muted rounded-full overflow-hidden flex">
                                <div
                                    className="bg-green-500 h-full"
                                    style={{ width: `${(data.total_assets / (data.total_assets + data.total_liabilities)) * 100}%` }}
                                />
                                <div
                                    className="bg-red-500 h-full"
                                    style={{ width: `${(data.total_liabilities / (data.total_assets + data.total_liabilities)) * 100}%` }}
                                />
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}
