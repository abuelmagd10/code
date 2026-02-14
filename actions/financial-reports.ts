'use server'

import { createClient } from '@/utils/supabase/server' // Assuming standard util path, adjust if needed
import { cookies } from 'next/headers'

// Define Types
export type TrialBalanceRow = {
    account_id: string
    account_code: string
    account_name: string
    account_type: string
    total_debit: number
    total_credit: number
    balance: number
}

export type IncomeStatementRow = {
    section: string
    account_id: string
    account_code: string
    account_name: string
    amount: number
}

export type BalanceSheetRow = {
    section: string
    account_id: string
    account_code: string
    account_name: string
    balance: number
}

export type FinancialSummary = {
    total_revenue: number
    total_cogs: number
    gross_profit: number
    total_expenses: number
    net_income: number
    total_assets: number
    total_liabilities: number
    total_equity: number
}

/**
 * Get Trial Balance
 */
export async function getTrialBalance(companyId: string, startDate: string, endDate: string) {
    const supabase = createClient(cookies())

    const { data, error } = await supabase.rpc('get_trial_balance', {
        p_company_id: companyId,
        p_start_date: startDate,
        p_end_date: endDate
    })

    if (error) {
        console.error('Error fetching trial balance:', error)
        throw new Error('Failed to fetch trial balance')
    }

    return data as TrialBalanceRow[]
}

/**
 * Get Income Statement
 */
export async function getIncomeStatement(companyId: string, startDate: string, endDate: string) {
    const supabase = createClient(cookies())

    const { data, error } = await supabase.rpc('get_income_statement', {
        p_company_id: companyId,
        p_start_date: startDate,
        p_end_date: endDate
    })

    if (error) {
        console.error('Error fetching income statement:', error)
        throw new Error('Failed to fetch income statement')
    }

    return data as IncomeStatementRow[]
}

/**
 * Get Balance Sheet
 */
export async function getBalanceSheet(companyId: string, asOfDate: string) {
    const supabase = createClient(cookies())

    const { data, error } = await supabase.rpc('get_balance_sheet', {
        p_company_id: companyId,
        p_as_of_date: asOfDate
    })

    if (error) {
        console.error('Error fetching balance sheet:', error)
        throw new Error('Failed to fetch balance sheet')
    }

    return data as BalanceSheetRow[]
}

/**
 * Get Financial Summary (KPIs)
 */
export async function getFinancialSummary(companyId: string, startDate: string, endDate: string) {
    const supabase = createClient(cookies())

    const { data, error } = await supabase.rpc('get_financial_summary', {
        p_company_id: companyId,
        p_start_date: startDate,
        p_end_date: endDate
    })

    if (error) {
        console.error('Error fetching financial summary:', error)
        throw new Error('Failed to fetch financial summary')
    }

    return (data?.[0] || {}) as FinancialSummary
}
