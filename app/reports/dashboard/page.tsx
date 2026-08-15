'use client'

/**
 * ⚠️ نظرة مالية عامة — v3.75.39 «ولا مسارَ بديلٍ لرقمٍ له بيت»
 * ---------------------------------------------------------------------------
 * كانت هذه الشاشة تنادى `get_financial_summary` — دالّة فى القاعدة تُعيد حساب
 * الإيرادات والمصروفات والأصول والالتزامات وحقوق الملكية من الصفر. وهو
 * **المسار البديل الذى يمنعه `docs/ACCOUNTING_REPORTS_ARCHITECTURE.md` نصّاً**:
 *
 *     «لا حساب مكرر: لا يُسمح بحساب نفس الرقم بطريقتين مختلفتين.»
 *     «لا مسار بديل: جميع التقارير تستخدم نفس الـ API/Function.»
 *
 * ولم يكتشفه أحد لأنّه كان **مكسوراً فيصمت**: كان يقارن `account_type` بـ
 * `'Revenue'` و`'Asset'` بحروف كبيرة، والقيم الحيّة كلّها صغيرة، فيعود صفر فى
 * كلّ خانة. فكانت الشاشة تعرض أصفاراً وتبدو سليمة.
 *
 * واليوم تقرأ من البيتين المعتمدين، **ولا تحسب رقماً واحداً بنفسها**:
 *   • قائمة الدخل (بمدّة) ......  `/api/income-statement`
 *   • الأصول/الالتزامات/الملكية   `/api/account-balances`
 *                                  ثم `computeBalanceSheetTotalsFromBalances`
 *                                  من `lib/ledger` — نفس ما تفعله شاشة
 *                                  الميزانية العمومية حرفاً بحرف.
 *
 * وتكلفة المبيعات تُفرَز من `sub_type = 'cogs'` — أى **من دليل الحسابات الذى
 * أعدّه صاحب الشركة**، لا من قاعدة محاسبية تؤلّفها هذه الشاشة. وصافى الدخل
 * يبقى كما يقوله البيت الواحد: الإيرادات − المصروفات، بلا طرح مزدوج.
 *
 * والعملة تُقرأ من الشركة عبر `lib/currency-utils`، فلا تُطبع جنيهات صاحب
 * العمل بعلامة الدولار.
 * ---------------------------------------------------------------------------
 */

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { DollarSign, TrendingUp, TrendingDown, Wallet } from 'lucide-react'
import { formatCurrency } from '@/lib/currency-utils'
import { useAccess } from '@/lib/access-context'
import { useSupabase } from '@/lib/supabase/hooks'
import { canAction } from '@/lib/authz'
import { computeBalanceSheetTotalsFromBalances } from '@/lib/ledger'

type AccountLine = { code: string; name: string; sub_type: string | null; amount: number }

type Overview = {
    revenue: number
    cogs: number
    expenses: number
    netIncome: number
    assets: number
    liabilities: number
    equity: number
}

