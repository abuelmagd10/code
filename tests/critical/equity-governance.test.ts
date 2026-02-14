/**
 * 🧪 Equity Governance Critical Tests
 * =============================================
 * اختبارات حرجة لقواعد الحوكمة - تعمل بدون قاعدة بيانات
 * 
 * تختبر:
 * 1. قواعد التحقق من صلاحية التوزيع
 * 2. حسابات توزيع الأرباح
 * 3. قواعد الصرف الجزئي
 * 4. منطق الـ Governance
 * =============================================
 */

import { describe, it, expect } from 'vitest'

// =============================================
// Helper Functions for Testing (mimic service logic)
// =============================================

interface GovernanceRule {
  minRetainedEarnings: number
  maxDistributionPercentage: number
  requiresApproval: boolean
}

interface DistributionValidation {
  isValid: boolean
  errors: string[]
  warnings: string[]
}

/**
 * التحقق من صلاحية التوزيع
 */
function validateDistribution(
  totalAmount: number,
  availableRetainedEarnings: number,
  shareholderPercentages: number[],
  rules: GovernanceRule
): DistributionValidation {
  const errors: string[] = []
  const warnings: string[] = []

  // Rule 1: Cannot distribute more than available
  if (totalAmount > availableRetainedEarnings) {
    errors.push('مبلغ التوزيع يتجاوز الأرباح المحتجزة المتاحة')
  }

  // Rule 2: Cannot distribute if below minimum threshold
  if (availableRetainedEarnings < rules.minRetainedEarnings) {
    errors.push('رصيد الأرباح المحتجزة أقل من الحد الأدنى المطلوب')
  }

  // Rule 3: Total percentages must equal 100
  const totalPercentage = shareholderPercentages.reduce((sum, p) => sum + p, 0)
  if (Math.abs(totalPercentage - 100) > 0.01) {
    errors.push('مجموع نسب المساهمين لا يساوي 100%')
  }

  // Rule 4: Max distribution percentage
  const distributionPercentage = (totalAmount / availableRetainedEarnings) * 100
  if (distributionPercentage > rules.maxDistributionPercentage) {
    warnings.push(`نسبة التوزيع (${distributionPercentage.toFixed(1)}%) تتجاوز الحد الموصى به`)
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  }
}

/**
 * حساب توزيع الأرباح لكل مساهم
 */
function calculateShareholderAmounts(
  totalAmount: number,
  shareholders: { id: string; percentage: number }[]
): { id: string; amount: number }[] {
  return shareholders.map(sh => ({
    id: sh.id,
    amount: Number(((totalAmount * sh.percentage) / 100).toFixed(2))
  }))
}

/**
 * التحقق من صلاحية الصرف
 */
function validatePayment(
  paymentAmount: number,
  totalDue: number,
  paidAmount: number
): { isValid: boolean; error?: string } {
  const remaining = totalDue - paidAmount

  if (paymentAmount <= 0) {
    return { isValid: false, error: 'مبلغ الصرف يجب أن يكون أكبر من صفر' }
  }

  if (paymentAmount > remaining) {
    return { isValid: false, error: `مبلغ الصرف (${paymentAmount}) يتجاوز المتبقي (${remaining})` }
  }

  return { isValid: true }
}

/**
 * تحديد حالة سطر التوزيع
 */
function determineLineStatus(
  totalAmount: number,
  paidAmount: number
): 'pending' | 'partially_paid' | 'paid' {
  if (paidAmount === 0) return 'pending'
  if (paidAmount >= totalAmount) return 'paid'
  return 'partially_paid'
}

// =============================================
// Test Suites
// =============================================

