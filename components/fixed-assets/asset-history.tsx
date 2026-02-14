"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"

interface AssetTransaction {
    id: string
    transaction_type: string
    transaction_date: string
    amount: number
    details: any
}

interface AssetHistoryProps {
    transactions: AssetTransaction[]
    lang: 'ar' | 'en'
}

export function AssetHistory({ transactions, lang }: AssetHistoryProps) {
    const formatNumber = (num: number) => {
        return num.toLocaleString(lang === 'ar' ? 'ar-EG' : 'en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    }

    const typeMap: Record<string, string> = {
        acquisition: lang === 'en' ? 'Acquisition' : 'شراء',
        depreciation: lang === 'en' ? 'Depreciation' : 'إهلاك',
        addition: lang === 'en' ? 'Capital Addition' : 'إضافة رأسمالية',
        revaluation: lang === 'en' ? 'Revaluation' : 'إعادة تقييم',
        disposal: lang === 'en' ? 'Disposal' : 'استبعاد',
        adjustment: lang === 'en' ? 'Adjustment' : 'تسويه'
    }

    return (
        <Card className="dark:bg-slate-900 mt-6">
            <CardHeader>
                <CardTitle>{lang === 'en' ? 'Transaction History' : 'سجل العمليات'}</CardTitle>
            </CardHeader>
            <CardContent>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>{lang === 'en' ? 'Date' : 'التاريخ'}</TableHead>
                            <TableHead>{lang === 'en' ? 'Type' : 'النوع'}</TableHead>
                            <TableHead>{lang === 'en' ? 'Amount' : 'المبلغ'}</TableHead>
                            <TableHead>{lang === 'en' ? 'Details' : 'التفاصيل'}</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {transactions.map((t) => (
                            <TableRow key={t.id}>
                                <TableCell>{new Date(t.transaction_date).toLocaleDateString(lang === 'en' ? 'en-US' : 'ar-EG')}</TableCell>
                                <TableCell>
                                    <Badge variant="outline">{typeMap[t.transaction_type] || t.transaction_type}</Badge>
                                </TableCell>
                                <TableCell className={t.amount < 0 ? "text-red-500" : "text-green-500"}>
                                    {formatNumber(t.amount)}
                                </TableCell>
                                <TableCell className="text-sm text-gray-500 max-w-xs truncate">
                                    {JSON.stringify(t.details)}
                                </TableCell>
                            </TableRow>
                        ))}
                        {transactions.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={4} className="text-center text-gray-500">
                                    {lang === 'en' ? 'No history found' : 'لا يوجد سجل عمليات'}
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>
    )
}
