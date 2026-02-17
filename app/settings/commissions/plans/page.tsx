"use client"

/**
 * Commission Plans Management Page
 * 
 * Features:
 * - DataTable with commission plans
 * - Filters: Active/Inactive, Date Range, Plan Type
 * - RBAC-controlled actions (Create/Edit/Delete)
 * - Plan Type Badge and Effective Period Badge
 * - Soft delete handling
 * - Dark mode support
 * - Bilingual (AR/EN)
 * 
 * CRITICAL: No business logic, API-only operations
 */

import { useState, useEffect, useMemo } from "react"
import { Sidebar } from "@/components/sidebar"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { FilterContainer } from "@/components/ui/filter-container"
import { LoadingState } from "@/components/ui/loading-state"
import { EmptyState } from "@/components/ui/empty-state"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useSupabase } from "@/lib/supabase/hooks"
import { Edit2, Trash2, Search, Plus, X, BarChart3 } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { getActiveCompanyId } from "@/lib/company"
import { canAction } from "@/lib/authz"
import { DataTable, type DataTableColumn } from "@/components/DataTable"
import { PlanFormDialog } from "@/components/commissions/plan-form-dialog"
import { PlanTypeBadge } from "@/components/commissions/plan-type-badge"
import type { TierRule } from "@/components/commissions/tier-rules-builder"

interface CommissionPlan {
    id: string
    name: string
    type: 'flat_percent' | 'tiered_revenue'
    tier_type: 'progressive' | 'slab' | null
    calculation_basis: 'before_discount' | 'after_discount' | 'before_vat' | 'after_vat'
    handle_returns: boolean
    effective_from: string
    effective_to: string | null
    flat_rate: number | null
    tier_rules: TierRule[] | null
    is_active: boolean
    created_at: string
}

