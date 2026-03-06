import { NextRequest, NextResponse } from "next/server"
import { secureApiRequest, serverError, badRequestError } from "@/lib/api-security-enhanced"
import { createClient } from "@/lib/supabase/server"

export async function GET(request: NextRequest) {
    const { companyId, error: authError } = await secureApiRequest(request, {
        requireAuth: true,
        requireCompany: true
    })

    if (authError) return authError
    const supabase = await createClient()

    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type') || 'summary'
    const from = searchParams.get('from')
    const to = searchParams.get('to')
    const branchId = searchParams.get('branchId')
    const departmentId = searchParams.get('departmentId')
    const employeeId = searchParams.get('employeeId')

    if (!from || !to) {
        return badRequestError('Date range required')
    }

    // Base query for attendance records
    let query = supabase
        .from('attendance_records')
        .select(`
            *,
            employees!inner (
                id, full_name, branch_id, department_id, status,
                branches ( id, name ),
                departments ( id, name )
            )
        `)
        .eq('company_id', companyId)
        .gte('day_date', from)
        .lte('day_date', to)

    if (employeeId && employeeId !== 'all') {
        query = query.eq('employee_id', employeeId)
    }
    if (branchId && branchId !== 'all') {
        query = query.eq('employees.branch_id', branchId)
    }
    if (departmentId && departmentId !== 'all') {
        query = query.eq('employees.department_id', departmentId)
    }

    const { data: records, error } = await query
    if (error) {
        console.error("Reports API Query Error:", error)
        return serverError(error.message)
    }

    if (type === 'summary' || type === 'late' || type === 'overtime') {
        // Aggregate logic
        const aggregated = records.reduce((acc: any, record: any) => {
            const empId = record.employee_id
            if (!acc[empId]) {
                acc[empId] = {
                    employee: record.employees,
                    totalWorkingHours: 0,
                    totalLateMins: 0,
                    totalOvertimeMins: 0,
                    totalEarlyLeaveMins: 0,
                    daysPresent: 0
                }
            }
            acc[empId].totalWorkingHours += (record.working_hours || 0)
            acc[empId].totalLateMins += (record.late_minutes || 0)
            acc[empId].totalOvertimeMins += (record.overtime_minutes || 0)
            acc[empId].totalEarlyLeaveMins += (record.early_leave_minutes || 0)
            acc[empId].daysPresent += 1
            return acc
        }, {})

        let results = Object.values(aggregated).map((r: any) => ({
            ...r,
            totalWorkingHours: parseFloat(r.totalWorkingHours.toFixed(2))
        }))

        if (type === 'late') {
            results = results.filter((r: any) => r.totalLateMins > 0).sort((a: any, b: any) => b.totalLateMins - a.totalLateMins)
        } else if (type === 'overtime') {
            results = results.filter((r: any) => r.totalOvertimeMins > 0).sort((a: any, b: any) => b.totalOvertimeMins - a.totalOvertimeMins)
        } else {
            results = results.sort((a: any, b: any) => b.totalWorkingHours - a.totalWorkingHours)
        }

        return NextResponse.json(results)
    }

    if (type === 'absence') {
        // Fetch all active employees
        let empQuery = supabase
            .from('employees')
            .select('id, full_name, branch_id, department_id, status, branches(id, name), departments(id, name)')
            .eq('company_id', companyId)
            .eq('status', 'active')

        if (employeeId && employeeId !== 'all') empQuery = empQuery.eq('id', employeeId)
        if (branchId && branchId !== 'all') empQuery = empQuery.eq('branch_id', branchId)
        if (departmentId && departmentId !== 'all') empQuery = empQuery.eq('department_id', departmentId)

        const { data: employees, error: empError } = await empQuery
        if (empError) return serverError(empError.message)

        // Generate dates between from and to
        const dates: string[] = []
        let curr = new Date(from)
        const end = new Date(to)
        while (curr <= end) {
            // Skip Friday (5) and Saturday (6) as standard weekend heuristic.
            // In a perfect ERP, this would look at company calendar/shift rules.
            const dayOfWeek = curr.getDay()
            if (dayOfWeek !== 5 && dayOfWeek !== 6) {
                dates.push(curr.toISOString().split('T')[0])
            }
            curr.setDate(curr.getDate() + 1)
        }

        const absences: any[] = []
        for (const emp of employees || []) {
            const empRecords = records.filter((r: any) => r.employee_id === emp.id && ['present', 'late', 'early_leave'].includes(r.status))

            for (const date of dates) {
                const hasRecord = empRecords.some((r: any) => r.day_date === date)
                if (!hasRecord) {
                    absences.push({
                        employee: emp,
                        day_date: date,
                        note: 'لم يسجل حضور'
                    })
                }
            }
        }

        // Group absences by employee for consistent table structure
        const absAgg = absences.reduce((acc: any, absence: any) => {
            const empId = absence.employee.id;
            if (!acc[empId]) {
                acc[empId] = {
                    employee: absence.employee,
                    absenceDays: [],
                    totalAbsenceDays: 0
                }
            }
            acc[empId].absenceDays.push(absence.day_date)
            acc[empId].totalAbsenceDays += 1
            return acc;
        }, {})

        return NextResponse.json(Object.values(absAgg).sort((a: any, b: any) => b.totalAbsenceDays - a.totalAbsenceDays))
    }

    return badRequestError('Invalid report type')
}
