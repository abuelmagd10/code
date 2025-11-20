import { describe, it, expect } from 'vitest'
import { computeIncomeExpenseFromLines } from '../lib/ledger'

describe('computeIncomeExpenseFromLines', () => {
  it('aggregates income as credit minus debit, expense as debit minus credit', () => {
    const typeByAccount = new Map<string, string>([
      ['A1', 'income'],
      ['A2', 'expense'],
      ['A3', 'income'],
    ])
    const leafSet = new Set<string>(['A1', 'A2', 'A3'])

    const lines = [
      // income account A1: credit 100, debit 10 => +90 income
      { account_id: 'A1', debit_amount: 10, credit_amount: 100 },
      // expense account A2: debit 50, credit 5 => +45 expense
      { account_id: 'A2', debit_amount: 50, credit_amount: 5 },
      // income account A3: credit 40, debit 0 => +40 income
      { account_id: 'A3', debit_amount: 0, credit_amount: 40 },
      // non-leaf account should be ignored
      { account_id: 'PARENT', debit_amount: 999, credit_amount: 999 },
    ]

    const { totalIncome, totalExpense } = computeIncomeExpenseFromLines(lines as any[], typeByAccount, leafSet)
    expect(totalIncome).toBe(130) // 90 + 40
    expect(totalExpense).toBe(45)
  })

  it('ignores lines for accounts not in leaf set', () => {
    const typeByAccount = new Map<string, string>([
      ['A1', 'income'],
      ['A2', 'expense'],
    ])
    const leafSet = new Set<string>(['A1'])

    const lines = [
      { account_id: 'A1', debit_amount: 0, credit_amount: 100 },
      { account_id: 'A2', debit_amount: 100, credit_amount: 0 },
    ]

    const { totalIncome, totalExpense } = computeIncomeExpenseFromLines(lines as any[], typeByAccount, leafSet)
    expect(totalIncome).toBe(100)
    expect(totalExpense).toBe(0)
  })
})

