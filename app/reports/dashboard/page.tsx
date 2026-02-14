'use client'

import { useState, useEffect } from 'react'
import { getFinancialSummary, type FinancialSummary } from '@/actions/financial-reports'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { DollarSign, TrendingUp, TrendingDown, Scale, Wallet } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { useAccess } from '@/lib/access-context'

export default function FinancialDashboardPage() {
    const { profile, isLoading: isAccessLoading } = useAccess()
    const [startDate, setStartDate] = useState(new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0])
    const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0])
    const [loading, setLoading] = useState(false)
    const [summary, setSummary] = useState<FinancialSummary | null>(null) // Changed to single object, not array

    async function fetchData() {
        if (!profile?.company_id) return

        setLoading(true)
        try {
            const result = await getFinancialSummary(profile.company_id, startDate, endDate)
            setSummary(result)
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
    }, [profile?.company_id, startDate, endDate]) // Added startDate, endDate to dependencies

    if (loading || isAccessLoading) return <div className="p-8 text-center text-muted-foreground">Loading financial data...</div>
    if (!summary) return <div className="p-8 text-center text-muted-foreground">No data available</div>

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
                        <div className="text-2xl font-bold text-green-700">{formatCurrency(summary.total_revenue)}</div>
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
                        <div className="text-2xl font-bold text-red-700">{formatCurrency(summary.total_expenses + summary.total_cogs)}</div>
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
                        <div className={`text-2xl font-bold ${summary.net_income >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {formatCurrency(summary.net_income)}
                        </div>
                        <p className="text-xs text-muted-foreground">Profit margin: {summary.total_revenue ? ((summary.net_income / summary.total_revenue) * 100).toFixed(1) : 0}%</p>
                    </CardContent>
                </Card>

                {/* EQUITY */}
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Equity</CardTitle>
                        <Wallet className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{formatCurrency(summary.total_equity)}</div>
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
                                <span className="text-green-600 font-bold">{formatCurrency(summary.total_assets)}</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="font-medium">Total Liabilities</span>
                                <span className="text-red-600 font-bold">{formatCurrency(summary.total_liabilities)}</span>
                            </div>
                            <div className="h-2 bg-muted rounded-full overflow-hidden flex">
                                <div
                                    className="bg-green-500 h-full"
                                    style={{ width: `${(summary.total_assets / (summary.total_assets + summary.total_liabilities)) * 100}%` }}
                                />
                                <div
                                    className="bg-red-500 h-full"
                                    style={{ width: `${(summary.total_liabilities / (summary.total_assets + summary.total_liabilities)) * 100}%` }}
                                />
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}
