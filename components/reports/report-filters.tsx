'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { Filter, X } from 'lucide-react'
import { useSupabase } from '@/lib/supabase/hooks'
import { useAccess } from '@/lib/access-context'

type Branch = {
    id: string
    name: string
}

type CostCenter = {
    id: string
    name: string
}

type ReportFiltersProps = {
    startDate?: string
    endDate?: string
    asOfDate?: string
    branchId?: string
    costCenterId?: string
    onFilterChange: (filters: {
        startDate?: string
        endDate?: string
        asOfDate?: string
        branchId?: string
        costCenterId?: string
    }) => void
    onReset: () => void
    showDateRange?: boolean
    showAsOfDate?: boolean
}

export function ReportFilters({
    startDate,
    endDate,
    asOfDate,
    branchId,
    costCenterId,
    onFilterChange,
    onReset,
    showDateRange = true,
    showAsOfDate = false,
}: ReportFiltersProps) {
    const { supabase } = useSupabase()
    const { profile } = useAccess()
    const [branches, setBranches] = useState<Branch[]>([])
    const [costCenters, setCostCenters] = useState<CostCenter[]>([])
    const [isExpanded, setIsExpanded] = useState(false)

    useEffect(() => {
        if (!profile?.company_id) return

        async function loadFilters() {
            // Load branches
            const { data: branchData } = await supabase
                .from('branches')
                .select('id, name')
                .eq('company_id', profile!.company_id)
                .eq('is_active', true)
                .order('name')

            if (branchData) setBranches(branchData)

            // Load cost centers
            const { data: costCenterData } = await supabase
                .from('cost_centers')
                .select('id, name')
                .eq('company_id', profile!.company_id)
                .eq('is_active', true)
                .order('name')

            if (costCenterData) setCostCenters(costCenterData)
        }

        loadFilters()
    }, [profile?.company_id, supabase])

    const hasActiveFilters = branchId || costCenterId

    return (
        <Card className="mb-4">
            <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                    <CardTitle className="text-base flex items-center gap-2">
                        <Filter className="h-4 w-4" />
                        Filters
                    </CardTitle>
                    <div className="flex gap-2">
                        {hasActiveFilters && (
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={onReset}
                                className="h-8"
                            >
                                <X className="h-4 w-4 mr-1" />
                                Clear
                            </Button>
                        )}
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setIsExpanded(!isExpanded)}
                            className="h-8"
                        >
                            {isExpanded ? 'Hide' : 'Show'}
                        </Button>
                    </div>
                </div>
            </CardHeader>
            {isExpanded && (
                <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        {showDateRange && (
                            <>
                                <div className="space-y-2">
                                    <Label htmlFor="start-date">Start Date</Label>
                                    <Input
                                        id="start-date"
                                        type="date"
                                        value={startDate || ''}
                                        onChange={(e) =>
                                            onFilterChange({ startDate: e.target.value, endDate, branchId, costCenterId })
                                        }
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="end-date">End Date</Label>
                                    <Input
                                        id="end-date"
                                        type="date"
                                        value={endDate || ''}
                                        onChange={(e) =>
                                            onFilterChange({ startDate, endDate: e.target.value, branchId, costCenterId })
                                        }
                                    />
                                </div>
                            </>
                        )}
                        {showAsOfDate && (
                            <div className="space-y-2">
                                <Label htmlFor="as-of-date">As Of Date</Label>
                                <Input
                                    id="as-of-date"
                                    type="date"
                                    value={asOfDate || ''}
                                    onChange={(e) =>
                                        onFilterChange({ asOfDate: e.target.value, branchId, costCenterId })
                                    }
                                />
                            </div>
                        )}
                        <div className="space-y-2">
                            <Label htmlFor="branch">Branch</Label>
                            <Select
                                value={branchId || 'all'}
                                onValueChange={(value) =>
                                    onFilterChange({
                                        startDate,
                                        endDate,
                                        asOfDate,
                                        branchId: value === 'all' ? undefined : value,
                                        costCenterId,
                                    })
                                }
                            >
                                <SelectTrigger id="branch">
                                    <SelectValue placeholder="All Branches" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Branches</SelectItem>
                                    {branches.map((branch) => (
                                        <SelectItem key={branch.id} value={branch.id}>
                                            {branch.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="cost-center">Cost Center</Label>
                            <Select
                                value={costCenterId || 'all'}
                                onValueChange={(value) =>
                                    onFilterChange({
                                        startDate,
                                        endDate,
                                        asOfDate,
                                        branchId,
                                        costCenterId: value === 'all' ? undefined : value,
                                    })
                                }
                            >
                                <SelectTrigger id="cost-center">
                                    <SelectValue placeholder="All Cost Centers" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Cost Centers</SelectItem>
                                    {costCenters.map((cc) => (
                                        <SelectItem key={cc.id} value={cc.id}>
                                            {cc.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                </CardContent>
            )}
        </Card>
    )
}
