/**
 * Equity Transaction Service - Professional ERP Capital Governance
 * 
 * خدمة إدارة عمليات حقوق الملكية الذرية
 * Atomic transactions for dividend distribution, payment, and shareholder drawings
 */

import { SupabaseClient } from '@supabase/supabase-js'

// =============================================
// Types & Interfaces
// =============================================

export interface EquityTransactionResult {
  success: boolean
  distributionId?: string
  paymentId?: string
  drawingId?: string
  journalEntryId?: string
  error?: string
  availableRetainedEarnings?: number
}

export interface ShareholderDistributionLine {
  id: string
  percentage: number
  amount: number
}

export interface DividendDistributionParams {
  companyId: string
  totalAmount: number
  distributionDate: string
  shareholders: ShareholderDistributionLine[]
  retainedEarningsAccountId: string
  dividendsPayableAccountId: string
  branchId?: string
  costCenterId?: string
  fiscalYear?: number
  fiscalPeriod?: string
  userId?: string
}

export interface DividendPaymentParams {
  companyId: string
  distributionLineId: string
  amount: number
  paymentDate: string
  paymentAccountId: string
  dividendsPayableAccountId: string
  paymentMethod?: 'cash' | 'bank_transfer' | 'check'
  referenceNumber?: string
  branchId?: string
  costCenterId?: string
  userId?: string
  notes?: string
}

export interface ShareholderDrawingParams {
  companyId: string
  shareholderId: string
  amount: number
  drawingDate: string
  paymentAccountId: string
  drawingsAccountId: string
  description?: string
  branchId?: string
  costCenterId?: string
  userId?: string
}

export interface PendingDividend {
  distribution_id: string
  distribution_date: string
  line_id: string
  shareholder_id: string
  shareholder_name: string
  total_amount: number
  paid_amount: number
  remaining_amount: number
  status: 'pending' | 'partially_paid' | 'paid'
}

export interface GovernanceValidationResult {
  valid: boolean
  errors: string[]
  availableRetainedEarnings?: number
}

// =============================================
// Equity Governance Rules
// =============================================

export interface EquityGovernanceRules {
  preventDistributionWithInsufficientEarnings: boolean
  requireFullOwnershipPercentage: boolean
  minimumDistributionAmount: number
  maxDistributionPercentage: number
  requireApproval: boolean
  requirePeriodClosed: boolean
  allowDrawings: boolean
  maxDrawingsPercentage: number
}

export const DEFAULT_EQUITY_GOVERNANCE_RULES: EquityGovernanceRules = {
  preventDistributionWithInsufficientEarnings: true,
  requireFullOwnershipPercentage: true,
  minimumDistributionAmount: 0,
  maxDistributionPercentage: 100,
  requireApproval: true,
  requirePeriodClosed: false,
  allowDrawings: true,
  maxDrawingsPercentage: 50
}

// =============================================
// Equity Transaction Service Class
// =============================================

export class EquityTransactionService {
  constructor(private supabase: SupabaseClient) { }

  /**
   * Get retained earnings balance from ledger
   */
  async getRetainedEarningsBalance(companyId: string): Promise<number> {
    const { data, error } = await this.supabase.rpc('get_retained_earnings_balance', {
      p_company_id: companyId
    })

    if (error) {
      console.error('Error getting retained earnings:', error)
      return 0
    }

    return Number(data) || 0
  }

  /**
   * Validate dividend distribution against governance rules
   */
  async validateDistribution(
    companyId: string,
    amount: number,
    rules: EquityGovernanceRules = DEFAULT_EQUITY_GOVERNANCE_RULES
  ): Promise<GovernanceValidationResult> {
    const errors: string[] = []
    let availableRetainedEarnings = 0

    // 1. Check retained earnings sufficiency
    if (rules.preventDistributionWithInsufficientEarnings) {
      availableRetainedEarnings = await this.getRetainedEarningsBalance(companyId)

      if (availableRetainedEarnings < amount) {
        errors.push(`الأرباح المحتجزة غير كافية. المتاح: ${availableRetainedEarnings.toFixed(2)}، المطلوب: ${amount.toFixed(2)}`)
      }

      const maxAllowed = availableRetainedEarnings * (rules.maxDistributionPercentage / 100)
      if (amount > maxAllowed) {
        errors.push(`المبلغ يتجاوز الحد الأقصى المسموح (${rules.maxDistributionPercentage}%)`)
      }
    }

    // 2. Check minimum distribution amount
    if (amount < rules.minimumDistributionAmount) {
      errors.push(`المبلغ أقل من الحد الأدنى (${rules.minimumDistributionAmount})`)
    }

    return { valid: errors.length === 0, errors, availableRetainedEarnings }
  }