export default function CommissionPlansPage() {
    const supabase = useSupabase()
    const { toast } = useToast()

    // State
    const [plans, setPlans] = useState<CommissionPlan[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [searchTerm, setSearchTerm] = useState("")
    const [appLang, setAppLang] = useState<'ar' | 'en'>('ar')

    // Filters
    const [filterStatus, setFilterStatus] = useState<string>("all") // all, active, inactive
    const [filterType, setFilterType] = useState<string>("all") // all, flat_percent, tiered_revenue
    const [filterDateFrom, setFilterDateFrom] = useState<string>("")
    const [filterDateTo, setFilterDateTo] = useState<string>("")

    // Dialog state
    const [isDialogOpen, setIsDialogOpen] = useState(false)
    const [editingPlan, setEditingPlan] = useState<CommissionPlan | null>(null)

    // Permissions
    const [permWrite, setPermWrite] = useState(false)
    const [permUpdate, setPermUpdate] = useState(false)
    const [permDelete, setPermDelete] = useState(false)
    const [permissionsLoaded, setPermissionsLoaded] = useState(false)

    /**
     * Initialize language
     */
    useEffect(() => {
        try {
            setAppLang((localStorage.getItem('app_language') || 'ar') === 'en' ? 'en' : 'ar')
        } catch { }
    }, [])

    /**
     * Load permissions
     */
    useEffect(() => {
        const loadPermissions = async () => {
            const [write, update, del] = await Promise.all([
                canAction(supabase, 'commission_plans', 'write'),
                canAction(supabase, 'commission_plans', 'update'),
                canAction(supabase, 'commission_plans', 'delete')
            ])
            setPermWrite(write)
            setPermUpdate(update)
            setPermDelete(del)
            setPermissionsLoaded(true)
        }
        loadPermissions()
    }, [supabase])

    /**
     * Load plans
     */
    useEffect(() => {
        if (permissionsLoaded) {
            loadPlans()
        }
    }, [permissionsLoaded])

    const loadPlans = async () => {
        try {
            setIsLoading(true)

            const activeCompanyId = await getActiveCompanyId(supabase)
            if (!activeCompanyId) return

            const { data, error } = await supabase
                .from('commission_plans')
                .select('*')
                .eq('company_id', activeCompanyId)
                .order('created_at', { ascending: false })

            if (error) throw error

            setPlans(data || [])
        } catch (error) {
            console.error('Error loading plans:', error)
            toast({
                title: appLang === 'en' ? 'Error' : 'خطأ',
                description: appLang === 'en' ? 'Failed to load commission plans' : 'فشل تحميل خطط العمولة',
                variant: 'destructive'
            })
        } finally {
            setIsLoading(false)
        }
    }

    /**
     * Handle create
     */
    const handleCreate = () => {
        setEditingPlan(null)
        setIsDialogOpen(true)
    }

    /**
     * Handle edit
     */
    const handleEdit = (plan: CommissionPlan) => {
        setEditingPlan(plan)
        setIsDialogOpen(true)
    }

    /**
     * Handle delete
     */
    const handleDelete = async (id: string) => {
        if (!permDelete) {
            toast({
                title: appLang === 'en' ? 'Permission Denied' : 'تم رفض الإذن',
                description: appLang === 'en' ? 'You do not have permission to delete plans' : 'ليس لديك إذن لحذف الخطط',
                variant: 'destructive'
            })
            return
        }

        const confirmMessage = appLang === 'en'
            ? 'Are you sure you want to delete this commission plan?'
            : 'هل أنت متأكد من حذف خطة العمولة هذه؟'

        if (!window.confirm(confirmMessage)) {
            return
        }

        try {
            const activeCompanyId = await getActiveCompanyId(supabase)
            if (!activeCompanyId) return

            const response = await fetch(`/api/commissions/plans/${id}`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' }
            })

            if (!response.ok) {
                const error = await response.json()
                throw new Error(error.error || 'Failed to delete plan')
            }

            toast({
                title: appLang === 'en' ? 'Plan Deleted' : 'تم حذف الخطة',
                description: appLang === 'en' ? 'Plan deleted successfully' : 'تم حذف الخطة بنجاح'
            })

            loadPlans()
        } catch (error: any) {
            toast({
                title: appLang === 'en' ? 'Error' : 'خطأ',
                description: error.message || (appLang === 'en' ? 'Failed to delete plan' : 'فشل حذف الخطة'),
                variant: 'destructive'
            })
        }
    }

    /**
     * Handle save complete
     */
    const handleSaveComplete = () => {
        loadPlans()
    }

    /**
     * Filtered plans
     */
    const filteredPlans = useMemo(() => {
        return plans.filter((plan) => {
            // Status filter
            if (filterStatus === 'active' && !plan.is_active) return false
            if (filterStatus === 'inactive' && plan.is_active) return false

            // Type filter
            if (filterType !== 'all' && plan.type !== filterType) return false

            // Date range filter
            if (filterDateFrom && plan.effective_from < filterDateFrom) return false
            if (filterDateTo && plan.effective_to && plan.effective_to > filterDateTo) return false

            // Search filter
            const query = searchTerm.trim().toLowerCase()
            if (query && !plan.name.toLowerCase().includes(query)) return false

            return true
        })
    }, [plans, filterStatus, filterType, filterDateFrom, filterDateTo, searchTerm])

    /**
     * Active filter count
     */
    const activeFilterCount = [
        filterStatus !== 'all',
        filterType !== 'all',
        !!filterDateFrom,
        !!filterDateTo,
        !!searchTerm
    ].filter(Boolean).length

    /**
     * Clear filters
     */
    const clearFilters = () => {
        setFilterStatus('all')
        setFilterType('all')
        setFilterDateFrom('')
        setFilterDateTo('')
        setSearchTerm('')
    }

    /**
     * Table columns
     */
    const tableColumns: DataTableColumn<CommissionPlan>[] = useMemo(() => [
        {
            key: 'name',
            header: appLang === 'en' ? 'Plan Name' : 'اسم الخطة',
            type: 'text',
            align: 'left',
            width: 'min-w-[200px]',
            format: (value) => (
                <span className="font-medium text-gray-900 dark:text-white">{value}</span>
            )
        },
        {
            key: 'type',
            header: appLang === 'en' ? 'Type' : 'النوع',
            type: 'custom',
            align: 'center',
            width: 'min-w-[150px]',
            format: (_, plan) => (
                <PlanTypeBadge
                    planType={plan.type}
                    tierType={plan.tier_type}
                    lang={appLang}
                />
            )
        },
        {
            key: 'effective_from',
            header: appLang === 'en' ? 'Effective Period' : 'الفترة السارية',
            type: 'custom',
            align: 'center',
            width: 'min-w-[180px]',
            format: (_, plan) => (
                <PlanTypeBadge
                    planType={plan.type}
                    effectiveFrom={plan.effective_from}
                    effectiveTo={plan.effective_to}
                    lang={appLang}
                />
            )
        },
        {
            key: 'flat_rate',
            header: appLang === 'en' ? 'Rate/Tiers' : 'النسبة/الشرائح',
            type: 'custom',
            align: 'center',
            width: 'min-w-[120px]',
            format: (_, plan) => {
                if (plan.type === 'flat_percent') {
                    return (
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                            {plan.flat_rate}%
                        </span>
                    )
                } else {
                    const tierCount = plan.tier_rules?.length || 0
                    return (
                        <span className="text-sm text-gray-600 dark:text-gray-400">
                            {tierCount} {appLang === 'en' ? 'tiers' : 'شريحة'}
                        </span>
                    )
                }
            }
        },
        {
            key: 'is_active',
            header: appLang === 'en' ? 'Status' : 'الحالة',
            type: 'custom',
            align: 'center',
            width: 'min-w-[100px]',
            format: (value) => (
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${value
                        ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                        : 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400'
                    }`}>
                    {value
                        ? (appLang === 'en' ? 'Active' : 'نشط')
                        : (appLang === 'en' ? 'Inactive' : 'غير نشط')}
                </span>
            )
        },
        {
            key: 'id',
            header: appLang === 'en' ? 'Actions' : 'الإجراءات',
            type: 'custom',
            align: 'center',
            width: 'min-w-[120px]',
            format: (_, plan) => (
                <div className="flex items-center justify-center gap-2">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEdit(plan)}
                        disabled={!permUpdate}
                        className="h-8 w-8 p-0"
                    >
                        <Edit2 className="h-4 w-4" />
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(plan.id)}
                        disabled={!permDelete}
                        className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
                    >
                        <Trash2 className="h-4 w-4" />
                    </Button>
                </div>
            )
        }
    ], [appLang, permUpdate, permDelete])

    return (
        <div className="flex h-screen overflow-hidden bg-gray-50 dark:bg-gray-900">
            <Sidebar />
            <div className="flex-1 flex flex-col overflow-hidden">
                <main className="flex-1 overflow-y-auto p-6">
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
                            <CardTitle className="text-2xl font-bold flex items-center gap-2">
                                <BarChart3 className="h-6 w-6" />
                                {appLang === 'en' ? 'Commission Plans' : 'خطط العمولة'}
                            </CardTitle>
                            <Button
                                onClick={handleCreate}
                                disabled={!permWrite}
                                className="gap-2"
                            >
                                <Plus className="h-4 w-4" />
                                {appLang === 'en' ? 'Create Plan' : 'إنشاء خطة'}
                            </Button>
                        </CardHeader>

                        <CardContent>
                            {/* Filters */}
                            <FilterContainer
                                activeCount={activeFilterCount}
                                onClear={clearFilters}
                                lang={appLang}
                            >
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                                    {/* Search */}
                                    <div className="space-y-2">
                                        <Label htmlFor="search">
                                            {appLang === 'en' ? 'Search' : 'بحث'}
                                        </Label>
                                        <div className="relative">
                                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                                            <Input
                                                id="search"
                                                value={searchTerm}
                                                onChange={(e) => setSearchTerm(e.target.value)}
                                                placeholder={appLang === 'en' ? 'Search by name...' : 'البحث بالاسم...'}
                                                className="pl-9"
                                            />
                                            {searchTerm && (
                                                <button
                                                    onClick={() => setSearchTerm('')}
                                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                                                >
                                                    <X className="h-4 w-4" />
                                                </button>
                                            )}
                                        </div>
                                    </div>

                                    {/* Status Filter */}
                                    <div className="space-y-2">
                                        <Label htmlFor="status">
                                            {appLang === 'en' ? 'Status' : 'الحالة'}
                                        </Label>
                                        <Select value={filterStatus} onValueChange={setFilterStatus}>
                                            <SelectTrigger id="status">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="all">
                                                    {appLang === 'en' ? 'All' : 'الكل'}
                                                </SelectItem>
                                                <SelectItem value="active">
                                                    {appLang === 'en' ? 'Active' : 'نشط'}
                                                </SelectItem>
                                                <SelectItem value="inactive">
                                                    {appLang === 'en' ? 'Inactive' : 'غير نشط'}
                                                </SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    {/* Type Filter */}
                                    <div className="space-y-2">
                                        <Label htmlFor="type">
                                            {appLang === 'en' ? 'Plan Type' : 'نوع الخطة'}
                                        </Label>
                                        <Select value={filterType} onValueChange={setFilterType}>
                                            <SelectTrigger id="type">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="all">
                                                    {appLang === 'en' ? 'All Types' : 'جميع الأنواع'}
                                                </SelectItem>
                                                <SelectItem value="flat_percent">
                                                    {appLang === 'en' ? 'Flat Percentage' : 'نسبة ثابتة'}
                                                </SelectItem>
                                                <SelectItem value="tiered_revenue">
                                                    {appLang === 'en' ? 'Tiered Revenue' : 'شرائح الإيرادات'}
                                                </SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    {/* Date Range */}
                                    <div className="space-y-2">
                                        <Label htmlFor="date_from">
                                            {appLang === 'en' ? 'Effective From' : 'ساري من'}
                                        </Label>
                                        <Input
                                            id="date_from"
                                            type="date"
                                            value={filterDateFrom}
                                            onChange={(e) => setFilterDateFrom(e.target.value)}
                                        />
                                    </div>
                                </div>
                            </FilterContainer>

                            {/* Table */}
                            {isLoading ? (
                                <LoadingState message={appLang === 'en' ? 'Loading plans...' : 'جاري تحميل الخطط...'} />
                            ) : filteredPlans.length === 0 ? (
                                <EmptyState
                                    icon={BarChart3}
                                    title={appLang === 'en' ? 'No commission plans found' : 'لا توجد خطط عمولة'}
                                    description={
                                        activeFilterCount > 0
                                            ? (appLang === 'en' ? 'Try adjusting your filters' : 'حاول تعديل الفلاتر')
                                            : (appLang === 'en' ? 'Create your first commission plan to get started' : 'أنشئ أول خطة عمولة للبدء')
                                    }
                                    action={
                                        permWrite && activeFilterCount === 0 ? (
                                            <Button onClick={handleCreate} className="gap-2">
                                                <Plus className="h-4 w-4" />
                                                {appLang === 'en' ? 'Create Plan' : 'إنشاء خطة'}
                                            </Button>
                                        ) : undefined
                                    }
                                />
                            ) : (
                                <DataTable
                                    data={filteredPlans}
                                    columns={tableColumns}
                                    lang={appLang}
                                />
                            )}
                        </CardContent>
                    </Card>
                </main>
            </div>

            {/* Plan Form Dialog */}
            <PlanFormDialog
                open={isDialogOpen}
                onOpenChange={setIsDialogOpen}
                editingPlan={editingPlan}
                onSaveComplete={handleSaveComplete}
                lang={appLang}
            />
        </div>
    )
}