describe('🔒 Equity Governance Rules', () => {
  const defaultRules: GovernanceRule = {
    minRetainedEarnings: 1000,
    maxDistributionPercentage: 80,
    requiresApproval: true
  }

  describe('Distribution Validation', () => {
    it('should PASS when amount is within available balance', () => {
      const result = validateDistribution(5000, 10000, [60, 40], defaultRules)
      expect(result.isValid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    it('should FAIL when amount exceeds available balance', () => {
      const result = validateDistribution(15000, 10000, [60, 40], defaultRules)
      expect(result.isValid).toBe(false)
      expect(result.errors).toContain('مبلغ التوزيع يتجاوز الأرباح المحتجزة المتاحة')
    })

    it('should FAIL when balance is below minimum threshold', () => {
      const result = validateDistribution(500, 800, [60, 40], defaultRules)
      expect(result.isValid).toBe(false)
      expect(result.errors).toContain('رصيد الأرباح المحتجزة أقل من الحد الأدنى المطلوب')
    })

    it('should FAIL when shareholder percentages do not total 100%', () => {
      const result = validateDistribution(5000, 10000, [60, 30], defaultRules)
      expect(result.isValid).toBe(false)
      expect(result.errors).toContain('مجموع نسب المساهمين لا يساوي 100%')
    })

    it('should WARN when distribution exceeds recommended percentage', () => {
      const result = validateDistribution(9000, 10000, [60, 40], defaultRules) // 90%
      expect(result.isValid).toBe(true) // Still valid, just warning
      expect(result.warnings.length).toBeGreaterThan(0)
    })

    it('should PASS with exact 100% percentages', () => {
      const result = validateDistribution(5000, 10000, [25, 25, 25, 25], defaultRules)
      expect(result.isValid).toBe(true)
    })

    it('should handle edge case of zero distribution', () => {
      const result = validateDistribution(0, 10000, [60, 40], defaultRules)
      expect(result.isValid).toBe(true) // Zero is valid (no distribution)
    })
  })

  describe('Shareholder Amount Calculation', () => {
    it('should calculate correct amounts for two shareholders', () => {
      const shareholders = [
        { id: 'sh1', percentage: 60 },
        { id: 'sh2', percentage: 40 }
      ]
      const amounts = calculateShareholderAmounts(10000, shareholders)

      expect(amounts).toHaveLength(2)
      expect(amounts[0].amount).toBe(6000)
      expect(amounts[1].amount).toBe(4000)
    })

    it('should handle decimal percentages correctly', () => {
      const shareholders = [
        { id: 'sh1', percentage: 33.33 },
        { id: 'sh2', percentage: 33.33 },
        { id: 'sh3', percentage: 33.34 }
      ]
      const amounts = calculateShareholderAmounts(10000, shareholders)

      expect(amounts[0].amount).toBe(3333)
      expect(amounts[1].amount).toBe(3333)
      expect(amounts[2].amount).toBe(3334)
    })

    it('should round to 2 decimal places', () => {
      const shareholders = [{ id: 'sh1', percentage: 100 }]
      const amounts = calculateShareholderAmounts(1000.555, shareholders)

      // toFixed(2) rounds to nearest, so 1000.555 -> 1000.55 (banker's rounding)
      expect(amounts[0].amount).toBe(1000.55)
    })

    it('should handle single shareholder (100%)', () => {
      const shareholders = [{ id: 'sh1', percentage: 100 }]
      const amounts = calculateShareholderAmounts(50000, shareholders)

      expect(amounts).toHaveLength(1)
      expect(amounts[0].amount).toBe(50000)
    })
  })

  describe('Payment Validation', () => {
    it('should PASS for valid full payment', () => {
      const result = validatePayment(1000, 1000, 0)
      expect(result.isValid).toBe(true)
    })

    it('should PASS for valid partial payment', () => {
      const result = validatePayment(500, 1000, 0)
      expect(result.isValid).toBe(true)
    })

    it('should PASS for remaining balance payment', () => {
      const result = validatePayment(500, 1000, 500) // 500 remaining
      expect(result.isValid).toBe(true)
    })

    it('should FAIL when payment exceeds remaining', () => {
      const result = validatePayment(600, 1000, 500) // Only 500 remaining
      expect(result.isValid).toBe(false)
      expect(result.error).toContain('يتجاوز المتبقي')
    })

    it('should FAIL for zero payment', () => {
      const result = validatePayment(0, 1000, 0)
      expect(result.isValid).toBe(false)
      expect(result.error).toContain('أكبر من صفر')
    })

    it('should FAIL for negative payment', () => {
      const result = validatePayment(-100, 1000, 0)
      expect(result.isValid).toBe(false)
    })

    it('should handle fully paid line', () => {
      const result = validatePayment(100, 1000, 1000) // Already fully paid
      expect(result.isValid).toBe(false)
      expect(result.error).toContain('يتجاوز المتبقي')
    })
  })

  describe('Line Status Determination', () => {
    it('should return "pending" when nothing paid', () => {
      expect(determineLineStatus(1000, 0)).toBe('pending')
    })

    it('should return "partially_paid" for partial payment', () => {
      expect(determineLineStatus(1000, 500)).toBe('partially_paid')
    })

    it('should return "paid" for full payment', () => {
      expect(determineLineStatus(1000, 1000)).toBe('paid')
    })

    it('should return "paid" for overpayment (edge case)', () => {
      // This shouldn't happen but handle gracefully
      expect(determineLineStatus(1000, 1500)).toBe('paid')
    })

    it('should handle very small partial payments', () => {
      expect(determineLineStatus(1000, 0.01)).toBe('partially_paid')
    })
  })

  describe('Journal Entry Balance Validation', () => {
    it('should validate balanced journal entries', () => {
      const lines = [
        { debit: 5000, credit: 0 },
        { debit: 0, credit: 5000 }
      ]
      const totalDebit = lines.reduce((sum, l) => sum + l.debit, 0)
      const totalCredit = lines.reduce((sum, l) => sum + l.credit, 0)

      expect(totalDebit).toBe(totalCredit)
    })

    it('should detect unbalanced journal entries', () => {
      const lines = [
        { debit: 5000, credit: 0 },
        { debit: 0, credit: 4999 }
      ]
      const totalDebit = lines.reduce((sum, l) => sum + l.debit, 0)
      const totalCredit = lines.reduce((sum, l) => sum + l.credit, 0)

      expect(totalDebit).not.toBe(totalCredit)
    })

    it('should handle multiple debit/credit lines', () => {
      // Distribution to 3 shareholders
      const lines = [
        { debit: 10000, credit: 0 }, // From Retained Earnings
        { debit: 0, credit: 5000 },  // To Shareholder 1 Payable
        { debit: 0, credit: 3000 },  // To Shareholder 2 Payable
        { debit: 0, credit: 2000 }   // To Shareholder 3 Payable
      ]
      const totalDebit = lines.reduce((sum, l) => sum + l.debit, 0)
      const totalCredit = lines.reduce((sum, l) => sum + l.credit, 0)

      expect(totalDebit).toBe(totalCredit)
      expect(totalDebit).toBe(10000)
    })
  })

  describe('Edge Cases & Error Handling', () => {
    it('should handle empty shareholder list gracefully', () => {
      const amounts = calculateShareholderAmounts(10000, [])
      expect(amounts).toHaveLength(0)
    })

    it('should handle very large amounts', () => {
      const shareholders = [{ id: 'sh1', percentage: 100 }]
      const amounts = calculateShareholderAmounts(999999999.99, shareholders)
      expect(amounts[0].amount).toBe(999999999.99)
    })

    it('should handle very small amounts', () => {
      const shareholders = [
        { id: 'sh1', percentage: 50 },
        { id: 'sh2', percentage: 50 }
      ]
      const amounts = calculateShareholderAmounts(0.02, shareholders)
      expect(amounts[0].amount).toBe(0.01)
      expect(amounts[1].amount).toBe(0.01)
    })
  })
})

