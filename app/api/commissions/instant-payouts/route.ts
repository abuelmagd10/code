import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { NextRequest } from 'next/server';

/**
 * GET /api/commissions/instant-payouts
 * Get pending instant commission payouts for a company
 * 
 * Query params:
 * - companyId: UUID
 * - startDate: DATE
 * - endDate: DATE
 * - employeeId: UUID (optional)
 * 
 * Security: Owner/Admin/Finance only
 */
export async function GET(request: NextRequest) {
    try {
        const supabase = await createClient();

        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const companyId = searchParams.get('companyId');
        const startDate = searchParams.get('startDate');
        const endDate = searchParams.get('endDate');
        const employeeId = searchParams.get('employeeId');

        if (!companyId || !startDate || !endDate) {
            return NextResponse.json(
                { error: 'Missing required parameters: companyId, startDate, endDate' },
                { status: 400 }
            );
        }

        // Check role (Owner/Admin/Finance)
        const { data: companyMember } = await supabase
            .from('company_members')
            .select('role')
            .eq('company_id', companyId)
            .eq('user_id', user.id)
            .single();

        if (!companyMember || !['owner', 'admin', 'finance'].includes(companyMember.role)) {
            return NextResponse.json(
                { error: 'Forbidden: Only Owner/Admin/Finance can view instant payouts' },
                { status: 403 }
            );
        }

        // Get pending instant payouts using RPC function
        const { data: employees, error: rpcError } = await supabase
            .rpc('get_pending_instant_payouts', {
                p_company_id: companyId,
                p_start_date: startDate,
                p_end_date: endDate,
                p_employee_id: employeeId || null
            });

        // If RPC function doesn't exist (migration not applied yet), use fallback query
        if (rpcError && (rpcError.code === 'PGRST202' || rpcError.message?.includes('does not exist'))) {
            console.warn('⚠️ RPC function not found, using fallback query. Please apply migration: 20260217_004_commission_payroll_integration.sql');

            // Fallback: Manual aggregation query
            const { data: ledgerData, error: ledgerError } = await supabase
                .from('commission_ledger')
                .select(`
                    employee_id,
                    commission_amount,
                    source_type,
                    employees!inner(full_name)
                `)
                .eq('company_id', companyId)
                .gte('created_at', startDate)
                .lte('created_at', endDate);

            if (ledgerError) {
                console.error('Error fetching ledger data:', ledgerError);
                return NextResponse.json(
                    { error: 'Failed to fetch commission data. Please apply database migration.', details: ledgerError.message },
                    { status: 500 }
                );
            }

            // Manually aggregate by employee
            const employeeMap = new Map();
            (ledgerData || []).forEach((entry: any) => {
                const empId = entry.employee_id;
                if (!employeeMap.has(empId)) {
                    employeeMap.set(empId, {
                        employee_id: empId,
                        employee_name: entry.employees?.full_name || 'Unknown',
                        invoices_count: 0,
                        gross_commission: 0,
                        clawbacks: 0,
                        net_commission: 0
                    });
                }

                const emp = employeeMap.get(empId);
                const amount = Number(entry.commission_amount || 0);

                if (entry.source_type === 'sales_invoice') {
                    emp.invoices_count++;
                    emp.gross_commission += amount;
                } else if (entry.source_type === 'credit_note') {
                    emp.clawbacks += amount;
                }
                emp.net_commission += amount;
            });

            const employeesFromFallback = Array.from(employeeMap.values())
                .filter(emp => emp.net_commission > 0);

            // Use fallback data
            const employeesWithDetails = employeesFromFallback;

            return NextResponse.json({
                employees: employeesWithDetails,
                summary: {
                    total_employees: employeesWithDetails.length,
                    total_gross: employeesWithDetails.reduce((sum, e) => sum + Number(e.gross_commission || 0), 0),
                    total_clawbacks: employeesWithDetails.reduce((sum, e) => sum + Number(e.clawbacks || 0), 0),
                    total_net: employeesWithDetails.reduce((sum, e) => sum + Number(e.net_commission || 0), 0)
                },
                warning: 'Using fallback query. Please apply migration for better performance.'
            });
        }

        if (rpcError) {
            console.error('Error fetching instant payouts:', rpcError);
            return NextResponse.json(
                { error: 'Failed to fetch instant payouts', details: rpcError.message },
                { status: 500 }
            );
        }

        // Get detailed ledger entries for each employee
        const employeesWithDetails = await Promise.all(
            (employees || []).map(async (emp: any) => {
                const { data: ledgerEntries } = await supabase
                    .from('commission_ledger')
                    .select(`
                        id,
                        source_type,
                        source_id,
                        commission_amount,
                        created_at,
                        invoices:source_id(invoice_number, total_amount),
                        credit_notes:source_id(credit_note_number, total_amount)
                    `)
                    .eq('company_id', companyId)
                    .eq('employee_id', emp.employee_id)
                    .gte('created_at', startDate)
                    .lte('created_at', endDate)
                    .order('created_at', { ascending: false });

                return {
                    ...emp,
                    ledger_entries: ledgerEntries || []
                };
            })
        );

        return NextResponse.json({
            employees: employeesWithDetails,
            summary: {
                total_employees: employeesWithDetails.length,
                total_gross: employeesWithDetails.reduce((sum, e) => sum + Number(e.gross_commission || 0), 0),
                total_clawbacks: employeesWithDetails.reduce((sum, e) => sum + Number(e.clawbacks || 0), 0),
                total_net: employeesWithDetails.reduce((sum, e) => sum + Number(e.net_commission || 0), 0)
            }
        });
    } catch (error) {
        console.error('Unexpected error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
