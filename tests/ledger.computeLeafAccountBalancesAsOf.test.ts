import { describe, it, expect } from 'vitest'
import { computeLeafAccountBalancesAsOf } from '../lib/ledger'

// Minimal Supabase query builder mock compatible with `await`
function createSupabaseMock({ accounts, lines }: { accounts: any[]; lines: any[] }) {
  return {
    from(table: string) {
      const ctx: any = { table, filters: [] }
      const chain: any = {
        select: (_: string) => chain,
        eq: (col: string, val: any) => { ctx.filters.push({ type: 'eq', col, val }); return chain },
        order: (_: string) => chain,
        gte: (col: string, val: any) => { ctx.filters.push({ type: 'gte', col, val }); return chain },
        lte: (col: string, val: any) => { ctx.filters.push({ type: 'lte', col, val }); return chain },
        then: (onFulfilled: any, onRejected: any) => {
          const exec = async () => {
            if (table === 'chart_of_accounts') return { data: accounts, error: null }
            if (table === 'journal_entry_lines') {
              const fromF = ctx.filters.find((f: any) => f.type === 'gte' && f.col === 'journal_entries.entry_date')
              const toF = ctx.filters.find((f: any) => f.type === 'lte' && f.col === 'journal_entries.entry_date')
              const from = fromF?.val || '0001-01-01'
              const to = toF?.val || '9999-12-31'
              const inRange = (d: string) => d >= from && d <= to
              const filtered = lines.filter((l) => inRange(l.journal_entries.entry_date))
              return { data: filtered, error: null }
            }
            return { data: [], error: null }
          }
          exec().then(onFulfilled, onRejected)
        },
        catch: (_: any) => chain,
      }
      return chain
    },
  }
}

describe('computeLeafAccountBalancesAsOf', () => {
  it('computes balance as opening_balance + (debit - credit) for leaf accounts', async () => {
    const accounts = [
      { id: 'A1', account_code: '1000', account_name: 'Cash', account_type: 'asset', opening_balance: 100, parent_id: null },
      { id: 'A2', account_code: '5000', account_name: 'Expense', account_type: 'expense', opening_balance: 0, parent_id: null },
      { id: 'P1', account_code: '1999', account_name: 'Parent', account_type: 'asset', opening_balance: 0, parent_id: null },
      { id: 'C1', account_code: '1999-1', account_name: 'Child', account_type: 'asset', opening_balance: 0, parent_id: 'P1' },
    ]
    const lines = [
      { account_id: 'A1', debit_amount: 50, credit_amount: 10, journal_entries: { entry_date: '2025-01-15', company_id: 'CID' } },
      { account_id: 'A2', debit_amount: 20, credit_amount: 0, journal_entries: { entry_date: '2025-01-20', company_id: 'CID' } },
      { account_id: 'C1', debit_amount: 999, credit_amount: 999, journal_entries: { entry_date: '2025-01-25', company_id: 'CID' } },
    ]

    const supabase = createSupabaseMock({ accounts, lines }) as any
    const companyId = 'CID'
    const asOfDate = '2025-01-31'

    const probeAcc = await (supabase as any).from('chart_of_accounts').select('*').eq('company_id','CID')
    expect(probeAcc?.data?.length).toBe(4)

    const balances = await computeLeafAccountBalancesAsOf(supabase, companyId, asOfDate)
    expect(Array.isArray(balances)).toBe(true)
    expect(balances.length).toBe(3)
    const byId = new Map(balances.map((b) => [b.account_id, b]))

    expect(byId.get('A1')?.balance).toBe(140) // 100 + (50-10)
    expect(byId.get('A2')?.balance).toBe(20)  // 0 + (20-0)
    // Child C1 is a leaf (not a parent of other accounts) and included
    expect(byId.get('C1')?.balance).toBe(0)
  })
})
