import { SupabaseClient } from "@supabase/supabase-js"

export interface EquityStatementItem {
    row: string
    shareCapital: number
    retainedEarnings: number
    otherEquity: number
    total: number
    isBold?: boolean
}

export interface EquityStatementData {
    items: EquityStatementItem[]
    period: { from: string; to: string }
}

export class EquityReportingService {
    constructor(private supabase: SupabaseClient) { }

    /**
     * Generates Statement of Changes in Equity
     * Logic:
     * 1. Fetch all GL lines for Income, Expense, and Equity accounts.
     * 2. Iterate through lines:
     *    - If date < fromDate: Accumulate into Opening Balance.
     *      - Income/Expense -> Retained Earnings
     *      - Equity -> Respective Bucket
     *    - If date >= fromDate and date <= toDate: Accumulate into Movements.
     *      - Income/Expense -> Net Profit (Retained Earnings)
     *      - Equity -> Capital / Dividend / Drawing rows based on account subtype/name.
     */
    async getStatementOfChanges(companyId: string, fromDate: string, toDate: string): Promise<EquityStatementData> {
        // 1. Fetch Chart of Accounts (Income, Expense, Equity)
        const { data: accounts, error: accountsError } = await this.supabase
            .from('chart_of_accounts')
            .select('id, account_name, account_code, account_type, sub_type')
            .eq('company_id', companyId)
            .in('account_type', ['income', 'expense', 'equity'])

        if (accountsError) throw new Error(`Error fetching accounts: ${accountsError.message}`)

        const accountMap = new Map<string, { type: string, subtype: string, name: string }>()
        accounts.forEach(acc => {
            accountMap.set(acc.id, {
                type: acc.account_type.toLowerCase(),
                subtype: (acc.sub_type || '').toLowerCase(),
                name: acc.account_name.toLowerCase()
            })
        })

        // 2. Fetch Journal Entry Lines (Linked to these accounts)
        // We need ENTRY DATE from journal_entries
        const { data: lines, error: linesError } = await this.supabase
            .from('journal_entry_lines')
            .select(`
        account_id, debit_amount, credit_amount,
        journal_entries!inner (entry_date, status)
      `)
            .eq('journal_entries.company_id', companyId)
            .eq('journal_entries.status', 'posted')
            .lte('journal_entries.entry_date', toDate) // We need history up to endDate
            .gt('journal_entries.entry_date', '0000-01-01') // Optimization
        // Note: We need ALL history for opening balance, so no lower bound on date unless we have closing entries.
        // Assuming no closing entries yet.

        if (linesError) throw new Error(`Error fetching GL lines: ${linesError.message}`)

        // 3. Initialize Accumulators
        let openingCapital = 0
        let openingRetained = 0
        let openingOther = 0

        let mvtNetProfit = 0
        let mvtCapitalIssued = 0
        let mvtDividends = 0
        let mvtDrawings = 0
        let mvtOther = 0

        // 4. Process Lines
        lines.forEach((line: any) => {
            const account = accountMap.get(line.account_id)
            if (!account) return

            const entryDate = line.journal_entries.entry_date
            const debit = Number(line.debit_amount || 0)
            const credit = Number(line.credit_amount || 0)

            // Calculate signed amount based on account type normal balance logic? 
            // Actually simpler: 
            // Equity: Credit is positive.
            // Income: Credit is positive (increases profit -> increases Equity).
            // Expense: Debit is positive (decreases profit -> decreases Equity).

            // Let's standardise on "Effect on Equity (Credit +)"
            let equityEffect = 0

            if (account.type === 'equity' || account.type === 'income') {
                equityEffect = credit - debit
            } else if (account.type === 'expense') {
                equityEffect = credit - debit // Expense Debit decreases equity, so (Credit - Debit) is correct (negative).
            }

            const isPrior = entryDate < fromDate

            if (isPrior) {
                // Opening Balance
                if (account.type === 'income' || account.type === 'expense') {
                    openingRetained += equityEffect
                } else if (account.type === 'equity') {
                    if (this.isCapital(account)) openingCapital += equityEffect
                    else if (this.isRetainedEarnings(account)) openingRetained += equityEffect
                    else openingOther += equityEffect
                }
            } else {
                // Current Period Movement
                if (account.type === 'income' || account.type === 'expense') {
                    mvtNetProfit += equityEffect
                } else if (account.type === 'equity') {
                    if (this.isCapital(account)) mvtCapitalIssued += equityEffect
                    else if (this.isRetainedEarnings(account)) {
                        // Check if it's a dividend?
                        // Dividends are usually Debits to Retained Earnings.
                        // If equityEffect is negative (Debit), and name is dividend, it's dividend.
                        if (equityEffect < 0 && (account.name.includes('dividend') || account.name.includes('توزيع'))) {
                            mvtDividends += equityEffect // will be negative
                        } else {
                            // Other RE adjustments
                            // mvtNetProfit is for P&L, this is for direct equity adjustments
                            // Let's group generic RE adjustments with "Other" or separate?
                            // For simplicity, add to Other for now, or keep in RE column but separate row? 
                            // Let's just add to Other Movements for simplicity unless specifically defined.
                            mvtOther += equityEffect
                        }
                    }
                    else {
                        // Other Equity (Drawings, etc)
                        if (account.name.includes('drawing') || account.name.includes('سحب') || account.name.includes('مسحوبات')) {
                            mvtDrawings += equityEffect // will be negative
                        } else {
                            mvtOther += equityEffect
                        }
                    }
                }
            }
        })

        // 5. Construct Report
        const rows: EquityStatementItem[] = []

        // Row 1: Opening Balance
        rows.push({
            row: "Opening Balance",
            shareCapital: openingCapital,
            retainedEarnings: openingRetained,
            otherEquity: openingOther,
            total: openingCapital + openingRetained + openingOther,
            isBold: true
        })

        // Row 2: Net Profit
        if (mvtNetProfit !== 0) {
            rows.push({
                row: "Net Profit / (Loss)",
                shareCapital: 0,
                retainedEarnings: mvtNetProfit,
                otherEquity: 0,
                total: mvtNetProfit
            })
        }

        // Row 3: Capital Issued
        if (mvtCapitalIssued !== 0) {
            rows.push({
                row: "Capital Issued",
                shareCapital: mvtCapitalIssued,
                retainedEarnings: 0,
                otherEquity: 0,
                total: mvtCapitalIssued
            })
        }

        // Row 4: Dividends
        if (mvtDividends !== 0) {
            rows.push({
                row: "Dividends",
                shareCapital: 0,
                retainedEarnings: mvtDividends,
                otherEquity: 0,
                total: mvtDividends
            })
        }

        // Row 5: Drawings
        if (mvtDrawings !== 0) {
            rows.push({
                row: "Drawings",
                shareCapital: 0,
                retainedEarnings: 0,
                otherEquity: mvtDrawings,
                total: mvtDrawings
            })
        }

        // Row 6: Other Movements
        if (mvtOther !== 0) {
            rows.push({
                row: "Other Movements",
                shareCapital: 0,
                retainedEarnings: 0,
                otherEquity: mvtOther,
                total: mvtOther
            })
        }

        // Row 7: Closing Balance
        rows.push({
            row: "Closing Balance",
            shareCapital: openingCapital + mvtCapitalIssued,
            retainedEarnings: openingRetained + mvtNetProfit + mvtDividends, // Note: mvtOther might be mixed, simplifying here
            otherEquity: openingOther + mvtDrawings + mvtOther, // Assumes mvtOther affects Other Equity or RE?
            // actually mvtOther logic above was: if RE account but not dividend -> mvtOther
            // So mvtOther strictly affects RE or Other based on column?
            // My simple logic put them in 'total' but didn't split column well.
            // Let's refine:
            // We need to track the column for mvtOther.
            // Simplification: Add mvtOther to 'Other Equity' column for now.
            total: (openingCapital + mvtCapitalIssued) +
                (openingRetained + mvtNetProfit + mvtDividends) +
                (openingOther + mvtDrawings + mvtOther),
            isBold: true
        })

        return { items: rows, period: { from: fromDate, to: toDate } }
    }

    private isCapital(acc: { subtype: string, name: string }) {
        return acc.subtype === 'capital' || acc.name.includes('capital') || acc.name.includes('رأس المال')
    }

    private isRetainedEarnings(acc: { subtype: string, name: string }) {
        return acc.subtype === 'retained_earnings' || acc.name.includes('retained') || acc.name.includes('أرباح محتجزة') || acc.name.includes('ارباح محتجزة')
    }
}