  /**
   * Distribute dividends atomically with governance validation
   * Creates: Distribution Header + Lines + Journal Entry (Dr. Retained Earnings | Cr. Dividends Payable)
   */
  async distributeDividends(params: DividendDistributionParams): Promise<EquityTransactionResult> {
    try {
      // 1. Validate distribution
      const validation = await this.validateDistribution(params.companyId, params.totalAmount)

      if (!validation.valid) {
        return {
          success: false,
          error: validation.errors.join('; ')
        }
      }

      // 2. Call atomic RPC function
      const { data, error } = await this.supabase.rpc('distribute_dividends_atomic', {
        p_company_id: params.companyId,
        p_total_amount: params.totalAmount,
        p_distribution_date: params.distributionDate,
        p_shareholders: params.shareholders,
        p_retained_earnings_account_id: params.retainedEarningsAccountId,
        p_dividends_payable_account_id: params.dividendsPayableAccountId,
        p_branch_id: params.branchId || null,
        p_cost_center_id: params.costCenterId || null,
        p_fiscal_year: params.fiscalYear || null,
        p_fiscal_period: params.fiscalPeriod || null,
        p_user_id: params.userId || null
      })

      if (error) {
        console.error('Dividend distribution RPC error:', error)
        return { success: false, error: error.message }
      }

      return {
        success: true,
        distributionId: data.distribution_id,
        journalEntryId: data.journal_entry_id,
        availableRetainedEarnings: validation.availableRetainedEarnings
      }

    } catch (err: any) {
      console.error('Dividend distribution error:', err)
      return { success: false, error: err.message }
    }
  }

  /**
   * Pay dividend to shareholder atomically
   * Creates: Payment Record + Journal Entry (Dr. Dividends Payable | Cr. Cash/Bank)
   */
  async payDividend(params: DividendPaymentParams): Promise<EquityTransactionResult> {
    try {
      const { data, error } = await this.supabase.rpc('pay_dividend_atomic', {
        p_company_id: params.companyId,
        p_distribution_line_id: params.distributionLineId,
        p_amount: params.amount,
        p_payment_date: params.paymentDate,
        p_payment_account_id: params.paymentAccountId,
        p_dividends_payable_account_id: params.dividendsPayableAccountId,
        p_payment_method: params.paymentMethod || 'cash',
        p_reference_number: params.referenceNumber || null,
        p_branch_id: params.branchId || null,
        p_cost_center_id: params.costCenterId || null,
        p_user_id: params.userId || null,
        p_notes: params.notes || null
      })

      if (error) {
        console.error('Dividend payment RPC error:', error)
        return { success: false, error: error.message }
      }

      return {
        success: true,
        paymentId: data.payment_id,
        journalEntryId: data.journal_entry_id
      }

    } catch (err: any) {
      console.error('Dividend payment error:', err)
      return { success: false, error: err.message }
    }
  }

  /**
   * Record shareholder drawing atomically
   * Creates: Drawing Record + Journal Entry (Dr. Drawings | Cr. Cash/Bank)
   */
  async recordDrawing(params: ShareholderDrawingParams): Promise<EquityTransactionResult> {
    try {
      const { data, error } = await this.supabase.rpc('record_shareholder_drawing_atomic', {
        p_company_id: params.companyId,
        p_shareholder_id: params.shareholderId,
        p_amount: params.amount,
        p_drawing_date: params.drawingDate,
        p_payment_account_id: params.paymentAccountId,
        p_drawings_account_id: params.drawingsAccountId,
        p_description: params.description || null,
        p_branch_id: params.branchId || null,
        p_cost_center_id: params.costCenterId || null,
        p_user_id: params.userId || null
      })

      if (error) {
        console.error('Shareholder drawing RPC error:', error)
        return { success: false, error: error.message }
      }

      return {
        success: true,
        drawingId: data.drawing_id,
        journalEntryId: data.journal_entry_id
      }

    } catch (err: any) {
      console.error('Shareholder drawing error:', err)
      return { success: false, error: err.message }
    }
  }

  /**
   * Get pending dividends for a company or specific shareholder
   */
  async getPendingDividends(companyId: string, shareholderId?: string): Promise<PendingDividend[]> {
    const { data, error } = await this.supabase.rpc('get_pending_dividends', {
      p_company_id: companyId,
      p_shareholder_id: shareholderId || null
    })

    if (error) {
      console.error('Error fetching pending dividends:', error)
      return []
    }

    return data || []
  }

  /**
   * Get dividend payment history for a shareholder
   */
  async getPaymentHistory(companyId: string, shareholderId?: string): Promise<any[]> {
    let query = this.supabase
      .from('dividend_payments')
      .select(`
        *,
        shareholders (name),
        chart_of_accounts (account_name, account_code),
        profit_distribution_lines (amount, percentage_at_distribution)
      `)
      .eq('company_id', companyId)
      .eq('status', 'posted')
      .order('payment_date', { ascending: false })

    if (shareholderId) {
      query = query.eq('shareholder_id', shareholderId)
    }

    const { data, error } = await query

    if (error) {
      console.error('Error fetching payment history:', error)
      return []
    }

    return data || []
  }

  /**
   * Get shareholder drawings history
   */
  async getDrawingsHistory(companyId: string, shareholderId?: string): Promise<any[]> {
    let query = this.supabase
      .from('shareholder_drawings')
      .select(`
        *,
        shareholders (name),
        chart_of_accounts (account_name, account_code),
        journal_entries (id, entry_number)
      `)
      .eq('company_id', companyId)
      .eq('status', 'posted')
      .order('drawing_date', { ascending: false })

    if (shareholderId) {
      query = query.eq('shareholder_id', shareholderId)
    }

    const { data, error } = await query

    if (error) {
      console.error('Error fetching drawings history:', error)
      return []
    }

    return data || []
  }
}