export default function FinancialDashboardPage() {
    const { profile, isLoading: isAccessLoading } = useAccess()
    const supabase = useSupabase()

    // v3.74.581 — تقرير مالى: يتطلّب financial_reports (الإدارة العليا فقط)
    const [permChecked, setPermChecked] = useState(false)
    const [canViewFinancial, setCanViewFinancial] = useState(false)

    useEffect(() => {
        (async () => {
            setCanViewFinancial(await canAction(supabase, "financial_reports", "read"))
            setPermChecked(true)
        })()
    }, [supabase])

    const [startDate] = useState(new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0])
    const [endDate] = useState(new Date().toISOString().split('T')[0])
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [overview, setOverview] = useState<Overview | null>(null)
    const [currency, setCurrency] = useState('EGP')

    const fetchData = useCallback(async () => {
        if (!profile?.company_id) return
        setLoading(true)
        setError(null)
        try {
            const companyId = profile.company_id

            // عملة الشركة — لا علامة عملة ثابتة فى الشيفرة
            const { data: comp } = await supabase
                .from('companies')
                .select('base_currency')
                .eq('id', companyId)
                .maybeSingle()
            if (comp?.base_currency) setCurrency(String(comp.base_currency).toUpperCase())

            // ═══ البيت الأول: قائمة الدخل، محدودة بالمدّة ═══
            const isRes = await fetch(
                `/api/income-statement?from=${encodeURIComponent(startDate)}&to=${encodeURIComponent(endDate)}`
            )
            if (!isRes.ok) {
                const e = await isRes.json().catch(() => ({}))
                throw new Error(e?.message || e?.error || 'تعذّر تحميل قائمة الدخل')
            }
            const inc = await isRes.json()

            // ═══ البيت الثانى: أرصدة الحسابات حتى تاريخ النهاية ═══
            const abRes = await fetch(
                `/api/account-balances?companyId=${encodeURIComponent(companyId)}&asOf=${encodeURIComponent(endDate)}`
            )
            if (!abRes.ok) {
                const e = await abRes.json().catch(() => ({}))
                throw new Error(e?.message || e?.error || 'تعذّر تحميل أرصدة الحسابات')
            }
            const balances = await abRes.json()
            if (!Array.isArray(balances)) throw new Error('البيانات المستلمة غير صحيحة')

            // **الحساب الوحيد المسموح هنا: نداء البيت الواحد.**
            const totals = computeBalanceSheetTotalsFromBalances(balances)

            const expenseLines: AccountLine[] = Array.isArray(inc?.expenseAccounts) ? inc.expenseAccounts : []
            const cogs = expenseLines
                .filter((a) => (a.sub_type || '') === 'cogs')
                .reduce((s, a) => s + Number(a.amount || 0), 0)

            setOverview({
                revenue: Number(inc?.totalIncome || 0),
                cogs,
                expenses: Number(inc?.totalExpense || 0),
                netIncome: Number(inc?.netIncome || 0),
                assets: Math.abs(totals.assets),
                liabilities: Math.abs(totals.liabilities),
                equity: Math.abs(totals.equityTotalSigned),
            })
        } catch (e: any) {
            console.error(e)
            setError(e?.message || 'حدث خطأ أثناء تحميل النظرة المالية')
            setOverview(null)
        } finally {
            setLoading(false)
        }
    }, [profile?.company_id, startDate, endDate, supabase])

    useEffect(() => {
        if (profile?.company_id) fetchData()
    }, [profile?.company_id, fetchData])

    const money = (n: number) => formatCurrency(n, currency, 'ar')

    if (permChecked && !canViewFinancial) {
        return <div className="p-8 text-center text-muted-foreground">لا تملك صلاحية عرض هذا التقرير.</div>
    }
    if (loading || isAccessLoading) {
        return <div className="p-8 text-center text-muted-foreground">جارٍ تحميل البيانات المالية...</div>
    }
    // **ولا يُعرَض صفرٌ مكان خطأ** — الصمت الكاذب أسوأ من الغياب.
    if (error) {
        return <div className="p-8 text-center text-red-600">{error}</div>
    }
    if (!overview) {
        return <div className="p-8 text-center text-muted-foreground">لا توجد بيانات</div>
    }

    const grossProfit = overview.revenue - overview.cogs
    const margin = overview.revenue ? ((overview.netIncome / overview.revenue) * 100).toFixed(1) : '0.0'
    const assetsPlusLiabilities = overview.assets + overview.liabilities

    return (
        <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
          <main className="flex-1 md:mr-64 p-4 md:p-6 pt-20 md:pt-8 space-y-6 overflow-x-hidden">
            <h1 className="text-3xl font-bold tracking-tight mb-2">النظرة المالية العامة</h1>
            <p className="text-xs text-muted-foreground mb-6">
                من {startDate} إلى {endDate} — الأرقام من قائمة الدخل وأرصدة الحسابات، لا من حساب خاص بهذه الشاشة.
            </p>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">إجمالى الإيرادات</CardTitle>
                        <DollarSign className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-green-700">{money(overview.revenue)}</div>
                        <p className="text-xs text-muted-foreground">من أول السنة حتى اليوم</p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">إجمالى المصروفات</CardTitle>
                        <TrendingDown className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-red-700">{money(overview.expenses)}</div>
                        <p className="text-xs text-muted-foreground">شاملةً تكلفة المبيعات {money(overview.cogs)}</p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">صافى الربح</CardTitle>
                        <TrendingUp className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className={`text-2xl font-bold ${overview.netIncome >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {money(overview.netIncome)}
                        </div>
                        <p className="text-xs text-muted-foreground">هامش الربح: {margin}%</p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">حقوق الملكية</CardTitle>
                        <Wallet className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{money(overview.equity)}</div>
                        <p className="text-xs text-muted-foreground">شاملةً صافى ربح الفترة</p>
                    </CardContent>
                </Card>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
                <Card>
                    <CardHeader>
                        <CardTitle>مجمل الربح</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <span className="font-medium">الإيرادات</span>
                                <span className="text-green-600 font-bold">{money(overview.revenue)}</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="font-medium">تكلفة المبيعات</span>
                                <span className="text-red-600 font-bold">{money(overview.cogs)}</span>
                            </div>
                            <div className="flex items-center justify-between border-t pt-3">
                                <span className="font-medium">مجمل الربح</span>
                                <span className={`font-bold ${grossProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                    {money(grossProfit)}
                                </span>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>الأصول مقابل الالتزامات</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <span className="font-medium">إجمالى الأصول</span>
                                <span className="text-green-600 font-bold">{money(overview.assets)}</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="font-medium">إجمالى الالتزامات</span>
                                <span className="text-red-600 font-bold">{money(overview.liabilities)}</span>
                            </div>
                            <div className="h-2 bg-muted rounded-full overflow-hidden flex">
                                <div
                                    className="bg-green-500 h-full"
                                    style={{ width: `${assetsPlusLiabilities > 0 ? (overview.assets / assetsPlusLiabilities) * 100 : 0}%` }}
                                />
                                <div
                                    className="bg-red-500 h-full"
                                    style={{ width: `${assetsPlusLiabilities > 0 ? (overview.liabilities / assetsPlusLiabilities) * 100 : 0}%` }}
                                />
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>
          </main>
        </div>
    )
}
